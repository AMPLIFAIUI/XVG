import init, { XVGSDFEngine, XVGCRDTEngine, XVG3DEngine } from '../pkg/xvg_wasm.js';

// --- Global helper functions for the old monolithic code to work for now ---
// These files are still globally-scoped and will be refactored next.
// The old files rely on global variables like window.XVGSystem and window.XVGUtils.
// We must load them after the WASM is initialized.
// import '../pkg/xvg-utilities.js'; // Refactored and no longer needed here
import { XVGCore } from '../pkg/xvg-core.js'; // Import the new XVGCore class
import { XVGRuntime } from '../modules/xvg_wasm.js'; // Import the new XVGRuntime
import { initializeTools } from '../pkg/xvg-tools.js'; // Import the tool initializer
// import { EngineIntegration } from '../pkg/xvg-engine-integration.js'; // Import the refactored class

// The WASM module is the first thing that must be loaded and initialized.
async function startXVGEditor() {
    try {
        // 1. Initialize WASM. This loads the .wasm file and makes the Rust functions available.
        await init();
        console.log("✅ WebAssembly module initialized successfully.");

        // 2. Initialize the main application logic
        // Since the old code is globally scoped, we rely on the global functions being available
        // after the imports above. This is the part that needs to be refactored later.
        
        // The new XVGRuntime is exposed globally for the remaining unrefactored code to find it.
        window.XVGRuntime = XVGRuntime;
        
        // You can now call a global function to start the application, e.g.,
        window.XVGSystem = new XVGCore(); // Instantiate the core and expose it globally for remaining unrefactored code
        window.XVGSystem.initializeCanvas(); // Call the core initialization function on the instance
        window.Engine = new EngineIntegration(); // Instantiate and expose the new EngineIntegration class globally for the remaining unrefactored code.
        initializeTools(window.XVGSystem); // Initialize tools with the core instance 
        
        console.log("🚀 XVG Editor is now running with WASM-based core engines.");

    } catch (err) {
        console.error("❌ Failed to initialize XVG Editor:", err);
    }
}

// Start the editor when the DOM is ready
document.addEventListener('DOMContentLoaded', startXVGEditor);

