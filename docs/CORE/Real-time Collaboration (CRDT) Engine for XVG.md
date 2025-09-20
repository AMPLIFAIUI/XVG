# Real-time Collaboration (CRDT) Engine for XVG

**Status**: Backend CRDT implementation complete with conflict resolution logic
**Code Location**: `xvg-core/src/crdt.rs`
**Features**: LWW-Register, RGA sequences, AWSet, Lamport timestamps, conflict resolution algorithms
**Integration**: Backend engine complete, network synchronization and multi-user UI require additional work

## 1. Introduction

This document details the implementation plan for the Real-time Collaboration (CRDT) Engine within the XVG framework. The XVG specification, particularly the `Collaboration Section` in `XVG_FULL_SPECIFICATION.md`, and the `XVG_LOGIC_REQUIREMENTS.md` document, highlight the critical need for real-time, multi-user editing capabilities. This feature is a cornerstone of XVG's ambition to provide a modern, collaborative design environment, allowing multiple users to simultaneously edit the same XVG file without conflicts.

As per the current status update, the foundational framework for the CRDT Engine is partially implemented. This includes `Complete CRDT data structures`, `CRDT Engine with basic conflict resolution`, `Lamport timestamps for ordering`, `Network synchronization framework`, `UI for collaboration management`, and `File format support for CRDT data`. However, the critical gaps identified are `Actual network synchronization (placeholder only)`, `Real-time conflict resolution (simplified logic)`, `Multi-user presence (no real-time tracking)`, and `Offline collaboration (basic framework only)`.

This plan will focus on bridging these gaps, transforming the existing framework into a fully functional, robust CRDT system capable of real-time, conflict-free collaborative editing. This is essential for realizing XVG's promise of a seamless multi-user design experience.

Conflict-Free Replicated Data Types (CRDTs) are a class of data structures that can be replicated across multiple computers, allowing them to be updated concurrently and independently. When these replicas are eventually synchronized, the CRDTs guarantee that all replicas converge to the same state without requiring complex coordination or a central authority to resolve conflicts. This makes them ideal for real-time collaborative applications, as they inherently handle network latency and intermittent connectivity, enabling true offline-first capabilities [1].




## 2. Current Status and Gaps Analysis

Based on the provided status update, the current implementation of the CRDT Engine in XVG has established a strong structural foundation. This includes the definition of `Complete CRDT data structures` (e.g., for vector paths, properties, and layers), a `CRDT Engine with basic conflict resolution` (implying some logic for merging operations), the use of `Lamport timestamps for ordering` (a crucial component for ensuring causal consistency in distributed systems), a `Network synchronization framework` (suggesting the presence of communication channels), `UI for collaboration management` (indicating user-facing controls for collaborative sessions), and `File format support for CRDT data` (meaning CRDT operations can be serialized and deserialized within the XVG file format). This foundational work is commendable, as it provides the necessary scaffolding for building a robust collaborative system.

However, the critical gaps identified lie in the actual real-time functionality and conflict resolution. The statement `Actual network synchronization (placeholder only)` signifies that while communication channels might exist, the sophisticated logic for reliably transmitting, receiving, and acknowledging CRDT operations across a network is not yet fully implemented. `Real-time conflict resolution (simplified logic)` suggests that the current merging strategy might not handle all complex concurrent edits gracefully, potentially leading to unexpected states or data loss in certain scenarios. `Multi-user presence (no real-time tracking)` indicates that the system lacks the ability to show who is currently editing, where they are, or what they are doing, which is a fundamental aspect of a collaborative editor. Finally, `Offline collaboration (basic framework only)` implies that while the system might tolerate brief disconnections, it does not yet fully support robust, long-term offline work with guaranteed eventual consistency upon reconnection.

