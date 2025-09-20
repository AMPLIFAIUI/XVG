# XVG 1.0 "Tesseract" File Format

## Overview
XVG (eXtensible Vector Graphics) is a production-grade, modular file format for vector graphics, animations, and interactive content.

## File Structure
- **Magic**: `XVG\x03` (Bumped for advanced features)
- **Footer**: `XVGEOF`
- **Sections**: all optional, length-prefixed

## Section Types
| ID | Name | Description |
|----|------|-------------|
| 0 | Header | Basic file information |
| 1 | JSON Metadata | Structured metadata |
| 2 | Frame Table | Animation frame definitions |
| 3 | Vector Commands | Drawing instructions |
| 4 | Raster Assets | PNG/JPEG/OTF/WAV files |
| 5 | SDF Weights | Signed Distance Field weights |
| 6 | CRDT Log | Conflict-free replicated data type log |
| 7 | Shader Library | GPU shader code (WGSL) |
| 8 | Scene 3D | 3D scene definitions |
| 9 | Audio | Audio track data |
| 10 | Physics | Physics simulation state |
| 11 | Font Subsets | Font character subsets |
| 12 | Custom | User-defined sections |
| 13 | Animation Curves | Keyframe and easing data |
| 14 | Audio Tracks | Audio track data |
| 15 | Metadata | Additional metadata |
| 16 | Font Subsets | Font character subsets |
| 17 | Physics Snapshots | Physics simulation state |
| 18 | Instancing | 3D object instancing |
| 19 | Effects | Visual effects and filters |
| 20 | Color Profile | ICC color profiles |
| 21 | Variable Fonts | Variable font support |
| 22 | HDR Lightfield | High dynamic range lighting |
| 23 | Deltas | Incremental updates |

## Core Features
- **Vector Graphics**: Path-based drawing with fill/stroke styles
- **SDF Engine**: Neural network-based signed distance fields
- **WGSL Shaders**: GPU-accelerated shader execution
- **3D Extrusion**: 2D path to 3D mesh conversion
- **CRDT Engine**: Real-time collaboration support
- **Animation**: Keyframe-based animation curves
- **Audio**: Multi-track audio support
- **Physics**: Real-time physics simulation
- **Fonts**: Variable font and subset support

## Forward Compatibility
New sections are ignored by old parsers, ensuring backward compatibility while allowing format evolution. 