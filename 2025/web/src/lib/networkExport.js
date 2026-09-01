/**
 * Vector export of the network and its numbers.
 *
 * The PNG export is a flattened raster capped at 8x, and its only context is
 * the filename. These prints get annotated in Figma, so they want to arrive as
 * shapes with a caption already attached.
 *
 * Everything here draws through lib/edgeStyle.js, the same module the canvas
 * uses, so an export always matches what was on screen.
 *
 * Contract fixed by the integration scaffolding — signatures are depended on
 * by NetworkCanvas and must not change without telling the orchestrator.
 *
 * The builders are pure string builders: no document, no canvas, no
 * measurement. Only downloadSVG touches the browser. That is what lets the
 * output be diffed and tested in node, and it is why text is laid out from
 * estimated advance widths rather than measured ones.
 */

import {
  selectEdges,
  edgeWidth,
  makeNodeColorFn,
  isEmphasised,
  nodeOpacity,
  edgeOpacity,
  computeLoyalty,
  boundsCenter,
  rotatePoint,
  UNKNOWN_COLOR,
} from "./edgeStyle.js";
import { listParties } from "./parties.js";
import {
  isNonAttached,
  ringInside,
  NON_ATTACHED_RING,
  svgSwatchStroke,
} from "./groupColors.js";
import { MIN_TERM_SESSIONS } from "./trends.js";
import { FAMILIES, FAMILY_ORDER, pairKey } from "./families.js";
import {
  allyShares,
  coalitionsFor,
  groupInfo,
  groupsIn,
  renamesFor,
  sittingOf,
  viewFor,
} from "./coalitions.js";
import {
  buildCommunityShapes,
  DEFAULT_COVERAGE,
  labelCommunities,
  placeLabels,
} from "./communityShapes.js";
import {
  getGroupDisplayName,
  getGroupAcronym,
  getGroupColor,
  getDelta,
  getRedGreenColor,
  getDivergingColor,
} from "./utils.js";

/* -------------------------------------------------------------------------
 * Print constants
 * ---------------------------------------------------------------------- */

/**
 * No webfont, no @import, no <style> pointing anywhere: a print that has to
 * fetch something is a print that renders differently on someone else's
 * machine. A generic stack resolves on macOS, Linux and in Figma.
 */
const FONT_STACK =
  "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif";

const INK = "#1a1a1a";
const SECONDARY = "#666666";
const MUTED = "#8a8a8a";
const RULE = "#e0e0e0";
const PAPER = "#ffffff";

/** Inter-group edges, as on the canvas. */
const EDGE_NEUTRAL_COLOR = "#999999";
/** Canvas alpha for edges (the non-Safari value). */
const EDGE_BASE_OPACITY = 0.3;
const NODE_BORDER = "#000000";
const NODE_BORDER_OPACITY = 0.2;
const NODE_BORDER_WIDTH = 0.5;

/**
 * Edge widths are quantised into this many buckets before batching, so that
 * near-identical strokes share one <path>. 64 steps across the width range is
 * finer than any printer resolves and cuts the element count by ~1000x.
 */
const WIDTH_STEPS = 64;

const DEFAULT_RENDER = {
  edgePercentile: 50,
  edgeWidth: 1,
  colorMode: "group",
  dim: null,
  communities: false,
  /**
   * The black ring on every dot, not only on the non-attached — the "Node
   * outline" control in display settings. See NODE_RING_FRACTION.
   */
  nodeRings: false,
  /** null means the automatic split; a number pins the count. */
  communityK: null,
  /** Share of a community its outline encloses; see communityShapes.js. */
  communityCoverage: DEFAULT_COVERAGE,
  /** Radians clockwise, as set by the canvas's rotate control. */
  rotation: 0,
  /**
   * The printed furniture — title, footnotes, colour key — around the
   * picture. Off by default: the file that gets carried into Figma or onto a
   * panel is wanted as the network alone, and a caption is a caption there,
   * not a layer. The PNG export still carries its band.
   */
  captions: false,
};

/** Parties below this many MEPs never reach the legend; there is a long tail. */
const LEGEND_PARTY_MIN = 2;
const LEGEND_PARTY_CAP = 24;
/** Swatches in the loyalty ramp. */
const GRADIENT_STOPS = 9;

const TERM_YEARS = {
  6: "2004–09",
  7: "2009–14",
  8: "2014–19",
  9: "2019–24",
  10: "2024–",
};

/* -------------------------------------------------------------------------
 * Small pure helpers
 * ---------------------------------------------------------------------- */

function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Round to `decimals`, dropping the trailing zeros a fixed format leaves. */
function round(value, decimals = 1) {
  if (!Number.isFinite(value)) return "0";
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

const n1 = (value) => round(value, 1);
const n2 = (value) => round(value, 2);

/**
 * XML ids cannot hold "/" or a space, and group acronyms hold both
 * ("Verts/ALE", "The Left"). The readable acronym stays on data-group.
 */
function xmlId(value) {
  const cleaned = String(value || "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "unnamed";
}

function fmtInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number).toLocaleString("en-US");
}

function fmtPct(score) {
  return Number.isFinite(score) ? `${(score * 100).toFixed(1)}%` : "—";
}

function ordinal(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return null;
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${number}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th";
  return `${number}${suffix}`;
}

/**
 * Advance width, guessed. There is no DOM here to measure in, and adding one
 * would make the export untestable outside a browser. 0.52em per character is
 * a little generous for Helvetica, which is the safe direction: a legend
 * column that is too wide only wastes paper, one that is too narrow collides.
 */
function estimateWidth(text, size) {
  return String(text || "").length * size * 0.52;
}

function svgText(x, y, content, options = {}) {
  const {
    size,
    weight,
    fill = INK,
    anchor,
    italic,
    opacity,
    monospaceDigits,
  } = options;
  const parts = [`x="${n1(x)}"`, `y="${n1(y)}"`, `font-size="${n2(size)}"`];
  if (weight) parts.push(`font-weight="${weight}"`);
  if (fill) parts.push(`fill="${fill}"`);
  if (anchor) parts.push(`text-anchor="${anchor}"`);
  if (italic) parts.push(`font-style="italic"`);
  if (opacity !== undefined) parts.push(`opacity="${n2(opacity)}"`);
  if (monospaceDigits) parts.push(`font-variant-numeric="tabular-nums"`);
  return `<text ${parts.join(" ")}>${esc(content)}</text>`;
}

function svgRect(x, y, width, height, fill, extra = "") {
  return `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(width)}" height="${n1(
    height
  )}" fill="${fill}"${extra ? ` ${extra}` : ""}/>`;
}

function svgRule(x, y, width, color = RULE, thickness = 1) {
  return `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(width)}" height="${n2(
    thickness
  )}" fill="${color}"/>`;
}

/** Node radius, mirroring the canvas so an export is the same size on paper. */
function nodeRadius(count) {
  const total = Number(count) > 0 ? Number(count) : 1;
  return Math.max(3, Math.min(15, 15 * Math.pow(total / 700, 0.4)));
}

/**
 * Community outlines, or nothing.
 *
 * An export is usually the last step before a print deadline, and a partition
 * that throws on some unusual network must not be the reason the file never
 * arrives — the picture without its outlines is still the picture.
 */
function tryCommunityShapes(graphData, settings) {
  try {
    return buildCommunityShapes(graphData, settings);
  } catch (error) {
    console.warn("exportNetworkSVG: community outlines unavailable:", error);
    return null;
  }
}

/** d3 sometimes swaps an endpoint id for the node object it resolved to. */
function endpointId(value) {
  return value && typeof value === "object" ? value.id : value;
}

function makeNodeLookup(graphData, nodes) {
  const map = graphData && graphData.nodeMap;
  if (map && typeof map.get === "function") return (id) => map.get(id);
  const built = new Map();
  nodes.forEach((node) => built.set(node.id, node));
  return (id) => built.get(id);
}

/**
 * The edge set a view is built from.
 *
 * `links` arrives already cut to the densest 50% by the loader, so applying
 * the percentile to it would cut twice and an export would be thinner than
 * the screen. `allLinks` is the set the percentile is defined against.
 */
function sourceEdges(graphData) {
  const all = graphData && graphData.allLinks;
  if (Array.isArray(all) && all.length > 0) return all;
  return (graphData && graphData.links) || [];
}

/* -------------------------------------------------------------------------
 * Caption
 * ---------------------------------------------------------------------- */

/**
 * The caption drawn into an export: term, filters, counts, and the
 * participation caveat. Shared so the PNG and SVG paths cannot disagree.
 *
 * The voting-session count is not optional decoration. A policy area can rest
 * on twelve votes, and a print of it that does not say so reads exactly like a
 * print of the four thousand that make up a whole term. When the count is
 * missing the caption says so rather than quietly dropping the line.
 *
 * @param {Object} meta - {mandate, country, subject, nodeCount, votingSessions}
 * @returns {{title: string, subtitle: string, lines: string[], caveat: string}}
 */
export function buildCaption(meta = {}) {
  const { mandate, country, subject, nodeCount, votingSessions } = meta || {};

  const term = ordinal(mandate);
  const years = TERM_YEARS[Math.round(Number(mandate))];

  let title;
  if (country && subject) title = `${country} — ${subject}`;
  else if (subject) title = subject;
  else if (country) title = country;
  else title = "The European Parliament";

  const subtitle = term
    ? `${term} European Parliament${years ? ` (${years})` : ""}`
    : "European Parliament";

  const lines = [];

  const meps = fmtInt(nodeCount);
  lines.push(meps ? `${meps} MEPs` : "MEP count not recorded");

  const sessions = fmtInt(votingSessions);
  lines.push(
    sessions
      ? `${sessions} voting sessions${subject ? " in this policy area" : ""}`
      : "Voting sessions: not recorded"
  );

  lines.push(
    "Every dot is an MEP. Two MEPs sit close together when they voted the same way."
  );

  const caveat = sessions
    ? `Only MEPs who voted in more than half of these ${sessions} voting sessions appear; everyone else is left out of the network.`
    : "Only MEPs who voted in more than half of the voting sessions appear; everyone else is left out of the network.";

  return { title, subtitle, lines, caveat };
}

/* -------------------------------------------------------------------------
 * Legend
 * ---------------------------------------------------------------------- */

/**
 * Colour key for the active mode, in the order it should be read.
 *
 * Every colour comes back out of edgeStyle's own colour function rather than
 * being recomputed here, so a legend swatch is by construction the colour the
 * node was drawn in.
 *
 * Entries carry `count` and `key` beyond the documented shape; renderers that
 * only want {label, color} can ignore them.
 *
 * @param {Object} graphData
 * @param {"group"|"country"|"party"|"loyalty"} colorMode
 * @param {number|null} mandate - only affects group display names
 * @returns {Array<{label: string, color: string}>}
 */
export function buildLegend(graphData, colorMode = "group", mandate = null) {
  const nodes = (graphData && graphData.nodes) || [];
  if (nodes.length === 0) return [];

  const term =
    mandate ??
    (graphData && graphData.mandate) ??
    (graphData && graphData.metadata && graphData.metadata.mandate) ??
    null;

  if (colorMode === "country") {
    const colorFn = makeNodeColorFn(graphData, "country");
    const countries = new Map();
    nodes.forEach((node) => {
      if (!node.country) return;
      const existing = countries.get(node.country);
      if (existing) {
        existing.count += 1;
        return;
      }
      countries.set(node.country, {
        key: node.country,
        label: node.country,
        color: colorFn(node),
        count: 1,
      });
    });
    return [...countries.values()].sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }

  if (colorMode === "party") {
    const parties = listParties(nodes, LEGEND_PARTY_MIN);
    // In a single-country view the country suffix is the same on every row.
    const countries = new Set(nodes.map((node) => node.country));
    const suffix = countries.size > 1;
    const shown = parties.slice(0, LEGEND_PARTY_CAP).map((party) => ({
      key: party.key,
      label: suffix ? `${party.name} (${party.country})` : party.name,
      color: party.color,
      count: party.count,
    }));
    const hidden = parties.length - shown.length;
    if (hidden > 0) {
      shown.push({
        key: "__more",
        label: `+${hidden} smaller parties`,
        color: UNKNOWN_COLOR,
        count: 0,
      });
    }
    return shown;
  }

  if (colorMode === "loyalty") {
    const loyalty = computeLoyalty(graphData);
    if (loyalty.size === 0) return [];
    const colorFn = makeNodeColorFn(graphData, "loyalty");

    let min = Infinity;
    let max = -Infinity;
    loyalty.forEach((score) => {
      if (score < min) min = score;
      if (score > max) max = score;
    });
    const span = max - min || 1;

    // The ramp is stretched over the range actually present, and only
    // makeNodeColorFn knows that range. Sampling it through the MEP nearest
    // each stop gets the drawn colours without duplicating the scale here.
    const nearest = new Array(GRADIENT_STOPS).fill(null);
    const distance = new Array(GRADIENT_STOPS).fill(Infinity);
    nodes.forEach((node) => {
      const score = loyalty.get(node.id);
      if (typeof score !== "number") return;
      for (let i = 0; i < GRADIENT_STOPS; i += 1) {
        const target = min + (span * i) / (GRADIENT_STOPS - 1);
        const gap = Math.abs(score - target);
        if (gap < distance[i]) {
          distance[i] = gap;
          nearest[i] = node;
        }
      }
    });

    return nearest.map((node, i) => {
      let label = "";
      if (i === 0) label = `Least loyal · ${fmtPct(min)}`;
      else if (i === GRADIENT_STOPS - 1) label = `Most loyal · ${fmtPct(max)}`;
      return {
        key: `loyalty-${i}`,
        label,
        color: node ? colorFn(node) : UNKNOWN_COLOR,
        gradient: true,
        count: 0,
      };
    });
  }

  const colorFn = makeNodeColorFn(graphData, "group");
  const groups = new Map();
  nodes.forEach((node) => {
    if (!node.groupId) return;
    const existing = groups.get(node.groupId);
    if (existing) {
      existing.count += 1;
      return;
    }
    groups.set(node.groupId, {
      key: node.groupId,
      label: getGroupDisplayName(node.groupId, term),
      color: colorFn(node),
      // The one entry whose swatch is ringed rather than simply filled: a grey
      // with no group behind it needs its edge drawn.
      nonAttached: isNonAttached(node.groupId),
      count: 1,
    });
  });

  return [...groups.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  );
}

