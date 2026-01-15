// BalanceChain IndexedDB Utilities
// Improved helpers with proper transaction handling and migration support

import { DB_NAME, DB_VERSION, STORES } from './constants.js';

// ============================================================================
// DATABASE OPENING & MIGRATION
// ============================================================================

/**
 * Open the database with proper schema migration
 * @returns {Promise<IDBDatabase>}
 */
export async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;
      
      console.log(`[IDB] Upgrading from v${oldVersion} to v${DB_VERSION}`);
      
      // Version 1 -> 2 migration (or fresh install)
      migrateSchema(db, oldVersion);
    };
    
    request.onsuccess = () => {
      const db = request.result;
      
      // Handle connection errors
      db.onerror = (e) => {
        console.error('[IDB] Database error:', e.target.error);
      };
      
      db.onversionchange = () => {
        db.close();
        console.warn('[IDB] Database version changed, please reload');
      };
      
      resolve(db);
    };
    
    request.onerror = () => {
      reject(new Error(`[IDB] Failed to open database: ${request.error?.message}`));
    };
    
    request.onblocked = () => {
      reject(new Error('[IDB] Database blocked - close other tabs'));
    };
  });
}

/**
 * Migrate database schema
 * @param {IDBDatabase} db 
 * @param {number} oldVersion 
 */
function migrateSchema(db, oldVersion) {
  // Create all stores if fresh install
  if (oldVersion < 1) {
    // Meta store for key-value pairs
    if (!db.objectStoreNames.contains(STORES.META)) {
      db.createObjectStore(STORES.META, { keyPath: 'key' });
    }
    
    // State chain store (STAs)
    if (!db.objectStoreNames.contains(STORES.STATE_CHAIN)) {
      const chainStore = db.createObjectStore(STORES.STATE_CHAIN, { keyPath: 'seq' });
      chainStore.createIndex('by_type', 'type', { unique: false });
      chainStore.createIndex('by_timestamp', 'timestamp', { unique: false });
      chainStore.createIndex('by_nonce', 'nonce', { unique: true });
    }
    
    // Sync log for nonce replay protection
    if (!db.objectStoreNames.contains(STORES.SYNC_LOG)) {
      const syncStore = db.createObjectStore(STORES.SYNC_LOG, { keyPath: 'nonce' });
      syncStore.createIndex('by_ts', 'ts', { unique: false });
    }
    
    // Messages projection
    if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
      const msgStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' });
      msgStore.createIndex('by_seq', 'seq', { unique: false });
      msgStore.createIndex('by_peer', 'peer', { unique: false });
      msgStore.createIndex('by_ts', 'ts', { unique: false });
      msgStore.createIndex('by_tag', 'tag', { unique: false });
    }
    
    // Identity store
    if (!db.objectStoreNames.contains(STORES.IDENTITY)) {
      db.createObjectStore(STORES.IDENTITY, { keyPath: 'id' });
    }
    
    // KB stores
    if (!db.objectStoreNames.contains(STORES.KB_DOCS)) {
      const kbStore = db.createObjectStore(STORES.KB_DOCS, { keyPath: 'id' });
      kbStore.createIndex('by_peer', 'peerHid', { unique: false });
      kbStore.createIndex('by_ts', 'ts', { unique: false });
    }
    
    if (!db.objectStoreNames.contains(STORES.KB_TERMS)) {
      db.createObjectStore(STORES.KB_TERMS, { keyPath: 'term' });
    }
    
    if (!db.objectStoreNames.contains(STORES.KB_ENTITIES)) {
      db.createObjectStore(STORES.KB_ENTITIES, { keyPath: 'key' });
    }
  }
  
  // Version 2 additions
  if (oldVersion < 2) {
    // Caps tracking store
    if (!db.objectStoreNames.contains(STORES.CAPS)) {
      const capsStore = db.createObjectStore(STORES.CAPS, { keyPath: 'period' });
      capsStore.createIndex('by_type', 'type', { unique: false });
    }
    
    // TVM Capsules store
    if (!db.objectStoreNames.contains(STORES.CAPSULES)) {
      const capsuleStore = db.createObjectStore(STORES.CAPSULES, { keyPath: 'id' });
      capsuleStore.createIndex('by_session', 'sessionId', { unique: false });
      capsuleStore.createIndex('by_status', 'status', { unique: false });
      capsuleStore.createIndex('by_ts', 'createdAt', { unique: false });
    }
    
    // TVM Balance store
    if (!db.objectStoreNames.contains(STORES.TVM_BALANCE)) {
      const tvmStore = db.createObjectStore(STORES.TVM_BALANCE, { keyPath: 'id' });
      tvmStore.createIndex('by_hid', 'hid', { unique: true });
    }
  }
}

