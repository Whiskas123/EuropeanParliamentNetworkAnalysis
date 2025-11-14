/**
 * Precompute Force Atlas 2 layouts for all mandates
 * This script computes node positions and saves them as JSON files
 * Run with: node scripts/precompute-layouts.js
 */

const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

// Import graphology modules (using require for Node.js)
const Graph = require("graphology");
const forceAtlas2 = require("graphology-layout-forceatlas2");

const DATA_DIR = path.join(__dirname, "../public/data");
const OUTPUT_DIR = path.join(__dirname, "../public/data/precomputed");
const ENRICHED_DATA_DIR = path.join(__dirname, "../public/data/enriched_data");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Color mapping for groups
function getGroupColor(groupId) {
  const colorMap = {
    "PPE-DE": "#3399CC",
    PSE: "#FF0000",
    ALDE: "#FFD700",
    "Verts/ALE": "#009900",
    "GUE/NGL": "#800080",
    ECR: "#000080",
    EFDD: "#87CEEB",
    ENF: "#000000",
    NI: "#808080",
    UEN: "#FFA500",
    PPE: "#3399CC",
    "S&D": "#FF0000",
    Renew: "#FFD700",
    ECR: "#000080",
    RE: "#FFD700", // Renew Europe - yellow
    "Greens/EFA": "#009900",
    ID: "#000000",
    PfE: "#000000",
    "IND/DEM": "#000000", // Patriots for Europe - black
    ESN: "#8B4513", // European Sovereign Nations - brown
  };
  return colorMap[groupId] || "#CCCCCC";
}

/**
 * Compute similarity scores with subjects for each MEP
 * Returns an object with mepId as key and:
 * - groupSubjectScores: Array of {subject, score, count} for similarity with own group per subject
 * - subjectAgreementScores: Object with subject as key, value is array of {groupId, score, count}
 */
function computeSimilarityScoresWithSubjects(data, nodes, graph) {
  const similarityScores = {};
  const allGroups = new Set(nodes.map((n) => n.groupId).filter(Boolean));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Get all subjects from edgesBySubject
  const subjects = data.edgesBySubject ? Object.keys(data.edgesBySubject) : [];

  if (subjects.length === 0) {
    // No subjects, return empty scores
    nodes.forEach((node) => {
      similarityScores[node.id] = {
        groupSubjectScores: [],
        subjectAgreementScores: {},
      };
    });
    return similarityScores;
  }

  // Build node index map for faster lookups
  const nodeIndexMap = new Map();
  nodes.forEach((node) => {
    nodeIndexMap.set(node.id, node);
  });

  // Build edge index by node for each subject (memory-efficient: only store edges per node)
  const subjectEdgeIndexByNode = {};
  subjects.forEach((subject) => {
    const subjectEdges = data.edgesBySubject[subject] || [];
    const edgeIndex = new Map(); // nodeId -> Map of neighborId -> weight

    subjectEdges.forEach((edge) => {
      const source = edge.Source;
      const target = edge.Target;
      const weight = parseFloat(edge.Weight) || 0;

      if (weight > 0 && nodeIndexMap.has(source) && nodeIndexMap.has(target)) {
        // Add edge in both directions
        if (!edgeIndex.has(source)) {
          edgeIndex.set(source, new Map());
        }
        if (!edgeIndex.has(target)) {
          edgeIndex.set(target, new Map());
        }
        edgeIndex.get(source).set(target, weight);
        edgeIndex.get(target).set(source, weight);
      }
    });

    subjectEdgeIndexByNode[subject] = edgeIndex;
  });

  // For each MEP, calculate scores
  nodes.forEach((node) => {
    const mepId = node.id;
    const mepGroup = node.groupId;
    const groupSubjectScores = [];
    const subjectAgreementScores = {};

    // Process each subject
    subjects.forEach((subject) => {
      const edgeIndex = subjectEdgeIndexByNode[subject];
      if (!edgeIndex || !edgeIndex.has(mepId)) {
        return;
      }

      // Get all edges connected to this MEP (only edges for this node, not all edges)
      const connectedEdges = [];
      const neighborEdges = edgeIndex.get(mepId);
      for (const [neighborId, weight] of neighborEdges.entries()) {
        if (weight > 0 && nodeIndexMap.has(neighborId)) {
          const neighborNode = nodeIndexMap.get(neighborId);
          connectedEdges.push({
            neighborId: neighborNode.id,
            neighborGroup: neighborNode.groupId,
            weight,
          });
        }
      }

      // Calculate groupSubjectScores (similarity with own group per subject)
      if (mepGroup) {
        const groupEdges = connectedEdges.filter(
          (e) => e.neighborGroup === mepGroup
        );
        if (groupEdges.length > 0) {
          const avgScore =
            groupEdges.reduce((sum, e) => sum + e.weight, 0) /
            groupEdges.length;
          groupSubjectScores.push({
            subject,
            score: avgScore,
            count: groupEdges.length,
          });
        }
      }

      // Calculate subjectAgreementScores (agreement with each group per subject)
      const groupAgreementMap = new Map();
      connectedEdges.forEach((edge) => {
        if (edge.neighborGroup && edge.neighborGroup !== "NonAttached") {
          if (!groupAgreementMap.has(edge.neighborGroup)) {
            groupAgreementMap.set(edge.neighborGroup, { sum: 0, count: 0 });
          }
          const stats = groupAgreementMap.get(edge.neighborGroup);
          stats.sum += edge.weight;
          stats.count += 1;
        }
      });

      // Convert to array and calculate averages
      const agreementArray = Array.from(groupAgreementMap.entries())
        .map(([groupId, stats]) => ({
          groupId,
          score: stats.count > 0 ? stats.sum / stats.count : 0,
          count: stats.count,
        }))
        .filter((item) => item.groupId !== "NonAttached")
        .sort((a, b) => b.score - a.score);

      if (agreementArray.length > 0) {
        subjectAgreementScores[subject] = agreementArray;
      }
    });

    // Sort groupSubjectScores by score (highest first)
    groupSubjectScores.sort((a, b) => b.score - a.score);

    similarityScores[mepId] = {
      groupSubjectScores,
      subjectAgreementScores,
    };
  });

  // Clean up intermediate data structures to free memory
  subjects.forEach((subject) => {
    const edgeIndex = subjectEdgeIndexByNode[subject];
    if (edgeIndex) {
      // Clear all nested Maps
      edgeIndex.forEach((neighborMap) => neighborMap.clear());
      edgeIndex.clear();
    }
  });

  return similarityScores;
}

/**
 * Count voting sessions (unique voteids) per subject from ep_votes data
 * @param {number} mandate - Mandate number
 * @returns {Promise<Object>} Object with total voting sessions and per-subject counts
 */
