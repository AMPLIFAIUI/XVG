# XVG 1.0 Tesseract Installation Guide

This repository is a Rust workspace with CLI, desktop, WASM, web, and Python bindings.

## Prerequisites
- Rust (stable)
- Node.js (for web/desktop UI)
- wasm-pack (for WASM)
- Python 3.8+ (optional, for `xvg-py`)

## Build Everything
```
# From repo root
cargo build --workspace
```

## Run
```
# CLI
cargo run -p xvg-cli --release -- --help

# Desktop
cargo run -p xvg-desktop

# Web (CRA app)
cd xvg-web
npm install
npm start
```

## WASM Usage
See `xvg-wasm/pkg/` after building, and import from the generated JS.

## Notes
- Build artifacts go to `./target` by default. You may set `CARGO_TARGET_DIR` if desired.

