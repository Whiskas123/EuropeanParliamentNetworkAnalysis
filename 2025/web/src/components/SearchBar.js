"use client";

import { getCountryFlag, getGroupAcronym } from "../lib/utils.js";

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
            placeholder="Search MEP by name or country..."
            value={searchQuery}
            autoFocus
            className="search-bar-input"
            onChange={(e) => {
              const query = e.target.value;
              setSearchQuery(query);
              if (query.trim() && graphData) {
                const queryLower = query.toLowerCase().trim();

                // First, try to match by country name (exact or partial match)
                const countryMatches = graphData.nodes.filter((node) => {
                  if (!node.country) return false;
                  return node.country.toLowerCase().includes(queryLower);
                });

                // If we have country matches, show all MEPs from matching countries
                // Otherwise, search by MEP name
                let results;
                if (countryMatches.length > 0) {
                  // Show all MEPs from matching countries
                  results = countryMatches.map((node) => ({
                    id: node.id,
                    label: node.label,
                    country: node.country,
                    groupId: node.groupId,
                  }));
                } else {
                  // Search by MEP name
                  results = graphData.nodes
                    .filter((node) =>
                      node.label.toLowerCase().includes(queryLower)
                    )
                    .slice(0, 10)
                    .map((node) => ({
                      id: node.id,
                      label: node.label,
                      country: node.country,
                      groupId: node.groupId,
                    }));
                }

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
          {searchQuery.trim() && (
            <div className="search-bar-results">
              {searchResults.length > 0 ? (
                searchResults.map((result) => (
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
                          <span>
                            {getGroupAcronym(result.groupId, mandate)}
                          </span>
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
                ))
              ) : (
                <div className="search-bar-result-item search-bar-no-results">
                  <div className="search-bar-result-name">No results found</div>
                  <div className="search-bar-result-meta">
                    Try searching by name or country
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
