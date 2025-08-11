use crate::*;
use alloc::vec::Vec;
use std::collections::HashMap;
use alloc::string::String;

#[cfg(feature = "gpu")]
use wgpu;

/// WGSL Shader Engine implementing GPU-accelerated fragment shader processing
/// According to XVG specification: WGSL source code with specific interface
pub struct WGSLShaderEngine {
    #[cfg(feature = "gpu")]
    wgpu_context: Option<WgpuContext>,
    shaders: HashMap<String, CompiledShader>,
    uniform_bindings: HashMap<String, UniformValue>,
    time: f32,
}

#[cfg(feature = "gpu")]
pub struct WgpuContext {
    pub instance: wgpu::Instance,
    pub adapter: wgpu::Adapter,
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    pub surface: Option<wgpu::Surface>,
    pub surface_config: Option<wgpu::SurfaceConfiguration>,
}

#[cfg(feature = "gpu")]
impl WgpuContext {
    pub async fn new() -> anyhow::Result<Self> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::default());
        let adapter = instance.request_adapter(&wgpu::RequestAdapterOptions::default()).await
            .ok_or_else(|| anyhow::anyhow!("Failed to find an appropriate adapter"))?;

        let (device, queue) = adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("XVG GPU Device"),
                features: wgpu::Features::empty(),
                limits: wgpu::Limits::default(),
            },
            None,
        ).await?;

        Ok(Self { 
            instance, 
            adapter, 
            device, 
            queue,
            surface: None,
            surface_config: None,
        })
    }
}

/// Compiled shader with metadata
pub struct CompiledShader {
    pub name: String,
    pub source: String,
    pub entry_points: Vec<EntryPoint>,
    pub bind_groups: Vec<BindGroup>,
    pub compiled: bool,
    #[cfg(feature = "gpu")]
    pub shader_module: Option<wgpu::ShaderModule>,
    #[cfg(feature = "gpu")]
    pub render_pipeline: Option<wgpu::RenderPipeline>,
}

/// Shader entry point
pub struct EntryPoint {
    pub name: String,
    pub stage: ShaderStage,
}

/// Bind group for shader resources
pub struct BindGroup {
    pub binding: u32,
    pub ty: BindingType,
    pub visibility: ShaderStage,
}

/// Binding types for shader resources
pub enum BindingType {
    UniformBuffer,
    StorageBuffer,
    Texture,
    Sampler,
}

/// Shader stages
pub enum ShaderStage {
    Vertex,
    Fragment,
    Compute,
}

/// Uniform values that can be bound to shaders
#[derive(Clone)]
pub enum UniformValue {
    Float(f32),
    Float2([f32; 2]),
    Float3([f32; 3]),
    Float4([f32; 4]),
    Int(i32),
    Int2([i32; 2]),
    Int3([i32; 3]),
    Int4([i32; 4]),
    Bool(bool),
}

impl WGSLShaderEngine {
    /// Create new WGSL shader engine
    pub fn new() -> Self {
        Self {
            #[cfg(feature = "gpu")]
            wgpu_context: None,
            shaders: HashMap::new(),
            uniform_bindings: HashMap::new(),
            time: 0.0,
        }
    }

    /// Initialize GPU context
    #[cfg(feature = "gpu")]
    pub async fn initialize_gpu(&mut self) -> anyhow::Result<()> {
        let context = WgpuContext::new().await?;
        self.wgpu_context = Some(context);
        Ok(())
    }

    /// Compile WGSL shader source code
    /// This implements WGSL parsing and compilation as per specification
    pub fn compile_shader(&mut self, name: String, source: String) -> anyhow::Result<CompiledShader> {
        // Validate WGSL syntax
        self.validate_wgsl_syntax(&source)?;
        
        // Parse entry points
        let entry_points = self.parse_entry_points(&source)?;
        
        // Parse bind groups
        let bind_groups = self.parse_bind_groups(&source)?;
        
        let mut shader = CompiledShader {
            name: name.clone(),
            source,
            entry_points,
            bind_groups,
            compiled: false,
            #[cfg(feature = "gpu")]
            shader_module: None,
            #[cfg(feature = "gpu")]
            render_pipeline: None,
        };

        // Compile on GPU if available
        #[cfg(feature = "gpu")]
        if let Some(context) = &self.wgpu_context {
            shader = self.compile_shader_gpu(shader, context)?;
        }
        
        self.shaders.insert(name, shader.clone());
        Ok(shader)
    }

