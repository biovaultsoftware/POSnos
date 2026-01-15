// BalanceChain Integrity Module
// Chain verification, backup sync requirements, and corruption detection

import { GENESIS_HASH, STORES } from './constants.js';
import { sha256Hex, verify, importPublicKeyJwk } from './crypto.js';
import { getSignableContent } from './segment.js';
import { getChainLen, getChainHead, getSTABySeq, getMeta, setMeta, getAllSTAs } from './idb.js';

// ============================================================================
// CHAIN INTEGRITY VERIFIER
// ============================================================================

/**
 * Verify entire chain integrity
 * @param {IDBDatabase} db 
 * @param {Object} [options]
 * @param {function} [options.onProgress] - Progress callback (seq, total)
 * @param {boolean} [options.verifySignatures] - Whether to verify signatures (slower)
 * @returns {Promise<IntegrityResult>}
 */
export async function verifyChainIntegrity(db, options = {}) {
  const startTime = Date.now();
  const errors = [];
  const warnings = [];
  
  const chainLen = await getChainLen(db);
  
  if (chainLen === 0) {
    return {
      ok: true,
      verified: 0,
      errors: [],
      warnings: [],
      duration: Date.now() - startTime
    };
  }
  
  console.log(`[Integrity] Starting verification of ${chainLen} blocks...`);
  
  let expectedPrevHash = GENESIS_HASH;
  let lastTimestamp = 0;
  
  for (let seq = 1; seq <= chainLen; seq++) {
    if (options.onProgress) {
      options.onProgress(seq, chainLen);
    }
    
    const segment = await getSTABySeq(db, seq);
    
    // Check segment exists
    if (!segment) {
      errors.push({
        seq,
        code: 'MISSING_SEGMENT',
        message: `Segment at sequence ${seq} is missing`
      });
      continue;
    }
    
    // Check sequence number
    if (segment.seq !== seq) {
      errors.push({
        seq,
        code: 'SEQ_MISMATCH',
        message: `Expected seq ${seq}, found ${segment.seq}`
      });
    }
    
    // Check prev_hash linkage
    if (segment.prev_hash !== expectedPrevHash) {
      errors.push({
        seq,
        code: 'HASH_CHAIN_BROKEN',
        message: `Hash chain broken at seq ${seq}`,
        expected: expectedPrevHash,
        actual: segment.prev_hash
      });
    }
    
    // Check timestamp ordering
    if (segment.timestamp < lastTimestamp) {
      warnings.push({
        seq,
        code: 'TIMESTAMP_REGRESSION',
        message: `Timestamp went backwards at seq ${seq}`,
        previous: lastTimestamp,
        current: segment.timestamp
      });
    }
    lastTimestamp = segment.timestamp;
    
    // Verify signature if requested
    if (options.verifySignatures !== false) {
      try {
        const publicKey = await importPublicKeyJwk(segment.author.pubJwk);
        const signable = getSignableContent(segment);
        const valid = await verify(publicKey, signable, segment.signature);
        
        if (!valid) {
          errors.push({
            seq,
            code: 'INVALID_SIGNATURE',
            message: `Signature verification failed at seq ${seq}`
          });
        }
      } catch (e) {
        errors.push({
          seq,
          code: 'SIGNATURE_ERROR',
          message: `Signature verification error at seq ${seq}: ${e.message}`
        });
      }
    }
    
    // Compute expected next prev_hash
    try {
      const signable = getSignableContent(segment);
      expectedPrevHash = await sha256Hex(signable + '|' + segment.signature);
    } catch (e) {
      errors.push({
        seq,
        code: 'HASH_COMPUTE_ERROR',
        message: `Failed to compute hash at seq ${seq}: ${e.message}`
      });
    }
  }
  
  // Verify stored head matches computed head
  const storedHead = await getChainHead(db);
  if (storedHead !== expectedPrevHash) {
    errors.push({
      seq: chainLen,
      code: 'HEAD_MISMATCH',
      message: 'Stored chain head does not match computed head',
      expected: expectedPrevHash,
      actual: storedHead
    });
  }
  
  const duration = Date.now() - startTime;
  const ok = errors.length === 0;
  
  console.log(`[Integrity] Verified ${chainLen} blocks in ${duration}ms, ${errors.length} errors, ${warnings.length} warnings`);
  
  return {
    ok,
    verified: chainLen,
    errors,
    warnings,
    duration,
    computedHead: expectedPrevHash,
    storedHead
  };
}

