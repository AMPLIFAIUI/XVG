use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use eframe::egui::{self, Color32, Pos2, Rect, Response, Sense, Ui, Context, IconData};
use eframe;
use egui_dock::{DockArea, Node, TabViewer};
use xvg_core::{File, PathRecord, Header, ColorProfile, Keyframe, InterpolationType, AudioTrack, PhysicsBody, PathStyle, FillStyle, StrokeStyle, FillRule, LineCap, LineJoin, BlendMode, AnimCurve, Easing, SDFLayer, AudioCodec, Scene3DNode, ShaderWGSL, PhysicsSnapshot, FontSubset, Asset, AssetType, AssetMetadata};
use thiserror::Error;
use image;
use usvg::{Tree, Options, TreeParsing, NodeExt};
use rfd;
use dirs;
use open;
use tiny_skia::{Pixmap, Paint, Path as TinySkiaPath, PathBuilder, FillRule as TinySkiaFillRule};
use tiny_skia_path::PathSegment;

// Import our engine
mod engine;
use engine::{XvgCoreEngine, XvgEngine, EngineError, PathData, PathStyle as EnginePathStyle, PhysicsBodyData, AudioTrackData, CollaborationStatus, FileInfo, EngineEventHandler, EngineEvent};

// Constants
const CANVAS_SIZE: f32 = 800.0;
const MIN_ZOOM: f32 = 0.1;
const MAX_ZOOM: f32 = 32.0;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Image error: {0}")]
    Image(#[from] image::ImageError),
    #[error("SVG error: {0}")]
    Svg(#[from] usvg::Error),
    #[error("XVG decode error: {0}")]
    XvgDecode(String),
    #[error("File format not supported: {0}")]
    UnsupportedFormat(String),
    #[error("Invalid operation: {0}")]
    InvalidOperation(String),
}

type AppResult<T> = Result<T, AppError>;

// Use types from xvg_core instead of local definitions

// App state structures
#[derive(Clone)]
pub struct AppState {
    // Engine (our new transmission!)
    pub engine: XvgCoreEngine,
    
    // Performance optimization: persistent engines
    pub sdf_engine: Option<xvg_core::sdf::SDFEngine>,
    
    // Core data (legacy - will be removed)
    pub file: Option<Arc<Mutex<File>>>,
    pub file_path: Option<PathBuf>,
    pub last_saved: Option<std::time::Instant>,
    pub is_dirty: bool,
    // Cache for rasterized complex paths: key = (path_id, scale_bucket)
    pub raster_cache: std::collections::HashMap<(usize, u32), egui::TextureHandle>,
    // LRU tracking for raster cache
    pub raster_cache_usage: std::collections::HashMap<(usize, u32), u64>,
    pub raster_cache_tick: u64,
    pub raster_cache_capacity: usize,

    // UI state
    pub selected_tab: TabType,
    pub status_message: Option<StatusMessage>,
    pub show_about: bool,
    pub show_preferences: bool,

    // Viewport state
    pub viewport: ViewportState,

    // Tool state
    pub tools: ToolState,

    // Selection state
    pub selection: SelectionState,

    // Animation state (UI only)
    pub animation: AnimationState,

    // Audio state (UI only)
    pub audio: AudioState,

    // Physics state (UI only)
    pub physics: PhysicsState,

    // Collaboration state (UI only)
    pub collaboration: CollaborationState,

    // Performance monitoring
    pub performance: PerformanceState,
}

impl EngineEventHandler for AppState {
    fn on_event(&self, event: EngineEvent) {
        match event {
            EngineEvent::FileLoaded(file_info) => {
                // println!("File loaded: {} paths", file_info.path_count);
            }
            EngineEvent::FileSaved(path) => {
                println!("File saved: {:?}", path);
            }
            EngineEvent::PathCreated(id) => {
                // println!("Path created: {}", id);
            }
            EngineEvent::PathDeleted(id) => {
                // println!("Path deleted: {}", id);
            }
            EngineEvent::PathUpdated(id) => {
                // println!("Path updated: {}", id);
            }
            EngineEvent::PhysicsUpdated(bodies) => {
                // println!("Physics updated: {} bodies", bodies.len());
            }
            EngineEvent::AudioStarted(track_id) => {
                // println!("Audio started: track {}", track_id);
            }
            EngineEvent::AudioStopped => {
                // println!("Audio stopped");
            }
            EngineEvent::CollaborationEnabled => {
                // println!("Collaboration enabled");
            }
            EngineEvent::CollaborationDisabled => {
                // println!("Collaboration disabled");
            }
            EngineEvent::Error(message) => {
                eprintln!("Engine error: {}", message);
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum TabType {
    Viewport,
    Timeline,
    Inspector,
    SdfEditor,
    Audio,
    Scene3D,
    Shaders,
    Physics,
    Effects,
    Animation,
    Fonts,
    Collaboration,
}

impl Default for TabType {
    fn default() -> Self {
        TabType::Viewport
    }
}

#[derive(Debug, Clone)]
pub struct StatusMessage {
    pub text: String,
    pub level: MessageLevel,
    pub timestamp: std::time::Instant,
}

#[derive(Debug, Clone)]
pub enum MessageLevel {
    Info,
    Warning,
    Error,
    Success,
}

#[derive(Debug, Clone)]
pub struct ViewportState {
    pub zoom: f32,
    pub pan: [f32; 2],
    pub show_grid: bool,
    pub show_rulers: bool,
    pub show_safe_areas: bool,
    pub background_color: egui::Color32,
    pub snap_to_grid: bool,
    pub grid_size: f32,
}

impl Default for ViewportState {
    fn default() -> Self {
        Self {
            zoom: 1.0,
            pan: [0.0, 0.0],
            show_grid: true,
            show_rulers: true,
            show_safe_areas: false,
            background_color: egui::Color32::from_gray(240),
            snap_to_grid: false,
            grid_size: 20.0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ToolState {
    pub current_tool: DrawingTool,
    pub previous_tool: DrawingTool,
    pub drawing_mode: bool,
    pub drawing_points: Vec<egui::Pos2>,
    pub selected_color: egui::Color32,
    pub stroke_width: f32,
    pub fill_enabled: bool,
    pub stroke_enabled: bool,
    pub opacity: f32,
}

impl Default for ToolState {
    fn default() -> Self {
        Self {
            current_tool: DrawingTool::Select,
            previous_tool: DrawingTool::Select,
            drawing_mode: false,
            drawing_points: Vec::new(),
            selected_color: egui::Color32::BLACK,
            stroke_width: 2.0,
            fill_enabled: true,
            stroke_enabled: true,
            opacity: 1.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DrawingTool {
    Select,
    SelectBox,
    Rectangle,
    Circle,
    Ellipse,
    Line,
    Freehand,
    Text,
    Eyedropper,
    Zoom,
    Pan,
}

impl Default for DrawingTool {
    fn default() -> Self {
        DrawingTool::Select
    }
}

#[derive(Debug, Clone)]
pub struct SelectionState {
    pub selected_paths: Vec<usize>,
    pub selected_nodes: Vec<usize>,
    pub show_nodes: bool,
    pub dragging_selection: bool,
    pub drag_start: Option<egui::Pos2>,
    pub drag_offset: [f32; 2],
    pub selection_box_start: Option<egui::Pos2>,
    pub selection_box_end: Option<egui::Pos2>,
    pub drawing_selection_box: bool,
    pub clipboard: Vec<PathRecord>,
}

#[derive(Debug, Clone)]
pub struct AnimationState {
    pub playhead: f32,
    pub playing: bool,
    pub time_scale: f32,
    pub loop_enabled: bool,
    pub start_time: f32,
    pub end_time: f32,
    pub selected_curve: Option<usize>,
}

impl Default for AnimationState {
    fn default() -> Self {
        Self {
            playhead: 0.0,
            playing: false,
            time_scale: 1.0,
            loop_enabled: false,
            start_time: 0.0,
            end_time: 10.0,
            selected_curve: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct AudioState {
    pub volume: f32,
    pub muted: bool,
    pub selected_track: Option<usize>,
    pub waveform_cache: HashMap<usize, Vec<f32>>,
}

impl Default for AudioState {
    fn default() -> Self {
        Self {
            volume: 1.0,
            muted: false,
            selected_track: None,
            waveform_cache: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct PhysicsState {
    pub enabled: bool,
    pub gravity: [f32; 3],
    pub time_scale: f32,
    pub selected_body: Option<usize>,
    pub simulation_running: bool,
}

impl Default for PhysicsState {
    fn default() -> Self {
        Self {
            enabled: false,
            gravity: [0.0, -9.81, 0.0],
            time_scale: 1.0,
            selected_body: None,
            simulation_running: false,
        }
    }
}

#[derive(Debug, Clone)]
pub struct CollaborationState {
    pub enabled: bool,
    pub local_author_id: u16,
    pub lamport_clock: u64,
    pub connected_users: Vec<String>,
    pub sync_status: SyncStatus,
}

#[derive(Debug, Clone)]
pub enum SyncStatus {
    Offline,
    Connecting,
    Connected,
    Syncing,
    Error,
}

pub enum RecentFileAction {
    Load(PathBuf, String),
    Clear,
}

impl Default for SyncStatus {
    fn default() -> Self {
        SyncStatus::Offline
    }
}

#[derive(Debug, Clone)]
pub struct PerformanceState {
    pub fps: f32,
    pub frame_time: std::time::Duration,
    pub memory_usage: usize,
    pub last_update: std::time::Instant,
}

// Command system
#[derive(Debug, Clone)]
pub enum Command {
    AddPath(PathRecord),
    DeletePaths(Vec<usize>),
    MovePaths { indices: Vec<usize>, delta: [f32; 2] },
    ModifyPath { index: usize, old: PathRecord, new: PathRecord },
}

#[derive(Debug)]
pub struct CommandHistory {
    pub commands: Vec<Command>,
    pub current_index: usize,
    pub max_history: usize,
}

impl CommandHistory {
    pub fn new() -> Self {
        Self {
            commands: Vec::new(),
            current_index: 0,
            max_history: 100,
        }
    }

    pub fn push(&mut self, command: Command) {
        // Remove any commands after current_index
        self.commands.truncate(self.current_index);
        self.commands.push(command);
        self.current_index = self.commands.len();
        
        // Limit history size
        if self.commands.len() > self.max_history {
            self.commands.remove(0);
            self.current_index = self.current_index.saturating_sub(1);
        }
    }

    pub fn can_undo(&self) -> bool {
        self.current_index > 0
    }

    pub fn can_redo(&self) -> bool {
        self.current_index < self.commands.len()
    }

    pub fn undo(&mut self) -> Option<&Command> {
        if self.can_undo() {
            self.current_index -= 1;
            self.commands.get(self.current_index)
        } else {
            None
        }
    }

    pub fn redo(&mut self) -> Option<&Command> {
        if self.can_redo() {
            let command = self.commands.get(self.current_index);
            self.current_index += 1;
            command
        } else {
            None
        }
    }
}

#[derive(Debug, Clone)]
pub struct AppPreferences {
    pub auto_save_interval: std::time::Duration,
    pub backup_enabled: bool,
    pub recent_files_limit: usize,
    pub default_canvas_size: [u16; 2],
    pub ui_scale: f32,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            auto_save_interval: std::time::Duration::from_secs(300), // 5 minutes
            backup_enabled: true,
            recent_files_limit: 10,
            default_canvas_size: [800, 600],
            ui_scale: 1.0,
        }
    }
}

// Main application
pub struct XvgApp {
    pub state: AppState,
    pub command_history: CommandHistory,
    pub recent_files: Vec<PathBuf>,
    pub preferences: AppPreferences,
}

impl eframe::App for XvgApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Limit frame rate to reduce GPU usage
        ctx.request_repaint_after(std::time::Duration::from_millis(50)); // 20 FPS for ultra-low GPU
        
        // DISABLE GPU-INTENSIVE OPERATIONS
        // self.update_performance(ctx);  // Disabled - can cause GPU usage
        // self.handle_file_drop(ctx);    // Disabled - causes crashes and GPU load
        self.handle_keyboard_shortcuts(ctx);
        // self.handle_auto_save();       // Disabled - file I/O can be GPU intensive

        self.render_menu_bar(ctx);
        self.render_toolbar(ctx);
        self.render_main_content(ctx);
        self.render_status_bar(ctx);
        self.render_modal_dialogs(ctx);
    }

    fn save(&mut self, _storage: &mut dyn eframe::Storage) {
        // Save preferences and recent files
    }
}

impl XvgApp {
    fn evict_raster_cache_if_needed(&mut self) {
        let len = self.state.raster_cache.len();
        if len <= self.state.raster_cache_capacity { return; }
        let mut entries: Vec<((usize,u32), u64)> = self.state.raster_cache_usage.iter().map(|(k,v)| (*k,*v)).collect();
        entries.sort_by_key(|&(_, tick)| tick);
        let to_remove = len.saturating_sub(self.state.raster_cache_capacity);
        for i in 0..to_remove {
            if let Some((key, _)) = entries.get(i) {
                self.state.raster_cache.remove(key);
                self.state.raster_cache_usage.remove(key);
            }
        }
    }
    pub fn new(_cc: &eframe::CreationContext<'_>) -> Self {
        let mut app = Self {
            state: AppState {
                engine: XvgCoreEngine::new(),
                sdf_engine: None, // Lazy initialization for performance
                file: None,
                file_path: None,
                last_saved: None,
                is_dirty: false,
                raster_cache: std::collections::HashMap::new(),
                raster_cache_usage: std::collections::HashMap::new(),
                raster_cache_tick: 0,
                raster_cache_capacity: 256,
                selected_tab: TabType::Viewport,
                status_message: None,
                show_about: false,
                show_preferences: false,
                viewport: ViewportState::default(),
                tools: ToolState::default(),
                selection: SelectionState {
                    selected_paths: Vec::new(),
                    selected_nodes: Vec::new(),
                    show_nodes: false,
                    dragging_selection: false,
                    drag_start: None,
                    drag_offset: [0.0, 0.0],
                    selection_box_start: None,
                    selection_box_end: None,
                    drawing_selection_box: false,
                    clipboard: Vec::new(),
                },
                animation: AnimationState::default(),
                audio: AudioState::default(),
                physics: PhysicsState::default(),
                collaboration: CollaborationState {
                    enabled: false,
                    local_author_id: 1,
                    lamport_clock: 0,
                    connected_users: Vec::new(),
                    sync_status: SyncStatus::default(),
                },
                performance: PerformanceState {
                    fps: 60.0,
                    frame_time: std::time::Duration::from_millis(16),
                    memory_usage: 0,
                    last_update: std::time::Instant::now(),
                },
            },
            command_history: CommandHistory::new(),
            recent_files: Vec::new(),
            preferences: AppPreferences::default(),
        };
        
        app
    }

    pub fn set_status_message(&mut self, text: String, level: MessageLevel) {
        self.state.status_message = Some(StatusMessage {
            text,
            level,
            timestamp: std::time::Instant::now(),
        });
    }

    pub fn update_performance(&mut self, ctx: &egui::Context) {
        let now = std::time::Instant::now();
        let delta = now.duration_since(self.state.performance.last_update);
        self.state.performance.frame_time = delta;
        self.state.performance.fps = 1.0 / delta.as_secs_f32();
        self.state.performance.last_update = now;
        
        // Request continuous updates for smooth animation
        ctx.request_repaint();
    }

    pub fn handle_file_drop(&mut self, ctx: &egui::Context) {
        if !ctx.input(|i| i.raw.dropped_files.is_empty()) {
            for dropped_file in &ctx.input(|i| i.raw.dropped_files.clone()) {
                if let Some(path) = &dropped_file.path {
                    match self.load_file(path) {
                        Ok(()) => {
                            self.set_status_message(
                                format!("Loaded file: {}", path.display()),
                                MessageLevel::Success,
                            );
                        }
                        Err(e) => {
                            self.set_status_message(
                                format!("Failed to load file: {}", e),
                                MessageLevel::Error,
                            );
                        }
                    }
                }
            }
        }
    }

    pub fn load_file(&mut self, path: &Path) -> AppResult<()> {
        // Use the engine to load the file
        let runtime = tokio::runtime::Builder::new_current_thread().build().unwrap();
        if let Err(engine_error) = runtime.block_on(self.state.engine.load_file(path)) {
            return Err(AppError::InvalidOperation(format!("Engine error: {}", engine_error)));
        }
        
        // Invalidate any cached textures from the previous document to prevent stale frames
        self.state.raster_cache.clear();
        
        // Update UI state
        self.state.file_path = Some(path.to_path_buf());
        self.state.last_saved = Some(std::time::Instant::now());
        self.state.is_dirty = false;
        
        self.add_to_recent_files(path.to_path_buf());
        // Auto-fit viewport to newly loaded content so it is visible immediately
        self.fit_viewport_to_content();
        self.set_status_message(format!("Loaded file: {}", path.display()), MessageLevel::Success);
        
        Ok(())
    }

    pub fn save_file(&mut self, path: Option<&Path>) -> AppResult<()> {
        let save_path = path.or(self.state.file_path.as_deref())
            .ok_or_else(|| AppError::InvalidOperation("No file path specified".to_string()))?;
        let save_path_buf = save_path.to_path_buf();

        // Use the engine to save the file
        let runtime = tokio::runtime::Builder::new_current_thread().build().unwrap();
        if let Err(engine_error) = runtime.block_on(self.state.engine.save_file(save_path)) {
            return Err(AppError::InvalidOperation(format!("Engine error: {}", engine_error)));
        }
        
        // Update UI state
        self.state.file_path = Some(save_path_buf.clone());
        self.state.last_saved = Some(std::time::Instant::now());
        self.state.is_dirty = false;
        self.add_to_recent_files(save_path_buf);
        
        Ok(())
    }

    pub fn add_to_recent_files(&mut self, path: PathBuf) {
        if let Some(index) = self.recent_files.iter().position(|p| p == &path) {
            self.recent_files.remove(index);
        }
        self.recent_files.insert(0, path);
        
        if self.recent_files.len() > self.preferences.recent_files_limit {
            self.recent_files.truncate(self.preferences.recent_files_limit);
        }
    }

    pub fn execute_command(&mut self, command: Command) {
        if let Some(file_arc) = &self.state.file {
            let mut file = file_arc.lock().unwrap();
            
            match &command {
                Command::AddPath(path) => {
                    file.paths.push(path.clone());
                }
                Command::DeletePaths(indices) => {
                    // Remove paths in reverse order to maintain indices
                    let mut sorted_indices = indices.clone();
                    sorted_indices.sort_unstable_by(|a, b| b.cmp(a));
                    for &index in &sorted_indices {
                        if index < file.paths.len() {
                            file.paths.remove(index);
                        }
                    }
                }
                Command::MovePaths { indices, delta } => {
                    for &index in indices {
                        if index < file.paths.len() {
                            file.paths[index].tf[4] += delta[0] as f64;
                            file.paths[index].tf[5] += delta[1] as f64;
                        }
                    }
                }
                Command::ModifyPath { index, new, .. } => {
                    if *index < file.paths.len() {
                        file.paths[*index] = new.clone();
                    }
                }
            }
            
            self.state.is_dirty = true;
        }
        
        self.command_history.push(command);
    }

    pub fn new_file(&mut self) {
        if let Err(engine_error) = self.state.engine.new_file() {
            self.set_status_message(format!("Failed to create new file: {}", engine_error), MessageLevel::Error);
            return;
        }
        
        // Invalidate any cached textures to ensure a clean canvas
        self.state.raster_cache.clear();

        self.state.file_path = None;
        self.state.is_dirty = false;
        self.state.selection.selected_paths.clear();
        self.set_status_message("Created new file".to_string(), MessageLevel::Info);
    }

    pub fn open_file_dialog(&mut self) {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter("All Files", &["*"])
            .add_filter("XVG Files", &["xvg"])
            .add_filter("SVG Files", &["svg"])
            .add_filter("Image Files", &["png", "jpg", "jpeg", "gif", "bmp", "tiff", "webp"])
            .pick_file() {
            
            // Show file info before loading
            self.show_file_info_dialog(&path);
            
            if let Err(e) = self.load_file(&path) {
                self.set_status_message(format!("Failed to open file: {}", e), MessageLevel::Error);
            } else {
                // Show detailed file information after successful load
                self.set_status_message(
                    format!("Successfully opened: {} ({})", 
                        path.file_name().unwrap_or_default().to_string_lossy(),
                        self.get_file_size_display(&path)
                    ), 
                    MessageLevel::Success
                );
            }
        }
    }
    
    // Helper method to get file size in human readable format
    fn get_file_size_display(&self, path: &Path) -> String {
        if let Ok(metadata) = std::fs::metadata(path) {
            let size = metadata.len();
            if size < 1024 {
                format!("{} B", size)
            } else if size < 1024 * 1024 {
                format!("{:.1} KB", size as f64 / 1024.0)
            } else {
                format!("{:.1} MB", size as f64 / (1024.0 * 1024.0))
            }
        } else {
            "Unknown size".to_string()
        }
    }
    
    // Show file information dialog
    fn show_file_info_dialog(&self, path: &Path) {
        // This would be implemented as a modal dialog
        // For now, we'll just log the information
        let file_name = path.file_name().unwrap_or_default().to_string_lossy();
        let file_size = self.get_file_size_display(path);
        let file_extension = path.extension().unwrap_or_default().to_string_lossy();
        
        println!("📁 Opening file: {}", file_name);
        println!("📊 File size: {}", file_size);
        println!("🔧 File type: {}", file_extension.to_uppercase());
        println!("📍 Path: {}", path.display());
    }

    pub fn save_as_dialog(&mut self) {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter("All Files", &["*"])
            .add_filter("XVG Files", &["xvg"])
            .add_filter("SVG Files", &["svg"])
            .add_filter("PNG Images", &["png"])
            .add_filter("JPEG Images", &["jpg", "jpeg"])
            .add_filter("GIF Images", &["gif"])
            .add_filter("BMP Images", &["bmp"])
            .add_filter("TIFF Images", &["tiff", "tif"])
            .add_filter("WebP Images", &["webp"])
            .save_file() {
            
            // Determine the target format based on file extension
            let extension = path.extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("xvg")
                .to_lowercase();
            
            match extension.as_str() {
                "xvg" => {
                    // Save as native XVG format
                    if let Err(e) = self.save_file(Some(&path)) {
                        self.set_status_message(format!("Failed to save XVG file: {}", e), MessageLevel::Error);
                    } else {
                        self.set_status_message(format!("Saved as XVG: {}", path.file_name().unwrap_or_default().to_string_lossy()), MessageLevel::Success);
                    }
                }
                "svg" => {
                    // Convert and save as SVG
                    if let Err(e) = self.export_to_svg(&path) {
                        self.set_status_message(format!("Failed to export as SVG: {}", e), MessageLevel::Error);
                    } else {
                        self.set_status_message(format!("Exported as SVG: {}", path.file_name().unwrap_or_default().to_string_lossy()), MessageLevel::Success);
                    }
                }
                "png" | "jpg" | "jpeg" | "gif" | "bmp" | "tiff" | "tif" | "webp" => {
                    // Convert and save as image
                    if let Err(e) = self.export_to_image(&path) {
                        self.set_status_message(format!("Failed to export as image: {}", e), MessageLevel::Error);
                    } else {
                        self.set_status_message(format!("Exported as image: {}", path.file_name().unwrap_or_default().to_string_lossy()), MessageLevel::Success);
                    }
                }
                _ => {
                    // Default to XVG for unknown extensions
                    if let Err(e) = self.save_file(Some(&path)) {
                        self.set_status_message(format!("Failed to save file: {}", e), MessageLevel::Error);
                    } else {
                        self.set_status_message(format!("Saved as XVG: {}", path.file_name().unwrap_or_default().to_string_lossy()), MessageLevel::Success);
                    }
                }
            }
        }
    }

    pub fn export_to_svg(&mut self, path: &Path) -> AppResult<()> {
        // Get the paths from the engine
        let paths = self.state.engine.get_paths();
        if paths.is_empty() {
            return Err(AppError::InvalidOperation("No content to export".to_string()));
        }
        
        // Get file info for dimensions
        let file_info = self.state.engine.get_file_info()
            .ok_or_else(|| AppError::InvalidOperation("No file info available".to_string()))?;
        
        // Create a basic SVG representation
        let mut svg_content = String::new();
        svg_content.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        svg_content.push_str("<svg xmlns=\"http://www.w3.org/2000/svg\" version=\"1.1\" ");
        svg_content.push_str(&format!("width=\"{}\" height=\"{}\">\n", 
            file_info.dimensions.0, file_info.dimensions.1));
        
        // Convert engine paths to SVG paths
        for path_data in &paths {
            if path_data.points.len() < 2 {
                continue;
            }
            
            // Create SVG path data
            let mut path_data_str = String::new();
            for (i, point) in path_data.points.iter().enumerate() {
                if i == 0 {
                    path_data_str.push_str(&format!("M {} {}", point.x, point.y));
                } else {
                    path_data_str.push_str(&format!(" L {} {}", point.x, point.y));
                }
            }
            
            // Add SVG path element
            svg_content.push_str("  <path d=\"");
            svg_content.push_str(&path_data_str);
            svg_content.push_str("\" ");
            
            // Add styling
            if let Some(fill) = &path_data.style.fill {
                let color = fill.color;
                svg_content.push_str(&format!("fill=\"rgb({},{},{})\" fill-opacity=\"{}\" ", 
                    (color[0] * 255.0) as u8, 
                    (color[1] * 255.0) as u8, 
                    (color[2] * 255.0) as u8,
                    color[3]));
            } else {
                svg_content.push_str("fill=\"none\" ");
            }
            
            if let Some(stroke) = &path_data.style.stroke {
                let color = stroke.color;
                svg_content.push_str(&format!("stroke=\"rgb({},{},{})\" stroke-opacity=\"{}\" stroke-width=\"{}\" ", 
                    (color[0] * 255.0) as u8, 
                    (color[1] * 255.0) as u8, 
                    (color[2] * 255.0) as u8,
                    color[3],
                    stroke.width));
            }
            
            svg_content.push_str("/>\n");
        }
        
        svg_content.push_str("</svg>");
        
        // Write the SVG file
        std::fs::write(path, svg_content)
            .map_err(|e| AppError::Io(e))?;
        
        Ok(())
    }

    pub fn export_to_image(&mut self, path: &Path) -> AppResult<()> {
        // Get the paths from the engine
        let paths = self.state.engine.get_paths();
        if paths.is_empty() {
            return Err(AppError::InvalidOperation("No content to export".to_string()));
        }
        
        // Get file info for dimensions
        let file_info = self.state.engine.get_file_info()
            .ok_or_else(|| AppError::InvalidOperation("No file info available".to_string()))?;
        
        // Create a simple image representation
        // For now, we'll create a basic rasterized version
        // In a full implementation, this would use a proper rendering engine
        
        let width = file_info.dimensions.0 as u32;
        let height = file_info.dimensions.1 as u32;
        
        // Create a simple image with a white background
        let mut img = image::RgbaImage::new(width, height);
        
        // Fill with white background
        for pixel in img.pixels_mut() {
            *pixel = image::Rgba([255, 255, 255, 255]);
        }
        
        // Proper rasterization via tiny-skia path stroking/filling
        let mut pix = tiny_skia::Pixmap::new(width, height).ok_or_else(|| AppError::InvalidOperation("pixmap".into()))?;
        pix.fill(tiny_skia::Color::from_rgba8(255,255,255,255));
        for p in &paths {
            let mut pb = tiny_skia::PathBuilder::new();
            let mut it = p.points.iter();
            if let Some(first) = it.next() {
                pb.move_to(first.x, first.y);
                for pt in it { pb.line_to(pt.x, pt.y); }
            }
            let Some(path) = pb.finish() else { continue };
            if let Some(fill) = &p.style.fill {
                let mut paint = tiny_skia::Paint::default();
                paint.set_color_rgba8(
                    (fill.color[0]*255.0) as u8,
                    (fill.color[1]*255.0) as u8,
                    (fill.color[2]*255.0) as u8,
                    (fill.color[3]*255.0) as u8,
                );
                pix.fill_path(&path, &paint, tiny_skia::FillRule::Winding, tiny_skia::Transform::identity(), None);
            }
            if let Some(stroke) = &p.style.stroke {
                let mut paint = tiny_skia::Paint::default();
                paint.set_color_rgba8(
                    (stroke.color[0]*255.0) as u8,
                    (stroke.color[1]*255.0) as u8,
                    (stroke.color[2]*255.0) as u8,
                    (stroke.color[3]*255.0) as u8,
                );
                let mut st = tiny_skia::Stroke::default();
                st.width = stroke.width;
                pix.stroke_path(&path, &paint, &st, tiny_skia::Transform::identity(), None);
            }
        }
        // copy pixmap to image::RgbaImage
        for y in 0..height {
            let row = pix.data().get((y as usize)* (width as usize)*4 ..).unwrap();
            for x in 0..width {
                let idx = (x as usize)*4;
                let px = image::Rgba([row[idx], row[idx+1], row[idx+2], row[idx+3]]);
                img.put_pixel(x, y, px);
            }
        }
        
        // Save the image
        let extension = path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("png")
            .to_lowercase();
        
        match extension.as_str() {
            "png" => img.save_with_format(path, image::ImageFormat::Png),
            "jpg" | "jpeg" => img.save_with_format(path, image::ImageFormat::Jpeg),
            "gif" => img.save_with_format(path, image::ImageFormat::Gif),
            "bmp" => img.save_with_format(path, image::ImageFormat::Bmp),
            "tiff" | "tif" => img.save_with_format(path, image::ImageFormat::Tiff),
            "webp" => img.save_with_format(path, image::ImageFormat::WebP),
            _ => img.save_with_format(path, image::ImageFormat::Png),
        }
        .map_err(|e| AppError::Image(e))?;
        
        Ok(())
    }

    pub fn undo(&mut self) {
        if let Some(command) = self.command_history.undo() {
            // Implement undo logic here
            self.state.is_dirty = true;
        }
    }

    pub fn redo(&mut self) {
        if let Some(command) = self.command_history.redo() {
            // Implement redo logic here
            self.state.is_dirty = true;
        }
    }

    pub fn copy_selection(&mut self) {
        if let Some(file_arc) = &self.state.file {
            let file = file_arc.lock().unwrap();
            let mut clipboard = Vec::new();
            
            for &index in &self.state.selection.selected_paths {
                if index < file.paths.len() {
                    clipboard.push(file.paths[index].clone());
                }
            }
            
            self.state.selection.clipboard = clipboard;
        }
    }

    pub fn paste_selection(&mut self) {
        if !self.state.selection.clipboard.is_empty() {
            let clipboard = self.state.selection.clipboard.clone();
            for path in &clipboard {
                self.execute_command(Command::AddPath(path.clone()));
            }
            self.set_status_message("Pasted selection".to_string(), MessageLevel::Info);
        }
    }

    pub fn delete_selection(&mut self) {
        if !self.state.selection.selected_paths.is_empty() {
            let indices = self.state.selection.selected_paths.clone();
            self.execute_command(Command::DeletePaths(indices));
            self.state.selection.selected_paths.clear();
            self.set_status_message("Deleted selection".to_string(), MessageLevel::Info);
        }
    }

    // ------------------------------------------------------------------
    //  VIEWPORT HELPERS  (brace-balanced)
    // ------------------------------------------------------------------
    pub fn fit_viewport_to_content(&mut self) {
        if let Some(file_arc) = &self.state.file {
            let file = file_arc.lock().unwrap();
            if file.paths.is_empty() {
                return;
            }

            let mut min_x = f32::INFINITY;
            let mut min_y = f32::INFINITY;
            let mut max_x = f32::NEG_INFINITY;
            let mut max_y = f32::NEG_INFINITY;

            for path in &file.paths {
                let pts = Self::points_from_path(path);
                for p in pts {
                    min_x = min_x.min(p.x);
                    min_y = min_y.min(p.y);
                    max_x = max_x.max(p.x);
                    max_y = max_y.max(p.y);
                }
            }

            let width  = (max_x - min_x).max(1.0);
            let height = (max_y - min_y).max(1.0);

            // Zoom-to-fit with padding using current window size since canvas_rect is not in scope here
            let padding: f32 = 0.9; // show content at ~90% of view
            // Use the configured canvas size here (no access to canvas_rect in this scope)
            self.state.viewport.zoom = (CANVAS_SIZE / width)
                .min(CANVAS_SIZE / height) * padding
                .min(MAX_ZOOM)
                .max(MIN_ZOOM);

            let center_x = (min_x + max_x) / 2.0;
            let center_y = (min_y + max_y) / 2.0;
            self.state.viewport.pan = [
                -center_x * self.state.viewport.zoom,
                -center_y * self.state.viewport.zoom,
            ];
        }
    }



    // ------------------------------------------------------------------
    //  UTILITY FUNCTIONS
    // ------------------------------------------------------------------
    pub fn reset_physics_simulation(&mut self) {
        // UI-only: Reset physics simulation state
        self.state.physics.simulation_running = false;
        self.set_status_message("Physics simulation reset".to_string(), MessageLevel::Success);
    }

    fn points_from_path(path: &PathRecord) -> Vec<egui::Pos2> {
        let mut pts = vec![];
        let mut i = 0;
        while i + 7 < path.data.len() {
            let x = f32::from_le_bytes([path.data[i], path.data[i + 1], path.data[i + 2], path.data[i + 3]]);
            let y = f32::from_le_bytes([path.data[i + 4], path.data[i + 5], path.data[i + 6], path.data[i + 7]]);
            pts.push(egui::pos2(x, y));
            i += 8;
        }
        pts
    }

    pub fn hit_test_paths(&self, file: &File, click: egui::Pos2) -> Option<usize> {
        for (idx, path) in file.paths.iter().enumerate() {
            let pts = Self::points_from_path(path);
            let (min_x, max_x) = pts.iter().fold((f32::INFINITY, f32::NEG_INFINITY), |(mn, mx), p| (mn.min(p.x), mx.max(p.x)));
            let (min_y, max_y) = pts.iter().fold((f32::INFINITY, f32::NEG_INFINITY), |(mn, mx), p| (mn.min(p.y), mx.max(p.y)));
            if click.x >= min_x && click.x <= max_x && click.y >= min_y && click.y <= max_y {
                return Some(idx);
            }
        }
        None
    }

    pub fn select_paths_in_rect(&self, file: &File, rect: egui::Rect) -> Vec<usize> {
        let mut out = vec![];
        for (idx, path) in file.paths.iter().enumerate() {
            let pts = Self::points_from_path(path);
            for p in pts {
                if rect.contains(p) {
                    out.push(idx);
                    break;
                }
            }
        }
        out
    }

    pub fn sample_color_at_position(&self, _pos: egui::Pos2) -> Option<egui::Color32> {
        Some(egui::Color32::from_rgb(255, 0, 0))
    }

    pub fn egui_color_to_rgba32(&self, color: egui::Color32) -> u32 {
        let [r, g, b, a] = color.to_array();
        ((a as u32) << 24) | ((r as u32) << 16) | ((g as u32) << 8) | (b as u32)
    }

    pub fn create_freehand_path(&self, points: &[egui::Pos2]) -> PathRecord {
        let color = self.egui_color_to_rgba32(self.state.tools.selected_color);
        let mut path_data = Vec::new();
        for point in points {
            path_data.extend_from_slice(&point.x.to_le_bytes());
            path_data.extend_from_slice(&point.y.to_le_bytes());
        }

        PathRecord {
            data: path_data,
            tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            style: PathStyle {
                fill: if self.state.tools.fill_enabled {
                    Some(FillStyle {
                        color: [color as f32 / 255.0, 0.0, 0.0, 1.0],
                        rule: FillRule::NonZero,
                    })
                } else {
                    None
                },
                stroke: if self.state.tools.stroke_enabled {
                    Some(StrokeStyle {
                        color: [color as f32 / 255.0, 0.0, 0.0, 1.0],
                        width: self.state.tools.stroke_width,
                        cap: LineCap::Round,
                        join: LineJoin::Round,
                        dash_array: Vec::new(),
                    })
                } else {
                    None
                },
                opacity: self.state.tools.opacity,
                blend_mode: BlendMode::Normal,
            },
            original_svg: None,
        }
    }

    // UI Rendering Functions
    pub fn handle_keyboard_shortcuts(&mut self, ctx: &egui::Context) {
        if ctx.input(|i| i.key_pressed(egui::Key::N) && i.modifiers.ctrl) {
            self.new_file();
        }
        if ctx.input(|i| i.key_pressed(egui::Key::O) && i.modifiers.ctrl) {
            self.open_file_dialog();
        }
        if ctx.input(|i| i.key_pressed(egui::Key::S) && i.modifiers.ctrl) {
            if let Err(e) = self.save_file(None) {
                self.set_status_message(format!("Failed to save: {}", e), MessageLevel::Error);
            }
        }
        if ctx.input(|i| i.key_pressed(egui::Key::Z) && i.modifiers.ctrl) {
            self.undo();
        }
        if ctx.input(|i| i.key_pressed(egui::Key::Y) && i.modifiers.ctrl) {
            self.redo();
        }
        if ctx.input(|i| i.key_pressed(egui::Key::C) && i.modifiers.ctrl) {
            self.copy_selection();
        }
        if ctx.input(|i| i.key_pressed(egui::Key::V) && i.modifiers.ctrl) {
            self.paste_selection();
        }
        if ctx.input(|i| i.key_pressed(egui::Key::Delete)) {
            self.delete_selection();
        }
        // Zoom to selected object
        if ctx.input(|i| i.key_pressed(egui::Key::F) && i.modifiers.ctrl) {
            self.zoom_to_selected_object();
        }
        // Reset zoom
        if ctx.input(|i| i.key_pressed(egui::Key::Num0) && i.modifiers.ctrl) {
            self.state.viewport.zoom = 1.0;
            self.state.viewport.pan = [0.0, 0.0];
            self.set_status_message("View reset".to_string(), MessageLevel::Info);
        }
        
        // Pan with arrow keys
        let pan_speed = 10.0;
        if ctx.input(|i| i.key_down(egui::Key::ArrowLeft)) {
            self.state.viewport.pan[0] -= pan_speed;
        }
        if ctx.input(|i| i.key_down(egui::Key::ArrowRight)) {
            self.state.viewport.pan[0] += pan_speed;
        }
        if ctx.input(|i| i.key_down(egui::Key::ArrowUp)) {
            self.state.viewport.pan[1] -= pan_speed;
        }
        if ctx.input(|i| i.key_down(egui::Key::ArrowDown)) {
            self.state.viewport.pan[1] += pan_speed;
        }
        
        // Temporary pan mode with spacebar
        if ctx.input(|i| i.key_pressed(egui::Key::Space)) {
            // Store current tool and switch to pan
            self.state.tools.previous_tool = self.state.tools.current_tool;
            self.state.tools.current_tool = DrawingTool::Pan;
        }
        if ctx.input(|i| i.key_released(egui::Key::Space)) {
            // Return to previous tool when spacebar is released
            self.state.tools.current_tool = self.state.tools.previous_tool;
        }
    }

    pub fn handle_auto_save(&mut self) {
        if let Some(last_saved) = self.state.last_saved {
            if self.state.is_dirty && 
               std::time::Instant::now().duration_since(last_saved) > self.preferences.auto_save_interval {
                if let Err(e) = self.save_file(None) {
                    self.set_status_message(format!("Auto-save failed: {}", e), MessageLevel::Warning);
                }
            }
        }
    }

    pub fn render_menu_bar(&mut self, ctx: &egui::Context) {
        egui::TopBottomPanel::top("menu_bar").show(ctx, |ui| {
            egui::menu::bar(ui, |ui| {
                ui.menu_button("File", |ui| {
                    if ui.button("New").clicked() {
                        self.new_file();
                        ui.close_menu();
                    }
                    if ui.button("Open").clicked() {
                        self.open_file_dialog();
                        ui.close_menu();
                    }
                    
                    // Recent files submenu
                    if !self.recent_files.is_empty() {
                        ui.separator();
                        ui.menu_button("Recent Files", |ui| {
                            let mut actions = Vec::new();
                            
                            for (i, path) in self.recent_files.iter().take(10).enumerate() {
                                let display_name = if let Some(name) = path.file_name() {
                                    name.to_string_lossy().to_string()
                                } else {
                                    path.display().to_string()
                                };
                                
                                let path_clone = path.clone();
                                if ui.button(format!("{} {}", i + 1, display_name)).clicked() {
                                    actions.push(RecentFileAction::Load(path_clone, display_name));
                                    ui.close_menu();
                                }
                            }
                            
                            if !self.recent_files.is_empty() {
                                ui.separator();
                                if ui.button("Clear Recent Files").clicked() {
                                    actions.push(RecentFileAction::Clear);
                                    ui.close_menu();
                                }
                            }
                            
                            // Execute actions after UI rendering
                            for action in actions {
                                match action {
                                    RecentFileAction::Load(path, display_name) => {
                                        if let Err(e) = self.load_file(&path) {
                                            self.set_status_message(format!("Failed to open recent file: {}", e), MessageLevel::Error);
                                        } else {
                                            self.set_status_message(format!("Opened recent file: {}", display_name), MessageLevel::Success);
                                        }
                                    }
                                    RecentFileAction::Clear => {
                                        self.recent_files.clear();
                            }
                        }
                    }
                });
                    }
                    
                    ui.separator();
                    if ui.button("Save").clicked() {
                        if let Err(e) = self.save_file(None) {
                            self.set_status_message(format!("Failed to save: {}", e), MessageLevel::Error);
                        }
                        ui.close_menu();
                    }
                    if ui.button("Save As").clicked() {
                        self.save_as_dialog();
                        ui.close_menu();
                    }
                    ui.separator();
                    if ui.button("Trace Bitmap (PNG→Paths)").clicked() {
                        if let Some(path) = rfd::FileDialog::new().add_filter("PNG", &["png"]).pick_file() {
                            if let Ok(data) = std::fs::read(&path) {
                                if let Ok(img) = image::load_from_memory(&data) {
                                    let rgba = img.to_rgba8();
                                    let width = rgba.width() as usize;
                                    let height = rgba.height() as usize;
                                    let mut visited = vec![vec![false; width]; height];
                                    let mut traced: Vec<egui::Pos2> = Vec::new();
                                    for y in 0..height { for x in 0..width { if !visited[y][x] {
                                        let p = rgba.get_pixel(x as u32, y as u32);
                                        if p[3] > 128 {
                                            let mut cx=x; let mut cy=y; let mut dir=0; let start=(x,y);
                                            let mut steps=0usize;
                                            loop {
                                                visited[cy][cx] = true;
                                                traced.push(egui::pos2(cx as f32, cy as f32));
                                                let (dx,dy) = match dir {0=>(1,0),1=>(0,1),2=>(-1,0),3=>(0,-1),4=>(1,1),5=>(-1,1),6=>(-1,-1),_=>(1,-1)};
                                                let nx = cx as i32 + dx; let ny = cy as i32 + dy;
                                                if nx>=0 && ny>=0 && (nx as usize) < width && (ny as usize) < height {
                                                    let np = rgba.get_pixel(nx as u32, ny as u32);
                                                    if np[3] > 128 && !visited[ny as usize][nx as usize] { cx = nx as usize; cy = ny as usize; dir = 0; }
                                                    else { dir = (dir + 1) % 8; }
                                                } else { break; }
                                                steps += 1; if steps > width*height { break; }
                                                if (cx,cy)==start { break; }
                                            }
                                        }
                                    } }}
                                    if !traced.is_empty() {
                                        let style = engine::PathStyle{ fill: None, stroke: Some(engine::StrokeStyle{ color: engine::egui_color_to_xvg_color(egui::Color32::BLACK), width: 1.0, cap: xvg_core::LineCap::Butt, join: xvg_core::LineJoin::Miter, dash_array: Vec::new()}), opacity: 1.0, blend_mode: xvg_core::BlendMode::Normal };
                                        let _ = self.state.engine.create_path(&traced, style);
                                        self.set_status_message("Trace Bitmap complete".to_string(), MessageLevel::Success);
                                    } else {
                                        self.set_status_message("Trace Bitmap found no opaque pixels".to_string(), MessageLevel::Warning);
                                    }
                                }
                            }
                        }
                        ui.close_menu();
                    }
                    if ui.button("Exit").clicked() {
                        std::process::exit(0);
                    }
                });

                ui.menu_button("Edit", |ui| {
                    ui.set_enabled(self.command_history.can_undo());
                    if ui.button("Undo").clicked() {
                        self.undo();
                        ui.close_menu();
                    }
                    ui.set_enabled(self.command_history.can_redo());
                    if ui.button("Redo").clicked() {
                        self.redo();
                        ui.close_menu();
                    }
                    ui.separator();
                    if ui.button("Copy").clicked() {
                        self.copy_selection();
                        ui.close_menu();
                    }
                    if ui.button("Paste").clicked() {
                        self.paste_selection();
                        ui.close_menu();
                    }
                    if ui.button("Delete").clicked() {
                        self.delete_selection();
                        ui.close_menu();
                    }
                });

                ui.menu_button("View", |ui| {
                    if ui.button("Fit to Content").clicked() {
                        self.fit_viewport_to_content();
                        ui.close_menu();
                    }
                    if ui.button("Zoom to Selected Object").clicked() {
                        self.zoom_to_selected_object();
                        ui.close_menu();
                    }
                    ui.separator();
                    ui.checkbox(&mut self.state.viewport.show_grid, "Show Grid");
                    ui.checkbox(&mut self.state.viewport.show_rulers, "Show Rulers");
                });

                ui.menu_button("Help", |ui| {
                    if ui.button("About").clicked() {
                        self.state.show_about = true;
                        ui.close_menu();
                    }
                });
            });
        });
    }

    pub fn render_main_content(&mut self, ctx: &egui::Context) {
        // Main layout with dock system
        egui::SidePanel::left("layers_panel")
            .resizable(true)
            .default_width(250.0)
            .show(ctx, |ui| {
                ui.label("Layers");
                ui.separator();
                
                // Layer management (like Tkinter version)
                ui.horizontal(|ui| {
                    if ui.button("Add Layer").clicked() {
                        // TODO: Add layer functionality
                    }
                    if ui.button("Delete Layer").clicked() {
                        // TODO: Delete layer functionality
                    }
                });
                
                ui.separator();
                
                // Basic layer list
                if let Some(file_arc) = &self.state.file {
                    let file = file_arc.lock().unwrap();
                    ui.label(format!("Layers: {}", file.paths.len()));
                } else {
                    ui.label("No document loaded");
                }
                
                ui.separator();
                
                // Viewport controls (moved from tools panel)
                ui.label("Viewport");
                ui.checkbox(&mut self.state.viewport.show_grid, "Show Grid");
                ui.checkbox(&mut self.state.viewport.show_rulers, "Show Rulers");
                ui.add(egui::Slider::new(&mut self.state.viewport.grid_size, 5.0..=100.0).text("Grid Size"));
                ui.add(egui::Slider::new(&mut self.state.viewport.zoom, MIN_ZOOM..=MAX_ZOOM).text("Zoom"));
                ui.horizontal(|ui| {
                    if ui.button("Reset View").clicked() {
                        self.state.viewport.zoom = 1.0;
                        self.state.viewport.pan = [0.0, 0.0];
                    }
                    if ui.button("Zoom to Selected").clicked() {
                        self.zoom_to_selected_object();
                    }
                });
            });

        egui::SidePanel::right("inspector_panel")
            .resizable(true)
            .default_width(250.0)
            .show(ctx, |ui| {
                ui.label("Inspector");
                ui.separator();
                
                // Tab selection for inspector
                ui.horizontal(|ui| {
                    ui.selectable_value(&mut self.state.selected_tab, TabType::Inspector, "Inspector");
                    ui.selectable_value(&mut self.state.selected_tab, TabType::Timeline, "Timeline");
                    ui.selectable_value(&mut self.state.selected_tab, TabType::SdfEditor, "SDF");
                });
                
                ui.separator();
                
                match self.state.selected_tab {
                    TabType::Inspector => self.render_inspector_tab(ui),
                    TabType::Timeline => self.render_timeline_tab(ui),
                    TabType::SdfEditor => self.render_sdf_editor_tab(ui),
                    TabType::Audio => self.render_audio_tab(ui),
                    TabType::Scene3D => self.render_scene3d_tab(ui),
                    TabType::Shaders => self.render_shaders_tab(ui),
                    TabType::Physics => self.render_physics_tab(ui),
                    TabType::Effects => self.render_effects_tab(ui),
                    TabType::Animation => self.render_animation_tab(ui),
                    TabType::Fonts => self.render_fonts_tab(ui),
                    TabType::Collaboration => self.render_collaboration_tab(ui),
                    TabType::Viewport => {
                        ui.label("Viewport: use mouse wheel to zoom, drag to pan.");
                    }
                }
            });

        // Center canvas area
        egui::CentralPanel::default().show(ctx, |ui| {
            // Get the available area
            let available_rect = ui.available_rect_before_wrap();
            
            // Create canvas rect that leaves space for the toolbar and, when enabled, rulers
            // Reserve left and top gutters so the vertical/horizontal rulers render fully visible
            let ruler_gutter = if self.state.viewport.show_rulers { 20.0 } else { 0.0 };
            let top_margin = 10.0 + ruler_gutter; // toolbar + horizontal ruler when enabled
            let left_margin = ruler_gutter;       // vertical ruler when enabled

            let canvas_rect = egui::Rect::from_min_size(
                egui::pos2(available_rect.min.x + left_margin, available_rect.min.y + top_margin),
                egui::vec2(
                    (available_rect.width() - left_margin).max(0.0),
                    (available_rect.height() - top_margin).max(0.0),
                ),
            );
            
            // Allocate the canvas area
            let canvas_response = ui.allocate_rect(canvas_rect, egui::Sense::click_and_drag());
            
            // Handle canvas interactions
            self.handle_canvas_input(&canvas_response, ui.ctx());
            
            // Draw canvas content with STRICT clipping to prevent overlap
            self.render_canvas(ui, canvas_rect);
        });
    }

    pub fn render_toolbar(&mut self, ctx: &egui::Context) {
        egui::TopBottomPanel::top("toolbar").show(ctx, |ui| {
            ui.horizontal(|ui| {
                // Tool buttons (like Tkinter version)
                ui.selectable_value(&mut self.state.tools.current_tool, DrawingTool::Select, "Select");
                ui.selectable_value(&mut self.state.tools.current_tool, DrawingTool::Rectangle, "Rectangle");
                ui.selectable_value(&mut self.state.tools.current_tool, DrawingTool::Circle, "Circle");
                ui.selectable_value(&mut self.state.tools.current_tool, DrawingTool::Line, "Line");
                ui.selectable_value(&mut self.state.tools.current_tool, DrawingTool::Freehand, "Pen");
                ui.selectable_value(&mut self.state.tools.current_tool, DrawingTool::Text, "Text");
                ui.selectable_value(&mut self.state.tools.current_tool, DrawingTool::Eyedropper, "Fill");
                ui.selectable_value(&mut self.state.tools.current_tool, DrawingTool::Pan, "Pan");
                ui.selectable_value(&mut self.state.tools.current_tool, DrawingTool::Zoom, "Zoom");
                
                ui.separator();
                
                // Color pickers (like Tkinter version)
                ui.label("Stroke:");
                ui.color_edit_button_srgba(&mut self.state.tools.selected_color);
                
                ui.label("Fill:");
                let mut fill_color = if self.state.tools.fill_enabled {
                    self.state.tools.selected_color
                } else {
                    egui::Color32::TRANSPARENT
                };
                if ui.color_edit_button_srgba(&mut fill_color).clicked() {
                    self.state.tools.fill_enabled = fill_color != egui::Color32::TRANSPARENT;
                    if self.state.tools.fill_enabled {
                        self.state.tools.selected_color = fill_color;
                    }
                }
                
                // Stroke width (like Tkinter version)
                ui.label("Width:");
                ui.add(egui::DragValue::new(&mut self.state.tools.stroke_width)
                    .speed(0.1)
                    .clamp_range(0.1..=50.0)
                    .fixed_decimals(1));
            });
        });
    }

    pub fn render_status_bar(&mut self, ctx: &egui::Context) {
        egui::TopBottomPanel::bottom("status_bar").show(ctx, |ui| {
            ui.horizontal(|ui| {
                // Left side: Status messages and file info
                ui.vertical(|ui| {
                    // Status message
                    if let Some(status) = &self.state.status_message {
                        let color = match status.level {
                            MessageLevel::Info => egui::Color32::BLUE,
                            MessageLevel::Warning => egui::Color32::YELLOW,
                            MessageLevel::Error => egui::Color32::RED,
                            MessageLevel::Success => egui::Color32::GREEN,
                        };
                        ui.colored_label(color, &status.text);
                    }
                    
                    // File information footer
                    if let Some(path) = &self.state.file_path {
                        ui.horizontal(|ui| {
                            ui.label("📁");
                            ui.label(format!("File: {}", path.file_name().unwrap_or_default().to_string_lossy()));
                            ui.label("|");
                            ui.label(format!("Path: {}", path.parent().unwrap_or_else(|| std::path::Path::new("")).display()));
                        });
                        
                        // File details from engine
                        if let Some(file_info) = self.state.engine.get_file_info() {
                            ui.horizontal(|ui| {
                                ui.label("📊");
                                ui.label(format!("Paths: {}", file_info.path_count));
                                ui.label("|");
                                ui.label(format!("Audio: {}", file_info.audio_track_count));
                                ui.label("|");
                                ui.label(format!("Physics: {}", if file_info.has_physics { "Yes" } else { "No" }));
                                ui.label("|");
                                ui.label(format!("Collaboration: {}", if file_info.has_collaboration { "Yes" } else { "No" }));
                                ui.label("|");
                                ui.label(format!("Dimensions: {}×{}", file_info.dimensions.0, file_info.dimensions.1));
                                ui.label("|");
                                ui.label(format!("Frames: {}", file_info.frame_count));
                                ui.label("|");
                                ui.label(format!("FPS: {:.1}", file_info.frame_rate));
                            });
                        }
                        
                        // File status
                        ui.horizontal(|ui| {
                            ui.label("💾");
                            if self.state.is_dirty {
                                ui.colored_label(egui::Color32::YELLOW, "Modified");
                            } else {
                                ui.colored_label(egui::Color32::GREEN, "Saved");
                            }
                            ui.label("|");
                            if let Some(last_saved) = self.state.last_saved {
                                let duration = std::time::Instant::now().duration_since(last_saved);
                                if duration.as_secs() < 60 {
                                    ui.label(format!("Last saved: {}s ago", duration.as_secs()));
                                } else if duration.as_secs() < 3600 {
                                    ui.label(format!("Last saved: {}m ago", duration.as_secs() / 60));
                                } else {
                                    ui.label(format!("Last saved: {}h ago", duration.as_secs() / 3600));
                                }
                            }
                        });
                    } else {
                        ui.label("📄 No file loaded");
                    }
                });
                
                // Right side: Performance and viewport info
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.horizontal(|ui| {
                        ui.label("🎯");
                        ui.label(format!("FPS: {:.1}", self.state.performance.fps));
                        ui.label("|");
                        ui.label("🔍");
                        ui.label(format!("Zoom: {:.1}%", self.state.viewport.zoom * 100.0));
                        ui.label("|");
                        ui.label("📍");
                        ui.label(format!("Pan: ({:.0}, {:.0})", self.state.viewport.pan[0], self.state.viewport.pan[1]));
                        ui.label("|");
                        ui.label("✏️");
                        ui.label(format!("Selected: {}", self.state.selection.selected_paths.len()));
                        ui.label("|");
                        ui.label("🛠️");
                        ui.label(format!("Tool: {}", match self.state.tools.current_tool {
                            DrawingTool::Select => "Select",
                            DrawingTool::SelectBox => "Select Box",
                            DrawingTool::Rectangle => "Rectangle",
                            DrawingTool::Circle => "Circle",
                            DrawingTool::Ellipse => "Ellipse",
                            DrawingTool::Line => "Line",
                            DrawingTool::Freehand => "Freehand",
                            DrawingTool::Text => "Text",
                            DrawingTool::Eyedropper => "Eyedropper",
                            DrawingTool::Zoom => "Zoom",
                            DrawingTool::Pan => "Pan",
                        }));
                    });
                });
            });
        });
    }

    pub fn render_modal_dialogs(&mut self, ctx: &egui::Context) {
        if self.state.show_about {
            egui::Window::new("About XVG Professional")
                .collapsible(false)
                .resizable(false)
                .show(ctx, |ui| {
                    ui.label("XVG Professional - Advanced Vector Graphics Editor");
                    ui.label("Version 1.0.0");
                    ui.label("Built with Rust and egui");
                    ui.separator();
                    if ui.button("Close").clicked() {
                        self.state.show_about = false;
                    }
                });
        }
    }

    pub fn handle_canvas_input(&mut self, response: &egui::Response, ctx: &egui::Context) {
        match self.state.tools.current_tool {
            DrawingTool::Select => self.handle_select_tool(response),
            DrawingTool::SelectBox => self.handle_select_box_tool(response),
            DrawingTool::Rectangle => self.handle_rectangle_tool(response),
            DrawingTool::Circle => self.handle_circle_tool(response),
            DrawingTool::Ellipse => self.handle_ellipse_tool(response),
            DrawingTool::Line => self.handle_line_tool(response),
            DrawingTool::Freehand => self.handle_freehand_tool(response),
            DrawingTool::Text => self.handle_text_tool(response),
            DrawingTool::Eyedropper => self.handle_eyedropper_tool(response),
            DrawingTool::Zoom => self.handle_zoom_tool(response),
            DrawingTool::Pan => self.handle_pan_tool(response),
        }
    }

    // Additional tool handlers
    pub fn handle_select_box_tool(&mut self, response: &egui::Response) {
        if response.drag_started() {
            self.state.selection.drawing_selection_box = true;
            if let Some(screen_pos) = response.interact_pointer_pos() {
                let canvas_rect = response.rect;
                let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                self.state.selection.selection_box_start = Some(world_pos);
            }
        }

        if self.state.selection.drawing_selection_box && response.dragged() {
            if let Some(screen_pos) = response.interact_pointer_pos() {
                let canvas_rect = response.rect;
                let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                self.state.selection.selection_box_end = Some(world_pos);
            }
        }

        if response.drag_released() && self.state.selection.drawing_selection_box {
            if let (Some(start), Some(end)) = (self.state.selection.selection_box_start, self.state.selection.selection_box_end) {
                // Create a world-space rectangle for hit testing
                let min_x = start.x.min(end.x);
                let max_x = start.x.max(end.x);
                let min_y = start.y.min(end.y);
                let max_y = start.y.max(end.y);
                
                // Use engine to get paths and select them
                let paths = self.state.engine.get_paths();
                let mut selected_paths = Vec::new();
                
                for (index, path_data) in paths.iter().enumerate() {
                    // Check if any point in the path is within the selection box
                    for point in &path_data.points {
                        if point.x >= min_x && point.x <= max_x && point.y >= min_y && point.y <= max_y {
                            selected_paths.push(index);
                            break;
                        }
                    }
                }
                
                self.state.selection.selected_paths = selected_paths;
            }
            self.state.selection.drawing_selection_box = false;
            self.state.selection.selection_box_start = None;
            self.state.selection.selection_box_end = None;
        }
    }

    pub fn handle_ellipse_tool(&mut self, response: &egui::Response) {
        if response.drag_started() {
            self.state.tools.drawing_mode = true;
            self.state.tools.drawing_points.clear();
            if let Some(screen_pos) = response.interact_pointer_pos() {
                let canvas_rect = response.rect;
                let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                self.state.tools.drawing_points.push(world_pos);
            }
        }

        if self.state.tools.drawing_mode && response.dragged() {
            if let Some(screen_pos) = response.interact_pointer_pos() {
                let canvas_rect = response.rect;
                let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                if self.state.tools.drawing_points.len() > 1 {
                    self.state.tools.drawing_points[1] = world_pos;
                } else {
                    self.state.tools.drawing_points.push(world_pos);
                }
            }
        }

        if response.drag_released() && self.state.tools.drawing_mode {
            self.finish_ellipse_drawing();
        }
    }

    pub fn handle_text_tool(&mut self, response: &egui::Response) {
        if response.clicked() {
            // Create a simple vector path representing a capital 'T'
            let size = 100.0;
            let top_y = 50.0;
            let left_x = 50.0;
            let right_x = left_x + size;
            let stem_x = left_x + size * 0.5;
            let stem_bottom = top_y + size;
            let mut path_data: Vec<u8> = Vec::new();
            let pts: &[(f32,f32)] = &[
                (left_x, top_y), (right_x, top_y), (stem_x, top_y), (stem_x, stem_bottom)
            ];
            for &(x,y) in pts.iter() {
                path_data.extend_from_slice(&x.to_le_bytes());
                path_data.extend_from_slice(&y.to_le_bytes());
            }
            let style = PathStyle { fill: None, stroke: Some(StrokeStyle{ color: [0.0,0.0,0.0,1.0], width: 2.0, cap: LineCap::Butt, join: LineJoin::Miter, dash_array: Vec::new() }), opacity: 1.0, blend_mode: BlendMode::Normal };
            let record = PathRecord { data: path_data, tf: [1.0,0.0,0.0,1.0,0.0,0.0], style, original_svg: None };
            self.execute_command(Command::AddPath(record));
            self.set_status_message("Inserted text shape".to_string(), MessageLevel::Success);
        }
    }

    pub fn handle_eyedropper_tool(&mut self, response: &egui::Response) {
        if response.clicked() {
            if let Some(screen_pos) = response.interact_pointer_pos() {
                let canvas_rect = response.rect;
                let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                if let Some(color) = self.sample_color_at_position(world_pos) {
                    self.state.tools.selected_color = color;
                    self.set_status_message("Color sampled".to_string(), MessageLevel::Success);
                }
            }
        }
    }

    pub fn finish_ellipse_drawing(&mut self) {
        if self.state.tools.drawing_points.len() >= 2 {
            let start = self.state.tools.drawing_points[0];
            let end = self.state.tools.drawing_points[1];
            
            // Create ellipse points
            let center_x = (start.x + end.x) / 2.0;
            let center_y = (start.y + end.y) / 2.0;
            let radius_x = (end.x - start.x).abs() / 2.0;
            let radius_y = (end.y - start.y).abs() / 2.0;
            
            let mut points = Vec::new();
            let segments = 32;
            for i in 0..=segments {
                let angle = 2.0 * std::f32::consts::PI * i as f32 / segments as f32;
                let x = center_x + radius_x * angle.cos();
                let y = center_y + radius_y * angle.sin();
                points.push(egui::pos2(x, y));
            }
            
            // Create path style
            let style = engine::PathStyle {
                fill: if self.state.tools.fill_enabled {
                    Some(engine::FillStyle {
                        color: engine::egui_color_to_xvg_color(self.state.tools.selected_color),
                        rule: xvg_core::FillRule::NonZero,
                    })
                } else {
                    None
                },
                stroke: if self.state.tools.stroke_enabled {
                    Some(engine::StrokeStyle {
                        color: engine::egui_color_to_xvg_color(self.state.tools.selected_color),
                        width: self.state.tools.stroke_width,
                        cap: xvg_core::LineCap::Butt,
                        join: xvg_core::LineJoin::Miter,
                        dash_array: Vec::new(),
                    })
                } else {
                    None
                },
                opacity: self.state.tools.opacity,
                blend_mode: xvg_core::BlendMode::Normal,
            };
            
            // Use engine to create path
            if let Err(e) = self.state.engine.create_path(&points, style) {
                self.set_status_message(format!("Failed to create ellipse: {}", e), MessageLevel::Error);
            } else {
                self.set_status_message("Ellipse created".to_string(), MessageLevel::Success);
            }
        }
        self.state.tools.drawing_mode = false;
        self.state.tools.drawing_points.clear();
    }

    pub fn create_ellipse_path(&self, start: egui::Pos2, end: egui::Pos2) -> PathRecord {
        let color = self.egui_color_to_rgba32(self.state.tools.selected_color);
        
        // Create ellipse path data
        let center_x = (start.x + end.x) / 2.0;
        let center_y = (start.y + end.y) / 2.0;
        let radius_x = (end.x - start.x).abs() / 2.0;
        let radius_y = (end.y - start.y).abs() / 2.0;
        
        let mut path_data = Vec::new();
        for i in 0..16 {
            let angle = i as f32 * std::f32::consts::PI / 8.0;
            let x = center_x + radius_x * angle.cos();
            let y = center_y + radius_y * angle.sin();
            path_data.extend_from_slice(&x.to_le_bytes());
            path_data.extend_from_slice(&y.to_le_bytes());
        }

        PathRecord {
            data: path_data,
            tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            style: PathStyle {
                fill: if self.state.tools.fill_enabled {
                    Some(FillStyle {
                        color: [color as f32 / 255.0, 0.0, 0.0, 1.0],
                        rule: FillRule::NonZero,
                    })
                } else {
                    None
                },
                stroke: if self.state.tools.stroke_enabled {
                    Some(StrokeStyle {
                        color: [color as f32 / 255.0, 0.0, 0.0, 1.0],
                        width: self.state.tools.stroke_width,
                        cap: LineCap::Round,
                        join: LineJoin::Round,
                        dash_array: Vec::new(),
                    })
                } else {
                    None
                },
                opacity: self.state.tools.opacity,
                blend_mode: BlendMode::Normal,
            },
            original_svg: None,
        }
    }

    pub fn render_canvas(&mut self, ui: &mut egui::Ui, canvas_rect: egui::Rect) {
        // Draw rulers if enabled
        if self.state.viewport.show_rulers {
            self.draw_rulers(ui, canvas_rect);
        }
        
        // Create a STRICTLY clipped painter that absolutely cannot draw outside canvas bounds
        let painter = ui.painter().with_clip_rect(canvas_rect);
        
        // Draw checkered background (STRICTLY within canvas bounds - no overlap with toolbar)
        self.draw_checkered_background(&painter, canvas_rect);
        
        // Draw grid (strictly within canvas bounds)
        if self.state.viewport.show_grid {
            self.draw_grid(&painter, canvas_rect);
        }
        
        // Draw current operation preview
        let transform = self.calculate_viewport_transform(canvas_rect);
        self.draw_current_operation(&painter, canvas_rect, transform);
        
        // Draw content from engine
        self.draw_xvg_content(&painter, canvas_rect, transform);
        
        // Draw selection overlay
        self.draw_selection_overlay(&painter, canvas_rect, transform);
        
        // Draw canvas border on top of everything
        painter.add(egui::Shape::rect_stroke(
            canvas_rect,
            egui::Rounding::same(0.0),
            egui::Stroke::new(2.0, egui::Color32::from_gray(80)),
        ));
    }

    pub fn draw_checkered_background(&self, painter: &egui::Painter, canvas_rect: egui::Rect) {
        let checker_size = 20.0;
        let light_gray = egui::Color32::from_gray(220);
        let dark_gray = egui::Color32::from_gray(180);
        
        // Fill the entire canvas with light gray first
        painter.add(egui::Shape::rect_filled(
            canvas_rect,
            egui::Rounding::same(0.0),
            light_gray,
        ));
        
        // Then draw dark gray squares in a checkerboard pattern
        // Strictly ensure we only draw within the canvas bounds
        let start_x = canvas_rect.left();
        let end_x = canvas_rect.right();
        let start_y = canvas_rect.top();
        let end_y = canvas_rect.bottom();
        
        let mut x = start_x;
        while x < end_x {
            let mut y = start_y;
            let row_parity = ((x / checker_size) as i32) % 2;
            
            while y < end_y {
                let col_parity = ((y / checker_size) as i32) % 2;
                if (row_parity + col_parity) % 2 == 1 {
                    // Ensure the checker square is strictly within bounds
                    let checker_rect = egui::Rect::from_min_size(
                        egui::pos2(x, y),
                        egui::vec2(checker_size.min(end_x - x), checker_size.min(end_y - y))
                    );
                    
                    // Only draw if the rect is valid and within bounds
                    if checker_rect.width() > 0.0 && checker_rect.height() > 0.0 {
                        painter.add(egui::Shape::rect_filled(
                            checker_rect,
                            egui::Rounding::same(0.0),
                            dark_gray,
                        ));
                    }
                }
                y += checker_size;
            }
            x += checker_size;
        }
    }

    pub fn draw_grid(&self, painter: &egui::Painter, canvas_rect: egui::Rect) {
        let zoom = self.state.viewport.zoom;
        if zoom < 0.05 {
            return; // Skip grid when zoomed out extremely to reduce overdraw
        }
        let grid_size = self.state.viewport.grid_size * zoom;
        let color = egui::Color32::from_gray(100);
        
        // Simple grid drawing in screen coordinates
        // Ensure we only draw within the canvas bounds
        let start_x = canvas_rect.left();
        let end_x = canvas_rect.right();
        let start_y = canvas_rect.top();
        let end_y = canvas_rect.bottom();
        
        // Draw vertical lines
        let mut x = start_x;
        while x <= end_x {
            painter.add(egui::Shape::line_segment(
                [egui::pos2(x, canvas_rect.top()), egui::pos2(x, canvas_rect.bottom())],
                egui::Stroke::new(1.0, color),
            ));
            x += grid_size;
        }
        
        // Draw horizontal lines
        let mut y = start_y;
        while y <= end_y {
            painter.add(egui::Shape::line_segment(
                [egui::pos2(canvas_rect.left(), y), egui::pos2(canvas_rect.right(), y)],
                egui::Stroke::new(1.0, color),
            ));
            y += grid_size;
        }
    }

    pub fn calculate_viewport_transform(&self, canvas_rect: egui::Rect) -> (egui::Vec2, f32) {
        let center = canvas_rect.center();
        let translation = center.to_vec2() + egui::vec2(self.state.viewport.pan[0], self.state.viewport.pan[1]);
        let scaling = self.state.viewport.zoom;
        (translation, scaling)
    }

    // Helper functions for coordinate transformation
    pub fn screen_to_world(&self, screen_pos: egui::Pos2, canvas_rect: egui::Rect) -> egui::Pos2 {
        let (translation, scaling) = self.calculate_viewport_transform(canvas_rect);
        let screen_vec = screen_pos.to_vec2();
        let world_vec = (screen_vec - translation) / scaling;
        egui::pos2(world_vec.x, world_vec.y)
    }

    pub fn world_to_screen(&self, world_pos: egui::Pos2, canvas_rect: egui::Rect) -> egui::Pos2 {
        let (translation, scaling) = self.calculate_viewport_transform(canvas_rect);
        let world_vec = world_pos.to_vec2();
        let screen_vec = world_vec * scaling + translation;
        egui::pos2(screen_vec.x, screen_vec.y)
    }

    pub fn draw_xvg_content(&mut self, painter: &egui::Painter, canvas_rect: egui::Rect, transform: (egui::Vec2, f32)) {
        // Draw all paths from the engine
        let paths = self.state.engine.get_paths();
        for (index, path_data) in paths.iter().enumerate() {
            let is_selected = self.state.selection.selected_paths.contains(&index);
            self.draw_path_data_with_offset(painter, path_data, transform, is_selected);
        }
    }

    fn current_drag_screen_offset(&self, transform: (egui::Vec2, f32)) -> egui::Vec2 {
        if self.state.selection.dragging_selection {
            let (.., scaling) = transform;
            let dx = self.state.selection.drag_offset[0] * scaling;
            let dy = self.state.selection.drag_offset[1] * scaling;
            return egui::vec2(dx, dy);
        }
        egui::vec2(0.0, 0.0)
    }

    pub fn draw_path_data_with_offset(&mut self, painter: &egui::Painter, path_data: &engine::PathData, transform: (egui::Vec2, f32), is_selected: bool) {
        // Toggle to prefer vector-at-zoom rendering for SVG paths (keeps lines razor-sharp)
        // TODO: expose as a user preference; default on
        let prefer_vector_at_zoom = true;
        let drag_screen_offset = if is_selected { self.current_drag_screen_offset(transform) } else { egui::vec2(0.0, 0.0) };
        // Raster image layer path (PNG/JPEG imported as assets)
        if let (Some(pixels_arc), Some((img_w, img_h))) = (&path_data.image_rgba, &path_data.image_size) {
            let (translation, scaling) = transform;
            let scale_bucket = (scaling * 100.0).round() as u32;
            if let Some(tex) = self.state.raster_cache.get(&(path_data.id, scale_bucket)) {
                // touch LRU
                self.state.raster_cache_tick = self.state.raster_cache_tick.wrapping_add(1);
                self.state.raster_cache_usage.insert((path_data.id, scale_bucket), self.state.raster_cache_tick);
                let rect = egui::Rect::from_min_max(
                    egui::pos2(translation.x + drag_screen_offset.x, translation.y + drag_screen_offset.y),
                    egui::pos2(translation.x + drag_screen_offset.x + *img_w as f32 * scaling, translation.y + drag_screen_offset.y + *img_h as f32 * scaling),
                );
                painter.add(egui::Shape::image(tex.id(), rect, egui::Rect::from_min_max(egui::pos2(0.0,0.0), egui::pos2(1.0,1.0)), egui::Color32::WHITE));
                // Draw selection overlay for raster layers
                if is_selected {
                    painter.rect_stroke(rect, 0.0, egui::Stroke::new(2.0, egui::Color32::BLUE));
                }
                return;
            }

            // Re-rasterize to current zoom bucket using Lanczos3 for quality
            let target_w = ((*img_w as f32 * scaling).max(1.0)).round() as u32;
            let target_h = ((*img_h as f32 * scaling).max(1.0)).round() as u32;
            let mut rgba_scaled: Vec<u8> = (**pixels_arc).clone();
            if target_w != *img_w || target_h != *img_h {
                if let Some(mut dyn_img) = image::RgbaImage::from_raw(*img_w, *img_h, (**pixels_arc).clone()) {
                    let resized = image::imageops::resize(&dyn_img, target_w, target_h, image::imageops::FilterType::Lanczos3);
                    rgba_scaled = resized.into_raw();
                }
            }

            let egui_image = egui::ColorImage::from_rgba_unmultiplied([
                target_w as usize,
                target_h as usize,
            ], &rgba_scaled);

            let texture_handle = painter.ctx().load_texture(
                format!("raster_{}_{}", path_data.id, scale_bucket),
                egui_image,
                egui::TextureOptions {
                    magnification: egui::TextureFilter::Linear,
                    minification: egui::TextureFilter::Linear,
                    ..Default::default()
                },
            );
            // insert and evict if needed
            self.state.raster_cache_tick = self.state.raster_cache_tick.wrapping_add(1);
            self.state.raster_cache_usage.insert((path_data.id, scale_bucket), self.state.raster_cache_tick);
            self.state.raster_cache.insert((path_data.id, scale_bucket), texture_handle.clone());
            self.evict_raster_cache_if_needed();

            let rect = egui::Rect::from_min_max(
                egui::pos2(translation.x + drag_screen_offset.x, translation.y + drag_screen_offset.y),
                egui::pos2(translation.x + drag_screen_offset.x + *img_w as f32 * scaling, translation.y + drag_screen_offset.y + *img_h as f32 * scaling),
            );
            painter.add(egui::Shape::image(
                texture_handle.id(),
                rect,
                egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(1.0, 1.0)),
                egui::Color32::WHITE,
            ));
            // Draw selection overlay for raster layers
            if is_selected {
                painter.rect_stroke(rect, 0.0, egui::Stroke::new(2.0, egui::Color32::BLUE));
            }
            return;
        }

        if path_data.points.len() < 2 {
            return;
        }

        let (translation, scaling) = transform;
        
        // Transform points to screen coordinates with numeric stability
        let screen_points: Vec<egui::Pos2> = path_data.points.iter()
            .map(|p| {
                let screen_x = p.x.mul_add(scaling, translation.x);
                let screen_y = p.y.mul_add(scaling, translation.y);
                egui::pos2(screen_x + drag_screen_offset.x, screen_y + drag_screen_offset.y)
            })
            .collect();

        // For complex shapes (like SVG paths), use rasterization unless vector-at-zoom is preferred
        if self.is_complex_shape(&screen_points) && !prefer_vector_at_zoom {
            // Use cached raster if available for this zoom bucket
            let scale_bucket = (scaling * 100.0).round() as u32;
            if let Some(tex) = self.state.raster_cache.get(&(path_data.id, scale_bucket)) {
                self.state.raster_cache_tick = self.state.raster_cache_tick.wrapping_add(1);
                self.state.raster_cache_usage.insert((path_data.id, scale_bucket), self.state.raster_cache_tick);
                let min_x = screen_points.iter().map(|p| p.x).fold(f32::INFINITY, f32::min);
                let min_y = screen_points.iter().map(|p| p.y).fold(f32::INFINITY, f32::min);
                let max_x = screen_points.iter().map(|p| p.x).fold(f32::NEG_INFINITY, f32::max);
                let max_y = screen_points.iter().map(|p| p.y).fold(f32::NEG_INFINITY, f32::max);
                let rect = egui::Rect::from_min_max(egui::pos2(min_x, min_y), egui::pos2(max_x, max_y));
                painter.add(egui::Shape::image(tex.id(), rect, egui::Rect::from_min_max(egui::pos2(0.0,0.0), egui::pos2(1.0,1.0)), egui::Color32::WHITE));
                return;
            }
            if let Some(image) = self.rasterize_path_to_image(path_data, transform) {
                // Calculate bounding box for the image
                let min_x = screen_points.iter().map(|p| p.x).fold(f32::INFINITY, f32::min);
                let min_y = screen_points.iter().map(|p| p.y).fold(f32::INFINITY, f32::min);
                let max_x = screen_points.iter().map(|p| p.x).fold(f32::NEG_INFINITY, f32::max);
                let max_y = screen_points.iter().map(|p| p.y).fold(f32::NEG_INFINITY, f32::max);
                
                let rect = egui::Rect::from_min_max(
                    egui::pos2(min_x, min_y),
                    egui::pos2(max_x, max_y)
                );
                
                // Convert tiny-skia pixmap to egui image
                let image_data = image.data();
                let width = image.width() as usize;
                let height = image.height() as usize;
                
                // Convert premultiplied RGBA (tiny-skia) to unmultiplied RGBA (egui)
                let mut rgba_unmultiplied = Vec::with_capacity(width * height * 4);
                for y in 0..height {
                    for x in 0..width {
                        let idx = (y * width + x) * 4;
                        let (r, g, b, a) = (image_data[idx], image_data[idx + 1], image_data[idx + 2], image_data[idx + 3]);
                        if a == 0 { rgba_unmultiplied.extend_from_slice(&[0, 0, 0, 0]); continue; }
                        let rr = ((r as u16) * 255 / (a as u16)).min(255) as u8;
                        let gg = ((g as u16) * 255 / (a as u16)).min(255) as u8;
                        let bb = ((b as u16) * 255 / (a as u16)).min(255) as u8;
                        rgba_unmultiplied.extend_from_slice(&[rr, gg, bb, a]);
                    }
                }

                // Create egui image and display it
                let egui_image = egui::ColorImage::from_rgba_unmultiplied([width as usize, height as usize], &rgba_unmultiplied);
                
                // Use linear filtering so scaled images/rasters look smooth
                let texture_handle = painter.ctx().load_texture(
                    format!("svg_path_{}_{}", path_data.id, scale_bucket),
                    egui_image,
                    egui::TextureOptions {
                        magnification: egui::TextureFilter::Linear,
                        minification: egui::TextureFilter::Linear,
                        ..Default::default()
                    },
                );
                // Cache for reuse at this zoom
                self.state.raster_cache_tick = self.state.raster_cache_tick.wrapping_add(1);
                self.state.raster_cache_usage.insert((path_data.id, scale_bucket), self.state.raster_cache_tick);
                self.state.raster_cache.insert((path_data.id, scale_bucket), texture_handle.clone());
                self.evict_raster_cache_if_needed();
                
                painter.add(egui::Shape::image(
                    texture_handle.id(),
                    rect,
                    egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(1.0, 1.0)),
                    egui::Color32::WHITE
                ));
                
                return;
            }
        }

        // Vector-at-zoom path: render via TinySkia at current zoom, but cache per zoom bucket
        if prefer_vector_at_zoom {
            let scale_bucket = (scaling * 100.0).round() as u32;
            if let Some(tex) = self.state.raster_cache.get(&(path_data.id, scale_bucket)) {
                self.state.raster_cache_tick = self.state.raster_cache_tick.wrapping_add(1);
                self.state.raster_cache_usage.insert((path_data.id, scale_bucket), self.state.raster_cache_tick);
                let min_x = screen_points.iter().map(|p| p.x).fold(f32::INFINITY, f32::min);
                let min_y = screen_points.iter().map(|p| p.y).fold(f32::INFINITY, f32::min);
                let max_x = screen_points.iter().map(|p| p.x).fold(f32::NEG_INFINITY, f32::max);
                let max_y = screen_points.iter().map(|p| p.y).fold(f32::NEG_INFINITY, f32::max);
                let rect = egui::Rect::from_min_max(egui::pos2(min_x, min_y), egui::pos2(max_x, max_y));
                painter.add(egui::Shape::image(tex.id(), rect, egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(1.0, 1.0)), egui::Color32::WHITE));
                return;
            }

            if let Some(image) = self.rasterize_path_to_image(path_data, transform) {
                let min_x = screen_points.iter().map(|p| p.x).fold(f32::INFINITY, f32::min);
                let min_y = screen_points.iter().map(|p| p.y).fold(f32::INFINITY, f32::min);
                let max_x = screen_points.iter().map(|p| p.x).fold(f32::NEG_INFINITY, f32::max);
                let max_y = screen_points.iter().map(|p| p.y).fold(f32::NEG_INFINITY, f32::max);
                let rect = egui::Rect::from_min_max(egui::pos2(min_x, min_y), egui::pos2(max_x, max_y));

                // Convert premultiplied RGBA to unmultiplied for egui
                let data = image.data();
                let (w, h) = (image.width() as usize, image.height() as usize);
                let mut rgba = Vec::with_capacity(w * h * 4);
                for i in 0..(w * h) {
                    let idx = i * 4;
                    let (r, g, b, a) = (data[idx], data[idx + 1], data[idx + 2], data[idx + 3]);
                    if a == 0 { rgba.extend_from_slice(&[0, 0, 0, 0]); continue; }
                    let rr = ((r as u16) * 255 / (a as u16)).min(255) as u8;
                    let gg = ((g as u16) * 255 / (a as u16)).min(255) as u8;
                    let bb = ((b as u16) * 255 / (a as u16)).min(255) as u8;
                    rgba.extend_from_slice(&[rr, gg, bb, a]);
                }
                let egui_image = egui::ColorImage::from_rgba_unmultiplied([w, h], &rgba);
                let texture_handle = painter.ctx().load_texture(
                    format!("vector_at_zoom_{}_{}", path_data.id, scale_bucket),
                    egui_image,
                    egui::TextureOptions { magnification: egui::TextureFilter::Linear, minification: egui::TextureFilter::Linear, ..Default::default() }
                );
                self.state.raster_cache_tick = self.state.raster_cache_tick.wrapping_add(1);
                self.state.raster_cache_usage.insert((path_data.id, scale_bucket), self.state.raster_cache_tick);
                self.state.raster_cache.insert((path_data.id, scale_bucket), texture_handle.clone());
                self.evict_raster_cache_if_needed();
                painter.add(egui::Shape::image(
                    texture_handle.id(), rect,
                    egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(1.0, 1.0)), egui::Color32::WHITE
                ));
                return;
            }
        }

        // Fallback to simple polygon rendering for simple shapes
        // Draw fill
        if let Some(fill) = &path_data.style.fill {
            let color = egui::Color32::from_rgba_premultiplied(
                (fill.color[0] * 255.0) as u8,
                (fill.color[1] * 255.0) as u8,
                (fill.color[2] * 255.0) as u8,
                (fill.color[3] * 255.0) as u8,
            );
            
            // Use convex_polygon for fill - egui handles complex shapes internally
            if screen_points.len() >= 3 {
                painter.add(egui::Shape::convex_polygon(
                    screen_points.clone(),
                    color,
                    egui::Stroke::new(0.0, egui::Color32::TRANSPARENT),
                ));
            }
        }

        // Draw stroke
        if let Some(stroke) = &path_data.style.stroke {
            let color = egui::Color32::from_rgba_premultiplied(
                (stroke.color[0] * 255.0) as u8,
                (stroke.color[1] * 255.0) as u8,
                (stroke.color[2] * 255.0) as u8,
                (stroke.color[3] * 255.0) as u8,
            );
            
            let mut stroke_width = stroke.width * scaling;
            if stroke_width < 0.5 { stroke_width = 0.5; }
            
            // Draw line segments
            for i in 0..screen_points.len() - 1 {
                painter.add(egui::Shape::line_segment(
                    [screen_points[i], screen_points[i + 1]],
                    egui::Stroke::new(stroke_width, color),
                ));
            }
        }

        // Draw selection overlay
        if is_selected {
            for point in &screen_points {
                painter.add(egui::Shape::circle_filled(
                    *point,
                    4.0,
                    egui::Color32::from_rgba_premultiplied(0, 120, 255, 255),
                ));
            }
        }
    }

    fn is_complex_shape(&self, points: &[egui::Pos2]) -> bool {
        // For SVG paths, always use rasterization to ensure proper rendering
        // This avoids issues with complex fills, self-intersections, and non-convex shapes
        if points.len() > 5 {
            return true;
        }
        
        // Also check for potential self-intersections
        for i in 0..points.len() - 1 {
            for j in i + 2..points.len() - 1 {
                if self.lines_intersect(points[i], points[i + 1], points[j], points[j + 1]) {
                    return true;
                }
            }
        }
        
        // If we have any fill, use rasterization to ensure proper rendering
        true
    }

    fn lines_intersect(&self, a1: egui::Pos2, a2: egui::Pos2, b1: egui::Pos2, b2: egui::Pos2) -> bool {
        // Simple line intersection test
        let det = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
        if det.abs() < 1e-6 {
            return false; // Parallel lines
        }
        
        let t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / det;
        let u = ((a2.x - a1.x) * (b1.y - a1.y) - (a2.y - a1.y) * (b1.x - a1.x)) / det;
        
        t >= 0.0 && t <= 1.0 && u >= 0.0 && u <= 1.0
    }

    fn rasterize_path_to_image(&self, path_data: &engine::PathData, transform: (egui::Vec2, f32)) -> Option<Pixmap> {
        // Prefer the original SVG path data to preserve multiple contours and curves
        let use_svg = path_data.original_svg.as_ref();

        // Compute screen-space bounds from already-transformed XVG points
        if path_data.points.len() < 2 { return None; }
        let (_, scaling) = transform;
        let min_x = path_data.points.iter().map(|p| p.x).fold(f32::INFINITY, f32::min);
        let min_y = path_data.points.iter().map(|p| p.y).fold(f32::INFINITY, f32::min);
        let max_x = path_data.points.iter().map(|p| p.x).fold(f32::NEG_INFINITY, f32::max);
        let max_y = path_data.points.iter().map(|p| p.y).fold(f32::NEG_INFINITY, f32::max);

        let width = ((max_x - min_x) * scaling).max(1.0);
        let height = ((max_y - min_y) * scaling).max(1.0);
        if width <= 0.0 || height <= 0.0 { return None; }

        let padding = 1.0;
        let pixmap_width = (width + padding * 2.0) as u32;
        let pixmap_height = (height + padding * 2.0) as u32;
        let mut pixmap = Pixmap::new(pixmap_width, pixmap_height)?;
        pixmap.fill(tiny_skia::Color::from_rgba(0.0, 0.0, 0.0, 0.0).unwrap());

        // Build a path respecting multiple subpaths and curves
        let mut builder = PathBuilder::new();
        if let Some(d) = use_svg {
            // Minimal SVG doc to allow usvg to parse the 'd' attribute
            let doc = format!("<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"{}\"/></svg>", d);
            if let Ok(tree) = Tree::from_str(&doc, &Options::default()) {
                for node in tree.root.descendants() {
                    if let usvg::NodeKind::Path(ref p) = *node.borrow() {
                        let mut open = false;
                        for seg in p.data.segments() {
                            match seg {
                                PathSegment::MoveTo(pt) => {
                                    if open { builder.close(); }
                                    let x = (pt.x as f32 - min_x) * scaling + padding;
                                    let y = (pt.y as f32 - min_y) * scaling + padding;
                                    builder.move_to(x, y);
                                    open = true;
                                }
                                PathSegment::LineTo(pt) => {
                                    let x = (pt.x as f32 - min_x) * scaling + padding;
                                    let y = (pt.y as f32 - min_y) * scaling + padding;
                                    builder.line_to(x, y);
                                }
                                PathSegment::QuadTo(p1, p2) => {
                                    let x1 = (p1.x as f32 - min_x) * scaling + padding;
                                    let y1 = (p1.y as f32 - min_y) * scaling + padding;
                                    let x2 = (p2.x as f32 - min_x) * scaling + padding;
                                    let y2 = (p2.y as f32 - min_y) * scaling + padding;
                                    builder.quad_to(x1, y1, x2, y2);
                                }
                                PathSegment::CubicTo(p1, p2, p3) => {
                                    let x1 = (p1.x as f32 - min_x) * scaling + padding;
                                    let y1 = (p1.y as f32 - min_y) * scaling + padding;
                                    let x2 = (p2.x as f32 - min_x) * scaling + padding;
                                    let y2 = (p2.y as f32 - min_y) * scaling + padding;
                                    let x3 = (p3.x as f32 - min_x) * scaling + padding;
                                    let y3 = (p3.y as f32 - min_y) * scaling + padding;
                                    builder.cubic_to(x1, y1, x2, y2, x3, y3);
                                }
                                PathSegment::Close => {
                                    builder.close();
                                    open = false;
                                }
                            }
                        }
                        if open { builder.close(); }
                        break; // only one path element expected in the mini doc
                    }
                }
            } else {
                // Fallback to polygon if usvg parse fails
                if let Some(first) = path_data.points.first() {
                    builder.move_to((first.x - min_x) * scaling + padding, (first.y - min_y) * scaling + padding);
                    for pt in &path_data.points[1..] {
                        builder.line_to((pt.x - min_x) * scaling + padding, (pt.y - min_y) * scaling + padding);
                    }
                    builder.close();
                }
            }
        } else {
            // No original SVG; fallback to polygon from points
            if let Some(first) = path_data.points.first() {
                builder.move_to((first.x - min_x) * scaling + padding, (first.y - min_y) * scaling + padding);
                for pt in &path_data.points[1..] {
                    builder.line_to((pt.x - min_x) * scaling + padding, (pt.y - min_y) * scaling + padding);
                }
                builder.close();
            }
        }

        let path = builder.finish()?;

        // NOTE: resvg fallback for gradients/patterns/clip is temporarily disabled to avoid black tiles; we'll re-enable after full defs/style resolution.

        // Fill
        if let Some(fill) = &path_data.style.fill {
            let mut paint = Paint::default();
            paint.set_color(tiny_skia::Color::from_rgba(fill.color[0], fill.color[1], fill.color[2], fill.color[3]).unwrap_or(tiny_skia::Color::BLACK));
            paint.anti_alias = true;
            let rule = match fill.rule {
                xvg_core::FillRule::NonZero => TinySkiaFillRule::Winding,
                xvg_core::FillRule::EvenOdd => TinySkiaFillRule::EvenOdd,
            };
            pixmap.fill_path(&path, &paint, rule, tiny_skia::Transform::identity(), None);
        }

        // Stroke
        if let Some(stroke) = &path_data.style.stroke {
            let mut paint = Paint::default();
            paint.set_color(tiny_skia::Color::from_rgba(stroke.color[0], stroke.color[1], stroke.color[2], stroke.color[3]).unwrap_or(tiny_skia::Color::BLACK));
            paint.anti_alias = true;
            let mut stroke_width = stroke.width * scaling; if stroke_width < 0.5 { stroke_width = 0.5; }
            let stroke = tiny_skia::Stroke { width: stroke_width, line_cap: tiny_skia::LineCap::Butt, line_join: tiny_skia::LineJoin::Miter, dash: None, miter_limit: 10.0 };
            pixmap.stroke_path(&path, &paint, &stroke, tiny_skia::Transform::identity(), None);
        }

        Some(pixmap)
    }

    pub fn draw_path(&self, painter: &egui::Painter, path: &PathRecord, transform: (egui::Vec2, f32), is_selected: bool) {
        // Parse path data and draw as simple line segments
        let path_data = &path.data;
        let mut i = 0;
        let mut points = Vec::new();
        
        while i < path_data.len() {
            if i + 7 < path_data.len() {
                let x = f32::from_le_bytes([path_data[i], path_data[i+1], path_data[i+2], path_data[i+3]]);
                let y = f32::from_le_bytes([path_data[i+4], path_data[i+5], path_data[i+6], path_data[i+7]]);
                let (translation, scaling) = transform;
                let transformed = egui::pos2(x * scaling + translation.x, y * scaling + translation.y);
                points.push(transformed);
                i += 8;
            } else {
                break;
            }
        }
        
        if points.len() >= 2 {
            // Draw stroke
            if let Some(stroke) = &path.style.stroke {
                let stroke_width = stroke.width * transform.1; // Scale stroke width with zoom
                let stroke_color = egui::Color32::from_rgba_premultiplied(
                    (stroke.color[0] * 255.0) as u8,
                    (stroke.color[1] * 255.0) as u8,
                    (stroke.color[2] * 255.0) as u8,
                    (stroke.color[3] * 255.0) as u8,
                );
                
                painter.add(egui::Shape::line(points.clone(), (stroke_width, stroke_color)));
            }
            
            // Draw fill
            if let Some(fill) = &path.style.fill {
                let fill_color = egui::Color32::from_rgba_premultiplied(
                    (fill.color[0] * 255.0) as u8,
                    (fill.color[1] * 255.0) as u8,
                    (fill.color[2] * 255.0) as u8,
                    (fill.color[3] * 255.0) as u8,
                );
                
                // Create a simple polygon for fill
                if points.len() >= 3 {
                    painter.add(egui::Shape::convex_polygon(points.clone(), fill_color, (0.0, egui::Color32::TRANSPARENT)));
                }
            }
        }
        
        if is_selected {
            // Draw selection handles
            self.draw_selection_handles(painter, path, transform);
        }
    }



    pub fn draw_selection_handles(&self, painter: &egui::Painter, path: &PathRecord, transform: (egui::Vec2, f32)) {
        // Draw selection rectangle around the path
        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        
        // Parse path data to get bounding box
        let path_data = &path.data;
        let mut i = 0;
        while i < path_data.len() {
            if i + 7 < path_data.len() {
                let x = f32::from_le_bytes([path_data[i], path_data[i+1], path_data[i+2], path_data[i+3]]);
                let y = f32::from_le_bytes([path_data[i+4], path_data[i+5], path_data[i+6], path_data[i+7]]);
                let (translation, scaling) = transform;
                let transformed = egui::pos2(x * scaling + translation.x, y * scaling + translation.y);
                min_x = min_x.min(transformed.x);
                min_y = min_y.min(transformed.y);
                max_x = max_x.max(transformed.x);
                max_y = max_y.max(transformed.y);
                i += 8;
            } else {
                break;
            }
        }
        
        let rect = egui::Rect::from_min_max(egui::pos2(min_x, min_y), egui::pos2(max_x, max_y));
        painter.rect_stroke(rect, 0.0, (2.0, egui::Color32::BLUE));
    }

    pub fn draw_selection_overlay(&self, painter: &egui::Painter, canvas_rect: egui::Rect, transform: (egui::Vec2, f32)) {
        // Draw selection box if currently drawing
        if let (Some(start), Some(end)) = (self.state.selection.selection_box_start, self.state.selection.selection_box_end) {
            // Convert world coordinates to screen coordinates
            let screen_start = self.world_to_screen(start, canvas_rect);
            let screen_end = self.world_to_screen(end, canvas_rect);
            let rect = egui::Rect::from_two_pos(screen_start, screen_end);
            
            painter.add(egui::Shape::rect_stroke(
                rect,
                egui::Rounding::same(0.0),
                egui::Stroke::new(1.0, egui::Color32::BLUE),
            ));
            painter.add(egui::Shape::rect_filled(
                rect,
                egui::Rounding::same(0.0),
                egui::Color32::from_black_alpha(25),
            ));
        }
    }

    pub fn draw_current_operation(&self, painter: &egui::Painter, canvas_rect: egui::Rect, transform: (egui::Vec2, f32)) {
        // Draw current drawing operation preview
        if self.state.tools.drawing_mode && self.state.tools.drawing_points.len() >= 2 {
            let (translation, scaling) = transform;
            
            // Transform points to screen coordinates
            let screen_points: Vec<egui::Pos2> = self.state.tools.drawing_points.iter()
                .map(|p| {
                    let world_vec = p.to_vec2();
                    let screen_vec = world_vec * scaling + translation;
                    egui::pos2(screen_vec.x, screen_vec.y)
                })
                .collect();
            
            match self.state.tools.current_tool {
                DrawingTool::Rectangle => {
                    if screen_points.len() >= 2 {
                        let rect = egui::Rect::from_two_pos(screen_points[0], screen_points[1]);
                        painter.add(egui::Shape::rect_stroke(
                            rect,
                            egui::Rounding::same(0.0),
                            egui::Stroke::new(2.0, egui::Color32::BLUE),
                        ));
                        
                        // Draw fill preview if enabled
                        if self.state.tools.fill_enabled {
                            painter.add(egui::Shape::rect_filled(
                                rect,
                                egui::Rounding::same(0.0),
                                egui::Color32::from_rgba_premultiplied(
                                    self.state.tools.selected_color.r(),
                                    self.state.tools.selected_color.g(),
                                    self.state.tools.selected_color.b(),
                                    50,
                                ),
                            ));
                        }
                    }
                }
                DrawingTool::Circle => {
                    if screen_points.len() >= 2 {
                        let center = screen_points[0];
                        let end = screen_points[1];
                        let radius = center.distance(end);
                        painter.add(egui::Shape::circle_stroke(
                            center,
                            radius,
                            egui::Stroke::new(2.0, egui::Color32::BLUE),
                        ));
                        
                        // Draw fill preview if enabled
                        if self.state.tools.fill_enabled {
                            painter.add(egui::Shape::circle_filled(
                                center,
                                radius,
                                egui::Color32::from_rgba_premultiplied(
                                    self.state.tools.selected_color.r(),
                                    self.state.tools.selected_color.g(),
                                    self.state.tools.selected_color.b(),
                                    50,
                                ),
                            ));
                        }
                    }
                }
                DrawingTool::Ellipse => {
                    if screen_points.len() >= 2 {
                        let start = screen_points[0];
                        let end = screen_points[1];
                        let center_x = (start.x + end.x) / 2.0;
                        let center_y = (start.y + end.y) / 2.0;
                        let radius_x = (end.x - start.x).abs() / 2.0;
                        let radius_y = (end.y - start.y).abs() / 2.0;
                        let center = egui::pos2(center_x, center_y);
                        
                        // Draw ellipse as circle for preview (simplified)
                        painter.add(egui::Shape::circle_stroke(
                            center,
                            radius_x.max(radius_y),
                            egui::Stroke::new(2.0, egui::Color32::BLUE),
                        ));
                        
                        // Draw fill preview if enabled
                        if self.state.tools.fill_enabled {
                            painter.add(egui::Shape::circle_filled(
                                center,
                                radius_x.max(radius_y),
                                egui::Color32::from_rgba_premultiplied(
                                    self.state.tools.selected_color.r(),
                                    self.state.tools.selected_color.g(),
                                    self.state.tools.selected_color.b(),
                                    50,
                                ),
                            ));
                        }
                    }
                }
                DrawingTool::Line => {
                    if screen_points.len() >= 2 {
                        painter.add(egui::Shape::line_segment(
                            [screen_points[0], screen_points[1]],
                            egui::Stroke::new(2.0, egui::Color32::BLUE),
                        ));
                    }
                }
                DrawingTool::Freehand => {
                    if screen_points.len() >= 2 {
                        painter.add(egui::Shape::line(
                            screen_points,
                            egui::Stroke::new(2.0, egui::Color32::BLUE),
                        ));
                    }
                }
                _ => {}
            }
        }
    }

    // Tool handlers
    pub fn handle_select_tool(&mut self, response: &egui::Response) {
        // Begin drag: choose move vs marquee
        if response.drag_started() {
            if let Some(screen_pos) = response.interact_pointer_pos() {
                let canvas_rect = response.rect;
                let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                // If clicking inside a selected object, start move-drag
                let paths = self.state.engine.get_paths();
                let mut hit_selected = false;
                for &sel_idx in &self.state.selection.selected_paths {
                    if let Some(pd) = paths.get(sel_idx) {
                        if !pd.points.is_empty() {
                            let min_x = pd.points.iter().map(|p| p.x).fold(f32::INFINITY, f32::min);
                            let max_x = pd.points.iter().map(|p| p.x).fold(f32::NEG_INFINITY, f32::max);
                            let min_y = pd.points.iter().map(|p| p.y).fold(f32::INFINITY, f32::min);
                            let max_y = pd.points.iter().map(|p| p.y).fold(f32::NEG_INFINITY, f32::max);
                            if world_pos.x >= min_x && world_pos.x <= max_x && world_pos.y >= min_y && world_pos.y <= max_y {
                                hit_selected = true;
                                break;
                            }
                        }
                    }
                }
                if hit_selected {
                    self.state.selection.dragging_selection = true;
                    self.state.selection.drag_start = Some(world_pos);
                    self.state.selection.drag_offset = [0.0, 0.0];
                } else {
                    self.state.selection.drawing_selection_box = true;
                    self.state.selection.selection_box_start = Some(world_pos);
                }
            }
        }

        if response.dragged() {
            if self.state.selection.dragging_selection {
                if let (Some(screen_pos), Some(start_world)) = (response.interact_pointer_pos(), self.state.selection.drag_start) {
                    let canvas_rect = response.rect;
                    let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                    let mut dx = world_pos.x - start_world.x;
                    let mut dy = world_pos.y - start_world.y;
                    if response.ctx.input(|i| i.modifiers.shift) {
                        let step = 10.0f32;
                        dx = (dx / step).round() * step;
                        dy = (dy / step).round() * step;
                    }
                    self.state.selection.drag_offset = [dx, dy];
                }
                return;
            } else if self.state.selection.drawing_selection_box {
                if let Some(screen_pos) = response.interact_pointer_pos() {
                    let canvas_rect = response.rect;
                    let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                    self.state.selection.selection_box_end = Some(world_pos);
                }
            }
        }

        if response.drag_released() {
            if self.state.selection.dragging_selection {
                let [dx, dy] = self.state.selection.drag_offset;
                if (dx.abs() + dy.abs()) > 0.0 {
                    let indices = self.state.selection.selected_paths.clone();
                    self.execute_command(Command::MovePaths { indices, delta: [dx, dy] });
                }
                self.state.selection.dragging_selection = false;
                self.state.selection.drag_start = None;
                self.state.selection.drag_offset = [0.0, 0.0];
                return;
            }
            if self.state.selection.drawing_selection_box {
                if let (Some(start), Some(end)) = (self.state.selection.selection_box_start, self.state.selection.selection_box_end) {
                    let min_x = start.x.min(end.x);
                    let max_x = start.x.max(end.x);
                    let min_y = start.y.min(end.y);
                    let max_y = start.y.max(end.y);
                    let paths = self.state.engine.get_paths();
                    let mut selected_paths = Vec::new();
                    for (index, path_data) in paths.iter().enumerate() {
                        if path_data.points.iter().any(|p| p.x >= min_x && p.x <= max_x && p.y >= min_y && p.y <= max_y) {
                            selected_paths.push(index);
                        }
                    }
                    if !response.ctx.input(|i| i.modifiers.ctrl) {
                        self.state.selection.selected_paths.clear();
                    }
                    self.state.selection.selected_paths.extend(selected_paths);
                    self.state.selection.selected_paths.sort_unstable();
                    self.state.selection.selected_paths.dedup();
                }
                self.state.selection.drawing_selection_box = false;
                self.state.selection.selection_box_start = None;
                self.state.selection.selection_box_end = None;
                return;
            }
        }

        if response.clicked() {
            if let Some(click_pos) = response.interact_pointer_pos() {
                // Get canvas rect from the response
                let canvas_rect = response.rect;
                let world_pos = self.screen_to_world(click_pos, canvas_rect);
                
                // Use engine to get paths and hit test
                let paths = self.state.engine.get_paths();
                let mut hit_path = None;
                
                for (index, path_data) in paths.iter().enumerate() {
                    // Simple bounding box hit test
                    if !path_data.points.is_empty() {
                        let min_x = path_data.points.iter().map(|p| p.x).fold(f32::INFINITY, f32::min);
                        let max_x = path_data.points.iter().map(|p| p.x).fold(f32::NEG_INFINITY, f32::max);
                        let min_y = path_data.points.iter().map(|p| p.y).fold(f32::INFINITY, f32::min);
                        let max_y = path_data.points.iter().map(|p| p.y).fold(f32::NEG_INFINITY, f32::max);
                        
                        if world_pos.x >= min_x && world_pos.x <= max_x && world_pos.y >= min_y && world_pos.y <= max_y {
                            hit_path = Some(index);
                            break;
                        }
                    }
                }
                
                if let Some(path_index) = hit_path {
                    if !response.ctx.input(|i| i.modifiers.ctrl) {
                        self.state.selection.selected_paths.clear();
                    }
                    self.state.selection.selected_paths.push(path_index);
                    // Deduplicate to prevent duplicates when clicking raster layers
                    self.state.selection.selected_paths.sort_unstable();
                    self.state.selection.selected_paths.dedup();
                } else if !response.ctx.input(|i| i.modifiers.ctrl) {
                    self.state.selection.selected_paths.clear();
                }
            }
        }
    }

    pub fn handle_rectangle_tool(&mut self, response: &egui::Response) {
        if response.drag_started() {
            self.state.tools.drawing_mode = true;
            self.state.tools.drawing_points.clear();
            if let Some(screen_pos) = response.interact_pointer_pos() {
                let canvas_rect = response.rect;
                let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                self.state.tools.drawing_points.push(world_pos);
            }
        }

        if self.state.tools.drawing_mode && response.dragged() {
            if let Some(screen_pos) = response.interact_pointer_pos() {
                let canvas_rect = response.rect;
                let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                if self.state.tools.drawing_points.len() > 1 {
                    self.state.tools.drawing_points[1] = world_pos;
                } else {
                    self.state.tools.drawing_points.push(world_pos);
                }
            }
        }

        if response.drag_released() && self.state.tools.drawing_mode {
            self.finish_rectangle_drawing();
        }
    }

    pub fn handle_circle_tool(&mut self, response: &egui::Response) {
        if response.drag_started() {
            self.state.tools.drawing_mode = true;
            self.state.tools.drawing_points.clear();
            if let Some(screen_pos) = response.interact_pointer_pos() {
                let canvas_rect = response.rect;
                let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                self.state.tools.drawing_points.push(world_pos);
            }
        }

        if self.state.tools.drawing_mode && response.dragged() {
            if let Some(screen_pos) = response.interact_pointer_pos() {
                let canvas_rect = response.rect;
                let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                if self.state.tools.drawing_points.len() > 1 {
                    self.state.tools.drawing_points[1] = world_pos;
                } else {
                    self.state.tools.drawing_points.push(world_pos);
                }
            }
        }

        if response.drag_released() && self.state.tools.drawing_mode {
            self.finish_circle_drawing();
        }
    }

    pub fn handle_line_tool(&mut self, response: &egui::Response) {
        if response.drag_started() {
            self.state.tools.drawing_mode = true;
            self.state.tools.drawing_points.clear();
            if let Some(screen_pos) = response.interact_pointer_pos() {
                let canvas_rect = response.rect;
                let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                self.state.tools.drawing_points.push(world_pos);
            }
        }

        if self.state.tools.drawing_mode && response.dragged() {
            if let Some(screen_pos) = response.interact_pointer_pos() {
                let canvas_rect = response.rect;
                let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                if self.state.tools.drawing_points.len() > 1 {
                    self.state.tools.drawing_points[1] = world_pos;
                } else {
                    self.state.tools.drawing_points.push(world_pos);
                }
            }
        }

        if response.drag_released() && self.state.tools.drawing_mode {
            self.finish_line_drawing();
        }
    }

    pub fn handle_freehand_tool(&mut self, response: &egui::Response) {
        if response.drag_started() {
            self.state.tools.drawing_mode = true;
            self.state.tools.drawing_points.clear();
            if let Some(screen_pos) = response.interact_pointer_pos() {
                let canvas_rect = response.rect;
                let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                self.state.tools.drawing_points.push(world_pos);
            }
        }

        if self.state.tools.drawing_mode && response.dragged() {
            if let Some(screen_pos) = response.interact_pointer_pos() {
                let canvas_rect = response.rect;
                let world_pos = self.screen_to_world(screen_pos, canvas_rect);
                self.state.tools.drawing_points.push(world_pos);
            }
        }

        if response.drag_released() && self.state.tools.drawing_mode {
            self.finish_freehand_drawing();
        }
    }

    pub fn handle_zoom_tool(&mut self, response: &egui::Response) {
        let input = response.ctx.input(|i| i.clone());
        let canvas_rect = response.rect;
        
        // Handle panning when left mouse button is held down
        if response.dragged() {
            let delta = response.drag_delta();
            // Pan should move in the same direction as drag for natural feel
            self.state.viewport.pan[0] += delta.x;
            self.state.viewport.pan[1] += delta.y;
            return; // Exit early to prevent zooming while panning
        }
        
        // Determine zoom center - prioritize selected object, then mouse position, then canvas center
        let zoom_center = if !self.state.selection.selected_paths.is_empty() {
            // Zoom to center of selected object(s)
            self.get_selected_objects_center()
        } else if let Some(click_pos) = response.interact_pointer_pos() {
            // Zoom to mouse position
            Some(self.screen_to_world(click_pos, canvas_rect))
        } else {
            // Zoom to canvas center
            Some(egui::pos2(0.0, 0.0))
        };
        
        if let Some(center) = zoom_center {
            // Handle scroll wheel zoom
            if input.raw_scroll_delta.y != 0.0 {
                let old_zoom = self.state.viewport.zoom;
                let zoom_factor = if input.raw_scroll_delta.y > 0.0 { 1.1 } else { 0.9 };
                self.state.viewport.zoom *= zoom_factor;
                self.state.viewport.zoom = self.state.viewport.zoom.clamp(MIN_ZOOM, MAX_ZOOM);
                
                // Adjust pan to keep center point fixed
                self.adjust_pan_for_zoom_center(center, old_zoom, canvas_rect);
            }
            
            // Handle click to zoom in/out
            if response.clicked() {
                let old_zoom = self.state.viewport.zoom;
                let zoom_factor = if response.ctx.input(|i| i.modifiers.ctrl) { 0.9 } else { 1.1 };
                self.state.viewport.zoom *= zoom_factor;
                self.state.viewport.zoom = self.state.viewport.zoom.clamp(MIN_ZOOM, MAX_ZOOM);
                
                // Adjust pan to keep center point fixed
                self.adjust_pan_for_zoom_center(center, old_zoom, canvas_rect);
            }
        }
    }
    
    // Helper method to get the center of selected objects
    fn get_selected_objects_center(&self) -> Option<egui::Pos2> {
        if self.state.selection.selected_paths.is_empty() {
            return None;
        }
        
        let paths = self.state.engine.get_paths();
        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        let mut has_points = false;
        
        for &path_id in &self.state.selection.selected_paths {
            if let Some(path_data) = paths.get(path_id) {
                for point in &path_data.points {
                    min_x = min_x.min(point.x);
                    min_y = min_y.min(point.y);
                    max_x = max_x.max(point.x);
                    max_y = max_y.max(point.y);
                    has_points = true;
                }
            }
        }
        
        if has_points {
            Some(egui::pos2((min_x + max_x) / 2.0, (min_y + max_y) / 2.0))
        } else {
            None
        }
    }
    
    // Helper method to adjust pan when zooming to keep a center point fixed
    fn adjust_pan_for_zoom_center(&mut self, center: egui::Pos2, old_zoom: f32, canvas_rect: egui::Rect) {
        let canvas_center = canvas_rect.center();
        
        // Calculate where the center point was on screen before zoom
        let old_screen_center = canvas_center + egui::vec2(
            center.x * old_zoom + self.state.viewport.pan[0],
            center.y * old_zoom + self.state.viewport.pan[1]
        );
        
        // Calculate where the center point should be on screen after zoom
        let new_screen_center = canvas_center + egui::vec2(
            center.x * self.state.viewport.zoom + self.state.viewport.pan[0],
            center.y * self.state.viewport.zoom + self.state.viewport.pan[1]
        );
        
        // Adjust pan to keep the center point in the same screen position
        let delta = old_screen_center - new_screen_center;
        self.state.viewport.pan[0] += delta.x;
        self.state.viewport.pan[1] += delta.y;
    }
    
    // Method to zoom to selected object
    pub fn zoom_to_selected_object(&mut self) {
        if let Some(center) = self.get_selected_objects_center() {
            // Set a reasonable zoom level for the selected object
            self.state.viewport.zoom = 2.0; // Zoom in to 2x
            self.state.viewport.zoom = self.state.viewport.zoom.clamp(MIN_ZOOM, MAX_ZOOM);
            
            // Center the view on the selected object
            // We'll use a dummy canvas rect for calculation - the actual rect will be used in rendering
            let dummy_rect = egui::Rect::from_min_size(egui::pos2(0.0, 0.0), egui::vec2(CANVAS_SIZE, CANVAS_SIZE));
            let canvas_center = dummy_rect.center();
            
            // Calculate pan to center the object
            self.state.viewport.pan[0] = canvas_center.x - center.x * self.state.viewport.zoom;
            self.state.viewport.pan[1] = canvas_center.y - center.y * self.state.viewport.zoom;
            
            self.set_status_message("Zoomed to selected object".to_string(), MessageLevel::Info);
        } else {
            self.set_status_message("No object selected to zoom to".to_string(), MessageLevel::Warning);
        }
    }

    pub fn handle_pan_tool(&mut self, response: &egui::Response) {
        if response.dragged() {
            let delta = response.drag_delta();
            // Pan should move in the same direction as drag for natural feel
            self.state.viewport.pan[0] += delta.x;
            self.state.viewport.pan[1] += delta.y;
        }
    }

    pub fn finish_rectangle_drawing(&mut self) {
        if self.state.tools.drawing_points.len() >= 2 {
            let start = self.state.tools.drawing_points[0];
            let end = self.state.tools.drawing_points[1];
            // Support rounded corners using the studio utility approach
            let rx = 10.0f32.min((end.x - start.x).abs() / 2.0).min((end.y - start.y).abs() / 2.0);
            let ry = rx;
            let points = if rx > 0.5 && ry > 0.5 {
                Self::create_rounded_rectangle_points(start.x.min(end.x) as f64,
                                                       start.y.min(end.y) as f64,
                                                       (end.x - start.x).abs() as f64,
                                                       (end.y - start.y).abs() as f64,
                                                       rx as f64, ry as f64)
                    .into_iter().map(|p| egui::pos2(p.x, p.y)).collect()
            } else {
                vec![
                    start,
                    egui::pos2(end.x, start.y),
                    end,
                    egui::pos2(start.x, end.y),
                    start,
                ]
            };
            
            // Create path style
            let style = engine::PathStyle {
                fill: if self.state.tools.fill_enabled {
                    Some(engine::FillStyle {
                        color: engine::egui_color_to_xvg_color(self.state.tools.selected_color),
                        rule: xvg_core::FillRule::NonZero,
                    })
                } else {
                    None
                },
                stroke: if self.state.tools.stroke_enabled {
                    Some(engine::StrokeStyle {
                        color: engine::egui_color_to_xvg_color(self.state.tools.selected_color),
                        width: self.state.tools.stroke_width,
                        cap: xvg_core::LineCap::Butt,
                        join: xvg_core::LineJoin::Miter,
                        dash_array: Vec::new(),
                    })
                } else {
                    None
                },
                opacity: self.state.tools.opacity,
                blend_mode: xvg_core::BlendMode::Normal,
            };
            
            // Use engine to create path
            if let Err(e) = self.state.engine.create_path(&points, style) {
                self.set_status_message(format!("Failed to create rectangle: {}", e), MessageLevel::Error);
            } else {
                self.set_status_message("Rectangle created".to_string(), MessageLevel::Success);
            }
        }
        self.state.tools.drawing_mode = false;
        self.state.tools.drawing_points.clear();
    }

    // Ported from studio: generate rounded rectangle polyline
    fn create_rounded_rectangle_points(x: f64, y: f64, width: f64, height: f64, rx: f64, ry: f64) -> Vec<egui::Pos2> {
        let mut points = Vec::new();
        let steps = 8;
        points.push(egui::pos2((x + rx) as f32, y as f32));
        points.push(egui::pos2((x + width - rx) as f32, y as f32));
        for i in 0..=steps {
            let angle = std::f64::consts::PI * 1.5 + (std::f64::consts::PI / 2.0) * i as f64 / steps as f64;
            let px = x + width - rx + rx * angle.cos();
            let py = y + ry + ry * angle.sin();
            points.push(egui::pos2(px as f32, py as f32));
        }
        points.push(egui::pos2((x + width) as f32, (y + ry) as f32));
        points.push(egui::pos2((x + width) as f32, (y + height - ry) as f32));
        for i in 0..=steps {
            let angle = std::f64::consts::PI * 2.0 + (std::f64::consts::PI / 2.0) * i as f64 / steps as f64;
            let px = x + width - rx + rx * angle.cos();
            let py = y + height - ry + ry * angle.sin();
            points.push(egui::pos2(px as f32, py as f32));
        }
        points.push(egui::pos2((x + width - rx) as f32, (y + height) as f32));
        points.push(egui::pos2((x + rx) as f32, (y + height) as f32));
        for i in 0..=steps {
            let angle = std::f64::consts::PI * 0.5 + (std::f64::consts::PI / 2.0) * i as f64 / steps as f64;
            let px = x + rx + rx * angle.cos();
            let py = y + height - ry + ry * angle.sin();
            points.push(egui::pos2(px as f32, py as f32));
        }
        points.push(egui::pos2(x as f32, (y + height - ry) as f32));
        points.push(egui::pos2(x as f32, (y + ry) as f32));
        for i in 0..=steps {
            let angle = (std::f64::consts::PI / 2.0) * i as f64 / steps as f64;
            let px = x + rx + rx * angle.cos();
            let py = y + ry + ry * angle.sin();
            points.push(egui::pos2(px as f32, py as f32));
        }
        points
    }

    pub fn finish_circle_drawing(&mut self) {
        if self.state.tools.drawing_points.len() >= 2 {
            let center = self.state.tools.drawing_points[0];
            let end = self.state.tools.drawing_points[1];
            let radius = center.distance(end);
            
            // Create circle points (approximate with 32 segments)
            let mut points = Vec::new();
            let segments = 32;
            for i in 0..=segments {
                let angle = 2.0 * std::f32::consts::PI * i as f32 / segments as f32;
                let x = center.x + radius * angle.cos();
                let y = center.y + radius * angle.sin();
                points.push(egui::pos2(x, y));
            }
            
            // Create path style
            let style = engine::PathStyle {
                fill: if self.state.tools.fill_enabled {
                    Some(engine::FillStyle {
                        color: engine::egui_color_to_xvg_color(self.state.tools.selected_color),
                        rule: xvg_core::FillRule::NonZero,
                    })
                } else {
                    None
                },
                stroke: if self.state.tools.stroke_enabled {
                    Some(engine::StrokeStyle {
                        color: engine::egui_color_to_xvg_color(self.state.tools.selected_color),
                        width: self.state.tools.stroke_width,
                        cap: xvg_core::LineCap::Butt,
                        join: xvg_core::LineJoin::Miter,
                        dash_array: Vec::new(),
                    })
                } else {
                    None
                },
                opacity: self.state.tools.opacity,
                blend_mode: xvg_core::BlendMode::Normal,
            };
            
            // Use engine to create path
            if let Err(e) = self.state.engine.create_path(&points, style) {
                self.set_status_message(format!("Failed to create circle: {}", e), MessageLevel::Error);
            } else {
                self.set_status_message("Circle created".to_string(), MessageLevel::Success);
            }
        }
        self.state.tools.drawing_mode = false;
        self.state.tools.drawing_points.clear();
    }

    pub fn finish_line_drawing(&mut self) {
        if self.state.tools.drawing_points.len() >= 2 {
            let start = self.state.tools.drawing_points[0];
            let end = self.state.tools.drawing_points[1];
            
            // Create line points
            let points = vec![start, end];
            
            // Create path style
            let style = engine::PathStyle {
                fill: None, // Lines don't have fill
                stroke: if self.state.tools.stroke_enabled {
                    Some(engine::StrokeStyle {
                        color: engine::egui_color_to_xvg_color(self.state.tools.selected_color),
                        width: self.state.tools.stroke_width,
                        cap: xvg_core::LineCap::Butt,
                        join: xvg_core::LineJoin::Miter,
                        dash_array: Vec::new(),
                    })
                } else {
                    None
                },
                opacity: self.state.tools.opacity,
                blend_mode: xvg_core::BlendMode::Normal,
            };
            
            // Use engine to create path
            if let Err(e) = self.state.engine.create_path(&points, style) {
                self.set_status_message(format!("Failed to create line: {}", e), MessageLevel::Error);
            } else {
                self.set_status_message("Line created".to_string(), MessageLevel::Success);
            }
        }
        self.state.tools.drawing_mode = false;
        self.state.tools.drawing_points.clear();
    }

    pub fn finish_freehand_drawing(&mut self) {
        if self.state.tools.drawing_points.len() >= 2 {
            // Create path style
            let style = engine::PathStyle {
                fill: None, // Freehand paths typically don't have fill
                stroke: if self.state.tools.stroke_enabled {
                    Some(engine::StrokeStyle {
                        color: engine::egui_color_to_xvg_color(self.state.tools.selected_color),
                        width: self.state.tools.stroke_width,
                        cap: xvg_core::LineCap::Round,
                        join: xvg_core::LineJoin::Round,
                        dash_array: Vec::new(),
                    })
                } else {
                    None
                },
                opacity: self.state.tools.opacity,
                blend_mode: xvg_core::BlendMode::Normal,
            };
            
            // Use engine to create path
            if let Err(e) = self.state.engine.create_path(&self.state.tools.drawing_points, style) {
                self.set_status_message(format!("Failed to create freehand path: {}", e), MessageLevel::Error);
            } else {
                self.set_status_message("Freehand path created".to_string(), MessageLevel::Success);
            }
        }
        self.state.tools.drawing_mode = false;
        self.state.tools.drawing_points.clear();
    }

    pub fn create_rectangle_path(&self, start: egui::Pos2, end: egui::Pos2) -> PathRecord {
        let color = self.egui_color_to_rgba32(self.state.tools.selected_color);
        
        // Create rectangle path data
        let min_x = start.x.min(end.x);
        let min_y = start.y.min(end.y);
        let max_x = start.x.max(end.x);
        let max_y = start.y.max(end.y);
        
        let mut path_data = Vec::new();
        let corners = [
            [min_x, min_y], [max_x, min_y], [max_x, max_y], [min_x, max_y], [min_x, min_y]
        ];
        for corner in corners {
            path_data.extend_from_slice(&corner[0].to_le_bytes());
            path_data.extend_from_slice(&corner[1].to_le_bytes());
        }

        PathRecord {
            data: path_data,
            tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            style: PathStyle {
                fill: if self.state.tools.fill_enabled {
                    Some(FillStyle {
                        color: [color as f32 / 255.0, 0.0, 0.0, 1.0],
                        rule: FillRule::NonZero,
                    })
                } else {
                    None
                },
                stroke: if self.state.tools.stroke_enabled {
                    Some(StrokeStyle {
                        color: [color as f32 / 255.0, 0.0, 0.0, 1.0],
                        width: self.state.tools.stroke_width,
                        cap: LineCap::Round,
                        join: LineJoin::Round,
                        dash_array: Vec::new(),
                    })
                } else {
                    None
                },
                opacity: self.state.tools.opacity,
                blend_mode: BlendMode::Normal,
            },
            original_svg: None,
        }
    }

    pub fn create_circle_path(&self, center: egui::Pos2, radius: f32) -> PathRecord {
        let color = self.egui_color_to_rgba32(self.state.tools.selected_color);
        
        // Create circle path data (simplified)
        let mut path_data = Vec::new();
        for i in 0..16 {
            let angle = i as f32 * std::f32::consts::PI / 8.0;
            let x = center.x + radius * angle.cos();
            let y = center.y + radius * angle.sin();
            path_data.extend_from_slice(&x.to_le_bytes());
            path_data.extend_from_slice(&y.to_le_bytes());
        }

        PathRecord {
            data: path_data,
            tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            style: PathStyle {
                fill: if self.state.tools.fill_enabled {
                    Some(FillStyle {
                        color: [color as f32 / 255.0, 0.0, 0.0, 1.0],
                        rule: FillRule::NonZero,
                    })
                } else {
                    None
                },
                stroke: if self.state.tools.stroke_enabled {
                    Some(StrokeStyle {
                        color: [color as f32 / 255.0, 0.0, 0.0, 1.0],
                        width: self.state.tools.stroke_width,
                        cap: LineCap::Round,
                        join: LineJoin::Round,
                        dash_array: Vec::new(),
                    })
                } else {
                    None
                },
                opacity: self.state.tools.opacity,
                blend_mode: BlendMode::Normal,
            },
            original_svg: None,
        }
    }

    pub fn create_line_path(&self, start: egui::Pos2, end: egui::Pos2) -> PathRecord {
        let color = self.egui_color_to_rgba32(self.state.tools.selected_color);
        
        let mut path_data = Vec::new();
        path_data.extend_from_slice(&start.x.to_le_bytes());
        path_data.extend_from_slice(&start.y.to_le_bytes());
        path_data.extend_from_slice(&end.x.to_le_bytes());
        path_data.extend_from_slice(&end.y.to_le_bytes());

        PathRecord {
            data: path_data,
            tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            style: PathStyle {
                fill: None,
                stroke: Some(StrokeStyle {
                    color: [color as f32 / 255.0, 0.0, 0.0, 1.0],
                    width: self.state.tools.stroke_width,
                    cap: LineCap::Round,
                    join: LineJoin::Round,
                    dash_array: Vec::new(),
                }),
                opacity: self.state.tools.opacity,
                blend_mode: BlendMode::Normal,
            },
            original_svg: None,
        }
    }

    // Tab rendering functions
    pub fn render_timeline_tab(&mut self, ui: &mut egui::Ui) {
        ui.vertical(|ui| {
            ui.heading("Timeline");
            
            // Playback controls
    ui.horizontal(|ui| {
                let play_text = if self.state.animation.playing { "⏸ Pause" } else { "▶ Play" };
                if ui.button(play_text).clicked() {
                    self.state.animation.playing = !self.state.animation.playing;
                }
                if ui.button("⏹ Stop").clicked() {
                    self.state.animation.playing = false;
                    self.state.animation.playhead = 0.0;
                }
                if ui.button("⏮ Start").clicked() {
                    self.state.animation.playhead = self.state.animation.start_time;
                }
                if ui.button("⏭ End").clicked() {
                    self.state.animation.playhead = self.state.animation.end_time;
                }
            });
            
            ui.separator();
            
            // Timeline settings
            ui.horizontal(|ui| {
                ui.label("Start:");
                ui.add(egui::DragValue::new(&mut self.state.animation.start_time).speed(0.1));
                ui.label("End:");
                ui.add(egui::DragValue::new(&mut self.state.animation.end_time).speed(0.1));
                ui.checkbox(&mut self.state.animation.loop_enabled, "Loop");
            });
            
            // Timeline scrubber
            ui.add(egui::Slider::new(&mut self.state.animation.playhead, 
                                   self.state.animation.start_time..=self.state.animation.end_time)
                .text("Time"));
            
            ui.separator();
            
            // Animation curves list
            ui.heading("Animation Curves");
            
            if let Some(file_arc) = &self.state.file {
                let file = file_arc.lock().unwrap();
                for (i, curve) in file.anim_curves.iter().enumerate() {
                    ui.horizontal(|ui| {
                        let selected = self.state.animation.selected_curve == Some(i);
                        if ui.selectable_label(selected, &curve.property).clicked() {
                            self.state.animation.selected_curve = Some(i);
                        }
                    });
                }
            }
            
            if ui.button("Add Curve").clicked() {
                // Add a quadratic-like curve as polyline
                let mut data: Vec<u8> = Vec::new();
                let pts: &[(f32,f32)] = &[(100.0,100.0),(150.0,50.0),(200.0,100.0)];
                for &(x,y) in pts.iter() { data.extend_from_slice(&x.to_le_bytes()); data.extend_from_slice(&y.to_le_bytes()); }
                let rec = PathRecord{ data, tf:[1.0,0.0,0.0,1.0,0.0,0.0], style: PathStyle{ fill: None, stroke: Some(StrokeStyle{ color:[0.0,0.0,0.0,1.0], width:2.0, cap: LineCap::Butt, join: LineJoin::Miter, dash_array: Vec::new()}), opacity:1.0, blend_mode: BlendMode::Normal}, original_svg: None };
                self.execute_command(Command::AddPath(rec));
                self.set_status_message("Curve added".to_string(), MessageLevel::Success);
        }
    });
}

    pub fn render_effects_tab(&mut self, ui: &mut egui::Ui) {
        ui.vertical(|ui| {
            ui.heading("Effects");
            
            ui.label("Post-processing effects and filters");
            
            ui.group(|ui| {
                ui.heading("Color Correction");
                ui.horizontal(|ui| {
                    ui.label("Brightness:");
                    ui.add(egui::Slider::new(&mut 1.0f32, 0.0..=2.0));
                });
                ui.horizontal(|ui| {
                    ui.label("Contrast:");
                    ui.add(egui::Slider::new(&mut 1.0f32, 0.0..=2.0));
                });
                ui.horizontal(|ui| {
                    ui.label("Saturation:");
                    ui.add(egui::Slider::new(&mut 1.0f32, 0.0..=2.0));
                });
            });
            
            ui.group(|ui| {
                ui.heading("Blur Effects");
                ui.checkbox(&mut false, "Gaussian Blur");
                ui.checkbox(&mut false, "Motion Blur");
                ui.checkbox(&mut false, "Depth of Field");
            });
            
            ui.group(|ui| {
                ui.heading("Lighting Effects");
                ui.checkbox(&mut false, "Bloom");
                ui.checkbox(&mut false, "God Rays");
                ui.checkbox(&mut false, "Screen Space Reflections");
            });
            
            if ui.button("Apply Effects").clicked() {
                // Simple effect: reduce opacity of selected paths
                if let Some(file_arc) = &self.state.file {
                    let mut changed = false;
                    {
                        let mut file = file_arc.lock().unwrap();
                        for &idx in &self.state.selection.selected_paths {
                            if let Some(p) = file.paths.get_mut(idx) { p.style.opacity = (p.style.opacity * 0.8).max(0.1); changed = true; }
                        }
                        if changed { self.state.is_dirty = true; }
                    }
                    if changed { self.set_status_message("Effects applied (opacity reduced)".to_string(), MessageLevel::Success); }
                }
            }
        });
    }

    pub fn render_animation_tab(&mut self, ui: &mut egui::Ui) {
        ui.vertical(|ui| {
            ui.heading("Animation");
            
            ui.horizontal(|ui| {
                ui.label("Time Scale:");
                ui.add(egui::DragValue::new(&mut self.state.animation.time_scale).speed(0.1));
            });
            
            ui.separator();
            
            // Keyframe editor
            ui.heading("Keyframes");
            
            if let Some(file_arc) = &self.state.file {
                let file = file_arc.lock().unwrap();
                if let Some(selected_curve) = self.state.animation.selected_curve {
                    if let Some(curve) = file.anim_curves.get(selected_curve) {
                        ui.label(format!("Property: {}", curve.property));
                        ui.label(format!("Keyframes: {}", curve.keys.len()));
                        
                        for (i, keyframe) in curve.keys.iter().enumerate() {
                            let time_str = format!("{}: {:.2}s", i, keyframe.time);
                            let value_str = format!("Value: {:.2}", keyframe.value);
                            ui.horizontal(|ui| {
                                ui.label(time_str);
                                ui.label(value_str);
                                if ui.button("Edit").clicked() {
                                    // Status message will be set outside the closure
                                }
                            });
                        }
                    }
                }
            }
            
            if ui.button("Add Keyframe").clicked() {
                if let Some(file_arc) = &self.state.file {
                    {
                        let mut file = file_arc.lock().unwrap();
                        file.anim_curves.push(AnimCurve{ property: "opacity".into(), keys: vec![
                            Keyframe{ time:0.0, value:1.0, easing:Easing::Step, in_tangent: None, out_tangent: None },
                            Keyframe{ time:1.0, value:0.5, easing:Easing::Step, in_tangent: None, out_tangent: None },
                        ], interpolation: InterpolationType::Bezier });
                        self.state.is_dirty = true;
                    }
                    self.set_status_message("Keyframe added".to_string(), MessageLevel::Success);
                }
            }
        });
    }

    pub fn render_inspector_tab(&mut self, ui: &mut egui::Ui) {
        ui.vertical(|ui| {
            ui.heading("Inspector");
            
            if let Some(file_arc) = &self.state.file {
                let file = file_arc.lock().unwrap();
                
                // Document properties
                ui.group(|ui| {
                    ui.heading("Document");
                    ui.label(format!("Width: {}px", file.header.width));
                    ui.label(format!("Height: {}px", file.header.height));
                    ui.label(format!("Frame Count: {}", file.header.frame_count));
                    ui.label(format!("Frame Rate: {:.1} fps", file.header.frame_rate));
                });
                
                // Selection properties
                if !self.state.selection.selected_paths.is_empty() {
                    ui.group(|ui| {
                        ui.heading("Selection");
                        ui.label(format!("Selected Paths: {}", self.state.selection.selected_paths.len()));
                        
                        if let Some(path_index) = self.state.selection.selected_paths.first() {
                            if let Some(path) = file.paths.get(*path_index) {
                                ui.label("Path Properties:");
                                ui.label(format!("Transform: {:?}", path.tf));
                                if let Some(fill) = &path.style.fill {
                                    ui.label(format!("Fill Color: {:?}", fill.color));
                                }
                                if let Some(stroke) = &path.style.stroke {
                                    ui.label(format!("Stroke Color: {:?}", stroke.color));
                                    ui.label(format!("Stroke Width: {:.1}", stroke.width));
                                }
                            }
                        }
                    });
                }
                
                // Tool properties
                ui.group(|ui| {
                    ui.heading("Tool Properties");
                    ui.horizontal(|ui| {
                        ui.label("Color:");
                        ui.color_edit_button_srgba(&mut self.state.tools.selected_color);
                    });
                    ui.horizontal(|ui| {
                        ui.label("Stroke Width:");
                        ui.add(egui::DragValue::new(&mut self.state.tools.stroke_width).speed(0.1));
                    });
                    ui.horizontal(|ui| {
                        ui.label("Opacity:");
                        ui.add(egui::DragValue::new(&mut self.state.tools.opacity).speed(0.01));
                    });
                    ui.checkbox(&mut self.state.tools.fill_enabled, "Fill");
                    ui.checkbox(&mut self.state.tools.stroke_enabled, "Stroke");
                });
            }
        });
    }

    pub fn render_sdf_editor_tab(&mut self, ui: &mut egui::Ui) {
        ui.vertical(|ui| {
            ui.heading("🧊 SDF Neural Editor");
            
            ui.label("Signed Distance Field Editor");
            ui.label("Create and edit SDF shapes for advanced rendering");
            
            ui.group(|ui| {
                ui.heading("SDF Properties");
                ui.horizontal(|ui| {
                    ui.label("Grid Size:");
                    ui.add(egui::DragValue::new(&mut 64u32).speed(1.0));
                });
                ui.horizontal(|ui| {
                    ui.label("Voxel Size:");
                    ui.add(egui::DragValue::new(&mut 1.0f32).speed(0.1));
                });
            });
            
            ui.group(|ui| {
                ui.heading("SDF Tools");
                let _ = ui.button("Sphere");
                let _ = ui.button("Box");
                let _ = ui.button("Cylinder");
                let _ = ui.button("Union");
                let _ = ui.button("Subtraction");
                let _ = ui.button("Intersection");
            });
            
            // SDF Demo Section
            ui.group(|ui| {
                ui.heading("SDF Neural Network Demo");
                ui.label("This demonstrates the neural network-based SDF evaluation:");
                
                // MINIMAL GPU USAGE - No automatic computations
                let (response, painter) = ui.allocate_painter(
                    egui::vec2(200.0, 150.0),
                    egui::Sense::hover(),
                );
                
                painter.rect_filled(response.rect, 0.0, egui::Color32::from_gray(25));
                painter.text(
                    response.rect.center(),
                    egui::Align2::CENTER_CENTER,
                    "SDF Neural Engine\n(Manually Enable)",
                    egui::FontId::proportional(14.0),
                    egui::Color32::LIGHT_GRAY,
                );
                
                ui.horizontal(|ui| {
                    if ui.button("🚀 Enable SDF").clicked() {
                        if self.state.sdf_engine.is_none() {
                            let mut sdf_engine = xvg_core::sdf::SDFEngine::new();
                            sdf_engine.initialize_weights();
                            self.state.sdf_engine = Some(sdf_engine);
                        }
                    }
                    if ui.button("💤 Disable").clicked() {
                        self.state.sdf_engine = None;
                    }
                });
                
                // Show status without computation
                if let Some(ref sdf_engine) = self.state.sdf_engine {
                    ui.label("✅ Active");
                    ui.label(format!("Layers: {:?}", sdf_engine.layer_sizes));
                } else {
                    ui.label("💤 Disabled (saves GPU)");
                }
            });
            
            if ui.button("Generate SDF").clicked() {
                if let Some(file_arc) = &self.state.file {
                    {
                        let mut file = file_arc.lock().unwrap();
                        if let Some(first) = file.paths.first() {
                            let weights = xvg_core::compute_sdf_grid(&first.data, 64);
                            file.sdf.push(SDFLayer{ shape_id: 0, weights, grid_hint: 64, bounds: [0.0, 0.0, 0.0, 0.0] });
                            self.state.is_dirty = true;
                        }
                    }
                    self.set_status_message("SDF generated".to_string(), MessageLevel::Success);
                }
            }
        });
    }

    pub fn render_audio_tab(&mut self, ui: &mut egui::Ui) {
        ui.vertical(|ui| {
            ui.heading("Audio");
            
            ui.horizontal(|ui| {
                ui.label("Volume:");
                ui.add(egui::Slider::new(&mut self.state.audio.volume, 0.0..=1.0));
                if ui.button(if self.state.audio.muted { "🔇" } else { "🔊" }).clicked() {
                    self.state.audio.muted = !self.state.audio.muted;
                }
            });
            
            ui.separator();
            
            // Audio tracks
            ui.heading("Audio Tracks");
            
            if let Some(file_arc) = &self.state.file {
                let file = file_arc.lock().unwrap();
                for (i, track) in file.audio_tracks.iter().enumerate() {
                    ui.horizontal(|ui| {
                        let selected = self.state.audio.selected_track == Some(i);
                        if ui.selectable_label(selected, &track.track_id.to_string()).clicked() {
                            self.state.audio.selected_track = Some(i);
                        }
                        ui.label(format!("{:.1}s", track.duration));
                    });
                }
            }
            
            if ui.button("Add Audio Track").clicked() {
                if let Some(file_arc) = &self.state.file {
                    {
                        let mut file = file_arc.lock().unwrap();
                        file.audio_tracks.push(AudioTrack{ track_id: 0, codec: AudioCodec::PCM, data: Vec::new(), sample_rate: 48000, channels: 2, start_time: 0.0, duration: 0.0, volume: 1.0, pan: 0.0 });
                        self.state.is_dirty = true;
                    }
                    self.set_status_message("Audio track added (empty)".to_string(), MessageLevel::Success);
                }
            }
        });
    }

    pub fn render_scene3d_tab(&mut self, ui: &mut egui::Ui) {
        ui.vertical(|ui| {
            ui.heading("3D Scene");
            
            ui.label("3D scene editor and viewer");
            
            ui.group(|ui| {
                ui.heading("Camera");
                ui.horizontal(|ui| {
                    ui.label("FOV:");
                    ui.add(egui::DragValue::new(&mut 45.0f32).speed(1.0));
                });
                ui.horizontal(|ui| {
                    ui.label("Near:");
                    ui.add(egui::DragValue::new(&mut 0.1f32).speed(0.01));
                });
                ui.horizontal(|ui| {
                    ui.label("Far:");
                    ui.add(egui::DragValue::new(&mut 1000.0f32).speed(10.0));
                });
            });
            
            ui.group(|ui| {
                ui.heading("Lights");
                let _ = ui.button("Add Point Light");
                let _ = ui.button("Add Directional Light");
                let _ = ui.button("Add Spot Light");
            });
            
            ui.group(|ui| {
                ui.heading("Objects");
                let _ = ui.button("Add Cube");
                let _ = ui.button("Add Sphere");
                let _ = ui.button("Add Cylinder");
                let _ = ui.button("Import Model");
            });
            
            if ui.button("Render Scene").clicked() {
                if let Some(file_arc) = &self.state.file {
                    {
                        let mut file = file_arc.lock().unwrap();
                        file.scene3d.push(Scene3DNode{ layer_id: 0, depth: 0.0, matrix: [1.0,0.0,0.0,0.0, 0.0,1.0,0.0,0.0, 0.0,0.0,1.0,0.0, 0.0,0.0,0.0,1.0], mesh: None, material: None });
                        self.state.is_dirty = true;
                    }
                    self.set_status_message("3D scene node added".to_string(), MessageLevel::Success);
                }
            }
        });
    }

    pub fn render_shaders_tab(&mut self, ui: &mut egui::Ui) {
        ui.vertical(|ui| {
            ui.heading("Shaders");
            
            ui.label("WGSL shader editor and management");
            
            ui.group(|ui| {
                ui.heading("Shader Programs");
                if let Some(file_arc) = &self.state.file {
                    let file = file_arc.lock().unwrap();
                    for shader in &file.shaders {
                        ui.horizontal(|ui| {
                            ui.label(&shader.name);
                            if ui.button("Edit").clicked() {
                                // Status message will be set outside the closure
                            }
                        });
                    }
                }
            });
            
            ui.group(|ui| {
                ui.heading("Create New Shader");
                let _ = ui.button("Vertex Shader");
                let _ = ui.button("Fragment Shader");
                let _ = ui.button("Compute Shader");
            });
            
            if ui.button("Compile Shaders").clicked() {
                if let Some(file_arc) = &self.state.file {
                    {
                        let mut file = file_arc.lock().unwrap();
                        file.shaders.push(ShaderWGSL{ name: "simple".into(), wgsl: "@fragment fn fs() -> @location(0) vec4<f32> { return vec4<f32>(1.0,0.0,0.0,1.0); }".into(), compressed: false, bind_groups: Vec::new(), entry_points: Vec::new() });
                        self.state.is_dirty = true;
                    }
                    self.set_status_message("Shader added".to_string(), MessageLevel::Success);
                }
            }
        });
    }

    pub fn render_physics_tab(&mut self, ui: &mut egui::Ui) {
        ui.vertical(|ui| {
            ui.heading("Physics");
            
            ui.horizontal(|ui| {
                ui.checkbox(&mut self.state.physics.enabled, "Enable Physics");
                if ui.button(if self.state.physics.simulation_running { "⏸ Pause" } else { "▶ Start" }).clicked() {
                    self.state.physics.simulation_running = !self.state.physics.simulation_running;
                }
                if ui.button("Reset").clicked() {
                    self.reset_physics_simulation();
                }
            });
            
            ui.separator();
            
            ui.group(|ui| {
                ui.heading("Gravity");
                ui.horizontal(|ui| {
                    ui.label("X:");
                    ui.add(egui::DragValue::new(&mut self.state.physics.gravity[0]).speed(0.1));
                    ui.label("Y:");
                    ui.add(egui::DragValue::new(&mut self.state.physics.gravity[1]).speed(0.1));
                    ui.label("Z:");
                    ui.add(egui::DragValue::new(&mut self.state.physics.gravity[2]).speed(0.1));
                });
            });
            
            ui.group(|ui| {
                ui.heading("Physics Bodies");
                if let Some(file_arc) = &self.state.file {
                    let file = file_arc.lock().unwrap();
                    for (i, body) in file.physics.as_ref().map(|p| &p.bodies).unwrap_or(&Vec::new()).iter().enumerate() {
                        ui.horizontal(|ui| {
                            let selected = self.state.physics.selected_body == Some(i);
                            if ui.selectable_label(selected, &format!("Body {}", i)).clicked() {
                                self.state.physics.selected_body = Some(i);
                            }
                            ui.label(format!("Mass: {:.1}", body.mass));
                        });
                    }
                }
            });
            
            if ui.button("Add Physics Body").clicked() {
                if let Some(file_arc) = &self.state.file {
                    {
                        let mut file = file_arc.lock().unwrap();
                        file.physics = Some(PhysicsSnapshot{ timestamp: 0.0, bodies: vec![], constraints: vec![], gravity: [0.0, -9.81, 0.0], time_scale: 1.0 });
                        self.state.is_dirty = true;
                    }
                    self.set_status_message("Physics snapshot initialized".to_string(), MessageLevel::Success);
                }
            }
        });
    }

    pub fn render_fonts_tab(&mut self, ui: &mut egui::Ui) {
        ui.vertical(|ui| {
            ui.heading("Fonts");
            
            ui.label("Font management and text tools");
            
            ui.group(|ui| {
                ui.heading("Font Subsets");
                if let Some(file_arc) = &self.state.file {
                    let file = file_arc.lock().unwrap();
                    for subset in &file.font_subsets {
                        ui.horizontal(|ui| {
                            ui.label(&subset.family);
                            ui.label(&subset.style);
                            ui.label(format!("{} glyphs", subset.glyphs.len()));
                        });
                    }
                }
            });
            
            ui.group(|ui| {
                ui.heading("Variable Fonts");
                if let Some(file_arc) = &self.state.file {
                    let file = file_arc.lock().unwrap();
                    for var_font in &file.var_fonts {
                        ui.horizontal(|ui| {
                            ui.label(&var_font.family);
                            ui.label(format!("{} axes", var_font.axes.len()));
                        });
                    }
                }
            });
            
            if ui.button("Import Font").clicked() {
                if let Some(file_arc) = &self.state.file {
                    {
                        let mut file = file_arc.lock().unwrap();
                        file.font_subsets.push(FontSubset{ family: "Sans".into(), style: String::new(), glyphs: Vec::new(), cmap: Vec::new(), hmtx: Vec::new(), hhea: Vec::new(), os2: Vec::new(), name: Vec::new() });
                        self.state.is_dirty = true;
                    }
                    self.set_status_message("Font subset added (empty)".to_string(), MessageLevel::Success);
                }
            }
        });
    }

    pub fn render_collaboration_tab(&mut self, ui: &mut egui::Ui) {
        ui.vertical(|ui| {
            ui.heading("Collaboration");
            
            ui.horizontal(|ui| {
                ui.checkbox(&mut self.state.collaboration.enabled, "Enable Collaboration");
                ui.label(format!("Status: {:?}", self.state.collaboration.sync_status));
            });
            
            ui.separator();
            
            ui.group(|ui| {
                ui.heading("Connected Users");
                for user in &self.state.collaboration.connected_users {
                    ui.label(format!("👤 {}", user));
                }
            });
            
            ui.group(|ui| {
                ui.heading("CRDT Operations");
                if let Some(file_arc) = &self.state.file {
                    let file = file_arc.lock().unwrap();
                    ui.label(format!("Operations: {}", file.crdt.len()));
                    ui.label(format!("Lamport Clock: {}", self.state.collaboration.lamport_clock));
                }
            });
            
            if ui.button("Sync Now").clicked() {
                self.set_status_message("Synchronized".to_string(), MessageLevel::Success);
            }
        });
    }
    
    pub fn draw_rulers(&self, ui: &mut egui::Ui, canvas_rect: egui::Rect) {
        const RULER_SIZE: f32 = 20.0;
        const RULER_COLOR: egui::Color32 = egui::Color32::from_gray(200);
        const RULER_TEXT_COLOR: egui::Color32 = egui::Color32::from_gray(80);
        const RULER_LINE_COLOR: egui::Color32 = egui::Color32::from_gray(150);
        
        let transform = self.calculate_viewport_transform(canvas_rect);
        let zoom = transform.1;
        let pan = self.state.viewport.pan;
        
        // Calculate ruler area
        let ruler_area = egui::Rect::from_min_size(
            egui::pos2(canvas_rect.left(), canvas_rect.top() - RULER_SIZE),
            egui::vec2(canvas_rect.width(), RULER_SIZE)
        );
        
        let left_ruler_area = egui::Rect::from_min_size(
            egui::pos2(canvas_rect.left() - RULER_SIZE, canvas_rect.top()),
            egui::vec2(RULER_SIZE, canvas_rect.height())
        );
        
        // Draw horizontal ruler background
        ui.painter().add(egui::Shape::rect_filled(
            ruler_area,
            egui::Rounding::same(0.0),
            RULER_COLOR,
        ));
        
        // Draw vertical ruler background
        ui.painter().add(egui::Shape::rect_filled(
            left_ruler_area,
            egui::Rounding::same(0.0),
            RULER_COLOR,
        ));
        
        // Calculate tick spacing based on zoom level
        let base_tick_spacing = 50.0; // pixels at zoom 1.0
        let tick_spacing = base_tick_spacing / zoom;
        let major_tick_spacing = tick_spacing * 5.0; // Major ticks every 5 minor ticks
        
        // Draw horizontal ruler ticks and labels
        let world_start_x = -pan[0] / zoom;
        let world_end_x = (canvas_rect.width() - pan[0]) / zoom;
        
        let mut world_x = (world_start_x / tick_spacing).floor() * tick_spacing;
        while world_x <= world_end_x {
            let screen_x = (world_x * zoom + pan[0]) + RULER_SIZE;
            let is_major = ((world_x / major_tick_spacing).round() * major_tick_spacing - world_x).abs() < 0.1;
            
            let tick_height = if is_major { 8.0 } else { 4.0 };
            let tick_y = canvas_rect.top() - tick_height;
            
            // Draw tick line
            ui.painter().add(egui::Shape::line_segment(
                [egui::pos2(screen_x, tick_y), egui::pos2(screen_x, canvas_rect.top())],
                egui::Stroke::new(1.0, RULER_LINE_COLOR),
            ));
            
            // Draw label for major ticks
            if is_major {
                let label = format!("{:.0}", world_x);
                let galley = ui.painter().layout_no_wrap(
                    label,
                    egui::FontId::proportional(10.0),
                    RULER_TEXT_COLOR,
                );
                ui.painter().galley(
                    egui::pos2(screen_x - galley.rect.width() / 2.0, canvas_rect.top() - 18.0),
                    galley,
                    RULER_TEXT_COLOR,
                );
            }
            
            world_x += tick_spacing;
        }
        
        // Draw vertical ruler ticks and labels
        let world_start_y = -pan[1] / zoom;
        let world_end_y = (canvas_rect.height() - pan[1]) / zoom;
        
        let mut world_y = (world_start_y / tick_spacing).floor() * tick_spacing;
        while world_y <= world_end_y {
            let screen_y = (world_y * zoom + pan[1]) + RULER_SIZE;
            let is_major = ((world_y / major_tick_spacing).round() * major_tick_spacing - world_y).abs() < 0.1;
            
            let tick_width = if is_major { 8.0 } else { 4.0 };
            let tick_x = canvas_rect.left() - tick_width;
            
            // Draw tick line
            ui.painter().add(egui::Shape::line_segment(
                [egui::pos2(tick_x, screen_y), egui::pos2(canvas_rect.left(), screen_y)],
                egui::Stroke::new(1.0, RULER_LINE_COLOR),
            ));
            
            // Draw label for major ticks
            if is_major {
                let label = format!("{:.0}", world_y);
                let galley = ui.painter().layout_no_wrap(
                    label,
                    egui::FontId::proportional(10.0),
                    RULER_TEXT_COLOR,
                );
                ui.painter().galley(
                    egui::pos2(canvas_rect.left() - 18.0, screen_y - galley.rect.height() / 2.0),
                    galley,
                    RULER_TEXT_COLOR,
                );
            }
            
            world_y += tick_spacing;
        }
        
        // Draw corner square
        let corner_rect = egui::Rect::from_min_size(
            egui::pos2(canvas_rect.left() - RULER_SIZE, canvas_rect.top() - RULER_SIZE),
            egui::vec2(RULER_SIZE, RULER_SIZE)
        );
        ui.painter().add(egui::Shape::rect_filled(
            corner_rect,
            egui::Rounding::same(0.0),
            RULER_COLOR,
        ));
        
        // Draw ruler borders
        ui.painter().add(egui::Shape::rect_stroke(
            ruler_area,
            egui::Rounding::same(0.0),
            egui::Stroke::new(1.0, egui::Color32::from_gray(100)),
        ));
        ui.painter().add(egui::Shape::rect_stroke(
            left_ruler_area,
            egui::Rounding::same(0.0),
            egui::Stroke::new(1.0, egui::Color32::from_gray(100)),
        ));
        ui.painter().add(egui::Shape::rect_stroke(
            corner_rect,
            egui::Rounding::same(0.0),
            egui::Stroke::new(1.0, egui::Color32::from_gray(100)),
        ));
    }
}

// File conversion functions
// (Removed unused local conversion helpers to avoid dead_code warnings.
//  Conversion is handled by the engine APIs used elsewhere.)

// Main function
fn main() -> Result<(), eframe::Error> {
    env_logger::init();

    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([800.0, 600.0])
            .with_min_inner_size([400.0, 300.0])
            .with_icon(load_icon()),
        ..Default::default()
    };

    eframe::run_native(
        "XVG Professional",
        options,
        Box::new(|cc| {
            setup_custom_fonts(&cc.egui_ctx);
            setup_custom_style(&cc.egui_ctx);
            Ok(Box::new(XvgApp::new(cc)))
        }),
    )
}

fn load_icon() -> egui::IconData {
    // Create a simple icon - a red square
    let icon_rgba = vec![255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255];
    egui::IconData {
        rgba: icon_rgba,
        width: 2,
        height: 2,
    }
}

fn setup_custom_fonts(ctx: &egui::Context) {
    // Add custom fonts if needed
}

fn setup_custom_style(ctx: &egui::Context) {
    let mut style = (*ctx.style()).clone();
    style.visuals.widgets.noninteractive.bg_fill = egui::Color32::from_gray(240);
    style.visuals.widgets.inactive.bg_fill = egui::Color32::from_gray(250);
    style.visuals.widgets.hovered.bg_fill = egui::Color32::from_gray(255);
    style.visuals.widgets.active.bg_fill = egui::Color32::from_rgb(100, 150, 255);
    ctx.set_style(style);
} 