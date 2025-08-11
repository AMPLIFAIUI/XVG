use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use js_sys::{Uint8Array, Array};

use serde_wasm_bindgen;
use xvg_core::{
    File, Header, PathRecord, PathStyle, FillStyle, StrokeStyle,
    FillRule, LineCap, LineJoin, BlendMode
};

/// Error as string for JS
fn wrap_err<E: std::fmt::Display>(err: E) -> JsValue {
    JsValue::from_str(&err.to_string())
}

/// A safe, high-level wrapper around the Rust XVG file model, optimized for WASM/JS/TS.
#[wasm_bindgen]
pub struct XVGFile(File);

#[wasm_bindgen]
impl XVGFile {
    /// Create an empty XVG file of given width and height.
    #[wasm_bindgen(constructor)]
    pub fn new(width: u16, height: u16) -> XVGFile {
        XVGFile(File {
            header: Header { width, height, ..Default::default() },
            ..Default::default()
        })
    }

    /// Encode and return the file as a Uint8Array (zero-copy).
    #[wasm_bindgen]
    pub fn encode_bytes(&self) -> Uint8Array {
        let bytes = self.0.encode();
        Uint8Array::from(bytes.as_slice())
    }

    /// Decode binary data (Uint8Array or Array) as an XVGFile.
    #[wasm_bindgen]
    pub fn decode(bytes: &JsValue) -> Result<XVGFile, JsValue> {
        // Accept Uint8Array or ArrayBuffer
        let u8slice: Vec<u8> = if let Some(arr) = bytes.dyn_ref::<Uint8Array>() {
            arr.to_vec()
        } else if let Some(buf) = bytes.dyn_ref::<js_sys::ArrayBuffer>() {
            Uint8Array::new(buf).to_vec()
        } else {
            return Err(JsValue::from_str("Expected Uint8Array or ArrayBuffer"));
        };
        File::decode(&u8slice).map(XVGFile).map_err(wrap_err)
    }

    /// Add a path from binary point data, transform, and style (JS object).
    /// - `data`: Float32[x0, y0, x1, y1, ...] as Uint8Array or ArrayBuffer
    /// - `tf`: Array of 6 numbers [a,b,c,d,e,f]
    /// - `style`: PathStyle as JS object or undefined/null for default.
    #[wasm_bindgen]
    pub fn add_path(&mut self, data: &JsValue, tf: &JsValue, style: &JsValue) -> Result<(), JsValue> {
        let data_vec: Vec<u8> = if let Some(arr) = data.dyn_ref::<Uint8Array>() {
            arr.to_vec()
        } else if let Some(buf) = data.dyn_ref::<js_sys::ArrayBuffer>() {
            Uint8Array::new(buf).to_vec()
        } else {
            return Err(JsValue::from_str("add_path: data must be Uint8Array or ArrayBuffer"));
        };
        let tf_vec: Vec<f64> = serde_wasm_bindgen::from_value(tf.clone()).map_err(wrap_err)?;
        if tf_vec.len() != 6 {
            return Err(JsValue::from_str("add_path: tf must be array of 6 values"));
        }
        let style_val: PathStyle = if style.is_undefined() || style.is_null() {
            PathStyle {
                fill: None,
                stroke: None,
                opacity: 1.0,
                blend_mode: BlendMode::Normal,
            }
        } else {
            serde_wasm_bindgen::from_value(style.clone()).map_err(wrap_err)?
        };
        self.0.paths.push(PathRecord {
            data: data_vec,
            tf: [tf_vec[0],tf_vec[1],tf_vec[2],tf_vec[3],tf_vec[4],tf_vec[5]],
            style: style_val,
        });
        Ok(())
    }

    /// Get all path records as a JS array of objects; efficient for interop.
    #[wasm_bindgen]
    pub fn get_paths(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.0.paths).map_err(wrap_err)
    }
    /// Get header as a JS object (width, height, etc).
    #[wasm_bindgen]
    pub fn get_header(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.0.header).map_err(wrap_err)
    }
    /// Number of vector paths in file.
    #[wasm_bindgen(getter)]
    pub fn path_count(&self) -> usize {
        self.0.paths.len()
    }
    /// Remove all vector paths.
    #[wasm_bindgen]
    pub fn clear_paths(&mut self) {
        self.0.paths.clear();
    }
    /// Remove path by index (returns success/failure).
    #[wasm_bindgen]
    pub fn remove_path(&mut self, index: usize) -> bool {
        if index < self.0.paths.len() {
            self.0.paths.remove(index);
            true
        } else {
            false
        }
    }
    /// Basic info as a JS object (for fast preview).
    #[wasm_bindgen]
    pub fn get_file_info(&self) -> Result<JsValue, JsValue> {
        let info = serde_json::json!({
            "width": self.0.header.width,
            "height": self.0.header.height,
            "frame_count": self.0.header.frame_count,
            "frame_rate": self.0.header.frame_rate,
            "path_count": self.0.paths.len(),
            "asset_count": self.0.assets.len(),
            "has_physics": self.0.physics.is_some(),
            "has_audio": !self.0.audio_tracks.is_empty(),
            "has_collaboration": !self.0.crdt.is_empty(),
        });
        serde_wasm_bindgen::to_value(&info).map_err(wrap_err)
    }
}

// PathBuilder for easy JS construction via fluent API
#[wasm_bindgen]
pub struct XVGPathBuilder {
    points: Vec<f32>,
    style: PathStyle,
}

