"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { loadTrendSeries } from "../lib/trends.js";
import "../styles/trends.scss";

/**
 * Five terms of the Parliament on one chart.
 *
 * The site shows one term at a time, so its clearest single story is invisible:
 * groups have grown steadily more disciplined internally (85.6% to 92.4%) while
 * agreeing with each other less (59.1% to 53.2%), and national delegations have
 * fragmented alongside (76.0% to 69.6%). Reading that today means switching
 * mandates and holding five numbers in your head.
 *
 * The most dramatic series — the least-agreeing pair of groups, 43.5% down to
 * 18.2% — sits on its own beneath rather than in the main plot. Its range barely
 * overlaps the others, and forcing them onto a shared axis would flatten all
 * four. Two plots on one axis each beats one plot on two axes.
 */

/**
 * Line colours: slots 1-3 of the validated categorical palette, in fixed order.
 *
 * Deliberately not the political-group colours used everywhere else in the app.
 * These series are measures, not parties, and borrowing the group palette would
 * imply a party each line does not have.
 *
 * Each series also carries a dash pattern and a marker shape, so the chart still
 * separates when printed in greyscale — which is the point of the exercise here.
 */
const SERIES = [
  {
    key: "withinGroup",
    label: "Within group",
    short: "group",
    color: "#2a78d6",
    dash: "",
    marker: "circle",
    description: "Average agreement between members of the same political group",
  },
  {
    key: "withinCountry",
    label: "Within country",
    short: "country",
    color: "#eb6834",
    dash: "5 3",
    marker: "square",
    description: "Average agreement between MEPs from the same country",
  },
  {
    key: "crossGroup",
    label: "Between groups",
    short: "cross",
    color: "#1baf7a",
    dash: "1.5 3",
    marker: "triangle",
    description: "Average agreement between members of different groups",
  },
];

const CHART = { width: 336, height: 156, top: 12, right: 10, bottom: 26, left: 30 };
const SPARK = { width: 336, height: 62, top: 10, right: 10, bottom: 20, left: 30 };

const pct = (value) => `${(value * 100).toFixed(1)}%`;

function Marker({ shape, x, y, color, size = 3.6, filled = true }) {
  const common = {
    fill: filled ? color : "#ffffff",
    stroke: color,
    strokeWidth: 1.5,
  };
  if (shape === "square") {
    return (
      <rect x={x - size} y={y - size} width={size * 2} height={size * 2} {...common} />
    );
  }
  if (shape === "triangle") {
    const points = `${x},${y - size * 1.15} ${x + size},${y + size * 0.8} ${x - size},${y + size * 0.8}`;
    return <polygon points={points} {...common} />;
  }
  return <circle cx={x} cy={y} r={size} {...common} />;
}

