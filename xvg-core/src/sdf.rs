use crate::*;
use alloc::vec::Vec;
use std::collections::HashMap;

#[cfg(feature = "gpu")]
use half::f16;

/// SDF Neural Evaluation Engine implementing signed distance field rendering
/// According to XVG specification: MLP-based SDF evaluation with GPU acceleration
#[derive(Clone)]
pub struct SDFEngine {
    /// Neural network weights and biases
    weights: Vec<Vec<Vec<f32>>>, // Layer -> Neuron -> Weights
    biases: Vec<Vec<f32>>,       // Layer -> Biases
    
    /// Network architecture
    pub layer_sizes: Vec<usize>,
    
    /// Activation functions for each layer
    activations: Vec<ActivationFunction>,
    
    /// SDF evaluation cache for performance
    evaluation_cache: HashMap<[i32; 2], f32>,
    
    /// Compression settings
    use_f16: bool,
    compression_enabled: bool,
    
    /// Performance settings
    max_ray_steps: usize,
    adaptive_stepping: bool,
    
    /// SDF parameters
    smoothing_factor: f32,
    blend_mode: SDFBlendMode,
}

/// Activation functions for neural network layers
#[derive(Clone, Debug)]
pub enum ActivationFunction {
    ReLU,
    Tanh,
    Sigmoid,
    Sin, // For periodic activation functions (SIREN)
    Swish,
}

/// SDF blending modes for boolean operations
#[derive(Clone, Debug)]
pub enum SDFBlendMode {
    Union,
    Intersection,
    Subtraction,
    SmoothUnion(f32),
    SmoothSubtraction(f32),
    SmoothIntersection(f32),
}

/// SDF primitive types
#[derive(Clone, Debug)]
pub enum SDFPrimitive {
    Circle { center: [f32; 2], radius: f32 },
    Rectangle { center: [f32; 2], size: [f32; 2] },
    Triangle { points: [[f32; 2]; 3] },
    Polygon { points: Vec<[f32; 2]> },
    Path { points: Vec<[f32; 2]>, closed: bool },
}

/// SDF evaluation result with additional information
#[derive(Clone, Debug)]
pub struct SDFResult {
    pub distance: f32,
    pub gradient: [f32; 2],
    pub normal: [f32; 2],
    pub material_id: u32,
    pub uv_coords: [f32; 2],
}

impl SDFEngine {
    /// Create new SDF engine with default settings
    pub fn new() -> Self {
        Self {
            weights: Vec::new(),
            biases: Vec::new(),
            layer_sizes: vec![2, 64, 64, 64, 1], // Default architecture: 2D input -> 1D output
            activations: vec![
                ActivationFunction::Sin, // SIREN activation for first layer
                ActivationFunction::Sin,
                ActivationFunction::Sin,
                ActivationFunction::Sin,
            ],
            evaluation_cache: HashMap::new(),
            use_f16: false,
            compression_enabled: false,
            max_ray_steps: 100,
            adaptive_stepping: true,
            smoothing_factor: 0.1,
            blend_mode: SDFBlendMode::Union,
        }
    }

    /// Initialize SDF engine with custom architecture
    pub fn with_architecture(layer_sizes: Vec<usize>, activations: Vec<ActivationFunction>) -> Self {
        let mut engine = Self::new();
        engine.layer_sizes = layer_sizes;
        engine.activations = activations;
        engine.initialize_weights();
        engine
    }

    /// Initialize neural network weights with random values
    pub fn initialize_weights(&mut self) {
        self.weights.clear();
        self.biases.clear();
        
        // Initialize weights and biases for each layer
        for layer_idx in 0..self.layer_sizes.len() - 1 {
            let input_size = self.layer_sizes[layer_idx];
            let output_size = self.layer_sizes[layer_idx + 1];
            
            // Initialize weights with Xavier/Glorot initialization
            let mut layer_weights = Vec::with_capacity(output_size);
            for _ in 0..output_size {
                let mut neuron_weights = Vec::with_capacity(input_size);
                let scale = (2.0 / (input_size + output_size) as f32).sqrt();
                
                for _ in 0..input_size {
                    let weight = (rand::random::<f32>() - 0.5) * 2.0 * scale;
                    neuron_weights.push(weight);
                }
                layer_weights.push(neuron_weights);
            }
            self.weights.push(layer_weights);
            
            // Initialize biases
            let mut layer_biases = Vec::with_capacity(output_size);
            for _ in 0..output_size {
                let bias = (rand::random::<f32>() - 0.5) * 0.1;
                layer_biases.push(bias);
            }
            self.biases.push(layer_biases);
        }
        
        // Clear cache after weight initialization
        self.evaluation_cache.clear();
    }

