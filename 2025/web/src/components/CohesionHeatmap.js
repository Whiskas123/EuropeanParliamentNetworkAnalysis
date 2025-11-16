"use client";

import { useState } from "react";
import {
  getGroupAcronym,
  getGroupDisplayName,
  getRedGreenColor,
} from "../lib/utils.js";

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
  onGroupClick,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!intergroupCohesion) return null;

  const handleGroupClick = (groupId) => {
    if (onGroupClick) {
      onGroupClick(groupId);
    }
  };

  return (
    <div className="cohesion-heatmap">
      <h3
        className="cohesion-heatmap-title collapsible-title"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span>Cross Group Similarity</span>
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
                    >
                      <div className="cohesion-heatmap-th-group-content">
                        <span>{getHeatmapXAxisLabel(group, mandate)}</span>
                        <span
                          className="cohesion-heatmap-th-group-color"
                          style={{ backgroundColor: groupColor }}
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
                  >
                    <span className="cohesion-heatmap-td-label-text">
                      {getGroupAcronym(group1, mandate)}
                    </span>
                    {intergroupCohesion.groupColors?.get(group1) && (
                      <span
                        className="cohesion-heatmap-td-label-color"
                        style={{
                          backgroundColor:
                            intergroupCohesion.groupColors.get(group1),
                        }}
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
