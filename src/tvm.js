// BalanceChain TVM (Time-Value-Money) Module
// Capsule creation, validation, and TVM token management

import {
  STORES,
  STA_TYPES,
  MIN_RICH_SCORE,
  MIN_BUSINESS_SCORE,
  MIN_ECF_THRESHOLD,
  TVM_PER_CAPSULE,
  SESSION_MESSAGE_LIMIT,
  CAPSULE_SIMILARITY_THRESHOLD
} from './constants.js';

import { sha256Hex, randomHex } from './crypto.js';
import { withStore, reqDone, txDone } from './idb.js';

// ============================================================================
// CAPSULE STRUCTURE
// ============================================================================

/**
 * @typedef {Object} TVMCapsule
 * @property {string} id - Capsule ID
 * @property {string} sessionId - Session that created this capsule
 * @property {string} ownerHid - Owner's Human ID
 * @property {number} richScore - Rich score (0-100)
 * @property {number} businessScore - Business score (0-100)
 * @property {number} ecfScore - ECF efficiency score
 * @property {string} motivator - Detected motivator
 * @property {string} category - Business category (wheat/tomato)
 * @property {Object} analysis - Full analysis data
 * @property {string} contentHash - Hash of capsule content
 * @property {string} status - pending/minted/rejected
 * @property {number} createdAt - Creation timestamp
 * @property {number} [mintedAt] - Mint timestamp
 */

// ============================================================================
// CAPSULE MANAGER CLASS
// ============================================================================

export class CapsuleManager {
  constructor(db) {
    this.db = db;
  }
  
  /**
   * Create a new capsule from session data
   * @param {Object} params
   * @param {string} params.sessionId - Session ID
   * @param {string} params.ownerHid - Owner's HID
   * @param {Object[]} params.messages - Session messages
   * @param {Object} params.analysis - Analysis results
   * @returns {Promise<{capsule: TVMCapsule, eligible: boolean, reason?: string}>}
   */
  async createCapsule({ sessionId, ownerHid, messages, analysis }) {
    // Generate capsule ID
    const capsuleId = `CAP-${randomHex(8)}`;
    
    // Extract scores
    const richScore = analysis.richScore || 0;
    const businessScore = analysis.businessScore || 0;
    const ecfScore = analysis.ecfScore || 0;
    
    // Create content hash
    const contentHash = await this.hashCapsuleContent(messages, analysis);
    
    // Create capsule
    const capsule = {
      id: capsuleId,
      sessionId,
      ownerHid,
      richScore,
      businessScore,
      ecfScore,
      motivator: analysis.motivator || 'unknown',
      category: analysis.category || 'unknown',
      rushToRich: {
        startState: analysis.startState || 'rush',
        endState: analysis.endState || 'transition',
        shift: analysis.shift || 0
      },
      timeAnalysis: analysis.timeAnalysis || null,
      actionPlan: analysis.actionPlan || null,
      contentHash,
      messageCount: messages.length,
      status: 'pending',
      createdAt: Date.now()
    };
    
    // Check eligibility
    const eligibility = this.checkEligibility(capsule);
    capsule.status = eligibility.eligible ? 'pending' : 'rejected';
    capsule.rejectionReason = eligibility.reason;
    
    // Store capsule
    await this.storeCapsule(capsule);
    
    return {
      capsule,
      eligible: eligibility.eligible,
      reason: eligibility.reason
    };
  }
  
