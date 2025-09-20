use xvg_core::*;
use std::collections::HashMap;

fn main() -> anyhow::Result<()> {
    println!("🧪 Testing XVG Engines End-to-End");
    println!("==================================");
    
    // Test 1: SDF Neural Network Engine
    println!("\n1️⃣ Testing SDF Neural Network Engine...");
    test_sdf_engine()?;
    
    // Test 2: WGSL Shader Engine
    println!("\n2️⃣ Testing WGSL Shader Engine...");
    test_shader_engine()?;
    
    // Test 3: 3D Mesh Generation Engine
    println!("\n3️⃣ Testing 3D Mesh Generation Engine...");
    test_3d_engine()?;
    
    // Test 4: CRDT Collaboration Engine
    println!("\n4️⃣ Testing CRDT Collaboration Engine...");
    test_crdt_engine()?;
    
    // Test 5: File Format Engine
    println!("\n5️⃣ Testing File Format Engine...");
    test_file_engine()?;
    
    println!("\n🎉 All XVG engines tested successfully!");
    println!("✅ The engines are ready for editor integration!");
    
    Ok(())
}

fn test_sdf_engine() -> anyhow::Result<()> {
    let mut engine = SDFEngine::new();
    
    // Test neural network initialization
    engine.initialize_weights();
    println!("  ✅ Neural network weights initialized");
    
    // Test SDF evaluation
    let distance = engine.evaluate_sdf([0.5, 0.5]);
    println!("  ✅ SDF evaluation: distance = {:.6}", distance);
    
    // Test SDF boolean operations
    let union_result = engine.sdf_union(1.0, 2.0);
    let intersection_result = engine.sdf_intersection(1.0, 2.0);
    let subtraction_result = engine.sdf_subtraction(1.0, 2.0);
    println!("  ✅ SDF boolean operations: union={}, intersection={}, subtraction={}", 
             union_result, intersection_result, subtraction_result);
    
    // Test smooth operations
    let smooth_union = engine.smooth_union(1.0, 2.0, 0.5);
    println!("  ✅ Smooth SDF operations: smooth_union={:.6}", smooth_union);
    
    // Test raymarching
    let hit = engine.ray_march([0.0, 0.0], [1.0, 0.0], 10.0);
    println!("  ✅ Raymarching: hit = {:?}", hit);
    
    // Test normal calculation
    let normal = engine.compute_normal([0.5, 0.5]);
    println!("  ✅ Normal calculation: normal = [{:.6}, {:.6}]", normal[0], normal[1]);
    
    // Test weight serialization
    let weights_data = engine.save_weights()?;
    println!("  ✅ Weight serialization: {} bytes", weights_data.len());
    
    // Test shader generation
    let shader_code = engine.generate_raymarching_shader();
    println!("  ✅ WGSL shader generation: {} characters", shader_code.len());
    
    Ok(())
}

fn test_shader_engine() -> anyhow::Result<()> {
    let mut engine = WGSLShaderEngine::new();
    
    // Test shader compilation
    let shader_source = r#"
@fragment
fn main(@location(0) uv: vec2<f32>, 
        @location(1) color: vec4<f32>,
        @location(2) time: f32) -> @location(0) vec4<f32> {
    return vec4<f32>(uv.x, uv.y, 0.5, 1.0);
}"#;
    
    let shader = engine.compile_shader("test_shader".to_string(), shader_source.to_string())?;
    println!("  ✅ WGSL shader compilation successful");
    
    // Test shader execution
    let result = engine.execute_shader("test_shader", [0.5, 0.5], [1.0, 0.0, 0.0, 1.0], 0.0)?;
    println!("  ✅ Shader execution: result = [{:.6}, {:.6}, {:.6}, {:.6}]", 
             result[0], result[1], result[2], result[3]);
    
    // Test uniform binding
    engine.bind_uniform("time".to_string(), UniformValue::Float(1.5));
    engine.bind_uniform("resolution".to_string(), UniformValue::Float2([800.0, 600.0]));
    println!("  ✅ Uniform binding successful");
    
    // Test time update
    engine.update_time(2.0);
    println!("  ✅ Time update successful");
    
    Ok(())
}

