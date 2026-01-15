// BalanceChain Cryptographic Utilities
// Provides signing, verification, hashing with quantum-safe upgrade path

import { ECDSA_CURVE, HASH_ALGORITHM, NONCE_BYTES } from './constants.js';

// ============================================================================
// HASHING
// ============================================================================

/**
 * Compute SHA-256 hash and return as hex string
 * @param {string} str - Input string to hash
 * @returns {Promise<string>} Hex-encoded hash
 */
export async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest(HASH_ALGORITHM, data);
  return arrayToHex(new Uint8Array(hash));
}

/**
 * Compute SHA-256 hash of arbitrary data
 * @param {ArrayBuffer|Uint8Array} data - Input data
 * @returns {Promise<Uint8Array>} Hash bytes
 */
export async function sha256Bytes(data) {
  const hash = await crypto.subtle.digest(HASH_ALGORITHM, data);
  return new Uint8Array(hash);
}

/**
 * Compute hash of segment for chain linking
 * @param {string} signable - Canonicalized segment content
 * @param {string} signature - Base64 signature
 * @returns {Promise<string>} Block hash
 */
export async function computeBlockHash(signable, signature) {
  return await sha256Hex(signable + '|' + signature);
}

// ============================================================================
// CANONICALIZATION (Deterministic JSON)
// ============================================================================

/**
 * Canonicalize object for deterministic hashing/signing
 * DO NOT MODIFY: Locked for cross-runtime determinism
 * @param {any} obj - Object to canonicalize
 * @returns {string} Canonical JSON string
 */
