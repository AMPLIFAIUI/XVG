// FILE: pkg/xvg-tools-restored.js - Complete Tool Implementations with Proper Coordinate Transformation
// This file restores the original tool functionality while maintaining the new modular ES6 structure

// Import necessary dependencies
import { notify } from './xvg-utilities.js';

// ============================================================================
// PAN TOOL - Canvas Navigation and Viewport Control
// ============================================================================

export class PanTool {
  constructor(coreInstance) {
    this.core = coreInstance;
    this.isPanning = false;
    this.lastPanPoint = null;
    this.panStartTransform = null;
    this.isRightClickPan = false;
    
    // Pan configuration
    this.baseSensitivity = 1.0;
    this.panVelocity = { x: 0, y: 0 };
    this.panDecay = 0.95;
  }
  
  initialize() {
    this.isPanning = false;
    this.lastPanPoint = null;
    this.panStartTransform = null;
    this.isRightClickPan = false;
    this.panVelocity = { x: 0, y: 0 };
  }
  
  startPan(screenPoint, isRightClick = false) {
    if (!this.core) return;
    
    this.isPanning = true;
    this.isRightClickPan = isRightClick;
    this.lastPanPoint = screenPoint;
    this.panStartTransform = { ...this.core.state.appState.canvasTransform };
    this.panVelocity = { x: 0, y: 0 };
  }
  
  updatePan(screenPoint) {
    if (!this.isPanning || !this.lastPanPoint || !this.core) return;
    
    const deltaX = screenPoint.x - this.lastPanPoint.x;
    const deltaY = screenPoint.y - this.lastPanPoint.y;
    
    const currentZoom = this.core.state.appState.canvasTransform.zoom || 1;
    const dynamicSensitivity = this.baseSensitivity / currentZoom;
    
    this.core.state.appState.canvasTransform.pan_x += deltaX * dynamicSensitivity;
    this.core.state.appState.canvasTransform.pan_y += deltaY * dynamicSensitivity;
    
    this.panVelocity.x = deltaX * 0.1;
    this.panVelocity.y = deltaY * 0.1;
    
    this.lastPanPoint = screenPoint;
    this.core.renderCanvas();
  }
  
  finishPan() {
    this.isPanning = false;
    this.lastPanPoint = null;
    this.panStartTransform = null;
  }
}

// ============================================================================
// SELECTION TOOL - Object Selection, Movement, and Resize Operations
// ============================================================================

export class SelectionTool {
  constructor(coreInstance) {
    this.core = coreInstance;
    
    // Selection state
    this.isBoxSelecting = false;
    this.boxSelectionStart = null;
    this.boxSelectionEnd = null;
    
    // Resize state
    this.isResizing = false;
    this.resizeHandle = null;
    this.resizeStartPoint = null;
    this.resizeStartBounds = null;
    this.initialPaths = null;
    
    // Drag state
    this.isDragging = false;
    this.dragStartPoint = null;
    this.initialSelectionPos = null;
    this.hasStartedDrag = false;
    
    // Pan state (for right-click)
    this.isPanning = false;
    this.lastPanPoint = null;
    this.panStartTransform = null;
    
    // Visual properties
    this.selectionColor = '#0066ff';
    this.selectionWidth = 2;
    this.baseHandleSize = 8;
    this.handleColor = '#ffffff';
    this.handleBorderColor = '#0066ff';
    this.baseHitTolerance = 5;
    this.baseDragThreshold = 3;
  }
  
  initialize() {
    this.isBoxSelecting = false;
    this.boxSelectionStart = null;
    this.boxSelectionEnd = null;
    this.isResizing = false;
    this.resizeHandle = null;
    this.resizeStartPoint = null;
    this.resizeStartBounds = null;
    this.initialPaths = null;
    this.isDragging = false;
    this.dragStartPoint = null;
    this.initialSelectionPos = null;
    this.hasStartedDrag = false;
    this.isPanning = false;
    this.lastPanPoint = null;
    this.panStartTransform = null;
  }
  
  // ============================================================================
  // COORDINATE TRANSFORMATION HELPERS
  // ============================================================================
  
