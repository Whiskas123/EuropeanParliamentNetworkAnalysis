"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getGroupAcronym,
  getGroupDisplayName,
  getSubjectEmoji,
} from "../lib/utils.js";
import RadialGauge, { RadialGrid, RadialScaleNote } from "./RadialGauge";

export default function SimilarityScores({
  selectedCountry,
  groupSimilarityScore,
  countrySimilarityScore,
  agreementScores,
  graphData,
  mandate,
  selectedNode,
  selectedSubject, // Subject selected for the network view
}) {
  const [agreementSubject, setAgreementSubject] = useState(null);
  const [fallbackSubjects, setFallbackSubjects] = useState([]);

  // Collapsible state for sections
  const [isSimilarityScoresCollapsed, setIsSimilarityScoresCollapsed] =
    useState(false);
  const [isAgreementCollapsed, setIsAgreementCollapsed] = useState(false);

  // Get subjects from graphData (precomputed) - already filtered to >5 voting sessions
  const subjects = useMemo(() => {
    // Use subjects from graphData (fastest - already loaded and filtered)
    if (graphData?.subjects && graphData.subjects.length > 0) {
      // graphData.subjects is an array of subject names (strings)
      return graphData.subjects;
    }

    // Fallback: extract from similarityScores if available
    if (graphData?.similarityScores) {
      // Try to get from any MEP's scores (not just selected one)
      const firstMepId = Object.keys(graphData.similarityScores)[0];
      if (firstMepId) {
        const mepScores = graphData.similarityScores[firstMepId];
        if (mepScores) {
          if (mepScores.subjectAgreementScores) {
            return Object.keys(mepScores.subjectAgreementScores).sort();
          } else if (mepScores.groupSubjectScores) {
            return mepScores.groupSubjectScores
              .map((item) => item.subject)
              .sort();
          }
        }
      }
    }

    // Last resort: use cached fallback subjects
    return fallbackSubjects;
  }, [graphData, fallbackSubjects]);

  // Set agreementSubject to selectedSubject when network subject is selected
  useEffect(() => {
    if (selectedSubject && selectedNode) {
      // Only set if the subject is available in the subjects list
      if (subjects.includes(selectedSubject)) {
        setAgreementSubject(selectedSubject);
      }
    } else if (!selectedSubject) {
      // Clear agreementSubject when network subject is cleared
      setAgreementSubject(null);
    }
  }, [selectedSubject, selectedNode, subjects]);

  // Fallback: load subjects from data.json only if not in graphData
  useEffect(() => {
    // Only load if we don't have subjects from graphData
    if (subjects.length === 0 && graphData) {
      async function loadSubjects() {
        try {
          const response = await fetch(`/data/mandate_${mandate}/data.json`);
          if (!response.ok) {
            return;
          }
          const data = await response.json();
          if (data.edgesBySubject) {
            const subjectList = Object.keys(data.edgesBySubject).sort();
            setFallbackSubjects(subjectList);
          }
        } catch (error) {
          console.error("Error loading subjects:", error);
        }
      }
      loadSubjects();
    }
  }, [mandate, graphData, subjects.length]);

  // Load agreement scores for selected subject from precomputed data
  const subjectAgreementScores = useMemo(() => {
    if (!agreementSubject || !selectedNode || !graphData) {
      return null;
    }

    // Use precomputed similarity scores if available
    if (
      graphData.similarityScores &&
      graphData.similarityScores[selectedNode.id]
    ) {
      const mepScores = graphData.similarityScores[selectedNode.id];
      if (
        mepScores.subjectAgreementScores &&
        mepScores.subjectAgreementScores[agreementSubject]
      ) {
        return mepScores.subjectAgreementScores[agreementSubject];
      }
    }

    return null;
  }, [agreementSubject, selectedNode, graphData]);

  // Load group similarity per subject for the selected MEP from precomputed data
  const groupSubjectScores = useMemo(() => {
    if (!selectedNode || !graphData) {
      return null;
    }

    // Use precomputed similarity scores if available
    if (
      graphData.similarityScores &&
      graphData.similarityScores[selectedNode.id]
    ) {
      const mepScores = graphData.similarityScores[selectedNode.id];
      if (
        mepScores.groupSubjectScores &&
        mepScores.groupSubjectScores.length > 0
      ) {
        return mepScores.groupSubjectScores;
      }
    }

    return null;
  }, [selectedNode, graphData]);

  // These scores compare the MEP against the group members *present in the
  // current network*. In a country view that is only their compatriots — often
  // a single person — so the label has to say so rather than implying the
  // whole group.
  const groupPeerLabel = (() => {
    const acronym = getGroupAcronym(selectedNode?.groupId, mandate);
    const counts = new Set(groupSubjectScores.map((i) => i.count));
    const n = counts.size === 1 ? [...counts][0] : null;
    const where = selectedCountry ? ` in ${selectedCountry}` : "";
    if (n === 1) return `the other ${acronym} member${where}`;
    if (n) return `${acronym} members${where} (${n} MEPs)`;
    return `${acronym} members${where}`;
  })();

  // One pass over the nodes instead of a find() per group inside the render.
  // Above the guard below, because a hook after an early return runs on some
  // renders and not others.
  const groupColors = useMemo(() => {
    const colors = new Map();
    for (const node of graphData?.nodes || []) {
      if (node.groupId && !colors.has(node.groupId)) {
        colors.set(node.groupId, node.color);
      }
    }
    return colors;
  }, [graphData]);

  if (
    groupSimilarityScore === null &&
    countrySimilarityScore === null &&
    (!agreementScores || agreementScores.length === 0)
  ) {
    return null;
  }

  // Determine which agreement scores to display
  const displayAgreementScores =
    agreementSubject && subjectAgreementScores
      ? subjectAgreementScores
      : agreementScores;

  return (
    <div className="similarity-scores">
      <h4
        className="similarity-scores-title collapsible-title"
        onClick={() =>
          setIsSimilarityScoresCollapsed(!isSimilarityScoresCollapsed)
        }
      >
        <span>Similarity Scores</span>
        <svg
          className={`collapse-icon ${
            isSimilarityScoresCollapsed ? "collapsed" : ""
          }`}
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
      <div
        className={`collapsible-content ${
          !isSimilarityScoresCollapsed ? "expanded" : ""
        }`}
      >
        <div className="similarity-scores-list">
          {groupSimilarityScore !== null && (
            <div className="similarity-score-item">
              <div className="similarity-score-header">
                <span className="similarity-score-label">Group Similarity</span>
                <span className="similarity-score-value">
                  {(groupSimilarityScore.score * 100).toFixed(1)}%
                </span>
              </div>
              <div className="similarity-score-description">
                Average voting agreement{" "}
                {selectedNode?.groupId === "NonAttached" ? (
                  <>
                    with {groupSimilarityScore.count} non attached MEP
                    {groupSimilarityScore.count !== 1 ? "s" : ""}
                  </>
                ) : (
                  <>
                    with {groupSimilarityScore.count} MEP
                    {groupSimilarityScore.count !== 1 ? "s" : ""} from the same
                    political group
                  </>
                )}
              </div>
              {groupSubjectScores && groupSubjectScores.length > 0 && (
                <div className="group-subject-breakdown">
                  {groupSubjectScores.length >= 3 && (
                    <div className="group-subject-section">
                      <div className="group-subject-label">
                        Higher voting agreement with {groupPeerLabel} on:
                      </div>
                      <div className="group-subject-list">
                        {groupSubjectScores.slice(0, 3).map((item) => (
                          <div
                            key={item.subject}
                            className="group-subject-item"
                          >
                            <span className="group-subject-name agree-more">
                              {getSubjectEmoji(item.subject)} {item.subject}
                            </span>
                            <span className="group-subject-score">
                              {(item.score * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {groupSubjectScores.length >= 3 && (
                    <div className="group-subject-section">
                      <div className="group-subject-label">
                        Lower voting agreement with {groupPeerLabel} on:
                      </div>
                      <div className="group-subject-list">
                        {groupSubjectScores
                          .slice(-3)
                          .reverse()
                          .map((item) => (
                            <div
                              key={item.subject}
                              className="group-subject-item"
                            >
                              <span className="group-subject-name agree-less">
                                {getSubjectEmoji(item.subject)} {item.subject}
                              </span>
                              <span className="group-subject-score">
                                {(item.score * 100).toFixed(1)}%
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {countrySimilarityScore !== null && (
            <div className="similarity-score-item">
              <div className="similarity-score-header">
                <span className="similarity-score-label">
                  Country Similarity
                </span>
                <span className="similarity-score-value">
                  {(countrySimilarityScore.score * 100).toFixed(1)}%
                </span>
              </div>
              <div className="similarity-score-description">
                Average voting agreement with {countrySimilarityScore.count} MEP
                {countrySimilarityScore.count !== 1 ? "s" : ""} from the same
                country
              </div>
            </div>
          )}

          {displayAgreementScores && displayAgreementScores.length > 0 && (
            <div className="similarity-scores-agreement">
              <div className="similarity-scores-agreement-header-section">
                <h4
                  className="similarity-scores-agreement-title collapsible-title"
                  onClick={() => setIsAgreementCollapsed(!isAgreementCollapsed)}
                >
                  <span>
                    Voting Agreement with Political Groups
                    {agreementSubject &&
                      ` (${getSubjectEmoji(
                        agreementSubject
                      )} ${agreementSubject})`}
                  </span>
                  <svg
                    className={`collapse-icon ${
                      isAgreementCollapsed ? "collapsed" : ""
                    }`}
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
                {subjects.length > 0 && !selectedSubject && (
                  <select
                    className="agreement-subject-selector"
                    value={agreementSubject || ""}
                    onChange={(e) =>
                      setAgreementSubject(e.target.value || null)
                    }
                  >
                    <option value="">All Policy Areas</option>
                    {subjects.map((subject) => (
                      <option key={subject} value={subject}>
                        {getSubjectEmoji(subject)} {subject}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div
                className={`collapsible-content ${
                  !isAgreementCollapsed ? "expanded" : ""
                }`}
              >
                <div className="similarity-scores-agreement-list-wrapper">
                  {/* Full scale here, unlike the cohesion grids. This measures
                      one MEP against groups that are not theirs, which runs
                      from 16% to 98% — 28% of these figures in the dataset are
                      under 50%, so a 50% floor would blank a quarter of the
                      dials. */}
                  <RadialScaleNote floor={0} />
                  <RadialGrid min={82}>
                    {displayAgreementScores
                      // The non-attached are not a group, so agreement "with"
                      // them is not agreement with anything.
                      .filter((item) => item.groupId !== "NonAttached")
                      // Ranked, because a grid carries its order in the layout.
                      .slice()
                      .sort((a, b) => b.score - a.score)
                      .map((item) => (
                        <RadialGauge
                          key={item.groupId}
                          value={item.score}
                          floor={0}
                          color={groupColors.get(item.groupId) || "#CCCCCC"}
                          label={getGroupAcronym(item.groupId, mandate)}
                          title={`${selectedNode?.label ?? "This MEP"} votes with ${getGroupDisplayName(
                            item.groupId,
                            mandate
                          )} ${(item.score * 100).toFixed(1)}% of the time${
                            agreementSubject ? ` on ${agreementSubject}` : ""
                          }`}
                        />
                      ))}
                  </RadialGrid>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
