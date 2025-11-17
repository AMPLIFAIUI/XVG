// XVG Vector Graphics Editor - Complete Integration with XVG Engines
import { invoke } from '@tauri-apps/api/tauri';
import { open, save } from '@tauri-apps/api/dialog';
import { readBinaryFile, writeBinaryFile } from '@tauri-apps/api/fs';

// Application State
let appState = {
    currentTool: 'direct-select',
    activeTab: 'properties',
    selectedObjects: [],
    paths: [], // Store all XVG paths
    layers: [
        {id: 1, name: 'Background', visible: true, locked: false, active: false},
        {id: 2, name: 'Layer 1', visible: true, locked: false, active: true},
        {id: 3, name: 'Text Layer', visible: true, locked: false, active: false}
    ],
    zoom: 100,
    canvasPosition: {x: 0, y: 0},
    performance: {
        fps: 60,
        memory: '256 MB',
        gpu: 'Available'
    },
    collaboration: {
        users: [
            {id: 1, name: 'You', avatar: '#1FB8CD', online: true},
            {id: 2, name: 'Alice', avatar: '#FFC185', online: true}
        ],
        operations: [
            {type: 'draw', description: 'Added rectangle', time: '2 min ago', author: 'You'},
            {type: 'style', description: 'Changed fill color', time: '5 min ago', author: 'Alice'}
        ]
    },
    sdf: {
        epochs: 1000,
        learningRate: 0.01,
        isTraining: false
    },
    shader: {
        code: "// WGSL Shader Code\n\\@fragment\nfn main(\\@location(0) coord: vec2<f32>) -> \\@location(0) vec4<f32> {\n    return vec4<f32>(1.0, 0.0, 0.0, 1.0);\n}",
        uniforms: {
            time: 0.0,
            colorR: 1.0,
            colorG: 0.0,
            colorB: 0.0
        }
    },
    extrusion: {
        depth: 10,
        bevel: 0
    },
    styles: {
        fill: '#1FB8CD',
        fillAlpha: 100,
        stroke: '#000000',
        strokeWidth: 1,
        opacity: 100,
        blendMode: 'normal'
    },
    drawingState: null,
    isDrawing: false,
    canvasTransform: {
        zoom: 1.0,
        pan_x: 0.0,
        pan_y: 0.0,
        canvas_width: 2000,
        canvas_height: 1500
    }
};

// XVG ENGINE INTEGRATION - All stubs replaced with real XVG engine calls

// Real XVG engine rendering
async function renderCanvas() {
    try {
        const canvas = document.getElementById('main-canvas');
        if (!canvas) return;
        
        // Get current canvas transform from XVG engine
        const transform = await invoke('get_canvas_transform');
        appState.canvasTransform = transform;
        
        // Render paths using XVG engine
        const renderResult = await invoke('render_canvas', {
            content: appState.paths,
            width: transform.canvas_width,
            height: transform.canvas_height
        });
        
        // Update canvas with rendered image
        updateCanvasWithImageData(canvas, renderResult.image_data, renderResult.width, renderResult.height);
        
        // Update performance stats
        updatePerformanceStats();
        
    } catch (error) {
        console.error('Canvas rendering error:', error);
        showNotification(`Rendering error: ${error}`, 'error');
    }
}

function updateCanvasWithImageData(canvas, imageData, width, height) {
    const ctx = canvas.getContext('2d');
    
    // Create ImageData from RGBA buffer
    const imgData = ctx.createImageData(width, height);
    imgData.data.set(imageData);
    
    // Clear canvas and draw new image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.putImageData(imgData, 0, 0);
}

// Real SDF neural network engine
async function convertToSDF() {
    try {
        appState.sdf.isTraining = true;
        updateSDFPreview();
        
        // Use XVG SDF engine for real neural network training
        const result = await invoke('convert_to_sdf', {
            paths: appState.paths,
            epochs: appState.sdf.epochs,
            learningRate: appState.sdf.learningRate
        });
        
        if (result.success) {
            appState.sdf.isTraining = false;
            console.log(`SDF training completed: ${result.training_time_ms}ms`);
            updateSDFPreview();
            showNotification("SDF neural network training completed", "success");
        } else {
            throw new Error(result.error || 'SDF training failed');
        }
        
    } catch (error) {
        appState.sdf.isTraining = false;
        console.error('SDF conversion error:', error);
        showNotification(`SDF error: ${error}`, 'error');
        updateSDFPreview();
    }
}

