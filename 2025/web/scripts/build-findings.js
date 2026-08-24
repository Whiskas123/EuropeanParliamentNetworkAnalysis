/**
 * Build public/data/findings.json — the ranked shortlist behind the
 * Findings panel.
 *
 * A single term holds 2,986 country x policy-area networks. The site can open
 * any of them but ranks none of them, so the only way to find the one worth
 * printing is to guess a combination and look. This file does the looking
 * once, offline, and leaves behind the handful of views where a number has
 * actually moved.
 *
 * "Moved" always means moved away from the same view with one filter removed —
 * the same comparison the sidebar already draws with <DeltaBadge>, read here
 * out of public/data/baselines.json:
 *
 *   delegations  Croatia x Women's Rights    vs  Croatia, all policy areas
 *   groups       PPE x Women's Rights        vs  PPE, all policy areas
 *   pairs        GUE/NGL|S&D x Sec. Defence  vs  GUE/NGL|S&D, all policy areas
 *   mavericks    an MEP's own group          vs  the group they agree with most
 *
 * Sample size travels with every row. Policy areas are wildly uneven — 1,049
 * voting sessions for Foreign Affairs against 12 for Transport and Tourism in
 * term 10 — and the thin ones produce the largest deltas in the dataset
 * precisely because they are thin. Nothing is filtered out on that basis: the
 * count is carried through so the panel can show it and the reader can judge.
 *
 * Reads only files already on disk — the precomputed layouts and
 * baselines.json. It never runs the pipeline and never opens the 305 MB
 * mandate_N/data.json, whose extra edges would not change these figures
 * anyway: cohesionData and agreementScores are computed from the full edge set
 * at precompute time.
 *
 *   node scripts/build-findings.js          (or: npm run findings)
 */

const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

const DATA_DIR = path.join(__dirname, "../public/data");
const PRECOMPUTED_DIR = path.join(DATA_DIR, "precomputed");
const BASELINES_PATH = path.join(DATA_DIR, "baselines.json");
const OUTPUT_PATH = path.join(DATA_DIR, "findings.json");

const MANDATES = [6, 7, 8, 9, 10];

// How many rows to keep per ranking per term. The panel shows a few dozen at
// most; keeping 60 leaves room to scroll without the file growing past a few
// hundred kilobytes, which is what makes it affordable to fetch once per page.
const TOP_N = 60;

// NonAttached is not a political group — it is the absence of one — so its
// "cohesion" is not a fact about a group, and it is left out of the group and
// pair rankings exactly as IntragroupCohesion.js already leaves it out of the
// sidebar. Mavericks are the one place it belongs, and there it is flagged.
const NOT_A_GROUP = "NonAttached";

const round = (n) =>
  typeof n === "number" && isFinite(n) ? Math.round(n * 10000) / 10000 : null;

/** The filenames dataLoader.js would request for these views. */
const countryKey = (country) => country.replace(/\s+/g, "_");
const subjectKey = (subject) => subject.replace(/[^a-zA-Z0-9]/g, "_");

function subjectFileName(mandate, subject) {
  return `mandate_${mandate}_subject_${subjectKey(subject)}.json`;
}

function countrySubjectFileName(mandate, country, subject) {
  return `mandate_${mandate}_${countryKey(country)}_subject_${subjectKey(
    subject
  )}.json`;
}

async function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(await fsPromises.readFile(filePath, "utf-8"));
  } catch (error) {
    console.log(`    ⚠️  ${path.basename(filePath)}: ${error.message}`);
    return null;
  }
}

/** How many voting sessions sit behind this policy area, per the view itself. */
function sessionsFor(payload, subject, fallback) {
  const listed =
    payload &&
    Array.isArray(payload.subjects) &&
    payload.subjects.find((s) => s && s.name === subject);
  if (listed && typeof listed.votingSessions === "number") {
    return listed.votingSessions;
  }
  const bySubject =
    payload && payload.votingSessions && payload.votingSessions.bySubject;
  if (bySubject && typeof bySubject[subject] === "number") {
    return bySubject[subject];
  }
  return typeof fallback === "number" ? fallback : null;
}

/** MEPs per group in one precomputed view. */
function groupCounts(payload) {
  const counts = {};
  (payload.nodes || []).forEach((node) => {
    if (node && node.groupId) {
      counts[node.groupId] = (counts[node.groupId] || 0) + 1;
    }
  });
  return counts;
}

