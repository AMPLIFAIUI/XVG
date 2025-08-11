#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use eframe::egui;
use std::path::PathBuf;
use xvg_core::*;
use std::path::Path;
use image::{ImageBuffer, Rgba};
use usvg::{Tree, Options, TreeParsing};
use std::collections::HashMap;

// ---------- APP STATE ----------
#[derive(Default)]
pub struct AppState {
    file: Option<File>,
    path: Option<PathBuf>,
    selected_tab: usize,
    viewport_zoom: f32,
    viewport_pan: [f32; 2],
    timeline_playhead: f32,
    timeline_playing: bool,
    selected_path: Option<usize>,
    selected_shader: Option<usize>,
    selected_3d_node: Option<usize>,
    selected_audio_track: Option<usize>,
    selected_effect: Option<usize>,
    // Drawing tools
    current_tool: DrawingTool,
    drawing_mode: bool,
    drawing_points: Vec<egui::Pos2>,
    selected_color: egui::Color32,
    fill_color: egui::Color32,
    stroke_width: f32,
    // Path editing
    selected_nodes: Vec<usize>,
    show_nodes: bool,
    // Selection and movement
    selected_paths: Vec<usize>,
    dragging_selection: bool,
    drag_start: Option<egui::Pos2>,
    drag_offset: [f32; 2],
    // Selection box
    selection_box_start: Option<egui::Pos2>,
    selection_box_end: Option<egui::Pos2>,
    drawing_selection_box: bool,
    // View options (matching Tkinter)
    show_grid: bool,
    show_rulers: bool,
    show_layers_panel: bool,
    show_properties_panel: bool,
    show_timeline_panel: bool,
    // Advanced features
    show_sdf: bool,
    show_3d: bool,
    show_physics: bool,
    show_audio: bool,
    show_effects: bool,
    // Animation
    animation_time: f32,
    animation_playing: bool,
    // Physics
    physics_enabled: bool,
    physics_gravity: [f32; 3],
    physics_time_scale: f32,
    // Audio
    audio_volume: f32,
    audio_muted: bool,
    // Effects
    effect_parameters: HashMap<String, f32>,
    // 3D
    camera_position: [f32; 3],
    camera_rotation: [f32; 3],
    // Collaboration
    collaboration_enabled: bool,
    local_author_id: u16,
    lamport_clock: u64,
    // Layers
    layers: Vec<Layer>,
    selected_layer: Option<usize>,
}

#[derive(Default, Clone, Copy, PartialEq)]
enum DrawingTool {
    #[default]
    Select,
    SelectBox,
    Rectangle,
    Circle,
    Ellipse,
    Line,
    Freehand,
    Text,
}

#[derive(Debug, Clone)]
pub struct Layer {
    pub id: String,
    pub name: String,
    pub visible: bool,
    pub locked: bool,
    pub opacity: f32,
    pub blend_mode: String,
    pub path_indices: Vec<usize>,
}

impl Default for Layer {
    fn default() -> Self {
        Self {
            id: "default".to_string(),
            name: "Default Layer".to_string(),
            visible: true,
            locked: false,
            opacity: 1.0,
            blend_mode: "normal".to_string(),
            path_indices: Vec::new(),
        }
    }
}

// ---------- MAIN ----------
fn main() {
    // Set up dark theme
    let options = eframe::NativeOptions {
        initial_window_size: Some(egui::vec2(1400.0, 900.0)),
        min_window_size: Some(egui::vec2(800.0, 600.0)),
        ..Default::default()
    };
    
    eframe::run_native(
        "XVG Professional",
        options,
        Box::new(|cc| {
            // Apply dark theme
            setup_dark_theme(&cc.egui_ctx);
            Box::new(XvgApp::default())
        }),
    )
    .unwrap();
}

fn setup_dark_theme(ctx: &egui::Context) {
    // Dark theme colors
    let mut style = (*ctx.style()).clone();
    
    // Background colors
    style.visuals.widgets.noninteractive.bg_fill = egui::Color32::from_rgb(40, 40, 40);
    style.visuals.widgets.inactive.bg_fill = egui::Color32::from_rgb(50, 50, 50);
    style.visuals.widgets.hovered.bg_fill = egui::Color32::from_rgb(60, 60, 60);
    style.visuals.widgets.active.bg_fill = egui::Color32::from_rgb(70, 70, 70);
    
    // Panel backgrounds
    style.visuals.panel_fill = egui::Color32::from_rgb(35, 35, 35);
    style.visuals.window_fill = egui::Color32::from_rgb(30, 30, 30);
    style.visuals.faint_bg_color = egui::Color32::from_rgb(45, 45, 45);
    
    // Text colors
    style.visuals.text_color = egui::Color32::from_rgb(220, 220, 220);
    style.visuals.weak_text_color = egui::Color32::from_rgb(150, 150, 150);
    
    // Border colors
    style.visuals.widgets.noninteractive.bg_stroke.color = egui::Color32::from_rgb(80, 80, 80);
    style.visuals.widgets.inactive.bg_stroke.color = egui::Color32::from_rgb(90, 90, 90);
    style.visuals.widgets.hovered.bg_stroke.color = egui::Color32::from_rgb(100, 100, 100);
    style.visuals.widgets.active.bg_stroke.color = egui::Color32::from_rgb(120, 120, 120);
    
    // Selection colors
    style.visuals.selection.bg_fill = egui::Color32::from_rgb(0, 120, 215);
    style.visuals.selection.stroke.color = egui::Color32::from_rgb(0, 140, 235);
    
    // Hyperlink colors
    style.visuals.hyperlink_color = egui::Color32::from_rgb(86, 156, 214);
    
    // Apply the style
    ctx.set_style(style);
}

// ---------- APP ----------
#[derive(Default)]
pub struct XvgApp {
    state: AppState,
    command_history: CommandHistory,
    recent_files: Vec<PathBuf>,
    preferences: AppPreferences,
}

impl eframe::App for XvgApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Menu bar (matching Tkinter structure)
        egui::TopBottomPanel::top("menu_bar").show(ctx, |ui| {
            egui::menu::bar(ui, |ui| {
                // File menu
                ui.menu_button("File", |ui| {
                    if ui.button("New Document").clicked() {
                        self.state.file = Some(File::default());
                        self.state.path = None;
                    }
                    ui.separator();
                    if ui.button("Open…").clicked() {
                        if let Some(path) = rfd::FileDialog::new()
                            .add_filter("XVG Files", &["xvg"])
                            .add_filter("SVG Files", &["svg"])
                            .add_filter("PNG Files", &["png"])
                            .add_filter("All Files", &["*"])
                            .pick_file() 
                        {
                            self.load_file(&path);
                        }
                    }
                    if ui.button("Save").clicked() {
                        if let Some(path) = &self.state.path {
                            self.save_file(path);
                        } else {
                            if let Some(path) = rfd::FileDialog::new()
                                .add_filter("XVG Files", &["xvg"])
                                .save_file() 
                            {
                                self.save_file(&path);
                            }
                        }
                    }
                    if ui.button("Save As…").clicked() {
                        if let Some(path) = rfd::FileDialog::new()
                            .add_filter("XVG Files", &["xvg"])
                            .save_file() 
                        {
                            self.save_file(&path);
                        }
                    }
                    ui.separator();
                    if ui.button("Import SVG…").clicked() {
                        if let Some(path) = rfd::FileDialog::new()
                            .add_filter("SVG Files", &["svg"])
                            .pick_file() 
                        {
                            if let Ok(file) = convert_svg_to_xvg(&path) {
                                self.state.file = Some(file);
                                self.state.path = Some(path);
                            }
                        }
                    }
                    if ui.button("Import PNG…").clicked() {
                        if let Some(path) = rfd::FileDialog::new()
                            .add_filter("PNG Files", &["png"])
                            .pick_file() 
                        {
                            if let Ok(file) = convert_png_to_xvg(&path) {
                                self.state.file = Some(file);
                                self.state.path = Some(path);
                            }
                        }
                    }
                    ui.separator();
                    if ui.button("Export PNG…").clicked() {
                        if let Some(path) = rfd::FileDialog::new()
                            .add_filter("PNG Files", &["png"])
                            .save_file() 
                        {
                            if let Some(file) = &self.state.file {
                                if let Ok(png_data) = convert_xvg_to_png(file, 1024, 1024) {
                                    let _ = std::fs::write(path, png_data);
                                }
                            }
                        }
                    }
                    if ui.button("Export SVG…").clicked() {
                        if let Some(path) = rfd::FileDialog::new()
                            .add_filter("SVG Files", &["svg"])
                            .save_file() 
                        {
                            if let Some(file) = &self.state.file {
                                if let Ok(svg_data) = convert_xvg_to_svg(file) {
                                    let _ = std::fs::write(path, svg_data);
                                }
                            }
                        }
                    }
                    ui.separator();
                    if ui.button("Exit").clicked() {
                        std::process::exit(0);
                    }
                });
                
                // Edit menu
                ui.menu_button("Edit", |ui| {
                    if ui.button("Undo").clicked() {
                        undo_operation(&mut self.command_history, &mut self.state);
                    }
                    if ui.button("Redo").clicked() {
                        redo_operation(&mut self.command_history, &mut self.state);
                    }
                    ui.separator();
                    if ui.button("Cut").clicked() {
                        cut_selected(&mut self.state);
                    }
                    if ui.button("Copy").clicked() {
                        copy_selected(&mut self.state);
                    }
                    if ui.button("Paste").clicked() {
                        paste_clipboard(&mut self.state);
                    }
                    if ui.button("Delete").clicked() {
                        delete_selected_paths(&mut self.state);
                    }
                    ui.separator();
                    if ui.button("Select All").clicked() {
                        select_all_paths(&mut self.state);
                    }
                });
                
                // View menu
                ui.menu_button("View", |ui| {
                    ui.checkbox(&mut self.state.show_grid, "Show Grid");
                    ui.checkbox(&mut self.state.show_rulers, "Show Rulers");
                    ui.checkbox(&mut self.state.show_nodes, "Show Nodes");
                    ui.separator();
                    if ui.button("Zoom In").clicked() {
                        self.state.viewport_zoom = (self.state.viewport_zoom * 1.2).min(10.0);
                    }
                    if ui.button("Zoom Out").clicked() {
                        self.state.viewport_zoom = (self.state.viewport_zoom / 1.2).max(0.1);
                    }
                    if ui.button("Reset View").clicked() {
                        self.state.viewport_zoom = 1.0;
                        self.state.viewport_pan = [0.0, 0.0];
                    }
                });
                
                // Tools menu
                ui.menu_button("Tools", |ui| {
                    ui.selectable_value(&mut self.state.current_tool, DrawingTool::Select, "Select Tool");
                    ui.selectable_value(&mut self.state.current_tool, DrawingTool::Rectangle, "Rectangle Tool");
                    ui.selectable_value(&mut self.state.current_tool, DrawingTool::Circle, "Circle Tool");
                    ui.selectable_value(&mut self.state.current_tool, DrawingTool::Line, "Line Tool");
                    ui.selectable_value(&mut self.state.current_tool, DrawingTool::Freehand, "Freehand Tool");
                    ui.selectable_value(&mut self.state.current_tool, DrawingTool::Text, "Text Tool");
                    ui.separator();
                    if ui.button("Generate SDF").clicked() {
                        self.state.selected_tab = 3; // SDF Editor tab
                    }
                    if ui.button("Apply Shader").clicked() {
                        self.state.selected_tab = 6; // Shaders tab
                    }
                    if ui.button("3D Extrude").clicked() {
                        self.state.selected_tab = 5; // 3D Scene tab
                    }
                });
                
                // Window menu
                ui.menu_button("Window", |ui| {
                    ui.checkbox(&mut self.state.show_layers_panel, "Layers Panel");
                    ui.checkbox(&mut self.state.show_properties_panel, "Properties Panel");
                    ui.checkbox(&mut self.state.show_timeline_panel, "Timeline Panel");
                });
                
                // Help menu
                ui.menu_button("Help", |ui| {
                    if ui.button("About").clicked() {
                        // TODO: Show about dialog
                    }
                });
            });
        });
        
        // Toolbar (matching Tkinter toolbar)
        egui::TopBottomPanel::top("toolbar").show(ctx, |ui| {
            ui.horizontal(|ui| {
                // Tool buttons (matching Tkinter layout)
                ui.group(|ui| {
                    ui.label("Tools:");
                    ui.horizontal(|ui| {
                        ui.selectable_value(&mut self.state.current_tool, DrawingTool::Select, "🔍");
                        ui.selectable_value(&mut self.state.current_tool, DrawingTool::SelectBox, "📦");
                        ui.selectable_value(&mut self.state.current_tool, DrawingTool::Rectangle, "⬜");
                        ui.selectable_value(&mut self.state.current_tool, DrawingTool::Circle, "⭕");
                        ui.selectable_value(&mut self.state.current_tool, DrawingTool::Ellipse, "🔵");
                        ui.selectable_value(&mut self.state.current_tool, DrawingTool::Line, "📏");
                        ui.selectable_value(&mut self.state.current_tool, DrawingTool::Freehand, "✏️");
                        ui.selectable_value(&mut self.state.current_tool, DrawingTool::Text, "T");
                    });
                });
                
                ui.separator();
                
                // Color controls (matching Tkinter layout)
                ui.group(|ui| {
                    ui.label("Colors:");
                    ui.horizontal(|ui| {
                        ui.label("Stroke:");
                        ui.color_edit_button_srgba(&mut self.state.selected_color);
                        ui.label("Fill:");
                        ui.color_edit_button_srgba(&mut self.state.fill_color);
                    });
                });
                
                ui.separator();
                
                // Stroke width (matching Tkinter layout)
                ui.group(|ui| {
                    ui.label("Stroke Width:");
                    ui.add(egui::Slider::new(&mut self.state.stroke_width, 0.5..=50.0).text(""));
                });
                
                ui.separator();
                
                // Advanced tools (matching Tkinter layout)
                ui.group(|ui| {
                    ui.label("Advanced:");
                    ui.horizontal(|ui| {
                        if ui.button("SDF").clicked() {
                            self.state.selected_tab = 3; // SDF Editor tab
                        }
                        if ui.button("Shader").clicked() {
                            self.state.selected_tab = 6; // Shaders tab
                        }
                        if ui.button("3D").clicked() {
                            self.state.selected_tab = 5; // 3D Scene tab
                        }
                    });
                });
                
                ui.separator();
                
                // Status info (matching Tkinter status)
                ui.group(|ui| {
                    if let Some(file) = &self.state.file {
                        ui.label(format!("Paths: {}", file.paths.len()));
                        ui.label(format!("Zoom: {:.1}x", self.state.viewport_zoom));
                    } else {
                        ui.label("No document");
                    }
                });
            });
        });
        
        // Main content area
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.horizontal(|ui| {
                // Left sidebar - Layers (matching Tkinter layout)
                if self.state.show_layers_panel {
                    egui::SidePanel::left("layers_panel")
                        .resizable(true)
                        .default_width(280.0)
                        .show(ctx, |ui| {
                            layers_panel(ui, &mut self.state);
                        });
                }
                
                // Center - Canvas (matching Tkinter canvas)
                egui::CentralPanel::default().show(ctx, |ui| {
                    viewport_panel(ui, &mut self.state);
                });
                
                // Right sidebar - Properties (matching Tkinter layout)
                if self.state.show_properties_panel {
                    egui::SidePanel::right("properties_panel")
                        .resizable(true)
                        .default_width(280.0)
                        .show(ctx, |ui| {
                            properties_panel(ui, &mut self.state);
                        });
                }
            });
        });
        
        // Status bar (matching Tkinter status bar)
        egui::TopBottomPanel::bottom("status_bar").show(ctx, |ui| {
            ui.horizontal(|ui| {
                if let Some(file) = &self.state.file {
                    ui.label(format!("Paths: {}", file.paths.len()));
                    ui.label(format!("Assets: {}", file.assets.len()));
                    ui.label(format!("SDF: {}", file.sdf.len()));
                    ui.label(format!("3D: {}", file.scene3d.len()));
                    ui.label(format!("Shaders: {}", file.shaders.len()));
                    ui.label(format!("Effects: {}", file.effects.len()));
                    ui.label(format!("Audio: {}", file.audio_tracks.len()));
                } else {
                    ui.label("No document loaded");
                }
                
                ui.separator();
                
                ui.label(format!("Tool: {:?}", self.state.current_tool));
                ui.label(format!("Zoom: {:.1}x", self.state.viewport_zoom));
                
                if let Some(path) = &self.state.path {
                    ui.label(format!("File: {}", path.file_name().unwrap_or_default().to_string_lossy()));
                }
                
                ui.separator();
                
                ui.label(format!("Selected: {}", self.state.selected_paths.len()));
                ui.label(format!("Canvas: 1024×1024"));
            });
        });
        
        // Request continuous updates for smooth interaction
        ctx.request_repaint();
    }
}

