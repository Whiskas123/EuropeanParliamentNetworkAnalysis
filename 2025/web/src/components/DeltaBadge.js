"use client";

import { getDelta } from "../lib/utils.js";

/**
 * How far the current view sits from its baseline, in percentage points.
 *
 * Renders nothing at all when there is no baseline to compare against — a
 * missing comparison should leave the layout exactly as it was, not leave a
 * gap or an em dash behind.
 *
 * @param {number} score - the figure shown next to this badge, on [0, 1]
 * @param {number} baseline - the same figure with one filter removed
 * @param {string} label - what the baseline is, for the tooltip ("Poland, all policy areas")
 * @param {string} what - what is being measured, for the tooltip ("Group cohesion")
 */
export default function DeltaBadge({ score, baseline, label, what = "" }) {
  const delta = getDelta(score, baseline);
  if (!delta) return null;

  const direction =
    delta.direction > 0 ? "up" : delta.direction < 0 ? "down" : "flat";

  const title =
    delta.direction === 0
      ? `${what} is unchanged from ${label} (${(baseline * 100).toFixed(1)}%)`
      : `${what} is ${Math.abs(delta.points).toFixed(1)} points ${
          delta.direction > 0 ? "higher" : "lower"
        } than ${label} (${(baseline * 100).toFixed(1)}%)`;

  return (
    <span className={`delta-badge delta-badge--${direction}`} title={title}>
      {delta.text}
      <span className="delta-badge-unit">pp</span>
    </span>
  );
}