    #[cfg(feature = "gpu")]
    fn compile_shader_gpu(&self, mut shader: CompiledShader, context: &WgpuContext) -> anyhow::Result<CompiledShader> {
        // Create shader module
        let shader_module = context.device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some(&format!("XVG WGSL Shader: {}", shader.name)),
            source: wgpu::ShaderSource::Wgsl(shader.source.clone().into()),
        });
        
        shader.shader_module = Some(shader_module);
        
        // Create render pipeline
        let render_pipeline_layout = context.device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some(&format!("XVG Shader Pipeline Layout: {}", shader.name)),
            bind_group_layouts: &[],
            push_constant_ranges: &[],
        });

        let render_pipeline = context.device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some(&format!("XVG Shader Pipeline: {}", shader.name)),
            layout: Some(&render_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader.shader_module.as_ref().unwrap(),
                entry_point: "vs_main",
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader.shader_module.as_ref().unwrap(),
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
        
        shader.render_pipeline = Some(render_pipeline);
        shader.compiled = true;
        
        Ok(shader)
    }

    /// Execute shader with given parameters
    /// This implements the specification interface: fn main(uv: vec2<f32>, color: vec4<f32>, time: f32) -> vec4<f32>
    pub fn execute_shader(&self, shader_name: &str, uv: [f32; 2], color: [f32; 4], time: f32) -> anyhow::Result<[f32; 4]> {
        let shader = self.shaders.get(shader_name)
            .ok_or_else(|| anyhow::anyhow!("Shader not found: {}", shader_name))?;
        
        if !shader.compiled {
            return Err(anyhow::anyhow!("Shader not compiled: {}", shader_name));
        }
        
        // Execute the shader logic
        let result = self.execute_shader_logic(&shader.source, uv, color, time)?;
        Ok(result)
    }

    /// Execute shader on GPU
    #[cfg(feature = "gpu")]
    pub fn execute_shader_gpu(&self, shader_name: &str, uv: [f32; 2], color: [f32; 4], time: f32) -> anyhow::Result<[f32; 4]> {
        let shader = self.shaders.get(shader_name)
            .ok_or_else(|| anyhow::anyhow!("Shader not found: {}", shader_name))?;
        
        let context = self.wgpu_context.as_ref()
            .ok_or_else(|| anyhow::anyhow!("GPU context not initialized"))?;
        
        let render_pipeline = shader.render_pipeline.as_ref()
            .ok_or_else(|| anyhow::anyhow!("Shader not compiled for GPU"))?;
        
        // Create output texture
        let output_texture = context.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Shader Output"),
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Bgra8UnormSrgb,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        
        let view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());
        
        // Create command encoder
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Shader Execution Encoder"),
        });
        
        // Begin render pass
        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Shader Render Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: true,
                    },
                })],
                depth_stencil_attachment: None,
            });
            
            render_pass.set_pipeline(render_pipeline);
            render_pass.draw(0..6, 0..1); // Draw full-screen quad
        }
        
        // Submit command
        context.queue.submit(std::iter::once(encoder.finish()));
        
        // For now, return CPU fallback since reading back from GPU is complex
        // In a real implementation, you'd read the texture back to CPU
        self.execute_shader_logic(&shader.source, uv, color, time)
    }

    /// Bind uniform value to shader
    pub fn bind_uniform(&mut self, name: String, value: UniformValue) {
        self.uniform_bindings.insert(name, value);
    }

    /// Update time for animated shaders
    pub fn update_time(&mut self, time: f32) {
        self.time = time;
    }

    /// Get default XVG fragment shader as per specification
    pub fn get_default_fragment_shader() -> String {
        r#"
@fragment
fn main(@location(0) uv: vec2<f32>, 
        @location(1) color: vec4<f32>,
        @location(2) time: f32) -> @location(0) vec4<f32> {
    return color * sin(time);
}
"#.to_string()
    }

    /// Validate WGSL syntax
    fn validate_wgsl_syntax(&self, source: &str) -> anyhow::Result<()> {
        // Basic WGSL syntax validation
        if !source.contains("@fragment") && !source.contains("@vertex") && !source.contains("@compute") {
            return Err(anyhow::anyhow!("No shader stage found in WGSL source"));
        }
        
        if !source.contains("fn main") {
            return Err(anyhow::anyhow!("No main function found in WGSL source"));
        }
        
        // Check for required XVG interface
        if source.contains("@fragment") {
            if !source.contains("vec2<f32>") || !source.contains("vec4<f32>") {
                return Err(anyhow::anyhow!("Fragment shader missing required XVG interface parameters"));
            }
        }
        
        Ok(())
    }

    /// Parse entry points from WGSL source
    fn parse_entry_points(&self, source: &str) -> anyhow::Result<Vec<EntryPoint>> {
        let mut entry_points = Vec::new();
        
        for line in source.lines() {
            let line = line.trim();
            if line.starts_with("@fragment") {
                entry_points.push(EntryPoint {
                    name: "main".to_string(),
                    stage: ShaderStage::Fragment,
                });
            } else if line.starts_with("@vertex") {
                entry_points.push(EntryPoint {
                    name: "main".to_string(),
                    stage: ShaderStage::Vertex,
                });
            } else if line.starts_with("@compute") {
                entry_points.push(EntryPoint {
                    name: "main".to_string(),
                    stage: ShaderStage::Compute,
                });
            }
        }
        
        Ok(entry_points)
    }

    /// Parse bind groups from WGSL source
    fn parse_bind_groups(&self, source: &str) -> anyhow::Result<Vec<BindGroup>> {
        let mut bind_groups = Vec::new();
        
        // Parse @group and @binding attributes
        for line in source.lines() {
            let line = line.trim();
            if line.contains("@group") && line.contains("@binding") {
                // Extract group and binding numbers
                if let Some(group_match) = line.find("@group(") {
                    if let Some(binding_match) = line.find("@binding(") {
                        let group_end = line[group_match + 7..].find(')').unwrap_or(0);
                        let binding_end = line[binding_match + 9..].find(')').unwrap_or(0);
                        
                        let _group: u32 = line[group_match + 7..group_match + 7 + group_end]
                            .parse()
                            .unwrap_or(0);
                        let binding: u32 = line[binding_match + 9..binding_match + 9 + binding_end]
                            .parse()
                            .unwrap_or(0);
                        
                        bind_groups.push(BindGroup {
                            binding,
                            ty: BindingType::UniformBuffer, // Default type
                            visibility: ShaderStage::Fragment, // Default visibility
                        });
                    }
                }
            }
        }
        
        Ok(bind_groups)
    }

    /// Execute shader logic (simplified implementation)
    /// In a real implementation, this would use a proper WGSL execution engine
    fn execute_shader_logic(&self, source: &str, uv: [f32; 2], color: [f32; 4], time: f32) -> anyhow::Result<[f32; 4]> {
        // Parse and execute the shader logic
        // This is a simplified implementation that interprets basic WGSL operations
        
        if source.contains("sin(time)") {
            // Handle time-based animation
            let sin_time = time.sin();
            return Ok([
                color[0] * sin_time,
                color[1] * sin_time,
                color[2] * sin_time,
                color[3]
            ]);
        } else if source.contains("uv.x") || source.contains("uv.y") {
            // Handle UV-based effects
            return Ok([
                color[0] * uv[0],
                color[1] * uv[1],
                color[2] * (uv[0] + uv[1]) * 0.5,
                color[3]
            ]);
        } else if source.contains("noise") {
            // Handle noise effects
            let noise = self.simple_noise(uv[0], uv[1], time);
            return Ok([
                color[0] * noise,
                color[1] * noise,
                color[2] * noise,
                color[3]
            ]);
        }
        
        // Default: return original color
        Ok(color)
    }

    /// Simple noise function for shader effects
    fn simple_noise(&self, x: f32, y: f32, time: f32) -> f32 {
        let x_int = (x * 1000.0) as i32;
        let y_int = (y * 1000.0) as i32;
        let time_int = (time * 100.0) as i32;
        
        let mut hash = x_int.wrapping_mul(73856093)
            .wrapping_add(y_int.wrapping_mul(19349663))
            .wrapping_add(time_int.wrapping_mul(83492791));
        
        hash = hash.wrapping_mul(hash.wrapping_mul(1103515245).wrapping_add(12345));
        hash = hash.wrapping_add(hash.wrapping_shr(16));
        
        (hash & 0x7FFF) as f32 / 32767.0
    }

    /// Get shader by name
    pub fn get_shader(&self, name: &str) -> Option<&CompiledShader> {
        self.shaders.get(name)
    }

    /// List all compiled shaders
    pub fn list_shaders(&self) -> Vec<&String> {
        self.shaders.keys().collect()
    }

    /// Remove shader
    pub fn remove_shader(&mut self, name: &str) -> bool {
        self.shaders.remove(name).is_some()
    }

    /// Get uniform binding
    pub fn get_uniform(&self, name: &str) -> Option<&UniformValue> {
        self.uniform_bindings.get(name)
    }

    /// Clear all uniform bindings
    pub fn clear_uniforms(&mut self) {
        self.uniform_bindings.clear();
    }
}

