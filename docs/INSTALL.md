# XVG Installation Guide

## Prerequisites

- Rust (latest stable)
- Python 3.8+ (for Python bindings)
- wasm-pack (for WebAssembly builds)

## Quick Start

### Build All Components
```bash
cargo build --workspace
```

### Run CLI Tools
```bash
cargo run -p xvg-cli -- --help
```

### Test Core Library
```bash
cargo test -p xvg-core
```

## Components

- **xvg-core**: Core XVG engine library (complete)
- **xvg-cli**: Command-line tools
- **xvg-py**: Python bindings
- **xvg-wasm**: WebAssembly bindings
- **xvg-ffi**: C FFI interface for external integration

## Next Steps

The project is ready for external integration via FFI. UI scaffolding has been removed and backed up.

