"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getGroupAcronym,
  getGroupColor,
  getGroupDisplayName,
} from "../lib/utils.js";
import { getStructureAnalysis } from "../lib/networkAnalysis.js";
import "../styles/structure.scss";

/**
 * What the network looks like to something that has never heard of a political
 * group — and where that disagrees with the seating plan.
 *
 * The panel carries two results and one caveat. The caveat is the reason the
 * method line is set apart rather than buried: this graph is complete — every
 * MEP has an edge to every other — and its weights are crowded into a narrow
 * high band, so community detection says nothing at all until the data has been
 * reshaped. A reader who does not know that will take the eight communities for
 * a raw finding, and an exhibition caption written from that would be wrong.
 *
 * Both sections name the measure in plain words before showing a number,
 * because the numbers are only interesting relative to the measure.
 */

/** How many rows each list shows before the reader asks for the rest. */
const PREVIEW_ROWS = 8;
const EXPANDED_ROWS = 40;

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const pct0 = (value) => `${Math.round(value * 100)}%`;
const pp = (value) =>
  `${value >= 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(1)}pp`;

function GroupChip({ groupId, mandate }) {
  return (
    <span className="structure-chip">
      <span
        className="structure-chip-swatch"
        style={{ backgroundColor: getGroupColor(groupId) }}
      />
      {getGroupAcronym(groupId, mandate)}
    </span>
  );
}

/** One community: a stacked bar of the groups inside it, plus its makeup. */
function CommunityRow({ community, mandate, onSelectGroup }) {
  const mixed = community.dominantShare < 0.9;
  // Acronyms, not full names: at 380px "European People's Party (EPP)" only
  // ever appears as an ellipsis. The full name is on the hover title.
  const name = mixed
    ? community.composition
        .filter((part) => part.share >= 0.15)
        .map((part) => getGroupAcronym(part.groupId, mandate))
        .join(" + ")
    : getGroupAcronym(community.dominantGroup, mandate);
  const fullName = community.dominantGroup
    ? getGroupDisplayName(community.dominantGroup, mandate)
    : "Mixed";

  return (
    <div className="structure-community">
      <div className="structure-community-head">
        <span
          className="structure-community-name"
          title={`${fullName} — ${pct0(community.dominantShare)} of this community`}
        >
          {name}
        </span>
        <span className="structure-community-size">
          {community.size} MEPs
        </span>
      </div>

      <div className="structure-bar">
        {community.composition.map((part) => (
          <span
            key={part.groupId}
            className="structure-bar-segment"
            style={{
              width: `${part.share * 100}%`,
              backgroundColor: getGroupColor(part.groupId),
            }}
            title={`${getGroupDisplayName(part.groupId, mandate)}: ${part.count} MEPs, ${pct0(part.share)} of this community`}
          />
        ))}
      </div>

      <div className="structure-community-parts">
        {community.composition
          .filter((part) => part.count >= 2 || community.composition.length <= 3)
          .slice(0, 5)
          .map((part) => (
            <button
              key={part.groupId}
              type="button"
              className="structure-part"
              onClick={() => onSelectGroup && onSelectGroup(part.groupId)}
              title={`${pct0(part.shareOfGroup)} of ${getGroupDisplayName(part.groupId, mandate)} landed in this community`}
            >
              <span
                className="structure-part-swatch"
                style={{ backgroundColor: getGroupColor(part.groupId) }}
              />
              <span className="structure-part-name">
                {getGroupAcronym(part.groupId, mandate)}
              </span>
              <span className="structure-part-count">{part.count}</span>
            </button>
          ))}
      </div>

      {community.nationalSplinter && (
        <div className="structure-community-note">
          A national delegation on its own: the{" "}
          <strong>{community.nationalSplinter}</strong> members of{" "}
          {getGroupAcronym(community.dominantGroup, mandate)}, separated from the
          rest of their group.
        </div>
      )}
      {mixed && (
        <div className="structure-community-note">
          The algorithm could not tell these groups apart. They vote together
          often enough to read as one bloc.
        </div>
      )}
    </div>
  );
}

/** A clickable MEP row with one headline figure on the right. */
function MepRow({ rank, mep, sub, figure, figureClass, figureSub, onClick }) {
  return (
    <button type="button" className="structure-row" onClick={onClick}>
      <span className="structure-row-rank">{rank}</span>
      <span className="structure-row-main">
        <span className="structure-row-name" title={mep.label}>
          {mep.label}
        </span>
        <span className="structure-row-sub">{sub}</span>
      </span>
      <span className={`structure-row-figure ${figureClass || ""}`}>
        {figure}
        {figureSub && (
          <span className="structure-row-figure-sub">{figureSub}</span>
        )}
      </span>
    </button>
  );
}

