use crate::*;
use alloc::vec::Vec;
use alloc::string::String;
use std::collections::HashMap;

#[cfg(feature = "networking")]
use tokio::sync::mpsc;
#[cfg(feature = "networking")]
use tokio::net::{TcpListener, TcpStream};
#[cfg(feature = "networking")]
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// CRDT Engine implementing real-time collaboration with operational transformation
/// According to XVG specification: CRDT-based collaboration with Lamport timestamps
#[derive(Clone)]
pub struct CRDTEngine {
    /// Local author ID
    author_id: u16,
    
    /// Lamport clock for causal ordering
    lamport_clock: u64,
    
    /// Document state
    document_state: DocumentState,
    
    /// Operation log for undo/redo
    operation_log: Vec<CRDTOperation>,
    
    /// Pending operations waiting for acknowledgment
    pending_operations: HashMap<u64, CRDTOperation>,
    
    /// Connected peers
    connected_peers: Vec<PeerInfo>,
    
    /// Collaboration settings
    auto_sync: bool,
    conflict_resolution: ConflictResolutionStrategy,
    
    /// Performance settings
    max_operation_log: usize,
    batch_size: usize,
    
    /// Advanced networking
    #[cfg(feature = "networking")]
    network_manager: Option<Box<NetworkSyncManager>>,
}

/// Document state managed by CRDT
#[derive(Clone, Debug)]
pub struct DocumentState {
    pub paths: HashMap<u64, CRDTPath>,
    pub metadata: HashMap<String, String>,
    pub version: u64,
    pub last_modified: u64,
}

/// CRDT path with unique identifier
#[derive(Clone, Debug)]
pub struct CRDTPath {
    pub id: u64,
    pub path_data: PathRecord,
    pub author_id: u16,
    pub timestamp: u64,
    pub deleted: bool,
    pub version: u64,
}

/// CRDT operation types
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum CRDOpType {
    CreatePath = 0x01,
    UpdatePath = 0x02,
    DeletePath = 0x03,
    MovePath = 0x04,
    UpdateStyle = 0x05,
    UpdateMetadata = 0x06,
    Batch = 0x07,
}

/// CRDT operation with Lamport timestamp
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CRDTOperation {
    pub id: u64,
    pub author_id: u16,
    pub lamport_timestamp: u64,
    pub operation_type: CRDOpType,
    pub payload: Vec<u8>,
    pub dependencies: Vec<u64>,
    pub timestamp: u64,
}

/// Peer information
#[derive(Clone, Debug)]
pub struct PeerInfo {
    pub id: u16,
    pub name: String,
    pub last_seen: u64,
    pub lamport_clock: u64,
    pub status: PeerStatus,
}

/// Peer connection status
#[derive(Clone, Debug)]
pub enum PeerStatus {
    Connected,
    Disconnected,
    Syncing,
    Error,
}

/// Conflict resolution strategies
#[derive(Clone, Debug)]
pub enum ConflictResolutionStrategy {
    LastWriteWins,
    FirstWriteWins,
    AuthorPriority,
    Manual,
}

impl CRDTEngine {
    /// Create new CRDT engine
    pub fn new(author_id: u16) -> Self {
        Self {
            author_id,
            lamport_clock: 0,
            document_state: DocumentState {
                paths: HashMap::new(),
                metadata: HashMap::new(),
                version: 0,
                last_modified: 0,
            },
            operation_log: Vec::new(),
            pending_operations: HashMap::new(),
            connected_peers: Vec::new(),
            auto_sync: true,
            conflict_resolution: ConflictResolutionStrategy::LastWriteWins,
            max_operation_log: 10000,
            batch_size: 100,
            #[cfg(feature = "networking")]
            network_manager: None,
        }
    }

    /// Increment Lamport clock
    fn increment_clock(&mut self) -> u64 {
        self.lamport_clock += 1;
        self.lamport_clock
    }

    /// Update Lamport clock based on received timestamp
    fn update_clock(&mut self, received_timestamp: u64) {
        self.lamport_clock = self.lamport_clock.max(received_timestamp) + 1;
    }

    /// Add operation to CRDT
    pub fn add_operation(&mut self, operation_type: CRDOpType, payload: Vec<u8>) -> u64 {
        let operation_id = self.generate_operation_id();
        let lamport_timestamp = self.increment_clock();
        let timestamp = self.get_current_timestamp();
        
        let operation = CRDTOperation {
            id: operation_id,
            author_id: self.author_id,
            lamport_timestamp,
            operation_type,
            payload,
            dependencies: Vec::new(),
            timestamp,
        };
        
        // Apply operation locally
        self.apply_operation(&operation);
        
        // Add to operation log
        self.operation_log.push(operation.clone());
        
        // Add to pending operations if auto-sync is enabled
        if self.auto_sync {
            self.pending_operations.insert(operation_id, operation);
        }
        
        // Trim operation log if it gets too large
        if self.operation_log.len() > self.max_operation_log {
            self.operation_log.drain(0..self.operation_log.len() - self.max_operation_log);
        }
        
        operation_id
    }

