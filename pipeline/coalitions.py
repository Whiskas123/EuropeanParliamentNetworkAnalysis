"""Which groups win votes together, measured one roll-call at a time.

The site's other agreement figures are *pairwise similarity*: over a term, how
often do these two MEPs cast the same ballot. That measure answers "who votes
like whom" and it cannot answer "who governs with whom", because it is
dominated by the votes nobody contests. Term 10 decides 4,245 roll-calls and
the two blocs are on opposite sides in 3,002 of them; the pairwise number
averages both kinds together, so a group can look like everyone's friend while
consistently losing to a coalition it is not in.

This step classifies each roll-call directly. Every group's *direction* on a
vote is the majority of its own members present. From those directions two
questions get answered:

* **Who did group X carry the day with?** With the left flank, the right flank,
  both (a consensus vote), or neither. For the EPP across the five terms that
  is 52% consensus falling to 27%, and EPP-with-the-left rising 17% -> 50%.

* **Which whole coalitions actually win?** The set of families on the winning
  side, tallied. Term 10's most common is Left+Greens+S&D+Liberals+EPP at 35.8%
  of decided votes -- everyone but the right. Sixth, at 5.8%, is
  EPP+Conservatives+FarRight, a right-only majority that wins nearly a vote in
  seventeen and has no equivalent in the term 9 top ten.

Neither figure exists anywhere else in the pipeline, and neither is derivable
from the published networks: `intergroupCohesion` is the pairwise measure, and
the edge lists are cut at 0.6 besides.

Four decisions worth stating:

* **Groups are merged into families across renames.** PSE and S&D are one line,
  as are ALDE/Renew, PPE-DE/PPE, UEN/ECR, and the far-right lineage
  IND/DEM -> EFD -> EFDD+ENF -> ID -> PfE+ESN. Without this every chart over
  five terms is seven stubs. The lineage is an editorial claim, not a fact in
  the data, so it is published in the output for the site to show.

* **A vote counts only if every family in that term has a direction.** The
  coalition string is a set of families, so a missing family would silently
  produce a different string for the same politics. The share dropped is
  reported; it runs well under a percent.

* **The Non-Attached are excluded**, as everywhere else on the site: they are
  not a bloc and never vote as one.

* **Ties are not decided votes.** A roll-call with equal + and - fails, but it
  fails without a winning side to tally, so it is left out of the coalition
  counts rather than assigned to one.

Output is one small file for all five terms, `precomputed/coalitions.json`:

    {"families": ["Left", ..., "FarRight"],
     "lineage": {"10": {"Left": ["The Left"], "FarRight": ["PfE", "ESN"]}},
     "mandates": {"10": {"decided": 4244, "dropped": 1,
                         "pivots": {"EPP": {...}},
                         "coalitions": [...],
                         "bySubject": {...}}}}
"""

from collections import Counter, defaultdict
from datetime import datetime, timezone

from . import config
from .jsonstream import iter_json_array
from .report import atomic_write_json

PRECOMPUTED = config.WEB_DATA_DIR / "precomputed"

# The seven families, seated left to right. Order is meaningful: the site draws
# a "house profile" along this axis, and the flanks below are slices of it.
FAMILIES = ["Left", "Greens", "S&D", "Liberals", "EPP", "Conservatives", "FarRight"]

# Every group id the vote dumps use, mapped onto its family. Both spellings of
# the ids appear across the sources -- `data/final` writes "The Left" and
# "Renew" where the precomputed networks write "GUE/NGL" and "RE" -- so both are
# listed and the site can reuse this table against either.
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

# The two flanks a pivot group is measured against. A pivot inside a flank is
# taken out of it first, so "S&D won with the left" means S&D with the Left and
# the Greens, not S&D with itself.
LEFT_FLANK = ("Left", "Greens", "S&D")
RIGHT_FLANK = ("Conservatives", "FarRight")

# The Non-Attached are not a bloc; the site refuses to report agreement with
# them for the same reason.
NOT_A_GROUP = {"NonAttached", "NI", "NA"}

# Coalitions kept per view before the tail is summed into one "other" row. The
# tail is long -- term 9 sees hundreds of distinct winning sets -- and a chart
# can show a dozen. The count and share of what was folded away is kept.
TOP_COALITIONS = 12

# Below this many decided votes a view's percentages are noise. Term 10's
# Transport and Tourism has twelve. Published anyway, with the count, and
# marked by the site -- same floor and reasoning as the trends panel.
MIN_VIEW_VOTES = 60

VOTE_POSITIONS = ("+", "-", "0")


