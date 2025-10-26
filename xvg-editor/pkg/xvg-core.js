// FILE: xvg-core.js - REFACTORED TO ES MODULE (Phase 4: Final Tool Integration)

'use strict';

// Import refactored utilities
import { XVGUtils } from './xvg-utilities.js'; 

// --- State and Core Class ---

export class XVGCore {
  constructor() {
    this.state = {
      initialized: false,
      modulesReady: { utilities: true, core: false, tools: false }, 
      canvas: { element: null, context: null, overlay: null, overlayContext: null, width: 2000, height: 1500, ready: false },
      appState: {
        canvas: { width: 2000, height: 1500, backgroundColor: 'transparent' },
        canvasTransform: { pan_x: 0, pan_y: 0, zoom: 1, minZoom: 0.05, maxZoom: 8 },
        grid: { visible: true, majorSpacing: 100, minorSpacing: 20, majorLineColor: '#000000', minorLineColor: '#303030', majorLineWidth: 1.5, minorLineWidth: 1, independent: true, subtle: false },
        rulers: { visible: true, font: '11px system-ui, sans-serif', color: '#cccccc', tickColor: '#999999', textColor: '#cccccc', lineColor: '#404040', background: '#2a2a2a', tickMajor: 10, tickMinor: 5, rulerSize: 30 },
        selectedPaths: [], selectedImages: [], paths: [], images: [], layers: [], activeLayer: 0, currentLayerIndex: 0,
        currentTool: 'select', undoStack: [], redoStack: [], maxUndoSteps: 50, isModified: false, clipboard: null, mouse: null,
        currentFilename: null
      },
      tools: { pan: null, selection: null, pen: null, ready: false },
      eventHandlers: { mouseDown: null, mouseMove: null, mouseUp: null, mouseLeave: null, wheel: null, keyDown: null }
    };
    
    // Expose the state for now, but should be accessed via getters/setters later
    this.XVGSystem = this.state;
  }

  // --- Public API Functions ---

