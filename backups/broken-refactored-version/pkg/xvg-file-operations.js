// FILE: pkg/xvg-file-operations.js - Save/Load Functionality for XVG Files
// This module handles all file operations: save, load, export, import

/**
 * Save the current editor state to an XVG file
 * @param {string} filename - Optional filename (defaults to current filename or "untitled.xvg")
 */
export async function saveFile(filename = null) {
  try {
    if (!window.XVGSystem || !window.XVGSystem.state || !window.XVGSystem.state.appState) {
      console.error('[Save] XVGSystem not initialized');
      alert('Editor not ready. Please wait for initialization.');
      return;
    }
    
    const state = window.XVGSystem.state.appState;
    
    // Use provided filename, or current filename, or default
    const finalFilename = filename || state.currentFilename || 'untitled.xvg';
    
    // Serialize the editor state to XVG format
    const xvgData = await serializeToXVG(state);
    
    // Create a blob and download
    const blob = new Blob([xvgData], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Update state
    state.currentFilename = finalFilename;
    state.isModified = false;
    
    console.log('[Save] File saved successfully:', finalFilename);
    if (window.notify) {
      window.notify('success', `File saved: ${finalFilename}`);
    }
    
    // Auto-save to localStorage for crash recovery
    saveToLocalStorage(state);
    
  } catch (error) {
    console.error('[Save] Error saving file:', error);
    alert(`Failed to save file: ${error.message}`);
  }
}

/**
 * Save the current editor state with a new filename
 */
export async function saveFileAs() {
  try {
    const state = window.XVGSystem.state.appState;
    const currentName = state.currentFilename || 'untitled.xvg';
    
    // Prompt for filename
    const filename = prompt('Save as:', currentName);
    if (!filename) {
      console.log('[SaveAs] Cancelled by user');
      return;
    }
    
    // Ensure .xvg extension
    const finalFilename = filename.endsWith('.xvg') ? filename : `${filename}.xvg`;
    
    await saveFile(finalFilename);
    
  } catch (error) {
    console.error('[SaveAs] Error:', error);
    alert(`Failed to save file: ${error.message}`);
  }
}

/**
 * Open and load an XVG file
 */
export async function openFile() {
  try {
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xvg';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      console.log('[Open] Loading file:', file.name);
      
      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Deserialize and load into editor
      await loadFromXVG(uint8Array, file.name);
      
      console.log('[Open] File loaded successfully:', file.name);
      if (window.notify) {
        window.notify('success', `File loaded: ${file.name}`);
      }
    };
    
    input.click();
    
  } catch (error) {
    console.error('[Open] Error opening file:', error);
    alert(`Failed to open file: ${error.message}`);
  }
}

/**
 * Create a new file (reset editor state)
 */
export function newFile() {
  try {
    const state = window.XVGSystem.state.appState;
    
    // Check if there are unsaved changes
    if (state.isModified) {
      const confirm = window.confirm('You have unsaved changes. Create a new file anyway?');
      if (!confirm) {
        console.log('[New] Cancelled by user');
        return;
      }
    }
    
    // Reset state
    state.paths = [];
    state.images = [];
    state.selectedPaths = [];
    state.selectedImages = [];
    state.currentFilename = 'untitled.xvg';
    state.isModified = false;
    state.canvasTransform = {
      zoom: 1,
      pan_x: 0,
      pan_y: 0
    };
    
    // Clear canvas
    if (window.XVGSystem.renderCanvas) {
      window.XVGSystem.renderCanvas();
    }
    
    console.log('[New] New file created');
    if (window.notify) {
      window.notify('info', 'New file created');
    }
    
  } catch (error) {
    console.error('[New] Error creating new file:', error);
    alert(`Failed to create new file: ${error.message}`);
  }
}

/**
 * Serialize the editor state to XVG binary format
 * @param {object} state - Editor state
 * @returns {Uint8Array} XVG binary data
 */
async function serializeToXVG(state) {
  try {
    // Check if XVGRuntime is available
    if (!window.xvg_wasm || !window.xvg_wasm.XVGRuntime) {
      console.warn('[Serialize] XVGRuntime not available, using JSON fallback');
      return serializeToJSON(state);
    }
    
    // Create a new XVG file using the WASM runtime
    const width = state.canvasWidth || 800;
    const height = state.canvasHeight || 600;
    
    // For now, use JSON serialization as a fallback
    // TODO: Implement proper XVGRuntime encoding once the API is finalized
    return serializeToJSON(state);
    
  } catch (error) {
    console.error('[Serialize] Error:', error);
    throw error;
  }
}

/**
 * Serialize to JSON format (fallback)
 * @param {object} state - Editor state
 * @returns {Uint8Array} JSON data as Uint8Array
 */
