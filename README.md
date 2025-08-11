# XVG Tesseract

A production-grade, modular vector graphics system with core engines in `xvg-core` and a desktop app in `xvg-desktop`.

**Status**: Active development. Core engines are implemented in `xvg-core`. The desktop app integrates CPU vector rendering with caching; GPU compositing integration is in progress.

## Project Structure

```
xvg-tesseract/
├── xvg-spec/          # Markdown + JSON Schema
├── xvg-core/          # Rust library (no std, no alloc optional)
├── xvg-cli/           # CLI & batch tools
├── xvg-py/            # Python bindings + PyPI wheel
├── xvg-wasm/          # WebAssembly + TS / JS API
├── xvg-desktop/       # eframe/egui desktop app
├── examples/          # Test vectors (.xvg, .svg, .png)
└── LICENSE / README
```

## Quick Start

### Build All Components
```bash
cargo build --workspace
```

## Components

### XVG Core (`xvg-core/`)
Rust library implementing the XVG 1.0 "Tesseract" file format with major engines.

**🧠 SDF Neural Evaluation Engine** (585 lines)
- Multi-layer perceptron for infinite resolution graphics
- GPU-accelerated raymarching with WGSL shaders
- Neural network training and weight compression

**🎨 GPU Shader Execution Engine**
- WGSL shader compile/execute APIs via `wgpu` feature
- Desktop GPU compositing integration is in progress

**🧱 3D Mesh Generation Engine** (658 lines)
- Lyon-based path triangulation for complex shapes
- Advanced path extrusion with beveling
- Complete 3D scene graph with materials

**🤝 Real-time Collaboration Engine** (1,151 lines)
- CRDT-based conflict-free collaborative editing
- LWW-Register, RGA sequences, AWSet
- Network synchronization with offline support

**Core Features:**
- `no_std` support for embedded targets
- Serialization with `serde` and `bincode`
- CRC-32 validation
- Forward-compatible file format

**Usage:**
```rust
use xvg_core::File;

let file = File::decode(&bytes)?;
let encoded = file.encode();
```

### XVG CLI (`xvg-cli/`)
Command-line tools for XVG file operations.

**Commands:**
```bash
# File information
xvg-cli info file.xvg

# Convert SVG to XVG
xvg-cli convert input.svg output.xvg

# Rasterize to PNG
xvg-cli raster input.xvg output.png
```

### XVG Python (`xvg-py/`)
Python bindings for the XVG core library.

**Usage:**
```python
import xvg

# Create new XVG file
file = xvg.XVGFile(800, 600)

# Add vector paths
file.add_path(path_data, transform)

# Encode/Decode
data = file.encode()
file = xvg.XVGFile.decode(data)
```

### XVG WASM (`xvg-wasm/`)
WebAssembly module for browser-based XVG processing.

**Usage:**
```javascript
import init, { XVGFile } from './pkg/xvg_wasm.js';

await init();
const file = new XVGFile(800, 600);
const data = file.encode();
```

### XVG Desktop (`xvg-desktop/`)
Modern desktop application built on `eframe/egui`. Vector rendering uses CPU rasterization with per-zoom texture caching. GPU compositing path is being integrated.

**Quick Start:**
```bash
cargo run -p xvg-desktop
```

**🎮 Integrated Engine Panels:**
- **🧊 SDF Neural Editor** - Neural network graphics with infinite resolution
- **🎨 GPU Shader Editor** - Live WGSL shader compilation and execution
- **🧱 3D Mesh Editor** - Path extrusion and 3D mesh generation
- **🤝 Collaboration Panel** - Real-time multi-user collaborative editing

**Currently Available:**
- Responsive UI; SVG loading and complex path parsing
- CPU rasterization with per-zoom texture caching for performance
- Core engines available via `xvg-core` APIs (SDF, WGSL shaders, 3D, CRDT)
- Cross-platform (Windows; Linux/macOS supported)

## File Format Specification

The XVG 1.0 "Tesseract" format includes:

- **Magic**: `XVG\x03`
- **CRC-32 footer**: big-endian
- **Sections**: all optional, length-prefixed

| ID | Name | Description |
|----|------|-------------|
| 0 | Header | Basic file information |
| 1 | JSON Metadata | Structured metadata |
| 2 | Frame Table | Animation frame definitions |
| 3 | Vector Commands | Drawing instructions |
| 4 | Assets | PNG/JPEG/OTF/WAV/WGSL files |
| 5 | SDF Weights | Signed Distance Field weights |
| 6 | CRDT Log | Conflict-free replicated data type log |
| 7 | Scene 3-D | 3D scene definitions |
| 8 | Shader Library | GPU shader code |
| 9 | Animation Curves | Keyframe and easing data |
| 10 | Audio Stems | Audio track data |
| 11 | Font Subsets | Font character subsets |
| 12 | Physics Snapshot | Physics simulation state |
| 13 | Color Profiles | ICC color profiles |
| 14 | Custom | User-defined sections |
| 15 | Metadata | Rich JSON-LD / XMP metadata |
| 16 | Font Subsets (Var) | Variable font subsets (gvar/HVAR) |
| 17 | Physics Snapshots (Adv) | Extended physics state |
| 18 | Instancing | GPU transform buffers |
| 19 | Effects | Layer effects (WGSL passes) |
| 20 | Color Profile (Adv) | ICC v4 / MAX profiles |
| 21 | Variable Fonts | Additional variable font data |
| 22 | HDR Lightfield | EXR tiles for relighting |
| 23 | Deltas | Compressed binary deltas (zstd) |

## Development

### Prerequisites
- Rust (latest stable)
- Node.js (for desktop web interface)
- Python (for Python bindings)
- wasm-pack (for WebAssembly builds)

### Workspace Configuration
The project uses Cargo workspaces with resolver v2 for better dependency resolution.

### Build Artifacts
By default, Cargo writes to `./target`. You may set `CARGO_TARGET_DIR` if desired.

WASM outputs are placed in `xvg-wasm/pkg/`.

## License

MIT OR Apache-2.0 - see LICENSE file for details. 