  /**
   * Check if capsule is eligible for TVM minting
   * @param {TVMCapsule} capsule 
   * @returns {{eligible: boolean, reason?: string}}
   */
  checkEligibility(capsule) {
    // Check Rich Score threshold
    if (capsule.richScore < MIN_RICH_SCORE) {
      return {
        eligible: false,
        reason: `Rich score too low: ${capsule.richScore}/${MIN_RICH_SCORE}`
      };
    }
    
    // Check Business Score threshold
    if (capsule.businessScore < MIN_BUSINESS_SCORE) {
      return {
        eligible: false,
        reason: `Business score too low: ${capsule.businessScore}/${MIN_BUSINESS_SCORE}`
      };
    }
    
    // Check ECF threshold
    if (capsule.ecfScore < MIN_ECF_THRESHOLD) {
      return {
        eligible: false,
        reason: `ECF score too low: ${capsule.ecfScore}/${MIN_ECF_THRESHOLD}`
      };
    }
    
    // Check message count (must complete session)
    if (capsule.messageCount < SESSION_MESSAGE_LIMIT) {
      return {
        eligible: false,
        reason: `Session incomplete: ${capsule.messageCount}/${SESSION_MESSAGE_LIMIT} messages`
      };
    }
    
    return { eligible: true };
  }
  
  /**
   * Hash capsule content for uniqueness
   * @param {Object[]} messages 
   * @param {Object} analysis 
   * @returns {Promise<string>}
   */
  async hashCapsuleContent(messages, analysis) {
    const content = {
      messageTexts: messages.map(m => m.text || '').join('|'),
      motivator: analysis.motivator,
      category: analysis.category,
      richScore: analysis.richScore
    };
    
    return await sha256Hex(JSON.stringify(content));
  }
  
  /**
   * Store capsule in database
   * @param {TVMCapsule} capsule 
   */
  async storeCapsule(capsule) {
    await withStore(this.db, STORES.CAPSULES, 'readwrite',
      store => store.put(capsule)
    );
  }
  
  /**
   * Get capsule by ID
   * @param {string} capsuleId 
   * @returns {Promise<TVMCapsule|null>}
   */
  async getCapsule(capsuleId) {
    return await withStore(this.db, STORES.CAPSULES, 'readonly',
      store => store.get(capsuleId)
    );
  }
  
  /**
   * Get all capsules for owner
   * @param {string} ownerHid 
   * @returns {Promise<TVMCapsule[]>}
   */
  async getCapsulesByOwner(ownerHid) {
    const all = await withStore(this.db, STORES.CAPSULES, 'readonly',
      store => store.getAll()
    );
    
    return (all || []).filter(c => c.ownerHid === ownerHid);
  }
  
  /**
   * Get pending capsules for minting
   * @returns {Promise<TVMCapsule[]>}
   */
  async getPendingCapsules() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORES.CAPSULES], 'readonly');
      const store = tx.objectStore(STORES.CAPSULES);
      const index = store.index('by_status');
      const request = index.getAll('pending');
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * Mark capsule as minted
   * @param {string} capsuleId 
   * @param {number} seq - Chain sequence of mint STA
   * @returns {Promise<void>}
   */
  async markMinted(capsuleId, seq) {
    const capsule = await this.getCapsule(capsuleId);
    if (!capsule) return;
    
    capsule.status = 'minted';
    capsule.mintedAt = Date.now();
    capsule.mintSeq = seq;
    
    await this.storeCapsule(capsule);
  }
  
  /**
   * Find similar capsules for recycling
   * @param {TVMCapsule} capsule 
   * @returns {Promise<TVMCapsule[]>}
   */
  async findSimilarCapsules(capsule) {
    const allMinted = await this.getMintedCapsules();
    
    return allMinted.filter(existing => {
      const similarity = this.calculateSimilarity(capsule, existing);
      return similarity >= CAPSULE_SIMILARITY_THRESHOLD;
    });
  }
  
  /**
   * Calculate similarity between two capsules
   * @param {TVMCapsule} a 
   * @param {TVMCapsule} b 
   * @returns {number} 0-1 similarity score
   */
  calculateSimilarity(a, b) {
    let score = 0;
    let weights = 0;
    
    // Motivator match (weight: 3)
    if (a.motivator === b.motivator) {
      score += 3;
    }
    weights += 3;
    
    // Category match (weight: 2)
    if (a.category === b.category) {
      score += 2;
    }
    weights += 2;
    
    // Rich score proximity (weight: 2)
    const richDiff = Math.abs(a.richScore - b.richScore) / 100;
    score += (1 - richDiff) * 2;
    weights += 2;
    
    // Business score proximity (weight: 2)
    const bizDiff = Math.abs(a.businessScore - b.businessScore) / 100;
    score += (1 - bizDiff) * 2;
    weights += 2;
    
    // ECF proximity (weight: 1)
    const ecfDiff = Math.abs(a.ecfScore - b.ecfScore);
    score += Math.max(0, 1 - ecfDiff) * 1;
    weights += 1;
    
    return score / weights;
  }
  
  /**
   * Get all minted capsules
   * @returns {Promise<TVMCapsule[]>}
   */
  async getMintedCapsules() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORES.CAPSULES], 'readonly');
      const store = tx.objectStore(STORES.CAPSULES);
      const index = store.index('by_status');
      const request = index.getAll('minted');
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
}