// ============================================================================
// BACKUP SYNC VERIFICATION
// ============================================================================

/**
 * Check if backup can be restored (requires sync verification)
 * Per spec: "NO RESTORE WITHOUT REAL-TIME SYNC"
 * @param {Object} backupData - Backup data to verify
 * @param {Object} currentState - Current chain state
 * @returns {{canRestore: boolean, reason?: string, requiresSync: boolean}}
 */
export function verifyBackupRestoreEligibility(backupData, currentState) {
  // Case 1: Fresh install (no current chain)
  if (!currentState || currentState.chainLen === 0) {
    return {
      canRestore: true,
      requiresSync: false,
      reason: 'Fresh install - no sync required'
    };
  }
  
  // Case 2: Backup is older than current chain
  if (backupData.chainLen < currentState.chainLen) {
    return {
      canRestore: false,
      requiresSync: true,
      reason: 'Backup is older than current state. Sync required to merge.'
    };
  }
  
  // Case 3: Backup head doesn't match current chain
  if (backupData.chainHead !== currentState.chainHead) {
    // Check if backup is a valid extension
    if (backupData.chainLen > currentState.chainLen) {
      return {
        canRestore: false,
        requiresSync: true,
        reason: 'Backup has diverged. Online sync required to resolve fork.'
      };
    }
    
    return {
      canRestore: false,
      requiresSync: true,
      reason: 'Chain heads do not match. Sync required.'
    };
  }
  
  // Case 4: Backup matches current state
  return {
    canRestore: true,
    requiresSync: false,
    reason: 'Backup matches current state'
  };
}

/**
 * Detect potential cloned device attack
 * @param {Object} incomingSegment - Segment from another device
 * @param {IDBDatabase} db - Current database
 * @returns {Promise<{isClone: boolean, evidence?: string}>}
 */
export async function detectClonedDevice(incomingSegment, db) {
  // Check if we have a segment with same author but different nonce at same seq
  const localSegment = await getSTABySeq(db, incomingSegment.seq);
  
  if (!localSegment) {
    return { isClone: false };
  }
  
  // Same author, same sequence, different nonce = potential clone
  if (localSegment.author?.hid === incomingSegment.author?.hid &&
      localSegment.nonce !== incomingSegment.nonce) {
    return {
      isClone: true,
      evidence: `Duplicate segment at seq ${incomingSegment.seq} with different nonce. ` +
                `Local: ${localSegment.nonce}, Incoming: ${incomingSegment.nonce}`
    };
  }
  
  return { isClone: false };
}

// ============================================================================
// CORRUPTION DETECTION & RECOVERY
// ============================================================================

/**
 * @typedef {Object} CorruptionReport
 * @property {boolean} corrupted
 * @property {string} severity - 'none' | 'minor' | 'major' | 'critical'
 * @property {Object[]} issues
 * @property {string} recommendation
 */

/**
 * Scan for corruption and generate report
 * @param {IDBDatabase} db 
 * @returns {Promise<CorruptionReport>}
 */
export async function scanForCorruption(db) {
  const issues = [];
  
  // Run full integrity check
  const integrity = await verifyChainIntegrity(db, { verifySignatures: true });
  
  // Categorize errors
  for (const error of integrity.errors) {
    issues.push({
      type: 'error',
      ...error
    });
  }
  
  for (const warning of integrity.warnings) {
    issues.push({
      type: 'warning',
      ...warning
    });
  }
  
  // Determine severity
  let severity = 'none';
  let recommendation = 'Chain is healthy';
  
  const errorCount = integrity.errors.length;
  const criticalErrors = integrity.errors.filter(e => 
    ['HASH_CHAIN_BROKEN', 'HEAD_MISMATCH', 'MISSING_SEGMENT'].includes(e.code)
  ).length;
  
  if (criticalErrors > 0) {
    severity = 'critical';
    recommendation = 'Chain integrity compromised. Enter read-only mode and sync from trusted source.';
  } else if (errorCount > 0) {
    severity = 'major';
    recommendation = 'Signature errors detected. Verify device security and resync.';
  } else if (integrity.warnings.length > 0) {
    severity = 'minor';
    recommendation = 'Minor issues detected. Continue with caution.';
  }
  
  return {
    corrupted: severity !== 'none',
    severity,
    issues,
    recommendation,
    stats: {
      verified: integrity.verified,
      errors: errorCount,
      warnings: integrity.warnings.length,
      duration: integrity.duration
    }
  };
}

