"""Command line entry point.

    python -m pipeline.run all              # everything, stopping on any failure
    python -m pipeline.run votes            # subjects only
    python -m pipeline.run networks         # rebuild networks from data/final
    python -m pipeline.run compare          # diff against the 2025 output
    python -m pipeline.run publish          # copy into the site
    python -m pipeline.run layouts          # ForceAtlas2 positions (node)
    python -m pipeline.run verify           # check what is on disk for the site

Nothing is published unless every validation gate passed.
"""

import argparse
import subprocess
import sys

from . import build_networks, build_votes, config, verify_site
from .network import load_meps
from .report import PipelineError, Report

STEPS = ["votes", "networks", "compare", "publish", "layouts", "verify"]


def check_inputs(report):
    report.step("Step 0: check inputs")
    for label, path in (("raw votes", config.RAW_VOTES), ("raw MEPs", config.RAW_MEPS)):
        report.check(f"{label} present", path.exists(), f"missing {path}")
        if path.exists():
            report.fact(f"{label} size", f"{path.stat().st_size / 1e6:.0f} MB")
    report.end_step()


def run_layouts(report, mandates, combinations=False, combinations_only=False):
    report.step("Step 5: precompute layouts")
    if not mandates:
        report.note("no mandate needs new positions")
        report.end_step()
        return
    report.fact("mandates to lay out", mandates)
    report.fact("country x subject combinations",
                "only" if combinations_only else combinations)
    cmd = [
        "node", "scripts/precompute-layouts.js",
        "--mandates", ",".join(str(m) for m in mandates),
    ]
    if combinations_only:
        # Leaves the full/country/subject layouts on disk untouched, which is
        # what closed mandates need: their positions are already published.
        cmd.append("--combinations-only")
    elif combinations:
        cmd.append("--combinations")
    report.note(f"running: {' '.join(cmd)} (in {config.WEB_ROOT})")
    proc = subprocess.run(cmd, cwd=config.WEB_ROOT)
    report.check("layout script succeeded", proc.returncode == 0,
                 f"node exited with {proc.returncode}")
    report.end_step()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("step", choices=STEPS + ["all"], help="which stage to run")
    parser.add_argument("--mandates", default=None,
                        help="comma-separated subset, e.g. 10")
    parser.add_argument("--offline", action="store_true",
                        help="never call a remote service; fail if a lookup is not cached")
    parser.add_argument("--force-publish", action="store_true",
                        help="publish even if comparison raised warnings")
    parser.add_argument("--layout-mandates", default=None,
                        help="override which mandates get new positions")
    parser.add_argument("--combinations", action="store_true",
                        help="also lay out every country x subject network "
                             "(~2,900 files; much the longest part of a run)")
    parser.add_argument("--combinations-only", action="store_true",
                        help="lay out ONLY the country x subject networks, "
                             "leaving existing layouts untouched")
    args = parser.parse_args(argv)

    mandates = args.mandates.split(",") if args.mandates else config.MANDATE_ORDER
    unknown = set(mandates) - set(config.MANDATE_ORDER)
    if unknown:
        parser.error(f"unknown mandates: {sorted(unknown)}")

    report = Report(args.step)
    steps = STEPS if args.step == "all" else [args.step]
    built = {}

    try:
        check_inputs(report)
        if "votes" in steps:
            build_votes.run(report, offline=args.offline)
        if "networks" in steps:
            built = build_networks.run(report, mandates, meps=load_meps())
        summary = {}
        if "compare" in steps:
            if not built:
                built = build_networks.load_built(report, mandates)
            summary = build_networks.compare(report, built)
        if "publish" in steps:
            if not built:
                built = build_networks.load_built(report, mandates)
            warnings = [c for c in report.checks if not c["ok"] and not c["fatal"]]
            if warnings and not args.force_publish:
                report.check(
                    "no unexplained differences before publishing",
                    False,
                    f"{len(warnings)} warning(s): "
                    + "; ".join(w["name"] for w in warnings[:4])
                    + ". Review them, then re-run with --force-publish to accept.",
                )
            build_networks.publish(report, built)
        if "layouts" in steps:
            if args.layout_mandates is not None:
                layout_targets = [m for m in args.layout_mandates.split(",") if m]
            else:
                # Only relay out a mandate whose network actually moved.
                layout_targets = [
                    m for m, s in summary.items()
                    if s.get("edges_differing")
                    or s.get("edges_only_now")
                    or s.get("edges_only_2025")
                    or s.get("nodes_added_count")
                    or s.get("nodes_removed_count")
                ] or ([config.CURRENT_MANDATE] if not summary else [])
                if args.combinations_only:
                    layout_targets = mandates
            run_layouts(
                report,
                layout_targets,
                combinations=args.combinations,
                combinations_only=args.combinations_only,
            )
        if "verify" in steps:
            verify_site.run(
                report,
                mandates,
                expect_combinations=args.combinations or args.combinations_only,
            )
    except PipelineError as exc:
        report.print_summary()
        print(f"\nPipeline stopped: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        report.write()
        print("\nInterrupted.", file=sys.stderr)
        return 130

    path = report.write()
    report.print_summary()
    print(f"Report: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
