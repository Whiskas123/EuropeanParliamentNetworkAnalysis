/**
 * Everything that decides what you are looking at, in one serialisable object.
 *
 * Kept in the URL so a view can be bookmarked, sent to someone, reopened
 * behind a print, or reached from a QR code on a wall panel. Before this the
 * app held all of it in component state and every view had the same address.
 *
 * Keys are short because the whole thing ends up in a query string that may be
 * printed as a QR code, and every character costs modules.
 */

export const DEFAULT_VIEW = {
  mandate: 10,
  country: null,
  subject: null,
  /** Share of the densest edges to draw, 0..100. */
  edgePercentile: 50,
  /** Edge width dial; 1 is neutral. */
  edgeWidth: 1,
  /** "group" | "country" | "party" | "loyalty" */
  colorMode: "group",
  /** {type: "group"|"country", value: string} | null */
  dim: null,
  /** MEP id to select, if any. */
  mep: null,
  /** Political group to open the group panel on, if any. */
  group: null,
};

const COLOR_MODES = new Set(["group", "country", "party", "loyalty"]);

const KEYS = {
  mandate: "m",
  country: "c",
  subject: "s",
  edgePercentile: "e",
  edgeWidth: "w",
  colorMode: "k",
  dim: "d",
  mep: "n",
  group: "g",
};

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * Serialise a view to a query string, omitting anything at its default so the
 * common case stays a clean URL.
 *
 * @param {Object} view
 * @returns {string} e.g. "m=10&c=Poland&s=Fisheries"
 */
export function encodeView(view) {
  const params = new URLSearchParams();
  const put = (key, value, fallback) => {
    if (value === null || value === undefined || value === fallback) return;
    params.set(KEYS[key], String(value));
  };

  put("mandate", view.mandate, DEFAULT_VIEW.mandate);
  put("country", view.country, null);
  put("subject", view.subject, null);
  put("edgePercentile", view.edgePercentile, DEFAULT_VIEW.edgePercentile);
  put("edgeWidth", view.edgeWidth, DEFAULT_VIEW.edgeWidth);
  put("colorMode", view.colorMode, DEFAULT_VIEW.colorMode);
  put("mep", view.mep, null);
  put("group", view.group, null);
  if (view.dim && view.dim.value) {
    params.set(KEYS.dim, `${view.dim.type}:${view.dim.value}`);
  }

  return params.toString();
}

/**
 * Read a view back out of a query string.
 *
 * Every field is validated and falls back to its default rather than throwing:
 * these URLs get hand-edited, truncated by chat clients, and reconstructed
 * from printed QR codes, so a malformed one should still open something.
 *
 * @param {string|URLSearchParams} query
 * @returns {Object} a complete view
 */
export function decodeView(query) {
  const params =
    typeof query === "string" ? new URLSearchParams(query) : query || new URLSearchParams();
  const view = { ...DEFAULT_VIEW };

  const mandate = params.get(KEYS.mandate);
  if (mandate !== null) {
    const n = parseInt(mandate, 10);
    if (n >= 6 && n <= 10) view.mandate = n;
  }

  const country = params.get(KEYS.country);
  if (country) view.country = country;

  const subject = params.get(KEYS.subject);
  if (subject) view.subject = subject;

  const percentile = params.get(KEYS.edgePercentile);
  if (percentile !== null) {
    view.edgePercentile = clamp(percentile, 1, 100, DEFAULT_VIEW.edgePercentile);
  }

  const width = params.get(KEYS.edgeWidth);
  if (width !== null) {
    view.edgeWidth = clamp(width, 0.1, 8, DEFAULT_VIEW.edgeWidth);
  }

  const colorMode = params.get(KEYS.colorMode);
  if (colorMode && COLOR_MODES.has(colorMode)) view.colorMode = colorMode;

  const dim = params.get(KEYS.dim);
  if (dim) {
    const separator = dim.indexOf(":");
    const type = separator > 0 ? dim.slice(0, separator) : null;
    const value = separator > 0 ? dim.slice(separator + 1) : null;
    if ((type === "group" || type === "country") && value) {
      view.dim = { type, value };
    }
  }

  const mep = params.get(KEYS.mep);
  if (mep) view.mep = mep;

  const group = params.get(KEYS.group);
  if (group) view.group = group;

  return view;
}

/**
 * A shareable absolute URL for a view. Returns "" during server rendering,
 * where there is no location to build against.
 */
export function shareableUrl(view) {
  if (typeof window === "undefined") return "";
  const query = encodeView(view);
  const { origin, pathname } = window.location;
  return query ? `${origin}${pathname}?${query}` : `${origin}${pathname}`;
}
