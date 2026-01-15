// BalanceChain Signal Module
// WebSocket signaling client with reconnection and heartbeat

import { randomHex } from './crypto.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 10000;

// ============================================================================
// SIGNAL CLIENT CLASS
// ============================================================================

/**
 * WebSocket signaling client
 */
export class SignalClient {
  constructor(serverUrl) {
    this.serverUrl = this.normalizeUrl(serverUrl);
    this.ws = null;
    this.state = 'disconnected'; // disconnected, connecting, connected, reconnecting
    
    // Identity
    this.clientId = null;
    this.hid = null;
    
    // Reconnection
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.shouldReconnect = true;
    
    // Heartbeat
    this.heartbeatTimer = null;
    this.heartbeatPending = false;
    this.lastPong = 0;
    
    // Event handlers
    this.onSignal = null;
    this.onStateChange = null;
    this.onError = null;
    this.onPeersUpdate = null;
    
    // Message queue for offline
    this.messageQueue = [];
  }
  
  /**
   * Normalize WebSocket URL
   * @param {string} url 
   * @returns {string}
   */
  normalizeUrl(url) {
    if (!url) return url;
    
    // Handle protocol
    let normalized = url.trim();
    
    // Convert http(s) to ws(s)
    if (normalized.startsWith('http://')) {
      normalized = 'ws://' + normalized.slice(7);
    } else if (normalized.startsWith('https://')) {
      normalized = 'wss://' + normalized.slice(8);
    } else if (!normalized.startsWith('ws://') && !normalized.startsWith('wss://')) {
      // Default to wss for security
      normalized = 'wss://' + normalized;
    }
    
    // Remove trailing slash
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    
    return normalized;
  }
  