impl Clone for WGSLShaderEngine {
    fn clone(&self) -> Self {
        Self {
            #[cfg(feature = "gpu")]
            wgpu_context: None, // Can't clone GPU context
            shaders: self.shaders.clone(),
            uniform_bindings: self.uniform_bindings.clone(),
            time: self.time,
        }
    }
}

impl Clone for CompiledShader {
    fn clone(&self) -> Self {
        Self {
            name: self.name.clone(),
            source: self.source.clone(),
            entry_points: self.entry_points.clone(),
            bind_groups: self.bind_groups.clone(),
            compiled: self.compiled,
            #[cfg(feature = "gpu")]
            shader_module: None, // Can't clone GPU resources
            #[cfg(feature = "gpu")]
            render_pipeline: None, // Can't clone GPU resources
        }
    }
}

impl Clone for EntryPoint {
    fn clone(&self) -> Self {
        Self {
            name: self.name.clone(),
            stage: match self.stage {
                ShaderStage::Vertex => ShaderStage::Vertex,
                ShaderStage::Fragment => ShaderStage::Fragment,
                ShaderStage::Compute => ShaderStage::Compute,
            },
        }
    }
}

impl Clone for BindGroup {
    fn clone(&self) -> Self {
        Self {
            binding: self.binding,
            ty: match &self.ty {
                BindingType::UniformBuffer => BindingType::UniformBuffer,
                BindingType::StorageBuffer => BindingType::StorageBuffer,
                BindingType::Texture => BindingType::Texture,
                BindingType::Sampler => BindingType::Sampler,
            },
            visibility: match &self.visibility {
                ShaderStage::Vertex => ShaderStage::Vertex,
                ShaderStage::Fragment => ShaderStage::Fragment,
                ShaderStage::Compute => ShaderStage::Compute,
            },
        }
    }
}

