import Papa from "papaparse";

// Cache for loaded data
const dataCache = {};

// Cache for voting sessions counts
const votingSessionsCache = {};

/**
 * Load precomputed layout data for a mandate
 * @param {number} mandate - Mandate number
 * @param {string|null} country - Country name (optional, for country-filtered network)
 * @param {string|null} subject - Subject name (optional, for subject-filtered network)
 * @returns {Promise<Object|null>} Precomputed data or null if not found
 */
async function loadPrecomputedLayout(mandate, country = null, subject = null) {
  try {
    let url;
    const subjectKey = subject ? subject.replace(/[^a-zA-Z0-9]/g, "_") : null;

    if (country && subject) {
      const countryKey = country.replace(/\s+/g, "_");
      url = `/data/precomputed/mandate_${mandate}_${countryKey}_subject_${subjectKey}.json`;
    } else if (subject) {
      url = `/data/precomputed/mandate_${mandate}_subject_${subjectKey}.json`;
    } else if (country) {
      const countryKey = country.replace(/\s+/g, "_");
      url = `/data/precomputed/mandate_${mandate}_${countryKey}.json`;
    } else {
      url = `/data/precomputed/mandate_${mandate}.json`;
    }
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn(
      `Precomputed layout not found for mandate ${mandate}${
        country ? ` - ${country}` : ""
      }${subject ? ` - ${subject}` : ""}:`,
      error
    );
    return null;
  }
}

/**
 * Count unique voting sessions from ep_votes
 * @param {number} mandate - Mandate number
 * @param {string|null} subject - Subject name (optional, for subject-filtered count)
 * @returns {Promise<number|null>} Number of unique voting sessions or null if error
 */
