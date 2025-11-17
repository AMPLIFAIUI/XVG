# XVG Zero-Conversion WASM Architecture

This document describes the zero-conversion WASM runtime architecture for XVG, ensuring all critical rendering and state management happens through Rust/WASM with no JavaScript fallbacks.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     XVG Editor (Browser)                     │
├─────────────────────────────────────────────────────────────┤
│  xvg-editor/src/index.js                                    │
│  └── Initializes WASM and exposes engines globally          │
│                                                              │
│  xvg-editor/pkg/xvg-engine-integration.js                   │
│  └── Creates window.xvgEngines with WASM instances          │
│                                                              │
│  xvg-editor/pkg/xvg-core.js                                 │
│  └── UI controller, calls window.xvgEngines methods         │
│                                                              │
│  xvg-editor/pkg/xvg-tools.js, xvg-utilities.js              │
│  └── UI helpers (grid, rulers, selection, etc.)             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              WASM Bindings (xvg-wasm)                       │
├─────────────────────────────────────────────────────────────┤
│  Exports to JavaScript:                                     │
│  • XVGRuntime        - Main runtime (render, extract, CRDT) │
│  • XVGFile           - File operations                      │
│  • XVGSDFEngine      - SDF neural engine                    │
│  • XVG3DEngine       - 3D mesh generation                   │
│  • XVGCRDTEngine     - Collaboration engine                 │
│  • applyCrdtOp       - Standalone CRDT function             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│            Core Runtime (xvg-runtime)                       │
├─────────────────────────────────────────────────────────────┤
│  • XVGRuntime struct with engines                           │
│  • CPU rasterization (tiny-skia)                            │
│  • GPU rendering (WGPU, when feature enabled)               │
│  • CRDT operations with Lamport timestamps                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Engine Layer (xvg-core)                        │
├─────────────────────────────────────────────────────────────┤
│  • SDFEngine     - Neural SDF evaluation                    │
│  • Scene3DEngine - 3D extrusion and mesh generation         │
│  • CRDTEngine    - Operational transformation               │
│  • File codec    - Binary format encoding/decoding          │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

### Rust/WASM Layer

#### `xvg-runtime/src/lib.rs`
- **XVGRuntime**: Main runtime struct containing:
  - `file: File` - XVG file data
  - `sdf_engine: SDFEngine` - SDF neural network
  - `scene_3d_engine: Scene3DEngine` - 3D mesh generator
  - `crdt_engine: CRDTEngine` - CRDT collaboration
- **Methods**:
  - `load(data: &[u8])` - Load XVG file from bytes
  - `render(width, height, target)` - Render to bitmap/GPU
  - `extract(format)` - Extract to SVG/PNG
  - `apply_crdt_op(op)` - Apply CRDT operation

#### `xvg-runtime/Cargo.toml`
- Features: `gpu` (WGPU), `wasm` (wasm-bindgen)
- Dependencies: `tiny-skia`, `image`, `serde`, `anyhow`

#### `xvg-wasm/src/lib.rs`
Exports to JavaScript:
```rust
#[wasm_bindgen(js_name = XVGRuntime)]
pub struct XVGRuntimeWasm(XVGRuntime);

#[wasm_bindgen(js_name = XVGFile)]
pub struct XVGFileWasm(File);

#[wasm_bindgen(js_name = XVGSDFEngine)]
pub struct XVGSDFEngineWasm(SDFEngine);

#[wasm_bindgen(js_name = XVG3DEngine)]
pub struct XVG3DEngineWasm(Scene3DEngine);

#[wasm_bindgen(js_name = XVGCRDTEngine)]
pub struct XVGCRDTEngineWasm(CRDTEngine);

#[wasm_bindgen(js_name = applyCrdtOp)]
pub fn apply_crdt_op(runtime: &mut XVGRuntimeWasm, op_json: &str);
```

#### `xvg-wasm/Cargo.toml`
- Dependencies: `xvg-runtime` (with features = ["wasm"])
- WASM-specific: `wasm-bindgen`, `js-sys`, `serde-wasm-bindgen`

### JavaScript Layer

#### `xvg-editor/modules/` (Generated)
- `xvg_wasm.js` - WASM module loader
- `xvg_wasm.d.ts` - TypeScript definitions
- `xvg_wasm_bg.wasm` - Compiled WASM binary

#### `xvg-editor/src/index.js`
Entry point that:
1. Imports WASM module and engines
2. Initializes WASM with `await init()`
3. Exposes engines globally:
   ```js
   window.XVGRuntime = XVGRuntime;
   window.XVGFile = XVGFile;
   window.XVGSDFEngine = XVGSDFEngine;
   window.XVG3DEngine = XVG3DEngine;
   window.XVGCRDTEngine = XVGCRDTEngine;
   ```
4. Initializes engine integration layer
5. Starts the UI

