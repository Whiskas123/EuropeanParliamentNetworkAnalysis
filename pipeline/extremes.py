"""The MEPs each member agrees with least, which the published network cannot say.

The sidebar has always been able to name an MEP's five closest counterparts: it
reads them straight from the edges the browser already holds. It has never been
able to name the five furthest, and the reason is not an oversight in the panel
but a property of the file it reads from.

The published layouts carry only pairs above 0.6 agreement, because a network
drawn with every pair is unreadable and slow. Term 10 ships 135,776 of a
possible 241,860, and the cut is not neutral with respect to this question - it
keeps every one of an MEP's agreements and discards every one of their
disagreements. The MEP with the fewest surviving ties has 68 of a possible 695.
Sorting that ascending does not produce a disagreement list; it produces the
weakest of the strong ties, which would be a worse answer than none.

The aggregate figures on the page are unaffected and always have been -
`agreementScores` and `cohesionData` are computed over every pair at precompute
time, which is why the sidebar can report The Left against ESN at 16%. It is
specifically the per-MEP pair ranking that the cut removes, and specifically
only in one direction.

So this step recomputes the complete pairwise agreement from the votes, takes
each MEP's five furthest counterparts, and writes them into the precomputed file
the view already downloads. Nothing new is fetched by the browser and no layout
is touched: positions, edges and every existing field are left exactly as they
were.

Only the term-wide and policy-area views are covered. The country and
country-by-policy-area combinations are the bulk of the 3,337 precomputed files
and the panel falls back to naming only the closest five there, which is what it
did everywhere until now.
"""

import json
import re
from collections import defaultdict

import numpy as np

from . import config
from .deviations import load_mandate
from .network import normalise
from .report import atomic_write_json

PRECOMPUTED = config.WEB_DATA_DIR / "precomputed"

# How many counterparts to name at each end. Five is what the panel has always
# shown at the top, and the two directions share one control, so they share a
# length.
HOW_MANY = 5


def view_filename(mandate, subject=None):
    """The precomputed file a view lives in.

    The subject part is the name with every run of non-word characters replaced
    by an underscore, which is what `precompute-layouts.js` does. Reproduced
    rather than shared because the two runtimes cannot import from each other,
    and verified against the files on disk by `run` below.
    """
    if subject is None:
        return PRECOMPUTED / f"mandate_{mandate}.json"
    slug = re.sub(r"\W", "_", subject)
    return PRECOMPUTED / f"mandate_{mandate}_subject_{slug}.json"


def extremes_for_view(matrix, rows, mep_ids, is_subject):
    """Each MEP's `HOW_MANY` furthest counterparts in one view.

    Returns {mep id: [(other id, share), ...]}, weakest first. The pairing and
    the participation filter are `network.edges_from_matrix`'s, so the figures
    here are the same ones the site already prints - only the end of the ranking
    differs.
    """
    view = matrix[rows]
    active = np.flatnonzero((view != 0).any(axis=1))
    total_votes = int(active.size)
    if total_votes == 0:
        return {}

    counts = (view != 0).sum(axis=0)
    admitted = counts > total_votes * config.PARTICIPATION_THRESHOLD
    if is_subject:
        admitted = admitted | (
            (counts >= config.MIN_SUBJECT_PARTICIPATION_VOTES)
            & (counts >= total_votes * config.MIN_SUBJECT_PARTICIPATION_SHARE)
        )
    keep = np.flatnonzero(admitted)
    if keep.size < 2:
        return {}

    sub = view[:, keep]
    a = sub.astype(np.int32)
    b = (sub != 0).astype(np.int32)
    numer = (a.T @ a).astype(np.float64)
    denom = (b.T @ b).astype(np.float64)

    with np.errstate(invalid="ignore", divide="ignore"):
        weights = np.where(denom > 0, numer / denom, np.nan)
    # A pair with no shared votes has no agreement to report, and neither does
    # an MEP with themselves. Both are held out of the ranking as +inf so they
    # sort to the far end of "least agreement" and never surface.
    np.fill_diagonal(weights, np.inf)
    weights = np.where(np.isnan(weights), np.inf, weights)

    kept_ids = [mep_ids[i] for i in keep]
    out = {}
    take = min(HOW_MANY, len(kept_ids) - 1)
    if take < 1:
        return {}
    for i, mep_id in enumerate(kept_ids):
        row = weights[i]
        # argpartition finds the k smallest without sorting all 700, then only
        # those k are ordered.
        candidates = np.argpartition(row, take)[: take + 1]
        candidates = [j for j in candidates if np.isfinite(row[j])]
        candidates.sort(key=lambda j: row[j])
        picked = candidates[:take]
        if picked:
            out[mep_id] = [
                (kept_ids[j], round(float(normalise(row[j])), 3)) for j in picked
            ]
    return out


def write_into_view(path, furthest, report):
    """Add the field to a precomputed file, leaving everything else untouched.

    Read-modify-write of a file that can be 15 MB, so the existing content is
    reused rather than rebuilt: this step has no business changing a layout, and
    a node that moved because a disagreement list was added would be a bug
    nobody would think to look for.
    """
    if not path.exists():
        return False
    with open(path) as handle:
        payload = json.load(handle)

    known = {node["id"] for node in payload.get("nodes", [])}
    # Only MEPs this view actually draws. The vote matrix covers everyone who
    # cast a ballot; the view may have dropped some at the participation filter,
    # and naming a counterpart who is not on screen would be a dead link.
    payload["furthestMEPs"] = {
        mep_id: [[other, share] for other, share in pairs if other in known]
        for mep_id, pairs in furthest.items()
        if mep_id in known
    }
    atomic_write_json(path, payload)
    return True


def run(report, mandates=None):
    report.step("Step 4d: least-agreeing counterparts")
    mandates = mandates or config.MANDATE_ORDER

    for mandate in mandates:
        builder, matrix, _dates, _titles = load_mandate(mandate)
        subject_rows = defaultdict(list)
        for row, subject in enumerate(builder.subject_of_row):
            subject_rows[subject].append(row)

        views = [(None, list(range(len(builder.vote_ids))))]
        views += [
            (subject, rows)
            for subject, rows in sorted(subject_rows.items())
            if len(rows) >= config.MIN_SUBJECT_VOTES
        ]

        written, missing = 0, []
        for subject, rows in views:
            furthest = extremes_for_view(
                matrix, rows, builder.mep_ids, is_subject=subject is not None
            )
            if not furthest:
                continue
            path = view_filename(mandate, subject)
            if write_into_view(path, furthest, report):
                written += 1
            else:
                missing.append(path.name)

        report.fact(f"mandate {mandate}: views given a disagreement list", written)
        # A name this step guessed wrong is a file silently left without the
        # field, which the panel would report to readers as "not available here".
        report.check(
            f"mandate {mandate}: every view's precomputed file was found",
            not missing,
            f"no file for {missing[:4]}",
            fatal=False,
        )

    report.end_step()


def main(argv=None):
    """Runnable on its own: `python -m pipeline.extremes --mandates 10`."""
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
    report = Report("extremes")
    run(report, mandates)
    report.finish() if hasattr(report, "finish") else None


if __name__ == "__main__":
    main()
