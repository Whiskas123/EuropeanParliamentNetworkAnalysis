"""Which groups win votes together, measured one roll-call at a time.

The site's other agreement figures are *pairwise similarity*: over a term, how
often do these two MEPs cast the same ballot. That measure answers "who votes
like whom" and it cannot answer "who governs with whom", because it is
dominated by the roll-calls nobody contests. Term 10 decides 4,244 votes and a
group can look like everyone's friend while consistently losing to a coalition
it is not in.

This step classifies each roll-call directly. Every group's *direction* on a
vote is the majority of its own members present, and the chamber's is the
outcome. From those two facts, three things get counted, none of which needs an
opinion about who is left and who is right:

* **Which whole coalitions win.** The set of families on the winning side,
  tallied. Term 10's most common is Left+Greens+S&D+Liberals+EPP at 35.8% of
  decided votes; sixth, at 5.8%, is EPP+Conservatives+FarRight, a right-only
  majority with no equivalent in term 9.

* **Who each family wins with.** For every family, on the votes it won, how
  often each other family was on the winning side too. This is the measure that
  shows the far right has no majority of its own: of its wins, 94% are votes the
  EPP also won, and 90% the Conservatives.

* **Who each family votes with**, over all decided votes rather than only its
  wins. The plain co-voting rate, which separates a family that is often on the
  same side from one that merely wins alongside.

An earlier version reported instead which *flank* — left or right — a family
carried the day with. That required this file to declare that the EPP is the
right, Renew the centre-left, the Greens the left, and so on, and those
assignments were doing invisible load-bearing work in a published chart. There
is no agreed answer, so the question has been replaced with ones the roll-calls
can settle on their own.

Four decisions worth stating:

* **Groups are merged into families across renames.** PSE and S&D are one line,
  as are ALDE/Renew, PPE-DE/PPE, UEN/ECR, and the far-right lineage
  IND/DEM -> EFD -> EFDD+ENF -> ID -> PfE+ESN. Without this every chart over
  five terms is seven stubs. The lineage is an editorial claim, not a fact in
  the data, so it is published in the output for the site to show. It is also
  the *only* such claim left in this file.

* **A vote counts only if every family in that term has a direction.** The
  coalition string is a set of families, so a missing family would silently
  produce a different string for the same politics. The share dropped is
  reported; it runs well under a percent.

* **The Non-Attached are excluded**, as everywhere else on the site: they are
  not a bloc and never vote as one.

* **Ties are not decided votes.** A roll-call with equal + and - fails, but it
  fails without a winning side to tally, so it is left out rather than assigned
  to one.

Output is one file for all five terms, `precomputed/coalitions.json`. Ally
counts are arrays aligned to `families`, the shape `participation.py` and
`deviations.py` already use, so the names are held once:

    {"families": ["Left", ..., "FarRight"],
     "lineage": {"10": {"Left": ["The Left"], "FarRight": ["PfE", "ESN"]}},
     "mandates": {"10": {"decided": 4244, "dropped": 0,
                         "breadth": {"7": 254, "6": 637, ...},
                         "allies": {"EPP": {"votes": 4244, "wins": 3988,
                                            "sameSide": [...], "wonTogether": [...]}},
                         "coalitions": [...],
                         "bySubject": {...}}}}
"""

from collections import Counter, defaultdict
from datetime import datetime, timezone

from . import config
from .jsonstream import iter_json_array
from .report import atomic_write_json

PRECOMPUTED = config.WEB_DATA_DIR / "precomputed"

# The seven families, seated left to right.
#
# The order is presentation only — it decides the order of the squares that
# name a coalition on the site, and the order of these arrays. Nothing in this
# file computes anything from it, which is the point: an earlier version sliced
# this list into flanks and reported which one a group had sided with, and that
# slice was an editorial claim dressed as a measurement.
FAMILIES = ["Left", "Greens", "S&D", "Liberals", "EPP", "Conservatives", "FarRight"]

