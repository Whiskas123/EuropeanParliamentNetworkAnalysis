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
 * Three forms, because the same six series answer three different shapes of
 * question and one chart cannot do all three. Lines carry trajectory and the
 * crossings between partners. Arrows drop the middle terms to rank *how far*
 * each partner moved, which is the summary a line chart makes you measure by
 * eye. The house profile puts the seven families on the x-axis in seating
 * order and draws one line per term, so what moves is the shape of the chamber
 * seen from one seat — the reading where the EPP's collapsing right shoulder
 * is a single visible fact rather than two series compared.
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

/** Clearance between two term names at the right edge of the house profile. */
const LABEL_GAP = 10;

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
  { id: "arrows", text: "Shift", title: "How far each partner moved, first term to last" },
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

    if (form === "arrows") {
      const domain = AXIS;
      const height = ARROW_BOX.top + ARROW_BOX.bottom + partners.length * ARROW_ROW;
      const plotWidth = width - ARROW_BOX.left - ARROW_BOX.right;
      const x = (v) =>
        ARROW_BOX.left + plotWidth * ((v - domain[0]) / (domain[1] - domain[0] || 1));
      // First and last *drawn* term for each family, which is not always the
      // first and last ticked one: a family can be absent from either end.
      const bars = partners
        .map((partner, index) => {
          const present = partner.values
            .map((value, i) => (finite(value) ? { value, i } : null))
            .filter(Boolean);
          if (present.length < 2) return null;
          const from = present[0];
          const to = present[present.length - 1];
          return {
            ...partner,
            index,
            from,
            to,
            delta: to.value - from.value,
            fromTerm: rows[from.i],
            toTerm: rows[to.i],
          };
        })
        .filter(Boolean)
        // Largest movement first, in either direction: the panel's question is
        // who moved, not who is closest, and that ranking is the answer.
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .map((bar, rank) => ({ ...bar, y: ARROW_BOX.top + rank * ARROW_ROW + ARROW_ROW / 2 }));
      return { kind: "arrows", domain, height, x, bars };
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

  const hoveredRow = hovered !== null && rows[hovered] ? rows[hovered] : null;

  return (
    <section className="partners-panel" aria-labelledby={titleId} ref={panelRef}>
      <h4 className="sb-panel-title" id={titleId}>
        {opening(FAMILIES[pivot].possessive)} partners
      </h4>
      <p className="sb-panel-desc">
        Agreement with each of the other families, term by term. Groups are
        merged across renames, so a line can cross twenty years.
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
          <div className="partners-terms" role="group" aria-label="Terms compared">
            {TERMS.map((term) => (
              <button
                key={term.mandate}
                type="button"
                className="partners-term"
                aria-pressed={chosen.includes(term.mandate)}
                onClick={() => toggleTerm(term.mandate)}
                title={`${term.short}, ${term.years}`}
              >
                {term.short}
              </button>
            ))}
          </div>
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
          hovered={hovered}
          setHovered={setHovered}
        />
      )}
      {status === "ready" && geometry && geometry.kind === "arrows" && (
        <ArrowChart geometry={geometry} width={width} pivot={pivot} />
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

      {status === "ready" && geometry && geometry.kind !== "arrows" && (
        <ul className="partners-legend">
          {(geometry.kind === "lines" ? partners : rows).map((entry) =>
            geometry.kind === "lines" ? (
              <li className="partners-legend-item" key={entry.family}>
                <span
                  className="partners-legend-dot"
                  style={{ background: entry.color }}
                  aria-hidden="true"
                />
                {entry.label}
                <span className="partners-legend-value">
                  {pct(
                    hoveredRow
                      ? entry.values[rows.indexOf(hoveredRow)]
                      : entry.values[entry.values.length - 1]
                  )}
                </span>
              </li>
            ) : (
              <li className="partners-legend-item" key={entry.mandate}>
                <span className="partners-legend-term">{entry.short}</span>
                {entry.years}
              </li>
            )
          )}
        </ul>
      )}

      {status === "ready" && geometry && geometry.kind === "lines" && (
        <p className="sb-note partners-caveat">
          Values are for {hoveredRow ? hoveredRow.short : rows[rows.length - 1].short}
          {hoveredRow ? "" : " (latest ticked)"}. Hover a term to read the rest.
        </p>
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
          . Pooling PfE with ESN, or UEN with ECR, is a judgement about lineage
          rather than something the votes say.
        </p>
      )}

      {thinRows.length > 0 && (
        <p className="sb-note partners-caveat">
          {thinRows.map((row) => `${row.short} (${row.sessions} votes)`).join(", ")}{" "}
          {thinRows.length === 1 ? "rests" : "rest"} on too few votes to carry a
          trend on {thinRows.length === 1 ? "its" : "their"} own.
        </p>
      )}
    </section>
  );
}

/** Terms on the x-axis, one coloured line per partner family. */
function LineChart({ geometry, rows, width, pivot, mandate, hovered, setHovered }) {
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
          <text className="partners-axis-label" x={2} y={y(value) + 3}>
            {Math.round(value * 100)}
          </text>
        </g>
      ))}

      {rows.map((row, i) => (
        <g key={row.mandate}>
          {hovered === i && (
            <line
              className="partners-crosshair"
              x1={x(i)}
              x2={x(i)}
              y1={LINE_BOX.top}
              y2={LINE_BOX.top + plotHeight}
            />
          )}
          <text
            className={`partners-tick ${row.mandate === mandate ? "current" : ""}`}
            x={x(i)}
            y={height - 8}
            textAnchor="middle"
          >
            {row.short}
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
        />
      ))}
    </svg>
  );
}

/**
 * One row per partner, first drawn term to last.
 *
 * The dot is where the pair started and the head is where it ended, so the
 * row's direction is the sign of the change and its length is the size — the
 * two things a line chart makes the reader estimate. Red and green are the
 * sidebar's own change colours, from DeltaBadge.
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
              {`${FAMILIES[pivot].label} and ${bar.label}: ${pct(bar.from.value)} in ${bar.fromTerm.short}, ${pct(bar.to.value)} in ${bar.toTerm.short} (${points(bar.delta)} points)`}
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
          <text className="partners-axis-label" x={2} y={y(value) + 3}>
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
