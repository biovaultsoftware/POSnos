// Test: Batch 1 - Core Protocol Foundation
// Run with: node --experimental-vm-modules test/batch1.test.js

import { 
  PROTOCOL_VERSION, 
  DAILY_CAP, 
  MONTHLY_CAP, 
  YEARLY_CAP,
  INITIAL_UNLOCKED_SEGMENTS,
  STORES,
  STA_TYPES,
  COUNCIL_MEMBERS
} from '../src/constants.js';

import {
  sha256Hex,
  canonicalize,
  randomHex,
  arrayToHex,
  hexToArray,
  arrayToBase64,
  base64ToArray,
  generateSigningKeyPair,
  sign,
  verify,
  generateHumanId,
  exportPublicKeyJwk
} from '../src/crypto.js';

const tests = [];
const results = { passed: 0, failed: 0 };

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('BATCH 1 TESTS: Core Protocol Foundation');
  console.log('='.repeat(60));
  
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`✅ ${t.name}`);
      results.passed++;
    } catch (e) {
      console.log(`❌ ${t.name}`);
      console.log(`   Error: ${e.message}`);
      results.failed++;
    }
  }
  
  console.log('='.repeat(60));
  console.log(`Results: ${results.passed} passed, ${results.failed} failed`);
  console.log('='.repeat(60));
  
  return results.failed === 0;
}

// ============================================================================
// CONSTANTS TESTS
// ============================================================================

test('Constants: Protocol version is 2', () => {
  assert(PROTOCOL_VERSION === 2, `Expected 2, got ${PROTOCOL_VERSION}`);
});

test('Constants: Initial balance is 1200', () => {
  assert(INITIAL_UNLOCKED_SEGMENTS === 1200, `Expected 1200, got ${INITIAL_UNLOCKED_SEGMENTS}`);
});

test('Constants: Daily cap is 3600', () => {
  assert(DAILY_CAP === 3600, `Expected 3600, got ${DAILY_CAP}`);
});

test('Constants: Monthly cap is 36000', () => {
  assert(MONTHLY_CAP === 36000, `Expected 36000, got ${MONTHLY_CAP}`);
});

test('Constants: Yearly cap is 120000', () => {
  assert(YEARLY_CAP === 120000, `Expected 120000, got ${YEARLY_CAP}`);
});

test('Constants: All stores defined', () => {
  assert(STORES.META === 'meta', 'META store missing');
  assert(STORES.STATE_CHAIN === 'state_chain', 'STATE_CHAIN store missing');
  assert(STORES.CAPS === 'caps', 'CAPS store missing');
  assert(STORES.CAPSULES === 'capsules', 'CAPSULES store missing');
});

test('Constants: All STA types defined', () => {
  assert(STA_TYPES.CHAT_USER === 'chat.user', 'CHAT_USER type missing');
  assert(STA_TYPES.AI_ADVICE === 'ai.advice', 'AI_ADVICE type missing');
  assert(STA_TYPES.BIZ_DECISION === 'biz.decision', 'BIZ_DECISION type missing');
  assert(STA_TYPES.BIZ_OUTCOME === 'biz.outcome', 'BIZ_OUTCOME type missing');
});

test('Constants: All 10 council members defined', () => {
  const members = Object.keys(COUNCIL_MEMBERS);
  assert(members.length === 10, `Expected 10 members, got ${members.length}`);
  assert(COUNCIL_MEMBERS.KAREEM.motivator === 'laziness', 'Kareem motivator wrong');
  assert(COUNCIL_MEMBERS.WHEAT.name === 'Uncle Wheat', 'Uncle Wheat name wrong');
  assert(COUNCIL_MEMBERS.ARCHITECT.id === 'architect', 'Architect id wrong');
});

// ============================================================================
// CRYPTO TESTS
// ============================================================================

test('Crypto: SHA256 produces correct length', async () => {
  const hash = await sha256Hex('test');
  assert(hash.length === 64, `Expected 64 chars, got ${hash.length}`);
});

