// The project mark: the twelve stars of the flag, joined into a ring by
// network edges — a constellation. Geometry is the original from the
// visualization header, kept exactly; only the gold was harmonised to the
// EU yellow used everywhere else in the identity (#FFD700 -> #FFCC00).

const RADIUS = 70;
const CENTRE = 100;

// Precomputed so the server and client render byte-identical markup.
const POINTS = Array.from({ length: 12 }, (_, i) => {
  const angle = ((i * 30 - 90) * Math.PI) / 180;
  return {
    x: Math.round((CENTRE + RADIUS * Math.cos(angle)) * 100) / 100,
    y: Math.round((CENTRE + RADIUS * Math.sin(angle)) * 100) / 100,
  };
});

// A small five-pointed star centred on (cx, cy), as in the original mark.
function starPath(cx, cy) {
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
      viewBox="0 0 200 200"
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