#### `xvg-editor/pkg/xvg-engine-integration.js`
Creates `window.xvgEngines` object with WASM engine instances:
```js
window.xvgEngines = {
  sdf: new XVGSDFEngine(),
  threeD: new XVG3DEngine(),
  crdt: new XVGCRDTEngine(authorId),
  file: new XVGFile(width, height)
}
```

#### `xvg-editor/pkg/xvg-core.js`
- Main UI controller
- Calls `window.xvgEngines` methods for all critical operations
- PR #11 grid/ruler/tool improvements preserved
- **No duplicate engine implementations**

#### `xvg-editor/pkg/xvg-tools.js`, `xvg-utilities.js`
- UI helpers for selection, hit testing, grid rendering
- Functions like `calculateDistanceToPaths()` are UI-only helpers
- Do NOT replace WASM engine functionality

## Build Process

### 1. Build WASM Module
```bash
cd xvg-wasm
wasm-pack build --target web --out-dir ../xvg-editor/modules --out-name xvg_wasm
```

Or use the npm script:
```bash
cd xvg-editor
npm run build:wasm
```

### 2. Build Editor
```bash
cd xvg-editor
npm run build  # Automatically runs build:wasm first (prebuild hook)
```

### 3. Build Desktop App
```bash
cd xvg-desktop
npm install
npm run tauri build
```

## Data Flow

### Rendering
```
User Action
  ↓
xvg-core.js (UI controller)
  ↓
window.xvgEngines.sdf.evaluateSDF(x, y)
  ↓
WASM: XVGSDFEngine.evaluate_sdf([x, y])
  ↓
Rust: SDFEngine neural network evaluation
  ↓
Return distance value to JS
```

### CRDT Operations
```
User Edit (create/move/delete path)
  ↓
xvg-core.js creates CRDT operation JSON
  ↓
window.xvgEngines.crdt or runtime.applyCrdtOp(json)
  ↓
WASM: XVGCRDTEngine.add_operation(...)
  ↓
Rust: CRDTEngine with Lamport timestamps
  ↓
Update document state, sync with peers
```

### File Operations
```
Save File
  ↓
xvg-core.js collects paths
  ↓
window.xvgEngines.file.encode_bytes()
  ↓
WASM: XVGFile.encode()
  ↓
Rust: Binary encoding with zstd compression
  ↓
Return Uint8Array to JS for download
```

## JavaScript Fallback Policy

### ❌ REMOVED/PROHIBITED
- Duplicate JS implementations of engines
- JS-based rendering that bypasses WASM
- JS-based CRDT that doesn't use WASM

### ✅ ALLOWED
- UI helpers (grid drawing, ruler rendering)
- Hit testing for selection (`calculateDistanceToPaths`)
- Local undo stack as fallback when CRDT unavailable
- Coordinate transformations for UI

### Rule of Thumb
**If it affects the file state or rendering output, it MUST go through WASM.**
**If it's purely UI/UX, it can stay in JS.**

## Testing WASM Integration

### Browser Console Test
```js
// Test WASM module is loaded
console.log(window.XVGRuntime);        // Should show class constructor
console.log(window.XVGSDFEngine);      // Should show class constructor
console.log(window.xvgEngines);        // Should show engine instances

// Test engine creation
const sdf = new XVGSDFEngine();
sdf.initializeWeights();
const dist = sdf.evaluateSDF(0.5, 0.5);
console.log('SDF distance:', dist);    // Should show a number

// Test file operations
const file = new XVGFile(800, 600);
console.log('Path count:', file.path_count);  // Should be 0
```

### Manual Test
1. Open `xvg-editor/index.html` in browser
2. Check console for "✅ WebAssembly module initialized successfully"
3. Check console for "🚀 XVG Editor is now running with WASM-based core engines"
4. Test drawing tools - all operations should go through WASM
5. Check Network tab - should see `xvg_wasm_bg.wasm` loaded

## Debugging

### WASM Not Loading
- Check browser console for errors
- Verify `xvg_wasm_bg.wasm` file exists in `modules/`
- Check CORS if loading from file://
- Use `window.testXVGWasm()` function for diagnostics

### Engines Not Initializing
- Check `window.xvgEngines` in console
- Verify engine constructors exist: `window.XVGSDFEngine`, etc.
- Check for import errors in `index.js`

### Performance Issues
- Use browser DevTools Performance tab
- Check if WASM functions are being called (not JS fallbacks)
- Monitor WASM memory usage

## Future Enhancements

1. **GPU Rendering**: Enable `gpu` feature in xvg-runtime for WebGPU acceleration
2. **Streaming**: Implement streaming file loading for large files
3. **Workers**: Move WASM to Web Worker for better UI responsiveness
4. **Shared Memory**: Use SharedArrayBuffer for zero-copy data passing

## References

- [WASM Bindgen Guide](https://rustwasm.github.io/wasm-bindgen/)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/)
- [XVG Specification](docs/XVG_FULL_SPECIFICATION.md)
- [Zero-Conversion Commit](https://github.com/AMPLIFAIUI/XVG/commit/521015b)
