"use client";

import { getGroupAcronym, getCountryFlag } from "../lib/utils.js";

export default function HoverTooltip({ node, position, mandate }) {
  if (!node) return null;

  return (
    <div
      className="hover-tooltip"
      style={{
        left: `${position.x + 10}px`,
        top: `${position.y - 10}px`,
      }}
    >
      <div>{node.label}</div>
      {node.groupId && (
        <div className="hover-tooltip-meta">
          <span>{getGroupAcronym(node.groupId, mandate)}</span>
          {node.country && (
            <span className="hover-tooltip-flag">
              / {getCountryFlag(node.country)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
