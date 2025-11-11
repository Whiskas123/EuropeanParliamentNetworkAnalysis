"use client";

import { getGroupDisplayName } from "@/lib/utils";

export default function IntragroupCohesion({
  intragroupCohesion,
  graphData,
  mandate,
}) {
  if (!intragroupCohesion || intragroupCohesion.length === 0) return null;
  if (!graphData) return null; // Don't render if no graphData

  const filteredCohesion = intragroupCohesion.filter(
    (item) => item.group !== "NonAttached"
  );
  if (filteredCohesion.length === 0) return null;
  
  const maxScore = Math.max(...filteredCohesion.map((i) => i.score));

  // Create a color map from graphData nodes for fast lookup
  const groupColorMap = new Map();
  graphData.nodes.forEach((node) => {
    if (node.groupId && !groupColorMap.has(node.groupId)) {
      groupColorMap.set(node.groupId, node.color);
    }
  });

  return (
    <div>
      <h3 className="intragroup-cohesion-title">
        Intra-group Cohesion Score
      </h3>
      <div className="intragroup-cohesion-list">
        {filteredCohesion.map((item) => {
          const widthPercent = maxScore > 0 ? (item.score / maxScore) * 100 : 0;
          // Use the color map for fast lookup
          const nodeColor = groupColorMap.get(item.group) || "#CCCCCC";

          return (
            <div key={item.group} className="intragroup-cohesion-item">
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