test('Crypto: SHA256 is deterministic', async () => {
  const h1 = await sha256Hex('hello world');
  const h2 = await sha256Hex('hello world');
  assert(h1 === h2, 'Hashes should match');
});

test('Crypto: Canonicalize sorts keys', () => {
  const obj = { z: 1, a: 2, m: 3 };
  const result = canonicalize(obj);
  assert(result === '{"a":2,"m":3,"z":1}', `Got: ${result}`);
});

test('Crypto: Canonicalize handles nested objects', () => {
  const obj = { b: { y: 1, x: 2 }, a: 3 };
  const result = canonicalize(obj);
  assert(result === '{"a":3,"b":{"x":2,"y":1}}', `Got: ${result}`);
});

test('Crypto: Canonicalize handles arrays', () => {
  const obj = { arr: [3, 1, 2] };
  const result = canonicalize(obj);
  assert(result === '{"arr":[3,1,2]}', `Got: ${result}`);
});

test('Crypto: randomHex produces correct length', () => {
  const r16 = randomHex(16);
  const r32 = randomHex(32);
  assert(r16.length === 32, `Expected 32 chars for 16 bytes, got ${r16.length}`);
  assert(r32.length === 64, `Expected 64 chars for 32 bytes, got ${r32.length}`);
});

test('Crypto: randomHex is unique', () => {
  const r1 = randomHex();
  const r2 = randomHex();
  assert(r1 !== r2, 'Random values should be unique');
});

test('Crypto: Hex encoding roundtrip', () => {
  const original = new Uint8Array([0, 127, 255, 1, 254]);
  const hex = arrayToHex(original);
  const back = hexToArray(hex);
  assert(original.length === back.length, 'Length mismatch');
  for (let i = 0; i < original.length; i++) {
    assert(original[i] === back[i], `Byte mismatch at ${i}`);
  }
});

test('Crypto: Base64 encoding roundtrip', () => {
  const original = new Uint8Array([0, 127, 255, 1, 254]);
  const b64 = arrayToBase64(original);
  const back = base64ToArray(b64);
  assert(original.length === back.length, 'Length mismatch');
  for (let i = 0; i < original.length; i++) {
    assert(original[i] === back[i], `Byte mismatch at ${i}`);
  }
});

test('Crypto: Key generation works', async () => {
  const keyPair = await generateSigningKeyPair();
  assert(keyPair.publicKey, 'Public key missing');
  assert(keyPair.privateKey, 'Private key missing');
});

test('Crypto: Sign and verify works', async () => {
  const keyPair = await generateSigningKeyPair();
  const message = 'test message';
  const signature = await sign(keyPair.privateKey, message);
  const valid = await verify(keyPair.publicKey, message, signature);
  assert(valid === true, 'Signature should be valid');
});

test('Crypto: Verify rejects tampered message', async () => {
  const keyPair = await generateSigningKeyPair();
  const signature = await sign(keyPair.privateKey, 'original');
  const valid = await verify(keyPair.publicKey, 'tampered', signature);
  assert(valid === false, 'Tampered message should fail verification');
});

test('Crypto: Human ID generation works', async () => {
  const keyPair = await generateSigningKeyPair();
  const pubJwk = await exportPublicKeyJwk(keyPair.publicKey);
  const hid = await generateHumanId(pubJwk);
  assert(hid.startsWith('HID-'), `HID should start with HID-, got ${hid}`);
  assert(hid.length === 12, `HID should be 12 chars, got ${hid.length}`);
});

test('Crypto: Human ID is deterministic', async () => {
  const keyPair = await generateSigningKeyPair();
  const pubJwk = await exportPublicKeyJwk(keyPair.publicKey);
  const hid1 = await generateHumanId(pubJwk);
  const hid2 = await generateHumanId(pubJwk);
  assert(hid1 === hid2, 'Same key should produce same HID');
});

// ============================================================================
// RUN TESTS
// ============================================================================

runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
