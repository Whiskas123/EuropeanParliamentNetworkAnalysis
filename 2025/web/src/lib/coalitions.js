/**
 * Who wins votes together, read from `precomputed/coalitions.json`.
 *
 * A different measure from everything else in the sidebar. The agreement
 * figures are pairwise similarity over a term — how often two MEPs cast the
 * same ballot — which is dominated by the votes nobody contests. This file
 * carries the roll-call classification instead: on each vote, which families
 * were on the winning side, and which flank the pivot group carried the day
 * with. See pipeline/coalitions.py for how it is built.
 *
 * One file, ~200 KB, all five terms and all policy areas. Small enough to
 * fetch whole rather than per scope, unlike the trend series.
 *
 * **It has no country dimension, on purpose.** A group's direction on a vote is
 * the majority of its members across the house; filtering to one country's
 * MEPs would ask a different question — what Portugal's slice of the EPP did —
 * and answer it with a handful of members. The panels say so when a country is
 * selected rather than silently reporting the whole house, which is the trap
 * the trends panel was built to avoid.
 */

const SOURCE = "/data/precomputed/coalitions.json";

// Held as the in-flight promise rather than the parsed result, so a second
// caller during the load shares the one request (same pattern as
// loadBaselines in dataLoader.js and loadTrendSeries in trends.js).
let pending = null;

/**
 * The whole file, fetched at most once per page load.
 *
 * Resolves to null rather than rejecting: this drives one panel, and a panel
 * that cannot load should say so in its own space rather than take the tab
 * down with it.
 *
 * @returns {Promise<Object|null>}
 */
export function loadCoalitions() {
  if (!pending) {
    pending = fetch(SOURCE)
      .then((response) => (response.ok ? response.json() : null))
      .catch((error) => {
        console.warn("Coalition data could not be read:", error);
        return null;
      });
  }
  return pending;
}

/**
 * One term at one policy area, or the whole term when no area is selected.
 *
 * Returns null when the file has no such view — a policy area that saw no
 * decided votes in that term — so the caller draws its own absence.
 *
 * @param {Object|null} data - from `loadCoalitions`
 * @param {number|string} mandate
 * @param {string|null} subject
 * @returns {Object|null}
 */
export function viewFor(data, mandate, subject = null) {
  const term = data && data.mandates ? data.mandates[String(mandate)] : null;
  if (!term) return null;
  if (!subject) return term;
  const view = (term.bySubject || {})[subject];
  return view || null;
}

/**
 * One pivot family's flank tally in one view, as shares.
 *
 * @param {Object|null} view - from `viewFor`
 * @param {string} pivot - family id
 * @returns {{votes: number, consensus: number, left: number, right: number,
 *            alone: number}|null} shares in 0..1, with the raw vote count
 */
export function flankShares(view, pivot) {
  const block = view && view.pivots ? view.pivots[pivot] : null;
  if (!block || !block.votes) return null;
  const share = (value) => value / block.votes;
  return {
    votes: block.votes,
    consensus: share(block.consensus),
    left: share(block.left),
    right: share(block.right),
    alone: share(block.alone),
  };
}

/**
 * The winning coalitions of one view, largest first, optionally only those the
 * pivot family was part of.
 *
 * Filtering by pivot is what makes the ranking answer "who does the EPP win
 * with" rather than "what wins": the coalitions the EPP is absent from are the
 * ones it *lost* to, and mixing the two in one ranked list would read as if
 * they were the same thing.
 *
 * @param {Object|null} view
 * @param {string|null} pivot - family id, or null for every coalition
 * @returns {Array<{groups: string[], votes: number, share: number}>}
 */
export function coalitionsFor(view, pivot = null) {
  const rows = (view && view.coalitions) || [];
  if (!pivot) return rows;
  return rows.filter((row) => (row.groups || []).includes(pivot));
}

/**
 * Which raw groups stood for each family in one term, e.g. `PfE, ESN`.
 *
 * @param {Object|null} data
 * @param {number|string} mandate
 * @param {string} family
 * @returns {string[]}
 */
export function lineageFor(data, mandate, family) {
  const lineage = data && data.lineage ? data.lineage[String(mandate)] : null;
  return (lineage && lineage[family]) || [];
}
