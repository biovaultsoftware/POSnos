// BalanceChain Identity Module
// WebAuthn integration and secure key management

import { STORES } from './constants.js';
import {
  generateSigningKeyPair,
  generateECDHKeyPair,
  exportPublicKeyJwk,
  exportPrivateKeyJwk,
  importPrivateKeyJwk,
  generateHumanId,
  randomHex,
  arrayToBase64,
  base64ToArray
} from './crypto.js';
import { withStore, getMeta, setMeta } from './idb.js';

// ============================================================================
// IDENTITY MANAGER CLASS
// ============================================================================

/**
 * Manages user identity with WebAuthn support
 */
export class IdentityManager {
  constructor(db) {
    this.db = db;
    this.identity = null;
    this.webAuthnAvailable = this.checkWebAuthnSupport();
  }
  
  /**
   * Check WebAuthn support
   * @returns {boolean}
   */
  checkWebAuthnSupport() {
    return typeof window !== 'undefined' && 
           window.PublicKeyCredential !== undefined;
  }
  
  /**
   * Initialize identity (load or create)
   * @param {Object} [options]
   * @param {boolean} [options.requireBiometric=false] - Require biometric
   * @returns {Promise<{hid: string, isNew: boolean}>}
   */
  async init(options = {}) {
    // Try to load existing identity
    const existing = await this.loadIdentity();
    
    if (existing) {
      this.identity = existing;
      console.log(`[Identity] Restored: ${existing.hid}`);
      return { hid: existing.hid, isNew: false };
    }
    
    // Create new identity
    const newIdentity = await this.createIdentity(options);
    this.identity = newIdentity;
    
    console.log(`[Identity] Created new: ${newIdentity.hid}`);
    return { hid: newIdentity.hid, isNew: true };
  }
  
  /**
   * Load existing identity from storage
   * @returns {Promise<Object|null>}
   */
  async loadIdentity() {
    try {
      const stored = await withStore(this.db, STORES.IDENTITY, 'readonly',
        store => store.get('primary')
      );
      
      if (!stored) return null;
      
      // Import private key
      const privateKey = await importPrivateKeyJwk(stored.privateKeyJwk);
      
      return {
        hid: stored.hid,
        pubJwk: stored.pubJwk,
        privateKey,
        createdAt: stored.createdAt,
        webAuthnCredentialId: stored.webAuthnCredentialId || null
      };
    } catch (e) {
      console.error('[Identity] Load error:', e);
      return null;
    }
  }
  
  /**
   * Create new identity
   * @param {Object} options 
   * @returns {Promise<Object>}
   */
  async createIdentity(options = {}) {
    // Generate signing key pair
    const keyPair = await generateSigningKeyPair();
    const pubJwk = await exportPublicKeyJwk(keyPair.publicKey);
    const privateKeyJwk = await exportPrivateKeyJwk(keyPair.privateKey);
    
    // Generate human ID
    const hid = await generateHumanId(pubJwk);
    
    // Store identity
    const identityRecord = {
      id: 'primary',
      hid,
      pubJwk,
      privateKeyJwk,
      createdAt: Date.now(),
      webAuthnCredentialId: null
    };
    
    await withStore(this.db, STORES.IDENTITY, 'readwrite',
      store => store.put(identityRecord)
    );
    
    // If WebAuthn available and biometric requested, set up
    if (options.requireBiometric && this.webAuthnAvailable) {
      try {
        const credentialId = await this.registerWebAuthn(hid);
        identityRecord.webAuthnCredentialId = credentialId;
        
        // Update with credential
        await withStore(this.db, STORES.IDENTITY, 'readwrite',
          store => store.put(identityRecord)
        );
      } catch (e) {
        console.warn('[Identity] WebAuthn registration failed:', e);
      }
    }
    
    return {
      hid,
      pubJwk,
      privateKey: keyPair.privateKey,
      createdAt: identityRecord.createdAt,
      webAuthnCredentialId: identityRecord.webAuthnCredentialId
    };
  }
  
