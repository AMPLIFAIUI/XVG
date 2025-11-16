use wasm_bindgen::prelude::*;
use serde_json;
use xvg_runtime::CRDTEntry;
use js_sys::Uint8Array;
use xvg_runtime::{XVGRuntime, RenderTarget};
use anyhow::Result;

// Error wrapper for JS
fn wrap_err<E: std::fmt::Display>(err: E) -> JsValue {
    JsValue::from_str(&err.to_string())
}

/// The WASM-exposed XVG Runtime, implementing the Zero-Conversion contract.
#[wasm_bindgen(js_name = XVGRuntime)]
pub struct XVGRuntimeWasm(XVGRuntime);

#[wasm_bindgen(js_class = XVGRuntime)]
impl XVGRuntimeWasm {
    /// Loads an XVG file from raw bytes (Uint8Array or ArrayBuffer).
    #[wasm_bindgen(constructor)]
    pub fn load(data: &[u8]) -> Result<XVGRuntimeWasm, JsValue> {
        XVGRuntime::load(data)
            .map(XVGRuntimeWasm)
            .map_err(wrap_err)
    }

    /// Implements the core rendering contract: xvg.render(width, height)
    /// Renders the XVG file to a bitmap and returns the RGBA8888 pixel data as a Uint8Array.
    #[wasm_bindgen]
    pub fn render(&self, width: u32, height: u32) -> Result<Uint8Array, JsValue> {
        let output = self.0.render(width, height, RenderTarget::Bitmap)
            .map_err(wrap_err)?;

        match output {
            xvg_runtime::RenderOutput::Bitmap(data) => {
                // Copy the Vec<u8> data into a new Uint8Array for JS
                Ok(Uint8Array::from(data.as_slice()))
            },
            // This case is currently unreachable as only Bitmap is implemented
            _ => Err(JsValue::from_str("Unsupported render output type in WASM")),
        }
    }

    /// Implements the core extraction contract: xvg.extract(format)
    /// Extracts the XVG file to a legacy format (e.g., "svg", "png") and returns the raw bytes.
    #[wasm_bindgen]
    pub fn extract(&self, format: &str) -> Result<Uint8Array, JsValue> {
        let data = self.0.extract(format)
            .map_err(wrap_err)?;

        // Copy the Vec<u8> data into a new Uint8Array for JS
        Ok(Uint8Array::from(data.as_slice()))
    }

    /// Applies a CRDT operation to the file state.
    /// The operation is passed as a JSON string.
    #[wasm_bindgen(js_name = applyCrdtOp)]
    pub fn apply_crdt_op(&mut self, op_json: &str) -> Result<(), JsValue> {
        let op: CRDTEntry = serde_json::from_str(op_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to deserialize CRDT operation: {}", e)))?;

        self.0.apply_crdt_op(op)
            .map_err(|e| JsValue::from_str(&format!("Failed to apply CRDT operation: {}", e)))?;

        Ok(())
    }
}

// --- Minimal Stub for XVGFile ---
// This is kept to prevent breaking the editor's existing save/load logic during the transition.
// The editor will be updated in the next phase to use XVGRuntime.

use xvg_runtime::{File, Header, PathRecord, PathStyle, FillStyle, StrokeStyle, FillRule, LineCap, LineJoin, BlendMode};
use wasm_bindgen::JsCast;
use js_sys::{Array, ArrayBuffer};
use serde_wasm_bindgen;

/// A safe, high-level wrapper around the Rust XVG file model.
#[wasm_bindgen(js_name = XVGFile)]
pub struct XVGFileWasm(File);

#[wasm_bindgen(js_class = XVGFile)]
impl XVGFileWasm {
    /// Create an empty XVG file of given width and height.
    #[wasm_bindgen(constructor)]
    pub fn new(width: u16, height: u16) -> XVGFileWasm {
        XVGFileWasm(File {
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
    pub fn decode(bytes: &JsValue) -> Result<XVGFileWasm, JsValue> {
        // Accept Uint8Array or ArrayBuffer
        let u8slice: Vec<u8> = if let Some(arr) = bytes.dyn_ref::<Uint8Array>() {
            arr.to_vec()
        } else if let Some(buf) = bytes.dyn_ref::<ArrayBuffer>() {
            Uint8Array::new(buf).to_vec()
        } else {
            return Err(JsValue::from_str("Expected Uint8Array or ArrayBuffer"));
        };
        File::decode(&u8slice).map(XVGFileWasm).map_err(wrap_err)
    }

    /// Add a path from binary point data, transform, and style (JS object).
    #[wasm_bindgen]
    pub fn add_path(&mut self, data: &JsValue, tf: &JsValue, style: &JsValue) -> Result<(), JsValue> {
        let data_vec: Vec<u8> = if let Some(arr) = data.dyn_ref::<Uint8Array>() {
            arr.to_vec()
        } else if let Some(buf) = data.dyn_ref::<ArrayBuffer>() {
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
            original_svg: None,
            layer_id: None,
        });
        Ok(())
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
}

// Export the stub for the old XVGFile struct
pub use XVGFileWasm as XVGFile;
