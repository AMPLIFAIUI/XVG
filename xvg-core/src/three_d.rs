use crate::*;
use alloc::vec::Vec;
use std::collections::HashMap;

/// 3D Mesh Generation Engine implementing path extrusion and 3D scene management
/// According to XVG specification: 3D extrusion with beveling and scene management
#[derive(Clone)]
pub struct Scene3DEngine {
    /// 3D scene data
    meshes: HashMap<usize, Mesh3D>,
    materials: HashMap<usize, Material3D>,
    lights: Vec<Light3D>,
    
    /// Transformation matrices
    model_matrix: [f32; 16],
    view_matrix: [f32; 16],
    projection_matrix: [f32; 16],
    matrix_stack: Vec<[f32; 16]>,
    
    /// Rendering settings
    wireframe_mode: bool,
    show_normals: bool,
    culling_enabled: bool,
    
    /// Performance settings
    max_vertices: usize,
    max_indices: usize,
    
    /// Current mesh ID counter
    next_mesh_id: usize,
}

/// 3D mesh data structure
#[derive(Clone, Debug)]
pub struct Mesh3D {
    pub id: usize,
    pub vertices: Vec<Vertex3D>,
    pub indices: Vec<u32>,
    pub material_id: Option<usize>,
    pub bounds: BoundingBox3D,
    pub transform: [f32; 16],
}

/// 3D vertex with position, normal, and texture coordinates
#[derive(Clone, Debug)]
pub struct Vertex3D {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub tex_coords: [f32; 2],
    pub color: [f32; 4],
}

/// 3D material properties
#[derive(Clone, Debug)]
pub struct Material3D {
    pub id: usize,
    pub name: String,
    pub diffuse_color: [f32; 4],
    pub specular_color: [f32; 4],
    pub ambient_color: [f32; 4],
    pub shininess: f32,
    pub opacity: f32,
    pub texture_id: Option<usize>,
}

/// 3D light source
#[derive(Clone, Debug)]
pub struct Light3D {
    pub position: [f32; 3],
    pub direction: [f32; 3],
    pub color: [f32; 4],
    pub intensity: f32,
    pub light_type: LightType,
    pub enabled: bool,
}

/// Light types
#[derive(Clone, Debug)]
pub enum LightType {
    Directional,
    Point,
    Spot { angle: f32, falloff: f32 },
}

/// 3D bounding box
#[derive(Clone, Debug)]
pub struct BoundingBox3D {
    pub min: [f32; 3],
    pub max: [f32; 3],
}

/// Extrusion parameters
#[derive(Clone, Debug)]
pub struct ExtrusionParams {
    pub depth: f32,
    pub bevel_radius: f32,
    pub bevel_segments: usize,
    pub cap_front: bool,
    pub cap_back: bool,
    pub material_id: Option<usize>,
}

impl Scene3DEngine {
    /// Create new 3D scene engine
    pub fn new() -> Self {
        Self {
            meshes: HashMap::new(),
            materials: HashMap::new(),
            lights: Vec::new(),
            model_matrix: Self::identity_matrix(),
            view_matrix: Self::identity_matrix(),
            projection_matrix: Self::identity_matrix(),
            matrix_stack: Vec::new(),
            wireframe_mode: false,
            show_normals: false,
            culling_enabled: true,
            max_vertices: 100000,
            max_indices: 300000,
            next_mesh_id: 0,
        }
    }

    /// Create identity matrix
    fn identity_matrix() -> [f32; 16] {
        [
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ]
    }

    /// Extrude 2D path to 3D mesh
    pub fn extrude_path(&mut self, path: &PathRecord, params: &ExtrusionParams) -> anyhow::Result<usize> {
        // Extract path points
        let points = self.extract_path_points(path)?;
        
        if points.len() < 2 {
            return Err(anyhow::anyhow!("Path must have at least 2 points for extrusion"));
        }
        
        // Generate 3D mesh from path extrusion
        let mesh = self.generate_extruded_mesh(&points, params)?;
        
        // Add mesh to scene
        let mesh_id = self.next_mesh_id;
        self.next_mesh_id += 1;
        self.meshes.insert(mesh_id, mesh);
        
        Ok(mesh_id)
    }

