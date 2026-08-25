/**
 * Measure the distribution of every delta the sidebar can draw, so that the
 * "extraordinary here" thresholds in CohesionInsights.js are a measurement
 * rather than a guess.
 *
 * A delta is always the same comparison the rest of the site draws: the open
 * view against the same view with one filter removed. This walks every view
 * that has a precomputed layout on disk, recomputes those deltas against
 * baselines.json, and prints the percentiles of |delta| for each of the three
 * kinds the sidebar shows.
 *
 * The three kinds are on completely different scales, which is the whole
 * reason the thresholds are per-kind:
 *
 *   median |delta|   group 1.3pp    country 3.4pp    pair 7.4pp
 *
 * One number applied across all three would call an ordinary pair movement
 * extraordinary and miss a group split twice its typical size.
 *
 * The reported percentiles are taken over views resting on at least
 * MIN_SESSIONS voting sessions. Thin policy areas are 13% of all the figures
 * but 26-29% of every extreme tail — a delta computed over 12 voting sessions
 * swings for free — so including them would set the bar using exactly the
 * figures that should not be setting it. The site still shows insights for
 * thin views; it says what they rest on.
 *
 * Only views the site can actually open are measured. The precomputed
 * directory still carries files for policy areas that no longer exist — 142
 * "Others" files left behind when that residual was reclassified, one of them
 * containing NaN — and a threshold derived partly from data the site no longer
 * serves would be a threshold nobody could reproduce from what is published.
 * Each mandate's own subject list is the authority on what counts.
 *
 * Reads only files already on disk. Never runs the pipeline, never opens
 * mandate_N/data.json.
 *
 *   node scripts/measure-delta-percentiles.js          all five terms
 *   node scripts/measure-delta-percentiles.js 10       one term
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../public/data");
const PRECOMPUTED_DIR = path.join(DATA_DIR, "precomputed");
const BASELINES_PATH = path.join(DATA_DIR, "baselines.json");

const MANDATES = [6, 7, 8, 9, 10];

// The publishing floor. Below this a view's figures are reported but are not
// used to calibrate what "extraordinary" means.
const MIN_SESSIONS = 60;

// Not a political group — the absence of one — so its internal agreement is
// not a property of anything. Left out here exactly as the sidebar leaves it
// out of the group and pair figures.
const NOT_A_GROUP = "NonAttached";

const KINDS = ["group", "country", "pair"];
const LEVELS = [0.5, 0.75, 0.9, 0.95, 0.98, 0.99, 0.995];

const pairKey = (a, b) => [a, b].sort().join("|");

/**
 * The policy areas a mandate actually offers, from its own top-level layout.
 * Anything else on disk is a leftover from a previous classification run.
 */