  /**
   * Convert screen coordinates to world (canvas) coordinates
   * Uses the XVGUtils.toWorld function for consistency
   */
  screenToWorld(screenX, screenY) {
    if (window.XVGUtils && window.XVGUtils.toWorld) {
      return window.XVGUtils.toWorld(screenX, screenY);
    }
    
    // Fallback
    const transform = this.core.state.appState.canvasTransform;
    return {
      x: (screenX - transform.pan_x) / transform.zoom,
      y: (screenY - transform.pan_y) / transform.zoom
    };
  }
  
  /**
   * Convert world (canvas) coordinates to screen coordinates
   * Uses the XVGUtils.toScreen function for consistency
   */
  worldToScreen(worldX, worldY) {
    if (window.XVGUtils && window.XVGUtils.toScreen) {
      return window.XVGUtils.toScreen(worldX, worldY);
    }
    
    // Fallback
    const transform = this.core.state.appState.canvasTransform;
    return {
      x: worldX * transform.zoom + transform.pan_x,
      y: worldY * transform.zoom + transform.pan_y
    };
  }
  
  /**
   * Calculate dynamic handle size based on zoom level
   */
  calculateDynamicHandleSize(zoomLevel = 1) {
    if (window.XVGUtils && window.XVGUtils.handleSize) {
      return window.XVGUtils.handleSize();
    }
    
    const deviceRatio = window.devicePixelRatio || 1;
    const sqrtZoom = Math.sqrt(zoomLevel);
    return Math.max(6, Math.min(20, (this.baseHandleSize * deviceRatio) / sqrtZoom));
  }
  
  /**
   * Calculate dynamic hit tolerance based on zoom level
   */
  calculateDynamicHitTolerance(zoomLevel = 1) {
    if (window.XVGUtils && window.XVGUtils.hitTolerance) {
      return window.XVGUtils.hitTolerance();
    }
    
    const deviceRatio = window.devicePixelRatio || 1;
    const dynamicTolerance = (this.baseHitTolerance * deviceRatio) / zoomLevel;
    return Math.max(3, Math.min(15, dynamicTolerance));
  }
  
  // ============================================================================
  // SELECTION LOGIC
  // ============================================================================
  
  startSelection(screenPoint, isRightClick = false) {
    if (!this.core) return;
    
    if (isRightClick) {
      this.startPan(screenPoint);
      return;
    }
    
    const worldPoint = this.screenToWorld(screenPoint.x, screenPoint.y);
    const selectedPaths = this.getSelectedPaths();
    const selectedImages = this.getSelectedImages();
    const hasSelection = selectedPaths.length > 0 || selectedImages.length > 0;
    
    // Check if clicking on a resize handle
    if (hasSelection) {
      const bounds = this.calculateCombinedBounds();
      if (bounds) {
        const handle = this.getResizeHandleAt(worldPoint, bounds);
        if (handle) {
          this.isResizing = true;
          this.resizeHandle = handle;
          this.resizeStartPoint = worldPoint;
          this.resizeStartBounds = bounds;
          this.initialPaths = selectedPaths.map(p => ({ ...p, data: p.data ? [...p.data] : [] }));
          this.initialImages = selectedImages.map(img => ({ ...img }));
          return;
        }
      }
      
      // Check if clicking on a selected object (for dragging)
      const hitPathIndex = this.findPathAtPoint(worldPoint.x, worldPoint.y);
      const hitImageIndex = this.findImageAtPoint(worldPoint.x, worldPoint.y);
      
      if ((hitPathIndex !== -1 && this.core.state.appState.selectedPaths.includes(hitPathIndex)) ||
          (hitImageIndex !== -1 && this.core.state.appState.selectedImages.includes(hitImageIndex))) {
        this.isDragging = true;
        this.dragStartPoint = worldPoint;
        this.initialSelectionPos = selectedPaths.map(p => this.getPathPosition(p));
        this.hasStartedDrag = false;
        return;
      }
    }
    
    // Start box selection or single-click selection
    this.isBoxSelecting = true;
    this.boxSelectionStart = worldPoint;
    this.boxSelectionEnd = worldPoint;
  }
  
