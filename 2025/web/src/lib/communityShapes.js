import { contourDensity } from "d3";
import { getStructureAnalysis } from "./networkAnalysis.js";
import {
  getGroupAcronym,
  getGroupColor,
  getGroupDisplayName,
} from "./utils.js";

/**
 * The detected communities as outlines you can draw over the network.
 *
 * The community detection used to live in a sidebar tab that printed its
 * result as a list of stacked bars — eight rows saying "this community is 96%
 * EPP". That is a table of something the reader is already looking at: the
 * layout puts each MEP where their voting record puts them, so a community is
 * a *place* on the canvas, and the honest way to show one is to draw a line
 * round it. Everything the tab said about composition is legible from which
 * nodes fall inside which outline.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT A CONVEX HULL
 * ---------------------------------------------------------------------------
 *
 * The obvious outline is the convex hull of the community's nodes, and on this
 * layout it is wrong twice over. A single MEP parked on the far side of the
 * picture — and there is one in most communities, because agreement is what
 * places a node, not membership — drags the hull across half the Parliament,
 * so the shape says more about that one MEP than about the other two hundred.
 * And a community that sits in two lobes gets a hull spanning the gap between
 * them, drawing a boundary through territory that belongs to somebody else.
 *
 * So the outline is a density contour instead: splat the community's nodes
 * into a grid, blur, and trace the level that still encloses most of them.
 * That gives a shape which hugs where the members actually are, ignores the
 * stragglers by construction, and is free to come out as two blobs when the
 * community really is two blobs. It is also the reason the outlines are drawn
 * dashed: a contour is a soft boundary and should not be drawn like a fence.
 *
 * ---------------------------------------------------------------------------
 * THE CAVEAT THAT TRAVELS WITH IT
 * ---------------------------------------------------------------------------
 *
 * The partition itself is not a raw finding — this graph is complete and its
 * weights are crowded, so the detection only says anything after each MEP is
 * cut back to their strongest partners. networkAnalysis.js is where that is
 * argued; the display panel that switches these outlines on repeats the short
 * version, because a reader who takes the blobs for a raw result will read
 * them as much stronger evidence than they are.
 */

/** Long side of the grid the density is computed on, in cells. */
const GRID_LONG_SIDE = 512;

/** Empty margin around the layout, as a share of the long side. Contours are
 *  clipped at the grid edge, so a community sitting on the border needs room
 *  to close its outline. */
const GRID_PAD_SHARE = 0.07;

/** Density is sampled every this many grid cells. Must be a power of two. */
const CELL_SIZE = 4;

/** How many density levels to trace before picking one. */
const THRESHOLD_COUNT = 16;

/**
 * Share of a community's members the chosen contour has to enclose.
 *
 * This is the one number that decides what the outlines look like, so it is
 * worth being explicit about the trade: at 1.0 the shape is a convex hull in
 * all but name, because it has to reach every straggler. Lower it and the
 * outline tightens onto the body of the community and leaves the outliers
 * outside the line — which is the useful reading, since an MEP drawn outside
 * their own community's outline is exactly the MEP worth clicking.
 */
const COVERAGE = 0.85;

/** Chaikin passes. Two turns a cell-aligned staircase into a smooth blob. */
const SMOOTH_PASSES = 2;

/**
 * When the preferred level would draw an outline that is mostly other people,
 * stop preferring it.
 *
 * Not every community occupies one place. In term 10 the algorithm pulls the
 * 23 Polish EPP members out as a bloc of their own, and it is right to — they
 * vote together — but on the canvas they sit interleaved with the rest of the
 * EPP, spread as widely as communities six times their size. One closed curve
 * holding 22 of them holds sixty other MEPs too.
 *
 * That is a reason to draw the community differently, not to refuse to draw
 * it. Below this purity the level is chosen by how well it separates members
 * from everyone else instead (see outlineFor), which on an interleaved
 * community means a tighter level that breaks into several islands — the
 * honest picture of a bloc that is scattered through another one.
 */
const MIN_OUTLINE_PURITY = 0.5;

/** However well a tighter level separates, it has to still hold this much of
 *  the community, or the outline stops being about the community at all. */
const MIN_COVERAGE = 0.4;

/**
 * European sub-regions, for the line in the tooltip that says what a slice of
 * a group has in common when it is not the group.
 *
 * The UN geoscheme's four European sub-regions, with Cyprus moved from Western
 * Asia to Southern Europe, which is where it sits in every EU context. It is a
 * standard grouping rather than one invented here, and it is only ever used to
 * describe a community that is already concentrated — never to claim a bloc
 * exists because its members happen to share a region.
 */
const REGIONS = new Map(
  Object.entries({
    Denmark: "Northern Europe",
    Estonia: "Northern Europe",
    Finland: "Northern Europe",
    Ireland: "Northern Europe",
    Latvia: "Northern Europe",
    Lithuania: "Northern Europe",
    Sweden: "Northern Europe",
    "United Kingdom": "Northern Europe",
    Austria: "Western Europe",
    Belgium: "Western Europe",
    France: "Western Europe",
    Germany: "Western Europe",
    Luxembourg: "Western Europe",
    Netherlands: "Western Europe",
    Croatia: "Southern Europe",
    Cyprus: "Southern Europe",
    Greece: "Southern Europe",
    Italy: "Southern Europe",
    Malta: "Southern Europe",
    Portugal: "Southern Europe",
    Slovenia: "Southern Europe",
    Spain: "Southern Europe",
    Bulgaria: "Eastern Europe",
    Czechia: "Eastern Europe",
    Hungary: "Eastern Europe",
    Poland: "Eastern Europe",
    Romania: "Eastern Europe",
    Slovakia: "Eastern Europe",
  })
);

