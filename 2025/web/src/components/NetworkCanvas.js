"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  edgeWidth,
  selectEdges,
  makeNodeColorFn,
  computeLoyalty,
  isEmphasised,
  nodeOpacity,
  edgeOpacity,
  UNKNOWN_COLOR,
} from "../lib/edgeStyle";
import { listParties } from "../lib/parties";
import {
  exportNetworkSVG,
  exportStatsSheetSVG,
  downloadSVG,
  buildCaption,
  buildLegend,
} from "../lib/networkExport";
import { CountryFlag, getGroupAcronym, getGroupColor } from "../lib/utils";
import {
  buildCommunityShapes,
  describeCommunity,
  describeDelegations,
  describeGeography,
  labelCommunities,
  stackLabels,
} from "../lib/communityShapes";
import "../styles/canvas-controls.scss";

const NODE_BORDER_BASE_LINE_WIDTH = 0.5;
const SELECTED_BORDER_BASE_LINE_WIDTH = 3;

/** Edges between groups, and any pair whose colouring says nothing. */
const NEUTRAL_EDGE_COLOR = "#999999";

/**
 * A hairline floor for edge width. Whether an edge is drawn at all is the
 * cutoff slider's job; an edge that survived the cut should never come out
 * invisible just because its weight sits at the neutral point.
 */
const MIN_EDGE_WIDTH = 0.04;

const COLOR_MODES = [
  { id: "group", label: "Group" },
  { id: "country", label: "Country" },
  { id: "party", label: "Party" },
  { id: "loyalty", label: "Loyalty" },
];

/**
 * Type for anything drawn into the canvas. There is no stylesheet in here, so
 * the stack is spelled out; it is the one the rest of the app resolves to.
 */
function canvasFont(size, weight = 600) {
  return `${weight} ${size}px Inter, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif`;
}

/**
 * Community outlines and their labels are measured in screen pixels, not in
 * layout units.
 *
 * Everything else on the canvas — node radius, edge width — is in layout units
 * and scales with the zoom, which is right for the picture and wrong for type.
 * At the zoom a 696-MEP network opens at, a node's radius is under two pixels,
 * so type set as a multiple of it would be four pixels tall. These are floors
 * in screen pixels: the outline never comes out thinner than a hairline and the
 * name is always readable, whatever the network's own scale happens to be.
 */
const OUTLINE_MIN_PX = 1.1;
const COMMUNITY_LABEL_PX = 17;

/** Parties smaller than this are folded into "others" in the legend. */
const LEGEND_MIN_PARTY_MEMBERS = 2;
const LEGEND_MAX_PARTIES = 12;

/**
 * Node radius for a view. Hit-testing, the canvas and the export all have to
 * agree on it, so it lives in one place.
 */
function nodeRadiusFor(nodeCount) {
  const baseNodeSize = 15;
  return Math.max(
    3,
    Math.min(15, baseNodeSize * Math.pow(nodeCount / 700, 0.4))
  );
}

/**
 * Call something from lib/networkExport.js without letting it take the page
 * down. That module is implemented separately and its functions throw until
 * it lands; a missing caption must not cost you the export.
 */
function tryExportCall(label, fn, fallback = null) {
  try {
    return fn();
  } catch (error) {
    console.warn(`networkExport.${label} unavailable:`, error.message);
    return fallback;
  }
}

/**
 * The detected communities, as dashed outlines beneath the nodes.
 *
 * Dashed rather than solid on purpose. These are density contours, not
 * borders: the line marks where a community thins out, and a solid stroke
 * would claim a precision the method does not have. See lib/communityShapes.js
 * for what the shape is and lib/networkAnalysis.js for what the partition is.
 *
 * Every measurement here is a multiple of the node radius, which is in layout
 * units, so the overlay scales with the picture and a print matches the screen
 * without a second set of numbers.
 */