// Real WGSL shader engine
async function compileShader(source) {
    try {
        const code = source || document.getElementById('shader-code').value;
        console.log("Compiling shader:", code);
        
        // Use XVG shader engine for real WGSL compilation
        const result = await invoke('compile_shader', { shaderCode: code });
        
        if (result.success) {
            showNotification("Shader compiled successfully", "success");
            updateShaderPreview();
        } else {
            throw new Error(result.error || 'Shader compilation failed');
        }
        
    } catch (error) {
        console.error('Shader compilation error:', error);
        showNotification(`Shader error: ${error}`, 'error');
    }
}

// Real 3D scene engine
async function extrudePath(depth) {
    try {
        const extrusionDepth = depth || appState.extrusion.depth;
        console.log(`Extruding selected paths with depth: ${extrusionDepth}`);
        
        // Use XVG 3D engine for real path extrusion
        const result = await invoke('extrude_path', {
            paths: appState.paths,
            depth: extrusionDepth,
            bevel: appState.extrusion.bevel
        });
        
        if (result.success) {
            update3DViewport();
            showNotification(`Extruded with depth: ${extrusionDepth}px`, "info");
        } else {
            throw new Error(result.error || 'Extrusion failed');
        }
        
    } catch (error) {
        console.error('3D extrusion error:', error);
        showNotification(`Extrusion error: ${error}`, 'error');
    }
}

// Real CRDT collaboration engine
async function syncOperations() {
    try {
        const syncIcon = document.getElementById('sync-icon');
        const syncStatus = document.getElementById('sync-status');
        
        if (syncIcon && syncStatus) {
            syncIcon.className = 'fas fa-cloud syncing';
            syncStatus.textContent = 'Syncing...';
        }
        
        // Use XVG CRDT engine for real operation synchronization
        const operations = appState.collaboration.operations.map(op => ({
            type: op.type,
            description: op.description,
            timestamp: Date.now(),
            author_id: 1
        }));
        
        const mergedOps = await invoke('sync_operations', { operations });
        
        // Update local operations with merged results
        appState.collaboration.operations = mergedOps.map(op => ({
            type: op.type,
            description: op.description,
            time: 'Just now',
            author: 'You'
        }));
        
        if (syncIcon && syncStatus) {
            syncIcon.className = 'fas fa-cloud synced';
            syncStatus.textContent = 'Synced';
        }
        
    } catch (error) {
        console.error('CRDT sync error:', error);
        const syncIcon = document.getElementById('sync-icon');
        const syncStatus = document.getElementById('sync-status');
        
        if (syncIcon && syncStatus) {
            syncIcon.className = 'fas fa-cloud error';
            syncStatus.textContent = 'Sync failed';
        }
        
        showNotification(`Sync error: ${error}`, 'error');
    }
}

// Real XVG file format engine
async function saveXVGFile() {
    try {
        const filePath = await save({
            title: 'Save XVG File',
            filters: [{
                name: 'XVG Files',
                extensions: ['xvg']
            }]
        });
        
        if (filePath) {
            // Use XVG engine to save file
            await invoke('save_file', {
                filePath: filePath,
                content: appState.paths
            });
            
            showNotification("File saved successfully", "success");
            updateFileStatus(filePath);
            syncOperations();
        }
        
    } catch (error) {
        console.error('File save error:', error);
        showNotification(`Save error: ${error}`, 'error');
    }
}

// Real file opening with XVG engine
async function openXVGFile() {
    try {
        const filePath = await open({
            title: 'Open File',
            multiple: false,
            filters: [{
                name: 'All Supported Files',
                extensions: ['xvg', 'svg', 'png', 'jpeg', 'jpg', 'otf', 'wav']
            }]
        });
        
        if (filePath) {
            const fileType = filePath.split('.').pop()?.toLowerCase() || 'xvg';
            
            // Use XVG engine to open file
            const result = await invoke('open_file', {
                filePath: filePath,
                fileType: fileType
            });
            
            // Update canvas with loaded content
            const canvas = document.getElementById('main-canvas');
            if (canvas) {
                updateCanvasWithImageData(canvas, result.image_data, result.width, result.height);
            }
            
            // Update canvas transform
            appState.canvasTransform = result.transform;
            
            // Auto-fit content to viewport
            fitContentToViewport();
            
            showNotification("File opened successfully", "success");
            updateFileStatus(filePath);
            
        }
        
    } catch (error) {
        console.error('File open error:', error);
        showNotification(`Open error: ${error}`, 'error');
    }
}

