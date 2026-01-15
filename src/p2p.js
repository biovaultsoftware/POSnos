// BalanceChain P2P Module
// WebRTC DataChannel with E2EE and proper error handling

import { ICE_SERVERS, DC_BUFFER_THRESHOLD } from './constants.js';
import {
  generateECDHKeyPair,
  exportPublicKeyJwk,
  importECDHPublicKey,
  deriveSharedKey,
  encryptAESGCM,
  decryptAESGCM
} from './crypto.js';

// ============================================================================
// P2P CONNECTION CLASS
// ============================================================================

export class P2PConnection {
  constructor(options = {}) {
    this.signalClient = options.signalClient;
    this.localId = options.localId;
    this.remoteId = null;
    
    this.pc = null;
    this.dc = null;
    this.sharedKey = null;
    this.ecdhKeyPair = null;
    
    this.state = 'idle'; // idle, connecting, connected, disconnected, error
    this.lastError = null;
    
    this.onMessage = options.onMessage || (() => {});
    this.onStateChange = options.onStateChange || (() => {});
    this.onError = options.onError || (() => {});
    
    this.messageQueue = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
  }
  
  /**
   * Initialize connection to a peer
   * @param {string} remoteId 
   * @param {boolean} [isInitiator=true]
   * @returns {Promise<void>}
   */
  async connect(remoteId, isInitiator = true) {
    this.remoteId = remoteId;
    this.setState('connecting');
    
    try {
      // Generate ECDH key pair for E2EE
      this.ecdhKeyPair = await generateECDHKeyPair();
      
      // Create peer connection
      this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      
      // Set up event handlers
      this.setupPeerConnectionHandlers();
      
      if (isInitiator) {
        await this.initiateConnection();
      }
    } catch (e) {
      this.handleError('connect', e);
    }
  }
  
  /**
   * Set up peer connection event handlers
   */
  setupPeerConnectionHandlers() {
    // ICE candidate handling
    this.pc.onicecandidate = (e) => {
      if (e.candidate && this.signalClient) {
        this.signalClient.send({
          type: 'ice',
          to: this.remoteId,
          candidate: e.candidate.toJSON()
        }).catch(err => {
          console.warn('[P2P] Failed to send ICE candidate:', err.message);
        });
      }
    };
    
    // ICE connection state changes
    this.pc.oniceconnectionstatechange = () => {
      console.log(`[P2P] ICE state: ${this.pc.iceConnectionState}`);
      
      switch (this.pc.iceConnectionState) {
        case 'connected':
        case 'completed':
          this.reconnectAttempts = 0;
          break;
        case 'disconnected':
          this.handleDisconnect();
          break;
        case 'failed':
          this.handleError('ice', new Error('ICE connection failed'));
          break;
      }
    };
    
    // Connection state changes
    this.pc.onconnectionstatechange = () => {
      console.log(`[P2P] Connection state: ${this.pc.connectionState}`);
      
      if (this.pc.connectionState === 'failed') {
        this.handleError('connection', new Error('Connection failed'));
      }
    };
    
    // Data channel handling (for answerer)
    this.pc.ondatachannel = (e) => {
      this.setupDataChannel(e.channel);
    };
  }
  
  /**
   * Initiate connection (caller side)
   */
  async initiateConnection() {
    // Create data channel
    this.dc = this.pc.createDataChannel('sovereign', {
      ordered: true
    });
    this.setupDataChannel(this.dc);
    
    // Create offer
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    
    // Send offer via signaling
    if (this.signalClient) {
      await this.signalClient.send({
        type: 'offer',
        to: this.remoteId,
        sdp: offer.sdp,
        publicKey: await exportPublicKeyJwk(this.ecdhKeyPair.publicKey)
      });
    }
  }
  
  /**
   * Handle incoming offer (answerer side)
   * @param {Object} message 
   */
  async handleOffer(message) {
    try {
      this.remoteId = message.from;
      
      // Import remote public key for E2EE
      if (message.publicKey) {
        await this.setupE2EE(message.publicKey);
      }
      
      // Set remote description
      await this.pc.setRemoteDescription({
        type: 'offer',
        sdp: message.sdp
      });
      
      // Create and send answer
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      
      if (this.signalClient) {
        await this.signalClient.send({
          type: 'answer',
          to: this.remoteId,
          sdp: answer.sdp,
          publicKey: await exportPublicKeyJwk(this.ecdhKeyPair.publicKey)
        });
      }
    } catch (e) {
      this.handleError('handleOffer', e);
    }
  }
  
  /**
   * Handle incoming answer
   * @param {Object} message 
   */
  async handleAnswer(message) {
    try {
      // Import remote public key for E2EE
      if (message.publicKey) {
        await this.setupE2EE(message.publicKey);
      }
      
      // Set remote description
      await this.pc.setRemoteDescription({
        type: 'answer',
        sdp: message.sdp
      });
    } catch (e) {
      this.handleError('handleAnswer', e);
    }
  }
  
