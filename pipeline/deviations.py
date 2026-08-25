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
                            over the same debates, weighted the same way

A debate is one document code (`A10-0210/2025`), which is how the Parliament
votes: a report arrives as a block of amendments taken together. Scoring inside
a debate and only then averaging is what makes the measure attendance-proof - a
consensual debate lifts everyone present by the same amount, so it cancels.
Across those 41 MEPs it collapses the spread from 16.1 points to 3.3.

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

* **A pair needs `MIN_PAIR_VOTES` shared votes inside a debate to count.** One
  shared vote yields an index of exactly +1 or -1 - noise that would otherwise
  carry the same weight as a fifty-vote block.

* **Two debates minimum.** A deviation resting on one debate is that debate's
  quirk, and this measure exists precisely because one debate is not a policy
  area.

Output shape, mirroring `participation.py`: names are held once and each MEP's
row is an array aligned to `groups`, null where a pair was too thin.

    {"mandate": "10",
     "groups": ["ECR", "ESN", ...],
     "subjects": ["Agriculture and Rural Development", ...],
     "meps": {"M257063": {"group": "GUE/NGL", "labelGroup": "GUE/NGL",
                          "all": {"dev": [...], "votes": 3228, "debates": 312},
                          "bySubject": {"16": {"dev": [...], "votes": 96,
                                               "debates": 2}}}}}
