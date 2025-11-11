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
      <h3
        style={{
          margin: "0 0 15px 0",
          fontSize: "16px",
          fontWeight: "600",
          color: "#333",
        }}
      >
        Intra-group Cohesion Score
      </h3>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {filteredCohesion.map((item) => {
          const widthPercent = maxScore > 0 ? (item.score / maxScore) * 100 : 0;
          // Use the color map for fast lookup
          const nodeColor = groupColorMap.get(item.group) || "#CCCCCC";

          return (
            <div key={item.group}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "4px",
                  fontSize: "11px",
                }}
              >
                <span style={{ fontWeight: "500" }}>
                  {getGroupDisplayName(item.group, mandate)}
                </span>
                <span style={{ color: "#666" }}>
                  {(item.score * 100).toFixed(1)}%
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: "20px",
                  backgroundColor: "#f0f0f0",
                  borderRadius: "4px",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: `${widthPercent}%`,
                    height: "100%",
                    backgroundColor: nodeColor,
                    transition: "width 0.3s ease",
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