// ============================================================================
// TRANSACTION HELPERS
// ============================================================================

/**
 * Wait for transaction to complete
 * @param {IDBTransaction} tx 
 * @returns {Promise<void>}
 */
export function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Transaction error'));
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

/**
 * Wait for request to complete
 * @param {IDBRequest} req 
 * @returns {Promise<any>}
 */
export function reqDone(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Request error'));
  });
}

/**
 * Execute a single operation in a transaction
 * @param {IDBDatabase} db 
 * @param {string} storeName 
 * @param {string} mode - 'readonly' | 'readwrite'
 * @param {function} operation - (store) => IDBRequest
 * @returns {Promise<any>}
 */
export async function withStore(db, storeName, mode, operation) {
  const tx = db.transaction([storeName], mode);
  const store = tx.objectStore(storeName);
  const result = await reqDone(operation(store));
  await txDone(tx);
  return result;
}

/**
 * Execute operations across multiple stores atomically
 * @param {IDBDatabase} db 
 * @param {string[]} storeNames 
 * @param {string} mode 
 * @param {function} operation - (stores: {[name]: IDBObjectStore}, tx: IDBTransaction) => Promise<any>
 * @returns {Promise<any>}
 */
export async function withStores(db, storeNames, mode, operation) {
  const tx = db.transaction(storeNames, mode);
  const stores = {};
  for (const name of storeNames) {
    stores[name] = tx.objectStore(name);
  }
  const result = await operation(stores, tx);
  await txDone(tx);
  return result;
}

// ============================================================================
// META STORE HELPERS
// ============================================================================

/**
 * Get value from meta store
 * @param {IDBDatabase} db 
 * @param {string} key 
 * @returns {Promise<any>}
 */
export async function getMeta(db, key) {
  const record = await withStore(db, STORES.META, 'readonly', 
    store => store.get(key)
  );
  return record?.value ?? null;
}

/**
 * Set value in meta store
 * @param {IDBDatabase} db 
 * @param {string} key 
 * @param {any} value 
 * @returns {Promise<void>}
 */
export async function setMeta(db, key, value) {
  await withStore(db, STORES.META, 'readwrite',
    store => store.put({ key, value })
  );
}

/**
 * Delete value from meta store
 * @param {IDBDatabase} db 
 * @param {string} key 
 * @returns {Promise<void>}
 */
export async function deleteMeta(db, key) {
  await withStore(db, STORES.META, 'readwrite',
    store => store.delete(key)
  );
}

// ============================================================================
// CHAIN HELPERS
// ============================================================================

/**
 * Get current chain head hash
 * @param {IDBDatabase} db 
 * @returns {Promise<string>}
 */
export async function getChainHead(db) {
  return await getMeta(db, 'chain_head') || 'GENESIS';
}

/**
 * Get current chain length
 * @param {IDBDatabase} db 
 * @returns {Promise<number>}
 */
export async function getChainLen(db) {
  return (await getMeta(db, 'chain_len')) || 0;
}

/**
 * Get all STAs in sequence order
 * @param {IDBDatabase} db 
 * @returns {Promise<any[]>}
 */
export async function getAllSTAs(db) {
  const results = await withStore(db, STORES.STATE_CHAIN, 'readonly',
    store => store.getAll()
  );
  return (results || []).sort((a, b) => a.seq - b.seq);
}

/**
 * Get STA by sequence number
 * @param {IDBDatabase} db 
 * @param {number} seq 
 * @returns {Promise<any>}
 */
export async function getSTABySeq(db, seq) {
  return await withStore(db, STORES.STATE_CHAIN, 'readonly',
    store => store.get(seq)
  );
}

