/**
 * Who wins votes together, read from `precomputed/coalitions.json`.
 *
 * A different measure from everything else in the sidebar. The agreement
 * figures are pairwise similarity over a term — how often two MEPs cast the
 * same ballot — which is dominated by the votes nobody contests. This file
 * carries the roll-call classification instead: on each vote, which groups were
 * on the winning side, and for each group, who it shares that side with. See
 * pipeline/coalitions.py for how it is built.
 *
 * Nothing here needs a left/right axis, and that is deliberate: an earlier
 * version reported which *flank* a group had won with, which meant the site
 * was publishing a chart whose meaning rested on calling the EPP the right and
 * Renew the centre. Those labels are contested, so the questions were changed
 * to ones the roll-calls answer on their own.
 *
 * **The unit is a political group, not a family.** Everywhere else on the site
 * that draws five terms at once has to merge groups into families, because
 * PSE and S&D are one line and there is no chart across a term boundary
 * otherwise. This panel is always inside one term, so it never needed the
 * merge, and the merge cost it the two splits that matter: term 8 ran EFDD and
 * ENF side by side, term 10 runs PfE and ESN, and pooling each pair into "the
 * far right" drew one bar for two groups that vote twenty points apart. The
 * term's own group names are read from `groups[mandate]`; `families.js` is
 * still what the cross-term charts use.
 *
 * One file, ~395 KB, all five terms and all policy areas. Bigger than the
 * family version because term 8 and term 10 now carry eight groups rather than
 * seven, and the coalition strings are longer. Still small enough to fetch
 * whole rather than per scope, unlike the trend series.
 *
 * **It has no country dimension, on purpose.** A group's direction on a vote is
 * the majority of its members across the house; filtering to one country's
 * MEPs would ask a different question — what Portugal's slice of the EPP did —
 * and answer it with a handful of members. The panels say so when a country is
 * selected rather than silently reporting the whole house, which is the trap
 * the trends panel was built to avoid.
 */

import { GROUP_FAMILY, opening } from "./families.js";
import { getGroupColor } from "./groupColors.js";
import { getGroupAcronym, getGroupDisplayName } from "./utils.js";

// Re-exported rather than redefined: a panel drawing groups then takes its
// whole vocabulary from this module, and there is still one implementation.
export { opening };

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
 * The groups that sat in one term, seated left to right.
 *
 * The order is the pipeline's and is load-bearing on screen: it is the order of
 * the squares that name a coalition, and a row of squares is only readable as a
 * shape if every row seats them the same way.
 *
 * @param {Object|null} data - from `loadCoalitions`
 * @param {number|string} mandate
 * @returns {string[]} raw group ids, e.g. ["The Left", …, "PfE", "ESN"]
 */
export function groupsIn(data, mandate) {
  return (data && data.groups && data.groups[String(mandate)]) || [];
}

/**
 * How one group is named, coloured and written about in one term.
 *
 * The panel writes sentences about whichever group is selected — "of the votes
 * PfE won", "who stands with the Greens" — and the raw ids are not what a
 * reader should see: `Verts/ALE` is the dump's spelling of Greens/EFA and
 * `PPE` of the EPP. The naming is `utils.js`'s, which is what the rest of the
 * sidebar already prints, and the colour is `groupColors.js`'s, so a bar here
 * is the same colour as the nodes it describes.
 *
 * `sentence` is what goes mid-sentence and `possessive` opens a heading.
 * Political group names split between the plural ones that take "the" and the
 * ones that do not: "the EPP won" but "PfE won", "the Greens' allies" but
 * "ESN's allies". Getting that wrong reads as a broken template, so it is
 * decided once here rather than at each of the dozen call sites.
 *
 * @param {string} groupId
 * @param {number|string} mandate
 * @returns {{id: string, label: string, short: string, sentence: string,
 *            possessive: string, color: string, family: string|null,
 *            fullName: string}}
 */
export function groupInfo(groupId, mandate) {
  const acronym = getGroupAcronym(groupId, Number(mandate));
  const sentence = sentenceName(acronym);
  return {
    id: groupId,
    label: acronym,
    // Greens/EFA is the only name too wide for a chip or an axis tick.
    short: acronym === "Greens/EFA" ? "Greens" : acronym,
    sentence,
    // The apostrophe follows the sentence form and not the acronym, because
    // they can end differently: "Greens/EFA" would take "'s" where "the
    // Greens" takes a bare "'".
    possessive: `${sentence}${sentence.endsWith("s") ? "'" : "'s"}`,
    color: getGroupColor(groupId),
    family: GROUP_FAMILY[groupId] || null,
    fullName: getGroupDisplayName(groupId, Number(mandate)),
  };
}

/**
 * The group names an English sentence puts "the" in front of.
 *
 * Not a style preference: these are the names that read as a noun phrase
 * rather than as a proper name. "The EPP won" and "PfE won" are both right,
 * and swapping them is what makes generated prose read as generated. Listed by
 * the acronym `getGroupAcronym` produces, since that is what the sentence will
 * contain.
 */
