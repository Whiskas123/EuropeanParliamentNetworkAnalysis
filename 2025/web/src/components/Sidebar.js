"use client";

import { useState } from "react";
import SearchBar from "./SearchBar";
import MEPInfoPanel from "./MEPInfoPanel";
import SimilarityScores from "./SimilarityScores";
import ClosestMEPs from "./ClosestMEPs";
import CohesionHeatmap from "./CohesionHeatmap";
import IntragroupCohesion from "./IntragroupCohesion";
import LoadingSpinner from "./LoadingSpinner";

export default function Sidebar({
  mandate,
  selectedNode,
  graphData,
  groupSimilarityScore,
  countrySimilarityScore,
  agreementScores,
  closestMEPs,
  intergroupCohesion,
  intragroupCohesion,
  onSelectNode,
  loading = false,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);

  // Get voting sessions from metadata
  const votingSessions = graphData?.metadata?.votingSessions ?? null;

  const handleSearchSelect = (node) => {
    onSelectNode(node);
    setSearchQuery("");
    setSearchResults([]);
    setSearchOpen(false);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div
          className={`sidebar-header-top ${searchOpen ? "search-open" : ""}`}
        >
          <h2>{selectedNode ? "MEP Information" : "Network"}</h2>
          <button
            onClick={() => {
              setSearchOpen(!searchOpen);
              if (!searchOpen) {
                setSearchQuery("");
                setSearchResults([]);
              }
            }}
            className="sidebar-search-button"
            title="Search MEP by name"
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
        {graphData && !selectedNode && (
          <div className="network-stats">
            <div className="network-stat-item">
              <div className="network-stat-header">
                <span className="network-stat-label">Visible MEPs</span>
                <span className="network-stat-value">
                  {graphData.nodes.length.toLocaleString()}
                </span>
              </div>
              <div className="network-stat-description">
                MEPs that participated in more than 50% of the voting sessions
              </div>
            </div>
            {votingSessions !== null && (
              <div className="network-stat-item">
                <div className="network-stat-header">
                  <span className="network-stat-label">Voting Sessions</span>
                  <span className="network-stat-value">
                    {votingSessions.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {selectedNode ? (
          <>
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
            />
            <ClosestMEPs meps={closestMEPs} onSelectMEP={onSelectNode} />
          </>
        ) : (
          <>
            {intergroupCohesion && (
              <CohesionHeatmap
                intergroupCohesion={intergroupCohesion}
                mandate={mandate}
              />
            )}
            {intragroupCohesion && graphData && (
              <IntragroupCohesion
                intragroupCohesion={intragroupCohesion}
                graphData={graphData}
                mandate={mandate}
              />
            )}
            {!intergroupCohesion && !intragroupCohesion && graphData && (
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
