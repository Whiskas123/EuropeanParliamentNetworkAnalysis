"use client";

import { useMemo } from "react";
import {
  CountryFlag,
  getGroupAcronym,
  getGroupDisplayName,
} from "../lib/utils.js";
import { baselineForGroupPair } from "../lib/dataLoader.js";
import "../styles/insights.scss";

/**
 * The one or two figures in this view that are genuinely out of the ordinary.
 *
 * This replaces the Overview tab, which held a ranked list of the largest
 * movers — a top five that always found five things to say, whether or not
 * anything had happened, and which mostly restated the dials on this tab one
 * screen further up. What is worth knowing before reading the dials is not
 * "what moved most here" but "did anything move further than it normally
 * does", and that is a question about the whole dataset, not about this view.
 *
 * ## Where the thresholds come from
 *
 * Measured, not chosen. scripts/measure-delta-percentiles.js walks every view
 * the site can actually open — 2,778 of them across five terms, 41,114
 * figures — and takes the distribution of |delta| for each kind. The three
 * kinds turn out to live on completely different scales:
 *
 *              median   p90    p95    p99
 *   group        1.1    4.7    6.6   12.8
 *   country      3.0    8.7   10.9   14.9
 *   pair         6.8   18.9   23.4   31.9
 *
 * A single cut-off across all three would call an unremarkable pair movement
 * extraordinary and stay silent through a group split twice its usual size, so
 * each kind carries its own. The 95th percentile is the level: a third of
 * views say anything at all, usually one or two things, and the two thirds
 * that stay silent are saying something true.
 *
 * "Views the site can actually open" is load-bearing. The precomputed
 * directory still holds files for policy areas that no longer exist, and
 * measured over those the country threshold came out at 12.2pp rather than
 * 10.9 — the tail was mostly Transport and Tourism, twelve voting sessions
 * wide. A threshold nobody could reproduce from what the site serves is not a
 * measurement.
 *
 * ## Why a strip and not a sentence
 *
 * This was a paragraph of prose. Prose spends a line and a half saying "9.1
 * points more cohesive" where a bar says it in nine pixels, and worse, it
 * flattens the finding: three clauses joined by "and" read as three equal
 * facts when one of them is usually twice as far out as the other two. The
 * ranking that decides which three get named was invisible in the sentence
 * that named them.
 *
 * So: one shared horizontal axis, in units of each kind's own threshold. A
 * bar runs from no-change out to what the figure did, and the notch it
 * crosses is where its kind stops being ordinary. The notch sits at the same
 * place on every row and on every view of the site, so the eye reads "how far
 * past ordinary" directly and the three kinds are comparable despite living
 * on scales that differ by a factor of four.
 *
 * That is the same grammar as the dials further down the tab — RadialGauge
 * draws an arc against a baseline notch — unrolled into a line. It was worth
 * getting to: the first version shaded the ordinary range as a block and drew
 * bars only outside it, which asked the reader to learn a second, private
 * convention, and read as a grey object sitting in the middle of the panel
 * rather than as an axis.
 *
 * Green right, red left, matching DeltaBadge and the heatmap ramp: green is
 * more agreement everywhere on this page. That holds for all three kinds — a
 * group more cohesive, a delegation agreeing with itself more, two groups
 * closer together are all a positive delta.
 *
 * ## Thin views
 *
 * A delta computed over twelve voting sessions swings for free, so a view too
 * thin to support a claim gets its sample stated under the strip rather than
 * being silently dropped — inside the same block as the claim, so the caveat
 * cannot be read apart from it or cropped off a printed panel.
 *
 * In practice this almost never fires, and that is worth knowing rather than
 * discovering: the policy-area dropdown already excludes the thin areas, so of
 * the seventeen it offers for term 10 only Parliamentary Procedure (57) and
 * Security and Defence (59) fall under the floor. Among reachable views, thin
 * ones are 4% of all figures and 4-7% of every extreme tail — no
 * over-representation left to correct for. The caveat stays because the
 * dropdown's floor is not this component's to rely on.
 */

