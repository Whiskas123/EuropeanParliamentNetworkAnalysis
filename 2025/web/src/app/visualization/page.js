"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { loadMandateData } from "@/lib/dataLoader";
import MandateSelector from "@/components/MandateSelector";
import CountrySelector from "@/components/CountrySelector";
import NetworkCanvas from "@/components/NetworkCanvas";
import Sidebar from "@/components/Sidebar";
import HoverTooltip from "@/components/HoverTooltip";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function VisualizationPage() {
  const [mandate, setMandate] = useState(10);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [closestMEPs, setClosestMEPs] = useState([]);
  const [intergroupCohesion, setIntergroupCohesion] = useState(null);
  const [intragroupCohesion, setIntragroupCohesion] = useState(null);
  const [groupSimilarityScore, setGroupSimilarityScore] = useState(null);
  const [countrySimilarityScore, setCountrySimilarityScore] = useState(null);
  const [agreementScores, setAgreementScores] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const previousGraphDataRef = useRef(null);
  const currentGraphDataRef = useRef(null);
  const cohesionDataRef = useRef({
    intergroup: null,
    intragroup: null,
    graphDataId: null,
  });
  const cohesionGraphDataRef = useRef(null); // Track which graphData the cohesion belongs to

  // Cache the imported modules
  const modulesRef = useRef(null);

  const loadAndPrepareGraph = useCallback(
    async (mandateNum, country = null) => {
      setLoading(true);
      setError(null);
      setSelectedNode(null);

      try {
        // Import libraries only once and cache them
        if (!modulesRef.current) {
          const [d3Module, graphModule, forceAtlas2Module] = await Promise.all([
            import("d3"),
            import("graphology"),
            import("graphology-layout-forceatlas2"),
          ]);
          modulesRef.current = {
            d3: d3Module,
            Graph: graphModule.default || graphModule,
            forceAtlas2: forceAtlas2Module.default || forceAtlas2Module,
          };
        }

        const { d3, Graph, forceAtlas2 } = modulesRef.current;

        // Load data (may be precomputed with positions already)
        const { nodes, edges, agreementScores, metadata } =
          await loadMandateData(mandateNum, country);

        // Check if nodes already have positions (precomputed)
        const hasPrecomputedPositions =
          nodes.length > 0 &&
          nodes[0].x !== undefined &&
          nodes[0].y !== undefined;

        let finalNodes = nodes;
        let finalEdges = edges;
        let nodeMap = new Map();

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
              groups: node.groups || [],
              partyNames: node.partyNames || [],
              photoURL: node.photoURL || null,
            };
            nodeMap.set(node.id, nodeData);
            d3Nodes[i] = nodeData;
          }

          // Filter edges for visualization
          // For country networks: show all edges with weight > 0.5
          // For full network: show top 50% by weight for performance
          let filteredEdges;
          if (country) {
            filteredEdges = edgesWithWeights.filter(
              (edge) => edge.weight > 0.5
            );
          } else {
            edgesWithWeights.sort((a, b) => b.weight - a.weight);
            const edgeThreshold = Math.ceil(edgesWithWeights.length * 0.5);
            filteredEdges = edgesWithWeights.slice(0, edgeThreshold);
          }

          finalEdges = filteredEdges.map((edge) => ({
            source: edge.source,
            target: edge.target,
            weight: edge.weight,
          }));

          finalNodes = d3Nodes;
        } else {
          // Use precomputed positions - just filter edges for visualization
          console.log("Using precomputed layout positions");

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
              groups: node.groups || [],
              partyNames: node.partyNames || [],
              photoURL: node.photoURL || null,
            };
            nodeMap.set(node.id, nodeData);
            d3Nodes[i] = nodeData;
          }

          // Filter edges for visualization
          // For country networks: show all edges with weight > 0.5
          // For full network: show top 50% by weight for performance
          const edgesWithWeights = edges.map((edge) => ({
            source: edge.source,
            target: edge.target,
            weight: edge.weight || 0,
          }));

          let filteredEdges;
          if (country) {
            filteredEdges = edgesWithWeights.filter(
              (edge) => edge.weight > 0.5
            );
          } else {
            edgesWithWeights.sort((a, b) => b.weight - a.weight);
            const edgeThreshold = Math.ceil(edgesWithWeights.length * 0.5);
            filteredEdges = edgesWithWeights.slice(0, edgeThreshold);
          }

          finalEdges = filteredEdges.map((edge) => ({
            source: edge.source,
            target: edge.target,
            weight: edge.weight,
          }));

          finalNodes = d3Nodes;
        }

        const newGraphData = {
          nodes: finalNodes,
          links: finalEdges,
          allLinks: edges, // Store all edges for closest MEPs calculation
          nodeMap,
          agreementScores: agreementScores || null,
          metadata: metadata || null,
        };

        // Store previous data before updating
        if (currentGraphDataRef.current) {
          previousGraphDataRef.current = currentGraphDataRef.current;
        }

        currentGraphDataRef.current = newGraphData;

        // Clear cohesion data and its reference BEFORE setting new graphData
        // This prevents showing old cohesion with new graphData
        setIntragroupCohesion(null);
        setIntergroupCohesion(null);
        cohesionGraphDataRef.current = null;

        setGraphData(newGraphData);

        // Clear previous data immediately
        previousGraphDataRef.current = null;

        // Use double requestAnimationFrame to ensure canvas has time to render
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setLoading(false);
          });
        });
      } catch (err) {
        console.error("Error loading graph:", err);
        setError(err.message);
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadAndPrepareGraph(mandate, selectedCountry);
  }, [mandate, selectedCountry, loadAndPrepareGraph]);

  // Calculate closest MEPs and similarity scores when a node is selected
  useEffect(() => {
    if (!selectedNode || !graphData) {
      setClosestMEPs([]);
      setGroupSimilarityScore(null);
      setCountrySimilarityScore(null);
      setAgreementScores(null);
      return;
    }

    // Use all edges (not just filtered ones) for accurate calculations
    const edgesToSearch = graphData.allLinks || graphData.links;

    // Find all edges connected to the selected node
    const connectedEdges = edgesToSearch.filter(
      (link) =>
        link.source === selectedNode.id || link.target === selectedNode.id
    );

    // Calculate agreement scores with each group from edge weights
    // Group edges by the other node's group
    const groupAgreementMap = new Map(); // groupId -> { sum, count }

    connectedEdges.forEach((edge) => {
      const otherNodeId =
        edge.source === selectedNode.id ? edge.target : edge.source;
      const otherNode = graphData.nodeMap.get(otherNodeId);

      if (otherNode && otherNode.groupId) {
        if (!groupAgreementMap.has(otherNode.groupId)) {
          groupAgreementMap.set(otherNode.groupId, { sum: 0, count: 0 });
        }
        const stats = groupAgreementMap.get(otherNode.groupId);
        stats.sum += edge.weight || 0;
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
      .sort((a, b) => b.score - a.score);

    setAgreementScores(agreementArray.length > 0 ? agreementArray : null);

    // Get the selected node's full data
    const selectedNodeData = graphData.nodeMap.get(selectedNode.id);
    if (!selectedNodeData) return;

    const selectedGroup = selectedNodeData.groupId;
    const selectedCountry = selectedNodeData.country;

    // Calculate group similarity score (average weight with MEPs from same group)
    const groupEdges = connectedEdges
      .map((edge) => {
        const otherNodeId =
          edge.source === selectedNode.id ? edge.target : edge.source;
        const otherNode = graphData.nodeMap.get(otherNodeId);
        return otherNode && otherNode.groupId === selectedGroup
          ? { weight: edge.weight || 0 }
          : null;
      })
      .filter((e) => e !== null);

    const groupScore =
      groupEdges.length > 0
        ? groupEdges.reduce((sum, e) => sum + e.weight, 0) / groupEdges.length
        : 0;

    // Calculate country similarity score (average weight with MEPs from same country)
    const countryEdges = connectedEdges
      .map((edge) => {
        const otherNodeId =
          edge.source === selectedNode.id ? edge.target : edge.source;
        const otherNode = graphData.nodeMap.get(otherNodeId);
        return otherNode && otherNode.country === selectedCountry
          ? { weight: edge.weight || 0 }
          : null;
      })
      .filter((e) => e !== null);

    const countryScore =
      countryEdges.length > 0
        ? countryEdges.reduce((sum, e) => sum + e.weight, 0) /
          countryEdges.length
        : 0;

    setGroupSimilarityScore({
      score: groupScore,
      count: groupEdges.length,
    });
    setCountrySimilarityScore({
      score: countryScore,
      count: countryEdges.length,
    });

    // Sort by weight (highest first) and get top 5 for closest MEPs
    const sortedEdges = connectedEdges
      .map((edge) => ({
        edge,
        weight: edge.weight || 0,
        otherNodeId:
          edge.source === selectedNode.id ? edge.target : edge.source,
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);

    // Get the actual node data for the closest MEPs
    const closestNodes = sortedEdges
      .map((item) => {
        const node = graphData.nodeMap.get(item.otherNodeId);
        return node
          ? {
              ...node,
              edgeWeight: item.weight,
            }
          : null;
      })
      .filter((node) => node !== null);

    setClosestMEPs(closestNodes);
  }, [selectedNode, graphData]);

  // Update graphData ref when it changes
  useEffect(() => {
    if (graphData) {
      currentGraphDataRef.current = graphData;
    }
  }, [graphData]);

  // Calculate cohesion scores when graph data is loaded (async to avoid blocking)
  useEffect(() => {
    if (!graphData) {
      // Don't clear immediately - keep old data visible
      return;
    }

    // Create a unique ID for this graphData to track which cohesion belongs to which data
    const graphDataId = `${mandate}-${selectedCountry || "all"}-${
      graphData.nodes.length
    }`;

    // Calculate asynchronously to avoid blocking UI
    const calculateCohesion = () => {
      // Use all edges for accurate calculations
      const edgesToUse = graphData.allLinks || graphData.links;

      // Calculate intergroup cohesion (between different groups)
      const intergroupMap = new Map(); // group1-group2 -> { count, sum }
      // Calculate intragroup cohesion (within same group)
      const intragroupMap = new Map(); // group -> { count, sum }

      edgesToUse.forEach((edge) => {
        const sourceNode = graphData.nodeMap.get(edge.source);
        const targetNode = graphData.nodeMap.get(edge.target);

        if (!sourceNode || !targetNode) return;

        const sourceGroup = sourceNode.groupId || "Unknown";
        const targetGroup = targetNode.groupId || "Unknown";
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
      });

      // Calculate averages for intra-group cohesion
      const intragroupScores = Array.from(intragroupMap.entries())
        .map(([group, stats]) => ({
          group,
          score: stats.count > 0 ? stats.sum / stats.count : 0,
          count: stats.count,
        }))
        .sort((a, b) => b.score - a.score);

      // Get all unique groups
      const allGroups = new Set();
      graphData.nodes.forEach((node) => {
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
      graphData.nodes.forEach((node) => {
        if (node.groupId && !groupColors.has(node.groupId)) {
          groupColors.set(node.groupId, node.color);
        }
      });

      // Only update if this is still the current graphData
      if (currentGraphDataRef.current === graphData) {
        setIntragroupCohesion(intragroupScores);
        setIntergroupCohesion({
          groups: groupsArray,
          matrix: heatmapData,
          groupColors: groupColors,
        });
        // Store in ref with ID and reference to graphData
        cohesionDataRef.current = {
          intergroup: {
            groups: groupsArray,
            matrix: heatmapData,
            groupColors: groupColors,
          },
          intragroup: intragroupScores,
          graphDataId: graphDataId,
        };
        cohesionGraphDataRef.current = graphData; // Track which graphData this cohesion belongs to
      }
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof window !== "undefined" && window.requestIdleCallback) {
      const idleId = window.requestIdleCallback(calculateCohesion, {
        timeout: 1000,
      });
      return () => window.cancelIdleCallback(idleId);
    } else {
      const timeoutId = setTimeout(calculateCohesion, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [graphData, mandate, selectedCountry]);

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node);
  }, []);

  const handleNodeHover = useCallback((node) => {
    setHoveredNode(node);
  }, []);

  const handleHoverPositionChange = useCallback((position) => {
    setTooltipPosition(position);
  }, []);

  return (
    <div className="visualization-page">
      {/* Left side - Network visualization (70%) */}
      <div className="visualization-left">
        <div className="visualization-header">
          <div className="visualization-header-title">
            <h1>European Parliament Network</h1>
            <div className="visualization-logo">
              <svg
                width="32"
                height="32"
                viewBox="0 0 200 200"
                className="network-logo-svg"
              >
                {/* EU stars arranged in a circle (12 stars) */}
                {[...Array(12)].map((_, i) => {
                  const angle = (i * 30 - 90) * (Math.PI / 180);
                  const radius = 70;
                  const cx =
                    Math.round((100 + radius * Math.cos(angle)) * 100) / 100;
                  const cy =
                    Math.round((100 + radius * Math.sin(angle)) * 100) / 100;
                  const nextAngle = ((i + 1) * 30 - 90) * (Math.PI / 180);
                  const nextCx =
                    Math.round((100 + radius * Math.cos(nextAngle)) * 100) /
                    100;
                  const nextCy =
                    Math.round((100 + radius * Math.sin(nextAngle)) * 100) /
                    100;
                  return (
                    <g key={i}>
                      {/* Network edges connecting stars - only circle edges */}
                      {i < 12 && (
                        <line
                          x1={cx}
                          y1={cy}
                          x2={nextCx}
                          y2={nextCy}
                          stroke="#FFD700"
                          strokeWidth="1.5"
                          opacity="0.4"
                        />
                      )}
                      {/* Star node */}
                      <circle cx={cx} cy={cy} r="6" fill="#FFD700" />
                      {/* Star shape */}
                      <path
                        d={`M ${cx} ${cy - 4} L ${cx + 1.2} ${cy - 1.2} L ${
                          cx + 4
                        } ${cy - 1.2} L ${cx + 1.8} ${cy + 1.2} L ${cx + 2.4} ${
                          cy + 4
                        } L ${cx} ${cy + 2.4} L ${cx - 2.4} ${cy + 4} L ${
                          cx - 1.8
                        } ${cy + 1.2} L ${cx - 4} ${cy - 1.2} L ${cx - 1.2} ${
                          cy - 1.2
                        } Z`}
                        fill="#FFD700"
                        opacity="0.9"
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
          <div className="visualization-header-controls">
            <MandateSelector
              currentMandate={mandate}
              onMandateChange={setMandate}
            />
            <CountrySelector
              currentMandate={mandate}
              currentCountry={selectedCountry}
              onCountryChange={setSelectedCountry}
            />
          </div>
        </div>

        {error && <div className="visualization-error">Error: {error}</div>}

        {graphData && (
          <div className="visualization-content">
            <NetworkCanvas
              key={`${mandate}-${selectedCountry || "all"}`}
              graphData={graphData}
              selectedNode={selectedNode}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              onHoverPositionChange={handleHoverPositionChange}
            />
            {loading && <LoadingSpinner />}
          </div>
        )}

        {!graphData && loading && (
          <div className="visualization-content">
            <LoadingSpinner />
          </div>
        )}
      </div>

      {/* Right side - Sidebar (30%) */}
      {(graphData || previousGraphDataRef.current) && (
        <Sidebar
          mandate={mandate}
          selectedNode={selectedNode}
          graphData={graphData || previousGraphDataRef.current}
          groupSimilarityScore={groupSimilarityScore}
          countrySimilarityScore={countrySimilarityScore}
          agreementScores={agreementScores}
          closestMEPs={closestMEPs}
          // Only show cohesion if it belongs to the current graphData
          // This prevents showing old cohesion data with new graphData
          intergroupCohesion={
            graphData && cohesionGraphDataRef.current === graphData
              ? intergroupCohesion
              : null
          }
          intragroupCohesion={
            graphData && cohesionGraphDataRef.current === graphData
              ? intragroupCohesion
              : null
          }
          onSelectNode={handleNodeClick}
          loading={loading}
        />
      )}

      {/* Hover tooltip */}
      <HoverTooltip
        node={hoveredNode}
        position={tooltipPosition}
        mandate={mandate}
      />
    </div>
  );
}
