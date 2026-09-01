"use client";

import { useState, useMemo } from "react";
import {
  getGroupAcronym,
  getGroupDisplayName,
  getRedGreenColor,
  getDivergingColor,
} from "../lib/utils.js";
import { groupSwatchStyle } from "../lib/groupColors.js";
import { baselineForGroupPair } from "../lib/dataLoader.js";
import { useHoverFocus } from "../lib/hoverFocus.js";
import SegmentedToggle from "./SegmentedToggle";

// Special function for X-axis labels in heatmap - shows "Greens" instead of "Greens/EFA"
function getHeatmapXAxisLabel(groupId, mandate) {
  const acronym = getGroupAcronym(groupId, mandate);
  // Replace "Greens/EFA" with "Greens" for X-axis only
  if (acronym === "Greens/EFA") {
    return "Greens";
  }
  return acronym;
}

export default function CohesionHeatmap({
  intergroupCohesion,
  mandate,
  baseline,
  onGroupClick,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showChange, setShowChange] = useState(false);
  const focus = useHoverFocus();

  // A cell is a figure about two groups, so pointing at it leaves exactly
  // those two lit on the network. The diagonal is one group with itself.
  const pairHover = (a, b) =>
    focus.on(a === b ? [{ group: a }] : [{ group: a }, { group: b }]);

  // Deltas against the baseline, plus the largest one, which sets the scale.
  // Normalising to the largest change actually present rather than to a fixed
  // range stops a view where every pair moved a point or two from rendering as
  // a uniformly blank grid.
  const change = useMemo(() => {
    if (!baseline || !intergroupCohesion) return null;
    const { groups, matrix } = intergroupCohesion;
    const deltas = matrix.map((row, i) =>
      row.map((score, j) => {
        if (typeof score !== "number" || isNaN(score) || score === 0) {
          return null;
        }
        const ref = baselineForGroupPair(baseline, groups[i], groups[j]);
        if (ref === null) return null;
        return { points: (score - ref) * 100, reference: ref };
      })
    );

    const present = deltas.flat().filter((cell) => cell !== null);
    if (present.length === 0) return null;

    const maxAbs = present.reduce(
      (max, cell) => Math.max(max, Math.abs(cell.points)),
      0
    );
    // A view where nothing moved would divide by zero; 1 leaves every cell at
    // the neutral middle of the ramp, which is the honest picture.
    return { deltas, maxAbs: maxAbs || 1 };
  }, [baseline, intergroupCohesion]);

  // The toggle only renders when there is something to switch to, but a
  // mandate change can leave the flag set while the next baseline resolves.
  const inChangeMode = showChange && change !== null;

  if (!intergroupCohesion) return null;

  const handleGroupClick = (groupId) => {
    if (onGroupClick) {
      onGroupClick(groupId);
    }
  };

  return (
    <div className="cohesion-heatmap">
      {/* h4 like every other panel heading, and sentence case like every other
          panel title: the sidebar's titles read as sentences ("Five terms
          compared", "The EPP's winning coalitions"), and this was one of three
          left in Title Case. It also sat at h3 among h4s, which put an h3 after
          an h5 once this panel moved under the coalition ranking. */}
      <h4
        className="cohesion-heatmap-title collapsible-title"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span>Inter-group voting agreement</span>
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
      </h4>
      <div className="cohesion-heatmap-description">
        {inChangeMode
          ? `Change against ${baseline.label}, in percentage points`
          : "Average voting agreement between members of different political groups"}
      </div>
      {change && (
        <SegmentedToggle
          value={showChange ? "change" : "agreement"}
          onChange={(id) => setShowChange(id === "change")}
          label="Values"
          options={[
            {
              id: "agreement",
              text: "Agreement",
              title: "How much each pair of groups votes together",
            },
            {
              id: "change",
              text: "Change",
              title: "How far each pair sits from its own baseline",
            },
          ]}
        />
      )}
      <div className={`collapsible-content ${!isCollapsed ? "expanded" : ""}`}>
        <div className="cohesion-heatmap-container">
          <table className="cohesion-heatmap-table">
            <thead>
              <tr>
                <th className="cohesion-heatmap-th-empty"></th>
                {intergroupCohesion.groups.map((group) => {
                  const groupColor =
                    intergroupCohesion.groupColors?.get(group) || "#CCCCCC";
                  return (
                    <th
                      key={group}
                      className="cohesion-heatmap-th-group clickable"
                      title={getGroupDisplayName(group, mandate)}
                      onClick={() => handleGroupClick(group)}
                      {...focus.on([{ group }])}
                    >
                      <div className="cohesion-heatmap-th-group-content">
                        <span>{getHeatmapXAxisLabel(group, mandate)}</span>
                        <span
                          className="cohesion-heatmap-th-group-color"
                          style={groupSwatchStyle(group, groupColor)}
                        />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {intergroupCohesion.groups.map((group1, i) => (
                <tr key={group1}>
                  <td
                    className="cohesion-heatmap-td-label clickable"
                    onClick={() => handleGroupClick(group1)}
                    {...focus.on([{ group: group1 }])}
                  >
                    <span className="cohesion-heatmap-td-label-text">
                      {getGroupAcronym(group1, mandate)}
                    </span>
                    {intergroupCohesion.groupColors?.get(group1) && (
                      <span
                        className="cohesion-heatmap-td-label-color"
                        style={groupSwatchStyle(
                          group1,
                          intergroupCohesion.groupColors.get(group1)
                        )}
                      />
                    )}
                  </td>
                  {intergroupCohesion.matrix[i].map((score, j) => {
                    // Show only lower triangle (i >= j) - diagonal and below
                    if (i < j) {
                      return (
                        <td key={j} className="cohesion-heatmap-td-empty" />
                      );
                    }

                    const pairLabel = `${getGroupDisplayName(
                      group1,
                      mandate
                    )} - ${getGroupDisplayName(
                      intergroupCohesion.groups[j],
                      mandate
                    )}`;

                    // Change mode. A cell with no baseline to compare against
                    // is drawn as "no data" rather than as zero change, which
                    // would read as "these groups did not move".
                    if (inChangeMode) {
                      const cell = change.deltas[i][j];
                      if (cell === null) {
                        return (
                          <td
                            key={j}
                            className="cohesion-heatmap-td-no-data"
                            title={`${pairLabel}: no baseline to compare against`}
                            {...pairHover(group1, intergroupCohesion.groups[j])}
                          >
                            -
                          </td>
                        );
                      }

                      const color = getDivergingColor(
                        cell.points / change.maxAbs
                      );
                      const bgColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
                      const luminance =
                        (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) /
                        255;
                      const rounded = Math.abs(cell.points) < 0.05
                        ? "0.0"
                        : `${cell.points > 0 ? "+" : "−"}${Math.abs(
                            cell.points
                          ).toFixed(1)}`;

                      return (
                        <td
                          key={j}
                          className="cohesion-heatmap-td-score"
                          style={{
                            backgroundColor: bgColor,
                            color: luminance > 0.5 ? "#000" : "#fff",
                          }}
                          title={`${pairLabel}: ${(score * 100).toFixed(
                            1
                          )}% here vs ${(cell.reference * 100).toFixed(
                            1
                          )}% in ${baseline.label} (${rounded} pp)`}
                          onClick={() => handleGroupClick(group1)}
                          {...pairHover(group1, intergroupCohesion.groups[j])}
                        >
                          {rounded}
                        </td>
                      );
                    }

                    // Handle NaN (no data) and 0 values vs valid scores
                    // Check for NaN, exactly 0, or values that round to 0.0%
                    const formattedScore = (score * 100).toFixed(1);
                    if (
                      isNaN(score) ||
                      score === 0 ||
                      formattedScore === "0.0"
                    ) {
                      return (
                        <td
                          key={j}
                          className="cohesion-heatmap-td-no-data"
                          title={`${getGroupDisplayName(
                            group1,
                            mandate
                          )} - ${getGroupDisplayName(
                            intergroupCohesion.groups[j],
                            mandate
                          )}: ${isNaN(score) ? "No data" : "0%"}`}
                          {...pairHover(group1, intergroupCohesion.groups[j])}
                        >
                          -
                        </td>
                      );
                    }

                    // Color scale: red-to-green colormap
                    const validScores = intergroupCohesion.matrix
                      .flat()
                      .filter((s) => !isNaN(s));
                    const maxScore =
                      validScores.length > 0 ? Math.max(...validScores) : 0;
                    const intensity = maxScore > 0 ? score / maxScore : 0;

                    const color = getRedGreenColor(intensity);
                    const bgColor = `rgb(${color.r}, ${color.g}, ${color.b})`;

                    // Determine text color based on luminance
                    const luminance =
                      (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) /
                      255;
                    const textColor = luminance > 0.5 ? "#000" : "#fff";

                    return (
                      <td
                        key={j}
                        className="cohesion-heatmap-td-score"
                        style={{
                          backgroundColor: bgColor,
                          color: textColor,
                        }}
                        title={`${getGroupDisplayName(
                          group1,
                          mandate
                        )} - ${getGroupDisplayName(
                          intergroupCohesion.groups[j],
                          mandate
                        )}: ${(score * 100).toFixed(1)}%`}
                        onClick={() => handleGroupClick(group1)}
                        {...pairHover(group1, intergroupCohesion.groups[j])}
                      >
                        {(score * 100).toFixed(1)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