  /**
   * Handle incoming ICE candidate
   * @param {Object} message 
   */
  async handleIceCandidate(message) {
    try {
      if (message.candidate && this.pc) {
        await this.pc.addIceCandidate(new RTCIceCandidate(message.candidate));
      }
    } catch (e) {
      // Log but don't fail - some candidates may be invalid
      console.warn('[P2P] Failed to add ICE candidate:', e.message);
    }
  }
  
  /**
   * Set up E2EE with remote public key
   * @param {Object} remotePublicKeyJwk 
   */
  async setupE2EE(remotePublicKeyJwk) {
    try {
      const remotePublicKey = await importECDHPublicKey(remotePublicKeyJwk);
      this.sharedKey = await deriveSharedKey(
        this.ecdhKeyPair.privateKey,
        remotePublicKey
      );
      console.log('[P2P] E2EE established');
    } catch (e) {
      console.error('[P2P] E2EE setup failed:', e);
      this.sharedKey = null;
      // Continue without E2EE (not recommended for production)
    }
  }
  
  /**
   * Set up data channel handlers
   * @param {RTCDataChannel} channel 
   */
  setupDataChannel(channel) {
    this.dc = channel;
    
    channel.onopen = () => {
      console.log('[P2P] Data channel open');
      this.setState('connected');
      this.flushMessageQueue();
    };
    
    channel.onclose = () => {
      console.log('[P2P] Data channel closed');
      this.handleDisconnect();
    };
    
    channel.onerror = (e) => {
      this.handleError('datachannel', e.error || new Error('DataChannel error'));
    };
    
    channel.onmessage = async (e) => {
      try {
        await this.handleIncomingMessage(e.data);
      } catch (err) {
        console.error('[P2P] Message handling error:', err);
      }
    };
  }
  
  /**
   * Handle incoming message
   * @param {string} data 
   */
  async handleIncomingMessage(data) {
    let message;
    
    // Decrypt if E2EE is set up
    if (this.sharedKey) {
      try {
        const encrypted = JSON.parse(data);
        const decrypted = await decryptAESGCM(
          this.sharedKey,
          encrypted.iv,
          encrypted.ciphertext
        );
        message = JSON.parse(decrypted);
      } catch (e) {
        console.warn('[P2P] Decryption failed, trying plaintext');
        message = JSON.parse(data);
      }
    } else {
      message = JSON.parse(data);
    }
    
    this.onMessage(message);
  }
  
  /**
   * Send a message to the peer
   * @param {Object} message 
   * @returns {Promise<void>}
   */
  async send(message) {
    if (!this.dc || this.dc.readyState !== 'open') {
      // Queue message for later
      this.messageQueue.push(message);
      return;
    }
    
    // Check buffer
    if (this.dc.bufferedAmount > DC_BUFFER_THRESHOLD) {
      console.warn('[P2P] Buffer overflow, queueing message');
      this.messageQueue.push(message);
      this.scheduleQueueFlush();
      return;
    }
    
    let data;
    
    // Encrypt if E2EE is set up
    if (this.sharedKey) {
      try {
        const plaintext = JSON.stringify(message);
        const encrypted = await encryptAESGCM(this.sharedKey, plaintext);
        data = JSON.stringify(encrypted);
      } catch (e) {
        console.error('[P2P] Encryption failed:', e);
        data = JSON.stringify(message);
      }
    } else {
      data = JSON.stringify(message);
    }
    
    this.dc.send(data);
  }
  
  /**
   * Flush queued messages
   */
  async flushMessageQueue() {
    while (this.messageQueue.length > 0 && 
           this.dc?.readyState === 'open' &&
           this.dc.bufferedAmount < DC_BUFFER_THRESHOLD) {
      const msg = this.messageQueue.shift();
      await this.send(msg);
    }
  }
  
  /**
   * Schedule queue flush when buffer drains
   */
  scheduleQueueFlush() {
    if (this.flushTimeout) return;
    
    this.flushTimeout = setTimeout(() => {
      this.flushTimeout = null;
      this.flushMessageQueue();
    }, 100);
  }
  
  /**
   * Handle disconnect
   */
  handleDisconnect() {
    if (this.state === 'disconnected') return;
    
    this.setState('disconnected');
    
    // Attempt reconnect
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[P2P] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      setTimeout(() => {
        if (this.remoteId && this.state === 'disconnected') {
          this.connect(this.remoteId, true).catch(e => {
            console.error('[P2P] Reconnect failed:', e);
          });
        }
      }, 1000 * this.reconnectAttempts);
    }
  }
  
  /**
   * Handle error
   * @param {string} context 
   * @param {Error} error 
   */
  handleError(context, error) {
    console.error(`[P2P] Error in ${context}:`, error);
    this.lastError = error;
    this.setState('error');
    this.onError(error, context);
  }
  
  /**
   * Set connection state
   * @param {string} newState 
   */
  setState(newState) {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      this.onStateChange(newState, oldState);
    }
  }
  
  /**
   * Close connection
   */
  close() {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }
    
    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }
    
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    
    this.sharedKey = null;
    this.setState('disconnected');
  }
  
  /**
   * Get connection info
   * @returns {Object}
   */
  getInfo() {
    return {
      state: this.state,
      localId: this.localId,
      remoteId: this.remoteId,
      hasE2EE: this.sharedKey !== null,
      bufferAmount: this.dc?.bufferedAmount || 0,
      queueLength: this.messageQueue.length,
      lastError: this.lastError?.message || null
    };
  }
}

