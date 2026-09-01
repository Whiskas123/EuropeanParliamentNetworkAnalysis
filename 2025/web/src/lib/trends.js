/**
 * Cross-term trends, for whichever network is open.
 *
 * One row per parliamentary term, derived from the precomputed network of that
 * term *at the current scope* — `/data/precomputed/mandate_N.json` for the
 * whole Parliament, or the country / policy-area file the canvas is already
 * drawing from. Those files carry `cohesionData`, computed at precompute time
 * from the full edge set, so the figures are comparable across terms and do not
 * depend on the display-filtered edge list the canvas draws.
 *
 * The panel used to read the whole-Parliament file no matter what was on
 * screen, so with Poland x Fisheries open — 51 MEPs, 29 votes — it reported 696
 * MEPs and the Parliament's own averages. It now follows the view, and keeps
 * the Parliament series as a faint reference behind it.
 *
 * The derivation is a pure function of `cohesionData` with no fetching and no
 * globals, so it can be replayed over the raw files by a plain node script.
 * Its one import, `families.js`, holds the same property.
 */

import { familyCohesion, familyMembers, familyPairs } from "./families.js";

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
 * Below this many voting sessions a term is drawn but marked.
 *
 * A policy area's votes are lumpy across terms — Fisheries runs 127, 131, 178,
 * 289 and then 29 — and a point resting on 29 votes otherwise looks exactly as
 * solid as one resting on a thousand. That is the shape of every artefact this
 * site has produced, and these charts end up printed.
 */
export const MIN_TERM_SESSIONS = 60;

/**
 * The precomputed file for one term at one scope.
 *
 * Same encoding as loadPrecomputedLayout in dataLoader.js — countries keep
 * their punctuation and only lose spaces, subjects reduce every non-alphanumeric
 * character to an underscore. Kept in step with that function by hand; the two
 * read the same files.
 *
 * @param {number} mandate
 * @param {string|null} country
 * @param {string|null} subject
 * @returns {string}
 */
export function precomputedUrl(mandate, country, subject) {
  const base = `/data/precomputed/mandate_${mandate}`;
  const countryKey = country ? country.replace(/\s+/g, "_") : null;
  const subjectKey = subject ? subject.replace(/[^a-zA-Z0-9]/g, "_") : null;
  if (countryKey && subjectKey) return `${base}_${countryKey}_subject_${subjectKey}.json`;
  if (subjectKey) return `${base}_subject_${subjectKey}.json`;
  if (countryKey) return `${base}_${countryKey}.json`;
  return `${base}.json`;
}

/**
 * How many voting sessions the figures for this term rest on.
 *
 * A country filter does not change the number of votes, only who is counted in
 * them, so the count depends on the policy area alone.
 *
 * @param {{total?: number, bySubject?: Object}|number|null|undefined} votingSessions
 * @param {string|null} subject
 * @returns {number|null}
 */
export function sessionsForScope(votingSessions, subject) {
  if (typeof votingSessions === "number") return votingSessions;
  if (!votingSessions) return null;
  if (subject) {
    const count = (votingSessions.bySubject || {})[subject];
    return Number.isFinite(count) ? count : null;
  }
  return Number.isFinite(votingSessions.total) ? votingSessions.total : null;
}

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
 * The placeholder a term gets when its file does not exist at this scope.
 *
 * Croatia has no term 6, the United Kingdom none after term 8, and Culture and
 * Education stops before term 10. The row still occupies its slot so the axis
 * keeps five terms in the right places and the line breaks over the gap.
 *
 * @param {{mandate: number, short: string, years: string}} term
 * @returns {Object}
 */
function missingTerm(term) {
  return {
    ...term,
    missing: true,
    nodeCount: null,
    sessions: null,
    thin: false,
    // Present but empty rather than absent: every reader of a row looks these
    // up, and a gap in a chart is drawn from a row that exists and has nothing
    // in it, not from a row that has to be guarded against first.
    familyPairs: {},
    familyCohesion: {},
    familyMembers: {},
  };
}

/**
 * Reduce one term's cohesion block to the handful of numbers the panel plots.
 * Pure — no fetching, no globals.
 *
 * @param {number} mandate
 * @param {Object|null} cohesionData - `cohesionData` from a precomputed file
 * @param {number} nodeCount - MEPs in that term's network at this scope
 * @param {number|null} sessions - voting sessions the scope rests on
 * @returns {Object|null} one row of the series, or null if unusable
 */
