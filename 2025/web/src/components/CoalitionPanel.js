"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  allyShares,
  coalitionsFor,
  loadCoalitions,
  viewFor,
} from "../lib/coalitions.js";
import { FAMILIES, FAMILY_ORDER, opening } from "../lib/families.js";
import { TERMS } from "../lib/trends.js";
import SegmentedToggle from "./SegmentedToggle";
import "../styles/coalitions.scss";

/**
 * Who actually wins votes together.
 *
 * Every other figure in this tab is pairwise similarity: over a term, how often
 * two MEPs cast the same ballot. That measure cannot answer "who governs with
 * whom", because it is dominated by the roll-calls nobody contests — a group
 * can look like everyone's friend while losing consistently to a coalition it
 * is not in. This panel classifies whole roll-calls instead; see
 * pipeline/coalitions.py.
 *
 * Two questions, and with no family selected only the second.
 *
 * **Who does this family share a side with**, in two readings whose *difference*
 * is the finding. "When it wins" counts only the votes the family carried, and
 * asks who was carrying them too. "Every vote" counts all decided roll-calls,
 * win or lose. For the far right in term 10 those read 94% and 38% for the EPP:
 * it almost never wins except on votes the EPP is already winning. A family
 * with its own majority — the EPP, 92% and 88% with the liberals — scores alike
 * on both. One number cannot say that, which is why the toggle is not a
 * convenience.
 *
 * **What wins**, ranked. Every coalition taking at least 1% of the term's
 * decided votes, so the list is as long as the term was fragmented: twenty rows
 * in 2004-09, thirteen now.
 *
 * **This panel used to report which flank a group won with** — consensus, with
 * the left, with the right, alone. It was the clearest chart here and it is
 * gone, because it could not be drawn without this code asserting that the EPP
 * is the right, Renew the centre-left and the Greens the left. Those are
 * contested claims, they were invisible to the reader, and they were doing all
 * the work. Both replacements are counts of who stood where, which the
 * roll-calls settle by themselves. The one editorial claim left in the panel is
 * the family lineage, and it is printed under the charts.
 *
 * Two things this panel must not pretend to.
 *
 * **It has no country dimension.** A group's direction on a vote is the
 * majority of its members across the house; filtering to one country would ask
 * what Portugal's slice of the EPP did and answer it with a handful of members.
 * With a country selected the panel says so rather than quietly reporting the
 * whole Parliament — the exact failure the trends panel was rebuilt to avoid.
 *
 * **A policy area can be too thin to read.** Term 10's Transport and Tourism
 * decides twelve votes. The view is still drawn, with its count, and marked.
 */

/** The two readings of a family's allies. */
const MODES = [
  {
    id: "wonTogether",
    text: "When it wins",
    title: "Of the votes this family won, how often each other family won too",
  },
  {
    id: "sameSide",
    text: "Every vote",
    title: "Of all decided votes, how often each other family took the same side",
  },
];

const pct = (value) =>
  typeof value === "number" && isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
const whole = (value) =>
  typeof value === "number" && isFinite(value) ? `${Math.round(value * 100)}%` : "—";

// Deterministic thousands separator, as in the facts strip and the trends
// panel: toLocaleString would differ between the server render and the browser
// and trip hydration.
const thousands = (value) =>
  typeof value === "number" && isFinite(value)
    ? String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : "";

