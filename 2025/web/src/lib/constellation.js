/**
 * The project mark's geometry, as plain numbers.
 *
 * Split out of ConstellationMark.js so the SVG export can draw the same mark
 * without importing a React component. The component still owns how the mark
 * is *presented* — size, colour, accessible name; this file owns only where
 * the twelve stars are, which is the part that must not drift between the
 * screen and a printed panel.
 */

const RADIUS = 70;
const CENTRE = 100;

/** The box the mark is drawn in. Both consumers use it as their viewBox. */
export const CONSTELLATION_BOX = 200;

/**
 * Precomputed so the server and client render byte-identical markup, which is
 * why this is a module constant rather than a function of the box size.
 */
export const CONSTELLATION_POINTS = Array.from({ length: 12 }, (_, i) => {
  const angle = ((i * 30 - 90) * Math.PI) / 180;
  return {
    x: Math.round((CENTRE + RADIUS * Math.cos(angle)) * 100) / 100,
    y: Math.round((CENTRE + RADIUS * Math.sin(angle)) * 100) / 100,
  };
});

/** A small five-pointed star centred on (cx, cy), as in the original mark. */
export function starPath(cx, cy) {
  return [
    `M ${cx} ${cy - 4}`,
    `L ${cx + 1.2} ${cy - 1.2}`,
    `L ${cx + 4} ${cy - 1.2}`,
    `L ${cx + 1.8} ${cy + 1.2}`,
    `L ${cx + 2.4} ${cy + 4}`,
    `L ${cx} ${cy + 2.4}`,
    `L ${cx - 2.4} ${cy + 4}`,
    `L ${cx - 1.8} ${cy + 1.2}`,
    `L ${cx - 4} ${cy - 1.2}`,
    `L ${cx - 1.2} ${cy - 1.2}`,
    "Z",
  ].join(" ");
}
