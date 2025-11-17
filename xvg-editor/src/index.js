import init, { XVGRuntime, XVGFile, XVGSDFEngine, XVG3DEngine, XVGCRDTEngine, applyCrdtOp } from '../modules/xvg_wasm.js';

// Import editor modules (these rely on global scope and will be refactored later)
import '../pkg/xvg-core.js'; // Sets up window.XVGCore
import '../pkg/xvg-engine-integration.js'; // Sets up window.XVGEngineIntegration  
import '../pkg/xvg-tools.js'; // Tools initialization
import '../pkg/xvg-utilities.js'; // Utility functions

// The WASM module is the first thing that must be loaded and initialized.
async function startXVGEditor() {
    try {
        // 1. Initialize WASM. This loads the .wasm file and makes the Rust functions available.
        await init();
        console.log("✅ WebAssembly module initialized successfully.");

        // 2. Expose WASM exports globally for engine integration
        window.XVGRuntime = XVGRuntime;
        window.XVGFile = XVGFile;
        window.XVGSDFEngine = XVGSDFEngine;
        window.XVG3DEngine = XVG3DEngine;
        window.XVGCRDTEngine = XVGCRDTEngine;
        window.applyCrdtOp = applyCrdtOp;
        
        // 3. Initialize engine integration layer (creates window.xvgEngines)
        const engineIntegration = new window.XVGEngineIntegration();
        await engineIntegration.init();
        
        // 4. Initialize the core application
        window.XVGSystem = new window.XVGCore();
        window.XVGSystem.initializeCanvas();
        
        // 5. Initialize tools with the core instance
        if (typeof window.initializeTools === 'function') {
            window.initializeTools(window.XVGSystem);
        }
        
        console.log("🚀 XVG Editor is now running with WASM-based core engines.");

    } catch (err) {
        console.error("❌ Failed to initialize XVG Editor:", err);
    }
}

// Start the editor when the DOM is ready
document.addEventListener('DOMContentLoaded', startXVGEditor);