/**
 * Enter read-only mode (for corrupted chains)
 * @param {IDBDatabase} db 
 * @returns {Promise<void>}
 */
export async function enterReadOnlyMode(db) {
  await setMeta(db, 'read_only', {
    enabled: true,
    reason: 'corruption_detected',
    timestamp: Date.now()
  });
  
  console.warn('[Integrity] Entered read-only mode due to corruption');
}

/**
 * Check if database is in read-only mode
 * @param {IDBDatabase} db 
 * @returns {Promise<boolean>}
 */
export async function isReadOnlyMode(db) {
  const readOnly = await getMeta(db, 'read_only');
  return readOnly?.enabled === true;
}

/**
 * Exit read-only mode (after successful recovery)
 * @param {IDBDatabase} db 
 * @returns {Promise<void>}
 */
export async function exitReadOnlyMode(db) {
  await setMeta(db, 'read_only', {
    enabled: false,
    clearedAt: Date.now()
  });
  
  console.log('[Integrity] Exited read-only mode');
}

// ============================================================================
// CHAIN STATISTICS
// ============================================================================

/**
 * Get comprehensive chain statistics
 * @param {IDBDatabase} db 
 * @returns {Promise<Object>}
 */
export async function getChainStats(db) {
  const chainLen = await getChainLen(db);
  const chainHead = await getChainHead(db);
  
  if (chainLen === 0) {
    return {
      length: 0,
      head: GENESIS_HASH,
      isEmpty: true
    };
  }
  
  const allSTAs = await getAllSTAs(db);
  
  // Count by type
  const typeCounts = {};
  for (const sta of allSTAs) {
    typeCounts[sta.type] = (typeCounts[sta.type] || 0) + 1;
  }
  
  // Get time range
  const timestamps = allSTAs.map(s => s.timestamp).filter(t => t > 0);
  const firstTimestamp = Math.min(...timestamps);
  const lastTimestamp = Math.max(...timestamps);
  
  // Get unique authors
  const authors = new Set(allSTAs.map(s => s.author?.hid).filter(Boolean));
  
  return {
    length: chainLen,
    head: chainHead,
    isEmpty: false,
    typeCounts,
    timeRange: {
      first: firstTimestamp,
      last: lastTimestamp,
      spanMs: lastTimestamp - firstTimestamp
    },
    uniqueAuthors: authors.size,
    averageBlocksPerDay: chainLen / Math.max(1, (lastTimestamp - firstTimestamp) / 86400000)
  };
}

// ============================================================================
// EXPORT INTEGRITY REPORT
// ============================================================================

/**
 * Generate exportable integrity report
 * @param {IDBDatabase} db 
 * @returns {Promise<string>} JSON report
 */
export async function generateIntegrityReport(db) {
  const [integrity, corruption, stats] = await Promise.all([
    verifyChainIntegrity(db),
    scanForCorruption(db),
    getChainStats(db)
  ]);
  
  const report = {
    generated: new Date().toISOString(),
    chainStats: stats,
    integrity: {
      ok: integrity.ok,
      verified: integrity.verified,
      errorCount: integrity.errors.length,
      warningCount: integrity.warnings.length
    },
    corruption: {
      detected: corruption.corrupted,
      severity: corruption.severity,
      recommendation: corruption.recommendation
    },
    details: {
      errors: integrity.errors.slice(0, 10), // First 10 errors
      warnings: integrity.warnings.slice(0, 10)
    }
  };
  
  return JSON.stringify(report, null, 2);
}