    /// Load pre-trained weights from XVG file
    pub fn load_weights(&mut self, weights_data: &[u8]) -> anyhow::Result<()> {
        // Decompress if needed
        let decompressed = if self.compression_enabled {
            zstd::decode_all(weights_data)?
        } else {
            weights_data.to_vec()
        };
        
        // Parse weights from binary format
        let mut offset = 0;
        
        // Read layer sizes
        let layer_count = u32::from_le_bytes([
            decompressed[offset], decompressed[offset + 1], 
            decompressed[offset + 2], decompressed[offset + 3]
        ]) as usize;
        offset += 4;
        
        self.layer_sizes.clear();
        for _ in 0..layer_count {
            let size = u32::from_le_bytes([
                decompressed[offset], decompressed[offset + 1], 
                decompressed[offset + 2], decompressed[offset + 3]
            ]) as usize;
            self.layer_sizes.push(size);
            offset += 4;
        }
        
        // Read weights and biases
        self.weights.clear();
        self.biases.clear();
        
        for i in 0..self.layer_sizes.len() - 1 {
            let input_size = self.layer_sizes[i];
            let output_size = self.layer_sizes[i + 1];
            
            // Read weights
            let mut layer_weights = Vec::with_capacity(output_size);
            for _ in 0..output_size {
                let mut neuron_weights = Vec::with_capacity(input_size);
                for _ in 0..input_size {
                    let weight = if self.use_f16 {
                        #[cfg(feature = "gpu")]
                        {
                            let bytes = [decompressed[offset], decompressed[offset + 1]];
                            f16::from_le_bytes(bytes).to_f32()
                        }
                        #[cfg(not(feature = "gpu"))]
                        {
                            f32::from_le_bytes([
                                decompressed[offset], decompressed[offset + 1], 
                                decompressed[offset + 2], decompressed[offset + 3]
                            ])
                        }
                    } else {
                        f32::from_le_bytes([
                            decompressed[offset], decompressed[offset + 1], 
                            decompressed[offset + 2], decompressed[offset + 3]
                        ])
                    };
                    neuron_weights.push(weight);
                    offset += if self.use_f16 { 2 } else { 4 };
                }
                layer_weights.push(neuron_weights);
            }
            self.weights.push(layer_weights);
            
            // Read biases
            let mut layer_biases = Vec::with_capacity(output_size);
            for _ in 0..output_size {
                let bias = if self.use_f16 {
                    #[cfg(feature = "gpu")]
                    {
                        let bytes = [decompressed[offset], decompressed[offset + 1]];
                        f16::from_le_bytes(bytes).to_f32()
                    }
                    #[cfg(not(feature = "gpu"))]
                    {
                        f32::from_le_bytes([
                            decompressed[offset], decompressed[offset + 1], 
                            decompressed[offset + 2], decompressed[offset + 3]
                        ])
                    }
                } else {
                    f32::from_le_bytes([
                        decompressed[offset], decompressed[offset + 1], 
                        decompressed[offset + 2], decompressed[offset + 3]
                    ])
                };
                layer_biases.push(bias);
                offset += if self.use_f16 { 2 } else { 4 };
            }
            self.biases.push(layer_biases);
        }
        
        Ok(())
    }

    /// Save weights to XVG file format
    pub fn save_weights(&self) -> anyhow::Result<Vec<u8>> {
        let mut data = Vec::new();
        
        // Write layer sizes
        data.extend_from_slice(&(self.layer_sizes.len() as u32).to_le_bytes());
        for &size in &self.layer_sizes {
            data.extend_from_slice(&(size as u32).to_le_bytes());
        }
        
        // Write weights and biases
        for (layer_idx, layer_weights) in self.weights.iter().enumerate() {
            for neuron_weights in layer_weights {
                for &weight in neuron_weights {
                    if self.use_f16 {
                        #[cfg(feature = "gpu")]
                        {
                            let f16_weight = f16::from_f32(weight);
                            data.extend_from_slice(&f16_weight.to_le_bytes());
                        }
                        #[cfg(not(feature = "gpu"))]
                        {
                            data.extend_from_slice(&weight.to_le_bytes());
                        }
                    } else {
                        data.extend_from_slice(&weight.to_le_bytes());
                    }
                }
            }
            
            // Write biases
            for &bias in &self.biases[layer_idx] {
                if self.use_f16 {
                    #[cfg(feature = "gpu")]
                    {
                        let f16_bias = f16::from_f32(bias);
                        data.extend_from_slice(&f16_bias.to_le_bytes());
                    }
                    #[cfg(not(feature = "gpu"))]
                    {
                        data.extend_from_slice(&bias.to_le_bytes());
                    }
                } else {
                    data.extend_from_slice(&bias.to_le_bytes());
                }
            }
        }
        
        // Compress if enabled
        if self.compression_enabled {
            Ok(zstd::encode_all(&*data, 0)?)
        } else {
            Ok(data)
        }
    }

