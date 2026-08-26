/**
 * How the network is drawn — the single source of truth.
 *
 * The canvas renderer and the SVG exporter both go through here, so an export
 * can never drift from what is on screen. Anything that decides a colour, a
 * width, or whether something is drawn at all belongs in this file; nothing
 * here may touch the DOM or a canvas context.
 */

import { getPartyColor } from "./parties.js";

/** Below this, two MEPs disagree more often than they agree. */
export const NEUTRAL_WEIGHT = 0.5;

/** Node colour when a mode has nothing to say about a given MEP. */
export const UNKNOWN_COLOR = "#CCCCCC";

/**
 * Stroke width for one edge.
 *
 * Weights sit in roughly [0.5, 0.98], so mapping the raw value to width leaves
 * every line looking the same. Anchoring the scale at 0.5 spreads that band
 * across the full width range instead.
 *
 * Deliberately absolute rather than stretched to each view's own min and max:
 * a given similarity draws the same width everywhere, so two printed networks
 * can be laid side by side and compared. Stretching per view would make the
 * same width mean different things in different prints.
 *
 * @param {number} weight - edge weight on [0, 1]
 * @param {number} multiplier - the width dial; 1 is the neutral setting
 * @returns {number} width in graph units
 */
export function edgeWidth(weight, multiplier = 1) {
  const w = typeof weight === "number" && isFinite(weight) ? weight : 0;
  const t = Math.max(0, Math.min(1, (w - NEUTRAL_WEIGHT) / (1 - NEUTRAL_WEIGHT)));
  return t * multiplier;
}

/**
 * The edges to draw, densest first, cut to a percentile.
 *
 * A percentile rather than a weight threshold because this is a density
 * control — how much ink ends up on the page — and rank behaves predictably
 * whatever range a particular view's weights happen to occupy.
 *
 * Returns a new array; never mutates the input, which is also used for
 * statistics.
 *
 * @param {Array<{source: string, target: string, weight: number}>} edges
 * @param {number} percentile - 0..100, share of the densest edges to keep
 */
export function selectEdges(edges, percentile = 50) {
  if (!Array.isArray(edges) || edges.length === 0) return [];
  const share = Math.max(0, Math.min(100, percentile)) / 100;
  if (share >= 1) return [...edges];
  const sorted = [...edges].sort((a, b) => (b.weight || 0) - (a.weight || 0));
  return sorted.slice(0, Math.ceil(sorted.length * share));
}

/**
 * Average agreement between an MEP and the others in their own group.
 *
 * Read from the precomputed scores rather than recomputed from the drawn
 * edges: those are filtered for legibility, and averaging over only the links
 * that survived a cut counts an MEP's agreements while discarding their
 * disagreements.
 *
 * @returns {Map<string, number>} MEP id -> score on [0, 1]
 */
export function computeLoyalty(graphData) {
  const loyalty = new Map();
  if (!graphData) return loyalty;

  const { nodes = [], agreementScores } = graphData;
  if (agreementScores) {
    nodes.forEach((node) => {
      const entry = agreementScores[node.id];
      const own = entry && node.groupId ? entry[node.groupId] : null;
      if (own && typeof own.score === "number" && own.count > 0) {
        loyalty.set(node.id, own.score);
      }
    });
    if (loyalty.size > 0) return loyalty;
  }

  // Fallback for a view without precomputed scores. Uses allLinks, which is
  // the unfiltered set, for the same reason as above.
  const links = graphData.allLinks || graphData.links || [];
  const totals = new Map();
  links.forEach((link) => {
    const a = graphData.nodeMap?.get(link.source);
    const b = graphData.nodeMap?.get(link.target);
    if (!a || !b || !a.groupId || a.groupId !== b.groupId) return;
    [link.source, link.target].forEach((id) => {
      const acc = totals.get(id) || { sum: 0, count: 0 };
      acc.sum += link.weight || 0;
      acc.count += 1;
      totals.set(id, acc);
    });
  });
  totals.forEach((acc, id) => {
    if (acc.count > 0) loyalty.set(id, acc.sum / acc.count);
  });
  return loyalty;
}

/** Blue (least loyal) through pale grey to green (most loyal). */
function loyaltyColor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  const low = { r: 33, g: 102, b: 172 };
  const mid = { r: 238, g: 238, b: 234 };
  const high = { r: 26, g: 152, b: 80 };
  const [from, to, local] =
    clamped < 0.5 ? [low, mid, clamped * 2] : [mid, high, (clamped - 0.5) * 2];
  return `rgb(${Math.round(from.r + (to.r - from.r) * local)}, ${Math.round(
    from.g + (to.g - from.g) * local
  )}, ${Math.round(from.b + (to.b - from.b) * local)})`;
}

/**
 * A stable, evenly spread hue per country, so the same country keeps its
 * colour across mandates and views.
 */
export function countryColor(country) {
  if (!country) return UNKNOWN_COLOR;
  let hash = 0;
  for (let i = 0; i < country.length; i += 1) {
    hash = (hash * 31 + country.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360}, 52%, 52%)`;
}

/**
 * Build the colour lookup for a whole view in one pass.
 *
 * Returned as a function rather than a Map so callers can stay ignorant of
 * which mode is active. The loyalty mode needs the view's own range to spread
 * its gradient, which is why this is computed per view rather than per node.
 *
 * @param {Object} graphData
 * @param {"group"|"country"|"party"|"loyalty"} mode
 * @returns {(node: Object) => string}
 */
export function makeNodeColorFn(graphData, mode = "group") {
  if (mode === "country") {
    return (node) => countryColor(node.country);
  }

  if (mode === "party") {
    return (node) => getPartyColor(node);
  }

  if (mode === "loyalty") {
    const loyalty = computeLoyalty(graphData);
    const values = [...loyalty.values()];
    if (values.length === 0) return () => UNKNOWN_COLOR;
    // Spread the gradient over the range actually present. Loyalty clusters
    // near the top of [0, 1] and a fixed scale would render everyone green.
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return (node) => {
      const score = loyalty.get(node.id);
      if (typeof score !== "number") return UNKNOWN_COLOR;
      return loyaltyColor((score - min) / span);
    };
  }

  return (node) => node.color || UNKNOWN_COLOR;
}

/**
 * Whether a node is the subject of the current dim mode.
 * With no dim active everything is emphasised, so callers need no special case.
 *
 * @param {Object} node
 * @param {{type: "group"|"country", value: string}|null} dim
 */
export function isEmphasised(node, dim) {
  if (!dim || !dim.value) return true;
  if (dim.type === "group") return node.groupId === dim.value;
  if (dim.type === "country") return node.country === dim.value;
  // A set of MEP ids, for a focus that is not a property of the node and
  // cannot be looked up on it — hovering a community is the case. Transient:
  // this form is never written to the URL.
  if (dim.type === "members") return dim.members.has(node.id);
  return true;
}

/** Opacity for an edge, given whether both ends are emphasised. */
export function edgeOpacity(bothEmphasised, dimActive, base) {
  if (!dimActive) return base;
  return bothEmphasised ? base : base * 0.12;
}

/** Opacity for a node under the current dim mode. */
export function nodeOpacity(emphasised, dimActive) {
  if (!dimActive) return 1;
  return emphasised ? 1 : 0.12;
}
