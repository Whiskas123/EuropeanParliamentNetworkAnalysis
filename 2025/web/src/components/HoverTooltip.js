"use client";

import { getGroupAcronym, getCountryFlag } from "@/lib/utils";

export default function HoverTooltip({ node, position, mandate }) {
  if (!node) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: `${position.x + 10}px`,
        top: `${position.y - 10}px`,
        background: "rgba(0, 0, 0, 0.8)",
        color: "white",
        padding: "6px 10px",
        borderRadius: "4px",
        fontSize: "12px",
        pointerEvents: "none",
        zIndex: 1000,
        lineHeight: "1.4",
      }}
    >
      <div>{node.label}</div>
      {node.groupId && (
        <div
          style={{
            fontSize: "11px",
            opacity: 0.9,
            marginTop: "2px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span>{getGroupAcronym(node.groupId, mandate)}</span>
          {node.country && (
            <span style={{ fontSize: "12px" }}>
              / {getCountryFlag(node.country)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

