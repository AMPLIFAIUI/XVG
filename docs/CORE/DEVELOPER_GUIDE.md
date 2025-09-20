# XVG Editor Developer Guide

## Architecture Overview

The XVG Editor is built with a modular architecture designed for extensibility and maintainability. The core system consists of several interconnected modules that handle different aspects of the application.

### Core Modules

#### xvg-core.js
The main application module containing:
- Application state management
- Canvas rendering system
- Event handling
- Global function definitions
- UI initialization

#### xvg-tools.js
Tool implementation module containing:
- Drawing tools (Pen, Brush, Rectangle, Circle, Line, Text)
- Editing tools (Select, Move, Scale, Rotate, Eraser)
- Advanced tools (Gradient, Pattern, Blur, Shadow, Background Remover)
- Tool-specific event handlers

#### xvg-utilities.js
Utility functions module containing:
- Mathematical utilities
- Color manipulation
- File format conversion
- Validation functions
- Helper functions

#### xvg-engine-integration.js
Engine integration module containing:
- WASM engine wrappers
- SDF engine integration
- 3D engine integration
- Shader engine integration
- CRDT engine integration

## State Management

### Application State Structure
```javascript
window.XVGSystem.appState = {
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
  canvasTransform: TransformObject,
  grid: GridObject
}
```

### State Updates
All state changes should go through centralized functions:
- `markAsModified()`: Mark document as modified
- `saveStateForUndo()`: Save state for undo/redo
- `renderCanvas()`: Trigger canvas redraw
- `updateLayerList()`: Update layer UI

## Event System

### Event Flow
1. **User Input**: Mouse, keyboard, or touch events
2. **Tool Handler**: Current tool processes the event
3. **State Update**: Application state is modified
4. **Rendering**: Canvas is redrawn
5. **UI Update**: Interface elements are updated

### Custom Events
The editor broadcasts custom events for collaboration:
```javascript
// Path change event
window.dispatchEvent(new CustomEvent('pathChange', {
  detail: { action: 'add', pathId: 'uuid', pathData: {...} }
}));

// Layer change event
window.dispatchEvent(new CustomEvent('layerChange', {
  detail: { action: 'add', layerIndex: 0, layerData: {...} }
}));
```

## Tool Development

### Creating a New Tool

#### 1. Define Tool Class
```javascript
class MyCustomTool {
  constructor() {
    this.name = 'myCustomTool';
    this.isDrawing = false;
    this.startPoint = null;
  }

  onMouseDown(event) {
    // Handle mouse down
  }

  onMouseMove(event) {
    // Handle mouse move
  }

  onMouseUp(event) {
    // Handle mouse up
  }

  finishDrawing() {
    // Complete the drawing operation
  }
}
```

#### 2. Register Tool
```javascript
// In xvg-tools.js
const myCustomTool = new MyCustomTool();
window.XVGSystem.tools.myCustomTool = myCustomTool;
```

#### 3. Add UI Button
```html
<!-- In index.html -->
<button id="myCustomTool-tool" class="toolbar-btn" onclick="setTool('myCustomTool')">
  <img src="assets/icons/my-custom-tool.png" alt="My Custom Tool">
</button>
```

### Tool Lifecycle
1. **Activation**: Tool is selected via `setTool()`
2. **Event Handling**: Tool receives mouse/keyboard events
3. **Drawing**: Tool creates/modifies paths
4. **Completion**: Tool calls `finishDrawing()`
5. **State Update**: Path is added to state and canvas redrawn

## Path System

### Path Object Structure
```javascript
{
  id: string,              // Unique identifier
  type: string,           // Path type
  data: string,           // SVG path data
  svgData: string,        // Complete SVG element
  binaryData: Uint8Array, // XVG binary data
  style: StyleObject,     // Visual styling
  tf: Array<number>,      // Transform matrix
  layerIndex: number      // Assigned layer
}
```

### Path Operations
- **Creation**: Use `addPath()` to create new paths
- **Modification**: Update path properties directly
- **Deletion**: Use `removePath()` to delete paths
- **Selection**: Use `selectPath()` and `deselectAll()`

## Layer System

### Layer Architecture
The layer system uses ID-based references for stability:
- **Path References**: Layers store path IDs, not indices
- **Consistent Operations**: All path operations update layer references
- **Race Condition Prevention**: Paths are assigned to layers by ID

### Layer Operations
```javascript
// Add path to layer
const activeLayer = XVGSystem.appState.layers[XVGSystem.appState.activeLayer];
if (activeLayer && activeLayer.paths) {
  activeLayer.paths.push(pathData.id);
}

// Remove path from all layers
XVGSystem.appState.layers.forEach(layer => {
  if (layer.paths) {
    const index = layer.paths.indexOf(pathId);
    if (index !== -1) {
      layer.paths.splice(index, 1);
    }
  }
});
```

## Rendering System

### Canvas Rendering Pipeline
1. **Clear Canvas**: Clear the canvas background
2. **Draw Grid**: Render grid if enabled
3. **Draw Paths**: Render paths by layer order
4. **Draw Selection**: Render selection handles
5. **Draw UI**: Render interface elements

