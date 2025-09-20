# XVG File Association Setup

This document explains how to set up XVG file association with Windows so you can double-click `.xvg` files and have them open automatically in the XVG application.

## Method 1: Automatic Registration (Recommended)

1. **Build the project first**:
   ```bash
   cargo build --release
   ```

2. **Run the batch file**:
   - Double-click `register_xvg.bat` in the project root
   - This will automatically detect your executable path and register it

## Method 2: Manual Registry File

1. **Edit the registry file**:
   - Open `register_xvg.reg` in a text editor
   - Update the path `S:\\XVG\\target\\release\\xvg-imgui.exe` to match your actual executable location
   - Save the file

2. **Apply the registry file**:
   - Double-click `register_xvg.reg`
   - Click "Yes" when prompted by Windows

## Method 3: Built-in Application Menu

1. **Launch XVG Desktop**:
   ```bash
   cargo run --bin xvg-imgui --release
   ```

2. **Use the Help menu**:
   - Go to `Help → Register XVG File Association`
   - This will register the file association using the current executable path

## What Gets Registered

After registration, Windows will:

- **File Icons**: Show XVG files with the XVG application icon
- **Double-click**: Open `.xvg` files directly in XVG when double-clicked
- **Context Menu**: Add "Open with XVG" and "Edit with XVG" options
- **File Types**: Recognize `.xvg` as "XVG Vector Graphics File"

## Command Line Support

You can also open files from the command line:

```bash
# Open an XVG file
xvg-imgui.exe myfile.xvg

# Open an SVG file (will be converted)
xvg-imgui.exe myfile.svg
```

## Drag and Drop Support

The XVG application now supports drag and drop:

1. **Drag files onto the canvas**:
   - Drag `.xvg` or `.svg` files from Windows Explorer
   - Drop them onto the main canvas area
   - Files will automatically open and display

2. **Visual feedback**:
   - The canvas shows "Drop XVG or SVG file here" when hovering
   - Status bar indicates when drag and drop is ready

## Troubleshooting

### "Executable not found" Error
- Make sure you've built the project with `cargo build --release`
- Check that `target\release\xvg-imgui.exe` exists

### Registry Permission Errors
- Run the batch file or registry file as Administrator
- Right-click → "Run as administrator"

### File Association Not Working
- Check that the path in the registry matches your actual executable location
- Try unregistering and re-registering the file association
- Restart Windows Explorer: `taskkill /f /im explorer.exe && start explorer.exe`

## Unregistering

To remove the file association:

```bash
reg delete "HKEY_CLASSES_ROOT\.xvg" /f
reg delete "HKEY_CLASSES_ROOT\XVGFile" /f
```

## Supported File Types

- **`.xvg`**: Native XVG vector graphics format
- **`.svg`**: Standard SVG format (imported and converted)

## Benefits

Once set up, you can:
- Double-click any `.xvg` file to open it in XVG
- Use XVG as the default application for vector graphics
- Drag and drop files directly onto the application
- Have proper file icons and context menus
- Open files from the command line with arguments

