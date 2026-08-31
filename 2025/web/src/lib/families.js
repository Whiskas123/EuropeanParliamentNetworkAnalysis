/**
 * The seven political families, and the groups that made them up in each term.
 *
 * Nothing in the data is called "the Socialists". Term 6 has PSE, terms 7-10
 * have S&D; the liberals are ALDE then Renew; the far right is IND/DEM, then
 * EFD, then EFDD *and* ENF at once, then ID, then PfE *and* ESN at once. A
 * chart over five terms drawn on raw group ids is seven stubs and no trend, so
 * every chart that crosses a term boundary draws families instead.
 *
 * That merge is an editorial claim rather than a fact in the dump, and two of
 * the seven are genuinely arguable:
 *
 * - **UEN -> ECR.** ECR was founded in 2009 from UEN members and the British
 *   Conservatives, while the rest of UEN went to EFD. Treating them as one line
 *   is defensible and is not the only defensible answer.
 * - **The far right.** Four reshuffles, and in terms 8 and 10 two groups sat
 *   side by side. The line is their pooled position, which flattens a real
 *   split: term 10's PfE and ESN differ by up to 20 points in some areas.
 *
 * Both claims are shown on the page — the panels name the constituent groups
 * per term — so a reader can reject the lineage rather than having it applied
 * silently. Kept in step by hand with `GROUP_FAMILY` in pipeline/coalitions.py,
 * which classifies roll-calls with the same table.
 *
 * The order is the seating order, left to right. It is load-bearing: the house
 * profile chart uses it as an axis, and "the left flank" and "the right flank"
 * are slices of it.
 */

/** Family ids, seated left to right. */
export const FAMILY_ORDER = [
  "Left",
  "Greens",
  "S&D",
  "Liberals",
  "EPP",
  "Conservatives",
  "FarRight",
];

/**
 * One entry per family.
 *
 * `color` is the group colour the canvas already uses for that family's current
 * incarnation, so a line here is the same colour as the nodes it describes —
 * the sidebar's rule that a political group is always its own colour. `short`
 * is what fits under an axis tick.
 *
 * `sentence` and `possessive` exist because these names are plural and the
 * panels write sentences about whichever one is selected. "Who Socialists
 * agrees with" is what a template using `label` produces, and there is no
 * single verb form that fits both "the EPP" and "the Socialists" — so the
 * headings are built from the possessive instead, which is invariant, and
 * mid-sentence text takes `sentence` and avoids a present-tense verb.
 */
export const FAMILIES = {
  Left: {
    id: "Left",
    label: "The Left",
    short: "Left",
    sentence: "the Left",
    possessive: "the Left's",
    color: "#800080",
  },
  Greens: {
    id: "Greens",
    label: "Greens/EFA",
    short: "Greens",
    sentence: "the Greens",
    possessive: "the Greens'",
    color: "#009900",
  },
  "S&D": {
    id: "S&D",
    label: "Socialists",
    short: "S&D",
    sentence: "the Socialists",
    possessive: "the Socialists'",
    color: "#FF0000",
  },
  Liberals: {
    id: "Liberals",
    label: "Liberals",
    short: "Liberal",
    sentence: "the Liberals",
    possessive: "the Liberals'",
    color: "#FFD700",
  },
  EPP: {
    id: "EPP",
    label: "EPP",
    short: "EPP",
    sentence: "the EPP",
    possessive: "the EPP's",
    color: "#3399CC",
  },
  Conservatives: {
    id: "Conservatives",
    label: "Conservatives",
    short: "Cons",
    sentence: "the Conservatives",
    possessive: "the Conservatives'",
    color: "#000080",
  },
  FarRight: {
    id: "FarRight",
    label: "Far right",
    short: "Far right",
    sentence: "the far right",
    possessive: "the far right's",
    color: "#000000",
  },
};

