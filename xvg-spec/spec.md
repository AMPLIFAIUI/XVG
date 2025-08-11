# XVG 1.0 "Tesseract" File Format

## Overview
XVG (eXtensible Vector Graphics) is a production-grade, modular file format for vector graphics, animations, and interactive content.

## File Structure
- **Magic**: `XVG\x02`
- **CRC-32 footer**: big-endian
- **Sections**: all optional, length-prefixed

## Section Types
| ID | Name | Description |
|----|------|-------------|
| 0 | Header | Basic file information |
| 1 | JSON Metadata | Structured metadata |
| 2 | Frame Table | Animation frame definitions |
| 3 | Vector Commands | Drawing instructions |
| 4 | Assets | PNG/JPEG/OTF/WAV/WGSL files |
| 5 | SDF Weights | Signed Distance Field weights |
| 6 | CRDT Log | Conflict-free replicated data type log |
| 7 | Scene 3-D | 3D scene definitions |
| 8 | Shader Library | GPU shader code |
| 9 | Animation Curves | Keyframe and easing data |
| 10 | Audio Stems | Audio track data |
| 11 | Font Subsets | Font character subsets |
| 12 | Physics Snapshot | Physics simulation state |
| 13 | Color Profiles | ICC color profiles |
| 14 | Custom | User-defined sections |

## Forward Compatibility
New sections are ignored by old parsers, ensuring backward compatibility while allowing format evolution. 