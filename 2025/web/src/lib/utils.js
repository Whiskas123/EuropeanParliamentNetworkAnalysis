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
    "Verts/ALE": "Greens/European Free Alliance",
    "Greens/EFA": "Greens/European Free Alliance",
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

// Helper function to get flag emoji from country name
export function getCountryFlag(countryName) {
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

  if (!code || code.length !== 2) {
    return "🏳️"; // Default flag if country not found
  }

  // Convert country code to flag emoji
  const codePoints = code
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt());
  return String.fromCodePoint(...codePoints);
}

