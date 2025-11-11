"use client";

import { useState, useRef, useEffect } from "react";
import {
  getGroupFamily,
  getGroupAcronym,
  getGroupDisplayName,
  getCountryFlag,
  getGroupColor,
} from "../lib/utils.js";

export default function MEPInfoPanel({ node, graphData, mandate }) {
  const [showGroupTooltip, setShowGroupTooltip] = useState(false);
  const [showPartyTooltip, setShowPartyTooltip] = useState(false);
  const [groupTooltipPosition, setGroupTooltipPosition] = useState("right");
  const [partyTooltipPosition, setPartyTooltipPosition] = useState("right");

  const groupTooltipTriggerRef = useRef(null);
  const partyTooltipTriggerRef = useRef(null);
  const groupTooltipRef = useRef(null);
  const partyTooltipRef = useRef(null);

  // Check tooltip position when it's shown
  useEffect(() => {
    if (showGroupTooltip && groupTooltipTriggerRef.current) {
      const trigger = groupTooltipTriggerRef.current;
      const triggerRect = trigger.getBoundingClientRect();
      const windowWidth = window.innerWidth;

      // Estimate tooltip width (approximately 200px) and check if it would overflow
      const estimatedTooltipWidth = 200;
      const tooltipRight = triggerRect.right + 25 + estimatedTooltipWidth;

      if (tooltipRight > windowWidth) {
        setGroupTooltipPosition("left");
      } else {
        setGroupTooltipPosition("right");
      }
    } else if (!showGroupTooltip) {
      setGroupTooltipPosition("right"); // Reset when hidden
    }
  }, [showGroupTooltip]);

  useEffect(() => {
    if (showPartyTooltip && partyTooltipTriggerRef.current) {
      const trigger = partyTooltipTriggerRef.current;
      const triggerRect = trigger.getBoundingClientRect();
      const windowWidth = window.innerWidth;

      // Estimate tooltip width (approximately 200px) and check if it would overflow
      const estimatedTooltipWidth = 200;
      const tooltipRight = triggerRect.right + 25 + estimatedTooltipWidth;

      if (tooltipRight > windowWidth) {
        setPartyTooltipPosition("left");
      } else {
        setPartyTooltipPosition("right");
      }
    } else if (!showPartyTooltip) {
      setPartyTooltipPosition("right"); // Reset when hidden
    }
  }, [showPartyTooltip]);

  if (!node) return null;

  const nodeData = graphData?.nodeMap.get(node.id);
  const groups = nodeData?.groups || [];
  const partyNames = nodeData?.partyNames || [];
  const photoURL = nodeData?.photoURL || null;

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

  // Process party names - handle both string arrays and object arrays
  const hasMultipleParties = partyNames.length > 1;
  const displayPartyName =
    partyNames.length > 0
      ? typeof partyNames[0] === "string"
        ? partyNames[0]
        : partyNames[0].name || partyNames[0].partyName || ""
      : null;

  return (
    <div>
      <div className="mep-info-section">
        <div className="mep-info-header">
          {photoURL && (
            <img
              src={photoURL}
              alt={node.label}
              className="mep-info-photo"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          )}
          <div className="mep-info-header-content">
            <h3 className="mep-info-title">{node.label}</h3>
            {node.country && (
              <div className="mep-info-country">
                <span className="mep-info-country-flag">
                  {getCountryFlag(node.country)}
                </span>
                <span className="mep-info-country-name">{node.country}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {displayPartyName && (
        <div className="mep-info-section">
          <div className="mep-info-group-label">National Party</div>
          <div className="mep-info-group-content">
            <span className="mep-info-group-name">{displayPartyName}</span>
            {hasMultipleParties && (
              <div
                ref={partyTooltipTriggerRef}
                className="mep-info-group-tooltip-trigger"
                onMouseEnter={() => setShowPartyTooltip(true)}
                onMouseLeave={() => setShowPartyTooltip(false)}
              >
                <span className="mep-info-group-tooltip-icon">ⓘ</span>
                {showPartyTooltip && (
                  <div
                    ref={partyTooltipRef}
                    className={`mep-info-group-tooltip ${
                      partyTooltipPosition === "left"
                        ? "mep-info-group-tooltip-left"
                        : ""
                    }`}
                  >
                    {[...partyNames].reverse().map((party, idx) => {
                      const partyName =
                        typeof party === "string"
                          ? party
                          : party.name || party.partyName || "";
                      const startDate = party.start
                        ? new Date(party.start)
                        : null;
                      const endDate = party.end ? new Date(party.end) : null;

                      const formatDate = (date) => {
                        if (!date || isNaN(date.getTime())) return null;
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(
                          2,
                          "0"
                        );
                        return `${month}/${year}`;
                      };

                      const startFormatted = startDate
                        ? formatDate(startDate)
                        : null;
                      const endFormatted = endDate ? formatDate(endDate) : null;

                      return (
                        <div key={idx} className="mep-info-group-tooltip-item">
                          <div className="mep-info-group-tooltip-content">
                            <div className="mep-info-group-tooltip-name">
                              {partyName}
                            </div>
                            {(startFormatted || endFormatted) && (
                              <div className="mep-info-group-tooltip-years">
                                {startFormatted || "?"} -{" "}
                                {endFormatted || "Now"}
                              </div>
                            )}
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

      {node.groupId && (
        <div className="mep-info-section">
          <div className="mep-info-group-label">Political Group</div>
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
                ref={groupTooltipTriggerRef}
                className="mep-info-group-tooltip-trigger"
                onMouseEnter={() => setShowGroupTooltip(true)}
                onMouseLeave={() => setShowGroupTooltip(false)}
              >
                <span className="mep-info-group-tooltip-icon">ⓘ</span>
                {showGroupTooltip && (
                  <div
                    ref={groupTooltipRef}
                    className={`mep-info-group-tooltip ${
                      groupTooltipPosition === "left"
                        ? "mep-info-group-tooltip-left"
                        : ""
                    }`}
                  >
                    {mergedGroups.map((group, idx) => {
                      const formatDate = (dateStr) => {
                        if (!dateStr) return null;
                        const date = new Date(dateStr);
                        if (isNaN(date.getTime())) return null;
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(
                          2,
                          "0"
                        );
                        return `${month}/${year}`;
                      };

                      const startFormatted = formatDate(group.start) || "?";
                      const endFormatted = formatDate(group.end) || "Now";
                      const groupId = group.groupid || group.groupId;
                      const groupColor = getGroupColor(groupId);

                      return (
                        <div key={idx} className="mep-info-group-tooltip-item">
                          <div
                            className="mep-info-group-tooltip-color"
                            style={{ backgroundColor: groupColor }}
                          />
                          <div className="mep-info-group-tooltip-content">
                            <div className="mep-info-group-tooltip-name">
                              {getGroupAcronym(groupId, mandate)}
                            </div>
                            <div className="mep-info-group-tooltip-years">
                              {startFormatted} - {endFormatted}
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
