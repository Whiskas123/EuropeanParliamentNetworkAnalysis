"use client";

import { useEffect, useMemo, useState } from "react";
import SegmentedToggle from "./SegmentedToggle";
import "../styles/subject-topics.scss";

/**
 * What the selected policy area is actually made of.
 *
 * A subject was a count and a shape, with nothing saying which debates produced
 * either. For most subjects that is a small omission. For the ones a single
 * dossier dominates it is the whole story: term 10's Security and Defence is
 * 153 votes, 106 of them the white paper on European defence, cast on one day —
 * so the network is a portrait of that one debate, and nothing on screen said
 * so.
 *
 * ## Two views, because the rows do not aggregate on their own
 *
 * Documents map essentially one-to-one onto procedures — term 10's Foreign
 * Affairs has 147 of each — so there is no free grouping to fall back on. The
 * list is therefore documents, which is also the level a reader recognises:
 * "Gaza at breaking point" rather than "Third-country political situation".
 *
 * That works everywhere except Foreign Affairs, where the top eight dossiers
 * are only 27% of the subject against 57-97% elsewhere. Hence the second view.
 * It rolls up on geography where OEIL has it — 141 procedures onto 62 areas,
 * led by Ukraine and Russia — and on OEIL's subject codes where it does not.
 * The panel says which of the two it used rather than implying one, because
 * "Ukraine" and "Third-country political situation" are answers to different
 * questions.
 */

const SHOWN = 8;

function fmtDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

function span(row) {
  const from = fmtDate(row.from);
  if (!from) return null;
  return row.to && row.to !== row.from ? `${from} – ${fmtDate(row.to)}` : from;
}

export default function SubjectTopics({ mandate, selectedSubject }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState("dossier");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    if (!mandate || !selectedSubject) return undefined;
    fetch(`/data/precomputed/subject_topics_${mandate}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mandate, selectedSubject]);

  useEffect(() => {
    setExpanded(false);
    setView("dossier");
  }, [selectedSubject, mandate]);

  const subject = data?.subjects?.[selectedSubject] || null;

  const rows = useMemo(() => {
    if (!subject) return [];
    return view === "theme"
      ? subject.themes.map((t) => ({ key: t.label, label: t.label, votes: t.votes }))
      : subject.top.map((d) => ({
          key: d.code,
          label: d.title || d.code,
          votes: d.votes,
          code: d.code,
          by: d.by,
          when: span(d),
          untitled: !d.title,
        }));
  }, [subject, view]);

  if (!selectedSubject) return null;
  if (!data) return <p className="sb-status">Loading what this subject is made of…</p>;
  if (!subject || rows.length === 0) {
    return (
      <section className="sb-panel subject-topics">
        <div className="sb-panel-head">
          <h3 className="sb-panel-title">What&rsquo;s in this subject</h3>
        </div>
        <p className="sb-note sb-note--empty">
          No dossier breakdown for this subject.
        </p>
      </section>
    );
  }

  const shown = expanded ? rows : rows.slice(0, SHOWN);
  const max = rows[0]?.votes || 1;
  const covered = shown.reduce((a, r) => a + r.votes, 0);
  // Even a geography roll-up falls back to subject codes for the files OEIL
  // gives no area — the annual reports, mostly — so the label says so rather
  // than calling a list that contains "Common foreign and security policy" a
  // list of countries.
  const basis =
    subject.themeBasis === "geography"
      ? "country, or subject where none is recorded"
      : "OEIL subject";

  return (
    <section className="sb-panel subject-topics">
      <div className="sb-panel-head">
        <h3 className="sb-panel-title">What&rsquo;s in this subject</h3>
        {subject.themes.length > 1 ? (
          <SegmentedToggle
            value={view}
            onChange={setView}
            label="Group by"
            options={[
              { id: "dossier", text: "Dossiers", title: "One row per document voted" },
              { id: "theme", text: "Themes", title: `Rolled up by ${basis}` },
            ]}
          />
        ) : null}
      </div>

      <p className="sb-note subject-topics-summary">
        <b>{subject.votes.toLocaleString()}</b> votes ·{" "}
        <b>{subject.dossiers.toLocaleString()}</b> dossiers ·{" "}
        <b>{subject.days.toLocaleString()}</b> sitting days
        {view === "theme" ? <> · grouped by {basis}</> : null}
      </p>

      <ol className="subject-topics-list">
        {shown.map((row, i) => {
          const pct = subject.votes ? Math.round((row.votes / subject.votes) * 100) : 0;
          return (
            <li key={row.key}>
              <div className="st-row">
                <span className="st-n">{i + 1}</span>
                <span className={`st-label${row.untitled ? " st-label--code" : ""}`} title={row.label}>
                  {row.label}
                </span>
                <span className="st-votes">{row.votes}</span>
                <span className="st-pct">{pct}%</span>
              </div>
              <div className="st-under">
                <span className="st-bar" aria-hidden="true">
                  <span className="st-bar-fill" style={{ width: `${(row.votes / max) * 100}%` }} />
                </span>
                {view === "dossier" ? (
                  <span className="st-meta">
                    {row.code}
                    {row.by ? <> · {row.by}</> : null}
                    {row.when ? <> · {row.when}</> : null}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {rows.length > SHOWN ? (
        <button
          type="button"
          className="sb-collapse"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded
            ? "show fewer"
            : `show all ${rows.length} — these ${SHOWN} are ${Math.round((covered / subject.votes) * 100)}% of the subject`}
        </button>
      ) : null}
    </section>
  );
}
