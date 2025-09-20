# XVG Editor API Documentation

## Core API

### Application State
The editor uses a centralized state object accessible via `window.XVGSystem.appState`:

```javascript
{
  canvas: {
    width: number,
    height: number,
    element: HTMLCanvasElement
  },
  paths: Array<PathObject>,
  layers: Array<LayerObject>,
  selectedPaths: Array<string>,
  currentTool: string,
  isModified: boolean,
  canvasTransform: {
    zoom: number,
    pan_x: number,
    pan_y: number,
    minZoom: number,
    maxZoom: number
  },
  grid: {
    visible: boolean,
    size: number,
    color: string
  }
}
```

### Path Object Structure
```javascript
{
  id: string,           // Unique identifier
  type: string,         // Path type (path, rectangle, circle, etc.)
  data: string,         // SVG path data
  svgData: string,     // Complete SVG element
  binaryData: Uint8Array, // XVG binary data
  style: {
    fill: string,
    stroke: string,
    strokeWidth: number,
    opacity: number
  },
  tf: Array<number>,    // Transform matrix [a, b, c, d, e, f]
  tx: number,           // Translation X
  ty: number,           // Translation Y
  layerIndex: number    // Assigned layer index
}
```

### Layer Object Structure
```javascript
{
  id: string,          // Unique identifier
  name: string,        // Display name
  visible: boolean,    // Visibility state
  locked: boolean,     // Lock state
  paths: Array<string> // Array of path IDs assigned to this layer
}
```

## Global Functions

### File Operations
- `window.newFile()`: Create a new document
- `window.openFile()`: Open file dialog
- `window.saveFile()`: Save current document
- `window.saveFileAs()`: Save with custom filename
- `window.exportSVG()`: Export as SVG
- `window.exportPNG()`: Export as PNG
- `window.exportJPG()`: Export as JPG
- `window.exportXVG()`: Export as XVG

### Path Management
- `window.addPath(pathData)`: Add a new path
  - Returns: path index or -1 on error
- `window.removePath(pathId)`: Remove a path by ID
  - Returns: boolean success
- `window.selectPath(pathId)`: Select a specific path
- `window.deselectAll()`: Clear all selections
- `window.selectAll()`: Select all paths

### Layer Management
- `window.addLayer(name?)`: Add a new layer
- `window.removeLayer(index)`: Remove a layer by index
- `window.renameLayer(index, newName)`: Rename a layer
- `window.toggleLayerVisibility(index)`: Toggle layer visibility
- `window.toggleLayerLock(index)`: Toggle layer lock
- `window.moveLayerUp(index)`: Move layer up in stack
- `window.moveLayerDown(index)`: Move layer down in stack
- `window.duplicateLayer(index)`: Duplicate a layer

### Tool Management
- `window.setTool(toolName)`: Set active tool
- `window.selectTool(toolName)`: Alias for setTool
- Available tools: 'select', 'pen', 'rectangle', 'circle', 'line', 'text', 'eraser'

### Canvas Operations
- `window.zoomIn()`: Zoom in by 10%
- `window.zoomOut()`: Zoom out by 10%
- `window.fitToView()`: Fit canvas to viewport
- `window.actualSize()`: Reset to 100% zoom
- `window.toggleGrid()`: Toggle grid visibility
- `window.panCanvas(dx, dy)`: Pan canvas by offset

### Selection Operations
- `window.copySelected()`: Copy selected paths to clipboard
- `window.cutSelected()`: Cut selected paths to clipboard
- `window.pasteClipboard()`: Paste from clipboard
- `window.deleteSelected()`: Delete selected paths

### Utility Functions
- `window.help()`: Show help dialog
- `window.about()`: Show about dialog
- `window.notify(type, message)`: Show notification
  - Types: 'info', 'success', 'warning', 'error'

### Debug Functions
- `window.testXVGWasm()`: Test WASM functionality
- `window.debugEngineStatus()`: Show engine status
- `window.runSystemHealthCheck()`: Run health check
- `window.showPerformanceDashboard()`: Show performance metrics
- `window.getPerformanceReport()`: Get performance data

## Event System

