// FILE: xvg-utilities.js
// XVG Utilities Module – corrected to the unified appState and exposed API.
// UI is for the xvg project and the rules are being followed.

(function () {
  'use strict';

  // Input validation helper
  function validateNumber(value, name, min = -Infinity, max = Infinity) {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(`${name} must be a valid number, got: ${typeof value}`);
    }
    if (value < min || value > max) {
      throw new Error(`${name} must be between ${min} and ${max}, got: ${value}`);
    }
    return value;
  }

  function validateObject(value, name) {
    if (!value || typeof value !== 'object') {
      throw new Error(`${name} must be a valid object, got: ${typeof value}`);
    }
    return value;
  }

  function validateCanvas(value, name) {
    if (!value || !(value instanceof HTMLCanvasElement)) {
      throw new Error(`${name} must be a valid HTMLCanvasElement, got: ${typeof value}`);
    }
    return value;
  }

  // Safe clamp with input validation
  const clamp = (v, a, b) => {
    const val = validateNumber(v, 'clamp value');
    const min = validateNumber(a, 'clamp minimum');
    const max = validateNumber(b, 'clamp maximum');
    
    if (min > max) {
      throw new Error('clamp minimum cannot be greater than maximum');
    }
    
    return Math.max(min, Math.min(max, val));
  };

  // Safe DPI calculation with fallback
  const dpi = () => {
    try {
      const ratio = window.devicePixelRatio;
      if (typeof ratio !== 'number' || isNaN(ratio) || ratio <= 0) {
        console.warn('Invalid devicePixelRatio, using fallback value 1');
        return 1;
      }
      return Math.min(Math.max(ratio, 0.5), 4); // Clamp to reasonable range
    } catch (error) {
      console.warn('Error getting devicePixelRatio:', error);
      return 1;
    }
  };

  // Safe system access with comprehensive error handling
  function sys() {
    try {
      if (!window.XVGSystem) {
        throw new Error('XVGSystem not found on window object');
      }
      
      const s = window.XVGSystem;
      validateObject(s, 'XVGSystem');
      
      if (!s.canvas || !s.appState) {
        throw new Error('XVGSystem missing required properties: canvas or appState');
      }
      
      return s;
    } catch (error) {
      console.error('Failed to access XVGSystem:', error);
      throw new Error(`XVGSystem access failed: ${error.message}`);
    }
  }

  // Safe canvas context access with validation
  function canvasCtx() {
    try {
      const system = sys();
      const canvas = validateObject(system.canvas, 'canvas');
      
      if (!canvas.context) {
        throw new Error('Canvas context not initialized');
      }
      
      return canvas.context;
    } catch (error) {
      console.error('Failed to access canvas context:', error);
      throw new Error(`Canvas context access failed: ${error.message}`);
    }
  }

  function overlayCtx() {
    try {
      const system = sys();
      const canvas = validateObject(system.canvas, 'canvas');
      
      if (!canvas.overlayContext) {
        throw new Error('Canvas overlay context not initialized');
      }
      
      return canvas.overlayContext;
    } catch (error) {
      console.error('Failed to access overlay context:', error);
      throw new Error(`Overlay context access failed: ${error.message}`);
    }
  }

  // Safe transform access with validation
  function transform() {
    try {
      const system = sys();
      const appState = validateObject(system.appState, 'appState');
      
      if (!appState.canvasTransform) {
        throw new Error('Canvas transform not initialized');
      }
      
      const transform = appState.canvasTransform;
      validateNumber(transform.pan_x, 'pan_x');
      validateNumber(transform.pan_y, 'pan_y');
      validateNumber(transform.zoom, 'zoom', 0.01, 100); // Prevent division by zero
      
      return transform;
    } catch (error) {
      console.error('Failed to access canvas transform:', error);
      throw new Error(`Canvas transform access failed: ${error.message}`);
    }
  }

  // Safe HiDPI canvas sizing with comprehensive validation
  function sizeCanvasToDisplaySize(c, logicalW, logicalH) {
    try {
      const canvas = validateCanvas(c, 'canvas');
      const width = validateNumber(logicalW, 'logical width', 1, 10000);
      const height = validateNumber(logicalH, 'logical height', 1, 10000);
      
      const deviceRatio = dpi();
      
      // Set canvas size with bounds checking
      canvas.width = Math.max(1, Math.floor(width * deviceRatio));
      canvas.height = Math.max(1, Math.floor(height * deviceRatio));
      
      // Set CSS size
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      
      // Get context and set transform
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get 2D context from canvas');
      }
      
      ctx.setTransform(deviceRatio, 0, 0, deviceRatio, 0, 0);
      
      return ctx;
    } catch (error) {
      console.error('Failed to size canvas to display size:', error);
      throw new Error(`Canvas sizing failed: ${error.message}`);
    }
  }

  // Safe world coordinate conversion with validation
  function toWorld(x, y) {
    try {
      const screenX = validateNumber(x, 'screen x');
      const screenY = validateNumber(y, 'screen y');
      
      const { pan_x, pan_y, zoom } = transform();
      
      // Prevent division by zero
      if (zoom === 0) {
        throw new Error('Zoom cannot be zero for coordinate conversion');
      }
      
      return {
        x: (screenX - pan_x) / zoom,
        y: (screenY - pan_y) / zoom
      };
    } catch (error) {
      console.error('Failed to convert to world coordinates:', error);
      throw new Error(`World coordinate conversion failed: ${error.message}`);
    }
  }

  function toScreen(x, y) {
    try {
      const worldX = validateNumber(x, 'world x');
      const worldY = validateNumber(y, 'world y');
      
      const { pan_x, pan_y, zoom } = transform();
      
      return {
        x: worldX * zoom + pan_x,
        y: worldY * zoom + pan_y
      };
    } catch (error) {
      console.error('Failed to convert to screen coordinates:', error);
      throw new Error(`Screen coordinate conversion failed: ${error.message}`);
    }
  }

  // Safe dynamic hit tolerance calculation
  function hitTolerance() {
    try {
      const zoom = transform().zoom;
      
      // Prevent division by zero
      if (zoom === 0) {
        console.warn('Zoom is zero, using fallback hit tolerance');
        return 6;
      }
      
      const deviceRatio = dpi();
      const base = 6 * deviceRatio;
      
      return clamp(base / zoom, 3, 18);
    } catch (error) {
      console.error('Failed to calculate hit tolerance:', error);
      return 6; // Safe fallback
    }
  }

  // Safe handle size calculation
  function handleSize() {
    try {
      const zoom = transform().zoom;
      
      // Prevent division by zero and negative zoom
      if (zoom <= 0) {
        console.warn('Invalid zoom for handle size calculation, using fallback');
        return 8;
      }
      
      const deviceRatio = dpi();
      const sqrtZoom = Math.sqrt(zoom);
      
      // Prevent division by zero in sqrt
      if (sqrtZoom === 0) {
        console.warn('Zoom sqrt is zero, using fallback handle size');
        return 8;
      }
      
      return clamp(8 * deviceRatio / sqrtZoom, 6, 20);
    } catch (error) {
      console.error('Failed to calculate handle size:', error);
      return 8; // Safe fallback
    }
  }

  // Safe notification system with validation
  function notify(type, message) {
    try {
      // Validate inputs
      if (!type || typeof type !== 'string') {
        throw new Error('Notification type must be a non-empty string');
      }
      
      if (!message || typeof message !== 'string') {
        throw new Error('Notification message must be a non-empty string');
      }
      
      // Validate type
      const validTypes = ['error', 'warn', 'ok', 'info'];
      if (!validTypes.includes(type)) {
        console.warn(`Invalid notification type: ${type}, using 'info'`);
        type = 'info';
      }
      
      // Get or create notification container
      let box = document.getElementById('notification-container');
      if (!box) {
        box = document.createElement('div');
        box.id = 'notification-container';
        box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(box);
      }
      
      // Create notification element
      const n = document.createElement('div');
      const colors = {
        error: '#dc3545',
        warn: '#ffc107',
        ok: '#28a745',
        info: '#17a2b8'
      };
      
      n.style.cssText = `padding:10px 12px;border-radius:6px;color:#fff;font:12px/1.4 system-ui;background:${colors[type] || colors.info}`;
      n.textContent = message;
      
      box.appendChild(n);
      
      // Auto-remove after delay
      setTimeout(() => {
        try {
          if (n.parentNode) {
            n.remove();
          }
        } catch (error) {
          console.warn('Failed to remove notification:', error);
        }
      }, 2200);
      
    } catch (error) {
      console.error('Failed to show notification:', error);
      // Fallback to console
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  // Public API with error handling
  window.calculateDynamicHitTolerance = hitTolerance;
  window.calculateDynamicHandleSize = handleSize;
  
  window.XVGUtils = {
    sys, 
    canvasCtx, 
    overlayCtx, 
    transform,
    sizeCanvasToDisplaySize, 
    toWorld, 
    toScreen, 
    hitTolerance, 
    handleSize, 
    notify,
    dpi,
    clamp,
    validateNumber,
    validateObject,
    validateCanvas
  };

  if (window.ModuleLoader) window.ModuleLoader.markModuleReady('utilities');
  console.log('✅ xvg-utilities ready with comprehensive error handling');
})();

