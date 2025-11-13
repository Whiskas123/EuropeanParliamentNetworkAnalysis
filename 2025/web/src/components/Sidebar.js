"use client";

import { useState } from "react";
import SearchBar from "./SearchBar";
import MEPInfoPanel from "./MEPInfoPanel";
import SimilarityScores from "./SimilarityScores";
import ClosestMEPs from "./ClosestMEPs";
import CohesionHeatmap from "./CohesionHeatmap";
import IntragroupCohesion from "./IntragroupCohesion";
import CountrySimilarity from "./CountrySimilarity";
import GroupInfoPanel from "./GroupInfoPanel";
import LoadingSpinner from "./LoadingSpinner";

export default function Sidebar({
  mandate,
  selectedNode,
  selectedGroup,
  graphData,
  groupSimilarityScore,
  countrySimilarityScore,
  agreementScores,
  closestMEPs,
  intergroupCohesion,
  intragroupCohesion,
  countrySimilarity,
  selectedSubject,
  onSelectNode,
  onSelectNodeFromGroup,
  onClearNodeKeepGroup,
  onSelectGroup,
  onCountryClick,
  loading = false,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);

  // Get voting sessions from metadata
  const votingSessions = graphData?.metadata?.votingSessions ?? null;

  // Format mandate as ordinal (e.g., 10 -> "10th", 9 -> "9th")
  const formatMandateOrdinal = (mandateNum) => {
    const num = mandateNum % 100;
    const suffix =
      num >= 11 && num <= 13
        ? "th"
        : num % 10 === 1
        ? "st"
        : num % 10 === 2
        ? "nd"
        : num % 10 === 3
        ? "rd"
        : "th";
    return `${mandateNum}${suffix}`;
  };

  const handleSearchSelect = (node) => {
    onSelectNode(node);
    setSearchQuery("");
    setSearchResults([]);
    setSearchOpen(false);
  };

  const handleGroupClick = (groupId) => {
    if (onSelectGroup) {
      onSelectGroup(groupId);
    }
  };

  const handleMEPClick = (mep) => {
    // Use the special handler that doesn't clear group selection when clicking from group view
    if (onSelectNodeFromGroup) {
      onSelectNodeFromGroup(mep);
    } else if (onSelectNode) {
      // Fallback to regular handler if special one not provided
      onSelectNode(mep);
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div
          className={`sidebar-header-top ${searchOpen ? "search-open" : ""}`}
        >
          <h2>{selectedNode ? "MEP" : selectedGroup ? "Group" : "Network"}</h2>
          <button
            onClick={() => {
              setSearchOpen(!searchOpen);
              if (!searchOpen) {
                setSearchQuery("");
                setSearchResults([]);
              }
            }}
            className="sidebar-search-button"
            title="Search MEP by name or country"
          >
            <span>Search MEP</span>

            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
          </button>
        </div>
        <SearchBar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchResults={searchResults}
          setSearchResults={setSearchResults}
          searchOpen={searchOpen}
          setSearchOpen={setSearchOpen}
          graphData={graphData}
          mandate={mandate}
          onSelectNode={handleSearchSelect}
        />
      </div>

      <div className="sidebar-content">
        {/* Network Statistics */}
        {graphData && !selectedNode && !selectedGroup && (
          <div className="network-stats">
            <div className="network-stat-item">
              <div className="network-stat-header">
                <span className="network-stat-label">Visible MEPs</span>
                <span className="network-stat-value">
                  {graphData.nodes.length}
                </span>
              </div>
              <div className="network-stat-description">
                MEPs that participated in at least 50% of the voting sessions
              </div>
            </div>
            {votingSessions !== null && (
              <div className="network-stat-item">
                <div className="network-stat-header">
                  <span className="network-stat-label">Voting Sessions</span>
                  <span className="network-stat-value">{votingSessions}</span>
                </div>
                <div className="network-stat-description">
                  {selectedSubject
                    ? `Roll-call voting sessions for ${selectedSubject} in the ${formatMandateOrdinal(
                        mandate
                      )} term`
                    : `Total roll-call voting sessions in the ${formatMandateOrdinal(
                        mandate
                      )} term`}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedNode ? (
          <>
            {selectedGroup && (
              <button
                className="group-info-back-button"
                onClick={() => {
                  // Clear node selection but keep group selection
                  if (onClearNodeKeepGroup) {
                    onClearNodeKeepGroup();
                  } else if (onSelectNode) {
                    // Fallback: clear node (will also clear group, but better than nothing)
                    onSelectNode(null);
                  }
                }}
              >
                ← Back to Group View
              </button>
            )}
            <MEPInfoPanel
              node={selectedNode}
              graphData={graphData}
              mandate={mandate}
            />
            <SimilarityScores
              groupSimilarityScore={groupSimilarityScore}
              countrySimilarityScore={countrySimilarityScore}
              agreementScores={agreementScores}
              graphData={graphData}
              mandate={mandate}
              selectedSubject={selectedSubject}
              selectedNode={selectedNode}
            />
            <ClosestMEPs
              meps={closestMEPs}
              onSelectMEP={onSelectNode}
              selectedSubject={selectedSubject}
            />
          </>
        ) : selectedGroup ? (
          <>
            <GroupInfoPanel
              groupId={selectedGroup}
              graphData={graphData}
              intragroupCohesion={intragroupCohesion}
              mandate={mandate}
              onSelectMEP={handleMEPClick}
            />
            <button
              className="group-info-back-button"
              onClick={() => onSelectGroup && onSelectGroup(null)}
            >
              ← Back to Network View
            </button>
          </>
        ) : (
          <>
            {intergroupCohesion && (
              <CohesionHeatmap
                intergroupCohesion={intergroupCohesion}
                mandate={mandate}
                onGroupClick={handleGroupClick}
              />
            )}
            {intragroupCohesion && graphData && (
              <IntragroupCohesion
                intragroupCohesion={intragroupCohesion}
                graphData={graphData}
                mandate={mandate}
                onGroupClick={handleGroupClick}
              />
            )}
            {countrySimilarity && graphData && (
              <CountrySimilarity
                countrySimilarity={countrySimilarity}
                graphData={graphData}
                onCountryClick={onCountryClick}
              />
            )}
            {!intergroupCohesion &&
              !intragroupCohesion &&
              !countrySimilarity &&
              graphData && (
                <div className="sidebar-loading-text">
                  Loading cohesion data...
                </div>
              )}
          </>
        )}
        {loading && <LoadingSpinner />}
      </div>
    </div>
  );
}
