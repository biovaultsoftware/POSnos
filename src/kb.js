// BalanceChain Knowledge Base Module
// Fixed transaction handling for offline search

import { STORES } from './constants.js';
import { withStore, txDone, reqDone } from './idb.js';

// ============================================================================
// KB MANAGER CLASS
// ============================================================================

export class KBManager {
  constructor(db) {
    this.db = db;
    this.stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this',
      'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
      'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all',
      'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very'
    ]);
  }
  
  /**
   * Index a message for search
   * @param {Object} message
   * @returns {Promise<void>}
   */
  async indexMessage(message) {
    if (!message.id || !message.text) return;
    
    // Create document record
    const doc = {
      id: message.id,
      peerHid: message.peer || 'default',
      text: message.text,
      ts: message.ts || Date.now(),
      type: message.type,
      seq: message.seq
    };
    
    // Extract terms
    const terms = this.tokenize(message.text);
    
    // Extract entities
    const entities = this.extractEntities(message.text);
    
    // Store everything in a single transaction
    await this.storeIndexData(doc, terms, entities);
  }
  
  /**
   * Store index data atomically
   * @param {Object} doc 
   * @param {string[]} terms 
   * @param {Object[]} entities 
   */
  async storeIndexData(doc, terms, entities) {
    const storeNames = [STORES.KB_DOCS, STORES.KB_TERMS, STORES.KB_ENTITIES];
    const tx = this.db.transaction(storeNames, 'readwrite');
    
    const docStore = tx.objectStore(STORES.KB_DOCS);
    const termStore = tx.objectStore(STORES.KB_TERMS);
    const entityStore = tx.objectStore(STORES.KB_ENTITIES);
    
    // Store document
    docStore.put(doc);
    
    // Update term index - collect all operations first
    const termOps = [];
    for (const term of terms) {
      termOps.push({ term, docId: doc.id });
    }
    
    // Execute term operations
    for (const op of termOps) {
      const existing = await reqDone(termStore.get(op.term));
      const docIds = existing?.docIds || [];
      
      if (!docIds.includes(op.docId)) {
        docIds.push(op.docId);
        termStore.put({ term: op.term, docIds });
      }
    }
    
    // Store entities - collect all operations first
    for (const entity of entities) {
      const key = `${entity.type}:${entity.value}`;
      const existing = await reqDone(entityStore.get(key));
      const docIds = existing?.docIds || [];
      
      if (!docIds.includes(doc.id)) {
        docIds.push(doc.id);
        entityStore.put({
          key,
          type: entity.type,
          value: entity.value,
          docIds
        });
      }
    }
    
    await txDone(tx);
  }
  
  /**
   * Search for messages
   * @param {string} query 
   * @param {Object} [options]
   * @returns {Promise<Object[]>}
   */
  async search(query, options = {}) {
    const terms = this.tokenize(query);
    
    if (terms.length === 0) {
      return [];
    }
    
    // Get document IDs for each term
    const termDocIds = await this.getTermDocIds(terms);
    
    // Intersect results if multiple terms
    let matchingDocIds;
    if (termDocIds.length === 0) {
      return [];
    } else if (termDocIds.length === 1) {
      matchingDocIds = termDocIds[0];
    } else {
      // Intersection of all term results
      matchingDocIds = termDocIds[0].filter(id =>
        termDocIds.every(ids => ids.includes(id))
      );
    }
    
    // Limit results
    const limit = options.limit || 20;
    matchingDocIds = matchingDocIds.slice(0, limit * 2);
    
    // Fetch documents
    const docs = await this.getDocuments(matchingDocIds);
    
    // Score and sort
    const scored = docs.map(doc => ({
      ...doc,
      score: this.scoreDocument(doc, terms)
    }));
    
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, limit);
  }
  
  /**
   * Get document IDs for terms
   * @param {string[]} terms 
   * @returns {Promise<string[][]>}
   */
  async getTermDocIds(terms) {
    const results = [];
    
    const tx = this.db.transaction([STORES.KB_TERMS], 'readonly');
    const store = tx.objectStore(STORES.KB_TERMS);
    
    for (const term of terms) {
      const record = await reqDone(store.get(term));
      if (record?.docIds?.length > 0) {
        results.push(record.docIds);
      }
    }
    
    return results;
  }
  
  /**
   * Get documents by IDs
   * @param {string[]} docIds 
   * @returns {Promise<Object[]>}
   */
  async getDocuments(docIds) {
    const docs = [];
    
    const tx = this.db.transaction([STORES.KB_DOCS], 'readonly');
    const store = tx.objectStore(STORES.KB_DOCS);
    
    for (const id of docIds) {
      const doc = await reqDone(store.get(id));
      if (doc) {
        docs.push(doc);
      }
    }
    
    return docs;
  }
  
  /**
   * Score document relevance
   * @param {Object} doc 
   * @param {string[]} queryTerms 
   * @returns {number}
   */
  scoreDocument(doc, queryTerms) {
    let score = 0;
    const docTerms = this.tokenize(doc.text);
    
    for (const queryTerm of queryTerms) {
      // Term frequency
      const tf = docTerms.filter(t => t === queryTerm).length;
      score += tf;
      
      // Exact phrase bonus
      if (doc.text.toLowerCase().includes(queryTerm)) {
        score += 2;
      }
    }
    
    // Recency bonus (more recent = higher score)
    const ageHours = (Date.now() - doc.ts) / (1000 * 60 * 60);
    score += Math.max(0, 10 - ageHours / 24); // Decay over 10 days
    
    return score;
  }
  
  /**
   * Tokenize text into searchable terms
   * @param {string} text 
   * @returns {string[]}
   */
  tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    
    // Split on whitespace and punctuation
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);
    
    // Remove stop words and limit
    return words
      .filter(w => !this.stopWords.has(w))
      .slice(0, 100); // Limit to prevent memory issues
  }
  
  /**
   * Extract entities from text
   * @param {string} text 
   * @returns {Object[]}
   */
  extractEntities(text) {
    const entities = [];
    
    // Extract phone numbers
    const phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
    const phones = text.match(phonePattern) || [];
    for (const phone of phones) {
      entities.push({ type: 'phone', value: phone.replace(/[-.]/g, '') });
    }
    
    // Extract emails
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = text.match(emailPattern) || [];
    for (const email of emails) {
      entities.push({ type: 'email', value: email.toLowerCase() });
    }
    
    // Extract URLs
    const urlPattern = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlPattern) || [];
    for (const url of urls) {
      entities.push({ type: 'url', value: url });
    }
    
    // Extract money amounts
    const moneyPattern = /\$\d+(?:,\d{3})*(?:\.\d{2})?/g;
    const amounts = text.match(moneyPattern) || [];
    for (const amount of amounts) {
      entities.push({ type: 'money', value: amount });
    }
    
    return entities;
  }
  
  /**
   * Search by entity
   * @param {string} type - Entity type (phone, email, etc.)
   * @param {string} value - Entity value
   * @returns {Promise<Object[]>}
   */
  async searchByEntity(type, value) {
    const key = `${type}:${value}`;
    
    const record = await withStore(this.db, STORES.KB_ENTITIES, 'readonly',
      store => store.get(key)
    );
    
    if (!record?.docIds?.length) {
      return [];
    }
    
    return this.getDocuments(record.docIds);
  }
  
  /**
   * Get all entities of a type
   * @param {string} type 
   * @returns {Promise<Object[]>}
   */
  async getEntitiesByType(type) {
    const results = [];
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORES.KB_ENTITIES], 'readonly');
      const store = tx.objectStore(STORES.KB_ENTITIES);
      const cursor = store.openCursor();
      
      cursor.onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
          if (c.value.type === type) {
            results.push(c.value);
          }
          c.continue();
        }
      };
      
      tx.oncomplete = () => resolve(results);
      tx.onerror = () => reject(tx.error);
    });
  }
  
  /**
   * Get search suggestions
   * @param {string} prefix 
   * @param {number} limit 
   * @returns {Promise<string[]>}
   */
  async getSuggestions(prefix, limit = 5) {
    const lower = prefix.toLowerCase();
    const suggestions = [];
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORES.KB_TERMS], 'readonly');
      const store = tx.objectStore(STORES.KB_TERMS);
      
      // Use a key range starting with the prefix
      const range = IDBKeyRange.bound(lower, lower + '\uffff', false, false);
      const cursor = store.openCursor(range);
      
      cursor.onsuccess = (e) => {
        const c = e.target.result;
        if (c && suggestions.length < limit) {
          suggestions.push(c.key);
          c.continue();
        }
      };
      
      tx.oncomplete = () => resolve(suggestions);
      tx.onerror = () => reject(tx.error);
    });
  }
  
  /**
   * Clear all KB data
   * @returns {Promise<void>}
   */
  async clear() {
    const storeNames = [STORES.KB_DOCS, STORES.KB_TERMS, STORES.KB_ENTITIES];
    const tx = this.db.transaction(storeNames, 'readwrite');
    
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
    
    await txDone(tx);
  }
  
  /**
   * Get KB statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const docCount = await withStore(this.db, STORES.KB_DOCS, 'readonly',
      store => store.count()
    );
    
    const termCount = await withStore(this.db, STORES.KB_TERMS, 'readonly',
      store => store.count()
    );
    
    const entityCount = await withStore(this.db, STORES.KB_ENTITIES, 'readonly',
      store => store.count()
    );
    
    return {
      documents: docCount,
      terms: termCount,
      entities: entityCount
    };
  }
}

// ============================================================================
// STANDALONE FUNCTIONS (for legacy compatibility)
// ============================================================================

let _kbManager = null;

/**
 * Initialize KB with database
 * @param {IDBDatabase} db 
 */
export function initKB(db) {
  _kbManager = new KBManager(db);
}

/**
 * Index a message
 * @param {Object} message 
 */
export async function kbIndexMessage(message) {
  if (!_kbManager) throw new Error('KB not initialized');
  return _kbManager.indexMessage(message);
}

/**
 * Search KB
 * @param {string} query 
 * @param {Object} options 
 */
export async function kbSearch(query, options) {
  if (!_kbManager) throw new Error('KB not initialized');
  return _kbManager.search(query, options);
}

// Legacy alias
export const kbUpsertMessage = kbIndexMessage;
