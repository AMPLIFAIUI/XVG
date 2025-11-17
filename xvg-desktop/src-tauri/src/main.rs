#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use xvg_core::*;
use std::sync::Arc;
use tokio::sync::Mutex;

mod xvg_bridge;

use xvg_bridge::XVGBridge;

#[tokio::main]
async fn main() {
    // Initialize XVG engines
    let sdf_engine = Arc::new(Mutex::new(SDFEngine::new()));
    let shader_engine = Arc::new(Mutex::new(WGSLShaderEngine::new()));
    let scene_engine = Arc::new(Mutex::new(Scene3DEngine::new()));
    let crdt_engine = Arc::new(Mutex::new(CRDTEngine::new(1)));
    
    // Create XVG bridge
    let bridge = Arc::new(XVGBridge::new(
        sdf_engine,
        shader_engine,
        scene_engine,
        crdt_engine,
    ));

    tauri::Builder::default()
        .manage(bridge)
        .invoke_handler(tauri::generate_handler![
            xvg_bridge::open_file,
            xvg_bridge::save_file,
            xvg_bridge::render_canvas,
            xvg_bridge::convert_to_sdf,
            xvg_bridge::compile_shader,
            xvg_bridge::extrude_path,
            xvg_bridge::sync_operations,
            xvg_bridge::get_performance_stats,
            xvg_bridge::zoom_canvas,
            xvg_bridge::pan_canvas,
            xvg_bridge::get_canvas_transform,
            xvg_bridge::update_canvas_size,
            xvg_bridge::get_engine_status
        ])
        .setup(|app| {
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
