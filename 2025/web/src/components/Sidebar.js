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
import CohesionInsights from "./CohesionInsights";
import TrendsPanel from "./TrendsPanel";
import StructurePanel from "./StructurePanel";
import { getGroupColor, getGroupAcronym, CountryFlag } from "../lib/utils";

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
 * twenty years of history — grouped only by having been built last.
 *
 * The order is an argument, and the scope is the argument. Every tab describes
 * the network on screen. The first two do it in increasing depth: how tightly
 * its blocs hold, and what it looks like to something that has never heard of a
 * political group. History keeps the network and lets go of the term instead,
 * following the open view back to 2004 with the whole Parliament drawn faintly
 * behind it for scale.
 *
 * A Findings tab used to sit between them, holding term-wide rankings of the
 * views worth opening next. It was the one tab that let go of the network — and
 * because every row in it *was* a view, a list of places you could be standing
 * shown beside the place you are standing, changing country or policy area
 * moved every panel in the sidebar except the one whose rows looked most like
 * views. That reads as a control that has stopped responding, not as a
 * deliberate change of scope. It is now the Leads screen, opened from the
 * header over the whole page, which is the scope it always had: see
 * LeadsScreen.
 *
 * There used to be an Overview tab in front of these, holding a ranked list of
 * the largest movers. It was a restatement of the Cohesion tab one screen
 * higher up — the same groups, countries and pairs, the same deltas, sorted
 * differently — and being a ranking it always found five things to say whether
 * or not anything had happened. What it was reaching for now sits at the top of
 * Cohesion as a sentence that is usually absent: see CohesionInsights.
 */
