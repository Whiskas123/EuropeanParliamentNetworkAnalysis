"use client";

import { useState } from "react";
import { CountryFlag } from "../lib/utils.js";
import DeltaBadge from "./DeltaBadge";

export default function CountrySimilarity({
  countrySimilarity,
  graphData,
  onCountryClick,
  selectedSubject,
  baseline,
}) {
  const [showTooltip, setShowTooltip] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  // In a country view this panel lists that one country, and its figure comes
  // from exactly the same pairs as the whole-Parliament figure for it, so the
  // delta is zero by construction. Showing "±0.0" there would imply something
  // was measured. Removing the *subject* filter does produce a real
  // comparison, which is kept.
  const comparable = Boolean(baseline) && baseline.comparing !== "country";

  if (!countrySimilarity || countrySimilarity.length === 0) return null;
  if (!graphData) return null;

  // Count MEPs per country
  const countryMEPCounts = new Map();
  graphData.nodes.forEach((node) => {
    if (node.country) {
      countryMEPCounts.set(
        node.country,
        (countryMEPCounts.get(node.country) || 0) + 1
      );
    }
  });

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
        Average voting agreement among MEPs from the same country
        {comparable && (
          <span className="baseline-note">
            Change shown against {baseline.label}.
          </span>
        )}
      </div>
      <div className={`collapsible-content ${!isCollapsed ? "expanded" : ""}`}>
        <div className="country-similarity-list">
          {countrySimilarity.map((item) => {
            const widthPercent = item.score * 100;
            const mepCount = countryMEPCounts.get(item.country) || 0;

            const handleCountryClick = () => {
              if (!selectedSubject && onCountryClick) {
                onCountryClick(item.country);
              }
            };

            const isDisabled = !!selectedSubject;

            return (
              <div
                key={item.country}
                className={`country-similarity-item ${
                  !isDisabled ? "clickable" : "disabled"
                }`}
                onClick={handleCountryClick}
              >
                <div className="country-similarity-header">
                  <span className="country-similarity-name">
                    <span className="country-similarity-flag">
                      <CountryFlag country={item.country} />
                    </span>
                    {item.country}
                  </span>
                  <span className="country-similarity-value">
                    <span
                      className="country-similarity-mep-count"
                      onMouseEnter={() => setShowTooltip(item.country)}
                      onMouseLeave={() => setShowTooltip(null)}
                    >
                      {mepCount} MEP{mepCount !== 1 ? "s" : ""}
                      {showTooltip === item.country && (
                        <span className="country-similarity-tooltip">
                          Considering only MEPs that participated in &gt;50% of
                          the votes
                        </span>
                      )}
                    </span>
                    {" · "}
                    {(item.score * 100).toFixed(1)}%
                    <DeltaBadge
                      score={item.score}
                      baseline={
                        comparable
                          ? baseline.scores?.country?.[item.country]
                          : null
                      }
                      label={baseline?.label}
                      what={`${item.country} cohesion`}
                    />
                  </span>
                </div>
                <div className="country-similarity-bar-container">
                  <div
                    className="country-similarity-bar"
                    style={{
                      width: `${widthPercent}%`,
                      backgroundColor: "#6B7C93",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
