// BalanceChain Caps Tracking Module
// Tracks and enforces daily/monthly/yearly segment caps

import {
  DAILY_CAP,
  MONTHLY_CAP,
  YEARLY_CAP,
  INITIAL_UNLOCKED_SEGMENTS,
  STORES
} from './constants.js';

import { withStore, txDone, reqDone } from './idb.js';

// ============================================================================
// CAPS TRACKER CLASS
// ============================================================================

/**
 * Tracks segment caps per identity
 */
export class CapsTracker {
  constructor(db) {
    this.db = db;
    this.cache = new Map(); // hid -> { daily, monthly, yearly, lastReset }
  }
  
  /**
   * Get current caps for an identity
   * @param {string} hid - Human ID
   * @returns {Promise<{daily: number, monthly: number, yearly: number, available: number}>}
   */
  async getCurrentCaps(hid) {
    // Check cache first
    const cached = this.cache.get(hid);
    const now = Date.now();
    
    if (cached && !this.needsReset(cached, now)) {
      return this.formatCaps(cached);
    }
    
    // Load from database
    const caps = await this.loadCaps(hid);
    
    // Check if needs reset
    const reset = this.applyResets(caps, now);
    
    if (reset) {
      await this.saveCaps(hid, caps);
    }
    
    // Cache it
    this.cache.set(hid, caps);
    
    return this.formatCaps(caps);
  }
  
  /**
   * Increment caps for an action
   * @param {string} hid - Human ID
   * @param {number} [amount=1] - Amount to increment
   * @returns {Promise<{ok: boolean, caps?: object, reason?: string}>}
   */
  async incrementCaps(hid, amount = 1) {
    const caps = await this.getCurrentCaps(hid);
    
    // Check limits
    if (caps.daily + amount > DAILY_CAP) {
      return { ok: false, reason: 'daily_cap_exceeded', caps };
    }
    
    if (caps.monthly + amount > MONTHLY_CAP) {
      return { ok: false, reason: 'monthly_cap_exceeded', caps };
    }
    
    if (caps.yearly + amount > YEARLY_CAP) {
      return { ok: false, reason: 'yearly_cap_exceeded', caps };
    }
    
    // Get internal record
    const record = this.cache.get(hid) || await this.loadCaps(hid);
    
    // Increment
    record.daily += amount;
    record.monthly += amount;
    record.yearly += amount;
    record.total += amount;
    
    // Save
    await this.saveCaps(hid, record);
    this.cache.set(hid, record);
    
    return { ok: true, caps: this.formatCaps(record) };
  }
  
  /**
   * Load caps from database
   * @param {string} hid 
   * @returns {Promise<Object>}
   */
  async loadCaps(hid) {
    try {
      const tx = this.db.transaction([STORES.CAPS], 'readonly');
      const store = tx.objectStore(STORES.CAPS);
      
      const dailyRec = await reqDone(store.get(`daily:${hid}`));
      const monthlyRec = await reqDone(store.get(`monthly:${hid}`));
      const yearlyRec = await reqDone(store.get(`yearly:${hid}`));
      const totalRec = await reqDone(store.get(`total:${hid}`));
      
      return {
        daily: dailyRec?.count || 0,
        monthly: monthlyRec?.count || 0,
        yearly: yearlyRec?.count || 0,
        total: totalRec?.count || 0,
        dailyReset: dailyRec?.resetAt || 0,
        monthlyReset: monthlyRec?.resetAt || 0,
        yearlyReset: yearlyRec?.resetAt || 0
      };
    } catch (e) {
      console.error('[Caps] Load error:', e);
      return this.createEmptyCaps();
    }
  }
  
  /**
   * Save caps to database
   * @param {string} hid 
   * @param {Object} caps 
   * @returns {Promise<void>}
   */
  async saveCaps(hid, caps) {
    const tx = this.db.transaction([STORES.CAPS], 'readwrite');
    const store = tx.objectStore(STORES.CAPS);
    
    store.put({
      period: `daily:${hid}`,
      type: 'daily',
      hid,
      count: caps.daily,
      resetAt: caps.dailyReset
    });
    
    store.put({
      period: `monthly:${hid}`,
      type: 'monthly',
      hid,
      count: caps.monthly,
      resetAt: caps.monthlyReset
    });
    
    store.put({
      period: `yearly:${hid}`,
      type: 'yearly',
      hid,
      count: caps.yearly,
      resetAt: caps.yearlyReset
    });
    
    store.put({
      period: `total:${hid}`,
      type: 'total',
      hid,
      count: caps.total,
      resetAt: 0
    });
    
    await txDone(tx);
  }
  