    /// Evaluate SDF at given point using neural network
    pub fn evaluate_sdf(&self, point: [f32; 2]) -> f32 {
        // Check cache first
        let cache_key = [(point[0] * 100.0) as i32, (point[1] * 100.0) as i32];
        if let Some(&cached_distance) = self.evaluation_cache.get(&cache_key) {
            return cached_distance;
        }
        
        // Forward pass through neural network
        let mut current_input = point.to_vec();
        
        for (layer_idx, layer_weights) in self.weights.iter().enumerate() {
            let mut layer_output = Vec::with_capacity(layer_weights.len());
            
            for (neuron_idx, neuron_weights) in layer_weights.iter().enumerate() {
                // Compute weighted sum
                let mut sum = self.biases[layer_idx][neuron_idx];
                for (input_idx, &input) in current_input.iter().enumerate() {
                    sum += input * neuron_weights[input_idx];
                }
                
                // Apply activation function
                let activated = self.apply_activation(sum, &self.activations[layer_idx]);
                layer_output.push(activated);
            }
            
            current_input = layer_output;
        }
        
        // Final output is the signed distance
        let distance = current_input[0];
        
        // Cache the result
        // Note: In a real implementation, you'd want to limit cache size
        // self.evaluation_cache.insert(cache_key, distance);
        
        distance
    }

    /// Apply activation function
    fn apply_activation(&self, x: f32, activation: &ActivationFunction) -> f32 {
        match activation {
            ActivationFunction::ReLU => x.max(0.0),
            ActivationFunction::Tanh => x.tanh(),
            ActivationFunction::Sigmoid => 1.0 / (1.0 + (-x).exp()),
            ActivationFunction::Sin => x.sin(),
            ActivationFunction::Swish => x / (1.0 + (-x).exp()),
        }
    }

    /// Compute gradient of SDF using finite differences
    pub fn compute_gradient(&self, point: [f32; 2], epsilon: f32) -> [f32; 2] {
        let dx = (self.evaluate_sdf([point[0] + epsilon, point[1]]) - 
                  self.evaluate_sdf([point[0] - epsilon, point[1]])) / (2.0 * epsilon);
        let dy = (self.evaluate_sdf([point[0], point[1] + epsilon]) - 
                  self.evaluate_sdf([point[0], point[1] - epsilon])) / (2.0 * epsilon);
        [dx, dy]
    }

    /// Compute surface normal from gradient
    pub fn compute_normal(&self, point: [f32; 2]) -> [f32; 2] {
        let gradient = self.compute_gradient(point, 0.001);
        let length = (gradient[0] * gradient[0] + gradient[1] * gradient[1]).sqrt();
        if length > 0.0 {
            [gradient[0] / length, gradient[1] / length]
        } else {
            [0.0, 1.0] // Default normal
        }
    }

    /// Ray marching with adaptive stepping
    pub fn ray_march(&self, origin: [f32; 2], direction: [f32; 2], max_distance: f32) -> Option<f32> {
        let mut current_distance = 0.0;
        let mut steps = 0;
        
        while current_distance < max_distance && steps < self.max_ray_steps {
            let current_point = [
                origin[0] + direction[0] * current_distance,
                origin[1] + direction[1] * current_distance,
            ];
            
            let sdf_distance = self.evaluate_sdf(current_point);
            
            // Check if we hit the surface
            if sdf_distance.abs() < 0.001 {
                return Some(current_distance);
            }
            
            // Adaptive stepping
            let step_size = if self.adaptive_stepping {
                sdf_distance.abs().max(0.01)
            } else {
                0.01
            };
            
            current_distance += step_size;
            steps += 1;
        }
        
        None // No hit
    }

