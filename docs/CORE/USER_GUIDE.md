# XVG Editor User Guide

## Getting Started

### First Launch
1. Open the XVG Editor in your browser
2. The editor will automatically initialize with a blank canvas
3. Use the toolbar on the left to select drawing tools
4. Click and drag on the canvas to create your first shape

### Interface Overview
- **Toolbar**: Drawing and editing tools on the left
- **Canvas**: Main drawing area in the center
- **Layer Panel**: Layer management on the right
- **Status Bar**: Information and controls at the bottom

## Drawing Tools

### Select Tool
- **Purpose**: Select, move, and modify existing objects
- **Usage**: Click on objects to select them, drag to move
- **Selection**: Hold Shift to select multiple objects
- **Transform**: Use handles to resize and rotate

### Pen Tool
- **Purpose**: Draw freeform paths
- **Usage**: Click and drag to draw smooth curves
- **Tips**: 
  - Click to create sharp corners
  - Drag to create smooth curves
  - Double-click to finish the path

### Rectangle Tool
- **Purpose**: Create rectangular shapes
- **Usage**: Click and drag to create rectangles
- **Modifiers**:
  - Hold Shift for perfect squares
  - Hold Alt to draw from center

### Circle Tool
- **Purpose**: Create circular shapes
- **Usage**: Click and drag to create circles
- **Modifiers**:
  - Hold Shift for perfect circles
  - Hold Alt to draw from center

### Line Tool
- **Purpose**: Create straight lines
- **Usage**: Click and drag to create lines
- **Modifiers**:
  - Hold Shift for horizontal/vertical lines
  - Hold Alt to draw from center

### Text Tool
- **Purpose**: Add text to your design
- **Usage**: Click on canvas to place text cursor
- **Editing**: Type to add text, use toolbar for formatting
- **Styling**: Change font, size, color, and alignment

### Eraser Tool
- **Purpose**: Remove parts of existing paths
- **Usage**: Click and drag over paths to erase
- **Size**: Adjust eraser size using the control panel
- **Mode**: Choose between vector and raster erasing

### Brush Tool
- **Purpose**: Create freeform brush strokes
- **Usage**: Click and drag to paint with brush
- **Size**: Adjust brush size in the control panel
- **Opacity**: Control brush transparency
- **Color**: Select brush color from color picker

### Background Remover Tool
- **Purpose**: Automatically remove backgrounds from images
- **Usage**: Click on areas to remove background
- **Tolerance**: Adjust sensitivity of background detection
- **Refinement**: Fine-tune edges after initial removal

## Layer Management

### Understanding Layers
Layers are like transparent sheets stacked on top of each other. Each layer can contain multiple objects and has its own visibility and lock settings.

### Layer Operations
- **Add Layer**: Click the + button in the layer panel
- **Rename Layer**: Double-click the layer name
- **Delete Layer**: Right-click and select "Delete"
- **Duplicate Layer**: Right-click and select "Duplicate"

### Layer Controls
- **Eye Icon**: Toggle layer visibility
- **Lock Icon**: Toggle layer lock (prevents editing)
- **Drag Handle**: Reorder layers by dragging

### Layer Tips
- Keep related objects on the same layer
- Use descriptive layer names
- Lock layers you're not currently editing
- Hide layers to focus on specific elements

## File Operations

### Creating New Documents
- **New File**: File > New or Ctrl+N
- **Canvas Size**: Set custom dimensions in the new file dialog
- **Templates**: Choose from predefined templates

### Opening Files
- **Supported Formats**: XVG, SVG, PNG, JPG
- **Drag & Drop**: Drag files directly onto the canvas
- **File Dialog**: File > Open or Ctrl+O

### Saving Your Work
- **Save**: File > Save or Ctrl+S
- **Save As**: File > Save As for custom filename
- **Auto-save**: Editor automatically saves to browser storage
- **Export**: File > Export for different formats

### File Formats
- **XVG**: Native format with full feature support
- **SVG**: Vector format for web use
- **PNG**: Raster format for images
- **JPG**: Compressed raster format

## Advanced Features

### Boolean Operations
Combine shapes using boolean operations:
- **Union**: Combine shapes into one
- **Intersection**: Keep only overlapping areas
- **Subtraction**: Remove overlapping areas
- **XOR**: Keep non-overlapping areas

### Transformations
- **Move**: Drag selected objects
- **Scale**: Use corner handles to resize
- **Rotate**: Use rotation handle
- **Skew**: Use side handles for perspective

### Effects and Styling
- **Gradients**: Apply linear or radial gradients
- **Patterns**: Use image patterns for fills
- **Shadows**: Add drop shadows to objects
- **Blur**: Apply blur effects

