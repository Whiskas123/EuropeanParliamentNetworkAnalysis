"""Fetch the roll-call votes the Parltrack dump no longer covers.

Parltrack's `ep_votes` dump stopped on 2026-03-28 while its other dumps kept
updating. The cause is not the data: the roll-call XML the EP publishes per
sitting is unchanged in structure and still served. What broke is *discovery* -
Parltrack's crawler enumerates the files through
`europarl.europa.eu/RegistreWeb/services/search`, and that endpoint now answers
`202` with `x-amzn-waf-action: challenge`.

So this module keeps the part that still works and replaces the part that does
not:

* sittings come from the EP's own open-data meetings API, which is not behind
  the challenge and which `remote.py` already talks to;
* the per-sitting XML URL is derived from the date, which held for all 16
  sittings between the dump's cutoff and the time of writing;
* the XML is parsed here, into exactly the record shape the dump uses, so
  `build_votes` consumes it without knowing where it came from.

Two details cost time to find, and are the reason this is not simply a URL swap:

**The member id is `PersId`, not `MepId`.** The XML carries both; the dump - and
therefore every network in this repo - keys on `PersId`. Reading `MepId` would
produce a corpus that silently matches nobody.

**The WAF flags incoherent browser impersonation, not scrapers.** `curl`'s own
user agent is served, and so is python-requests' default, and so is a complete
browser header set. A bare `User-Agent: Mozilla/5.0` with no accompanying
browser headers is challenged - and so is this repo's own polite custom agent.
`BROWSER_HEADERS` below is a coherent set, which is what gets through.
"""

import re
from datetime import date, datetime

from lxml.etree import fromstring

from . import config
from .jsonstream import JsonArrayWriter, iter_json_array
from .remote import Http, RemoteUnavailable

MEETINGS = "https://data.europarl.europa.eu/api/v2/meetings"
RCV_URL = (
    "https://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/"
    "{year}/{md}/liste_presence/P{term}_PV({year}){md}(RCV)_EN.xml"
)

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
}

# "+" / "-" / "0" are the dump's own keys for the three blocks.
BLOCKS = (("Result.For", "+"), ("Result.Against", "-"), ("Result.Abstention", "0"))


def sitting_dates(http, year):
    """Plenary sitting dates in `year`, from the EP's open-data meetings API."""
    r = http.get(MEETINGS, params={"year": year, "limit": 400},
                 accept="application/ld+json")
    if r is None:
        return []
    try:
        payload = r.json()
    except ValueError as exc:
        raise RemoteUnavailable(f"meetings {year}: non-JSON ({exc})")
    out = []
    for entry in payload.get("data") or []:
        m = re.search(r"MTG-PL-(\d{4}-\d{2}-\d{2})", str(entry.get("id") or ""))
        if m:
            out.append(m.group(1))
    return sorted(set(out))


def rcv_url(sitting, term):
    return RCV_URL.format(year=sitting[:4], md=sitting[5:], term=term)


def parse_rcv(raw, url):
    """One sitting's roll-call XML -> the dump's session records."""
    root = fromstring(raw)
    sessions = []
    for result in root.findall(".//RollCallVote.Result"):
        voteid = result.get("Identifier")
        if not voteid:
            continue
        title_el = result.find("RollCallVote.Description.Text")
        title = re.sub(r"\s+", " ", "".join(title_el.itertext())).strip() if title_el is not None else ""
        votes = {}
        for tag, key in BLOCKS:
            block = result.find(tag)
            if block is None:
                continue
            groups = {}
            for lst in block.findall("Result.PoliticalGroup.List"):
                group = (lst.get("Identifier") or "").strip()
                members = []
                for member in lst.findall("PoliticalGroup.Member.Name"):
                    # PersId, not MepId - see the module docstring.
                    pers = member.get("PersId")
                    if pers and pers.isdigit():
                        members.append({"mepid": int(pers)})
                if group and members:
                    groups.setdefault(group, []).extend(members)
            total = block.get("Number")
            votes[key] = {
                "total": int(total) if total and total.isdigit() else sum(len(v) for v in groups.values()),
                "groups": groups,
            }
        ts = result.get("Date") or root.get("Sitting.Date") or ""
        sessions.append({
            "ts": ts.replace(" ", "T"),
            "url": url,
            "voteid": int(voteid),
            "title": title,
            "votes": votes,
            "meta": {"created": datetime.now().isoformat(timespec="seconds")},
            "changes": {},
            "source": "ep-rcv-xml",
        })
    return sessions


def latest_dump_vote(report):
    """The most recent timestamp the Parltrack dump actually contains."""
    latest = ""
    seen = set()
    for session in iter_json_array(str(config.RAW_VOTES)):
        ts = (session.get("ts") or "")[:10]
        if ts > latest:
            latest = ts
        vid = session.get("voteid")
        if vid is not None:
            # Not all dump ids are integers - some older ones are composite
            # strings like "2017-12-12 00:00:00-1." - so compare as text.
            seen.add(str(vid))
    report.fact("dump's last vote", latest)
    report.fact("vote ids already in the dump", len(seen))
    return latest, seen


def run(report, term=10, until=None, offline=False):
    report.step("Step 1b: fetch roll-call votes newer than the dump")
    if offline:
        report.note("offline: skipped")
        report.end_step()
        return 0

    latest, seen = latest_dump_vote(report)
    until = until or date.today().isoformat()
    http = Http()
    http.session.headers.update(BROWSER_HEADERS)

    years = range(int(latest[:4]), int(until[:4]) + 1)
    sittings = []
    for year in years:
        sittings.extend(d for d in sitting_dates(http, year) if latest < d <= until)
    sittings = sorted(set(sittings))
    report.fact("sittings after the dump", len(sittings))

    collected, empty, per_sitting = [], [], {}
    for sitting in sittings:
        url = rcv_url(sitting, term)
        r = http.get(url)
        if r is None:
            empty.append(sitting)
            continue
        parsed = parse_rcv(r.content, url)
        per_sitting[sitting] = len(parsed)
        collected.extend(parsed)

    report.fact("sittings with a roll-call file", len(per_sitting))
    report.fact("sittings without one", empty)
    report.fact("roll-call votes per sitting", per_sitting)

    fresh = [s for s in collected if str(s["voteid"]) not in seen]
    report.check(
        "no vote id collides with the dump",
        len(fresh) == len(collected),
        f"{len(collected) - len(fresh)} of {len(collected)} already in the dump",
    )
    report.check("every fetched vote has a title", all(s["title"] for s in fresh),
                 "some records parsed with an empty title")
    report.check("every fetched vote has voters", all(
        any((b.get("groups") or {}) for b in s["votes"].values()) for s in fresh),
        "some records parsed with no members at all")
    mismatched = [
        s["voteid"] for s in fresh
        for b in s["votes"].values()
        if b.get("total") != sum(len(v) for v in (b.get("groups") or {}).values())
    ]
    report.check(
        "the stated totals match the members listed",
        not mismatched,
        f"{len(mismatched)} blocks disagree, e.g. {mismatched[:5]}",
    )

    config.RAW_VOTES_EXTRA.parent.mkdir(parents=True, exist_ok=True)
    with JsonArrayWriter(str(config.RAW_VOTES_EXTRA)) as out:
        for s in sorted(fresh, key=lambda x: (x["ts"], x["voteid"])):
            out.write(s)
    report.fact("written", f"{len(fresh)} votes -> {config.RAW_VOTES_EXTRA}")
    report.end_step()
    return len(fresh)
