"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { loadTrendSeries, MIN_TERM_SESSIONS, TERMS } from "../lib/trends.js";
import { FAMILIES, FAMILY_ORDER } from "../lib/families.js";
import { getGroupAcronym, getGroupColor } from "../lib/utils";
import { groupSwatchStroke } from "../lib/groupColors";
import SegmentedToggle from "./SegmentedToggle";
import "../styles/profile.scss";
import "../styles/trends.scss";

/**
 * Five terms of the Parliament, for whichever network is open.
 *
 * The site shows one term at a time, so its clearest single story is invisible:
 * groups have grown steadily more disciplined internally (85.6% to 92.4%) while
 * national delegations have fragmented alongside (76.0% to 69.6%). Reading that
 * today means switching mandates and holding five numbers in your head.
 *
 * A third average used to run under those two — agreement *between* groups,
 * 59.1% down to 53.2% — and it is gone from the chart. It read as "the chamber
 * is polarising" and that is not what it says: drop the far right from the same
 * calculation and the remaining pairs run 62.9, 60.3, 63.1, 65.8, 64.3, flat if
 * anything rising. One bloc separating from a chamber that is otherwise
 * converging, and the average was what hid it. The partner panel at the bottom
 * of this tab plots those pairs, which is the level the question is answerable
 * at; a single line here could only mislead.
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
 * beneath rather than in the main plot, because it is a different measure: the
 * floor of the chamber rather than its average. It is drawn with the first
 * plot's furniture at the first plot's size, on the same fixed 0-100 axis — the
 * same hairline grid, the same axis numbers, the same term ticks with their
 * years, the same hit target per term feeding the same hover, the same numbers
 * floating over the line. Seeing 18 down here under 53 up there is the whole
 * reason it is a second chart, and that reading only works when the two axes
 * are the same axis. Under its own axis each term names its pair, on the
 * coloured square the rest of the sidebar gives a political group: the line
 * connects a *different* two groups in every term, which a single line cannot
 * say and a closing sentence about the last term said only once.
 *
 * The first plot has two readings, on one switch in its heading row: the two
 * chamber averages, or the same measure per political family. They are the same
 * number at two altitudes — an average of group cohesion, and the groups it
 * averages — so they share an axis and a heading rather than becoming two
 * panels. The averages say whether the chamber is more disciplined; only the
 * families say which of them is.
 *
 * Both plots collapse from their heading, as the panels in the other sidebars
 * do. Three charts of this size in one tab is a long scroll, and the chevron is
 * how the rest of the app already lets a reader put one away.
 */

/**
 * Line colours: the sidebar's own scale, darkest first.
 *
 * Deliberately not the political-group colours used everywhere else in the app.
 * These series are measures, not parties, and borrowing the group palette would
 * imply a party each line does not have. The previous blue/orange/green trio
 * was a palette nothing else on the site used, which is what made this tab look
 * like a different app. The by-family reading below inverts this on purpose:
 * there each line *is* a party, so it takes the group colour and drops the
 * dashes.
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
    value: (row) => row.withinGroup,
    description: "Average agreement between members of the same political group",
  },
  {
    key: "withinCountry",
    label: "Within country",
    short: "country",
    color: "var(--sb-ink-soft)",
    dash: "5 3",
    marker: "square",
    value: (row) => row.withinCountry,
    description: "Average agreement between MEPs from the same country",
  },
];

/**
 * The same chart, one line per political family instead of two averages.
 *
 * The averages answer "is the chamber more disciplined than it was" and cannot
 * answer "which groups". Both readings are the same underlying number — a
 * group's internal agreement — at two altitudes, so they belong on one axis
 * under one heading rather than in two panels.
 *
 * These lines are coloured and nothing else: seven dash patterns would not
 * separate, and a party is not a measure, so colour is the right carrier here
 * exactly where it was the wrong one above. That is the convention the partner
 * panel at the bottom of this tab already uses, and the legend names every
 * line so identity never rests on colour alone.
 *
 * What the line is: the mean of the family's constituent groups' own cohesion,
 * unweighted. For the five families that are one group it is that group. For
 * the far right and the two other merges it is an average of separate groups
 * that hold together well and need not agree with *each other* — the panel
 * names the merges underneath so the claim is visible rather than assumed.
 */
