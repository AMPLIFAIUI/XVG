use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::error::Error;
use xvg_core::{File, PathRecord, PathStyle as CorePathStyle, BlendMode, SDFEngine, WGSLShaderEngine, CRDTEngine, Scene3DEngine, UniformValue};
use xvg_core::crdt::{CRDTOperation, CRDOpType};
use eframe::egui::Pos2;
use usvg::{Tree, Options, TreeParsing, NodeExt};
use tiny_skia_path;
use tiny_skia_path::PathSegment;
use image::GenericImageView;
use kurbo::ParamCurve;
// For raster fallback via resvg (gradients/patterns/clip/mask)
// resvg used by UI for raster fallback

// --- Configuration ---
#[derive(Debug, Clone)]
pub struct EngineConfig {
    pub auto_save_interval: Option<Duration>,
    pub physics_timestep: f32,
    pub max_undo_steps: usize,
    pub enable_async_operations: bool,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            auto_save_interval: Some(Duration::from_secs(300)), // 5 minutes
            physics_timestep: 1.0 / 60.0, // 60 FPS
            max_undo_steps: 100,
            enable_async_operations: true,
        }
    }
}

// --- Memory Usage Tracking ---
#[derive(Debug, Clone)]
pub struct MemoryUsage {
    pub file_size: usize,
    pub paths_count: usize,
    pub physics_bodies_count: usize,
    pub audio_tracks_count: usize,
    pub total_memory: usize,
}

// --- Comprehensive Error Type ---
#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("I/O Error: {0}")]
    Io(#[from] std::io::Error),
    #[error("No file loaded")]
    NoFileLoaded,
    #[error("Invalid path ID: {0}")]
    InvalidPathId(usize),
    #[error("Unsupported format: {0}")]
    UnsupportedFormat(String),
    #[error("Decode error: {0}")]
    DecodeError(String),
    #[error("Encode error: {0}")]
    EncodeError(String),
    #[error("Failed to {operation} file {path}: {source}")]
    FileOperation { 
        operation: String, 
        path: String, 
        source: Box<dyn Error + Send + Sync> 
    },
    #[error("Validation error: {0}")]
    ValidationError(String),
    #[error("Resource error: {0}")]
    ResourceError(String),
    #[error("Async operation failed: {0}")]
    AsyncError(String),
}

// --- Event System ---
#[derive(Debug, Clone)]
pub enum EngineEvent {
    FileLoaded(FileInfo),
    FileSaved(PathBuf),
    PathCreated(usize),
    PathDeleted(usize),
    PathUpdated(usize),
    PhysicsUpdated(Vec<PhysicsBodyData>),
    AudioStarted(usize),
    AudioStopped,
    CollaborationEnabled,
    CollaborationDisabled,
    Error(String), // Store error message instead of EngineError
}

pub trait EngineEventHandler: Send + Sync {
    fn on_event(&self, event: EngineEvent);
}

// --- Complete Data Types ---
#[derive(Debug, Clone)]
pub struct PathData {
    pub id: usize,
    pub points: Vec<Pos2>,
    pub style: PathStyle,
    pub original_svg: Option<String>, // Store original SVG path data for proper rendering
    // When this path is a raster image layer (PNG/JPEG), embed the pixel data
    pub image_rgba: Option<std::sync::Arc<Vec<u8>>>, // RGBA8 pixel data, row-major (shared)
    pub image_size: Option<(u32, u32)>, // (width, height)
}

#[derive(Debug, Clone)]
pub struct PathStyle {
    pub fill: Option<FillStyle>,
    pub stroke: Option<StrokeStyle>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

// Use xvg_core types directly
pub type FillStyle = xvg_core::FillStyle;
pub type StrokeStyle = xvg_core::StrokeStyle;

#[derive(Debug, Clone)]
pub struct PhysicsBodyData {
    pub id: usize,
    pub translation: [f32; 3],
    pub rotation: [f32; 4],
    pub lin_vel: [f32; 3],
    pub ang_vel: [f32; 3],
    pub mass: f32,
    pub friction: f32,
    pub restitution: f32,
}

#[derive(Debug, Clone)]
pub struct AudioTrackData {
    pub id: usize,
    pub codec: String,
    pub sample_rate: u32,
    pub channels: u8,
    pub start_time: f32,
    pub duration: f32,
    pub volume: f32,
    pub pan: f32,
}

#[derive(Debug, Clone)]
pub struct CollaborationStatus {
    pub enabled: bool,
    pub connected_users: Vec<String>,
    pub lamport_clock: u64,
    pub pending_operations: usize,
}

#[derive(Debug, Clone)]
pub struct FileInfo {
    pub path: Option<PathBuf>,
    pub path_count: usize,
    pub audio_track_count: usize,
    pub has_physics: bool,
    pub has_collaboration: bool,
    pub dimensions: (u16, u16),
    pub frame_count: u32,
    pub frame_rate: f32,
}

// --- The Comprehensive Engine Trait ---
#[async_trait::async_trait]
pub trait XvgEngine: Send + Sync {
    // --- Configuration ---
    fn configure(&mut self, config: EngineConfig) -> Result<(), EngineError>;
    fn get_config(&self) -> EngineConfig;
    
    // --- Event System ---
    fn set_event_handler(&mut self, handler: Arc<dyn EngineEventHandler>);
    fn remove_event_handler(&mut self);
    
    // --- File operations ---
    async fn load_file(&mut self, path: &Path) -> Result<(), EngineError>;
    async fn save_file(&mut self, path: &Path) -> Result<(), EngineError>;
    fn new_file(&mut self) -> Result<(), EngineError>;
    fn is_dirty(&self) -> bool;
    fn mark_clean(&mut self);
    
    // --- Path/Vector operations ---
    fn create_path(&mut self, points: &[Pos2], style: PathStyle) -> Result<usize, EngineError>;
    fn create_paths(&mut self, paths: Vec<(Vec<Pos2>, PathStyle)>) -> Result<Vec<usize>, EngineError>;
    fn get_paths(&self) -> Vec<PathData>;
    fn update_path(&mut self, id: usize, points: &[Pos2], style: PathStyle) -> Result<(), EngineError>;
    fn delete_path(&mut self, id: usize) -> Result<(), EngineError>;
    fn delete_paths(&mut self, ids: &[usize]) -> Result<(), EngineError>;
    
    // --- Validation ---
    fn validate_path_points(&self, points: &[Pos2]) -> Result<(), EngineError>;
    fn validate_physics_body(&self, body: &PhysicsBodyData) -> Result<(), EngineError>;
    fn validate_path_style(&self, style: &PathStyle) -> Result<(), EngineError>;
    
    // --- Animation operations ---
    fn play_animation(&mut self) -> Result<(), EngineError>;
    fn pause_animation(&mut self) -> Result<(), EngineError>;
    fn set_animation_time(&mut self, t: f32) -> Result<(), EngineError>;
    fn get_animation_time(&self) -> f32;
    fn is_animation_playing(&self) -> bool;
    
    // --- Physics operations ---
    async fn start_physics(&mut self) -> Result<(), EngineError>;
    async fn stop_physics(&mut self) -> Result<(), EngineError>;
    fn reset_physics(&mut self) -> Result<(), EngineError>;
    async fn update_physics(&mut self, delta_time: f32) -> Result<(), EngineError>;
    fn get_physics_bodies(&self) -> Vec<PhysicsBodyData>;
    fn is_physics_running(&self) -> bool;
    
    // --- Audio operations ---
    async fn play_audio(&mut self, track_id: usize) -> Result<(), EngineError>;
    async fn stop_audio(&mut self) -> Result<(), EngineError>;
    fn set_audio_volume(&mut self, volume: f32) -> Result<(), EngineError>;
    fn get_audio_tracks(&self) -> Vec<AudioTrackData>;
    fn is_audio_playing(&self) -> bool;
    
    // --- Collaboration (CRDT) operations ---
    async fn enable_collaboration(&mut self) -> Result<(), EngineError>;
    async fn disable_collaboration(&mut self) -> Result<(), EngineError>;
    async fn sync_collaboration(&mut self) -> Result<(), EngineError>;
    fn get_collaboration_status(&self) -> CollaborationStatus;
    
