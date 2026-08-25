"""Step 6: check what is actually on disk for the website.

The earlier steps validate the data as it is produced. This one validates the
result *after* the fact, because the layout stage is a separate Node process
that can die halfway through — an out-of-memory abort mid-write leaves a
truncated JSON file that looks present but breaks the page. Anything the
browser will fetch is checked here: it parses, it has the fields the loader
reads, and every network the UI can ask for exists.
"""

import json
import re

from . import config
from .jsonstream import read_object_head

PRECOMPUTED = config.WEB_DATA_DIR / "precomputed"


def _subject_key(subject):
    """Mirror of the key-building in dataLoader.js / precompute-layouts.js."""
    return re.sub(r"[^a-zA-Z0-9]", "_", subject)


def _country_key(country):
    return country.replace(" ", "_")


def _check_baselines(report, mandates):
    """Verify baselines.json covers every mandate with usable reference figures.

    Returns the parsed file, or None if it is unusable — callers then skip the
    per-mandate checks rather than reporting the same failure once per term.
    """
    path = config.WEB_DATA_DIR / "baselines.json"
    if not report.check(
        "baselines published",
        path.exists(),
        f"{path} — run `npm run baselines` in 2025/web",
        fatal=False,
    ):
        return None

    try:
        baselines = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        report.check("baselines file parses", False, f"{exc}", fatal=False)
        return None

    incomplete = [
        m
        for m in mandates
        if not (baselines.get(str(m), {}).get("_all", {}).get("intragroup"))
    ]
    report.check(
        "every mandate has a whole-Parliament baseline",
        not incomplete,
        f"missing or empty for mandates {incomplete}",
        fatal=False,
    )
    report.fact("mandates with baselines", len(baselines))
    return baselines


def run(report, mandates=None, expect_combinations=None):
    report.step("Step 6: verify the published site data")
    mandates = mandates or config.MANDATE_ORDER

    counts_path = config.WEB_DATA_DIR / "voting_sessions.json"
    report.check("voting-session counts file exists", counts_path.exists(), str(counts_path))
    counts = json.loads(counts_path.read_text(encoding="utf-8"))

    # The sidebar's baseline comparisons. Derived from the precomputed files
    # rather than from the votes, so a layout run that died part-way can leave
    # this stale or absent while everything else looks fine.
    baselines = _check_baselines(report, mandates)

    total_checked = 0
    for mandate in mandates:
        data_path = config.WEB_DATA_DIR / f"mandate_{mandate}" / "data.json"
        if not report.check(
            f"mandate {mandate}: data.json published", data_path.exists(), str(data_path)
        ):
            continue

        head = read_object_head(str(data_path), stop_after="nodes")
        nodes = head["nodes"]
        countries = sorted({n["Country"] for n in nodes if n["Country"]})
        subjects = head["metadata"]["subjects"]

        report.check(
            f"mandate {mandate}: counts file has an entry",
            str(mandate) in counts and isinstance(counts[str(mandate)].get("total"), int),
            f"entry: {counts.get(str(mandate))}",
        )

        # Every network the UI can request must exist, parse, and carry
        # positions for all of its nodes.
        wanted = [(None, None)]
        wanted += [(c, None) for c in countries]
        wanted += [(None, s) for s in subjects]
        if expect_combinations:
            wanted += [(c, s) for c in countries for s in subjects]

        missing, unparseable, positionless, empty = [], [], [], []
        for country, subject in wanted:
            name = f"mandate_{mandate}"
            if country:
                name += f"_{_country_key(country)}"
            if subject:
                name += f"_subject_{_subject_key(subject)}"
            path = PRECOMPUTED / f"{name}.json"

            if not path.exists():
                missing.append(name)
                continue
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                # This is what a killed layout run leaves behind.
                unparseable.append(f"{name} ({exc.__class__.__name__})")
                continue
            total_checked += 1

            payload_nodes = payload.get("nodes") or []
            if not payload_nodes:
                empty.append(name)
                continue
            if any(
                not isinstance(n.get("x"), (int, float))
                or not isinstance(n.get("y"), (int, float))
                for n in payload_nodes
            ):
                positionless.append(name)

        report.fact(f"mandate {mandate}: networks expected", len(wanted))
        report.check(
            f"mandate {mandate}: no precomputed file is missing",
            not missing,
            f"{len(missing)} missing, e.g. {missing[:4]}",
            fatal=False,
        )
        report.check(
            f"mandate {mandate}: every precomputed file parses",
            not unparseable,
            f"{len(unparseable)} corrupt, e.g. {unparseable[:4]}. "
            "A truncated file usually means the layout run was killed part-way.",
        )
        report.check(
            f"mandate {mandate}: every node has a position",
            not positionless,
            f"{len(positionless)} networks contain nodes without x/y, e.g. {positionless[:4]}. "
            "These render at undefined coordinates.",
        )
        if empty:
            report.note(f"mandate {mandate}: {len(empty)} networks have no nodes: {empty[:4]}")

        mep_info = PRECOMPUTED / f"mep_info_{mandate}.json"
        report.check(
            f"mandate {mandate}: MEP info published", mep_info.exists(), str(mep_info)
        )

        # Per-MEP vote counts. The sidebar prints these next to the number of
        # voting sessions ("2,873 votes in 4,245 voting sessions"), so a file
        # counted over a different set of votes than the published network is
        # a wrong number rather than a missing one.
        mep_votes = PRECOMPUTED / f"mep_votes_{mandate}.json"
        if report.check(
            f"mandate {mandate}: per-MEP vote counts published",
            mep_votes.exists(),
            f"{mep_votes} - run `python3 -m pipeline.run participation`",
            fatal=False,
        ):
            try:
                votes = json.loads(mep_votes.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                votes = None
                report.check(
                    f"mandate {mandate}: per-MEP vote counts parse", False, f"{exc}"
                )
            if votes:
                entry = counts.get(str(mandate)) or {}
                report.check(
                    f"mandate {mandate}: vote counts cover the published votes",
                    votes.get("sessions", {}).get("total") == entry.get("total")
                    and votes.get("sessions", {}).get("bySubject") == entry.get("bySubject"),
                    "counted over a different set of votes than the published "
                    "network - re-run `participation` after `publish`",
                )
                absent = [n["Id"] for n in nodes if n["Id"] not in (votes.get("meps") or {})]
                report.check(
                    f"mandate {mandate}: every drawn MEP has a vote count",
                    not absent,
                    f"{len(absent)} without one, e.g. {absent[:4]}. "
                    "The sidebar falls back to showing sessions alone for them.",
                    fatal=False,
                )

        if baselines is not None:
            entry = baselines.get(str(mandate)) or {}
            # A country the UI can select but the baselines file does not know
            # about degrades quietly to a whole-Parliament comparison, so this
            # is worth reporting without being fatal.
            absent = [c for c in countries if c not in entry]
            report.check(
                f"mandate {mandate}: every country has a baseline",
                not absent,
                f"{len(absent)} without one, e.g. {absent[:4]}. "
                "Those views compare against the whole Parliament instead.",
                fatal=False,
            )

    report.fact("precomputed files checked", total_checked)
    report.end_step()
