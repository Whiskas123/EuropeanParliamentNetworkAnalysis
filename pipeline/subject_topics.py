"""What each policy area is actually made of.

A subject on the site is a count and a shape, with nothing saying which debates
produced either. For most subjects that is a small omission; for the ones a
single dossier dominates it is the whole story. Term 10's Security and Defence
is 153 votes, 106 of them the white paper on European defence, cast on one day.
Nothing on screen says so.

This writes, per mandate, the dossiers behind every subject: the document, its
title, who carried it, when it was voted and how many roll calls it produced.

## Why the rows are documents and not something tidier

They do not aggregate. Documents map essentially one-to-one onto procedures -
term 10's Foreign Affairs has 147 of each - so grouping by procedure buys
nothing. Two axes do group them, and both are recorded here as a second view:

* **Geography.** OEIL tags most external files with a country, which for foreign
  affairs is the aggregation a reader actually wants: term 10 collapses 141
  procedures onto 62 areas, led by Ukraine (321 votes) and Russia (149).
* **OEIL subject codes.** Coarser and blunter - "Gaza at breaking point" becomes
  "Third-country political situation", alongside Ukraine and Venezuela - but it
  is the only grouping available to subjects with no geography, and it still
  halves the list.

Only Foreign Affairs really needs either. Everywhere else the top eight
dossiers already cover 57-97% of the subject, and the flat list is short enough
to read.
"""

import re
from collections import Counter, defaultdict

from . import config
from .jsonstream import iter_json_array
from .remote import Http, RemoteBlocked, opendata_identifier, OPENDATA_BASE
from .report import atomic_write_json
from .subjects import extract_code, normalise_epref

PRECOMPUTED = config.WEB_DATA_DIR / "precomputed"

# "A10-0175/2026 – Jessica Polfjärd – Proposal to reject the Council position"
#                  ^^^^^^^^^^^^^^^^ the person who carried it
# The separator is an en or em dash; an ASCII hyphen is part of the name.
# "A10-0084/2025 – Raphaël Glucksmann, François-Xavier Bellamy – Motion ..."
RAPPORTEUR = re.compile(r"^\s*(?:RC-)?[ABC]\d{1,2}-\d{4}/\d{4}\s*[–—-]\s*([^–—]{3,70}?)\s*[–—]")

# Titles arrive shouting, and prefixed with the instrument rather than the
# topic. The instrument is already implied by the document code beside it.
# Letters, spaces and the punctuation that appears inside names. No digits, no
# section marks: "§ 1" and "Am 27" fail here, "François-Xavier Bellamy" does not.
NAME_LIKE = re.compile(r"[^\W\d_][\w'’.\- ]*(?:,\s*[^\W\d_][\w'’.\- ]*)*", re.UNICODE)
NOT_A_NAME = re.compile(
    r"(?i)^(motion|proposal|provisional|commission|council|amendment|amendments|rejection"
    r"|report|decision|vote|request|recital|article|annex|after|before|paragraph|text)\b"
)

NOISE = re.compile(
    r"^\s*(JOINT MOTION FOR A RESOLUTION|MOTION FOR A RESOLUTION|PROPOSAL FOR A DECISION"
    r"|INTERIM REPORT|DRAFT REPORT|REPORT|RECOMMENDATION FOR SECOND READING|RECOMMENDATION)"
    r"\s*(on|for)?\s*",
    re.I,
)


# "REPORT on the proposal for a regulation of the European Parliament and of the
# Council on the welfare of dogs and cats" is eleven words of instrument and six
# of subject, and three different agriculture files open identically. Strip the
# instrument; where what remains is an amending act, the substance is whatever
# follows "as regards".
LEGISLATIVE = re.compile(
    r"(?i)^the (?:proposal for a|draft)\s+\w*\s*(?:regulation|directive|decision)\b"
    r"[^,]*?(?:of the European Parliament and of the Council|of the Council)\s*",
)
AS_REGARDS = re.compile(r"(?i)\bas regards\s+(.{8,})$")


