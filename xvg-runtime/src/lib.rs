
use anyhow::{Result, anyhow};
use tiny_skia::{Pixmap, Transform, FillRule as SkiaFillRule, Paint, Color, Stroke, LineCap as SkiaLineCap, LineJoin as SkiaLineJoin};

use image::codecs::png::PngEncoder;
use image::ImageEncoder;
use std::io::Cursor;

// Re-export xvg_core types for downstream crates like xvg-wasm
pub use xvg_core::{File, Header, PathRecord, PathStyle, FillStyle, StrokeStyle, FillRule, LineCap, LineJoin, BlendMode};

// --- XVG Runtime Contract Definitions ---

pub enum RenderTarget {
    Bitmap,
    // GpuDevice { device: &'a wgpu::Device, queue: &'a wgpu::Queue }, // Future WebGPU implementation
}

pub enum RenderOutput {
    Bitmap(Vec<u8>), // RGBA8888 pixel data
    // GpuTexture(wgpu::Texture),
}

// --- XVG Runtime Core Struct ---

pub struct XVGRuntime {
    file: File,
}

impl XVGRuntime {
    /// Loads an XVG file from raw bytes.
    pub fn load(data: &[u8]) -> Result<Self> {
        let file = File::decode(data)?;
        Ok(Self { file })
    }

    /// Implements the core rendering contract: xvg.render(width, height, target)
    pub fn render(&self, width: u32, height: u32, target: RenderTarget) -> Result<RenderOutput> {
        match target {
            RenderTarget::Bitmap => self.render_to_bitmap(width, height),
            // _ => Err(anyhow!("Unsupported render target")),
        }
    }

    /// Implements the core extraction contract: xvg.extract(format)
    pub fn extract(&self, format: &str) -> Result<Vec<u8>> {
        match format {
            "svg" => self.extract_svg(),
            "png" => self.extract_png(),
            _ => Err(anyhow!("Unsupported extract format: {}", format)),
        }
    }

    // --- Internal Rendering Implementation (CPU Rasterization) ---

    fn render_to_bitmap(&self, width: u32, height: u32) -> Result<RenderOutput> {
        let mut pixmap = Pixmap::new(width, height).ok_or_else(|| anyhow!("Failed to create pixmap"))?;
        let scale_x = width as f32 / self.file.header.width as f32;
        let scale_y = height as f32 / self.file.header.height as f32;
        let transform = Transform::from_scale(scale_x, scale_y);

        // Fill the background with a transparent color (optional, but good practice)
        pixmap.fill(Color::from_rgba8(0, 0, 0, 0));

        for path_record in &self.file.paths {
            // 1. Convert XVG PathRecord to tiny-skia Path
            let mut pb = tiny_skia::PathBuilder::new();
            // NOTE: The current xvg-core::PathRecord.data is a simple list of points in the provided code.
            // A proper implementation would parse the full XVG opcode stream.
            // For now, we use the simple point list interpretation from the provided xvg-core::export.rs
            let mut it = path_record.data.chunks_exact(8);
            if let Some(first) = it.next() {
                let x = f32::from_le_bytes(first[0..4].try_into().unwrap_or_default());
                let y = f32::from_le_bytes(first[4..8].try_into().unwrap_or_default());
                pb.move_to(x, y);
                for seg in it {
                    let x = f32::from_le_bytes(seg[0..4].try_into().unwrap_or_default());
                    let y = f32::from_le_bytes(seg[4..8].try_into().unwrap_or_default());
                    pb.line_to(x, y);
                }
            }
            let path = pb.finish().ok_or_else(|| anyhow!("Failed to build path"))?;

            // 2. Apply Fill
            if let Some(fill) = &path_record.style.fill {
                let color = Color::from_rgba8(
                    (fill.color[0] * 255.0) as u8,
                    (fill.color[1] * 255.0) as u8,
                    (fill.color[2] * 255.0) as u8,
                    (fill.color[3] * 255.0) as u8,
                );
                let mut paint = Paint::default();
                paint.set_color(color);
                paint.anti_alias = true;

                let fill_rule = match fill.rule {
                    xvg_core::FillRule::NonZero => SkiaFillRule::Winding,
                    xvg_core::FillRule::EvenOdd => SkiaFillRule::EvenOdd,
                };

                pixmap.fill_path(
                    &path,
                    &paint,
                    fill_rule,
                    transform,
                    None,
                );
            }

            // 3. Apply Stroke
            if let Some(stroke) = &path_record.style.stroke {
                let color = Color::from_rgba8(
                    (stroke.color[0] * 255.0) as u8,
                    (stroke.color[1] * 255.0) as u8,
                    (stroke.color[2] * 255.0) as u8,
                    (stroke.color[3] * 255.0) as u8,
                );
                let mut paint = Paint::default();
                paint.set_color(color);
                paint.anti_alias = true;

                let mut stroke_style = Stroke::default();
                stroke_style.width = stroke.width;
                stroke_style.line_cap = match stroke.cap {
                    xvg_core::LineCap::Butt => SkiaLineCap::Butt,
                    xvg_core::LineCap::Round => SkiaLineCap::Round,
                    xvg_core::LineCap::Square => SkiaLineCap::Square,
                };
                stroke_style.line_join = match stroke.join {
                    xvg_core::LineJoin::Miter => SkiaLineJoin::Miter,
                    xvg_core::LineJoin::Round => SkiaLineJoin::Round,
                    xvg_core::LineJoin::Bevel => SkiaLineJoin::Bevel,
                };
                // NOTE: Dash array is ignored for simplicity, but should be implemented for full spec compliance

                pixmap.stroke_path(
                    &path,
                    &paint,
                    &stroke_style,
                    transform,
                    None,
                );
            }
        }

        Ok(RenderOutput::Bitmap(pixmap.take()))
    }

    // --- Internal Extraction Implementation ---

    fn extract_svg(&self) -> Result<Vec<u8>> {
        // Reuse the existing xvg-core function for SVG export
        let svg_string = xvg_core::export::file_to_svg(&self.file);
        Ok(svg_string.into_bytes())
    }

    fn extract_png(&self) -> Result<Vec<u8>> {
        let width = self.file.header.width as u32;
        let height = self.file.header.height as u32;

        // 1. Render to bitmap
        let bitmap_output = self.render_to_bitmap(width, height)?;
        let pixel_data = match bitmap_output {
            RenderOutput::Bitmap(data) => data,
            
        };

        // 2. Encode to PNG
        let mut buffer = Cursor::new(Vec::new());
        let encoder = PngEncoder::new(&mut buffer);
        encoder.write_image(
            &pixel_data,
            width,
            height,
            image::ColorType::Rgba8,
        )?;

        Ok(buffer.into_inner())
    }
}
