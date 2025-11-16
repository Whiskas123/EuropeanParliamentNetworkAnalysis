"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import {
  getGroupDisplayName,
  getGroupAcronym,
  getGroupColor,
  getCountryFlag,
  getGroupFamily,
  getSubjectEmoji,
} from "../lib/utils.js";

export default function GroupInfoPanel({
  groupId,
  graphData,
  intragroupCohesion,
  mandate,
  onSelectMEP,
}) {
  const groupInfo = useMemo(() => {
    if (!graphData || !groupId) return null;

    // Get mandate date range
    const getMandateDateRange = (mandateNum) => {
      const ranges = {
        6: { start: new Date("2004-07-20"), end: new Date("2009-07-14") },
        7: { start: new Date("2009-07-14"), end: new Date("2014-07-01") },
        8: { start: new Date("2014-07-01"), end: new Date("2019-07-02") },
        9: { start: new Date("2019-07-02"), end: new Date("2024-07-16") },
        10: { start: new Date("2024-07-16"), end: null }, // Ongoing
      };
      return ranges[mandateNum] || { start: null, end: null };
    };

    const mandateRange = getMandateDateRange(mandate);

    // Get all MEPs currently in this group
    const currentMEPs = graphData.nodes.filter(
      (node) => node.groupId === groupId
    );

    // Get group average similarity score
    const groupCohesion = intragroupCohesion?.find(
      (item) => item.group === groupId
    );
    const avgSimilarity = groupCohesion?.score || 0;

    // Collect all entrances and exits from all nodes
    const events = [];
    graphData.nodes.forEach((node) => {
      const groups = node.groups || [];
      groups.forEach((group, index) => {
        const groupIdFromHistory = group.groupid || group.groupId;
        if (groupIdFromHistory === groupId) {
          // Add entrance event if there's a start date
          if (group.start) {
            // Find previous group (where they came from)
            let fromGroup = null;
            if (index > 0) {
              const prevGroup = groups[index - 1];
              const prevGroupId = prevGroup?.groupid || prevGroup?.groupId;
              if (prevGroupId && prevGroupId !== groupId) {
                fromGroup = prevGroupId;
              }
            }

            // Only include if they came from another group AND it's a different family
            if (fromGroup) {
              const fromGroupFamily = getGroupFamily(fromGroup);
              const currentGroupFamily = getGroupFamily(groupId);

              // Skip if it's the same family (just a rebranding)
              if (fromGroupFamily === currentGroupFamily) {
                return; // Skip this entrance
              }

              const eventDate = new Date(group.start);
              // Check if event occurred during the selected mandate
              const isInMandate =
                eventDate >= mandateRange.start &&
                (mandateRange.end === null || eventDate < mandateRange.end);

              if (isInMandate) {
                events.push({
                  type: "entrance",
                  mepId: node.id,
                  mepName: node.label,
                  mepCountry: node.country,
                  date: group.start,
                  dateObj: eventDate,
                  fromGroup: fromGroup,
                });
              }
            }
          }
          // Add exit event if there's an end date
          if (group.end) {
            // Find next group (where they went to)
            let toGroup = null;
            if (index < groups.length - 1) {
              const nextGroup = groups[index + 1];
              const nextGroupId = nextGroup?.groupid || nextGroup?.groupId;
              if (nextGroupId && nextGroupId !== groupId) {
                toGroup = nextGroupId;
              }
            }

            // Only include if they went to another group AND it's a different family
            if (toGroup) {
              const toGroupFamily = getGroupFamily(toGroup);
              const currentGroupFamily = getGroupFamily(groupId);

              // Skip if it's the same family (just a rebranding)
              if (toGroupFamily === currentGroupFamily) {
                return; // Skip this exit
              }

              const eventDate = new Date(group.end);
              // Check if event occurred during the selected mandate
              const isInMandate =
                eventDate >= mandateRange.start &&
                (mandateRange.end === null || eventDate < mandateRange.end);

              if (isInMandate) {
                events.push({
                  type: "exit",
                  mepId: node.id,
                  mepName: node.label,
                  mepCountry: node.country,
                  date: group.end,
                  dateObj: eventDate,
                  toGroup: toGroup,
                });
              }
            }
          }
        }
      });
    });

    // Separate entrances and exits
    const entrances = events.filter((e) => e.type === "entrance");
    const exits = events.filter((e) => e.type === "exit");

    // Sort each chronologically (newest first - reversed)
    const sortEvents = (a, b) => {
      if (!a.dateObj && !b.dateObj) return 0;
      if (!a.dateObj) return 1;
      if (!b.dateObj) return -1;
      return b.dateObj - a.dateObj; // Reversed: newest first
    };
    entrances.sort(sortEvents);
    exits.sort(sortEvents);

    // Calculate average similarity for each MEP with all other MEPs in the group
    // Use the same method as in visualization page for consistency
    const edgesToUse = graphData.allLinks || graphData.links;
    const mepScores = currentMEPs.map((mep) => {
      // Find all edges connected to this MEP
      const connectedEdges = edgesToUse.filter(
        (edge) => edge.source === mep.id || edge.target === mep.id
      );

      // Filter to only edges with other MEPs in the same group
      const groupEdges = connectedEdges
        .map((edge) => {
          const otherNodeId =
            edge.source === mep.id ? edge.target : edge.source;
          const otherNode = graphData.nodeMap.get(otherNodeId);
          return otherNode && otherNode.groupId === groupId
            ? { weight: edge.weight || 0 }
            : null;
        })
        .filter((e) => e !== null);

      const avgScore =
        groupEdges.length > 0
          ? groupEdges.reduce((sum, e) => sum + e.weight, 0) / groupEdges.length
          : 0;

      return {
        mep,
        avgScore,
        count: groupEdges.length,
      };
    });

    // Sort by average score (highest first by default)
    const sortedByScore = [...mepScores].sort(
      (a, b) => b.avgScore - a.avgScore
    );

    return {
      currentCount: currentMEPs.length,
      avgSimilarity,
      entrances,
      exits,
      allMEPsSorted: sortedByScore,
    };
  }, [graphData, groupId, intragroupCohesion, mandate]);

  const entrancesListRef = useRef(null);
  const exitsListRef = useRef(null);
  const subjectScoresListRef = useRef(null);
  const mepsListRef = useRef(null);

  const [sortDirection, setSortDirection] = useState("desc"); // "desc" = highest to lowest, "asc" = lowest to highest
  const [subjectSortDirection, setSubjectSortDirection] = useState("desc"); // "desc" = highest to lowest, "asc" = lowest to highest
  
  // Collapsible state for sections
  const [isSubjectCollapsed, setIsSubjectCollapsed] = useState(false);
  const [isEntrancesCollapsed, setIsEntrancesCollapsed] = useState(false);
  const [isExitsCollapsed, setIsExitsCollapsed] = useState(false);
  const [isMEPsCollapsed, setIsMEPsCollapsed] = useState(false);

  // Calculate group similarity averages by subject using precomputed similarity scores
  const groupSubjectScores = useMemo(() => {
    if (!groupId || !graphData || !graphData.similarityScores) {
      return null;
    }

    // Get all MEPs in this group
    const groupMEPs = graphData.nodes.filter(
      (node) => node.groupId === groupId
    );

    if (groupMEPs.length === 0) {
      return null;
    }

    // Aggregate groupSubjectScores from all MEPs in the group
    const subjectScoreMap = new Map(); // subject -> { totalScore, totalCount, mepCount }

    groupMEPs.forEach((mep) => {
      const mepScores = graphData.similarityScores[mep.id];
      if (mepScores && mepScores.groupSubjectScores) {
        mepScores.groupSubjectScores.forEach((item) => {
          if (!subjectScoreMap.has(item.subject)) {
            subjectScoreMap.set(item.subject, {
              totalScore: 0,
              totalCount: 0,
              mepCount: 0,
            });
          }
          const stats = subjectScoreMap.get(item.subject);
          // Add weighted average: score * count (to account for different numbers of connections)
          stats.totalScore += item.score * item.count;
          stats.totalCount += item.count;
          stats.mepCount += 1;
        });
      }
    });

    // Convert to array and calculate group averages
    const subjectScores = Array.from(subjectScoreMap.entries())
      .map(([subject, stats]) => ({
        subject,
        score: stats.totalCount > 0 ? stats.totalScore / stats.totalCount : 0,
        count: stats.totalCount,
      }))
      .filter((item) => item.count > 0) // Only include subjects with data
      .sort((a, b) => b.score - a.score); // Sort by score (highest first)

    return subjectScores.length > 0 ? subjectScores : null;
  }, [groupId, graphData]);

  // Sort subject scores based on current sort direction
  const sortedSubjectScores = useMemo(() => {
    if (!groupSubjectScores) return null;
    if (subjectSortDirection === "desc") {
      return [...groupSubjectScores]; // Already sorted highest to lowest
    } else {
      return [...groupSubjectScores].reverse(); // Reverse for lowest to highest
    }
  }, [groupSubjectScores, subjectSortDirection]);

  // Sort MEPs based on current sort direction
  const sortedMEPs = useMemo(() => {
    if (!groupInfo || !groupInfo.allMEPsSorted) return [];
    if (sortDirection === "desc") {
      return [...groupInfo.allMEPsSorted]; // Already sorted highest to lowest
    } else {
      return [...groupInfo.allMEPsSorted].reverse(); // Reverse for lowest to highest
    }
  }, [groupInfo, sortDirection]);

  // Check if lists are scrollable and add visual cue
  useEffect(() => {
    if (!groupInfo) return;

    const scrollHandlers = new Map();

    const checkScrollable = (element) => {
      if (!element) return;
      const isScrollable = element.scrollHeight > element.clientHeight;

      // Remove existing handler if any
      const existingHandler = scrollHandlers.get(element);
      if (existingHandler) {
        element.removeEventListener("scroll", existingHandler);
        scrollHandlers.delete(element);
      }

      if (isScrollable) {
        element.setAttribute("data-scrollable", "true");

        // Update on scroll to track top and bottom positions
        const handleScroll = () => {
          const isAtTop = element.scrollTop <= 5;
          const isAtBottom =
            element.scrollHeight - element.scrollTop <=
            element.clientHeight + 5;

          if (isAtTop) {
            element.setAttribute("data-at-top", "true");
          } else {
            element.setAttribute("data-at-top", "false");
          }

          if (isAtBottom) {
            element.setAttribute("data-at-bottom", "true");
          } else {
            element.setAttribute("data-at-bottom", "false");
          }
        };

        element.addEventListener("scroll", handleScroll);
        handleScroll(); // Check initial state
        scrollHandlers.set(element, handleScroll);
      } else {
        element.removeAttribute("data-scrollable");
        element.removeAttribute("data-at-bottom");
        element.removeAttribute("data-at-top");
      }
    };

    checkScrollable(entrancesListRef.current);
    checkScrollable(exitsListRef.current);
    checkScrollable(subjectScoresListRef.current);
    checkScrollable(mepsListRef.current);

    // Also check on resize
    const handleResize = () => {
      checkScrollable(entrancesListRef.current);
      checkScrollable(exitsListRef.current);
      checkScrollable(subjectScoresListRef.current);
      checkScrollable(mepsListRef.current);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      // Clean up all scroll handlers
      scrollHandlers.forEach((handler, element) => {
        element.removeEventListener("scroll", handler);
      });
      scrollHandlers.clear();
    };
  }, [
    groupInfo,
    groupInfo?.entrances.length,
    groupInfo?.exits.length,
    sortedSubjectScores,
    sortedMEPs,
  ]);

  if (!groupInfo) return null;

  const formatDate = (dateStr) => {
    if (!dateStr) return "?";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "?";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${month}/${year}`;
  };

  const groupColor = getGroupColor(groupId);

  const toggleSortDirection = () => {
    setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
  };

  const toggleSubjectSortDirection = () => {
    setSubjectSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
  };

  return (
    <div className="group-info-panel">
      <div className="group-info-header">
        <div
          className="group-info-color"
          style={{ backgroundColor: groupColor }}
        />
        <h3 className="group-info-title">
          {getGroupDisplayName(groupId, mandate)}
        </h3>
      </div>

      <div className="group-info-section">
        <div className="group-info-stat">
          <span className="group-info-stat-label">Current MEPs</span>
          <span className="group-info-stat-value">
            {groupInfo.currentCount}
          </span>
        </div>
        <div className="group-info-stat">
          <span className="group-info-stat-label">Average Similarity</span>
          <span className="group-info-stat-value">
            {(groupInfo.avgSimilarity * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Group Similarity by Subject */}
      <div className="group-info-section">
        <div className="group-info-section-header">
          <h4 
            className="group-info-section-title collapsible-title"
            onClick={() => setIsSubjectCollapsed(!isSubjectCollapsed)}
          >
            <span>Subject by similarity to group</span>
            <svg
              className={`collapse-icon ${isSubjectCollapsed ? "collapsed" : ""}`}
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
          {sortedSubjectScores && sortedSubjectScores.length > 0 && !isSubjectCollapsed && (
            <button
              className="group-info-sort-button"
              onClick={toggleSubjectSortDirection}
              title={
                subjectSortDirection === "desc"
                  ? "Sort: Highest to Lowest (click to reverse)"
                  : "Sort: Lowest to Highest (click to reverse)"
              }
            >
              <span>
                {subjectSortDirection === "desc"
                  ? "Highest to Lowest"
                  : "Lowest to Highest"}
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform:
                    subjectSortDirection === "asc" ? "rotate(180deg)" : "none",
                }}
              >
                <path d="M7 13l5 5 5-5M7 6l5-5 5 5" />
              </svg>
            </button>
          )}
        </div>
        <div className={`collapsible-content ${!isSubjectCollapsed ? "expanded" : ""}`}>
          <div className="group-subject-scores-wrapper">
          {sortedSubjectScores && sortedSubjectScores.length > 0 ? (
            <div
              className="group-subject-scores-list"
              ref={subjectScoresListRef}
            >
              {sortedSubjectScores.map((item) => {
                const widthPercent = item.score * 100;
                return (
                  <div key={item.subject} className="group-subject-score-item">
                    <div className="group-subject-score-header">
                      <span className="group-subject-score-name">
                        {getSubjectEmoji(item.subject)} {item.subject}
                      </span>
                      <span className="group-subject-score-value">
                        {(item.score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="group-subject-score-bar-container">
                      <div
                        className="group-subject-score-bar"
                        style={{
                          width: `${widthPercent}%`,
                          backgroundColor: groupColor,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="group-subject-scores-empty">
              No subject data available
            </div>
          )}
          </div>
        </div>
      </div>

      {(groupInfo.entrances.length > 0 || groupInfo.exits.length > 0) && (
        <>
          {groupInfo.entrances.length > 0 && (
            <div className="group-info-section">
              <h4 
                className="group-info-section-title collapsible-title"
                onClick={() => setIsEntrancesCollapsed(!isEntrancesCollapsed)}
              >
                <span>Entrances</span>
                <svg
                  className={`collapse-icon ${isEntrancesCollapsed ? "collapsed" : ""}`}
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
              <div className={`collapsible-content ${!isEntrancesCollapsed ? "expanded" : ""}`}>
                <div className="group-info-events-wrapper">
                <div className="group-info-events" ref={entrancesListRef}>
                  {groupInfo.entrances.map((event, idx) => {
                    // Find the MEP node for clicking
                    const mepNode = graphData?.nodeMap.get(event.mepId);

                    return (
                      <div
                        key={idx}
                        className={`group-info-event ${
                          mepNode ? "clickable" : ""
                        }`}
                        onClick={() => {
                          if (mepNode && onSelectMEP) {
                            onSelectMEP(mepNode);
                          }
                        }}
                      >
                        <div className="group-info-event-type">→</div>
                        <div className="group-info-event-content">
                          <div className="group-info-event-name">
                            {event.mepName}
                          </div>
                          <div className="group-info-event-meta">
                            {event.mepCountry && (
                              <span className="group-info-event-country">
                                {getCountryFlag(event.mepCountry)}{" "}
                                {event.mepCountry}
                              </span>
                            )}
                            {event.fromGroup && (
                              <span className="group-info-event-group">
                                <span
                                  className="group-info-event-group-color"
                                  style={{
                                    backgroundColor: getGroupColor(
                                      event.fromGroup
                                    ),
                                  }}
                                />
                                from {getGroupAcronym(event.fromGroup, mandate)}
                              </span>
                            )}
                            <span className="group-info-event-date">
                              {formatDate(event.date)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {groupInfo.exits.length > 0 && (
            <div className="group-info-section">
              <h4 
                className="group-info-section-title collapsible-title"
                onClick={() => setIsExitsCollapsed(!isExitsCollapsed)}
              >
                <span>Exits</span>
                <svg
                  className={`collapse-icon ${isExitsCollapsed ? "collapsed" : ""}`}
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
              <div className={`collapsible-content ${!isExitsCollapsed ? "expanded" : ""}`}>
                <div className="group-info-events-wrapper">
                  <div className="group-info-events" ref={exitsListRef}>
                  {groupInfo.exits.map((event, idx) => {
                    // Find the MEP node for clicking
                    const mepNode = graphData?.nodeMap.get(event.mepId);

                    return (
                      <div
                        key={idx}
                        className={`group-info-event ${
                          mepNode ? "clickable" : ""
                        }`}
                        onClick={() => {
                          if (mepNode && onSelectMEP) {
                            onSelectMEP(mepNode);
                          }
                        }}
                      >
                        <div className="group-info-event-type">←</div>
                        <div className="group-info-event-content">
                          <div className="group-info-event-name">
                            {event.mepName}
                          </div>
                          <div className="group-info-event-meta">
                            {event.mepCountry && (
                              <span className="group-info-event-country">
                                {getCountryFlag(event.mepCountry)}{" "}
                                {event.mepCountry}
                              </span>
                            )}
                            {event.toGroup && (
                              <span className="group-info-event-group">
                                <span
                                  className="group-info-event-group-color"
                                  style={{
                                    backgroundColor: getGroupColor(
                                      event.toGroup
                                    ),
                                  }}
                                />
                                to {getGroupAcronym(event.toGroup, mandate)}
                              </span>
                            )}
                            <span className="group-info-event-date">
                              {formatDate(event.date)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {sortedMEPs.length > 0 && (
        <div className="group-info-section">
          <div className="group-info-section-header">
            <h4 
              className="group-info-section-title collapsible-title"
              onClick={() => setIsMEPsCollapsed(!isMEPsCollapsed)}
            >
              <span>MEPs by similarity to group</span>
              <svg
                className={`collapse-icon ${isMEPsCollapsed ? "collapsed" : ""}`}
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
            {!isMEPsCollapsed && (
              <button
                className="group-info-sort-button"
                onClick={toggleSortDirection}
                title={
                  sortDirection === "desc"
                    ? "Sort: Highest to Lowest (click to reverse)"
                    : "Sort: Lowest to Highest (click to reverse)"
                }
              >
                <span>
                  {sortDirection === "desc"
                    ? "Highest to Lowest"
                    : "Lowest to Highest"}
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform:
                      sortDirection === "asc" ? "rotate(180deg)" : "none",
                  }}
                >
                  <path d="M7 13l5 5 5-5M7 6l5-5 5 5" />
                </svg>
              </button>
            )}
          </div>
          <div className={`collapsible-content ${!isMEPsCollapsed ? "expanded" : ""}`}>
            <div className="group-info-meps-wrapper">
            <div className="group-info-meps-list" ref={mepsListRef}>
              {sortedMEPs.map((item, idx) => {
                const rank =
                  sortDirection === "desc" ? idx + 1 : sortedMEPs.length - idx;
                return (
                  <div
                    key={item.mep.id}
                    className="group-info-mep-item clickable"
                    onClick={() => onSelectMEP && onSelectMEP(item.mep)}
                  >
                    <div className="group-info-mep-rank">{rank}</div>
                    <div className="group-info-mep-content">
                      <div className="group-info-mep-name">
                        {item.mep.label}
                      </div>
                      <div className="group-info-mep-meta">
                        {item.mep.country && (
                          <span className="group-info-mep-country">
                            {getCountryFlag(item.mep.country)}{" "}
                            {item.mep.country}
                          </span>
                        )}
                        <span className="group-info-mep-score">
                          {(item.avgScore * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
