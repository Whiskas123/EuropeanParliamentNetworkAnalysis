"use client";

import { useState } from "react";
import { getGroupFamily, getGroupAcronym, getGroupDisplayName, getCountryFlag } from "@/lib/utils";

export default function MEPInfoPanel({ node, graphData, mandate }) {
  const [showGroupTooltip, setShowGroupTooltip] = useState(false);

  if (!node) return null;

  const nodeData = graphData?.nodeMap.get(node.id);
  const groups = nodeData?.groups || [];

  // Check if MEP changed groups (has multiple different group families)
  const uniqueGroupFamilies = new Set(
    groups
      .map((g) => {
        const groupId = g?.groupid || g?.groupId;
        return groupId ? getGroupFamily(groupId) : null;
      })
      .filter(Boolean)
  );
  const changedGroups = uniqueGroupFamilies.size > 1;

  // Merge consecutive entries with the same group ID
  const mergedGroups = [];
  for (let i = 0; i < groups.length; i++) {
    const currentGroup = groups[i];
    const currentGroupId = currentGroup.groupid || currentGroup.groupId;

    if (mergedGroups.length === 0) {
      mergedGroups.push({ ...currentGroup });
    } else {
      const lastMerged = mergedGroups[mergedGroups.length - 1];
      const lastGroupId = lastMerged.groupid || lastMerged.groupId;

      if (currentGroupId === lastGroupId) {
        const lastEnd = lastMerged.end ? new Date(lastMerged.end) : null;
        const currentStart = currentGroup.start
          ? new Date(currentGroup.start)
          : null;

        if (lastEnd && currentStart) {
          const daysDiff = (currentStart - lastEnd) / (1000 * 60 * 60 * 24);
          if (daysDiff <= 1) {
            lastMerged.end = currentGroup.end || lastMerged.end;
            continue;
          }
        } else if (!lastEnd || !currentStart) {
          lastMerged.end = currentGroup.end || lastMerged.end;
          continue;
        }
      }

      mergedGroups.push({ ...currentGroup });
    }
  }

  return (
    <div>
      <div style={{ marginBottom: "20px" }}>
        <h3 style={{ margin: "0 0 10px 0", fontSize: "20px" }}>
          {node.label}
        </h3>
        {node.country && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "10px",
            }}
          >
            <span style={{ fontSize: "20px" }}>
              {getCountryFlag(node.country)}
            </span>
            <span style={{ fontSize: "14px", color: "#666" }}>
              {node.country}
            </span>
          </div>
        )}
      </div>

      {node.groupId && (
        <div style={{ marginBottom: "20px" }}>
          <div
            style={{
              fontSize: "12px",
              color: "#666",
              marginBottom: "5px",
            }}
          >
            Political Group
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div
              style={{
                width: "20px",
                height: "20px",
                backgroundColor:
                  graphData?.nodeMap.get(node.id)?.color || "#CCCCCC",
                borderRadius: "4px",
                border: "1px solid #ddd",
              }}
            />
            <span style={{ fontSize: "16px", fontWeight: "500" }}>
              {getGroupAcronym(node.groupId, mandate)}
            </span>
            {changedGroups && (
              <div
                style={{
                  position: "relative",
                  display: "inline-block",
                }}
                onMouseEnter={() => setShowGroupTooltip(true)}
                onMouseLeave={() => setShowGroupTooltip(false)}
              >
                <span
                  style={{
                    fontSize: "14px",
                    color: "#666",
                    cursor: "help",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    backgroundColor: "#f0f0f0",
                    border: "1px solid #ddd",
                  }}
                >
                  ⓘ
                </span>
                {showGroupTooltip && (
                  <div
                    style={{
                      position: "absolute",
                      left: "25px",
                      top: "0",
                      backgroundColor: "#fff",
                      border: "1px solid #ddd",
                      borderRadius: "6px",
                      padding: "8px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                      zIndex: 1000,
                      minWidth: "200px",
                      fontSize: "12px",
                    }}
                  >
                    {mergedGroups.map((group, idx) => {
                      const startYear = group.start
                        ? new Date(group.start).getFullYear()
                        : "?";
                      const endYear = group.end
                        ? new Date(group.end).getFullYear()
                        : "?";
                      const groupId = group.groupid || group.groupId;
                      const groupNode = graphData?.nodes.find(
                        (n) => n.groupId === groupId
                      );
                      const groupColor = groupNode?.color || "#CCCCCC";

                      return (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            marginBottom: "6px",
                            paddingBottom: "6px",
                            borderBottom:
                              idx < mergedGroups.length - 1
                                ? "1px solid #f0f0f0"
                                : "none",
                          }}
                        >
                          <div
                            style={{
                              width: "12px",
                              height: "12px",
                              backgroundColor: groupColor,
                              borderRadius: "3px",
                              border: "1px solid #ddd",
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontWeight: "500",
                                color: "#333",
                                marginBottom: "2px",
                                fontSize: "12px",
                              }}
                            >
                              {getGroupAcronym(groupId, mandate)}
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "#666",
                              }}
                            >
                              {startYear} - {endYear}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