    /// Generate unique operation ID
    fn generate_operation_id(&self) -> u64 {
        // Simple ID generation - in a real implementation, you'd use a more robust method
        (self.author_id as u64) << 48 | (self.lamport_clock as u64)
    }

    /// Get current timestamp
    fn get_current_timestamp(&self) -> u64 {
        // In a real implementation, you'd use a proper timestamp
        // For now, use a simple counter
        self.lamport_clock
    }

    /// Apply operation to local document state
    fn apply_operation(&mut self, operation: &CRDTOperation) {
        match operation.operation_type {
            CRDOpType::CreatePath => {
                self.apply_create_path(operation);
            }
            CRDOpType::UpdatePath => {
                self.apply_update_path(operation);
            }
            CRDOpType::DeletePath => {
                self.apply_delete_path(operation);
            }
            CRDOpType::MovePath => {
                self.apply_move_path(operation);
            }
            CRDOpType::UpdateStyle => {
                self.apply_update_style(operation);
            }
            CRDOpType::UpdateMetadata => {
                self.apply_update_metadata(operation);
            }
            CRDOpType::Batch => {
                self.apply_batch_operation(operation);
            }
        }
        
        // Update document version and timestamp
        self.document_state.version += 1;
        self.document_state.last_modified = operation.timestamp;
    }

    /// Apply create path operation
    fn apply_create_path(&mut self, operation: &CRDTOperation) {
        // Parse path data from payload
        if let Ok(path_record) = self.deserialize_path_record(&operation.payload) {
            let crdt_path = CRDTPath {
                id: operation.id,
                path_data: path_record,
                author_id: operation.author_id,
                timestamp: operation.timestamp,
                deleted: false,
                version: operation.lamport_timestamp,
            };
            
            self.document_state.paths.insert(crdt_path.id, crdt_path);
        }
    }

    /// Apply update path operation
    fn apply_update_path(&mut self, operation: &CRDTOperation) {
        // Parse update data from payload
        if let Ok((path_id, path_record)) = self.deserialize_path_update(&operation.payload) {
            if let Some(existing_path) = self.document_state.paths.get_mut(&path_id) {
                // Check for conflicts
                if existing_path.version < operation.lamport_timestamp {
                    existing_path.path_data = path_record;
                    existing_path.version = operation.lamport_timestamp;
                    existing_path.timestamp = operation.timestamp;
                }
            }
        }
    }

    /// Apply delete path operation
    fn apply_delete_path(&mut self, operation: &CRDTOperation) {
        // Parse path ID from payload
        if let Ok(path_id) = self.deserialize_path_id(&operation.payload) {
            if let Some(existing_path) = self.document_state.paths.get_mut(&path_id) {
                if existing_path.version < operation.lamport_timestamp {
                    existing_path.deleted = true;
                    existing_path.version = operation.lamport_timestamp;
                    existing_path.timestamp = operation.timestamp;
                }
            }
        }
    }

    /// Apply move path operation
    fn apply_move_path(&mut self, operation: &CRDTOperation) {
        // Parse move data from payload
        if let Ok((path_id, translation)) = self.deserialize_move_data(&operation.payload) {
            if let Some(existing_path) = self.document_state.paths.get_mut(&path_id) {
                if existing_path.version < operation.lamport_timestamp {
                    // Apply translation to path data
                    Self::translate_path_static(&mut existing_path.path_data, translation);
                    existing_path.version = operation.lamport_timestamp;
                    existing_path.timestamp = operation.timestamp;
                }
            }
        }
    }

    /// Apply update style operation
    fn apply_update_style(&mut self, operation: &CRDTOperation) {
        // Parse style update from payload
        if let Ok((path_id, style)) = self.deserialize_style_update(&operation.payload) {
            if let Some(existing_path) = self.document_state.paths.get_mut(&path_id) {
                if existing_path.version < operation.lamport_timestamp {
                    existing_path.path_data.style = style;
                    existing_path.version = operation.lamport_timestamp;
                    existing_path.timestamp = operation.timestamp;
                }
            }
        }
    }

