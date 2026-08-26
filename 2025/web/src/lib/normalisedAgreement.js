"use client";

import { useEffect, useState } from "react";

/**
 * An MEP's agreement with each political group, normalised for who was in the
 * room, plus the same figure for their own delegation.
 *
 * ## What the number is
 *
 * A plain agreement percentage is not comparable between two MEPs unless they
 * sat the same votes, and on a lumpy policy area they routinely did not. Term
 * 10's 176 women's rights votes fall on five sitting days: Catarina Martins was
 * there for the two Galvez reports, where the EPP largely voted with the left,
 * and the raw figure calls her 72.7% aligned with the EPP; Jonas Sjostedt was
 * there for the Vesligaj report, which split the house, and his says 56.6%.
 * They share 3 of the 176 votes. Read as politics, that 16-point gap is an
 * invention of the calendar.
 *
 * So the published figure is normalised. For each vote an MEP cast, their
 * agreement with a group is set against what *their own group's* members in the
 * same room did with that same group, and the difference is averaged over their
 * votes; their group's own overall level is then added back so the result is
 * still a share rather than a difference. Read it as: where this MEP would sit
 * if they had voted on what their group as a whole voted on. Martins comes to
 * 63.5% and Sjostedt to 62.5%, and across all 41 of their group's members the
 * spread falls from 3.0 points to 0.4.
 *
 * ## Why the reference is their own group and not the whole House
 *
 * Both cancel the character of a vote, but only one cancels it completely. On a
 * consensual vote everybody sits near the same place, so subtracting either
 * reference leaves nothing. On a divisive one the House average sits in the
 * middle — it is mixing MEPs who voted with the group and MEPs who voted
 * against — while a left MEP sits at the bottom. Subtracting the House there
 * leaves a large negative number, so which votes an MEP attended still moves
 * their figure. Their own group moves the way they move, so it cancels on every
 * kind of vote. Measured across term 10, the House reference removes almost
 * none of the attendance artefact and their own group removes about half.
 *
 * ## What it costs
 *
 * A reference group, which the Non-Attached do not have. They are not a bloc,
 * so there is nothing to measure them against and this file has no figure for
 * them; the panel falls back to the raw percentages and says so rather than
 * showing them an empty profile.
 *
 * See `pipeline/deviations.py` for the measure itself, and for why the group
 * used is the one the MEP sat in at the time of each vote rather than the one
 * the canvas colours them by.
 */

// The published file per term, fetched at most once each. Held as the in-flight
// promise so several panels asking at the same moment share one request.
const filePromises = {};

function load(mandate) {
  if (filePromises[mandate] === undefined) {
    filePromises[mandate] = fetch(
      `/data/precomputed/mep_deviations_${mandate}.json`
    )
      .then((response) => (response.ok ? response.json() : null))
      .catch((error) => {
        console.warn(`Normalised agreement unavailable for ${mandate}:`, error);
        return null;
      });
  }
  return filePromises[mandate];
}

/**
 * The file for a term, or null while loading and where none is published.
 *
 * Callers use the null to fall back to the raw figures, so a deployment without
 * the file behaves exactly as it did before.
 */
export function useNormalisedAgreement(mandate) {
  // The term is held beside the file rather than cleared in the effect body, so
  // switching term reads as "not loaded yet" without a synchronous setState
  // that would cascade a render.
  const [loaded, setLoaded] = useState({ mandate: null, file: null });

  useEffect(() => {
    let live = true;
    load(mandate).then((file) => {
      if (live) setLoaded({ mandate, file });
    });
    return () => {
      live = false;
    };
  }, [mandate]);

  return loaded.mandate === mandate ? loaded.file : null;
}

/** The key a view is stored under: the whole term, or a policy area's index. */
function viewKey(file, subject) {
  if (!subject) return "all";
  const index = (file.subjects || []).indexOf(subject);
  return index === -1 ? null : String(index);
}

/**
 * Everything the panel needs about one MEP in one view, or a reason there is
 * nothing to show.
 *
 * The two failure modes are deliberately distinguished. A policy area nobody
 * could be measured in is not the same as an MEP who was absent from one, and
 * telling a reader the second when the first is true blames a person for a
 * property of the data.
 */
export function readAgreement(file, mepId, subject) {
  if (!file || !mepId) return null;

  const key = viewKey(file, subject);
  const entry = file.meps?.[mepId] ?? null;
  const coverage = key === null || key === "all"
    ? null
    : file.subjectCoverage?.[key] ?? 0;

  if (key === null || coverage === 0) {
    return { reason: "unmeasurable", entry };
  }
  if (!entry) {
    // Either they sat as Non-Attached, which is not a bloc to differ from, or
    // they cast too few votes anywhere in this term to be compared.
    return { reason: "no-group", entry: null };
  }

  const block = key === "all" ? entry.all : entry.bySubject?.[key] ?? null;
  if (!block) return { reason: "too-few-votes", entry };

  const group = entry.group ?? null;
  const groupLevels = file.levels?.[key]?.[group] ?? null;

  const groups = (file.groups || [])
    .map((groupId, index) => ({
      groupId,
      value: block.agr?.[index] ?? null,
      // Where this MEP's own group sits on the same dial. The gap between the
      // two is the deviation, which is why it is drawn as the baseline notch
      // rather than printed as a second number.
      level: groupLevels?.[index] ?? null,
    }))
    .filter((row) => typeof row.value === "number");

  const ownIndex = (file.groups || []).indexOf(group);

  return {
    reason: null,
    entry,
    block,
    group,
    labelGroup: entry.labelGroup ?? null,
    votes: block.votes ?? null,
    used: block.used ?? null,
    groups,
    own:
      ownIndex === -1
        ? null
        : {
            groupId: group,
            value: block.agr?.[ownIndex] ?? null,
            level: groupLevels?.[ownIndex] ?? null,
          },
    national:
      typeof block.nat === "number"
        ? {
            country: entry.country ?? null,
            value: block.nat,
            level: file.nationalLevels?.[key]?.[entry.country] ?? null,
          }
        : null,
  };
}

/**
 * One MEP's agreement with their own group across every policy area.
 *
 * Ordered by the caller, not here: a grid of dials carries its ranking in the
 * layout, so which end comes first is part of what the grid says and belongs
 * with the control that sets it.
 */
export function readBySubject(file, mepId) {
  if (!file || !mepId) return [];
  const entry = file.meps?.[mepId];
  if (!entry) return [];
  const group = entry.group;
  const ownIndex = (file.groups || []).indexOf(group);
  if (ownIndex === -1) return [];

  return (file.subjects || [])
    .map((subject, index) => {
      const block = entry.bySubject?.[String(index)];
      const value = block?.agr?.[ownIndex];
      if (typeof value !== "number") return null;
      return {
        subject,
        value,
        level: file.levels?.[String(index)]?.[group]?.[ownIndex] ?? null,
        votes: block.votes ?? null,
      };
    })
    .filter(Boolean);
}
