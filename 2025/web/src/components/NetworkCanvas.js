"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const EDGE_BASE_LINE_WIDTH = 0.2;
const NODE_BORDER_BASE_LINE_WIDTH = 0.5;
const SELECTED_BORDER_BASE_LINE_WIDTH = 3;

export default function NetworkCanvas({
  graphData,
  selectedNode,
  onNodeClick,
  onNodeHover,
  onHoverPositionChange,
  mandate,
  selectedCountry,
  selectedSubject,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const zoomRef = useRef(null);
  const graphDataRef = useRef(null);
  const pixelRatioRef = useRef(
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
  );
  // Detect Safari for rendering adjustments
  const isSafariRef = useRef(
    typeof window !== "undefined" &&
      /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  );
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
    const pixelRatio =
      pixelRatioRef.current ||
      (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const t = transformRef.current;

    // Clear entire canvas in device pixels
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.restore();

    // Apply high-DPI scale followed by graph transforms
    // Safari uses 1:1 canvas, so no scaling needed
    const isSafari = isSafariRef.current;
    const effectivePixelRatio = isSafari ? 1 : pixelRatio;

    ctx.save();
    ctx.scale(effectivePixelRatio, effectivePixelRatio);
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
    // Line width: divide by effectivePixelRatio since context is scaled
    ctx.lineWidth = EDGE_BASE_LINE_WIDTH / effectivePixelRatio;
    // Safari renders edges more prominently, use lower alpha to match Chrome/Firefox
    ctx.globalAlpha = isSafari ? 0.05 : 0.3;

    // Debug: Log Safari detection (can be removed later)
    if (isSafari) {
      console.log("Safari detected - using reduced edge alpha");
    }
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
        ctx.lineWidth = SELECTED_BORDER_BASE_LINE_WIDTH / effectivePixelRatio;
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
        ctx.lineWidth = NODE_BORDER_BASE_LINE_WIDTH / effectivePixelRatio;
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
    const isSafari = isSafariRef.current;
    // Safari handles high-DPI differently, use 1:1 canvas for consistent rendering
    const effectivePixelRatio = isSafari
      ? 1
      : typeof window !== "undefined"
      ? window.devicePixelRatio || 1
      : 1;
    const pixelRatio =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    pixelRatioRef.current = pixelRatio;

    // Set up canvas
    const canvas = document.createElement("canvas");
    canvas.width = width * effectivePixelRatio;
    canvas.height = height * effectivePixelRatio;
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

  const handleExportPNG = () => {
    if (!canvasRef.current || !graphData) return;

    const canvas = canvasRef.current;
    const pixelRatio =
      pixelRatioRef.current ||
      (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const logicalWidth = canvas.width / pixelRatio;
    const logicalHeight = canvas.height / pixelRatio;

    // Ensure canvas has valid dimensions
    if (logicalWidth === 0 || logicalHeight === 0) {
      console.error("Canvas has invalid dimensions");
      return;
    }

    // Use high scale for print-quality exports, but limit canvas size
    // Most browsers have practical limits around 8-16k pixels per dimension
    // Also limit total pixels to avoid memory issues (e.g., 256MP = 16384^2)
    const maxDimension = 16384; // Conservative limit for most browsers
    const maxTotalPixels = 256 * 1024 * 1024; // 256 megapixels

    const desiredScale = 8; // Reduced from 24 for better compatibility
    const maxScaleByDimension = Math.floor(
      maxDimension / Math.max(logicalWidth, logicalHeight)
    );
    const maxScaleByPixels = Math.floor(
      Math.sqrt(maxTotalPixels / (logicalWidth * logicalHeight))
    );

    const scale = Math.max(
      1,
      Math.min(desiredScale, maxScaleByDimension, maxScaleByPixels)
    );

    if (scale < 1) {
      console.error("Invalid scale calculated:", scale);
      return;
    }

    const exportWidth = Math.floor(logicalWidth * scale);
    const exportHeight = Math.floor(logicalHeight * scale);

    // Final safety check
    if (exportWidth > maxDimension || exportHeight > maxDimension) {
      console.error(
        "Export canvas dimensions exceed limits:",
        exportWidth,
        exportHeight
      );
      alert(
        `Canvas too large for export (${Math.round(exportWidth)}x${Math.round(
          exportHeight
        )}). Try reducing the zoom level.`
      );
      return;
    }

    // Create a high-resolution canvas with white background
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = exportWidth;
    exportCanvas.height = exportHeight;

    if (exportCanvas.width === 0 || exportCanvas.height === 0) {
      console.error("Export canvas has invalid dimensions");
      return;
    }

    console.log(
      `Exporting at ${exportWidth}x${exportHeight} (scale: ${scale}x)`
    );

    const exportCtx = exportCanvas.getContext("2d");

    if (!exportCtx) {
      console.error("Failed to get 2d context");
      return;
    }

    // Enable high-quality rendering
    exportCtx.imageSmoothingEnabled = true;
    exportCtx.imageSmoothingQuality = "high";

    // Fill with white background
    exportCtx.fillStyle = "#ffffff";
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Apply transforms: scale to high resolution first, then apply view transform
    const t = transformRef.current;
    exportCtx.save();

    // Scale to high resolution coordinate system first
    exportCtx.scale(scale, scale);

    // Then apply the view transform (same values as original rendering)
    // After scaling the context, translate and scale transforms apply in the scaled space
    exportCtx.translate(t.x, t.y);
    exportCtx.scale(t.k, t.k);

    // Draw links at high resolution with properly scaled line widths
    const sortedLinks = [...graphData.links].sort((a, b) => {
      const weightA = a.weight || 0;
      const weightB = b.weight || 0;
      return weightA - weightB;
    });

    const defaultEdgeColor = "#999999";
    exportCtx.strokeStyle = defaultEdgeColor;
    exportCtx.lineWidth = EDGE_BASE_LINE_WIDTH;
    exportCtx.globalAlpha = 0.3;
    exportCtx.lineCap = "round";
    exportCtx.lineJoin = "round";

    sortedLinks.forEach((link) => {
      const sourceNode = graphData.nodeMap.get(link.source);
      const targetNode = graphData.nodeMap.get(link.target);
      if (sourceNode && targetNode) {
        if (
          sourceNode.groupId &&
          targetNode.groupId &&
          sourceNode.groupId === targetNode.groupId
        ) {
          exportCtx.strokeStyle = sourceNode.color || defaultEdgeColor;
        } else {
          exportCtx.strokeStyle = defaultEdgeColor;
        }
        exportCtx.beginPath();
        exportCtx.moveTo(sourceNode.x, sourceNode.y);
        exportCtx.lineTo(targetNode.x, targetNode.y);
        exportCtx.stroke();
      }
    });

    // Calculate node size (same as rendering)
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

    // Draw nodes at high resolution with properly scaled borders
    exportCtx.globalAlpha = 1;
    graphData.nodes.forEach((node) => {
      if (selectedNode && node.id === selectedNode.id) {
        // Outer glow/halo
        exportCtx.fillStyle = "rgba(255, 215, 0, 0.2)";
        exportCtx.beginPath();
        exportCtx.arc(node.x, node.y, haloSize1, 0, 2 * Math.PI);
        exportCtx.fill();

        exportCtx.fillStyle = "rgba(255, 215, 0, 0.3)";
        exportCtx.beginPath();
        exportCtx.arc(node.x, node.y, haloSize2, 0, 2 * Math.PI);
        exportCtx.fill();

        exportCtx.fillStyle = "rgba(255, 215, 0, 0.4)";
        exportCtx.beginPath();
        exportCtx.arc(node.x, node.y, haloSize3, 0, 2 * Math.PI);
        exportCtx.fill();

        // Border ring with scaled line width
        exportCtx.strokeStyle = "#FFD700";
        exportCtx.lineWidth = SELECTED_BORDER_BASE_LINE_WIDTH;
        exportCtx.lineCap = "round";
        exportCtx.beginPath();
        exportCtx.arc(node.x, node.y, borderSize, 0, 2 * Math.PI);
        exportCtx.stroke();

        // Selected node fill
        exportCtx.fillStyle = node.color;
        exportCtx.beginPath();
        exportCtx.arc(node.x, node.y, selectedNodeSize, 0, 2 * Math.PI);
        exportCtx.fill();
      } else {
        // Regular node
        exportCtx.fillStyle = node.color;
        exportCtx.beginPath();
        exportCtx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
        exportCtx.fill();

        // Add subtle border with scaled line width
        exportCtx.strokeStyle = "rgba(0, 0, 0, 0.2)";
        exportCtx.lineWidth = NODE_BORDER_BASE_LINE_WIDTH;
        exportCtx.lineCap = "round";
        exportCtx.beginPath();
        exportCtx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
        exportCtx.stroke();
      }
    });

    exportCtx.restore();

    // Verify we actually drew something by sampling multiple regions (corners + center)
    const sampleSize = 200;
    const positions = [
      { x: 0, y: 0 },
      { x: exportCanvas.width - sampleSize, y: 0 },
      { x: 0, y: exportCanvas.height - sampleSize },
      {
        x: exportCanvas.width - sampleSize,
        y: exportCanvas.height - sampleSize,
      },
      {
        x: Math.max(0, Math.floor((exportCanvas.width - sampleSize) / 2)),
        y: Math.max(0, Math.floor((exportCanvas.height - sampleSize) / 2)),
      },
    ];
    const clampedSize = Math.max(
      1,
      Math.min(sampleSize, exportCanvas.width, exportCanvas.height)
    );

    let hasContent = false;
    for (const pos of positions) {
      const sampleX = Math.max(
        0,
        Math.min(exportCanvas.width - clampedSize, pos.x)
      );
      const sampleY = Math.max(
        0,
        Math.min(exportCanvas.height - clampedSize, pos.y)
      );

      try {
        const imageData = exportCtx.getImageData(
          sampleX,
          sampleY,
          clampedSize,
          clampedSize
        );
        for (let i = 0; i < imageData.data.length; i += 4) {
          if (
            imageData.data[i] < 250 ||
            imageData.data[i + 1] < 250 ||
            imageData.data[i + 2] < 250
          ) {
            hasContent = true;
            break;
          }
        }
      } catch (err) {
        console.warn("Failed to sample export canvas content:", err);
        hasContent = true; // Avoid false negatives if sampling fails
      }

      if (hasContent) break;
    }

    if (!hasContent) {
      console.error("Export canvas appears to be empty - no content detected");
      alert(
        "Failed to export: The canvas appears to be empty. Please try again."
      );
      return;
    }

    // Convert to PNG data URL with better error handling
    let dataURL;
    try {
      dataURL = exportCanvas.toDataURL("image/png", 1.0); // Maximum quality
      if (!dataURL || dataURL === "data:," || dataURL.length < 100) {
        throw new Error("Invalid data URL generated");
      }
    } catch (error) {
      console.error("Error generating data URL:", error);
      console.error(
        "Canvas dimensions:",
        exportCanvas.width,
        "x",
        exportCanvas.height
      );
      console.error("Scale used:", scale);

      // Try with a smaller canvas as fallback
      const fallbackScale = Math.max(1, Math.floor(scale / 2));
      if (fallbackScale < scale && fallbackScale >= 1) {
        console.log(`Retrying with reduced scale: ${fallbackScale}x`);
        const fallbackWidth = Math.floor(logicalWidth * fallbackScale);
        const fallbackHeight = Math.floor(logicalHeight * fallbackScale);

        try {
          const fallbackCanvas = document.createElement("canvas");
          fallbackCanvas.width = fallbackWidth;
          fallbackCanvas.height = fallbackHeight;
          const fallbackCtx = fallbackCanvas.getContext("2d");

          if (fallbackCtx) {
            fallbackCtx.fillStyle = "#ffffff";
            fallbackCtx.fillRect(0, 0, fallbackWidth, fallbackHeight);
            fallbackCtx.drawImage(canvas, 0, 0, fallbackWidth, fallbackHeight);
            dataURL = fallbackCanvas.toDataURL("image/png", 1.0);

            if (dataURL && dataURL !== "data:," && dataURL.length > 100) {
              console.log(
                `Successfully exported at reduced scale ${fallbackScale}x`
              );
            } else {
              throw new Error("Fallback also failed");
            }
          } else {
            throw new Error("Could not create fallback canvas");
          }
        } catch (fallbackError) {
          console.error("Fallback export also failed:", fallbackError);
          alert(
            `Failed to export: Canvas too large (${exportCanvas.width}x${exportCanvas.height}). Try reducing the zoom level or browser window size.`
          );
          return;
        }
      } else {
        alert(
          `Failed to export: Could not generate image data. Canvas size: ${exportCanvas.width}x${exportCanvas.height}. Try reducing the zoom level.`
        );
        return;
      }
    }

    // Generate filename with mandate, country, and subject
    const sanitizeForFilename = (str) => {
      return str
        .replace(/[^a-zA-Z0-9\s-]/g, "") // Remove special characters
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .toLowerCase();
    };

    const filenameParts = [`mandate-${mandate || "all"}`];
    if (selectedCountry) {
      filenameParts.push(`country-${sanitizeForFilename(selectedCountry)}`);
    }
    if (selectedSubject) {
      filenameParts.push(`subject-${sanitizeForFilename(selectedSubject)}`);
    } else if (graphData.subjects && graphData.subjects.length > 0) {
      filenameParts.push("all-subjects");
    }
    const filename = `network-${filenameParts.join("-")}.png`;

    // Create a temporary link element to trigger download
    const link = document.createElement("a");
    link.download = filename;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div ref={containerRef} className="network-canvas-container">
      <div className="network-zoom-controls">
        <button
          className="network-zoom-button"
          onClick={handleZoomIn}
          title="Zoom In (or use mouse wheel)"
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
          title="Reset Zoom (or double-click)"
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
        <button
          className="network-zoom-button"
          onClick={handleExportPNG}
          title="Export Network as PNG"
          aria-label="Export Network as PNG"
          disabled={!graphData || !canvasReady}
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
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
      </div>
      <div
        className="network-canvas-tip"
        title="Click on nodes in the network to explore individual MEPs, or click on groups in the heatmaps"
      >
        💡 Tip: Click MEP nodes or group names to explore more
      </div>
      {!graphData && (
        <div className="network-canvas-empty">
          <div className="network-canvas-empty-content">
            <div className="network-canvas-empty-icon">🌐</div>
            <h3>Network Visualization</h3>
            <p>Loading network data...</p>
            <p className="network-canvas-empty-hint">
              Once loaded, you can click on nodes to explore MEPs and their
              connections
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