    /// Apply update metadata operation
    fn apply_update_metadata(&mut self, operation: &CRDTOperation) {
        // Parse metadata update from payload
        if let Ok((key, value)) = self.deserialize_metadata_update(&operation.payload) {
            self.document_state.metadata.insert(key, value);
        }
    }

    /// Apply batch operation
    fn apply_batch_operation(&mut self, operation: &CRDTOperation) {
        // Parse batch operations from payload
        if let Ok(operations) = self.deserialize_batch(&operation.payload) {
            for op in operations {
                self.apply_operation(&op);
            }
        }
    }

    /// Merge operations from remote peers
    pub fn merge_operations(&mut self, operations: &[CRDTOperation]) -> anyhow::Result<()> {
        // Sort operations by Lamport timestamp for causal ordering
        let mut sorted_operations = operations.to_vec();
        sorted_operations.sort_by_key(|op| op.lamport_timestamp);
        
        for operation in sorted_operations {
            // Update local clock
            self.update_clock(operation.lamport_timestamp);
            
            // Apply operation
            self.apply_operation(&operation);
            
            // Add to operation log
            self.operation_log.push(operation.clone());
        }
        
        // Trim operation log if needed
        if self.operation_log.len() > self.max_operation_log {
            self.operation_log.drain(0..self.operation_log.len() - self.max_operation_log);
        }
        
        Ok(())
    }

    /// Get pending operations for synchronization
    pub fn get_pending_operations(&self) -> Vec<CRDTOperation> {
        self.pending_operations.values().cloned().collect()
    }

    /// Mark operation as acknowledged
    pub fn acknowledge_operation(&mut self, operation_id: u64) {
        self.pending_operations.remove(&operation_id);
    }

    /// Get document state
    pub fn get_document_state(&self) -> &DocumentState {
        &self.document_state
    }

    /// Get active paths (not deleted)
    pub fn get_active_paths(&self) -> Vec<&CRDTPath> {
        self.document_state.paths.values()
            .filter(|path| !path.deleted)
            .collect()
    }

    /// Get operation log
    pub fn get_operation_log(&self) -> &[CRDTOperation] {
        &self.operation_log
    }

    /// Get connected peers
    pub fn get_connected_peers(&self) -> &[PeerInfo] {
        &self.connected_peers
    }

    /// Add peer
    pub fn add_peer(&mut self, peer: PeerInfo) {
        self.connected_peers.push(peer);
    }

    /// Remove peer
    pub fn remove_peer(&mut self, peer_id: u16) {
        self.connected_peers.retain(|peer| peer.id != peer_id);
    }

    /// Update peer status
    pub fn update_peer_status(&mut self, peer_id: u16, status: PeerStatus) {
        let current_timestamp = self.get_current_timestamp();
        if let Some(peer) = self.connected_peers.iter_mut().find(|p| p.id == peer_id) {
            peer.status = status;
            peer.last_seen = current_timestamp;
        }
    }

    /// Set auto-sync mode
    pub fn set_auto_sync(&mut self, enabled: bool) {
        self.auto_sync = enabled;
    }

    /// Set conflict resolution strategy
    pub fn set_conflict_resolution(&mut self, strategy: ConflictResolutionStrategy) {
        self.conflict_resolution = strategy;
    }

    /// Get author ID
    pub fn get_author_id(&self) -> u16 {
        self.author_id
    }

    /// Get Lamport clock
    pub fn get_lamport_clock(&self) -> u64 {
        self.lamport_clock
    }

    /// Create path operation
    pub fn create_path(&mut self, path_record: PathRecord) -> u64 {
        let payload = self.serialize_path_record(&path_record);
        self.add_operation(CRDOpType::CreatePath, payload)
    }

    /// Update path operation
    pub fn update_path(&mut self, path_id: u64, path_record: PathRecord) -> u64 {
        let payload = self.serialize_path_update(path_id, &path_record);
        self.add_operation(CRDOpType::UpdatePath, payload)
    }

    /// Delete path operation
    pub fn delete_path(&mut self, path_id: u64) -> u64 {
        let payload = self.serialize_path_id(path_id);
        self.add_operation(CRDOpType::DeletePath, payload)
    }

    /// Move path operation
    pub fn move_path(&mut self, path_id: u64, translation: [f32; 2]) -> u64 {
        let payload = self.serialize_move_data(path_id, translation);
        self.add_operation(CRDOpType::MovePath, payload)
    }

    /// Update style operation
    pub fn update_style(&mut self, path_id: u64, style: PathStyle) -> u64 {
        let payload = self.serialize_style_update(path_id, &style);
        self.add_operation(CRDOpType::UpdateStyle, payload)
    }

