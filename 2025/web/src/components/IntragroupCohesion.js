"use client";

import { getGroupDisplayName } from "../lib/utils.js";

export default function IntragroupCohesion({
  intragroupCohesion,
  graphData,
  mandate,
  onGroupClick,
}) {
  if (!intragroupCohesion || intragroupCohesion.length === 0) return null;
  if (!graphData) return null; // Don't render if no graphData

  const filteredCohesion = intragroupCohesion.filter(
    (item) => item.group !== "NonAttached"
  );
  if (filteredCohesion.length === 0) return null;

  // Create a color map from graphData nodes for fast lookup
  const groupColorMap = new Map();
  graphData.nodes.forEach((node) => {
    if (node.groupId && !groupColorMap.has(node.groupId)) {
      groupColorMap.set(node.groupId, node.color);
    }
  });

  const handleGroupClick = (groupId) => {
    if (onGroupClick) {
      onGroupClick(groupId);
    }
  };

  return (
    <div>
      <h3 className="intragroup-cohesion-title">Group Average Similarity</h3>
      <div className="intragroup-cohesion-list">
        {filteredCohesion.map((item) => {
          const widthPercent = item.score * 100;
          // Use the color map for fast lookup
          const nodeColor = groupColorMap.get(item.group) || "#CCCCCC";

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
  );
}
