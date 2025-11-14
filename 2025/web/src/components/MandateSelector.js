"use client";

import { useState, useRef, useEffect } from "react";

export default function MandateSelector({ currentMandate, onMandateChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const mandates = [
    { value: 6, label: "6th Term (2004 - 2009)" },
    { value: 7, label: "7th Term (2009 - 2014)" },
    { value: 8, label: "8th Term (2014 - 2019)" },
    { value: 9, label: "9th Term (2019 - 2024)" },
    { value: 10, label: "10th Term (2024 - )" },
  ];

  const currentMandateLabel =
    mandates.find((m) => m.value === currentMandate)?.label || "";

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

  return (
    <div className={`selector-dropdown ${isOpen ? "open" : ""}`} ref={dropdownRef}>
      <div className="selector-header">
        <span className="selector-title">Term</span>
        <button
          className="selector-button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
        >
          <span className="selector-value">{currentMandateLabel}</span>
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
          {mandates.map((mandate) => (
            <button
              key={mandate.value}
              className={`selector-dropdown-item ${
                currentMandate === mandate.value ? "active" : ""
              }`}
              onClick={() => {
                onMandateChange(mandate.value);
                setIsOpen(false);
              }}
            >
              {mandate.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