async function countVotingSessions(mandate, subject = null) {
  const cacheKey = `votingSessions_${mandate}_${subject || "all"}`;

  if (votingSessionsCache[cacheKey] !== undefined) {
    return votingSessionsCache[cacheKey];
  }

  try {
    const url = `/data/enriched_data/ep_votes_${mandate}.json`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Could not load ep_votes for mandate ${mandate}`);
      return null;
    }

    const epVotes = await response.json();

    // Filter by subject if specified, then count unique voteids
    let votesToCount = epVotes;
    if (subject) {
      votesToCount = epVotes.filter((vote) => vote.subject === subject);
    }

    // Count unique voteids
    const uniqueVoteIds = new Set(votesToCount.map((vote) => vote.voteid));
    const count = uniqueVoteIds.size;

    votingSessionsCache[cacheKey] = count;
    return count;
  } catch (error) {
    console.error(
      `Error counting voting sessions for mandate ${mandate}${
        subject ? ` - ${subject}` : ""
      }:`,
      error
    );
    return null;
  }
}
export async function loadNodes(mandate) {
  const cacheKey = `nodes_${mandate}`;

  if (dataCache[cacheKey]) {
    return dataCache[cacheKey];
  }

  try {
    const response = await fetch(`/data/mandate_${mandate}/nodes.csv`);
    const text = await response.text();

    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const nodes = results.data.map((row, index) => ({
            id: row.Id,
            label: row.FullName,
            country: row.Country,
            groupId: row.GroupID,
            x: Math.random() * 1000, // Initial random position
            y: Math.random() * 1000,
            size: 5,
            color: getGroupColor(row.GroupID),
          }));
          dataCache[cacheKey] = nodes;
          resolve(nodes);
        },
        error: (error) => reject(error),
      });
    });
  } catch (error) {
    console.error(`Error loading nodes for mandate ${mandate}:`, error);
    throw error;
  }
}

/**
 * Load edges CSV for a specific mandate
 * @param {number} mandate - Mandate number (6, 7, 8, 9, or 10)
 * @returns {Promise<Array>} Array of edge objects
 */
export async function loadEdges(mandate) {
  const cacheKey = `edges_${mandate}`;

  if (dataCache[cacheKey]) {
    return dataCache[cacheKey];
  }

  try {
    const response = await fetch(`/data/mandate_${mandate}/edges.csv`);
    const text = await response.text();

    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const edges = results.data.map((row) => ({
            source: row.Source,
            target: row.Target,
            weight: parseFloat(row.Weight) || 0,
            size: parseFloat(row.Weight) || 0,
          }));
          dataCache[cacheKey] = edges;
          resolve(edges);
        },
        error: (error) => reject(error),
      });
    });
  } catch (error) {
    console.error(`Error loading edges for mandate ${mandate}:`, error);
    throw error;
  }
}

/**
 * Load data from JSON format (includes all edges, normalized to [0,1])
 * Also tries to load positions from precomputed layout if available
 * @param {number} mandate - Mandate number
 * @param {string|null} country - Country name (optional, for country-filtered network)
 * @param {string|null} subject - Subject name (optional, for subject-filtered network)
 * @returns {Promise<Object|null>} Data object or null if not found
 */
async function loadJsonData(mandate, country = null, subject = null) {
  try {
    const url = `/data/mandate_${mandate}/data.json`;
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();

    // Try to load positions and similarity scores from precomputed layout
    const precomputed = await loadPrecomputedLayout(mandate, country, subject);
    const positionMap = new Map();
    let similarityScores = null;
    if (precomputed && precomputed.nodes) {
      precomputed.nodes.forEach((node) => {
        if (node.x !== undefined && node.y !== undefined) {
          positionMap.set(node.id, { x: node.x, y: node.y });
        }
      });
    }
    if (precomputed && precomputed.similarityScores) {
      similarityScores = precomputed.similarityScores;
    }

    // Convert JSON format to expected format
    let nodes = data.nodes.map((node) => {
      const nodeData = {
        id: node.Id,
        label: node.FullName,
        country: node.Country,
        groupId: node.GroupID,
        color: getGroupColor(node.GroupID),
        // Include additional MEP information
        partyNames: node.PartyNames || [],
        photoURL: node.PhotoURL || null,
        groups: node.Groups || [], // Array of {groupid, start, end}
      };

      // Add positions from precomputed layout if available
      const positions = positionMap.get(node.Id);
      if (positions) {
        nodeData.x = positions.x;
        nodeData.y = positions.y;
      }

      return nodeData;
    });

    // Get edges - either from subject or all edges
    let edges;
    if (subject && data.edgesBySubject && data.edgesBySubject[subject]) {
      edges = data.edgesBySubject[subject].map((edge) => ({
        source: edge.Source,
        target: edge.Target,
        weight: parseFloat(edge.Weight) || 0,
      }));
    } else {
      edges = data.edges.map((edge) => ({
        source: edge.Source,
        target: edge.Target,
        weight: edge.Weight, // Already normalized to [0,1]
      }));
    }

    // Extract metadata if available
    let metadata = data.metadata || {};

    // If subject is specified, count unique voting sessions for that subject
    if (subject) {
      const subjectVotingSessions = await countVotingSessions(mandate, subject);
      metadata = {
        ...metadata,
        votingSessions: subjectVotingSessions,
      };
    } else if (!metadata.votingSessions) {
      // For general case, count all unique voting sessions if not in metadata
      const allVotingSessions = await countVotingSessions(mandate, null);
      if (allVotingSessions !== null) {
        metadata = {
          ...metadata,
          votingSessions: allVotingSessions,
        };
      }
    }

    // Filter by country if requested
    if (country) {
      const countryNodes = nodes.filter((node) => node.country === country);
      const countryNodeIds = new Set(countryNodes.map((n) => n.id));
      const countryEdges = edges.filter(
        (edge) =>
          countryNodeIds.has(edge.source) && countryNodeIds.has(edge.target)
      );
      // Filter similarity scores to only include country nodes
      let filteredSimilarityScores = null;
      if (similarityScores) {
        filteredSimilarityScores = {};
        countryNodes.forEach((node) => {
          if (similarityScores[node.id]) {
            filteredSimilarityScores[node.id] = similarityScores[node.id];
          }
        });
      }
      return {
        nodes: countryNodes,
        edges: countryEdges,
        metadata,
        similarityScores: filteredSimilarityScores,
      };
    }

    return { nodes, edges, metadata, similarityScores };
  } catch (error) {
    console.warn(
      `JSON data not found for mandate ${mandate}${
        country ? ` - ${country}` : ""
      }${subject ? ` - ${subject}` : ""}:`,
      error
    );
    return null;
  }
}

/**
 * Load both nodes and edges for a mandate
 * Tries JSON format first (all edges), then precomputed layout, then CSV
 * @param {number} mandate - Mandate number
 * @param {string|null} country - Country name (optional, for country-filtered network)
 * @param {string|null} subject - Subject name (optional, for subject-filtered network)
 * @returns {Promise<Object>} Object with nodes and edges arrays
 */
export async function loadMandateData(mandate, country = null, subject = null) {
  try {
    // Try to load from JSON format first (includes all edges, normalized to [0,1])
    const jsonData = await loadJsonData(mandate, country, subject);
    if (jsonData && jsonData.nodes && jsonData.edges) {
      console.log(
        `Using JSON data for mandate ${mandate}${
          country ? ` - ${country}` : ""
        }${subject ? ` - ${subject}` : ""} (includes all edges)`
      );
      return jsonData;
    }

    // Try to load precomputed layout second
    const precomputed = await loadPrecomputedLayout(mandate, country, subject);
    if (precomputed && precomputed.nodes && precomputed.edges) {
      console.log(
        `Using precomputed layout for mandate ${mandate}${
          country ? ` - ${country}` : ""
        }${subject ? ` - ${subject}` : ""}`
      );

      // Use voting sessions from precomputed data if available
      let metadata = precomputed.metadata || {};
      if (precomputed.votingSessions) {
        if (subject && precomputed.votingSessions.bySubject) {
          // Use subject-specific voting sessions count
          metadata.votingSessions =
            precomputed.votingSessions.bySubject[subject] || null;
        } else {
          // Use total voting sessions
          metadata.votingSessions = precomputed.votingSessions.total || null;
        }
      } else {
        // Fallback: count voting sessions from ep_votes if not in precomputed
        if (subject) {
          const subjectVotingSessions = await countVotingSessions(
            mandate,
            subject
          );
          metadata.votingSessions = subjectVotingSessions;
        } else if (!metadata.votingSessions) {
          const allVotingSessions = await countVotingSessions(mandate, null);
          if (allVotingSessions !== null) {
            metadata.votingSessions = allVotingSessions;
          }
        }
      }

      return {
        nodes: precomputed.nodes,
        edges: precomputed.edges,
        agreementScores: precomputed.agreementScores || null,
        similarityScores: precomputed.similarityScores || null,
        subjects: precomputed.subjects || null, // Precomputed subjects list with >5 voting sessions
        votingSessions: precomputed.votingSessions || null, // Voting sessions data
        metadata: metadata,
      };
    }

    // Fall back to loading from CSV and computing layout
    // Note: CSV only has edges with weight > 0 (negative edges filtered out)
    console.log(
      `Computing layout for mandate ${mandate}${
        country ? ` - ${country}` : ""
      }${subject ? ` - ${subject}` : ""} (no precomputed data found)`
    );
    const [nodes, edges] = await Promise.all([
      loadNodes(mandate),
      loadEdges(mandate),
    ]);

    // If country filter is requested, filter nodes and edges
    if (country) {
      const countryNodes = nodes.filter((node) => node.country === country);
      const countryNodeIds = new Set(countryNodes.map((n) => n.id));
      const countryEdges = edges.filter(
        (edge) =>
          countryNodeIds.has(edge.source) && countryNodeIds.has(edge.target)
      );
      return { nodes: countryNodes, edges: countryEdges };
    }

    return { nodes, edges };
  } catch (error) {
    console.error(
      `Error loading mandate ${mandate}${country ? ` - ${country}` : ""}${
        subject ? ` - ${subject}` : ""
      } data:`,
      error
    );
    throw error;
  }
}

/**
 * Get color for a GroupID
 * @param {string} groupId - Political group ID
 * @returns {string} Hex color code
 */
function getGroupColor(groupId) {
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

/**
 * Clear the data cache
 */
export function clearCache() {
  Object.keys(dataCache).forEach((key) => delete dataCache[key]);
}
