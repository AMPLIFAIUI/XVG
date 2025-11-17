@echo off
echo ========================================
echo XVG File Association Installer
echo ========================================
echo.
echo This will register .xvg files with Windows and install the XVG icon.
echo.

REM Check for administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo WARNING: Administrator privileges recommended for full installation.
    echo Some features may not work without admin rights.
    echo.
    echo Press any key to continue anyway, or close this window to exit.
    pause >nul
)

REM Get the current directory
set "CURRENT_DIR=%~dp0"
set "EXE_PATH=%CURRENT_DIR%target\release\xvg-desktop.exe"
set "ICON_SOURCE=%CURRENT_DIR%assets\xvgicon.ico"
set "ICON_DEST=%SystemRoot%\System32\xvgicon.ico"

REM Check if the icon exists
if not exist "%ICON_SOURCE%" (
    echo ERROR: Icon file not found at %ICON_SOURCE%
    echo Please ensure the assets folder contains xvgicon.ico
    pause
    exit /b 1
)

REM Check if the executable exists
if not exist "%EXE_PATH%" (
    echo WARNING: Executable not found at %EXE_PATH%
    echo The file association will be created, but you need to build the desktop app first.
    echo.
    echo To build: cargo build --release --package xvg-desktop
    echo.
    set "EXE_PATH=%CURRENT_DIR%xvg-desktop.exe"
    echo Using placeholder path: %EXE_PATH%
    echo.
)

echo Found icon at: %ICON_SOURCE%
echo.

REM Copy icon to Windows System32 directory (requires admin)
echo Installing XVG icon to Windows...
copy /Y "%ICON_SOURCE%" "%ICON_DEST%" >nul 2>&1

if %errorLevel% equ 0 (
    echo Icon installed to: %ICON_DEST%
    set "ICON_PATH=%ICON_DEST%"
) else (
    echo Could not copy to System32 ^(admin required^), using local icon path.
    set "ICON_PATH=%ICON_SOURCE%"
)
echo.

REM Create registry entries
echo Creating registry entries...
echo.

REM Register .xvg extension
reg add "HKEY_CLASSES_ROOT\.xvg" /ve /d "XVGFile" /f >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] Registered .xvg extension
) else (
    echo [FAILED] Could not register .xvg extension
)

REM Register XVGFile class
reg add "HKEY_CLASSES_ROOT\XVGFile" /ve /d "XVG Vector Graphics File" /f >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] Registered XVGFile class
) else (
    echo [FAILED] Could not register XVGFile class
)

REM Register open command
reg add "HKEY_CLASSES_ROOT\XVGFile\shell\open\command" /ve /d "\"%EXE_PATH%\" \"%%1\"" /f >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] Registered open command
) else (
    echo [FAILED] Could not register open command
)

REM Register edit command
reg add "HKEY_CLASSES_ROOT\XVGFile\shell\edit\command" /ve /d "\"%EXE_PATH%\" \"%%1\"" /f >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] Registered edit command
) else (
    echo [FAILED] Could not register edit command
)

REM Register icon
reg add "HKEY_CLASSES_ROOT\XVGFile\DefaultIcon" /ve /d "\"%ICON_PATH%\"" /f >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] Registered icon: %ICON_PATH%
) else (
    echo [FAILED] Could not register icon
)

REM Register as image file type
reg add "HKEY_CLASSES_ROOT\.xvg\OpenWithProgids" /v "XVGFile" /t REG_SZ /d "" /f >nul 2>&1
reg add "HKEY_CLASSES_ROOT\XVGFile\shell\open" /v "FriendlyAppName" /t REG_SZ /d "XVG Graphics Editor" /f >nul 2>&1

REM Mark as image type for Windows
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\KindMap" /v ".xvg" /t REG_SZ /d "picture" /f >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] Registered as image type
) else (
    echo [FAILED] Could not register as image type ^(admin required^)
)

REM Refresh icon cache
echo.
echo Refreshing icon cache...
ie4uinit.exe -show >nul 2>&1
taskkill /f /im explorer.exe >nul 2>&1
start explorer.exe

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo .xvg files are now registered with Windows!
echo.
echo You can now:
echo  - Double-click .xvg files to open them
echo  - Right-click .xvg files for context menu
echo  - See XVG icons in File Explorer
echo.
echo Next steps:
echo  1. Build the desktop app: cargo build --release --package xvg-desktop
echo  2. Run install_xvg_runtime.bat to enable thumbnails in Photos/Explorer
echo.
pause