/* -------------------------------------------------------------------------
 * Legend and caption blocks, laid out in design units
 * ---------------------------------------------------------------------- */

/**
 * How a legend packs into a given width.
 * Column count comes from estimated label widths; see estimateWidth.
 */
function planLegend(entries, contentWidth, du) {
  if (!entries || entries.length === 0) {
    return { height: 0, rows: 0, columns: 0 };
  }

  if (entries[0].gradient) {
    return {
      height: du(20) + du(26),
      rows: 1,
      columns: entries.length,
      gradient: true,
      swatchHeight: du(20),
      labelSize: du(14),
    };
  }

  const labelSize = du(14);
  const swatch = du(13);
  const gapAfterSwatch = du(9);
  const gapBetweenColumns = du(28);
  const widest = entries.reduce(
    (max, entry) => Math.max(max, estimateWidth(entry.label, labelSize)),
    0
  );
  const wanted = swatch + gapAfterSwatch + widest + gapBetweenColumns;
  const columns = Math.max(
    1,
    Math.min(entries.length, Math.floor(contentWidth / Math.max(wanted, 1)))
  );
  const rows = Math.ceil(entries.length / columns);
  return {
    height: rows * du(26),
    rows,
    columns,
    columnWidth: contentWidth / columns,
    labelSize,
    swatch,
    gapAfterSwatch,
  };
}

/** Legend elements, drawn from a local origin at its top-left corner. */
function renderLegend(entries, plan, du) {
  if (!entries || entries.length === 0) return "";
  const parts = [];

  if (plan.gradient) {
    const width = plan.columnWidth || 0;
    const stopWidth = (plan.stripWidth || width) / entries.length;
    entries.forEach((entry, i) => {
      // Half a unit of overlap; abutting rectangles otherwise show seams.
      parts.push(
        svgRect(
          i * stopWidth,
          0,
          stopWidth + 0.6,
          plan.swatchHeight,
          entry.color
        )
      );
    });
    const last = entries[entries.length - 1];
    parts.push(
      svgText(0, plan.swatchHeight + du(18), entries[0].label, {
        size: plan.labelSize,
        fill: SECONDARY,
      })
    );
    parts.push(
      svgText(
        entries.length * stopWidth,
        plan.swatchHeight + du(18),
        last.label,
        { size: plan.labelSize, fill: SECONDARY, anchor: "end" }
      )
    );
    return parts.join("");
  }

  const rowHeight = du(26);
  entries.forEach((entry, i) => {
    const column = i % plan.columns;
    const row = Math.floor(i / plan.columns);
    const x = column * plan.columnWidth;
    const y = row * rowHeight;
    parts.push(
      `<circle cx="${n1(x + plan.swatch / 2)}" cy="${n1(
        y + rowHeight * 0.42
      )}" r="${n2(plan.swatch / 2)}" fill="${esc(entry.color)}"` +
        (entry.nonAttached
          ? ` stroke="${NON_ATTACHED_RING}" stroke-width="${n2(
              plan.swatch * 0.09
            )}"`
          : "") +
        `/>`
    );
    parts.push(
      svgText(
        x + plan.swatch + plan.gapAfterSwatch,
        y + rowHeight * 0.42 + plan.labelSize * 0.36,
        entry.label,
        { size: plan.labelSize, fill: INK }
      )
    );
  });
  return parts.join("");
}

/* -------------------------------------------------------------------------
 * The network
 * ---------------------------------------------------------------------- */

/**
 * The network as a standalone SVG document.
 *
 * Drawn straight in graph coordinates: the viewBox is the node bounding box
 * plus padding, so the file is identical whatever size the window was, and
 * node radii and edge widths stay in the same units the canvas uses.
 *
 * Edges are batched. One <line> per edge at 136,000 edges is a file no vector
 * editor will open; edges sharing a colour, a quantised width and an opacity
 * are collapsed into a single <path> of "M x y L x y" segments instead, which
 * takes the element count from six figures to a few hundred.
 *
 * @param {Object} options
 * @param {Object} options.graphData - nodes, links, allLinks, nodeMap
 * @param {Object} options.renderSettings - {edgePercentile, edgeWidth,
 *   colorMode, dim, communities, communityK, communityCoverage, rotation}
 * @param {Object} options.meta - {mandate, country, subject, nodeCount, votingSessions}
 * @returns {string} a complete <svg> document
 */