const FAMILY_SERIES = FAMILY_ORDER.map((family) => ({
  key: family,
  label: FAMILIES[family].label,
  short: FAMILIES[family].short,
  color: FAMILIES[family].color,
  dash: "",
  marker: "circle",
  value: (row) => {
    const score = (row.familyCohesion || {})[family];
    return finite(score) ? score : undefined;
  },
  description: `Average agreement inside ${FAMILIES[family].label}`,
}));

const MEASURES = [
  {
    id: "averages",
    text: "Chamber",
    title: "The two averages, term by term",
  },
  {
    id: "families",
    text: "Groups",
    title: "Agreement inside each political family, term by term",
  },
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
const CHART_BOX = { top: 12, right: 12, bottom: 26, left: 26 };
const SPARK_BOX = { top: 12, right: 12, bottom: 26, left: 26 };

/**
 * The axis, fixed at 0-100 on both plots.
 *
 * Both used to fit their own data — the main plot cropped to the band its three
 * lines occupy, the pair plot floored at zero but topped at its own maximum —
 * which reads better in isolation and is the wrong default on a tab holding
 * three charts. The axis then changed underneath the reader: the same six-point
 * move filled the plot at one scope and vanished at the next, and nothing on
 * this tab could be read against anything else on it. PartnerTrends had already
 * fixed itself at 0-100 for that reason; these two now match it, and the three
 * charts became three readings of one scale.
 *
 * The cost is the one the crop existed to avoid, and it is accepted: agreement
 * within a group sits between 56% and 97%, so the bottom half of the main plot
 * stays empty and its three lines run closer together than they did.
 */
const AXIS = [0, 1];

/** Quarters of the axis — the gridlines every chart on this tab shares. */
const AXIS_TICKS = [0, 0.25, 0.5, 0.75, 1];

/** How far a value floats above its point, and the least room between two. */
const LABEL_LIFT = 8;
const LABEL_GAP = 10;

/**
 * The band under the spark's axis, holding each term's pair.
 *
 * Two rows of the square the rest of the sidebar uses for a political group —
 * 8px, 2px radius, the group's own colour, as in .leads-dot, .insights-swatch
 * and the canvas tooltip. Fixed in pixels like everything else in these charts.
 *
 * The square sits *above* its name rather than beside it, which is not how the
 * chip is built elsewhere, and the reason is alignment. Beside the name, a
 * column is as wide as its longest acronym, and centring that on the point
 * leaves every column starting at a different distance from its own tick —
 * 14px under T8, 59px under T10 — so the row reads as drifting. Above it, the
 * square is a fixed 8px whatever the name says, so it lands exactly under the
 * tick in every column and the whole row lines up.
 */
const PAIR_BAND = 43;
const PAIR_SWATCH = 8;
const PAIR_ROW = 21;
const PAIR_MIN_GAP = 8;

/** Width assumed before the panel has been measured, and on the server. */
const ASSUMED_WIDTH = 336;

/**
 * Height follows width, so the plot keeps its proportions.
 *
 * Only the *text* wants to be fixed. Holding the height fixed as well would
 * letterbox the chart on a wide sidebar — 727 by 168 pixels on a 2560px
 * monitor, a 4.3:1 band that flattens every line in it. The ratio and the two
 * bounds are PartnerTrends', so the three charts on this tab are the same
 * rectangle at every sidebar width; the pair plot used to take a fifth of the
 * width and read as a footnote to the chart above rather than as the second
 * chart of three.
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

/**
 * Value labels in one column, pushed apart so no two sit on each other.
 *
 * The one-pass resolution PartnerTrends already uses for the term names at the
 * right edge of its house profile: walk down the column pushing each label to
 * at least LABEL_GAP below the one above, then walk back up so the run stays
 * inside the plot. What moves is the label — the point it belongs to never
 * does, because the point is the measurement.
 */
function spread(column, top, bottom) {
  const order = [...column].sort((a, b) => a.base - b.base);
  let floor = top;
  order.forEach((mark) => {
    mark.labelY = Math.max(mark.base, floor);
    floor = mark.labelY + LABEL_GAP;
  });
  let ceiling = bottom;
  for (let i = order.length - 1; i >= 0; i -= 1) {
    order[i].labelY = Math.min(order[i].labelY, ceiling);
    ceiling = order[i].labelY - LABEL_GAP;
  }
  return column;
}

/**
 * Which points on a plot carry their number.
 *
 * One rule for every chart on this tab: each line's last drawn point, so the
 * plot reads without a hover at all, plus every line at the term under the
 * cursor. A line whose last point *is* that term gets one label, not two. This
 * replaced three different answers to the same question — a readout box under
 * the first chart, numbers over the second, a value column in the third's
 * legend — with the one the second chart was already giving.
 *
 * Laid out a column at a time, so a crowded hover never nudges the labels
 * standing at the end of the plot.
 */
function valueMarks(lines, activeIndex, top, bottom) {
  const marks = [];
  lines.forEach((line) => {
    const end = [...line.points].reverse().find(Boolean);
    const active = activeIndex >= 0 ? line.points[activeIndex] : null;
    [end, active].forEach((point) => {
      if (!point) return;
      if (marks.some((mark) => mark.key === line.key && mark.i === point.i)) return;
      marks.push({
        key: line.key,
        color: line.color,
        i: point.i,
        x: point.x,
        base: point.y - LABEL_LIFT,
        value: point.value,
        current: point.i === activeIndex,
      });
    });
  });
  const columns = new Map();
  marks.forEach((mark) => {
    if (!columns.has(mark.i)) columns.set(mark.i, []);
    columns.get(mark.i).push(mark);
  });
  columns.forEach((column) => spread(column, top, bottom));
  return marks;
}

// A number at either end of the axis leans inward rather than over the edge.
const labelAnchor = (i, last) => (i === 0 ? "start" : i === last ? "end" : "middle");
const labelX = (x, i, last) => (i === 0 ? x + 5 : i === last ? x - 5 : x);

/** The chevron every collapsing section in the sidebar wears. */
function Chevron({ collapsed }) {
  return (
    <svg
      className={`collapse-icon ${collapsed ? "collapsed" : ""}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export default function TrendsPanel({
  mandate,
  onMandateChange,
  selectedCountry = null,
  selectedSubject = null,
  // Owned by the sidebar, so the SVG export draws the reading on screen rather
  // than whichever one this panel happened to open on. Same arrangement as the
  // partner panel's pivot.
  measure = "averages",
  onMeasureChange,
}) {
  const [loaded, setLoaded] = useState(null);
  const [parliament, setParliament] = useState(null);
  const [hovered, setHovered] = useState(null);
  // Each chart on this tab folds away from its own heading, the way every other
  // sidebar's sections do; the two here are independent because they answer
  // different questions and a reader is usually following one of them.
  const [mainClosed, setMainClosed] = useState(false);
  const [pairClosed, setPairClosed] = useState(false);
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
    () => ({ ...CHART_BOX, width: chartWidth, height: ratio(chartWidth, 0.5, 168, 300) }),
    [chartWidth]
  );
  // `height` is the plot; `total` adds the band of pair labels under its axis,
  // which is drawn inside the same SVG so the names sit exactly under the
  // points they belong to.
  const SPARK = useMemo(() => {
    const height = ratio(chartWidth, 0.5, 168, 300);
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
  const byFamily = measure === "families";
  const drawn = byFamily ? FAMILY_SERIES : SERIES;
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
        drawn.forEach((s) => {
          const value = s.value(row);
          if (finite(value)) values.push(value);
        });
      });
    };
    collect(series);
    collect(reference);
    if (values.length === 0) return null;

    // Fixed at 0-100, not fitted: see AXIS. The collection above is still what
    // decides whether there is anything to draw at all.
    //
    // The by-family reading is the one exception, and it is not a fitted axis
    // either. Group cohesion is a number that lives between 85 and 96 — six of
    // the seven families sit inside eight points of each other — so on 0-100
    // they draw as one thick line in the top eighth of an empty plot. This
    // floors at 50 instead: still fixed, so ticking a term or changing scope
    // does not move it, and still starting well below anything the measure
    // reaches, so the lines are not floated off a cropped baseline. The floor
    // drops further only if some scope genuinely goes under it — a chart that
    // silently clipped a value would be worse than one that is hard to read.
    const domain = byFamily
      ? [Math.min(0.5, Math.floor(Math.min(...values) * 10) / 10), 1]
      : AXIS;
    const span = domain[1] - domain[0] || 1;
    // Quarters over a full axis, tenths over a short one: 50/63/75/88 are not
    // numbers anybody reads off a percentage scale.
    const tickStep = span > 0.6 ? 0.25 : 0.1;
    const ticks = [];
    for (let step = Math.ceil((domain[0] - 1e-9) / tickStep); ; step += 1) {
      const value = step * tickStep;
      if (value > domain[1] + 1e-9) break;
      ticks.push(Math.round(value * 100) / 100);
    }

    const plotWidth = CHART.width - CHART.left - CHART.right;
    const plotHeight = CHART.height - CHART.top - CHART.bottom;
    // Five fixed slots, one per term, whether or not this view reaches them.
    const step = TERMS.length > 1 ? plotWidth / (TERMS.length - 1) : 0;
    const x = (i) => CHART.left + step * i;
    const y = (v) => CHART.top + plotHeight * (1 - (v - domain[0]) / span);

    // A series reads its own value off a row rather than being handed a key:
    // the averages sit at the top level and a family's cohesion sits inside a
    // map, and the chart should not have to know which.
    const place = (rows, get, extra) =>
      TERMS.map((term, i) => {
        const row = (rows || []).find((entry) => entry.mandate === term.mandate);
        const value = row ? get(row) : undefined;
        if (!row || !finite(value)) return null;
        return { x: x(i), y: y(value), value, i, ...(extra ? extra(row) : null) };
      });

    const lines = drawn
      .map((s) => ({
        ...s,
        points: place(series, s.value, (row) => ({ thin: Boolean(row.thin) })),
        referencePoints: reference ? place(reference, s.value) : null,
      }))
      // A family with no line at all — absent from every term this scope
      // reaches — would otherwise sit in the legend naming nothing.
      .filter((line) => line.points.some(Boolean));

    // The lowest-agreeing pair, on its own scale beneath the main plot.
    const pairValues = series
      .map((row) => (row.lowestPair ? row.lowestPair.score : null))
      .filter(finite);
    let spark = null;
    if (pairValues.length > 1) {
      // The same 0-100 axis as the plot above, which is what lets 18 down here
      // be read against 53 up there. Where this line sits relative to *never
      // voting together* is the reading, so the floor was always zero; what
      // changed is that the ceiling is no longer this series' own maximum.
      const pdomain = AXIS;
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
        // How many characters a group acronym gets under one term. Budgeted
        // over the whole row rather than one column: the end labels are pushed
        // off their points to stay inside the plot, so what has to fit is five
        // names and four gaps across the axis. ~5.6px per character at 9px,
        // measured.
        chars: Math.max(3, Math.floor((0.8 * sstep) / 5.6)),
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

    return { domain, ticks, x, y, lines, spark, step, plotHeight, plotWidth };
  }, [series, reference, drawn, byFamily, CHART, SPARK]);

  const activeIndex =
    hovered !== null ? hovered : TERMS.findIndex((term) => term.mandate === mandate);

  const thinRows = (series || []).filter((row) => !row.missing && row.thin);
  const missingRows = (series || []).filter((row) => row.missing);
  const lastSpark =
    geometry && geometry.spark
      ? [...geometry.spark.points].reverse().find(Boolean)
      : null;

  /**
   * Where each term's two chips sit under the axis.
   *
   * Centred on the term's point, then constrained: inside the plot at the two
   * ends, and never closer than PAIR_MIN_GAP to a neighbour. Both constraints
   * bind on a narrow sidebar — T10's name is pushed left off its point, which
   * can walk into T9's — so the row is placed in one pass over all five columns
   * rather than each column on its own. What moves is the *label*: the square
   * and its name are one block, so a nudged column stays square-over-name.
   */
  const pairLayout = useMemo(() => {
    if (!geometry || !geometry.spark) return null;
    const blocks = TERMS.map((term, i) => {
      const point = geometry.spark.points[i];
      const names = point
        ? [point.pair.a, point.pair.b].map((id) =>
            clip(getGroupAcronym(id, term.mandate), geometry.spark.chars)
          )
        : [];
      const width =
        names.length > 0
          ? Math.max(
              PAIR_SWATCH,
              Math.max(...names.map((name) => name.length)) * 5.6
            )
          : PAIR_SWATCH;
      return { names, width, left: geometry.spark.x(i) - width / 2 };
    });

    let limit = SPARK.width - 1;
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      blocks[i].left = Math.min(blocks[i].left, limit - blocks[i].width);
      limit = blocks[i].left - PAIR_MIN_GAP;
    }
    let floor = 1;
    blocks.forEach((block) => {
      block.left = Math.max(block.left, floor);
      floor = block.left + block.width + PAIR_MIN_GAP;
      // Everything in the band is drawn from the column's centre.
      block.centre = block.left + block.width / 2;
    });
    return blocks;
  }, [geometry, SPARK]);

  // Which raw groups stood for each family, in the terms on screen — named
  // only under the by-family lines, where a merged line is a claim the reader
  // has to be able to reject. The same note, from the same field, that the
  // partner panel prints at the bottom of this tab.
  const lineage = useMemo(() => {
    if (!byFamily || !series) return [];
    const seen = new Map();
    series.forEach((row) => {
      Object.entries(row.familyMembers || {}).forEach(([family, groups]) => {
        if (!seen.has(family)) seen.set(family, new Set());
        groups.forEach((group) => seen.get(family).add(group));
      });
    });
    return FAMILY_ORDER.map((family) => ({
      family,
      label: FAMILIES[family].label,
      groups: [...(seen.get(family) || [])],
    })).filter((entry) => entry.groups.length > 1);
  }, [byFamily, series]);

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
      <div className="sb-panel-head">
        <h3 className="trends-title">Five terms compared</h3>
        <div className="sb-panel-controls">
          {!mainClosed && (
            <SegmentedToggle
              value={measure}
              onChange={onMeasureChange || (() => {})}
              options={MEASURES}
              label=""
            />
          )}
          <button
            type="button"
            className="sb-collapse"
            aria-expanded={!mainClosed}
            onClick={() => setMainClosed(!mainClosed)}
            title={mainClosed ? "Show this chart" : "Hide this chart"}
          >
            <Chevron collapsed={mainClosed} />
          </button>
        </div>
      </div>

      <div className={`collapsible-content ${!mainClosed ? "expanded" : ""}`}>
        <div className="trends-description">
          {scoped ? (
            <>
              {byFamily ? "Agreement inside each political family" : "Voting agreement"} in{" "}
              <strong>{scopeLabel}</strong>, term by term.
              {reference && (
                <span className="baseline-note">
                  The faint lines behind are the whole Parliament.
                </span>
              )}
            </>
          ) : byFamily ? (
            "Agreement inside each political family, term by term. Almost every one of them holds together more tightly than it did."
          ) : (
            "Groups vote together more than they used to, and national delegations less."
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
            {/* Legend. Present for every multi-series chart, so identity is
                never carried by colour alone. */}
            <ul className="trends-legend">
              {geometry.lines.map((s) => (
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
                  title="The same lines for the whole Parliament"
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
                {byFamily
                  ? `Agreement inside each political family in ${scopeLabel} across five parliamentary terms`
                  : `Average voting agreement in ${scopeLabel} across five parliamentary terms`}
              </title>

              {geometry.ticks.map((value) => {
                const y = geometry.y(value);
                return (
                  <g key={value}>
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
                </g>
              ))}

              {/* Every line's number on the plot itself: its last drawn point,
                  so the chart reads without a hover, and the whole column under
                  the cursor. Drawn after all three lines so the halo on a label
                  covers whichever line runs behind it, and pushed apart where
                  two lines meet — the labels move, the points do not. */}
              {valueMarks(
                geometry.lines,
                activeIndex,
                CHART.top + LABEL_LIFT,
                CHART.height - CHART.bottom
              ).map((mark) => (
                <text
                  key={`${mark.key}-${mark.i}`}
                  x={labelX(mark.x, mark.i, TERMS.length - 1)}
                  y={mark.labelY}
                  className={`trends-point-label ${mark.current ? "current" : ""}`}
                  textAnchor={labelAnchor(mark.i, TERMS.length - 1)}
                  fill={mark.color}
                >
                  {(mark.value * 100).toFixed(0)}
                </text>
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
                          : `${term.short}, ${term.years}. ${drawn
                              .map((s) => `${s.label} ${pct(s.value(row))}`)
                              .join(", ")}${
                              row.thin ? `, on ${row.sessions} votes` : ""
                            }. Open this term.`
                      }
                    >
                      {/* How big the term is. The readout box under this chart
                          used to carry the sample and the three figures both;
                          the figures moved onto the plot, and the sample sits
                          where the other two charts already keep theirs. */}
                      <title>
                        {absent
                          ? `${term.short}, ${term.years}: no network for ${scopeLabel}`
                          : `${term.short}, ${term.years}: ${thousands(
                              row.nodeCount
                            )} MEPs${
                              row.sessions ? `, ${thousands(row.sessions)} votes` : ""
                            }`}
                      </title>
                    </rect>
                  </g>
                );
              })}
            </svg>
          </>
        )}
      </div>

      {/* The second chart. Its own section with its own chevron, at the same
          size and on the same axis as the first: a different question about the
          same five terms, not a footnote to the answer above. */}
      {status === "ready" && geometry && geometry.spark && lastSpark && (
        <div className="trends-spark-block">
          <div className="sb-panel-head">
            <h3 className="trends-spark-title">The two groups furthest apart</h3>
            <div className="sb-panel-controls">
              <button
                type="button"
                className="sb-collapse"
                aria-expanded={!pairClosed}
                onClick={() => setPairClosed(!pairClosed)}
                title={pairClosed ? "Show this chart" : "Hide this chart"}
              >
                <Chevron collapsed={pairClosed} />
              </button>
            </div>
          </div>

          <div className={`collapsible-content ${!pairClosed ? "expanded" : ""}`}>
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
              {/* The plot above's axis, not a version of it: same 0-100
                  scale, same quarters, same hairline grid, same smallest-tier
                  labels. Seeing 18 here under 53 up there is the whole reason
                  this is a second chart, and that only reads if the number is
                  measured the same way in both. */}
              {AXIS_TICKS.map((value) => {
                const y = geometry.spark.y(value);
                return (
                  <g key={value}>
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

              {/* The last point and whichever term is under the cursor —
                  valueMarks, the same rule the plot above and the partner
                  lines below now follow. The number is on the plot rather
                  than in a box or a caption, so it survives a print. */}
              {valueMarks(
                [{ key: "pair", color: "var(--sb-ink)", points: geometry.spark.points }],
                activeIndex,
                SPARK.top + LABEL_LIFT,
                SPARK.height - SPARK.bottom
              ).map((mark) => (
                <text
                  key={mark.i}
                  x={labelX(mark.x, mark.i, TERMS.length - 1)}
                  y={mark.labelY}
                  className={`trends-point-label ${mark.current ? "current" : ""}`}
                  textAnchor={labelAnchor(mark.i, TERMS.length - 1)}
                  fill={mark.color}
                >
                  {(mark.value * 100).toFixed(0)}
                </text>
              ))}

              {/* Under the axis: the two groups this term's point is
                  about, each on the coloured swatch the rest of the site
                  uses for that group. The pair changes term to term, so
                  it belongs on the axis and not in a caption. */}
              {TERMS.map((term, i) => {
                const point = geometry.spark.points[i];
                const active = i === activeIndex;
                const x = geometry.spark.x(i);
                const pair = point ? [point.pair.a, point.pair.b] : [];
                const { names, centre } = pairLayout[i];
                return (
                  <g key={term.mandate}>
                    <title>
                      {point
                        ? `${term.short}, ${term.years}: ${getGroupAcronym(
                            point.pair.a,
                            term.mandate
                          )} and ${getGroupAcronym(point.pair.b, term.mandate)}, ${pct(
                            point.value
                          )}`
                        : `${term.short}, ${term.years}: no network for ${scopeLabel}`}
                    </title>

                    {/* Term over years, as on the chart above. A reader
                        arriving at this plot from the one above should not
                        have to scroll back up to find out that T6 is
                        2004-2009. */}
                    <text
                      x={x}
                      y={SPARK.height - 16}
                      className={`trends-tick ${term.mandate === mandate ? "current" : ""} ${
                        point ? "" : "absent"
                      }`}
                      textAnchor="middle"
                    >
                      {term.short}
                    </text>
                    <text
                      x={x}
                      y={SPARK.height - 7}
                      className={`trends-tick-years ${point ? "" : "absent"}`}
                      textAnchor="middle"
                    >
                      {term.years}
                    </text>

                    {point ? (
                      pair.map((id, row) => (
                        <g key={id}>
                          <rect
                            x={centre - PAIR_SWATCH / 2}
                            y={SPARK.height + 2 + row * PAIR_ROW}
                            width={PAIR_SWATCH}
                            height={PAIR_SWATCH}
                            rx="2"
                            className="trends-pair-swatch"
                            fill={getGroupColor(id)}
                            {...groupSwatchStroke(id, 0.8)}
                          />
                          <text
                            x={centre}
                            y={SPARK.height + 19 + row * PAIR_ROW}
                            className={`trends-pair-name ${active ? "current" : ""}`}
                            textAnchor="middle"
                          >
                            {names[row]}
                          </text>
                        </g>
                      ))
                    ) : (
                      <text
                        x={centre}
                        y={SPARK.height + 12}
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
                          ? `${term.short}, ${term.years}. Furthest apart: ${getGroupAcronym(
                              point.pair.a,
                              term.mandate
                            )} and ${getGroupAcronym(
                              point.pair.b,
                              term.mandate
                            )}, ${pct(point.value)}. Open this term.`
                          : `${term.short}, ${term.years}. No network for ${scopeLabel} in this term.`
                      }
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* What the reader has to know before quoting either chart: which points
          are thin, and which terms are not here. Outside both sections — the
          hollow markers they explain are drawn on both plots, and a caveat that
          folds away with one of them is a caveat that can be missed. */}
      {status === "ready" && geometry && (
        <>
          {thinRows.length > 0 && (
            <p className="sb-note trends-caveat">
              Hollow markers rest on fewer than {MIN_TERM_SESSIONS} votes
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
          {lineage.length > 0 && (
            <p className="sb-note trends-caveat">
              Merged across renames:{" "}
              {lineage.map((entry, i) => (
                <span key={entry.family}>
                  {i > 0 ? "; " : ""}
                  <strong>{entry.label}</strong> is {entry.groups.join(", ")}
                </span>
              ))}
              . A merged line averages its groups&rsquo; own cohesion, which is not the
              same as how far those groups agree with each other.
            </p>
          )}
        </>
      )}
    </div>
  );
}
