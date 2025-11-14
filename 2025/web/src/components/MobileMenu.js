"use client";

import { useState, useEffect, useRef } from "react";
import MandateSelector from "./MandateSelector";
import CountrySelector from "./CountrySelector";
import SubjectSelector from "./SubjectSelector";

export default function MobileMenu({
  mandate,
  onMandateChange,
  selectedCountry,
  onCountryChange,
  selectedSubject,
  onSubjectChange,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const containerRef = useRef(null);
  const buttonRef = useRef(null);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownStyle({
        top: `${rect.bottom + 8}px`,
        right: `${window.innerWidth - rect.right}px`,
      });
    }
  }, [isOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
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

  return (
    <div className="mobile-menu-container" ref={containerRef}>
      {/* Hamburger Button */}
      <button
        ref={buttonRef}
        className="mobile-menu-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
        aria-expanded={isOpen}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isOpen ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </>
          ) : (
            <>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </>
          )}
        </svg>
      </button>

      {/* Mobile Menu Dropdown */}
      <div
        className={`mobile-menu-dropdown ${isOpen ? "open" : ""}`}
        style={dropdownStyle}
      >
        <div className="mobile-menu-selectors">
          <MandateSelector
            currentMandate={mandate}
            onMandateChange={(newMandate) => {
              onMandateChange(newMandate);
              setIsOpen(false);
            }}
          />
          <CountrySelector
            currentMandate={mandate}
            currentCountry={selectedCountry}
            onCountryChange={(country) => {
              onCountryChange(country);
              setIsOpen(false);
            }}
            disabled={!!selectedSubject}
          />
          <SubjectSelector
            currentMandate={mandate}
            currentSubject={selectedSubject}
            onSubjectChange={(subject) => {
              onSubjectChange(subject);
              setIsOpen(false);
            }}
            disabled={!!selectedCountry}
          />
        </div>
      </div>
    </div>
  );
}