async function countVotingSessionsPerSubject(mandate) {
  try {
    const epVotesPath = path.join(
      ENRICHED_DATA_DIR,
      `ep_votes_${mandate}.json`
    );

    if (!fs.existsSync(epVotesPath)) {
      console.log(
        `    ⚠️  ep_votes_${mandate}.json not found, skipping voting session counts`
      );
      return { total: null, bySubject: {} };
    }

    console.log(`    Loading ep_votes_${mandate}.json...`);
    const epVotesText = await fsPromises.readFile(epVotesPath, "utf-8");
    const epVotes = JSON.parse(epVotesText);

    // Count total unique voteids
    const allVoteIds = new Set(epVotes.map((vote) => vote.voteid));
    const total = allVoteIds.size;

    // Count unique voteids per subject
    const subjectVoteIds = {};
    epVotes.forEach((vote) => {
      if (vote.subject && vote.voteid) {
        if (!subjectVoteIds[vote.subject]) {
          subjectVoteIds[vote.subject] = new Set();
        }
        subjectVoteIds[vote.subject].add(vote.voteid);
      }
    });

    // Convert Sets to counts and filter subjects with >5 voting sessions
    const bySubject = {};
    Object.keys(subjectVoteIds).forEach((subject) => {
      const count = subjectVoteIds[subject].size;
      if (count > 5) {
        bySubject[subject] = count;
      }
    });

    console.log(
      `    ✓ Counted ${total} total voting sessions, ${
        Object.keys(bySubject).length
      } subjects with >5 sessions`
    );

    return { total, bySubject };
  } catch (error) {
    console.error(
      `    ✗ Error counting voting sessions for mandate ${mandate}:`,
      error.message
    );
    return { total: null, bySubject: {} };
  }
}

/**
 * Compute cohesion data (intergroup, intragroup, country similarity)
 * Uses ALL edges regardless of weight (weight filter is only for layout)
 * @param {Array} allEdges - All edges (not filtered by weight)
 * @param {Array} nodes - All nodes
 * @returns {Object} Object with intergroupCohesion, intragroupCohesion, and countrySimilarity
 */
function computeCohesionData(allEdges, nodes) {
  // Create node map for fast lookups
  const nodeMap = new Map();
  nodes.forEach((node) => {
    nodeMap.set(node.id, node);
  });

  // Calculate intergroup cohesion (between different groups)
  const intergroupMap = new Map(); // group1-group2 -> { count, sum }
  // Calculate intragroup cohesion (within same group)
  const intragroupMap = new Map(); // group -> { count, sum }
  // Calculate country similarity (within same country)
  const countryMap = new Map(); // country -> { count, sum }

  allEdges.forEach((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (!sourceNode || !targetNode) return;

    const sourceGroup = sourceNode.groupId || "Unknown";
    const targetGroup = targetNode.groupId || "Unknown";
    const sourceCountry = sourceNode.country;
    const targetCountry = targetNode.country;
    const weight = edge.weight || 0;

    if (sourceGroup === targetGroup) {
      // Intra-group edge
      if (!intragroupMap.has(sourceGroup)) {
        intragroupMap.set(sourceGroup, { count: 0, sum: 0 });
      }
      const stats = intragroupMap.get(sourceGroup);
      stats.count++;
      stats.sum += weight;
    } else {
      // Inter-group edge
      const key =
        sourceGroup < targetGroup
          ? `${sourceGroup}-${targetGroup}`
          : `${targetGroup}-${sourceGroup}`;
      if (!intergroupMap.has(key)) {
        intergroupMap.set(key, {
          count: 0,
          sum: 0,
          group1: sourceGroup,
          group2: targetGroup,
        });
      }
      const stats = intergroupMap.get(key);
      stats.count++;
      stats.sum += weight;
    }

    // Country similarity (within same country)
    if (sourceCountry && targetCountry && sourceCountry === targetCountry) {
      if (!countryMap.has(sourceCountry)) {
        countryMap.set(sourceCountry, { count: 0, sum: 0 });
      }
      const countryStats = countryMap.get(sourceCountry);
      countryStats.count++;
      countryStats.sum += weight;
    }
  });

  // Calculate averages for intra-group cohesion
  const intragroupScores = Array.from(intragroupMap.entries())
    .map(([group, stats]) => ({
      group,
      score: stats.count > 0 ? stats.sum / stats.count : 0,
      count: stats.count,
    }))
    .sort((a, b) => b.score - a.score);

  // Calculate averages for country similarity
  const countryScores = Array.from(countryMap.entries())
    .map(([country, stats]) => ({
      country,
      score: stats.count > 0 ? stats.sum / stats.count : 0,
      count: stats.count,
    }))
    .sort((a, b) => b.score - a.score);

  // Get all unique groups from nodes
  const allGroups = new Set();
  nodes.forEach((node) => {
    if (node.groupId) allGroups.add(node.groupId);
  });

  // Canonical order: left to right politically
  const canonicalOrder = [
    "GUE/NGL",
    "The Left",
    "S&D",
    "PSE",
    "Greens/EFA",
    "Verts/ALE",
    "Renew",
    "ALDE",
    "RE",
    "PPE",
    "EPP",
    "PPE-DE",
    "EPP-ED",
    "ECR",
    "ID",
    "ENF",
    "PfE",
    "EFDD",
    "NI",
    "UEN",
    "ESN",
    "IND/DEM",
  ];

  // Sort groups by canonical order
  let groupsArray = Array.from(allGroups).sort((a, b) => {
    const indexA = canonicalOrder.indexOf(a);
    const indexB = canonicalOrder.indexOf(b);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });

  // Filter out NonAttached from heatmap
  groupsArray = groupsArray.filter((group) => group !== "NonAttached");

  // Create matrix for heatmap
  const heatmapData = groupsArray.map((group1) =>
    groupsArray.map((group2) => {
      if (group1 === group2) {
        // Diagonal: use intra-group score
        const intra = intragroupScores.find((s) => s.group === group1);
        // Return NaN if no intra-group score (e.g., only one MEP in the group, no edges)
        return intra && intra.count > 0 ? intra.score : NaN;
      } else {
        // Off-diagonal: use inter-group score
        const key =
          group1 < group2 ? `${group1}-${group2}` : `${group2}-${group1}`;
        const inter = intergroupMap.get(key);
        return inter && inter.count > 0 ? inter.sum / inter.count : NaN;
      }
    })
  );

  // Get group colors for heatmap
  const groupColors = new Map();
  nodes.forEach((node) => {
    if (node.groupId && !groupColors.has(node.groupId)) {
      groupColors.set(node.groupId, node.color);
    }
  });

  return {
    intergroupCohesion: {
      groups: groupsArray,
      matrix: heatmapData,
      groupColors: Object.fromEntries(groupColors), // Convert Map to object for JSON
    },
    intragroupCohesion: intragroupScores,
    countrySimilarity: countryScores,
  };
}

