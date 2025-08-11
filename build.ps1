# XVG Tesseract Build Script
# Sets all build paths to S:/ drive to avoid disk space issues

Write-Host "Setting up XVG Tesseract build environment..." -ForegroundColor Green

# Set environment variables to use S:/ drive
$env:CARGO_TARGET_DIR = "S:/xvg-tesseract/target"
$env:CARGO_HOME = "S:/xvg-tesseract/.cargo"
$env:RUSTUP_HOME = "S:/xvg-tesseract/.rustup"

# Create directories if they don't exist
New-Item -ItemType Directory -Force -Path "S:/xvg-tesseract/target" | Out-Null
New-Item -ItemType Directory -Force -Path "S:/xvg-tesseract/.cargo" | Out-Null
New-Item -ItemType Directory -Force -Path "S:/xvg-tesseract/xvg-desktop/dist" | Out-Null

Write-Host "Building XVG Core..." -ForegroundColor Yellow
cargo build --release -p xvg-core

Write-Host "Building XVG CLI..." -ForegroundColor Yellow
cargo build --release -p xvg-cli

Write-Host "Building XVG Python bindings..." -ForegroundColor Yellow
cargo build --release -p xvg-py

Write-Host "Building XVG WASM..." -ForegroundColor Yellow
cd xvg-wasm
wasm-pack build --release --target web --out-dir S:/xvg-tesseract/xvg-wasm/pkg
cd ..

Write-Host "Building XVG Desktop..." -ForegroundColor Yellow
cd xvg-desktop
cargo tauri build --release
cd ..

Write-Host "Build complete! All artifacts saved to S:/xvg-tesseract" -ForegroundColor Green 