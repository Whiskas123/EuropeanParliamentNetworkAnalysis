"use client";

import { useEffect, useRef, useState } from "react";
import { loadMandateData } from "@/lib/dataLoader";
import MandateSelector from "@/components/MandateSelector";
import NodeInfoPanel from "@/components/NodeInfoPanel";
import Link from "next/link";

export default function SigmaPage() {
  const containerRef = useRef(null);
  const sigmaRef = useRef(null);
  const graphRef = useRef(null);
  const [mandate, setMandate] = useState(6);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAndRenderGraph(mandate);

    return () => {
      if (sigmaRef.current) {
        sigmaRef.current.kill();
      }
    };
  }, [mandate]);

  const loadAndRenderGraph = async (mandateNum) => {
    setLoading(true);
    setError(null);
    setSelectedNode(null);

    try {
      // Clean up previous instance
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }

      // Dynamically import client-side libraries
      const [sigmaModule, graphModule, forceAtlas2Module] = await Promise.all([
        import("sigma"),
        import("graphology"),
        import("graphology-layout-forceatlas2"),
      ]);

      const Sigma = sigmaModule.default || sigmaModule;
      const Graph = graphModule.default || graphModule;
      const forceAtlas2 = forceAtlas2Module.default || forceAtlas2Module;

      // Load data
      const { nodes, edges } = await loadMandateData(mandateNum);

      // Create graphology graph (undirected by default)
      const graph = new Graph({ type: "undirected" });

      // Add nodes
      const nodeIds = new Set();
      nodes.forEach((node) => {
        graph.addNode(node.id, {
          label: node.label,
          x: node.x,
          y: node.y,
          size: node.size,
          color: node.color,
          country: node.country,
          groupId: node.groupId,
        });
        nodeIds.add(node.id);
      });

      console.log(`Added ${nodes.length} nodes to graph`);

      // Add all edges (no limit)
      const sampledEdges = edges;

      console.log(`Processing all ${sampledEdges.length} edges`);

      // Create a set of all node IDs for quick lookup
      const nodeIdSet = new Set(graph.nodes());
      console.log(`Node ID set size: ${nodeIdSet.size}`);

      // Check sample of edge sources/targets
      const sampleEdgeSources = new Set(
        sampledEdges.slice(0, 100).map((e) => e.source)
      );
      const sampleEdgeTargets = new Set(
        sampledEdges.slice(0, 100).map((e) => e.target)
      );
      const sampleSourcesInNodes = Array.from(sampleEdgeSources).filter((id) =>
        nodeIdSet.has(id)
      );
      const sampleTargetsInNodes = Array.from(sampleEdgeTargets).filter((id) =>
        nodeIdSet.has(id)
      );
      console.log(
        `Sample: ${sampleSourcesInNodes.length}/${sampleEdgeSources.size} sources in nodes, ${sampleTargetsInNodes.length}/${sampleEdgeTargets.size} targets in nodes`
      );

      let edgesAdded = 0;
      let missingNodes = 0;
      let duplicateEdges = 0;
      let missingSourceCount = 0;
      let missingTargetCount = 0;

      sampledEdges.forEach((edge) => {
        const hasSource = graph.hasNode(edge.source);
        const hasTarget = graph.hasNode(edge.target);

        if (!hasSource) {
          missingSourceCount++;
        }
        if (!hasTarget) {
          missingTargetCount++;
        }

        if (!hasSource || !hasTarget) {
          missingNodes++;
          if (missingNodes <= 10) {
            console.warn(
              `Missing nodes for edge: source=${edge.source} (exists: ${hasSource}), target=${edge.target} (exists: ${hasTarget})`
            );
          }
          return;
        }

        // For undirected graph, hasEdge works in both directions
        if (!graph.hasEdge(edge.source, edge.target)) {
          try {
            // For undirected graphs, addEdge automatically creates undirected edge
            graph.addEdge(edge.source, edge.target, {
              weight: edge.weight,
              size: 0, // Uniform super thin edges
              color: "#666666",
              type: "line",
            });
            edgesAdded++;
          } catch (err) {
            // Edge might already exist, skip
            duplicateEdges++;
            if (duplicateEdges < 10) {
              console.warn(
                `Could not add edge ${edge.source}-${edge.target}:`,
                err.message
              );
            }
          }
        } else {
          duplicateEdges++;
        }
      });

      console.log(
        `Added ${edgesAdded} edges to graph with ${graph.order} nodes`
      );
      console.log(
        `Missing nodes: ${missingNodes} (${missingSourceCount} missing sources, ${missingTargetCount} missing targets)`
      );
      console.log(`Duplicate/skipped edges: ${duplicateEdges}`);
      console.log(`Graph has ${graph.size} edges total`);

      // Verify edges are actually in the graph
      if (graph.size === 0) {
        console.error(
          "WARNING: Graph has 0 edges! This is likely why you see disconnected points."
        );
      }

      graphRef.current = graph;

      // Verify graph structure before creating sigma
      console.log(`Graph structure: ${graph.order} nodes, ${graph.size} edges`);
      console.log(`Sample nodes:`, Array.from(graph.nodes()).slice(0, 5));
      console.log(
        `Sample edges:`,
        Array.from(graph.edges())
          .slice(0, 5)
          .map((e) => {
            const attrs = graph.getEdgeAttributes(e);
            return {
              id: e,
              source: graph.source(e),
              target: graph.target(e),
              weight: attrs.weight,
            };
          })
      );

      // Create sigma instance first
      const sigma = new Sigma(graph, containerRef.current, {
        renderLabels: false,
        defaultNodeColor: "#999",
        defaultEdgeColor: "#666",
        minCameraRatio: 0.1,
        maxCameraRatio: 10,
        allowInvalidEdges: false,
        renderEdgeLabels: false,
        // Ensure edges are rendered
        zIndex: true,
      });

      // Set default edge renderer settings
      sigma.setSetting("defaultEdgeColor", "#666666");
      sigma.setSetting("defaultEdgeType", "line");

      // Apply Force Atlas 2 layout
      console.log("Applying Force Atlas 2 layout...");
      const positions = forceAtlas2(graph, {
        iterations: 100,
        settings: {
          gravity: 1,
          scalingRatio: 10,
          strongGravityMode: false,
        },
      });

      // Update node positions
      let positionsUpdated = 0;
      graph.forEachNode((node, attributes) => {
        if (positions[node]) {
          graph.setNodeAttribute(node, "x", positions[node].x);
          graph.setNodeAttribute(node, "y", positions[node].y);
          positionsUpdated++;
        }
      });

      console.log(`Updated positions for ${positionsUpdated} nodes`);

      // Refresh sigma to show new positions and edges
      sigma.refresh();

      // Force a camera reset to ensure everything is visible
      sigma.getCamera().setState({
        x: 0,
        y: 0,
        ratio: 1,
      });

      // Fit the graph to view
      setTimeout(() => {
        sigma.getCamera().animatedReset({ duration: 500 });
      }, 100);

      // Handle node clicks
      sigma.on("clickNode", ({ node }) => {
        const nodeData = graph.getNodeAttributes(node);
        setSelectedNode({
          id: node,
          label: nodeData.label,
          country: nodeData.country,
          groupId: nodeData.groupId,
        });
      });

      // Handle background clicks
      sigma.on("clickStage", () => {
        setSelectedNode(null);
      });

      sigmaRef.current = sigma;
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
        <h1>Sigma.js Visualization</h1>
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