#[wasm_bindgen]
impl XVGPathBuilder {
    /// New builder, with empty geometry.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            points: Vec::new(),
            style: PathStyle {
                fill: None,
                stroke: None,
                opacity: 1.0,
                blend_mode: BlendMode::Normal,
            },
        }
    }

    /// Add a 2D point to the path.
    pub fn add_point(&mut self, x: f32, y: f32) {
        self.points.push(x);
        self.points.push(y);
    }

    pub fn set_fill_color(&mut self, r: f32, g: f32, b: f32, a: f32) {
        self.style.fill = Some(FillStyle {
            color: [r, g, b, a],
            rule: FillRule::NonZero
        });
    }
    pub fn set_stroke_color(&mut self, r: f32, g: f32, b: f32, a: f32, width: f32) {
        self.style.stroke = Some(StrokeStyle {
            color: [r, g, b, a],
            width,
            cap: LineCap::Round,
            join: LineJoin::Round,
            dash_array: Vec::new()
        });
    }
    /// Build returns [bytes, style] as a JS array: [Uint8Array, PathStyle].
    pub fn build(&self) -> Result<Array, JsValue> {
        let mut data = Vec::new();
        for &val in &self.points {
            data.extend_from_slice(&val.to_le_bytes());
        }
        let out = Array::new();
        out.push(&Uint8Array::from(data.as_slice()));
        out.push(&serde_wasm_bindgen::to_value(&self.style).map_err(wrap_err)?);
        Ok(out)
    }
    pub fn get_style(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.style).map_err(wrap_err)
    }
}

// Camera/viewport helper for pan/zoom, world<->screen
#[wasm_bindgen]
pub struct XVGRenderer {
    canvas_width: f32,
    canvas_height: f32,
    zoom: f32,
    pan_x: f32,
    pan_y: f32,
}

#[wasm_bindgen]
impl XVGRenderer {
    /// Create new camera/viewport for specified dimensions.
    #[wasm_bindgen(constructor)]
    pub fn new(width: f32, height: f32) -> Self {
        Self {
            canvas_width: width,
            canvas_height: height,
            zoom: 1.0,
            pan_x: 0.0,
            pan_y: 0.0,
        }
    }

    pub fn set_zoom(&mut self, zoom: f32) {
        self.zoom = zoom.clamp(0.1, 10.0);
    }
    pub fn set_pan(&mut self, x: f32, y: f32) {
        self.pan_x = x;
        self.pan_y = y;
    }
    pub fn world_to_screen(&self, x: f32, y: f32) -> Result<Array, JsValue> {
        let screen_x = (x + self.pan_x) * self.zoom + self.canvas_width / 2.0;
        let screen_y = (y + self.pan_y) * self.zoom + self.canvas_height / 2.0;
        let arr = Array::new();
        arr.push(&JsValue::from_f64(screen_x as f64));
        arr.push(&JsValue::from_f64(screen_y as f64));
        Ok(arr)
    }
    pub fn screen_to_world(&self, x: f32, y: f32) -> Result<Array, JsValue> {
        let world_x = (x - self.canvas_width / 2.0) / self.zoom - self.pan_x;
        let world_y = (y - self.canvas_height / 2.0) / self.zoom - self.pan_y;
        let arr = Array::new();
        arr.push(&JsValue::from_f64(world_x as f64));
        arr.push(&JsValue::from_f64(world_y as f64));
        Ok(arr)
    }
    pub fn get_viewport_info(&self) -> Result<JsValue, JsValue> {
        let info = serde_json::json!({
            "zoom": self.zoom,
            "pan_x": self.pan_x,
            "pan_y": self.pan_y,
            "canvas_width": self.canvas_width,
            "canvas_height": self.canvas_height,
        });
        serde_wasm_bindgen::to_value(&info).map_err(wrap_err)
    }
}

// Utilities
#[wasm_bindgen]
pub fn create_sample_file() -> XVGFile {
    let mut file = File::default();
    file.header.width = 800;
    file.header.height = 600;
    let mut path_data = Vec::new();
    let points = [100.0, 100.0, 300.0, 100.0, 300.0, 200.0, 100.0, 200.0, 100.0, 100.0];
    for &p in &points {
        path_data.extend_from_slice(&(p as f32).to_le_bytes());
    }
    file.paths.push(PathRecord {
        data: path_data,
        tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        style: PathStyle {
            fill: Some(FillStyle { color: [0.2, 0.6, 1.0, 0.8], rule: FillRule::NonZero }),
            stroke: Some(StrokeStyle {
                color: [0.1, 0.3, 0.8, 1.0], width: 2.0,
                cap: LineCap::Round,
                join: LineJoin::Round,
                dash_array: Vec::new(),
            }),
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
        }
    });
    XVGFile(file)
}

/// Parse raw path binary data (as Uint8Array) to a JS array of [x, y] arrays.
#[wasm_bindgen]
pub fn parse_path_data(data: &JsValue) -> Result<JsValue, JsValue> {
    let data_vec: Vec<u8> = if let Some(arr) = data.dyn_ref::<Uint8Array>() {
        arr.to_vec()
    } else if let Some(buf) = data.dyn_ref::<js_sys::ArrayBuffer>() {
        Uint8Array::new(buf).to_vec()
    } else {
        return Err(JsValue::from_str("parse_path_data: must be Uint8Array or ArrayBuffer"));
    };
    let mut points = Vec::new();
    let mut i = 0;
    while i + 7 < data_vec.len() {
        let x = f32::from_le_bytes([data_vec[i], data_vec[i + 1], data_vec[i + 2], data_vec[i + 3]]);
        let y = f32::from_le_bytes([data_vec[i + 4], data_vec[i + 5], data_vec[i + 6], data_vec[i + 7]]);
        points.push([x, y]);
        i += 8;
    }
    serde_wasm_bindgen::to_value(&points).map_err(wrap_err)
}