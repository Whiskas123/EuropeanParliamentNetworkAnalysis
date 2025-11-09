"use client";

import { useEffect, useRef, useState } from "react";
import { loadMandateData } from "@/lib/dataLoader";
import MandateSelector from "@/components/MandateSelector";
import NodeInfoPanel from "@/components/NodeInfoPanel";
import Link from "next/link";

export default function VisPage() {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const [mandate, setMandate] = useState(6);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAndRenderGraph(mandate);

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy();
      }
    };
  }, [mandate]);

  const loadAndRenderGraph = async (mandateNum) => {
    setLoading(true);
    setError(null);
    setSelectedNode(null);

    try {
      // Clean up previous instance
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }

      // Dynamically import client-side libraries
      const [visModule, graphModule, forceAtlas2Module] = await Promise.all([
        import("vis-network"),
        import("graphology"),
        import("graphology-layout-forceatlas2"),
      ]);

      const { Network } = visModule;
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

      // Prepare vis.js data format
      const visNodes = nodes.map((node) => {
        const nodeAttrs = graph.getNodeAttributes(node.id);
        return {
          id: node.id,
          label: node.label,
          color: node.color,
          x: nodeAttrs.x || node.x,
          y: nodeAttrs.y || node.y,
          title: `${node.label}\n${node.country}\n${node.groupId}`,
        };
      });

      const visEdges = [];
      graph.forEachEdge((edge, attrs, source, target) => {
        visEdges.push({
          from: source,
          to: target,
          value: attrs.weight || 0,
          width: 0.1,
          color: { color: "#999999", opacity: 0.5 },
        });
      });

      const data = {
        nodes: visNodes,
        edges: visEdges,
      };

      const options = {
        nodes: {
          size: 8,
          font: {
            size: 10,
          },
        },
        edges: {
          width: 0.1,
          color: {
            color: "#999999",
            opacity: 0.5,
          },
          smooth: {
            type: "straight",
          },
        },
        physics: {
          enabled: false, // Use pre-computed positions
        },
        interaction: {
          zoomView: true,
          dragView: true,
        },
      };

      // Create vis.js network
      const network = new Network(containerRef.current, data, options);

      // Handle node clicks
      network.on("click", (params) => {
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];
          const node = nodes.find((n) => n.id === nodeId);
          if (node) {
            setSelectedNode({
              id: node.id,
              label: node.label,
              country: node.country,
              groupId: node.groupId,
            });
          }
        } else {
          setSelectedNode(null);
        }
      });

      networkRef.current = network;
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
        <h1>vis.js Visualization</h1>
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

