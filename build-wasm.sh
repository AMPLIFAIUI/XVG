#!/bin/bash
set -e

echo "🔨 Building XVG WASM module..."
cd xvg-wasm
wasm-pack build --target web --out-dir ../xvg-editor/modules --out-name xvg_wasm
cd ..
echo "✅ WASM build complete!"