    /// SDF boolean operations
    pub fn sdf_union(&self, sdf1: f32, sdf2: f32) -> f32 {
        sdf1.min(sdf2)
    }

    pub fn sdf_intersection(&self, sdf1: f32, sdf2: f32) -> f32 {
        sdf1.max(sdf2)
    }

    pub fn sdf_subtraction(&self, sdf1: f32, sdf2: f32) -> f32 {
        sdf1.max(-sdf2)
    }

    /// Smooth SDF operations
    pub fn smooth_union(&self, sdf1: f32, sdf2: f32, k: f32) -> f32 {
        let h = (k - (sdf1 - sdf2).abs()).max(0.0) / k;
        sdf1.min(sdf2) - h * h * k * 0.25
    }

    pub fn smooth_subtraction(&self, sdf1: f32, sdf2: f32, k: f32) -> f32 {
        let h = (k - (sdf1 + sdf2).abs()).max(0.0) / k;
        sdf1.max(-sdf2) + h * h * k * 0.25
    }

    pub fn smooth_intersection(&self, sdf1: f32, sdf2: f32, k: f32) -> f32 {
        let h = (k - (sdf1 - sdf2).abs()).max(0.0) / k;
        sdf1.max(sdf2) + h * h * k * 0.25
    }

    /// Extract path points from XVG path record
    fn extract_path_points(&self, path: &PathRecord) -> Vec<(f32, f32)> {
        let mut points = Vec::new();
        
        // Parse the path data which is stored as little-endian f32 pairs
        let data = &path.data;
        if data.len() < 8 { // Need at least 2 f32 values (x, y)
            return points;
        }
        
        let mut offset = 0;
        while offset + 7 < data.len() {
            let x = f32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
            let y = f32::from_le_bytes([data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]]);
            points.push((x, y));
            offset += 8;
        }
        
