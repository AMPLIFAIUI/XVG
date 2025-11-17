# XVG Thumbnail Handler

Windows Shell Extension for displaying XVG file thumbnails in Windows Explorer and the Photos app.

## Overview

This is a COM DLL that implements the `IThumbnailProvider` interface, allowing Windows to generate thumbnails for `.xvg` files automatically.

## Features

- **Windows Explorer Thumbnails**: Shows XVG file previews in folder views
- **Photos App Integration**: Enables viewing XVG files in Windows Photos app
- **High Quality**: Uses the xvg-runtime for accurate rendering
- **Fast**: Optimized for quick thumbnail generation

## Building

### Prerequisites

- Rust toolchain (stable)
- Windows SDK
- Visual Studio Build Tools

### Build Commands

```bash
# Development build
cargo build

# Release build (optimized)
cargo build --release
```

The DLL will be output to:
- Debug: `target/debug/xvg_thumbnail_handler.dll`
- Release: `target/release/xvg_thumbnail_handler.dll`

## Installation

### Automatic Installation

Run the `install_xvg_runtime.bat` script from the repository root:

```cmd
install_xvg_runtime.bat
```

This will:
1. Build the thumbnail handler DLL
2. Copy it to `C:\Windows\System32\`
3. Register it with Windows
4. Clear the thumbnail cache
5. Restart Windows Explorer

### Manual Installation

1. Build the DLL in release mode
2. Copy `xvg_thumbnail_handler.dll` to `C:\Windows\System32\`
3. Register the DLL:
   ```cmd
   regsvr32 C:\Windows\System32\xvg_thumbnail_handler.dll
   ```
4. Clear thumbnail cache:
   ```cmd
   del /f /s /q %LocalAppData%\Microsoft\Windows\Explorer\thumbcache_*.db
   ```
5. Restart Windows Explorer:
   ```cmd
   taskkill /f /im explorer.exe
   start explorer.exe
   ```

## Uninstallation

```cmd
regsvr32 /u C:\Windows\System32\xvg_thumbnail_handler.dll
del C:\Windows\System32\xvg_thumbnail_handler.dll
```

## Registry Entries

The thumbnail handler is registered under:

```
HKEY_CLASSES_ROOT\.xvg\ShellEx\{E357FCCD-A995-4576-B01F-234630154E96}
```

Where `{E357FCCD-A995-4576-B01F-234630154E96}` is the `IThumbnailProvider` interface GUID.

## Architecture

```
┌─────────────────────────────────────┐
│   Windows Explorer / Photos App    │
└─────────────┬───────────────────────┘
              │ Requests thumbnail
              ▼
┌─────────────────────────────────────┐
│   IThumbnailProvider (COM)          │
│   xvg_thumbnail_handler.dll         │
└─────────────┬───────────────────────┘
              │ Calls render
              ▼
┌─────────────────────────────────────┐
│   XVGRuntime (Rust)                 │
│   Renders XVG to RGBA bitmap        │
└─────────────────────────────────────┘
```

## Troubleshooting

### Thumbnails Not Showing

1. Check if the DLL is registered:
   ```cmd
   reg query "HKCR\.xvg\ShellEx\{E357FCCD-A995-4576-B01F-234630154E96}"
   ```

2. Clear thumbnail cache:
   ```cmd
   del /f /s /q %LocalAppData%\Microsoft\Windows\Explorer\thumbcache_*.db
   ```

3. Restart Explorer:
   ```cmd
   taskkill /f /im explorer.exe && start explorer.exe
   ```

### DLL Registration Fails

- Ensure you're running as Administrator
- Check that the DLL is in `System32` (not `SysWOW64` for 64-bit)
- Verify all dependencies are present

### Thumbnails Show Blank

- Check XVG file is valid
- Verify xvg-runtime can load the file
- Check Windows Event Viewer for errors

## Development

### Testing

```bash
cargo test
```

### Debugging

1. Build in debug mode: `cargo build`
2. Copy DLL to System32
3. Register the DLL
4. Attach debugger to `explorer.exe`
5. Navigate to a folder with XVG files

### Logging

The DLL writes errors to Windows Event Log under:
- Source: `XVG Thumbnail Handler`
- Log: `Application`

## License

Same as the main XVG project.