  initializeCanvas() {
    const canvas = document.getElementById('main-canvas');
    const overlay = document.getElementById('selection-overlay');
    if (!canvas || !overlay) return false;

    const ctx = canvas.getContext('2d');
    const overlayCtx = overlay.getContext('2d');
    if (!ctx || !overlayCtx) return false;

    this.state.canvas.element = canvas;
    this.state.canvas.context = ctx;
    this.state.canvas.overlay = overlay;
    this.state.canvas.overlayContext = overlayCtx;

    canvas.width = this.state.appState.canvas.width;
    canvas.height = this.state.appState.canvas.height;
    overlay.width = this.state.appState.canvas.width;
    overlay.height = this.state.appState.canvas.height;

    // ensure at least one layer
    if (this.state.appState.layers.length === 0) {
      this.state.appState.layers.push({ id: 'layer_1_' + Date.now(), name: 'Layer 1', visible: true, locked: false, paths: [] });
    }

    this.setupCanvasEventHandlers(); // Now a method on the class
    this.renderCanvas(); // Now a method on the class
    this.updateLayerList(); // Now a method on the class

    // set default tool visibly (after tools are initialized)
    setTimeout(() => {
      // The global window.setTool is now replaced by the instance method
      this.setTool('select'); 
      
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
    if (this.state.appState.layers.length === 0) {
      this.state.appState.layers.push({
        id: 'layer_default_' + Date.now(),
        name: 'Layer 1',
        visible: true,
        locked: false,
        paths: []
      });
    }
    
    // Update layer list UI
    setTimeout(() => {
      this.updateLayerList();
    }, 100);
    
    this.state.canvas.ready = true;
    this.state.initialized = true;
    return true;
  }
  
  setTool(toolName) {
    const s = this.state;
    if (!s.tools[toolName]) {
      // Assuming notify is a method on the core or imported utility
      console.error(`Tool "${toolName}" not found.`);
      return;
    }
    s.appState.currentTool = toolName;
    s.tools[toolName].initialize && s.tools[toolName].initialize();
    console.log(`Tool switched to: ${toolName}`);
  }

  // --- Internal Methods (Replacing the original internal functions) ---

  setupCanvasEventHandlers() {
    const canvas = this.state.canvas.element;
    if (!canvas) return;

    // Handlers now call methods on the class instance, eliminating global tool handlers
    canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
    canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }
  
  handleMouseDown(e) {
    const p = this.getCanvasPointFromEvent(e);
    const toolInstance = this.state.tools[this.state.appState.currentTool];
    toolInstance && toolInstance.startSelection && toolInstance.startSelection(p, e.button === 2);
  }
  
  handleMouseMove(e) {
    const p = this.getCanvasPointFromEvent(e);
    const toolInstance = this.state.tools[this.state.appState.currentTool];
    toolInstance && toolInstance.updateSelection && toolInstance.updateSelection(p);
  }
  
  handleMouseUp(e) {
    const p = this.getCanvasPointFromEvent(e);
    const toolInstance = this.state.tools[this.state.appState.currentTool];
    toolInstance && toolInstance.finishSelection && toolInstance.finishSelection(p);
  }
  
  handleMouseLeave(e) {
    const toolInstance = this.state.tools[this.state.appState.currentTool];
    toolInstance && toolInstance.finishSelection && toolInstance.finishSelection({x:0, y:0});
  }

  handleWheel(e){
    e.preventDefault();
    const d=e.deltaY, zf=0.1;
    if (e.ctrlKey){ this.zoomCanvas(d>0?-zf:zf); } else if (e.shiftKey){ this.panCanvas(d,0); } else { this.panCanvas(0,d); }
  }

  handleContextMenu(e) {
    e.preventDefault();
  }

  handleKeyDown(e){
    if (e.ctrlKey||e.metaKey){
      if (e.key==='='||e.key==='+'){ e.preventDefault(); this.zoomCanvas(0.2);}
      else if (e.key==='-'){ e.preventDefault(); this.zoomCanvas(-0.2);}
      else if (e.key==='0'){ e.preventDefault(); this.fitToView(); }
      else if (e.key==='1'){ e.preventDefault(); this.actualSize(); }
      else if (e.key==='z'){ e.preventDefault(); this.undo(); }
      else if (e.key==='y'){ e.preventDefault(); this.redo(); }
    }
    // Tool shortcuts
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        this.setTool('brush');
      }
      else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        this.setTool('bgremover');
      }
      else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        this.setTool('rectangle');
      }
    }
    if (e.key==='Home'){ e.preventDefault(); this.fitToView(); }
    if (e.key==='End'){ e.preventDefault(); this.actualSize(); }
  }

  // --- Core Logic Methods (Placeholders for the rest of the 5000+ lines) ---
  renderCanvas(){
    console.log('[RENDER] ===== RENDER CANVAS STARTED (MODULAR) =====');
    const c=this.state.canvas.element, ctx=this.state.canvas.context;
    if(!c||!ctx) { return; }
    
    ctx.clearRect(0,0,c.width,c.height);
    this.drawIndependentGrid(ctx); 
  }
  
  getCanvasPointFromEvent(e) {
    return XVGUtils.toWorld(e.clientX, e.clientY);
  }
  
  zoomCanvas(factor) {
    const t = this.state.appState.canvasTransform;
    t.zoom = XVGUtils.clamp(t.zoom * (1 + factor), t.minZoom, t.maxZoom);
    this.renderCanvas();
  }
  
  panCanvas(dx, dy) {
    const t = this.state.appState.canvasTransform;
    t.pan_x += dx;
    t.pan_y += dy;
    this.renderCanvas();
  }
  
  updateLayerList() {
    console.log('Layer list updated (placeholder)');
  }
  
  fitToView() {
    console.log('Fit to View (placeholder)');
  }
  
  actualSize() {
    console.log('Actual Size (placeholder)');
  }
  
  undo() {
    console.log('Undo (placeholder)');
  }
  
  redo() {
    console.log('Redo (placeholder)');
  }
  
  drawIndependentGrid(ctx) {
    console.log('Draw Independent Grid (placeholder)');
  }
  
  calculateTextDimensions(text, fontSize, fontFamily) {
    // Placeholder for calculateTextDimensions used by SelectionTool
    return { width: 100, height: 20 };
  }
}

// --- Standalone Exports ---

// The original convertToPathStyle function is kept as a standalone export
export function convertToPathStyle(cssStyle) {
  // ... (original implementation from lines 246-344 of the old file)
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

// Export the class and the standalone functions
console.log('✅ xvg-core refactored to ES Module (Phase 4: Final Tool Integration)');

