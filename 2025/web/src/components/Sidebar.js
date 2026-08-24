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
import UnusualHerePanel from "./UnusualHerePanel";
import FindingsPanel from "./FindingsPanel";
import TrendsPanel from "./TrendsPanel";
import StructurePanel from "./StructurePanel";

export default function Sidebar({
  mandate,
  selectedCountry,
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
  baseline,
  renderSettings,
  onRenderSettingsChange,
  onSelectSubject,
  onSelectNode,
  onSelectNodeFromGroup,
  onClearNodeKeepGroup,
  onSelectGroup,
  onCountryClick,
  onMandateChange,
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
            title="Search for a Member of the European Parliament by name, country, or national party"
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
        {/* Show spinner prominently when loading and no data */}
        {loading && !graphData && (
          <LoadingSpinner message="Loading network data..." />
        )}

        {/* Network Statistics */}
        {graphData && !selectedNode && !selectedGroup && (
          <>
            <h3 className="network-stats-title">Network Overview</h3>
            <div className="network-stats">
              <div className="network-stat-item">
                <div className="network-stat-header">
                  <span className="network-stat-label">MEPs in Network</span>
                  <span className="network-stat-value">
                    {graphData.nodes.length}
                  </span>
                </div>
                <div className="network-stat-description">
                  Members of the European Parliament who participated in at least 50% of voting sessions
                  {baseline?.scores?.nodeCount ? (
                    <span className="baseline-note">
                      {graphData.nodes.length} of the{" "}
                      {baseline.scores.nodeCount} in {baseline.label}.
                    </span>
                  ) : null}
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
                      ? `Roll-call votes analyzed for ${selectedSubject} in the ${formatMandateOrdinal(
                          mandate
                        )} parliamentary term`
                      : `Total roll-call votes analyzed in the ${formatMandateOrdinal(
                          mandate
                        )} parliamentary term`}
                  </div>
                </div>
              )}
            </div>
          </>
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
              onSelectGroup={onSelectGroup}
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
            <UnusualHerePanel
              graphData={graphData}
              baseline={baseline}
              mandate={mandate}
              selectedCountry={selectedCountry}
              selectedSubject={selectedSubject}
              intergroupCohesion={intergroupCohesion}
              intragroupCohesion={intragroupCohesion}
              countrySimilarity={countrySimilarity}
              onSelectGroup={onSelectGroup}
              onCountryClick={onCountryClick}
            />
            <FindingsPanel
              mandate={mandate}
              selectedCountry={selectedCountry}
              selectedSubject={selectedSubject}
              graphData={graphData}
              onSelectNode={onSelectNode}
              onSelectGroup={onSelectGroup}
              onCountryClick={onCountryClick}
              onSelectSubject={onSelectSubject}
            />
            <StructurePanel
              graphData={graphData}
              mandate={mandate}
              onSelectNode={onSelectNode}
              onSelectGroup={onSelectGroup}
            />
            <TrendsPanel mandate={mandate} onMandateChange={onMandateChange} />
            {intergroupCohesion && (
              <CohesionHeatmap
                intergroupCohesion={intergroupCohesion}
                mandate={mandate}
                baseline={baseline}
                onGroupClick={handleGroupClick}
              />
            )}
            {intragroupCohesion && graphData && (
              <IntragroupCohesion
                intragroupCohesion={intragroupCohesion}
                graphData={graphData}
                mandate={mandate}
                baseline={baseline}
                onGroupClick={handleGroupClick}
              />
            )}
            {countrySimilarity && graphData && (
              <CountrySimilarity
                countrySimilarity={countrySimilarity}
                graphData={graphData}
                onCountryClick={onCountryClick}
                selectedSubject={selectedSubject}
                baseline={baseline}
              />
            )}
              {!intergroupCohesion &&
              !intragroupCohesion &&
              !countrySimilarity &&
              graphData && (
                <div className="sidebar-empty-state">
                  <div className="sidebar-empty-icon">📊</div>
                  <p className="sidebar-empty-text">
                    Calculating group and country similarity metrics. This may take a moment...
                  </p>
                </div>
              )}
          </>
        )}
        {/* Show spinner at bottom when loading and data exists (for updates) */}
        {loading && graphData && <LoadingSpinner />}
      </div>
    </div>
  );
}