export function exportNetworkSVG({ graphData, renderSettings, meta } = {}) {
  const view = { ...DEFAULT_RENDER, ...(renderSettings || {}) };
  const info = meta || {};

  const allNodes = (graphData && graphData.nodes) || [];
  if (!Array.isArray(allNodes) || allNodes.length === 0) {
    throw new Error("exportNetworkSVG: graphData has no nodes to draw");
  }

  const nodes = allNodes.filter(
    (node) => Number.isFinite(node.x) && Number.isFinite(node.y)
  );
  if (nodes.length === 0) {
    throw new Error(
      "exportNetworkSVG: no node carries a position — the layout has not loaded"
    );
  }
  if (nodes.length < allNodes.length) {
    // Silently dropping a few MEPs would produce a print that looks complete
    // and is not, so say it out loud.
    console.warn(
      `exportNetworkSVG: ${
        allNodes.length - nodes.length
      } of ${allNodes.length} nodes have no position and are not drawn`
    );
  }

  // --- geometry -----------------------------------------------------------
  // The reader may have turned the network before asking for the print — a
  // layout has no north, so which way up it sits is a composition decision.
  // The turn is applied to the coordinates once, here, and everything below —
  // the page the picture is cut to, the edges, the outlines, the names — then
  // works in the chosen orientation without knowing there was one.
  const rotation = Number.isFinite(view.rotation) ? view.rotation : 0;
  const center = boundsCenter(nodes);
  const place = (x, y) => rotatePoint(x, y, center, rotation);
  const placed = rotation
    ? nodes.map((node) => {
        const point = place(node.x, node.y);
        return { ...node, x: point.x, y: point.y };
      })
    : nodes;

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

  const radius = nodeRadius(nodes.length);
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  /**
   * One design unit, in graph units. Everything typographic is expressed as a
   * multiple of it, so the caption is the same fraction of the picture whether
   * the layout spans 400 units or 12,000 — the two are two orders of magnitude
   * apart across the precomputed files.
   */
  const unit = Math.max(spanX, spanY, radius * 40) / 1000;
  const du = (value) => value * unit;

  // 1 decimal is plenty at the spans these layouts use (thousands of units);
  // a tight country layout gets more, so rounding never eats real distance.
  const coordDecimals = Math.max(spanX, spanY) >= 200 ? 1 : 3;
  const c = (value) => round(value, coordDecimals);

  // --- communities --------------------------------------------------------
  // Only when the screen is showing them, and drawn to the same multiples of
  // the node radius, so the print is the picture the reader was looking at.
  // Each community is its own <g> with its name on it: these files are opened
  // in a vector editor to be annotated by hand, and a layer called "PPE" is
  // the difference between that being possible and not.
  let communityParts = [];
  let communityLabelParts = [];
  let communityNote = "no community outlines";
  // Grows to hold every outline and every name plate, so the page below can be
  // cut to what is drawn rather than to where the dots happen to stop.
  let drawnBounds = null;
  const include = (x, y) => {
    if (!drawnBounds) {
      drawnBounds = { minX: x, maxX: x, minY: y, maxY: y };
      return;
    }
    if (x < drawnBounds.minX) drawnBounds.minX = x;
    if (x > drawnBounds.maxX) drawnBounds.maxX = x;
    if (y < drawnBounds.minY) drawnBounds.minY = y;
    if (y > drawnBounds.maxY) drawnBounds.maxY = y;
  };
  if (view.communities) {
    // The same k and coverage the screen used, or the print carries outlines
    // of a partition the reader never saw.
    const communities = tryCommunityShapes(graphData, {
      k: view.communityK ?? null,
      coverage: view.communityCoverage,
    });
    if (communities && communities.shapes.length > 0) {
      const names = labelCommunities(communities.shapes, info.mandate);
      // In design units, like the caption: the outline and its name are the
      // same fraction of the picture whether the layout spans 400 units or
      // 12,000, which is also what the canvas does with them on screen.
      const outlineWidth = Math.max(radius * 0.3, du(1.1));
      const dashOn = outlineWidth * 5;
      const dashOff = outlineWidth * 3.6;
      const titleSize = Math.max(radius * 2.2, du(17));
      const countSize = titleSize * 0.62;
      // The outlines are traced through the same turn as the MEPs inside them,
      // and so is everything the names are placed against — a turned network is
      // still read horizontally, so the plates are laid out in the upright
      // frame, over an upright copy of the picture.
      const turnedRings = communities.shapes.map((shape) =>
        shape.rings.map((ring) =>
          ring.map((point) => {
            const turned = place(point[0], point[1]);
            return [turned.x, turned.y];
          })
        )
      );
      communityParts = communities.shapes.map((shape, index) => {
        const d = turnedRings[index]
          .map(
            (ring) =>
              `M${ring
                .map((point) => {
                  include(point[0], point[1]);
                  return `${c(point[0])} ${c(point[1])}`;
                })
                .join("L")}Z`
          )
          .join("");
        const name = names[index];
        return (
          `<g data-community="${esc(name)}" data-size="${shape.size}">` +
          `<title>${esc(`${name} — ${shape.size} MEPs`)}</title>` +
          `<path fill="none" stroke="${esc(shape.color)}" stroke-width="${n2(
            outlineWidth
          )}" stroke-opacity="0.9" stroke-linejoin="round" ` +
          `stroke-dasharray="${n2(dashOn)} ${n2(dashOff)}" d="${d}"/>` +
          `</g>`
        );
      });
      // Same placement rule as the canvas, on an estimate of the text width
      // rather than a measurement of it — half a character of slack in a
      // collision test, which is the safe direction.
      const blockHeight = titleSize + countSize * 1.15;
      const padX = titleSize * 0.42;
      const padY = titleSize * 0.3;
      const plateSizes = communities.shapes.map((shape, index) => ({
        width:
          Math.max(
            estimateWidth(names[index], titleSize),
            estimateWidth(`${shape.size} MEPs`, countSize)
          ) +
          padX * 2,
        height: blockHeight + padY * 2,
      }));
      // Every dot in the picture, turned, tagged with the community it is in,
      // so a name can be charged more for covering somebody else's members
      // than for covering its own.
      const memberOf = new Map();
      communities.shapes.forEach((shape, index) => {
        (shape.members || []).forEach((id) => memberOf.set(id, index));
      });
      const fieldPoints = new Float64Array(placed.length * 2);
      const fieldOwners = new Int32Array(placed.length);
      placed.forEach((node, i) => {
        fieldPoints[i * 2] = node.x;
        fieldPoints[i * 2 + 1] = node.y;
        fieldOwners[i] = memberOf.has(node.id) ? memberOf.get(node.id) : -1;
      });
      const centres = placeLabels(
        communities.shapes.map((shape, index) => ({
          ring: turnedRings[index][0],
          width: plateSizes[index].width,
          height: plateSizes[index].height,
        })),
        {
          points: fieldPoints,
          owners: fieldOwners,
          rings: turnedRings.flat(),
        },
        titleSize * 0.55
      );
      communityLabelParts = communities.shapes.flatMap((shape, index) => {
        const { width: plateWidth, height: plateHeight } = plateSizes[index];
        const plateLeft = centres[index].x - plateWidth / 2;
        const plateTop = centres[index].y - plateHeight / 2;
        const titleY = plateTop + titleSize - padY * 0.2;
        const countY = titleY + countSize * 1.15;
        const textX = centres[index].x;
        include(plateLeft, plateTop);
        include(plateLeft + plateWidth, plateTop + plateHeight);
        return [
          // A plate, not a halo: a stroke heavy enough to lift type off seven
          // hundred dots eats the letterforms. Same reasoning as the canvas.
          `<rect x="${n1(plateLeft)}" y="${n1(
            plateTop
          )}" width="${n1(plateWidth)}" height="${n1(
            plateHeight
          )}" rx="${n2(titleSize * 0.32)}" fill="${PAPER}" fill-opacity="0.9"/>`,
          svgText(textX, titleY, names[index], {
            size: titleSize,
            weight: 600,
            fill: shape.labelColor || shape.color,
            anchor: "middle",
          }),
          svgText(textX, countY, `${shape.size} MEPs`, {
            size: countSize,
            weight: 500,
            fill: SECONDARY,
            anchor: "middle",
          }),
        ];
      });
      communityNote = `${communities.shapes.length} community outlines`;
    } else {
      communityNote = "community outlines requested, none could be drawn";
    }
  }

  // --- the page ------------------------------------------------------------
  // Cut to everything that gets drawn, not to the dots.
  //
  // A community outline is a density contour and reaches past the outermost
  // MEP it encloses; a community's name is stacked *upwards* off the top of
  // its shape, and on term 10 the last name in the stack lands five hundred
  // units above the highest dot in the network. Framing on the node bounds
  // alone therefore cuts the labels off — which is exactly what it did.
  //
  // The type size is deliberately still a function of the node span above:
  // sizing the labels off a box the labels themselves widen is a loop, and a
  // network with one far-flung name would come out set in smaller type than
  // the same network without it.
  const drawn = drawnBounds || { minX, maxX, minY, maxY };
  const frameMinX = Math.min(minX, drawn.minX);
  const frameMaxX = Math.max(maxX, drawn.maxX);
  const frameMinY = Math.min(minY, drawn.minY);
  const frameMaxY = Math.max(maxY, drawn.maxY);

  const pad = du(40) + radius;
  let left = frameMinX - pad;
  let width = frameMaxX - frameMinX + pad * 2;
  const netTop = frameMinY - pad;
  const netHeight = frameMaxY - frameMinY + pad * 2;

  // --- caption ------------------------------------------------------------
  // Always built, not always drawn: it is what the document's <title> and
  // <desc> carry, and a file with no provenance in it at all is a file nobody
  // can place six months later. Whether any of it is set in type around the
  // picture is the caller's call, and by default it is not.
  const caption = buildCaption({
    mandate: info.mandate,
    country: info.country,
    subject: info.subject,
    nodeCount: info.nodeCount ?? nodes.length,
    votingSessions: info.votingSessions,
  });

  const headerParts = [];
  const footerParts = [];
  let headerHeight = 0;
  let footerHeight = 0;

  if (view.captions) {
    // A portrait layout can be narrower than its own caption wants to be.
    const minWidth = du(1080);
    if (width < minWidth) {
      left -= (minWidth - width) / 2;
      width = minWidth;
    }
    const margin = du(40);
    const contentWidth = width - margin * 2;

    const legend = buildLegend(graphData, view.colorMode, info.mandate);

    const titleSize = du(38);
    const subtitleSize = du(19);
    const lineSize = du(15);
    const caveatSize = du(13);

    let hy = du(34);
    headerParts.push(
      svgText(margin, hy + titleSize, caption.title, {
        size: titleSize,
        weight: 600,
        fill: INK,
      })
    );
    hy += titleSize * 1.28;
    headerParts.push(
      svgText(margin, hy + subtitleSize, caption.subtitle, {
        size: subtitleSize,
        fill: SECONDARY,
      })
    );
    hy += subtitleSize * 1.5;
    headerParts.push(svgRule(margin, hy + du(16), contentWidth, RULE, du(1)));
    headerHeight = hy + du(16) + du(26);

    const legendPlan = planLegend(legend, contentWidth, du);
    if (legendPlan.gradient) {
      legendPlan.columnWidth = Math.min(contentWidth, du(420));
      legendPlan.stripWidth = legendPlan.columnWidth;
    }

    let fy = du(24);
    footerParts.push(svgRule(margin, fy, contentWidth, RULE, du(1)));
    fy += du(30);
    caption.lines.forEach((line, index) => {
      footerParts.push(
        svgText(margin, fy + lineSize, line, {
          size: lineSize,
          fill: index === caption.lines.length - 1 ? SECONDARY : INK,
          weight: index === caption.lines.length - 1 ? undefined : 500,
        })
      );
      fy += lineSize * 1.6;
    });
    if (legendPlan.height > 0) {
      fy += du(14);
      footerParts.push(
        `<g id="legend" transform="translate(${n1(margin)}, ${n1(fy)})">` +
          renderLegend(legend, legendPlan, du) +
          `</g>`
      );
      fy += legendPlan.height;
    }
    fy += du(12);
    footerParts.push(
      svgText(margin, fy + caveatSize, caption.caveat, {
        size: caveatSize,
        fill: MUTED,
        italic: true,
      })
    );
    fy += caveatSize * 1.5;
    footerHeight = fy + du(34);
  }

  const top = netTop - headerHeight;
  const height = headerHeight + netHeight + footerHeight;

  // --- edges --------------------------------------------------------------
  // A turned view cannot borrow graphData's own node map: that map holds the
  // untouched positions, and half a picture drawn at the old angle is worse
  // than one drawn at either.
  let lookup;
  if (rotation) {
    const placedById = new Map(placed.map((node) => [node.id, node]));
    lookup = (id) => placedById.get(id);
  } else {
    lookup = makeNodeLookup(graphData, nodes);
  }
  const colorFn = makeNodeColorFn(graphData, view.colorMode);
  const dim = view.dim && view.dim.value ? view.dim : null;
  const emphasised = new Set();
  nodes.forEach((node) => {
    if (isEmphasised(node, dim)) emphasised.add(node.id);
  });

  const candidates = sourceEdges(graphData);
  const drawnEdges = selectEdges(candidates, view.edgePercentile);
  const widthStep = Math.max(view.edgeWidth, 0.001) / WIDTH_STEPS;

  const batches = new Map();
  let missingEndpoints = 0;
  let invisible = 0;

  drawnEdges.forEach((edge) => {
    const source = lookup(endpointId(edge.source));
    const target = lookup(endpointId(edge.target));
    if (!source || !target) {
      missingEndpoints += 1;
      return;
    }
    if (!Number.isFinite(source.x) || !Number.isFinite(target.x)) return;

    const raw = edgeWidth(edge.weight, view.edgeWidth);
    if (raw <= 0) {
      // Weight at or below the neutral point: zero width, nothing to draw.
      invisible += 1;
      return;
    }
    const stroke = Math.max(widthStep, Math.round(raw / widthStep) * widthStep);

    const sameGroup =
      source.groupId && target.groupId && source.groupId === target.groupId;
    const color = sameGroup ? colorFn(source) : EDGE_NEUTRAL_COLOR;
    const opacity = edgeOpacity(
      emphasised.has(source.id) && emphasised.has(target.id),
      Boolean(dim),
      EDGE_BASE_OPACITY
    );

    const key = `${color}|${n2(stroke)}|${n2(opacity)}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { color, stroke, opacity, segments: [] };
      batches.set(key, batch);
    }
    batch.segments.push(
      `M${c(source.x)} ${c(source.y)}L${c(target.x)} ${c(target.y)}`
    );
  });

  if (missingEndpoints > 0) {
    console.warn(
      `exportNetworkSVG: ${missingEndpoints} edges reference an MEP that is not in the node set and were not drawn`
    );
  }

  // Thin before thick, matching the canvas, which sorts by weight so the
  // heavy intra-group edges land on top of the grey wash.
  const ordered = [...batches.values()].sort((a, b) => a.stroke - b.stroke);
  const edgeParts = ordered.map(
    (batch) =>
      `<path fill="none" stroke="${esc(batch.color)}" stroke-width="${n2(
        batch.stroke
      )}" stroke-opacity="${n2(batch.opacity)}" d="${batch.segments.join(
        ""
      )}"/>`
  );

  // --- nodes --------------------------------------------------------------
  const byGroup = new Map();
  placed.forEach((node) => {
    const groupId = node.groupId || "Unknown";
    let bucket = byGroup.get(groupId);
    if (!bucket) {
      bucket = [];
      byGroup.set(groupId, bucket);
    }
    bucket.push(node);
  });

  const nodeGroups = [...byGroup.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([groupId, members]) => {
      const acronym = getGroupAcronym(groupId, info.mandate);
      const circles = members.map((node) => {
        const lit = emphasised.has(node.id);
        const alpha = nodeOpacity(lit, Boolean(dim));
        // The black ring: always on the non-attached, on everyone when the
        // reader asked for it in display settings. Faded nodes give it up — it
        // is a lot of dark ink for something the reader has just pushed into
        // the background, and at 12% a ring reads as speckle, not as an edge.
        const nodeRinged =
          lit && (view.nodeRings || isNonAttached(node.groupId));
        const fill = colorFn(node) || UNKNOWN_COLOR;
        // The subject of a dim is drawn a little larger inside a dark ring,
        // exactly as the canvas draws it — a pale fill (the non-attached are
        // #CCCCCC, Renew is yellow) cannot carry "this one is lit" on its own
        // against a field faded to 12%. See EMPHASIS_NODE_SCALE in
        // components/NetworkCanvas.js.
        const ringed = Boolean(dim) && lit;
        const r = ringed ? radius * 1.25 : radius;
        // Inside the dot, so the fill still reads as the group's colour at the
        // size a dot lands on a wall panel. See ringInside.
        const ring = nodeRinged && !ringed ? ringInside(radius) : null;
        const attrs =
          `cx="${c(node.x)}" cy="${c(node.y)}" r="${n2(ring ? ring.radius : r)}" ` +
          `fill="${esc(fill)}"` +
          (ringed
            ? ` stroke="#1a1a1a" stroke-opacity="0.8" stroke-width="1.2"`
            : ring
            ? ` stroke="${NON_ATTACHED_RING}" stroke-width="${n2(ring.width)}"`
            : "") +
          (alpha < 1 ? ` opacity="${n2(alpha)}"` : "");
        // The MEP name rides along as <title>: it is what a vector editor
        // shows as the layer name, which is the whole point of annotating
        // these by hand afterwards.
        return `<circle ${attrs}><title>${esc(
          node.label || node.id
        )}</title></circle>`;
      });
      return (
        `<g id="${xmlId(acronym)}" data-group="${esc(
          acronym
        )}" data-count="${members.length}">` +
        circles.join("") +
        `</g>`
      );
    });

  // --- document -----------------------------------------------------------
  const pixelWidth = 1600;
  const pixelHeight = Math.round((pixelWidth * height) / width);

  const describedSettings = [
    `edges ${drawnEdges.length.toLocaleString("en-US")} of ${candidates.length.toLocaleString(
      "en-US"
    )} at ${round(view.edgePercentile, 1)}%`,
    `width x${round(view.edgeWidth, 2)}`,
    `colour by ${view.colorMode}`,
    view.nodeRings ? "every dot outlined" : "only the non-attached outlined",
    dim ? `dimmed to ${dim.type} ${dim.value}` : "no dim",
    rotation
      ? `turned ${round((rotation * 180) / Math.PI, 0)}° from the layout`
      : "at the layout's own orientation",
    communityNote,
    `${invisible.toLocaleString("en-US")} selected edges fall at or below the neutral weight and carry no width`,
  ].join(", ");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" ` +
    `viewBox="${n1(left)} ${n1(top)} ${n1(width)} ${n1(height)}" ` +
    `font-family="${FONT_STACK}">` +
    `<title>${esc(`${caption.title} — ${caption.subtitle}`)}</title>` +
    `<desc>${esc(
      `${caption.lines.join(". ")}. ${caption.caveat} Render: ${describedSettings}.`
    )}</desc>` +
    svgRect(left, top, width, height, PAPER, 'id="background"') +
    `<g id="edges">${edgeParts.join("")}</g>` +
    (communityParts.length > 0
      ? `<g id="communities">${communityParts.join("")}</g>`
      : "") +
    `<g id="nodes" stroke="${NODE_BORDER}" stroke-opacity="${NODE_BORDER_OPACITY}" ` +
    `stroke-width="${n2(NODE_BORDER_WIDTH)}">${nodeGroups.join("")}</g>` +
    (communityLabelParts.length > 0
      ? `<g id="community-labels">${communityLabelParts.join("")}</g>`
      : "") +
    (headerParts.length > 0 || footerParts.length > 0
      ? `<g id="caption">` +
        `<g id="caption-header" transform="translate(${n1(left)}, ${n1(
          top
        )})">${headerParts.join("")}</g>` +
        `<g id="caption-footer" transform="translate(${n1(left)}, ${n1(
          netTop + netHeight
        )})">${footerParts.join("")}</g>` +
        `</g>`
      : "") +
    `</svg>\n`
  );
}

