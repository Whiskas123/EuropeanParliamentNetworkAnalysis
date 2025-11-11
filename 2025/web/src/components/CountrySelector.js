"use client";

import { useEffect, useState, useRef } from "react";
import Papa from "papaparse";
import { getCountryFlag } from "../lib/utils";

export default function CountrySelector({
  currentMandate,
  currentCountry,
  onCountryChange,
}) {
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    async function loadCountries() {
      try {
        const response = await fetch(
          `/data/mandate_${currentMandate}/nodes.csv`
        );
        const text = await response.text();

        // Parse CSV using PapaParse
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const countrySet = new Set();
            results.data.forEach((row) => {
              if (row.Country) {
                countrySet.add(row.Country.trim());
              }
            });
            const sortedCountries = Array.from(countrySet).sort();
            setCountries(sortedCountries);
            setLoading(false);
          },
          error: (error) => {
            console.error("Error parsing CSV:", error);
            setCountries([]);
            setLoading(false);
          },
        });
      } catch (error) {
        console.error("Error loading countries:", error);
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
    <div className="selector-dropdown" ref={dropdownRef}>
      <div className="selector-header">
        <span className="selector-title">Country</span>
        <button
          className="selector-button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
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
              }`}
              onClick={() => {
                onCountryChange(country);
                setIsOpen(false);
              }}
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