// Real canvas zoom with XVG engine
async function handleZoom(direction) {
    try {
        const zoomStep = 0.1;
        let zoomFactor = 1.0;
        
        if (direction === 'in') {
            zoomFactor = 1.0 + zoomStep;
        } else if (direction === 'out') {
            zoomFactor = 1.0 - zoomStep;
        }
        
        const canvas = document.getElementById('main-canvas');
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const centerX = rect.width / 2.0;
            const centerY = rect.height / 2.0;
            
            // Use XVG engine for zoom
            const newTransform = await invoke('zoom_canvas', {
                zoomFactor: zoomFactor,
                centerX: centerX,
                centerY: centerY
            });
            
            appState.canvasTransform = newTransform;
            appState.zoom = Math.floor(newTransform.zoom * 100.0);
            updateZoomDisplay();
            renderCanvas();
        }
        
    } catch (error) {
        console.error('Zoom error:', error);
        showNotification(`Zoom error: ${error}`, 'error');
    }
}

// Real canvas pan with XVG engine
async function handleCanvasPan(deltaX, deltaY) {
    try {
        // Use XVG engine for pan
        const newTransform = await invoke('pan_canvas', {
            deltaX: deltaX,
            deltaY: deltaY
        });
        
        appState.canvasTransform = newTransform;
        renderCanvas();
        
    } catch (error) {
        console.error('Pan error:', error);
        showNotification(`Pan error: ${error}`, 'error');
    }
}

// Real performance monitoring with XVG engine
async function updatePerformanceStats() {
    try {
        const stats = await invoke('get_performance_stats');
        
        const fpsElement = document.getElementById('performance-fps');
        const memoryElement = document.getElementById('memory-usage');
        const gpuElement = document.getElementById('gpu-status');
        
        if (fpsElement) fpsElement.textContent = `FPS: ${Math.floor(stats.fps)}`;
        if (memoryElement) memoryElement.textContent = `Memory: ${stats.memory_mb} MB`;
        if (gpuElement) gpuElement.textContent = `GPU: ${stats.gpu_available ? 'Available' : 'Unavailable'}`;
        
        appState.performance.fps = stats.fps;
        appState.performance.memory = `${stats.memory_mb} MB`;
        appState.performance.gpu = stats.gpu_available ? 'Available' : 'Unavailable';
        
    } catch (error) {
        console.error('Performance stats error:', error);
    }
}

// Real engine status check
async function checkEngineStatus() {
    try {
        const status = await invoke('get_engine_status');
        console.log('XVG Engine Status:', status);
        
        // Update UI with engine status
        const statusElements = document.querySelectorAll('.engine-status');
        statusElements.forEach(element => {
            element.textContent = 'Ready';
            element.className = 'engine-status ready';
        });
        
    } catch (error) {
        console.error('Engine status error:', error);
        
        // Update UI with error status
        const statusElements = document.querySelectorAll('.engine-status');
        statusElements.forEach(element => {
            element.textContent = 'Error';
            element.className = 'engine-status error';
        });
    }
}

// Auto-fit content to viewport
function fitContentToViewport() {
    if (appState.paths.length === 0) return;
    
    // Calculate content bounds
    let minX = Number.MAX_VALUE;
    let minY = Number.MAX_VALUE;
    let maxX = Number.MIN_VALUE;
    let maxY = Number.MIN_VALUE;
    
    for (const path of appState.paths) {
        // Parse path data to find bounds
        let dataSlice = path.data;
        while (dataSlice.length >= 8) {
            const x = new DataView(dataSlice.buffer, dataSlice.byteOffset, 4).getFloat32(0, true);
            const y = new DataView(dataSlice.buffer, dataSlice.byteOffset + 4, 4).getFloat32(0, true);
            
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            
            dataSlice = dataSlice.slice(8);
        }
    }
    
    // Calculate zoom and pan to fit content
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const canvasWidth = appState.canvasTransform.canvas_width;
    const canvasHeight = appState.canvasTransform.canvas_height;
    
    const scaleX = canvasWidth / contentWidth;
    const scaleY = canvasHeight / contentHeight;
    const scale = Math.min(scaleX, scaleY, 1.0) * 0.9; // 90% of available space
    
    const centerX = (minX + maxX) / 2.0;
    const centerY = (minY + maxY) / 2.0;
    
    // Update transform
    appState.canvasTransform.zoom = scale;
    appState.canvasTransform.pan_x = -centerX * scale + canvasWidth / 2.0;
    appState.canvasTransform.pan_y = -centerY * scale + canvasHeight / 2.0;
    
                appState.zoom = Math.floor(scale * 100.0);
    updateZoomDisplay();
}

