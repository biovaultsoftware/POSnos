// BalanceChain Protocol Constants
// DO NOT MODIFY: These values are consensus-critical

export const PROTOCOL_VERSION = 2;

// Genesis Configuration
export const GENESIS_HASH = 'GENESIS';
export const GENESIS_TIMESTAMP = 1704067200000; // 2024-01-01T00:00:00Z

// Initial Balance (Layer 0)
export const INITIAL_UNLOCKED_SEGMENTS = 1200;
export const LAYER_1_UNLOCK_MULTIPLIER = 1; // 1200 can unlock another 1200

// Rate Limits (Segments)
export const DAILY_CAP = 3600;
export const MONTHLY_CAP = 36000;
export const YEARLY_CAP = 120000;

// Time Constraints
export const BLOCKS_PER_SECOND = 1;
export const MIN_BLOCK_INTERVAL_MS = 1000; // 1 second minimum between blocks
export const UTC_TOLERANCE_MS = 720000; // ±720 seconds (12 minutes)

// Scoring Thresholds
export const MIN_RICH_SCORE = 70;
export const MIN_BUSINESS_SCORE = 70;
export const MIN_ECF_THRESHOLD = 0.1;
export const CAPSULE_SIMILARITY_THRESHOLD = 0.9;

// Theme Thresholds (Rich Score)
export const THEME_COAL_MAX = 25;
export const THEME_EMBER_MAX = 50;
export const THEME_BRONZE_MAX = 80;
// >= 80 = GOLD

// Session Limits
export const SESSION_MESSAGE_LIMIT = 12;
export const TVM_PER_CAPSULE = 1.0;

// Crypto Configuration
export const ECDSA_CURVE = 'P-256';
export const HASH_ALGORITHM = 'SHA-256';
// Note: Quantum-safe upgrade path: Dilithium/Falcon for signatures, Kyber for KEM, SHA-3 for hashing

// IndexedDB Configuration
export const DB_NAME = 'sovereign_os_v2';
export const DB_VERSION = 2;

// Store Names
export const STORES = {
  META: 'meta',
  STATE_CHAIN: 'state_chain',
  SYNC_LOG: 'sync_log',
  MESSAGES: 'messages',
  IDENTITY: 'identity',
  CAPS: 'caps',
  KB_DOCS: 'kb_docs',
  KB_TERMS: 'kb_terms',
  KB_ENTITIES: 'kb_entities',
  CAPSULES: 'capsules',
  TVM_BALANCE: 'tvm_balance'
};

// STA Types
export const STA_TYPES = {
  CHAT_USER: 'chat.user',
  AI_ADVICE: 'ai.advice',
  BIZ_DECISION: 'biz.decision',
  BIZ_OUTCOME: 'biz.outcome',
  CHAT_APPEND: 'chat.append', // Legacy
  CAPSULE_MINT: 'capsule.mint',
  TVM_TRANSFER: 'tvm.transfer'
};

// Council Characters
export const COUNCIL_MEMBERS = {
  KAREEM: { id: 'kareem', name: 'Kareem', motivator: 'laziness', emoji: '🛌' },
  TURBO: { id: 'turbo', name: 'Turbo', motivator: 'speed', emoji: '🚀' },
  WOLF: { id: 'wolf', name: 'Wolf', motivator: 'greed', emoji: '🐺' },
  LUNA: { id: 'luna', name: 'Luna', motivator: 'satisfaction', emoji: '✨' },
  CAPTAIN: { id: 'captain', name: 'The Captain', motivator: 'security', emoji: '🛡️' },
  TEMPO: { id: 'tempo', name: 'Tempo', motivator: 'time', emoji: '⏱️' },
  HAKIM: { id: 'hakim', name: 'Hakim', motivator: 'wisdom', emoji: '📜' },
  WHEAT: { id: 'wheat', name: 'Uncle Wheat', motivator: 'necessity', emoji: '🌾' },
  TOMMY: { id: 'tommy', name: 'Tommy Tomato', motivator: 'value', emoji: '🍅' },
  ARCHITECT: { id: 'architect', name: 'The Architect', motivator: 'system', emoji: '🏗️' }
};

// ECF Reference Values (Efficiency Country Factor)
// Base: USA = 1.0, adjusted for purchasing power parity
export const ECF_BASE_PRICE_USD = 40;
export const ECF_TIERS = {
  TIER_1: { multiplier: 1.0, examples: ['US', 'UK', 'DE', 'FR', 'AU'] },
  TIER_2: { multiplier: 0.5, examples: ['BR', 'MX', 'TH', 'MY'] },
  TIER_3: { multiplier: 0.25, examples: ['IN', 'PH', 'VN', 'ID'] },
  TIER_4: { multiplier: 0.125, examples: ['EG', 'PK', 'NG', 'KE'] }
};

// Subscription Plans
export const SUBSCRIPTION_PLANS = {
  monthly: { 
    id: 'monthly', 
    name: 'Monthly', 
    basePrice: ECF_BASE_PRICE_USD, 
    interval: 'month',
    features: ['Unlimited AI Council', 'TVM Minting', 'Cloud Backup']
  },
  yearly: { 
    id: 'yearly', 
    name: 'Yearly', 
    basePrice: ECF_BASE_PRICE_USD * 10, // 2 months free
    interval: 'year', 
    discount: 17,
    features: ['Everything in Monthly', '2 Months FREE', 'Priority Support']
  }
};

// Nonce/Replay Protection
export const NONCE_BYTES = 16;
export const NONCE_CLEANUP_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// P2P Configuration
export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302'] },
  { urls: ['stun:stun1.l.google.com:19302'] }
];
export const DC_BUFFER_THRESHOLD = 65536; // 64KB

// Worker Configuration
export const WORKER_TIMEOUT_MS = 30000;
export const WORKER_RETRY_ATTEMPTS = 3;

Object.freeze(PROTOCOL_VERSION);
Object.freeze(GENESIS_HASH);
Object.freeze(STORES);
Object.freeze(STA_TYPES);
Object.freeze(COUNCIL_MEMBERS);
Object.freeze(ECF_TIERS);
Object.freeze(SUBSCRIPTION_PLANS);
