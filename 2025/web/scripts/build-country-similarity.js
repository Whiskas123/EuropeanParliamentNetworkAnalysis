/**
 * Build public/data/country_similarity.json — each MEP's average agreement
 * with their compatriots.
 *
 * Why this file exists
 * --------------------
 * The site fetches `mandate_{m}/data.json` (305 MB) on every view change, when
 * the 16 MB precomputed layout already carries positions, cohesion and the
 * per-MEP agreement scores. Switching the loader to the small file is the
 * single biggest speed-up available — except for one statistic.
 *
 * A precomputed file's `edges` array is filtered to `weight > 0.6` for layout
 * legibility. Averages taken over it are therefore inflated: they count an
 * MEP's agreements and silently drop their disagreements. Measured against the
 * full edge set, per-MEP country similarity computed from the filtered array is
 * wrong by 17 percentage points on average and by as much as 56.
 *
 * Everything else the MEP panel shows survives the switch, because it is
 * precomputed from the complete edge set:
 *   - `agreementScores` (agreement per political group) — verified identical
 *   - `cohesionData` — precompute-layouts.js computes it from all edges
 * Country similarity is the one number with no precomputed equivalent, so it
 * is computed here, once, from the full edges and published alongside.
 *
 * Shape: {mandate: {subject|"_all": {mepId: [score, count]}}}
 * A two-element array rather than an object because this file has ~80,000
 * entries and the key names would otherwise be most of its bytes.
 *
 * Country views need no entry of their own: restricting the network to one
 * country keeps every pair of compatriots, so an MEP's country similarity is
 * the same there as in the full view.
 *
 *   node --max-old-space-size=8192 scripts/build-country-similarity.js
 *   (or: npm run country-similarity)
 */

const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

const DATA_DIR = path.join(__dirname, "../public/data");
const OUTPUT_PATH = path.join(DATA_DIR, "country_similarity.json");
const MANDATES = [6, 7, 8, 9, 10];

/** Scores render to one decimal as a percentage; four decimals is plenty. */
const round = (n) => Math.round(n * 10000) / 10000;

/**
 * Average agreement with compatriots, per MEP, over one edge list.
 *
 * @param {Array} edges - objects with Source/Target/Weight
 * @param {Map<string, string>} countryOf
 * @returns {Object} mepId -> [score, count]
 */
function compatriotAverages(edges, countryOf) {
  const totals = new Map();

  for (const edge of edges) {
    const source = edge.Source;
    const target = edge.Target;
    const country = countryOf.get(source);
    if (!country || country !== countryOf.get(target)) continue;

    const weight = typeof edge.Weight === "number" ? edge.Weight : parseFloat(edge.Weight);
    if (!isFinite(weight)) continue;

    let a = totals.get(source);
    if (!a) { a = { sum: 0, count: 0 }; totals.set(source, a); }
    a.sum += weight;
    a.count += 1;

    let b = totals.get(target);
    if (!b) { b = { sum: 0, count: 0 }; totals.set(target, b); }
    b.sum += weight;
    b.count += 1;
  }

  const out = {};
  totals.forEach((value, mepId) => {
    if (value.count > 0) out[mepId] = [round(value.sum / value.count), value.count];
  });
  return out;
}

async function buildMandate(mandate) {
  const dataPath = path.join(DATA_DIR, `mandate_${mandate}`, "data.json");
  if (!fs.existsSync(dataPath)) {
    console.log(`  ✗ mandate ${mandate}: ${dataPath} not found`);
    return null;
  }

  const data = JSON.parse(await fsPromises.readFile(dataPath, "utf-8"));
  const countryOf = new Map(
    (data.nodes || []).filter((n) => n.Country).map((n) => [n.Id, n.Country])
  );

  const result = { _all: compatriotAverages(data.edges || [], countryOf) };

  const bySubject = data.edgesBySubject || {};
  Object.keys(bySubject).forEach((subject) => {
    result[subject] = compatriotAverages(bySubject[subject], countryOf);
  });

  console.log(
    `  ✓ mandate ${mandate}: ${Object.keys(result._all).length} MEPs, ` +
      `${Object.keys(bySubject).length} policy areas`
  );
  return result;
}

async function main() {
  console.log("Building country_similarity.json...\n");

  const output = {};
  for (const mandate of MANDATES) {
    const built = await buildMandate(mandate);
    if (built) output[mandate] = built;
    // Each parsed data.json is several GB in JS. Encouraging collection
    // between mandates keeps peak memory to roughly one term's worth.
    if (global.gc) global.gc();
  }

  if (Object.keys(output).length === 0) {
    console.error("\n✗ Nothing built — no data.json files found. Nothing written.");
    process.exitCode = 1;
    return;
  }

  await fsPromises.writeFile(OUTPUT_PATH, JSON.stringify(output));
  const mb = ((await fsPromises.stat(OUTPUT_PATH)).size / 1024 / 1024).toFixed(2);
  console.log(`\n✓ Wrote ${path.relative(process.cwd(), OUTPUT_PATH)} (${mb} MB)`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main, compatriotAverages };
