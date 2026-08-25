"""Step 1: split the raw vote dump by mandate and attach a subject to each vote.

Runs in two phases on purpose. Phase one only *reads*, works out every lookup
the run will need and performs them, so that any problem with the outside world
surfaces before a single output file is touched. Phase two writes.
"""

from collections import Counter, defaultdict
from datetime import datetime

from . import config
from .jsonstream import JsonArrayWriter, iter_json_array
from .remote import RemoteBlocked
from .report import PipelineError
from .subjects import SubjectResolver, session_reference


def _mandate_ranges():
    return {
        key: (datetime.strptime(a, "%Y-%m-%d"), datetime.strptime(b, "%Y-%m-%d"))
        for key, (a, b) in config.MANDATES.items()
    }


def assign_mandate(ts, ranges):
    if not ts:
        return None
    try:
        when = datetime.fromisoformat(ts)
    except ValueError:
        return None
    for key, (start, end) in ranges.items():
        if start <= when <= end:
            return key
    return None


def _has_votes(session):
    votes = session.get("votes")
    return bool(votes) and isinstance(votes, dict)


def scan_raw_votes(report):
    """Phase one: read the raw dump and describe what is in it."""
    ranges = _mandate_ranges()
    per_mandate = Counter()
    skipped = Counter()
    vote_types = Counter()
    seen_voteids = set()
    duplicates = 0
    needing = []  # sessions whose subject is not yet known

    resolver = SubjectResolver(report)
    seeded = resolver.seed_from_baseline()
    if seeded:
        report.fact("subjects seeded from 2025 results", seeded)
    else:
        report.fact("subjects already in cache", len(resolver.by_voteid.data))

    total = 0
    for session in iter_json_array(str(config.RAW_VOTES)):
        total += 1
        vid = session.get("voteid")
        if vid in seen_voteids:
            duplicates += 1
        seen_voteids.add(vid)

        if not _has_votes(session):
            skipped["no votes recorded"] += 1
            continue
        mandate = assign_mandate(session.get("ts") or session.get("TS"), ranges)
        if mandate is None:
            skipped["outside any mandate"] += 1
            continue

        for vote_type in session["votes"]:
            vote_types[vote_type] += 1

        per_mandate[mandate] += 1
        if vid not in resolver.by_voteid:
            kind, value = session_reference(session)
            needing.append(
                {
                    "voteid": vid,
                    "kind": kind,
                    "value": value,
                    "title": session.get("title") or "",
                    "ts": session.get("ts") or session.get("TS") or "",
                }
            )

    report.fact("sessions in raw dump", total)
    report.fact("sessions kept", sum(per_mandate.values()))
    report.fact("sessions per mandate", dict(sorted(per_mandate.items(), key=lambda kv: int(kv[0]))))
    report.fact("sessions skipped", dict(skipped))
    report.fact("distinct vote-type keys", sorted(vote_types))
    report.fact("sessions needing subject resolution", len(needing))

    report.check(
        "vote-type vocabulary is the expected {+,-,0}",
        set(vote_types) <= set(config.VOTE_WEIGHTS),
        f"unexpected vote types: {sorted(set(vote_types) - set(config.VOTE_WEIGHTS))}",
    )
    report.check("vote ids are unique", duplicates == 0, f"{duplicates} duplicate vote ids")
    report.check(
        "every mandate has votes",
        set(per_mandate) == set(config.MANDATE_ORDER),
        f"missing: {sorted(set(config.MANDATE_ORDER) - set(per_mandate))}",
    )
    return resolver, needing, per_mandate


