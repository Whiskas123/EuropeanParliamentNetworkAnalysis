"use client";

import { useState } from "react";
import { getGroupDisplayName } from "../lib/utils.js";

export default function IntragroupCohesion({
  intragroupCohesion,
  graphData,
  mandate,
  onGroupClick,
}) {
  const [showTooltip, setShowTooltip] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  if (!intragroupCohesion || intragroupCohesion.length === 0) return null;
  if (!graphData) return null; // Don't render if no graphData

  const filteredCohesion = intragroupCohesion.filter(
    (item) => item.group !== "NonAttached"
  );
  if (filteredCohesion.length === 0) return null;

  // Create a color map from graphData nodes for fast lookup
  const groupColorMap = new Map();
  // Count MEPs per group
  const groupMEPCounts = new Map();
  graphData.nodes.forEach((node) => {
    if (node.groupId && !groupColorMap.has(node.groupId)) {
      groupColorMap.set(node.groupId, node.color);
    }
    if (node.groupId) {
      groupMEPCounts.set(
        node.groupId,
        (groupMEPCounts.get(node.groupId) || 0) + 1
      );
    }
  });

  const handleGroupClick = (groupId) => {
    if (onGroupClick) {
      onGroupClick(groupId);
    }
  };

  return (
    <div className="cohesion-heatmap">
      <h3
        className="intragroup-cohesion-title collapsible-title"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span>Group Similarity</span>
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
        <div className="intragroup-cohesion-list">
          {filteredCohesion.map((item) => {
            const widthPercent = item.score * 100;
            // Use the color map for fast lookup
            const nodeColor = groupColorMap.get(item.group) || "#CCCCCC";
            const mepCount = groupMEPCounts.get(item.group) || 0;

            return (
              <div
                key={item.group}
                className="intragroup-cohesion-item clickable"
                onClick={() => handleGroupClick(item.group)}
              >
                <div className="intragroup-cohesion-header">
                  <span className="intragroup-cohesion-name">
                    {getGroupDisplayName(item.group, mandate)}
                  </span>
                  <span className="intragroup-cohesion-value">
                    <span
                      className="intragroup-cohesion-mep-count"
                      onMouseEnter={() => setShowTooltip(item.group)}
                      onMouseLeave={() => setShowTooltip(null)}
                    >
                      {mepCount} MEP{mepCount !== 1 ? "s" : ""}
                      {showTooltip === item.group && (
                        <span className="intragroup-cohesion-tooltip">
                          Considering only MEPs that participated in &gt;50% of
                          the votes
                        </span>
                      )}
                    </span>
                    {" · "}
                    {(item.score * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="intragroup-cohesion-bar-container">
                  <div
                    className="intragroup-cohesion-bar"
                    style={{
                      width: `${widthPercent}%`,
                      backgroundColor: nodeColor,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
