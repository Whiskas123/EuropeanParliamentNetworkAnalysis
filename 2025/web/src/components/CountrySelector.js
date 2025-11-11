"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";

export default function CountrySelector({
  currentMandate,
  currentCountry,
  onCountryChange,
}) {
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="mandate-selector">
        <label htmlFor="country-select">Country: </label>
        <select id="country-select" className="mandate-select" disabled>
          <option>Loading...</option>
        </select>
      </div>
    );
  }

  return (
    <div className="mandate-selector">
      <label htmlFor="country-select">Country: </label>
      <select
        id="country-select"
        value={currentCountry || ""}
        onChange={(e) => onCountryChange(e.target.value || null)}
        className="mandate-select"
      >
        <option value="">All Countries</option>
        {countries.map((country) => (
          <option key={country} value={country}>
            {country}
          </option>
        ))}
      </select>
    </div>
  );
}