export default function StructurePanel({
  graphData,
  mandate,
  onSelectNode,
  onSelectGroup,
}) {
  const [ready, setReady] = useState(false);
  const [showAllMismatches, setShowAllMismatches] = useState(false);
  const [showAllBridges, setShowAllBridges] = useState(false);
  const [includeNonAttached, setIncludeNonAttached] = useState(false);

  // Roughly 150 ms of synchronous work on the full 696-MEP network, so it is
  // not spent until the tab is opened. Deferring by a tick lets the panel paint
  // its heading and its method note first, so opening the tab does not look
  // like a hang.
  useEffect(() => {
    if (ready) return undefined;
    const id = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(id);
  }, [ready]);

  // Memoised twice over: by useMemo here and by a WeakMap keyed on graphData in
  // the library, so switching away and back is free.
  const analysis = useMemo(
    () => (ready ? getStructureAnalysis(graphData) : null),
    [ready, graphData]
  );

  const bridges = useMemo(() => {
    if (!analysis || !analysis.bridges) return [];
    return includeNonAttached
      ? analysis.bridges
      : analysis.bridges.filter((row) => !row.isNonAttached);
  }, [analysis, includeNonAttached]);

  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    return null;
  }

  const selectMep = (id) => {
    if (!onSelectNode) return;
    const node = graphData.nodeMap ? graphData.nodeMap.get(id) : null;
    if (node) onSelectNode(node);
  };

  const crossers = bridges.filter((row) => row.gap < 0);
  const mismatchLimit = showAllMismatches ? EXPANDED_ROWS : PREVIEW_ROWS;
  const bridgeLimit = showAllBridges ? EXPANDED_ROWS : PREVIEW_ROWS;

  // The panel owns a whole tab, so there is no collapse control: opening the
  // tab is the act that asks for the analysis.
  return (
    <div className="structure-panel">
      <h3 className="structure-title">Structure</h3>
      <div className="structure-description">
        What the voting record looks like to an algorithm that has never heard of
        a political group.
      </div>

      <div>
        {!ready && (
          <div className="structure-status">Analysing the network…</div>
        )}
        {ready && !analysis && (
          <div className="structure-status">
            This network is too small to partition.
          </div>
        )}

        {analysis && (
          <>
            {/* ---------------- Task 1: communities vs groups ------------- */}
            <div className="structure-section">
              <div className="structure-section-label">
                Communities the votes alone produce
              </div>
              <div className="structure-section-lede">
                Louvain community detection over the agreement scores. Nothing in
                the input says who sits with whom.
              </div>

              <div className="structure-method">
                <strong>Before running:</strong> every MEP has voted with every
                other, so this graph is complete —{" "}
                <span className="structure-method-figure">
                  {analysis.preprocessing.inputEdges.toLocaleString()}
                </span>{" "}
                pairs, none weaker than{" "}
                <span className="structure-method-figure">
                  {pct(analysis.preprocessing.minInputWeight)}
                </span>
                . To give the algorithm anything to separate, each MEP keeps
                only their{" "}
                <span className="structure-method-figure">
                  {analysis.preprocessing.k}
                </span>{" "}
                strongest partners, and weights count as excess over 50%.
                {analysis.naive && (
                  <>
                    {" "}
                    Skip that and the same algorithm returns{" "}
                    <span className="structure-method-figure">
                      {analysis.naive.communityCount}
                    </span>{" "}
                    blocs at modularity{" "}
                    <span className="structure-method-figure">
                      {analysis.naive.modularity.toFixed(2)}
                    </span>
                    , the largest holding{" "}
                    <span className="structure-method-figure">
                      {pct0(analysis.naive.largestShare)}
                    </span>{" "}
                    of Parliament.
                  </>
                )}
              </div>

              <div className="structure-headline">
                <div className="structure-headline-item">
                  <div className="structure-headline-value">
                    {analysis.communityCount}
                  </div>
                  <div className="structure-headline-label">
                    communities found
                  </div>
                </div>
                <div
                  className="structure-headline-item"
                  title="Share of MEPs whose community is dominated by their own political group"
                >
                  <div className="structure-headline-value">
                    {pct0(analysis.concordantShare)}
                  </div>
                  <div className="structure-headline-label">
                    land with their own group
                  </div>
                </div>
                <div
                  className="structure-headline-item"
                  title={`Modularity ${analysis.modularity.toFixed(3)}. Adjusted Rand Index against the political groups: 0 would be chance, 1 an exact match.`}
                >
                  <div className="structure-headline-value">
                    {analysis.agreement.ari.toFixed(2)}
                  </div>
                  <div className="structure-headline-label">
                    match with the groups (ARI)
                  </div>
                </div>
              </div>

              <div className="structure-communities">
                {analysis.communities.map((community) => (
                  <CommunityRow
                    key={community.id}
                    community={community}
                    mandate={mandate}
                    onSelectGroup={onSelectGroup}
                  />
                ))}
              </div>
            </div>

            {/* ---------------- Task 1b: the disagreements ---------------- */}
            {analysis.mismatched.length > 0 && (
              <div className="structure-section">
                <div className="structure-section-label">
                  Where it disagrees with the seating plan
                </div>
                <div className="structure-section-lede">
                  {analysis.mismatched.length} MEPs were sorted into a community
                  another group owns. The figure is how much more they agree with
                  that group than with their own.
                </div>
                <div className="structure-rows">
                  {analysis.mismatched.slice(0, mismatchLimit).map((mep, i) => (
                    <MepRow
                      key={mep.id}
                      rank={i + 1}
                      mep={mep}
                      onClick={() => selectMep(mep.id)}
                      sub={
                        <>
                          <GroupChip groupId={mep.groupId} mandate={mandate} />
                          <span>→</span>
                          <GroupChip groupId={mep.hostGroup} mandate={mandate} />
                          {mep.country ? <span>· {mep.country}</span> : null}
                        </>
                      }
                      figure={mep.delta === null ? "—" : pp(mep.delta)}
                      figureSub={
                        mep.ownScore === null || mep.hostScore === null
                          ? null
                          : `${pct(mep.ownScore)} → ${pct(mep.hostScore)}`
                      }
                    />
                  ))}
                </div>
                {analysis.mismatched.length > PREVIEW_ROWS && (
                  <button
                    type="button"
                    className="structure-toggle"
                    onClick={() => setShowAllMismatches(!showAllMismatches)}
                  >
                    {showAllMismatches
                      ? "Show fewer"
                      : `Show ${Math.min(
                          EXPANDED_ROWS,
                          analysis.mismatched.length
                        )} of ${analysis.mismatched.length}`}
                  </button>
                )}
                {showAllMismatches &&
                  analysis.mismatched.length > EXPANDED_ROWS && (
                    <div className="structure-more">
                      {analysis.mismatched.length - EXPANDED_ROWS} more not shown.
                    </div>
                  )}
              </div>
            )}

            {/* ---------------- Task 2: bridges --------------------------- */}
            {bridges.length > 0 && (
              <div className="structure-section">
                <div className="structure-section-label">
                  MEPs between blocs
                </div>
                <div className="structure-section-lede">
                  Ranked by how much closer an MEP is to their own group than to
                  the nearest other one. A negative figure means their closest
                  group is not the one they sit with.
                </div>

                <div className="structure-method">
                  <strong>Measure:</strong> own-group agreement minus
                  nearest-other-group agreement, averaged over every pair of
                  MEPs in the term. Betweenness centrality is not used here:
                  where every MEP has voted with every other, every shortest path
                  is one hop and every betweenness score is zero.
                </div>

                <div className="structure-headline">
                  <div className="structure-headline-item">
                    <div className="structure-headline-value">
                      {crossers.length}
                    </div>
                    <div className="structure-headline-label">
                      closer to another group
                    </div>
                  </div>
                  <div
                    className="structure-headline-item"
                    title="The narrowest own-group advantage among MEPs who are still closest to their own group"
                  >
                    <div className="structure-headline-value">
                      {bridges.length > crossers.length
                        ? pp(bridges[crossers.length].gap)
                        : "—"}
                    </div>
                    <div className="structure-headline-label">
                      narrowest margin held
                    </div>
                  </div>
                  <div
                    className="structure-headline-item"
                    title="Total MEPs measured in this ranking"
                  >
                    <div className="structure-headline-value">
                      {bridges.length}
                    </div>
                    <div className="structure-headline-label">MEPs ranked</div>
                  </div>
                </div>

                <div className="structure-rows">
                  {bridges.slice(0, bridgeLimit).map((mep, i) => (
                    <MepRow
                      key={mep.id}
                      rank={i + 1}
                      mep={mep}
                      onClick={() => selectMep(mep.id)}
                      sub={
                        <>
                          <GroupChip groupId={mep.groupId} mandate={mandate} />
                          <span>· nearest</span>
                          <GroupChip
                            groupId={mep.bestOtherGroup}
                            mandate={mandate}
                          />
                        </>
                      }
                      figure={pp(mep.gap)}
                      figureClass={
                        mep.gap < 0
                          ? "structure-figure-negative"
                          : "structure-figure-positive"
                      }
                      figureSub={`${pct(mep.ownScore)} vs ${pct(
                        mep.bestOtherScore
                      )}`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  className="structure-toggle"
                  onClick={() => setShowAllBridges(!showAllBridges)}
                >
                  {showAllBridges ? "Show fewer" : `Show ${EXPANDED_ROWS}`}
                </button>
                {" · "}
                <button
                  type="button"
                  className="structure-toggle"
                  onClick={() => setIncludeNonAttached(!includeNonAttached)}
                  title="Non-attached MEPs have no group to be measured against — their 'own group' is just the other unaffiliated members, who have nothing in common. They are excluded by default."
                >
                  {includeNonAttached
                    ? "Exclude non-attached"
                    : "Include non-attached"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
