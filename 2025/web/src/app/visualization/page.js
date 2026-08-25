"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { loadMandateData, getBaseline } from "../../lib/dataLoader.js";
import { DEFAULT_VIEW, decodeView, encodeView } from "../../lib/viewState.js";
import MandateSelector from "../../components/MandateSelector";
import CountrySelector from "../../components/CountrySelector";
import SubjectSelector from "../../components/SubjectSelector";
import MobileMenu from "../../components/MobileMenu";
import NetworkCanvas from "../../components/NetworkCanvas";
import Sidebar from "../../components/Sidebar";
import HoverTooltip from "../../components/HoverTooltip";
import LoadingSpinner from "../../components/LoadingSpinner";

/**
 * An MEP's average agreement with their compatriots.
 *
 * Read from the published figures rather than computed from the edges held in
 * memory. Those are filtered for legibility, and an average over them is wrong
 * by 17 percentage points on average — 56 at worst — because it keeps an MEP's
 * agreements and discards their disagreements.
 *
 * Falls back to the in-memory edges only when the published file is missing,
 * which is a degraded but non-empty result.
 */
function readCountrySimilarity(graphData, mepId, selectedNodeData) {
  const published = graphData.countrySimilarityByMep;
  const entry = published && published[mepId];
  if (entry) {
    return { score: entry[0], count: entry[1] };
  }

  const links = graphData.allLinks || graphData.links || [];
  const country = selectedNodeData?.country;
  const weights = links
    .filter((link) => link.source === mepId || link.target === mepId)
    .map((link) => {
      const otherId = link.source === mepId ? link.target : link.source;
      const other = graphData.nodeMap.get(otherId);
      return other && other.country === country ? link.weight || 0 : null;
    })
    .filter((weight) => weight !== null);

  return {
    score: weights.length
      ? weights.reduce((sum, weight) => sum + weight, 0) / weights.length
      : 0,
    count: weights.length,
  };
}

