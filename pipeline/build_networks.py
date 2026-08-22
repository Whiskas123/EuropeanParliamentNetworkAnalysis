"""Step 2: build the network payload the website reads, one file per mandate.

Writes to data/networks/ rather than straight into the site, so the output can
be compared against what is currently published before anything is replaced.
"""

import csv
import json
import shutil
from collections import Counter

from . import config
from .network import build_mandate_payload, load_meps, normalise
from .report import atomic_write_json

NETWORK_DIR = config.DATA_DIR / "networks"


def run(report, mandates=None, meps=None):
    report.step("Step 2: build networks")
    mandates = mandates or config.MANDATE_ORDER
    if meps is None:
        meps = load_meps()
        report.fact("MEPs in dump", len(meps))

    NETWORK_DIR.mkdir(parents=True, exist_ok=True)
    built = {}
    for mandate in mandates:
        payload = build_mandate_payload(mandate, report, meps)
        out = NETWORK_DIR / f"mandate_{mandate}" / "data.json"
        atomic_write_json(out, payload)
        size_mb = out.stat().st_size / 1e6
        report.fact(f"mandate {mandate}: written", f"{out} ({size_mb:.0f} MB)")
        built[mandate] = payload
    report.end_step()
    return built


def load_built(report, mandates):
    """Re-open previously built networks, reading only nodes and edges.

    Lets `compare` and `publish` run as separate commands without paying to
    parse the per-subject edge maps, which are the bulk of each file.
    """
    from .jsonstream import read_object_head

    built = {}
    for mandate in mandates:
        path = NETWORK_DIR / f"mandate_{mandate}" / "data.json"
        if not path.exists():
            report.note(f"mandate {mandate}: nothing built yet at {path}")
            continue
        built[mandate] = read_object_head(str(path), stop_after="edges")
    report.check("something to work with", bool(built),
                 "no built networks found - run the 'networks' step first")
    return built


# --- regression comparison ---------------------------------------------------

def _load_baseline_edges(mandate):
    """The 2025 run's edges, in [-1, 1], keyed by unordered MEP pair."""
    path = config.REPO_ROOT / "2025" / f"mandate_{mandate}" / "edges_all.csv"
    if not path.exists():
        return None
    edges = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            key = tuple(sorted((row["Source"], row["Target"])))
            raw = row["Weight"]
            edges[key] = float(raw) if raw not in ("", "nan") else None
    return edges


def _load_baseline_nodes(mandate):
    path = config.REPO_ROOT / "2025" / f"mandate_{mandate}" / "nodes.csv"
    if not path.exists():
        return None
    with open(path, newline="", encoding="utf-8") as fh:
        return {row["Id"]: row for row in csv.DictReader(fh)}


