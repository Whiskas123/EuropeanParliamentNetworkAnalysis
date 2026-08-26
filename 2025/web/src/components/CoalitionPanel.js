"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  coalitionsFor,
  flankShares,
  loadCoalitions,
  viewFor,
} from "../lib/coalitions.js";
import { FAMILIES, FAMILY_ORDER, opening } from "../lib/families.js";
import { TERMS } from "../lib/trends.js";
import "../styles/coalitions.scss";

/**
 * Who actually wins votes together.
 *
 * Every other figure in this tab is pairwise similarity: over a term, how often
 * two MEPs cast the same ballot. That measure cannot answer "who governs with
 * whom", because it is dominated by the roll-calls nobody contests. Term 10
 * decides 4,244 votes and the two flanks are on opposite sides in most of them;
 * averaging the contested and the unanimous together lets a group look like
 * everyone's friend while losing consistently to a coalition it is not in.
 *
 * This panel classifies whole roll-calls instead — see pipeline/coalitions.py.
 * Two readings of the same classification:
 *
 * **Which flank did this group carry the day with**, term by term. For the EPP:
 * consensus 52% falling to 27%, and EPP-with-the-left rising 17% to 50%. The
 * collapse of consensus voting is the cleanest trend in the whole dataset, and
 * this is the chart that shows what replaced it.
 *
 * **Which whole coalitions win**, this term. Term 10's biggest is everyone but
 * the right at 35.8%. Sixth, at 5.8%, is EPP+Conservatives+far right — a
 * right-only majority that had no equivalent in term 9's top ten. That single
 * row is the honest version of a claim the pairwise numbers flatly reject: the
 * EPP has not drifted rightward on average, and a right-wing majority has
 * nonetheless become a thing that exists.
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

/**
 * The four outcomes, in the order they stack.
 *
 * Consensus first because it is the baseline the other three are carved out of,
 * then the two flanks either side of it, then the group alone. Colours are
 * directional rather than partisan: a flank is three or four families and has
 * no group colour of its own, so left is the sidebar's red and right its navy,
 * with the whole house in grey between them.
 */
const OUTCOMES = [
  {
    id: "consensus",
    label: "With both",
    color: "#8c96a3",
    describe: (owns) => `Votes where the left and the right both went ${owns} way`,
  },
  {
    id: "left",
    label: "With the left",
    color: "#b5453a",
    describe: () => `Votes carried with the left flank against the right`,
  },
  {
    id: "right",
    label: "With the right",
    color: "#2b3a67",
    describe: () => `Votes carried with the right flank against the left`,
  },
  {
    id: "alone",
    label: "Alone",
    color: "#dfe3e8",
    describe: (owns) => `Votes where neither flank went ${owns} way`,
  },
];

const BAR_HEIGHT = 15;
const BAR_GAP = 5;
const BAR_LABEL = 26;

const pct = (value) =>
  typeof value === "number" && isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
