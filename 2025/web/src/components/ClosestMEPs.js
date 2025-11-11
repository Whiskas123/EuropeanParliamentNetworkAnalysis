"use client";

import { getCountryFlag } from "../lib/utils";

export default function ClosestMEPs({ meps, onSelectMEP }) {
  if (!meps || meps.length === 0) return null;

  return (
    <div className="closest-meps">
      <h4 className="closest-meps-title">5 Closest MEPs</h4>
      <div className="closest-meps-list">
        {meps.map((mep, index) => (
          <div
            key={mep.id}
            className="closest-meps-item"
            onClick={() => {
              onSelectMEP({
                id: mep.id,
                label: mep.label,
                country: mep.country,
                groupId: mep.groupId,
              });
            }}
          >
            <div className="closest-meps-item-header">
              <div className="closest-meps-item-left">
                <span className="closest-meps-item-rank">#{index + 1}</span>
                <span className="closest-meps-item-name">{mep.label}</span>
              </div>
              {mep.country && (
                <span className="closest-meps-item-flag">
                  {getCountryFlag(mep.country)}
                </span>
              )}
            </div>
            <div className="closest-meps-item-info">
              {mep.groupId && (
                <>
                  <div
                    className="closest-meps-item-color"
                    style={{ backgroundColor: mep.color || "#CCCCCC" }}
                  />
                  <span>{mep.groupId}</span>
                </>
              )}
              {mep.edgeWeight !== undefined && (
                <span className="closest-meps-item-weight">
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