    /// Generate extruded mesh from 2D points
    fn generate_extruded_mesh(&self, points: &[[f32; 2]], params: &ExtrusionParams) -> anyhow::Result<Mesh3D> {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        
        // Generate side faces
        self.generate_side_faces(points, params, &mut vertices, &mut indices)?;
        
        // Generate caps if requested
        if params.cap_front {
            self.generate_cap(points, params.depth / 2.0, true, &mut vertices, &mut indices)?;
        }
        
        if params.cap_back {
            self.generate_cap(points, -params.depth / 2.0, false, &mut vertices, &mut indices)?;
        }
        
        // Generate beveled edges if requested
        if params.bevel_radius > 0.0 {
            self.generate_beveled_edges(points, params, &mut vertices, &mut indices)?;
        }
        
        // Calculate bounding box
        let bounds = self.calculate_bounds(&vertices);
        
        Ok(Mesh3D {
            id: 0, // Will be set by caller
            vertices,
            indices,
            material_id: params.material_id,
            bounds,
            transform: Self::identity_matrix(),
        })
    }

    /// Generate side faces for extrusion
    fn generate_side_faces(
        &self,
        points: &[[f32; 2]],
        params: &ExtrusionParams,
        vertices: &mut Vec<Vertex3D>,
        indices: &mut Vec<u32>,
    ) -> anyhow::Result<()> {
        let half_depth = params.depth / 2.0;
        let base_vertex_index = vertices.len() as u32;
        
        // Generate vertices for front and back faces
        for (i, &point) in points.iter().enumerate() {
            // Front vertex
            vertices.push(Vertex3D {
                position: [point[0], point[1], half_depth],
                normal: [0.0, 0.0, 1.0],
                tex_coords: [i as f32 / (points.len() - 1) as f32, 0.0],
                color: [1.0, 1.0, 1.0, 1.0],
            });
            
            // Back vertex
            vertices.push(Vertex3D {
                position: [point[0], point[1], -half_depth],
                normal: [0.0, 0.0, -1.0],
                tex_coords: [i as f32 / (points.len() - 1) as f32, 1.0],
                color: [1.0, 1.0, 1.0, 1.0],
            });
        }
        
        // Generate triangles for side faces
        for i in 0..points.len() - 1 {
            let front1 = base_vertex_index + (i * 2) as u32;
            let back1 = front1 + 1;
            let front2 = base_vertex_index + ((i + 1) * 2) as u32;
            let back2 = front2 + 1;
            
            // First triangle
            indices.push(front1);
            indices.push(back1);
            indices.push(front2);
            
            // Second triangle
            indices.push(back1);
            indices.push(back2);
            indices.push(front2);
        }
        
        Ok(())
    }

    /// Generate cap (front or back face)
    fn generate_cap(
        &self,
        points: &[[f32; 2]],
        z_offset: f32,
        is_front: bool,
        vertices: &mut Vec<Vertex3D>,
        indices: &mut Vec<u32>,
    ) -> anyhow::Result<()> {
        let base_vertex_index = vertices.len() as u32;
        let normal_z = if is_front { 1.0 } else { -1.0 };
        
        // Add center vertex for triangulation
        let center = self.calculate_center(points);
        vertices.push(Vertex3D {
            position: [center[0], center[1], z_offset],
            normal: [0.0, 0.0, normal_z],
            tex_coords: [0.5, 0.5],
            color: [1.0, 1.0, 1.0, 1.0],
        });
        
        // Add perimeter vertices
        for (i, &point) in points.iter().enumerate() {
            vertices.push(Vertex3D {
                position: [point[0], point[1], z_offset],
                normal: [0.0, 0.0, normal_z],
                tex_coords: [i as f32 / points.len() as f32, 0.0],
                color: [1.0, 1.0, 1.0, 1.0],
            });
        }
        
        // Generate triangles (fan triangulation)
        let center_index = base_vertex_index;
        for i in 0..points.len() {
            let v1 = center_index;
            let v2 = base_vertex_index + 1 + i as u32;
            let v3 = base_vertex_index + 1 + ((i + 1) % points.len()) as u32;
            
            if is_front {
                indices.push(v1);
                indices.push(v2);
                indices.push(v3);
            } else {
                indices.push(v1);
                indices.push(v3);
                indices.push(v2);
            }
        }
        
        Ok(())
    }