/**
 * |delta| a figure must clear to be called extraordinary, by kind.
 * The 95th percentile of its own kind. Re-derive with:
 *   node scripts/measure-delta-percentiles.js
 */
const THRESHOLD = {
  group: 0.066,
  country: 0.109,
  pair: 0.234,
};

/** The percentile those thresholds are, for the note that says so. */
const PERCENTILE = 95;

/** Below this a view's own figures are reported with their sample attached. */
const MIN_SESSIONS = 60;

/** How many are drawn before the rest are counted rather than plotted. */
const NAMED = 3;

/** What each kind's threshold is a threshold for, in the hover text. */
const KIND_NOUN = {
  group: "a political group's cohesion",
  country: "a national delegation's agreement with itself",
  pair: "agreement between two groups",
};

/** "9.1", the movement in points, unsigned — the sign is carried elsewhere. */
const points = (delta) => Math.abs(delta * 100).toFixed(1);

/** "+9.1" / "−26.2". A real minus, so both signs are the same width. */
const signed = (delta) => `${delta > 0 ? "+" : "−"}${points(delta)}`;

/** groupColors ships as a plain object from some callers and a Map from others. */
function colorFor(groupColors, groupId) {
  if (!groupColors) return null;
  if (typeof groupColors.get === "function") return groupColors.get(groupId);
  return groupColors[groupId];
}

/**
 * The baseline label as it reads after "Against".
 *
 * getBaseline writes labels as noun phrases ("Poland, all policy areas") so
 * they can follow "against"; the comma form reads as a list of two things
 * rather than one narrowed comparison, so it is unpicked here.
 */
function baselinePhrase(label) {
  if (!label) return "";
  return label.replace(/,\s*all policy areas$/, " across all policy areas");
}

