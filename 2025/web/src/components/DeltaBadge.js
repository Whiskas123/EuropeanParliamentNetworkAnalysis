"use client";

import { getDelta } from "../lib/utils.js";

/**
 * How far the current view sits from its baseline, in percentage points.
 *
 * Renders nothing at all when there is no baseline to compare against — a
 * missing comparison should leave the layout exactly as it was, not leave a
 * gap or an em dash behind.
 *
 * The badge sits against the figure it belongs to, so the tooltip does not
 * name that figure again: it only has to say what the badge is measured
 * against, and where that baseline sits.
 *
 * @param {number} score - the figure shown next to this badge, on [0, 1]
 * @param {number} baseline - the same figure with one filter removed
 * @param {string} label - what the baseline is ("the average EPP member's agreement with EPP")
 */
export default function DeltaBadge({ score, baseline, label }) {
  const delta = getDelta(score, baseline);
  if (!delta) return null;

  const direction =
    delta.direction > 0 ? "up" : delta.direction < 0 ? "down" : "flat";

  const against = `${label} (${(baseline * 100).toFixed(1)}%)`;
  const title =
    delta.direction === 0
      ? `Same as ${against}`
      : `${Math.abs(delta.points).toFixed(1)} pp ${
          delta.direction > 0 ? "above" : "below"
        } ${against}`;

  return (
    <span className={`delta-badge delta-badge--${direction}`} title={title}>
      {delta.text}
      <span className="delta-badge-unit">pp</span>
    </span>
  );
}