  /**
   * Get current identity
   * @returns {Object|null}
   */
  getIdentity() {
    return this.identity;
  }
  
  /**
   * Get Human ID
   * @returns {string|null}
   */
  getHid() {
    return this.identity?.hid || null;
  }
  
  // ============================================================================
  // WEBAUTHN INTEGRATION
  // ============================================================================
  
  /**
   * Register WebAuthn credential
   * @param {string} hid - Human ID as user handle
   * @returns {Promise<string>} Credential ID
   */
  async registerWebAuthn(hid) {
    if (!this.webAuthnAvailable) {
      throw new Error('WebAuthn not available');
    }
    
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    
    const publicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: 'BalanceChain',
        id: window.location.hostname
      },
      user: {
        id: new TextEncoder().encode(hid),
        name: hid,
        displayName: `BalanceChain User ${hid.slice(-8)}`
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },  // ES256
        { alg: -257, type: 'public-key' } // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred'
      },
      timeout: 60000,
      attestation: 'none'
    };
    
    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions
    });
    
    if (!credential) {
      throw new Error('Credential creation failed');
    }
    
    return arrayToBase64(new Uint8Array(credential.rawId));
  }
  
  /**
   * Authenticate with WebAuthn
   * @returns {Promise<{success: boolean, assertion?: any}>}
   */
  async authenticateWebAuthn() {
    if (!this.webAuthnAvailable) {
      return { success: false, error: 'WebAuthn not available' };
    }
    
    if (!this.identity?.webAuthnCredentialId) {
      return { success: false, error: 'No WebAuthn credential registered' };
    }
    
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    
    const credentialId = base64ToArray(this.identity.webAuthnCredentialId);
    
    const publicKeyCredentialRequestOptions = {
      challenge,
      allowCredentials: [{
        id: credentialId,
        type: 'public-key',
        transports: ['internal']
      }],
      userVerification: 'required',
      timeout: 60000
    };
    
    try {
      const assertion = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions
      });
      
      if (!assertion) {
        return { success: false, error: 'Authentication failed' };
      }
      
      return {
        success: true,
        assertion: {
          credentialId: arrayToBase64(new Uint8Array(assertion.rawId)),
          authenticatorData: arrayToBase64(new Uint8Array(assertion.response.authenticatorData)),
          signature: arrayToBase64(new Uint8Array(assertion.response.signature)),
          timestamp: Date.now()
        }
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  
  /**
   * Generate liveness proof (simplified for non-WebAuthn)
   * @returns {Promise<Object>}
   */
  async generateLivenessProof() {
    if (this.webAuthnAvailable && this.identity?.webAuthnCredentialId) {
      const result = await this.authenticateWebAuthn();
      if (result.success) {
        return {
          type: 'webauthn',
          timestamp: Date.now(),
          assertion: result.assertion
        };
      }
    }
    
    // Fallback: simple timestamp proof (less secure)
    return {
      type: 'timestamp',
      timestamp: Date.now(),
      nonce: randomHex(16)
    };
  }
  
  // ============================================================================
  // BACKUP & RECOVERY
  // ============================================================================
  
  /**
   * Export identity for backup (encrypted)
   * @param {string} password - Encryption password
   * @returns {Promise<string>} Encrypted backup data
   */
  async exportBackup(password) {
    if (!this.identity) {
      throw new Error('No identity to backup');
    }
    
    const stored = await withStore(this.db, STORES.IDENTITY, 'readonly',
      store => store.get('primary')
    );
    
    if (!stored) {
      throw new Error('Identity not found in storage');
    }
    
    // Create backup data
    const backupData = {
      version: 1,
      hid: stored.hid,
      pubJwk: stored.pubJwk,
      privateKeyJwk: stored.privateKeyJwk,
      createdAt: stored.createdAt,
      exportedAt: Date.now()
    };
    
    // Encrypt with password
    const encrypted = await this.encryptBackup(JSON.stringify(backupData), password);
    
    return encrypted;
  }
  
  /**
   * Import identity from backup
   * @param {string} encryptedBackup - Encrypted backup data
   * @param {string} password - Decryption password
   * @returns {Promise<{success: boolean, hid?: string, error?: string}>}
   */
  async importBackup(encryptedBackup, password) {
    try {
      // Decrypt
      const decrypted = await this.decryptBackup(encryptedBackup, password);
      const backupData = JSON.parse(decrypted);
      
      // Validate
      if (backupData.version !== 1) {
        return { success: false, error: 'Unsupported backup version' };
      }
      
      // Check for sync requirement
      // In production, this would verify against a server
      const chainHead = await getMeta(this.db, 'chain_head');
      if (chainHead && chainHead !== 'GENESIS') {
        console.warn('[Identity] Backup import requires sync with existing chain');
        // For now, allow import but log warning
      }
      
      // Store identity
      const identityRecord = {
        id: 'primary',
        hid: backupData.hid,
        pubJwk: backupData.pubJwk,
        privateKeyJwk: backupData.privateKeyJwk,
        createdAt: backupData.createdAt,
        importedAt: Date.now(),
        webAuthnCredentialId: null // Needs re-registration
      };
      
      await withStore(this.db, STORES.IDENTITY, 'readwrite',
        store => store.put(identityRecord)
      );
      
      // Load into memory
      const privateKey = await importPrivateKeyJwk(backupData.privateKeyJwk);
      
      this.identity = {
        hid: backupData.hid,
        pubJwk: backupData.pubJwk,
        privateKey,
        createdAt: backupData.createdAt
      };
      
      return { success: true, hid: backupData.hid };
      
    } catch (e) {
      console.error('[Identity] Import error:', e);
      return { success: false, error: e.message };
    }
  }
  
  /**
   * Encrypt backup data with password
   * @param {string} data 
   * @param {string} password 
   * @returns {Promise<string>}
   */
  async encryptBackup(data, password) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Derive key from password
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    // Encrypt
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(data)
    );
    
    // Combine: version + salt + iv + ciphertext
    const result = new Uint8Array(1 + 16 + 12 + ciphertext.byteLength);
    result[0] = 1; // Version
    result.set(salt, 1);
    result.set(iv, 17);
    result.set(new Uint8Array(ciphertext), 29);
    
    return arrayToBase64(result);
  }
  
  /**
   * Decrypt backup data with password
   * @param {string} encrypted 
   * @param {string} password 
   * @returns {Promise<string>}
   */
  async decryptBackup(encrypted, password) {
    const encoder = new TextEncoder();
    const data = base64ToArray(encrypted);
    
    const version = data[0];
    if (version !== 1) {
      throw new Error('Unknown encryption version');
    }
    
    const salt = data.slice(1, 17);
    const iv = data.slice(17, 29);
    const ciphertext = data.slice(29);
    
    // Derive key from password
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    
    return new TextDecoder().decode(plaintext);
  }
  
  // ============================================================================
  // IDENTITY VERIFICATION
  // ============================================================================
  
  /**
   * Verify this identity owns a segment
   * @param {Object} segment 
   * @returns {boolean}
   */
  ownsSegment(segment) {
    if (!this.identity) return false;
    return segment.current_owner === this.identity.hid ||
           segment.author?.hid === this.identity.hid;
  }
  
  /**
   * Check if identity is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.identity !== null;
  }
  
  /**
   * Check if WebAuthn is registered
   * @returns {boolean}
   */
  hasWebAuthn() {
    return this.identity?.webAuthnCredentialId !== null;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format HID for display
 * @param {string} hid 
 * @returns {string}
 */
export function formatHid(hid) {
  if (!hid || !hid.startsWith('HID-')) return hid;
  return `${hid.slice(0, 4)}...${hid.slice(-4)}`;
}

/**
 * Validate HID format
 * @param {string} hid 
 * @returns {boolean}
 */
export function isValidHid(hid) {
  return typeof hid === 'string' && 
         hid.startsWith('HID-') && 
         hid.length === 12 &&
         /^HID-[A-F0-9]{8}$/.test(hid);
}
