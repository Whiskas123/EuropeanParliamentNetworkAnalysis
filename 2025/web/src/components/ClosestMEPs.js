"use client";

import { useState } from "react";
import { CountryFlag, getGroupAcronym, getSubjectEmoji } from "../lib/utils.js";
import { groupSwatchStyle } from "../lib/groupColors.js";
import { useHoverFocus } from "../lib/hoverFocus.js";
import SegmentedToggle from "./SegmentedToggle";
import "../styles/profile.scss";

/**
 * The MEPs this one votes with most, and the ones they vote with least.
 *
 * Each entry used to be a two-line card - name and flag on one line, a colour
 * swatch and group and figure on the next - so five MEPs cost about as much
 * height as a grid of twenty dials. They are five ranked rows and now look like
 * it: one line each, the rank carried by the order, the group named rather than
 * only coloured. Named because the disagreement list is full of groups a reader
 * would not identify from a swatch: a Portuguese Socialist's five furthest
 * counterparts are ESN and Non-Attached members from four countries.
 *
 * ## Why the two directions come from different places
 *
 * The closest five are computed here, from the edges already in the browser.
 * The furthest five cannot be: the published network is cut at 0.6 agreement so
 * the drawing stays legible, which keeps every one of an MEP's agreements and
 * discards every one of their disagreements. Term 10 ships 135,776 of 241,860
 * pairs, and the MEP with the fewest ties has 68 of a possible 695 - the 627
 * missing ones being exactly the list this panel would need.
 *
 * So the furthest five are published alongside the layout, computed over the
 * complete edge set at build time. Where that field is absent - an older
 * deployment, or a view it was not built for - the control says so instead of
 * ranking the weakest of the strong ties and calling them disagreements.
 */

const ORDER = [
  { id: "high", text: "Highest", title: "Who this MEP agrees with most" },
  { id: "low", text: "Lowest", title: "Who this MEP agrees with least" },
];

export default function ClosestMEPs({
  meps,
  furthest,
  onSelectMEP,
  selectedSubject,
  mandate,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [order, setOrder] = useState("high");
  const focus = useHoverFocus();

  const showing = order === "low" ? furthest : meps;
  const canReverse = Array.isArray(furthest) && furthest.length > 0;

  // Named for what it ranks. "Voting agreement" is the measure the whole
  // sidebar is drawn from - every dial above this panel is one - so as a
  // heading it said nothing about which agreement these five rows are.
  const title = selectedSubject
    ? `Agreement with other MEPs (${getSubjectEmoji(
        selectedSubject
      )} ${selectedSubject})`
    : "Agreement with other MEPs";

  return (
    <div className="sb-panel closest-meps">
      <div className="sb-panel-head">
        <h4 className="sb-panel-title">{title}</h4>
        <div className="sb-panel-controls">
          {canReverse && !isCollapsed && (
            <SegmentedToggle
              value={order}
              onChange={setOrder}
              options={ORDER}
              label="Order"
            />
          )}
          <button
            type="button"
            className="sb-collapse"
            aria-expanded={!isCollapsed}
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? "Show these MEPs" : "Hide these MEPs"}
          >
            <svg
              className={`collapse-icon ${isCollapsed ? "collapsed" : ""}`}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      <div className={`collapsible-content ${!isCollapsed ? "expanded" : ""}`}>
        {!showing || showing.length === 0 ? (
          <p className="sb-note sb-note--empty">
            {order === "low" && !canReverse ? (
              <>
                Not available for this view. The network ships only pairs above
                60% agreement, so the MEPs this one agrees with <em>least</em>{" "}
                are not among the figures the page has.
              </>
            ) : (
              <>No MEPs with a comparable voting record here.</>
            )}
          </p>
        ) : (
          <ol className="mep-rank">
            {showing.map((mep, index) => (
              <li key={mep.id}>
                <button
                  type="button"
                  className="mep-rank-row"
                  onClick={() =>
                    onSelectMEP({
                      id: mep.id,
                      label: mep.label,
                      country: mep.country,
                      groupId: mep.groupId,
                    })
                  }
                  title={`${mep.label} — ${(mep.edgeWeight * 100).toFixed(
                    1
                  )}% agreement`}
                  {...focus.on([{ mep: mep.id }])}
                >
                  <span className="mep-rank-n">{index + 1}</span>
                  <span className="mep-rank-name">{mep.label}</span>
                  <span className="mep-rank-flag">
                    <CountryFlag country={mep.country} />
                    {/* The flag alone asked a reader to know twenty-seven of
                        them; the name is the fact, the flag is the cue. */}
                    <span className="mep-rank-country">{mep.country}</span>
                  </span>
                  <span className="mep-rank-group">
                    <span
                      className="mep-rank-swatch"
                      style={groupSwatchStyle(mep.groupId, mep.color)}
                      aria-hidden="true"
                    />
                    {getGroupAcronym(mep.groupId, mandate)}
                  </span>
                  <span className="mep-rank-value">
                    {(mep.edgeWeight * 100).toFixed(1)}%
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
