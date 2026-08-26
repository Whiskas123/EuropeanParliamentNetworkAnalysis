"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { loadTrendSeries, MIN_TERM_SESSIONS, TERMS } from "../lib/trends.js";
import { getGroupAcronym, getGroupColor } from "../lib/utils";
import SegmentedToggle from "./SegmentedToggle";
import DeltaBadge from "./DeltaBadge";
import "../styles/trends.scss";

/**
 * Five terms of the Parliament, for whichever network is open.
 *
 * The site shows one term at a time, so its clearest single story is invisible:
 * groups have grown steadily more disciplined internally (85.6% to 92.4%) while
 * agreeing with each other less (59.1% to 53.2%), and national delegations have
 * fragmented alongside (76.0% to 69.6%). Reading that today means switching
 * mandates and holding five numbers in your head.
 *
 * This panel used to tell that one story no matter what was on screen. With
 * Poland x Fisheries open — 51 MEPs, 29 votes — it still reported 696 MEPs and
 * the Parliament's own averages, which is the one thing a panel sitting inside
 * a filtered sidebar must not do. It now plots the open network across the five
 * terms and keeps the Parliament behind it in grey, because the interesting
 * question about a delegation is rarely its level: it is whether it moves with
 * the Parliament or against it.
 *
 * Two things the data forces into the design. A scope can be *absent* in a term
 * — Croatia has no term 6, the United Kingdom none after term 8 — so the five
 * slots are fixed and a line breaks over the gap rather than sliding along the
 * axis. And a scope can be *thin*: Fisheries runs 127, 131, 178, 289 and then
 * 29 votes, and a point resting on 29 votes is drawn hollow and named
 * underneath. These charts end up printed, where a caveat cannot be added
 * later.
 *
 * The most dramatic series — the least-agreeing pair of groups — sits on its own
 * beneath rather than in the main plot. Its range barely overlaps the others,
 * and forcing them onto a shared axis would flatten all four. Two plots on one
 * axis each beats one plot on two axes.
 *
 * That second plot is drawn with the first one's furniture — the same hairline
 * grid, the same axis numbers, the same term ticks, the same hit target per
 * term feeding the same hover — because it is the same kind of measure read the
 * same way, and a bare sparkline under a full chart reads as a different panel.
 * Under its axis each term names its own pair, group colours and all: the line
 * connects a *different* two groups in every term, which a single line cannot
 * say and a closing sentence about the last term said only once.
 */

/**
 * Line colours: the sidebar's own scale, darkest first.
 *
 * Deliberately not the political-group colours used everywhere else in the app.
 * These series are measures, not parties, and borrowing the group palette would
 * imply a party each line does not have. The previous blue/orange/green trio
 * was a palette nothing else on the site used, which is what made this tab look
 * like a different app.
 *
 * Each series also carries a dash pattern and a marker shape, so the chart still
 * separates when printed in greyscale — which is the point of the exercise here,
 * and what lets the reference series be nothing but the same dashes in a lighter
 * grey.
 */
const SERIES = [
  {
    key: "withinGroup",
    label: "Within group",
    short: "group",
    color: "var(--eu-blue)",
    dash: "",
    marker: "circle",
    description: "Average agreement between members of the same political group",
  },
  {
    key: "withinCountry",
    label: "Within country",
    short: "country",
    color: "var(--sb-ink-soft)",
    dash: "5 3",
    marker: "square",
    description: "Average agreement between MEPs from the same country",
  },
  {
    key: "crossGroup",
    label: "Between groups",
    short: "cross",
    color: "var(--sb-muted)",
    dash: "1.5 3",
    marker: "triangle",
    description: "Average agreement between members of different groups",
  },
];

const VIEW_OPTIONS = [
  { id: "chart", text: "Chart", title: "Five terms plotted" },
  { id: "numbers", text: "Numbers", title: "The same five terms as a table" },
];

