"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { loadMandateData } from "@/lib/dataLoader";
import MandateSelector from "@/components/MandateSelector";
import NodeInfoPanel from "@/components/NodeInfoPanel";
import Link from "next/link";

// Helper function to get flag emoji from country name
function getCountryFlag(countryName) {
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

export default function D3Page() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const tooltipRef = useRef(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const [mandate, setMandate] = useState(6);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  useEffect(() => {
    loadAndPrepareGraph(mandate);
  }, [mandate]);

  useEffect(() => {
    if (!graphData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const t = transformRef.current;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Apply transform
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    // Draw links
    ctx.strokeStyle = "#999999";
    ctx.lineWidth = 0.1;
    ctx.globalAlpha = 0.3;
    graphData.links.forEach((link) => {
      const sourceNode = graphData.nodeMap.get(link.source);
      const targetNode = graphData.nodeMap.get(link.target);
      if (sourceNode && targetNode) {
        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.stroke();
      }
    });

    // Draw nodes
    ctx.globalAlpha = 1;
    graphData.nodes.forEach((node) => {
      ctx.fillStyle = node.color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 15, 0, 2 * Math.PI);
      ctx.fill();
    });

    ctx.restore();
  }, [graphData, transform]);

  const loadAndPrepareGraph = async (mandateNum) => {
    setLoading(true);
    setError(null);
    setSelectedNode(null);

    try {
      // Dynamically import client-side libraries
      const [d3Module, graphModule, forceAtlas2Module] = await Promise.all([
        import("d3"),
        import("graphology"),
        import("graphology-layout-forceatlas2"),
      ]);

      const d3 = d3Module;
      const Graph = graphModule.default || graphModule;
      const forceAtlas2 = forceAtlas2Module.default || forceAtlas2Module;

      // Load data (may be precomputed with positions already)
      const { nodes, edges } = await loadMandateData(mandateNum);

      // Check if nodes already have positions (precomputed)
      const hasPrecomputedPositions =
        nodes.length > 0 &&
        nodes[0].x !== undefined &&
        nodes[0].y !== undefined;

      let finalNodes = nodes;
      let finalEdges = edges;

      if (!hasPrecomputedPositions) {
        // Need to compute layout
        console.log("Computing Force Atlas 2 layout...");
        const graph = new Graph({ type: "undirected" });

        // Add nodes
        nodes.forEach((node) => {
          graph.addNode(node.id, {
            label: node.label,
            x: node.x,
            y: node.y,
            color: node.color,
            country: node.country,
            groupId: node.groupId,
          });
        });

        // Add edges with weights
        const nodeIdSet = new Set(nodes.map((n) => n.id));
        const edgeSet = new Set();
        const edgesWithWeights = [];

        edges.forEach((edge) => {
          if (nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)) {
            const edgeId =
              edge.source < edge.target
                ? `${edge.source}-${edge.target}`
                : `${edge.target}-${edge.source}`;

            if (
              !edgeSet.has(edgeId) &&
              !graph.hasEdge(edge.source, edge.target)
            ) {
              edgeSet.add(edgeId);
              const weight = edge.weight || 0;
              graph.addEdge(edge.source, edge.target, { weight });
              edgesWithWeights.push({
                source: edge.source,
                target: edge.target,
                weight,
              });
            }
          }
        });

        // Compute Force Atlas 2 layout
        const positions = forceAtlas2(graph, {
          iterations: 50,
          settings: {
            gravity: 1,
            scalingRatio: 10,
            strongGravityMode: false,
          },
        });

        // Update node positions
        graph.forEachNode((node) => {
          if (positions[node]) {
            graph.setNodeAttribute(node, "x", positions[node].x);
            graph.setNodeAttribute(node, "y", positions[node].y);
          }
        });

        // Prepare data with node lookup map
        const nodeMap = new Map();
        const d3Nodes = new Array(nodes.length);

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const nodeAttrs = graph.getNodeAttributes(node.id);
          const nodeData = {
            id: node.id,
            label: node.label,
            color: node.color,
            country: node.country,
            groupId: node.groupId,
            x: nodeAttrs.x || node.x,
            y: nodeAttrs.y || node.y,
          };
          nodeMap.set(node.id, nodeData);
          d3Nodes[i] = nodeData;
        }

        // Use all edges for layout calculation, but only visualize top 50% by weight for performance
        edgesWithWeights.sort((a, b) => b.weight - a.weight);
        const edgeThreshold = Math.ceil(edgesWithWeights.length * 0.5);
        const filteredEdges = edgesWithWeights.slice(0, edgeThreshold);

        finalEdges = filteredEdges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          weight: edge.weight,
        }));

        finalNodes = d3Nodes;
      } else {
        // Use precomputed positions - just filter edges for visualization
        console.log("Using precomputed layout positions");

        const nodeMap = new Map();
        const d3Nodes = new Array(nodes.length);

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const nodeData = {
            id: node.id,
            label: node.label,
            color: node.color,
            country: node.country,
            groupId: node.groupId,
            x: node.x,
            y: node.y,
          };
          nodeMap.set(node.id, nodeData);
          d3Nodes[i] = nodeData;
        }

        // Filter edges for visualization (top 50% by weight)
        const edgesWithWeights = edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          weight: edge.weight || 0,
        }));

        edgesWithWeights.sort((a, b) => b.weight - a.weight);
        const edgeThreshold = Math.ceil(edgesWithWeights.length * 0.5);
        const filteredEdges = edgesWithWeights.slice(0, edgeThreshold);

        finalEdges = filteredEdges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          weight: edge.weight,
        }));

        finalNodes = d3Nodes;
      }

      // Create node map for quick lookups
      const nodeMap = new Map();
      finalNodes.forEach((node) => {
        nodeMap.set(node.id, node);
      });

      setGraphData({ nodes: finalNodes, links: finalEdges, nodeMap });
      setLoading(false);
    } catch (err) {
      console.error("Error loading graph:", err);
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    const d3 = require("d3");
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Set up canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.cursor = "grab";

    // Clear container and add canvas
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(canvas);
    canvasRef.current = canvas;

    // Calculate initial transform
    const xExtent = d3.extent(graphData.nodes, (d) => d.x);
    const yExtent = d3.extent(graphData.nodes, (d) => d.y);
    const fullWidth = xExtent[1] - xExtent[0];
    const fullHeight = yExtent[1] - yExtent[0];
    const centerX = (xExtent[0] + xExtent[1]) / 2;
    const centerY = (yExtent[0] + yExtent[1]) / 2;

    const scale = Math.min(width / fullWidth, height / fullHeight) * 0.9;
    const initialTransform = {
      x: width / 2 - scale * centerX,
      y: height / 2 - scale * centerY,
      k: scale,
    };
    transformRef.current = initialTransform;
    setTransform(initialTransform);

    // Add zoom behavior
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 10])
      .on("zoom", (event) => {
        const t = event.transform;
        transformRef.current = { x: t.x, y: t.y, k: t.k };
        setTransform({ x: t.x, y: t.y, k: t.k });
      });

    d3.select(canvas).call(zoom);

    // Handle mouse move for hover tooltip
    const handleMouseMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      const currentTransform = transformRef.current;
      const x =
        (event.clientX - rect.left - currentTransform.x) / currentTransform.k;
      const y =
        (event.clientY - rect.top - currentTransform.y) / currentTransform.k;

      // Find hovered node
      const hovered = graphData.nodes.find((node) => {
        const dx = node.x - x;
        const dy = node.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < 15 / currentTransform.k;
      });

      if (hovered) {
        setHoveredNode(hovered);
        setTooltipPosition({ x: event.clientX, y: event.clientY });
      } else {
        setHoveredNode(null);
      }
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", () => setHoveredNode(null));

    // Handle node clicks
    const handleClick = (event) => {
      const rect = canvas.getBoundingClientRect();
      const currentTransform = transformRef.current;
      const x =
        (event.clientX - rect.left - currentTransform.x) / currentTransform.k;
      const y =
        (event.clientY - rect.top - currentTransform.y) / currentTransform.k;

      // Find clicked node
      const clickedNode = graphData.nodes.find((node) => {
        const dx = node.x - x;
        const dy = node.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < 15 / currentTransform.k; // Account for scale
      });

      if (clickedNode) {
        setSelectedNode({
          id: clickedNode.id,
          label: clickedNode.label,
          country: clickedNode.country,
          groupId: clickedNode.groupId,
        });
      }
    };

    canvas.addEventListener("click", handleClick);

    // Cleanup
    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", () => setHoveredNode(null));
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    };
  }, [graphData]);

  return (
    <div className="visualization-page">
      <div className="page-header">
        <Link href="/" className="back-link">
          ← Back to Home
        </Link>
        <h1>D3.js Visualization (Canvas)</h1>
        <MandateSelector
          currentMandate={mandate}
          onMandateChange={setMandate}
        />
      </div>

      {loading && <div className="loading">Loading graph data...</div>}

      {error && <div className="error">Error: {error}</div>}

      <div
        ref={containerRef}
        className="network-container"
        style={{
          width: "100%",
          height: "calc(100vh - 150px)",
          minHeight: "600px",
          position: "relative",
        }}
      />

      {hoveredNode && (
        <div
          ref={tooltipRef}
          style={{
            position: "fixed",
            left: `${tooltipPosition.x + 10}px`,
            top: `${tooltipPosition.y - 10}px`,
            background: "rgba(0, 0, 0, 0.8)",
            color: "white",
            padding: "6px 10px",
            borderRadius: "4px",
            fontSize: "12px",
            pointerEvents: "none",
            zIndex: 1000,
            lineHeight: "1.4",
          }}
        >
          <div>{hoveredNode.label}</div>
          {hoveredNode.groupId && (
            <div
              style={{
                fontSize: "11px",
                opacity: 0.9,
                marginTop: "2px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span>{hoveredNode.groupId}</span>
              {hoveredNode.country && (
                <span style={{ fontSize: "12px" }}>
                  / {getCountryFlag(hoveredNode.country)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {selectedNode && (
        <NodeInfoPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