impl Default for XvgApp {
    fn default() -> Self {
        let mut state = AppState::default();
        // Initialize with a default layer
        state.layers.push(Layer::default());
        state.selected_layer = Some(0);
        
        Self {
            state,
            command_history: CommandHistory::new(),
            recent_files: Vec::new(),
            preferences: AppPreferences::default(),
        }
    }
}

impl XvgApp {
    fn load_file(&mut self, path: &Path) {
        println!("📁 Opening file: {}", path.display());
        
        if let Ok(metadata) = std::fs::metadata(path) {
            let file_size = metadata.len();
            println!("📊 File size: {:.1} KB", file_size as f64 / 1024.0);
        }
        
        // Determine file type and load accordingly
        let extension = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
        match extension.as_str() {
            "xvg" => {
                println!("🔧 File type: XVG");
                if let Ok(bytes) = std::fs::read(path) {
                    if let Ok(file) = File::decode(&bytes) {
                        self.state.file = Some(file);
                        self.state.path = Some(path.to_path_buf());
                        println!("✅ XVG file loaded successfully");
                    } else {
                        println!("❌ Failed to decode XVG file");
                    }
                } else {
                    println!("❌ Failed to read XVG file");
                }
            }
            "svg" => {
                println!("🔧 File type: SVG");
                if let Ok(file) = convert_svg_to_xvg(path) {
                    self.state.file = Some(file);
                    self.state.path = Some(path.to_path_buf());
                    println!("✅ SVG file converted and loaded");
                } else {
                    println!("❌ Failed to convert SVG file");
                }
            }
            "png" => {
                println!("🔧 File type: PNG");
                if let Ok(file) = convert_png_to_xvg(path) {
                    self.state.file = Some(file);
                    self.state.path = Some(path.to_path_buf());
                    println!("✅ PNG file converted and loaded");
                } else {
                    println!("❌ Failed to convert PNG file");
                }
            }
            _ => {
                println!("❌ Unsupported file type: {}", extension);
            }
        }
        
        println!("📍 Path: {}", path.display());
        if let Some(file) = &self.state.file {
            println!("File loaded: {} paths", file.paths.len());
        }
    }
    
    fn save_file(&mut self, path: &Path) {
        if let Some(file) = &self.state.file {
            if let Ok(data) = file.encode() {
                if let Ok(_) = std::fs::write(path, data) {
                    self.state.path = Some(path.to_path_buf());
                    println!("✅ File saved successfully: {}", path.display());
                } else {
                    println!("❌ Failed to write file: {}", path.display());
                }
            } else {
                println!("❌ Failed to encode XVG file");
            }
        } else {
            println!("❌ No file to save");
        }
    }
}

// ---------- PANELS ----------
fn viewport_panel(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("🖥️ Viewport");
    
    // Drawing toolbar
    ui.horizontal(|ui| {
        ui.label("Tools:");
        
        // Select tool with tooltip
        let select_button = ui.selectable_value(&mut state.current_tool, DrawingTool::Select, "🔍");
        if select_button.hovered() {
            egui::show_tooltip_at_pointer(ui.ctx(), egui::Id::new("select_tool"), |ui| {
                ui.label("Select Tool - Click to select, drag to move objects");
            });
        }
        
        // Selection box tool with tooltip
        let select_box_button = ui.selectable_value(&mut state.current_tool, DrawingTool::SelectBox, "📦");
        if select_box_button.hovered() {
            egui::show_tooltip_at_pointer(ui.ctx(), egui::Id::new("select_box_tool"), |ui| {
                ui.label("Selection Box - Drag to create selection box around objects");
            });
        }
        
        // Rectangle tool with tooltip
        let rect_button = ui.selectable_value(&mut state.current_tool, DrawingTool::Rectangle, "⬜");
        if rect_button.hovered() {
            egui::show_tooltip_at_pointer(ui.ctx(), egui::Id::new("rect_tool"), |ui| {
                ui.label("Rectangle Tool - Click and drag to draw rectangles");
            });
        }
        
        // Circle tool with tooltip
        let circle_button = ui.selectable_value(&mut state.current_tool, DrawingTool::Circle, "⭕");
        if circle_button.hovered() {
            egui::show_tooltip_at_pointer(ui.ctx(), egui::Id::new("circle_tool"), |ui| {
                ui.label("Circle Tool - Click and drag to draw circles");
            });
        }
        
        // Ellipse tool with tooltip
        let ellipse_button = ui.selectable_value(&mut state.current_tool, DrawingTool::Ellipse, "🔵");
        if ellipse_button.hovered() {
            egui::show_tooltip_at_pointer(ui.ctx(), egui::Id::new("ellipse_tool"), |ui| {
                ui.label("Ellipse Tool - Click and drag to draw ellipses");
            });
        }
        
        // Line tool with tooltip
        let line_button = ui.selectable_value(&mut state.current_tool, DrawingTool::Line, "📏");
        if line_button.hovered() {
            egui::show_tooltip_at_pointer(ui.ctx(), egui::Id::new("line_tool"), |ui| {
                ui.label("Line Tool - Click and drag to draw lines");
            });
        }
        
        // Freehand tool with tooltip
        let freehand_button = ui.selectable_value(&mut state.current_tool, DrawingTool::Freehand, "✏️");
        if freehand_button.hovered() {
            egui::show_tooltip_at_pointer(ui.ctx(), egui::Id::new("freehand_tool"), |ui| {
                ui.label("Freehand Tool - Drag to draw freehand paths");
            });
        }
        
        // Text tool with tooltip
        let text_button = ui.selectable_value(&mut state.current_tool, DrawingTool::Text, "T");
        if text_button.hovered() {
            egui::show_tooltip_at_pointer(ui.ctx(), egui::Id::new("text_tool"), |ui| {
                ui.label("Text Tool - Click to add text");
            });
        }
        
        ui.separator();
        
        ui.label("Color:");
        ui.color_edit_button_srgba(&mut state.selected_color);
        
        ui.label("Stroke:");
        ui.add(egui::Slider::new(&mut state.stroke_width, 1.0..=20.0).text(""));
        
        ui.checkbox(&mut state.show_nodes, "Show Nodes");
        
        ui.separator();
        
        ui.label("Instructions:");
        ui.label("🔍 Select: Pan with drag | ⬜📏 Shapes: Click-drag | ✏️ Freehand: Drag");
        ui.label("Zoom: Ctrl+Wheel | Pan: Middle mouse or Alt+drag | Space: Pan mode");
        
        // Keyboard shortcuts
        if ui.input(|i| i.key_pressed(egui::Key::Space)) {
            // Toggle pan mode
            state.current_tool = if state.current_tool == DrawingTool::Select { 
                DrawingTool::Select 
            } else { 
                DrawingTool::Select 
            };
        }
        
        // Delete selected objects
        if ui.input(|i| i.key_pressed(egui::Key::Delete) || i.key_pressed(egui::Key::Backspace)) {
            if !state.selected_paths.is_empty() {
                delete_selected_paths(state);
            }
        }
    });
    
    // Handle drag and drop for file conversion
    if !ui.input(|i| i.raw.dropped_files.is_empty()) {
        let dropped_files = ui.input(|i| i.raw.dropped_files.clone());
        for dropped_file in dropped_files {
            if let Some(path) = dropped_file.path {
                let path_str = path.to_string_lossy();
                let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                
                if path_str.ends_with(".svg") {
                    if let Ok(file) = convert_svg_to_xvg(&path) {
                        state.file = Some(file);
                        state.path = Some(path.clone());
                        ui.label(format!("✅ Converted SVG: {}", file_name));
                    } else {
                        ui.label(format!("❌ Failed to convert SVG: {}", file_name));
                    }
                } else if path_str.ends_with(".png") {
                    if let Ok(file) = convert_png_to_xvg(&path) {
                        state.file = Some(file);
                        state.path = Some(path.clone());
                        ui.label(format!("✅ Converted PNG: {}", file_name));
                    } else {
                        ui.label(format!("❌ Failed to convert PNG: {}", file_name));
                    }
                } else if path_str.ends_with(".xvg") {
                    if let Ok(bytes) = std::fs::read(&path) {
                        if let Ok(file) = File::decode(&bytes) {
                            state.file = Some(file);
                            state.path = Some(path.clone());
                            ui.label(format!("✅ Loaded XVG: {}", file_name));
                        } else {
                            ui.label(format!("❌ Failed to decode XVG: {}", file_name));
                        }
                    } else {
                        ui.label(format!("❌ Failed to read XVG: {}", file_name));
                    }
                } else {
                    ui.label(format!("❌ Unsupported file type: {}", file_name));
                }
            }
        }
    }
    
    if let Some(file) = &state.file {
        ui.horizontal(|ui| {
            ui.label("Zoom:");
            ui.add(egui::Slider::new(&mut state.viewport_zoom, 0.1..=10.0).text(""));
            ui.label(format!("{:.1}x", state.viewport_zoom));
            
            if ui.button("Reset View").clicked() {
                state.viewport_zoom = 1.0;
                state.viewport_pan = [0.0, 0.0];
            }
            
            ui.label("| Pan: Drag | Zoom: Ctrl+Wheel");
        });
        
        ui.horizontal(|ui| {
            ui.label("Canvas: 1024×1024 (0-1024px range)");
            ui.label(format!("Frames: {}", file.header.frame_count));
            ui.label(format!("FPS: {:.1}", file.header.frame_rate));
            ui.label(format!("Paths: {}", file.paths.len()));
            ui.label(format!("Assets: {}", file.assets.len()));
            ui.label(format!("SDF: {}", file.sdf.len()));
            ui.label(format!("3D: {}", file.scene3d.len()));
            ui.label(format!("Shaders: {}", file.shaders.len()));
            ui.label(format!("Effects: {}", file.effects.len()));
            ui.label(format!("Audio: {}", file.audio_tracks.len()));
        });
        
        // Responsive canvas area with panning support and drag & drop
        let available_size = ui.available_size();
        let canvas_size = egui::vec2(available_size.x, available_size.y - 100.0);
        let (response, painter) = ui.allocate_painter(canvas_size, egui::Sense::drag());
        
        // Handle canvas interaction
        handle_canvas_interaction(ui, &response, state, &painter);
        
        // Render canvas content
        render_canvas(&painter, state, canvas_size);
        
    } else {
        ui.centered_and_justified(|ui| {
            ui.heading("No Document Loaded");
            ui.label("Open a file or create a new document to start editing");
            ui.label("You can drag and drop SVG, PNG, or XVG files here");
        });
    }
}

