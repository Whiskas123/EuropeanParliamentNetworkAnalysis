"""How many votes each MEP actually cast, per term and per policy area.

The site could say how many voting sessions a view rests on but not how many of
them the MEP on screen turned up for: `network.py` computes it as `raw_counts`,
uses it to weigh every position in the graph, and throws it away.

This step recomputes it from the same source the networks are built from
(`data/final/ep_votes_<mandate>.json`) and publishes it as a small side file per
term, so the sidebar can say "3,912 votes in 4,588 voting sessions" without
fetching a 270 MB network.

Two things about the count, both inherited from the network and neither
optional if the number is to mean the same thing as the one the filter uses:

* **Abstentions do not count** in `meps`. They are excluded from the similarity
  measure entirely (see `network.py`), so an MEP who abstained on a vote
  contributed nothing to their position and is not credited with it here.
  This is *not* the number that decides network membership: since abstentions
  became attendance, that test uses `turnout` below, and the two disagree for
  exactly the MEPs sitting near the threshold. Print the wrong one and the site
  shows an MEP at 49% of votes sitting inside a network with a 50% floor.
* **A duplicate (MEP, vote) entry counts once.** The dumps contain a few; the
  matrix keeps the first, so this counts distinct votes, not dump rows.

Output shape - subject names are held once, in `subjects`, and each MEP's row is
`[total, ...counts in that order]`, which is a fifth of the size of repeating
twenty subject names per MEP:

    {"mandate": "10",
     "abstentionsCounted": false,
     "sessions": {"total": 4588, "bySubject": {...}},
     "subjects": ["Agriculture and Rural Development", ...],
     "meps": {"M124858": [3912, 88, 12, ...]},
     "turnout": {"M124858": 4102}}
"""

import json
from collections import Counter, defaultdict
from datetime import datetime, timezone

from . import config
from .jsonstream import iter_json_array
from .report import atomic_write_json

PRECOMPUTED = config.WEB_DATA_DIR / "precomputed"


def count_mandate(mandate):
    """Distinct votes cast, per MEP, overall and per subject.

    Counted twice on purpose: `totals`/`by_subject` exclude abstentions and are
    what an MEP's position rests on, while `turnout` includes them and is what
    the participation filter admits on. Returns
    (sessions_total, sessions_by_subject, per_mep, stats).
    """
    path = config.FINAL_DIR / f"ep_votes_{mandate}.json"
    sessions_by_subject = Counter()
    totals = Counter()
    turnout = Counter()
    by_subject = defaultdict(Counter)
    sessions_total = 0
    stats = Counter()

    for session in iter_json_array(str(path)):
        subject = session.get("subject", config.FALLBACK_SUBJECT)
        sessions_total += 1
        sessions_by_subject[subject] += 1
        voters = set()
        attendees = set()
        for vote_type, block in (session.get("votes") or {}).items():
            # KeyError on an unknown vote type, exactly as the network build
            # does: a type nobody has weighted must not be silently ignored.
            abstention = config.VOTE_WEIGHTS[vote_type] == 0
            if abstention:
                stats["sessions with abstentions"] += 1
            for entries in ((block or {}).get("groups") or {}).values():
                for entry in entries or []:
                    if not isinstance(entry, dict) or "mepid" not in entry:
                        stats["entries without mepid"] += 1
                        continue
                    mep = f"M{entry['mepid']}"
                    attendees.add(mep)
                    if abstention:
                        continue
                    if mep in voters:
                        stats["duplicate (MEP, vote) entries"] += 1
                        continue
                    voters.add(mep)
        for mep in voters:
            totals[mep] += 1
            by_subject[mep][subject] += 1
        for mep in attendees:
            turnout[mep] += 1

    return (sessions_total, dict(sessions_by_subject),
            (totals, by_subject, turnout), stats)


def build_payload(mandate, sessions_total, sessions_by_subject, totals, by_subject,
                  turnout):
    subjects = sorted(sessions_by_subject)
    index = {s: i for i, s in enumerate(subjects)}
    meps = {}
    for mep in sorted(totals):
        row = [0] * (len(subjects) + 1)
        row[0] = totals[mep]
        for subject, count in by_subject[mep].items():
            row[index[subject] + 1] = count
        meps[mep] = row
    return {
        "mandate": mandate,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        # Named in the file because the site prints these as "votes cast", and
        # the reader has no other way to know abstentions are not in them.
        "abstentionsCounted": False,
        "sessions": {"total": sessions_total, "bySubject": sessions_by_subject},
        "subjects": subjects,
        "meps": meps,
        # Abstentions included. This is the count the participation filter
        # admits on, so it is the one to print beside a claim about who is in
        # the network - `meps` is the one to print beside an agreement score.
        "turnout": {mep: turnout[mep] for mep in sorted(totals)},
    }


def _published_session_counts():
    """The counts the published networks were built from, if there are any."""
    path = config.WEB_DATA_DIR / "voting_sessions.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


def run(report, mandates=None):
    report.step("Step 4b: per-MEP vote counts")
    mandates = mandates or config.MANDATE_ORDER
    published = _published_session_counts()
    PRECOMPUTED.mkdir(parents=True, exist_ok=True)

    for mandate in mandates:
        (sessions_total, sessions_by_subject,
         (totals, by_subject, turnout), stats) = count_mandate(mandate)
        report.fact(f"mandate {mandate}: voting sessions", sessions_total)
        report.fact(f"mandate {mandate}: MEPs casting any vote", len(totals))
        for key, value in sorted(stats.items()):
            report.note(f"mandate {mandate}: {value} {key}")

        report.check(
            f"mandate {mandate}: votes were counted",
            sessions_total > 0 and len(totals) > 0,
            f"{sessions_total} sessions, {len(totals)} MEPs",
        )
        # A count above the number of sessions would mean a vote was counted
        # twice, which is the failure this file could hide most easily.
        over = [m for m, n in totals.items() if n > sessions_total]
        report.check(
            f"mandate {mandate}: nobody voted more often than there were votes",
            not over,
            f"{len(over)} MEP(s), e.g. {over[:3]}",
        )
        # Every vote carries a subject, so the parts must equal the whole.
        mismatched = [m for m, n in totals.items() if sum(by_subject[m].values()) != n]
        report.check(
            f"mandate {mandate}: per-subject counts sum to the total",
            not mismatched,
            f"{len(mismatched)} MEP(s), e.g. {mismatched[:3]}",
        )
        if published and str(mandate) in published:
            expected = published[str(mandate)]
            report.check(
                f"mandate {mandate}: counted over the same votes as the published network",
                expected.get("total") == sessions_total
                and expected.get("bySubject") == sessions_by_subject,
                "data/final has moved since the last publish - re-run "
                "`networks` and `publish` before this step, or these counts "
                "will describe votes the site does not draw",
            )

        payload = build_payload(
            mandate, sessions_total, sessions_by_subject, totals, by_subject,
            turnout
        )
        out = PRECOMPUTED / f"mep_votes_{mandate}.json"
        atomic_write_json(out, payload)
        report.fact(
            f"mandate {mandate}: written", f"{out.name} ({out.stat().st_size / 1024:.0f} KB)"
        )

    report.end_step()
