"use client";

import React from "react";
import * as Flags from "country-flag-icons/react/3x2";

// Helper function to get country code from country name (exported for use in other files)
export function getCountryCode(countryName) {
  // Handle EU flag
  if (countryName === "EU" || countryName === "European Union") {
    return "EU";
  }

  const countryToCode = {
    Austria: "AT",
    Belgium: "BE",
    Bulgaria: "BG",
    Croatia: "HR",
    Cyprus: "CY",
    Czechia: "CZ",
    "Czech Republic": "CZ",
    Denmark: "DK",
    Estonia: "EE",
    Finland: "FI",
    France: "FR",
    Germany: "DE",
    Greece: "GR",
    Hungary: "HU",
    Ireland: "IE",
    Italy: "IT",
    Latvia: "LV",
    Lithuania: "LT",
    Luxembourg: "LU",
    Malta: "MT",
    Netherlands: "NL",
    Poland: "PL",
    Portugal: "PT",
    Romania: "RO",
    Slovakia: "SK",
    Slovenia: "SI",
    Spain: "ES",
    Sweden: "SE",
    "United Kingdom": "GB",
    UK: "GB",
  };

  const code =
    countryToCode[countryName] || countryName?.substring(0, 2).toUpperCase();

  // Allow EU code (2 characters) or standard 2-character country codes
  if (!code || (code.length !== 2 && code !== "EU")) {
    return null;
  }

  return code.toUpperCase();
}

// CountryFlag component to display country flags using country-flag-icons
export function CountryFlag({ country, className = "", style = {}, title, size = "1em" }) {
  const code = getCountryCode(country);
  
  if (!code) {
    // Return a default placeholder if country not found
    return (
      <span className={className} style={style} title={title || country}>
        🏳️
      </span>
    );
  }

  // Get the flag component dynamically
  const FlagComponent = Flags[code];
  
  if (!FlagComponent) {
    // Fallback to emoji if flag component doesn't exist
    const codePoints = code
      .split("")
      .map((char) => 127397 + char.charCodeAt());
    const emojiFlag = String.fromCodePoint(...codePoints);
    return (
      <span className={className} style={style} title={title || country}>
        {emojiFlag}
      </span>
    );
  }

  // Apply sizing to SVG flags - use CSS to control size via font-size
  const flagStyle = {
    display: "inline-block",
    verticalAlign: "middle",
    width: "1em",
    height: "1em",
    ...style,
  };

  return (
    <FlagComponent
      className={className}
      style={flagStyle}
      title={title || country}
    />
  );
}

// Helper function to normalize group ID to family (for detecting group changes)
export function getGroupFamily(groupId) {
  // Groups that are considered the same family
  if (groupId === "IND/DEM" || groupId === "EFD" || groupId === "EFDD") {
    return "EFDD"; // Use EFDD as the canonical family name
  }
  if (groupId === "PSE" || groupId === "PES" || groupId === "S&D") {
    return "S&D"; // Use S&D as the canonical family name
  }
  if (groupId === "GUE/NGL" || groupId === "The Left") {
    return "The Left"; // Use The Left as the canonical family name
  }
  if (
    groupId === "PPE-DE" ||
    groupId === "EPP-ED" ||
    groupId === "PPE" ||
    groupId === "EPP"
  ) {
    return "EPP"; // Use EPP as the canonical family name
  }
  if (groupId === "ENF" || groupId === "ID" || groupId === "PfE") {
    return "ID"; // Use ID as the canonical family name (Identity and Democracy family)
  }
  // For all other groups, return as-is
  return groupId;
}

// Helper function to get acronym for a group (for heatmap labels)
export function getGroupAcronym(groupId, mandate = null) {
  // Handle GUE/NGL and The Left based on mandate
  // For 9th and 10th term, GUE/NGL should be displayed as "The Left"
  // For earlier terms, GUE/NGL stays as "GUE/NGL"
  if (groupId === "GUE/NGL") {
    if (mandate !== null && mandate >= 9) {
      return "The Left";
    }
    return "GUE/NGL";
  }
  if (groupId === "The Left") {
    return "The Left";
  }
  // Map old group names to current acronyms
  if (groupId === "Verts/ALE") {
    return "Greens/EFA";
  }
  if (groupId === "PPE") {
    return "EPP";
  }
  if (groupId === "PPE-DE") {
    return "EPP-ED";
  }
  if (groupId === "NonAttached") {
    return "Non attached";
  }
  if (groupId === "PSE") {
    return "PES";
  }
  // For all other groups, return the groupId as-is (it's already the acronym)
  return groupId;
}