fn timeline_panel(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("⏱️ Timeline");
    
    if let Some(file) = &state.file {
    ui.horizontal(|ui| {
            if ui.button(if state.timeline_playing { "⏸" } else { "▶" }).clicked() {
                state.timeline_playing = !state.timeline_playing;
            }
            ui.add(egui::Slider::new(&mut state.timeline_playhead, 0.0..=file.header.frame_count as f32).text("Frame"));
            ui.label(format!("{:.1}s", state.timeline_playhead / file.header.frame_rate));
        });
        
        // Timeline ruler
        let timeline_height = 100.0;
        let (response, painter) = ui.allocate_painter(
            egui::vec2(ui.available_width(), timeline_height),
            egui::Sense::click_and_drag(),
        );
        
        // Draw timeline background
        painter.rect_filled(response.rect, 0.0, egui::Color32::from_gray(30));
        
        // Draw frame markers
        let _total_duration = file.header.frame_count as f32 / file.header.frame_rate;
        for i in 0..=file.header.frame_count {
            let x = response.rect.min.x + (i as f32 / file.header.frame_count as f32) * response.rect.width();
            let y = response.rect.min.y;
            
            painter.line_segment(
                [egui::pos2(x, y), egui::pos2(x, y + 20.0)],
                egui::Stroke::new(1.0, egui::Color32::from_gray(100)),
            );
            
            if i % 10 == 0 {
                painter.text(
                    egui::pos2(x, y + 25.0),
                    egui::Align2::CENTER_TOP,
                    &format!("{}", i),
                    egui::FontId::proportional(12.0),
                    egui::Color32::WHITE,
                );
            }
        }
        
        // Draw playhead
        let playhead_x = response.rect.min.x + (state.timeline_playhead / file.header.frame_count as f32) * response.rect.width();
        painter.line_segment(
            [egui::pos2(playhead_x, response.rect.min.y), egui::pos2(playhead_x, response.rect.max.y)],
            egui::Stroke::new(2.0, egui::Color32::RED),
        );
        
    } else {
        ui.label("No file loaded");
    }
}

fn inspector_panel(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("🔍 Inspector");
    
    if let Some(file) = &state.file {
    egui::ScrollArea::vertical().show(ui, |ui| {
            ui.group(|ui| {
                ui.label("File Info");
                ui.label(format!("Dimensions: {}×{}", file.header.width, file.header.height));
                ui.label(format!("Frame Count: {}", file.header.frame_count));
                ui.label(format!("Frame Rate: {:.1} FPS", file.header.frame_rate));
                ui.label(format!("Duration: {:.2}s", file.header.frame_count as f32 / file.header.frame_rate));
            });
            
            ui.group(|ui| {
                ui.label("Content");
            ui.label(format!("Paths: {}", file.paths.len()));
                ui.label(format!("SDF Layers: {}", file.sdf.len()));
            ui.label(format!("Shaders: {}", file.shaders.len()));
                ui.label(format!("Assets: {}", file.assets.len()));
                ui.label(format!("3D Nodes: {}", file.scene3d.len()));
                ui.label(format!("CRDT Entries: {}", file.crdt.len()));
            });
            
            if !file.paths.is_empty() {
                ui.group(|ui| {
                    ui.label("Paths");
                    for (i, _path) in file.paths.iter().enumerate() {
                        let selected = Some(i) == state.selected_path;
                        if ui.selectable_label(selected, &format!("Path {}", i)).clicked() {
                            state.selected_path = Some(i);
                        }
        }
    });
}

            if !file.shaders.is_empty() {
                ui.group(|ui| {
                    ui.label("Shaders");
                    for (i, shader) in file.shaders.iter().enumerate() {
                        let selected = Some(i) == state.selected_shader;
                        if ui.selectable_label(selected, &format!("{}", shader.name)).clicked() {
                            state.selected_shader = Some(i);
                        }
                    }
                });
            }
        });
    } else {
        ui.label("Drop an .xvg file to inspect");
    }
}

fn sdf_panel(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("🧊 SDF Editor");
    
    if let Some(file) = &state.file {
        if !file.sdf.is_empty() {
            ui.label(format!("SDF Layers: {}", file.sdf.len()));
            
            for (i, sdf_layer) in file.sdf.iter().enumerate() {
                ui.group(|ui| {
                    ui.label(format!("SDF Layer {} (Shape {})", i, sdf_layer.shape_id));
                    ui.label(format!("Grid Hint: {}", sdf_layer.grid_hint));
                    ui.label(format!("Weights: {} bytes", sdf_layer.weights.len()));
                    ui.label(format!("Bounds: [{:.1}, {:.1}, {:.1}, {:.1}]", 
                        sdf_layer.bounds[0], sdf_layer.bounds[1], 
                        sdf_layer.bounds[2], sdf_layer.bounds[3]));
                    
                    // SDF visualization
                    let (response, painter) = ui.allocate_painter(
                        egui::vec2(200.0, 200.0),
                        egui::Sense::click_and_drag(),
                    );
                    
                    painter.rect_filled(response.rect, 0.0, egui::Color32::from_gray(20));
                    
                    // Simple SDF visualization (placeholder)
                    let grid_size = 16;
                    for y in 0..grid_size {
                        for x in 0..grid_size {
                            let idx = (y * grid_size + x) % sdf_layer.weights.len();
                            let value = sdf_layer.weights[idx] as f32 / 255.0;
                            let color = egui::Color32::from_gray((value * 255.0) as u8);
                            
                            let rect = egui::Rect::from_min_size(
                                response.rect.min + egui::vec2(x as f32 * (200.0 / grid_size as f32), 
                                                              y as f32 * (200.0 / grid_size as f32)),
                                egui::vec2(200.0 / grid_size as f32 - 1.0, 200.0 / grid_size as f32 - 1.0),
                            );
                            painter.rect_filled(rect, 0.0, color);
                        }
                    }
                });
            }
        } else {
            ui.label("No SDF data in this file");
        }
    } else {
        ui.label("No file loaded");
    }
}

fn audio_panel(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("🎧 Audio Timeline");
    
    if let Some(file) = &state.file {
        let audio_assets: Vec<_> = file.assets.iter()
            .filter(|asset| matches!(asset.ty, AssetType::AudioOpus))
            .collect();
            
        if !audio_assets.is_empty() {
            ui.label(format!("Audio Tracks: {}", audio_assets.len()));
            
            for (i, asset) in audio_assets.iter().enumerate() {
                ui.group(|ui| {
                    ui.label(format!("Track {}: {}", i, asset.name));
                    ui.label(format!("Size: {} bytes", asset.data.len()));
                    ui.label(format!("Compressed: {}", asset.compressed));
                    
                    // Audio waveform visualization (placeholder)
                    let (response, painter) = ui.allocate_painter(
                        egui::vec2(ui.available_width(), 60.0),
                        egui::Sense::click_and_drag(),
                    );
                    
                    painter.rect_filled(response.rect, 0.0, egui::Color32::from_gray(30));
                    
                    // Draw waveform bars
                    let bar_count = 50;
                    for j in 0..bar_count {
                        let idx = (j * asset.data.len()) / bar_count;
                        let value = if idx < asset.data.len() { asset.data[idx] as f32 / 255.0 } else { 0.0 };
                        let height = value * response.rect.height();
                        
                        let rect = egui::Rect::from_min_size(
                            egui::pos2(
                                response.rect.min.x + j as f32 * (response.rect.width() / bar_count as f32),
                                response.rect.center().y - height / 2.0,
                            ),
                            egui::vec2(3.0, height),
                        );
                        painter.rect_filled(rect, 0.0, egui::Color32::from_rgb(100, 200, 100));
                    }
                });
            }
        } else {
            ui.label("No audio tracks found");
        }
    } else {
        ui.label("No file loaded");
    }
}

fn scene3d_panel(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("🌌 3D Scene");
    
    if let Some(file) = &state.file {
        if !file.scene3d.is_empty() {
            ui.label(format!("3D Nodes: {}", file.scene3d.len()));
            
            for (i, node) in file.scene3d.iter().enumerate() {
                ui.group(|ui| {
                    ui.label(format!("Node {}", i));
                    ui.label(format!("Depth: {:.2}", node.depth));
                    
                    // Matrix visualization
                    ui.label("Transform Matrix:");
                    for row in 0..4 {
                        let row_start = row * 4;
                        ui.label(format!("[{:.2}, {:.2}, {:.2}, {:.2}]", 
                            node.matrix[row_start], node.matrix[row_start + 1], 
                            node.matrix[row_start + 2], node.matrix[row_start + 3]));
                    }
                });
            }
        } else {
            ui.label("No 3D scene data");
        }
    } else {
        ui.label("No file loaded");
    }
}

