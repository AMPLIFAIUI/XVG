# Comprehensive XVG Integration Script

# Create project directories
New-Item -ItemType Directory -Force -Path "xvg-project"
Set-Location "xvg-project"

# Initialize workspace
New-Item -ItemType File -Force -Path ".\Cargo.toml" -Value @"
[workspace]
members = ["xvg-core", "xvg-cli", "xvg-py", "xvg-wasm", "xvg-desktop"]
resolver = "2"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
bincode = "1.3"
anyhow = "1.0"
"@

# Create xvg-core
New-Item -ItemType Directory -Force -Path "xvg-core"
Set-Location "xvg-core"
New-Item -ItemType File -Force -Path ".\Cargo.toml" -Value @"
[package]
name = "xvg-core"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
bincode = "1.3"
anyhow = "1.0"
"@
New-Item -ItemType Directory -Force -Path "src"
Set-Location "src"
New-Item -ItemType File -Force -Path ".\lib.rs" -Value @"
use serde::{Serialize, Deserialize};
use std::io::{Cursor, Read};

pub const MAGIC: [u8; 4] = *b"XVG\x02";

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct Header {
    pub width: u16,
    pub height: u16,
    pub frame_count: u32,
    pub frame_rate: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PathRecord {
    pub data: Vec<u8>,
    pub tf: [f64; 6],
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct File {
    pub header: Header,
    pub paths: Vec<PathRecord>,
    pub sdf: Option<SDFWeights>,
    pub crdt: Vec<CRDTEntry>,
    pub shaders: Vec<ShaderWGSL>,
    pub scene3d: Vec<Scene3DMatrix>,
}

impl File {
    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(&MAGIC);
        bincode::serialize_into(&mut out, self).unwrap();
        out
    }
    pub fn decode(bytes: &[u8]) -> anyhow::Result<Self> {
        let mut magic = [0u8; 4];
        let mut cur = Cursor::new(bytes);
        cur.read_exact(&mut magic)?;
        anyhow::ensure!(magic == MAGIC, "not xvg v3");
        Ok(bincode::deserialize_from(cur)?)
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SDFWeights {
    pub weights: Vec<u8>,
    pub grid_hint: u16,
}

impl SDFWeights {
    pub fn new(weights: Vec<u8>, grid_hint: u16) -> Self {
        SDFWeights { weights, grid_hint }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CRDTEntry {
    pub author: u16,
    pub lamport: u64,
    pub payload: Vec<u8>,
}

impl CRDTEntry {
    pub fn new(author: u16, lamport: u64, payload: Vec<u8>) -> Self {
        CRDTEntry { author, lamport, payload }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ShaderWGSL {
    pub name: String,
    pub wgsl: Vec<u8>,
    pub compressed: bool,
}

impl ShaderWGSL {
    pub fn new(name: String, wgsl: Vec<u8>, compressed: bool) -> Self {
        ShaderWGSL { name, wgsl, compressed }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Scene3DMatrix {
    pub depth: u16,
    pub matrix: [f32; 16],
}

impl Scene3DMatrix {
    pub fn new(depth: u16, matrix: [f32; 16]) -> Self {
        Scene3DMatrix { depth, matrix }
    }
}
"@
Set-Location ..

# Create xvg-cli
New-Item -ItemType Directory -Force -Path "..\xvg-cli"
Set-Location "..\xvg-cli"
New-Item -ItemType File -Force -Path ".\Cargo.toml" -Value @"
[package]
name = "xvg-cli"
version = "0.1.0"
edition = "2021"

[dependencies]
xvg-core = { path = "../xvg-core" }
clap = { version = "4", features = ["derive"] }
anyhow = "1.0"
"@
New-Item -ItemType Directory -Force -Path "src"
Set-Location "src"
New-Item -ItemType File -Force -Path ".\main.rs" -Value @"
use clap::Parser;
use xvg_core::File;

#[derive(Parser)]
#[command(name = "xvgc")]
struct Args {
    #[command(subcommand)]
    cmd: Commands,
}

#[derive(clap::Subcommand)]
enum Commands {
    Info { path: String },
}

fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    match args.cmd {
        Commands::Info { path } => {
            let bytes = std::fs::read(path)?;
            let file = File::decode(&bytes)?;
            println!("{:#?}", file.header);
        }
    }
    Ok(())
}
"@
Set-Location "..\.."

# Create xvg-py
New-Item -ItemType Directory -Force -Path "xvg-py"
Set-Location "xvg-py"
New-Item -ItemType File -Force -Path ".\Cargo.toml" -Value @"
[package]
name = "xvg-py"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
xvg-core = { path = "../xvg-core" }
pyo3 = { version = "0.22", features = ["extension-module"] }
"@
New-Item -ItemType Directory -Force -Path "src"
Set-Location "src"
New-Item -ItemType File -Force -Path ".\lib.rs" -Value @"
use pyo3::prelude::*;
use xvg_core::{File, Header};

#[pymodule]
fn xvg(_py: Python, m: &Bound<'_, PyModule>) -> PyResult<()> {
    #[pyclass]
    struct PyFile {
        inner: File,
    }
    #[pymethods]
    impl PyFile {
        #[new]
        fn new(width: u16, height: u16) -> Self {
            Self {
                inner: File {
                    header: Header { width, height },
                    ..Default::default()
                },
            }
        }
        fn save(&self, path: &str) -> PyResult<()> {
            std::fs::write(path, self.inner.encode()).map_err(|e| e.into())
        }
    }
    m.add_class::<PyFile>()?;
    Ok(())
}
"@
Set-Location "..\.."

# Create xvg-wasm
New-Item -ItemType Directory -Force -Path "xvg-wasm"
Set-Location "xvg-wasm"
New-Item -ItemType File -Force -Path ".\Cargo.toml" -Value @"
[package]
name = "xvg-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
xvg-core = { path = "../xvg-core" }
wasm-bindgen = "0.2"
"@
New-Item -ItemType Directory -Force -Path "src"
Set-Location "src"
New-Item -ItemType File -Force -Path ".\lib.rs" -Value @"
use wasm_bindgen::prelude::*;
use xvg_core::File;

#[wasm_bindgen]
pub fn decode(bytes: &[u8]) -> Result<JsValue, JsValue> {
    let file = File::decode(bytes).map_err(|e| e.to_string())?;
    Ok(serde_wasm_bindgen::to_value(&file).unwrap())
}

#[wasm_bindgen]
pub fn encode(file: JsValue) -> Vec<u8> {
    let file: File = serde_wasm_bindgen::from_value(file).unwrap();
    file.encode()
}
"@
Set-Location "..\.."

# Create xvg-desktop
New-Item -ItemType Directory -Force -Path "xvg-desktop"
Set-Location "xvg-desktop"
New-Item -ItemType File -Force -Path ".\Cargo.toml" -Value @"
[package]
name = "xvg-desktop"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "1", features = ["api-all"] }
xvg-core = { path = "../xvg-core" }
egui = "0.27"
egui-winit = "0.27"
egui-wgpu = "0.27"
"@
New-Item -ItemType Directory -Force -Path "src"
Set-Location "src"
New-Item -ItemType File -Force -Path ".\main.rs" -Value @"
use eframe::{egui, egui_wgpu};
use xvg_core::File;

fn main() {
    let options = eframe::NativeOptions::default();
    eframe::run_native("XVG Desktop", options, Box::new(|_cc| Box::new(App::default())));
}

struct App {
    file: Option<File>,
}

impl Default for App {
    fn default() -> Self {
        Self { file: None }
    }
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        egui::CentralPanel::default().show(ctx, |ui| {
            if ui.button("Open").clicked() {
                if let Some(path) = rfd::FileDialog::new().pick_file() {
                    let bytes = std::fs::read(path).unwrap();
                    self.file = File::decode(&bytes).ok();
                }
            }
            if let Some(f) = &self.file {
                ui.label(format!("W:{} H:{}", f.header.width, f.header.height));
            }
        });
    }
}
"@
Set-Location "..\.."

# Install maturin
cargo install maturin

# Build all components
Write-Host "Building CLI..."
cargo build --release -p xvg-cli

Write-Host "Building Python bindings..."
cd xvg-py
maturin develop --release

Write-Host "Building WASM package..."
cd ..
cd xvg-wasm
wasm-pack build --release --target web

Write-Host "Building Desktop app..."
cd ..
cd xvg-desktop
cargo tauri build

Write-Host "All components built successfully!"