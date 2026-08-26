"use client";

import { useMemo, useState } from "react";
import {
  getGroupAcronym,
  getGroupDisplayName,
  getSubjectEmoji,
} from "../lib/utils.js";
import RadialGauge, { RadialGrid } from "./RadialGauge";
import SegmentedToggle from "./SegmentedToggle";
import SubjectSelector from "./SubjectSelector";
import { readAgreement, readBySubject } from "../lib/normalisedAgreement.js";
import "../styles/profile.scss";

/**
 * Where one MEP sits, and how that differs from the group they sit in.
 *
 * These used to be two blocks on two scales: a grid of dials showing raw
 * agreement with each group, and under it a bar chart of deviations from the
 * MEP's own group running -20 to +20 points. Two charts of the same eight
 * groups, one in percentages and one in points, and a reader had to hold both
 * to answer either question.
 *
 * They are now one chart, because the deviation is a *distance between two
 * points on the same axis* and the dial already has an axis. The arc is where
 * the MEP sits; the notch is where their group sits; the gap between them is
 * the deviation, and the badge under the ring prints it.
 *
 * That collapse also disposes of the question the bar chart could not answer.
 * Its bars were signed against the MEP's own group, so an MEP could show a
 * positive bar for every group at once and there was no way to see why - it
 * meant they had voted with the chamber's consensus more than their group did,
 * which is a real finding the chart had no vocabulary for. Drawn as arcs
 * against notches, the same MEP simply has every arc a little past every notch,
 * and the sentence writes itself.
 *
 * The own group is no longer a special case to be hidden. On the bar chart it
 * was genuinely confusing - "how far from EPP are you, compared with EPP" - but
 * as a dial it is the plainest one there: the arc is this MEP's agreement with
 * their colleagues, the notch is what those colleagues manage among themselves.
 */

// Only the policy-area grid carries this now: two dozen areas do not all fit
// on one screen, so which end of the ranking is on top is a real choice there.
const ORDER = [
  { id: "high", text: "Highest", title: "Closest policy areas first" },
  { id: "low", text: "Lowest", title: "Furthest policy areas first" },
];

// Under this many votes the figure is the sample rather than the politics; the
// pipeline's own floor is 30, and this is where it stops being worth trusting
// the size of a gap. Matches THIN_SAMPLE in the panel this replaces.
const THIN_SAMPLE = 100;