# Every group id either data source uses, mapped onto its family. Both
# spellings appear -- `data/final` writes "The Left" and "Renew" where the
# precomputed networks write "GUE/NGL" and "RE" -- so both are listed and one
# table serves either source.
#
# Two of these lineages are arguable rather than given. UEN did not become ECR:
# ECR was founded in 2009 out of UEN members and the British Conservatives, and
# the rest of UEN went to EFD. And the far-right line runs through four
# reshuffles, two of which (T8, T10) ran two groups at once. Both are drawn as
# one line because the alternative is seven stubs, and both are published in
# `lineage` so the claim is visible on the page rather than buried here.
GROUP_FAMILY = {
    "GUE/NGL": "Left", "The Left": "Left",
    "Verts/ALE": "Greens",
    "PSE": "S&D", "S&D": "S&D",
    "ALDE": "Liberals", "Renew": "Liberals", "RE": "Liberals",
    "PPE-DE": "EPP", "PPE": "EPP",
    "UEN": "Conservatives", "ECR": "Conservatives",
    "IND/DEM": "FarRight", "EFD": "FarRight", "EFDD": "FarRight",
    "ENF": "FarRight", "ID": "FarRight", "PfE": "FarRight", "ESN": "FarRight",
}

# The Non-Attached are not a bloc; the site refuses to report agreement with
# them for the same reason.
NOT_A_GROUP = {"NonAttached", "NI", "NA"}

# A winning coalition is published if it took at least this share of a view's
# decided votes. A share floor rather than a fixed top-N: the number of rows
# then follows how fragmented the term actually was -- about 20 in term 6,
# about 14 in term 10 -- instead of imposing the same length on every term. The
# tail below the floor is summed into one row so the rest is accounted for.
MIN_COALITION_SHARE = 0.01

# Below this many decided votes a view's percentages are noise. Term 10's
# Transport and Tourism has twelve. Published anyway, with the count, and
# marked by the site -- same floor and reasoning as the trends panel.
MIN_VIEW_VOTES = 60

VOTE_POSITIONS = ("+", "-", "0")


def family_directions(session):
    """Each family's majority direction on one roll-call, plus the outcome.

    A family's direction is the majority ballot of all its members present,
    pooled across the groups that made it up in that term -- in term 10 the far
    right is PfE and ESN voting as one line, which is the same merge the charts
    draw.

    Returns (directions, winner, ballots) where `winner` is "+" or "-", or None
    for a tie or a vote with no usable ballots, and `ballots` is each family's
    raw per-position counts.
    """
    votes = session.get("votes") or {}
    totals = {}
    per_family = defaultdict(Counter)
    for position in VOTE_POSITIONS:
        block = votes.get(position) or {}
        totals[position] = block.get("total", 0) or 0
        for group, members in (block.get("groups") or {}).items():
            if group in NOT_A_GROUP:
                continue
            family = GROUP_FAMILY.get(group)
            if family:
                per_family[family][position] += len(members)

    if totals.get("+", 0) == totals.get("-", 0):
        winner = None
    else:
        winner = "+" if totals.get("+", 0) > totals.get("-", 0) else "-"

    directions = {}
    for family, counter in per_family.items():
        if sum(counter.values()) == 0:
            continue
        directions[family] = majority(counter)
    return directions, winner, dict(per_family)


def majority(counter):
    """The winning position in a ballot count, decided the same way every time.

    max() on a Counter breaks ties by insertion order, which would make the
    result depend on the order the dump happens to list positions in. Sorting
    on (-count, position) makes an exact split deterministic.
    """
    return sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]


def blank_view():
    """The mutable tallies one view accumulates."""
    return {
        "decided": 0,
        "coalitions": Counter(),
        "breadth": Counter(),
        # pivot -> {"votes", "wins", "sameSide": Counter, "wonTogether": Counter}
        "allies": defaultdict(
            lambda: {"votes": 0, "wins": 0, "sameSide": Counter(), "wonTogether": Counter()}
        ),
    }