    /// Update metadata operation
    pub fn update_metadata(&mut self, key: String, value: String) -> u64 {
        let payload = self.serialize_metadata_update(&key, &value);
        self.add_operation(CRDOpType::UpdateMetadata, payload)
    }

    /// Batch operations
    pub fn batch_operations(&mut self, operations: Vec<CRDTOperation>) -> u64 {
        let payload = self.serialize_batch(&operations);
        self.add_operation(CRDOpType::Batch, payload)
    }

    /// Serialization methods
    fn serialize_path_record(&self, path_record: &PathRecord) -> Vec<u8> {
        // Simple serialization - in a real implementation, you'd use proper serialization
        let mut data = Vec::new();
        data.extend_from_slice(&path_record.data);
        data
    }

    fn deserialize_path_record(&self, data: &[u8]) -> anyhow::Result<PathRecord> {
        // Simple deserialization
        Ok(PathRecord {
            data: data.to_vec(),
            tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0], // Identity transform
            style: PathStyle::default(),
            original_svg: None,
            layer_id: None,
        })
    }

    fn serialize_path_update(&self, path_id: u64, path_record: &PathRecord) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(&path_id.to_le_bytes());
        data.extend_from_slice(&path_record.data);
        data
    }

    fn deserialize_path_update(&self, data: &[u8]) -> anyhow::Result<(u64, PathRecord)> {
        if data.len() < 8 {
            return Err(anyhow::anyhow!("Invalid path update data"));
        }
        
        let path_id = u64::from_le_bytes([data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7]]);
        let path_data = data[8..].to_vec();
        
        Ok((path_id, PathRecord {
            data: path_data,
            tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0], // Identity transform
            style: PathStyle::default(),
            original_svg: None,
            layer_id: None,
        }))
    }

    fn serialize_path_id(&self, path_id: u64) -> Vec<u8> {
        path_id.to_le_bytes().to_vec()
    }

    fn deserialize_path_id(&self, data: &[u8]) -> anyhow::Result<u64> {
        if data.len() != 8 {
            return Err(anyhow::anyhow!("Invalid path ID data"));
        }
        
        Ok(u64::from_le_bytes([data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7]]))
    }

    fn serialize_move_data(&self, path_id: u64, translation: [f32; 2]) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(&path_id.to_le_bytes());
        data.extend_from_slice(&translation[0].to_le_bytes());
        data.extend_from_slice(&translation[1].to_le_bytes());
        data
    }

    fn deserialize_move_data(&self, data: &[u8]) -> anyhow::Result<(u64, [f32; 2])> {
        if data.len() != 16 {
            return Err(anyhow::anyhow!("Invalid move data"));
        }
        
        let path_id = u64::from_le_bytes([data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7]]);
        let x = f32::from_le_bytes([data[8], data[9], data[10], data[11]]);
        let y = f32::from_le_bytes([data[12], data[13], data[14], data[15]]);
        
        Ok((path_id, [x, y]))
    }

    fn serialize_style_update(&self, path_id: u64, _style: &PathStyle) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(&path_id.to_le_bytes());
        // In a real implementation, you'd serialize the style properly
        data
    }

    fn deserialize_style_update(&self, data: &[u8]) -> anyhow::Result<(u64, PathStyle)> {
        if data.len() < 8 {
            return Err(anyhow::anyhow!("Invalid style update data"));
        }
        
        let path_id = u64::from_le_bytes([data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7]]);
        
        Ok((path_id, PathStyle::default()))
    }

    fn serialize_metadata_update(&self, key: &str, value: &str) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(&(key.len() as u32).to_le_bytes());
        data.extend_from_slice(key.as_bytes());
        data.extend_from_slice(&(value.len() as u32).to_le_bytes());
        data.extend_from_slice(value.as_bytes());
        data
    }

    fn deserialize_metadata_update(&self, data: &[u8]) -> anyhow::Result<(String, String)> {
        if data.len() < 8 {
            return Err(anyhow::anyhow!("Invalid metadata update data"));
        }
        
        let key_len = u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;
        let value_len = u32::from_le_bytes([data[4], data[5], data[6], data[7]]) as usize;
        
        if data.len() < 8 + key_len + value_len {
            return Err(anyhow::anyhow!("Invalid metadata update data length"));
        }
        
        let key = String::from_utf8(data[8..8 + key_len].to_vec())?;
        let value = String::from_utf8(data[8 + key_len..8 + key_len + value_len].to_vec())?;
        
        Ok((key, value))
    }

    fn serialize_batch(&self, operations: &[CRDTOperation]) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(&(operations.len() as u32).to_le_bytes());
        
        for operation in operations {
            // Serialize each operation
            data.extend_from_slice(&operation.id.to_le_bytes());
            data.extend_from_slice(&[(operation.operation_type as u8)]);
            data.extend_from_slice(&(operation.payload.len() as u32).to_le_bytes());
            data.extend_from_slice(&operation.payload);
        }
        
        data
    }

    fn deserialize_batch(&self, data: &[u8]) -> anyhow::Result<Vec<CRDTOperation>> {
        if data.len() < 4 {
            return Err(anyhow::anyhow!("Invalid batch data"));
        }
        
        let operation_count = u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;
        let mut operations = Vec::new();
        let mut offset = 4;
        
        for _ in 0..operation_count {
            if offset + 12 > data.len() {
                return Err(anyhow::anyhow!("Invalid batch data length"));
            }
            
            let operation_id = u64::from_le_bytes([
                data[offset], data[offset + 1], data[offset + 2], data[offset + 3],
                data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7],
            ]);
            let operation_type = data[offset + 8];
            let payload_len = u32::from_le_bytes([data[offset + 9], data[offset + 10], data[offset + 11], data[offset + 12]]) as usize;
            
            offset += 13;
            
            if offset + payload_len > data.len() {
                return Err(anyhow::anyhow!("Invalid batch payload length"));
            }
            
            let payload = data[offset..offset + payload_len].to_vec();
            offset += payload_len;
            
            // Create operation (simplified)
            let operation = CRDTOperation {
                id: operation_id,
                author_id: 0, // Would be set properly in real implementation
                lamport_timestamp: 0, // Would be set properly in real implementation
                operation_type: match operation_type {
                    0x01 => CRDOpType::CreatePath,
                    0x02 => CRDOpType::UpdatePath,
                    0x03 => CRDOpType::DeletePath,
                    0x04 => CRDOpType::MovePath,
                    0x05 => CRDOpType::UpdateStyle,
                    0x06 => CRDOpType::UpdateMetadata,
                    0x07 => CRDOpType::Batch,
                    _ => return Err(anyhow::anyhow!("Unknown operation type")),
                },
                payload,
                dependencies: Vec::new(),
                timestamp: 0, // Would be set properly in real implementation
            };
            
            operations.push(operation);
        }
        
        Ok(operations)
    }

    /// Translate path by given offset
    fn translate_path(&self, path_record: &mut PathRecord, translation: [f32; 2]) {
        // Parse the path data and apply translation to each point
        let data = &mut path_record.data;
        if data.len() < 8 { // Need at least 2 f32 values (x, y)
            return;
        }
        
        let mut offset = 0;
        while offset + 7 < data.len() {
            let x = f32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
            let y = f32::from_le_bytes([data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]]);
            
            // Apply translation
            let new_x = x + translation[0];
            let new_y = y + translation[1];
            
            // Write back translated coordinates
            let x_bytes = new_x.to_le_bytes();
            let y_bytes = new_y.to_le_bytes();
            
            data[offset..offset + 4].copy_from_slice(&x_bytes);
            data[offset + 4..offset + 8].copy_from_slice(&y_bytes);
            
            offset += 8;
        }
    }

    /// Static version of translate_path to avoid borrow checker issues
    fn translate_path_static(path_record: &mut PathRecord, translation: [f32; 2]) {
        // Parse the path data and apply translation to each point
        let data = &mut path_record.data;
        if data.len() < 8 { // Need at least 2 f32 values (x, y)
            return;
        }
        
        let mut offset = 0;
        while offset + 7 < data.len() {
            let x = f32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
            let y = f32::from_le_bytes([data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]]);
            
            // Apply translation
            let new_x = x + translation[0];
            let new_y = y + translation[1];
            
            // Write back translated coordinates
            let x_bytes = new_x.to_le_bytes();
            let y_bytes = new_y.to_le_bytes();
            
            data[offset..offset + 4].copy_from_slice(&x_bytes);
            data[offset + 4..offset + 8].copy_from_slice(&y_bytes);
            
            offset += 8;
        }
    }

    /// Get memory usage
    pub fn get_memory_usage(&self) -> usize {
        let mut total = 0;
        
        // Document state memory
        total += self.document_state.paths.len() * std::mem::size_of::<CRDTPath>();
        total += self.document_state.metadata.len() * std::mem::size_of::<(String, String)>();
        
        // Operation log memory
        total += self.operation_log.len() * std::mem::size_of::<CRDTOperation>();
        
        // Pending operations memory
        total += self.pending_operations.len() * std::mem::size_of::<(u64, CRDTOperation)>();
        
        // Connected peers memory
        total += self.connected_peers.len() * std::mem::size_of::<PeerInfo>();
        
        total
    }

    /// Clear operation log
    pub fn clear_operation_log(&mut self) {
        self.operation_log.clear();
        self.pending_operations.clear();
    }

    /// Reset to initial state
    pub fn reset(&mut self) {
        self.lamport_clock = 0;
        self.document_state = DocumentState {
            paths: HashMap::new(),
            metadata: HashMap::new(),
            version: 0,
            last_modified: 0,
        };
        self.operation_log.clear();
        self.pending_operations.clear();
        self.connected_peers.clear();
    }
}