    // --- Advanced Features ---
    // SDF (Signed Distance Fields)
    fn generate_sdf_weights(&mut self, path_ids: &[usize]) -> Result<Vec<f32>, EngineError>;
    fn evaluate_sdf_distance(&self, x: f32, y: f32) -> f32;
    
    // WGSL Shaders
    fn compile_shader(&mut self, name: String, source: String) -> Result<(), EngineError>;
    fn execute_shader(&self, name: &str, uv: [f32; 2], color: [f32; 4], time: f32) -> Result<[f32; 4], EngineError>;
    fn bind_shader_uniform(&mut self, name: String, value: xvg_core::UniformValue) -> Result<(), EngineError>;
    
    // 3D Extrusion
    fn extrude_path_3d(&mut self, path_id: usize, depth: f32, bevel: f32) -> Result<(), EngineError>;
    fn push_3d_matrix(&mut self, matrix: [f32; 16]) -> Result<(), EngineError>;
    fn pop_3d_matrix(&mut self) -> Result<Option<[f32; 16]>, EngineError>;
    
    // CRDT Operations
    fn add_crdt_operation(&mut self, operation_type: xvg_core::CRDOpType, payload: Vec<u8>) -> Result<u64, EngineError>;
    fn merge_crdt_operations(&mut self, operations: &[CRDTOperation]) -> Result<(), EngineError>;
    
    // --- Utility ---
    fn get_file_info(&self) -> Option<FileInfo>;
    fn get_memory_usage(&self) -> MemoryUsage;
    async fn cleanup(&mut self) -> Result<(), EngineError>;
    
    // --- Undo/Redo ---
    fn can_undo(&self) -> bool;
    fn can_redo(&self) -> bool;
    fn undo(&mut self) -> Result<(), EngineError>;
    fn redo(&mut self) -> Result<(), EngineError>;
}

// --- Implementation using xvg-core ---
#[derive(Clone)]
pub struct XvgCoreEngine {
    file: Option<Arc<Mutex<File>>>,
    file_path: Option<PathBuf>,
    is_dirty: bool,
    config: EngineConfig,
    event_handler: Option<Arc<dyn EngineEventHandler>>,
    physics_running: bool,
    audio_playing: bool,
    collaboration_enabled: bool,
    animation_playing: bool,
    animation_time: f32,
    undo_stack: Vec<File>,
    redo_stack: Vec<File>,
    last_save: Option<Instant>,
    
    // Advanced feature engines
    sdf_engine: SDFEngine,
    shader_engine: WGSLShaderEngine,
    crdt_engine: CRDTEngine,
    scene3d_engine: Scene3DEngine,
}

impl XvgCoreEngine {
    pub fn new() -> Self {
        Self {
            file: None,
            file_path: None,
            is_dirty: false,
            config: EngineConfig::default(),
            event_handler: None,
            physics_running: false,
            audio_playing: false,
            collaboration_enabled: false,
            animation_playing: false,
            animation_time: 0.0,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            last_save: None,
            
            // Initialize advanced feature engines
            sdf_engine: SDFEngine::new(), // Default SDF engine
            shader_engine: WGSLShaderEngine::new(),
            crdt_engine: CRDTEngine::new(1), // Default author ID
            scene3d_engine: Scene3DEngine::new(),
        }
    }
    
    fn emit_event(&self, event: EngineEvent) {
        if let Some(handler) = &self.event_handler {
            handler.on_event(event);
        }
    }
    
    fn save_undo_state(&mut self) {
        if let Some(file_arc) = &self.file {
            if let Ok(file) = file_arc.lock() {
                if self.undo_stack.len() >= self.config.max_undo_steps {
                    self.undo_stack.remove(0);
                }
                self.undo_stack.push(file.clone());
                self.redo_stack.clear();
            }
        }
    }
}

#[async_trait::async_trait]
impl XvgEngine for XvgCoreEngine {
    fn configure(&mut self, config: EngineConfig) -> Result<(), EngineError> {
        self.config = config;
        Ok(())
    }
    
    fn get_config(&self) -> EngineConfig {
        self.config.clone()
    }
    
    fn set_event_handler(&mut self, handler: Arc<dyn EngineEventHandler>) {
        self.event_handler = Some(handler);
    }
    
    fn remove_event_handler(&mut self) {
        self.event_handler = None;
    }
    
    async fn load_file(&mut self, path: &Path) -> Result<(), EngineError> {
        let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        
        let file = match extension.to_lowercase().as_str() {
            "xvg" => {
                let data = tokio::fs::read(path).await
                    .map_err(|e| EngineError::FileOperation {
                        operation: "read".to_string(),
                        path: path.to_string_lossy().to_string(),
                        source: Box::new(e),
                    })?;
                File::decode(&data).map_err(|e| EngineError::DecodeError(e.to_string()))?
            }
            "svg" => {
                self.convert_svg_to_xvg(path).await?
            }
            "png" | "jpg" | "jpeg" => {
                self.convert_image_to_xvg(path).await?
            }
            _ => return Err(EngineError::UnsupportedFormat(extension.to_string())),
        };
        
        self.file = Some(Arc::new(Mutex::new(file)));
        self.file_path = Some(path.to_path_buf());
        self.is_dirty = false;
        self.last_save = Some(Instant::now());
        
        if let Some(file_info) = self.get_file_info() {
            self.emit_event(EngineEvent::FileLoaded(file_info));
        }
        
        Ok(())
    }
    
    async fn save_file(&mut self, path: &Path) -> Result<(), EngineError> {
        let data = {
            let file_arc = self.file.as_ref().ok_or(EngineError::NoFileLoaded)?;
            let file = file_arc.lock().unwrap();
            file.encode()
        };
        
        tokio::fs::write(path, data).await
            .map_err(|e| EngineError::FileOperation {
                operation: "write".to_string(),
                path: path.to_string_lossy().to_string(),
                source: Box::new(e),
            })?;
        
        self.file_path = Some(path.to_path_buf());
        self.is_dirty = false;
        self.last_save = Some(Instant::now());
        
        self.emit_event(EngineEvent::FileSaved(path.to_path_buf()));
        
        Ok(())
    }
    
    fn new_file(&mut self) -> Result<(), EngineError> {
        self.file = Some(Arc::new(Mutex::new(File::default())));
        self.file_path = None;
        self.is_dirty = false;
        self.last_save = Some(Instant::now());
        Ok(())
    }
    
    fn is_dirty(&self) -> bool {
        self.is_dirty
    }
    
    fn mark_clean(&mut self) {
        self.is_dirty = false;
    }
    
    fn create_path(&mut self, points: &[Pos2], style: PathStyle) -> Result<usize, EngineError> {
        self.validate_path_points(points)?;
        self.validate_path_style(&style)?;
        
        let file_arc = self.file.as_mut().ok_or(EngineError::NoFileLoaded)?;
        let path_id = {
            let mut file = file_arc.lock().unwrap();
            
            // Convert points to binary data
            let mut data = Vec::new();
            for point in points {
                data.extend_from_slice(&point.x.to_le_bytes());
                data.extend_from_slice(&point.y.to_le_bytes());
            }
            
            // Convert PathStyle to CorePathStyle
            let core_style = CorePathStyle {
                fill: style.fill.map(|f| xvg_core::FillStyle {
                    color: f.color,
                    rule: f.rule,
                }),
                stroke: style.stroke.map(|s| xvg_core::StrokeStyle {
                    color: s.color,
                    width: s.width,
                    cap: s.cap,
                    join: s.join,
                    dash_array: s.dash_array,
                }),
                opacity: style.opacity,
                blend_mode: style.blend_mode,
            };
            
            let path_record = PathRecord {
                data,
                tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0], // Identity transform
                style: core_style,
                original_svg: None,
            };
            
            let path_id = file.paths.len();
            file.paths.push(path_record);
            path_id
        };
        
        self.is_dirty = true;
        self.save_undo_state();
        self.emit_event(EngineEvent::PathCreated(path_id));
        
        Ok(path_id)
    }
    
    fn create_paths(&mut self, paths: Vec<(Vec<Pos2>, PathStyle)>) -> Result<Vec<usize>, EngineError> {
        let mut ids = Vec::new();
        for (points, style) in paths {
            let id = self.create_path(&points, style)?;
            ids.push(id);
        }
        Ok(ids)
    }
    
