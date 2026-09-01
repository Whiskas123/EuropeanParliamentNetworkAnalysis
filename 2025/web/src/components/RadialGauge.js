"use client";

import DeltaBadge from "./DeltaBadge";
import { useHoverFocus } from "../lib/hoverFocus.js";
import "../styles/radial.scss";

/**
 * A cohesion figure as a ring with the number inside it.
 *
 * These replace the full-width bar rows the sidebar used to stack. A bar row
 * costs about 48px of height and carries one figure, so twenty-seven countries
 * came to thirteen hundred pixels of scrolling. Four rings fit on a line.
 *
 * ## Why the ring usually starts at 50% and not at zero
 *
 * How much a bloc agrees with *itself* — a political group's cohesion, a
 * national delegation's — lands between 56.8% and 97.4% across all five terms.
 * Drawn 0-100% those arcs are all between three-quarters and full and no two
 * are tellable apart: the ring would be decoration and the number would do all
 * the work.
 *
 * Cropping a scale is normally a lie, and it is not one here only because 50%
 * is a real floor rather than a convenient one: below it a pair of MEPs
 * disagrees more often than it agrees, which is where "they vote together"
 * stops being true at all. So the ring reads as "how far above a coin flip",
 * the sweep doubles, and the honest absolute value is printed in the middle
 * where it cannot be misread.
 *
 * That reasoning does not survive contact with agreement *between* two
 * different blocs, which genuinely runs from 16.3% to 98.5% — 28% of every
 * MEP-to-group figure in the dataset sits under 50%. Cropping there would
 * blank better than a quarter of the dials. So the floor is a property of the
 * measure and callers set it: `floor={0}` wherever the two sides are different
 * things, the 50% default wherever a bloc is measured against itself.
 *
 * A figure that still falls under its floor is drawn as an off-scale ring —
 * dotted track, muted number — rather than an empty one, so it can never be
 * mistaken for missing data.
 *
 * ## Why the arc has square ends
 *
 * A round cap extends an arc by half its stroke at each end. That is harmless
 * on its own, but not beside the baseline notch: it would push every arc about
 * six degrees past the value it stands for and make every dial look as though
 * it had risen. The notch exists to be read against the end of the arc, so the
 * end of the arc has to be where the number says it is.
 */

// The ring in viewBox units. A 4-unit stroke inside a 44-unit box leaves a
// 2-unit margin, so nothing clips when the SVG is scaled down to 52px.
const BOX = 44;
const CENTRE = BOX / 2;
const RADIUS = 18;
const STROKE = 4;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Where a self-cohesion ring's empty end sits. See the note above. */
export const RADIAL_FLOOR = 0.5;

/** A score on [0,1] as a fraction of the ring, clamped to the drawable range. */
function sweep(value, floor) {
  if (typeof value !== "number" || !isFinite(value)) return null;
  const fraction = (value - floor) / (1 - floor);
  return Math.max(0, Math.min(1, fraction));
}

/**
 * A radial tick at `fraction` around the ring, as two endpoints.
 *
 * Measured from three o'clock, which is where SVG puts an angle of zero and
 * where a dashed circle starts drawing. The -90 that moves both to twelve
 * o'clock is applied once, by the group these are rendered into — subtracting
 * it here as well would put every notch a quarter-turn behind its own arc.
 */
function tickLine(fraction) {
  const radians = fraction * 360 * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const inner = RADIUS - STROKE / 2 - 1.6;
  const outer = RADIUS + STROKE / 2 + 1.6;
  return {
    x1: CENTRE + cos * inner,
    y1: CENTRE + sin * inner,
    x2: CENTRE + cos * outer,
    y2: CENTRE + sin * outer,
  };
}

/**
 * @param {number} value           the figure, on [0, 1]
 * @param {number} [baseline]      the same figure with one filter removed
 * @param {string} color           the entity's colour — a group's own, or one
 *                                 slate hue where it has no colour of its own
 * @param {node}   label           what the dial is, under the ring
 * @param {node}   [flag]          rendered before the label (country flags)
 * @param {string} [title]         full hover text, since labels get truncated
 * @param {string} [baselineLabel] what the delta badge is measured against
 * @param {node}   [sub]           a sample size, shown under the delta
 * @param {func}   [onClick]       makes the whole cell a button
 * @param {Object[]} [hover]       who on the network this dial is about, as
 *                                 hover-focus selectors: pointing at the dial
 *                                 dims everyone else. See lib/hoverFocus.js.
 */