// Helper function to get full display name for a group
export function getGroupDisplayName(groupId, mandate = null) {
  // Handle GUE/NGL and The Left based on mandate
  // Prior to 9th term, GUE/NGL was the name, meaning "European United Left/Nordic Green Left"
  // From 9th term onwards, it was renamed to "The Left"
  if (groupId === "GUE/NGL") {
    if (mandate !== null && mandate < 9) {
      return "European United Left/Nordic Green Left (GUE/NGL)";
    }
    return "The Left";
  }
  if (groupId === "The Left") {
    return "The Left";
  }

  const displayNames = {
    "Verts/ALE": "Greens/European Free Alliance (Greens/EFA)",
    "Greens/EFA": "Greens/European Free Alliance (Greens/EFA)",
    "S&D": "Progressive Alliance of Socialists and Democrats (S&D)",
    PSE: "Party of European Socialists (PSE)",
    ALDE: "Alliance of Liberals and Democrats for Europe (ALDE)",
    RE: "Renew Europe (RE)",
    Renew: "Renew Europe",
    PPE: "European People's Party (EPP)",
    EPP: "European People's Party (EPP)",
    "PPE-DE": "European People's Party - European Democrats (EPP-ED)",
    "EPP-ED": "European People's Party - European Democrats (EPP-ED)",
    ECR: "European Conservatives and Reformists (ECR)",
    EFDD: "Europe of Freedom and Direct Democracy (EFDD)",
    ENF: "Europe of Nations and Freedom (ENF)",
    ID: "Identity and Democracy (ID)",
    PfE: "Patriots for Europe (PfE)",
    ESN: "Europe of Sovereign Nations (ESN)",
    UEN: "Union for Europe of the Nations (UEN)",
    "IND/DEM": "Independence/Democracy (IND/DEM)",
    NI: "Non-Inscrits",
    NonAttached: "Non attached",
  };
  return displayNames[groupId] || groupId;
}

// Helper function to get color from intensity (0 to 1) using red-to-green colormap
// Same colormap as used in Jupyter notebook: red -> orange -> yellow -> green
export function getRedGreenColor(intensity) {
  // Clamp intensity to [0, 1]
  const t = Math.max(0, Math.min(1, intensity));

  // Red-to-green colormap colors (from Jupyter notebook)
  // ['#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#1a9850']
  const colors = [
    { r: 215, g: 48, b: 39 }, // #d73027 - red
    { r: 244, g: 109, b: 67 }, // #f46d43 - red-orange
    { r: 253, g: 174, b: 97 }, // #fdae61 - orange
    { r: 254, g: 224, b: 139 }, // #fee08b - yellow-orange
    { r: 255, g: 255, b: 191 }, // #ffffbf - light yellow
    { r: 230, g: 245, b: 152 }, // #e6f598 - light green
    { r: 171, g: 221, b: 164 }, // #abdda4 - green
    { r: 102, g: 194, b: 165 }, // #66c2a5 - dark green
    { r: 26, g: 152, b: 80 }, // #1a9850 - darker green
  ];

  // Map intensity [0, 1] to color index [0, 8]
  const colorIndex = t * (colors.length - 1);
  const lowerIndex = Math.floor(colorIndex);
  const upperIndex = Math.min(colors.length - 1, lowerIndex + 1);
  const localT = colorIndex - lowerIndex;

  // Interpolate between colors
  const lowerColor = colors[lowerIndex];
  const upperColor = colors[upperIndex];

  return {
    r: Math.round(lowerColor.r + (upperColor.r - lowerColor.r) * localT),
    g: Math.round(lowerColor.g + (upperColor.g - lowerColor.g) * localT),
    b: Math.round(lowerColor.b + (upperColor.b - lowerColor.b) * localT),
  };
}

// Helper function to get color for a GroupID
export function getGroupColor(groupId) {
  const colorMap = {
    "PPE-DE": "#3399CC",
    PSE: "#FF0000",
    ALDE: "#FFD700",
    "Verts/ALE": "#009900",
    "GUE/NGL": "#800080",
    "The Left": "#800080", // Same as GUE/NGL (mandate 10)
    ECR: "#000080",
    EFD: "#24b9b9",
    EFDD: "#24b9b9",
    "IND/DEM": "#24b9b9", // Same as EFDD
    ENF: "#000000",
    NI: "#808080",
    UEN: "#FFA500",
    PPE: "#3399CC",
    "S&D": "#FF0000",
    Renew: "#FFD700",
    RE: "#FFD700", // Renew Europe - yellow
    "Greens/EFA": "#009900",
    ID: "#000000",
    PfE: "#000000", // Patriots for Europe - black
    ESN: "#8B4513", // European Sovereign Nations - brown
  };

  return colorMap[groupId] || "#CCCCCC";
}

