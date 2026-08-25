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

/**
 * The three tiers of the network view, in the order a reader needs them.
 *
 * The sidebar grew eight stacked panels and no way to skip one, so the answer
 * to "is this network worth printing?" sat above four thousand pixels of
 * everything else. Splitting them into tabs is not decoration: only the active
 * tier is mounted, so each tier is about a screen and a half, and the tier
 * survives a change of country or policy area — which is what makes flipping
 * through views to hunt for one worth printing bearable.
 *
 * The order is an argument. What is this network and what is odd about it,
 * first; how tightly its blocs actually hold, second; everything that reaches
 * past the open view — the whole-term shortlist, the algorithm's own reading,
 * five terms of history — last.
 */
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "cohesion", label: "Cohesion" },
  { id: "explore", label: "Explore" },
];

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
  const [activeTab, setActiveTab] = useState(TABS[0].id);

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

  // Arrow keys move between tabs and take focus with them, which is what a
  // tablist is expected to do; Home and End jump to the ends. Same behaviour
  // as the tabs inside the Findings panel.
  const handleTabKeyDown = (event) => {
    const keys = [
      "ArrowRight",
      "ArrowLeft",
      "ArrowDown",
      "ArrowUp",
      "Home",
      "End",
    ];
    if (!keys.includes(event.key)) return;
    event.preventDefault();

    const index = TABS.findIndex((item) => item.id === activeTab);
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % TABS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + TABS.length) % TABS.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = TABS.length - 1;
    }

    setActiveTab(TABS[next].id);
    const buttons = event.currentTarget.querySelectorAll('[role="tab"]');
    if (buttons && buttons[next]) buttons[next].focus();
  };

  // The tabs belong to the network view. With an MEP or a group selected the
  // sidebar is a profile — three panels, read top to bottom — and a tab strip
  // over it would be furniture with nothing to organise.
  const showTabs = Boolean(graphData) && !selectedNode && !selectedGroup;

  const networkOverview = (
    <>
      <h3 className="network-stats-title">Network Overview</h3>
      <div className="network-stats">
        <div className="network-stat-item">
          <div className="network-stat-header">
            <span className="network-stat-label">MEPs in Network</span>
            <span className="network-stat-value">{graphData?.nodes.length}</span>
          </div>
          <div className="network-stat-description">
            Members of the European Parliament who participated in at least 50% of voting sessions
            {baseline?.scores?.nodeCount ? (
              <span className="baseline-note">
                {graphData?.nodes.length} of the {baseline.scores.nodeCount} in{" "}
                {baseline.label}.
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
  );

  const renderTabPanel = () => {
    if (activeTab === "overview") {
      return (
        <>
          {networkOverview}
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
          {!baseline && (
            <div className="sidebar-tab-note">
              This is the whole Parliament, which is what every other view is
              measured against — so there is nothing to compare it with. Pick a
              country or a policy area and this tab will rank what moved.
            </div>
          )}
        </>
      );
    }

    if (activeTab === "cohesion") {
      const nothingReady =
        !intergroupCohesion && !intragroupCohesion && !countrySimilarity;
      if (nothingReady) {
        return (
          <div className="sidebar-empty-state">
            <div className="sidebar-empty-icon">📊</div>
            <p className="sidebar-empty-text">
              Calculating group and country similarity metrics. This may take a moment...
            </p>
          </div>
        );
      }
      // Within a group, then between groups, then the national dimension that
      // cuts across both.
      return (
        <>
          {intragroupCohesion && (
            <IntragroupCohesion
              intragroupCohesion={intragroupCohesion}
              graphData={graphData}
              mandate={mandate}
              baseline={baseline}
              onGroupClick={handleGroupClick}
            />
          )}
          {intergroupCohesion && (
            <CohesionHeatmap
              intergroupCohesion={intergroupCohesion}
              mandate={mandate}
              baseline={baseline}
              onGroupClick={handleGroupClick}
            />
          )}
          {countrySimilarity && (
            <CountrySimilarity
              countrySimilarity={countrySimilarity}
              graphData={graphData}
              onCountryClick={onCountryClick}
              selectedSubject={selectedSubject}
              baseline={baseline}
            />
          )}
        </>
      );
    }

    // Explore. These panels each cost real work to build, and opening the tab
    // is the deliberate act that pays for it, so they start open rather than
    // asking for a second click.
    return (
      <>
        <FindingsPanel
          mandate={mandate}
          selectedCountry={selectedCountry}
          selectedSubject={selectedSubject}
          graphData={graphData}
          onSelectNode={onSelectNode}
          onSelectGroup={onSelectGroup}
          onCountryClick={onCountryClick}
          onSelectSubject={onSelectSubject}
          defaultCollapsed={false}
        />
        <StructurePanel
          graphData={graphData}
          mandate={mandate}
          onSelectNode={onSelectNode}
          onSelectGroup={onSelectGroup}
          defaultCollapsed={false}
        />
        <TrendsPanel mandate={mandate} onMandateChange={onMandateChange} />
      </>
    );
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

      {/* Outside the scrolling content on purpose: a sticky element inside it
          would have to fight the container's own 20px padding, and the strip
          has to stay put while a tab three thousand pixels tall scrolls. */}
      {showTabs && (
        <div
          className="sidebar-tabs"
          role="tablist"
          aria-label="Network sidebar sections"
          onKeyDown={handleTabKeyDown}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`sidebar-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`sidebar-tabpanel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={`sidebar-tab ${
                activeTab === tab.id ? "sidebar-tab--active" : ""
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className="sidebar-content">
        {/* Show spinner prominently when loading and no data */}
        {loading && !graphData && (
          <LoadingSpinner message="Loading network data..." />
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
              selectedCountry={selectedCountry}
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
        ) : graphData ? (
          <div
            role="tabpanel"
            id={`sidebar-tabpanel-${activeTab}`}
            aria-labelledby={`sidebar-tab-${activeTab}`}
            tabIndex={0}
            className="sidebar-tabpanel"
          >
            {renderTabPanel()}
          </div>
        ) : null}
        {/* Show spinner at bottom when loading and data exists (for updates) */}
        {loading && graphData && <LoadingSpinner />}
      </div>
    </div>
  );
}