/** First letter up, for a `sentence` or `possessive` that starts a heading. */
export function opening(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * Every group id either data source uses, mapped onto its family.
 *
 * Both spellings appear: `data/final` writes "The Left" and "Renew" where the
 * precomputed networks write "GUE/NGL" and "RE", so both are listed and this
 * one table serves either source.
 */
export const GROUP_FAMILY = {
  "GUE/NGL": "Left",
  "The Left": "Left",
  "Verts/ALE": "Greens",
  "Greens/EFA": "Greens",
  PSE: "S&D",
  "S&D": "S&D",
  ALDE: "Liberals",
  Renew: "Liberals",
  RE: "Liberals",
  "PPE-DE": "EPP",
  PPE: "EPP",
  UEN: "Conservatives",
  ECR: "Conservatives",
  "IND/DEM": "FarRight",
  EFD: "FarRight",
  EFDD: "FarRight",
  ENF: "FarRight",
  ID: "FarRight",
  PfE: "FarRight",
  ESN: "FarRight",
};

/**
 * Every spelling of one political group, across the site's two data sources.
 *
 * `data/final` — the roll-calls, and so the coalition panel — writes "The Left"
 * and "Renew" where the precomputed networks write "GUE/NGL" and "RE". They are
 * one group either way, and anything that matches a group id from one source
 * against a node from the other has to know it: the coalition panel asks the
 * canvas to light up "The Left" and no node in term 10 carries that id.
 *
 * Only true variants of one name are listed. ALDE and Renew are a real rename
 * too, but no source spells one as the other, and they belong to different
 * terms — so folding them here would buy nothing and assert more than the data
 * does.
 */
const GROUP_SPELLINGS = [
  ["GUE/NGL", "The Left"],
  ["PSE", "S&D"],
  ["PPE-DE", "PPE"],
  ["RE", "Renew"],
  ["Verts/ALE", "Greens/EFA"],
];

/** group id -> every id that names the same group, itself included. */
const SPELLINGS_OF = GROUP_SPELLINGS.reduce((table, names) => {
  names.forEach((name) => {
    table[name] = names;
  });
  return table;
}, {});

/**
 * Every id that names the same political group, itself included.
 *
 * @param {string} groupId
 * @returns {string[]}
 */
export function groupSpellings(groupId) {
  return SPELLINGS_OF[groupId] || [groupId];
}

/**
 * Whether two group ids name the same political group.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function sameGroup(a, b) {
  return a === b || groupSpellings(a).includes(b);
}

/** The flanks a pivot group is measured against; slices of the seating order. */
export const LEFT_FLANK = ["Left", "Greens", "S&D"];
export const RIGHT_FLANK = ["Conservatives", "FarRight"];

/**
 * @param {string} groupId
 * @returns {string|null} the family that group belongs to
 */
export function familyOf(groupId) {
  return GROUP_FAMILY[groupId] || null;
}

/**
 * Which raw groups stood for each family in one term's network.
 *
 * Drives the "PfE, ESN" note the panels print under a far-right line: the merge
 * has to be visible wherever it is drawn.
 *
 * @param {string[]} groups - group ids present, e.g. intergroupCohesion.groups
 * @returns {Object<string, string[]>} family id -> its groups, in the given order
 */
export function familyMembers(groups) {
  const members = {};
  (groups || []).forEach((group) => {
    const family = GROUP_FAMILY[group];
    if (!family) return;
    if (!members[family]) members[family] = [];
    members[family].push(group);
  });
  return members;
}

/**
 * Agreement between every pair of families, from one term's group matrix.
 *
 * `intergroupCohesion.matrix` is symmetric with each group's own cohesion on
 * the diagonal. A family pair averages the cells connecting the two families'
 * constituent groups — in term 10, EPP-to-far-right is the mean of PPE:PfE and
 * PPE:ESN.
 *
 * The average is unweighted, one cell one vote, which is the honest reading of
 * "how close is the EPP to the far right" when the far right is two groups of
 * different sizes. Where that flattening matters the panels also draw the
 * constituent groups, so the split is visible rather than assumed away.
 *
 * A family's pair *with itself* is not returned: the diagonal of this matrix
 * would mix intra-group cohesion with between-group agreement (in term 10,
 * PfE:ESN), which are different measures and must not average together.
 *
 * @param {{groups?: string[], matrix?: number[][]}|null|undefined} intergroup
 * @returns {Object<string, number>} keyed "A|B" with A before B in seating order
 */
export function familyPairs(intergroup) {
  const groups = (intergroup && intergroup.groups) || [];
  const matrix = (intergroup && intergroup.matrix) || [];
  const sums = {};

  groups.forEach((a, i) => {
    const familyA = GROUP_FAMILY[a];
    if (!familyA) return;
    groups.forEach((b, j) => {
      if (j <= i) return;
      const familyB = GROUP_FAMILY[b];
      if (!familyB || familyA === familyB) return;
      const score = matrix[i] ? matrix[i][j] : undefined;
      if (!Number.isFinite(score)) return;
      const key = pairKey(familyA, familyB);
      if (!sums[key]) sums[key] = { total: 0, count: 0 };
      sums[key].total += score;
      sums[key].count += 1;
    });
  });

  const pairs = {};
  Object.entries(sums).forEach(([key, { total, count }]) => {
    pairs[key] = total / count;
  });
  return pairs;
}

/**
 * How cohesive each family's own groups are, from one term's intragroup list.
 *
 * The companion to `familyPairs`, on the other measure: that one averages the
 * cells *between* two families, this one averages each family's constituent
 * groups' internal agreement. Unweighted, one group one vote, for the same
 * reason stated there — in term 10 the far right is the mean of PfE and ESN,
 * not of their 3,403 and 351 pairs.
 *
 * Read it as *how tightly the groups in this family vote*, never as how united
 * the family is. Those are different numbers whenever a family is more than one
 * group: PfE and ESN each hold together well and agree with each other far
 * less, and nothing in this average can see that. `familyPairs` deliberately
 * refuses to return a family's pair with itself for exactly this reason, so a
 * panel drawing this must say which families are merges — `familyMembers` is
 * what names them.
 *
 * Non-attached members carry no family and drop out here, as they do
 * everywhere else: they never vote as one and are not a group.
 *
 * @param {Array<{group?: string, score?: number}>|null|undefined} intragroup
 * @returns {Object<string, number>} family id -> mean of its groups' cohesion
 */
export function familyCohesion(intragroup) {
  const sums = {};
  (intragroup || []).forEach((item) => {
    if (!item || !Number.isFinite(item.score)) return;
    const family = GROUP_FAMILY[item.group];
    if (!family) return;
    if (!sums[family]) sums[family] = { total: 0, count: 0 };
    sums[family].total += item.score;
    sums[family].count += 1;
  });

  const scores = {};
  Object.entries(sums).forEach(([family, { total, count }]) => {
    scores[family] = total / count;
  });
  return scores;
}

/**
 * The key `familyPairs` stores a pair under: both orders give the same key.
 *
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function pairKey(a, b) {
  return FAMILY_ORDER.indexOf(a) <= FAMILY_ORDER.indexOf(b) ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * One family's agreement with each of the others, in seating order.
 *
 * @param {Object<string, number>} pairs - from `familyPairs`
 * @param {string} family
 * @returns {Array<{family: string, score: number|null}>} the other six, seated
 */
export function profileFor(pairs, family) {
  return FAMILY_ORDER.filter((other) => other !== family).map((other) => {
    const score = pairs ? pairs[pairKey(family, other)] : undefined;
    return { family: other, score: Number.isFinite(score) ? score : null };
  });
}
