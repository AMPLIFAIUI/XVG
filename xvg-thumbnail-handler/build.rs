// FILE: build.rs - Build script for xvg-thumbnail-handler

fn main() {
    // Only build on Windows
    if cfg!(target_os = "windows") {
        println!("cargo:rerun-if-changed=src/lib.rs");
        
        // Link against Windows libraries
        println!("cargo:rustc-link-lib=gdi32");
        println!("cargo:rustc-link-lib=user32");
        println!("cargo:rustc-link-lib=ole32");
        println!("cargo:rustc-link-lib=shell32");
    }
}
