# XVG Desktop Integration

This document explains how the web editor is integrated into the Tauri desktop application.

## Architecture

The desktop app uses the same modular web editor UI, but replaces the WASM runtime with native Tauri backend calls for better performance and native file system access.

### Directory Structure

```
xvg-desktop/
├── src-web/              # Web editor source (copied from xvg-editor)
│   ├── index.js          # Entry point (Tauri + Web compatible)
│   └── tauri-adapter.js  # Tauri backend adapter
├── pkg/                  # Editor modules (tools, file ops, collaboration)
├── modules/              # WASM modules (for web fallback)
├── src-tauri/            # Rust backend
│   └── src/
│       ├── main.rs       # Tauri app entry
│       ├── xvg_bridge.rs # Rust-JS bridge
│       └── file_io.rs    # File operations
├── index.html            # Main HTML (same as web editor)
└── styles.css            # Styles (same as web editor)
```

## How It Works

### 1. Environment Detection

The editor detects if it's running in Tauri or web:

```javascript
const isTauri = window.__TAURI__ !== undefined;
```

### 2. Runtime Adapter

- **Web mode**: Uses WASM `XVGRuntime` for rendering
- **Tauri mode**: Uses `TauriXVGRuntime` adapter that calls Rust backend

### 3. File Operations

- **Web mode**: Downloads/uploads files via browser APIs
- **Tauri mode**: Uses native file dialogs and file system access

### 4. Rendering

- **Web mode**: WASM renders to canvas
- **Tauri mode**: Rust backend renders, returns pixel data to frontend

## Building

### Development

```bash
cd xvg-desktop
npm install
npm run tauri dev
```

### Production

```bash
cd xvg-desktop
npm run tauri build
```

This will create:
- Windows: `src-tauri/target/release/xvg-desktop.exe`
- macOS: `src-tauri/target/release/bundle/macos/XVG Editor.app`
- Linux: `src-tauri/target/release/xvg-desktop`

## Available Tauri Commands

The Rust backend exposes these commands to JavaScript:

- `open_file(file_path, file_type)` - Open XVG/SVG file
- `save_file(file_path, content)` - Save XVG file
- `render_canvas(content, width, height)` - Render to bitmap
- `convert_to_sdf(paths, epochs, learning_rate)` - SDF conversion
- `compile_shader(shader_code)` - WGSL shader compilation
- `extrude_path(paths, depth, bevel)` - 3D extrusion
- `sync_operations(operations)` - CRDT sync
- `get_performance_stats()` - Performance metrics
- `zoom_canvas(zoom_factor, center_x, center_y)` - Zoom
- `pan_canvas(delta_x, delta_y)` - Pan
- `get_canvas_transform()` - Get transform state
- `update_canvas_size(width, height)` - Resize canvas
- `get_engine_status()` - Engine status

## Differences from Web Editor

1. **File Operations**: Native dialogs instead of download/upload
2. **Performance**: Direct Rust rendering instead of WASM
3. **No WASM Loading**: Tauri adapter replaces WASM runtime
4. **Native Integration**: Window controls, file associations, etc.

## Updating the Editor

To update the desktop app with changes from the web editor:

```bash
# From XVG root directory
cp -r xvg-editor/index.html xvg-desktop/
cp -r xvg-editor/styles.css xvg-desktop/
cp -r xvg-editor/pkg xvg-desktop/
cp -r xvg-editor/src xvg-desktop/src-web
cp -r xvg-editor/modules xvg-desktop/
```

**Note**: Don't overwrite `src-web/index.js` and `src-web/tauri-adapter.js` as they contain Tauri-specific code.
