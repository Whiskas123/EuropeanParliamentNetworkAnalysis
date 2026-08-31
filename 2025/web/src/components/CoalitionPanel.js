"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  allyShares,
  carryPivot,
  coalitionsFor,
  groupInfo,
  groupsIn,
  loadCoalitions,
  opening,
  renamesFor,
  sittingOf,
  viewFor,
} from "../lib/coalitions.js";
import { useHoverFocus } from "../lib/hoverFocus.js";
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
 * Two questions, and with no group selected only the second.
 *
 * **Who does this group share a side with**, in two readings whose *difference*
 * is the finding. "When it wins" counts only the votes the group carried, and
 * asks who was carrying them too. "Every vote" counts all decided roll-calls,
 * win or lose. For PfE in term 10 those read 94% and 39% for the EPP: it almost
 * never wins except on votes the EPP is already winning. A group with its own
 * majority — the EPP, 92% and 88% with Renew — scores alike on both. One number
 * cannot say that, which is why the toggle is not a convenience.
 *
 * **What wins**, ranked. Every coalition taking at least 1% of the term's
 * decided votes, so the list is as long as the term was fragmented.
 *
 * **The rows are political groups, not families.** They used to be the seven
 * families the cross-term charts draw, because PSE and S&D have to be one line
 * on a chart that spans a term boundary. This panel never spans one — it is
 * always a single term — so the merge bought it nothing, and it hid the split
 * that matters most in the term people arrive asking about: term 10's far right
 * is PfE and ESN, which win 38% and 31% of votes and take the same side as each
 * other on only 74%. Drawn as one bar, that was one number for two groups. The
 * only merge left is a rename inside a term — term 7's PSE and S&D are one
 * group under one name — and the panel says so under the ranking.
 *
 * **This panel used to report which flank a group won with** — consensus, with
 * the left, with the right, alone. It was the clearest chart here and it is
 * gone, because it could not be drawn without this code asserting that the EPP
 * is the right, Renew the centre-left and the Greens the left. Those are
 * contested claims, they were invisible to the reader, and they were doing all
 * the work. Both replacements are counts of who stood where, which the
 * roll-calls settle by themselves.
 *
 * Three things this panel must not pretend to.
 *
 * **It has no country dimension.** A group's direction on a vote is the
 * majority of its members across the house; filtering to one country would ask
 * what Portugal's slice of the EPP did and answer it with a handful of members.
 * With a country selected the panel says so rather than quietly reporting the
 * whole Parliament — the exact failure the trends panel was rebuilt to avoid.
 *
 * **A policy area can be too thin to read.** Term 10's Transport and Tourism
 * decides twelve votes. The view is still drawn, with its count, and marked.
 *
 * **A group need not have sat for the whole term.** ENF was constituted in June
 * 2015, eleven months into term 8. Its shares are over the votes it was there
 * for, and the panel prints the date rather than letting a group that sat for
 * four fifths of a term read as one that sat for all of it.
 */