// Find the group to use for rotation (priority order)
function findRotationGroup(initialPositions) {
  // Priority 1: GUE/NGL
  const gueNglNodes = initialPositions.filter(
    (node) => node.groupId === "GUE/NGL"
  );
  if (gueNglNodes.length > 0) {
    return { nodes: gueNglNodes, groupName: "GUE/NGL" };
  }

  // Priority 2: Greens/EFA or Verts/ALE (combine if both exist)
  const greensEfaNodes = initialPositions.filter(
    (node) => node.groupId === "Greens/EFA"
  );
  const vertsAleNodes = initialPositions.filter(
    (node) => node.groupId === "Verts/ALE"
  );
  const greensNodes = [...greensEfaNodes, ...vertsAleNodes];
  if (greensNodes.length > 0) {
    const groupName = greensEfaNodes.length > 0 ? "Greens/EFA" : "Verts/ALE";
    return { nodes: greensNodes, groupName: groupName };
  }

  // Priority 3: S&D or PSE (combine if both exist)
  const sdNodes = initialPositions.filter((node) => node.groupId === "S&D");
  const pseNodes = initialPositions.filter((node) => node.groupId === "PSE");
  const sdPseNodes = [...sdNodes, ...pseNodes];
  if (sdPseNodes.length > 0) {
    const groupName = sdNodes.length > 0 ? "S&D" : "PSE";
    return { nodes: sdPseNodes, groupName: groupName };
  }

  return null;
}

async function precomputeLayoutForCountry(
  mandate,
  country,
  data,
  votingSessionsData,
  subjectsList
) {
  console.log(`\n  Processing ${country}...`);

  const countryOutputPath = path.join(
    OUTPUT_DIR,
    `mandate_${mandate}_${country.replace(/\s+/g, "_")}.json`
  );

  try {
    // Filter nodes by country
    const allNodes = data.nodes.map((node) => ({
      id: node.Id,
      label: node.FullName,
      country: node.Country,
      groupId: node.GroupID,
      color: getGroupColor(node.GroupID),
      photoURL: node.PhotoURL || null,
      partyNames: node.PartyNames || [],
      groups: node.Groups || [],
    }));

    const nodes = allNodes.filter((node) => node.country === country);

    if (nodes.length === 0) {
      console.log(`    ⚠️  No nodes found for ${country}`);
      return null;
    }

    console.log(`    Loaded ${nodes.length} nodes for ${country}`);

    // Filter edges to only include those between nodes from the same country
    // and with weight > 0.6 for layout computation
    const nodeIdSet = new Set(nodes.map((n) => n.id));
    const allEdges = data.edges.map((edge) => ({
      source: edge.Source,
      target: edge.Target,
      weight: parseFloat(edge.Weight) || 0,
    }));

    const edges = allEdges.filter(
      (edge) =>
        nodeIdSet.has(edge.source) &&
        nodeIdSet.has(edge.target) &&
        edge.weight > 0.6
    );

    console.log(
      `    Loaded ${edges.length} edges for ${country} (weight > 0.6)`
    );

    if (edges.length === 0) {
      console.log(`    ⚠️  No edges found for ${country}`);
      return null;
    }

    // Create graphology graph
    const graph = new Graph({ type: "undirected" });

    // Add nodes
    nodes.forEach((node) => {
      graph.addNode(node.id, {
        label: node.label,
        x: Math.random() * 1000,
        y: Math.random() * 1000,
        color: node.color,
        country: node.country,
        groupId: node.groupId,
      });
    });

    // Add edges with deduplication
    const edgeSet = new Set();
    let edgesAdded = 0;
    edges.forEach((edge) => {
      const edgeId =
        edge.source < edge.target
          ? `${edge.source}-${edge.target}`
          : `${edge.target}-${edge.source}`;

      if (!edgeSet.has(edgeId) && !graph.hasEdge(edge.source, edge.target)) {
        edgeSet.add(edgeId);
        graph.addEdge(edge.source, edge.target, { weight: edge.weight });
        edgesAdded++;
      }
    });

    console.log(`    Added ${edgesAdded} edges to graph`);

    // Compute Force Atlas 2 layout
    console.log(`    Computing Force Atlas 2 layout (100 iterations)...`);
    const startTime = Date.now();
    const positions = forceAtlas2(graph, {
      iterations: 100,
      settings: {
        gravity: 1,
        scalingRatio: 10,
        strongGravityMode: false,
      },
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`    ✓ Layout computed in ${elapsed}s`);

    // Get initial positions
    const initialPositions = nodes.map((node) => {
      const nodeAttrs = graph.getNodeAttributes(node.id);
      const position = positions[node.id];
      return {
        id: node.id,
        label: node.label,
        country: node.country,
        groupId: node.groupId,
        color: node.color,
        x: position ? position.x : nodeAttrs.x || 0,
        y: position ? position.y : nodeAttrs.y || 0,
      };
    });

    // Rotate layout based on priority: GUE/NGL > Greens/EFA/Verts/ALE > S&D/PSE
    const rotationGroup = findRotationGroup(initialPositions);

    let nodesWithPositions;

    if (rotationGroup) {
      const groupNodes = rotationGroup.nodes;
      const groupCentroidX =
        groupNodes.reduce((sum, node) => sum + node.x, 0) / groupNodes.length;
      const groupCentroidY =
        groupNodes.reduce((sum, node) => sum + node.y, 0) / groupNodes.length;

      const allCentroidX =
        initialPositions.reduce((sum, node) => sum + node.x, 0) /
        initialPositions.length;
      const allCentroidY =
        initialPositions.reduce((sum, node) => sum + node.y, 0) /
        initialPositions.length;

      const dx = groupCentroidX - allCentroidX;
      const dy = groupCentroidY - allCentroidY;

      const currentAngle = Math.atan2(dy, dx);
      const targetAngle = Math.PI;
      const rotationAngle = targetAngle - currentAngle;

      const cos = Math.cos(rotationAngle);
      const sin = Math.sin(rotationAngle);

      nodesWithPositions = initialPositions.map((node) => {
        const tx = node.x - allCentroidX;
        const ty = node.y - allCentroidY;
        const rx = tx * cos - ty * sin;
        const ry = tx * sin + ty * cos;
        return {
          id: node.id,
          label: node.label,
          country: node.country,
          groupId: node.groupId,
          color: node.color,
          x: rx + allCentroidX,
          y: ry + allCentroidY,
        };
      });
    } else {
      nodesWithPositions = initialPositions;
    }

    // Prepare edges for output
    const edgesWithWeights = [];
    graph.forEachEdge((edge, attrs, source, target) => {
      edgesWithWeights.push({
        source: source,
        target: target,
        weight: attrs.weight || 0,
      });
    });

    // Calculate agreement scores for each MEP with each political group
    console.log(`    Computing agreement scores...`);
    const agreementScores = {};
    const allGroups = new Set(nodes.map((n) => n.groupId).filter(Boolean));

    // Create a map of all edges (not just filtered ones) for agreement calculation
    const allEdgesMap = new Map();
    allEdges.forEach((edge) => {
      if (nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)) {
        const key1 = `${edge.source}-${edge.target}`;
        const key2 = `${edge.target}-${edge.source}`;
        allEdgesMap.set(key1, edge.weight);
        allEdgesMap.set(key2, edge.weight);
      }
    });

    nodes.forEach((node) => {
      const mepId = node.id;
      const mepGroupScores = {};

      // For each political group, calculate average edge weight
      allGroups.forEach((groupId) => {
        const groupNodes = nodes.filter((n) => n.groupId === groupId);
        const groupNodeIds = new Set(groupNodes.map((n) => n.id));

        // Find all edges between this MEP and MEPs from this group (using allEdges, not filtered graph)
        const groupEdges = [];
        groupNodeIds.forEach((neighborId) => {
          if (neighborId !== mepId) {
            const edgeKey = `${mepId}-${neighborId}`;
            const weight = allEdgesMap.get(edgeKey);
            if (weight !== undefined && weight > 0) {
              groupEdges.push(weight);
            }
          }
        });

        // Calculate average
        const avgScore =
          groupEdges.length > 0
            ? groupEdges.reduce((sum, w) => sum + w, 0) / groupEdges.length
            : 0;

        mepGroupScores[groupId] = {
          score: avgScore,
          count: groupEdges.length,
        };
      });

      agreementScores[mepId] = mepGroupScores;
    });

    console.log(
      `    ✓ Computed agreement scores for ${
        Object.keys(agreementScores).length
      } MEPs`
    );

    // Calculate similarity scores with subjects
    console.log(`    Computing similarity scores with subjects...`);
    const similarityScores = computeSimilarityScoresWithSubjects(
      data,
      nodes,
      graph
    );
    console.log(
      `    ✓ Computed similarity scores for ${
        Object.keys(similarityScores).length
      } MEPs`
    );

    // Calculate cohesion data using ALL edges (not filtered by weight)
    console.log(`    Computing cohesion data (using all edges)...`);
    // Filter allEdges to only include edges between country nodes (but keep ALL weights)
    const countryAllEdges = allEdges.filter(
      (edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)
    );
    const cohesionData = computeCohesionData(countryAllEdges, nodes);
    console.log(`    ✓ Computed cohesion data`);

    // Clean up graph to free memory before stringifying
    graph.clear();

    // Save precomputed data (without pretty printing to save memory)
    const precomputedData = {
      mandate,
      country,
      nodes: nodesWithPositions,
      edges: edgesWithWeights,
      agreementScores: agreementScores,
      similarityScores: similarityScores,
      cohesionData: cohesionData, // Add cohesion data
      subjects: subjectsList, // List of subjects with >5 voting sessions
      votingSessions: {
        total: votingSessionsData.total,
        bySubject: votingSessionsData.bySubject,
      },
      computedAt: new Date().toISOString(),
    };

    console.log(`    Writing to file...`);
    await fsPromises.writeFile(
      countryOutputPath,
      JSON.stringify(precomputedData) // No pretty printing to save memory
    );
    console.log(`    ✓ Saved to ${countryOutputPath}`);

    return precomputedData;
  } catch (error) {
    console.error(`    ✗ Error processing ${country}:`, error.message);
    return null;
  }
}

