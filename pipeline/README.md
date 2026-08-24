# European Parliament voting-network pipeline

Turns the raw Parltrack dumps into the network files the website reads, in six
checked stages. Replaces the ad-hoc, out-of-order execution of
`2025/main.ipynb`, which produced the 2025 site.

## Updating the data

```bash
# 1. Decompress the new dumps into data/raw/
zstd -d new_data_2026/ep_votes.json.zst -o data/raw/ep_votes.json
zstd -d new_data_2026/ep_meps.json.zst  -o data/raw/ep_meps.json

# 2. Run everything. Stops on the first failed check; publishes nothing unless
#    every gate passed.
python3 -m pipeline.run all

# Or one stage at a time:
python3 -m pipeline.run votes      # split by mandate + assign subjects
python3 -m pipeline.run networks   # similarity networks  -> data/networks/
python3 -m pipeline.run compare    # diff against the previous published run
python3 -m pipeline.run publish    # copy into 2025/web/public/data/
python3 -m pipeline.run layouts    # ForceAtlas2 positions (node)
python3 -m pipeline.run verify     # check what is on disk for the site
```

Useful flags:

| Flag | Effect |
|---|---|
| `--mandates 10` | restrict to certain mandates |
| `--offline` | never call a remote service; fail if a lookup is not cached |
| `--layout-mandates 10` | choose which mandates get new positions (default: only those whose network changed) |
| `--combinations` | also build the country × subject networks |
| `--combinations-only` | build *only* those, leaving existing layouts untouched |
| `--missing-only` | only build networks whose file does not exist; never recomputes a published layout |
| `--force-publish` | publish despite warnings, after reviewing them |

Every run writes `data/reports/<timestamp>_<step>.json` plus
`data/reports/latest_<step>.json`, recording the inputs, every number the stage
produced, and the result of every check.

## Stages

```
data/raw/ep_votes.json ─┐
                        ├─► [1 votes]    ─► data/final/ep_votes_{6..10}.json
data/raw/ep_meps.json ──┤                   (each vote tagged with a subject)
                        │
                        └─► [2 networks] ─► data/networks/mandate_{m}/data.json
                                            (nodes, edges, edges per subject)
                                 │
                            [3 compare]  ─► data/reports/comparison_vs_2025.json
                                 │
                            [4 publish]  ─► 2025/web/public/data/
                                 │
                            [5 layouts]  ─► 2025/web/public/data/precomputed/
                                 │
                            [6 verify]   ─► re-reads everything the browser
                                            will fetch
```

**1. Votes** (`build_votes.py`, `subjects.py`, `remote.py`)
Splits the dump by parliamentary term and gives every voting session a policy
subject. Subjects come from the procedure behind the vote:

```
vote title "A10-0214/2025 - Lopez Aguilar - Motion for a resolution"
  └─ document code ─► EP Open Data API ─► procedure ref 2013/0072(COD)
                                        ─► OEIL ─► "Transport and Tourism"
                                        ─► SUBJECT_MAPPING ─► canonical subject
```

**2. Networks** (`network.py`)
For each pair of MEPs: over the votes where *both* voted yes or no (abstentions
excluded), `(agreements − disagreements) / (votes in common)`, giving a score in
[−1, 1], rescaled to [0, 1] for the site. Only MEPs voting in **more than half**
the votes enter a network. Repeated per subject, each with its own participation
filter.

**3. Compare** Diffs against the previous run's published output.

**4. Publish** Copies into the site and writes `voting_sessions.json`.

**5. Layouts** Runs `2025/web/scripts/precompute-layouts.js` for the mandates
whose networks actually changed. Four kinds of network are produced per mandate:
the full one, one per country, one per subject, and — with `--combinations` —
one per country × subject pair (~2,900 files, ~700 MB, roughly 2.5 min per
mandate).

Two flags exist so that closed mandates keep the positions already published:
`--combinations-only` adds just the combination files, and `--missing-only`
fills any gap (a network a previous run skipped) while skipping everything
already on disk. They compose.

The stage finishes by rebuilding `2025/web/public/data/baselines.json` (see
below). That is derived from the files it just wrote, so it always runs, and a
failure there is reported without failing the stage — the site simply shows no
comparisons.

**6. Verify** (`verify_site.py`)
Re-reads every file the browser can fetch and checks it parses, has the fields
the loader reads, and carries a position for every node. The layout stage is a
separate Node process that can die part-way through and leave a truncated file
that looks present; only a check after the fact catches that.

