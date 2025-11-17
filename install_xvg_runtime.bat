@echo off
echo ========================================
echo XVG Runtime Installer
echo ========================================
echo.
echo This will install the XVG thumbnail and preview handler,
echo allowing Windows to display .xvg files in:
echo - File Explorer thumbnails
echo - Windows Photos app
echo - Image viewers and editors
echo - Print dialogs
echo.

REM Check for administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script requires administrator privileges.
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

REM Get the current directory
set "CURRENT_DIR=%~dp0"
set "RUNTIME_DLL=%CURRENT_DIR%target\release\xvg_thumbnail_handler.dll"

REM Check if the runtime DLL exists
if not exist "%RUNTIME_DLL%" (
    echo Building XVG thumbnail handler...
    echo.
    cd "%CURRENT_DIR%"
    cargo build --release --package xvg-thumbnail-handler
    
    if not exist "%RUNTIME_DLL%" (
        echo.
        echo ERROR: Failed to build thumbnail handler.
        echo Please ensure Rust is installed and the project builds correctly.
        pause
        exit /b 1
    )
)

echo Found runtime DLL at: %RUNTIME_DLL%
echo.

REM Register the thumbnail handler DLL
echo Registering thumbnail handler...
regsvr32 /s "%RUNTIME_DLL%"

if %errorLevel% neq 0 (
    echo ERROR: Failed to register thumbnail handler.
    pause
    exit /b 1
)

REM Add thumbnail handler to registry
echo Creating thumbnail handler registry entries...

REM Register as thumbnail provider
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\KindMap" /v ".xvg" /t REG_SZ /d "picture" /f
reg add "HKEY_CLASSES_ROOT\.xvg\ShellEx\{e357fccd-a995-4576-b01f-234630154e96}" /ve /d "{4A625AD4-C8C3-4D98-B193-42AD7A51E3B9}" /f

REM Register as preview handler
reg add "HKEY_CLASSES_ROOT\.xvg\ShellEx\{8895b1c6-b41f-4c1c-a562-0d564250836f}" /ve /d "{A0E75ABD-4DC6-4AD3-980C-0138C37A25E2}" /f

REM Enable thumbnails in Explorer
reg add "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" /v "ShowThumbnails" /t REG_DWORD /d 1 /f

REM Clear thumbnail cache to force refresh
echo Clearing thumbnail cache...
del /f /s /q /a "%LocalAppData%\Microsoft\Windows\Explorer\thumbcache_*.db" >nul 2>&1

echo.
echo ========================================
echo XVG Runtime installed successfully!
echo ========================================
echo.
echo .xvg files will now display thumbnails in:
echo - File Explorer
echo - Windows Photos app
echo - Image viewers and editors
echo.
echo NOTE: You may need to restart Explorer or log out/in for changes to take effect.
echo.
echo To restart Explorer now, press Y. Otherwise, press N.
set /p RESTART="Restart Explorer? (Y/N): "

if /i "%RESTART%"=="Y" (
    echo Restarting Explorer...
    taskkill /f /im explorer.exe >nul 2>&1
    start explorer.exe
    echo Explorer restarted.
)

echo.
echo Installation complete!
pause