export default function CoalitionPanel({
  mandate,
  selectedCountry = null,
  selectedSubject = null,
  // null is a real state, not "nothing chosen yet": it means the whole chamber,
  // and it is what the ranking below shows when no family is picked. Owned by
  // the sidebar so the SVG export can draw the family actually on screen.
  pivot = "EPP",
  onPivotChange,
}) {
  const [mode, setMode] = useState("wonTogether");
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const titleId = useId();

  useEffect(() => {
    let cancelled = false;
    loadCoalitions().then((payload) => {
      if (cancelled) return;
      if (payload) setData(payload);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const family = pivot ? FAMILIES[pivot] : null;
  const view = useMemo(
    () => (data ? viewFor(data, mandate, selectedSubject) : null),
    [data, mandate, selectedSubject]
  );

  const allies = useMemo(
    () => (data && view && pivot ? allyShares(view, data, pivot, mode) : null),
    [data, view, pivot, mode]
  );

  const ranking = useMemo(
    () => (view ? coalitionsFor(view, pivot) : []),
    [view, pivot]
  );

  const term = TERMS.find((entry) => entry.mandate === mandate);

  if (failed) {
    return (
      <section className="coalitions-panel" aria-labelledby={titleId}>
        <h4 className="sb-panel-title" id={titleId}>
          Winning coalitions
        </h4>
        <p className="sb-note">
          This view&rsquo;s roll-call classification could not be read.
        </p>
      </section>
    );
  }

  return (
    <section className="coalitions-panel" aria-labelledby={titleId}>
      <h4 className="sb-panel-title" id={titleId}>
        {family ? `${opening(family.possessive)} winning coalitions` : "What wins here"}
      </h4>
      <p className="sb-panel-desc">
        Not how often members vote alike — which side carried each roll-call.
        Every group&rsquo;s position on a vote is the majority of its own members.
      </p>

      <div className="coalitions-chips" role="group" aria-label="Political family">
        {/* Deselecting is the point of this one: with no family picked the
            ranking below stops being "who does X win with" and becomes the
            whole term, which is a different and equally reasonable question. */}
        <button
          type="button"
          className="coalitions-chip coalitions-chip--all"
          aria-pressed={pivot === null}
          onClick={() => onPivotChange && onPivotChange(null)}
          title="Every winning coalition in this term, whoever is in it"
        >
          All
        </button>
        {FAMILY_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            className="coalitions-chip"
            aria-pressed={pivot === id}
            // Clicking the selected chip clears it, so the row works as a
            // filter rather than a radio group with no off switch.
            onClick={() => onPivotChange && onPivotChange(pivot === id ? null : id)}
            title={`Show the coalitions that include ${FAMILIES[id].sentence}`}
          >
            <span
              className="coalitions-chip-dot"
              style={{ background: FAMILIES[id].color }}
              aria-hidden="true"
            />
            {FAMILIES[id].short}
          </button>
        ))}
      </div>

      {selectedCountry && (
        <p className="sb-note coalitions-caveat">
          Coalitions are counted across the whole Parliament. A group&rsquo;s
          direction on a vote is its members everywhere, so there is no{" "}
          {selectedCountry} version of this figure — unlike the agreement
          numbers above, which do follow the filter.
        </p>
      )}

      {!data && <p className="sb-status coalitions-status">Reading the roll-calls…</p>}

      {data && pivot && allies && (
        <AllyBars
          allies={allies}
          mode={mode}
          onMode={setMode}
          family={family}
          term={term}
        />
      )}

      {data && pivot && !allies && (
        <p className="sb-note coalitions-status">
          {opening(family.sentence)} did not sit in this view.
        </p>
      )}

      {data && view && view.thin && (
        <p className="sb-note coalitions-caveat">
          {selectedSubject || "This view"} decides only{" "}
          <strong>{thousands(view.decided)}</strong> votes in{" "}
          {term ? term.short : "this term"}, so every share below is a handful of
          roll-calls rather than a pattern.
        </p>
      )}

      {data && view && ranking.length > 0 && (
        <Ranking
          rows={ranking}
          view={view}
          family={family}
          term={term}
          subject={selectedSubject}
        />
      )}

      {data && !view && (
        <p className="sb-note coalitions-status">
          No roll-calls were decided in this view.
        </p>
      )}
    </section>
  );
}

/**
 * One bar per other family: how often it stands where this one stands.
 *
 * Ranked rather than seated, because the ranking *is* the answer — the reader
 * is asking who the closest partners are, and putting them in seating order
 * would make that a thing to work out. Each bar takes its family's own colour,
 * which is what the rest of the sidebar does for a political group.
 */
function AllyBars({ allies, mode, onMode, family, term }) {
  const id = useId();

  return (
    <div className="coalitions-block">
      <div className="coalitions-block-head">
        <h5 className="sb-section-label">Who stands with it</h5>
        <SegmentedToggle value={mode} onChange={onMode} options={MODES} label="" />
      </div>

      <p className="sb-section-lede" id={`${id}-lede`}>
        {mode === "wonTogether" ? (
          <>
            Of the <strong>{thousands(allies.wins)}</strong> votes{" "}
            {family.sentence} won in {term ? term.short : "this term"} — {whole(allies.wins / allies.votes)} of
            those it sat — how often each other family was on the winning side too.
          </>
        ) : (
          <>
            Of all <strong>{thousands(allies.votes)}</strong> decided votes{" "}
            {family.sentence} sat in {term ? term.short : "this term"}, how often
            each other family took the same side, win or lose.
          </>
        )}
      </p>

      <ul className="coalitions-allies" aria-describedby={`${id}-lede`}>
        {allies.rows.map((row) => (
          <li className="coalitions-ally" key={row.family}>
            <span className="coalitions-ally-name">{FAMILIES[row.family].short}</span>
            <span className="coalitions-ally-track">
              <span
                className="coalitions-ally-fill"
                style={{
                  width: `${row.share * 100}%`,
                  background: FAMILIES[row.family].color,
                }}
              />
            </span>
            <span className="coalitions-ally-value">{whole(row.share)}</span>
            <span className="coalitions-ally-tip" role="tooltip">
              {`${thousands(row.count)} of ${thousands(allies.denominator)} votes — ${pct(row.share)}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The winning coalitions of one term, largest first. */
function Ranking({ rows, view, family, term, subject }) {
  const widest = Math.max(...rows.map((row) => row.share), 0.01);

  return (
    <div className="coalitions-block">
      <h5 className="sb-section-label">
        What wins in {term ? term.short : "this term"}
      </h5>
      {/* The no-family case used to end "Every coalition that took at least 1%
          of them", which read as a threshold on *members* — as though a group
          joined a coalition when 1% of its MEPs did. The floor is a share of
          the term's roll-calls and has nothing to do with members: a group is
          in a coalition when its own position, the most common ballot among its
          members present, matched the outcome. Removed rather than reworded,
          the floor being a detail of what the list omits rather than something
          a reader of it needs. */}
      <p className="sb-section-lede">
        The families on the winning side, on the {thousands(view.decided)} decided
        votes {subject ? `in ${subject}` : "of this term"}.
        {family ? ` Only the coalitions that include ${family.sentence}.` : ""}
      </p>

      <ul className="coalitions-ranking">
        {rows.map((row) => (
          <li
            className="coalitions-ranking-row"
            key={row.groups.join("+")}
            title={`${row.groups.map((id) => FAMILIES[id].label).join(" + ")} — ${thousands(row.votes)} votes, ${pct(row.share)}`}
          >
            <span className="coalitions-ranking-marks">
              {FAMILY_ORDER.map((id) => {
                const inside = row.groups.includes(id);
                return (
                  <span
                    key={id}
                    className={`coalitions-mark ${inside ? "in" : "out"}`}
                    style={inside ? { background: FAMILIES[id].color } : undefined}
                    aria-hidden="true"
                  />
                );
              })}
            </span>
            <span className="coalitions-ranking-bar">
              <span
                className="coalitions-ranking-fill"
                style={{ width: `${(row.share / widest) * 100}%` }}
              />
            </span>
            <span className="coalitions-ranking-value">{pct(row.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