const TAKES_THE = new Set(["EPP", "EPP-ED", "PES", "S&D"]);

/**
 * The two names that are not their acronym mid-sentence.
 *
 * `Greens/EFA` is the group's formal short name and it is what the chips and
 * the legend say, but a sentence does not: "of the votes the Greens/EFA won"
 * is a label dropped into prose. `The Left` arrives with its own article, so it
 * is lower-cased rather than given a second one.
 */
const SENTENCE_NAME = {
  "Greens/EFA": "the Greens",
  "The Left": "the Left",
};

/** One group's name as it appears mid-sentence. */
function sentenceName(acronym) {
  if (SENTENCE_NAME[acronym]) return SENTENCE_NAME[acronym];
  return TAKES_THE.has(acronym) ? `the ${acronym}` : acronym;
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
 * Who one group shares a side with, in one view.
 *
 * Two readings of the same roll-calls. `wonTogether` counts only the pivot's
 * *wins* — of the votes this group carried, how often was that one carrying it
 * too. `sameSide` counts every decided vote, win or lose.
 *
 * **Only `wonTogether` is drawn.** `sameSide` measures alignment, and so does
 * the pairwise agreement the whole rest of the site is built from, and the two
 * disagree by three to six points because this one gives a group a single
 * position per vote and counts a bloc abstention as a side. Publishing both put
 * two answers to one question on one screen — the Greens and The Left at 79%
 * here and 85% in the grid below it. Alignment now comes from `pairwiseShares`
 * alone. The counts stay in the payload and this function still returns them,
 * because they are the honest roll-call answer and worth having; nothing draws
 * them.
 *
 * **Each pair carries its own denominator**, published by the pipeline as
 * `bothWins` and `bothVotes`. Two groups do not always sit at the same time:
 * ENF was constituted eleven months into term 8, so 986 of that term's decided
 * votes happened before it existed. Dividing by the pivot's own total would
 * count those as votes ENF took the other side on, and understate every ENF
 * figure in the term by about a tenth. Where both groups sat the whole term the
 * pair denominator equals the pivot's total and nothing changes.
 *
 * @param {Object|null} view - from `viewFor`
 * @param {Object|null} data - from `loadCoalitions`, for the term's group order
 * @param {number|string} mandate
 * @param {string} pivot - group id
 * @param {"wonTogether"|"sameSide"} mode
 * @returns {{votes: number, wins: number, denominator: number,
 *            rows: Array<{group: string, share: number, count: number,
 *                         denominator: number}>}|null}
 */
export function allyShares(view, data, mandate, pivot, mode = "wonTogether") {
  const block = view && view.allies ? view.allies[pivot] : null;
  if (!block) return null;
  const groups = groupsIn(data, mandate);
  const counts = block[mode] || [];
  const denominators =
    block[mode === "wonTogether" ? "bothWins" : "bothVotes"] || [];
  const rows = groups
    .map((group, index) => ({
      group,
      count: counts[index],
      denominator: denominators[index],
    }))
    .filter(
      (row) =>
        row.group !== pivot &&
        Number.isFinite(row.count) &&
        Number.isFinite(row.denominator) &&
        row.denominator > 0
    )
    .map((row) => ({ ...row, share: row.count / row.denominator }))
    .sort((a, b) => b.share - a.share);
  if (rows.length === 0) return null;
  return {
    votes: block.votes,
    wins: block.wins,
    // The pivot's own total, for the lede sentence. Individual rows divide by
    // their own pair denominator, which can be smaller.
    denominator: mode === "wonTogether" ? block.wins : block.votes,
    rows,
  };
}

/**
 * The two files describe the same term with two spellings for two groups.
 *
 * `coalitions.json` takes its names from the pipeline's seating table, which
 * calls term 9 and 10's left group "The Left" and the liberals "Renew". The
 * network's cohesion matrix is built from the vote dump's own group ids, which
 * still say "GUE/NGL" and "RE". They are the same groups. Checked across all
 * five terms: these two are the only ids that ever disagree, and no term
 * carries both spellings at once, so the map is unambiguous in both directions.
 */
const COHESION_ALIAS = { "The Left": "GUE/NGL", Renew: "RE" };

/**
 * How much one group's members actually vote like every other group's.
 *
 * The pairwise agreement the rest of the site is built from, read off the
 * cohesion matrix the heatmap draws, and ranked for one pivot group. A cell is
 * the mean, over every pair of members with one from each group, of the share
 * of their common votes the two cast the same ballot on — which is exactly the
 * figure `pipeline/network.py` puts on an edge, and exactly what the printed
 * tutorial teaches a visitor to compute by hand.
 *
 * **Why this and not `allyShares(..., "sameSide")`.** Both answer "how much do
 * these two groups align" and they disagree by three to six points, because
 * the roll-call reading gives a group one position per vote — the majority of
 * its members — and counts a bloc abstention as a side. When 42 of 49 Greens
 * abstained and The Left voted for, that reads as opposition there and as
 * silence here. Neither is wrong, but the site published both under the same
 * word and the same pair of names, so the same question had two answers on one
 * screen. This is the one that matches the network the reader is looking at.
 *
 * **Scope follows the view.** The matrix passed in is whichever one the sidebar
 * is showing, so under a country or policy-area filter these bars narrow with
 * it — unlike the roll-call readings beside them, which are always the whole
 * chamber. The panel says so.
 *
 * No counts come back. A cell is a mean of per-pair shares, not a fraction of
 * one denominator, so there is no "N of M" to print under it; callers that draw
 * a count line have to leave it blank rather than invent one.
 *
 * @param {Object|null} intergroup - `cohesionData.intergroupCohesion`
 * @param {Object|null} data - from `loadCoalitions`, for the term's group order
 * @param {number|string} mandate
 * @param {string} pivot - group id, in `coalitions.json`'s spelling
 * @returns {{rows: Array<{group: string, share: number}>}|null}
 */
export function pairwiseShares(intergroup, data, mandate, pivot) {
  const axis = intergroup && intergroup.groups;
  const matrix = intergroup && intergroup.matrix;
  if (!axis || !matrix || !pivot) return null;

  const columnOf = (id) => {
    const direct = axis.indexOf(id);
    if (direct !== -1) return direct;
    const alias = COHESION_ALIAS[id];
    return alias ? axis.indexOf(alias) : -1;
  };

  const row = columnOf(pivot);
  if (row === -1 || !matrix[row]) return null;

  const rows = groupsIn(data, mandate)
    .filter((group) => group !== pivot)
    .map((group) => ({ group, share: matrix[row][columnOf(group)] }))
    // A pair with no members in common in this view lands as NaN, which JSON
    // carries as null. Dropped rather than drawn as zero, which would read as
    // "these two never agreed" instead of "there was nobody to compare".
    .filter((entry) => typeof entry.share === "number" && isFinite(entry.share))
    .sort((a, b) => b.share - a.share);

  return rows.length > 0 ? { rows } : null;
}

/**
 * The winning coalitions of one view, largest first, optionally only those the
 * pivot group was part of.
 *
 * Filtering by pivot is what makes the ranking answer "who does the EPP win
 * with" rather than "what wins": the coalitions the EPP is absent from are the
 * ones it *lost* to, and mixing the two in one ranked list would read as if
 * they were the same thing.
 *
 * @param {Object|null} view
 * @param {string|null} pivot - group id, or null for every coalition
 * @returns {Array<{groups: string[], votes: number, share: number}>}
 */
export function coalitionsFor(view, pivot = null) {
  const rows = (view && view.coalitions) || [];
  if (!pivot) return rows;
  return rows.filter((row) => (row.groups || []).includes(pivot));
}

/**
 * The spellings folded into one group id in one term, e.g. `PSE, S&D`.
 *
 * A rename that landed inside a term, not a lineage: the dump calls term 7's
 * Socialists PSE until July 2009 and S&D after, and they are one group with one
 * membership. Returned so a panel can say so, since a reader who knows the
 * term will wonder where PSE went.
 *
 * @param {Object|null} data
 * @param {number|string} mandate
 * @param {string} group
 * @returns {string[]} every spelling, or [] when the group was never renamed
 */
export function renamesFor(data, mandate, group) {
  const renames = data && data.renames ? data.renames[String(mandate)] : null;
  return (renames && renames[group]) || [];
}

/**
 * When a group was actually in the chamber, when that is not the whole term.
 *
 * ENF was constituted in June 2015 and has no ballot before it. A panel
 * reporting its shares has to be able to say that, or the reader reads a group
 * that sat for four fifths of a term as one that sat for all of it.
 *
 * @param {Object|null} view - a whole-term view; policy-area views carry none
 * @param {string} group
 * @returns {{from: string, to: string}|null}
 */
export function sittingOf(view, group) {
  return (view && view.sitting && view.sitting[group]) || null;
}

/**
 * The group in `mandate` that best answers to a group selected in another term.
 *
 * The panel keeps a selected group across a change of term, and the raw ids do
 * not survive one: picking PfE in term 10 and stepping back to term 9 has to
 * land on ID, not on nothing. The family table is what carries that lineage, so
 * it is used here and only here — to move a *selection*, never to merge a
 * measurement.
 *
 * A family that split into two groups resolves to the first of them in seating
 * order, since there is no better answer: term 9's ID going forward to term 10
 * lands on PfE, the larger of the two successors.
 *
 * @param {Object|null} data
 * @param {number|string} mandate - the term being moved to
 * @param {string|null} group - the group selected in the term being left
 * @returns {string|null} a group in `mandate`, or null
 */
export function carryPivot(data, mandate, group) {
  if (!group) return null;
  const groups = groupsIn(data, mandate);
  if (groups.includes(group)) return group;
  const family = GROUP_FAMILY[group];
  if (!family) return null;
  return groups.find((other) => GROUP_FAMILY[other] === family) || null;
}
