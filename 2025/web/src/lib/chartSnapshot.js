/**
 * Take a chart that is already on screen and hand back a standalone SVG file.
 *
 * The sheet exporters in networkExport.js redraw a panel from its data, on a
 * page with a caption and a legend, which is the right thing for a printed
 * artefact and the wrong thing when what you want is *this chart, as it looks
 * right now*. They also have to be written once per form: the partners panel
 * grew from one form to seven and the exporter still drew the first of them,
 * so choosing any other form and exporting produced either the wrong chart or
 * no file at all.
 *
 * This takes the other route and copies the live node. It cannot go stale
 * against a form it has never heard of, because it does not know about forms:
 * every chart in the sidebar is an `<svg>`, so every chart can be saved,
 * including ones not yet written.
 *
 * **Why the styles have to be copied.** The charts in this app carry almost no
 * presentation attributes. Font sizes, fills, weights and hairlines come from
 * the stylesheet, matched on class — which is the right way to build them and
 * means `outerHTML` on its own is a black Times drawing on a transparent
 * ground. So each node's *computed* value for the properties SVG renders from
 * is written onto the node itself, and the class is dropped. What comes out
 * depends on no stylesheet at all, which is the whole point of a file you are
 * about to open somewhere else.
 */

/** The properties an SVG actually renders from, and that our CSS supplies. */
const CARRIED = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant-numeric",
  "letter-spacing",
  "paint-order",
  "text-anchor",
  "dominant-baseline",
];

/**
 * Replace every `marker-end` with the arrowhead drawn as ordinary geometry.
 *
 * Markers are the standard way to put a head on a stroke and are drawn
 * correctly by every browser, which is why this went unnoticed: the file opens
 * perfectly outside the app. Figma does not implement them. It reads the file,
 * draws the strokes, and silently discards every arrowhead — so the Track and
 * Shift forms arrive with no direction on them at all, which on charts whose
 * whole subject is which way a pair moved is the one thing they cannot lose.
 *
 * The marker is not redrawn from guessed numbers. Its own definition is read
 * out of the document — viewBox, refX/refY, markerWidth/Height, markerUnits —
 * and its children are copied into a group carrying the transform the renderer
 * would have applied: to the end of the stroke, rotated to the tangent there,
 * scaled by the marker's own scale times the stroke width. If the arrowhead
 * shape is ever changed, this follows it.
 *
 * Direction comes from `getPointAtLength` a little back from the end, which is
 * why it is measured on the live node: geometry needs a rendered element, and
 * it gives the true tangent of a curve rather than the chord of its last
 * segment.
 *
 * @param {SVGElement} source - the chart in the page, for measuring
 * @param {SVGElement} clone - the copy being written out
 */
