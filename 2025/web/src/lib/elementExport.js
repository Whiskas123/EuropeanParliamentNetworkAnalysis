/**
 * The sidebar's small marks, cut loose for a poster.
 *
 * lib/networkExport.js prints *sheets*: a page with a header, a rule, a
 * section heading and a caption, meant to be read as evidence on its own. That
 * is the wrong object for a panel. A poster wants one dial, at whatever size
 * the layout gives it, next to a sentence written by hand — and getting there
 * from a sheet means importing a page and cutting it up, which loses the
 * grouping and has to be redone every time a number changes.
 *
 * So this module emits the same marks as *elements*: each one drawn from its
 * own origin, sized to its own box, and wrapped in a named `<g>`. A file from
 * here opens in Figma as a layer list — `dial-group-PPE`, `dial-national-CZ`
 * — and each layer drags out onto the canvas whole.
 *
 * ## Why it borrows rather than redraws
 *
 * Every mark here comes from networkExport.js: `svgGauge` for the dials,
 * `trendPath` and `trendMarker` for the lines, the `DELTA_*` greys for the
 * badges. A second implementation would be a second thing to keep in step, and
 * the failure would be silent — a poster and the sheet it was lifted from
 * disagreeing about a number by a rounding rule, discovered after printing.
 * The one exception is layout: a sheet fits its dials to a page and shrinks
 * them to do it, and an element has no page to fit, so the sizes here are
 * fixed and generous.
 *
 * ## What an element is
 *
 * `{ id, name, width, height, markup }`, where `markup` is drawn from (0, 0)
 * and stays inside `width` x `height`. That is the whole contract: anything
 * satisfying it can be placed by `elementSheetSVG` without knowing what it is.
 *
 * ## What it will not do
 *
 * Invent a figure. Every collector below reads a value that is already on
 * screen somewhere, and where the value is missing the element is dropped
 * rather than drawn empty — an empty ring on a panel reads as "they agree with
 * nobody" when what happened is that nobody could be measured. The callers get
 * told what was dropped so they can say so; see the `skipped` arrays.
 */

import {
  svgGauge,
  GAUGE_FLOOR,
  trendMarker,
  trendPath,
  TREND_SERIES,
  svgText,
  svgRule,
  svgRect,
  estimateWidth,
  esc,
  xmlId,
  n1,
  n2,
  fmtPct,
  FONT_STACK,
  PAPER,
  INK,
  SB_INK,
  SB_BODY,
  SB_MUTED,
  SB_RULE,
  DELTA_UP,
  DELTA_DOWN,
  DELTA_FLAT,
} from "./networkExport.js";
import { getGroupAcronym, getGroupColor, getDelta } from "./utils.js";
import {
  CONSTELLATION_BOX,
  CONSTELLATION_POINTS,
  starPath,
} from "./constellation.js";

/* -------------------------------------------------------------------------
 * Sizes
 * ---------------------------------------------------------------------- */

/** Sheet margin. Generous, because the sheet exists to be pulled apart. */
const M = 28;

/**
 * The dial box.
 *
 * `svgGauge` scales its stroke, its figure and its label off this one number,
 * so a bigger dial is the same dial and not a fatter one. The sheets pick a
 * size between 24 and 44 to make a page fit; nothing has to fit here, and at
 * 44 the label under a dial destined for A1 is set in what amounts to 4pt.
 */
const GAUGE_SIZE = 56;

/** One dial's cell. Wide enough to set "Verts/ALE" without clipping. */
const CELL_W = 94;

/** Dials to a row. Six is what fits the paper below at CELL_W. */
const COLUMNS = 6;

/** Gap between a label and the edge of its cell. */
const GUTTER = 6;

/** Vertical space between the rows of a grid. */
const ROW_GAP = 14;

/** Space under a section before the next one starts. */
const SECTION_GAP = 26;

/* -------------------------------------------------------------------------
 * Element plumbing
 * ---------------------------------------------------------------------- */

