"use client";

import { useState } from "react";
import { getCountryFlag } from "../lib/utils.js";

export default function CountrySimilarity({
  countrySimilarity,
  graphData,
  onCountryClick,
}) {
  const [showTooltip, setShowTooltip] = useState(null);
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
      <h3 className="country-similarity-title">Country Average Similarity</h3>
      <div className="country-similarity-list">
        {countrySimilarity.map((item) => {
          const widthPercent = item.score * 100;
          const mepCount = countryMEPCounts.get(item.country) || 0;

          const handleCountryClick = () => {
            if (onCountryClick) {
              onCountryClick(item.country);
            }
          };

          return (
            <div
              key={item.country}
              className="country-similarity-item clickable"
              onClick={handleCountryClick}
            >
              <div className="country-similarity-header">
                <span className="country-similarity-name">
                  <span className="country-similarity-flag">
                    {getCountryFlag(item.country)}
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
                        Considering only MEPs that participated in &gt;50% of the votes
                      </span>
                    )}
                  </span>
                  {" · "}
                  {(item.score * 100).toFixed(1)}%
                </span>
              </div>
              <div className="country-similarity-bar-container">
                <div
                  className="country-similarity-bar"
                  style={{
                    width: `${widthPercent}%`,
                    backgroundColor: "#CCCCCC",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



