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
    "Verts/ALE": "#00FF00",
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
    "Greens/EFA": "#00FF00",
    ID: "#000000",
    PfE: "#000000", // Patriots for Europe - black
    ESN: "#8B4513", // European Sovereign Nations - brown
  };
  return colorMap[groupId] || "#CCCCCC";
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

    // Rotate layout so GUE/NGL is on the left
    // Find GUE/NGL nodes
    const gueNglNodes = initialPositions.filter(
      (node) => node.groupId === "GUE/NGL"
    );

    let nodesWithPositions;

    if (gueNglNodes.length > 0) {
      // Calculate centroid of GUE/NGL nodes
      const gueNglCentroidX =
        gueNglNodes.reduce((sum, node) => sum + node.x, 0) / gueNglNodes.length;
      const gueNglCentroidY =
        gueNglNodes.reduce((sum, node) => sum + node.y, 0) / gueNglNodes.length;

      // Calculate centroid of all nodes
      const allCentroidX =
        initialPositions.reduce((sum, node) => sum + node.x, 0) /
        initialPositions.length;
      const allCentroidY =
        initialPositions.reduce((sum, node) => sum + node.y, 0) /
        initialPositions.length;

      // Calculate vector from all centroid to GUE/NGL centroid
      const dx = gueNglCentroidX - allCentroidX;
      const dy = gueNglCentroidY - allCentroidY;

      // Calculate angle to rotate so GUE/NGL is on the left
      // We want GUE/NGL to be at angle ~180 degrees (left side)
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
        `  ✓ Rotated layout: GUE/NGL positioned on the left (${gueNglNodes.length} nodes)`
      );
    } else {
      // No GUE/NGL nodes found, use original positions
      nodesWithPositions = initialPositions;
      console.log(`  ⚠️  No GUE/NGL nodes found, using original layout`);
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

    // Save precomputed data
    const precomputedData = {
      mandate,
      nodes: nodesWithPositions,
      edges: edgesWithWeights,
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
      const data = await precomputeLayout(mandate);
      if (data) {
        results.push({
          mandate,
          success: true,
          nodes: data.nodes.length,
          edges: data.edges.length,
        });
      }
    } catch (error) {
      results.push({ mandate, success: false, error: error.message });
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  results.forEach((result) => {
    if (result.success) {
      console.log(
        `  ✓ Mandate ${result.mandate}: ${result.nodes} nodes, ${result.edges} edges`
      );
    } else {
      console.log(`  ✗ Mandate ${result.mandate}: ${result.error}`);
    }
  });
  console.log("\nDone!");
}

main().catch(console.error);