/**
 * A named layer at (x, y).
 *
 * Figma takes a layer's name from the `id`, which XML will not let hold a
 * space or a slash — so the readable form goes on `data-name`, which Figma
 * reads in preference where it finds one and which survives as a plain
 * attribute where it does not.
 *
 * `esc` is not optional here. Two of the acronyms these layers are named after
 * carry an ampersand — "S&D", "Verts/ALE" — and an unescaped one makes the
 * whole file invalid XML rather than merely mislabelling a layer, so every
 * sheet holding an S&D dial would fail to open at all.
 */
function placeElement(element, x, y) {
  return (
    `<g id="${element.id}" data-name="${esc(element.name)}" ` +
    `transform="translate(${n1(x)} ${n1(y)})">${element.markup}</g>`
  );
}

/**
 * One dial as an element.
 *
 * `floor` is the argument that matters and the one a caller must not leave to
 * chance: 0.5 where a bloc is measured against itself, 0 where the two sides
 * are different things. RadialGauge's own comment has the reasoning; getting
 * it wrong here would crop a quarter of the MEP-to-group figures off the
 * bottom of their own scale.
 */
export function gaugeElement({
  id,
  name,
  value,
  baseline = null,
  color = "#6B7C93",
  label,
  sub = null,
  floor = GAUGE_FLOOR,
  size = GAUGE_SIZE,
  width = CELL_W,
  maxLabelLines = 1,
}) {
  const cell = svgGauge({
    cx: width / 2,
    top: 0,
    size,
    value,
    baseline,
    color,
    label,
    sub,
    floor,
    labelWidth: width - GUTTER,
    maxLabelLines,
  });
  return {
    id: xmlId(id),
    name: name || String(label),
    width,
    height: cell.bottom,
    markup: cell.markup,
  };
}

/**
 * A delta badge on its own, at a size that can be read across a room.
 *
 * The badge under a dial is set to be subordinate to it. Lifted out as its own
 * element it is usually the headline of whatever it is placed next to, so it
 * is drawn here at poster weight rather than scaled up from the dial's — the
 * same three greys, the same signed number, twice the type.
 */
export function badgeElement({ id, name, value, baseline, label = null }) {
  const delta = getDelta(value, baseline);
  if (!delta) return null;
  const tone =
    delta.direction > 0 ? DELTA_UP : delta.direction < 0 ? DELTA_DOWN : DELTA_FLAT;
  const size = 15;
  const text = `${delta.text} pp`;
  const width = estimateWidth(text, size) + 14;
  const height = size + 10;
  const parts = [
    `<rect x="0" y="0" width="${n1(width)}" height="${n1(
      height
    )}" rx="3" fill="${tone.fill}"/>`,
    svgText(width / 2, height - 8, text, {
      size,
      anchor: "middle",
      weight: 600,
      fill: tone.ink,
      monospaceDigits: true,
    }),
  ];
  let bottom = height;
  if (label) {
    parts.push(
      svgText(0, height + 11, label, { size: 7, fill: SB_MUTED })
    );
    bottom = height + 14;
  }
  return {
    id: xmlId(id),
    name: name || text,
    width: Math.max(width, label ? estimateWidth(label, 7) : 0),
    height: bottom,
    markup: parts.join(""),
  };
}

/* -------------------------------------------------------------------------
 * Trend elements
 * ---------------------------------------------------------------------- */

const PLOT_W = 250;
const PLOT_H = 110;

/**
 * The vertical range a line is drawn in.
 *
 * Autoscaled with a margin, rather than fixed at 0-100%: these series move
 * within a few points of each other over twenty years, and drawn full-scale
 * every one of them is a flat line. That is the same argument the dials make
 * for their cropped ring — with the same obligation, which is that the axis
 * carries its numbers so the crop cannot be misread. The floor never rises
 * above the lowest point and the ceiling never sits below the highest, so no
 * value is ever drawn off the plot.
 */
function plotRange(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const pad = Math.max(0.02, (hi - lo) * 0.25);
  return { lo: Math.max(0, lo - pad), hi: Math.min(1, hi + pad) };
}

