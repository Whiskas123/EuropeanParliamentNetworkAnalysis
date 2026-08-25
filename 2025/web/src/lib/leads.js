/**
 * The term-wide rankings behind the Leads screen.
 *
 * Shared between the screen itself and the header button that opens it: the
 * button carries a count, so the file has to be read before anybody asks to
 * see it. Held as the in-flight promise rather than the parsed result — the
 * same arrangement dataLoader.js uses for baselines.json — so the two callers
 * make one request between them.
 *
 * The file on disk is still findings.json and scripts/build-findings.js still
 * writes it. Only the name the reader sees changed.
 */

let leadsPromise = null;

export function loadLeads() {
  if (leadsPromise === null) {
    leadsPromise = fetch("/data/findings.json")
      .then((response) => (response.ok ? response.json() : null))
      .catch((error) => {
        console.warn("Leads not available:", error);
        return null;
      });
  }
  return leadsPromise;
}

/** The four rankings, in the order the screen lays them out. */
export const LEAD_KINDS = ["delegations", "groups", "pairs", "mavericks"];

/** How many leads a term holds in all — the figure on the header button. */
export function countLeads(leads, mandate) {
  const term = leads && leads[mandate];
  if (!term) return 0;
  return LEAD_KINDS.reduce(
    (total, kind) => total + (Array.isArray(term[kind]) ? term[kind].length : 0),
    0
  );
}