"""

import re
from collections import defaultdict
from datetime import datetime, timezone

import numpy as np

from . import config
from .jsonstream import iter_json_array
from .network import VoteMatrix, map_group_id
from .report import atomic_write_json

PRECOMPUTED = config.WEB_DATA_DIR / "precomputed"

# Shared votes a pair needs inside one debate before that debate speaks for the
# pair. Below this the index is a coin flip dressed as a measurement.
MIN_PAIR_VOTES = 10

# Votes an MEP needs inside a debate before they count as having attended it.
MIN_DEBATE_VOTES = 10

# Members a reference group needs present in a debate before "what my group did"
# means anything. Counted after the leave-one-out, so this many peers remain.
MIN_REFERENCE_PEERS = 4

# Debates an MEP needs in a view before any deviation is published for it.
MIN_DEBATES = 2

# Members a group needs in a term to get a column. The MEP dump carries every
# group each MEP ever sat in, across every term, so without this a term-10 file
# grows columns for ALDE, PSE, UEN and seven other groups that ended before it
# began - all of them empty, and all of them rendered as an empty dial.
MIN_GROUP_MEMBERS = 5

# The Non-Attached are not a bloc; see the module docstring.
NOT_A_GROUP = {"NonAttached", "NI"}

# "A10-0210/2025", "B10-0406/2025", "C10-0001/2024" - the document a block of
# amendment votes belongs to. 97.6% of term 10's vote titles carry one.
DOC_CODE = re.compile(r"([ABC]\s?[0-9]{1,2}[–\-][0-9]{4}/[0-9]{4})")


def debate_key(title, date):
    """The debate a vote belongs to.

    Falls back to the sitting day plus the head of the title, which keeps
    procedural votes ("Tuesday's agenda - Request by the PfE Group") and budget
    line items from collapsing into one giant pseudo-debate.
    """
    match = DOC_CODE.search(title or "")
    if match:
        return match.group(1).replace("–", "-").replace(" ", "")
    return f"{date}:{(title or '')[:28]}"


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


def kept_for_view(counts, total_votes, is_subject):
    """The participation filter, matching what the published networks used.

    The subject rule is the two-door test in `config`: the old share threshold,
    or enough votes outright that also cover enough of the policy area. A
    subject's votes are lumpy - missing one sitting day can cost 30 points of
    share at a stroke - so the share test alone deletes people who plainly took
    part.

    NOTE: `network.py` still applies only the share test. The published networks
    were built with both doors (term 10's women's rights network has 696 MEPs,
    which is what both doors give and not the 619 the share test alone gives),
    so the code that built them is not the code now on disk. Reproduced here so
    this file agrees with what the site actually draws.

    The two constants are read defensively because they are newer than
    `config.py` on some checkouts; the fallbacks are the published values.
    """
    if not is_subject:
        return np.flatnonzero(counts > total_votes * config.PARTICIPATION_THRESHOLD)
    min_votes = getattr(config, "MIN_SUBJECT_PARTICIPATION_VOTES", 30)
    min_share = getattr(config, "MIN_SUBJECT_PARTICIPATION_SHARE", 0.25)
    enough = counts >= min_votes
    share = counts >= total_votes * min_share
    return np.flatnonzero(
        (counts > total_votes * config.PARTICIPATION_THRESHOLD) | (enough & share)
    )


def deviations_for_view(matrix, rows, group_index, group_names, debate_of_row,
                        is_subject):
    """Deviation from own group for every MEP in one view.

    `rows` are the matrix rows this view covers - a whole term, or one subject.
    Returns {column index: (reference group, votes, debates, {group: points})}.
    """
    view = matrix[rows]
    counts = (view != 0).sum(axis=0)
    kept = kept_for_view(counts, len(rows), is_subject)
    if kept.size < 2:
        return {}

    sub = view[:, kept].astype(np.float32)
    # (votes x kept MEPs), so a row is "who was in which group on that day".
    groups_here = group_index[np.ix_(kept, rows)].T
    n_meps = sub.shape[1]
    n_groups = len(group_names)
    targetable = np.array(
        [name not in NOT_A_GROUP for name in group_names], dtype=bool
    )

    debates = defaultdict(list)
    for local, row in enumerate(rows):
        debates[debate_of_row[row]].append(local)

    own_sum = np.zeros((n_meps, n_groups))
    own_weight = np.zeros((n_meps, n_groups))
    base_sum = np.zeros((n_meps, n_groups))
    base_weight = np.zeros((n_meps, n_groups))
    debates_used = np.zeros(n_meps, dtype=np.int64)
    reference_votes = np.zeros((n_meps, n_groups))

    for local_rows in debates.values():
        block = sub[local_rows]
        cast = block != 0
        in_debate = cast.sum(axis=0)
        attended = in_debate >= MIN_DEBATE_VOTES
        if attended.sum() < 2:
            continue

        shared = cast.astype(np.float32).T @ cast.astype(np.float32)
        agreed = block.T @ block
        with np.errstate(invalid="ignore", divide="ignore"):
            ratio = np.where(shared >= MIN_PAIR_VOTES, agreed / shared, np.nan)
        # A pair of one is not a pair: an MEP agrees with themselves by
        # construction and must not be in their own group's average.
        np.fill_diagonal(ratio, np.nan)

        # Group membership is read at the top of the debate - one sitting day,
        # so it cannot change inside it.
        here = groups_here[local_rows[0]]
        indicator = np.zeros((n_meps, n_groups), dtype=np.float32)
        valid_member = (here >= 0) & attended
        indicator[np.flatnonzero(valid_member), here[valid_member]] = 1.0

        finite = np.isfinite(ratio)
        filled = np.where(finite, ratio, 0.0).astype(np.float32)
        # Mean agreement with each group, for every MEP at once.
        agree_sum = filled @ indicator
        agree_count = finite.astype(np.float32) @ indicator
        with np.errstate(invalid="ignore", divide="ignore"):
            agree = np.where(agree_count > 0, agree_sum / agree_count, np.nan)

        # What each *reference* group did with each target group, so an MEP can
        # be set against the peers who were in the room with them.
        agree_finite = np.isfinite(agree)
        agree_filled = np.where(agree_finite, agree, 0.0)
        peer_sum = indicator.T @ agree_filled
        peer_count = indicator.T @ agree_finite.astype(np.float32)

        reference = np.where(valid_member, here, -1)
        weight = np.where(attended, in_debate, 0).astype(np.float64)
        for mep in np.flatnonzero(attended & (reference >= 0)):
            ref = reference[mep]
            if group_names[ref] in NOT_A_GROUP:
                continue
            # Leave the MEP out of the group they are being compared with.
            mine = agree_finite[mep]
            peers_total = peer_sum[ref] - np.where(mine, agree_filled[mep], 0.0)
            peers_n = peer_count[ref] - mine.astype(np.float32)
            usable = targetable & (peers_n >= MIN_REFERENCE_PEERS) & mine
            if not usable.any():
                continue
            w = weight[mep]
            own_sum[mep, usable] += w * agree[mep, usable]
            own_weight[mep, usable] += w
            base_sum[mep, usable] += w * (peers_total[usable] / peers_n[usable])
            base_weight[mep, usable] += w
            reference_votes[mep, ref] += w
            debates_used[mep] += 1

    out = {}
    for mep in np.flatnonzero(debates_used >= MIN_DEBATES):
        usable = (own_weight[mep] > 0) & (base_weight[mep] > 0)
        if not usable.any():
            continue
        own = own_sum[mep, usable] / own_weight[mep, usable]
        base = base_sum[mep, usable] / base_weight[mep, usable]
        # The index runs [-1, 1] and the site shows [0, 1], so a difference of
        # d in the index is d/2 of the scale the reader sees.
        points = (own - base) / 2 * 100
        reference = group_names[int(reference_votes[mep].argmax())]
        out[int(kept[mep])] = (
            reference,
            int(counts[kept[mep]]),
            int(debates_used[mep]),
            {group_names[g]: round(float(p), 2)
             for g, p in zip(np.flatnonzero(usable), points)},
        )
    return out


def build_payload(mandate, subjects, per_view, node_groups, targets):
    """One file per term, shaped like `participation.py`'s."""
    subject_index = {name: i for i, name in enumerate(subjects)}

    def row(values):
        return [values.get(g) for g in targets]

    meps = {}
    for view, results in per_view.items():
        for mep_id, (reference, votes, debates, values) in results.items():
            entry = meps.setdefault(
                mep_id,
                {"group": reference, "labelGroup": node_groups.get(mep_id),
                 "all": None, "bySubject": {}},
            )
            block = {"dev": row(values), "votes": votes, "debates": debates}
            if view is None:
                entry["all"] = block
                entry["group"] = reference
            else:
                entry["bySubject"][str(subject_index[view])] = block

    return {
        "mandate": mandate,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        # Named in the file because the reader has no other way to know the
        # measure is relative, or which way is which.
        "unit": "percentage points vs the MEP's own group over the same debates",
        "groups": targets,
        "subjects": subjects,
        "minDebates": MIN_DEBATES,
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

        debate_of_row = [debate_key(t, d) for t, d in zip(titles, dates)]
        report.fact(f"mandate {mandate}: debates", len(set(debate_of_row)))

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

        per_view = {}
        per_view[None] = deviations_for_view(
            matrix, list(range(len(builder.vote_ids))), group_index, group_names,
            debate_of_row, is_subject=False,
        )
        report.fact(f"mandate {mandate}: MEPs with a term deviation",
                    len(per_view[None]))

        for subject in subjects:
            rows = subject_rows[subject]
            if len(rows) < config.MIN_SUBJECT_VOTES:
                continue
            result = deviations_for_view(
                matrix, rows, group_index, group_names, debate_of_row,
                is_subject=True,
            )
            if result:
                per_view[subject] = result

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
            node_groups, targets,
        )

        # A column nobody has a figure for renders as an empty dial, which reads
        # as "no agreement" rather than "not measured".
        empty = [
            g for i, g in enumerate(payload["groups"])
            if not any(
                block["dev"][i] is not None
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

        # The whole point is that this measure is small and centred. A large
        # median would mean the baseline is not the peer group it claims to be.
        values = [v for m in published.values()
                  for block in [m["all"]] + list(m["bySubject"].values())
                  if block for v in block["dev"] if v is not None]
        median = float(np.median(np.abs(values))) if values else 0.0
        report.fact(f"mandate {mandate}: median |deviation|", f"{median:.2f} pp")
        report.check(
            f"mandate {mandate}: deviations are centred on the peer group",
            median < 5.0,
            f"median |deviation| is {median:.2f} pp, which suggests the "
            f"baseline is not the MEP's own group",
            fatal=False,
        )

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