### Advanced Engines

#### SDF Engine
- **Purpose**: Infinite resolution vector graphics
- **Usage**: Automatically applied to complex paths
- **Benefits**: Scalable without quality loss

#### 3D Engine
- **Purpose**: Extrude 2D paths into 3D shapes
- **Usage**: Select path and use 3D tools
- **Export**: Save as STL for 3D printing

#### Shader Engine
- **Purpose**: GPU-accelerated effects
- **Usage**: Apply custom WGSL shaders
- **Performance**: Real-time rendering

## Keyboard Shortcuts

### File Operations
- `Ctrl+N`: New file
- `Ctrl+O`: Open file
- `Ctrl+S`: Save file
- `Ctrl+Shift+S`: Save as

### Editing
- `Ctrl+Z`: Undo
- `Ctrl+Y`: Redo
- `Ctrl+C`: Copy
- `Ctrl+V`: Paste
- `Ctrl+X`: Cut
- `Delete`: Delete selected

### Selection
- `Ctrl+A`: Select all
- `Ctrl+D`: Deselect all
- `Shift+Click`: Add to selection
- `Ctrl+Click`: Toggle selection

### View
- `Ctrl++`: Zoom in
- `Ctrl+-`: Zoom out
- `Ctrl+0`: Fit to view
- `Ctrl+1`: Actual size
- `G`: Toggle grid

### Tools
- `V`: Select tool
- `P`: Pen tool
- `M`: Rectangle tool
- `O`: Circle tool
- `L`: Line tool
- `T`: Text tool
- `E`: Eraser tool
- `B`: Brush tool
- `R`: Background Remover tool

## Performance Tips

### Optimizing Performance
- **Large Files**: Use layers to organize complex designs
- **Memory Usage**: Close unused files
- **Rendering**: Hide unnecessary layers while editing
- **Assets**: Optimize imported images

### Performance Monitoring
- **Dashboard**: View > Performance Dashboard
- **Health Check**: Help > System Health Check
- **Metrics**: Monitor frame rate and memory usage

### Troubleshooting Performance
- **Slow Rendering**: Reduce canvas size or hide layers
- **High Memory**: Close unused files and clear cache
- **Lag**: Check browser performance and close other tabs

## Collaboration

### Real-time Editing
- **Multi-user**: Multiple users can edit simultaneously
- **Conflict Resolution**: Automatic conflict resolution using CRDT
- **Presence**: See other users' cursors and selections

### Sharing
- **Export**: Export in various formats for sharing
- **Cloud Save**: Save to cloud storage services
- **Version Control**: Track changes and revisions

## Accessibility

### Keyboard Navigation
- **Tab**: Navigate between interface elements
- **Enter**: Activate buttons and controls
- **Escape**: Close dialogs and cancel operations
- **Arrow Keys**: Navigate within lists and menus

### Screen Reader Support
- **Alt Text**: All images have descriptive alt text
- **ARIA Labels**: Interface elements are properly labeled
- **Focus Management**: Clear focus indicators

### Visual Accessibility
- **High Contrast**: High contrast mode available
- **Zoom**: Browser zoom works with the interface
- **Color Blind**: Color-blind friendly color schemes

## Troubleshooting

### Common Issues

#### Canvas Not Loading
- Check browser console for errors
- Ensure WebGL is enabled
- Try refreshing the page

#### Tools Not Working
- Check if objects are selected
- Verify layer is not locked
- Try switching tools

#### File Operations Failing
- Check file permissions
- Ensure sufficient disk space
- Try different file format

#### Performance Issues
- Close other browser tabs
- Reduce canvas size
- Hide unnecessary layers

### Getting Help
- **Help Dialog**: Help > Help or press F1
- **About Dialog**: Help > About
- **System Health**: Help > System Health Check
- **Performance**: View > Performance Dashboard

### Error Messages
- **WASM Error**: WebAssembly module failed to load
- **Canvas Error**: Canvas rendering failed
- **File Error**: File operation failed
- **Engine Error**: Advanced engine failed

## Best Practices

### Design Workflow
1. **Plan**: Sketch your design first
2. **Organize**: Use layers to organize elements
3. **Create**: Use appropriate tools for each element
4. **Refine**: Apply effects and styling
5. **Export**: Save in appropriate format

### File Management
- **Naming**: Use descriptive filenames
- **Backup**: Regularly save your work
- **Versions**: Keep multiple versions of important files
- **Organization**: Organize files in folders

### Performance
- **Optimize**: Use appropriate tools for the task
- **Simplify**: Avoid unnecessary complexity
- **Monitor**: Keep an eye on performance metrics
- **Clean**: Regularly clean up unused elements
