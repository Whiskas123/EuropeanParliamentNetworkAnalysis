/**
 * What every political group is drawn in, and the one group that is drawn in
 * no colour at all.
 *
 * This table used to exist in four places — `utils.js`, `dataLoader.js`,
 * `scripts/precompute-layouts.js`, and a `color` baked onto every node of
 * every precomputed JSON — and they had drifted apart. `EFDD` is sky blue in
 * the data and teal in `utils.js`; `IND/DEM` is black in the data and teal in
 * `utils.js`. The drawing takes the baked value, so the two source files were
 * describing a picture nobody was looking at.
 *
 * Two ids were in none of the maps and fell through the `|| UNKNOWN_COLOR`
 * fallback: `NonAttached`, in every term, and `EFD`, term 7's 29-MEP group.
 * Both therefore came out the same pale `#CCCCCC` — 1.6:1 against white, below
 * the 3:1 a filled shape needs to read at all, and in term 7 two different
 * populations in one indistinguishable grey.
 *
 * The baked colours are still in the files. This table wins because
 * `dataLoader` overwrites them on load — see `normaliseGroupColors`. The
 * generator script keeps a copy by hand; it runs under plain node with no
 * bundler and cannot import this one.
 */

/** A colour for an MEP the active mode knows nothing about. */
export const UNKNOWN_COLOR = "#CCCCCC";

/**
 * The non-attached are not a group and get no group colour: they are a plain
 * grey inside a black ring, `NON_ATTACHED_RING` below.
 *
 * Light enough that it reads as an absence of colour rather than as one more
 * dark group — the far right is drawn in black in most terms — and the ring is
 * what gives the shape its edge, which a pale fill cannot supply on its own.
 */
export const NON_ATTACHED_COLOR = "#BFBFBF";

/**
 * The ring every non-attached mark carries: nodes, legend swatches, the little
 * squares beside a name in a row or a tooltip.
 *
 * Solid black, at full strength. Every other mark on the canvas says "these
 * people vote together"; the ring is what says the opposite about people who
 * have nothing in common but the absence of a group, and it has to survive
 * being 6px wide in a sidebar and two metres wide on a wall panel.
 */
export const NON_ATTACHED_RING = "#000000";

/**
 * How thick the ring is, as a fraction of the dot's radius.
 *
 * A fraction and not a width because the radius is the only thing in the
 * drawing that is in graph units rather than pixels: a fixed width comes out
 * at 0.07px at the zoom a 700-MEP network opens at and at 3px at the zoom one
 * MEP is read at. Shared so the canvas and the SVG sheet cannot drift.
 *
 * Drawn inside the dot — stroke the circle at `r - width / 2`, not at `r`. A
 * stroke straddles its path, so a ring on the edge grows the dot by half its
 * width and eats the other half out of the fill; at the four or five pixels a
 * dot gets in a 700-MEP network that is the difference between a dot with an
 * edge and a small hollow ring.
 *
 * 0.14 was picked by eye against 0.20 and 0.09 at the zoom the network opens
 * at: 0.20 reads as a ring wearing a colour, 0.09 disappears into the dot and
 * leaves the pale groups where they started.
 */
export const NODE_RING_FRACTION = 0.14;

/**
 * Where to stroke a ring of this weight so it lands inside a dot of radius r.
 *
 * @param {number} r
 * @returns {{radius: number, width: number}}
 */
export function ringInside(r) {
  const width = r * NODE_RING_FRACTION;
  return { radius: Math.max(width / 2, r - width / 2), width };
}

/** Every spelling of "sat with no group" that either data source uses. */
export const NON_ATTACHED_GROUPS = new Set([
  "NonAttached",
  "Non attached",
  "Non-attached",
  "NI",
]);

/** @param {string} groupId */
export function isNonAttached(groupId) {
  return NON_ATTACHED_GROUPS.has(groupId);
}

