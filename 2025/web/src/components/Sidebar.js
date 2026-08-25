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
 * The network view, split by what each panel is actually about.
 *
 * The sidebar grew eight stacked panels and no way to skip one, so the answer
 * to "is this network worth printing?" sat above four thousand pixels of
 * everything else. Tabs fixed the scrolling; only the active tab is mounted,
 * and the tab survives a change of country or policy area, which is what makes
 * flipping through views to hunt for one worth printing bearable.
 *
 * What they did not fix was the grouping. One tab held three panels that answer
 * three different questions at three different scopes — an algorithmic reading
 * of the open network, a shortlist of *other* networks worth opening, and
 * twenty years of history that ignores the open view entirely — grouped only by
 * having been built last.
 *
 * The order is an argument, and the scope is the argument. The first three tabs
 * describe the network on screen, in increasing depth: what it is and what is
 * odd about it, how tightly its blocs hold, and what it looks like to something
 * that has never heard of a political group. The last two leave it: where else
 * to look, and what the whole Parliament has been doing since 1999.
 */
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "cohesion", label: "Cohesion" },
  { id: "structure", label: "Structure" },
  { id: "findings", label: "Findings" },
  { id: "history", label: "History" },
];

// Deterministic thousands separator: toLocaleString would differ between the
// server render and the browser and trip hydration.
const thousands = (value) =>
  typeof value === "number" && isFinite(value)
    ? String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : null;

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
  const nodeCount = graphData?.nodes?.length ?? null;

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

  /**
   * The sample every figure in the sidebar rests on, above the tabs.
   *
   * These two numbers used to be the first panel of the Overview tab, which
   * meant the cohesion figures, the community detection and the leaderboards
   * were all read four tabs away from the count they are computed over. Sample
   * size is the caveat this site is most careful about — a policy area can rest
   * on twelve votes — so it is context for every tab, not content of one.
   */
  const factsStrip = graphData ? (
    <div className="sidebar-facts">
      <span
        className="sidebar-fact"
        title={`Members of the European Parliament who took part in at least half the voting sessions${
          baseline?.scores?.nodeCount
            ? `. ${nodeCount} of the ${baseline.scores.nodeCount} in ${baseline.label}.`
            : ""
        }`}
      >
        <strong>{thousands(nodeCount)}</strong> MEPs
      </span>
      {votingSessions !== null && (
        <>
          <span className="sidebar-fact-sep" aria-hidden="true" />
          <span
            className="sidebar-fact"
            title={
              selectedSubject
                ? `Roll-call votes analysed for ${selectedSubject} in the ${formatMandateOrdinal(
                    mandate
                  )} parliamentary term`
                : `Total roll-call votes analysed in the ${formatMandateOrdinal(
                    mandate
                  )} parliamentary term`
            }
          >
            <strong>{thousands(votingSessions)}</strong> voting session
            {votingSessions === 1 ? "" : "s"}
          </span>
        </>
      )}
    </div>
  ) : null;

  const renderTabPanel = () => {
    if (activeTab === "overview") {
      return (
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

    // One panel per tab from here on, so none of them wears a collapse chevron:
    // opening the tab is the act that asks for the content, and a control that
    // hides everything under it would leave the tab looking broken.
    if (activeTab === "structure") {
      return (
        <StructurePanel
          graphData={graphData}
          mandate={mandate}
          onSelectNode={onSelectNode}
          onSelectGroup={onSelectGroup}
        />
      );
    }

    if (activeTab === "findings") {
      return (
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
      );
    }

    return (
      <TrendsPanel mandate={mandate} onMandateChange={onMandateChange} />
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

      {factsStrip}

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