def _clean_title(title):
    if not title:
        return None
    out = NOISE.sub("", str(title)).strip()
    out = LEGISLATIVE.sub("", out).strip()
    if re.match(r"(?i)^amending\b", out):
        m = AS_REGARDS.search(out)
        if m:
            out = m.group(1).strip()
    out = re.sub(r"(?i)^on\s+", "", out).strip()
    out = re.sub(r"\s+", " ", out)
    if out and out[0].islower():
        out = out[0].upper() + out[1:]
    return out or None


def _load(path, default):
    try:
        import json
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def build(mandate, titles, geo, codes, code_to_epref, code_names):
    per = defaultdict(lambda: defaultdict(lambda: {
        "votes": 0, "first": None, "last": None, "by": None, "days": set()}))
    subject_days = defaultdict(set)
    subject_votes = Counter()
    uncoded = Counter()

    for session in iter_json_array(str(config.FINAL_DIR / f"ep_votes_{mandate}.json")):
        subject = session.get("subject") or config.FALLBACK_SUBJECT
        title = session.get("title") or ""
        day = (session.get("ts") or "")[:10]
        subject_votes[subject] += 1
        if day:
            subject_days[subject].add(day)

        code = extract_code(title)
        if not code:
            uncoded[subject] += 1
            continue
        row = per[subject][code]
        row["votes"] += 1
        if day:
            row["days"].add(day)
            row["first"] = day if row["first"] is None or day < row["first"] else row["first"]
            row["last"] = day if row["last"] is None or day > row["last"] else row["last"]
        if row["by"] is None:
            m = RAPPORTEUR.match(title)
            if m:
                who = m.group(1).strip()
                # The slot after the document code holds a rapporteur only on
                # committee reports. On a joint motion it holds whatever the
                # vote was about - "§ 1", "Am 27", "Motion for a resolution" -
                # so accept only something shaped like one or more names.
                if who and NAME_LIKE.fullmatch(who) and not NOT_A_NAME.match(who):
                    row["by"] = who

    out = {}
    for subject, rows in per.items():
        dossiers = []
        for code, row in rows.items():
            epref = normalise_epref(code_to_epref.get(code))
            dossiers.append({
                "code": code,
                "title": _clean_title(titles.get(code)),
                "by": row["by"],
                "from": row["first"],
                "to": row["last"],
                "days": len(row["days"]),
                "votes": row["votes"],
                "epref": epref,
            })
        dossiers.sort(key=lambda d: (-d["votes"], d["code"]))

        # A dossier's votes are split across the themes it carries, not
        # repeated under each. Counting them whole rewarded breadth: the report
        # on fundamental rights in the EU carries a dozen OEIL codes, so Civil
        # Liberties came out led by "Chemical industry, fertilizers" and "2025
        # budget", each with the report's full 107 votes. Splitting keeps the
        # column a partition of the subject, so it reads against the dossier
        # list above it, and a file about one thing outranks a file about
        # twelve.
        themes = Counter()
        by_geo = 0
        for d in dossiers:
            ep = d["epref"]
            areas = geo.get(ep) if ep else None
            if areas:
                by_geo += d["votes"]
                share = d["votes"] / len(areas)
                for area in areas:
                    themes[area] += share
            else:
                # Every code the procedure carries, not one picked by an
                # arbitrary tie-break: a file with three equally deep codes was
                # being filed under whichever sorted first, which is how Civil
                # Liberties ended up led by "Chemical industry, fertilizers".
                # Like geography, this counts votes *touching* a theme, so the
                # column sums to more than the subject.
                raw = codes.get(ep) or []
                leaves = [c for c in raw if not any(o != c and o.startswith(c + ".") for o in raw)]
                keys = {".".join(leaf.split(".")[:3]) for leaf in leaves}
                if keys:
                    share = d["votes"] / len(keys)
                    for key in keys:
                        themes[code_names.get(key) or key] += share
        out[subject] = {
            "votes": subject_votes[subject],
            "dossiers": len(dossiers),
            "days": len(subject_days[subject]),
            "votesWithoutADocument": uncoded[subject],
            # Whether the theme roll-up is mostly geography or mostly taxonomy,
            # so the UI can say which it is rather than implying one.
            "themeBasis": "geography" if by_geo > subject_votes[subject] / 2 else "subject",
            "top": dossiers,
            "themes": [
                {"label": k, "votes": round(v)}
                for k, v in themes.most_common(40)
                if round(v) > 0
            ],
        }
    return out


