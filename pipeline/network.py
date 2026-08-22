"""Turn votes into a similarity network.

The measure, unchanged from the 2025 analysis: for every pair of MEPs, take the
votes where *both* cast a yes or a no (abstentions are excluded entirely), and
compute (agreements - disagreements) / (votes in common). That gives a score in
[-1, 1], which is then rescaled to [0, 1] for the website.

Only MEPs who voted in more than half of the votes enter a network, so someone
who sat for three weeks does not get a position derived from a handful of votes.

The 2025 notebook did this with a pandas pivot table, which for mandate 9 means
a multi-gigabyte frame. Here the same arithmetic runs on an int8 matrix of votes
x MEPs - about 20 MB for the largest mandate - which is what makes it feasible
to recompute every mandate on every run and diff the results.
"""

from array import array
from collections import Counter, defaultdict
from datetime import datetime

import numpy as np

from . import config
from .jsonstream import iter_json_array


class VoteMatrix:
    """Sparse-built, dense int8 matrix of votes (rows) x MEPs (columns)."""

    def __init__(self):
        self.mep_index = {}
        self.mep_ids = []
        self.vote_ids = []
        self._rows = array("i")
        self._cols = array("i")
        self._weights = array("b")
        self.duplicate_entries = 0
        self.entries_without_mepid = 0
        self.subject_of_row = []

    def add_session(self, session, subject):
        row = len(self.vote_ids)
        self.vote_ids.append(session["voteid"])
        self.subject_of_row.append(subject)
        seen = set()
        for vote_type, block in session["votes"].items():
            weight = config.VOTE_WEIGHTS[vote_type]
            if weight == 0:
                # Abstentions carry no information about agreement and are
                # excluded before anything else, as in the 2025 analysis.
                continue
            groups = (block or {}).get("groups") or {}
            for entries in groups.values():
                for entry in entries or []:
                    if not isinstance(entry, dict) or "mepid" not in entry:
                        self.entries_without_mepid += 1
                        continue
                    mep = f"M{entry['mepid']}"
                    col = self.mep_index.get(mep)
                    if col is None:
                        col = len(self.mep_ids)
                        self.mep_index[mep] = col
                        self.mep_ids.append(mep)
                    if col in seen:
                        self.duplicate_entries += 1
                    seen.add(col)
                    self._rows.append(row)
                    self._cols.append(col)
                    self._weights.append(weight)

    def build(self):
        n_rows, n_cols = len(self.vote_ids), len(self.mep_ids)
        matrix = np.zeros((n_rows, n_cols), dtype=np.int8)
        rows = np.frombuffer(self._rows, dtype=np.int32)
        cols = np.frombuffer(self._cols, dtype=np.int32)
        weights = np.frombuffer(self._weights, dtype=np.int8)
        # Reversed so that on a duplicate (mep, vote) the *first* occurrence is
        # the one left standing, matching the pivot_table(aggfunc="first") the
        # 2025 code used.
        matrix[rows[::-1], cols[::-1]] = weights[::-1]
        self.raw_counts = np.bincount(cols, minlength=n_cols)
        return matrix


def edges_from_matrix(matrix, mep_ids, raw_counts=None):
    """Agreement index for every MEP pair that shares at least one vote.

    Returns (edges, kept_mep_ids, stats). Edge weights are still in [-1, 1].
    """
    active_rows = np.flatnonzero((matrix != 0).any(axis=1))
    total_votes = int(active_rows.size)
    if total_votes == 0:
        return [], [], {"total_votes": 0, "meps_considered": 0, "meps_kept": 0}

    counts = raw_counts if raw_counts is not None else (matrix != 0).sum(axis=0)
    keep = np.flatnonzero(counts > total_votes * config.PARTICIPATION_THRESHOLD)
    stats = {
        "total_votes": total_votes,
        "meps_considered": int((counts > 0).sum()),
        "meps_kept": int(keep.size),
    }
    if keep.size < 2:
        return [], [], stats

    sub = matrix[:, keep]
    a = sub.astype(np.int32)
    b = (sub != 0).astype(np.int32)
    numer = a.T @ a          # agreements minus disagreements
    denom = b.T @ b          # votes cast by both

    kept_ids = [mep_ids[i] for i in keep]
    # Deterministic order: sort by MEP id so two runs produce identical files.
    order = sorted(range(len(kept_ids)), key=lambda i: kept_ids[i])

    edges = []
    no_overlap = 0
    for oi in range(len(order)):
        i = order[oi]
        src = kept_ids[i]
        for oj in range(oi + 1, len(order)):
            j = order[oj]
            d = denom[i, j]
            if d == 0:
                no_overlap += 1
                continue
            edges.append((src, kept_ids[j], round(float(numer[i, j]) / float(d), 3)))
    stats["pairs_without_shared_votes"] = no_overlap
    return edges, kept_ids, stats


