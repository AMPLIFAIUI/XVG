# Launch XVG Editor on a specific port (default 8000)
# - Kills any process using the port first
# - Starts the Node static server with proper WASM headers
# - Handles Ctrl+C to gracefully kill the server

param(
    [int]$Port = 8000
)

# Function to kill process on specified port
function Kill-PortProcess {
    param([int]$PortNumber)
    try {
        $portPids = Get-NetTCPConnection -LocalPort $PortNumber -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
        if ($portPids) {
            Write-Host "Killing process(es) on port $PortNumber (PID(s): $($portPids -join ', '))..." -ForegroundColor Yellow
            $portPids | ForEach-Object {
                try {
                    Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
                    Write-Host "Successfully killed process $_" -ForegroundColor Green
                } catch {
                    Write-Host "Warning: Could not kill process $_" -ForegroundColor Red
                }
            }
            Start-Sleep -Seconds 1
        } else {
            Write-Host "No processes found on port $PortNumber" -ForegroundColor Gray
        }
    } catch {
        Write-Host "Warning: Could not check processes on port $PortNumber" -ForegroundColor Red
    }
}

Write-Host "Starting XVG Editor on port $Port..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server and kill processes on port $Port" -ForegroundColor Gray

# Move to editor directory (relative to this script)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$editorDir = Join-Path $scriptDir "xvg editor"
Set-Location $editorDir

# Kill any process using the port
Kill-PortProcess -PortNumber $Port

# Ensure Node is available
try { node -v | Out-Null } catch { throw "Node.js is required but not found in PATH." }

# Start server with port env var
$env:PORT = $Port
Write-Host "Launching server (node pkg/server.js) on http://localhost:$Port" -ForegroundColor Green

try {
    # Start the server in background
    $serverJob = Start-Job -ScriptBlock {
        param($port, $editorDir)
        Set-Location $editorDir
        $env:PORT = $port
        node pkg/server.js
    } -ArgumentList $Port, $editorDir

    # Wait a moment for server to start
    Start-Sleep -Seconds 2

    # Open default browser
    $url = "http://localhost:$Port"
    Write-Host "Opening default browser at $url..." -ForegroundColor Green
    try {
        Start-Process $url
    } catch {
        Write-Host "Warning: Could not launch browser automatically. Please open $url manually." -ForegroundColor Yellow
    }

    # Wait for server job to complete (keep script running)
    Write-Host "Server is running. Press Ctrl+C to stop and cleanup..." -ForegroundColor Gray
    Wait-Job $serverJob | Out-Null

} catch [System.Management.Automation.PipelineStoppedException] {
    # Handle Ctrl+C gracefully
    Write-Host "`nReceived Ctrl+C, shutting down server..." -ForegroundColor Yellow
} catch {
    # Handle other exceptions
    Write-Host "`nError occurred: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    # Always cleanup: kill any remaining processes on the port
    Write-Host "Performing cleanup..." -ForegroundColor Cyan
    Kill-PortProcess -PortNumber $Port

    # Also stop the background job if it exists
    if ($serverJob -and (Get-Job -Id $serverJob.Id -ErrorAction SilentlyContinue)) {
        Write-Host "Stopping server job..." -ForegroundColor Gray
        Stop-Job $serverJob -ErrorAction SilentlyContinue
        Remove-Job $serverJob -ErrorAction SilentlyContinue
    }

    Write-Host "Cleanup complete. Goodbye!" -ForegroundColor Green
}
