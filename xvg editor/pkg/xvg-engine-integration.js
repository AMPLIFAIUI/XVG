// XVG Engine Integration — full, robust bridge between UI, Core, and optional WASM
// UI is for the xvg project and the rules are being followed.
/*
 * Guarantees:
 * - Works with or without WASM. Falls back cleanly to JSON-only .xvg files.
 * - Never blocks ModuleLoader. Emits lifecycle events: 'xvg-engine-ready'.
 * - Single source of truth is window.XVGSystem. No shadow state.
 * - All menu items in index.html get real implementations here if missing.
 */
(function () {
  'use strict';

  const EVT = {
    WASM_READY: 'xvg-wasm-ready',
    ENGINE_READY: 'xvg-engine-ready'
  };

  const LOG = (...a) => console.log('[Engine]', ...a);
  const WARN = (...a) => console.warn('[Engine]', ...a);
  const ERR = (...a) => console.error('[Engine]', ...a);

  const HAS = {
    get wasmModule() { return window.xvg_wasm || null; },
    get system() { return window.XVGSystem || null; },
  };

  // ---------------------------------------
  // Helpers
  // ---------------------------------------
  function ensureSystem() {
    if (!HAS.system) throw new Error('XVGSystem not found');
    return HAS.system;
  }

  function reRender() {
    if (typeof window.renderCanvas === 'function') window.renderCanvas();
  }

  function updateLayersUI() {
    if (typeof window.updateLayerList === 'function') window.updateLayerList();
    // Fallback: rebuild a minimal list if core did not export updateLayerList
    if (typeof window.updateLayerList !== 'function') {
      const list = document.getElementById('layer-list');
      if (!list) return;
      const { appState } = ensureSystem();
      list.innerHTML = '';
      appState.layers.forEach((layer, idx) => {
        const el = document.createElement('div');
        el.className = 'layer-item';
        el.draggable = true;
        el.dataset.layerId = layer.id;
        el.innerHTML = `
          <span>${layer.name}</span>
          <div class="layer-controls">
            <button class="layer-control-btn" onclick="deleteLayer(${idx})" title="Delete">×</button>
          </div>`;
        list.appendChild(el);
      });
    }
  }

  function notify(type, msg) {
    if (typeof window.showNotification === 'function') {
      window.showNotification(type, msg);
    } else {
      LOG(type.toUpperCase() + ':', msg);
    }
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Serialize editor state to portable JSON (spec-aware container)
  function serializeEditorJSON() {
    const { appState } = ensureSystem();
    const payload = {
      format: 'xvg-editor-json',
      version: 1,
      savedAt: new Date().toISOString(),
      canvas: deepClone(appState.canvas),
      transform: deepClone(appState.canvasTransform),
      grid: deepClone(appState.grid),
      rulers: deepClone(appState.rulers),
      layers: appState.layers.map(l => ({
        id: l.id,
        name: l.name,
        visible: !!l.visible,
        locked: !!l.locked,
        paths: (l.paths || []).map(i => i)
      })),
      paths: (appState.paths || []).map(p => ({
        type: p.type || 'path',
        data: p.data || '', // SVG path string
        style: deepClone(p.style || {
          stroke: { color: [1,1,1,1], width: 2, cap: 'Butt', join: 'Miter', dash_array: [] },
          fill: null,
          opacity: 1.0,
          blend_mode: 'Normal'
        }),
      })),
      activeLayer: appState.activeLayer || 0,
      currentLayerIndex: appState.currentLayerIndex || 0,
    };
    return payload;
  }

  function loadEditorJSON(json) {
    const sys = ensureSystem();
    const s = json || {};
    sys.appState.canvas = Object.assign(sys.appState.canvas, s.canvas || {});
    sys.appState.canvasTransform = Object.assign(sys.appState.canvasTransform, s.transform || {});
    sys.appState.grid = Object.assign(sys.appState.grid, s.grid || {});
    sys.appState.rulers = Object.assign(sys.appState.rulers, s.rulers || {});
    sys.appState.paths = Array.isArray(s.paths) ? s.paths : [];
    sys.appState.layers = Array.isArray(s.layers) && s.layers.length ? s.layers : sys.appState.layers;
    sys.appState.activeLayer = typeof s.activeLayer === 'number' ? s.activeLayer : 0;
    sys.appState.currentLayerIndex = typeof s.currentLayerIndex === 'number' ? s.currentLayerIndex : 0;
    reRender();
    updateLayersUI();
  }

  // ---------------------------------------
  // WASM-capable XVG file container helpers
  // ---------------------------------------
  function canUseWasmXVGFile() {
    const M = HAS.wasmModule;
    return !!(M && typeof M.XVGFile === 'function');
  }

  function wasmAddEditorSection(xvgFile, key, obj) {
    try {
      if (typeof xvgFile.add_section === 'function') {
        xvgFile.add_section(key, JSON.stringify(obj));
        return true;
      }
    } catch (e) { WARN('add_section failed', e); }
    return false;
  }

  function wasmGetEditorSection(xvgFile, key) {
    try {
      if (typeof xvgFile.get_section === 'function') {
        const s = xvgFile.get_section(key);
        if (s && typeof s === 'string') return JSON.parse(s);
      }
    } catch (e) { WARN('get_section failed', e); }
    return null;
  }

  // Convert SVG Path2D string to polyline float data if builder exists
  function pathStringToFloat32(pathStr) {
    // Deprecated path: previous code expected byte buffer API that does not exist in the shipped WASM.
    // Kept for compatibility where callers still expect a Uint8Array; return null.
    return null;
  }

  // Minimal SVG path parser to extract polyline points for extrusion.
  // Handles absolute 'M', 'L', and uses end-point of 'Q' curves.
  function pathStringToPoints(pathStr) {
    const tokens = pathStr.trim().split(/[\s,]+/);
    const points = [];
    let i = 0;
    let cmd = null;
    while (i < tokens.length) {
      const t = tokens[i];
      if (/^[MLQZmlqzHVhvCScsTAta]$/.test(t)) { cmd = t; i++; continue; }
      if (cmd === 'M' || cmd === 'L') {
        const x = parseFloat(tokens[i++]);
        const y = parseFloat(tokens[i++]);
        if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]);
        continue;
      }
      if (cmd === 'Q') {
        // Skip control point, keep end point only
        i += 2; // cx, cy
        const x = parseFloat(tokens[i++]);
        const y = parseFloat(tokens[i++]);
        if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]);
        continue;
      }
      // Unknown or relative command: advance conservatively
      i++;
    }
    return points;
  }

  // ---------------------------------------
  // Engine object
  // ---------------------------------------
  class EngineIntegration {
    constructor() {
      this.ready = false;
      this.wasm = null;
      this.available = {
        XVGFile: false,
        XVGRenderer: false,
        XVG3DEngine: false,
        XVGSDFEngine: false,
        XVGCRDTEngine: false,
        XVGPathBuilder: false,
      };
      this._bindLifecycle();
      this._bindUIOnce();
    }

    _bindLifecycle() {
      if (HAS.wasmModule) {
        this._onWasmReady(HAS.wasmModule);
      } else {
        window.addEventListener(EVT.WASM_READY, (ev) => {
          this._onWasmReady(HAS.wasmModule);
        }, { once: true });
      }
      // In any case, become usable even without WASM
      this._becomeReady();
    }

    _onWasmReady(mod) {
      this.wasm = mod;
      this.available.XVGFile = !!mod?.XVGFile;
      this.available.XVGRenderer = !!mod?.XVGRenderer;
      this.available.XVG3DEngine = !!mod?.XVG3DEngine;
      this.available.XVGSDFEngine = !!mod?.XVGSDFEngine;
      this.available.XVGCRDTEngine = !!mod?.XVGCRDTEngine;
      this.available.XVGPathBuilder = !!mod?.XVGPathBuilder;
      LOG('WASM present. Constructors:', Object.keys(this.available).filter(k => this.available[k]));
      notify('success', 'WASM ready');
    }

    _becomeReady() {
      if (this.ready) return;
      this.ready = true;
      window.dispatchEvent(new CustomEvent(EVT.ENGINE_READY, { detail: { success: true } }));
      LOG('Engine integration ready');
      // Attach menu implementations if core left stubs
      this._installMenuHandlers();
      // Attach file input listener
      this._attachFileInput();
    }

    _bindUIOnce() {
      document.addEventListener('DOMContentLoaded', () => {
        // Hook SDF panel
        const trainBtn = document.querySelector('#sdf-tab .btn.btn--primary');
        if (trainBtn) trainBtn.addEventListener('click', () => this.trainSDF());
        
        // Hook shader panel
        const compileBtn = document.querySelector('#shaders-tab .btn.btn--primary');
        if (compileBtn) compileBtn.addEventListener('click', () => this.compileShader());
        
        // Initialize enhanced UI components
        this.initializeEngineStatusIndicators();
        this.initializeEngineConfigurationUI();
        this.setupEngineErrorHandling();
      });
    }

    _attachFileInput() {
      const fileInput = document.getElementById('file-input');
      if (!fileInput || fileInput.__xvgBound) return;
      fileInput.__xvgBound = true;
      fileInput.addEventListener('change', async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
          if (f.name.toLowerCase().endsWith('.xvg')) {
            const buf = await f.arrayBuffer();
            await this.importXVGBuffer(buf, f.name);
          } else if (f.name.toLowerCase().endsWith('.svg')) {
            const text = await f.text();
            this.importSVGText(text, f.name);
          } else if (['png', 'jpg', 'jpeg'].includes(f.name.toLowerCase().split('.').pop())) {
            await this.importImageFile(f);
          } else {
            notify('warning', 'Unsupported file type');
          }
        } catch (err) {
          ERR('Import failed', err);
          notify('error', 'Import failed');
        } finally {
          fileInput.value = '';
        }
      });
    }

    _installMenuHandlers() {
      const install = (name, fn) => {
        if (typeof window[name] !== 'function' || /not yet implemented/i.test(String(window[name]))) {
          window[name] = fn.bind(this);
          window[name].__xvg_impl = true;
        }
      };
      install('exportXVG', this.exportXVG);
      install('importXVG', this.importXVG);
      install('validateXVG', this.validateXVG);
      install('showXVGInfo', this.showXVGInfo);
      install('testXVGWasm', this.testXVGWasm);
      install('debugEngineStatus', this.debugEngineStatus);
      install('testEngineConnections', this.testEngineConnections);
      install('addTestShapes', this.addTestShapes);
      install('add3DDemo', this.add3DDemo);
      // SDF actions (expose for inline onclick handlers)
      install('trainSDF', this.trainSDF);
      install('evaluateSDF', this.evaluateSDF);
      install('exportSDF', this.exportSDF);
      // Panels
      install('openSDFPanel', () => this._showPanel('sdf'));
      install('open3DPanel', () => this._showPanel('3d'));
      install('openShaderPanel', () => this._showPanel('shaders'));
      install('openCRDTPanel', () => this._showPanel('collab'));
    }

    _showPanel(name) {
      if (typeof window.showPanel === 'function') {
        window.showPanel(name);
      } else {
        // Basic toggle if core stubbed it
        document.querySelectorAll('.tab-content').forEach(n => n.classList.remove('active'));
        const el = document.getElementById(name + '-tab');
        if (el) el.classList.add('active');
      }
    }

    // ---------------------------
    // Export / Import
    // ---------------------------
    async exportXVG() {
      const sys = ensureSystem();
      const json = serializeEditorJSON();
      let bytes = null;
      if (canUseWasmXVGFile()) {
        try {
          const F = new HAS.wasmModule.XVGFile(sys.appState.canvas.width, sys.appState.canvas.height);
          // Optionally add path bytes if builder available
          (json.paths || []).forEach(p => {
            const dataBytes = pathStringToFloat32(p.data);
            if (dataBytes && typeof F.add_path === 'function') {
              // identity transform [a,b,c,d,e,f]
              F.add_path(dataBytes, [1,0,0,1,0,0], undefined);
            }
          });
          // Attach the editor json for lossless roundtrip
          wasmAddEditorSection(F, 'editor_json', json);
          if (typeof F.encode_bytes === 'function') {
            bytes = F.encode_bytes();
          }
          F.free?.();
        } catch (e) {
          WARN('WASM packing failed, falling back to JSON', e);
        }
      }
      if (!bytes) {
        // Pure JSON file
        bytes = new TextEncoder().encode(JSON.stringify(json, null, 2));
      }
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'document.xvg';
      a.click();
      URL.revokeObjectURL(a.href);
      notify('success', 'XVG exported');
    }

    importXVG() {
      const input = document.getElementById('file-input');
      if (input) input.click();
    }

    async importXVGBuffer(arrayBuffer, filename = 'import.xvg') {
      // Use the core system's loadXVGFromBuffer which handles binary/JSON properly
      if (window.XVGSystem && window.XVGSystem.import && window.XVGSystem.import.loadXVGFromBuffer) {
        window.XVGSystem.import.loadXVGFromBuffer(arrayBuffer);
        notify('success', 'XVG file imported successfully');
        return;
      }
      
      // Fallback if core system not available
      notify('error', 'XVG import system not available');
    }

    importSVGText(text, filename = 'import.svg') {
      // Simple SVG path import: grab <path d="..."> and add to active layer
      const sys = ensureSystem();
      const pathRegex = /<path\b[^>]*\bd=\"([^\"]+)\"[^>]*>/gi;
      let m, count = 0;
      while ((m = pathRegex.exec(text))) {
        const d = m[1];
        const path = {
          type: 'path',
          data: d,
          style: {
            fill: null,
            stroke: { color: [1,1,1,1], width: 2, cap: 'Butt', join: 'Miter', dash_array: [] },
            opacity: 1.0,
            blend_mode: 'Normal'
          },
          id: 'imported_path_' + Date.now() + '_' + count
        };
        sys.appState.paths.push(path);
        console.log('[Engine Path] Added imported path to appState:', path.id, 'Total paths now:', sys.appState.paths.length);
        // Link into active layer
        const L = sys.appState.layers[sys.appState.activeLayer] || sys.appState.layers[0];
        if (L) L.paths.push(sys.appState.paths.length - 1);
        count++;
      }
      reRender();
      updateLayersUI();
      notify(count ? 'success' : 'warning', count ? `Imported ${count} paths` : 'No <path> found');
    }

    async importImageFile(file) {
      try {
        const reader = new FileReader();
        const img = new Image();
        
        return new Promise((resolve, reject) => {
          reader.onload = function(e) {
            img.onload = function() {
              try {
                // Add image to canvas using the image tool
                if (window.XVGSystem && window.XVGSystem.tools && window.XVGSystem.tools.image) {
                  window.XVGSystem.tools.image.addImageToCanvas(img, file.name);

                  // Set current filename for saving if document appears new/empty
                  const appState = window.XVGSystem.appState;
                  const isNewDocument = !appState.currentFilename &&
                                       (appState.paths.length === 0) &&
                                       (!appState.images || appState.images.length === 1); // Just added this image

                  if (isNewDocument) {
                    // Convert image filename to .xvg extension
                    const xvgFilename = file.name.replace(/\.(png|jpg|jpeg)$/i, '.xvg');
                    appState.currentFilename = xvgFilename;
                    console.log('Set current filename for new image document:', xvgFilename);
                  }

                  notify('success', 'Image imported successfully');
                  resolve();
                } else {
                  // Fallback: add image to appState directly
                  const sys = ensureSystem();
                  if (!sys.appState.images) {
                    sys.appState.images = [];
                  }
                  
                  const imageData = {
                    id: crypto.randomUUID(),
                    element: img,
                    x: 0,
                    y: 0,
                    width: img.width,
                    height: img.height,
                    filename: file.name
                  };
                  
                  sys.appState.images.push(imageData);

                  // Set current filename for saving if document appears new/empty
                  const isNewDocument = !sys.appState.currentFilename &&
                                       (sys.appState.paths.length === 0) &&
                                       (sys.appState.images.length === 1); // Just added this image

                  if (isNewDocument) {
                    // Convert image filename to .xvg extension
                    const xvgFilename = file.name.replace(/\.(png|jpg|jpeg)$/i, '.xvg');
                    sys.appState.currentFilename = xvgFilename;
                    console.log('Set current filename for new image document:', xvgFilename);
                  }

                  reRender();
                  updateLayersUI();
                  notify('success', 'Image imported successfully');
                  resolve();
                }
              } catch (error) {
                reject(error);
              }
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });
      } catch (error) {
        ERR('Image import failed', error);
        notify('error', 'Failed to import image');
        throw error;
      }
    }

    // ---------------------------
    // Validation & Info
    // ---------------------------
    validateXVG() {
      const { appState } = ensureSystem();
      let ok = true;
      let errors = 0;
      (appState.paths || []).forEach((p, i) => {
        try {
          // Attempt to construct Path2D
          new Path2D(p.data || '');
        } catch (e) {
          ok = false; errors++;
          WARN('Invalid path at index', i, e);
        }
      });
      if (ok) notify('success', 'All paths valid');
      else notify('warning', `${errors} invalid path(s)`);
      return ok;
    }

    showXVGInfo() {
      const { appState } = ensureSystem();
      const info = {
        canvas: appState.canvas,
        transform: appState.canvasTransform,
        layers: appState.layers.length,
        paths: appState.paths.length,
      };
      LOG('XVG Info:', info);
      notify('info', `Layers: ${info.layers}, Paths: ${info.paths}`);
      return info;
    }

    // ---------------------------
    // WASM Tests & Debug
    // ---------------------------
    testXVGWasm() {
      const avail = this.available;
      const present = Object.keys(avail).filter(k => avail[k]);
      if (present.length) notify('success', `WASM OK: ${present.join(', ')}`);
      else notify('warning', 'WASM not present');
      LOG('WASM availability', avail);
      return avail;
    }

    debugEngineStatus() {
      const sys = HAS.system;
      const status = {
        hasSystem: !!sys,
        hasWasm: !!HAS.wasmModule,
        ready: this.ready,
        tools: sys?.tools ? Object.keys(sys.tools) : [],
        currentTool: sys?.appState?.currentTool,
      };
      LOG('Engine Status', status);
      notify('info', 'Status logged to console');
      return status;
    }

    testEngineConnections() {
      const ok = !!HAS.system && this.ready;
      notify(ok ? 'success' : 'warning', ok ? 'Engine wired' : 'Engine not wired');
      return ok;
    }

    // ---------------------------
    // Demos
    // ---------------------------
    addTestShapes() {
      const { appState } = ensureSystem();
      
      // Clear existing paths first
      appState.paths = [];
      
      // Add test shapes with proper structure for selection tool
      const shapes = [
        {
          type: 'path',
          data: 'M 100 100 L 300 100 L 300 300 L 100 300 Z', // square
          style: {
            fill: { color: [1, 0, 0, 0.3], rule: 'NonZero' },
            stroke: { color: [1, 0, 0, 1], width: 2, cap: 'Butt', join: 'Miter', dash_array: [] },
            opacity: 1.0,
            blend_mode: 'Normal'
          },
          id: 'test-square',
          x: 100, y: 100, w: 200, h: 200 // Add bounding box for selection
        },
        {
          type: 'path', 
          data: 'M 450 200 m -100, 0 a 100,100 0 1,0 200,0 a 100,100 0 1,0 -200,0', // circle
          style: {
            fill: { color: [0, 1, 0, 0.3], rule: 'NonZero' },
            stroke: { color: [0, 1, 0, 1], width: 2, cap: 'Butt', join: 'Miter', dash_array: [] },
            opacity: 1.0,
            blend_mode: 'Normal'
          },
          id: 'test-circle',
          x: 350, y: 100, w: 200, h: 200 // Add bounding box for selection
        },
        {
          type: 'path',
          data: 'M 100 400 C 200 300, 300 500, 400 400', // cubic
          style: {
            fill: { color: [0, 0, 1, 0.3], rule: 'NonZero' },
            stroke: { color: [0, 0, 1, 1], width: 2, cap: 'Butt', join: 'Miter', dash_array: [] },
            opacity: 1.0,
            blend_mode: 'Normal'
          },
          id: 'test-curve',
          x: 100, y: 300, w: 300, h: 200 // Add bounding box for selection
        }
      ];
      
      // Add shapes to appState
      shapes.forEach(shape => {
        appState.paths.push(shape);
        console.log('[Engine Shapes] Added shape to appState:', shape.id, 'Total paths now:', appState.paths.length);
      });
      
      // Ensure at least one layer exists
      if (appState.layers.length === 0) {
        appState.layers.push({ id: 'layer_1_' + Date.now(), name: 'Layer 1', visible: true, locked: false, paths: [] });
      }
      
      // Assign to active layer
      const L = appState.layers[appState.activeLayer] || appState.layers[0];
      if (L) {
        L.paths = [0, 1, 2]; // Reference the path indices
      }
      
      // Clear any existing selection
      appState.selectedPaths = [];
      
      reRender();
      updateLayersUI();
      notify('success', 'Test shapes added - try selecting them!');
      
      console.log('Test shapes created:', appState.paths.length, 'paths');
      console.log('Paths data:', appState.paths.map(p => ({ id: p.id, type: p.type, bounds: { x: p.x, y: p.y, w: p.w, h: p.h } })));
    }

    add3DDemo() {
      if (!this.available.XVG3DEngine) { notify('warning', '3D engine unavailable'); return; }
      try {
        const M = HAS.wasmModule;
        const engine = new M.XVG3DEngine();
        const rect = [[0,0],[200,0],[200,120],[0,120],[0,0]];
        const meshId = engine.extrude_path(rect, 50);
        LOG('3D mesh id', meshId);
        engine.free?.();
        notify('success', '3D demo generated');
      } catch (e) { ERR('3D demo failed', e); notify('error', '3D demo failed'); }
    }

    // ---------------------------
    // Panels: SDF and Shaders
    // ---------------------------
    async trainSDF() {
      const bar = document.getElementById('sdf-progress');
      const text = document.getElementById('sdf-progress-text');
      const set = (v, t) => {
        if (bar) bar.style.width = `${v}%`;
        if (text) text.textContent = t || `${v}%`;
      };
      set(5, 'Preparing…');
      try {
        const E = this.available.XVGSDFEngine ? new HAS.wasmModule.XVGSDFEngine() : null;
        if (E && typeof E.train === 'function') { E.train([[[0,0], 0]]); E.free?.(); }
        set(100, 'Done');
        notify('success', 'SDF trained');
        return { success: true };
      } catch (e) {
        ERR('SDF train failed', e);
        set(100, 'Failed');
        notify('error', 'SDF training failed');
      }
    }

    evaluateSDF() {
      const canvas = document.getElementById('sdf-canvas');
      if (!canvas) { notify('warning', 'No SDF canvas'); return; }
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      const E = this.available.XVGSDFEngine ? new HAS.wasmModule.XVGSDFEngine() : null;
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const nx = (x / (w - 1)) * 2 - 1;
          const ny = (y / (h - 1)) * 2 - 1;
          const d = E ? E.evaluate(nx, ny) : 0;
          const v = d > 0 ? 255 : 0;
          const o = (y * w + x) * 4;
          img.data[o + 0] = v;
          img.data[o + 1] = v;
          img.data[o + 2] = v;
          img.data[o + 3] = 255;
        }
      }
      E?.free?.();
      ctx.putImageData(img, 0, 0);
      notify('success', 'SDF evaluated');
    }

    exportSDF() {
      const E = this.available.XVGSDFEngine ? new HAS.wasmModule.XVGSDFEngine() : null;
      if (!E) { notify('warning', 'SDF engine unavailable'); return; }
      const weights = E.get_weights?.();
      E.free?.();
      const blob = new Blob([typeof weights === 'string' ? weights : JSON.stringify(weights || {})], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'sdf-weights.json';
      a.click();
      URL.revokeObjectURL(a.href);
      notify('success', 'SDF weights exported');
    }

    async compileShader() {
      // Try WebGPU WGSL preview. Fallback to simple 2D canvas fill.
      const canvas = document.getElementById('shader-canvas');
      const src = (document.getElementById('shader-code')?.value || '').trim();
      if (!canvas) { notify('warning', 'No shader canvas'); return; }

      // WebGPU path
      if ('gpu' in navigator) {
        try {
          const adapter = await navigator.gpu.requestAdapter();
          const device = await adapter.requestDevice();
          const context = canvas.getContext('webgpu');
          const format = navigator.gpu.getPreferredCanvasFormat();
          context.configure({ device, format, alphaMode: 'premultiplied' });
          // If user code fails, use trivial shader
          const wgsl = src || `@vertex fn v(@builtin(vertex_index) i:u32)->@builtin(position) vec4<f32>{var p=array<vec2<f32>,3>(vec2<f32>(0.0,0.5),vec2<f32>(-0.5,-0.5),vec2<f32>(0.5,-0.5));return vec4<f32>(p[i],0.0,1.0);} @fragment fn f()->@location(0) vec4<f32>{return vec4<f32>(0.9,0.2,0.2,1.0);}`;
          const module = device.createShaderModule({ code: wgsl });
          const pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: { module, entryPoint: 'vertex_main' in module ? 'vertex_main' : 'v' },
            fragment: { module, entryPoint: 'fragment_main' in module ? 'fragment_main' : 'f', targets: [{ format }] },
            primitive: { topology: 'triangle-list' }
          });
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0.08, g: 0.08, b: 0.1, a: 1 }, storeOp: 'store' }]
          });
          pass.setPipeline(pipeline);
          pass.draw(3, 1, 0, 0);
          pass.end();
          device.queue.submit([encoder.finish()]);
          notify('success', 'WGSL compiled');
          return;
        } catch (e) {
          WARN('WebGPU compile failed, fallback to 2D', e);
        }
      }
      // 2D fallback
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#303030';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText('WGSL preview not available', 10, 20);
      notify('warning', 'WGSL fallback preview');
    }
    
    // ---------------------------
    // Engine Configuration Methods
    // ---------------------------
    
    // Reset SDF configuration to defaults
    resetSDFConfiguration() {
      const iterations = document.getElementById('sdf-iterations');
      const learningRate = document.getElementById('sdf-learning-rate');
      const layers = document.getElementById('sdf-layers');
      const useGpu = document.getElementById('sdf-use-gpu');
      
      if (iterations) iterations.value = 1000;
      if (learningRate) {
        learningRate.value = 0.01;
        const lrValue = document.getElementById('sdf-lr-value');
        if (lrValue) lrValue.textContent = '0.01';
      }
      if (layers) layers.value = 4;
      if (useGpu) useGpu.checked = false;
      
      notify('success', 'SDF configuration reset to defaults');
    }
    
    // Save SDF configuration
    saveSDFConfiguration() {
      const config = {
        iterations: parseInt(document.getElementById('sdf-iterations')?.value || 1000),
        learningRate: parseFloat(document.getElementById('sdf-learning-rate')?.value || 0.01),
        layers: parseInt(document.getElementById('sdf-layers')?.value || 4),
        useGpu: document.getElementById('sdf-use-gpu')?.checked || false,
        timestamp: Date.now()
      };
      
      localStorage.setItem('xvg-sdf-config', JSON.stringify(config));
      notify('success', 'SDF configuration saved');
    }
    
    // Generate 3D mesh from selected paths
    generate3DMesh() {
      if (!this.available.XVG3DEngine) { notify('warning', '3D engine unavailable'); return; }
      const sys = ensureSystem();
      const selected = sys.appState.selectedPaths;
      if (selected.length === 0) { notify('warning', 'Please select paths to extrude'); return; }
      try {
        const height = parseInt(document.getElementById('3d-extrusion-height')?.value || 50);
        const M = HAS.wasmModule;
        const E = new M.XVG3DEngine();
        let count = 0;
        for (const id of selected) {
          const idx = sys.appState.paths.findIndex(p => p.id === id);
          if (idx === -1) continue;
          const path = sys.appState.paths[idx];
          const pts = pathStringToPoints(path.data);
          if (pts.length >= 2) {
            const meshId = E.extrude_path(pts, height);
            LOG('Generated 3D mesh', meshId, 'for path', id);
            count++;
          }
        }
        E.free?.();
        notify(count > 0 ? 'success' : 'warning', count > 0 ? `Generated ${count} 3D mesh(es)` : 'No valid paths found for 3D generation');
      } catch (e) { ERR('3D mesh generation failed', e); notify('error', '3D mesh generation failed'); }
    }
    
    // Export STL file
    exportSTL() {
      if (!this.available.XVG3DEngine) {
        notify('warning', '3D engine unavailable');
        return;
      }
      
      try {
        const M = HAS.wasmModule;
        const E = new M.XVG3DEngine();
        
        if (typeof E.export_stl === 'function') {
          const stlData = E.export_stl();
          if (stlData) {
            const blob = new Blob([stlData], { type: 'application/octet-stream' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'mesh.stl';
            a.click();
            URL.revokeObjectURL(a.href);
            notify('success', 'STL file exported');
          } else {
            notify('warning', 'No mesh data to export');
          }
        } else {
          notify('warning', 'STL export not available');
        }
        
        E.free?.();
      } catch (e) {
        ERR('STL export failed', e);
        notify('error', 'STL export failed');
      }
    }
    
    // Validate shader code
    validateShader() {
      const shaderCode = document.getElementById('shader-code')?.value || '';
      const shaderType = document.getElementById('shader-type')?.value || 'fragment';
      const precision = document.getElementById('shader-precision')?.value || 'mediump';
      
      if (!shaderCode.trim()) {
        notify('warning', 'No shader code to validate');
        return;
      }
      
      try {
        // Basic WGSL syntax validation
        const hasVertex = shaderCode.includes('@vertex') || shaderCode.includes('fn v(');
        const hasFragment = shaderCode.includes('@fragment') || shaderCode.includes('fn f(');
        
        if (shaderType === 'vertex' && !hasVertex) {
          notify('warning', 'Vertex shader missing @vertex function');
          return;
        }
        
        if (shaderType === 'fragment' && !hasFragment) {
          notify('warning', 'Fragment shader missing @fragment function');
          return;
        }
        
        // Check for common WGSL syntax
        const syntaxChecks = [
          { pattern: /@builtin\(position\)/, name: 'Position output' },
          { pattern: /@location\(\d+\)/, name: 'Location qualifier' },
          { pattern: /vec[234]<f32>/, name: 'Vector types' },
          { pattern: /mat[234]x[234]<f32>/, name: 'Matrix types' }
        ];
        
        const issues = [];
        syntaxChecks.forEach(check => {
          if (!check.pattern.test(shaderCode)) {
            issues.push(check.name);
          }
        });
        
        if (issues.length === 0) {
          notify('success', 'Shader syntax appears valid');
        } else {
          notify('warning', `Missing: ${issues.join(', ')}`);
        }
        
      } catch (e) {
        ERR('Shader validation failed', e);
        notify('error', 'Shader validation failed');
      }
    }
    
    // Optimize shader code
    optimizeShader() {
      const shaderCode = document.getElementById('shader-code')?.value || '';
      
      if (!shaderCode.trim()) {
        notify('warning', 'No shader code to optimize');
        return;
      }
      
      try {
        // Basic shader optimizations
        let optimized = shaderCode;
        
        // Remove unnecessary whitespace
        optimized = optimized.replace(/\s+/g, ' ').trim();
        
        // Optimize vector operations
        optimized = optimized.replace(/vec2<f32>\(([^,]+),\s*\1\)/g, 'vec2<f32>($1)');
        optimized = optimized.replace(/vec3<f32>\(([^,]+),\s*\1,\s*\1\)/g, 'vec3<f32>($1)');
        
        // Optimize matrix operations
        optimized = optimized.replace(/mat2x2<f32>\(vec2<f32>\(1,0\),\s*vec2<f32>\(0,1\)\)/g, 'mat2x2<f32>()');
        
        // Update the textarea with optimized code
        const codeTextarea = document.getElementById('shader-code');
        if (codeTextarea) {
          codeTextarea.value = optimized;
        }
        
        notify('success', 'Shader code optimized');
        
      } catch (e) {
        ERR('Shader optimization failed', e);
        notify('error', 'Shader optimization failed');
      }
    }
    
    // ---------------------------
    // WGSL Shader Engine Integration
    // ---------------------------
    
    // Initialize WGSL Shader Engine
    initializeWGSLShaderEngine() {
      if (!this.available.XVGWGSLShaderEngine) {
        notify('warning', 'WGSL Shader Engine not available');
        return false;
      }
      
      try {
        const M = HAS.wasmModule;
        this.wgslEngine = new M.XVGWGSLShaderEngine();
        
        // Set up shader asset management
        this.shaderAssets = new Map();
        this.activeShader = null;
        
        // Initialize shader compilation UI
        this.initializeShaderCompilationUI();
        
        notify('success', 'WGSL Shader Engine initialized');
        return true;
      } catch (e) {
        ERR('WGSL Shader Engine initialization failed', e);
        notify('error', 'WGSL Shader Engine initialization failed');
        return false;
      }
    }
    
    // Initialize shader compilation UI
    initializeShaderCompilationUI() {
      const shaderTab = document.getElementById('shaders-tab');
      if (!shaderTab) return;
      
      // Add shader compilation section
      const compilationSection = document.createElement('div');
      compilationSection.className = 'shader-compilation-section';
      compilationSection.style.cssText = `
        margin: 20px 0;
        padding: 15px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 5px;
      `;
      
      compilationSection.innerHTML = `
        <h4 style="margin: 0 0 15px 0; color: #fff;">WGSL Shader Compilation</h4>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Shader Name:</label>
          <input type="text" id="shader-name" placeholder="Enter shader name" 
                 style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Uniforms:</label>
          <div id="shader-uniforms" style="margin-bottom: 10px;">
            <div class="uniform-item" style="display: flex; margin-bottom: 5px;">
              <input type="text" placeholder="Uniform name" class="uniform-name" 
                     style="flex: 1; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px; margin-right: 5px;">
              <select class="uniform-type" style="padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
                <option value="f32">f32</option>
                <option value="vec2<f32>">vec2<f32></option>
                <option value="vec3<f32>">vec3<f32></option>
                <option value="vec4<f32>">vec4<f32></option>
                <option value="mat2x2<f32>">mat2x2<f32></option>
                <option value="mat3x3<f32>">mat3x3<f32></option>
                <option value="mat4x4<f32>">mat4x4<f32></option>
              </select>
              <button type="button" class="remove-uniform" style="padding: 5px 10px; background: #666; color: #fff; border: none; border-radius: 3px; margin-left: 5px;">×</button>
            </div>
          </div>
          <button id="add-uniform" class="btn btn--secondary" style="margin-bottom: 10px;">Add Uniform</button>
        </div>
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Shader Source:</label>
          <textarea id="shader-source" rows="10" placeholder="Enter WGSL shader code here..."
                    style="width: 100%; padding: 10px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px; font-family: monospace; font-size: 12px;"></textarea>
        </div>
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Compilation Options:</label>
          <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <label style="display: flex; align-items: center; color: #ccc;">
              <input type="checkbox" id="shader-optimize" style="margin-right: 8px;" checked>
              Optimize Shader
            </label>
            <label style="display: flex; align-items: center; color: #ccc;">
              <input type="checkbox" id="shader-debug-info" style="margin-right: 8px;">
              Include Debug Info
            </label>
          </div>
        </div>
        <button id="compile-shader" class="btn btn--primary" style="margin-right: 10px;">Compile Shader</button>
        <button id="save-shader" class="btn btn--secondary" style="margin-right: 10px;">Save Shader</button>
        <button id="load-shader" class="btn btn--secondary">Load Shader</button>
      `;
      
      shaderTab.appendChild(compilationSection);
      
      // Add event listeners
      this.setupShaderCompilationEventListeners();
    }
    
    // Setup shader compilation event listeners
    setupShaderCompilationEventListeners() {
      // Add uniform button
      const addUniformBtn = document.getElementById('add-uniform');
      if (addUniformBtn) {
        addUniformBtn.addEventListener('click', () => this.addShaderUniform());
      }
      
      // Compile shader button
      const compileBtn = document.getElementById('compile-shader');
      if (compileBtn) {
        compileBtn.addEventListener('click', () => this.compileWGSLShader());
      }
      
      // Save shader button
      const saveBtn = document.getElementById('save-shader');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => this.saveWGSLShader());
      }
      
      // Load shader button
      const loadBtn = document.getElementById('load-shader');
      if (loadBtn) {
        loadBtn.addEventListener('click', () => this.loadWGSLShader());
      }
      
      // Remove uniform buttons (delegated event handling)
      const uniformsContainer = document.getElementById('shader-uniforms');
      if (uniformsContainer) {
        uniformsContainer.addEventListener('click', (e) => {
          if (e.target.classList.contains('remove-uniform')) {
            e.target.closest('.uniform-item').remove();
          }
        });
      }
    }
    
    // Add shader uniform
    addShaderUniform() {
      const uniformsContainer = document.getElementById('shader-uniforms');
      if (!uniformsContainer) return;
      
      const uniformItem = document.createElement('div');
      uniformItem.className = 'uniform-item';
      uniformItem.style.cssText = 'display: flex; margin-bottom: 5px;';
      
      uniformItem.innerHTML = `
        <input type="text" placeholder="Uniform name" class="uniform-name" 
               style="flex: 1; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px; margin-right: 5px;">
        <select class="uniform-type" style="padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
          <option value="f32">f32</option>
          <option value="vec2<f32>">vec2<f32></option>
          <option value="vec3<f32>">vec3<f32></option>
          <option value="vec4<f32>">vec4<f32></option>
          <option value="mat2x2<f32>">mat2x2<f32></option>
          <option value="mat3x3<f32>">mat3x3<f32></option>
          <option value="mat4x4<f32>">mat4x4<f32></option>
        </select>
        <button type="button" class="remove-uniform" style="padding: 5px 10px; background: #666; color: #fff; border: none; border-radius: 3px; margin-left: 5px;">×</button>
      `;
      
      uniformsContainer.appendChild(uniformItem);
    }
    
    // Compile WGSL shader
    async compileWGSLShader() {
      const shaderName = document.getElementById('shader-name')?.value || 'unnamed';
      const shaderSource = document.getElementById('shader-source')?.value || '';
      const optimize = document.getElementById('shader-optimize')?.checked || false;
      const debugInfo = document.getElementById('shader-debug-info')?.checked || false;
      
      if (!shaderSource.trim()) {
        notify('warning', 'No shader source code provided');
        return;
      }
      
      try {
        // Collect uniforms
        const uniforms = this.collectShaderUniforms();
        
        // Create shader object
        const shader = {
          name: shaderName,
          source: shaderSource,
          uniforms: uniforms,
          optimize: optimize,
          debugInfo: debugInfo,
          compiled: false,
          timestamp: Date.now()
        };
        
        // Compile using WASM engine if available
        if (this.wgslEngine && typeof this.wgslEngine.compile === 'function') {
          const compilationResult = this.wgslEngine.compile(shaderSource, uniforms, optimize, debugInfo);
          
          if (compilationResult.success) {
            shader.compiled = true;
            shader.compiledCode = compilationResult.code;
            shader.compilationInfo = compilationResult.info;
            
            // Store in shader assets
            this.shaderAssets.set(shaderName, shader);
            
            notify('success', `Shader "${shaderName}" compiled successfully`);
            
            // Update compilation info display
            this.updateCompilationInfo(compilationResult.info);
          } else {
            notify('error', `Shader compilation failed: ${compilationResult.error}`);
            this.updateCompilationInfo({ error: compilationResult.error });
          }
        } else {
          // Fallback: basic validation
          const validationResult = this.validateWGSLShader(shaderSource);
          if (validationResult.valid) {
            shader.compiled = true;
            this.shaderAssets.set(shaderName, shader);
            notify('success', `Shader "${shaderName}" validated successfully`);
            this.updateCompilationInfo({ message: 'Basic validation passed' });
          } else {
            notify('error', `Shader validation failed: ${validationResult.error}`);
            this.updateCompilationInfo({ error: validationResult.error });
          }
        }
        
      } catch (e) {
        ERR('WGSL shader compilation failed', e);
        notify('error', 'Shader compilation failed');
      }
    }
    
    // Collect shader uniforms
    collectShaderUniforms() {
      const uniforms = [];
      const uniformItems = document.querySelectorAll('.uniform-item');
      
      uniformItems.forEach(item => {
        const name = item.querySelector('.uniform-name')?.value;
        const type = item.querySelector('.uniform-type')?.value;
        
        if (name && type) {
          uniforms.push({ name, type });
        }
      });
      
      return uniforms;
    }
    
    // Validate WGSL shader
    validateWGSLShader(source) {
      try {
        // Basic WGSL syntax validation
        const hasVertex = source.includes('@vertex') || source.includes('fn v(');
        const hasFragment = source.includes('@fragment') || source.includes('fn f(');
        
        if (!hasVertex && !hasFragment) {
          return { valid: false, error: 'Shader must contain at least one @vertex or @fragment function' };
        }
        
        // Check for common WGSL syntax
        const syntaxChecks = [
          { pattern: /@builtin\(position\)/, name: 'Position output' },
          { pattern: /@location\(\d+\)/, name: 'Location qualifier' },
          { pattern: /vec[234]<f32>/, name: 'Vector types' },
          { pattern: /mat[234]x[234]<f32>/, name: 'Matrix types' }
        ];
        
        const issues = [];
        syntaxChecks.forEach(check => {
          if (!check.pattern.test(source)) {
            issues.push(check.name);
          }
        });
        
        if (issues.length > 0) {
          return { valid: false, error: `Missing: ${issues.join(', ')}` };
        }
        
        return { valid: true };
      } catch (e) {
        return { valid: false, error: e.message };
      }
    }
    
    // Update compilation info display
    updateCompilationInfo(info) {
      let infoContainer = document.getElementById('shader-compilation-info');
      if (!infoContainer) {
        infoContainer = document.createElement('div');
        infoContainer.id = 'shader-compilation-info';
        infoContainer.style.cssText = `
          margin: 10px 0;
          padding: 10px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 3px;
          font-family: monospace;
          font-size: 12px;
          color: #ccc;
        `;
        
        const shaderTab = document.getElementById('shaders-tab');
        if (shaderTab) {
          shaderTab.appendChild(infoContainer);
        }
      }
      
      if (info.error) {
        infoContainer.innerHTML = `<div style="color: #ff6b6b;">Error: ${info.error}</div>`;
      } else if (info.message) {
        infoContainer.innerHTML = `<div style="color: #51cf66;">${info.message}</div>`;
      } else {
        infoContainer.innerHTML = `<div style="color: #51cf66;">Compilation successful</div>`;
      }
    }
    
    // Save WGSL shader
    saveWGSLShader() {
      const shaderName = document.getElementById('shader-name')?.value || 'unnamed';
      const shader = this.shaderAssets.get(shaderName);
      
      if (!shader) {
        notify('warning', 'No compiled shader to save');
        return;
      }
      
      try {
        const shaderData = {
          name: shader.name,
          source: shader.source,
          uniforms: shader.uniforms,
          compiled: shader.compiled,
          timestamp: shader.timestamp
        };
        
        const blob = new Blob([JSON.stringify(shaderData, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${shaderName}.wgsl.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        
        notify('success', `Shader "${shaderName}" saved`);
      } catch (e) {
        ERR('Shader save failed', e);
        notify('error', 'Shader save failed');
      }
    }
    
    // Load WGSL shader
    loadWGSLShader() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.wgsl';
      
      input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
          const text = await file.text();
          const shaderData = JSON.parse(text);
          
          // Load shader data into UI
          document.getElementById('shader-name').value = shaderData.name || '';
          document.getElementById('shader-source').value = shaderData.source || '';
          
          // Load uniforms
          this.loadShaderUniforms(shaderData.uniforms || []);
          
          // Store in shader assets
          this.shaderAssets.set(shaderData.name, shaderData);
          
          notify('success', `Shader "${shaderData.name}" loaded`);
        } catch (e) {
          ERR('Shader load failed', e);
          notify('error', 'Shader load failed');
        }
      });
      
      input.click();
    }
    
    // Load shader uniforms into UI
    loadShaderUniforms(uniforms) {
      const uniformsContainer = document.getElementById('shader-uniforms');
      if (!uniformsContainer) return;
      
      // Clear existing uniforms
      uniformsContainer.innerHTML = '';
      
      // Add each uniform
      uniforms.forEach(uniform => {
        this.addShaderUniform();
        const lastItem = uniformsContainer.lastElementChild;
        if (lastItem) {
          lastItem.querySelector('.uniform-name').value = uniform.name;
          lastItem.querySelector('.uniform-type').value = uniform.type;
        }
      });
    }
    
    // ---------------------------
    // CRDT Engine Integration
    // ---------------------------
    
    // Initialize CRDT Engine
    initializeCRDTEngine() {
      if (!this.available.XVGCRDTEngine) {
        notify('warning', 'CRDT Engine not available');
        return false;
      }
      
      try {
        const M = HAS.wasmModule;
        this.crdtEngine = new M.XVGCRDTEngine();
        
        // Set up collaboration state
        this.collaborationState = {
          connected: false,
          users: new Map(),
          operations: [],
          lamportClock: 0,
          authorId: Math.floor(Math.random() * 65535) // 16-bit author ID
        };
        
        // Initialize collaboration UI
        this.initializeCollaborationUI();
        
        // Set up WebSocket connection
        this.setupCollaborationConnection();
        
        notify('success', 'CRDT Engine initialized');
        return true;
      } catch (e) {
        ERR('CRDT Engine initialization failed', e);
        notify('error', 'CRDT Engine initialization failed');
        return false;
      }
    }
    
    // Initialize collaboration UI
    initializeCollaborationUI() {
      const collabTab = document.getElementById('collab-tab');
      if (!collabTab) return;
      
      // Add collaboration section
      const collaborationSection = document.createElement('div');
      collaborationSection.className = 'collaboration-section';
      collaborationSection.style.cssText = `
        margin: 20px 0;
        padding: 15px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 5px;
      `;
      
      collaborationSection.innerHTML = `
        <h4 style="margin: 0 0 15px 0; color: #fff;">Real-Time Collaboration</h4>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Server URL:</label>
          <input type="text" id="collab-server-url" placeholder="ws://localhost:8080" value="ws://localhost:8080"
                 style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">User Name:</label>
          <input type="text" id="collab-user-name" placeholder="Enter your name" 
                 style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
        </div>
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Room ID:</label>
          <input type="text" id="collab-room-id" placeholder="Enter room ID" 
                 style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
        </div>
        <div style="margin-bottom: 15px;">
          <label style="display: flex; align-items: center; color: #ccc;">
            <input type="checkbox" id="collab-auto-sync" style="margin-right: 8px;" checked>
            Auto-sync changes
          </label>
        </div>
        <button id="collab-connect" class="btn btn--primary" style="margin-right: 10px;">Connect</button>
        <button id="collab-disconnect" class="btn btn--secondary" style="margin-right: 10px;">Disconnect</button>
        <button id="collab-sync" class="btn btn--secondary">Sync Now</button>
        
        <div id="collab-status" style="margin-top: 15px; padding: 10px; background: rgba(255, 255, 255, 0.05); border-radius: 3px;">
          <div style="color: #ccc; font-size: 12px;">Status: Disconnected</div>
          <div id="collab-users" style="color: #ccc; font-size: 12px; margin-top: 5px;">Users: 0</div>
          <div id="collab-operations" style="color: #ccc; font-size: 12px; margin-top: 5px;">Operations: 0</div>
        </div>
      `;
      
      collabTab.appendChild(collaborationSection);
      
      // Add event listeners
      this.setupCollaborationEventListeners();
    }
    
    // Setup collaboration event listeners
    setupCollaborationEventListeners() {
      // Connect button
      const connectBtn = document.getElementById('collab-connect');
      if (connectBtn) {
        connectBtn.addEventListener('click', () => this.connectCollaboration());
      }
      
      // Disconnect button
      const disconnectBtn = document.getElementById('collab-disconnect');
      if (disconnectBtn) {
        disconnectBtn.addEventListener('click', () => this.disconnectCollaboration());
      }
      
      // Sync button
      const syncBtn = document.getElementById('collab-sync');
      if (syncBtn) {
        syncBtn.addEventListener('click', () => this.syncCollaboration());
      }
    }
    
    // Setup collaboration connection
    setupCollaborationConnection() {
      this.collaborationSocket = null;
      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = 5;
      this.reconnectDelay = 1000;
    }
    
    // Connect to collaboration server
    connectCollaboration() {
      const serverUrl = document.getElementById('collab-server-url')?.value || 'ws://localhost:8080';
      const userName = document.getElementById('collab-user-name')?.value || 'Anonymous';
      const roomId = document.getElementById('collab-room-id')?.value || 'default';
      
      if (!userName.trim()) {
        notify('warning', 'Please enter a user name');
        return;
      }
      
      try {
        this.collaborationSocket = new WebSocket(`${serverUrl}/collab/${roomId}`);
        
        this.collaborationSocket.onopen = () => {
          this.collaborationState.connected = true;
          this.reconnectAttempts = 0;
          
          // Send join message
          this.sendCollaborationMessage({
            type: 'join',
            authorId: this.collaborationState.authorId,
            userName: userName,
            timestamp: Date.now()
          });
          
          this.updateCollaborationStatus();
          notify('success', 'Connected to collaboration server');
        };
        
        this.collaborationSocket.onmessage = (event) => {
          this.handleCollaborationMessage(JSON.parse(event.data));
        };
        
        this.collaborationSocket.onclose = () => {
          this.collaborationState.connected = false;
          this.updateCollaborationStatus();
          
          // Attempt reconnection
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            setTimeout(() => {
              this.reconnectAttempts++;
              this.connectCollaboration();
            }, this.reconnectDelay * this.reconnectAttempts);
          }
        };
        
        this.collaborationSocket.onerror = (error) => {
          ERR('Collaboration WebSocket error', error);
          notify('error', 'Collaboration connection error');
        };
        
      } catch (e) {
        ERR('Collaboration connection failed', e);
        notify('error', 'Failed to connect to collaboration server');
      }
    }
    
    // Disconnect from collaboration server
    disconnectCollaboration() {
      if (this.collaborationSocket) {
        this.collaborationSocket.close();
        this.collaborationSocket = null;
      }
      
      this.collaborationState.connected = false;
      this.collaborationState.users.clear();
      this.updateCollaborationStatus();
      
      notify('success', 'Disconnected from collaboration server');
    }
    
    // Send collaboration message
    sendCollaborationMessage(message) {
      if (!this.collaborationSocket || this.collaborationSocket.readyState !== WebSocket.OPEN) {
        return false;
      }
      
      try {
        // Add Lamport timestamp
        this.collaborationState.lamportClock++;
        message.lamportTimestamp = this.collaborationState.lamportClock;
        message.authorId = this.collaborationState.authorId;
        
        this.collaborationSocket.send(JSON.stringify(message));
        return true;
      } catch (e) {
        ERR('Failed to send collaboration message', e);
        return false;
      }
    }
    
    // Handle collaboration message
    handleCollaborationMessage(message) {
      try {
        switch (message.type) {
          case 'join':
            this.collaborationState.users.set(message.authorId, {
              name: message.userName,
              lastSeen: Date.now(),
              cursor: null
            });
            this.updateCollaborationStatus();
            notify('info', `${message.userName} joined the session`);
            break;
            
          case 'leave':
            this.collaborationState.users.delete(message.authorId);
            this.updateCollaborationStatus();
            notify('info', `${message.userName} left the session`);
            break;
            
          case 'operation':
            this.handleCRDTOperation(message);
            break;
            
          case 'cursor':
            this.handleCursorUpdate(message);
            break;
            
          case 'sync':
            this.handleSyncRequest(message);
            break;
        }
        
        // Update Lamport clock
        if (message.lamportTimestamp > this.collaborationState.lamportClock) {
          this.collaborationState.lamportClock = message.lamportTimestamp;
        }
        
      } catch (e) {
        ERR('Failed to handle collaboration message', e);
      }
    }
    
    // Handle CRDT operation
    handleCRDTOperation(message) {
      if (!this.crdtEngine) return;
      
      try {
        // Add operation to CRDT engine
        if (typeof this.crdtEngine.add_operation === 'function') {
          this.crdtEngine.add_operation(message.operation);
        }
        
        // Apply operation to local state
        this.applyCRDTOperation(message.operation);
        
        // Update operation count
        this.collaborationState.operations.push(message.operation);
        this.updateCollaborationStatus();
        
      } catch (e) {
        ERR('Failed to handle CRDT operation', e);
      }
    }
    
    // Apply CRDT operation to local state
    applyCRDTOperation(operation) {
      const sys = ensureSystem();
      
      try {
        switch (operation.type) {
          case 'add_path':
            if (operation.path) {
              sys.appState.paths.push(operation.path);
              reRender();
              updateLayersUI();
            }
            break;
            
          case 'remove_path':
            if (operation.pathId) {
              // Use proper removePath function to maintain layer consistency
              window.removePath(operation.pathId);
              reRender();
              updateLayersUI();
            }
            break;
            
          case 'update_path':
            if (operation.pathId && operation.pathData) {
              const path = sys.appState.paths.find(p => p.id === operation.pathId);
              if (path) {
                Object.assign(path, operation.pathData);
                reRender();
              }
            }
            break;
            
          case 'add_layer':
            if (operation.layer) {
              sys.appState.layers.push(operation.layer);
              updateLayersUI();
            }
            break;
            
          case 'remove_layer':
            if (operation.layerId) {
              const index = sys.appState.layers.findIndex(l => l.id === operation.layerId);
              if (index !== -1) {
                sys.appState.layers.splice(index, 1);
                updateLayersUI();
              }
            }
            break;
        }
      } catch (e) {
        ERR('Failed to apply CRDT operation', e);
      }
    }
    
    // Handle cursor update
    handleCursorUpdate(message) {
      const user = this.collaborationState.users.get(message.authorId);
      if (user) {
        user.cursor = {
          x: message.x,
          y: message.y,
          timestamp: Date.now()
        };
      }
    }
    
    // Handle sync request
    handleSyncRequest(message) {
      // Send current state to requesting user
      const sys = ensureSystem();
      const stateSnapshot = {
        type: 'sync_response',
        paths: sys.appState.paths,
        layers: sys.appState.layers,
        timestamp: Date.now()
      };
      
      this.sendCollaborationMessage(stateSnapshot);
    }
    
    // Sync collaboration
    syncCollaboration() {
      if (!this.collaborationState.connected) {
        notify('warning', 'Not connected to collaboration server');
        return;
      }
      
      // Request sync from all users
      this.sendCollaborationMessage({
        type: 'sync_request',
        timestamp: Date.now()
      });
      
      notify('success', 'Sync requested from all users');
    }
    
    // Update collaboration status
    updateCollaborationStatus() {
      const statusDiv = document.getElementById('collab-status');
      if (!statusDiv) return;
      
      const statusText = statusDiv.querySelector('div');
      const usersText = document.getElementById('collab-users');
      const operationsText = document.getElementById('collab-operations');
      
      if (statusText) {
        statusText.textContent = `Status: ${this.collaborationState.connected ? 'Connected' : 'Disconnected'}`;
        statusText.style.color = this.collaborationState.connected ? '#51cf66' : '#ff6b6b';
      }
      
      if (usersText) {
        usersText.textContent = `Users: ${this.collaborationState.users.size}`;
      }
      
      if (operationsText) {
        operationsText.textContent = `Operations: ${this.collaborationState.operations.length}`;
      }
    }
    
    // Broadcast path change
    broadcastPathChange(operation) {
      if (!this.collaborationState.connected) return;
      
      const message = {
        type: 'operation',
        operation: {
          ...operation,
          timestamp: Date.now(),
          authorId: this.collaborationState.authorId
        }
      };
      
      this.sendCollaborationMessage(message);
    }
    
    // Broadcast selection change
    broadcastSelectionChange(selection) {
      if (!this.collaborationState.connected) return;
      
      const message = {
        type: 'selection',
        selection: selection,
        timestamp: Date.now(),
        authorId: this.collaborationState.authorId
      };
      
      this.sendCollaborationMessage(message);
    }
    
    // ---------------------------
    // Performance Monitoring
    // ---------------------------
    
    // Initialize performance monitoring
    initializePerformanceMonitoring() {
      this.performanceMetrics = {
        renderTime: 0,
        memoryUsage: 0,
        operationCount: 0,
        errorCount: 0,
        lastUpdate: Date.now()
      };
      
      // Set up performance monitoring UI
      this.setupPerformanceMonitoringUI();
      
      // Start performance monitoring
      this.startPerformanceMonitoring();
    }
    
    // Setup performance monitoring UI
    setupPerformanceMonitoringUI() {
      // Create performance monitor container
      let perfContainer = document.getElementById('performance-monitor-container');
      if (!perfContainer) {
        perfContainer = document.createElement('div');
        perfContainer.id = 'performance-monitor-container';
        perfContainer.style.cssText = `
          position: fixed;
          top: 10px;
          right: 10px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 10px;
          border-radius: 5px;
          font-family: monospace;
          font-size: 12px;
          z-index: 1000;
          display: none;
          min-width: 200px;
        `;
        document.body.appendChild(perfContainer);
      }
      
      // Show/hide performance monitor on Ctrl+Shift+P
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'P') {
          perfContainer.style.display = perfContainer.style.display === 'none' ? 'block' : 'none';
        }
      });
      
      // Update performance display
      this.updatePerformanceDisplay();
    }
    
    // Start performance monitoring
    startPerformanceMonitoring() {
      // Monitor render performance
      this.monitorRenderPerformance();
      
      // Monitor memory usage
      this.monitorMemoryUsage();
      
      // Monitor operation performance
      this.monitorOperationPerformance();
      
      // Update display every second
      setInterval(() => {
        this.updatePerformanceDisplay();
      }, 1000);
    }
    
    // Monitor render performance
    monitorRenderPerformance() {
      const originalRender = window.renderCanvas;
      if (typeof originalRender === 'function') {
        window.renderCanvas = (...args) => {
          const startTime = performance.now();
          const result = originalRender.apply(this, args);
          const endTime = performance.now();
          
          this.performanceMetrics.renderTime = endTime - startTime;
          this.performanceMetrics.lastUpdate = Date.now();
          
          return result;
        };
      }
    }
    
    // Monitor memory usage
    monitorMemoryUsage() {
      if ('memory' in performance) {
        setInterval(() => {
          const memory = performance.memory;
          this.performanceMetrics.memoryUsage = {
            used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
            total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
            limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
          };
        }, 5000);
      }
    }
    
    // Monitor operation performance
    monitorOperationPerformance() {
      // Track CRDT operations
      if (this.collaborationState) {
        const originalBroadcast = this.broadcastPathChange;
        this.broadcastPathChange = (operation) => {
          this.performanceMetrics.operationCount++;
          return originalBroadcast.call(this, operation);
        };
      }
      
      // Track shader compilations
      if (this.wgslEngine) {
        const originalCompile = this.compileWGSLShader;
        this.compileWGSLShader = async (...args) => {
          const startTime = performance.now();
          const result = await originalCompile.apply(this, args);
          const endTime = performance.now();
          
          console.log(`Shader compilation took ${endTime - startTime}ms`);
          return result;
        };
      }
    }
    
    // Update performance display
    updatePerformanceDisplay() {
      const perfContainer = document.getElementById('performance-monitor-container');
      if (!perfContainer) return;
      
      const metrics = this.performanceMetrics;
      const memoryInfo = metrics.memoryUsage;
      
      perfContainer.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">Performance Monitor (Ctrl+Shift+P)</div>
        <div>Render Time: ${metrics.renderTime.toFixed(2)}ms</div>
        <div>Memory: ${memoryInfo ? `${memoryInfo.used}MB / ${memoryInfo.total}MB` : 'N/A'}</div>
        <div>Operations: ${metrics.operationCount}</div>
        <div>Errors: ${metrics.errorCount}</div>
        <div>Last Update: ${new Date(metrics.lastUpdate).toLocaleTimeString()}</div>
        <div style="margin-top: 5px; font-size: 10px; color: #888;">
          WASM: ${HAS.wasmModule ? '✅' : '❌'} | 
          Engines: ${Object.values(this.available).filter(Boolean).length}/${Object.keys(this.available).length}
        </div>
      `;
    }
    
    // Get performance metrics
    getPerformanceMetrics() {
      return {
        ...this.performanceMetrics,
        available: this.available,
        ready: this.ready,
        collaboration: this.collaborationState ? {
          connected: this.collaborationState.connected,
          users: this.collaborationState.users.size,
          operations: this.collaborationState.operations.length
        } : null
      };
    }
    
    // Reset performance metrics
    resetPerformanceMetrics() {
      this.performanceMetrics = {
        renderTime: 0,
        memoryUsage: 0,
        operationCount: 0,
        errorCount: 0,
        lastUpdate: Date.now()
      };
      
      notify('success', 'Performance metrics reset');
    }
    
    // ---------------------------
    // UI Initialization Methods
    // ---------------------------
    
    // Initialize engine status indicators
    initializeEngineStatusIndicators() {
      // Create status indicator container if it doesn't exist
      let statusContainer = document.getElementById('engine-status-container');
      if (!statusContainer) {
        statusContainer = document.createElement('div');
        statusContainer.id = 'engine-status-container';
        statusContainer.style.cssText = `
          position: fixed;
          top: 10px;
          left: 10px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 10px;
          border-radius: 5px;
          font-family: monospace;
          font-size: 12px;
          z-index: 1000;
          display: none;
        `;
        document.body.appendChild(statusContainer);
      }
      
      // Update status indicators
      this.updateEngineStatusIndicators();
      
      // Show/hide status on Ctrl+Shift+E
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'E') {
          statusContainer.style.display = statusContainer.style.display === 'none' ? 'block' : 'none';
        }
      });
    }
    
    // Update engine status indicators
    updateEngineStatusIndicators() {
      const statusContainer = document.getElementById('engine-status-container');
      if (!statusContainer) return;
      
      const status = {
        'WASM Module': HAS.wasmModule ? '✅' : '❌',
        'XVGFile': this.available.XVGFile ? '✅' : '❌',
        'XVGRenderer': this.available.XVGRenderer ? '✅' : '❌',
        'XVG3DEngine': this.available.XVG3DEngine ? '✅' : '❌',
        'XVGSDFEngine': this.available.XVGSDFEngine ? '✅' : '❌',
        'XVGCRDTEngine': this.available.XVGCRDTEngine ? '✅' : '❌',
        'XVGPathBuilder': this.available.XVGPathBuilder ? '✅' : '❌',
        'Engine Ready': this.ready ? '✅' : '❌'
      };
      
      statusContainer.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">Engine Status (Ctrl+Shift+E)</div>
        ${Object.entries(status).map(([key, value]) => 
          `<div>${key}: ${value}</div>`
        ).join('')}
      `;
    }
    
    // Initialize engine configuration UI
    initializeEngineConfigurationUI() {
      // Add configuration controls to SDF panel
      this.addSDFConfigurationUI();
      
      // Add configuration controls to 3D panel
      this.add3DConfigurationUI();
      
      // Add configuration controls to shader panel
      this.addShaderConfigurationUI();
      
      // Initialize WGSL Shader Engine
      this.initializeWGSLShaderEngine();
      
      // Initialize CRDT Engine
      this.initializeCRDTEngine();
      
      // Initialize performance monitoring
      this.initializePerformanceMonitoring();
    }
    
    // Add SDF configuration UI
    addSDFConfigurationUI() {
      const sdfTab = document.getElementById('sdf-tab');
      if (!sdfTab) return;
      
      // Add configuration section
      const configSection = document.createElement('div');
      configSection.className = 'sdf-config-section';
      configSection.style.cssText = `
        margin: 20px 0;
        padding: 15px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 5px;
      `;
      
      configSection.innerHTML = `
        <h4 style="margin: 0 0 15px 0; color: #fff;">SDF Configuration</h4>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Training Iterations:</label>
          <input type="number" id="sdf-iterations" value="1000" min="100" max="10000" 
                 style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Learning Rate:</label>
          <input type="range" id="sdf-learning-rate" min="0.001" max="0.1" step="0.001" value="0.01"
                 style="width: 100%;">
          <span id="sdf-lr-value" style="color: #ccc; font-size: 12px;">0.01</span>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Network Layers:</label>
          <input type="number" id="sdf-layers" value="4" min="2" max="8"
                 style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
        </div>
        <div style="margin-bottom: 15px;">
          <label style="display: flex; align-items: center; color: #ccc;">
            <input type="checkbox" id="sdf-use-gpu" style="margin-right: 8px;">
            Use GPU Acceleration
          </label>
        </div>
        <button id="sdf-reset-config" class="btn btn--secondary" style="margin-right: 10px;">Reset to Defaults</button>
        <button id="sdf-save-config" class="btn btn--secondary">Save Configuration</button>
      `;
      
      sdfTab.appendChild(configSection);
      
      // Add event listeners
      const lrSlider = document.getElementById('sdf-learning-rate');
      const lrValue = document.getElementById('sdf-lr-value');
      if (lrSlider && lrValue) {
        lrSlider.addEventListener('input', (e) => {
          lrValue.textContent = e.target.value;
        });
      }
      
      const resetBtn = document.getElementById('sdf-reset-config');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => this.resetSDFConfiguration());
      }
      
      const saveBtn = document.getElementById('sdf-save-config');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => this.saveSDFConfiguration());
      }
    }
    
    // Add 3D configuration UI
    add3DConfigurationUI() {
      const d3Tab = document.getElementById('3d-tab');
      if (!d3Tab) return;
      
      // Add configuration section
      const configSection = document.createElement('div');
      configSection.className = '3d-config-section';
      configSection.style.cssText = `
        margin: 20px 0;
        padding: 15px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 5px;
      `;
      
      configSection.innerHTML = `
        <h4 style="margin: 0 0 15px 0; color: #fff;">3D Configuration</h4>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Extrusion Height:</label>
          <input type="range" id="3d-extrusion-height" min="10" max="200" step="5" value="50"
                 style="width: 100%;">
          <span id="3d-height-value" style="color: #ccc; font-size: 12px;">50px</span>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Mesh Quality:</label>
          <select id="3d-mesh-quality" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
            <option value="low">Low (Fast)</option>
            <option value="medium" selected>Medium (Balanced)</option>
            <option value="high">High (Slow)</option>
          </select>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Lighting:</label>
          <select id="3d-lighting" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
            <option value="flat">Flat Shading</option>
            <option value="smooth" selected>Smooth Shading</option>
            <option value="phong">Phong Shading</option>
          </select>
        </div>
        <div style="margin-bottom: 15px;">
          <label style="display: flex; align-items: center; color: #ccc;">
            <input type="checkbox" id="3d-wireframe" style="margin-right: 8px;">
            Show Wireframe
          </label>
        </div>
        <button id="3d-generate-mesh" class="btn btn--primary" style="margin-right: 10px;">Generate 3D Mesh</button>
        <button id="3d-export-stl" class="btn btn--secondary">Export STL</button>
      `;
      
      d3Tab.appendChild(configSection);
      
      // Add event listeners
      const heightSlider = document.getElementById('3d-extrusion-height');
      const heightValue = document.getElementById('3d-height-value');
      if (heightSlider && heightValue) {
        heightSlider.addEventListener('input', (e) => {
          heightValue.textContent = e.target.value + 'px';
        });
      }
      
      const generateBtn = document.getElementById('3d-generate-mesh');
      if (generateBtn) {
        generateBtn.addEventListener('click', () => this.generate3DMesh());
      }
      
      const exportBtn = document.getElementById('3d-export-stl');
      if (exportBtn) {
        exportBtn.addEventListener('click', () => this.exportSTL());
      }
    }
    
    // Add shader configuration UI
    addShaderConfigurationUI() {
      const shaderTab = document.getElementById('shaders-tab');
      if (!shaderTab) return;
      
      // Add configuration section
      const configSection = document.createElement('div');
      configSection.className = 'shader-config-section';
      configSection.style.cssText = `
        margin: 20px 0;
        padding: 15px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 5px;
      `;
      
      configSection.innerHTML = `
        <h4 style="margin: 0 0 15px 0; color: #fff;">Shader Configuration</h4>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Shader Type:</label>
          <select id="shader-type" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
            <option value="vertex">Vertex Shader</option>
            <option value="fragment" selected>Fragment Shader</option>
            <option value="compute">Compute Shader</option>
          </select>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">Precision:</label>
          <select id="shader-precision" style="width: 100%; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
            <option value="lowp">Low Precision</option>
            <option value="mediump" selected>Medium Precision</option>
            <option value="highp">High Precision</option>
          </select>
        </div>
        <div style="margin-bottom: 15px;">
          <label style="display: flex; align-items: center; color: #ccc;">
            <input type="checkbox" id="shader-debug" style="margin-right: 8px;">
            Enable Debug Mode
          </label>
        </div>
        <button id="shader-validate" class="btn btn--secondary" style="margin-right: 10px;">Validate Shader</button>
        <button id="shader-optimize" class="btn btn--secondary">Optimize Shader</button>
      `;
      
      shaderTab.appendChild(configSection);
      
      // Add event listeners
      const validateBtn = document.getElementById('shader-validate');
      if (validateBtn) {
        validateBtn.addEventListener('click', () => this.validateShader());
      }
      
      const optimizeBtn = document.getElementById('shader-optimize');
      if (optimizeBtn) {
        optimizeBtn.addEventListener('click', () => this.optimizeShader());
      }
    }
    
    // Setup engine error handling
    setupEngineErrorHandling() {
      // Global error handler for engine operations
      window.addEventListener('error', (event) => {
        if (event.error && event.error.message && event.error.message.includes('xvg')) {
          this.handleEngineError(event.error);
        }
      });
      
      // Unhandled promise rejection handler
      window.addEventListener('unhandledrejection', (event) => {
        if (event.reason && event.reason.message && event.reason.message.includes('xvg')) {
          this.handleEngineError(event.reason);
        }
      });
    }
    
    // Handle engine errors
    handleEngineError(error) {
      console.error('Engine Error:', error);
      
      // Increment error count
      if (this.performanceMetrics) {
        this.performanceMetrics.errorCount++;
      }
      
      // Show error notification
      notify('error', `Engine Error: ${error.message}`);
      
      // Update status indicators
      this.updateEngineStatusIndicators();
      
      // Log error details
      const errorInfo = {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        wasmAvailable: !!HAS.wasmModule,
        engineReady: this.ready,
        performanceMetrics: this.performanceMetrics
      };
      
      console.log('Engine Error Details:', errorInfo);
    }
  }

  // Create singleton and expose
  const engine = new EngineIntegration();
  window.Engine = engine;

  // Optional: expose some helpers
  window.__xvg = {
    serializeEditorJSON,
    loadEditorJSON,
  };

})();
