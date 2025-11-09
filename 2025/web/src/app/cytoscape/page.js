"use client";

import { useEffect, useRef, useState } from "react";
import { loadMandateData } from "@/lib/dataLoader";
import MandateSelector from "@/components/MandateSelector";
import NodeInfoPanel from "@/components/NodeInfoPanel";
import Link from "next/link";

export default function CytoscapePage() {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [mandate, setMandate] = useState(6);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAndRenderGraph(mandate);

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
      }
    };
  }, [mandate]);

  const loadAndRenderGraph = async (mandateNum) => {
    setLoading(true);
    setError(null);
    setSelectedNode(null);

    try {
      // Clean up previous instance
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }

      // Dynamically import client-side libraries
      const [cytoscapeModule, graphModule, forceAtlas2Module] =
        await Promise.all([
          import("cytoscape"),
          import("graphology"),
          import("graphology-layout-forceatlas2"),
        ]);

      const cytoscape = cytoscapeModule.default;
      const Graph = graphModule.default || graphModule;
      const forceAtlas2 = forceAtlas2Module.default || forceAtlas2Module;

      // Load data
      const { nodes, edges } = await loadMandateData(mandateNum);

      // First, create graphology graph and compute Force Atlas 2 layout
      console.log("Computing Force Atlas 2 layout...");
      const graph = new Graph({ type: "undirected" });

      // Add nodes to graphology graph
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

      // Add edges to graphology graph
      const nodeIdSet = new Set(nodes.map((n) => n.id));
      const edgeSet = new Set();
      let edgesAdded = 0;

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
            graph.addEdge(edge.source, edge.target, {
              weight: edge.weight,
            });
            edgesAdded++;
          }
        }
      });

      console.log(`Added ${edgesAdded} edges to graphology graph`);

      // Compute Force Atlas 2 layout
      const positions = forceAtlas2(graph, {
        iterations: 100,
        settings: {
          gravity: 1,
          scalingRatio: 10,
          strongGravityMode: false,
        },
      });

      // Update node positions in graph
      graph.forEachNode((node) => {
        if (positions[node]) {
          graph.setNodeAttribute(node, "x", positions[node].x);
          graph.setNodeAttribute(node, "y", positions[node].y);
        }
      });

      console.log("Layout computed, creating cytoscape visualization...");

      // Prepare cytoscape elements with computed positions
      const elements = [];

      // Add nodes with computed positions
      nodes.forEach((node) => {
        const nodeAttrs = graph.getNodeAttributes(node.id);
        elements.push({
          data: {
            id: node.id,
            label: node.label,
            country: node.country,
            groupId: node.groupId,
            color: node.color,
          },
          position: {
            x: nodeAttrs.x || node.x,
            y: nodeAttrs.y || node.y,
          },
        });
      });

      // Add edges from graphology graph (already deduplicated)
      let cytoscapeEdges = 0;
      graph.forEachEdge((edge, attrs, source, target) => {
        const edgeId =
          source < target ? `${source}-${target}` : `${target}-${source}`;
        elements.push({
          data: {
            id: edgeId,
            source: source,
            target: target,
            weight: attrs.weight || 0,
          },
        });
        cytoscapeEdges++;
      });

      console.log(`Added ${cytoscapeEdges} edges to cytoscape`);

      // Create cytoscape instance
      const cy = cytoscape({
        container: containerRef.current,
        elements: elements,
        style: [
          {
            selector: "node",
            style: {
              "background-color": "data(color)",
              label: "data(label)",
              width: 10,
              height: 10,
              "font-size": 8,
              "text-valign": "center",
              "text-halign": "center",
              "text-outline-width": 2,
              "text-outline-color": "#ffffff",
            },
          },
          {
            selector: "edge",
            style: {
              width: "mapData(weight, 0, 1, 0.1, 0.5)", // Much thinner edges
              "line-color": "#999",
              opacity: "mapData(weight, 0, 1, 0.3, 0.8)",
              "curve-style": "straight",
              "target-arrow-shape": "none",
              "source-arrow-shape": "none",
            },
          },
        ],
        layout: {
          name: "preset", // Use preset positions (already computed by Force Atlas 2)
          fit: true,
          padding: 30,
        },
      });

      // Handle node clicks
      cy.on("tap", "node", (evt) => {
        const node = evt.target;
        const nodeData = node.data();
        setSelectedNode({
          id: nodeData.id,
          label: nodeData.label,
          country: nodeData.country,
          groupId: nodeData.groupId,
        });
      });

      // Handle background clicks
      cy.on("tap", (evt) => {
        if (evt.target === cy) {
          setSelectedNode(null);
        }
      });

      cyRef.current = cy;
      setLoading(false);
    } catch (err) {
      console.error("Error loading graph:", err);
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="visualization-page">
      <div className="page-header">
        <Link href="/" className="back-link">
          ← Back to Home
        </Link>
        <h1>Cytoscape.js Visualization</h1>
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
        }}
      />

      {selectedNode && (
        <NodeInfoPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
