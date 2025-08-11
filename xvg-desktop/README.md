# XVG 1.0 "Tesseract"

A production-grade, modular rewrite of the entire XVG stack. Each section is self-contained, versioned, and can live in its own crate/repo/package.

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

### Build & Run

```bash
cargo build --workspace
cargo run -p xvg-desktop
```

You now have:
- A Rust library (`xvg-core`)
- A CLI (`xvg-cli`) for batch conversion and inspection
- Python bindings (`xvg-py`)
- WebAssembly package (`xvg-wasm`)
- Desktop editor (`xvg-desktop.exe`)

## File Format

XVG 1.0 "Tesseract" uses:
- Magic: `XVG\x03`
- CRC-32 footer, big-endian
- Sections (all optional, length-prefixed):
  - Header, JSON Metadata, Frame Table, Vector Commands
  - Assets (PNG/JPEG/OTF/WAV/WGSL)
  - SDF Weights, CRDT Log, Scene 3-D, Shader Library
  - Animation Curves, Audio Stems, Font Subsets
  - Physics Snapshot, Color Profiles, Custom
  - Advanced: Metadata, Variable Fonts, Instancing, Effects, HDR Lightfield, Deltas

Forward-compatible: new sections ignored by old parsers.

## License

MIT OR Apache-2.0 