/**
 * Groupings of countries that people already have a word for.
 *
 * Sub-regions are too coarse for the thing worth noticing. When the seven ECR
 * members inside an otherwise EPP community turn out to be Danish, Swedish and
 * Finnish, "Northern Europe" is true and flat — it also covers Ireland and the
 * Baltics — while "the Nordics" is the sentence a reader would say out loud.
 * These are named groupings in ordinary political use, not clusters found in
 * the data, and they are only ever used to describe a set of countries that is
 * already wholly inside one of them.
 */
const COUNTRY_CLUSTERS = [
  { name: "the Nordics", members: ["Denmark", "Finland", "Sweden"] },
  { name: "the Baltics", members: ["Estonia", "Latvia", "Lithuania"] },
  { name: "Benelux", members: ["Belgium", "Netherlands", "Luxembourg"] },
  {
    name: "the Visegrád four",
    members: ["Czechia", "Hungary", "Poland", "Slovakia"],
  },
  { name: "Iberia", members: ["Portugal", "Spain"] },
];

/**
 * A community of one is a fact, and not a shape.
 *
 * Subject networks produce them in numbers — term 9's Agriculture votes give
 * nineteen communities, ten of which are a single MEP. Each of those would be
 * a dashed circle round one dot with a label saying "1 MEP", which is ten
 * labels' worth of clutter to say what the dot already says. They are counted
 * in the panel instead, where the number itself is the interesting part: ten
 * MEPs who vote like nobody else on farming.
 */
const MIN_OUTLINE_SIZE = 2;

/** Colour for a community with no group in it at all; should not happen. */
export const UNKNOWN_COMMUNITY_COLOR = "#5a5a63";

const cache = new WeakMap();

/* -------------------------------------------------------------------------- */
/* geometry                                                                   */
/* -------------------------------------------------------------------------- */

/** Signed area, shoelace. Sign is orientation; callers want the magnitude. */
function ringArea(ring) {
  let sum = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

/**
 * Chaikin corner cutting on a closed ring.
 *
 * Marching squares walks cell edges, so every contour arrives as a staircase
 * at the grid resolution. Two passes remove the stair without moving the line
 * far enough to change which nodes are inside it.
 */
function smoothRing(ring, passes) {
  let points = ring;
  for (let pass = 0; pass < passes; pass++) {
    const next = [];
    for (let i = 0, n = points.length; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    points = next;
  }
  return points;
}

/** A closed ring approximating a circle — the fallback for tiny communities. */
function circleRing(cx, cy, radius, segments = 28) {
  const ring = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    ring.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return ring;
}

/**
 * Median distance to a nearest neighbour, over a sample of the points.
 *
 * Sets the blur radius: the contour has to bridge the gap between adjacent
 * members without bridging the gap between adjacent communities, and that
 * distance is a property of the layout, which varies by two orders of
 * magnitude across the precomputed files. Sampled rather than exhaustive
 * because it is only setting a smoothing radius and 200 points settle it as
 * well as 700.
 */
function medianNearestNeighbour(points, xOf, yOf) {
  const stride = Math.max(1, Math.floor(points.length / 200));
  const distances = [];
  for (let i = 0; i < points.length; i += stride) {
    let best = Infinity;
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const dx = xOf(points[i]) - xOf(points[j]);
      const dy = yOf(points[i]) - yOf(points[j]);
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    if (best < Infinity) distances.push(Math.sqrt(best));
  }
  if (distances.length === 0) return 0;
  distances.sort((a, b) => a - b);
  return distances[Math.floor(distances.length / 2)];
}

/* -------------------------------------------------------------------------- */
/* the outline of one community                                               */
/* -------------------------------------------------------------------------- */

/**
 * Rings with their bounding boxes, so a point that is nowhere near one costs
 * four comparisons instead of a walk round several hundred vertices. Every
 * level of every community is tested against every node in the network, so
 * this is the difference between the analysis taking 200 ms and taking two
 * seconds.
 */
function bound(rings) {
  return rings.map((ring) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < ring.length; i++) {
      if (ring[i][0] < minX) minX = ring[i][0];
      if (ring[i][0] > maxX) maxX = ring[i][0];
      if (ring[i][1] < minY) minY = ring[i][1];
      if (ring[i][1] > maxY) maxY = ring[i][1];
    }
    return { ring, minX, maxX, minY, maxY };
  });
}

/**
 * Even-odd crossing test against a set of rings.
 *
 * The rings of one contour level are disjoint, so accumulating the crossings
 * across all of them in one pass is the same answer as testing each and
 * OR-ing, at a fraction of the cost.
 */