function serializeToJSON(state) {
  const data = {
    version: '1.0',
    width: state.canvasWidth || 800,
    height: state.canvasHeight || 600,
    paths: state.paths || [],
    images: state.images || [],
    layers: state.layers || [],
    transform: state.canvasTransform || { zoom: 1, pan_x: 0, pan_y: 0 }
  };
  
  const jsonString = JSON.stringify(data, null, 2);
  const encoder = new TextEncoder();
  return encoder.encode(jsonString);
}

/**
 * Deserialize XVG binary data and load into editor
 * @param {Uint8Array} data - XVG binary data
 * @param {string} filename - Filename
 */
async function loadFromXVG(data, filename) {
  try {
    const state = window.XVGSystem.state.appState;
    
    // Try to parse as JSON first (fallback format)
    try {
      const decoder = new TextDecoder();
      const jsonString = decoder.decode(data);
      const parsed = JSON.parse(jsonString);
      
      // Load data into state
      state.canvasWidth = parsed.width || 800;
      state.canvasHeight = parsed.height || 600;
      state.paths = parsed.paths || [];
      state.images = parsed.images || [];
      state.layers = parsed.layers || [];
      state.canvasTransform = parsed.transform || { zoom: 1, pan_x: 0, pan_y: 0 };
      state.currentFilename = filename;
      state.isModified = false;
      state.selectedPaths = [];
      state.selectedImages = [];
      
      // Render
      if (window.XVGSystem.renderCanvas) {
        window.XVGSystem.renderCanvas();
      }
      
      console.log('[Load] File loaded from JSON format');
      return;
      
    } catch (jsonError) {
      console.log('[Load] Not a JSON file, trying XVG binary format...');
    }
    
    // Try to load using XVGRuntime
    if (window.xvg_wasm && window.xvg_wasm.XVGRuntime) {
      // TODO: Implement proper XVGRuntime decoding once the API is finalized
      console.warn('[Load] XVGRuntime decoding not yet implemented');
      throw new Error('Binary XVG format not yet supported. Please use JSON format.');
    } else {
      throw new Error('Unable to load file: unsupported format');
    }
    
  } catch (error) {
    console.error('[Load] Error:', error);
    throw error;
  }
}

/**
 * Save current state to localStorage for crash recovery
 * @param {object} state - Editor state
 */
function saveToLocalStorage(state) {
  try {
    const data = {
      paths: state.paths || [],
      images: state.images || [],
      layers: state.layers || [],
      transform: state.canvasTransform || { zoom: 1, pan_x: 0, pan_y: 0 },
      timestamp: Date.now()
    };
    
    localStorage.setItem('xvg_autosave', JSON.stringify(data));
    console.log('[AutoSave] State saved to localStorage');
    
  } catch (error) {
    console.warn('[AutoSave] Failed to save to localStorage:', error);
  }
}

/**
 * Restore state from localStorage
 * @returns {boolean} True if restored successfully
 */
export function restoreFromLocalStorage() {
  try {
    const saved = localStorage.getItem('xvg_autosave');
    if (!saved) {
      console.log('[AutoRestore] No autosave found');
      return false;
    }
    
    const data = JSON.parse(saved);
    const state = window.XVGSystem.state.appState;
    
    // Check if autosave is recent (within 24 hours)
    const age = Date.now() - (data.timestamp || 0);
    if (age > 24 * 60 * 60 * 1000) {
      console.log('[AutoRestore] Autosave too old, ignoring');
      return false;
    }
    
    // Ask user if they want to restore
    const confirm = window.confirm('An autosaved session was found. Do you want to restore it?');
    if (!confirm) {
      console.log('[AutoRestore] User declined restore');
      return false;
    }
    
    // Restore data
    state.paths = data.paths || [];
    state.images = data.images || [];
    state.layers = data.layers || [];
    state.canvasTransform = data.transform || { zoom: 1, pan_x: 0, pan_y: 0 };
    state.isModified = true;
    
    // Render
    if (window.XVGSystem.renderCanvas) {
      window.XVGSystem.renderCanvas();
    }
    
    console.log('[AutoRestore] Session restored from autosave');
    if (window.notify) {
      window.notify('success', 'Session restored from autosave');
    }
    
    return true;
    
  } catch (error) {
    console.error('[AutoRestore] Error restoring from localStorage:', error);
    return false;
  }
}

/**
 * Initialize file operations module
 */
export function initializeFileOperations() {
  // Expose functions globally for onclick handlers
  window.saveFile = saveFile;
  window.saveFileAs = saveFileAs;
  window.openFile = openFile;
  window.newFile = newFile;
  
  // Try to restore from autosave on page load
  window.addEventListener('load', () => {
    setTimeout(() => {
      restoreFromLocalStorage();
    }, 1000);
  });
  
  // Auto-save every 2 minutes
  setInterval(() => {
    if (window.XVGSystem && window.XVGSystem.state && window.XVGSystem.state.appState) {
      const state = window.XVGSystem.state.appState;
      if (state.isModified) {
        saveToLocalStorage(state);
      }
    }
  }, 2 * 60 * 1000);
  
  console.log('[FileOps] File operations initialized');
}
