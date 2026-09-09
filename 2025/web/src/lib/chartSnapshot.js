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
