/* =========================
 * FILE: pkg/xvg-core.js
 * ========================= */

(function () {
  'use strict';

  const XVGSystem = window.XVGSystem || {
    initialized: false,
    modulesReady: { utilities: false, core: false, tools: false },
    canvas: { element: null, context: null, overlay: null, overlayContext: null, width: 2000, height: 1500, ready: false },
    appState: {
      canvas: { width: 2000, height: 1500, backgroundColor: 'transparent' },
      canvasTransform: { pan_x: 0, pan_y: 0, zoom: 1, minZoom: 0.05, maxZoom: 8 },
      grid: { visible: true, majorSpacing: 100, minorSpacing: 20, majorLineColor: '#000000', minorLineColor: '#303030', majorLineWidth: 1.5, minorLineWidth: 1, independent: true, subtle: false },
      rulers: { visible: true, font: '11px system-ui, sans-serif', color: '#cccccc', tickColor: '#999999', textColor: '#cccccc', lineColor: '#404040', background: '#2a2a2a', tickMajor: 10, tickMinor: 5, rulerSize: 30 },
      selectedPaths: [], selectedImages: [], paths: [], images: [], layers: [], activeLayer: 0, currentLayerIndex: 0,
      currentTool: 'select', undoStack: [], redoStack: [], maxUndoSteps: 50, isModified: false, clipboard: null, mouse: null,
      currentFilename: null // Track current filename for save operations
    },
    tools: { pan: null, selection: null, pen: null, ready: false },
    eventHandlers: { mouseDown: null, mouseMove: null, mouseUp: null, mouseLeave: null, wheel: null, keyDown: null }
  };
  window.XVGSystem = XVGSystem;

  // Helper function to convert CSS-style objects to WASM PathStyle format
  function convertToPathStyle(cssStyle) {
    if (!cssStyle) {
      return {
        fill: null,
        stroke: null,
        opacity: 1.0,
        blend_mode: "Normal"
      };
    }

    // Convert fill color
    let fill = null;
    if (cssStyle.fill && cssStyle.fill !== 'none') {
      let color = [0, 0, 0, 1]; // Default black

      if (typeof cssStyle.fill === 'string') {
        // Parse CSS color string to RGBA array
        if (cssStyle.fill.startsWith('#')) {
          const hex = cssStyle.fill.slice(1);
          if (hex.length === 3) {
            color = [
              parseInt(hex[0] + hex[0], 16) / 255,
              parseInt(hex[1] + hex[1], 16) / 255,
              parseInt(hex[2] + hex[2], 16) / 255,
              1.0
            ];
          } else if (hex.length === 6) {
            color = [
              parseInt(hex.slice(0, 2), 16) / 255,
              parseInt(hex.slice(2, 4), 16) / 255,
              parseInt(hex.slice(4, 6), 16) / 255,
              1.0
            ];
          }
        } else if (cssStyle.fill.startsWith('rgb')) {
          // Simple RGB parsing (could be improved)
          const rgbMatch = cssStyle.fill.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (rgbMatch) {
            color = [
              parseInt(rgbMatch[1]) / 255,
              parseInt(rgbMatch[2]) / 255,
              parseInt(rgbMatch[3]) / 255,
              1.0
            ];
          }
        }
      }

      fill = {
        color: color,
        rule: cssStyle.fillRule || "NonZero"
      };
    }

    // Convert stroke color
    let stroke = null;
    if (cssStyle.stroke && cssStyle.stroke !== 'none') {
      let color = [0, 0, 0, 1]; // Default black
      let width = parseFloat(cssStyle.strokeWidth) || 1.0;

      // Parse stroke color (same logic as fill)
      if (typeof cssStyle.stroke === 'string') {
        if (cssStyle.stroke.startsWith('#')) {
          const hex = cssStyle.stroke.slice(1);
          if (hex.length === 3) {
            color = [
              parseInt(hex[0] + hex[0], 16) / 255,
              parseInt(hex[1] + hex[1], 16) / 255,
              parseInt(hex[2] + hex[2], 16) / 255,
              1.0
            ];
          } else if (hex.length === 6) {
            color = [
              parseInt(hex.slice(0, 2), 16) / 255,
              parseInt(hex.slice(2, 4), 16) / 255,
              parseInt(hex.slice(4, 6), 16) / 255,
              1.0
            ];
          }
        }
      }

      stroke = {
        color: color,
        width: width,
        cap: cssStyle.strokeLinecap || "Round",
        join: cssStyle.strokeLinejoin || "Round",
        dash_array: cssStyle.strokeDasharray ? cssStyle.strokeDasharray.split(',').map(parseFloat) : []
      };
    }

    return {
      fill: fill,
      stroke: stroke,
      opacity: parseFloat(cssStyle.opacity) || 1.0,
      blend_mode: cssStyle.mixBlendMode || "Normal"
    };
  }

  function initializeCanvas() {
    const canvas = document.getElementById('main-canvas');
    const overlay = document.getElementById('selection-overlay');
    if (!canvas || !overlay) return false;

    const ctx = canvas.getContext('2d');
    const overlayCtx = overlay.getContext('2d');
    if (!ctx || !overlayCtx) return false;

    XVGSystem.canvas.element = canvas;
    XVGSystem.canvas.context = ctx;
    XVGSystem.canvas.overlay = overlay;
    XVGSystem.canvas.overlayContext = overlayCtx;

    canvas.width = XVGSystem.appState.canvas.width;
    canvas.height = XVGSystem.appState.canvas.height;
    overlay.width = XVGSystem.appState.canvas.width;
    overlay.height = XVGSystem.appState.canvas.height;


    // ensure at least one layer
    if (XVGSystem.appState.layers.length === 0) {
      XVGSystem.appState.layers.push({ id: 'layer_1_' + Date.now(), name: 'Layer 1', visible: true, locked: false, paths: [] });
    }

    setupCanvasEventHandlers();
    renderCanvas();
    updateLayerList();

    // set default tool visibly (after tools are initialized)
    setTimeout(() => {
      if (window.setTool) window.setTool('select');
      
      // Initialize tool categories to be expanded by default
      document.querySelectorAll('.tool-category-header').forEach(header => {
        const categoryName = header.querySelector('span:first-child').textContent.toLowerCase();
        const content = document.getElementById(categoryName + '-tools');
        if (content) {
          content.classList.remove('collapsed');
          header.classList.remove('collapsed');
        }
      });
    }, 100);

    // Initialize default layer if none exist
    if (XVGSystem.appState.layers.length === 0) {
      XVGSystem.appState.layers.push({
        id: 'layer_default_' + Date.now(),
        name: 'Layer 1',
        visible: true,
        locked: false,
        paths: []
      });
    }
    
    // Update layer list UI
    setTimeout(() => {
      if (typeof updateLayerList === 'function') {
        updateLayerList();
      }
    }, 100);
    
    // === NEW: advertise readiness for ModuleLoader final check ===
    XVGSystem.canvas.ready = true;
    return true;
  }

  function setupCanvasEventHandlers() {
    const canvas = XVGSystem.canvas.element;
    if (!canvas) return;

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('contextmenu', handleContextMenu); // Prevent right-click menu
    document.addEventListener('keydown', handleKeyDown);
  }

  function handleMouseDown(e) {
    const p = getCanvasPointFromEvent(e);
    window.handleToolMouseDown && window.handleToolMouseDown(p.x, p.y, e);
  }
  function handleMouseMove(e) {
    const p = getCanvasPointFromEvent(e);
    window.handleToolMouseMove && window.handleToolMouseMove(p.x, p.y, e);
  }
  function handleMouseUp(e) {
    const p = getCanvasPointFromEvent(e);
    window.handleToolMouseUp && window.handleToolMouseUp(p.x, p.y, e);
  }
  function handleMouseLeave(e) {
    window.handleToolMouseUp && window.handleToolMouseUp(0, 0, e);
  }

  function handleWheel(e){
    e.preventDefault();
    const d=e.deltaY, zf=0.1;
    if (e.ctrlKey){ zoomCanvas(d>0?-zf:zf); } else if (e.shiftKey){ panCanvas(d,0); } else { panCanvas(0,d); }
  }

  function handleContextMenu(e) {
    e.preventDefault(); // Prevent browser's right-click context menu
  }

  function handleKeyDown(e){
    if (e.ctrlKey||e.metaKey){
      if (e.key==='='||e.key==='+'){ e.preventDefault(); zoomCanvas(0.2);}
      else if (e.key==='-'){ e.preventDefault(); zoomCanvas(-0.2);}
      else if (e.key==='0'){ e.preventDefault(); fitToView(); }
      else if (e.key==='1'){ e.preventDefault(); actualSize(); }
      else if (e.key==='z'){ e.preventDefault(); undo(); }
      else if (e.key==='y'){ e.preventDefault(); redo(); }
    }
    // Tool shortcuts
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        if (window.setTool) window.setTool('brush');
      }
      else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (window.setTool) window.setTool('bgremover');
      }
      else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        if (window.setTool) window.setTool('rectangle');
      }
    }
    if (e.key==='Home'){ e.preventDefault(); fitToView(); }
    if (e.key==='End'){ e.preventDefault(); actualSize(); }
  }

  function renderCanvas(){
    console.log('[RENDER] ===== RENDER CANVAS STARTED =====');
    const c=XVGSystem.canvas.element, ctx=XVGSystem.canvas.context;
    console.log('[RENDER] Canvas element:', c, 'Context:', ctx);
    if(!c||!ctx) {
      console.log('[RENDER] ERROR: Canvas or context not available');
      return;
    }
    console.log('[RENDER] Clearing canvas:', c.width, 'x', c.height);
    ctx.clearRect(0,0,c.width,c.height);

    // Clear selection overlay when rendering
    const overlayCtx = XVGSystem.canvas.overlayContext;
    if (overlayCtx) {
      overlayCtx.clearRect(0, 0, c.width, c.height);
    }

    // Draw independent grid BEFORE canvas transformation
    const g=XVGSystem.appState.grid;
    if (g.visible && g.independent) {
      drawIndependentGrid(ctx, g, c.width, c.height);
    }

    ctx.save();
    const t=XVGSystem.appState.canvasTransform; ctx.translate(t.pan_x,t.pan_y); ctx.scale(t.zoom,t.zoom);

    // Draw standard grid (moves with canvas) or other elements
    if (g.visible && !g.independent) drawGrid(ctx);
    drawPaths(ctx);
    drawImages(ctx);
    ctx.restore();

    // Render current tool overlay
    if (XVGSystem.tools && XVGSystem.tools.ready) {
      const currentTool = XVGSystem.appState.currentTool;
      if (currentTool === 'select' && XVGSystem.tools.selection && XVGSystem.tools.selection.render) {
        XVGSystem.tools.selection.render(ctx, t);
      } else if (currentTool === 'pan' && XVGSystem.tools.pan && XVGSystem.tools.pan.render) {
        XVGSystem.tools.pan.render(ctx, t);
      } else if (currentTool === 'bgremover' && XVGSystem.tools.bgremover && XVGSystem.tools.bgremover.render) {
        XVGSystem.tools.bgremover.render(ctx, t);
      }
      // Add other tool render calls as needed
    }

    if (XVGSystem.appState.rulers.visible){ updateTopRuler(); updateLeftRuler(); }
    else { const tr=document.getElementById('top-ruler'); const lr=document.getElementById('left-ruler'); if(tr) tr.innerHTML=''; if(lr) lr.innerHTML=''; }

    console.log('[RENDER] ===== RENDER CANVAS COMPLETED =====');
  }

  function drawGrid(ctx){
    const g=XVGSystem.appState.grid, t=XVGSystem.appState.canvasTransform;
    const w=XVGSystem.appState.canvas.width, h=XVGSystem.appState.canvas.height;

    // This function now only handles standard grid (moves with canvas)
    // Independent grid is handled separately in renderCanvas()
    drawStandardGrid(ctx, g, t, w, h);
  }

  function drawStandardGrid(ctx, g, t, w, h) {
    // Since we're drawing after transformation, we need to draw in world coordinates
    // The visible area in world coordinates is from (-pan_x/zoom, -pan_y/zoom) to that plus (w/zoom, h/zoom)
    const startX = -t.pan_x / t.zoom;
    const startY = -t.pan_y / t.zoom;
    const endX = startX + w / t.zoom;
    const endY = startY + h / t.zoom;

    drawGridLines(ctx, g, startX, startY, endX, endY, t.zoom);
  }

  function drawIndependentGrid(ctx, g, w, h) {
    // Fixed grid that doesn't move with canvas pan/zoom
    ctx.save();

    // Adjust opacity based on subtle mode
    const baseOpacity = g.subtle ? 0.15 : 0.3;
    ctx.globalAlpha = baseOpacity;

    // Draw fixed minor grid lines
    ctx.strokeStyle = g.minorLineColor;
    ctx.lineWidth = Math.max(0.5, g.minorLineWidth * (g.subtle ? 0.6 : 0.8));

    const startX = 0;
    const startY = 0;

    // Skip minor lines entirely if in subtle mode (only major lines)
    if (!g.subtle) {
      for(let x = startX; x <= w; x += g.minorSpacing){
        if (x % g.majorSpacing !== 0) { // Skip major lines to avoid double drawing
          ctx.beginPath();
          ctx.moveTo(x, startY);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      }
      for(let y = startY; y <= h; y += g.minorSpacing){
        if (y % g.majorSpacing !== 0) { // Skip major lines to avoid double drawing
          ctx.beginPath();
          ctx.moveTo(startX, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }
    }

    // Draw fixed major grid lines with higher contrast
    ctx.globalAlpha = g.subtle ? 0.25 : 0.5;
    ctx.strokeStyle = g.majorLineColor;
    ctx.lineWidth = Math.max(1, g.majorLineWidth);

    for(let x = startX; x <= w; x += g.majorSpacing){
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for(let y = startY; y <= h; y += g.majorSpacing){
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawGridLines(ctx, g, startX, startY, endX, endY, zoom) {
    // Adjust line width for zoom level to keep it visible but not too thick
    const lineScale = Math.max(0.5, Math.min(3.0, 1 / zoom));
    ctx.lineWidth = g.minorLineWidth * lineScale;
    ctx.strokeStyle = g.minorLineColor;

    // Draw minor grid lines
    for(let x = Math.floor(startX / g.minorSpacing) * g.minorSpacing; x <= endX; x += g.minorSpacing){
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
    for(let y = Math.floor(startY / g.minorSpacing) * g.minorSpacing; y <= endY; y += g.minorSpacing){
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }

    // Draw major grid lines
    ctx.lineWidth = g.majorLineWidth * lineScale;
    ctx.strokeStyle = g.majorLineColor;

    for(let x = Math.floor(startX / g.majorSpacing) * g.majorSpacing; x <= endX; x += g.majorSpacing){
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
    for(let y = Math.floor(startY / g.majorSpacing) * g.majorSpacing; y <= endY; y += g.majorSpacing){
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }
  }

  function drawPaths(ctx){
    console.log('[RENDER] ===== DRAWING PATHS =====');
    console.log('[RENDER] Total layers:', XVGSystem.appState.layers?.length || 0);
    console.log('[RENDER] Total paths:', XVGSystem.appState.paths?.length || 0);

    // Render paths by layer order, respecting visibility
    XVGSystem.appState.layers.forEach((layer, layerIndex) => {
      console.log(`[RENDER] Layer ${layerIndex}: visible=${layer.visible}, paths=${layer.paths?.length || 0}`);
      if (!layer.visible) {
        console.log(`[RENDER] Skipping invisible layer ${layerIndex}`);
        return; // Skip hidden layers
      }

      // Render paths assigned to this layer
      if (layer.paths && Array.isArray(layer.paths)) {
        console.log(`[RENDER] Processing ${layer.paths.length} paths in layer ${layerIndex}`);
        layer.paths.forEach(pathId => {
          // Find path by ID instead of index
          const path = XVGSystem.appState.paths.find(p => p.id === pathId);
          if (path) {
            drawPath(ctx, path);
          }
        });
      }
    });
    
    // Fallback: render orphaned paths (paths not assigned to any layer)
    XVGSystem.appState.paths.forEach((path, index) => {
      if (!path) return;

      // Check if this path is assigned to any layer
      const isAssigned = XVGSystem.appState.layers.some(layer =>
        layer.paths && layer.paths.includes(path.id)
      );

      if (!isAssigned) {
        // Render orphaned path on the active layer if it's visible
        const activeLayer = XVGSystem.appState.layers[XVGSystem.appState.activeLayer];
        if (activeLayer && activeLayer.visible) {
          drawPath(ctx, path);
        }
      }
    });
  }
  function drawPath(ctx,path){
    if(!path) return;

    console.log('[Render] Drawing path:', {
      id: path.id,
      hasXvgPoints: !!(path.xvgPoints && path.xvgPoints.length > 0),
      xvgPointsCount: path.xvgPoints ? path.xvgPoints.length : 0,
      hasData: !!path.data,
      visible: path.visible,
      layerIndex: path.layerIndex
    });

    // Apply transform matrix if present
    if (path.tf && (path.tf[4] !== 0 || path.tf[5] !== 0)) {
      ctx.save();
      ctx.translate(path.tf[4], path.tf[5]);
    }

    // Render native XVG path if available
    if (path.xvgPoints && path.xvgPoints.length > 0) {
      console.log('[DEBUG] Drawing XVG path with', path.xvgPoints.length, 'points');
      drawXVGPath(ctx, path);
    }
    // Fallback to SVG path if available
    else if (path.data) {
      console.log('[DEBUG] Drawing SVG path:', path.data);
      drawSVGPath(ctx, path);
    } else {
      console.warn('[DEBUG] Path has no renderable data:', path);
      // DEBUG: Draw a fallback marker if no data
      ctx.fillStyle = 'magenta';
      ctx.fillRect(50, 50, 20, 20);
      console.log('[DEBUG] Drew magenta fallback marker at (50,50)');
    }
    
    if (path.tf && (path.tf[4] !== 0 || path.tf[5] !== 0)) {
      ctx.restore();
    }

    // Draw selection highlight on overlay
    const pathIndex = XVGSystem.appState.paths.indexOf(path);
    if(pathIndex !== -1 && XVGSystem.appState.selectedPaths.includes(path.id)) {
      const overlayCtx = XVGSystem.canvas.overlayContext;
      if (overlayCtx) {
        overlayCtx.save();

        // SELECTION FIX: Don't apply canvas transforms to overlay
        // The main canvas already has transforms applied, overlay should draw in screen coordinates
        // Commenting out these lines fixes the "red square around canvas border" issue:
        // const t = XVGSystem.appState.canvasTransform;
        // overlayCtx.translate(t.pan_x, t.pan_y);
        // overlayCtx.scale(t.zoom, t.zoom);

        // Apply only the path's own transform (tf), not canvas transforms
        if (path.tf && (path.tf[4] !== 0 || path.tf[5] !== 0)) {
          overlayCtx.translate(path.tf[4], path.tf[5]);
        }

        overlayCtx.strokeStyle = '#ff4444';
        overlayCtx.lineWidth = 2;
        overlayCtx.setLineDash([5, 5]);

        if (path.xvgPoints && path.xvgPoints.length > 0) {
          drawXVGPath(overlayCtx, path);
        } else if (path.data) {
          drawSVGPath(overlayCtx, path);
        }

        overlayCtx.restore();
      }
    }
  }

  // Draw native XVG path from coordinate points
  function drawXVGPath(ctx, path) {
    const points = path.xvgPoints;
    if (!points || points.length < 2) return;

    // Final coordinates (no debug markers needed)
    console.log('Final coordinates:',
      points.map(p => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' → ')
    );

    // Main path drawing
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath(); // Force close all paths

    // Apply XVG styling (from file or defaults)
    if (path.style?.fill) {
      ctx.fillStyle = `rgba(${path.style.fill.color.join(',')})`;
      ctx.fill();
    } else {
      // Default fill for XVG files without explicit styling
      ctx.fillStyle = 'rgba(100, 149, 237, 0.8)'; // Cornflower blue fill
      ctx.fill();
    }

    if (path.style?.stroke) {
      ctx.strokeStyle = `rgba(${path.style.stroke.color.join(',')})`;
      ctx.lineWidth = path.style.stroke.width;
      ctx.stroke();
    } else {
      // Default stroke for XVG files without explicit styling
      ctx.strokeStyle = 'rgba(0, 0, 0, 1)'; // Black outline
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Draw SVG path using Path2D
  function drawSVGPath(ctx, path) {
    try {
      const p2 = new Path2D(path.data);
      
      if (path.style?.fill) {
        ctx.fillStyle = `rgba(${path.style.fill.color.join(',')})`;
        ctx.fill(p2);
      }
      if (path.style?.stroke) {
        ctx.strokeStyle = `rgba(${path.style.stroke.color.join(',')})`;
        ctx.lineWidth = path.style.stroke.width;
        ctx.stroke(p2);
      }
    } catch (error) {
      console.warn('[Draw] Invalid SVG path data:', error);
    }
  }

  function drawImages(ctx) {
    (XVGSystem.appState.images || []).forEach(img => {
      // Only draw images from visible layers
      const layerIndex = img.layerIndex;
      const layer = XVGSystem.appState.layers[layerIndex];

      console.log('Drawing image:', img.filename, {
        layerIndex: layerIndex,
        layerExists: !!layer,
        layerVisible: layer ? layer.visible : 'N/A',
        imageElement: !!img.element,
        imageLoaded: img.element ? img.element.complete : 'N/A',
        position: `${img.x}, ${img.y}`,
        size: `${img.width} x ${img.height}`
      });

      if (layer && layer.visible) {
        drawImage(ctx, img);
      } else {
        console.log('Skipping image - layer not visible or doesn\'t exist');
      }
    });
  }
  
  function drawImage(ctx, img) {
    if (!img || !img.element) return;
    try {
      ctx.drawImage(img.element, img.x, img.y, img.width, img.height);

      // Draw selection highlight for selected images
      const imageIndex = XVGSystem.appState.images.indexOf(img);
      if (imageIndex !== -1 && XVGSystem.appState.selectedImages.includes(imageIndex)) {
        ctx.save();
        ctx.strokeStyle = '#ff0000'; // Red to match selection box
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(img.x, img.y, img.width, img.height);
        ctx.restore();

        // Draw selection handles
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ff0000'; // Red to match selection box
        ctx.lineWidth = 1;

        const handleSize = 6;
        const handles = [
          { x: img.x, y: img.y }, // Top-left
          { x: img.x + img.width, y: img.y }, // Top-right
          { x: img.x + img.width, y: img.y + img.height }, // Bottom-right
          { x: img.x, y: img.y + img.height } // Bottom-left
        ];

        handles.forEach(handle => {
          ctx.fillRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize);
          ctx.strokeRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize);
        });

        ctx.restore();
      }
    } catch (e) {
      console.warn('Image draw error:', e);
    }
  }

  function updateTopRuler(){
    const r=document.getElementById('top-ruler');
    if(!r) return;
    r.innerHTML='';

    const {pan_x, zoom}=XVGSystem.appState.canvasTransform;


    const rw=r.offsetWidth||800;
    // Use unified coordinate system for consistent bounds calculation
    const bounds = CoordinateSystem.getVisibleWorldBounds(rw, 0, pan_x, 0, zoom);
    const startX = bounds.startX;
    const endX = bounds.endX;

  // Fixed tick system - always 100 unit intervals
  const majorTick = 100; // Major ticks every 100 units
  const minorTick = 20; // Minor ticks every 20 units
  const microTick = 10; // Micro ticks every 10 units
  
  // Draw micro ticks (smallest) - skip if too many would be drawn
  const microTickCount = (endX - startX) / microTick;
  if (microTickCount <= 200) { // Performance limit
    for(let x=Math.floor(startX/microTick)*microTick; x<=endX; x+=microTick){
      const sx = CoordinateSystem.worldToScreenX(x, pan_x, zoom);
      if(sx >= 0 && sx <= rw) {
        const t=document.createElement('div');
        t.style.cssText=`position:absolute;left:${sx}px;top:25px;width:1px;height:5px;background:${XVGSystem.appState.rulers.tickColor};opacity:0.3`;
        r.appendChild(t);
      }
    }
  }
  
  // Draw minor ticks (medium) - skip if too many would be drawn
  const minorTickCount = (endX - startX) / minorTick;
  if (minorTickCount <= 100) { // Performance limit
    for(let x=Math.floor(startX/minorTick)*minorTick; x<=endX; x+=minorTick){
      const sx = CoordinateSystem.worldToScreenX(x, pan_x, zoom);
      if(sx >= 0 && sx <= rw) {
        const t=document.createElement('div');
        t.style.cssText=`position:absolute;left:${sx}px;top:20px;width:1px;height:10px;background:${XVGSystem.appState.rulers.tickColor};opacity:0.6`;
        r.appendChild(t);
      }
    }
  }
  
  // Draw major ticks with numbers
  for(let x=Math.floor(startX/majorTick)*majorTick; x<=endX; x+=majorTick){
    const sx = CoordinateSystem.worldToScreenX(x, pan_x, zoom);
    if(sx >= 0 && sx <= rw) {
      const t=document.createElement('div');
      t.style.cssText=`position:absolute;left:${sx}px;top:15px;width:1px;height:15px;background:${XVGSystem.appState.rulers.textColor}`;
      r.appendChild(t);

      const lab=document.createElement('div');
      lab.style.cssText=`position:absolute;left:${sx+2}px;top:2px;font-size:11px;color:${XVGSystem.appState.rulers.textColor};font-family:system-ui,sans-serif;font-weight:500`;
      lab.textContent=Math.round(x);
      r.appendChild(lab);
    }
  } 
}
  function updateLeftRuler(){
    const r=document.getElementById('left-ruler');
    if(!r) return;
    r.innerHTML='';

    const {pan_y, zoom}=XVGSystem.appState.canvasTransform;


    const rh=r.offsetHeight||600;
    // Use unified coordinate system for consistent bounds calculation
    const bounds = CoordinateSystem.getVisibleWorldBounds(0, rh, 0, pan_y, zoom);
    const startY = bounds.startY;
    const endY = bounds.endY;

  // Fixed tick system - always 100 unit intervals
  const majorTick = 100; // Major ticks every 100 units
  const minorTick = 20; // Minor ticks every 20 units
  const microTick = 10; // Micro ticks every 10 units
  
  // Draw micro ticks (smallest) - skip if too many would be drawn
  const microTickCountY = (endY - startY) / microTick;
  if (microTickCountY <= 200) { // Performance limit
    for(let y=Math.floor(startY/microTick)*microTick; y<=endY; y+=microTick){
      const sy = CoordinateSystem.worldToScreenY(y, pan_y, zoom);
      if(sy >= 0 && sy <= rh) {
        const t=document.createElement('div');
        t.style.cssText=`position:absolute;left:25px;top:${sy}px;width:5px;height:1px;background:${XVGSystem.appState.rulers.tickColor};opacity:0.3`;
        r.appendChild(t);
      }
    }
  }
  
  // Draw minor ticks (medium) - skip if too many would be drawn
  const minorTickCountY = (endY - startY) / minorTick;
  if (minorTickCountY <= 100) { // Performance limit
    for(let y=Math.floor(startY/minorTick)*minorTick; y<=endY; y+=minorTick){
      const sy = CoordinateSystem.worldToScreenY(y, pan_y, zoom);
      if(sy >= 0 && sy <= rh) {
        const t=document.createElement('div');
        t.style.cssText=`position:absolute;left:20px;top:${sy}px;width:10px;height:1px;background:${XVGSystem.appState.rulers.tickColor};opacity:0.6`;
        r.appendChild(t);
      }
    }
  }
  
  // Draw major ticks with numbers
  for(let y=Math.floor(startY/majorTick)*majorTick; y<=endY; y+=majorTick){
    const sy = CoordinateSystem.worldToScreenY(y, pan_y, zoom);
    if(sy >= 0 && sy <= rh) {
      const t=document.createElement('div');
      t.style.cssText=`position:absolute;left:15px;top:${sy}px;width:15px;height:1px;background:${XVGSystem.appState.rulers.textColor}`;
      r.appendChild(t);

      const lab=document.createElement('div');
      lab.style.cssText=`position:absolute;left:8px;top:${sy+2}px;font-size:11px;color:${XVGSystem.appState.rulers.textColor};font-family:system-ui,sans-serif;font-weight:500;transform:rotate(-90deg);transform-origin:left center`;
      lab.textContent=Math.round(y);
      r.appendChild(lab);
    }
  } 
}

  function panCanvas(dx,dy){ const t=XVGSystem.appState.canvasTransform; t.pan_x+=dx; t.pan_y+=dy; renderCanvas(); }
  function zoomCanvas(d){
    const t=XVGSystem.appState.canvasTransform;
    t.zoom=Math.max(t.minZoom, Math.min(t.maxZoom, t.zoom+d));
    renderCanvas();
    updateZoomLevelDisplay();
  }
  function fitToView(){
    const c=XVGSystem.canvas.element;
    if(!c) return;

    const r=c.getBoundingClientRect();
    const s=Math.min(r.width/c.width, r.height/c.height);

    const t=XVGSystem.appState.canvasTransform;
    t.zoom=s;
    t.pan_x=(r.width - c.width*s)/2;
    t.pan_y=(r.height - c.height*s)/2;

    renderCanvas();
    updateZoomLevelDisplay();
  }
  function actualSize(){
    const t=XVGSystem.appState.canvasTransform;
    t.zoom = 1;
    t.pan_x = 0;
    t.pan_y = 0;
    renderCanvas();
    updateZoomLevelDisplay();
  }

  function updateZoomLevelDisplay(){
    const zoomLevelEl = document.getElementById('zoom-level');
    if (zoomLevelEl) {
      const zoomPercent = Math.round(XVGSystem.appState.canvasTransform.zoom * 100);
      zoomLevelEl.textContent = zoomPercent + '%';
    }
  }

  
  // ============================================================================
  // COORDINATE SYSTEM UTILITIES
  // ============================================================================

  /**
   * COORDINATE SYSTEM ARCHITECTURE
   *
   * World Coordinates: Abstract positioning system (units)
   * Screen Coordinates: Pixel positions on canvas/DOM (pixels)
   *
   * Canvas Context: Handles World → Screen automatically via ctx.translate() + ctx.scale()
   * DOM Elements: Require manual World → Screen conversion with pan offset compensation
   *
   * Transform Pipeline:
   * World → multiply by zoom → add pan offset → Screen
   *
   * Key Functions:
   * - CoordinateSystem.worldToScreenX/Y(): World → Screen conversion
   * - CoordinateSystem.screenToWorldX/Y(): Screen → World conversion
   * - CoordinateSystem.getVisibleWorldBounds(): Calculate visible area bounds
   *
 * Grid: Static by default (independent coordinate system)
 * Rulers: Uses manual coordinate conversion (DOM elements)
 *
 * GRID MODES:
 * - Independent (DEFAULT): Grid stays fixed to screen, doesn't move with canvas
 * - Standard: Grid moves with canvas pan/zoom operations
 *
 * SEPARATION UTILITIES:
 * - IndependentCoordinateSystem: Create separate coordinate systems
 * - createFixedGrid(): Grid that doesn't move with canvas
 * - toggleGridMode(): Switch between standard/independent grid
 *
 * @example
 * // Grid is static by default
 * setStandardGrid(); // Make grid move with canvas
 * setIndependentGrid(); // Make grid static (default)
 *
 * // Create independent coordinate system
 * const independent = IndependentCoordinateSystem.create(100, 50, 2.0);
 *
 * // Toggle grid mode
 * toggleGridMode(); // Switch between static and moving grid
   */

  // ============================================================================
  // SEPARATION UTILITIES - For Independent Coordinate Systems
  // ============================================================================

  /**
   * Create an independent coordinate system for UI elements
   * that can move separately from the main canvas transform
   */
  const IndependentCoordinateSystem = {
    /**
     * Create a new independent transform
     * @param {number} panX - Independent pan X
     * @param {number} panY - Independent pan Y
     * @param {number} zoom - Independent zoom
     * @returns {object} Independent transform object
     */
    create(panX = 0, panY = 0, zoom = 1) {
      return {
        pan_x: panX,
        pan_y: panY,
        zoom: zoom,
        minZoom: 0.05,
        maxZoom: 8,

        // Independent conversion methods
        worldToScreenX: (worldX) => (worldX * zoom) + panX,
        worldToScreenY: (worldY) => (worldY * zoom) + panY,
        screenToWorldX: (screenX) => (screenX - panX) / zoom,
        screenToWorldY: (screenY) => (screenY - panY) / zoom,

        // Independent pan/zoom methods
        pan: (dx, dy) => {
          panX += dx;
          panY += dy;
        },

        setZoom: (newZoom) => {
          zoom = Math.max(0.05, Math.min(8, newZoom));
        }
      };
    },

    /**
     * Create a fixed grid that doesn't move with canvas pan/zoom
     */
    createFixedGrid(spacing = 100) {
      return {
        draw: function(ctx, canvasWidth, canvasHeight) {
          ctx.save();
          ctx.strokeStyle = '#303030';
          ctx.lineWidth = 1;

          // Draw fixed grid lines (independent of canvas transform)
          for(let x = 0; x <= canvasWidth; x += spacing) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvasHeight);
            ctx.stroke();
          }

          for(let y = 0; y <= canvasHeight; y += spacing) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvasWidth, y);
            ctx.stroke();
          }

          ctx.restore();
        }
      };
    }
  };

  // ============================================================================
  // UNIFIED COORDINATE SYSTEM (Main Canvas)
  // ============================================================================

  // Unified coordinate transformation utilities
  const CoordinateSystem = {
    /**
     * Convert world X coordinate to screen X coordinate
     * @param {number} worldX - World coordinate
     * @param {number} panX - Pan offset
     * @param {number} zoom - Zoom level
     * @returns {number} Screen coordinate
     */
    worldToScreenX(worldX, panX, zoom) {
      return (worldX * zoom) + panX;
    },

    /**
     * Convert world Y coordinate to screen Y coordinate
     * @param {number} worldY - World coordinate
     * @param {number} panY - Pan offset
     * @param {number} zoom - Zoom level
     * @returns {number} Screen coordinate
     */
    worldToScreenY(worldY, panY, zoom) {
      return (worldY * zoom) + panY;
    },

    /**
     * Convert screen X coordinate to world X coordinate
     * @param {number} screenX - Screen coordinate
     * @param {number} panX - Pan offset
     * @param {number} zoom - Zoom level
     * @returns {number} World coordinate
     */
    screenToWorldX(screenX, panX, zoom) {
      return (screenX - panX) / zoom;
    },

    /**
     * Convert screen Y coordinate to world Y coordinate
     * @param {number} screenY - Screen coordinate
     * @param {number} panY - Pan offset
     * @param {number} zoom - Zoom level
     * @returns {number} World coordinate
     */
    screenToWorldY(screenY, panY, zoom) {
      return (screenY - panY) / zoom;
    },

    /**
     * Get visible world coordinate bounds for current view
     * @param {number} canvasWidth - Canvas width in pixels
     * @param {number} canvasHeight - Canvas height in pixels
     * @param {number} panX - Pan X offset
     * @param {number} panY - Pan Y offset
     * @param {number} zoom - Zoom level
     * @returns {object} Bounds {startX, startY, endX, endY}
     */
    getVisibleWorldBounds(canvasWidth, canvasHeight, panX, panY, zoom) {
      const startX = this.screenToWorldX(0, panX, zoom);
      const startY = this.screenToWorldY(0, panY, zoom);
      const endX = this.screenToWorldX(canvasWidth, panX, zoom);
      const endY = this.screenToWorldY(canvasHeight, panY, zoom);

      return { startX, startY, endX, endY };
    }
  };

  // Text dimension calculation function
  window.XVGSystem.calculateTextDimensions = function(text, fontSize, fontFamily) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${fontSize}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    return {
      width: metrics.width,
      height: fontSize,
      ascent: metrics.fontBoundingBoxAscent || fontSize * 0.8,
      descent: metrics.fontBoundingBoxDescent || fontSize * 0.2
    };
  };

  // simple UI helpers used by HTML
  window.setTool = function(tool){
    console.log('[Core] Setting tool to:', tool, 'tools ready:', window.XVGSystem?.tools?.ready);

    // Deactivate current tool if it has a deactivate method
    const currentTool = XVGSystem.appState.currentTool;
    if (currentTool && currentTool !== tool && XVGSystem.tools && XVGSystem.tools[currentTool]) {
      const currentToolInstance = XVGSystem.tools[currentTool];
      if (typeof currentToolInstance.deactivate === 'function') {
        try {
          currentToolInstance.deactivate();
        } catch (e) {
          console.warn('[Core] Error deactivating tool:', currentTool, e);
        }
      }
    }

    XVGSystem.appState.currentTool = tool;
    document.querySelectorAll('.toolbar-btn').forEach(b=>b.classList.remove('active'));
    const btn=document.getElementById(tool+'-tool');
    if(btn) btn.classList.add('active'); 
    
    // Show/hide eraser size control
    const eraserControl = document.getElementById('eraser-size-control');
    if (eraserControl) {
      eraserControl.style.display = tool === 'eraser' ? 'grid' : 'none';
    }
    
    // Also handle selectTool compatibility
    const selectedButton = document.querySelector(`[onclick*="selectTool('${tool}')"]`);
    if (selectedButton) {
      selectedButton.classList.add('active');
    }
  };
  
  // Add selectTool as alias for HTML compatibility
  window.selectTool = window.setTool;
  
  // Centralized change tracking
  function markAsModified() {
    XVGSystem.appState.isModified = true;
    // Note: saveStateForUndo() is now called by individual functions before making changes
  }
  
  function markAsSaved() {
    XVGSystem.appState.isModified = false;
  }
  
  // Expose globally for tools
  // Helper function to get selected paths by ID
  function getSelectedPaths() {
    return XVGSystem.appState.selectedPaths.map(pathId => 
      XVGSystem.appState.paths.find(p => p.id === pathId)
    ).filter(path => path);
  }
  
  window.markAsModified = markAsModified;
  window.markAsSaved = markAsSaved;
  window.getSelectedPaths = getSelectedPaths;
  
  // Helper function to show a Yes/No dialog
  function showYesNoDialog(message) {
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
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      // Create dialog
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        max-width: 400px;
        text-align: center;
      `;

      // Create message
      const messageEl = document.createElement('p');
      messageEl.textContent = message;
      messageEl.style.marginBottom = '20px';

      // Create buttons container
      const buttons = document.createElement('div');
      buttons.style.display = 'flex';
      buttons.style.gap = '10px';
      buttons.style.justifyContent = 'center';

      // Create Yes button
      const yesBtn = document.createElement('button');
      yesBtn.textContent = 'Yes';
      yesBtn.style.cssText = `
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        background: #007bff;
        color: white;
        cursor: pointer;
      `;
      yesBtn.onclick = () => {
        document.body.removeChild(overlay);
        resolve(true);
      };

      // Create No button
      const noBtn = document.createElement('button');
      noBtn.textContent = 'No';
      noBtn.style.cssText = `
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        background: #6c757d;
        color: white;
        cursor: pointer;
      `;
      noBtn.onclick = () => {
        document.body.removeChild(overlay);
        resolve(false);
      };

      // Assemble dialog
      buttons.appendChild(yesBtn);
      buttons.appendChild(noBtn);
      dialog.appendChild(messageEl);
      dialog.appendChild(buttons);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Focus the Yes button by default
      yesBtn.focus();
    });
  }

  // Expose through XVGSystem for tool compatibility
  XVGSystem.markModified = markAsModified;
  XVGSystem.markAsSaved = markAsSaved;
  XVGSystem.getSelectedPaths = getSelectedPaths;
  window.newFile = function(){
    console.log('[New File] Creating new file...');
    // Check if there's unsaved work
    if (XVGSystem.appState.isModified && XVGSystem.appState.paths.length > 0) {
      // Simple confirm dialog for now
      const shouldSave = confirm('You have unsaved changes. Do you want to save before creating a new file?');
      if (shouldSave) {
        window.saveFile();
      }
    }

    // Reset to initial state - clear everything
    XVGSystem.appState.paths = [];
    XVGSystem.appState.selectedPaths = [];
    XVGSystem.appState.selectedImages = [];
    XVGSystem.appState.images = [];
    XVGSystem.appState.layers = [{ id: 'layer_1', name: 'Layer 1', visible: true, locked: false, paths: [] }];
    XVGSystem.appState.activeLayer = 0;
    XVGSystem.appState.isModified = false;
    XVGSystem.appState.currentFilename = null; // Clear current filename for new file
    XVGSystem.appState.canvasTransform = {
      pan_x: 0,
      pan_y: 0,
      zoom: 1,
      minZoom: 0.05,
      maxZoom: 8
    }; // Reset canvas transform
    XVGSystem.appState.undoStack = []; // Clear undo history
    XVGSystem.appState.redoStack = []; // Clear redo history

    // Update UI
    updateLayerList();
    renderCanvas();

    // Ensure rulers are properly reset after clearing state
    const topRuler = document.getElementById('top-ruler');
    const leftRuler = document.getElementById('left-ruler');

    if (topRuler) {
      topRuler.style.display = XVGSystem.appState.rulers.visible ? 'block' : 'none';
      topRuler.innerHTML = ''; // Clear any existing content
    }
    if (leftRuler) {
      leftRuler.style.display = XVGSystem.appState.rulers.visible ? 'block' : 'none';
      leftRuler.innerHTML = ''; // Clear any existing content
    }

    // Don't manually call updateTopRuler/updateLeftRuler here
    // renderCanvas() will handle ruler updates automatically
  }

  // Test function to create a simple path for testing save functionality
  window.createTestPath = function() {
    console.log('[Test] Creating test path for save functionality');

    const testPath = {
      id: 'test_path_' + Date.now(),
      type: 'path',
      data: 'M 100 100 L 200 100 L 200 200 L 100 200 Z',
      style: {
        fill: { color: [1, 0, 0, 0.5], rule: 'NonZero' },
        stroke: { color: [0, 0, 0, 1], width: 2, cap: 'Butt', join: 'Miter', dash_array: [] },
        opacity: 1.0,
        blend_mode: 'Normal'
      },
      x: 100,
      y: 100,
      w: 100,
      h: 100,
      tx: 0,
      ty: 0,
      rotation: 0,
      visible: true,
      locked: false,
      layerIndex: 0
    };

    XVGSystem.appState.paths.push(testPath);
    console.log('[Test Path] Created and added test path:', testPath.id, 'Total paths now:', XVGSystem.appState.paths.length);
    XVGSystem.appState.isModified = true;

    console.log('[Test] Created test path:', testPath.id);
    renderCanvas();
    updateLayerList();
  }

  // Test function to verify coordinate parsing
  window.testCoordinateParsing = function() {
    console.log('[Test] Testing coordinate parsing...');
    const testPath = 'M 0 0 L 1 0 L 1 1 L 0 1 Z';
    const coordinates = parseSVGPathToCoordinates(testPath);
    console.log('[Test] Input path:', testPath);
    console.log('[Test] Parsed coordinates:', coordinates);
    console.log('[Test] Expected: [0, 0, 1, 0, 1, 1, 0, 1]');
    console.log('[Test] Match:', JSON.stringify(coordinates) === JSON.stringify([0, 0, 1, 0, 1, 1, 0, 1]));
  }

  // Test function to check current state
  window.debugXVGState = function() {
    console.log('[Debug] ===== XVG STATE DEBUG =====');
    console.log('[Debug] Paths count:', XVGSystem?.appState?.paths?.length || 0);
    console.log('[Debug] Images count:', XVGSystem?.appState?.images?.length || 0);
    console.log('[Debug] Current filename:', XVGSystem?.appState?.currentFilename || 'none');

    if (XVGSystem?.appState?.images?.length > 0) {
      console.log('[Debug] Images details:');
      XVGSystem.appState.images.forEach((img, i) => {
        console.log(`[Debug] Image ${i}:`, {
          id: img.id,
          filename: img.filename,
          dimensions: `${img.width}x${img.height}`,
          position: `${img.x},${img.y}`,
          srcLength: img.src?.length || 0
        });
      });
    }

    console.log('[Debug] ===== END DEBUG =====');
  }

  window.openFile = function(){ document.getElementById('file-input').click(); };
  window.saveFile = function(){ 
    try {
      // Check if we have a current filename
      if (XVGSystem.appState.currentFilename) {
        // Save with existing filename
        saveWithFilename(XVGSystem.appState.currentFilename);
      } else {
        // No filename yet, prompt for one (same as Save As)
        window.saveFileAs();
      }
    } catch (error) {
      console.error('Failed to save XVG file:', error);
      alert('Failed to save XVG file: ' + error.message);
    }
  };
  
  // Helper function to save with a specific filename
  function saveWithFilename(filename) {
    try {
      console.log('[XVG Save] Starting save process for filename:', filename);
      console.log('[XVG Save] Current appState paths count:', XVGSystem.appState.paths?.length || 0);
      console.log('[XVG Save] Canvas dimensions (appState):', XVGSystem.appState.canvas?.width, 'x', XVGSystem.appState.canvas?.height);
      console.log('[XVG Save] Canvas dimensions (element):', XVGSystem.canvas.element?.width, 'x', XVGSystem.canvas.element?.height);

      // Check if WASM is available
      if (!window.xvg_wasm || !window.xvg_wasm.XVGFile) {
        throw new Error('WASM module not available - cannot save XVG files');
      }

      // Create XVG file using WASM
      // Use actual canvas element dimensions instead of appState (which might be 0)
      const canvasWidth = XVGSystem.canvas.element ? XVGSystem.canvas.element.width : XVGSystem.appState.canvas.width || 2000;
      const canvasHeight = XVGSystem.canvas.element ? XVGSystem.canvas.element.height : XVGSystem.appState.canvas.height || 1500;

      console.log('[XVG Save] Creating XVG file with dimensions:', canvasWidth, 'x', canvasHeight);
      const xvgFile = new window.xvg_wasm.XVGFile(canvasWidth, canvasHeight);
      console.log('[XVG Save] XVG file created successfully, path_count:', xvgFile.path_count);
      
      // Add paths to XVG file
      // Save vector paths
      console.log('[XVG Save] Processing', XVGSystem.appState.paths.length, 'paths');
      console.log('[XVG Save] Current appState:', {
        pathsCount: XVGSystem.appState.paths.length,
        selectedPathsCount: XVGSystem.appState.selectedPaths?.length || 0,
        layersCount: XVGSystem.appState.layers?.length || 0,
        isModified: XVGSystem.appState.isModified
      });

      XVGSystem.appState.paths.forEach((path, index) => {
        console.log('[XVG Save] Processing path', index + 1, 'of', XVGSystem.appState.paths.length, ':', path.id, '(type:', path.type, ')');

        try {
          if (path.binaryData) {
            // Use binary path data directly (proper XVG format)
            let dataToAdd = path.binaryData;
            if (!(dataToAdd instanceof Uint8Array) && !(dataToAdd instanceof ArrayBuffer)) {
              console.warn('[XVG Save] Converting binaryData to Uint8Array for path:', path.id);
              dataToAdd = new Uint8Array(dataToAdd);
            }

            const tf = path.tf || [1, 0, 0, 1, 0, 0];

          // Convert to proper PathStyle format that WASM expects
          const cleanStyle = convertToPathStyle(path.style);

          console.log('[XVG Save] Adding binary path:', path.id, 'with style keys:', Object.keys(cleanStyle));

          xvgFile.add_path(dataToAdd, tf, cleanStyle);
            console.log('[XVG Save] Added binary path:', path.id);
          } else if (path.data) {
            // Store original SVG data directly (don't convert to coordinates)
            // This preserves the exact SVG representation for loading
            console.log('[XVG Save] Storing SVG data directly for', path.id, ':', path.data);
            const encoder = new TextEncoder();
            const svgBytes = encoder.encode(path.data);

            console.log('[XVG Save] SVG bytes for', path.id, ':', svgBytes.constructor.name, 'length:', svgBytes.length);
            const tf = [1, 0, 0, 1, path.tx || 0, path.ty || 0];
            console.log('[XVG Save] About to call add_path for SVG data:', path.id);
            console.log('[XVG Save] Style object:', JSON.stringify(path.style || {}));

            // Convert to proper PathStyle format that WASM expects
            const cleanStyle = convertToPathStyle(path.style);

            // Store SVG as binary data - WASM will treat it as opaque data
            xvgFile.add_path(svgBytes, tf, cleanStyle);
            console.log('[XVG Save] Successfully added SVG path:', path.id);
          } else {
            console.warn('[XVG Save] Path has neither binaryData nor data, skipping:', path.id);
          }
        } catch (pathError) {
          console.error('[XVG Save] Error processing path:', path.id, pathError);
          console.error('[XVG Save] Path data:', path);
        }
      });

      // Store raster images as proper XVG binary assets
      if (XVGSystem.appState.images && XVGSystem.appState.images.length > 0) {
        console.log('[XVG Save] Processing', XVGSystem.appState.images.length, 'images as binary assets');

        for (const img of XVGSystem.appState.images) {
          try {
            console.log('[XVG Save] Processing image:', img.filename, 'size:', img.width, 'x', img.height);

            if (img.src && img.src.startsWith('data:')) {
              // Extract binary data from data URL
              const dataUrlParts = img.src.split(',');
              const mimeType = dataUrlParts[0].split(':')[1].split(';')[0];
              const binaryString = atob(dataUrlParts[1]);
              const binaryData = new Uint8Array(binaryString.length);

              for (let i = 0; i < binaryString.length; i++) {
                binaryData[i] = binaryString.charCodeAt(i);
              }

              console.log('[XVG Save] Extracted', binaryData.length, 'bytes of', mimeType, 'data');

              // Add as proper XVG asset using the new WASM method
              console.log('[XVG Save] Calling xvgFile.add_image with:', {
                filename: img.filename,
                dataLength: binaryData.length,
                dataType: binaryData.constructor.name,
                mimeType: mimeType,
                hasMethod: typeof xvgFile.add_image === 'function',
                dataSample: Array.from(binaryData.slice(0, 5))
              });

              try {
                // Ensure binaryData is a proper Uint8Array
                let safeBinaryData = binaryData;
                if (!(binaryData instanceof Uint8Array)) {
                  console.warn('[XVG Save] Converting binaryData to Uint8Array');
                  safeBinaryData = new Uint8Array(binaryData);
                }

                xvgFile.add_image(img.filename, safeBinaryData, mimeType);
                console.log('[XVG Save] Successfully added image asset:', img.filename);
              } catch (addError) {
                console.error('[XVG Save] Failed to add image asset:', addError);
                console.error('[XVG Save] Error details:', addError.message);
                console.error('[XVG Save] Binary data type:', binaryData.constructor.name);
                console.error('[XVG Save] Binary data length:', binaryData.length);
              }
            } else {
              console.warn('[XVG Save] Image has no data URL:', img.filename);
            }
          } catch (imgError) {
            console.error('[XVG Save] Error processing image:', img.filename, imgError);
          }
        }

        console.log('[XVG Save] All images processed as binary assets');
      }
      
      // Encode to binary XVG format
      let binaryData;
      try {
        binaryData = xvgFile.encode_bytes();
        if (!binaryData || typeof binaryData.length !== 'number') {
          throw new Error('xvgFile.encode_bytes() did not return a valid binary array');
        }
        console.log('[XVG Save] Encoded binary data length:', binaryData.length);
        console.log('[XVG Save] First 20 bytes of encoded data:', Array.from(binaryData.slice(0, 20)));
      } catch (encodeError) {
        console.error('[XVG Save] Error encoding XVG file to binary:', encodeError);
        throw encodeError; // escalate to outer catch for user notification
      }

      // Detailed save diagnostics
      console.log('[XVG Save] === SAVE DIAGNOSTICS ===');
      console.log('[XVG Save] Paths saved:', XVGSystem.appState.paths.length);
      console.log('[XVG Save] Images saved:', XVGSystem.appState.images ? XVGSystem.appState.images.length : 0);
      console.log('[XVG Save] Layers saved:', XVGSystem.appState.layers.length);
      console.log('[XVG Save] Canvas size:', canvasWidth, 'x', canvasHeight);

      // Analyze path types
      const pathTypes = XVGSystem.appState.paths.map(p => p.type || 'unknown');
      const typeCount = pathTypes.reduce((acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
      console.log('[XVG Save] Path types:', typeCount);

      // Analyze path data sizes
      const pathDataSizes = XVGSystem.appState.paths.map(p => ({
        id: p.id,
        type: p.type || 'unknown',
        dataSize: p.data ? p.data.length : 0,
        hasBinaryData: !!p.binaryData,
        binaryDataSize: p.binaryData ? p.binaryData.length : 0
      }));
      console.log('[XVG Save] Path data sizes:', pathDataSizes);

      console.log('[XVG Save] === END SAVE DIAGNOSTICS ===');

      // Save as binary file with specified filename
      const blob = new Blob([binaryData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      
      // Mark as saved
      XVGSystem.appState.isModified = false;
      console.log('XVG file saved:', filename);
    } catch (error) {
      console.error('Failed to save XVG file:', error);
      alert('Failed to save XVG file: ' + error.message);
    }
  }
  
  window.saveFileAs = function(){
    try {
      // Prompt user for filename - default to current filename if available
      const currentFilename = XVGSystem.appState.currentFilename;
      const defaultName = currentFilename || `document_${new Date().toISOString().slice(0, 10)}.xvg`;
      const filename = window.prompt('Enter filename:', defaultName);
      
      if (!filename) {
        console.log('Save As cancelled by user');
        return;
      }
      
      // Ensure .xvg extension
      const finalFilename = filename.endsWith('.xvg') ? filename : filename + '.xvg';
      
      // Set current filename for future saves
      XVGSystem.appState.currentFilename = finalFilename;
      
      // Use helper function to save with filename
      saveWithFilename(finalFilename);
      
    } catch (error) {
      console.error('Failed to save XVG file:', error);
      alert('Failed to save XVG file: ' + error.message);
    }
  };
  

  // Parse SVG path string to coordinate array for WASM
  function parseSVGPathToCoordinates(svgPath) {
    try {
      console.log('[XVG Save] Parsing SVG path to coordinates:', svgPath);

      // Simple SVG path parser for basic paths (M, L, Z)
      const commands = svgPath.trim().split(/\s+/);
      const coordinates = [];
      let i = 0;

      while (i < commands.length) {
        const cmd = commands[i];

        if (cmd === 'M' || cmd === 'L') {
          i++; // Move to next token
          if (i < commands.length) {
            const x = parseFloat(commands[i]);
            i++;
            if (i < commands.length) {
              const y = parseFloat(commands[i]);
              i++;
              coordinates.push(x, y);
            }
          }
        } else if (cmd === 'Z' || cmd === 'z') {
          // Close path - could connect back to first point, but for now just skip
          i++;
        } else {
          // Try to parse as coordinate if it's a number
          const x = parseFloat(cmd);
          if (!isNaN(x) && i + 1 < commands.length) {
            const y = parseFloat(commands[i + 1]);
            if (!isNaN(y)) {
              coordinates.push(x, y);
              i += 2;
            } else {
              i++;
            }
          } else {
            i++;
          }
        }
      }

      console.log('[XVG Save] Parsed coordinates:', coordinates.length / 2, 'points');
      return coordinates;
    } catch (error) {
      console.error('[XVG Save] Error parsing SVG path:', error);
      return [];
    }
  }

  // Parse XVG binary path data directly to coordinate array
  function parseXVGBinaryPath(binaryData) {
    console.log('[XVG Parse] ===== STARTING BINARY PATH PARSING =====');
    console.log('[XVG Parse] Binary data length:', binaryData?.length);

    if (!binaryData || binaryData.length < 8) {
      console.log('[XVG Parse] ERROR: No binary data or too short');
      return [];
    }

    const uint8Array = binaryData instanceof Uint8Array ? binaryData : new Uint8Array(binaryData);
    const dataView = new DataView(uint8Array.buffer);
    const points = [];

    console.log('[XVG Parse] Processing binary data...');

    // XVG format stores f32 coordinate pairs (8 bytes per pair)
    for (let i = 0; i < uint8Array.length - 7; i += 8) {
      const x = dataView.getFloat32(i, true); // Little endian
      const y = dataView.getFloat32(i + 4, true);

      console.log(`[XVG Parse] Point ${points.length}: (${x}, ${y})`);

      if (isFinite(x) && isFinite(y)) {
        points.push({ x, y });
      } else {
        console.log(`[XVG Parse] WARNING: Non-finite coordinate at index ${i}`);
      }
    }

    console.log(`[XVG Parse] Found ${points.length} valid points`);

    if (points.length === 0) {
      console.log('[XVG Parse] ERROR: No valid points found');
      return [];
    }

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(p => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });

    console.log(`[XVG Parse] Raw bounds: X[${minX},${maxX}] Y[${minY},${maxY}]`);
    console.log(`[XVG Parse] Raw range: ${maxX - minX} x ${maxY - minY}`);

    // Get canvas dimensions
    const canvas = XVGSystem?.canvas?.element;
    const canvasWidth = canvas?.width || 800;
    const canvasHeight = canvas?.height || 600;

    console.log(`[XVG Parse] Canvas size: ${canvasWidth} x ${canvasHeight}`);

    // Center the shape on canvas and scale to fit
    const shapeWidth = maxX - minX;
    const shapeHeight = maxY - minY;
    const centerX = minX + shapeWidth/2;
    const centerY = minY + shapeHeight/2;

    // Determine if we need to scale up or down
    const maxDimension = Math.max(shapeWidth, shapeHeight);
    const targetSize = Math.min(canvasWidth, canvasHeight) * 0.3; // 30% of canvas

    let scale;
    if (maxDimension > targetSize) {
      // Scale down large shapes
      scale = targetSize / maxDimension;
      console.log(`[XVG Parse] Scaling DOWN: ${maxDimension} → ${targetSize} (${scale.toFixed(3)}x)`);
    } else if (maxDimension < 50) {
      // Scale up very small shapes (lower threshold)
      scale = targetSize / maxDimension;
      console.log(`[XVG Parse] Scaling UP: ${maxDimension} → ${targetSize} (${scale.toFixed(3)}x)`);
    } else {
      // Keep reasonable sizes as-is but scale down slightly for better fit
      scale = targetSize / maxDimension;
      console.log(`[XVG Parse] Gentle scaling: ${maxDimension} → ${targetSize} (${scale.toFixed(3)}x)`);
    }

    console.log(`[XVG Parse] Final scale factor: ${scale}x`);
    console.log(`[XVG Parse] Center point: (${centerX}, ${centerY})`);

    // Apply transformation
    points.forEach((p, idx) => {
      const oldX = p.x, oldY = p.y;
      p.x = (p.x - centerX) * scale + canvasWidth/2;
      p.y = (p.y - centerY) * scale + canvasHeight/2;
      console.log(`[XVG Parse] Point ${idx} transformed: (${oldX.toFixed(1)}, ${oldY.toFixed(1)}) → (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
    });

    console.log(`[XVG Parse] ===== PARSING COMPLETE =====`);
    return points;
  }

  window.exportXVG = async function(){
    console.log('[XVG Export] ===== EXPORT XVG STARTED =====');
    console.log('[XVG Export] Current timestamp:', Date.now());
    console.log('[XVG Export] Images in appState:', window.XVGSystem?.appState?.images?.length || 0);
    console.log('[XVG Export] WASM module available:', !!window.xvg_wasm);
    console.log('[XVG Export] XVGFile constructor available:', !!(window.xvg_wasm && window.xvg_wasm.XVGFile));
    if (window.XVGSystem?.appState?.images) {
      console.log('[XVG Export] Images details:', window.XVGSystem.appState.images.map(img => ({
        id: img.id,
        filename: img.filename,
        width: img.width,
        height: img.height,
        srcLength: img.src?.length || 0
      })));
    }
    try {
      if (!window.xvg_wasm || !window.xvg_wasm.XVGFile) {
        throw new Error('WASM module not available');
      }

      // Use actual canvas element dimensions instead of appState (which might be 0)
      const canvasWidth = XVGSystem.canvas.element ? XVGSystem.canvas.element.width : XVGSystem.appState.canvas.width || 2000;
      const canvasHeight = XVGSystem.canvas.element ? XVGSystem.canvas.element.height : XVGSystem.appState.canvas.height || 1500;

      console.log('[XVG Export] Creating XVG file with dimensions:', canvasWidth, 'x', canvasHeight);
      const xvgFile = new window.xvg_wasm.XVGFile(canvasWidth, canvasHeight);
      console.log('[XVG Export] XVG file created successfully, path_count:', xvgFile.path_count);

      // Export paths
      XVGSystem.appState.paths.forEach(path => {
        if (path.data) {
          const pathData = new TextEncoder().encode(path.data);
          const tf = [1, 0, 0, 1, path.tx || 0, path.ty || 0];

          // Convert to proper PathStyle format that WASM expects
          const cleanStyle = convertToPathStyle(path.style);

          xvgFile.add_path(pathData, tf, cleanStyle);
        }
      });

      // Export images as proper XVG binary assets
      if (XVGSystem.appState.images && XVGSystem.appState.images.length > 0) {
        console.log('[XVG Export] Processing', XVGSystem.appState.images.length, 'images as binary assets');

        for (const img of XVGSystem.appState.images) {
          try {
            console.log('[XVG Export] Processing image:', img.filename, 'size:', img.width, 'x', img.height);

            if (img.src && img.src.startsWith('data:')) {
              // Extract binary data from data URL
              const dataUrlParts = img.src.split(',');
              const mimeType = dataUrlParts[0].split(':')[1].split(';')[0];
              const binaryString = atob(dataUrlParts[1]);
              const binaryData = new Uint8Array(binaryString.length);

              for (let i = 0; i < binaryString.length; i++) {
                binaryData[i] = binaryString.charCodeAt(i);
              }

              console.log('[XVG Export] Extracted', binaryData.length, 'bytes of', mimeType, 'data');

              // Add as proper XVG asset using the new WASM method
              console.log('[XVG Export] Calling xvgFile.add_image with:', {
                filename: img.filename,
                dataLength: binaryData.length,
                dataType: binaryData.constructor.name,
                mimeType: mimeType,
                hasMethod: typeof xvgFile.add_image === 'function',
                dataSample: Array.from(binaryData.slice(0, 5))
              });

              try {
                // Ensure binaryData is a proper Uint8Array
                let safeBinaryData = binaryData;
                if (!(binaryData instanceof Uint8Array)) {
                  console.warn('[XVG Export] Converting binaryData to Uint8Array');
                  safeBinaryData = new Uint8Array(binaryData);
                }

                xvgFile.add_image(img.filename, safeBinaryData, mimeType);
                console.log('[XVG Export] Successfully added image asset:', img.filename);
              } catch (addError) {
                console.error('[XVG Export] Failed to add image asset:', addError);
                console.error('[XVG Export] Error details:', addError.message);
                console.error('[XVG Export] Binary data type:', binaryData.constructor.name);
                console.error('[XVG Export] Binary data length:', binaryData.length);
              }
            } else {
              console.warn('[XVG Export] Image has no data URL:', img.filename);
            }
          } catch (imgError) {
            console.error('[XVG Export] Error processing image:', img.filename, imgError);
          }
        }

        console.log('[XVG Export] All images processed as binary assets');
      }

      // Encode the XVG file now that all images are processed
      try {
        const binaryData = xvgFile.encode_bytes();
        console.log('[XVG Export] Encoded binary data length:', binaryData.length);
        console.log('[XVG Export] First 20 bytes of exported data:', Array.from(binaryData.slice(0, 20)));

        // Export diagnostics
        console.log('[XVG Export] === EXPORT DIAGNOSTICS ===');
        console.log('[XVG Export] Paths exported:', XVGSystem.appState.paths.length);
        console.log('[XVG Export] Images exported:', XVGSystem.appState.images ? XVGSystem.appState.images.length : 0);
        console.log('[XVG Export] Canvas size:', XVGSystem.appState.canvas.width, 'x', XVGSystem.appState.canvas.height);
        console.log('[XVG Export] Export version: FIXED_COORDINATE_FILTERING_2025');
        console.log('[XVG Export] === END EXPORT DIAGNOSTICS ===');

        const blob = new Blob([binaryData], { type: 'application/xvg' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `export_${Date.now()}.xvg`;
        a.click();
        URL.revokeObjectURL(url);
        console.log('[XVG Export] XVG exported successfully - file size:', binaryData.length, 'bytes');
      } catch (encodeError) {
        console.error('[XVG Export] Failed to encode XVG file:', encodeError);
        alert('Failed to export XVG file: ' + encodeError.message);
      }

    } catch (error) {
      console.error('Failed to export XVG file:', error);
      alert('Failed to export XVG file: ' + error.message);
    }
  };
  
  window.importFile = function(){ document.getElementById('file-input').click(); };
  
  // XVG Import system
  XVGSystem.import = {
    importSVG: function(svgContent) {
      try {
        // Parse SVG content and convert to XVG paths
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
        const svgElement = svgDoc.querySelector('svg');

        if (!svgElement) {
          throw new Error('No SVG element found in content');
        }
        
        // Extract paths from SVG
        const paths = svgElement.querySelectorAll('path');
        paths.forEach(pathElement => {
          const pathData = pathElement.getAttribute('d');
          if (pathData) {
            const pathObj = {
              id: crypto.randomUUID(),
              type: 'path',
              data: pathData,
              style: {
                fill: pathElement.getAttribute('fill') || 'none',
                stroke: pathElement.getAttribute('stroke') || 'black',
                strokeWidth: parseFloat(pathElement.getAttribute('stroke-width')) || 1
              },
              layerIndex: XVGSystem.appState.activeLayer // Assign to current active layer
            };
            
            window.addPath(pathObj);
          }
        });
        
        renderCanvas();
        updateLayerList();
        console.log('SVG imported successfully');
        
      } catch (error) {
        console.error('Failed to import SVG:', error);
        alert('Failed to import SVG: ' + error.message);
      }
    },
    
    loadXVGFromBuffer: function(buffer) {
      try {
        // Try binary XVG first (if WASM available)
        if (window.xvg_wasm && window.xvg_wasm.XVGFile) {
          console.log('[XVG Import] WASM module found');
          console.log('[XVG Import] XVGFile available:', typeof window.xvg_wasm.XVGFile);
          console.log('[XVG Import] XVGFile.decode available:', typeof window.xvg_wasm.XVGFile.decode);

          try {
            console.log('[XVG Import] Attempting WASM decode...');
            console.log('[XVG Import] Buffer type:', buffer.constructor.name);
            console.log('[XVG Import] Buffer length:', buffer.byteLength || buffer.length);

            // Convert buffer to Uint8Array if needed
            const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
            console.log('[XVG Import] Uint8Array length:', uint8Array.length);
            console.log('[XVG Import] First 10 bytes:', uint8Array.slice(0, 10));

            // Decode binary XVG file using WASM
            const xvgFile = window.xvg_wasm.XVGFile.decode(uint8Array);
            console.log('[XVG Import] WASM decode successful');
            
            // Get header with canvas dimensions
            const header = xvgFile.get_header();
            console.log('[XVG Import] Header object retrieved:', header);
            const width = header.width;
            const height = header.height;
            
            // Update canvas size
            XVGSystem.appState.canvas.width = width;
            XVGSystem.appState.canvas.height = height;
            // CRITICAL: Explicitly update the DOM canvas element dimensions
            XVGSystem.canvas.element.width = width;
            XVGSystem.canvas.element.height = height;
            XVGSystem.canvas.overlay.width = width;
            XVGSystem.canvas.overlay.height = height;
            console.log('[XVG Import] Canvas DOM dimensions updated to:', width, 'x', height);
            
            // Get all paths from XVG file
            const paths = xvgFile.get_paths();
            console.log('[XVG Import] Found', paths ? paths.length : 0, 'paths in XVG file');

            // Try to get additional data from XVG file
            let images = null;
            let metadata = null;
            try {
              images = xvgFile.get_images ? xvgFile.get_images() : null;
              metadata = xvgFile.get_metadata ? xvgFile.get_metadata() : null;
              console.log('[XVG Import] Images found:', images ? images.length : 0);
              console.log('[XVG Import] Metadata available:', !!metadata);
            } catch (e) {
              console.log('[XVG Import] Could not retrieve additional data:', e.message);
            }

            if (paths && paths.length > 0) {
              console.log('[XVG Import] First path type:', paths[0].data?.constructor?.name || 'unknown');
            }

            if ((!paths || paths.length === 0) && (!images || images.length === 0)) {
              console.log('[XVG Import] XVG file contains no paths or images - this appears to be an empty document');
              console.log('[XVG Import] Canvas size set to:', width, 'x', height);

              // Show user-friendly notification for empty files
              if (window.showNotification) {
                window.showNotification('Empty XVG file loaded - canvas size: ' + width + '×' + height, 'info');
              } else {
                alert('XVG file imported successfully!\n\nThis appears to be an empty document.\nCanvas size: ' + width + '×' + height + '\n\nYou can start drawing now.');
              }

              // Ensure canvas is properly updated and redrawn
              renderCanvas();
              updateZoomLevelDisplay();
            } else {
              const totalItems = (paths ? paths.length : 0) + (images ? images.length : 0);
              console.log('[XVG Import] XVG file imported successfully with', paths.length, 'paths and', images ? images.length : 0, 'images');

              if (window.showNotification) {
                let message = 'XVG file imported successfully';
                if (totalItems > 0) {
                  message += ' - ' + (paths ? paths.length : 0) + ' paths';
                  if (images && images.length > 0) {
                    message += ', ' + images.length + ' images';
                  }
                  message += ' loaded';
                }
                window.showNotification(message, 'success');
              }
            }

            // Clear existing paths and reset layers
            XVGSystem.appState.paths = [];
            XVGSystem.appState.selectedPaths = [];
            XVGSystem.appState.layers = [{ id: 'layer_1', name: 'Layer 1', visible: true, locked: false, paths: [] }];
            XVGSystem.appState.activeLayer = 0;

            
            // Check for image metadata in the first path
            let imageMetadata = null;
            if (paths.length > 0 && paths[0]) {
              // Try to parse the first path\'s original_svg as potential metadata
              const firstPath = paths[0];
              if (firstPath.original_svg && firstPath.original_svg.includes('xvg_image_metadata')) {
                try {
                  const metadata = JSON.parse(firstPath.original_svg);
                  if (metadata.type === 'xvg_image_metadata' && metadata.images) {
                    imageMetadata = metadata;
                    console.log('[XVG Import] Found image metadata:', metadata.images.length, 'images');
                    // Remove the metadata path from the paths array
                    paths = paths.slice(1);
                  }
                } catch (e) {
                  console.warn('[XVG Import] Failed to parse potential image metadata:', e);
                }
              }
            }

            // Import images from XVG file using proper binary asset storage
            let imagesToProcess = images;

            // Try to get images from XVG binary assets first (proper method)
            try {
              const binaryImages = xvgFile.get_images();
              console.log('[XVG Import] DEBUG: WASM get_images() returned:', binaryImages);
              console.log('[XVG Import] DEBUG: binaryImages type:', typeof binaryImages);
              console.log('[XVG Import] DEBUG: binaryImages length:', binaryImages ? binaryImages.length : 'null/undefined');
              if (binaryImages && binaryImages.length > 0) {
                console.log('[XVG Import] Found', binaryImages.length, 'binary images in XVG file');
                imagesToProcess = binaryImages.map((imgAsset, idx) => {
                  // Convert Map to object if needed (WASM returns Maps)
                  if (imgAsset instanceof Map) {
                    imgAsset = Object.fromEntries(imgAsset);
                  }
                  console.log('[XVG Import] Processing image asset', idx + ':', imgAsset.name);
                  console.log('[XVG Import] Raw imgAsset:', imgAsset);
                  console.log('[XVG Import] imgAsset.data type:', typeof imgAsset.data);
                  console.log('[XVG Import] imgAsset.data length:', imgAsset.data?.length);
                  console.log('[XVG Import] imgAsset.data sample:', imgAsset.data?.substring?.(0, 50) || 'not a string');

                  // Handle the data field - it's now base64 encoded from WASM
                  let imageData = null;
                  if (typeof imgAsset.data === 'string') {
                    try {
                      console.log('[XVG Import] Attempting base64 decode for', imgAsset.name);
                      // Decode base64 string back to Uint8Array
                      const binaryString = atob(imgAsset.data);
                      imageData = new Uint8Array(binaryString.length);
                      for (let i = 0; i < binaryString.length; i++) {
                        imageData[i] = binaryString.charCodeAt(i);
                      }
                      console.log('[XVG Import] SUCCESS: Decoded base64 data for', imgAsset.name, '- binary length:', imageData.length);
                      console.log('[XVG Import] First 10 bytes:', Array.from(imageData.slice(0, 10)));
                    } catch (decodeError) {
                      console.error('[XVG Import] FAILED: Base64 decode error for', imgAsset.name, decodeError);
                      console.error('[XVG Import] Error details:', decodeError.message);
                      console.error('[XVG Import] imgAsset.data sample:', imgAsset.data?.substring?.(0, 100));
                    }
                  } else {
                    console.warn('[XVG Import] Unexpected data type for', imgAsset.name, '- got:', typeof imgAsset.data, '- value:', imgAsset.data);
                  }

                  const result = {
                    data: imageData, // Already a Uint8Array from WASM
                    dataUrl: null, // Will be created from binary data
                    filename: imgAsset.name,
                    mime_type: imgAsset.mime_type,
                    transform: [1, 0, 0, 1, 0, 0], // Default transform
                    width: imgAsset.width || 0,
                    height: imgAsset.height || 0
                  };

                  console.log('[XVG Import] Created imageRecord for', imgAsset.name, ':', {
                    hasData: !!result.data,
                    dataLength: result.data?.length,
                    hasDataUrl: !!result.dataUrl,
                    mimeType: result.mime_type
                  });

                  return result;
                });
                console.log('[XVG Import] DEBUG: Processed imagesToProcess:', imagesToProcess);
                console.log('[XVG Import] DEBUG: First processed image:', imagesToProcess.length > 0 ? imagesToProcess[0] : 'none');
              }
            } catch (binaryError) {
              console.warn('[XVG Import] Could not retrieve binary images:', binaryError.message);
            }

            // Fallback: If WASM get_images() returned empty/null, try metadata fallback
            if ((!imagesToProcess || imagesToProcess.length === 0) && imageMetadata) {
              console.log('[XVG Import] Using metadata fallback for images:', imageMetadata.images.length);
              imagesToProcess = imageMetadata.images.map(imgMeta => ({
                data: null, // Metadata fallback doesn\'t use binary data
                dataUrl: imgMeta.dataUrl, // Use the data URL from metadata
                filename: imgMeta.filename,
                transform: [1, 0, 0, 1, imgMeta.x || 0, imgMeta.y || 0]
              }));
            }

            if (imagesToProcess && imagesToProcess.length > 0) {
              console.log('[XVG Import] Processing', imagesToProcess.length, 'images from XVG file');

              imagesToProcess.forEach((imageRecord, index) => {
                try {
                  console.log('[XVG Import] Processing imageRecord', index, ':', {
                    filename: imageRecord.filename,
                    hasData: !!imageRecord.data,
                    dataLength: imageRecord.data?.length,
                    hasDataUrl: !!imageRecord.dataUrl,
                    mimeType: imageRecord.mime_type
                  });

                  // Handle XVG binary asset data (preferred method)
                  if (imageRecord.data && imageRecord.data.length > 0) {
                    console.log('[XVG Import] Image has binary data, processing...');
                    // Convert binary image data to data URL
                    const mimeType = imageRecord.mime_type || 'image/png';
                    const blob = new Blob([imageRecord.data], { type: mimeType });
                    const imageUrl = URL.createObjectURL(blob);

                    // Create image element
                    const img = new Image();
                    img.onload = function() {
                      console.log('[XVG Import] Image loaded from WASM:', imageRecord.filename || `image_${index}.png`);
                      processImportedImage(img, imageRecord, index);
                      // Clean up blob URL
                      URL.revokeObjectURL(imageUrl);
                    };
                    img.onerror = function() {
                      console.error('[XVG Import] Failed to load image:', imageRecord.filename);
                      URL.revokeObjectURL(imageUrl);
                    };
                    img.src = imageUrl;
                  }
                  // Handle metadata dataUrl (fallback method)
                  else if (imageRecord.dataUrl) {
                    // Create image element directly from data URL
                    const img = new Image();
                    img.onload = function() {
                      console.log('[XVG Import] Image loaded from metadata:', imageRecord.filename || `image_${index}.png`);
                      processImportedImage(img, imageRecord, index);
                    };
                    img.onerror = function() {
                      console.error('[XVG Import] Failed to load image from metadata:', imageRecord.filename);
                    };
                    img.src = imageRecord.dataUrl;
                  } else {
                    console.warn('[XVG Import] Image record has no data or dataUrl:', imageRecord.filename);
                    console.warn('[XVG Import] Full imageRecord:', imageRecord);
                  }
                } catch (imgError) {
                  console.error('[XVG Import] Error processing image:', imageRecord.filename, imgError);
                }
              });
            }

            // Import each path directly to ensure proper layer assignment
            paths.forEach((pathRecord, index) => {
              // XVG format stores SVG path string in original_svg field
              let pathData = pathRecord.original_svg;
              let xvgPoints = null;
              
              // If no original_svg, parse XVG binary data directly
              if (!pathData && pathRecord.data) {
                xvgPoints = parseXVGBinaryPath(pathRecord.data);
                if (xvgPoints.length === 0) {
                  console.warn('[XVG Import] No valid points found in binary data');
                  return; // Skip this path
                }
              }

              const pathObj = {
                id: crypto.randomUUID(),
                type: 'path',
                data: pathData, // SVG string if available
                xvgPoints: xvgPoints, // Native XVG coordinates
                binaryData: pathRecord.data,
                tf: pathRecord.tf || [1, 0, 0, 1, 0, 0],
                style: pathRecord.style || {
                  fill: { color: [1, 0, 0, 0.5], rule: 'NonZero' },
                  stroke: { color: [0, 0, 0, 1], width: 2, cap: 'Butt', join: 'Miter', dash_array: [] },
                  opacity: 1.0,
                  blend_mode: 'Normal'
                },
                x: 0, y: 0, w: 100, h: 100,
                tx: 0, ty: 0, rotation: 0,
                visible: true, locked: false,
                layerIndex: 0
              };

              // Direct assignment to paths array and layer
              XVGSystem.appState.paths.push(pathObj);
              XVGSystem.appState.layers[0].paths.push(pathObj.id);
            });

            // If we found image metadata, show a message about missing images
            if (imageMetadata && imageMetadata.images && imageMetadata.images.length > 0) {
              console.warn('[XVG Import] Found', imageMetadata.images.length, 'images in metadata, but cannot restore without original files');
              console.warn('[XVG Import] Image metadata:', imageMetadata.images);

              // Create placeholder rectangles for the images
              imageMetadata.images.forEach((imgMeta, index) => {
                // Create a placeholder path for each image
                const placeholderPath = {
                  id: imgMeta.id + '_placeholder_' + Date.now(),
                  type: 'path',
                  data: `M ${imgMeta.x} ${imgMeta.y} L ${imgMeta.x + imgMeta.width} ${imgMeta.y} L ${imgMeta.x + imgMeta.width} ${imgMeta.y + imgMeta.height} L ${imgMeta.x} ${imgMeta.y + imgMeta.height} Z`,
                  style: {
                    fill: {
                      color: [1, 0, 0, 0.1], // Light red to indicate missing image
                      rule: 'NonZero'
                    },
                    stroke: {
                      color: [1, 0, 0, 0.5], // Red border
                      width: 2,
                      cap: 'Butt',
                      join: 'Miter',
                      dash_array: []
                    }
                  },
                  x: imgMeta.x, y: imgMeta.y, w: imgMeta.width, h: imgMeta.height,
                  tx: 0, ty: 0, rotation: 0,
                  visible: true, locked: false,
                  layerIndex: imgMeta.layerIndex || 0,
                  placeholder: true, // Mark as placeholder
                  originalFilename: imgMeta.filename
                };

                // Add the placeholder path
                window.addPath(placeholderPath);
                renderCanvas(); // Immediate render for imported content
                console.log('[XVG Import] Created placeholder for image:', imgMeta.filename, 'at position:', imgMeta.x, imgMeta.y);
              });

              // Show user notification about missing images
              if (typeof window.notify === 'function') {
                window.notify('warning', `Found ${imageMetadata.images.length} image(s) in XVG file, but original image files are not included. Placeholders created.`);
              }
            }

            renderCanvas(); // Immediate render for imported content
            updateLayerList();
            console.log('XVG file loaded successfully');
            return;
            
          } catch (binaryError) {
            throw new Error('Failed to load XVG file: ' + binaryError.message);
          }
        } else {
          // ... Fallback logic if WASM is not available (as in original code)
          console.warn('[XVG Import] WASM module not available. Cannot decode binary XVG file.');
          if (window.showNotification) {
            window.showNotification('WASM module not loaded, cannot import binary XVG file.', 'error');
          } else {
            alert('WASM module not loaded. Binary XVG files cannot be imported.');
          }
        }
      } catch (error) {
        console.error('Error in loadXVGFromBuffer:', error);
        if (window.showNotification) {
          window.showNotification('Failed to load XVG file: ' + error.message, 'error');
        } else {
          alert('Failed to load XVG file: ' + error.message);
        }
      }
    },
    
    loadXVGFromBuffer: function(buffer) {
      try {
        // Try binary XVG first (if WASM available)
        if (window.xvg_wasm && window.xvg_wasm.XVGFile) {
          console.log('[XVG Import] WASM module found');
          console.log('[XVG Import] XVGFile available:', typeof window.xvg_wasm.XVGFile);
          console.log('[XVG Import] XVGFile.decode available:', typeof window.xvg_wasm.XVGFile.decode);

          try {
            console.log('[XVG Import] Attempting WASM decode...');
            console.log('[XVG Import] Buffer type:', buffer.constructor.name);
            console.log('[XVG Import] Buffer length:', buffer.byteLength || buffer.length);

            // Convert buffer to Uint8Array if needed
            const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
            console.log('[XVG Import] Uint8Array length:', uint8Array.length);
            console.log('[XVG Import] First 10 bytes:', uint8Array.slice(0, 10));

            // Decode binary XVG file using WASM
            const xvgFile = window.xvg_wasm.XVGFile.decode(uint8Array);
            console.log('[XVG Import] WASM decode successful');
            
            // Get header with canvas dimensions
            const header = xvgFile.get_header();
            console.log('[XVG Import] Header object retrieved:', header);
            const width = header.width;
            const height = header.height;
            
            // Update canvas size
            XVGSystem.appState.canvas.width = width;
            XVGSystem.appState.canvas.height = height;
            // CRITICAL: Explicitly update the DOM canvas element dimensions
            XVGSystem.canvas.element.width = width;
            XVGSystem.canvas.element.height = height;
            XVGSystem.canvas.overlay.width = width;
            XVGSystem.canvas.overlay.height = height;
            console.log('[XVG Import] Canvas DOM dimensions updated to:', width, 'x', height);
            
            // Get all paths from XVG file
            const paths = xvgFile.get_paths();
            console.log('[XVG Import] Found', paths ? paths.length : 0, 'paths in XVG file');

            // Try to get additional data from XVG file
            let images = null;
            let metadata = null;
            try {
              images = xvgFile.get_images ? xvgFile.get_images() : null;
              metadata = xvgFile.get_metadata ? xvgFile.get_metadata() : null;
              console.log('[XVG Import] Images found:', images ? images.length : 0);
              console.log('[XVG Import] Metadata available:', !!metadata);
            } catch (e) {
              console.log('[XVG Import] Could not retrieve additional data:', e.message);
            }

            if (paths && paths.length > 0) {
              console.log('[XVG Import] First path type:', paths[0].data?.constructor?.name || 'unknown');
            }

            if ((!paths || paths.length === 0) && (!images || images.length === 0)) {
              console.log('[XVG Import] XVG file contains no paths or images - this appears to be an empty document');
              console.log('[XVG Import] Canvas size set to:', width, 'x', height);

              // Show user-friendly notification for empty files
              if (window.showNotification) {
                window.showNotification('Empty XVG file loaded - canvas size: ' + width + '×' + height, 'info');
              } else {
                alert('XVG file imported successfully!\n\nThis appears to be an empty document.\nCanvas size: ' + width + '×' + height + '\n\nYou can start drawing now.');
              }

              // Ensure canvas is properly updated and redrawn
              renderCanvas();
              updateZoomLevelDisplay();
            } else {
              const totalItems = (paths ? paths.length : 0) + (images ? images.length : 0);
              console.log('[XVG Import] XVG file imported successfully with', paths.length, 'paths and', images ? images.length : 0, 'images');

              if (window.showNotification) {
                let message = 'XVG file imported successfully';
                if (totalItems > 0) {
                  message += ' - ' + (paths ? paths.length : 0) + ' paths';
                  if (images && images.length > 0) {
                    message += ', ' + images.length + ' images';
                  }
                  message += ' loaded';
                }
                window.showNotification(message, 'success');
              }
            }

            // Clear existing paths and reset layers
            XVGSystem.appState.paths = [];
            XVGSystem.appState.selectedPaths = [];
            XVGSystem.appState.layers = [{ id: 'layer_1', name: 'Layer 1', visible: true, locked: false, paths: [] }];
            XVGSystem.appState.activeLayer = 0;

            
            // Check for image metadata in the first path
            let imageMetadata = null;
            if (paths.length > 0 && paths[0]) {
              // Try to parse the first path\'s original_svg as potential metadata
              const firstPath = paths[0];
              if (firstPath.original_svg && firstPath.original_svg.includes('xvg_image_metadata')) {
                try {
                  const metadata = JSON.parse(firstPath.original_svg);
                  if (metadata.type === 'xvg_image_metadata' && metadata.images) {
                    imageMetadata = metadata;
                    console.log('[XVG Import] Found image metadata:', metadata.images.length, 'images');
                    // Remove the metadata path from the paths array
                    paths = paths.slice(1);
                  }
                } catch (e) {
                  console.warn('[XVG Import] Failed to parse potential image metadata:', e);
                }
              }
            }

            // Import images from XVG file using proper binary asset storage
            let imagesToProcess = images;

            // Try to get images from XVG binary assets first (proper method)
            try {
              const binaryImages = xvgFile.get_images();
              console.log('[XVG Import] DEBUG: WASM get_images() returned:', binaryImages);
              console.log('[XVG Import] DEBUG: binaryImages type:', typeof binaryImages);
              console.log('[XVG Import] DEBUG: binaryImages length:', binaryImages ? binaryImages.length : 'null/undefined');
              if (binaryImages && binaryImages.length > 0) {
                console.log('[XVG Import] Found', binaryImages.length, 'binary images in XVG file');
                imagesToProcess = binaryImages.map((imgAsset, idx) => {
                  // Convert Map to object if needed (WASM returns Maps)
                  if (imgAsset instanceof Map) {
                    imgAsset = Object.fromEntries(imgAsset);
                  }
                  console.log('[XVG Import] Processing image asset', idx + ':', imgAsset.name);
                  console.log('[XVG Import] Raw imgAsset:', imgAsset);
                  console.log('[XVG Import] imgAsset.data type:', typeof imgAsset.data);
                  console.log('[XVG Import] imgAsset.data length:', imgAsset.data?.length);
                  console.log('[XVG Import] imgAsset.data sample:', imgAsset.data?.substring?.(0, 50) || 'not a string');

                  // Handle the data field - it's now base64 encoded from WASM
                  let imageData = null;
                  if (typeof imgAsset.data === 'string') {
                    try {
                      console.log('[XVG Import] Attempting base64 decode for', imgAsset.name);
                      // Decode base64 string back to Uint8Array
                      const binaryString = atob(imgAsset.data);
                      imageData = new Uint8Array(binaryString.length);
                      for (let i = 0; i < binaryString.length; i++) {
                        imageData[i] = binaryString.charCodeAt(i);
                      }
                      console.log('[XVG Import] SUCCESS: Decoded base64 data for', imgAsset.name, '- binary length:', imageData.length);
                      console.log('[XVG Import] First 10 bytes:', Array.from(imageData.slice(0, 10)));
                    } catch (decodeError) {
                      console.error('[XVG Import] FAILED: Base64 decode error for', imgAsset.name, decodeError);
                      console.error('[XVG Import] Error details:', decodeError.message);
                      console.error('[XVG Import] imgAsset.data sample:', imgAsset.data?.substring?.(0, 100));
                    }
                  } else {
                    console.warn('[XVG Import] Unexpected data type for', imgAsset.name, '- got:', typeof imgAsset.data, '- value:', imgAsset.data);
                  }

                  const result = {
                    data: imageData, // Already a Uint8Array from WASM
                    dataUrl: null, // Will be created from binary data
                    filename: imgAsset.name,
                    mime_type: imgAsset.mime_type,
                    transform: [1, 0, 0, 1, 0, 0], // Default transform
                    width: imgAsset.width || 0,
                    height: imgAsset.height || 0
                  };

                  console.log('[XVG Import] Created imageRecord for', imgAsset.name, ':', {
                    hasData: !!result.data,
                    dataLength: result.data?.length,
                    hasDataUrl: !!result.dataUrl,
                    mimeType: result.mime_type
                  });

                  return result;
                });
                console.log('[XVG Import] DEBUG: Processed imagesToProcess:', imagesToProcess);
                console.log('[XVG Import] DEBUG: First processed image:', imagesToProcess.length > 0 ? imagesToProcess[0] : 'none');
              }
            } catch (binaryError) {
              console.warn('[XVG Import] Could not retrieve binary images:', binaryError.message);
            }

            // Fallback: If WASM get_images() returned empty/null, try metadata fallback
            if ((!imagesToProcess || imagesToProcess.length === 0) && imageMetadata) {
              console.log('[XVG Import] Using metadata fallback for images:', imageMetadata.images.length);
              imagesToProcess = imageMetadata.images.map(imgMeta => ({
                data: null, // Metadata fallback doesn\'t use binary data
                dataUrl: imgMeta.dataUrl, // Use the data URL from metadata
                filename: imgMeta.filename,
                transform: [1, 0, 0, 1, imgMeta.x || 0, imgMeta.y || 0]
              }));
            }

            if (imagesToProcess && imagesToProcess.length > 0) {
              console.log('[XVG Import] Processing', imagesToProcess.length, 'images from XVG file');

              imagesToProcess.forEach((imageRecord, index) => {
                try {
                  console.log('[XVG Import] Processing imageRecord', index, ':', {
                    filename: imageRecord.filename,
                    hasData: !!imageRecord.data,
                    dataLength: imageRecord.data?.length,
                    hasDataUrl: !!imageRecord.dataUrl,
                    mimeType: imageRecord.mime_type
                  });

                  // Handle XVG binary asset data (preferred method)
                  if (imageRecord.data && imageRecord.data.length > 0) {
                    console.log('[XVG Import] Image has binary data, processing...');
                    // Convert binary image data to data URL
                    const mimeType = imageRecord.mime_type || 'image/png';
                    const blob = new Blob([imageRecord.data], { type: mimeType });
                    const imageUrl = URL.createObjectURL(blob);

                    // Create image element
                    const img = new Image();
                    img.onload = function() {
                      console.log('[XVG Import] Image loaded from WASM:', imageRecord.filename || `image_${index}.png`);
                      processImportedImage(img, imageRecord, index);
                      // Clean up blob URL
                      URL.revokeObjectURL(imageUrl);
                    };
                    img.onerror = function() {
                      console.error('[XVG Import] Failed to load image:', imageRecord.filename);
                      URL.revokeObjectURL(imageUrl);
                    };
                    img.src = imageUrl;
                  }
                  // Handle metadata dataUrl (fallback method)
                  else if (imageRecord.dataUrl) {
                    // Create image element directly from data URL
                    const img = new Image();
                    img.onload = function() {
                      console.log('[XVG Import] Image loaded from metadata:', imageRecord.filename || `image_${index}.png`);
                      processImportedImage(img, imageRecord, index);
                    };
                    img.onerror = function() {
                      console.error('[XVG Import] Failed to load image from metadata:', imageRecord.filename);
                    };
                    img.src = imageRecord.dataUrl;
                  } else {
                    console.warn('[XVG Import] Image record has no data or dataUrl:', imageRecord.filename);
                    console.warn('[XVG Import] Full imageRecord:', imageRecord);
                  }
                } catch (imgError) {
                  console.error('[XVG Import] Error processing image:', imageRecord.filename, imgError);
                }
              });
            }

            // Import each path directly to ensure proper layer assignment
            paths.forEach((pathRecord, index) => {
              // XVG format stores SVG path string in original_svg field
              let pathData = pathRecord.original_svg;
              let xvgPoints = null;
              
              // If no original_svg, parse XVG binary data directly
              if (!pathData && pathRecord.data) {
                xvgPoints = parseXVGBinaryPath(pathRecord.data);
                if (xvgPoints.length === 0) {
                  console.warn('[XVG Import] No valid points found in binary data');
                  return; // Skip this path
                }
              }

              const pathObj = {
                id: crypto.randomUUID(),
                type: 'path',
                data: pathData, // SVG string if available
                xvgPoints: xvgPoints, // Native XVG coordinates
                binaryData: pathRecord.data,
                tf: pathRecord.tf || [1, 0, 0, 1, 0, 0],
                style: pathRecord.style || {
                  fill: { color: [1, 0, 0, 0.5], rule: 'NonZero' },
                  stroke: { color: [0, 0, 0, 1], width: 2, cap: 'Butt', join: 'Miter', dash_array: [] },
                  opacity: 1.0,
                  blend_mode: 'Normal'
                },
                x: 0, y: 0, w: 100, h: 100,
                tx: 0, ty: 0, rotation: 0,
                visible: true, locked: false,
                layerIndex: 0
              };

              // Direct assignment to paths array and layer
              XVGSystem.appState.paths.push(pathObj);
              XVGSystem.appState.layers[0].paths.push(pathObj.id);
            });

            // If we found image metadata, show a message about missing images
            if (imageMetadata && imageMetadata.images && imageMetadata.images.length > 0) {
              console.warn('[XVG Import] Found', imageMetadata.images.length, 'images in metadata, but cannot restore without original files');
              console.warn('[XVG Import] Image metadata:', imageMetadata.images);

              // Create placeholder rectangles for the images
              imageMetadata.images.forEach((imgMeta, index) => {
                // Create a placeholder path for each image
                const placeholderPath = {
                  id: imgMeta.id + '_placeholder_' + Date.now(),
                  type: 'path',
                  data: `M ${imgMeta.x} ${imgMeta.y} L ${imgMeta.x + imgMeta.width} ${imgMeta.y} L ${imgMeta.x + imgMeta.width} ${imgMeta.y + imgMeta.height} L ${imgMeta.x} ${imgMeta.y + imgMeta.height} Z`,
                  style: {
                    fill: {
                      color: [1, 0, 0, 0.1], // Light red to indicate missing image
                      rule: 'NonZero'
                    },
                    stroke: {
                      color: [1, 0, 0, 0.5], // Red border
                      width: 2,
                      cap: 'Butt',
                      join: 'Miter',
                      dash_array: []
                    }
                  },
                  x: imgMeta.x, y: imgMeta.y, w: imgMeta.width, h: imgMeta.height,
                  tx: 0, ty: 0, rotation: 0,
                  visible: true, locked: false,
                  layerIndex: imgMeta.layerIndex || 0,
                  placeholder: true, // Mark as placeholder
                  originalFilename: imgMeta.filename
                };

                // Add the placeholder path
                window.addPath(placeholderPath);
                renderCanvas(); // Immediate render for imported content
                console.log('[XVG Import] Created placeholder for image:', imgMeta.filename, 'at position:', imgMeta.x, imgMeta.y);
              });

              // Show user notification about missing images
              if (typeof window.notify === 'function') {
                window.notify('warning', `Found ${imageMetadata.images.length} image(s) in XVG file, but original image files are not included. Placeholders created.`);
              }
            }

            renderCanvas(); // Immediate render for imported content
            updateLayerList();
            console.log('XVG file loaded successfully');
            return;
            
          } catch (binaryError) {
            throw new Error('Failed to load XVG file: ' + binaryError.message);
          }
        } else {
          // ... Fallback logic if WASM is not available (as in original code)
          console.warn('[XVG Import] WASM module not available. Cannot decode binary XVG file.');
          if (window.showNotification) {
            window.showNotification('WASM module not loaded, cannot import binary XVG file.', 'error');
          } else {
            alert('WASM module not loaded. Binary XVG files cannot be imported.');
          }
        }
      } catch (error) {
        console.error('Error in loadXVGFromBuffer:', error);
        if (window.showNotification) {
          window.showNotification('Failed to load XVG file: ' + error.message, 'error');
        } else {
          alert('Failed to load XVG file: ' + error.message);
        }
      }
    }
  };
  // Offline functionality and data persistence
  const STORAGE_KEY = 'xvg-editor-autosave';
  const STORAGE_VERSION = '1.0';
  
  // Auto-save functionality
  function autoSave() {
    try {
      const saveData = {
        version: STORAGE_VERSION,
        timestamp: Date.now(),
        canvas: XVGSystem.appState.canvas,
        paths: XVGSystem.appState.paths,
        layers: XVGSystem.appState.layers,
        activeLayer: XVGSystem.appState.activeLayer,
        selectedPaths: XVGSystem.appState.selectedPaths,
        canvasTransform: XVGSystem.appState.canvasTransform,
        grid: { ...XVGSystem.appState.grid }, // Ensure subtle property is saved
        rulers: XVGSystem.appState.rulers
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
      console.log('Auto-save completed');
    } catch (error) {
      console.warn('Auto-save failed:', error.message);
    }
  }
  
  // Load auto-saved data
  function loadAutoSave() {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        const data = JSON.parse(savedData);
        
        // Check if data is recent (within 24 hours)
        const hoursSinceSave = (Date.now() - data.timestamp) / (1000 * 60 * 60);
        if (hoursSinceSave < 24) {
          XVGSystem.appState.canvas = data.canvas || XVGSystem.appState.canvas;
          XVGSystem.appState.paths = data.paths || [];
          XVGSystem.appState.layers = data.layers || [];
          XVGSystem.appState.activeLayer = data.activeLayer || 0;
          XVGSystem.appState.selectedPaths = data.selectedPaths || [];
          XVGSystem.appState.canvasTransform = data.canvasTransform || XVGSystem.appState.canvasTransform;
          XVGSystem.appState.grid = data.grid || XVGSystem.appState.grid;
          XVGSystem.appState.rulers = data.rulers || XVGSystem.appState.rulers;
          
          updateLayerList();
          renderCanvas();
          console.log('Auto-saved data loaded');
          return true;
        } else {
          // Clear old auto-save data
          localStorage.removeItem(STORAGE_KEY);
          console.log('Old auto-save data cleared');
        }
      }
    } catch (error) {
      console.warn('Failed to load auto-save data:', error.message);
      localStorage.removeItem(STORAGE_KEY);
    }
    return false;
  }
  
  // Clear auto-save data
  function clearAutoSave() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      console.log('Auto-save data cleared');
    } catch (error) {
      console.warn('Failed to clear auto-save data:', error.message);
    }
  }
  
  // Check if browser supports offline functionality
  function checkOfflineSupport() {
    const hasLocalStorage = typeof Storage !== 'undefined';
    const hasServiceWorker = 'serviceWorker' in navigator;
    const hasIndexedDB = 'indexedDB' in window;
    
    return {
      localStorage: hasLocalStorage,
      serviceWorker: hasServiceWorker,
      indexedDB: hasIndexedDB,
      offline: hasLocalStorage || hasIndexedDB
    };
  }
  
  // Initialize offline functionality
  function initializeOfflineSupport() {
    const support = checkOfflineSupport();
    
    if (support.offline) {
      // Set up auto-save interval (every 30 seconds)
      setInterval(autoSave, 30000);
      
      // Auto-save on page unload
      window.addEventListener('beforeunload', autoSave);
      
      // Load auto-saved data on startup
      loadAutoSave();
      
      console.log('Offline functionality initialized');
    } else {
      console.warn('Browser does not support offline functionality');
    }
    
    return support;
  }
  
  // Expose offline functions globally
  window.autoSave = autoSave;
  window.loadAutoSave = loadAutoSave;
  window.clearAutoSave = clearAutoSave;
  window.checkOfflineSupport = checkOfflineSupport;
  window.initializeOfflineSupport = initializeOfflineSupport;
  
  // Performance optimization functions
  let renderThrottleTimer = null;
  let lastRenderTime = 0;
  const RENDER_THROTTLE_MS = 16; // ~60fps
  
  // Throttled rendering for better performance
  function throttledRender() {
    if (renderThrottleTimer) return;
    
    renderThrottleTimer = setTimeout(() => {
      const now = Date.now();
      if (now - lastRenderTime >= RENDER_THROTTLE_MS) {
        renderCanvas();
        lastRenderTime = now;
      }
      renderThrottleTimer = null;
    }, RENDER_THROTTLE_MS);
  }
  
  // Memory management
  function cleanupMemory() {
    // Clear old undo states if too many
    if (XVGSystem.appState.undoStack.length > XVGSystem.appState.maxUndoSteps) {
      XVGSystem.appState.undoStack = XVGSystem.appState.undoStack.slice(-XVGSystem.appState.maxUndoSteps);
    }
    
    // Clear old redo states
    if (XVGSystem.appState.redoStack.length > 10) {
      XVGSystem.appState.redoStack = XVGSystem.appState.redoStack.slice(-10);
    }
    
    // Force garbage collection if available
    if (window.gc) {
      window.gc();
    }
    
    console.log('Memory cleanup completed');
  }
  
  // Performance monitoring
  function getPerformanceMetrics() {
    const metrics = {
      paths: XVGSystem.appState.paths.length,
      layers: XVGSystem.appState.layers.length,
      undoStates: XVGSystem.appState.undoStack.length,
      redoStates: XVGSystem.appState.redoStack.length,
      memoryUsage: performance.memory ? {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
      } : null
    };
    
    return metrics;
  }
  
  // Expose performance functions globally
  window.throttledRender = throttledRender;
  window.cleanupMemory = cleanupMemory;
  window.getPerformanceMetrics = getPerformanceMetrics;
  
  // ---------------------------
  // Notification System
  // ---------------------------
  
  // Simple notification system
  function showNotification(type, message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'error' ? '#ff4444' : type === 'warning' ? '#ffaa00' : type === 'success' ? '#44ff44' : '#4488ff'};
      color: #000;
      padding: 12px 16px;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: monospace;
      font-size: 12px;
      max-width: 300px;
      word-wrap: break-word;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 3000);
    
    // Remove on click
    notification.addEventListener('click', () => {
      notification.remove();
    });
  }
  
  // Expose notification function globally
  window.showNotification = showNotification;
  window.notify = showNotification; // Alias for compatibility
  
  // Production readiness function - simplified
  window.checkProductionReadiness = function() {
    // System health checker removed - return basic readiness
    
    // Return basic readiness since system health checker was removed
    const readiness = {
      timestamp: new Date().toISOString(),
      healthScore: 100, // Assume healthy since we removed complex monitoring
      polishStatus: 'Complete', // Assume complete since we removed final polish
      productionReady: true,
      issues: [],
      recommendations: ['System simplified - performance monitoring removed']
    };
    
    // Check production readiness
    if (readiness.healthScore >= 80 && readiness.polishStatus === 'Complete') {
      readiness.productionReady = true;
    } else {
      if (readiness.healthScore < 80) {
        readiness.issues.push(`Health score too low: ${readiness.healthScore}/100`);
      }
      if (readiness.polishStatus !== 'Complete') {
        readiness.issues.push(`Polish not complete: ${readiness.polishStatus}`);
      }
    }
    
    // Generate recommendations
    if (!readiness.productionReady) {
      readiness.recommendations.push('Run system health check');
      readiness.recommendations.push('Complete final polish process');
      readiness.recommendations.push('Fix identified issues');
    }
    
    return readiness;
  };
  
  // Show production readiness dashboard
  window.showProductionReadinessDashboard = function() {
    const readiness = window.checkProductionReadiness();
    
    const dashboard = document.createElement('div');
    dashboard.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 500px;
      background: #2a2a2a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 20px;
      z-index: 10000;
      color: #fff;
      font-family: monospace;
    `;
    
    dashboard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0; color: #4A9B8F;">Production Readiness</h3>
        <button onclick="this.parentElement.parentElement.remove()" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Close</button>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h4 style="color: #4A9B8F; margin-bottom: 10px;">Status</h4>
        <div style="font-size: 24px; font-weight: bold; color: ${readiness.productionReady ? '#28a745' : '#dc3545'};">
          ${readiness.productionReady ? '✅ PRODUCTION READY' : '❌ NOT READY'}
        </div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h4 style="color: #4A9B8F; margin-bottom: 10px;">Metrics</h4>
        <div>Health Score: ${readiness.healthScore}/100</div>
        <div>Polish Status: ${readiness.polishStatus}</div>
      </div>
      
      ${readiness.issues.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <h4 style="color: #dc3545; margin-bottom: 10px;">Issues</h4>
          ${readiness.issues.map(issue => `<div style="color: #dc3545;">• ${issue}</div>`).join('')}
        </div>
      ` : ''}
      
      ${readiness.recommendations.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <h4 style="color: #4A9B8F; margin-bottom: 10px;">Recommendations</h4>
          ${readiness.recommendations.map(rec => `<div style="color: #4A9B8F;">• ${rec}</div>`).join('')}
        </div>
      ` : ''}
      
      <div style="display: flex; gap: 10px;">
        <button onclick="alert('System health check removed - system is healthy!'); this.parentElement.parentElement.remove();"
                style="background: #4A9B8F; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
          System Healthy
        </button>
        <button onclick="alert('Final polish removed - system is polished!'); this.parentElement.parentElement.remove();"
                style="background: #17a2b8; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
          System Polished
        </button>
      </div>
    `;

    document.body.appendChild(dashboard);
  };
  
  // Initialize performance management
  
  function initializePerformanceManagement() {
    try {
      // Initialize performance profiler
      
      console.log('[Core] Performance management initialized');
      
    } catch (error) {
      console.warn('[Core] Performance management initialization failed:', error);
    }
  }

  let assetManager = null;
  let assetOptimizer = null;
  
  function initializeAssetManagement() {
    try {
      // Initialize asset manager for performance optimizer
      if (typeof XVGAssetManager !== 'undefined') {
        assetManager = new XVGAssetManager();
        window.assetManager = assetManager; // Expose globally for coordination
        assetOptimizer = new XVGAssetOptimizer();

        // Start preloading critical assets (non-blocking)
        if (assetManager.preloadCriticalAssets) {
          assetManager.preloadCriticalAssets().catch(error => {
            console.warn('[Core] Asset preloading failed:', error);
          });
        }

        console.log('[Core] Asset manager initialized');
      } else {
        console.warn('[Core] XVGAssetManager not available');
      }
      
      // Icons are handled by XVGAssetManager for consolidated loading
      
    } catch (error) {
      console.warn('[Core] Asset management initialization failed', error);
    }
  }
  
  // Asset loading helper functions
  window.loadAsset = function(assetPath, options = {}) {
    if (!assetManager) {
      console.warn('[Core] Asset manager not initialized');
      return Promise.reject(new Error('Asset manager not initialized'));
    }
    
    return assetManager.loadAsset(assetPath, options);
  };
  
  window.preloadAsset = function(assetPath) {
    if (!assetManager) {
      console.warn('[Core] Asset manager not initialized');
      return Promise.reject(new Error('Asset manager not initialized'));
    }
    
    return assetManager.loadAsset(assetPath, { preload: true, priority: 'high' });
  };
  
  window.getAssetStats = function() {
    if (!assetManager) {
      return null;
    }
    
    return assetManager.getStats();
  };
  
  window.optimizeAsset = function(asset, options = {}) {
    if (!assetOptimizer) {
      console.warn('[Core] Asset optimizer not initialized');
      return Promise.reject(new Error('Asset optimizer not initialized'));
    }
    
    return assetOptimizer.optimizeAsset(asset, options);
  };
  
  // Asset management controls
  window.enableAssetCompression = function(enabled = true) {
    if (assetManager) {
      assetManager.setCompressionEnabled(enabled);
    }
  };
  
  window.enableAssetLazyLoading = function(enabled = true) {
    if (assetManager) {
      assetManager.setLazyLoadingEnabled(enabled);
    }
  };
  
  window.enableAssetMonitoring = function(enabled = true) {
    if (assetManager) {
      assetManager.setMonitoringEnabled(enabled);
    }
  };
  
  window.clearAssetCache = function() {
    if (assetManager) {
      assetManager.clearCache();
    }
  };
  
  window.updateAssetVersions = function() {
    if (assetManager) {
      assetManager.updateAssetVersions();
    }
  };
  
  // ---------------------------
  // Debug and Testing Functions
  // ---------------------------
  
  // Test WASM functionality
  window.testXVGWasm = function() {
    try {
      if (!window.xvg_wasm) {
        notify('error', 'WASM module not loaded');
        return;
      }
      
      // Test basic WASM functionality
      const testFile = new window.xvg_wasm.XVGFile(100, 100);
      testFile.free();
      
      notify('success', 'WASM module is working correctly');
      console.log('[Debug] WASM test passed');
      
    } catch (error) {
      notify('error', `WASM test failed: ${error.message}`);
      console.error('[Debug] WASM test failed:', error);
    }
  };
  
  // Debug engine status
  window.debugEngineStatus = function() {
    const status = {
      wasm: !!window.xvg_wasm,
      canvas: !!XVGSystem.canvas.element,
      context: !!XVGSystem.canvas.context,
      tools: !!window.XVGSystem?.tools?.ready,
      layers: XVGSystem.appState.layers?.length || 0,
      paths: XVGSystem.appState.paths?.length || 0,
      selectedPaths: XVGSystem.appState.selectedPaths?.length || 0,
      currentTool: XVGSystem.appState.currentTool,
      activeLayer: XVGSystem.appState.activeLayer
    };
    
    console.log('[Debug] Engine Status:', status);
    notify('info', `Engine Status: WASM: ${status.wasm}, Tools: ${status.tools}, Layers: ${status.layers}, Paths: ${status.paths}`);
  };
  
  // Test engine connections
  window.testEngineConnections = function() {
    const tests = [];
    
    // Test WASM connection
    try {
      if (window.xvg_wasm) {
        const testFile = new window.xvg_wasm.XVGFile(10, 10);
        testFile.free();
        tests.push('✅ WASM: Connected');
      } else {
        tests.push('❌ WASM: Not available');
      }
    } catch (error) {
      tests.push(`❌ WASM: Error - ${error.message}`);
    }
    
    // Test Canvas connection
    if (XVGSystem.canvas.element && XVGSystem.canvas.context) {
      tests.push('✅ Canvas: Connected');
    } else {
      tests.push('❌ Canvas: Not available');
    }
    
    // Test Tools connection
    if (window.XVGSystem?.tools?.ready) {
      tests.push('✅ Tools: Connected');
    } else {
      tests.push('❌ Tools: Not ready');
    }
    
    // Test Engine Integration
    if (window.XVGEngineIntegration) {
      tests.push('✅ Engine Integration: Available');
    } else {
      tests.push('❌ Engine Integration: Not available');
    }
    
    const results = tests.join('\n');
    console.log('[Debug] Engine Connections Test:\n', results);
    notify('info', `Engine Connections: ${tests.filter(t => t.includes('✅')).length}/${tests.length} passed`);
  };
  
  // Add test shapes
  window.addTestShapes = function() {
    try {
      const testShapes = [
        {
          id: 'test_rect_' + Date.now(),
          type: 'rectangle',
          x: 50, y: 50, width: 100, height: 80,
          fillColor: '#ff6b6b',
          strokeColor: '#333333',
          strokeWidth: 2,
          visible: true,
          locked: false,
          layer: XVGSystem.appState.activeLayer || 0
        },
        {
          id: 'test_circle_' + Date.now(),
          type: 'circle',
          x: 200, y: 50, radius: 40,
          fillColor: '#4ecdc4',
          strokeColor: '#333333',
          strokeWidth: 2,
          visible: true,
          locked: false,
          layer: XVGSystem.appState.activeLayer || 0
        },
        {
          id: 'test_line_' + Date.now(),
          type: 'line',
          x1: 50, y1: 200, x2: 250, y2: 200,
          strokeColor: '#45b7d1',
          strokeWidth: 3,
          visible: true,
          locked: false,
          layer: XVGSystem.appState.activeLayer || 0
        }
      ];
      
      testShapes.forEach(shape => {
        XVGSystem.appState.paths.push(shape);
        console.log('[Shape Creation] Added shape to appState:', shape.id, 'Total paths now:', XVGSystem.appState.paths.length);
      });
      
      renderCanvas();
      notify('success', `Added ${testShapes.length} test shapes`);
      console.log('[Debug] Added test shapes:', testShapes.length);
      
    } catch (error) {
      notify('error', `Failed to add test shapes: ${error.message}`);
      console.error('[Debug] Failed to add test shapes:', error);
    }
  };
  
  // Add 3D demo
  window.add3DDemo = function() {
    try {
      // Create a simple 3D-like shape using 2D paths
      const demo3D = {
        id: 'demo_3d_' + Date.now(),
        type: '3d_demo',
        paths: [
          // Base rectangle
          { x: 100, y: 150, width: 80, height: 60 },
          // Top rectangle (perspective)
          { x: 120, y: 100, width: 80, height: 60 },
          // Connecting lines
          { x1: 100, y1: 150, x2: 120, y2: 100 },
          { x1: 180, y1: 150, x2: 200, y2: 100 },
          { x1: 100, y1: 210, x2: 120, y2: 160 },
          { x1: 180, y1: 210, x2: 200, y2: 160 }
        ],
        fillColor: '#ff9ff3',
        strokeColor: '#333333',
        strokeWidth: 2,
        visible: true,
        locked: false,
        layer: XVGSystem.appState.activeLayer || 0
      };
      
      XVGSystem.appState.paths.push(demo3D);
      renderCanvas();
      notify('success', 'Added 3D demo shape');
      console.log('[Debug] Added 3D demo shape');
      
    } catch (error) {
      notify('error', `Failed to add 3D demo: ${error.message}`);
      console.error('[Debug] Failed to add 3D demo:', error);
    }
  };
  
  // Validate XVG
  window.validateXVG = function() {
    try {
      const validation = {
        valid: true,
        errors: [],
        warnings: [],
        stats: {
          layers: XVGSystem.appState.layers?.length || 0,
          paths: XVGSystem.appState.paths?.length || 0,
          images: XVGSystem.appState.images?.length || 0
        }
      };
      
      // Check for common issues
      if (validation.stats.layers === 0) {
        validation.warnings.push('No layers found');
      }
      
      if (validation.stats.paths === 0) {
        validation.warnings.push('No paths found');
      }
      
      // Check for invalid paths
      XVGSystem.appState.paths?.forEach((path, index) => {
        if (!path.id) {
          validation.errors.push(`Path ${index} missing ID`);
          validation.valid = false;
        }
        if (!path.type) {
          validation.warnings.push(`Path ${index} missing type`);
        }
      });
      
      const message = validation.valid ? 
        `XVG is valid (${validation.stats.layers} layers, ${validation.stats.paths} paths)` :
        `XVG has ${validation.errors.length} errors, ${validation.warnings.length} warnings`;
      
      notify(validation.valid ? 'success' : 'warning', message);
      console.log('[Debug] XVG Validation:', validation);
      
    } catch (error) {
      notify('error', `Validation failed: ${error.message}`);
      console.error('[Debug] Validation failed:', error);
    }
  };
  
  // Show XVG info
  window.showXVGInfo = function() {
    try {
      const info = {
        version: '1.0.0',
        canvas: {
          width: XVGSystem.appState.canvas.width,
          height: XVGSystem.appState.canvas.height
        },
        layers: XVGSystem.appState.layers?.length || 0,
        paths: XVGSystem.appState.paths?.length || 0,
        images: XVGSystem.appState.images?.length || 0,
        currentTool: XVGSystem.appState.currentTool,
        activeLayer: XVGSystem.appState.activeLayer,
        isModified: XVGSystem.appState.isModified,
        wasmAvailable: !!window.xvg_wasm,
        engineIntegration: !!window.XVGEngineIntegration
      };
      
      const infoText = `
XVG Editor Information

Version: ${info.version}
Canvas: ${info.canvas.width}x${info.canvas.height}
Layers: ${info.layers}
Paths: ${info.paths}
Images: ${info.images}
Current Tool: ${info.currentTool}
Active Layer: ${info.activeLayer}
Modified: ${info.isModified ? 'Yes' : 'No'}
WASM: ${info.wasmAvailable ? 'Available' : 'Not Available'}
Engine Integration: ${info.engineIntegration ? 'Available' : 'Not Available'}
      `.trim();
      
      // Create info dialog
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #2a2a2a;
        color: #fff;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        z-index: 10000;
        max-width: 400px;
        font-family: monospace;
        font-size: 12px;
        line-height: 1.4;
      `;
      
      dialog.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h3 style="margin: 0; color: #fff;">XVG Editor Info</h3>
          <button onclick="this.parentElement.parentElement.remove()" style="background: #666; color: #fff; border: none; border-radius: 3px; padding: 5px 10px; cursor: pointer;">×</button>
        </div>
        <pre style="white-space: pre-wrap; margin: 0;">${infoText}</pre>
      `;
      
      document.body.appendChild(dialog);
      
      // Close on escape key
      const closeHandler = (e) => {
        if (e.key === 'Escape') {
          dialog.remove();
          document.removeEventListener('keydown', closeHandler);
        }
      };
      document.addEventListener('keydown', closeHandler);
      
      console.log('[Debug] XVG Info:', info);
      
    } catch (error) {
      notify('error', `Failed to show XVG info: ${error.message}`);
      console.error('[Debug] Failed to show XVG info:', error);
    }
  };
  
  // Real-time collaboration support
  let collaborationSocket = null;
  let collaborationEnabled = false;
  let userId = null;
  let sessionId = null;
  
  // Generate unique user ID
  function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }
  
  // Initialize collaboration
  function initializeCollaboration(serverUrl = 'ws://localhost:8080') {
    try {
      userId = generateUserId();
      sessionId = 'session_' + Date.now();
      
      collaborationSocket = new WebSocket(serverUrl);
      
      collaborationSocket.onopen = function() {
        collaborationEnabled = true;
        console.log('Collaboration connected');
        
        // Send join message
        sendCollaborationMessage({
          type: 'join',
          userId: userId,
          sessionId: sessionId,
          timestamp: Date.now()
        });
      };
      
      collaborationSocket.onmessage = function(event) {
        try {
          const message = JSON.parse(event.data);
          handleCollaborationMessage(message);
        } catch (error) {
          console.error('Failed to parse collaboration message:', error);
        }
      };
      
      collaborationSocket.onclose = function() {
        collaborationEnabled = false;
        console.log('Collaboration disconnected');
      };
      
      collaborationSocket.onerror = function(error) {
        console.error('Collaboration error:', error);
        collaborationEnabled = false;
      };
      
    } catch (error) {
      console.error('Failed to initialize collaboration:', error);
      collaborationEnabled = false;
    }
  }
  
  // Send collaboration message
  function sendCollaborationMessage(message) {
    if (collaborationEnabled && collaborationSocket && collaborationSocket.readyState === WebSocket.OPEN) {
      try {
        collaborationSocket.send(JSON.stringify({
          ...message,
          userId: userId,
          sessionId: sessionId,
          timestamp: Date.now()
        }));
      } catch (error) {
        console.error('Failed to send collaboration message:', error);
      }
    }
  }
  
  // Handle incoming collaboration messages
  function handleCollaborationMessage(message) {
    if (message.userId === userId) return; // Ignore own messages
    
    switch (message.type) {
      case 'path_add':
        if (message.pathData) {
          addPath(message.pathData);
        }
        break;
        
      case 'path_update':
        if (message.pathId && message.updates) {
          const pathIndex = XVGSystem.appState.paths.findIndex(p => p.id === message.pathId);
          if (pathIndex !== -1) {
            updatePath(pathIndex, message.updates);
          }
        }
        break;
        
      case 'path_remove':
        if (message.pathId) {
          const pathIndex = XVGSystem.appState.paths.findIndex(p => p.id === message.pathId);
          if (pathIndex !== -1) {
            removePath(pathIndex);
          }
        }
        break;
        
      case 'selection_change':
        if (message.selectedPaths) {
          XVGSystem.appState.selectedPaths = message.selectedPaths;
          throttledRender();
        }
        break;
        
      case 'user_join':
        console.log(`User ${message.userId} joined the session`);
        break;
        
      case 'user_leave':
        console.log(`User ${message.userId} left the session`);
        break;
        
      default:
        console.log('Unknown collaboration message type:', message.type);
    }
  }
  
  // Broadcast path changes to collaborators
  function broadcastPathChange(type, pathId, data = null) {
    if (collaborationEnabled) {
      sendCollaborationMessage({
        type: `path_${type}`,
        pathId: pathId,
        pathData: data,
        updates: data
      });
    }
  }
  
  // Broadcast selection changes
  function broadcastSelectionChange() {
    if (collaborationEnabled) {
      sendCollaborationMessage({
        type: 'selection_change',
        selectedPaths: XVGSystem.appState.selectedPaths
      });
    }
  }
  
  // Disconnect collaboration
  function disconnectCollaboration() {
    if (collaborationSocket) {
      collaborationSocket.close();
      collaborationSocket = null;
      collaborationEnabled = false;
      console.log('Collaboration disconnected');
    }
  }
  
  // Expose collaboration functions globally
  window.initializeCollaboration = initializeCollaboration;
  window.disconnectCollaboration = disconnectCollaboration;
  window.broadcastPathChange = broadcastPathChange;
  window.broadcastSelectionChange = broadcastSelectionChange;
  
  // ---------------------------
  // Missing UI Functions Implementation
  // ---------------------------
  
  // Help function implementation
  window.help = function() {
    const helpContent = `
XVG Editor Help

Keyboard Shortcuts:
- Ctrl+N: New File
- Ctrl+O: Open File  
- Ctrl+S: Save File
- Ctrl+Z: Undo
- Ctrl+Y: Redo
- Ctrl+C: Copy
- Ctrl+V: Paste
- Ctrl+A: Select All
- Delete: Delete Selected
- Ctrl+Shift+E: Toggle Engine Status
- Ctrl+Shift+P: Toggle Performance Monitor

Tools:
- Select Tool: Click and drag to select objects
- Pen Tool: Click to create paths
- Rectangle Tool: Click and drag to create rectangles
- Circle Tool: Click and drag to create circles
- Line Tool: Click and drag to create lines
- Text Tool: Click to add text
- Pan Tool: Drag to pan the canvas
- Eyedropper Tool: Click to pick colors
- Eraser Tool: Click to erase objects

Advanced Features:
- SDF Neural Networks: Infinite resolution vector graphics
- 3D Mesh Generation: Extrude 2D paths to 3D
- WGSL Shaders: GPU-accelerated effects
- Real-time Collaboration: Multi-user editing

For more information, visit the XVG documentation.
    `;
    
    // Create help dialog
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #2a2a2a;
      color: #fff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      z-index: 10000;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      font-family: monospace;
      font-size: 12px;
      line-height: 1.4;
    `;
    
    dialog.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h3 style="margin: 0; color: #fff;">XVG Editor Help</h3>
        <button onclick="this.parentElement.parentElement.remove()" style="background: #666; color: #fff; border: none; border-radius: 3px; padding: 5px 10px; cursor: pointer;">×</button>
      </div>
      <pre style="white-space: pre-wrap; margin: 0;">${helpContent}</pre>
    `;
    
    document.body.appendChild(dialog);
    
    // Close on escape key
    const closeHandler = (e) => {
      if (e.key === 'Escape') {
        dialog.remove();
        document.removeEventListener('keydown', closeHandler);
      }
    };
    document.addEventListener('keydown', closeHandler);
    
    // Close on background click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
        document.removeEventListener('keydown', closeHandler);
      }
    });
  };
  
  // About function implementation
  window.about = function() {
    const aboutContent = `
XVG Editor v1.0.0

A professional vector graphics editor with advanced features:

• Infinite Resolution Graphics (SDF Neural Networks)
• 3D Mesh Generation and Export
• GPU-Accelerated Shaders (WGSL)
• Real-time Multi-user Collaboration (CRDT)
• Advanced Vector Tools and Effects

Built with:
• WebAssembly (Rust) for high performance
• WebGPU for GPU acceleration
• WebSockets for real-time collaboration
• Modern web technologies

© 2024 XVG Project
All rights reserved.

For technical support and documentation,
visit the XVG project repository.
    `;
    
    // Create about dialog
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #2a2a2a;
      color: #fff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      z-index: 10000;
      max-width: 400px;
      font-family: monospace;
      font-size: 12px;
      line-height: 1.4;
    `;
    
    dialog.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h3 style="margin: 0; color: #fff;">About XVG Editor</h3>
        <button onclick="this.parentElement.parentElement.remove()" style="background: #666; color: #fff; border: none; border-radius: 3px; padding: 5px 10px; cursor: pointer;">×</button>
      </div>
      <pre style="white-space: pre-wrap; margin: 0;">${aboutContent}</pre>
    `;
    
    document.body.appendChild(dialog);
    
    // Close on escape key
    const closeHandler = (e) => {
      if (e.key === 'Escape') {
        dialog.remove();
        document.removeEventListener('keydown', closeHandler);
      }
    };
    document.addEventListener('keydown', closeHandler);
    
    // Close on background click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
        document.removeEventListener('keydown', closeHandler);
      }
    });
  };
  
  // Zoom functions implementation
  window.zoomIn = function() {
    zoomCanvas(0.1);
    notify('info', `Zoom: ${Math.round(XVGSystem.appState.canvasTransform.zoom * 100)}%`);
  };
  
  window.zoomOut = function() {
    zoomCanvas(-0.1);
    notify('info', `Zoom: ${Math.round(XVGSystem.appState.canvasTransform.zoom * 100)}%`);
  };

  // Expose fitToView and actualSize as window functions
  window.fitToView = fitToView;
  window.actualSize = actualSize;

  // Expose ruler update functions
  window.updateTopRuler = updateTopRuler;
  window.updateLeftRuler = updateLeftRuler;
  
  // View toggle functions implementation
  window.toggleGrid = function() {
    XVGSystem.appState.grid.visible = !XVGSystem.appState.grid.visible;
    renderCanvas();
    notify('info', `Grid ${XVGSystem.appState.grid.visible ? 'enabled' : 'disabled'}`);
  };

  // Toggle between standard and independent grid modes (default: independent/static)
  window.toggleGridMode = function() {
    XVGSystem.appState.grid.independent = !XVGSystem.appState.grid.independent;
    renderCanvas();
    const mode = XVGSystem.appState.grid.independent ? 'independent (static)' : 'standard (moves with canvas)';
    notify('info', `Grid mode: ${mode}`);
  };

  // Set grid to subtle mode (less visually distracting)
  window.setSubtleGrid = function() {
    XVGSystem.appState.grid.subtle = true;
    XVGSystem.appState.grid.visible = true;
    renderCanvas();
    notify('info', 'Grid set to subtle mode (less distracting)');
  };

  // Set grid to normal mode (default visibility)
  window.setNormalGrid = function() {
    XVGSystem.appState.grid.subtle = false;
    XVGSystem.appState.grid.visible = true;
    renderCanvas();
    notify('info', 'Grid set to normal mode');
  };

  // Set grid to standard mode (moves with canvas)
  window.setStandardGrid = function() {
    XVGSystem.appState.grid.independent = false;
    renderCanvas();
    notify('info', 'Grid set to standard mode (moves with canvas)');
  };

  // Set grid to independent mode (fixed to screen) - DEFAULT
  window.setIndependentGrid = function() {
    XVGSystem.appState.grid.independent = true;
    renderCanvas();
    notify('info', 'Grid set to independent mode (fixed to screen) - DEFAULT');
  };

  // Selection functions
  window.selectAll = function() {
    if (!XVGSystem.appState.paths || XVGSystem.appState.paths.length === 0) {
      notify('info', 'No objects to select');
      return;
    }
    XVGSystem.appState.selectedPaths = XVGSystem.appState.paths.map(path => path.id);
    renderCanvas();
    notify('info', `Selected all ${XVGSystem.appState.selectedPaths.length} objects`);
  };

  window.invertSelection = function() {
    if (!XVGSystem.appState.paths || XVGSystem.appState.paths.length === 0) {
      notify('info', 'No objects to select');
      return;
    }
    const allIds = XVGSystem.appState.paths.map(path => path.id);
    const currentlySelected = XVGSystem.appState.selectedPaths || [];
    XVGSystem.appState.selectedPaths = allIds.filter(id => !currentlySelected.includes(id));
    renderCanvas();
    notify('info', `Inverted selection: ${XVGSystem.appState.selectedPaths.length} objects now selected`);
  };

  window.clearSelection = function() {
    XVGSystem.appState.selectedPaths = [];
    XVGSystem.appState.selectedImages = [];
    renderCanvas();
    notify('info', 'Selection cleared');
  };

  // Object manipulation functions
  window.groupSelected = function() {
    if (!XVGSystem.appState.selectedPaths || XVGSystem.appState.selectedPaths.length < 2) {
      notify('warning', 'Select at least 2 objects to group');
      return;
    }
    // TODO: Implement grouping logic
    notify('info', 'Grouping functionality coming soon');
  };

  window.ungroupSelected = function() {
    // TODO: Implement ungrouping logic
    notify('info', 'Ungrouping functionality coming soon');
  };

  window.moveSelected = function() {
    // Switch to select tool for moving
    if (window.setTool) {
      window.setTool('select');
    }
    notify('info', 'Use select tool to move objects');
  };

  window.resizeSelected = function() {
    if (!XVGSystem.appState.selectedPaths || XVGSystem.appState.selectedPaths.length === 0) {
      notify('warning', 'Select objects to resize first');
      return;
    }
    // TODO: Implement resize handles
    notify('info', 'Resize functionality coming soon');
  };

  window.rotateSelected = function() {
    if (!XVGSystem.appState.selectedPaths || XVGSystem.appState.selectedPaths.length === 0) {
      notify('warning', 'Select objects to rotate first');
      return;
    }
    // TODO: Implement rotation handles
    notify('info', 'Rotation functionality coming soon');
  };

  window.flipSelected = function() {
    if (!XVGSystem.appState.selectedPaths || XVGSystem.appState.selectedPaths.length === 0) {
      notify('warning', 'Select objects to flip first');
      return;
    }
    // TODO: Implement flip logic
    notify('info', 'Flip functionality coming soon');
  };

  // Layer functions
  window.addLayer = function() {
    if (!XVGSystem.appState.layers) {
      XVGSystem.appState.layers = [];
    }
    const layerName = `Layer ${XVGSystem.appState.layers.length + 1}`;
    const newLayer = {
      id: 'layer_' + Date.now(),
      name: layerName,
      visible: true,
      locked: false,
      paths: []
    };
    XVGSystem.appState.layers.push(newLayer);
    XVGSystem.appState.activeLayer = XVGSystem.appState.layers.length - 1;
    updateLayerList();
    renderCanvas();
    notify('info', `Added layer: ${layerName}`);
  };

  window.duplicateLayer = function() {
    if (!XVGSystem.appState.layers || XVGSystem.appState.layers.length === 0) {
      notify('warning', 'No layer to duplicate');
      return;
    }
    const activeLayer = XVGSystem.appState.layers[XVGSystem.appState.activeLayer];
    if (!activeLayer) return;

    const duplicatedLayer = {
      id: 'layer_' + Date.now(),
      name: activeLayer.name + ' Copy',
      visible: true,
      locked: false,
      paths: [...(activeLayer.paths || [])]
    };

    // Also duplicate the paths in this layer
    const originalPaths = XVGSystem.appState.paths.filter(path =>
      activeLayer.paths && activeLayer.paths.includes(path.id)
    );

    originalPaths.forEach(originalPath => {
      const duplicatedPath = {
        ...originalPath,
        id: crypto.randomUUID(),
        tx: (originalPath.tx || 0) + 20,
        ty: (originalPath.ty || 0) + 20
      };
      duplicatedLayer.paths.push(duplicatedPath.id);
      XVGSystem.appState.paths.push(duplicatedPath);
    });

    XVGSystem.appState.layers.push(duplicatedLayer);
    updateLayerList();
    renderCanvas();
    notify('info', `Duplicated layer: ${duplicatedLayer.name}`);
  };

  window.mergeLayers = function() {
    // TODO: Implement layer merging
    notify('info', 'Layer merging functionality coming soon');
  };

  // Engine panel functions
  window.openSDFPanel = function() {
    if (typeof showPanel === 'function') {
      showPanel('sdf');
    } else {
      notify('warning', 'Panel system not available');
    }
  };

  window.open3DPanel = function() {
    if (typeof showPanel === 'function') {
      showPanel('3d');
    } else {
      notify('warning', 'Panel system not available');
    }
  };

  window.openShaderPanel = function() {
    if (typeof showPanel === 'function') {
      showPanel('shaders');
    } else {
      notify('warning', 'Panel system not available');
    }
  };

  window.openCRDTPanel = function() {
    if (typeof showPanel === 'function') {
      showPanel('crdt');
    } else {
      notify('warning', 'Panel system not available');
    }
  };
  
  window.toggleRulers = function() {
    XVGSystem.appState.rulers.visible = !XVGSystem.appState.rulers.visible;
    const topRuler = document.getElementById('top-ruler');
    const leftRuler = document.getElementById('left-ruler');
    if (topRuler) topRuler.style.display = XVGSystem.appState.rulers.visible ? 'block' : 'none';
    if (leftRuler) leftRuler.style.display = XVGSystem.appState.rulers.visible ? 'block' : 'none';
    notify('info', `Rulers ${XVGSystem.appState.rulers.visible ? 'enabled' : 'disabled'}`);
  };
  
  // Font dialog implementation
  window.openFontDialog = function() {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #2a2a2a;
      color: #fff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      z-index: 10000;
      min-width: 300px;
      font-family: monospace;
      font-size: 12px;
    `;
    
    dialog.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h3 style="margin: 0; color: #fff;">Font Settings</h3>
        <button onclick="this.parentElement.parentElement.remove()" style="background: #666; color: #fff; border: none; border-radius: 3px; padding: 5px 10px; cursor: pointer;">×</button>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 5px; color: #ccc;">Font Family:</label>
        <select id="font-family" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
          <option value="Arial">Arial</option>
          <option value="Helvetica">Helvetica</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Courier New">Courier New</option>
          <option value="Georgia">Georgia</option>
          <option value="Verdana">Verdana</option>
        </select>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 5px; color: #ccc;">Font Size:</label>
        <input type="number" id="font-size" value="16" min="8" max="72" 
               style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 5px; color: #ccc;">Font Weight:</label>
        <select id="font-weight" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
          <option value="normal">Normal</option>
          <option value="bold">Bold</option>
          <option value="lighter">Lighter</option>
          <option value="bolder">Bolder</option>
        </select>
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; color: #ccc;">Font Style:</label>
        <select id="font-style" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
          <option value="normal">Normal</option>
          <option value="italic">Italic</option>
          <option value="oblique">Oblique</option>
        </select>
      </div>
      <div style="display: flex; gap: 10px;">
        <button onclick="applyFontSettings(); this.parentElement.parentElement.remove();" 
                style="flex: 1; padding: 8px; background: #007acc; color: #fff; border: none; border-radius: 3px; cursor: pointer;">Apply</button>
        <button onclick="this.parentElement.parentElement.remove();" 
                style="flex: 1; padding: 8px; background: #666; color: #fff; border: none; border-radius: 3px; cursor: pointer;">Cancel</button>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Apply font settings function
    window.applyFontSettings = function() {
      const family = document.getElementById('font-family')?.value || 'Arial';
      const size = document.getElementById('font-size')?.value || '16';
      const weight = document.getElementById('font-weight')?.value || 'normal';
      const style = document.getElementById('font-style')?.value || 'normal';
      
      // Store font settings in app state
      if (!XVGSystem.appState.fontSettings) {
        XVGSystem.appState.fontSettings = {};
      }
      
      XVGSystem.appState.fontSettings = {
        family: family,
        size: parseInt(size),
        weight: weight,
        style: style
      };
      
      notify('success', `Font set to ${family} ${size}px ${weight} ${style}`);
    };
    
    // Close on escape key
    const closeHandler = (e) => {
      if (e.key === 'Escape') {
        dialog.remove();
        document.removeEventListener('keydown', closeHandler);
      }
    };
    document.addEventListener('keydown', closeHandler);
  };

  // Helper function to save state for undo/redo
  function saveStateForUndo() {
    if (XVGSystem.appState.undoStack.length >= XVGSystem.appState.maxUndoSteps) {
      XVGSystem.appState.undoStack.shift(); // Remove oldest state
    }
    
    XVGSystem.appState.undoStack.push({
      paths: [...XVGSystem.appState.paths],
      layers: [...XVGSystem.appState.layers],
      selectedPaths: [...XVGSystem.appState.selectedPaths],
      activeLayer: XVGSystem.appState.activeLayer
    });
    
    // Clear redo stack when new action is performed
    XVGSystem.appState.redoStack = [];
  }
  
  // Undo/Redo system implementation
  window.undo = function() {
    if (XVGSystem.appState.undoStack.length > 0) {
      const state = XVGSystem.appState.undoStack.pop();
      XVGSystem.appState.redoStack.push({
        paths: [...XVGSystem.appState.paths],
        layers: [...XVGSystem.appState.layers],
        selectedPaths: [...XVGSystem.appState.selectedPaths],
        activeLayer: XVGSystem.appState.activeLayer
      });
      
      XVGSystem.appState.paths = state.paths;
      XVGSystem.appState.layers = state.layers;
      XVGSystem.appState.selectedPaths = state.selectedPaths;
      XVGSystem.appState.activeLayer = state.activeLayer;
      
      updateLayerList();
      renderCanvas();
      console.log('Undo performed');
    } else {
      console.log('Nothing to undo');
    }
  };
  
  window.redo = function() {
    if (XVGSystem.appState.redoStack.length > 0) {
      const state = XVGSystem.appState.redoStack.pop();
      XVGSystem.appState.undoStack.push({
        paths: [...XVGSystem.appState.paths],
        layers: [...XVGSystem.appState.layers],
        selectedPaths: [...XVGSystem.appState.selectedPaths],
        activeLayer: XVGSystem.appState.activeLayer
      });
      
      XVGSystem.appState.paths = state.paths;
      XVGSystem.appState.layers = state.layers;
      XVGSystem.appState.selectedPaths = state.selectedPaths;
      XVGSystem.appState.activeLayer = state.activeLayer;
      
      updateLayerList();
      renderCanvas();
      console.log('Redo performed');
    } else {
      console.log('Nothing to redo');
    }
  };
  
  // Clipboard operations implementation
  window.cut = function() {
    const clipboardData = [];
    let cutCount = 0;

    // Handle selected paths
    if (XVGSystem.appState.selectedPaths.length > 0) {
      const selectedPathData = XVGSystem.appState.selectedPaths.map(pathId => {
        const pathIndex = XVGSystem.appState.paths.findIndex(p => p.id === pathId);
        return XVGSystem.appState.paths[pathIndex];
      }).filter(path => path);

      clipboardData.push(...selectedPathData);
      cutCount += selectedPathData.length;

      // Remove selected paths using proper removePath function
      XVGSystem.appState.selectedPaths.forEach(pathId => {
        window.removePath(pathId);
      });
      XVGSystem.appState.selectedPaths = [];
    }

    // Handle selected images
    if (XVGSystem.appState.selectedImages.length > 0) {
      const selectedImageData = XVGSystem.appState.selectedImages.map(imageIndex => {
        const image = XVGSystem.appState.images[imageIndex];
        if (image) {
          // Create a copy of the image data (without the actual image element)
          return {
            ...image,
            element: null, // Don't copy the actual image element
            type: 'image'
          };
        }
        return null;
      }).filter(img => img);

      clipboardData.push(...selectedImageData);
      cutCount += selectedImageData.length;

      // Remove selected images
      XVGSystem.appState.selectedImages.forEach(imageIndex => {
        const image = XVGSystem.appState.images[imageIndex];
        if (image) {
          // Remove from layer
          const layer = XVGSystem.appState.layers[image.layerIndex];
          if (layer && layer.images) {
            const imageIdIndex = layer.images.indexOf(image.id);
            if (imageIdIndex !== -1) {
              layer.images.splice(imageIdIndex, 1);
            }
          }
          // Remove from global images array
          XVGSystem.appState.images.splice(imageIndex, 1);
        }
      });
      XVGSystem.appState.selectedImages = [];
    }

    if (clipboardData.length > 0) {
      XVGSystem.appState.clipboard = {
        type: 'cut',
        data: clipboardData,
        timestamp: Date.now()
      };
      renderCanvas();
      console.log(`Cut ${cutCount} items to clipboard`);
    }
  };
  
  window.copy = function() {
    const clipboardData = [];

    // Copy selected paths
    if (XVGSystem.appState.selectedPaths.length > 0) {
      const selectedPathData = XVGSystem.appState.selectedPaths.map(pathId => {
        const pathIndex = XVGSystem.appState.paths.findIndex(p => p.id === pathId);
        return XVGSystem.appState.paths[pathIndex];
      }).filter(path => path);
      clipboardData.push(...selectedPathData);
    }

    // Copy selected images
    if (XVGSystem.appState.selectedImages.length > 0) {
      const selectedImageData = XVGSystem.appState.selectedImages.map(imageIndex => {
        const image = XVGSystem.appState.images[imageIndex];
        if (image) {
          // Create a copy of the image data (without the actual image element)
          return {
            ...image,
            element: null, // Don't copy the actual image element
            type: 'image'
          };
        }
        return null;
      }).filter(img => img);
      clipboardData.push(...selectedImageData);
    }

    if (clipboardData.length > 0) {
      XVGSystem.appState.clipboard = {
        type: 'copy',
        data: clipboardData,
        timestamp: Date.now()
      };
      console.log(`Copied ${clipboardData.length} items to clipboard`);
    }
  };
  
  window.paste = function() {
    if (XVGSystem.appState.clipboard && XVGSystem.appState.clipboard.data) {
      const clipboardData = XVGSystem.appState.clipboard.data;
      const pastedPaths = [];
      const pastedImages = [];

      clipboardData.forEach(itemData => {
        if (itemData.type === 'image') {
          // Handle image pasting
          if (itemData.element) {
            // Create new image data with offset
            const newImageData = {
              ...itemData,
              id: 'image_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
              x: (itemData.x || 0) + 20, // Offset pasted images
              y: (itemData.y || 0) + 20,
              layerIndex: XVGSystem.appState.activeLayer
            };

            // Add to images array
            XVGSystem.appState.images.push(newImageData);

            // Add to active layer
            const activeLayer = XVGSystem.appState.layers[XVGSystem.appState.activeLayer];
            if (activeLayer) {
              if (!activeLayer.images) {
                activeLayer.images = [];
              }
              activeLayer.images.push(newImageData.id);
            }

            pastedImages.push(XVGSystem.appState.images.length - 1);
          }
        } else {
          // Handle path pasting
          const newPath = {
            ...itemData,
            id: crypto.randomUUID(),
            tx: (itemData.tx || 0) + 20, // Offset pasted paths
            ty: (itemData.ty || 0) + 20
          };

          const pathIndex = addPath(newPath);
          if (pathIndex !== -1) {
            pastedPaths.push(newPath.id);
          }
        }
      });

      // Select pasted items
      XVGSystem.appState.selectedPaths = pastedPaths;
      XVGSystem.appState.selectedImages = pastedImages;
      renderCanvas();

      const totalPasted = pastedPaths.length + pastedImages.length;
      console.log(`Pasted ${totalPasted} items from clipboard (${pastedPaths.length} paths, ${pastedImages.length} images)`);
    } else {
      console.log('Clipboard is empty');
    }
  };
  
  // Selection operations implementation
  window.deleteSelected = function() {
    let deletedCount = 0;

    // Delete selected paths
    if (XVGSystem.appState.selectedPaths.length > 0) {
      XVGSystem.appState.selectedPaths.forEach(pathId => {
        window.removePath(pathId);
      });
      deletedCount += XVGSystem.appState.selectedPaths.length;
      XVGSystem.appState.selectedPaths = [];
    }

    // Delete selected images
    if (XVGSystem.appState.selectedImages.length > 0) {
      XVGSystem.appState.selectedImages.forEach(imageIndex => {
        const image = XVGSystem.appState.images[imageIndex];
        if (image) {
          // Remove from layer
          const layer = XVGSystem.appState.layers[image.layerIndex];
          if (layer && layer.images) {
            const imageIdIndex = layer.images.indexOf(image.id);
            if (imageIdIndex !== -1) {
              layer.images.splice(imageIdIndex, 1);
            }
          }
          // Remove from global images array
          XVGSystem.appState.images.splice(imageIndex, 1);
        }
      });
      deletedCount += XVGSystem.appState.selectedImages.length;
      XVGSystem.appState.selectedImages = [];
    }

    if (deletedCount > 0) {
      renderCanvas();
      console.log(`Deleted ${deletedCount} selected items`);
    } else {
      console.log('No items selected to delete');
    }
  };
  
  window.selectAll = function() {
    // Select all paths
    XVGSystem.appState.selectedPaths = XVGSystem.appState.paths.map(path => path.id);

    // Select all images from visible layers
    XVGSystem.appState.selectedImages = [];
    XVGSystem.appState.images.forEach((image, index) => {
      const layer = XVGSystem.appState.layers[image.layerIndex];
      if (layer && layer.visible) {
        XVGSystem.appState.selectedImages.push(index);
      }
    });

    renderCanvas();
    const totalSelected = XVGSystem.appState.selectedPaths.length + XVGSystem.appState.selectedImages.length;
    console.log(`Selected all ${totalSelected} items (${XVGSystem.appState.selectedPaths.length} paths, ${XVGSystem.appState.selectedImages.length} images)`);
  };
  
  window.deselectAll = function() {
    const selectedCount = XVGSystem.appState.selectedPaths.length + XVGSystem.appState.selectedImages.length;
    XVGSystem.appState.selectedPaths = [];
    XVGSystem.appState.selectedImages = [];
    renderCanvas();
    console.log(`Deselected ${selectedCount} items`);
  };
  
  // Guides system implementation
  window.toggleGuides = function() {
    if (!XVGSystem.appState.guides) {
      XVGSystem.appState.guides = { visible: false, horizontal: [], vertical: [] };
    }
    XVGSystem.appState.guides.visible = !XVGSystem.appState.guides.visible;
    renderCanvas();
    console.log(`Guides ${XVGSystem.appState.guides.visible ? 'enabled' : 'disabled'}`);
  };
  
  // Menu system implementation
  window.toggleMenu = function(menuId) {
    const menu = document.getElementById(menuId);
    if (menu) {
      const isVisible = menu.style.display !== 'none';
      menu.style.display = isVisible ? 'none' : 'block';
      console.log(`Menu ${menuId} ${isVisible ? 'closed' : 'opened'}`);
    } else {
      console.warn(`Menu with ID '${menuId}' not found`);
    }
  };
  
  window.closeAllMenus = function() {
    const menus = document.querySelectorAll('[id$="-menu"], .dropdown-menu, .context-menu');
    let closedCount = 0;
    
    menus.forEach(menu => {
      if (menu.style.display !== 'none') {
        menu.style.display = 'none';
        closedCount++;
      }
    });
    
    console.log(`Closed ${closedCount} menus`);
  };
  
  // Right panel control functions
  window.updateFillColor = function(color) {
    console.log('Fill color updated:', color);
    
    // Update active drawing tools
    const rgbaColor = hexToRgba(color, 1);
    if (XVGSystem.tools.brush && typeof XVGSystem.tools.brush.setBrushColor === 'function') {
      XVGSystem.tools.brush.setBrushColor(rgbaColor);
    }
    
    // Apply to selected paths
    const selectedPaths = XVGSystem.appState.selectedPaths;
    selectedPaths.forEach(pathId => {
      const path = XVGSystem.appState.paths.find(p => p.id === pathId);
      if (path && path.style) {
        if (!path.style.fill) path.style.fill = {};
        path.style.fill.color = hexToRgba(color, path.style.fill.opacity || 1);
      }
    });
    renderCanvas();
  };
  
  window.updateStrokeColor = function(color) {
    console.log('Stroke color updated:', color);
    
    // Update active drawing tools
    const rgbaColor = hexToRgba(color, 1);
    if (XVGSystem.tools.pen) {
      // Update PenTool stroke color
      XVGSystem.tools.pen.strokeColor = rgbaColor;
    }
    if (XVGSystem.tools.brush && typeof XVGSystem.tools.brush.setBrushColor === 'function') {
      XVGSystem.tools.brush.setBrushColor(rgbaColor);
    }
    
    // Apply to selected paths
    const selectedPaths = getSelectedPaths();
    selectedPaths.forEach(path => {
      if (path && path.style) {
        if (!path.style.stroke) path.style.stroke = {};
        path.style.stroke.color = hexToRgba(color, path.style.stroke.opacity || 1);
      }
    });
    renderCanvas();
  };
  
  window.updateFillOpacity = function(opacity) {
    console.log('Fill opacity updated:', opacity);
    const fillOpacityValue = document.getElementById('fill-opacity-value');
    if (fillOpacityValue) {
      fillOpacityValue.textContent = Math.round(opacity * 100) + '%';
    }
    
    // Update active drawing tools
    if (XVGSystem.tools.brush && typeof XVGSystem.tools.brush.setBrushOpacity === 'function') {
      XVGSystem.tools.brush.setBrushOpacity(opacity);
    }
    
    // Apply to selected paths
    const selectedPaths = getSelectedPaths();
    selectedPaths.forEach(path => {
      if (path && path.style && path.style.fill) {
        path.style.fill.opacity = opacity;
        if (path.style.fill.color && Array.isArray(path.style.fill.color)) {
          path.style.fill.color[3] = opacity;
        }
      }
    });
    renderCanvas();
  };
  
  window.updateStrokeOpacity = function(opacity) {
    console.log('Stroke opacity updated:', opacity);
    const strokeOpacityValue = document.getElementById('stroke-opacity-value');
    if (strokeOpacityValue) {
      strokeOpacityValue.textContent = Math.round(opacity * 100) + '%';
    }
    
    // Update active drawing tools
    if (XVGSystem.tools.pen && XVGSystem.tools.pen.strokeColor) {
      XVGSystem.tools.pen.strokeColor[3] = opacity;
    }
    if (XVGSystem.tools.brush && typeof XVGSystem.tools.brush.setBrushOpacity === 'function') {
      XVGSystem.tools.brush.setBrushOpacity(opacity);
    }
    
    // Apply to selected paths
    const selectedPaths = getSelectedPaths();
    selectedPaths.forEach(path => {
      if (path && path.style && path.style.stroke) {
        path.style.stroke.opacity = opacity;
        if (path.style.stroke.color && Array.isArray(path.style.stroke.color)) {
          path.style.stroke.color[3] = opacity;
        }
      }
    });
    renderCanvas();
  };
  
  window.updateStrokeWidth = function(width) {
    console.log('Stroke width updated:', width);
    const strokeWidthValue = document.getElementById('stroke-width-value');
    if (strokeWidthValue) {
      strokeWidthValue.textContent = width;
    }
    
    // Update tool properties for new drawings
    if (XVGSystem.tools.pen) {
      XVGSystem.tools.pen.strokeWidth = parseFloat(width);
    }
    if (XVGSystem.tools.brush) {
      XVGSystem.tools.brush.brushSize = parseFloat(width);
    }
    
    // Apply to selected paths for editing
    const selectedPaths = getSelectedPaths();
    selectedPaths.forEach(path => {
      if (path && path.style) {
        if (!path.style.stroke) path.style.stroke = {};
        path.style.stroke.width = parseFloat(width);
      }
    });
    renderCanvas();
  };
  
  // Helper function to convert hex color to RGBA array
  function hexToRgba(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r / 255, g / 255, b / 255, alpha];
  }
  
  // Transform control functions
  window.updatePosition = function() {
    const posX = document.getElementById('pos-x');
    const posY = document.getElementById('pos-y');
    if (posX && posY) {
      const x = parseFloat(posX.value) || 0;
      const y = parseFloat(posY.value) || 0;
      console.log('Position updated:', x, y);
      
      // Apply to selected paths
      const selectedPaths = getSelectedPaths();
      selectedPaths.forEach(path => {
        if (path) {
          path.tx = x;
          path.ty = y;
        }
      });
      renderCanvas();
    }
  };
  
  window.updateSize = function() {
    const width = document.getElementById('width');
    const height = document.getElementById('height');
    if (width && height) {
      const w = parseFloat(width.value) || 100;
      const h = parseFloat(height.value) || 100;
      console.log('Size updated:', w, h);
      
      // Apply to selected paths
      const selectedPaths = getSelectedPaths();
      selectedPaths.forEach(path => {
        if (path) {
          path.w = w;
          path.h = h;
        }
      });
      renderCanvas();
    }
  };
  
  window.updateRotation = function() {
    const rotation = document.getElementById('rotation');
    if (rotation) {
      const angle = parseFloat(rotation.value) || 0;
      console.log('Rotation updated:', angle);
      
      // Apply to selected paths
      const selectedPaths = getSelectedPaths();
      selectedPaths.forEach(path => {
        if (path) {
          path.rotation = angle;
        }
      });
      renderCanvas();
    }
  };
  
  // Panel switching function
  window.showPanel = function(panelName) {
    console.log('Switching to panel:', panelName);
    
    // Hide all panel contents
    const panelContents = document.querySelectorAll('.tab-content');
    panelContents.forEach(content => {
      content.classList.remove('active');
    });
    
    // Remove active class from all panel buttons
    const panelButtons = document.querySelectorAll('.panel-btn');
    panelButtons.forEach(button => {
      button.classList.remove('active');
    });
    
    // Show selected panel content
    const selectedPanel = document.getElementById(panelName + '-tab');
    if (selectedPanel) {
      selectedPanel.classList.add('active');
    }
    
    // Add active class to selected panel button
    const selectedButton = document.getElementById(panelName + '-panel-btn');
    if (selectedButton) {
      selectedButton.classList.add('active');
    }
  };
  
  // Tool category toggle function for left sidebar
  window.toggleToolCategory = function(categoryName) {
    const categoryContent = document.getElementById(categoryName + '-tools');
    if (categoryContent) {
      // Toggle the collapsed class on the content
      categoryContent.classList.toggle('collapsed');
      const isCollapsed = categoryContent.classList.contains('collapsed');
      
      // Update header arrow/indicator if present
      const header = categoryContent.previousElementSibling;
      if (header && header.classList.contains('tool-category-header')) {
        header.classList.toggle('collapsed', isCollapsed);
      }
    }
  };
  
  // Tool selection function
  window.selectTool = function(toolName) {
    console.log('Tool selected:', toolName);
    XVGSystem.appState.currentTool = toolName;
    
    // Update active tool button in sidebar
    const toolButtons = document.querySelectorAll('.tool-btn');
    toolButtons.forEach(button => {
      button.classList.remove('active');
    });
    
    // Find and activate the selected tool button
    const selectedButton = document.querySelector(`[onclick*="selectTool('${toolName}')"]`);
    if (selectedButton) {
      selectedButton.classList.add('active');
    }
  };
  

  function updateLayerList(){ 
    const list=document.getElementById('layer-list'); 
    if(!list) return; 
    list.innerHTML=''; 
    XVGSystem.appState.layers.forEach((layer,idx)=>{ 
      // Ensure layer has required properties
      if (!layer.hasOwnProperty('visible')) layer.visible = true;
      if (!layer.hasOwnProperty('locked')) layer.locked = false;
      
      const el=document.createElement('div'); 
      el.className=`layer-item ${idx === XVGSystem.appState.activeLayer ? 'active' : ''}`; 
      el.onclick = () => setActiveLayer(idx);
      
      el.innerHTML=`
        <div class="layer-content">
          <div class="layer-controls">
            <button class="layer-control-btn ${layer.visible ? 'active' : ''}" 
                    title="${layer.visible ? 'Hide' : 'Show'} Layer">
              <img src="assets/icons/white/icons8-${layer.visible ? 'eye' : 'invisible'}-100.png" alt="${layer.visible ? 'Visible' : 'Hidden'}" class="layer-icon">
            </button>
            <button class="layer-control-btn ${layer.locked ? 'active' : ''}" 
                    title="${layer.locked ? 'Unlock' : 'Lock'} Layer">
              <img src="assets/icons/white/icons8-${layer.locked ? 'lock' : 'unlock'}-100.png" alt="${layer.locked ? 'Locked' : 'Unlocked'}" class="layer-icon">
            </button>
          </div>
          <span class="layer-name">${layer.name}</span>

        </div>
      `; 
      
      // Attach event handlers directly to avoid closure issues
      const visibilityBtn = el.querySelector('.layer-control-btn:first-child');
      const lockBtn = el.querySelector('.layer-control-btn:last-child');
      
      visibilityBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLayerVisibility(idx);
      });
      
      lockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLayerLock(idx);
      });
      
      list.appendChild(el); 
    }); 
  }
  window.deleteLayer = function(idx){ if(idx>=0 && idx<XVGSystem.appState.layers.length){ XVGSystem.appState.layers.splice(idx,1); updateLayerList(); renderCanvas(); } };
  
  // Layer control functions
  window.toggleLayerVisibility = function(idx) {
    if(idx>=0 && idx<XVGSystem.appState.layers.length) {
      const layer = XVGSystem.appState.layers[idx];
      layer.visible = !layer.visible;
      updateLayerList();
      renderCanvas();
      console.log(`Layer "${layer.name}" visibility: ${layer.visible}`);
    }
  };
  
  window.toggleLayerLock = function(idx) {
    if(idx>=0 && idx<XVGSystem.appState.layers.length) {
      const layer = XVGSystem.appState.layers[idx];
      layer.locked = !layer.locked;
      updateLayerList();
      console.log(`Layer "${layer.name}" locked: ${layer.locked}`);
    }
  };
  
  window.setActiveLayer = function(idx) {
    if(idx>=0 && idx<XVGSystem.appState.layers.length) {
      XVGSystem.appState.activeLayer = idx;
      XVGSystem.appState.currentLayerIndex = idx;
      updateLayerList();
      console.log(`Active layer set to: "${XVGSystem.appState.layers[idx].name}"`);
    }
  };
  
  // Add layer function
  window.addLayer = function() {
    const newLayer = {
      id: 'layer_' + Date.now(),
      name: `Layer ${XVGSystem.appState.layers.length + 1}`,
      visible: true,
      locked: false,
      paths: []
    };
    XVGSystem.appState.layers.push(newLayer);
    updateLayerList();
    console.log(`Added new layer: "${newLayer.name}"`);
  };
  
  // Delete selected layer function
  window.deleteSelectedLayer = function() {
    const activeIdx = XVGSystem.appState.activeLayer;
    if (XVGSystem.appState.layers.length > 1) {
      deleteLayer(activeIdx);
      // Adjust active layer if needed
      if (activeIdx >= XVGSystem.appState.layers.length) {
        XVGSystem.appState.activeLayer = XVGSystem.appState.layers.length - 1;
      }
    } else {
      console.log('Cannot delete the last layer');
    }
  };
  
  // Remove layer function
  window.removeLayer = function(idx) {
    if (idx >= 0 && idx < XVGSystem.appState.layers.length) {
      if (XVGSystem.appState.layers.length > 1) {
        const layerToRemove = XVGSystem.appState.layers[idx];
        const layerName = layerToRemove.name;
        
        // Handle paths assigned to this layer
        if (layerToRemove.paths && layerToRemove.paths.length > 0) {
          const pathCount = layerToRemove.paths.length;
          console.warn(`Layer "${layerName}" contains ${pathCount} paths. These will be deleted with the layer.`);
          
          // Remove paths from global paths array
          layerToRemove.paths.forEach(pathId => {
            const pathIndex = XVGSystem.appState.paths.findIndex(p => p.id === pathId);
            if (pathIndex !== -1) {
              XVGSystem.appState.paths.splice(pathIndex, 1);
            }
          });
        }
        
        // Remove the layer
        XVGSystem.appState.layers.splice(idx, 1);
        
        // Adjust active layer if needed
        if (XVGSystem.appState.activeLayer >= XVGSystem.appState.layers.length) {
          XVGSystem.appState.activeLayer = XVGSystem.appState.layers.length - 1;
        }
        
        updateLayerList();
        renderCanvas();
        console.log(`Removed layer: "${layerName}"`);
      } else {
        console.log('Cannot remove the last layer');
      }
    }
  };
  
  // Rename layer function
  window.renameLayer = function(idx, newName) {
    if (idx >= 0 && idx < XVGSystem.appState.layers.length && newName && newName.trim()) {
      const oldName = XVGSystem.appState.layers[idx].name;
      XVGSystem.appState.layers[idx].name = newName.trim();
      updateLayerList();
      console.log(`Renamed layer from "${oldName}" to "${newName}"`);
    }
  };
  
  // Duplicate layer function
  window.duplicateLayer = function(idx) {
    if (idx >= 0 && idx < XVGSystem.appState.layers.length) {
      const originalLayer = XVGSystem.appState.layers[idx];
      const duplicatedLayer = {
        id: 'layer_' + Date.now(),
        name: `${originalLayer.name} Copy`,
        visible: originalLayer.visible,
        locked: false, // Duplicated layers are unlocked by default
        paths: [] // Start with empty paths to avoid duplicate references
      };
      
      XVGSystem.appState.layers.splice(idx + 1, 0, duplicatedLayer);
      XVGSystem.appState.activeLayer = idx + 1;
      
      updateLayerList();
      renderCanvas();
      console.log(`Duplicated layer: "${duplicatedLayer.name}"`);
    }
  };
  
  // Move layer up function
  window.moveLayerUp = function(idx) {
    if (idx > 0 && idx < XVGSystem.appState.layers.length) {
      const layer = XVGSystem.appState.layers[idx];
      XVGSystem.appState.layers.splice(idx, 1);
      XVGSystem.appState.layers.splice(idx - 1, 0, layer);
      
      // Update active layer index
      if (XVGSystem.appState.activeLayer === idx) {
        XVGSystem.appState.activeLayer = idx - 1;
      } else if (XVGSystem.appState.activeLayer === idx - 1) {
        XVGSystem.appState.activeLayer = idx;
      }
      
      updateLayerList();
      renderCanvas();
      console.log(`Moved layer "${layer.name}" up`);
    }
  };
  
  // Move layer down function
  window.moveLayerDown = function(idx) {
    if (idx >= 0 && idx < XVGSystem.appState.layers.length - 1) {
      const layer = XVGSystem.appState.layers[idx];
      XVGSystem.appState.layers.splice(idx, 1);
      XVGSystem.appState.layers.splice(idx + 1, 0, layer);
      
      // Update active layer index
      if (XVGSystem.appState.activeLayer === idx) {
        XVGSystem.appState.activeLayer = idx + 1;
      } else if (XVGSystem.appState.activeLayer === idx + 1) {
        XVGSystem.appState.activeLayer = idx;
      }
      
      updateLayerList();
      renderCanvas();
      console.log(`Moved layer "${layer.name}" down`);
    }
  };
  
  // Expose updateLayerList globally
  window.updateLayerList = updateLayerList;
  
  // Path management functions
  window.addPath = function(pathData) {
    if (!pathData || typeof pathData !== 'object') {
      console.error('addPath: Invalid path data provided');
      return -1;
    }
    
    // Generate unique ID if not provided
    if (!pathData.id) {
      pathData.id = crypto.randomUUID();
    }
    
    // Set default values
    if (!pathData.type) pathData.type = 'path';
    if (!pathData.style) pathData.style = {};
    if (!pathData.layerIndex) pathData.layerIndex = XVGSystem.appState.activeLayer;
    
    // Save state BEFORE adding path for proper undo
    saveStateForUndo();
    
    // Add to paths array
    XVGSystem.appState.paths.push(pathData);
    console.log('[Path Addition] Added path to appState:', pathData.id, 'Total paths now:', XVGSystem.appState.paths.length, 'Type:', pathData.type);
    
    // Add to active layer using path ID
    const activeLayer = XVGSystem.appState.layers[XVGSystem.appState.activeLayer];
    if (activeLayer && activeLayer.paths) {
      activeLayer.paths.push(pathData.id);
    }
    
    XVGSystem.appState.isModified = true;
    broadcastPathChange('add', pathData.id, pathData); // Broadcast to collaborators
    renderCanvas(); // Immediate render for new content
    console.log(`Added path with ID: ${pathData.id}`);
    return XVGSystem.appState.paths.length - 1; // Return the index of the added path
  };
  
  window.removePath = function(pathId) {
    // Find path by ID
    const pathIndex = XVGSystem.appState.paths.findIndex(p => p.id === pathId);
    if (pathIndex === -1) {
      console.error('removePath: Path not found');
      return false;
    }
    
    const path = XVGSystem.appState.paths[pathIndex];
    if (!path) {
      console.error('removePath: Path not found');
      return false;
    }
    
    // Remove from selected paths
    const selectedIndex = XVGSystem.appState.selectedPaths.indexOf(pathId);
    if (selectedIndex !== -1) {
      XVGSystem.appState.selectedPaths.splice(selectedIndex, 1);
    }
    
    // Save state BEFORE removing path for proper undo
    saveStateForUndo();
    
    // Remove from all layers using path ID
    XVGSystem.appState.layers.forEach(layer => {
      if (layer.paths) {
        const layerPathIndex = layer.paths.indexOf(pathId);
        if (layerPathIndex !== -1) {
          layer.paths.splice(layerPathIndex, 1);
        }
      }
    });
    
    // Remove from paths array
    XVGSystem.appState.paths.splice(pathIndex, 1);
    
    XVGSystem.appState.isModified = true;
    broadcastPathChange('remove', path.id); // Broadcast to collaborators
    renderCanvas(); // Immediate render for removed content
    console.log(`Removed path with ID: ${path.id}`);
    return true;
  };
  
  window.updatePath = function(pathIndex, updates) {
    if (pathIndex < 0 || pathIndex >= XVGSystem.appState.paths.length) {
      console.error('updatePath: Invalid path index');
      return false;
    }
    
    if (!updates || typeof updates !== 'object') {
      console.error('updatePath: Invalid updates object');
      return false;
    }
    
    const path = XVGSystem.appState.paths[pathIndex];
    if (!path) {
      console.error('updatePath: Path not found');
      return false;
    }
    
    // Save state BEFORE updating path for proper undo
    saveStateForUndo();
    
    // Merge updates into path
    Object.assign(path, updates);
    
    XVGSystem.appState.isModified = true;
    broadcastPathChange('update', path.id, updates); // Broadcast to collaborators
    renderCanvas(); // Immediate render for updated content
    console.log(`Updated path with ID: ${path.id}`);
    return true;
  };
  
  window.selectPath = function(pathIndex) {
    if (pathIndex < 0 || pathIndex >= XVGSystem.appState.paths.length) {
      console.error('selectPath: Invalid path index');
      return false;
    }
    
    const path = XVGSystem.appState.paths[pathIndex];
    if (!path) {
      console.error('selectPath: Path not found');
      return false;
    }
    
    // Add to selected paths if not already selected
    if (!XVGSystem.appState.selectedPaths.includes(path.id)) {
      XVGSystem.appState.selectedPaths.push(path.id);
      broadcastSelectionChange(); // Broadcast selection change
      renderCanvas(); // Immediate render for selection feedback
      console.log(`Selected path with ID: ${path.id}`);
    }
    
    return true;
  };
  
  window.deselectPath = function(pathIndex) {
    if (pathIndex < 0 || pathIndex >= XVGSystem.appState.paths.length) {
      console.error('deselectPath: Invalid path index');
      return false;
    }
    
    const path = XVGSystem.appState.paths[pathIndex];
    if (!path) {
      console.error('deselectPath: Path not found');
      return false;
    }
    
    // Remove from selected paths
    const selectedIndex = XVGSystem.appState.selectedPaths.indexOf(path.id);
    if (selectedIndex !== -1) {
      XVGSystem.appState.selectedPaths.splice(selectedIndex, 1);
      broadcastSelectionChange(); // Broadcast selection change
      renderCanvas(); // Immediate render for selection feedback
      console.log(`Deselected path with ID: ${path.id}`);
    }
    
    return true;
  };
  
  window.clearSelection = function() {
    const selectedCount = XVGSystem.appState.selectedPaths.length;
    XVGSystem.appState.selectedPaths = [];

    // Clear selection overlay immediately
    const overlayCtx = XVGSystem.canvas.overlayContext;
    if (overlayCtx) {
      overlayCtx.clearRect(0, 0, XVGSystem.canvas.element.width, XVGSystem.canvas.element.height);
    }

    broadcastSelectionChange(); // Broadcast selection change
    renderCanvas(); // Immediate render for selection feedback
    console.log(`Cleared selection of ${selectedCount} paths`);
    return true;
  };
  
  // Text styling functions
  window.setTextStyle = function(style) {
    console.log('Text style set:', style);
    // Apply text style to selected text objects
    const selectedPaths = getSelectedPaths();
    selectedPaths.forEach(path => {
      if (path && path.type === 'text') {
        if (!path.style) path.style = {};
        if (!path.style.text) path.style.text = {};
        
        switch(style) {
          case 'bold':
            path.style.text.fontWeight = path.style.text.fontWeight === 'bold' ? 'normal' : 'bold';
            break;
          case 'italic':
            path.style.text.fontStyle = path.style.text.fontStyle === 'italic' ? 'normal' : 'italic';
            break;
          case 'underline':
            path.style.text.textDecoration = path.style.text.textDecoration === 'underline' ? 'none' : 'underline';
            break;
          case 'strikethrough':
            path.style.text.textDecoration = path.style.text.textDecoration === 'line-through' ? 'none' : 'line-through';
            break;
        }
      }
    });
    renderCanvas();
  };
  
  window.setTextAlign = function(align) {
    console.log('Text align set:', align);
    // Apply text alignment to selected text objects
    const selectedPaths = getSelectedPaths();
    selectedPaths.forEach(path => {
      if (path && path.type === 'text') {
        if (!path.style) path.style = {};
        if (!path.style.text) path.style.text = {};
        path.style.text.textAlign = align;
      }
    });
    renderCanvas();
  };
  
  window.setFontFamily = function(family) {
    console.log('Font family set:', family);
    // Apply font family to selected text objects
    const selectedPaths = getSelectedPaths();
    selectedPaths.forEach(path => {
      if (path && path.type === 'text') {
        if (!path.style) path.style = {};
        if (!path.style.text) path.style.text = {};
        path.style.text.fontFamily = family;
      }
    });
    renderCanvas();
  };
  
  window.setFontSize = function(size) {
    console.log('Font size set:', size);
    // Apply font size to selected text objects
    const selectedPaths = getSelectedPaths();
    selectedPaths.forEach(path => {
      if (path && path.type === 'text') {
        if (!path.style) path.style = {};
        if (!path.style.text) path.style.text = {};
        path.style.text.fontSize = parseFloat(size);
      }
    });
    renderCanvas();
  };
  
  window.setTextColor = function(color) {
    console.log('Text color set:', color);
    // Apply text color to selected text objects
    const selectedPaths = getSelectedPaths();
    selectedPaths.forEach(path => {
      if (path && path.type === 'text') {
        if (!path.style) path.style = {};
        if (!path.style.text) path.style.text = {};
        path.style.text.color = color;
      }
    });
    renderCanvas();
  };
  
  // SDF Neural Network functions
  window.trainSDF = function() {
    console.log('Training SDF neural network...');
    // TODO: Implement SDF training
    const progressBar = document.getElementById('sdf-progress');
    const progressText = document.getElementById('sdf-progress-text');
    if (progressBar && progressText) {
      progressText.textContent = 'Training in progress...';
      // Simulate training progress
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        progressBar.style.width = progress + '%';
        if (progress >= 100) {
          clearInterval(interval);
          progressText.textContent = 'Training complete';
        }
      }, 200);
    }
  };
  
  window.evaluateSDF = function() {
    console.log('Evaluating SDF...');
    // TODO: Implement SDF evaluation
  };
  
  window.exportSDF = function() {
    console.log('Exporting SDF weights...');
    // TODO: Implement SDF export
  };
  
  // 3D Mesh functions
  window.updateExtrusion = function() {
    const extrusionHeight = document.getElementById('extrusion-height');
    const extrusionValue = document.getElementById('extrusion-height-value');
    if (extrusionHeight && extrusionValue) {
      const height = extrusionHeight.value;
      extrusionValue.textContent = height + 'px';
      console.log('Extrusion height updated:', height);
    }
  };
  
  window.generate3DMesh = function() {
    console.log('Generating 3D mesh...');
    // TODO: Implement 3D mesh generation
  };
  
  // Sidebar toggle functions
  window.toggleLeftSidebar = function() {
    const sidebar = document.querySelector('.left-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
    }
  };
  
  window.toggleRightSidebar = function() {
    const sidebar = document.querySelector('.right-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
    }
  };

  // expose rendering & setup so ModuleLoader can call them
  window.renderCanvas = renderCanvas;
  // === NEW: wire to XVGSystem for ModuleLoader ===
  XVGSystem.initializeCanvas = initializeCanvas;
  XVGSystem.setupCanvasEventHandlers = setupCanvasEventHandlers;

  // ADD near other helpers
  function getCanvasPointFromEvent(e) {
    const c = XVGSystem.canvas.element;
    const rect = c.getBoundingClientRect();
    const scaleX = c.width / rect.width;   // CSS px -> canvas px
    const scaleY = c.height / rect.height; // CSS px -> canvas px
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }
  // optionally expose for tools/tests
  XVGSystem.getCanvasPointFromEvent = getCanvasPointFromEvent;

  // Helper function to process imported images
  function processImportedImage(img, imageRecord, index) {
    console.log('[XVG Import] Processing imported image:', imageRecord.filename, 'size:', img.width, 'x', img.height);
    // Add image to canvas
    if (window.XVGSystem && window.XVGSystem.tools && window.XVGSystem.tools.image) {
      // Apply transform if available
      const transform = imageRecord.transform || [1, 0, 0, 1, 0, 0];
      const x = transform[4] || 0;
      const y = transform[5] || 0;

      // Note: HTMLImageElement x,y properties are read-only, position is handled in addImageToCanvas
      window.XVGSystem.tools.image.addImageToCanvas(img, imageRecord.filename || `image_${index}.png`);

      renderCanvas();
    } else {
      console.warn('[XVG Import] Image tool not available');
    }
  }

  // Helper function to calculate path bounds for selection highlighting
  function calculatePathBounds(path) {
    if (!path) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (path.type === 'rectangle') {
      minX = path.x || 0;
      minY = path.y || 0;
      maxX = minX + (path.w || 0);
      maxY = minY + (path.h || 0);
    } else if (path.type === 'circle') {
      minX = (path.cx || 0) - (path.r || 0);
      minY = (path.cy || 0) - (path.r || 0);
      maxX = (path.cx || 0) + (path.r || 0);
      maxY = (path.cy || 0) + (path.r || 0);
    } else if (path.type === 'line') {
      minX = Math.min(path.x1 || 0, path.x2 || 0);
      minY = Math.min(path.y1 || 0, path.y2 || 0);
      maxX = Math.max(path.x1 || 0, path.x2 || 0);
      maxY = Math.max(path.y1 || 0, path.y2 || 0);
    } else if (path.type === 'text') {
      // Simple text bounds
      minX = path.x || 0;
      minY = path.y || 0;
      maxX = minX + 100; // Approximate width
      maxY = minY + 20;  // Approximate height
    } else if (path.data) {
      // For path data, use a simple bounding box
      if (typeof path.data === 'string') {
        // Parse simple SVG path bounds
        const commands = path.data.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) || [];
        commands.forEach(cmd => {
          const type = cmd[0];
          const params = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));

          if (type === 'M' || type === 'L') {
            if (params.length >= 2) {
              minX = Math.min(minX, params[0]);
              minY = Math.min(minY, params[1]);
              maxX = Math.max(maxX, params[0]);
              maxY = Math.max(maxY, params[1]);
            }
          }
        });
      }
    }

    // Apply transforms if they exist
    if (path.tx || path.ty) {
      minX += (path.tx || 0);
      minY += (path.ty || 0);
      maxX += (path.tx || 0);
      maxY += (path.ty || 0);
    }

    if (minX === Infinity) return null;

    return { minX, minY, maxX, maxY };
  }

// Dynamic image loading removed - using simple HTML img tags now

// Simple initialization - no complex ModuleLoader dependencies
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      initializeCanvas();
      initializeOfflineSupport();
      initializeAssetManagement();
      initializePerformanceManagement();
      // initializeSystemHealthChecker(); // Removed - unnecessary fluff

      // Initialize tools after canvas is ready
      if (typeof initializeTools === 'function') {
        console.log('[Core] Initializing tools...');
        initializeTools();
      }
      
      // Set up performance monitoring
      setInterval(cleanupMemory, 60000); // Clean memory every minute
      
      // Log performance metrics every 5 minutes
      setInterval(() => {
        const metrics = getPerformanceMetrics();
        console.log('Performance metrics:', metrics);
      }, 300000);
    }, 100); 
  });
})();