/**
 * One series across the terms, as a small plot.
 *
 * Drawn with the dash and the marker shape the History tab gives that series,
 * not colour alone — these get printed, sometimes in one ink, and a legend
 * that only works in colour is a legend that fails on the wall.
 */
function seriesElement({ id, name, rows, key, color, dash, marker, label }) {
  const values = rows.map((row) => (row ? row[key] : null));
  const range = plotRange(values);
  if (!range) return null;

  const left = 26;
  const plotWidth = PLOT_W - left - 8;
  const span = range.hi - range.lo || 1;
  const xAt = (index) =>
    left + (rows.length > 1 ? (index / (rows.length - 1)) * plotWidth : plotWidth / 2);
  const yAt = (value) => PLOT_H - ((value - range.lo) / span) * PLOT_H;

  const parts = [];
  // Three gridlines, each carrying its own number: the crop is only honest if
  // the reader can see where it starts.
  [0, 0.5, 1].forEach((t) => {
    const value = range.lo + span * t;
    const gy = yAt(value);
    parts.push(svgRule(left, gy, plotWidth, SB_RULE, 0.5));
    parts.push(
      svgText(left - 5, gy + 2.5, Math.round(value * 100), {
        size: 6.5,
        anchor: "end",
        fill: SB_MUTED,
        monospaceDigits: true,
      })
    );
  });

  const points = values.map((value, index) =>
    Number.isFinite(value) ? { x: xAt(index), y: yAt(value) } : null
  );
  parts.push(trendPath(points, color, dash, 1.6));
  points.forEach((point, index) => {
    if (!point) return;
    parts.push(trendMarker(marker, point.x, point.y, color, 2.8));
  });

  // The term under each point.
  rows.forEach((row, index) => {
    parts.push(
      svgText(xAt(index), PLOT_H + 12, row ? row.short : "", {
        size: 6.5,
        anchor: "middle",
        fill: SB_MUTED,
      })
    );
  });
  // Only the ends carry a figure. A number on every point is five numbers
  // competing with the line they annotate, and the ends are what a reader
  // compares. Each is anchored away from the plot's edge so it stays on the
  // paper: the first reads rightwards from its point, the last leftwards.
  [0, points.length - 1].forEach((index) => {
    const point = points[index];
    if (!point) return;
    parts.push(
      svgText(point.x, point.y - 7, fmtPct(values[index]), {
        size: 7,
        anchor: index === 0 ? "start" : "end",
        fill: SB_BODY,
        weight: 600,
        monospaceDigits: true,
      })
    );
  });

  parts.push(
    svgText(left, PLOT_H + 26, label, { size: 8, weight: 700, fill: SB_INK })
  );

  return {
    id: xmlId(id),
    name: name || label,
    width: PLOT_W,
    height: PLOT_H + 32,
    markup: parts.join(""),
  };
}

/**
 * All three series on one pair of axes, with a legend.
 *
 * The single-series elements above are for a panel that makes one point; this
 * is for the panel that makes the comparison, and it is the only element here
 * that needs a key of its own.
 */
