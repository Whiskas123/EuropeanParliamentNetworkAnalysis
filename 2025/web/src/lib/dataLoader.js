// Cache for loaded data
const dataCache = {};

// Cache for voting sessions counts
const votingSessionsCache = {};

// baselines.json, fetched at most once per page load. Held as the in-flight
// promise rather than the parsed result so that several panels asking for a
// baseline at the same moment share one request.
let baselinesPromise = null;

/**
 * Load the baseline reference figures for every mandate.
 * ~60 KB for all five terms; see scripts/build-baselines.js.
 * @returns {Promise<Object|null>}
 */
async function loadBaselines() {
  if (baselinesPromise === null) {
    baselinesPromise = fetch("/data/baselines.json")
      .then((response) => (response.ok ? response.json() : null))
      .catch((error) => {
        console.warn("Baselines not available:", error);
        return null;
      });
  }
  return baselinesPromise;
}

/**
 * The reference figures the current view should be compared against.
 *
 * Always the same view with exactly one filter removed, so a delta isolates a
 * single variable rather than mixing two:
 *
 *   country + subject -> that country across all policy areas
 *   subject only      -> the whole Parliament across all policy areas
 *   country only      -> the whole Parliament
 *   neither           -> null, the view is already the baseline
 *
 * @param {number} mandate
 * @param {string|null} country
 * @param {string|null} subject
 * @returns {Promise<{scores: Object, label: string, comparing: string}|null>}
 */
export async function getBaseline(mandate, country = null, subject = null) {
  if (!country && !subject) return null;

  const all = await loadBaselines();
  const forMandate = all && all[String(mandate)];
  if (!forMandate) return null;

  if (subject) {
    // A country with no baseline of its own (one that never had a country
    // network generated) falls back to the whole Parliament. The delta then
    // mixes the country and subject effects, so the label has to say so.
    const scoped = country ? forMandate[country] : null;
    if (country && scoped) {
      return {
        scores: scoped,
        label: `${country}, all policy areas`,
        comparing: "subject",
      };
    }
    if (country) {
      return {
        scores: forMandate._all,
        label: "the whole Parliament, all policy areas",
        comparing: "both",
      };
    }
    return {
      scores: forMandate._all,
      label: "all policy areas",
      comparing: "subject",
    };
  }

  return {
    scores: forMandate._all,
    label: "the whole Parliament",
    comparing: "country",
  };
}

/**
 * Baseline score for a pair of political groups, in either order.
 * @param {Object|null} baseline - as returned by getBaseline
 * @param {string} groupA
 * @param {string} groupB
 * @returns {number|null}
 */
export function baselineForGroupPair(baseline, groupA, groupB) {
  const key = [groupA, groupB].sort().join("|");
  const value = baseline?.scores?.intergroup?.[key];
  return typeof value === "number" ? value : null;
}

// country_similarity.json, fetched at most once per page load.
let countrySimilarityPromise = null;

/**
 * Each MEP's average agreement with their compatriots.
 *
 * Published rather than derived in the browser because it is the one figure
 * the MEP panel shows that cannot survive reading the precomputed layout: that
 * file's edge array is filtered to weight > 0.6 for legibility, and averaging
 * over it counts an MEP's agreements while dropping their disagreements —
 * measured at 17 percentage points of error on average, 56 at worst.
 *
 * See scripts/build-country-similarity.js.
 */
async function loadCountrySimilarity() {
  if (countrySimilarityPromise === null) {
    countrySimilarityPromise = fetch("/data/country_similarity.json")
      .then((response) => (response.ok ? response.json() : null))
      .catch((error) => {
        console.warn("Country similarity not available:", error);
        return null;
      });
  }
  return countrySimilarityPromise;
}

/**
 * The country-similarity lookup for one view.
 *
 * A country view needs no entry of its own: restricting the network to a
 * single country keeps every pair of compatriots, so an MEP's figure there is
 * the same as in the full view.
 *
 * @returns {Promise<Object|null>} mepId to [score, count]
 */
export async function getCountrySimilarity(mandate, subject = null) {
  const all = await loadCountrySimilarity();
  const forMandate = all && all[String(mandate)];
  if (!forMandate) return null;
  return (subject ? forMandate[subject] : forMandate._all) || null;
}

/**
 * Load MEP info for a mandate
 * @param {number} mandate - Mandate number
 * @returns {Promise<Object|null>} MEP info object keyed by MEP ID or null if not found
 */