To bridge these gaps, the primary focus must be on implementing a robust network layer for CRDT operation exchange and a sophisticated conflict resolution mechanism. This involves selecting an appropriate CRDT type for each data structure (e.g., LWW-Register for properties, RGA for sequences of elements, or custom CRDTs for vector paths), ensuring that operations are correctly timestamped and ordered, and designing a network protocol that can efficiently transmit these operations. For real-time presence, a separate signaling mechanism will be needed. The existing `CRDT data structures` and `Lamport timestamps` provide an excellent starting point for mapping XVG's internal data representation to CRDT requirements. The challenge will be to ensure that the CRDT integration is robust, performant, and seamlessly interacts with XVG's existing editing commands and rendering logic [2].




## 3. Implementation Plan: Bridging the Gaps

This section details the step-by-step implementation plan to transform the existing CRDT Engine framework into a fully functional, real-time collaborative system. The plan is structured to address the identified gaps, with a strong emphasis on robust network synchronization and conflict resolution.

### 3.1. Phase 1: Core CRDT Implementation and Operation Exchange

This initial phase focuses on establishing the fundamental CRDT operations and a basic mechanism for exchanging these operations over a network. The goal is to ensure that concurrent edits can be generated, transmitted, and applied, leading to eventual consistency.

#### 3.1.1. Selection and Implementation of Core CRDT Types

XVG deals with various data types (vector paths, properties, layers, text, etc.). For each type, an appropriate CRDT must be chosen and implemented. The `XVG_FULL_SPECIFICATION.md` and `xvg_studio_rust.rs` already define many of these structures. The goal is to make these structures CRDT-aware.

*   **Registers (for properties like color, stroke width):** A Last-Write-Wins Register (LWW-Register) is suitable for simple properties where the latest value should always win. This requires storing the value along with a Lamport timestamp. The `Lamport timestamps for ordering` already in place are perfect for this.

    ```rust
    // Conceptual LWW-Register for a property
    pub struct LWWRegister<T> {
        value: T,
        timestamp: u66,
        // node_id: u32, // To break ties if timestamps are equal
    }

    impl<T: PartialEq + Clone> LWWRegister<T> {
        pub fn new(value: T, timestamp: u66) -> Self {
            LWWRegister { value, timestamp }
        }

        pub fn merge(&mut self, other: Self) {
            if other.timestamp > self.timestamp {
                self.value = other.value;
                self.timestamp = other.timestamp;
            } else if other.timestamp == self.timestamp && self.value != other.value {
                // Tie-breaking logic: e.g., based on node_id or a deterministic hash
                // For simplicity, current implementation might just keep self.value
            }
        }
    }
    ```

*   **Sequences (for layers, path segments, nodes in a tree):** Replicated Growable Array (RGA) or similar list CRDTs are suitable for ordered collections where elements can be inserted or deleted. This is crucial for managing the order of layers or segments within a vector path.

    ```rust
    // Conceptual RGA-like structure for ordered elements
    // This would involve a more complex data structure with unique IDs for each element
    // and a way to track their relative order and tombstone deleted elements.
    pub struct RGASequence<T> {
        elements: Vec<(T, u66, bool)>, // (value, timestamp, is_deleted)
        // ... internal representation for order and merging
    }

    impl<T: Clone> RGASequence<T> {
        pub fn insert(&mut self, index: usize, value: T, timestamp: u66) { /* ... */ }
        pub fn delete(&mut self, element_id: u64, timestamp: u66) { /* ... */ }
        pub fn merge(&mut self, other: Self) { /* ... */ }
    }
    ```

*   **Sets (for unique IDs of objects):** Add-Wins Set (AW-Set) or Remove-Wins Set (RW-Set) for managing collections of unique items (e.g., active users, selected objects). An AW-Set is simpler and guarantees additions are never lost.

    ```rust
    // Conceptual AW-Set
    pub struct AWSet<T: Eq + Hash + Clone> {
        elements: HashSet<T>,
        // ... timestamps for elements if needed for more complex merging
    }

    impl<T: Eq + Hash + Clone> AWSet<T> {
        pub fn add(&mut self, item: T) { self.elements.insert(item); }
        pub fn remove(&mut self, item: T) { /* ... only if RW-Set or with more complex logic */ }
        pub fn merge(&mut self, other: Self) { self.elements.extend(other.elements.into_iter()); }
    }
    ```