function comboElement({ rows }) {
  const values = rows.flatMap((row) =>
    row ? TREND_SERIES.map((s) => row[s.key]) : []
  );
  const range = plotRange(values);
  if (!range) return null;

  const left = 26;
  const width = 330;
  const height = 150;
  const plotWidth = width - left - 8;
  const span = range.hi - range.lo || 1;
  const xAt = (index) =>
    left + (rows.length > 1 ? (index / (rows.length - 1)) * plotWidth : plotWidth / 2);
  const yAt = (value) => height - ((value - range.lo) / span) * height;

  const parts = [];
  [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
    const value = range.lo + span * t;
    const gy = yAt(value);
    parts.push(svgRule(left, gy, plotWidth, SB_RULE, 0.5));
    parts.push(
      svgText(left - 5, gy + 2.5, Math.round(value * 100), {
        size: 6.5,
        anchor: "end",
        fill: SB_MUTED,
        monospaceDigits: true,
      })
    );
  });

  TREND_SERIES.forEach((s) => {
    const points = rows.map((row, index) =>
      row && Number.isFinite(row[s.key])
        ? { x: xAt(index), y: yAt(row[s.key]) }
        : null
    );
    parts.push(trendPath(points, s.color, s.dash, 1.6));
    points.forEach((point) => {
      if (point) parts.push(trendMarker(s.marker, point.x, point.y, s.color, 2.8));
    });
  });

  rows.forEach((row, index) => {
    parts.push(
      svgText(xAt(index), height + 12, row ? row.short : "", {
        size: 6.5,
        anchor: "middle",
        fill: SB_MUTED,
      })
    );
  });

  let legendX = left;
  const legendY = height + 26;
  TREND_SERIES.forEach((s) => {
    parts.push(
      `<line x1="${n1(legendX)}" y1="${n1(legendY)}" x2="${n1(
        legendX + 14
      )}" y2="${n1(legendY)}" stroke="${s.color}" stroke-width="1.6"${
        s.dash ? ` stroke-dasharray="${s.dash}"` : ""
      }/>`
    );
    parts.push(trendMarker(s.marker, legendX + 7, legendY, s.color, 2.8));
    parts.push(
      svgText(legendX + 19, legendY + 2.5, s.label, { size: 7, fill: SB_BODY })
    );
    legendX += 19 + estimateWidth(s.label, 7) + 14;
  });

  return {
    id: "trend-all-three",
    name: "Three series, one axis",
    width,
    height: legendY + 8,
    markup: parts.join(""),
  };
}

/**
 * The lowest agreement any two groups reach, term by term.
 *
 * Floored at zero rather than autoscaled, unlike everything else here: this
 * one is read against "never voting together", so where it sits on the way
 * down to nothing is the whole point and a cropped floor would turn an 18%
 * pair into a modest dip. Same reasoning as the History sheet, which draws it
 * the same way.
 */
function furthestPairElement({ rows, mandate }) {
  const pairs = rows.map((row) => (row && row.lowestPair) || null);
  const scores = pairs.filter(Boolean).map((pair) => pair.score);
  if (scores.length === 0) return null;

  const left = 26;
  const width = 330;
  const height = 120;
  const plotWidth = width - left - 8;
  const hi = Math.min(1, Math.max(...scores) + 0.09);
  const span = hi || 1;
  const xAt = (index) =>
    left + (rows.length > 1 ? (index / (rows.length - 1)) * plotWidth : plotWidth / 2);
  const yAt = (value) => height - (value / span) * height;

  const parts = [];
  [0, 0.5, 1].forEach((t) => {
    const value = span * t;
    const gy = yAt(value);
    parts.push(svgRule(left, gy, plotWidth, SB_RULE, 0.5));
    parts.push(
      svgText(left - 5, gy + 2.5, Math.round(value * 100), {
        size: 6.5,
        anchor: "end",
        fill: SB_MUTED,
        monospaceDigits: true,
      })
    );
  });

  const points = pairs.map((pair, index) =>
    pair && Number.isFinite(pair.score) ? { x: xAt(index), y: yAt(pair.score) } : null
  );
  parts.push(trendPath(points, INK, "", 1.6));
  points.forEach((point, index) => {
    if (!point) return;
    parts.push(trendMarker("circle", point.x, point.y, INK, 2.8));
    parts.push(
      svgText(point.x, point.y - 7, fmtPct(pairs[index].score), {
        size: 7,
        anchor: "middle",
        fill: SB_BODY,
        weight: 600,
        monospaceDigits: true,
      })
    );
  });

  // Which two groups they were, under the axis and under their own colours.
  // Rarely the same pair twice, which is why this cannot be one caption. The
  // colour is the group palette rather than the open network's, since most of
  // these groups are not in any one term to be read off.
  const labelY = height + 8;
  const swatch = 5;
  const rowPitch = 12;
  pairs.forEach((pair, index) => {
    const ids = pair ? [pair.a, pair.b] : [];
    ids.slice(0, 2).forEach((group, line) => {
      const top = labelY + line * rowPitch;
      parts.push(
        `<rect x="${n1(xAt(index) - swatch / 2)}" y="${n1(
          top
        )}" width="${swatch}" height="${swatch}" rx="1.5" fill="${getGroupColor(
          group
        )}"/>`
      );
      parts.push(
        svgText(xAt(index), top + swatch + 5, getGroupAcronym(group, mandate).slice(0, 11), {
          size: 5.5,
          anchor: "middle",
          fill: SB_MUTED,
        })
      );
    });
  });

  return {
    id: "trend-furthest-pair",
    name: "The two groups furthest apart",
    width,
    height: labelY + rowPitch * 2 + 8,
    markup: parts.join(""),
  };
}