/* -------------------------------------------------------------------------
 * Sheet furniture, shared by the three sidebar sheets
 * ---------------------------------------------------------------------- */

/**
 * The sidebar's own palette, so a sheet and the panel it was drawn from are
 * the same greys. These shadow the network export's slightly different set
 * rather than replacing it: that one is tuned for a picture on a wall.
 */
const SB_INK = "#1a1a1a";
const SB_BODY = "#5f6672";
const SB_MUTED = "#808893";
const SB_FAINT = "#a6adb7";
const SB_RULE = "#e4e7eb";

/** The delta badge's three states, as the sidebar paints them. */
const DELTA_UP = { fill: "#e4f2e8", ink: "#1a6b3c" };
const DELTA_DOWN = { fill: "#fbe8e6", ink: "#a32a1e" };
const DELTA_FLAT = { fill: "#efefef", ink: SB_MUTED };

/**
 * What a sheet says about itself, in one line.
 *
 * There is no display-size title. These are read as a set, next to the network
 * they came from and often on a panel that carries its own heading, and a
 * fifteen-point title on each of three sheets was three headings competing
 * with the one that mattered. The scope, the term and the sample still have to
 * be on the paper — a sheet of figures with no term on it is not evidence —
 * so they go in one small line above the rule.
 *
 * @returns {{parts: string[], y: number}}
 */
function sheetHeader(caption, M, inner, note = null) {
  const parts = [];
  let y = M + 6;
  // One muted line, at the size of a footnote: no heading of any weight. What
  // is on it is the minimum that keeps the sheet evidence rather than a
  // picture — which scope, which term, and how large the sample was.
  const line = [
    caption.title,
    caption.subtitle,
    ...(caption.lines || []).slice(0, 2),
    note,
  ]
    .filter(Boolean)
    .join("  ·  ");
  parts.push(svgText(M, y, line, { size: 6.5, fill: SB_MUTED }));
  y += 5;
  parts.push(svgRule(M, y, inner, SB_RULE, 1));
  return { parts, y: y + 14 };
}

/** A panel heading and its lede, at the sidebar's own two tiers. */
function sectionHead(title, lede, M, inner) {
  const parts = [svgText(M, 0, title, { size: 9, weight: 700, fill: SB_INK })];
  let y = 11;
  if (lede) {
    wrapText(lede, 96)
      .slice(0, 2)
      .forEach((line) => {
        parts.push(svgText(M, y, line, { size: 6.5, fill: SB_BODY }));
        y += 7;
      });
  }
  return { parts, height: y + 4 };
}

/* -------------------------------------------------------------------------
 * Gauges
 * ---------------------------------------------------------------------- */

/** RadialGauge's geometry, as ratios of the dial box it is drawn in. */
const GAUGE = {
  radius: 18 / 44,
  stroke: 4 / 44,
  // A touch under the panel's 12.5, because this draws in Helvetica rather
  // than the site's UI stack: at the same ratio "96.1%" is wider than the
  // ring's inner diameter and the digits sit on the arc.
  figure: 11.4 / 44,
  unit: 7 / 44,
  tickInset: 1.6 / 44,
};

/** Where a self-cohesion ring's empty end sits. Mirrors RADIAL_FLOOR. */
const GAUGE_FLOOR = 0.5;

/** A score as a fraction of the ring, clamped, or null. */
function gaugeSweep(value, floor) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, (value - floor) / (1 - floor)));
}

/**
 * One dial: ring, figure, label, baseline notch and delta badge.
 *
 * A redrawing of RadialGauge rather than a screenshot of one, down to the
 * cropped scale — the arc measures how far above a coin flip a bloc's internal
 * agreement sits, because drawn 0–100% every one of these figures is a
 * three-quarter arc and no two are tellable apart. The absolute number is
 * printed in the middle where it cannot be misread. See that component for the
 * argument in full.
 *
 * @param {Object} o
 * @param {number} o.cx - centre of the dial box
 * @param {number} o.top - top of the cell
 * @param {number} o.size - dial box, in sheet units
 * @param {number} o.value - the figure, on [0, 1]
 * @param {number|null} o.baseline - the same figure with one filter removed
 * @param {string} o.color - the entity's colour
 * @param {string} o.label - what the dial is
 * @param {string|null} o.sub - sample size
 * @param {number} [o.maxLabelLines] - wrap the label over up to this many
 *   lines instead of clipping it to one. Defaults to 1, which is what every
 *   sheet uses; the element export raises it for long policy-area names.
 * @returns {string}
 */
function svgGauge({
  cx,
  top,
  size,
  value,
  baseline = null,
  color = "#6B7C93",
  label,
  sub = null,
  floor = GAUGE_FLOOR,
  labelWidth,
  maxLabelLines = 1,
}) {
  const parts = [];
  const r = size * GAUGE.radius;
  const stroke = size * GAUGE.stroke;
  const cy = top + size / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = gaugeSweep(value, floor);
  // Under its own floor the arc has nowhere to go, so the track goes dotted:
  // an empty ring would read as a figure that is missing rather than low.
  const underFloor = Number.isFinite(value) && value < floor;

  parts.push(
    `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" fill="none" stroke="${
      underFloor ? "#c3c9d0" : SB_RULE
    }" stroke-width="${n2(stroke)}"${
      underFloor ? ` stroke-dasharray="1 3" stroke-linecap="round"` : ""
    }/>`
  );

  if (fraction !== null && fraction > 0) {
    parts.push(
      `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(
        r
      )}" fill="none" stroke="${color}" stroke-width="${n2(
        stroke
      )}" stroke-linecap="butt" stroke-dasharray="${n2(
        fraction * circumference
      )} ${n2(circumference)}" transform="rotate(-90 ${n1(cx)} ${n1(cy)})"/>`
    );
  }

  // The baseline notch, dropped at either extreme where it would sit under the
  // arc's own endpoint and read as part of it.
  const baseFraction = gaugeSweep(baseline, floor);
  if (baseFraction !== null && baseFraction > 0.01 && baseFraction < 0.99) {
    const radians = (baseFraction * 360 - 90) * (Math.PI / 180);
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const inset = size * GAUGE.tickInset;
    const inner = r - stroke / 2 - inset;
    const outer = r + stroke / 2 + inset;
    const coords = `x1="${n1(cx + cos * inner)}" y1="${n1(
      cy + sin * inner
    )}" x2="${n1(cx + cos * outer)}" y2="${n1(cy + sin * outer)}"`;
    // Pale line first, so the notch stays legible whether it lands on the
    // coloured arc or on the bare track.
    parts.push(
      `<line ${coords} stroke="#ffffff" stroke-width="${n2(
        size * 0.059
      )}" stroke-linecap="round"/>`
    );
    parts.push(
      `<line ${coords} stroke="#465060" stroke-opacity="0.5" stroke-width="${n2(
        size * 0.025
      )}" stroke-linecap="round"/>`
    );
  }

  // The figure, with the unit on its baseline rather than centred with it.
  const figureSize = size * GAUGE.figure;
  const unitSize = size * GAUGE.unit;
  const percent = Number.isFinite(value) ? (value * 100).toFixed(1) : "—";
  parts.push(
    `<text x="${n1(cx)}" y="${n1(
      cy + figureSize * 0.36
        )}" font-size="${n2(figureSize)}" font-weight="700" text-anchor="middle" ` +
      `letter-spacing="${n2(-figureSize * 0.032)}" ` +
      `fill="${underFloor ? SB_MUTED : SB_INK}" font-variant-numeric="tabular-nums">` +
      `${esc(percent)}<tspan font-size="${n2(
        unitSize
      )}" font-weight="500" fill="${SB_FAINT}">%</tspan></text>`
  );

  let y = top + size + size * 0.2;
  const labelSize = Math.max(5.4, size * 0.165);
  // One line by default, which is what a sheet has room for and what every
  // caller here wants. The element export asks for more: a policy-area name
  // clipped to "Environment, Clim…" is merely terse in a sidebar, and a defect
  // on a printed panel where there is no tooltip to recover the rest of it.
  const labelLines =
    maxLabelLines > 1
      ? wrapText(String(label ?? ""), Math.max(4, Math.floor(labelWidth / (labelSize * 0.52)))).slice(
          0,
          maxLabelLines
        )
      : [clipText(label, labelWidth, labelSize)];
  labelLines.forEach((line, index) => {
    parts.push(
      svgText(cx, y + index * (labelSize + 1.5), clipText(line, labelWidth, labelSize), {
        size: labelSize,
        anchor: "middle",
        fill: SB_INK,
      })
    );
  });
  y += (labelLines.length - 1) * (labelSize + 1.5) + labelSize + 2.5;

  const delta = getDelta(value, baseline);
  if (delta) {
    const tone =
      delta.direction > 0 ? DELTA_UP : delta.direction < 0 ? DELTA_DOWN : DELTA_FLAT;
    const badgeSize = Math.max(5, size * 0.145);
    const text = `${delta.text} pp`;
    const width = estimateWidth(text, badgeSize) + 5;
    parts.push(
      `<rect x="${n1(cx - width / 2)}" y="${n1(y - badgeSize)}" width="${n1(
        width
      )}" height="${n1(badgeSize + 3)}" rx="1.5" fill="${tone.fill}"/>`
    );
    parts.push(
      svgText(cx, y, text, {
        size: badgeSize,
        anchor: "middle",
        weight: 600,
        fill: tone.ink,
        monospaceDigits: true,
      })
    );
    y += badgeSize + 3.5;
  }

  if (sub) {
    const subSize = Math.max(4.8, size * 0.135);
    parts.push(
      svgText(cx, y, sub, { size: subSize, anchor: "middle", fill: SB_MUTED })
    );
    y += subSize + 1;
  }

  return { markup: parts.join(""), bottom: y };
}

/** Truncate to what fits, with an ellipsis where something was dropped. */
function clipText(text, width, size) {
  const value = String(text || "");
  if (!width || estimateWidth(value, size) <= width) return value;
  const max = Math.max(1, Math.floor(width / (size * 0.52)) - 1);
  return `${value.slice(0, max)}…`;
}

/**
 * A grid of dials, in the reading order the sidebar puts them in.
 *
 * Six to a row rather than the sidebar's four: the panel is a 380-pixel column
 * and this is a 420-unit page, and at four the twenty-seven delegations run
 * off the bottom of it.
 */
function gaugeGrid(entries, { x, y, width, columns, size, labelWidth }) {
  const parts = [];
  const colWidth = width / columns;
  let bottom = y;
  entries.forEach((entry, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cell = svgGauge({
      ...entry,
      cx: x + colWidth * (col + 0.5),
      top: y + row * entry.pitch,
      size,
      labelWidth,
    });
    parts.push(cell.markup);
    bottom = Math.max(bottom, cell.bottom);
  });
  return { markup: parts.join(""), bottom };
}

