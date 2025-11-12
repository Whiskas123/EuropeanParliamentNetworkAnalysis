/**
 * Precompute Force Atlas 2 layouts for all mandates
 * This script computes node positions and saves them as JSON files
 * Run with: node scripts/precompute-layouts.js
 */

const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

// Import graphology modules (using require for Node.js)
const Graph = require("graphology");
const forceAtlas2 = require("graphology-layout-forceatlas2");

const DATA_DIR = path.join(__dirname, "../public/data");
const OUTPUT_DIR = path.join(__dirname, "../public/data/precomputed");

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

async function precomputeLayoutForCountry(mandate, country) {
  console.log(`\n  Processing ${country}...`);

  const mandateDir = path.join(DATA_DIR, `mandate_${mandate}`);
  const nodesPath = path.join(mandateDir, "nodes.csv");
  const edgesPath = path.join(mandateDir, "edges.csv");
  const countryOutputPath = path.join(
    OUTPUT_DIR,
    `mandate_${mandate}_${country.replace(/\s+/g, "_")}.json`
  );

  // Check if files exist
  if (!fs.existsSync(nodesPath) || !fs.existsSync(edgesPath)) {
    console.log(`    ⚠️  Skipping ${country} - files not found`);
    return null;
  }

  try {
    // Load nodes
    const nodesText = fs.readFileSync(nodesPath, "utf-8");
    const nodesResult = Papa.parse(nodesText, {
      header: true,
      skipEmptyLines: true,
    });

    // Filter nodes by country
    const allNodes = nodesResult.data.map((row) => ({
      id: row.Id,
      label: row.FullName,
      country: row.Country,
      groupId: row.GroupID,
      color: getGroupColor(row.GroupID),
    }));

    const nodes = allNodes.filter((node) => node.country === country);

    if (nodes.length === 0) {
      console.log(`    ⚠️  No nodes found for ${country}`);
      return null;
    }

    console.log(`    Loaded ${nodes.length} nodes for ${country}`);

    // Load edges
    const edgesText = fs.readFileSync(edgesPath, "utf-8");
    const edgesResult = Papa.parse(edgesText, {
      header: true,
      skipEmptyLines: true,
    });

    const allEdges = edgesResult.data.map((row) => ({
      source: row.Source,
      target: row.Target,
      weight: parseFloat(row.Weight) || 0,
    }));

    // Filter edges to only include those between nodes from the same country
    const nodeIdSet = new Set(nodes.map((n) => n.id));
    const edges = allEdges.filter(
      (edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)
    );

    console.log(`    Loaded ${edges.length} edges for ${country}`);

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

    nodes.forEach((node) => {
      const mepId = node.id;
      const mepGroupScores = {};

      // For each political group, calculate average edge weight
      allGroups.forEach((groupId) => {
        const groupNodes = nodes.filter((n) => n.groupId === groupId);
        const groupNodeIds = new Set(groupNodes.map((n) => n.id));

        // Find all edges between this MEP and MEPs from this group
        const groupEdges = [];
        graph.forEachNeighbor(mepId, (neighborId) => {
          if (groupNodeIds.has(neighborId)) {
            const edge = graph.getEdgeAttributes(mepId, neighborId);
            if (edge && edge.weight !== undefined) {
              groupEdges.push(edge.weight);
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

    // Save precomputed data
    const precomputedData = {
      mandate,
      country,
      nodes: nodesWithPositions,
      edges: edgesWithWeights,
      agreementScores: agreementScores,
      computedAt: new Date().toISOString(),
    };

    fs.writeFileSync(
      countryOutputPath,
      JSON.stringify(precomputedData, null, 2)
    );
    console.log(`    ✓ Saved to ${countryOutputPath}`);

    return precomputedData;
  } catch (error) {
    console.error(`    ✗ Error processing ${country}:`, error.message);
    return null;
  }
}

async function precomputeLayout(mandate) {
  console.log(`\nProcessing mandate ${mandate}...`);

  const mandateDir = path.join(DATA_DIR, `mandate_${mandate}`);
  const nodesPath = path.join(mandateDir, "nodes.csv");
  const edgesPath = path.join(mandateDir, "edges.csv");
  const outputPath = path.join(OUTPUT_DIR, `mandate_${mandate}.json`);

  // Check if files exist
  if (!fs.existsSync(nodesPath) || !fs.existsSync(edgesPath)) {
    console.log(`  ⚠️  Skipping mandate ${mandate} - files not found`);
    return;
  }

  try {
    // Load nodes
    const nodesText = fs.readFileSync(nodesPath, "utf-8");
    const nodesResult = Papa.parse(nodesText, {
      header: true,
      skipEmptyLines: true,
    });

    const nodes = nodesResult.data.map((row) => ({
      id: row.Id,
      label: row.FullName,
      country: row.Country,
      groupId: row.GroupID,
      color: getGroupColor(row.GroupID),
    }));

    console.log(`  Loaded ${nodes.length} nodes`);

    // Load edges
    const edgesText = fs.readFileSync(edgesPath, "utf-8");
    const edgesResult = Papa.parse(edgesText, {
      header: true,
      skipEmptyLines: true,
    });

    const edges = edgesResult.data.map((row) => ({
      source: row.Source,
      target: row.Target,
      weight: parseFloat(row.Weight) || 0,
    }));

    console.log(`  Loaded ${edges.length} edges`);

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

    nodes.forEach((node) => {
      const mepId = node.id;
      const mepGroupScores = {};

      // For each political group, calculate average edge weight
      allGroups.forEach((groupId) => {
        const groupNodes = nodes.filter((n) => n.groupId === groupId);
        const groupNodeIds = new Set(groupNodes.map((n) => n.id));

        // Find all edges between this MEP and MEPs from this group
        const groupEdges = [];
        graph.forEachNeighbor(mepId, (neighborId) => {
          if (groupNodeIds.has(neighborId)) {
            const edge = graph.getEdgeAttributes(mepId, neighborId);
            if (edge && edge.weight !== undefined) {
              groupEdges.push(edge.weight);
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

    // Save precomputed data
    const precomputedData = {
      mandate,
      nodes: nodesWithPositions,
      edges: edgesWithWeights,
      agreementScores: agreementScores,
      computedAt: new Date().toISOString(),
    };

    fs.writeFileSync(outputPath, JSON.stringify(precomputedData, null, 2));
    console.log(`  ✓ Saved to ${outputPath}`);

    return precomputedData;
  } catch (error) {
    console.error(`  ✗ Error processing mandate ${mandate}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log("Precomputing network layouts for all mandates...");
  console.log("=".repeat(60));

  const mandates = [6, 7, 8, 9, 10];
  const results = [];

  for (const mandate of mandates) {
    try {
      // Precompute full network
      const data = await precomputeLayout(mandate);
      if (data) {
        results.push({
          mandate,
          country: null,
          success: true,
          nodes: data.nodes.length,
          edges: data.edges.length,
        });
      }

      // Get unique countries from nodes
      const mandateDir = path.join(DATA_DIR, `mandate_${mandate}`);
      const nodesPath = path.join(mandateDir, "nodes.csv");
      if (fs.existsSync(nodesPath)) {
        const nodesText = fs.readFileSync(nodesPath, "utf-8");
        const nodesResult = Papa.parse(nodesText, {
          header: true,
          skipEmptyLines: true,
        });
        const countries = [
          ...new Set(
            nodesResult.data.map((row) => row.Country).filter(Boolean)
          ),
        ].sort();

        // Precompute country-filtered networks
        for (const country of countries) {
          const countryData = await precomputeLayoutForCountry(
            mandate,
            country
          );
          if (countryData) {
            results.push({
              mandate,
              country,
              success: true,
              nodes: countryData.nodes.length,
              edges: countryData.edges.length,
            });
          }
        }
      }
    } catch (error) {
      results.push({ mandate, success: false, error: error.message });
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  results.forEach((result) => {
    if (result.success) {
      const label = result.country
        ? `Mandate ${result.mandate} - ${result.country}`
        : `Mandate ${result.mandate}`;
      console.log(`  ✓ ${label}: ${result.nodes} nodes, ${result.edges} edges`);
    } else {
      console.log(`  ✗ Mandate ${result.mandate}: ${result.error}`);
    }
  });
  console.log("\nDone!");
}

main().catch(console.error);