/* -------------------------------------------------------------------------
 * Collectors: app data in, sections out
 * ---------------------------------------------------------------------- */

/**
 * A section is a heading and the elements under it.
 * `{ id, title, lede, elements, columns }`
 */
function section(id, title, lede, elements, columns = COLUMNS) {
  const kept = elements.filter(Boolean);
  return kept.length > 0
    ? { id: xmlId(id), title, lede, elements: kept, columns }
    : null;
}

/**
 * One MEP's dials.
 *
 * `reading` and `areas` come straight from lib/normalisedAgreement.js, so what
 * is drawn is what the Agreement tab draws — including the two floors, which
 * differ between the grids and are the easiest thing here to get wrong.
 *
 * `scope` mirrors the panel's Room toggle: "house" measures this MEP against
 * each group whole, "country" against each group's members from their own
 * country. Narrowing the room narrows the notch too, so the two are different
 * readings of the same MEP and not one figure at two zoom levels.
 *
 * @returns {{sections: Array, skipped: Array<string>}}
 */
export function mepGaugeElements({
  reading,
  areas = [],
  mandate,
  groupColors = new Map(),
  scope = "house",
}) {
  const skipped = [];
  if (!reading || reading.reason) {
    return {
      sections: [],
      skipped: [
        reading?.reason === "no-group"
          ? "sat as Non-Attached, which is not a bloc to be measured against"
          : reading?.reason === "unmeasurable"
          ? "no one could be measured in this policy area"
          : reading?.reason === "too-few-votes"
          ? "cast too few votes to be compared"
          : "no normalised figures for this MEP",
      ],
    };
  }

  const colorFor = (groupId) => groupColors.get(groupId) || getGroupColor(groupId);
  const ownAcronym = reading.group ? getGroupAcronym(reading.group, mandate) : null;

  // The two headline dials: their group and their delegation, on one footing.
  const headline = [];
  if (reading.own && Number.isFinite(reading.own.value)) {
    headline.push(
      gaugeElement({
        id: `dial-headline-group-${getGroupAcronym(reading.own.groupId, mandate)}`,
        name: `Group · ${getGroupAcronym(reading.own.groupId, mandate)}`,
        value: reading.own.value,
        baseline: reading.own.level,
        color: colorFor(reading.own.groupId),
        label: getGroupAcronym(reading.own.groupId, mandate),
        // Their own group against itself, so the ring keeps its 50% floor.
        floor: GAUGE_FLOOR,
      })
    );
  } else {
    skipped.push("the headline group dial");
  }
  if (reading.national && Number.isFinite(reading.national.value)) {
    headline.push(
      gaugeElement({
        id: `dial-headline-national-${reading.national.country}`,
        name: `National · ${reading.national.country}`,
        value: reading.national.value,
        baseline: reading.national.level,
        color: "#6B7C93",
        label: reading.national.country,
        floor: GAUGE_FLOOR,
      })
    );
  } else {
    skipped.push("the headline national dial");
  }

  // The per-group grid. Floor 0: an MEP against a group they are not in runs
  // from 16% to 98%, and cropping at a half would blank a quarter of them.
  const useCountry = scope === "country";
  const rows = useCountry ? reading.nationalGroups ?? [] : reading.groups ?? [];
  if (useCountry && rows.length === 0) {
    skipped.push(
      "the per-group dials in the country room — this MEP is the only member of their national party, so there is no average to compare them with"
    );
  }
  const groupDials = [...rows]
    .sort((a, b) => b.value - a.value)
    .map((row) =>
      gaugeElement({
        id: `dial-group-${getGroupAcronym(row.groupId, mandate)}`,
        name: getGroupAcronym(row.groupId, mandate),
        value: row.value,
        baseline: row.level,
        color: colorFor(row.groupId),
        label: getGroupAcronym(row.groupId, mandate),
        sub:
          useCountry && Number.isFinite(row.votes)
            ? `${row.votes.toLocaleString("en-US")} votes`
            : null,
        floor: 0,
      })
    );

  // Their own group, area by area. Back to the 50% floor: this is a bloc
  // measured against itself again.
  const areaDials = areas.map((area) =>
    gaugeElement({
      id: `dial-area-${area.subject}`,
      name: area.subject,
      value: area.value,
      baseline: area.level,
      color: colorFor(reading.group),
      // No emoji: the panel's label carries one and no print font has it.
      label: area.subject,
      sub: Number.isFinite(area.votes)
        ? `${area.votes.toLocaleString("en-US")} votes`
        : null,
      floor: GAUGE_FLOOR,
      // "Environment, Climate and Food Safety" does not fit a dial's width on
      // one line at any size worth reading, and this is the one grid whose
      // labels are sentences rather than acronyms.
      maxLabelLines: 3,
    })
  );

  return {
    sections: [
      section(
        "headline",
        "Where they sit",
        "Arc: this MEP. Notch: what a typical member of the same bloc manages.",
        headline
      ),
      section(
        "by-group",
        useCountry
          ? "With each group, among their own countrymen"
          : "With each political group",
        useCountry
          ? "Measured against each group's members from this MEP's own country."
          : "Full scale, not cropped: these figures genuinely run from about 16% to 98%.",
        groupDials
      ),
      section(
        "by-area",
        ownAcronym ? `With ${ownAcronym}, by policy area` : "By policy area",
        "Cropped at 50%. The arc that has come away from its notch is the unusual one.",
        areaDials
      ),
    ].filter(Boolean),
    skipped,
  };
}