### Rendering Optimization
- **Throttled Rendering**: Use `throttledRender()` for performance
- **Dirty Regions**: Only redraw changed areas
- **Layer Caching**: Cache layer contents when possible

## Engine Integration

### WASM Engine Access
```javascript
// Check if WASM is available
if (window.xvg_wasm && window.xvg_wasm.XVGFile) {
  // Use WASM functionality
  const xvgFile = new window.xvg_wasm.XVGFile(width, height);
} else {
  // Fallback to JavaScript implementation
  console.warn('WASM not available, using fallback');
}
```

### Engine Error Handling
```javascript
try {
  // Engine operation
  const result = engine.performOperation(data);
} catch (error) {
  console.error('Engine operation failed:', error);
  // Fallback to alternative method
}
```

## File System

### File Format Support
- **XVG**: Native binary format with WASM backend
- **SVG**: Standard vector format
- **PNG/JPG**: Raster image formats
- **JSON**: Fallback format when WASM unavailable

### File Operations
```javascript
// Save with fallback
window.saveFile = function() {
  try {
    if (window.xvg_wasm) {
      // Use WASM for XVG format
      const xvgFile = new window.xvg_wasm.XVGFile(width, height);
      // ... save as XVG
    } else {
      // Fallback to JSON format
      const jsonData = {
        version: '1.0',
        paths: XVGSystem.appState.paths,
        layers: XVGSystem.appState.layers
      };
      // ... save as JSON
    }
  } catch (error) {
    console.error('Save failed:', error);
  }
};
```

## Performance Monitoring

### Performance Metrics Collection
```javascript
// Collect performance data
const metrics = {
  frameTime: performance.now() - lastFrameTime,
  memoryUsage: performance.memory?.usedJSHeapSize || 0,
  assetLoadTimes: assetLoadTimes,
  engineOperationTimes: engineTimes
};

// Update performance profiler
if (performanceProfiler) {
  performanceProfiler.updateMetrics(metrics);
}
```

### Performance Optimization
- **Throttling**: Use throttled functions for frequent operations
- **Debouncing**: Debounce user input handlers
- **Caching**: Cache expensive calculations
- **Lazy Loading**: Load resources on demand

## Testing

### Test Framework
The editor includes a custom test framework in `tests/test-framework.js`:

```javascript
// Create test suite
const testSuite = new XVGTestFramework();

// Add test
testSuite.addTest('Path Creation', () => {
  const pathData = { type: 'path', data: 'M0,0 L10,10' };
  const result = window.addPath(pathData);
  testSuite.assert(result !== -1, 'Path should be created');
});

// Run tests
testSuite.runAll();
```

### Test Categories
- **Unit Tests**: Individual function testing
- **Integration Tests**: Module interaction testing
- **Performance Tests**: Performance benchmark testing
- **UI Tests**: User interface testing

## Error Handling

### Error Types
```javascript
class XVGError extends Error {
  constructor(message, type = 'XVGError') {
    super(message);
    this.name = type;
  }
}

class WASMError extends XVGError {
  constructor(message) {
    super(message, 'WASMError');
  }
}
```

### Error Handling Pattern
```javascript
try {
  // Risky operation
  performOperation();
} catch (error) {
  // Log error
  console.error('Operation failed:', error);
  
  // Notify user
  window.notify('error', error.message);
  
  // Attempt recovery
  attemptRecovery();
}
```

## Security Considerations

### Input Validation
```javascript
function validatePathData(pathData) {
  if (!pathData || typeof pathData !== 'object') {
    throw new ValidationError('Invalid path data');
  }
  
  if (!pathData.id || typeof pathData.id !== 'string') {
    throw new ValidationError('Path must have valid ID');
  }
  
  // Additional validation...
}
```

### XSS Prevention
- Sanitize all user input
- Use `textContent` instead of `innerHTML`
- Validate file uploads
- Escape special characters

### CORS Policy
```javascript
// Server-side CORS configuration
const corsOrigin = isValidOrigin(origin) ? origin : 'null';
res.setHeader('Access-Control-Allow-Origin', corsOrigin);
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
```

## Build System

### Webpack Configuration
The editor uses Webpack for asset bundling and optimization:

```javascript
// webpack.config.js
module.exports = {
  mode: 'production',
  entry: {
    main: './pkg/xvg-core.js'
  },
  optimization: {
    minimize: true,
    splitChunks: {
      chunks: 'all'
    }
  }
};
```

### Build Process
1. **WASM Build**: Compile Rust code to WebAssembly
2. **Asset Optimization**: Optimize images, CSS, and JS
3. **Bundling**: Create production bundles
4. **Testing**: Run test suite
5. **Deployment**: Deploy to production

## Deployment

### Production Checklist
- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Security headers configured
- [ ] Error handling implemented
- [ ] Documentation updated
- [ ] Browser compatibility verified

### Environment Configuration
```javascript
// Production environment
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  // Enable production optimizations
  enableProductionMode();
} else {
  // Enable development features
  enableDevelopmentMode();
}
```

## Contributing

### Code Style
- Use consistent indentation (2 spaces)
- Follow JavaScript ES6+ standards
- Add JSDoc comments for functions
- Use meaningful variable names

### Pull Request Process
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

### Code Review Checklist
- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] Performance impact considered
- [ ] Security implications reviewed
