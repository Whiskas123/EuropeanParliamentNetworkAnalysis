# European Parliament voting-network pipeline

Turns the raw Parltrack dumps into the network files the website reads, in six
checked stages, plus one optional stage that labels what the six could not. Replaces the ad-hoc, out-of-order execution of
`2025/main.ipynb`, which produced the 2025 site.

## Updating the data

```bash
# 1. Decompress the new dumps into data/raw/
zstd -d new_data_2026/ep_votes.json.zst -o data/raw/ep_votes.json
zstd -d new_data_2026/ep_meps.json.zst  -o data/raw/ep_meps.json

# 2. Install the three third-party dependencies (numpy, requests, anthropic).
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

# 3. Run everything. Stops on the first failed check; publishes nothing unless
#    every gate passed.
.venv/bin/python -m pipeline.run all

# Or one stage at a time:
python3 -m pipeline.run votes      # split by mandate + assign subjects
python3 -m pipeline.run networks   # similarity networks  -> data/networks/
python3 -m pipeline.run compare    # diff against the previous published run
python3 -m pipeline.run publish    # copy into 2025/web/public/data/
python3 -m pipeline.run layouts    # ForceAtlas2 positions (node)
python3 -m pipeline.run verify     # check what is on disk for the site

# Optional, and outside `all` on purpose - see "Classifying the residual":
python3 -m pipeline.run classify   # label the "Others" votes with a model
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
| `--validate N` | `classify` only: score the classifier against N known-good labels and stop |
| `--apply` | `classify` only: actually write the labels (without it nothing is written) |
| `--limit N` | `classify` only: send at most N cases to the model |

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

## Classifying the residual

The subject chain in `subjects.py` is evidence-based: vote title → document
code → procedure reference → the committee OEIL says is responsible. When every
hop lands, the label is a fact about the procedure rather than an opinion, and
that is why the site publishes it unreviewed.

Some votes have no chain to follow — a joint motion whose procedure the APIs do
not carry, a procedure whose OEIL policy area maps to nothing in our vocabulary
("Community policies", "Secretariat-General"), or a vote with no document
reference at all. Those land in `Others`, which is not a subject: it is the
absence of one. As of the 2026 data that is **871 votes**, 1.9% of the corpus,
concentrated in mandates 9 (469), 8 (199) and 6 (143).

`classify` asks a model to read whatever evidence does exist and pick a
subject, so the residual disappears. It is kept deliberately separate from the
deterministic labels:

* it **only** runs on votes already labelled `Others` — it can never overwrite
  a label the evidence chain produced;
* `Others` is **not** in the vocabulary offered to the model, so it must commit
  to a subject and state its confidence rather than declining;
* every label it writes is recorded as `via = "llm:<model>:<confidence>"` in
  `subject_by_voteid.json`, so any number on the site can be traced back to how
  it was reached;
* nothing is written without `--apply`. The default run reports the shift it
  *would* cause and stops.

It is excluded from `all` because it costs money, asks a model rather than an
authority, and its output should be looked at before it becomes a published
number.

### Unit of work

871 votes are only **450 cases**: a vote on a paragraph, on an amendment and on
the final text of one resolution are three votes about one subject. Votes are
grouped by procedure reference where one exists and by normalised title where
none does, so the model reads each document once and sees all of its titles
together rather than one stripped fragment.

### A twenty-third subject

543 of the 871 have no document reference at all, and most are the House's own
business: `Modification de l'ordre du jour`, `Wednesday's agenda – Request by
the PfE Group`, `Calendrier des périodes de session`. Those are real votes, and
highly whipped ones, but they are not about a policy area and filing them under
one would be an invention. They get `Parliamentary Procedure` — a name for what
they are, rather than a residual.

### Which model

`--model` and `--effort` choose the classifier; the defaults are
`claude-sonnet-5` at `medium`. Which model is good enough here is a question
the validation harness answers with a number rather than something to assert —
this is bounded classification against a fixed 22-item enum on ~1,700-token
inputs, the shape of task a smaller model often handles at a fraction of the
latency. Validate the cheaper one first and only pay for more if the number
says to.

The label cache is keyed by model and prompt version, so switching either
re-asks rather than silently reusing an answer to a different question, and
each model's validation score is written to its own
`llm_classifier_validation_<model>.json`.

### One case per request

Cases go out **one at a time, eight in flight at once**. Batching them was the
original design and looked like the obvious economy; it failed three separate
ways and is worth recording so nobody reintroduces it:

* the model answered about 2 of 15 cases and closed the JSON array. Array
  schemas carry no length constraint, so a short answer is *valid* — prompt
  text saying "return 15 entries" cannot fix a structural gap;
* forcing completeness by making every case a required property hit
  `400 Schema is too complex for compilation` past about a dozen, because the
  API compiles that into a grammar accepting the properties in any order and
  the cost grows factorially. `$defs`/`$ref` does not help — size is not the
  constraint;
* the resulting unusual schema then drew a `500`.

One case per request makes the schema trivial, a partial answer structurally
impossible, and every answer independently cacheable — so an interrupted run
resumes exactly where it stopped instead of redoing a batch. The requests are
small and independent, so throughput comes back from concurrency instead.

### Why `reason` comes first in the schema

Structured output is generated in schema order. With `reason` last, it was
written *after* the subject was already committed and had no work left to do —
the first live run produced reasons of `"placeholder"`, `","` and the empty
string, on cases it had marked high confidence. That is precisely the failure
this pipeline is built to notice: a confident-looking label with no audit trail
behind it.

Moving `reason` ahead of `subject` makes the justification the thing the answer
is derived *from* rather than a caption attached to it, and the degenerate
reasons stopped immediately. Do not reorder these fields for tidiness.

### Validating it

```bash
.venv/bin/python -m pipeline.run classify --validate 200
```

Scores the classifier on cases whose deterministic label is *strongest* — the
full chain ran and OEIL's own policy area matched our vocabulary directly —
with the answer withheld, and writes every disagreement to
`data/reports/llm_classifier_validation.json`.

Two things make that comparison fair rather than flattering:

* held-out votes are grouped and rendered by the same code as the residual, so
  the model sees the same shape of evidence in both. Scoring it on single
  stripped amendment titles would understate it; showing it the procedure
  record would overstate it.
* the result is reported **stratified by how much the titles actually say**,
  because the two populations are not alike. The residual is 66% cases whose
  title names a topic ("Une stratégie européenne pour les matières premières
  critiques"); the held-out set is only 33%, because the strongest
  deterministic labels sit on legislative votes titled with nothing but a
  document code and a rapporteur's name. A single headline rate over the
  held-out set would understate performance on the population this is used on.

**Run the validation before `--apply`.** A classifier that cannot reproduce
known-good labels has no business inventing unknown ones.

### What the validation does *not* tell you

The held-out score understates this classifier, for a structural reason worth
knowing before you read it. Held-out cases are drawn from votes whose
deterministic label is strongest, and those are legislative votes titled with a
document code and a rapporteur's name — 67% of them carry no topic in the
title, against 34% of the real residual. More importantly, no held-out case can
ever be `Parliamentary Procedure`, because that subject does not exist in the
deterministic labels — yet procedural votes are the largest single share of the
residual and the easiest thing in it to get right.

So the proxy is measured on the hardest slice and blind to the easiest. It is
still worth running, because it is the only *automatic* check available and it
catches a broken configuration immediately. It is not the number to judge the
output by.

### The hand audit

`data/reports/llm_residual_hand_audit.json` holds a 40-case sample of the
actual residual, drawn with probability proportional to votes, with a verdict
recorded per case. On the run of 2026-08-25:

| measure | result |
|---|---|
| case-weighted, unverifiable counted wrong | 85.0% |
| case-weighted, unverifiable excluded | 94.4% |
| **vote-weighted**, unverifiable counted wrong | **58.9%** |
| vote-weighted, unverifiable excluded | 71.8% |

The gap between the case and vote figures is the important part: errors are not
spread evenly. Agenda votes are one vote each and almost always right;
bare-titled resolutions carry thirty or sixty votes each and are where the
classifier fails. A handful of cases therefore decide most of the error.

**Every error and every unverifiable case in the sample was marked `low`
confidence.** No high- or medium-confidence answer was wrong. Confidence is a
usable filter, not decoration.

### Hand-verified overrides

`data/cache/manual_case_subjects.json` maps a case key to a subject that was
checked against the actual document, and takes precedence over the model. Those
votes are written with `via = "hand:verified"` so nothing on the site credits a
model with a human's answer. Every entry cites the document it was verified
against; an entry naming a case that no longer exists is reported rather than
ignored.

This is the intended finishing step, not a workaround. Correcting the dozen
largest low-confidence cases moves the vote-weighted accuracy further than any
prompt change, because those cases are where the votes are.

## Subjects that did not exist for the whole period

The vocabulary is the Parliament's own committee structure, which is what makes
a subject a *fact* about a procedure rather than an editorial judgement. But the
committees changed, and pinning a present-day structure onto 2004 invents
distinctions that were not there.

`config.SUBJECT_MERGES` records these, keyed by mandate and applied when votes
are written (only the writer knows the term). Currently:

* **Public Health** folds into **Environment, Climate and Food Safety** for
  mandates 6-9. ENVI was the "Committee on the Environment, Public Health and
  Food Safety" until 2024; a separate health committee (SANT) exists only from
  term 10. The pre-2024 rows were 19 / 15 / 0 / 309 - three near-empty terms and
  one spike that is the COVID and Beating Cancer *special* committees, not a
  health committee. From term 10 the split is real and is kept.

Add to this table rather than editing `SUBJECT_MAPPING` when a committee is
created or dissolved: the mapping answers "what did OEIL call it", the merges
answer "did that committee exist yet".

## Networks too thin to publish

A per-subject network needs enough votes for a position to carry information.
`config.MIN_SUBJECT_VOTES` (50) is the floor; below it the subject is left out
of that mandate's network entirely and the omission is reported.

This is deliberately a hard exclusion rather than a caveat. Culture and
Education in mandate 10 has two votes, Petitions in mandate 7 has three - and a
layout built from three votes looks precisely as authoritative on screen as one
built from three thousand. Since node position is what carries meaning here, a
position that is really sampling noise is the most misleading thing the site
could show. A footnote does not fix that; not drawing it does.

The vote counts themselves are unaffected: a withheld subject still appears in
the per-mandate totals, it simply has no network to open.

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

**"Others" was never a real category.** It held procedural votes (agenda
changes, requests by groups) that have no procedure behind them, alongside
votes whose procedure could not be resolved — two quite different things under
one name that reads like a subject. The `classify` step separates them: the
first become `Parliamentary Procedure`, the second get a subject from the
model. Before that step runs it is 1.9% of the corpus and 1.4% of mandate 10.

**The classifier's failure mode is a stall, not an error.** The SDK's default
request timeout is ten minutes, which is the wrong order of magnitude for a
batch that normally takes two or three; the first run of the step sat silently
on one stalled request for ten minutes before its first retry, looking
identical to slow progress. `_client()` now sets `timeout=300` and
`max_retries=3`, and each completed batch prints elapsed time so a slow run is
visibly slow. If you pipe the step's output anywhere, do not pipe it through
`tail` — that buffers everything until the process exits, which is how the
stall stayed invisible.

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