function insideBounded(x, y, bounded) {
  let inside = false;
  for (let r = 0; r < bounded.length; r++) {
    const box = bounded[r];
    if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) continue;
    const ring = box.ring;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const yi = ring[i][1];
      const yj = ring[j][1];
      if (yi > y !== yj > y) {
        const xCross =
          ((ring[j][0] - ring[i][0]) * (y - yi)) / (yj - yi) + ring[i][0];
        if (x < xCross) inside = !inside;
      }
    }
  }
  return inside;
}

/** How many of `points` fall inside a level's rings. */
function countInside(points, bounded) {
  let held = 0;
  for (let i = 0; i < points.length; i++) {
    if (insideBounded(points[i].gx, points[i].gy, bounded)) held++;
  }
  return held;
}

/**
 * Trace one community, in grid coordinates.
 *
 * The default is the tightest density level that still encloses COVERAGE of
 * the members, because tighter is more informative: every level below it is
 * the same shape with more slack. That is the whole rule for a community that
 * occupies a place of its own, which is most of them.
 *
 * When that outline would be mostly *other* people — a community interleaved
 * with a bigger one — the level is chosen by how well it separates instead:
 * the balance of how much of the community it holds against how much of what
 * it holds is the community (the harmonic mean of the two, so neither can be
 * bought by giving up the other). On an interleaved community that lands on a
 * tight level which breaks into several islands, one per pocket of members.
 * Islands are the truth about such a bloc, and one big ring around all of them
 * is not.
 *
 * @param {Array} members - the community's nodes, in grid coordinates
 * @param {Array} others - every other node in the network, same coordinates
 * @returns {{rings, coverage, purity, islands}}
 */
function outlineFor(members, others, grid, bandwidth) {
  const empty = { rings: [], coverage: 0, purity: 0 };
  if (members.length === 0) return empty;

  if (members.length < 5) {
    // Too few members for a density surface to mean anything. A circle wide
    // enough to hold them is honest about that: it claims a place, not a shape.
    let cx = 0;
    let cy = 0;
    members.forEach((p) => {
      cx += p.gx;
      cy += p.gy;
    });
    cx /= members.length;
    cy /= members.length;
    let radius = 0;
    members.forEach((p) => {
      radius = Math.max(radius, Math.hypot(p.gx - cx, p.gy - cy));
    });
    const rings = [circleRing(cx, cy, radius + bandwidth * 0.9)];
    const bounded = bound(rings);
    const foreign = countInside(others, bounded);
    return {
      rings,
      coverage: 1,
      purity: members.length / (members.length + foreign),
    };
  }

  const levelsAt = (bw) =>
    contourDensity()
      .x((p) => p.gx)
      .y((p) => p.gy)
      .size([grid.width, grid.height])
      .cellSize(CELL_SIZE)
      .bandwidth(bw)
      .thresholds(THRESHOLD_COUNT)(members)
      // Ascending by density, so the last is the tightest. A zero-valued
      // contour is the whole canvas and never an answer.
      .filter((c) => c.value > 0 && c.coordinates.length > 0)
      .map((c) => bound(c.coordinates.map((polygon) => polygon[0])));

  const score = (level) => {
    const held = countInside(members, level);
    const foreign = countInside(others, level);
    const coverage = held / members.length;
    const purity = held + foreign === 0 ? 0 : held / (held + foreign);
    return {
      level,
      coverage,
      purity,
      f: coverage + purity === 0 ? 0 : (2 * coverage * purity) / (coverage + purity),
    };
  };

  const levels = levelsAt(bandwidth);
  if (levels.length === 0) return empty;

  // The preferred outline: tightest level that still holds most of the
  // community. For a community standing in a place of its own this is the
  // whole rule, and the search below never runs.
  let chosen = null;
  for (let i = levels.length - 1; i >= 0; i--) {
    if (countInside(members, levels[i]) / members.length >= COVERAGE) {
      chosen = score(levels[i]);
      break;
    }
  }
  if (chosen === null) chosen = score(levels[0]);

  if (chosen.purity < MIN_OUTLINE_PURITY) {
    // Interleaved with somebody else. Search for the shape that separates
    // best, over levels *and* over blur radius: at the community's own
    // spacing the surface is one smooth mound whatever level you cut it at,
    // and it is only at a tighter blur that the individual pockets of members
    // resolve into islands. Costs two more contour passes and a sweep over
    // every node in the network, which is why it waits until it is needed.
    let best = null;
    const consider = (candidate) => {
      if (candidate.coverage < MIN_COVERAGE) return;
      if (best === null || candidate.f > best.f) best = candidate;
    };
    [bandwidth, bandwidth * 0.55, bandwidth * 0.3].forEach((bw, index) => {
      const scaled = index === 0 ? levels : levelsAt(Math.max(CELL_SIZE, bw));
      scaled.forEach((level) => consider(score(level)));
    });
    if (best !== null) chosen = best;
  }

  // Outer rings only, and only rings with somebody in them. A hole punched in
  // a community is a place where its own members thin out, which is texture
  // rather than boundary; a ring holding no members at all is a pocket of
  // density that belongs to whoever is standing in it.
  const rings = chosen.level
    .filter((box) =>
      members.some((point) => insideBounded(point.gx, point.gy, [box]))
    )
    .map((box) => box.ring);

  return { rings, coverage: chosen.coverage, purity: chosen.purity };
}