const short = (value) =>
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
}) {
  const [pivot, setPivot] = useState("EPP");
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

  // Mid-sentence form; headings take the possessive. See families.js for why
  // none of this can be built from the plain label.
  const name = FAMILIES[pivot].sentence;
  const owns = FAMILIES[pivot].possessive;

  /** One stacked bar per term, at whatever policy area is open. */
  const bars = useMemo(() => {
    if (!data) return [];
    return TERMS.map((term) => {
      const view = viewFor(data, term.mandate, selectedSubject);
      const shares = flankShares(view, pivot);
      return { term, shares, thin: Boolean(view && view.thin) };
    }).filter((bar) => bar.shares);
  }, [data, pivot, selectedSubject]);

  /** The winning coalitions of the term on screen, those this group is in. */
  const ranking = useMemo(() => {
    if (!data) return null;
    const view = viewFor(data, mandate, selectedSubject);
    if (!view) return null;
    const rows = coalitionsFor(view, pivot).slice(0, 6);
    return { view, rows };
  }, [data, mandate, pivot, selectedSubject]);

  if (failed) {
    return (
      <section className="coalitions-panel" aria-labelledby={titleId}>
        <h4 className="sb-panel-title" id={titleId}>
          Winning coalitions
        </h4>
        <p className="sb-note">This view&rsquo;s roll-call classification could not be read.</p>
      </section>
    );
  }

  return (
    <section className="coalitions-panel" aria-labelledby={titleId}>
      <h4 className="sb-panel-title" id={titleId}>
        {opening(owns)} winning coalitions
      </h4>
      <p className="sb-panel-desc">
        Not how often members vote alike — which side carried each roll-call.
        Every group&rsquo;s position on a vote is the majority of its own members.
      </p>

      <div className="coalitions-chips" role="group" aria-label="Political family">
        {FAMILY_ORDER.map((family) => (
          <button
            key={family}
            type="button"
            className="coalitions-chip"
            aria-pressed={pivot === family}
            onClick={() => setPivot(family)}
            title={`Show the coalitions that include ${FAMILIES[family].sentence}`}
          >
            <span
              className="coalitions-chip-dot"
              style={{ background: FAMILIES[family].color }}
              aria-hidden="true"
            />
            {FAMILIES[family].short}
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

      {data && bars.length > 0 && (
        <FlankBars bars={bars} pivot={pivot} owns={owns} mandate={mandate} />
      )}

      {data && bars.length === 0 && (
        <p className="sb-note coalitions-status">
          {opening(name)} did not sit in any term this view reaches.
        </p>
      )}

      {data && ranking && ranking.rows.length > 0 && (
        <Ranking
          rows={ranking.rows}
          view={ranking.view}
          pivot={pivot}
          name={name}
          mandate={mandate}
          subject={selectedSubject}
        />
      )}
    </section>
  );
}

/** One stacked bar per term: which flank the group carried the day with. */
function FlankBars({ bars, pivot, owns, mandate }) {
  const id = useId();
  const first = bars[0];
  const last = bars[bars.length - 1];

  return (
    <div className="coalitions-block">
      <h5 className="sb-section-label">Which side, term by term</h5>

      <div className="coalitions-bars" role="img" aria-labelledby={`${id}-summary`}>
        {bars.map(({ term, shares, thin }) => (
          <div className="coalitions-bar-row" key={term.mandate}>
            <span
              className={`coalitions-bar-term ${term.mandate === mandate ? "current" : ""}`}
              style={{ width: BAR_LABEL }}
            >
              {term.short}
            </span>
            <span
              className="coalitions-bar"
              style={{ height: BAR_HEIGHT, marginBottom: BAR_GAP }}
            >
              {OUTCOMES.map((outcome) => {
                const value = shares[outcome.id];
                if (!value) return null;
                return (
                  <span
                    key={outcome.id}
                    className="coalitions-bar-part"
                    style={{ width: `${value * 100}%`, background: outcome.color }}
                    title={`${outcome.describe(owns)}: ${pct(value)} of ${term.short}'s ${thousands(shares.votes)} decided votes`}
                  />
                );
              })}
            </span>
            <span className="coalitions-bar-figure">
              {short(shares.consensus)}
              {thin ? "*" : ""}
            </span>
          </div>
        ))}
      </div>

      <ul className="coalitions-legend">
        {OUTCOMES.map((outcome) => (
          <li className="coalitions-legend-item" key={outcome.id} title={outcome.describe(owns)}>
            <span
              className="coalitions-legend-dot"
              style={{ background: outcome.color }}
              aria-hidden="true"
            />
            {outcome.label}
          </li>
        ))}
      </ul>

      {/* The figure at the end of each bar is the consensus share, so the
          column reads as one falling series rather than four stacks the eye has
          to compare. Named here because a number with no unit beside a chart is
          the sort of thing that gets printed and then queried. */}
      <p className="sb-note coalitions-caveat" id={`${id}-summary`}>
        The figure is the share where both flanks went {owns} way —{" "}
        <strong>{short(first.shares.consensus)}</strong> in {first.term.short},{" "}
        <strong>{short(last.shares.consensus)}</strong> in {last.term.short}.
        {bars.some((bar) => bar.thin) && " * rests on under 60 decided votes."}
      </p>
    </div>
  );
}

/** The winning coalitions of one term, largest first. */
function Ranking({ rows, view, pivot, name, mandate, subject }) {
  const term = TERMS.find((entry) => entry.mandate === mandate);
  const widest = Math.max(...rows.map((row) => row.share), 0.01);

  return (
    <div className="coalitions-block">
      <h5 className="sb-section-label">
        What wins in {term ? term.short : `T${mandate}`}
      </h5>
      <p className="sb-section-lede">
        The families on the winning side, on the {thousands(view.decided)}{" "}
        decided votes {subject ? `in ${subject}` : "of this term"}. Only the
        coalitions that include {name}.
      </p>

      <ul className="coalitions-ranking">
        {rows.map((row) => {
          const includesRight =
            row.groups.includes("FarRight") && !row.groups.includes("Left");
          return (
            <li
              className="coalitions-ranking-row"
              key={row.groups.join("+")}
              title={`${row.groups.map((family) => FAMILIES[family].label).join(" + ")} — ${thousands(row.votes)} votes, ${pct(row.share)}`}
            >
              <span className="coalitions-ranking-marks">
                {FAMILY_ORDER.map((family) => {
                  const inside = row.groups.includes(family);
                  return (
                    <span
                      key={family}
                      className={`coalitions-mark ${inside ? "in" : "out"}`}
                      style={inside ? { background: FAMILIES[family].color } : undefined}
                      aria-hidden="true"
                    />
                  );
                })}
              </span>
              <span className="coalitions-ranking-bar">
                <span
                  className="coalitions-ranking-fill"
                  style={{
                    width: `${(row.share / widest) * 100}%`,
                    background: includesRight ? "#2b3a67" : "var(--sb-ink-soft)",
                  }}
                />
              </span>
              <span className="coalitions-ranking-value">{pct(row.share)}</span>
            </li>
          );
        })}
      </ul>

      {/* The seven squares are always all seven, filled or hollow, so a row is
          read as a shape rather than a list of names — which is what makes
          "everyone but the right" recognisable at a glance across rows. */}
      <p className="sb-note coalitions-caveat">
        Seven squares, seated left to right:{" "}
        {FAMILY_ORDER.map((family, i) => (
          <span key={family}>
            {i > 0 ? ", " : ""}
            {FAMILIES[family].short}
          </span>
        ))}
        . A filled square is in the winning coalition.
      </p>
    </div>
  );
}