## Baselines (`baselines.json`)

Every cohesion figure on the site describes whichever network is open, which on
its own says nothing: "Poland, 57.2%" only means something once you know Poland
usually sits at 72.9%. `2025/web/scripts/build-baselines.js` supplies the
"usually".

A baseline is always **the same view with one filter removed**, so a delta
isolates a single variable:

| Current view | Compared against |
|---|---|
| Poland × Gender Equality | Poland, all policy areas |
| all countries × Gender Equality | all countries, all policy areas |
| Poland, all policy areas | the whole Parliament |
| the whole Parliament | nothing — it is the baseline |

So the file holds, per mandate, the unfiltered network's cohesion figures plus
one set per country. Those all exist already as precomputed layouts; the script
only lifts their `cohesionData` out and drops the positions, edges and
per-MEP scores. The result is **~60 KB for all five terms**, against 16 MB for a
single precomputed file, which is what makes it affordable for the baseline to
be present on every view.

```bash
cd 2025/web && npm run baselines     # standalone; also runs at the end of `layouts`
```

It reads from disk rather than from the layout stage's in-memory payloads, so it
is correct whether the layouts were just regenerated or have sat there since
2025. Regenerate it after anything that changes a published network.

One deliberate omission: in a country view, that country's own cohesion figure
is computed from exactly the same MEP pairs as the whole-Parliament figure for
it, so the delta is zero by construction. The UI drops the comparison there
rather than printing "±0.0", which would imply something had been measured.

## Caches

In `data/cache/`. They make re-runs free and future updates cheap — only genuinely
new votes cost network traffic. All are plain JSON, safe to inspect and edit.

| File | Maps |
|---|---|
| `subject_by_voteid.json` | vote id → subject (+ how it was decided) |
| `code_to_epref.json` | document code → procedure reference |
| `code_to_committees.json` | document code → authoring committees |
| `epref_to_label.json` | procedure → raw OEIL label |
| `epref_to_second_level.json` | procedure → second-level policy area |
| `committee_names.json` | ENVI → "Environment, Climate and Food Safety" |
| `sitting_code_maps.json` | plenary sitting → {document code: procedure} |
| `manual_subject_overrides.json` | **hand-written**, highest precedence |

`subject_by_voteid.json` was seeded from the 2025 results, which is why closed
mandates reproduce exactly instead of being re-guessed from APIs whose answers
may have moved since. To force a fresh lookup, delete the relevant entries.

`manual_subject_overrides.json` takes `{"<document code or vote id>": "<subject>"}`
and is applied before anything else, for cases automation cannot reach.

## What the checks guarantee

The run aborts (publishing nothing) if any of these fail:

- vote-type keys are only `+`, `-`, `0` — an unrecognised key would otherwise be
  silently mis-weighted
- vote ids are unique; every mandate has votes
- every remote lookup completed — a blocked or failing source stops the run
  rather than quietly labelling votes "Others"
- every written vote has a subject, and every subject is in the canonical list
- edge weights are finite and within [0, 1] — a NaN would produce invalid JSON
  that the site cannot parse
- closed mandates (6–9) reproduce the previous run's edge weights exactly
- (verify) every published network parses and every node has a position
- (verify, warning only) `baselines.json` exists, parses, covers every mandate,
  and has an entry for every country the UI can select

Warnings (recorded, and blocking `publish` unless `--force-publish`) cover
things worth a human's eye but which cannot corrupt a number: MEPs appearing or
disappearing from a network, group changes, an unusual share of "Others".

## Caveats worth knowing

**Network membership is decided by a hard >50% participation line.** MEPs near
it move in and out on small data changes. Each run reports how many sit within
5 percentage points of the cut-off. In the 2026 update, all 12 membership
changes in mandate 10 were MEPs crossing this line (the 9 that left were at
41.9–49.7%; the 3 that joined at 50.1–64.5%) — not a change in behaviour.

**"Others" is a real category, not just failure.** It holds procedural votes
(agenda changes, requests by groups) that have no procedure behind them, as well
as votes whose procedure could not be resolved. Currently 1.4% of mandate 10.

