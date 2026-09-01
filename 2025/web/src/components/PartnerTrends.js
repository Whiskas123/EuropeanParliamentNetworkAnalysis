"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { loadTrendSeries, TERMS } from "../lib/trends.js";
import {
  FAMILIES,
  FAMILY_ORDER,
  opening,
  pairKey,
  profileFor,
} from "../lib/families.js";
import SegmentedToggle from "./SegmentedToggle";
import "../styles/profile.scss";
import "../styles/partners.scss";

/**
 * One group's partners, across five terms.
 *
 * The panel above plots the Parliament's *averages* — within group, within
 * country, between groups. Averages are where this question goes to die: the
 * between-groups line falls 59.1% to 53.2% across the five terms, which reads
 * as "the house is polarising" and is wrong in an interesting way. Drop the far
 * right from the same calculation and the remaining pairs run 62.9, 60.3, 63.1,
 * 65.8, 64.3 — flat, if anything rising. The entire decline is one bloc
 * separating from a chamber that is otherwise converging, and no average can
 * say that because averaging is what hid it.
 *
 * So this panel plots the pairs. Pick a group and it draws that group's
 * agreement with each of the other six, which is the level at which the
 * questions people actually ask are answerable:
 *
 * - **Has the EPP drifted toward the far right?** No — the opposite, and not
 *   narrowly. EPP-to-S&D is 0.67, 0.72, 0.73, 0.73, 0.78, its highest in the
 *   five terms; EPP-to-far-right is 0.53, 0.57, 0.42, 0.55, 0.41, its lowest.
 *   The gap between the EPP's two possible partners went from 13 points to 37.
 * - **Are the Greens converging on the socialists?** Yes, monotonically:
 *   0.71, 0.76, 0.78, 0.84, 0.87.
 * - **Where have the socialists moved?** Not left or right so much as *in*:
 *   S&D-to-Renew is now 0.87, the closest pair anywhere in the house, while
 *   S&D-to-far-right has collapsed from 0.46 to 0.27.
 *
 * Four forms, because the same six series answer different shapes of question
 * and one chart cannot do them all. Lines carry trajectory and the crossings
 * between partners. Arrows state *how far* each partner moved, first term to
 * last, which is the summary a line chart makes you measure by eye; the terms
 * in between sit on the same row as waypoints, so a saw is not read as a
 * drift. The track spends a vertical step on each term instead, which is the
 * one form where a reversal is a shape rather than a dot in an odd place. The
 * house profile puts the seven families on the x-axis in seating order and
 * draws one line per term, so what moves is the shape of the chamber seen from
 * one seat — the reading where the EPP's collapsing right shoulder is a single
 * visible fact rather than two series compared.
 *
 * Everything is drawn on *families*, never raw group ids: PSE and S&D are one
 * line, as are ALDE/Renew and the five-name far-right lineage. Without that
 * every series is a stub and no five-term question can be asked at all. The
 * merge is an editorial claim and families.js says what it asserts; the panel
 * names the constituent groups per term underneath so a reader can reject it.
 *
 * Like the trends panel, this follows the sidebar's scope: with Poland x
 * Fisheries open it plots Poland's MEPs in Fisheries, not the Parliament.
 */

/** Width assumed before the panel has been measured, and on the server. */
const ASSUMED_WIDTH = 336;

/** Plot boxes in real screen pixels — everything but the width, measured. */
const LINE_BOX = { top: 12, right: 12, bottom: 26, left: 26 };
// The profile chart's right margin holds each line's term name, so it is wider
// than the others: the lines are told apart by which term they are, and a
// legend across the panel would make the reader match six greys to five names.
const PROFILE_BOX = { top: 12, right: 26, bottom: 30, left: 26 };
// The arrow chart's right margin holds each row's change in points. These
// panels end up printed, where the tooltip that also carries it does not
// exist, and the one number this form is about should not be hover-only.
const ARROW_BOX = { top: 8, right: 40, bottom: 20, left: 52 };

/** One row of the arrow chart, and the dot that starts it. */
const ARROW_ROW = 19;
const ARROW_DOT = 3.2;

/**
 * How faint and how small a waypoint is, by where its term sits in the run.
 *
 * A property of the *term*, not of the row it is drawn on. It was per row at
 * first — each family's own first-to-last — which put two different shades on
 * one term whenever a family was missing an end, and made the key under the
 * chart impossible to draw truthfully. Now T6 looks the same on every row, so
 * a reader can name a dot by matching it against the chips below.
 */
const waypointShade = (index, last) => ({
  opacity: 0.35 + (0.45 * index) / Math.max(1, last),
  r: 1.8 + (1 * index) / Math.max(1, last),
});

/**
 * The track form: one vertical step per term inside a family's band, and the
 * clearance between two bands.
 *
 * The arrow form draws a pair's whole history on one row, where a term is a
 * position and nothing separates the middle ones except how faint they are.
 * The track spends a second dimension on time — oldest at the top of the band,
 * newest at the bottom — which is what makes a reversal legible: a pair that
 * rose for three terms and fell back reads as a corner rather than as a dot
 * sitting on the wrong side of its own arrow. It costs height, roughly four
 * times the arrow form's, which is why both are here rather than one.
 */
const TRACK_STEP = 11;
const TRACK_GAP = 14;

