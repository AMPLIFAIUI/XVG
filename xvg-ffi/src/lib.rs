use libc::{c_char, c_int, c_uint, size_t};
use std::ffi::CStr;
// use std::ptr::{null_mut};
use std::slice;

#[repr(i32)]
#[derive(Copy, Clone)]
pub enum XvgErr {
    Ok = 0,
    Null = -1,
    DecodeFailed = -2,
    InvalidArg = -3,
    NotImplemented = -4,
    Oom = -5,
}

#[no_mangle]
pub extern "C" fn xvg_err_message(code: i32) -> *const c_char {
    use std::ffi::CString;
    let s = match code {
        0 => "ok",
        -1 => "null",
        -2 => "decode_failed",
        -3 => "invalid_arg",
        -4 => "not_implemented",
        -5 => "out_of_memory",
        _ => "unknown",
    };
    CString::new(s).unwrap().into_raw()
}

// Simple version/features
#[no_mangle]
pub extern "C" fn xvg_version() -> u32 { 0x010000 }

#[no_mangle]
pub extern "C" fn xvg_features() -> u64 { 0 }

#[repr(C)]
pub struct xvg_bitmap {
    pub width: u32,
    pub height: u32,
    pub stride: u32,
    pub format: u32, // 0 = RGBA8
    pub rgba: *mut u8,
    pub len: size_t,
}

#[repr(C)]
pub struct xvg_handle {
    bytes: Vec<u8>,
}

#[no_mangle]
pub extern "C" fn xvg_free(p: *mut std::ffi::c_void) {
    if !p.is_null() {
        unsafe { let _ = Box::from_raw(p); }
    }
}

#[no_mangle]
pub extern "C" fn xvg_bitmap_free(bmp: *mut xvg_bitmap) {
    if bmp.is_null() { return; }
    unsafe {
        let bmp_ref = &mut *bmp;
        if !bmp_ref.rgba.is_null() {
            let len = bmp_ref.len as usize;
            let data = Vec::from_raw_parts(bmp_ref.rgba, len, len);
            drop(data);
            bmp_ref.rgba = std::ptr::null_mut();
        }
    }
}

#[no_mangle]
pub extern "C" fn xvg_open(bytes: *const u8, len: size_t, out: *mut *mut xvg_handle) -> c_int {
    if bytes.is_null() || out.is_null() { return -1; }
    let data = unsafe { slice::from_raw_parts(bytes, len as usize) };
    // Validate by attempting decode
    match xvg_core::File::decode(data) {
        Ok(_) => {
            let h = xvg_handle { bytes: data.to_vec() };
            let boxed = Box::new(h);
            unsafe { *out = Box::into_raw(boxed); }
            0
        },
        Err(_) => -2,
    }
}

#[no_mangle]
pub extern "C" fn xvg_close(h: *mut xvg_handle) {
    if !h.is_null() { unsafe { let _ = Box::from_raw(h); } }
}

#[no_mangle]
pub extern "C" fn xvg_render(h: *mut xvg_handle, w: c_uint, hgt: c_uint, out_bmp: *mut xvg_bitmap) -> c_int {
    if h.is_null() || out_bmp.is_null() { return -1; }
    let (w, hgt) = (w as usize, hgt as usize);
    let len = w * hgt * 4;
    let mut buf = vec![0u8; len];
    // Decode XVG and draw simple polylines (if present) as white strokes
    let file = unsafe { &*h };
    if let Ok(xvg) = xvg_core::File::decode(&file.bytes) {
        // Simple viewport mapping: fit to canvas with 10px margin
        let mw = (xvg.header.width.max(1)) as f32;
        let mh = (xvg.header.height.max(1)) as f32;
        let sx = (w as f32 - 20.0) / mw;
        let sy = (hgt as f32 - 20.0) / mh;
        let s = sx.min(sy);
        let ox = ((w as f32) - mw*s) * 0.5;
        let oy = ((hgt as f32) - mh*s) * 0.5;

        let mut put_px = |x: i32, y: i32| {
            if x >= 0 && y >= 0 && (x as usize) < w && (y as usize) < hgt {
                let i = (y as usize*w + x as usize)*4;
                buf[i] = 255; buf[i+1] = 255; buf[i+2] = 255; buf[i+3] = 255;
            }
        };
        let mut draw_line = |x0:f32,y0:f32,x1:f32,y1:f32| {
            let (mut x0, mut y0, mut x1, mut y1) = (x0 as i32, y0 as i32, x1 as i32, y1 as i32);
            let dx = (x1 - x0).abs(); let sx = if x0 < x1 {1} else {-1};
            let dy = -(y1 - y0).abs(); let sy = if y0 < y1 {1} else {-1};
            let mut err = dx + dy; let mut x = x0; let mut y = y0;
            loop { put_px(x,y); if x==x1 && y==y1 { break; } let e2 = 2*err; if e2 >= dy { err += dy; x += sx; } if e2 <= dx { err += dx; y += sy; } }
        };

        for p in &xvg.paths {
            let bytes = &p.data;
            if bytes.len() >= 8 {
                let n = bytes.len()/8;
                let mut pts: Vec<(f32,f32)> = Vec::with_capacity(n);
                for i in 0..n {
                    let ix = i*8; let iy = ix+4;
                    let x = f32::from_le_bytes([bytes[ix],bytes[ix+1],bytes[ix+2],bytes[ix+3]]);
                    let y = f32::from_le_bytes([bytes[iy],bytes[iy+1],bytes[iy+2],bytes[iy+3]]);
                    let sxp = (ox + x*s) as i32; let syp = (oy + y*s) as i32;
                    pts.push((sxp as f32, syp as f32));
                }
                for w2 in pts.windows(2) {
                    draw_line(w2[0].0, w2[0].1, w2[1].0, w2[1].1);
                }
            }
        }
    }
    unsafe {
        let ob = &mut *out_bmp;
        ob.width = w as u32;
        ob.height = hgt as u32;
        ob.stride = (w*4) as u32;
        ob.format = 0;
        ob.len = len as size_t;
        ob.rgba = buf.as_mut_ptr();
    }
    std::mem::forget(buf);
    0
}