    /// Generate beveled edges
    fn generate_beveled_edges(
        &self,
        points: &[[f32; 2]],
        params: &ExtrusionParams,
        vertices: &mut Vec<Vertex3D>,
        indices: &mut Vec<u32>,
    ) -> anyhow::Result<()> {
        let half_depth = params.depth / 2.0;
        let base_vertex_index = vertices.len() as u32;
        
        for i in 0..points.len() {
            let current = points[i];
            let next = points[(i + 1) % points.len()];
            
            // Calculate edge direction
            let edge_dir = [next[0] - current[0], next[1] - current[1]];
            let edge_length = (edge_dir[0] * edge_dir[0] + edge_dir[1] * edge_dir[1]).sqrt();
            
            if edge_length < 0.001 {
                continue; // Skip very short edges
            }
            
            // Normalize edge direction
            let edge_normalized = [edge_dir[0] / edge_length, edge_dir[1] / edge_length];
            
            // Calculate perpendicular vector (outward normal)
            let perp = [-edge_normalized[1], edge_normalized[0]];
            
            // Generate bevel vertices
            for segment in 0..=params.bevel_segments {
                let t = segment as f32 / params.bevel_segments as f32;
                let radius = params.bevel_radius * (1.0 - t);
                
                // Front bevel vertex
                let front_pos = [
                    current[0] + perp[0] * radius,
                    current[1] + perp[1] * radius,
                    half_depth - params.bevel_radius * t,
                ];
                
                vertices.push(Vertex3D {
                    position: front_pos,
                    normal: [perp[0], perp[1], -t],
                    tex_coords: [i as f32 / points.len() as f32, t],
                    color: [1.0, 1.0, 1.0, 1.0],
                });
                
                // Back bevel vertex
                let back_pos = [
                    current[0] + perp[0] * radius,
                    current[1] + perp[1] * radius,
                    -half_depth + params.bevel_radius * t,
                ];
                
                vertices.push(Vertex3D {
                    position: back_pos,
                    normal: [perp[0], perp[1], t],
                    tex_coords: [i as f32 / points.len() as f32, t],
                    color: [1.0, 1.0, 1.0, 1.0],
                });
            }
        }
        
        // Generate bevel triangles
        for i in 0..points.len() {
            for segment in 0..params.bevel_segments {
                let base = base_vertex_index + (i as u32 * (params.bevel_segments as u32 + 1) + segment as u32) * 2;
                
                // Front bevel triangles
                indices.push(base);
                indices.push(base + 2);
                indices.push(base + 1);
                
                indices.push(base + 1);
                indices.push(base + 2);
                indices.push(base + 3);
                
                // Back bevel triangles
                indices.push(base + 1);
                indices.push(base + 3);
                indices.push(base);
                
                indices.push(base);
                indices.push(base + 3);
                indices.push(base + 2);
            }
        }
        
        Ok(())
    }

    /// Calculate center point of polygon
    fn calculate_center(&self, points: &[[f32; 2]]) -> [f32; 2] {
        let mut center = [0.0, 0.0];
        for &point in points {
            center[0] += point[0];
            center[1] += point[1];
        }
        center[0] /= points.len() as f32;
        center[1] /= points.len() as f32;
        center
    }

    /// Calculate bounding box for vertices
    fn calculate_bounds(&self, vertices: &[Vertex3D]) -> BoundingBox3D {
        if vertices.is_empty() {
            return BoundingBox3D {
                min: [0.0, 0.0, 0.0],
                max: [0.0, 0.0, 0.0],
            };
        }
        
        let mut min = vertices[0].position;
        let mut max = vertices[0].position;
        
        for vertex in vertices {
            for i in 0..3 {
                min[i] = min[i].min(vertex.position[i]);
                max[i] = max[i].max(vertex.position[i]);
            }
        }
        
        BoundingBox3D { min, max }
    }

    /// Extract path points from XVG path record
    fn extract_path_points(&self, path: &PathRecord) -> anyhow::Result<Vec<[f32; 2]>> {
        #[cfg(feature = "3d")]
        {
            self.triangulate_path_with_lyon(path)
        }
        #[cfg(not(feature = "3d"))]
        {
            // Fallback: simple rectangle for testing
            let _ = path; // Suppress unused warning
            Ok(vec![
                [-1.0, -1.0],
                [1.0, -1.0],
                [1.0, 1.0],
                [-1.0, 1.0],
            ])
        }
    }

