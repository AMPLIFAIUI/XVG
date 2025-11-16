
use anyhow::{Result, anyhow};
use tiny_skia::{Pixmap, Transform, FillRule as SkiaFillRule, Paint, Color, Stroke, LineCap as SkiaLineCap, LineJoin as SkiaLineJoin};

use image::codecs::png::PngEncoder;
use image::ImageEncoder;
use std::io::Cursor;

// Re-export xvg_core types for downstream crates like xvg-wasm
pub use xvg_core::{File, Header, PathRecord, PathStyle, FillStyle, StrokeStyle, FillRule, LineCap, LineJoin, BlendMode, SDFLayer, sdf::SDFEngine, three_d::Scene3DEngine, Scene3DNode, crdt::CRDTEngine, CRDTEntry};

// --- XVG Runtime Contract Definitions ---

pub enum RenderTarget {
    Bitmap,
    Svg,
    Png,
    #[cfg(feature = "gpu")]
    GpuTexture,
}

pub enum RenderOutput {
    Bitmap(Vec<u8>), // RGBA8888 pixel data
    #[cfg(feature = "gpu")]
    GpuTexture(wgpu::Texture),
}

// --- XVG Runtime Core Struct ---

#[cfg(feature = "gpu")]
use wgpu;
#[cfg(feature = "gpu")]
use winit::window::Window;

pub struct XVGRuntime {
    file: File,
    sdf_engine: SDFEngine,
    scene_3d_engine: Scene3DEngine,
    crdt_engine: CRDTEngine,
}

impl XVGRuntime {
    /// Loads an XVG file from raw bytes.
    pub fn load(data: &[u8]) -> Result<Self> {
        let file = File::decode(data)?;
        let sdf_engine = SDFEngine::new();
        let scene_3d_engine = Scene3DEngine::new();
        let crdt_engine = CRDTEngine::new(1); // Placeholder author_id for now
        Ok(Self { file, sdf_engine, scene_3d_engine, crdt_engine })
    }

    /// Implements the core rendering contract: xvg.render(width, height, target)
    pub fn render(&self, width: u32, height: u32, target: RenderTarget) -> Result<RenderOutput> {
        #[cfg(feature = "gpu")]
        if let RenderTarget::GpuTexture = target {
            return self.render_to_gpu(width, height);
        }
        match target {
            RenderTarget::Bitmap => self.render_to_bitmap(width, height),
            RenderTarget::Svg => self.extract_svg().map(RenderOutput::Bitmap),
            RenderTarget::Png => self.extract_png().map(RenderOutput::Bitmap),
            #[cfg(feature = "gpu")]
            RenderTarget::GpuTexture => self.render_to_gpu(width, height),
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

        // --- 1. Render SDFs ---
        for sdf_record in &self.file.sdf {
            self.render_sdf_record(&mut pixmap, width, height, sdf_record)?;
        }

        // --- 2. Render 3D Scenes ---
        for scene_node in &self.file.scene3d {
            self.render_3d_scene_node(&mut pixmap, width, height, scene_node)?;
        }

        // --- 3. Render Paths ---
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

    #[cfg(feature = "gpu")]
    fn render_to_gpu(&self, width: u32, height: u32) -> Result<RenderOutput> {
        // 1. Initialize WGPU (Instance, Adapter, Device, Queue)
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::default());
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
            .ok_or_else(|| anyhow!("Failed to find an appropriate adapter"))?;

        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("XVG Render Device"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_webgl2_defaults(),
            },
            None,
        ))?;

        // 2. Create a texture to render to
        let texture_size = wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        };
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("XVG Render Target"),
            size: texture_size,
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let texture_view = texture.create_view(&wgpu::TextureViewDescriptor::default());

        // 3. Create a command encoder
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("XVG Render Encoder"),
        });

        // 4. Begin render pass
        {
            let _render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("XVG Render Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &texture_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), // Clear to black for now
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            // NOTE: Here is where the actual rendering logic for Paths, SDFs, and 3D would go.
            // For this phase, we are just setting up the pipeline.
        }

        // 5. Submit the command buffer
        queue.submit(Some(encoder.finish()));

        // 6. Return the texture
        Ok(RenderOutput::GpuTexture(texture))
    }

    // --- Internal CRDT Implementation ---

    /// Applies a CRDT operation to the file state.
    pub fn apply_crdt_op(&mut self, op: CRDTEntry) -> Result<()> {
        // NOTE: This is a placeholder for the complex CRDT application logic.
        // A full implementation would involve:
        // 1. Deserializing the CRDT operation payload.
        // 2. Calling the appropriate method on self.crdt_engine to apply the change.
        // 3. Updating the self.file state based on the CRDT engine's result.

        // For now, we will just log the operation.
        println!("Applying CRDT Operation: {:?}", op.operation_type);
        
        // Placeholder for actual logic
        // self.crdt_engine.apply_op(&mut self.file, op)?;

        Ok(())
    }

    // --- Internal 3D Rendering Implementation ---

    fn render_3d_scene_node(&self, pixmap: &mut Pixmap, width: u32, height: u32, scene_node: &Scene3DNode) -> Result<()> {
        // NOTE: This is a placeholder for a complex 3D rendering process.
        // For now, we will draw a simple green bounding box to indicate the 3D area.
        // A full implementation would involve a software rasterizer or a WGPU call.

        let color = Color::from_rgba8(0, 255, 0, 128); // Semi-transparent Green
        let mut paint = Paint::default();
        paint.set_color(color);
        paint.anti_alias = true;

        // Placeholder: Draw a rectangle based on the 3D node's assumed screen projection
        // In a real scenario, we would need to project the 3D mesh's bounding box.
        // For simplicity, we'll use a fixed area for now.
        let rect = tiny_skia::Rect::from_xywh(
            (width as f32 * 0.1),
            (height as f32 * 0.1),
            (width as f32 * 0.8),
            (height as f32 * 0.8),
        ).ok_or_else(|| anyhow!("Invalid 3D placeholder bounds"))?;

        let transform = Transform::identity();

        pixmap.fill_rect(
            rect,
            &paint,
            transform,
            None,
        );

        Ok(())
    }

    // --- Internal SDF Rendering Implementation ---

    fn render_sdf_record(&self, pixmap: &mut Pixmap, width: u32, height: u32, sdf_record: &SDFLayer) -> Result<()> {
        // NOTE: This is a placeholder for a complex SDF rendering process.
        // For now, we will draw a simple bounding box to indicate the SDF area.
        // A full implementation would involve querying the SDF engine for distance
        // at each pixel and coloring based on the result.

        let color = Color::from_rgba8(255, 0, 0, 128); // Semi-transparent Red
        let mut paint = Paint::default();
        paint.set_color(color);
        paint.anti_alias = true;

        let rect = tiny_skia::Rect::from_xywh(
            sdf_record.bounds[0],
            sdf_record.bounds[1],
            sdf_record.bounds[2] - sdf_record.bounds[0],
            sdf_record.bounds[3] - sdf_record.bounds[1],
        ).ok_or_else(|| anyhow!("Invalid SDF bounds"))?;

        let scale_x = width as f32 / self.file.header.width as f32;
        let scale_y = height as f32 / self.file.header.height as f32;
        let transform = Transform::from_scale(scale_x, scale_y);

        pixmap.fill_rect(
            rect,
            &paint,
            transform,
            None,
        );

        Ok(())
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
            #[cfg(feature = "gpu")]
            RenderOutput::GpuTexture(_) => return Err(anyhow!("Cannot encode GPU texture to PNG.")),
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