export default function TrendsPanel({ mandate, onMandateChange }) {
  const [series, setSeries] = useState(null);
  const [status, setStatus] = useState("loading");
  const [hovered, setHovered] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  // The five precomputed networks are ~70 MB together, so this used to wait for
  // someone to expand the panel. The panel owns a tab now, and only the active
  // tab is mounted — so mounting *is* the request, and the fetch belongs in an
  // effect rather than in a toggle that no longer exists.
  useEffect(() => {
    let cancelled = false;
    loadTrendSeries()
      .then((rows) => {
        if (cancelled) return;
        setSeries(rows);
        setStatus(rows && rows.length > 0 ? "ready" : "empty");
      })
      .catch(() => {
        if (!cancelled) setStatus("empty");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const geometry = useMemo(() => {
    if (!series || series.length === 0) return null;

    const values = series.flatMap((row) =>
      SERIES.map((s) => row[s.key]).filter((v) => typeof v === "number")
    );
    if (values.length === 0) return null;

    const lo = values.reduce((min, v) => Math.min(min, v), Infinity);
    const hi = values.reduce((max, v) => Math.max(max, v), -Infinity);
    // A zero baseline would compress every line into one flat band near the top;
    // the whole story lives in the 53-93% range. The axis says so explicitly.
    const pad = Math.max((hi - lo) * 0.14, 0.02);
    const domain = [Math.max(0, lo - pad), Math.min(1, hi + pad)];

    const plotWidth = CHART.width - CHART.left - CHART.right;
    const plotHeight = CHART.height - CHART.top - CHART.bottom;
    const step = series.length > 1 ? plotWidth / (series.length - 1) : 0;
    const x = (i) => CHART.left + step * i;
    const y = (v) =>
      CHART.top +
      plotHeight * (1 - (v - domain[0]) / (domain[1] - domain[0] || 1));

    const lines = SERIES.map((s) => ({
      ...s,
      points: series
        .map((row, i) =>
          typeof row[s.key] === "number" ? { x: x(i), y: y(row[s.key]), value: row[s.key], i } : null
        )
        .filter(Boolean),
    }));

    // The lowest-agreeing pair, on its own scale beneath the main plot.
    const pairValues = series
      .map((row) => row.lowestPair?.score)
      .filter((v) => typeof v === "number");
    let spark = null;
    if (pairValues.length > 1) {
      const plo = pairValues.reduce((min, v) => Math.min(min, v), Infinity);
      const phi = pairValues.reduce((max, v) => Math.max(max, v), -Infinity);
      const ppad = Math.max((phi - plo) * 0.16, 0.02);
      const pdomain = [Math.max(0, plo - ppad), Math.min(1, phi + ppad)];
      const sw = SPARK.width - SPARK.left - SPARK.right;
      const sh = SPARK.height - SPARK.top - SPARK.bottom;
      const sstep = series.length > 1 ? sw / (series.length - 1) : 0;
      spark = {
        domain: pdomain,
        points: series
          .map((row, i) =>
            typeof row.lowestPair?.score === "number"
              ? {
                  x: SPARK.left + sstep * i,
                  y:
                    SPARK.top +
                    sh *
                      (1 -
                        (row.lowestPair.score - pdomain[0]) /
                          (pdomain[1] - pdomain[0] || 1)),
                  value: row.lowestPair.score,
                  pair: row.lowestPair,
                  i,
                }
              : null
          )
          .filter(Boolean),
      };
    }

    return { domain, x, y, lines, spark, step, plotHeight, plotWidth };
  }, [series]);

  const activeIndex =
    hovered !== null
      ? hovered
      : series
      ? series.findIndex((row) => row.mandate === mandate)
      : -1;

  const toPath = (points) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return (
    <div className="trends-panel">
      <h3 className="trends-title">Five terms compared</h3>

      <div>
        {status === "loading" && (
          <div className="trends-status">Reading five parliamentary terms…</div>
        )}
        {status === "empty" && (
          <div className="trends-status">
            The per-term networks needed for this comparison are not available.
          </div>
        )}

        {status === "ready" && geometry && (
          <>
            <p className="trends-description">
              Groups vote together more than they used to, and with each other
              less.
            </p>

            {/* Legend. Present for every multi-series chart, so identity is
                never carried by colour alone. */}
            <ul className="trends-legend">
              {SERIES.map((s) => (
                <li key={s.key} className="trends-legend-item" title={s.description}>
                  <svg width="14" height="10" aria-hidden="true">
                    <line
                      x1="0"
                      y1="5"
                      x2="14"
                      y2="5"
                      stroke={s.color}
                      strokeWidth="2"
                      strokeDasharray={s.dash}
                    />
                  </svg>
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>

            <svg
              className="trends-chart"
              viewBox={`0 0 ${CHART.width} ${CHART.height}`}
              role="img"
              aria-labelledby={titleId}
              onMouseLeave={() => setHovered(null)}
            >
              <title id={titleId}>
                Average voting agreement across five parliamentary terms
              </title>

              {[0, 0.5, 1].map((t) => {
                const value = geometry.domain[0] + (geometry.domain[1] - geometry.domain[0]) * t;
                const y = geometry.y(value);
                return (
                  <g key={t}>
                    <line
                      x1={CHART.left}
                      y1={y}
                      x2={CHART.width - CHART.right}
                      y2={y}
                      className="trends-grid"
                    />
                    <text x={CHART.left - 5} y={y + 3} className="trends-axis-label" textAnchor="end">
                      {Math.round(value * 100)}
                    </text>
                  </g>
                );
              })}

              {activeIndex >= 0 && geometry.lines[0]?.points[activeIndex] && (
                <line
                  x1={geometry.x(activeIndex)}
                  y1={CHART.top}
                  x2={geometry.x(activeIndex)}
                  y2={CHART.height - CHART.bottom}
                  className="trends-crosshair"
                />
              )}

              {geometry.lines.map((line) => (
                <g key={line.key}>
                  <path
                    d={toPath(line.points)}
                    fill="none"
                    stroke={line.color}
                    strokeWidth="2"
                    strokeDasharray={line.dash}
                    strokeLinejoin="round"
                  />
                  {line.points.map((p) => (
                    <Marker
                      key={p.i}
                      shape={line.marker}
                      x={p.x}
                      y={p.y}
                      color={line.color}
                      size={p.i === activeIndex ? 4.4 : 3.2}
                    />
                  ))}
                  {/* Direct label on the last point: the relief the palette
                      validator requires, and it removes a legend round-trip. */}
                  {line.points.length > 0 && (
                    <text
                      x={line.points[line.points.length - 1].x - 4}
                      y={line.points[line.points.length - 1].y - 7}
                      className="trends-point-label"
                      textAnchor="end"
                      fill={line.color}
                    >
                      {(line.points[line.points.length - 1].value * 100).toFixed(0)}
                    </text>
                  )}
                </g>
              ))}

              {series.map((row, i) => (
                <g key={row.mandate}>
                  <text
                    x={geometry.x(i)}
                    y={CHART.height - 12}
                    className={`trends-tick ${row.mandate === mandate ? "current" : ""}`}
                    textAnchor="middle"
                  >
                    {row.short}
                  </text>
                  <text
                    x={geometry.x(i)}
                    y={CHART.height - 3}
                    className="trends-tick-years"
                    textAnchor="middle"
                  >
                    {row.years}
                  </text>
                  {/* One hit target per term, wider than the marks it covers. */}
                  <rect
                    x={geometry.x(i) - geometry.step / 2}
                    y={CHART.top}
                    width={geometry.step || geometry.plotWidth}
                    height={CHART.height - CHART.top - CHART.bottom}
                    className="trends-hit"
                    onMouseEnter={() => setHovered(i)}
                    onFocus={() => setHovered(i)}
                    onBlur={() => setHovered(null)}
                    onClick={() => onMandateChange && onMandateChange(row.mandate)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${row.short}, ${row.years}. ${SERIES.map(
                      (s) => `${s.label} ${pct(row[s.key])}`
                    ).join(", ")}. Open this term.`}
                  />
                </g>
              ))}
            </svg>

            {activeIndex >= 0 && series[activeIndex] && (
              <div className="trends-readout" aria-live="polite">
                <div className="trends-readout-head">
                  {series[activeIndex].short} · {series[activeIndex].years}
                  <span className="trends-readout-meps">
                    {series[activeIndex].nodeCount} MEPs
                  </span>
                </div>
                {SERIES.map((s) => (
                  <div key={s.key} className="trends-readout-row">
                    <span className="trends-readout-swatch" style={{ background: s.color }} />
                    <span className="trends-readout-label">{s.label}</span>
                    <span className="trends-readout-value">{pct(series[activeIndex][s.key])}</span>
                  </div>
                ))}
              </div>
            )}

            {geometry.spark && (
              <div className="trends-spark-block">
                <div className="trends-spark-title">
                  The two groups furthest apart
                </div>
                <svg
                  className="trends-chart"
                  viewBox={`0 0 ${SPARK.width} ${SPARK.height}`}
                  role="img"
                  aria-label={`Agreement between the least-agreeing pair of groups, falling from ${pct(
                    geometry.spark.points[0].value
                  )} to ${pct(geometry.spark.points[geometry.spark.points.length - 1].value)}`}
                >
                  <path
                    d={toPath(geometry.spark.points)}
                    fill="none"
                    stroke="#4a3aa7"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  {geometry.spark.points.map((p) => (
                    <circle
                      key={p.i}
                      cx={p.x}
                      cy={p.y}
                      r={p.i === activeIndex ? 4 : 2.8}
                      fill="#4a3aa7"
                    />
                  ))}
                  {[0, geometry.spark.points.length - 1].map((i) => {
                    const p = geometry.spark.points[i];
                    return (
                      <text
                        key={i}
                        x={p.x + (i === 0 ? 6 : -6)}
                        y={p.y - 6}
                        className="trends-point-label"
                        textAnchor={i === 0 ? "start" : "end"}
                        fill="#4a3aa7"
                      >
                        {(p.value * 100).toFixed(1)}
                      </text>
                    );
                  })}
                </svg>
                <div className="trends-spark-note">
                  {geometry.spark.points[geometry.spark.points.length - 1].pair?.a}
                  {" and "}
                  {geometry.spark.points[geometry.spark.points.length - 1].pair?.b}
                  {" are the furthest apart today."}
                </div>
              </div>
            )}

            <p className="trends-axis-note">
              The scale starts at {Math.round(geometry.domain[0] * 100)}%, not
              zero — every line would otherwise sit in the same flat band.
            </p>

            <button
              type="button"
              className="trends-table-toggle"
              onClick={() => setShowTable((open) => !open)}
              aria-expanded={showTable}
            >
              {showTable ? "Hide the numbers" : "Show the numbers"}
            </button>

            {showTable && (
              <div className="trends-table-scroll">
                <table className="trends-table">
                  <caption className="trends-table-caption">
                    Average voting agreement by parliamentary term
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Term</th>
                      {SERIES.map((s) => (
                        <th key={s.key} scope="col">
                          {s.short}
                        </th>
                      ))}
                      <th scope="col">lowest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((row) => (
                      <tr key={row.mandate} className={row.mandate === mandate ? "current" : ""}>
                        <th scope="row">{row.short}</th>
                        {SERIES.map((s) => (
                          <td key={s.key}>{pct(row[s.key])}</td>
                        ))}
                        <td>{row.lowestPair ? pct(row.lowestPair.score) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