fn shader_panel(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("🎨 Shader Editor");
    
    if let Some(file) = &state.file {
        if !file.shaders.is_empty() {
            ui.horizontal(|ui| {
                ui.label("Shader:");
                egui::ComboBox::from_id_source("shader_select")
                    .selected_text(state.selected_shader.map_or("None".to_string(), |i| file.shaders[i].name.clone()))
                    .show_ui(ui, |ui| {
                        for (i, shader) in file.shaders.iter().enumerate() {
                            if ui.selectable_label(Some(i) == state.selected_shader, &shader.name).clicked() {
                                state.selected_shader = Some(i);
                            }
                        }
                    });
            });
            
            if let Some(selected_idx) = state.selected_shader {
                if let Some(shader) = file.shaders.get(selected_idx) {
                    ui.label(format!("Compressed: {}", shader.compressed));
                    ui.label(format!("Size: {} bytes", shader.wgsl.len()));
                    
                    // WGSL code editor
                    ui.label("WGSL Code:");
                    let mut code = shader.wgsl.clone();
                    ui.add(egui::TextEdit::multiline(&mut code)
                        .desired_rows(20)
                        .desired_width(f32::INFINITY)
                        .font(egui::TextStyle::Monospace));
                }
            }
        } else {
            ui.label("No shaders found");
        }
    } else {
        ui.label("No file loaded");
    }
}

fn physics_panel(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("⚙️ Physics");
    
    if let Some(file) = &state.file {
        if let Some(physics) = &file.physics {
            ui.horizontal(|ui| {
                ui.label("Physics Simulation");
                ui.checkbox(&mut state.physics_enabled, "Enabled");
                ui.label(format!("Bodies: {}", physics.bodies.len()));
                ui.label(format!("Constraints: {}", physics.constraints.len()));
            });
            
            ui.group(|ui| {
                ui.label("Global Settings");
                ui.add(egui::Slider::new(&mut state.physics_gravity[1], -20.0..=20.0).text("Gravity Y"));
                ui.add(egui::Slider::new(&mut state.physics_time_scale, 0.1..=10.0).text("Time Scale"));
                ui.label(format!("Gravity: [{:.1}, {:.1}, {:.1}]", 
                    physics.gravity[0], physics.gravity[1], physics.gravity[2]));
            });
            
            ui.group(|ui| {
                ui.label("Physics Bodies");
                for (i, body) in physics.bodies.iter().enumerate() {
                    let selected = Some(i) == state.selected_path;
                    if ui.selectable_label(selected, &format!("Body {} (Layer {})", i, body.layer_id)).clicked() {
                        state.selected_path = Some(i);
                    }
                    
                    if selected {
                        ui.indent("body_details", |ui| {
                            ui.label(format!("Type: {:?}", body.body_type));
                            ui.label(format!("Mass: {:.2}", body.mass));
                            ui.label(format!("Position: [{:.1}, {:.1}, {:.1}]", 
                                body.translation[0], body.translation[1], body.translation[2]));
                            ui.label(format!("Velocity: [{:.1}, {:.1}, {:.1}]", 
                                body.lin_vel[0], body.lin_vel[1], body.lin_vel[2]));
                        });
                    }
                }
            });
        } else {
            ui.label("No physics data in this file");
            if ui.button("Add Physics Simulation").clicked() {
                if let Some(file) = &mut state.file {
                    file.physics = Some(PhysicsSnapshot {
                        timestamp: 0.0,
                        bodies: Vec::new(),
                        constraints: Vec::new(),
                        gravity: [0.0, -9.81, 0.0],
                        time_scale: 1.0,
                    });
                }
            }
        }
    } else {
        ui.label("No file loaded");
    }
}

fn effects_panel(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("🎨 Effects");
    
    // Handle add effect button outside of file borrow
    let should_add_effect = ui.button("Add Effect").clicked();
    
    if let Some(file) = &state.file {
        ui.label(format!("Effect Passes: {}", file.effects.len()));
        
        for (i, effect) in file.effects.iter().enumerate() {
            let selected = Some(i) == state.selected_effect;
            if ui.selectable_label(selected, &effect.name).clicked() {
                state.selected_effect = Some(i);
            }
            
            if selected {
                ui.group(|ui| {
                    ui.label("Effect Parameters");
                    ui.label(format!("Inputs: {}", effect.inputs.len()));
                    ui.label(format!("Outputs: {}", effect.outputs.len()));
                    ui.label(format!("Parameters: {}", effect.parameters.len()));
                    
                    ui.label("WGSL Code:");
                    ui.add(egui::TextEdit::multiline(&mut effect.wgsl.clone())
                        .desired_rows(10)
                        .desired_width(f32::INFINITY)
                        .font(egui::TextStyle::Monospace));
                });
            }
        }
    } else {
        ui.label("No file loaded");
    }
    
    // Add effect after file borrow is done
    if should_add_effect {
        if let Some(file) = &mut state.file {
            file.add_effect_pass("New Effect".to_string(), 
                "@vertex\nfn vs() -> @builtin(position) vec4<f32> {\n  return vec4<f32>(0.0);\n}\n\n@fragment\nfn fs() -> @location(0) vec4<f32> {\n  return vec4<f32>(1.0);\n}".to_string());
        }
    }
}

fn animation_panel(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("🎬 Animation");
    
    if let Some(file) = &state.file {
        ui.horizontal(|ui| {
            if ui.button(if state.animation_playing { "⏸" } else { "▶" }).clicked() {
                state.animation_playing = !state.animation_playing;
            }
            ui.add(egui::Slider::new(&mut state.animation_time, 0.0..=10.0).text("Time"));
            ui.label(format!("{:.1}s", state.animation_time));
        });
        
        ui.group(|ui| {
            ui.label("Animation Curves");
            for (i, curve) in file.anim_curves.iter().enumerate() {
                ui.label(format!("{}: {}", i, curve.property));
                ui.indent("curve_details", |ui| {
                    ui.label(format!("Keys: {}", curve.keys.len()));
                    ui.label(format!("Interpolation: {:?}", curve.interpolation));
                    
                    for (j, key) in curve.keys.iter().enumerate() {
                        ui.label(format!("Key {}: {:.1}s = {:.2}", j, key.time, key.value));
                    }
                });
            }
        });
        
        if ui.button("Add Animation Curve").clicked() {
            if let Some(file) = &mut state.file {
                file.add_animation_curve("transform.rotate.z".to_string(), vec![
                    Keyframe {
                        time: 0.0,
                        value: 0.0,
                        easing: Easing::Linear,
                        in_tangent: None,
                        out_tangent: None,
                    },
                    Keyframe {
                        time: 2.0,
                        value: 360.0,
                        easing: Easing::Cubic(0.25, 0.1, 0.25, 1.0),
                        in_tangent: None,
                        out_tangent: None,
                    },
                ]);
            }
        }
    } else {
        ui.label("No file loaded");
    }
}

fn fonts_panel(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("🔤 Fonts");
    
    if let Some(file) = &state.file {
        ui.group(|ui| {
            ui.label("Font Subsets");
            for (i, font) in file.font_subsets.iter().enumerate() {
                ui.label(format!("{}: {} ({})", i, font.family, font.style));
                ui.indent("font_details", |ui| {
                    ui.label(format!("Glyphs: {} bytes", font.glyphs.len()));
                    ui.label(format!("CMap: {} bytes", font.cmap.len()));
                    ui.label(format!("HMTX: {} bytes", font.hmtx.len()));
                });
            }
        });
        
        ui.group(|ui| {
            ui.label("Variable Fonts");
            for (i, var_font) in file.var_fonts.iter().enumerate() {
                ui.label(format!("{}: {} ({} axes)", i, var_font.family, var_font.axes.len()));
                for axis in &var_font.axes {
                    ui.label(format!("  {}: {:.1}..{:.1} (default: {:.1})", 
                        axis.tag, axis.min, axis.max, axis.default));
                }
            }
        });
    } else {
        ui.label("No file loaded");
    }
}

fn collaboration_panel(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("🤝 Collaboration");
    
    ui.checkbox(&mut state.collaboration_enabled, "Enable Collaboration");
    
    if state.collaboration_enabled {
        ui.horizontal(|ui| {
            ui.label("Author ID:");
            ui.add(egui::DragValue::new(&mut state.local_author_id));
        });
        
        ui.horizontal(|ui| {
            ui.label("Lamport Clock:");
            ui.add(egui::DragValue::new(&mut state.lamport_clock));
        });
        
        ui.separator();
        
        ui.label("CRDT Operations:");
        if let Some(file) = &state.file {
            ui.label(format!("Total Operations: {}", file.crdt.len()));
            
            for (i, entry) in file.crdt.iter().enumerate() {
                ui.horizontal(|ui| {
                    ui.label(format!("Op {}: Author {}, Lamport {}", i, entry.author, entry.lamport));
                    if ui.button("View").clicked() {
                        let details = show_operation_details(entry);
                        ui.label(details);
                    }
                });
            }
        }
        
        ui.separator();
        
        if ui.button("Add Test Operation").clicked() {
            add_test_crdt_operation(state);
        }
        
        if ui.button("Clear Operations").clicked() {
            clear_crdt_operations(state);
        }
    } else {
        ui.label("Collaboration is disabled");
        ui.label("Enable to start real-time collaboration");
    }
}

fn layers_panel(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("📁 Layers");
    
    // Add layer button
    if ui.button("➕ Add Layer").clicked() {
        let new_layer = Layer {
            id: format!("layer_{}", state.layers.len()),
            name: format!("Layer {}", state.layers.len() + 1),
            visible: true,
            locked: false,
            opacity: 1.0,
            blend_mode: "normal".to_string(),
            path_indices: Vec::new(),
        };
        state.layers.push(new_layer);
    }
    
    ui.separator();
    
    // Layer list
    egui::ScrollArea::vertical().show(ui, |ui| {
        for (i, layer) in state.layers.iter_mut().enumerate() {
            ui.horizontal(|ui| {
                // Visibility toggle
                let mut visible = layer.visible;
                if ui.checkbox(&mut visible, "").clicked() {
                    layer.visible = visible;
                }
                
                // Lock toggle
                let mut locked = layer.locked;
                if ui.checkbox(&mut locked, "").clicked() {
                    layer.locked = locked;
                }
                
                // Layer name (selectable)
                let is_selected = state.selected_layer == Some(i);
                if ui.selectable_label(is_selected, &layer.name).clicked() {
                    state.selected_layer = Some(i);
                }
                
                // Layer controls
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button("🗑️").clicked() {
                        delete_layer(state, i);
                    }
                });
            });
            
            // Layer properties (if selected)
            if state.selected_layer == Some(i) {
                ui.indent("layer_props", |ui| {
                    ui.horizontal(|ui| {
                        ui.label("Opacity:");
                        ui.add(egui::Slider::new(&mut layer.opacity, 0.0..=1.0));
                    });
                    
                    ui.horizontal(|ui| {
                        ui.label("Blend:");
                        egui::ComboBox::from_id_source(format!("blend_{}", i))
                            .selected_text(&layer.blend_mode)
                            .show_ui(ui, |ui| {
                                ui.selectable_value(&mut layer.blend_mode, "normal".to_string(), "Normal");
                                ui.selectable_value(&mut layer.blend_mode, "multiply".to_string(), "Multiply");
                                ui.selectable_value(&mut layer.blend_mode, "screen".to_string(), "Screen");
                                ui.selectable_value(&mut layer.blend_mode, "overlay".to_string(), "Overlay");
                            });
                    });
                    
                    ui.label(format!("Paths: {}", layer.path_indices.len()));
                });
            }
        }
    });
    
    // Default layer if no layers exist
    if state.layers.is_empty() {
        ui.label("No layers created");
        ui.label("Create a layer to organize your artwork");
    }
}