  /**
   * Connect to signal server
   * @param {string} hid - Human ID to register
   * @returns {Promise<void>}
   */
  async connect(hid) {
    if (this.state === 'connected' || this.state === 'connecting') {
      console.log('[Signal] Already connected or connecting');
      return;
    }
    
    this.hid = hid;
    this.shouldReconnect = true;
    
    return new Promise((resolve, reject) => {
      this.setState('connecting');
      
      try {
        this.ws = new WebSocket(this.serverUrl);
        
        this.ws.onopen = () => {
          console.log('[Signal] Connected');
          this.setState('connected');
          this.reconnectAttempts = 0;
          
          // Register with server
          this.sendRaw({
            type: 'register',
            hid: this.hid,
            clientId: this.clientId || randomHex(8)
          });
          
          // Start heartbeat
          this.startHeartbeat();
          
          // Flush message queue
          this.flushQueue();
          
          resolve();
        };
        
        this.ws.onclose = (event) => {
          console.log(`[Signal] Disconnected: code=${event.code}, reason=${event.reason}`);
          this.stopHeartbeat();
          this.setState('disconnected');
          
          if (this.shouldReconnect && !event.wasClean) {
            this.scheduleReconnect();
          }
        };
        
        this.ws.onerror = (error) => {
          console.error('[Signal] WebSocket error:', error);
          this.handleError('websocket_error', error);
          
          if (this.state === 'connecting') {
            reject(new Error('Connection failed'));
          }
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
      } catch (e) {
        this.handleError('connect_error', e);
        reject(e);
      }
    });
  }
  
  /**
   * Handle incoming message
   * @param {string} data 
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'registered':
          this.clientId = message.clientId;
          console.log(`[Signal] Registered as ${this.clientId}`);
          break;
          
        case 'pong':
          this.heartbeatPending = false;
          this.lastPong = Date.now();
          break;
          
        case 'peers':
          if (this.onPeersUpdate) {
            this.onPeersUpdate(message.peers || []);
          }
          break;
          
        case 'signal':
          if (this.onSignal) {
            this.onSignal(message.from, message.signalType, message.data);
          }
          break;
          
        case 'error':
          console.error('[Signal] Server error:', message.message);
          this.handleError('server_error', new Error(message.message));
          break;
          
        default:
          console.log('[Signal] Unknown message type:', message.type);
      }
      
    } catch (e) {
      console.error('[Signal] Message parse error:', e);
    }
  }
  
  /**
   * Send signal to peer
   * @param {string} peerId 
   * @param {string} signalType 
   * @param {Object} data 
   */
  sendSignal(peerId, signalType, data) {
    this.send({
      type: 'signal',
      to: peerId,
      signalType,
      data
    });
  }
  
  /**
   * Request peer list
   */
  requestPeers() {
    this.send({ type: 'get-peers' });
  }
  
  /**
   * Send message (queued if disconnected)
   * @param {Object} message 
   */
  send(message) {
    if (this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      this.sendRaw(message);
    } else {
      // Queue for later
      this.messageQueue.push(message);
    }
  }
  
  /**
   * Send raw message immediately
   * @param {Object} message 
   */
  sendRaw(message) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
  
  /**
   * Flush message queue
   */
  flushQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.sendRaw(message);
    }
  }
  
  /**
   * Start heartbeat timer
   */
  startHeartbeat() {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.heartbeatPending) {
        // Previous heartbeat not responded
        console.warn('[Signal] Heartbeat timeout');
        this.ws?.close(4001, 'Heartbeat timeout');
        return;
      }
      
      this.heartbeatPending = true;
      this.sendRaw({ type: 'ping', ts: Date.now() });
      
    }, HEARTBEAT_INTERVAL);
  }
  
  /**
   * Stop heartbeat timer
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatPending = false;
  }
  
  /**
   * Schedule reconnection
   */
  scheduleReconnect() {
    if (this.reconnectTimer) return;
    
    this.reconnectAttempts++;
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts - 1),
      RECONNECT_MAX_DELAY
    );
    
    console.log(`[Signal] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.setState('reconnecting');
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      
      try {
        await this.connect(this.hid);
      } catch (e) {
        console.error('[Signal] Reconnect failed:', e.message);
        this.scheduleReconnect();
      }
    }, delay);
  }
  
  /**
   * Set state and emit event
   * @param {string} newState 
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    
    if (this.onStateChange) {
      this.onStateChange(newState, oldState);
    }
  }
  
  /**
   * Handle error
   * @param {string} type 
   * @param {Error} error 
   */
  handleError(type, error) {
    if (this.onError) {
      this.onError({ type, error });
    }
  }
  
  /**
   * Disconnect from server
   */
  disconnect() {
    this.shouldReconnect = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.setState('disconnected');
    console.log('[Signal] Disconnected');
  }
  
  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }
  
  /**
   * Get connection info
   * @returns {Object}
   */
  getInfo() {
    return {
      serverUrl: this.serverUrl,
      state: this.state,
      clientId: this.clientId,
      hid: this.hid,
      reconnectAttempts: this.reconnectAttempts,
      queueLength: this.messageQueue.length,
      lastPong: this.lastPong
    };
  }
}

// ============================================================================
// SIGNAL SERVER STUB (for testing/local dev)
// ============================================================================

/**
 * In-memory signal server for testing
 */
export class LocalSignalServer {
  constructor() {
    this.clients = new Map(); // clientId -> handler
  }
  
  /**
   * Register a client
   * @param {string} clientId 
   * @param {function} handler - (message) => void
   */
  register(clientId, handler) {
    this.clients.set(clientId, handler);
    console.log(`[LocalSignal] Client registered: ${clientId}`);
  }
  
  /**
   * Unregister a client
   * @param {string} clientId 
   */
  unregister(clientId) {
    this.clients.delete(clientId);
    console.log(`[LocalSignal] Client unregistered: ${clientId}`);
  }
  
  /**
   * Route a signal
   * @param {string} from 
   * @param {string} to 
   * @param {string} signalType 
   * @param {Object} data 
   */
  route(from, to, signalType, data) {
    const handler = this.clients.get(to);
    if (handler) {
      handler({
        type: 'signal',
        from,
        signalType,
        data
      });
    } else {
      console.warn(`[LocalSignal] No handler for ${to}`);
    }
  }
  
  /**
   * Get all connected clients
   * @returns {string[]}
   */
  getClients() {
    return Array.from(this.clients.keys());
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const localSignalServer = new LocalSignalServer();