impl Default for CRDTEngine {
    fn default() -> Self {
        Self::new(1)
    }
}

/// Last-Write-Wins Register for simple properties
#[derive(Clone, Debug)]
pub struct LWWRegister<T> {
    pub value: T,
    pub timestamp: u64,
    pub author_id: u16,
}

impl<T: Clone> LWWRegister<T> {
    /// Create new LWW register
    pub fn new(value: T, timestamp: u64, author_id: u16) -> Self {
        Self { value, timestamp, author_id }
    }

    /// Merge with another LWW register
    pub fn merge(&mut self, other: Self) -> bool {
        if other.timestamp > self.timestamp {
            self.value = other.value;
            self.timestamp = other.timestamp;
            self.author_id = other.author_id;
            true
        } else if other.timestamp == self.timestamp {
            // Use author_id as tie-breaker
            if other.author_id > self.author_id {
                self.value = other.value;
                self.author_id = other.author_id;
                true
            } else {
                false
            }
        } else {
            false
        }
    }

    /// Get current value
    pub fn get(&self) -> &T {
        &self.value
    }

    /// Set new value with timestamp
    pub fn set(&mut self, value: T, timestamp: u64, author_id: u16) {
        if timestamp > self.timestamp || (timestamp == self.timestamp && author_id > self.author_id) {
            self.value = value;
            self.timestamp = timestamp;
            self.author_id = author_id;
        }
    }
}

