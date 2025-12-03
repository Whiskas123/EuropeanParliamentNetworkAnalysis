"use client";

import { useEffect, useRef } from "react";
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
  const searchBarRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        searchOpen &&
        searchBarRef.current &&
        !searchBarRef.current.contains(event.target) &&
        !event.target.closest(".sidebar-search-button")
      ) {
        setSearchOpen(false);
        setSearchQuery("");
        setSearchResults([]);
      }
    };

    if (searchOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [searchOpen, setSearchOpen, setSearchQuery, setSearchResults]);

  return (
    <>
      {searchOpen && (
        <div className="search-bar-container" ref={searchBarRef}>
          <input
            type="text"
            placeholder="Search MEP by name, country, or national party..."
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
                // Otherwise, try to match by national party
                let results;
                if (countryMatches.length > 0) {
                  // Show all MEPs from matching countries
                  results = countryMatches.map((node) => ({
                    id: node.id,
                    label: node.label,
                    country: node.country,
                    groupId: node.groupId,
                    partyNames: node.partyNames || [],
                  }));
                } else {
                  // Try to match by national party
                  const partyMatches = graphData.nodes.filter((node) => {
                    if (!node.partyNames || node.partyNames.length === 0) return false;
                    return node.partyNames.some((party) =>
                      party.toLowerCase().includes(queryLower)
                    );
                  });

                  if (partyMatches.length > 0) {
                    // Show all MEPs from matching parties
                    results = partyMatches.map((node) => ({
                      id: node.id,
                      label: node.label,
                      country: node.country,
                      groupId: node.groupId,
                      partyNames: node.partyNames || [],
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
                        partyNames: node.partyNames || [],
                      }));
                  }
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
                    Try searching by name, country, or national party
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