function reachableSubjects(mandate) {
  const file = path.join(PRECOMPUTED_DIR, `mandate_${mandate}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const list = JSON.parse(fs.readFileSync(file, "utf-8")).subjects || [];
    return new Set(list.map((s) => (typeof s === "string" ? s : s.name)));
  } catch (error) {
    console.error(`  ⚠️  mandate_${mandate}.json: ${error.message}`);
    return null;
  }
}
const pp = (v) => (v * 100).toFixed(1);

function quantile(sorted, p) {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * Which baseline a view is measured against, and therefore which kinds of
 * figure are comparable at all. Mirrors getBaseline() in lib/dataLoader.js and
 * the comparability rules in the sidebar:
 *
 *   "subject"  the country filter (if any) is on both sides — everything counts
 *   "country"  the view has a country the baseline does not — pairs only, since
 *              a country's own agreement is identical on both sides and a
 *              group's is inflated by the shared delegation
 *   "both"     country and subject against the unfiltered term — no group rows,
 *              same national confound
 */
function resolveBaseline(forMandate, country, subject) {
  if (subject) {
    const scoped = country ? forMandate[country] : null;
    if (country && scoped) return { scores: scoped, comparing: "subject" };
    if (country) return { scores: forMandate._all, comparing: "both" };
    return { scores: forMandate._all, comparing: "subject" };
  }
  return { scores: forMandate._all, comparing: "country" };
}

function collect(view, base, comparing, meta, buckets) {
  const cohesion = view.cohesionData || {};

  if (comparing === "subject") {
    for (const item of cohesion.intragroupCohesion || []) {
      if (!item || item.group === NOT_A_GROUP) continue;
      const reference = base.intragroup?.[item.group];
      if (typeof reference !== "number" || typeof item.score !== "number") continue;
      buckets.group.push({ ...meta, delta: item.score - reference });
    }
  }

  if (comparing !== "country") {
    for (const item of cohesion.countrySimilarity || []) {
      if (!item) continue;
      const reference = base.country?.[item.country];
      if (typeof reference !== "number" || typeof item.score !== "number") continue;
      buckets.country.push({ ...meta, delta: item.score - reference });
    }
  }

  // Upper triangle only: the matrix is symmetric and its diagonal is the
  // intragroup figure already counted above.
  const groups = cohesion.intergroupCohesion?.groups || [];
  const matrix = cohesion.intergroupCohesion?.matrix || [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (groups[i] === NOT_A_GROUP || groups[j] === NOT_A_GROUP) continue;
      const score = matrix[i]?.[j];
      const reference = base.intergroup?.[pairKey(groups[i], groups[j])];
      if (typeof reference !== "number" || typeof score !== "number") continue;
      buckets.pair.push({ ...meta, delta: score - reference });
    }
  }
}

/** The view's own session count, resolved the way dataLoader.js resolves it. */
function sessionsFor(view, subject) {
  const sessions = view.votingSessions;
  if (typeof sessions === "number") return sessions;
  if (!sessions || typeof sessions !== "object") return null;
  if (subject) {
    const bySubject = sessions.bySubject || {};
    return typeof bySubject[subject] === "number" ? bySubject[subject] : null;
  }
  return typeof sessions.total === "number" ? sessions.total : null;
}

function main() {
  const only = process.argv[2] ? Number(process.argv[2]) : null;
  const mandates = only ? [only] : MANDATES;

  if (!fs.existsSync(BASELINES_PATH)) {
    console.error(`Missing ${BASELINES_PATH}. Run: npm run baselines`);
    process.exit(1);
  }
  const baselines = JSON.parse(fs.readFileSync(BASELINES_PATH, "utf-8"));
  const files = fs.readdirSync(PRECOMPUTED_DIR);
  const buckets = { group: [], country: [], pair: [] };
  let viewCount = 0;

  for (const mandate of mandates) {
    const forMandate = baselines[String(mandate)];
    if (!forMandate) {
      console.error(`No baselines for mandate ${mandate} — skipping.`);
      continue;
    }
    const subjects = reachableSubjects(mandate);
    if (!subjects) {
      console.error(`No subject list for mandate ${mandate} — skipping.`);
      continue;
    }
    const prefix = `mandate_${mandate}_`;
    let skipped = 0;
    for (const file of files) {
      if (!file.startsWith(prefix) || !file.endsWith(".json")) continue;
      let view;
      try {
        view = JSON.parse(fs.readFileSync(path.join(PRECOMPUTED_DIR, file), "utf-8"));
      } catch (error) {
        console.error(`  ⚠️  ${file}: ${error.message}`);
        continue;
      }
      const country = view.country || null;
      const subject = view.subject || null;
      // The unfiltered term is its own baseline; there is nothing to compare.
      if (!country && !subject) continue;
      // A policy area the site no longer offers.
      if (subject && !subjects.has(subject)) {
        skipped++;
        continue;
      }

      const { scores, comparing } = resolveBaseline(forMandate, country, subject);
      const meta = {
        view: `${mandate}|${country || "-"}|${subject || "-"}`,
        sessions: sessionsFor(view, subject),
      };
      collect(view, scores, comparing, meta, buckets);
      viewCount++;
      if (viewCount % 200 === 0) process.stderr.write(`  ${viewCount} views\r`);
    }
    if (skipped > 0) {
      console.error(
        `  mandate ${mandate}: skipped ${skipped} views for policy areas the site no longer offers`
      );
    }
  }
  process.stderr.write(`  ${viewCount} views read\n\n`);

  const wellSampled = (row) => (row.sessions ?? Infinity) >= MIN_SESSIONS;

  console.log(`Views read: ${viewCount}   (terms ${mandates.join(", ")})`);
  console.log(`Percentiles of |delta|, over views of ${MIN_SESSIONS}+ voting sessions.\n`);
  console.log(
    ["kind".padEnd(8), "n".padStart(6), ...LEVELS.map((p) => `p${p * 100}`.padStart(7))].join("")
  );
  const thresholds = {};
  for (const kind of KINDS) {
    const rows = buckets[kind].filter(wellSampled);
    const sorted = rows.map((r) => Math.abs(r.delta)).sort((a, b) => a - b);
    thresholds[kind] = quantile(sorted, 0.95);
    console.log(
      [
        kind.padEnd(8),
        String(sorted.length).padStart(6),
        ...LEVELS.map((p) => pp(quantile(sorted, p)).padStart(7)),
      ].join("")
    );
  }

  // How over-represented the thin views are in each tail — the reason the
  // percentiles above exclude them.
  console.log("\nShare of each 99th-percentile tail resting on fewer than");
  console.log(`${MIN_SESSIONS} voting sessions, against that share of all figures:\n`);
  for (const kind of KINDS) {
    const rows = buckets[kind];
    const sorted = rows.map((r) => Math.abs(r.delta)).sort((a, b) => a - b);
    const cut = quantile(sorted, 0.99);
    const tail = rows.filter((r) => Math.abs(r.delta) >= cut);
    const share = (list) => list.filter((r) => !wellSampled(r)).length / (list.length || 1);
    console.log(
      `  ${kind.padEnd(8)} overall ${(share(rows) * 100).toFixed(0)}%   tail ${(
        share(tail) * 100
      ).toFixed(0)}%`
    );
  }

  console.log("\n95th percentile — the thresholds CohesionInsights.js carries:\n");
  for (const kind of KINDS) {
    console.log(`  ${kind.padEnd(8)} ${pp(thresholds[kind])}pp`);
  }
}

main();