/// Replicated Growable Array for ordered sequences
#[derive(Clone, Debug)]
pub struct RGASequence<T> {
    elements: Vec<RGAElement<T>>,
    max_id: u64,
}

#[derive(Clone, Debug)]
struct RGAElement<T> {
    id: u64,
    value: T,
    timestamp: u64,
    author_id: u16,
    deleted: bool,
    after: Option<u64>, // ID of the element this comes after
}

impl<T: Clone> RGASequence<T> {
    /// Create new RGA sequence
    pub fn new() -> Self {
        Self {
            elements: Vec::new(),
            max_id: 0,
        }
    }

    /// Insert element at position
    pub fn insert(&mut self, position: usize, value: T, timestamp: u64, author_id: u16) -> u64 {
        self.max_id += 1;
        let element_id = self.max_id;
        
        let after = if position == 0 {
            None
        } else if position > 0 && position <= self.visible_count() {
            let visible_elements: Vec<&RGAElement<T>> = self.elements.iter()
                .filter(|e| !e.deleted)
                .collect();
            if position - 1 < visible_elements.len() {
                Some(visible_elements[position - 1].id)
            } else {
                None
            }
        } else {
            None
        };

        let element = RGAElement {
            id: element_id,
            value,
            timestamp,
            author_id,
            deleted: false,
            after,
        };

        // Find insertion point based on causal ordering
        let insertion_index = self.find_insertion_index(&element);
        self.elements.insert(insertion_index, element);
        
        element_id
    }

    /// Delete element by ID
    pub fn delete(&mut self, element_id: u64, timestamp: u64) -> bool {
        if let Some(element) = self.elements.iter_mut().find(|e| e.id == element_id) {
            if timestamp >= element.timestamp {
                element.deleted = true;
                element.timestamp = timestamp;
                return true;
            }
        }
        false
    }

    /// Get visible elements (not deleted)
    pub fn get_visible(&self) -> Vec<&T> {
        self.elements.iter()
            .filter(|e| !e.deleted)
            .map(|e| &e.value)
            .collect()
    }

    /// Get element count (visible only)
    pub fn visible_count(&self) -> usize {
        self.elements.iter().filter(|e| !e.deleted).count()
    }