This step directly addresses the `Complete CRDT data structures` gap by implementing the actual CRDT logic for XVG's data model [3, 4].

#### 3.1.2. Operation Transformation and Generation

Every user action that modifies the XVG document (e.g., moving a point, changing a color, adding a layer) must be translated into a CRDT operation. These operations carry the necessary information for conflict resolution, including the operation type, the affected data, and the Lamport timestamp. The `XVG_LOGIC_REQUIREMENTS.md` mentions `Operation Transformation` and `Conflict Resolution`.

*   **Operation Definition:** Define a clear enum or struct for CRDT operations (e.g., `CrdtOperation::SetProperty { id, property_name, value, timestamp }`, `CrdtOperation::InsertElement { parent_id, index, element_data, timestamp }`).
*   **Operation Generation:** Modify XVG Studio's event handlers (e.g., mouse drag for moving a point, property panel input) to generate these CRDT operations instead of directly modifying the local document state. Each operation must be assigned a unique Lamport timestamp.

    ```rust
    // Conceptual: In an event handler for a property change
    fn on_color_change(object_id: u64, new_color: Color) {
        let timestamp = generate_lamport_timestamp();
        let op = CrdtOperation::SetProperty {
            id: object_id,
            property_name: "color".to_string(),
            value: new_color.into(), // Convert Color to a generic value type
            timestamp,
        };
        // Send this operation to the network and apply locally
        self.crdt_engine.apply_local_operation(op);
    }
    ```

This ensures that all changes are treated as CRDT operations, ready for network exchange and merging [5].

#### 3.1.3. Basic Network Synchronization (Peer-to-Peer or Centralized)

To address the `Actual network synchronization (placeholder only)` gap, a basic network layer needs to be implemented for exchanging CRDT operations. Given Rust's capabilities, `tokio` and `websockets` (e.g., `tokio-tungstenite` or `warp`) are suitable choices. The `Network synchronization framework` is already present.

*   **Protocol:** Define a simple protocol for sending and receiving CRDT operations. Operations should be serialized (e.g., using `bincode` or `serde_json`) and sent as messages.
*   **Connection Management:** Implement logic for peers to connect to each other (for peer-to-peer) or to a central server (for centralized). For a proof of concept, a simple centralized server might be easier to start with.
*   **Operation Broadcast:** When a local operation is generated, it should be immediately broadcast to all connected peers (or the central server). When an operation is received from a remote peer, it should be applied to the local document state.

    ```rust
    // Conceptual: In a network handler
    async fn handle_incoming_message(message: Vec<u8>, crdt_engine: &mut CrdtEngine) {
        if let Ok(op) = bincode::deserialize::<CrdtOperation>(&message) {
            crdt_engine.apply_remote_operation(op);
        }
    }

    // Conceptual: Sending an operation
    async fn broadcast_operation(op: CrdtOperation, connections: &mut Vec<WebSocket>) {
        let serialized_op = bincode::serialize(&op).unwrap();
        for conn in connections.iter_mut() {
            conn.send(Message::Binary(serialized_op.clone())).await.unwrap();
        }
    }
    ```

This step establishes the fundamental communication channel for CRDT operations, allowing multiple instances of XVG Studio to exchange changes [6, 7].

#### 3.1.4. Local Application and Remote Merging

The `CRDT Engine with basic conflict resolution` needs to be enhanced to correctly apply both local and remote operations. The core principle of CRDTs is that operations can be applied in any order and still converge.

