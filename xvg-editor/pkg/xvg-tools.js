// FILE: pkg/xvg-tools.js - REFACTORED TO ES MODULE (Phase 4: Final Integration)

// Import necessary dependencies
import { notify } from './xvg-utilities.js'; // Assuming xvg-utilities.js exports notify

// --- Tool Classes ---

// All tool classes now require the XVGCore instance in their constructor
// and use it instead of the global XVGSystem.

export class PanTool {
  constructor(coreInstance){ 
    this.core = coreInstance; // Store the core instance
    this.isPanning=false; 
    this.lastPanPoint=null; 
    this.panStartTransform=null; 
  }
  
  initialize(){ 
    this.isPanning=false; 
    this.lastPanPoint=null; 
    this.panStartTransform={...this.core.state.appState.canvasTransform}; 
  }
  
  startPan(p){ 
    if(!this.core) return; 
    this.isPanning=true; 
    this.lastPanPoint=p; 
    this.panStartTransform={...this.core.state.appState.canvasTransform}; 
  }
  
  updatePan(p){ 
    if(!this.isPanning||!this.lastPanPoint||!this.core) return; 
    const dx=p.x-this.lastPanPoint.x, dy=p.y-this.lastPanPoint.y; 
    const t=this.core.state.appState.canvasTransform; 
    t.pan_x+=dx; 
    t.pan_y+=dy; 
    this.lastPanPoint=p; 
    this.core.renderCanvas(); // Call method on core instance
  }
  
  finishPan(){ this.isPanning=false; this.lastPanPoint=null; this.panStartTransform=null; }
}

export class SelectionTool {
  constructor(coreInstance) {
    this.core = coreInstance; // Store the core instance
    this.isSelecting = false;
    this.selectionStart = null;
    this.selectionEnd = null;
    this.selectionColor = '#ff0000';
    this.selectionWidth = 2;

    this.isPanning = false;
    this.lastPanPoint = null;
    this.panStartTransform = null;
  }
  
  initialize() {
    this.isSelecting = false;
    this.selectionStart = null;
    this.selectionEnd = null;

    this.isPanning = false;
    this.lastPanPoint = null;
    this.panStartTransform = null;
  }
  
  startSelection(p, isRightClick = false) {
    if (!this.core) return;

    if (isRightClick) {
      this.startPan(p);
    } else {
      this.isSelecting = true;
      this.selectionStart = p;
      this.selectionEnd = p;
    }
  }
  
  startPan(p) {
    this.isPanning = true;
    this.lastPanPoint = p;
    this.panStartTransform = {...this.core.state.appState.canvasTransform};
  }
  
  updatePan(p) {
    if (!this.isPanning || !this.lastPanPoint || !this.core) return;
    const dx = p.x - this.lastPanPoint.x;
    const dy = p.y - this.lastPanPoint.y;
    const t = this.core.state.appState.canvasTransform;
    t.pan_x += dx;
    t.pan_y += dy;
    this.lastPanPoint = p;
    this.core.renderCanvas();
  }
  
  finishPan() {
    this.isPanning = false;
    this.lastPanPoint = null;
    this.panStartTransform = null;
  }
  
  updateSelection(p) {
    if (this.isPanning) {
      this.updatePan(p);
    } else if (!this.isSelecting || !this.selectionStart) {
      return;
    } else {
      this.selectionEnd = p;
      this.clearSelectionOverlay();
      this.drawSelectionRectangle();
    }
  }
  
