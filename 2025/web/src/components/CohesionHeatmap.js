"use client";

import { getGroupAcronym, getGroupDisplayName, getRedGreenColor } from "@/lib/utils";

export default function CohesionHeatmap({ intergroupCohesion, mandate }) {
  if (!intergroupCohesion) return null;

  return (
    <div style={{ marginBottom: "30px" }}>
      <h3
        style={{
          margin: "0 0 15px 0",
          fontSize: "16px",
          fontWeight: "600",
          color: "#333",
        }}
      >
        Intergroup Cohesion Score
      </h3>
      <div
        style={{
          borderRadius: "8px",
          border: "1px solid #e0e0e0",
          backgroundColor: "#fff",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ padding: "8px" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: "1px",
              fontSize: "10px",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    position: "sticky",
                    left: 0,
                    backgroundColor: "#f8f9fa",
                    padding: "8px 6px",
                    border: "none",
                    textAlign: "right",
                    fontWeight: "600",
                    fontSize: "10px",
                    color: "#333",
                    zIndex: 10,
                    minWidth: "80px",
                  }}
                ></th>
                {intergroupCohesion.groups.map((group) => {
                  const groupColor =
                    intergroupCohesion.groupColors?.get(group) || "#CCCCCC";
                  return (
                    <th
                      key={group}
                      style={{
                        padding: "4px 2px",
                        border: "none",
                        textAlign: "center",
                        fontWeight: "600",
                        fontSize: "9px",
                        color: "#333",
                        minWidth: "40px",
                        maxWidth: "50px",
                      }}
                      title={getGroupDisplayName(group, mandate)}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                          height: "100%",
                        }}
                      >
                        <span>{getGroupAcronym(group, mandate)}</span>
                        <span
                          style={{
                            display: "inline-block",
                            width: "8px",
                            height: "8px",
                            backgroundColor: groupColor,
                            borderRadius: "2px",
                            flexShrink: 0,
                          }}
                        />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {intergroupCohesion.groups.map((group1, i) => (
                <tr key={group1}>
                  <td
                    style={{
                      position: "sticky",
                      left: 0,
                      backgroundColor: "#f8f9fa",
                      padding: "6px 4px",
                      border: "none",
                      fontWeight: "600",
                      fontSize: "9px",
                      textAlign: "right",
                      color: "#333",
                      zIndex: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: "4px",
                    }}
                  >
                    <span>{getGroupAcronym(group1, mandate)}</span>
                    {intergroupCohesion.groupColors?.get(group1) && (
                      <span
                        style={{
                          display: "inline-block",
                          width: "8px",
                          height: "8px",
                          backgroundColor:
                            intergroupCohesion.groupColors.get(group1),
                          borderRadius: "2px",
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </td>
                  {intergroupCohesion.matrix[i].map((score, j) => {
                    // Show only lower triangle (i >= j) - diagonal and below
                    if (i < j) {
                      return (
                        <td
                          key={j}
                          style={{
                            padding: 0,
                            border: "none",
                            backgroundColor: "transparent",
                          }}
                        />
                      );
                    }

                    // Handle NaN (no data) vs valid scores
                    if (isNaN(score)) {
                      return (
                        <td
                          key={j}
                          style={{
                            padding: "6px 4px",
                            border: "none",
                            backgroundColor: "#f0f0f0",
                            textAlign: "center",
                            fontSize: "9px",
                            fontWeight: "500",
                            color: "#999",
                            borderRadius: "3px",
                            cursor: "pointer",
                          }}
                          title={`${getGroupDisplayName(
                            group1,
                            mandate
                          )} - ${getGroupDisplayName(
                            intergroupCohesion.groups[j],
                            mandate
                          )}: No data`}
                        >
                          -
                        </td>
                      );
                    }

                    // Color scale: red-to-green colormap
                    const validScores = intergroupCohesion.matrix
                      .flat()
                      .filter((s) => !isNaN(s));
                    const maxScore =
                      validScores.length > 0 ? Math.max(...validScores) : 0;
                    const intensity = maxScore > 0 ? score / maxScore : 0;

                    const color = getRedGreenColor(intensity);
                    const bgColor = `rgb(${color.r}, ${color.g}, ${color.b})`;

                    // Determine text color based on luminance
                    const luminance =
                      (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) /
                      255;
                    const textColor = luminance > 0.5 ? "#000" : "#fff";

                    return (
                      <td
                        key={j}
                        style={{
                          padding: "6px 4px",
                          border: "none",
                          backgroundColor: bgColor,
                          textAlign: "center",
                          fontSize: "9px",
                          fontWeight: "500",
                          color: textColor,
                          borderRadius: "3px",
                          cursor: "pointer",
                          transition: "opacity 0.2s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = "0.8";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = "1";
                        }}
                        title={`${getGroupDisplayName(
                          group1,
                          mandate
                        )} - ${getGroupDisplayName(
                          intergroupCohesion.groups[j],
                          mandate
                        )}: ${(score * 100).toFixed(1)}%`}
                      >
                        {(score * 100).toFixed(1)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