// ============================================================================
// P2P MANAGER (Multiple connections)
// ============================================================================

export class P2PManager {
  constructor(options = {}) {
    this.localId = options.localId;
    this.signalClient = options.signalClient;
    this.connections = new Map();
    
    this.onMessage = options.onMessage || (() => {});
    this.onPeerStateChange = options.onPeerStateChange || (() => {});
    
    // Set up signal client handlers
    if (this.signalClient) {
      this.setupSignalHandlers();
    }
  }
  
  /**
   * Set up signal client message handlers
   */
  setupSignalHandlers() {
    this.signalClient.onMessage = async (message) => {
      switch (message.type) {
        case 'offer':
          await this.handleIncomingOffer(message);
          break;
        case 'answer':
          await this.handleIncomingAnswer(message);
          break;
        case 'ice':
          await this.handleIncomingIce(message);
          break;
      }
    };
  }
  
  /**
   * Connect to a peer
   * @param {string} peerId 
   * @returns {Promise<P2PConnection>}
   */
  async connect(peerId) {
    // Check for existing connection
    if (this.connections.has(peerId)) {
      const existing = this.connections.get(peerId);
      if (existing.state === 'connected') {
        return existing;
      }
      existing.close();
    }
    
    // Create new connection
    const conn = new P2PConnection({
      localId: this.localId,
      signalClient: this.signalClient,
      onMessage: (msg) => this.onMessage(peerId, msg),
      onStateChange: (state) => this.onPeerStateChange(peerId, state),
      onError: (err) => console.error(`[P2P] Peer ${peerId} error:`, err)
    });
    
    this.connections.set(peerId, conn);
    
    await conn.connect(peerId, true);
    
    return conn;
  }
  
  /**
   * Handle incoming offer
   * @param {Object} message 
   */
  async handleIncomingOffer(message) {
    const peerId = message.from;
    
    // Create connection for incoming peer
    const conn = new P2PConnection({
      localId: this.localId,
      signalClient: this.signalClient,
      onMessage: (msg) => this.onMessage(peerId, msg),
      onStateChange: (state) => this.onPeerStateChange(peerId, state),
      onError: (err) => console.error(`[P2P] Peer ${peerId} error:`, err)
    });
    
    // Initialize without initiating
    await conn.connect(peerId, false);
    
    // Handle the offer
    await conn.handleOffer(message);
    
    this.connections.set(peerId, conn);
  }
  
  /**
   * Handle incoming answer
   * @param {Object} message 
   */
  async handleIncomingAnswer(message) {
    const conn = this.connections.get(message.from);
    if (conn) {
      await conn.handleAnswer(message);
    }
  }
  
  /**
   * Handle incoming ICE candidate
   * @param {Object} message 
   */
  async handleIncomingIce(message) {
    const conn = this.connections.get(message.from);
    if (conn) {
      await conn.handleIceCandidate(message);
    }
  }
  
  /**
   * Send message to a peer
   * @param {string} peerId 
   * @param {Object} message 
   */
  async send(peerId, message) {
    let conn = this.connections.get(peerId);
    
    if (!conn || conn.state !== 'connected') {
      conn = await this.connect(peerId);
    }
    
    await conn.send(message);
  }
  
  /**
   * Broadcast message to all connected peers
   * @param {Object} message 
   */
  async broadcast(message) {
    const promises = [];
    
    for (const [peerId, conn] of this.connections) {
      if (conn.state === 'connected') {
        promises.push(conn.send(message).catch(e => {
          console.warn(`[P2P] Broadcast to ${peerId} failed:`, e);
        }));
      }
    }
    
    await Promise.all(promises);
  }
  
  /**
   * Disconnect from a peer
   * @param {string} peerId 
   */
  disconnect(peerId) {
    const conn = this.connections.get(peerId);
    if (conn) {
      conn.close();
      this.connections.delete(peerId);
    }
  }
  
  /**
   * Close all connections
   */
  closeAll() {
    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
  }
  
  /**
   * Get all connected peer IDs
   * @returns {string[]}
   */
  getConnectedPeers() {
    const peers = [];
    for (const [peerId, conn] of this.connections) {
      if (conn.state === 'connected') {
        peers.push(peerId);
      }
    }
    return peers;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const p2p = new P2PManager();

