"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadSVG } from "../../lib/networkExport.js";
import {
  badgeSectionElements,
  cohesionGaugeElements,
  elementSheetSVG,
  markSectionElements,
  mepGaugeElements,
  trendSectionElements,
} from "../../lib/elementExport.js";
import {
  readAgreement,
  readBySubject,
  useNormalisedAgreement,
} from "../../lib/normalisedAgreement.js";
import { precomputedUrl, TERMS, loadTrendSeries } from "../../lib/trends.js";
import { getBaseline } from "../../lib/dataLoader.js";
import { getGroupAcronym } from "../../lib/utils.js";
import "../../styles/export.scss";

/**
 * The workshop door: figures out of the site and onto a panel.
 *
 * Not linked from anywhere, and it is not a view of the data — it is a tool
 * for producing the SVG that gets laid out by hand somewhere else. The site's
 * own exports are whole sheets, designed to be read as they stand; these are
 * loose parts, and what makes them useful is that a run produces thirty of
 * them at once for a named list of people rather than one per visit to one
 * profile.
 *
 * ## Why a paste box and not a picker
 *
 * The list of MEPs a panel is about gets written somewhere else — in a draft,
 * in a script, in an email — long before anyone opens this. Retyping it into a
 * search field one name at a time is where the transcription errors come from,
 * and a picker cannot be pasted into. So the box takes the list as it already
 * exists, one per line, and does the matching.
 *
 * ## Why unmatched names are shown and never skipped
 *
 * A run that quietly exports eleven of your twelve MEPs is worse than one that
 * fails: the missing panel is discovered at the printer. Every name that did
 * not resolve is listed, with a reason where there is one, and so is every
 * element a matched MEP had no figures for. Nothing is dropped silently.
 */

/** One fetch per scope. The payload is large, so it is held while the page is. */
async function loadScope(mandate, subject) {
  const response = await fetch(precomputedUrl(mandate, null, subject));
  if (!response.ok) {
    throw new Error(`${response.status} for mandate ${mandate}`);
  }
  return response.json();
}

/**
 * Names are matched on their letters alone.
 *
 * The published labels are shouted surnames with the diacritics intact —
 * "Ľuboš BLAHA" — and a list written by a person is neither. Case, accents and
 * punctuation are all removed from both sides before comparing, so "Lubos
 * Blaha" finds him; word order is not, since two MEPs can share a surname and
 * guessing between them is not this tool's decision to make.
 */
function normaliseName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FAMILIES = [
  { id: "mep", label: "MEP dials", hint: "One sheet per named MEP." },
  {
    id: "cohesion",
    label: "Group and delegation dials",
    hint: "One sheet for the whole scope.",
  },
  {
    id: "trends",
    label: "History lines",
    hint: "Five terms. Slow: it reads every term's file.",
  },
  { id: "badges", label: "Change badges", hint: "Drawn from the dials above." },
  { id: "mark", label: "The constellation mark", hint: "Identity, not data." },
];