export default function VisualizationPage() {
  const router = useRouter();
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
  const [baseline, setBaseline] = useState(null);

  // How the network is drawn. Separate from which network is loaded: changing
  // any of these repaints without refetching. Threaded to both the canvas and
  // the export so a print matches the screen.
  const [renderSettings, setRenderSettings] = useState({
    edgePercentile: DEFAULT_VIEW.edgePercentile,
    edgeWidth: DEFAULT_VIEW.edgeWidth,
    colorMode: DEFAULT_VIEW.colorMode,
    dim: DEFAULT_VIEW.dim,
  });

  // Guards the first render: the URL is the source of truth on load, and
  // writing back before reading would erase whatever was shared.
  const urlReadRef = useRef(false);
  const pendingMepRef = useRef(null);
  const pendingGroupRef = useRef(null);
  const previousGraphDataRef = useRef(null);
  const currentGraphDataRef = useRef(null);

  // Cache the imported modules
  const modulesRef = useRef(null);

  // Guards against a slow response for a view you have already navigated away
  // from. Loads are not cancellable, and they finish out of order: the full
  // network is 16 MB while a country x subject file is a few hundred KB, so a
  // request started earlier routinely lands later and would overwrite the view
  // you actually asked for.
  const requestSeqRef = useRef(0);
  const firstLoadRef = useRef(true);

  const loadAndPrepareGraph = useCallback(
    async (mandateNum, country = null, subject = null) => {
      // On the very first run the URL is the authority, but the effect that
      // mirrors it into state has not re-rendered yet — so this call still
      // carries the defaults. Loading them would fetch a network nobody asked
      // for and then race the real one.
      if (firstLoadRef.current) {
        firstLoadRef.current = false;
        if (typeof window !== "undefined") {
          const wanted = decodeView(window.location.search.replace(/^\?/, ""));
          if (
            wanted.mandate !== mandateNum ||
            wanted.country !== country ||
            wanted.subject !== subject
          ) {
            return;
          }
        }
      }

      const seq = requestSeqRef.current + 1;
      requestSeqRef.current = seq;
      const isStale = () => requestSeqRef.current !== seq;

      setLoading(true);
      setError(null);
      setSelectedNode(null);

      // The reference figures every statistic is compared against. Resolved
      // before the network so the sidebar never renders a score for one view
      // beside a delta computed for the previous one.
      const nextBaseline = await getBaseline(mandateNum, country, subject);
      if (isStale()) return;
      setBaseline(nextBaseline);

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
          countrySimilarityByMep,
          subjects: precomputedSubjects,
          votingSessions: precomputedVotingSessions,
          metadata,
        } = await loadMandateData(mandateNum, country, subject);

        // A newer view was requested while this one was in flight. Dropping the
        // result here is what stops a slow full-network response from replacing
        // the filtered view the user actually asked for.
        if (isStale()) return;

        // Check if nodes already have positions (precomputed)
        const hasPrecomputedPositions =
          nodes.length > 0 &&
          nodes[0].x !== undefined &&
          nodes[0].y !== undefined;

        let finalNodes = nodes;
        let finalEdges = edges;
        let allEdgesForStats = [];
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

          // The filtering above is purely for drawing — a dense network is
          // unreadable and slow. Statistics must never use it: averaging only
          // over the links that survived a weight cut counts an MEP's
          // agreements and discards their disagreements, which inflates every
          // score and silently changes the denominator per MEP.
          //
          // This branch runs only when a view has no precomputed layout, so
          // here the edges really are every pair, straight from data.json. The
          // precomputed branch below is the normal path and its array is not.
          allEdgesForStats = edgesWithWeights;

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

          // Every edge this view was given, before the display cut above.
          //
          // NOT the complete set of pairs. On the precomputed path — which is
          // now the normal one — the file itself ships only weights above 0.6,
          // 135,776 of 241,860 for term 10. So an average over this array is an
          // average over the high tail: it keeps an MEP's agreements and drops
          // their disagreements, the very error the note above warns about.
          //
          // Anything numeric must come from `agreementScores`, `cohesionData`
          // or `countrySimilarityByMep`, all computed over every pair at
          // precompute time. This array is for drawing, for edge selection, and
          // for the degraded fallbacks that run when those fields are missing.
          allEdgesForStats = edgesWithWeights;

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
          // Every edge this view was given, before the display cut — which is
          // not the same as every pair. See the note where this is built.
          allLinks: allEdgesForStats.length ? allEdgesForStats : finalEdges,
          nodeMap,
          agreementScores: agreementScores || null,
          similarityScores: similarityScores || null,
          // Published per-MEP compatriot agreement. Not derivable from the
          // edges above: those are filtered for the drawing.
          countrySimilarityByMep: countrySimilarityByMep || null,
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

        if (isStale()) return;
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
        if (isStale()) return;
        console.error("Error loading graph:", err);
        setError(err.message);
        setLoading(false);
      }
    },
    []
  );

  // The URL is the source of truth on first paint, so a shared link, a
  // bookmark or a QR code on a printed panel opens the exact view it names.
  useEffect(() => {
    if (urlReadRef.current) return;
    urlReadRef.current = true;
    if (typeof window === "undefined") return;

    const view = decodeView(window.location.search.replace(/^\?/, ""));
    setMandate(view.mandate);
    setSelectedCountry(view.country);
    setSelectedSubject(view.subject);
    setRenderSettings({
      edgePercentile: view.edgePercentile,
      edgeWidth: view.edgeWidth,
      colorMode: view.colorMode,
      dim: view.dim,
    });
    // Both of these are applied once the network is loaded, below. Setting the
    // group here instead looks like it works and does not: loadAndPrepareGraph
    // clears both selections partway through every load, including the first
    // one, so a group set at this point is wiped a few hundred milliseconds
    // later and `?g=` silently opens the plain network view.
    if (view.group) pendingGroupRef.current = view.group;
    if (view.mep) pendingMepRef.current = view.mep;
  }, []);

  // Write the view back, replacing rather than pushing: dragging a slider
  // should not bury the back button under a hundred history entries.
  useEffect(() => {
    if (!urlReadRef.current || typeof window === "undefined") return;
    const query = encodeView({
      mandate,
      country: selectedCountry,
      subject: selectedSubject,
      ...renderSettings,
      mep: selectedNode?.id || null,
      group: selectedGroup || null,
    });
    const next = query
      ? `${window.location.pathname}?${query}`
      : window.location.pathname;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [
    mandate,
    selectedCountry,
    selectedSubject,
    renderSettings,
    selectedNode,
    selectedGroup,
  ]);

  useEffect(() => {
    loadAndPrepareGraph(mandate, selectedCountry, selectedSubject);
  }, [mandate, selectedCountry, selectedSubject, loadAndPrepareGraph]);

  // An MEP named in the URL can only be selected once its node exists.
  useEffect(() => {
    if (!graphData || !pendingMepRef.current) return;
    const node = graphData.nodeMap.get(pendingMepRef.current);
    pendingMepRef.current = null;
    if (node) setSelectedNode(node);
  }, [graphData]);

  // Same for a group named in the URL, and for the same reason: the load
  // clears selections, so this has to land after it rather than before.
  //
  // Dropped when no MEP in the open network belongs to it. A country x policy
  // area view holds a fraction of Parliament and may well contain none of a
  // given group, and selecting one that is not there opens a panel with
  // nothing in it and no way back to the network.
  useEffect(() => {
    if (!graphData || !pendingGroupRef.current) return;
    const groupId = pendingGroupRef.current;
    pendingGroupRef.current = null;
    if (graphData.nodes.some((node) => node.groupId === groupId)) {
      setSelectedGroup(groupId);
    }
  }, [graphData]);

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
      const edgesToSearch = graphData.allLinks || graphData.links;
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
    const edgesToSearch = graphData.allLinks || graphData.links;
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

      // Country similarity comes from the published figures, not from the
      // edges in memory: those are filtered to weight > 0.6 for the drawing,
      // and averaging over them counts an MEP's agreements while dropping
      // their disagreements. See loadCountrySimilarity in dataLoader.js.
      setCountrySimilarityScore(
        readCountrySimilarity(graphData, mepId, selectedNodeData)
      );
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

      setGroupSimilarityScore({
        score: groupScore,
        count: groupEdges.length,
      });
      setCountrySimilarityScore(
        readCountrySimilarity(graphData, mepId, selectedNodeData)
      );
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
                Voting Network
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
                onCountryChange={setSelectedCountry}
              />
              <SubjectSelector
                currentMandate={mandate}
                currentSubject={selectedSubject}
                onSubjectChange={setSelectedSubject}
              />
            </div>
            {/* Mobile: Show hamburger menu */}
            <div className="visualization-header-controls-mobile">
              <MobileMenu
                mandate={mandate}
                onMandateChange={setMandate}
                selectedCountry={selectedCountry}
                onCountryChange={setSelectedCountry}
                selectedSubject={selectedSubject}
                onSubjectChange={setSelectedSubject}
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
              mandate={mandate}
              selectedCountry={selectedCountry}
              selectedSubject={selectedSubject}
              renderSettings={renderSettings}
              onRenderSettingsChange={setRenderSettings}
              baseline={baseline}
              intergroupCohesion={intergroupCohesion}
              intragroupCohesion={intragroupCohesion}
              countrySimilarity={countrySimilarity}
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
          selectedCountry={selectedCountry}
          selectedNode={selectedNode}
          selectedGroup={selectedGroup}
          graphData={graphData || previousGraphDataRef.current}
          groupSimilarityScore={groupSimilarityScore}
          countrySimilarityScore={countrySimilarityScore}
          agreementScores={agreementScores}
          closestMEPs={closestMEPs}
          selectedSubject={selectedSubject}
          baseline={baseline}
          intergroupCohesion={intergroupCohesion}
          intragroupCohesion={intragroupCohesion}
          countrySimilarity={countrySimilarity}
          onSelectNode={handleNodeClick}
          onSelectNodeFromGroup={handleNodeClickFromGroup}
          onClearNodeKeepGroup={handleClearNodeKeepGroup}
          onSelectGroup={handleGroupClick}
          onCountryClick={handleCountryClick}
          onMandateChange={setMandate}
          onSelectSubject={setSelectedSubject}
          renderSettings={renderSettings}
          onRenderSettingsChange={setRenderSettings}
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