    fn get_paths(&self) -> Vec<PathData> {
        if let Some(file_arc) = &self.file {
            let file = file_arc.lock().unwrap();
            let mut out: Vec<PathData> = file
                .paths
                .iter()
                .enumerate()
                .map(|(id, path)| PathData {
                    id,
                    points: self.points_from_path(path),
                    style: self.convert_core_style(&path.style),
                    original_svg: path.original_svg.clone(),
                    image_rgba: None,
                    image_size: None,
                })
                .collect();

            // Append raster assets as synthetic paths so the UI can render/select them
            for (asset_index, asset) in file.assets.iter().enumerate() {
                let is_image = matches!(
                    asset.ty,
                    xvg_core::AssetType::ImagePng
                        | xvg_core::AssetType::ImageJpeg
                        | xvg_core::AssetType::ImageWebP
                );
                if !is_image {
                    continue;
                }

                if let Ok(img_dyn) = image::load_from_memory(&asset.data) {
                    let rgba = img_dyn.to_rgba8();
                    let (w, h) = img_dyn.dimensions();
                    // Provide world-space rectangle points at (0,0)-(w,h) so selection works
                    let points = vec![
                        Pos2::new(0.0, 0.0),
                        Pos2::new(w as f32, 0.0),
                        Pos2::new(w as f32, h as f32),
                        Pos2::new(0.0, h as f32),
                        Pos2::new(0.0, 0.0),
                    ];
                    out.push(PathData {
                        id: file.paths.len() + asset_index,
                        points,
                        style: PathStyle { fill: None, stroke: None, opacity: 1.0, blend_mode: xvg_core::BlendMode::Normal },
                        original_svg: None,
                        image_rgba: Some(std::sync::Arc::new(rgba.to_vec())),
                        image_size: Some((w, h)),
                    });
                }
            }

            out
        } else {
            Vec::new()
        }
    }
    
    fn update_path(&mut self, id: usize, points: &[Pos2], style: PathStyle) -> Result<(), EngineError> {
        self.validate_path_points(points)?;
        self.validate_path_style(&style)?;
        
        let file_arc = self.file.as_mut().ok_or(EngineError::NoFileLoaded)?;
        {
            let mut file = file_arc.lock().unwrap();
            
            if id < file.paths.len() {
                // Convert points to binary data
                let mut data = Vec::new();
                for point in points {
                    data.extend_from_slice(&point.x.to_le_bytes());
                    data.extend_from_slice(&point.y.to_le_bytes());
                }
                
                // Convert PathStyle to CorePathStyle
                let core_style = CorePathStyle {
                    fill: style.fill.map(|f| xvg_core::FillStyle {
                        color: f.color,
                        rule: f.rule,
                    }),
                    stroke: style.stroke.map(|s| xvg_core::StrokeStyle {
                        color: s.color,
                        width: s.width,
                        cap: s.cap,
                        join: s.join,
                        dash_array: s.dash_array,
                    }),
                    opacity: style.opacity,
                    blend_mode: style.blend_mode,
                };
                
                file.paths[id] = PathRecord { data, tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0], style: core_style, original_svg: None };
            } else {
                return Err(EngineError::InvalidPathId(id));
            }
        }
        
        self.is_dirty = true;
        self.save_undo_state();
        self.emit_event(EngineEvent::PathUpdated(id));
        