/**
 * Plot boxes, in real screen pixels — everything but the width, which is
 * measured.
 *
 * These used to be a fixed 336-unit viewBox scaled to fill the panel, which
 * meant every length inside the SVG was multiplied by panel width / 336. The
 * sidebar is 30% of the window with no maximum, so that factor was 1.16 at
 * 1440px and keeps climbing: the axis labels rendered at 9.3px, the term ticks
 * at 10.5px against a sidebar whose smallest tier is 9px and whose rows are
 * 10px, and on a 2560px monitor the ticks would have reached 19px. Chart text
 * was the only text on the page that grew with the window.
 *
 * Measuring the panel and drawing at 1:1 fixes it at every width: a font-size
 * of 9px in the SVG is 9px on screen, the same 9px the ranks and units use.
 */
const CHART_BOX = { top: 12, right: 10, bottom: 26, left: 24 };
const SPARK_BOX = { top: 12, right: 10, bottom: 16, left: 24 };

/**
 * The band under the spark's axis, holding each term's pair.
 *
 * Two rows of a coloured rail with the group's acronym under it — the legend's
 * own mark, turned on its side and centred in the term's column. Fixed in
 * pixels like everything else in these charts: it holds two 9px lines whatever
 * the sidebar is doing.
 */
const PAIR_BAND = 34;
const PAIR_RAIL = 8;

/** Width assumed before the panel has been measured, and on the server. */
const ASSUMED_WIDTH = 336;

/**
 * Height follows width, so the plot keeps its proportions.
 *
 * Only the *text* wants to be fixed. Holding the height fixed as well would
 * letterbox the chart on a wide sidebar — 727 by 168 pixels on a 2560px
 * monitor, a 4.3:1 band that flattens every line in it, which is the same
 * failure the axis note exists to avoid. The ratio is the one the panel was
 * drawn at, and the ceiling stops a very wide sidebar from turning a footnote
 * into the tallest thing on the tab.
 */
const ratio = (width, of, min, max) =>
  Math.round(Math.max(min, Math.min(max, width * of)));

const pct = (value) =>
  typeof value === "number" && isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
const finite = (value) => typeof value === "number" && isFinite(value);

// Deterministic thousands separator, same as the facts strip above:
// toLocaleString would differ between the server render and the browser and
// trip hydration.
const thousands = (value) =>
  finite(value) ? String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "";

/**
 * A group name centred in a term's column, cut to fit it.
 *
 * SVG text neither wraps nor ellipsises, and "Greens/EFA" against a 300px
 * sidebar is wider than a fifth of the plot. The full name stays on the
 * column's <title>, so nothing is lost, only shortened.
 */
const clip = (text, max) =>
  text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;

/** What the sidebar is filtered to, in the words the rest of the app uses. */
function describeScope(country, subject) {
  if (country && subject) return `${country}, ${subject}`;
  if (country) return `${country}, all policy areas`;
  if (subject) return `${subject}, every country`;
  return "the whole Parliament";
}