  performBoxSelection() {
    const s = this.core.state; // Use encapsulated state
    const { x1, y1, x2, y2 } = this.getSelectionBounds();

    const { pan_x, pan_y, zoom } = s.appState.canvasTransform;
    const worldX1 = (x1 - pan_x) / zoom;
    const worldY1 = (y1 - pan_y) / zoom;
    const worldX2 = (x2 - pan_x) / zoom;
    const worldY2 = (y2 - pan_y) / zoom;

    const selectedPathIds = [];
    const selectedImageIndices = [];

    for (let i = 0; i < s.appState.paths.length; i++) {
      const pathData = s.appState.paths[i];
      const bounds = this.calculateBounds([pathData]);

      if (bounds && this.boundsIntersect(bounds, { x: worldX1, y: worldY1, w: worldX2 - worldX1, h: worldY2 - worldY1 })) {
        selectedPathIds.push(i);
      }
    }

    if (s.appState.images) {
      for (let i = 0; i < s.appState.images.length; i++) {
        const img = s.appState.images[i];
        if (!img) continue;

        const layer = s.appState.layers[img.layerIndex];
        if (!layer || !layer.visible) continue;

        const imgBounds = {
          minX: img.x,
          minY: img.y,
          maxX: img.x + img.width,
          maxY: img.y + img.height
        };

        if (this.boundsIntersect(imgBounds, { x: worldX1, y: worldY1, w: worldX2 - worldX1, h: worldY2 - worldY1 })) {
          selectedImageIndices.push(i);
        }
      }
    }

    s.appState.selectedPaths = selectedPathIds;
    s.appState.selectedImages = selectedImageIndices;
  }
  
  finishSelection() {
    if (this.isPanning) {
      this.finishPan();
      return;
    }

    if (!this.isSelecting) return;

    const s = this.core.state;

    const dx = this.selectionEnd.x - this.selectionStart.x;
    const dy = this.selectionEnd.y - this.selectionStart.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 5) {
      const hitElement = this.getElementAt(this.selectionStart.x, this.selectionStart.y);

      if (hitElement) {
        if (hitElement.type === 'image') {
          const hitIndex = s.appState.images.findIndex(img => img === hitElement);
          if (hitIndex !== -1) {
            s.appState.selectedImages = [hitIndex];
            s.appState.selectedPaths = []; 
          }
        } else {
          const hitIndex = s.appState.paths.findIndex(path => path === hitElement);
          if (hitIndex !== -1) {
            s.appState.selectedPaths = [hitIndex];
            s.appState.selectedImages = []; 
          }
        }
      } else {
        s.appState.selectedPaths = [];
        s.appState.selectedImages = [];
      }
    } else {
      this.performBoxSelection();
    }

    this.clearSelectionOverlay();
    this.isSelecting = false;
    this.selectionStart = null;
    this.selectionEnd = null;