async function precomputeLayoutForSubject(
  mandate,
  subject,
  data,
  votingSessionsData,
  subjectsList
) {
  console.log(`\n  Processing subject: ${subject}...`);

  const subjectKey = subject.replace(/[^a-zA-Z0-9]/g, "_");
  const outputPath = path.join(
    OUTPUT_DIR,
    `mandate_${mandate}_subject_${subjectKey}.json`
  );

  try {
    // Check if edgesBySubject exists
    if (!data.edgesBySubject || !data.edgesBySubject[subject]) {
      console.log(`    ⚠️  No edges found for subject: ${subject}`);
      return null;
    }

    const nodes = data.nodes.map((node) => ({
      id: node.Id,
      label: node.FullName,
      country: node.Country,
      groupId: node.GroupID,
      color: getGroupColor(node.GroupID),
    }));

    console.log(`    Loaded ${nodes.length} nodes`);

    // Get edges for this subject
    const subjectEdges = data.edgesBySubject[subject] || [];
    const allEdges = subjectEdges.map((edge) => ({
      source: edge.Source,
      target: edge.Target,
      weight: parseFloat(edge.Weight) || 0,
    }));

    // Filter edges with weight > 0.6 for layout computation
    const edges = allEdges.filter((edge) => edge.weight > 0.6);

    console.log(
      `    Loaded ${edges.length} edges (weight > 0.6) out of ${allEdges.length} total for ${subject}`
    );

    if (edges.length === 0) {
      console.log(`    ⚠️  No edges found for ${subject} (weight > 0.6)`);
      return null;
    }

    // Create graphology graph
    const graph = new Graph({ type: "undirected" });

    // Add nodes
    nodes.forEach((node) => {
      graph.addNode(node.id, {
        label: node.label,
        x: Math.random() * 1000,
        y: Math.random() * 1000,
        color: node.color,
        country: node.country,
        groupId: node.groupId,
      });
    });

    // Add edges with deduplication
    const nodeIdSet = new Set(nodes.map((n) => n.id));
    const edgeSet = new Set();

    let edgesAdded = 0;
    edges.forEach((edge) => {
      if (nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)) {
        const edgeId =
          edge.source < edge.target
            ? `${edge.source}-${edge.target}`
            : `${edge.target}-${edge.source}`;

        if (!edgeSet.has(edgeId) && !graph.hasEdge(edge.source, edge.target)) {
          edgeSet.add(edgeId);
          graph.addEdge(edge.source, edge.target, {
            weight: edge.weight,
          });
          edgesAdded++;
        }
      }
    });

    console.log(`    Added ${edgesAdded} edges to graph`);

    // Compute Force Atlas 2 layout
    console.log(`    Computing Force Atlas 2 layout (100 iterations)...`);
    const startTime = Date.now();
    const positions = forceAtlas2(graph, {
      iterations: 100,
      settings: {
        gravity: 1,
        scalingRatio: 10,
        strongGravityMode: false,
      },
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`    ✓ Layout computed in ${elapsed}s`);

    // Get initial positions
    const initialPositions = nodes.map((node) => {
      const nodeAttrs = graph.getNodeAttributes(node.id);
      const position = positions[node.id];
      return {
        id: node.id,
        label: node.label,
        country: node.country,
        groupId: node.groupId,
        color: node.color,
        x: position ? position.x : nodeAttrs.x || 0,
        y: position ? position.y : nodeAttrs.y || 0,
      };
    });

    // Rotate layout based on priority: GUE/NGL > Greens/EFA/Verts/ALE > S&D/PSE
    const rotationGroup = findRotationGroup(initialPositions);

    let nodesWithPositions;

    if (rotationGroup) {
      const groupNodes = rotationGroup.nodes;
      const groupCentroidX =
        groupNodes.reduce((sum, node) => sum + node.x, 0) / groupNodes.length;
      const groupCentroidY =
        groupNodes.reduce((sum, node) => sum + node.y, 0) / groupNodes.length;

      const allCentroidX =
        initialPositions.reduce((sum, node) => sum + node.x, 0) /
        initialPositions.length;
      const allCentroidY =
        initialPositions.reduce((sum, node) => sum + node.y, 0) /
        initialPositions.length;

      const dx = groupCentroidX - allCentroidX;
      const dy = groupCentroidY - allCentroidY;

      const currentAngle = Math.atan2(dy, dx);
      const targetAngle = Math.PI;
      const rotationAngle = targetAngle - currentAngle;

      const cos = Math.cos(rotationAngle);
      const sin = Math.sin(rotationAngle);

      nodesWithPositions = initialPositions.map((node) => {
        const tx = node.x - allCentroidX;
        const ty = node.y - allCentroidY;
        const rx = tx * cos - ty * sin;
        const ry = tx * sin + ty * cos;
        return {
          id: node.id,
          label: node.label,
          country: node.country,
          groupId: node.groupId,
          color: node.color,
          x: rx + allCentroidX,
          y: ry + allCentroidY,
        };
      });
    } else {
      nodesWithPositions = initialPositions;
    }

    // Prepare edges for output
    const edgesWithWeights = [];
    graph.forEachEdge((edge, attrs, source, target) => {
      edgesWithWeights.push({
        source: source,
        target: target,
        weight: attrs.weight || 0,
      });
    });

    // Calculate agreement scores for each MEP with each political group
    console.log(`    Computing agreement scores...`);
    const agreementScores = {};
    const allGroups = new Set(nodes.map((n) => n.groupId).filter(Boolean));

    // Create a map of all edges (not just filtered ones) for agreement calculation
    const allEdgesMap = new Map();
    allEdges.forEach((edge) => {
      const key1 = `${edge.source}-${edge.target}`;
      const key2 = `${edge.target}-${edge.source}`;
      allEdgesMap.set(key1, edge.weight);
      allEdgesMap.set(key2, edge.weight);
    });

    nodes.forEach((node) => {
      const mepId = node.id;
      const mepGroupScores = {};

      allGroups.forEach((groupId) => {
        const groupNodes = nodes.filter((n) => n.groupId === groupId);
        const groupNodeIds = new Set(groupNodes.map((n) => n.id));

        // Find all edges between this MEP and MEPs from this group (using allEdges, not filtered graph)
        const groupEdges = [];
        groupNodeIds.forEach((neighborId) => {
          if (neighborId !== mepId) {
            const edgeKey = `${mepId}-${neighborId}`;
            const weight = allEdgesMap.get(edgeKey);
            if (weight !== undefined && weight > 0) {
              groupEdges.push(weight);
            }
          }
        });

        const avgScore =
          groupEdges.length > 0
            ? groupEdges.reduce((sum, w) => sum + w, 0) / groupEdges.length
            : 0;

        mepGroupScores[groupId] = {
          score: avgScore,
          count: groupEdges.length,
        };
      });

      agreementScores[mepId] = mepGroupScores;
    });

    console.log(
      `    ✓ Computed agreement scores for ${
        Object.keys(agreementScores).length
      } MEPs`
    );

    // Calculate similarity scores with subjects
    console.log(`    Computing similarity scores with subjects...`);
    const similarityScores = computeSimilarityScoresWithSubjects(
      data,
      nodes,
      graph
    );
    console.log(
      `    ✓ Computed similarity scores for ${
        Object.keys(similarityScores).length
      } MEPs`
    );

    // Calculate cohesion data using ALL edges (not filtered by weight)
    console.log(`    Computing cohesion data (using all edges)...`);
    // Use allEdges (not filtered by weight > 0.6) for cohesion calculation
    const cohesionData = computeCohesionData(allEdges, nodes);
    console.log(`    ✓ Computed cohesion data`);

    // Clean up graph to free memory before stringifying
    graph.clear();

    // Save precomputed data (without pretty printing to save memory)
    const precomputedData = {
      mandate,
      subject,
      nodes: nodesWithPositions,
      edges: edgesWithWeights,
      agreementScores: agreementScores,
      similarityScores: similarityScores,
      cohesionData: cohesionData, // Add cohesion data
      subjects: subjectsList, // List of subjects with >5 voting sessions
      votingSessions: {
        total: votingSessionsData.total,
        bySubject: votingSessionsData.bySubject,
      },
      computedAt: new Date().toISOString(),
    };

    console.log(`    Writing to file...`);
    await fsPromises.writeFile(
      outputPath,
      JSON.stringify(precomputedData) // No pretty printing to save memory
    );
    console.log(`    ✓ Saved to ${outputPath}`);

    return precomputedData;
  } catch (error) {
    console.error(`    ✗ Error processing ${subject}:`, error.message);
    return null;
  }
}

