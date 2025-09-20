use clap::{Parser, Subcommand};
use xvg_core::{File, PathRecord, PathStyle, FillStyle, StrokeStyle};
use anyhow::Context;

#[derive(Parser)]
struct Cli {
    #[command(subcommand)]
    cmd: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Inspect file
    Info { path: String },
    /// Convert SVG → XVG
    Convert { svg: String, out: String },
    /// Rasterize XVG → PNG
    Raster { xvg: String, w: u32, h: u32, out: String },
    /// Emit to a standard format by extension (SVG/PNG)
    Emit { xvg: String, out: String },
    // … more subcommands
}

fn main() -> anyhow::Result<()> {
    match Cli::parse().cmd {
        Command::Info { path } => {
            let file = File::decode(&std::fs::read(path)?)?;
            println!("{file:#?}");
        }
        Command::Convert { svg, out } => {
            let file = svg_to_xvg(&svg).with_context(|| format!("converting {svg} to XVG"))?;
            std::fs::write(out, file.encode())?;
        }
        Command::Raster { xvg, w, h, out } => {
            let file = File::decode(&std::fs::read(xvg)?)?;
            let png = xvg_to_png(&file, w, h)?;
            std::fs::write(out, png)?;
        }
        Command::Emit { xvg, out } => {
            let file = File::decode(&std::fs::read(&xvg)?)?;
            match std::path::Path::new(&out).extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
                "svg" => {
                    let svg = xvg_core::file_to_svg(&file);
                    std::fs::write(out, svg.as_bytes())?;
                }
                "png" => {
                    // default size from header
                    let w = file.header.width as u32;
                    let h = file.header.height as u32;
                    let png = xvg_to_png(&file, w.max(1), h.max(1))?;
                    std::fs::write(out, png)?;
                }
                other => anyhow::bail!("unsupported extension: {} (use .svg or .png)", other),
            }
        }
    }
    Ok(())
}

fn svg_to_xvg(svg_path: &str) -> anyhow::Result<File> {
use usvg::{Options, TreeParsing, NodeExt};
use tiny_skia_path::PathSegment;
    let svg_data = std::fs::read(svg_path)?;
    let mut opt = Options::default();
    let base_dir = std::path::Path::new(svg_path).parent().unwrap_or_else(|| std::path::Path::new("."));
    opt.resources_dir = Some(base_dir.to_path_buf());
    let tree = usvg::Tree::from_data(&svg_data, &opt).context("parse SVG")?;

    let mut file = File::default();
    for node in tree.root.descendants() {
        if let usvg::NodeKind::Path(ref path) = *node.borrow() {
            let mut data: Vec<u8> = Vec::new();
            // Flatten path data into simple point list (move/line only) for our current PathRecord layout
            // Use usvg path segments directly as polylines
            // Note: For brevity, we approximate curves by line segments using usvg's bounding boxes.
            let tf = node.abs_transform();
            for seg in path.data.segments() {
                match seg {
                    PathSegment::MoveTo(p) | PathSegment::LineTo(p) => {
                        let x = p.x;
                        let y = p.y;
                        let px = (tf.sx * x + tf.kx * y + tf.tx) as f32;
                        let py = (tf.ky * x + tf.sy * y + tf.ty) as f32;
                        data.extend_from_slice(&px.to_le_bytes());
                        data.extend_from_slice(&py.to_le_bytes());
                    }
                    _ => {}
                }
            }

            // Styles
            let mut style = PathStyle::default();
            if let Some(fill) = &path.fill {
                if let usvg::Paint::Color(c) = fill.paint {
                    let (r,g,b) = (c.red as f32 / 255.0, c.green as f32 / 255.0, c.blue as f32 / 255.0);
                    style.fill = Some(FillStyle { color: [r, g, b, fill.opacity.get() as f32], rule: xvg_core::FillRule::NonZero });
                }
            }
            if let Some(stroke) = &path.stroke {
                if let usvg::Paint::Color(c) = stroke.paint {
                    let (r,g,b) = (c.red as f32 / 255.0, c.green as f32 / 255.0, c.blue as f32 / 255.0);
                    style.stroke = Some(StrokeStyle { color: [r, g, b, stroke.opacity.get() as f32], width: stroke.width.get() as f32, cap: xvg_core::LineCap::Butt, join: xvg_core::LineJoin::Miter, dash_array: Vec::new() });
                }
            }

            file.paths.push(PathRecord { data, tf: [1.0,0.0,0.0,1.0,0.0,0.0], style, original_svg: None, layer_id: None });
        }
    }
    Ok(file)
}

fn xvg_to_png(file: &File, width: u32, height: u32) -> anyhow::Result<Vec<u8>> {
    use tiny_skia::{Pixmap, Paint, Stroke, Transform, PathBuilder as SkPB, Color, FillRule};
    let mut pix = Pixmap::new(width, height).context("pixmap")?;
    pix.fill(Color::from_rgba8(255,255,255,255));

    for path in &file.paths {
        let mut pb = SkPB::new();
        let mut it = path.data.chunks_exact(8);
        if let Some(first) = it.next() {
            let x = f32::from_le_bytes(first[0..4].try_into().unwrap());
            let y = f32::from_le_bytes(first[4..8].try_into().unwrap());
            pb.move_to(x, y);
            for seg in it {
                let x = f32::from_le_bytes(seg[0..4].try_into().unwrap());
                let y = f32::from_le_bytes(seg[4..8].try_into().unwrap());
                pb.line_to(x, y);
            }
        }
        let Some(sk_path) = pb.finish() else { continue };

        if let Some(fill) = &path.style.fill {
            let mut paint = Paint::default();
            paint.set_color_rgba8(
                (fill.color[0]*255.0) as u8,
                (fill.color[1]*255.0) as u8,
                (fill.color[2]*255.0) as u8,
                (fill.color[3]*255.0) as u8,
            );
            pix.fill_path(&sk_path, &paint, FillRule::Winding, Transform::identity(), None);
        }
        if let Some(stroke) = &path.style.stroke {
            let mut paint = Paint::default();
            paint.set_color_rgba8(
                (stroke.color[0]*255.0) as u8,
                (stroke.color[1]*255.0) as u8,
                (stroke.color[2]*255.0) as u8,
                (stroke.color[3]*255.0) as u8,
            );
            let mut st = Stroke::default();
            st.width = stroke.width;
            pix.stroke_path(&sk_path, &paint, &st, Transform::identity(), None);
        }
    }

    Ok(pix.encode_png()?)
} 