# Archive

Files moved out of the website's `public/` directory on 2026-08-22, because
everything under `2025/web/public/` is served to anyone who can reach the site.
Nothing in the site or the pipeline reads these. Kept rather than deleted.

## `web-public-enriched_data/` (1.7 GB)

Was `2025/web/public/data/enriched_data/`. The browser used to download the
per-mandate file (500-850 MB each) purely to count voting sessions; that now
comes from the small `2025/web/public/data/voting_sessions.json` written by the
pipeline.

**Byte-identical to `2025/data/final_enriched/`** (verified with `cmp` on
mandates 6 and 10; all five files match on size). So this is a redundant second
copy and can be deleted whenever you like — the 2025 originals remain, and the
2026 equivalents are in `data/final/`.

## `web-public-main.ipynb` (2.3 MB)

Was `2025/web/public/data/main.ipynb` — the analysis notebook, being served
publicly from the site.

**Not** a copy of `2025/main.ipynb`: it is an older and smaller version
(2.3 MB, 2025-11-10 vs 6.7 MB, 2025-11-14) with a different checksum. Keep it if
you want that earlier state; it is not recoverable from the current notebook.

## Note

`2025/web/scripts/fix-mandate-9-subjects.py` points at the old
`public/data/enriched_data` path and will no longer find it. That script is
obsolete anyway — the pipeline produces subjects, session counts and cohesion
for every mandate in one pass.
