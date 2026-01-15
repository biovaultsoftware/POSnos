// BalanceChain Shadow Training Pipeline
// Anonymization and R2 bucket upload for AI training data

import { sha256Hex, randomHex } from './crypto.js';
import { getMeta, setMeta } from './idb.js';
import { STA_TYPES } from './constants.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const SHADOW_VERSION = 1;
const BATCH_SIZE = 50; // Messages per batch
const MIN_BATCH_INTERVAL = 3600000; // 1 hour between batches
const MAX_SESSION_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// Fields to ALWAYS remove (PII)
const PII_FIELDS = [
  'email', 'phone', 'ssn', 'address', 'ip', 'deviceId',
  'firstName', 'lastName', 'fullName', 'name',
  'creditCard', 'bankAccount', 'password'
];

// Patterns to detect and redact
const PII_PATTERNS = [
  { name: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]' },
  { name: 'phone', pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[PHONE]' },
  { name: 'ssn', pattern: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, replacement: '[SSN]' },
  { name: 'creditCard', pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: '[CC]' },
  { name: 'ip', pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[IP]' },
  { name: 'url', pattern: /https?:\/\/[^\s]+/g, replacement: '[URL]' }
];

// ============================================================================
// ANONYMIZER CLASS
// ============================================================================

/**
 * Anonymizes training data by removing PII
 */
export class Anonymizer {
  constructor() {
    this.entityMap = new Map(); // Original -> Anonymized mapping
    this.counter = 0;
  }
  
  /**
   * Anonymize a text string
   * @param {string} text 
   * @returns {string}
   */
  anonymizeText(text) {
    if (!text || typeof text !== 'string') return text;
    
    let result = text;
    
    // Apply pattern-based redaction
    for (const { pattern, replacement } of PII_PATTERNS) {
      result = result.replace(pattern, replacement);
    }
    
    return result;
  }
  
  /**
   * Anonymize a segment for training
   * @param {Object} segment 
   * @returns {Object}
   */
  anonymizeSegment(segment) {
    const anonymized = {
      v: segment.v,
      type: segment.type,
      timestamp: this.roundTimestamp(segment.timestamp),
      // Remove seq, nonce, signature - not needed for training
    };
    
    // Anonymize payload based on type
    if (segment.payload) {
      anonymized.payload = this.anonymizePayload(segment.type, segment.payload);
    }
    
    // Replace HID with anonymous ID
    if (segment.author?.hid) {
      anonymized.authorId = this.getAnonymousId(segment.author.hid);
    }
    
    return anonymized;
  }
  
  /**
   * Anonymize payload based on STA type
   * @param {string} type 
   * @param {Object} payload 
   * @returns {Object}
   */
  anonymizePayload(type, payload) {
    const result = {};
    
    switch (type) {
      case STA_TYPES.CHAT_USER:
      case STA_TYPES.AI_ADVICE:
        // Keep text content but anonymize
        result.text = this.anonymizeText(payload.text);
        result.role = payload.role;
        // Anonymize chat ID
        if (payload.chatId) {
          result.chatId = this.getAnonymousId(payload.chatId);
        }
        break;
        
      case STA_TYPES.BIZ_DECISION:
        result.decision = this.anonymizeText(payload.decision);
        result.reasoning = this.anonymizeText(payload.reasoning);
        // Keep category for training value
        result.category = payload.category;
        break;
        
      case STA_TYPES.BIZ_OUTCOME:
        result.outcome = this.anonymizeText(payload.outcome);
        result.success = payload.success;
        // Remove specific financial amounts
        if (payload.metrics) {
          result.hasMetrics = true;
        }
        break;
        
      case STA_TYPES.CAPSULE_MINT:
        // Capsules contain training-valuable content
        result.richScore = payload.richScore;
        result.businessScore = payload.businessScore;
        result.motivator = payload.motivator;
        result.category = payload.category;
        // Anonymize but keep session content
        if (payload.sessionSummary) {
          result.sessionSummary = this.anonymizeText(payload.sessionSummary);
        }
        break;
        
      default:
        // Generic anonymization - remove PII fields
        for (const [key, value] of Object.entries(payload)) {
          if (!PII_FIELDS.includes(key.toLowerCase())) {
            if (typeof value === 'string') {
              result[key] = this.anonymizeText(value);
            } else if (typeof value === 'number' || typeof value === 'boolean') {
              result[key] = value;
            }
          }
        }
    }
    
    return result;
  }
  
  /**
   * Get or create anonymous ID for an entity
   * @param {string} original 
   * @returns {string}
   */
  getAnonymousId(original) {
    if (!this.entityMap.has(original)) {
      this.entityMap.set(original, `anon_${++this.counter}`);
    }
    return this.entityMap.get(original);
  }
  
  /**
   * Round timestamp to reduce precision (privacy)
   * @param {number} ts 
   * @returns {number}
   */
  roundTimestamp(ts) {
    // Round to nearest hour
    return Math.floor(ts / 3600000) * 3600000;
  }
  
  /**
   * Reset anonymizer state
   */
  reset() {
    this.entityMap.clear();
    this.counter = 0;
  }
}

// ============================================================================
// SHADOW TRAINING MANAGER
// ============================================================================

/**
 * Manages shadow training data collection and upload
 */
export class ShadowTrainingManager {
  constructor(db, options = {}) {
    this.db = db;
    this.anonymizer = new Anonymizer();
    this.r2Endpoint = options.r2Endpoint || '/api/shadow/upload';
    this.enabled = options.enabled !== false;
    this.pendingBatch = [];
    this.lastUpload = 0;
  }
  
  /**
   * Add segment to shadow training queue
   * @param {Object} segment 
   * @returns {Promise<void>}
   */
  async addSegment(segment) {
    if (!this.enabled) return;
    
    // Only collect certain types
    const trainableTypes = [
      STA_TYPES.CHAT_USER,
      STA_TYPES.AI_ADVICE,
      STA_TYPES.BIZ_DECISION,
      STA_TYPES.BIZ_OUTCOME,
      STA_TYPES.CAPSULE_MINT
    ];
    
    if (!trainableTypes.includes(segment.type)) {
      return;
    }
    
    // Anonymize and add to batch
    const anonymized = this.anonymizer.anonymizeSegment(segment);
    this.pendingBatch.push(anonymized);
    
    // Check if batch is ready
    if (this.pendingBatch.length >= BATCH_SIZE) {
      await this.uploadBatch();
    }
  }
  
  /**
   * Upload pending batch to R2
   * @returns {Promise<{success: boolean, uploaded: number}>}
   */
  async uploadBatch() {
    if (this.pendingBatch.length === 0) {
      return { success: true, uploaded: 0 };
    }
    
    // Rate limit uploads
    const now = Date.now();
    if (now - this.lastUpload < MIN_BATCH_INTERVAL) {
      console.log('[Shadow] Rate limited, will retry later');
      return { success: false, uploaded: 0, reason: 'rate_limited' };
    }
    
    // Prepare batch
    const batch = {
      version: SHADOW_VERSION,
      timestamp: now,
      batchId: `batch_${now}_${randomHex(8)}`,
      count: this.pendingBatch.length,
      data: this.pendingBatch
    };
    
    // Generate hash for integrity
    const batchJson = JSON.stringify(batch);
    batch.hash = await sha256Hex(batchJson);
    
    try {
      const response = await fetch(this.r2Endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch)
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Clear batch and reset anonymizer
      const uploadedCount = this.pendingBatch.length;
      this.pendingBatch = [];
      this.anonymizer.reset();
      this.lastUpload = now;
      
      // Record upload
      await this.recordUpload(batch.batchId, uploadedCount);
      
      console.log(`[Shadow] Uploaded batch ${batch.batchId} with ${uploadedCount} segments`);
      
      return { success: true, uploaded: uploadedCount, batchId: batch.batchId };
      
    } catch (e) {
      console.error('[Shadow] Upload failed:', e);
      return { success: false, uploaded: 0, error: e.message };
    }
  }
  
  /**
   * Record upload for tracking
   * @param {string} batchId 
   * @param {number} count 
   */
  async recordUpload(batchId, count) {
    const history = await getMeta(this.db, 'shadow:history') || [];
    
    history.push({
      batchId,
      count,
      timestamp: Date.now()
    });
    
    // Keep last 100 uploads
    while (history.length > 100) {
      history.shift();
    }
    
    await setMeta(this.db, 'shadow:history', history);
  }
  
  /**
   * Get upload statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const history = await getMeta(this.db, 'shadow:history') || [];
    
    const totalUploaded = history.reduce((sum, h) => sum + h.count, 0);
    const lastUpload = history.length > 0 ? history[history.length - 1] : null;
    
    return {
      enabled: this.enabled,
      pendingCount: this.pendingBatch.length,
      totalUploaded,
      uploadCount: history.length,
      lastUpload: lastUpload ? {
        batchId: lastUpload.batchId,
        count: lastUpload.count,
        timestamp: lastUpload.timestamp
      } : null
    };
  }
  
  /**
   * Enable/disable shadow training
   * @param {boolean} enabled 
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`[Shadow] Training ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Clear pending batch (for privacy)
   */
  clearPending() {
    this.pendingBatch = [];
    this.anonymizer.reset();
    console.log('[Shadow] Pending batch cleared');
  }
}

// ============================================================================
// SESSION EXTRACTOR
// ============================================================================

/**
 * Extract complete training sessions from chain
 */
export class SessionExtractor {
  constructor() {
    this.anonymizer = new Anonymizer();
  }
  
  /**
   * Extract sessions from segments
   * @param {Object[]} segments 
   * @returns {Object[]} Training sessions
   */
  extractSessions(segments) {
    const sessions = new Map(); // chatId -> messages
    
    // Group by chat
    for (const segment of segments) {
      if (segment.type !== STA_TYPES.CHAT_USER && segment.type !== STA_TYPES.AI_ADVICE) {
        continue;
      }
      
      const chatId = segment.payload?.chatId || 'default';
      
      if (!sessions.has(chatId)) {
        sessions.set(chatId, []);
      }
      
      sessions.get(chatId).push({
        role: segment.payload?.role || (segment.type === STA_TYPES.CHAT_USER ? 'user' : 'assistant'),
        content: segment.payload?.text || '',
        timestamp: segment.timestamp
      });
    }
    
    // Convert to training format
    const trainingSessions = [];
    
    for (const [chatId, messages] of sessions) {
      // Sort by timestamp
      messages.sort((a, b) => a.timestamp - b.timestamp);
      
      // Only include complete sessions (user + assistant pairs)
      if (messages.length >= 2) {
        trainingSessions.push({
          sessionId: this.anonymizer.getAnonymousId(chatId),
          messages: messages.map(m => ({
            role: m.role,
            content: this.anonymizer.anonymizeText(m.content)
          })),
          messageCount: messages.length,
          duration: messages[messages.length - 1].timestamp - messages[0].timestamp
        });
      }
    }
    
    return trainingSessions;
  }
  
  /**
   * Extract decisions with outcomes for training
   * @param {Object[]} segments 
   * @returns {Object[]}
   */
  extractDecisionOutcomes(segments) {
    const decisions = new Map(); // decisionId -> { decision, outcomes }
    
    for (const segment of segments) {
      if (segment.type === STA_TYPES.BIZ_DECISION) {
        const id = segment.payload?.decisionId || segment.seq;
        decisions.set(id, {
          decision: this.anonymizer.anonymizeSegment(segment),
          outcomes: []
        });
      }
      
      if (segment.type === STA_TYPES.BIZ_OUTCOME && segment.payload?.decisionRef) {
        const ref = segment.payload.decisionRef;
        if (decisions.has(ref)) {
          decisions.get(ref).outcomes.push(
            this.anonymizer.anonymizeSegment(segment)
          );
        }
      }
    }
    
    // Return decisions with at least one outcome
    return Array.from(decisions.values())
      .filter(d => d.outcomes.length > 0);
  }
}

// ============================================================================
// R2 BUCKET CONFIGURATION (Server-side reference)
// ============================================================================

/**
 * R2 bucket configuration for shadow training
 * This is documentation for server-side implementation
 */
export const R2_CONFIG = {
  bucket: 'sovereign-os-training',
  region: 'auto',
  prefix: 'shadow/',
  
  // Lifecycle rules
  lifecycle: {
    // Delete raw uploads after processing
    rawRetention: 7, // days
    // Keep processed training data
    processedRetention: 365 // days
  },
  
  // Access control
  cors: {
    allowedOrigins: ['https://sovereignos.app'],
    allowedMethods: ['POST'],
    allowedHeaders: ['Content-Type']
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

export const anonymizer = new Anonymizer();
