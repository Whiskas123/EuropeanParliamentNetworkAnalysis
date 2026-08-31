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

* **Which whole coalitions win.** The set of groups on the winning side,
  tallied. Term 10's most common is The Left+Greens/EFA+S&D+Renew+EPP; a
  right-only majority of EPP+ECR+PfE+ESN has no equivalent in term 9.

* **Who each group wins with.** For every group, on the votes it won, how often
  each other group was on the winning side too. This is the measure that shows
  the far right has no majority of its own: nearly all of PfE's wins are votes
  the EPP also won.

* **Who each group votes with**, over all decided votes rather than only its
  wins. The plain co-voting rate, which separates a group that is often on the
  same side from one that merely wins alongside.

An earlier version reported instead which *flank* -- left or right -- a bloc
carried the day with. That required this file to declare that the EPP is the
right, Renew the centre-left, the Greens the left, and so on, and those
assignments were doing invisible load-bearing work in a published chart. There
is no agreed answer, so the question has been replaced with ones the roll-calls
can settle on their own.

**This file counts groups, not families.** It used to merge the groups of each
term into seven families -- one Socialist line from PSE through S&D, one
far-right line from IND/DEM through PfE and ESN -- because the charts that
cross a term boundary need a continuous series. The coalition panel never
crosses one: it is always a single term, so the merge bought it nothing and
cost it the two splits that matter. Term 8 ran EFDD and ENF side by side and
term 10 runs PfE and ESN, and pooling each pair into "the far right" published
one line for two groups that vote up to twenty points apart. `families.py`'s
table still exists for the charts that genuinely span terms; nothing here uses
it.

Four decisions worth stating:

* **A group renamed mid-term is one group.** The dump carries both spellings
  where a rename landed inside a term -- PSE and S&D in term 7, PPE-DE and PPE
  in term 7, GUE/NGL and The Left in term 9 -- and those are one continuous
  group, not two. They are folded, under the later name, and *only* when both
  spellings actually appear in that term, so term 6's PSE stays PSE and term
  8's GUE/NGL stays GUE/NGL. The fold is published in `renames` so the site can
  show it. Groups that genuinely coexisted are never folded.

* **A vote counts only if every group in that term has a direction.** The
  coalition string is a set of groups, so a missing group would silently
  produce a different string for the same politics. The share dropped is
  reported. It matters more than it did at family level: the far right pooled
  two groups and so almost always had a ballot somewhere, while a 25-member ESN
  can be absent on its own.

* **The Non-Attached are excluded**, as everywhere else on the site: they are
  not a bloc and never vote as one.

* **Ties are not decided votes.** A roll-call with equal + and - fails, but it
  fails without a winning side to tally, so it is left out rather than assigned
  to one.