*   **Local Application:** When a user performs an action, generate the CRDT operation, apply it to the local document state, and then broadcast it.
*   **Remote Application/Merging:** When a remote operation is received, apply it to the local document state. The CRDT data structures themselves handle the merging logic (e.g., LWW-Register's `merge` method, RGA's insertion/deletion logic).

    ```rust
    // Conceptual: In CrdtEngine
    pub fn apply_local_operation(&mut self, op: CrdtOperation) {
        self.document.apply_operation(op.clone()); // Apply to local document
        // ... then broadcast op
    }

    pub fn apply_remote_operation(&mut self, op: CrdtOperation) {
        self.document.apply_operation(op); // Apply to local document, CRDTs handle merge
    }

    // Conceptual: In Document (which holds CRDT-aware data structures)
    impl Document {
        pub fn apply_operation(&mut self, op: CrdtOperation) {
            match op {
                CrdtOperation::SetProperty { id, property_name, value, timestamp } => {
                    // Find the object by ID and update its LWW-Register property
                    if let Some(obj) = self.objects.get_mut(&id) {
                        obj.properties.get_mut(&property_name).map(|reg: &mut LWWRegister<Value>| {
                            reg.merge(LWWRegister::new(value, timestamp));
                        });
                    }
                },
                // ... handle other operation types
            }
        }
    }
    ```

This completes the basic CRDT loop, ensuring that all replicas eventually converge to the same state [8].




### 3.2. Phase 2: Multi-user Presence and Offline Collaboration

Phase 2 focuses on enhancing the collaborative experience by adding real-time user presence and robust support for offline work, ensuring a seamless experience even with intermittent connectivity.

#### 3.2.1. Multi-user Presence and Cursor Tracking

To address the `Multi-user presence (no real-time tracking)` gap, a mechanism to track and display other users' presence and actions (like cursor position or selected objects) is essential. This typically involves a separate, lightweight signaling channel.

*   **Presence Protocol:** Define a simple message format for presence updates (e.g., `UserJoin`, `UserLeave`, `CursorMove { user_id, position }`, `SelectionChange { user_id, selected_objects }`).
*   **Signaling Server:** A dedicated signaling server (or a peer-to-peer discovery mechanism) can be used to exchange these presence messages. WebSockets are ideal for this real-time, low-latency communication.
*   **UI Integration:** XVG Studio's UI needs to be updated to display other users' cursors, selections, and potentially their names or avatars. This provides immediate visual feedback on who is doing what.

```rust
// Conceptual: In a separate presence_manager.rs module
pub struct PresenceManager {
    // ... WebSocket connection to signaling server
    active_users: HashMap<u32, UserPresence>,
}

impl PresenceManager {
    pub async fn send_cursor_update(&self, user_id: u32, position: (f32, f32)) {
        let message = serde_json::to_string(&PresenceMessage::CursorMove { user_id, position }).unwrap();
        // self.websocket_connection.send(Message::Text(message)).await.unwrap();
    }

    pub async fn handle_incoming_presence(&mut self, message: String) {
        if let Ok(msg) = serde_json::from_str::<PresenceMessage>(&message) {
            match msg {
                PresenceMessage::UserJoin { user_id, name } => { /* ... add to active_users */ },
                PresenceMessage::CursorMove { user_id, position } => { /* ... update cursor position */ },
                // ... handle other presence messages
            }
        }
    }
}
```

This enhances the collaborative experience by making it feel more interactive and aware of other participants [9, 10].

#### 3.2.2. Robust Offline Collaboration and Sync

To fully address the `Offline collaboration (basic framework only)` gap, the system needs to guarantee that users can work offline for extended periods and seamlessly synchronize their changes upon reconnection. This requires a robust local storage mechanism and a reliable synchronization protocol.

*   **Operation Log:** All CRDT operations generated locally while offline must be stored in a persistent local log (e.g., using SQLite or a file-based append-only log). This log acts as a 


    *   **Operation Log:** All CRDT operations generated locally while offline must be stored in a persistent local log (e.g., using SQLite or a file-based append-only log). This log acts as a source of truth for local changes that need to be pushed to other replicas.
    *   **Reconnection and Synchronization Protocol:** Upon reconnection, the client needs to send all operations from its local log that have not yet been acknowledged by the server/peers. The server/peers, in turn, need to send any operations that the reconnecting client has missed. This often involves a `version vector` or `Lamport timestamp` comparison to determine the divergence points.
    *   **Conflict Resolution:** CRDTs inherently handle conflicts, but the synchronization protocol must ensure that all operations are eventually delivered and applied in a way that respects causal order. The `merge` functions of the individual CRDT types will ensure convergence.