export default function AgreementByGroup({
  mandate,
  selectedNode,
  subject,
  onSubjectChange,
  subjectLocked,
  file,
  groupColors,
  rawAgreementScores,
  rawSubjectScores,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [areaOrder, setAreaOrder] = useState("high");
  const [areasCollapsed, setAreasCollapsed] = useState(false);

  const reading = useMemo(
    () => readAgreement(file, selectedNode?.id, subject),
    [file, selectedNode, subject]
  );

  const byArea = useMemo(
    () => readBySubject(file, selectedNode?.id),
    [file, selectedNode]
  );

  const name = selectedNode?.label ?? "This MEP";

  // The Non-Attached are not a bloc, so there is no reference to normalise them
  // against and the file has nothing for them. Rather than show 25 MEPs an
  // empty profile, the raw figures stand in - clearly labelled, because they
  // carry exactly the attendance bias the rest of the panel has removed.
  const raw = subject ? rawSubjectScores : rawAgreementScores;
  const usingRaw = Boolean(reading?.reason) && Array.isArray(raw) && raw.length > 0;

  // Always closest first. There are eight groups and they are all on screen at
  // once, so reversing them shows the same eight dials in the other direction -
  // a control that costs a heading row and answers a question the grid already
  // answers by being read from the other end.
  const rows = useMemo(() => {
    const source = usingRaw
      ? raw
          .filter((item) => item.groupId !== "NonAttached")
          .map((item) => ({ groupId: item.groupId, value: item.score, level: null }))
      : reading?.groups ?? [];
    return [...source].sort((a, b) => b.value - a.value);
  }, [usingRaw, raw, reading]);

  const areas = useMemo(() => {
    const sorted = [...byArea].sort((a, b) => b.value - a.value);
    return areaOrder === "low" ? sorted.reverse() : sorted;
  }, [byArea, areaOrder]);

  if (!file) return null;
  if (rows.length === 0 && !reading) return null;

  const ownAcronym = reading?.group
    ? getGroupAcronym(reading.group, mandate)
    : null;
  // The measure uses the group the MEP sat in while voting; the canvas colours
  // them by the group they ended the term in. Where those differ the panel has
  // to say so, or it silently contradicts the dot on screen.
  const mismatch =
    reading?.group && reading?.labelGroup && reading.group !== reading.labelGroup;

  const chevron = (isCollapsed) => (
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
  );

  return (
    <div className="sb-panel">
      {/* The policy-area control sits in the heading row, with the collapse
          chevron to its right: the chevron acts on everything the picker
          changes, so it reads as the outer of the two. */}
      <div className="sb-panel-head">
        <h4 className="sb-panel-title">Group Agreement</h4>
        <div className="sb-panel-controls">
          {!subjectLocked && (
            <SubjectSelector
              currentMandate={mandate}
              currentSubject={subject}
              onSubjectChange={onSubjectChange}
              compact
            />
          )}
          <button
            type="button"
            className="sb-collapse"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Show these figures" : "Hide these figures"}
          >
            {chevron(collapsed)}
          </button>
        </div>
      </div>

      <div className={`collapsible-content ${!collapsed ? "expanded" : ""}`}>
        {/* Three ways there can be nothing to draw, and they are not the same
            failure. A policy area nobody could be measured in is not an MEP who
            was absent from one, and neither is an MEP with no group to be
            measured against - telling a reader the wrong one blames a person
            for a property of the data, or the reverse. */}
        {reading?.reason === "unmeasurable" ? (
          <p className="sb-note sb-note--empty">
            Not shown for anyone. This policy area&rsquo;s votes are too few, or
            too lopsided, for any MEP to be measured against their group.
          </p>
        ) : reading?.reason && !usingRaw ? (
          <p className="sb-note sb-note--empty">
            {reading.reason === "no-group" ? (
              <>
                Not shown. {name} either sat as Non-Attached for these votes
                &mdash; which is not a group, so there is nothing to measure
                them against &mdash; or cast too few votes here to compare.
              </>
            ) : (
              <>
                Not shown. {name} cast fewer than {file.minVotes} votes here,
                and a figure drawn from a handful of votes is those
                votes&rsquo; quirk rather than a position.
              </>
            )}
          </p>
        ) : (
          <>
            <p className="sb-panel-desc">
              {usingRaw ? (
                <>
                  How often <strong>{name}</strong> voted the same way as each
                  group
                  {subject ? ` on ${subject}` : ""}.
                </>
              ) : (
                <>
                  Where <strong>{name}</strong> sits beside each group, over the{" "}
                  {reading.votes?.toLocaleString()} vote
                  {reading.votes === 1 ? "" : "s"} they cast
                  {subject ? ` on ${subject}` : " this term"}. The notch marks{" "}
                  {ownAcronym}, the group they sat in.
                </>
              )}
            </p>

            {usingRaw && (
              <p className="sb-note sb-note--warn">
                Not corrected for attendance. {name} sat as Non-Attached, which
                is not a group, so there is no set of colleagues to measure them
                against &mdash; these are the plain percentages, and two MEPs who
                were in different rooms cannot be compared with them.
              </p>
            )}

            {mismatch && (
              <p className="sb-note">
                Measured against {ownAcronym}, the group {name} sat in while
                casting these votes &mdash; not{" "}
                {getGroupAcronym(reading.labelGroup, mandate)}, which they joined
                later and which colours their dot on the map.
              </p>
            )}

            <RadialGrid>
              {rows.map((row) => (
                <RadialGauge
                  key={row.groupId}
                  value={row.value}
                  baseline={row.level}
                  floor={0}
                  color={groupColors?.get(row.groupId) || "#CCCCCC"}
                  label={getGroupAcronym(row.groupId, mandate)}
                  // "<what> is N points higher/lower than <label>", so each
                  // half names one side: this MEP against their own group, both
                  // measured toward the same target.
                  what={`${name}'s agreement with ${getGroupAcronym(
                    row.groupId,
                    mandate
                  )}`}
                  baselineLabel={`${ownAcronym}'s own agreement with ${getGroupAcronym(
                    row.groupId,
                    mandate
                  )}`}
                  title={
                    row.level === null
                      ? `${name} voted with ${getGroupDisplayName(
                          row.groupId,
                          mandate
                        )} ${(row.value * 100).toFixed(1)}% of the time${
                          subject ? ` on ${subject}` : ""
                        }`
                      : `${name} sits at ${(row.value * 100).toFixed(
                          1
                        )}% with ${getGroupDisplayName(
                          row.groupId,
                          mandate
                        )}; ${ownAcronym} sits at ${(row.level * 100).toFixed(
                          1
                        )}% over the same votes`
                  }
                />
              ))}
            </RadialGrid>

            {!usingRaw && reading.used < THIN_SAMPLE && (
              <p className="sb-note">
                Drawn from only {reading.used?.toLocaleString()} votes, so treat
                the gaps lightly &mdash; a policy area this small moves several
                points on which sittings {name} happened to attend.
              </p>
            )}
          </>
        )}
      </div>

      {/* Their own group, area by area. Same measure, same notch, one dial per
          policy area - so "where is this MEP unusual" is answered by looking for
          the arc that has come away from its notch. */}
      {areas.length > 0 && !usingRaw && (
        <div className="sb-subpanel">
          <div className="sb-panel-head">
            <h4 className="sb-panel-title sb-panel-title--sub">
              With {ownAcronym}, by policy area
            </h4>
            <div className="sb-panel-controls">
              {!areasCollapsed && (
                <SegmentedToggle
                  value={areaOrder}
                  onChange={setAreaOrder}
                  options={ORDER}
                  label="Order"
                />
              )}
              <button
                type="button"
                className="sb-collapse"
                aria-expanded={!areasCollapsed}
                onClick={() => setAreasCollapsed(!areasCollapsed)}
                title={areasCollapsed ? "Show policy areas" : "Hide policy areas"}
              >
                {chevron(areasCollapsed)}
              </button>
            </div>
          </div>
          <div
            className={`collapsible-content ${!areasCollapsed ? "expanded" : ""}`}
          >
            <RadialGrid>
              {areas.map((area) => (
                <RadialGauge
                  key={area.subject}
                  value={area.value}
                  baseline={area.level}
                  color={groupColors?.get(reading?.group) || "#6B7C93"}
                  label={`${getSubjectEmoji(area.subject)} ${area.subject}`}
                  what={`${name}'s agreement with ${ownAcronym} here`}
                  baselineLabel={`what ${ownAcronym} manages among itself here`}
                  sub={`${area.votes?.toLocaleString()} votes`}
                  title={`${area.subject} — ${name} sits at ${(
                    area.value * 100
                  ).toFixed(1)}%, ${ownAcronym} at ${(area.level * 100).toFixed(
                    1
                  )}%, over ${area.votes?.toLocaleString()} votes`}
                />
              ))}
            </RadialGrid>
          </div>
        </div>
      )}
    </div>
  );
}
