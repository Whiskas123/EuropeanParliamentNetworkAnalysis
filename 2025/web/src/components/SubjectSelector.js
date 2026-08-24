"use client";

import { useEffect, useState, useRef } from "react";
import { getSubjectEmoji } from "../lib/utils.js";
import "../styles/subject-counts.scss";

// The precomputed mandate files ship a subject list already filtered to subjects
// with MORE than 5 voting sessions. voting_sessions.json is unfiltered, so the
// same threshold has to be applied here to keep the option list identical.
// Verified equal (members, order and counts) for mandates 6-10.
const MIN_VOTING_SESSIONS = 5;

// Codepoint sort, not localeCompare: locale-independent so the option order is
// the same in every browser, and it reproduces the precomputed order exactly.
function byName(a, b) {
  if (a.name === b.name) return 0;
  return a.name < b.name ? -1 : 1;
}

export default function SubjectSelector({
  currentMandate,
  currentSubject,
  onSubjectChange,
  disabled = false, // Optional; no longer set by the app - country and subject can be combined
}) {
  const [subjects, setSubjects] = useState([]);
  const [totalSessions, setTotalSessions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    function commit(subjectList, total) {
      if (cancelled) return;
      setSubjects(subjectList);
      setTotalSessions(total);
      setLoading(false);
    }

    async function loadSubjects() {
      setLoading(true);
      try {
        // First try: voting_sessions.json (~4 KB) instead of the 16 MB
        // precomputed file, which was only ever read for the subject names.
        const sessionsResponse = await fetch("/data/voting_sessions.json");
        if (cancelled) return;
        if (sessionsResponse.ok) {
          const sessions = await sessionsResponse.json();
          if (cancelled) return;
          const forMandate = sessions?.[String(currentMandate)];
          const bySubject = forMandate?.bySubject;
          if (bySubject) {
            const subjectList = Object.entries(bySubject)
              .filter(([, count]) => count > MIN_VOTING_SESSIONS)
              .map(([name, votingSessions]) => ({ name, votingSessions }))
              .sort(byName);
            if (subjectList.length > 0) {
              commit(
                subjectList,
                typeof forMandate.total === "number" ? forMandate.total : null
              );
              return;
            }
          }
        }

        // Second try: the precomputed file (already filtered to >5 sessions)
        const precomputedResponse = await fetch(
          `/data/precomputed/mandate_${currentMandate}.json`
        );
        if (cancelled) return;
        if (precomputedResponse.ok) {
          const precomputed = await precomputedResponse.json();
          if (cancelled) return;
          if (precomputed.subjects && precomputed.subjects.length > 0) {
            const subjectList = precomputed.subjects.map((s) =>
              typeof s === "string"
                ? { name: s, votingSessions: null }
                : { name: s.name, votingSessions: s.votingSessions ?? null }
            );
            commit(
              subjectList,
              typeof precomputed.votingSessions?.total === "number"
                ? precomputed.votingSessions.total
                : null
            );
            return;
          }
        }

        // Fallback: load from data.json
        const response = await fetch(
          `/data/mandate_${currentMandate}/data.json`
        );
        if (cancelled) return;
        if (!response.ok) {
          commit([], null);
          return;
        }
        const data = await response.json();
        if (cancelled) return;

        // Get subjects from edgesBySubject
        if (data.edgesBySubject) {
          const subjectList = Object.keys(data.edgesBySubject)
            .map((name) => ({ name, votingSessions: null }))
            .sort(byName);
          commit(subjectList, null);
        } else {
          commit([], null);
        }
      } catch (error) {
        console.error("Error loading subjects:", error);
        commit([], null);
      }
    }

    loadSubjects();

    return () => {
      cancelled = true;
    };
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
      <div className="selector-dropdown subject-selector">
        <div className="selector-header">
          <span className="selector-title">Policy Area</span>
          <button className="selector-button" disabled>
            <span className="selector-value">Loading...</span>
          </button>
        </div>
      </div>
    );
  }

  const displayText = currentSubject
    ? `${getSubjectEmoji(currentSubject)} ${currentSubject}`
    : "All Policy Areas";

  // Bars are scaled against the busiest policy area of this term, so the
  // relative weight is readable at a glance without changing the figures.
  const maxSessions = subjects.reduce(
    (max, s) => (typeof s.votingSessions === "number" && s.votingSessions > max
      ? s.votingSessions
      : max),
    0
  );

  const selectedSessions = currentSubject
    ? subjects.find((s) => s.name === currentSubject)?.votingSessions ?? null
    : totalSessions;

  const buttonTitle = disabled
    ? "Clear country selection first"
    : typeof selectedSessions === "number"
      ? `${currentSubject || "All Policy Areas"} — ${selectedSessions} voting sessions`
      : "";

  function renderCount(votingSessions, { withBar }) {
    if (typeof votingSessions !== "number") return null;
    const width =
      withBar && maxSessions > 0
        ? `${Math.min(100, (votingSessions / maxSessions) * 100)}%`
        : null;
    return (
      <span className="subject-count">
        <span className="subject-count-value">{votingSessions}</span>
        {width !== null && (
          <span className="subject-count-bar">
            <span className="subject-count-bar-fill" style={{ width }} />
          </span>
        )}
      </span>
    );
  }

  return (
    <div
      className={`selector-dropdown subject-selector ${isOpen ? "open" : ""}`}
      ref={dropdownRef}
    >
      <div className="selector-header">
        <span className="selector-title">Policy Area</span>
        <button
          className={`selector-button ${disabled ? "disabled" : ""}`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          disabled={disabled}
          title={buttonTitle}
        >
          <span className="selector-value">{displayText}</span>
          {typeof selectedSessions === "number" && (
            <span className="subject-count-inline">{selectedSessions}</span>
          )}
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
            className={`selector-dropdown-item subject-option ${
              !currentSubject ? "active" : ""
            }`}
            onClick={() => {
              onSubjectChange(null);
              setIsOpen(false);
            }}
            title={
              typeof totalSessions === "number"
                ? `All Policy Areas — ${totalSessions} voting sessions`
                : ""
            }
          >
            <span className="subject-option-name">All Policy Areas</span>
            {renderCount(totalSessions, { withBar: false })}
          </button>
          {subjects.map((subject) => (
            <button
              key={subject.name}
              className={`selector-dropdown-item subject-option ${
                currentSubject === subject.name ? "active" : ""
              } ${disabled ? "disabled" : ""}`}
              onClick={() => {
                if (!disabled) {
                  onSubjectChange(subject.name);
                  setIsOpen(false);
                }
              }}
              disabled={disabled}
              title={
                disabled
                  ? "Clear country selection first"
                  : typeof subject.votingSessions === "number"
                    ? `${subject.name} — ${subject.votingSessions} voting sessions`
                    : subject.name
              }
            >
              <span className="subject-option-name">
                {getSubjectEmoji(subject.name)} {subject.name}
              </span>
              {renderCount(subject.votingSessions, { withBar: true })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
