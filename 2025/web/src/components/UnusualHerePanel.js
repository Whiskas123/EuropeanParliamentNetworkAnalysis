"use client";

import { useMemo, useState } from "react";
import {
  CountryFlag,
  getDelta,
  getGroupAcronym,
  getGroupDisplayName,
} from "../lib/utils.js";
import { baselineForGroupPair } from "../lib/dataLoader.js";
import DeltaBadge from "./DeltaBadge";
import "../styles/unusual.scss";

// How many rows each direction shows before the expander.
const TOP_N = 5;

/**
 * The baseline label as it reads mid-sentence.
 *
 * getBaseline writes labels as noun phrases ("Poland, all policy areas") so
 * they can follow "against". Here they follow "compared with", where the comma
 * form reads as a list of two things rather than one narrowed comparison.
 */
function baselinePhrase(label) {
  if (!label) return "";
  return label.replace(/,\s*all policy areas$/, " across all policy areas");
}

/** What the open view is, in words, so the sentence names both of its sides. */
function viewPhrase(country, subject) {
  if (country && subject) return `${country}, ${subject}`;
  if (country) return country;
  if (subject) return subject;
  return "The whole Parliament";
}

/** "1 MEP", "20 MEPs" — the sample a figure rests on, spelled correctly. */
function meps(count) {
  return `${count} MEP${count === 1 ? "" : "s"}`;
}

/** groupColors ships as a plain object and is rehydrated as a Map elsewhere. */
function colorFor(groupColors, groupId) {
  if (!groupColors) return null;
  if (typeof groupColors.get === "function") return groupColors.get(groupId);
  return groupColors[groupId];
}

/**
 * What is odd about THIS network.
 *
 * Every other figure in the sidebar describes the view that is open; none of
 * them says whether the view is worth a second look. This one ranks every
 * group, country and group pair by how far it has moved from the same view
 * with a single filter removed, and puts the largest movers in both directions
 * at the top — so "is this network interesting?" is answerable at a glance.
 *
 * Renders nothing without a baseline: the unfiltered view *is* the baseline,
 * and there is nothing to compare it against.
 */
