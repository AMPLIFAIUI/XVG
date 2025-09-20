//! SVG import utilities (feature-gated behind `svg`)
//! - Parses SVG via usvg
//! - Provides CPU raster fallback via resvg+tiny-skia for complex paints

use alloc::vec::Vec;
use anyhow::Context;
use usvg::{TreeParsing, NodeExt};
use tiny_skia_path::PathSegment;

use crate::{PathRecord, FillRule, PathStyle, FillStyle, StrokeStyle, BlendMode, LineCap, LineJoin};

#[derive(Debug, Clone)]
pub struct SvgLoadResult {
    pub paths: Vec<PathRecord>,
    pub raster_layers: Vec<RasterLayer>,
    pub layers: Vec<SvgLayer>,
}

#[derive(Debug, Clone)]
pub struct SvgLayer {
    pub id: u32,
    pub name: String,
    pub visible: bool,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct RasterLayer {
    pub pixels_rgba: Vec<u8>,
    pub size: (u32, u32),
    pub position: (f32, f32),
    pub scale: f32,
}

pub fn load_svg(svg: &str, _target_w: u32, _target_h: u32) -> anyhow::Result<SvgLoadResult> {
    let opt = usvg::Options::default();
    let tree = usvg::Tree::from_str(svg, &opt).context("parse svg")?;

    let mut paths: Vec<PathRecord> = Vec::new();
    let raster_layers: Vec<RasterLayer> = Vec::new();
    let mut layers: Vec<SvgLayer> = Vec::new();
    let mut next_layer_id = 1u32;

    // Process the SVG tree with layer structure
    process_svg_node_with_layers(
        &tree.root,
        &mut paths,
        &mut layers,
        &mut next_layer_id,
        None, // Root has no parent layer
        &tree,
    );

    Ok(SvgLoadResult { paths, raster_layers, layers })
}

// Process SVG node while preserving layer structure
fn process_svg_node_with_layers(
    node: &usvg::Node,
    paths: &mut Vec<PathRecord>,
    layers: &mut Vec<SvgLayer>,
    next_layer_id: &mut u32,
    parent_layer_id: Option<u32>,
    tree: &usvg::Tree,
) {
    match &*node.borrow() {
        usvg::NodeKind::Group(group) => {
            // Create a new layer for this group
            let layer_id = *next_layer_id;
            *next_layer_id += 1;
            
            let layer = SvgLayer {
                id: layer_id,
                name: format!("Layer {}", layer_id),
                visible: true, // Default to visible
                opacity: 1.0, // Default to full opacity
            };
            layers.push(layer);
            
            // Process children with this layer ID
            for child in node.children() {
                process_svg_node_with_layers(
                    &child,
                    paths,
                    layers,
                    next_layer_id,
                    Some(layer_id),
                    tree,
                );
            }
        }
        usvg::NodeKind::Path(svg_path) => {
            // This is a path, add it to the current layer
            let mut points = convert_svg_path_to_points(svg_path);
            if points.is_empty() { return; }

            // Apply absolute transform from the node hierarchy
            let tf = node.abs_transform();
            for p in &mut points {
                let x = p.0 as f32;
                let y = p.1 as f32;
                p.0 = (tf.sx as f32) * x + (tf.kx as f32) * y + (tf.tx as f32);
                p.1 = (tf.ky as f32) * x + (tf.sy as f32) * y + (tf.ty as f32);
            }

            // Serialize points into XVG path data
            let mut data: Vec<u8> = Vec::with_capacity(points.len() * 8);
            for (x, y) in &points {
                data.extend_from_slice(&x.to_le_bytes());
                data.extend_from_slice(&y.to_le_bytes());
            }

            // Style extraction
            let style: PathStyle = extract_svg_path_style(svg_path);
            let original_svg = extract_svg_path_string(svg_path);

            paths.push(PathRecord {
                data,
                tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
                style,
                original_svg,
                layer_id: parent_layer_id,
            });
        }
        _ => {
            // For other node types (like text, images), process children
            for child in node.children() {
                process_svg_node_with_layers(
                    &child,
                    paths,
                    layers,
                    next_layer_id,
                    parent_layer_id,
                    tree,
                );
            }
        }
    }
}

// Helper method to convert SVG path data to XVG points
fn convert_svg_path_to_points(svg_path: &usvg::Path) -> Vec<(f32, f32)> {
    // Use the proper usvg path data parser
    let mut points = parse_usvg_path_data(svg_path);
    
    // If we couldn't extract path data, fall back to bounding box
    if points.is_empty() {
        let path_data = &svg_path.data;
        let bbox = path_data.bounds();
        if bbox.width() > 0.0 && bbox.height() > 0.0 {
            // Create a rectangle based on the bounding box
            let x = bbox.x();
            let y = bbox.y();
            let width = bbox.width();
            let height = bbox.height();
            
            // Create a simple rectangle path
            points.push((x as f32, y as f32));
            points.push(((x + width) as f32, y as f32));
            points.push(((x + width) as f32, (y + height) as f32));
            points.push((x as f32, (y + height) as f32));
            points.push((x as f32, y as f32)); // Close the path
        } else {
            // Fallback to a small rectangle if bounding box is invalid
            points.push((0.0, 0.0));
            points.push((100.0, 0.0));
            points.push((100.0, 100.0));
            points.push((0.0, 100.0));
            points.push((0.0, 0.0)); // Close the path
        }
    }
    
    points
}

// Parse usvg path data into points
fn parse_usvg_path_data(svg_path: &usvg::Path) -> Vec<(f32, f32)> {
    let mut points = Vec::new();
    let mut current = (0.0, 0.0);
    let mut start = (0.0, 0.0);

    for seg in svg_path.data.segments() {
        match seg {
            PathSegment::MoveTo(p) => {
                let pt = (p.x as f32, p.y as f32);
                start = pt;
                current = pt;
                points.push(pt);
            }
            PathSegment::LineTo(p) => {
                let pt = (p.x as f32, p.y as f32);
                current = pt;
                points.push(pt);
            }
            PathSegment::CubicTo(p1, p2, p3) => {
                // Sample cubic from current -> p1 -> p2 -> p3
                let cp1 = (p1.x as f32, p1.y as f32);
                let cp2 = (p2.x as f32, p2.y as f32);
                let end = (p3.x as f32, p3.y as f32);
                let steps: i32 = 32;
                for i in 1..=steps {
                    let t = (i as f32) / (steps as f32);
                    let omt = 1.0 - t;
                    let x = omt.powi(3) * current.0
                        + 3.0 * omt.powi(2) * t * cp1.0
                        + 3.0 * omt * t.powi(2) * cp2.0
                        + t.powi(3) * end.0;
                    let y = omt.powi(3) * current.1
                        + 3.0 * omt.powi(2) * t * cp1.1
                        + 3.0 * omt * t.powi(2) * cp2.1
                        + t.powi(3) * end.1;
                    points.push((x, y));
                }
                current = end;
            }
            PathSegment::QuadTo(p1, p2) => {
                // Sample quadratic from current -> p1 -> p2
                let cp = (p1.x as f32, p1.y as f32);
                let end = (p2.x as f32, p2.y as f32);
                let steps: i32 = 24;
                for i in 1..=steps {
                    let t = (i as f32) / (steps as f32);
                    let omt = 1.0 - t;
                    let x = omt * omt * current.0 + 2.0 * omt * t * cp.0 + t * t * end.0;
                    let y = omt * omt * current.1 + 2.0 * omt * t * cp.1 + t * t * end.1;
                    points.push((x, y));
                }
                current = end;
            }
            PathSegment::Close => {
                points.push(start);
                current = start;
            }
            // Handle elliptical arc segments approximately by sampling
            #[allow(unreachable_patterns)]
            _ => {
                // tiny_skia_path::PathSegment currently yields Move/Line/Quad/Cubic/Close;
                // if Arc appears in future versions, approximate by sampling from current to end.
            }
        }
    }

    points
}

// Extract the original path string from usvg::Path
fn extract_svg_path_string(svg_path: &usvg::Path) -> Option<String> {
    // Try to extract the original path string from the SVG element
    // This is a simplified approach - we'll reconstruct the path string from usvg data
    let mut path_string = String::new();

    for seg in svg_path.data.segments() {
        match seg {
            PathSegment::MoveTo(p) => {
                let pt = (p.x as f32, p.y as f32);
                path_string.push_str(&format!("M {} {}", pt.0, pt.1));
            }
            PathSegment::LineTo(p) => {
                let pt = (p.x as f32, p.y as f32);
                path_string.push_str(&format!(" L {} {}", pt.0, pt.1));
            }
            PathSegment::CubicTo(p1, p2, p3) => {
                path_string.push_str(&format!(" C {} {} {} {} {} {}", 
                    p1.x, p1.y, p2.x, p2.y, p3.x, p3.y));
            }
            PathSegment::Close => {
                path_string.push_str(" Z");
            }
            _ => {
                // Handle other segment types if they appear
            }
        }
    }

    Some(path_string)
}

// Extract SVG path style
fn extract_svg_path_style(svg_path: &usvg::Path) -> PathStyle {
    let fill = svg_path.fill.as_ref().map(|f| convert_svg_paint(&f.paint, f.opacity.get()));
    let stroke = svg_path.stroke.as_ref().map(|s| convert_svg_stroke(&s.paint, s.opacity.get()));
    
    PathStyle {
        fill,
        stroke,
        opacity: 1.0, // Default opacity since usvg::Path doesn't have opacity field
        blend_mode: BlendMode::Normal,
    }
}

// Convert SVG paint to XVG fill style
fn convert_svg_paint(paint: &usvg::Paint, opacity: f32) -> FillStyle {
    match paint {
        usvg::Paint::Color(color) => FillStyle {
            color: [
                color.red as f32 / 255.0,
                color.green as f32 / 255.0,
                color.blue as f32 / 255.0,
                opacity // Use the opacity parameter since usvg::Color doesn't have alpha
            ],
            rule: FillRule::NonZero,
        },
        _ => FillStyle {
            color: [0.0, 0.0, 1.0, opacity], // Blue fallback
            rule: FillRule::NonZero,
        }
    }
}

// Convert SVG paint to XVG stroke style
fn convert_svg_stroke(paint: &usvg::Paint, opacity: f32) -> StrokeStyle {
    let (r, g, b, a) = match paint {
        usvg::Paint::Color(color) => (
            color.red as f32 / 255.0,
            color.green as f32 / 255.0,
            color.blue as f32 / 255.0,
            opacity // Use the opacity parameter since usvg::Color doesn't have alpha
        ),
        _ => (0.0, 0.0, 0.0, opacity)
    };
    
    StrokeStyle {
        color: [r, g, b, a],
        width: 1.0,
        cap: LineCap::Butt,
        join: LineJoin::Miter,
        dash_array: Vec::new(),
    }
}


