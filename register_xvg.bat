@echo off
echo Registering XVG file association with Windows...
echo.

REM Get the current directory and build the full path to the executable
set "CURRENT_DIR=%~dp0"
set "EXE_PATH=%CURRENT_DIR%target\release\xvg-imgui.exe"

REM Check if the executable exists
if not exist "%EXE_PATH%" (
    echo Error: Executable not found at %EXE_PATH%
    echo Please build the project first with: cargo build --release
    pause
    exit /b 1
)

echo Found executable at: %EXE_PATH%
echo.

REM Create registry entries using reg.exe
echo Creating registry entries...

reg add "HKEY_CLASSES_ROOT\.xvg" /ve /d "XVGFile" /f
reg add "HKEY_CLASSES_ROOT\XVGFile" /ve /d "XVG Vector Graphics File" /f
reg add "HKEY_CLASSES_ROOT\XVGFile\shell\open\command" /ve /d "\"%EXE_PATH%\" \"%%1\"" /f
reg add "HKEY_CLASSES_ROOT\XVGFile\shell\edit\command" /ve /d "\"%EXE_PATH%\" \"%%1\"" /f
reg add "HKEY_CLASSES_ROOT\XVGFile\DefaultIcon" /ve /d "\"%EXE_PATH%,0\"" /f

echo.
echo XVG file association registered successfully!
echo.
echo You can now:
echo - Double-click .xvg files to open them in XVG
echo - Right-click .xvg files for context menu options
echo - Drag and drop .xvg files onto the XVG application
echo.
pause

