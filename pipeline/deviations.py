"""How far each MEP sits from their own group, measured only where they voted.

The site's MEP panel reports agreement with each political group as a plain
percentage, and that number is not comparable between two MEPs unless they sat
the same votes. Term 10's 176 women's rights votes fall on five sitting days in
six debates: Catarina Martins was present for the two Galvez reports, where the
EPP largely voted with the left, and shows 72.7% agreement with the EPP; Jonas
Sjostedt was present for the Vesligaj report, which split the house, and shows
56.6%. They share 3 of the 176 votes. Both served the full term at 76% and 86%
overall participation, so neither figure is about a short mandate. Across all 41
of their group's members the pattern is unambiguous - those who voted on 170+ of
the 176 span 61.6-63.4%, while those under 120 span 56.5-72.7%. Nearly all of
the apparent variation is attendance, not politics.

So this step publishes a figure that survives absence: how far an MEP sits from
what *their own group* did, in the same rooms, on the same days.

    deviation(mep, group) = mep's agreement with `group`
                          - their own group's agreement with `group`,
                            over the same votes

The room is one vote. For each vote an MEP cast, their agreement index with a
target group is their ballot set against that group's balance on that vote, and
the baseline is what their own group's other members present did with the same
balance; the difference is averaged over every vote they cast. A consensual vote
lifts everyone in the room by the same amount, so it cancels. Across those 41
GUE/NGL members it collapses the women's rights spread from 16.1 points to 2.3.

An earlier version matched per *dossier* (one document code, `A10-0210/2025`)
rather than per vote, on the reasoning that a report arrives as a block of
amendments taken together. Matching is what defeats attendance, though, and a
vote is the finer room: on term 10's mandate-wide view the two agree at r=0.988
and a mean 0.48 points apart, so the dossier was buying nothing measurable. It
was costing entire policy areas. Requiring a dossier to carry ten votes, and an
MEP to have sat two such dossiers, emptied Regional Development and
Parliamentary Procedure for *every* MEP in term 10 - and Fisheries and Women's
Rights in term 6, Transport in term 7, Parliamentary Procedure in terms 8 and 9
- because those areas are mostly one- and two-vote items. Per vote they carry
585 and 494 MEPs. Note the dossier never equalised dossiers either: debates were
weighted by the votes an MEP cast in them, so a 141-amendment file already
outweighed a 10-vote one much as it does now.

Four decisions this file makes, none of them cosmetic:

* **Groups are resolved at the date of each vote, not at the end of the term.**
  `network.py:build_nodes` labels an MEP with the group they ended in, which is
  right for a node's colour and wrong here: 62 of term 10's 696 MEPs changed
  group, and six are labelled with a group they joined *after the last vote in
  the dump*. Taner Kabilov sat as Renew and then Non-Attached for every vote he
  cast and joined ECR on 2026-07-08; measured against ECR he deviates +86 points
  toward the Greens, which would be the largest figure in the dataset and is an
  artefact of the label. Only this file changes - the canvas still colours him
  by his final group, so anything rendered from this must say which group it
  used whenever `group` and `labelGroup` differ.

* **An MEP whose group at the time was Non-Attached gets no figure.** The
  Non-Attached are not a bloc, so deviation "from" them measures nothing; the
  site already refuses to report agreement *with* them for the same reason.

* **A group must have peers actually present at a vote** - `MIN_TARGET_PEERS`
  to have a balance worth measuring against, `MIN_REFERENCE_PEERS` left after
  the MEP is taken out to serve as their baseline. Both are counted after the
  leave-one-out, so a group of four that turns up alone says nothing.

* **`MIN_VOTES` votes minimum.** The figure is a difference of two rates and
  its noise falls as 1/sqrt(votes); below this the number is the sample rather
  than the politics. This replaces the old two-dossier floor, which measured
  the wrong thing - term 10 Agriculture reads +28.5 for a mandate-loyal MEP per
  vote and +35.8 per dossier, so dossier count was never what made it noisy.

Output shape, mirroring `participation.py`: names are held once and each MEP's
row is an array aligned to `groups`, null where a group was never
sufficiently present to compare against.

    {"mandate": "10",
     "groups": ["ECR", "ESN", ...],
     "subjects": ["Agriculture and Rural Development", ...],
     "meps": {"M257063": {"group": "GUE/NGL", "labelGroup": "GUE/NGL",
                          "all": {"dev": [...], "votes": 3228, "used": 3180},
                          "bySubject": {"16": {"dev": [...], "votes": 96,
                                               "used": 94}}}}}

`votes` is what the MEP cast in the view; `used` is how many of those found a
group with enough peers present to compare against, which is the sample the
figure actually rests on.
"""

from collections import defaultdict
from datetime import datetime, timezone

import numpy as np

from . import config
from .jsonstream import iter_json_array
from .network import VoteMatrix, map_group_id, normalise
from .report import atomic_write_json

PRECOMPUTED = config.WEB_DATA_DIR / "precomputed"

# Members a reference group needs present at a vote before "what my group did"
# means anything. Counted after the leave-one-out, so this many peers remain.
MIN_REFERENCE_PEERS = 4

# Members a target group needs present at a vote before its balance is a
# position rather than an accident of who turned up. Also after leave-one-out.
MIN_TARGET_PEERS = 5

