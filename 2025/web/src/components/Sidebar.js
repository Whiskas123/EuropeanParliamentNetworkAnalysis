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

  const handleSearchSelect = (node) => {
    onSelectNode(node);
    setSearchQuery("");
    setSearchResults([]);
    setSearchOpen(false);
  };

  return (
    <div
      style={{
        width: "30%",
        backgroundColor: "#ffffff",
        borderLeft: "1px solid #e0e0e0",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "20px",
          backgroundColor: "#003399",
          color: "white",
          minHeight: "76px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: searchOpen ? "15px" : "0",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "18px" }}>MEP Information</h2>
          <button
            onClick={() => {
              setSearchOpen(!searchOpen);
              if (!searchOpen) {
                setSearchQuery("");
                setSearchResults([]);
              }
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "20px",
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
            title="Search MEP by name"
          >
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

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px",
          position: "relative",
        }}
      >
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
              <div style={{ color: "#999", fontStyle: "italic" }}>
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