        Ok(())
    }
    
    fn delete_path(&mut self, id: usize) -> Result<(), EngineError> {
        let file_arc = self.file.as_mut().ok_or(EngineError::NoFileLoaded)?;
        {
            let mut file = file_arc.lock().unwrap();
            
            if id < file.paths.len() {
                file.paths.remove(id);
            } else {
                return Err(EngineError::InvalidPathId(id));
            }
        }
        
        self.is_dirty = true;
        self.save_undo_state();
        self.emit_event(EngineEvent::PathDeleted(id));
        
        Ok(())
    }
    
    fn delete_paths(&mut self, ids: &[usize]) -> Result<(), EngineError> {
        let mut sorted_ids: Vec<usize> = ids.to_vec();
        sorted_ids.sort_unstable_by(|a, b| b.cmp(a)); // Sort in descending order
        
        for &id in &sorted_ids {
            self.delete_path(id)?;
        }
        Ok(())
    }
    
    fn validate_path_points(&self, points: &[Pos2]) -> Result<(), EngineError> {
        if points.is_empty() {
            return Err(EngineError::ValidationError("Path must have at least one point".to_string()));
        }
        
        for point in points {
            if point.x.is_nan() || point.y.is_nan() || point.x.is_infinite() || point.y.is_infinite() {
                return Err(EngineError::ValidationError("Invalid point coordinates".to_string()));
            }
        }
        
        Ok(())
    }
    
    fn validate_physics_body(&self, body: &PhysicsBodyData) -> Result<(), EngineError> {
        if body.mass < 0.0 {
            return Err(EngineError::ValidationError("Physics body mass cannot be negative".to_string()));
        }
        
        if body.friction < 0.0 || body.friction > 1.0 {
            return Err(EngineError::ValidationError("Friction must be between 0.0 and 1.0".to_string()));
        }
        
        if body.restitution < 0.0 || body.restitution > 1.0 {
            return Err(EngineError::ValidationError("Restitution must be between 0.0 and 1.0".to_string()));
        }
        
        Ok(())
    }
    
    fn validate_path_style(&self, style: &PathStyle) -> Result<(), EngineError> {
        if style.opacity < 0.0 || style.opacity > 1.0 {
            return Err(EngineError::ValidationError("Opacity must be between 0.0 and 1.0".to_string()));
        }
        
        if let Some(stroke) = &style.stroke {
            if stroke.width < 0.0 {
                return Err(EngineError::ValidationError("Stroke width cannot be negative".to_string()));
            }
        }
        
        Ok(())
    }
    
    fn play_animation(&mut self) -> Result<(), EngineError> {
        self.animation_playing = true;
        Ok(())
    }
    
    fn pause_animation(&mut self) -> Result<(), EngineError> {
        self.animation_playing = false;
        Ok(())
    }
    
    fn set_animation_time(&mut self, t: f32) -> Result<(), EngineError> {
        if t < 0.0 {
            return Err(EngineError::ValidationError("Animation time cannot be negative".to_string()));
        }
        self.animation_time = t;
        Ok(())
    }
    
    fn get_animation_time(&self) -> f32 {
        self.animation_time
    }
    
    fn is_animation_playing(&self) -> bool {
        self.animation_playing
    }
    
    async fn start_physics(&mut self) -> Result<(), EngineError> {
        self.physics_running = true;
        Ok(())
    }
    
    async fn stop_physics(&mut self) -> Result<(), EngineError> {
        self.physics_running = false;
        Ok(())
    }
    
    fn reset_physics(&mut self) -> Result<(), EngineError> {
        if let Some(file_arc) = &self.file {
            let mut file = file_arc.lock().unwrap();
            if let Some(physics) = &mut file.physics {
                for body in &mut physics.bodies {
                    body.lin_vel = [0.0, 0.0, 0.0];
                    body.ang_vel = [0.0, 0.0, 0.0];
                }
            }
        }
        self.physics_running = false;
        Ok(())
    }
    
    async fn update_physics(&mut self, delta_time: f32) -> Result<(), EngineError> {
        if !self.physics_running {
            return Ok(());
        }
        
        // Simple physics simulation
        if let Some(file_arc) = &self.file {
            let mut file = file_arc.lock().unwrap();
            if let Some(physics) = &mut file.physics {
                for body in &mut physics.bodies {
                    // Apply gravity
                    body.lin_vel[1] -= 9.81 * delta_time;
                    
                    // Update position
                    body.translation[0] += body.lin_vel[0] * delta_time;
                    body.translation[1] += body.lin_vel[1] * delta_time;
                    body.translation[2] += body.lin_vel[2] * delta_time;
                }
                
                let bodies = physics.bodies.iter().enumerate().map(|(id, body)| {
                    PhysicsBodyData {
                        id,
                        translation: body.translation,
                        rotation: body.rotation,
                        lin_vel: body.lin_vel,
                        ang_vel: body.ang_vel,
                        mass: body.mass,
                        friction: body.friction,
                        restitution: body.restitution,
                    }
                }).collect();
                
                self.emit_event(EngineEvent::PhysicsUpdated(bodies));
            }
        }
        
        Ok(())
    }
    
    fn get_physics_bodies(&self) -> Vec<PhysicsBodyData> {
        if let Some(file_arc) = &self.file {
            let file = file_arc.lock().unwrap();
            if let Some(physics) = &file.physics {
                physics.bodies.iter().enumerate().map(|(id, body)| {
                    PhysicsBodyData {
                        id,
                        translation: body.translation,
                        rotation: body.rotation,
                        lin_vel: body.lin_vel,
                        ang_vel: body.ang_vel,
                        mass: body.mass,
                        friction: body.friction,
                        restitution: body.restitution,
                    }
                }).collect()
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        }
    }
    
    fn is_physics_running(&self) -> bool {
        self.physics_running
    }
    
    async fn play_audio(&mut self, track_id: usize) -> Result<(), EngineError> {
        self.audio_playing = true;
        self.emit_event(EngineEvent::AudioStarted(track_id));
        Ok(())
    }
    
    async fn stop_audio(&mut self) -> Result<(), EngineError> {
        self.audio_playing = false;
        self.emit_event(EngineEvent::AudioStopped);
        Ok(())
    }
    
    fn set_audio_volume(&mut self, volume: f32) -> Result<(), EngineError> {
        if volume < 0.0 || volume > 1.0 {
            return Err(EngineError::ValidationError("Volume must be between 0.0 and 1.0".to_string()));
        }
        Ok(())
    }
    
    fn get_audio_tracks(&self) -> Vec<AudioTrackData> {
        if let Some(file_arc) = &self.file {
            let file = file_arc.lock().unwrap();
            file.audio_tracks.iter().enumerate().map(|(id, track)| {
                AudioTrackData {
                    id,
                    codec: format!("{:?}", track.codec),
                    sample_rate: track.sample_rate,
                    channels: track.channels,
                    start_time: track.start_time,
                    duration: track.duration,
                    volume: track.volume,
                    pan: track.pan,
                }
            }).collect()
        } else {
            Vec::new()
        }
    }
    
    fn is_audio_playing(&self) -> bool {
        self.audio_playing
    }
    
    async fn enable_collaboration(&mut self) -> Result<(), EngineError> {
        self.collaboration_enabled = true;
        self.emit_event(EngineEvent::CollaborationEnabled);
        Ok(())
    }
    
    async fn disable_collaboration(&mut self) -> Result<(), EngineError> {
        self.collaboration_enabled = false;
        self.emit_event(EngineEvent::CollaborationDisabled);
        Ok(())
    }
    
    async fn sync_collaboration(&mut self) -> Result<(), EngineError> {
        // CRDT sync would happen here
        Ok(())
    }
    
    fn get_collaboration_status(&self) -> CollaborationStatus {
        CollaborationStatus {
            enabled: self.collaboration_enabled,
            connected_users: Vec::new(), // Would be populated from CRDT
            lamport_clock: 0, // Would be from CRDT
            pending_operations: 0,
        }
    }
    
    fn get_file_info(&self) -> Option<FileInfo> {
        if let Some(file_arc) = &self.file {
            let file = file_arc.lock().unwrap();
            Some(FileInfo {
                path: self.file_path.clone(),
                path_count: file.paths.len(),
                audio_track_count: file.audio_tracks.len(),
                has_physics: file.physics.is_some(),
                has_collaboration: !file.crdt.is_empty(),
                dimensions: (file.header.width, file.header.height),
                frame_count: file.header.frame_count,
                frame_rate: file.header.frame_rate,
            })
        } else {
            None
        }
    }
    
    fn get_memory_usage(&self) -> MemoryUsage {
        if let Some(file_arc) = &self.file {
            let file = file_arc.lock().unwrap();
            let file_size = file.paths.iter().map(|p| p.data.len()).sum::<usize>();
            MemoryUsage {
                file_size,
                paths_count: file.paths.len(),
                physics_bodies_count: file.physics.as_ref().map(|p| p.bodies.len()).unwrap_or(0),
                audio_tracks_count: file.audio_tracks.len(),
                total_memory: file_size + std::mem::size_of::<File>(),
            }
        } else {
            MemoryUsage {
                file_size: 0,
                paths_count: 0,
                physics_bodies_count: 0,
                audio_tracks_count: 0,
                total_memory: 0,
            }
        }
    }
    
    async fn cleanup(&mut self) -> Result<(), EngineError> {
        self.physics_running = false;
        self.audio_playing = false;
        self.animation_playing = false;
        self.collaboration_enabled = false;
        self.undo_stack.clear();
        self.redo_stack.clear();
        Ok(())
    }
    
    fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }
    
    fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }
    
    fn undo(&mut self) -> Result<(), EngineError> {
        if let Some(previous_state) = self.undo_stack.pop() {
            if let Some(current_file) = &self.file {
                if let Ok(mut file) = current_file.lock() {
                    let current_state = file.clone();
                    self.redo_stack.push(current_state);
                    *file = previous_state;
                    self.is_dirty = true;
                }
            }
        }
        Ok(())
    }
    
    fn redo(&mut self) -> Result<(), EngineError> {
        if let Some(next_state) = self.redo_stack.pop() {
            if let Some(current_file) = &self.file {
                if let Ok(mut file) = current_file.lock() {
                    let current_state = file.clone();
                    self.undo_stack.push(current_state);
                    *file = next_state;
                    self.is_dirty = true;
                }
            }
        }
        Ok(())
    }
    
    // --- Advanced Features Implementation ---
    
    // SDF (Signed Distance Fields)
    fn generate_sdf_weights(&mut self, path_ids: &[usize]) -> Result<Vec<f32>, EngineError> {
        if let Some(file) = &self.file {
            let file_guard = file.lock().unwrap();
            let paths: Vec<PathRecord> = path_ids.iter()
                .filter_map(|&id| file_guard.paths.get(id).cloned())
                .collect();
            
            if paths.is_empty() {
                return Err(EngineError::ValidationError("No valid paths found".to_string()));
            }
            
            drop(file_guard);
            // For now, return empty weights - in a real implementation, you'd train the SDF
            Ok(Vec::new())
        } else {
            Err(EngineError::NoFileLoaded)
        }
    }
    
    fn evaluate_sdf_distance(&self, x: f32, y: f32) -> f32 {
        self.sdf_engine.evaluate_sdf([x, y])
    }
    
    // WGSL Shaders
    fn compile_shader(&mut self, name: String, source: String) -> Result<(), EngineError> {
        self.shader_engine.compile_shader(name, source)
            .map_err(|e| EngineError::ValidationError(format!("Shader compilation failed: {}", e)))
            .map(|_| ())
    }
    
    fn execute_shader(&self, name: &str, uv: [f32; 2], color: [f32; 4], time: f32) -> Result<[f32; 4], EngineError> {
        self.shader_engine.execute_shader(name, uv, color, time)
            .map_err(|e| EngineError::ValidationError(format!("Shader execution failed: {}", e)))
    }
    
    fn bind_shader_uniform(&mut self, name: String, value: UniformValue) -> Result<(), EngineError> {
        self.shader_engine.bind_uniform(name, value);
        Ok(())
    }
    
    // 3D Extrusion
    fn extrude_path_3d(&mut self, path_id: usize, depth: f32, bevel: f32) -> Result<(), EngineError> {
        if let Some(file) = &self.file {
            let file_guard = file.lock().unwrap();
            if let Some(path) = file_guard.paths.get(path_id) {
                let path_clone = path.clone();
                drop(file_guard);
                let params = xvg_core::ExtrusionParams {
                    depth,
                    bevel_radius: bevel,
                    bevel_segments: 4,
                    cap_front: true,
                    cap_back: true,
                    material_id: None,
                };
                self.scene3d_engine.extrude_path(&path_clone, &params)
                    .map_err(|e| EngineError::ValidationError(format!("3D extrusion failed: {}", e)))
                    .map(|_| ())
            } else {
                Err(EngineError::InvalidPathId(path_id))
            }
        } else {
            Err(EngineError::NoFileLoaded)
        }
    }
    
    fn push_3d_matrix(&mut self, matrix: [f32; 16]) -> Result<(), EngineError> {
        self.scene3d_engine.push_matrix();
        self.scene3d_engine.multiply_model_matrix(matrix);
        Ok(())
    }
    
    fn pop_3d_matrix(&mut self) -> Result<Option<[f32; 16]>, EngineError> {
        Ok(self.scene3d_engine.pop_matrix())
    }
    
    // CRDT Operations
    fn add_crdt_operation(&mut self, operation_type: CRDOpType, payload: Vec<u8>) -> Result<u64, EngineError> {
        Ok(self.crdt_engine.add_operation(operation_type, payload))
    }
    
    fn merge_crdt_operations(&mut self, operations: &[CRDTOperation]) -> Result<(), EngineError> {
        self.crdt_engine.merge_operations(operations)
            .map_err(|e| EngineError::ValidationError(format!("CRDT merge failed: {}", e)))
    }
}

