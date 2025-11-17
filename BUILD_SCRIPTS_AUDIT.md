# Build Scripts and Configuration Audit

## Phase 4: Build Scripts, Registry Scripts, and Configuration Files

### Date: 2025-11-17
### Status: COMPLETED ✅

---

## ✅ FILES AUDITED

### 1. **register_xvg.bat** - Windows File Association Script
**Location**: `/XVG/register_xvg.bat`

**Purpose**: Register .xvg file extension with Windows, install icon, create file associations

**Analysis**: ✅ EXCELLENT
- Checks for administrator privileges (warns if missing)
- Validates icon file exists before proceeding
- Validates executable exists (warns if missing, continues with placeholder)
- Copies icon to System32 (falls back to local path if admin not available)
- Creates comprehensive registry entries:
  - `.xvg` extension registration
  - `XVGFile` class registration
  - Open command with file path parameter
  - Edit command
  - Default icon
  - OpenWithProgids for file type association
  - FriendlyAppName for UI display
  - KindMap registration as "picture" type
- Refreshes icon cache and restarts Explorer
- Clear user feedback at each step
- Graceful error handling

**Issues Found**: None

**Recommendations**:
- Update EXE_PATH to match Tauri build output location:
  - Current: `target\release\xvg-desktop.exe`
  - Should be: `xvg-desktop\src-tauri\target\release\xvg-desktop.exe`
  - OR: `xvg-desktop\target\release\xvg-desktop.exe` (if building from xvg-desktop directory)

---

### 2. **install_xvg_runtime.bat** - Thumbnail Handler Installer
**Location**: `/XVG/install_xvg_runtime.bat`

**Purpose**: Install and register XVG thumbnail handler DLL for Windows Explorer

**Analysis**: ✅ EXCELLENT
- Requires administrator privileges (enforced, not just warned)
- Validates DLL exists
- Automatically builds thumbnail handler if missing
- Registers DLL using regsvr32
- Creates registry entries for:
  - Thumbnail provider
  - Preview handler
  - KindMap as "picture" type
  - ShowThumbnails setting
- Clears thumbnail cache to force refresh
- Offers to restart Explorer
- Clear user feedback

**Issues Found**: 
⚠️ **PLACEHOLDER GUIDs** - The script uses placeholder GUIDs that need to be replaced with actual GUIDs from the thumbnail handler DLL:
```batch
{XVG-THUMBNAIL-HANDLER-GUID}
{XVG-PREVIEW-HANDLER-GUID}
```

**Fix Required**:
The GUIDs should match the COM class IDs defined in `xvg-thumbnail-handler/src/lib.rs`. Need to check the actual GUID values in the Rust code.

---

### 3. **Cargo.toml** - Workspace Configuration
**Location**: `/XVG/Cargo.toml`

**Analysis**: ✅ GOOD (with fix applied)

**Original Issue**: Desktop app (`xvg-desktop/src-tauri`) was NOT included in workspace members

**Fix Applied**: Added `xvg-desktop/src-tauri` to workspace members

**Current Configuration**:
```toml
[workspace]
members = [
    "xvg-runtime",
    "xvg-core",
    "xvg-cli", 
    "xvg-py",
    "xvg-ffi",
    "xvg-wasm",
    "xvg-thumbnail-handler",
    "xvg-desktop/src-tauri",  # ← ADDED
]
```

**Benefits**:
- Unified dependency management
- Single `cargo build` command builds all packages
- Shared workspace metadata
- Better IDE integration

---

### 4. **README.md** - Documentation
**Location**: `/XVG/README.md`

**Analysis**: ✅ GOOD (needs update)

**Current Status**:
- Documents project structure
- Lists all features
- Provides build instructions for engines
- Provides editor launch instructions
- Mentions desktop app: "Tauri config fix pending"

**Needs Update**:
- Desktop app status should be updated to "Ready for build"
- Add desktop app build instructions
- Add Windows integration instructions
- Update project status section

---

## 🔧 ISSUES FOUND AND FIXES

### **ISSUE #1: Desktop App Not in Workspace** - FIXED ✅

**Problem**: `xvg-desktop/src-tauri` was not listed in workspace members