function drawCommunityOutlines(ctx, communities, nodeSize, viewScale, focusId) {
  if (!communities || communities.length === 0) return;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  const stroke = Math.max(nodeSize * 0.3, OUTLINE_MIN_PX / viewScale);
  ctx.setLineDash([stroke * 5, stroke * 3.6]);

  for (let i = 0; i < communities.length; i += 1) {
    const community = communities[i];
    const focused = focusId === null || focusId === community.id;
    ctx.strokeStyle = community.color;
    // Hovering one community is a question about that one. The others stay
    // drawn — they are the context that makes the answer mean anything — but
    // they step back, at the same weight the dim control uses on nodes.
    ctx.globalAlpha = focused ? 0.95 : 0.18;
    ctx.lineWidth = focusId === community.id ? stroke * 1.6 : stroke;
    for (let r = 0; r < community.rings.length; r += 1) {
      const ring = community.rings[r];
      if (ring.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(ring[0][0], ring[0][1]);
      for (let p = 1; p < ring.length; p += 1) ctx.lineTo(ring[p][0], ring[p][1]);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Is this point inside any of a community's rings?
 *
 * The same even-odd test lib/communityShapes.js uses, repeated here because
 * this one runs on every mouse move and takes the layout coordinates the
 * canvas already has, not the grid coordinates the tracing worked in.
 */
function pointInRings(x, y, rings) {
  let inside = false;
  for (let r = 0; r < rings.length; r += 1) {
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

/** A rounded rectangle, with a path for browsers that predate roundRect. */
function roundedRect(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/**
 * The community names, over the nodes.
 *
 * Drawn after the nodes rather than with the outlines: an outline is texture
 * and can sit under a node, a name cannot.
 *
 * Each name sits on a plate rather than wearing a halo. A halo is a fat stroke
 * of white under the glyphs, and at the weight needed to survive seven hundred
 * dots behind it, it eats into the letterforms and the name comes out looking
 * soft — which is exactly what it looked like. An opaque plate leaves the
 * glyphs untouched, so the type is as crisp as the canvas can draw it.
 */
function drawCommunityLabels(
  ctx,
  communities,
  nodeSize,
  viewScale,
  focusId,
  boxesOut
) {
  if (!communities || communities.length === 0) return;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);

  const titleSize = Math.max(nodeSize * 2.2, COMMUNITY_LABEL_PX / viewScale);
  const countSize = titleSize * 0.62;
  const blockHeight = titleSize + countSize * 1.15;
  const padX = titleSize * 0.42;
  const padY = titleSize * 0.3;

  // Shapes overlap, so their names would too. Measured here and stacked in
  // lib/communityShapes.js, on the rule the SVG export also follows.
  const measured = communities.map((community) => {
    ctx.font = canvasFont(titleSize);
    const titleWidth = ctx.measureText(community.label).width;
    ctx.font = canvasFont(countSize, 500);
    const countWidth = ctx.measureText(community.countLabel).width;
    return {
      x: community.anchor.x,
      y: community.anchor.y - titleSize * 0.75,
      width: Math.max(titleWidth, countWidth),
      height: blockHeight,
    };
  });
  const baselines = stackLabels(measured, titleSize * 0.55);

  for (let i = 0; i < communities.length; i += 1) {
    const community = communities[i];
    const x = community.anchor.x;
    const countY = baselines[i];
    const titleY = countY - countSize * 1.15;
    const faded = focusId !== null && focusId !== community.id;
    ctx.globalAlpha = faded ? 0.25 : 1;

    const plateWidth = measured[i].width + padX * 2;
    const plateHeight = blockHeight + padY * 2;
    const plateLeft = x - plateWidth / 2;
    const plateTop = titleY - titleSize + padY * 0.2;
    // The plate is the reliable way to reach a community: inside a group's
    // cloud almost every pixel is within hover range of an MEP, and an MEP
    // always wins. The name is a target nothing else covers.
    if (boxesOut) {
      boxesOut.push({
        id: community.id,
        left: plateLeft,
        top: plateTop,
        right: plateLeft + plateWidth,
        bottom: plateTop + plateHeight,
      });
    }
    roundedRect(ctx, plateLeft, plateTop, plateWidth, plateHeight, titleSize * 0.32);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fill();

    ctx.font = canvasFont(titleSize);
    ctx.fillStyle = community.labelColor || community.color;
    ctx.fillText(community.label, x, titleY);

    ctx.font = canvasFont(countSize, 500);
    ctx.fillStyle = "rgba(70, 70, 78, 0.9)";
    ctx.fillText(community.countLabel, x, countY);
  }
  ctx.restore();
}

/**
 * Draw the whole scene into an already-transformed context.
 *
 * The screen canvas and the PNG export both come through here, so an export
 * cannot drift from what is on screen: everything that legitimately differs
 * between the two — line width divisor, edge alpha — is a parameter.
 *
 * Nothing in this function allocates per edge: colours come from a prebuilt
 * lookup and the link list arrives already selected and sorted.
 */
function drawScene(ctx, params) {
  const {
    graphData,
    links,
    colorFor,
    selectedNode,
    widthMultiplier,
    dim,
    lineWidthDivisor,
    baseEdgeAlpha,
    communities,
    communityFocusId,
    viewScale,
  } = params;

  const dimActive = Boolean(dim && dim.value);
  const nodeMap = graphData.nodeMap;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = NEUTRAL_EDGE_COLOR;
  ctx.globalAlpha = baseEdgeAlpha;

  // Thin edges first: widths now vary, so the heavy ones have to land on top.
  for (let i = 0; i < links.length; i += 1) {
    const link = links[i];
    const sourceNode = nodeMap.get(link.source);
    const targetNode = nodeMap.get(link.target);
    if (!sourceNode || !targetNode) continue;

    const sourceColor = colorFor(sourceNode);
    const targetColor = colorFor(targetNode);
    ctx.strokeStyle =
      sourceColor === targetColor ? sourceColor : NEUTRAL_EDGE_COLOR;
    ctx.globalAlpha = edgeOpacity(
      isEmphasised(sourceNode, dim) && isEmphasised(targetNode, dim),
      dimActive,
      baseEdgeAlpha
    );
    ctx.lineWidth =
      Math.max(edgeWidth(link.weight, widthMultiplier), MIN_EDGE_WIDTH) /
      lineWidthDivisor;

    ctx.beginPath();
    ctx.moveTo(sourceNode.x, sourceNode.y);
    ctx.lineTo(targetNode.x, targetNode.y);
    ctx.stroke();
  }

  const nodes = graphData.nodes;
  const nodeSize = nodeRadiusFor(nodes.length);

  // Between the edges and the nodes: an outline is a region, so it belongs
  // behind the MEPs standing in it and in front of the wash of ties.
  drawCommunityOutlines(
    ctx,
    communities,
    nodeSize,
    viewScale,
    communityFocusId ?? null
  );

  const selectedNodeSize = nodeSize * 1.2;
  const haloSize1 = selectedNodeSize * 1.9;
  const haloSize2 = selectedNodeSize * 1.6;
  const haloSize3 = selectedNodeSize * 1.4;
  const borderSize = selectedNodeSize * 1.1;

  ctx.globalAlpha = 1;
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const isSelected = Boolean(selectedNode && node.id === selectedNode.id);
    // A selected node stays fully opaque even when it is outside the dim
    // subject — you asked for it, you should be able to see it.
    ctx.globalAlpha = isSelected
      ? 1
      : nodeOpacity(isEmphasised(node, dim), dimActive);

    if (isSelected) {
      ctx.fillStyle = "rgba(255, 215, 0, 0.2)";
      ctx.beginPath();
      ctx.arc(node.x, node.y, haloSize1, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 215, 0, 0.3)";
      ctx.beginPath();
      ctx.arc(node.x, node.y, haloSize2, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 215, 0, 0.4)";
      ctx.beginPath();
      ctx.arc(node.x, node.y, haloSize3, 0, 2 * Math.PI);
      ctx.fill();

      ctx.strokeStyle = "#FFD700";
      ctx.lineWidth = SELECTED_BORDER_BASE_LINE_WIDTH / lineWidthDivisor;
      ctx.beginPath();
      ctx.arc(node.x, node.y, borderSize, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.fillStyle = colorFor(node);
      ctx.beginPath();
      ctx.arc(node.x, node.y, selectedNodeSize, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      ctx.fillStyle = colorFor(node);
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
      ctx.fill();

      ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
      ctx.lineWidth = NODE_BORDER_BASE_LINE_WIDTH / lineWidthDivisor;
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  drawCommunityLabels(
    ctx,
    communities,
    nodeSize,
    viewScale,
    communityFocusId ?? null,
    params.labelBoxes
  );
}

/**
 * What is inside this community.
 *
 * Most communities are a political group, and for those this card confirms it
 * in a line and is done. The ones worth the card are the others: a slice of a
 * group, or two groups the algorithm merged. For those the question a reader
 * actually has is "what do these people have in common that the rest of their
 * group does not" — and the answer is usually a country or a corner of
 * Europe, which is why the geography is here and not buried.
 *
 * Positioned in viewport coordinates like the MEP tooltip, and flipped to the
 * other side of the cursor near the right edge, where a card this wide would
 * otherwise be cut in half by the sidebar.
 */
function CommunityTooltip({ shape, position, mandate }) {
  if (!shape || !position) return null;

  const viewportWidth =
    typeof window === "undefined" ? 1200 : window.innerWidth;
  const viewportHeight =
    typeof window === "undefined" ? 800 : window.innerHeight;
  const width = 290;
  const flip = position.x + width + 28 > viewportWidth;
  const left = flip ? position.x - width - 16 : position.x + 16;
  const top = Math.min(Math.max(12, position.y - 24), viewportHeight - 340);

  const geography = describeGeography(shape);
  const delegations = describeDelegations(shape);
  const countries = shape.countries || [];

  // The country list is ordered by how much of the community each one is, and
  // that ordering buries the interesting case: Croatia is six MEPs in a
  // community of 156 and it is half of Croatia. So after the four largest,
  // pull in any country that has most of itself in here.
  const largest = countries.slice(0, 4);
  const alreadyShown = new Set(largest.map((entry) => entry.country));
  const concentrated = countries
    .filter(
      (entry) =>
        !alreadyShown.has(entry.country) && entry.shareOfCountry >= 0.5
    )
    .slice(0, 3);
  const countryRows = [...largest, ...concentrated];
  const remainingCountries = countries.length - countryRows.length;

  return (
    <div className="community-tip" style={{ left: `${left}px`, top: `${top}px` }}>
      <div className="community-tip-head">
        <span
          className="community-tip-swatch"
          style={{ background: shape.color }}
          aria-hidden="true"
        />
        <span className="community-tip-name">{shape.label}</span>
        <span className="community-tip-size">{shape.countLabel}</span>
      </div>

      <p className="community-tip-lede">{describeCommunity(shape, mandate)}</p>
      {geography && <p className="community-tip-lede">{geography}</p>}
      {delegations && <p className="community-tip-lede">{delegations}</p>}

      <div className="community-tip-label">Groups inside</div>
      <ul className="community-tip-rows">
        {shape.composition.slice(0, 5).map((part) => (
          <li className="community-tip-row" key={part.groupId}>
            <span
              className="community-tip-dot"
              style={{ background: getGroupColor(part.groupId) }}
              aria-hidden="true"
            />
            <span className="community-tip-row-name">
              {getGroupAcronym(part.groupId, mandate)}
            </span>
            <span className="community-tip-row-count">{part.count}</span>
            <span className="community-tip-row-note">
              {Math.round(part.shareOfGroup * 100)}% of the group
            </span>
          </li>
        ))}
      </ul>

      {/* A country view has one country, and a table of it is a table of the
          size that is already in the header. */}
      {countries.length > 0 && !shape.oneCountry && (
        <>
          <div className="community-tip-label">
            {countries.length === 1
              ? "Country"
              : `Countries · ${countries.length}`}
          </div>
          <ul className="community-tip-rows">
            {countryRows.map((entry) => (
              <li className="community-tip-row" key={entry.country}>
                <span className="community-tip-flag" aria-hidden="true">
                  <CountryFlag country={entry.country} />
                </span>
                <span className="community-tip-row-name community-tip-row-wide">
                  {entry.country}
                </span>
                <span className="community-tip-row-count">{entry.count}</span>
                <span className="community-tip-row-note">
                  {/* Of the country, not of the community: a delegation of six
                      is never a large share of a community and can still be
                      entirely inside one. */}
                  {Math.round(entry.shareOfCountry * 100)}% of the country
                </span>
              </li>
            ))}
          </ul>
          {remainingCountries > 0 && (
            <p className="community-tip-foot community-tip-foot-tight">
              and {remainingCountries} more
            </p>
          )}
        </>
      )}

      {shape.islands > 1 && (
        <p className="community-tip-foot">
          Drawn as {shape.islands} islands: its members sit in that many pockets
          of the layout rather than in one.
        </p>
      )}
    </div>
  );
}

/**
 * The caption block baked into a raster export.
 *
 * Laid out here rather than in lib/networkExport.js because that module deals
 * in SVG; the text and the legend it hands back are shared, the drawing is not.
 */
function drawCaptionBand(ctx, params) {
  const { caption, legend, width, height, scale } = params;
  const pad = 24 * scale;
  const titleSize = 26 * scale;
  const bodySize = 15 * scale;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#e0e0e0";
  ctx.fillRect(pad, 0, width - pad * 2, Math.max(1, scale));

  ctx.textBaseline = "top";
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `600 ${titleSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.fillText(caption.title || "", pad, pad);

  const bodyFont = `${bodySize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.font = bodyFont;
  ctx.fillStyle = "#666666";
  const lines = [caption.subtitle, ...(caption.lines || []), caption.caveat]
    .filter(Boolean)
    .slice(0, 6);
  lines.forEach((line, index) => {
    ctx.fillText(line, pad, pad + titleSize * 1.35 + index * bodySize * 1.5);
  });

  // Colour key runs down the right-hand side of the band.
  const entries = (legend || []).slice(0, 10);
  const swatch = bodySize;
  const columnX = width - pad - 340 * scale;
  entries.forEach((entry, index) => {
    const y = pad + index * bodySize * 1.5;
    ctx.fillStyle = entry.color || NEUTRAL_EDGE_COLOR;
    ctx.fillRect(columnX, y, swatch, swatch);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText(entry.label || "", columnX + swatch * 1.6, y);
  });

  ctx.restore();
}

export default function NetworkCanvas({
  graphData,
  selectedNode,
  onNodeClick,
  onNodeHover,
  onHoverPositionChange,
  mandate,
  selectedCountry,
  selectedSubject,
  renderSettings,
  onRenderSettingsChange,
  // Only read by the stats-sheet export, which puts the sidebar's figures on
  // a sheet to hang beside the printed network.
  baseline,
  intergroupCohesion,
  intragroupCohesion,
  countrySimilarity,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const zoomRef = useRef(null);
  const graphDataRef = useRef(null);
  const pixelRatioRef = useRef(
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
  );
  // Detect Safari for rendering adjustments
  const isSafariRef = useRef(
    typeof window !== "undefined" &&
      /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  );
  const handlersRef = useRef({
    mouseMove: null,
    mouseLeave: null,
    click: null,
  });
  const initialScaleRef = useRef(1);
  const initialTransformRef = useRef({ x: 0, y: 0, k: 1 });
  const [canvasReady, setCanvasReady] = useState(false);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isAtMinZoom, setIsAtMinZoom] = useState(false);
  const [showDisplayPanel, setShowDisplayPanel] = useState(false);
  // Which kind of dim the picker is offering. Held locally because the picker
  // has to remember "country" while nothing is selected yet, and a cleared dim
  // is null in the shared settings.
  const [dimKind, setDimKind] = useState("group");
  // Flipped the first time the SVG exporter throws, which is what it does
  // until lib/networkExport.js is implemented. Offering a button that cannot
  // work is worse than not offering it.
  const [svgExportBroken, setSvgExportBroken] = useState(false);
  const [statsExportBroken, setStatsExportBroken] = useState(false);
  // The community outlines, once they have been computed. Held here rather
  // than derived in a useMemo because computing them blocks for a fifth of a
  // second on the full network, which has to happen off the click.
  const [communityData, setCommunityData] = useState(null);
  const [communitiesPending, setCommunitiesPending] = useState(false);
  // {id, x, y} while the cursor is inside a community's outline. The mouse
  // handler is installed once and never re-installed, so the outlines it
  // hit-tests against have to reach it through a ref.
  const [hoveredCommunity, setHoveredCommunity] = useState(null);
  const communityOverlayRef = useRef(null);
  // Where each community's name was drawn, in layout coordinates, refreshed on
  // every paint. Hovering the name is how you reach a community that is buried
  // in a cloud of MEPs.
  const communityLabelBoxesRef = useRef([]);

  // Defaults keep this component usable on its own if a caller ever drops the
  // prop; page.js always passes a complete object.
  const edgePercentile = renderSettings?.edgePercentile ?? 50;
  const widthMultiplier = renderSettings?.edgeWidth ?? 1;
  const colorMode = renderSettings?.colorMode ?? "group";
  const dim = renderSettings?.dim ?? null;
  const showCommunities = renderSettings?.communities ?? false;
  const activeDimKind = dim?.type || dimKind;

  const updateSettings = (patch) => {
    if (typeof onRenderSettingsChange !== "function") return;
    onRenderSettingsChange({
      edgePercentile,
      edgeWidth: widthMultiplier,
      colorMode,
      dim,
      communities: showCommunities,
      ...patch,
    });
  };

  // The colour lookup is called twice per edge per frame — up to ~270k times
  // on the full network — so it is built once per (graphData, mode) and the
  // per-node result is cached in a Map. Everything downstream reads the Map.
  const nodeColorFn = useMemo(
    () =>
      graphData ? makeNodeColorFn(graphData, colorMode) : () => UNKNOWN_COLOR,
    [graphData, colorMode]
  );

  const colorFor = useMemo(() => {
    if (!graphData) return () => UNKNOWN_COLOR;
    const colors = new Map(
      (graphData.nodes || []).map((node) => [node.id, nodeColorFn(node)])
    );
    return (node) => colors.get(node.id) || node.color || UNKNOWN_COLOR;
  }, [graphData, nodeColorFn]);

  // Which edges get drawn at all, ascending by weight so the thin ones are
  // laid down first. selectEdges copies, so graphData's arrays — which the
  // statistics panels read — are never touched.
  const drawnLinks = useMemo(() => {
    if (!graphData) return [];
    const source = graphData.allLinks || graphData.links || [];
    return selectEdges(source, edgePercentile).sort(
      (a, b) => (a.weight || 0) - (b.weight || 0)
    );
  }, [graphData, edgePercentile]);

  // Groups and countries actually present, for the dim picker and the legend.
  const presentGroups = useMemo(() => {
    if (!graphData) return [];
    const counts = (graphData.nodes || []).reduce((acc, node) => {
      if (node.groupId) acc.set(node.groupId, (acc.get(node.groupId) || 0) + 1);
      return acc;
    }, new Map());
    return [...counts.entries()]
      .map(([id, count]) => ({
        id,
        count,
        label: getGroupAcronym(id, mandate),
        color: getGroupColor(id),
      }))
      .sort((a, b) => b.count - a.count);
  }, [graphData, mandate]);

  // A sample node travels with each country so the legend swatch comes from
  // the same colour function the canvas uses, never a second implementation.
  const presentCountries = useMemo(() => {
    if (!graphData) return [];
    const counts = (graphData.nodes || []).reduce((acc, node) => {
      if (!node.country) return acc;
      const existing = acc.get(node.country);
      if (existing) {
        existing.count += 1;
        return acc;
      }
      acc.set(node.country, { id: node.country, count: 1, sample: node });
      return acc;
    }, new Map());
    return [...counts.values()].sort((a, b) => a.id.localeCompare(b.id));
  }, [graphData]);

  // Legend entries for the active colour mode. Country mode reads its swatch
  // from the same colour function the canvas uses rather than recomputing it.
  const legendEntries = useMemo(() => {
    if (!graphData) return [];
    const nodes = graphData.nodes || [];
    if (colorMode === "group") {
      return presentGroups.map((group) => ({
        key: group.id,
        label: group.label,
        color: group.color,
        count: group.count,
      }));
    }
    if (colorMode === "country") {
      return presentCountries.map((country) => ({
        key: country.id,
        label: country.id,
        color: nodeColorFn(country.sample),
        count: country.count,
      }));
    }
    if (colorMode === "party") {
      const parties = listParties(nodes, LEGEND_MIN_PARTY_MEMBERS);
      const shown = parties.slice(0, LEGEND_MAX_PARTIES).map((party) => ({
        key: party.key,
        label: `${party.name} (${party.country})`,
        color: party.color,
        count: party.count,
      }));
      const shownIds = new Set(shown.map((entry) => entry.key));
      const others = nodes.length - parties
        .filter((party) => shownIds.has(party.key))
        .reduce((sum, party) => sum + party.count, 0);
      return others > 0
        ? [
            ...shown,
            {
              key: "__others__",
              label: "others",
              color: UNKNOWN_COLOR,
              count: others,
            },
          ]
        : shown;
    }
    return [];
  }, [graphData, colorMode, nodeColorFn, presentGroups, presentCountries]);

  /**
   * Find the communities, once the reader has asked for them.
   *
   * Roughly 200 ms of synchronous work on the full 696-MEP network — Louvain
   * over the sparsified graph, then a density contour per community — so it is
   * not spent unless the overlay is switched on, and it is deferred by a tick
   * so the button paints as pressed before the main thread goes away. The
   * result is memoised on graphData inside the library, so switching the
   * overlay off and on again, or leaving and returning to a network, is free.
   */
  useEffect(() => {
    if (!showCommunities || !graphData) {
      setCommunityData(null);
      setCommunitiesPending(false);
      return undefined;
    }
    let cancelled = false;
    setCommunitiesPending(true);
    const id = setTimeout(() => {
      let shapes = null;
      try {
        shapes = buildCommunityShapes(graphData);
      } catch (error) {
        // A network that cannot be partitioned is a normal outcome, not a
        // reason to take the canvas down with it.
        console.warn("Community detection failed:", error);
      }
      if (cancelled) return;
      setCommunityData(shapes);
      setCommunitiesPending(false);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [showCommunities, graphData]);

  // Names and colours for the outlines. Separate from the geometry because the
  // geometry does not depend on the term and the acronyms do.
  const communityOverlay = useMemo(() => {
    if (!communityData || communityData.shapes.length === 0) return null;
    const labels = labelCommunities(communityData.shapes, mandate);
    return communityData.shapes.map((shape, index) => ({
      ...shape,
      label: labels[index],
      countLabel: `${shape.size} MEP${shape.size === 1 ? "" : "s"}`,
    }));
  }, [communityData, mandate]);

  // Smallest first: a community inside another one is only reachable if it is
  // tested first, because the bigger outline covers every point of it.
  useEffect(() => {
    communityOverlayRef.current = communityOverlay
      ? [...communityOverlay].sort((a, b) => a.size - b.size)
      : null;
    if (!communityOverlay) setHoveredCommunity(null);
  }, [communityOverlay]);

  const focusedCommunity = useMemo(() => {
    if (!hoveredCommunity || !communityOverlay) return null;
    return (
      communityOverlay.find((community) => community.id === hoveredCommunity.id) ||
      null
    );
  }, [hoveredCommunity, communityOverlay]);

  /**
   * Hovering a community asks "who is in this one?", so everyone else steps
   * back while the question is open.
   *
   * Expressed as a dim rather than as a new kind of fading, because the canvas
   * already has one and a second one would be a second set of opacities to
   * keep in agreement. When a dim is already set the two intersect: a country
   * dim plus a community hover leaves that country's members of that
   * community lit, which is the only reading that respects both controls.
   */
  const effectiveDim = useMemo(() => {
    if (!focusedCommunity) return dim;
    const members =
      dim && dim.value
        ? new Set(
            (graphData?.nodes || [])
              .filter(
                (node) =>
                  focusedCommunity.memberSet.has(node.id) &&
                  isEmphasised(node, dim)
              )
              .map((node) => node.id)
          )
        : focusedCommunity.memberSet;
    return { type: "members", value: `community-${focusedCommunity.id}`, members };
  }, [focusedCommunity, dim, graphData]);

  /**
   * The figures under the switch.
   *
   * Two numbers and no more: how many communities the votes produced, and how
   * often one of them turns out to be a political group. The second is the one
   * that says whether the first is interesting.
   */
  const communityReadout = communitiesPending
    ? "Finding communities…"
    : !communityData
    ? "This network is too small to partition."
    : `${communityData.count} communit${
        communityData.count === 1 ? "y" : "ies"
      } · ${Math.round(
        communityData.concordantShare * 100
      )}% land with their own group`;

  // Only needed to label the loyalty gradient's ends.
  const loyaltyRange = useMemo(() => {
    if (!graphData || colorMode !== "loyalty") return null;
    const values = [...computeLoyalty(graphData).values()];
    if (values.length === 0) return null;
    return values.reduce(
      (acc, value) => ({
        min: Math.min(acc.min, value),
        max: Math.max(acc.max, value),
      }),
      { min: Infinity, max: -Infinity }
    );
  }, [graphData, colorMode]);

  // Render canvas - render immediately when data is available
  useEffect(() => {
    if (!graphData || !canvasRef.current) return;

    // If canvas isn't ready yet, try to set it up
    if (!canvasReady && containerRef.current) {
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      const canvas = canvasRef.current;
      if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = width;
        canvas.height = height;
      }
      // Defer state update to avoid cascading renders
      setTimeout(() => setCanvasReady(true), 0);
    }

    if (!canvasReady) return;

    const canvas = canvasRef.current;
    const pixelRatio =
      pixelRatioRef.current ||
      (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const t = transformRef.current;

    // Clear entire canvas in device pixels
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.restore();

    // Apply high-DPI scale followed by graph transforms
    // Safari uses 1:1 canvas, so no scaling needed
    const isSafari = isSafariRef.current;
    const effectivePixelRatio = isSafari ? 1 : pixelRatio;

    ctx.save();
    ctx.scale(effectivePixelRatio, effectivePixelRatio);
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    const labelBoxes = [];

    // Everything visual happens in drawScene, which the PNG export also calls.
    // Line widths are divided by effectivePixelRatio because the context is
    // scaled by it; Safari draws on a 1:1 canvas and needs a lower edge alpha
    // to match Chrome and Firefox.
    drawScene(ctx, {
      graphData,
      links: drawnLinks,
      colorFor,
      selectedNode,
      widthMultiplier,
      dim: effectiveDim,
      communities: communityOverlay,
      communityFocusId: focusedCommunity ? focusedCommunity.id : null,
      labelBoxes: labelBoxes,
      viewScale: t.k,
      lineWidthDivisor: effectivePixelRatio,
      baseEdgeAlpha: isSafari ? 0.05 : 0.3,
    });

    ctx.restore();
    communityLabelBoxesRef.current = labelBoxes;
  }, [
    graphData,
    selectedNode,
    canvasReady,
    transform,
    drawnLinks,
    colorFor,
    widthMultiplier,
    effectiveDim,
    communityOverlay,
    focusedCommunity,
  ]);

  // Setup canvas (only once)
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    // Only create canvas if it doesn't exist
    if (
      canvasRef.current &&
      canvasRef.current.parentNode === containerRef.current
    ) {
      if (!canvasReady) {
        // Defer state update to avoid cascading renders
        setTimeout(() => setCanvasReady(true), 0);
      }
      return;
    }

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const isSafari = isSafariRef.current;
    // Safari handles high-DPI differently, use 1:1 canvas for consistent rendering
    const effectivePixelRatio = isSafari
      ? 1
      : typeof window !== "undefined"
      ? window.devicePixelRatio || 1
      : 1;
    const pixelRatio =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    pixelRatioRef.current = pixelRatio;

    // Set up canvas
    const canvas = document.createElement("canvas");
    canvas.width = width * effectivePixelRatio;
    canvas.height = height * effectivePixelRatio;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.cursor = "grab";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.zIndex = "1";

    // Remove existing canvas if present, but preserve zoom controls
    const existingCanvas = containerRef.current.querySelector("canvas");
    if (existingCanvas) {
      existingCanvas.remove();
    }

    // Append canvas (zoom controls should already be in the container from JSX)
    containerRef.current.appendChild(canvas);
    canvasRef.current = canvas;
    // Defer state update to avoid cascading renders
    setTimeout(() => setCanvasReady(true), 0);
  }, [canvasReady]); // Re-check if canvasReady changes

  // Update graphData ref when it changes
  useEffect(() => {
    graphDataRef.current = graphData;
  }, [graphData]);

  // Setup interactions (only once)
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) {
      return;
    }

    const d3 = require("d3");
    const canvas = canvasRef.current;

    // Set up zoom behavior (only once)
    if (!zoomRef.current) {
      const zoomSelection = d3.select(canvas);
      const zoom = d3
        .zoom()
        .scaleExtent([initialScaleRef.current, 10]) // Use initial scale as minimum
        .filter((event) => {
          // Disable double-click zoom
          return event.type !== "dblclick";
        })
        .on("zoom", (event) => {
          const t = event.transform;
          // Enforce minimum scale (don't allow zooming out more than initial view)
          const minScale = initialScaleRef.current;
          if (t.k < minScale) {
            // Constrain the transform to minimum scale
            const constrainedTransform = d3.zoomIdentity
              .translate(t.x, t.y)
              .scale(minScale);
            zoomSelection.call(zoom.transform, constrainedTransform);
            setIsAtMinZoom(true);
            return;
          }
          transformRef.current = { x: t.x, y: t.y, k: t.k };
          setTransform({ x: t.x, y: t.y, k: t.k });
          // Check if at minimum zoom (with small tolerance for floating point)
          setIsAtMinZoom(Math.abs(t.k - minScale) < 0.001);
        });

      zoomRef.current = zoom;
      zoomSelection.call(zoom);
    }

    // Create handlers that use graphDataRef to access current data
    const handleMouseMove = (event) => {
      const graphData = graphDataRef.current;
      if (!graphData) return;

      const rect = canvas.getBoundingClientRect();
      const currentTransform = transformRef.current;
      const x =
        (event.clientX - rect.left - currentTransform.x) / currentTransform.k;
      const y =
        (event.clientY - rect.top - currentTransform.y) / currentTransform.k;

      const nodeSize = nodeRadiusFor(graphData.nodes.length);

      // A community's name sits over everything, so it is tested before the
      // MEPs underneath it.
      const overlay = communityOverlayRef.current;
      const labelled = overlay
        ? communityLabelBoxesRef.current.find(
            (box) =>
              x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
          )
        : null;
      if (labelled) {
        onNodeHover(null);
        canvas.style.cursor = "grab";
        setHoveredCommunity({
          id: labelled.id,
          x: event.clientX,
          y: event.clientY,
        });
        return;
      }

      // Find hovered node
      // Use a minimum hover radius in screen space (8 pixels) for better UX when zoomed
      const minHoverRadius = 8 / currentTransform.k; // Convert to data space
      const hoverRadius = Math.max(nodeSize, minHoverRadius);
      const hovered = graphData.nodes.find((node) => {
        const dx = node.x - x;
        const dy = node.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < hoverRadius;
      });

      if (hovered) {
        onNodeHover(hovered);
        onHoverPositionChange({ x: event.clientX, y: event.clientY });
        canvas.style.cursor = "pointer";
        setHoveredCommunity(null);
        return;
      }

      onNodeHover(null);
      canvas.style.cursor = "grab";

      // No MEP under the cursor: is it inside a community? An MEP wins over a
      // community's interior, because the outline covers hundreds of them and
      // the specific answer beats the general one.
      if (!overlay) {
        setHoveredCommunity(null);
        return;
      }
      // Smallest first, so a community sitting inside another one is reachable
      // at all — the outline of the bigger one covers every point of it.
      const found = overlay.find((community) =>
        pointInRings(x, y, community.rings)
      );
      setHoveredCommunity(
        found
          ? { id: found.id, x: event.clientX, y: event.clientY }
          : null
      );
    };

    const handleMouseLeave = () => {
      onNodeHover(null);
      setHoveredCommunity(null);
      canvas.style.cursor = "grab";
    };

    const handleClick = (event) => {
      const graphData = graphDataRef.current;
      if (!graphData) return;

      const rect = canvas.getBoundingClientRect();
      const currentTransform = transformRef.current;
      const x =
        (event.clientX - rect.left - currentTransform.x) / currentTransform.k;
      const y =
        (event.clientY - rect.top - currentTransform.y) / currentTransform.k;

      const nodeSize = nodeRadiusFor(graphData.nodes.length);

      // Find clicked node
      // Use a minimum clickable radius in screen space (8 pixels) for better UX when zoomed
      const minClickableRadius = 8 / currentTransform.k; // Convert to data space
      const clickableRadius = Math.max(nodeSize, minClickableRadius);
      const clickedNode = graphData.nodes.find((node) => {
        const dx = node.x - x;
        const dy = node.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < clickableRadius;
      });

      if (clickedNode) {
        onNodeClick({
          id: clickedNode.id,
          label: clickedNode.label,
          country: clickedNode.country,
          groupId: clickedNode.groupId,
        });
      } else {
        onNodeClick(null);
      }
    };

    // Store handlers in ref
    handlersRef.current = {
      mouseMove: handleMouseMove,
      mouseLeave: handleMouseLeave,
      click: handleClick,
    };

    // Add event listeners (only once)
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("click", handleClick);

    // Cleanup
    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("click", handleClick);
    };
  }, [onNodeClick, onNodeHover, onHoverPositionChange]); // Only set up once

  // Update transform when graphData changes
  useEffect(() => {
    if (
      !containerRef.current ||
      !graphData ||
      !canvasRef.current ||
      !zoomRef.current
    ) {
      return;
    }

    const d3 = require("d3");
    const canvas = canvasRef.current;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Calculate initial transform to fit all nodes with margins
    const xExtent = d3.extent(graphData.nodes, (d) => d.x);
    const yExtent = d3.extent(graphData.nodes, (d) => d.y);

    // Handle edge case: if all nodes are at the same position
    const fullWidth = Math.max(xExtent[1] - xExtent[0], 1);
    const fullHeight = Math.max(yExtent[1] - yExtent[0], 1);

    const centerX = (xExtent[0] + xExtent[1]) / 2;
    const centerY = (yExtent[0] + yExtent[1]) / 2;

    // Add margins (10% on each side = 20% total, so use 0.8 multiplier)
    const margin = 0.1; // 10% margin on each side
    const availableWidth = width * (1 - 2 * margin);
    const availableHeight = height * (1 - 2 * margin);

    // Calculate scale to fit nodes with margins
    const scaleX = availableWidth / fullWidth;
    const scaleY = availableHeight / fullHeight;
    const scale = Math.min(scaleX, scaleY);

    // Ensure minimum scale to prevent extreme zoom
    const minScale = 0.01;
    const maxScale = 10;
    const clampedScale = Math.max(minScale, Math.min(maxScale, scale));

    const initialTransform = {
      x: width / 2 - clampedScale * centerX,
      y: height / 2 - clampedScale * centerY,
      k: clampedScale,
    };

    // Store initial scale and transform to prevent zooming out more than this
    initialScaleRef.current = clampedScale;
    initialTransformRef.current = { ...initialTransform };

    transformRef.current = initialTransform;
    setTransform(initialTransform);
    setIsAtMinZoom(true); // At minimum zoom when reset

    // Update transform when graphData changes
    const zoomSelection = d3.select(canvas);

    // Update scale extent with the new initial scale
    if (zoomRef.current) {
      zoomRef.current.scaleExtent([clampedScale, 10]);
    }

    zoomSelection.call(
      zoomRef.current.transform,
      d3.zoomIdentity
        .translate(initialTransform.x, initialTransform.y)
        .scale(initialTransform.k)
    );
  }, [graphData]);

  const handleZoomIn = () => {
    if (!zoomRef.current || !canvasRef.current) return;
    const d3 = require("d3");
    const zoomSelection = d3.select(canvasRef.current);
    const currentTransform = transformRef.current;
    const newScale = Math.min(currentTransform.k * 1.5, 10);
    const newTransform = d3.zoomIdentity
      .translate(currentTransform.x, currentTransform.y)
      .scale(newScale);
    zoomSelection.call(zoomRef.current.transform, newTransform);
  };

  const handleZoomOut = () => {
    if (!zoomRef.current || !canvasRef.current || isAtMinZoom) return;
    const d3 = require("d3");
    const zoomSelection = d3.select(canvasRef.current);
    const currentTransform = transformRef.current;
    const minScale = initialScaleRef.current;
    const newScale = Math.max(currentTransform.k / 1.5, minScale);
    const newTransform = d3.zoomIdentity
      .translate(currentTransform.x, currentTransform.y)
      .scale(newScale);
    zoomSelection.call(zoomRef.current.transform, newTransform);
  };

  const handleResetZoom = () => {
    if (!zoomRef.current || !canvasRef.current) return;
    const d3 = require("d3");
    const zoomSelection = d3.select(canvasRef.current);
    const initialTransform = initialTransformRef.current;
    const newTransform = d3.zoomIdentity
      .translate(initialTransform.x, initialTransform.y)
      .scale(initialTransform.k);
    zoomSelection.call(zoomRef.current.transform, newTransform);
  };

  // What the exporters need to know about the view they are printing.
  const exportMeta = {
    mandate,
    country: selectedCountry || null,
    subject: selectedSubject || null,
    nodeCount: graphData?.nodes?.length || 0,
    votingSessions:
      graphData?.metadata?.votingSessions ??
      graphData?.votingSessions?.total ??
      null,
  };

  const buildExportFilename = (extension) => {
    const sanitizeForFilename = (str) =>
      str
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase();

    const parts = [`mandate-${mandate || "all"}`];
    if (selectedCountry) {
      parts.push(`country-${sanitizeForFilename(selectedCountry)}`);
    }
    if (selectedSubject) {
      parts.push(`subject-${sanitizeForFilename(selectedSubject)}`);
    } else if (graphData?.subjects && graphData.subjects.length > 0) {
      parts.push("all-subjects");
    }
    return `network-${parts.join("-")}.${extension}`;
  };

  const handleExportSVG = () => {
    if (!graphData) return;
    const svg = tryExportCall("exportNetworkSVG", () =>
      exportNetworkSVG({
        graphData,
        renderSettings: {
          edgePercentile,
          edgeWidth: widthMultiplier,
          colorMode,
          dim,
        },
        meta: exportMeta,
      })
    );

    if (!svg) {
      // The exporter is not available in this build. Stop offering the button
      // rather than handing out a broken control.
      setSvgExportBroken(true);
      return;
    }

    const delivered = tryExportCall(
      "downloadSVG",
      () => {
        downloadSVG(svg, buildExportFilename("svg"));
        return true;
      },
      false
    );
    if (!delivered) setSvgExportBroken(true);
  };

  /**
   * The figures behind the current view, as a sheet to hang beside the print.
   *
   * Separate from the network export because on a wall they are two objects:
   * the shape, and the numbers that shape came from.
   */
  const handleExportStatsSheet = () => {
    if (!graphData) return;
    const svg = tryExportCall("exportStatsSheetSVG", () =>
      exportStatsSheetSVG({
        graphData,
        renderSettings: {
          edgePercentile,
          edgeWidth: widthMultiplier,
          colorMode,
          dim,
        },
        meta: exportMeta,
        stats: {
          intragroupCohesion: intragroupCohesion || [],
          countrySimilarity: countrySimilarity || [],
          intergroupCohesion: intergroupCohesion || null,
          baseline: baseline || null,
        },
      })
    );

    if (!svg) {
      setStatsExportBroken(true);
      return;
    }

    const delivered = tryExportCall(
      "downloadSVG",
      () => {
        downloadSVG(svg, buildExportFilename("svg").replace(/\.svg$/, "-stats.svg"));
        return true;
      },
      false
    );
    if (!delivered) setStatsExportBroken(true);
  };

  const handleExportPNG = () => {
    if (!canvasRef.current || !graphData) return;

    const canvas = canvasRef.current;
    const pixelRatio =
      pixelRatioRef.current ||
      (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const logicalWidth = canvas.width / pixelRatio;
    const logicalHeight = canvas.height / pixelRatio;

    // Ensure canvas has valid dimensions
    if (logicalWidth === 0 || logicalHeight === 0) {
      console.error("Canvas has invalid dimensions");
      return;
    }

    // Use high scale for print-quality exports, but limit canvas size
    // Most browsers have practical limits around 8-16k pixels per dimension
    // Also limit total pixels to avoid memory issues (e.g., 256MP = 16384^2)
    const maxDimension = 16384; // Conservative limit for most browsers
    const maxTotalPixels = 256 * 1024 * 1024; // 256 megapixels

    const desiredScale = 8; // Reduced from 24 for better compatibility
    const maxScaleByDimension = Math.floor(
      maxDimension / Math.max(logicalWidth, logicalHeight)
    );
    const maxScaleByPixels = Math.floor(
      Math.sqrt(maxTotalPixels / (logicalWidth * logicalHeight))
    );

    const scale = Math.max(
      1,
      Math.min(desiredScale, maxScaleByDimension, maxScaleByPixels)
    );

    if (scale < 1) {
      console.error("Invalid scale calculated:", scale);
      return;
    }

    const exportWidth = Math.floor(logicalWidth * scale);
    const exportHeight = Math.floor(logicalHeight * scale);

    // Final safety check
    if (exportWidth > maxDimension || exportHeight > maxDimension) {
      console.error(
        "Export canvas dimensions exceed limits:",
        exportWidth,
        exportHeight
      );
      alert(
        `Canvas too large for export (${Math.round(exportWidth)}x${Math.round(
          exportHeight
        )}). Try reducing the zoom level.`
      );
      return;
    }

    // Caption text and colour key come from lib/networkExport.js so the PNG
    // and the SVG cannot disagree. Both throw until that module lands, so
    // both are optional and the band is simply skipped without them.
    const caption = tryExportCall("buildCaption", () => buildCaption(exportMeta));
    const legend = tryExportCall(
      "buildLegend",
      () => buildLegend(graphData, colorMode),
      []
    );
    const captionLineCount = caption
      ? 1 +
        [caption.subtitle, ...(caption.lines || []), caption.caveat].filter(
          Boolean
        ).length
      : 0;
    const wantedCaptionHeight = caption
      ? Math.round((70 + captionLineCount * 23) * scale)
      : 0;
    // Never let the caption push the image past what the browser will encode.
    const captionHeight =
      exportHeight + wantedCaptionHeight <= maxDimension
        ? wantedCaptionHeight
        : 0;

    // Create a high-resolution canvas with white background
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = exportWidth;
    exportCanvas.height = exportHeight + captionHeight;

    if (exportCanvas.width === 0 || exportCanvas.height === 0) {
      console.error("Export canvas has invalid dimensions");
      return;
    }

    console.log(
      `Exporting at ${exportWidth}x${exportHeight} (scale: ${scale}x)`
    );

    const exportCtx = exportCanvas.getContext("2d");

    if (!exportCtx) {
      console.error("Failed to get 2d context");
      return;
    }

    // Enable high-quality rendering
    exportCtx.imageSmoothingEnabled = true;
    exportCtx.imageSmoothingQuality = "high";

    // Fill with white background
    exportCtx.fillStyle = "#ffffff";
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Apply transforms: scale to high resolution first, then apply view transform
    const t = transformRef.current;
    exportCtx.save();

    // Scale to high resolution coordinate system first
    exportCtx.scale(scale, scale);

    // Then apply the view transform (same values as original rendering)
    // After scaling the context, translate and scale transforms apply in the scaled space
    exportCtx.translate(t.x, t.y);
    exportCtx.scale(t.k, t.k);

    // Same draw path as the screen, so an export cannot drift from the view.
    // The export context is scaled by `scale` rather than by the device pixel
    // ratio, so line widths go in undivided.
    drawScene(exportCtx, {
      graphData,
      links: drawnLinks,
      colorFor,
      selectedNode,
      widthMultiplier,
      dim,
      communities: communityOverlay,
      viewScale: t.k,
      lineWidthDivisor: 1,
      baseEdgeAlpha: 0.3,
    });

    exportCtx.restore();

    // Caption band, if lib/networkExport.js can supply the text. It throws
    // until that module is implemented, and a print without a caption still
    // beats no print at all.
    if (captionHeight > 0 && caption) {
      exportCtx.save();
      exportCtx.translate(0, exportHeight);
      drawCaptionBand(exportCtx, {
        caption,
        legend,
        width: exportWidth,
        height: captionHeight,
        scale,
      });
      exportCtx.restore();
    }

    // Verify we actually drew something by sampling multiple regions (corners + center)
    const sampleSize = 200;
    const positions = [
      { x: 0, y: 0 },
      { x: exportCanvas.width - sampleSize, y: 0 },
      { x: 0, y: exportCanvas.height - sampleSize },
      {
        x: exportCanvas.width - sampleSize,
        y: exportCanvas.height - sampleSize,
      },
      {
        x: Math.max(0, Math.floor((exportCanvas.width - sampleSize) / 2)),
        y: Math.max(0, Math.floor((exportCanvas.height - sampleSize) / 2)),
      },
    ];
    const clampedSize = Math.max(
      1,
      Math.min(sampleSize, exportCanvas.width, exportCanvas.height)
    );

    let hasContent = false;
    for (const pos of positions) {
      const sampleX = Math.max(
        0,
        Math.min(exportCanvas.width - clampedSize, pos.x)
      );
      const sampleY = Math.max(
        0,
        Math.min(exportCanvas.height - clampedSize, pos.y)
      );

      try {
        const imageData = exportCtx.getImageData(
          sampleX,
          sampleY,
          clampedSize,
          clampedSize
        );
        for (let i = 0; i < imageData.data.length; i += 4) {
          if (
            imageData.data[i] < 250 ||
            imageData.data[i + 1] < 250 ||
            imageData.data[i + 2] < 250
          ) {
            hasContent = true;
            break;
          }
        }
      } catch (err) {
        console.warn("Failed to sample export canvas content:", err);
        hasContent = true; // Avoid false negatives if sampling fails
      }

      if (hasContent) break;
    }

    if (!hasContent) {
      console.error("Export canvas appears to be empty - no content detected");
      alert(
        "Failed to export: The canvas appears to be empty. Please try again."
      );
      return;
    }

    // Convert to PNG data URL with better error handling
    let dataURL;
    try {
      dataURL = exportCanvas.toDataURL("image/png", 1.0); // Maximum quality
      if (!dataURL || dataURL === "data:," || dataURL.length < 100) {
        throw new Error("Invalid data URL generated");
      }
    } catch (error) {
      console.error("Error generating data URL:", error);
      console.error(
        "Canvas dimensions:",
        exportCanvas.width,
        "x",
        exportCanvas.height
      );
      console.error("Scale used:", scale);

      // Try with a smaller canvas as fallback
      const fallbackScale = Math.max(1, Math.floor(scale / 2));
      if (fallbackScale < scale && fallbackScale >= 1) {
        console.log(`Retrying with reduced scale: ${fallbackScale}x`);
        const fallbackWidth = Math.floor(logicalWidth * fallbackScale);
        const fallbackHeight = Math.floor(logicalHeight * fallbackScale);

        try {
          const fallbackCanvas = document.createElement("canvas");
          fallbackCanvas.width = fallbackWidth;
          fallbackCanvas.height = fallbackHeight;
          const fallbackCtx = fallbackCanvas.getContext("2d");

          if (fallbackCtx) {
            fallbackCtx.fillStyle = "#ffffff";
            fallbackCtx.fillRect(0, 0, fallbackWidth, fallbackHeight);
            fallbackCtx.drawImage(canvas, 0, 0, fallbackWidth, fallbackHeight);
            dataURL = fallbackCanvas.toDataURL("image/png", 1.0);

            if (dataURL && dataURL !== "data:," && dataURL.length > 100) {
              console.log(
                `Successfully exported at reduced scale ${fallbackScale}x`
              );
            } else {
              throw new Error("Fallback also failed");
            }
          } else {
            throw new Error("Could not create fallback canvas");
          }
        } catch (fallbackError) {
          console.error("Fallback export also failed:", fallbackError);
          alert(
            `Failed to export: Canvas too large (${exportCanvas.width}x${exportCanvas.height}). Try reducing the zoom level or browser window size.`
          );
          return;
        }
      } else {
        alert(
          `Failed to export: Could not generate image data. Canvas size: ${exportCanvas.width}x${exportCanvas.height}. Try reducing the zoom level.`
        );
        return;
      }
    }

    const filename = buildExportFilename("png");

    // Create a temporary link element to trigger download
    const link = document.createElement("a");
    link.download = filename;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div ref={containerRef} className="network-canvas-container">
      <div className="network-zoom-controls">
        <button
          className="network-zoom-button"
          onClick={handleZoomIn}
          title="Zoom In (or use mouse wheel)"
          aria-label="Zoom In"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="11" y1="8" x2="11" y2="14"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </button>
        <button
          className="network-zoom-button"
          onClick={handleZoomOut}
          title="Zoom Out"
          aria-label="Zoom Out"
          disabled={isAtMinZoom}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </button>
        <button
          className="network-zoom-button"
          onClick={handleResetZoom}
          title="Reset Zoom (or double-click)"
          aria-label="Reset Zoom"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
            <path d="M21 3v5h-5"></path>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
            <path d="M3 21v-5h5"></path>
          </svg>
        </button>
        <button
          className="network-zoom-button"
          onClick={() => setShowDisplayPanel((open) => !open)}
          title="Display settings (colour, edge cutoff, width, dim)"
          aria-label="Display settings"
          aria-expanded={showDisplayPanel}
          aria-pressed={showDisplayPanel}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="4" y1="21" x2="4" y2="14"></line>
            <line x1="4" y1="10" x2="4" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12" y2="3"></line>
            <line x1="20" y1="21" x2="20" y2="16"></line>
            <line x1="20" y1="12" x2="20" y2="3"></line>
            <line x1="1" y1="14" x2="7" y2="14"></line>
            <line x1="9" y1="8" x2="15" y2="8"></line>
            <line x1="17" y1="16" x2="23" y2="16"></line>
          </svg>
        </button>
        <button
          className="network-zoom-button"
          onClick={handleExportPNG}
          title="Export Network as PNG"
          aria-label="Export Network as PNG"
          disabled={!graphData || !canvasReady}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
        {!svgExportBroken && (
          <button
            className="network-zoom-button"
            onClick={handleExportSVG}
            title="Export Network as SVG (vector, for print)"
            aria-label="Export Network as SVG"
            disabled={!graphData || !canvasReady}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <polyline points="10 12 8 14 10 16"></polyline>
              <polyline points="14 12 16 14 14 16"></polyline>
            </svg>
          </button>
        )}
        {!statsExportBroken && (
          <button
            className="network-zoom-button"
            onClick={handleExportStatsSheet}
            title="Export the figures as a sheet to hang beside the print"
            aria-label="Export statistics sheet as SVG"
            disabled={!graphData || !canvasReady}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="8" y1="13" x2="16" y2="13"></line>
              <line x1="8" y1="17" x2="13" y2="17"></line>
            </svg>
          </button>
        )}
      </div>
      {showDisplayPanel && (
        <div
          className="canvas-display-panel"
          role="group"
          aria-label="Display settings"
        >
          <div className="canvas-display-section">
            <span className="canvas-display-label" id="canvas-colour-label">
              Colour by
            </span>
            <div
              className="canvas-display-modes"
              role="group"
              aria-labelledby="canvas-colour-label"
            >
              {COLOR_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className="canvas-display-mode"
                  aria-pressed={colorMode === mode.id}
                  onClick={() => updateSettings({ colorMode: mode.id })}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {colorMode === "loyalty" ? (
              <div style={{ marginTop: "8px" }}>
                <div className="canvas-display-gradient" />
                <div className="canvas-display-gradient-labels">
                  <span>
                    {loyaltyRange
                      ? `${Math.round(loyaltyRange.min * 100)}%`
                      : "less"}
                  </span>
                  <span>agreement with own group</span>
                  <span>
                    {loyaltyRange
                      ? `${Math.round(loyaltyRange.max * 100)}%`
                      : "more"}
                  </span>
                </div>
              </div>
            ) : (
              legendEntries.length > 0 && (
                <ul
                  className="canvas-display-legend"
                  style={{ marginTop: "8px" }}
                >
                  {legendEntries.map((entry) => (
                    <li
                      className="canvas-display-legend-item"
                      key={entry.key}
                      title={entry.label}
                    >
                      <span
                        className="canvas-display-swatch"
                        style={{ background: entry.color }}
                        aria-hidden="true"
                      />
                      <span>{entry.label}</span>
                      <span className="canvas-display-legend-count">
                        {entry.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>

          <div className="canvas-display-section">
            <span className="canvas-display-label" id="canvas-communities-label">
              Communities
            </span>
            <div
              className="canvas-display-modes"
              role="group"
              aria-labelledby="canvas-communities-label"
            >
              <button
                type="button"
                className="canvas-display-mode"
                aria-pressed={!showCommunities}
                onClick={() => updateSettings({ communities: false })}
              >
                Off
              </button>
              <button
                type="button"
                className="canvas-display-mode"
                aria-pressed={showCommunities}
                onClick={() => updateSettings({ communities: true })}
              >
                Outline
              </button>
            </div>
            {showCommunities && (
              <div className="canvas-display-readout">{communityReadout}</div>
            )}
            <p className="canvas-display-note">
              Louvain community detection over the votes alone — the seating
              plan is not an input. Every MEP has voted with every other, so the
              graph is complete and has nothing to separate until each MEP is
              cut back to their{communityData ? ` ${communityData.k}` : ""}{" "}
              strongest partners; these outlines are what survives that. Hover
              one to see who is inside it.
            </p>
          </div>

          <div className="canvas-display-section">
            <label className="canvas-display-label" htmlFor="canvas-edge-cutoff">
              Edge cutoff
            </label>
            <input
              id="canvas-edge-cutoff"
              className="canvas-display-slider"
              type="range"
              min="1"
              max="100"
              step="1"
              value={edgePercentile}
              aria-describedby="canvas-edge-cutoff-readout"
              onChange={(event) =>
                updateSettings({ edgePercentile: Number(event.target.value) })
              }
            />
            <div
              className="canvas-display-readout"
              id="canvas-edge-cutoff-readout"
            >
              densest {edgePercentile}% · {drawnLinks.length.toLocaleString()}{" "}
              edges
            </div>
          </div>

          <div className="canvas-display-section">
            <label className="canvas-display-label" htmlFor="canvas-edge-width">
              Edge width
            </label>
            <input
              id="canvas-edge-width"
              className="canvas-display-slider"
              type="range"
              min="0.2"
              max="4"
              step="0.1"
              value={widthMultiplier}
              aria-describedby="canvas-edge-width-readout"
              onChange={(event) =>
                updateSettings({ edgeWidth: Number(event.target.value) })
              }
            />
            <div
              className="canvas-display-readout"
              id="canvas-edge-width-readout"
            >
              width ×{Number(widthMultiplier).toFixed(1)} · thickest lines are
              the closest voters
            </div>
          </div>

          <div className="canvas-display-section">
            <span className="canvas-display-label" id="canvas-dim-label">
              Dim everything except
            </span>
            <div
              className="canvas-display-row"
              role="group"
              aria-labelledby="canvas-dim-label"
            >
              <select
                className="canvas-display-select"
                style={{ flex: "0 0 84px" }}
                aria-label="Dim by"
                value={activeDimKind}
                onChange={(event) => {
                  // A group id means nothing as a country, so switching the
                  // kind drops whatever was selected.
                  setDimKind(event.target.value);
                  if (dim) updateSettings({ dim: null });
                }}
              >
                <option value="group">Group</option>
                <option value="country">Country</option>
              </select>
              <select
                className="canvas-display-select"
                aria-label="Dim subject"
                value={dim?.value || ""}
                onChange={(event) =>
                  updateSettings({
                    dim: event.target.value
                      ? { type: activeDimKind, value: event.target.value }
                      : null,
                  })
                }
              >
                <option value="">Nothing dimmed</option>
                {(activeDimKind === "country"
                  ? presentCountries
                  : presentGroups
                ).map((option) => (
                  <option key={option.id} value={option.id}>
                    {`${option.label || option.id} (${option.count})`}
                  </option>
                ))}
              </select>
            </div>
            <p className="canvas-display-note">
              Positions never change — dimming only fades what is not the
              subject.
            </p>
            <button
              type="button"
              className="canvas-display-clear"
              onClick={() => updateSettings({ dim: null })}
              disabled={!dim}
            >
              Clear dim
            </button>
          </div>

          {svgExportBroken && (
            <div className="canvas-display-section">
              <p className="canvas-display-note">
                Vector export is unavailable in this build. PNG export still
                works and follows these settings.
              </p>
            </div>
          )}
        </div>
      )}
      <CommunityTooltip
        shape={focusedCommunity}
        position={hoveredCommunity}
        mandate={mandate}
      />
      <div
        className="network-canvas-tip"
        title="Click on nodes in the network to explore individual MEPs, or click on groups in the heatmaps"
      >
        💡 Tip: Click MEP nodes or group names to explore more
      </div>
      {!graphData && (
        <div className="network-canvas-empty">
          <div className="network-canvas-empty-content">
            <div className="network-canvas-empty-icon">🌐</div>
            <h3>Network Visualization</h3>
            <p>Loading network data...</p>
            <p className="network-canvas-empty-hint">
              Once loaded, you can click on nodes to explore MEPs and their
              connections
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
