// BalanceChain / Sovereign Business OS
// Main entry point - exports all modules

// ============================================================================
// CORE MODULES
// ============================================================================

// Constants
export * from './constants.js';

// Cryptography
export * from './crypto.js';

// IndexedDB
export * from './idb.js';

// Segment structure
export * from './segment.js';

// Validation
export * from './validation.js';

// State management
export { StateManager, state } from './state.js';

// ============================================================================
// BUSINESS LOGIC
// ============================================================================

// Caps tracking
export { CapsTracker, getTimeUntilDailyReset, formatCapsProgress } from './caps.js';

// Identity management
export { IdentityManager, formatHid, isValidHid } from './identity.js';

// TVM tokens
export { 
  CapsuleManager, 
  TVMBalanceManager, 
  mintTVM,
  calculateRichScore,
  calculateBusinessScore,
  detectMotivator,
  detectCategory
} from './tvm.js';

// AI Council
export { 
  AICouncil, 
  council,
  checkKillSwitch,
  CHARACTER_PROMPTS
} from './council.js';

// ECF Pricing
export {
  ECFCalculator,
  ecf,
  SUBSCRIPTION_PLANS,
  getPlanPricing
} from './ecf.js';

// ============================================================================
// NETWORKING
// ============================================================================

// P2P
export { P2PManager, p2p } from './p2p.js';

// Signaling
export { SignalClient, LocalSignalServer, localSignalServer } from './signal.js';

// ============================================================================
// DATA & SEARCH
// ============================================================================

// Knowledge Base
export { KBManager, initKB, kbIndexMessage, kbSearch, kbUpsertMessage } from './kb.js';

// ============================================================================
// INTEGRITY & SECURITY
// ============================================================================

// Chain integrity
export {
  verifyChainIntegrity,
  verifyBackupRestoreEligibility,
  detectClonedDevice,
  scanForCorruption,
  enterReadOnlyMode,
  isReadOnlyMode,
  exitReadOnlyMode,
  getChainStats,
  generateIntegrityReport
} from './integrity.js';

// ============================================================================
// PAYMENTS
// ============================================================================

export {
  PAYMENT_PROVIDERS,
  PAYMENT_STATUS,
  StripePaymentHandler,
  CoinbasePaymentHandler,
  SubscriptionManager,
  recordPayment,
  getPaymentHistory,
  stripe,
  coinbase
} from './payments.js';

// ============================================================================
// SHADOW TRAINING
// ============================================================================

export {
  Anonymizer,
  ShadowTrainingManager,
  SessionExtractor,
  R2_CONFIG,
  anonymizer
} from './shadow.js';

// ============================================================================
// APPLICATION BOOTSTRAP
// ============================================================================

import { openDatabase } from './idb.js';
import { StateManager } from './state.js';
import { IdentityManager } from './identity.js';
import { CapsTracker } from './caps.js';
import { KBManager } from './kb.js';
import { CapsuleManager, TVMBalanceManager } from './tvm.js';
import { verifyChainIntegrity, isReadOnlyMode, enterReadOnlyMode } from './integrity.js';

/**
 * Initialize the entire application
 * @param {Object} [options]
 * @param {boolean} [options.requireBiometric] - Require biometric for identity
 * @param {boolean} [options.verifyIntegrity] - Verify chain on startup
 * @returns {Promise<AppContext>}
 */
export async function initializeApp(options = {}) {
  console.log('[App] Initializing Sovereign Business OS...');
  
  // Open database
  const db = await openDatabase();
  console.log('[App] Database opened');
  
  // Initialize identity
  const identityManager = new IdentityManager(db);
  const { hid, isNew } = await identityManager.init({
    requireBiometric: options.requireBiometric
  });
  console.log(`[App] Identity: ${hid} (${isNew ? 'new' : 'existing'})`);
  
  // Initialize caps tracker
  const capsTracker = new CapsTracker(db);
  
  // Initialize state manager
  const stateManager = new StateManager();
  await stateManager.init({
    identity: {
      hid,
      pubJwk: identityManager.getIdentity().pubJwk,
      privateKey: identityManager.getIdentity().privateKey
    },
    capsTracker
  });
  
  // Verify chain integrity if requested
  if (options.verifyIntegrity !== false) {
    const integrity = await verifyChainIntegrity(db);
    
    if (!integrity.ok) {
      console.error('[App] Chain integrity check failed!', integrity.errors);
      await enterReadOnlyMode(db);
    } else {
      console.log(`[App] Chain integrity verified: ${integrity.verified} blocks`);
    }
  }
  
  // Check read-only mode
  const readOnly = await isReadOnlyMode(db);
  if (readOnly) {
    console.warn('[App] Running in read-only mode');
  }
  
  // Initialize KB
  const kbManager = new KBManager(db);
  
  // Initialize TVM managers
  const capsuleManager = new CapsuleManager(db);
  const tvmBalanceManager = new TVMBalanceManager(db);
  
  // Get initial balance
  const tvmBalance = await tvmBalanceManager.getBalance(hid);
  const caps = await capsTracker.getCurrentCaps(hid);
  
  console.log(`[App] TVM Balance: ${tvmBalance}`);
  console.log(`[App] Caps: daily=${caps.daily}/${caps.limits.daily}`);
  
  const context = {
    db,
    hid,
    isNew,
    readOnly,
    identityManager,
    stateManager,
    capsTracker,
    kbManager,
    capsuleManager,
    tvmBalanceManager,
    
    // Convenience methods
    async commitAction(type, payload) {
      if (readOnly) {
        return { ok: false, reason: 'read_only_mode' };
      }
      return stateManager.commitAction(type, payload);
    },
    
    async getCaps() {
      return capsTracker.getCurrentCaps(hid);
    },
    
    async getTVMBalance() {
      return tvmBalanceManager.getBalance(hid);
    },
    
    getTheme() {
      return stateManager.getTheme();
    },
    
    getRichScore() {
      return stateManager.getRichScore();
    }
  };
  
  console.log('[App] Initialization complete');
  
  return context;
}

// ============================================================================
// VERSION INFO
// ============================================================================

export const VERSION = {
  major: 2,
  minor: 0,
  patch: 0,
  build: 'production',
  protocol: 2,
  codename: 'SovereignOS'
};

export function getVersionString() {
  return `${VERSION.major}.${VERSION.minor}.${VERSION.patch}-${VERSION.build}`;
}
