"use client";

import { useEffect, useRef, useState } from "react";
import {
  CountryFlag,
  getGroupAcronym,
  getGroupColor,
  getGroupDisplayName,
} from "../lib/utils.js";
import DeltaBadge from "./DeltaBadge";
import "../styles/findings.scss";

/**
 * Findings — the views where a number actually moved.
 *
 * A term holds 2,986 country x policy-area networks and the site ranks none of
 * them, so the only way to find the one worth printing has been to open a
 * combination and happen to notice. This panel is the shortlist: four rankings
 * of the largest departures from baseline, each row a link straight into the
 * view it describes.
 *
 * Every figure is the same comparison the rest of the sidebar draws — the view
 * against itself with one filter removed — so a delta here means what a delta
 * means anywhere else on the page.
 *
 * Voting-session counts sit on every row on purpose. The largest deltas in the
 * dataset come from the thinnest policy areas (12 voting sessions for Transport
 * and Tourism in term 10), and a leaderboard without the sample size would sort
 * those to the top and say nothing about it.
 *
 * Rankings are precomputed: see scripts/build-findings.js.
 */

// findings.json, fetched at most once per page load and shared between every
// tab, held as the in-flight promise rather than the parsed result — same
// arrangement dataLoader.js uses for baselines.json.
let findingsPromise = null;

function loadFindings() {
  if (findingsPromise === null) {
    findingsPromise = fetch("/data/findings.json")
      .then((response) => (response.ok ? response.json() : null))
      .catch((error) => {
        console.warn("Findings not available:", error);
        return null;
      });
  }
  return findingsPromise;
}

const TABS = [
  {
    id: "delegations",
    label: "Delegations",
    note: "National delegations that vote least like themselves on one policy area.",
  },
  {
    id: "groups",
    label: "Groups",
    note: "Political groups whose cohesion drops furthest on one policy area.",
  },
  {
    id: "pairs",
    label: "Pairs",
    note: "Two groups converging on, or splitting over, one policy area.",
  },
  {
    id: "mavericks",
    label: "Mavericks",
    note: "MEPs who vote closer to a group that is not their own.",
  },
];

// How many rows before the list asks to be opened up. Fifteen is about a
// screen of sidebar; the rest are one click away rather than a scroll trap.
const INITIAL_ROWS = 15;

const percent = (value) =>
  typeof value === "number" && isFinite(value)
    ? `${(value * 100).toFixed(1)}%`
    : "—";

// Deterministic thousands separator: toLocaleString would differ between the
// server render and the browser and trip hydration.
const thousands = (value) =>
  typeof value === "number" && isFinite(value)
    ? String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : null;

function sampleText(row, unit = "MEPs") {
  const parts = [];
  const sessions = thousands(row.votingSessions);
  if (sessions) parts.push(`${sessions} sessions`);
  if (typeof row.mepCount === "number") parts.push(`${row.mepCount} ${unit}`);
  return parts.join(" · ");
}

function GroupDot({ groupId }) {
  return (
    <span
      className="findings-dot"
      style={{ backgroundColor: getGroupColor(groupId) }}
      aria-hidden="true"
    />
  );
}

/** A group's swatch and acronym, kept together on one line. */
function GroupChip({ groupId, mandate }) {
  return (
    <span className="findings-chip">
      <GroupDot groupId={groupId} />
      {getGroupAcronym(groupId, mandate)}
    </span>
  );
}