    /// Merge with another RGA sequence
    pub fn merge(&mut self, other: &Self) {
        for element in &other.elements {
            if !self.elements.iter().any(|e| e.id == element.id) {
                let insertion_index = self.find_insertion_index(element);
                self.elements.insert(insertion_index, element.clone());
            } else {
                // Update existing element if newer
                if let Some(existing) = self.elements.iter_mut().find(|e| e.id == element.id) {
                    if element.timestamp > existing.timestamp {
                        existing.deleted = element.deleted;
                        existing.timestamp = element.timestamp;
                    }
                }
            }
        }
        self.max_id = self.max_id.max(other.max_id);
    }

    /// Find proper insertion index for element based on causal ordering
    fn find_insertion_index(&self, _element: &RGAElement<T>) -> usize {
        // Simple insertion at end for now
        // In a full implementation, this would respect the causal ordering
        self.elements.len()
    }
}

/// Add-Wins Set for collections of unique items
#[derive(Clone, Debug)]
pub struct AWSet<T: Clone + Eq + std::hash::Hash> {
    elements: std::collections::HashSet<(T, u64, u16)>, // (value, timestamp, author_id)
}

impl<T: Clone + Eq + std::hash::Hash> AWSet<T> {
    /// Create new AW-Set
    pub fn new() -> Self {
        Self {
            elements: std::collections::HashSet::new(),
        }
    }

    /// Add element to set
    pub fn add(&mut self, item: T, timestamp: u64, author_id: u16) {
        self.elements.insert((item, timestamp, author_id));
    }

    /// Check if set contains element
    pub fn contains(&self, item: &T) -> bool {
        self.elements.iter().any(|(val, _, _)| val == item)
    }

    /// Get all unique values in set
    pub fn get_values(&self) -> Vec<&T> {
        let mut seen = std::collections::HashSet::new();
        let mut result = Vec::new();
        
        for (value, _, _) in &self.elements {
            if seen.insert(value) {
                result.push(value);
            }
        }
        
        result
    }

    /// Merge with another AW-Set
    pub fn merge(&mut self, other: &Self) {
        for element in &other.elements {
            self.elements.insert(element.clone());
        }
    }
}

/// Network synchronization manager for CRDT operations
#[derive(Clone)]
pub struct NetworkSyncManager {
    engine: Box<CRDTEngine>,
    connection_status: ConnectionStatus,
    pending_sync: Vec<CRDTOperation>,
    last_sync_timestamp: u64,
    sync_interval: u64,
}

#[derive(Clone, Debug)]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Syncing,
    Error(String),
}

impl NetworkSyncManager {
    /// Create new network sync manager
    pub fn new(author_id: u16) -> Self {
        Self {
            engine: Box::new(CRDTEngine::new(author_id)),
            connection_status: ConnectionStatus::Disconnected,
            pending_sync: Vec::new(),
            last_sync_timestamp: 0,
            sync_interval: 1000, // 1 second
        }
    }

    /// Add operation for sync
    pub fn add_operation(&mut self, operation_type: CRDOpType, payload: Vec<u8>) -> u64 {
        let operation_id = self.engine.add_operation(operation_type, payload);
        
        // If connected, add to pending sync
        if matches!(self.connection_status, ConnectionStatus::Connected) {
            if let Some(operation) = self.engine.pending_operations.get(&operation_id) {
                self.pending_sync.push(operation.clone());
            }
        }
        
        operation_id
    }

    /// Process incoming operations from network
    pub fn process_incoming_operations(&mut self, operations: Vec<CRDTOperation>) -> anyhow::Result<()> {
        self.engine.merge_operations(&operations)
    }

    /// Get operations to send to network
    pub fn get_operations_for_sync(&mut self) -> Vec<CRDTOperation> {
        let operations = self.pending_sync.clone();
        self.pending_sync.clear();
        operations
    }

    /// Update connection status
    pub fn set_connection_status(&mut self, status: ConnectionStatus) {
        self.connection_status = status;
    }

    /// Get connection status
    pub fn get_connection_status(&self) -> &ConnectionStatus {
        &self.connection_status
    }

    /// Check if sync is needed
    pub fn needs_sync(&self) -> bool {
        !self.pending_sync.is_empty() || 
        (self.engine.get_current_timestamp() - self.last_sync_timestamp > self.sync_interval)
    }

    /// Mark sync complete
    pub fn mark_sync_complete(&mut self) {
        self.last_sync_timestamp = self.engine.get_current_timestamp();
    }

    /// Get CRDT engine reference
    pub fn engine(&self) -> &CRDTEngine {
        &self.engine
    }