/**
 * Get STAs by type
 * @param {IDBDatabase} db 
 * @param {string} type 
 * @returns {Promise<any[]>}
 */
export async function getSTAsByType(db, type) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.STATE_CHAIN], 'readonly');
    const store = tx.objectStore(STORES.STATE_CHAIN);
    const index = store.index('by_type');
    const request = index.getAll(type);
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// NONCE / REPLAY PROTECTION
// ============================================================================

/**
 * Check if nonce exists (replay check)
 * @param {IDBDatabase} db 
 * @param {string} nonce 
 * @returns {Promise<boolean>}
 */
export async function nonceExists(db, nonce) {
  const record = await withStore(db, STORES.SYNC_LOG, 'readonly',
    store => store.get(nonce)
  );
  return !!record;
}

/**
 * Add nonce to replay log
 * @param {IDBDatabase} db 
 * @param {string} nonce 
 * @param {number} timestamp 
 * @returns {Promise<void>}
 */
export async function addNonce(db, nonce, timestamp) {
  await withStore(db, STORES.SYNC_LOG, 'readwrite',
    store => store.add({ nonce, ts: timestamp })
  );
}

/**
 * Cleanup old nonces (call periodically)
 * @param {IDBDatabase} db 
 * @param {number} maxAgeMs 
 * @returns {Promise<number>} Number of removed entries
 */
export async function cleanupOldNonces(db, maxAgeMs) {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.SYNC_LOG], 'readwrite');
    const store = tx.objectStore(STORES.SYNC_LOG);
    const index = store.index('by_ts');
    const range = IDBKeyRange.upperBound(cutoff);
    const cursor = index.openCursor(range);
    
    cursor.onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        c.delete();
        removed++;
        c.continue();
      }
    };
    
    tx.oncomplete = () => resolve(removed);
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================================
// MESSAGES HELPERS
// ============================================================================

/**
 * Get messages for a peer/chat
 * @param {IDBDatabase} db 
 * @param {string} peer 
 * @returns {Promise<any[]>}
 */
export async function getMessagesByPeer(db, peer) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.MESSAGES], 'readonly');
    const store = tx.objectStore(STORES.MESSAGES);
    const index = store.index('by_peer');
    const request = index.getAll(peer);
    
    request.onsuccess = () => {
      const results = request.result || [];
      results.sort((a, b) => (a.seq || 0) - (b.seq || 0));
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all messages
 * @param {IDBDatabase} db 
 * @returns {Promise<any[]>}
 */
export async function getAllMessages(db) {
  const results = await withStore(db, STORES.MESSAGES, 'readonly',
    store => store.getAll()
  );
  return (results || []).sort((a, b) => (a.seq || 0) - (b.seq || 0));
}

// ============================================================================
// DATABASE UTILITIES
// ============================================================================

/**
 * Clear all data (for testing/reset)
 * @param {IDBDatabase} db 
 * @returns {Promise<void>}
 */
export async function clearAllData(db) {
  const storeNames = Array.from(db.objectStoreNames);
  const tx = db.transaction(storeNames, 'readwrite');
  
  for (const name of storeNames) {
    tx.objectStore(name).clear();
  }
  
  await txDone(tx);
  console.log('[IDB] All data cleared');
}

/**
 * Get database statistics
 * @param {IDBDatabase} db 
 * @returns {Promise<{[store: string]: number}>}
 */
export async function getDatabaseStats(db) {
  const stats = {};
  const storeNames = Array.from(db.objectStoreNames);
  
  for (const name of storeNames) {
    const count = await withStore(db, name, 'readonly',
      store => store.count()
    );
    stats[name] = count;
  }
  
  return stats;
}

/**
 * Export all data for backup
 * @param {IDBDatabase} db 
 * @returns {Promise<{[store: string]: any[]}>}
 */
export async function exportAllData(db) {
  const data = {};
  const storeNames = Array.from(db.objectStoreNames);
  
  for (const name of storeNames) {
    data[name] = await withStore(db, name, 'readonly',
      store => store.getAll()
    );
  }
  
  return data;
}

/**
 * Delete the entire database
 * @returns {Promise<void>}
 */
export async function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database deletion blocked'));
  });
}