async function precomputeLayoutForCountryAndSubject(
  mandate,
  country,
  subject,
  data,
  votingSessionsData,
  subjectsList
) {
  console.log(`\n  Processing ${country} - ${subject}...`);

  const countryKey = country.replace(/\s+/g, "_");
  const subjectKey = subject.replace(/[^a-zA-Z0-9]/g, "_");
  const outputPath = path.join(
    OUTPUT_DIR,
    `mandate_${mandate}_${countryKey}_subject_${subjectKey}.json`
  );

  try {
    // Check if edgesBySubject exists
    if (!data.edgesBySubject || !data.edgesBySubject[subject]) {
      console.log(`    ⚠️  No edges found for subject: ${subject}`);
      return null;
    }

    // Filter nodes by country
    const allNodes = data.nodes.map((node) => ({
      id: node.Id,
      label: node.FullName,
      country: node.Country,
      groupId: node.GroupID,
      color: getGroupColor(node.GroupID),
      photoURL: node.PhotoURL || null,
      partyNames: node.PartyNames || [],
      groups: node.Groups || [],
    }));

    const nodes = allNodes.filter((node) => node.country === country);

    if (nodes.length === 0) {
      console.log(`    ⚠️  No nodes found for ${country}`);
      return null;
    }

    console.log(`    Loaded ${nodes.length} nodes for ${country}`);

    // Get edges for this subject
    const subjectEdges = data.edgesBySubject[subject] || [];
    const allEdges = subjectEdges.map((edge) => ({
      source: edge.Source,
      target: edge.Target,
      weight: parseFloat(edge.Weight) || 0,
    }));

    // Filter edges to only include those between nodes from the same country
    // and with weight > 0.6 for layout computation
    const nodeIdSet = new Set(nodes.map((n) => n.id));
    const edges = allEdges.filter(
      (edge) =>
        nodeIdSet.has(edge.source) &&
        nodeIdSet.has(edge.target) &&
        edge.weight > 0.6
    );

    console.log(
      `    Loaded ${edges.length} edges for ${country} - ${subject} (weight > 0.6)`
    );

    if (edges.length === 0) {
      console.log(`    ⚠️  No edges found for ${country} - ${subject}`);
      return null;
    }

    // Create graphology graph
    const graph = new Graph({ type: "undirected" });

    // Add nodes
    nodes.forEach((node) => {
      graph.addNode(node.id, {
        label: node.label,
        x: Math.random() * 1000,
        y: Math.random() * 1000,
        color: node.color,
        country: node.country,
        groupId: node.groupId,
      });
    });

    // Add edges with deduplication
    const edgeSet = new Set();
    let edgesAdded = 0;
    edges.forEach((edge) => {
      const edgeId =
        edge.source < edge.target
          ? `${edge.source}-${edge.target}`
          : `${edge.target}-${edge.source}`;

      if (!edgeSet.has(edgeId) && !graph.hasEdge(edge.source, edge.target)) {
        edgeSet.add(edgeId);
        graph.addEdge(edge.source, edge.target, { weight: edge.weight });
        edgesAdded++;
      }
    });

    console.log(`    Added ${edgesAdded} edges to graph`);

    // Compute Force Atlas 2 layout
    console.log(`    Computing Force Atlas 2 layout (100 iterations)...`);
    const startTime = Date.now();
    const positions = forceAtlas2(graph, {
      iterations: 100,
      settings: {
        gravity: 1,
        scalingRatio: 10,
        strongGravityMode: false,
      },
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`    ✓ Layout computed in ${elapsed}s`);

    // Get initial positions
    const initialPositions = nodes.map((node) => {
      const nodeAttrs = graph.getNodeAttributes(node.id);
      const position = positions[node.id];
      return {
        id: node.id,
        label: node.label,
        country: node.country,
        groupId: node.groupId,
        color: node.color,
        x: position ? position.x : nodeAttrs.x || 0,
        y: position ? position.y : nodeAttrs.y || 0,
      };
    });

    // Rotate layout based on priority: GUE/NGL > Greens/EFA/Verts/ALE > S&D/PSE
    const rotationGroup = findRotationGroup(initialPositions);

    let nodesWithPositions;

    if (rotationGroup) {
      const groupNodes = rotationGroup.nodes;
      const groupCentroidX =
        groupNodes.reduce((sum, node) => sum + node.x, 0) / groupNodes.length;
      const groupCentroidY =
        groupNodes.reduce((sum, node) => sum + node.y, 0) / groupNodes.length;

      const allCentroidX =
        initialPositions.reduce((sum, node) => sum + node.x, 0) /
        initialPositions.length;
      const allCentroidY =
        initialPositions.reduce((sum, node) => sum + node.y, 0) /
        initialPositions.length;

      const dx = groupCentroidX - allCentroidX;
      const dy = groupCentroidY - allCentroidY;

      const currentAngle = Math.atan2(dy, dx);
      const targetAngle = Math.PI;
      const rotationAngle = targetAngle - currentAngle;

      const cos = Math.cos(rotationAngle);
      const sin = Math.sin(rotationAngle);

      nodesWithPositions = initialPositions.map((node) => {
        const tx = node.x - allCentroidX;
        const ty = node.y - allCentroidY;
        const rx = tx * cos - ty * sin;
        const ry = tx * sin + ty * cos;
        return {
          id: node.id,
          label: node.label,
          country: node.country,
          groupId: node.groupId,
          color: node.color,
          x: rx + allCentroidX,
          y: ry + allCentroidY,
        };
      });
    } else {
      nodesWithPositions = initialPositions;
    }

    // Prepare edges for output
    const edgesWithWeights = [];
    graph.forEachEdge((edge, attrs, source, target) => {
      edgesWithWeights.push({
        source: source,
        target: target,
        weight: attrs.weight || 0,
      });
    });

    // Calculate agreement scores for each MEP with each political group
    console.log(`    Computing agreement scores...`);
    const agreementScores = {};
    const allGroups = new Set(nodes.map((n) => n.groupId).filter(Boolean));

    // Create a map of all edges (not just filtered ones) for agreement calculation
    const allEdgesMap = new Map();
    allEdges.forEach((edge) => {
      if (nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)) {
        const key1 = `${edge.source}-${edge.target}`;
        const key2 = `${edge.target}-${edge.source}`;
        allEdgesMap.set(key1, edge.weight);
        allEdgesMap.set(key2, edge.weight);
      }
    });

    nodes.forEach((node) => {
      const mepId = node.id;
      const mepGroupScores = {};

      allGroups.forEach((groupId) => {
        const groupNodes = nodes.filter((n) => n.groupId === groupId);
        const groupNodeIds = new Set(groupNodes.map((n) => n.id));

        // Find all edges between this MEP and MEPs from this group (using allEdges, not filtered graph)
        const groupEdges = [];
        groupNodeIds.forEach((neighborId) => {
          if (neighborId !== mepId) {
            const edgeKey = `${mepId}-${neighborId}`;
            const weight = allEdgesMap.get(edgeKey);
            if (weight !== undefined && weight > 0) {
              groupEdges.push(weight);
            }
          }
        });

        const avgScore =
          groupEdges.length > 0
            ? groupEdges.reduce((sum, w) => sum + w, 0) / groupEdges.length
            : 0;

        mepGroupScores[groupId] = {
          score: avgScore,
          count: groupEdges.length,
        };
      });

      agreementScores[mepId] = mepGroupScores;
    });

    console.log(
      `    ✓ Computed agreement scores for ${
        Object.keys(agreementScores).length
      } MEPs`
    );

    // Calculate similarity scores with subjects
    console.log(`    Computing similarity scores with subjects...`);
    const similarityScores = computeSimilarityScoresWithSubjects(
      data,
      nodes,
      graph
    );
    console.log(
      `    ✓ Computed similarity scores for ${
        Object.keys(similarityScores).length
      } MEPs`
    );

    // Calculate cohesion data using ALL edges (not filtered by weight)
    console.log(`    Computing cohesion data (using all edges)...`);
    // Filter allEdges to only include edges between country nodes (but keep ALL weights)
    const countryAllEdges = allEdges.filter(
      (edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)
    );
    const cohesionData = computeCohesionData(countryAllEdges, nodes);
    console.log(`    ✓ Computed cohesion data`);

    // Clean up graph to free memory before stringifying
    graph.clear();

    // Save precomputed data (without pretty printing to save memory)
    const precomputedData = {
      mandate,
      country,
      subject,
      nodes: nodesWithPositions,
      edges: edgesWithWeights,
      agreementScores: agreementScores,
      similarityScores: similarityScores,
      cohesionData: cohesionData, // Add cohesion data
      subjects: subjectsList, // List of subjects with >5 voting sessions
      votingSessions: {
        total: votingSessionsData.total,
        bySubject: votingSessionsData.bySubject,
      },
      computedAt: new Date().toISOString(),
    };

    console.log(`    Writing to file...`);
    await fsPromises.writeFile(
      outputPath,
      JSON.stringify(precomputedData) // No pretty printing to save memory
    );
    console.log(`    ✓ Saved to ${outputPath}`);

    return precomputedData;
  } catch (error) {
    console.error(
      `    ✗ Error processing ${country} - ${subject}:`,
      error.message
    );
    return null;
  }
}