// --- Helper methods for XvgCoreEngine ---
impl XvgCoreEngine {
    fn points_from_path(&self, path: &PathRecord) -> Vec<Pos2> {
        let mut points = Vec::new();
        let mut i = 0;
        // Affine transform components: [a, b, c, d, e, f]
        let a = path.tf[0] as f32;
        let b = path.tf[1] as f32;
        let c = path.tf[2] as f32;
        let d = path.tf[3] as f32;
        let e = path.tf[4] as f32;
        let f = path.tf[5] as f32;

        while i + 7 < path.data.len() {
            let x = f32::from_le_bytes([path.data[i], path.data[i + 1], path.data[i + 2], path.data[i + 3]]);
            let y = f32::from_le_bytes([path.data[i + 4], path.data[i + 5], path.data[i + 6], path.data[i + 7]]);
            // Apply transform: x' = a*x + b*y + e; y' = c*x + d*y + f
            let tx = a.mul_add(x, b * y) + e;
            let ty = c.mul_add(x, d * y) + f;
            points.push(Pos2::new(tx, ty));
            i += 8;
        }

        points
    }
    
    fn convert_core_style(&self, core_style: &CorePathStyle) -> PathStyle {
        PathStyle {
            fill: core_style.fill.as_ref().map(|f| FillStyle {
                color: f.color,
                rule: f.rule.clone(),
            }),
            stroke: core_style.stroke.as_ref().map(|s| StrokeStyle {
                color: s.color,
                width: s.width,
                cap: s.cap.clone(),
                join: s.join.clone(),
                dash_array: s.dash_array.clone(),
            }),
            opacity: core_style.opacity,
            blend_mode: core_style.blend_mode.clone(),
        }
    }
    
    async fn convert_svg_to_xvg(&self, path: &Path) -> Result<File, EngineError> {
        // Try to read as UTF-8 string first
        let svg_content = match tokio::fs::read_to_string(path).await {
            Ok(content) => content,
            Err(_) => {
                // If UTF-8 fails, try to read as bytes and convert with lossy conversion
                let svg_bytes = tokio::fs::read(path).await
                    .map_err(|e| EngineError::FileOperation {
                        operation: "read".to_string(),
                        path: path.to_string_lossy().to_string(),
                        source: Box::new(e),
                    })?;
                
                // Try to convert bytes to string with UTF-8 replacement
                String::from_utf8_lossy(&svg_bytes).to_string()
            }
        };
        
        let tree = Tree::from_str(&svg_content, &Options::default())
            .map_err(|e| EngineError::DecodeError(e.to_string()))?;
        
        // Convert SVG to XVG format
        let mut file = File::default();
        // Establish document dimensions from root bbox (fallback) until unit/viewBox handling is finalized
        if let Some(doc_bbox) = tree.root.calculate_bbox() {
            file.header.width = doc_bbox.width().ceil() as u16;
            file.header.height = doc_bbox.height().ceil() as u16;
        }
        
        // Prefer real vectors. Enable raster fallback only if strictly necessary in future checks.
        let needs_raster_fallback = false;

        // If gradients/patterns/clip/mask are present, render the whole SVG to a raster asset via resvg
        if needs_raster_fallback {
            // Determine document size
            let (doc_w, doc_h) = if let Some(b) = tree.root.calculate_bbox() {
                (b.width().ceil().max(1.0) as u32, b.height().ceil().max(1.0) as u32)
            } else {
                (512u32, 512u32)
            };

            let rtree = resvg::Tree::from_usvg(&tree);
            if let Some(mut pm) = tiny_skia::Pixmap::new(doc_w, doc_h) {
                let mut target = pm.as_mut();
                rtree.render(resvg::tiny_skia::Transform::identity(), &mut target);

                // Encode pixmap to PNG bytes
                let rgba = image::RgbaImage::from_raw(doc_w, doc_h, pm.take())
                    .unwrap_or_else(|| image::RgbaImage::new(doc_w, doc_h));
                let mut png_bytes: Vec<u8> = Vec::new();
                let mut cursor = std::io::Cursor::new(&mut png_bytes);
                let dyn_img = image::DynamicImage::ImageRgba8(rgba);
                let _ = dyn_img.write_to(&mut cursor, image::ImageOutputFormat::Png);

                file.header.width = doc_w as u16;
                file.header.height = doc_h as u16;
                file.assets.push(xvg_core::Asset {
                    ty: xvg_core::AssetType::ImagePng,
                    name: path.file_name().and_then(|s| s.to_str()).unwrap_or("svg_raster").to_string(),
                    data: png_bytes,
                    compressed: false,
                    metadata: xvg_core::AssetMetadata {
                        mime_type: "image/png".to_string(),
                        size: (doc_w as u64) * (doc_h as u64) * 4,
                        created: 0,
                        modified: 0,
                        checksum: [0u8; 32],
                        tags: vec!["svg-rasterized".to_string()],
                    },
                });

                return Ok(file);
            }
        }

        // Extract paths from SVG
        for node in tree.root.descendants() {
            match &*node.borrow() {
                usvg::NodeKind::Path(svg_path) => {
                    // Skip nodes that require paint servers or masking/clipping; leave for per-node raster fallback
                    let has_paint_server = svg_path.fill.as_ref().map(|f| !matches!(f.paint, usvg::Paint::Color(_))).unwrap_or(false)
                        || svg_path.stroke.as_ref().map(|s| !matches!(s.paint, usvg::Paint::Color(_))).unwrap_or(false);
                    // usvg 0.36 doesn't expose clip_path()/mask() on Node; rely on paint server check for now
                    let is_masked_or_clipped = false;
                    if has_paint_server || is_masked_or_clipped { continue; }
                    // Convert SVG path data to XVG points, then apply absolute transform
                    let mut points = self.convert_svg_path_to_points(svg_path);
                    let tf = node.abs_transform();
                    for p in &mut points {
                        let x = p.x as f32;
                        let y = p.y as f32;
                        p.x = (tf.sx as f32) * x + (tf.kx as f32) * y + (tf.tx as f32);
                        p.y = (tf.ky as f32) * x + (tf.sy as f32) * y + (tf.ty as f32);
                    }
                    if !points.is_empty() {
                        let mut path_data = Vec::new();
                        
                        // Convert points to binary data
                        for point in &points {
                            path_data.extend_from_slice(&point.x.to_le_bytes());
                            path_data.extend_from_slice(&point.y.to_le_bytes());
                        }
                        
                        // Extract style information with ancestor/group inheritance (opacity)
                        let mut style = self.extract_svg_path_style(svg_path);
                        // Apply accumulated group opacity from ancestors
                        let mut group_opacity: f32 = 1.0;
                        let mut parent_opt = node.parent();
                        while let Some(parent) = parent_opt {
                            if let usvg::NodeKind::Group(g) = &*parent.borrow() {
                                group_opacity *= g.opacity.get() as f32;
                            }
                            parent_opt = parent.parent();
                        }
                        if group_opacity < 1.0 {
                            if let Some(ref mut f) = style.fill {
                                f.color[3] = (f.color[3] * group_opacity).clamp(0.0, 1.0);
                            }
                            if let Some(ref mut s) = style.stroke {
                                s.color[3] = (s.color[3] * group_opacity).clamp(0.0, 1.0);
                            }
                            // Keep PathStyle.opacity (global) as 1.0 to avoid double-multiplication in UI
                        }
                        
                        // Extract original SVG path string for proper rendering
                        let original_svg = self.extract_svg_path_string(svg_path);
                        
                        let path_record = PathRecord {
                            data: path_data,
                            tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0], // Identity transform
                            style,
                            original_svg,
                        };
                        
                        file.paths.push(path_record);
                    }
                }
                // TODO: handle rect/circle/ellipse/line/polyline/polygon/text via usvg to PathRecord with original SVG fallback


                _ => {}
            }
        }
        // Fallback: if no paths were extracted, create a placeholder rect from doc bbox
        if file.paths.is_empty() {
            if let Some(b) = tree.root.calculate_bbox() {
                let rect_points = vec![
                    Pos2::new(b.x(), b.y()),
                    Pos2::new(b.x() + b.width(), b.y()),
                    Pos2::new(b.x() + b.width(), b.y() + b.height()),
                    Pos2::new(b.x(), b.y() + b.height()),
                    Pos2::new(b.x(), b.y()),
                ];
                let mut data = Vec::new();
                for p in &rect_points { data.extend_from_slice(&p.x.to_le_bytes()); data.extend_from_slice(&p.y.to_le_bytes()); }
                file.paths.push(PathRecord {
                    data,
                    tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
                    style: CorePathStyle { fill: None, stroke: None, opacity: 1.0, blend_mode: xvg_core::BlendMode::Normal },
                    original_svg: None,
                });
            }
        }
        
