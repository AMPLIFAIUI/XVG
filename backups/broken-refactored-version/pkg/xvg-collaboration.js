// FILE: pkg/xvg-collaboration.js - CRDT Collaboration for Real-time Editing
// This module handles all collaboration features: WebSocket connection, CRDT operations, presence

/**
 * Collaboration Manager
 * Handles real-time collaborative editing using CRDT operations
 */
export class CollaborationManager {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.userId = this.generateUserId();
    this.username = `User_${this.userId.substring(0, 6)}`;
    this.peers = new Map(); // Map of userId -> {username, cursor, selection, color}
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    
    // CRDT operation queue
    this.pendingOps = [];
    this.appliedOps = new Set();
    
    console.log('[Collab] Collaboration manager initialized', { userId: this.userId });
  }
  
  /**
   * Generate a unique user ID
   * @returns {string} User ID
   */
  generateUserId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
  
  /**
   * Connect to collaboration server
   * @param {string} sessionId - Session ID to join
   * @param {string} username - Display name
   */
  async connect(sessionId, username = null) {
    try {
      if (this.isConnected) {
        console.warn('[Collab] Already connected');
        return;
      }
      
      this.sessionId = sessionId || this.generateSessionId();
      if (username) {
        this.username = username;
      }
      
      // For now, use a mock WebSocket connection
      // In production, this would connect to a real collaboration server
      console.log('[Collab] Connecting to session:', this.sessionId);
      
      // Mock connection (replace with real WebSocket in production)
      this.setupMockConnection();
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      console.log('[Collab] Connected successfully', {
        sessionId: this.sessionId,
        userId: this.userId,
        username: this.username
      });
      
      // Update UI
      this.updateConnectionStatus(true);
      
      // Notify other users
      this.broadcastPresence();
      
    } catch (error) {
      console.error('[Collab] Connection error:', error);
      this.handleConnectionError(error);
    }
  }
  
  /**
   * Disconnect from collaboration server
   */
  disconnect() {
    try {
      if (!this.isConnected) {
        console.warn('[Collab] Not connected');
        return;
      }
      
      // Send disconnect message
      if (this.ws) {
        this.send({
          type: 'disconnect',
          userId: this.userId
        });
        
        if (this.ws.close) {
          this.ws.close();
        }
      }
      
      this.ws = null;
      this.isConnected = false;
      this.peers.clear();
      
      console.log('[Collab] Disconnected');
      
      // Update UI
      this.updateConnectionStatus(false);
      
    } catch (error) {
      console.error('[Collab] Disconnect error:', error);
    }
  }
  
  /**
   * Setup mock WebSocket connection for testing
   * In production, replace with real WebSocket connection
   */
  setupMockConnection() {
    this.ws = {
      send: (data) => {
        console.log('[Collab] [Mock] Sending:', data);
      },
      close: () => {
        console.log('[Collab] [Mock] Connection closed');
      },
      onmessage: null,
      onerror: null,
      onclose: null
    };
    
    // Simulate receiving messages (for testing)
    // In production, this would be handled by the real WebSocket
  }
  
  /**
   * Send message to collaboration server
   * @param {object} message - Message to send
   */
  send(message) {
    try {
      if (!this.isConnected || !this.ws) {
        console.warn('[Collab] Not connected, queueing message');
        this.pendingOps.push(message);
        return;
      }
      
      const payload = {
        ...message,
        userId: this.userId,
        username: this.username,
        sessionId: this.sessionId,
        timestamp: Date.now()
      };
      
      if (this.ws.send) {
        this.ws.send(JSON.stringify(payload));
      }
      
    } catch (error) {
      console.error('[Collab] Send error:', error);
    }
  }
  
  /**
   * Broadcast user presence (cursor, selection, etc.)
   */
  broadcastPresence() {
    try {
      const state = window.XVGSystem?.state?.appState;
      if (!state) return;
      
      this.send({
        type: 'presence',
        cursor: state.cursor || { x: 0, y: 0 },
        selection: state.selectedPaths || [],
        color: this.getUserColor()
      });
      
    } catch (error) {
      console.error('[Collab] Broadcast presence error:', error);
    }
  }
  
  /**
   * Generate CRDT operation from user action
   * @param {string} action - Action type (add, modify, delete)
   * @param {object} data - Action data
   */
  generateOperation(action, data) {
    try {
      const op = {
        type: 'crdt_op',
        action: action,
        data: data,
        opId: this.generateOpId(),
        userId: this.userId,
        timestamp: Date.now()
      };
      
      // Apply locally first
      this.applyOperation(op);
      
      // Broadcast to other users
      this.send(op);
      
      console.log('[Collab] Generated operation:', op);
      
    } catch (error) {
      console.error('[Collab] Generate operation error:', error);
    }
  }
  
  /**
   * Apply CRDT operation (from self or others)
   * @param {object} op - CRDT operation
   */
  applyOperation(op) {
    try {
      // Check if already applied
      if (this.appliedOps.has(op.opId)) {
        console.log('[Collab] Operation already applied:', op.opId);
        return;
      }
      
      // Apply using XVGRuntime
      if (window.xvg_wasm && window.xvg_wasm.XVGRuntime) {
        // TODO: Call applyCrdtOp method once the runtime is properly integrated
        console.log('[Collab] Applying operation via XVGRuntime:', op);
      }
      
      // Apply to local state
      const state = window.XVGSystem?.state?.appState;
      if (!state) return;
      
      switch (op.action) {
        case 'add_path':
          state.paths.push(op.data);
          break;
        case 'modify_path':
          const pathIndex = state.paths.findIndex(p => p.id === op.data.id);
          if (pathIndex !== -1) {
            state.paths[pathIndex] = { ...state.paths[pathIndex], ...op.data };
          }
          break;
        case 'delete_path':
          state.paths = state.paths.filter(p => p.id !== op.data.id);
          break;
        case 'add_image':
          state.images.push(op.data);
          break;
        case 'modify_image':
          const imageIndex = state.images.findIndex(i => i.id === op.data.id);
          if (imageIndex !== -1) {
            state.images[imageIndex] = { ...state.images[imageIndex], ...op.data };
          }
          break;
        case 'delete_image':
          state.images = state.images.filter(i => i.id !== op.data.id);
          break;
        default:
          console.warn('[Collab] Unknown operation action:', op.action);
      }
      
      // Mark as applied
      this.appliedOps.add(op.opId);
      
      // Re-render
      if (window.XVGSystem.renderCanvas) {
        window.XVGSystem.renderCanvas();
      }
      
    } catch (error) {
      console.error('[Collab] Apply operation error:', error);
    }
  }
  
  /**
   * Generate unique operation ID
   * @returns {string} Operation ID
   */
  generateOpId() {
    return `${this.userId}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
  
  /**
   * Generate session ID
   * @returns {string} Session ID
   */
  generateSessionId() {
    return Math.random().toString(36).substring(2, 11).toUpperCase();
  }
  
  /**
   * Get user color for presence indicators
   * @returns {string} Color hex code
   */
  getUserColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    const index = parseInt(this.userId.substring(0, 8), 36) % colors.length;
    return colors[index];
  }
  
  /**
   * Handle connection error
   * @param {Error} error - Error object
   */
  handleConnectionError(error) {
    console.error('[Collab] Connection error:', error);
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`[Collab] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect(this.sessionId, this.username);
      }, delay);
    } else {
      console.error('[Collab] Max reconnect attempts reached');
      this.updateConnectionStatus(false);
    }
  }
  
  /**
   * Update connection status in UI
   * @param {boolean} connected - Connection status
   */
  updateConnectionStatus(connected) {
    const statusEl = document.getElementById('collab-status');
    const sessionIdEl = document.getElementById('collab-session-id');
    const userCountEl = document.getElementById('collab-user-count');
    
    if (statusEl) {
      statusEl.textContent = connected ? 'Connected' : 'Disconnected';
      statusEl.className = connected ? 'status-connected' : 'status-disconnected';
    }
    
    if (sessionIdEl && connected) {
      sessionIdEl.textContent = this.sessionId;
    }
    
    if (userCountEl) {
      userCountEl.textContent = connected ? `${this.peers.size + 1} users` : '0 users';
    }
  }
}

/**
 * Initialize collaboration module
 */
export function initializeCollaboration() {
  // Create collaboration manager
  window.CollaborationManager = new CollaborationManager();
  
  // Expose functions globally for onclick handlers
  window.startCollaboration = () => {
    const sessionId = document.getElementById('collab-session-input')?.value || null;
    const username = document.getElementById('collab-username-input')?.value || null;
    window.CollaborationManager.connect(sessionId, username);
  };
  
  window.stopCollaboration = () => {
    window.CollaborationManager.disconnect();
  };
  
  window.copySessionId = () => {
    const sessionId = window.CollaborationManager.sessionId;
    if (sessionId) {
      navigator.clipboard.writeText(sessionId);
      if (window.notify) {
        window.notify('success', 'Session ID copied to clipboard');
      }
    }
  };
  
  console.log('[Collab] Collaboration module initialized');
}
