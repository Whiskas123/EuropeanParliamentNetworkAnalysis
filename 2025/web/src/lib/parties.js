/**
 * National parties as a colouring dimension.
 *
 * `PartyNames` has been on every node record since the 2025 build and has only
 * ever fed a tooltip. National parties are far more cohesive than the European
 * groups they sit in — 99.7% for the Swedish Social Democrats against 91.4%
 * for Finland's Kokoomus in term 10 — so colouring by party shows a structure
 * the group colouring hides.
 */

const UNKNOWN_COLOR = "#CCCCCC";

/**
 * The party an MEP is counted under.
 *
 * `PartyNames` holds every party they sat for during the term, which for a
 * defector is more than one. The first is taken so that an MEP belongs to
 * exactly one party and the colouring stays a partition.
 */
export function getPartyName(node) {
  const names = node?.partyNames || node?.PartyNames;
  if (Array.isArray(names) && names.length > 0) return names[0];
  return null;
}

/**
 * Party identity is only unique within a country — "Independent" and
 * "Sans parti" recur across delegations and are not the same party.
 */
export function getPartyKey(node) {
  const name = getPartyName(node);
  if (!name) return null;
  return `${node.country || "?"}|${name}`;
}

/**
 * Colour for a party, derived from its key.
 *
 * Hashed rather than assigned from a fixed list because the party set changes
 * every term and there are ~50 parties with four or more MEPs in a single one;
 * no hand-picked palette stays legible at that count. Hashing also keeps a
 * party's colour stable across mandates and views without storing a mapping.
 *
 * Hue comes from the whole key so two parties in the same country separate;
 * lightness and saturation are varied slightly, on a different part of the
 * hash, so neighbouring hues stay distinguishable.
 */
export function getPartyColor(node) {
  const key = getPartyKey(node);
  if (!key) return UNKNOWN_COLOR;

  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  }

  const hue = hash % 360;
  const saturation = 45 + ((hash >> 9) % 25);
  const lightness = 42 + ((hash >> 17) % 20);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Parties present in a view, largest first.
 *
 * @param {Array} nodes
 * @param {number} minMembers - parties below this are omitted from the legend;
 *   a network has a long tail of one-MEP parties that would swamp it
 * @returns {Array<{key: string, name: string, country: string, count: number, color: string}>}
 */
export function listParties(nodes, minMembers = 1) {
  const parties = new Map();
  (nodes || []).forEach((node) => {
    const key = getPartyKey(node);
    if (!key) return;
    const existing = parties.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    parties.set(key, {
      key,
      name: getPartyName(node),
      country: node.country || "",
      count: 1,
      color: getPartyColor(node),
    });
  });

  return [...parties.values()]
    .filter((party) => party.count >= minMembers)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