/**
 * Clearance between two labels sharing a column, and how far a value floats
 * above the point it belongs to.
 *
 * One pair of numbers for the term names at the right edge of the house profile
 * and for the figures over the partner lines: both are the same problem, a
 * column of small text that must not pile up, and TrendsPanel resolves it the
 * same way on the two charts above.
 */
const LABEL_GAP = 10;
const LABEL_LIFT = 8;

/**
 * Change is red or green, as it is on every DeltaBadge in the sidebar.
 *
 * Only the arrow chart uses these: it is the one form whose subject *is* the
 * change. The line and profile charts colour by political family instead,
 * because there a colour has to say which party, and no mark can carry two
 * meanings on the same page.
 */
const CLOSER = "#1a6b3c";
const APART = "#a32a1e";

const FORMS = [
  { id: "lines", text: "Lines", title: "Agreement with each family, term by term" },
  {
    id: "arrows",
    text: "Shift",
    title: "How far each partner moved, first term to last, with every term in between on the row",
  },
  {
    id: "track",
    text: "Track",
    title: "The path each partner took through the terms, oldest at the top",
  },
  { id: "profile", text: "House", title: "The whole chamber seen from this group's seat" },
];

const finite = (value) => typeof value === "number" && isFinite(value);
const pct = (value) => (finite(value) ? `${(value * 100).toFixed(1)}%` : "—");
const points = (value) => (finite(value) ? `${value >= 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(1)}` : "—");

const ratio = (width, of, min, max) =>
  Math.round(Math.max(min, Math.min(max, width * of)));

const toPath = (pts) =>
  pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

/**
 * A line with holes in it — the same rule the trends panel uses.
 *
 * A term this scope never reached, or a family that did not exist in it, is a
 * gap rather than a value to interpolate across. In the house profile the gap
 * is also structural: the pivot family's own slot on the axis carries no point,
 * because a group's agreement with itself is intra-group cohesion, a different
 * measure that must not be plotted on this line.
 */