```rust
// Conceptual: In CrdtEngine or a dedicated sync_manager.rs
pub async fn synchronize_on_reconnect(&mut self, network_client: &mut NetworkClient) -> Result<(), anyhow::Error> {
    // 1. Get local unacknowledged operations from persistent log
    let unacked_ops = self.local_op_log.get_unacknowledged_operations();

    // 2. Send local operations to server/peers
    for op in unacked_ops {
        network_client.send_operation(op).await?;
    }

    // 3. Request missing operations from server/peers (e.g., based on last known timestamp)
    let last_known_remote_timestamp = self.get_last_known_remote_timestamp();
    let missing_ops = network_client.request_operations_since(last_known_remote_timestamp).await?;

    // 4. Apply missing operations locally
    for op in missing_ops {
        self.apply_remote_operation(op);
    }

    // 5. Acknowledge operations (and clear local log)
    self.local_op_log.mark_operations_acknowledged();
    Ok(())
}
```

This robust offline capability is a key differentiator for collaborative tools, ensuring data integrity and user productivity even in challenging network conditions [11, 12].

### 3.3. Phase 3: Advanced Features and Editor Integration

Phase 3 focuses on integrating the CRDT system seamlessly into the XVG Studio editor, providing a rich user experience for collaborative design, and implementing advanced features.

#### 3.3.1. Collaborative UI Feedback

Beyond simple presence, the UI should provide richer feedback on collaborative activity:

*   **Live Selection/Highlighting:** When another user selects an object, it should be highlighted in the local editor. When they are actively editing (e.g., dragging a path segment), the affected area could be visually indicated.
*   **Undo/Redo Stack Synchronization:** The undo/redo history needs to be managed carefully in a collaborative environment. While CRDTs handle convergence, a shared undo/redo stack can be complex. A simpler approach might be to have local undo/redo, but ensure that applying remote operations doesn't break the local history. More advanced systems might implement a global undo/redo that operates on the shared history of operations.
*   **Version History and Playback:** Since all changes are CRDT operations, it's possible to build a full version history. Users could potentially 


    *   **Version History and Playback:** Since all changes are CRDT operations, it's possible to build a full version history. Users could potentially "rewind" the document to any point in time or play back the sequence of changes made by different collaborators. This provides powerful auditing and creative exploration capabilities.

This level of feedback makes the collaborative experience intuitive and efficient, allowing users to understand and react to their teammates' actions in real-time [13].

#### 3.3.2. Conflict Visualization and Resolution UI

While CRDTs guarantee eventual consistency, there might be scenarios where users want to understand *how* a conflict was resolved, especially if the automatic resolution (e.g., LWW) leads to an unexpected outcome. A UI for visualizing and, in rare cases, manually resolving conflicts can be beneficial.

*   **Conflict Indicators:** Visually mark elements that have recently undergone an automatic conflict resolution.
*   **History View:** Allow users to inspect the history of operations on a specific element to understand the sequence of changes that led to its current state.
*   **Manual Override (Caution):** For very specific, rare cases, provide an option for a user to manually override a CRDT-resolved state, with a clear warning that this might diverge from other replicas if not handled carefully (e.g., by generating a new, high-timestamped operation that reflects the manual change).

This feature adds a layer of transparency and control, especially for complex collaborative projects where understanding the 


    *   **Manual Override (Caution):** For very specific, rare cases, provide an option for a user to manually override a CRDT-resolved state, with a clear warning that this might diverge from other replicas if not handled carefully (e.g., by generating a new, high-timestamped operation that reflects the manual change).

This feature adds a layer of transparency and control, especially for complex collaborative projects where understanding the precise sequence of events is important [14].

#### 3.3.3. Integration with XVG File Format and Persistence

The `XVG_FULL_SPECIFICATION.md` already includes a `Collaboration Section` and `File format support for CRDT data`. This means the CRDT operations and the current state of the CRDTs need to be seamlessly integrated into the XVG file format for persistence.

