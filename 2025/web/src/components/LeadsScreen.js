"use client";

import { useEffect, useRef, useState } from "react";
import {
  CountryFlag,
  getGroupAcronym,
  getGroupColor,
  getGroupDisplayName,
} from "../lib/utils.js";
import { loadLeads, countLeads } from "../lib/leads.js";
import DeltaBadge from "./DeltaBadge";
import "../styles/leads.scss";

/**
 * Leads — the views worth opening, for a whole term.
 *
 * A term holds 2,986 country x policy-area networks and the site ranks none of
 * them, so the only way to find the one worth printing has been to open a
 * combination and happen to notice. This is the shortlist: four rankings of
 * the largest departures from baseline, each row a link straight into the view
 * it describes.
 *
 * ## Why this is a screen and not a sidebar tab
 *
 * It used to be the Findings tab, sitting beside panels that describe the
 * network on screen — and it was the one tab that ignored which network that
 * was. Every row is a view; a list of places you could be standing, shown next
 * to the place you are standing, with no relation drawn between them. Changing
 * country or policy area moved everything in the sidebar except the panel whose
 * rows looked most like views, which read as a broken control rather than as a
 * deliberate change of scope.
 *
 * So it left. The sidebar now answers one question at three depths — how this
 * network holds together, what it looks like structurally, what it has done
 * over time — and this screen answers the other one: where to look next. It
 * opens from the header, over the whole page, because that is the scope it
 * actually has.
 *
 * The move also retired a tab strip nested inside a tab strip. A 30% column
 * could only show one ranking at a time; a full sheet shows all four, which is
 * what scanning for a lead wants.
 *
 * Every figure is the same comparison the sidebar draws — the view against
 * itself with one filter removed — so a delta here means what a delta means
 * anywhere else on the site.
 *
 * Voting-session counts sit on every row on purpose. The largest deltas in the
 * dataset come from the thinnest policy areas (12 voting sessions for Transport
 * and Tourism in term 10), and a leaderboard without the sample size would sort
 * those to the top and say nothing about it.
 *
 * Rankings are precomputed: see scripts/build-findings.js.
 */

const SECTIONS = [
  {
    id: "delegations",
    label: "Delegations",
    note: "National delegations that vote least like themselves on one policy area.",
  },
  {
    id: "groups",
    label: "Groups",
    note: "Political groups whose agreement drops furthest on one policy area.",
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

// How many rows a section shows before it asks to be opened up. Twelve is
// about a column of the sheet; the rest are one click away rather than four
// long lists competing for the same scroll.
const INITIAL_ROWS = 12;

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

function ordinal(value) {
  const tens = value % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? "th"
      : value % 10 === 1
      ? "st"
      : value % 10 === 2
      ? "nd"
      : value % 10 === 3
      ? "rd"
      : "th";
  return `${value}${suffix}`;
}

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
      className="leads-dot"
      style={{ backgroundColor: getGroupColor(groupId) }}
      aria-hidden="true"
    />
  );
}

/** A group's swatch and acronym, kept together on one line. */
function GroupChip({ groupId, mandate }) {
  return (
    <span className="leads-chip">
      <GroupDot groupId={groupId} />
      {getGroupAcronym(groupId, mandate)}
    </span>
  );
}