fn properties_panel(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("⚙️ Properties");
    
    // Document properties
    if let Some(file) = &state.file {
        ui.group(|ui| {
            ui.label("Document");
            ui.horizontal(|ui| {
                ui.label("Size:");
                ui.label(format!("{} × {}", file.header.width, file.header.height));
            });
            ui.horizontal(|ui| {
                ui.label("Frames:");
                ui.label(format!("{}", file.header.frame_count));
            });
            ui.horizontal(|ui| {
                ui.label("FPS:");
                ui.label(format!("{:.1}", file.header.frame_rate));
            });
        });
        
        ui.separator();
        
        // Selection properties
        if !state.selected_paths.is_empty() {
            ui.group(|ui| {
                ui.label("Selection");
                ui.label(format!("{} objects selected", state.selected_paths.len()));
                
                // Common properties for selected objects
                ui.horizontal(|ui| {
                    ui.label("Stroke Color:");
                    ui.color_edit_button_srgba(&mut state.selected_color);
                });
                
                ui.horizontal(|ui| {
                    ui.label("Stroke Width:");
                    ui.add(egui::Slider::new(&mut state.stroke_width, 0.5..=50.0));
                });
                
                // Transform properties
                ui.horizontal(|ui| {
                    ui.label("Position:");
                    if let Some(file) = &state.file {
                        if let Some(&first_selected) = state.selected_paths.first() {
                            if first_selected < file.paths.len() {
                                let path = &file.paths[first_selected];
                                ui.label(format!("X: {:.1} Y: {:.1}", path.tf[4], path.tf[5]));
                            } else {
                                ui.label("X: 0.0 Y: 0.0");
                            }
                        } else {
                            ui.label("X: 0.0 Y: 0.0");
                        }
                    } else {
                        ui.label("X: 0.0 Y: 0.0");
                    }
                });
                
                ui.horizontal(|ui| {
                    ui.label("Size:");
                    if let Some(file) = &state.file {
                        if let Some(&first_selected) = state.selected_paths.first() {
                            if first_selected < file.paths.len() {
                                let path = &file.paths[first_selected];
                                if let Ok(path_points) = parse_path_data(&path.data) {
                                    let bounds = calculate_path_bounds(&path_points, path.tf);
                                    ui.label(format!("W: {:.1} H: {:.1}", bounds.width(), bounds.height()));
                                } else {
                                    ui.label("W: 100.0 H: 100.0");
                                }
                            } else {
                                ui.label("W: 100.0 H: 100.0");
                            }
                        } else {
                            ui.label("W: 100.0 H: 100.0");
                        }
                    } else {
                        ui.label("W: 100.0 H: 100.0");
                    }
                });
            });
        } else {
            ui.group(|ui| {
                ui.label("Selection");
                ui.label("No objects selected");
                ui.label("Select objects to edit their properties");
            });
        }
        
        ui.separator();
        
        // Advanced properties
        ui.group(|ui| {
            ui.label("Advanced");
            
            ui.horizontal(|ui| {
                ui.label("SDF Layers:");
                ui.label(format!("{}", file.sdf.len()));
            });
            
            ui.horizontal(|ui| {
                ui.label("3D Nodes:");
                ui.label(format!("{}", file.scene3d.len()));
            });
            
            ui.horizontal(|ui| {
                ui.label("Shaders:");
                ui.label(format!("{}", file.shaders.len()));
            });
            
            ui.horizontal(|ui| {
                ui.label("Effects:");
                ui.label(format!("{}", file.effects.len()));
            });
            
            ui.horizontal(|ui| {
                ui.label("Audio Tracks:");
                ui.label(format!("{}", file.audio_tracks.len()));
            });
        });
    } else {
        ui.label("No document loaded");
        ui.label("Open a document to view properties");
    }
}

// ---------- CONVERSION FUNCTIONS ----------

fn convert_svg_to_xvg(svg_path: &Path) -> anyhow::Result<File> {
    let svg_data = std::fs::read_to_string(svg_path)?;
    let tree = Tree::from_str(&svg_data, &Options::default())?;

    let mut xvg_file = File::default();
    xvg_file.header.width = tree.size.width() as u16;
    xvg_file.header.height = tree.size.height() as u16;

    // Convert SVG paths to XVG paths
    for node in tree.root.descendants() {
        if let usvg::NodeKind::Path(path) = &*node.borrow() {
            // Extract the actual SVG path data
            let path_data = path.data.to_string().into_bytes();
            
            // Extract transform from SVG path
            let transform = path.transform;
            let tf = [
                transform.sx as f64, transform.kx as f64,
                transform.ky as f64, transform.sy as f64,
                transform.tx as f64, transform.ty as f64,
            ];
            
            // Extract fill and stroke colors from SVG
            let fill_color = path.fill.as_ref().and_then(|fill| {
                if let usvg::Paint::Color(color) = fill.paint {
                    Some([color.red as f32 / 255.0, color.green as f32 / 255.0, color.blue as f32 / 255.0, 1.0])
                } else {
                    None
                }
            }).unwrap_or([0.5, 0.5, 0.5, 1.0]);
            
            let stroke_color = path.stroke.as_ref().and_then(|stroke| {
                if let usvg::Paint::Color(color) = stroke.paint {
                    Some([color.red as f32 / 255.0, color.green as f32 / 255.0, color.blue as f32 / 255.0, 1.0])
                } else {
                    None
                }
            }).unwrap_or([0.0, 0.0, 0.0, 1.0]);
            
            xvg_file.paths.push(PathRecord { 
                data: path_data, 
                tf,
                style: PathStyle {
                    fill: if path.fill.is_some() {
                        Some(FillStyle {
                            color: fill_color,
                            rule: FillRule::NonZero,
                        })
                    } else {
                        None
                    },
                    stroke: if path.stroke.is_some() {
                        Some(StrokeStyle {
                            color: stroke_color,
                            width: path.stroke.as_ref().map(|s| s.width.get()).unwrap_or(1.0),
                            cap: LineCap::Round,
                            join: LineJoin::Round,
                            dash_array: Vec::new(),
                        })
                    } else {
                        None
                    },
                    opacity: 1.0,
                    blend_mode: BlendMode::Normal,
                },
            });
        }
    }

    // Store original SVG as asset
    let svg_bytes = svg_data.into_bytes();
    let svg_size = svg_bytes.len();
    xvg_file.assets.push(Asset {
        ty: AssetType::Custom(1), // SVG asset type
        name: svg_path.file_name().unwrap().to_string_lossy().into(),
        data: svg_bytes,
        compressed: false,
        metadata: AssetMetadata {
            mime_type: "image/svg+xml".to_string(),
            size: svg_size as u64,
            created: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            modified: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            checksum: [0; 32],
            tags: vec!["svg".to_string()],
        },
    });

    Ok(xvg_file)
}

fn convert_png_to_xvg(png_path: &Path) -> anyhow::Result<File> {
    let img = image::open(png_path)?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();

    let mut xvg = File::default();
    xvg.header.width = w as u16;
    xvg.header.height = h as u16;

    // PNG as raster asset
    xvg.assets.push(Asset {
        ty: AssetType::ImagePng,
        name: png_path.file_name().unwrap().to_string_lossy().into(),
        data: std::fs::read(png_path)?,
        compressed: false,
        metadata: AssetMetadata {
            mime_type: "image/png".to_string(),
            size: std::fs::metadata(png_path)?.len(),
            created: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            modified: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            checksum: [0; 32],
            tags: vec!["png".to_string()],
        },
    });

    Ok(xvg)
}

fn convert_xvg_to_png(file: &File, width: u32, height: u32) -> anyhow::Result<Vec<u8>> {
    let mut img = ImageBuffer::new(width, height);
    
    // Fill with white background
    for pixel in img.pixels_mut() {
        *pixel = Rgba([255, 255, 255, 255]);
    }
    
    // Render actual XVG content
    for path in &file.paths {
        if let Ok(path_points) = parse_path_data(&path.data) {
            if path_points.len() >= 2 {
                // Convert path points to image coordinates
                let screen_points: Vec<(u32, u32)> = path_points.iter()
                    .map(|&p| {
                        let transformed = apply_transform(p, path.tf);
                        let x = ((transformed.x / 1024.0) * width as f32) as u32;
                        let y = ((transformed.y / 1024.0) * height as f32) as u32;
                        (x.min(width - 1), y.min(height - 1))
                    })
                    .collect();
                
                // Draw path segments
                for i in 1..screen_points.len() {
                    let (x1, y1) = screen_points[i-1];
                    let (x2, y2) = screen_points[i];
                    
                    // Simple line drawing algorithm
                    draw_line(&mut img, x1, y1, x2, y2, Rgba([0, 0, 0, 255]));
                }
            }
        }
    }
    
    // Encode to PNG
    let mut png_data = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut png_data), image::ImageFormat::Png)?;
    
    Ok(png_data)
}

fn draw_line(img: &mut ImageBuffer<Rgba<u8>, Vec<u8>>, x1: u32, y1: u32, x2: u32, y2: u32, color: Rgba<u8>) {
    let dx = (x2 as i32 - x1 as i32).abs();
    let dy = (y2 as i32 - y1 as i32).abs();
    let sx = if x1 < x2 { 1 } else { -1 };
    let sy = if y1 < y2 { 1 } else { -1 };
    let mut err = dx - dy;
    
    let mut x = x1 as i32;
    let mut y = y1 as i32;
    
    loop {
        if x >= 0 && x < img.width() as i32 && y >= 0 && y < img.height() as i32 {
            img.put_pixel(x as u32, y as u32, color);
        }
        
        if x == x2 as i32 && y == y2 as i32 {
            break;
        }
        
        let e2 = 2 * err;
        if e2 > -dy {
            err -= dy;
            x += sx;
        }
        if e2 < dx {
            err += dx;
            y += sy;
        }
    }
}

fn convert_xvg_to_svg(file: &File) -> anyhow::Result<String> {
    let mut svg = String::new();
    
    // SVG header
    svg.push_str(&format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<svg width="{}" height="{}" xmlns="http://www.w3.org/2000/svg">
"#,
        file.header.width, file.header.height
    ));
    
    // Convert paths to SVG
    for path in &file.paths {
        if let Ok(path_points) = parse_path_data(&path.data) {
            if path_points.len() >= 2 {
                let mut path_data = String::new();
                
                for (i, &point) in path_points.iter().enumerate() {
                    let transformed = apply_transform(point, path.tf);
                    if i == 0 {
                        path_data.push_str(&format!("M{:.1},{:.1}", transformed.x, transformed.y));
                    } else {
                        path_data.push_str(&format!(" L{:.1},{:.1}", transformed.x, transformed.y));
                    }
                }
                
                if path_points.len() > 2 {
                    path_data.push_str(" Z"); // Close path
                }
                
                svg.push_str(&format!(
                    r#"  <path d="{}" stroke="black" stroke-width="2" fill="none"/>
"#,
                    path_data
                ));
            }
        }
    }
    
    // SVG footer
    svg.push_str("</svg>");
    
    Ok(svg)
}

// ---------- DRAWING HELPER FUNCTIONS ----------

fn create_shape_path(tool: &DrawingTool, points: &[egui::Pos2]) -> Vec<u8> {
    if points.len() != 2 {
        return b"invalid_shape".to_vec();
    }
    
    let start = points[0];
    let end = points[1];
    
    match tool {
        DrawingTool::Rectangle => {
            // Create a proper XVG path for rectangle
            let path_data = format!("M{:.1},{:.1} L{:.1},{:.1} L{:.1},{:.1} L{:.1},{:.1} Z", 
                start.x, start.y,
                end.x, start.y,
                end.x, end.y,
                start.x, end.y
            );
            path_data.into_bytes()
        }
        DrawingTool::Circle => {
            let radius = ((end.x - start.x).powi(2) + (end.y - start.y).powi(2)).sqrt();
            // Create a circle approximation with 8 segments
            let mut path_data = format!("M{:.1},{:.1}", start.x + radius, start.y);
            for i in 1..=8 {
                let angle = (i as f32) * std::f32::consts::PI / 4.0;
                let x = start.x + radius * angle.cos();
                let y = start.y + radius * angle.sin();
                path_data.push_str(&format!(" L{:.1},{:.1}", x, y));
            }
            path_data.push_str(" Z");
            path_data.into_bytes()
        }
        DrawingTool::Ellipse => {
            // Create an ellipse as a rectangle for now
            let path_data = format!("M{:.1},{:.1} L{:.1},{:.1} L{:.1},{:.1} L{:.1},{:.1} Z", 
                start.x, start.y,
                end.x, start.y,
                end.x, end.y,
                start.x, end.y
            );
            path_data.into_bytes()
        }
        DrawingTool::Line => {
            let path_data = format!("M{:.1},{:.1} L{:.1},{:.1}", start.x, start.y, end.x, end.y);
            path_data.into_bytes()
        }
        _ => b"unknown_shape".to_vec(),
    }
}