  updateSelection(screenPoint) {
    if (this.isPanning) {
      this.updatePan(screenPoint);
      return;
    }
    
    const worldPoint = this.screenToWorld(screenPoint.x, screenPoint.y);
    
    if (this.isResizing && this.resizeStartPoint && this.resizeStartBounds && this.initialPaths) {
      this.handleResize(worldPoint, this.resizeHandle, this.resizeStartBounds, this.initialPaths);
      this.core.renderCanvas();
      return;
    }
    
    if (this.isDragging && this.dragStartPoint) {
      const dx = worldPoint.x - this.dragStartPoint.x;
      const dy = worldPoint.y - this.dragStartPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (!this.hasStartedDrag && distance > this.baseDragThreshold) {
        this.hasStartedDrag = true;
      }
      
      if (this.hasStartedDrag) {
        this.moveSelectedPaths(dx, dy);
        this.moveSelectedImages(dx, dy);
        this.core.renderCanvas();
      }
      return;
    }
    
    if (this.isBoxSelecting && this.boxSelectionStart) {
      this.boxSelectionEnd = worldPoint;
      this.drawSelectionBox();
    }
  }
  
  finishSelection(screenPoint) {
    if (this.isPanning) {
      this.finishPan();
      return;
    }
    
    if (this.isResizing) {
      this.isResizing = false;
      this.resizeHandle = null;
      this.resizeStartPoint = null;
      this.resizeStartBounds = null;
      this.initialPaths = null;
      this.core.renderCanvas();
      return;
    }
    
    if (this.isDragging) {
      this.isDragging = false;
      this.dragStartPoint = null;
      this.initialSelectionPos = null;
      this.hasStartedDrag = false;
      this.core.renderCanvas();
      return;
    }
    
    if (this.isBoxSelecting) {
      const worldPoint = this.screenToWorld(screenPoint.x, screenPoint.y);
      const dx = worldPoint.x - this.boxSelectionStart.x;
      const dy = worldPoint.y - this.boxSelectionStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < 5) {
        // Single-click selection
        const hitImageIndex = this.findImageAtPoint(worldPoint.x, worldPoint.y);
        if (hitImageIndex !== -1) {
          this.core.state.appState.selectedImages = [hitImageIndex];
          this.core.state.appState.selectedPaths = [];
        } else {
          const hitPathIndex = this.findPathAtPoint(worldPoint.x, worldPoint.y);
          if (hitPathIndex !== -1) {
            this.core.state.appState.selectedPaths = [hitPathIndex];
            this.core.state.appState.selectedImages = [];
          } else {
            this.core.state.appState.selectedPaths = [];
            this.core.state.appState.selectedImages = [];
          }
        }
      } else {
        // Box selection
        this.performBoxSelection();
      }
      
      this.isBoxSelecting = false;
      this.boxSelectionStart = null;
      this.boxSelectionEnd = null;
      this.clearSelectionBox();
      this.core.renderCanvas();
    }
  }
  
  // ============================================================================
  // PAN LOGIC (for right-click)
  // ============================================================================
  
  startPan(screenPoint) {
    this.isPanning = true;
    this.lastPanPoint = screenPoint;
    this.panStartTransform = { ...this.core.state.appState.canvasTransform };
  }
  
  updatePan(screenPoint) {
    if (!this.isPanning || !this.lastPanPoint || !this.core) return;
    
    const dx = screenPoint.x - this.lastPanPoint.x;
    const dy = screenPoint.y - this.lastPanPoint.y;
    const t = this.core.state.appState.canvasTransform;
    t.pan_x += dx;
    t.pan_y += dy;
    this.lastPanPoint = screenPoint;
    this.core.renderCanvas();
  }
  
  finishPan() {
    this.isPanning = false;
    this.lastPanPoint = null;
    this.panStartTransform = null;
  }
  
  // ============================================================================
  // HELPER METHODS
  // ============================================================================
  
  getSelectedPaths() {
    const s = this.core.state;
    if (!s?.appState?.selectedPaths) return [];
    return s.appState.selectedPaths.map(index => s.appState.paths[index]).filter(path => path);
  }
  
  getSelectedImages() {
    const s = this.core.state;
    if (!s?.appState?.selectedImages || !s?.appState?.images) return [];
    return s.appState.selectedImages.map(index => s.appState.images[index]).filter(img => img);
  }
  
  findImageAtPoint(worldX, worldY) {
    const images = this.core.state.appState.images;
    if (!images || !Array.isArray(images)) return -1;
    
    // Check from top to bottom (reverse order for z-index)
    for (let i = images.length - 1; i >= 0; i--) {
      const img = images[i];
      if (!img.visible) continue;
      
      // Simple bounding box check
      if (worldX >= img.x && worldX <= img.x + img.width &&
          worldY >= img.y && worldY <= img.y + img.height) {
        return i;
      }
    }
    
    return -1;
  }
  
  moveSelectedImages(dx, dy) {
    const s = this.core.state.appState;
    if (!s.selectedImages || s.selectedImages.length === 0) return;
    
    s.selectedImages.forEach(index => {
      const img = s.images[index];
      if (img && !img.locked) {
        img.x += dx;
        img.y += dy;
      }
    });
  }
  
  calculateCombinedBounds() {
    const pathBounds = this.calculateBounds(this.getSelectedPaths());
    const imageBounds = this.calculateImageBounds(this.getSelectedImages());
    
    if (!pathBounds && !imageBounds) return null;
    if (!pathBounds) return imageBounds;
    if (!imageBounds) return pathBounds;
    
    return {
      minX: Math.min(pathBounds.minX, imageBounds.minX),
      minY: Math.min(pathBounds.minY, imageBounds.minY),
      maxX: Math.max(pathBounds.maxX, imageBounds.maxX),
      maxY: Math.max(pathBounds.maxY, imageBounds.maxY)
    };
  }
  
  calculateImageBounds(selectedImages) {
    if (!selectedImages || selectedImages.length === 0) return null;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    selectedImages.forEach(img => {
      if (img) {
        minX = Math.min(minX, img.x);
        minY = Math.min(minY, img.y);
        maxX = Math.max(maxX, img.x + img.width);
        maxY = Math.max(maxY, img.y + img.height);
      }
    });
    
    if (minX === Infinity) return null;
    
    return { minX, minY, maxX, maxY };
  }
  
  findPathAtPoint(worldX, worldY) {
    const paths = this.core.state.appState.paths;
    if (!paths || !Array.isArray(paths)) return -1;
    
    const tolerance = this.calculateDynamicHitTolerance(this.core.state.appState.canvasTransform.zoom);
    
    for (let i = paths.length - 1; i >= 0; i--) {
      const path = paths[i];
      if (this.isPointInPath({ x: worldX, y: worldY }, path, tolerance)) {
        return i;
      }
    }
    
    return -1;
  }
  
  isPointInPath(worldPoint, path, tolerance = 5) {
    if (!path || !path.data) return false;
    
    const bounds = this.calculateBounds([path]);
    if (!bounds) return false;
    
    // Expand bounds by tolerance
    if (worldPoint.x < bounds.minX - tolerance || worldPoint.x > bounds.maxX + tolerance ||
        worldPoint.y < bounds.minY - tolerance || worldPoint.y > bounds.maxY + tolerance) {
      return false;
    }
    
    return true;
  }
  
  getPathPosition(path) {
    if (!path || !path.data || path.data.length < 2) return { x: 0, y: 0 };
    return { x: path.data[0], y: path.data[1] };
  }
  
  moveSelectedPaths(dx, dy) {
    const s = this.core.state;
    if (!s?.appState?.selectedPaths || !s?.appState?.paths) return;
    
    s.appState.selectedPaths.forEach(index => {
      const path = s.appState.paths[index];
      if (path && path.data && Array.isArray(path.data)) {
        for (let i = 0; i < path.data.length; i += 2) {
          if (i + 1 < path.data.length) {
            path.data[i] += dx;
            path.data[i + 1] += dy;
          }
        }
      }
    });
  }
  
  performBoxSelection() {
    const s = this.core.state;
    if (!this.boxSelectionStart || !this.boxSelectionEnd) return;
    
    const minX = Math.min(this.boxSelectionStart.x, this.boxSelectionEnd.x);
    const minY = Math.min(this.boxSelectionStart.y, this.boxSelectionEnd.y);
    const maxX = Math.max(this.boxSelectionStart.x, this.boxSelectionEnd.x);
    const maxY = Math.max(this.boxSelectionStart.y, this.boxSelectionEnd.y);
    
    const selectedIndices = [];
    
    for (let i = 0; i < s.appState.paths.length; i++) {
      const path = s.appState.paths[i];
      const bounds = this.calculateBounds([path]);
      
      if (bounds && this.boundsIntersect(bounds, { minX, minY, maxX, maxY })) {
        selectedIndices.push(i);
      }
    }
    
    s.appState.selectedPaths = selectedIndices;
    s.appState.selectedImages = [];
  }
  
  boundsIntersect(bounds1, bounds2) {
    return !(bounds1.maxX < bounds2.minX || bounds1.minX > bounds2.maxX ||
             bounds1.maxY < bounds2.minY || bounds1.minY > bounds2.maxY);
  }
  
  // ============================================================================
  // BOUNDS CALCULATION
  // ============================================================================
  
  calculateBounds(selectedPaths) {
    if (!selectedPaths || selectedPaths.length === 0) return null;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    selectedPaths.forEach(path => {
      if (!path || !path.data || path.data.length < 2) return;
      
      // Simple bounds calculation from data array
      for (let i = 0; i < path.data.length; i += 2) {
        if (i + 1 < path.data.length) {
          const x = path.data[i];
          const y = path.data[i + 1];
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    });
    
    if (minX === Infinity) return null;
    
    return { minX, minY, maxX, maxY };
  }
  
  // ============================================================================
  // RESIZE LOGIC
  // ============================================================================
  
  getResizeHandleAt(worldPoint, bounds) {
    const handleSize = this.calculateDynamicHandleSize(this.core.state.appState.canvasTransform.zoom);
    const tolerance = handleSize / this.core.state.appState.canvasTransform.zoom;
    
    const handles = [
      { x: bounds.minX, y: bounds.minY, type: 'top-left' },
      { x: bounds.maxX, y: bounds.minY, type: 'top-right' },
      { x: bounds.maxX, y: bounds.maxY, type: 'bottom-right' },
      { x: bounds.minX, y: bounds.maxY, type: 'bottom-left' },
      { x: (bounds.minX + bounds.maxX) / 2, y: bounds.minY, type: 'top' },
      { x: bounds.maxX, y: (bounds.minY + bounds.maxY) / 2, type: 'right' },
      { x: (bounds.minX + bounds.maxX) / 2, y: bounds.maxY, type: 'bottom' },
      { x: bounds.minX, y: (bounds.minY + bounds.maxY) / 2, type: 'left' }
    ];
    
    for (const handle of handles) {
      const dx = worldPoint.x - handle.x;
      const dy = worldPoint.y - handle.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= tolerance) {
        return handle.type;
      }
    }
    
    return null;
  }
  
  handleResize(currentPoint, handleType, initialBounds, initialPaths) {
    const newBounds = this.calculateNewBounds(currentPoint, handleType, initialBounds);
    
    const originalWidth = initialBounds.maxX - initialBounds.minX;
    const originalHeight = initialBounds.maxY - initialBounds.minY;
    const newWidth = newBounds.maxX - newBounds.minX;
    const newHeight = newBounds.maxY - newBounds.minY;
    
    if (originalWidth === 0 || originalHeight === 0) return;
    
    const scaleX = newWidth / originalWidth;
    const scaleY = newHeight / originalHeight;
    
    const s = this.core.state;
    
    // Resize paths
    s.appState.selectedPaths.forEach((index, i) => {
      const path = s.appState.paths[index];
      const initialPath = initialPaths[i];
      
      if (path && initialPath && path.data && initialPath.data) {
        for (let j = 0; j < path.data.length; j += 2) {
          if (j + 1 < path.data.length) {
            const relX = initialPath.data[j] - initialBounds.minX;
            const relY = initialPath.data[j + 1] - initialBounds.minY;
            path.data[j] = newBounds.minX + relX * scaleX;
            path.data[j + 1] = newBounds.minY + relY * scaleY;
          }
        }
      }
    });
    
    // Resize images
    if (this.initialImages && s.appState.selectedImages) {
      s.appState.selectedImages.forEach((index, i) => {
        const img = s.appState.images[index];
        const initialImg = this.initialImages[i];
        
        if (img && initialImg) {
          const relX = initialImg.x - initialBounds.minX;
          const relY = initialImg.y - initialBounds.minY;
          
          img.x = newBounds.minX + relX * scaleX;
          img.y = newBounds.minY + relY * scaleY;
          img.width = initialImg.width * scaleX;
          img.height = initialImg.height * scaleY;
        }
      });
    }
  }
  
  calculateNewBounds(currentPoint, handleType, initialBounds) {
    let { minX, minY, maxX, maxY } = initialBounds;
    
    switch (handleType) {
      case 'top-left':
        minX = currentPoint.x;
        minY = currentPoint.y;
        break;
      case 'top-right':
        maxX = currentPoint.x;
        minY = currentPoint.y;
        break;
      case 'bottom-right':
        maxX = currentPoint.x;
        maxY = currentPoint.y;
        break;
      case 'bottom-left':
        minX = currentPoint.x;
        maxY = currentPoint.y;
        break;
      case 'top':
        minY = currentPoint.y;
        break;
      case 'right':
        maxX = currentPoint.x;
        break;
      case 'bottom':
        maxY = currentPoint.y;
        break;
      case 'left':
        minX = currentPoint.x;
        break;
    }
    
    return { minX, minY, maxX, maxY };
  }
  
  // ============================================================================
  // DRAWING METHODS
  // ============================================================================
  
  drawSelectionBox() {
    // This will be called by the overlay rendering system
    // Implementation depends on how the overlay canvas is set up
  }
  
  clearSelectionBox() {
    // This will be called by the overlay rendering system
  }
  
  drawResizeHandles(ctx, bounds) {
    if (!bounds) return;
    
    const handleSize = this.calculateDynamicHandleSize(this.core.state.appState.canvasTransform.zoom);
    const halfHandle = handleSize / 2;
    
    const handles = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY },
      { x: (bounds.minX + bounds.maxX) / 2, y: bounds.minY },
      { x: bounds.maxX, y: (bounds.minY + bounds.maxY) / 2 },
      { x: (bounds.minX + bounds.maxX) / 2, y: bounds.maxY },
      { x: bounds.minX, y: (bounds.minY + bounds.maxY) / 2 }
    ];
    
    ctx.fillStyle = this.handleColor;
    ctx.strokeStyle = this.handleBorderColor;
    ctx.lineWidth = 1;
    
    handles.forEach(handle => {
      const screenPos = this.worldToScreen(handle.x, handle.y);
      ctx.fillRect(screenPos.x - halfHandle, screenPos.y - halfHandle, handleSize, handleSize);
      ctx.strokeRect(screenPos.x - halfHandle, screenPos.y - halfHandle, handleSize, handleSize);
    });
  }
}

