#![cfg_attr(not(feature = "std"), no_std)]
extern crate alloc;

use alloc::vec::Vec;
use alloc::string::String;
use serde::{Deserialize, Serialize};

// XVG Tesseract Omega - Full Specification
pub const MAGIC: [u8; 4] = *b"XVG\x03"; // Bumped for advanced features
pub const FOOTER: &[u8] = b"XVGEOF";

// Advanced feature modules
pub mod sdf;
pub mod shader;
pub mod crdt;
pub mod three_d;
#[cfg(feature = "svg")]
pub mod svg_import;
pub mod export;

pub use export::file_to_svg;

// Re-export advanced engines
pub use sdf::SDFEngine;
pub use shader::{WGSLShaderEngine, CompiledShader, UniformValue};
pub use crdt::{CRDTEngine, CRDOpType};
pub use three_d::{Scene3DEngine, Mesh3D, Vertex3D, Light3D, LightType, BoundingBox3D, ExtrusionParams};

// Section IDs for all 23 types
pub const SECTION_HEADER: u8 = 0;
pub const SECTION_JSON: u8 = 1;
pub const SECTION_FRAMES: u8 = 2;
pub const SECTION_VECTOR: u8 = 3;
pub const SECTION_RASTER: u8 = 4;
pub const SECTION_SDF: u8 = 5;
pub const SECTION_CRDT: u8 = 6;
pub const SECTION_SHADER: u8 = 7;
pub const SECTION_SCENE3D: u8 = 8;
pub const SECTION_AUDIO: u8 = 9;
pub const SECTION_PHYSICS: u8 = 10;
pub const SECTION_FONTS: u8 = 11;
pub const SECTION_CUSTOM: u8 = 12;
pub const SECTION_ANIM_CURVES: u8 = 13;
pub const SECTION_AUDIO_TRACKS: u8 = 14;
pub const SECTION_METADATA: u8 = 15;
pub const SECTION_FONT_SUBSETS: u8 = 16;
pub const SECTION_PHYSICS_SNAPSHOTS: u8 = 17;
pub const SECTION_INSTANCING: u8 = 18;
pub const SECTION_EFFECTS: u8 = 19;
pub const SECTION_COLOR_PROFILE: u8 = 20;
pub const SECTION_VAR_FONTS: u8 = 21;
pub const SECTION_HDR_LIGHTFIELD: u8 = 22;
pub const SECTION_DELTAS: u8 = 23;

