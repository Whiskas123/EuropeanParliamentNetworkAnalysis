"use client";

import { useEffect, useMemo, useState } from "react";
import { getGroupAcronym, getGroupDisplayName } from "../lib/utils.js";
import "../styles/deviation.scss";

/**
 * How far one MEP sits from their own group, per political group.
 *
 * This replaces the absolute agreement dials for a reason. "Catarina Martins
 * votes with the EPP 72.7% on women's rights" is not comparable with the 56.6%
 * shown for Jonas Sjostedt, because the two sat almost none of the same votes:
 * term 10's 176 women's rights votes fall on five sitting days in six debates,
 * she was present for the two Galvez reports where the EPP largely voted with
 * the left, he was present for the Vesligaj report which split the house, and
 * they share 3 of the 176. Both served the full term. Every one of their
 * group's members who voted on 170+ of the 176 lands between 61.6% and 63.4%;
 * the ones under 120 votes span 56.5% to 72.7%. The variation is attendance.
 *
 * A deviation cancels that out. It compares an MEP only with the peers who
 * were in the room with them, vote by vote, so a consensual vote lifts everyone
 * present equally and drops out. Across those same 41 MEPs the spread falls
 * from 16.1 points to 2.3.
 *
 * What is lost is the absolute reading: this panel cannot tell you an MEP votes
 * with the EPP 73% of the time, only that they are 1.0 points more EPP-leaning
 * than their own group was over the same votes. That is a deliberate trade -
 * the absolute number was not comparable between two MEPs, and it read as
 * though it were.
 *
 * See `pipeline/deviations.py` for the measure and for why the group used here
 * is the one the MEP sat in at the time of each vote rather than the one the
 * canvas colours them by.
 */

// The published file per term, fetched at most once each. Held as the in-flight
// promise so several panels asking at the same moment share one request.
const deviationPromises = {};

function loadDeviations(mandate) {
  if (deviationPromises[mandate] === undefined) {
    deviationPromises[mandate] = fetch(
      `/data/precomputed/mep_deviations_${mandate}.json`
    )
      .then((response) => (response.ok ? response.json() : null))
      .catch((error) => {
        console.warn(`Deviations not available for mandate ${mandate}:`, error);
        return null;
      });
  }
  return deviationPromises[mandate];
}

// Points either side of centre that the bars span. Across all five terms the
// median deviation is 1.5 points and the 95th percentile 10.4, so this is set
// by the tail rather than the middle: at ±10 a twentieth of every bar drawn ran
// off the end, and a reader cannot tell a clipped bar from an extreme one. ±20
// leaves 1.3% off-scale, and those are drawn hatched rather than clipped
// silently. A typical bar being a stub is the finding, not a defect - most MEPs
// really do sit on their group's line.
//
// One scale for every view on purpose. Subject views are wider than the
// mandate-wide one (p95 10.6 against 6.4), so a per-view axis would fit each
// better, but the axis would then change under the reader when they switch the
// policy-area dropdown and two bars of equal length would mean different things.
const SCALE = 20;

// Below this many votes the panel adds a caution. Set where the noise starts to
// rival the signal rather than at a round number: the published median block
// rests on 252 votes, and 16% of blocks fall under this.
const THIN_SAMPLE = 100;

/**
 * The deviation file for a term, or null while loading and where none is
 * published. Callers use the null to keep showing the absolute dials, so a
 * deployment without the file behaves exactly as it did before.
 */
export function useDeviationFile(mandate) {
  // The term is held beside the file rather than cleared in the effect body, so
  // switching term reads as "not loaded yet" without a synchronous setState
  // that would cascade a render.
  const [loaded, setLoaded] = useState({ mandate: null, file: null });

  useEffect(() => {
    let live = true;
    loadDeviations(mandate).then((file) => {
      if (live) setLoaded({ mandate, file });
    });
    return () => {
      live = false;
    };
  }, [mandate]);

  return loaded.mandate === mandate ? loaded.file : null;
}

