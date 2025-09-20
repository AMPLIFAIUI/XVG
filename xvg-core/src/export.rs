use alloc::string::String;
use alloc::format;

use crate::{File, FillRule};

fn escape_attr(s: &str) -> String {
    s.replace('&', "&amp;").replace('"', "&quot;")
}

pub fn file_to_svg(file: &File) -> String {
    let w = file.header.width as u32;
    let h = file.header.height as u32;
    let mut out = String::new();
    out.push_str(&format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\" viewBox=\"0 0 {} {}\">\n",
        w, h, w, h
    ));

    // Minimal metadata with XVG marker (to allow round-trip restore if needed)
    out.push_str("<metadata><xvg note=\"exported\"/></metadata>\n");

    for path in &file.paths {
        // Rehydrate path data from our simple float pairs into an SVG polyline fallback
        let mut d = String::new();
        let mut it = path.data.chunks_exact(8);
        if let Some(first) = it.next() {
            let x = f32::from_le_bytes(first[0..4].try_into().unwrap_or_default());
            let y = f32::from_le_bytes(first[4..8].try_into().unwrap_or_default());
            d.push_str(&format!("M {} {}", x, y));
            for seg in it {
                let x = f32::from_le_bytes(seg[0..4].try_into().unwrap_or_default());
                let y = f32::from_le_bytes(seg[4..8].try_into().unwrap_or_default());
                d.push_str(&format!(" L {} {}", x, y));
            }
        }

        let (_fill_attr, _stroke_attr, _stroke_w) = (String::new(), String::new(), String::new());
        let fill_attr = if let Some(fill) = &path.style.fill {
            let r = (fill.color[0].clamp(0.0,1.0)*255.0) as u8;
            let g = (fill.color[1].clamp(0.0,1.0)*255.0) as u8;
            let b = (fill.color[2].clamp(0.0,1.0)*255.0) as u8;
            let a = fill.color[3].clamp(0.0,1.0);
            if a < 1.0 {
                format!("fill=\"rgba({},{},{},{})\" fill-rule=\"{}\" ", r,g,b,a, match fill.rule { FillRule::NonZero => "nonzero", FillRule::EvenOdd => "evenodd"})
            } else {
                format!("fill=\"rgb({},{},{})\" fill-rule=\"{}\" ", r,g,b, match fill.rule { FillRule::NonZero => "nonzero", FillRule::EvenOdd => "evenodd"})
            }
        } else {
            "fill=\"none\" ".into()
        };
        
        let (stroke_attr, stroke_w) = if let Some(stroke) = &path.style.stroke {
            let r = (stroke.color[0].clamp(0.0,1.0)*255.0) as u8;
            let g = (stroke.color[1].clamp(0.0,1.0)*255.0) as u8;
            let b = (stroke.color[2].clamp(0.0,1.0)*255.0) as u8;
            let a = stroke.color[3].clamp(0.0,1.0);
            let stroke_attr = if a < 1.0 {
                format!("stroke=\"rgba({},{},{},{})\" ", r,g,b,a)
            } else {
                format!("stroke=\"rgb({},{},{})\" ", r,g,b)
            };
            // ensure string contains stroke-width"
            let stroke_w = format!("stroke-width=\"{}\" ", stroke.width.max(0.0));
            (stroke_attr, stroke_w)
        } else {
            (String::new(), String::new())
        };

        let opacity = format!("opacity=\"{}\" ", path.style.opacity.clamp(0.0,1.0));
        // Compose attributes in stable order; include stroke-width when stroke present
        let mut attrs = String::new();
        attrs.push_str(&fill_attr);
        attrs.push_str(&stroke_attr);
        if !stroke_w.is_empty() { attrs.push_str(&stroke_w); }
        attrs.push_str(&opacity);
        out.push_str(&format!(
            "<path d=\"{}\" {} />\n",
            escape_attr(&d), attrs.trim()
        ));
    }

    out.push_str("</svg>\n");
    out
}