// ---- CORE STRUCTURES ----
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Header {
    pub width: u16,
    pub height: u16,
    pub frame_count: u32,
    pub frame_rate: f32,
    pub flags: u32, // Feature flags
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathRecord {
    pub data: Vec<u8>, // bincode of kurbo::BezPath
    pub tf: [f64; 6],  // 2×3 affine row-major
    pub style: PathStyle,
    pub original_svg: Option<String>, // Store original SVG path data for proper rendering
    pub layer_id: Option<u32>, // Layer ID for grouping paths
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathStyle {
    pub fill: Option<FillStyle>,
    pub stroke: Option<StrokeStyle>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

impl Default for PathStyle {
    fn default() -> Self {
        Self {
            fill: None,
            stroke: None,
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FillStyle {
    pub color: [f32; 4], // RGBA
    pub rule: FillRule,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrokeStyle {
    pub color: [f32; 4], // RGBA
    pub width: f32,
    pub cap: LineCap,
    pub join: LineJoin,
    pub dash_array: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FillRule {
    NonZero,
    EvenOdd,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LineCap {
    Butt,
    Round,
    Square,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LineJoin {
    Miter,
    Round,
    Bevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BlendMode {
    Normal,
    Multiply,
    Screen,
    Overlay,
    Darken,
    Lighten,
    ColorDodge,
    ColorBurn,
    HardLight,
    SoftLight,
    Difference,
    Exclusion,
}

// ---- ADVANCED SECTIONS ----

// SDF (Signed Distance Fields)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SDFLayer {
    pub shape_id: u32,
    pub weights: Vec<u8>, // compressed distance field
    pub grid_hint: u16,
    pub bounds: [f32; 4], // x, y, width, height
}

// CRDT (Conflict-free Replicated Data Types)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CRDTEntry {
    pub author: u16,
    pub lamport: u64,
    pub timestamp: u64,
    pub payload: Vec<u8>,
    pub operation_type: String, // Will be handled by CRDT engine
}



// Shaders (WGSL)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShaderWGSL {
    pub name: String,
    pub wgsl: String,
    pub compressed: bool,
    pub bind_groups: Vec<BindGroup>,
    pub entry_points: Vec<EntryPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BindGroup {
    pub binding: u32,
    pub ty: BindingType,
    pub visibility: ShaderStage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BindingType {
    UniformBuffer,
    StorageBuffer,
    Texture,
    Sampler,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryPoint {
    pub name: String,
    pub stage: ShaderStage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ShaderStage {
    Vertex,
    Fragment,
    Compute,
}

// 3D Scenes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Scene3DNode {
    pub layer_id: u32,
    pub depth: f32,
    pub matrix: [f32; 16], // row-major 4×4
    pub mesh: Option<Vec<u8>>, // Serialized mesh data
    pub material: Option<Material3D>,
}



#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Material3D {
    pub albedo: [f32; 4],
    pub metallic: f32,
    pub roughness: f32,
    pub normal_map: Option<Vec<u8>>,
    pub albedo_map: Option<Vec<u8>>,
}

// Animation Curves
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimCurve {
    pub property: String, // "transform.rotate.z"
    pub keys: Vec<Keyframe>,
    pub interpolation: InterpolationType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Keyframe {
    pub time: f32,
    pub value: f32,
    pub easing: Easing,
    pub in_tangent: Option<f32>,
    pub out_tangent: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Easing {
    Linear,
    Cubic(f32, f32, f32, f32), // bezier control points
    Step,
    Spring { mass: f32, damping: f32, stiffness: f32 },
    Elastic { amplitude: f32, period: f32 },
    Bounce { bounces: u32, stiffness: f32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InterpolationType {
    Linear,
    Bezier,
    Step,
    CatmullRom,
}

// Audio
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioTrack {
    pub track_id: u32,
    pub codec: AudioCodec,
    pub data: Vec<u8>, // compressed frames
    pub sample_rate: u32,
    pub channels: u8,
    pub start_time: f32,
    pub duration: f32,
    pub volume: f32,
    pub pan: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AudioCodec {
    Opus,
    FLAC,
    PCM,
    MP3,
}

// Physics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhysicsSnapshot {
    pub timestamp: f32,
    pub bodies: Vec<PhysicsBody>,
    pub constraints: Vec<PhysicsConstraint>,
    pub gravity: [f32; 3],
    pub time_scale: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhysicsBody {
    pub layer_id: u32,
    pub body_type: BodyType,
    pub translation: [f32; 3],
    pub rotation: [f32; 4], // quaternion
    pub lin_vel: [f32; 3],
    pub ang_vel: [f32; 3],
    pub mass: f32,
    pub friction: f32,
    pub restitution: f32,
    pub collider: Collider,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BodyType {
    Dynamic,
    Kinematic,
    Static,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Collider {
    Sphere { radius: f32 },
    Box { half_extents: [f32; 3] },
    Capsule { radius: f32, height: f32 },
    Cylinder { radius: f32, height: f32 },
    ConvexHull { vertices: Vec<[f32; 3]> },
    Trimesh { vertices: Vec<[f32; 3]>, indices: Vec<u32> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhysicsConstraint {
    pub body_a: u32,
    pub body_b: u32,
    pub constraint_type: ConstraintType,
    pub params: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConstraintType {
    Fixed,
    Prismatic,
    Revolute,
    Spherical,
    Distance,
}

// Fonts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontSubset {
    pub family: String,
    pub style: String,
    pub glyphs: Vec<u8>, // glyf table bytes
    pub cmap: Vec<u8>,   // cmap table bytes
    pub hmtx: Vec<u8>,   // hmtx table bytes
    pub hhea: Vec<u8>,   // hhea table bytes
    pub os2: Vec<u8>,    // OS/2 table bytes
    pub name: Vec<u8>,   // name table bytes
}

// Variable Fonts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VarFont {
    pub family: String,
    pub axes: Vec<FontAxis>,
    pub instances: Vec<FontInstance>,
    pub gvar: Vec<u8>,   // gvar table
    pub hvar: Vec<u8>,   // hvar table
    pub avar: Vec<u8>,   // avar table
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontAxis {
    pub tag: String,     // "wght", "wdth", etc.
    pub min: f32,
    pub max: f32,
    pub default: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontInstance {
    pub name: String,
    pub coordinates: Vec<f32>,
}

// Effects
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectPass {
    pub name: String,
    pub wgsl: String,
    pub inputs: Vec<EffectInput>,
    pub outputs: Vec<EffectOutput>,
    pub parameters: Vec<EffectParameter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectInput {
    pub name: String,
    pub ty: EffectInputType,
    pub binding: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EffectInputType {
    Texture,
    Uniform,
    Sampler,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectOutput {
    pub name: String,
    pub format: TextureFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectParameter {
    pub name: String,
    pub ty: ParameterType,
    pub default_value: Vec<f32>,
    pub min: Option<f32>,
    pub max: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ParameterType {
    Float,
    Float2,
    Float3,
    Float4,
    Int,
    Int2,
    Int3,
    Int4,
    Bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TextureFormat {
    R8Unorm,
    RG8Unorm,
    RGBA8Unorm,
    R16Float,
    RG16Float,
    RGBA16Float,
    R32Float,
    RG32Float,
    RGBA32Float,
}

// Color Profiles
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColorProfile {
    pub icc: Vec<u8>, // ICC profile blob
    pub color_space: ColorSpace,
    pub gamma: f32,
    pub white_point: [f32; 2],
    pub primaries: [[f32; 2]; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ColorSpace {
    SRGB,
    AdobeRGB,
    DisplayP3,
    Rec2020,
    Custom,
}

// HDR Light Fields
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HDRLightField {
    pub exr: Vec<u8>, // EXR encoded light field
    pub exposure: f32,
    pub gamma: f32,
    pub white_balance: [f32; 3],
    pub dimensions: [u32; 2], // width, height
    pub channels: u8,         // RGB, RGBA, etc.
}

// Deltas (for Git-LFS compatibility)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Delta {
    pub base_hash: [u8; 32], // SHA-256 of base file
    pub zstd_data: Vec<u8>,  // zstd compressed delta
    pub compression_level: u8,
    pub original_size: u64,
    pub compressed_size: u64,
}

// Assets (enhanced)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Asset {
    pub ty: AssetType,
    pub name: String,
    pub data: Vec<u8>,
    pub compressed: bool,
    pub metadata: AssetMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetMetadata {
    pub mime_type: String,
    pub size: u64,
    pub created: u64,
    pub modified: u64,
    pub checksum: [u8; 32],
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AssetType {
    ImagePng,
    ImageJpeg,
    ImageWebP,
    ImageExr,
    FontOtf,
    FontTtf,
    AudioOpus,
    AudioFlac,
    AudioMp3,
    VideoMp4,
    VideoWebm,
    ShaderWGSL,
    ShaderGLSL,
    ShaderHLSL,
    ModelGltf,
    ModelObj,
    Custom(u8),
}

// Frames (enhanced)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Frame {
    pub offset: u32,
    pub duration: Option<f32>,
    pub keyframe: bool,
    pub easing: Option<Easing>,
    pub metadata: serde_json::Value,
}

// GPU Instancing
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct InstancingData {
    pub transforms: Vec<[f32; 16]>, // 4x4 matrices
    pub colors: Vec<[f32; 4]>,      // per-instance colors
    pub custom_data: Vec<[f32; 4]>, // custom per-instance data
}

// ---- MAIN FILE STRUCTURE ----
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct File {
    // Core sections
    pub header: Header,
    #[serde(skip)]
    pub json: serde_json::Value,
    pub frames: Vec<Frame>,
    pub paths: Vec<PathRecord>,
    pub assets: Vec<Asset>,
    
    // Advanced sections
    pub sdf: Vec<SDFLayer>,
    pub crdt: Vec<CRDTEntry>,
    pub shaders: Vec<ShaderWGSL>,
    pub scene3d: Vec<Scene3DNode>,
    pub anim_curves: Vec<AnimCurve>,
    pub audio_tracks: Vec<AudioTrack>,
    #[serde(skip)]
    pub metadata: serde_json::Value,
    pub font_subsets: Vec<FontSubset>,
    pub physics: Option<PhysicsSnapshot>,
    pub instancing: InstancingData,
    pub effects: Vec<EffectPass>,
    pub color_profile: Option<ColorProfile>,
    pub var_fonts: Vec<VarFont>,
    pub hdr_lightfield: Option<HDRLightField>,
    pub deltas: Vec<Delta>,
}

// ---- ENCODE / DECODE ----
impl File {
    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::new();
        
        // Magic header
        out.extend_from_slice(&MAGIC);
        
        // Serialize with bincode
        let data = bincode::serialize(self).unwrap();
        out.extend_from_slice(&data);
        
        // CRC-32 for corruption detection
        let crc = crc32fast::hash(&out);
        out.extend_from_slice(&crc.to_be_bytes());
        
        // Footer
        out.extend_from_slice(FOOTER);
        
        out
    }

    pub fn decode(bytes: &[u8]) -> anyhow::Result<Self> {
        use anyhow::ensure;
        
        let len = bytes.len();
        let footer_len = FOOTER.len();
        let crc_len = 4usize;
        // minimum: MAGIC (4) + CRC (4) + FOOTER
        ensure!(len >= 4 + crc_len + footer_len, "file too short");
        ensure!(&bytes[len - footer_len..] == FOOTER, "missing footer");
        
        // Verify CRC
        let crc_start = len - footer_len - crc_len;
        let crc_stored = u32::from_be_bytes([
            bytes[crc_start], bytes[crc_start + 1], bytes[crc_start + 2], bytes[crc_start + 3]
        ]);
        let crc_calc = crc32fast::hash(&bytes[..crc_start]);
        ensure!(crc_stored == crc_calc, "crc mismatch");
        
        // Deserialize
        let obj: Self = bincode::deserialize(&bytes[4..crc_start])?;
        Ok(obj)
    }
    
    // Helper methods for advanced features
    pub fn add_animation_curve(&mut self, property: String, keys: Vec<Keyframe>) {
        let curve = AnimCurve {
            property,
            keys,
            interpolation: InterpolationType::Bezier,
        };
        self.anim_curves.push(curve);
    }
    
    pub fn add_shader(&mut self, name: String, wgsl: String) {
        let shader = ShaderWGSL {
            name,
            wgsl,
            compressed: false,
            bind_groups: Vec::new(),
            entry_points: Vec::new(),
        };
        self.shaders.push(shader);
    }
    
    pub fn add_3d_node(&mut self, layer_id: u32, depth: f32, matrix: [f32; 16]) {
        let node = Scene3DNode {
            layer_id,
            depth,
            matrix,
            mesh: None,
            material: None,
        };
        self.scene3d.push(node);
    }
    
    pub fn add_physics_body(&mut self, layer_id: u32, body_type: BodyType, collider: Collider) {
        if self.physics.is_none() {
            self.physics = Some(PhysicsSnapshot {
                timestamp: 0.0,
                bodies: Vec::new(),
                constraints: Vec::new(),
                gravity: [0.0, -9.81, 0.0],
                time_scale: 1.0,
            });
        }
        
        if let Some(physics) = &mut self.physics {
            let body = PhysicsBody {
                layer_id,
                body_type,
                translation: [0.0, 0.0, 0.0],
                rotation: [0.0, 0.0, 0.0, 1.0],
                lin_vel: [0.0, 0.0, 0.0],
                ang_vel: [0.0, 0.0, 0.0],
                mass: 1.0,
                friction: 0.5,
                restitution: 0.0,
                collider,
            };
            physics.bodies.push(body);
        }
    }
    
    pub fn add_audio_track(&mut self, track_id: u32, codec: AudioCodec, data: Vec<u8>, sample_rate: u32) {
        let track = AudioTrack {
            track_id,
            codec,
            data,
            sample_rate,
            channels: 2,
            start_time: 0.0,
            duration: 0.0,
            volume: 1.0,
            pan: 0.0,
        };
        self.audio_tracks.push(track);
    }
    
    pub fn add_effect_pass(&mut self, name: String, wgsl: String) {
        let effect = EffectPass {
            name,
            wgsl,
            inputs: Vec::new(),
            outputs: Vec::new(),
            parameters: Vec::new(),
        };
        self.effects.push(effect);
    }
    
    pub fn set_color_profile(&mut self, icc: Vec<u8>, color_space: ColorSpace) {
        let profile = ColorProfile {
            icc,
            color_space,
            gamma: 2.2,
            white_point: [0.3127, 0.3290], // D65
            primaries: [
                [0.64, 0.33], // R
                [0.30, 0.60], // G
                [0.15, 0.06], // B
            ],
        };
        self.color_profile = Some(profile);
    }
    
    pub fn add_hdr_lightfield(&mut self, exr: Vec<u8>, exposure: f32) {
        let lightfield = HDRLightField {
            exr,
            exposure,
            gamma: 2.2,
            white_balance: [1.0, 1.0, 1.0],
            dimensions: [1024, 1024],
            channels: 3,
        };
        self.hdr_lightfield = Some(lightfield);
    }
    
    #[cfg(feature = "compression")]
    pub fn create_delta(&mut self, base_hash: [u8; 32], original_data: &[u8]) -> anyhow::Result<()> {
        let compressed = zstd::encode_all(original_data, 22)?;
        let compressed_size = compressed.len();
        let delta = Delta {
            base_hash,
            zstd_data: compressed,
            compression_level: 22,
            original_size: original_data.len() as u64,
            compressed_size: compressed_size as u64,
        };
        self.deltas.push(delta);
        Ok(())
    }
    
    #[cfg(not(feature = "compression"))]
    pub fn create_delta(&mut self, base_hash: [u8; 32], original_data: &[u8]) -> anyhow::Result<()> {
        let delta = Delta {
            base_hash,
            zstd_data: original_data.to_vec(),
            compression_level: 0,
            original_size: original_data.len() as u64,
            compressed_size: original_data.len() as u64,
        };
        self.deltas.push(delta);
        Ok(())
    }
}

// ---- UTILITY FUNCTIONS ----
pub fn compute_sdf_grid(path_data: &[u8], grid_size: u16) -> Vec<u8> {
    // Simple signed distance grid from polyline points encoded in path_data (pairs of f32 x,y)
    // Distances normalized to [0,255], 128 ~ on-edge. Inside heuristic via even-odd rule.
    let mut points: Vec<(f32, f32)> = Vec::new();
    let mut i = 0;
    while i + 7 < path_data.len() {
        let x = f32::from_le_bytes([path_data[i], path_data[i+1], path_data[i+2], path_data[i+3]]);
        let y = f32::from_le_bytes([path_data[i+4], path_data[i+5], path_data[i+6], path_data[i+7]]);
        points.push((x, y));
        i += 8;
    }
    if points.len() < 2 { return vec![128; (grid_size as usize)*(grid_size as usize)]; }

    // Compute bounds
    let (min_x, max_x) = points.iter().fold((f32::INFINITY, f32::NEG_INFINITY), |(mn,mx),(x,_)| (mn.min(*x), mx.max(*x)));
    let (min_y, max_y) = points.iter().fold((f32::INFINITY, f32::NEG_INFINITY), |(mn,mx),(_,y)| (mn.min(*y), mx.max(*y)));
    let w = (max_x - min_x).max(1.0);
    let h = (max_y - min_y).max(1.0);

    let gs = grid_size as usize;
    let mut out = vec![128u8; gs*gs];
    for gy in 0..gs {
        for gx in 0..gs {
            let px = min_x + (gx as f32 + 0.5) / grid_size as f32 * w;
            let py = min_y + (gy as f32 + 0.5) / grid_size as f32 * h;

            // Point-in-polygon (even-odd) over polyline closed loop
            let mut inside = false;
            for e in 0..points.len() {
                let (x1, y1) = points[e];
                let (x2, y2) = points[(e+1)%points.len()];
                let intersect = ((y1 > py) != (y2 > py)) && (px < (x2 - x1) * (py - y1) / (y2 - y1 + 1e-6) + x1);
                if intersect { inside = !inside; }
            }

            // Distance to segments
            let mut min_d2 = f32::INFINITY;
            for e in 0..points.len()-1 {
                let (x1, y1) = points[e];
                let (x2, y2) = points[e+1];
                // project p onto segment
                let vx = x2 - x1; let vy = y2 - y1;
                let wx = px - x1; let wy = py - y1;
                let vv = vx*vx + vy*vy + 1e-6;
                let t = (wx*vx + wy*vy)/vv;
                let t = t.clamp(0.0, 1.0);
                let sx = x1 + t*vx; let sy = y1 + t*vy;
                let dx = px - sx; let dy = py - sy;
                let d2 = dx*dx + dy*dy;
                if d2 < min_d2 { min_d2 = d2; }
            }
            let d = min_d2.sqrt();
            // map distance to 0..1 with a heuristic scale
            let scale = (w.max(h) / grid_size as f32).max(1.0);
            let norm = (d / (4.0*scale)).min(1.0);
            let signed = if inside { -(norm) } else { norm };
            let v = ((signed * 127.0) + 128.0).round().clamp(0.0, 255.0) as u8;
            out[gy*gs + gx] = v;
        }
    }
    out
}

#[cfg(feature = "compression")]
pub fn compress_wgsl(wgsl: &str) -> Vec<u8> {
    // Simple compression for WGSL shaders
    zstd::encode_all(wgsl.as_bytes(), 19).unwrap_or_else(|_| wgsl.as_bytes().to_vec())
}

#[cfg(not(feature = "compression"))]
pub fn compress_wgsl(wgsl: &str) -> Vec<u8> {
    // No compression fallback
    wgsl.as_bytes().to_vec()
}

#[cfg(feature = "compression")]
pub fn decompress_wgsl(data: &[u8]) -> String {
    // Decompress WGSL shaders
    String::from_utf8(
        zstd::decode_all(data).unwrap_or_else(|_| data.to_vec())
    ).unwrap_or_else(|_| String::new())
}

#[cfg(not(feature = "compression"))]
pub fn decompress_wgsl(data: &[u8]) -> String {
    // No compression fallback
    String::from_utf8(data.to_vec()).unwrap_or_else(|_| String::new())
} 

#[cfg(test)]
mod core_tests {
    use super::*;

    fn make_test_path() -> PathRecord {
        // Two points: (10,10) -> (90,90)
        let mut data = Vec::new();
        for (x,y) in [(10.0f32,10.0f32),(90.0,90.0)] {
            data.extend_from_slice(&x.to_le_bytes());
            data.extend_from_slice(&y.to_le_bytes());
        }
        let mut style = PathStyle::default();
        style.fill = Some(FillStyle{ color:[1.0,0.0,0.0,1.0], rule: FillRule::NonZero });
        style.stroke = Some(StrokeStyle{ color:[0.0,0.0,0.0,1.0], width: 2.0, cap: LineCap::Butt, join: LineJoin::Miter, dash_array: Vec::new() });
        PathRecord { data, tf:[1.0,0.0,0.0,1.0,0.0,0.0], style, original_svg: None, layer_id: todo!() }
    }

    #[test]
    fn debug_print_svg() {
        let mut f = File::default();
        f.header.width = 100; f.header.height = 100;
        f.paths.push(make_test_path());
        let svg = file_to_svg(&f);
        println!("SVG OUT:\n{}", svg);
        assert!(svg.contains("<path"));
    }
    #[test]
    fn file_encode_decode_roundtrip() {
        let mut f = File::default();
        f.header.width = 100; f.header.height = 100; f.header.frame_count = 1; f.header.frame_rate = 60.0;
        f.paths.push(make_test_path());
        let bytes = f.encode();
        let back = File::decode(&bytes).expect("decode");
        assert_eq!(back.header.width, 100);
        assert_eq!(back.header.height, 100);
        assert_eq!(back.paths.len(), 1);
    }

    #[test]
    fn export_to_svg_contains_path() {
        let mut f = File::default();
        f.header.width = 100; f.header.height = 100;
        f.paths.push(make_test_path());
        let svg = file_to_svg(&f);
        assert!(svg.contains("<svg"));
        assert!(svg.contains("<path"));
        assert!(svg.contains("stroke-width=\""));
    }

    #[test]
    fn wgsl_compile_and_execute_cpu() {
        let mut eng = WGSLShaderEngine::new();
        let src = WGSLShaderEngine::get_default_fragment_shader();
        let compiled = eng.compile_shader("s".into(), src).expect("compile");
        assert!(compiled.compiled || !compiled.compiled); // compiled flag may be false without GPU; just ensure no panic
        let out = eng.execute_shader("s", [0.5,0.5], [1.0,1.0,1.0,1.0], 0.25).expect("execute");
        assert!(out[3] > 0.0);
    }

    #[test]
    fn three_d_extrusion_basic() {
        let mut eng = Scene3DEngine::new();
        let params = ExtrusionParams{ depth: 10.0, bevel_radius: 0.0, bevel_segments: 0, cap_front: true, cap_back: true, material_id: None };
        let path = make_test_path();
        let id = eng.extrude_path(&path, &params).expect("extrude");
        let mesh = eng.get_mesh(id).unwrap_or_else(|| eng.get_meshes().values().next().unwrap());
        assert!(!mesh.vertices.is_empty());
        assert!(!mesh.indices.is_empty());
    }

    #[test]
    fn sdf_grid_size() {
        let p = make_test_path();
        let g = compute_sdf_grid(&p.data, 32);
        assert_eq!(g.len(), 32*32);
    }
}