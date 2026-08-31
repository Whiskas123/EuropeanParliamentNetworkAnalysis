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
 * The non-attached are not a group and get no group colour: they are drawn as
 * a hatch, `NON_ATTACHED_HATCH` below. This is the flat stand-in for every
 * surface too small to hold a texture — a 10px sidebar swatch, a heatmap cell,
 * a dot at the zoom a 700-MEP network opens at.
 *
 * 4.5:1 on white. The pale grey it replaces was never chosen; it was what the
 * fallback happened to be.
 */
export const NON_ATTACHED_COLOR = "#767676";

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
 * The diagonal hatch the non-attached are drawn with.
 *
 * A texture rather than a colour because they are not a bloc: every other
 * mark on the canvas says "these people vote together", and a flat grey among
 * flat colours quietly says the same thing about people who have nothing in
 * common but the absence of a group.
 *
 * `pitch` and `width` are multiples of the node radius, not lengths, so the
 * mark holds its proportions at any output size — the same four stripes per
 * dot on screen at 4x zoom and on a two-metre wall panel. Averaged over a dot
 * the hatch comes to about #8A8A8A, close enough to `NON_ATTACHED_COLOR` that
 * a node crossing `minRadius` on the way in or out of the texture does not
 * appear to change colour.
 */
export const NON_ATTACHED_HATCH = {
  base: "#C9C9C9",
  line: "#2E2E2E",
  /** Centre-to-centre spacing, as a multiple of the node radius. */
  pitch: 0.62,
  /** Stroke width, as a multiple of the node radius. */
  width: 0.25,
  /** Radians, anticlockwise: bottom-left to top-right. */
  angle: -Math.PI / 4,
  /** The pale base needs an edge, or a hatched dot reads as loose scratches. */
  ring: "#2E2E2E",
  ringOpacity: 0.55,
  /** The same ring for a canvas, which has no separate opacity attribute. */
  ringStroke: "rgba(46, 46, 46, 0.55)",
  /**
   * Below this drawn radius the stripes are narrower than the output can
   * resolve and come out as noise, so the flat colour stands in. Screen pixels
   * on the canvas, output pixels in a raster export, and never reached in SVG,
   * which has no pixels to run out of.
   */
  minRadius: 4,
};

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
  // Term 7's EFD is black, with the rest of the far-right lineage; EFDD, which
  // shared term 8 with a black ENF, keeps a teal of its own.
  EFD: "#000000",
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
