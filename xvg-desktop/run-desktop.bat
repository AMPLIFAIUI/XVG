@echo off
echo Starting XVG Desktop...
echo.

cd /d "S:\xvg-tesseract\xvg-desktop"

echo Starting web server...
start /B node server.js

timeout /t 2 /nobreak >nul

echo Opening XVG Desktop in browser...
start http://localhost:8080

echo.
echo XVG Desktop is running at http://localhost:8080
echo Press any key to stop the server...
pause >nul

echo Stopping XVG Desktop...
taskkill /f /im node.exe >nul 2>&1
echo XVG Desktop stopped. 