/* -------------------------------------------------------------------------- */
/* the public shape                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Outlines for every detected community, in the layout's own coordinates.
 *
 * The canvas and the SVG export both draw from this, so the print cannot
 * disagree with the screen about where a community is.
 *
 * @param {Object} graphData - the loaded network; nodes need x, y and id.
 * @returns {?Object} {shapes, count, concordantShare, ari, k, nodeCount} or
 *   null when the network is too small to partition.
 */
export function buildCommunityShapes(graphData) {
  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    return null;
  }
  const hit = cache.get(graphData);
  if (hit !== undefined) return hit;

  const value = computeCommunityShapes(graphData);
  cache.set(graphData, value);
  return value;
}

function computeCommunityShapes(graphData) {
  const analysis = getStructureAnalysis(graphData);
  if (!analysis || analysis.communities.length === 0) return null;

  const nodeMap =
    graphData.nodeMap ||
    new Map((graphData.nodes || []).map((node) => [node.id, node]));

  const placed = (graphData.nodes || []).filter(
    (node) => Number.isFinite(node.x) && Number.isFinite(node.y)
  );
  if (placed.length < 3) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  placed.forEach((node) => {
    if (node.x < minX) minX = node.x;
    if (node.x > maxX) maxX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.y > maxY) maxY = node.y;
  });
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);

  // Layout units to grid cells. One scale for both axes, so a blob keeps its
  // shape; the grid is only as large as the layout needs.
  const pad = GRID_LONG_SIDE * GRID_PAD_SHARE;
  const scale = (GRID_LONG_SIDE - 2 * pad) / Math.max(spanX, spanY);
  const grid = {
    width: Math.max(CELL_SIZE * 4, Math.ceil(spanX * scale + 2 * pad)),
    height: Math.max(CELL_SIZE * 4, Math.ceil(spanY * scale + 2 * pad)),
  };
  const toGridX = (x) => (x - minX) * scale + pad;
  const toGridY = (y) => (y - minY) * scale + pad;
  const fromGridX = (gx) => (gx - pad) / scale + minX;
  const fromGridY = (gy) => (gy - pad) / scale + minY;

  // Blur wide enough to close the gaps between neighbouring members and no
  // wider — measured on the community being traced, not on the network. A
  // community of twenty sitting inside a group of two hundred is tightly
  // packed, and a blur set by the whole layout would smear it into a blob
  // enclosing five times its own membership. The floor is the layout's own
  // spacing: no outline should be tighter than the gap between two MEPs.
  const spacing =
    medianNearestNeighbour(placed, (node) => node.x, (node) => node.y) * scale;
  const floor = Math.max(CELL_SIZE * 1.5, spacing * 1.2);
  const bandwidthFor = (members) =>
    Math.min(
      GRID_LONG_SIDE / 8,
      Math.max(
        floor,
        medianNearestNeighbour(members, (p) => p.gx, (p) => p.gy) * 2
      )
    );

  // "A national delegation on its own" is only worth saying when there is
  // another nation to be on your own from. In a country view every community
  // is one country by construction, and the suffix would be on all of them.
  const countryNames = new Set();
  placed.forEach((node) => countryNames.add(node.country || "Unknown"));
  const oneCountry = countryNames.size <= 1;

  // Every node in grid coordinates, once. Each community is traced against
  // every other MEP in the network, so this is built here and sliced per
  // community rather than rebuilt eight times.
  const gridOf = new Map();
  placed.forEach((node) => {
    gridOf.set(node.id, { gx: toGridX(node.x), gy: toGridY(node.y) });
  });

  const shapes = [];
  let singletons = 0;
  analysis.communities.forEach((community) => {
    const memberIds = community.members.filter((id) => gridOf.has(id));
    if (memberIds.length === 0) return;
    if (memberIds.length < MIN_OUTLINE_SIZE) {
      singletons++;
      return;
    }
    const memberSet = new Set(memberIds);
    const members = memberIds.map((id) => gridOf.get(id));
    const others = [];
    placed.forEach((node) => {
      if (!memberSet.has(node.id)) others.push(gridOf.get(node.id));
    });

    const traced = outlineFor(members, others, grid, bandwidthFor(members));
    if (traced.rings.length === 0) return;

    const laidOut = traced.rings
      .map((ring) =>
        smoothRing(ring, SMOOTH_PASSES).map((point) => [
          fromGridX(point[0]),
          fromGridY(point[1]),
        ])
      )
      .sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));

    // The label hangs off the top of the biggest lobe, which is the one edge
    // of the shape guaranteed not to have another community's nodes over it.
    let anchor = laidOut[0][0];
    laidOut[0].forEach((point) => {
      if (point[1] < anchor[1]) anchor = point;
    });

    shapes.push({
      id: community.id,
      size: community.size,
      members: memberIds,
      memberSet,
      rings: laidOut,
      islands: laidOut.length,
      anchor: { x: anchor[0], y: anchor[1] },
      dominantGroup: community.dominantGroup,
      dominantShare: community.dominantShare,
      // How much of the dominant group this community holds — the number that
      // separates "this is the EPP" from "this is a piece of the EPP".
      dominantShareOfGroup:
        community.composition.length > 0
          ? community.composition[0].shareOfGroup
          : 0,
      composition: community.composition,
      countries: community.countries,
      regions: regionsOf(community.countries),
      nationalSplinter: oneCountry ? null : community.nationalSplinter,
      oneCountry,
      coverage: traced.coverage,
      purity: traced.purity,
    });
  });

  shapes.sort((a, b) => b.size - a.size);
  assignColors(shapes);

  return {
    shapes,
    count: analysis.communityCount,
    concordantShare: analysis.concordantShare,
    ari: analysis.agreement ? analysis.agreement.ari : null,
    k: analysis.preprocessing.k,
    nodeCount: analysis.preprocessing.nodeCount,
    singletons,
    oneCountry,
  };
}