const TABS = [
  { id: "cohesion", label: "Agreement" },
  { id: "structure", label: "Structure" },
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

  // With an MEP open, how many of this view's votes are actually theirs.
  //
  // The strip says how large the sample is; for a profile that is only half
  // the sentence. Someone who cast 51% of a term's votes is placed by half the
  // evidence of someone who cast 99% of them, and the participation filter
  // turns on exactly this number — it is why the MEPs in the tooltip above are
  // not on screen. Read from the graph rather than from `selectedNode`, which
  // can be a node object carried over from a previous view.
  const selectedNodeData = selectedNode
    ? graphData?.nodeMap?.get(selectedNode.id) || selectedNode
    : null;
  const votesCast =
    typeof selectedNodeData?.votesCast === "number"
      ? selectedNodeData.votesCast
      : null;
  const votesShare =
    votesCast !== null && votingSessions
      ? Math.round((votesCast / votingSessions) * 100)
      : null;
  // Sorted by group then name so the same delegation reads together, which is
  // how the omission is usually noticed: "where are the Socialists?"
  const excluded = [...(graphData?.excludedNodes ?? [])].sort(
    (a, b) =>
      String(a.groupId).localeCompare(String(b.groupId)) ||
      String(a.label).localeCompare(String(b.label))
  );

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

  // Backing out of a selection, one step at a time and in the order Escape
  // already uses: an MEP opened from a group returns to the group, anything
  // else returns to the network. Until now the only way back was clicking the
  // empty canvas, which is not a control and reads as nothing at all.
  const backTarget = selectedNode
    ? selectedGroup
      ? "group"
      : "network"
    : selectedGroup
    ? "network"
    : null;
  const backLabel =
    backTarget === "group" ? "Back to the group" : "Back to the whole network";

  const handleBack = () => {
    if (selectedNode && selectedGroup && onClearNodeKeepGroup) {
      onClearNodeKeepGroup();
      return;
    }
    if (selectedNode && onSelectNode) onSelectNode(null);
    if (selectedGroup && onSelectGroup) onSelectGroup(null);
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
  // tablist is expected to do; Home and End jump to the ends.
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
      <span className="sidebar-fact sidebar-fact-tip">
        <span className="sidebar-fact-anchor" tabIndex={0}>
          <strong>{thousands(nodeCount)}</strong> MEPs
        </span>
        <span className="sidebar-tip" role="tooltip">
          <span className="sidebar-tip-line">
            MEPs who voted enough here to be placed: more than half of this
            view&rsquo;s votes, or at least 30 of them covering a quarter of the
            policy area.
          </span>
          {baseline?.scores?.nodeCount ? (
            <span className="sidebar-tip-line">
              {nodeCount} of the {baseline.scores.nodeCount} in {baseline.label}.
            </span>
          ) : null}
          {excluded.length > 0 && (
            <>
              <span className="sidebar-tip-line sidebar-tip-heading">
                {excluded.length} not placed, and left out of every figure on
                this page:
              </span>
              <span className="sidebar-tip-list">
                {excluded.map((node) => (
                  <span className="sidebar-tip-row" key={node.id}>
                    <span
                      className="sidebar-tip-dot"
                      style={{ backgroundColor: getGroupColor(node.groupId) }}
                      aria-hidden="true"
                    />
                    <span className="sidebar-tip-flag">
                      <CountryFlag country={node.country} />
                    </span>
                    <span className="sidebar-tip-name">{node.label}</span>
                    <span className="sidebar-tip-group">
                      {getGroupAcronym(node.groupId, mandate)}
                    </span>
                  </span>
                ))}
              </span>
            </>
          )}
        </span>
      </span>
      {votingSessions !== null && (
        <>
          <span className="sidebar-fact-sep" aria-hidden="true" />
          {votesCast !== null ? (
            <span className="sidebar-fact sidebar-fact-tip sidebar-fact-tip-strip">
              <span className="sidebar-fact-anchor" tabIndex={0}>
                <strong>{thousands(votesCast)}</strong> vote
                {votesCast === 1 ? "" : "s"} in{" "}
                <strong>{thousands(votingSessions)}</strong> voting session
                {votingSessions === 1 ? "" : "s"}
              </span>
              <span className="sidebar-tip sidebar-tip-end" role="tooltip">
                <span className="sidebar-tip-line">
                  {selectedNodeData?.label} cast {thousands(votesCast)} of the{" "}
                  {thousands(votingSessions)} votes
                  {selectedSubject ? ` on ${selectedSubject}` : ""} in the{" "}
                  {formatMandateOrdinal(mandate)} term
                  {votesShare !== null ? `, ${votesShare}% of them` : ""}.
                </span>
                <span className="sidebar-tip-line">
                  Abstentions are not among them: they say nothing about who
                  agrees with whom, so they are left out of every figure on this
                  page. A country or policy area changes which votes are
                  counted, never who cast them.
                </span>
              </span>
            </span>
          ) : (
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
          )}
        </>
      )}
    </div>
  ) : null;


  const renderTabPanel = () => {
    if (activeTab === "cohesion") {
      const nothingReady =
        !intergroupCohesion && !intragroupCohesion && !countrySimilarity;
      if (nothingReady) {
        return (
          <div className="sidebar-empty-state">
            <div className="sidebar-empty-icon">📊</div>
            <p className="sidebar-empty-text">
              Calculating group and country agreement metrics. This may take a moment...
            </p>
          </div>
        );
      }
      // Anything extraordinary first, in one sentence, then the figures it was
      // drawn from: within a group, between groups, and the national dimension
      // that cuts across both.
      return (
        <>
          <CohesionInsights
            graphData={graphData}
            baseline={baseline}
            mandate={mandate}
            intergroupCohesion={intergroupCohesion}
            intragroupCohesion={intragroupCohesion}
            countrySimilarity={countrySimilarity}
          />
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

    return (
      <TrendsPanel
        mandate={mandate}
        onMandateChange={onMandateChange}
        selectedCountry={selectedCountry}
        selectedSubject={selectedSubject}
      />
    );
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div
          className={`sidebar-header-top ${searchOpen ? "search-open" : ""}`}
        >
          <div className="sidebar-header-title">
            {backTarget && (
              <button
                type="button"
                className="sidebar-back-button"
                onClick={handleBack}
                title={backLabel}
                aria-label={backLabel}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
            <h2>{selectedNode ? "MEP" : selectedGroup ? "Group" : "Network"}</h2>
          </div>
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
            {/* Backing out lives in the header, next to the title: it stays
                put while a profile scrolls, and it is in the same place for an
                MEP as for a group. */}
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
