"use client";

import { useMemo, useState } from "react";
import { getGroupAcronym, getGroupDisplayName } from "../lib/utils.js";
import RadialGauge, { RadialGrid } from "./RadialGauge";
import SegmentedToggle, { ORDER_OPTIONS } from "./SegmentedToggle";

export default function IntragroupCohesion({
  intragroupCohesion,
  graphData,
  mandate,
  baseline,
  onGroupClick,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [sortBy, setSortBy] = useState("score");

  /**
   * Whether a change is worth showing at all.
   *
   * Only where the country filter is the same on both sides of the comparison.
   * Inside one country a group's members share a delegation as well as a
   * group, so its cohesion sits above the Parliament-wide figure by
   * construction and the delta measures the delegation, not the group. Same
   * rule the insights line and CountrySimilarity apply.
   */
  const comparable = Boolean(baseline) && baseline.comparing === "subject";

  // Colours and head counts come from the nodes actually drawn, so a group
  // filtered out of this view is not counted from a stale list.
  const { rows, groupColors } = useMemo(() => {
    if (!intragroupCohesion || !graphData) {
      return { rows: [], groupColors: new Map() };
    }

    const colors = new Map();
    const counts = new Map();
    for (const node of graphData.nodes || []) {
      if (!node.groupId) continue;
      if (!colors.has(node.groupId)) colors.set(node.groupId, node.color);
      counts.set(node.groupId, (counts.get(node.groupId) || 0) + 1);
    }

    const ordered = intragroupCohesion
      // The non-attached are not a group, so their internal agreement is not a
      // property of anything. Same exclusion the rest of the sidebar makes.
      .filter((item) => item && item.group !== "NonAttached")
      .map((item) => {
        const base = comparable
          ? baseline.scores?.intragroup?.[item.group] ?? null
          : null;
        return {
          ...item,
          mepCount: counts.get(item.group) || 0,
          base,
          delta: typeof base === "number" ? item.score - base : null,
        };
      })
      // A grid is read left to right and top to bottom, so the order has to be
      // in the layout — a bar list could lean on length alone, this cannot.
      // Change order is by distance travelled in either direction, so whatever
      // moved furthest lands top-left; a group with no comparable baseline
      // sorts last rather than as though it had not moved.
      .sort((a, b) =>
        sortBy === "change"
          ? Math.abs(b.delta ?? -1) - Math.abs(a.delta ?? -1)
          : b.score - a.score
      );

    return { rows: ordered, groupColors: colors };
  }, [intragroupCohesion, graphData, baseline, comparable, sortBy]);

  if (!graphData) return null;
  if (rows.length === 0) return null;

  return (
    <div className="cohesion-heatmap">
      <h3
        className="intragroup-cohesion-title collapsible-title"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span>Group agreement</span>
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
      <div className="intragroup-cohesion-description">
        Average voting agreement among members within each political group,
        counting only MEPs who voted enough here to be placed
        {comparable && (
          <span className="baseline-note">
            Change shown against {baseline.label}.
          </span>
        )}
      </div>
      <div className={`collapsible-content ${!isCollapsed ? "expanded" : ""}`}>
        
        {comparable && <SegmentedToggle
            value={sortBy}
            onChange={setSortBy}
            options={ORDER_OPTIONS}
            label="Order"
          />}
        <RadialGrid>
          {rows.map((item) => (
            <RadialGauge
              key={item.group}
              value={item.score}
              baseline={item.base}
              color={groupColors.get(item.group) || "#CCCCCC"}
              label={getGroupAcronym(item.group, mandate)}
              title={`${getGroupDisplayName(item.group, mandate)} — ${(
                item.score * 100
              ).toFixed(1)}% internal agreement across ${item.mepCount} MEP${
                item.mepCount === 1 ? "" : "s"
              }`}
              baselineLabel={comparable ? baseline.label : ""}
              sub={`${item.mepCount} MEP${item.mepCount === 1 ? "" : "s"}`}
              onClick={
                onGroupClick ? () => onGroupClick(item.group) : undefined
              }
            />
          ))}
        </RadialGrid>
      </div>
    </div>
  );
}
