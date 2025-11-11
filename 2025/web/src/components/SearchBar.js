"use client";

import { getCountryFlag, getGroupAcronym } from "@/lib/utils";

export default function SearchBar({
  searchQuery,
  setSearchQuery,
  searchResults,
  setSearchResults,
  searchOpen,
  setSearchOpen,
  graphData,
  mandate,
  onSelectNode,
}) {
  return (
    <>
      {searchOpen && (
        <div style={{ position: "relative" }}>
          <input
            type="text"
            placeholder="Search MEP by name..."
            value={searchQuery}
            autoFocus
            onChange={(e) => {
              const query = e.target.value;
              setSearchQuery(query);
              if (query.trim() && graphData) {
                const results = graphData.nodes
                  .filter((node) =>
                    node.label.toLowerCase().includes(query.toLowerCase())
                  )
                  .slice(0, 10)
                  .map((node) => ({
                    id: node.id,
                    label: node.label,
                    country: node.country,
                    groupId: node.groupId,
                  }));
                setSearchResults(results);
              } else {
                setSearchResults([]);
              }
            }}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "4px",
              border: "none",
              fontSize: "14px",
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              color: "#333",
              boxSizing: "border-box",
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchOpen(false);
                setSearchQuery("");
                setSearchResults([]);
              }
            }}
          />
          {searchResults.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: "4px",
                backgroundColor: "white",
                borderRadius: "4px",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                maxHeight: "200px",
                overflowY: "auto",
                zIndex: 1000,
                border: "1px solid #ddd",
              }}
            >
              {searchResults.map((result) => (
                <div
                  key={result.id}
                  onClick={() => {
                    onSelectNode({
                      id: result.id,
                      label: result.label,
                      country: result.country,
                      groupId: result.groupId,
                    });
                    setSearchQuery("");
                    setSearchResults([]);
                    setSearchOpen(false);
                  }}
                  style={{
                    padding: "10px 12px",
                    cursor: "pointer",
                    borderBottom: "1px solid #f0f0f0",
                    transition: "background-color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#f5f5f5";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "white";
                  }}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#333",
                      marginBottom: "4px",
                    }}
                  >
                    {result.label}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#666",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {result.groupId && (
                      <>
                        <span>{getGroupAcronym(result.groupId, mandate)}</span>
                        {result.country && <span>•</span>}
                      </>
                    )}
                    {result.country && (
                      <span>
                        {getCountryFlag(result.country)} {result.country}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