/** Keep the largest movers, by whichever measure the ranking sorts on. */
function keepTop(rows, sortValue) {
  return rows
    .sort((a, b) => sortValue(b) - sortValue(a))
    .slice(0, TOP_N)
    .map((row) => ({ ...row, delta: round(row.score - row.baseline) }));
}

/**
 * (a) Delegations — a national delegation voting less like itself, or more
 * like itself, on one policy area than it does across all of them. The score
 * is that country's internal agreement in the filtered view; the baseline is
 * the same country with the policy-area filter lifted.
 */
async function buildDelegations(mandate, baselines, subjects) {
  const countries = Object.keys(baselines).filter((key) => key !== "_all");
  const rows = [];
  let missing = 0;

  for (const country of countries) {
    const baseline =
      (baselines[country] && baselines[country].country[country]) ??
      baselines._all.country[country];
    if (typeof baseline !== "number") continue;

    for (const subject of subjects) {
      const payload = await readJson(
        path.join(
          PRECOMPUTED_DIR,
          countrySubjectFileName(mandate, country, subject.name)
        )
      );
      if (!payload) {
        missing += 1;
        continue;
      }
      const entry = (
        (payload.cohesionData && payload.cohesionData.countrySimilarity) ||
        []
      ).find((item) => item && item.country === country);
      if (!entry || typeof entry.score !== "number") continue;

      rows.push({
        country,
        subject: subject.name,
        score: round(entry.score),
        baseline: round(baseline),
        votingSessions: sessionsFor(
          payload,
          subject.name,
          subject.votingSessions
        ),
        mepCount: Array.isArray(payload.nodes) ? payload.nodes.length : null,
      });
    }
  }

  // Furthest from its own habit in either direction: a delegation closing
  // ranks on one policy area is as much a finding as one splitting apart.
  return {
    rows: keepTop(rows, (row) => Math.abs(row.score - row.baseline)),
    missing,
  };
}

/**
 * (b) Groups and (c) pairs — both read the whole-Parliament view of one policy
 * area, so they share a single pass over the ~21 subject files per term.
 */
async function buildGroupsAndPairs(mandate, baselines, subjects) {
  const groupRows = [];
  const pairRows = [];
  const all = baselines._all;

  for (const subject of subjects) {
    const payload = await readJson(
      path.join(PRECOMPUTED_DIR, subjectFileName(mandate, subject.name))
    );
    if (!payload || !payload.cohesionData) continue;

    const sessions = sessionsFor(payload, subject.name, subject.votingSessions);
    const counts = groupCounts(payload);

    (payload.cohesionData.intragroupCohesion || []).forEach((item) => {
      if (!item || !item.group || item.group === NOT_A_GROUP) return;
      const baseline = all.intragroup[item.group];
      if (typeof baseline !== "number" || typeof item.score !== "number") return;
      groupRows.push({
        group: item.group,
        subject: subject.name,
        score: round(item.score),
        baseline: round(baseline),
        votingSessions: sessions,
        mepCount: counts[item.group] || 0,
      });
    });

    const inter = payload.cohesionData.intergroupCohesion;
    if (inter && Array.isArray(inter.groups) && Array.isArray(inter.matrix)) {
      const seen = new Set();
      inter.groups.forEach((groupA, i) => {
        const row = inter.matrix[i];
        if (!Array.isArray(row)) return;
        inter.groups.forEach((groupB, j) => {
          // The diagonal is a group against itself, which is ranking (b).
          if (groupA === groupB) return;
          if (groupA === NOT_A_GROUP || groupB === NOT_A_GROUP) return;
          const score = row[j];
          if (typeof score !== "number" || !isFinite(score)) return;
          const key = [groupA, groupB].sort().join("|");
          if (seen.has(key)) return; // the matrix is symmetric
          const baseline = all.intergroup[key];
          if (typeof baseline !== "number") return;
          seen.add(key);
          const [first, second] = key.split("|");
          pairRows.push({
            groupA: first,
            groupB: second,
            subject: subject.name,
            score: round(score),
            baseline: round(baseline),
            votingSessions: sessions,
            mepCount: (counts[first] || 0) + (counts[second] || 0),
          });
        });
      });
    }
  }

  return {
    // A group is interesting here when it comes apart, so this one ranking is
    // signed: the drops, largest first.
    groups: keepTop(groupRows, (row) => row.baseline - row.score),
    // A pair is interesting when it moves at all — two blocs converging on one
    // policy area is the same kind of finding as two pulling apart.
    pairs: keepTop(pairRows, (row) => Math.abs(row.score - row.baseline)),
  };
}