export default function RadialGauge({
  value,
  baseline = null,
  color = "#6B7C93",
  label,
  flag = null,
  title,
  baselineLabel = "",
  sub = null,
  onClick = null,
  disabled = false,
  floor = RADIAL_FLOOR,
  hover = null,
}) {
  const focus = useHoverFocus();
  const focusProps = hover && hover.length ? focus.on(hover) : null;
  const fraction = sweep(value, floor);
  const baselineFraction = sweep(baseline, floor);
  const hasValue = fraction !== null;
  const percent = hasValue ? (value * 100).toFixed(1) : "—";
  // Under its own floor the arc has nowhere to go, so the ring says so rather
  // than sitting empty and reading as an absent figure.
  const underFloor = hasValue && value < floor;

  // A notch at either extreme of the ring sits underneath the arc's own
  // endpoint and reads as part of it rather than as a reference, so it is
  // dropped there.
  const showTick =
    baselineFraction !== null &&
    baselineFraction > 0.01 &&
    baselineFraction < 0.99;
  const tick = showTick ? tickLine(baselineFraction) : null;

  const dial = (
    <>
      <span
        className={`radial-dial ${underFloor ? "radial-dial--underfloor" : ""}`}
      >
        <svg
          className="radial-svg"
          viewBox={`0 0 ${BOX} ${BOX}`}
          role="img"
          aria-label={`${
            typeof label === "string" ? `${label}: ` : ""
          }${percent} per cent${
            underFloor ? `, below the ${floor * 100}% floor of this scale` : ""
          }`}
        >
          <g transform={`rotate(-90 ${CENTRE} ${CENTRE})`}>
            <circle
              className="radial-track"
              cx={CENTRE}
              cy={CENTRE}
              r={RADIUS}
              strokeWidth={STROKE}
            />
            {hasValue && fraction > 0 && (
              <circle
                className="radial-arc"
                cx={CENTRE}
                cy={CENTRE}
                r={RADIUS}
                stroke={color}
                strokeWidth={STROKE}
                strokeLinecap="butt"
                strokeDasharray={`${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              />
            )}
            {tick && (
              <>
                {/* A halo first, so the notch reads over the arc and over the
                    bare track alike without having to know which it lands on. */}
                <line
                  className="radial-tick-halo"
                  x1={tick.x1}
                  y1={tick.y1}
                  x2={tick.x2}
                  y2={tick.y2}
                />
                <line
                  className="radial-tick"
                  x1={tick.x1}
                  y1={tick.y1}
                  x2={tick.x2}
                  y2={tick.y2}
                />
              </>
            )}
          </g>
        </svg>
        {/* Two nested spans so the "%" can sit on the number's baseline while
            the pair as a whole stays centred in the ring. Aligned to the box
            instead, the "%" climbs to the top of it and reads as a stray mark
            on the arc. */}
        <span className="radial-figure">
          <span className="radial-figure-inner">
            {percent}
            <span className="radial-figure-unit">%</span>
          </span>
        </span>
      </span>

      <span className="radial-label" title={title}>
        {flag ? <span className="radial-flag">{flag}</span> : null}
        <span className="radial-label-text">{label}</span>
      </span>

      {baseline !== null && baseline !== undefined ? (
        <span className="radial-delta">
          <DeltaBadge
            score={value}
            baseline={baseline}
            label={baselineLabel}
          />
        </span>
      ) : null}

      {sub ? <span className="radial-sub">{sub}</span> : null}
    </>
  );

  if (onClick && !disabled) {
    return (
      <button
        type="button"
        className="radial radial--clickable"
        onClick={onClick}
        title={title}
        {...focusProps}
      >
        {dial}
      </button>
    );
  }

  return (
    <div
      className={`radial ${focusProps ? "radial--focusable" : ""}`}
      {...focusProps}
    >
      {dial}
    </div>
  );
}

/**
 * The grid the dials sit in.
 *
 * Four to a row, fixed, rather than as many as fit. Sized-to-fit columns made
 * every grid a different width — countries came out five to a row, policy areas
 * three — and the last row of each was left with a ragged gap wherever the
 * count did not divide. A fixed count is one rhythm down the whole sidebar and
 * predictable rows to read across.
 *
 * `columns` is here for a caller that genuinely cannot live with four; nothing
 * currently overrides it.
 */
export function RadialGrid({ columns = 4, children, className = "" }) {
  return (
    <div
      className={`radial-grid ${className}`}
      style={{ "--radial-columns": columns }}
    >
      {children}
    </div>
  );
}