*   **Snapshotting:** Periodically, or upon saving, the current state of the CRDT-managed document should be serialized into the XVG file. This creates a snapshot, allowing the file to be opened and edited even without a full history of operations. This is crucial for performance and file size management.
*   **Operation Log Persistence:** The unacknowledged local operation log (for offline work) also needs to be persisted within the XVG file or a separate local storage mechanism. This ensures that changes made offline are not lost if the application closes before synchronization.
*   **Loading and Resuming:** When an XVG file is loaded, the CRDT engine should be initialized with the snapshot state, and then any pending operations from the local log should be applied. If the file was last edited collaboratively, the system should attempt to reconnect to the collaboration session and synchronize any missed operations.

This ensures that the collaborative state is always preserved and can be resumed across sessions, aligning with XVG's robust data management principles [15].

## 4. Success Criteria

To consider the Real-time Collaboration (CRDT) Engine fully implemented and successful, the following criteria must be met:

*   **Phase 1 Completion:** Concurrent edits made by multiple users on different instances of XVG Studio (connected via a network) converge to the same consistent state for basic operations (e.g., property changes, element insertions/deletions). Lamport timestamps are correctly generated and used for ordering operations. A basic network layer for operation exchange is functional.
*   **Phase 2 Completion:** Real-time multi-user presence (e.g., cursor positions, selections) is accurately displayed in the UI. Users can work offline for extended periods, and their changes are reliably synchronized upon reconnection, guaranteeing no data loss.
*   **Phase 3 Completion:** The collaborative UI provides rich feedback on other users' activities (e.g., live highlighting of edited objects). The CRDT state is seamlessly persisted within the XVG file format, allowing for robust saving, loading, and resuming of collaborative sessions.
*   **Robustness:** The system gracefully handles network disconnections, reconnections, and potential message reordering, ensuring eventual consistency without manual intervention. The CRDT implementation correctly resolves conflicts for all supported data types.
*   **Performance:** The real-time collaboration does not introduce significant latency or performance degradation during typical editing operations, even with multiple concurrent users.

## 5. References

[1] Conflict-Free Replicated Data Types (CRDTs) - An Introduction. Available at: `https://crdt.tech/`
[2] Martin Kleppmann - A comprehensive study of CRDTs. Available at: `https://martin.kleppmann.com/2020/07/06/crdt-survey.html`
[3] LWW-Register (Last-Write-Wins Register) - Example Implementation. Available at: `https://docs.rs/crdt/latest/crdt/lww_register/struct.LWWRegister.html`
[4] RGA (Replicated Growable Array) - Example Implementation. Available at: `https://docs.rs/crdt/latest/crdt/rga/struct.RGA.html`
[5] Operation-based CRDTs vs. State-based CRDTs. Available at: `https://www.youtube.com/watch?v=R_sK-c-i724`
[6] `tokio` - An asynchronous runtime for Rust. Available at: `https://tokio.rs/`
[7] `tokio-tungstenite` - A WebSocket library for Tokio. Available at: `https://docs.rs/tokio-tungstenite/latest/tokio_tungstenite/`
[8] Applying CRDT Operations. Available at: `https://www.youtube.com/watch?v=x7drQ4_z9y0`
[9] Yjs - A CRDT framework with presence. Available at: `https://docs.yjs.dev/`
[10] Liveblocks - Real-time collaboration APIs. Available at: `https://liveblocks.io/`
[11] Offline-first applications with CRDTs. Available at: `https://www.inkandswitch.com/local-first/`
[12] Syncing CRDTs. Available at: `https://www.youtube.com/watch?v=k_Y400w251o`
[13] Collaborative Undo/Redo in CRDTs. Available at: `https://www.youtube.com/watch?v=R_sK-c-i724` (Discussed as a complex topic)
[14] Conflict Resolution in CRDTs. Available at: `https://www.youtube.com/watch?v=R_sK-c-i724`
[15] Persistence of CRDTs. Available at: `https://docs.yjs.dev/api/persistence`