/**
 * (d) Mavericks — MEPs who agree more with some group other than the one they
 * sit in. Read from the unfiltered term network, where every MEP carries a
 * score against every group.
 *
 * NonAttached members are kept but flagged, because for them "not their own
 * group" is close to the definition: their own-group figure is agreement with
 * the other unaffiliated members, who agree with nobody in particular,
 * including each other.
 */
function buildMavericks(payload) {
  const scores = payload.agreementScores || {};
  const totalSessions =
    (payload.votingSessions && payload.votingSessions.total) ?? null;
  const rows = [];

  (payload.nodes || []).forEach((node) => {
    if (!node || !node.id || !node.groupId) return;
    const perGroup = scores[node.id];
    if (!perGroup) return;

    const own = perGroup[node.groupId];
    // count is how many colleagues the average was taken over; zero means the
    // figure is an artefact of an empty comparison, not a quiet MEP.
    if (!own || !own.count || typeof own.score !== "number") return;

    let best = null;
    Object.entries(perGroup).forEach(([groupId, entry]) => {
      if (groupId === node.groupId) return;
      if (!entry || !entry.count || typeof entry.score !== "number") return;
      if (!best || entry.score > best.score) {
        best = { groupId, score: entry.score, count: entry.count };
      }
    });
    if (!best || best.score <= own.score) return;

    rows.push({
      mepId: node.id,
      mepName: node.label || node.id,
      country: node.country || null,
      group: node.groupId,
      closestGroup: best.groupId,
      nonAttached: node.groupId === NOT_A_GROUP,
      score: round(best.score),
      baseline: round(own.score),
      votingSessions: totalSessions,
      mepCount: own.count,
    });
  });

  return {
    rows: keepTop(rows, (row) => row.score - row.baseline),
    total: rows.length,
  };
}

async function buildMandate(mandate, baselines) {
  if (!baselines || !baselines._all) {
    console.log(
      `  ✗ mandate ${mandate}: no baselines — nothing to compare against`
    );
    return null;
  }

  const full = await readJson(
    path.join(PRECOMPUTED_DIR, `mandate_${mandate}.json`)
  );
  if (!full) {
    console.log(`  ✗ mandate ${mandate}: no precomputed network on disk`);
    return null;
  }

  const subjects = (full.subjects || []).filter((s) => s && s.name);
  if (subjects.length === 0) {
    console.log(
      `  ✗ mandate ${mandate}: precomputed network lists no policy areas`
    );
    return null;
  }

  const mavericks = buildMavericks(full);
  const { groups, pairs } = await buildGroupsAndPairs(
    mandate,
    baselines,
    subjects
  );
  const delegations = await buildDelegations(mandate, baselines, subjects);

  console.log(
    `  ✓ mandate ${mandate}: ${delegations.rows.length} delegation, ` +
      `${groups.length} group, ${pairs.length} pair rows; ` +
      `${mavericks.total} MEP(s) closer to another group`
  );
  if (delegations.missing > 0) {
    // Expected: a one-MEP delegation, or a policy area a country never voted
    // on, has no network to have precomputed.
    console.log(
      `    · ${delegations.missing} country x policy-area view(s) not on disk`
    );
  }

  return {
    delegations: delegations.rows,
    groups,
    pairs,
    mavericks: mavericks.rows,
  };
}

async function main() {
  console.log("Building findings.json...\n");

  const baselines = await readJson(BASELINES_PATH);
  if (!baselines) {
    console.error(
      "✗ public/data/baselines.json is missing — run `npm run baselines` first."
    );
    process.exitCode = 1;
    return;
  }

  const findings = {};
  for (const mandate of MANDATES) {
    const built = await buildMandate(mandate, baselines[mandate]);
    if (built) findings[mandate] = built;
  }

  if (Object.keys(findings).length === 0) {
    console.error("\n✗ No findings could be built — nothing written.");
    process.exitCode = 1;
    return;
  }

  await fsPromises.writeFile(OUTPUT_PATH, JSON.stringify(findings));
  const kb = Math.round((await fsPromises.stat(OUTPUT_PATH)).size / 1024);
  console.log(`\n✓ Wrote ${path.relative(process.cwd(), OUTPUT_PATH)} (${kb} KB)`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  buildMavericks,
  countrySubjectFileName,
  subjectFileName,
};
