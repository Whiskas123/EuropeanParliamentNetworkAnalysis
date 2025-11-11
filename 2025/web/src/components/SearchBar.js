"use client";

import { getCountryFlag, getGroupAcronym } from "../lib/utils";

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
        <div className="search-bar-container">
          <input
            type="text"
            placeholder="Search MEP by name..."
            value={searchQuery}
            autoFocus
            className="search-bar-input"
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
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchOpen(false);
                setSearchQuery("");
                setSearchResults([]);
              }
            }}
          />
          {searchResults.length > 0 && (
            <div className="search-bar-results">
              {searchResults.map((result) => (
                <div
                  key={result.id}
                  className="search-bar-result-item"
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
                >
                  <div className="search-bar-result-name">{result.label}</div>
                  <div className="search-bar-result-meta">
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