Output is one file for all five terms, `precomputed/coalitions.json`. Ally
counts are arrays aligned to that term's `groups`, the shape `participation.py`
and `deviations.py` already use, so the names are held once:

    {"groups": {"10": ["The Left", ..., "PfE", "ESN"]},
     "groupFamily": {"PfE": "FarRight", ...},
     "renames": {"7": {"S&D": ["PSE", "S&D"]}},
     "mandates": {"10": {"decided": 4244, "dropped": 0,
                         "breadth": {"7": 254, "6": 637, ...},
                         "allies": {"PPE": {"votes": 4244, "wins": 3988,
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

# Every group id `data/final` uses, seated left to right.
#
# The order is presentation only -- it decides the order of the squares that
# name a coalition on the site, and the order of the ally arrays. Nothing in
# this file computes anything from it, which is the point: an earlier version
# sliced a list like this into flanks and reported which one a group had sided
# with, and that slice was an editorial claim dressed as a measurement.
#
# Within a term the seating is the conventional left-to-right reading of the
# hemicycle. The two places where it does real work are the terms that ran two
# far-right groups at once: term 8's EFDD sat left of ENF, and term 10's PfE
# sits left of ESN.
GROUP_SEATING = [
    "GUE/NGL", "The Left",
    "Verts/ALE",
    "PSE", "S&D",
    "ALDE", "RE", "Renew",
    "PPE-DE", "PPE",
    "UEN", "ECR",
    "IND/DEM", "EFD", "EFDD", "ENF", "ID", "PfE", "ESN",
]

# The later name of a group that was renamed inside a term.
#
# Applied only when both spellings appear in the same term's roll-calls -- see
# `canonical_names`. This is a rename, not a lineage: PSE and S&D are the same
# group with the same members on either side of the change, which is why they
# are folded, while EFDD and ENF are two groups that sat at the same time and
# are not.
SUCCESSOR = {
    "PSE": "S&D",
    "PPE-DE": "PPE",
    "GUE/NGL": "The Left",
    "RE": "Renew",
}

# Which family each group belongs to, published for the site rather than used
# here.
#
# Nothing in this file merges by family any more. The site needs the table for
# one thing only: when the reader moves from one term to another the panel has
# to land somewhere, and "the far right group of this term" is a better answer
# than dropping the selection. Kept in step by hand with `GROUP_FAMILY` in
# 2025/web/src/lib/families.js.
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
# then follows how fragmented the term actually was instead of imposing the
# same length on every term. The tail below the floor is summed into one row so
# the rest is accounted for.
MIN_COALITION_SHARE = 0.01

# Below this many decided votes a view's percentages are noise. Term 10's
# Transport and Tourism has twelve. Published anyway, with the count, and
# marked by the site -- same floor and reasoning as the trends panel.
MIN_VIEW_VOTES = 60

VOTE_POSITIONS = ("+", "-", "0")


def group_ballots(session):
    """Each group's raw ballot counts on one roll-call, plus the outcome.

    Returns (ballots, winner) where `ballots` maps a raw group id to its
    per-position counts and `winner` is "+" or "-", or None for a tie.

    Deliberately raw: which spellings are one renamed group is only knowable
    once the whole term has been read, so nothing is folded or reduced to a
    direction here. See `build_mandate`.
    """
    votes = session.get("votes") or {}
    totals = {}
    ballots = defaultdict(Counter)
    for position in VOTE_POSITIONS:
        block = votes.get(position) or {}
        totals[position] = block.get("total", 0) or 0
        for group, members in (block.get("groups") or {}).items():
            if group in NOT_A_GROUP:
                continue
            if group in GROUP_FAMILY:
                ballots[group][position] += len(members)

    if totals.get("+", 0) == totals.get("-", 0):
        winner = None
    else:
        winner = "+" if totals.get("+", 0) > totals.get("-", 0) else "-"
    return dict(ballots), winner


def canonical_names(seen_groups):
    """Raw group id -> the name this term calls it, folding mid-term renames.

    A rename is only applied when *both* spellings turn up in the same term. A
    term that only ever says PSE is a term in which the group was called PSE,
    and printing "S&D" over 2004-09 would be an anachronism on the page; a term
    that says both is a term the rename happened in, and the two are one group
    under the later name.

    Chains are followed, so a hypothetical A -> B -> C with all three present
    lands every one of them on C.

    @param seen_groups: the raw ids this term's roll-calls carry
    """
    seen = set(seen_groups)
    canon = {}
    for group in seen:
        name = group
        while name in SUCCESSOR and SUCCESSOR[name] in seen:
            name = SUCCESSOR[name]
        canon[group] = name
    return canon


def directions_from(ballots, canon):
    """Each canonical group's majority direction on one roll-call.

    Ballots are pooled before the majority is taken, not after: a renamed group
    is one group, so if a single roll-call ever carried both spellings, the
    answer has to be the majority of everyone in it rather than a vote between
    two halves.
    """
    pooled = defaultdict(Counter)
    for group, counter in ballots.items():
        pooled[canon.get(group, group)].update(counter)
    return {
        group: majority(counter)
        for group, counter in pooled.items()
        if sum(counter.values()) > 0
    }


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
            lambda: {
                "votes": 0,
                "wins": 0,
                "sameSide": Counter(),
                "wonTogether": Counter(),
                # Per-pair denominators; see the note in `tally`.
                "bothVotes": Counter(),
                "bothWins": Counter(),
            }
        ),
    }


def tally(view, groups, directions, winner):
    """Add one roll-call to a view."""
    view["decided"] += 1
    winning = tuple(g for g in groups if directions.get(g) == winner)
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
            # Every pair carries its own denominator, because two groups do not
            # always sit at the same time. ENF was constituted in June 2015,
            # eleven months into term 8, so 986 of that term's decided votes
            # were taken before it existed. Counting "EFDD stood with ENF" over
            # all 11,275 of them would report a group that was not in the room
            # as a group that voted the other way, and understate every ENF
            # figure in the term by about a tenth.
            block["bothVotes"][other] += 1
            # Same side as the pivot, whoever won.
            if other_side == own:
                block["sameSide"][other] += 1
            # On the winning side alongside the pivot. Only counted on the
            # pivot's own wins, so the denominator is "times this group won
            # while that one was sitting" and the figure reads as "who was
            # there when it did".
            if pivot_won:
                block["bothWins"][other] += 1
                if other in won:
                    block["wonTogether"][other] += 1


def summarise_view(rows, groups):
    """Turn one view's raw tallies into the block the site reads."""
    total = rows["decided"]

    ranked = rows["coalitions"].most_common()
    floor = total * MIN_COALITION_SHARE
    kept = [(names, count) for names, count in ranked if count >= floor]
    tail = [(names, count) for names, count in ranked if count < floor]
    coalitions = [
        {"groups": list(names), "votes": count,
         "share": round(count / total, 5) if total else 0.0}
        for names, count in kept
    ]
    other_votes = sum(count for _, count in tail)

    allies = {}
    for pivot, block in rows["allies"].items():
        if block["votes"] == 0:
            continue
        allies[pivot] = {
            "votes": block["votes"],
            "wins": block["wins"],
            # All four aligned to this term's `groups`, null in the pivot's own
            # slot. The counts come in pairs: a numerator and the denominator
            # it belongs over, because a pair of groups that did not sit at the
            # same time has fewer shared votes than either has of its own.
            "sameSide": [
                None if g == pivot else block["sameSide"].get(g, 0) for g in groups
            ],
            "bothVotes": [
                None if g == pivot else block["bothVotes"].get(g, 0) for g in groups
            ],
            "wonTogether": [
                None if g == pivot else block["wonTogether"].get(g, 0) for g in groups
            ],
            "bothWins": [
                None if g == pivot else block["bothWins"].get(g, 0) for g in groups
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
        # How many groups the winning side held. No chart draws this yet; it is
        # the classification-free form of the consensus-collapse headline, and
        # the run's validation gate below is checked against it.
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
    # Raw group id -> [first ballot, last ballot]. Groups are not all seated for
    # the whole term; see `sitting` below.
    windows = {}
    ties = 0
    total = 0

    # Two passes. Which groups sat in this term, and which of their names are
    # the same group renamed, is only known once every roll-call has been read
    # -- a group founded mid-term would otherwise make the "every group voted"
    # test mean something different in January than in December, and the rename
    # fold cannot be applied before both spellings have been seen -- so ballots
    # are collected first and judged second.
    for session in iter_json_array(str(path)):
        total += 1
        stamp = session.get("ts") or ""
        ballots, winner = group_ballots(session)
        seen_groups.update(ballots)
        for group in ballots:
            span = windows.get(group)
            if span is None:
                windows[group] = [stamp, stamp]
            else:
                span[0] = min(span[0], stamp)
                span[1] = max(span[1], stamp)
        if winner is None:
            ties += 1
            continue
        sessions.append(
            (stamp, session.get("subject") or config.FALLBACK_SUBJECT, ballots, winner)
        )

    canon = canonical_names(seen_groups)
    present = set(canon.values())
    groups = [g for g in GROUP_SEATING if g in present]
    unseated = sorted(present - set(groups))
    report.check(
        f"mandate {mandate}: every group has a seat",
        not unseated,
        f"{', '.join(unseated)} is not in GROUP_SEATING, so it would be dropped "
        f"from every coalition string while still being counted as present",
    )

    # When each group was actually in the chamber, on the canonical names.
    #
    # Not every group sits for a whole term. ENF was constituted on 15 June
    # 2015, eleven months into term 8, and its first ballot here is 2015-06-24;
    # before that date there is no ENF to have a direction. Requiring one, as
    # this step did while it pooled the far right into a family that EFDD kept
    # alive, threw away 986 term-8 roll-calls -- 8.7% of the term, and all of
    # them from its first year, which is a bias and not a rounding error.
    #
    # So a vote asks for a direction from the groups sitting *at the time of
    # that vote*, and a group outside its own window is simply not in the room.
    # The window is published, and the pair denominators in `tally` are built
    # on the same fact.
    sitting = {}
    for group, (first, last) in windows.items():
        name = canon[group]
        span = sitting.get(name)
        if span is None:
            sitting[name] = [first, last]
        else:
            span[0] = min(span[0], first)
            span[1] = max(span[1], last)

    dropped = 0
    part_term = 0
    for stamp, subject, ballots, winner in sessions:
        directions = directions_from(ballots, canon)
        seated = {
            g for g in groups if sitting[g][0] <= stamp <= sitting[g][1]
        }
        if len(seated) < len(groups):
            part_term += 1
        # Every group sitting on the day has to have voted, or the coalition set
        # is not the same kind of object from one row to the next.
        if not seated.issubset(directions.keys()):
            dropped += 1
            continue
        tally(overall, groups, directions, winner)
        tally(by_subject[subject], groups, directions, winner)

    renames = {}
    for group in sorted(seen_groups):
        name = canon[group]
        if name != group or any(
            other != group and canon[other] == name for other in seen_groups
        ):
            renames.setdefault(name, []).append(group)

    payload = summarise_view(overall, groups)
    payload["votes"] = total
    payload["ties"] = ties
    payload["dropped"] = dropped
    payload["partTerm"] = part_term
    payload["sitting"] = {
        group: {"from": sitting[group][0], "to": sitting[group][1]} for group in groups
    }
    payload["bySubject"] = {
        subject: summarise_view(rows, groups)
        for subject, rows in sorted(by_subject.items())
    }

    share_dropped = dropped / max(total, 1)
    report.fact(f"mandate {mandate}: groups", ", ".join(groups))
    report.fact(f"mandate {mandate}: decided votes classified",
                f"{overall['decided']} of {total}")
    report.fact(f"mandate {mandate}: dropped for an absent group",
                f"{dropped} ({share_dropped:.2%})")
    if part_term:
        late = [
            f"{g} from {sitting[g][0][:10]}"
            for g in groups
            if sitting[g][0] > min(span[0] for span in sitting.values())
        ]
        report.fact(f"mandate {mandate}: votes decided before every group sat",
                    f"{part_term} ({part_term / max(overall['decided'], 1):.1%}) — "
                    f"{', '.join(late) or 'window edges only'}")
    report.fact(f"mandate {mandate}: winning coalitions above the floor",
                f"{len(payload['coalitions'])} of "
                f"{len(payload['coalitions']) + payload['otherCoalitions']['count']} "
                f"({1 - payload['otherCoalitions']['share']:.0%} of votes)")
    report.check(
        f"mandate {mandate}: nearly every vote yields a coalition",
        share_dropped < 0.05,
        f"{share_dropped:.1%} of roll-calls had a group with no ballot cast, "
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
    return payload, groups, renames


def run(report, mandates):
    report.step("coalitions")
    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "minViewVotes": MIN_VIEW_VOTES,
        "minCoalitionShare": MIN_COALITION_SHARE,
        "groups": {},
        "groupFamily": GROUP_FAMILY,
        "renames": {},
        "mandates": {},
    }

    for mandate in mandates:
        payload, groups, renames = build_mandate(mandate, report)
        out["mandates"][mandate] = payload
        out["groups"][mandate] = groups
        out["renames"][mandate] = renames

    # The headline this step exists to publish, in its classification-free
    # form: the share of votes won by every group at once. If it ever stops
    # falling, what the site says about consensus is wrong, and that should be
    # caught here rather than on a wall.
    #
    # Read across terms with the group count in hand, not as a bare percentage:
    # terms 8 and 10 need eight groups to agree where the others need seven, so
    # the bar is higher in exactly the terms the far right split in two.
    unanimous = {}
    for mandate, payload in out["mandates"].items():
        decided = payload["decided"]
        if decided:
            full = payload["breadth"].get(str(len(out["groups"][mandate])), 0)
            unanimous[mandate] = full / decided
    if len(unanimous) == len(config.MANDATE_ORDER):
        first_id = config.MANDATE_ORDER[0]
        last_id = config.MANDATE_ORDER[-1]
        first = unanimous[first_id]
        last = unanimous[last_id]
        report.fact("votes won by every group at once, first term to last",
                    f"{first:.1%} ({len(out['groups'][first_id])} groups) -> "
                    f"{last:.1%} ({len(out['groups'][last_id])} groups)")
        report.check(
            "unanimous voting fell across the five terms",
            last < first,
            f"all-group wins ran {first:.1%} in the first term and {last:.1%} in "
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
