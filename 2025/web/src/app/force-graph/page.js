"use client";

import { useEffect, useRef, useState } from "react";
import { loadMandateData } from "@/lib/dataLoader";
import MandateSelector from "@/components/MandateSelector";
import NodeInfoPanel from "@/components/NodeInfoPanel";
import Link from "next/link";

export default function ForceGraphPage() {
  const containerRef = useRef(null);
  const fgRef = useRef(null);
  const [mandate, setMandate] = useState(6);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [ForceGraph2D, setForceGraph2D] = useState(null);

  useEffect(() => {
    // Load react-force-graph-2d component dynamically
    import("react-force-graph-2d")
      .then((module) => {
        setForceGraph2D(() => module.default);
      })
      .catch((err) => {
        console.error("Error loading react-force-graph-2d:", err);
        setError("Failed to load react-force-graph-2d library");
      });
  }, []);

  useEffect(() => {
    if (ForceGraph2D) {
      loadAndPrepareGraph(mandate);
    }
  }, [mandate, ForceGraph2D]);

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

          if (
            !edgeSet.has(edgeId) &&
            !graph.hasEdge(edge.source, edge.target)
          ) {
            edgeSet.add(edgeId);
            graph.addEdge(edge.source, edge.target, {
              weight: edge.weight,
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

      // Prepare force-graph data format
      const graphNodes = nodes.map((node) => {
        const nodeAttrs = graph.getNodeAttributes(node.id);
        return {
          id: node.id,
          name: node.label,
          color: node.color,
          country: node.country,
          groupId: node.groupId,
          fx: nodeAttrs.x || node.x,
          fy: nodeAttrs.y || node.y,
        };
      });

      const graphLinks = [];
      graph.forEachEdge((edge, attrs, source, target) => {
        graphLinks.push({
          source: source,
          target: target,
          value: attrs.weight || 0,
        });
      });

      setGraphData({ nodes: graphNodes, links: graphLinks });
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
      label: node.name,
      country: node.country,
      groupId: node.groupId,
    });
  };

  return (
    <div className="visualization-page">
      <div className="page-header">
        <Link href="/" className="back-link">
          ← Back to Home
        </Link>
        <h1>react-force-graph Visualization</h1>
        <MandateSelector
          currentMandate={mandate}
          onMandateChange={setMandate}
        />
      </div>

      {loading && <div className="loading">Loading graph data...</div>}

      {error && <div className="error">Error: {error}</div>}

      {!ForceGraph2D && !loading && !error && (
        <div className="loading">Loading react-force-graph-2d library...</div>
      )}

      {graphData && ForceGraph2D && (
        <div
          style={{
            width: "100%",
            height: "calc(100vh - 150px)",
            minHeight: "600px",
          }}
        >
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            nodeLabel={(node) => node.name}
            nodeColor={(node) => node.color}
            linkWidth={0.1}
            linkColor={() => "#999999"}
            onNodeClick={handleNodeClick}
            onBackgroundClick={() => setSelectedNode(null)}
            warmupTicks={0}
            cooldownTicks={0}
            enableNodeDrag={false}
            d3Force="charge"
            d3ForceStrength={0}
            d3AlphaDecay={1}
            d3VelocityDecay={1}
            onEngineStop={() => {
              fgRef.current?.zoomToFit(400);
            }}
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
