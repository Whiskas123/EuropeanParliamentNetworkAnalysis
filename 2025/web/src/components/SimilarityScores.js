"use client";

import { getGroupAcronym } from "@/lib/utils";

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
    <div
      style={{
        marginTop: "30px",
        paddingTop: "20px",
        borderTop: "1px solid #e0e0e0",
      }}
    >
      <h4
        style={{
          margin: "0 0 15px 0",
          fontSize: "16px",
          fontWeight: "600",
          color: "#333",
        }}
      >
        Similarity Scores
      </h4>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "15px",
        }}
      >
        {groupSimilarityScore !== null && (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "500",
                  color: "#333",
                }}
              >
                Group Similarity Average
              </span>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#003399",
                }}
              >
                {(groupSimilarityScore.score * 100).toFixed(1)}%
              </span>
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "#666",
              }}
            >
              Average similarity with {groupSimilarityScore.count} MEP
              {groupSimilarityScore.count !== 1 ? "s" : ""} from the same group
            </div>
          </div>
        )}

        {countrySimilarityScore !== null && (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "500",
                  color: "#333",
                }}
              >
                Country Similarity Average
              </span>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#003399",
                }}
              >
                {(countrySimilarityScore.score * 100).toFixed(1)}%
              </span>
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "#666",
              }}
            >
              Average similarity with {countrySimilarityScore.count} MEP
              {countrySimilarityScore.count !== 1 ? "s" : ""} from the same
              country
            </div>
          </div>
        )}

        {agreementScores && agreementScores.length > 0 && (
          <div
            style={{
              marginTop: "30px",
              paddingTop: "20px",
              borderTop: "1px solid #e0e0e0",
            }}
          >
            <h4
              style={{
                margin: "0 0 15px 0",
                fontSize: "16px",
                fontWeight: "600",
                color: "#333",
              }}
            >
              Agreement Score with Groups
            </h4>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
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
                    <div key={item.groupId}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "4px",
                          fontSize: "11px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <div
                            style={{
                              width: "10px",
                              height: "10px",
                              backgroundColor: groupColor,
                              borderRadius: "2px",
                              border: "1px solid #ddd",
                            }}
                          />
                          <span style={{ fontWeight: "500" }}>
                            {getGroupAcronym(item.groupId, mandate)}
                          </span>
                        </div>
                        <span
                          style={{
                            color: "#003399",
                            fontWeight: "600",
                            minWidth: "50px",
                            textAlign: "right",
                          }}
                        >
                          {(item.score * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: "18px",
                          backgroundColor: "#f0f0f0",
                          borderRadius: "4px",
                          overflow: "hidden",
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            width: `${widthPercent}%`,
                            height: "100%",
                            backgroundColor: groupColor,
                            transition: "width 0.3s ease",
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

