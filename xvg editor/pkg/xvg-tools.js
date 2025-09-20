/* =========================
 * FILE: pkg/xvg-tools.js
 * DROP-IN REPLACEMENT (add initialize() to Pan & Selection)
 * ========================= */
// Pan Tool
class PanTool {
  constructor(){ this.isPanning=false; this.lastPanPoint=null; this.panStartTransform=null; }
  // === NEW: satisfy ModuleLoader ===
  initialize(){ this.isPanning=false; this.lastPanPoint=null; this.panStartTransform={...window.XVGSystem.appState.canvasTransform}; }
  startPan(p){ if(!window.XVGSystem) return; this.isPanning=true; this.lastPanPoint=p; this.panStartTransform={...window.XVGSystem.appState.canvasTransform}; }
  updatePan(p){ if(!this.isPanning||!this.lastPanPoint||!window.XVGSystem) return; const dx=p.x-this.lastPanPoint.x, dy=p.y-this.lastPanPoint.y; const t=window.XVGSystem.appState.canvasTransform; t.pan_x+=dx; t.pan_y+=dy; this.lastPanPoint=p; window.renderCanvas && window.renderCanvas(); }
  finishPan(){ this.isPanning=false; this.lastPanPoint=null; this.panStartTransform=null; }
}

// Selection Tool
class SelectionTool {
  constructor() {
    this.isSelecting = false;
    this.selectionStart = null;
    this.selectionEnd = null;
    this.selectionColor = '#ff0000';
    this.selectionWidth = 2;

    // Pan properties for right-click functionality
    this.isPanning = false;
    this.lastPanPoint = null;
    this.panStartTransform = null;
  }
  
  initialize() {
    this.isSelecting = false;
    this.selectionStart = null;
    this.selectionEnd = null;

    // Initialize pan properties
    this.isPanning = false;
    this.lastPanPoint = null;
    this.panStartTransform = null;
  }
  
  startSelection(p, isRightClick = false) {
    if (!window.XVGSystem) return;

    if (isRightClick) {
      // Right-click = grab/pan functionality
      this.startPan(p);
    } else {
      // Left-click = normal selection
      this.isSelecting = true;
      this.selectionStart = p;
      this.selectionEnd = p;
    }
  }
  
  // Pan functionality for right-click
  startPan(p) {
    this.isPanning = true;
    this.lastPanPoint = p;
    this.panStartTransform = {...window.XVGSystem.appState.canvasTransform};
  }
  
  updatePan(p) {
    if (!this.isPanning || !this.lastPanPoint || !window.XVGSystem) return;
    const dx = p.x - this.lastPanPoint.x;
    const dy = p.y - this.lastPanPoint.y;
    const t = window.XVGSystem.appState.canvasTransform;
    t.pan_x += dx;
    t.pan_y += dy;
    this.lastPanPoint = p;
    window.renderCanvas && window.renderCanvas();
  }
  
  finishPan() {
    this.isPanning = false;
    this.lastPanPoint = null;
    this.panStartTransform = null;
  }
  
  updateSelection(p) {
    if (this.isPanning) {
      // Handle right-click panning
      this.updatePan(p);
    } else if (!this.isSelecting || !this.selectionStart) {
      return;
    } else {
      // Handle left-click selection
      this.selectionEnd = p;
      this.clearSelectionOverlay();
      this.drawSelectionRectangle();
    }
  }
  
  performBoxSelection() {
    const s = window.XVGSystem;
    const { x1, y1, x2, y2 } = this.getSelectionBounds();

    // Convert selection bounds from screen to world coordinates
    const { pan_x, pan_y, zoom } = s.appState.canvasTransform;
    const worldX1 = (x1 - pan_x) / zoom;
    const worldY1 = (y1 - pan_y) / zoom;
    const worldX2 = (x2 - pan_x) / zoom;
    const worldY2 = (y2 - pan_y) / zoom;

    const selectedPathIds = [];
    const selectedImageIndices = [];

    // Check paths
    for (let i = 0; i < s.appState.paths.length; i++) {
      const pathData = s.appState.paths[i];
      const bounds = this.calculateBounds([pathData]);

      if (bounds && this.boundsIntersect(bounds, { x: worldX1, y: worldY1, w: worldX2 - worldX1, h: worldY2 - worldY1 })) {
        selectedPathIds.push(i);
      }
    }

    // Check images
    if (s.appState.images) {
      for (let i = 0; i < s.appState.images.length; i++) {
        const img = s.appState.images[i];
        if (!img) continue;

        // Check if image is on a visible layer
        const layer = s.appState.layers[img.layerIndex];
        if (!layer || !layer.visible) continue;

        // Check if image bounds intersect with selection box
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
      // Finish right-click panning
      this.finishPan();
      return;
    }

    if (!this.isSelecting) return;

    const s = window.XVGSystem;

    // Check if this was a click or drag
    const dx = this.selectionEnd.x - this.selectionStart.x;
    const dy = this.selectionEnd.y - this.selectionStart.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 5) {
      // Single click - select individual object
      const hitElement = this.getElementAt(this.selectionStart.x, this.selectionStart.y);

      if (hitElement) {
        if (hitElement.type === 'image') {
          // Selected an image
          const hitIndex = s.appState.images.findIndex(img => img === hitElement);
          if (hitIndex !== -1) {
            s.appState.selectedImages = [hitIndex];
            s.appState.selectedPaths = []; // Clear path selection
          }
        } else {
          // Selected a path
          const hitIndex = s.appState.paths.findIndex(path => path === hitElement);
          if (hitIndex !== -1) {
            s.appState.selectedPaths = [hitIndex];
            s.appState.selectedImages = []; // Clear image selection
          }
        }
      } else {
        // Clicked on empty space - clear selection
        s.appState.selectedPaths = [];
        s.appState.selectedImages = [];
      }
    } else {
      // Drag - perform box selection
      this.performBoxSelection();
    }

    this.clearSelectionOverlay();
    this.isSelecting = false;
    this.selectionStart = null;
    this.selectionEnd = null;

    window.renderCanvas && window.renderCanvas();
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
    const s = window.XVGSystem;
    if (!s?.appState?.selectedPaths) return [];
    return s.appState.selectedPaths.map(index => s.appState.paths[index]).filter(path => path);
  }
  
