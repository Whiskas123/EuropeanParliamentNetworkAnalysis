"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export default function NetworkCanvas({
  graphData,
  selectedNode,
  onNodeClick,
  onNodeHover,
  onHoverPositionChange,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const zoomRef = useRef(null);
  const graphDataRef = useRef(null);
  const handlersRef = useRef({
    mouseMove: null,
    mouseLeave: null,
    click: null,
  });
  const initialScaleRef = useRef(1);
  const initialTransformRef = useRef({ x: 0, y: 0, k: 1 });
  const [canvasReady, setCanvasReady] = useState(false);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isAtMinZoom, setIsAtMinZoom] = useState(false);

  // Render canvas - render immediately when data is available
  useEffect(() => {
    if (!graphData || !canvasRef.current) return;

    // If canvas isn't ready yet, try to set it up
    if (!canvasReady && containerRef.current) {
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      const canvas = canvasRef.current;
      if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = width;
        canvas.height = height;
      }
      // Defer state update to avoid cascading renders
      setTimeout(() => setCanvasReady(true), 0);
    }

    if (!canvasReady) return;

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
    // Sort links by weight (ascending) so high-weight edges (often intra-group, colored) render on top
    const sortedLinks = [...graphData.links].sort((a, b) => {
      const weightA = a.weight || 0;
      const weightB = b.weight || 0;
      return weightA - weightB;
    });

    // Default color for inter-group edges
    const defaultEdgeColor = "#999999";
    ctx.strokeStyle = defaultEdgeColor;
    ctx.lineWidth = 0.2;
    ctx.globalAlpha = 0.3;
    sortedLinks.forEach((link) => {
      const sourceNode = graphData.nodeMap.get(link.source);
      const targetNode = graphData.nodeMap.get(link.target);
      if (sourceNode && targetNode) {
        // Use group color if both nodes belong to the same group
        if (
          sourceNode.groupId &&
          targetNode.groupId &&
          sourceNode.groupId === targetNode.groupId
        ) {
          ctx.strokeStyle = sourceNode.color || defaultEdgeColor;
        } else {
          ctx.strokeStyle = defaultEdgeColor;
        }
        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.stroke();
      }
    });

    // Calculate node size based on network size
    const nodeCount = graphData.nodes.length;
    const baseNodeSize = 15;
    const minNodeSize = 3;
    const maxNodeSize = 15;
    const nodeSize = Math.max(
      minNodeSize,
      Math.min(maxNodeSize, baseNodeSize * Math.pow(nodeCount / 700, 0.4))
    );
    const selectedNodeSize = nodeSize * 1.2;
    const haloSize1 = selectedNodeSize * 1.9;
    const haloSize2 = selectedNodeSize * 1.6;
    const haloSize3 = selectedNodeSize * 1.4;
    const borderSize = selectedNodeSize * 1.1;

    // Draw nodes
    ctx.globalAlpha = 1;
    graphData.nodes.forEach((node) => {
      // Highlight selected node with prominent styling
      if (selectedNode && node.id === selectedNode.id) {
        // Outer glow/halo - multiple layers for more prominent effect
        ctx.fillStyle = "rgba(255, 215, 0, 0.2)";
        ctx.beginPath();
        ctx.arc(node.x, node.y, haloSize1, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = "rgba(255, 215, 0, 0.3)";
        ctx.beginPath();
        ctx.arc(node.x, node.y, haloSize2, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = "rgba(255, 215, 0, 0.4)";
        ctx.beginPath();
        ctx.arc(node.x, node.y, haloSize3, 0, 2 * Math.PI);
        ctx.fill();

        // Border ring
        ctx.strokeStyle = "#FFD700";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(node.x, node.y, borderSize, 0, 2 * Math.PI);
        ctx.stroke();

        // Selected node fill - keep original color
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, selectedNodeSize, 0, 2 * Math.PI);
        ctx.fill();
      } else {
        // Regular node
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
        ctx.fill();

        // Add subtle border for better visibility
        ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
        ctx.stroke();
      }
    });

    ctx.restore();
  }, [graphData, selectedNode, canvasReady, transform]);

  // Setup canvas (only once)
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    // Only create canvas if it doesn't exist
    if (
      canvasRef.current &&
      canvasRef.current.parentNode === containerRef.current
    ) {
      if (!canvasReady) {
        // Defer state update to avoid cascading renders
        setTimeout(() => setCanvasReady(true), 0);
      }
      return;
    }

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Set up canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.cursor = "grab";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.zIndex = "1";

    // Remove existing canvas if present, but preserve zoom controls
    const existingCanvas = containerRef.current.querySelector("canvas");
    if (existingCanvas) {
      existingCanvas.remove();
    }

    // Append canvas (zoom controls should already be in the container from JSX)
    containerRef.current.appendChild(canvas);
    canvasRef.current = canvas;
    // Defer state update to avoid cascading renders
    setTimeout(() => setCanvasReady(true), 0);
  }, [canvasReady]); // Re-check if canvasReady changes

  // Update graphData ref when it changes
  useEffect(() => {
    graphDataRef.current = graphData;
  }, [graphData]);

  // Setup interactions (only once)
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) {
      return;
    }

    const d3 = require("d3");
    const canvas = canvasRef.current;

    // Set up zoom behavior (only once)
    if (!zoomRef.current) {
      const zoomSelection = d3.select(canvas);
      const zoom = d3
        .zoom()
        .scaleExtent([initialScaleRef.current, 10]) // Use initial scale as minimum
        .filter((event) => {
          // Disable double-click zoom
          return event.type !== "dblclick";
        })
        .on("zoom", (event) => {
          const t = event.transform;
          // Enforce minimum scale (don't allow zooming out more than initial view)
          const minScale = initialScaleRef.current;
          if (t.k < minScale) {
            // Constrain the transform to minimum scale
            const constrainedTransform = d3.zoomIdentity
              .translate(t.x, t.y)
              .scale(minScale);
            zoomSelection.call(zoom.transform, constrainedTransform);
            setIsAtMinZoom(true);
            return;
          }
          transformRef.current = { x: t.x, y: t.y, k: t.k };
          setTransform({ x: t.x, y: t.y, k: t.k });
          // Check if at minimum zoom (with small tolerance for floating point)
          setIsAtMinZoom(Math.abs(t.k - minScale) < 0.001);
        });

      zoomRef.current = zoom;
      zoomSelection.call(zoom);
    }

    // Create handlers that use graphDataRef to access current data
    const handleMouseMove = (event) => {
      const graphData = graphDataRef.current;
      if (!graphData) return;

      const rect = canvas.getBoundingClientRect();
      const currentTransform = transformRef.current;
      const x =
        (event.clientX - rect.left - currentTransform.x) / currentTransform.k;
      const y =
        (event.clientY - rect.top - currentTransform.y) / currentTransform.k;

      const nodeCount = graphData.nodes.length;
      const baseNodeSize = 15;
      const minNodeSize = 3;
      const maxNodeSize = 15;
      const nodeSize = Math.max(
        minNodeSize,
        Math.min(maxNodeSize, baseNodeSize * Math.pow(nodeCount / 700, 0.4))
      );

      // Find hovered node
      // Use a minimum hover radius in screen space (8 pixels) for better UX when zoomed
      const minHoverRadius = 8 / currentTransform.k; // Convert to data space
      const hoverRadius = Math.max(nodeSize, minHoverRadius);
      const hovered = graphData.nodes.find((node) => {
        const dx = node.x - x;
        const dy = node.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < hoverRadius;
      });

      if (hovered) {
        onNodeHover(hovered);
        onHoverPositionChange({ x: event.clientX, y: event.clientY });
        canvas.style.cursor = "pointer";
      } else {
        onNodeHover(null);
        canvas.style.cursor = "grab";
      }
    };

    const handleMouseLeave = () => {
      onNodeHover(null);
      canvas.style.cursor = "grab";
    };

    const handleClick = (event) => {
      const graphData = graphDataRef.current;
      if (!graphData) return;

      const rect = canvas.getBoundingClientRect();
      const currentTransform = transformRef.current;
      const x =
        (event.clientX - rect.left - currentTransform.x) / currentTransform.k;
      const y =
        (event.clientY - rect.top - currentTransform.y) / currentTransform.k;

      const nodeCount = graphData.nodes.length;
      const baseNodeSize = 15;
      const minNodeSize = 3;
      const maxNodeSize = 15;
      const nodeSize = Math.max(
        minNodeSize,
        Math.min(maxNodeSize, baseNodeSize * Math.pow(nodeCount / 700, 0.4))
      );

      // Find clicked node
      // Use a minimum clickable radius in screen space (8 pixels) for better UX when zoomed
      const minClickableRadius = 8 / currentTransform.k; // Convert to data space
      const clickableRadius = Math.max(nodeSize, minClickableRadius);
      const clickedNode = graphData.nodes.find((node) => {
        const dx = node.x - x;
        const dy = node.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < clickableRadius;
      });

      if (clickedNode) {
        onNodeClick({
          id: clickedNode.id,
          label: clickedNode.label,
          country: clickedNode.country,
          groupId: clickedNode.groupId,
        });
      } else {
        onNodeClick(null);
      }
    };

    // Store handlers in ref
    handlersRef.current = {
      mouseMove: handleMouseMove,
      mouseLeave: handleMouseLeave,
      click: handleClick,
    };

    // Add event listeners (only once)
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("click", handleClick);

    // Cleanup
    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("click", handleClick);
    };
  }, [onNodeClick, onNodeHover, onHoverPositionChange]); // Only set up once

  // Update transform when graphData changes
  useEffect(() => {
    if (
      !containerRef.current ||
      !graphData ||
      !canvasRef.current ||
      !zoomRef.current
    ) {
      return;
    }

    const d3 = require("d3");
    const canvas = canvasRef.current;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Calculate initial transform to fit all nodes with margins
    const xExtent = d3.extent(graphData.nodes, (d) => d.x);
    const yExtent = d3.extent(graphData.nodes, (d) => d.y);
    
    // Handle edge case: if all nodes are at the same position
    const fullWidth = Math.max(xExtent[1] - xExtent[0], 1);
    const fullHeight = Math.max(yExtent[1] - yExtent[0], 1);
    
    const centerX = (xExtent[0] + xExtent[1]) / 2;
    const centerY = (yExtent[0] + yExtent[1]) / 2;

    // Add margins (10% on each side = 20% total, so use 0.8 multiplier)
    const margin = 0.1; // 10% margin on each side
    const availableWidth = width * (1 - 2 * margin);
    const availableHeight = height * (1 - 2 * margin);
    
    // Calculate scale to fit nodes with margins
    const scaleX = availableWidth / fullWidth;
    const scaleY = availableHeight / fullHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Ensure minimum scale to prevent extreme zoom
    const minScale = 0.01;
    const maxScale = 10;
    const clampedScale = Math.max(minScale, Math.min(maxScale, scale));
    
    const initialTransform = {
      x: width / 2 - clampedScale * centerX,
      y: height / 2 - clampedScale * centerY,
      k: clampedScale,
    };

    // Store initial scale and transform to prevent zooming out more than this
    initialScaleRef.current = clampedScale;
    initialTransformRef.current = { ...initialTransform };

    transformRef.current = initialTransform;
    setTransform(initialTransform);
    setIsAtMinZoom(true); // At minimum zoom when reset

    // Update transform when graphData changes
    const zoomSelection = d3.select(canvas);

    // Update scale extent with the new initial scale
    if (zoomRef.current) {
      zoomRef.current.scaleExtent([clampedScale, 10]);
    }

    zoomSelection.call(
      zoomRef.current.transform,
      d3.zoomIdentity
        .translate(initialTransform.x, initialTransform.y)
        .scale(initialTransform.k)
    );
  }, [graphData]);

  const handleZoomIn = () => {
    if (!zoomRef.current || !canvasRef.current) return;
    const d3 = require("d3");
    const zoomSelection = d3.select(canvasRef.current);
    const currentTransform = transformRef.current;
    const newScale = Math.min(currentTransform.k * 1.5, 10);
    const newTransform = d3.zoomIdentity
      .translate(currentTransform.x, currentTransform.y)
      .scale(newScale);
    zoomSelection.call(zoomRef.current.transform, newTransform);
  };

  const handleZoomOut = () => {
    if (!zoomRef.current || !canvasRef.current || isAtMinZoom) return;
    const d3 = require("d3");
    const zoomSelection = d3.select(canvasRef.current);
    const currentTransform = transformRef.current;
    const minScale = initialScaleRef.current;
    const newScale = Math.max(currentTransform.k / 1.5, minScale);
    const newTransform = d3.zoomIdentity
      .translate(currentTransform.x, currentTransform.y)
      .scale(newScale);
    zoomSelection.call(zoomRef.current.transform, newTransform);
  };

  const handleResetZoom = () => {
    if (!zoomRef.current || !canvasRef.current) return;
    const d3 = require("d3");
    const zoomSelection = d3.select(canvasRef.current);
    const initialTransform = initialTransformRef.current;
    const newTransform = d3.zoomIdentity
      .translate(initialTransform.x, initialTransform.y)
      .scale(initialTransform.k);
    zoomSelection.call(zoomRef.current.transform, newTransform);
  };

  return (
    <div ref={containerRef} className="network-canvas-container">
      <div className="network-zoom-controls">
        <button
          className="network-zoom-button"
          onClick={handleZoomIn}
          title="Zoom In"
          aria-label="Zoom In"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="11" y1="8" x2="11" y2="14"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </button>
        <button
          className="network-zoom-button"
          onClick={handleZoomOut}
          title="Zoom Out"
          aria-label="Zoom Out"
          disabled={isAtMinZoom}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </button>
        <button
          className="network-zoom-button"
          onClick={handleResetZoom}
          title="Reset Zoom"
          aria-label="Reset Zoom"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
            <path d="M21 3v5h-5"></path>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
            <path d="M3 21v-5h5"></path>
          </svg>
        </button>
      </div>
    </div>
  );
}