    /// Triangulate 2D path using Lyon tessellation
    #[cfg(feature = "3d")]
    fn triangulate_path_with_lyon(&self, path: &PathRecord) -> anyhow::Result<Vec<[f32; 2]>> {
        use lyon::tessellation::{FillTessellator, FillOptions, VertexBuffers};
        use lyon::tessellation::geometry_builder::simple_builder;
        use lyon::path::Path;
        use lyon::math::Point;

        // Create lyon path from XVG path data
        let mut lyon_path = Path::builder();
        
        // Parse the path data (simplified for now)
        // In a real implementation, this would parse the actual path commands
        let points = self.extract_path_outline(path)?;
        
        if points.is_empty() {
            return Err(anyhow::anyhow!("Path has no points for triangulation"));
        }
        
        // Build lyon path
        lyon_path.begin(Point::new(points[0][0], points[0][1]));
        for &point in &points[1..] {
            lyon_path.line_to(Point::new(point[0], point[1]));
        }
        lyon_path.close();
        let lyon_path = lyon_path.build();

        // Set up tessellation
        let mut tessellator = FillTessellator::new();
        let mut geometry: VertexBuffers<Point, u16> = VertexBuffers::new();
        
        // Tessellate the path
        tessellator.tessellate_path(
            &lyon_path,
            &FillOptions::default(),
            &mut simple_builder(&mut geometry),
        ).map_err(|e| anyhow::anyhow!("Lyon tessellation failed: {:?}", e))?;

        // Convert tessellated vertices to our format
        let mut triangulated_points = Vec::new();
        for vertex in geometry.vertices {
            triangulated_points.push([vertex.x, vertex.y]);
        }

        Ok(triangulated_points)
    }

    /// Extract outline points from path record
    fn extract_path_outline(&self, path: &PathRecord) -> anyhow::Result<Vec<[f32; 2]>> {
        let mut points = Vec::new();
        
        // Parse the path data which is stored as little-endian f32 pairs
        let data = &path.data;
        if data.len() < 8 { // Need at least 2 f32 values (x, y)
            return Err(anyhow::anyhow!("Path data too short for triangulation"));
        }
        
        let mut offset = 0;
        while offset + 7 < data.len() {
            let x = f32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
            let y = f32::from_le_bytes([data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]]);
            points.push([x, y]);
            offset += 8;
        }
        
        if points.is_empty() {
            return Err(anyhow::anyhow!("No valid points extracted from path"));
        }
        