#[no_mangle]
pub extern "C" fn xvg_extract(h: *mut xvg_handle, fmt: *const c_char, out: *mut *mut u8, out_len: *mut size_t) -> c_int {
    if h.is_null() || fmt.is_null() || out.is_null() || out_len.is_null() { return -1; }
    let c = unsafe { CStr::from_ptr(fmt) }.to_string_lossy().to_ascii_lowercase();
    let file = unsafe { &*h };
    let xvg = match xvg_core::File::decode(&file.bytes) { Ok(v)=>v, Err(_)=> return -2 };
    let bytes = if c == "svg" { xvg_core::file_to_svg(&xvg).into_bytes() } else { return -3 };
    let mut boxed = bytes.into_boxed_slice();
    unsafe {
        *out_len = boxed.len() as size_t;
        *out = boxed.as_mut_ptr();
    }
    std::mem::forget(boxed);
    0
}

// ---- 3D mesh extraction (optional minimal shape) ----
#[repr(C)]
pub struct xvg_mesh {
    pub vertices: *mut f32,      // xyz triplets
    pub vertex_count: u32,       // number of xyz triplets
    pub indices: *mut u32,       // triangle indices
    pub index_count: u32,
}

#[no_mangle]
pub extern "C" fn xvg_mesh_free(m: *mut xvg_mesh) {
    if m.is_null() { return; }
    unsafe {
        let mr = &mut *m;
        if !mr.vertices.is_null() {
            let n = (mr.vertex_count as usize) * 3;
            let v = Vec::from_raw_parts(mr.vertices, n, n);
            drop(v);
            mr.vertices = std::ptr::null_mut();
        }
        if !mr.indices.is_null() {
            let n = mr.index_count as usize;
            let i = Vec::from_raw_parts(mr.indices, n, n);
            drop(i);
            mr.indices = std::ptr::null_mut();
        }
    }
}

#[no_mangle]
pub extern "C" fn xvg_extrude_mesh(h: *mut xvg_handle, depth: f32, out: *mut xvg_mesh) -> c_int {
    if h.is_null() || out.is_null() { return -1; }
    let file = unsafe { &*h };
    let xvg = match xvg_core::File::decode(&file.bytes) { Ok(v)=>v, Err(_)=> return -2 };
    if xvg.paths.is_empty() { return -3; }
    // Use core 3D engine to extrude first path
    let mut eng = xvg_core::Scene3DEngine::new();
    let params = xvg_core::ExtrusionParams {
        depth: if depth <= 0.0 { 1.0 } else { depth },
        bevel_radius: 0.0,
        bevel_segments: 0,
        cap_front: true,
        cap_back: true,
        material_id: None,
    };
    let pid = match eng.extrude_path(&xvg.paths[0], &params) { Ok(id)=>id, Err(_)=> return -4 };
    let mesh = match eng.get_mesh(pid) { Some(m)=>m, None=> return -5 };
    let mut verts: Vec<f32> = Vec::with_capacity(mesh.vertices.len()*3);
    for v in &mesh.vertices { verts.extend_from_slice(&v.position); }
    let inds: Vec<u32> = mesh.indices.clone();
    unsafe {
        let m = &mut *out;
        let mut v = verts.into_boxed_slice();
        m.vertex_count = (v.len()/3) as u32;
        m.vertices = v.as_mut_ptr();
        std::mem::forget(v);
        let mut i = inds.into_boxed_slice();
        m.index_count = i.len() as u32;
        m.indices = i.as_mut_ptr();
        std::mem::forget(i);
    }
    0
}