def compare(report, built, tolerance=1e-9):
    """Diff each rebuilt mandate against the 2025 output.

    Mandates 6-9 are closed: their raw votes are identical between the two
    dumps, so anything other than a near-exact match is a signal that something
    in the rewrite - or upstream in the MEP data - has moved.
    """
    report.step("Step 3: compare against the 2025 results")
    summary = {}

    for mandate, payload in built.items():
        closed = mandate != config.CURRENT_MANDATE
        base_nodes = _load_baseline_nodes(mandate)
        base_edges = _load_baseline_edges(mandate)
        if base_nodes is None or base_edges is None:
            report.note(f"mandate {mandate}: no 2025 baseline on disk, skipping comparison")
            continue

        new_nodes = {n["Id"]: n for n in payload["nodes"]}
        added = sorted(set(new_nodes) - set(base_nodes))
        removed = sorted(set(base_nodes) - set(new_nodes))

        changed_group, changed_country = [], []
        for mep_id in set(new_nodes) & set(base_nodes):
            if new_nodes[mep_id]["GroupID"] != base_nodes[mep_id]["GroupID"]:
                changed_group.append(
                    (mep_id, base_nodes[mep_id]["GroupID"], new_nodes[mep_id]["GroupID"])
                )
            if new_nodes[mep_id]["Country"] != base_nodes[mep_id]["Country"]:
                changed_country.append(
                    (mep_id, base_nodes[mep_id]["Country"], new_nodes[mep_id]["Country"])
                )

        # Edges are compared in the original [-1, 1] scale the CSV holds.
        new_edges = {
            tuple(sorted((e["Source"], e["Target"]))): e["Weight"] * 2 - 1
            for e in payload["edges"]
        }
        common = set(new_edges) & set(base_edges)
        diffs = []
        max_delta = 0.0
        for key in common:
            old = base_edges[key]
            if old is None:
                continue
            delta = abs(new_edges[key] - old)
            if delta > max_delta:
                max_delta = delta
            if delta > tolerance:
                diffs.append((key, old, new_edges[key], delta))

        stats = {
            "nodes_2025": len(base_nodes),
            "nodes_now": len(new_nodes),
            "nodes_added": added[:20],
            "nodes_removed": removed[:20],
            "nodes_added_count": len(added),
            "nodes_removed_count": len(removed),
            "group_changes": changed_group[:20],
            "group_changes_count": len(changed_group),
            "country_changes_count": len(changed_country),
            "edges_2025": len(base_edges),
            "edges_now": len(new_edges),
            "edges_only_2025": len(set(base_edges) - set(new_edges)),
            "edges_only_now": len(set(new_edges) - set(base_edges)),
            "edges_compared": len(common),
            "edges_differing": len(diffs),
            "max_weight_delta": round(max_delta, 6),
            "worst_diffs": [
                {"pair": list(k), "was": o, "now": n, "delta": round(d, 6)}
                for k, o, n, d in sorted(diffs, key=lambda x: -x[3])[:10]
            ],
        }
        summary[mandate] = stats
        report.fact(f"mandate {mandate} vs 2025", {
            k: stats[k] for k in (
                "nodes_2025", "nodes_now", "nodes_added_count", "nodes_removed_count",
                "group_changes_count", "edges_2025", "edges_now",
                "edges_differing", "max_weight_delta",
            )
        })

        if closed:
            # A closed mandate must reproduce exactly.
            report.check(
                f"mandate {mandate}: same MEPs in the network as 2025",
                not added and not removed,
                f"added {added[:5]}, removed {removed[:5]}",
                fatal=False,
            )
            report.check(
                f"mandate {mandate}: same edge set as 2025",
                stats["edges_only_2025"] == 0 and stats["edges_only_now"] == 0,
                f"{stats['edges_only_2025']} lost, {stats['edges_only_now']} gained",
                fatal=False,
            )
            report.check(
                f"mandate {mandate}: edge weights reproduce 2025",
                not diffs,
                f"{len(diffs)} edges differ, worst delta {max_delta:.6f}",
            )
            report.check(
                f"mandate {mandate}: political groups unchanged",
                not changed_group,
                f"{len(changed_group)} MEPs changed group, e.g. {changed_group[:3]}",
                fatal=False,
            )
        else:
            report.check(
                f"mandate {mandate}: network grew, as expected for the sitting term",
                len(new_edges) > 0 and len(new_nodes) > 0,
                f"{len(new_nodes)} nodes, {len(new_edges)} edges",
            )

    atomic_write_json(config.REPORT_DIR / "comparison_vs_2025.json", summary, indent=2)
    report.end_step()
    return summary


# --- publishing --------------------------------------------------------------

def publish(report, built, drop_enriched=True):
    """Copy the built networks into the site and emit the small counts file."""
    report.step("Step 4: publish to the website")
    counts = {}
    for mandate, payload in built.items():
        dest_dir = config.WEB_DATA_DIR / f"mandate_{mandate}"
        dest_dir.mkdir(parents=True, exist_ok=True)
        src = NETWORK_DIR / f"mandate_{mandate}" / "data.json"
        dest = dest_dir / "data.json"
        shutil.copyfile(src, dest)
        report.fact(f"mandate {mandate}: published", f"{dest.stat().st_size / 1e6:.0f} MB")
        counts[mandate] = payload["metadata"]["votingSessionCounts"]

    # This replaces a 500-850 MB per-mandate fetch the browser was doing purely
    # to count voting sessions.
    counts_path = config.WEB_DATA_DIR / "voting_sessions.json"
    existing = {}
    if counts_path.exists():
        existing = json.loads(counts_path.read_text(encoding="utf-8"))
    existing.update(counts)
    atomic_write_json(counts_path, existing, indent=1)
    report.fact("voting-session counts written",
                f"{counts_path} ({counts_path.stat().st_size / 1024:.0f} KB)")
    report.check(
        "counts file covers every mandate",
        set(existing) >= set(config.MANDATE_ORDER),
        f"missing {sorted(set(config.MANDATE_ORDER) - set(existing))}",
    )
    report.end_step()
    return counts