// ============================================================================
// TVM BALANCE MANAGER
// ============================================================================

export class TVMBalanceManager {
  constructor(db) {
    this.db = db;
  }
  
  /**
   * Get TVM balance for identity
   * @param {string} hid 
   * @returns {Promise<number>}
   */
  async getBalance(hid) {
    const record = await withStore(this.db, STORES.TVM_BALANCE, 'readonly',
      store => store.get(hid)
    );
    
    return record?.balance || 0;
  }
  
  /**
   * Add TVM to balance (mint)
   * @param {string} hid 
   * @param {number} amount 
   * @returns {Promise<number>} New balance
   */
  async addBalance(hid, amount) {
    const tx = this.db.transaction([STORES.TVM_BALANCE], 'readwrite');
    const store = tx.objectStore(STORES.TVM_BALANCE);
    
    const existing = await reqDone(store.get(hid));
    const currentBalance = existing?.balance || 0;
    const newBalance = currentBalance + amount;
    
    store.put({
      id: hid,
      hid,
      balance: newBalance,
      lastUpdated: Date.now()
    });
    
    await txDone(tx);
    
    return newBalance;
  }
  
  /**
   * Get total TVM supply
   * @returns {Promise<number>}
   */
  async getTotalSupply() {
    const all = await withStore(this.db, STORES.TVM_BALANCE, 'readonly',
      store => store.getAll()
    );
    
    return (all || []).reduce((sum, r) => sum + (r.balance || 0), 0);
  }
  
  /**
   * Get TVM statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const all = await withStore(this.db, STORES.TVM_BALANCE, 'readonly',
      store => store.getAll()
    );
    
    const balances = (all || []).map(r => r.balance || 0);
    
    return {
      totalSupply: balances.reduce((a, b) => a + b, 0),
      holders: balances.length,
      average: balances.length > 0 ? 
        balances.reduce((a, b) => a + b, 0) / balances.length : 0,
      max: Math.max(0, ...balances),
      min: Math.min(Infinity, ...balances)
    };
  }
}

// ============================================================================
// MINTING FUNCTIONS
// ============================================================================

/**
 * Mint TVM for an eligible capsule
 * @param {Object} params
 * @param {StateManager} params.state - State manager
 * @param {CapsuleManager} params.capsuleManager - Capsule manager
 * @param {TVMBalanceManager} params.balanceManager - Balance manager
 * @param {TVMCapsule} params.capsule - Capsule to mint
 * @returns {Promise<{ok: boolean, seq?: number, balance?: number, reason?: string}>}
 */
export async function mintTVM({ state, capsuleManager, balanceManager, capsule }) {
  // Verify capsule is eligible
  if (capsule.status !== 'pending') {
    return { ok: false, reason: `Capsule status is ${capsule.status}` };
  }
  
  const eligibility = capsuleManager.checkEligibility(capsule);
  if (!eligibility.eligible) {
    return { ok: false, reason: eligibility.reason };
  }
  
  // Commit mint action to chain
  const result = await state.commitAction(STA_TYPES.CAPSULE_MINT, {
    capsuleId: capsule.id,
    sessionId: capsule.sessionId,
    richScore: capsule.richScore,
    businessScore: capsule.businessScore,
    capsuleHash: capsule.contentHash
  });
  
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }
  
