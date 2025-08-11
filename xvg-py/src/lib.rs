use pyo3::prelude::*;
use xvg_core::{File, Header};

#[pymodule]
fn xvg(_py: Python, m: &PyModule) -> PyResult<()> {
    m.add_class::<XVGFile>()?;
    Ok(())
}

#[pyclass]
pub struct XVGFile {
    inner: File,
}

#[pymethods]
impl XVGFile {
    #[new]
    pub fn new(width: u16, height: u16) -> Self {
        Self {
            inner: File {
                header: Header { width, height, ..Default::default() },
                ..Default::default()
            }
        }
    }

    pub fn encode(&self) -> Vec<u8> {
        self.inner.encode()
    }

    #[staticmethod]
    pub fn decode(bytes: &[u8]) -> PyResult<Self> {
        let file = File::decode(bytes).map_err(|e| PyErr::new::<pyo3::exceptions::PyValueError, _>(e.to_string()))?;
        Ok(XVGFile { inner: file })
    }

    pub fn add_path(&mut self, data: Vec<u8>, tf: Vec<f64>) -> PyResult<()> {
        if tf.len() != 6 {
            return Err(PyErr::new::<pyo3::exceptions::PyValueError, _>("Transform must have 6 elements"));
        }
        let tf_array: [f64; 6] = tf.try_into().unwrap();
        self.inner.paths.push(xvg_core::PathRecord { 
            data, 
            tf: tf_array, 
            style: xvg_core::PathStyle {
                fill: None,
                stroke: None,
                opacity: 1.0,
                blend_mode: xvg_core::BlendMode::Normal,
            },
            original_svg: None,
        });
        Ok(())
    }
} 