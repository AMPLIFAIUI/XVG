# XVG Editor

A professional vector graphics editor with XVG format support, advanced engines (SDF, 3D, WGSL, CRDT), and real-time collaboration.

## Features

### Core Functionality
- **Vector Graphics Editing**: Professional-grade vector drawing tools
- **XVG Format Support**: Native XVG file format with WebAssembly backend
- **Multi-Format Support**: Import/Export SVG, PNG, JPG formats
- **Layer Management**: Advanced layer system with visibility and locking
- **Undo/Redo System**: Complete state management with unlimited undo/redo

### Advanced Engines
- **SDF Engine**: Neural network-based signed distance fields for infinite resolution
- **3D Extrusion Engine**: Transform 2D paths into 3D meshes with STL export
- **WGSL Shader Engine**: GPU-accelerated fragment shader processing
- **CRDT Engine**: Real-time collaborative editing with Lamport timestamps

### Professional Tools
- **Drawing Tools**: Pen, Rectangle, Circle, Line, Text tools
- **Editing Tools**: Select, Move, Scale, Rotate, Eraser
- **Advanced Tools**: Gradient, Pattern, Blur, Shadow effects
- **Boolean Operations**: Union, Intersection, Subtraction, XOR

### Performance & Quality
- **Real-time Performance Monitoring**: Frame rate, memory usage, operation tracking
- **Asset Management**: Optimized loading, caching, compression
- **System Health Monitoring**: Comprehensive health checks and recommendations
- **Production Ready**: Professional-grade code quality and error handling

## Installation

### Prerequisites
- Node.js 18+ 
- Modern web browser with WebAssembly support
- WebGL 2.0 support for shader engine

### Setup
```bash
# Clone the repository
git clone <repository-url>
cd xvg-editor

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Usage

### Getting Started
1. Open the editor in your browser
2. Use the toolbar to select drawing tools
3. Click and drag on the canvas to create shapes
4. Use the layer panel to manage your artwork
5. Save your work using File > Save

### Keyboard Shortcuts
- `Ctrl+N`: New File
- `Ctrl+O`: Open File
- `Ctrl+S`: Save File
- `Ctrl+Z`: Undo
- `Ctrl+Y`: Redo
- `Ctrl+C`: Copy
- `Ctrl+V`: Paste
- `Ctrl+A`: Select All
- `Delete`: Delete Selected
- `Ctrl+Shift+E`: Toggle Engine Status
- `Ctrl+Shift+P`: Toggle Performance Monitor

### Tools
- **Select Tool**: Click and drag to select objects
- **Pen Tool**: Click to create paths
- **Rectangle Tool**: Click and drag to create rectangles
- **Circle Tool**: Click and drag to create circles
- **Line Tool**: Click and drag to create lines
- **Text Tool**: Click to add text
- **Eraser Tool**: Click and drag to erase parts of paths

### Layers
- **Add Layer**: Click the + button in the layer panel
- **Rename Layer**: Double-click the layer name
- **Toggle Visibility**: Click the eye icon
- **Lock Layer**: Click the lock icon
- **Delete Layer**: Right-click and select delete

## API Reference

### Global Functions
- `window.help()`: Show help dialog
- `window.about()`: Show about dialog
- `window.zoomIn()`: Zoom in by 10%
- `window.zoomOut()`: Zoom out by 10%
- `window.toggleGrid()`: Toggle grid visibility
- `window.testXVGWasm()`: Test WASM functionality
- `window.debugEngineStatus()`: Show engine status
- `window.runSystemHealthCheck()`: Run comprehensive health check
- `window.showPerformanceDashboard()`: Show performance metrics

### Path Management
- `window.addPath(pathData)`: Add a new path
- `window.removePath(pathId)`: Remove a path by ID
- `window.selectPath(pathId)`: Select a path
- `window.deselectAll()`: Clear selection

### Layer Management
- `window.addLayer(name)`: Add a new layer
- `window.removeLayer(index)`: Remove a layer
- `window.toggleLayerVisibility(index)`: Toggle layer visibility
- `window.toggleLayerLock(index)`: Toggle layer lock

## Development

### Project Structure
```
xvg-editor/
├── pkg/                    # Core application files
│   ├── xvg-core.js        # Main application logic
│   ├── xvg-tools.js       # Drawing and editing tools
│   ├── xvg-utilities.js   # Utility functions
│   ├── xvg-engine-integration.js # Engine integrations
│   └── server.js          # Development server
├── tests/                  # Test suite
│   ├── test-framework.js  # Testing framework
│   └── test-automation.js # Automated tests
├── webpack.config.js      # Webpack configuration
└── package.json           # Project configuration
```

### Building
```bash
# Build WASM modules
npm run build:wasm

# Optimize assets
npm run build:assets

# Create production bundle
npm run build:bundle

# Full production build
npm run build
```

### Testing
```bash
# Run test suite
npm test

# Run automated tests
npm run test:automated

# Run performance tests
npm run test:performance
```

## Architecture

### Core Systems
- **Canvas Rendering**: HTML5 Canvas with WebGL acceleration
- **State Management**: Centralized state with undo/redo support
- **Event Handling**: Mouse, keyboard, and touch event management
- **File I/O**: XVG, SVG, PNG, JPG import/export

### Advanced Engines
- **SDF Engine**: Neural network weight generation for infinite resolution
- **3D Engine**: Path extrusion and matrix transformations
- **Shader Engine**: WGSL compilation and GPU processing
- **CRDT Engine**: Collaborative editing with conflict resolution

### Performance Systems
- **Asset Manager**: Optimized loading and caching
- **Performance Profiler**: Real-time monitoring and optimization
- **System Health Checker**: Comprehensive health monitoring
- **Memory Management**: Automatic cleanup and optimization

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Check the help dialog in the editor (`window.help()`)
- Run system health check (`window.runSystemHealthCheck()`)
- View performance dashboard (`window.showPerformanceDashboard()`)
- Check browser console for detailed error messages

## Changelog

### Version 1.0.0
- Initial release
- Complete vector graphics editing suite
- Advanced engine integrations
- Real-time collaboration support
- Professional-grade performance monitoring