// Helper function to get flag emoji from country name (deprecated - use CountryFlag component instead)
export function getCountryFlag(countryName) {
  const code = getCountryCode(countryName);
  if (!code) {
    return "🏳️"; // Default flag if country not found
  }

  // Convert country code to flag emoji
  const codePoints = code
    .split("")
    .map((char) => 127397 + char.charCodeAt());
  return String.fromCodePoint(...codePoints);
}

// Helper function to get emoji for a subject
export function getSubjectEmoji(subjectName) {
  if (!subjectName) return "";

  const subjectLower = subjectName.toLowerCase().trim();

  // Simple dictionary mapping predefined subjects to emojis
  const subjectEmojiMap = {
    "culture and education": "🎭",
    "transport and tourism": "🚗",
    "legal affairs": "⚖️",
    "civil liberties, justice and home affairs": "🏛️",
    "international trade": "🤝",
    "constitutional affairs": "📜",
    "economic and monetary affairs": "💼",
    others: "📋",
    fisheries: "🐟",
    "foreign affairs": "🌐",
    "budgetary control": "💰",
    "industry, research and energy": "⚙️",
    budgets: "💵",
    petitions: "📝",
    "internal market and consumer protection": "🛒",
    "environment, climate and food safety": "🌍",
    "regional development": "🏘️",
    "employment and social affairs": "👔",
    "public health": "🏥",
    "agriculture and rural development": "🌾",
    // Lookup is by subjectName.toLowerCase(), so the key has to be lowercase
    // too - and has to carry the same curly apostrophe the data uses, or it
    // silently falls through to the default icon.
    "women’s rights and gender equality": "♀️",
    "security and defence": "🛡️",
    "parliamentary procedure": "🗳️",
  };

  return subjectEmojiMap[subjectLower] || "📋";
}

/**
 * Difference between a score and its baseline, in percentage points.
 *
 * Both inputs are on the [0, 1] scale the networks use. Returns null whenever
 * a comparison would be meaningless — no baseline, a missing group or country,
 * a non-finite score — so callers can render nothing rather than "NaN pp".
 *
 * @param {number|null|undefined} score - the current view's figure
 * @param {number|null|undefined} baseline - the same figure without one filter
 * @returns {{text: string, points: number, direction: -1|0|1}|null}
 */
export function getDelta(score, baseline) {
  if (typeof score !== "number" || !isFinite(score)) return null;
  if (typeof baseline !== "number" || !isFinite(baseline)) return null;

  const points = (score - baseline) * 100;

  // Scores are displayed to one decimal place, so anything below 0.05pp would
  // render as a signed zero next to two identical-looking numbers.
  if (Math.abs(points) < 0.05) {
    return { text: "±0.0", points: 0, direction: 0 };
  }

  const sign = points > 0 ? "+" : "−"; // real minus, to match "+" in width
  return {
    text: `${sign}${Math.abs(points).toFixed(1)}`,
    points,
    direction: points > 0 ? 1 : -1,
  };
}

/**
 * Diverging colour ramp for a signed difference, centred on no change.
 *
 * The red-to-green ramp above encodes "how much agreement"; this one encodes
 * "more or less agreement than usual", so it has to be symmetric around a
 * neutral middle. Sharing the endpoints of getRedGreenColor keeps the two
 * scales reading as one family: green still means more agreement.
 *
 * @param {number} t - signed, clamped to [-1, 1]; 0 is no change
 * @returns {{r: number, g: number, b: number}}
 */
export function getDivergingColor(t) {
  const clamped = Math.max(-1, Math.min(1, t));

  const negative = { r: 215, g: 48, b: 39 }; // #d73027, same red as the ramp above
  const neutral = { r: 242, g: 242, b: 240 }; // near-white, so zero recedes
  const positive = { r: 26, g: 152, b: 80 }; // #1a9850, same green

  const target = clamped < 0 ? negative : positive;
  const weight = Math.abs(clamped);

  return {
    r: Math.round(neutral.r + (target.r - neutral.r) * weight),
    g: Math.round(neutral.g + (target.g - neutral.g) * weight),
    b: Math.round(neutral.b + (target.b - neutral.b) * weight),
  };
}
