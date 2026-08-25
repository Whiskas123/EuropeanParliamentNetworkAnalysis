"use client";

import { useMemo, useState } from "react";
import { getGroupAcronym, getGroupDisplayName } from "../lib/utils.js";
import RadialGauge, { RadialGrid, RadialScaleNote } from "./RadialGauge";

export default function IntragroupCohesion({
  intragroupCohesion,
  graphData,
  mandate,
  baseline,
  onGroupClick,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

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
      .map((item) => ({ ...item, mepCount: counts.get(item.group) || 0 }))
      // A grid is read left to right and top to bottom, so the order has to be
      // in the layout — a bar list could lean on length alone, this cannot.
      .sort((a, b) => b.score - a.score);

    return { rows: ordered, groupColors: colors };
  }, [intragroupCohesion, graphData]);

  if (!graphData) return null;
  if (rows.length === 0) return null;

  return (
    <div className="cohesion-heatmap">
      <h3
        className="intragroup-cohesion-title collapsible-title"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span>Group Cohesion</span>
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
        counting only MEPs who took part in more than half the votes
        {baseline && (
          <span className="baseline-note">
            Change shown against {baseline.label}.
          </span>
        )}
      </div>
      <div className={`collapsible-content ${!isCollapsed ? "expanded" : ""}`}>
        <RadialScaleNote hasBaseline={Boolean(baseline)} />
        <RadialGrid min={82}>
          {rows.map((item) => (
            <RadialGauge
              key={item.group}
              value={item.score}
              baseline={baseline?.scores?.intragroup?.[item.group] ?? null}
              color={groupColors.get(item.group) || "#CCCCCC"}
              label={getGroupAcronym(item.group, mandate)}
              title={`${getGroupDisplayName(item.group, mandate)} — ${(
                item.score * 100
              ).toFixed(1)}% internal agreement across ${item.mepCount} MEP${
                item.mepCount === 1 ? "" : "s"
              }`}
              what={`${getGroupDisplayName(item.group, mandate)} cohesion`}
              baselineLabel={baseline?.label}
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
