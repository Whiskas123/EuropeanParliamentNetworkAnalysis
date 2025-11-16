"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { loadMandateData } from "../../lib/dataLoader.js";
import MandateSelector from "../../components/MandateSelector";
import CountrySelector from "../../components/CountrySelector";
import SubjectSelector from "../../components/SubjectSelector";
import MobileMenu from "../../components/MobileMenu";
import NetworkCanvas from "../../components/NetworkCanvas";
import Sidebar from "../../components/Sidebar";
import HoverTooltip from "../../components/HoverTooltip";
import LoadingSpinner from "../../components/LoadingSpinner";

export default function VisualizationPage() {
  const [mandate, setMandate] = useState(10);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [closestMEPs, setClosestMEPs] = useState([]);
  const [intergroupCohesion, setIntergroupCohesion] = useState(null);
  const [intragroupCohesion, setIntragroupCohesion] = useState(null);
  const [countrySimilarity, setCountrySimilarity] = useState(null);
  const [groupSimilarityScore, setGroupSimilarityScore] = useState(null);
  const [countrySimilarityScore, setCountrySimilarityScore] = useState(null);
  const [agreementScores, setAgreementScores] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const previousGraphDataRef = useRef(null);
  const currentGraphDataRef = useRef(null);

  // Cache the imported modules
  const modulesRef = useRef(null);

  const loadAndPrepareGraph = useCallback(
    async (mandateNum, country = null, subject = null) => {
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

        // Clear selections when loading new data
        setSelectedNode(null);
        setSelectedGroup(null);

        // Load data (may be precomputed with positions already)
        const {
          nodes,
          edges,
          agreementScores,
          similarityScores,
          cohesionData: precomputedCohesionData,
          subjects: precomputedSubjects,
          votingSessions: precomputedVotingSessions,
          metadata,
        } = await loadMandateData(mandateNum, country, subject);

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

        // Use precomputed subjects list (already filtered to >5 voting sessions)
        // If not available, extract from similarity scores as fallback
        let subjectsList = [];
        if (precomputedSubjects && precomputedSubjects.length > 0) {
          // Use precomputed subjects list (array of {name, votingSessions})
          subjectsList = precomputedSubjects.map((s) =>
            typeof s === "string" ? s : s.name
          );
        } else if (similarityScores) {
          // Fallback: get subjects from similarity scores
          const firstMepId = Object.keys(similarityScores)[0];
          if (firstMepId && similarityScores[firstMepId]) {
            const mepScores = similarityScores[firstMepId];
            if (mepScores.subjectAgreementScores) {
              subjectsList = Object.keys(
                mepScores.subjectAgreementScores
              ).sort();
            } else if (mepScores.groupSubjectScores) {
              subjectsList = mepScores.groupSubjectScores
                .map((item) => item.subject)
                .sort();
            }
          }
        }

        const newGraphData = {
          nodes: finalNodes,
          links: finalEdges,
          nodeMap,
          agreementScores: agreementScores || null,
          similarityScores: similarityScores || null,
          subjects: subjectsList, // Store subjects for fast access (filtered to >5 voting sessions)
          votingSessions: precomputedVotingSessions || null, // Voting sessions data (total and bySubject)
          metadata: metadata || null,
        };

        // Store previous data before updating
        if (currentGraphDataRef.current) {
          previousGraphDataRef.current = currentGraphDataRef.current;
        }

        currentGraphDataRef.current = newGraphData;

        // Set cohesion data from precomputed data (if available)
        if (precomputedCohesionData) {
          setIntergroupCohesion(precomputedCohesionData.intergroupCohesion);
          setIntragroupCohesion(precomputedCohesionData.intragroupCohesion);
          setCountrySimilarity(precomputedCohesionData.countrySimilarity);
        } else {
          // Clear cohesion data if not available
          setIntragroupCohesion(null);
          setIntergroupCohesion(null);
          setCountrySimilarity(null);
        }

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
    loadAndPrepareGraph(mandate, selectedCountry, selectedSubject);
  }, [mandate, selectedCountry, selectedSubject, loadAndPrepareGraph]);

  // Calculate closest MEPs and similarity scores when a node is selected
  useEffect(() => {
    if (!selectedNode || !graphData) {
      setClosestMEPs([]);
      setGroupSimilarityScore(null);
      setCountrySimilarityScore(null);
      setAgreementScores(null);
      return;
    }

    const mepId = selectedNode.id;
    const selectedNodeData = graphData.nodeMap.get(mepId);
    if (!selectedNodeData) return;

    // Use precomputed agreement scores if available (much faster!)
    if (graphData.agreementScores && graphData.agreementScores[mepId]) {
      const precomputedAgreement = graphData.agreementScores[mepId];
      const agreementArray = Object.entries(precomputedAgreement)
        .map(([groupId, data]) => ({
          groupId,
          score: data.score || 0,
          count: data.count || 0,
        }))
        .filter((item) => item.count > 0)
        .sort((a, b) => b.score - a.score);
      setAgreementScores(agreementArray.length > 0 ? agreementArray : null);
    } else {
      // Fallback: calculate agreement scores from edges (slower)
      const edgesToSearch = graphData.links;
      const connectedEdges = edgesToSearch.filter(
        (link) => link.source === mepId || link.target === mepId
      );

      const groupAgreementMap = new Map();
      connectedEdges.forEach((edge) => {
        const otherNodeId = edge.source === mepId ? edge.target : edge.source;
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

      const agreementArray = Array.from(groupAgreementMap.entries())
        .map(([groupId, stats]) => ({
          groupId,
          score: stats.count > 0 ? stats.sum / stats.count : 0,
          count: stats.count,
        }))
        .sort((a, b) => b.score - a.score);

      setAgreementScores(agreementArray.length > 0 ? agreementArray : null);
    }

    // Get connected edges once (used for closest MEPs and country similarity)
    const edgesToSearch = graphData.links;
    const connectedEdges = edgesToSearch.filter(
      (link) => link.source === mepId || link.target === mepId
    );

    // Use precomputed similarity scores if available (much faster!)
    if (graphData.similarityScores && graphData.similarityScores[mepId]) {
      const similarityData = graphData.similarityScores[mepId];
      const selectedGroup = selectedNodeData.groupId;
      const selectedCountry = selectedNodeData.country;

      // Use agreementScores for group similarity to match the bar chart calculation
      // This ensures consistency and correct count (unique MEPs, not sum across subjects)
      if (graphData.agreementScores && graphData.agreementScores[mepId]) {
        const precomputedAgreement = graphData.agreementScores[mepId];
        if (precomputedAgreement[selectedGroup]) {
          const groupData = precomputedAgreement[selectedGroup];
          setGroupSimilarityScore({
            score: groupData.score || 0,
            count: groupData.count || 0,
          });
        } else {
          setGroupSimilarityScore(null);
        }
      } else {
        // Fallback: calculate from edges if agreementScores not available
        const groupEdges = connectedEdges
          .map((edge) => {
            const otherNodeId =
              edge.source === mepId ? edge.target : edge.source;
            const otherNode = graphData.nodeMap.get(otherNodeId);
            return otherNode && otherNode.groupId === selectedGroup
              ? { weight: edge.weight || 0 }
              : null;
          })
          .filter((e) => e !== null);

        const groupScore =
          groupEdges.length > 0
            ? groupEdges.reduce((sum, e) => sum + e.weight, 0) /
              groupEdges.length
            : 0;

        setGroupSimilarityScore({
          score: groupScore,
          count: groupEdges.length,
        });
      }

      // For country similarity, calculate from edges (not in precomputed)
      const countryEdges = connectedEdges
        .map((edge) => {
          const otherNodeId = edge.source === mepId ? edge.target : edge.source;
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

      setCountrySimilarityScore({
        score: countryScore,
        count: countryEdges.length,
      });
    } else {
      // Fallback: calculate from edges (slower)
      const selectedGroup = selectedNodeData.groupId;
      const selectedCountry = selectedNodeData.country;

      const groupEdges = connectedEdges
        .map((edge) => {
          const otherNodeId = edge.source === mepId ? edge.target : edge.source;
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

      const countryEdges = connectedEdges
        .map((edge) => {
          const otherNodeId = edge.source === mepId ? edge.target : edge.source;
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
    }

    // Calculate closest MEPs (using already computed connectedEdges)

    // First, filter to only edges where the node exists in nodeMap, then sort and get top 5
    const validEdges = connectedEdges
      .map((edge) => {
        const otherNodeId = edge.source === mepId ? edge.target : edge.source;
        const node = graphData.nodeMap.get(otherNodeId);
        return node
          ? {
              weight: edge.weight || 0,
              otherNodeId,
              node,
            }
          : null;
      })
      .filter((item) => item !== null)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);

    // Get the actual node data for the closest MEPs
    const closestNodes = validEdges.map((item) => ({
      ...item.node,
      edgeWeight: item.weight,
    }));

    setClosestMEPs(closestNodes);
  }, [selectedNode, graphData]);

  // Update graphData ref when it changes
  useEffect(() => {
    if (graphData) {
      currentGraphDataRef.current = graphData;
    }
  }, [graphData]);

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node);
    setSelectedGroup(null); // Clear group selection when selecting a node
  }, []);

  const handleNodeClickFromGroup = useCallback((node) => {
    // When clicking a MEP from group view, keep the group context
    setSelectedNode(node);
    // Don't clear selectedGroup - allows user to navigate back
  }, []);

  const handleClearNodeKeepGroup = useCallback(() => {
    // Clear node selection but keep group selection
    setSelectedNode(null);
    // Don't clear selectedGroup
  }, []);

  const handleGroupClick = useCallback((groupId) => {
    setSelectedGroup(groupId);
    setSelectedNode(null); // Clear node selection when selecting a group
  }, []);

  const handleCountryClick = useCallback((country) => {
    setSelectedCountry(country);
    setSelectedNode(null); // Clear node selection when selecting a country
    setSelectedGroup(null); // Clear group selection when selecting a country
  }, []);

  const handleNodeHover = useCallback((node) => {
    setHoveredNode(node);
  }, []);

  const handleHoverPositionChange = useCallback((position) => {
    setTooltipPosition(position);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Escape key: Clear selection
      if (event.key === "Escape") {
        if (selectedNode) {
          setSelectedNode(null);
        } else if (selectedGroup) {
          setSelectedGroup(null);
        }
      }
      // Forward slash: Focus search
      if (event.key === "/" && !event.ctrlKey && !event.metaKey) {
        const searchInput = document.querySelector(".search-bar-input");
        if (searchInput && document.activeElement !== searchInput) {
          event.preventDefault();
          searchInput.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNode, selectedGroup]);

  return (
    <div className="visualization-page">
      {/* Left side - Network visualization (70%) */}
      <div className="visualization-left">
        <div className="visualization-header">
          <div className="visualization-header-title">
            <h1>
              <span className="title-line">European Parliament</span>
              <span className="title-line title-line-with-logo">
                Network
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
                        Math.round((100 + radius * Math.cos(angle)) * 100) /
                        100;
                      const cy =
                        Math.round((100 + radius * Math.sin(angle)) * 100) /
                        100;
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
                            } ${cy - 1.2} L ${cx + 1.8} ${cy + 1.2} L ${
                              cx + 2.4
                            } ${cy + 4} L ${cx} ${cy + 2.4} L ${cx - 2.4} ${
                              cy + 4
                            } L ${cx - 1.8} ${cy + 1.2} L ${cx - 4} ${
                              cy - 1.2
                            } L ${cx - 1.2} ${cy - 1.2} Z`}
                            fill="#FFD700"
                            opacity="0.9"
                          />
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </span>
            </h1>
          </div>
          <div className="visualization-header-controls">
            {/* Desktop: Show selectors directly */}
            <div className="visualization-header-controls-desktop">
              <MandateSelector
                currentMandate={mandate}
                onMandateChange={setMandate}
              />
              <CountrySelector
                currentMandate={mandate}
                currentCountry={selectedCountry}
                onCountryChange={(country) => {
                  setSelectedCountry(country);
                  // If selecting a country, clear subject selection
                  if (country && selectedSubject) {
                    setSelectedSubject(null);
                  }
                }}
                disabled={!!selectedSubject} // Disable when subject is selected
              />
              <SubjectSelector
                currentMandate={mandate}
                currentSubject={selectedSubject}
                onSubjectChange={(subject) => {
                  setSelectedSubject(subject);
                  // If selecting a subject, clear country selection
                  if (subject && selectedCountry) {
                    setSelectedCountry(null);
                  }
                }}
                disabled={!!selectedCountry} // Disable when country is selected
              />
            </div>
            {/* Mobile: Show hamburger menu */}
            <div className="visualization-header-controls-mobile">
              <MobileMenu
                mandate={mandate}
                onMandateChange={setMandate}
                selectedCountry={selectedCountry}
                onCountryChange={(country) => {
                  setSelectedCountry(country);
                  // If selecting a country, clear subject selection
                  if (country && selectedSubject) {
                    setSelectedSubject(null);
                  }
                }}
                selectedSubject={selectedSubject}
                onSubjectChange={(subject) => {
                  setSelectedSubject(subject);
                  // If selecting a subject, clear country selection
                  if (subject && selectedCountry) {
                    setSelectedCountry(null);
                  }
                }}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="visualization-error">
            <div className="visualization-error-icon">⚠️</div>
            <div className="visualization-error-content">
              <h3>Error loading data</h3>
              <p>{error}</p>
              <button
                className="visualization-error-retry"
                onClick={() =>
                  loadAndPrepareGraph(mandate, selectedCountry, selectedSubject)
                }
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {graphData && (
          <div className="visualization-content">
            <NetworkCanvas
              key={`${mandate}-${selectedCountry || "all"}-${
                selectedSubject || "all"
              }`}
              graphData={graphData}
              selectedNode={selectedNode}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              onHoverPositionChange={handleHoverPositionChange}
            />
            {loading && <LoadingSpinner message="Loading network data..." />}
          </div>
        )}

        {!graphData && loading && (
          <div className="visualization-content">
            <LoadingSpinner message="Preparing visualization..." />
          </div>
        )}
      </div>

      {/* Right side - Sidebar (30%) */}
      {(graphData || previousGraphDataRef.current || loading) && (
        <Sidebar
          mandate={mandate}
          selectedNode={selectedNode}
          selectedGroup={selectedGroup}
          graphData={graphData || previousGraphDataRef.current}
          groupSimilarityScore={groupSimilarityScore}
          countrySimilarityScore={countrySimilarityScore}
          agreementScores={agreementScores}
          closestMEPs={closestMEPs}
          selectedSubject={selectedSubject}
          intergroupCohesion={intergroupCohesion}
          intragroupCohesion={intragroupCohesion}
          countrySimilarity={countrySimilarity}
          onSelectNode={handleNodeClick}
          onSelectNodeFromGroup={handleNodeClickFromGroup}
          onClearNodeKeepGroup={handleClearNodeKeepGroup}
          onSelectGroup={handleGroupClick}
          onCountryClick={handleCountryClick}
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