def tally(view, directions, winner):
    """Add one roll-call to a view."""
    view["decided"] += 1
    winning = tuple(f for f in FAMILIES if directions.get(f) == winner)
    view["coalitions"][winning] += 1
    view["breadth"][len(winning)] += 1

    won = set(winning)
    for pivot, own in directions.items():
        block = view["allies"][pivot]
        block["votes"] += 1
        pivot_won = pivot in won
        if pivot_won:
            block["wins"] += 1
        for other, other_side in directions.items():
            if other == pivot:
                continue
            # Same side as the pivot, whoever won.
            if other_side == own:
                block["sameSide"][other] += 1
            # On the winning side alongside the pivot. Only counted on the
            # pivot's own wins, so the denominator is "times this family won"
            # and the figure reads as "who was there when it did".
            if pivot_won and other in won:
                block["wonTogether"][other] += 1


def summarise_view(rows):
    """Turn one view's raw tallies into the block the site reads."""
    total = rows["decided"]

    ranked = rows["coalitions"].most_common()
    floor = total * MIN_COALITION_SHARE
    kept = [(groups, count) for groups, count in ranked if count >= floor]
    tail = [(groups, count) for groups, count in ranked if count < floor]
    coalitions = [
        {"groups": list(groups), "votes": count,
         "share": round(count / total, 5) if total else 0.0}
        for groups, count in kept
    ]
    other_votes = sum(count for _, count in tail)

    allies = {}
    for pivot, block in rows["allies"].items():
        if block["votes"] == 0:
            continue
        allies[pivot] = {
            "votes": block["votes"],
            "wins": block["wins"],
            # Aligned to FAMILIES, null in the pivot's own slot.
            "sameSide": [
                None if f == pivot else block["sameSide"].get(f, 0) for f in FAMILIES
            ],
            "wonTogether": [
                None if f == pivot else block["wonTogether"].get(f, 0) for f in FAMILIES
            ],
        }

    return {
        "decided": total,
        "thin": total < MIN_VIEW_VOTES,
        "coalitions": coalitions,
        "otherCoalitions": {
            "count": len(tail),
            "votes": other_votes,
            "share": round(other_votes / total, 5) if total else 0.0,
        },
        # How many families the winning side held. No chart draws this yet; it
        # is the classification-free form of the consensus-collapse headline
        # (7-of-7 wins fell 11% -> 6% while 5-of-7 rose 26% -> 54%), and the
        # run's validation gate below is checked against it.
        "breadth": {str(k): v for k, v in sorted(rows["breadth"].items())},
        "allies": allies,
    }