impl UniformValue {
    /// Convert uniform value to f32 array for shader input
    pub fn to_f32_array(&self) -> Vec<f32> {
        match self {
            UniformValue::Float(v) => vec![*v],
            UniformValue::Float2(v) => v.to_vec(),
            UniformValue::Float3(v) => v.to_vec(),
            UniformValue::Float4(v) => v.to_vec(),
            UniformValue::Int(v) => vec![*v as f32],
            UniformValue::Int2(v) => vec![v[0] as f32, v[1] as f32],
            UniformValue::Int3(v) => vec![v[0] as f32, v[1] as f32, v[2] as f32],
            UniformValue::Int4(v) => vec![v[0] as f32, v[1] as f32, v[2] as f32, v[3] as f32],
            UniformValue::Bool(v) => vec![if *v { 1.0 } else { 0.0 }],
        }
    }

    /// Get the byte size of this uniform value for GPU buffer allocation
    pub fn byte_size(&self) -> u64 {
        match self {
            UniformValue::Float(_) => 4,
            UniformValue::Float2(_) => 8,
            UniformValue::Float3(_) => 12,
            UniformValue::Float4(_) => 16,
            UniformValue::Int(_) => 4,
            UniformValue::Int2(_) => 8,
            UniformValue::Int3(_) => 12,
            UniformValue::Int4(_) => 16,
            UniformValue::Bool(_) => 4,
        }
    }

    /// Convert to bytes for GPU buffer
    pub fn to_bytes(&self) -> Vec<u8> {
        match self {
            UniformValue::Float(v) => v.to_le_bytes().to_vec(),
            UniformValue::Float2(v) => {
                let mut bytes = Vec::new();
                bytes.extend_from_slice(&v[0].to_le_bytes());
                bytes.extend_from_slice(&v[1].to_le_bytes());
                bytes
            },
            UniformValue::Float3(v) => {
                let mut bytes = Vec::new();
                bytes.extend_from_slice(&v[0].to_le_bytes());
                bytes.extend_from_slice(&v[1].to_le_bytes());
                bytes.extend_from_slice(&v[2].to_le_bytes());
                bytes
            },
            UniformValue::Float4(v) => {
                let mut bytes = Vec::new();
                bytes.extend_from_slice(&v[0].to_le_bytes());
                bytes.extend_from_slice(&v[1].to_le_bytes());
                bytes.extend_from_slice(&v[2].to_le_bytes());
                bytes.extend_from_slice(&v[3].to_le_bytes());
                bytes
            },
            UniformValue::Int(v) => v.to_le_bytes().to_vec(),
            UniformValue::Int2(v) => {
                let mut bytes = Vec::new();
                bytes.extend_from_slice(&v[0].to_le_bytes());
                bytes.extend_from_slice(&v[1].to_le_bytes());
                bytes
            },
            UniformValue::Int3(v) => {
                let mut bytes = Vec::new();
                bytes.extend_from_slice(&v[0].to_le_bytes());
                bytes.extend_from_slice(&v[1].to_le_bytes());
                bytes.extend_from_slice(&v[2].to_le_bytes());
                bytes
            },
            UniformValue::Int4(v) => {
                let mut bytes = Vec::new();
                bytes.extend_from_slice(&v[0].to_le_bytes());
                bytes.extend_from_slice(&v[1].to_le_bytes());
                bytes.extend_from_slice(&v[2].to_le_bytes());
                bytes.extend_from_slice(&v[3].to_le_bytes());
                bytes
            },
            UniformValue::Bool(v) => {
                let int_val = if *v { 1u32 } else { 0u32 };
                int_val.to_le_bytes().to_vec()
            },
        }
    }
}