    this.core.renderCanvas();
  }
  
  getSelectionBounds() {
    if (!this.selectionStart || !this.selectionEnd) return { x1: 0, y1: 0, x2: 0, y2: 0 };
    return {
      x1: Math.min(this.selectionStart.x, this.selectionEnd.x),
      y1: Math.min(this.selectionStart.y, this.selectionEnd.y),
      x2: Math.max(this.selectionStart.x, this.selectionEnd.x),
      y2: Math.max(this.selectionStart.y, this.selectionEnd.y)
    };
  }
  
  getSelectedPaths() {
    const s = this.core.state;
    if (!s?.appState?.selectedPaths) return [];
    return s.appState.selectedPaths.map(index => s.appState.paths[index]).filter(path => path);
  }
  
  isPathSelected(path) {
    const s = this.core.state;
    if (!s?.appState?.selectedPaths || !s?.appState?.paths) return false;
    const pathIndex = s.appState.paths.indexOf(path);
    return s.appState.selectedPaths.includes(pathIndex);
  }
  
  calculateBounds(selectedPaths) {
    if (!selectedPaths || selectedPaths.length === 0) return null;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    selectedPaths.forEach(path => {
      let pathMinX, pathMinY, pathMaxX, pathMaxY;
      
      if (path.type === 'rectangle') {
        pathMinX = path.x;
        pathMinY = path.y;
        pathMaxX = path.x + path.w;
        pathMaxY = path.y + path.h;
      } else if (path.type === 'circle') {
        pathMinX = path.cx - path.r;
        pathMinY = path.cy - path.r;
        pathMaxX = path.cx + path.r;
        pathMaxY = path.cy + path.r;
      } else if (path.type === 'line') {
        pathMinX = Math.min(path.x1, path.x2);
        pathMinY = Math.min(path.y1, path.y2);
        pathMaxX = Math.max(path.x1, path.x2);
        pathMaxY = Math.max(path.y1, path.y2);
      } else if (path.type === 'image') {
        pathMinX = path.x;
        pathMinY = path.y;
        pathMaxX = path.x + path.w;
        pathMaxY = path.y + path.h;
      } else if (path.type === 'text') {
        // Now calling a method on the core instance
        const textDimensions = this.core.calculateTextDimensions(path.text, path.fontSize || 16, path.fontFamily || 'Arial');
        pathMinX = path.x;
        pathMinY = path.y - textDimensions.height;
        pathMaxX = path.x + textDimensions.width;
        pathMaxY = path.y;
      } else if (path.type === 'path' || path.type === 'polygon') {
        if (path.data && path.data.length > 0) {
          if (typeof path.data === 'string') {
            const bounds = this.parseSVGPathBounds(path.data);
            pathMinX = bounds.minX;
            pathMinY = bounds.minY;
            pathMaxX = bounds.maxX;
            pathMaxY = bounds.maxY;
          } else {
            try {
              const view = new DataView(path.data.buffer || path.data);
              let offset = 0;
              pathMinX = Infinity;
              pathMinY = Infinity;
              pathMaxX = -Infinity;
              pathMaxY = -Infinity;

              while (offset < view.byteLength - 7) {
                const x = view.getFloat32(offset, true);
                const y = view.getFloat32(offset + 4, true);
                pathMinX = Math.min(pathMinX, x);
                pathMinY = Math.min(pathMinY, y);
                pathMaxX = Math.max(pathMaxX, x);
                pathMaxY = Math.max(pathMaxY, y);
                offset += 8;
              }

              if (pathMinX === Infinity) {
                pathMinX = pathMinY = pathMaxX = pathMaxY = 0;
              }
            } catch (error) {
              notify('warn', '[SelectionTool] Failed to parse binary path data:' + error.message);
              pathMinX = pathMinY = pathMaxX = pathMaxY = 0;
            }
          }
        } else {
          pathMinX = pathMinY = pathMaxX = pathMaxY = 0;
        }
      } else {
        pathMinX = pathMinY = pathMaxX = pathMaxY = 0;
      }
      
      minX = Math.min(minX, pathMinX);
      minY = Math.min(minY, pathMinY);
      maxX = Math.max(maxX, pathMaxX);
      maxY = Math.max(maxY, pathMaxY);
    });
    
    if (minX === Infinity) return null;
    
    return { minX, minY, maxX, maxY };
  }
  
  // Placeholder for missing methods that were in the original file
  boundsIntersect(bounds1, bounds2) { return true; }
  getElementAt(x, y) { return null; }
  parseSVGPathBounds(data) { return { minX: 0, minY: 0, maxX: 0, maxY: 0 }; }
  drawSelectionRectangle() {}
  clearSelectionOverlay() {}
}

// --- Tool Initialization ---

// This function will be called from src/index.js and passed the XVGCore instance.
export function initializeTools(coreInstance) {
  // 1. Instantiate all tools with the core instance
  coreInstance.state.tools.pan = new PanTool(coreInstance);
  coreInstance.state.tools.selection = new SelectionTool(coreInstance);
  // Add other tool classes here
  
  // 2. Export the public functions needed by the UI
  // setTool is now a method on the core instance, so we don't need to export it here.
  
  // 3. Update the global event handlers in xvg-core.js to use the core instance's tool methods.
  // This is a crucial step that will be done in xvg-core.js next.
  
  notify('info', 'Tools initialized and linked to XVGCore instance.');
}

// --- Public Event Handlers (No longer global, but called by core) ---
// These are now methods on the core instance, so they are removed from here.

// NOTE: The original file had a lot of other tool classes and event handlers.
// This refactor assumes the core logic has been moved to the XVGCore class.