fn create_freehand_path(points: &[egui::Pos2]) -> Vec<u8> {
    if points.len() < 2 {
        return b"invalid_path".to_vec();
    }
    
    let mut path_data = String::new();
    for (i, point) in points.iter().enumerate() {
        if i == 0 {
            path_data.push_str(&format!("M{:.1},{:.1}", point.x, point.y));
        } else {
            path_data.push_str(&format!(" L{:.1},{:.1}", point.x, point.y));
        }
    }
    path_data.into_bytes()
}

// ---------- CANVAS INTERACTION AND RENDERING ----------

fn handle_canvas_interaction(ui: &mut egui::Ui, response: &egui::Response, state: &mut AppState, painter: &egui::Painter) {
    let canvas_rect = response.rect;
    
    // Convert screen coordinates to world coordinates
    let screen_to_world = |pos: egui::Pos2| -> egui::Pos2 {
        egui::Pos2::new(
            (pos.x - canvas_rect.min.x - state.viewport_pan[0]) / state.viewport_zoom,
            (pos.y - canvas_rect.min.y - state.viewport_pan[1]) / state.viewport_zoom
        )
    };
    
    // Convert world coordinates to screen coordinates
    let world_to_screen = |pos: egui::Pos2| -> egui::Pos2 {
        egui::Pos2::new(
            pos.x * state.viewport_zoom + canvas_rect.min.x + state.viewport_pan[0],
            pos.y * state.viewport_zoom + canvas_rect.min.y + state.viewport_pan[1]
        )
    };
    
    // Handle mouse input
    if response.hovered() {
        let pointer_pos = ui.input(|i| i.pointer.hover_pos()).unwrap_or_default();
        let world_pos = screen_to_world(pointer_pos);
        
        // Update cursor based on tool
        ui.ctx().set_cursor_icon(match state.current_tool {
            DrawingTool::Select => egui::CursorIcon::Default,
            DrawingTool::SelectBox => egui::CursorIcon::Crosshair,
            DrawingTool::Rectangle | DrawingTool::Circle | DrawingTool::Ellipse | DrawingTool::Line => egui::CursorIcon::Crosshair,
            DrawingTool::Freehand => egui::CursorIcon::PointingHand,
            DrawingTool::Text => egui::CursorIcon::Text,
        });
        
        // Handle mouse clicks
        if response.clicked() {
            handle_canvas_click(state, world_pos, canvas_rect);
        }
        
        // Handle mouse drag
        if response.dragged() {
            handle_canvas_drag(state, world_pos, canvas_rect);
        }
        
        // Handle mouse release
        if response.drag_released() {
            handle_canvas_release(state, world_pos);
        }
        
        // Handle mouse wheel for zoom
        if ui.input(|i| i.scroll_delta.y != 0.0) {
            let zoom_delta = if ui.input(|i| i.key_down(egui::Key::ControlLeft)) {
                ui.input(|i| i.scroll_delta.y) * 0.1
            } else {
                0.0
            };
            state.viewport_zoom = (state.viewport_zoom + zoom_delta).clamp(0.1, 10.0);
        }
        
        // Handle middle mouse drag for panning
        if ui.input(|i| i.pointer.middle_down()) {
            let delta = ui.input(|i| i.pointer.latest_pos()).unwrap_or_default() - 
                       ui.input(|i| i.pointer.pos()).unwrap_or_default();
            state.viewport_pan[0] += delta.x;
            state.viewport_pan[1] += delta.y;
        }
    }
}

fn handle_canvas_click(state: &mut AppState, world_pos: egui::Pos2, canvas_rect: egui::Rect) {
    match state.current_tool {
        DrawingTool::Select => {
            // Select path at position
            if let Some(file) = &state.file {
                if let Some(path_index) = find_path_at_position(file, world_pos) {
                    if !state.selected_paths.contains(&path_index) {
                        state.selected_paths.push(path_index);
                    }
                } else {
                    state.selected_paths.clear();
                }
            }
        }
        DrawingTool::SelectBox => {
            // Start selection box
            state.selection_box_start = Some(world_pos);
            state.selection_box_end = Some(world_pos);
            state.drawing_selection_box = true;
        }
        DrawingTool::Rectangle | DrawingTool::Circle | DrawingTool::Ellipse | DrawingTool::Line => {
            // Start drawing shape
            state.drawing_mode = true;
            state.drawing_points = vec![world_pos];
        }
        DrawingTool::Freehand => {
            // Start freehand drawing
            state.drawing_mode = true;
            state.drawing_points = vec![world_pos];
        }
        DrawingTool::Text => {
            // Create text at position
            create_text_at_position(state, world_pos);
        }
    }
}

fn handle_canvas_drag(state: &mut AppState, world_pos: egui::Pos2, canvas_rect: egui::Rect) {
    match state.current_tool {
        DrawingTool::Select => {
            // Move selected objects
            if !state.selected_paths.is_empty() && !state.dragging_selection {
                state.dragging_selection = true;
                state.drag_start = Some(world_pos);
                state.drag_offset = [0.0, 0.0];
            }
            
            if state.dragging_selection {
                if let Some(start_pos) = state.drag_start {
                    state.drag_offset = [world_pos.x - start_pos.x, world_pos.y - start_pos.y];
                }
            }
        }
        DrawingTool::SelectBox => {
            // Update selection box
            if state.drawing_selection_box {
                state.selection_box_end = Some(world_pos);
            }
        }
        DrawingTool::Rectangle | DrawingTool::Circle | DrawingTool::Ellipse | DrawingTool::Line => {
            // Update shape drawing
            if state.drawing_mode && state.drawing_points.len() == 1 {
                state.drawing_points.push(world_pos);
            }
        }
        DrawingTool::Freehand => {
            // Add points to freehand path
            if state.drawing_mode {
                state.drawing_points.push(world_pos);
            }
        }
        _ => {}
    }
}

fn handle_canvas_release(state: &mut AppState, world_pos: egui::Pos2) {
    match state.current_tool {
        DrawingTool::Select => {
            // Finish moving objects
            if state.dragging_selection {
                if let Some(file) = &mut state.file {
                    for &path_index in &state.selected_paths {
                        if path_index < file.paths.len() {
                            // Apply transform to move path
                            let path = &mut file.paths[path_index];
                            path.tf[4] += state.drag_offset[0] as f64;
                            path.tf[5] += state.drag_offset[1] as f64;
                        }
                    }
                }
                state.dragging_selection = false;
                state.drag_start = None;
                state.drag_offset = [0.0, 0.0];
            }
        }
        DrawingTool::SelectBox => {
            // Finish selection box
            if state.drawing_selection_box {
                if let (Some(start), Some(end)) = (state.selection_box_start, state.selection_box_end) {
                    select_paths_in_box(state, start, end);
                }
                state.drawing_selection_box = false;
                state.selection_box_start = None;
                state.selection_box_end = None;
            }
        }
        DrawingTool::Rectangle | DrawingTool::Circle | DrawingTool::Ellipse | DrawingTool::Line => {
            // Finish shape drawing
            if state.drawing_mode && state.drawing_points.len() == 2 {
                create_shape_from_points(state);
                state.drawing_mode = false;
                state.drawing_points.clear();
            }
        }
        DrawingTool::Freehand => {
            // Finish freehand drawing
            if state.drawing_mode && state.drawing_points.len() >= 2 {
                create_freehand_path_from_points(state);
                state.drawing_mode = false;
                state.drawing_points.clear();
            }
        }
        _ => {}
    }
}

fn render_canvas(painter: &egui::Painter, state: &mut AppState, canvas_size: egui::Vec2) {
    let canvas_rect = egui::Rect::from_min_size(egui::Pos2::ZERO, canvas_size);
    
    // Draw canvas background with dark theme
    painter.rect_filled(canvas_rect, 0.0, egui::Color32::from_rgb(25, 25, 25));
    painter.rect_stroke(canvas_rect, 0.0, (1.0, egui::Color32::from_rgb(60, 60, 60)));
    
    // Draw grid with dark theme colors
    if state.show_grid {
        draw_grid(painter, canvas_rect, state.viewport_zoom, state.viewport_pan);
    }
    
    // Draw rulers if enabled
    if state.show_rulers {
        draw_rulers(painter, canvas_rect, state.viewport_zoom, state.viewport_pan);
    }
    
    // Draw paths
    if let Some(file) = &state.file {
        draw_paths(painter, canvas_rect, file, state);
    }
    
    // Draw selection
    draw_selection(painter, canvas_rect, state);
    
    // Draw current drawing
    draw_current_drawing(painter, canvas_rect, state);
    
    // Draw selection box
    draw_selection_box(painter, canvas_rect, state);
}

fn draw_grid(painter: &egui::Painter, canvas_rect: egui::Rect, zoom: f32, pan: [f32; 2]) {
    let grid_size = 20.0 * zoom;
    let start_x = (pan[0] / grid_size).floor() * grid_size;
    let start_y = (pan[1] / grid_size).floor() * grid_size;
    let end_x = start_x + canvas_rect.width();
    let end_y = start_y + canvas_rect.height();
    
    // Draw vertical lines with dark theme colors
    let mut x = start_x;
    while x <= end_x {
        let screen_x = x - pan[0] + canvas_rect.min.x;
        painter.line_segment(
            [egui::Pos2::new(screen_x, canvas_rect.min.y), egui::Pos2::new(screen_x, canvas_rect.max.y)],
            (1.0, egui::Color32::from_rgb(45, 45, 45)),
        );
        x += grid_size;
    }
    
    // Draw horizontal lines with dark theme colors
    let mut y = start_y;
    while y <= end_y {
        let screen_y = y - pan[1] + canvas_rect.min.y;
        painter.line_segment(
            [egui::Pos2::new(canvas_rect.min.x, screen_y), egui::Pos2::new(canvas_rect.max.x, screen_y)],
            (1.0, egui::Color32::from_rgb(45, 45, 45)),
        );
        y += grid_size;
    }
}

fn draw_rulers(painter: &egui::Painter, canvas_rect: egui::Rect, zoom: f32, pan: [f32; 2]) {
    let ruler_size = 20.0;
    let ruler_color = egui::Color32::from_rgb(50, 50, 50);
    let text_color = egui::Color32::from_rgb(180, 180, 180);
    
    // Draw horizontal ruler
    let ruler_rect = egui::Rect::from_min_max(
        egui::Pos2::new(canvas_rect.min.x, canvas_rect.min.y - ruler_size),
        egui::Pos2::new(canvas_rect.max.x, canvas_rect.min.y)
    );
    painter.rect_filled(ruler_rect, 0.0, ruler_color);
    
    // Draw vertical ruler
    let ruler_rect = egui::Rect::from_min_max(
        egui::Pos2::new(canvas_rect.min.x - ruler_size, canvas_rect.min.y),
        egui::Pos2::new(canvas_rect.min.x, canvas_rect.max.y)
    );
    painter.rect_filled(ruler_rect, 0.0, ruler_color);
    
    // Draw ruler markings
    let major_interval = 100.0 * zoom;
    let minor_interval = 20.0 * zoom;
    
    // Horizontal ruler markings
    let mut x = (pan[0] / major_interval).floor() * major_interval;
    while x <= pan[0] + canvas_rect.width() {
        let screen_x = x - pan[0] + canvas_rect.min.x;
        if screen_x >= canvas_rect.min.x && screen_x <= canvas_rect.max.x {
            // Major tick
            painter.line_segment(
                [egui::Pos2::new(screen_x, canvas_rect.min.y - 5.0), egui::Pos2::new(screen_x, canvas_rect.min.y)],
                (2.0, text_color),
            );
            // Label
            painter.text(
                egui::Pos2::new(screen_x + 2.0, canvas_rect.min.y - 15.0),
                egui::Align2::LEFT_TOP,
                format!("{:.0}", x),
                egui::FontId::proportional(10.0),
                text_color,
            );
        }
        x += major_interval;
    }
    
    // Vertical ruler markings
    let mut y = (pan[1] / major_interval).floor() * major_interval;
    while y <= pan[1] + canvas_rect.height() {
        let screen_y = y - pan[1] + canvas_rect.min.y;
        if screen_y >= canvas_rect.min.y && screen_y <= canvas_rect.max.y {
            // Major tick
            painter.line_segment(
                [egui::Pos2::new(canvas_rect.min.x - 5.0, screen_y), egui::Pos2::new(canvas_rect.min.x, screen_y)],
                (2.0, text_color),
            );
            // Label
            painter.text(
                egui::Pos2::new(canvas_rect.min.x - 15.0, screen_y + 2.0),
                egui::Align2::RIGHT_TOP,
                format!("{:.0}", y),
                egui::FontId::proportional(10.0),
                text_color,
            );
        }
        y += major_interval;
    }
}

