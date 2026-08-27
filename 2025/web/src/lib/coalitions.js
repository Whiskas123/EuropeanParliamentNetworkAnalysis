/**
 * Who wins votes together, read from `precomputed/coalitions.json`.
 *
 * A different measure from everything else in the sidebar. The agreement
 * figures are pairwise similarity over a term — how often two MEPs cast the
 * same ballot — which is dominated by the votes nobody contests. This file
 * carries the roll-call classification instead: on each vote, which families
 * were on the winning side, and for each family, who it shares that side with.
 * See pipeline/coalitions.py for how it is built.
 *
 * Nothing here needs a left/right axis, and that is deliberate: an earlier
 * version reported which *flank* a group had won with, which meant the site
 * was publishing a chart whose meaning rested on calling the EPP the right and
 * Renew the centre. Those labels are contested, so the questions were changed
 * to ones the roll-calls answer on their own.
 *
 * One file, ~290 KB, all five terms and all policy areas. Small enough to
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
 * Who one family shares a side with, in one view.
 *
 * Two readings of the same roll-calls, and the difference between them is the
 * point. `wonTogether` counts only the pivot's *wins* — of the votes this
 * family carried, how often was that one carrying it too — so its denominator
 * is `wins`. `sameSide` counts every decided vote, win or lose, so its
 * denominator is `votes`. A family can score high on the first and low on the
 * second by rarely winning except in someone else's company, which is exactly
 * what the far right does: 94% of its wins are votes the EPP also won, while
 * the two are on the same side on 38% of all votes.
 *
 * Sharing one denominator for both would make that difference invisible, so
 * each mode carries its own.
 *
 * @param {Object|null} view - from `viewFor`
 * @param {Object|null} data - from `loadCoalitions`, for the family order
 * @param {string} pivot - family id
 * @param {"wonTogether"|"sameSide"} mode
 * @returns {{votes: number, wins: number, denominator: number,
 *            rows: Array<{family: string, share: number, count: number}>}|null}
 */
export function allyShares(view, data, pivot, mode = "wonTogether") {
  const block = view && view.allies ? view.allies[pivot] : null;
  if (!block) return null;
  const families = (data && data.families) || [];
  const denominator = mode === "wonTogether" ? block.wins : block.votes;
  if (!denominator) return null;
  const counts = block[mode] || [];
  const rows = families
    .map((family, index) => ({ family, count: counts[index] }))
    .filter((row) => row.family !== pivot && Number.isFinite(row.count))
    .map((row) => ({ ...row, share: row.count / denominator }))
    .sort((a, b) => b.share - a.share);
  return { votes: block.votes, wins: block.wins, denominator, rows };
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