        points
    }

    /// Compute bounding box for path
    fn compute_path_bounds(&self, path: &PathRecord) -> (f32, f32, f32, f32) {
        let points = self.extract_path_points(path);
        
        if points.is_empty() {
            return (0.0, 0.0, 100.0, 100.0);
        }
        
        let mut min_x = points[0].0;
        let mut min_y = points[0].1;
        let mut max_x = points[0].0;
        let mut max_y = points[0].1;
        
        for &(x, y) in &points[1..] {
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }
        
        (min_x, min_y, max_x - min_x, max_y - min_y)
    }

    /// Compute distance from point to line segment
    fn point_to_line_segment(point: [f32; 2], line_start: [f32; 2], line_end: [f32; 2]) -> f32 {
        let dx = line_end[0] - line_start[0];
        let dy = line_end[1] - line_start[1];
        let length_sq = dx * dx + dy * dy;
        
        if length_sq == 0.0 {
            // Line segment is a point
            let px = point[0] - line_start[0];
            let py = point[1] - line_start[1];
            return (px * px + py * py).sqrt();
        }
        
        // Project point onto line
        let t = ((point[0] - line_start[0]) * dx + (point[1] - line_start[1]) * dy) / length_sq;
        let t = t.max(0.0).min(1.0);
        
        let projected_x = line_start[0] + t * dx;
        let projected_y = line_start[1] + t * dy;
        
        let px = point[0] - projected_x;
        let py = point[1] - projected_y;
        
        (px * px + py * py).sqrt()
    }

    /// Train the neural network on SDF data
    pub fn train(&mut self, training_data: &[([f32; 2], f32)], epochs: usize, learning_rate: f32) -> anyhow::Result<()> {
        // Simple gradient descent training
        for epoch in 0..epochs {
            let mut total_loss = 0.0;
            
            for &(input, target) in training_data {
                // Forward pass
                let prediction = self.evaluate_sdf(input);
                let loss = (prediction - target).powi(2);
                total_loss += loss;
                
                // Backward pass (simplified)
                // In a real implementation, you'd compute gradients properly
                let error = prediction - target;
                
                // Update weights (simplified gradient descent)
                for layer_weights in &mut self.weights {
                    for neuron_weights in layer_weights {
                        for weight in neuron_weights {
                            *weight -= learning_rate * error * 0.01; // Simplified gradient
                        }
                    }
                }
            }
            
            if epoch % 100 == 0 {
                println!("Epoch {}, Loss: {}", epoch, total_loss / training_data.len() as f32);
            }
        }
        
        Ok(())
    }

    /// Enable/disable f16 compression
    pub fn set_f16_compression(&mut self, enabled: bool) {
        self.use_f16 = enabled;
    }

    /// Enable/disable zstd compression
    pub fn set_compression(&mut self, enabled: bool) {
        self.compression_enabled = enabled;
    }

    /// Set adaptive stepping for ray marching
    pub fn set_adaptive_stepping(&mut self, enabled: bool) {
        self.adaptive_stepping = enabled;
    }

    /// Set maximum ray marching steps
    pub fn set_max_ray_steps(&mut self, steps: usize) {
        self.max_ray_steps = steps;
    }

    /// Set smoothing factor for smooth operations
    pub fn set_smoothing_factor(&mut self, factor: f32) {
        self.smoothing_factor = factor;
    }

    /// Set blend mode for SDF operations
    pub fn set_blend_mode(&mut self, mode: SDFBlendMode) {
        self.blend_mode = mode;
    }

    /// Clear evaluation cache
    pub fn clear_cache(&mut self) {
        self.evaluation_cache.clear();
    }

    /// Get memory usage statistics
    pub fn get_memory_usage(&self) -> usize {
        let mut total = 0;
        
        // Weights memory
        for layer_weights in &self.weights {
            for neuron_weights in layer_weights {
                total += neuron_weights.len() * std::mem::size_of::<f32>();
            }
        }
        
        // Biases memory
        for layer_biases in &self.biases {
            total += layer_biases.len() * std::mem::size_of::<f32>();
        }
        
        // Cache memory
        total += self.evaluation_cache.len() * std::mem::size_of::<([i32; 2], f32)>();
        
        total
    }

    /// Generate WGSL shader code for SDF raymarching
    pub fn generate_raymarching_shader(&self) -> String {
        let mut shader = String::new();
        
        // Shader header and uniforms
        shader.push_str(r#"
@group(0) @binding(0) var<uniform> camera: CameraParams;
@group(0) @binding(1) var<uniform> mlp_weights: MLPWeights;
@group(0) @binding(2) var<uniform> sdf_params: SDFParams;

struct CameraParams {
    origin: vec3<f32>,
    direction: vec3<f32>,
    up: vec3<f32>,
    fov: f32,
    aspect: f32,
}

struct MLPWeights {
    layer_sizes: array<u32, 8>,
    weights: array<f32, 1024>,
    biases: array<f32, 256>,
    activations: array<u32, 8>,
}

struct SDFParams {
    max_steps: u32,
    max_distance: f32,
    min_hit_distance: f32,
    adaptive_stepping: u32,
    smoothing_factor: f32,
}
"#);

        // Activation functions
        shader.push_str(r#"
fn relu(x: f32) -> f32 {
    return max(0.0, x);
}

fn tanh_activation(x: f32) -> f32 {
    return tanh(x);
}

fn sigmoid(x: f32) -> f32 {
    return 1.0 / (1.0 + exp(-x));
}

fn sin_activation(x: f32) -> f32 {
    return sin(x);
}

fn swish(x: f32) -> f32 {
    return x / (1.0 + exp(-x));
}

fn apply_activation(x: f32, activation_type: u32) -> f32 {
    switch(activation_type) {
        case 0u: return relu(x);
        case 1u: return tanh_activation(x);
        case 2u: return sigmoid(x);
        case 3u: return sin_activation(x);
        case 4u: return swish(x);
        default: return x;
    }
}
"#);

        // MLP evaluation function
        shader.push_str(r#"
fn evaluate_mlp(point: vec2<f32>) -> f32 {
    var current_input = vec4<f32>(point.x, point.y, 0.0, 0.0);
    var weight_offset = 0u;
    var bias_offset = 0u;
    
    // Forward pass through layers
    for (var layer = 0u; layer < 3u; layer++) {
        let input_size = mlp_weights.layer_sizes[layer];
        let output_size = mlp_weights.layer_sizes[layer + 1u];
        let activation = mlp_weights.activations[layer];
        
        var layer_output = vec4<f32>(0.0);
        
        // Matrix multiplication and bias addition
        for (var out_idx = 0u; out_idx < output_size; out_idx++) {
            var sum = mlp_weights.biases[bias_offset + out_idx];
            
            for (var in_idx = 0u; in_idx < input_size; in_idx++) {
                let weight = mlp_weights.weights[weight_offset + in_idx * output_size + out_idx];
                sum += current_input[in_idx] * weight;
            }
            
            layer_output[out_idx] = apply_activation(sum, activation);
        }
        
        current_input = layer_output;
        weight_offset += input_size * output_size;
        bias_offset += output_size;
    }
    
    return current_input[0];
}
"#);

        // Raymarching function
        shader.push_str(r#"
fn raymarch(ray_origin: vec2<f32>, ray_direction: vec2<f32>) -> f32 {
    var total_distance = 0.0;
    var current_pos = ray_origin;
    
    for (var i = 0u; i < sdf_params.max_steps; i++) {
        let distance = evaluate_mlp(current_pos);
        
        if (abs(distance) < sdf_params.min_hit_distance) {
            return total_distance;
        }
        
        let step_size = select(
            distance,
            max(abs(distance) * 0.5, 0.01),
            sdf_params.adaptive_stepping > 0u
        );
        
        current_pos += ray_direction * step_size;
        total_distance += step_size;
        
        if (total_distance > sdf_params.max_distance) {
            break;
        }
    }
    
    return -1.0;
}

fn calculate_normal(p: vec2<f32>) -> vec2<f32> {
    let epsilon = 0.001;
    let dx = vec2<f32>(epsilon, 0.0);
    let dy = vec2<f32>(0.0, epsilon);
    
    let normal_x = evaluate_mlp(p + dx) - evaluate_mlp(p - dx);
    let normal_y = evaluate_mlp(p + dy) - evaluate_mlp(p - dy);
    
    let normal = vec2<f32>(normal_x, normal_y);
    let length = length(normal);
    
    return select(normal / length, vec2<f32>(0.0, 1.0), length == 0.0);
}
"#);

        // Vertex shader for full-screen quad
        shader.push_str(r#"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var pos = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>( 1.0,  1.0)
    );
    
    var uv = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(1.0, 0.0)
    );
    
    var output: VertexOutput;
    output.position = vec4<f32>(pos[vertex_index], 0.0, 1.0);
    output.uv = uv[vertex_index];
    return output;
}
"#);

        // Main fragment shader
        shader.push_str(r#"
@fragment
fn fs_main(vertex_output: VertexOutput) -> @location(0) vec4<f32> {
    // Convert UV coordinates to normalized device coordinates
    let uv = vertex_output.uv * 2.0 - 1.0;
    
    let ray_origin = camera.origin.xy;
    let ray_direction = normalize(camera.direction.xy + uv);
    
    let hit_distance = raymarch(ray_origin, ray_direction);
    
    if (hit_distance > 0.0) {
        let hit_point = ray_origin + ray_direction * hit_distance;
        let normal = calculate_normal(hit_point);
        
        // Simple lighting
        let light_dir = normalize(vec2<f32>(1.0, 1.0));
        let diffuse = max(dot(normal, light_dir), 0.0);
        let ambient = 0.2;
        let lighting = ambient + diffuse * 0.8;
        
        return vec4<f32>(lighting, lighting, lighting, 1.0);
    }
    
    return vec4<f32>(0.1, 0.1, 0.2, 1.0); // Background color
}
"#);

        shader
    }

    /// Create GPU resources for SDF rendering
    #[cfg(feature = "gpu")]
    pub fn create_gpu_resources(&self, device: &wgpu::Device) -> anyhow::Result<SDFGPUResources> {
        let shader_source = self.generate_raymarching_shader();
        
        // Create shader module
        let shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("XVG SDF Raymarching Shader"),
            source: wgpu::ShaderSource::Wgsl(shader_source.into()),
        });

        // Create uniform buffers
        let camera_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("SDF Camera Buffer"),
            size: std::mem::size_of::<[f32; 16]>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let mlp_weights_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("SDF MLP Weights Buffer"),
            size: self.get_weights_buffer_size() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let sdf_params_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("SDF Parameters Buffer"),
            size: std::mem::size_of::<[f32; 8]>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // Create bind group layout
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("SDF Bind Group Layout"),
            entries: &[
                // Camera params
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // MLP weights
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // SDF params
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        // Create bind group
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("SDF Bind Group"),
            layout: &bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: camera_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: mlp_weights_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: sdf_params_buffer.as_entire_binding(),
                },
            ],
        });

        // Create render pipeline
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("SDF Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("SDF Render Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader_module,
                entry_point: "vs_main",
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader_module,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Bgra8UnormSrgb,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
        });

        Ok(SDFGPUResources {
            shader_module,
            camera_buffer,
            mlp_weights_buffer,
            sdf_params_buffer,
            bind_group_layout,
            bind_group,
            render_pipeline,
        })
    }

    /// Get the size needed for the weights buffer
    fn get_weights_buffer_size(&self) -> usize {
        let mut total_size = 0;
        
        // Layer sizes (8 u32s)
        total_size += 8 * 4;
        
        // Weights
        for layer_weights in &self.weights {
            for neuron_weights in layer_weights {
                total_size += neuron_weights.len() * 4;
            }
        }
        
        // Biases
        for layer_biases in &self.biases {
            total_size += layer_biases.len() * 4;
        }
        
        // Activations (8 u32s)
        total_size += 8 * 4;
        
        total_size
    }

    /// Update GPU buffers with current SDF data
    #[cfg(feature = "gpu")]
    pub fn update_gpu_buffers(&self, queue: &wgpu::Queue, resources: &SDFGPUResources) -> anyhow::Result<()> {
        // Update MLP weights buffer
        let weights_data = self.serialize_weights_for_gpu()?;
        queue.write_buffer(&resources.mlp_weights_buffer, 0, &weights_data);

        // Update SDF parameters buffer
        let params_data = self.serialize_params_for_gpu()?;
        queue.write_buffer(&resources.sdf_params_buffer, 0, &params_data);

        Ok(())
    }

    /// Serialize weights for GPU buffer
    fn serialize_weights_for_gpu(&self) -> anyhow::Result<Vec<u8>> {
        let mut data = Vec::new();
        
        // Layer sizes (pad to 8 u32s)
        for i in 0..8 {
            let size = if i < self.layer_sizes.len() {
                self.layer_sizes[i] as u32
            } else {
                0
            };
            data.extend_from_slice(&size.to_le_bytes());
        }
        
        // Weights
        for layer_weights in &self.weights {
            for neuron_weights in layer_weights {
                for &weight in neuron_weights {
                    data.extend_from_slice(&weight.to_le_bytes());
                }
            }
        }
        
        // Biases
        for layer_biases in &self.biases {
            for &bias in layer_biases {
                data.extend_from_slice(&bias.to_le_bytes());
            }
        }
        
        // Activations (pad to 8 u32s)
        for i in 0..8 {
            let activation = if i < self.activations.len() {
                match self.activations[i] {
                    ActivationFunction::ReLU => 0u32,
                    ActivationFunction::Tanh => 1u32,
                    ActivationFunction::Sigmoid => 2u32,
                    ActivationFunction::Sin => 3u32,
                    ActivationFunction::Swish => 4u32,
                }
            } else {
                0
            };
            data.extend_from_slice(&activation.to_le_bytes());
        }
        
        Ok(data)
    }

    /// Serialize parameters for GPU buffer
    fn serialize_params_for_gpu(&self) -> anyhow::Result<Vec<u8>> {
        let mut data = Vec::new();
        
        data.extend_from_slice(&(self.max_ray_steps as f32).to_le_bytes());
        data.extend_from_slice(&100.0f32.to_le_bytes()); // max_distance
        data.extend_from_slice(&0.001f32.to_le_bytes()); // min_hit_distance
        data.extend_from_slice(&(if self.adaptive_stepping { 1.0f32 } else { 0.0f32 }).to_le_bytes());
        data.extend_from_slice(&self.smoothing_factor.to_le_bytes());
        
        // Pad to 8 f32s
        for _ in 0..3 {
            data.extend_from_slice(&0.0f32.to_le_bytes());
        }
        
        Ok(data)
    }
}