/**
 * The Agreement tab's own two grids: each group with itself, each delegation
 * with itself.
 *
 * Both keep the 50% floor — a bloc against itself is exactly the case the crop
 * was argued for.
 */
export function cohesionGaugeElements({
  intragroupCohesion = [],
  countrySimilarity = [],
  baseline = null,
  groupColors = new Map(),
  mandate,
}) {
  const skipped = [];
  // getBaseline returns {scores, label, comparing}, and `scores` holds plain
  // numbers keyed by group and by country — not rows to be searched. Reading
  // it as an array silently produced a null notch on every dial, which looks
  // exactly like a scope that has no baseline.
  const baseFor = (bucket, key) => {
    const value = baseline?.scores?.[bucket]?.[key];
    return Number.isFinite(value) ? value : null;
  };

  const groupDials = [...intragroupCohesion]
    // The non-attached are not a group, so their internal agreement is not a
    // property of anything. The panel and the printed sheets both drop them,
    // and a poster that carried the one dial the site refuses to draw would be
    // asserting something none of the rest of it will stand behind.
    .filter(
      (item) =>
        item && item.group !== "NonAttached" && Number.isFinite(item.score)
    )
    .sort((a, b) => b.score - a.score)
    .map((item) =>
      gaugeElement({
        id: `dial-cohesion-${getGroupAcronym(item.group, mandate)}`,
        name: getGroupAcronym(item.group, mandate),
        value: item.score,
        baseline: baseFor("intragroup", item.group),
        color: groupColors.get(item.group) || getGroupColor(item.group),
        label: getGroupAcronym(item.group, mandate),
        sub: Number.isFinite(item.mepCount)
          ? `${item.mepCount} MEP${item.mepCount === 1 ? "" : "s"}`
          : null,
      })
    );
  if (groupDials.length === 0) skipped.push("the group cohesion dials");

  const countryDials = [...countrySimilarity]
    .filter((item) => item && Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score)
    .map((item) =>
      gaugeElement({
        id: `dial-delegation-${item.country}`,
        name: item.country,
        value: item.score,
        baseline: baseFor("country", item.country),
        color: "#6B7C93",
        label: item.country,
        maxLabelLines: 2,
        sub: Number.isFinite(item.mepCount)
          ? `${item.mepCount} MEP${item.mepCount === 1 ? "" : "s"}`
          : null,
      })
    );
  if (countryDials.length === 0) skipped.push("the delegation dials");

  return {
    sections: [
      section(
        "group-cohesion",
        "How tightly each group holds",
        "Cropped at 50%: below that a pair disagrees more often than it agrees.",
        groupDials
      ),
      section(
        "delegation-cohesion",
        "How tightly each delegation holds",
        "Same scale, same notch. A national delegation is not a whip.",
        countryDials
      ),
    ].filter(Boolean),
    skipped,
  };
}