fn draw_paths(painter: &egui::Painter, canvas_rect: egui::Rect, file: &File, state: &mut AppState) {
    for (i, path) in file.paths.iter().enumerate() {
        let is_selected = state.selected_paths.contains(&i);
        let color = if is_selected { 
            egui::Color32::from_rgb(0, 150, 255) // Bright blue for selection
        } else { 
            egui::Color32::from_rgb(220, 220, 220) // Light gray for normal paths
        };
        
        // Convert path data to screen coordinates and draw
        if let Ok(path_points) = parse_path_data(&path.data) {
            draw_path_points(painter, &path_points, path.tf, color, state.viewport_zoom, state.viewport_pan, canvas_rect);
        }
    }
}

fn draw_selection(painter: &egui::Painter, canvas_rect: egui::Rect, state: &mut AppState) {
    if let Some(file) = &state.file {
        for &path_index in &state.selected_paths {
            if path_index < file.paths.len() {
                let path = &file.paths[path_index];
                if let Ok(path_points) = parse_path_data(&path.data) {
                    // Draw selection handles
                    draw_selection_handles(painter, &path_points, path.tf, state.viewport_zoom, state.viewport_pan, canvas_rect);
                }
            }
        }
    }
}

fn draw_current_drawing(painter: &egui::Painter, canvas_rect: egui::Rect, state: &mut AppState) {
    if state.drawing_mode && state.drawing_points.len() >= 2 {
        let color = state.selected_color;
        let stroke_width = state.stroke_width * state.viewport_zoom;
        
        // Draw preview of current shape
        match state.current_tool {
            DrawingTool::Rectangle | DrawingTool::Circle | DrawingTool::Ellipse | DrawingTool::Line => {
                if state.drawing_points.len() == 2 {
                    let start = world_to_screen(state.drawing_points[0], state.viewport_zoom, state.viewport_pan, canvas_rect);
                    let end = world_to_screen(state.drawing_points[1], state.viewport_zoom, state.viewport_pan, canvas_rect);
                    
                    match state.current_tool {
                        DrawingTool::Rectangle => {
                            painter.rect_stroke(
                                egui::Rect::from_two_pos(start, end),
                                0.0,
                                (stroke_width, color),
                            );
                        }
                        DrawingTool::Circle => {
                            let radius = ((end.x - start.x).powi(2) + (end.y - start.y).powi(2)).sqrt();
                            painter.circle_stroke(start, radius, (stroke_width, color));
                        }
                        DrawingTool::Line => {
                            painter.line_segment([start, end], (stroke_width, color));
                        }
                        _ => {}
                    }
                }
            }
            DrawingTool::Freehand => {
                // Draw freehand path preview
                let screen_points: Vec<egui::Pos2> = state.drawing_points.iter()
                    .map(|p| world_to_screen(*p, state.viewport_zoom, state.viewport_pan, canvas_rect))
                    .collect();
                
                for i in 1..screen_points.len() {
                    painter.line_segment(
                        [screen_points[i-1], screen_points[i]],
                        (stroke_width, color),
                    );
                }
            }
            _ => {}
        }
    }
}

fn draw_selection_box(painter: &egui::Painter, canvas_rect: egui::Rect, state: &mut AppState) {
    if state.drawing_selection_box {
        if let (Some(start), Some(end)) = (state.selection_box_start, state.selection_box_end) {
            let screen_start = world_to_screen(start, state.viewport_zoom, state.viewport_pan, canvas_rect);
            let screen_end = world_to_screen(end, state.viewport_zoom, state.viewport_pan, canvas_rect);
            
            // Draw selection box with dark theme colors
            painter.rect_stroke(
                egui::Rect::from_two_pos(screen_start, screen_end),
                0.0,
                (2.0, egui::Color32::from_rgb(0, 150, 255)),
            );
            
            // Fill with semi-transparent blue
            painter.rect_filled(
                egui::Rect::from_two_pos(screen_start, screen_end),
                0.0,
                egui::Color32::from_rgba_premultiplied(0, 100, 200, 50),
            );
        }
    }
}

// Helper functions
fn world_to_screen(world_pos: egui::Pos2, zoom: f32, pan: [f32; 2], canvas_rect: egui::Rect) -> egui::Pos2 {
    egui::Pos2::new(
        world_pos.x * zoom + canvas_rect.min.x + pan[0],
        world_pos.y * zoom + canvas_rect.min.y + pan[1]
    )
}

fn find_path_at_position(file: &File, world_pos: egui::Pos2) -> Option<usize> {
    for (i, path) in file.paths.iter().enumerate() {
        if let Ok(path_points) = parse_path_data(&path.data) {
            if point_in_path(&path_points, world_pos, path.tf) {
                return Some(i);
            }
        }
    }
    None
}

fn select_paths_in_box(state: &mut AppState, start: egui::Pos2, end: egui::Pos2) {
    if let Some(file) = &state.file {
        let box_rect = egui::Rect::from_two_pos(start, end);
        state.selected_paths.clear();
        
        for (i, path) in file.paths.iter().enumerate() {
            if let Ok(path_points) = parse_path_data(&path.data) {
                if path_intersects_box(&path_points, box_rect, path.tf) {
                    state.selected_paths.push(i);
                }
            }
        }
    }
}

fn create_shape_from_points(state: &mut AppState) {
    if state.drawing_points.len() != 2 {
        return;
    }
    
    let path_data = create_shape_path(&state.current_tool, &state.drawing_points);
    add_path_to_file(state, path_data);
}

fn create_freehand_path_from_points(state: &mut AppState) {
    if state.drawing_points.len() < 2 {
        return;
    }
    
    let path_data = create_freehand_path(&state.drawing_points);
    add_path_to_file(state, path_data);
}

fn create_text_at_position(state: &mut AppState, world_pos: egui::Pos2) {
    // For now, create a simple text placeholder
    let text_data = format!("TEXT at ({:.1}, {:.1})", world_pos.x, world_pos.y).into_bytes();
    add_path_to_file(state, text_data);
}

fn add_path_to_file(state: &mut AppState, path_data: Vec<u8>) {
    if let Some(file) = &mut state.file {
        let new_path = PathRecord {
            data: path_data,
            tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0], // Identity transform
        };
        file.paths.push(new_path);
        
        // Select the new path
        state.selected_paths = vec![file.paths.len() - 1];
    }
}

fn delete_selected_paths(state: &mut AppState) {
    if let Some(file) = &mut state.file {
        // Sort indices in reverse order to delete from end
        state.selected_paths.sort_unstable();
        state.selected_paths.reverse();
        
        for &index in &state.selected_paths {
            if index < file.paths.len() {
                file.paths.remove(index);
            }
        }
        state.selected_paths.clear();
    }
}

// ---------- PATH PARSING AND DRAWING HELPERS ----------

fn parse_path_data(data: &[u8]) -> anyhow::Result<Vec<egui::Pos2>> {
    // Parse SVG path data
    let data_str = String::from_utf8_lossy(data);
    
    // Check if it looks like SVG path data
    if data_str.contains("M") || data_str.contains("L") || data_str.contains("C") || data_str.contains("Z") {
        parse_svg_path(&data_str)
    } else {
        // Fallback: create a simple rectangle
        Ok(vec![
            egui::Pos2::new(0.0, 0.0),
            egui::Pos2::new(100.0, 0.0),
            egui::Pos2::new(100.0, 100.0),
            egui::Pos2::new(0.0, 100.0),
        ])
    }
}

fn parse_svg_path(path_str: &str) -> anyhow::Result<Vec<egui::Pos2>> {
    let mut points = Vec::new();
    let mut current_x = 0.0;
    let mut current_y = 0.0;
    
    // More robust SVG path parsing
    let mut chars = path_str.chars().peekable();
    
    while let Some(ch) = chars.next() {
        match ch {
            'M' | 'm' => {
                // Move to (absolute or relative)
                let (x, y) = parse_coordinates(&mut chars)?;
                if ch == 'm' {
                    current_x += x;
                    current_y += y;
                } else {
                    current_x = x;
                    current_y = y;
                }
                points.push(egui::Pos2::new(current_x, current_y));
            }
            'L' | 'l' => {
                // Line to (absolute or relative)
                let (x, y) = parse_coordinates(&mut chars)?;
                if ch == 'l' {
                    current_x += x;
                    current_y += y;
                } else {
                    current_x = x;
                    current_y = y;
                }
                points.push(egui::Pos2::new(current_x, current_y));
            }
            'C' | 'c' => {
                // Cubic curve (simplified - just use end point)
                let (x1, y1) = parse_coordinates(&mut chars)?;
                let (x2, y2) = parse_coordinates(&mut chars)?;
                let (x, y) = parse_coordinates(&mut chars)?;
                if ch == 'c' {
                    current_x += x;
                    current_y += y;
                } else {
                    current_x = x;
                    current_y = y;
                }
                points.push(egui::Pos2::new(current_x, current_y));
            }
            'Z' | 'z' => {
                // Close path
                if !points.is_empty() {
                    points.push(points[0]);
                }
            }
            'H' | 'h' => {
                // Horizontal line
                let x = parse_number(&mut chars)?;
                if ch == 'h' {
                    current_x += x;
                } else {
                    current_x = x;
                }
                points.push(egui::Pos2::new(current_x, current_y));
            }
            'V' | 'v' => {
                // Vertical line
                let y = parse_number(&mut chars)?;
                if ch == 'v' {
                    current_y += y;
                } else {
                    current_y = y;
                }
                points.push(egui::Pos2::new(current_x, current_y));
            }
            _ => {
                // Skip other characters
            }
        }
    }
    
    Ok(points)
}

fn parse_coordinates(chars: &mut std::iter::Peekable<std::str::Chars>) -> anyhow::Result<(f32, f32)> {
    let x = parse_number(chars)?;
    let y = parse_number(chars)?;
    Ok((x, y))
}

fn parse_number(chars: &mut std::iter::Peekable<std::str::Chars>) -> anyhow::Result<f32> {
    let mut number_str = String::new();
    
    // Skip whitespace and commas
    while let Some(&ch) = chars.peek() {
        if ch.is_whitespace() || ch == ',' {
            chars.next();
        } else {
            break;
        }
    }
    
    // Parse number
    while let Some(&ch) = chars.peek() {
        if ch.is_numeric() || ch == '.' || ch == '-' || ch == '+' {
            number_str.push(ch);
            chars.next();
        } else {
            break;
        }
    }
    
    number_str.parse::<f32>().map_err(|e| anyhow::anyhow!("Failed to parse number: {}", e))
}

fn point_in_path(path_points: &[egui::Pos2], world_pos: egui::Pos2, transform: [f64; 6]) -> bool {
    if path_points.len() < 3 {
        return false;
    }
    
    // Apply transform to the test point
    let transformed_pos = apply_transform(world_pos, transform);
    
    // Simple point-in-polygon test using ray casting
    let mut inside = false;
    let mut j = path_points.len() - 1;
    
    for i in 0..path_points.len() {
        let pi = path_points[i];
        let pj = path_points[j];
        
        if ((pi.y > transformed_pos.y) != (pj.y > transformed_pos.y)) &&
           (transformed_pos.x < (pj.x - pi.x) * (transformed_pos.y - pi.y) / (pj.y - pi.y) + pi.x) {
            inside = !inside;
        }
        j = i;
    }
    
    inside
}