def family_directions(session):
    """Each family's majority direction on one roll-call, plus the outcome.

    A family's direction is the majority ballot of all its members present,
    pooled across the groups that made it up in that term -- in term 10 the
    far right is PfE and ESN voting as one line, which is the same merge the
    charts draw.

    Returns (directions, winner, ballots) where `winner` is "+" or "-", or None
    for a tie or a vote with no usable ballots, and `ballots` is each family's
    raw per-position counts for the flank arithmetic below.
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


def bloc_direction(ballots, families):
    """The majority direction of a flank, pooling its members' ballots.

    Pooled at member level rather than one-family-one-vote: the left flank is
    the Left, the Greens and S&D, and S&D is larger than the other two together
    in every term, so counting families equally would let a 39-member group
    outvote a 136-member one inside its own bloc.

    Pooling ballots is also not the same as weighting each family's *position*
    by its size, which is what an earlier version did. That version handed a
    family's abstainers to whichever side its majority took, and moved term 6's
    consensus share by 2.6 points. A flank's direction is how its members
    actually voted.
    """
    counter = Counter()
    for family in families:
        for position, count in (ballots.get(family) or {}).items():
            counter[position] += count
    if not counter:
        return None
    return majority(counter)


def classify_pivot(directions, ballots, pivot):
    """Which flank the pivot group carried this vote with.

    "consensus" when both flanks went the pivot's way, "left" or "right" when
    only one did, "alone" when neither. Returns None when the pivot did not
    vote, or when a flank holds nothing but the pivot itself.
    """
    if pivot not in directions:
        return None
    own = directions[pivot]
    left = bloc_direction(ballots, [f for f in LEFT_FLANK if f != pivot])
    right = bloc_direction(ballots, [f for f in RIGHT_FLANK if f != pivot])
    if left is None or right is None:
        return None
    if left == own and right == own:
        return "consensus"
    if left == own:
        return "left"
    if right == own:
        return "right"
    return "alone"


def summarise_view(rows):
    """Turn one view's raw tallies into the block the site reads."""
    pivots = {}
    for pivot, counter in rows["pivots"].items():
        total = sum(counter.values())
        if total == 0:
            continue
        pivots[pivot] = {
            "votes": total,
            "consensus": counter["consensus"],
            "left": counter["left"],
            "right": counter["right"],
            "alone": counter["alone"],
        }

    total = rows["decided"]
    ranked = rows["coalitions"].most_common()
    kept = ranked[:TOP_COALITIONS]
    tail = ranked[TOP_COALITIONS:]
    coalitions = [
        {"groups": list(groups), "votes": count,
         "share": round(count / total, 5) if total else 0.0}
        for groups, count in kept
    ]
    other_votes = sum(count for _, count in tail)
    return {
        "decided": total,
        "thin": total < MIN_VIEW_VOTES,
        "pivots": pivots,
        "coalitions": coalitions,
        "otherCoalitions": {
            "count": len(tail),
            "votes": other_votes,
            "share": round(other_votes / total, 5) if total else 0.0,
        },
    }


def build_mandate(mandate, report):
    """Read one term's roll-calls and tally both measures, overall and by area."""
    path = config.FINAL_DIR / f"ep_votes_{mandate}.json"

    def blank():
        return {"decided": 0, "pivots": defaultdict(Counter), "coalitions": Counter()}

    overall = blank()
    by_subject = defaultdict(blank)
    sessions = []
    seen_groups = set()
    ties = 0
    total = 0

    # Two passes. Which families sat in this term is only known once every
    # roll-call has been read -- a group founded mid-term would otherwise make
    # the "every family voted" test mean something different in January than in
    # December -- so the directions are computed first and judged second. Only
    # the reduced per-vote directions are held, not the ballots.
    for session in iter_json_array(str(path)):
        total += 1
        for position in VOTE_POSITIONS:
            block = (session.get("votes") or {}).get(position) or {}
            for group in (block.get("groups") or {}):
                if group not in NOT_A_GROUP:
                    seen_groups.add(group)

        directions, winner, ballots = family_directions(session)
        if winner is None:
            ties += 1
            continue
        sessions.append(
            (session.get("subject") or config.FALLBACK_SUBJECT, directions, winner, ballots)
        )

    present = {GROUP_FAMILY[g] for g in seen_groups if g in GROUP_FAMILY}
    dropped = 0
    for subject, directions, winner, ballots in sessions:
        # Every family that sat in this term has to have voted, or the coalition
        # set is not the same kind of object from one row to the next.
        if not present.issubset(directions.keys()):
            dropped += 1
            continue
        verdicts = {
            pivot: classify_pivot(directions, ballots, pivot) for pivot in FAMILIES
        }
        winning = tuple(f for f in FAMILIES if directions.get(f) == winner)
        for view in (overall, by_subject[subject]):
            view["decided"] += 1
            for pivot, verdict in verdicts.items():
                if verdict:
                    view["pivots"][pivot][verdict] += 1
            view["coalitions"][winning] += 1

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
    report.check(
        f"mandate {mandate}: nearly every vote yields a coalition",
        share_dropped < 0.05,
        f"{share_dropped:.1%} of roll-calls had a family with no ballot cast, "
        f"so the winning-coalition tally is not describing the whole term",
    )
    return payload, dict(lineage)


def run(report, mandates):
    report.step("coalitions")
    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "families": FAMILIES,
        "leftFlank": list(LEFT_FLANK),
        "rightFlank": list(RIGHT_FLANK),
        "minViewVotes": MIN_VIEW_VOTES,
        "lineage": {},
        "mandates": {},
    }

    for mandate in mandates:
        payload, lineage = build_mandate(mandate, report)
        out["mandates"][mandate] = payload
        out["lineage"][mandate] = lineage

    # The one figure this whole step exists to publish. If it ever stops
    # falling, the headline the site prints is wrong, and that should be caught
    # here rather than on a wall.
    consensus = {}
    for mandate, payload in out["mandates"].items():
        block = payload["pivots"].get("EPP")
        if block and block["votes"]:
            consensus[mandate] = block["consensus"] / block["votes"]
    if len(consensus) == len(config.MANDATE_ORDER):
        first = consensus[config.MANDATE_ORDER[0]]
        last = consensus[config.MANDATE_ORDER[-1]]
        report.fact("consensus votes, first term to last", f"{first:.1%} -> {last:.1%}")
        report.check(
            "consensus voting fell across the five terms",
            last < first,
            f"consensus ran {first:.1%} in the first term and {last:.1%} in the "
            f"last, so the site's headline no longer holds",
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