function segments(pts) {
  const runs = [];
  let run = [];
  pts.forEach((point) => {
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

/**
 * Value labels in one column, pushed apart so no two sit on each other, and
 * which points carry one.
 *
 * The same two helpers TrendsPanel uses for the charts above — duplicated here
 * rather than shared, as `segments` and `toPath` already are, because a chart
 * file in this app carries its own drawing primitives. The rule is one rule
 * across the whole History tab: each line's last drawn point, so the plot reads
 * without a hover, plus every line at the term under the cursor. That replaced
 * the value column this panel used to keep in its legend, which was a caption
 * beside the chart rather than a number on it and did not survive a print.
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

function valueMarks(lines, activeIndex, top, bottom) {
  const marks = [];
  lines.forEach((line) => {
    const end = [...line.points].reverse().find(Boolean);
    const active = activeIndex !== null && activeIndex >= 0 ? line.points[activeIndex] : null;
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

/**
 * Each partner's run of drawn terms, in seating order.
 *
 * Shared by the two change forms, which are the same six series read at two
 * densities: the arrow lays the run out along one row, the track spends a
 * vertical step per term on it. Both keep `partners` in the order it arrives —
 * FAMILY_ORDER, which is the order of the chips above and of the house
 * profile's x-axis. They used to rank by the size of the net move, which is a
 * better answer to "who moved" and a worse chart: the rows reshuffled whenever
 * the pivot or a term changed, so switching form or ticking a term moved every
 * family under the reader, and the same group sat in a different place on each
 * of the four forms. One order across the panel is worth more than a ranking
 * the delta column already states.
 *
 * `present` is only the terms this pair actually reached — a family absent
 * from either end shifts its own first and last, which are not always the
 * first and last term ticked above.
 */
function movements(partners, rows) {
  return partners
    .map((partner, index) => {
      const present = partner.values
        .map((value, i) => (finite(value) ? { value, i, term: rows[i] } : null))
        .filter(Boolean)
        .map((point, rank) => ({ ...point, rank }));
      if (present.length < 2) return null;
      const from = present[0];
      const to = present[present.length - 1];
      return {
        ...partner,
        index,
        present,
        from,
        to,
        delta: to.value - from.value,
        fromTerm: from.term,
        toTerm: to.term,
      };
    })
    .filter(Boolean);
}

// A number at either end of the axis leans inward rather than over the edge.
const labelAnchor = (i, last) => (i === 0 ? "start" : i === last ? "end" : "middle");
const labelX = (x, i, last) => (i === 0 ? x + 5 : i === last ? x - 5 : x);

/**
 * The mark one term wears on the Shift chart, drawn at chip size.
 *
 * The chips under that chart are its key as well as its control: a row there
 * is five positions on one axis and the only thing telling T6 from T9 is how
 * faint the dot is, which is unreadable without something to match it against.
 * So each chip carries its own term's mark — the filled dot the arrows start
 * from, the arrowhead they end on, the ringed circle in between at that term's
 * exact shade. Ink grey, not the row's red or green: on the chart the colour
 * says which direction the pair moved, and a key repeating it would claim
 * every term had one.
 *
 * `index` is the term's place among the *ticked* terms, which is what the
 * shading is keyed to. A term that is off is drawn as the middle mark at full
 * strength, since it has no place in a run it is not part of.
 */
function TermMark({ index, last, on }) {
  const shade = on ? waypointShade(index, last) : { opacity: 1, r: 2.4 };
  const first = on && index === 0;
  const final = on && index === last;
  return (
    <svg className="partners-term-mark" width="11" height="9" aria-hidden="true">
      {final ? (
        <path d="M 2 1 L 9.5 4.5 L 2 8 z" fill="currentColor" />
      ) : first ? (
        <circle cx="5.5" cy="4.5" r={ARROW_DOT} fill="currentColor" />
      ) : (
        <circle
          cx="5.5"
          cy="4.5"
          r={shade.r}
          fill="#ffffff"
          stroke="currentColor"
          strokeWidth="1.3"
          opacity={shade.opacity}
        />
      )}
    </svg>
  );
}

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

/**
 * The axis, fixed at 0–100% on every form.
 *
 * These charts used to scale to their own data, which reads better in
 * isolation — a fitted axis fills the plot and every wobble is visible — and is
 * the wrong default here, because the axis then changes underneath the reader.
 * Switching pivot from the EPP to the far right, or ticking a term off, silently
 * redrew the scale, so two panels showing genuinely different levels looked
 * alike and a line that had barely moved could fill the plot. The controls
 * above invite exactly that comparison.
 *
 * Fixed means a line's height is a fact about the number, not about which
 * options happen to be selected, and the three forms can be read against each
 * other. The cost is real and accepted: agreement between two groups is rarely
 * below 20% or above 90%, so the top and bottom fifths of every plot stay
 * empty and small movements are smaller than they were.
 */
const AXIS = [0, 1];

/** Quarters of the axis — the gridlines every form shares. */
const AXIS_TICKS = [0, 0.25, 0.5, 0.75, 1];

export default function PartnerTrends({
  mandate,
  // Clicking a term column opens that term's network, as it does on the two
  // charts above: a term tick on this tab is a way into the term, not a label.
  onMandateChange,
  selectedCountry = null,
  selectedSubject = null,
  // Owned by the sidebar, so the SVG export draws the family on screen rather
  // than whichever one this panel happened to open on.
  pivot = "EPP",
  onPivotChange,
}) {
  const [form, setForm] = useState("lines");
  const [chosen, setChosen] = useState(() => TERMS.map((term) => term.mandate));
  const [loaded, setLoaded] = useState(null);
  const [hovered, setHovered] = useState(null);
  // The third of the History tab's three sections, folding away from its own
  // heading like the two above it and like every section in the other sidebars.
  const [closed, setClosed] = useState(false);
  const [width, setWidth] = useState(ASSUMED_WIDTH);
  const panelRef = useRef(null);
  const titleId = useId();

  const scopeKey = `${selectedCountry || ""}|${selectedSubject || ""}`;

  // Measured so the charts can be drawn at 1:1 — a 9px font in the SVG is the
  // same 9px the ranks and units use elsewhere in the sidebar. See TrendsPanel,
  // which fixes the same bug the same way.
  useEffect(() => {
    const node = panelRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0].contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Shares loadTrendSeries' cache with the panel above, so opening this costs
  // nothing once that one has read the scope.
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

  const series = loaded && loaded.key === scopeKey ? loaded.rows : null;

  // The terms actually drawn: those ticked, in chronological order, that this
  // scope reaches at all.
  const rows = useMemo(() => {
    if (!series) return [];
    return TERMS.filter((term) => chosen.includes(term.mandate))
      .map((term) => series.find((row) => row.mandate === term.mandate))
      .filter((row) => row && !row.missing);
  }, [series, chosen]);

  /** The other six families, and this pivot's agreement with each, per term. */
  const partners = useMemo(
    () =>
      FAMILY_ORDER.filter((family) => family !== pivot).map((family) => ({
        family,
        ...FAMILIES[family],
        values: rows.map((row) => {
          const score = row.familyPairs ? row.familyPairs[pairKey(pivot, family)] : undefined;
          return finite(score) ? score : null;
        }),
      })),
    [rows, pivot]
  );

  const geometry = useMemo(() => {
    if (rows.length === 0) return null;
    const all = partners.flatMap((partner) => partner.values);
    if (!all.some(finite)) return null;

    if (form === "arrows" || form === "track") {
      const domain = AXIS;
      const plotWidth = width - ARROW_BOX.left - ARROW_BOX.right;
      const x = (v) =>
        ARROW_BOX.left + plotWidth * ((v - domain[0]) / (domain[1] - domain[0] || 1));
      const moved = movements(partners, rows);

      if (form === "arrows") {
        const height = ARROW_BOX.top + ARROW_BOX.bottom + moved.length * ARROW_ROW;
        const bars = moved.map((bar, rank) => {
          const last = bar.present.length - 1;
          const values = bar.present.map((point) => point.value);
          return {
            ...bar,
            y: ARROW_BOX.top + rank * ARROW_ROW + ARROW_ROW / 2,
            // The whole span the pair covered, which is wider than the arrow
            // whenever a middle term overshot either end of it.
            lo: Math.min(...values),
            hi: Math.max(...values),
            // The terms between the two the arrow names. Older is fainter and
            // smaller: on a row where every term is a position, the ramp is
            // what says which way the row was walked, and the chips under the
            // chart repeat it so a dot can be named rather than guessed at.
            waypoints: bar.present
              .slice(1, last)
              .map((point) => ({ ...point, ...waypointShade(point.i, rows.length - 1) })),
          };
        });
        return { kind: "arrows", domain, height, x, bars };
      }

      // One band per family, one step per *ticked* term rather than per term
      // this pair reached, so a family missing a term leaves the hole where it
      // belongs and every band reads on the same clock.
      const band = Math.max(1, rows.length - 1) * TRACK_STEP;
      const height =
        ARROW_BOX.top +
        ARROW_BOX.bottom +
        moved.length * band +
        Math.max(0, moved.length - 1) * TRACK_GAP;
      const bars = moved.map((bar, rank) => {
        const top = ARROW_BOX.top + rank * (band + TRACK_GAP);
        return {
          ...bar,
          top,
          mid: top + band / 2,
          points: bar.values.map((value, i) =>
            finite(value)
              ? { x: x(value), y: top + i * TRACK_STEP, value, i, term: rows[i] }
              : null
          ),
        };
      });
      return { kind: "track", domain, height, x, band, bars };
    }

    if (form === "profile") {
      const domain = AXIS;
      const height = ratio(width, 0.5, 168, 300);
      const plotWidth = width - PROFILE_BOX.left - PROFILE_BOX.right;
      const plotHeight = height - PROFILE_BOX.top - PROFILE_BOX.bottom;
      // All seven slots, including the pivot's own. Its slot stays empty and
      // is marked, so the chart shows where in the house the reader is standing
      // rather than silently closing the gap.
      const step = plotWidth / Math.max(1, FAMILY_ORDER.length - 1);
      const x = (i) => PROFILE_BOX.left + step * i;
      const y = (v) =>
        PROFILE_BOX.top + plotHeight * (1 - (v - domain[0]) / (domain[1] - domain[0] || 1));
      const lines = rows.map((row, termIndex) => {
        const profile = profileFor(row.familyPairs, pivot);
        return {
          row,
          // Older terms recede; the most recent is solid and full strength, so
          // "now" is the line the eye lands on and the rest are its history.
          opacity: 0.25 + (0.75 * (termIndex + 1)) / rows.length,
          isLatest: termIndex === rows.length - 1,
          points: FAMILY_ORDER.map((family, i) => {
            if (family === pivot) return null;
            const entry = profile.find((item) => item.family === family);
            if (!entry || !finite(entry.score)) return null;
            return { x: x(i), y: y(entry.score), value: entry.score, family, i };
          }),
        };
      });
      // Each line is named at its right end, and on a fixed axis those ends
      // bunch: the EPP's last four terms land within nine pixels of each other
      // and the names print on top of one another. Resolved in one pass over
      // all five rather than per line — nudging one into its neighbour is how
      // the pile started — by walking down the sorted ends and pushing each to
      // at least LABEL_GAP below the one above, then clamping the run inside
      // the plot. What moves is the label, never the point.
      const ends = lines
        .map((line, index) => {
          const drawn = line.points.filter(Boolean);
          return drawn.length > 0 ? { index, y: drawn[drawn.length - 1].y } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.y - b.y);
      let floor = PROFILE_BOX.top;
      ends.forEach((end) => {
        end.labelY = Math.max(end.y, floor);
        floor = end.labelY + LABEL_GAP;
      });
      // If that pushed the last one past the axis, walk back up.
      let ceiling = PROFILE_BOX.top + plotHeight;
      for (let i = ends.length - 1; i >= 0; i -= 1) {
        ends[i].labelY = Math.min(ends[i].labelY, ceiling);
        ceiling = ends[i].labelY - LABEL_GAP;
      }
      const labelled = lines.map((line, index) => {
        const end = ends.find((entry) => entry.index === index);
        return { ...line, labelY: end ? end.labelY : null };
      });

      return {
        kind: "profile",
        domain,
        height,
        x,
        y,
        step,
        lines: labelled,
        plotHeight,
      };
    }

    const domain = AXIS;
    const height = ratio(width, 0.5, 168, 300);
    const plotWidth = width - LINE_BOX.left - LINE_BOX.right;
    const plotHeight = height - LINE_BOX.top - LINE_BOX.bottom;
    const step = rows.length > 1 ? plotWidth / (rows.length - 1) : 0;
    const x = (i) => (rows.length > 1 ? LINE_BOX.left + step * i : LINE_BOX.left + plotWidth / 2);
    const y = (v) =>
      LINE_BOX.top + plotHeight * (1 - (v - domain[0]) / (domain[1] - domain[0] || 1));
    const lines = partners.map((partner) => ({
      ...partner,
      points: partner.values.map((value, i) =>
        finite(value) ? { x: x(i), y: y(value), value, i, thin: Boolean(rows[i].thin) } : null
      ),
    }));
    return { kind: "lines", domain, height, x, y, step, lines, plotHeight };
  }, [rows, partners, form, width, pivot]);

  const status = !series ? "loading" : rows.length === 0 ? "empty" : "ready";

  // The column the chart is reading: whatever is under the cursor, and the term
  // the canvas is showing when nothing is. The same rule the two charts above
  // follow, which is what puts a crosshair and a set of figures on the open term
  // on all three of them rather than on two.
  const activeIndex =
    hovered !== null ? hovered : rows.findIndex((row) => row.mandate === mandate);
  const thinRows = rows.filter((row) => row.thin);

  /** Which raw groups stood for each family, in the terms on screen. */
  const lineage = useMemo(() => {
    const seen = new Map();
    rows.forEach((row) => {
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
  }, [rows]);

  const toggleTerm = (value) => {
    setChosen((current) => {
      if (current.includes(value)) {
        // Two points are the fewest that can carry a change, which is the whole
        // subject of every form here; the last two are not removable.
        return current.length > 2 ? current.filter((item) => item !== value) : current;
      }
      return [...current, value].sort((a, b) => a - b);
    });
  };


  return (
    <section className="partners-panel" aria-labelledby={titleId} ref={panelRef}>
      <div className="sb-panel-head">
        <h3 className="sb-panel-title" id={titleId}>
          {opening(FAMILIES[pivot].possessive)} partners
        </h3>
        <div className="sb-panel-controls">
          <button
            type="button"
            className="sb-collapse"
            aria-expanded={!closed}
            onClick={() => setClosed(!closed)}
            title={closed ? "Show this chart" : "Hide this chart"}
          >
            <Chevron collapsed={closed} />
          </button>
        </div>
      </div>

      <div className={`collapsible-content ${!closed ? "expanded" : ""}`}>
        <p className="sb-panel-desc">
          Agreement with each of the other families, term by term. Groups are
          merged across renames, so the lines can cross multiple terms.
        </p>

        <div className="partners-controls">
          <div className="partners-chips" role="group" aria-label="Political family">
            {FAMILY_ORDER.map((family) => (
              <button
                key={family}
                type="button"
                className="partners-chip"
                aria-pressed={pivot === family}
                onClick={() => onPivotChange && onPivotChange(family)}
                title={`Draw ${FAMILIES[family].possessive} agreement with the other six families`}
              >
                <span
                  className="partners-chip-dot"
                  style={{ background: FAMILIES[family].color }}
                  aria-hidden="true"
                />
                {FAMILIES[family].short}
              </button>
            ))}
          </div>

          <div className="partners-row">
            <SegmentedToggle
              value={form}
              onChange={setForm}
              options={FORMS}
              label="Draw as"
            />
          </div>
        </div>

        {status === "loading" && (
          <p className="sb-status partners-status">Reading twenty years of votes…</p>
        )}
        {status === "empty" && (
          <p className="sb-note partners-status">
            None of the terms ticked above carry this view.
          </p>
        )}

        {status === "ready" && geometry && geometry.kind === "lines" && (
          <LineChart
            geometry={geometry}
            rows={rows}
            width={width}
            pivot={pivot}
            mandate={mandate}
            activeIndex={activeIndex}
            setHovered={setHovered}
            onMandateChange={onMandateChange}
          />
        )}
        {status === "ready" && geometry && geometry.kind === "arrows" && (
          <ArrowChart geometry={geometry} width={width} pivot={pivot} />
        )}
        {status === "ready" && geometry && geometry.kind === "track" && (
          <TrackChart geometry={geometry} width={width} pivot={pivot} />
        )}
        {status === "ready" && geometry && geometry.kind === "profile" && (
          <ProfileChart
            geometry={geometry}
            rows={rows}
            width={width}
            pivot={pivot}
            mandate={mandate}
          />
        )}
        {status === "ready" && !geometry && (
          <p className="sb-note partners-status">
            This view has no group pairs to compare — it holds one family.
          </p>
        )}

        {/* Which terms are drawn, under the chart rather than over it: on the
            Shift form this row is also the chart's key, and a key belongs
            beside the marks it explains. Each chip is the term's own mark plus
            its name and years, so the control and the legend are one thing
            rather than two rows saying half of it each. */}
        <div className="partners-terms" role="group" aria-label="Terms compared">
          {TERMS.map((term) => {
            const on = chosen.includes(term.mandate);
            // Where this term sits among the ones actually drawn — not among
            // the five, and not among the ticked ones either: a term ticked in
            // a scope that never reached it is absent from the chart.
            const index = rows.findIndex((row) => row.mandate === term.mandate);
            return (
              <button
                key={term.mandate}
                type="button"
                className="partners-term"
                aria-pressed={on}
                onClick={() => toggleTerm(term.mandate)}
                title={`${term.short}, ${term.years}`}
              >
                {form === "arrows" && index >= 0 && (
                  <TermMark index={index} last={rows.length - 1} on={on} />
                )}
                <span className="partners-term-name">{term.short}</span>
                <span className="partners-term-years">{term.years}</span>
              </button>
            );
          })}
        </div>

        {/* Identity only, and only where colour carries it. The figures used to
            live here too, in a value column that changed under a hover — a
            caption beside the chart rather than a number on it, and the one
            reading on this tab a printed sheet lost entirely. They are on the
            lines now. The three forms that name terms rather than families
            dropped their legend when the term chips above grew years: it was
            the same five rows printed twice. */}
        {status === "ready" && geometry && geometry.kind === "lines" && (
          <ul className="partners-legend">
            {partners.map((entry) => (
              <li className="partners-legend-item" key={entry.family}>
                <span
                  className="partners-legend-dot"
                  style={{ background: entry.color }}
                  aria-hidden="true"
                />
                {entry.label}
              </li>
            ))}
          </ul>
        )}


        {lineage.length > 0 && (
          <p className="sb-note partners-caveat">
            Merged across renames:{" "}
            {lineage.map((entry, i) => (
              <span key={entry.family}>
                {i > 0 ? "; " : ""}
                <strong>{entry.label}</strong> is {entry.groups.join(", ")}
              </span>
            ))}
            .
          </p>
        )}

        {thinRows.length > 0 && (
          <p className="sb-note partners-caveat">
            {thinRows.map((row) => `${row.short} (${row.sessions} votes)`).join(", ")}{" "}
            {thinRows.length === 1 ? "rests" : "rest"} on too few votes to carry a
            trend on {thinRows.length === 1 ? "its" : "their"} own.
          </p>
        )}
      </div>
    </section>
  );
}

/** Terms on the x-axis, one coloured line per partner family. */
function LineChart({
  geometry,
  rows,
  width,
  pivot,
  mandate,
  activeIndex,
  setHovered,
  onMandateChange,
}) {
  const { domain, height, x, y, lines, plotHeight } = geometry;
  const ticks = AXIS_TICKS;

  return (
    <svg
      className="partners-chart"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${FAMILIES[pivot].label} agreement with each other family across ${rows
        .map((row) => row.short)
        .join(", ")}`}
    >
      {ticks.map((value) => (
        <g key={value}>
          <line
            className="partners-grid"
            x1={LINE_BOX.left}
            x2={width - LINE_BOX.right}
            y1={y(value)}
            y2={y(value)}
          />
          {/* Right-aligned against the plot, as on the two charts above: a
              column of numbers to read down, not a ragged edge. */}
          <text
            className="partners-axis-label"
            x={LINE_BOX.left - 5}
            y={y(value) + 3}
            textAnchor="end"
          >
            {Math.round(value * 100)}
          </text>
        </g>
      ))}

      {rows.map((row, i) => (
        <g key={row.mandate}>
          {activeIndex === i && (
            <line
              className="partners-crosshair"
              x1={x(i)}
              x2={x(i)}
              y1={LINE_BOX.top}
              y2={LINE_BOX.top + plotHeight}
            />
          )}
          {/* Term over years, as on the two charts above. T6 means nothing on
              its own, and the reader should not have to scroll up to the first
              chart to find out that it is 2004-2009. */}
          <text
            className={`partners-tick ${row.mandate === mandate ? "current" : ""}`}
            x={x(i)}
            y={height - 14}
            textAnchor="middle"
          >
            {row.short}
          </text>
          <text className="partners-tick-years" x={x(i)} y={height - 5} textAnchor="middle">
            {row.years}
          </text>
        </g>
      ))}

      {lines.map((line) => (
        <g key={line.family}>
          {segments(line.points).map((run, i) => (
            <path
              key={i}
              d={toPath(run)}
              fill="none"
              stroke={line.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {line.points.filter(Boolean).map((point) => (
            <circle
              key={point.i}
              cx={point.x}
              cy={point.y}
              r={point.thin ? 3 : 2.6}
              fill={point.thin ? "#ffffff" : line.color}
              stroke={line.color}
              strokeWidth={1.5}
            >
              <title>
                {`${FAMILIES[pivot].label} and ${line.label}, ${rows[point.i].short}: ${pct(point.value)}`}
              </title>
            </circle>
          ))}
        </g>
      ))}

      {/* Six families is the most crowded column on this tab, so the labels
          are laid out rather than simply offset: each line's last drawn point
          plus the whole column under the cursor, pushed apart to LABEL_GAP and
          clamped inside the plot. Drawn after every line, so a label's halo
          covers whichever line runs behind it. */}
      {valueMarks(
        lines.map((line) => ({ key: line.family, color: line.color, points: line.points })),
        activeIndex,
        LINE_BOX.top + LABEL_LIFT,
        LINE_BOX.top + plotHeight
      ).map((mark) => (
        <text
          key={`${mark.key}-${mark.i}`}
          className={`partners-point-label ${mark.current ? "current" : ""}`}
          x={labelX(mark.x, mark.i, rows.length - 1)}
          y={mark.labelY}
          textAnchor={labelAnchor(mark.i, rows.length - 1)}
          fill={mark.color}
        >
          {Math.round(mark.value * 100)}
        </text>
      ))}

      {/* One hit target per term, wider than the marks it covers, and clickable:
          the same rect the two charts above carry, doing the same two jobs.
          Every column here is a term this scope actually reached — rows drops
          the ones it did not — so unlike TrendsPanel there is no absent case to
          hold back from the click. */}
      {rows.map((row, i) => (
        <rect
          key={row.mandate}
          className="partners-hit"
          x={x(i) - (geometry.step || 40) / 2}
          y={LINE_BOX.top}
          width={geometry.step || 40}
          height={plotHeight}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(i)}
          onBlur={() => setHovered(null)}
          onClick={onMandateChange ? () => onMandateChange(row.mandate) : undefined}
          tabIndex={onMandateChange ? 0 : undefined}
          role={onMandateChange ? "button" : "img"}
          aria-label={`${row.short}, ${row.years}${
            row.sessions ? `, ${row.sessions} votes` : ""
          }${onMandateChange ? ". Open this term." : ""}`}
        >
          <title>
            {`${row.short}, ${row.years}${
              row.sessions ? `: ${row.sessions} votes` : ""
            }`}
          </title>
        </rect>
      ))}
    </svg>
  );
}

/** The two arrowheads both change forms end on, red and green. */
function ArrowHeads({ id }) {
  return (
    <defs>
      {[CLOSER, APART].map((color) => (
        <marker
          key={color}
          id={`${id}-head-${color.slice(1)}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
        </marker>
      ))}
    </defs>
  );
}

/** Every term this pair reached, named with its value, for a tooltip. */
const walk = (bar) =>
  bar.present.map((point) => `${point.term.short} ${pct(point.value)}`).join(" → ");

/**
 * One row per partner, first drawn term to last, with the terms in between on
 * the row as waypoints.
 *
 * The dot is where the pair started and the head is where it ended, so the
 * row's direction is the sign of the change and its length is the size — the
 * two things a line chart makes the reader estimate. Red and green are the
 * sidebar's own change colours, from DeltaBadge.
 *
 * The waypoints were added because the arrow answered its question and hid a
 * second one: EPP-to-far-right runs 53, 57, 42, 55, 41, and an arrow from 53 to
 * 41 says a twelve-point drift where the series is really a saw. They are drawn
 * as the line chart draws a point it wants seen through — white with a coloured
 * ring — because a solid dot in the row's own colour vanishes into the arrow it
 * sits on, and faded by age, since on a single row nothing else can say which
 * end of the walk a dot belongs to. Under all of it runs a hairline over the
 * pair's whole range, so a term that overshot either end of the arrow is
 * visibly still on the row rather than adrift beside it.
 */
function ArrowChart({ geometry, width, pivot }) {
  const { domain, height, x, bars } = geometry;
  const ticks = AXIS_TICKS;
  const id = useId();

  return (
    <svg
      className="partners-chart"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`How far ${FAMILIES[pivot].label}'s agreement with each family moved, ${bars
        .map((bar) => `${bar.label} ${points(bar.delta)} points`)
        .join(", ")}`}
    >
      <ArrowHeads id={id} />

      {ticks.map((value) => (
        <g key={value}>
          <line
            className="partners-grid"
            x1={x(value)}
            x2={x(value)}
            y1={ARROW_BOX.top - 2}
            y2={height - ARROW_BOX.bottom + 2}
          />
          <text
            className="partners-axis-label"
            x={x(value)}
            y={height - 6}
            textAnchor="middle"
          >
            {Math.round(value * 100)}
          </text>
        </g>
      ))}

      {bars.map((bar) => {
        const color = bar.delta >= 0 ? CLOSER : APART;
        return (
          <g key={bar.family}>
            <text className="partners-arrow-name" x={0} y={bar.y + 3}>
              {bar.short}
            </text>
            {bar.hi > bar.lo && (
              <line
                className="partners-arrow-rail"
                x1={x(bar.lo)}
                x2={x(bar.hi)}
                y1={bar.y}
                y2={bar.y}
              />
            )}
            <line
              x1={x(bar.from.value)}
              x2={x(bar.to.value)}
              y1={bar.y}
              y2={bar.y}
              stroke={color}
              strokeWidth={1.8}
              markerEnd={`url(#${id}-head-${color.slice(1)})`}
            />
            <circle cx={x(bar.from.value)} cy={bar.y} r={ARROW_DOT} fill={color} />
            {bar.waypoints.map((point) => (
              <circle
                key={point.i}
                cx={x(point.value)}
                cy={bar.y}
                r={point.r}
                fill="#ffffff"
                stroke={color}
                strokeWidth={1.3}
                opacity={point.opacity}
              >
                <title>
                  {`${FAMILIES[pivot].label} and ${bar.label}, ${point.term.short}: ${pct(point.value)}`}
                </title>
              </circle>
            ))}
            <text
              className="partners-arrow-delta"
              x={width - 2}
              y={bar.y + 3}
              textAnchor="end"
              fill={color}
            >
              {points(bar.delta)}
            </text>
            <title>
              {`${FAMILIES[pivot].label} and ${bar.label}: ${walk(bar)} (${points(bar.delta)} points, ${bar.fromTerm.short} to ${bar.toTerm.short})`}
            </title>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * One band per partner, one step per term: the same walk the arrow flattens,
 * spent over a second dimension.
 *
 * x is agreement, exactly as on the arrow chart above; y inside a band is
 * time, oldest at the top. A pair that only ever moved one way is a diagonal;
 * one that turned is a corner, and the turn is the thing this form exists to
 * show. The bands run in seating order, the same order the arrows and the
 * chips above use, so switching between the forms does not reorder the
 * families underneath the reader.
 *
 * The steps are per *ticked* term, not per term the pair reached, so all six
 * bands share one clock and a missing term is a hole rather than a shortened
 * band — the same rule `segments` enforces on the line: a term this scope
 * never reached is a gap, not a value to interpolate across, so the path
 * breaks there rather than cutting the corner.
 *
 * Only the first and last points are named. The terms are evenly spaced down
 * a fixed grid and the legend under the chart carries the years, so labelling
 * all five in all six bands would be thirty repetitions of one axis.
 */
function TrackChart({ geometry, width, pivot }) {
  const { height, x, bars } = geometry;
  const ticks = AXIS_TICKS;
  const id = useId();

  return (
    <svg
      className="partners-chart"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`The path ${FAMILIES[pivot].label}'s agreement with each family took through the terms, ${bars
        .map((bar) => `${bar.label} ${walk(bar)}`)
        .join("; ")}`}
    >
      <ArrowHeads id={id} />

      {ticks.map((value) => (
        <g key={value}>
          <line
            className="partners-grid"
            x1={x(value)}
            x2={x(value)}
            y1={ARROW_BOX.top - 2}
            y2={height - ARROW_BOX.bottom + 2}
          />
          <text
            className="partners-axis-label"
            x={x(value)}
            y={height - 6}
            textAnchor="middle"
          >
            {Math.round(value * 100)}
          </text>
        </g>
      ))}

      {bars.map((bar) => {
        const color = bar.delta >= 0 ? CLOSER : APART;
        const runs = segments(bar.points);
        const drawn = bar.points.filter(Boolean);
        // The arrowhead lands on the last point only if something reaches it.
        // A pair whose final term stands alone after a gap keeps its dot.
        const headed = runs.length > 0 && runs[runs.length - 1].length > 1;
        return (
          <g key={bar.family}>
            <text className="partners-arrow-name" x={0} y={bar.mid + 3}>
              {bar.short}
            </text>
            {runs.map((run, i) => (
              <path
                key={i}
                d={toPath(run)}
                fill="none"
                stroke={color}
                strokeWidth={1.6}
                strokeLinejoin="round"
                strokeLinecap="round"
                markerEnd={
                  i === runs.length - 1 && headed
                    ? `url(#${id}-head-${color.slice(1)})`
                    : undefined
                }
              />
            ))}
            {drawn.map((point, k) => {
              const last = k === drawn.length - 1;
              if (last && headed) return null;
              return (
                <circle
                  key={point.i}
                  cx={point.x}
                  cy={point.y}
                  r={k === 0 ? ARROW_DOT : 2}
                  fill={k === 0 ? color : "#ffffff"}
                  stroke={color}
                  strokeWidth={1.3}
                >
                  <title>
                    {`${FAMILIES[pivot].label} and ${bar.label}, ${point.term.short}: ${pct(point.value)}`}
                  </title>
                </circle>
              );
            })}
            {[drawn[0], drawn[drawn.length - 1]].map((point, k) => {
              // Left of the point, unless that would run the label into the
              // family names down the left margin.
              const flip = point.x - 8 < ARROW_BOX.left + 12;
              return (
                <text
                  key={`${point.i}-${k}`}
                  className="partners-track-term"
                  x={flip ? point.x + 8 : point.x - 8}
                  y={point.y + 3}
                  textAnchor={flip ? "start" : "end"}
                >
                  {point.term.short}
                </text>
              );
            })}
            <text
              className="partners-arrow-delta"
              x={width - 2}
              y={bar.mid + 3}
              textAnchor="end"
              fill={color}
            >
              {points(bar.delta)}
            </text>
            <title>
              {`${FAMILIES[pivot].label} and ${bar.label}: ${walk(bar)} (${points(bar.delta)} points, ${bar.fromTerm.short} to ${bar.toTerm.short})`}
            </title>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The seven families on the x-axis in seating order, one line per term.
 *
 * The pivot's own slot is empty and marked: a group's agreement with itself is
 * intra-group cohesion, which is a different measure and cannot share this
 * axis. Leaving the gap also puts the reader's seat on the chart, so what the
 * line shows is the chamber from *there* — and the thing that moves between
 * terms is its shape.
 */
function ProfileChart({ geometry, rows, width, pivot, mandate }) {
  const { domain, height, x, y, lines, plotHeight } = geometry;
  const ticks = AXIS_TICKS;
  const pivotIndex = FAMILY_ORDER.indexOf(pivot);

  return (
    <svg
      className="partners-chart"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`The house seen from ${FAMILIES[pivot].label}, one line per term`}
    >
      {ticks.map((value) => (
        <g key={value}>
          <line
            className="partners-grid"
            x1={PROFILE_BOX.left}
            x2={width - PROFILE_BOX.right}
            y1={y(value)}
            y2={y(value)}
          />
          <text
            className="partners-axis-label"
            x={PROFILE_BOX.left - 5}
            y={y(value) + 3}
            textAnchor="end"
          >
            {Math.round(value * 100)}
          </text>
        </g>
      ))}

      {/* The reader's own seat. A dark short tick is the sidebar's mark for a
          reference, as on every RadialGauge. */}
      <line
        className="partners-seat"
        x1={x(pivotIndex)}
        x2={x(pivotIndex)}
        y1={PROFILE_BOX.top}
        y2={PROFILE_BOX.top + plotHeight}
      />

      {FAMILY_ORDER.map((family, i) => (
        <text
          key={family}
          className={`partners-tick ${family === pivot ? "current" : ""}`}
          x={x(i)}
          y={height - 8}
          textAnchor="middle"
        >
          {FAMILIES[family].short}
        </text>
      ))}

      {lines.map((line) => (
        <g key={line.row.mandate} opacity={line.opacity}>
          {segments(line.points).map((run, i) => (
            <path
              key={i}
              d={toPath(run)}
              fill="none"
              stroke={line.isLatest ? "var(--eu-blue)" : "var(--sb-ink-soft)"}
              strokeWidth={line.isLatest ? 2.2 : 1.4}
              strokeDasharray={line.isLatest ? "" : "4 3"}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {line.points.filter(Boolean).map((point) => (
            <circle
              key={point.family}
              cx={point.x}
              cy={point.y}
              r={line.isLatest ? 2.6 : 1.8}
              fill={line.isLatest ? "var(--eu-blue)" : "var(--sb-ink-soft)"}
            >
              <title>
                {`${FAMILIES[pivot].label} and ${FAMILIES[point.family].label}, ${line.row.short}: ${pct(point.value)}`}
              </title>
            </circle>
          ))}
          {line.labelY !== null && (
            <text
              className={`partners-line-label ${
                line.row.mandate === mandate ? "current" : ""
              }`}
              x={width - PROFILE_BOX.right + 4}
              y={line.labelY + 3}
            >
              {line.row.short}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