### Canvas Events
The canvas element receives the following events:
- `mousedown`: Start drawing/selection
- `mousemove`: Continue drawing/selection
- `mouseup`: Finish drawing/selection
- `mouseleave`: Cancel current operation
- `wheel`: Zoom canvas
- `keydown`: Keyboard shortcuts

### Custom Events
The editor broadcasts custom events for collaboration:
- `pathChange`: Path added, removed, or modified
- `layerChange`: Layer added, removed, or modified
- `selectionChange`: Selection changed
- `toolChange`: Active tool changed

## Engine Integration

### SDF Engine
```javascript
// Access SDF engine
const sdfEngine = window.xvg_wasm?.XVGSDFEngine;

// Generate neural network weights
const weights = sdfEngine.generate_weights(pathData);

// Evaluate SDF at point
const distance = sdfEngine.evaluate(point, weights);
```

### 3D Engine
```javascript
// Access 3D engine
const engine3d = window.xvg_wasm?.XVG3DEngine;

// Create 3D mesh from path
const mesh = engine3d.extrude_path(pathData, height);

// Export as STL
const stlData = engine3d.export_stl(mesh);
```

### Shader Engine
```javascript
// Access shader engine
const shaderEngine = window.xvg_wasm?.XVGWGSLShaderEngine;

// Compile WGSL shader
const compiledShader = shaderEngine.compile_shader(wgslCode);

// Bind uniforms
shaderEngine.bind_uniform(name, value);
```

### CRDT Engine
```javascript
// Access CRDT engine
const crdtEngine = window.xvg_wasm?.XVGCRDTEngine;

// Create operation
const operation = crdtEngine.create_operation(type, data, timestamp);

// Apply operation
crdtEngine.apply_operation(operation);

// Resolve conflicts
const resolved = crdtEngine.resolve_conflicts(operations);
```

## Performance Monitoring

### Performance Metrics
```javascript
const report = window.getPerformanceReport();
// Returns:
{
  metrics: {
    frameTime: Array<number>,
    memoryUsage: Array<number>,
    assetLoadTimes: Array<number>,
    engineOperationTimes: Object,
    engines: {
      sdf: { memory: number, operations: number },
      shader: { memory: number, operations: number },
      scene3d: { memory: number, operations: number },
      crdt: { memory: number, operations: number }
    }
  },
  score: number,
  recommendations: Array<string>
}
```

### System Health
```javascript
const health = window.runSystemHealthCheck();
// Returns:
{
  overall: number,        // Health score 0-100
  engines: {
    wasm: boolean,
    canvas: boolean,
    webgl: boolean,
    sdf: boolean,
    shader: boolean,
    scene3d: boolean,
    crdt: boolean
  },
  performance: {
    frameRate: number,
    memoryUsage: number,
    assetLoadTime: number
  },
  issues: Array<string>,
  recommendations: Array<string>
}
```

## Error Handling

### Error Types
- `WASMError`: WebAssembly module errors
- `CanvasError`: Canvas rendering errors
- `FileError`: File I/O errors
- `EngineError`: Engine-specific errors
- `ValidationError`: Input validation errors

### Error Handling Pattern
```javascript
try {
  // Editor operation
  window.addPath(pathData);
} catch (error) {
  console.error('Operation failed:', error);
  window.notify('error', error.message);
}
```

## Browser Compatibility

### Required Features
- WebAssembly support
- WebGL 2.0
- ES6 modules
- Canvas 2D context
- File API
- Clipboard API

### Supported Browsers
- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Security Considerations

### CORS Policy
The editor implements strict CORS policies for file operations and cross-origin requests.

### XSS Prevention
All user input is sanitized and validated before processing.

### File Security
File operations are restricted to user-initiated actions only.

## Troubleshooting

### Common Issues
1. **WASM not loading**: Check browser console for errors
2. **Canvas not rendering**: Verify WebGL support
3. **File operations failing**: Check file permissions
4. **Performance issues**: Run performance dashboard

### Debug Commands
```javascript
// Test WASM functionality
window.testXVGWasm();

// Check engine status
window.debugEngineStatus();

// Run health check
window.runSystemHealthCheck();

// Show performance metrics
window.showPerformanceDashboard();
```