export default function GroupDeviation({
  mandate,
  selectedNode,
  subject = null,
  groupColors,
}) {
  const file = useDeviationFile(mandate);

  const entry = file?.meps?.[selectedNode?.id] ?? null;

  const block = useMemo(() => {
    if (!entry) return null;
    if (!subject) return entry.all;
    const index = (file.subjects || []).indexOf(subject);
    if (index === -1) return null;
    return entry.bySubject?.[String(index)] ?? null;
  }, [entry, subject, file]);

  const rows = useMemo(() => {
    if (!block || !file) return [];
    return file.groups
      .map((groupId, i) => ({ groupId, value: block.dev[i] }))
      .filter((row) => typeof row.value === "number")
      .sort((a, b) => b.value - a.value);
  }, [block, file]);

  // A policy area where nobody could be measured is not the same failure as an
  // MEP who was absent from one, and the empty state has to say which it is.
  const subjectIsUnmeasurable = useMemo(() => {
    if (!file || !subject) return false;
    const index = (file.subjects || []).indexOf(subject);
    if (index === -1) return true;
    return (file.subjectCoverage?.[String(index)] ?? 0) === 0;
  }, [file, subject]);

  // The file is a progressive enhancement: an older deployment simply does not
  // have it, and the caller falls back to the absolute dials.
  if (!file) return null;

  const name = selectedNode?.label ?? "This MEP";
  const own = entry?.group ?? null;
  const ownName = own ? getGroupDisplayName(own, mandate) : null;
  // The deviation uses the group the MEP sat in when they voted; the canvas
  // colours them by the group they ended the term in. When those differ the
  // panel has to say so, or it silently contradicts the dot on screen.
  const labelled = entry?.labelGroup ?? null;
  const mismatch = own && labelled && own !== labelled;

  if (!entry || !block) {
    return (
      <div className="deviation">
        <p className="deviation-empty">
          {subjectIsUnmeasurable ? (
            // Nobody at all has a figure here, so blaming this MEP's attendance
            // would be a plain untruth — the policy area is the problem.
            <>
              Not shown for anyone. This policy area&rsquo;s votes are too few,
              or too lopsided, for any MEP to be measured against their group.
            </>
          ) : entry === null ? (
            <>
              Not shown. {name} either sat as Non-Attached for these votes —
              which is not a group, so there is nothing to differ from — or cast
              too few votes here to compare.
            </>
          ) : (
            <>
              Not shown. {name} cast fewer than {file.minVotes} votes here, and
              a deviation drawn from a handful of votes is those votes&rsquo;
              quirk rather than a position.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="deviation">
      {/* The section heading above this one already names the policy area and
          carries the collapse control, so this says only what that cannot:
          who is being compared with whom, and out of how much. */}
      <p className="deviation-lede">
        How <strong>{name}</strong> differs from {ownName}, over the{" "}
        {block.votes.toLocaleString()} vote{block.votes === 1 ? "" : "s"} they
        cast here. Zero means voting exactly like{" "}
        {getGroupAcronym(own, mandate)} did on those same votes.
      </p>
      {mismatch && (
        <p className="deviation-note">
          Compared with {getGroupAcronym(own, mandate)}, the group{" "}
          {name} sat in while casting these votes — not{" "}
          {getGroupAcronym(labelled, mandate)}, which they joined later and
          which colours their dot on the map.
        </p>
      )}

      <div className="deviation-rows">
        {rows.map(({ groupId, value }) => {
          const magnitude = Math.min(Math.abs(value), SCALE) / SCALE;
          const offScale = Math.abs(value) > SCALE;
          const width = magnitude * 50;
          return (
            <div className="deviation-row" key={groupId}>
              <span className="deviation-group">
                {getGroupAcronym(groupId, mandate)}
              </span>
              <span
                className="deviation-track"
                title={
                  // Against the MEP's own group the "than their group was"
                  // clause turns into "than EPP was, compared with EPP", which
                  // is not a sentence. Same number, different words.
                  groupId === own
                    ? `${name} voted with ${getGroupAcronym(own, mandate)} ` +
                      `${Math.abs(value).toFixed(1)} points ${
                        value >= 0 ? "more" : "less"
                      } than its other members did, over the same ` +
                      `${block.used.toLocaleString()} votes`
                    : `${name} is ${Math.abs(value).toFixed(1)} points ${
                        value >= 0 ? "closer to" : "further from"
                      } ${getGroupDisplayName(
                        groupId,
                        mandate
                      )} than ${getGroupAcronym(own, mandate)} was, over the ` +
                      `same ${block.used.toLocaleString()} votes`
                }
              >
                <span className="deviation-origin" />
                <span
                  className={`deviation-bar ${
                    offScale ? "deviation-bar--offscale" : ""
                  }`}
                  style={{
                    left: value >= 0 ? "50%" : `${50 - width}%`,
                    width: `${width}%`,
                    backgroundColor: groupColors?.get(groupId) || "#6B7C93",
                  }}
                />
              </span>
              <span className="deviation-value">
                {/* A figure that rounds to nothing gets no sign: "−0.0" reads
                    as a direction the measurement does not support. */}
                {Math.abs(value) < 0.05 ? "" : value > 0 ? "+" : "−"}
                {Math.abs(value).toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>

      {block.used < THIN_SAMPLE && (
        // The measure is a difference of two rates, so its noise falls as
        // 1/sqrt(votes). Down here a few points of lean is well inside what
        // the sample alone would produce, and the panel should say so rather
        // than let a long bar speak with a short bar's authority.
        <p className="deviation-note">
          Drawn from only {block.used.toLocaleString()} votes, so treat the
          size of these bars lightly — a policy area this small moves several
          points on which sittings {name} happened to attend.
        </p>
      )}

      <p className="deviation-scale-note">
        Bars run &minus;{SCALE} to +{SCALE} percentage points. A hatched end
        marks a figure past the edge of the scale.
      </p>
    </div>
  );
}