        Ok(points)
    }

    /// Push matrix onto stack
    pub fn push_matrix(&mut self) {
        self.matrix_stack.push(self.model_matrix);
    }

    /// Pop matrix from stack
    pub fn pop_matrix(&mut self) -> Option<[f32; 16]> {
        if let Some(matrix) = self.matrix_stack.pop() {
            self.model_matrix = matrix;
            Some(matrix)
        } else {
            None
        }
    }

    /// Set model matrix
    pub fn set_model_matrix(&mut self, matrix: [f32; 16]) {
        self.model_matrix = matrix;
    }

    /// Set view matrix
    pub fn set_view_matrix(&mut self, matrix: [f32; 16]) {
        self.view_matrix = matrix;
    }

    /// Set projection matrix
    pub fn set_projection_matrix(&mut self, matrix: [f32; 16]) {
        self.projection_matrix = matrix;
    }

    /// Multiply current model matrix
    pub fn multiply_model_matrix(&mut self, matrix: [f32; 16]) {
        self.model_matrix = self.multiply_matrices(self.model_matrix, matrix);
    }

    /// Translate model matrix
    pub fn translate(&mut self, x: f32, y: f32, z: f32) {
        let translation = [
            1.0, 0.0, 0.0, x,
            0.0, 1.0, 0.0, y,
            0.0, 0.0, 1.0, z,
            0.0, 0.0, 0.0, 1.0,
        ];
        self.multiply_model_matrix(translation);
    }

    /// Rotate model matrix around X axis
    pub fn rotate_x(&mut self, angle: f32) {
        let cos_a = angle.cos();
        let sin_a = angle.sin();
        let rotation = [
            1.0, 0.0, 0.0, 0.0,
            0.0, cos_a, -sin_a, 0.0,
            0.0, sin_a, cos_a, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ];
        self.multiply_model_matrix(rotation);
    }

    /// Rotate model matrix around Y axis
    pub fn rotate_y(&mut self, angle: f32) {
        let cos_a = angle.cos();
        let sin_a = angle.sin();
        let rotation = [
            cos_a, 0.0, sin_a, 0.0,
            0.0, 1.0, 0.0, 0.0,
            -sin_a, 0.0, cos_a, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ];
        self.multiply_model_matrix(rotation);
    }

    /// Rotate model matrix around Z axis
    pub fn rotate_z(&mut self, angle: f32) {
        let cos_a = angle.cos();
        let sin_a = angle.sin();
        let rotation = [
            cos_a, -sin_a, 0.0, 0.0,
            sin_a, cos_a, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ];
        self.multiply_model_matrix(rotation);
    }

    /// Scale model matrix
    pub fn scale(&mut self, x: f32, y: f32, z: f32) {
        let scale = [
            x, 0.0, 0.0, 0.0,
            0.0, y, 0.0, 0.0,
            0.0, 0.0, z, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ];
        self.multiply_model_matrix(scale);
    }

    /// Multiply two 4x4 matrices
    fn multiply_matrices(&self, a: [f32; 16], b: [f32; 16]) -> [f32; 16] {
        let mut result = [0.0; 16];
        
        for i in 0..4 {
            for j in 0..4 {
                for k in 0..4 {
                    result[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
                }
            }
        }
        
        result
    }

    /// Add light to scene
    pub fn add_light(&mut self, light: Light3D) -> usize {
        let light_id = self.lights.len();
        self.lights.push(light);
        light_id
    }

    /// Remove light from scene
    pub fn remove_light(&mut self, light_id: usize) -> bool {
        if light_id < self.lights.len() {
            self.lights.remove(light_id);
            true
        } else {
            false
        }
    }

    /// Get light by ID
    pub fn get_light(&self, light_id: usize) -> Option<&Light3D> {
        self.lights.get(light_id)
    }

    /// Get all lights
    pub fn get_lights(&self) -> &[Light3D] {
        &self.lights
    }

    /// Add material to scene
    pub fn add_material(&mut self, material: Material3D) -> usize {
        let material_id = material.id;
        self.materials.insert(material_id, material);
        material_id
    }

    /// Get material by ID
    pub fn get_material(&self, material_id: usize) -> Option<&Material3D> {
        self.materials.get(&material_id)
    }

    /// Get mesh by ID
    pub fn get_mesh(&self, mesh_id: usize) -> Option<&Mesh3D> {
        self.meshes.get(&mesh_id)
    }

    /// Get all meshes
    pub fn get_meshes(&self) -> &HashMap<usize, Mesh3D> {
        &self.meshes
    }

    /// Remove mesh from scene
    pub fn remove_mesh(&mut self, mesh_id: usize) -> bool {
        self.meshes.remove(&mesh_id).is_some()
    }

    /// Set wireframe mode
    pub fn set_wireframe_mode(&mut self, enabled: bool) {
        self.wireframe_mode = enabled;
    }

    /// Set normal display
    pub fn set_show_normals(&mut self, enabled: bool) {
        self.show_normals = enabled;
    }

    /// Set face culling
    pub fn set_culling(&mut self, enabled: bool) {
        self.culling_enabled = enabled;
    }

    /// Get total vertex count
    pub fn get_total_vertices(&self) -> usize {
        self.meshes.values().map(|mesh| mesh.vertices.len()).sum()
    }

    /// Get total index count
    pub fn get_total_indices(&self) -> usize {
        self.meshes.values().map(|mesh| mesh.indices.len()).sum()
    }

    /// Clear all meshes
    pub fn clear_meshes(&mut self) {
        self.meshes.clear();
    }

    /// Clear all materials
    pub fn clear_materials(&mut self) {
        self.materials.clear();
    }

    /// Clear all lights
    pub fn clear_lights(&mut self) {
        self.lights.clear();
    }

    /// Get memory usage
    pub fn get_memory_usage(&self) -> usize {
        let mut total = 0;
        
        // Mesh memory
        for mesh in self.meshes.values() {
            total += mesh.vertices.len() * std::mem::size_of::<Vertex3D>();
            total += mesh.indices.len() * std::mem::size_of::<u32>();
        }
        
        // Material memory
        total += self.materials.len() * std::mem::size_of::<Material3D>();
        
        // Light memory
        total += self.lights.len() * std::mem::size_of::<Light3D>();
        
        total
    }
}

impl Default for Scene3DEngine {
    fn default() -> Self {
        Self::new()
    }
} 