/** Head count per group and per country, from the nodes actually drawn. */
function countNodes(graphData, key) {
  const counts = new Map();
  for (const node of (graphData && graphData.nodes) || []) {
    const value = node[key];
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

/**
 * The Agreement tab as a sheet: the two dial grids it opens with.
 *
 * Dials rather than the bar rows this used to draw, because the panel draws
 * dials — a sheet that rearranges the figures into a different chart is a
 * second reading of them, and the whole point of an export is that it is the
 * same reading on paper.
 *
 * @param {Object} options - as exportNetworkSVG, plus:
 * @param {Object} options.stats - {intragroupCohesion, countrySimilarity,
 *   baseline}. The between-groups matrix is a separate sheet; see
 *   exportGroupMatrixSheetSVG.
 * @returns {string} a complete <svg> document
 */
export function exportStatsSheetSVG({ graphData, meta, stats } = {}) {
  const caption = buildCaption(meta || {});
  const {
    intragroupCohesion = [],
    countrySimilarity = [],
    baseline = null,
  } = stats || {};

  // A4 portrait at roughly 2 units per mm, so the sheet drops onto paper beside
  // the network without rescaling.
  const W = 420;
  const H = 594;
  const M = 30;
  const inner = W - M * 2;
  const term = meta && meta.mandate;

  const parts = [];
  const groupCounts = countNodes(graphData, "groupId");
  const countryCounts = countNodes(graphData, "country");

  // Same two exclusions the panels make. The non-attached are not a group, so
  // their internal agreement is not a property of anything.
  const groupEntries = [...intragroupCohesion]
    .filter((item) => item && item.group && item.group !== "NonAttached")
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((item) => {
      const count = groupCounts.get(item.group) || 0;
      return {
        value: item.score,
        baseline:
          baseline && baseline.comparing === "subject"
            ? baseline.scores?.intragroup?.[item.group] ?? null
            : null,
        color: groupColorFromNodes(graphData, item.group),
        label: getGroupAcronym(item.group, term),
        sub: `${count} MEP${count === 1 ? "" : "s"}`,
      };
    });

  // Countries have no colour of their own, so every dial takes one slate hue
  // and the arc alone carries the magnitude — as in CountrySimilarity.
  const countryEntries = [...countrySimilarity]
    .filter((item) => item && item.country)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((item) => {
      const count = countryCounts.get(item.country) || 0;
      return {
        value: item.score,
        // In a country view this figure rests on the same pairs as the
        // whole-Parliament one, so its delta is zero by construction and the
        // panel drops it. Removing the subject filter is a real comparison.
        baseline:
          baseline && baseline.comparing !== "country"
            ? baseline.scores?.country?.[item.country] ?? null
            : null,
        color: "#6B7C93",
        label: item.country,
        sub: `${count} MEP${count === 1 ? "" : "s"}`,
      };
    });

  const hasDelta =
    groupEntries.some((entry) => getDelta(entry.value, entry.baseline)) ||
    countryEntries.some((entry) => getDelta(entry.value, entry.baseline));

  // The baseline is named only where something on the sheet is measured
  // against it. Both panels drop their deltas at a country scope — inside one
  // country a group's members share a delegation as well as a group, so the
  // change would be a reading of the delegation — and a note promising a
  // comparison that no dial carries is worse than no note.
  const header = sheetHeader(
    caption,
    M,
    inner,
    hasDelta && baseline?.label ? `change against ${baseline.label}` : null
  );
  parts.unshift(...header.parts);
  let y = header.y;

  const columns = 6;
  const colWidth = inner / columns;
  const groupBlock = sectionHead(
    "Group Agreement",
    "Average voting agreement among members within each political group.",
    M,
    inner
  );
  const countryBlock = sectionHead(
    "Country Agreement",
    "Average voting agreement among MEPs from the same country.",
    M,
    inner
  );

  // The dial size falls out of the room left, rather than being a constant the
  // twenty-seven delegations then overflow.
  const rows =
    Math.ceil(groupEntries.length / columns) +
    Math.ceil(countryEntries.length / columns);
  const room =
    H - M - 30 - y - groupBlock.height - countryBlock.height - (rows ? 8 : 0);
  const pitch = Math.max(44, Math.min(76, rows ? room / rows : 60));
  const size = Math.max(24, Math.min(44, pitch - (hasDelta ? 28 : 19)));

  const drawBlock = (block, entries) => {
    if (entries.length === 0) return;
    parts.push(`<g transform="translate(0 ${n1(y)})">${block.parts.join("")}</g>`);
    y += block.height;
    const grid = gaugeGrid(
      entries.map((entry) => ({ ...entry, pitch })),
      { x: M, y, width: inner, columns, size, labelWidth: colWidth - 6 }
    );
    parts.push(grid.markup);
    y = y + (Math.ceil(entries.length / columns) - 1) * pitch;
    y = Math.max(grid.bottom, y) + 12;
  };

  drawBlock(groupBlock, groupEntries);
  drawBlock(countryBlock, countryEntries);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT_STACK}">`,
    svgRect(0, 0, W, H, PAPER),
    '<g id="stats-sheet">',
    parts.join(""),
    "</g>",
    "</svg>",
  ].join("");
}

/** Break a sentence at roughly `width` characters without splitting words. */
function wrapText(text, width) {
  const words = String(text || "").split(/\s+/);
  return words.reduce((lines, word) => {
    const last = lines[lines.length - 1];
    if (last && `${last} ${word}`.length <= width) {
      lines[lines.length - 1] = `${last} ${word}`;
      return lines;
    }
    lines.push(word);
    return lines;
  }, []);
}

/** A group's colour, taken from a node that belongs to it. */
function groupColorFromNodes(graphData, groupId) {
  const node = ((graphData && graphData.nodes) || []).find(
    (n) => n.groupId === groupId
  );
  return (node && node.color) || "#9aa3ad";
}

/**
 * Trigger a download of an SVG string.
 *
 * The one function here that is allowed to know a browser exists.
 */
export function downloadSVG(svgString, filename = "network.svg") {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("downloadSVG can only run in a browser");
  }
  const name = /\.svg$/i.test(filename) ? filename : `${filename}.svg`;
  const blob = new Blob([svgString], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoking synchronously cancels the download in Safari, which reads the
  // blob after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* -------------------------------------------------------------------------
 * History sheet
 * ---------------------------------------------------------------------- */

/**
 * The two series the History tab plots at chamber level, in the order it plots
 * them.
 *
 * Colour is not the separator here. These sheets are printed, sometimes in
 * greyscale, so each series carries a dash pattern and a marker shape as well
 * — exactly as TrendsPanel does on screen, and for the same reason.
 */
const TREND_SERIES = [
  {
    key: "withinGroup",
    label: "Within group",
    color: "#003399",
    dash: "",
    marker: "circle",
    value: (row) => row.withinGroup,
  },
  {
    key: "withinCountry",
    label: "Within country",
    color: "#4a4a4a",
    dash: "5 3",
    marker: "square",
    value: (row) => row.withinCountry,
  },
];

/**
 * The same chart's other reading: one line per political family.
 *
 * Coloured and nothing else, as on screen — seven dash patterns do not
 * separate, and a party is not a measure. The legend names every line, and it
 * wraps, because seven names do not fit the one row two did.
 */
const TREND_FAMILY_SERIES = FAMILY_ORDER.map((family) => ({
  key: family,
  label: FAMILIES[family].label,
  color: FAMILIES[family].color,
  dash: "",
  marker: "circle",
  value: (row) => (row.familyCohesion || {})[family],
}));

/** One series marker, centred on (x, y). Shapes, so greyscale still reads. */
function trendMarker(shape, x, y, color, size = 2.6) {
  if (shape === "square") {
    return svgRect(x - size, y - size, size * 2, size * 2, color);
  }
  if (shape === "triangle") {
    const points = [
      `${n1(x)},${n1(y - size * 1.1)}`,
      `${n1(x + size)},${n1(y + size * 0.8)}`,
      `${n1(x - size)},${n1(y + size * 0.8)}`,
    ].join(" ");
    return `<polygon points="${points}" fill="${color}"/>`;
  }
  return `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n2(size)}" fill="${color}"/>`;
}

/**
 * A polyline through the terms that have a value, drawn as separate runs so a
 * missing term is a gap rather than a straight line pretending to be evidence.
 */
function trendPath(points, color, dash, width = 1.4) {
  const runs = [];
  let run = [];
  points.forEach((point) => {
    if (point) {
      run.push(point);
      return;
    }
    if (run.length > 1) runs.push(run);
    run = [];
  });
  if (run.length > 1) runs.push(run);
  return runs
    .map(
      (segment) =>
        `<polyline points="${segment
          .map((p) => `${n1(p.x)},${n1(p.y)}`)
          .join(" ")}" fill="none" stroke="${color}" stroke-width="${n2(
          width
        )}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`
    )
    .join("");
}

/**
 * The History tab as a sheet: twenty years of agreement at the open scope,
 * with the whole Parliament behind it when the scope is narrower.
 *
 * Same paper, margins and type as exportStatsSheetSVG, so a network, its
 * figures and its history print as one set.
 *
 * @param {Object} options
 * @param {Object} options.meta - as buildCaption
 * @param {Array} options.series - rows from lib/trends.js loadTrendSeries
 * @param {Array|null} options.reference - the whole-Parliament series, drawn
 *   faintly behind when the open scope is a country or a policy area
 * @returns {string} a complete <svg> document
 */
export function exportTrendsSheetSVG({
  meta,
  series,
  reference = null,
  // Which reading of the first chart the sidebar has open. The sheet prints
  // what is on screen; a printed panel showing lines the reader never chose is
  // the one thing these sheets must not do.
  measure = "averages",
} = {}) {
  const rows = Array.isArray(series) ? series : [];
  if (rows.length === 0) {
    throw new Error("exportTrendsSheetSVG: no terms to draw");
  }
  const byFamily = measure === "families";
  const drawn = (byFamily ? TREND_FAMILY_SERIES : TREND_SERIES).filter((s) =>
    rows.some((row) => Number.isFinite(s.value(row)))
  );
  if (drawn.length === 0) {
    throw new Error("exportTrendsSheetSVG: no series carries a value at this scope");
  }

  const caption = buildCaption(meta || {});
  const W = 420;
  const H = 594;
  const M = 30;
  const inner = W - M * 2;

  const header = sheetHeader(caption, M, inner);
  const parts = [...header.parts];
  let y = header.y;

  const head = sectionHead(
    "Five terms compared",
    byFamily
      ? "Agreement inside each political family, at this scope since 2004."
      : "Agreement within groups and within countries, at this scope since 2004.",
    M,
    inner
  );
  parts.push(`<g transform="translate(0 ${n1(y)})">${head.parts.join("")}</g>`);
  y += head.height + 10;

  // Every value the sheet will draw — the open series and the Parliament
  // behind it — collected first: it is what decides whether there is anything
  // to draw at all, and where the by-family floor sits.
  const values = [];
  const collect = (source) =>
    (source || []).forEach((row) =>
      drawn.forEach((s) => {
        const value = row ? s.value(row) : undefined;
        if (Number.isFinite(value)) values.push(value);
      })
    );
  collect(rows);
  collect(reference);
  if (values.length === 0) {
    throw new Error("exportTrendsSheetSVG: the series carries no finite value");
  }
  // Fixed at 0-100, as the panel is. The sheet used to fit its axis to the
  // band the lines occupied, which reads better alone and is the wrong default
  // for a print of a screen: the same six-point move filled the plot at one
  // scope and vanished at the next, and a sheet could not be laid beside the
  // panel it came from. The by-family reading is the panel's one exception and
  // it is the exception here too — family cohesion lives between 85 and 96, so
  // it floors at 50, dropping further only if a scope genuinely goes under.
  const lo = byFamily ? Math.min(0.5, Math.floor(Math.min(...values) * 10) / 10) : 0;
  const hi = 1;
  const span = hi - lo || 1;
  // Quarters over a full axis, tenths over the short one: 50/63/75/88 are not
  // numbers anybody reads off a percentage scale.
  const tickStep = span > 0.6 ? 0.25 : 0.1;
  const axisTicks = [];
  for (let step = Math.ceil((lo - 1e-9) / tickStep); ; step += 1) {
    const value = step * tickStep;
    if (value > hi + 1e-9) break;
    axisTicks.push(Math.round(value * 100) / 100);
  }

  const plot = { left: M + 22, right: M + inner, top: y, height: 215 };
  const plotWidth = plot.right - plot.left;
  const xAt = (index) =>
    rows.length === 1
      ? plot.left + plotWidth / 2
      : plot.left + (plotWidth * index) / (rows.length - 1);
  const yAt = (value) => plot.top + plot.height - ((value - lo) / span) * plot.height;

  // Gridlines and the percentage axis.
  axisTicks.forEach((value) => {
    const gy = yAt(value);
    parts.push(svgRule(plot.left, gy, plotWidth, SB_RULE, 0.5));
    parts.push(
      svgText(plot.left - 5, gy + 2.5, Math.round(value * 100), {
        size: 6.5,
        anchor: "end",
        fill: SB_MUTED,
        monospaceDigits: true,
      })
    );
  });

  const drawSeries = (source, faint) =>
    drawn.forEach((s) => {
      const points = (source || []).map((row, index) => {
        const value = row ? s.value(row) : undefined;
        return Number.isFinite(value) ? { x: xAt(index), y: yAt(value) } : null;
      });
      const color = faint ? "#c4c4c4" : s.color;
      parts.push(trendPath(points, color, s.dash, faint ? 0.9 : 1.4));
      if (faint) return;
      points.forEach((point) => {
        if (point) parts.push(trendMarker(s.marker, point.x, point.y, color));
      });
    });

  // The Parliament first, so the scope on the sheet is drawn over it.
  if (reference && reference.length === rows.length) drawSeries(reference, true);
  drawSeries(rows, false);

  // Term ticks, with the thin ones marked where they sit rather than in a note
  // at the bottom that nobody reads next to the point it is about.
  const axisY = plot.top + plot.height + 10;
  rows.forEach((row, index) => {
    parts.push(
      svgText(xAt(index), axisY, row.short || `T${row.mandate}`, {
        size: 7,
        anchor: "middle",
        weight: 700,
      })
    );
    parts.push(
      svgText(xAt(index), axisY + 7, row.years || "", {
        size: 6,
        anchor: "middle",
        fill: SB_MUTED,
      })
    );
    if (row.missing) {
      parts.push(
        svgText(xAt(index), axisY + 14.5, "no data", {
          size: 5.5,
          anchor: "middle",
          fill: SB_MUTED,
          italic: true,
        })
      );
    } else if (row.thin) {
      parts.push(
        svgText(xAt(index), axisY + 14.5, `${fmtInt(row.sessions)} votes`, {
          size: 5.5,
          anchor: "middle",
          fill: SB_MUTED,
          italic: true,
        })
      );
    }
  });
  y = axisY + 24;

  // Legend, in the order the series were drawn, wrapping when a row is full:
  // two measures fit one line and seven family names do not, and a legend that
  // runs off the sheet names nothing.
  let legendX = plot.left;
  drawn.forEach((s) => {
    const itemWidth = 16 + estimateWidth(s.label, 7) + 14;
    if (legendX > plot.left && legendX + itemWidth > plot.right) {
      legendX = plot.left;
      y += 11;
    }
    parts.push(
      `<line x1="${n1(legendX)}" y1="${n1(y)}" x2="${n1(legendX + 12)}" y2="${n1(
        y
      )}" stroke="${s.color}" stroke-width="1.4"${
        s.dash ? ` stroke-dasharray="${s.dash}"` : ""
      }/>`
    );
    parts.push(trendMarker(s.marker, legendX + 6, y, s.color, 2.2));
    parts.push(svgText(legendX + 16, y + 2.5, s.label, { size: 7, fill: SB_BODY }));
    legendX += itemWidth;
  });
  if (reference && reference.length === rows.length) {
    y += 10;
    parts.push(
      svgText(plot.left, y + 2.5, "Faint lines behind: the whole Parliament.", {
        size: 6.5,
        fill: SB_MUTED,
        italic: true,
      })
    );
  }
  y += 22;

  // The second chart: the lowest agreement any two groups reach, term by term.
  const pairs = rows.map((row) => (row && row.lowestPair) || null);
  if (pairs.some((pair) => pair && Number.isFinite(pair.score))) {
    parts.push(svgText(M, y, "The two groups furthest apart", { size: 9, weight: 700, fill: SB_INK }));
    y += 4;
    parts.push(svgRule(M, y, inner, SB_RULE));
    y += 16;

    // The plot above's axis, not a version of it, exactly as on screen: where
    // the least-agreeing pair sits relative to never voting together is the
    // reading, and seeing 18 down here under 53 up there only works if both
    // are measured on the same scale.
    const sLo = 0;
    const sHi = 1;
    const sSpan = sHi - sLo || 1;
    // Two lines of pair names hang under this plot's axis, and the footer rule
    // is fixed: take the height from what is left rather than from a constant,
    // or a scope that adds a line above — the Parliament reference note — pushes
    // the names through the rule.
    const spark = { top: y, height: Math.max(60, Math.min(130, H - M - 20 - 32 - y)) };
    const sparkY = (value) =>
      spark.top + spark.height - ((value - sLo) / sSpan) * spark.height;

    // The same quarters as the plot above, for the same reason.
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
      const value = sLo + sSpan * t;
      const gy = sparkY(value);
      parts.push(svgRule(plot.left, gy, plotWidth, SB_RULE, 0.5));
      parts.push(
        svgText(plot.left - 5, gy + 2.5, Math.round(value * 100), {
          size: 6.5,
          anchor: "end",
          fill: SB_MUTED,
          monospaceDigits: true,
        })
      );
    });

    const sparkPoints = pairs.map((pair, index) =>
      pair && Number.isFinite(pair.score)
        ? { x: xAt(index), y: sparkY(pair.score) }
        : null
    );
    parts.push(trendPath(sparkPoints, INK, "", 1.2));
    sparkPoints.forEach((point, index) => {
      if (!point) return;
      parts.push(trendMarker("circle", point.x, point.y, INK, 2.4));
      // A figure at either end of the axis leans inward rather than over the
      // edge, as the panel's does: centred, the first one sat on top of the
      // axis numbers and the last one hung off the right margin. The last is
      // also dropped under its point — the line arrives there from above and
      // the label sat on it.
      const first = index === 0;
      const last = index === pairs.length - 1;
      parts.push(
        svgText(
          point.x + (last ? -4 : first ? 4 : 0),
          point.y + (last ? 9 : -6),
          fmtPct(pairs[index].score),
          {
            size: 6,
            anchor: last ? "end" : first ? "start" : "middle",
            fill: SB_BODY,
            monospaceDigits: true,
          }
        )
      );
    });

    // Which two groups they were. Rarely the same pair twice, which is the
    // reason the names are under the axis rather than in a single caption —
    // each under its own colour, as the panel draws them. The colour comes
    // from the group palette rather than from the nodes on screen: these are
    // pairs from five terms, and most of those groups are not in the open
    // network to be read off.
    const labelY = spark.top + spark.height + 6;
    const swatch = 5;
    const rowPitch = 12;
    pairs.forEach((pair, index) => {
      const ids = pair ? [pair.a, pair.b] : [];
      ids.slice(0, 2).forEach((group, line) => {
        const top = labelY + line * rowPitch;
        parts.push(
          `<rect x="${n1(xAt(index) - swatch / 2)}" y="${n1(
            top
          )}" width="${swatch}" height="${swatch}" rx="1.5" fill="${getGroupColor(
            group
          )}"${svgSwatchStroke(group, 0.7)}/>`
        );
        parts.push(
          svgText(
            xAt(index),
            top + swatch + 5,
            getGroupAcronym(group, meta && meta.mandate).slice(0, 11),
            { size: 5.5, anchor: "middle", fill: SB_MUTED }
          )
        );
      });
    });
    y = labelY + rowPitch * 2 + 8;
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT_STACK}">`,
    svgRect(0, 0, W, H, PAPER),
    '<g id="history-sheet">',
    parts.join(""),
    "</g>",
    "</svg>",
  ].join("");
}