  /**
   * Create empty caps record
   * @returns {Object}
   */
  createEmptyCaps() {
    const now = Date.now();
    return {
      daily: 0,
      monthly: 0,
      yearly: 0,
      total: 0,
      dailyReset: this.getNextDailyReset(now),
      monthlyReset: this.getNextMonthlyReset(now),
      yearlyReset: this.getNextYearlyReset(now)
    };
  }
  
  /**
   * Check if caps need reset
   * @param {Object} caps 
   * @param {number} now 
   * @returns {boolean}
   */
  needsReset(caps, now) {
    return now >= caps.dailyReset || 
           now >= caps.monthlyReset || 
           now >= caps.yearlyReset;
  }
  
  /**
   * Apply resets if needed
   * @param {Object} caps 
   * @param {number} now 
   * @returns {boolean} Whether any reset occurred
   */
  applyResets(caps, now) {
    let reset = false;
    
    if (now >= caps.dailyReset) {
      caps.daily = 0;
      caps.dailyReset = this.getNextDailyReset(now);
      reset = true;
    }
    
    if (now >= caps.monthlyReset) {
      caps.monthly = 0;
      caps.monthlyReset = this.getNextMonthlyReset(now);
      reset = true;
    }
    
    if (now >= caps.yearlyReset) {
      caps.yearly = 0;
      caps.yearlyReset = this.getNextYearlyReset(now);
      reset = true;
    }
    
    return reset;
  }
  
  /**
   * Format caps for external use
   * @param {Object} caps 
   * @returns {Object}
   */
  formatCaps(caps) {
    return {
      daily: caps.daily,
      monthly: caps.monthly,
      yearly: caps.yearly,
      total: caps.total,
      available: {
        daily: DAILY_CAP - caps.daily,
        monthly: MONTHLY_CAP - caps.monthly,
        yearly: YEARLY_CAP - caps.yearly
      },
      limits: {
        daily: DAILY_CAP,
        monthly: MONTHLY_CAP,
        yearly: YEARLY_CAP
      }
    };
  }
  
  /**
   * Get next daily reset time (midnight UTC)
   * @param {number} now 
   * @returns {number}
   */
  getNextDailyReset(now) {
    const date = new Date(now);
    date.setUTCHours(24, 0, 0, 0);
    return date.getTime();
  }
  
  /**
   * Get next monthly reset time (1st of next month UTC)
   * @param {number} now 
   * @returns {number}
   */
  getNextMonthlyReset(now) {
    const date = new Date(now);
    date.setUTCMonth(date.getUTCMonth() + 1, 1);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
  }
  
  /**
   * Get next yearly reset time (Jan 1 next year UTC)
   * @param {number} now 
   * @returns {number}
   */
  getNextYearlyReset(now) {
    const date = new Date(now);
    date.setUTCFullYear(date.getUTCFullYear() + 1, 0, 1);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
  }
  
  /**
   * Get unlocked balance for identity
   * @param {string} hid 
   * @returns {Promise<number>}
   */
  async getUnlockedBalance(hid) {
    const caps = await this.getCurrentCaps(hid);
    // Initial balance + unlocked through transactions
    return INITIAL_UNLOCKED_SEGMENTS + caps.total;
  }
  
  /**
   * Check if can unlock more segments
   * @param {string} hid 
   * @param {number} amount 
   * @returns {Promise<{ok: boolean, reason?: string}>}
   */
  async canUnlock(hid, amount) {
    const caps = await this.getCurrentCaps(hid);
    
    if (caps.available.daily < amount) {
      return { ok: false, reason: 'daily_limit' };
    }
    
    if (caps.available.monthly < amount) {
      return { ok: false, reason: 'monthly_limit' };
    }
    
    if (caps.available.yearly < amount) {
      return { ok: false, reason: 'yearly_limit' };
    }
    
    return { ok: true };
  }
  
  /**
   * Clear cache (for testing)
   */
  clearCache() {
    this.cache.clear();
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get time until daily reset
 * @returns {{hours: number, minutes: number, seconds: number}}
 */
export function getTimeUntilDailyReset() {
  const now = new Date();
  const nextReset = new Date(now);
  nextReset.setUTCHours(24, 0, 0, 0);
  
  const diff = nextReset.getTime() - now.getTime();
  
  return {
    hours: Math.floor(diff / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000)
  };
}

/**
 * Format caps as progress bars (for UI)
 * @param {Object} caps 
 * @returns {Object}
 */
export function formatCapsProgress(caps) {
  return {
    daily: {
      used: caps.daily,
      limit: DAILY_CAP,
      percent: Math.round((caps.daily / DAILY_CAP) * 100)
    },
    monthly: {
      used: caps.monthly,
      limit: MONTHLY_CAP,
      percent: Math.round((caps.monthly / MONTHLY_CAP) * 100)
    },
    yearly: {
      used: caps.yearly,
      limit: YEARLY_CAP,
      percent: Math.round((caps.yearly / YEARLY_CAP) * 100)
    }
  };
}