  isPathSelected(path) {
    const s = window.XVGSystem;
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
        const textDimensions = window.XVGSystem.calculateTextDimensions(path.text, path.fontSize || 16, path.fontFamily || 'Arial');
        pathMinX = path.x;
        pathMinY = path.y - textDimensions.height;
        pathMaxX = path.x + textDimensions.width;
        pathMaxY = path.y;
      } else if (path.type === 'path' || path.type === 'polygon') {
        // Handle both SVG string data (from drawing tools) and binary data (from imports)
        if (path.data && path.data.length > 0) {
          if (typeof path.data === 'string') {
            // Parse SVG path string
            const bounds = this.parseSVGPathBounds(path.data);
            pathMinX = bounds.minX;
            pathMinY = bounds.minY;
            pathMaxX = bounds.maxX;
            pathMaxY = bounds.maxY;
          } else {
            // Parse binary data (ArrayBuffer/Uint8Array from imports)
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
              console.warn('[SelectionTool] Failed to parse binary path data:', error);
              pathMinX = pathMinY = pathMaxX = pathMaxY = 0;
            }
          }
        } else {
          pathMinX = pathMinY = pathMaxX = pathMaxY = 0;
        }
      } else {
        pathMinX = pathMinY = pathMaxX = pathMaxY = 0;
      }
      
      // Apply transforms
      if (path.tx || path.ty) {
        pathMinX += (path.tx || 0);
        pathMinY += (path.ty || 0);
        pathMaxX += (path.tx || 0);
        pathMaxY += (path.ty || 0);
      }
      
      minX = Math.min(minX, pathMinX);
      minY = Math.min(minY, pathMinY);
      maxX = Math.max(maxX, pathMaxX);
      maxY = Math.max(maxY, pathMaxY);
    });
    
    if (minX === Infinity) return null;
    
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  /**
   * Parse SVG path string and calculate bounding box
   */
  parseSVGPathBounds(pathData) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // Simple SVG path parser - handles basic M, L, C, Z commands
    const commands = pathData.match(/[MLCZ][^MLCZ]*/gi) || [];

    let currentX = 0;
    let currentY = 0;
    let startX = 0;
    let startY = 0;

    commands.forEach(command => {
      const type = command[0];
      const params = command.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));

      switch (type) {
        case 'M':
          if (params.length >= 2) {
            currentX = params[0];
            currentY = params[1];
            startX = currentX;
            startY = currentY;
            minX = Math.min(minX, currentX);
            minY = Math.min(minY, currentY);
            maxX = Math.max(maxX, currentX);
            maxY = Math.max(maxY, currentY);
          }
          break;
        case 'L':
          if (params.length >= 2) {
            currentX = params[0];
            currentY = params[1];
            minX = Math.min(minX, currentX);
            minY = Math.min(minY, currentY);
            maxX = Math.max(maxX, currentX);
            maxY = Math.max(maxY, currentY);
          }
          break;
        case 'C':
          // For curves, we use control points and end point
          if (params.length >= 6) {
            // Control point 1
            minX = Math.min(minX, params[0], params[2], params[4]);
            minY = Math.min(minY, params[1], params[3], params[5]);
            maxX = Math.max(maxX, params[0], params[2], params[4]);
            maxY = Math.max(maxY, params[1], params[3], params[5]);
            currentX = params[4];
            currentY = params[5];
          }
          break;
        case 'Z':
          // Close path - no additional coordinates
          break;
      }
    });

    // If no valid coordinates found, return zero bounds
    if (minX === Infinity) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    return { minX, minY, maxX, maxY };
  }

  boundsIntersect(bounds1, bounds2) {
    // bounds1 is { minX, minY, maxX, maxY } from calculateBounds
    // bounds2 is { x, y, w, h } from selection rectangle
    return !(bounds1.maxX < bounds2.x ||
             bounds1.minX > bounds2.x + bounds2.w ||
             bounds1.maxY < bounds2.y ||
             bounds1.minY > bounds2.y + bounds2.h);
  }
  clearSelectionOverlay(){
    const oc = window.XVGSystem?.canvas?.overlayContext;
    if(oc){
      oc.clearRect(0, 0, window.XVGSystem.canvas.overlay.width, window.XVGSystem.canvas.overlay.height);
    }
  }
  
  drawSelectionRectangle() {
    const oc = window.XVGSystem?.canvas?.overlayContext;
    if (!oc || !this.selectionStart || !this.selectionEnd) return;

    const x = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const y = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const w = Math.abs(this.selectionEnd.x - this.selectionStart.x);
    const h = Math.abs(this.selectionEnd.y - this.selectionStart.y);

    oc.strokeStyle = this.selectionColor;
    oc.lineWidth = this.selectionWidth;
    oc.setLineDash([5, 5]);
    oc.strokeRect(x, y, w, h);
    oc.setLineDash([]);
  }
  
  getResizeHandleAt(x, y, bounds) {
    if (!bounds) return null;
    
    const { pan_x, pan_y, zoom } = window.XVGSystem.appState.canvasTransform;
    const handleSize = this.calculateDynamicHandleSize(zoom);
    const tolerance = handleSize / 2;
    
    // Convert world bounds to screen coordinates
    const screenBounds = {
      minX: bounds.minX * zoom + pan_x,
      minY: bounds.minY * zoom + pan_y,
      maxX: bounds.maxX * zoom + pan_x,
      maxY: bounds.maxY * zoom + pan_y
    };
    
    // Define handle positions
    const handles = [
      { x: screenBounds.minX, y: screenBounds.minY, type: 'top-left' },
      { x: screenBounds.maxX, y: screenBounds.minY, type: 'top-right' },
      { x: screenBounds.maxX, y: screenBounds.maxY, type: 'bottom-right' },
      { x: screenBounds.minX, y: screenBounds.maxY, type: 'bottom-left' },
      { x: (screenBounds.minX + screenBounds.maxX) / 2, y: screenBounds.minY, type: 'top' },
      { x: screenBounds.maxX, y: (screenBounds.minY + screenBounds.maxY) / 2, type: 'right' },
      { x: (screenBounds.minX + screenBounds.maxX) / 2, y: screenBounds.maxY, type: 'bottom' },
      { x: screenBounds.minX, y: (screenBounds.minY + screenBounds.maxY) / 2, type: 'left' }
    ];
    
    // Check if point is near any handle
    for (const handle of handles) {
      const dx = x - handle.x;
      const dy = y - handle.y;
      if (Math.sqrt(dx * dx + dy * dy) <= tolerance) {
        return handle.type;
      }
    }
    
    return null;
  }
  
  calculateDynamicHandleSize(zoomLevel = 1) {
    const dpiScale = window.devicePixelRatio || 1;
    const dpiAdjustedBase = this.baseHandleSize * Math.min(dpiScale, 2);
    const dynamicSize = dpiAdjustedBase / Math.max(zoomLevel, 0.1);
    const minSize = 6;
    const maxSize = 20;
    return Math.max(minSize, Math.min(maxSize, dynamicSize));
  }
  
  startResize(point, handleType, bounds, selectedPaths) {
    this.isResizing = true;
    this.resizeHandle = handleType;
    this.resizeStartPoint = point;
    this.resizeStartBounds = bounds;
    this.initialSelectedPaths = selectedPaths.map(path => ({ ...path }));
  }
  
  updateResize(point) {
    if (!this.isResizing || !this.resizeStartBounds) return;
    
    const newBounds = this.calculateNewBounds(point, this.resizeHandle, this.resizeStartBounds);
    this.applyResize(newBounds);
    window.renderCanvas && window.renderCanvas();
  }
  
  finishResize() {
    this.isResizing = false;
    this.resizeHandle = null;
    this.resizeStartPoint = null;
    this.resizeStartBounds = null;
    this.initialSelectedPaths = null;
  }
  
  calculateNewBounds(point, handleType, originalBounds) {
    const { pan_x, pan_y, zoom } = window.XVGSystem.appState.canvasTransform;
    const worldPoint = {
      x: (point.x - pan_x) / zoom,
      y: (point.y - pan_y) / zoom
    };
    
    let newBounds = { ...originalBounds };
    
    switch (handleType) {
      case 'top-left':
        newBounds.minX = worldPoint.x;
        newBounds.minY = worldPoint.y;
        break;
      case 'top-right':
        newBounds.maxX = worldPoint.x;
        newBounds.minY = worldPoint.y;
        break;
      case 'bottom-right':
        newBounds.maxX = worldPoint.x;
        newBounds.maxY = worldPoint.y;
        break;
      case 'bottom-left':
        newBounds.minX = worldPoint.x;
        newBounds.maxY = worldPoint.y;
        break;
      case 'top':
        newBounds.minY = worldPoint.y;
        break;
      case 'right':
        newBounds.maxX = worldPoint.x;
        break;
      case 'bottom':
        newBounds.maxY = worldPoint.y;
        break;
      case 'left':
        newBounds.minX = worldPoint.x;
        break;
    }
    
    return newBounds;
  }
  
  applyResize(newBounds) {
    if (!this.initialSelectedPaths || !this.resizeStartBounds) return;
    
    const scaleX = (newBounds.maxX - newBounds.minX) / (this.resizeStartBounds.maxX - this.resizeStartBounds.minX);
    const scaleY = (newBounds.maxY - newBounds.minY) / (this.resizeStartBounds.maxY - this.resizeStartBounds.minY);
    
    const selectedPaths = this.getSelectedPaths();
    
    selectedPaths.forEach((path, index) => {
      const originalPath = this.initialSelectedPaths[index];
      if (!originalPath) return;
      
      if (path.type === 'image') {
        const originalX = (originalPath.x || 0) + (originalPath.tx || 0);
        const originalY = (originalPath.y || 0) + (originalPath.ty || 0);
        
        const relativeX = (originalX - this.resizeStartBounds.minX) * scaleX;
        const relativeY = (originalY - this.resizeStartBounds.minY) * scaleY;
        
        path.tx = newBounds.minX + relativeX - (path.x || 0);
        path.ty = newBounds.minY + relativeY - (path.y || 0);
        path.w = (originalPath.w || 0) * scaleX;
        path.h = (originalPath.h || 0) * scaleY;
      }
    });
  }
  
  startDrag(point) {
    this.isDragging = true;
    this.initialSelectionPos = point;
  }
  
  updateDrag(point) {
    if (!this.isDragging || !this.initialSelectionPos) return;
    
    const dx = point.x - this.initialSelectionPos.x;
    const dy = point.y - this.initialSelectionPos.y;
    
    const selectedPaths = this.getSelectedPaths();
    selectedPaths.forEach(path => {
      this.moveElement(path, dx, dy);
    });
    
    this.initialSelectionPos = point;
    window.renderCanvas && window.renderCanvas();
  }
  
  finishDrag() {
    this.isDragging = false;
    this.initialSelectionPos = null;
  }
  
  // Hit test on screen space using Canvas APIs
  getElementAt(x, y) {
    const s = window.XVGSystem;
    if (!s?.appState?.paths) return null;

    // Convert screen coordinates to world coordinates
    const { pan_x, pan_y, zoom } = s.appState.canvasTransform;
    const worldX = (x - pan_x) / zoom;
    const worldY = (y - pan_y) / zoom;

    // Test paths in reverse order (top to bottom)
    for (let i = s.appState.paths.length - 1; i >= 0; i--) {
      const item = s.appState.paths[i];
      if (!item) continue;

      // Get bounds for this item
      const bounds = this.calculateBounds([item]);
      if (!bounds) continue;

      // Check if the click point is within the item's bounds
      if (worldX >= bounds.minX && worldX <= bounds.maxX &&
          worldY >= bounds.minY && worldY <= bounds.maxY) {
        return item;
      }
    }

    // Test images in reverse order (top to bottom)
    if (s.appState.images) {
      for (let i = s.appState.images.length - 1; i >= 0; i--) {
        const img = s.appState.images[i];
        if (!img) continue;

        // Check if image is on a visible layer
        const layer = s.appState.layers[img.layerIndex];
        if (!layer || !layer.visible) continue;

        // Check if the click point is within the image bounds
        if (worldX >= img.x && worldX <= img.x + img.width &&
            worldY >= img.y && worldY <= img.y + img.height) {
          return img;
        }
      }
    }

    return null;
  }

  moveElement(item, dx, dy) {
    if (!item) return;
    const s = window.XVGSystem;
    const z = s.appState.canvasTransform.zoom;
    item.tx = (item.tx || 0) + dx / z;
    item.ty = (item.ty || 0) + dy / z;
    window.renderCanvas && window.renderCanvas();
  }
  
  render(ctx, transform) {
    const oc = window.XVGSystem?.canvas?.overlayContext;
    if (!oc) return;

    // Always clear overlay first
    this.clearSelectionOverlay();

    // Draw selection box if actively selecting
    if (this.isSelecting && this.selectionStart && this.selectionEnd) {
      this.drawSelectionRectangle();
    }

    // Draw persistent selection rectangle if items are selected
    const selectedCount = window.XVGSystem?.appState?.selectedPaths?.length || 0;
    if (selectedCount > 0 && !this.isSelecting) {
      // Draw a subtle selection indicator
      oc.save();
      oc.strokeStyle = 'rgba(255, 68, 68, 0.3)'; // Red instead of blue
      oc.lineWidth = 1;
      oc.setLineDash([8, 4]);

      // Draw a border around the entire canvas area as a selection indicator
      const canvas = window.XVGSystem?.canvas?.element;
      if (canvas) {
        const margin = 10;
        oc.strokeRect(margin, margin, canvas.width - 2*margin, canvas.height - 2*margin);
      }

      oc.restore();

      // Also draw selection count
      oc.save();
      oc.fillStyle = '#ff4444'; // Red instead of blue
      oc.font = '12px Arial';
      oc.fillText(`${selectedCount} selected`, 20, 30);
      oc.restore();
    }
    
    // Draw resize handles for selected objects
    const selectedPaths = this.getSelectedPaths();
    if (selectedPaths.length > 0) {
      const bounds = this.calculateBounds(selectedPaths);
      if (bounds) {
        this.drawResizeHandles(ctx, bounds, transform);
      }
    }
  }
  
  drawResizeHandles(ctx, bounds, transform) {
    if (!bounds) return;
    
    const { pan_x, pan_y, zoom } = transform || window.XVGSystem.appState.canvasTransform;
    const handleSize = this.calculateDynamicHandleSize(zoom);
    const halfHandle = handleSize / 2;
    
    // Convert world bounds to screen coordinates
    const screenBounds = {
      minX: bounds.minX * zoom + pan_x,
      minY: bounds.minY * zoom + pan_y,
      maxX: bounds.maxX * zoom + pan_x,
      maxY: bounds.maxY * zoom + pan_y
    };
    
    // Define all 8 resize handles
    const handles = [
      { x: screenBounds.minX, y: screenBounds.minY, type: 'top-left' },
      { x: screenBounds.maxX, y: screenBounds.minY, type: 'top-right' },
      { x: screenBounds.maxX, y: screenBounds.maxY, type: 'bottom-right' },
      { x: screenBounds.minX, y: screenBounds.maxY, type: 'bottom-left' },
      { x: (screenBounds.minX + screenBounds.maxX) / 2, y: screenBounds.minY, type: 'top' },
      { x: screenBounds.maxX, y: (screenBounds.minY + screenBounds.maxY) / 2, type: 'right' },
      { x: (screenBounds.minX + screenBounds.maxX) / 2, y: screenBounds.maxY, type: 'bottom' },
      { x: screenBounds.minX, y: (screenBounds.minY + screenBounds.maxY) / 2, type: 'left' }
    ];
    
    ctx.save();
    
    // Draw selection outline
    ctx.strokeStyle = this.selectionColor;
    ctx.lineWidth = this.selectionWidth;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(screenBounds.minX, screenBounds.minY, 
                   screenBounds.maxX - screenBounds.minX, 
                   screenBounds.maxY - screenBounds.minY);
    ctx.setLineDash([]);
    
    // Draw resize handles
    handles.forEach(handle => {
      ctx.fillStyle = this.handleColor;
      ctx.strokeStyle = this.handleBorderColor;
      ctx.lineWidth = 1;
      ctx.fillRect(handle.x - halfHandle, handle.y - halfHandle, handleSize, handleSize);
      ctx.strokeRect(handle.x - halfHandle, handle.y - halfHandle, handleSize, handleSize);
    });
    
    ctx.restore();
  }
}

// Pen Tool
class PenTool {
  constructor(){ this.isDrawing=false; this.currentPath=null; this.points=[]; this.strokeColor=[0,0,0,1]; this.strokeWidth=2; }
  initialize(){ this.isDrawing=false; this.currentPath=null; this.points=[]; this.strokeColor=[0,0,0,1]; this.strokeWidth=2; }
  startDrawing(p){ if(!window.XVGSystem) return; this.isDrawing=true; this.points=[p]; const w=this.screenToWorld(p); this.currentPath={ data:`M ${w.x} ${w.y}`, style:{ fill:null, stroke:{ color:[...this.strokeColor], width:this.strokeWidth, cap: 'Butt', join: 'Miter', dash_array: [] }, opacity: 1.0, blend_mode: 'Normal' } }; }
  updateDrawing(p){ if(!this.isDrawing||!this.currentPath) return; this.points.push(p); const w=this.screenToWorld(p); this.currentPath.data+=` L ${w.x} ${w.y}`; window.renderCanvas && window.renderCanvas(); this.drawCurrentPath(); }
  finishDrawing(){ 
    if(!this.isDrawing||!this.currentPath) return; 
    this.isDrawing=false; 
    this.currentPath.id = crypto.randomUUID(); 
    
    // Use proper addPath function to ensure layer assignment and undo support
    window.addPath(this.currentPath);
    
    this.currentPath=null; 
    this.points=[]; 
    window.renderCanvas && window.renderCanvas(); 
  }
  screenToWorld(p){ const { pan_x, pan_y, zoom } = window.XVGSystem.appState.canvasTransform; return { x:(p.x - pan_x)/zoom, y:(p.y - pan_y)/zoom } }
  drawCurrentPath(){ const ctx=window.XVGSystem?.canvas?.context; if(!ctx||!this.currentPath) return; ctx.save(); const { pan_x, pan_y, zoom }=window.XVGSystem.appState.canvasTransform; ctx.translate(pan_x,pan_y); ctx.scale(zoom,zoom); const path2D=new Path2D(this.currentPath.data); ctx.strokeStyle=`rgba(${this.strokeColor.join(',')})`; ctx.lineWidth=this.currentPath.style.stroke.width; ctx.stroke(path2D); ctx.restore(); }
}

// Image Tool
class ImageTool {
  constructor(){ this.images=[]; }
  initialize(){ this.images=[]; }
  addImageToCanvas(img, filename){
    if(!window.XVGSystem) return;

    // Ensure images array exists
    if (!window.XVGSystem.appState.images) {
      window.XVGSystem.appState.images = [];
    }

    const imageId = 'image_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const activeLayer = window.XVGSystem.appState.activeLayer;
    const activeLayerData = window.XVGSystem.appState.layers[activeLayer];

    const imageData = {
      id: imageId,
      element: img,
      x: 50, // Position away from corner to avoid UI overlap
      y: 50,
      width: img.width,
      height: img.height,
      filename: filename,
      layerIndex: activeLayer,
      type: 'image',
      created: new Date().toISOString(),
      src: img.src || null // Store the data URL if available
    };

    console.log('Storing image:', {
      id: imageId,
      filename: filename,
      dimensions: `${img.width} x ${img.height}`,
      position: `${imageData.x}, ${imageData.y}`,
      layerIndex: activeLayer,
      layerName: activeLayerData ? activeLayerData.name : 'unknown',
      layerVisible: activeLayerData ? activeLayerData.visible : 'N/A',
      imageLoaded: img.complete,
      srcLength: img.src ? img.src.length : 0
    });

    window.XVGSystem.appState.images.push(imageData);

    // Add image to the active layer
    if (activeLayerData) {
      if (!activeLayerData.images) {
        activeLayerData.images = [];
      }
      activeLayerData.images.push(imageId);
      console.log('Added image to layer:', activeLayerData.name, 'total images in layer:', activeLayerData.images.length);
    }

    window.renderCanvas && window.renderCanvas();
    console.log('Image added to canvas:', filename, 'on layer:', activeLayerData ? activeLayerData.name : 'unknown');
  }
}