/** The History tab's lines, one element per series plus the two composites. */
export function trendSectionElements({ series = [], mandate = null }) {
  const rows = Array.isArray(series) ? series.filter(Boolean) : [];
  const skipped = [];
  if (rows.length === 0) {
    return { sections: [], skipped: ["the history lines — no terms could be read"] };
  }

  const singles = TREND_SERIES.map((s) =>
    seriesElement({
      id: `trend-${s.key}`,
      name: s.label,
      rows,
      key: s.key,
      color: s.color,
      dash: s.dash,
      marker: s.marker,
      label: s.label,
    })
  );
  if (singles.some((element) => !element)) {
    skipped.push("one or more history lines with no finite terms");
  }

  const combo = comboElement({ rows });
  const furthest = furthestPairElement({ rows, mandate });
  if (!furthest) skipped.push("the furthest-pair line");

  return {
    sections: [
      section("trend-lines", "Twenty years, one series at a time", null, singles, 2),
      section("trend-composites", "The same terms, together", null, [combo, furthest], 1),
    ].filter(Boolean),
    skipped,
  };
}

/**
 * The badges, as reusable pieces.
 *
 * A badge is only ever a comparison between two numbers, so these are built
 * from whatever dials the caller already has rather than from a source of
 * their own — which also means a badge on a poster and the badge under its
 * dial can never disagree.
 */
export function badgeSectionElements({ pairs = [] }) {
  const badges = pairs.map((pair) =>
    badgeElement({
      id: `badge-${pair.id}`,
      name: pair.name,
      value: pair.value,
      baseline: pair.baseline,
      label: pair.label,
    })
  );
  return {
    sections: [
      section(
        "badges",
        "Change badges",
        "Green above the reference, red below. Points, not percent.",
        badges,
        4
      ),
    ].filter(Boolean),
    skipped: badges.some((badge) => !badge)
      ? ["badges for figures with no reference to compare against"]
      : [],
  };
}

/** The project mark, at the one size everything else is drawn from. */
export function markSectionElements({ color = "#FFCC00" } = {}) {
  const parts = [];
  CONSTELLATION_POINTS.forEach((point, index) => {
    const next = CONSTELLATION_POINTS[(index + 1) % 12];
    parts.push(
      `<line x1="${point.x}" y1="${point.y}" x2="${next.x}" y2="${next.y}" ` +
        `stroke="${color}" stroke-width="1.5" opacity="0.4"/>`
    );
  });
  CONSTELLATION_POINTS.forEach((point) => {
    parts.push(`<circle cx="${point.x}" cy="${point.y}" r="6" fill="${color}"/>`);
    parts.push(`<path d="${starPath(point.x, point.y)}" fill="${color}" opacity="0.9"/>`);
  });
  return {
    sections: [
      section("mark", "The mark", null, [
        {
          id: "constellation-mark",
          name: "Constellation mark",
          width: CONSTELLATION_BOX,
          height: CONSTELLATION_BOX,
          markup: parts.join(""),
        },
      ], 1),
    ],
    skipped: [],
  };
}