# Votes an MEP needs in a view before any deviation is published for it. The
# figure is a difference of two rates, so its noise falls as 1/sqrt(votes):
# term 10's subject views have a median |largest deviation| of 7.1 points at 75
# votes against 2.7 at 1,049, which is that curve and not politics. Thirty is
# where the participation filter's own second door already sits, so this mostly
# binds on MEPs the filter admitted through the share test alone.
MIN_VOTES = 30

# Members a group needs in a term to get a column. The MEP dump carries every
# group each MEP ever sat in, across every term, so without this a term-10 file
# grows columns for ALDE, PSE, UEN and seven other groups that ended before it
# began - all of them empty, and all of them rendered as an empty dial.
MIN_GROUP_MEMBERS = 5

# The Non-Attached are not a bloc; see the module docstring.
NOT_A_GROUP = {"NonAttached", "NI"}

# How far outside [0, 1] a normalised figure may land and still be treated as a
# ceiling effect rather than a mismatch. See `deviations_for_view`. Term 10's
# worst genuine case is 2.7 points; the mismatches this separates out run to 40.
CEILING_TOLERANCE = 0.05


def load_mandate(mandate):
    """The vote matrix plus the date and title of every row."""
    builder = VoteMatrix()
    dates, titles = [], []
    path = config.FINAL_DIR / f"ep_votes_{mandate}.json"
    for session in iter_json_array(str(path)):
        builder.add_session(session, session.get("subject", config.FALLBACK_SUBJECT))
        dates.append(str(session.get("ts") or "")[:10])
        titles.append(session.get("title") or "")
    return builder, builder.build(), dates, titles


def group_at_vote(mep_ids, dates, meps):
    """Group index per (MEP, vote), from each MEP's dated group spans.

    Returns (int16 matrix of indices, group names). -1 means the dump records no
    group for that MEP on that date, which happens at the very start of a term
    and across a switch.
    """
    names, index = [], {}
    dates_array = np.array(dates)
    out = np.full((len(mep_ids), len(dates)), -1, dtype=np.int16)

    for col, mep_id in enumerate(mep_ids):
        mep = meps.get(mep_id)
        if mep is None:
            continue
        for span in mep["Groups"]:
            group = map_group_id(span.get("groupid"))
            if group is None:
                continue
            start = str(span.get("start") or "")[:10] or "0000-00-00"
            end_raw = str(span.get("end") or "")[:10]
            # An absent or sentinel end date means "still in it".
            end = "9999-99-99" if (not end_raw or end_raw.startswith("9999")) else end_raw
            if group not in index:
                index[group] = len(names)
                names.append(group)
            out[col, (dates_array >= start) & (dates_array <= end)] = index[group]
    return out, names


# A national delegation is not a sample of its country, it is the whole of it,
# so the floors that stop a group of four speaking for a political family are
# the wrong ones here: at MIN_TARGET_PEERS Malta's six and Cyprus's six would
# almost never clear the bar and those countries would simply have no national
# figure. Set instead at the point where a majority of the smallest delegation
# can still be present after the leave-one-out.
MIN_COUNTRY_TARGET_PEERS = 3
MIN_COUNTRY_REFERENCE_PEERS = 2


def country_of_mep(mep_ids, n_votes, meps):
    """Country index per (MEP, vote), in the shape `group_at_vote` returns.

    An MEP's country does not change mid-term the way their group does, so this
    is one column repeated - but it is built to the same shape so the same
    arithmetic can run over it unchanged.
    """
    names, index = [], {}
    out = np.full((len(mep_ids), n_votes), -1, dtype=np.int16)
    for col, mep_id in enumerate(mep_ids):
        mep = meps.get(mep_id)
        # The dump holds country under Constituencies, and an MEP can have
        # several across terms. `build_nodes` takes the latest by start date for
        # the node's own label, and this follows it so the two agree.
        seats = [c for c in (mep or {}).get("Constituencies", []) if c.get("country")]
        if not seats:
            continue
        country = sorted(seats, key=lambda c: str(c.get("start") or ""))[-1]["country"]
        if country not in index:
            index[country] = len(names)
            names.append(country)
        out[col, :] = index[country]
    return out, names


# A national party is not a sample of anything, it is the whole of the thing,
# so no size floor applies: a group with one member from a country still gets a
# dial, because "how do you sit with the one Italian Green" is a real question
# about a real person and the panel's reader asked for it.
#
# The arithmetic still needs one other member present to have a balance at all.
# That has two consequences worth knowing rather than hiding: the sole member of
# a national party gets no dial for their *own* party - there is nobody to agree
# with - and gets nothing at all in this view, because the reference is that
# same party and there is no average of one to differ from.
MIN_CELL_TARGET_PEERS = 1
MIN_CELL_REFERENCE_PEERS = 1