/* -------------------------------------------------------------------------
 * Between-groups sheet
 * ---------------------------------------------------------------------- */

/**
 * The intergroup agreement matrix, alone on a sheet.
 *
 * It used to be squeezed into whatever the two tables on the figures sheet
 * left, which meant a cell of 26 units carrying six-point type, and on a full
 * Parliament it did not fit at all and was silently dropped. Given the page it
 * can carry the group names down the side in full and a legend for its own
 * colour scale, which is what makes it readable without the site open.
 *
 * @param {Object} options
 * @param {Object} options.graphData
 * @param {Object} options.meta - as buildCaption
 * @param {Object} options.intergroupCohesion - {groups, matrix}
 * @param {Object|null} options.baseline
 * @returns {string} a complete <svg> document
 */
export function exportGroupMatrixSheetSVG({
  graphData,
  meta,
  intergroupCohesion,
  baseline = null,
} = {}) {
  const allGroups = (intergroupCohesion && intergroupCohesion.groups) || [];
  const matrix = (intergroupCohesion && intergroupCohesion.matrix) || [];
  // Non-attached members never vote as a group, so the row is not a reading of
  // anything; the sidebar leaves it out of this grid for the same reason.
  const groups = allGroups.filter((group) => group !== "NonAttached");
  if (groups.length < 2) {
    throw new Error("exportGroupMatrixSheetSVG: fewer than two groups to compare");
  }

  const caption = buildCaption(meta || {});
  const W = 420;
  const H = 594;
  const M = 30;
  const inner = W - M * 2;
  const term = meta && meta.mandate;

  const header = sheetHeader(
    caption,
    M,
    inner,
    baseline && baseline.label ? `change against ${baseline.label}` : null
  );
  const parts = [...header.parts];
  let y = header.y;

  const head = sectionHead(
    "Inter-Group Voting Agreement",
    "Average voting agreement between members of different political groups.",
    M,
    inner
  );
  parts.push(`<g transform="translate(0 ${n1(y)})">${head.parts.join("")}</g>`);
  y += head.height + 12;

  // Acronyms down the side, each with the group's own colour beside it, as in
  // the panel. Full names would take a third of the page and push the cells
  // down to something no printer resolves.
  const labelSize = 7;
  const acronyms = groups.map((group) => getGroupAcronym(group, term));
  const swatch = 6;
  const labelWidth = Math.min(
    110,
    Math.max(...acronyms.map((name) => estimateWidth(name, labelSize))) + swatch + 10
  );
  const gridX = M + labelWidth;
  // Cells are twice as wide as they are tall, as on screen: the figure inside
  // one is two digits, so a square cell is mostly empty and the grid runs down
  // the page further than it needs to.
  const cellW = Math.min(
    Math.floor((inner - labelWidth) / groups.length),
    Math.floor(((H - M - 96 - y) / groups.length) * 2)
  );
  const cellH = cellW / 2;
  const indexOf = new Map(allGroups.map((group, index) => [group, index]));
  const colorOf = (group) => groupColorFromNodes(graphData, group);

  groups.forEach((group, col) => {
    const centre = gridX + cellW * col + (cellW - 1) / 2;
    parts.push(
      svgText(centre, y - 10, heatmapColumnLabel(group, term), {
        size: 5.8,
        anchor: "middle",
        fill: SB_BODY,
      })
    );
    parts.push(
      `<rect x="${n1(centre - swatch / 2)}" y="${n1(
        y - 7.5
      )}" width="${swatch}" height="${swatch}" rx="1.5" fill="${colorOf(
        group
      )}"${svgSwatchStroke(group, 0.7)}/>`
    );
  });

  groups.forEach((rowGroup, row) => {
    const rowIndex = indexOf.get(rowGroup);
    const top = y + cellH * row;
    const mid = top + cellH * 0.62;
    parts.push(
      `<rect x="${n1(gridX - 4 - swatch)}" y="${n1(
        mid - swatch + 1
      )}" width="${swatch}" height="${swatch}" rx="1.5" fill="${colorOf(
        rowGroup
      )}"${svgSwatchStroke(rowGroup, 0.7)}/>`
    );
    parts.push(
      svgText(gridX - 8 - swatch, mid, acronyms[row], {
        size: labelSize,
        anchor: "end",
        fill: SB_INK,
      })
    );

    groups.forEach((colGroup, col) => {
      // The panel draws the lower triangle only: the matrix is symmetric, and
      // the other half is the same eight readings a second time.
      if (row < col) return;
      const colIndex = indexOf.get(colGroup);
      const score = matrix[rowIndex] ? matrix[rowIndex][colIndex] : null;
      const x = gridX + cellW * col;
      if (!Number.isFinite(score) || score === 0) {
        parts.push(svgRect(x, top, cellW - 1, cellH - 1, "#f4f4f4"));
        return;
      }
      const rgb = getRedGreenColor(score);
      parts.push(svgRect(x, top, cellW - 1, cellH - 1, `rgb(${rgb.r},${rgb.g},${rgb.b})`));
      const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
      const ink = luminance > 0.5 ? "#000000" : "#ffffff";
      const delta = getDelta(
        score,
        // Same key as baselineForGroupPair in dataLoader.js: sorted, so one
        // pair has one entry however the grid is walked.
        baseline?.scores?.intergroup?.[[rowGroup, colGroup].sort().join("|")]
      );
      parts.push(
        svgText(x + (cellW - 1) / 2, top + cellH * (delta && cellH >= 18 ? 0.5 : 0.66), Math.round(score * 100), {
          size: Math.min(9, cellH * 0.5),
          anchor: "middle",
          fill: ink,
          monospaceDigits: true,
        })
      );
      if (delta && cellH >= 18) {
        parts.push(
          svgText(x + (cellW - 1) / 2, top + cellH * 0.85, delta.text, {
            size: Math.min(5.4, cellH * 0.3),
            anchor: "middle",
            fill: ink,
            opacity: 0.65,
            monospaceDigits: true,
          })
        );
      }
    });
  });
  y += cellH * groups.length + 20;

  // The colour ramp, so a printed cell can be read back to a number.
  parts.push(svgText(M, y, "Share of votes cast the same way", { size: 6.5, fill: SB_BODY }));
  y += 6;
  const rampWidth = Math.min(180, inner);
  const steps = 24;
  for (let i = 0; i < steps; i += 1) {
    const rgb = getRedGreenColor(i / (steps - 1));
    parts.push(
      svgRect(M + (rampWidth / steps) * i, y, rampWidth / steps + 0.4, 6, `rgb(${rgb.r},${rgb.g},${rgb.b})`)
    );
  }
  y += 13;
  parts.push(svgText(M, y, "0%", { size: 6, fill: SB_MUTED }));
  parts.push(svgText(M + rampWidth, y, "100%", { size: 6, anchor: "end", fill: SB_MUTED }));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT_STACK}">`,
    svgRect(0, 0, W, H, PAPER),
    '<g id="group-matrix-sheet">',
    parts.join(""),
    "</g>",
    "</svg>",
  ].join("");
}

/**
 * The acronym as the heatmap's own column headers write it.
 *
 * "Greens/EFA" is the one that does not fit a cell, and the panel shortens it
 * to "Greens" there and only there; kept in step by hand, as on screen.
 */
function heatmapColumnLabel(groupId, mandate) {
  const acronym = getGroupAcronym(groupId, mandate);
  return acronym === "Greens/EFA" ? "Greens" : acronym;
}

/* -------------------------------------------------------------------------
 * The Coalitions tab, as two sheets
 * ---------------------------------------------------------------------- */

/** "T10" for a mandate number, without importing the whole TERMS table. */
function termShort(mandate) {
  return mandate === null || mandate === undefined ? "this term" : `T${mandate}`;
}

