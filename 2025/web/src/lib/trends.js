/**
 * Cross-term trends.
 *
 * One row per parliamentary term, derived from the whole-Parliament precomputed
 * network of each mandate (`/data/precomputed/mandate_N.json`). Those files
 * carry `cohesionData`, computed at precompute time from the *full* edge set,
 * so the figures here are comparable across terms and do not depend on the
 * display-filtered edge list the canvas draws.
 *
 * Everything in this module is deliberately import-free: the derivation is a
 * pure function of `cohesionData`, so it can be replayed over the raw files by
 * a plain node script.
 */

/** Group id used for MEPs who sit in no political group. */
export const NON_ATTACHED = "NonAttached";

/** The five terms, oldest first. `years` is display text only. */
export const TERMS = [
  { mandate: 6, short: "T6", years: "2004–09" },
  { mandate: 7, short: "T7", years: "2009–14" },
  { mandate: 8, short: "T8", years: "2014–19" },
  { mandate: 9, short: "T9", years: "2019–24" },
  { mandate: 10, short: "T10", years: "2024–" },
];

/**
 * Arithmetic mean, or null for an empty list.
 * @param {number[]} values
 * @returns {number|null}
 */
function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Every unordered pair of political groups with its agreement score.
 *
 * `intergroupCohesion.matrix` is symmetric with the intragroup score on the
 * diagonal, so the upper triangle is the full set of *cross*-group values and
 * its mean equals the mean of every off-diagonal cell. Non-attached members are
 * not in the matrix.
 *
 * @param {{groups?: string[], matrix?: number[][]}|null|undefined} intergroup
 * @returns {Array<{a: string, b: string, score: number}>}
 */
function groupPairs(intergroup) {
  const groups = (intergroup && intergroup.groups) || [];
  const matrix = (intergroup && intergroup.matrix) || [];
  return groups
    .flatMap((a, i) =>
      groups.slice(i + 1).map((b, j) => ({
        a,
        b,
        score: matrix[i] ? matrix[i][i + 1 + j] : undefined,
      }))
    )
    .filter((pair) => Number.isFinite(pair.score));
}

/**
 * Reduce one mandate's cohesion block to the handful of numbers the trend
 * panel plots. Pure — no fetching, no globals.
 *
 * @param {number} mandate
 * @param {Object|null} cohesionData - `cohesionData` from a precomputed file
 * @param {number} nodeCount - MEPs in that term's network
 * @returns {Object|null} one row of the series, or null if unusable
 */
export function summarizeTerm(mandate, cohesionData, nodeCount) {
  if (!cohesionData) return null;

  // Non-attached members are not a group: they never vote as one, and
  // including them would drag the within-group average down by ~4pp.
  const groups = (cohesionData.intragroupCohesion || []).filter(
    (item) => item && item.group !== NON_ATTACHED && Number.isFinite(item.score)
  );
  const countries = (cohesionData.countrySimilarity || []).filter(
    (item) => item && Number.isFinite(item.score)
  );
  const pairs = groupPairs(cohesionData.intergroupCohesion);
  if (groups.length === 0 || pairs.length === 0) return null;

  const byScore = (a, b) => b.score - a.score;
  const rankedGroups = [...groups].sort(byScore);
  const rankedCountries = [...countries].sort(byScore);
  const lowestPair = pairs.reduce(
    (lowest, pair) => (pair.score < lowest.score ? pair : lowest),
    pairs[0]
  );

  const term = TERMS.find((entry) => entry.mandate === mandate);
  return {
    mandate,
    short: term ? term.short : `T${mandate}`,
    years: term ? term.years : "",
    nodeCount,
    groupCount: groups.length,
    countryCount: countries.length,
    withinGroup: mean(groups.map((item) => item.score)),
    crossGroup: mean(pairs.map((pair) => pair.score)),
    withinCountry: mean(countries.map((item) => item.score)),
    lowestPair,
    mostCohesiveGroup: rankedGroups[0] || null,
    leastCohesiveGroup: rankedGroups[rankedGroups.length - 1] || null,
    mostCohesiveCountry: rankedCountries[0] || null,
    leastCohesiveCountry: rankedCountries[rankedCountries.length - 1] || null,
  };
}

/**
 * Request one mandate's precomputed file. Failures resolve to null rather than
 * rejecting, so a missing term drops out of the series instead of sinking it.
 * @param {number} mandate
 * @returns {Promise<Response|null>}
 */
function requestTerm(mandate) {
  return fetch(`/data/precomputed/mandate_${mandate}.json`)
    .then((response) => (response.ok ? response : null))
    .catch((error) => {
      console.warn(`Trend data unavailable for mandate ${mandate}:`, error);
      return null;
    });
}

/**
 * Parse one response and keep only the summary.
 *
 * The payload is 11-17 MB parsed. It is a local of this function and nothing
 * retains it, so it becomes collectable the moment the summary is returned.
 *
 * @param {number} mandate
 * @param {Promise<Response|null>} pending
 * @returns {Promise<Object|null>}
 */
async function extractTerm(mandate, pending) {
  try {
    const response = await pending;
    if (!response) return null;
    const payload = await response.json();
    return summarizeTerm(
      mandate,
      payload.cohesionData,
      payload.nodes ? payload.nodes.length : 0
    );
  } catch (error) {
    console.warn(`Could not read trend data for mandate ${mandate}:`, error);
    return null;
  }
}

async function buildSeries() {
  // Every request starts at once, so the five downloads overlap; the bodies are
  // then parsed one at a time so only one 11-17 MB payload is ever live.
  const pending = TERMS.map((term) => requestTerm(term.mandate));
  const rows = [];
  for (let i = 0; i < TERMS.length; i += 1) {
    const row = await extractTerm(TERMS[i].mandate, pending[i]);
    if (row) rows.push(row);
  }
  return rows;
}

// Held as the in-flight promise rather than the parsed result, so that a
// second caller during the load shares the one request set (same pattern as
// loadBaselines in lib/dataLoader.js).
let seriesPromise = null;

/**
 * The five-term series, fetched at most once per page load.
 * Call this lazily — it pulls ~70 MB of precomputed networks.
 * @returns {Promise<Array<Object>>} rows oldest term first; short on failure
 */
export async function loadTrendSeries() {
  if (seriesPromise === null) {
    seriesPromise = buildSeries().catch((error) => {
      console.warn("Trend series could not be built:", error);
      return [];
    });
  }
  return seriesPromise;
}