def country_group_cells(group_index, country_index, group_names, country_names):
    """Bloc index per (MEP, vote) for each (country, political group) cell.

    The Italian ECR is a bloc in exactly the sense a group or a delegation is: a
    set of MEPs with a balance on a vote. Built in the shape `group_at_vote`
    returns so the same arithmetic runs over it unchanged, and named by the
    (country, group) pair rather than a string, because nothing downstream
    should have to parse a separator back apart.

    Cells whose group is Non-Attached are never built. The Non-Attached are not
    a bloc nationally for the same reason they are not one in the chamber.
    """
    n_groups = len(group_names)
    valid = (group_index >= 0) & (country_index >= 0)
    for gi, name in enumerate(group_names):
        if name in NOT_A_GROUP:
            valid &= group_index != gi
    combined = np.where(
        valid, country_index.astype(np.int32) * n_groups + group_index, -1
    )

    names = []
    out = np.full(combined.shape, -1, dtype=np.int16)
    for code in np.unique(combined):
        code = int(code)
        if code < 0:
            continue
        out[combined == code] = len(names)
        names.append(
            (country_names[code // n_groups], group_names[code % n_groups])
        )
    return out, names


def kept_for_view(counts, total_votes, is_subject, attendance=None):
    """The participation filter, matching what the published networks used.

    The subject rule is the two-door test in `config`: the old share threshold,
    or enough votes outright that also cover enough of the policy area. A
    subject's votes are lumpy - missing one sitting day can cost 30 points of
    share at a stroke - so the share test alone deletes people who plainly took
    part.

    `attendance` is the count the term's door is tested against, and it is not
    `counts`. Abstentions never enter the matrix, so `counts` answers "how much
    evidence of agreement is there" - while the door asks "were they in the
    room", which abstentions answer yes to. Reading turnout off the agreement
    count is what kept Assita KANKO out of term 10: 2,606 votes cast, 503 of
    them abstentions, leaving 2,103 against a bar of 2,123. `network.py` was
    given the separate count in "Count abstentions as attendance, not as
    agreement"; this file was not, so the map drew twelve MEPs the profile
    panel had no figures for. Passed only for the term, because that is the
    only view where the published networks use it - a per-subject abstention
    count does not exist, so the subject networks still test the matrix's own.

    NOTE: `network.py` still applies only the share test. The published networks
    were built with both doors (term 10's women's rights network has 696 MEPs,
    which is what both doors give and not the 619 the share test alone gives),
    so the code that built them is not the code now on disk. Reproduced here so
    this file agrees with what the site actually draws.

    The two constants are read defensively because they are newer than
    `config.py` on some checkouts; the fallbacks are the published values.
    """
    if not is_subject:
        seated = counts if attendance is None else attendance
        return np.flatnonzero(seated > total_votes * config.PARTICIPATION_THRESHOLD)
    min_votes = getattr(config, "MIN_SUBJECT_PARTICIPATION_VOTES", 30)
    min_share = getattr(config, "MIN_SUBJECT_PARTICIPATION_SHARE", 0.25)
    enough = counts >= min_votes
    share = counts >= total_votes * min_share
    return np.flatnonzero(
        (counts > total_votes * config.PARTICIPATION_THRESHOLD) | (enough & share)
    )


def deviations_for_view(matrix, rows, group_index, group_names, is_subject,
                        not_a_bloc=None, min_target_peers=None,
                        min_reference_peers=None, attendance=None):
    """Deviation from own bloc for every MEP in one view, matched per vote.

    `rows` are the matrix rows this view covers - a whole term, or one subject.
    Returns ({column index: (reference bloc, votes cast, votes used,
    {bloc: share}, {bloc: votes behind that share})},
    {reference bloc: {bloc: share}}, worst excess, dropped).

    The bloc is a political group by default. Pass a country membership matrix
    instead and the same arithmetic answers the national question, which is the
    same question: an MEP's agreement with their compatriots is inflated by
    attendance in exactly the way their agreement with their group is. The
    thresholds are parameters because a delegation is not a sample of a
    country - it *is* the country - so the floors that stop a group of four
    speaking for itself are the wrong ones for Malta's six.

    For each vote an MEP cast, their agreement index with a target group is
    their ballot set against that group's balance on that same vote, and the
    baseline is what their own group's other members present did with the same
    balance. Averaging the difference over votes is what cancels attendance: a
    consensual vote lifts everyone in the room equally and drops out.
    """
    not_a_bloc = NOT_A_GROUP if not_a_bloc is None else not_a_bloc
    min_target_peers = (MIN_TARGET_PEERS if min_target_peers is None
                        else min_target_peers)
    min_reference_peers = (MIN_REFERENCE_PEERS if min_reference_peers is None
                           else min_reference_peers)

    view = matrix[rows]
    counts = (view != 0).sum(axis=0)
    # Turnout decides who is in; the matrix decides what they are worth. See
    # `kept_for_view` - every figure below is still built from `counts` alone.
    kept = kept_for_view(counts, len(rows), is_subject, attendance)
    if kept.size < 2:
        return {}, {}, 0.0, 0

    votes = view[:, kept].astype(np.float32)
    present = votes != 0
    # (votes x kept MEPs): the group each MEP sat in on the day of each vote.
    here = np.where(present, group_index[np.ix_(kept, rows)].T, -1)
    n_votes, n_meps = votes.shape
    n_groups = len(group_names)

    # Per group, whether each MEP is a voting member of it at each vote.
    member = np.stack([(here == g) for g in range(n_groups)])  # groups x v x m
    strength = np.einsum("gvm,vm->gv", member, votes)          # sum of ballots
    size = member.sum(axis=2).astype(np.float32)               # members present

    targetable = np.array(
        [name not in not_a_bloc for name in group_names], dtype=bool
    )
    referenceable = targetable  # the Non-Attached are neither, see the docstring

    dev_sum = np.zeros((n_meps, n_groups), dtype=np.float64)
    dev_n = np.zeros((n_meps, n_groups), dtype=np.int64)
    used_any = np.zeros((n_votes, n_meps), dtype=bool)
    # Which reference group an MEP was in for the votes that actually counted.
    reference_votes = np.zeros((n_meps, n_groups), dtype=np.int64)

    # [reference group, target group]: what a whole group's agreement with the
    # target came to, over every vote its members sat. This is the level a
    # deviation is added back to, and it is what turns a difference into a
    # percentage the reader can hold on to. See `standardise` in the docstring.
    level_sum = np.zeros((n_groups, n_groups), dtype=np.float64)
    level_n = np.zeros((n_groups, n_groups), dtype=np.int64)

    # A reference group's own members are the baseline, so it must still have
    # MIN_REFERENCE_PEERS of them once the MEP being scored is taken out.
    here_safe = np.clip(here, 0, n_groups - 1)

    # One reference group per MEP, and only the votes they cast inside it.
    #
    # Groups are resolved per vote, so a member who crossed the floor is
    # measured against ALDE before the switch and against the Non-Attached
    # after. Averaging that gives a deviation from no group in particular -
    # which was tolerable while the figure was a difference centred on zero, and
    # is not once a group's own level is added back to it, because there is no
    # single level to add. The two halves would then be describing different
    # groups: on term 6, where the floor-crossing is heaviest, the sum strayed
    # 40 points outside [0, 1] before this restriction was in place.
    #
    # So the reference is the group an MEP sat in for most of the votes they
    # cast here, and the votes they cast elsewhere are dropped. A switcher is
    # measured over a shorter term, which is the honest reading: "how they
    # differed from ALDE, across the votes they cast as an ALDE member".
    modal = np.full(n_meps, -1, dtype=np.int64)
    for m in range(n_meps):
        seen = here[present[:, m], m]
        seen = seen[seen >= 0]
        if seen.size:
            candidate = int(np.bincount(seen).argmax())
            if referenceable[candidate]:
                modal[m] = candidate
    in_reference = (here == modal[None, :]) & (modal[None, :] >= 0)

    for g in np.flatnonzero(targetable):
        mine = member[g]                       # is this MEP in the target group
        # The target group's balance, always excluding the MEP being scored.
        peers = size[g][:, None] - mine
        with np.errstate(invalid="ignore", divide="ignore"):
            balance = np.where(
                peers >= min_target_peers,
                (strength[g][:, None] - np.where(mine, votes, 0.0)) / peers,
                np.nan,
            )
        own = votes * balance                  # agreement index in [-1, 1]
        valid = present & np.isfinite(own)
        own_filled = np.where(valid, own, 0.0)

        # What each *reference* group did, so an MEP can be set against the
        # peers who were in the room with them.
        ref_sum = np.einsum("rvm,vm->vr", member, own_filled)
        ref_n = np.einsum("rvm,vm->vr", member, valid.astype(np.float32))
        # Leave the MEP out of the group they are being compared with.
        base_sum = np.take_along_axis(ref_sum, here_safe, axis=1) - own_filled
        base_n = np.take_along_axis(ref_n, here_safe, axis=1) - valid

        usable = (
            valid
            & (base_n >= min_reference_peers)
            & referenceable[here_safe]
            & (here >= 0)
            & in_reference
        )
        with np.errstate(invalid="ignore", divide="ignore"):
            diff = own_filled - np.where(base_n > 0, base_sum / base_n, 0.0)
        dev_sum[:, g] = np.where(usable, diff, 0.0).sum(axis=0)
        dev_n[:, g] = usable.sum(axis=0)
        used_any |= usable

        # Each reference group's own agreement with this target, over exactly
        # the (vote, member) pairs that fed the deviations above. Taken from the
        # same `usable` mask on purpose: a level averaged over a wider set than
        # the deviations were measured on would not be the thing they are
        # differences from, and adding the two would not land anywhere real.
        # Summed with the same einsum the baseline above uses, rather than a
        # mask per reference bloc. The loop was fine for eight political groups
        # and quadratic in the count: pointed at 27 national delegations it
        # rebuilt a full (votes x MEPs) mask 729 times per view, and took the
        # step from seconds to minutes.
        counted = np.where(usable, own_filled, 0.0)
        level_sum[:, g] = np.einsum("rvm,vm->r", member, counted)
        level_n[:, g] = np.einsum(
            "rvm,vm->r", member, usable.astype(np.float32)
        ).astype(np.int64)

    for g in np.flatnonzero(targetable):
        reference_votes[:, g] = (used_any & (here == g)).sum(axis=0)

    votes_used = used_any.sum(axis=0)

    with np.errstate(invalid="ignore", divide="ignore"):
        level_index = np.where(level_n > 0, level_sum / np.maximum(level_n, 1), np.nan)

    levels = {
        group_names[r]: {
            group_names[g]: round(float(normalise(level_index[r, g])), 4)
            for g in np.flatnonzero(targetable)
            if level_n[r, g] > 0
        }
        for r in np.flatnonzero(referenceable)
        if level_n[r].any()
    }

    out = {}
    # A deviation is a difference and a level is a rate, so their sum carries no
    # guarantee of landing in [0, 1], and how far outside it lands says which of
    # two very different things has happened.
    #
    # A point or two over is a ceiling effect: an MEP marginally more loyal than
    # their peers, in a group already sitting at 99%, adds up past 100. The
    # figure is sound and the range is the artefact, so it is clamped.
    #
    # Tens of points over is not that. It means the MEP's votes and their
    # group's votes were not the same body of votes, so the difference and the
    # level are answers about different things and adding them produces a number
    # about nothing. Term 6 is where this shows: ITS existed for ten months of
    # the five-year term, so on a small policy area an MEP's handful of votes
    # inside that window and their whole group's votes inside it can barely
    # overlap. Seventeen figures across the term, every one of them against ITS.
    # Those are dropped rather than clamped - a clamped 100% would read as
    # perfect agreement where the honest answer is that it cannot be measured.
    excess = 0.0
    dropped = 0
    for mep in np.flatnonzero(votes_used >= MIN_VOTES):
        usable = dev_n[mep] > 0
        if not usable.any():
            continue
        columns = np.flatnonzero(usable)
        diff_index = dev_sum[mep, usable] / dev_n[mep, usable]
        # Guaranteed to be the group every counted vote was cast inside, so the
        # level added below is the level of the very same votes.
        reference_index = int(modal[mep])
        if reference_index < 0:
            continue
        reference = group_names[reference_index]
        # The MEP's own group's level is the ground this deviation stands on.
        # Where the group never met a target often enough to have one, the
        # deviation has nothing to be added to and the column is dropped rather
        # than published against an assumed level.
        base = level_index[reference_index, usable]
        agreement = normalise(diff_index + base)

        values, sample = {}, {}
        for g, a in zip(columns, agreement):
            if not np.isfinite(a):
                continue
            if a > 1 + CEILING_TOLERANCE or a < -CEILING_TOLERANCE:
                dropped += 1
                continue
            excess = max(excess, float(a) - 1, float(-a))
            values[group_names[g]] = round(float(min(max(a, 0.0), 1.0)), 4)
            # The votes this one figure rests on, which is not the view's
            # `used`: that counts any bloc the MEP could be compared against,
            # and a national party is a much shorter run of votes than the
            # chamber is. A dial captioned with the wrong one is a true number
            # that misleads.
            sample[group_names[g]] = int(dev_n[mep, g])
        if not values:
            continue

        out[int(kept[mep])] = (
            reference,
            int(counts[kept[mep]]),
            int(votes_used[mep]),
            values,
            sample,
        )
    return out, levels, excess, dropped


def build_payload(mandate, subjects, per_view, per_view_levels, node_groups,
                  targets, national=None, national_levels=None,
                  national_groups=None, national_group_levels=None):
    """One file per term, shaped like `participation.py`'s."""
    subject_index = {name: i for i, name in enumerate(subjects)}

    def row(values):
        return [values.get(g) for g in targets]

    meps = {}
    for view, results in per_view.items():
        for mep_id, (reference, votes, used, values, _) in results.items():
            entry = meps.setdefault(
                mep_id,
                {"group": reference, "labelGroup": node_groups.get(mep_id),
                 "all": None, "bySubject": {}},
            )
            block = {"agr": row(values), "votes": votes, "used": used}
            if view is None:
                entry["all"] = block
                entry["group"] = reference
            else:
                entry["bySubject"][str(subject_index[view])] = block

    # An MEP's own delegation, on the same footing. Written onto the same blocks
    # so a reader of this file finds the two figures the panel pairs in the same
    # place, rather than having to join two tables to put them side by side.
    for view, by_mep in (national or {}).items():
        key = "all" if view is None else str(subject_index[view])
        for mep_id, (country, share) in by_mep.items():
            entry = meps.get(mep_id)
            if entry is None:
                continue
            block = entry["all"] if key == "all" else entry["bySubject"].get(key)
            if block is not None:
                block["nat"] = share
                entry["country"] = country

    # And the same MEP against each political group *of their own country*.
    # `natgrp` is aligned to `groups` exactly as `agr` is, so a reader holds one
    # ordering for the whole file; `natgrpN` is the votes behind each figure,
    # which is not the block's `used` and is usually far smaller.
    for view, by_mep in (national_groups or {}).items():
        key = "all" if view is None else str(subject_index[view])
        for mep_id, (country, reference, values, sample) in by_mep.items():
            entry = meps.get(mep_id)
            if entry is None:
                continue
            block = entry["all"] if key == "all" else entry["bySubject"].get(key)
            if block is None:
                continue
            block["natgrp"] = row(values)
            block["natgrpN"] = [sample.get(g) for g in targets]
            # Which row of nationalGroupLevels[view][country] these are to be
            # read against; see the note where this is built.
            block["natgrpRef"] = reference
            entry["country"] = country

    # The level each group itself sat at, per view. The panel draws these as the
    # baseline notch, so a reader sees where the MEP is *and* where their group
    # is on the same dial, and the gap between them is the deviation. Held once
    # per view rather than copied onto every MEP: a group's level is a property
    # of the group, and repeating it 700 times would invite the two to drift.
    levels = {
        ("all" if view is None else str(subject_index[view])): {
            reference: row(values) for reference, values in by_reference.items()
        }
        for view, by_reference in per_view_levels.items()
        if by_reference
    }

    return {
        "mandate": mandate,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        # Named in the file because the reader has no other way to know the
        # figure is normalised rather than a plain rate, or what it is
        # normalised against.
        "unit": "share of votes agreeing, normalised to the votes the MEP's "
                "own group cast",
        "groups": targets,
        "subjects": subjects,
        "minVotes": MIN_VOTES,
        "levels": levels,
        # Each delegation's own internal level, per view: the notch the national
        # dial is read against, exactly as `levels` is for the group dials.
        # The notch under each national-group dial: what a member of this
        # reference group typically manages with that group of that country,
        # over the same votes the deviations were measured on. Keyed
        # view -> country -> reference group, and each value is a row aligned
        # to `groups`, so the panel indexes it the same way it indexes `agr`.
        "nationalGroupLevels": {
            ("all" if view is None else str(subject_index[view])): {
                country: {
                    reference: row(values)
                    for reference, values in by_reference.items()
                }
                for country, by_reference in by_country.items()
            }
            for view, by_country in (national_group_levels or {}).items()
            if by_country
        },
        "nationalLevels": {
            ("all" if view is None else str(subject_index[view])): values
            for view, values in (national_levels or {}).items()
            if values
        },
        # How many MEPs got a figure in each policy area. A zero is the panel's
        # only way to tell "this area is too thin to measure anyone" from "you
        # were not there for enough of it", and the two need different words.
        "subjectCoverage": {
            str(i): sum(1 for m in meps.values() if str(i) in m["bySubject"])
            for i in range(len(subjects))
        },
        "meps": {k: v for k, v in sorted(meps.items()) if v["all"] or v["bySubject"]},
    }


def run(report, mandates=None, meps=None):
    report.step("Step 4c: deviation from own group")
    mandates = mandates or config.MANDATE_ORDER
    if meps is None:
        from .network import load_meps
        meps = load_meps()
    PRECOMPUTED.mkdir(parents=True, exist_ok=True)

    for mandate in mandates:
        builder, matrix, dates, titles = load_mandate(mandate)
        group_index, group_names = group_at_vote(builder.mep_ids, dates, meps)
        report.fact(f"mandate {mandate}: voting sessions", len(builder.vote_ids))

        resolved = float((group_index >= 0).mean())
        report.check(
            f"mandate {mandate}: most (MEP, vote) pairs resolve to a group",
            resolved > 0.85,
            f"only {resolved:.1%} resolve - group spans may not cover this term",
            fatal=False,
        )


        # Only groups that actually sat in this term get a column; see
        # MIN_GROUP_MEMBERS.
        sizes = {
            name: int((group_index == gi).any(axis=1).sum())
            for gi, name in enumerate(group_names)
        }
        targets = sorted(
            name for name, n in sizes.items()
            if name not in NOT_A_GROUP and n >= MIN_GROUP_MEMBERS
        )
        report.fact(f"mandate {mandate}: political groups", ", ".join(targets))

        subjects = sorted(set(builder.subject_of_row))
        subject_rows = defaultdict(list)
        for row, subject in enumerate(builder.subject_of_row):
            subject_rows[subject].append(row)

        # Turnout, which is what the term's participation door is tested
        # against - see `kept_for_view`. Read defensively because it is newer
        # than `network.py` on some checkouts; without it this falls back to
        # the matrix's own counts, which is the behaviour that predates it.
        seated = getattr(builder, "attendance_counts", None)

        per_view, per_view_levels = {}, {}
        per_view[None], per_view_levels[None], worst_excess, dropped_cells = (
            deviations_for_view(
            matrix, list(range(len(builder.vote_ids))), group_index,
            group_names, is_subject=False,
            attendance=seated,
            )
        )
        report.fact(f"mandate {mandate}: MEPs with a term deviation",
                    len(per_view[None]))

        for subject in subjects:
            rows = subject_rows[subject]
            if len(rows) < config.MIN_SUBJECT_VOTES:
                continue
            result, view_levels, view_excess, view_dropped = deviations_for_view(
                matrix, rows, group_index, group_names, is_subject=True,
            )
            dropped_cells += view_dropped
            if result:
                per_view[subject] = result
                per_view_levels[subject] = view_levels
                worst_excess = max(worst_excess, view_excess)

        # The national question, answered with the same arithmetic. Agreement
        # with one's compatriots is inflated by attendance exactly as agreement
        # with one's group is, and the panel now shows the two side by side, so
        # one of them being normalised and the other not would put two figures
        # that mean different things on adjacent dials.
        country_index, country_names = country_of_mep(
            builder.mep_ids, len(builder.vote_ids), meps
        )
        views = [(None, list(range(len(builder.vote_ids))))] + [
            (s, subject_rows[s]) for s in subjects
            if len(subject_rows[s]) >= config.MIN_SUBJECT_VOTES
        ]
        national, national_levels = {}, {}
        for view, view_rows in views:
            result, levels_here, _, _ = deviations_for_view(
                matrix, view_rows, country_index, country_names,
                is_subject=view is not None,
                not_a_bloc=set(),
                min_target_peers=MIN_COUNTRY_TARGET_PEERS,
                min_reference_peers=MIN_COUNTRY_REFERENCE_PEERS,
                attendance=None if view is not None else seated,
            )
            if not result:
                continue
            # Only an MEP's own delegation is wanted. The pass computes every
            # country because that is what the shared routine does, but
            # "agreement with Denmark" for a Spaniard is not a figure the site
            # has any use for.
            national[view] = {
                builder.mep_ids[column]: (own, values[own])
                for column, (own, _, _, values, _sample) in result.items()
                if own in values
            }
            national_levels[view] = {
                country: values.get(country)
                for country, values in levels_here.items()
                if values.get(country) is not None
            }

        # The same question one step finer: not "how do you sit with your
        # compatriots" but "how do you sit with each *group* of your
        # compatriots". Both the targets and the reference are (country, group)
        # cells, so an Italian ECR member is measured against the *Italian* ECR
        # and not against ECR at large - which is what a reader who has opened
        # the Italy network is asking, and the only reference that answers it.
        #
        # That choice makes the whole pass decompose by country: an MEP's
        # reference peers and every target kept for them are compatriots, so
        # nothing crosses a border and each country can be run on its own
        # columns. Which is also what makes it cheap - one call over Italy's 76
        # MEPs and its handful of cells, rather than one over 700 MEPs and
        # every cell in the Union.
        cell_index, cell_names = country_group_cells(
            group_index, country_index, group_names, country_names
        )
        report.fact(f"mandate {mandate}: national group cells", len(cell_names))

        columns_by_country = defaultdict(list)
        for col in range(len(builder.mep_ids)):
            place = int(country_index[col, 0])
            if place >= 0:
                columns_by_country[country_names[place]].append(col)

        national_groups, national_group_levels = {}, {}
        cell_dropped, cell_published = 0, 0
        for country, columns in sorted(columns_by_country.items()):
            columns = np.array(columns)
            # This country's own slice of the matrix and of the cell index. The
            # participation filter inside is per MEP against the view's own
            # vote count, so narrowing the columns does not change who passes
            # it - only how much work the pass does.
            sub_matrix = matrix[:, columns]
            sub_cells = cell_index[columns]
            keep = sorted({
                int(c) for c in np.unique(sub_cells) if c >= 0
            })
            if len(keep) < 2:
                # One party, or none: there is nothing to sit beside.
                continue
            remap = {old: new for new, old in enumerate(keep)}
            local_index = np.full(sub_cells.shape, -1, dtype=np.int16)
            for old, new in remap.items():
                local_index[sub_cells == old] = new
            local_names = [cell_names[old][1] for old in keep]

            for view, view_rows in views:
                result, levels_here, _, view_dropped = deviations_for_view(
                    sub_matrix, view_rows, local_index, local_names,
                    is_subject=view is not None,
                    not_a_bloc=set(),
                    min_target_peers=MIN_CELL_TARGET_PEERS,
                    min_reference_peers=MIN_CELL_REFERENCE_PEERS,
                    # Sliced with the columns, since this pass runs on one
                    # country's MEPs rather than on the whole House.
                    attendance=(None if view is not None or seated is None
                                else seated[columns]),
                )
                cell_dropped += view_dropped
                if not result:
                    continue

                # `used` from the view counts votes usable against any of this
                # country's cells, so it says nothing about the sample under
                # one dial. The per-cell count does, and a cell below MIN_VOTES
                # is dropped for the same reason that floor exists at all.
                by_mep = national_groups.setdefault(view, {})
                for column, (reference, _, _, values, sample) in result.items():
                    mep_id = builder.mep_ids[int(columns[column])]
                    mine = {
                        group: share
                        for group, share in values.items()
                        if sample[group] >= MIN_VOTES
                    }
                    if not mine:
                        continue
                    # The reference travels with the block rather than being
                    # inferred from the MEP's term-wide group later. They are
                    # not always the same: a member who crossed the floor is
                    # measured against whichever national party they sat in for
                    # most of *this view's* votes, so on one policy area their
                    # notch is a row the term-wide group does not name. Reading
                    # the wrong row silently loses the notch - 144 figures
                    # across terms 7 to 9 did exactly that.
                    by_mep[mep_id] = (
                        country,
                        reference,
                        mine,
                        {group: sample[group] for group in mine},
                    )
                    cell_published += len(mine)
                if not by_mep:
                    national_groups.pop(view, None)

                # The notch under each dial: what a typical member of the
                # reader's own national party manages with that other national
                # party. Keyed view -> country -> the MEP's own group, which is
                # how the panel reaches for it.
                if levels_here:
                    national_group_levels.setdefault(view, {})[country] = {
                        reference: dict(cells)
                        for reference, cells in levels_here.items()
                    }

        node_groups = {}
        for mep_id in builder.mep_ids:
            mep = meps.get(mep_id)
            if not mep:
                continue
            spans = [s for s in mep["Groups"] if s.get("groupid")]
            if spans:
                last = sorted(spans, key=lambda s: str(s.get("end") or "9999"))[-1]
                node_groups[mep_id] = map_group_id(last.get("groupid"))

        payload = build_payload(
            mandate, subjects,
            {k: {builder.mep_ids[c]: v for c, v in res.items()}
             for k, res in per_view.items()},
            per_view_levels, node_groups, targets,
            national, national_levels,
            national_groups, national_group_levels,
        )

        # A column nobody has a figure for renders as an empty dial, which reads
        # as "no agreement" rather than "not measured".
        empty = [
            g for i, g in enumerate(payload["groups"])
            if not any(
                block["agr"][i] is not None
                for m in payload["meps"].values()
                for block in [m["all"]] + list(m["bySubject"].values())
                if block
            )
        ]
        report.check(
            f"mandate {mandate}: every published group column has data",
            not empty,
            f"no MEP has a figure for {empty}",
            fatal=False,
        )

        published = payload["meps"]
        report.fact(f"mandate {mandate}: MEPs with any deviation", len(published))
        report.check(
            f"mandate {mandate}: deviations were produced",
            len(published) > 50,
            f"only {len(published)} MEPs got a figure",
        )

        # The published figure is a level now, so the property worth checking is
        # what it is a level *of*: subtract the group's own line back off and
        # the remainder must still be the small, centred deviation this file has
        # always produced. A large median here would mean the level and the
        # deviation had been added on different footings.
        deviations_pp = []
        for entry in published.values():
            blocks = [("all", entry["all"])] + list(entry["bySubject"].items())
            for view, block in blocks:
                base = payload["levels"].get(view, {}).get(entry["group"])
                if not block or not base:
                    continue
                for value, line in zip(block["agr"], base):
                    if value is not None and line is not None:
                        deviations_pp.append((value - line) * 100)
        median = float(np.median(np.abs(deviations_pp))) if deviations_pp else 0.0
        report.fact(f"mandate {mandate}: median |deviation|", f"{median:.2f} pp")
        report.check(
            f"mandate {mandate}: deviations are centred on the peer group",
            median < 5.0,
            f"median |deviation| is {median:.2f} pp, which suggests the "
            f"baseline is not the MEP's own group",
            fatal=False,
        )

        # Cells where the deviation and the level turned out not to describe the
        # same body of votes; see `deviations_for_view`. A handful is the
        # short-lived-group case and is expected. A flood would mean the two are
        # routinely mismatched, and the measure itself would be in question.
        published_cells = sum(
            1
            for m in published.values()
            for block in [m["all"]] + list(m["bySubject"].values())
            if block
            for v in block["agr"]
            if v is not None
        )
        share_dropped = dropped_cells / max(published_cells + dropped_cells, 1)
        report.fact(f"mandate {mandate}: figures dropped as unmatched",
                    f"{dropped_cells} of {published_cells + dropped_cells} "
                    f"({share_dropped:.2%})")
        report.fact(f"mandate {mandate}: worst kept excess past [0, 1]",
                    f"{worst_excess * 100:.1f} pp")
        report.check(
            f"mandate {mandate}: the level and the deviation share a footing",
            share_dropped < 0.01,
            f"{share_dropped:.1%} of figures had to be dropped, so the level and "
            f"the deviation are not describing the same votes",
        )

        # The national-group view, held to the same standard. Its deviations
        # are differences from the MEP's *own national party's* footing with
        # another national party, so subtracting that footing back off must
        # leave the same small centred number the group view leaves - if it
        # does not, the level and the deviation are standing on different votes
        # and their sum is about nothing.
        #
        # Counted off the payload rather than off the loop that produced it,
        # because the two do not agree and the gap is itself worth reporting:
        # the national-group pass measures an MEP inside their own country,
        # while a block to hang the figures on only exists if the chamber pass
        # also measured them. A member who sat Non-Attached for most of the
        # term has a national party for the rest and no chamber reference at
        # all, so their figures are computed and then have nowhere to go.
        national_pp = []
        written = notchless = 0
        for entry in published.values():
            country = entry.get("country")
            blocks = [("all", entry["all"])] + list(entry["bySubject"].items())
            for view, block in blocks:
                if not block or block.get("natgrp") is None:
                    continue
                base = (payload["nationalGroupLevels"].get(view, {})
                        .get(country or "", {}).get(block.get("natgrpRef")))
                for index, value in enumerate(block["natgrp"]):
                    if value is None:
                        continue
                    written += 1
                    line = base[index] if base else None
                    if line is None:
                        notchless += 1
                    else:
                        national_pp.append((value - line) * 100)
        national_median = (
            float(np.median(np.abs(national_pp))) if national_pp else 0.0
        )
        report.fact(f"mandate {mandate}: national-group figures published", written)
        report.fact(f"mandate {mandate}: national-group figures with no block to "
                    f"write to", cell_published - written)
        report.fact(f"mandate {mandate}: median |national-group deviation|",
                    f"{national_median:.2f} pp")
        report.check(
            f"mandate {mandate}: national-group figures were produced",
            written > 100,
            f"only {written} national-group figures across every view",
        )
        report.check(
            f"mandate {mandate}: national-group deviations are centred",
            national_median < 8.0,
            f"median |deviation| is {national_median:.2f} pp against the "
            f"reference group's own footing with the same national cell",
            fatal=False,
        )
        # Exactly, not nearly. A figure without a notch is a dial the panel
        # draws with no baseline to read it against, and letting a few through
        # is how the reference-row mismatch hid: at a 95% bar, 144 silently
        # notchless figures across terms 7 to 9 still passed.
        report.check(
            f"mandate {mandate}: every published national-group figure has a notch",
            notchless == 0,
            f"{notchless} of {written} published figures have no level to be "
            f"read against",
        )
        share_cell_dropped = cell_dropped / max(cell_published + cell_dropped, 1)
        report.fact(f"mandate {mandate}: national-group figures dropped as unmatched",
                    f"{cell_dropped} ({share_cell_dropped:.2%})")

        out = PRECOMPUTED / f"mep_deviations_{mandate}.json"
        atomic_write_json(out, payload)
        report.fact(f"mandate {mandate}: written",
                    f"{out.name} ({out.stat().st_size / 1024:.0f} KB)")

    report.end_step()


def main(argv=None):
    """Runnable on its own: `python -m pipeline.deviations --mandates 10`.

    Kept separate from `pipeline.run` on purpose - this reads `data/final` and
    writes one new side file per term, touching nothing the other stages own,
    so it can be re-run without a network rebuild behind it.
    """
    import argparse

    from .network import load_meps
    from .report import Report

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--mandates", help="comma separated, e.g. 10 (default: all)")
    args = parser.parse_args(argv)
    mandates = (
        [m.strip() for m in args.mandates.split(",") if m.strip()]
        if args.mandates
        else config.MANDATE_ORDER
    )

    report = Report("deviations")
    run(report, mandates, meps=load_meps())
    report.write()
    report.print_summary()
    return 1 if report.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