**Sources can disappear.** The 2025 notebook scraped
`europarl.europa.eu/doceo` document pages; those now sit behind an AWS WAF
bot-challenge and return a challenge page. EUR-Lex search does the same. Both
paths are replaced by the EP Open Data Portal API, which is official, unmetered
in practice, and returns JSON-LD. If it too becomes unavailable, the run stops
loudly instead of degrading.

**Deliberate fix vs. the 2025 code.** That code extracted a "B" code out of an
"RC-B" code (the regex matched the `B` inside `RC-B`) and let the B lookup win,
so joint motions for resolution resolved via one of their constituent group
motions — usually to nothing, leaving the vote in "Others". Here `RC-B` is
matched first. This only affects votes newly labelled; frozen historical labels
are untouched.

**Layouts are seeded.** `precompute-layouts.js` used `Math.random()` for the
initial positions, so identical data produced different layouts every run. It
now derives a seed from each network's identity, making runs reproducible.
Regenerating a mandate's layout will still change its appearance versus the
positions published before this change.

## Verification performed for the 2026 update

- Mandates 6–9 rebuilt from scratch and diffed against the 2025 output:
  identical node sets, identical edge sets, and a maximum weight difference of
  **0.0** across ~954,000 edges.
- The replacement subject resolver was checked against 115 mandate-10 document
  codes whose subject the 2025 run had already determined: **97.4% identical**,
  and of the 114 codes where the 2025 run recorded a procedure reference, 111
  matched exactly with **zero mismatches** (3 not found). Full detail in
  `data/reports/resolver_validation_2026.json`.
- Layout seeding was verified by running `precompute-layouts.js --mandates 10`
  twice: all 50 output files were byte-identical apart from the `computedAt`
  timestamp.
- `npm run build` succeeds against the published data.
- `python3 -m pipeline.run verify --combinations`: 33/33 checks, **3,237
  precomputed networks** present, parsing, and carrying a position for every
  node.

## The country × subject networks (2026-08-22)

Added in this round; previously the site had per-country and per-subject
networks but not the crossing of the two. The feature was two-thirds built and
never finished: `dataLoader.js` already requested
`mandate_{m}_{Country}_subject_{Subject}.json`, and
`precomputeLayoutForCountryAndSubject()` already existed, but `main()` never
called it and the two selectors disabled each other in the UI. Wiring up all
three layers produced **2,986 combination files (~700 MB)**.

Three defects surfaced while doing it, all now fixed:

1. **Nodes at undefined coordinates.** When a small country had no edges above
   the layout threshold in one policy area, the generator returned `null` and
   wrote nothing; the loader then 404'd, left the nodes without positions, and
   `NetworkCanvas` drew them at `undefined`. Cyprus × Public Health hit this
   exactly (1 node, 0 edges). A file is now always written, using a circular
   layout when there is nothing to lay out.
2. **Out-of-memory on multi-mandate runs.** `main()` processed all mandates
   through `Promise.all`; each parsed payload is several GB in JS, so four at
   once aborted the run with `JavaScript heap out of memory` (exit 134).
   Mandates are now processed sequentially, so peak memory does not depend on
   how many are requested. The per-country and per-subject work inside is still
   batched in parallel.
3. **A missing network from the 2025 run.** Mandate 9 had no
   `subject_Women_s_Rights_and_Gender_Equality` file even though every other
   mandate did, so selecting it would have 404'd. Filled with `--missing-only`.

## Leftovers from the 2025 process

Moved out of the served `public/` directory on 2026-08-22, not deleted — see
`data/archive/README.md` for provenance:

- `enriched_data/` (1.7 GB) → `data/archive/web-public-enriched_data/`.
  Byte-identical to `2025/data/final_enriched/`, so genuinely redundant.
- `main.ipynb` (2.3 MB) → `data/archive/web-public-main.ipynb`. **Not** a copy
  of `2025/main.ipynb` — an older, smaller version with a different checksum.

Still in place, superseded, left for you to decide:

- `2025/web/scripts/fix-mandate-9-subjects.py` and
  `add-cohesion-to-mandate-9-subjects.py` — one-off patches for mandate 9 files
  that were generated incomplete. The pipeline now produces subjects, session
  counts and cohesion for every mandate in one pass, so these are obsolete. The
  first also points at the old `enriched_data` path and would no longer find it.
- `2025/main.ipynb` — the original notebook. Superseded by this package, but
  it still holds the cohesion charts (`generate_all_mandate_charts`) which have
  not been ported.