/** Deterministic thousands separator, as the panels use. */
function thousandsSep(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? String(Math.round(number)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : "";
}

/** First letter up, for a possessive that opens a heading. */
function openingCap(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * Who a family wins with, and what wins, on one sheet.
 *
 * The panel's two blocks in their panel order: the ally bars, then the ranked
 * winning coalitions. Redrawings rather than screenshots, on the same paper and
 * margins as the other sidebar sheets.
 *
 * The ranking's seven squares survive the trip. They are what makes a row
 * readable as a shape rather than a list of names, and on paper — where there
 * is no tooltip to fall back on — they are the only thing naming the coalition
 * at all.
 *
 * @param {Object} options
 * @param {Object} options.meta - as buildCaption
 * @param {Object} options.data - the whole coalitions.json payload
 * @param {number|string} options.mandate
 * @param {string|null} options.subject - policy area, or null for the term
 * @param {string|null} options.pivot - the family the panel has selected, or
 *   null for the whole-chamber ranking
 * @returns {string} a complete <svg> document
 */
export function exportCoalitionsSheetSVG({
  meta,
  data,
  mandate,
  subject = null,
  pivot = null,
} = {}) {
  const view = viewFor(data, mandate, subject);
  if (!view) {
    throw new Error("exportCoalitionsSheetSVG: this scope decides no votes");
  }
  const seating = groupsIn(data, mandate);
  const rows = coalitionsFor(view, pivot);
  const allies = pivot ? allyReadings(view, data, mandate, pivot) : null;
  if (rows.length === 0 && !allies) {
    throw new Error("exportCoalitionsSheetSVG: nothing to draw");
  }

  const caption = coalitionCaption(meta, view);
  const W = 420;
  const H = 594;
  const M = 30;
  const inner = W - M * 2;
  const group = pivot ? groupInfo(pivot, mandate) : null;

  const header = sheetHeader(
    caption,
    M,
    inner,
    view.thin ? `${view.decided} decided votes — too few to read as a pattern` : null
  );
  const parts = [...header.parts];
  let y = header.y;

  if (allies) {
    const head = sectionHead(
      `Who stands with ${group.sentence}`,
      allyReadingsLede(group),
      M,
      inner
    );
    parts.push(`<g transform="translate(0 ${n1(y)})">${head.parts.join("")}</g>`);
    y += head.height + 8;

    const block = allyColumns(allies, mandate, M, inner);
    parts.push(`<g transform="translate(0 ${n1(y)})">${block.parts.join("")}</g>`);
    y += block.height + 12;
  }

  if (rows.length > 0) {
    const head = sectionHead(
      `What coalitions win in ${termShort(mandate)}`,
      `The political groups on the winning side, on the ${thousandsSep(
        view.decided
      )} decided votes ${subject ? `in ${subject}` : "of this term"}.` +
        (group ? ` Only the coalitions that include ${group.sentence}.` : ""),
      M,
      inner
    );
    parts.push(`<g transform="translate(0 ${n1(y)})">${head.parts.join("")}</g>`);
    y += head.height + 8;

    const square = 6;
    const gap = 2;
    // One square per group in this term, so the row is seven wide in most terms
    // and eight in the two the far right sat as two groups in. Sized from the
    // term rather than from a constant, or T8 and T10 would overrun the bar.
    const marksWidth = seating.length * (square + gap);
    const valueWidth = 30;
    const barX = M + marksWidth + 8;
    const barWidth = inner - marksWidth - 8 - valueWidth;
    const widest = Math.max(...rows.map((row) => row.share), 0.01);
    // As many rows as the page has left, and a line saying what was cut. A
    // silently shortened ranking is the one failure this sheet must not have.
    const rowH = 12;
    const available = Math.max(0, H - M - 30 - y);
    const shown = Math.min(rows.length, Math.max(1, Math.floor(available / rowH)));

    rows.slice(0, shown).forEach((row) => {
      const mid = y + rowH / 2;
      seating.forEach((id, index) => {
        const x = M + index * (square + gap);
        const inside = row.groups.includes(id);
        parts.push(
          inside
            ? svgRect(
                x,
                mid - square / 2,
                square,
                square,
                groupInfo(id, mandate).color,
                'rx="1.2"'
              )
            : `<rect x="${n1(x)}" y="${n1(
                mid - square / 2
              )}" width="${square}" height="${square}" rx="1.2" fill="none" stroke="${SB_RULE}" stroke-width="0.7"/>`
        );
      });
      parts.push(svgRect(barX, mid - 2.5, barWidth, 5, "#f0f2f4", 'rx="1"'));
      parts.push(
        svgRect(
          barX,
          mid - 2.5,
          Math.max(0.6, barWidth * (row.share / widest)),
          5,
          SB_BODY,
          'rx="1"'
        )
      );
      parts.push(
        svgText(M + inner, mid + 2, `${(row.share * 100).toFixed(1)}%`, {
          size: 6.5,
          anchor: "end",
          weight: 700,
          monospaceDigits: true,
        })
      );
      y += rowH;
    });

    y += 9;
    const cut = rows.length - shown;
    wrapText(
      `Squares, seated left to right: ${seating
        .map((id) => groupInfo(id, mandate).short)
        .join(", ")}. A filled square is in the winning coalition.` +
        renameNote(data, mandate, seating) +
        (cut > 0
          ? ` ${cut} smaller coalition${cut === 1 ? "" : "s"} did not fit this page.`
          : ""),
      104
    )
      .slice(0, 3)
      .forEach((line) => {
        parts.push(svgText(M, y, line, { size: 6, fill: SB_MUTED }));
        y += 7;
      });
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT_STACK}">`,
    svgRect(0, 0, W, H, PAPER),
    '<g id="coalitions-sheet">',
    parts.join(""),
    "</g>",
    "</svg>",
  ].join("");
}

/**
 * The coalition sheets' own caption line.
 *
 * buildCaption counts MEPs and voting sessions, which is the *network's*
 * sample. These sheets classify roll-calls, and their sample is the decided
 * votes — a coalition sheet headed "705 MEPs" is answering a question it was
 * not asked.
 *
 * It also drops the country, and says so. There is no country version of this
 * figure: a group's direction on a vote is its members everywhere, so the
 * classification is always the whole Parliament's. The panel says that on
 * screen; a sheet headed "Portugal" would quietly deny it, and the sheet is
 * the half that leaves the building.
 */
function coalitionCaption(meta, view) {
  const base = buildCaption({ ...(meta || {}), country: null });
  const country = meta && meta.country;
  return {
    title: base.title,
    subtitle: base.subtitle,
    lines: [
      `${thousandsSep(view.decided)} decided roll-calls`,
      country ? `whole Parliament — no ${country} version of this figure` : null,
    ].filter(Boolean),
  };
}

/** "PfE and ESN", "ALDE, PPE and UEN" — a list a sentence can end on. */
function andList(items) {
  const list = (items || []).filter(Boolean);
  if (list.length < 2) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** One group's row in one reading, or null when that reading has none. */
function allyRow(shares, group) {
  return shares ? shares.rows.find((row) => row.group === group) || null : null;
}

/**
 * The renames folded inside one term, as a sentence to append to a legend.
 *
 * Term 7's PSE and S&D are one group under one name; a reader who knows the
 * term will look for the name that is not there, so the sheet says where it
 * went. Empty for the three terms with no mid-term rename.
 */
function renameNote(data, mandate, seating) {
  const folded = seating
    .map((id) => ({ id, spellings: renamesFor(data, mandate, id) }))
    .filter((entry) => entry.spellings.length > 1)
    .map(
      (entry) =>
        `${andList(entry.spellings)} are one group renamed mid-term, counted as ` +
        `${groupInfo(entry.id, mandate).short}`
    );
  return folded.length > 0 ? ` ${folded.join("; ")}.` : "";
}

/**
 * Both readings of one family's allies, on one shared row order.
 *
 * On screen these are a toggle: one chart, two states, and the reader flips
 * between them. Paper has nothing to flip, so both are drawn — which is the
 * better reading anyway, because the *difference* between them is the whole
 * reason the block exists. A family that wins only in someone else's company
 * scores high on the left and low on the right, and that is one glance rather
 * than two prints laid side by side.
 *
 * The rows are ranked by "when it wins" and the second column keeps that
 * order, so a family sits on the same line in both and the gap reads straight
 * across. The panel ranks each mode on its own, which it can afford with only
 * one of them on screen; two independently sorted columns would turn the
 * comparison into a name hunt.
 *
 * Either reading can be empty on its own — a family that carried nothing in a
 * policy area has no "when it wins" — so the order falls back to whichever
 * exists and the missing cells are drawn as dashes rather than as zeroes,
 * which would read as "stood with nobody" instead of "won nothing".
 */
function allyReadings(view, data, mandate, pivot) {
  const won = allyShares(view, data, mandate, pivot, "wonTogether");
  const same = allyShares(view, data, mandate, pivot, "sameSide");
  if (!won && !same) return null;
  return {
    won,
    same,
    order: (won || same).rows.map((row) => row.group),
    columns: [
      {
        label: "When it wins",
        note: won
          ? `of the ${thousandsSep(won.wins)} votes it won`
          : "it won no vote in this view",
        shares: won,
      },
      {
        label: "Every vote",
        note: same
          ? `of all ${thousandsSep(same.votes)} decided votes`
          : "it sat in no decided vote here",
        shares: same,
      },
    ],
  };
}

/** What the two columns are, in the panel's own words. */
function allyReadingsLede(group) {
  return (
    `Two readings of the same roll-calls. Left: of the votes ${group.sentence} won, ` +
    `who else won too. Right: of every decided vote, who took the same side, win or lose.`
  );
}

/**
 * The two readings as two columns of bars.
 *
 * Both tracks are the full 100%, as on screen, so a bar here can be compared
 * with a bar on another family's sheet — a track scaled to the largest share
 * would make seven sheets seven different rulers.
 *
 * @param {Object} readings - from allyReadings
 * @param {number} M - page margin
 * @param {number} inner - drawable width
 * @param {Object} [options] - geometry; the defaults are the compact form that
 *   shares a page with the ranking, `counts` the roomier one that does not
 * @returns {{parts: string[], height: number}} drawn from y = 0
 */
function allyColumns(readings, mandate, M, inner, options = {}) {
  const {
    rowH = 13,
    size = 6.5,
    nameWidth = 42,
    valueWidth = 26,
    barH = 8,
    gutter = 16,
    counts = false,
  } = options;
  const parts = [];
  const colWidth = (inner - gutter) / 2;
  const headH = size * 2.4 + 5;

  readings.columns.forEach((column, index) => {
    const x = M + index * (colWidth + gutter);
    const trackX = x + nameWidth;
    const trackWidth = colWidth - nameWidth - valueWidth;

    parts.push(svgText(x, size, column.label, { size, weight: 700, fill: SB_INK }));
    parts.push(
      svgText(x, size * 2.15, column.note, { size: size - 0.5, fill: SB_MUTED })
    );

    readings.order.forEach((id, rowIndex) => {
      const row = allyRow(column.shares, id);
      const other = groupInfo(id, mandate);
      const top = headH + rowIndex * rowH;
      // With a count line under it the bar sits high in the row; without one it
      // sits on the row's centre.
      const mid = counts ? top + rowH * 0.36 : top + rowH / 2;
      parts.push(
        svgText(x, mid + size * 0.35, other.short, { size, fill: SB_BODY })
      );
      parts.push(
        svgRect(trackX, mid - barH / 2, trackWidth, barH, "#f0f2f4", 'rx="1"')
      );
      if (row) {
        parts.push(
          svgRect(
            trackX,
            mid - barH / 2,
            Math.max(0.6, trackWidth * row.share),
            barH,
            other.color,
            'rx="1"'
          )
        );
      }
      parts.push(
        svgText(
          x + colWidth,
          mid + size * 0.35,
          row ? `${Math.round(row.share * 100)}%` : "—",
          {
            size,
            anchor: "end",
            weight: 700,
            monospaceDigits: true,
            fill: row ? INK : SB_FAINT,
          }
        )
      );
      if (counts) {
        // The tooltip's own line, which paper has no way to summon: the share
        // is a fraction of a stated denominator, not a score out of nothing.
        parts.push(
          svgText(
            trackX,
            top + rowH * 0.82,
            row
              ? `${thousandsSep(row.count)} of ${thousandsSep(row.denominator)}`
              : "no votes to count",
            { size: size - 2.6, fill: SB_MUTED, monospaceDigits: true }
          )
        );
      }
    });
  });

  return { parts, height: headH + readings.order.length * rowH };
}

/**
 * The one sentence to take off a family's sheet.
 *
 * The columns are drawn so the gap between them can be seen, but a sheet on a
 * wall is read at a distance where 94 and 38 are two bars rather than two
 * numbers. This names the widest gap in words and stops there: which family,
 * both shares, and no reading of what it means.
 *
 * Written in the simple past throughout, and never with `to be`. Every group
 * name here is a template hole, and "the EPP is" and "the Greens are" have no
 * present-tense form in common — the same reason coalitions.js keeps a
 * `sentence` field and tells its callers to avoid a present-tense verb. Past
 * tense is invariant, and these are finished terms.
 */
function widestGapSentence(readings, group, mandate) {
  if (!readings.won || !readings.same) return null;
  let widest = null;
  readings.order.forEach((id) => {
    const won = allyRow(readings.won, id);
    const same = allyRow(readings.same, id);
    if (!won || !same) return;
    const gap = won.share - same.share;
    if (!widest || Math.abs(gap) > Math.abs(widest.gap)) {
      widest = { id, gap, won: won.share, same: same.share };
    }
  });
  if (!widest) return null;

  const other = groupInfo(widest.id, mandate);
  const wonPct = `${Math.round(widest.won * 100)}%`;
  const samePct = `${Math.round(widest.same * 100)}%`;
  const points = Math.round(Math.abs(widest.gap) * 100);

  // Under eight points the two columns are the same chart twice, and calling
  // the largest of them "the widest gap" would dress a rounding difference up
  // as a finding. That a group won with the groups it voted with is itself the
  // thing worth printing.
  if (points < 8) {
    // "no group sits more than 0 points apart" is what rounding produces on a
    // twelve-vote policy area, and it reads as a broken template rather than as
    // a finding.
    const apart =
      points === 0
        ? "no group sits as much as a point apart"
        : `no group sits more than ${points} point${points === 1 ? "" : "s"} apart`;
    return (
      `The two readings agree here: ${apart} between them, so ${group.sentence} ` +
      `won with the groups it voted with.`
    );
  }
  return widest.gap > 0
    ? `Widest gap: ${other.sentence} shared the winning side on ${wonPct} of the votes ` +
        `${group.sentence} won, but took the same side on only ${samePct} of all decided votes.`
    : `Widest gap: ${other.sentence} took the same side as ${group.sentence} on ${samePct} ` +
        `of all decided votes, but shared the winning side on only ${wonPct} of the votes it won.`;
}

/**
 * One group, both readings, one sheet.
 *
 * The panel answers "who stands with this group" for whichever group is
 * selected, in whichever reading the toggle is on — one eighth of one half of
 * the figure. Neither the chips nor the toggle survive a print, so the export
 * draws the sheet once per group in the term instead, and the caller asks for
 * all of them.
 *
 * Roomier than the same block on the coalitions sheet, which shares its page
 * with the ranking: bars at reading distance, and each one carrying the count
 * and denominator the screen keeps in a tooltip.
 *
 * @param {Object} options
 * @param {Object} options.meta - as buildCaption
 * @param {Object} options.data - the whole coalitions.json payload
 * @param {number|string} options.mandate
 * @param {string|null} options.subject - policy area, or null for the term
 * @param {string} options.pivot - the group this sheet is about
 * @returns {string} a complete <svg> document
 */
export function exportGroupAlliesSheetSVG({
  meta,
  data,
  mandate,
  subject = null,
  pivot,
} = {}) {
  if (!groupsIn(data, mandate).includes(pivot)) {
    throw new Error(`exportGroupAlliesSheetSVG: no group "${pivot}" in T${mandate}`);
  }
  const group = groupInfo(pivot, mandate);
  const view = viewFor(data, mandate, subject);
  if (!view) {
    throw new Error("exportGroupAlliesSheetSVG: this scope decides no votes");
  }
  const readings = allyReadings(view, data, mandate, pivot);
  if (!readings) {
    throw new Error(`exportGroupAlliesSheetSVG: ${group.label} did not sit here`);
  }

  const caption = coalitionCaption(meta, view);
  const W = 420;
  const H = 594;
  const M = 30;
  const inner = W - M * 2;

  const header = sheetHeader(
    caption,
    M,
    inner,
    view.thin ? `${view.decided} decided votes — too few to read as a pattern` : null
  );
  const parts = [...header.parts];
  let y = header.y;

  const head = sectionHead(
    `Who stands with ${group.sentence}`,
    allyReadingsLede(group),
    M,
    inner
  );
  parts.push(`<g transform="translate(0 ${n1(y)})">${head.parts.join("")}</g>`);
  y += head.height + 10;

  const block = allyColumns(readings, mandate, M, inner, {
    rowH: 40,
    size: 10,
    nameWidth: 54,
    valueWidth: 32,
    barH: 14,
    gutter: 14,
    counts: true,
  });
  parts.push(`<g transform="translate(0 ${n1(y)})">${block.parts.join("")}</g>`);
  y += block.height + 20;

  parts.push(svgRule(M, y, inner, SB_RULE, 1));
  y += 14;

  const finding = widestGapSentence(readings, group, mandate);
  if (finding) {
    wrapText(finding, 84)
      .slice(0, 4)
      .forEach((line) => {
        parts.push(svgText(M, y, line, { size: 7.5, fill: SB_BODY }));
        y += 10;
      });
    y += 8;
  }

  // What the reader has to be told rather than shown: why the right column is
  // not in its own order, whether this name is a fold of two spellings, and
  // whether the group sat for the whole term. The last is not a footnote — a
  // group constituted mid-term has a smaller denominator than the term's own
  // vote count, and the sheet is the half that leaves the building.
  const spellings = renamesFor(data, mandate, pivot);
  // The sitting windows live on the whole-term view; a policy-area sheet is a
  // slice of the same roll-calls and reads the same dates.
  const wholeTerm = viewFor(data, mandate, null);
  const seated = sittingOf(wholeTerm, pivot);
  const opened =
    seated && wholeTerm && wholeTerm.sitting
      ? Object.values(wholeTerm.sitting).reduce(
          (earliest, span) => (span.from < earliest ? span.from : earliest),
          seated.from
        )
      : null;
  const lateSeat = Boolean(seated && opened && seated.from > opened);
  [
    "Rows keep the left column's order, so a group is on the same line in both.",
    `A group's position on a vote is the majority of its own members present.` +
      (spellings.length > 1
        ? ` The dump spells this group ${andList(spellings)} in ${termShort(
            mandate
          )}; it is one group renamed mid-term.`
        : ""),
    lateSeat
      ? `${group.label} was constituted during ${termShort(mandate)} — first ` +
        `recorded vote ${seated.from.slice(0, 10)} — so each share is over the ` +
        `roll-calls it was present for, not the whole term.`
      : null,
  ]
    .filter(Boolean)
    .forEach((note) => {
    wrapText(note, 96)
      .slice(0, 2)
      .forEach((line) => {
        parts.push(svgText(M, y, line, { size: 6, fill: SB_MUTED }));
        y += 7;
      });
    y += 3;
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT_STACK}">`,
    svgRect(0, 0, W, H, PAPER),
    '<g id="group-allies-sheet">',
    parts.join(""),
    "</g>",
    "</svg>",
  ].join("");
}

/**
 * One family's agreement with each of the other six, across the terms.
 *
 * The Lines form of the partners panel, which is the one of its three that
 * carries a trajectory — the arrows drop the middle terms, and the house
 * profile is read against a seating order that says little without the screen's
 * axis under it.
 *
 * Drawn on a fixed 0–100 axis, as the panel is, so a sheet for one family can
 * be laid beside a sheet for another.
 *
 * @param {Object} options
 * @param {Object} options.meta - as buildCaption
 * @param {Array} options.series - rows from loadTrendSeries
 * @param {string} options.pivot - family id
 * @returns {string} a complete <svg> document
 */
export function exportPartnersSheetSVG({ meta, series, pivot = "EPP" } = {}) {
  const rows = (Array.isArray(series) ? series : []).filter(
    (row) => row && !row.missing
  );
  if (rows.length < 2) {
    throw new Error("exportPartnersSheetSVG: fewer than two terms to compare");
  }
  const family = FAMILIES[pivot];
  const partners = FAMILY_ORDER.filter((id) => id !== pivot).map((id) => ({
    id,
    ...FAMILIES[id],
    values: rows.map((row) => {
      const score = row.familyPairs ? row.familyPairs[pairKey(pivot, id)] : undefined;
      return Number.isFinite(score) ? score : null;
    }),
  }));
  if (!partners.some((partner) => partner.values.some((value) => value !== null))) {
    throw new Error("exportPartnersSheetSVG: no pair carries a figure at this scope");
  }

  const caption = buildCaption(meta || {});
  const W = 420;
  const H = 594;
  const M = 30;
  const inner = W - M * 2;

  const header = sheetHeader(caption, M, inner);
  const parts = [...header.parts];
  let y = header.y;

  const head = sectionHead(
    `${openingCap(family.possessive)} partners`,
    `Agreement between ${family.sentence} and each of the other families, term by term. ` +
      `Groups are merged across renames.`,
    M,
    inner
  );
  parts.push(`<g transform="translate(0 ${n1(y)})">${head.parts.join("")}</g>`);
  y += head.height + 10;

  const plot = { left: M + 20, right: M + inner, top: y, height: 230 };
  const plotWidth = plot.right - plot.left;
  const xAt = (index) =>
    rows.length === 1
      ? plot.left + plotWidth / 2
      : plot.left + (plotWidth * index) / (rows.length - 1);
  // Fixed 0–100, matching the panel: a fitted axis would make a sheet for one
  // family incomparable with a sheet for another, which is the whole use of
  // printing more than one.
  const yAt = (value) => plot.top + plot.height * (1 - value);

  [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
    const gy = yAt(t);
    parts.push(svgRule(plot.left, gy, plotWidth, SB_RULE, 0.5));
    parts.push(
      svgText(plot.left - 5, gy + 2.5, Math.round(t * 100), {
        size: 6.5,
        anchor: "end",
        fill: SB_MUTED,
        monospaceDigits: true,
      })
    );
  });

  partners.forEach((partner) => {
    const points = partner.values.map((value, index) =>
      value === null ? null : { x: xAt(index), y: yAt(value) }
    );
    parts.push(trendPath(points, partner.color, "", 1.6));
    points.forEach((point) => {
      if (!point) return;
      parts.push(
        `<circle cx="${n1(point.x)}" cy="${n1(point.y)}" r="2" fill="${partner.color}"/>`
      );
    });
  });

  const axisY = plot.top + plot.height + 11;
  rows.forEach((row, index) => {
    parts.push(
      svgText(xAt(index), axisY, row.short || `T${row.mandate}`, {
        size: 7,
        anchor: "middle",
        weight: 700,
      })
    );
    parts.push(
      svgText(xAt(index), axisY + 7, row.years || "", {
        size: 6,
        anchor: "middle",
        fill: SB_MUTED,
      })
    );
  });
  y = axisY + 24;

  // A swatch legend carrying each family's last drawn figure, so the sheet can
  // be read without tracing a line end back to the axis.
  const columns = 2;
  const columnWidth = inner / columns;
  partners.forEach((partner, index) => {
    const column = index % columns;
    const line = Math.floor(index / columns);
    const x = M + column * columnWidth;
    const rowY = y + line * 11;
    parts.push(svgRect(x, rowY - 4.5, 6, 6, partner.color, 'rx="1.2"'));
    const last = [...partner.values].reverse().find((value) => value !== null);
    parts.push(svgText(x + 10, rowY, partner.label, { size: 6.5, fill: SB_BODY }));
    parts.push(
      svgText(
        x + columnWidth - 14,
        rowY,
        last === undefined || last === null ? "—" : `${(last * 100).toFixed(1)}%`,
        { size: 6.5, anchor: "end", weight: 700, monospaceDigits: true }
      )
    );
  });
  y += Math.ceil(partners.length / columns) * 11 + 8;

  const thin = rows.filter((row) => row.thin);
  if (thin.length > 0) {
    parts.push(
      svgText(
        M,
        y,
        `${thin
          .map((row) => `${row.short} (${row.sessions} votes)`)
          .join(", ")} rest on too few votes to carry a trend.`,
        { size: 6, fill: SB_MUTED }
      )
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT_STACK}">`,
    svgRect(0, 0, W, H, PAPER),
    '<g id="partners-sheet">',
    parts.join(""),
    "</g>",
    "</svg>",
  ].join("");
}

/* -------------------------------------------------------------------------
 * Borrowed by the element export
 * ---------------------------------------------------------------------- */

/**
 * The print primitives, re-exported for lib/elementExport.js.
 *
 * That module cuts the same marks loose from the sheet so they can be placed
 * one at a time in Figma. It has to draw a dial that is the *same* dial — same
 * cropped scale, same notch, same badge greys — or a poster and the sheet it
 * was lifted from would disagree about a number, so it borrows the builders
 * here rather than keeping a second copy of them in step by hand.
 *
 * Re-exported, not moved: everything above still calls these as locals, and
 * NetworkCanvas's contract with this file is unchanged.
 */
export {
  svgGauge,
  gaugeSweep,
  GAUGE,
  GAUGE_FLOOR,
  trendMarker,
  trendPath,
  TREND_SERIES,
  svgText,
  svgRect,
  svgRule,
  clipText,
  estimateWidth,
  wrapText,
  esc,
  xmlId,
  n1,
  n2,
  fmtPct,
  fmtInt,
  FONT_STACK,
  PAPER,
  INK,
  SB_INK,
  SB_BODY,
  SB_MUTED,
  SB_FAINT,
  SB_RULE,
  DELTA_UP,
  DELTA_DOWN,
  DELTA_FLAT,
};
