"use client";

import { useEffect, useState, useRef } from "react";
import { getSubjectEmoji } from "../lib/utils.js";

export default function SubjectSelector({
  currentMandate,
  currentSubject,
  onSubjectChange,
  disabled = false, // Disable when country is selected
}) {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    async function loadSubjects() {
      try {
        // First try: load from precomputed data (faster, already filtered to >5 voting sessions)
        const precomputedResponse = await fetch(
          `/data/precomputed/mandate_${currentMandate}.json`
        );
        if (precomputedResponse.ok) {
          const precomputed = await precomputedResponse.json();
          if (precomputed.subjects && precomputed.subjects.length > 0) {
            // Extract subject names from precomputed subjects array
            const subjectList = precomputed.subjects.map((s) =>
              typeof s === "string" ? s : s.name
            );
            setSubjects(subjectList);
            setLoading(false);
            return;
          }
        }

        // Fallback: load from data.json
        const response = await fetch(
          `/data/mandate_${currentMandate}/data.json`
        );
        if (!response.ok) {
          setSubjects([]);
          setLoading(false);
          return;
        }
        const data = await response.json();
        
        // Get subjects from edgesBySubject
        if (data.edgesBySubject) {
          const subjectList = Object.keys(data.edgesBySubject).sort();
          setSubjects(subjectList);
        } else {
          setSubjects([]);
        }
        setLoading(false);
      } catch (error) {
        console.error("Error loading subjects:", error);
        setSubjects([]);
        setLoading(false);
      }
    }

    loadSubjects();
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
          <span className="selector-title">Subject</span>
          <button className="selector-button" disabled>
            <span className="selector-value">Loading...</span>
          </button>
        </div>
      </div>
    );
  }

  const displayText = currentSubject 
    ? `${getSubjectEmoji(currentSubject)} ${currentSubject}`
    : "All Subjects";

  return (
    <div className="selector-dropdown" ref={dropdownRef}>
      <div className="selector-header">
        <span className="selector-title">Subject</span>
        <button
          className={`selector-button ${disabled ? "disabled" : ""}`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          disabled={disabled}
        >
          <span className="selector-value">{displayText}</span>
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
              !currentSubject ? "active" : ""
            }`}
            onClick={() => {
              onSubjectChange(null);
              setIsOpen(false);
            }}
          >
            All Subjects
          </button>
          {subjects.map((subject) => (
            <button
              key={subject}
              className={`selector-dropdown-item ${
                currentSubject === subject ? "active" : ""
              } ${disabled ? "disabled" : ""}`}
              onClick={() => {
                if (!disabled) {
                  onSubjectChange(subject);
                  setIsOpen(false);
                }
              }}
              disabled={disabled}
              title={disabled ? "Clear country selection first" : ""}
            >
              {getSubjectEmoji(subject)} {subject}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