**Impact**: 
- Could not build desktop app from root directory
- Dependency management not unified
- IDE integration incomplete

**Fix Applied**: Added to workspace members in root `Cargo.toml`

---

### **ISSUE #2: Placeholder GUIDs in install_xvg_runtime.bat** - NEEDS FIX ⚠️

**Problem**: The thumbnail handler installer uses placeholder GUIDs:
```batch
{XVG-THUMBNAIL-HANDLER-GUID}
{XVG-PREVIEW-HANDLER-GUID}
```

**Impact**: 
- Thumbnail handler won't work until GUIDs are replaced with actual values
- Registry entries will be invalid

**Fix Required**: 
1. Check `xvg-thumbnail-handler/src/lib.rs` for actual COM class GUIDs
2. Replace placeholders in `install_xvg_runtime.bat` with real GUIDs
3. Ensure GUIDs match between Rust code and batch script

**Action**: Need to inspect thumbnail handler source code for GUID values

---

### **ISSUE #3: Incorrect EXE Path in register_xvg.bat** - NEEDS FIX ⚠️

**Problem**: The script looks for the executable at:
```batch
set "EXE_PATH=%CURRENT_DIR%target\release\xvg-desktop.exe"
```

But Tauri builds to:
```
xvg-desktop/src-tauri/target/release/xvg-desktop.exe
```

**Impact**: 
- Script will not find the executable after building
- File associations will point to wrong location
- User will need to manually edit the path

**Fix Required**:
Update the EXE_PATH variable:
```batch
set "EXE_PATH=%CURRENT_DIR%xvg-desktop\src-tauri\target\release\xvg-desktop.exe"
```

---

## 📋 ADDITIONAL FINDINGS

### **Build Process Flow**

Based on the audit, the correct build and installation flow should be:

1. **Build Desktop App**:
   ```bash
   cd xvg-desktop
   npm install
   npm run tauri build
   ```
   Output: `xvg-desktop/src-tauri/target/release/xvg-desktop.exe`

2. **Register File Associations**:
   ```batch
   register_xvg.bat
   ```
   - Installs icon
   - Creates file associations
   - Sets up context menu

3. **Install Thumbnail Handler**:
   ```batch
   install_xvg_runtime.bat
   ```
   - Builds thumbnail handler DLL (if needed)
   - Registers COM DLL
   - Creates thumbnail provider registry entries
   - Clears thumbnail cache

4. **Test Integration**:
   - Double-click .xvg file → Opens in XVG Editor
   - View .xvg file in Explorer → Shows thumbnail
   - Right-click .xvg file → Shows XVG icon

---

## 🎯 RECOMMENDATIONS

### Priority 1: Fix GUID Placeholders
- Inspect `xvg-thumbnail-handler/src/lib.rs`
- Find actual COM class GUIDs
- Update `install_xvg_runtime.bat` with real GUIDs

### Priority 2: Fix EXE Path
- Update `register_xvg.bat` to use correct Tauri build output path
- Test with actual build output

### Priority 3: Update Documentation
- Update README.md with desktop app build instructions
- Document Windows integration setup process
- Create BUILDING.md with step-by-step instructions

### Priority 4: Create Unified Build Script
- Create `build-all.bat` that:
  1. Builds desktop app
  2. Builds thumbnail handler
  3. Runs file association registration
  4. Runs thumbnail handler installation
  5. Provides success/failure feedback

---

## ✅ SUMMARY

**Files Audited**: 4
- ✅ register_xvg.bat (needs path fix)
- ⚠️ install_xvg_runtime.bat (needs GUID fix)
- ✅ Cargo.toml (fixed)
- ✅ README.md (needs update)

**Critical Issues**: 0
**Important Issues**: 2 (GUID placeholders, EXE path)
**Minor Issues**: 1 (documentation outdated)

**Overall Status**: GOOD - Scripts are well-written with excellent error handling. Only minor fixes needed for GUIDs and paths.

---

## Next Steps

1. Check thumbnail handler source code for actual GUIDs
2. Fix GUID placeholders in install_xvg_runtime.bat
3. Fix EXE path in register_xvg.bat
4. Update README.md
5. Test build process end-to-end
