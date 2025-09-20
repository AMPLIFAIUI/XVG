use crate::*;
use xvg_core::*;
use anyhow::Result;
use std::path::Path;
use image::{DynamicImage, ImageBuffer, Rgba, RgbaImage};
use usvg::{Tree, Options, Node, Path as UsvgPath, PathData, Transform};
use tiny_skia::{Path as TinyPath, PathBuilder, FillRule, Stroke, Paint, Color};

pub struct XVGFileIO {
    supported_formats: Vec<String>,
}

impl XVGFileIO {
    pub fn new() -> Self {
        Self {
            supported_formats: vec![
                "svg".to_string(),
                "xvg".to_string(),
                "png".to_string(),
                "jpeg".to_string(),
                "jpg".to_string(),
                "otf".to_string(),
                "ttf".to_string(),
                "wav".to_string(),
                "mp3".to_string(),
            ],
        }
    }

    pub fn get_supported_formats(&self) -> &[String] {
        &self.supported_formats
    }

    pub fn can_import(&self, file_path: &str) -> bool {
        let extension = Path::new(file_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();
        
        self.supported_formats.contains(&extension)
    }

    pub fn import_file(&self, file_path: &str) -> Result<Vec<PathRecord>> {
        let extension = Path::new(file_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();
        
        match extension.as_str() {
            "svg" => self.import_svg(file_path),
            "xvg" => self.import_xvg(file_path),
            "png" | "jpeg" | "jpg" => self.import_raster(file_path),
            "otf" | "ttf" => self.import_font(file_path),
            "wav" | "mp3" => self.import_audio(file_path),
            _ => Err(anyhow::anyhow!("Unsupported file format: {}", extension)),
        }
    }

    pub fn export_file(
        &self,
        paths: &[PathRecord],
        file_path: &str,
        options: ExportOptions,
    ) -> Result<()> {
        let extension = Path::new(file_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();
        
        match extension.as_str() {
            "svg" => self.export_svg(paths, file_path, options),
            "xvg" => self.export_xvg(paths, file_path),
            "png" => self.export_png(paths, file_path, options),
            "jpeg" | "jpg" => self.export_jpeg(paths, file_path, options),
            "otf" => self.export_otf(paths, file_path),
            "wav" => self.export_wav(paths, file_path),
            _ => Err(anyhow::anyhow!("Unsupported export format: {}", extension)),
        }
    }

    fn import_svg(&self, file_path: &str) -> Result<Vec<PathRecord>> {
        let svg_content = std::fs::read_to_string(file_path)?;
        let opt = Options::default();
        let tree = Tree::from_str(&svg_content, &opt)?;
        
        let mut paths = Vec::new();
        let mut current_id = 0;
        
        self.process_svg_node(&tree.root, &mut paths, &mut current_id, Transform::default())?;
        
        Ok(paths)
    }

    fn process_svg_node(
        &self,
        node: &Node,
        paths: &mut Vec<PathRecord>,
        current_id: &mut u32,
        transform: Transform,
    ) -> Result<()> {
        match node {
            Node::Path(path_node) => {
                if let Some(ref path_data) = path_node.path_data {
                    let xvg_path = self.convert_svg_path_to_xvg(path_node, path_data, transform)?;
                    paths.push(xvg_path);
                    *current_id += 1;
                }
            }
            Node::Group(group) => {
                let group_transform = transform.pre_concat(group.transform);
                for child in &group.children {
                    self.process_svg_node(child, paths, current_id, group_transform)?;
                }
            }
            Node::Image(image) => {
                // Convert raster image to vector paths
                let image_paths = self.convert_image_to_paths(image, transform)?;
                paths.extend(image_paths);
                *current_id += image_paths.len() as u32;
            }
            Node::Text(text) => {
                // Convert text to vector paths
                let text_paths = self.convert_text_to_paths(text, transform)?;
                paths.extend(text_paths);
                *current_id += text_paths.len() as u32;
            }
            _ => {
                // Process other node types recursively
                if let Some(children) = node.children() {
                    for child in children {
                        self.process_svg_node(child, paths, current_id, transform)?;
                    }
                }
            }
        }
        
        Ok(())
    }

    fn convert_svg_path_to_xvg(
        &self,
        path_node: &UsvgPath,
        path_data: &PathData,
        transform: Transform,
    ) -> Result<PathRecord> {
        let mut tiny_path = PathBuilder::new();
        
        // Convert SVG path data to TinySkia path
        for segment in path_data {
            match segment {
                PathData::MoveTo { x, y } => {
                    let point = transform.transform_point(*x, *y);
                    tiny_path.move_to(point.x, point.y);
                }
                PathData::LineTo { x, y } => {
                    let point = transform.transform_point(*x, *y);
                    tiny_path.line_to(point.x, point.y);
                }
                PathData::CurveTo { x1, y1, x2, y2, x, y } => {
                    let cp1 = transform.transform_point(*x1, *y1);
                    let cp2 = transform.transform_point(*x2, *y2);
                    let point = transform.transform_point(*x, *y);
                    tiny_path.cubic_to(cp1.x, cp1.y, cp2.x, cp2.y, point.x, point.y);
                }
                PathData::ClosePath => {
                    tiny_path.close();
                }
            }
        }
        
        let path = tiny_path.finish().ok_or_else(|| anyhow::anyhow!("Failed to create path"))?;
        
        // Convert path to XVG format
        let path_data = self.convert_tiny_path_to_xvg_data(&path)?;
        
        // Extract style information
        let style = self.extract_svg_style(path_node)?;
        
        Ok(PathRecord {
            data: path_data,
            tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            style,
            original_svg: Some(format!("<path d=\"{}\"/>", path_data.iter().map(|b| format!("{:02x}", b)).collect::<String>())),
        })
    }

    fn convert_tiny_path_to_xvg_data(&self, path: &TinyPath) -> Result<Vec<u8>> {
        let mut data = Vec::new();
        
        // Extract path segments and convert to XVG format
        // This is a simplified conversion - in practice you'd need more sophisticated path analysis
        let bounds = path.bounds();
        
        // For now, create a simple rectangle approximation
        // In a full implementation, you'd analyze the actual path segments
        let points = [
            (bounds.left(), bounds.top()),
            (bounds.right(), bounds.top()),
            (bounds.right(), bounds.bottom()),
            (bounds.left(), bounds.bottom()),
            (bounds.left(), bounds.top()), // Close path
        ];
        
        for (x, y) in points {
            data.extend_from_slice(&x.to_le_bytes());
            data.extend_from_slice(&y.to_le_bytes());
        }
        
        Ok(data)
    }

    fn extract_svg_style(&self, path_node: &UsvgPath) -> Result<PathStyle> {
        let fill = if let Some(ref fill) = path_node.fill {
            Some(FillStyle {
                color: [
                    fill.color.red as f32 / 255.0,
                    fill.color.green as f32 / 255.0,
                    fill.color.blue as f32 / 255.0,
                    fill.opacity.value(),
                ],
                rule: match fill.rule {
                    usvg::FillRule::NonZero => FillRule::NonZero,
                    usvg::FillRule::EvenOdd => FillRule::EvenOdd,
                },
            })
        } else {
            None
        };
        
        let stroke = if let Some(ref stroke) = path_node.stroke {
            Some(StrokeStyle {
                color: [
                    stroke.color.red as f32 / 255.0,
                    stroke.color.green as f32 / 255.0,
                    stroke.color.blue as f32 / 255.0,
                    stroke.opacity.value(),
                ],
                width: stroke.width.value(),
                cap: match stroke.line_cap {
                    usvg::LineCap::Butt => LineCap::Butt,
                    usvg::LineCap::Round => LineCap::Round,
                    usvg::LineCap::Square => LineCap::Square,
                },
                join: match stroke.line_join {
                    usvg::LineJoin::Miter => LineJoin::Miter,
                    usvg::LineJoin::Round => LineJoin::Round,
                    usvg::LineJoin::Bevel => LineJoin::Bevel,
                },
                dash_array: stroke.dash_array.clone().unwrap_or_default(),
            })
        } else {
            None
        };
        
        Ok(PathStyle {
            fill,
            stroke,
            opacity: path_node.opacity.value(),
            blend_mode: BlendMode::Normal, // Default blend mode
        })
    }

    fn import_xvg(&self, file_path: &str) -> Result<Vec<PathRecord>> {
        let xvg_content = std::fs::read(file_path)?;
        let result = xvg_core::decode_xvg(&xvg_content)?;
        Ok(result.paths)
    }

    fn import_raster(&self, file_path: &str) -> Result<Vec<PathRecord>> {
        let image = image::open(file_path)?;
        let rgba = image.to_rgba8();
        
        // Use XVG raster engine to convert to vector paths
        let paths = xvg_core::raster_to_vector(&rgba)?;
        Ok(paths)
    }

    fn import_font(&self, file_path: &str) -> Result<Vec<PathRecord>> {
        // Use XVG font engine to extract glyph paths
        let font_data = std::fs::read(file_path)?;
        let paths = xvg_core::font_to_paths(&font_data)?;
        Ok(paths)
    }

    fn import_audio(&self, file_path: &str) -> Result<Vec<PathRecord>> {
        // Use XVG audio engine to convert audio to visual representation
        let audio_data = std::fs::read(file_path)?;
        let paths = xvg_core::audio_to_paths(&audio_data)?;
        Ok(paths)
    }

    fn export_svg(&self, paths: &[PathRecord], file_path: &str, options: ExportOptions) -> Result<()> {
        let mut svg_content = String::new();
        svg_content.push_str(&format!(
            r#"<svg width="{}" height="{}" xmlns="http://www.w3.org/2000/svg">"#,
            options.width.unwrap_or(2000),
            options.height.unwrap_or(1500)
        ));
        
        for path in paths {
            let path_element = self.convert_xvg_path_to_svg(path)?;
            svg_content.push_str(&path_element);
        }
        
        svg_content.push_str("</svg>");
        
        std::fs::write(file_path, svg_content)?;
        Ok(())
    }

    fn convert_xvg_path_to_svg(&self, path: &PathRecord) -> Result<String> {
        let mut svg_path = String::new();
        
        // Convert XVG path data to SVG path string
        let mut data_slice = &path.data[..];
        let mut first_point = true;
        
        while data_slice.len() >= 8 {
            let x = f32::from_le_bytes([
                data_slice[0], data_slice[1], data_slice[2], data_slice[3]
            ]);
            let y = f32::from_le_bytes([
                data_slice[4], data_slice[5], data_slice[6], data_slice[7]
            ]);
            
            if first_point {
                svg_path.push_str(&format!("M {} {}", x, y));
                first_point = false;
            } else {
                svg_path.push_str(&format!(" L {} {}", x, y));
            }
            
            data_slice = &data_slice[8..];
        }
        
        svg_path.push_str(" Z"); // Close path
        
        // Build SVG element with style
        let mut svg_element = format!("<path d=\"{}\"", svg_path);
        
        if let Some(fill) = &path.style.fill {
            let color = format!(
                "rgb({},{},{})",
                (fill.color[0] * 255.0) as u8,
                (fill.color[1] * 255.0) as u8,
                (fill.color[2] * 255.0) as u8
            );
            svg_element.push_str(&format!(" fill=\"{}\"", color));
            
            if fill.color[3] < 1.0 {
                svg_element.push_str(&format!(" fill-opacity=\"{}\"", fill.color[3]));
            }
        } else {
            svg_element.push_str(" fill=\"none\"");
        }
        
        if let Some(stroke) = &path.style.stroke {
            let color = format!(
                "rgb({},{},{})",
                (stroke.color[0] * 255.0) as u8,
                (stroke.color[1] * 255.0) as u8,
                (stroke.color[2] * 255.0) as u8
            );
            svg_element.push_str(&format!(" stroke=\"{}\" stroke-width=\"{}\"", color, stroke.width));
            
            if stroke.color[3] < 1.0 {
                svg_element.push_str(&format!(" stroke-opacity=\"{}\"", stroke.color[3]));
            }
        }
        
        if path.style.opacity < 1.0 {
            svg_element.push_str(&format!(" opacity=\"{}\"", path.style.opacity));
        }
        
        svg_element.push_str("/>");
        
        Ok(svg_element)
    }

    fn export_xvg(&self, paths: &[PathRecord], file_path: &str) -> Result<()> {
        let xvg_data = xvg_core::encode_xvg(paths)?;
        std::fs::write(file_path, xvg_data)?;
        Ok(())
    }

    fn export_png(&self, paths: &[PathRecord], file_path: &str, options: ExportOptions) -> Result<()> {
        let width = options.width.unwrap_or(2000);
        let height = options.height.unwrap_or(1500);
        
        // Render paths to RGBA buffer
        let rgba_data = xvg_core::render_paths_to_rgba(paths, width, height)?;
        
        // Create image from RGBA data
        let image = RgbaImage::from_raw(width, height, rgba_data)
            .ok_or_else(|| anyhow::anyhow!("Failed to create image from RGBA data"))?;
        
        // Save as PNG
        image.save(file_path)?;
        Ok(())
    }

    fn export_jpeg(&self, paths: &[PathRecord], file_path: &str, options: ExportOptions) -> Result<()> {
        let width = options.width.unwrap_or(2000);
        let height = options.height.unwrap_or(1500);
        
        // Render paths to RGBA buffer
        let rgba_data = xvg_core::render_paths_to_rgba(paths, width, height)?;
        
        // Create image from RGBA data
        let image = RgbaImage::from_raw(width, height, rgba_data)
            .ok_or_else(|| anyhow::anyhow!("Failed to create image from RGBA data"))?;
        
        // Save as JPEG with quality setting
        let quality = options.jpeg_quality.unwrap_or(90);
        let mut output = std::fs::File::create(file_path)?;
        
        image.write_with_encoder(
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, quality)
        )?;
        
        Ok(())
    }

    fn export_otf(&self, paths: &[PathRecord], file_path: &str) -> Result<()> {
        // Use XVG font engine to create OpenType font
        let font_data = xvg_core::export_otf(paths)?;
        std::fs::write(file_path, font_data)?;
        Ok(())
    }

    fn export_wav(&self, paths: &[PathRecord], file_path: &str) -> Result<()> {
        // Use XVG audio engine to create WAV file
        let audio_data = xvg_core::export_wav(paths)?;
        std::fs::write(file_path, audio_data)?;
        Ok(())
    }
}

#[derive(Clone)]
pub struct ExportOptions {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub jpeg_quality: Option<u8>,
    pub svg_precision: Option<u32>,
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            width: Some(2000),
            height: Some(1500),
            jpeg_quality: Some(90),
            svg_precision: Some(2),
        }
    }
}

impl XVGFileIO {
    pub fn get_file_info(&self, file_path: &str) -> Result<FileInfo> {
        let metadata = std::fs::metadata(file_path)?;
        let extension = Path::new(file_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();
        
        let file_type = match extension.as_str() {
            "svg" => FileType::SVG,
            "xvg" => FileType::XVG,
            "png" => FileType::PNG,
            "jpeg" | "jpg" => FileType::JPEG,
            "otf" | "ttf" => FileType::Font,
            "wav" | "mp3" => FileType::Audio,
            _ => FileType::Unknown,
        };
        
        Ok(FileInfo {
            path: file_path.to_string(),
            size: metadata.len(),
            file_type,
            can_import: self.can_import(file_path),
            can_export: true, // XVG can export to any supported format
        })
    }
}

#[derive(Clone)]
pub struct FileInfo {
    pub path: String,
    pub size: u64,
    pub file_type: FileType,
    pub can_import: bool,
    pub can_export: bool,
}

#[derive(Clone)]
pub enum FileType {
    SVG,
    XVG,
    PNG,
    JPEG,
    Font,
    Audio,
    Unknown,
}