/* -------------------------------------------------------------------------- */
/* colour                                                                     */
/* -------------------------------------------------------------------------- */

/** #rrggbb to {h, s, l}, h in degrees. */
function hexToHsl(hex) {
  const clean = String(hex || "").replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return { h: 0, s: 0, l: 0.4 };
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s: sat, l };
}

function hslToHex({ h, s, l }) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const sextant = Math.floor(hue / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sextant];
  const to255 = (value) =>
    Math.round(Math.max(0, Math.min(1, value + m)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}

/**
 * How a second, third, fourth community of the same political group is drawn.
 *
 * Same hue, so it still reads as that group; a different lightness, because
 * that is the difference that survives a printed panel and a room's width.
 * The hue is deliberately *not* turned: the first version of this rotated it a
 * little to make the variant feel like its own colour, and on term 10 that
 * walked the EPP's second community — 23 Polish members — straight into the
 * ECR's navy, so the picture grew a bloc of Polish conservatives that does not
 * exist. Two blues of the same hue read as two shades of one group. Two blues
 * of neighbouring hues read as two groups.
 */
const COLOR_CANDIDATES = [];
[-0.05, -0.35, -0.65].forEach((ds) => {
  [-0.18, -0.26, -0.34, -0.44, 0.14, 0.2].forEach((dl) => {
    COLOR_CANDIDATES.push({ dl, ds });
  });
});

/**
 * How far a variant has to sit from the paper, and from the colour it is a
 * variant of.
 *
 * The first is not a preference. Term 7 has four EPP communities, and with
 * only preferences the fourth came out a pale blue that was invisible as a
 * dashed line and unreadable as a name — a community drawn in a colour nobody
 * can see is a community that is not drawn. Distances are in the redmean
 * approximation, where white to mid-grey is about 250.
 */
const MIN_PAPER_DISTANCE = 230;

/**
 * A variant has to be a different colour from its group, and still that
 * group's colour. Below the floor it reads as the same shade; above the
 * ceiling it stops looking related — the first version of this maximised the
 * distance from every other colour on the canvas, and on term 7 that turned
 * the EPP's Polish community charcoal, which is not a blue at all.
 */
const MIN_BASE_DISTANCE = 90;
const MAX_BASE_DISTANCE = 270;

/** Each extra community of the same group needs somewhere further to stand.
 *  Term 7 has four EPP communities and four shades of one blue that all keep
 *  within 270 of it are four shades nobody can tell apart. */
const BASE_DISTANCE_PER_SIBLING = 65;

/** Enough separation from another group's colour not to be mistaken for it. */
const MIN_SEPARATION = 120;

function shiftColor(hex, step) {
  const base = hexToHsl(hex);
  // Black and white have headroom in one direction only; push the way there
  // is room to go rather than producing the same colour twice.
  const dl = base.l < 0.22 ? Math.abs(step.dl) : base.l > 0.78 ? -Math.abs(step.dl) : step.dl;
  return hslToHex({
    h: base.h,
    s: Math.max(0, Math.min(1, base.s + step.ds)),
    l: Math.max(0.14, Math.min(0.88, base.l + dl)),
  });
}

/**
 * Rough perceptual distance between two colours (the "redmean" approximation).
 *
 * Good enough for the only question asked of it: is this variant far enough
 * from every other colour already on the canvas that nobody will read it as
 * one of them?
 */
function colorDistance(a, b) {
  const parse = (hex) => {
    const clean = String(hex || "").replace("#", "");
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  if ([r1, g1, b1, r2, g2, b2].some((v) => !Number.isFinite(v))) return 0;
  const rMean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(
    (2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db
  );
}

/**
 * Give every community a colour, and every group's second community a
 * different one.
 *
 * The colour comes from the largest group in the community, because that is
 * what a reader will guess it means. When a group holds more than one
 * community the one that holds most of that group keeps the group's own
 * colour — it is the group, as far as the eye is concerned — and the others
 * are drawn in a shade of it, chosen to sit as far as possible from every
 * other colour already in the picture. Ranking by share of the group rather
 * than by size is deliberate: a splinter of 23 and a rump of 151 should not
 * swap colours because a country view happens to hold more of the splinter.
 */
function assignColors(shapes) {
  // Every colour the reader can already see, which is what a variant has to
  // stay clear of: the nodes are coloured by group, not by community. The
  // paper is in the set too — a shade pale enough to be mistaken for the
  // background is a shade nobody can follow round a shape.
  const taken = new Set(["#ffffff"]);
  shapes.forEach((shape) => {
    (shape.composition || []).forEach((part) => {
      taken.add(getGroupColor(part.groupId));
    });
  });

  const byGroup = new Map();
  shapes.forEach((shape) => {
    const key = shape.dominantGroup || "__none__";
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(shape);
  });

  byGroup.forEach((siblings, groupId) => {
    const base =
      groupId === "__none__" ? UNKNOWN_COMMUNITY_COLOR : getGroupColor(groupId);
    const ordered = [...siblings].sort(
      (a, b) =>
        b.dominantShareOfGroup - a.dominantShareOfGroup || b.size - a.size
    );
    const used = [];
    const maxFromBase =
      MAX_BASE_DISTANCE +
      Math.max(0, siblings.length - 2) * BASE_DISTANCE_PER_SIBLING;
    ordered.forEach((shape, index) => {
      let color = base;
      if (index > 0) {
        // Closest shade to the group's own colour that is far enough from
        // everything else on the canvas — family resemblance first, and
        // distance only as far as it has to go.
        let safest = null;
        let nearestFallback = null;
        COLOR_CANDIDATES.forEach((step) => {
          const candidate = shiftColor(base, step);
          if (used.includes(candidate)) return;
          if (colorDistance(candidate, "#ffffff") < MIN_PAPER_DISTANCE) return;
          const fromBase = colorDistance(candidate, base);
          if (fromBase < MIN_BASE_DISTANCE || fromBase > maxFromBase) return;
          let nearest = Infinity;
          taken.forEach((other) => {
            if (other === base) return;
            nearest = Math.min(nearest, colorDistance(candidate, other));
          });
          used.forEach((other) => {
            nearest = Math.min(nearest, colorDistance(candidate, other));
          });
          if (
            nearest >= MIN_SEPARATION &&
            (safest === null || fromBase < safest.fromBase)
          ) {
            safest = { candidate, fromBase };
          }
          if (nearestFallback === null || nearest > nearestFallback.nearest) {
            nearestFallback = { candidate, nearest };
          }
        });
        const pick = safest || nearestFallback;
        if (pick !== null) color = pick.candidate;
      }
      used.push(color);
      shape.color = color;
      shape.labelColor = readableInk(color);
      shape.groupColor = base;
      shape.variant = index;
      shape.siblingCount = siblings.length;
    });
  });
}

/**
 * The same colour, dark enough to set type in.
 *
 * The outline keeps the group's actual colour, because that is the thing being
 * matched against the dots. The name cannot: RE is drawn in gold and gold text
 * on white is a squint, whatever size it is set at. Hue and saturation are
 * untouched, so the name still reads as belonging to the shape it labels.
 */
export function readableInk(hex) {
  const base = hexToHsl(hex);
  if (base.l <= 0.42) return hex;
  return hslToHex({ h: base.h, s: base.s, l: 0.36 });
}

/* -------------------------------------------------------------------------- */
/* describing a community                                                     */
/* -------------------------------------------------------------------------- */

/** Countries rolled up into sub-regions, largest first. See REGIONS. */
function regionsOf(countries) {
  const totals = new Map();
  let total = 0;
  (countries || []).forEach((entry) => {
    const region = REGIONS.get(entry.country) || "Elsewhere";
    totals.set(region, (totals.get(region) || 0) + entry.count);
    total += entry.count;
  });
  return [...totals.entries()]
    .map(([region, count]) => ({
      region,
      count,
      share: total === 0 ? 0 : count / total,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Push overlapping labels upward until none of them sit on top of each other.
 *
 * The anchor is the top of each shape, and shapes overlap — on term 10 the
 * Left, the Greens and S&D are three arcs of the same crescent, so their three
 * names land in the same half-inch of canvas. Moving a name off its own shape
 * is worse than moving it up, because up is still unambiguously above it.
 *
 * Boxes arrive in drawing order, largest community first, so the big blocs
 * keep the position they earned and the small ones are the ones that move.
 * Measuring the text is the caller's job: the canvas has measureText and the
 * SVG exporter has an estimate, and neither of them belongs in here.
 *
 * @param {Array<{x, y, width, height}>} boxes - x is the centre, y the bottom
 * @param {number} gap - clearance to leave, in the same units
 * @returns {number[]} the y to use for each box, in the order given
 */
export function stackLabels(boxes, gap = 0) {
  const placed = [];
  const result = [];
  boxes.forEach((box) => {
    let y = box.y;
    for (let pass = 0; pass < 12; pass++) {
      let moved = false;
      placed.forEach((other) => {
        const apart = (box.width + other.width) / 2 + gap;
        if (Math.abs(box.x - other.x) >= apart) return;
        const otherTop = other.y - other.height;
        if (y - box.height < other.y + gap && y > otherTop - gap) {
          y = otherTop - gap;
          moved = true;
        }
      });
      if (!moved) break;
    }
    placed.push({ x: box.x, y, width: box.width, height: box.height });
    result.push(y);
  });
  return result;
}

/**
 * Where a set of members comes from, in a few words, or nothing.
 *
 * Used on each group inside a community — the question "what do these nine
 * Renew members have in common that the rest of Renew does not" has a one-word
 * answer surprisingly often, and it is always a country or a corner of Europe.
 * Returns "" when there is no such answer, because a group drawn from six
 * countries in no particular pattern should not be given a story.
 *
 * @param {Array<{country, count}>} countries - largest first
 * @param {number} total - how many members those counts add up to
 */
export function describeOrigin(countries, total) {
  const entries = (countries || []).filter((entry) => entry.count > 0);
  if (entries.length === 0 || total <= 0) return "";

  if (entries.length === 1) {
    return total > 1 ? `all from ${entries[0].country}` : `from ${entries[0].country}`;
  }

  const present = entries.map((entry) => entry.country);
  const cluster = COUNTRY_CLUSTERS.find((candidate) =>
    present.every((country) => candidate.members.includes(country))
  );
  if (cluster) return `all from ${cluster.name}`;

  const top = entries[0];
  if (top.count / total >= 0.8) {
    return `mostly ${top.country} (${top.count} of ${total})`;
  }

  const region = regionsOf(entries)[0];
  if (region && region.region !== "Elsewhere" && region.share >= 0.8) {
    return region.share >= 0.999
      ? `all from ${region.region}`
      : `mostly ${region.region}`;
  }
  return "";
}

/** Groups that are not a political group: an MEP is in one by not being in one. */
const NON_GROUPS = new Set(["NonAttached", "NI", "Non-attached", "Unknown"]);

/**
 * A group's name as it reads inside a sentence.
 *
 * The display names carry their own acronym — "European People's Party (EPP)"
 * — which is right for a heading and wrong here, where the card's title
 * already says EPP two lines above. The article is part of the name for most
 * of them and part of no name for The Left, which is why this is a function
 * and not a template string.
 */
function groupPhrase(groupId, mandate) {
  const full = getGroupDisplayName(groupId, mandate).replace(
    /\s*\([^)]*\)\s*$/,
    ""
  );
  return /^the\s/i.test(full) ? full : `the ${full}`;
}

/**
 * One sentence saying what this community is.
 *
 * The reason the tooltip exists: most communities are simply a political
 * group, and for those the sentence is short and the reader moves on. The
 * interesting ones are the pieces — a slice of a group, or two groups the
 * algorithm could not tell apart — and for those the sentence has to say which
 * piece, because that is exactly what the picture cannot show.
 */
export function describeCommunity(shape, mandate) {
  if (!shape || !shape.dominantGroup) return "No political group.";
  const acronym = getGroupAcronym(shape.dominantGroup, mandate);
  const name = groupPhrase(shape.dominantGroup, mandate);
  const first = shape.composition[0];

  // A plurality rather than a majority. Two shapes of that: several groups
  // the algorithm could not separate, or one group diluted by a long tail of
  // ones and twos. Naming a single group after the words "no single group" is
  // the sentence that gave this its second branch.
  if (shape.dominantShare < 0.75) {
    const parts = shape.composition.filter((part) => part.share >= 0.15);
    const named = parts.map(
      (part) =>
        `${getGroupAcronym(part.groupId, mandate)} ${Math.round(
          part.share * 100
        )}%`
    );
    if (parts.length > 1) {
      return `No single group — ${named.join(
        ", "
      )}. They vote together often enough that the algorithm could not separate them.`;
    }
    const tail = shape.composition.length - 1;
    return `Mostly ${name} — ${Math.round(
      shape.dominantShare * 100
    )}% of it, with the rest spread across ${tail} other group${
      tail === 1 ? "" : "s"
    }.`;
  }

  if (NON_GROUPS.has(shape.dominantGroup)) {
    return `MEPs sitting with no political group — ${first.count} of the ${first.groupTotal} unattached members. They have no group in common; what they have in common is how they voted.`;
  }

  const whole =
    first.shareOfGroup >= 0.85
      ? `Effectively ${name}: ${first.count} of its ${first.groupTotal} members.`
      : shape.siblingCount > 1
      ? `A piece of ${name}: ${first.count} of its ${first.groupTotal} members, one of ${shape.siblingCount} ${acronym} communities on this network.`
      : `Most of ${name}: ${first.count} of its ${first.groupTotal} members.`;

  // Whoever else is in here. At 75-90% dominance the remainder is a handful of
  // people who vote with a group they do not sit with, which is the whole
  // point of drawing the communities rather than the groups.
  const rest = shape.composition.slice(1).filter((part) => part.count > 0);
  if (rest.length === 0 || 1 - shape.dominantShare < 0.08) return whole;
  const joined = rest
    .slice(0, 3)
    .map(
      (part) =>
        `${part.count} ${getGroupAcronym(part.groupId, mandate)}`
    )
    .join(", ");
  const more = rest.length > 3 ? `, and ${rest.length - 3} more` : "";
  return `${whole} With them: ${joined}${more}.`;
}

/**
 * One sentence on where the members are from, or none.
 *
 * Only said when it is concentrated. A community drawn from twenty countries
 * in rough proportion to the Parliament has nothing geographic to say, and
 * saying it anyway ("spread across Europe") would invite the reader to find a
 * pattern in noise.
 */
export function describeGeography(shape) {
  if (!shape || !shape.countries || shape.countries.length === 0) return "";
  // In a country view every community is that country. Saying so on each of
  // them is noise, and worse, it reads as a finding.
  if (shape.oneCountry) return "";
  const top = shape.countries[0];
  if (shape.countries.length === 1) {
    return `Every member is from ${top.country}.`;
  }
  if (top.share >= 0.6) {
    return `Mostly ${top.country} — ${top.count} of ${shape.size}.`;
  }
  const region = shape.regions && shape.regions[0];
  if (region && region.share >= 0.6 && region.region !== "Elsewhere") {
    return `Mostly ${region.region} — ${Math.round(region.share * 100)}% of the community.`;
  }
  const two = shape.countries.slice(0, 2);
  if (two.length === 2 && (two[0].share + two[1].share) >= 0.6) {
    return `Mostly ${two[0].country} and ${two[1].country} — ${
      two[0].count + two[1].count
    } of ${shape.size}.`;
  }
  return `From ${shape.countries.length} countries, none of them dominant.`;
}

/**
 * National delegations that sit inside this community in their entirety.
 *
 * The share-of-community figures cannot say this. Malta sends six MEPs, so
 * Malta is never more than a rounding error in a community of a hundred and
 * thirty — but all six of them landing in the same one is a fact about Malta,
 * and it is the kind of fact this overlay exists to surface. Read the other
 * way round: what share of that country is here, not what share of here is
 * that country.
 *
 * Three quarters of a delegation is the bar for "most", and every last member
 * is its own sentence, because the two are different claims: one is a country
 * leaning somewhere, the other is a country that did not split at all. Said
 * only in a network holding more than one country; below that it is true of
 * everything and says nothing.
 */
export function describeDelegations(shape) {
  if (!shape || shape.oneCountry) return "";
  const entries = (shape.countries || []).filter(
    (entry) => entry.countryTotal >= 2
  );
  const all = entries.filter((entry) => entry.shareOfCountry >= 0.999);
  const most = entries.filter(
    (entry) => entry.shareOfCountry >= 0.75 && entry.shareOfCountry < 0.999
  );

  const list = (items) => {
    const shown = items.slice(0, 3);
    const rest = items.length > 3 ? `, and ${items.length - 3} more` : "";
    return `${shown.join(", ")}${rest}`;
  };

  const sentences = [];
  if (all.length > 0) {
    sentences.push(
      `Holds every MEP from ${list(
        all.map((entry) => `${entry.country} (${entry.countryTotal})`)
      )}.`
    );
  }
  if (most.length > 0) {
    sentences.push(
      `Holds most of ${list(
        most.map(
          (entry) => `${entry.country} (${entry.count} of ${entry.countryTotal})`
        )
      )}.`
    );
  }
  return sentences.join(" ");
}

/**
 * Labels for a whole set of communities at once, disambiguated.
 *
 * Two communities of the same group get the same name from communityLabel,
 * and on term 7 that put two shapes on the canvas both saying "S&D". Where
 * that happens the country each is built from is the thing that separates
 * them, and it is also the answer to the question the reader is about to ask.
 */
export function labelCommunities(shapes, mandate) {
  const labels = (shapes || []).map((shape) => communityLabel(shape, mandate));
  const counts = new Map();
  labels.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1));
  return labels.map((label, index) => {
    if ((counts.get(label) || 0) < 2) return label;
    const top = shapes[index].countries && shapes[index].countries[0];
    if (!top || top.share < 0.3) return label;
    // The name may already carry that country, from the national-splinter
    // rule. "RE · Romania · Romania" is what happens when it does.
    return label.includes(`· ${top.country}`)
      ? label
      : `${label} · ${top.country}`;
  });
}

/**
 * What to write on a community: the groups inside it, largest first.
 *
 * Acronyms only, and at most two of them. The label sits on a canvas already
 * carrying seven hundred nodes; a full group name would be a wall of text over
 * the picture, and the composition is readable from the node colours anyway.
 *
 * The "+ 2" on the end counts *groups*, not members. It counted members first
 * — "EPP + 8 others" — and on a name whose other half is a list of political
 * groups, that is read as eight more groups; there is no way to read it
 * otherwise. As a count of groups it says the one thing the name would
 * otherwise hide, that this community is not only the group it is named after,
 * and the head count that goes with it is in the tooltip where there is room
 * to break it down.
 *
 * A name carrying a country can still hold members from elsewhere — the
 * country is named at 90% — and the number does not try to cover that too.
 * One kind of count in one place.
 */
export function communityLabel(shape, mandate) {
  if (!shape) return "";

  const named = (shape.composition || [])
    .filter((part) => part.share >= 0.2)
    .slice(0, 2);
  const country = shape.nationalSplinter;
  const head = country
    ? `${getGroupAcronym(shape.dominantGroup, mandate)} · ${country}`
    : named.length > 0
    ? named.map((part) => getGroupAcronym(part.groupId, mandate)).join(" + ")
    : shape.dominantGroup
    ? getGroupAcronym(shape.dominantGroup, mandate)
    : "Mixed";

  const others = Math.max(0, (shape.composition || []).length - named.length);
  return others > 0 ? `${head} + ${others}` : head;
}
