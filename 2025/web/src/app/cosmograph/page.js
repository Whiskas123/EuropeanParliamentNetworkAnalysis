"use client";

import { useEffect, useRef, useState } from "react";
import { loadMandateData } from "@/lib/dataLoader";
import MandateSelector from "@/components/MandateSelector";
import NodeInfoPanel from "@/components/NodeInfoPanel";
import Link from "next/link";

export default function CosmographPage() {
  const containerRef = useRef(null);
  const cosmographRef = useRef(null);
  const [mandate, setMandate] = useState(6);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [CosmographComponent, setCosmographComponent] = useState(null);

  useEffect(() => {
    // Load Cosmograph component dynamically
    import("@cosmograph/react")
      .then((module) => {
        setCosmographComponent(() => module.Cosmograph);
      })
      .catch((err) => {
        console.error("Error loading Cosmograph:", err);
        setError("Failed to load Cosmograph library");
      });
  }, []);

  useEffect(() => {
    if (CosmographComponent) {
      loadAndPrepareGraph(mandate);
    }
  }, [mandate, CosmographComponent]);

  const loadAndPrepareGraph = async (mandateNum) => {
    setLoading(true);
    setError(null);
    setSelectedNode(null);

    try {
      // Dynamically import client-side libraries
      const [graphModule, forceAtlas2Module] = await Promise.all([
        import("graphology"),
        import("graphology-layout-forceatlas2"),
      ]);

      const Graph = graphModule.default || graphModule;
      const forceAtlas2 = forceAtlas2Module.default || forceAtlas2Module;

      // Load data
      const { nodes, edges } = await loadMandateData(mandateNum);

      // Create graphology graph and compute Force Atlas 2 layout
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

      // Add edges
      const nodeIdSet = new Set(nodes.map((n) => n.id));
      const edgeSet = new Set();

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
          }
        }
      });

      // Compute Force Atlas 2 layout
      const positions = forceAtlas2(graph, {
        iterations: 100,
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

      // Prepare Cosmograph data format
      const cosmographNodes = nodes.map((node) => {
        const nodeAttrs = graph.getNodeAttributes(node.id);
        return {
          id: node.id,
          x: nodeAttrs.x || node.x,
          y: nodeAttrs.y || node.y,
          color: node.color,
          label: node.label,
          country: node.country,
          groupId: node.groupId,
        };
      });

      const cosmographLinks = [];
      graph.forEachEdge((edge, attrs, source, target) => {
        cosmographLinks.push({
          source: source,
          target: target,
          weight: attrs.weight || 0,
        });
      });

      setGraphData({ nodes: cosmographNodes, links: cosmographLinks });
      setLoading(false);
    } catch (err) {
      console.error("Error loading graph:", err);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleNodeClick = (node) => {
    setSelectedNode({
      id: node.id,
      label: node.label,
      country: node.country,
      groupId: node.groupId,
    });
  };

  if (!CosmographComponent) {
    return (
      <div className="visualization-page">
        <div className="loading">Loading Cosmograph library...</div>
      </div>
    );
  }

  return (
    <div className="visualization-page">
      <div className="page-header">
        <Link href="/" className="back-link">
          ← Back to Home
        </Link>
        <h1>Cosmograph Visualization</h1>
        <MandateSelector
          currentMandate={mandate}
          onMandateChange={setMandate}
        />
      </div>

      {loading && <div className="loading">Loading graph data...</div>}

      {error && <div className="error">Error: {error}</div>}

      {graphData && (
        <div
          ref={containerRef}
          className="network-container"
          style={{
            width: "100%",
            height: "calc(100vh - 150px)",
            minHeight: "600px",
          }}
        >
          <CosmographComponent
            ref={cosmographRef}
            nodes={graphData.nodes}
            links={graphData.links}
            nodeColor={(node) => node.color}
            nodeSize={5}
            linkWidth={0.1}
            linkColor="#999999"
            onNodeClick={handleNodeClick}
            onBackgroundClick={() => setSelectedNode(null)}
          />
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