/** The two readings of a group's allies. */
const MODES = [
  {
    id: "wonTogether",
    text: "When it wins",
    title: "Of the votes this group won, how often each other group won too",
  },
  {
    id: "sameSide",
    text: "Every vote",
    title: "Of all decided votes, how often each other group took the same side",
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

/** "24 June 2015" from an ISO stamp, without a locale. */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function longDate(stamp) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(stamp || "");
  if (!match) return null;
  const [, year, month, day] = match;
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

export default function CoalitionPanel({
  mandate,
  selectedCountry = null,
  selectedSubject = null,
  // null is a real state, not "nothing chosen yet": it means the whole chamber,
  // and it is what the ranking below shows when no group is picked. Owned by
  // the sidebar so the SVG export can draw the group actually on screen.
  pivot = "PPE",
  onPivotChange,
}) {
  const [mode, setMode] = useState("wonTogether");
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const titleId = useId();
  const focus = useHoverFocus();

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

  const groups = useMemo(() => groupsIn(data, mandate), [data, mandate]);

  // Group ids do not survive a change of term: PfE is term 10's and there is no
  // PfE in term 9. Rather than drop the selection when the reader steps back a
  // term, it is carried to the group that stands in the same place — PfE to ID,
  // ALDE to Renew — which is the one thing the family table is still used for.
  // Done here rather than in the sidebar because only this panel knows which
  // groups a term has.
  useEffect(() => {
    if (!data || !pivot || groups.length === 0) return;
    if (groups.includes(pivot)) return;
    const carried = carryPivot(data, mandate, pivot);
    if (onPivotChange) onPivotChange(carried);
  }, [data, groups, mandate, pivot, onPivotChange]);

  // Memoised because it is a dependency of the ally computation below, and a
  // fresh object each render would recompute it on every mouse move.
  const group = useMemo(
    () => (pivot && groups.includes(pivot) ? groupInfo(pivot, mandate) : null),
    [pivot, groups, mandate]
  );
  const view = useMemo(
    () => (data ? viewFor(data, mandate, selectedSubject) : null),
    [data, mandate, selectedSubject]
  );
  // The sitting window lives on the whole-term view; a policy-area view is a
  // slice of the same roll-calls and does not repeat it.
  const term = useMemo(
    () => (data ? viewFor(data, mandate, null) : null),
    [data, mandate]
  );

  const allies = useMemo(
    () =>
      data && view && group
        ? allyShares(view, data, mandate, group.id, mode)
        : null,
    [data, view, mandate, group, mode]
  );

  const ranking = useMemo(
    () => (view ? coalitionsFor(view, group ? group.id : null) : []),
    [view, group]
  );

  const termInfo = TERMS.find((entry) => entry.mandate === mandate);
  const termShort = termInfo ? termInfo.short : "this term";

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
        {group ? `${opening(group.possessive)} winning coalitions` : "Winning coalitions"}
      </h4>
      <p className="sb-panel-desc">
        Which political groups win together in {termShort}. Every group&rsquo;s
        position on a vote is the majority of its own members.
      </p>

      <div className="coalitions-chips" role="group" aria-label="Political group">
        {/* Deselecting is the point of this one: with no group picked the
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
        {groups.map((id) => {
          const info = groupInfo(id, mandate);
          return (
            <button
              key={id}
              type="button"
              className="coalitions-chip"
              aria-pressed={pivot === id}
              // Clicking the selected chip clears it, so the row works as a
              // filter rather than a radio group with no off switch.
              onClick={() => onPivotChange && onPivotChange(pivot === id ? null : id)}
              title={`${info.fullName} — show the coalitions it is in`}
              {...focus.on([{ group: id }])}
            >
              <span
                className="coalitions-chip-dot"
                style={{ background: info.color }}
                aria-hidden="true"
              />
              {info.short}
            </button>
          );
        })}
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

      {data && group && allies && (
        <AllyBars
          allies={allies}
          mode={mode}
          onMode={setMode}
          group={group}
          mandate={mandate}
          termShort={termShort}
        />
      )}

      {data && group && !allies && (
        <p className="sb-note coalitions-status">
          {opening(group.sentence)} did not sit in this view.
        </p>
      )}

      {data && group && <LateSeat view={term} group={group} termShort={termShort} />}

      {data && view && view.thin && (
        <p className="sb-note coalitions-caveat">
          {selectedSubject || "This view"} decides only{" "}
          <strong>{thousands(view.decided)}</strong> votes in {termShort}, so
          every share below is a handful of roll-calls rather than a pattern.
        </p>
      )}

      {data && view && ranking.length > 0 && (
        <Ranking
          rows={ranking}
          view={view}
          groups={groups}
          group={group}
          mandate={mandate}
          data={data}
          termShort={termShort}
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
 * The note for a group that was not there for the whole term.
 *
 * ENF's first ballot in term 8 is 24 June 2015, eleven months in. Its shares
 * are over the votes it was present for — the pipeline gives each pair of
 * groups its own denominator — and this is what says so, because a reader has
 * no other way to tell a group that sat for four fifths of a term from one that
 * sat for all of it.
 *
 * Silent when the group sat from the start, which is every group in four of the
 * five terms.
 */
function LateSeat({ view, group, termShort }) {
  const window = sittingOf(view, group.id);
  if (!window || !view || !view.sitting) return null;
  const opened = Object.values(view.sitting).reduce(
    (earliest, span) => (span.from < earliest ? span.from : earliest),
    window.from
  );
  if (window.from <= opened) return null;
  const started = longDate(window.from);
  if (!started) return null;
  return (
    <p className="sb-note coalitions-caveat">
      {opening(group.sentence)} was constituted during {termShort}: its first
      recorded vote is <strong>{started}</strong>. Every share here is over the
      roll-calls it was there for, not the whole term.
    </p>
  );
}

/**
 * One bar per other group: how often it stands where this one stands.
 *
 * Ranked rather than seated, because the ranking *is* the answer — the reader
 * is asking who the closest partners are, and putting them in seating order
 * would make that a thing to work out. Each bar takes its group's own colour,
 * which is what the rest of the sidebar does for a political group.
 */
function AllyBars({ allies, mode, onMode, group, mandate, termShort }) {
  const id = useId();
  const focus = useHoverFocus();

  return (
    <div className="coalitions-block">
      <div className="coalitions-block-head">
        <h5 className="sb-section-label">Who stand together</h5>
        <SegmentedToggle value={mode} onChange={onMode} options={MODES} label="" />
      </div>

      <p className="sb-section-lede" id={`${id}-lede`}>
        {mode === "wonTogether" ? (
          <>
            Of the <strong>{thousands(allies.wins)}</strong> votes{" "}
            {group.sentence} won in {termShort} — {whole(allies.wins / allies.votes)} of
            all votes — how often each other group was on the winning side too.
          </>
        ) : (
          <>
            Of all <strong>{thousands(allies.votes)}</strong> decided votes{" "}
            {group.sentence} sat in {termShort}, how often each other group took
            the same side, win or lose.
          </>
        )}
      </p>

      <ul className="coalitions-allies" aria-describedby={`${id}-lede`}>
        {allies.rows.map((row) => {
          const other = groupInfo(row.group, mandate);
          return (
            <li
              className="coalitions-ally"
              key={row.group}
              /* The bar is a figure about two groups — the one the panel is
                 pivoted on and the one on the row — so both stay lit and the
                 rest of the chamber steps back. */
              {...focus.on([{ group: group.id }, { group: row.group }])}
            >
              <span className="coalitions-ally-name">{other.short}</span>
              <span className="coalitions-ally-track">
                <span
                  className="coalitions-ally-fill"
                  style={{
                    width: `${row.share * 100}%`,
                    background: other.color,
                  }}
                />
              </span>
              <span className="coalitions-ally-value">{whole(row.share)}</span>
              <span className="coalitions-ally-tip" role="tooltip">
                {`${thousands(row.count)} of ${thousands(row.denominator)} votes — ${pct(
                  row.share
                )}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The winning coalitions of one term, largest first. */
function Ranking({ rows, view, groups, group, mandate, data, termShort, subject }) {
  const widest = Math.max(...rows.map((row) => row.share), 0.01);
  const focus = useHoverFocus();
  const seats = useMemo(
    () => groups.map((id) => groupInfo(id, mandate)),
    [groups, mandate]
  );
  // Renames folded inside this term, e.g. term 7's PSE and S&D. A reader who
  // knows the term will look for the name that is missing, so the panel says
  // where it went rather than leaving it to be noticed.
  const folded = useMemo(
    () =>
      groups
        .map((id) => ({ id, spellings: renamesFor(data, mandate, id) }))
        .filter((entry) => entry.spellings.length > 1),
    [groups, data, mandate]
  );

  return (
    <div className="coalitions-block">
      <h5 className="sb-section-label">What coalitions win in {termShort}</h5>
      {/* The no-group case used to end "Every coalition that took at least 1%
          of them", which read as a threshold on *members* — as though a group
          joined a coalition when 1% of its MEPs did. The floor is a share of
          the term's roll-calls and has nothing to do with members: a group is
          in a coalition when its own position, the most common ballot among its
          members present, matched the outcome. Removed rather than reworded,
          the floor being a detail of what the list omits rather than something
          a reader of it needs. */}
      <p className="sb-section-lede">
        The political groups on the winning side, on the {thousands(view.decided)} decided
        votes {subject ? `in ${subject}` : "of this term"}.
        {group ? ` Only the coalitions that include ${group.sentence}.` : ""}
      </p>

      <ul className="coalitions-ranking">
        {rows.map((row) => (
          <li
            className="coalitions-ranking-row"
            key={row.groups.join("+")}
            /* A row names a winning side, so pointing at it leaves that whole
               side lit — marks, bar and share alike, since all three are the
               same coalition. With a group selected the list is already
               filtered to coalitions it sits in, so the selected group is
               among them without being asked for twice. */
            {...focus.on(row.groups.map((id) => ({ group: id })))}
          >
            <span className="coalitions-ranking-marks">
              {seats.map((seat) => {
                const inside = row.groups.includes(seat.id);
                return (
                  <span
                    key={seat.id}
                    className={`coalitions-mark ${inside ? "in" : "out"}`}
                    style={inside ? { background: seat.color } : undefined}
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
            {/* The same instant card the ally bars carry, in place of a title
                attribute: these rows are read in sequence and the browser's own
                delay makes scanning a dozen of them slow. It also names the
                coalition the network has just dimmed to, which the squares say
                in shorthand and this says in words. */}
            <span className="coalitions-ally-tip coalitions-row-tip" role="tooltip">
              {`${row.groups
                .map((id) => groupInfo(id, mandate).short)
                .join(" + ")} — ${thousands(row.votes)} votes, ${pct(row.share)}`}
            </span>
          </li>
        ))}
      </ul>

      {/* What the squares are. Seven of them were a shape the reader learned
          once; the count now changes with the term — eight in T8 and T10, where
          the far right sat as two groups — so the legend is not optional. */}
      <p className="sb-note coalitions-legend">
        <span className="coalitions-legend-marks" aria-hidden="true">
          {seats.map((seat) => (
            <span
              key={seat.id}
              className="coalitions-mark in"
              style={{ background: seat.color }}
            />
          ))}
        </span>
        Squares, seated left to right:{" "}
        {seats.map((seat) => seat.short).join(", ")}. A filled square is a group
        on the winning side.
        {folded.length > 0
          ? ` ${folded
              .map(
                (entry) =>
                  `${entry.spellings.join(" and ")} are one group renamed mid-term, counted as ${
                    groupInfo(entry.id, mandate).short
                  }`
              )
              .join("; ")}.`
          : ""}
      </p>
    </div>
  );
}