async function loadMEPInfo(mandate) {
  try {
    const url = `/data/precomputed/mep_info_${mandate}.json`;
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn(`MEP info not found for mandate ${mandate}:`, error);
    return null;
  }
}

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
    const precomputed = await response.json();

    // Load and merge MEP info
    const mepInfo = await loadMEPInfo(mandate);
    if (mepInfo && precomputed.nodes) {
      precomputed.nodes = precomputed.nodes.map((node) => {
        const info = mepInfo[node.id];
        if (info) {
          return {
            ...node,
            photoURL: info.photoURL,
            partyNames: info.partyNames,
            groups: info.groups,
          };
        }
        return node;
      });
    }

    return precomputed;
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
    // Counts come precomputed from the data pipeline. This used to fetch
    // /data/enriched_data/ep_votes_{mandate}.json and count vote ids in the
    // browser - a 500-850 MB download per mandate just to produce one number.
    if (votingSessionsCache.__counts === undefined) {
      const response = await fetch(`/data/voting_sessions.json`);
      votingSessionsCache.__counts = response.ok ? await response.json() : null;
    }
    const counts = votingSessionsCache.__counts;
    if (!counts || !counts[mandate]) {
      console.warn(`No voting-session counts for mandate ${mandate}`);
      return null;
    }

    const entry = counts[mandate];
    const count = subject
      ? (entry.bySubject && entry.bySubject[subject]) || 0
      : entry.total;

    votingSessionsCache[cacheKey] = count;
    return count;
  } catch (error) {
    console.error(
      `Error reading voting session counts for mandate ${mandate}${
        subject ? ` - ${subject}` : ""
      }:`,
      error
    );
    return null;
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

    // Try to load positions, similarity scores, agreement scores, and cohesion data from precomputed layout
    const precomputed = await loadPrecomputedLayout(mandate, country, subject);
    const positionMap = new Map();
    let similarityScores = null;
    let agreementScores = null;
    let cohesionData = null;
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
    // Load agreement scores from precomputed layout
    // If subject is selected, also load all-subjects agreement scores (for "All Subjects" dropdown option)
    // Always prefer all-subjects agreement scores to ensure they're calculated from all edges
    if (subject && !country) {
      const allSubjectsPrecomputed = await loadPrecomputedLayout(
        mandate,
        null,
        null
      );
      if (allSubjectsPrecomputed && allSubjectsPrecomputed.agreementScores) {
        // Use all-subjects agreement scores to ensure "All Subjects" shows correct values
        agreementScores = allSubjectsPrecomputed.agreementScores;
      } else if (precomputed && precomputed.agreementScores) {
        // Fallback to subject-specific agreement scores if all-subjects not available
        agreementScores = precomputed.agreementScores;
      }
    } else if (precomputed && precomputed.agreementScores) {
      agreementScores = precomputed.agreementScores;
    }
    // Load cohesion data from precomputed layout
    if (precomputed && precomputed.cohesionData) {
      cohesionData = {
        ...precomputed.cohesionData,
        intergroupCohesion: precomputed.cohesionData.intergroupCohesion
          ? {
              ...precomputed.cohesionData.intergroupCohesion,
              groupColors: new Map(
                Object.entries(
                  precomputed.cohesionData.intergroupCohesion.groupColors || {}
                )
              ),
            }
          : null,
      };
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

    // Filter nodes to only include those present in the edges when subject is selected
    // This ensures the network only shows MEPs that actually participated in the selected subject
    if (subject && edges.length > 0) {
      const nodeIdsInEdges = new Set();
      edges.forEach((edge) => {
        nodeIdsInEdges.add(edge.source);
        nodeIdsInEdges.add(edge.target);
      });
      nodes = nodes.filter((node) => nodeIdsInEdges.has(node.id));
      
      // Filter similarity scores to only include nodes in the network
      if (similarityScores) {
        const filteredSimilarityScores = {};
        nodes.forEach((node) => {
          if (similarityScores[node.id]) {
            filteredSimilarityScores[node.id] = similarityScores[node.id];
          }
        });
        similarityScores = filteredSimilarityScores;
      }
      
      // Filter agreement scores to only include nodes in the network
      if (agreementScores) {
        const filteredAgreementScores = {};
        nodes.forEach((node) => {
          if (agreementScores[node.id]) {
            filteredAgreementScores[node.id] = agreementScores[node.id];
          }
        });
        agreementScores = filteredAgreementScores;
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
      // Filter agreement scores to only include country nodes
      let filteredAgreementScores = null;
      if (agreementScores) {
        filteredAgreementScores = {};
        countryNodes.forEach((node) => {
          if (agreementScores[node.id]) {
            filteredAgreementScores[node.id] = agreementScores[node.id];
          }
        });
      }
      return {
        nodes: countryNodes,
        edges: countryEdges,
        metadata,
        similarityScores: filteredSimilarityScores,
        agreementScores: filteredAgreementScores,
        cohesionData: cohesionData,
      };
    }

    return {
      nodes,
      edges,
      metadata,
      similarityScores,
      agreementScores,
      cohesionData,
    };
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
 * Tries JSON format first (all edges), then precomputed layout
 * @param {number} mandate - Mandate number
 * @param {string|null} country - Country name (optional, for country-filtered network)
 * @param {string|null} subject - Subject name (optional, for subject-filtered network)
 * @returns {Promise<Object>} Object with nodes and edges arrays
 */
export async function loadMandateData(mandate, country = null, subject = null) {
  try {
    // The precomputed layout is tried first and data.json only as a fallback.
    // The two differ by a factor of twenty in size — 16 MB against 305 MB —
    // and the small one already carries positions, agreement scores,
    // similarity scores, cohesion and the subject list. It used to be the
    // other way round, which meant a 305 MB download every time a filter
    // changed.
    //
    // The one thing it cannot supply is a correct average over all edges: its
    // `edges` array is filtered to weight > 0.6 so the drawing stays legible.
    // Everything numeric the UI reads is therefore taken from fields computed
    // at precompute time over the complete edge set — `agreementScores`,
    // `cohesionData` — or from a published side file, in the single case of
    // per-MEP country similarity. Verified before the switch: agreement scores
    // match the full set exactly, and no MEP's five closest neighbours change.
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

      // Convert groupColors from object back to Map for cohesion data
      let cohesionData = null;
      if (precomputed.cohesionData) {
        cohesionData = {
          ...precomputed.cohesionData,
          intergroupCohesion: precomputed.cohesionData.intergroupCohesion
            ? {
                ...precomputed.cohesionData.intergroupCohesion,
                groupColors: new Map(
                  Object.entries(
                    precomputed.cohesionData.intergroupCohesion.groupColors ||
                      {}
                  )
                ),
              }
            : null,
        };
      }

      // If subject is selected, also load all-subjects agreement scores (for "All Subjects" dropdown option)
      // Always prefer all-subjects agreement scores to ensure they're calculated from all edges
      let agreementScores = precomputed.agreementScores || null;
      if (subject && !country) {
        const allSubjectsPrecomputed = await loadPrecomputedLayout(
          mandate,
          null,
          null
        );
        if (allSubjectsPrecomputed && allSubjectsPrecomputed.agreementScores) {
          // Use all-subjects agreement scores to ensure "All Subjects" shows correct values
          agreementScores = allSubjectsPrecomputed.agreementScores;
        }
      }

      return {
        nodes: precomputed.nodes,
        edges: precomputed.edges,
        agreementScores: agreementScores,
        similarityScores: precomputed.similarityScores || null,
        cohesionData: cohesionData, // Precomputed cohesion data
        // The only statistic with no correct source in this file; see
        // loadCountrySimilarity above.
        countrySimilarityByMep: await getCountrySimilarity(mandate, subject),
        subjects: precomputed.subjects || null, // Precomputed subjects list with >5 voting sessions
        votingSessions: precomputed.votingSessions || null, // Voting sessions data
        metadata: metadata,
      };
    }

    // Fallback: the full data.json. Reached when a view has no precomputed
    // file of its own — chiefly a country x subject combination that was never
    // generated. Correct but slow, so it is the exception rather than, as
    // before, the default path for every view.
    console.warn(
      `No precomputed layout for mandate ${mandate}${
        country ? ` - ${country}` : ""
      }${subject ? ` - ${subject}` : ""}; falling back to data.json`
    );
    const jsonData = await loadJsonData(mandate, country, subject);
    if (jsonData && jsonData.nodes && jsonData.edges) {
      return {
        ...jsonData,
        countrySimilarityByMep: await getCountrySimilarity(mandate, subject),
      };
    }

    // No data found - throw error instead of falling back to CSV
    throw new Error(
      `No data found for mandate ${mandate}${country ? ` - ${country}` : ""}${
        subject ? ` - ${subject}` : ""
      }. Please ensure data.json or precomputed layout files exist.`
    );
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
