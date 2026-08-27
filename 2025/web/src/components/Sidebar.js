"use client";

import { useMemo, useState } from "react";
import SearchBar from "./SearchBar";
import MEPInfoPanel from "./MEPInfoPanel";
import AgreementByGroup from "./AgreementByGroup";
import CoalitionPanel from "./CoalitionPanel";
import ClosestMEPs from "./ClosestMEPs";
import CohesionHeatmap from "./CohesionHeatmap";
import IntragroupCohesion from "./IntragroupCohesion";
import CountrySimilarity from "./CountrySimilarity";
import GroupInfoPanel from "./GroupInfoPanel";
import LoadingSpinner from "./LoadingSpinner";
import CohesionInsights from "./CohesionInsights";
import PartnerTrends from "./PartnerTrends";
import TrendsPanel from "./TrendsPanel";
import { getGroupColor, getGroupAcronym, CountryFlag } from "../lib/utils";
import {
  useNormalisedAgreement,
  readAgreement,
} from "../lib/normalisedAgreement.js";
import {
  downloadSVG,
  exportCoalitionsSheetSVG,
  exportGroupMatrixSheetSVG,
  exportPartnersSheetSVG,
  exportStatsSheetSVG,
  exportTrendsSheetSVG,
} from "../lib/networkExport";
import { loadCoalitions } from "../lib/coalitions.js";
import { loadTrendSeries } from "../lib/trends.js";

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
 * The order is an argument, and the scope is the argument. Both tabs describe
 * the network on screen: Agreement says how tightly its blocs hold, and
 * History keeps the network and lets go of the term instead, following the
 * open view back to 2004 with the whole Parliament drawn faintly behind it for
 * scale.
 *
 * A Structure tab used to sit between them, holding what the votes look like
 * to an algorithm that has never heard of a political group. Two of its three
 * sections were the Leads screen's Mavericks ranking under other names, and
 * the third — the communities themselves — was a stack of bars describing
 * something the reader was already looking at. A community is a *place* on
 * this canvas, so it is now drawn there: the display panel over the network
 * outlines them. See lib/communityShapes.js.
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
  { id: "coalitions", label: "Coalitions" },
  { id: "cohesion", label: "Agreement" },
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
  furthestMEPs,
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
  // The policy area this profile is read at. Held here rather than inside the
  // panel that carries the control, because the headline dials on the identity
  // block and the grids below it have to be reading the same votes - a header
  // saying 98% over a section headed "Fisheries" is two answers to one
  // question. Follows the toolbar whenever the toolbar has one set.
  const [panelSubject, setPanelSubject] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  // Which political family the two family-pivoted panels are showing. Held
  // here rather than inside them because the export button has to draw what is
  // on screen, and only one tab is mounted at a time — a sheet for the EPP
  // printed while the panel showed the far right would be the one thing these
  // sheets must never be. Kept as two: the coalition ranking has a real "no
  // family" state that means the whole chamber, and the partner lines have no
  // reading without one.
  const [coalitionPivot, setCoalitionPivot] = useState("EPP");
  const [partnerPivot, setPartnerPivot] = useState("EPP");
  // {status, missing}. The button reports its own outcome: these sheets are
  // printed, and a click that silently hands over two of the three charts is
  // worse than one that says which it could not draw.
  const [exportState, setExportState] = useState({ status: "idle", missing: [] });

  const subjectForPanel = selectedSubject ?? panelSubject;
  const agreementFile = useNormalisedAgreement(mandate);
  const reading = useMemo(
    () => readAgreement(agreementFile, selectedNode?.id, subjectForPanel),
    [agreementFile, selectedNode, subjectForPanel]
  );
  // One pass over the nodes instead of a find() per group inside a render.
  const groupColors = useMemo(() => {
    const colors = new Map();
    for (const node of graphData?.nodes || []) {
      if (node.groupId && !colors.has(node.groupId)) {
        colors.set(node.groupId, node.color);
      }
    }
    return colors;
  }, [graphData]);

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
      {/* How many MEPs the view holds is context for a view. With one MEP open
          the sidebar is a profile about that person, and a headline count of
          everybody else reads as a figure about them - which is why it is left
          out here rather than restyled. The tooltip it carried, naming who the
          participation filter left out, belongs to the same scope and goes with
          it; the network view still shows both. */}
      {!selectedNode && (
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
      )}
      {votingSessions !== null && (
        <>
          {!selectedNode && (
            <span className="sidebar-fact-sep" aria-hidden="true" />
          )}
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
                  page.
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


  // All three tabs' charts, as five print sheets.
  //
  // No panel is serialisable: Agreement and Coalitions are HTML bars and CSS
  // grids, and History is an SVG sized to whatever the sidebar happens to be
  // that day, in colours that come from custom properties. So the sheets are
  // drawn from the same numbers the panels are drawn from, by
  // lib/networkExport.js, on the same paper as the network export — a network,
  // its figures and its history print as one set.
  //
  // Everything is fetched rather than read off the screen: only the active tab
  // is mounted, and the button has to work from any of them. loadTrendSeries
  // and loadCoalitions both cache, so a tab already opened costs nothing, and
  // the two sheets that read the five-term series share one fetch.
  //
  // The two family-pivoted sheets take their family from the sidebar's own
  // state, not from a default, so what prints is what is on screen even though
  // the panel that drew it may be unmounted.
  const handleExportCharts = async () => {
    if (exportState.status === "working") return;
    setExportState({ status: "working", missing: [] });

    const exportMeta = {
      mandate,
      country: selectedCountry || null,
      subject: selectedSubject || null,
      nodeCount,
      votingSessions,
    };
    const slug = (value) =>
      String(value)
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase();
    const parts = [`mandate-${mandate || "all"}`];
    if (selectedCountry) parts.push(`country-${slug(selectedCountry)}`);
    if (selectedSubject) parts.push(`subject-${slug(selectedSubject)}`);
    const stem = `charts-${parts.join("-")}`;

    const sheets = [];
    const missing = [];
    try {
      sheets.push([
        `${stem}-agreement.svg`,
        exportStatsSheetSVG({
          graphData,
          meta: exportMeta,
          stats: {
            intragroupCohesion: intragroupCohesion || [],
            countrySimilarity: countrySimilarity || [],
            baseline,
          },
        }),
      ]);
    } catch (error) {
      missing.push("the agreement dials");
      console.warn("Sidebar export: the figures sheet could not be drawn:", error);
    }

    try {
      sheets.push([
        `${stem}-between-groups.svg`,
        exportGroupMatrixSheetSVG({
          graphData,
          meta: exportMeta,
          intergroupCohesion,
          baseline,
        }),
      ]);
    } catch (error) {
      missing.push("the between-groups grid");
      console.warn("Sidebar export: the between-groups sheet could not be drawn:", error);
    }

    try {
      const data = await loadCoalitions();
      if (!data) throw new Error("no coalition data");
      sheets.push([
        `${stem}-coalitions.svg`,
        exportCoalitionsSheetSVG({
          meta: exportMeta,
          data,
          mandate,
          // The roll-call classification has no country dimension, so a country
          // filter is dropped here rather than silently applied. The panel says
          // the same thing on screen.
          subject: selectedSubject || null,
          pivot: coalitionPivot,
        }),
      ]);
    } catch (error) {
      missing.push("the winning coalitions");
      console.warn("Sidebar export: the coalitions sheet could not be drawn:", error);
    }

    // Both remaining sheets read the same five terms, so the fetch is shared.
    let series = null;
    let reference = null;
    try {
      const scoped = Boolean(selectedCountry || selectedSubject);
      [series, reference] = await Promise.all([
        loadTrendSeries({ country: selectedCountry, subject: selectedSubject }),
        scoped ? loadTrendSeries().catch(() => null) : Promise.resolve(null),
      ]);
    } catch (error) {
      console.warn("Sidebar export: the five-term series could not be read:", error);
    }

    try {
      if (!series) throw new Error("no series");
      sheets.push([
        `${stem}-history.svg`,
        exportTrendsSheetSVG({ meta: exportMeta, series, reference }),
      ]);
    } catch (error) {
      missing.push("the history");
      console.warn("Sidebar export: the History sheet could not be drawn:", error);
    }

    try {
      if (!series) throw new Error("no series");
      sheets.push([
        `${stem}-partners.svg`,
        exportPartnersSheetSVG({ meta: exportMeta, series, pivot: partnerPivot }),
      ]);
    } catch (error) {
      missing.push("the partner lines");
      console.warn("Sidebar export: the partners sheet could not be drawn:", error);
    }

    if (sheets.length === 0) {
      setExportState({ status: "failed", missing });
      return;
    }

    // Staggered: Chrome and Safari drop the second of two downloads fired in
    // the same tick.
    sheets.forEach(([name, svg], index) => {
      setTimeout(() => downloadSVG(svg, name), index * 350);
    });
    setExportState({
      status: missing.length === 0 ? "idle" : "partial",
      missing,
    });
  };

  const renderTabPanel = () => {
    // Who wins together, and how close each pair of groups sits. Both answer
    // "which blocs are there", where the Agreement tab answers "how tightly
    // does each one hold" — the coalition and the matrix were previously three
    // panels apart on one tab with the cohesion figures between them.
    //
    // First of the three because it is the question people arrive with. The
    // ranking is also the only panel in the sidebar that names a bloc rather
    // than measuring one, so it is the shortest path from the network on
    // screen to a sentence about it.
    if (activeTab === "coalitions") {
      return (
        <>
          <CoalitionPanel
            mandate={mandate}
            selectedCountry={selectedCountry}
            selectedSubject={selectedSubject}
            pivot={coalitionPivot}
            onPivotChange={setCoalitionPivot}
          />
          {intergroupCohesion ? (
            <CohesionHeatmap
              intergroupCohesion={intergroupCohesion}
              mandate={mandate}
              baseline={baseline}
              onGroupClick={handleGroupClick}
            />
          ) : (
            <p className="sb-status">Calculating agreement between groups…</p>
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

    // Neither panel here wears a collapse chevron: opening the tab is the act
    // that asks for the content, and a control that hides everything under it
    // would leave the tab looking broken.
    //
    // The two are the same five terms read at two altitudes. The first plots
    // the Parliament's averages, which is where its clearest story lives and
    // also where the more pointed questions go to die — the between-groups line
    // falls across the five terms, but drop the far right and the remaining
    // pairs are flat, so the decline is one bloc leaving rather than a chamber
    // polarising. The second plots the pairs themselves, which is the only
    // level at which that is visible.
    return (
      <>
        <TrendsPanel
          mandate={mandate}
          onMandateChange={onMandateChange}
          selectedCountry={selectedCountry}
          selectedSubject={selectedSubject}
        />
        <PartnerTrends
          mandate={mandate}
          selectedCountry={selectedCountry}
          selectedSubject={selectedSubject}
          pivot={partnerPivot}
          onPivotChange={setPartnerPivot}
        />
      </>
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
        <div className="sidebar-tabs">
          <div
            className="sidebar-tabs-list"
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

          {/* Sits on the tab strip rather than inside either panel: it takes
              both tabs, so hanging it under one of them would say it only
              takes that one. */}
          <span className="sidebar-fact-tip sidebar-tabs-export">
            <button
              type="button"
              className="sidebar-tabs-export-button"
              onClick={handleExportCharts}
              disabled={exportState.status === "working"}
              aria-label="Download these charts as SVG"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <span className="sidebar-tip sidebar-tip-right" role="tooltip">
              <span className="sidebar-tip-line">
                {exportState.status === "failed"
                  ? "Nothing could be drawn — this view's figures have not finished loading."
                  : exportState.status === "partial"
                  ? `Downloaded all but ${exportState.missing.join(" and ")}, which this view does not carry.`
                  : exportState.status === "working"
                  ? "Reading twenty years of votes for the history and partner sheets…"
                  : "Downloads all three tabs as vector sheets: the winning coalitions, the agreement dials, the between-groups grid, the history and the partner lines."}
              </span>
              <span className="sidebar-tip-line">
                Five SVG files, A4 and print-ready. Same dials, same grid, same
                lines as the panels — redrawn for paper, not screenshotted. The
                two family sheets draw whichever family the panels are showing.
              </span>
            </span>
          </span>
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
              reading={reading}
              subject={subjectForPanel}
            />
            <AgreementByGroup
              mandate={mandate}
              selectedNode={selectedNode}
              selectedCountry={selectedCountry}
              subject={subjectForPanel}
              onSubjectChange={setPanelSubject}
              subjectLocked={Boolean(selectedSubject)}
              file={agreementFile}
              groupColors={groupColors}
              rawAgreementScores={agreementScores}
              rawSubjectScores={
                subjectForPanel
                  ? graphData?.similarityScores?.[selectedNode.id]
                      ?.subjectAgreementScores?.[subjectForPanel]
                  : null
              }
            />
            <ClosestMEPs
              meps={closestMEPs}
              furthest={furthestMEPs}
              onSelectMEP={onSelectNode}
              selectedSubject={selectedSubject}
              mandate={mandate}
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
