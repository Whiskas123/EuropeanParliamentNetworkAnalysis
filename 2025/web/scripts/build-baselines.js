/**
 * Build public/data/baselines.json — the reference numbers the sidebar
 * compares a filtered view against.
 *
 * Every cohesion figure on the site describes whichever network is currently
 * open. On its own that says nothing: "Poland, 57.2%" is only interesting once
 * you know Poland usually sits at 72.9%. This file supplies the "usually".
 *
 * A baseline is always the same view with one filter removed, so the delta
 * isolates a single variable:
 *
 *   Poland x Gender Equality  ->  baseline is Poland, all policy areas
 *   all countries x Gender Eq ->  baseline is all countries, all policy areas
 *   Poland, all policy areas  ->  baseline is the whole Parliament
 *
 * That means we need the unfiltered network per mandate, plus each country's
 * all-policy-areas network. Both already exist as precomputed layouts; this
 * script only lifts their cohesionData out. The result is ~160 KB for all five
 * terms, against 16 MB for a single precomputed file, which is what makes it
 * affordable to have the baseline present on every view.
 *
 * Reads from disk rather than from the in-memory payloads of
 * precompute-layouts.js, so it is correct whether the layouts were just
 * regenerated or have been on disk since 2025.
 *
 *   node scripts/build-baselines.js          (or: npm run baselines)
 */

const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

const DATA_DIR = path.join(__dirname, "../public/data");
const PRECOMPUTED_DIR = path.join(DATA_DIR, "precomputed");
const OUTPUT_PATH = path.join(DATA_DIR, "baselines.json");

const MANDATES = [6, 7, 8, 9, 10];

// Scores are shown to one decimal place as a percentage, so four decimals here
// is already two more than anything can display. Rounding roughly halves the file.
const round = (n) =>
  typeof n === "number" && isFinite(n) ? Math.round(n * 10000) / 10000 : null;

/** The filename dataLoader.js would request for this country. */
function countryFileName(mandate, country) {
  return `mandate_${mandate}_${country.replace(/\s+/g, "_")}.json`;
}

async function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(await fsPromises.readFile(filePath, "utf-8"));
  } catch (error) {
    console.log(`    ⚠️  ${path.basename(filePath)}: ${error.message}`);
    return null;
  }
}

/**
 * Reduce one precomputed network's cohesionData to plain lookup maps.
 * Group pairs are keyed by their two acronyms sorted and joined with "|", so a
 * caller never has to know which way round the source matrix stored them.
 */
function extractBaseline(payload) {
  const cohesion = payload && payload.cohesionData;
  if (!cohesion) return null;

  const intragroup = {};
  (cohesion.intragroupCohesion || []).forEach((item) => {
    if (item && item.group) intragroup[item.group] = round(item.score);
  });

  const country = {};
  (cohesion.countrySimilarity || []).forEach((item) => {
    if (item && item.country) country[item.country] = round(item.score);
  });

  const intergroup = {};
  const inter = cohesion.intergroupCohesion;
  if (inter && Array.isArray(inter.groups) && Array.isArray(inter.matrix)) {
    inter.groups.forEach((g1, i) => {
      const row = inter.matrix[i];
      if (!Array.isArray(row)) return;
      inter.groups.forEach((g2, j) => {
        const score = row[j];
        if (typeof score !== "number" || !isFinite(score)) return;
        const key = [g1, g2].sort().join("|");
        // The matrix is symmetric; keep whichever half we reach first.
        if (intergroup[key] === undefined) intergroup[key] = round(score);
      });
    });
  }

  return {
    intragroup,
    country,
    intergroup,
    nodeCount: Array.isArray(payload.nodes) ? payload.nodes.length : null,
  };
}

async function buildMandate(mandate) {
  const full = await readJson(path.join(PRECOMPUTED_DIR, `mandate_${mandate}.json`));
  if (!full) {
    console.log(`  ✗ mandate ${mandate}: no precomputed network on disk`);
    return null;
  }

  const root = extractBaseline(full);
  if (!root) {
    console.log(`  ✗ mandate ${mandate}: precomputed network carries no cohesionData`);
    return null;
  }

  const result = { _all: root };

  // The authoritative country list is the one the unfiltered network itself
  // reports, so the keys here are exactly the strings the UI will look up.
  const countries = Object.keys(root.country).sort();
  let found = 0;
  for (const country of countries) {
    const payload = await readJson(
      path.join(PRECOMPUTED_DIR, countryFileName(mandate, country))
    );
    const baseline = payload && extractBaseline(payload);
    if (baseline) {
      result[country] = baseline;
      found += 1;
    }
  }

  console.log(
    `  ✓ mandate ${mandate}: ${Object.keys(root.intragroup).length} groups, ` +
      `${countries.length} countries (${found} with their own baseline)`
  );
  if (found < countries.length) {
    // Not fatal: a country view without its own baseline simply falls back to
    // comparing against the whole Parliament, which the loader handles.
    console.log(
      `    ⚠️  ${countries.length - found} country network(s) missing — those ` +
        `views will compare against the full Parliament instead`
    );
  }
  return result;
}

async function main() {
  console.log("Building baselines.json...\n");

  const baselines = {};
  for (const mandate of MANDATES) {
    const built = await buildMandate(mandate);
    if (built) baselines[mandate] = built;
  }

  if (Object.keys(baselines).length === 0) {
    console.error("\n✗ No baselines could be built — nothing written.");
    process.exitCode = 1;
    return;
  }

  await fsPromises.writeFile(OUTPUT_PATH, JSON.stringify(baselines));
  const kb = Math.round((await fsPromises.stat(OUTPUT_PATH)).size / 1024);
  console.log(`\n✓ Wrote ${path.relative(process.cwd(), OUTPUT_PATH)} (${kb} KB)`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main, extractBaseline, countryFileName };