def normalise(weight):
    """[-1, 1] agreement index -> [0, 1] for the website."""
    return (weight + 1) / 2


def load_mandate_matrix(mandate):
    """Read one mandate's votes into a matrix, remembering each vote's subject."""
    matrix_builder = VoteMatrix()
    path = config.FINAL_DIR / f"ep_votes_{mandate}.json"
    for session in iter_json_array(str(path)):
        matrix_builder.add_session(session, session.get("subject", config.FALLBACK_SUBJECT))
    matrix = matrix_builder.build()
    return matrix_builder, matrix


# --- nodes -------------------------------------------------------------------

def _parse_date(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00").split("T")[0])
    except ValueError:
        return None


def load_meps():
    """Index the MEP dump by user id, keeping only the fields the site needs."""
    meps = {}
    for mep in iter_json_array(str(config.RAW_MEPS)):
        uid = mep.get("UserID")
        if uid is None:
            continue
        meps[f"M{uid}"] = {
            "FullName": (mep.get("Name") or {}).get("full", ""),
            "Photo": mep.get("Photo", ""),
            # Parltrack sometimes stores null for these, or a list containing
            # nulls; the 2025 code crashed on both.
            "Groups": [g for g in (mep.get("Groups") or []) if isinstance(g, dict)],
            "Constituencies": [
                c for c in (mep.get("Constituencies") or []) if isinstance(c, dict)
            ],
        }
    return meps


def map_group_id(group_id):
    if group_id is None:
        return None
    key = str(group_id).strip()
    return config.GROUP_ID_MAP.get(key, key)


def build_nodes(mandate, mep_ids, meps):
    """Node records for the MEPs in a network, with their groups for the term."""
    start = datetime.strptime(config.MANDATES[mandate][0], "%Y-%m-%d")
    end = datetime.strptime(config.MANDATES[mandate][1], "%Y-%m-%d")
    is_current = mandate == config.CURRENT_MANDATE
    term_values = {mandate, int(mandate)}

    nodes = []
    skipped = Counter()
    for mep_id in mep_ids:
        mep = meps.get(mep_id)
        if mep is None:
            skipped["not in MEP dump"] += 1
            continue

        groups = []
        for g in mep["Groups"]:
            g_start = _parse_date(g.get("start"))
            if g_start is None:
                continue
            end_raw = g.get("end") or ""
            ongoing = not end_raw or "9999" in str(end_raw)
            if ongoing and is_current:
                g_end = datetime.max
            elif ongoing:
                g_end = _parse_date(end_raw) or end
            else:
                g_end = _parse_date(end_raw)
                if g_end is None:
                    continue
            if g_start <= end and g_end >= start:
                groups.append(
                    {
                        "groupid": map_group_id(g.get("groupid")),
                        "start": str(g.get("start", "")).split("T")[0],
                        "end": None if (ongoing and is_current) else str(end_raw).split("T")[0],
                    }
                )

        constituencies = [c for c in mep["Constituencies"] if c.get("term") in term_values]
        if not groups or not constituencies:
            skipped["no group or constituency for this term"] += 1
            continue

        parties = sorted({c["party"] for c in constituencies if c.get("party")})
        last = sorted(constituencies, key=lambda c: str(c.get("start") or ""))[-1]

        if len(groups) == 1:
            group_id = groups[0]["groupid"]
        else:
            # The group they ended the term in.
            group_id = sorted(
                groups, key=lambda g: (g["end"] is None, g["end"] or ""), reverse=True
            )[0]["groupid"]

        nodes.append(
            {
                "Id": mep_id,
                "FullName": mep["FullName"],
                "Country": last.get("country", ""),
                "PartyNames": parties,
                "PhotoURL": mep["Photo"],
                "Groups": groups,
                "GroupID": group_id,
            }
        )
    return nodes, skipped


# --- assembly ----------------------------------------------------------------

def build_mandate_payload(mandate, report, meps):
    """Everything the website needs for one mandate."""
    builder, matrix = load_mandate_matrix(mandate)
    report.fact(f"mandate {mandate}: voting sessions", len(builder.vote_ids))
    report.fact(f"mandate {mandate}: MEPs casting any vote", len(builder.mep_ids))
    if builder.duplicate_entries:
        report.note(
            f"{builder.duplicate_entries} duplicate (MEP, vote) entries - first kept"
        )
    if builder.entries_without_mepid:
        report.note(
            f"{builder.entries_without_mepid} vote entries have no mepid and were dropped"
        )

    edges, kept, stats = edges_from_matrix(matrix, builder.mep_ids, builder.raw_counts)
    report.fact(f"mandate {mandate}: MEPs in network", stats["meps_kept"])

    # Membership of the network turns on a hard ">50% of votes" line. MEPs
    # sitting close to it flip in and out on small data changes, which is worth
    # knowing before reading anything into a network's composition changing.
    total_votes = stats["total_votes"]
    margin = 0.05
    borderline = [
        (builder.mep_ids[i], int(builder.raw_counts[i]),
         round(float(builder.raw_counts[i]) / total_votes, 3))
        for i in range(len(builder.mep_ids))
        if total_votes
        and abs(float(builder.raw_counts[i]) / total_votes - config.PARTICIPATION_THRESHOLD)
        <= margin
    ]
    if borderline:
        report.fact(
            f"mandate {mandate}: MEPs within {margin:.0%} of the participation cut-off",
            len(borderline),
        )
        report.note(
            "borderline MEPs (id, votes, share): "
            + ", ".join(f"{m}:{s:.0%}" for m, _, s in sorted(borderline, key=lambda x: -x[2])[:12])
        )
    report.fact(f"mandate {mandate}: edges", len(edges))
    report.check(
        f"mandate {mandate}: network is non-trivial",
        len(edges) > 1000 and stats["meps_kept"] > 100,
        f"{stats['meps_kept']} MEPs, {len(edges)} edges",
    )

    nodes, skipped = build_nodes(mandate, kept, meps)
    if skipped:
        report.note(f"mandate {mandate}: MEPs dropped from nodes: {dict(skipped)}")
    report.fact(f"mandate {mandate}: nodes", len(nodes))

    node_ids = {n["Id"] for n in nodes}
    dangling = sum(1 for s, t, _ in edges if s not in node_ids or t not in node_ids)
    report.check(
        f"mandate {mandate}: every edge connects two known nodes",
        dangling == 0,
        f"{dangling} edges reference an MEP missing from the node list",
        fatal=False,
    )
    report.check(
        f"mandate {mandate}: every node has a political group",
        all(n["GroupID"] for n in nodes),
        "some nodes have an empty GroupID",
    )
    report.check(
        f"mandate {mandate}: every node has a country",
        all(n["Country"] for n in nodes),
        "some nodes have an empty Country",
    )

    # Per-subject networks, each with its own participation filter.
    subjects = np.array(builder.subject_of_row)
    edges_by_subject = {}
    subject_meta = {}
    for subject in sorted(set(builder.subject_of_row)):
        rows = np.flatnonzero(subjects == subject)
        sub_matrix = matrix[rows]
        sub_edges, _, sub_stats = edges_from_matrix(sub_matrix, builder.mep_ids)
        if not sub_edges:
            report.note(f"mandate {mandate}: subject '{subject}' produced no edges")
            continue
        weights = [normalise(w) for _, _, w in sub_edges]
        edges_by_subject[subject] = [
            {"Source": s, "Target": t, "Weight": normalise(w)} for s, t, w in sub_edges
        ]
        subject_meta[subject] = {
            "edgeCount": len(sub_edges),
            "weightRange": {"min": min(weights), "max": max(weights)},
            "voteCount": int(rows.size),
            "mepCount": sub_stats["meps_kept"],
        }

    all_weights = [normalise(w) for _, _, w in edges]
    # Key order matters for reading these files back cheaply: everything small
    # comes first, so a reader wanting metadata/nodes/edges can stop before the
    # per-subject edge map, which is most of the file's bytes.
    payload = {
        "mandate": mandate,
        "metadata": {
            "nodeCount": len(nodes),
            "edgeCount": len(edges),
            "weightRange": {"min": min(all_weights), "max": max(all_weights)},
            "subjects": sorted(edges_by_subject),
            "subjectMetadata": subject_meta,
            # Deliberately not called "votingSessions": the site renders
            # metadata.votingSessions straight into the sidebar as a number, so
            # an object under that key would break it. The per-subject counts
            # are served separately as /data/voting_sessions.json.
            "votingSessionCounts": {
                "total": len(builder.vote_ids),
                "bySubject": dict(Counter(builder.subject_of_row)),
            },
            "dataSource": "pipeline",
        },
        "nodes": nodes,
        "edges": [
            {"Source": s, "Target": t, "Weight": normalise(w)} for s, t, w in edges
        ],
        "edgesBySubject": edges_by_subject,
    }

    finite = all(np.isfinite(w) for w in all_weights)
    report.check(
        f"mandate {mandate}: all edge weights are real numbers",
        finite,
        "some weights are NaN or infinite, which would produce invalid JSON",
    )
    report.check(
        f"mandate {mandate}: edge weights are within [0, 1]",
        0.0 <= min(all_weights) and max(all_weights) <= 1.0,
        f"range is [{min(all_weights)}, {max(all_weights)}]",
    )
    return payload