export default function LeadsScreen({
  open,
  onClose,
  mandate,
  selectedCountry,
  selectedSubject,
  graphData,
  onSelectNode,
  onSelectGroup,
  onCountryClick,
  onSelectSubject,
}) {
  const [leads, setLeads] = useState(null);
  const [expanded, setExpanded] = useState({});
  const sheetRef = useRef(null);

  useEffect(() => {
    // Resolves to null when the file has not been generated; the screen then
    // says so, because an empty sheet reads as broken.
    loadLeads().then(setLeads);
  }, []);

  // A term change while the screen is open is a change of subject matter, not
  // a change of how far down each list you had scrolled.
  useEffect(() => {
    setExpanded({});
  }, [mandate]);

  // The sheet takes focus when it opens, so the keyboard is inside the dialog
  // rather than still on the page behind it. Escape is handled by the page,
  // which owns the open state and the selection Escape would otherwise clear.
  useEffect(() => {
    if (open && sheetRef.current) sheetRef.current.focus();
  }, [open]);

  if (!open) return null;

  const term = leads && leads[mandate];
  const total = countLeads(leads, mandate);

  /**
   * Every row closes the screen, because every row is a request to look at
   * something else. Leaving it open would put a sheet over the network the
   * click just asked for.
   */
  const openView = (apply) => {
    apply();
    onClose();
  };

  /** A country x policy-area view: both filters are set together. */
  const openDelegation = (row) =>
    openView(() => {
      if (onCountryClick) onCountryClick(row.country);
      // After the country, which clears the group selection on the page.
      if (onSelectSubject) onSelectSubject(row.subject);
    });

  /** A whole-Parliament policy-area view, with one group highlighted. */
  const openSubjectGroup = (row, groupId) =>
    openView(() => {
      if (onCountryClick && selectedCountry) onCountryClick(null);
      if (onSelectSubject) onSelectSubject(row.subject);
      if (onSelectGroup && groupId) onSelectGroup(groupId);
    });

  /**
   * Maverick figures describe the unfiltered term, so the MEP may not be in
   * the network currently loaded. Select them when they are; otherwise drop
   * the filters hiding them and let the next click land.
   */
  const openMaverick = (row) =>
    openView(() => {
      const node =
        graphData && graphData.nodeMap && graphData.nodeMap.get(row.mepId);
      if (node) {
        if (onSelectNode) onSelectNode(node);
        return;
      }
      if (onSelectSubject && selectedSubject) onSelectSubject(null);
      if (onCountryClick && selectedCountry) onCountryClick(null);
    });

  /**
   * One ranked row: rank, what moved, the figure.
   *
   * The rank and the figure are the row's fixed columns and everything else is
   * one text column between them, so the percentages line up down the right
   * edge and can be read without reading the rows. Written the other way round
   * — the figure stacked under the name inside a half-width column — the
   * numbers landed wherever each name happened to end.
   *
   * Three lines, because a row carries one thing beyond its figure: which view
   * it points at. Folding the policy area in with the sample would truncate one
   * of them, and the sample is the whole reason a twelve-session policy area at
   * the top of a table is legible as noise rather than as a lead.
   */
  const renderRow = (kind, row, index) => {
    const rank = <span className="leads-rank">{index + 1}</span>;

    if (kind === "delegations") {
      return (
        <button
          type="button"
          key={`${row.country}|${row.subject}`}
          className="leads-row"
          onClick={() => openDelegation(row)}
          title={`Open ${row.country} on ${row.subject}`}
        >
          {rank}
          <span className="leads-row-line">
            <span className="leads-row-what">
              <CountryFlag country={row.country} className="leads-flag" />
              <span className="leads-row-name">{row.country}</span>
            </span>
            <span className="leads-row-where">{row.subject}</span>
            <span className="leads-row-sample">{sampleText(row)}</span>
          </span>
          <span className="leads-row-figure">
            <span>{percent(row.score)}</span>
            <DeltaBadge
              score={row.score}
              baseline={row.baseline}
              label={`${row.country} across all policy areas`}
            />
          </span>
        </button>
      );
    }

    if (kind === "groups") {
      const name = getGroupAcronym(row.group, mandate);
      return (
        <button
          type="button"
          key={`${row.group}|${row.subject}`}
          className="leads-row"
          onClick={() => openSubjectGroup(row, row.group)}
          title={`Open ${getGroupDisplayName(row.group, mandate)} on ${row.subject}`}
        >
          {rank}
          <span className="leads-row-line">
            <span className="leads-row-what">
              <GroupDot groupId={row.group} />
              <span className="leads-row-name">{name}</span>
            </span>
            <span className="leads-row-where">{row.subject}</span>
            <span className="leads-row-sample">{sampleText(row)}</span>
          </span>
          <span className="leads-row-figure">
            <span>{percent(row.score)}</span>
            <DeltaBadge
              score={row.score}
              baseline={row.baseline}
              label={`${name} across all policy areas`}
            />
          </span>
        </button>
      );
    }

    if (kind === "pairs") {
      const nameA = getGroupAcronym(row.groupA, mandate);
      const nameB = getGroupAcronym(row.groupB, mandate);
      return (
        <button
          type="button"
          key={`${row.groupA}|${row.groupB}|${row.subject}`}
          className="leads-row"
          onClick={() => openSubjectGroup(row, row.groupA)}
          title={`Open ${row.subject}, ${nameA} against ${nameB}`}
        >
          {rank}
          <span className="leads-row-line">
            <span className="leads-row-what">
              <GroupChip groupId={row.groupA} mandate={mandate} />
              <span className="leads-vs">vs</span>
              <GroupChip groupId={row.groupB} mandate={mandate} />
            </span>
            <span className="leads-row-where">{row.subject}</span>
            <span className="leads-row-sample">{sampleText(row)}</span>
          </span>
          <span className="leads-row-figure">
            <span>{percent(row.score)}</span>
            <DeltaBadge
              score={row.score}
              baseline={row.baseline}
              label={`${nameA} and ${nameB} across all policy areas`}
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
        className="leads-row"
        onClick={() => openMaverick(row)}
        title={`${row.mepName} agrees more with ${getGroupDisplayName(
          row.closestGroup,
          mandate
        )} than with ${getGroupDisplayName(row.group, mandate)}`}
      >
        {rank}
        <span className="leads-row-line">
          <span className="leads-row-what">
            <CountryFlag country={row.country} className="leads-flag" />
            <span className="leads-row-name">{row.mepName}</span>
          </span>
          <span className="leads-row-where">
            <GroupChip groupId={row.group} mandate={mandate} />
            <span className="leads-arrow" aria-hidden="true">
              →
            </span>
            <GroupChip groupId={row.closestGroup} mandate={mandate} />
            {row.nonAttached && (
              <span
                className="leads-tag"
                title="Non-attached members have no group to be loyal to, so their own-group figure is agreement with the other unaffiliated MEPs"
              >
                no group
              </span>
            )}
          </span>
          <span className="leads-row-sample">
            {sampleText(row, "colleagues")}
          </span>
        </span>
        <span className="leads-row-figure">
          <span>{percent(row.score)}</span>
          <DeltaBadge
            score={row.score}
            baseline={row.baseline}
            label={`their agreement with their own group, ${own}`}
          />
        </span>
      </button>
    );
  };

  const renderSection = (section) => {
    const rows = (term && term[section.id]) || [];
    const showAll = Boolean(expanded[section.id]);
    const visible = showAll ? rows : rows.slice(0, INITIAL_ROWS);

    return (
      <section className="leads-section" key={section.id}>
        <h3 className="leads-section-title">{section.label}</h3>
        <p className="leads-section-note">{section.note}</p>
        {rows.length === 0 ? (
          <p className="leads-empty">Nothing ranked for this term.</p>
        ) : (
          <>
            <div className="leads-list">
              {visible.map((row, index) => renderRow(section.id, row, index))}
            </div>
            {rows.length > INITIAL_ROWS && (
              <button
                type="button"
                className="leads-more"
                onClick={() =>
                  setExpanded((current) => ({
                    ...current,
                    [section.id]: !showAll,
                  }))
                }
              >
                {showAll ? `Show top ${INITIAL_ROWS}` : `Show all ${rows.length}`}
              </button>
            )}
          </>
        )}
      </section>
    );
  };

  return (
    <div
      className="leads-backdrop"
      // A click on the page behind the sheet is a request to get back to it.
      onClick={onClose}
    >
      <div
        className="leads-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leads-heading"
        tabIndex={-1}
        ref={sheetRef}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="leads-head">
          <div className="leads-head-text">
            <h2 className="leads-heading" id="leads-heading">
              Leads
            </h2>
            <p className="leads-lede">
              The views where a figure moves furthest from its usual level,
              across the {ordinal(mandate)} term. Every row opens the network it
              describes.
            </p>
          </div>
          <div className="leads-head-side">
            {total > 0 && (
              <span className="leads-count">{total} in this term</span>
            )}
            <button
              type="button"
              className="leads-close"
              onClick={onClose}
              aria-label="Close leads"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        {!term ? (
          <p className="leads-missing">
            The rankings for this term have not been generated. Run{" "}
            <code>npm run findings</code> to build them.
          </p>
        ) : (
          <div className="leads-sections">{SECTIONS.map(renderSection)}</div>
        )}
      </div>
    </div>
  );
}
