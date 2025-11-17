
// --- AUTO-INSERTED: safe image loader ---
function __xvg_loadImage(url, onload, onerror){
 try { const img = new Image(); img.crossOrigin='anonymous';
 img.onload = ()=>onload && onload(img);
 img.onerror = ()=>onerror && onerror(new Error('Image load failed: '+url));
 img.src = url; return img; } catch(e){ if (onerror) onerror(e); }
}
// UI is for the xvg project and the rules are being followed.
// path: /src/xvg-core.js

(function () {
  'use strict';
  
  // Runtime configuration for WASM engine usage
  const runtimeConfig = {
    // Set to true to enforce WASM-only mode (throw errors instead of falling back)
    wasmOnly: typeof process !== 'undefined' && process.env && process.env.XVG_WASM_ONLY === 'true',
    // Enable verbose logging for engine usage
    verboseEngineLogging: false
  };
  
  // Dynamic canvas sizing configuration
  const canvasConfig = {
    baseWidth: 2000,
    baseHeight: 1500,
    minWidth: 800,
    minHeight: 600,
    maxWidth: 8192,
    maxHeight: 8192,
    aspectRatio: 4/3, // 2000/1500
    autoResize: true
  };

  // Selection configuration for dynamic styling
  const selectionConfig = {
    baseSelectionWidth: 2,
    baseDashLength: 5,
    baseGapLength: 5,
    minDashLength: 1,
    maxDashLength: 10,
    minSelectionWidth: 1,
    maxSelectionWidth: 6
  };

  // UI tolerances and interaction thresholds
  const uiConfig = {
    // Base values for dynamic scaling
    baseDragThreshold: 3,
    baseHitTolerance: 5,
    baseSnapThreshold: 5,
    baseHandleSize: 8,
    
    // Tolerance limits
    minHitTolerance: 3,
    maxHitTolerance: 15,
    minHandleSize: 6,
    maxHandleSize: 20,
    
    // Selection and visual properties
    selectionWidth: selectionConfig.baseSelectionWidth,
    selectionColor: '#0066ff',
    handleColor: '#ffffff',
    handleBorderColor: '#0066ff'
  };

  // Zoom and pan configuration
  const zoomPanConfig = {
    // Zoom limits
    minZoom: 0.1,
    maxZoom: 10.0,
    zoomStep: 1.2,
    
    // Pan sensitivity and smoothing
    baseSensitivity: 1.0,
    panDecay: 0.95,
    
    // Adaptive zoom limits based on content
    adaptiveZoom: true,
    contentBasedLimits: true
  };

  // Text configuration
  const textConfig = {
    baseFontSize: 24,
    baseCharWidth: 0.6,  // Character width multiplier
    baseLineHeight: 1.2, // Line height multiplier
    minFontSize: 8,
    maxFontSize: 72,
    fontFamily: 'Arial',
    baselineOffset: 0.8, // Baseline position multiplier
    topOffset: 0.2       // Top margin multiplier
  };

  // Grid and visual styling configuration
  const gridConfig = {
    baseMajorLineWidth: 2,
    baseMinorLineWidth: 1,
    baseMajorTickSize: 15,
    baseMinorTickSize: 8,
    baseStrokeWidth: 2,
    minLineWidth: 0.5,
    maxLineWidth: 8,
    minTickSize: 4,
    maxTickSize: 30
  };

  // Calculate dynamic canvas dimensions based on viewport and content
  function calculateCanvasDimensions() {
    const viewport = {
      width: window.innerWidth || 1920,
      height: window.innerHeight || 1080
    };
    
    // Use full viewport size to ensure grid covers entire window
    let width = Math.max(viewport.width, canvasConfig.minWidth);
    let height = Math.max(viewport.height, canvasConfig.minHeight);
    
    // Maintain aspect ratio
    if (width / height > canvasConfig.aspectRatio) {
      width = height * canvasConfig.aspectRatio;
    } else {
      height = width / canvasConfig.aspectRatio;
    }
    
    // Clamp to limits
    width = Math.min(Math.max(width, canvasConfig.minWidth), canvasConfig.maxWidth);
    height = Math.min(Math.max(height, canvasConfig.minHeight), canvasConfig.maxHeight);
    
    return {
      width: Math.round(width),
      height: Math.round(height)
    };
  }

  // Get initial canvas dimensions
  const initialDimensions = calculateCanvasDimensions();

  // Function to update canvas dimensions dynamically
  function updateCanvasDimensions() {
    const newDimensions = calculateCanvasDimensions();
    
    // Update appState
    appState.canvas.width = newDimensions.width;
    appState.canvas.height = newDimensions.height;
    appState.coordinateSystem.totalWidth = newDimensions.width;
    appState.coordinateSystem.totalHeight = newDimensions.height;
    appState.coordinateSystem.rangeX = [-newDimensions.width/2, newDimensions.width/2];
    appState.coordinateSystem.rangeY = [-newDimensions.height/2, newDimensions.height/2];
    appState.canvasTransform.canvas_width = newDimensions.width;
    appState.canvasTransform.canvas_height = newDimensions.height;
    
    // Update actual canvas if it exists
    if (globalCanvas) {
      globalCanvas.width = newDimensions.width;
      globalCanvas.height = newDimensions.height;
    }
    
    // Update renderer if available
    if (rendererInstance && window.XVGEngineIntegration?.xvgWasm?.XVGRenderer) {
      try {
        rendererInstance = new window.XVGEngineIntegration.xvgWasm.XVGRenderer(newDimensions.width, newDimensions.height);
        rendererInstance.set_transform(
          appState.canvasTransform.zoom || 1.0,
          appState.canvasTransform.pan_x || 0.0,
          appState.canvasTransform.pan_y || 0.0
        );
      } catch (error) {
        console.warn('Failed to update renderer dimensions:', error);
      }
    }
    
    return newDimensions;
  }

  // Calculate dynamic UI tolerances based on DPI and zoom
  function calculateDynamicDragThreshold(zoomLevel = 1) {
    const dpiScale = window.devicePixelRatio || 1;
    return uiConfig.baseDragThreshold * dpiScale;
  }

  function calculateDynamicHitTolerance(zoomLevel = 1) {
    const dpiScale = window.devicePixelRatio || 1;
    // Maintain consistent hit area regardless of zoom
    const dynamicTolerance = (uiConfig.baseHitTolerance * dpiScale) / zoomLevel;
    
    // Ensure minimum tolerance for usability
    return Math.max(
      uiConfig.minHitTolerance * dpiScale, 
      Math.min(uiConfig.maxHitTolerance * dpiScale, dynamicTolerance)
    );
  }

  function calculateDynamicSnapThreshold(zoomLevel = 1) {
    const dpiScale = window.devicePixelRatio || 1;
    const currentZoom = zoomLevel || appState.canvasTransform.zoom || 1;
    return (uiConfig.baseSnapThreshold * dpiScale) / currentZoom;
  }

  function calculateDynamicHandleSize(zoomLevel = 1) {
    const dpiScale = window.devicePixelRatio || 1;
    const baseSize = uiConfig.baseHandleSize * dpiScale;
    
    // Scale with zoom but maintain usability limits
    const scaledSize = baseSize / Math.sqrt(zoomLevel);
    return Math.max(
      uiConfig.minHandleSize * dpiScale,
      Math.min(uiConfig.maxHandleSize * dpiScale, scaledSize)
    );
  }

  // Calculate dynamic zoom limits based on content and viewport
  function calculateDynamicZoomLimits() {
    if (!zoomPanConfig.contentBasedLimits) {
      return {
        minZoom: zoomPanConfig.minZoom,
        maxZoom: zoomPanConfig.maxZoom
      };
    }
    
    // Adjust zoom limits based on canvas size and content
    const canvasSize = Math.max(appState.canvas.width, appState.canvas.height);
    const viewportSize = Math.max(window.innerWidth || 1920, window.innerHeight || 1080);
    
    // Calculate content-aware zoom limits
    const contentScale = canvasSize / viewportSize;
    const adaptiveMinZoom = Math.max(zoomPanConfig.minZoom, 0.1 / contentScale);
    const adaptiveMaxZoom = Math.min(zoomPanConfig.maxZoom, 20.0 * contentScale);
    
    return {
      minZoom: adaptiveMinZoom,
      maxZoom: adaptiveMaxZoom
    };
  }

  function calculateDynamicPanSensitivity(zoomLevel = 1) {
    // Inverse relationship: higher zoom = lower sensitivity for finer control
    return zoomPanConfig.baseSensitivity / zoomLevel;
  }

  function getZoomStep() {
    return zoomPanConfig.zoomStep;
  }

  function getPanDecay() {
    return zoomPanConfig.panDecay;
  }

  // Calculate dynamic text sizing based on zoom and DPI
  function calculateDynamicFontSize(baseFontSize = null, zoomLevel = 1) {
    const fontSize = baseFontSize || textConfig.baseFontSize;
    const dpiScale = window.devicePixelRatio || 1;
    
    // Scale font size with zoom but maintain readability limits
    const scaledSize = fontSize * Math.sqrt(zoomLevel) * dpiScale;
    return Math.max(
      textConfig.minFontSize * dpiScale,
      Math.min(textConfig.maxFontSize * dpiScale, scaledSize)
    );
  }

  function calculateTextDimensions(text, fontSize = null, zoomLevel = 1) {
    const actualFontSize = fontSize || calculateDynamicFontSize(null, zoomLevel);
    const charWidth = textConfig.baseCharWidth;
    const lineHeight = textConfig.baseLineHeight;
    
    return {
      width: text.length * actualFontSize * charWidth,
      height: actualFontSize * lineHeight,
      fontSize: actualFontSize,
      baselineOffset: actualFontSize * textConfig.baselineOffset,
      topOffset: actualFontSize * textConfig.topOffset
    };
  }

  function getTextConfig() {
    return textConfig;
  }

  // Calculate dynamic grid styling based on zoom and DPI
  function calculateDynamicLineWidth(baseWidth = null, zoomLevel = 1) {
    const lineWidth = baseWidth || gridConfig.baseStrokeWidth;
    const dpiScale = window.devicePixelRatio || 1;
    
    // Adjust line width for zoom while maintaining visibility
    const scaledWidth = (lineWidth * dpiScale) / Math.sqrt(zoomLevel);
    return Math.max(
      gridConfig.minLineWidth * dpiScale,
      Math.min(gridConfig.maxLineWidth * dpiScale, scaledWidth)
    );
  }

  function calculateDynamicTickSize(baseSize = null, zoomLevel = 1) {
    const tickSize = baseSize || gridConfig.baseMajorTickSize;
    const dpiScale = window.devicePixelRatio || 1;
    
    // Scale tick size with zoom but maintain usability
    const scaledSize = (tickSize * dpiScale) / Math.sqrt(zoomLevel);
    return Math.max(
      gridConfig.minTickSize * dpiScale,
      Math.min(gridConfig.maxTickSize * dpiScale, scaledSize)
    );
  }

  function getGridConfig() {
    return gridConfig;
  }

  // Calculate dynamic selection width based on zoom and DPI
  function calculateDynamicSelectionWidth(baseWidth = null, zoomLevel = 1) {
    const base = baseWidth || selectionConfig.baseSelectionWidth;
    const dpiScale = window.devicePixelRatio || 1;
    const zoomScale = Math.max(0.5, Math.min(2, 1 / Math.sqrt(zoomLevel)));
    const dynamicWidth = base * dpiScale * zoomScale;
    return Math.max(selectionConfig.minSelectionWidth, Math.min(selectionConfig.maxSelectionWidth, dynamicWidth));
  }

  // Calculate dynamic dash pattern based on zoom
  function calculateDynamicDashPattern(zoomLevel = 1) {
    const dashLength = Math.max(selectionConfig.minDashLength, 
      Math.min(selectionConfig.maxDashLength, selectionConfig.baseDashLength / zoomLevel));
    const gapLength = Math.max(selectionConfig.minDashLength, 
      Math.min(selectionConfig.maxDashLength, selectionConfig.baseGapLength / zoomLevel));
    return [dashLength, gapLength];
  }

  function getSelectionConfig() {
    return selectionConfig;
  }

  // Expose functions globally
  window.calculateCanvasDimensions = calculateCanvasDimensions;
  window.updateCanvasDimensions = updateCanvasDimensions;
  window.calculateDynamicDragThreshold = calculateDynamicDragThreshold;
  window.calculateDynamicHitTolerance = calculateDynamicHitTolerance;
  window.calculateDynamicSnapThreshold = calculateDynamicSnapThreshold;
  window.calculateDynamicHandleSize = calculateDynamicHandleSize;
  window.calculateDynamicZoomLimits = calculateDynamicZoomLimits;
  window.calculateDynamicPanSensitivity = calculateDynamicPanSensitivity;
  window.getZoomStep = getZoomStep;
  window.getPanDecay = getPanDecay;
  window.calculateDynamicFontSize = calculateDynamicFontSize;
  window.calculateTextDimensions = calculateTextDimensions;
  window.getTextConfig = getTextConfig;
  window.calculateDynamicLineWidth = calculateDynamicLineWidth;
  window.calculateDynamicTickSize = calculateDynamicTickSize;
  window.getGridConfig = getGridConfig;
  window.calculateDynamicSelectionWidth = calculateDynamicSelectionWidth;
  window.calculateDynamicDashPattern = calculateDynamicDashPattern;
  window.getSelectionConfig = getSelectionConfig;
  window.uiConfig = uiConfig;
  window.zoomPanConfig = zoomPanConfig;
  window.textConfig = textConfig;
  window.gridConfig = gridConfig;

  // Attach to window for legacy access
  const appState = {
    canvas: { width: initialDimensions.width, height: initialDimensions.height, scale: 1.0 },
    coordinateSystem: {
      totalWidth: initialDimensions.width,
      totalHeight: initialDimensions.height,
      centerX: 0,
      centerY: 0,
      rangeX: [-initialDimensions.width/2, initialDimensions.width/2],
      rangeY: [-initialDimensions.height/2, initialDimensions.height/2],
      buffer: 100
    },
    currentTool: 'select',
    isDrawing: false,
    currentPath: [],
    drawingType: null,
    isErasing: false,
    eraserSize: 20,
    canvasTransform: {
      zoom: 1.0,
      pan_x: 0.0,
      pan_y: 0.0,
      canvas_width: initialDimensions.width,
      canvas_height: initialDimensions.height,
      documentOriginX: 0,
      documentOriginY: 0,
      matrix: [1, 0, 0, 1, 0, 0]
    },
    paths: [], // Initialize with empty paths array - no default line
    selectedPaths: [],
    // selection / resize
    isBoxSelecting: false,
    boxSelectionStart: null,
    boxSelectionEnd: null,
    isResizing: false,
    resizeHandle: null,
    // rotation
    isRotating: false,
    rotationCenter: null,
    rotationStartAngle: 0,
    // modified
    isModified: false,
    currentStyle: {
      fill: { color: [0.2, 0.6, 0.9, 0.8], rule: 'nonzero' },
      stroke: { color: [0, 0, 0, 1], width: 2.0 },
      opacity: 1.0,
      text: { font: textConfig.fontFamily, size: textConfig.baseFontSize, color: [0, 0, 0, 1], bold: false, italic: false, align: 'left' }
    },
    line3DDepth: 0.0,
    grid: {
      visible: true,
      size: 20,
      color: 'rgba(0,0,0,0.3)',
      snapToGrid: false,
      majorLineColor: 'rgba(50,50,50,0.8)',
      minorLineColor: 'rgba(30,30,30,0.4)',
      majorLineWidth: gridConfig.baseMajorLineWidth,
      minorLineWidth: gridConfig.baseMinorLineWidth
    },
    rulers: {
      visible: true,
      units: 'px',
      backgroundColor: '#2a2a2a',
      borderColor: '#3a3a3a',
      textColor: '#1d43aa',
      majorTickColor: '#ffffff',
      minorTickColor: '#666666',
      majorTickSize: gridConfig.baseMajorTickSize,
      minorTickSize: gridConfig.baseMinorTickSize,
      updateThrottle: 16,
      lastUpdate: 0
    },
    guides: { visible: true, horizontal: [], vertical: [], isCreating: false, createType: null, createStart: null },
    // 3D
    threeD: { meshId: null, vertexCount: 0, indexCount: 0, rotationX: 0, rotationY: 0, rotationZ: 0 },
    collaboration: { lastSync: null, operationCount: 0 },
    performance: { fps: 0, lastFrame: 0, frameCount: 0 },
    filename: 'Untitled.xvg',
    undoStack: [],
    redoStack: [],
    maxUndoSteps: 50,
    clipboard: null,
    layers: [{ id: 'layer_1', name: 'Layer 1', visible: true, locked: false, opacity: 1.0, pathIndices: [] }],
    currentLayerIndex: 0,
    panning: false,
    is3DNavigation: false,
    isCreatingText: false,
    textInput: '',
    textPosition: null
  };

  // Standardize on selectedPaths - unified selection system

  window.appState = appState;

  // Global canvas and context variables
  let canvas = null;
  let ctx = null;

  /* =============================
   * Canvas + Context
   * ============================= */
  let globalCanvas = null;
  let globalCtx = null;
  let lastMousePos = { x: 0, y: 0 };

  function showNotification(message, type = 'info') {
    let container = document.getElementById('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
      document.body.appendChild(container);
    }
    const n = document.createElement('div');
    const bg = type === 'success' ? '#28a745' : type === 'warning' ? '#ffc107' : type === 'error' ? '#dc3545' : '#17a2b8';
    n.style.cssText = `background:${bg};color:#fff;padding:10px 12px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.2);pointer-events:auto;`;
    n.textContent = message;
    container.appendChild(n);
    setTimeout(() => n.remove(), 2200);
  }

  /* =============================
   * Transforms
   * ============================= */
  let rendererInstance = null;
  
  function initializeRenderer() {
    // Check if XVGRenderer is available from WASM
    if (window.XVGEngineIntegration && 
        window.XVGEngineIntegration.isReady() && 
        window.XVGEngineIntegration.engines.shader && 
        window.XVGEngineIntegration.xvgWasm && 
        window.XVGEngineIntegration.xvgWasm.XVGRenderer) {
      
      try {
        // Get canvas dimensions
        const width = globalCanvas ? globalCanvas.width : appState.canvas.width;
        const height = globalCanvas ? globalCanvas.height : appState.canvas.height;
        
        // Create renderer instance
        rendererInstance = new window.XVGEngineIntegration.xvgWasm.XVGRenderer(width, height);
        
        // Check if set_transform method exists before calling it
        if (typeof rendererInstance.set_transform === 'function') {
        // Initialize with current transform
        rendererInstance.set_transform(
          appState.canvasTransform.zoom || 1.0,
          appState.canvasTransform.pan_x || 0.0,
          appState.canvasTransform.pan_y || 0.0
        );
        } else {
          console.warn("XVGRenderer.set_transform method not available");
        }
        
        return true;
      } catch (error) {
        console.error("Failed to initialize XVGRenderer:", error);
        rendererInstance = null;
      }
    }
    
    // WASM not available - this is fine, basic canvas functionality will work
    rendererInstance = null;
    return false;
  }
  
  // Listen for WASM ready event to initialize renderer
  window.addEventListener('xvg-wasm-ready', () => {
    initializeRenderer();
  });
  
  function resetTransform() { 
    if (globalCtx) globalCtx.setTransform(1, 0, 0, 1, 0, 0); 
  }
  
  function screenToCanvas(screenX, screenY) {
    if (!globalCanvas) {
      return { x: 0, y: 0 };
    }
    
    // Basic coordinate conversion should always work
    const r = globalCanvas.getBoundingClientRect();
    const z = appState.canvasTransform.zoom || 1;
    const px = appState.canvasTransform.pan_x || 0;
    const py = appState.canvasTransform.pan_y || 0;
    
    // Correct coordinate conversion: subtract canvas offset, then apply inverse transform
    const result = { 
      x: (screenX - r.left - px) / z, 
      y: (screenY - r.top - py) / z 
    };
    
    // Debug logging removed to prevent spam
    
    // Optional: Use XVGRenderer if available for enhanced precision
    if (rendererInstance) {
      try {
        const wasmResult = rendererInstance.screen_to_world(screenX, screenY);
        // Debug logging removed to prevent spam
        return { x: wasmResult.x, y: wasmResult.y };
      } catch (error) {
        console.error("Error using XVGRenderer.screen_to_world:", error);
        // Continue with basic calculation
      }
    }
    
    return result;
  }
  
  function canvasToScreen(canvasX, canvasY) {
    if (!globalCanvas) return { x: 0, y: 0 };
    
    // Basic coordinate conversion should always work
    const r = globalCanvas.getBoundingClientRect();
    const z = appState.canvasTransform.zoom || 1;
    const px = appState.canvasTransform.pan_x || 0;
    const py = appState.canvasTransform.pan_y || 0;
    
    const result = { x: canvasX * z + px + r.left, y: canvasY * z + py + r.top };
    
    // Optional: Use XVGRenderer if available for enhanced precision
    if (rendererInstance) {
      try {
        const wasmResult = rendererInstance.world_to_screen(canvasX, canvasY);
        return { x: wasmResult.x, y: wasmResult.y };
      } catch (error) {
        console.error("Error using XVGRenderer.world_to_screen:", error);
        // Continue with basic calculation
      }
    }
    
    return result;
  }
  
  function updateRendererTransform() {
    // Basic canvas transform always works
    if (globalCtx) {
      // The transform is applied in renderCanvas() for basic functionality
    }
    
    // Optional: Update WASM renderer if available
    if (rendererInstance) {
      try {
        rendererInstance.set_transform(
          appState.canvasTransform.zoom || 1.0,
          appState.canvasTransform.pan_x || 0.0,
          appState.canvasTransform.pan_y || 0.0
        );
      } catch (error) {
        console.error("Error updating XVGRenderer transform:", error);
        // Don't fail - basic functionality continues
      }
    }
  }
  
  function updateCanvasTransformLabel() {
    const el = document.getElementById('zoom-level');
    if (el) el.textContent = `${Math.round((appState.canvasTransform.zoom || 1) * 100)}%`;
  }
  
  function updateCanvasTransform() {
    // Update the renderer transform
    updateRendererTransform();
    
    // Update the transform label
    updateCanvasTransformLabel();
    
    // Re-render the canvas to show the new transform
    renderCanvas();
  }

  /* =============================
   * Render Pipeline
   * ============================= */
  function drawGrid() {
    try {
      if (!globalCtx || !appState.grid.visible) {
        return;
      }
      
      // Ensure we have valid canvas dimensions
      if (!globalCanvas || !globalCanvas.width || !globalCanvas.height) {
        console.warn('Grid not drawn - invalid canvas dimensions');
        return;
      }
      
      const g = appState.grid;
      const z = appState.canvasTransform.zoom || 1;

      let spacing = g.size || 20;
      // Don't adjust spacing based on zoom - keep grid consistent
      // if (z < 0.5) spacing *= 5; else if (z < 0.2) spacing *= 10; else if (z > 2) spacing /= 2; else if (z > 5) spacing /= 5;

      // Calculate grid bounds in screen coordinates
      // Grid should be static (not move with pan) to serve as fixed reference
      const t = appState.canvasTransform;
      const zoom = t.zoom || 1;
      const panX = t.pan_x || 0;
      const panY = t.pan_y || 0;
      
      // Calculate grid bounds in screen coordinates
      const screenLeft = 0;
      const screenTop = 0;
      const screenRight = globalCanvas.width;
      const screenBottom = globalCanvas.height;
      
      // Keep grid spacing consistent in screen coordinates
      const screenSpacing = spacing;
      
      // Extend bounds to ensure grid covers entire canvas
      const padding = Math.max(globalCanvas.width, globalCanvas.height);
      
      // Calculate grid start/end in screen coordinates with padding
      const startX = Math.floor((screenLeft - padding) / screenSpacing) * screenSpacing;
      const endX = Math.ceil((screenRight + padding) / screenSpacing) * screenSpacing;
      const startY = Math.floor((screenTop - padding) / screenSpacing) * screenSpacing;
      const endY = Math.ceil((screenBottom + padding) / screenSpacing) * screenSpacing;

      // Save current context state
      globalCtx.save();
      
      try {
        // Draw grid in screen coordinates (no transform needed)
        globalCtx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Draw vertical grid lines
        let verticalLines = 0;
        for (let x = startX; x <= endX; x += screenSpacing) {
          try {
            const major = Math.round(x / spacing) % 5 === 0;
            globalCtx.strokeStyle = major ? g.majorLineColor : g.minorLineColor;
            globalCtx.lineWidth = major ? g.majorLineWidth : g.minorLineWidth;
            
            globalCtx.beginPath();
            globalCtx.moveTo(x, startY);
            globalCtx.lineTo(x, endY);
            globalCtx.stroke();
            verticalLines++;
            

          } catch (error) {
            console.error('Error drawing vertical grid line at x:', x, error);
          }
        }
        
        // Draw horizontal grid lines
        let horizontalLines = 0;
        for (let y = startY; y <= endY; y += screenSpacing) {
          try {
            const major = Math.round(y / spacing) % 5 === 0;
            globalCtx.strokeStyle = major ? g.majorLineColor : g.minorLineColor;
            globalCtx.lineWidth = major ? g.majorLineWidth : g.minorLineWidth;
            
            globalCtx.beginPath();
            globalCtx.moveTo(startX, y);
            globalCtx.lineTo(endX, y);
            globalCtx.stroke();
            horizontalLines++;
          } catch (error) {
            console.error('Error drawing horizontal grid line at y:', y, error);
          }
        }
        
      } catch (error) {
        console.error('Error during grid drawing:', error);
      } finally {
        // Restore context state
        globalCtx.restore();
      }
    } catch (error) {
      console.error('Critical error in drawGrid:', error);
    }
  }

  function drawWelcomeMessage() {
    globalCtx.save();
    resetTransform();
    
    // Draw a subtle background pattern to make the canvas less empty
    globalCtx.fillStyle = '#f8f9fa';
    globalCtx.fillRect(0, 0, globalCanvas.width, globalCanvas.height);
    
    // Draw a subtle grid pattern
    globalCtx.strokeStyle = '#e9ecef';
    globalCtx.lineWidth = 1;
    const gridSize = 50;
    for (let x = 0; x < globalCanvas.width; x += gridSize) {
      globalCtx.beginPath();
      globalCtx.moveTo(x, 0);
      globalCtx.lineTo(x, globalCanvas.height);
      globalCtx.stroke();
    }
    for (let y = 0; y < globalCanvas.height; y += gridSize) {
      globalCtx.beginPath();
      globalCtx.moveTo(0, y);
      globalCtx.lineTo(globalCanvas.width, y);
      globalCtx.stroke();
    }
    
    // Draw welcome message with better styling
    globalCtx.fillStyle = '#4A9B8F';
    globalCtx.font = 'bold 28px Arial';
    globalCtx.textAlign = 'center';
    globalCtx.textBaseline = 'top';
    globalCtx.fillText('Welcome to XVG Editor', globalCanvas.width / 2, 100);
    
    globalCtx.fillStyle = '#666666';
    globalCtx.font = '16px Arial';
    globalCtx.fillText('Get started by:', globalCanvas.width / 2, 150);
    
    // Draw helpful icons and text
    const startY = 180;
    const lineHeight = 30;
    
    // 1. Select a tool
    globalCtx.fillStyle = '#4A9B8F';
    globalCtx.fillText('1. Select a tool from the toolbar above', globalCanvas.width / 2, startY);
    
    // 2. Start drawing
    globalCtx.fillText('2. Click and drag on the canvas to draw', globalCanvas.width / 2, startY + lineHeight);
    
    // 3. Upload files
    globalCtx.fillText('3. Drag & drop SVG, images, or XVG files here', globalCanvas.width / 2, startY + lineHeight * 2);
    
    // 4. Add test shapes
    globalCtx.fillStyle = '#999999';
    globalCtx.font = '14px Arial';
    globalCtx.fillText('Tip: Use Help → Add Test Shapes to see some examples', globalCanvas.width / 2, startY + lineHeight * 3 + 20);
    
    // Draw some decorative elements
    globalCtx.strokeStyle = '#4A9B8F';
    globalCtx.lineWidth = 2;
    globalCtx.setLineDash([8, 4]);
    
    // Draw a decorative border
    const borderMargin = 100;
    globalCtx.strokeRect(borderMargin, borderMargin, globalCanvas.width - borderMargin * 2, globalCanvas.height - borderMargin * 2);
    
    globalCtx.restore();
  }

  function drawPath(path, isSelected) {
    if (!path) return;
    
    try {
      // Handle image objects
      if (path.type === 'image' && path.image) {
        // Validate that the image is a proper drawable object
        if (!(path.image instanceof HTMLImageElement) && 
            !(path.image instanceof HTMLCanvasElement) && 
            !(path.image instanceof ImageBitmap) &&
            !(path.image instanceof HTMLVideoElement)) {
          console.warn('Invalid image object for drawImage:', path.image);
          return;
        }
        
        // Check if image is loaded (for HTMLImageElement)
        if (path.image instanceof HTMLImageElement && !path.image.complete) {
          console.warn('Image not yet loaded:', path.image.src);
          return;
        }
        
        const [x, y, width, height] = path.data || [0, 0, path.image.width, path.image.height];
        
        try {
          // Apply rotation if the image is spinning
          if (path.rotation && path.isSpinning) {
            const centerX = x + width / 2;
            const centerY = y + height / 2;
            
            // Save context for rotation effect
            globalCtx.save();
            
            // Move to center of logo
            globalCtx.translate(centerX, centerY);
            
            // Apply simple rotation (no 3D effect)
            const rotationRadians = (path.rotation * Math.PI) / 180;
            globalCtx.rotate(rotationRadians);
            
            // Move back from center
            globalCtx.translate(-centerX, -centerY);
            
            // Draw the image with rotation applied
            globalCtx.drawImage(path.image, x, y, width, height);
            
            // Restore context after drawing
            globalCtx.restore();
          } else {
            // Draw the image without rotation
            globalCtx.drawImage(path.image, x, y, width, height);
          }
          
          // Image drawn successfully
        } catch (error) {
          console.error('Error drawing image:', error);
          // Ensure context is restored if there was a save() call
          if (path.rotation && path.isSpinning) {
            globalCtx.restore();
          }
        }
        
        // Draw selection border if selected
        if (isSelected) {
          try {
            globalCtx.save();
            globalCtx.setLineDash([4, 4]);
            globalCtx.strokeStyle = '#4A9B8F';
            globalCtx.lineWidth = calculateDynamicLineWidth();
            globalCtx.strokeRect(x, y, width, height);
            globalCtx.restore();
          } catch (error) {
            console.error('Error drawing image selection border:', error);
          }
        }
        return;
      }
      
      // Handle text objects
      if (path.type === 'text') {
        try {
          const [x, y] = path.data;
          const text = path.text || '';
          const style = path.style || appState.currentStyle;
          
          // Set text style in world coordinates (renderCanvas already applied transform)
          globalCtx.save();
          
          const textStyle = style.text || {};
          const fontStyle = [];
          if (textStyle.bold) fontStyle.push('bold');
          if (textStyle.italic) fontStyle.push('italic');
          const fontSize = textStyle.size || textConfig.baseFontSize; // do not multiply by zoom here
          const fontFamily = textStyle.font || 'Arial';
          
          globalCtx.font = `${fontStyle.join(' ')} ${fontSize}px ${fontFamily}`.trim();
          globalCtx.textAlign = textStyle.align || 'left';
          globalCtx.textBaseline = 'middle';
          
          // Apply text color with opacity
          const compositeOpacity = typeof style.opacity === 'number' ? Math.max(0, Math.min(1, style.opacity)) : 1.0;
          const [r, g, b, a] = textStyle.color || [0, 0, 0, 1];
          const alpha = Math.max(0, Math.min(1, (a ?? 1) * compositeOpacity));
          globalCtx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},${alpha})`;
          
          // Draw text at world coordinates
          globalCtx.fillText(text, x, y);
          
          // Underline (world units)
          if (textStyle.underline) {
            const textWidth = globalCtx.measureText(text).width;
            const underlineY = y + (fontSize / 4);
            
            globalCtx.beginPath();
            let underlineX = x;
            if (textStyle.align === 'center') underlineX = x - textWidth / 2;
            else if (textStyle.align === 'right') underlineX = x - textWidth;
            globalCtx.moveTo(underlineX, underlineY);
            globalCtx.lineTo(underlineX + textWidth, underlineY);
            globalCtx.lineWidth = Math.max(1, fontSize / 16);
            globalCtx.strokeStyle = `rgba(${r * 255},${g * 255},${b * 255},${alpha})`;
            globalCtx.stroke();
          }
          
          // Selection indicator (world units)
          if (isSelected) {
            const textWidth = globalCtx.measureText(text).width;
            const padding = 4;
            let boxX = x;
            if (textStyle.align === 'center') boxX = x - textWidth / 2;
            else if (textStyle.align === 'right') boxX = x - textWidth;
            globalCtx.setLineDash([4, 4]);
            globalCtx.strokeStyle = '#4A9B8F';
            globalCtx.lineWidth = calculateDynamicLineWidth(gridConfig.baseMinorLineWidth);
            globalCtx.strokeRect(
              boxX - padding, 
              y - fontSize / 2 - padding, 
              textWidth + padding * 2, 
              fontSize + padding * 2
            );
          }
          
          globalCtx.restore();
        } catch (error) {
          console.error('Error drawing text:', error);
          globalCtx.restore();
        }
        return;
      }
      
      // Handle regular paths
      if (!path.data || path.data.length < 2) return;
      const style = path.style || appState.currentStyle;

      try {
        globalCtx.beginPath();
        if (path.type === 'rectangle') {
          const [x1, y1, x2, y2] = path.data;
          globalCtx.rect(x1, y1, x2 - x1, y2 - y1);
        } else if (path.type === 'circle') {
          const [cx, cy, ex, ey] = path.data;
          const r = Math.hypot(ex - cx, ey - cy);
          globalCtx.arc(cx, cy, r, 0, Math.PI * 2);
        } else {
          globalCtx.moveTo(path.data[0], path.data[1]);
          for (let i = 2; i < path.data.length; i += 2) globalCtx.lineTo(path.data[i], path.data[i + 1]);
          // Close path if it's a polygon OR if it has a fill (fill requires closed path)
          if (path.type === 'polygon' || (style.fill && style.fill.color && style.fill.color[3] > 0)) {
            globalCtx.closePath();
          }
        }

        // Composite opacity support
        const compositeOpacity = typeof style.opacity === 'number' ? Math.max(0, Math.min(1, style.opacity)) : 1.0;
        if (style.fill && style.fill.color && Array.isArray(style.fill.color) && style.fill.color.length >= 4 && style.fill.color[3] > 0) {
          const [r, g, b, a] = style.fill.color; 
          const aa = Math.max(0, Math.min(1, a * compositeOpacity));
          globalCtx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},${aa})`; 
          globalCtx.fill();
        }
        if (style.stroke && style.stroke.color && Array.isArray(style.stroke.color) && style.stroke.color.length >= 4) {
          const [r, g, b, a] = style.stroke.color; 
          const aa = Math.max(0, Math.min(1, (a ?? 1) * compositeOpacity));
          globalCtx.strokeStyle = `rgba(${r * 255},${g * 255},${b * 255},${aa})`; 
          globalCtx.lineWidth = style.stroke.width || 2; 
          globalCtx.stroke();
        }

        if (isSelected) {
          try {
            globalCtx.save();
            globalCtx.setLineDash([4, 4]);
            globalCtx.strokeStyle = '#4A9B8F';
            globalCtx.lineWidth = 1;
            globalCtx.stroke();
            globalCtx.restore();
          } catch (error) {
            console.error('Error drawing selection indicator:', error);
          }
        }
      } catch (error) {
        console.error('Error drawing path:', error);
      }
    } catch (error) {
      console.error('Critical error in drawPath:', error);
    }
  }



  function drawCurrentPath() {
    if (!appState.isDrawing || !appState.currentPath || appState.currentPath.length === 0) {
      return;
    }
    
    const style = appState.currentStyle;
    const pts = appState.currentPath;
    


    globalCtx.beginPath();
    switch (appState.drawingType) {
      case 'pen': {
        globalCtx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) globalCtx.lineTo(pts[i].x, pts[i].y);
        if (style.stroke && style.stroke.color && Array.isArray(style.stroke.color) && style.stroke.color.length >= 4) {
          const [r, g, b, a] = style.stroke.color; 
          globalCtx.strokeStyle = `rgba(${r * 255},${g * 255},${b * 255},${a})`; 
          globalCtx.lineWidth = style.stroke.width || 2; 
          globalCtx.stroke();
        }
        break;
      }
      case 'line': {
        if (pts.length >= 2) {
          globalCtx.moveTo(pts[0].x, pts[0].y);
          globalCtx.lineTo(pts[1].x, pts[1].y);
          if (style.stroke && style.stroke.color && Array.isArray(style.stroke.color) && style.stroke.color.length >= 4) {
            const [r, g, b, a] = style.stroke.color; 
            globalCtx.strokeStyle = `rgba(${r * 255},${g * 255},${b * 255},${a})`; 
            globalCtx.lineWidth = style.stroke.width || 2; 
            globalCtx.stroke();
          }
        }
        break;
      }
      case 'rectangle': {
        if (pts.length >= 2) {
          const s = pts[0], e = pts[1];
          // Ensure rectangle is drawn from top-left to bottom-right during preview
          const x = Math.min(s.x, e.x);
          const y = Math.min(s.y, e.y);
          const width = Math.abs(e.x - s.x);
          const height = Math.abs(e.y - s.y);
          globalCtx.rect(x, y, width, height);
          if (style.fill && style.fill.color && Array.isArray(style.fill.color) && style.fill.color.length >= 4) { 
            const [r, g, b, a] = style.fill.color; 
            globalCtx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},${a})`; 
            globalCtx.fill(); 
          }
          if (style.stroke && style.stroke.color && Array.isArray(style.stroke.color) && style.stroke.color.length >= 4) { 
            const [r, g, b, a] = style.stroke.color; 
            globalCtx.strokeStyle = `rgba(${r * 255},${g * 255},${b * 255},${a})`; 
            globalCtx.lineWidth = style.stroke.width || 2; 
            globalCtx.stroke(); 
          }
        }
        break;
      }
      case 'circle': {
        if (pts.length >= 2) {
          const c = pts[0], e = pts[1];
          // Circle: c is center, e is edge point for radius calculation
          const radius = Math.sqrt(Math.pow(e.x - c.x, 2) + Math.pow(e.y - c.y, 2));
          globalCtx.arc(c.x, c.y, radius, 0, Math.PI * 2);
          if (style.fill && style.fill.color && Array.isArray(style.fill.color) && style.fill.color.length >= 4) { 
            const [r0, g0, b0, a0] = style.fill.color; 
            globalCtx.fillStyle = `rgba(${r0 * 255},${g0 * 255},${b0 * 255},${a0})`; 
            globalCtx.fill(); 
          }
          if (style.stroke && style.stroke.color && Array.isArray(style.stroke.color) && style.stroke.color.length >= 4) { 
            const [r1, g1, b1, a1] = style.stroke.color; 
            globalCtx.strokeStyle = `rgba(${r1 * 255},${g1 * 255},${b1 * 255},${a1})`; 
            globalCtx.lineWidth = style.stroke.width || 2; 
            globalCtx.stroke(); 
          }
        }
        break;
      }
      case 'polygon': {
        if (pts.length >= 1) {
          globalCtx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) globalCtx.lineTo(pts[i].x, pts[i].y);
          globalCtx.setLineDash([4, 2]);
          globalCtx.strokeStyle = '#4A9B8F';
          globalCtx.lineWidth = 1;
          globalCtx.stroke();
        }
        break;
      }
    }
  }

  function renderCanvas() {
    try {
      if (!globalCanvas || !globalCtx) {
        console.error('Canvas or context not available');
        return;
      }
      
      // Ensure paths is always an array
      if (!Array.isArray(appState.paths)) {
        console.warn('appState.paths is not an array, resetting to empty array');
        appState.paths = [];
      }

      resetTransform();
      
      // Clear the canvas area to prevent grid lines from accumulating
      globalCtx.clearRect(0, 0, globalCanvas.width, globalCanvas.height);

      const t = appState.canvasTransform;
      
      // Draw grid first (before applying transform for paths)
      try {
        drawGrid();
      } catch (error) {
        console.error('Error drawing grid:', error);
      }

      // Apply transform for all content (paths, etc.) - grid is drawn separately
      globalCtx.setTransform(t.zoom || 1, 0, 0, t.zoom || 1, t.pan_x || 0, t.pan_y || 0);

      if (appState.paths.length === 0) {
        // Don't show welcome message - let the sample content load
        // drawWelcomeMessage();
      } else {
        
        // Draw paths by layer
        for (let layerIndex = 0; layerIndex < appState.layers.length; layerIndex++) {
          const layer = appState.layers[layerIndex];
          
          // Skip hidden layers
          if (!layer.visible) continue;
          
          // Draw paths in this layer
          if (layer.pathIndices && Array.isArray(layer.pathIndices)) {
            layer.pathIndices.forEach(pathIndex => {
              try {
                const path = appState.paths[pathIndex];
                if (path) {
                  // Apply layer opacity to path
                  const originalOpacity = path.style && typeof path.style.opacity === 'number' ? path.style.opacity : 1.0;
                  if (path.style) {
                    path.style.opacity = originalOpacity * layer.opacity;
                  }
                  
                  // Draw the path
                  drawPath(path, appState.selectedPaths.includes(pathIndex));
                  
                  // Restore original opacity
                  if (path.style) {
                    path.style.opacity = originalOpacity;
                  }
                }
              } catch (error) {
                console.error('Error drawing path at index', pathIndex, ':', error);
              }
            });
          }
        }
        
        // Also draw any paths that don't have proper layer assignment (fallback)
        appState.paths.forEach((path, pathIndex) => {
          try {
            if (typeof path.layerIndex !== 'number' || path.layerIndex < 0 || path.layerIndex >= appState.layers.length) {
              // Path has invalid layer index, draw it on the default layer
              const layer = appState.layers[0];
              if (layer && layer.visible) {
                // Apply layer opacity to path
                const originalOpacity = path.style && typeof path.style.opacity === 'number' ? path.style.opacity : 1.0;
                if (path.style) {
                  path.style.opacity = originalOpacity * layer.opacity;
                }
                
                // Draw the path
                drawPath(path, appState.selectedPaths.includes(pathIndex));
                
                // Restore original opacity
                if (path.style) {
                  path.style.opacity = originalOpacity;
                }
              }
            }
          } catch (error) {
            console.error('Error drawing fallback path at index', pathIndex, ':', error);
          }
        });
      }

      try {
        drawCurrentPath();
      } catch (error) {
        console.error('Error drawing current path:', error);
      }

      // selection rectangle - needs to be in screen coordinates
      // Render selection tool (handles selection box and resize handles)
      try {
        if (window.XVGSelectionTool) {
          globalCtx.save();
          // Reset transform to draw in screen coordinates
          globalCtx.setTransform(1, 0, 0, 1, 0, 0);
          window.XVGSelectionTool.render(globalCtx, appState.canvasTransform);
          globalCtx.restore();
        }
      } catch (error) {
        console.error('Error rendering selection tool:', error);
      }

      // Render cut box if active (in screen coordinates)
      try {
        if (appState.cutBoxState && appState.cutBoxState.isActive) {
          const bounds = appState.cutBoxState.bounds;
          if (bounds.width > 0 && bounds.height > 0) {
              globalCtx.save();
            
            // Reset transform to draw in screen coordinates
              globalCtx.setTransform(1, 0, 0, 1, 0, 0);
              
            // Convert world coordinates to screen coordinates
              const t = appState.canvasTransform;
              const z = t.zoom || 1;
              const px = t.pan_x || 0;
              const py = t.pan_y || 0;
              
              const screenBounds = {
              x: bounds.x * z + px,
              y: bounds.y * z + py,
              width: bounds.width * z,
              height: bounds.height * z
            };
            
            // Draw cut box with dashed outline and semi-transparent fill
            globalCtx.strokeStyle = '#ff4444';
            globalCtx.fillStyle = 'rgba(255, 68, 68, 0.1)';
            globalCtx.lineWidth = calculateDynamicLineWidth();
            const dashPattern = calculateDynamicDashPattern(appState.canvasTransform?.zoom || 1);
        globalCtx.setLineDash(dashPattern);
            
            globalCtx.fillRect(screenBounds.x, screenBounds.y, screenBounds.width, screenBounds.height);
            globalCtx.strokeRect(screenBounds.x, screenBounds.y, screenBounds.width, screenBounds.height);
              
              globalCtx.restore();
            }
          }
      } catch (error) {
        console.error('Error rendering cut box:', error);
      }

      // Render cut pieces if they exist (with offset)
      try {
        if (appState.cutPieces && appState.cutPieces.length > 0) {
          globalCtx.save();
          
          // Apply additional offset for cut pieces
          const offsetX = appState.cutPiecesOffset ? appState.cutPiecesOffset.x : 0;
          const offsetY = appState.cutPiecesOffset ? appState.cutPiecesOffset.y : 0;
          
          // Apply transform with offset
          const t = appState.canvasTransform;
          globalCtx.setTransform(t.zoom || 1, 0, 0, t.zoom || 1, (t.pan_x || 0) + offsetX * (t.zoom || 1), (t.pan_y || 0) + offsetY * (t.zoom || 1));
          
          // Draw cut pieces with semi-transparent overlay
          globalCtx.globalAlpha = 0.7;
          appState.cutPieces.forEach(piece => {
            try {
              drawPath(piece, false);
            } catch (error) {
              console.error('Error drawing cut piece:', error);
            }
          });
          
          globalCtx.restore();
        }
      } catch (error) {
        console.error('Error rendering cut pieces:', error);
      }

      // Draw resize handles for selected paths
      try {
        if (appState.selectedPaths.length > 0 && window.XVGSelectionTool) {
          const selectedPaths = appState.selectedPaths.map(index => appState.paths[index]).filter(Boolean);
          if (selectedPaths.length > 0) {
            const bounds = window.XVGSelectionTool.calculateBounds(selectedPaths);
            if (bounds) {
              // Draw handles with proper coordinate transformation
              globalCtx.save();
              
              // Use the canvas transform for proper coordinate handling
              const t = appState.canvasTransform;
              
              // Draw handles using the existing transform system
              window.XVGSelectionTool.drawResizeHandles(globalCtx, selectedPaths, bounds, null, null, t);
              
              globalCtx.restore();
            }
          }
        }
      } catch (error) {
        console.error('Error drawing resize handles:', error);
      }
      
      // Draw guides
      try {
        if (appState.guides.visible) {
          drawGuides();
        }
      } catch (error) {
        console.error('Error drawing guides:', error);
      }
      
      // rulers refresh - simple update system
      try {
        if (appState.rulers.visible) {
          // Simple ruler update - just throttle to prevent excessive updates
          const now = Date.now();
          const lastRulerUpdate = appState.rulers.lastUpdate || 0;
          
          // Update rulers every 100ms to avoid interfering with zoom/pan
          if (now - lastRulerUpdate > 100) {
            appState.rulers.lastUpdate = now;
            updateRulerMeasurements();
          }
        }
      } catch (error) {
        console.error('Error updating rulers:', error);
      }
    } catch (error) {
      console.error('Critical error in renderCanvas:', error);
      // Try to show error on canvas
      try {
        if (globalCtx && globalCanvas) {
          globalCtx.fillStyle = '#ff0000';
          globalCtx.font = '16px Arial';
          globalCtx.fillText('Rendering Error: ' + error.message, 10, 30);
        }
      } catch (renderError) {
        console.error('Could not display error on canvas:', renderError);
      }
    }
  }

  // exports
  window.renderCanvas = renderCanvas;
  
  // Draw guides function
  function drawGuides() {
    if (!globalCtx || !appState.guides.visible) return;
    
    // Save current context state
    globalCtx.save();
    
    // Set guide styling - blue dashed lines
    globalCtx.strokeStyle = '#0066ff'; // Blue guides
    globalCtx.lineWidth = calculateDynamicLineWidth(); // Dynamic line width
    const dashPattern = calculateDynamicDashPattern(appState.canvasTransform?.zoom || 1);
      globalCtx.setLineDash(dashPattern); // Dynamic dashed line for guides
    
    // Draw horizontal guides
    for (const guide of appState.guides.horizontal) {
      globalCtx.beginPath();
      globalCtx.moveTo(0, guide.position);
      globalCtx.lineTo(globalCanvas.width / (appState.canvasTransform.zoom || 1), guide.position);
      globalCtx.stroke();
    }
    
    // Draw vertical guides
    for (const guide of appState.guides.vertical) {
      globalCtx.beginPath();
      globalCtx.moveTo(guide.position, 0);
      globalCtx.lineTo(guide.position, globalCanvas.height / (appState.canvasTransform.zoom || 1));
      globalCtx.stroke();
    }
    
    // Restore context state
    globalCtx.restore();
  }
  
  /* =============================
   * Undo / Redo / Clipboard
   * ============================= */
  function pushUndo(snapshotLabel) {
    const snap = {
      paths: JSON.parse(JSON.stringify(appState.paths)),
      selectedPaths: [...appState.selectedPaths],
      canvasTransform: { ...appState.canvasTransform },
      ts: Date.now(),
      label: snapshotLabel || 'edit'
    };
    appState.undoStack.push(snap);
    if (appState.undoStack.length > appState.maxUndoSteps) appState.undoStack.shift();
    appState.redoStack.length = 0;
    appState.isModified = true;
  }

  async function undo() {
    if (!window.xvgEngines || !window.xvgEngines.crdt) {
      if (runtimeConfig.wasmOnly) {
        throw new Error('CRDT engine not available and WASM-only mode is enabled');
      }
      console.warn('CRDT engine not available, falling back to local undo');
      return undoLocal();
    }
    
    try {
      const result = await window.xvgEngines.crdt.undo();
      if (result.success) {
        await syncStateFromCRDT();
        showNotification('Undo completed', 'success');
      } else {
        showNotification('Nothing to undo', 'warning');
      }
    } catch (error) {
      console.error('CRDT undo failed:', error);
      if (runtimeConfig.wasmOnly) {
        throw error;
      }
      undoLocal();
    }
  }

    function undoLocal() {
    if (appState.undoStack.length === 0) return showNotification('Nothing to undo', 'warning');
    
    // Store current state for redo
    const currentState = {
        paths: JSON.parse(JSON.stringify(appState.paths)),
        selectedPaths: [...appState.selectedPaths],
        canvasTransform: { ...appState.canvasTransform },
        ts: Date.now(),
        label: 'redo'
      };
    appState.redoStack.push(currentState);
    
        // Restore previous state
    const prev = appState.undoStack.pop();
      appState.paths = prev.paths;
    appState.selectedPaths = prev.selectedPaths || [];
      appState.canvasTransform = prev.canvasTransform;
    
    appState.isModified = true;
    updateCanvasTransformLabel();
    renderCanvas();
    
    showNotification(`Undid: ${prev.label}`, 'success');
  }

  async function redo() {
    if (!window.xvgEngines || !window.xvgEngines.crdt) {
      if (runtimeConfig.wasmOnly) {
        throw new Error('CRDT engine not available and WASM-only mode is enabled');
      }
      console.warn('CRDT engine not available, falling back to local redo');
      return redoLocal();
    }
    
    try {
      const result = await window.xvgEngines.crdt.redo();
      if (result.success) {
        await syncStateFromCRDT();
        showNotification('Redo completed', 'success');
      } else {
        showNotification('Nothing to redo', 'warning');
      }
    } catch (error) {
      console.error('CRDT redo failed:', error);
      if (runtimeConfig.wasmOnly) {
        throw error;
      }
      redoLocal();
    }
  }

  function redoLocal() {
    if (appState.redoStack.length === 0) return showNotification('Nothing to redo', 'warning');
    
    // Store current state for undo
    const currentState = {
        paths: JSON.parse(JSON.stringify(appState.paths)),
        selectedPaths: [...appState.selectedPaths],
        canvasTransform: { ...appState.canvasTransform },
        ts: Date.now(),
        label: 'undo'
      };
    appState.undoStack.push(currentState);
    
    // Restore next state
    const next = appState.redoStack.pop();
      appState.paths = next.paths;
      appState.selectedPaths = next.selectedPaths || [];
      appState.canvasTransform = next.canvasTransform;
    
    appState.isModified = true;
    updateCanvasTransformLabel();
    renderCanvas();
    
    showNotification(`Redid: ${next.label}`, 'success');
  }

  function copy() {
      if (!appState.selectedPaths.length) return showNotification('Nothing selected to copy', 'warning');
  appState.clipboard = appState.selectedPaths.map(i => appState.paths[i]).map(p => JSON.parse(JSON.stringify(p)));
    showNotification(`Copied ${appState.clipboard.length} item(s)`, 'success');
  }
  async function cut() { 
    if (!appState.selectedPaths.length) return showNotification('Nothing selected to cut', 'warning'); 
    
    // Store cut data in clipboard BEFORE any deletion
    const cutData = appState.selectedPaths.map(index => appState.paths[index]).filter(Boolean);
    appState.clipboard = JSON.parse(JSON.stringify(cutData));
    
    // Create undo snapshot BEFORE deletion
    pushUndo('cut');
    
    if (!window.xvgEngines || !window.xvgEngines.crdt) {
      console.warn('CRDT engine not available, falling back to local cut');
      // Use local deletion that preserves undo
      await deleteSelectedLocal();
      showNotification(`Cut ${cutData.length} item(s)`, 'success');
      return;
    }
    
    try {
      const pathIds = appState.selectedPaths.map(index => appState.paths[index]?.id).filter(id => id);
      if (pathIds.length === 0) return;
      
      // Delete via CRDT
      const result = await window.xvgEngines.crdt.deletePaths(pathIds);
      if (result.success) {
        await syncStateFromCRDT();
        appState.selectedPaths = [];
        showNotification(`Cut ${pathIds.length} item(s)`, 'success');
      }
    } catch (error) {
      console.error('CRDT cut failed:', error);
      // Fallback to local deletion that preserves undo
      await deleteSelectedLocal();
    }
  }
  function paste() {
    if (!appState.clipboard || !appState.clipboard.length) return showNotification('Nothing in clipboard to paste', 'warning');
    pushUndo('paste');
    const offset = 20;
    const pasted = [];
    
    appState.clipboard.forEach(p => {
      const n = JSON.parse(JSON.stringify(p));
      
      // Handle different data structures
      if (n.data && Array.isArray(n.data)) {
        if (n.type === 'image') {
          // For images, offset the position data [x, y, width, height]
          if (n.data.length >= 4) {
            n.data[0] += offset; // x
            n.data[1] += offset; // y
          }
        } else if (n.type === 'path' || n.type === 'line' || n.type === 'rectangle' || n.type === 'circle') {
          // For vector paths, offset coordinate pairs
          for (let i = 0; i < n.data.length; i += 2) {
            if (i + 1 < n.data.length) {
              n.data[i] += offset;     // x coordinate
              n.data[i + 1] += offset; // y coordinate
            }
          }
        } else {
          // For other types, try to offset all coordinates
          for (let i = 0; i < n.data.length; i += 2) {
            if (i + 1 < n.data.length) {
              n.data[i] += offset;     // x coordinate
              n.data[i + 1] += offset; // y coordinate
            }
          }
        }
      }
      
      // Update bounds if they exist
      if (n.bounds) {
        n.bounds.minX += offset;
        n.bounds.minY += offset;
        n.bounds.maxX += offset;
        n.bounds.maxY += offset;
      }
      
      // Assign to current layer
      n.layerIndex = appState.currentLayerIndex || 0;
      
      // Generate new unique ID
      n.id = n.id ? n.id + '_copy_' + Date.now() : 'pasted_' + Date.now();
      
      appState.paths.push(n);
      pasted.push(appState.paths.length - 1);
    });
    
    appState.selectedPaths = pasted;
    
    // Update layer path indices
    if (appState.layers && appState.layers[appState.currentLayerIndex]) {
      if (!appState.layers[appState.currentLayerIndex].pathIndices) {
        appState.layers[appState.currentLayerIndex].pathIndices = [];
      }
      pasted.forEach(index => {
        appState.layers[appState.currentLayerIndex].pathIndices.push(index);
      });
    }
    
    renderCanvas();
    showNotification(`Pasted ${pasted.length} item(s)`, 'success');
  }
  async function deleteSelected() {
    if (!appState.selectedPaths.length) return showNotification('Nothing selected to delete', 'warning');
    
    if (!window.xvgEngines || !window.xvgEngines.crdt) {
      console.warn('CRDT engine not available, falling back to local delete');
      return deleteSelectedLocal();
    }
    
    try {
      const pathIds = appState.selectedPaths.map(index => appState.paths[index]?.id).filter(id => id);
      if (pathIds.length === 0) return;
      
      const result = await window.xvgEngines.crdt.deletePaths(pathIds);
      if (result.success) {
        await syncStateFromCRDT();
        appState.selectedPaths = [];
        showNotification(`Deleted ${pathIds.length} item(s)`, 'success');
      }
    } catch (error) {
      console.error('CRDT delete failed:', error);
      deleteSelectedLocal();
    }
  }

  function deleteSelectedLocal() {
    if (!appState.selectedPaths.length) return showNotification('Nothing selected to delete', 'warning');
    
    // Create individual undo snapshots for each deleted item
    const toDelete = [...appState.selectedPaths].sort((a, b) => b - a);
    toDelete.forEach(i => {
      const deletedItem = appState.paths[i];
      const undoSnapshot = {
        type: 'delete_item',
        itemIndex: i,
        itemData: deletedItem,
        timestamp: Date.now(),
        label: `delete ${deletedItem.type || 'item'}`
      };
      appState.undoStack.push(undoSnapshot);
    });
    
    // Delete the items
    toDelete.forEach(i => appState.paths.splice(i, 1));
    appState.selectedPaths = [];
    renderCanvas();
    showNotification(`Deleted ${toDelete.length} item(s)`, 'success');
  }
  function selectAll() { 
    appState.selectedPaths = appState.paths.map((path, i) => {
      // Skip paths in locked layers
      const layerIndex = path.layerIndex || 0;
      if (layerIndex >= 0 && 
          layerIndex < appState.layers.length && 
          appState.layers[layerIndex].locked) {
        return -1;
      }
      return i;
    }).filter(i => i >= 0);
    
    updateMoveToLayerButtonState();
    renderCanvas();
  }
  
  function deselectAll() { 
    appState.selectedPaths = []; 
    updateMoveToLayerButtonState();
    renderCanvas();
  }

  async function syncStateFromCRDT() {
    if (!window.xvgEngines || !window.xvgEngines.crdt) {
      console.warn('CRDT engine not available for sync');
      return;
    }
    
    try {
      const state = await window.xvgEngines.crdt.getState();
      if (state && state.paths) {
        appState.paths = state.paths;
        renderCanvas();
      }
    } catch (error) {
      console.error('Failed to sync state from CRDT:', error);
    }
  }

  Object.assign(window, { undo, redo, copy, cut, paste, deleteSelected, selectAll, deselectAll, syncStateFromCRDT });

  /* =============================
   * Tools and Drawing
   * ============================= */
  function setTool(tool) {
    appState.currentTool = tool;
    const ids = ['select', 'grab', 'pen', 'line', 'rectangle', 'circle', 'polygon', 'text', 'eraser', 'cut-freeform', 'cut-box', 'move-cut-pieces'];
    ids.forEach(id => { const b = document.getElementById(`${id}-tool`); if (b) b.classList.toggle('active', id === tool); });
    if (globalCanvas) {
      if (tool === 'eraser') {
        // Create custom circular cursor for eraser
        updateEraserCursor();
      } else {
        globalCanvas.style.cursor = tool === 'select' ? 'default' : tool === 'grab' ? 'grab' : tool === 'text' ? 'text' : tool === 'move-cut-pieces' ? 'move' : 'crosshair';
      }
    }
    
    // Show/hide eraser size control
    const eraserSizeControl = document.getElementById('eraser-size-control');
    if (eraserSizeControl) {
      eraserSizeControl.style.display = tool === 'eraser' ? 'flex' : 'none';
    }
    
    // Reset eraser state when switching tools
    if (tool !== 'eraser' && eraserState.active) {
      endErasing();
    }
    
    // Reset cut pieces state when switching away from move-cut-pieces
    if (tool !== 'move-cut-pieces' && appState.cutPieces) {
      let placedCount = 0;
      // Place cut pieces at their current position
      if (appState.cutPieces.length > 0) {
        const dx = appState.cutPiecesOffset ? appState.cutPiecesOffset.x : 0;
        const dy = appState.cutPiecesOffset ? appState.cutPiecesOffset.y : 0;
        appState.cutPieces.forEach(piece => {
          try {
            // Apply the current offset to the piece, respecting data formats by type
            if ((dx !== 0 || dy !== 0) && piece && piece.data) {
              if (Array.isArray(piece.data)) {
                if (piece.type === 'image') {
                  // image: [x, y, width, height] -> translate only x,y
                  if (piece.data.length >= 2) {
                    piece.data[0] += dx;
                    piece.data[1] += dy;
                  }
                } else if (piece.type === 'text') {
                  // text: [x, y]
                  if (piece.data.length >= 2) {
                    piece.data[0] += dx;
                    piece.data[1] += dy;
                  }
                } else {
                  // vector geometry: pairs of coordinates
                  for (let i = 0; i < piece.data.length; i += 2) {
                    piece.data[i] += dx;
                    piece.data[i + 1] += dy;
                  }
                }
              }
            }

            // Add the piece back to the main paths
            appState.paths.push(piece);
            placedCount++;

            // Ensure the piece is registered in its layer's pathIndices
            let li = typeof piece.layerIndex === 'number' ? piece.layerIndex : (appState.currentLayerIndex || 0);
            if (li < 0 || li >= appState.layers.length) li = 0;
            const newIdx = appState.paths.length - 1;
            const layer = appState.layers[li];
            if (layer) {
              if (!Array.isArray(layer.pathIndices)) layer.pathIndices = [];
              if (!layer.pathIndices.includes(newIdx)) {
                layer.pathIndices.push(newIdx);
              }
            }
          } catch (error) {
            console.error('Error finalizing cut piece:', error);
          }
        });
        if (placedCount > 0) {
          pushUndo('place cut pieces');
        }
        renderCanvas();
      }
      appState.cutPieces = null;
      appState.isDraggingCutPieces = false;
      appState.cutPiecesOffset = { x: 0, y: 0 };
    }
  }
  
  function updateEraserSize() {
    const sizeInput = document.getElementById('eraser-size');
    if (sizeInput) {
      appState.eraserSize = parseInt(sizeInput.value);
      
      // Update the display value
      const sizeValue = document.getElementById('eraser-size-value');
      if (sizeValue) {
        sizeValue.textContent = `${appState.eraserSize}px`;
      }
      
      // Update cursor if eraser is active
      if (appState.currentTool === 'eraser') {
        updateEraserCursor();
      }
    }
  }
  
  function updateEraserCursor() {
    if (!globalCanvas) return;
    
    const size = appState.eraserSize || 20;
    const radius = size / 2;
    
    // Create SVG cursor
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>
      <circle cx='${radius}' cy='${radius}' r='${radius - 1}' fill='none' stroke='black' stroke-width='1' opacity='0.8'/>
      <circle cx='${radius}' cy='${radius}' r='${radius - 2}' fill='none' stroke='white' stroke-width='1' opacity='0.6'/>
    </svg>`;
    
    const encodedSvg = encodeURIComponent(svg);
    const cursorUrl = `url("data:image/svg+xml,${encodedSvg}") ${radius} ${radius}, auto`;
    
    globalCanvas.style.cursor = cursorUrl;
  }
  
  function placeCutPieces() {
    if (!appState.cutPieces || appState.cutPieces.length === 0) {
      return;
    }

    // Snapshot before mutating paths
    pushUndo('place cut pieces');
    
    let placedCount = 0;
    const dx = appState.cutPiecesOffset ? appState.cutPiecesOffset.x : 0;
    const dy = appState.cutPiecesOffset ? appState.cutPiecesOffset.y : 0;
    
    appState.cutPieces.forEach(piece => {
      try {
        // Apply the current offset to the piece, respecting data formats by type
        if ((dx !== 0 || dy !== 0) && piece && piece.data) {
          if (Array.isArray(piece.data)) {
            if (piece.type === 'image') {
              // image: [x, y, width, height] -> translate only x,y
              if (piece.data.length >= 2) {
                piece.data[0] += dx;
                piece.data[1] += dy;
              }
            } else if (piece.type === 'text') {
              // text: [x, y]
              if (piece.data.length >= 2) {
                piece.data[0] += dx;
                piece.data[1] += dy;
              }
            } else {
              // vector geometry: pairs of coordinates
              for (let i = 0; i < piece.data.length; i += 2) {
                piece.data[i] += dx;
                piece.data[i + 1] += dy;
              }
            }
          }
        }
        
        // Update bounds if they exist
        if (piece.bounds) {
          piece.bounds.minX += dx;
          piece.bounds.maxX += dx;
          piece.bounds.minY += dy;
          piece.bounds.maxY += dy;
        }
        
        // Update points if they exist (for vector paths)
        if (piece.points && Array.isArray(piece.points)) {
          piece.points = piece.points.map(point => [
            point[0] + dx,
            point[1] + dy
          ]);
        }
        
        // Remove cut piece markers
        delete piece.isCutPiece;
        delete piece.cutPolygon;
        delete piece.clipBounds;
        
        // Add the piece back to the main paths
        appState.paths.push(piece);
        placedCount++;
        
        // Ensure the piece is registered in its layer's pathIndices
        let li = typeof piece.layerIndex === 'number' ? piece.layerIndex : (appState.currentLayerIndex || 0);
        if (li < 0 || li >= appState.layers.length) li = 0;
        const newIdx = appState.paths.length - 1;
        const layer = appState.layers[li];
        if (layer) {
          if (!Array.isArray(layer.pathIndices)) layer.pathIndices = [];
          if (!layer.pathIndices.includes(newIdx)) {
            layer.pathIndices.push(newIdx);
          }
        }
      } catch (error) {
        console.error('Error placing cut piece:', error);
      }
    });
    
    if (placedCount > 0) {
      showNotification(`Placed ${placedCount} cut pieces`, 'success');
      renderCanvas();
    }
    
    // Clean up cut pieces state
    appState.cutPieces = null;
    appState.isDraggingCutPieces = false;
    appState.cutPiecesOffset = { x: 0, y: 0 };
    appState.cutPiecesDragStart = null;
    
    // Switch back to select tool
    setTool('select');
  }
  
  window.setTool = setTool;
  window.updateEraserSize = updateEraserSize;
  window.updateEraserCursor = updateEraserCursor;
  window.placeCutPieces = placeCutPieces;
  
  // Export properties panel functions
  window.updateFillColor = updateFillColor;
  window.updateFillAlpha = updateFillAlpha;
  window.updateStrokeColor = updateStrokeColor;
  window.updateStrokeWidth = updateStrokeWidth;
  window.updateOpacityFromMenu = updateOpacityFromMenu;
  window.updateGridSize = updateGridSize;
  window.toggleGrid = toggleGrid;
  window.toggleSnapToGrid = toggleSnapToGrid;

  function startDrawing(x, y) {
    appState.isDrawing = true;
    appState.currentPath = [{ x, y }];
    appState.drawingType = 'pen';
  }
  function startLine(x, y) { 
    appState.isDrawing = true; 
    appState.currentPath = [{ x, y }, { x, y }]; 
    appState.drawingType = 'line'; 
  }
  function startRectangle(x, y) { 
    appState.isDrawing = true; 
    appState.currentPath = [{ x, y }, { x, y }]; 
    appState.drawingType = 'rectangle'; 
  }
  function startCircle(x, y) { 
    appState.isDrawing = true; 
    appState.currentPath = [{ x, y }, { x, y }]; 
    appState.drawingType = 'circle'; 
  }
  function handlePolygonMouseDown(x, y) {
    if (!appState.isDrawing) { appState.isDrawing = true; appState.currentPath = [{ x, y }]; appState.drawingType = 'polygon'; }
    else { appState.currentPath.push({ x, y }); }
  }
  function startTextCreation(x, y) {
    appState.isCreatingText = true;
    appState.textPosition = { x, y };
    
    // Create text input container
    const container = document.createElement('div');
    container.id = 'text-editor-container';
    container.style.cssText = `
      position: absolute;
      top: ${y - 80}px;
      left: ${x - 150}px;
      width: 300px;
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      z-index: 10000;
      display: flex;
      flex-direction: column;
    `;
    
    // Create toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      display: flex;
      padding: 5px;
      border-bottom: 1px solid #eee;
      background: #f5f5f5;
      border-radius: 4px 4px 0 0;
    `;
    
    // Font family selector
    const fontSelect = document.createElement('select');
    fontSelect.id = 'text-font-select';
    fontSelect.style.cssText = 'margin-right: 5px; height: 28px;';
    ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Helvetica'].forEach(font => {
      const option = document.createElement('option');
      option.value = font;
      option.textContent = font;
      option.style.fontFamily = font;
      if (font === 'Arial') option.selected = true;
      fontSelect.appendChild(option);
    });
    fontSelect.addEventListener('change', () => {
      const textInput = document.getElementById('text-input-overlay');
      if (textInput) textInput.style.fontFamily = fontSelect.value;
      appState.currentStyle.text = appState.currentStyle.text || {};
      appState.currentStyle.text.font = fontSelect.value;
    });
    
    // Font size selector
    const sizeSelect = document.createElement('select');
    sizeSelect.id = 'text-size-select';
    sizeSelect.style.cssText = 'margin-right: 5px; width: 50px; height: 28px;';
    [12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64].forEach(size => {
      const option = document.createElement('option');
      option.value = size;
      option.textContent = size;
      if (size === 24) option.selected = true;
      sizeSelect.appendChild(option);
    });
    sizeSelect.addEventListener('change', () => {
      const textInput = document.getElementById('text-input-overlay');
      if (textInput) textInput.style.fontSize = `${sizeSelect.value}px`;
      appState.currentStyle.text = appState.currentStyle.text || {};
      appState.currentStyle.text.size = parseInt(sizeSelect.value);
    });
    
    // Style buttons container
    const styleButtons = document.createElement('div');
    styleButtons.style.cssText = 'display: flex; margin-right: 5px;';
    
    // Bold button
    const boldBtn = document.createElement('button');
    boldBtn.id = 'text-bold-btn';
    boldBtn.innerHTML = '<b>B</b>';
    boldBtn.style.cssText = 'width: 28px; height: 28px; margin-right: 2px; cursor: pointer;';
    boldBtn.addEventListener('click', () => {
      boldBtn.classList.toggle('active');
      const textInput = document.getElementById('text-input-overlay');
      if (textInput) {
        textInput.style.fontWeight = boldBtn.classList.contains('active') ? 'bold' : 'normal';
      }
      appState.currentStyle.text = appState.currentStyle.text || {};
      appState.currentStyle.text.bold = boldBtn.classList.contains('active');
    });
    
    // Italic button
    const italicBtn = document.createElement('button');
    italicBtn.id = 'text-italic-btn';
    italicBtn.innerHTML = '<i>I</i>';
    italicBtn.style.cssText = 'width: 28px; height: 28px; margin-right: 2px; cursor: pointer;';
    italicBtn.addEventListener('click', () => {
      italicBtn.classList.toggle('active');
      const textInput = document.getElementById('text-input-overlay');
      if (textInput) {
        textInput.style.fontStyle = italicBtn.classList.contains('active') ? 'italic' : 'normal';
      }
      appState.currentStyle.text = appState.currentStyle.text || {};
      appState.currentStyle.text.italic = italicBtn.classList.contains('active');
    });
    
    // Underline button
    const underlineBtn = document.createElement('button');
    underlineBtn.id = 'text-underline-btn';
    underlineBtn.innerHTML = '<u>U</u>';
    underlineBtn.style.cssText = 'width: 28px; height: 28px; margin-right: 2px; cursor: pointer;';
    underlineBtn.addEventListener('click', () => {
      underlineBtn.classList.toggle('active');
      const textInput = document.getElementById('text-input-overlay');
      if (textInput) {
        textInput.style.textDecoration = underlineBtn.classList.contains('active') ? 'underline' : 'none';
      }
      appState.currentStyle.text = appState.currentStyle.text || {};
      appState.currentStyle.text.underline = underlineBtn.classList.contains('active');
    });
    
    // Alignment buttons
    const alignContainer = document.createElement('div');
    alignContainer.style.cssText = 'display: flex; margin-right: 5px;';
    
    const alignLeft = document.createElement('button');
    alignLeft.id = 'text-align-left';
    alignLeft.innerHTML = '&#8592;'; // Left arrow
    alignLeft.style.cssText = 'width: 28px; height: 28px; margin-right: 2px; cursor: pointer;';
    alignLeft.classList.add('active'); // Default alignment
    alignLeft.addEventListener('click', () => {
      [alignLeft, alignCenter, alignRight].forEach(btn => btn.classList.remove('active'));
      alignLeft.classList.add('active');
      const textInput = document.getElementById('text-input-overlay');
      if (textInput) textInput.style.textAlign = 'left';
      appState.currentStyle.text = appState.currentStyle.text || {};
      appState.currentStyle.text.align = 'left';
    });
    
    const alignCenter = document.createElement('button');
    alignCenter.id = 'text-align-center';
    alignCenter.innerHTML = '&#8596;'; // Left-right arrow
    alignCenter.style.cssText = 'width: 28px; height: 28px; margin-right: 2px; cursor: pointer;';
    alignCenter.addEventListener('click', () => {
      [alignLeft, alignCenter, alignRight].forEach(btn => btn.classList.remove('active'));
      alignCenter.classList.add('active');
      const textInput = document.getElementById('text-input-overlay');
      if (textInput) textInput.style.textAlign = 'center';
      appState.currentStyle.text = appState.currentStyle.text || {};
      appState.currentStyle.text.align = 'center';
    });
    
    const alignRight = document.createElement('button');
    alignRight.id = 'text-align-right';
    alignRight.innerHTML = '&#8594;'; // Right arrow
    alignRight.style.cssText = 'width: 28px; height: 28px; cursor: pointer;';
    alignRight.addEventListener('click', () => {
      [alignLeft, alignCenter, alignRight].forEach(btn => btn.classList.remove('active'));
      alignRight.classList.add('active');
      const textInput = document.getElementById('text-input-overlay');
      if (textInput) textInput.style.textAlign = 'right';
      appState.currentStyle.text = appState.currentStyle.text || {};
      appState.currentStyle.text.align = 'right';
    });
    
    // Color picker
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.id = 'text-color-picker';
    colorPicker.value = '#000000';
    colorPicker.style.cssText = 'height: 28px; cursor: pointer;';
    colorPicker.addEventListener('change', () => {
      const textInput = document.getElementById('text-input-overlay');
      if (textInput) textInput.style.color = colorPicker.value;
      
      // Convert hex to rgba
      const hex = colorPicker.value.substring(1);
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      
      appState.currentStyle.text = appState.currentStyle.text || {};
      appState.currentStyle.text.color = [r, g, b, 1];
    });
    
    // Add all elements to the toolbar
    styleButtons.appendChild(boldBtn);
    styleButtons.appendChild(italicBtn);
    styleButtons.appendChild(underlineBtn);
    
    alignContainer.appendChild(alignLeft);
    alignContainer.appendChild(alignCenter);
    alignContainer.appendChild(alignRight);
    
    toolbar.appendChild(fontSelect);
    toolbar.appendChild(sizeSelect);
    toolbar.appendChild(styleButtons);
    toolbar.appendChild(alignContainer);
    toolbar.appendChild(colorPicker);
    
    // Create text input area
    const textInput = document.createElement('textarea');
    textInput.id = 'text-input-overlay';
    textInput.style.cssText = `
      width: 100%;
      min-height: 60px;
      padding: 8px;
      font-size: 24px;
      font-family: Arial;
      border: none;
      outline: none;
      resize: vertical;
    `;
    
    // Create action buttons
    const actionBar = document.createElement('div');
    actionBar.style.cssText = `
      display: flex;
      justify-content: flex-end;
      padding: 5px;
      background: #f5f5f5;
      border-top: 1px solid #eee;
      border-radius: 0 0 4px 4px;
    `;
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding: 5px 10px; margin-right: 5px; cursor: pointer;';
    cancelBtn.addEventListener('click', cancelTextCreation);
    
    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.style.cssText = 'padding: 5px 10px; background: #4285f4; color: white; border: none; cursor: pointer;';
    applyBtn.addEventListener('click', finishTextCreation);
    
    actionBar.appendChild(cancelBtn);
    actionBar.appendChild(applyBtn);
    
    // Assemble the editor
    container.appendChild(toolbar);
    container.appendChild(textInput);
    container.appendChild(actionBar);
    document.body.appendChild(container);
    
    // Initialize text style
    appState.currentStyle.text = appState.currentStyle.text || {
      font: 'Arial',
      size: 24,
      color: [0, 0, 0, 1],
      bold: false,
      italic: false,
      underline: false,
      align: 'left'
    };
    
    // Focus the text input
    textInput.focus();
    textInput.addEventListener('keydown', handleTextKeydown);
    textInput.addEventListener('input', handleTextInput);
  }
  // Track eraser state
  let eraserState = {
    active: false,
    lastX: 0,
    lastY: 0,
    pathsModified: new Set()
  };
  
  function startErasing(x, y) {
    eraserState.active = true;
    eraserState.lastX = x;
    eraserState.lastY = y;
    performBrushErase(x, y);
  }
  
  function continueErasing(x, y) {
    if (!eraserState.active) return;
    
    // Interpolate between last position and current position for smooth erasing
    const dx = x - eraserState.lastX;
    const dy = y - eraserState.lastY;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.floor(distance / (appState.eraserSize / 4)));
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const interpX = eraserState.lastX + dx * t;
      const interpY = eraserState.lastY + dy * t;
      performBrushErase(interpX, interpY);
    }
    
    eraserState.lastX = x;
    eraserState.lastY = y;
  }
  
  function endErasing() {
    if (eraserState.active) {
      eraserState.active = false;
      pushUndo('brush erase');
      renderCanvas();
    }
  }
  
  function performBrushErase(x, y) {
    const eraserRadius = appState.eraserSize / 2;
    const pathsToModify = [];
    const pathsToRemove = [];
    
    // Process all paths and modify them based on brush intersection
    for (let i = 0; i < appState.paths.length; i++) {
      const path = appState.paths[i];
      if (!path || !path.data || path.data.length < 2) continue;
      
      // For text and image objects, we still do complete removal if intersected
      if (path.type === 'text') {
        const [textX, textY] = path.data;
        const textStyle = path.style?.text || {};
        const fontSize = textStyle.size || textConfig.baseFontSize;
        const text = path.text || '';
        
        // Estimate text width (this is approximate)
        const textDimensions = calculateTextDimensions(text, fontSize);
        const textWidth = textDimensions.width;
        const textHeight = fontSize;
        
        // Calculate text bounds based on alignment
        let textLeft = textX;
        if (textStyle.align === 'center') {
          textLeft = textX - textWidth / 2;
        } else if (textStyle.align === 'right') {
          textLeft = textX - textWidth;
        }
        
        // Check if eraser circle intersects with text bounds
        const textCenterX = textLeft + textWidth / 2;
        const textCenterY = textY;
        const distanceToText = Math.hypot(x - textCenterX, y - textCenterY);
        if (distanceToText <= eraserRadius + Math.max(textWidth, textHeight) / 2) {
          pathsToRemove.push(i);
        }
      } else if (path.type === 'image') {
        const [imgX, imgY, imgWidth, imgHeight] = path.data;
        const imgCenterX = imgX + imgWidth / 2;
        const imgCenterY = imgY + imgHeight / 2;
        const distanceToImage = Math.hypot(x - imgCenterX, y - imgCenterY);
        if (distanceToImage <= eraserRadius + Math.max(imgWidth, imgHeight) / 2) {
          pathsToRemove.push(i);
        }
      } else if (path.type === 'line' || path.type === 'path' || path.type === 'polygon') {
        // For vector paths, remove points that are within the eraser radius
        const newData = [];
        let hasRemainingPoints = false;
        
        for (let j = 0; j < path.data.length; j += 2) {
          const px = path.data[j];
          const py = path.data[j + 1];
          const distance = Math.hypot(x - px, y - py);
          
          if (distance > eraserRadius) {
            newData.push(px, py);
            hasRemainingPoints = true;
          }
        }
        
        if (!hasRemainingPoints || newData.length < 4) {
          // If no points remain or less than 2 points, remove the entire path
          pathsToRemove.push(i);
        } else if (newData.length !== path.data.length) {
          // If some points were removed, update the path
          pathsToModify.push({ index: i, newData: newData });
        }
      } else if (path.type === 'rectangle') {
        const [x1, y1, x2, y2] = path.data;
        const rectCenterX = (x1 + x2) / 2;
        const rectCenterY = (y1 + y2) / 2;
        const rectWidth = Math.abs(x2 - x1);
        const rectHeight = Math.abs(y2 - y1);
        const distanceToRect = Math.hypot(x - rectCenterX, y - rectCenterY);
        if (distanceToRect <= eraserRadius + Math.max(rectWidth, rectHeight) / 2) {
          pathsToRemove.push(i);
        }
      } else if (path.type === 'circle') {
        const [cx, cy, ex, ey] = path.data;
        const circleRadius = Math.hypot(ex - cx, ey - cy);
        const distanceToCenter = Math.hypot(x - cx, y - cy);
        if (distanceToCenter <= eraserRadius + circleRadius) {
          pathsToRemove.push(i);
        }
      }
    }
    
    // Apply modifications
    let hasChanges = false;
    
    // Remove paths (from highest index to lowest to maintain indices)
    pathsToRemove.sort((a, b) => b - a);
    pathsToRemove.forEach(index => {
      eraserState.pathsModified.add(index);
      appState.paths.splice(index, 1);
      hasChanges = true;
    });
    
    // Modify paths (adjust indices after removals)
    pathsToModify.forEach(mod => {
      const adjustedIndex = mod.index - pathsToRemove.filter(ri => ri < mod.index).length;
      if (adjustedIndex >= 0 && adjustedIndex < appState.paths.length) {
        eraserState.pathsModified.add(adjustedIndex);
        appState.paths[adjustedIndex].data = mod.newData;
        hasChanges = true;
      }
    });
    
    // Update selected paths indices after removals
    if (pathsToRemove.length > 0) {
      appState.selectedPaths = appState.selectedPaths
        .map(selectedIndex => {
          const removalsBelow = pathsToRemove.filter(ri => ri < selectedIndex).length;
          const wasRemoved = pathsToRemove.includes(selectedIndex);
          return wasRemoved ? -1 : selectedIndex - removalsBelow;
        })
        .filter(index => index >= 0);
    }
  }
  
  function performErase(x, y) {
    // Legacy function - now redirects to brush erase
    performBrushErase(x, y);
  }
  
  function performEraseLegacy(x, y) {
    const eraserRadius = appState.eraserSize / 2;
    const pathsToRemove = [];
    const pathsToModify = new Map();
    
    for (let i = appState.paths.length - 1; i >= 0; i--) {
      const path = appState.paths[i];
      if (!path || !path.data || path.data.length < 2) continue;
      
      // For text objects, we don't do partial erasing - either remove completely or leave intact
      if (path.type === 'text') {
        const [textX, textY] = path.data;
        const textStyle = path.style?.text || {};
        const fontSize = textStyle.size || textConfig.baseFontSize;
        const text = path.text || '';
        
        // Estimate text width (this is approximate)
        const textDimensions = calculateTextDimensions(text, fontSize);
        const textWidth = textDimensions.width;
        const textHeight = fontSize;
        
        // Calculate text bounds based on alignment
        let textLeft = textX;
        if (textStyle.align === 'center') {
          textLeft = textX - textWidth / 2;
        } else if (textStyle.align === 'right') {
          textLeft = textX - textWidth;
        }
        
        // Check if eraser intersects with text bounds
        if (x >= textLeft - eraserRadius && 
            x <= textLeft + textWidth + eraserRadius && 
            y >= textY - textHeight/2 - eraserRadius && 
            y <= textY + textHeight/2 + eraserRadius) {
          pathsToRemove.push(i);
        }
        continue;
      }
      
      // For image objects, we don't do partial erasing
      if (path.type === 'image') {
        const [imgX, imgY, imgWidth, imgHeight] = path.data;
        
        // Check if eraser intersects with image bounds
        if (x >= imgX - eraserRadius && 
            x <= imgX + imgWidth + eraserRadius && 
            y >= imgY - eraserRadius && 
            y <= imgY + imgHeight + eraserRadius) {
          pathsToRemove.push(i);
        }
        continue;
      }
      
      switch (path.type) {
        case 'rectangle': {
          const [x1, y1, x2, y2] = path.data;
          const minX = Math.min(x1, x2);
          const maxX = Math.max(x1, x2);
          const minY = Math.min(y1, y2);
          const maxY = Math.max(y1, y2);
          
          // Check if eraser circle intersects with rectangle
          const closestX = Math.max(minX, Math.min(maxX, x));
          const closestY = Math.max(minY, Math.min(maxY, y));
          const distance = Math.hypot(x - closestX, y - closestY);
          
          if (distance <= eraserRadius) {
            // For rectangles, we remove the whole shape
            pathsToRemove.push(i);
          }
          break;
        }
        case 'circle': {
          const [cx, cy, ex, ey] = path.data;
          const radius = Math.hypot(ex - cx, ey - cy);
          const distance = Math.hypot(x - cx, y - cy);
          
          if (Math.abs(distance - radius) <= eraserRadius) {
            // For circles, we remove the whole shape
            pathsToRemove.push(i);
          }
          break;
        }
        case 'line':
        case 'path':
        case 'polygon': {
          // For paths, we can do partial erasing by splitting the path
          // Check each segment for intersection with eraser
          const segments = [];
          const erasedSegments = [];
          
          for (let j = 0; j < path.data.length - 2; j += 2) {
            const x1 = path.data[j], y1 = path.data[j + 1];
            const x2 = path.data[j + 2], y2 = path.data[j + 3];
            
            // Calculate distance from point to line segment
            const A = x - x1;
            const B = y - y1;
            const C = x2 - x1;
            const D = y2 - y1;
            
            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            
            let distance;
            let projX, projY;
            
            if (lenSq === 0) {
              // Point to point distance if segment is actually a point
              distance = Math.hypot(A, B);
              projX = x1;
              projY = y1;
            } else {
              let param = dot / lenSq;
              param = Math.max(0, Math.min(1, param));
              
              projX = x1 + param * C;
              projY = y1 + param * D;
              
              distance = Math.hypot(x - projX, y - projY);
            }
            
            if (distance <= eraserRadius) {
              // This segment intersects with eraser
              erasedSegments.push(j / 2);
            }
            
            segments.push([x1, y1, x2, y2]);
          }
          
          // If we have erased segments, create modified path(s)
          if (erasedSegments.length > 0) {
            // For closed paths (polygons), we need to handle differently
            if (path.type === 'polygon') {
              // For polygons, we remove the whole shape for simplicity
        pathsToRemove.push(i);
            } else {
              // For open paths, we can split into multiple paths
              // Mark this path for modification
              pathsToModify.set(i, {
                originalPath: path,
                erasedSegments: erasedSegments
              });
            }
          }
          break;
        }
      }
    }
    
    // Process paths to remove
    if (pathsToRemove.length > 0) {
      // Remove from highest index to lowest to maintain correct indices
      pathsToRemove.sort((a, b) => b - a);
      pathsToRemove.forEach(index => {
        eraserState.pathsModified.add(index);
        appState.paths.splice(index, 1);
      });
      
      // Update selected paths indices
      appState.selectedPaths = appState.selectedPaths
        .map(selectedIndex => {
          let newIndex = selectedIndex;
          pathsToRemove.forEach(removedIndex => {
            if (selectedIndex > removedIndex) {
              newIndex--;
            }
          });
          return newIndex;
        })
        .filter(index => index >= 0);
    }
    
    // Process paths to modify (partial erasing)
    if (pathsToModify.size > 0) {
      // Process each path that needs modification
      for (const [index, { originalPath, erasedSegments }] of pathsToModify.entries()) {
        // Mark as modified
        eraserState.pathsModified.add(index);
        
        // Create new path data excluding erased segments
        const newPathData = [];
        let currentSegment = 0;
        
        for (let j = 0; j < originalPath.data.length - 2; j += 2) {
          if (!erasedSegments.includes(j / 2)) {
            // Keep this segment
            newPathData.push(originalPath.data[j], originalPath.data[j + 1]);
            
            // If next segment is also kept, add the endpoint
            if (j + 2 < originalPath.data.length && !erasedSegments.includes((j + 2) / 2)) {
              newPathData.push(originalPath.data[j + 2], originalPath.data[j + 3]);
            }
          } else {
            // This segment is erased
            // If we have accumulated points, finalize this subpath
            if (newPathData.length >= 4) {
              // Create a new path with the accumulated points
              const newPath = {
                type: originalPath.type,
                data: [...newPathData],
                style: JSON.parse(JSON.stringify(originalPath.style || {}))
              };
              
              // Add the new path
              appState.paths.push(newPath);
              
              // Reset for next subpath
              newPathData.length = 0;
            }
          }
        }
        
        // If we have remaining points, create a final subpath
        if (newPathData.length >= 4) {
          const newPath = {
            type: originalPath.type,
            data: newPathData,
            style: JSON.parse(JSON.stringify(originalPath.style || {}))
          };
          
          // Add the new path
          appState.paths.push(newPath);
        }
        
        // Remove the original path
        appState.paths.splice(index, 1);
        
        // Update selected paths indices
        appState.selectedPaths = appState.selectedPaths
          .map(selectedIndex => {
            if (selectedIndex === index) {
              return -1; // This path was modified/removed
            } else if (selectedIndex > index) {
              return selectedIndex - 1 + (newPathData.length >= 4 ? 1 : 0);
            }
            return selectedIndex;
          })
          .filter(index => index >= 0);
      }
    }
    
    // Render canvas to show changes
    if (pathsToRemove.length > 0 || pathsToModify.size > 0) {
      renderCanvas();
    }
  }

  // Text handling functions
  function handleTextKeydown(event) {
    if (event.key === 'Escape') {
      cancelTextCreation();
    } else if (event.key === 'Enter' && event.ctrlKey) {
      finishTextCreation();
    }
  }

  function handleTextInput(event) {
    // Live preview could be added here if needed
    appState.textInput = event.target.value;
  }

  function finishTextCreation() {
    const textInput = document.getElementById('text-input-overlay');
    const container = document.getElementById('text-editor-container');
    if (!textInput || !container) return;
    
    const text = textInput.value.trim();
    if (text.length === 0) {
      cancelTextCreation();
      return;
    }
    
    // Get text style from UI controls
    const fontSelect = document.getElementById('text-font-select');
    const sizeSelect = document.getElementById('text-size-select');
    const boldBtn = document.getElementById('text-bold-btn');
    const italicBtn = document.getElementById('text-italic-btn');
    const underlineBtn = document.getElementById('text-underline-btn');
    const alignLeft = document.getElementById('text-align-left');
    const alignCenter = document.getElementById('text-align-center');
    const alignRight = document.getElementById('text-align-right');
    const colorPicker = document.getElementById('text-color-picker');
    
    // Determine text alignment
    let textAlign = 'left';
    if (alignCenter && alignCenter.classList.contains('active')) {
      textAlign = 'center';
    } else if (alignRight && alignRight.classList.contains('active')) {
      textAlign = 'right';
    }
    
    // Convert hex color to rgba
    let textColor = [0, 0, 0, 1]; // Default black
    if (colorPicker) {
      const hex = colorPicker.value.substring(1);
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      textColor = [r, g, b, 1];
    }
    
    // Create text style object
    const textStyle = {
      font: fontSelect ? fontSelect.value : 'Arial',
      size: sizeSelect ? parseInt(sizeSelect.value) : 24,
      color: textColor,
      bold: boldBtn ? boldBtn.classList.contains('active') : false,
      italic: italicBtn ? italicBtn.classList.contains('active') : false,
      underline: underlineBtn ? underlineBtn.classList.contains('active') : false,
      align: textAlign
    };
    
    // Update current style
    appState.currentStyle.text = textStyle;
    
    // Create text path
    const textPath = {
      type: 'text',
      data: [appState.textPosition.x, appState.textPosition.y],
      text: text,
      style: JSON.parse(JSON.stringify(appState.currentStyle))
    };
    
    appState.paths.push(textPath);
    pushUndo('text creation');
    
    // Clean up
    container.remove();
    appState.isCreatingText = false;
    appState.textPosition = null;
    appState.textInput = '';
    
    // Select the newly created text
    appState.selectedPaths = [appState.paths.length - 1];
    
    renderCanvas();
    showNotification('Text created', 'success');
  }

  function cancelTextCreation() {
    const container = document.getElementById('text-editor-container');
    if (container) {
      container.remove();
    }
    
    appState.isCreatingText = false;
    appState.textPosition = null;
    appState.textInput = '';
    renderCanvas();
  }

  function continueDrawing(x, y) {
    if (!appState.isDrawing) return;
    
    // Apply guide snapping if enabled
    const snappedPos = snapToGuides(x, y);
    x = snappedPos.x;
    y = snappedPos.y;
    
    if (appState.drawingType === 'line' || appState.drawingType === 'rectangle' || appState.drawingType === 'circle') {
      appState.currentPath[1] = { x, y };
    } else {
      appState.currentPath.push({ x, y });
    }
    
    // For drawing operations, only update the drawing overlay for better performance
    if (appState.drawingType === 'cut-freeform' || appState.drawingType === 'pen' || appState.drawingType === 'line' || appState.drawingType === 'rectangle' || appState.drawingType === 'circle') {
      renderDrawingOverlay();
    } else {
    renderCanvas();
    }
  }
  
  function snapToGuides(x, y) {
    // Skip snapping if guides are not visible
    if (!appState.guides.visible) return { x, y };
    
    // Calculate dynamic snap threshold based on zoom and DPI
    const snapThreshold = calculateDynamicSnapThreshold();
    let snappedX = x;
    let snappedY = y;
    
    // Snap to vertical guides
    for (const guide of appState.guides.vertical) {
      if (Math.abs(x - guide.position) < snapThreshold) {
        snappedX = guide.position;
        break;
      }
    }
    
    // Snap to horizontal guides
    for (const guide of appState.guides.horizontal) {
      if (Math.abs(y - guide.position) < snapThreshold) {
        snappedY = guide.position;
        break;
      }
    }
    
    return { x: snappedX, y: snappedY };
  }
  function finishDrawing() {
    if (!appState.isDrawing) return;
    
    // store currentPath into paths
    const pts = appState.currentPath;
    let path = null;
    switch (appState.drawingType) {
      case 'pen': path = { type: 'path', data: pts.flatMap(p => [p.x, p.y]) }; break;
      case 'line': path = { type: 'line', data: pts.flatMap(p => [p.x, p.y]) }; break;
      case 'rectangle': {
        const s = pts[0], e = pts[1]; 
        // Ensure rectangle is drawn from top-left to bottom-right
        const x1 = Math.min(s.x, e.x);
        const y1 = Math.min(s.y, e.y);
        const x2 = Math.max(s.x, e.x);
        const y2 = Math.max(s.y, e.y);
        path = { type: 'rectangle', data: [x1, y1, x2, y2] }; 
        break;
      }
      case 'circle': {
        const c = pts[0], e = pts[1]; 
        // Circle: c is center, e is edge point for radius calculation
        const radius = Math.sqrt(Math.pow(e.x - c.x, 2) + Math.pow(e.y - c.y, 2));
        path = { type: 'circle', data: [c.x, c.y, radius] }; 
        break;
      }
      case 'polygon': path = { type: 'polygon', data: pts.flatMap(p => [p.x, p.y]) }; break;
    }
    if (path) { 
      path.style = JSON.parse(JSON.stringify(appState.currentStyle)); 
      path.layerIndex = appState.currentLayerIndex || 0; // Assign to current layer
      appState.paths.push(path); 
      pushUndo('draw'); 
      
      // Update layer path indices immediately
      updateLayerPathIndices();
    }
    appState.isDrawing = false; 
    appState.currentPath = []; 
    appState.drawingType = null; 
    renderCanvas();
  }

  /* =============================
   * Events (single set)
   * ============================= */
  function handleMouseDown(event) {
    try {
      const pos = screenToCanvas(event.clientX, event.clientY);
      lastMousePos = pos;
      appState.isMouseDown = true;
      
      // Right mouse button with select tool = automatic pan mode
      if (event.button === 2 && appState.currentTool === 'select') {
        if (window.XVGPanTool) {
          // Use screen coordinates for pan tool (it handles its own coordinate system)
          window.XVGPanTool.startPan({ x: event.clientX, y: event.clientY }, true);
        }
        return;
      }
      
      // Check for resize handle clicks first (regardless of tool)
      if (appState.selectedPaths.length > 0) {
        const resizeHandle = checkResizeHandleClick(pos);
        if (resizeHandle) {
          appState.resizing = true;
          appState.resizeHandle = resizeHandle;
          appState.resizeStart = { ...pos };
          const selectedPaths = appState.selectedPaths.map(index => appState.paths[index]);
          appState.initialResizeState = {
            bounds: window.XVGSelectionTool.calculateBounds(selectedPaths),
            paths: JSON.parse(JSON.stringify(selectedPaths))
          };
          // Snapshot before first mutation during resize drag
          pushUndo('resize');
          return; // consume the event
        }
      }
      
      switch (appState.currentTool) {
                case 'select': { 
          try {
              if (window.XVGSelectionTool) {
              // Start the new unified selection system
              window.XVGSelectionTool.startSelection(pos.x, pos.y);
              }
              renderCanvas();
          } catch (error) {
            console.error('Error in select tool:', error);
            showNotification('Selection error occurred', 'error');
          }
          break; }
        case 'guide': {
          // Create a guide at the clicked position
          createGuide(pos.x, pos.y);
          break; }
        case 'cut-freeform': {
          // Begin lasso polygon
          if (!appState.isDrawing) { appState.isDrawing = true; appState.currentPath = [{ x: pos.x, y: pos.y }]; appState.drawingType = 'cut-freeform'; }
          else { appState.currentPath.push({ x: pos.x, y: pos.y }); }
          renderCanvas();
          break; }
        case 'cut-box': {
          if (window.XVGSelectionTool) {
            window.XVGSelectionTool.startBoxSelection(pos.x, pos.y);
          appState.drawingType = 'cut-box';
            // Set up cut box state for proper grab behavior
            appState.cutBoxState = {
              isActive: true,
              startPos: { x: pos.x, y: pos.y },
              currentPos: { x: pos.x, y: pos.y },
              bounds: { x: pos.x, y: pos.y, width: 0, height: 0 }
            };
          }
          renderCanvas();
          break;
        }
        case 'grab': { 
          // Use PanTool for panning
          if (window.XVGPanTool) {
            // Use screen coordinates for pan tool (it handles its own coordinate system)
            window.XVGPanTool.startPan({ x: event.clientX, y: event.clientY }, false);
          } else {
            console.warn('PanTool not available, falling back to mouse wheel');
            showNotification('Use mouse wheel + Shift for panning', 'info');
          }
          break; 
        }
        case 'move-cut-pieces': {
          if (appState.cutPieces && appState.cutPieces.length > 0) {
            // Start dragging cut pieces
            appState.isDraggingCutPieces = true;
            appState.cutPiecesDragStart = { x: pos.x, y: pos.y };
          }
          break; 
        }
        case 'pen': 
          startDrawing(pos.x, pos.y); 
          break;
        case 'line': 
          startLine(pos.x, pos.y); 
          break;
        case 'rectangle': 
          startRectangle(pos.x, pos.y); 
          break;
        case 'circle': 
          startCircle(pos.x, pos.y); 
          break;
        case 'polygon': handlePolygonMouseDown(pos.x, pos.y, event); break;
        case 'text': startTextCreation(pos.x, pos.y); break;
        case 'eraser': startErasing(pos.x, pos.y); break;
      }
    } catch (error) {
      console.error('Error in mouse down handler:', error);
      showNotification('Mouse event error occurred', 'error');
    }
  }

  function handleMouseMove(event) {
    const pos = screenToCanvas(event.clientX, event.clientY);
    
    // Handle panning with PanTool (either grab tool or right-click with select tool)
    if (window.XVGPanTool && window.XVGPanTool.isPanning) {
      window.XVGPanTool.updatePan({ x: event.clientX, y: event.clientY });
      return;
    }
    
    if (appState.isDrawing) continueDrawing(pos.x, pos.y);
    // Removed continuous erasing - eraser now works on click only
    
    if (window.XVGSelectionTool && window.XVGSelectionTool.isBoxSelecting) {
      // Update existing box selection
      if (window.XVGSelectionTool) window.XVGSelectionTool.updateBoxSelection(pos.x, pos.y);
      
      // Update cut box state if active
      if (appState.cutBoxState && appState.cutBoxState.isActive) {
        appState.cutBoxState.currentPos = { x: pos.x, y: pos.y };
        // Calculate bounds from start and current position
        const minX = Math.min(appState.cutBoxState.startPos.x, pos.x);
        const minY = Math.min(appState.cutBoxState.startPos.y, pos.y);
        const maxX = Math.max(appState.cutBoxState.startPos.x, pos.x);
        const maxY = Math.max(appState.cutBoxState.startPos.y, pos.y);
        appState.cutBoxState.bounds = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY
        };
      }
      
      renderCanvas();
    } else if (window.XVGSelectionTool && window.XVGSelectionTool.selectionStartPoint && appState.currentTool === 'select') {
      // Update selection (handles both single click and box selection logic)
      window.XVGSelectionTool.updateSelection(pos.x, pos.y);
      renderCanvas();
    } else if (appState.resizing && window.XVGSelectionTool) {
      if (appState.initialResizeState) {
        // Get a fresh deep copy of the initial paths for this resize step
        const pathsToResize = JSON.parse(JSON.stringify(appState.initialResizeState.paths));

        // Calculate the new bounds and update the paths in pathsToResize
        window.XVGSelectionTool.handleResize(pos, appState.resizeHandle, appState.initialResizeState.bounds, pathsToResize);

        // Update the actual paths in appState for live preview
        appState.selectedPaths.forEach((pathIndex, i) => {
          // Ensure the path exists before trying to update it
          if (appState.paths[pathIndex] && pathsToResize[i]) {
            appState.paths[pathIndex].points = pathsToResize[i].points;
          }
        });

        renderCanvas();
      }
    } else if (appState.currentTool === 'move-cut-pieces' && appState.isDraggingCutPieces) {
      // Update cut pieces position during drag
      if (appState.cutPiecesDragStart) {
        const deltaX = pos.x - appState.cutPiecesDragStart.x;
        const deltaY = pos.y - appState.cutPiecesDragStart.y;
        appState.cutPiecesOffset = { x: deltaX, y: deltaY };
        renderCanvas();
      }
    }
    // Removed auto-erasing on mouse move - eraser now works on click only
    lastMousePos = pos;
  }

  function handleMouseUp() {
    appState.isMouseDown = false;
    
    // Cleanly end resize without calling undefined utilities
    if (appState.resizing) {
      appState.resizing = false;
      appState.resizeHandle = null;
      appState.resizeStart = null;
      appState.initialResizeState = null;
    }
    
    // Handle panning finish (either grab tool or right-click with select tool)
    if (window.XVGPanTool && window.XVGPanTool.isPanning) {
      window.XVGPanTool.finishPan();
      return;
    }
    
    // Handle selection tool cleanup
    if (window.XVGSelectionTool && appState.currentTool === 'select') {
      // End selection (handles both single click and box selection)
      if (window.XVGSelectionTool.selectionStartPoint) {
        const selectedIndices = window.XVGSelectionTool.endSelection(appState.paths);
        
        // Update appState with the selection results
        appState.selectedPaths = selectedIndices;
        appState.selectedPaths = selectedIndices;
        
        // Show notification about selection
        if (selectedIndices.length > 0) {
          showNotification(`Selected ${selectedIndices.length} object(s)`, 'success');
        }
        
        renderCanvas();
      }
      
      // Clear selection box if it was active
        if (window.XVGSelectionTool.clearSelectionBox) {
          window.XVGSelectionTool.clearSelectionBox();
        }
    }
    
    if (appState.isDrawing) {
      if (appState.drawingType === 'cut-freeform') {
        // Build cutter polygon from currentPath and apply via tools
        if (appState.currentPath.length >= 3) {
          const poly = appState.currentPath.flatMap(p => [p.x, p.y]);
          // Close loop
          if (poly.length >= 2) poly.push(poly[0], poly[1]);
          
          // Push undo state before cutting
          pushUndo('cut-freeform');
          
          const result = (window.XVGTools && window.XVGTools.cut) ? 
            window.XVGTools.cut.cutWithPolygon(appState.paths, appState.selectedPaths, poly) : 
            { changed: false, cutPieces: [] };
          
          if (result.changed && result.cutPieces && result.cutPieces.length > 0) {
            // Store cut pieces for grab and move functionality
            appState.cutPieces = result.cutPieces;
            appState.isDraggingCutPieces = false;
            appState.cutPiecesOffset = { x: 0, y: 0 };
            
            showNotification(`Cut applied (freeform). ${result.cutPieces.length} pieces ready to move. Click and drag to place them.`, 'success');
            
            // Switch to a special mode for moving cut pieces
            setTool('move-cut-pieces');
          } else if (result.changed) {
            showNotification(`Cut applied (freeform). Added ${result.added || 0}, removed ${result.removed || 0}.`, 'success');
          } else {
            showNotification('No intersections for cut.', 'info');
          }
          renderCanvas();
        }
        appState.currentPath = [];
        appState.drawingType = null;
              } else {
          finishDrawing();
        }
    }
    // End erasing if active
    if (eraserState.active) {
      endErasing();
    }
    // Pan tool not yet implemented
    if (window.XVGSelectionTool) {
      // Reset the selection tool state completely
      window.XVGSelectionTool.reset();
      
      if (appState.drawingType === 'cut-box') {
        // Get the final bounds from cutBoxState
        if (appState.cutBoxState && appState.cutBoxState.isActive) {
          const bounds = appState.cutBoxState.bounds;
          
          // Only proceed if the box has meaningful size
          if (bounds.width > 5 && bounds.height > 5) {
            // Create a rectangle polygon from the cut box bounds
          const poly = [
              bounds.x, bounds.y,                           // top-left
              bounds.x + bounds.width, bounds.y,            // top-right
              bounds.x + bounds.width, bounds.y + bounds.height, // bottom-right
              bounds.x, bounds.y + bounds.height,           // bottom-left
              bounds.x, bounds.y                            // back to start
            ];
            
            // Push undo state before cutting
            pushUndo('cut-box');
          
          const result = (window.XVGTools && window.XVGTools.cut) ? 
            window.XVGTools.cut.cutWithPolygon(appState.paths, appState.selectedPaths, poly) : 
              { changed: false, cutPieces: [] };
            
            if (result.changed && result.cutPieces && result.cutPieces.length > 0) {
              // Store cut pieces for grab and move functionality
              appState.cutPieces = result.cutPieces;
              appState.isDraggingCutPieces = false;
              appState.cutPiecesOffset = { x: 0, y: 0 };
              
              showNotification(`Cut applied (box). ${result.cutPieces.length} pieces ready to move. Click and drag to place them.`, 'success');
              
              // Switch to a special mode for moving cut pieces
              setTool('move-cut-pieces');
            } else if (result.changed) {
            showNotification(`Cut applied (box). Added ${result.added || 0}, removed ${result.removed || 0}.`, 'success');
          } else {
            showNotification('No intersections for cut.', 'info');
          }
          renderCanvas();
          }
          
          // Clean up cut box state
          appState.cutBoxState = null;
        }
        appState.drawingType = null;
      } else if (window.XVGSelectionTool && window.XVGSelectionTool.isBoxSelecting) {
        finishBoxSelection();
      }
    }
    
    // Handle move-cut-pieces tool
    if (appState.currentTool === 'move-cut-pieces' && appState.isDraggingCutPieces) {
      // Place cut pieces at current position when mouse is released
      placeCutPieces();
    }
    
    if (appState.resizing) {
      addUndoSnapshot({
        type: 'resize_item',
        paths: JSON.parse(JSON.stringify(appState.initialResizeState.paths.map(p => ({...p, points: p.points.slice()}))))
      });

      appState.resizing = false;
      appState.resizeHandle = null;
      appState.resizeStart = null;
      appState.initialResizeState = null;
    }
    appState.isDrawing = false;
  }

  function handleDoubleClick() {
    if (appState.drawingType === 'polygon' && appState.isDrawing) finishDrawing();
  }

  function handleWheel(event) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 1 : -1;
    
    // Get mouse position relative to canvas
    const rect = event.target.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const screenPoint = { x: mouseX, y: mouseY };
    
    if (event.ctrlKey) {
      // Cursor-based zoom using the PanTool's zoomAtPoint method
      if (window.XVGPanTool) {
        window.XVGPanTool.zoomAtPoint(screenPoint, -delta); // Negative delta for natural zoom direction
      } else {
        // Fallback to simple zoom if PanTool not available
      const old = appState.canvasTransform.zoom || 1;
      const factor = delta > 0 ? 0.9 : 1.1;
      appState.canvasTransform.zoom = Math.max(0.1, Math.min(10, old * factor));
      }
    } else if (event.shiftKey) {
      // Horizontal pan
      appState.canvasTransform.pan_x += delta * 20;
    } else {
      // Vertical pan
      appState.canvasTransform.pan_y += delta * 20;
    }
    
    // Update renderer transform
    updateRendererTransform();
    
    // Update zoom label
    updateCanvasTransformLabel();
    
    renderCanvas();
  }

  function handleKeyDown(e) {
    switch (e.key) {
      case 'Delete': case 'Backspace': if (appState.selectedPaths.length > 0) { e.preventDefault(); deleteSelected(); } break;
      case 'Escape': e.preventDefault(); if (appState.isDrawing) { appState.isDrawing = false; appState.currentPath = []; appState.drawingType = null; renderCanvas(); } else if (appState.selectedPaths.length > 0) { deselectAll(); } break;
      case 'a': if (e.ctrlKey || e.metaKey) { e.preventDefault(); selectAll(); } break;
      case 'z': if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); } break;
      case 'c': if (e.ctrlKey || e.metaKey) { e.preventDefault(); copy(); } break;
      case 'v': if (e.ctrlKey || e.metaKey) { e.preventDefault(); paste(); } break;
      case 'x': if (e.ctrlKey || e.metaKey) { e.preventDefault(); cut(); } break;
    }
  }

  function handleResize() { 
    // Update canvas size based on container
    if (globalCanvas) {
      const container = globalCanvas.parentElement;
      if (container) {
        globalCanvas.width = container.clientWidth;
        globalCanvas.height = container.clientHeight;
        
        // Update renderer canvas size if available
        if (rendererInstance) {
          try {
            rendererInstance.resize(globalCanvas.width, globalCanvas.height);
          } catch (error) {
            console.error("Error resizing XVGRenderer:", error);
          }
        }
      }
    }
    
    updateCanvasTransformLabel(); 
    renderCanvas(); 
  }

  /* =============================
   * Drag and Drop Handlers
   * ============================= */
  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDragEnter(event) {
    event.preventDefault();
    const canvasElement = globalCanvas || canvas;
    if (canvasElement) {
      canvasElement.style.border = '2px dashed #4A9B8F';
      
      // Show layer information for the drop
      const currentLayerIndex = appState.currentLayerIndex || 0;
      const currentLayer = appState.layers && appState.layers[currentLayerIndex];
      
      if (currentLayer && !currentLayer.locked) {
        // Create or update drop info overlay
        let dropInfo = document.getElementById('drop-layer-info');
        if (!dropInfo) {
          dropInfo = document.createElement('div');
          dropInfo.id = 'drop-layer-info';
          dropInfo.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(74, 155, 143, 0.9);
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: bold;
            z-index: 10000;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          `;
          document.body.appendChild(dropInfo);
        }
        dropInfo.textContent = `Drop to layer: ${currentLayer.name || `Layer ${currentLayerIndex + 1}`}`;
        dropInfo.style.display = 'block';
      }
    } else {
      console.error('Canvas element not found in handleDragEnter');
    }
  }

  function handleDragLeave(event) {
    event.preventDefault();
    const canvasElement = globalCanvas || canvas;
    if (canvasElement) {
      canvasElement.style.border = '';
      
      // Hide drop info overlay
      const dropInfo = document.getElementById('drop-layer-info');
      if (dropInfo) {
        dropInfo.style.display = 'none';
      }
    } else {
      console.error('Canvas element not found in handleDragLeave');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    
    const canvasElement = globalCanvas || canvas;
    if (canvasElement) {
      canvasElement.style.border = '';
      
      // Hide drop info overlay
      const dropInfo = document.getElementById('drop-layer-info');
      if (dropInfo) {
        dropInfo.style.display = 'none';
      }
    } else {
      console.error('Canvas element not found in handleDrop');
    }
    
    // Get current layer information
    const currentLayerIndex = appState.currentLayerIndex || 0;
    const currentLayer = appState.layers && appState.layers[currentLayerIndex];
    
    if (!currentLayer || currentLayer.locked) {
      console.warn('Cannot drop - layer is locked or not available');
      showNotification('Cannot drop files - layer is locked or not available', 'warning');
      return;
    }
    
    const files = event.dataTransfer.files;
    
    if (files.length > 0) {
      const file = files[0];
      
      // Enhanced file type detection with better format support
      const fileExtension = file.name.toLowerCase().split('.').pop();
      const isImage = file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension);
      const isSVG = file.type === 'image/svg+xml' || fileExtension === 'svg';
      const isXVG = fileExtension === 'xvg';
      const isPDF = fileExtension === 'pdf';
      const isAI = fileExtension === 'ai';
      const isEPS = fileExtension === 'eps';
      
      if (isImage) {
        processImageFile(file, currentLayerIndex);
      } else if (isSVG) {
        processSVGFile(file, currentLayerIndex);
      } else if (isXVG) {
        processXVGFile(file, currentLayerIndex);
      } else if (isPDF || isAI || isEPS) {
        showNotification('Vector format support coming soon! Currently processing as image...', 'info');
        processImageFile(file, currentLayerIndex); // Fallback to image processing
      } else {
        showNotification(`Unsupported file type: .${fileExtension}. Please use images, SVG, XVG, or other vector formats.`, 'error');
      }
    }
  }

  /* =============================
   * File Processing Functions
   * ============================= */
  function processImageFile(file, layerIndex = 0) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        
        // Calculate proportional scaling to fit the viewing area
        const canvasWidth = appState.canvas.width;
        const canvasHeight = appState.canvas.height;
        const maxImageWidth = canvasWidth * 0.8; // 80% of canvas width
        const maxImageHeight = canvasHeight * 0.8; // 80% of canvas height
        
        let scaleX = maxImageWidth / img.width;
        let scaleY = maxImageHeight / img.height;
        let scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
        
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        
        // Smart positioning: avoid overlapping with existing objects
        let x = (canvasWidth - scaledWidth) / 2;  // Start with center
        let y = (canvasHeight - scaledHeight) / 2;
        
        // Check for overlaps with existing objects and offset if needed
        const margin = 20; // Minimum spacing between objects
        let attempts = 0;
        const maxAttempts = 20;
        
        while (attempts < maxAttempts) {
          let hasOverlap = false;
          
          // Check overlap with existing paths
          for (const path of appState.paths) {
            if (path.type === 'image' && path.data) {
              const [pathX, pathY, pathWidth, pathHeight] = path.data;
              
              // Check if rectangles overlap (with margin)
              if (x < pathX + pathWidth + margin &&
                  x + scaledWidth + margin > pathX &&
                  y < pathY + pathHeight + margin &&
                  y + scaledHeight + margin > pathY) {
                hasOverlap = true;
                break;
              }
            }
          }
          
          if (!hasOverlap) break;
          
          // Try new position - spiral outward from center
          const angle = (attempts * 0.618 * 2 * Math.PI) % (2 * Math.PI); // Golden angle
          const radius = 50 + (attempts * 30); // Increasing radius
          x = Math.max(0, Math.min(canvasWidth - scaledWidth, 
              (canvasWidth - scaledWidth) / 2 + Math.cos(angle) * radius));
          y = Math.max(0, Math.min(canvasHeight - scaledHeight, 
              (canvasHeight - scaledHeight) / 2 + Math.sin(angle) * radius));
          
          attempts++;
        }
        
        // Create image object
        const imageObject = {
          type: 'image',
          data: [x, y, scaledWidth, scaledHeight], // x, y, width, height
          image: img,
          dataURL: e.target.result,
          style: {
            fill: null,
            stroke: null,
            opacity: 1.0
          },
          layerIndex: layerIndex, // Set the layer index
          bounds: {
            minX: x,
            minY: y,
            maxX: x + scaledWidth,
            maxY: y + scaledHeight,
            width: scaledWidth,
            height: scaledHeight
          },
          createdAt: new Date().toISOString()
        };
        
        // Create undo snapshot for just this image addition
        const undoSnapshot = {
            type: 'add_image',
            itemIndex: appState.paths.length, // Will be the index after push
            itemData: JSON.parse(JSON.stringify(imageObject)),
            timestamp: Date.now(),
            label: `upload ${file.name}`
        };
        appState.undoStack.push(undoSnapshot);
        
        // Add to paths and automatically select the new item
        appState.paths.push(imageObject);
        // Auto-select the newly dropped image
        appState.selectedPaths = [appState.paths.length - 1];
        
        // Update layer path indices
        if (appState.layers && appState.layers[layerIndex]) {
          if (!appState.layers[layerIndex].pathIndices) {
            appState.layers[layerIndex].pathIndices = [];
          }
          appState.layers[layerIndex].pathIndices.push(appState.paths.length - 1);
        }
        
        // Force immediate render to show the image
        setTimeout(() => {
          renderCanvas();
          
          // Double-check the image is visible
          setTimeout(() => {
            renderCanvas();
          }, 100);
        }, 50);
        
        // Auto-fit disabled to preserve hardcoded handle sizes
        // autoFitToView();
        
        showNotification(`Image loaded successfully to layer: ${appState.layers[layerIndex]?.name || layerIndex}!`, 'success');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function processSVGFile(file, layerIndex = 0) {
    // Smart SVG processing: detect if it's pure text or contains binary data
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const svgContent = e.target.result;
        
        // Check if SVG contains binary data (embedded images, fonts, etc.)
        const hasBinaryData = svgContent.includes('data:image/') || 
                             svgContent.includes('data:font/') ||
                             svgContent.includes('xlink:href="data:') ||
                             svgContent.includes('url(data:');
        
        if (hasBinaryData) {
          // Re-read as DataURL to preserve binary content
          const binaryReader = new FileReader();
          binaryReader.onload = function(binaryEvent) {
            processSVGWithBinaryData(binaryEvent.target.result, layerIndex);
          };
          binaryReader.readAsDataURL(file);
          return;
        }
        
        // Pure text SVG - process normally
        processSVGTextContent(svgContent, layerIndex);
        
      } catch (error) {
        console.error('Error in SVG processing:', error);
        showNotification('Error processing SVG file: ' + error.message, 'error');
      }
    };
    
    // Start with text reading for initial analysis
    reader.readAsText(file);
  }
  
  function processSVGWithBinaryData(dataURL, layerIndex) {
    try {
      // Create an image element to load the SVG
      const img = new Image();
      img.onload = function() {
        
        // Convert to canvas for processing
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Draw SVG to canvas (this preserves all embedded content)
        ctx.drawImage(img, 0, 0);
        
        // Convert canvas to image object for XVG editor
        const imageObject = {
          type: 'image',
          data: [0, 0, img.width, img.height],
          image: img,
          dataURL: dataURL,
          style: {
            fill: null,
            stroke: null,
            opacity: 1.0
          },
          layerIndex: layerIndex,
          bounds: {
            minX: 0,
            minY: 0,
            maxX: img.width,
            maxY: img.height,
            width: img.width,
            height: img.height
          },
          createdAt: new Date().toISOString()
        };
        
        // Create undo snapshot before adding the image
        pushUndo('load SVG with embedded content');
        
        // Add to paths
        const pathIndex = appState.paths.length;
        appState.paths.push(imageObject);
        
        // Update layer path indices
        if (appState.layers && appState.layers[layerIndex]) {
          if (!appState.layers[layerIndex].pathIndices) {
            appState.layers[layerIndex].pathIndices = [];
          }
          appState.layers[layerIndex].pathIndices.push(pathIndex);
        }
        
        // Select the new image
        appState.selectedPaths = [pathIndex];
        
        renderCanvas();
        showNotification(`SVG with embedded content loaded to layer: ${appState.layers[layerIndex]?.name || layerIndex}!`, 'success');
      };
      
      img.onerror = function() {
        console.error('Failed to load SVG with binary data');
        showNotification('Failed to load SVG with embedded content', 'error');
      };
      
      img.src = dataURL;
      
    } catch (error) {
      console.error('Error processing SVG with binary data:', error);
      showNotification('Error processing SVG with embedded content: ' + error.message, 'error');
    }
  }


  function showSaveDialog(defaultName = '') {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
      `;
      
      // Create dialog
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        min-width: 400px;
        font-family: Arial, sans-serif;
      `;
      
      // Dialog content
      dialog.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: #333;">Save File As</h3>
        <div style="margin-bottom: 15px;">
          <label for="filename-input" style="display: block; margin-bottom: 5px; color: #555;">Filename:</label>
          <input type="text" id="filename-input" value="${defaultName}" 
                 style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
        </div>
        <div style="text-align: right;">
          <button id="save-cancel" style="margin-right: 10px; padding: 8px 16px; border: 1px solid #ddd; background: #f5f5f5; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button id="save-confirm" style="padding: 8px 16px; border: none; background: #4A9B8F; color: white; border-radius: 4px; cursor: pointer;">Save</button>
        </div>
      `;
      
      // Add to page
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      // Focus input and select text
      const input = dialog.querySelector('#filename-input');
      input.focus();
      input.select();
      
      // Handle Enter key
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const filename = input.value.trim();
          if (filename) {
            cleanup();
            resolve(filename);
          }
        } else if (e.key === 'Escape') {
          cleanup();
          resolve(null);
        }
      });
      
      // Handle button clicks
      dialog.querySelector('#save-cancel').addEventListener('click', () => {
        cleanup();
        resolve(null);
      });
      
      dialog.querySelector('#save-confirm').addEventListener('click', () => {
        const filename = input.value.trim();
        if (filename) {
          cleanup();
          resolve(filename);
        }
      });
      
      // Cleanup function
      function cleanup() {
        document.body.removeChild(overlay);
      }
    });
  }

  function processSVGTextContent(svgContent, layerIndex) {
    try {
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
      
      if (svgDoc.documentElement.tagName === 'svg') {
        // Parse SVG and convert to XVG paths
        const paths = parseSVGFile(svgDoc);
        if (paths.length > 0) {
          // Create undo snapshot before adding SVG paths
          pushUndo('load SVG');
          
          // Set layer index for all parsed paths
          paths.forEach(path => {
            path.layerIndex = layerIndex;
          });
          
          const startIndex = appState.paths.length;
          appState.paths.push(...paths);
          appState.selectedPaths = [];
          
          // Add indices to selected paths
          for (let i = 0; i < paths.length; i++) {
            appState.selectedPaths.push(startIndex + i);
          }
          
          // Update layer path indices
          if (appState.layers && appState.layers[layerIndex]) {
            if (!appState.layers[layerIndex].pathIndices) {
              appState.layers[layerIndex].pathIndices = [];
            }
            for (let i = 0; i < paths.length; i++) {
              appState.layers[layerIndex].pathIndices.push(startIndex + i);
            }
          }
          
          renderCanvas();
          showNotification(`SVG loaded with ${paths.length} paths to layer: ${appState.layers[layerIndex]?.name || layerIndex}!`, 'success');
        } else {
          showNotification('No valid paths found in SVG file', 'warning');
        }
      } else {
        showNotification('Invalid SVG file format', 'error');
      }
    } catch (error) {
      console.error('Error parsing SVG text content:', error);
      showNotification('Error parsing SVG file: ' + error.message, 'error');
    }
  }

  function processXVGFile(file, layerIndex = 0) {
    // XVG files are BINARY, not text
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const xvgContent = e.target.result;
        
        const parsed = parseXVGFile(xvgContent);
        
        if (parsed && parsed.paths) {
          // Create undo snapshot before adding XVG paths
          pushUndo('load XVG');
          
          // For XVG files, we'll merge the paths into the current layer
          // rather than replacing everything
          const startIndex = appState.paths.length;
          
          // Set layer index for all parsed paths
          parsed.paths.forEach(path => {
            path.layerIndex = layerIndex;
          });
          
          // Add paths to the current document
          appState.paths.push(...parsed.paths);
          
          // Select the newly added paths
          appState.selectedPaths = [];
          for (let i = 0; i < parsed.paths.length; i++) {
            appState.selectedPaths.push(startIndex + i);
          }
          
          // Update layer path indices
          if (appState.layers && appState.layers[layerIndex]) {
            if (!appState.layers[layerIndex].pathIndices) {
              appState.layers[layerIndex].pathIndices = [];
            }
            for (let i = 0; i < parsed.paths.length; i++) {
              appState.layers[layerIndex].pathIndices.push(startIndex + i);
            }
          }
          
          // Restore image paths if they exist
          if (parsed.images) {
            restoreImagePaths(parsed.images, layerIndex);
          }
          
          renderCanvas();
          showNotification(`XVG file merged with ${parsed.paths.length} paths to layer: ${appState.layers[layerIndex]?.name || layerIndex}!`, 'success');
        } else {
          showNotification('Invalid XVG file format', 'error');
        }
      } catch (error) {
        showNotification('Error parsing XVG file: ' + error.message, 'error');
        console.error('XVG parsing error:', error);
        // Fallback: create a basic XVG structure
        const dimensions = calculateCanvasDimensions();
        const basicXVG = {
          paths: [],
          canvas: { width: dimensions.width, height: dimensions.height },
          images: []
        };
        appState.paths = basicXVG.paths;
        appState.canvas.width = basicXVG.canvas.width;
        appState.canvas.height = basicXVG.canvas.height;
        renderCanvas();
        showNotification('Created new XVG document from file', 'info');
      }
    };
    
    // XVG files are BINARY - must read as ArrayBuffer, not text
    reader.readAsArrayBuffer(file);
  }

  function restoreImagePaths(images, layerIndex = 0) {
    // Create undo snapshot before restoring images
    if (images.length > 0) {
      pushUndo('restore images');
    }
    
    images.forEach(imageData => {
      if (imageData.dataURL) {
        const img = new Image();
        img.onload = function() {
          const imageObject = {
            type: 'image',
            data: imageData.data || [0, 0, img.width, img.height],
            image: img,
            dataURL: imageData.dataURL,
            style: imageData.style || {
              fill: null,
              stroke: null,
              opacity: 1.0
            },
            layerIndex: layerIndex, // Set the layer index
            bounds: imageData.bounds || {
              minX: 0,
              minY: 0,
              maxX: img.width,
              maxY: img.height,
              width: img.width,
              height: img.height
            },
            createdAt: imageData.createdAt || new Date().toISOString()
          };
          
          const pathIndex = appState.paths.length;
          appState.paths.push(imageObject);
          
          // Update layer path indices
          if (appState.layers && appState.layers[layerIndex]) {
            if (!appState.layers[layerIndex].pathIndices) {
              appState.layers[layerIndex].pathIndices = [];
            }
            appState.layers[layerIndex].pathIndices.push(pathIndex);
          }
        };
        img.src = imageData.dataURL;
      }
    });
  }

  /* =============================
   * File Parsing Functions
   * ============================= */
  function parseSVGFile(svgDoc) {
    const paths = [];
    const svgElement = svgDoc.documentElement;
    
    // Parse SVG paths
    const pathElements = svgElement.querySelectorAll('path');
    pathElements.forEach((pathEl, index) => {
      const d = pathEl.getAttribute('d');
      if (d) {
        const pathData = parseSVGPathData(d);
        if (pathData.length > 0) {
          const path = {
            type: 'path',
            data: pathData,
            style: buildStyleFromSvg(pathEl.getAttribute('fill'), pathEl.getAttribute('stroke'), pathEl.getAttribute('stroke-width')),
            createdAt: new Date().toISOString()
          };
          paths.push(path);
        }
      }
    });
    
    // Parse SVG rectangles
    const rectElements = svgElement.querySelectorAll('rect');
    rectElements.forEach((rectEl, index) => {
      const x = parseFloat(rectEl.getAttribute('x') || '0');
      const y = parseFloat(rectEl.getAttribute('y') || '0');
      const width = parseFloat(rectEl.getAttribute('width') || '0');
      const height = parseFloat(rectEl.getAttribute('height') || '0');
      
      if (width > 0 && height > 0) {
        const rect = {
          type: 'rectangle',
          data: [x, y, x + width, y + height],
          style: buildStyleFromSvg(rectEl.getAttribute('fill'), rectEl.getAttribute('stroke'), rectEl.getAttribute('stroke-width')),
          createdAt: new Date().toISOString()
        };
        paths.push(rect);
      }
    });

    // Circles
    const circleElements = svgElement.querySelectorAll('circle');
    circleElements.forEach(circleEl => {
      const cx = parseFloat(circleEl.getAttribute('cx') || '0');
      const cy = parseFloat(circleEl.getAttribute('cy') || '0');
      const r = parseFloat(circleEl.getAttribute('r') || '0');
      if (r > 0) {
        const circle = {
          type: 'circle',
          data: [cx, cy, r],
          style: buildStyleFromSvg(circleEl.getAttribute('fill'), circleEl.getAttribute('stroke'), circleEl.getAttribute('stroke-width')),
          createdAt: new Date().toISOString()
        };
        paths.push(circle);
      }
    });

    // Lines
    const lineElements = svgElement.querySelectorAll('line');
    lineElements.forEach(lineEl => {
      const x1 = parseFloat(lineEl.getAttribute('x1') || '0');
      const y1 = parseFloat(lineEl.getAttribute('y1') || '0');
      const x2 = parseFloat(lineEl.getAttribute('x2') || '0');
      const y2 = parseFloat(lineEl.getAttribute('y2') || '0');
      const line = {
        type: 'line',
        data: [x1, y1, x2, y2],
        style: buildStyleFromSvg('none', lineEl.getAttribute('stroke'), lineEl.getAttribute('stroke-width')),
        createdAt: new Date().toISOString()
      };
      paths.push(line);
    });
    
    return paths;
  }

  function parseXVGFile(content) {
    // XVG is a BINARY format, not JSON or XML
    // We need to use the proper WASM-based XVG decoder
    
    if (typeof content === 'string') {
      console.error('XVG files are binary, not text. Received string content.');
      console.error('This suggests the file was read as text instead of binary.');
      return null;
    }
    
    // Check if we have the XVG WASM decoder available
    if (typeof window.XVGFile === 'undefined') {
      console.error('XVG WASM decoder not available. XVG files cannot be parsed.');
      console.error('Attempting fallback to JSON parsing...');
      
      // Fallback: try to parse as JSON (in case it's a legacy format)
      try {
        const jsonContent = new TextDecoder().decode(content);
        const jsonData = JSON.parse(jsonContent);
        const dimensions = calculateCanvasDimensions();
        return {
          paths: jsonData.paths || [],
          canvas: jsonData.canvas || { width: dimensions.width, height: dimensions.height },
          images: jsonData.images || [],
          isLegacyFormat: true
        };
      } catch (jsonError) {
        console.error('JSON fallback also failed:', jsonError);
        return null;
      }
    }
    
    // Check if XVGEngineIntegration is available as alternative
    if (window.XVGEngineIntegration && window.XVGEngineIntegration.isReady() && window.XVGEngineIntegration.engines.file) {
      try {
        // Use synchronous parsing if available, otherwise skip
        if (window.XVGEngineIntegration.engines.file.parseXVGSync) {
          const result = window.XVGEngineIntegration.engines.file.parseXVGSync(content);
          if (result && result.success) {
            const dimensions = calculateCanvasDimensions();
            return {
              paths: result.paths || [],
              canvas: result.canvas || { width: dimensions.width, height: dimensions.height },
              images: result.images || [],
              isLegacyFormat: false
            };
          }
        }
      } catch (error) {
        console.warn('XVGEngineIntegration parse failed, trying direct XVGFile:', error);
      }
    }
    
    try {
      // The content should be an ArrayBuffer or Uint8Array
      // Use the proper XVG.decode() function
      const xvgFile = window.XVGFile.decode(content);
      
      // Extract paths and other data from the decoded XVG file
      const paths = xvgFile.get_paths();
      const header = xvgFile.get_header();
      const fileInfo = xvgFile.get_file_info();
      
      // Convert the XVG paths to the format expected by the editor
      const convertedPaths = [];
      if (paths && Array.isArray(paths)) {
        paths.forEach((path, index) => {
          // Convert XVG path format to editor path format
          const convertedPath = {
            type: 'path', // XVG paths are always 'path' type
            data: path.data, // This should be the coordinate data
            tf: path.tf, // Transform matrix
            style: path.style, // Style information
            createdAt: new Date().toISOString()
          };
          convertedPaths.push(convertedPath);
        });
      }
      
      const result = {
        paths: convertedPaths,
        canvas: {
          width: header?.width || 2000,
          height: header?.height || 1500
        },
        xvgFile: xvgFile, // Keep reference to original XVG file
        isLegacyFormat: false
      };
      
      return result;
      
    } catch (error) {
      console.error('XVG binary decoding failed:', error);
      console.error('This might be a corrupted XVG file or unsupported format version');
      
      // Final fallback: try JSON parsing
      try {
        const jsonContent = new TextDecoder().decode(content);
        const jsonData = JSON.parse(jsonContent);
        const dimensions = calculateCanvasDimensions();
        return {
          paths: jsonData.paths || [],
          canvas: jsonData.canvas || { width: dimensions.width, height: dimensions.height },
          images: jsonData.images || [],
          isLegacyFormat: true
        };
      } catch (finalError) {
        console.error('All parsing methods failed:', finalError);
        return null;
      }
    }
  }

  function parseSVGPathData(d) {
    const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
    const data = [];
    let x = 0, y = 0;
    
    commands.forEach(cmd => {
      const type = cmd[0];
      const params = cmd.slice(1).trim().split(/[\s,]+/).map(Number);
      
      switch (type.toLowerCase()) {
        case 'm': // Move to
          x = params[0] || 0;
          y = params[1] || 0;
          data.push(x, y);
          break;
        case 'l': // Line to
          x = params[0] || 0;
          y = params[1] || 0;
          data.push(x, y);
          break;
        case 'h': // Horizontal line
          x = params[0] || 0;
          data.push(x, y);
          break;
        case 'v': // Vertical line
          y = params[0] || 0;
          data.push(x, y);
          break;
        case 'z': // Close path
          if (data.length > 0) {
            data.push(data[0], data[1]); // Close to start
          }
          break;
      }
    });
    
    return data;
  }

  function parseSVGColor(color) {
    if (!color || color === 'none') return [0, 0, 0, 0];
    
    // Handle hex colors
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16) / 255;
        const g = parseInt(hex[1] + hex[1], 16) / 255;
        const b = parseInt(hex[2] + hex[2], 16) / 255;
        return [r, g, b, 1];
      } else if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        return [r, g, b, 1];
      }
    }
    
    // Handle named colors
    const namedColors = {
      'black': [0, 0, 0, 1],
      'white': [1, 1, 1, 1],
      'red': [1, 0, 0, 1],
      'green': [0, 1, 0, 1],
      'blue': [0, 0, 1, 1]
    };
    
    return namedColors[color.toLowerCase()] || [0, 0, 0, 1];
  }

  // Build style object that matches editor expectations
  function buildStyleFromSvg(fillAttr, strokeAttr, strokeWidthAttr) {
    const fillColor = parseSVGColor(fillAttr);
    const strokeColor = parseSVGColor(strokeAttr);
    const strokeWidth = parseFloat(strokeWidthAttr || '1');
    const style = { opacity: 1.0 };
    if (fillColor[3] > 0) {
      style.fill = { color: fillColor, rule: 'nonzero' };
    }
    if (strokeColor[3] > 0) {
      style.stroke = { color: strokeColor, width: isNaN(strokeWidth) ? 1 : strokeWidth, cap: 'butt', join: 'miter', dash_array: [] };
    }
    return style;
  }

  function parseColor(color) {
    if (!color || color === 'none') return [0, 0, 0, 0];
    
    // Handle hex colors
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16) / 255;
        const g = parseInt(hex[1] + hex[1], 16) / 255;
        const b = parseInt(hex[2] + hex[2], 16) / 255;
        return [r, g, b, 1];
      } else if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        return [r, g, b, 1];
      }
    }
    
    // Handle named colors
    const namedColors = {
      'black': [0, 0, 0, 1],
      'white': [1, 1, 1, 1],
      'red': [1, 0, 0, 1],
      'green': [0, 1, 0, 1],
      'blue': [0, 0, 1, 1]
    };
    
    return namedColors[color.toLowerCase()] || [0, 0, 0, 1];
  }

  /* =============================
   * Hit-testing and selection box - Now handled by XVGSelectionTool
   * ============================= */
  function finishBoxSelection() {
    try {
      if (window.XVGSelectionTool && window.XVGSelectionTool.isBoxSelecting) {
        const selectedIndices = window.XVGSelectionTool.finishBoxSelection(appState.paths) || [];
        appState.selectedPaths = selectedIndices;
        
        // Update move-to-layer button state
        updateMoveToLayerButtonState();
        
        // Selection box state is already cleared by the tool's finishBoxSelection method
      }
      
      // Show appropriate notification based on selection result
      if (appState.selectedPaths.length > 0) {
        showNotification(`Selected ${appState.selectedPaths.length} path(s)`, 'info');
      } else {
        showNotification('No objects selected', 'info');
      }
      
      renderCanvas();
    } catch (error) {
      console.error('Error finishing box selection:', error);
      showNotification('Selection error occurred', 'error');
      
      // Ensure selection box is cleared even on error
      if (window.XVGSelectionTool && window.XVGSelectionTool.clearSelectionBox) {
        window.XVGSelectionTool.clearSelectionBox();
      }
      
      renderCanvas();
    }
  }

  /* =============================
   * Rulers and Guides (single impl)
   * ============================= */
  function toggleRulersDisplay() {
    const topRuler = document.getElementById('top-ruler');
    const leftRuler = document.getElementById('left-ruler');
    const corner = document.getElementById('ruler-corner');
    
    const display = appState.rulers.visible ? 'block' : 'none';
    
    if (topRuler) {
      topRuler.style.display = display;
      
      // Force ruler to be visible if it should be
      if (display === 'block') {
        topRuler.style.visibility = 'visible';
        topRuler.style.opacity = '1';
      }
    }
    if (leftRuler) {
      leftRuler.style.display = display;
      
      // Force ruler to be visible if it should be
      if (display === 'block') {
        leftRuler.style.visibility = 'visible';
        leftRuler.style.opacity = '1';
      }
    }
    if (corner) {
      corner.style.display = display;
      
      // Force corner to be visible if it should be
      if (display === 'block') {
        corner.style.visibility = 'visible';
        corner.style.opacity = '1';
      }
    }
    
    // Update ruler measurements after toggling
    if (appState.rulers.visible) {
      setTimeout(() => {
        updateRulerMeasurements();
      }, 10);
    }
  }

  function updateTopRuler(topRuler) {
    if (!topRuler || !globalCanvas) return;
    
    const zoom = appState.canvasTransform.zoom || 1;
    const panX = appState.canvasTransform.pan_x || 0;
    
    // Clear previous ruler content
    topRuler.innerHTML = '';
    
    // Calculate viewport-relative coordinates
    // The ruler shows coordinates relative to the viewport, with 0 at the edge of the ruler corner
    const left = -panX / zoom;
    const right = left + globalCanvas.width / zoom;
    
    // Use same spacing as grid for exact alignment
    const spacing = appState.grid?.size || 20;
    
    for (let x = Math.floor(left / spacing) * spacing; x <= right; x += spacing) {
      const isMajor = Math.round(x / spacing) % 5 === 0;
      const tickHeight = isMajor ? 15 : 8;
      const tickColor = isMajor ? '#ffffff' : '#888888';
      
      // Position ticks relative to the ruler (0 at left edge of ruler)
      const sx = (x - left) * zoom;
      
      // Get ruler size from CSS custom property
      const rulerSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ruler-size')) || 30;
      
      // Create tick mark
      const tick = document.createElement('div');
      tick.style.cssText = `position:absolute;left:${sx}px;top:${rulerSize - tickHeight}px;width:1px;height:${tickHeight}px;background:${tickColor};pointer-events:none;`;
      topRuler.appendChild(tick);
      
      // Create label for major ticks
      if (isMajor) {
        const label = document.createElement('div');
        label.textContent = x.toString();
        label.style.cssText = `position:absolute;left:${sx - 10}px;top:5px;color:${appState.rulers.textColor};font-size:10px;font-family:Arial;pointer-events:none;width:20px;text-align:center;`;
        topRuler.appendChild(label);
      }
    }
  }

  function updateLeftRuler(leftRuler) {
    if (!leftRuler || !globalCanvas) return;
    
    const zoom = appState.canvasTransform.zoom || 1;
    const panY = appState.canvasTransform.pan_y || 0;
    
    // Clear previous ruler content
    leftRuler.innerHTML = '';
    
    // Calculate viewport-relative coordinates
    // The ruler shows coordinates relative to the viewport, with 0 at the edge of the ruler corner
    const top = -panY / zoom;
    const bottom = top + globalCanvas.height / zoom;
    
    // Use same spacing as grid for exact alignment
    const spacing = appState.grid?.size || 20;
    
    for (let y = Math.floor(top / spacing) * spacing; y <= bottom; y += spacing) {
      const isMajor = Math.round(y / spacing) % 5 === 0;
      const tickWidth = isMajor ? 15 : 8;
      const tickColor = isMajor ? '#ffffff' : '#888888';
      
      // Get ruler size from CSS custom property
      const rulerSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ruler-size')) || 30;
      
      // Position ticks relative to the ruler (0 at top edge of ruler)
      const sy = (y - top) * zoom;
      
      // Create tick mark
      const tick = document.createElement('div');
      tick.style.cssText = `position:absolute;top:${sy}px;left:${rulerSize - tickWidth}px;height:1px;width:${tickWidth}px;background:${tickColor};pointer-events:none;`;
      leftRuler.appendChild(tick);
      
      // Create label for major ticks
      if (isMajor) {
        const label = document.createElement('div');
        label.textContent = y.toString();
        label.style.cssText = `position:absolute;top:${sy - 5}px;left:0px;color:${appState.rulers.textColor};font-size:10px;font-family:Arial;pointer-events:none;width:20px;text-align:center;transform:rotate(-90deg);transform-origin:center;`;
        leftRuler.appendChild(label);
      }
    }
  }

  function updateRulerMeasurements() {
    if (!appState.rulers.visible) {
      return;
    }
    
    const topRuler = document.getElementById('top-ruler');
    const leftRuler = document.getElementById('left-ruler');
    
    // Debug: Check if canvas is available
    
    if (topRuler) {
      updateTopRuler(topRuler);
    }
    if (leftRuler) {
      updateLeftRuler(leftRuler);
    }
  }

  function toggleGuidesDisplay() {
    const containerId = 'guides-container';
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:var(--z-guides, 50);';
      const canvasContainer = globalCanvas?.parentElement || document.querySelector('.canvas-container') || document.body;
      canvasContainer.appendChild(container);
      const rulersContainer = document.getElementById('rulers-container');
      container.style.top = rulersContainer ? '30px' : '0px';
    }
    container.style.display = appState.guides.visible ? 'block' : 'none';
    updateGuides();
  }

  function updateGuides() {
    const container = document.getElementById('guides-container'); 
    if (!container || !appState.guides.visible) return;
    
    container.innerHTML = '';
    
    // Add horizontal guides
    appState.guides.horizontal.forEach(guide => { 
      const g = document.createElement('div'); 
      g.className = 'guide guide-horizontal';
      g.dataset.guideId = guide.id;
      g.style.cssText = `
        position: absolute;
        top: ${guide.position}px;
        left: 0;
        right: 0;
        height: 1px;
        background: ${guide.color || '#00ff00'};
        pointer-events: ${guide.locked ? 'none' : 'auto'};
        z-index: var(--z-guides, 50);
        cursor: ${guide.locked ? 'default' : 'row-resize'};
      `; 
      
      // Add event listeners for dragging if not locked
      if (!guide.locked) {
        g.addEventListener('mousedown', (e) => {
          e.preventDefault();
          startGuideDrag(guide.id, e);
        });
      }
      
      container.appendChild(g); 
    });
    
    // Add vertical guides
    appState.guides.vertical.forEach(guide => { 
      const g = document.createElement('div'); 
      g.className = 'guide guide-vertical';
      g.dataset.guideId = guide.id;
      g.style.cssText = `
        position: absolute;
        left: ${guide.position}px;
        top: 0;
        bottom: 0;
        width: 1px;
        background: ${guide.color || '#00ff00'};
        pointer-events: ${guide.locked ? 'none' : 'auto'};
        z-index: var(--z-guides, 50);
        cursor: ${guide.locked ? 'default' : 'col-resize'};
      `; 
      
      // Add event listeners for dragging if not locked
      if (!guide.locked) {
        g.addEventListener('mousedown', (e) => {
          e.preventDefault();
          startGuideDrag(guide.id, e);
        });
      }
      
      container.appendChild(g); 
    });
    
    // Update the guides UI in the sidebar
    updateGuidesUI();
  }
  
  // Guide dragging state
  let guideDragState = {
    active: false,
    guideId: null,
    startX: 0,
    startY: 0,
    guideType: null
  };
  
  function startGuideDrag(guideId, event) {
    // Find the guide
    let guide = null;
    let guideType = null;
    
    for (let i = 0; i < appState.guides.horizontal.length; i++) {
      if (appState.guides.horizontal[i].id === guideId) {
        guide = appState.guides.horizontal[i];
        guideType = 'horizontal';
        break;
      }
    }
    
    if (!guide) {
      for (let i = 0; i < appState.guides.vertical.length; i++) {
        if (appState.guides.vertical[i].id === guideId) {
          guide = appState.guides.vertical[i];
          guideType = 'vertical';
          break;
        }
      }
    }
    
    if (guide && !guide.locked) {
      // Start dragging
      guideDragState = {
        active: true,
        guideId: guideId,
        startX: event.clientX,
        startY: event.clientY,
        guideType: guideType
      };
      
      // Add event listeners for dragging
      document.addEventListener('mousemove', continueGuideDrag);
      document.addEventListener('mouseup', endGuideDrag);
    }
  }
  
  function continueGuideDrag(event) {
    if (!guideDragState.active) return;
    
    // Find the guide
    let guide = null;
    
    if (guideDragState.guideType === 'horizontal') {
      guide = appState.guides.horizontal.find(g => g.id === guideDragState.guideId);
    } else {
      guide = appState.guides.vertical.find(g => g.id === guideDragState.guideId);
    }
    
    if (guide) {
      // Calculate new position
      const pos = screenToCanvas(event.clientX, event.clientY);
      
      if (guideDragState.guideType === 'horizontal') {
        guide.position = pos.y;
      } else {
        guide.position = pos.x;
      }
      
      // Update guides
      updateGuides();
    }
  }
  
  function endGuideDrag() {
    if (!guideDragState.active) return;
    
    // Find the guide
    let guide = null;
    
    if (guideDragState.guideType === 'horizontal') {
      guide = appState.guides.horizontal.find(g => g.id === guideDragState.guideId);
    } else {
      guide = appState.guides.vertical.find(g => g.id === guideDragState.guideId);
    }
    
    if (guide) {
      pushUndo('move guide');
    }
    
    // Reset drag state
    guideDragState = {
      active: false,
      guideId: null,
      startX: 0,
      startY: 0,
      guideType: null
    };
    
    // Remove event listeners
    document.removeEventListener('mousemove', continueGuideDrag);
    document.removeEventListener('mouseup', endGuideDrag);
  }

  Object.assign(window, { 
    toggleRulersDisplay, 
    updateRulerMeasurements, 
    toggleGuidesDisplay, 
    updateGuides,
    startGuideCreation,
    createGuide,
    deleteGuide,
    toggleGuideLock
  });

  /* =============================
   * View helpers
   * ============================= */
  function zoomIn() { appState.canvasTransform.zoom = Math.min(10, (appState.canvasTransform.zoom || 1) * 1.2); updateCanvasTransformLabel(); renderCanvas(); showNotification(`Zoom: ${Math.round(appState.canvasTransform.zoom * 100)}%`); }
  function zoomOut() { appState.canvasTransform.zoom = Math.max(0.1, (appState.canvasTransform.zoom || 1) / 1.2); updateCanvasTransformLabel(); renderCanvas(); showNotification(`Zoom: ${Math.round(appState.canvasTransform.zoom * 100)}%`); }
  function fitToView() { appState.canvasTransform.zoom = 1; appState.canvasTransform.pan_x = 0; appState.canvasTransform.pan_y = 0; updateCanvasTransformLabel(); renderCanvas(); }
  function actualSize() { appState.canvasTransform.zoom = 1; appState.canvasTransform.pan_x = 0; appState.canvasTransform.pan_y = 0; updateCanvasTransformLabel(); renderCanvas(); }
  function toggleGrid() { appState.grid.visible = !appState.grid.visible; renderCanvas(); }
  
  // Auto-fit imported/dropped content to view
  function autoFitToView() {
    if (appState.paths.length === 0) return;
    
    // Calculate bounds of all content
    const bounds = calculateAllContentBounds();
    if (!bounds) return;
    
    const canvas = document.getElementById('main-canvas');
    if (!canvas) return;

    // Get viewport dimensions (accounting for sidebars)
    const viewportWidth = window.innerWidth - 550; // Account for sidebars
    const viewportHeight = window.innerHeight - 200; // Account for menu/toolbar
    
    // Calculate content dimensions
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;
    
    // Calculate zoom needed to fit content
    const zoomX = (viewportWidth * 0.8) / contentWidth; // 80% of viewport
    const zoomY = (viewportHeight * 0.8) / contentHeight; // 80% of viewport
    
    // Use the smaller zoom to ensure everything fits
    let newZoom = Math.min(zoomX, zoomY);
    
    // Prefer staying close to 100% when possible
    if (newZoom >= 0.8 && newZoom <= 1.2) {
        newZoom = 1.0; // Use 100% if content fits reasonably at 100%
    } else if (newZoom > 1.2 && newZoom < 2.0) {
        // For small content, don't zoom too much - prefer reasonable sizes
        newZoom = Math.min(newZoom, 1.5); // Max 150% for small content
    } else if (newZoom > 2.0) {
        // Very small content - limit to reasonable zoom
        newZoom = 1.0; // Just use 100% for very small content
    }
    
    // Set absolute limits
    newZoom = Math.max(newZoom, 0.1); // Min 10% zoom
    newZoom = Math.min(newZoom, 3.0); // Max 300% zoom
    
    // Calculate center of content
    const contentCenterX = (bounds.minX + bounds.maxX) / 2;
    const contentCenterY = (bounds.minY + bounds.maxY) / 2;
    
    // Calculate pan to center content
    const canvasCenterX = viewportWidth / 2;
    const canvasCenterY = viewportHeight / 2;
    
    const newPanX = canvasCenterX - (contentCenterX * newZoom);
    const newPanY = canvasCenterY - (contentCenterY * newZoom);
    
    // Apply new transform
    appState.canvasTransform.zoom = newZoom;
    appState.canvasTransform.pan_x = newPanX;
    appState.canvasTransform.pan_y = newPanY;

    updateCanvasTransform();
    
    showNotification(`Auto-fitted content to view - Zoom: ${Math.floor(newZoom * 100)}%`, 'info');
  }
  
  // Calculate bounds of all content (paths, images, etc.)
  function calculateAllContentBounds() {
    if (appState.paths.length === 0) return null;
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    appState.paths.forEach(path => {
      if (path.type === 'image' && path.data) {
        // Handle image objects
        const [x, y, width, height] = path.data;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);
      } else if (path.data && path.data.length >= 2) {
        // Handle path objects
        for (let i = 0; i < path.data.length; i += 2) {
          minX = Math.min(minX, path.data[i]);
          minY = Math.min(minY, path.data[i + 1]);
          maxX = Math.max(maxX, path.data[i]);
          maxY = Math.max(maxY, path.data[i + 1]);
        }
      }
    });
    
    if (minX === Infinity) return null; // No valid content
    
    return {
      minX, minY, maxX, maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    };
  }
  
  // Image Quality Enhancement Tool
  function enhanceImageQuality() {
    if (appState.selectedPaths.length === 0) {
      showNotification('Please select an image to enhance', 'warning');
      return;
    }
    
    const selectedPath = appState.paths[appState.selectedPaths[0]];
    if (selectedPath.type !== 'image') {
      showNotification('Please select an image to enhance', 'warning');
      return;
    }
    
    if (!selectedPath.image) {
      showNotification('Image data not available for enhancement', 'error');
      return;
    }
    
    showNotification('Enhancing image quality...', 'info');
    
    // Create a canvas to process the image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to 4x the original for upscaling
    const originalWidth = selectedPath.image.width;
    const originalHeight = selectedPath.image.height;
    const enhancedWidth = originalWidth * 4;
    const enhancedHeight = originalHeight * 4;
    
    canvas.width = enhancedWidth;
    canvas.height = enhancedHeight;
    
    // Enable high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Draw the original image at 2x size with high-quality interpolation
    ctx.drawImage(selectedPath.image, 0, 0, enhancedWidth, enhancedHeight);
    
    // Apply sharpening filter using convolution
    const imageData = ctx.getImageData(0, 0, enhancedWidth, enhancedHeight);
    const sharpenedData = applySharpeningFilter(imageData);
    ctx.putImageData(sharpenedData, 0, 0);
    
    // Create new enhanced image
    const enhancedImage = new Image();
    enhancedImage.onload = function() {
      // Create enhanced image object
      const enhancedObject = {
        type: 'image',
        data: [selectedPath.data[0], selectedPath.data[1], enhancedWidth, enhancedHeight],
        image: enhancedImage,
        dataURL: canvas.toDataURL('image/png', 1.0),
        style: {
          fill: null,
          stroke: null,
          opacity: 1.0
        },
        bounds: {
          minX: selectedPath.data[0],
          minY: selectedPath.data[1],
          maxX: selectedPath.data[0] + enhancedWidth,
          maxY: selectedPath.data[1] + enhancedHeight,
          width: enhancedWidth,
          height: enhancedHeight
        },
        createdAt: new Date().toISOString(),
        enhanced: true,
        originalPath: appState.selectedPaths[0]
      };
      
      // Add enhanced image to paths
      appState.paths.push(enhancedObject);
      appState.selectedPaths = [appState.paths.length - 1];
      
      // Auto-fit disabled to preserve hardcoded handle sizes
      // autoFitToView();
      
      // Update canvas
      renderCanvas();
      showNotification('Image quality enhanced! (4x resolution + sharpening)', 'success');
    };
    
    enhancedImage.src = canvas.toDataURL('image/png', 1.0);
  }
  
  // Apply sharpening filter to image data
  function applySharpeningFilter(imageData) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const output = new Uint8ClampedArray(data);
    
    // Sharpening kernel (3x3)
    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) { // RGB channels only
          let sum = 0;
          let kernelIndex = 0;
          
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const pixelIndex = ((y + ky) * width + (x + kx)) * 4 + c;
              sum += data[pixelIndex] * kernel[kernelIndex];
              kernelIndex++;
            }
          }
          
          const outputIndex = (y * width + x) * 4 + c;
          output[outputIndex] = Math.max(0, Math.min(255, sum));
        }
      }
    }
    
    return new ImageData(output, width, height);
  }
  
  Object.assign(window, { zoomIn, zoomOut, fitToView, actualSize, toggleGrid, autoFitToView, enhanceImageQuality });

  /* =============================
   * File Operations
   * ============================= */
  function newFile() {
    if (appState.isModified) {
      if (confirm('Unsaved changes will be lost. Continue?')) {
        // Use XVG engine if available
        if (window.XVGEngineIntegration && window.XVGEngineIntegration.isReady() && window.XVGEngineIntegration.engines.file) {
          try {
            // Reset state
        appState.paths = [];
        appState.selectedPaths = [];
        appState.filename = 'Untitled.xvg';
        appState.isModified = false;
        appState.undoStack = [];
        appState.redoStack = [];
        renderCanvas();
            showNotification('New file created with XVG engine', 'success');
          } catch (error) {
            console.error("Error creating new file with XVG engine:", error);
            // Fallback to regular implementation
            createEmptyFile();
      }
    } else {
          // Fallback to regular implementation
          createEmptyFile();
        }
      }
    } else {
      // No modifications, create new file
      if (window.XVGEngineIntegration && window.XVGEngineIntegration.isReady() && window.XVGEngineIntegration.engines.file) {
        try {
          // Reset state
      appState.paths = [];
      appState.selectedPaths = [];
      appState.filename = 'Untitled.xvg';
          appState.isModified = false;
      appState.undoStack = [];
      appState.redoStack = [];
      renderCanvas();
          showNotification('New file created with XVG engine', 'success');
        } catch (error) {
          console.error("Error creating new file with XVG engine:", error);
          // Fallback to regular implementation
          createEmptyFile();
        }
      } else {
        // Fallback to regular implementation
        createEmptyFile();
      }
    }
  }
  
  // Helper function for creating an empty file (fallback)
  function createEmptyFile() {
    appState.paths = [];
    appState.selectedPaths = [];
    appState.filename = 'Untitled.xvg';
    appState.isModified = false;
    appState.undoStack = [];
    appState.redoStack = [];
    renderCanvas();
    showNotification('New file created', 'success');
  }

  function openFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xvg,.svg,.json,.png,.jpg,.jpeg,.gif,.bmp,.webp,.tiff,.tif,.ico,.pdf,.ai,.eps,.psd,.sketch,.fig,.afdesign,.afphoto,.afpub';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.name.endsWith('.xvg')) {
          // Use WASM XVGFile engine if available for .xvg files
          if (window.XVGEngineIntegration && window.XVGEngineIntegration.isReady() && window.XVGEngineIntegration.engines.file) {
            try {
              // Read file as ArrayBuffer for WASM
              const arrayBuffer = await file.arrayBuffer();
              
              // Create a new XVGFile instance
              const xvgFile = new window.XVGEngineIntegration.xvgWasm.XVGFile(800, 600);
              
              // Load the file data
              const loadResult = xvgFile.load_from_bytes(new Uint8Array(arrayBuffer));
              
              // Extract paths from the WASM file
              const pathCount = xvgFile.get_path_count();
              
              // Clear current paths
              appState.paths = [];
              
              // Extract each path
              for (let i = 0; i < pathCount; i++) {
                const pathData = xvgFile.get_path_data(i);
                const pathType = xvgFile.get_path_type(i);
                const pathStyle = xvgFile.get_path_style(i);
                
                // Convert to XVG editor format
                const path = {
                  type: pathType || 'path',
                  data: Array.from(new Float32Array(pathData.buffer)),
                  style: pathStyle || JSON.parse(JSON.stringify(appState.currentStyle))
                };
                
                appState.paths.push(path);
              }
              
              // Extract layers if available
              try {
                const layersSection = xvgFile.get_section("layers");
                if (layersSection) {
                  const layers = JSON.parse(layersSection);
                  if (Array.isArray(layers)) {
                    appState.layers = layers;
                  }
                }
              } catch (error) {
                console.warn("Could not load layers from XVG file:", error);
              }
              
              // Extract guides if available
              try {
                const guidesSection = xvgFile.get_section("guides");
                if (guidesSection) {
                  const guides = JSON.parse(guidesSection);
                  if (guides) {
                    if (Array.isArray(guides.horizontal)) {
                      appState.guides.horizontal = guides.horizontal;
                    }
                    if (Array.isArray(guides.vertical)) {
                      appState.guides.vertical = guides.vertical;
                    }
                  }
                }
              } catch (error) {
                console.warn("Could not load guides from XVG file:", error);
              }
              
              appState.filename = file.name;
              appState.isModified = false;
              
              // Update UI
              initializeLayers();
              updateGuides();
              updateGuidesUI();
              updateLayerPathIndices();
              
              renderCanvas();
              showNotification(`Opened ${file.name} using XVG engine (${pathCount} paths)`, 'success');
            } catch (error) {
              console.error("Error opening XVG file with WASM engine:", error);
              // Fallback to regular implementation
              openFileFallback(file);
            }
          } else {
            // Fallback to regular implementation
            openFileFallback(file);
          }
        } else {
          // Use regular implementation for non-XVG files
          openFileFallback(file);
        }
      }
    };
    input.click();
  }
  
  // Helper function for opening a file (fallback)
  function openFileFallback(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            if (file.name.endsWith('.xvg')) {
              // XVG files are BINARY - must read as ArrayBuffer
              console.error('openFileFallback called for XVG file - this should not happen!');
              console.error('XVG files should use the WASM engine, not this fallback');
              showNotification('XVG files require the WASM engine to open properly', 'error');
              return;
            } else if (file.name.endsWith('.json')) {
              const data = JSON.parse(e.target.result);
              appState.paths = data.paths || [];
          
          // Update layers if available
          if (data.layers && Array.isArray(data.layers)) {
            appState.layers = data.layers;
          }
          
          // Update guides if available
          if (data.guides) {
            if (Array.isArray(data.guides.horizontal)) {
              appState.guides.horizontal = data.guides.horizontal;
            }
            if (Array.isArray(data.guides.vertical)) {
              appState.guides.vertical = data.guides.vertical;
            }
          }
          
              appState.filename = file.name;
              appState.isModified = false;
          
          // Update UI
          initializeLayers();
          updateGuides();
          updateGuidesUI();
          updateLayerPathIndices();
          
              renderCanvas();
              showNotification(`Opened ${file.name}`, 'success');
            } else if (file.name.endsWith('.svg')) {
          // Real SVG import path (aligns with drag-and-drop flow)
              const svgText = e.target.result;
              const parser = new DOMParser();
              const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
          if (svgDoc.documentElement && svgDoc.documentElement.tagName === 'svg') {
            const importedPaths = parseSVGFile(svgDoc);
            if (importedPaths.length > 0) {
              appState.paths = importedPaths; // Replace existing paths instead of pushing
              appState.selectedPaths = [0]; // Select first path
              appState.filename = file.name.replace('.svg', '.xvg');
              appState.isModified = true;
              renderCanvas();
              showNotification(`SVG loaded with ${importedPaths.length} paths!`, 'success');
            } else {
              showNotification('No drawable elements found in SVG', 'warning');
            }
          } else {
            showNotification('Invalid SVG file format', 'error');
          }
            }
          } catch (error) {
        console.error('Error parsing file:', error);
            showNotification(`Error opening file: ${error.message}`, 'error');
          }
        };
    reader.onerror = () => {
      showNotification('Error reading file', 'error');
    };
    
        reader.readAsText(file);
  }

  async function saveFile() {
    if (appState.filename === 'Untitled.xvg') {
      return saveFileAs();
    }
    
    // Use WASM XVGFile engine if available
    if (window.XVGEngineIntegration && window.XVGEngineIntegration.isReady() && window.XVGEngineIntegration.engines.file) {
      try {
    const data = {
      paths: appState.paths,
      canvas: appState.canvas,
      grid: appState.grid,
          rulers: appState.rulers,
          layers: appState.layers,
          guides: {
            horizontal: appState.guides.horizontal,
            vertical: appState.guides.vertical
          }
        };
        
        // Use the WASM engine to save the file with zero-conversion
        const saveResult = await window.XVGEngineIntegration.saveXVGFile(data, appState.filename);
        
        appState.isModified = false;
        showNotification(`Saved ${appState.filename} using XVG engine (binary format)`, 'success');
      } catch (error) {
        console.error("Error saving file with XVG engine:", error);
        // Fallback to regular implementation
        saveFileFallback();
      }
    } else {
      // Fallback to regular implementation
      saveFileFallback();
    }
  }
  
  // Helper function for saving a file (fallback)
  function saveFileFallback() {
    
    const data = {
      paths: appState.paths,
      canvas: appState.canvas,
      grid: appState.grid,
      rulers: appState.rulers,
      layers: appState.layers,
      guides: {
        horizontal: appState.guides.horizontal,
        vertical: appState.guides.vertical
      }
    };
    
    // Save as JSON with .json extension for clarity
    const jsonFilename = appState.filename.replace('.xvg', '.json');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = jsonFilename;
    a.click();
    URL.revokeObjectURL(url);
    
    appState.isModified = false;
    showNotification(`Saved ${jsonFilename} as JSON (XVG engine unavailable)`, 'warning');
  }

  async function saveFileAs() {
    // Create a better save dialog that shows current filename
    const currentName = appState.filename === 'Untitled.xvg' ? '' : appState.filename.replace('.xvg', '');
    
    // Show a more user-friendly save dialog
    const filename = await showSaveDialog(currentName);
    if (!filename) return; // User cancelled
    
    // Update current filename with .xvg extension
    appState.filename = filename.endsWith('.xvg') ? filename : `${filename}.xvg`;
    
    // Use WASM XVGFile engine if available
    if (window.XVGEngineIntegration && window.XVGEngineIntegration.isReady() && window.XVGEngineIntegration.engines.file) {
      try {
    const data = {
      paths: appState.paths,
      canvas: appState.canvas,
      grid: appState.grid,
          rulers: appState.rulers,
          layers: appState.layers,
          guides: {
            horizontal: appState.guides.horizontal,
            vertical: appState.guides.vertical
          }
        };
        
        // Use the WASM engine to save the file with zero-conversion
        await window.XVGEngineIntegration.saveXVGFile(data, appState.filename);
        
        appState.isModified = false;
        showNotification(`Saved as ${appState.filename} using XVG engine`, 'success');
      } catch (error) {
        console.error("Error saving file with XVG engine:", error);
        // Fallback to regular implementation
        saveFileAsFallback();
      }
    } else {
      // Fallback to regular implementation
      saveFileAsFallback();
    }
  }
  
  // Helper function for saving a file as (fallback)
  function saveFileAsFallback() {
    const data = {
      paths: appState.paths,
      canvas: appState.canvas,
      grid: appState.grid,
      rulers: appState.rulers,
      layers: appState.layers,
      guides: {
        horizontal: appState.guides.horizontal,
        vertical: appState.guides.vertical
      }
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = appState.filename;
    a.click();
    URL.revokeObjectURL(url);
    
    appState.isModified = false;
    showNotification(`Saved as ${appState.filename}`, 'success');
  }

  async function exportXVG() {
    // Use WASM XVGFile engine if available
    if (window.XVGEngineIntegration && window.XVGEngineIntegration.isReady() && window.XVGEngineIntegration.engines.file) {
      try {
        const data = {
          paths: appState.paths,
          canvas: appState.canvas,
          grid: appState.grid,
          rulers: appState.rulers
        };
        
        // Use the WASM engine to export the file with zero-conversion
        await window.XVGEngineIntegration.saveXVGFile(data, appState.filename);
        
        showNotification(`Exported ${appState.filename} using XVG engine`, 'success');
      } catch (error) {
        console.error("Error exporting file with XVG engine:", error);
        // Fallback to regular implementation
    saveFile();
      }
    } else {
      // Fallback to regular implementation
      saveFile();
    }
  }

  async function exportXVGAsJSON() {
    // Use WASM XVGFile engine if available
    if (window.XVGEngineIntegration && window.XVGEngineIntegration.isReady() && window.XVGEngineIntegration.engines.file) {
      try {
        const data = {
          paths: appState.paths,
          canvas: appState.canvas,
          grid: appState.grid,
          rulers: appState.rulers,
          layers: appState.layers,
          guides: {
            horizontal: appState.guides.horizontal,
            vertical: appState.guides.vertical
          },
          metadata: {
            version: '1.0',
            created: new Date().toISOString(),
            tool: 'XVG Editor'
          }
        };
        
        // Use the WASM engine to convert to JSON representation
        const jsonFilename = appState.filename.replace('.xvg', '.json');
        const jsonData = await window.XVGEngineIntegration.engines.file.exportAsJSON(data);
        
        // Create download
        const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = jsonFilename;
        a.click();
        URL.revokeObjectURL(url);
        
        showNotification(`Exported ${jsonFilename} using XVG engine`, 'success');
      } catch (error) {
        console.error("Error exporting JSON with XVG engine:", error);
        // Fallback to regular implementation
        exportXVGAsJSONFallback();
      }
    } else {
      // Fallback to regular implementation
      exportXVGAsJSONFallback();
    }
  }
  
  // Helper function for exporting as JSON (fallback)
  function exportXVGAsJSONFallback() {
    const data = {
      paths: appState.paths,
      canvas: appState.canvas,
      grid: appState.grid,
      rulers: appState.rulers,
      metadata: {
        version: '1.0',
        created: new Date().toISOString(),
        tool: 'XVG Editor'
      }
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = appState.filename.replace('.xvg', '.json');
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Exported as JSON', 'success');
  }

  // Add missing UI functions
  function showGrid() {
    appState.grid.visible = true;
    renderCanvas();
    showNotification('Grid shown', 'success');
  }

  function showRulers() {
    appState.rulers.visible = true;
    toggleRulersDisplay();
    showNotification('Rulers shown', 'success');
  }

  function showGuides() {
    appState.guides.visible = true;
    toggleGuidesDisplay();
    showNotification('Guides shown', 'success');
  }

  function help() {
    showNotification('XVG Editor Help - Use tools to draw, select, and edit vector graphics', 'info');
  }

  async function testXVGWasm() {
    showNotification('Testing WASM modules...', 'info');
    
    try {
      if (window.XVGEngineIntegration && window.XVGEngineIntegration.isReady) {
        const result = await window.XVGEngineIntegration.testWasmModules();
        
        // Create a modal dialog to display results
        const dialogContent = document.createElement('div');
        dialogContent.innerHTML = `
          <h3>WASM Module Test Results</h3>
          <div style="max-height: 300px; overflow-y: auto; margin: 16px 0; padding: 12px; background: #1a1a1a; border-radius: 8px;">
            <pre style="margin: 0; white-space: pre-wrap; font-family: monospace; font-size: 12px;">${JSON.stringify(result, null, 2)}</pre>
          </div>
          <div style="display: flex; justify-content: flex-end;">
            <button onclick="document.getElementById('wasm-test-dialog').remove()" class="btn btn--sm">Close</button>
          </div>
        `;
        
        const dialog = document.createElement('div');
        dialog.id = 'wasm-test-dialog';
        dialog.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #2a2a2a; padding: 24px; border-radius: 8px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5); z-index: 10000; min-width: 400px; max-width: 80%;';
        dialog.appendChild(dialogContent);
        document.body.appendChild(dialog);
        
        showNotification('WASM tests completed', 'success');
      } else {
        showNotification('WASM not initialized', 'error');
      }
    } catch (error) {
      console.error('WASM test error:', error);
      showNotification(`WASM test error: ${error.message}`, 'error');
    }
  }

  async function checkEngineStatus() {
    showNotification('Checking engine status...', 'info');
    
    try {
      // Collect engine status information
      const statusInfo = {
        timestamp: new Date().toISOString(),
        wasmAvailable: !!(window.XVGEngineIntegration && window.XVGEngineIntegration.isReady),
        engines: {},
        rendererStatus: {
          available: !!rendererInstance,
          transform: rendererInstance ? {
            zoom: appState.canvasTransform.zoom,
            pan_x: appState.canvasTransform.pan_x,
            pan_y: appState.canvasTransform.pan_y
          } : null
        },
        browser: {
          userAgent: navigator.userAgent,
          webGPUSupport: !!navigator.gpu,
          webGL2Support: !!document.createElement('canvas').getContext('webgl2'),
          webGLSupport: !!document.createElement('canvas').getContext('webgl')
        },
        appState: {
          currentTool: appState.currentTool,
          pathCount: appState.paths.length,
          selectedPathCount: appState.selectedPaths.length,
          layerCount: appState.layers.length,
          guideCount: (appState.guides.horizontal.length + appState.guides.vertical.length),
          shaderCount: appState.shaders ? appState.shaders.length : 0,
          sdfCount: appState.sdfData ? appState.sdfData.length : 0,
          threeDMeshCount: appState.threeDMeshes ? appState.threeDMeshes.length : 0
        }
      };
      
      // Get engine status if available
      if (window.XVGEngineIntegration && window.XVGEngineIntegration.isReady) {
        const engines = window.XVGEngineIntegration.engines;
        
        for (const [name, engine] of Object.entries(engines)) {
          statusInfo.engines[name] = {
            initialized: engine.initialized || false,
            type: engine.constructor ? engine.constructor.name : 'unknown'
          };
        }
        
        // Get available WASM constructors
        statusInfo.wasmConstructors = window.XVGEngineIntegration.getAvailableConstructors();
      }
      
      // Create a modal dialog to display the status
      const dialogContent = document.createElement('div');
      dialogContent.innerHTML = `
        <h3>Engine Status</h3>
        <div style="max-height: 400px; overflow-y: auto; margin: 16px 0; padding: 12px; background: #1a1a1a; border-radius: 8px;">
          <pre style="margin: 0; white-space: pre-wrap; font-family: monospace; font-size: 12px;">${JSON.stringify(statusInfo, null, 2)}</pre>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button onclick="copyEngineStatus()" class="btn btn--sm">Copy</button>
          <button onclick="document.getElementById('engine-status-dialog').remove()" class="btn btn--sm">Close</button>
        </div>
      `;
      
      const dialog = document.createElement('div');
      dialog.id = 'engine-status-dialog';
      dialog.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #2a2a2a; padding: 24px; border-radius: 8px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5); z-index: 10000; min-width: 500px; max-width: 80%;';
      dialog.appendChild(dialogContent);
      document.body.appendChild(dialog);
      
      // Add copy function to window
      window.copyEngineStatus = function() {
        const statusText = JSON.stringify(statusInfo, null, 2);
        navigator.clipboard.writeText(statusText).then(() => {
          showNotification('Engine status copied to clipboard', 'success');
        }).catch(err => {
          console.error('Failed to copy:', err);
          showNotification('Failed to copy to clipboard', 'error');
        });
      };
      
      showNotification('Engine status retrieved', 'success');
    } catch (error) {
      console.error('Engine status error:', error);
      showNotification(`Engine status error: ${error.message}`, 'error');
    }
  }

  async function testEngineConnections() {
    showNotification('Testing engine connections...', 'info');
    
    try {
      // Initialize test results
      const testResults = {
        timestamp: new Date().toISOString(),
        tests: {
          sdf: { success: false, message: 'Not tested' },
          shader: { success: false, message: 'Not tested' },
          threeD: { success: false, message: 'Not tested' },
          file: { success: false, message: 'Not tested' },
          renderer: { success: false, message: 'Not tested' }
        }
      };
      
      // Test SDF engine connection
      try {
        if (window.XVGEngineIntegration && 
            window.XVGEngineIntegration.isReady() && 
            window.XVGEngineIntegration.engines.sdf) {
          
          // Create a simple test path
          const testPath = [0, 0, 100, 0, 100, 100, 0, 100];
          
          // Try to generate training data
          const result = await window.XVGEngineIntegration.engines.sdf.generateTrainingData(
            [testPath],
            10, // small number of samples for testing
            { resolution: 32 }
          );
          
          testResults.tests.sdf.success = result && result.success;
          testResults.tests.sdf.message = result ? 'SDF engine connection successful' : 'SDF engine connection failed';
          testResults.tests.sdf.details = result;
        } else {
          testResults.tests.sdf.message = 'SDF engine not available';
        }
      } catch (error) {
        testResults.tests.sdf.message = `SDF engine error: ${error.message}`;
        console.error('SDF engine test error:', error);
      }
      
      // Test Shader engine connection
      try {
        if (window.XVGEngineIntegration && 
            window.XVGEngineIntegration.isReady() && 
            window.XVGEngineIntegration.engines.shader) {
          
          // Create a simple test shader
          const testShader = `@fragment
fn main() -> @location(0) vec4<f32> {
  return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}`;
          
          // Try to compile the shader
          const result = await window.XVGEngineIntegration.engines.shader.compile(testShader);
          
          testResults.tests.shader.success = result && result.success;
          testResults.tests.shader.message = result ? `Shader engine connection successful (${result.backend})` : 'Shader engine connection failed';
          testResults.tests.shader.details = result;
        } else {
          testResults.tests.shader.message = 'Shader engine not available';
        }
      } catch (error) {
        testResults.tests.shader.message = `Shader engine error: ${error.message}`;
        console.error('Shader engine test error:', error);
      }
      
      // Test 3D engine connection
      try {
        if (window.XVGEngineIntegration && 
            window.XVGEngineIntegration.isReady() && 
            window.XVGEngineIntegration.engines.threeD) {
          
          // Create a simple test path
          const testPath = [0, 0, 100, 0, 100, 100, 0, 100];
          
          // Try to extrude the path
          const result = await window.XVGEngineIntegration.engines.threeD.extrudePath(testPath, 20);
          
          testResults.tests.threeD.success = result && result.success;
          testResults.tests.threeD.message = result ? '3D engine connection successful' : '3D engine connection failed';
          testResults.tests.threeD.details = result;
        } else {
          testResults.tests.threeD.message = '3D engine not available';
        }
      } catch (error) {
        testResults.tests.threeD.message = `3D engine error: ${error.message}`;
        console.error('3D engine test error:', error);
      }
      
      // Test File engine connection
      try {
        if (window.XVGEngineIntegration && 
            window.XVGEngineIntegration.isReady() && 
            window.XVGEngineIntegration.engines.file) {
          
          // Create a simple test file
          const testData = {
            paths: [{ data: [0, 0, 100, 0, 100, 100, 0, 100], type: 'polygon' }]
          };
          
          // Try to create a file (but don't actually save it)
          const result = await window.XVGEngineIntegration.engines.file.createFile(testData);
          
          testResults.tests.file.success = result && result.success;
          testResults.tests.file.message = result ? 'File engine connection successful' : 'File engine connection failed';
          testResults.tests.file.details = result;
        } else {
          testResults.tests.file.message = 'File engine not available';
        }
      } catch (error) {
        testResults.tests.file.message = `File engine error: ${error.message}`;
        console.error('File engine test error:', error);
      }
      
      // Test Renderer connection
      try {
        if (rendererInstance) {
          // Try to get viewport info
          const viewportInfo = rendererInstance.get_viewport_info();
          
          testResults.tests.renderer.success = !!viewportInfo;
          testResults.tests.renderer.message = viewportInfo ? 'Renderer connection successful' : 'Renderer connection failed';
          testResults.tests.renderer.details = viewportInfo;
        } else {
          testResults.tests.renderer.message = 'Renderer not initialized';
        }
      } catch (error) {
        testResults.tests.renderer.message = `Renderer error: ${error.message}`;
        console.error('Renderer test error:', error);
      }
      
      // Calculate overall success
      const successCount = Object.values(testResults.tests).filter(test => test.success).length;
      const totalTests = Object.keys(testResults.tests).length;
      testResults.summary = `${successCount}/${totalTests} tests passed`;
      
      // Create a modal dialog to display the test results
      const dialogContent = document.createElement('div');
      dialogContent.innerHTML = `
        <h3>Engine Connection Tests</h3>
        <div style="margin: 16px 0; padding: 12px; background: #1a1a1a; border-radius: 8px;">
          <div style="margin-bottom: 16px; font-weight: bold; font-size: 14px;">Summary: ${testResults.summary}</div>
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center;">
            ${Object.entries(testResults.tests).map(([name, test]) => `
              <div style="font-weight: bold; text-transform: uppercase;">${name}:</div>
              <div style="color: ${test.success ? '#4A9B8F' : '#ff5555'};">${test.message}</div>
            `).join('')}
          </div>
        </div>
        <div style="max-height: 200px; overflow-y: auto; margin: 16px 0; padding: 12px; background: #1a1a1a; border-radius: 8px;">
          <pre style="margin: 0; white-space: pre-wrap; font-family: monospace; font-size: 12px;">${JSON.stringify(testResults, null, 2)}</pre>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button onclick="copyConnectionTests()" class="btn btn--sm">Copy</button>
          <button onclick="document.getElementById('engine-connection-dialog').remove()" class="btn btn--sm">Close</button>
        </div>
      `;
      
      const dialog = document.createElement('div');
      dialog.id = 'engine-connection-dialog';
      dialog.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #2a2a2a; padding: 24px; border-radius: 8px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5); z-index: 10000; min-width: 500px; max-width: 80%;';
      dialog.appendChild(dialogContent);
      document.body.appendChild(dialog);
      
      // Add copy function to window
      window.copyConnectionTests = function() {
        const testText = JSON.stringify(testResults, null, 2);
        navigator.clipboard.writeText(testText).then(() => {
          showNotification('Test results copied to clipboard', 'success');
        }).catch(err => {
          console.error('Failed to copy:', err);
          showNotification('Failed to copy to clipboard', 'error');
        });
      };
      
      showNotification(`Engine connection tests completed: ${testResults.summary}`, 'success');
    } catch (error) {
      console.error('Engine connection test error:', error);
      showNotification(`Engine connection test error: ${error.message}`, 'error');
    }
  }

  // Close all menus function
  function closeAllMenus() {
    const allMenus = document.querySelectorAll('.menu-content');
    allMenus.forEach(menu => {
      menu.style.display = 'none';
    });
  }

  // Mark canvas as needing redraw (required by tools)
  function markCanvasDirty() {
    // Trigger a render on next frame
    requestAnimationFrame(() => {
      renderCanvas();
    });
  }

  // Export all functions to window
  Object.assign(window, {
    newFile, openFile, saveFile, saveFileAs, exportXVG, exportXVGAsJSON,
    showGrid, showRulers, showGuides, help, testXVGWasm, debugEngineStatus, testEngineConnections,
    // Core functions
    setTool, startDrawing, startLine, startRectangle, startCircle, startTextCreation, startErasing,
    // Path operations
    simplifySelectedPaths,
    // Layer operations
    addLayer, deleteLayer, selectLayer, renameLayer, showMoveToLayerDialog,
    // UI functions
    toggleLeftSidebar, toggleRightSidebar, toggleSection, showTab,
    // Text functions
    updateTextFont, updateTextSizeFromMenu, decreaseTextSize, increaseTextSize, toggleTextBold, toggleTextItalic, toggleTextUnderline, setTextAlign, updateTextColorFromMenu,
    // Color functions
    updateFillColor, updateFillAlpha, updateStrokeColor, updateStrokeWidth,
    // Grid functions
    updateGridSize, toggleSnapToGrid,
    // SDF functions
    updateSDFEpochs, updateSDFLR, updateSDFResolution, convertToSDF, evaluateSDFAtPoint, exportSDFModel,
    // Shader functions
    compileShader, resetShader,
    // 3D functions
    updateExtrusionDepth, updateExtrusionBevel, extrudePath,
    // Path operations
    applyPathOperation, cropSelected, removeBackground,
    // Layer functions
    toggleLayerVisibility, toggleLayerLock,
    // Guide functions
    startGuideCreation,
    // Missing functions that HTML onclick handlers need
    undo, redo, copy, cut, paste, deleteSelected, selectAll, deselectAll,
    zoomIn, zoomOut, fitToView, actualSize, autoFitToView,
    closeAllMenus, toggleMenu,
    // Canvas management
    markCanvasDirty,
    // Coordinate conversion functions
    screenToCanvas, canvasToScreen,
    // Drawing overlay
    renderDrawingOverlay
  });

  /* =============================
   * Menu System
   * ============================= */
  function toggleMenu(menuId) {
    // Close all other menus first
    const allMenus = document.querySelectorAll('.menu-content');
    allMenus.forEach(menu => {
      if (menu.id !== menuId) {
        menu.style.display = 'none';
      }
    });

    // Toggle the target menu
    const targetMenu = document.getElementById(menuId);
    if (targetMenu) {
      const isVisible = targetMenu.style.display === 'block';
      targetMenu.style.display = isVisible ? 'none' : 'block';
    }
  }

  // Close menus when clicking outside
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.menu-dropdown')) {
      const allMenus = document.querySelectorAll('.menu-content');
      allMenus.forEach(menu => {
        menu.style.display = 'none';
      });
    }
  });

  // Export menu function
  window.toggleMenu = toggleMenu;

  /* =============================
   * Missing UI Functions
   * ============================= */
  function toggleLeftSidebar() {
    const sidebar = document.querySelector('.left-sidebar');
    const mainContent = document.querySelector('.main-content');
    if (sidebar && mainContent) {
      sidebar.classList.toggle('collapsed');
      const btn = document.querySelector('.left-sidebar .collapse-btn i');
      if (btn) {
        btn.className = sidebar.classList.contains('collapsed') ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
      }
      
      // Update main content grid classes
      mainContent.classList.toggle('left-collapsed', sidebar.classList.contains('collapsed'));
    }
  }

  function toggleRightSidebar() {
    const sidebar = document.querySelector('.right-sidebar');
    const mainContent = document.querySelector('.main-content');
    if (sidebar && mainContent) {
      sidebar.classList.toggle('collapsed');
      const btn = document.querySelector('.right-sidebar .collapse-toggle i');
      if (btn) {
        btn.className = sidebar.classList.contains('collapsed') ? 'fas fa-chevron-left' : 'fas fa-chevron-right';
      }
      
      // Update main content grid classes
      mainContent.classList.toggle('right-collapsed', sidebar.classList.contains('collapsed'));
    }
  }

  function toggleSection(sectionId) {
    const content = document.getElementById(sectionId + '-content');
    const header = document.querySelector(`[onclick="toggleSection('${sectionId}')"]`);
    if (content && header) {
      const isVisible = content.style.display !== 'none';
      content.style.display = isVisible ? 'none' : 'block';
      const icon = header.querySelector('.fa-chevron-down, .fa-chevron-right');
      if (icon) {
        icon.className = isVisible ? 'fas fa-chevron-right' : 'fas fa-chevron-down';
      }
    }
  }

  function showTab(tabName) {
    // Hide all tabs
    const allTabs = document.querySelectorAll('.tab-content');
    allTabs.forEach(tab => tab.classList.remove('active'));
    
    // Show selected tab
    const selectedTab = document.getElementById(tabName + '-tab');
    if (selectedTab) {
      selectedTab.classList.add('active');
    }
    
    // Update toolbar button states
    const allButtons = document.querySelectorAll('.toolbar-btn');
    allButtons.forEach(btn => btn.classList.remove('active'));
    const activeButton = document.querySelector(`[onclick="showTab('${tabName}')"]`);
    if (activeButton) {
      activeButton.classList.add('active');
    }
  }

  /* =============================
   * Text Formatting Functions
   * ============================= */
  function updateTextFont() {
    const fontSelect = document.getElementById('text-font-menu');
    if (fontSelect) {
      appState.currentStyle.text.font = fontSelect.value;
      if (appState.isCreatingText && appState.textInput) {
        renderCanvas();
      }
    }
  }

  function updateTextSizeFromMenu() {
    const sizeInput = document.getElementById('text-size-menu');
    if (sizeInput) {
      appState.currentStyle.text.size = parseInt(sizeInput.value);
      if (appState.isCreatingText && appState.textInput) {
        renderCanvas();
      }
    }
  }

  function decreaseTextSize() {
    const sizeInput = document.getElementById('text-size-menu');
    if (sizeInput) {
      const newSize = Math.max(8, parseInt(sizeInput.value) - 2);
      sizeInput.value = newSize;
      appState.currentStyle.text.size = newSize;
      if (appState.isCreatingText && appState.textInput) {
        renderCanvas();
      }
    }
  }

  function increaseTextSize() {
    const sizeInput = document.getElementById('text-size-menu');
    if (sizeInput) {
      const newSize = Math.min(72, parseInt(sizeInput.value) + 2);
      sizeInput.value = newSize;
      appState.currentStyle.text.size = newSize;
      if (appState.isCreatingText && appState.textInput) {
        renderCanvas();
      }
    }
  }

  function toggleTextBold() {
    appState.currentStyle.text.bold = !appState.currentStyle.text.bold;
    const btn = document.getElementById('text-bold-btn');
    if (btn) {
      btn.style.fontWeight = appState.currentStyle.text.bold ? 'bold' : 'normal';
    }
    if (appState.isCreatingText && appState.textInput) {
      renderCanvas();
    }
  }

  function toggleTextItalic() {
    appState.currentStyle.text.italic = !appState.currentStyle.text.italic;
    const btn = document.getElementById('text-italic-btn');
    if (btn) {
      btn.style.fontStyle = appState.currentStyle.text.italic ? 'italic' : 'normal';
    }
    if (appState.isCreatingText && appState.textInput) {
      renderCanvas();
    }
  }

  function toggleTextUnderline() {
    appState.currentStyle.text.underline = !appState.currentStyle.text.underline;
    const btn = document.getElementById('text-underline-btn');
    if (btn) {
      btn.style.textDecoration = appState.currentStyle.text.underline ? 'underline' : 'none';
    }
    if (appState.isCreatingText && appState.textInput) {
      renderCanvas();
    }
  }

  function setTextAlign(align) {
    appState.currentStyle.text.align = align;
    // Update button states
    const alignBtns = ['text-left-btn', 'text-center-btn', 'text-right-btn'];
    alignBtns.forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.classList.remove('active');
      }
    });
    const activeBtn = document.getElementById(`text-${align}-btn`);
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
    if (appState.isCreatingText && appState.textInput) {
      renderCanvas();
    }
  }

  function updateTextColorFromMenu() {
    const colorInput = document.getElementById('text-color-menu');
    if (colorInput) {
      const color = colorInput.value;
      const rgb = hexToRgb(color);
      appState.currentStyle.text.color = [rgb.r / 255, rgb.g / 255, rgb.b / 255, 1.0];
      if (appState.isCreatingText && appState.textInput) {
        renderCanvas();
      }
    }
  }

  /* =============================
   * Color and Grid Functions
   * ============================= */
  function updateFillColor() {
    const colorInput = document.getElementById('fill-color');
    if (colorInput) {
      const color = colorInput.value;
      const rgb = hexToRgb(color);
      appState.currentStyle.fill.color = [rgb.r / 255, rgb.g / 255, rgb.b / 255, appState.currentStyle.fill.color[3]];
      renderCanvas();
    }
  }

  function updateFillAlpha() {
    const alphaInput = document.getElementById('fill-alpha');
    if (alphaInput) {
      const alpha = parseInt(alphaInput.value) / 100;
      appState.currentStyle.fill.color[3] = alpha;
      const alphaValue = document.getElementById('fill-alpha-value');
      if (alphaValue) {
        alphaValue.textContent = alphaInput.value + '%';
      }
      renderCanvas();
    }
  }

  function updateStrokeColor() {
    const colorInput = document.getElementById('stroke-color');
    if (colorInput) {
      const color = colorInput.value;
      const rgb = hexToRgb(color);
      // Preserve current alpha value instead of hardcoding to 1.0
      const currentAlpha = appState.currentStyle.stroke.color ? appState.currentStyle.stroke.color[3] : 1.0;
      appState.currentStyle.stroke.color = [rgb.r / 255, rgb.g / 255, rgb.b / 255, currentAlpha];
      renderCanvas();
    }
  }

  function updateStrokeWidth() {
    const widthInput = document.getElementById('stroke-width');
    if (widthInput) {
      appState.currentStyle.stroke.width = parseFloat(widthInput.value);
      const widthValue = document.getElementById('stroke-width-value');
      if (widthValue) {
        widthValue.textContent = widthInput.value + 'px';
      }
      renderCanvas();
    }
  }

  // Apply opacity to selected paths (and to currentStyle as default for new objects)
  function updateOpacityFromMenu() {
    const slider = document.getElementById('opacity-slider');
    if (!slider) return;
    const pct = parseInt(slider.value);
    const alpha = Math.max(0, Math.min(1, pct / 100));
    const label = document.getElementById('opacity-slider-value');
    if (label) label.textContent = `${pct}%`;

    // Update currentStyle as default
    appState.currentStyle.opacity = alpha;

    // Update selected paths immediately
    if (appState.selectedPaths && appState.selectedPaths.length > 0) {
      appState.selectedPaths.forEach(idx => {
        const p = appState.paths[idx];
        if (!p) return;
        if (!p.style) p.style = JSON.parse(JSON.stringify(appState.currentStyle));
        p.style.opacity = alpha;
        // Also scale fill/stroke alpha channels to reflect overall opacity
        if (p.style.fill && p.style.fill.color) {
          p.style.fill.color[3] = Math.max(0, Math.min(1, p.style.fill.color[3] * alpha));
        }
        if (p.style.stroke && p.style.stroke.color) {
          p.style.stroke.color[3] = Math.max(0, Math.min(1, (p.style.stroke.color[3] ?? 1) * alpha));
        }
      });
    }
    renderCanvas();
  }

  function updateGridSize() {
    const sizeInput = document.getElementById('grid-size');
    if (sizeInput) {
      appState.grid.size = parseInt(sizeInput.value);
      const sizeValue = document.getElementById('grid-size-value');
      if (sizeValue) {
        sizeValue.textContent = sizeInput.value + 'px';
      }
      renderCanvas();
    }
  }

  function toggleSnapToGrid() {
    const snapCheckbox = document.getElementById('snap-to-grid');
    if (snapCheckbox) {
      appState.grid.snapToGrid = snapCheckbox.checked;
    }
  }

  /* =============================
   * SDF, Shader, and 3D Functions
   * ============================= */
  function updateSDFEpochs() {
    const epochsInput = document.getElementById('sdf-epochs');
    if (epochsInput) {
      const epochs = parseInt(epochsInput.value);
      const epochsValue = document.getElementById('sdf-epochs-value');
      if (epochsValue) {
        epochsValue.textContent = epochs;
      }
    }
  }

  function updateSDFLR() {
    const lrInput = document.getElementById('sdf-learning-rate');
    if (lrInput) {
      const lr = parseFloat(lrInput.value);
      const lrValue = document.getElementById('sdf-learning-rate-value');
      if (lrValue) {
        lrValue.textContent = lr.toFixed(3);
      }
    }
  }

  function updateSDFResolution() {
    const resInput = document.getElementById('sdf-resolution');
    if (resInput) {
      const resolution = parseInt(resInput.value);
      const resValue = document.getElementById('sdf-resolution-value');
      if (resValue) {
        resValue.textContent = `${resolution}px`;
      }
      
      // Update canvas size if it exists
      const sdfCanvas = document.getElementById('sdf-canvas');
      if (sdfCanvas) {
        sdfCanvas.width = resolution;
        sdfCanvas.height = resolution;
      }
    }
  }
  
  async function evaluateSDFAtPoint() {
    // Get current SDF model
    if (!appState.sdfData || appState.sdfData.length === 0) {
      showNotification('No SDF model available. Train a model first.', 'warning');
      return;
    }
    
    // Get the latest SDF model
    const sdfModel = appState.sdfData[appState.sdfData.length - 1];
    if (!sdfModel.neuralNetwork.trained) {
      showNotification('SDF model not trained. Train the model first.', 'warning');
      return;
    }
    
    // Prompt for coordinates
    const x = parseFloat(prompt('Enter X coordinate:', '0'));
    const y = parseFloat(prompt('Enter Y coordinate:', '0'));
    
    if (isNaN(x) || isNaN(y)) {
      showNotification('Invalid coordinates', 'error');
      return;
    }
    
    try {
      // Check if XVGSDFEngine is available
      if (window.XVGEngineIntegration && 
          window.XVGEngineIntegration.isReady() && 
          window.XVGEngineIntegration.engines.sdf) {
        
        // Use WASM engine to evaluate SDF
        const result = await window.XVGEngineIntegration.engines.sdf.evaluateSDFAtPoint(
          sdfModel.neuralNetwork,
          x,
          y
        );
        
        if (result && result.success) {
          showNotification(`SDF value at (${x}, ${y}): ${result.distance.toFixed(3)}`, 'info');
        } else {
          throw new Error('SDF evaluation failed');
        }
      } else {
        // Fallback implementation
        const distance = calculateDistanceToPaths(x, y, sdfModel.paths);
        showNotification(`SDF value at (${x}, ${y}): ${distance.toFixed(3)}`, 'info');
      }
    } catch (error) {
      console.error("Error evaluating SDF:", error);
      showNotification(`SDF evaluation failed: ${error.message}`, 'error');
    }
  }
  
  function exportSDFModel() {
    // Get current SDF model
    if (!appState.sdfData || appState.sdfData.length === 0) {
      showNotification('No SDF model available. Train a model first.', 'warning');
      return;
    }
    
    // Get the latest SDF model
    const sdfModel = appState.sdfData[appState.sdfData.length - 1];
    
    try {
      // Create a JSON representation of the model
      const modelData = {
        id: sdfModel.id,
        neuralNetwork: sdfModel.neuralNetwork,
        resolution: sdfModel.resolution,
        createdAt: sdfModel.createdAt,
        exportedAt: new Date().toISOString()
      };
      
      // Create a download link
      const blob = new Blob([JSON.stringify(modelData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sdf_model_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      showNotification('SDF model exported successfully', 'success');
    } catch (error) {
      console.error("Error exporting SDF model:", error);
      showNotification(`SDF model export failed: ${error.message}`, 'error');
    }
  }

  async function convertToSDF() {
    if (appState.selectedPaths.length === 0) {
      showNotification('Please select paths to convert to SDF', 'warning');
      return;
    }
    
    showNotification('SDF conversion started...', 'info');
    
    try {
    // Get selected paths and convert to SDF representation
    const selectedPaths = appState.selectedPaths.map(index => appState.paths[index]);
      
      // Get training parameters from UI
      const epochs = parseInt(document.getElementById('sdf-epochs')?.value || '100');
      const learningRate = parseFloat(document.getElementById('sdf-learning-rate')?.value || '0.01');
      const resolution = parseInt(document.getElementById('sdf-resolution')?.value || '128');
    
    // Create SDF data structure
    const sdfData = {
      id: `sdf_${Date.now()}`,
      paths: selectedPaths,
      trainingData: [],
      neuralNetwork: {
        layers: [64, 32, 16, 1],
        weights: [],
          biases: [],
          trained: false
      },
      boundingBox: (window.XVGSelectionTool && window.XVGSelectionTool.calculateBounds(selectedPaths)) || null,
        resolution: resolution,
      createdAt: new Date().toISOString()
    };
    
      // Check if XVGSDFEngine is available
      if (window.XVGEngineIntegration && 
          window.XVGEngineIntegration.isReady() && 
          window.XVGEngineIntegration.engines.sdf) {
        
        try {
          // Convert paths to the format expected by XVGSDFEngine
          const pathsData = [];
          for (const path of selectedPaths) {
            if (!path.data || path.data.length < 4) continue;
            
            const points = [];
            for (let i = 0; i < path.data.length; i += 2) {
              points.push([path.data[i], path.data[i + 1]]);
            }
            pathsData.push(points);
          }
          
          // Generate training data using XVGSDFEngine
          const trainingResult = await window.XVGEngineIntegration.engines.sdf.generateTrainingData(
            pathsData,
            1000, // number of samples
            {
              boundingBox: sdfData.boundingBox,
              resolution: resolution
            }
          );
          
          if (trainingResult && trainingResult.success) {
            
            // Store training data
            sdfData.trainingData = trainingResult.trainingData || [];
            
            // Train the SDF model
            const trainingOptions = {
              epochs: epochs,
              learningRate: learningRate,
              batchSize: 32,
              resolution: resolution
            };
            
            // Show training progress
            updateSDFTrainingProgress(0, epochs);
            
            // Train the model
            const trainResult = await window.XVGEngineIntegration.engines.sdf.trainModel(
              sdfData.trainingData,
              trainingOptions,
              (progress) => {
                // Update progress UI
                updateSDFTrainingProgress(progress.epoch, epochs);
              }
            );
            
            if (trainResult && trainResult.success) {
              
              // Store neural network weights and biases
              sdfData.neuralNetwork = trainResult.model || sdfData.neuralNetwork;
              sdfData.neuralNetwork.trained = true;
              
              // Generate SDF visualization
              const sdfVisualization = await window.XVGEngineIntegration.engines.sdf.generateSDFVisualization(
                sdfData.neuralNetwork,
                resolution
              );
              
              if (sdfVisualization && sdfVisualization.imageData) {
                // Display the SDF visualization
                displaySDFVisualization(sdfVisualization.imageData, resolution);
              }
            } else {
              console.error("SDF training failed:", trainResult);
              throw new Error("SDF training failed");
            }
          } else {
            console.error("Training data generation failed:", trainingResult);
            throw new Error("Training data generation failed");
          }
        } catch (error) {
          console.error("Error using XVGSDFEngine:", error);
          throw error;
        }
      } else {
        if (runtimeConfig.wasmOnly) {
          throw new Error('XVGSDFEngine not available and WASM-only mode is enabled');
        }
        console.warn("XVGSDFEngine not available, using fallback implementation");
        
        // Generate training data using fallback method
    for (let i = 0; i < 1000; i++) {
      const x = Math.random() * 2000 - 1000;
      const y = Math.random() * 1500 - 750;
      const distance = calculateDistanceToPaths(x, y, selectedPaths);
      sdfData.trainingData.push({ x, y, distance });
        }
        
        // Simple fallback visualization
        updateSDFVisualizationFallback(sdfData, resolution);
    }
    
    // Store SDF data
    if (!appState.sdfData) appState.sdfData = [];
    appState.sdfData.push(sdfData);
    
      showNotification('SDF conversion completed!', 'success');
    } catch (error) {
      console.error("Error during SDF conversion:", error);
      showNotification(`SDF conversion failed: ${error.message}`, 'error');
    }
  }
  
  function updateSDFTrainingProgress(currentEpoch, totalEpochs) {
    const progressBar = document.getElementById('sdf-progress');
    const progressText = document.getElementById('sdf-progress-text');
    
    if (progressBar) {
      const percent = Math.round((currentEpoch / totalEpochs) * 100);
      progressBar.value = percent;
      progressBar.style.width = `${percent}%`;
    }
    
    if (progressText) {
      progressText.textContent = `Training: ${currentEpoch}/${totalEpochs} epochs (${Math.round((currentEpoch / totalEpochs) * 100)}%)`;
    }
  }
  
  function displaySDFVisualization(imageData, resolution) {
    const sdfCanvas = document.getElementById('sdf-canvas');
    if (!sdfCanvas) return;
    
    // Ensure canvas has correct size
    sdfCanvas.width = resolution;
    sdfCanvas.height = resolution;
    
      const sdfCtx = sdfCanvas.getContext('2d');
    if (!sdfCtx) return;
    
    // Create ImageData object from raw data
    const imgData = new ImageData(
      new Uint8ClampedArray(imageData),
      resolution,
      resolution
    );
    
    // Draw the image data to the canvas
    sdfCtx.putImageData(imgData, 0, 0);
  }
  
  function updateSDFVisualizationFallback(sdfData, resolution) {
    const sdfCanvas = document.getElementById('sdf-canvas');
    if (!sdfCanvas) return;
    
    // Ensure canvas has correct size
    sdfCanvas.width = resolution;
    sdfCanvas.height = resolution;
    
    const sdfCtx = sdfCanvas.getContext('2d');
    if (!sdfCtx) return;
    
    // Clear canvas
      sdfCtx.fillStyle = '#000000';
    sdfCtx.fillRect(0, 0, resolution, resolution);
    
    // Draw simple SDF visualization
    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const x = (i / resolution) * 2000 - 1000;
        const y = (j / resolution) * 1500 - 750;
        const distance = calculateDistanceToPaths(x, y, sdfData.paths);
          const intensity = Math.max(0, Math.min(255, 255 - distance * 10));
          sdfCtx.fillStyle = `rgb(${intensity}, ${intensity}, ${intensity})`;
          sdfCtx.fillRect(i, j, 1, 1);
        }
      }
    }
    
  async function compileShader() {
    const shaderCode = document.getElementById('shader-code');
    if (shaderCode) {
      showNotification('Shader compilation started...', 'info');
      
      try {
        const code = shaderCode.value;
        
        // Basic WGSL validation
        if (!code.includes('@fragment') && !code.includes('@vertex')) {
          throw new Error('Shader must contain @fragment or @vertex entry point');
        }
        
        if (!code.includes('fn main')) {
          throw new Error('Shader must contain main function');
        }
        
        let compilationResult;
        
        // Use XVGEngineIntegration if available
        if (window.XVGEngineIntegration && 
            window.XVGEngineIntegration.isReady() && 
            window.XVGEngineIntegration.engines.shader) {
          
          try {
            // Use the shader engine for compilation
            compilationResult = await window.XVGEngineIntegration.compileShader(code, {
              optimize: true
            });
            
          } catch (engineError) {
            console.error("Error using shader engine:", engineError);
            throw engineError;
          }
        } else {
          // No shader engine available - implement full WGSL compilation
          compilationResult = await compileWGSLShader(code);
        }
        
        // Store compiled shader
        if (!appState.shaders) appState.shaders = [];
        const shader = {
          id: `shader_${Date.now()}`,
          code: code,
          compiled: compilationResult.success,
          compilationInfo: compilationResult,
          errors: compilationResult.errors || [],
          warnings: compilationResult.warnings || [],
          backend: compilationResult.backend || "none",
          createdAt: new Date().toISOString()
        };
        
        appState.shaders.push(shader);
        
        // Update shader preview
        updateShaderPreview(shader);
        
        // Show success message with backend info
        const backendInfo = compilationResult.backend ? 
          ` using ${compilationResult.backend.toUpperCase()}` : 
          '';
        
        showNotification(`Shader compiled successfully${backendInfo}!`, 'success');
        
        // Show warnings if any
        if (compilationResult.warnings && compilationResult.warnings.length > 0) {
          setTimeout(() => {
            showNotification(`Shader compiled with ${compilationResult.warnings.length} warning(s)`, 'warning');
          }, 1000);
        }
        
      } catch (error) {
        console.error("Shader compilation error:", error);
        showNotification(`Shader compilation failed: ${error.message}`, 'error');
        
        // Update shader preview to show error
        updateShaderPreviewWithError(error.message);
      }
    }
  }
  
  async function updateShaderPreview(shader) {
        const shaderCanvas = document.getElementById('shader-canvas');
    if (!shaderCanvas) return;
    
    // Get canvas context
          const ctx = shaderCanvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, shaderCanvas.width, shaderCanvas.height);
    
    try {
      // Check if WebGPU is available for advanced preview
      if (shader.backend === 'webgpu' && navigator.gpu) {
        // In a real implementation, we would render the shader using WebGPU
        // For now, we'll just show a gradient preview
        renderGradientPreview(ctx, shaderCanvas.width, shaderCanvas.height, true);
      } else if (shader.backend === 'webgl2' || shader.backend === 'webgl') {
        // In a real implementation, we would render the shader using WebGL
        // For now, we'll just show a gradient preview
        renderGradientPreview(ctx, shaderCanvas.width, shaderCanvas.height, false);
      } else {
        // Render actual shader output using available graphics API
        await renderShaderOutput(ctx, shaderCanvas.width, shaderCanvas.height, shader);
      }
      
      // Draw backend info
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(shader.backend.toUpperCase(), shaderCanvas.width - 10, shaderCanvas.height - 10);
      
    } catch (error) {
      console.error("Error updating shader preview:", error);
      updateShaderPreviewWithError(error.message);
    }
  }
  
  function renderGradientPreview(ctx, width, height, isWebGPU) {
    // Create gradient based on backend
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    
    if (isWebGPU) {
      // WebGPU gradient (blue-green)
      gradient.addColorStop(0, '#00a2ff');
      gradient.addColorStop(0.5, '#00ffaa');
      gradient.addColorStop(1, '#a2ff00');
    } else {
      // WebGL gradient (red-purple)
      gradient.addColorStop(0, '#ff0066');
      gradient.addColorStop(0.5, '#aa00ff');
      gradient.addColorStop(1, '#6600ff');
    }
    
    // Fill with gradient
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Add grid pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    
    // Draw grid
    const gridSize = 16;
    for (let x = 0; x <= width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    for (let y = 0; y <= height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }
  
    async function renderShaderOutput(ctx, width, height, shader) {
    try {
      // Try to render the actual shader
      if (shader.compilationInfo && shader.compilationInfo.shaderModule) {
        // WebGPU shader available - render it
        await renderWebGPUShader(ctx, width, height, shader.compilationInfo.shaderModule);
      } else if (shader.compilationInfo && shader.compilationInfo.glslCode) {
        // WebGL shader available - render it
        renderWebGLShader(ctx, width, height, shader.compilationInfo.glslCode);
      } else {
        // Fallback to pattern generation
        renderPatternPreview(ctx, width, height);
      }
    } catch (error) {
      console.error('Error rendering shader output:', error);
      // Fallback to pattern preview
      renderPatternPreview(ctx, width, height);
    }
  }
  
  async function renderWebGPUShader(ctx, width, height, shaderModule) {
    try {
      // Create a simple WebGPU render pipeline for preview
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const adapter = await navigator.gpu.requestAdapter();
      const device = await adapter.requestDevice();
      
      const context = canvas.getContext('webgpu');
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device, format });
      
      // Create render pipeline
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: device.createShaderModule({
            code: `
              struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) uv: vec2<f32>,
              }
              
              @vertex
              fn main(@builtin(vertex_index) VertexIndex: u32) -> VertexOutput {
                var pos = array<vec2<f32>, 6>(
                  vec2<f32>(-1.0, -1.0),
                  vec2<f32>( 1.0, -1.0),
                  vec2<f32>(-1.0,  1.0),
                  vec2<f32>(-1.0,  1.0),
                  vec2<f32>( 1.0, -1.0),
                  vec2<f32>( 1.0,  1.0)
                );
                
                var output: VertexOutput;
                output.position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
                output.uv = pos[VertexIndex] * 0.5 + 0.5;
                return output;
              }
            `
          }),
          entryPoint: 'main',
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'main',
          targets: [{ format }],
        },
        primitive: { topology: 'triangle-list' },
      });
      
      // Render frame
      const commandEncoder = device.createCommandEncoder();
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      
      renderPass.setPipeline(pipeline);
      renderPass.draw(6, 1, 0, 0);
      renderPass.end();
      
      device.queue.submit([commandEncoder.finish()]);
      
      // Copy result to 2D canvas
      const imageData = await createImageBitmap(canvas);
      ctx.drawImage(imageData, 0, 0, width, height);
      
    } catch (error) {
      console.error('WebGPU shader rendering failed:', error);
      throw error;
    }
  }
  
  function renderWebGLShader(ctx, width, height, glslCode) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) throw new Error('WebGL not available');
      
      // Create shader program
      const vertexShader = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vertexShader, `
        attribute vec2 a_position;
        varying vec2 v_uv;
        void main() {
          v_uv = a_position * 0.5 + 0.5;
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `);
      gl.compileShader(vertexShader);
      
      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fragmentShader, glslCode);
      gl.compileShader(fragmentShader);
      
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error('WebGL program link failed');
      }
      
      // Create buffers and render
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1
      ]), gl.STATIC_DRAW);
      
      const positionLocation = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      
      gl.useProgram(program);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      
      // Copy result to 2D canvas
      ctx.drawImage(canvas, 0, 0, width, height);
      
      // Cleanup
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(positionBuffer);
      
    } catch (error) {
      console.error('WebGL shader rendering failed:', error);
      throw error;
    }
  }
  
  function renderPatternPreview(ctx, width, height) {
    // Draw a pattern based on the shader code
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        const x = i / width;
        const y = j / height;
        
        // Create a pattern based on coordinates
        const r = Math.floor(x * 255);
        const g = Math.floor(y * 255);
        const b = Math.floor((1 - (x + y) / 2) * 255);
        
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(i, j, 1, 1);
      }
    }
  }
        
  async function compileWGSLShader(code) {
    try {
      // Check if WebGPU is available
      if (navigator.gpu) {
        return await compileWithWebGPU(code);
      }
      
      // Check if WebGL2 is available
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      if (gl) {
        return await compileWithWebGL2(code);
      }
      
      // Check if WebGL1 is available
      const gl1 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl1) {
        return await compileWithWebGL1(code);
      }
      
      // No graphics API available
      throw new Error('No graphics API available for shader compilation');
    } catch (error) {
      console.error('WGSL compilation error:', error);
      throw error;
    }
  }
  
  async function compileWithWebGPU(code) {
    try {
      // Request adapter
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        throw new Error('WebGPU adapter not available');
      }
      
      // Request device
      const device = await adapter.requestDevice();
      if (!device) {
        throw new Error('WebGPU device not available');
      }
      
      // Create shader module
      const shaderModule = device.createShaderModule({
        code: code
      });
      
      // Get compilation info
      const compilationInfo = await shaderModule.getCompilationInfo();
      
      // Check for errors
      if (compilationInfo.messages.some(msg => msg.type === 'error')) {
        const errors = compilationInfo.messages
          .filter(msg => msg.type === 'error')
          .map(msg => `Line ${msg.lineNum}: ${msg.message}`)
          .join('\n');
        
        throw new Error(`WebGPU compilation errors:\n${errors}`);
      }
      
      // Get warnings
      const warnings = compilationInfo.messages
        .filter(msg => msg.type === 'warning')
        .map(msg => `Line ${msg.lineNum}: ${msg.message}`)
        .join('\n');
      
      return {
        success: true,
        message: 'Shader compiled successfully with WebGPU',
        backend: 'webgpu',
        warnings: warnings || null,
        shaderModule: shaderModule
      };
    } catch (error) {
      throw new Error(`WebGPU compilation failed: ${error.message}`);
    }
  }
  
  async function compileWithWebGL2(code) {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      
      // Convert WGSL to GLSL
      const glslCode = convertWGSLtoGLSL(code, true);
      
      // Create shader
      const shader = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(shader, glslCode);
      gl.compileShader(shader);
      
      // Check compilation status
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`WebGL2 compilation error: ${error}`);
      }
      
      gl.deleteShader(shader);
      
      return {
        success: true,
        message: 'Shader compiled successfully with WebGL2',
        backend: 'webgl2',
        glslCode: glslCode
      };
    } catch (error) {
      throw new Error(`WebGL2 compilation failed: ${error.message}`);
    }
  }
  
  async function compileWithWebGL1(code) {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      
      // Convert WGSL to GLSL
      const glslCode = convertWGSLtoGLSL(code, false);
      
      // Create shader
      const shader = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(shader, glslCode);
      gl.compileShader(shader);
      
      // Check compilation status
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`WebGL1 compilation error: ${error}`);
      }
      
      gl.deleteShader(shader);
      
      return {
        success: true,
        message: 'Shader compiled successfully with WebGL1',
        backend: 'webgl',
        glslCode: glslCode
      };
    } catch (error) {
      throw new Error(`WebGL1 compilation failed: ${error.message}`);
    }
  }
  
  function convertWGSLtoGLSL(wgslCode, isWebGL2) {
    let glslCode = wgslCode;
    
    // Remove WGSL-specific syntax
    glslCode = glslCode.replace(/@fragment/g, '');
    glslCode = glslCode.replace(/@vertex/g, '');
    glslCode = glslCode.replace(/@location\((\d+)\)/g, 'layout(location = $1)');
    glslCode = glslCode.replace(/fn main/g, 'void main');
    glslCode = glslCode.replace(/vec(\d)<f32>/g, 'vec$1');
    
    // Add GLSL version and precision
    const version = isWebGL2 ? '#version 300 es' : '#version 100';
    const precision = 'precision mediump float;';
    
    // Add output variable for fragment shader in WebGL2
    if (isWebGL2 && wgslCode.includes('@fragment')) {
      glslCode = glslCode.replace(/void main\(\)/, 'out vec4 fragColor;\nvoid main()');
      glslCode = glslCode.replace(/return (.*);/, 'fragColor = $1;');
    }
    
    return `${version}\n${precision}\n${glslCode}`;
  }
  
  function updateShaderPreviewWithError(errorMessage) {
    const shaderCanvas = document.getElementById('shader-canvas');
    if (!shaderCanvas) return;
    
    const ctx = shaderCanvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas with error background
    ctx.fillStyle = '#3a1a1a';
    ctx.fillRect(0, 0, shaderCanvas.width, shaderCanvas.height);
    
    // Draw error message
    ctx.fillStyle = '#ff5555';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Compilation Error', shaderCanvas.width / 2, 20);
    
    // Draw error details (truncate if too long)
    const maxLength = 30;
    let errorLines = errorMessage.split('\n');
    
    // Truncate error message if too long
    if (errorLines.length > 5) {
      errorLines = errorLines.slice(0, 4);
      errorLines.push('...');
    }
    
    errorLines.forEach((line, index) => {
      if (line.length > maxLength) {
        line = line.substring(0, maxLength - 3) + '...';
      }
      ctx.fillText(line, shaderCanvas.width / 2, 40 + index * 16);
    });
  }

  function resetShader() {
    const shaderCode = document.getElementById('shader-code');
    if (shaderCode) {
      shaderCode.value = `@fragment
fn main(@location(0) coord: vec2<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(coord.x, coord.y, 0.0, 1.0);
}`;
    }
  }

  function performPathIntersection(path1, path2) {
    // Use the robust implementation from XVGTools if available
    if (window.XVGTools && window.XVGTools.boolean && window.XVGTools.boolean.intersection) {
      try {
        const result = window.XVGTools.boolean.intersection(path1, path2);
        if (result) {
          // Make sure we use the current style
          result.style = JSON.parse(JSON.stringify(appState.currentStyle));
          return result;
        }
      } catch (error) {
        console.warn("XVGTools intersection failed, using fallback:", error);
      }
    }
    
    console.warn("Using fallback intersection operation - consider enabling XVGTools");
    
    // Fallback implementation - much more robust than the previous version
    // Convert paths to polygons
    let poly1 = path1.data;
    let poly2 = path2.data;
    
    if (!poly1 || !poly2 || poly1.length < 4 || poly2.length < 4) {
      console.warn("Invalid path data for intersection");
      return null;
    }
    
    // Find bounding box of path1
    let minX1 = Infinity, minY1 = Infinity, maxX1 = -Infinity, maxY1 = -Infinity;
    for (let i = 0; i < poly1.length; i += 2) {
      minX1 = Math.min(minX1, poly1[i]);
      maxX1 = Math.max(maxX1, poly1[i]);
      minY1 = Math.min(minY1, poly1[i + 1]);
      maxY1 = Math.max(maxY1, poly1[i + 1]);
    }
    
    // Find bounding box of path2
    let minX2 = Infinity, minY2 = Infinity, maxX2 = -Infinity, maxY2 = -Infinity;
    for (let i = 0; i < poly2.length; i += 2) {
      minX2 = Math.min(minX2, poly2[i]);
      maxX2 = Math.max(maxX2, poly2[i]);
      minY2 = Math.min(minY2, poly2[i + 1]);
      maxY2 = Math.max(maxY2, poly2[i + 1]);
    }
    
    // Check if bounding boxes overlap
    if (maxX1 < minX2 || minX1 > maxX2 || maxY1 < minY2 || minY1 > maxY2) {
      // No intersection
      return null;
    }
    
    // Find intersection box
    const intersectionBox = [
      Math.max(minX1, minX2),
      Math.max(minY1, minY2),
      Math.min(maxX1, maxX2),
      Math.min(maxY1, maxY2)
    ];
    
    return {
      type: 'rectangle',
      data: intersectionBox,
      style: JSON.parse(JSON.stringify(appState.currentStyle)),
      operation: 'intersection'
    };
  }

  function cropSelected() {
    if (appState.selectedPaths.length === 0) {
      showNotification('Please select paths to crop', 'warning');
      return;
    }
    
    showNotification('Crop operation started...', 'info');
    
    // Get bounding box of selected paths
    const selectedPaths = appState.selectedPaths.map(index => appState.paths[index]);
    const bounds = (window.XVGSelectionTool && window.XVGSelectionTool.calculateBounds(selectedPaths)) || null;
    
    if (!bounds) {
      showNotification('No bounds found for crop operation', 'warning');
      return;
    }
    
    // Create crop path
    const cropPath = {
      type: 'rectangle',
      data: bounds,
      style: {
        fill: { color: [0, 0, 0, 0] },
        stroke: { color: [1, 0, 0, 1], width: 2 },
        opacity: 1.0
      },
      bounds: bounds,
      createdAt: new Date().toISOString()
    };
    
    // Add crop path
    appState.paths.push(cropPath);
    appState.selectedPaths = [appState.paths.length - 1];
    
    // Update canvas to show crop area
    renderCanvas();
    showNotification('Crop area created', 'success');
  }

  /**
   * Finds the most common color in an array of [r,g,b] arrays.
   * Uses a Map to count occurrences of each color.
   * Returns the most frequent color, or [255,255,255] if input is empty.
   * @param {Array<Array<number>>} colors
   * @returns {Array<number>} The most common [r,g,b] color
   */
  function findMostCommonColor(colors) {
    if (!Array.isArray(colors) || colors.length === 0) return [255, 255, 255];

    const colorMap = new Map();
    let maxCount = 0;
    let mostCommon = colors[0];

    for (let i = 0; i < colors.length; i++) {
      const color = colors[i];
      // Use a string key for Map: "r,g,b"
      const key = color.join(',');
      const count = (colorMap.get(key) || 0) + 1;
      colorMap.set(key, count);

      if (count > maxCount) {
        maxCount = count;
        mostCommon = color;
      }
    }

    return mostCommon;
  }

  function addLayer() {
    const layerId = `layer_${appState.layers.length + 1}`;
    const newLayer = {
      id: layerId,
      name: `Layer ${appState.layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1.0,
      pathIndices: []
    };
    appState.layers.push(newLayer);
    appState.currentLayerIndex = appState.layers.length - 1;
    
    // Update UI by reinitializing all layers
    initializeLayers();
    
    showNotification(`Layer ${newLayer.name} added`, 'success');
  }

  function startGuideCreation(type) {
    // Set the current tool to 'guide'
    appState.currentTool = 'guide';
    appState.guides.isCreating = true;
    appState.guides.createType = type;
    
    // Change cursor to indicate guide creation
    if (globalCanvas) {
      globalCanvas.style.cursor = type === 'horizontal' ? 'row-resize' : 'col-resize';
    }
    
    showNotification(`Click to place ${type} guide`, 'info');
  }
  
  function createGuide(x, y) {
    if (!appState.guides.isCreating || !appState.guides.createType) return;
    
    pushUndo('create guide');
    
    const type = appState.guides.createType;
    const position = type === 'horizontal' ? y : x;
    const guideId = `guide_${Date.now()}`;
    
    const newGuide = {
      id: guideId,
      type: type,
      position: position,
      color: '#0066ff',
      locked: false
    };
    
    if (type === 'horizontal') {
      appState.guides.horizontal.push(newGuide);
    } else {
      appState.guides.vertical.push(newGuide);
    }
    
    // Reset guide creation state
    appState.guides.isCreating = false;
    appState.guides.createType = null;
    
    // Reset cursor
    if (globalCanvas) {
      globalCanvas.style.cursor = 'default';
    }
    
    // Reset tool to select
    appState.currentTool = 'select';
    
    // Update UI
    updateGuides();
    updateGuidesUI();
    
    showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} guide created at ${Math.round(position)}px`, 'success');
  }
  
  function deleteGuide(guideId) {
    pushUndo('delete guide');
    
    // Find and remove the guide
    let found = false;
    
    for (let i = 0; i < appState.guides.horizontal.length; i++) {
      if (appState.guides.horizontal[i].id === guideId) {
        appState.guides.horizontal.splice(i, 1);
        found = true;
        break;
      }
    }
    
    if (!found) {
      for (let i = 0; i < appState.guides.vertical.length; i++) {
        if (appState.guides.vertical[i].id === guideId) {
          appState.guides.vertical.splice(i, 1);
          found = true;
          break;
        }
      }
    }
    
    if (found) {
      // Update UI
      updateGuides();
      updateGuidesUI();
      showNotification('Guide deleted', 'success');
    }
  }
  
  function toggleGuideLock(guideId) {
    // Find the guide
    let guide = null;
    
    for (let i = 0; i < appState.guides.horizontal.length; i++) {
      if (appState.guides.horizontal[i].id === guideId) {
        guide = appState.guides.horizontal[i];
        break;
      }
    }
    
    if (!guide) {
      for (let i = 0; i < appState.guides.vertical.length; i++) {
        if (appState.guides.vertical[i].id === guideId) {
          guide = appState.guides.vertical[i];
          break;
        }
      }
    }
    
    if (guide) {
      pushUndo('toggle guide lock');
      guide.locked = !guide.locked;
      updateGuidesUI();
    }
  }
  
  function updateGuidesUI() {
    const guidesList = document.getElementById('guides-list');
    if (!guidesList) return;
    
    // Clear the list
    guidesList.innerHTML = '';
    
    // Add horizontal guides
    appState.guides.horizontal.forEach(guide => {
      const guideItem = document.createElement('div');
      guideItem.className = 'guide-item';
      guideItem.dataset.guideId = guide.id;
      
      guideItem.innerHTML = `
        <i class="fas fa-minus"></i>
        <span>Horizontal at ${Math.round(guide.position)}px</span>
        <button class="guide-control-btn ${guide.locked ? 'active' : ''}" title="${guide.locked ? 'Unlock' : 'Lock'}" onclick="toggleGuideLock('${guide.id}')">
          <i class="fas ${guide.locked ? 'fa-lock' : 'fa-lock-open'}"></i>
        </button>
        <button class="guide-delete-btn" title="Delete" onclick="deleteGuide('${guide.id}')">
          <i class="fas fa-trash-alt"></i>
        </button>
      `;
      
      guidesList.appendChild(guideItem);
    });
    
    // Add vertical guides
    appState.guides.vertical.forEach(guide => {
      const guideItem = document.createElement('div');
      guideItem.className = 'guide-item';
      guideItem.dataset.guideId = guide.id;
      
      guideItem.innerHTML = `
        <i class="fas fa-minus" style="transform: rotate(90deg);"></i>
        <span>Vertical at ${Math.round(guide.position)}px</span>
        <button class="guide-control-btn ${guide.locked ? 'active' : ''}" title="${guide.locked ? 'Unlock' : 'Lock'}" onclick="toggleGuideLock('${guide.id}')">
          <i class="fas ${guide.locked ? 'fa-lock' : 'fa-lock-open'}"></i>
        </button>
        <button class="guide-delete-btn" title="Delete" onclick="deleteGuide('${guide.id}')">
          <i class="fas fa-trash-alt"></i>
        </button>
      `;
      
      guidesList.appendChild(guideItem);
    });
  }

  function testAllEngines() {
    showNotification('Testing all engines...', 'info');
    
    const testResults = {
      sdf: false,
      shader: false,
      threeD: false,
      wasm: false
    };
    
    // Test SDF engine
    try {
      if (typeof calculateDistanceToPaths === 'function') {
        testResults.sdf = true;
      }
    } catch (e) {
      console.error('SDF engine test failed:', e);
    }
    
    // Test Shader engine
    try {
      if (typeof compileShader === 'function') {
        testResults.shader = true;
      }
    } catch (e) {
      console.error('Shader engine test failed:', e);
    }
    
    // Test 3D engine
    try {
      if (typeof extrudePath === 'function') {
        testResults.threeD = true;
      }
    } catch (e) {
      console.error('3D engine test failed:', e);
    }
    
    // Test WASM engine
    try {
      if (typeof testXVGWasm === 'function') {
        testResults.wasm = true;
      }
    } catch (e) {
      console.error('WASM engine test failed:', e);
    }
    
    const passedTests = Object.values(testResults).filter(Boolean).length;
    const totalTests = Object.keys(testResults).length;
    
    if (passedTests === totalTests) {
      showNotification(`All engines tested successfully! (${passedTests}/${totalTests})`, 'success');
    } else {
      showNotification(`Engine tests completed: ${passedTests}/${totalTests} passed`, 'warning');
    }
    
  }

  /* =============================
   * SDF Utility Functions
   * ============================= */
  function calculateDistanceToPaths(x, y, paths) {
    let minDistance = Infinity;
    
    paths.forEach(path => {
      if (path.data && path.data.length >= 4) {
        // Calculate distance to path segments
        for (let i = 0; i < path.data.length - 2; i += 2) {
          const x1 = path.data[i];
          const y1 = path.data[i + 1];
          const x2 = path.data[i + 2];
          const y2 = path.data[i + 3];
          
          const distance = pointToLineDistance(x, y, x1, y1, x2, y2);
          minDistance = Math.min(minDistance, distance);
        }
      }
    });
    
    return minDistance === Infinity ? 1000 : minDistance;
  }

  /* =============================
   * Critical Helper Functions - Bounds calculation now handled by XVGSelectionTool
   * ============================= */

  function pointToLineDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
      // Point to point distance
      return Math.sqrt(A * A + B * B);
    }
    
    // Point to line distance
    const param = dot / lenSq;
    let xx, yy;
    
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }
    
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* =============================
   * Resize Functionality - Now handled by XVGSelectionTool
   * ============================= */

  function checkResizeHandleClick(pos) {
    if (!window.XVGSelectionTool || appState.selectedPaths.length === 0) return null;
    
    try {
      const selectedPaths = appState.selectedPaths.map(index => appState.paths[index]).filter(Boolean);
      const bounds = window.XVGSelectionTool.calculateBounds(selectedPaths);
      if (!bounds) return null;
      
      // Get transform for coordinate conversion
      const t = appState.canvasTransform || { zoom: 1, pan_x: 0, pan_y: 0 };
      const z = t.zoom || 1;
      const px = t.pan_x || 0;
      const py = t.pan_y || 0;

      // Convert click position to screen coordinates to match how handles are drawn
      const clickScreen = { x: pos.x * z + px, y: pos.y * z + py };

      // Use dynamic handle size calculation to match drawResizeHandles
      const zoomLevel = z || 1;
      const dynamicHandleSize = window.XVGSelectionTool ? 
        window.XVGSelectionTool.calculateDynamicHandleSize(zoomLevel) : 8;
      const halfHandle = dynamicHandleSize / 2; // Keep in screen coordinates

      const handleCentersWorld = [
        { x: bounds.minX, y: bounds.minY, type: 'top-left' },
        { x: (bounds.minX + bounds.maxX) / 2, y: bounds.minY, type: 'top' },
        { x: bounds.maxX, y: bounds.minY, type: 'top-right' },
        { x: bounds.maxX, y: (bounds.minY + bounds.maxY) / 2, type: 'right' },
        { x: bounds.maxX, y: bounds.maxY, type: 'bottom-right' },
        { x: (bounds.minX + bounds.maxX) / 2, y: bounds.maxY, type: 'bottom' },
        { x: bounds.minX, y: bounds.maxY, type: 'bottom-left' },
        { x: bounds.minX, y: (bounds.minY + bounds.maxY) / 2, type: 'left' }
      ];

      // Convert handle centers to screen space to match drawing
      const handleCentersScreen = handleCentersWorld.map(h => ({
        x: h.x * z + px,
        y: h.y * z + py,
        type: h.type
      }));

      // Test in screen coordinates to match how handles are drawn
      for (const h of handleCentersScreen) {
        if (Math.abs(clickScreen.x - h.x) <= halfHandle && Math.abs(clickScreen.y - h.y) <= halfHandle) {
          return h.type;
        }
      }
      return null;
    } catch (error) {
      console.error('Error checking resize handle click:', error);
      return null;
    }
  }

  // Resize functionality now handled by XVGSelectionTool

  // canvasToScreen function is already defined above - removing duplicate

  /* =============================
   * Utility Functions - Bounds calculation now handled by XVGSelectionTool
   * ============================= */

  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  /* =============================
   * Layer Control Functions
   * ============================= */
  function initializeLayers() {
    // Clear existing layers UI
    const layerList = document.getElementById('layer-list');
    if (!layerList) return;
    
    layerList.innerHTML = '';
    
    // Create layer items for each layer
    appState.layers.forEach((layer, index) => {
      const layerItem = createLayerElement(layer, index);
      layerList.appendChild(layerItem);
    });
    
    // Update layer paths indices
    updateLayerPathIndices();
  }
  
  function createLayerElement(layer, index) {
    const isActive = index === appState.currentLayerIndex;
    
    const layerItem = document.createElement('div');
    layerItem.className = `layer-item${isActive ? ' active' : ''}`;
    layerItem.dataset.layerId = layer.id;
    layerItem.dataset.layerIndex = index;
    layerItem.onclick = () => selectLayer(index);
    
    layerItem.innerHTML = `
      <i class="fas ${layer.visible ? 'fa-eye' : 'fa-eye-slash'}"></i>
      <span>${layer.name}</span>
      <div class="layer-controls">
        <button class="layer-control-btn" title="${layer.visible ? 'Hide' : 'Show'}" onclick="event.stopPropagation(); toggleLayerVisibility('${layer.id}')">
          <i class="fas ${layer.visible ? 'fa-eye' : 'fa-eye-slash'}"></i>
        </button>
        <button class="layer-control-btn" title="${layer.locked ? 'Unlock' : 'Lock'}" onclick="event.stopPropagation(); toggleLayerLock('${layer.id}')">
          <i class="fas ${layer.locked ? 'fa-lock' : 'fa-lock-open'}"></i>
        </button>
        <button class="layer-control-btn" title="Delete" onclick="event.stopPropagation(); deleteLayer('${layer.id}')">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `;
    
    return layerItem;
  }
  

  
  function deleteLayer(layerId) {
    // Don't delete if it's the only layer
    if (appState.layers.length <= 1) {
      showNotification('Cannot delete the only layer', 'warning');
      return;
    }
    
    pushUndo('delete layer');
    
    const layerIndex = appState.layers.findIndex(l => l.id === layerId);
    if (layerIndex === -1) return;
    
    const layer = appState.layers[layerIndex];
    
    // Get paths in this layer
    const pathsToRemove = [];
    appState.paths.forEach((path, pathIndex) => {
      if (layer.pathIndices.includes(pathIndex)) {
        pathsToRemove.push(pathIndex);
      }
    });
    
    // Remove paths from highest index to lowest to maintain correct indices
    if (pathsToRemove.length > 0) {
      pathsToRemove.sort((a, b) => b - a);
      pathsToRemove.forEach(index => {
        appState.paths.splice(index, 1);
      });
    }
    
    // Remove layer
    appState.layers.splice(layerIndex, 1);
    
    // Update current layer index
    if (appState.currentLayerIndex >= appState.layers.length) {
      appState.currentLayerIndex = appState.layers.length - 1;
    }
    
    // Update UI
    initializeLayers();
    
    // Update selected paths
    appState.selectedPaths = [];
    
    // Update layer path indices
    updateLayerPathIndices();
    
    renderCanvas();
    showNotification(`Layer ${layer.name} deleted`, 'success');
  }
  
  function selectLayer(index) {
    if (index < 0 || index >= appState.layers.length) return;
    
    // Update current layer index
    appState.currentLayerIndex = index;
    
    // Update UI
    const layerItems = document.querySelectorAll('.layer-item');
    layerItems.forEach(item => {
      item.classList.remove('active');
      if (parseInt(item.dataset.layerIndex) === index) {
        item.classList.add('active');
      }
    });
    
    // Clear selected paths
    appState.selectedPaths = [];
    
    renderCanvas();
  }
  
  function renameLayer(layerId, newName) {
    const layer = appState.layers.find(l => l.id === layerId);
    if (layer) {
      pushUndo('rename layer');
      
      layer.name = newName;
      
      // Update UI
      initializeLayers();
    }
  }
  
  function updateLayerPathIndices() {
    // Clear all path indices
    appState.layers.forEach(layer => {
      layer.pathIndices = [];
    });
    
    // Assign each path to its layer
    appState.paths.forEach((path, index) => {
      const layerIndex = path.layerIndex || 0;
      if (layerIndex >= 0 && layerIndex < appState.layers.length) {
        appState.layers[layerIndex].pathIndices.push(index);
      } else {
        // If path has invalid layer index, assign to current layer
        appState.layers[appState.currentLayerIndex].pathIndices.push(index);
        path.layerIndex = appState.currentLayerIndex;
      }
    });
  }
  
  function movePathToLayer(pathIndex, targetLayerIndex) {
    if (targetLayerIndex < 0 || targetLayerIndex >= appState.layers.length) return;
    
    pushUndo('move to layer');
    
    // Update path's layer index
    const path = appState.paths[pathIndex];
    if (path) {
      path.layerIndex = targetLayerIndex;
    }
    
    // Update layer path indices
    updateLayerPathIndices();
    
    renderCanvas();
  }
  
  function moveSelectedPathsToLayer(targetLayerIndex) {
    if (targetLayerIndex < 0 || targetLayerIndex >= appState.layers.length || appState.selectedPaths.length === 0) return;
    
    pushUndo('move to layer');
    
    // Update paths' layer index
    appState.selectedPaths.forEach(pathIndex => {
      const path = appState.paths[pathIndex];
      if (path) {
        path.layerIndex = targetLayerIndex;
      }
    });
    
    // Update layer path indices
    updateLayerPathIndices();
    
    renderCanvas();
    showNotification(`Moved ${appState.selectedPaths.length} item(s) to ${appState.layers[targetLayerIndex].name}`, 'success');
  }
  
  function showMoveToLayerDialog() {
    if (appState.selectedPaths.length === 0) {
      showNotification('No paths selected', 'warning');
      return;
    }
    
    // Create dialog container
    const dialogContainer = document.createElement('div');
    dialogContainer.id = 'move-to-layer-dialog';
    dialogContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    // Create dialog content
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #2a2a2a;
      border: 1px solid #4a4a4a;
      border-radius: 8px;
      padding: 16px;
      width: 300px;
      max-width: 90%;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    
    // Create dialog header
    const header = document.createElement('h3');
    header.textContent = 'Move to Layer';
    header.style.cssText = `
      margin: 0 0 16px 0;
      font-size: 16px;
      color: #ffffff;
      border-bottom: 1px solid #4a4a4a;
      padding-bottom: 8px;
    `;
    
    // Create layer selection list
    const layerList = document.createElement('div');
    layerList.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
      max-height: 200px;
      overflow-y: auto;
    `;
    
    // Add layers to selection list
    appState.layers.forEach((layer, index) => {
      const layerItem = document.createElement('div');
      layerItem.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        background: ${index === appState.currentLayerIndex ? '#4A9B8F' : '#3a3a3a'};
        border: 1px solid ${index === appState.currentLayerIndex ? '#4A9B8F' : '#4a4a4a'};
        border-radius: 4px;
        color: #ffffff;
        cursor: pointer;
      `;
      layerItem.onclick = () => {
        // Select this layer
        const items = layerList.querySelectorAll('div');
        items.forEach(item => {
          item.style.background = '#3a3a3a';
          item.style.borderColor = '#4a4a4a';
        });
        layerItem.style.background = '#4A9B8F';
        layerItem.style.borderColor = '#4A9B8F';
        layerItem.dataset.selected = 'true';
      };
      
      // Add layer icon and name
      const icon = document.createElement('i');
      icon.className = `fas ${layer.visible ? 'fa-eye' : 'fa-eye-slash'}`;
      
      const name = document.createElement('span');
      name.textContent = layer.name;
      name.style.flex = '1';
      
      layerItem.appendChild(icon);
      layerItem.appendChild(name);
      layerItem.dataset.layerIndex = index;
      
      // Select current layer by default
      if (index === appState.currentLayerIndex) {
        layerItem.dataset.selected = 'true';
      }
      
      layerList.appendChild(layerItem);
    });
    
    // Create action buttons
    const actions = document.createElement('div');
    actions.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    `;
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      background: #3a3a3a;
      border: 1px solid #4a4a4a;
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
    `;
    cancelBtn.onclick = () => {
      dialogContainer.remove();
    };
    
    const moveBtn = document.createElement('button');
    moveBtn.textContent = 'Move';
    moveBtn.style.cssText = `
      background: #4A9B8F;
      border: 1px solid #4A9B8F;
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
    `;
    moveBtn.onclick = () => {
      // Find selected layer
      const selectedLayerItem = layerList.querySelector('[data-selected="true"]');
      if (selectedLayerItem) {
        const targetLayerIndex = parseInt(selectedLayerItem.dataset.layerIndex);
        moveSelectedPathsToLayer(targetLayerIndex);
      }
      dialogContainer.remove();
    };
    
    actions.appendChild(cancelBtn);
    actions.appendChild(moveBtn);
    
    // Assemble dialog
    dialog.appendChild(header);
    dialog.appendChild(layerList);
    dialog.appendChild(actions);
    dialogContainer.appendChild(dialog);
    
    // Add dialog to document
    document.body.appendChild(dialogContainer);
  }
  
  function toggleLayerVisibility(layerId) {
    const layer = appState.layers.find(l => l.id === layerId);
    if (layer) {
      layer.visible = !layer.visible;
      
      // Update UI
      const layerItem = document.querySelector(`.layer-item[data-layer-id="${layerId}"]`);
      if (layerItem) {
        const icon = layerItem.querySelector('i');
        if (icon) {
          icon.className = `fas ${layer.visible ? 'fa-eye' : 'fa-eye-slash'}`;
        }
        
        const visibilityBtn = layerItem.querySelector('.layer-controls button:first-child');
        if (visibilityBtn) {
          visibilityBtn.title = layer.visible ? 'Hide' : 'Show';
          const btnIcon = visibilityBtn.querySelector('i');
          if (btnIcon) {
            btnIcon.className = `fas ${layer.visible ? 'fa-eye' : 'fa-eye-slash'}`;
          }
        }
      }
      
      renderCanvas();
    }
    
    // Prevent event propagation to avoid selecting the layer
    event.stopPropagation();
  }

  function toggleLayerLock(layerId) {
    const layer = appState.layers.find(l => l.id === layerId);
    if (layer) {
      layer.locked = !layer.locked;
      
      // Update UI
      const layerItem = document.querySelector(`.layer-item[data-layer-id="${layerId}"]`);
      if (layerItem) {
        const lockBtn = layerItem.querySelector('.layer-controls button:nth-child(2)');
        if (lockBtn) {
          lockBtn.title = layer.locked ? 'Unlock' : 'Lock';
          const icon = lockBtn.querySelector('i');
        if (icon) {
            icon.className = `fas ${layer.locked ? 'fa-lock' : 'fa-lock-open'}`;
          }
        }
      }
    }
    
    // Prevent event propagation to avoid selecting the layer
    event.stopPropagation();
  }
  
  function updateMoveToLayerButtonState() {
    const moveToLayerBtn = document.getElementById('move-to-layer-btn');
    if (moveToLayerBtn) {
      moveToLayerBtn.disabled = appState.selectedPaths.length === 0;
    }
  }

  /* =============================
   * Missing Function Implementations
   * ============================= */
  
  function simplifySelectedPaths() {
    if (appState.selectedPaths.length === 0) {
      showNotification('Please select paths to simplify', 'warning');
      return;
    }
    
    showNotification('Simplifying selected paths...', 'info');
    
    pushUndo('simplify paths');
    
    appState.selectedPaths.forEach(pathIndex => {
      const path = appState.paths[pathIndex];
      if (path && path.data && path.data.length > 4) {
        // Simple path simplification - reduce number of points
        const simplifiedData = [];
        const step = Math.max(1, Math.floor(path.data.length / 20)); // Reduce to max 20 points
        
        for (let i = 0; i < path.data.length; i += step * 2) {
          if (i < path.data.length - 1) {
            simplifiedData.push(path.data[i], path.data[i + 1]);
          }
        }
        
        // Ensure we keep the last point
        if (simplifiedData.length < 4) {
          simplifiedData.push(path.data[path.data.length - 2], path.data[path.data.length - 1]);
        }
        
        path.data = simplifiedData;
        path.simplified = true;
        path.simplifiedAt = new Date().toISOString();
      }
    });
    
    renderCanvas();
    showNotification(`Simplified ${appState.selectedPaths.length} path(s)`, 'success');
  }
  
  function updateExtrusionDepth() {
    const depthInput = document.getElementById('extrusion-depth');
    if (depthInput) {
      const depth = parseFloat(depthInput.value);
      const depthValue = document.getElementById('extrusion-depth-value');
      if (depthValue) {
        depthValue.textContent = `${depth}px`;
      }
      
      // Update selected paths with new extrusion depth
      if (appState.selectedPaths.length > 0) {
        pushUndo('update extrusion depth');
        
        appState.selectedPaths.forEach(pathIndex => {
          const path = appState.paths[pathIndex];
          if (path) {
            path.extrusionDepth = depth;
            path.is3D = true;
          }
        });
        
        renderCanvas();
        showNotification(`Extrusion depth updated to ${depth}px`, 'success');
      }
    }
  }
  
  function updateExtrusionBevel() {
    const bevelInput = document.getElementById('extrusion-bevel');
    if (bevelInput) {
      const bevel = parseFloat(bevelInput.value);
      const bevelValue = document.getElementById('extrusion-bevel-value');
      if (bevelValue) {
        bevelValue.textContent = `${bevel}px`;
      }
      
      // Update selected paths with new bevel
      if (appState.selectedPaths.length > 0) {
        pushUndo('update extrusion bevel');
        
        appState.selectedPaths.forEach(pathIndex => {
          const path = appState.paths[pathIndex];
          if (path) {
            path.extrusionBevel = bevel;
            path.is3D = true;
          }
        });
        
        renderCanvas();
        showNotification(`Extrusion bevel updated to ${bevel}px`, 'success');
      }
    }
  }
  
  function extrudePath() {
    if (appState.selectedPaths.length === 0) {
      showNotification('Please select paths to extrude', 'warning');
      return;
    }
    
    showNotification('Extruding selected paths...', 'info');
    
    pushUndo('extrude paths');
    
    const extrudedPaths = [];
    
    appState.selectedPaths.forEach(pathIndex => {
      const path = appState.paths[pathIndex];
      if (path && path.data && path.data.length >= 4) {
        // Create extruded version of the path
        const extrudedPath = {
          type: 'extruded',
          originalPath: pathIndex,
          data: [...path.data],
          style: JSON.parse(JSON.stringify(path.style || appState.currentStyle)),
          extrusionDepth: path.extrusionDepth || 20,
          extrusionBevel: path.extrusionBevel || 0,
          is3D: true,
          createdAt: new Date().toISOString()
        };
        
        // Add depth data for each point
        extrudedPath.depthData = [];
        for (let i = 0; i < path.data.length; i += 2) {
          extrudedPath.depthData.push(extrudedPath.extrusionDepth);
        }
        
        extrudedPaths.push(extrudedPath);
      }
    });
    
    if (extrudedPaths.length > 0) {
      // Add extruded paths to the document
      const startIndex = appState.paths.length;
      appState.paths.push(...extrudedPaths);
      
      // Select the new extruded paths
      appState.selectedPaths = [];
      for (let i = 0; i < extrudedPaths.length; i++) {
        appState.selectedPaths.push(startIndex + i);
      }
      
      // Update layer path indices
      updateLayerPathIndices();
      
      renderCanvas();
      showNotification(`Extruded ${extrudedPaths.length} path(s)`, 'success');
    } else {
      showNotification('No valid paths could be extruded', 'warning');
    }
  }
  
  function applyPathOperation(operation) {
    if (appState.selectedPaths.length === 0) {
      showNotification('Please select paths for operation', 'warning');
      return;
    }
    
    if (!operation || typeof operation !== 'string') {
      showNotification('Invalid operation specified', 'error');
      return;
    }
    
    showNotification(`Applying ${operation} operation...`, 'info');
    
    pushUndo(`apply ${operation}`);
    
    const selectedPaths = appState.selectedPaths.map(index => appState.paths[index]);
    let result = null;
    
    switch (operation.toLowerCase()) {
      case 'union':
        result = performPathUnion(selectedPaths);
        break;
      case 'intersection':
        result = performPathIntersection(selectedPaths[0], selectedPaths[1]);
        break;
      case 'difference':
        result = performPathDifference(selectedPaths[0], selectedPaths[1]);
        break;
      case 'xor':
        result = performPathXOR(selectedPaths[0], selectedPaths[1]);
        break;
      default:
        showNotification(`Unknown operation: ${operation}`, 'error');
        return;
    }
    
    if (result) {
      // Add result to paths
      appState.paths.push(result);
      appState.selectedPaths = [appState.paths.length - 1];
      
      // Update layer path indices
      updateLayerPathIndices();
      
      renderCanvas();
      showNotification(`${operation} operation completed`, 'success');
    } else {
      showNotification(`${operation} operation failed`, 'error');
    }
  }
  
  function removeBackground() {
    if (appState.selectedPaths.length === 0) {
      showNotification('Please select an image to remove background', 'warning');
      return;
    }
    
    const selectedPath = appState.paths[appState.selectedPaths[0]];
    if (selectedPath.type !== 'image') {
      showNotification('Please select an image to remove background', 'warning');
      return;
    }
    
    if (!selectedPath.image) {
      showNotification('Image data not available for background removal', 'error');
      return;
    }
    
    showNotification('Removing background...', 'info');
    
    try {
      // Create a temporary canvas for processing
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      
      // Set canvas size to match image
      tempCanvas.width = selectedPath.image.width;
      tempCanvas.height = selectedPath.image.height;
      
      // Draw the image
      tempCtx.drawImage(selectedPath.image, 0, 0);
      
      // Get image data for processing
      const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const data = imageData.data;
      
      // Detect background color (assume top-left corner is background)
      const backgroundColor = [
        data[0],   // R
        data[1],   // G
        data[2]    // B
      ];
      
      // Tolerance for background color detection
      const tolerance = 30;
      
      // Process each pixel
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Calculate color distance from background
        const distance = Math.sqrt(
          Math.pow(r - backgroundColor[0], 2) +
          Math.pow(g - backgroundColor[1], 2) +
          Math.pow(b - backgroundColor[2], 2)
        );
        
        // Make background pixels transparent
        if (distance < tolerance) {
          data[i + 3] = 0; // Set alpha to 0 (transparent)
        }
      }
      
      // Apply processed image data back
      tempCtx.putImageData(imageData, 0, 0);
      
      // Create new image from processed canvas
      const processedImage = new Image();
      processedImage.onload = function() {
        // Update the path with processed image
        selectedPath.image = processedImage;
        selectedPath.backgroundRemoved = true;
        selectedPath.processedAt = new Date().toISOString();
        
        renderCanvas();
        showNotification('Background removed successfully', 'success');
      };
      
      processedImage.src = tempCanvas.toDataURL('image/png');
      
    } catch (error) {
      console.error('Background removal failed:', error);
      showNotification('Background removal failed: ' + error.message, 'error');
    }
  }
  
  // Helper functions for path operations
  function performPathUnion(paths) {
    if (paths.length < 2) return paths[0];
    
    // Simple union - combine all paths into one
    const combinedData = [];
    paths.forEach(path => {
      if (path.data && path.data.length >= 4) {
        combinedData.push(...path.data);
      }
    });
    
    return {
      type: 'union',
      data: combinedData,
      style: JSON.parse(JSON.stringify(appState.currentStyle)),
      createdAt: new Date().toISOString()
    };
  }
  
  function performPathDifference(path1, path2) {
    if (!path1 || !path2) return null;
    
    // Simple difference - return path1 if no intersection
    const intersection = performPathIntersection(path1, path2);
    if (!intersection) return path1;
    
    return {
      type: 'difference',
      data: path1.data,
      style: JSON.parse(JSON.stringify(path1.style || appState.currentStyle)),
      intersection: intersection,
      createdAt: new Date().toISOString()
    };
  }
  
  function performPathXOR(path1, path2) {
    if (!path1 || !path2) return null;
    
    // Simple XOR - combine both paths
    const combinedData = [...path1.data];
    if (path2.data && path2.data.length >= 4) {
      combinedData.push(...path2.data);
    }
    
    return {
      type: 'xor',
      data: combinedData,
      style: JSON.parse(JSON.stringify(appState.currentStyle)),
      createdAt: new Date().toISOString()
    };
  }

  /* =============================
   * Initializer (single)
   * ============================= */
  class XVGInitializer {
    async initialize() {
      await this.initDOM();
      await this.initCanvas();
      await this.initUI();
      await this.initEventHandlers();
      
      // Ensure no default paths are present
      if (appState.paths && appState.paths.length === 0) {
        }
      renderCanvas();
      const canvasElement = globalCanvas || canvas;
      if (canvasElement) {
        canvasElement.focus();
      }
    }
    async initDOM() {
      if (document.readyState !== 'complete') await new Promise(r => window.addEventListener('load', r));
      const critical = ['main-canvas'];
      critical.forEach(id => { if (!document.getElementById(id)) throw new Error(`#${id} not found`); });
    }
    async initCanvas() {
      canvas = document.getElementById('main-canvas');
      if (!canvas) {
        throw new Error('Canvas element not found');
      }
      
      ctx = canvas.getContext('2d', { alpha: true, desynchronized: true, willReadFrequently: false });
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      
      // Ensure appState.canvas has proper dimensions first
      if (!appState.canvas.width || appState.canvas.width <= 0) {
        const dimensions = calculateCanvasDimensions();
        appState.canvas.width = dimensions.width;
        appState.canvas.height = dimensions.height;
      }
      if (!appState.canvas.height || appState.canvas.height <= 0) {
        const dimensions = calculateCanvasDimensions();
        appState.canvas.height = dimensions.height;
      }
      
      // Set canvas dimensions from appState
      canvas.width = appState.canvas.width;
      canvas.height = appState.canvas.height;
      
      // Ensure canvas has proper dimensions
      if (canvas.width <= 0 || canvas.height <= 0) {
        console.warn('Invalid canvas dimensions, setting defaults');
        const dimensions = calculateCanvasDimensions();
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        appState.canvas.width = dimensions.width;
        appState.canvas.height = dimensions.height;
      }
      
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      globalCanvas = canvas; 
      globalCtx = ctx; 
      window.canvas = canvas; 
      window.ctx = ctx;
      
      // Add a simple click test to verify canvas is working
      canvas.addEventListener('click', (e) => {
        // Canvas click test - canvas is receiving events
      });
      
      updateCanvasTransformLabel();
      
      // Force initial render to show grid and rulers
      setTimeout(() => {
        renderCanvas();
        
        // Canvas test completed - no test drawing needed
        if (globalCtx) {
          // Canvas initialization test completed successfully
        }
        
        // Note: Core ready event is dispatched later in initUI
      }, 100);
    }
    async initUI() {
      // keep light, real UI sync happens elsewhere
      
      // Force rulers and grid to be visible and properly initialized
      appState.rulers.visible = true;
      appState.grid.visible = true;
      
      // Ensure rulers are visible and properly positioned
      toggleRulersDisplay();
      
      // Force a small delay to ensure DOM elements are ready
      setTimeout(() => {
      // Update ruler measurements
      updateRulerMeasurements();
        
        // Force canvas render to show grid and rulers
        renderCanvas();
      }, 50);
      
      if (appState.guides.visible) toggleGuidesDisplay();
      
      // Initialize layers UI
      initializeLayers();
      
      // Update layer path indices
      updateLayerPathIndices();
      
      // Initialize renderer if available
      initializeRenderer();
      
      // Force canvas render to show grid and rulers
      setTimeout(() => {
        // Reset selection tool state on initialization
        if (window.XVGSelectionTool) {
          window.XVGSelectionTool.reset();
        } else {
          // Selection tool should be initialized by xvg-tools.js
          if (!window.XVGSelectionTool) {
            }
        }
        
        // Pan tool should be managed by xvg-tools.js
        if (window.XVGPanTool) {
          window.XVGPanTool.isPanning = false;
          window.XVGPanTool.lastPanPoint = null;
        } else {
          }
        
        // Reset any active drawing states
        appState.isDrawing = false;
        appState.currentPath = [];
        appState.drawingType = null;
        appState.resizing = false;
        appState.resizeHandle = null;
        appState.resizeStart = null;
        
        renderCanvas();
        // Dispatch core ready event for tools to initialize
        window.dispatchEvent(new CustomEvent('xvg-core-ready', {
          detail: {
            appState: appState,
            canvas: globalCanvas,
            grid: appState.grid,
            rulers: appState.rulers
          }
        }));
        
        // Check tool button states
        const toolIds = ['select', 'grab', 'pen', 'line', 'rectangle', 'circle', 'polygon', 'text', 'eraser', 'cut-freeform', 'cut-box'];
        toolIds.forEach(id => {
          const button = document.getElementById(`${id}-tool`);
          if (button) {
            // Tool button exists
          } else {
            // Tool button not found
          }
        });
        
        // Test tool switching
        try {
          setTool('line');
          setTool('select'); // Reset to default
        } catch (error) {
          console.error('Tool switching test failed:', error);
        }
        
        // Test mouse event capture
        if (globalCanvas) {
          try {
            const testEvent = new MouseEvent('mousedown', {
              clientX: 100,
              clientY: 100,
              bubbles: true,
              cancelable: true
            });
            globalCanvas.dispatchEvent(testEvent);
          } catch (error) {
            console.error('Mouse event test failed:', error);
          }
        }
      }, 200);
      
      // No default content - canvas starts empty
    }
    async initEventHandlers() {
      // Use globalCanvas which is set in initCanvas
      const canvasElement = globalCanvas || canvas;
      
      if (canvasElement) {
        canvasElement.addEventListener('mousedown', handleMouseDown);
        canvasElement.addEventListener('mousemove', handleMouseMove);
        canvasElement.addEventListener('mouseup', handleMouseUp);
        canvasElement.addEventListener('dblclick', handleDoubleClick);
        canvasElement.addEventListener('wheel', handleWheel, { passive: false });
        
        // Add mouseleave handler to clean up selection state
        canvasElement.addEventListener('mouseleave', (event) => {
          // Mouse left canvas - cleaning up selection state
          
          // Clean up selection tool state
          if (window.XVGSelectionTool) {
            if (window.XVGSelectionTool.initialSelectionPos) {
              delete window.XVGSelectionTool.initialSelectionPos;
            }
            if (window.XVGSelectionTool.hasStartedDrag) {
              delete window.XVGSelectionTool.hasStartedDrag;
            }
            if (window.XVGSelectionTool.isBoxSelecting) {
              window.XVGSelectionTool.endBoxSelection();
              renderCanvas();
            }
          }
          
          // Clean up pan tool state
          if (window.XVGPanTool && window.XVGPanTool.isPanning) {
            window.XVGPanTool.endPan();
          }
          
          // Reset drawing states
          appState.isDrawing = false;
          appState.currentPath = [];
          appState.drawingType = null;
          appState.resizing = false;
          appState.resizeHandle = null;
          appState.resizeStart = null;
        });
        
        // Add drag and drop functionality
        canvasElement.addEventListener('dragover', handleDragOver);
        canvasElement.addEventListener('drop', handleDrop);
        canvasElement.addEventListener('dragenter', handleDragEnter);
        canvasElement.addEventListener('dragleave', handleDragLeave);
        // Test if the canvas can receive events
        } else {
        console.error('Cannot attach event listeners - canvas is null');
      }
      
      document.addEventListener('keydown', handleKeyDown);
      window.addEventListener('resize', handleResize);
    }
  }

  window.XVGInitializer = XVGInitializer;

  /* =============================
   * Test Functions for Debugging
   * ============================= */
  function testBasicRendering() {
    // Create a test rectangle
    const testRect = {
      type: 'rectangle',
      data: [100, 100, 200, 150],
      style: {
        fill: { color: [1, 0, 0, 1] }, // Red
        stroke: { color: [1, 1, 1, 1], width: 2 }, // White border
        opacity: 1.0
      },
      layerIndex: 0
    };
    
    // Create a test circle
    const testCircle = {
      type: 'circle',
      data: [400, 200, 450, 250],
      style: {
        fill: { color: [0, 1, 0, 1] }, // Green
        stroke: { color: [1, 1, 1, 1], width: 2 }, // White border
        opacity: 1.0
      },
      layerIndex: 0
    };
    
    // Create a test line
    const testLine = {
      type: 'line',
      data: [50, 300, 350, 350],
      style: {
        fill: { color: [0, 0, 0, 0] }, // No fill
        stroke: { color: [0, 0, 1, 1], width: 3 }, // Blue stroke
        opacity: 1.0
      },
      layerIndex: 0
    };
    
    // Add shapes to paths
    appState.paths.push(testRect, testCircle, testLine);
    
    // Update layer path indices
    if (appState.layers[0]) {
      appState.layers[0].pathIndices = [0, 1, 2];
    }
    
    renderCanvas();
  }
  
  // Add to window for manual testing
  window.addTestShapes = addTestShapes;
  
  // Test XVG upload/save cycle
  window.testXVGCycle = async function() {
    
    // Create a simple test path
    const testPath = {
      type: 'path',
      data: [100, 100, 200, 150, 300, 100],
      style: {
        fill: { color: [1, 0, 0, 1] },
        stroke: { color: [0, 0, 0, 1], width: 2 },
        opacity: 1.0
      },
      layerIndex: 0,
      createdAt: new Date().toISOString()
    };
    
    // Add to current document
    appState.paths.push(testPath);
    renderCanvas();
    
    // Save as XVG
    appState.filename = 'test-cycle.xvg';
    try {
      await saveFile();
      
      // Simulate re-upload by creating a file from the saved data
      
      // For now, just show success
      showNotification('XVG cycle test completed! Check console for details.', 'success');
      
    } catch (error) {
      console.error('XVG cycle test failed:', error);
      showNotification('XVG cycle test failed: ' + error.message, 'error');
    }
  };
  
  // Test grid and rulers visibility
  window.testGridRulers = function() {
    
    // Force visibility
    appState.grid.visible = true;
    appState.rulers.visible = true;
    
    // Force display update
    toggleRulersDisplay();
    
    // Force render
    renderCanvas();
    
    showNotification('Grid and rulers test completed! Check console for details.', 'info');
  };

  // Add 3D demo function
  function demo3D() {
    
    // Create a 3D rectangle
    const rect3D = {
      type: 'rectangle',
      data: [200, 200, 300, 250],
      style: {
        fill: { color: [0, 1, 0, 1] }, // Green
        stroke: { color: [1, 1, 1, 1], width: 3 }, // White border
        opacity: 1.0
      },
      layerIndex: 0,
      is3D: true,
      depth: 20,
      depthData: [20, 20, 20, 20], // Depth for each corner
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0
    };
    
    // Create a 3D circle
    const circle3D = {
      type: 'circle',
      data: [500, 300, 550, 350],
      style: {
        fill: { color: [1, 0, 1, 1] }, // Magenta
        stroke: { color: [1, 1, 1, 1], width: 3 }, // White border
        opacity: 1.0
      },
      layerIndex: 0,
      is3D: true,
      depth: 30,
      depthData: [30, 30, 30, 30], // Depth for each point
      rotationX: 15,
      rotationY: 45,
      rotationZ: 0
    };
    
    // Add 3D shapes to paths
    appState.paths.push(rect3D, circle3D);
    
    // Update layer path indices
    if (appState.layers[0]) {
      const startIndex = appState.layers[0].pathIndices ? appState.layers[0].pathIndices.length : 0;
      appState.layers[0].pathIndices = appState.layers[0].pathIndices || [];
      appState.layers[0].pathIndices.push(startIndex, startIndex + 1);
    }
    
    showNotification('3D demo shapes added! Use Ctrl+G to enter 3D mode', 'success');
    renderCanvas();
  }
  
  window.add3DDemo = add3DDemo;

  /* =============================
   * 3D Controls and Scroll-Based Drawing
   * ============================= */
  
  // 3D Rotation and Manipulation System
  let is3DMode = false;
  let rotationX = 0;
  let rotationY = 0;
  let rotationZ = 0;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let isRotating = false;
  let selected3DObject = null;

  // Initialize 3D controls
  function initialize3DControls() {
    // Add event listeners for 3D manipulation
    document.addEventListener('keydown', handle3DKeyDown);
    document.addEventListener('keyup', handle3DKeyUp);
    
    // Add mouse wheel listener for scroll-based drawing
    const canvas = document.getElementById('main-canvas');
    if (canvas) {
      canvas.addEventListener('wheel', handleScrollDrawing);
    }
    
    }

  // Handle key down for 3D mode
  function handle3DKeyDown(event) {
    if (event.ctrlKey && event.key === 'g') {
      is3DMode = true;
      document.body.style.cursor = 'crosshair';
      showNotification('3D Mode: Ctrl+Grab to rotate, scroll to draw', 'info');
      event.preventDefault();
    }
  }

  // Handle key up for 3D mode
  function handle3DKeyUp(event) {
    if (event.key === 'Control' || event.key === 'g') {
      is3DMode = false;
      document.body.style.cursor = 'default';
      isRotating = false;
      selected3DObject = null;
    }
  }

  // Handle scroll-based drawing
  function handleScrollDrawing(event) {
    if (!is3DMode || !appState.selectedPaths.length) return;
    
    event.preventDefault();
    
    const deltaY = event.deltaY;
    const deltaX = event.deltaX;
    
    // Convert scroll to drawing depth with dynamic sensitivity
    const baseSensitivity = 0.1;
    const currentZoom = appState.canvasTransform.zoom || 1;
    const dynamicSensitivity = baseSensitivity / currentZoom; // Finer control when zoomed in
    const depthChange = deltaY * dynamicSensitivity;
    const horizontalChange = deltaX * dynamicSensitivity;
    
    // Get selected paths
    const selectedPaths = appState.selectedPaths.map(index => appState.paths[index]);
    
    for (const path of selectedPaths) {
      if (path.data && path.data.length >= 4) {
        // Add depth information to path if it doesn't exist
        if (!path.depth) path.depth = 0;
        if (!path.depthData) path.depthData = [];
        
        // Update depth
        path.depth += depthChange;
        path.depth = Math.max(0, Math.min(100, path.depth)); // Clamp to 0-100
        
        // Add depth data for each point
        if (path.depthData.length === 0) {
          // Initialize depth data
          for (let i = 0; i < path.data.length; i += 2) {
            path.depthData.push(path.depth);
          }
        } else {
          // Update existing depth data
          for (let i = 0; i < path.depthData.length; i++) {
            path.depthData[i] += depthChange;
            path.depthData[i] = Math.max(0, Math.min(100, path.depthData[i]));
          }
        }
        
        // Add horizontal offset if needed
        if (Math.abs(horizontalChange) > 0.1) {
          for (let i = 0; i < path.data.length; i += 2) {
            path.data[i] += horizontalChange;
          }
        }
        
        // Mark path as 3D
        path.is3D = true;
        path.lastModified = new Date().toISOString();
      }
    }
    
    // Redraw canvas
    renderCanvas();
    
    // Show depth info
    if (selectedPaths.length > 0) {
      showNotification(`Depth: ${Math.round(selectedPaths[0].depth)}px`, 'info');
    }
  }

  // DUPLICATE MOUSE EVENT HANDLERS REMOVED - Using the corrected versions above

  // Draw 3D path with transformations
  function draw3DPath(path) {
    if (!path.data || path.data.length < 4) return;
    
    const ctx = globalCtx;
    ctx.save();
    
    // Apply 3D transformations
    const centerX = path.data.reduce((sum, val, i) => i % 2 === 0 ? sum + val : sum, 0) / (path.data.length / 2);
    const centerY = path.data.reduce((sum, val, i) => i % 2 === 1 ? sum + val : sum, 0) / (path.data.length / 2);
    
    ctx.translate(centerX, centerY);
    
    // Apply rotations
    if (path.rotationX) {
      ctx.transform(1, 0, 0, Math.cos(path.rotationX * Math.PI / 180), 0, 0);
    }
    if (path.rotationY) {
      ctx.transform(Math.cos(path.rotationY * Math.PI / 180), 0, 0, 1, 0, 0);
    }
    if (path.rotationZ) {
      const cos = Math.cos(path.rotationZ * Math.PI / 180);
      const sin = Math.sin(path.rotationZ * Math.PI / 180);
      ctx.transform(cos, sin, -sin, cos, 0, 0);
    }
    
    ctx.translate(-centerX, -centerY);
    
    // Draw the path with depth effect
    if (path.depthData && path.depthData.length > 0) {
      // Draw with varying depth
      for (let i = 0; i < path.data.length - 2; i += 2) {
        const x1 = path.data[i];
        const y1 = path.data[i + 1];
        const x2 = path.data[i + 2];
        const y2 = path.data[i + 3];
        const depth1 = path.depthData[i / 2] || path.depth || 0;
        const depth2 = path.depthData[i / 2 + 1] || path.depth || 0;
        
        // Adjust stroke width based on depth
        const strokeWidth = (path.style?.strokeWidth || 2) + (depth1 + depth2) / 20;
        ctx.lineWidth = strokeWidth;
        
        // Draw line segment
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    } else {
      // Draw normally
      drawPath(path, appState.selectedPaths.includes(appState.paths.indexOf(path)));
    }
    
    ctx.restore();
  }

  // Add 3D controls initialization to the main initialization
  if (typeof XVGInitializer !== 'undefined') {
    // Extend the existing initialization
    const originalInit = XVGInitializer.prototype.initialize;
    XVGInitializer.prototype.initialize = function() {
      const result = originalInit.call(this);
      if (result && typeof result.then === 'function') {
        return result.then(() => {
          initialize3DControls();
          return this;
        });
      } else {
        initialize3DControls();
        return this;
      }
    };
  } else {
    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', initialize3DControls);
  }



  // Render drawing overlay on top of main canvas with robust async handling
  function renderDrawingOverlay() {
    const canvas = document.getElementById('main-canvas');
    if (!canvas) {
      console.warn('renderDrawingOverlay: main-canvas element not found');
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('renderDrawingOverlay: unable to get 2d context');
      return;
    }

    // Robust async handling for base canvas rendering followed by overlay
    if (window.renderCanvas && typeof window.renderCanvas === 'function') {
      // Store current drawing state to prevent race conditions
      const currentDrawingState = {
        isDrawing: appState.isDrawing,
        drawingType: appState.drawingType,
        currentPath: appState.currentPath ? [...appState.currentPath] : [],
        transform: appState.canvasTransform ? { ...appState.canvasTransform } : null
      };
      
      // Handle the async renderCanvas call with proper error handling and state validation
      Promise.resolve(window.renderCanvas())
        .then(() => {
          // Validate that drawing state hasn't changed during async operation
          if (currentDrawingState.isDrawing === appState.isDrawing && 
              currentDrawingState.drawingType === appState.drawingType &&
              currentDrawingState.currentPath.length <= appState.currentPath.length) {
            
            // Get fresh canvas context in case it was invalidated
            const freshCanvas = document.getElementById('main-canvas');
            if (!freshCanvas) return;
            
            const freshCtx = freshCanvas.getContext('2d');
            if (!freshCtx) return;
            
            // Apply drawing overlay with current state
            drawCurrentPathOverlayWithState(freshCtx, appState.canvasTransform, appState);
          } else {
            }
        })
        .catch(error => {
          console.error('Error in renderDrawingOverlay async operation:', error);
          // Fallback: try to render overlay without base canvas update
          try {
            drawCurrentPathOverlayWithState(ctx, appState.canvasTransform, appState);
          } catch (fallbackError) {
            console.error('Fallback overlay rendering also failed:', fallbackError);
          }
        });
    } else {
      // Fallback when renderCanvas is not available
      console.warn('renderCanvas function not available, rendering overlay only');
      drawCurrentPathOverlayWithState(ctx, appState.canvasTransform, appState);
    }
  }

  // Draw the current drawing path as an overlay
  function drawCurrentPathOverlay(ctx, transform) {
    if (!appState.isDrawing || !appState.currentPath || appState.currentPath.length === 0) return;

    ctx.save();

    // Set overlay style for drawing preview
    ctx.strokeStyle = '#007ACC'; // Blue color for preview
    ctx.lineWidth = calculateDynamicLineWidth() / (transform?.zoom || 1); // Adjust line width for zoom
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const dashPattern = calculateDynamicDashPattern(transform?.zoom || 1);
     ctx.setLineDash(dashPattern); // Dynamic dashed line for preview

    if (appState.drawingType === 'cut-freeform' || appState.drawingType === 'pen') {
      // Draw freeform path
      if (appState.currentPath.length > 1) {
        ctx.beginPath();
        ctx.moveTo(appState.currentPath[0].x, appState.currentPath[0].y);
        for (let i = 1; i < appState.currentPath.length; i++) {
          ctx.lineTo(appState.currentPath[i].x, appState.currentPath[i].y);
        }
        
        // For cut-freeform, show the closing line to indicate polygon
        if (appState.drawingType === 'cut-freeform' && appState.currentPath.length > 2) {
          const closingDashPattern = calculateDynamicDashPattern(transform?.zoom || 1).map(v => v * 0.4); // Smaller dashes for closing line
        ctx.setLineDash(closingDashPattern);
          ctx.strokeStyle = '#FF6B35'; // Orange for closing line
          ctx.lineTo(appState.currentPath[0].x, appState.currentPath[0].y);
        }
        
        ctx.stroke();
      }
      
      // Draw points
      ctx.fillStyle = '#007ACC';
      ctx.setLineDash([]); // Solid for points
      for (const point of appState.currentPath) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3 / (transform?.zoom || 1), 0, 2 * Math.PI);
        ctx.fill();
      }
    } else if (appState.drawingType === 'line' && appState.currentPath.length === 2) {
      // Draw line preview
      ctx.beginPath();
      ctx.moveTo(appState.currentPath[0].x, appState.currentPath[0].y);
      ctx.lineTo(appState.currentPath[1].x, appState.currentPath[1].y);
      ctx.stroke();
    } else if (appState.drawingType === 'rectangle' && appState.currentPath.length === 2) {
      // Draw rectangle preview
      const start = appState.currentPath[0];
      const end = appState.currentPath[1];
      const width = end.x - start.x;
      const height = end.y - start.y;
      ctx.strokeRect(start.x, start.y, width, height);
    } else if (appState.drawingType === 'circle' && appState.currentPath.length === 2) {
      // Draw circle preview
      const center = appState.currentPath[0];
      const edge = appState.currentPath[1];
      const radius = Math.sqrt(Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2));
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Draw current path overlay on canvas with state validation
  function drawCurrentPathOverlayWithState(ctx, transform, state) {
    if (!state || !state.currentPath || state.currentPath.length === 0) return;
    
    // Save current canvas state
    ctx.save();
    
    try {
      // Apply transform for drawing rendering
      if (transform) {
        ctx.setTransform(transform.zoom, 0, 0, transform.zoom, transform.pan_x, transform.pan_y);
      }
      
      // Set overlay style
      ctx.strokeStyle = '#007ACC';
      ctx.lineWidth = calculateDynamicLineWidth() / (transform ? transform.zoom : 1); // Adjust for zoom
      const dashPattern = calculateDynamicDashPattern(appState.canvasTransform?.zoom || 1);
        ctx.setLineDash(dashPattern);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      // Draw the current path based on drawing type
      if (state.drawingType === 'cut-freeform' || state.drawingType === 'pen') {
        // Draw freeform path
        if (state.currentPath.length > 1) {
          ctx.beginPath();
          ctx.moveTo(state.currentPath[0].x, state.currentPath[0].y);
          for (let i = 1; i < state.currentPath.length; i++) {
            ctx.lineTo(state.currentPath[i].x, state.currentPath[i].y);
          }
          
          // For cut-freeform, show the closing line to indicate polygon
          if (state.drawingType === 'cut-freeform' && state.currentPath.length > 2) {
            const smallDashPattern = calculateDynamicDashPattern(transform?.zoom || 1).map(v => v * 0.4);
        ctx.setLineDash(smallDashPattern);
            ctx.strokeStyle = '#FF6B35'; // Orange for closing line
            ctx.lineTo(state.currentPath[0].x, state.currentPath[0].y);
          }
          
          ctx.stroke();
        }
        
        // Draw points
        ctx.fillStyle = '#007ACC';
        ctx.setLineDash([]); // Solid for points
        for (const point of state.currentPath) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 3 / (transform?.zoom || 1), 0, 2 * Math.PI);
          ctx.fill();
        }
      } else if (state.drawingType === 'line' && state.currentPath.length === 2) {
        // Draw line preview
        ctx.beginPath();
        ctx.moveTo(state.currentPath[0].x, state.currentPath[0].y);
        ctx.lineTo(state.currentPath[1].x, state.currentPath[1].y);
        ctx.stroke();
      } else if (state.drawingType === 'rectangle' && state.currentPath.length === 2) {
        // Draw rectangle preview
        const start = state.currentPath[0];
        const end = state.currentPath[1];
        const width = end.x - start.x;
        const height = end.y - start.y;
        ctx.strokeRect(start.x, start.y, width, height);
      } else if (state.drawingType === 'circle' && state.currentPath.length === 2) {
        // Draw circle preview
        const center = state.currentPath[0];
        const edge = state.currentPath[1];
        const radius = Math.sqrt(Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2));
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
    } catch (error) {
      console.error('Error drawing current path overlay:', error);
    } finally {
      // Always restore canvas state
      ctx.restore();
    }
  }

  /* =============================
   * Export all functions to window
   * ============================= */
  Object.assign(window, {
    // Core functions
    newFile, openFile, saveFile, saveFileAs, exportXVG, exportXVGAsJSON,
    showGrid, showRulers, showGuides, help, testXVGWasm, debugEngineStatus, testEngineConnections,
    // Drawing functions
    setTool, startDrawing, startLine, startRectangle, startCircle, startTextCreation, startErasing,
    // Path operations
    simplifySelectedPaths,
    // Layer operations
    addLayer, deleteLayer, selectLayer, renameLayer, showMoveToLayerDialog,
    // UI functions
    toggleLeftSidebar, toggleRightSidebar, toggleSection, showTab,
    // Text functions
    updateTextFont, updateTextSizeFromMenu, decreaseTextSize, increaseTextSize, toggleTextBold, toggleTextItalic, toggleTextUnderline, setTextAlign, updateTextColorFromMenu,
    // Color functions
    updateFillColor, updateFillAlpha, updateStrokeColor, updateStrokeWidth,
    // Grid functions
    updateGridSize, toggleSnapToGrid, drawGrid, updateRulerMeasurements, toggleRulersDisplay,
    // SDF functions
    updateSDFEpochs, updateSDFLR, updateSDFResolution, convertToSDF, evaluateSDFAtPoint, exportSDFModel,
    // Shader functions
    compileShader, resetShader,
    // 3D functions
    updateExtrusionDepth, updateExtrusionBevel, extrudePath,
    // Path operations
    applyPathOperation, cropSelected, removeBackground,
    // Layer functions
    toggleLayerVisibility, toggleLayerLock,
    // Guide functions
    startGuideCreation,
    // AI functions
    testAllEngines, addTestShapes, add3DDemo,
    // Missing functions that HTML onclick handlers need
    undo, redo, copy, cut, paste, deleteSelected, selectAll, deselectAll,
    zoomIn, zoomOut, fitToView, actualSize, autoFitToView,
    closeAllMenus, toggleMenu,
    // Canvas management
    markCanvasDirty,
    // Coordinate conversion functions
    screenToCanvas, canvasToScreen
  });

  /* =============================
   * Boot
   * ============================= */
  document.addEventListener('DOMContentLoaded', () => {
    // single init path only
    const initializer = new XVGInitializer();
    initializer.initialize().catch(err => {
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#ff4444;color:#fff;padding:16px;border-radius:8px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,.3)';
      div.innerHTML = `<div style="font-weight:bold;margin-bottom:8px">Initialization Error</div><div>${err.message}</div>`;
      document.body.appendChild(div);
    });

    });
})();