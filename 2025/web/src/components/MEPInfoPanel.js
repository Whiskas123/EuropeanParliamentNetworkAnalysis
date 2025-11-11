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
      <div className="mep-info-section">
        <h3 className="mep-info-title">
          {node.label}
        </h3>
        {node.country && (
          <div className="mep-info-country">
            <span className="mep-info-country-flag">
              {getCountryFlag(node.country)}
            </span>
            <span className="mep-info-country-name">
              {node.country}
            </span>
          </div>
        )}
      </div>

      {node.groupId && (
        <div className="mep-info-section">
          <div className="mep-info-group-label">
            Political Group
          </div>
          <div className="mep-info-group-content">
            <div
              className="mep-info-group-color"
              style={{
                backgroundColor:
                  graphData?.nodeMap.get(node.id)?.color || "#CCCCCC",
              }}
            />
            <span className="mep-info-group-name">
              {getGroupAcronym(node.groupId, mandate)}
            </span>
            {changedGroups && (
              <div
                className="mep-info-group-tooltip-trigger"
                onMouseEnter={() => setShowGroupTooltip(true)}
                onMouseLeave={() => setShowGroupTooltip(false)}
              >
                <span className="mep-info-group-tooltip-icon">
                  ⓘ
                </span>
                {showGroupTooltip && (
                  <div className="mep-info-group-tooltip">
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
                          className="mep-info-group-tooltip-item"
                        >
                          <div
                            className="mep-info-group-tooltip-color"
                            style={{ backgroundColor: groupColor }}
                          />
                          <div className="mep-info-group-tooltip-content">
                            <div className="mep-info-group-tooltip-name">
                              {getGroupAcronym(groupId, mandate)}
                            </div>
                            <div className="mep-info-group-tooltip-years">
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