def resolve_pending(report, resolver, needing, max_failures=0):
    """Perform every outstanding lookup, before anything is written."""
    if not needing:
        report.note("nothing to resolve - every vote already has a subject")
        return

    codes = {n["value"] for n in needing if n["kind"] == "code"}
    eprefs = {n["value"] for n in needing if n["kind"] == "epref"}
    report.fact("distinct document codes to resolve", len(codes))
    report.fact("distinct procedure references to resolve", len(eprefs))

    resolved = Counter()
    done = 0
    for item in needing:
        session = {
            "voteid": item["voteid"],
            "ts": item["ts"],
            "epref": item["value"] if item["kind"] == "epref" else None,
            # session_reference() reads a code back out of the title.
            "title": item["title"] or (item["value"] if item["kind"] == "code" else ""),
        }
        try:
            subject, via = resolver.resolve(session)
        except RemoteBlocked as exc:
            resolver.save()
            raise PipelineError(
                f"A source is refusing automated access: {exc}. "
                "Stopping rather than labelling votes 'Others' by accident."
            ) from exc
        resolved[subject] += 1
        done += 1
        if done % 200 == 0 or done == len(needing):
            print(f"    resolved {done}/{len(needing)}", flush=True)

    sizes = resolver.save()
    report.fact("lookup stats", dict(resolver.stats))
    report.fact("cache sizes", sizes)
    report.fact("http stats", resolver.http.stats if resolver.http else "offline")
    report.fact("newly resolved subjects", dict(resolved.most_common()))

    failures = resolver.stats["lookup_failures"]
    report.check(
        "every lookup completed",
        failures <= max_failures,
        f"{failures} lookups failed; first few: {resolver.failures[:5]}",
    )

    unresolved = resolved.get(config.FALLBACK_SUBJECT, 0)
    share = unresolved / max(len(needing), 1)
    report.check(
        "new votes are not overwhelmingly unlabelled",
        share < 0.25,
        f"{unresolved}/{len(needing)} ({share:.1%}) of newly resolved votes fell back to "
        f"'{config.FALLBACK_SUBJECT}'",
        fatal=False,
    )


def write_mandate_files(report, resolver, expected_counts):
    """Phase two: write one file per mandate, each vote carrying its subject."""
    ranges = _mandate_ranges()
    config.FINAL_DIR.mkdir(parents=True, exist_ok=True)

    writers = {}
    subjects = defaultdict(Counter)
    missing_subject = 0
    try:
        for mandate in config.MANDATE_ORDER:
            path = config.FINAL_DIR / f"ep_votes_{mandate}.json"
            writers[mandate] = JsonArrayWriter(str(path)).__enter__()

        for session in iter_json_array(str(config.RAW_VOTES)):
            if not _has_votes(session):
                continue
            mandate = assign_mandate(session.get("ts") or session.get("TS"), ranges)
            if mandate is None:
                continue
            cached = resolver.by_voteid.get(session.get("voteid"))
            if cached is KeyError or not cached:
                missing_subject += 1
                subject = config.FALLBACK_SUBJECT
            else:
                subject = cached["subject"]
            # A subject that did not exist in this term is recorded as the
            # committee that actually handled it - see config.SUBJECT_MERGES.
            subject = config.subject_for_mandate(subject, mandate)
            session["subject"] = subject
            subjects[mandate][subject] += 1
            writers[mandate].write(session)
    finally:
        for writer in writers.values():
            writer.__exit__(None, None, None)

    for mandate in config.MANDATE_ORDER:
        report.check_equal(
            f"mandate {mandate}: sessions written matches scan",
            writers[mandate].count,
            expected_counts[mandate],
        )
    report.check("every written vote has a subject", missing_subject == 0,
                 f"{missing_subject} votes had no cached subject")

    for mandate in config.MANDATE_ORDER:
        counts = subjects[mandate]
        unknown = set(counts) - set(config.CANONICAL_SUBJECTS)
        report.check(
            f"mandate {mandate}: subjects are all canonical",
            not unknown,
            f"non-canonical subjects: {sorted(unknown)[:5]}",
        )
        other = counts.get(config.FALLBACK_SUBJECT, 0)
        total = sum(counts.values())
        report.check(
            f"mandate {mandate}: '{config.FALLBACK_SUBJECT}' share is sane",
            total and other / total < 0.15,
            f"{other}/{total} ({other / max(total,1):.1%}) unlabelled",
            fatal=False,
        )
    report.fact(
        "subject counts per mandate",
        {m: dict(subjects[m].most_common()) for m in config.MANDATE_ORDER},
    )
    return subjects


def run(report, offline=False):
    report.step("Step 1: split raw votes by mandate and assign subjects")
    resolver, needing, per_mandate = scan_raw_votes(report)
    resolver.offline = offline
    resolve_pending(report, resolver, needing)
    subjects = write_mandate_files(report, resolver, per_mandate)
    report.end_step()
    return subjects