export function summarizeTerm(mandate, cohesionData, nodeCount, sessions = null) {
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
  // A one-group delegation has no cross-group pair to average, which is a fact
  // about that network rather than a failure: the row still stands, with the
  // series that cannot be computed left null and drawn as a gap.
  if (groups.length === 0 && countries.length === 0) return null;

  const byScore = (a, b) => b.score - a.score;
  const rankedGroups = [...groups].sort(byScore);
  const rankedCountries = [...countries].sort(byScore);
  const lowestPair =
    pairs.length > 0
      ? pairs.reduce((lowest, pair) => (pair.score < lowest.score ? pair : lowest), pairs[0])
      : null;

  const term = TERMS.find((entry) => entry.mandate === mandate);
  return {
    mandate,
    short: term ? term.short : `T${mandate}`,
    years: term ? term.years : "",
    missing: false,
    nodeCount,
    sessions,
    thin: Number.isFinite(sessions) && sessions < MIN_TERM_SESSIONS,
    groupCount: groups.length,
    countryCount: countries.length,
    withinGroup: mean(groups.map((item) => item.score)),
    crossGroup: mean(pairs.map((pair) => pair.score)),
    withinCountry: mean(countries.map((item) => item.score)),
    // Every pair of political *families* — S&D rather than PSE-or-S&D, the far
    // right as one line rather than five. The only form in which a series can
    // cross a term boundary; see families.js for what the merge asserts.
    familyPairs: familyPairs(cohesionData.intergroupCohesion),
    // Each family's own groups' cohesion, for the by-family view of the first
    // chart. Built from the same filtered `groups` the withinGroup average
    // uses, so the two readings of this tab rest on one set of numbers.
    familyCohesion: familyCohesion(groups),
    familyMembers: familyMembers(
      (cohesionData.intergroupCohesion || {}).groups || []
    ),
    lowestPair,
    mostCohesiveGroup: rankedGroups[0] || null,
    leastCohesiveGroup: rankedGroups[rankedGroups.length - 1] || null,
    mostCohesiveCountry: rankedCountries[0] || null,
    leastCohesiveCountry: rankedCountries[rankedCountries.length - 1] || null,
  };
}

/**
 * Request one term's precomputed file. Failures resolve to null rather than
 * rejecting, so a term the scope does not reach drops to a gap instead of
 * sinking the series.
 *
 * @param {number} mandate
 * @param {string|null} country
 * @param {string|null} subject
 * @returns {Promise<Response|null>}
 */
function requestTerm(mandate, country, subject) {
  return fetch(precomputedUrl(mandate, country, subject))
    .then((response) => (response.ok ? response : null))
    .catch(() => null);
}

/**
 * How many MEPs a filtered view actually places.
 *
 * A country or policy-area view drops members with no agreement entry in it —
 * they voted too little here to be positioned — and the sidebar counts what is
 * left. The same rule has to run here or the panel reports one more MEP than
 * the strip directly above it. Kept in step with loadGraphData in
 * dataLoader.js, including its refusal to empty a network: if the rule would
 * remove everyone, the assumption behind it does not hold for that file.
 *
 * @param {Array<{id: string}>} nodes
 * @param {Object|null} agreementScores
 * @param {boolean} filtered - whether a country or policy area is selected
 * @returns {number}
 */
function placedCount(nodes, agreementScores, filtered) {
  if (!filtered || !agreementScores || !nodes) return nodes ? nodes.length : 0;
  const kept = nodes.filter((node) => {
    const entry = agreementScores[node.id];
    return entry && Object.values(entry).some((item) => (item?.count || 0) > 0);
  });
  return kept.length > 0 && kept.length < nodes.length ? kept.length : nodes.length;
}

/**
 * Parse one response and keep only the summary.
 *
 * At the whole-Parliament and policy-area scopes the payload is 11-17 MB
 * parsed. It is a local of this function and nothing retains it, so it becomes
 * collectable the moment the summary is returned. A country scope is 130 KB.
 *
 * @param {{mandate: number, short: string, years: string}} term
 * @param {Promise<Response|null>} pending
 * @param {string|null} country
 * @param {string|null} subject
 * @returns {Promise<Object>} the row, or a placeholder for a term with no file
 */
async function extractTerm(term, pending, country, subject) {
  try {
    const response = await pending;
    if (!response) return missingTerm(term);
    const payload = await response.json();
    const row = summarizeTerm(
      term.mandate,
      payload.cohesionData,
      placedCount(payload.nodes, payload.agreementScores, Boolean(country || subject)),
      sessionsForScope(payload.votingSessions, subject)
    );
    return row || missingTerm(term);
  } catch (error) {
    console.warn(`Could not read trend data for mandate ${term.mandate}:`, error);
    return missingTerm(term);
  }
}

/**
 * @param {string|null} country
 * @param {string|null} subject
 * @returns {Promise<Array<Object>>} always one row per term, oldest first
 */
async function buildSeries(country, subject) {
  // Every request starts at once, so the downloads overlap; the bodies are then
  // parsed one at a time so only one large payload is ever live.
  const pending = TERMS.map((term) => requestTerm(term.mandate, country, subject));
  const rows = [];
  for (let i = 0; i < TERMS.length; i += 1) {
    rows.push(await extractTerm(TERMS[i], pending[i], country, subject));
  }
  return rows;
}

// Held as the in-flight promise rather than the parsed result, so a second
// caller during the load shares the one request set (same pattern as
// loadBaselines in lib/dataLoader.js). Keyed by scope: the whole-Parliament
// series is fetched once per page load and reused as the reference behind every
// country and policy area.
const seriesCache = new Map();

/**
 * The five-term series for one scope, fetched at most once per page load.
 *
 * Call this lazily. A country scope is ~600 KB across the five terms; the whole
 * Parliament and a policy area are ~80 MB.
 *
 * @param {{country?: string|null, subject?: string|null}} [scope]
 * @returns {Promise<Array<Object>>} one row per term, oldest first
 */
export async function loadTrendSeries({ country = null, subject = null } = {}) {
  const key = `${country || ""}|${subject || ""}`;
  if (!seriesCache.has(key)) {
    seriesCache.set(
      key,
      buildSeries(country, subject).catch((error) => {
        console.warn("Trend series could not be built:", error);
        return TERMS.map(missingTerm);
      })
    );
  }
  return seriesCache.get(key);
}
