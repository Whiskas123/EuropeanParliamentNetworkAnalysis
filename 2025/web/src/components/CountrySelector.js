"use client";

import { useEffect, useState, useRef } from "react";
import { getCountryFlag } from "../lib/utils.js";

export default function CountrySelector({
  currentMandate,
  currentCountry,
  onCountryChange,
  disabled = false, // Disable when subject is selected
}) {
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    async function loadCountries() {
      setLoading(true);
      
      // Load from precomputed layout (has all countries, no filtering)
      try {
        const precomputedResponse = await fetch(
          `/data/precomputed/mandate_${currentMandate}.json`
        );
        if (precomputedResponse.ok) {
          const precomputed = await precomputedResponse.json();
          if (precomputed.nodes && precomputed.nodes.length > 0) {
            const countrySet = new Set();
            precomputed.nodes.forEach((node) => {
              if (node.country) {
                countrySet.add(node.country.trim());
              }
            });
            const sortedCountries = Array.from(countrySet).sort();
            setCountries(sortedCountries);
            setLoading(false);
            return;
          }
        }
        // If precomputed file doesn't exist or has no nodes, set empty list
        setCountries([]);
        setLoading(false);
      } catch (error) {
        console.error("Error loading countries from precomputed layout:", error);
        setCountries([]);
        setLoading(false);
      }
    }

    loadCountries();
  }, [currentMandate]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  if (loading) {
    return (
      <div className="selector-dropdown">
        <div className="selector-header">
          <span className="selector-title">Country</span>
          <button className="selector-button" disabled>
            <span className="selector-value">Loading...</span>
          </button>
        </div>
      </div>
    );
  }

  const displayFlag = currentCountry ? getCountryFlag(currentCountry) : "🇪🇺";
  const displayText = currentCountry || "All Countries";

  return (
    <div className={`selector-dropdown ${isOpen ? "open" : ""}`} ref={dropdownRef}>
      <div className="selector-header">
        <span className="selector-title">Country</span>
        <button
          className={`selector-button ${disabled ? "disabled" : ""}`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          disabled={disabled}
        >
          <span className="selector-value">
            <span className="selector-flag">{displayFlag}</span>
            {displayText}
          </span>
          <svg
            className={`selector-arrow ${isOpen ? "open" : ""}`}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 4.5L6 7.5L9 4.5" />
          </svg>
        </button>
      </div>
      {isOpen && (
        <div className="selector-dropdown-menu">
          <button
            className={`selector-dropdown-item ${
              !currentCountry ? "active" : ""
            }`}
            onClick={() => {
              onCountryChange(null);
              setIsOpen(false);
            }}
          >
            <span className="selector-flag">🇪🇺</span>
            All Countries
          </button>
          {countries.map((country) => (
            <button
              key={country}
              className={`selector-dropdown-item ${
                currentCountry === country ? "active" : ""
              } ${disabled ? "disabled" : ""}`}
              onClick={() => {
                if (!disabled) {
                  onCountryChange(country);
                  setIsOpen(false);
                }
              }}
              disabled={disabled}
              title={disabled ? "Clear subject selection first" : ""}
            >
              <span className="selector-flag">{getCountryFlag(country)}</span>
              {country}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