fn path_intersects_box(path_points: &[egui::Pos2], box_rect: egui::Rect, transform: [f64; 6]) -> bool {
    // Simple bounding box intersection test
    if path_points.is_empty() {
        return false;
    }
    
    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = f32::MIN;
    let mut max_y = f32::MIN;
    
    for &point in path_points {
        let transformed = apply_transform(point, transform);
        min_x = min_x.min(transformed.x);
        min_y = min_y.min(transformed.y);
        max_x = max_x.max(transformed.x);
        max_y = max_y.max(transformed.y);
    }
    
    let path_rect = egui::Rect::from_min_max(
        egui::Pos2::new(min_x, min_y),
        egui::Pos2::new(max_x, max_y)
    );
    
    path_rect.intersects(box_rect)
}

fn apply_transform(point: egui::Pos2, transform: [f64; 6]) -> egui::Pos2 {
    // Apply 2x3 affine transform matrix
    let x = point.x as f64;
    let y = point.y as f64;
    
    let new_x = transform[0] * x + transform[2] * y + transform[4];
    let new_y = transform[1] * x + transform[3] * y + transform[5];
    
    egui::Pos2::new(new_x as f32, new_y as f32)
}

fn draw_path_points(
    painter: &egui::Painter, 
    path_points: &[egui::Pos2], 
    transform: [f64; 6], 
    color: egui::Color32, 
    zoom: f32, 
    pan: [f32; 2], 
    canvas_rect: egui::Rect
) {
    if path_points.len() < 2 {
        return;
    }
    
    let stroke_width = 2.0 * zoom;
    
    // Convert path points to screen coordinates
    let screen_points: Vec<egui::Pos2> = path_points.iter()
        .map(|&p| {
            let transformed = apply_transform(p, transform);
            world_to_screen(transformed, zoom, pan, canvas_rect)
        })
        .collect();
    
    // Draw path segments
    for i in 1..screen_points.len() {
        painter.line_segment(
            [screen_points[i-1], screen_points[i]],
            (stroke_width, color),
        );
    }
}

fn draw_selection_handles(
    painter: &egui::Painter, 
    path_points: &[egui::Pos2], 
    transform: [f64; 6], 
    zoom: f32, 
    pan: [f32; 2], 
    canvas_rect: egui::Rect
) {
    if path_points.is_empty() {
        return;
    }
    
    let handle_size = 6.0 * zoom;
    let handle_color = egui::Color32::from_rgb(0, 150, 255); // Bright blue
    let handle_border = egui::Color32::from_rgb(255, 255, 255); // White border
    
    // Draw handles at path vertices
    for &point in path_points {
        let transformed = apply_transform(point, transform);
        let screen_pos = world_to_screen(transformed, zoom, pan, canvas_rect);
        
        painter.circle_filled(screen_pos, handle_size, handle_color);
        painter.circle_stroke(screen_pos, handle_size, (1.0, handle_border));
    }
    
    // Draw bounding box
    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = f32::MIN;
    let mut max_y = f32::MIN;
    
    for &point in path_points {
        let transformed = apply_transform(point, transform);
        min_x = min_x.min(transformed.x);
        min_y = min_y.min(transformed.y);
        max_x = max_x.max(transformed.x);
        max_y = max_y.max(transformed.y);
    }
    
    let screen_min = world_to_screen(egui::Pos2::new(min_x, min_y), zoom, pan, canvas_rect);
    let screen_max = world_to_screen(egui::Pos2::new(max_x, max_y), zoom, pan, canvas_rect);
    
    // Draw bounding box with dark theme colors
    painter.rect_stroke(
        egui::Rect::from_two_pos(screen_min, screen_max),
        0.0,
        (2.0, egui::Color32::from_rgb(0, 150, 255)),
    );
    
    // Draw corner handles
    let corner_size = 8.0 * zoom;
    let corners = [
        screen_min,
        egui::Pos2::new(screen_max.x, screen_min.y),
        screen_max,
        egui::Pos2::new(screen_min.x, screen_max.y),
    ];
    
    for &corner in &corners {
        painter.circle_filled(corner, corner_size, handle_color);
        painter.circle_stroke(corner, corner_size, (1.0, handle_border));
    }
}

// ---------- EDIT OPERATIONS ----------

fn undo_operation(command_history: &mut CommandHistory, state: &mut AppState) {
    if let Some(command) = command_history.undo() {
        match command {
            Command::AddPath(_) => {
                // Remove the last added path
                if let Some(file) = &mut state.file {
                    if !file.paths.is_empty() {
                        file.paths.pop();
                        state.selected_paths.clear();
                    }
                }
            }
            Command::DeletePaths(indices) => {
                // Restore deleted paths
                if let Some(file) = &mut state.file {
                    // This is simplified - in a real implementation you'd store the actual deleted paths
                    // For now, we'll just clear the selection
                    state.selected_paths.clear();
                }
            }
            Command::MovePaths { indices, delta } => {
                // Move paths back
                if let Some(file) = &mut state.file {
                    for &index in indices {
                        if index < file.paths.len() {
                            let path = &mut file.paths[index];
                            path.tf[4] -= delta[0] as f64;
                            path.tf[5] -= delta[1] as f64;
                        }
                    }
                }
            }
            Command::ModifyPath { index, old, new: _ } => {
                // Restore old path
                if let Some(file) = &mut state.file {
                    if index < file.paths.len() {
                        file.paths[index] = old.clone();
                    }
                }
            }
        }
    }
}

fn redo_operation(command_history: &mut CommandHistory, state: &mut AppState) {
    if let Some(command) = command_history.redo() {
        match command {
            Command::AddPath(path) => {
                // Add the path back
                if let Some(file) = &mut state.file {
                    file.paths.push(path.clone());
                    state.selected_paths = vec![file.paths.len() - 1];
                }
            }
            Command::DeletePaths(_) => {
                // Re-delete paths (simplified)
                delete_selected_paths(state);
            }
            Command::MovePaths { indices, delta } => {
                // Move paths forward
                if let Some(file) = &mut state.file {
                    for &index in indices {
                        if index < file.paths.len() {
                            let path = &mut file.paths[index];
                            path.tf[4] += delta[0] as f64;
                            path.tf[5] += delta[1] as f64;
                        }
                    }
                }
            }
            Command::ModifyPath { index, old: _, new } => {
                // Apply new path
                if let Some(file) = &mut state.file {
                    if index < file.paths.len() {
                        file.paths[index] = new.clone();
                    }
                }
            }
        }
    }
}

fn cut_selected(state: &mut AppState) {
    copy_selected(state);
    delete_selected_paths(state);
}

fn copy_selected(state: &mut AppState) {
    if let Some(file) = &state.file {
        let mut clipboard_data = Vec::new();
        
        for &index in &state.selected_paths {
            if index < file.paths.len() {
                let path = &file.paths[index];
                // Serialize path data for clipboard
                if let Ok(json) = serde_json::to_string(path) {
                    clipboard_data.push(json);
                }
            }
        }
        
        // Store in clipboard (simplified - in real implementation use system clipboard)
        if !clipboard_data.is_empty() {
            // For now, we'll store in a simple global variable
            // In a real implementation, you'd use the system clipboard
            unsafe {
                CLIPBOARD_DATA = clipboard_data.join("\n");
            }
        }
    }
}

fn paste_clipboard(state: &mut AppState) {
    // Get from clipboard (simplified)
    unsafe {
        if !CLIPBOARD_DATA.is_empty() {
            if let Some(file) = &mut state.file {
                let paths: Vec<&str> = CLIPBOARD_DATA.split('\n').collect();
                state.selected_paths.clear();
                
                for path_str in paths {
                    if let Ok(path) = serde_json::from_str::<PathRecord>(path_str) {
                        // Offset the pasted path slightly
                        let mut new_path = path;
                        new_path.tf[4] += 20.0; // Offset X
                        new_path.tf[5] += 20.0; // Offset Y
                        
                        file.paths.push(new_path);
                        state.selected_paths.push(file.paths.len() - 1);
                    }
                }
            }
        }
    }
}

fn select_all_paths(state: &mut AppState) {
    if let Some(file) = &state.file {
        state.selected_paths = (0..file.paths.len()).collect();
    }
}

// Simple global clipboard storage (in real implementation, use system clipboard)
static mut CLIPBOARD_DATA: String = String::new();

fn calculate_path_bounds(path_points: &[egui::Pos2], transform: [f64; 6]) -> egui::Rect {
    if path_points.is_empty() {
        return egui::Rect::NOTHING;
    }
    
    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = f32::MIN;
    let mut max_y = f32::MIN;
    
    for &point in path_points {
        let transformed = apply_transform(point, transform);
        min_x = min_x.min(transformed.x);
        min_y = min_y.min(transformed.y);
        max_x = max_x.max(transformed.x);
        max_y = max_y.max(transformed.y);
    }
    
    egui::Rect::from_min_max(
        egui::Pos2::new(min_x, min_y),
        egui::Pos2::new(max_x, max_y)
    )
}

// ---------- CRDT OPERATIONS ----------

fn add_test_crdt_operation(state: &mut AppState) {
    if let Some(file) = &mut state.file {
        state.lamport_clock += 1;
        let test_entry = CRDTEntry {
            author: state.local_author_id,
            lamport: state.lamport_clock,
            operation_type: "test_operation".to_string(),
            payload: b"test_payload".to_vec(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        };
        file.crdt.push(test_entry);
    }
}

fn clear_crdt_operations(state: &mut AppState) {
    if let Some(file) = &mut state.file {
        file.crdt.clear();
    }
}

fn show_operation_details(entry: &CRDTEntry) -> String {
    format!(
        "Author: {}\nLamport: {}\nType: {}\nPayload: {} bytes\nTimestamp: {}",
        entry.author,
        entry.lamport,
        entry.operation_type,
        entry.payload.len(),
        entry.timestamp
    )
}

fn delete_layer(state: &mut AppState, index: usize) {
    if index < state.layers.len() {
        state.layers.remove(index);
        if state.selected_layer == Some(index) {
            state.selected_layer = None;
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            file: None,
            path: None,
            selected_tab: 0,
            viewport_zoom: 1.0,
            viewport_pan: [0.0, 0.0],
            timeline_playhead: 0.0,
            timeline_playing: false,
            selected_path: None,
            selected_shader: None,
            selected_3d_node: None,
            selected_audio_track: None,
            selected_effect: None,
            // Drawing tools
            current_tool: DrawingTool::Select,
            drawing_mode: false,
            drawing_points: Vec::new(),
            selected_color: egui::Color32::BLACK,
            fill_color: egui::Color32::WHITE,
            stroke_width: 2.0,
            // Path editing
            selected_nodes: Vec::new(),
            show_nodes: false,
            // Selection and movement
            selected_paths: Vec::new(),
            dragging_selection: false,
            drag_start: None,
            drag_offset: [0.0, 0.0],
            // Selection box
            selection_box_start: None,
            selection_box_end: None,
            drawing_selection_box: false,
            // View options (matching Tkinter)
            show_grid: true,
            show_rulers: true,
            show_layers_panel: true,
            show_properties_panel: true,
            show_timeline_panel: false,
            // Advanced features
            show_sdf: false,
            show_3d: false,
            show_physics: false,
            show_audio: false,
            show_effects: false,
            // Animation
            animation_time: 0.0,
            animation_playing: false,
            // Physics
            physics_enabled: false,
            physics_gravity: [0.0, -9.81, 0.0],
            physics_time_scale: 1.0,
            // Audio
            audio_volume: 1.0,
            audio_muted: false,
            // Effects
            effect_parameters: HashMap::new(),
            // 3D
            camera_position: [0.0, 0.0, 5.0],
            camera_rotation: [0.0, 0.0, 0.0],
            // Collaboration
            collaboration_enabled: false,
            local_author_id: 1,
            lamport_clock: 0,
            // Layers
            layers: vec![Layer::default()],
            selected_layer: Some(0),
        }
    }
}