export default function UnusualHerePanel({
  graphData,
  baseline,
  mandate,
  selectedCountry,
  selectedSubject,
  intergroupCohesion,
  intragroupCohesion,
  countrySimilarity,
  onSelectGroup,
  onCountryClick,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    if (!baseline || !graphData) return [];

    // MEP counts and colours, read once from the nodes actually drawn.
    const groupColorMap = new Map();
    const groupCounts = new Map();
    const countryCounts = new Map();
    for (const node of graphData.nodes || []) {
      if (node.groupId) {
        if (!groupColorMap.has(node.groupId)) {
          groupColorMap.set(node.groupId, node.color);
        }
        groupCounts.set(node.groupId, (groupCounts.get(node.groupId) || 0) + 1);
      }
      if (node.country) {
        countryCounts.set(
          node.country,
          (countryCounts.get(node.country) || 0) + 1
        );
      }
    }

    const groupColor = (groupId) =>
      groupColorMap.get(groupId) ||
      colorFor(intergroupCohesion?.groupColors, groupId) ||
      "#CCCCCC";

    const collected = [];

    // --- groups ---------------------------------------------------------
    // NonAttached is dropped for the same reason the Group Cohesion panel
    // drops it: the non-attached are not a group, so their internal agreement
    // is not a property of anything.
    for (const item of intragroupCohesion || []) {
      if (!item || item.group === "NonAttached") continue;
      const base = baseline.scores?.intragroup?.[item.group];
      const delta = getDelta(item.score, base);
      if (!delta || delta.direction === 0) continue;
      collected.push({
        key: `group:${item.group}`,
        kind: "group",
        kindLabel: "Group",
        name: getGroupAcronym(item.group, mandate),
        title: getGroupDisplayName(item.group, mandate),
        what: `${getGroupDisplayName(item.group, mandate)} cohesion`,
        swatches: [groupColor(item.group)],
        country: null,
        sample:
          groupCounts.get(item.group) > 0
            ? meps(groupCounts.get(item.group))
            : null,
        score: item.score,
        base,
        delta,
        target: item.group,
      });
    }

    // --- countries ------------------------------------------------------
    // In a country view the baseline is the whole Parliament, and a country's
    // own cohesion there comes from exactly the same MEP pairs as it does
    // here. That delta is zero by construction, not a finding, so the whole
    // kind is skipped. Removing the *subject* filter is a real comparison and
    // is kept. Same rule as CountrySimilarity.
    const countriesComparable = baseline.comparing !== "country";
    if (countriesComparable) {
      for (const item of countrySimilarity || []) {
        if (!item) continue;
        const base = baseline.scores?.country?.[item.country];
        const delta = getDelta(item.score, base);
        if (!delta || delta.direction === 0) continue;
        collected.push({
          key: `country:${item.country}`,
          kind: "country",
          kindLabel: "Country",
          name: item.country,
          title: `${item.country} cohesion`,
          what: `${item.country} cohesion`,
          swatches: [],
          country: item.country,
          sample:
            countryCounts.get(item.country) > 0
              ? meps(countryCounts.get(item.country))
              : null,
          score: item.score,
          base,
          delta,
          target: item.country,
        });
      }
    }

    // --- group pairs ----------------------------------------------------
    // Upper triangle only: the matrix is symmetric, and its diagonal is the
    // intragroup figure already listed above.
    const groups = intergroupCohesion?.groups || [];
    const matrix = intergroupCohesion?.matrix || [];
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i];
        const b = groups[j];
        const score = matrix[i]?.[j];
        const base = baselineForGroupPair(baseline, a, b);
        const delta = getDelta(score, base);
        if (!delta || delta.direction === 0) continue;
        const countA = groupCounts.get(a) || 0;
        const countB = groupCounts.get(b) || 0;
        collected.push({
          key: `pair:${a}|${b}`,
          kind: "pair",
          kindLabel: "Group pair",
          name: null,
          pair: [getGroupAcronym(a, mandate), getGroupAcronym(b, mandate)],
          title: `${getGroupDisplayName(a, mandate)} and ${getGroupDisplayName(
            b,
            mandate
          )}`,
          what: `Agreement between ${getGroupAcronym(
            a,
            mandate
          )} and ${getGroupAcronym(b, mandate)}`,
          swatches: [groupColor(a), groupColor(b)],
          country: null,
          sample:
            countA > 0 && countB > 0
              ? `${meps(countA)} and ${meps(countB)}`
              : null,
          score,
          base,
          delta,
          target: null,
        });
      }
    }

    // One pool, ranked by how far a thing moved regardless of which way.
    collected.sort(
      (x, y) => Math.abs(y.delta.points) - Math.abs(x.delta.points)
    );
    return collected;
  }, [
    baseline,
    graphData,
    intragroupCohesion,
    countrySimilarity,
    intergroupCohesion,
    mandate,
  ]);

  // The unfiltered view is its own baseline; there is nothing to say about it.
  if (!baseline) return null;
  if (!graphData) return null;

  const higher = rows.filter((r) => r.delta.points > 0);
  const lower = rows.filter((r) => r.delta.points < 0);
  const limit = showAll ? rows.length : TOP_N;

  /**
   * Take the top movers, but never let one kind of row crowd out the others.
   *
   * A pure ranking by size is dominated by group pairs: two groups can swing
   * forty points on a policy area, while a delegation or a group rarely moves
   * more than fifteen. Ranked purely, the Poland x gender-equality view showed
   * ten pair rows and pushed Poland's own -15.8pp to twelfth — burying exactly
   * the finding the panel exists to surface. So each kind is guaranteed one
   * slot before size decides the rest.
   */
  const pickTop = (list) => {
    if (showAll) return list;
    const firstOfKind = ["country", "group", "pair"]
      .map((kind) => list.find((row) => row.kind === kind))
      .filter(Boolean);
    const rest = list.filter((row) => !firstOfKind.includes(row));
    return [...firstOfKind, ...rest]
      .slice(0, limit)
      .sort((x, y) => Math.abs(y.delta.points) - Math.abs(x.delta.points));
  };

  const shownHigher = pickTop(higher);
  const shownLower = pickTop(lower);
  const hiddenCount =
    higher.length - shownHigher.length + (lower.length - shownLower.length);

  const votingSessions =
    typeof graphData.metadata?.votingSessions === "number"
      ? graphData.metadata.votingSessions
      : typeof graphData.votingSessions === "number"
        ? graphData.votingSessions
        : typeof graphData.votingSessions?.total === "number"
          ? graphData.votingSessions.total
          : null;

  const handleActivate = (row) => {
    if (row.kind === "group" && onSelectGroup) onSelectGroup(row.target);
    if (row.kind === "country" && onCountryClick) onCountryClick(row.target);
  };

  const renderRow = (row, index) => {
    const navigable =
      (row.kind === "group" && Boolean(onSelectGroup)) ||
      (row.kind === "country" && Boolean(onCountryClick));

    const inner = (
      <>
        <span className="unusual-rank">{index + 1}</span>
        <span className="unusual-row-line">
          <span className="unusual-row-what" title={row.title}>
            {row.kind === "country" ? (
              <span className="unusual-flag">
                <CountryFlag country={row.country} />
              </span>
            ) : (
              row.swatches.map((color, k) => (
                <span
                  key={`${row.key}-swatch-${k}`}
                  className="unusual-swatch"
                  style={{ backgroundColor: color }}
                />
              ))
            )}
            <span className="unusual-row-name">
              {row.kind === "pair" ? (
                <>
                  {row.pair[0]}
                  <span className="unusual-vs"> vs </span>
                  {row.pair[1]}
                </>
              ) : (
                row.name
              )}
            </span>
            <span className="unusual-tag">{row.kindLabel}</span>
          </span>
          <span className="unusual-row-sub">
            {row.sample ? `${row.sample} · ` : ""}
            baseline {(row.base * 100).toFixed(1)}%
          </span>
        </span>
        <span className="unusual-row-figure">
          <span>{(row.score * 100).toFixed(1)}%</span>
          <DeltaBadge
            score={row.score}
            baseline={row.base}
            label={baseline.label}
            what={row.what}
          />
        </span>
      </>
    );

    if (navigable) {
      return (
        <button
          key={row.key}
          type="button"
          className="unusual-row unusual-row--clickable"
          onClick={() => handleActivate(row)}
        >
          {inner}
        </button>
      );
    }

    // Group pairs have nowhere to navigate to. A row that looks clickable and
    // does nothing is worse than one that plainly is not.
    return (
      <div key={row.key} className="unusual-row unusual-row--static">
        {inner}
      </div>
    );
  };

  return (
    <div className="unusual-panel">
      <h3
        className="unusual-title collapsible-title"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span>Unusual Here</span>
        <svg
          className={`collapse-icon ${isCollapsed ? "collapsed" : ""}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </h3>
      <div className="unusual-lede">
        <strong>{viewPhrase(selectedCountry, selectedSubject)}</strong>, compared
        with <strong>{baselinePhrase(baseline.label)}</strong>.
      </div>
      {votingSessions !== null && (
        <div className="unusual-sample">
          {votingSessions} voting session{votingSessions === 1 ? "" : "s"} in
          this view.
        </div>
      )}

      <div className={`collapsible-content ${!isCollapsed ? "expanded" : ""}`}>
        {rows.length === 0 ? (
          <div className="unusual-empty">
            Nothing moves by more than a tenth of a point here — this view sits
            on its baseline.
          </div>
        ) : (
          <>
            <div className="unusual-section">
              <div className="unusual-section-label">More agreement here</div>
              <div className="unusual-section-hint">
                Higher than {baselinePhrase(baseline.label)}
              </div>
              <div className="unusual-list">
                {shownHigher.length > 0 ? (
                  shownHigher.map(renderRow)
                ) : (
                  <div className="unusual-empty">Nothing is higher here.</div>
                )}
              </div>
            </div>

            <div className="unusual-section">
              <div className="unusual-section-label">Less agreement here</div>
              <div className="unusual-section-hint">
                Lower than {baselinePhrase(baseline.label)}
              </div>
              <div className="unusual-list">
                {shownLower.length > 0 ? (
                  shownLower.map(renderRow)
                ) : (
                  <div className="unusual-empty">Nothing is lower here.</div>
                )}
              </div>
            </div>

            {hiddenCount > 0 && (
              <button
                type="button"
                className="unusual-more"
                onClick={() => setShowAll(true)}
              >
                Show {hiddenCount} more difference
                {hiddenCount === 1 ? "" : "s"}
              </button>
            )}
            {showAll && rows.length > TOP_N * 2 && (
              <button
                type="button"
                className="unusual-more"
                onClick={() => setShowAll(false)}
              >
                Show top {TOP_N} only
              </button>
            )}

            <div className="unusual-note">
              Groups, countries and group pairs share one ranking, ordered by
              the size of the change in percentage points.
              {baseline.comparing === "country" &&
                " A country's own cohesion is the same figure on both sides of this comparison, so it is not listed."}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
