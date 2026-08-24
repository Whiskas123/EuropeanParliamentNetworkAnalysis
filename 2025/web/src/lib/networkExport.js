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
 */

/**
 * The network as a standalone SVG document.
 *
 * @param {Object} options
 * @param {Object} options.graphData - nodes, links, allLinks, nodeMap
 * @param {Object} options.renderSettings - {edgePercentile, edgeWidth, colorMode, dim}
 * @param {Object} options.meta - {mandate, country, subject, nodeCount, votingSessions}
 * @returns {string} a complete <svg> document
 */
export function exportNetworkSVG() {
  throw new Error("exportNetworkSVG not implemented yet");
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
export function exportStatsSheetSVG() {
  throw new Error("exportStatsSheetSVG not implemented yet");
}

/**
 * The caption drawn into an export: term, filters, counts, and the
 * participation caveat. Shared so the PNG and SVG paths cannot disagree.
 *
 * @param {Object} meta
 * @returns {{title: string, subtitle: string, lines: string[], caveat: string}}
 */
export function buildCaption() {
  throw new Error("buildCaption not implemented yet");
}

/**
 * Group colour key for the legend, as drawn in both export paths.
 *
 * @param {Object} graphData
 * @param {string} colorMode
 * @returns {Array<{label: string, color: string}>}
 */
export function buildLegend() {
  throw new Error("buildLegend not implemented yet");
}

/** Trigger a download of an SVG string. */
export function downloadSVG() {
  throw new Error("downloadSVG not implemented yet");
}
