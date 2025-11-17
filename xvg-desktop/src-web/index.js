// FILE: src-web/index.js - XVG Editor Entry Point (Tauri + Web)

// Detect if running in Tauri
const isTauri = window.__TAURI__ !== undefined;

if (isTauri) {
    console.log('🖥️ Running in Tauri desktop app');
    // Import Tauri adapter
    import('./tauri-adapter.js').then(({ initializeTauriAdapter }) => {
        initializeTauriAdapter();
        startXVGEditor();
    });
} else {
    console.log('🌐 Running in web browser');
    // Import WASM runtime
    import('../modules/xvg_wasm.js').then(({ default: init, XVGRuntime }) => {
        init().then(() => {
            console.log("✅ WebAssembly module initialized successfully.");
            window.XVGRuntime = XVGRuntime;
            startXVGEditor();
        });
    });
}

// Import core modules
import { XVGCore } from '../pkg/xvg-core.js';
import { initializeTools } from '../pkg/xvg-tools.js';
import { initializeFileOperations } from '../pkg/xvg-file-operations.js';
import { initializeCollaboration } from '../pkg/xvg-collaboration.js';

/**
 * Start the XVG Editor
 * Works in both Tauri and web environments
 */
async function startXVGEditor() {
    try {
        console.log(`🚀 Starting XVG Editor in ${isTauri ? 'desktop' : 'web'} mode...`);
        
        // Initialize the main application logic
        window.XVGSystem = new XVGCore();
        window.XVGSystem.initializeCanvas();
        
        // Initialize tools
        initializeTools(window.XVGSystem);
        
        // Initialize file operations
        if (isTauri) {
            // Use Tauri file operations
            initializeTauriFileOperations();
        } else {
            // Use web file operations
            initializeFileOperations();
        }
        
        // Initialize collaboration
        initializeCollaboration();
        
        console.log("✅ XVG Editor is now running!");

    } catch (err) {
        console.error("❌ Failed to initialize XVG Editor:", err);
    }
}

/**
 * Initialize Tauri-specific file operations
 * Overrides web file operations with native dialogs
 */
function initializeTauriFileOperations() {
    const { TauriFileOperations } = window.TauriFileOps || {};
    
    if (!TauriFileOperations) {
        console.error('[Tauri] File operations not available');
        return;
    }
    
    // Override global file operation functions
    window.openFile = async () => {
        const result = await TauriFileOperations.openFile();
        if (result) {
            // Load the file data into the editor
            const runtime = new window.XVGRuntime();
            runtime.load(result.data);
            runtime.currentFilePath = result.path;
            
            // Update editor state
            if (window.XVGSystem) {
                window.XVGSystem.currentFile = result.path;
                window.XVGSystem.renderCanvas();
            }
            
            if (window.notify) {
                window.notify('success', `Opened: ${result.path}`);
            }
        }
    };
    
    window.saveFile = async () => {
        const state = window.XVGSystem?.state?.appState;
        if (!state) return;
        
        // Serialize current state to XVG format
        const data = JSON.stringify({
            version: '1.0',
            paths: state.paths || [],
            images: state.images || [],
            layers: state.layers || [],
            transform: state.canvasTransform || {}
        });
        
        const encoder = new TextEncoder();
        const bytes = encoder.encode(data);
        
        const filePath = await TauriFileOperations.saveFile(
            bytes,
            window.XVGSystem.currentFile || 'untitled.xvg'
        );
        
        if (filePath) {
            window.XVGSystem.currentFile = filePath;
            window.XVGSystem.isModified = false;
            
            if (window.notify) {
                window.notify('success', `Saved: ${filePath}`);
            }
        }
    };
    
    window.saveFileAs = async () => {
        // Same as saveFile but always shows dialog
        const state = window.XVGSystem?.state?.appState;
        if (!state) return;
        
        const data = JSON.stringify({
            version: '1.0',
            paths: state.paths || [],
            images: state.images || [],
            layers: state.layers || [],
            transform: state.canvasTransform || {}
        });
        
        const encoder = new TextEncoder();
        const bytes = encoder.encode(data);
        
        const filePath = await TauriFileOperations.saveFile(bytes, 'untitled.xvg');
        
        if (filePath) {
            window.XVGSystem.currentFile = filePath;
            window.XVGSystem.isModified = false;
            
            if (window.notify) {
                window.notify('success', `Saved: ${filePath}`);
            }
        }
    };
    
    window.newFile = () => {
        if (window.XVGSystem?.isModified) {
            if (!confirm('You have unsaved changes. Create a new file anyway?')) {
                return;
            }
        }
        
        // Reset editor state
        if (window.XVGSystem) {
            window.XVGSystem.state.appState.paths = [];
            window.XVGSystem.state.appState.images = [];
            window.XVGSystem.currentFile = null;
            window.XVGSystem.isModified = false;
            window.XVGSystem.renderCanvas();
        }
        
        if (window.notify) {
            window.notify('info', 'New file created');
        }
    };
    
    console.log('[Tauri] File operations initialized');
}

// Start the editor when the DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!isTauri) {
            // Web mode already started via dynamic import
        }
    });
} else {
    if (!isTauri) {
        // Web mode already started via dynamic import
    }
}