// ============================================================================
// TOOL INITIALIZATION
// ============================================================================

export function initializeTools(coreInstance) {
  coreInstance.state.tools.pan = new PanTool(coreInstance);
  coreInstance.state.tools.selection = new SelectionTool(coreInstance);
  coreInstance.state.tools.image = new ImageTool(coreInstance);
  
  notify('info', 'Tools restored and initialized with complete functionality including image support.');
}

// ============================================================================
// IMAGE TOOL - Image Placement, Selection, and Transformation
// ============================================================================

export class ImageTool {
  constructor(coreInstance) {
    this.core = coreInstance;
    this.defaultImagePosition = { x: 100, y: 100 };
  }
  
  /**
   * Add an image to the canvas
   * @param {HTMLImageElement} img - The loaded image element
   * @param {string} filename - Original filename
   */
  addImageToCanvas(img, filename = 'image.png') {
    if (!this.core || !this.core.state || !this.core.state.appState) {
      console.error('[ImageTool] Core or appState not available');
      return;
    }
    
    const s = this.core.state.appState;
    
    // Initialize images array if it doesn't exist
    if (!s.images) {
      s.images = [];
    }
    
    // Calculate placement position
    // If there are existing images, offset the new one slightly
    const offset = s.images.length * 20;
    const x = this.defaultImagePosition.x + offset;
    const y = this.defaultImagePosition.y + offset;
    
    // Create image data object
    const imageData = {
      id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      src: img.src, // Data URL
      filename: filename,
      x: x,
      y: y,
      width: img.width,
      height: img.height,
      originalWidth: img.width,
      originalHeight: img.height,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      layer: s.activeLayer || 0,
      zIndex: s.images.length
    };
    
    console.log('[ImageTool] Adding image to canvas:', {
      id: imageData.id,
      filename: imageData.filename,
      position: { x: imageData.x, y: imageData.y },
      size: { width: imageData.width, height: imageData.height },
      layer: imageData.layer,
      totalImages: s.images.length + 1
    });
    
    // Add to images array
    s.images.push(imageData);
    
    // Clear path selection and select this image
    s.selectedPaths = [];
    s.selectedImages = [s.images.length - 1];
    
    // Mark as modified
    s.isModified = true;
    
    // Render the canvas
    if (this.core.renderCanvas) {
      this.core.renderCanvas();
    }
    
    console.log('[ImageTool] Image added successfully. Total images:', s.images.length);
  }
  