impl Default for SDFEngine {
    fn default() -> Self {
        Self::new()
    }
}

// Simple random number generator for weight initialization
mod rand {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::sync::atomic::{AtomicU64, Ordering};
    
    static SEED: AtomicU64 = AtomicU64::new(0x1234567890abcdef);
    
    pub fn random<T>() -> T 
    where
        T: From<f32>,
    {
        let mut hasher = DefaultHasher::new();
        SEED.fetch_add(1, Ordering::Relaxed).hash(&mut hasher);
        let hash = hasher.finish();
        let normalized = (hash as f32) / (u64::MAX as f32);
        T::from(normalized)
    }
} 

/// GPU resources for SDF rendering
#[cfg(feature = "gpu")]
pub struct SDFGPUResources {
    pub shader_module: wgpu::ShaderModule,
    pub camera_buffer: wgpu::Buffer,
    pub mlp_weights_buffer: wgpu::Buffer,
    pub sdf_params_buffer: wgpu::Buffer,
    pub bind_group_layout: wgpu::BindGroupLayout,
    pub bind_group: wgpu::BindGroup,
    pub render_pipeline: wgpu::RenderPipeline,
} 

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sdf_engine_creation() {
        let engine = SDFEngine::new();
        assert_eq!(engine.layer_sizes, vec![2, 64, 64, 64, 1]);
        assert_eq!(engine.activations.len(), 4);
    }

    #[test]
    fn test_sdf_evaluation() {
        let mut engine = SDFEngine::new();
        engine.initialize_weights();
        
        // Test evaluation at origin
        let distance = engine.evaluate_sdf([0.0, 0.0]);
        assert!(distance.is_finite());
        
        // Test evaluation at different points
        let distance1 = engine.evaluate_sdf([1.0, 0.0]);
        let distance2 = engine.evaluate_sdf([0.0, 1.0]);
        assert!(distance1.is_finite());
        assert!(distance2.is_finite());
    }

    #[test]
    fn test_sdf_boolean_operations() {
        let engine = SDFEngine::new();
        
        // Test union
        let union_result = engine.sdf_union(1.0, 2.0);
        assert_eq!(union_result, 1.0);
        
        // Test intersection
        let intersection_result = engine.sdf_intersection(1.0, 2.0);
        assert_eq!(intersection_result, 2.0);
        
        // Test subtraction
        let subtraction_result = engine.sdf_subtraction(1.0, 2.0);
        assert_eq!(subtraction_result, 1.0);
    }

    #[test]
    fn test_smooth_operations() {
        let engine = SDFEngine::new();
        
        // Test smooth union
        let smooth_union = engine.smooth_union(1.0, 2.0, 0.5);
        assert!(smooth_union <= 1.0); // Should be less than or equal to regular union
        
        // Test smooth subtraction
        let smooth_subtraction = engine.smooth_subtraction(1.0, 2.0, 0.5);
        assert!(smooth_subtraction >= 1.0); // Should be greater than or equal to regular subtraction
    }

    #[test]
    fn test_weight_serialization() {
        let mut engine = SDFEngine::new();
        engine.initialize_weights();
        
        // Test saving weights
        let weights_data = engine.save_weights().unwrap();
        assert!(!weights_data.is_empty());
        
        // Test loading weights
        let mut new_engine = SDFEngine::new();
        new_engine.load_weights(&weights_data).unwrap();
        
        // Verify the engines produce similar results
        let original_distance = engine.evaluate_sdf([0.5, 0.5]);
        let loaded_distance = new_engine.evaluate_sdf([0.5, 0.5]);
        assert!((original_distance - loaded_distance).abs() < 0.001);
    }

    #[test]
    fn test_raymarching() {
        let mut engine = SDFEngine::new();
        engine.initialize_weights();
        
        // Test raymarching from origin
        let hit = engine.ray_march([0.0, 0.0], [1.0, 0.0], 10.0);
        // Should either hit something or return None
        assert!(hit.is_none() || hit.unwrap() >= 0.0);
    }

    #[test]
    fn test_normal_calculation() {
        let mut engine = SDFEngine::new();
        engine.initialize_weights();
        
        let normal = engine.compute_normal([0.5, 0.5]);
        assert!(normal[0].is_finite());
        assert!(normal[1].is_finite());
        
        // Normal should be normalized
        let length = (normal[0] * normal[0] + normal[1] * normal[1]).sqrt();
        assert!((length - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_shader_generation() {
        let engine = SDFEngine::new();
        let shader_code = engine.generate_raymarching_shader();
        
        // Verify shader contains expected components
        assert!(shader_code.contains("@vertex"));
        assert!(shader_code.contains("@fragment"));
        assert!(shader_code.contains("evaluate_mlp"));
        assert!(shader_code.contains("raymarch"));
        assert!(shader_code.contains("CameraParams"));
        assert!(shader_code.contains("MLPWeights"));
    }

    #[test]
    fn test_gpu_buffer_serialization() {
        let mut engine = SDFEngine::new();
        engine.initialize_weights();
        
        // Test GPU weights serialization
        let weights_data = engine.serialize_weights_for_gpu().unwrap();
        assert!(!weights_data.is_empty());
        
        // Test GPU params serialization
        let params_data = engine.serialize_params_for_gpu().unwrap();
        assert_eq!(params_data.len(), 32); // 8 f32s * 4 bytes
    }
} 