/**
 * The inline style for a group's swatch — the dot or square that stands for a
 * group in a legend, a table row, a tooltip.
 *
 * The ring is an inset shadow rather than a border so that it follows whatever
 * `border-radius` the swatch already has and costs the layout nothing: these
 * marks are sized in CSS, often to the exact height of the line of type beside
 * them, and a border would push every one of them a pixel wider.
 *
 * @param {string} groupId
 * @param {string} [color] - an already-resolved colour, when the caller has one
 * @returns {Object} a React style object
 */
export function groupSwatchStyle(groupId, color) {
  const background = color || getGroupColor(groupId);
  if (!isNonAttached(groupId)) return { background };
  return { background, boxShadow: `inset 0 0 0 1px ${NON_ATTACHED_RING}` };
}

/**
 * The same ring as SVG presentation attributes, for a swatch drawn as a
 * `<rect>` or `<circle>` rather than a div.
 *
 * @param {string} groupId
 * @param {number} [width] - stroke width in the surrounding SVG's units
 * @returns {Object} attributes to spread onto the shape; empty for a group
 */
export function groupSwatchStroke(groupId, width = 1) {
  if (!isNonAttached(groupId)) return {};
  return { stroke: NON_ATTACHED_RING, strokeWidth: width };
}

/**
 * The same ring again, as a string, for the exporters that write SVG by hand.
 *
 * @param {string} groupId
 * @param {number} width - stroke width in the document's units
 * @returns {string} attributes with a leading space, or ""
 */
export function svgSwatchStroke(groupId, width) {
  if (!isNonAttached(groupId)) return "";
  return ` stroke="${NON_ATTACHED_RING}" stroke-width="${width}"`;
}

/**
 * Group id -> colour.
 *
 * Both spellings of several groups appear: `data/final` writes "The Left" and
 * "Renew" where the precomputed networks write "GUE/NGL" and "RE".
 */
export const GROUP_COLORS = {
  "PPE-DE": "#3399CC",
  PPE: "#3399CC",
  EPP: "#3399CC",
  PSE: "#FF0000",
  "S&D": "#FF0000",
  ALDE: "#FFD700",
  Renew: "#FFD700",
  RE: "#FFD700",
  "Verts/ALE": "#009900",
  "Greens/EFA": "#009900",
  "GUE/NGL": "#800080",
  "The Left": "#800080",
  ECR: "#000080",
  UEN: "#FFA500",
  // Term 7's EFD is the same teal as term 8's EFDD: one lineage, one colour,
  // so a reader following it across the two terms is following a colour and
  // not a legend. The rest of the far right stays black.
  EFD: "#24b9b9",
  EFDD: "#24b9b9",
  "IND/DEM": "#000000",
  ENF: "#000000",
  ID: "#000000",
  PfE: "#000000",
  ESN: "#8B4513",
  NonAttached: NON_ATTACHED_COLOR,
  NI: NON_ATTACHED_COLOR,
};

/**
 * @param {string} groupId
 * @returns {string} hex colour; `UNKNOWN_COLOR` for an id not in the table
 */
export function getGroupColor(groupId) {
  return GROUP_COLORS[groupId] || UNKNOWN_COLOR;
}

/**
 * Put this table over the colours a precomputed file was written with.
 *
 * Mutates in place: the caller has just parsed the file and nobody else holds
 * a reference to it yet, and a 700-node view is rebuilt on every filter
 * change.
 *
 * @param {Object|null} precomputed - a parsed precomputed layout
 */
export function normaliseGroupColors(precomputed) {
  if (!precomputed) return precomputed;

  if (Array.isArray(precomputed.nodes)) {
    precomputed.nodes.forEach((node) => {
      if (node && node.groupId) node.color = getGroupColor(node.groupId);
    });
  }

  // The second copy: the group matrix carries its own swatch colours, which
  // the cohesion heatmap and half the sidebar panels read instead of the nodes.
  const intergroup = precomputed.cohesionData?.intergroupCohesion;
  if (intergroup && intergroup.groupColors) {
    Object.keys(intergroup.groupColors).forEach((groupId) => {
      intergroup.groupColors[groupId] = getGroupColor(groupId);
    });
  }

  return precomputed;
}