/** "T6", "T6 and T7", "T6, T7 and T8" — a list a sentence can end on. */
function joinTerms(rows) {
  const names = rows.map((row) => row.short);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

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

/**
 * A line with holes in it.
 *
 * A term the scope never reached is a gap, not a value to interpolate over, so
 * the run of points either side is drawn as its own path and nothing crosses
 * the hole.
 */
function segments(points) {
  const runs = [];
  let run = [];
  points.forEach((point) => {
    if (point) {
      run.push(point);
    } else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length > 0) runs.push(run);
  return runs;
}

const toPath = (points) =>
  points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

export default function TrendsPanel({
  mandate,
  onMandateChange,
  selectedCountry = null,
  selectedSubject = null,
}) {
  const [loaded, setLoaded] = useState(null);
  const [parliament, setParliament] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [view, setView] = useState("chart");
  const [chartWidth, setChartWidth] = useState(ASSUMED_WIDTH);
  const panelRef = useRef(null);
  const titleId = useId();

  // The panel's own width, so the charts can be drawn in real pixels. The
  // observer fires once on observe, which is long before the five terms have
  // been fetched, so the first chart ever drawn is already at the right scale.
  useEffect(() => {
    const node = panelRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = Math.round(entries[0].contentRect.width);
      if (width > 0) setChartWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const CHART = useMemo(
    () => ({ ...CHART_BOX, width: chartWidth, height: ratio(chartWidth, 0.43, 150, 260) }),
    [chartWidth]
  );
  // `height` is the plot; `total` adds the band of pair labels under its axis,
  // which is drawn inside the same SVG so the names sit exactly under the
  // points they belong to.
  const SPARK = useMemo(() => {
    const height = ratio(chartWidth, 0.2, 76, 124);
    return { ...SPARK_BOX, width: chartWidth, height, band: PAIR_BAND, total: height + PAIR_BAND };
  }, [chartWidth]);

  const scoped = Boolean(selectedCountry || selectedSubject);
  const scopeLabel = describeScope(selectedCountry, selectedSubject);
  const scopeKey = `${selectedCountry || ""}|${selectedSubject || ""}`;

  // Only the active tab is mounted, so mounting *is* the request and the fetch
  // belongs in an effect rather than in a toggle. Re-runs whenever the sidebar
  // is filtered somewhere else; loadTrendSeries caches per scope, so going back
  // to a view already read costs nothing.
  //
  // What arrives is stamped with the scope it answers, and the render below
  // derives "still loading" from that stamp not matching the current one. The
  // alternative — blanking the series in the effect body — is a second render
  // pass for something the props already say.
  useEffect(() => {
    let cancelled = false;
    loadTrendSeries({ country: selectedCountry, subject: selectedSubject })
      .then((rows) => {
        if (!cancelled) setLoaded({ key: scopeKey, rows });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key: scopeKey, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [scopeKey, selectedCountry, selectedSubject]);

  // The Parliament behind. Loaded separately and after the fact: at a country
  // scope the series above is 600 KB and arrives quickly, while this is 80 MB,
  // and there is no reason to hold the panel blank for the reference when the
  // subject of the panel is already drawable. Kept once loaded — it is the same
  // five terms behind every scope — and simply not drawn at the whole-Parliament
  // scope, where it would be the open series a second time.
  useEffect(() => {
    if (!scoped) return undefined;
    let cancelled = false;
    loadTrendSeries()
      .then((rows) => {
        if (!cancelled) setParliament(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [scoped]);

  const series = loaded && loaded.key === scopeKey ? loaded.rows : null;
  const reference = scoped ? parliament : null;
  const status = !series
    ? "loading"
    : series.some((row) => !row.missing)
    ? "ready"
    : "empty";

  const geometry = useMemo(() => {
    if (!series || series.length === 0) return null;

    const values = [];
    const collect = (rows) => {
      (rows || []).forEach((row) => {
        SERIES.forEach((s) => {
          if (finite(row[s.key])) values.push(row[s.key]);
        });
      });
    };
    collect(series);
    collect(reference);
    if (values.length === 0) return null;

    const lo = values.reduce((min, v) => Math.min(min, v), Infinity);
    const hi = values.reduce((max, v) => Math.max(max, v), -Infinity);
    // A zero baseline would compress every line into one flat band near the top;
    // the whole story lives in the upper half of the range. The axis says so.
    const pad = Math.max((hi - lo) * 0.14, 0.02);
    const domain = [Math.max(0, lo - pad), Math.min(1, hi + pad)];

    const plotWidth = CHART.width - CHART.left - CHART.right;
    const plotHeight = CHART.height - CHART.top - CHART.bottom;
    // Five fixed slots, one per term, whether or not this view reaches them.
    const step = TERMS.length > 1 ? plotWidth / (TERMS.length - 1) : 0;
    const x = (i) => CHART.left + step * i;
    const y = (v) =>
      CHART.top + plotHeight * (1 - (v - domain[0]) / (domain[1] - domain[0] || 1));

    const place = (rows, key, extra) =>
      TERMS.map((term, i) => {
        const row = (rows || []).find((entry) => entry.mandate === term.mandate);
        if (!row || !finite(row[key])) return null;
        return { x: x(i), y: y(row[key]), value: row[key], i, ...(extra ? extra(row) : null) };
      });

    const lines = SERIES.map((s) => ({
      ...s,
      points: place(series, s.key, (row) => ({ thin: Boolean(row.thin) })),
      referencePoints: reference ? place(reference, s.key) : null,
    }));

    // The lowest-agreeing pair, on its own scale beneath the main plot.
    const pairValues = series
      .map((row) => (row.lowestPair ? row.lowestPair.score : null))
      .filter(finite);
    let spark = null;
    if (pairValues.length > 1) {
      const plo = pairValues.reduce((min, v) => Math.min(min, v), Infinity);
      const phi = pairValues.reduce((max, v) => Math.max(max, v), -Infinity);
      const ppad = Math.max((phi - plo) * 0.16, 0.02);
      const pdomain = [Math.max(0, plo - ppad), Math.min(1, phi + ppad)];
      const sw = SPARK.width - SPARK.left - SPARK.right;
      const sh = SPARK.height - SPARK.top - SPARK.bottom;
      const sstep = TERMS.length > 1 ? sw / (TERMS.length - 1) : 0;
      const sx = (i) => SPARK.left + sstep * i;
      const sy = (v) =>
        SPARK.top + sh * (1 - (v - pdomain[0]) / (pdomain[1] - pdomain[0] || 1));
      spark = {
        domain: pdomain,
        x: sx,
        y: sy,
        step: sstep,
        // How many characters a group acronym gets in one term's column. The
        // columns are a fifth of a sidebar that has no maximum width, so this
        // is measured rather than assumed: ~5.6px per character at 9px.
        chars: Math.max(4, Math.floor((sstep - 8) / 5.6)),
        points: TERMS.map((term, i) => {
          const row = series.find((entry) => entry.mandate === term.mandate);
          const score = row && row.lowestPair ? row.lowestPair.score : null;
          if (!finite(score)) return null;
          return {
            x: sx(i),
            y: sy(score),
            value: score,
            pair: row.lowestPair,
            thin: Boolean(row.thin),
            mandate: term.mandate,
            i,
          };
        }),
      };
    }

    return { domain, x, y, lines, spark, step, plotHeight, plotWidth };
  }, [series, reference, CHART, SPARK]);

  const activeIndex =
    hovered !== null ? hovered : TERMS.findIndex((term) => term.mandate === mandate);
  const activeRow =
    series && activeIndex >= 0
      ? series.find((row) => row.mandate === TERMS[activeIndex].mandate)
      : null;

  /** The nearest earlier term this view actually reached, for the change badge. */
  const previousRow = useMemo(() => {
    if (!series || activeIndex <= 0) return null;
    for (let i = activeIndex - 1; i >= 0; i -= 1) {
      const row = series.find((entry) => entry.mandate === TERMS[i].mandate);
      if (row && !row.missing) return row;
    }
    return null;
  }, [series, activeIndex]);

  const thinRows = (series || []).filter((row) => !row.missing && row.thin);
  const missingRows = (series || []).filter((row) => row.missing);
  const lastSpark =
    geometry && geometry.spark
      ? [...geometry.spark.points].reverse().find(Boolean)
      : null;
  const firstSpark =
    geometry && geometry.spark ? geometry.spark.points.find(Boolean) : null;

  // Every term's pair in one sentence. The chart says this with five columns of
  // coloured rails; a screen reader gets the same five facts in order, which is
  // what the single aria-label on the plot has to carry.
  const sparkSummary = useMemo(() => {
    if (!geometry || !geometry.spark) return "";
    return TERMS.map((term, i) => {
      const point = geometry.spark.points[i];
      if (!point) return null;
      return `${term.short}, ${getGroupAcronym(point.pair.a, term.mandate)} and ${getGroupAcronym(
        point.pair.b,
        term.mandate
      )}, ${pct(point.value)}`;
    })
      .filter(Boolean)
      .join("; ");
  }, [geometry]);

  return (
    <div className="trends-panel" ref={panelRef}>
      <h3 className="trends-title">Five terms compared</h3>

      <div className="trends-description">
        {scoped ? (
          <>
            Voting agreement inside <strong>{scopeLabel}</strong>, term by term.
            {reference && (
              <span className="baseline-note">
                The faint lines behind are the whole Parliament.
              </span>
            )}
          </>
        ) : (
          "Groups vote together more than they used to, and with each other less."
        )}
      </div>

      {status === "loading" && (
        <div className="trends-status">
          {scoped
            ? `Reading ${scopeLabel} across five parliamentary terms…`
            : "Reading five parliamentary terms…"}
        </div>
      )}
      {status === "empty" && (
        <div className="trends-status">
          {scoped
            ? `No network for ${scopeLabel} in any earlier term, so there is nothing to compare.`
            : "The per-term networks needed for this comparison are not available."}
        </div>
      )}

      {status === "ready" && geometry && (
        <>
          <SegmentedToggle
            value={view}
            onChange={setView}
            options={VIEW_OPTIONS}
            label="View"
          />

          {view === "chart" && (
            <>
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
                {reference && (
                  <li
                    className="trends-legend-item"
                    title="The same three measures for the whole Parliament"
                  >
                    <svg width="14" height="10" aria-hidden="true">
                      <line x1="0" y1="5" x2="14" y2="5" className="trends-reference" />
                    </svg>
                    <span>Whole Parliament</span>
                  </li>
                )}
              </ul>

              <svg
                className="trends-chart"
                viewBox={`0 0 ${CHART.width} ${CHART.height}`}
                role="img"
                aria-labelledby={titleId}
                onMouseLeave={() => setHovered(null)}
              >
                <title id={titleId}>
                  {`Average voting agreement in ${scopeLabel} across five parliamentary terms`}
                </title>

                {[0, 0.5, 1].map((t) => {
                  const value =
                    geometry.domain[0] + (geometry.domain[1] - geometry.domain[0]) * t;
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
                      <text
                        x={CHART.left - 5}
                        y={y + 3}
                        className="trends-axis-label"
                        textAnchor="end"
                      >
                        {Math.round(value * 100)}
                      </text>
                    </g>
                  );
                })}

                {activeIndex >= 0 && (
                  <line
                    x1={geometry.x(activeIndex)}
                    y1={CHART.top}
                    x2={geometry.x(activeIndex)}
                    y2={CHART.height - CHART.bottom}
                    className="trends-crosshair"
                  />
                )}

                {/* The Parliament first, so the open network is never crossed by
                    its own reference. Same dash patterns, one lighter grey: the
                    pattern says which measure, the weight says which network. */}
                {geometry.lines.map((line) =>
                  (line.referencePoints ? segments(line.referencePoints) : []).map(
                    (run, index) => (
                      <path
                        key={`${line.key}-ref-${index}`}
                        d={toPath(run)}
                        fill="none"
                        className="trends-reference"
                        strokeDasharray={line.dash}
                        strokeLinejoin="round"
                      />
                    )
                  )
                )}

                {geometry.lines.map((line) => (
                  <g key={line.key}>
                    {segments(line.points).map((run, index) => (
                      <path
                        key={index}
                        d={toPath(run)}
                        fill="none"
                        stroke={line.color}
                        strokeWidth="2"
                        strokeDasharray={line.dash}
                        strokeLinejoin="round"
                      />
                    ))}
                    {line.points.filter(Boolean).map((p) => (
                      <Marker
                        key={p.i}
                        shape={line.marker}
                        x={p.x}
                        y={p.y}
                        color={line.color}
                        size={p.i === activeIndex ? 4.4 : 3.2}
                        filled={!p.thin}
                      />
                    ))}
                    {/* Direct label on the last point the view reaches: the
                        relief the palette validator requires, and it removes a
                        legend round-trip. */}
                    {(() => {
                      const last = [...line.points].reverse().find(Boolean);
                      if (!last) return null;
                      return (
                        <text
                          x={last.x - 4}
                          y={last.y - 7}
                          className="trends-point-label"
                          textAnchor="end"
                          fill={line.color}
                        >
                          {(last.value * 100).toFixed(0)}
                        </text>
                      );
                    })()}
                  </g>
                ))}

                {TERMS.map((term, i) => {
                  const row = series.find((entry) => entry.mandate === term.mandate);
                  const absent = !row || row.missing;
                  return (
                    <g key={term.mandate}>
                      <text
                        x={geometry.x(i)}
                        y={CHART.height - 12}
                        className={`trends-tick ${term.mandate === mandate ? "current" : ""} ${
                          absent ? "absent" : ""
                        }`}
                        textAnchor="middle"
                      >
                        {term.short}
                      </text>
                      <text
                        x={geometry.x(i)}
                        y={CHART.height - 3}
                        className={`trends-tick-years ${absent ? "absent" : ""}`}
                        textAnchor="middle"
                      >
                        {term.years}
                      </text>
                      {/* One hit target per term, wider than the marks it
                          covers. A term this view never reached is still
                          hoverable — it has something to say — but not
                          clickable, because there is no network to open. */}
                      <rect
                        x={geometry.x(i) - geometry.step / 2}
                        y={CHART.top}
                        width={geometry.step || geometry.plotWidth}
                        height={CHART.height - CHART.top - CHART.bottom}
                        className={`trends-hit ${absent ? "absent" : ""}`}
                        onMouseEnter={() => setHovered(i)}
                        onFocus={() => setHovered(i)}
                        onBlur={() => setHovered(null)}
                        onClick={
                          absent || !onMandateChange
                            ? undefined
                            : () => onMandateChange(term.mandate)
                        }
                        tabIndex={0}
                        role={absent ? "img" : "button"}
                        aria-label={
                          absent
                            ? `${term.short}, ${term.years}. No network for ${scopeLabel} in this term.`
                            : `${term.short}, ${term.years}. ${SERIES.map(
                                (s) => `${s.label} ${pct(row[s.key])}`
                              ).join(", ")}${
                                row.thin ? `, on ${row.sessions} votes` : ""
                              }. Open this term.`
                        }
                      />
                    </g>
                  );
                })}
              </svg>

              {activeRow && (
                <div className="trends-readout" aria-live="polite">
                  <div className="trends-readout-head">
                    <span>
                      {activeRow.short} · {activeRow.years}
                    </span>
                    <span className="trends-readout-sample">
                      {activeRow.missing
                        ? "no network here"
                        : `${thousands(activeRow.nodeCount)} MEPs${
                            activeRow.sessions
                              ? ` · ${thousands(activeRow.sessions)} votes`
                              : ""
                          }`}
                    </span>
                  </div>
                  {activeRow.missing ? (
                    <div className="trends-readout-empty">
                      {scopeLabel} has no network in this term.
                    </div>
                  ) : (
                    SERIES.map((s) => (
                      <div key={s.key} className="trends-readout-row">
                        <span
                          className="trends-readout-swatch"
                          style={{ background: s.color }}
                        />
                        <span className="trends-readout-label">{s.label}</span>
                        <span className="trends-readout-value">{pct(activeRow[s.key])}</span>
                        {previousRow && (
                          <DeltaBadge
                            score={activeRow[s.key]}
                            baseline={previousRow[s.key]}
                            label={`${previousRow.short} (${previousRow.years})`}
                            what={s.label}
                          />
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {geometry.spark && lastSpark && (
                <div className="trends-spark-block">
                  <h4 className="trends-spark-title">The two groups furthest apart</h4>
                  <p className="trends-spark-lede">
                    The lowest agreement any two groups reach, term by term. Which two
                    they are is named under the axis — it is rarely the same pair twice.
                  </p>

                  <svg
                    className="trends-chart"
                    viewBox={`0 0 ${SPARK.width} ${SPARK.total}`}
                    role="img"
                    aria-label={`The least-agreeing pair of groups in ${scopeLabel}: ${sparkSummary}`}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {/* The plot above's own axis, at this plot's numbers. Same
                        hairline grid and same smallest-tier labels: the reader
                        already knows how to read it, and seeing 18 here under 53
                        up there is the whole reason this is a second chart. */}
                    {[0, 0.5, 1].map((t) => {
                      const value =
                        geometry.spark.domain[0] +
                        (geometry.spark.domain[1] - geometry.spark.domain[0]) * t;
                      const y = geometry.spark.y(value);
                      return (
                        <g key={t}>
                          <line
                            x1={SPARK.left}
                            y1={y}
                            x2={SPARK.width - SPARK.right}
                            y2={y}
                            className="trends-grid"
                          />
                          <text
                            x={SPARK.left - 5}
                            y={y + 3}
                            className="trends-axis-label"
                            textAnchor="end"
                          >
                            {Math.round(value * 100)}
                          </text>
                        </g>
                      );
                    })}

                    {activeIndex >= 0 && (
                      <line
                        x1={geometry.spark.x(activeIndex)}
                        y1={SPARK.top}
                        x2={geometry.spark.x(activeIndex)}
                        y2={SPARK.height - SPARK.bottom}
                        className="trends-crosshair"
                      />
                    )}

                    {segments(geometry.spark.points).map((run, index) => (
                      <path
                        key={index}
                        d={toPath(run)}
                        fill="none"
                        className="trends-spark-line"
                        strokeLinejoin="round"
                      />
                    ))}
                    {geometry.spark.points.filter(Boolean).map((p) => (
                      <Marker
                        key={p.i}
                        shape="circle"
                        x={p.x}
                        y={p.y}
                        color="var(--sb-ink)"
                        size={p.i === activeIndex ? 4.2 : 2.6}
                        filled={!p.thin}
                      />
                    ))}

                    {/* Both ends, and whichever term is being read. The ends
                        give the span without a hover; the third follows the
                        crosshair, so the number under the cursor is on screen
                        rather than in a tooltip that will not print. */}
                    {(() => {
                      const marks = [
                        firstSpark,
                        lastSpark,
                        geometry.spark.points[activeIndex],
                      ].filter(Boolean);
                      return marks
                        .filter((p, index) => marks.findIndex((q) => q.i === p.i) === index)
                        .map((p) => {
                          const last = p.i === TERMS.length - 1;
                          return (
                            <text
                              key={p.i}
                              x={p.x + (p.i === 0 ? 7 : last ? -7 : 0)}
                              y={p.y - 8}
                              className={`trends-point-label ${
                                p.i === activeIndex ? "current" : ""
                              }`}
                              textAnchor={p.i === 0 ? "start" : last ? "end" : "middle"}
                              fill={p.i === activeIndex ? "var(--sb-ink)" : "var(--sb-muted)"}
                            >
                              {(p.value * 100).toFixed(1)}
                            </text>
                          );
                        });
                    })()}

                    {/* Under the axis: the two groups this term's point is
                        about, each on the coloured rail the rest of the site
                        uses for that group. The pair changes term to term, so
                        it belongs on the axis and not in a caption. */}
                    {TERMS.map((term, i) => {
                      const point = geometry.spark.points[i];
                      const active = i === activeIndex;
                      const x = geometry.spark.x(i);
                      const pair = point ? [point.pair.a, point.pair.b] : [];
                      const names = pair.map((id) => getGroupAcronym(id, term.mandate));
                      // T6 and T10 sit *on* the ends of the axis, so a name
                      // centred on the point hangs off the panel — "Greens/EFA"
                      // by 15px in term 10. The label block slides back inside
                      // the plot; the tick and the point stay where they are.
                      const labelWidth =
                        Math.max(
                          ...names.map((name) => clip(name, geometry.spark.chars).length),
                          1
                        ) * 5.6;
                      const cx = Math.min(
                        Math.max(x, labelWidth / 2 + 1),
                        SPARK.width - labelWidth / 2 - 1
                      );
                      return (
                        <g key={term.mandate}>
                          <title>
                            {point
                              ? `${term.short}, ${term.years}: ${names[0]} and ${names[1]}, ${pct(
                                  point.value
                                )}`
                              : `${term.short}, ${term.years}: no network for ${scopeLabel}`}
                          </title>

                          <text
                            x={x}
                            y={SPARK.height - 5}
                            className={`trends-tick ${term.mandate === mandate ? "current" : ""} ${
                              point ? "" : "absent"
                            }`}
                            textAnchor="middle"
                          >
                            {term.short}
                          </text>

                          {point ? (
                            pair.map((id, row) => (
                              <g key={id}>
                                <line
                                  x1={cx - PAIR_RAIL}
                                  y1={SPARK.height + 6 + row * 16}
                                  x2={cx + PAIR_RAIL}
                                  y2={SPARK.height + 6 + row * 16}
                                  className={`trends-pair-rail ${active ? "current" : ""}`}
                                  stroke={getGroupColor(id)}
                                />
                                <text
                                  x={cx}
                                  y={SPARK.height + 15 + row * 16}
                                  className={`trends-pair-name ${active ? "current" : ""}`}
                                  textAnchor="middle"
                                >
                                  {clip(names[row], geometry.spark.chars)}
                                </text>
                              </g>
                            ))
                          ) : (
                            <text
                              x={x}
                              y={SPARK.height + 15}
                              className="trends-pair-none"
                              textAnchor="middle"
                            >
                              —
                            </text>
                          )}

                          {/* One hit target per term, over the plot and its
                              labels both, driving the same hover as the chart
                              above: reading a pair down here moves the crosshair
                              and the readout up there. */}
                          <rect
                            x={x - geometry.spark.step / 2}
                            y={SPARK.top}
                            width={geometry.spark.step || SPARK.width}
                            height={SPARK.total - SPARK.top}
                            className={`trends-hit ${point ? "" : "absent"}`}
                            onMouseEnter={() => setHovered(i)}
                            onFocus={() => setHovered(i)}
                            onBlur={() => setHovered(null)}
                            onClick={
                              !point || !onMandateChange
                                ? undefined
                                : () => onMandateChange(term.mandate)
                            }
                            tabIndex={0}
                            role={point ? "button" : "img"}
                            aria-label={
                              point
                                ? `${term.short}, ${term.years}. Furthest apart: ${names[0]} and ${
                                    names[1]
                                  }, ${pct(point.value)}. Open this term.`
                                : `${term.short}, ${term.years}. No network for ${scopeLabel} in this term.`
                            }
                          />
                        </g>
                      );
                    })}
                  </svg>

                  <p className="trends-spark-note">
                    On its own scale, below everything in the plot above — one axis for
                    both would flatten both.
                  </p>
                </div>
              )}

              <p className="trends-axis-note">
                The scale starts at {Math.round(geometry.domain[0] * 100)}%, not zero —
                every line would otherwise sit in the same flat band.
              </p>
            </>
          )}

          {view === "numbers" && (
            <div className="trends-table-scroll">
              <table className="trends-table">
                <caption className="trends-table-caption">
                  {`Average voting agreement in ${scopeLabel}, by parliamentary term`}
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
                    <th scope="col">votes</th>
                  </tr>
                </thead>
                <tbody>
                  {TERMS.map((term) => {
                    const row = series.find((entry) => entry.mandate === term.mandate);
                    const absent = !row || row.missing;
                    return (
                      <tr
                        key={term.mandate}
                        className={`${term.mandate === mandate ? "current" : ""} ${
                          absent ? "absent" : ""
                        }`}
                      >
                        <th scope="row">{term.short}</th>
                        {absent ? (
                          <td colSpan={SERIES.length + 2}>no network here</td>
                        ) : (
                          <>
                            {SERIES.map((s) => (
                              <td key={s.key}>{pct(row[s.key])}</td>
                            ))}
                            <td>{row.lowestPair ? pct(row.lowestPair.score) : "—"}</td>
                            <td
                              className={row.thin ? "thin" : ""}
                              title={
                                row.thin
                                  ? `${row.sessions} votes — fewer than ${MIN_TERM_SESSIONS}, so read this term as a hint`
                                  : undefined
                              }
                            >
                              {row.sessions === null ? "—" : thousands(row.sessions)}
                              {row.thin && (
                                <span className="trends-thin-mark" aria-hidden="true" />
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* What the reader has to know before quoting any of it, in both
              views: which points are thin, and which terms are not here. */}
          {thinRows.length > 0 && (
            <p className="sb-note trends-caveat">
              {view === "chart" ? "Hollow markers rest" : "Marked terms rest"} on fewer
              than {MIN_TERM_SESSIONS} votes
              {selectedSubject ? ` in ${selectedSubject}` : ""}:{" "}
              {thinRows.map((row) => `${row.short} (${row.sessions})`).join(", ")}. Read
              them as a hint, not a finding.
            </p>
          )}
          {missingRows.length > 0 && (
            <p className="sb-note trends-caveat">
              {scopeLabel} has no network in {joinTerms(missingRows)}, so the lines break
              there rather than crossing the gap.
            </p>
          )}
        </>
      )}
    </div>
  );
}