/**
 * Save MEP info to a separate file (one per mandate)
 */
async function saveMEPInfo(mandate, data) {
  const mepInfoPath = path.join(OUTPUT_DIR, `mep_info_${mandate}.json`);

  const mepInfo = {};
  data.nodes.forEach((node) => {
    mepInfo[node.Id] = {
      photoURL: node.PhotoURL || null,
      partyNames: node.PartyNames || [],
      groups: node.Groups || [],
    };
  });

  await fsPromises.writeFile(mepInfoPath, JSON.stringify(mepInfo));
  console.log(`  ✓ Saved MEP info to ${mepInfoPath}`);
}

async function precomputeLayout(
  mandate,
  data,
  votingSessionsData,
  subjectsList
) {
  console.log(`\nProcessing mandate ${mandate}...`);

  const outputPath = path.join(OUTPUT_DIR, `mandate_${mandate}.json`);

  try {
    const nodes = data.nodes.map((node) => ({
      id: node.Id,
      label: node.FullName,
      country: node.Country,
      groupId: node.GroupID,
      color: getGroupColor(node.GroupID),
    }));

    console.log(`  Loaded ${nodes.length} nodes`);

    const allEdges = data.edges.map((edge) => ({
      source: edge.Source,
      target: edge.Target,
      weight: parseFloat(edge.Weight) || 0,
    }));

    // Filter edges with weight > 0.6 for layout computation
    const edges = allEdges.filter((edge) => edge.weight > 0.6);

    console.log(
      `  Loaded ${edges.length} edges (weight > 0.6) out of ${allEdges.length} total`
    );

    // Create graphology graph
    const graph = new Graph({ type: "undirected" });

    // Add nodes
    nodes.forEach((node) => {
      graph.addNode(node.id, {
        label: node.label,
        x: Math.random() * 1000,
        y: Math.random() * 1000,
        color: node.color,
        country: node.country,
        groupId: node.groupId,
      });
    });

    // Add edges with deduplication
    const nodeIdSet = new Set(nodes.map((n) => n.id));
    const edgeSet = new Set();

    let edgesAdded = 0;
    edges.forEach((edge) => {
      if (nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)) {
        const edgeId =
          edge.source < edge.target
            ? `${edge.source}-${edge.target}`
            : `${edge.target}-${edge.source}`;

        if (!edgeSet.has(edgeId) && !graph.hasEdge(edge.source, edge.target)) {
          edgeSet.add(edgeId);
          graph.addEdge(edge.source, edge.target, {
            weight: edge.weight,
          });
          edgesAdded++;
        }
      }
    });

    console.log(`  Added ${edgesAdded} edges to graph`);

    // Compute Force Atlas 2 layout
    console.log(`  Computing Force Atlas 2 layout (100 iterations)...`);
    const startTime = Date.now();
    const positions = forceAtlas2(graph, {
      iterations: 100,
      settings: {
        gravity: 1,
        scalingRatio: 10,
        strongGravityMode: false,
      },
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  ✓ Layout computed in ${elapsed}s`);

    // Get initial positions
    const initialPositions = nodes.map((node) => {
      const nodeAttrs = graph.getNodeAttributes(node.id);
      const position = positions[node.id];
      return {
        id: node.id,
        label: node.label,
        country: node.country,
        groupId: node.groupId,
        color: node.color,
        x: position ? position.x : nodeAttrs.x || 0,
        y: position ? position.y : nodeAttrs.y || 0,
      };
    });

    // Rotate layout based on priority: GUE/NGL > Greens/EFA/Verts/ALE > S&D/PSE
    const rotationGroup = findRotationGroup(initialPositions);

    let nodesWithPositions;

    if (rotationGroup) {
      const groupNodes = rotationGroup.nodes;
      // Calculate centroid of group nodes
      const groupCentroidX =
        groupNodes.reduce((sum, node) => sum + node.x, 0) / groupNodes.length;
      const groupCentroidY =
        groupNodes.reduce((sum, node) => sum + node.y, 0) / groupNodes.length;

      // Calculate centroid of all nodes
      const allCentroidX =
        initialPositions.reduce((sum, node) => sum + node.x, 0) /
        initialPositions.length;
      const allCentroidY =
        initialPositions.reduce((sum, node) => sum + node.y, 0) /
        initialPositions.length;

      // Calculate vector from all centroid to group centroid
      const dx = groupCentroidX - allCentroidX;
      const dy = groupCentroidY - allCentroidY;

      // Calculate angle to rotate so group is on the left
      // We want group to be at angle ~180 degrees (left side)
      const currentAngle = Math.atan2(dy, dx);
      const targetAngle = Math.PI; // 180 degrees (left side)
      const rotationAngle = targetAngle - currentAngle;

      // Apply rotation to all nodes around the centroid
      const cos = Math.cos(rotationAngle);
      const sin = Math.sin(rotationAngle);

      nodesWithPositions = initialPositions.map((node) => {
        // Translate to origin (centroid)
        const tx = node.x - allCentroidX;
        const ty = node.y - allCentroidY;

        // Rotate
        const rx = tx * cos - ty * sin;
        const ry = tx * sin + ty * cos;

        // Translate back
        return {
          id: node.id,
          label: node.label,
          country: node.country,
          groupId: node.groupId,
          color: node.color,
          x: rx + allCentroidX,
          y: ry + allCentroidY,
        };
      });

      console.log(
        `  ✓ Rotated layout: ${rotationGroup.groupName} positioned on the left (${groupNodes.length} nodes)`
      );
    } else {
      // No rotation group found, use original positions
      nodesWithPositions = initialPositions;
      console.log(`  ⚠️  No rotation group found, using original layout`);
    }

    // Prepare edges for output (all edges, not filtered)
    const edgesWithWeights = [];
    graph.forEachEdge((edge, attrs, source, target) => {
      edgesWithWeights.push({
        source: source,
        target: target,
        weight: attrs.weight || 0,
      });
    });

    // Calculate agreement scores for each MEP with each political group
    console.log(`  Computing agreement scores...`);
    const agreementScores = {};
    const allGroups = new Set(nodes.map((n) => n.groupId).filter(Boolean));

    // Create a map of all edges (not just filtered ones) for agreement calculation
    const allEdgesMap = new Map();
    allEdges.forEach((edge) => {
      const key1 = `${edge.source}-${edge.target}`;
      const key2 = `${edge.target}-${edge.source}`;
      allEdgesMap.set(key1, edge.weight);
      allEdgesMap.set(key2, edge.weight);
    });

    nodes.forEach((node) => {
      const mepId = node.id;
      const mepGroupScores = {};

      // For each political group, calculate average edge weight
      allGroups.forEach((groupId) => {
        const groupNodes = nodes.filter((n) => n.groupId === groupId);
        const groupNodeIds = new Set(groupNodes.map((n) => n.id));

        // Find all edges between this MEP and MEPs from this group (using allEdges, not filtered graph)
        const groupEdges = [];
        groupNodeIds.forEach((neighborId) => {
          if (neighborId !== mepId) {
            const edgeKey = `${mepId}-${neighborId}`;
            const weight = allEdgesMap.get(edgeKey);
            if (weight !== undefined && weight > 0) {
              groupEdges.push(weight);
            }
          }
        });

        // Calculate average
        const avgScore =
          groupEdges.length > 0
            ? groupEdges.reduce((sum, w) => sum + w, 0) / groupEdges.length
            : 0;

        mepGroupScores[groupId] = {
          score: avgScore,
          count: groupEdges.length,
        };
      });

      agreementScores[mepId] = mepGroupScores;
    });

    console.log(
      `  ✓ Computed agreement scores for ${
        Object.keys(agreementScores).length
      } MEPs`
    );

    // Calculate similarity scores with subjects
    console.log(`  Computing similarity scores with subjects...`);
    const similarityScores = computeSimilarityScoresWithSubjects(
      data,
      nodes,
      graph
    );
    console.log(
      `  ✓ Computed similarity scores for ${
        Object.keys(similarityScores).length
      } MEPs`
    );

    // Calculate cohesion data using ALL edges (not filtered by weight)
    console.log(`  Computing cohesion data (using all edges)...`);
    // Use allEdges (not filtered by weight > 0.6) for cohesion calculation
    const cohesionData = computeCohesionData(allEdges, nodes);
    console.log(`  ✓ Computed cohesion data`);

    // Use precomputed voting sessions data (passed as parameter)

    // Clean up graph to free memory before stringifying
    graph.clear();

    // Save precomputed data (without pretty printing to save memory)
    const precomputedData = {
      mandate,
      nodes: nodesWithPositions,
      edges: edgesWithWeights,
      agreementScores: agreementScores,
      similarityScores: similarityScores,
      cohesionData: cohesionData, // Add cohesion data
      subjects: subjectsList, // List of subjects with >5 voting sessions
      votingSessions: {
        total: votingSessionsData.total,
        bySubject: votingSessionsData.bySubject,
      },
      computedAt: new Date().toISOString(),
    };

    console.log(`  Writing to file...`);
    await fsPromises.writeFile(
      outputPath,
      JSON.stringify(precomputedData) // No pretty printing to save memory
    );
    console.log(`  ✓ Saved to ${outputPath}`);

    return precomputedData;
  } catch (error) {
    console.error(`  ✗ Error processing mandate ${mandate}:`, error.message);
    throw error;
  }
}

// Helper function to process items in batches to avoid overwhelming the system
async function processInBatches(items, batchSize, processor) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((item) => processor(item).catch((error) => ({ error, item })))
    );
    results.push(...batchResults);
  }
  return results;
}

async function main() {
  console.log("Precomputing network layouts for all mandates...");
  console.log("=".repeat(60));

  const mandates = [6, 7, 8, 9, 10];
  const results = [];

  // Process all mandates in parallel
  await Promise.all(
    mandates.map(async (mandate) => {
      try {
        const mandateDir = path.join(DATA_DIR, `mandate_${mandate}`);
        const dataPath = path.join(mandateDir, "data.json");

        // Check if file exists
        if (!fs.existsSync(dataPath)) {
          console.log(
            `  ⚠️  Skipping mandate ${mandate} - data.json not found`
          );
          return;
        }

        // Load data.json once per mandate
        console.log(`\nLoading data for mandate ${mandate}...`);
        const dataText = await fsPromises.readFile(dataPath, "utf-8");
        const data = JSON.parse(dataText);

        // Save MEP info once per mandate (before any precomputation)
        await saveMEPInfo(mandate, data);

        // Count voting sessions once per mandate (reused for all variations)
        console.log(`Counting voting sessions for mandate ${mandate}...`);
        const votingSessionsData = await countVotingSessionsPerSubject(mandate);
        const subjectsList = Object.keys(votingSessionsData.bySubject)
          .sort()
          .map((subject) => ({
            name: subject,
            votingSessions: votingSessionsData.bySubject[subject],
          }));

        // Precompute full network
        const fullData = await precomputeLayout(
          mandate,
          data,
          votingSessionsData,
          subjectsList
        );
        if (fullData) {
          results.push({
            mandate,
            country: null,
            subject: null,
            success: true,
            nodes: fullData.nodes.length,
            edges: fullData.edges.length,
          });
        }

        // Get unique countries and subjects from nodes
        // Process ALL countries and ALL subjects separately (no combinations)
        const countries = [
          ...new Set(data.nodes.map((node) => node.Country).filter(Boolean)),
        ].sort();

        // Get ALL subjects from edgesBySubject (not filtered by voting sessions count)
        const subjects = data.edgesBySubject
          ? Object.keys(data.edgesBySubject).sort()
          : [];

        console.log(
          `  Processing ${countries.length} countries and ${subjects.length} subjects separately...`
        );

        // Process countries in parallel batches (each country separately)
        const countryResults = await processInBatches(
          countries,
          5, // Process 5 countries at a time
          async (country) => {
            const countryData = await precomputeLayoutForCountry(
              mandate,
              country,
              data,
              votingSessionsData,
              subjectsList
            );
            if (countryData) {
              return {
                mandate,
                country,
                subject: null,
                success: true,
                nodes: countryData.nodes.length,
                edges: countryData.edges.length,
              };
            }
            return null;
          }
        );

        results.push(...countryResults.filter((r) => r && !r.error));

        // Process subjects in parallel batches (each subject separately, no country combinations)
        const subjectResults = await processInBatches(
          subjects,
          5, // Process 5 subjects at a time
          async (subject) => {
            const subjectData = await precomputeLayoutForSubject(
              mandate,
              subject,
              data,
              votingSessionsData,
              subjectsList
            );
            if (subjectData) {
              return {
                mandate,
                country: null,
                subject,
                success: true,
                nodes: subjectData.nodes.length,
                edges: subjectData.edges.length,
              };
            }
            return null;
          }
        );

        results.push(...subjectResults.filter((r) => r && !r.error));
      } catch (error) {
        results.push({ mandate, success: false, error: error.message });
      }
    })
  );

  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  results.forEach((result) => {
    if (result.success) {
      let label = `Mandate ${result.mandate}`;
      if (result.country) label += ` - ${result.country}`;
      if (result.subject) label += ` - ${result.subject}`;
      console.log(`  ✓ ${label}: ${result.nodes} nodes, ${result.edges} edges`);
    } else {
      console.log(`  ✗ Mandate ${result.mandate}: ${result.error}`);
    }
  });
  console.log("\nDone!");
}

main().catch(console.error);