export function canonicalize(obj) {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalize).join(',')}]`;
  
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
  return `{${pairs.join(',')}}`;
}

// ============================================================================
// KEY GENERATION & MANAGEMENT
// ============================================================================

/**
 * Generate new ECDSA key pair for signing
 * @returns {Promise<CryptoKeyPair>} Key pair with public and private keys
 */
export async function generateSigningKeyPair() {
  return await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: ECDSA_CURVE },
    true, // extractable
    ['sign', 'verify']
  );
}

/**
 * Generate new ECDH key pair for key exchange
 * @returns {Promise<CryptoKeyPair>} Key pair for ECDH
 */
export async function generateECDHKeyPair() {
  return await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: ECDSA_CURVE },
    true,
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Export public key to JWK format
 * @param {CryptoKey} publicKey 
 * @returns {Promise<JsonWebKey>}
 */
export async function exportPublicKeyJwk(publicKey) {
  return await crypto.subtle.exportKey('jwk', publicKey);
}

/**
 * Export private key to JWK format (use with caution!)
 * @param {CryptoKey} privateKey 
 * @returns {Promise<JsonWebKey>}
 */
export async function exportPrivateKeyJwk(privateKey) {
  return await crypto.subtle.exportKey('jwk', privateKey);
}

/**
 * Import public key from JWK for ECDSA verification
 * @param {JsonWebKey} jwk 
 * @returns {Promise<CryptoKey>}
 */
export async function importPublicKeyJwk(jwk) {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: ECDSA_CURVE },
    true,
    ['verify']
  );
}

/**
 * Import private key from JWK for ECDSA signing
 * @param {JsonWebKey} jwk 
 * @returns {Promise<CryptoKey>}
 */
export async function importPrivateKeyJwk(jwk) {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: ECDSA_CURVE },
    false, // not extractable once imported
    ['sign']
  );
}

/**
 * Import public key from JWK for ECDH
 * @param {JsonWebKey} jwk 
 * @returns {Promise<CryptoKey>}
 */
export async function importECDHPublicKey(jwk) {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: ECDSA_CURVE },
    true,
    []
  );
}

// ============================================================================
// SIGNING & VERIFICATION
// ============================================================================

/**
 * Sign data with ECDSA private key
 * @param {CryptoKey} privateKey 
 * @param {string} dataStr - String to sign
 * @returns {Promise<string>} Base64-encoded signature
 */
export async function sign(privateKey, dataStr) {
  const data = new TextEncoder().encode(dataStr);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: HASH_ALGORITHM },
    privateKey,
    data
  );
  return arrayToBase64(new Uint8Array(signature));
}

/**
 * Verify ECDSA signature
 * @param {CryptoKey} publicKey 
 * @param {string} dataStr - Original signed string
 * @param {string} signatureB64 - Base64-encoded signature
 * @returns {Promise<boolean>} True if valid
 */
export async function verify(publicKey, dataStr, signatureB64) {
  try {
    const data = new TextEncoder().encode(dataStr);
    const signature = base64ToArray(signatureB64);
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: HASH_ALGORITHM },
      publicKey,
      signature,
      data
    );
  } catch (e) {
    console.error('[Crypto] Verification error:', e);
    return false;
  }
}

// ============================================================================
// KEY DERIVATION (for E2EE)
// ============================================================================

/**
 * Derive AES-GCM key from ECDH shared secret
 * @param {CryptoKey} privateKey - Our ECDH private key
 * @param {CryptoKey} publicKey - Peer's ECDH public key
 * @returns {Promise<CryptoKey>} AES-GCM key for encryption
 */
export async function deriveSharedKey(privateKey, publicKey) {
  return await crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with AES-GCM
 * @param {CryptoKey} key - AES-GCM key
 * @param {string} plaintext 
 * @returns {Promise<{iv: string, ciphertext: string}>} Base64 encoded
 */
export async function encryptAESGCM(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return {
    iv: arrayToBase64(iv),
    ciphertext: arrayToBase64(new Uint8Array(ciphertext))
  };
}

/**
 * Decrypt data with AES-GCM
 * @param {CryptoKey} key - AES-GCM key
 * @param {string} ivB64 - Base64 IV
 * @param {string} ciphertextB64 - Base64 ciphertext
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function decryptAESGCM(key, ivB64, ciphertextB64) {
  const iv = base64ToArray(ivB64);
  const ciphertext = base64ToArray(ciphertextB64);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}

// ============================================================================
// RANDOM GENERATION
// ============================================================================

/**
 * Generate cryptographically secure random hex string
 * @param {number} bytes - Number of random bytes
 * @returns {string} Hex-encoded random string
 */
export function randomHex(bytes = NONCE_BYTES) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return arrayToHex(arr);
}

/**
 * Generate random bytes
 * @param {number} length 
 * @returns {Uint8Array}
 */
export function randomBytes(length) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return arr;
}

/**
 * Generate UUID v4
 * @returns {string}
 */
export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : 
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// ============================================================================
// ENCODING UTILITIES
// ============================================================================

/**
 * Convert Uint8Array to hex string
 * @param {Uint8Array} arr 
 * @returns {string}
 */
export function arrayToHex(arr) {
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert hex string to Uint8Array
 * @param {string} hex 
 * @returns {Uint8Array}
 */
export function hexToArray(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to base64
 * @param {Uint8Array} arr 
 * @returns {string}
 */
export function arrayToBase64(arr) {
  return btoa(String.fromCharCode(...arr));
}

/**
 * Convert base64 to Uint8Array
 * @param {string} b64 
 * @returns {Uint8Array}
 */
export function base64ToArray(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr;
}

// ============================================================================
// HUMAN ID GENERATION
// ============================================================================

/**
 * Generate Human ID from public key
 * @param {JsonWebKey} publicKeyJwk 
 * @returns {Promise<string>} HID-XXXX format
 */
export async function generateHumanId(publicKeyJwk) {
  const keyStr = canonicalize(publicKeyJwk);
  const hash = await sha256Hex(keyStr);
  return `HID-${hash.substring(0, 8).toUpperCase()}`;
}

// ============================================================================
// QUANTUM-SAFE UPGRADE PATH (Placeholder)
// ============================================================================

/**
 * Check if quantum-safe algorithms are available
 * @returns {boolean}
 */
export function isQuantumSafeAvailable() {
  // TODO: Check for Dilithium/Falcon/Kyber availability
  // These will require external libraries (e.g., liboqs-js)
  return false;
}

/**
 * Get recommended algorithm based on availability
 * @returns {{sign: string, hash: string, kem: string}}
 */
export function getRecommendedAlgorithms() {
  if (isQuantumSafeAvailable()) {
    return {
      sign: 'DILITHIUM3',
      hash: 'SHA3-256',
      kem: 'KYBER768'
    };
  }
  return {
    sign: 'ECDSA-P256',
    hash: 'SHA-256',
    kem: 'ECDH-P256'
  };
}
