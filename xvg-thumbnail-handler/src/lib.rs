// FILE: xvg-thumbnail-handler/src/lib.rs
// Windows Shell Extension for XVG Thumbnail Provider

#![cfg(windows)]
#![allow(non_snake_case)]

use std::ffi::c_void;
use std::ptr;
use windows::core::{implement, Error, HRESULT, PCWSTR};
use windows::Win32::Foundation::{E_FAIL, E_INVALIDARG, E_NOTIMPL, S_OK};
use windows::Win32::Graphics::Gdi::{
    CreateDIBSection, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP,
};
use windows::Win32::System::Com::{IStream, IUnknown};
use windows::Win32::UI::Shell::{IThumbnailProvider, IThumbnailProvider_Impl, WTS_ALPHATYPE, WTSAT_ARGB};
use windows::Win32::UI::WindowsAndMessaging::GetDC;

use xvg_runtime::{XVGRuntime, RenderTarget, RenderOutput};

/// XVG Thumbnail Provider
/// Implements IThumbnailProvider for Windows Shell Extension
#[implement(IThumbnailProvider)]
pub struct XVGThumbnailProvider {
    file_data: Vec<u8>,
}

impl XVGThumbnailProvider {
    /// Create a new thumbnail provider
    pub fn new() -> Self {
        Self {
            file_data: Vec::new(),
        }
    }

    /// Initialize from stream
    pub fn initialize_from_stream(&mut self, stream: &IStream) -> windows::core::Result<()> {
        unsafe {
            // Get stream size
            let mut stat = std::mem::zeroed();
            stream.Stat(&mut stat, 0)?;
            let size = stat.cbSize as usize;

            // Read stream data
            let mut buffer = vec![0u8; size];
            let mut bytes_read = 0u32;
            stream.Read(buffer.as_mut_ptr() as *mut c_void, size as u32, Some(&mut bytes_read))?;

            self.file_data = buffer;
            Ok(())
        }
    }
}

impl IThumbnailProvider_Impl for XVGThumbnailProvider {
    fn GetThumbnail(&self, cx: u32, phbmp: *mut HBITMAP, pdwAlpha: *mut WTS_ALPHATYPE) -> windows::core::Result<()> {
        unsafe {
            if phbmp.is_null() {
                return Err(Error::from(E_INVALIDARG));
            }

            // Check if we have file data
            if self.file_data.is_empty() {
                return Err(Error::from(E_FAIL));
            }

            // Create XVG runtime and load the file
            let mut runtime = XVGRuntime::new();
            if let Err(_) = runtime.load(&self.file_data) {
                return Err(Error::from(E_FAIL));
            }

            // Render to bitmap
            let size = cx;
            let render_result = match runtime.render(size, size, RenderTarget::Bitmap) {
                Ok(result) => result,
                Err(_) => return Err(Error::from(E_FAIL)),
            };

            let pixels = match render_result {
                RenderOutput::Bitmap(pixels) => pixels,
                _ => return Err(Error::from(E_FAIL)),
            };

            // Create Windows bitmap from pixel data
            let bitmap = create_bitmap_from_rgba(&pixels, size, size);
            if bitmap.is_invalid() {
                return Err(Error::from(E_FAIL));
            }

            *phbmp = bitmap;

            // Set alpha type
            if !pdwAlpha.is_null() {
                *pdwAlpha = WTSAT_ARGB;
            }

            Ok(())
        }
    }
}

/// Create a Windows HBITMAP from RGBA pixel data
unsafe fn create_bitmap_from_rgba(pixels: &[u8], width: u32, height: u32) -> HBITMAP {
    let hdc = GetDC(None);

    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            biHeight: -(height as i32), // Negative for top-down DIB
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB as u32,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [Default::default(); 1],
    };

    let mut bits: *mut c_void = ptr::null_mut();
    let bitmap = CreateDIBSection(
        hdc,
        &bmi,
        DIB_RGB_COLORS,
        &mut bits,
        None,
        0,
    );

    if !bitmap.is_invalid() && !bits.is_null() {
        // Copy RGBA pixels to bitmap (convert RGBA to BGRA for Windows)
        let dest = std::slice::from_raw_parts_mut(bits as *mut u8, pixels.len());
        for i in 0..(pixels.len() / 4) {
            let idx = i * 4;
            dest[idx] = pixels[idx + 2];     // B
            dest[idx + 1] = pixels[idx + 1]; // G
            dest[idx + 2] = pixels[idx];     // R
            dest[idx + 3] = pixels[idx + 3]; // A
        }
    }

    bitmap
}

// COM DLL exports
#[no_mangle]
pub extern "system" fn DllGetClassObject(
    rclsid: *const windows::core::GUID,
    riid: *const windows::core::GUID,
    ppv: *mut *mut c_void,
) -> HRESULT {
    // TODO: Implement class factory
    // For now, return E_NOTIMPL
    E_NOTIMPL
}

#[no_mangle]
pub extern "system" fn DllCanUnloadNow() -> HRESULT {
    // Return S_OK if no objects are in use
    S_OK
}

#[no_mangle]
pub extern "system" fn DllRegisterServer() -> HRESULT {
    // TODO: Register the COM server
    // This would write registry entries for the thumbnail handler
    S_OK
}

#[no_mangle]
pub extern "system" fn DllUnregisterServer() -> HRESULT {
    // TODO: Unregister the COM server
    S_OK
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_creation() {
        let provider = XVGThumbnailProvider::new();
        assert!(provider.file_data.is_empty());
    }
}