  /**
   * Get the image at a specific world coordinate
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {number} Index of the image, or -1 if not found
   */
  getImageAt(worldX, worldY) {
    const s = this.core.state.appState;
    if (!s.images || s.images.length === 0) return -1;
    
    // Check from top to bottom (reverse order for z-index)
    for (let i = s.images.length - 1; i >= 0; i--) {
      const img = s.images[i];
      if (!img.visible) continue;
      
      // Simple bounding box check
      if (worldX >= img.x && worldX <= img.x + img.width &&
          worldY >= img.y && worldY <= img.y + img.height) {
        return i;
      }
    }
    
    return -1;
  }
  
  /**
   * Move selected images by a delta
   * @param {number} dx - Delta X
   * @param {number} dy - Delta Y
   */
  moveSelectedImages(dx, dy) {
    const s = this.core.state.appState;
    if (!s.selectedImages || s.selectedImages.length === 0) return;
    
    s.selectedImages.forEach(index => {
      const img = s.images[index];
      if (img && !img.locked) {
        img.x += dx;
        img.y += dy;
      }
    });
    
    s.isModified = true;
  }
  
  /**
   * Resize selected images
   * @param {object} newBounds - New bounding box { minX, minY, maxX, maxY }
   * @param {object} originalBounds - Original bounding box
   */
  resizeSelectedImages(newBounds, originalBounds) {
    const s = this.core.state.appState;
    if (!s.selectedImages || s.selectedImages.length === 0) return;
    
    const scaleX = (newBounds.maxX - newBounds.minX) / (originalBounds.maxX - originalBounds.minX);
    const scaleY = (newBounds.maxY - newBounds.minY) / (originalBounds.maxY - originalBounds.minY);
    
    s.selectedImages.forEach(index => {
      const img = s.images[index];
      if (img && !img.locked) {
        // Calculate relative position within original bounds
        const relX = img.x - originalBounds.minX;
        const relY = img.y - originalBounds.minY;
        
        // Apply scale and new position
        img.x = newBounds.minX + relX * scaleX;
        img.y = newBounds.minY + relY * scaleY;
        img.width = img.width * scaleX;
        img.height = img.height * scaleY;
      }
    });
    
    s.isModified = true;
  }
  
  /**
   * Calculate bounds for selected images
   * @returns {object|null} Bounding box or null
   */
  calculateSelectedImagesBounds() {
    const s = this.core.state.appState;
    if (!s.selectedImages || s.selectedImages.length === 0) return null;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    s.selectedImages.forEach(index => {
      const img = s.images[index];
      if (img) {
        minX = Math.min(minX, img.x);
        minY = Math.min(minY, img.y);
        maxX = Math.max(maxX, img.x + img.width);
        maxY = Math.max(maxY, img.y + img.height);
      }
    });
    
    if (minX === Infinity) return null;
    
    return { minX, minY, maxX, maxY };
  }
}