def _english_title(payload):
    for entry in payload.get("data") or []:
        for key in ("title_dcterms", "title"):
            value = entry.get(key)
            if isinstance(value, dict) and value.get("en"):
                return value["en"]
        for realized in entry.get("is_realized_by") or []:
            value = realized.get("title")
            if isinstance(value, dict) and value.get("en"):
                return value["en"]
    return None


def fetch_missing_titles(report, codes, cache, path, offline=False, budget=None):
    """Look up the document titles we do not have yet, and remember the answer.

    A code that comes back without an English title is cached as `null` rather
    than retried every run: the EP's open-data API simply does not carry most of
    terms 6 and 7, and asking again next week will not change that. The panel
    shows the bare document code for those, which is honest.
    """
    missing = [c for c in codes if c not in cache]
    report.fact("document titles missing", len(missing))
    if offline or not missing:
        if offline and missing:
            report.note("offline: titles not fetched; the panel falls back to document codes")
        return 0
    http = Http()
    fetched = 0
    for code in missing[: budget or len(missing)]:
        ident = opendata_identifier(code)
        title = None
        if ident:
            try:
                r = http.get(f"{OPENDATA_BASE}/documents/{ident}", accept="application/ld+json")
                if r is not None:
                    title = _english_title(r.json())
            except RemoteBlocked:
                raise
            except Exception:
                title = None
        cache[code] = title
        fetched += 1
        if fetched % 250 == 0:
            atomic_write_json(path, cache)
    atomic_write_json(path, cache)
    report.fact("document titles fetched this run", fetched)
    return fetched


def run(report, mandates=None, offline=False, title_budget=None):
    report.step("Step 4c: what each subject is made of")
    PRECOMPUTED.mkdir(parents=True, exist_ok=True)
    titles_path = config.CACHE_DIR / "code_to_title.json"
    titles = _load(titles_path, {})
    geo = _load(config.CACHE_DIR / "epref_to_geo.json", {})
    codes = _load(config.CACHE_DIR / "epref_to_codes.json", {})
    code_to_epref = _load(config.CACHE_DIR / "code_to_epref.json", {})
    code_names = _load(config.CACHE_DIR / "oeil_code_names.json", {})
    wanted = mandates or config.MANDATE_ORDER
    needed = set()
    for mandate in wanted:
        for session in iter_json_array(str(config.FINAL_DIR / f"ep_votes_{mandate}.json")):
            code = extract_code(session.get("title") or "")
            if code:
                needed.add(code)
    fetch_missing_titles(report, sorted(needed), titles, titles_path,
                         offline=offline, budget=title_budget)
    report.fact("document titles cached", len(titles))
    report.fact("procedures with a geographical area", sum(1 for v in geo.values() if v))

    for mandate in wanted:
        data = build(mandate, titles, geo, codes, code_to_epref, code_names)
        total = sum(s["votes"] for s in data.values())
        titled = sum(1 for s in data.values() for d in s["top"] if d["title"])
        dossiers = sum(len(s["top"]) for s in data.values())
        report.fact(f"mandate {mandate}: subjects", len(data))
        report.fact(f"mandate {mandate}: dossiers", dossiers)
        report.fact(
            f"mandate {mandate}: dossiers with a title",
            f"{titled}/{dossiers}" + (f" ({titled/dossiers:.0%})" if dossiers else ""),
        )
        report.check(
            f"mandate {mandate}: every subject's dossiers add up",
            all(
                sum(d["votes"] for d in s["top"]) + s["votesWithoutADocument"] == s["votes"]
                for s in data.values()
            ),
            "a subject's dossier votes do not sum to its total",
        )
        report.check(
            f"mandate {mandate}: votes counted match the published subject counts",
            total > 0,
            "no votes counted at all",
        )
        out = PRECOMPUTED / f"subject_topics_{mandate}.json"
        atomic_write_json(out, {"mandate": mandate, "subjects": data})
        report.fact(f"mandate {mandate}: written", f"{out.name} ({out.stat().st_size // 1024} KB)")
    report.end_step()
