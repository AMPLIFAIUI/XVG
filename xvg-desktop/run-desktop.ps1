# XVG Desktop Runner
# This script runs the desktop application with a simple web server

Write-Host "Starting XVG Desktop..." -ForegroundColor Green

# Set environment variables
$env:CARGO_TARGET_DIR = "S:/xvg-tesseract/target"
$env:CARGO_HOME = "S:/xvg-tesseract/.cargo"
$env:RUSTUP_HOME = "S:/xvg-tesseract/.rustup"

# Change to the desktop directory
Set-Location "S:/xvg-tesseract/xvg-desktop"

# Start a simple Python HTTP server to serve the frontend
Write-Host "Starting web server..." -ForegroundColor Yellow
Start-Process python -ArgumentList "-m", "http.server", "8080" -WindowStyle Hidden

# Wait a moment for the server to start
Start-Sleep -Seconds 2

# Open the application in the default browser
Write-Host "Opening XVG Desktop in browser..." -ForegroundColor Yellow
Start-Process "http://localhost:8080"

Write-Host "XVG Desktop is running at http://localhost:8080" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow

# Keep the script running
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host "`nStopping XVG Desktop..." -ForegroundColor Yellow
    # Kill the Python server
    Get-Process python -ErrorAction SilentlyContinue | Where-Object {$_.ProcessName -eq "python"} | Stop-Process -Force
    Write-Host "XVG Desktop stopped." -ForegroundColor Green
} 