"use client";

import { useMemo, useState } from "react";
import { CountryFlag, getGroupAcronym } from "../lib/utils.js";
import { groupSwatchStyle } from "../lib/groupColors.js";
import "../styles/subject-topics.scss";

/**
 * Who this view leaves out, and by how far.
 *
 * An MEP enters a network only by voting in more than half of its votes, or by
 * casting at least 30 that cover a quarter of the policy area. Everyone else is
 * removed — from the drawing and from every figure computed off it. That filter
 * is necessary and it is also the sharpest trap in this dataset: term 10's
 * Hungary x Women's Rights once reported 99.2% agreement because the filter had
 * deleted the opposition and left Fidesz plus one.
 *
 * The list already existed, inside the tooltip on the "N MEPs" figure at the top
 * of the sidebar. A hover is the wrong place for it: an omission you have to
 * discover is not much better than one that is hidden, and the tooltip could
 * not say how far short anyone fell. Here it is a block you cannot miss, and
 * each name carries the share of the policy area they actually voted in.
 */

const SHOWN = 6;

export default function NotPlaced({ graphData, mandate, selectedSubject }) {
  const [expanded, setExpanded] = useState(false);

  const excluded = useMemo(() => {
    const rows = [...(graphData?.excludedNodes ?? [])];
    const total =
      (selectedSubject
        ? graphData?.votingSessions?.bySubject?.[selectedSubject]
        : graphData?.votingSessions?.total) || null;
    return rows
      .map((node) => ({
        ...node,
        share:
          total && typeof node.votesCast === "number"
            ? node.votesCast / total
            : null,
      }))
      .sort((a, b) => {
        if (a.share != null && b.share != null) return a.share - b.share;
        return (a.label || "").localeCompare(b.label || "");
      });
  }, [graphData, selectedSubject]);

  const placed = graphData?.nodes?.length ?? null;
  if (!excluded.length) return null;

  const shown = expanded ? excluded : excluded.slice(0, SHOWN);

  return (
    <section className="sb-panel subject-topics">
      <div className="sb-panel-head">
        <h3 className="sb-panel-title">Who is missing</h3>
      </div>
      <p className="sb-note subject-topics-summary">
        <b>{excluded.length}</b> {excluded.length === 1 ? "MEP is" : "MEPs are"} not
        placed here{placed ? <> — {placed.toLocaleString()} are</> : null}. They voted
        too rarely in this policy area to measure, and are left out of every figure
        on this page.
      </p>
      <ul className="st-missing">
        {shown.map((node) => (
          <li key={node.id}>
            <span className="st-missing-dot" style={groupSwatchStyle(node.groupId)} aria-hidden="true" />
            <span className="st-missing-flag"><CountryFlag country={node.country} /></span>
            <span className="st-missing-name" title={node.label}>{node.label}</span>
            <span className="st-missing-group">{getGroupAcronym(node.groupId, mandate)}</span>
            <span className="st-missing-share">
              {node.share != null ? `${Math.round(node.share * 100)}%` : "—"}
            </span>
          </li>
        ))}
      </ul>
      {excluded.length > SHOWN ? (
        <button
          type="button"
          className="sb-collapse"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "show fewer" : `show all ${excluded.length}`}
        </button>
      ) : null}
    </section>
  );
}