/* -------------------------------------------------------------------------
 * The sheet
 * ---------------------------------------------------------------------- */

/**
 * Sections of elements on one page, each element its own named layer.
 *
 * The page is only a carrier. It has one small line saying which term and
 * which scope the figures are from — without which a sheet of dials is not
 * evidence — and section headings so the layer tree is navigable, and nothing
 * else. Everything a poster would actually set in type is left for the poster.
 *
 * The paper grows to fit; there is no page size to overflow, because nothing
 * here is meant to be printed as it stands.
 *
 * @param {Object} options
 * @param {string} options.title - what this file is, in one phrase
 * @param {string|null} options.subtitle - term, scope, sample
 * @param {Array} options.sections - from the collectors above
 * @returns {string} a complete <svg> document
 */
export function elementSheetSVG({ title, subtitle = null, sections = [] }) {
  const live = sections.filter((entry) => entry && entry.elements.length > 0);
  if (live.length === 0) {
    throw new Error("elementSheetSVG: nothing to draw");
  }

  // The paper is sized from the elements, not from the dial grid's cell width.
  // A section asking for two columns of 250-unit plots needs 500 units of
  // content whatever a dial happens to measure; taking the width from CELL_W
  // instead drew the history plots 45 units off the right edge of their own
  // page, which an SVG will happily do and no viewer will warn about.
  const contentWidth = Math.max(
    ...live.map((entry) => {
      const perRow = entry.columns || COLUMNS;
      const widest = Math.max(...entry.elements.map((element) => element.width));
      return perRow * widest;
    })
  );
  const width = M * 2 + contentWidth;
  const parts = [];
  let y = M + 6;

  parts.push(
    svgText(M, y, [title, subtitle].filter(Boolean).join("  ·  "), {
      size: 6.5,
      fill: SB_MUTED,
    })
  );
  y += 5;
  parts.push(svgRule(M, y, width - M * 2, SB_RULE, 1));
  y += 22;

  live.forEach((entry) => {
    const sectionParts = [];
    let inner = 0;

    sectionParts.push(
      svgText(0, inner, entry.title, { size: 9, weight: 700, fill: SB_INK })
    );
    inner += 4;
    sectionParts.push(svgRule(0, inner, width - M * 2, SB_RULE, 0.5));
    inner += 12;
    if (entry.lede) {
      sectionParts.push(svgText(0, inner, entry.lede, { size: 6.5, fill: SB_BODY }));
      inner += 12;
    }

    // Rows are as tall as their tallest element, so a grid mixing a dial with
    // a sub-line and one without does not overlap.
    const perRow = entry.columns || COLUMNS;
    const cellWidth = (width - M * 2) / perRow;
    for (let start = 0; start < entry.elements.length; start += perRow) {
      const row = entry.elements.slice(start, start + perRow);
      const tallest = Math.max(...row.map((element) => element.height));
      row.forEach((element, index) => {
        // Centred in its column, so a wide plot and a narrow dial sit on the
        // same rhythm.
        const x = cellWidth * index + (cellWidth - element.width) / 2;
        sectionParts.push(placeElement(element, x, inner));
      });
      inner += tallest + ROW_GAP;
    }

    parts.push(
      `<g id="${entry.id}" data-name="${esc(entry.title)}" transform="translate(${n1(
        M
      )} ${n1(y)})">${sectionParts.join("")}</g>`
    );
    y += inner + SECTION_GAP;
  });

  const height = y + M;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n1(width)}" height="${n1(
      height
    )}" viewBox="0 0 ${n1(width)} ${n1(height)}" font-family="${FONT_STACK}">`,
    svgRect(0, 0, width, height, PAPER),
    parts.join(""),
    "</svg>",
  ].join("");
}