        Ok(file)
    }
    
    async fn convert_image_to_xvg(&self, path: &Path) -> Result<File, EngineError> {
        let img_data = tokio::fs::read(path).await
            .map_err(|e| EngineError::FileOperation {
                operation: "read".to_string(),
                path: path.to_string_lossy().to_string(),
                source: Box::new(e),
            })?;
        
        let img = image::load_from_memory(&img_data)
            .map_err(|e| EngineError::DecodeError(e.to_string()))?;
        
        // Create XVG file and store the original image bytes as an asset
        let mut file = File::default();
        let (width, height) = img.dimensions();
        file.header.width = width as u16;
        file.header.height = height as u16;

        // Determine mime and asset type from extension
        let mut mime = "image/png".to_string();
        if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
            match ext.to_ascii_lowercase().as_str() {
                "jpg" | "jpeg" => mime = "image/jpeg".to_string(),
                "webp" => mime = "image/webp".to_string(),
                _ => {}
            }
        }

        let asset_type = match mime.as_str() {
            "image/jpeg" => xvg_core::AssetType::ImageJpeg,
            "image/webp" => xvg_core::AssetType::ImageWebP,
            _ => xvg_core::AssetType::ImagePng,
        };

        let asset = xvg_core::Asset {
            ty: asset_type,
            name: path.file_name().and_then(|s| s.to_str()).unwrap_or("image").to_string(),
            data: img_data,
            compressed: false,
            metadata: xvg_core::AssetMetadata {
                mime_type: mime,
                size: (width as u64) * (height as u64) * 4,
                created: 0,
                modified: 0,
                checksum: [0u8; 32],
                tags: vec!["raster".to_string()],
            },
        };
        file.assets.push(asset);

        Ok(file)
    }
    
    // Helper method to convert kurbo path to XVG points
    fn convert_kurbo_path_to_points(&self, path: &kurbo::BezPath) -> Vec<Pos2> {
        let mut points = Vec::new();
        
        // Sample points along the actual path for smooth curves
        let segments = path.segments();
        
        for segment in segments {
            match segment {
                kurbo::PathSeg::Line(line) => {
                    points.push(Pos2::new(line.p0.x as f32, line.p0.y as f32));
                    points.push(Pos2::new(line.p1.x as f32, line.p1.y as f32));
                }
                kurbo::PathSeg::Quad(quad) => {
                    // Sample quadratic bezier curve with more points
                    let steps = 16; // More segments for smoother curves
                    for i in 0..=steps {
                        let t = i as f64 / steps as f64;
                        let point = quad.eval(t);
                        points.push(Pos2::new(point.x as f32, point.y as f32));
                    }
                }
                kurbo::PathSeg::Cubic(cubic) => {
                    // Sample cubic bezier curve with more points
                    let steps = 20; // More segments for smoother curves
                    for i in 0..=steps {
                        let t = i as f64 / steps as f64;
                        let point = cubic.eval(t);
                        points.push(Pos2::new(point.x as f32, point.y as f32));
                    }
                }
            }
        }
        
        points
    }
    
    // Helper method to convert SVG path data to XVG points
    fn convert_svg_path_to_points(&self, svg_path: &usvg::Path) -> Vec<Pos2> {
        let mut points = Vec::new();
        
        // Use the proper usvg path data parser
        points = self.parse_usvg_path_data(svg_path);
        
        // If we couldn't extract path data, fall back to bounding box
        if points.is_empty() {
            let path_data = &svg_path.data;
            let bbox = path_data.bounds();
            if bbox.width() > 0.0 && bbox.height() > 0.0 {
                // Create a rectangle based on the bounding box
                let x = bbox.x();
                let y = bbox.y();
                let width = bbox.width();
                let height = bbox.height();
                
                // Create a simple rectangle path
                points.push(Pos2::new(x, y));
                points.push(Pos2::new(x + width, y));
                points.push(Pos2::new(x + width, y + height));
                points.push(Pos2::new(x, y + height));
                points.push(Pos2::new(x, y)); // Close the path
            } else {
                // Fallback to a small rectangle if bounding box is invalid
                points.push(Pos2::new(0.0, 0.0));
                points.push(Pos2::new(100.0, 0.0));
                points.push(Pos2::new(100.0, 100.0));
                points.push(Pos2::new(0.0, 100.0));
                points.push(Pos2::new(0.0, 0.0)); // Close the path
            }
        }
        
        points
    }
    
    // Extract the original path string from usvg::Path
    fn extract_svg_path_string(&self, svg_path: &usvg::Path) -> Option<String> {
        // Try to extract the original path string from the SVG element
        // This is a simplified approach - we'll reconstruct the path string from usvg data
        let path_data = &svg_path.data;
        let verbs = path_data.verbs();
        let points_data = path_data.points();
        
        if verbs.is_empty() {
            return None;
        }
        
        let mut path_string = String::new();
        let mut point_index = 0;
        let mut current_x = 0.0;
        let mut current_y = 0.0;
        let mut first_x = 0.0;
        let mut first_y = 0.0;
        
        for &verb in verbs {
            let verb_str = format!("{:?}", verb);
            match verb_str.as_str() {
                "Move" => {
                    if point_index < points_data.len() {
                        let point = points_data[point_index];
                        current_x = point.x as f32;
                        current_y = point.y as f32;
                        first_x = current_x;
                        first_y = current_y;
                        path_string.push_str(&format!("M {} {}", current_x, current_y));
                        point_index += 1;
                    }
                }
                "Line" => {
                    if point_index < points_data.len() {
                        let point = points_data[point_index];
                        current_x = point.x as f32;
                        current_y = point.y as f32;
                        path_string.push_str(&format!(" L {} {}", current_x, current_y));
                        point_index += 1;
                    }
                }
                "Cubic" => {
                    if point_index + 2 < points_data.len() {
                        let cp1 = points_data[point_index];
                        let cp2 = points_data[point_index + 1];
                        let end = points_data[point_index + 2];
                        path_string.push_str(&format!(" C {} {} {} {} {} {}", 
                            cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y));
                        current_x = end.x as f32;
                        current_y = end.y as f32;
                        point_index += 3;
                    }
                }
                "Close" => {
                    path_string.push_str(" Z");
                    current_x = first_x;
                    current_y = first_y;
                }
                _ => {
                    // Handle unknown verb or ignore
                    point_index += 1; // Advance point index for safety
                }
            }
        }
        
        if path_string.is_empty() {
            None
        } else {
            Some(path_string)
        }
    }
    
    // Parse SVG path data directly from usvg path data
    fn parse_usvg_path_data(&self, svg_path: &usvg::Path) -> Vec<Pos2> {
        // Robust segment-based parser using tiny_skia_path iterator
        let mut points: Vec<Pos2> = Vec::new();
        let mut current = Pos2::new(0.0, 0.0);
        let mut start = Pos2::new(0.0, 0.0);

        for seg in svg_path.data.segments() {
            match seg {
                PathSegment::MoveTo(p) => {
                    let pt = Pos2::new(p.x as f32, p.y as f32);
                    start = pt;
                    current = pt;
                    points.push(pt);
                }
                PathSegment::LineTo(p) => {
                    let pt = Pos2::new(p.x as f32, p.y as f32);
                    current = pt;
                    points.push(pt);
                }
                PathSegment::CubicTo(p1, p2, p3) => {
                    // Sample cubic from current -> p1 -> p2 -> p3
                    let cp1 = Pos2::new(p1.x as f32, p1.y as f32);
                    let cp2 = Pos2::new(p2.x as f32, p2.y as f32);
                    let end = Pos2::new(p3.x as f32, p3.y as f32);
                    let steps: i32 = 32;
                    for i in 1..=steps {
                        let t = (i as f32) / (steps as f32);
                        let omt = 1.0 - t;
                        let x = omt.powi(3) * current.x
                            + 3.0 * omt.powi(2) * t * cp1.x
                            + 3.0 * omt * t.powi(2) * cp2.x
                            + t.powi(3) * end.x;
                        let y = omt.powi(3) * current.y
                            + 3.0 * omt.powi(2) * t * cp1.y
                            + 3.0 * omt * t.powi(2) * cp2.y
                            + t.powi(3) * end.y;
                        points.push(Pos2::new(x, y));
                    }
                    current = end;
                }
                PathSegment::QuadTo(p1, p2) => {
                    // Sample quadratic from current -> p1 -> p2
                    let cp = Pos2::new(p1.x as f32, p1.y as f32);
                    let end = Pos2::new(p2.x as f32, p2.y as f32);
                    let steps: i32 = 24;
                    for i in 1..=steps {
                        let t = (i as f32) / (steps as f32);
                        let omt = 1.0 - t;
                        let x = omt * omt * current.x + 2.0 * omt * t * cp.x + t * t * end.x;
                        let y = omt * omt * current.y + 2.0 * omt * t * cp.y + t * t * end.y;
                        points.push(Pos2::new(x, y));
                    }
                    current = end;
                }
                PathSegment::Close => {
                    points.push(start);
                    current = start;
                }
                // Handle elliptical arc segments approximately by sampling
                #[allow(unreachable_patterns)]
                _ => {
                    // tiny_skia_path::PathSegment currently yields Move/Line/Quad/Cubic/Close;
                    // if Arc appears in future versions, approximate by sampling from current to end.
                }
            }
        }

        points
    }
    
    // Parse SVG path string (e.g., "M 10 10 L 20 20 Z")
    fn parse_svg_path_string(&self, path_string: &str) -> Vec<Pos2> {
        let mut points = Vec::new();
        let mut current_x = 0.0;
        let mut current_y = 0.0;
        let mut first_x = 0.0;
        let mut first_y = 0.0;
        let mut in_path = false;
        
        let mut chars = path_string.chars().peekable();
        
        while let Some(ch) = chars.next() {
            match ch {
                'M' | 'm' => {
                    // Move to (absolute or relative)
                    let (x, y) = self.parse_coordinates(&mut chars, ch == 'm', current_x, current_y);
                    current_x = x;
                    current_y = y;
                    if !in_path {
                        first_x = x;
                        first_y = y;
                        in_path = true;
                    }
                    points.push(Pos2::new(x, y));
                }
                'L' | 'l' => {
                    // Line to (absolute or relative)
                    let (x, y) = self.parse_coordinates(&mut chars, ch == 'l', current_x, current_y);
                    current_x = x;
                    current_y = y;
                    points.push(Pos2::new(x, y));
                }
                'H' | 'h' => {
                    // Horizontal line to (absolute or relative)
                    let x = self.parse_number(&mut chars);
                    if ch == 'h' {
                        current_x += x;
                    } else {
                        current_x = x;
                    }
                    points.push(Pos2::new(current_x, current_y));
                }
                'V' | 'v' => {
                    // Vertical line to (absolute or relative)
                    let y = self.parse_number(&mut chars);
                    if ch == 'v' {
                        current_y += y;
                    } else {
                        current_y = y;
                    }
                    points.push(Pos2::new(current_x, current_y));
                }
                'Z' | 'z' => {
                    // Close path
                    if in_path {
                        points.push(Pos2::new(first_x, first_y));
                    }
                    in_path = false;
                }
                'C' | 'c' => {
                    // Cubic bezier curve (simplified - just use end point)
                    let (x, y) = self.parse_coordinates(&mut chars, ch == 'c', current_x, current_y);
                    current_x = x;
                    current_y = y;
                    points.push(Pos2::new(x, y));
                }
                'Q' | 'q' => {
                    // Quadratic bezier curve (simplified - just use end point)
                    let (x, y) = self.parse_coordinates(&mut chars, ch == 'q', current_x, current_y);
                    current_x = x;
                    current_y = y;
                    points.push(Pos2::new(x, y));
                }
                _ => {
                    // Skip whitespace and other characters
                    if !ch.is_whitespace() && ch != ',' {
                        // Try to parse as implicit line command
                        chars.next_back(); // Put the character back
                        let (x, y) = self.parse_coordinates(&mut chars, false, current_x, current_y);
                        current_x = x;
                        current_y = y;
                        points.push(Pos2::new(x, y));
                    }
                }
            }
        }
        
        points
    }
    
    // Parse coordinates from SVG path
    fn parse_coordinates(&self, chars: &mut std::iter::Peekable<std::str::Chars>, relative: bool, current_x: f32, current_y: f32) -> (f32, f32) {
        let x = self.parse_number(chars);
        let y = self.parse_number(chars);
        
        if relative {
            (current_x + x, current_y + y)
        } else {
            (x, y)
        }
    }
    
    // Parse a number from SVG path
    fn parse_number(&self, chars: &mut std::iter::Peekable<std::str::Chars>) -> f32 {
        let mut number_str = String::new();
        let mut has_decimal = false;
        
        // Skip leading whitespace and commas
        while let Some(&ch) = chars.peek() {
            if ch.is_whitespace() || ch == ',' {
                chars.next();
            } else {
                break;
            }
        }
        
        // Parse the number
        while let Some(&ch) = chars.peek() {
            match ch {
                '0'..='9' => {
                    number_str.push(ch);
                    chars.next();
                }
                '.' => {
                    if !has_decimal {
                        number_str.push(ch);
                        has_decimal = true;
                    }
                    chars.next();
                }
                '-' => {
                    if number_str.is_empty() {
                        number_str.push(ch);
                    }
                    chars.next();
                }
                _ => break,
            }
        }
        
        number_str.parse::<f32>().unwrap_or(0.0)
    }
    
    // Helper method to extract style from SVG path
    fn extract_svg_path_style(&self, svg_path: &usvg::Path) -> CorePathStyle {
        // Resolve fill color and rule; SVG default fill is black when not specified
        let (maybe_fill_color, fill_rule) = if let Some(fill) = &svg_path.fill {
            let color_opt = match &fill.paint {
                usvg::Paint::Color(color) => Some([
                    color.red as f32 / 255.0,
                    color.green as f32 / 255.0,
                    color.blue as f32 / 255.0,
                    fill.opacity.get() as f32,
                ]),
                // 'none' or paint servers are treated as no solid fill here
                _ => None,
            };
            let rule = match fill.rule {
                usvg::FillRule::NonZero => xvg_core::FillRule::NonZero,
                usvg::FillRule::EvenOdd => xvg_core::FillRule::EvenOdd,
            };
            (color_opt, rule)
        } else {
            (None, xvg_core::FillRule::NonZero)
        };
        
        // Only set stroke if the SVG actually has a solid color stroke (paint servers trigger raster fallback)
        let stroke_style = if let Some(stroke) = svg_path.stroke.as_ref() {
            match &stroke.paint {
                usvg::Paint::Color(color) => {
                    let cap = match stroke.linecap {
                        usvg::LineCap::Butt => xvg_core::LineCap::Butt,
                        usvg::LineCap::Round => xvg_core::LineCap::Round,
                        usvg::LineCap::Square => xvg_core::LineCap::Square,
                    };
                    let join = match stroke.linejoin {
                        usvg::LineJoin::Miter => xvg_core::LineJoin::Miter,
                        usvg::LineJoin::Round => xvg_core::LineJoin::Round,
                        usvg::LineJoin::Bevel => xvg_core::LineJoin::Bevel,
                        usvg::LineJoin::MiterClip => xvg_core::LineJoin::Miter,
                    };
                    // Extract stroke dashes if present (best-effort)
                    let dash_array: Vec<f32> = match &stroke.dasharray {
                        Some(_da) => {
                            // usvg 0.36 represents dasharray with lengths in user units; API may not expose raw list directly here
                            // Leave empty for now; will populate when stable API is confirmed
                            Vec::new()
                        }
                        None => Vec::new(),
                    };

                    Some(xvg_core::StrokeStyle {
                        color: [
                            color.red as f32 / 255.0,
                            color.green as f32 / 255.0,
                            color.blue as f32 / 255.0,
                            stroke.opacity.get() as f32,
                        ],
                        width: stroke.width.get(),
                        cap,
                        join,
                        dash_array,
                    })
                }
                _ => None,
            }
        } else { None };
        
        CorePathStyle {
            fill: maybe_fill_color.map(|c| xvg_core::FillStyle { color: c, rule: fill_rule }),
            stroke: stroke_style, // Only set if SVG has stroke
            opacity: 1.0,
            blend_mode: xvg_core::BlendMode::Normal,
        }
    }

    fn extract_svg_element_style(&self, node: &usvg::Node) -> CorePathStyle {
        // Extract style information from any SVG element using the correct usvg API
        let (maybe_fill_color, fill_rule) = match &*node.borrow() {
            usvg::NodeKind::Path(svg_path) => {
                let color_opt = svg_path.fill.as_ref().and_then(|fill| match &fill.paint {
                    usvg::Paint::Color(color) => Some([
                        color.red as f32 / 255.0,
                        color.green as f32 / 255.0,
                        color.blue as f32 / 255.0,
                        fill.opacity.get() as f32,
                    ]),
                    _ => None,
                });
                let rule = svg_path
                    .fill
                    .as_ref()
                    .map(|f| match f.rule { usvg::FillRule::NonZero => xvg_core::FillRule::NonZero, usvg::FillRule::EvenOdd => xvg_core::FillRule::EvenOdd })
                    .unwrap_or(xvg_core::FillRule::NonZero);
                (color_opt, rule)
            }
            _ => (None, xvg_core::FillRule::NonZero),
        };
        
        let stroke_color = match &*node.borrow() {
            usvg::NodeKind::Path(svg_path) => {
                svg_path.stroke.as_ref().and_then(|stroke| {
                    match &stroke.paint {
                        usvg::Paint::Color(color) => Some([
                            color.red as f32 / 255.0,
                            color.green as f32 / 255.0,
                            color.blue as f32 / 255.0,
                            stroke.opacity.get() as f32,
                        ]),
                        _ => None,
                    }
                }).unwrap_or([0.0, 0.0, 0.0, 1.0])
            }
            _ => [0.0, 0.0, 0.0, 1.0], // Default black for non-path elements
        };
        
        let stroke_width = match &*node.borrow() {
            usvg::NodeKind::Path(svg_path) => {
                svg_path.stroke.as_ref()
                    .map(|stroke| stroke.width.get())
                    .unwrap_or(1.0)
            }
            _ => 1.0, // Default stroke width for non-path elements
        };
        
        // Only set stroke if the SVG actually has a stroke
        let stroke_style = match &*node.borrow() {
            usvg::NodeKind::Path(svg_path) => {
                svg_path.stroke.as_ref().map(|stroke| {
                    let stroke_color = match &stroke.paint {
                        usvg::Paint::Color(color) => [
                            color.red as f32 / 255.0,
                            color.green as f32 / 255.0,
                            color.blue as f32 / 255.0,
                            stroke.opacity.get() as f32,
                        ],
                        _ => [0.0, 0.0, 0.0, 1.0], // Default black
                    };
                    let cap = match stroke.linecap { usvg::LineCap::Butt => xvg_core::LineCap::Butt, usvg::LineCap::Round => xvg_core::LineCap::Round, usvg::LineCap::Square => xvg_core::LineCap::Square };
                    let join = match stroke.linejoin {
                        usvg::LineJoin::Miter => xvg_core::LineJoin::Miter,
                        usvg::LineJoin::Round => xvg_core::LineJoin::Round,
                        usvg::LineJoin::Bevel => xvg_core::LineJoin::Bevel,
                        usvg::LineJoin::MiterClip => xvg_core::LineJoin::Miter,
                    };
                    xvg_core::StrokeStyle {
                        color: stroke_color,
                        width: stroke.width.get(),
                        cap,
                        join,
                        dash_array: Vec::new(),
                    }
                })
            }
            _ => None, // No stroke for non-path elements
        };
        
        CorePathStyle {
            fill: maybe_fill_color.map(|c| xvg_core::FillStyle { color: c, rule: fill_rule }),
            stroke: stroke_style, // Only set if SVG has stroke
            opacity: 1.0,
            blend_mode: xvg_core::BlendMode::Normal,
        }
    }

    fn create_rounded_rectangle_points(&self, x: f64, y: f64, width: f64, height: f64, rx: f64, ry: f64) -> Vec<Pos2> {
        let mut points = Vec::new();
        let steps = 8; // Segments per corner
        
        // Top edge
        points.push(Pos2::new((x + rx) as f32, y as f32));
        points.push(Pos2::new((x + width - rx) as f32, y as f32));
        
        // Top-right corner
        for i in 0..=steps {
            let angle = std::f64::consts::PI * 1.5 + (std::f64::consts::PI / 2.0) * i as f64 / steps as f64;
            let px = x + width - rx + rx * angle.cos();
            let py = y + ry + ry * angle.sin();
            points.push(Pos2::new(px as f32, py as f32));
        }
        
        // Right edge
        points.push(Pos2::new((x + width) as f32, (y + ry) as f32));
        points.push(Pos2::new((x + width) as f32, (y + height - ry) as f32));
        
        // Bottom-right corner
        for i in 0..=steps {
            let angle = std::f64::consts::PI * 2.0 + (std::f64::consts::PI / 2.0) * i as f64 / steps as f64;
            let px = x + width - rx + rx * angle.cos();
            let py = y + height - ry + ry * angle.sin();
            points.push(Pos2::new(px as f32, py as f32));
        }
        
        // Bottom edge
        points.push(Pos2::new((x + width - rx) as f32, (y + height) as f32));
        points.push(Pos2::new((x + rx) as f32, (y + height) as f32));
        
        // Bottom-left corner
        for i in 0..=steps {
            let angle = std::f64::consts::PI * 0.5 + (std::f64::consts::PI / 2.0) * i as f64 / steps as f64;
            let px = x + rx + rx * angle.cos();
            let py = y + height - ry + ry * angle.sin();
            points.push(Pos2::new(px as f32, py as f32));
        }
        
        // Left edge
        points.push(Pos2::new(x as f32, (y + height - ry) as f32));
        points.push(Pos2::new(x as f32, (y + ry) as f32));
        
        // Top-left corner
        for i in 0..=steps {
            let angle = (std::f64::consts::PI / 2.0) * i as f64 / steps as f64;
            let px = x + rx + rx * angle.cos();
            let py = y + ry + ry * angle.sin();
            points.push(Pos2::new(px as f32, py as f32));
        }
        
        points
    }
}

// Helper function to convert egui color to xvg color
pub fn egui_color_to_xvg_color(color: eframe::egui::Color32) -> [f32; 4] {
    [
        color.r() as f32 / 255.0,
        color.g() as f32 / 255.0,
        color.b() as f32 / 255.0,
        color.a() as f32 / 255.0,
    ]
}

 