export default function ExportPage() {
  const [mandate, setMandate] = useState(10);
  const [subject, setSubject] = useState("");
  const [scope, setScope] = useState("house");
  const [names, setNames] = useState("");
  const [families, setFamilies] = useState(["mep", "cohesion"]);

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [status, setStatus] = useState(null);

  const file = useNormalisedAgreement(mandate);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError(null);
    setPayload(null);
    loadScope(mandate, subject || null)
      .then((data) => {
        if (live) {
          setPayload(data);
          setLoading(false);
        }
      })
      .catch((error) => {
        if (live) {
          setLoadError(error.message);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [mandate, subject]);

  const nodes = payload?.nodes ?? [];

  const groupColors = useMemo(() => {
    const colors = new Map();
    for (const node of nodes) {
      if (node.groupId && !colors.has(node.groupId)) {
        colors.set(node.groupId, node.color);
      }
    }
    return colors;
  }, [nodes]);

  // Built once per scope rather than per name, and keyed on the normalised
  // form so a lookup is one map hit. A duplicate label keeps the first node
  // and is reported at match time — see `resolved`.
  const index = useMemo(() => {
    const byName = new Map();
    const duplicates = new Set();
    for (const node of nodes) {
      const key = normaliseName(node.label);
      if (!key) continue;
      if (byName.has(key)) {
        duplicates.add(key);
        continue;
      }
      byName.set(key, node);
    }
    return { byName, duplicates };
  }, [nodes]);

  const wanted = useMemo(
    () =>
      names
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [names]
  );

  const resolved = useMemo(
    () =>
      wanted.map((raw) => {
        const key = normaliseName(raw);
        const node = index.byName.get(key) ?? null;
        return {
          raw,
          node,
          ambiguous: node ? index.duplicates.has(key) : false,
        };
      }),
    [wanted, index]
  );

  const matched = resolved.filter((entry) => entry.node);
  const unmatched = resolved.filter((entry) => !entry.node);

  const subjects = file?.subjects ?? [];

  const toggleFamily = (id) =>
    setFamilies((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id]
    );

  const slug = (value) =>
    normaliseName(value).replace(/\s+/g, "-").slice(0, 60) || "unnamed";

  const scopeLine = [
    `Term ${mandate}`,
    subject || "all policy areas",
    payload?.nodes ? `${payload.nodes.length} MEPs placed` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const handleExport = async () => {
    if (loading || !payload) return;
    setStatus({ state: "working", lines: [] });

    const sheets = [];
    const notes = [];
    const stem = `elements-t${mandate}${subject ? `-${slug(subject)}` : ""}`;

    if (families.includes("mep")) {
      if (!file) {
        notes.push("The normalised figures for this term had not loaded yet.");
      } else if (matched.length === 0) {
        notes.push("No MEP dials: no name in the box matched anyone.");
      }
      for (const entry of file ? matched : []) {
        const reading = readAgreement(file, entry.node.id, subject || null);
        const areas = subject ? [] : readBySubject(file, entry.node.id);
        const { sections, skipped } = mepGaugeElements({
          reading,
          areas,
          mandate,
          groupColors,
          scope,
        });
        if (sections.length === 0) {
          notes.push(`${entry.node.label}: ${skipped.join("; ")}`);
          continue;
        }
        if (skipped.length > 0) {
          notes.push(`${entry.node.label}: dropped ${skipped.join("; ")}`);
        }
        const group = reading?.group
          ? getGroupAcronym(reading.group, mandate)
          : entry.node.groupId;
        sheets.push([
          `mep-${slug(entry.node.label)}-t${mandate}${
            subject ? `-${slug(subject)}` : ""
          }.svg`,
          elementSheetSVG({
            title: `${entry.node.label} · ${group} · ${entry.node.country}`,
            subtitle: `${scopeLine} · ${
              scope === "country" ? "measured in their own country" : "measured house-wide"
            }`,
            sections,
          }),
        ]);
      }
    }

    if (families.includes("cohesion")) {
      const cohesion = payload.cohesionData || {};
      let baseline = null;
      try {
        baseline = await getBaseline(mandate, null, subject || null);
      } catch (error) {
        notes.push("No baseline for this scope, so the dials carry no notch.");
      }
      const { sections, skipped } = cohesionGaugeElements({
        intragroupCohesion: cohesion.intragroupCohesion || [],
        countrySimilarity: cohesion.countrySimilarity || [],
        baseline,
        groupColors,
        mandate,
      });
      if (sections.length === 0) {
        notes.push(`No cohesion dials: ${skipped.join("; ")}`);
      } else {
        if (skipped.length > 0) notes.push(`Cohesion: dropped ${skipped.join("; ")}`);
        sheets.push([
          `${stem}-cohesion.svg`,
          elementSheetSVG({
            title: "Group and delegation dials",
            subtitle: scopeLine,
            sections,
          }),
        ]);
      }

      if (families.includes("badges")) {
        // Built from the dials that were just drawn, so a badge lifted onto a
        // panel and the dial it came from cannot disagree.
        const pairs = (cohesion.intragroupCohesion || [])
          // Not a group; see the note in cohesionGaugeElements.
          .filter(
            (item) =>
              item && item.group !== "NonAttached" && Number.isFinite(item.score)
          )
          .map((item) => ({
            id: `cohesion-${getGroupAcronym(item.group, mandate)}`,
            name: getGroupAcronym(item.group, mandate),
            label: getGroupAcronym(item.group, mandate),
            value: item.score,
            // Plain numbers keyed by group; see the note in elementExport.js.
            baseline: baseline?.scores?.intragroup?.[item.group] ?? null,
          }))
          .filter((pair) => Number.isFinite(pair.baseline));
        const badges = badgeSectionElements({ pairs });
        if (badges.sections.length === 0) {
          notes.push(
            "No badges: nothing in this scope has a reference to be compared against."
          );
        } else {
          sheets.push([
            `${stem}-badges.svg`,
            elementSheetSVG({
              title: "Change badges",
              subtitle: scopeLine,
              sections: badges.sections,
            }),
          ]);
        }
      }
    } else if (families.includes("badges")) {
      notes.push("Badges need the group dials, so tick those too.");
    }

    if (families.includes("trends")) {
      try {
        const series = await loadTrendSeries({ subject: subject || null });
        const { sections, skipped } = trendSectionElements({ series, mandate });
        if (sections.length === 0) {
          notes.push(`No history lines: ${skipped.join("; ")}`);
        } else {
          if (skipped.length > 0) notes.push(`History: dropped ${skipped.join("; ")}`);
          sheets.push([
            `${stem}-history.svg`,
            elementSheetSVG({
              title: "Twenty years of agreement",
              subtitle: subject || "All policy areas",
              sections,
            }),
          ]);
        }
      } catch (error) {
        notes.push(`The five-term series could not be read: ${error.message}`);
      }
    }

    if (families.includes("mark")) {
      sheets.push([
        "constellation-mark.svg",
        elementSheetSVG({
          title: "The mark",
          subtitle: null,
          sections: markSectionElements().sections,
        }),
      ]);
    }

    if (sheets.length === 0) {
      setStatus({
        state: "failed",
        lines: notes.length > 0 ? notes : ["Nothing was selected to export."],
      });
      return;
    }

    // Staggered: Chrome and Safari drop the second of two downloads fired in
    // the same tick. Same interval the sidebar export uses.
    sheets.forEach(([name, svg], i) => setTimeout(() => downloadSVG(svg, name), i * 350));
    setStatus({
      state: notes.length > 0 ? "partial" : "done",
      lines: [`${sheets.length} file${sheets.length === 1 ? "" : "s"}.`, ...notes],
    });
  };

  return (
    <main className="xp">
      <header className="xp-head">
        <h1>Poster elements</h1>
        <p>
          Every mark below comes out as a named layer in one SVG per MEP, drawn
          by the same code as the site&rsquo;s print sheets. Open one in Figma
          and the layer list is the dial list.
        </p>
      </header>

      <section className="xp-panel">
        <h2>Scope</h2>
        <div className="xp-row">
          <label className="xp-field">
            <span>Term</span>
            <select
              value={mandate}
              onChange={(event) => setMandate(Number(event.target.value))}
            >
              {TERMS.map((term) => (
                <option key={term.mandate} value={term.mandate}>
                  {term.short} · {term.years}
                </option>
              ))}
            </select>
          </label>

          <label className="xp-field">
            <span>Policy area</span>
            <select
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            >
              <option value="">All policy areas</option>
              {subjects.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>

          <label className="xp-field">
            <span>Room</span>
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="house">House-wide</option>
              <option value="country">Their own country</option>
            </select>
          </label>
        </div>
        <p className="xp-note">
          {loading
            ? "Reading this scope…"
            : loadError
            ? `This scope could not be read: ${loadError}`
            : scopeLine}
        </p>
        {subject && (
          <p className="xp-note">
            A policy area replaces the per-area grid on an MEP sheet, since that
            grid is the comparison across areas.
          </p>
        )}
        {scope === "country" && (
          <p className="xp-note">
            In their own country the notch narrows too: each dial is this MEP
            against their national party-mates, not against the group whole.
          </p>
        )}
      </section>

      <section className="xp-panel">
        <h2>MEPs</h2>
        <p className="xp-lede">One name per line, as you already have them.</p>
        <textarea
          className="xp-names"
          rows={8}
          value={names}
          placeholder={"Ursula von der Leyen\nManon Aubry\nJordan Bardella"}
          onChange={(event) => setNames(event.target.value)}
          spellCheck={false}
        />
        {wanted.length > 0 && (
          <div className="xp-match">
            <p className="xp-note">
              {matched.length} of {wanted.length} matched.
            </p>
            {matched.length > 0 && (
              <ul className="xp-list">
                {matched.map((entry) => (
                  <li key={entry.raw}>
                    <span className="xp-ok">{entry.node.label}</span>
                    <span className="xp-dim">
                      {entry.node.groupId} · {entry.node.country}
                      {entry.ambiguous ? " · more than one MEP has this name" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {unmatched.length > 0 && (
              <ul className="xp-list">
                {unmatched.map((entry) => (
                  <li key={entry.raw}>
                    <span className="xp-bad">{entry.raw}</span>
                    <span className="xp-dim">
                      no one in this term matches that name
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="xp-panel">
        <h2>What to draw</h2>
        <div className="xp-families">
          {FAMILIES.map((family) => (
            <label key={family.id} className="xp-check">
              <input
                type="checkbox"
                checked={families.includes(family.id)}
                onChange={() => toggleFamily(family.id)}
              />
              <span>
                <b>{family.label}</b>
                <em>{family.hint}</em>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="xp-panel xp-panel--run">
        <button
          type="button"
          className="xp-go"
          onClick={handleExport}
          disabled={loading || Boolean(loadError) || status?.state === "working"}
        >
          {status?.state === "working" ? "Drawing…" : "Export"}
        </button>
        {status && status.lines.length > 0 && (
          <div className={`xp-status xp-status--${status.state}`}>
            {status.lines.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
