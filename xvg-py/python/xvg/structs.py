from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

@dataclass
class Header:
    width:        int
    height:       int
    flags:        int  = 0
    frame_count:  int  = 1
    frame_rate:   float = 30.0
    feature_flags: int = 0

@dataclass
class Frame:
    offset: int
    duration: Optional[float] = None

@dataclass
class Asset:
    type: int
    name: str
    data: bytes
    compressed: bool = False

@dataclass
class SDFWeights:
    weights: bytes
    grid_hint: int = 64

@dataclass
class CRDTEntry:
    author: int
    lamport: int
    payload: bytes

@dataclass
class Scene3DMatrix:
    depth: int
    matrix: List[float]  # 16 f32 row-major

@dataclass
class ShaderWGSL:
    name: str
    wgsl: bytes
    compressed: bool = False

@dataclass
class XVGFile:
    header: Header
    json: Dict[str, Any] = field(default_factory=dict)
    frames: List[Frame] = field(default_factory=list)
    cmds:  bytes = b''
    assets: List[Asset] = field(default_factory=list)
    sdf: Optional[SDFWeights] = None
    crdt: List[CRDTEntry] = field(default_factory=list)
    scene3d: List[Scene3DMatrix] = field(default_factory=list)
    shaders: List[ShaderWGSL] = field(default_factory=list) 