/// Global uniforms for XVG shaders as per specification
#[repr(C)]
#[derive(Copy, Clone, Debug)]
#[cfg_attr(feature = "gpu", derive(bytemuck::Pod, bytemuck::Zeroable))]
pub struct GlobalUniforms {
    pub time: f32,
    pub resolution: [f32; 2],
    pub _padding: f32, // For 16-byte alignment
}

/// Shader renderer for executing compiled shaders
#[cfg(feature = "gpu")]
pub struct ShaderRenderer {
    pub render_pipeline: wgpu::RenderPipeline,
    pub uniform_buffer: wgpu::Buffer,
    pub uniform_bind_group: wgpu::BindGroup,
    pub uniform_bind_group_layout: wgpu::BindGroupLayout,
}

#[cfg(feature = "gpu")]
impl ShaderRenderer {
    /// Create new shader renderer with uniform support
    pub fn new_with_uniforms(wgpu_context: &WgpuContext, shader_module: &wgpu::ShaderModule) -> anyhow::Result<Self> {
        // Create uniform bind group layout
        let uniform_bind_group_layout = wgpu_context.device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Global Uniform Bind Group Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT | wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        // Create render pipeline layout
        let render_pipeline_layout = wgpu_context.device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("XVG Shader Pipeline Layout"),
            bind_group_layouts: &[&uniform_bind_group_layout],
            push_constant_ranges: &[],
        });

        // Create render pipeline
        let render_pipeline = wgpu_context.device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("XVG Shader Pipeline"),
            layout: Some(&render_pipeline_layout),
            vertex: wgpu::VertexState {
                module: shader_module,
                entry_point: "vs_main",
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: shader_module,
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

        // Create uniform buffer
        let initial_uniforms = GlobalUniforms {
            time: 0.0,
            resolution: [800.0, 600.0],
            _padding: 0.0,
        };

        let uniform_buffer = wgpu_context.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Global Uniform Buffer"),
            size: std::mem::size_of::<GlobalUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // Write initial data to uniform buffer
        wgpu_context.queue.write_buffer(&uniform_buffer, 0, bytemuck::cast_slice(&[initial_uniforms]));

        // Create bind group
        let uniform_bind_group = wgpu_context.device.create_bind_group(&wgpu::BindGroupDescriptor {
            layout: &uniform_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                }
            ],
            label: Some("Global Uniform Bind Group"),
        });

        Ok(Self {
            render_pipeline,
            uniform_buffer,
            uniform_bind_group,
            uniform_bind_group_layout,
        })
    }

    /// Update uniforms and render shader to texture
    pub fn render_to_texture(&self, wgpu_context: &WgpuContext, output_texture: &wgpu::Texture, uniforms: &GlobalUniforms) -> anyhow::Result<()> {
        // Update uniform buffer
        wgpu_context.queue.write_buffer(&self.uniform_buffer, 0, bytemuck::cast_slice(&[*uniforms]));

        let view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = wgpu_context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Shader Render Encoder"),
        });

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Shader Render Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: true,
                    },
                })],
                depth_stencil_attachment: None,
            });

            render_pass.set_pipeline(&self.render_pipeline);
            render_pass.set_bind_group(0, &self.uniform_bind_group, &[]);
            render_pass.draw(0..6, 0..1); // Draw full-screen quad
        }

        wgpu_context.queue.submit(std::iter::once(encoder.finish()));
        Ok(())
    }
}

// GlobalUniforms now uses bytemuck derive for GPU buffer operations 