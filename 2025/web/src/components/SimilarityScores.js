"use client";

import { getGroupAcronym } from "../lib/utils.js";

export default function SimilarityScores({
  groupSimilarityScore,
  countrySimilarityScore,
  agreementScores,
  graphData,
  mandate,
}) {
  if (
    groupSimilarityScore === null &&
    countrySimilarityScore === null &&
    (!agreementScores || agreementScores.length === 0)
  ) {
    return null;
  }

  return (
    <div className="similarity-scores">
      <h4 className="similarity-scores-title">Similarity Scores</h4>
      <div className="similarity-scores-list">
        {groupSimilarityScore !== null && (
          <div className="similarity-score-item">
            <div className="similarity-score-header">
              <span className="similarity-score-label">
                Group Similarity Average
              </span>
              <span className="similarity-score-value">
                {(groupSimilarityScore.score * 100).toFixed(1)}%
              </span>
            </div>
            <div className="similarity-score-description">
              Average similarity with {groupSimilarityScore.count} MEP
              {groupSimilarityScore.count !== 1 ? "s" : ""} from the same group
            </div>
          </div>
        )}

        {countrySimilarityScore !== null && (
          <div className="similarity-score-item">
            <div className="similarity-score-header">
              <span className="similarity-score-label">
                Country Similarity Average
              </span>
              <span className="similarity-score-value">
                {(countrySimilarityScore.score * 100).toFixed(1)}%
              </span>
            </div>
            <div className="similarity-score-description">
              Average similarity with {countrySimilarityScore.count} MEP
              {countrySimilarityScore.count !== 1 ? "s" : ""} from the same
              country
            </div>
          </div>
        )}

        {agreementScores && agreementScores.length > 0 && (
          <div className="similarity-scores-agreement">
            <h4 className="similarity-scores-agreement-title">
              Agreement Score with Groups
            </h4>
            <div className="similarity-scores-agreement-list">
              {(() => {
                // Filter out NonAttached
                const filteredScores = agreementScores.filter(
                  (item) => item.groupId !== "NonAttached"
                );
                const maxScore = Math.max(
                  ...filteredScores.map((i) => i.score)
                );
                
                return filteredScores.map((item) => {
                  // Get group color
                  const groupNode = graphData?.nodes.find(
                    (n) => n.groupId === item.groupId
                  );
                  const groupColor = groupNode?.color || "#CCCCCC";
                  const widthPercent =
                    maxScore > 0 ? (item.score / maxScore) * 100 : 0;

                  return (
                    <div
                      key={item.groupId}
                      className="similarity-scores-agreement-item"
                    >
                      <div className="similarity-scores-agreement-header">
                        <div className="similarity-scores-agreement-group">
                        <div
                            className="similarity-scores-agreement-color"
                            style={{ backgroundColor: groupColor }}
                          />
                          <span className="similarity-scores-agreement-name">
                            {getGroupAcronym(item.groupId, mandate)}
                          </span>
                        </div>
                        <span className="similarity-scores-agreement-value">
                          {(item.score * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="similarity-scores-agreement-bar-container">
                        <div
                          className="similarity-scores-agreement-bar"
                          style={{
                            width: `${widthPercent}%`,
                            backgroundColor: groupColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