    /// Get mutable CRDT engine reference
    pub fn engine_mut(&mut self) -> &mut CRDTEngine {
        &mut self.engine
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lww_register() {
        let mut reg1 = LWWRegister::new("value1".to_string(), 100, 1);
        let reg2 = LWWRegister::new("value2".to_string(), 200, 2);
        
        // Should merge because reg2 has higher timestamp
        assert!(reg1.merge(reg2));
        assert_eq!(reg1.get(), "value2");
        
        // Should not merge because timestamp is older
        let reg3 = LWWRegister::new("value3".to_string(), 50, 3);
        assert!(!reg1.merge(reg3));
        assert_eq!(reg1.get(), "value2");
    }

    #[test]
    fn test_rga_sequence() {
        let mut rga = RGASequence::new();
        
        // Insert elements
        let _id1 = rga.insert(0, "A".to_string(), 100, 1);
        let id2 = rga.insert(1, "B".to_string(), 120, 1);
        let _id3 = rga.insert(1, "C".to_string(), 150, 1);
        
        // Should have ABC order (insertion order preserved)
        let visible = rga.get_visible();
        assert_eq!(visible.len(), 3);
        
        // Delete middle element
        assert!(rga.delete(id2, 300));
        let visible = rga.get_visible();
        assert_eq!(visible.len(), 2);
    }

    #[test]
    fn test_aw_set() {
        let mut set1 = AWSet::new();
        let mut set2 = AWSet::new();
        
        set1.add("item1".to_string(), 100, 1);
        set1.add("item2".to_string(), 200, 1);
        
        set2.add("item2".to_string(), 150, 2);
        set2.add("item3".to_string(), 250, 2);
        
        // Merge sets
        set1.merge(&set2);
        
        // Should contain all unique items
        assert!(set1.contains(&"item1".to_string()));
        assert!(set1.contains(&"item2".to_string()));
        assert!(set1.contains(&"item3".to_string()));
        
        let values = set1.get_values();
        assert_eq!(values.len(), 3);
    }

    #[test]
    fn test_crdt_engine_basic_operations() {
        let mut engine = CRDTEngine::new(1);
        
        // Create a path
        let path_record = PathRecord {
            data: vec![1, 2, 3],
            tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            style: PathStyle::default(),
            original_svg: None,
            layer_id: None,
        };
        
        let path_id = engine.create_path(path_record);
        
        // Check that path was created
        let paths = engine.get_active_paths();
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0].id, path_id);
        
        // Delete the path
        engine.delete_path(path_id);
        
        // Path should be marked as deleted
        let document_state = engine.get_document_state();
        let crdt_path = document_state.paths.get(&path_id).unwrap();
        assert!(crdt_path.deleted);
        
        // Active paths should be empty
        let active_paths = engine.get_active_paths();
        assert_eq!(active_paths.len(), 0);
    }

    #[test]
    fn test_network_sync_manager() {
        let mut sync_manager = NetworkSyncManager::new(1);
        
        // Should start disconnected
        assert!(matches!(sync_manager.get_connection_status(), ConnectionStatus::Disconnected));
        
        // Connect
        sync_manager.set_connection_status(ConnectionStatus::Connected);
        
        // Add operation
        let operation_id = sync_manager.add_operation(CRDOpType::CreatePath, vec![1, 2, 3]);
        assert!(operation_id > 0);
        
        // Should have operations to sync
        assert!(sync_manager.needs_sync());
        
        let operations = sync_manager.get_operations_for_sync();
        assert_eq!(operations.len(), 1);
    }

    #[test]
    fn test_conflict_resolution() {
        let mut engine = CRDTEngine::new(1);
        
        // Create path
        let path_record = PathRecord {
            data: vec![1, 2, 3],
            tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            style: PathStyle::default(),
            original_svg: None,
            layer_id: None,
        };
        
        let path_id = engine.create_path(path_record.clone());
        
        // Simulate conflicting update from another author
        let remote_operation = CRDTOperation {
            id: path_id,
            author_id: 2,
            lamport_timestamp: engine.get_lamport_clock() + 10, // Higher timestamp
            operation_type: CRDOpType::UpdatePath,
            payload: engine.serialize_path_update(path_id, &PathRecord {
                data: vec![4, 5, 6], // Different data
                tf: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
                style: PathStyle::default(),
                original_svg: None,
                layer_id: None,
            }),
            dependencies: Vec::new(),
            timestamp: engine.get_current_timestamp() + 100,
        };
        
        // Apply remote operation (should win due to higher timestamp)
        let operations = vec![remote_operation];
        engine.merge_operations(&operations).unwrap();
        
        // Check that remote change won
        let document_state = engine.get_document_state();
        let updated_path = document_state.paths.get(&path_id).unwrap();
        assert_eq!(updated_path.path_data.data, vec![4, 5, 6]);
    }
}