export default function FindingsPanel({
  mandate,
  selectedCountry,
  selectedSubject,
  graphData,
  onSelectNode,
  onSelectGroup,
  onCountryClick,
  onSelectSubject,
}) {
  const [findings, setFindings] = useState(null);
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [showAll, setShowAll] = useState(false);
  const tabsRef = useRef(null);

  useEffect(() => {
    // Resolves to null when the file has not been generated; the panel then
    // says so, because it owns a whole tab and an empty one reads as broken.
    loadFindings().then(setFindings);
  }, []);

  const data = findings && findings[mandate];
  const rows = (data && data[activeTab]) || [];
  const tab = TABS.find((item) => item.id === activeTab) || TABS[0];
  const visible = showAll ? rows : rows.slice(0, INITIAL_ROWS);

  const selectTab = (id) => {
    setActiveTab(id);
    setShowAll(false);
  };

  // Arrow keys move between tabs and take focus with them, which is what a
  // tablist is expected to do; Home and End jump to the ends.
  const handleTabKeyDown = (event) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
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

    selectTab(TABS[next].id);
    const buttons = tabsRef.current
      ? tabsRef.current.querySelectorAll('[role="tab"]')
      : null;
    if (buttons && buttons[next]) buttons[next].focus();
  };

  /** A country x policy-area view: both filters are set together. */
  const openDelegation = (row) => {
    if (onCountryClick) onCountryClick(row.country);
    // After the country, which clears the group selection on the page.
    if (onSelectSubject) onSelectSubject(row.subject);
  };

  /** A whole-Parliament policy-area view, with one group highlighted. */
  const openSubjectGroup = (row, groupId) => {
    if (onCountryClick && selectedCountry) onCountryClick(null);
    if (onSelectSubject) onSelectSubject(row.subject);
    if (onSelectGroup && groupId) onSelectGroup(groupId);
  };

  /**
   * Maverick figures describe the unfiltered term, so the MEP may not be in
   * the network currently on screen. Select them when they are; otherwise drop
   * the filters hiding them and let the next click land.
   */
  const openMaverick = (row) => {
    const node = graphData && graphData.nodeMap && graphData.nodeMap.get(row.mepId);
    if (node) {
      if (onSelectNode) onSelectNode(node);
      return;
    }
    if (onSelectSubject && selectedSubject) onSelectSubject(null);
    if (onCountryClick && selectedCountry) onCountryClick(null);
  };

  /**
   * One ranked row: rank, what moved, the figure.
   *
   * The rank and the figure are the row's fixed columns and everything else is
   * one text column between them, so the percentages line up down the right
   * edge and can be read without reading the rows. Written the other way round
   * — the figure stacked under the name inside a half-width column — the
   * numbers landed wherever each name happened to end. Same shape as the
   * Unusual panel's rows, which these sit one tab away from.
   *
   * Three lines rather than the Unusual panel's two, because a Findings row
   * carries one thing an Unusual row does not: which view it points at. Folding
   * the policy area in with the sample would truncate one of them, and the
   * sample is the whole reason a twelve-session policy area at the top of the
   * table is legible as noise rather than as a finding.
   */
  const renderRow = (row, index) => {
    const rank = <span className="findings-rank">{index + 1}</span>;

    if (activeTab === "delegations") {
      return (
        <button
          type="button"
          key={`${row.country}|${row.subject}`}
          className="findings-row"
          onClick={() => openDelegation(row)}
          title={`Open ${row.country} on ${row.subject}`}
        >
          {rank}
          <span className="findings-row-line">
            <span className="findings-row-what">
              <CountryFlag country={row.country} className="findings-flag" />
              <span className="findings-row-name">{row.country}</span>
            </span>
            <span className="findings-row-where">{row.subject}</span>
            <span className="findings-row-sample">{sampleText(row)}</span>
          </span>
          <span className="findings-row-figure">
            <span>{percent(row.score)}</span>
            <DeltaBadge
              score={row.score}
              baseline={row.baseline}
              label={`${row.country}, all policy areas`}
              what={`${row.country}'s internal agreement`}
            />
          </span>
        </button>
      );
    }

    if (activeTab === "groups") {
      const name = getGroupAcronym(row.group, mandate);
      return (
        <button
          type="button"
          key={`${row.group}|${row.subject}`}
          className="findings-row"
          onClick={() => openSubjectGroup(row, row.group)}
          title={`Open ${getGroupDisplayName(row.group, mandate)} on ${row.subject}`}
        >
          {rank}
          <span className="findings-row-line">
            <span className="findings-row-what">
              <GroupDot groupId={row.group} />
              <span className="findings-row-name">{name}</span>
            </span>
            <span className="findings-row-where">{row.subject}</span>
            <span className="findings-row-sample">{sampleText(row)}</span>
          </span>
          <span className="findings-row-figure">
            <span>{percent(row.score)}</span>
            <DeltaBadge
              score={row.score}
              baseline={row.baseline}
              label={`${name}, all policy areas`}
              what={`${name} cohesion`}
            />
          </span>
        </button>
      );
    }

    if (activeTab === "pairs") {
      const nameA = getGroupAcronym(row.groupA, mandate);
      const nameB = getGroupAcronym(row.groupB, mandate);
      return (
        <button
          type="button"
          key={`${row.groupA}|${row.groupB}|${row.subject}`}
          className="findings-row"
          onClick={() => openSubjectGroup(row, row.groupA)}
          title={`Open ${row.subject}, ${nameA} against ${nameB}`}
        >
          {rank}
          <span className="findings-row-line">
            <span className="findings-row-what">
              <GroupChip groupId={row.groupA} mandate={mandate} />
              <span className="findings-vs">vs</span>
              <GroupChip groupId={row.groupB} mandate={mandate} />
            </span>
            <span className="findings-row-where">{row.subject}</span>
            <span className="findings-row-sample">{sampleText(row)}</span>
          </span>
          <span className="findings-row-figure">
            <span>{percent(row.score)}</span>
            <DeltaBadge
              score={row.score}
              baseline={row.baseline}
              label={`${nameA} and ${nameB}, all policy areas`}
              what={`Agreement between ${nameA} and ${nameB}`}
            />
          </span>
        </button>
      );
    }

    const own = getGroupAcronym(row.group, mandate);
    const closest = getGroupAcronym(row.closestGroup, mandate);
    return (
      <button
        type="button"
        key={row.mepId}
        className="findings-row"
        onClick={() => openMaverick(row)}
        title={`${row.mepName} agrees more with ${getGroupDisplayName(
          row.closestGroup,
          mandate
        )} than with ${getGroupDisplayName(row.group, mandate)}`}
      >
        {rank}
        <span className="findings-row-line">
          <span className="findings-row-what">
            <CountryFlag country={row.country} className="findings-flag" />
            <span className="findings-row-name">{row.mepName}</span>
          </span>
          <span className="findings-row-where">
            <GroupChip groupId={row.group} mandate={mandate} />
            <span className="findings-arrow" aria-hidden="true">
              →
            </span>
            <GroupChip groupId={row.closestGroup} mandate={mandate} />
            {row.nonAttached && (
              <span
                className="findings-tag"
                title="Non-attached members have no group to be loyal to, so their own-group figure is agreement with the other unaffiliated MEPs"
              >
                no group
              </span>
            )}
          </span>
          <span className="findings-row-sample">
            {sampleText(row, "colleagues")}
          </span>
        </span>
        <span className="findings-row-figure">
          <span>{percent(row.score)}</span>
          <DeltaBadge
            score={row.score}
            baseline={row.baseline}
            label={`their own group, ${own}`}
            what={`Agreement with ${closest}`}
          />
        </span>
      </button>
    );
  };

  // The panel owns a whole tab, so there is no collapse control: opening the
  // tab is the act that asks for the content, and a chevron that hides all of
  // it would leave the tab looking broken.
  return (
    <div className="findings-panel">
      <h3 className="findings-title">Findings</h3>
      <div className="findings-description">
        The views where a figure moves furthest from its usual level, across the
        whole term.
      </div>
      {!data ? (
        <div className="sidebar-tab-note">
          The rankings for this term have not been generated. Run{" "}
          <code>npm run findings</code> to build them.
        </div>
      ) : (
        <>
        <div
          className="findings-tabs"
          role="tablist"
          aria-label="Findings rankings"
          ref={tabsRef}
          onKeyDown={handleTabKeyDown}
        >
          {TABS.map((item) => (
            <button
              type="button"
              key={item.id}
              id={`findings-tab-${item.id}`}
              role="tab"
              aria-selected={item.id === activeTab}
              aria-controls={`findings-panel-${item.id}`}
              tabIndex={item.id === activeTab ? 0 : -1}
              className={`findings-tab ${
                item.id === activeTab ? "active" : ""
              }`}
              onClick={() => selectTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div
          className="findings-tabpanel"
          id={`findings-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`findings-tab-${activeTab}`}
          tabIndex={-1}
        >
          <div className="findings-note">{tab.note}</div>
          {rows.length === 0 ? (
            <div className="findings-empty">
              Nothing ranked for this term yet.
            </div>
          ) : (
            <>
              <div className="findings-list">{visible.map(renderRow)}</div>
              {rows.length > INITIAL_ROWS && (
                <button
                  type="button"
                  className="findings-more"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll
                    ? `Show top ${INITIAL_ROWS}`
                    : `Show all ${rows.length}`}
                </button>
              )}
            </>
          )}
        </div>
        </>
      )}
    </div>
  );
}
