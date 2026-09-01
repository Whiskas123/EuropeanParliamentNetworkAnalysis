// The project mark: the twelve stars of the flag, joined into a ring by
// network edges — a constellation. Geometry is the original from the
// visualization header, kept exactly; only the gold was harmonised to the
// EU yellow used everywhere else in the identity (#FFD700 -> #FFCC00).
//
// The point positions and the star outline now live in lib/constellation.js,
// so the SVG export can draw the same mark for a printed panel without
// importing a component. Nothing about what is drawn here changed.

import {
  CONSTELLATION_BOX,
  CONSTELLATION_POINTS as POINTS,
  starPath,
} from "../lib/constellation.js";

export default function ConstellationMark({
  size = 200,
  color = "#FFCC00",
  className,
  title,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${CONSTELLATION_BOX} ${CONSTELLATION_BOX}`}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {POINTS.map((p, i) => {
        const next = POINTS[(i + 1) % 12];
        return (
          <line
            key={`e${i}`}
            x1={p.x}
            y1={p.y}
            x2={next.x}
            y2={next.y}
            stroke={color}
            strokeWidth="1.5"
            opacity="0.4"
          />
        );
      })}
      {POINTS.map((p, i) => (
        <g key={`n${i}`}>
          <circle cx={p.x} cy={p.y} r="6" fill={color} />
          <path d={starPath(p.x, p.y)} fill={color} opacity="0.9" />
        </g>
      ))}
    </svg>
  );
}
