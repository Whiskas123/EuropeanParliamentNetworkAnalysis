"use client";

import { getCountryFlag } from "@/lib/utils";

export default function ClosestMEPs({ meps, onSelectMEP }) {
  if (!meps || meps.length === 0) return null;

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
        5 Closest MEPs
      </h4>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {meps.map((mep, index) => (
          <div
            key={mep.id}
            style={{
              padding: "10px",
              backgroundColor: "#f9f9f9",
              borderRadius: "6px",
              border: "1px solid #e0e0e0",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f0f0f0";
              e.currentTarget.style.borderColor = "#003399";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#f9f9f9";
              e.currentTarget.style.borderColor = "#e0e0e0";
            }}
            onClick={() => {
              onSelectMEP({
                id: mep.id,
                label: mep.label,
                country: mep.country,
                groupId: mep.groupId,
              });
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#666",
                    minWidth: "20px",
                  }}
                >
                  #{index + 1}
                </span>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  {mep.label}
                </span>
              </div>
              {mep.country && (
                <span style={{ fontSize: "16px" }}>
                  {getCountryFlag(mep.country)}
                </span>
              )}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                color: "#666",
              }}
            >
              {mep.groupId && (
                <>
                  <div
                    style={{
                      width: "12px",
                      height: "12px",
                      backgroundColor: mep.color || "#CCCCCC",
                      borderRadius: "2px",
                      border: "1px solid #ddd",
                    }}
                  />
                  <span>{mep.groupId}</span>
                </>
              )}
              {mep.edgeWeight !== undefined && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontWeight: "500",
                    color: "#003399",
                  }}
                >
                  {(mep.edgeWeight * 100).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