export default function CohesionInsights({
  graphData,
  baseline,
  mandate,
  intergroupCohesion,
  intragroupCohesion,
  countrySimilarity,
}) {
  const rows = useMemo(() => {
    if (!baseline || !graphData) return [];
    const found = [];
    const against = baselinePhrase(baseline.label);

    // A row has to be identifiable at a glance, and its name alone is not
    // enough: the strip mixes groups, countries and pairs of groups, and the
    // reader is scanning for one of them. Colours come from the nodes actually
    // drawn, so a swatch matches the dots on the canvas rather than a second
    // palette that only agrees with it by luck.
    const groupColorMap = new Map();
    for (const node of graphData.nodes || []) {
      if (node.groupId && !groupColorMap.has(node.groupId)) {
        groupColorMap.set(node.groupId, node.color);
      }
    }
    const groupColor = (groupId) =>
      groupColorMap.get(groupId) ||
      colorFor(intergroupCohesion?.groupColors, groupId) ||
      "#CCCCCC";

    // --- groups ---------------------------------------------------------
    // Only where the country filter is the same on both sides. Measured
    // against the whole Parliament, a group's cohesion inside one country is
    // higher almost by definition — those members share a delegation as well
    // as a group — and the reader would be looking at the national effect.
    //
    // NonAttached is not a group, so its internal agreement is not a property
    // of anything; left out here as everywhere else.
    if (baseline.comparing === "subject") {
      for (const item of intragroupCohesion || []) {
        if (!item || item.group === "NonAttached") continue;
        const base = baseline.scores?.intragroup?.[item.group];
        if (typeof base !== "number" || typeof item.score !== "number") continue;
        const delta = item.score - base;
        if (Math.abs(delta) < THRESHOLD.group) continue;
        found.push({
          key: `group:${item.group}`,
          kind: "group",
          delta,
          excess: Math.abs(delta) / THRESHOLD.group,
          label: getGroupAcronym(item.group, mandate),
          swatches: [groupColor(item.group)],
          sentence: `${getGroupDisplayName(item.group, mandate)} is ${points(
            delta
          )} points ${delta < 0 ? "less" : "more"} cohesive than ${against}`,
        });
      }
    }

    // --- countries ------------------------------------------------------
    // In a country view a country's own cohesion comes from exactly the same
    // pairs of MEPs on both sides of the comparison, so its delta is zero by
    // construction rather than a finding.
    if (baseline.comparing !== "country") {
      for (const item of countrySimilarity || []) {
        if (!item) continue;
        const base = baseline.scores?.country?.[item.country];
        if (typeof base !== "number" || typeof item.score !== "number") continue;
        const delta = item.score - base;
        if (Math.abs(delta) < THRESHOLD.country) continue;
        found.push({
          key: `country:${item.country}`,
          kind: "country",
          delta,
          excess: Math.abs(delta) / THRESHOLD.country,
          label: item.country,
          country: item.country,
          swatches: [],
          sentence: `${item.country} agrees with itself ${points(delta)} points ${
            delta < 0 ? "less" : "more"
          } than ${against}`,
        });
      }
    }

    // --- group pairs ----------------------------------------------------
    // Upper triangle only: the matrix is symmetric and its diagonal is the
    // intragroup figure already collected above.
    const groups = intergroupCohesion?.groups || [];
    const matrix = intergroupCohesion?.matrix || [];
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i];
        const b = groups[j];
        if (a === "NonAttached" || b === "NonAttached") continue;
        const score = matrix[i]?.[j];
        const base = baselineForGroupPair(baseline, a, b);
        if (typeof base !== "number" || typeof score !== "number") continue;
        const delta = score - base;
        if (Math.abs(delta) < THRESHOLD.pair) continue;
        found.push({
          key: `pair:${a}|${b}`,
          kind: "pair",
          delta,
          excess: Math.abs(delta) / THRESHOLD.pair,
          label: `${getGroupAcronym(a, mandate)}·${getGroupAcronym(b, mandate)}`,
          swatches: [groupColor(a), groupColor(b)],
          sentence: `${getGroupDisplayName(a, mandate)} and ${getGroupDisplayName(
            b,
            mandate
          )} are ${points(delta)} points ${
            delta < 0 ? "further apart" : "closer together"
          } than ${against}`,
        });
      }
    }

    // Ranked by how far past its own kind's bar a figure sits, not by raw
    // points. Pairs move furthest in absolute terms — a 23pp pair movement is
    // merely the 95th percentile while a 21pp national one is off the end of
    // its scale — so ranking by points alone fills the strip with pairs and
    // buries the finding, which is exactly what the per-kind thresholds exist
    // to prevent. Dividing by the threshold makes the three commensurable,
    // and it is that same division that lets them share one axis below.
    return found.sort((x, y) => y.excess - x.excess);
  }, [
    baseline,
    graphData,
    intragroupCohesion,
    countrySimilarity,
    intergroupCohesion,
    mandate,
  ]);

  if (!graphData) return null;

  // The unfiltered Parliament is what every other view is measured against, so
  // it has no comparison of its own to be extraordinary against. Nothing is
  // drawn: an earlier version explained the absence in a sentence, which meant
  // the default view — the first thing anyone sees — opened on a panel whose
  // only content was an apology for having none.
  if (!baseline) return null;

  if (rows.length === 0) return null;

  const sessions =
    typeof graphData.metadata?.votingSessions === "number"
      ? graphData.metadata.votingSessions
      : null;
  const thin = sessions !== null && sessions < MIN_SESSIONS;

  const named = rows.slice(0, NAMED);
  const rest = rows.length - named.length;

  // The axis runs in multiples of each row's own threshold, so the notch that
  // marks the end of ordinary sits at ±1 whatever is plotted. It never closes
  // tighter than ±2 — at ±1 the notch would land on the end of every bar and
  // there would be nothing to see it against. The 8% headroom keeps the
  // longest bar off the edge, where it would read as clipped rather than as
  // measured.
  const furthest = named.reduce((max, row) => Math.max(max, row.excess), 1);
  const domain = Math.max(2, furthest * 1.08);

  /** A position in threshold units as a percentage across the track. */
  const pos = (units) => ((units + domain) / (2 * domain)) * 100;

  // The axis is symmetric, so no change is always the middle of the track.
  const MIDDLE = 50;

  // From no change out to the figure, the direction it went. Anchored at the
  // middle rather than given a left and a width, so the two directions are
  // mirror images and neither can drift off centre by a rounding error.
  const barStyle = (row) => {
    const units = row.delta / THRESHOLD[row.kind];
    return units > 0
      ? { left: `${MIDDLE}%`, width: `${pos(units) - MIDDLE}%` }
      : { right: `${MIDDLE}%`, width: `${MIDDLE - pos(units)}%` };
  };

  return (
    <div className="insights">
      {/* No collapse chevron, unlike the panels below it. Those hide grids of
          twenty-odd dials; this is three rows, and it is the thing the reader
          is meant to see first — a control that folds it away would mostly be
          a way to lose it. */}
      <h3 className="insights-title">Extraordinary here</h3>
      {/* The baseline folded into the sentence rather than carried below it in
          a .baseline-note, as the panels further down do. They describe what
          they measure and note the comparison separately; this panel measures
          nothing but the comparison, so splitting it across two lines spends a
          line of a component whose whole case is that it is small. */}
      <div className="insights-desc">
        Figures that moved further than their kind normally does, against{" "}
        {baselinePhrase(baseline.label)}.
      </div>

      <div className="insights-strip">
        {named.map((row) => {
          const direction = row.delta > 0 ? "up" : "down";
          const title = `${row.sentence}. That is ${row.excess.toFixed(
            1
          )}× the ${PERCENTILE}th-percentile movement for ${
            KIND_NOUN[row.kind]
          }.`;
          return (
            <div className="insights-row" key={row.key} title={title}>
              <span className="insights-row-label">
                {row.kind === "country" ? (
                  <span className="insights-flag">
                    <CountryFlag country={row.country} />
                  </span>
                ) : (
                  (row.swatches || []).map((color, k) => (
                    <span
                      key={`${row.key}-swatch-${k}`}
                      className="insights-swatch"
                      style={{ backgroundColor: color }}
                    />
                  ))
                )}
                <span className="insights-row-name">{row.label}</span>
              </span>
              <span className="insights-track">
                <span className="insights-rail" />
                <span
                  className="insights-middle"
                  style={{ left: `${MIDDLE}%` }}
                />
                <span
                  className={`insights-bar insights-bar--${direction}`}
                  style={barStyle(row)}
                />
                {/* One notch, on the side the figure actually went. The
                    threshold is symmetric and drawing both is defensible, but
                    it leaves a dark tick standing on empty rail opposite every
                    bar, and a mark with nothing to measure reads as debris.
                    Drawn after the bar, so it stays visible where the bar
                    crosses it — which, this being the strip of things that
                    cleared their threshold, is every row. */}
                <span
                  className="insights-notch"
                  style={{ left: `${pos(row.delta > 0 ? 1 : -1)}%` }}
                />
              </span>
              <span className={`insights-value insights-value--${direction}`}>
                {signed(row.delta)}
                <span className="insights-value-unit">pp</span>
              </span>
            </div>
          );
        })}

        <div className="insights-axis">
          <span />
          <span className="insights-axis-scale">
            <span>◀ less agreement</span>
            <span>more ▶</span>
          </span>
          {rest > 0 ? (
            <span
              className="insights-more"
              title={`${rest} further figure${
                rest === 1 ? "" : "s"
              } in this view also moved past the ${PERCENTILE}th percentile of its own kind.`}
            >
              {rest} more
            </span>
          ) : (
            <span />
          )}
        </div>
      </div>

      {/* "Rarer, not bigger" is the one thing a reader can get wrong here: a
          33pp pair movement draws a shorter bar than an 18pp national one,
          because it is a smaller multiple of what its own kind normally does.
          That is the whole point of the normalisation and it has to be said,
          or the strip looks broken next to the numbers beside it. */}
      <div className="insights-note">
        
        {thin && (
          <>
            {" "}
            <span className="insights-caveat">
              This view rests on {sessions} voting session
              {sessions === 1 ? "" : "s"}, though, where a swing this size is
              ordinary.
            </span>
          </>
        )}
      </div>
    </div>
  );
}