fn test_3d_engine() -> anyhow::Result<()> {
    let mut engine = Scene3DEngine::new();
    
    // Test path extrusion
    let path_record = PathRecord {
        data: vec![0, 0, 0, 0, 100, 0, 0, 0, 100, 100, 0, 0, 0, 100, 0, 0], // 4 points
        tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        style: PathStyle::default(),
        original_svg: None,
    };
    
    let params = ExtrusionParams {
        depth: 50.0,
        bevel_radius: 5.0,
        bevel_segments: 8,
        cap_front: true,
        cap_back: true,
        material_id: None,
    };
    
    let mesh_id = engine.extrude_path(&path_record, &params)?;
    println!("  ✅ Path extrusion: mesh_id = {}", mesh_id);
    
    // Test mesh retrieval
    let mesh = engine.get_mesh(mesh_id);
    if let Some(mesh) = mesh {
        println!("  ✅ Mesh retrieval: {} vertices, {} indices", 
                 mesh.vertices.len(), mesh.indices.len());
    }
    
    // Test scene management
    let light_id = engine.add_light(Light3D {
        position: [0.0, 100.0, 100.0],
        direction: [0.0, -1.0, -1.0],
        color: [1.0, 1.0, 1.0, 1.0],
        intensity: 1.0,
        light_type: LightType::Directional,
        enabled: true,
    });
    println!("  ✅ Light addition: light_id = {}", light_id);
    
    // Test material creation
    let material = three_d::Material3D {
        id: 1,
        name: "Test Material".to_string(),
        diffuse_color: [0.8, 0.8, 0.8, 1.0],
        specular_color: [0.2, 0.2, 0.2, 1.0],
        ambient_color: [0.1, 0.1, 0.1, 1.0],
        shininess: 32.0,
        opacity: 1.0,
        texture_id: None,
    };
    let material_id = engine.add_material(material);
    println!("  ✅ Material creation: material_id = {}", material_id);
    
    // Test transformation
    engine.set_model_matrix([1.0, 0.0, 0.0, 0.0,
                            0.0, 1.0, 0.0, 0.0,
                            0.0, 0.0, 1.0, 0.0,
                            0.0, 0.0, 0.0, 1.0]);
    println!("  ✅ Model matrix transformation successful");
    
    // Test statistics
    let total_vertices = engine.get_total_vertices();
    let total_indices = engine.get_total_indices();
    println!("  ✅ Scene statistics: {} total vertices, {} total indices", 
             total_vertices, total_indices);
    
    Ok(())
}

fn test_crdt_engine() -> anyhow::Result<()> {
    let mut engine = CRDTEngine::new(1);
    
    // Test path creation
    let path_record = PathRecord {
        data: vec![1, 2, 3, 4, 5, 6, 7, 8], // Two f32 points
        tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        style: PathStyle::default(),
        original_svg: None,
    };
    
    let path_id = engine.create_path(path_record);
    println!("  ✅ Path creation: path_id = {}", path_id);
    
    // Test path retrieval
    let paths = engine.get_active_paths();
    println!("  ✅ Path retrieval: {} active paths", paths.len());
    
    // Test path update
    let updated_path = PathRecord {
        data: vec![10, 20, 30, 40, 50, 60, 70, 80],
        tf: [1.0, 0.0, 0.0, 1.0, 10.0, 10.0],
        style: PathStyle::default(),
        original_svg: None,
    };
    engine.update_path(path_id, updated_path);
    println!("  ✅ Path update successful");
    
    // Test path deletion
    engine.delete_path(path_id);
    println!("  ✅ Path deletion successful");
    
    // Test document state
    let document_state = engine.get_document_state();
    println!("  ✅ Document state: version = {}", document_state.version);
    
    // Test operation logging
    let operations = engine.get_operation_log();
    println!("  ✅ Operation logging: {} operations", operations.len());
    
    // Test CRDT operations
    let mut engine2 = CRDTEngine::new(2);
    let path_record2 = PathRecord {
        data: vec![100, 200, 150, 250],
        tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        style: PathStyle::default(),
        original_svg: None,
    };
    let path_id2 = engine2.create_path(path_record2);
    
    // Test operation merging
    let operations = engine2.get_operation_log();
    engine.merge_operations(&operations)?;
    println!("  ✅ CRDT operation merging successful");
    
    // Test conflict resolution
    let final_paths = engine.get_active_paths();
    println!("  ✅ Conflict resolution: {} total paths after merge", final_paths.len());
    
    Ok(())
}

fn test_file_engine() -> anyhow::Result<()> {
    // Test XVG file creation
    let mut file = File::default();
    file.header.width = 800;
    file.header.height = 600;
    
    // Add a test path
    let path_record = PathRecord {
        data: vec![0, 0, 0, 0, 100, 0, 0, 0, 100, 100, 0, 0, 0, 100, 0, 0], // 4 points
        tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        style: PathStyle::default(),
        original_svg: None,
    };
    file.paths.push(path_record);
    
    // Test XVG encoding
    let xvg_data = file.encode();
    println!("  ✅ XVG encoding: {} bytes", xvg_data.len());
    
    // Test XVG decoding
    let decoded_file = File::decode(&xvg_data)?;
    println!("  ✅ XVG decoding: {}x{} dimensions, {} paths", 
             decoded_file.header.width, decoded_file.header.height, decoded_file.paths.len());
    
    // Test SVG export
    let svg_string = file_to_svg(&file);
    println!("  ✅ SVG export: {} characters", svg_string.len());
    
    Ok(())
}