// Eraser Tool - Working Vector Eraser with SVG Path Manipulation
class EraserTool {
  constructor() {
    this.isErasing = false;
    this.radius = 20; // Default eraser radius in pixels
    this.lastPoint = null;
    this.eraserPath = null; // SVG path for eraser area
    this.visualFeedback = null; // Visual feedback element
  }

  initialize() {
    this.isErasing = false;
    this.radius = 20;
    this.lastPoint = null;
    this.eraserPath = null;
    this.visualFeedback = null;
  }

  startErasing(p) {
    if (!window.XVGSystem) return;
    this.isErasing = true;
    this.lastPoint = this.screenToWorld(p);
    this.createEraserArea(this.lastPoint);
    this.addVisualFeedback(this.lastPoint);
    this.performErasure(this.lastPoint);
  }

  updateErasing(p) {
    if (!this.isErasing || !this.lastPoint) return;
    this.lastPoint = this.screenToWorld(p);
    this.updateEraserArea(this.lastPoint);
    this.updateVisualFeedback(this.lastPoint);
    this.performErasure(this.lastPoint);
  }

  finishErasing() {
    this.isErasing = false;
    this.lastPoint = null;
    this.removeVisualFeedback();
    if (window.markAsModified) window.markAsModified();
  }

  createEraserArea(point) {
    const { pan_x, pan_y, zoom } = window.XVGSystem.appState.canvasTransform;
    const worldX = (point.x - pan_x) / zoom;
    const worldY = (point.y - pan_y) / zoom;
    const worldRadius = this.radius / zoom;

    // Create circular eraser path in SVG format
    this.eraserPath = `M ${worldX - worldRadius},${worldY} ` +
      `a ${worldRadius},${worldRadius} 0 1,0 ${worldRadius * 2},0 ` +
      `a ${worldRadius},${worldRadius} 0 1,0 -${worldRadius * 2},0`;
  }

  updateEraserArea(point) {
    // Update the eraser area for continuous erasing
    this.createEraserArea(point);
  }

  addVisualFeedback(point) {
    if (!this.visualFeedback) {
      const canvas = window.XVGSystem.canvas.element;
      const container = canvas.parentElement;

      this.visualFeedback = document.createElement('div');
      this.visualFeedback.style.position = 'absolute';
      this.visualFeedback.style.pointerEvents = 'none';
      this.visualFeedback.style.zIndex = '9999';
      this.visualFeedback.style.border = '2px dashed #ff0000';
      this.visualFeedback.style.borderRadius = '50%';
      this.visualFeedback.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';

      container.appendChild(this.visualFeedback);
    }
    this.updateVisualFeedback(point);
  }

  updateVisualFeedback(point) {
    if (!this.visualFeedback) return;

    // Get canvas element for proper positioning
    const canvas = window.XVGSystem.canvas.element;
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();

    // The point coordinates are already in world coordinates
    // Convert them to screen coordinates for the visual feedback
    const { pan_x, pan_y, zoom } = window.XVGSystem.appState.canvasTransform;

    // Convert world coordinates to screen coordinates
    const screenX = point.x * zoom + pan_x + canvasRect.left;
    const screenY = point.y * zoom + pan_y + canvasRect.top;
    const screenRadius = this.radius;

    // Position relative to the document
    this.visualFeedback.style.position = 'fixed';
    this.visualFeedback.style.left = `${screenX - screenRadius}px`;
    this.visualFeedback.style.top = `${screenY - screenRadius}px`;
    this.visualFeedback.style.width = `${screenRadius * 2}px`;
    this.visualFeedback.style.height = `${screenRadius * 2}px`;
    this.visualFeedback.style.pointerEvents = 'none';
    this.visualFeedback.style.zIndex = '9999';
  }

  removeVisualFeedback() {
    if (this.visualFeedback && this.visualFeedback.parentElement) {
      this.visualFeedback.parentElement.removeChild(this.visualFeedback);
      this.visualFeedback = null;
    }
  }

  performErasure(point) {
    if (!window.XVGSystem) return;

    const s = window.XVGSystem;
    let hasChanges = false;

    // The point coordinates are already in world coordinates
    const worldPoint = point;

    // Process each path for potential erasure
    for (let i = s.appState.paths.length - 1; i >= 0; i--) {
      const path = s.appState.paths[i];
      if (!path || !path.data) continue;

      if (this.shouldErasePath(path, worldPoint)) {
        // Remove the path completely
        s.appState.paths.splice(i, 1);
        hasChanges = true;
        console.log(`[Eraser] Completely erased path ${path.id}`);
      } else if (this.shouldPartiallyErasePath(path, worldPoint)) {
        // Modify the path to remove the erased portion
        const newPath = this.partiallyErasePath(path, worldPoint);
        if (newPath) {
          s.appState.paths[i] = newPath;
          hasChanges = true;
          console.log(`[Eraser] Partially erased path ${path.id}`);
        }
      }
    }

    if (hasChanges) {
      // Update the canvas rendering
      if (window.renderCanvas) {
        window.renderCanvas();
      }
      console.log('[Eraser] Erasure operation completed');
    }
  }

  shouldErasePath(path, point) {
    // Check if the eraser completely covers the path
    const pathBounds = this.getPathBounds(path);
    const eraserBounds = this.getEraserBounds(point);

    // If eraser completely contains the path, erase it
    return (eraserBounds.left <= pathBounds.left &&
            eraserBounds.right >= pathBounds.right &&
            eraserBounds.top <= pathBounds.top &&
            eraserBounds.bottom >= pathBounds.bottom);
  }

  shouldPartiallyErasePath(path, point) {
    // Check if eraser intersects with the path
    const pathBounds = this.getPathBounds(path);
    const eraserBounds = this.getEraserBounds(point);

    return !(eraserBounds.left > pathBounds.right ||
             eraserBounds.right < pathBounds.left ||
             eraserBounds.top > pathBounds.bottom ||
             eraserBounds.bottom < pathBounds.top);
  }

  partiallyErasePath(path, point) {
    // For now, implement simple point removal near eraser
    // This could be enhanced with proper curve splitting
    const worldRadius = this.radius / window.XVGSystem.appState.canvasTransform.zoom;

    // Parse SVG path and remove points within eraser radius
    const pathData = this.parseSVGPath(path.data);
    const filteredPoints = pathData.filter(pathPoint => {
      const dx = pathPoint.x - point.x;
      const dy = pathPoint.y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance > worldRadius;
    });

    if (filteredPoints.length < 2) {
      return null; // Path too small after erasing
    }

    // Reconstruct SVG path from filtered points
    const newPathData = this.pointsToSVGPath(filteredPoints);
    return {
      ...path,
      data: newPathData,
      // Update bounds if available
      x: Math.min(...filteredPoints.map(p => p.x)),
      y: Math.min(...filteredPoints.map(p => p.y)),
      w: Math.max(...filteredPoints.map(p => p.x)) - Math.min(...filteredPoints.map(p => p.x)),
      h: Math.max(...filteredPoints.map(p => p.y)) - Math.min(...filteredPoints.map(p => p.y))
    };
  }

  parseSVGPath(pathData) {
    // Simple SVG path parser for basic paths
    const points = [];
    const commands = pathData.split(/(?=[MLHVCSQTAZ])/);

    let currentX = 0;
    let currentY = 0;

    for (const command of commands) {
      const type = command[0];
      const args = command.slice(1).trim().split(/[\s,]+/).map(Number);

      switch (type) {
        case 'M':
        case 'L':
          if (args.length >= 2) {
            currentX = args[0];
            currentY = args[1];
            points.push({ x: currentX, y: currentY });
          }
          break;
        case 'H':
          currentX = args[0];
          points.push({ x: currentX, y: currentY });
          break;
        case 'V':
          currentY = args[0];
          points.push({ x: currentX, y: currentY });
          break;
        // Add more command types as needed
      }
    }

    return points;
  }

