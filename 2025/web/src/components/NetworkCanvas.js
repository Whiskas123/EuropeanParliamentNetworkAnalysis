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
  const handlersRef = useRef({ mouseMove: null, mouseLeave: null, click: null });
  const [canvasReady, setCanvasReady] = useState(false);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

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
      setCanvasReady(true);
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
    if (canvasRef.current && canvasRef.current.parentNode === containerRef.current) {
      if (!canvasReady) {
        setCanvasReady(true);
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

    // Clear container and add canvas
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(canvas);
    canvasRef.current = canvas;
    setCanvasReady(true);
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
      const zoom = d3
        .zoom()
        .scaleExtent([0.1, 10])
        .filter((event) => {
          // Disable double-click zoom
          return event.type !== "dblclick";
        })
        .on("zoom", (event) => {
          const t = event.transform;
          transformRef.current = { x: t.x, y: t.y, k: t.k };
          setTransform({ x: t.x, y: t.y, k: t.k });
        });

      zoomRef.current = zoom;
      const zoomSelection = d3.select(canvas);
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
      const hovered = graphData.nodes.find((node) => {
        const dx = node.x - x;
        const dy = node.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < nodeSize / currentTransform.k;
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
      const clickedNode = graphData.nodes.find((node) => {
        const dx = node.x - x;
        const dy = node.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < nodeSize / currentTransform.k;
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
    if (!containerRef.current || !graphData || !canvasRef.current || !zoomRef.current) {
      return;
    }

    const d3 = require("d3");
    const canvas = canvasRef.current;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Calculate initial transform
    const xExtent = d3.extent(graphData.nodes, (d) => d.x);
    const yExtent = d3.extent(graphData.nodes, (d) => d.y);
    const fullWidth = xExtent[1] - xExtent[0];
    const fullHeight = yExtent[1] - yExtent[0];
    const centerX = (xExtent[0] + xExtent[1]) / 2;
    const centerY = (yExtent[0] + yExtent[1]) / 2;

    const scale = Math.min(width / fullWidth, height / fullHeight) * 0.9;
    const initialTransform = {
      x: width / 2 - scale * centerX,
      y: height / 2 - scale * centerY,
      k: scale,
    };
    transformRef.current = initialTransform;
    setTransform(initialTransform);

    // Update transform when graphData changes
    const zoomSelection = d3.select(canvas);
    zoomSelection.call(
      zoomRef.current.transform,
      d3.zoomIdentity
        .translate(initialTransform.x, initialTransform.y)
        .scale(initialTransform.k)
    );
  }, [graphData]);

  return (
    <div
      ref={containerRef}
      className="network-canvas-container"
    />
  );
}
