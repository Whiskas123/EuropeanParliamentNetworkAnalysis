import { contourDensity } from "d3";
import { getStructureAnalysis } from "./networkAnalysis.js";
import { getGroupAcronym, getGroupColor } from "./utils.js";

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

/** Rings smaller than this share of the community's largest are dropped. */
const MIN_RING_AREA_SHARE = 0.05;

/** A community whose largest group holds less than this reads as mixed, and
 *  is outlined in ink rather than in anybody's colour. */
const DOMINANT_SHARE_FOR_COLOR = 0.6;

/**
 * An outline has to be mostly its own members, or it does not get drawn.
 *
 * Not every community occupies a place. In term 10 the algorithm pulls the
 * 23 Polish EPP members out as a bloc of their own, and they are right to be
 * pulled out — they vote together — but on the canvas they sit interleaved
 * with the rest of the EPP, spread as widely as communities six times their
 * size. Any closed curve holding 22 of them holds sixty other people too, and
 * a dashed line round eighty nodes labelled "23 MEPs" is a false statement
 * about which nodes those are.
 *
 * So such a community is counted and named, and not outlined. The alternative
 * — drawing it anyway — is the trap this whole overlay exists to avoid: a
 * shape that looks like a finding and is an artefact of the drawing.
 */
const MIN_OUTLINE_PURITY = 0.5;

/** Outline colour for a community no single group owns. */
export const MIXED_COMMUNITY_COLOR = "#5a5a63";

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

/** Even-odd crossing test against every ring of a polygon at once. */
function insideRings(x, y, rings) {
  let inside = false;
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
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
 * Trace one community, in grid coordinates.
 *
 * Returns the tightest density level that still encloses COVERAGE of the
 * members, because tighter is more informative: every level below it is the
 * same shape with more slack.
 */
function outlineFor(points, grid, bandwidth) {
  if (points.length === 0) return [];
  if (points.length < 5) {
    // Too few members for a density surface to mean anything. A circle wide
    // enough to hold them is honest about that: it claims a place, not a shape.
    let cx = 0;
    let cy = 0;
    points.forEach((p) => {
      cx += p.gx;
      cy += p.gy;
    });
    cx /= points.length;
    cy /= points.length;
    let radius = 0;
    points.forEach((p) => {
      radius = Math.max(radius, Math.hypot(p.gx - cx, p.gy - cy));
    });
    return [circleRing(cx, cy, radius + bandwidth * 0.9)];
  }

  const contours = contourDensity()
    .x((p) => p.gx)
    .y((p) => p.gy)
    .size([grid.width, grid.height])
    .cellSize(CELL_SIZE)
    .bandwidth(bandwidth)
    .thresholds(THRESHOLD_COUNT)(points);

  // Ascending by density, so the last is the tightest. A zero-valued contour
  // is the whole canvas and never an answer.
  const usable = contours.filter((c) => c.value > 0 && c.coordinates.length > 0);
  if (usable.length === 0) return [];

  let chosen = usable[0];
  for (let i = usable.length - 1; i >= 0; i--) {
    const rings = usable[i].coordinates.map((polygon) => polygon[0]);
    let held = 0;
    for (let p = 0; p < points.length; p++) {
      if (insideRings(points[p].gx, points[p].gy, rings)) held++;
    }
    if (held / points.length >= COVERAGE) {
      chosen = usable[i];
      break;
    }
  }

  // Outer rings only. A hole punched in a community is a place where its own
  // members thin out, which is texture rather than boundary, and drawing it
  // dashed alongside the boundary reads as a second community.
  const rings = chosen.coordinates.map((polygon) => polygon[0]);
  const areas = rings.map((ring) => Math.abs(ringArea(ring)));
  const largest = Math.max(...areas);
  return rings.filter((ring, i) => areas[i] >= largest * MIN_RING_AREA_SHARE);
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
  const countries = new Set();
  placed.forEach((node) => countries.add(node.country || "Unknown"));
  const oneCountry = countries.size <= 1;

  // Which community each MEP belongs to, for the purity test below.
  const homeOf = new Map();
  analysis.communities.forEach((community) => {
    community.members.forEach((id) => homeOf.set(id, community.id));
  });

  const shapes = [];
  const scattered = [];
  analysis.communities.forEach((community) => {
    const points = [];
    community.members.forEach((id) => {
      const node = nodeMap.get(id);
      if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
      points.push({ gx: toGridX(node.x), gy: toGridY(node.y) });
    });
    const rings = outlineFor(points, grid, bandwidthFor(points));
    if (rings.length === 0) return;

    const laidOut = rings
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

    // What the outline would actually enclose. See MIN_OUTLINE_PURITY.
    let held = 0;
    let enclosed = 0;
    placed.forEach((node) => {
      if (!insideRings(node.x, node.y, laidOut)) return;
      enclosed++;
      if (homeOf.get(node.id) === community.id) held++;
    });
    const purity = enclosed === 0 ? 0 : held / enclosed;

    const mixed = community.dominantShare < DOMINANT_SHARE_FOR_COLOR;
    const shape = {
      id: community.id,
      size: community.size,
      rings: laidOut,
      anchor: { x: anchor[0], y: anchor[1] },
      dominantGroup: community.dominantGroup,
      dominantShare: community.dominantShare,
      composition: community.composition,
      nationalSplinter: oneCountry ? null : community.nationalSplinter,
      purity,
      enclosed,
      color:
        mixed || !community.dominantGroup
          ? MIXED_COMMUNITY_COLOR
          : getGroupColor(community.dominantGroup),
    };
    if (purity >= MIN_OUTLINE_PURITY) shapes.push(shape);
    else scattered.push(shape);
  });

  shapes.sort((a, b) => b.size - a.size);
  scattered.sort((a, b) => b.size - a.size);

  return {
    shapes,
    scattered,
    count: analysis.communityCount,
    concordantShare: analysis.concordantShare,
    ari: analysis.agreement ? analysis.agreement.ari : null,
    k: analysis.preprocessing.k,
    nodeCount: analysis.preprocessing.nodeCount,
  };
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
 * What to write on a community: the groups inside it, largest first.
 *
 * Acronyms only, and at most two of them. The label sits on a canvas already
 * carrying seven hundred nodes; a full group name would be a wall of text over
 * the picture, and the composition is readable from the node colours anyway.
 */
export function communityLabel(shape, mandate) {
  if (!shape) return "";
  if (shape.nationalSplinter) {
    return `${getGroupAcronym(shape.dominantGroup, mandate)} · ${
      shape.nationalSplinter
    }`;
  }
  const parts = (shape.composition || [])
    .filter((part) => part.share >= 0.2)
    .slice(0, 2)
    .map((part) => getGroupAcronym(part.groupId, mandate));
  if (parts.length === 0) {
    return shape.dominantGroup
      ? getGroupAcronym(shape.dominantGroup, mandate)
      : "Mixed";
  }
  return parts.join(" + ");
}
