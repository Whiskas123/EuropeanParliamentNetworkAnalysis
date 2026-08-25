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
  UNKNOWN_COLOR,
} from "./edgeStyle.js";
import { listParties } from "./parties.js";
import {
  buildCommunityShapes,
  communityLabel,
  stackLabels,
} from "./communityShapes.js";
import {
  getGroupDisplayName,
  getGroupAcronym,
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
function tryCommunityShapes(graphData) {
  try {
    return buildCommunityShapes(graphData);
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
      )}" r="${n2(plan.swatch / 2)}" fill="${esc(entry.color)}"/>`
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
 * @param {Object} options.renderSettings - {edgePercentile, edgeWidth, colorMode, dim}
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
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  nodes.forEach((node) => {
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

  const pad = du(40) + radius;
  let left = minX - pad;
  let width = spanX + pad * 2;
  const netTop = minY - pad;
  const netHeight = spanY + pad * 2;

  // A portrait layout can be narrower than its own caption wants to be.
  const minWidth = du(1080);
  if (width < minWidth) {
    left -= (minWidth - width) / 2;
    width = minWidth;
  }
  const margin = du(40);
  const contentWidth = width - margin * 2;

  // --- caption ------------------------------------------------------------
  const caption = buildCaption({
    mandate: info.mandate,
    country: info.country,
    subject: info.subject,
    nodeCount: info.nodeCount ?? nodes.length,
    votingSessions: info.votingSessions,
  });
  const legend = buildLegend(graphData, view.colorMode, info.mandate);

  const titleSize = du(38);
  const subtitleSize = du(19);
  const lineSize = du(15);
  const caveatSize = du(13);

  const headerParts = [];
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
  const headerHeight = hy + du(16) + du(26);

  const legendPlan = planLegend(legend, contentWidth, du);
  if (legendPlan.gradient) {
    legendPlan.columnWidth = Math.min(contentWidth, du(420));
    legendPlan.stripWidth = legendPlan.columnWidth;
  }

  const footerParts = [];
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
  const footerHeight = fy + du(34);

  const top = netTop - headerHeight;
  const height = headerHeight + netHeight + footerHeight;

  // --- edges --------------------------------------------------------------
  const lookup = makeNodeLookup(graphData, nodes);
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
  nodes.forEach((node) => {
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
        const fill = colorFn(node) || UNKNOWN_COLOR;
        const alpha = nodeOpacity(emphasised.has(node.id), Boolean(dim));
        const attrs =
          `cx="${c(node.x)}" cy="${c(node.y)}" r="${n2(radius)}" ` +
          `fill="${esc(fill)}"` +
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

  // --- communities --------------------------------------------------------
  // Only when the screen is showing them, and drawn to the same multiples of
  // the node radius, so the print is the picture the reader was looking at.
  // Each community is its own <g> with its name on it: these files are opened
  // in a vector editor to be annotated by hand, and a layer called "PPE" is
  // the difference between that being possible and not.
  let communityParts = [];
  let communityLabelParts = [];
  let communityNote = "no community outlines";
  if (view.communities) {
    const communities = tryCommunityShapes(graphData);
    if (communities && communities.shapes.length > 0) {
      // In design units, like the caption: the outline and its name are the
      // same fraction of the picture whether the layout spans 400 units or
      // 12,000, which is also what the canvas does with them on screen.
      const outlineWidth = Math.max(radius * 0.3, du(1.1));
      const dashOn = outlineWidth * 5;
      const dashOff = outlineWidth * 3.6;
      const titleSize = Math.max(radius * 2.2, du(13));
      const countSize = titleSize * 0.68;
      communityParts = communities.shapes.map((shape) => {
        const d = shape.rings
          .map(
            (ring) =>
              `M${ring
                .map((point) => `${c(point[0])} ${c(point[1])}`)
                .join("L")}Z`
          )
          .join("");
        const name = communityLabel(shape, info.mandate);
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
      // Same stacking rule as the canvas, on an estimate of the text width
      // rather than a measurement of it — half a character of slack in a
      // collision test that only ever moves a label upwards.
      const blockHeight = titleSize + countSize * 1.15;
      const labelBaselines = stackLabels(
        communities.shapes.map((shape) => ({
          x: shape.anchor.x,
          y: shape.anchor.y - titleSize * 0.75,
          width: Math.max(
            estimateWidth(communityLabel(shape, info.mandate), titleSize),
            estimateWidth(`${shape.size} MEPs`, countSize)
          ),
          height: blockHeight,
        })),
        titleSize * 0.4
      );
      communityLabelParts = communities.shapes.flatMap((shape, index) => {
        const countY = labelBaselines[index];
        const titleY = countY - countSize * 1.15;
        return [
          svgText(shape.anchor.x, titleY, communityLabel(shape, info.mandate), {
            size: titleSize,
            weight: 600,
            fill: shape.color,
            anchor: "middle",
          }),
          svgText(shape.anchor.x, countY, `${shape.size} MEPs`, {
            size: countSize,
            weight: 500,
            fill: SECONDARY,
            anchor: "middle",
          }),
        ];
      });
      communityNote =
        `${communities.count} communities detected, ` +
        `${communities.shapes.length} outlined`;
    } else {
      communityNote = "community outlines requested, none could be drawn";
    }
  }

  // --- document -----------------------------------------------------------
  const pixelWidth = 1600;
  const pixelHeight = Math.round((pixelWidth * height) / width);

  const describedSettings = [
    `edges ${drawnEdges.length.toLocaleString("en-US")} of ${candidates.length.toLocaleString(
      "en-US"
    )} at ${round(view.edgePercentile, 1)}%`,
    `width x${round(view.edgeWidth, 2)}`,
    `colour by ${view.colorMode}`,
    dim ? `dimmed to ${dim.type} ${dim.value}` : "no dim",
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
    `<g id="caption">` +
    `<g id="caption-header" transform="translate(${n1(left)}, ${n1(top)})">${headerParts.join(
      ""
    )}</g>` +
    `<g id="caption-footer" transform="translate(${n1(left)}, ${n1(
      netTop + netHeight
    )})">${footerParts.join("")}</g>` +
    `</g>` +
    `</svg>\n`
  );
}

/**
 * A companion sheet of the figures behind the current view, styled to match
 * the network export so the two can hang together.
 *
 * @param {Object} options - as exportNetworkSVG, plus:
 * @param {Object} options.stats - {intragroupCohesion, countrySimilarity,
 *   intergroupCohesion, baseline, outliers}
 * @returns {string} a complete <svg> document
 */
export function exportStatsSheetSVG({ graphData, meta, stats } = {}) {
  const caption = buildCaption(meta || {});
  const {
    intragroupCohesion = [],
    countrySimilarity = [],
    intergroupCohesion = null,
    baseline = null,
  } = stats || {};

  // A4 portrait at roughly 2 units per mm, so the sheet drops onto paper beside
  // the network without rescaling.
  const W = 420;
  const H = 594;
  const M = 30;
  const inner = W - M * 2;

  const parts = [];
  let y = M + 14;

  parts.push(svgText(M, y, caption.title, { size: 15, weight: 700 }));
  y += 15;
  parts.push(svgText(M, y, caption.subtitle, { size: 9.5, fill: SECONDARY }));
  y += 11;
  parts.push(
    svgText(M, y, (caption.lines || []).slice(0, 2).join("  ·  "), {
      size: 8.5,
      fill: MUTED,
    })
  );
  y += 8;
  parts.push(svgRule(M, y, inner, INK, 1.2));
  y += 16;

  if (baseline && baseline.label) {
    parts.push(
      svgText(M, y, `Change measured against ${baseline.label}.`, {
        size: 8,
        fill: MUTED,
        italic: true,
      })
    );
    y += 12;
  }

  // One cohesion table. Each row carries a bar, so relative size reads without
  // reading every figure, and a delta column whenever a baseline exists.
  const table = (title, rows, lookup, limit) => {
    if (!rows || rows.length === 0) return;
    parts.push(svgText(M, y, title, { size: 9, weight: 700 }));
    y += 4;
    parts.push(svgRule(M, y, inner, RULE));
    y += 11;

    const barX = M + 150;
    const barW = 90;
    const scoreX = barX + barW + 34;
    const deltaX = M + inner;

    rows.slice(0, limit).forEach((row) => {
      const label = row.label || "";
      const score = row.score;
      parts.push(
        svgText(M, y, label.length > 30 ? `${label.slice(0, 29)}…` : label, {
          size: 8.5,
        })
      );
      if (Number.isFinite(score)) {
        parts.push(svgRect(barX, y - 5, barW, 5, "#eeeeee"));
        parts.push(
          svgRect(
            barX,
            y - 5,
            Math.max(0, Math.min(1, score)) * barW,
            5,
            row.color || "#9aa3ad"
          )
        );
        parts.push(
          svgText(scoreX, y, fmtPct(score), {
            size: 8.5,
            anchor: "end",
            monospaceDigits: true,
          })
        );
      }
      const delta = getDelta(score, lookup ? lookup(row) : null);
      if (delta) {
        parts.push(
          svgText(deltaX, y, `${delta.text} pp`, {
            size: 8.5,
            anchor: "end",
            monospaceDigits: true,
            // Same direction as the sidebar: green is more agreement.
            fill:
              delta.direction > 0
                ? "#1a6b3c"
                : delta.direction < 0
                ? "#a32a1e"
                : MUTED,
          })
        );
      }
      y += 12;
    });
    y += 10;
  };

  const groupRows = [...intragroupCohesion]
    .filter((item) => item && item.group)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((item) => ({
      label: getGroupDisplayName(item.group, meta && meta.mandate),
      score: item.score,
      key: item.group,
      color: groupColorFromNodes(graphData, item.group),
    }));
  table(
    "Agreement within each political group",
    groupRows,
    (row) => baseline?.scores?.intragroup?.[row.key],
    12
  );

  const countryRows = [...countrySimilarity]
    .filter((item) => item && item.country)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((item) => ({
      label: item.country,
      score: item.score,
      key: item.country,
    }));
  table(
    "Agreement within each national delegation",
    countryRows,
    // In a country view this figure comes from the same MEP pairs as the
    // whole-Parliament one, so its delta is zero by construction; the sidebar
    // omits it for the same reason.
    (row) =>
      baseline && baseline.comparing !== "country"
        ? baseline.scores?.country?.[row.key]
        : null,
    countryRows.length > 14 ? 14 : countryRows.length
  );

  if (intergroupCohesion && Array.isArray(intergroupCohesion.groups)) {
    const groups = intergroupCohesion.groups.filter((g) => g !== "NonAttached");
    const matrix = intergroupCohesion.matrix || [];
    const indexOf = new Map(intergroupCohesion.groups.map((g, i) => [g, i]));
    const cell = Math.min(26, Math.floor((inner - 44) / Math.max(groups.length, 1)));

    if (groups.length > 1 && y + cell * groups.length + 40 < H - M) {
      parts.push(svgText(M, y, "Agreement between groups", { size: 9, weight: 700 }));
      y += 4;
      parts.push(svgRule(M, y, inner, RULE));
      y += 14;

      const gridX = M + 44;
      groups.forEach((group, col) => {
        parts.push(
          svgText(
            gridX + cell * col + cell / 2,
            y,
            getGroupAcronym(group, meta && meta.mandate).slice(0, 5),
            { size: 6, anchor: "middle", fill: SECONDARY }
          )
        );
      });
      y += 5;

      groups.forEach((rowGroup) => {
        const rowIndex = indexOf.get(rowGroup);
        parts.push(
          svgText(
            M + 40,
            y + cell * 0.62,
            getGroupAcronym(rowGroup, meta && meta.mandate).slice(0, 6),
            { size: 6, anchor: "end", fill: SECONDARY }
          )
        );
        groups.forEach((colGroup, col) => {
          const colIndex = indexOf.get(colGroup);
          const score = matrix[rowIndex] ? matrix[rowIndex][colIndex] : null;
          const x = gridX + cell * col;
          if (!Number.isFinite(score) || score === 0) {
            parts.push(svgRect(x, y, cell - 1, cell - 1, "#f4f4f4"));
            return;
          }
          const rgb = getRedGreenColor(score);
          parts.push(svgRect(x, y, cell - 1, cell - 1, `rgb(${rgb.r},${rgb.g},${rgb.b})`));
          const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
          parts.push(
            svgText(x + (cell - 1) / 2, y + cell * 0.62, Math.round(score * 100), {
              size: 6,
              anchor: "middle",
              fill: luminance > 0.5 ? "#000000" : "#ffffff",
              monospaceDigits: true,
            })
          );
        });
        y += cell;
      });
      y += 14;
    }
  }

  const footerY = H - M;
  parts.push(svgRule(M, footerY - 22, inner, RULE));
  wrapText(caption.caveat, 78).forEach((line, i) => {
    parts.push(
      svgText(M, footerY - 12 + i * 8, line, { size: 7, fill: MUTED, italic: true })
    );
  });

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