  pointsToSVGPath(points) {
    if (points.length === 0) return '';

    let path = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x},${points[i].y}`;
    }
    return path;
  }

  getPathBounds(path) {
    // Calculate bounding box of SVG path
    if (path.x !== undefined && path.y !== undefined &&
        path.w !== undefined && path.h !== undefined) {
      return {
        left: path.x,
        top: path.y,
        right: path.x + path.w,
        bottom: path.y + path.h
      };
    }

    // Fallback: parse path to calculate bounds
    const points = this.parseSVGPath(path.data);
    if (points.length === 0) {
      return { left: 0, top: 0, right: 0, bottom: 0 };
    }

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);

    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys)
    };
  }

  getEraserBounds(point) {
    const worldRadius = this.radius / window.XVGSystem.appState.canvasTransform.zoom;

    return {
      left: point.x - worldRadius,
      top: point.y - worldRadius,
      right: point.x + worldRadius,
      bottom: point.y + worldRadius
    };
  }

  setRadius(newRadius) {
    this.radius = Math.max(1, Math.min(100, newRadius));
    console.log(`[Eraser] Radius set to ${this.radius}px`);
  }

  getRadius() {
    return this.radius;
  }

  screenToWorld(p) {
    if (!window.XVGSystem?.appState?.canvasTransform) return p;

    const t = window.XVGSystem.appState.canvasTransform;
    return {
      x: (p.x - t.pan_x) / t.zoom,
      y: (p.y - t.pan_y) / t.zoom
    };
  }
}

// Rectangle Tool
class RectangleTool {
  constructor() {
    this.isDrawing = false;
    this.startPoint = null;
    this.currentRect = null;
  }
  
  initialize() {
    this.isDrawing = false;
    this.startPoint = null;
    this.currentRect = null;
  }
  
  startDrawing(p) {
    if (!window.XVGSystem) return;
    this.isDrawing = true;
    this.startPoint = this.screenToWorld(p);
    this.currentRect = {
      x: this.startPoint.x,
      y: this.startPoint.y,
      width: 0,
      height: 0,
      style: {
        fill: { color: [0.8, 0.8, 0.8, 1], rule: 'NonZero' },
        stroke: { color: [0, 0, 0, 1], width: 2, cap: 'Butt', join: 'Miter', dash_array: [] },
        opacity: 1.0,
        blend_mode: 'Normal'
      }
    };
  }
  
  updateDrawing(p) {
    if (!this.isDrawing || !this.startPoint || !this.currentRect) return;
    const worldPoint = this.screenToWorld(p);
    
    this.currentRect.width = worldPoint.x - this.startPoint.x;
    this.currentRect.height = worldPoint.y - this.startPoint.y;
    
    // Handle negative dimensions
    if (this.currentRect.width < 0) {
      this.currentRect.x = this.startPoint.x + this.currentRect.width;
      this.currentRect.width = Math.abs(this.currentRect.width);
    } else {
      this.currentRect.x = this.startPoint.x;
    }
    
    if (this.currentRect.height < 0) {
      this.currentRect.y = this.startPoint.y + this.currentRect.height;
      this.currentRect.height = Math.abs(this.currentRect.height);
    } else {
      this.currentRect.y = this.startPoint.y;
    }
    
    window.renderCanvas && window.renderCanvas();
    this.drawCurrentRect();
  }
  
  finishDrawing() {
    if (!this.isDrawing || !this.currentRect) return;
    
    // Only add rectangle if it has meaningful size
    if (this.currentRect.width > 1 && this.currentRect.height > 1) {
      const rectPath = {
        id: crypto.randomUUID(),
        type: 'path',
        data: `M ${this.currentRect.x} ${this.currentRect.y} L ${this.currentRect.x + this.currentRect.width} ${this.currentRect.y} L ${this.currentRect.x + this.currentRect.width} ${this.currentRect.y + this.currentRect.height} L ${this.currentRect.x} ${this.currentRect.y + this.currentRect.height} Z`,
        style: this.currentRect.style
      };
      
      // Use proper addPath function to ensure layer assignment and undo support
      window.addPath(rectPath);
    }
    
    this.isDrawing = false;
    this.startPoint = null;
    this.currentRect = null;
    window.renderCanvas && window.renderCanvas();
  }
  
  screenToWorld(p) {
    const { pan_x, pan_y, zoom } = window.XVGSystem.appState.canvasTransform;
    return { x: (p.x - pan_x) / zoom, y: (p.y - pan_y) / zoom };
  }
  
  drawCurrentRect() {
    const ctx = window.XVGSystem?.canvas?.context;
    if (!ctx || !this.currentRect) return;
    
    ctx.save();
    const { pan_x, pan_y, zoom } = window.XVGSystem.appState.canvasTransform;
    ctx.translate(pan_x, pan_y);
    ctx.scale(zoom, zoom);
    
    ctx.fillStyle = `rgba(${this.currentRect.style.fill.color.join(',')})`;
    ctx.strokeStyle = `rgba(${this.currentRect.style.stroke.color.join(',')})`;
    ctx.lineWidth = this.currentRect.style.stroke.width;
    
    ctx.fillRect(this.currentRect.x, this.currentRect.y, this.currentRect.width, this.currentRect.height);
    ctx.strokeRect(this.currentRect.x, this.currentRect.y, this.currentRect.width, this.currentRect.height);
    
    ctx.restore();
  }
}

// Circle Tool
class CircleTool {
  constructor() {
    this.isDrawing = false;
    this.centerPoint = null;
    this.currentCircle = null;
  }
  
  initialize() {
    this.isDrawing = false;
    this.centerPoint = null;
    this.currentCircle = null;
  }
  
  startDrawing(p) {
    if (!window.XVGSystem) return;
    this.isDrawing = true;
    this.centerPoint = this.screenToWorld(p);
    this.currentCircle = {
      cx: this.centerPoint.x,
      cy: this.centerPoint.y,
      radius: 0,
      style: {
        fill: { color: [0.8, 0.8, 0.8, 1], rule: 'NonZero' },
        stroke: { color: [0, 0, 0, 1], width: 2, cap: 'Butt', join: 'Miter', dash_array: [] },
        opacity: 1.0,
        blend_mode: 'Normal'
      }
    };
  }
  
  updateDrawing(p) {
    if (!this.isDrawing || !this.centerPoint || !this.currentCircle) return;
    const worldPoint = this.screenToWorld(p);
    
    const dx = worldPoint.x - this.centerPoint.x;
    const dy = worldPoint.y - this.centerPoint.y;
    this.currentCircle.radius = Math.sqrt(dx * dx + dy * dy);
    
    window.renderCanvas && window.renderCanvas();
    this.drawCurrentCircle();
  }
  
  finishDrawing() {
    if (!this.isDrawing || !this.currentCircle) return;
    
    // Only add circle if it has meaningful size
    if (this.currentCircle.radius > 1) {
      const circlePath = {
        id: crypto.randomUUID(),
        type: 'path',
        data: `M ${this.currentCircle.cx + this.currentCircle.radius} ${this.currentCircle.cy} A ${this.currentCircle.radius} ${this.currentCircle.radius} 0 1 0 ${this.currentCircle.cx - this.currentCircle.radius} ${this.currentCircle.cy} A ${this.currentCircle.radius} ${this.currentCircle.radius} 0 1 0 ${this.currentCircle.cx + this.currentCircle.radius} ${this.currentCircle.cy} Z`,
        style: this.currentCircle.style
      };
      
      // Use proper addPath function to ensure layer assignment and undo support
      window.addPath(circlePath);
    }
    
    this.isDrawing = false;
    this.centerPoint = null;
    this.currentCircle = null;
    window.renderCanvas && window.renderCanvas();
  }
  
  screenToWorld(p) {
    const { pan_x, pan_y, zoom } = window.XVGSystem.appState.canvasTransform;
    return { x: (p.x - pan_x) / zoom, y: (p.y - pan_y) / zoom };
  }
  
  drawCurrentCircle() {
    const ctx = window.XVGSystem?.canvas?.context;
    if (!ctx || !this.currentCircle) return;
    
    ctx.save();
    const { pan_x, pan_y, zoom } = window.XVGSystem.appState.canvasTransform;
    ctx.translate(pan_x, pan_y);
    ctx.scale(zoom, zoom);
    
    ctx.fillStyle = `rgba(${this.currentCircle.style.fill.color.join(',')})`;
    ctx.strokeStyle = `rgba(${this.currentCircle.style.stroke.color.join(',')})`;
    ctx.lineWidth = this.currentCircle.style.stroke.width;
    
    ctx.beginPath();
    ctx.arc(this.currentCircle.cx, this.currentCircle.cy, this.currentCircle.radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
  }
}

// Line Tool
class LineTool {
  constructor() {
    this.isDrawing = false;
    this.startPoint = null;
    this.currentLine = null;
  }
  
  initialize() {
    this.isDrawing = false;
    this.startPoint = null;
    this.currentLine = null;
  }
  
  startDrawing(p) {
    if (!window.XVGSystem) return;
    this.isDrawing = true;
    this.startPoint = this.screenToWorld(p);
    this.currentLine = {
      x1: this.startPoint.x,
      y1: this.startPoint.y,
      x2: this.startPoint.x,
      y2: this.startPoint.y,
      style: {
        fill: null,
        stroke: { color: [0, 0, 0, 1], width: 2, cap: 'Butt', join: 'Miter', dash_array: [] }
      }
    };
  }
  
  updateDrawing(p) {
    if (!this.isDrawing || !this.startPoint || !this.currentLine) return;
    const worldPoint = this.screenToWorld(p);
    
    this.currentLine.x2 = worldPoint.x;
    this.currentLine.y2 = worldPoint.y;
    
    window.renderCanvas && window.renderCanvas();
    this.drawCurrentLine();
  }
  
  finishDrawing() {
    if (!this.isDrawing || !this.currentLine) return;
    
    // Only add line if it has meaningful length
    const dx = this.currentLine.x2 - this.currentLine.x1;
    const dy = this.currentLine.y2 - this.currentLine.y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length > 1) {
      const linePath = {
        id: crypto.randomUUID(),
        type: 'path',
        data: `M ${this.currentLine.x1} ${this.currentLine.y1} L ${this.currentLine.x2} ${this.currentLine.y2}`,
        style: this.currentLine.style
      };
      
      // Use proper addPath function to ensure layer assignment and undo support
      window.addPath(linePath);
    }
    
    this.isDrawing = false;
    this.startPoint = null;
    this.currentLine = null;
    window.renderCanvas && window.renderCanvas();
  }
  
  screenToWorld(p) {
    const { pan_x, pan_y, zoom } = window.XVGSystem.appState.canvasTransform;
    return { x: (p.x - pan_x) / zoom, y: (p.y - pan_y) / zoom };
  }
  
  drawCurrentLine() {
    const ctx = window.XVGSystem?.canvas?.context;
    if (!ctx || !this.currentLine) return;
    
    ctx.save();
    const { pan_x, pan_y, zoom } = window.XVGSystem.appState.canvasTransform;
    ctx.translate(pan_x, pan_y);
    ctx.scale(zoom, zoom);
    
    ctx.strokeStyle = `rgba(${this.currentLine.style.stroke.color.join(',')})`;
    ctx.lineWidth = this.currentLine.style.stroke.width;
    
    ctx.beginPath();
    ctx.moveTo(this.currentLine.x1, this.currentLine.y1);
    ctx.lineTo(this.currentLine.x2, this.currentLine.y2);
    ctx.stroke();
    
    ctx.restore();
  }
}

// Brush Tool - Raster-style drawing with smooth strokes
class BrushTool {
  constructor() {
    this.isDrawing = false;
    this.currentStroke = null;
    this.points = [];
    this.brushSize = 10;
    this.brushOpacity = 1.0;
    this.brushColor = [0, 0, 0, 1]; // RGBA
    this.smoothing = 0.5; // Smoothing factor for stroke interpolation
  }

  initialize() {
    this.isDrawing = false;
    this.currentStroke = null;
    this.points = [];
    this.brushSize = 10;
    this.brushOpacity = 1.0;
    this.brushColor = [0, 0, 0, 1];
    this.smoothing = 0.5;
  }

  startDrawing(p) {
    if (!window.XVGSystem) return;
    this.isDrawing = true;
    this.points = [this.screenToWorld(p)];
    
    // Create initial stroke data
    this.currentStroke = {
      type: 'brush_stroke',
      points: [...this.points],
      brushSize: this.brushSize,
      color: [...this.brushColor],
      opacity: this.brushOpacity,
      timestamp: Date.now()
    };
    
    this.drawBrushPreview();
  }

  updateDrawing(p) {
    if (!this.isDrawing || !window.XVGSystem) return;
    
    const worldPoint = this.screenToWorld(p);
    this.points.push(worldPoint);
    
    // Update current stroke
    if (this.currentStroke) {
      this.currentStroke.points = [...this.points];
    }
    
    this.drawBrushPreview();
  }

  finishDrawing() {
    if (!this.isDrawing || !this.currentStroke) return;
    
    this.isDrawing = false;
    
    // Convert brush stroke to vector path using curve fitting
    const vectorPath = this.convertToVectorPath(this.points);
    
    if (vectorPath && vectorPath.length > 0) {
      // Add to XVG system as a path
      const path = {
        id: crypto.randomUUID(),
        type: 'path',
        data: vectorPath,
        style: {
          fill: null,
          stroke: {
            color: [...this.brushColor],
            width: this.brushSize,
            opacity: this.brushOpacity,
            lineCap: 'round',
            lineJoin: 'round'
          }
        },
        metadata: {
          tool: 'brush',
          originalPoints: this.points.length,
          timestamp: this.currentStroke.timestamp
        }
      };
      
      // Use proper addPath function to ensure layer assignment and undo support
      window.addPath(path);
      window.renderCanvas && window.renderCanvas();
    }
    
    // Clear preview
    this.clearBrushPreview();
    this.currentStroke = null;
    this.points = [];
  }

  convertToVectorPath(points) {
    if (points.length < 2) return '';
    
    // Simple curve fitting using quadratic Bezier curves
    let path = `M ${points[0].x} ${points[0].y}`;
    
    if (points.length === 2) {
      path += ` L ${points[1].x} ${points[1].y}`;
    } else {
      // Use quadratic curves for smooth interpolation
      for (let i = 1; i < points.length - 1; i++) {
        const current = points[i];
        const next = points[i + 1];
        const controlX = current.x;
        const controlY = current.y;
        const endX = (current.x + next.x) / 2;
        const endY = (current.y + next.y) / 2;
        
        path += ` Q ${controlX} ${controlY} ${endX} ${endY}`;
      }
      
      // Add final point
      const lastPoint = points[points.length - 1];
      path += ` L ${lastPoint.x} ${lastPoint.y}`;
    }
    
    return path;
  }

  drawBrushPreview() {
    if (!window.XVGSystem?.canvas?.overlayContext || this.points.length < 1) return;
    
    const ctx = window.XVGSystem.canvas.overlayContext;
    const canvas = window.XVGSystem.canvas.overlay;
    
    // Clear previous preview
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw current stroke with proper coordinate transformation
    if (this.points.length > 1) {
      ctx.save();
      
      // Apply canvas transform to match main canvas coordinates
      const t = window.XVGSystem.appState.canvasTransform;
      ctx.translate(t.pan_x, t.pan_y);
      ctx.scale(t.zoom, t.zoom);
      
      ctx.beginPath();
      ctx.moveTo(this.points[0].x, this.points[0].y);
      
      for (let i = 1; i < this.points.length; i++) {
        ctx.lineTo(this.points[i].x, this.points[i].y);
      }
      
      ctx.strokeStyle = `rgba(${this.brushColor[0] * 255}, ${this.brushColor[1] * 255}, ${this.brushColor[2] * 255}, ${this.brushOpacity})`;
      ctx.lineWidth = this.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      
      ctx.restore();
    }
  }

  clearBrushPreview() {
    if (!window.XVGSystem?.canvas?.overlayContext) return;
    
    const ctx = window.XVGSystem.canvas.overlayContext;
    const canvas = window.XVGSystem.canvas.overlay;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  screenToWorld(p) {
    if (!window.XVGSystem?.appState?.canvasTransform) return p;
    
    const t = window.XVGSystem.appState.canvasTransform;
    return {
      x: (p.x - t.pan_x) / t.zoom,
      y: (p.y - t.pan_y) / t.zoom
    };
  }

  setBrushSize(size) {
    this.brushSize = Math.max(1, Math.min(100, size));
  }

  setBrushColor(color) {
    if (Array.isArray(color) && color.length >= 3) {
      this.brushColor = [color[0], color[1], color[2], color[3] || 1];
    }
  }

  setBrushOpacity(opacity) {
    this.brushOpacity = Math.max(0, Math.min(1, opacity));
  }

  getBrushSize() {
    return this.brushSize;
  }

  getBrushColor() {
    return [...this.brushColor];
  }

  getBrushOpacity() {
    return this.brushOpacity;
  }
}

// Background Remover Tool
class BackgroundRemoverTool {
  constructor() {
    this.isActive = false;
    this.selectedImage = null;
    this.isProcessing = false;
  }

  initialize() {
    this.isActive = false;
    this.selectedImage = null;
    this.isProcessing = false;
    console.log('[BackgroundRemover] Initialized');
  }

  activate() {
    this.isActive = true;
    console.log('[BackgroundRemover] Activated');
  }

  deactivate() {
    this.isActive = false;
    this.selectedImage = null;
    console.log('[BackgroundRemover] Deactivated');
  }

  // Main background removal function
  removeBackground(imageId) {
    if (!window.XVGSystem || this.isProcessing) return;

    const imageData = window.XVGSystem.appState.images.find(img => img.id === imageId);
    if (!imageData || !imageData.element) {
      console.error('[BackgroundRemover] Image not found or invalid');
      return;
    }

    this.isProcessing = true;
    this.selectedImage = imageData;

    console.log('[BackgroundRemover] Starting background removal for image:', imageId);

    try {
      // Create a canvas to process the image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = imageData.width;
      canvas.height = imageData.height;

      // Draw the image onto the canvas
      ctx.drawImage(imageData.element, 0, 0);

      // Get image data for processing
      const imageDataRGBA = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageDataRGBA.data;

      // Simple background removal algorithm
      // This is a basic implementation - finds the most common color (likely background)
      // and makes it transparent
      const processedData = this.processImageData(data, canvas.width, canvas.height);

      // Put the processed data back
      ctx.putImageData(new ImageData(processedData, canvas.width, canvas.height), 0, 0);

      // Convert back to image
      canvas.toBlob((blob) => {
        if (blob) {
          const newImage = new Image();
          newImage.onload = () => {
            // Update the original image data
            imageData.element = newImage;
            imageData.src = canvas.toDataURL();

            this.isProcessing = false;
            console.log('[BackgroundRemover] Background removal completed');

            // Trigger canvas redraw
            if (window.XVGSystem && window.XVGSystem.renderCanvas) {
              window.XVGSystem.renderCanvas();
            }
          };
          newImage.src = URL.createObjectURL(blob);
        } else {
          this.isProcessing = false;
          console.error('[BackgroundRemover] Failed to process image');
        }
      }, 'image/png');

    } catch (error) {
      this.isProcessing = false;
      console.error('[BackgroundRemover] Error during background removal:', error);
    }
  }

  // Basic background removal algorithm
  processImageData(data, width, height) {
    const processedData = new Uint8ClampedArray(data.length);

    // Find the most common background color (simple approach)
    const colorCounts = {};
    const sampleStep = 10; // Sample every 10th pixel for speed

    // Sample colors from image borders (likely background)
    for (let y = 0; y < height; y += sampleStep) {
      for (let x = 0; x < width; x += sampleStep) {
        if (x < 20 || x > width - 20 || y < 20 || y > height - 20) {
          const index = (y * width + x) * 4;
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          const key = `${r},${g},${b}`;

          colorCounts[key] = (colorCounts[key] || 0) + 1;
        }
      }
    }

    // Find the most common color
    let bgColor = null;
    let maxCount = 0;
    for (const [color, count] of Object.entries(colorCounts)) {
      if (count > maxCount) {
        maxCount = count;
        bgColor = color.split(',').map(Number);
      }
    }

    if (!bgColor) {
      console.warn('[BackgroundRemover] Could not determine background color');
      return data; // Return original data if no background found
    }

    console.log('[BackgroundRemover] Detected background color:', bgColor);

    // Process each pixel
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Calculate color distance from background
      const distance = Math.sqrt(
        Math.pow(r - bgColor[0], 2) +
        Math.pow(g - bgColor[1], 2) +
        Math.pow(b - bgColor[2], 2)
      );

      // If pixel is close to background color, make it transparent
      const threshold = 30; // Adjust this value to control sensitivity
      if (distance < threshold) {
        processedData[i] = r;     // R
        processedData[i + 1] = g; // G
        processedData[i + 2] = b; // B
        processedData[i + 3] = 0; // A (transparent)
      } else {
        processedData[i] = r;       // R
        processedData[i + 1] = g;   // G
        processedData[i + 2] = b;   // B
        processedData[i + 3] = a;   // A (keep original)
      }
    }

    return processedData;
  }

  // Handle mouse events for selecting images
  handleMouseDown(x, y) {
    if (!this.isActive || this.isProcessing) return;

    // Convert screen coordinates to world coordinates
    const worldPoint = this.screenToWorld(x, y);

    // Find image under cursor
    const images = window.XVGSystem?.appState?.images || [];
    for (const image of images) {
      if (this.isPointInImage(worldPoint.x, worldPoint.y, image)) {
        console.log('[BackgroundRemover] Selected image for background removal:', image.id);
        this.removeBackground(image.id);
        break;
      }
    }
  }

  // Convert screen coordinates to world coordinates
  screenToWorld(screenX, screenY) {
    const transform = window.XVGSystem?.appState?.canvasTransform;
    if (!transform) return { x: screenX, y: screenY };

    return {
      x: (screenX - transform.pan_x) / transform.zoom,
      y: (screenY - transform.pan_y) / transform.zoom
    };
  }

  // Check if point is within image bounds
  isPointInImage(x, y, image) {
    return x >= image.x &&
           x <= image.x + image.width &&
           y >= image.y &&
           y <= image.y + image.height;
  }

  // Get tool status
  getStatus() {
    if (this.isProcessing) {
      return 'Processing background removal...';
    }
    return 'Click on an image to remove its background';
  }

  // Render tool overlay
  render(ctx, transform) {
    if (!this.isActive) return;

    // Render a subtle overlay to indicate the tool is active
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#ff6b6b'; // Light red tint
    ctx.fillRect(0, 0, XVGSystem.appState.canvas.width, XVGSystem.appState.canvas.height);
    ctx.restore();

    // Highlight images that can be processed
    const images = window.XVGSystem?.appState?.images || [];
    images.forEach(image => {
      if (image.element && image.x !== undefined && image.y !== undefined) {
        ctx.save();
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2 / transform.zoom; // Scale line width with zoom
        ctx.setLineDash([5 / transform.zoom, 5 / transform.zoom]);
        ctx.strokeRect(image.x, image.y, image.width, image.height);
        ctx.restore();
      }
    });
  }
}

function initializeTools(){ 
  if(!window.XVGSystem) return false; 
  window.XVGSystem.tools.pan = new PanTool(); 
  window.XVGSystem.tools.pan.initialize();
  window.XVGSystem.tools.selection = new SelectionTool(); 
  window.XVGSystem.tools.selection.initialize();
  window.XVGSystem.tools.pen = new PenTool(); 
  window.XVGSystem.tools.pen.initialize();
  window.XVGSystem.tools.image = new ImageTool(); 
  window.XVGSystem.tools.image.initialize();
  window.XVGSystem.tools.eraser = new EraserTool(); 
  window.XVGSystem.tools.eraser.initialize();
  window.XVGSystem.tools.rectangle = new RectangleTool(); 
  window.XVGSystem.tools.rectangle.initialize();
  window.XVGSystem.tools.circle = new CircleTool(); 
  window.XVGSystem.tools.circle.initialize();
  window.XVGSystem.tools.line = new LineTool(); 
  window.XVGSystem.tools.line.initialize();
  window.XVGSystem.tools.text = new TextTool(); 
  window.XVGSystem.tools.text.initialize();
  window.XVGSystem.tools.textbox = new TextBoxTool(); 
  window.XVGSystem.tools.textbox.initialize();
  window.XVGSystem.tools.brush = new BrushTool(); 
  window.XVGSystem.tools.brush.initialize();
  window.XVGSystem.tools.eyedropper = new EyedropperTool(); 
  window.XVGSystem.tools.eyedropper.initialize();
  window.XVGSystem.tools.gradient = new GradientTool(); 
  window.XVGSystem.tools.gradient.initialize();
  window.XVGSystem.tools.cut = new CutTool(); 
  window.XVGSystem.tools.cut.initialize();
  window.XVGSystem.tools.pattern = new PatternTool(); 
  window.XVGSystem.tools.pattern.initialize();
  window.XVGSystem.tools.blur = new BlurTool(); 
  window.XVGSystem.tools.blur.initialize();
  window.XVGSystem.tools.shadow = new ShadowTool(); 
  window.XVGSystem.tools.shadow.initialize();
  window.XVGSystem.tools.polygon = new PolygonTool(); 
  window.XVGSystem.tools.polygon.initialize();
  window.XVGSystem.tools.triangle = new TriangleTool();
  window.XVGSystem.tools.triangle.initialize();
  window.XVGSystem.tools.bgremover = new BackgroundRemoverTool();
  window.XVGSystem.tools.bgremover.initialize();
  window.XVGSystem.tools.ready = true; 
  console.log('[Tools] All tools initialized successfully');
  
  // Export tool classes globally for testing
  window.XVGSelectionTool = SelectionTool;
  window.XVGPanTool = PanTool;
  window.XVGPenTool = PenTool;
  window.XVGEraserTool = EraserTool;
  window.XVGBackgroundRemoverTool = BackgroundRemoverTool;
  
  return true; 
}

// Test function for selection tool
window.testSelectionTool = function() {
  console.log('[SelectionTool] Testing selection tool...');
  console.log('[SelectionTool] XVGSystem available:', !!window.XVGSystem);
  console.log('[SelectionTool] Current tool:', window.XVGSystem?.appState?.currentTool);
  console.log('[SelectionTool] Selection tool exists:', !!window.XVGSystem?.tools?.selection);
  console.log('[SelectionTool] Tools ready:', window.XVGSystem?.tools?.ready);
  console.log('[SelectionTool] Canvas available:', !!window.XVGSystem?.canvas?.element);
  console.log('[SelectionTool] Paths available:', window.XVGSystem?.appState?.paths?.length || 0);

  if (window.XVGSystem?.tools?.selection) {
    console.log('[SelectionTool] Selection tool methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(window.XVGSystem.tools.selection)));
  }

  return {
    systemAvailable: !!window.XVGSystem,
    currentTool: window.XVGSystem?.appState?.currentTool,
    selectionToolExists: !!window.XVGSystem?.tools?.selection,
    toolsReady: window.XVGSystem?.tools?.ready,
    canvasAvailable: !!window.XVGSystem?.canvas?.element,
    pathsCount: window.XVGSystem?.appState?.paths?.length || 0
  };
};

// Global tool dispatchers
window.handleToolMouseDown = function(x,y,e){
  const t=window.XVGSystem?.appState.currentTool;
  const isRightClick = e.button === 2; // Detect right-click
  if(t==='pan' && window.XVGSystem.tools.pan) window.XVGSystem.tools.pan.startPan({x,y}); 
  else if(t==='select' && window.XVGSystem.tools.selection) window.XVGSystem.tools.selection.startSelection({x,y}, isRightClick); 
  else if(t==='pen' && window.XVGSystem.tools.pen) window.XVGSystem.tools.pen.startDrawing({x,y}); 
  else if(t==='eraser' && window.XVGSystem.tools.eraser) window.XVGSystem.tools.eraser.startErasing({x,y}); 
  else if(t==='rectangle' && window.XVGSystem.tools.rectangle) window.XVGSystem.tools.rectangle.startDrawing({x,y}); 
  else if(t==='circle' && window.XVGSystem.tools.circle) window.XVGSystem.tools.circle.startDrawing({x,y}); 
  else if(t==='line' && window.XVGSystem.tools.line) window.XVGSystem.tools.line.startDrawing({x,y}); 
  else if(t==='text' && window.XVGSystem.tools.text) window.XVGSystem.tools.text.startDrawing({x,y}); 
  else if(t==='textbox' && window.XVGSystem.tools.textbox) window.XVGSystem.tools.textbox.startDrawing({x,y}); 
  else if(t==='brush' && window.XVGSystem.tools.brush) window.XVGSystem.tools.brush.startDrawing({x,y}); 
  else if(t==='eyedropper' && window.XVGSystem.tools.eyedropper) window.XVGSystem.tools.eyedropper.startDrawing({x,y}); 
  else if(t==='cut' && window.XVGSystem.tools.cut) window.XVGSystem.tools.cut.startDrawing({x,y}); 
  else if(t==='gradient' && window.XVGSystem.tools.gradient) window.XVGSystem.tools.gradient.startDrawing({x,y}); 
  else if(t==='pattern' && window.XVGSystem.tools.pattern) window.XVGSystem.tools.pattern.startDrawing({x,y}); 
  else if(t==='blur' && window.XVGSystem.tools.blur) window.XVGSystem.tools.blur.startDrawing({x,y}); 
  else if(t==='shadow' && window.XVGSystem.tools.shadow) window.XVGSystem.tools.shadow.startDrawing({x,y}); 
  else if(t==='triangle' && window.XVGSystem.tools.triangle) window.XVGSystem.tools.triangle.startDrawing({x,y}); 
  else if(t==='polygon' && window.XVGSystem.tools.polygon) window.XVGSystem.tools.polygon.startDrawing({x,y});
  else if(t==='bgremover' && window.XVGSystem.tools.bgremover) window.XVGSystem.tools.bgremover.handleMouseDown(x,y);
};
window.handleToolMouseMove = function(x,y,e){ 
  const t=window.XVGSystem?.appState.currentTool; 
  if(t==='pan' && window.XVGSystem.tools.pan) window.XVGSystem.tools.pan.updatePan({x,y}); 
  else if(t==='select' && window.XVGSystem.tools.selection) window.XVGSystem.tools.selection.updateSelection({x,y}); 
  else if(t==='pen' && window.XVGSystem.tools.pen) window.XVGSystem.tools.pen.updateDrawing({x,y}); 
  else if(t==='eraser' && window.XVGSystem.tools.eraser) window.XVGSystem.tools.eraser.updateErasing({x,y}); 
  else if(t==='rectangle' && window.XVGSystem.tools.rectangle) window.XVGSystem.tools.rectangle.updateDrawing({x,y}); 
  else if(t==='circle' && window.XVGSystem.tools.circle) window.XVGSystem.tools.circle.updateDrawing({x,y}); 
  else if(t==='line' && window.XVGSystem.tools.line) window.XVGSystem.tools.line.updateDrawing({x,y}); 
  else if(t==='text' && window.XVGSystem.tools.text) window.XVGSystem.tools.text.updateDrawing({x,y}); 
  else if(t==='textbox' && window.XVGSystem.tools.textbox) window.XVGSystem.tools.textbox.updateDrawing({x,y}); 
  else if(t==='brush' && window.XVGSystem.tools.brush) window.XVGSystem.tools.brush.updateDrawing({x,y}); 
  else if(t==='eyedropper' && window.XVGSystem.tools.eyedropper) window.XVGSystem.tools.eyedropper.updateDrawing({x,y}); 
  else if(t==='cut' && window.XVGSystem.tools.cut) window.XVGSystem.tools.cut.updateDrawing({x,y}); 
  else if(t==='gradient' && window.XVGSystem.tools.gradient) window.XVGSystem.tools.gradient.updateDrawing({x,y}); 
  else if(t==='pattern' && window.XVGSystem.tools.pattern) window.XVGSystem.tools.pattern.updateDrawing({x,y}); 
  else if(t==='blur' && window.XVGSystem.tools.blur) window.XVGSystem.tools.blur.updateDrawing({x,y}); 
  else if(t==='shadow' && window.XVGSystem.tools.shadow) window.XVGSystem.tools.shadow.updateDrawing({x,y}); 
  else if(t==='triangle' && window.XVGSystem.tools.triangle) window.XVGSystem.tools.triangle.updateDrawing({x,y}); 
  else if(t==='polygon' && window.XVGSystem.tools.polygon) window.XVGSystem.tools.polygon.updateDrawing({x,y}); 
};
window.handleToolMouseUp = function(x,y,e){ 
  const t=window.XVGSystem?.appState.currentTool; 
  if(t==='pan' && window.XVGSystem.tools.pan) window.XVGSystem.tools.pan.finishPan(); 
  else if(t==='select' && window.XVGSystem.tools.selection) window.XVGSystem.tools.selection.finishSelection(); 
  else if(t==='pen' && window.XVGSystem.tools.pen) window.XVGSystem.tools.pen.finishDrawing(); 
  else if(t==='eraser' && window.XVGSystem.tools.eraser) window.XVGSystem.tools.eraser.finishErasing(); 
  else if(t==='rectangle' && window.XVGSystem.tools.rectangle) window.XVGSystem.tools.rectangle.finishDrawing(); 
  else if(t==='circle' && window.XVGSystem.tools.circle) window.XVGSystem.tools.circle.finishDrawing(); 
  else if(t==='line' && window.XVGSystem.tools.line) window.XVGSystem.tools.line.finishDrawing(); 
  else if(t==='text' && window.XVGSystem.tools.text) window.XVGSystem.tools.text.finishDrawing(); 
  else if(t==='textbox' && window.XVGSystem.tools.textbox) window.XVGSystem.tools.textbox.finishDrawing({x,y}); 
  else if(t==='brush' && window.XVGSystem.tools.brush) window.XVGSystem.tools.brush.finishDrawing({x,y}); 
  else if(t==='eyedropper' && window.XVGSystem.tools.eyedropper) window.XVGSystem.tools.eyedropper.finishDrawing({x,y}); 
  else if(t==='cut' && window.XVGSystem.tools.cut) window.XVGSystem.tools.cut.finishDrawing({x,y}); 
  else if(t==='gradient' && window.XVGSystem.tools.gradient) window.XVGSystem.tools.gradient.finishDrawing({x,y}); 
  else if(t==='pattern' && window.XVGSystem.tools.pattern) window.XVGSystem.tools.pattern.finishDrawing({x,y}); 
  else if(t==='blur' && window.XVGSystem.tools.blur) window.XVGSystem.tools.blur.finishDrawing({x,y}); 
  else if(t==='shadow' && window.XVGSystem.tools.shadow) window.XVGSystem.tools.shadow.finishDrawing({x,y}); 
  else if(t==='triangle' && window.XVGSystem.tools.triangle) window.XVGSystem.tools.triangle.finishDrawing({x,y}); 
  else if(t==='polygon' && window.XVGSystem.tools.polygon) window.XVGSystem.tools.polygon.finishDrawing({x,y}); 
};

// Simple initialization - no complex ModuleLoader dependencies
document.addEventListener('DOMContentLoaded', ()=>{ 
  setTimeout(() => {
    if (!window.XVGSystem?.tools?.ready) initializeTools(); 
  }, 200); 
});

// Text Tool implementation
class TextTool {
  constructor() {
    this.isActive = false;
    this.currentText = '';
    this.textPosition = null;
    this.fontSize = 16;
    this.fontFamily = 'Arial';
  }

  initialize() {
    console.log('[TextTool] Initialized');
    return true;
  }

  deactivate() {
    // Clean up any active text input when tool is deactivated
    if (this.currentTextInput) {
      this.cleanupTextInput(this.currentTextInput);
    }
    this.isActive = false;
    this.currentText = '';
    this.textPosition = null;
  }

  startDrawing(point) {
    console.log('[TextTool] Start text at:', point);
    this.isActive = true;
    this.textPosition = point;
    this.currentText = '';
    // Create text input overlay
    this.createTextInput(point);
  }

  updateDrawing(point) {
    // Text tool doesn't need continuous updates
  }

  finishDrawing() {
    console.log('[TextTool] Finish text');
    this.isActive = false;
    if (this.currentText && this.textPosition) {
      this.addTextToCanvas();
    }
  }

  createTextInput(point) {
    // Create temporary text input for user to type
    const input = document.createElement('input');
    input.type = 'text';

    // Convert canvas coordinates to screen coordinates
    const canvas = window.XVGSystem?.canvas?.element;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const screenX = rect.left + point.x;
      const screenY = rect.top + point.y;

      input.style.position = 'fixed'; // Use fixed positioning for screen coordinates
      input.style.left = screenX + 'px';
      input.style.top = screenY + 'px';
    } else {
      // Fallback if canvas not available
      input.style.position = 'absolute';
      input.style.left = point.x + 'px';
      input.style.top = point.y + 'px';
    }

    input.style.fontSize = this.fontSize + 'px';
    input.style.fontFamily = this.fontFamily;
    input.style.border = '1px solid #ccc';
    input.style.background = 'white';
    input.style.zIndex = '10000'; // Higher z-index to ensure it's on top
    
    // Handle keyboard events
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.currentText = input.value.trim();
        this.cleanupTextInput(input);
        this.finishDrawing();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cleanupTextInput(input);
        this.isActive = false;
      }
    });

    // Handle clicking outside to cancel
    const handleClickOutside = (e) => {
      if (e.target !== input) {
        e.preventDefault();
        if (input.value.trim()) {
          this.currentText = input.value.trim();
          this.cleanupTextInput(input);
          this.finishDrawing();
        } else {
          this.cleanupTextInput(input);
          this.isActive = false;
        }
        document.removeEventListener('click', handleClickOutside);
      }
    };

    // Add click listener after a short delay to avoid immediate trigger
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    // Store reference for cleanup
    this.currentTextInput = input;

    document.body.appendChild(input);
    input.focus();
  }

  cleanupTextInput(input) {
    if (input && input.parentNode) {
      try {
        document.body.removeChild(input);
      } catch (e) {
        console.warn('[TextTool] Error removing text input:', e);
      }
    }
    this.currentTextInput = null;
  }

  addTextToCanvas() {
    if (!this.currentText || !this.textPosition) return;
    
    try {
      // Try to use WASM XVG engine for vector text
      if (window.XVGSystem?.wasm?.add_text) {
        window.XVGSystem.wasm.add_text(
          this.textPosition.x,
          this.textPosition.y,
          this.currentText,
          this.fontSize,
          this.fontFamily
        );
        window.XVGSystem.render();
        window.markAsModified();
        return;
      }
      
      // Create vector text object if WASM not available
      this.addTextAsVectorObject();
      
    } catch (error) {
      console.warn('[TextTool] WASM text not available, using vector fallback');
      this.addTextAsVectorObject();
    }
  }
  
  addTextAsVectorObject() {
    // Add text as a proper vector object to the editor
    try {
      const textObject = {
        id: 'text_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        type: 'text',
        text: this.currentText,
        position: { x: this.textPosition.x, y: this.textPosition.y },
        fontSize: this.fontSize,
        fontFamily: this.fontFamily,
        fillColor: window.XVGSystem?.appState?.fillColor || '#000000',
        strokeColor: window.XVGSystem?.appState?.strokeColor || 'transparent',
        strokeWidth: window.XVGSystem?.appState?.strokeWidth || 1,
        visible: true,
        locked: false,
        layer: window.XVGSystem?.appState?.activeLayer || 0,
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      };
      
      // Add to paths array
      if (window.XVGSystem?.appState?.paths) {
        window.addPath(textObject);
        
        // Select the new text object
        window.XVGSystem.appState.selectedPaths = [textObject.id];
        
        // Trigger re-render
        if (window.renderCanvas) {
          window.renderCanvas();
        }
        
        // Mark as modified
        if (window.markAsModified) {
          window.markAsModified();
        }
        
        console.log('[TextTool] Added vector text object:', textObject.id);
      }
      
    } catch (error) {
      console.warn('[TextTool] Failed to add text as vector object:', error);
      this.addTextFallback();
    }
  }

  addTextFallback() {
    // Fallback: add text to canvas context directly
    const canvas = window.XVGSystem?.canvas;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.font = `${this.fontSize}px ${this.fontFamily}`;
      ctx.fillStyle = window.XVGSystem?.appState?.fillColor || '#000000';
      ctx.fillText(this.currentText, this.textPosition.x, this.textPosition.y);
      window.markAsModified();
    }
  }
}

// Text Box Tool implementation
class TextBoxTool {
  constructor() {
    this.isActive = false;
    this.startPoint = null;
    this.endPoint = null;
    this.currentText = '';
    this.fontSize = 16;
    this.fontFamily = 'Arial';
  }

  initialize() {
    console.log('[TextBoxTool] Initialized');
    return true;
  }

  startDrawing(point) {
    console.log('[TextBoxTool] Start text box at:', point);
    this.isActive = true;
    this.startPoint = point;
    this.endPoint = point;
  }

  updateDrawing(point) {
    if (this.isActive) {
      this.endPoint = point;
      this.renderPreview();
    }
  }

  finishDrawing() {
    console.log('[TextBoxTool] Finish text box');
    if (this.startPoint && this.endPoint) {
      this.createTextBoxInput();
    }
    this.isActive = false;
  }

  renderPreview() {
    // Draw preview rectangle for text box
    const canvas = window.XVGSystem?.canvas;
    if (canvas && this.startPoint && this.endPoint) {
      window.XVGSystem.render(); // Clear previous preview
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#0066cc';
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        this.startPoint.x,
        this.startPoint.y,
        this.endPoint.x - this.startPoint.x,
        this.endPoint.y - this.startPoint.y
      );
      ctx.setLineDash([]);
    }
  }

  createTextBoxInput() {
    const width = Math.abs(this.endPoint.x - this.startPoint.x);
    const height = Math.abs(this.endPoint.y - this.startPoint.y);
    const left = Math.min(this.startPoint.x, this.endPoint.x);
    const top = Math.min(this.startPoint.y, this.endPoint.y);

    const textarea = document.createElement('textarea');
    textarea.style.position = 'absolute';
    textarea.style.left = left + 'px';
    textarea.style.top = top + 'px';
    textarea.style.width = width + 'px';
    textarea.style.height = height + 'px';
    textarea.style.fontSize = this.fontSize + 'px';
    textarea.style.fontFamily = this.fontFamily;
    textarea.style.border = '1px solid #ccc';
    textarea.style.background = 'white';
    textarea.style.zIndex = '1000';
    textarea.style.resize = 'none';
    
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.currentText = textarea.value;
        document.body.removeChild(textarea);
        this.addTextBoxToCanvas(left, top, width, height);
      }
    });
    
    textarea.addEventListener('blur', () => {
      this.currentText = textarea.value;
      document.body.removeChild(textarea);
      this.addTextBoxToCanvas(left, top, width, height);
    });
    
    document.body.appendChild(textarea);
    textarea.focus();
  }

  addTextBoxToCanvas(x, y, width, height) {
    if (window.XVGSystem?.wasm?.add_text_box) {
      try {
        window.XVGSystem.wasm.add_text_box(
          x, y, width, height,
          this.currentText,
          this.fontSize,
          this.fontFamily
        );
        window.XVGSystem.render();
        window.markAsModified();
      } catch (error) {
        console.warn('[TextBoxTool] WASM text box not available, using fallback');
        this.addTextBoxFallback(x, y, width, height);
      }
    } else {
      this.addTextBoxFallback(x, y, width, height);
    }
  }

  addTextBoxFallback(x, y, width, height) {
    const canvas = window.XVGSystem?.canvas;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      
      // Draw text box border
      ctx.strokeStyle = window.XVGSystem?.appState?.strokeColor || '#000000';
      ctx.strokeRect(x, y, width, height);
      
      // Draw text inside box
      ctx.font = `${this.fontSize}px ${this.fontFamily}`;
      ctx.fillStyle = window.XVGSystem?.appState?.fillColor || '#000000';
      
      // Simple text wrapping
      const words = this.currentText.split(' ');
      let line = '';
      let lineY = y + this.fontSize;
      
      for (let word of words) {
        const testLine = line + word + ' ';
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > width - 10 && line !== '') {
          ctx.fillText(line, x + 5, lineY);
          line = word + ' ';
          lineY += this.fontSize + 2;
        } else {
          line = testLine;
        }
        
        if (lineY > y + height - 5) break;
      }
      
      if (line.trim() !== '') {
        ctx.fillText(line, x + 5, lineY);
      }
      
      window.markAsModified();
    }
  }
}

// EyedropperTool class for color sampling
class EyedropperTool {
  constructor() {
    this.name = 'eyedropper';
    this.isActive = false;
  }

  initialize() {
    this.isActive = false;
  }

  startDrawing(point) {
    this.sampleColor(point);
  }

  updateDrawing(point) {
    // Show preview of color being sampled
    this.previewColor(point);
  }

  finishDrawing(point) {
    this.sampleColor(point);
  }

  sampleColor(point) {
    try {
      // Get canvas context for color sampling
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      
      // Convert screen coordinates to canvas coordinates
      const x = Math.floor((point.x - rect.left) * (canvas.width / rect.width));
      const y = Math.floor((point.y - rect.top) * (canvas.height / rect.height));
      
      // Sample pixel color
      const imageData = ctx.getImageData(x, y, 1, 1);
      const [r, g, b, a] = imageData.data;
      
      // Convert to hex color
      const hex = '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
      
      // Set as current color
        if (window.XVGSystem && window.XVGSystem.appState) {
          window.XVGSystem.appState.currentColor = hex;
          window.XVGSystem.appState.fillColor = hex;
          
          // Update UI color picker if it exists
          const colorPicker = document.querySelector('#colorPicker, input[type="color"]');
          if (colorPicker) {
            colorPicker.value = hex;
          }
          
          // Update eyedropper color preview
          const preview = document.getElementById('eyedropper-color-preview');
          if (preview) {
            preview.style.backgroundColor = hex;
          }
          
          // Update fill color input
          const fillColorInput = document.getElementById('fill-color');
          if (fillColorInput) {
            fillColorInput.value = hex;
          }
          
          // Trigger color change event
          if (window.updateColorDisplay) {
            window.updateColorDisplay(hex);
          }
          
          console.log('Sampled color:', hex);
        }
    } catch (error) {
      console.warn('Color sampling failed:', error);
    }
  }

  previewColor(point) {
    // Could show a preview tooltip with the color being sampled
    // For now, just sample without setting
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      
      const x = Math.floor((point.x - rect.left) * (canvas.width / rect.width));
      const y = Math.floor((point.y - rect.top) * (canvas.height / rect.height));
      
      const imageData = ctx.getImageData(x, y, 1, 1);
      const [r, g, b] = imageData.data;
      const hex = '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
      
      // Could update a preview element here
      // document.title = `Color: ${hex}`; // Temporary preview in title
    } catch (error) {
      // Silently fail for preview
    }
  }
}

// GradientTool class for creating gradient fills
class GradientTool {
  constructor() {
    this.name = 'gradient';
    this.isActive = false;
    this.startPoint = null;
    this.endPoint = null;
    this.gradientType = 'linear'; // 'linear' or 'radial'
    this.colors = ['#000000', '#ffffff'];
  }

  initialize() {
    this.isActive = false;
    this.startPoint = null;
    this.endPoint = null;
  }

  startDrawing(point) {
    this.startPoint = { x: point.x, y: point.y };
    this.endPoint = null;
    this.isActive = true;
  }

  updateDrawing(point) {
    if (!this.isActive || !this.startPoint) return;
    
    this.endPoint = { x: point.x, y: point.y };
    this.previewGradient();
  }

  finishDrawing(point) {
    if (!this.isActive || !this.startPoint) return;
    
    this.endPoint = { x: point.x, y: point.y };
    this.applyGradient();
    this.isActive = false;
    this.startPoint = null;
    this.endPoint = null;
  }

  previewGradient() {
    // Show preview of gradient being created
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      
      // Create gradient
      let gradient;
      if (this.gradientType === 'linear') {
        gradient = ctx.createLinearGradient(
          this.startPoint.x, this.startPoint.y,
          this.endPoint.x, this.endPoint.y
        );
      } else {
        const radius = Math.sqrt(
          Math.pow(this.endPoint.x - this.startPoint.x, 2) +
          Math.pow(this.endPoint.y - this.startPoint.y, 2)
        );
        gradient = ctx.createRadialGradient(
          this.startPoint.x, this.startPoint.y, 0,
          this.startPoint.x, this.startPoint.y, radius
        );
      }
      
      // Add color stops
      for (let i = 0; i < this.colors.length; i++) {
        gradient.addColorStop(i / (this.colors.length - 1), this.colors[i]);
      }
      
      // Draw preview line
      ctx.save();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(this.startPoint.x, this.startPoint.y);
      ctx.lineTo(this.endPoint.x, this.endPoint.y);
      ctx.stroke();
      ctx.restore();
    } catch (error) {
      console.warn('Gradient preview failed:', error);
    }
  }

  applyGradient() {
    try {
      // Create gradient definition for XVG system
      const gradientDef = {
        type: this.gradientType,
        start: this.startPoint,
        end: this.endPoint,
        colors: this.colors,
        id: 'gradient_' + Date.now()
      };
      
      // Apply to selected paths or create new gradient fill
      if (window.XVGSystem && window.XVGSystem.appState) {
        // Store gradient for use with next shape
        window.XVGSystem.appState.currentGradient = gradientDef;
        
        // Apply to selected paths if any
        if (window.XVGSystem.appState.selectedPaths && window.XVGSystem.appState.selectedPaths.length > 0) {
          window.XVGSystem.appState.selectedPaths.forEach(path => {
            if (path.style) {
              path.style.fill = gradientDef;
            }
          });
          
          // Re-render
          if (window.Engine && window.Engine.reRender) {
            window.Engine.reRender();
          }
        }
        
        console.log('Gradient created:', gradientDef);
      }
    } catch (error) {
      console.warn('Gradient application failed:', error);
    }
  }

  setGradientType(type) {
    this.gradientType = type;
  }

  setColors(colors) {
    this.colors = colors;
  }
}

// CutTool class for cutting selected items to clipboard
class CutTool {
  constructor() {
    this.name = 'cut';
    this.isActive = false;
  }

  initialize() {
    this.isActive = false;
  }

  startDrawing(point) {
    this.cutSelectedItems();
  }

  updateDrawing(point) {
    // No update needed for cut tool
  }

  finishDrawing() {
    // No finish action needed for cut tool
  }

  cutSelectedItems() {
    const s = window.XVGSystem;
    if (!s || !s.appState.selectedPaths || s.appState.selectedPaths.length === 0) {
      console.log('[Cut] No items selected to cut');
      return;
    }

    // Get selected items
    const selectedItems = s.appState.selectedPaths.map(index => s.appState.paths[index]).filter(item => item);
    
    if (selectedItems.length === 0) {
      console.log('[Cut] No valid items to cut');
      return;
    }

    // Store items in clipboard (simple implementation)
    if (!window.XVGClipboard) {
      window.XVGClipboard = [];
    }
    window.XVGClipboard = selectedItems.map(item => ({ ...item })); // Deep copy
    
    // Remove items using proper removePath function
    const selectedPathIds = [...s.appState.selectedPaths];
    selectedPathIds.forEach(pathId => {
      window.removePath(pathId);
    });
    
    // Clear selection
    s.appState.selectedPaths = [];
    
    console.log(`[Cut] Cut ${selectedItems.length} items to clipboard`);
    
    // Re-render canvas
    if (window.renderCanvas) {
      window.renderCanvas();
    }
  }
}

// PatternTool class for creating pattern fills
class PatternTool {
  constructor() {
    this.name = 'pattern';
    this.isActive = false;
    this.patternImage = null;
    this.patternType = 'repeat'; // 'repeat', 'repeat-x', 'repeat-y', 'no-repeat'
    this.scale = 1.0;
  }

  initialize() {
    this.isActive = false;
    this.patternImage = null;
  }

  startDrawing(point) {
    this.selectPattern();
  }

  updateDrawing(point) {
    // Preview pattern at current location
    if (this.patternImage) {
      this.previewPattern(point);
    }
  }

  finishDrawing(point) {
    if (this.patternImage) {
      this.applyPattern();
    }
  }

  selectPattern() {
    // Create file input for pattern selection
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        this.loadPatternImage(file);
      }
      document.body.removeChild(input);
    };
    
    document.body.appendChild(input);
    input.click();
  }

  loadPatternImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.patternImage = img;
        console.log('Pattern image loaded:', img.width + 'x' + img.height);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  previewPattern(point) {
    if (!this.patternImage) return;
    
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      
      // Create pattern
      const pattern = ctx.createPattern(this.patternImage, this.patternType);
      
      // Draw preview rectangle
      ctx.save();
      ctx.fillStyle = pattern;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(point.x - 25, point.y - 25, 50, 50);
      ctx.restore();
    } catch (error) {
      console.warn('Pattern preview failed:', error);
    }
  }

  applyPattern() {
    if (!this.patternImage) return;
    
    try {
      // Create pattern definition for XVG system
      const patternDef = {
        type: 'pattern',
        image: this.patternImage.src,
        repeat: this.patternType,
        scale: this.scale,
        id: 'pattern_' + Date.now()
      };
      
      // Apply to selected paths or store for next shape
      if (window.XVGSystem && window.XVGSystem.appState) {
        // Store pattern for use with next shape
        window.XVGSystem.appState.currentPattern = patternDef;
        
        // Apply to selected paths if any
        if (window.XVGSystem.appState.selectedPaths && window.XVGSystem.appState.selectedPaths.length > 0) {
          window.XVGSystem.appState.selectedPaths.forEach(path => {
            if (path.style) {
              path.style.fill = patternDef;
            }
          });
          
          // Re-render
          if (window.Engine && window.Engine.reRender) {
            window.Engine.reRender();
          }
        }
        
        console.log('Pattern created:', patternDef);
      }
    } catch (error) {
      console.warn('Pattern application failed:', error);
    }
  }

  setPatternType(type) {
    this.patternType = type;
  }

  setScale(scale) {
    this.scale = Math.max(0.1, Math.min(5.0, scale));
  }
}

// BlurTool class for applying blur effects
class BlurTool {
  constructor() {
    this.name = 'blur';
    this.isActive = false;
    this.blurRadius = 5;
    this.blurType = 'gaussian'; // 'gaussian', 'motion', 'radial'
  }

  initialize() {
    this.isActive = false;
  }

  startDrawing(point) {
    this.applyBlur();
  }

  updateDrawing(point) {
    // Could show blur preview
  }

  finishDrawing(point) {
    // Blur is applied immediately on start
  }

  applyBlur() {
    try {
      // Create blur effect definition
      const blurDef = {
        type: 'blur',
        radius: this.blurRadius,
        blurType: this.blurType,
        id: 'blur_' + Date.now()
      };
      
      // Apply to selected paths
      if (window.XVGSystem && window.XVGSystem.appState) {
        if (window.XVGSystem.appState.selectedPaths && window.XVGSystem.appState.selectedPaths.length > 0) {
          window.XVGSystem.appState.selectedPaths.forEach(path => {
            if (!path.effects) path.effects = [];
            path.effects.push(blurDef);
          });
          
          // Re-render with blur effect
          if (window.Engine && window.Engine.reRender) {
            window.Engine.reRender();
          }
          
          console.log('Blur effect applied:', blurDef);
        } else {
          console.log('No paths selected for blur effect');
        }
      }
    } catch (error) {
      console.warn('Blur application failed:', error);
    }
  }

  setBlurRadius(radius) {
    this.blurRadius = Math.max(0, Math.min(50, radius));
  }

  setBlurType(type) {
    this.blurType = type;
  }
}

// ShadowTool class for applying shadow effects
class ShadowTool {
  constructor() {
    this.name = 'shadow';
    this.isActive = false;
    this.shadowOffset = { x: 5, y: 5 };
    this.shadowBlur = 10;
    this.shadowColor = '#000000';
    this.shadowOpacity = 0.5;
  }

  initialize() {
    this.isActive = false;
  }

  startDrawing(point) {
    this.startPoint = { x: point.x, y: point.y };
    this.isActive = true;
  }

  updateDrawing(point) {
    if (!this.isActive || !this.startPoint) return;
    
    // Calculate shadow offset from drag
    this.shadowOffset = {
      x: point.x - this.startPoint.x,
      y: point.y - this.startPoint.y
    };
    
    this.previewShadow();
  }

  finishDrawing(point) {
    if (!this.isActive || !this.startPoint) return;
    
    this.shadowOffset = {
      x: point.x - this.startPoint.x,
      y: point.y - this.startPoint.y
    };
    
    this.applyShadow();
    this.isActive = false;
    this.startPoint = null;
  }

  previewShadow() {
    // Could show shadow preview on canvas
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      
      // Draw shadow preview
      ctx.save();
      ctx.shadowOffsetX = this.shadowOffset.x;
      ctx.shadowOffsetY = this.shadowOffset.y;
      ctx.shadowBlur = this.shadowBlur;
      ctx.shadowColor = this.shadowColor;
      ctx.globalAlpha = this.shadowOpacity;
      
      // Draw a preview rectangle
      ctx.fillStyle = '#cccccc';
      ctx.fillRect(this.startPoint.x - 10, this.startPoint.y - 10, 20, 20);
      
      ctx.restore();
    } catch (error) {
      console.warn('Shadow preview failed:', error);
    }
  }

  applyShadow() {
    try {
      // Create shadow effect definition
      const shadowDef = {
        type: 'shadow',
        offset: this.shadowOffset,
        blur: this.shadowBlur,
        color: this.shadowColor,
        opacity: this.shadowOpacity,
        id: 'shadow_' + Date.now()
      };
      
      // Apply to selected paths
      if (window.XVGSystem && window.XVGSystem.appState) {
        if (window.XVGSystem.appState.selectedPaths && window.XVGSystem.appState.selectedPaths.length > 0) {
          window.XVGSystem.appState.selectedPaths.forEach(path => {
            if (!path.effects) path.effects = [];
            path.effects.push(shadowDef);
          });
          
          // Re-render with shadow effect
          if (window.Engine && window.Engine.reRender) {
            window.Engine.reRender();
          }
          
          console.log('Shadow effect applied:', shadowDef);
        } else {
          console.log('No paths selected for shadow effect');
        }
      }
    } catch (error) {
      console.warn('Shadow application failed:', error);
    }
  }

  setShadowOffset(x, y) {
    this.shadowOffset = { x, y };
  }

  setShadowBlur(blur) {
    this.shadowBlur = Math.max(0, Math.min(50, blur));
  }

  setShadowColor(color) {
    this.shadowColor = color;
  }

  setShadowOpacity(opacity) {
    this.shadowOpacity = Math.max(0, Math.min(1, opacity));
  }
}

// PolygonTool class for drawing polygons
class PolygonTool {
  constructor() {
    this.name = 'polygon';
    this.isActive = false;
    this.points = [];
    this.sides = 6; // Default hexagon
    this.startPoint = null;
  }

  initialize() {
    this.isActive = false;
    this.points = [];
    this.startPoint = null;
  }

  startDrawing(point) {
    this.startPoint = this.screenToWorld(point);
    this.isActive = true;
    this.points = [this.startPoint];
  }

  updateDrawing(point) {
    if (!this.isActive || !this.startPoint) return;
    
    const currentPoint = this.screenToWorld(point);
    const radius = Math.sqrt(
      Math.pow(currentPoint.x - this.startPoint.x, 2) + 
      Math.pow(currentPoint.y - this.startPoint.y, 2)
    );
    
    // Generate polygon points
    this.points = this.generatePolygonPoints(this.startPoint, radius, this.sides);
    this.drawCurrentPolygon();
  }

  finishDrawing() {
    if (!this.isActive || this.points.length < 3) {
      this.isActive = false;
      return;
    }

    try {
      // Create polygon path using WASM
      if (window.xvg_wasm && window.xvg_wasm.XVGPath) {
        const path = new window.xvg_wasm.XVGPath();
        
        // Move to first point
        path.move_to(this.points[0].x, this.points[0].y);
        
        // Line to all other points
        for (let i = 1; i < this.points.length; i++) {
          path.line_to(this.points[i].x, this.points[i].y);
        }
        
        // Close the polygon
        path.close();
        
        const binaryData = path.to_binary();
        const pathObj = {
          binaryData: binaryData,
          style: window.XVGSystem?.state?.currentStyle || { stroke: '#000000', strokeWidth: 2, fill: 'none' },
          tf: [1, 0, 0, 1, 0, 0]
        };
        
        window.addPath(pathObj);
        window.renderCanvas();
      }
    } catch (error) {
      console.warn('Polygon creation failed:', error);
    }
    
    this.isActive = false;
    this.points = [];
  }

  generatePolygonPoints(center, radius, sides) {
    const points = [];
    const angleStep = (2 * Math.PI) / sides;
    
    for (let i = 0; i < sides; i++) {
      const angle = i * angleStep - Math.PI / 2; // Start from top
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      points.push({ x, y });
    }
    
    return points;
  }

  screenToWorld(point) {
    return { x: point.x, y: point.y };
  }

  drawCurrentPolygon() {
    if (this.points.length < 3) return;
    
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      
      // Clear previous preview
      window.renderCanvas();
      
      // Draw polygon preview
      ctx.save();
      ctx.strokeStyle = '#0066cc';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      
      ctx.beginPath();
      ctx.moveTo(this.points[0].x, this.points[0].y);
      
      for (let i = 1; i < this.points.length; i++) {
        ctx.lineTo(this.points[i].x, this.points[i].y);
      }
      
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    } catch (error) {
      console.warn('Polygon preview failed:', error);
    }
  }

  setSides(sides) {
    this.sides = Math.max(3, Math.min(20, sides));
  }
}

// TriangleTool class for drawing triangles
class TriangleTool {
  constructor() {
    this.name = 'triangle';
    this.isActive = false;
    this.startPoint = null;
    this.currentPoint = null;
  }

  initialize() {
    this.isActive = false;
    this.startPoint = null;
    this.currentPoint = null;
  }

  startDrawing(point) {
    this.startPoint = this.screenToWorld(point);
    this.isActive = true;
  }

  updateDrawing(point) {
    if (!this.isActive || !this.startPoint) return;
    
    this.currentPoint = this.screenToWorld(point);
    this.drawCurrentTriangle();
  }

  finishDrawing() {
    if (!this.isActive || !this.startPoint || !this.currentPoint) {
      this.isActive = false;
      return;
    }

    try {
      // Calculate triangle points (equilateral triangle)
      const points = this.calculateTrianglePoints(this.startPoint, this.currentPoint);
      
      // Create triangle path using WASM
      if (window.xvg_wasm && window.xvg_wasm.XVGPath) {
        const path = new window.xvg_wasm.XVGPath();
        
        // Move to first point
        path.move_to(points[0].x, points[0].y);
        
        // Line to other points
        path.line_to(points[1].x, points[1].y);
        path.line_to(points[2].x, points[2].y);
        
        // Close the triangle
        path.close();
        
        const binaryData = path.to_binary();
        const pathObj = {
          binaryData: binaryData,
          style: window.XVGSystem?.state?.currentStyle || { stroke: '#000000', strokeWidth: 2, fill: 'none' },
          tf: [1, 0, 0, 1, 0, 0]
        };
        
        window.addPath(pathObj);
        window.renderCanvas();
      }
    } catch (error) {
      console.warn('Triangle creation failed:', error);
    }
    
    this.isActive = false;
    this.startPoint = null;
    this.currentPoint = null;
  }

  calculateTrianglePoints(start, end) {
    // Create equilateral triangle with base from start to end
    const baseLength = Math.sqrt(
      Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
    );
    
    // Calculate the third point (apex)
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    
    // Height of equilateral triangle
    const height = (baseLength * Math.sqrt(3)) / 2;
    
    // Perpendicular direction
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const perpX = -dy / baseLength;
    const perpY = dx / baseLength;
    
    const apex = {
      x: midX + perpX * height,
      y: midY + perpY * height
    };
    
    return [start, end, apex];
  }

  screenToWorld(point) {
    return { x: point.x, y: point.y };
  }

  drawCurrentTriangle() {
    if (!this.startPoint || !this.currentPoint) return;
    
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      
      // Clear previous preview
      window.renderCanvas();
      
      // Calculate triangle points
      const points = this.calculateTrianglePoints(this.startPoint, this.currentPoint);
      
      // Draw triangle preview
      ctx.save();
      ctx.strokeStyle = '#0066cc';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.lineTo(points[2].x, points[2].y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    } catch (error) {
      console.warn('Triangle preview failed:', error);
    }
  }
}

   // Global eraser controls
window.setEraserRadius = function(radius) {
  if (window.XVGSystem?.tools?.eraser) {
    window.XVGSystem.tools.eraser.setRadius(radius);
    console.log('[Eraser] Radius set to:', radius);
    
    // Update UI display
    const radiusValue = document.getElementById('eraser-radius-value');
    if (radiusValue) {
      radiusValue.textContent = radius + 'px';
    }
  }
};

window.getEraserRadius = function() {
  if (window.XVGSystem?.tools?.eraser) {
    return window.XVGSystem.tools.eraser.getRadius();
  }
  return 20; // Default radius
};



// Tool status function
window.getCurrentTool = function() {
  return window.XVGSystem?.appState?.currentTool || 'select';
};

// Tool switching function
window.setTool = function(toolName) {
  if (!window.XVGSystem || !window.XVGSystem.appState) {
    console.warn('[setTool] XVGSystem not available');
    return false;
  }

  // Deactivate current tool
  const currentTool = window.XVGSystem.appState.currentTool;
  if (currentTool && window.XVGSystem.tools[currentTool] &&
      typeof window.XVGSystem.tools[currentTool].deactivate === 'function') {
    window.XVGSystem.tools[currentTool].deactivate();
  }

  // Activate new tool
  window.XVGSystem.appState.currentTool = toolName;
  console.log(`[setTool] Switched to ${toolName}`);

  // Update UI to reflect active tool
  const toolButtons = document.querySelectorAll('.toolbar-btn[id$="-tool"]');
  toolButtons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.id === `${toolName}-tool`) {
      btn.classList.add('active');
    }
  });

  // Show/hide eraser size control
  const eraserControl = document.getElementById('eraser-size-control');
  if (eraserControl) {
    eraserControl.style.display = toolName === 'eraser' ? 'grid' : 'none';
  }

  // Mark as modified if switching tools
  if (window.markAsModified) {
    window.markAsModified();
  }

  return true;
};

// Test function for eraser tool
window.testEraserTool = function() {
  console.log('[EraserTest] Testing eraser tool functionality...');

  // Check if eraser tool exists
  if (!window.XVGSystem?.tools?.eraser) {
    console.error('[EraserTest] Eraser tool not found');
    return false;
  }

  const eraser = window.XVGSystem.tools.eraser;
  console.log('[EraserTest] Eraser tool exists');

  // Test basic properties
  console.log('[EraserTest] Radius:', eraser.getRadius());
  console.log('[EraserTest] Is erasing:', eraser.isErasing);

  // Test radius setting
  eraser.setRadius(30);
  console.log('[EraserTest] After setting radius to 30:', eraser.getRadius());

  // Test coordinate conversion
  const screenPoint = { x: 150, y: 150 };
  const worldPoint = eraser.screenToWorld(screenPoint);
  console.log('[EraserTest] Screen point (150,150) -> World point:', worldPoint);

  // Test path bounds calculation
  const testPath = {
    id: 'test-path',
    type: 'path',
    data: 'M 100 100 L 200 100 L 200 200 L 100 200 Z',
    x: 100,
    y: 100,
    w: 100,
    h: 100
  };

  const bounds = eraser.getPathBounds(testPath);
  console.log('[EraserTest] Test path bounds:', bounds);

  // Test eraser bounds with world coordinates
  const eraserBounds = eraser.getEraserBounds(worldPoint);
  console.log('[EraserTest] Eraser bounds at world point:', eraserBounds);

  // Test intersection detection
  const intersects = eraser.shouldPartiallyErasePath(testPath, worldPoint);
  console.log('[EraserTest] Path intersects with eraser:', intersects);

  const completelyCovers = eraser.shouldErasePath(testPath, worldPoint);
  console.log('[EraserTest] Eraser completely covers path:', completelyCovers);

  console.log('[EraserTest] Eraser tool test completed');
  return true;
};

// Create test paths for eraser testing
window.createTestPaths = function() {
  console.log('[TestPaths] Creating test paths for eraser testing...');

  if (!window.XVGSystem?.appState) {
    console.error('[TestPaths] XVGSystem not available');
    return;
  }

  const paths = [
    {
      id: crypto.randomUUID(),
      type: 'path',
      data: 'M 200 200 L 300 200 L 300 300 L 200 300 Z',
      style: {
        fill: { color: [1, 0, 0, 0.5], rule: 'NonZero' },
        stroke: { color: [1, 0, 0, 1], width: 2 }
      },
      x: 200, y: 200, w: 100, h: 100,
      visible: true, locked: false,
      layerIndex: 0
    },
    {
      id: crypto.randomUUID(),
      type: 'path',
      data: 'M 400 200 L 500 200 L 500 300 L 400 300 Z',
      style: {
        fill: { color: [0, 1, 0, 0.5], rule: 'NonZero' },
        stroke: { color: [0, 1, 0, 1], width: 2 }
      },
      x: 400, y: 200, w: 100, h: 100,
      visible: true, locked: false,
      layerIndex: 0
    },
    {
      id: crypto.randomUUID(),
      type: 'path',
      data: 'M 300 400 L 400 400 L 400 500 L 300 500 Z',
      style: {
        fill: { color: [0, 0, 1, 0.5], rule: 'NonZero' },
        stroke: { color: [0, 0, 1, 1], width: 2 }
      },
      x: 300, y: 400, w: 100, h: 100,
      visible: true, locked: false,
      layerIndex: 0
    }
  ];

  paths.forEach(path => {
    if (window.addPath) {
      window.addPath(path);
    } else {
      window.XVGSystem.appState.paths.push(path);
    }
  });

  console.log(`[TestPaths] Created ${paths.length} test paths`);
  console.log('[TestPaths] Red square at (200,200), Green at (400,200), Blue at (300,400)');

  // Refresh canvas
  if (window.renderCanvas) {
    window.renderCanvas();
  }

  return paths.length;
};
