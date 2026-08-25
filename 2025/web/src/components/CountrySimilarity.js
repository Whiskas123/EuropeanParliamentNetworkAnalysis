"use client";

import { useMemo, useState } from "react";
import { CountryFlag } from "../lib/utils.js";
import RadialGauge, { RadialGrid, RadialScaleNote } from "./RadialGauge";

// Countries have no colour of their own the way political groups do, so every
// dial takes one slate hue and the arc alone carries the magnitude. Borrowing
// the group palette here would imply a party each delegation does not have.
const COUNTRY_HUE = "#6B7C93";

export default function CountrySimilarity({
  countrySimilarity,
  graphData,
  onCountryClick,
  selectedSubject,
  baseline,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // In a country view this panel lists that one country, and its figure comes
  // from exactly the same pairs as the whole-Parliament figure for it, so the
  // delta is zero by construction. Showing "±0.0" there would imply something
  // was measured. Removing the *subject* filter does produce a real
  // comparison, which is kept.
  const comparable = Boolean(baseline) && baseline.comparing !== "country";

  const rows = useMemo(() => {
    if (!countrySimilarity || !graphData) return [];

    const counts = new Map();
    for (const node of graphData.nodes || []) {
      if (!node.country) continue;
      counts.set(node.country, (counts.get(node.country) || 0) + 1);
    }

    return countrySimilarity
      .filter(Boolean)
      .map((item) => ({ ...item, mepCount: counts.get(item.country) || 0 }))
      // The grid is read left to right, so rank has to live in the layout.
      .sort((a, b) => b.score - a.score);
  }, [countrySimilarity, graphData]);

  if (!graphData) return null;
  if (rows.length === 0) return null;

  // Clicking a country sets the country filter, which cannot be combined with
  // a policy area from here — the same rule the bar list enforced.
  const navigable = !selectedSubject && Boolean(onCountryClick);

  return (
    <div>
      <h3
        className="country-similarity-title collapsible-title"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span>Country Cohesion</span>
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
      </h3>
      <div className="country-similarity-description">
        Average voting agreement among MEPs from the same country, counting only
        those who took part in more than half the votes
        {comparable && (
          <span className="baseline-note">
            Change shown against {baseline.label}.
          </span>
        )}
      </div>
      <div className={`collapsible-content ${!isCollapsed ? "expanded" : ""}`}>
        <RadialScaleNote hasBaseline={comparable} />
        <RadialGrid min={76}>
          {rows.map((item) => (
            <RadialGauge
              key={item.country}
              value={item.score}
              baseline={
                comparable
                  ? baseline.scores?.country?.[item.country] ?? null
                  : null
              }
              color={COUNTRY_HUE}
              label={item.country}
              flag={<CountryFlag country={item.country} />}
              title={`${item.country} — ${(item.score * 100).toFixed(
                1
              )}% internal agreement across ${item.mepCount} MEP${
                item.mepCount === 1 ? "" : "s"
              }${navigable ? ". Click to open this delegation." : ""}`}
              what={`${item.country} cohesion`}
              baselineLabel={baseline?.label}
              sub={`${item.mepCount} MEP${item.mepCount === 1 ? "" : "s"}`}
              onClick={
                navigable ? () => onCountryClick(item.country) : undefined
              }
            />
          ))}
        </RadialGrid>
      </div>
    </div>
  );
}