  // Update capsule status
  await capsuleManager.markMinted(capsule.id, result.seq);
  
  // Add TVM to balance
  const newBalance = await balanceManager.addBalance(capsule.ownerHid, TVM_PER_CAPSULE);
  
  console.log(`[TVM] Minted ${TVM_PER_CAPSULE} TVM for ${capsule.ownerHid}, new balance: ${newBalance}`);
  
  return {
    ok: true,
    seq: result.seq,
    balance: newBalance
  };
}

// ============================================================================
// ANALYSIS HELPERS
// ============================================================================

/**
 * Calculate Rich score from session analysis
 * @param {Object} analysis 
 * @returns {number} 0-100
 */
export function calculateRichScore(analysis) {
  let score = 50; // Base score
  
  // Adjust based on Rush->Rich transition
  if (analysis.endState === 'rich') {
    score += 30;
  } else if (analysis.endState === 'transition') {
    score += 15;
  }
  
  // Adjust based on action plan quality
  if (analysis.actionPlan?.steps?.length > 3) {
    score += 10;
  }
  
  // Adjust based on time awareness
  if (analysis.timeAnalysis?.efficiency > 0.5) {
    score += 10;
  }
  
  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate Business score from session analysis
 * @param {Object} analysis 
 * @returns {number} 0-100
 */
export function calculateBusinessScore(analysis) {
  let score = 50;
  
  // Wheat vs Tomato
  if (analysis.category === 'wheat') {
    score += 20;
  } else if (analysis.category === 'tomato') {
    score += 5;
  }
  
  // Decision quality
  if (analysis.decisions?.filter(d => d.decision === 'ACCEPT').length > 0) {
    score += 15;
  }
  
  // Problem clarity
  if (analysis.problemStructure?.clear) {
    score += 15;
  }
  
  return Math.min(100, Math.max(0, score));
}

/**
 * Detect motivator from conversation
 * @param {Object[]} messages 
 * @returns {string}
 */
export function detectMotivator(messages) {
  const text = messages.map(m => m.text || '').join(' ').toLowerCase();
  
  const patterns = {
    laziness: ['easy', 'automate', 'passive', 'effortless', 'sleep', 'system'],
    speed: ['fast', 'quick', 'now', 'today', 'asap', 'urgent', 'immediately'],
    greed: ['scale', 'multiply', 'leverage', 'roi', '10x', 'more', 'maximum'],
    satisfaction: ['quality', 'enjoy', 'love', 'passion', 'fulfilling', 'happy'],
    security: ['safe', 'secure', 'protect', 'risk', 'insurance', 'stable']
  };
  
  let maxCount = 0;
  let detected = 'unknown';
  
  for (const [motivator, keywords] of Object.entries(patterns)) {
    const count = keywords.filter(k => text.includes(k)).length;
    if (count > maxCount) {
      maxCount = count;
      detected = motivator;
    }
  }
  
  return detected;
}

/**
 * Detect business category (wheat vs tomato)
 * @param {Object[]} messages 
 * @returns {'wheat'|'tomato'|'unknown'}
 */
export function detectCategory(messages) {
  const text = messages.map(m => m.text || '').join(' ').toLowerCase();
  
  const wheatSignals = ['need', 'essential', 'utility', 'infrastructure', 
                        'survival', 'basic', 'transport', 'food', 'water'];
  const tomatoSignals = ['luxury', 'brand', 'premium', 'fancy', 'trendy',
                         'artisan', 'boutique', 'exclusive', 'unique'];
  
  const wheatCount = wheatSignals.filter(s => text.includes(s)).length;
  const tomatoCount = tomatoSignals.filter(s => text.includes(s)).length;
  
  if (wheatCount > tomatoCount + 1) return 'wheat';
  if (tomatoCount > wheatCount + 1) return 'tomato';
  return 'unknown';
}
