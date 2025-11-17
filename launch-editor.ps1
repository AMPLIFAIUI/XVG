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
$editorDir = Join-Path $scriptDir "xvg-editor"

if (!(Test-Path $editorDir)) {
    throw "Editor directory not found at $editorDir. Please verify the path."
}

Set-Location $editorDir

# Kill any process using the port
Kill-PortProcess -PortNumber $Port

# Ensure Node is available
try { node -v | Out-Null } catch { throw "Node.js is required but not found in PATH." }

# Start server with port env var
$env:PORT = $Port
$url = "http://localhost:$Port"
Write-Host "Launching server (node pkg/server.js) on $url" -ForegroundColor Green

$serverProcess = $null

try {
    $serverProcess = Start-Process "node" -ArgumentList "pkg/server.js" -WorkingDirectory $editorDir -PassThru -NoNewWindow

    # Wait a moment for server to start
    Start-Sleep -Seconds 2

    Write-Host "Opening default browser at $url..." -ForegroundColor Green
    try {
        Start-Process $url
    } catch {
        Write-Host "Warning: Could not launch browser automatically. Please open $url manually." -ForegroundColor Yellow
    }

    Write-Host "Server is running (PID $($serverProcess.Id)). Press Ctrl+C to stop..." -ForegroundColor Gray
    Wait-Process -Id $serverProcess.Id

} catch [System.Management.Automation.PipelineStoppedException] {
    Write-Host "`nReceived Ctrl+C, shutting down server..." -ForegroundColor Yellow
} catch {
    Write-Host "`nError occurred: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    Write-Host "Performing cleanup..." -ForegroundColor Cyan

    if ($serverProcess -and (-not $serverProcess.HasExited)) {
        Write-Host "Stopping server process PID $($serverProcess.Id)..." -ForegroundColor Gray
        try {
            $serverProcess.CloseMainWindow() | Out-Null
            Start-Sleep -Milliseconds 500
            if (-not $serverProcess.HasExited) {
                $serverProcess.Kill()
            }
            $serverProcess.WaitForExit()
        } catch {
            Write-Host "Warning: Failed to stop server process directly, killing port instead." -ForegroundColor Yellow
        }
    }

    Kill-PortProcess -PortNumber $Port
    Write-Host "Cleanup complete. Goodbye!" -ForegroundColor Green
}