// Application Initialization
z// Initialize application state and canvas
function initializeApplication() {
    const canvas = document.getElementById('main-canvas');
    if (canvas) {
        appState.canvas = canvas;
        console.log('✅ Canvas initialized');
    } else {
        console.error('❌ Canvas not found');
    }
}

// Setup event listeners for canvas interaction
function setupEventListeners() {
    const canvas = document.getElementById('main-canvas');
    if (!canvas) {
        console.error('Canvas not found for event listeners');
        return;
    }

    // Mouse event handlers for canvas interaction
    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Convert screen coordinates to canvas coordinates
        const canvasX = x / appState.zoom * 100;
        const canvasY = y / appState.zoom * 100;
        
        if (appState.currentTool === 'direct-select') {
            window.XVGSelectionTool?.startBoxSelection?.(canvasX, canvasY);
        } else if (appState.currentTool === 'grab') {
            window.XVGPanTool?.startPan?.(x, y);
        }
        
        renderSelectionOverlay();
    });
    
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Convert screen coordinates to canvas coordinates
        const canvasX = x / appState.zoom * 100;
        const canvasY = y / appState.zoom * 100;
        
        if (appState.currentTool === 'direct-select') {
            window.XVGSelectionTool?.updateBoxSelection?.(canvasX, canvasY);
        } else if (appState.currentTool === 'grab') {
            window.XVGPanTool?.updatePan?.(x, y);
        }
        
        renderSelectionOverlay();
    });
    
    canvas.addEventListener('mouseup', (e) => {
        if (appState.currentTool === 'direct-select') {
            window.XVGSelectionTool?.endBoxSelection?.();
        } else if (appState.currentTool === 'grab') {
            window.XVGPanTool?.endPan?.();
        }
        
        renderCanvas();
    });
    
    canvas.addEventListener('mouseleave', (e) => {
        if (appState.currentTool === 'direct-select') {
            window.XVGSelectionTool?.endBoxSelection?.();
        } else if (appState.currentTool === 'grab') {
            window.XVGPanTool?.endPan?.();
        }
        
        renderCanvas();
    });
}

// Convert screen coordinates to canvas coordinates
function screenToCanvas(screenX, screenY) {
    if (!appState.canvas || !appState.canvasTransform) {
        return { x: screenX, y: screenY };
    }

    const transform = appState.canvasTransform;
    const zoom = transform.zoom || 1;
    const panX = transform.pan_x || 0;
    const panY = transform.pan_y || 0;

    return {
        x: (screenX - panX) / zoom,
        y: (screenY - panY) / zoom
    };
}

// Convert canvas coordinates to screen coordinates
function canvasToScreen(canvasX, canvasY) {
    if (!appState.canvas || !appState.canvasTransform) {
        return { x: canvasX, y: canvasY };
    }

    const transform = appState.canvasTransform;
    const zoom = transform.zoom || 1;
    const panX = transform.pan_x || 0;
    const panY = transform.pan_y || 0;

    return {
        x: canvasX * zoom + panX,
        y: canvasY * zoom + panY
    };
}

// Render selection overlay on top of main canvas
function renderSelectionOverlay() {
    const canvas = document.getElementById('main-canvas');
    if (!canvas || !window.XVGSelectionTool) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Save current canvas state
    ctx.save();

    // Apply transform for selection rendering
    const transform = appState.canvasTransform;
    if (transform) {
        ctx.setTransform(transform.zoom, 0, 0, transform.zoom, transform.pan_x, transform.pan_y);
    }

    // Render selection tool overlay
    window.XVGSelectionTool.render(ctx, transform);

    // Restore canvas state
    ctx.restore();
}

document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Check XVG engine status first
        await checkEngineStatus();
        
        // Initialize application
        initializeApplication();
        setupEventListeners();
        
        // Initial render
        await renderCanvas();
        
        // Update UI
        updateLayerList();
        startPerformanceMonitoring();
        
        console.log('XVG Vector Graphics Editor initialized with full engine integration');
        
    } catch (error) {
        console.error('Initialization error:', error);
        showNotification(`Initialization error: ${error}`, 'error');
    }
});