def build_mandate(mandate, report):
    """Read one term's roll-calls and tally, overall and per policy area."""
    path = config.FINAL_DIR / f"ep_votes_{mandate}.json"

    overall = blank_view()
    by_subject = defaultdict(blank_view)
    sessions = []
    seen_groups = set()
    ties = 0
    total = 0

    # Two passes. Which families sat in this term is only known once every
    # roll-call has been read -- a group founded mid-term would otherwise make
    # the "every family voted" test mean something different in January than in
    # December -- so directions are computed first and judged second. Only the
    # reduced per-vote directions are held, not the ballots.
    for session in iter_json_array(str(path)):
        total += 1
        for position in VOTE_POSITIONS:
            block = (session.get("votes") or {}).get(position) or {}
            for group in (block.get("groups") or {}):
                if group not in NOT_A_GROUP:
                    seen_groups.add(group)

        directions, winner, _ = family_directions(session)
        if winner is None:
            ties += 1
            continue
        sessions.append(
            (session.get("subject") or config.FALLBACK_SUBJECT, directions, winner)
        )

    present = {GROUP_FAMILY[g] for g in seen_groups if g in GROUP_FAMILY}
    dropped = 0
    for subject, directions, winner in sessions:
        # Every family that sat in this term has to have voted, or the coalition
        # set is not the same kind of object from one row to the next.
        if not present.issubset(directions.keys()):
            dropped += 1
            continue
        tally(overall, directions, winner)
        tally(by_subject[subject], directions, winner)

    lineage = defaultdict(list)
    for group in sorted(seen_groups):
        family = GROUP_FAMILY.get(group)
        if family:
            lineage[family].append(group)

    payload = summarise_view(overall)
    payload["votes"] = total
    payload["ties"] = ties
    payload["dropped"] = dropped
    payload["bySubject"] = {
        subject: summarise_view(rows) for subject, rows in sorted(by_subject.items())
    }

    share_dropped = dropped / max(total, 1)
    report.fact(f"mandate {mandate}: decided votes classified",
                f"{overall['decided']} of {total}")
    report.fact(f"mandate {mandate}: dropped for an absent family",
                f"{dropped} ({share_dropped:.2%})")
    report.fact(f"mandate {mandate}: winning coalitions above the floor",
                f"{len(payload['coalitions'])} of "
                f"{len(payload['coalitions']) + payload['otherCoalitions']['count']} "
                f"({1 - payload['otherCoalitions']['share']:.0%} of votes)")
    report.check(
        f"mandate {mandate}: nearly every vote yields a coalition",
        share_dropped < 0.05,
        f"{share_dropped:.1%} of roll-calls had a family with no ballot cast, "
        f"so the winning-coalition tally is not describing the whole term",
    )
    # The published rows have to be most of the term or the list is a curiosity
    # rather than an answer to "what wins here".
    report.check(
        f"mandate {mandate}: the listed coalitions cover the term",
        payload["otherCoalitions"]["share"] < 0.5,
        f"coalitions below the {MIN_COALITION_SHARE:.0%} floor hold "
        f"{payload['otherCoalitions']['share']:.0%} of decided votes",
        fatal=False,
    )
    return payload, dict(lineage)


def run(report, mandates):
    report.step("coalitions")
    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "families": FAMILIES,
        "minViewVotes": MIN_VIEW_VOTES,
        "minCoalitionShare": MIN_COALITION_SHARE,
        "lineage": {},
        "mandates": {},
    }

    for mandate in mandates:
        payload, lineage = build_mandate(mandate, report)
        out["mandates"][mandate] = payload
        out["lineage"][mandate] = lineage

    # The headline this step exists to publish, in its classification-free
    # form: the share of votes won by every family at once. If it ever stops
    # falling, what the site says about consensus is wrong, and that should be
    # caught here rather than on a wall.
    unanimous = {}
    for mandate, payload in out["mandates"].items():
        decided = payload["decided"]
        if decided:
            full = payload["breadth"].get(str(len(FAMILIES)), 0)
            unanimous[mandate] = full / decided
    if len(unanimous) == len(config.MANDATE_ORDER):
        first = unanimous[config.MANDATE_ORDER[0]]
        last = unanimous[config.MANDATE_ORDER[-1]]
        report.fact("votes won by all seven families, first term to last",
                    f"{first:.1%} -> {last:.1%}")
        report.check(
            "unanimous voting fell across the five terms",
            last < first,
            f"all-seven wins ran {first:.1%} in the first term and {last:.1%} in "
            f"the last, so the site's headline no longer holds",
            fatal=False,
        )

    target = PRECOMPUTED / "coalitions.json"
    atomic_write_json(target, out)
    report.fact("written", f"{target.name} ({target.stat().st_size / 1024:.0f} KB)")
    report.end_step()


def main(argv=None):
    """Runnable on its own: `python -m pipeline.coalitions --mandates 10`.

    Reads `data/final` and writes one side file, touching nothing the other
    stages own, so it can be re-run without a network rebuild behind it.
    """
    import argparse

    from .report import Report

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--mandates", help="comma separated, e.g. 10 (default: all)")
    args = parser.parse_args(argv)
    mandates = (
        [m.strip() for m in args.mandates.split(",") if m.strip()]
        if args.mandates
        else config.MANDATE_ORDER
    )

    report = Report("coalitions")
    run(report, mandates)
    report.write()
    report.print_summary()
    return 1 if report.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