function bakeMarkers(source, clone) {
  const owner = source.ownerDocument;
  const sourceNodes = [source, ...source.querySelectorAll("*")];
  const cloneNodes = [clone, ...clone.querySelectorAll("*")];

  sourceNodes.forEach((from, i) => {
    const to = cloneNodes[i];
    if (!to) return;
    const ref = from.getAttribute("marker-end");
    if (!ref) return;
    to.removeAttribute("marker-end");

    const markerId = /url\(["']?#([^"')]+)/.exec(ref);
    const marker = markerId && owner.getElementById(markerId[1]);
    if (!marker || typeof from.getTotalLength !== "function") return;

    const length = from.getTotalLength();
    if (!(length > 0)) return;
    const tip = from.getPointAtLength(length);
    // Far enough back to have a direction, close enough to be the tangent.
    const back = from.getPointAtLength(Math.max(0, length - 0.5));
    const angle = (Math.atan2(tip.y - back.y, tip.x - back.x) * 180) / Math.PI;

    const view = (marker.getAttribute("viewBox") || "0 0 10 10").trim().split(/[\s,]+/).map(Number);
    const viewW = view[2] || 10;
    const markerW = parseFloat(marker.getAttribute("markerWidth") || "3");
    const refX = parseFloat(marker.getAttribute("refX") || "0");
    const refY = parseFloat(marker.getAttribute("refY") || "0");
    // markerUnits defaults to strokeWidth, which is what makes an arrowhead
    // grow with the line it sits on.
    const perStroke = (marker.getAttribute("markerUnits") || "strokeWidth") !== "userSpaceOnUse";
    const stroke = parseFloat(window.getComputedStyle(from).strokeWidth) || 1;
    const scale = (markerW / viewW) * (perStroke ? stroke : 1);

    const group = owner.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute(
      "transform",
      `translate(${tip.x.toFixed(2)} ${tip.y.toFixed(2)}) rotate(${angle.toFixed(2)}) ` +
        `scale(${scale.toFixed(4)}) translate(${-refX} ${-refY})`
    );
    Array.from(marker.children).forEach((child) => {
      group.appendChild(child.cloneNode(true));
    });
    to.parentNode.insertBefore(group, to.nextSibling);
  });

  // Nothing points at them now, and a <defs> full of markers is exactly what
  // an importer that does not understand markers will trip over.
  clone.querySelectorAll("defs").forEach((defs) => defs.remove());
}

/**
 * Split every haloed label into the halo and the label.
 *
 * Small figures in this sidebar sit on tinted cells and on the lines they
 * describe, and stay readable by being drawn with a fat white stroke *under*
 * the glyphs — `paint-order: stroke`, which reverses SVG's default of painting
 * the stroke last. Editors that do not implement paint-order fall back to that
 * default and paint the white over the digits, turning every such number into
 * a white smudge. It is a worse failure than the arrowheads: those go missing,
 * where this looks like the file is corrupt.
 *
 * So the effect is expressed as two elements instead of a property: a copy
 * behind, filled and stroked in the halo colour, carrying the shape of the
 * outline, and the original in front with no stroke at all. That is the same
 * drawing by construction, and it needs nothing of the renderer but the
 * painter's algorithm.
 *
 * @param {SVGElement} clone - the copy being written out
 */
function bakeTextHalos(clone) {
  clone.querySelectorAll("text").forEach((label) => {
    const order = label.getAttribute("paint-order") || "";
    const stroke = label.getAttribute("stroke");
    const width = parseFloat(label.getAttribute("stroke-width") || "0");
    label.removeAttribute("paint-order");
    if (!order.includes("stroke") || !stroke || stroke === "none" || !(width > 0)) {
      return;
    }
    const halo = label.cloneNode(true);
    halo.setAttribute("fill", stroke);
    halo.removeAttribute("paint-order");
    // Nothing should read it twice.
    halo.setAttribute("aria-hidden", "true");
    label.removeAttribute("stroke");
    label.removeAttribute("stroke-width");
    label.removeAttribute("stroke-linejoin");
    label.parentNode.insertBefore(halo, label);
  });

  // The property has to be carried this far to be detected at all, but once
  // the halos are geometry nothing needs it. `normal` is the default on every
  // other element, so writing it out is noise an importer could only misread.
  [clone, ...clone.querySelectorAll("*")].forEach((el) => {
    if (el.getAttribute && el.getAttribute("paint-order") === "normal") {
      el.removeAttribute("paint-order");
    }
  });
}

/**
 * A live `<svg>` as a self-contained document.
 *
 * @param {SVGElement} node - the chart on screen
 * @param {Object} [options]
 * @param {string} [options.title] - names the drawing for a screen reader
 * @param {string} [options.background] - paper colour, or null to leave it clear
 * @returns {string} a complete SVG document
 */
export function snapshotSVG(node, { title = null, background = "#ffffff" } = {}) {
  if (!node || typeof window === "undefined") {
    throw new Error("snapshotSVG needs a rendered chart");
  }
  const box = node.getBoundingClientRect();
  const width = Math.round(box.width);
  const height = Math.round(box.height);
  const clone = node.cloneNode(true);

  // Walked in parallel: the clone has no layout of its own, so the computed
  // values have to be read off the original in the same order.
  const source = [node, ...node.querySelectorAll("*")];
  const copy = [clone, ...clone.querySelectorAll("*")];
  source.forEach((from, i) => {
    const to = copy[i];
    if (!to || to.nodeName === "title") return;
    const style = window.getComputedStyle(from);

    // text-transform is a CSS effect over glyphs that are still lower case in
    // the markup. Nothing outside a browser with our stylesheet will apply it,
    // so it is baked into the text instead.
    if (to.nodeName === "text" && style.textTransform === "uppercase") {
      to.textContent = to.textContent.toUpperCase();
    }

    CARRIED.forEach((prop) => {
      const value = style.getPropertyValue(prop);
      if (!value) return;
      // `fill: none` is meaningful and must survive; every other "none" is a
      // default worth leaving off the file.
      if (value === "none" && prop !== "fill") return;
      to.setAttribute(prop, value);
    });
    to.removeAttribute("class");
  });

  // Both after the styles: each turns a CSS-only effect into geometry, and can
  // only do so once the computed values are on the elements themselves.
  bakeMarkers(node, clone);
  bakeTextHalos(clone);

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("viewBox", `0 0 ${width} ${height}`);

  if (background) {
    // Behind everything, so the drawing is not transparent wherever it lands.
    const paper = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    paper.setAttribute("x", "0");
    paper.setAttribute("y", "0");
    paper.setAttribute("width", String(width));
    paper.setAttribute("height", String(height));
    paper.setAttribute("fill", background);
    clone.insertBefore(paper, clone.firstChild);
  }

  if (title) {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "title");
    label.textContent = title;
    clone.insertBefore(label, clone.firstChild);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}\n`;
}

/** A filename that says what the drawing is, without spaces or punctuation. */
export function snapshotName(...parts) {
  const stem = parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${stem || "chart"}.svg`;
}
