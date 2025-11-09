'use client';

import { useEffect, useRef, useState } from 'react';
import { loadMandateData } from '@/lib/dataLoader';
import MandateSelector from '@/components/MandateSelector';
import NodeInfoPanel from '@/components/NodeInfoPanel';
import Link from 'next/link';

export default function GephiPage() {
  const containerRef = useRef(null);
  const sigmaRef = useRef(null);
  const graphRef = useRef(null);
  const [mandate, setMandate] = useState(6);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [layoutRunning, setLayoutRunning] = useState(false);

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
        import('sigma'),
        import('graphology'),
        import('graphology-layout-forceatlas2')
      ]);
      
      const Sigma = sigmaModule.default || sigmaModule;
      const Graph = graphModule.default || graphModule;
      const forceAtlas2 = forceAtlas2Module.default || forceAtlas2Module;

      // Load data
      const { nodes, edges } = await loadMandateData(mandateNum);

      // Create graphology graph (undirected by default)
      const graph = new Graph({ type: 'undirected' });
      
      // Add nodes
      nodes.forEach((node) => {
        graph.addNode(node.id, {
          label: node.label,
          x: node.x,
          y: node.y,
          size: node.size,
          color: node.color,
          country: node.country,
          groupId: node.groupId
        });
      });

      // Add all edges (no limit)
      const sampledEdges = edges;

      sampledEdges.forEach((edge) => {
        if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        // For undirected graph, hasEdge works in both directions
        if (!graph.hasEdge(edge.source, edge.target)) {
          // For undirected graphs, addEdge automatically creates undirected edge
          graph.addEdge(edge.source, edge.target, {
            weight: edge.weight,
            size: Math.max(0.1, Math.min(edge.weight * 0.5, 0.5)), // Much thinner edges
            color: '#999999'
          });
        }
        }
      });

      graphRef.current = graph;

      // Create sigma instance first
      const sigma = new Sigma(graph, containerRef.current, {
        renderLabels: false,
        defaultNodeColor: '#999',
        defaultEdgeColor: '#ccc',
        minCameraRatio: 0.1,
        maxCameraRatio: 10
      });

      // Handle node clicks
      sigma.on('clickNode', ({ node }) => {
        const nodeData = graph.getNodeAttributes(node);
        setSelectedNode({
          id: node,
          label: nodeData.label,
          country: nodeData.country,
          groupId: nodeData.groupId
        });
      });

      // Handle background clicks
      sigma.on('clickStage', () => {
        setSelectedNode(null);
      });

      sigmaRef.current = sigma;

      // Apply Force Atlas 2 layout (Gephi-style)
      setLayoutRunning(true);
      const positions = forceAtlas2(graph, {
        iterations: 200,
        settings: {
          gravity: 1,
          scalingRatio: 10,
          strongGravityMode: false,
          outboundAttractionDistribution: false,
          linLogMode: false,
          adjustSizes: false,
          edgeWeightInfluence: 1
        }
      });

      // Update node positions
      graph.forEachNode((node, attributes) => {
        if (positions[node]) {
          graph.setNodeAttribute(node, 'x', positions[node].x);
          graph.setNodeAttribute(node, 'y', positions[node].y);
        }
      });

      // Refresh sigma to show new positions
      sigma.refresh();
      setLayoutRunning(false);
      setLoading(false);
    } catch (err) {
      console.error('Error loading graph:', err);
      setError(err.message);
      setLoading(false);
      setLayoutRunning(false);
    }
  };

  return (
    <div className="visualization-page">
      <div className="page-header">
        <Link href="/" className="back-link">← Back to Home</Link>
        <h1>Gephi/Graphology Visualization</h1>
        <MandateSelector 
          currentMandate={mandate} 
          onMandateChange={setMandate} 
        />
      </div>

      {(loading || layoutRunning) && (
        <div className="loading">
          {loading ? 'Loading graph data...' : 'Computing Force Atlas 2 layout...'}
        </div>
      )}

      {error && (
        <div className="error">Error: {error}</div>
      )}

      <div 
        ref={containerRef} 
        className="network-container"
        style={{ width: '100%', height: 'calc(100vh - 150px)', minHeight: '600px' }}
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

