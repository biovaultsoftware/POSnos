// Test: Batch 6 - Integrity & Integration
// Run with: node --experimental-vm-modules test/batch6.test.js

import {
  verifyBackupRestoreEligibility,
  detectClonedDevice
} from '../src/integrity.js';

import { VERSION, getVersionString } from '../src/index.js';

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
  console.log('BATCH 6 TESTS: Integrity & Integration');
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
// BACKUP ELIGIBILITY TESTS
// ============================================================================

test('Backup: Fresh install allows restore', () => {
  const result = verifyBackupRestoreEligibility(
    { chainLen: 10, chainHead: 'abc123' },
    { chainLen: 0, chainHead: 'GENESIS' }
  );
  
  assert(result.canRestore === true, 'Should allow restore on fresh install');
  assert(result.requiresSync === false, 'Should not require sync');
});

test('Backup: Null current state allows restore', () => {
  const result = verifyBackupRestoreEligibility(
    { chainLen: 10, chainHead: 'abc123' },
    null
  );
  
  assert(result.canRestore === true, 'Should allow restore with null state');
});

test('Backup: Older backup requires sync', () => {
  const result = verifyBackupRestoreEligibility(
    { chainLen: 5, chainHead: 'old' },
    { chainLen: 10, chainHead: 'current' }
  );
  
  assert(result.canRestore === false, 'Should not allow older backup');
  assert(result.requiresSync === true, 'Should require sync');
});

test('Backup: Diverged chains require sync', () => {
  const result = verifyBackupRestoreEligibility(
    { chainLen: 10, chainHead: 'backup_head' },
    { chainLen: 10, chainHead: 'current_head' }
  );
  
  assert(result.canRestore === false, 'Diverged chains should not restore');
  assert(result.requiresSync === true, 'Should require sync');
});

test('Backup: Matching state allows restore', () => {
  const result = verifyBackupRestoreEligibility(
    { chainLen: 10, chainHead: 'same_head' },
    { chainLen: 10, chainHead: 'same_head' }
  );
  
  assert(result.canRestore === true, 'Matching states should allow restore');
  assert(result.requiresSync === false, 'Should not require sync');
});

// ============================================================================
// VERSION TESTS
// ============================================================================

test('Version: Protocol version is 2', () => {
  assert(VERSION.protocol === 2, `Expected protocol 2, got ${VERSION.protocol}`);
});

test('Version: Major version is 2', () => {
  assert(VERSION.major === 2, `Expected major 2, got ${VERSION.major}`);
});

test('Version: getVersionString returns formatted string', () => {
  const version = getVersionString();
  assert(typeof version === 'string', 'Should return string');
  assert(version.includes('.'), 'Should include dots');
  assert(version.includes('2.0'), 'Should include 2.0');
});

test('Version: Codename is SovereignOS', () => {
  assert(VERSION.codename === 'SovereignOS', `Expected SovereignOS, got ${VERSION.codename}`);
});

// ============================================================================
// MODULE INTEGRATION TESTS
// ============================================================================

test('Integration: All constants exported', async () => {
  const { DAILY_CAP, MONTHLY_CAP, YEARLY_CAP, COUNCIL_MEMBERS } = await import('../src/index.js');
  
  assert(DAILY_CAP === 3600, 'DAILY_CAP');
  assert(MONTHLY_CAP === 36000, 'MONTHLY_CAP');
  assert(YEARLY_CAP === 120000, 'YEARLY_CAP');
  assert(Object.keys(COUNCIL_MEMBERS).length === 10, 'COUNCIL_MEMBERS');
});

test('Integration: Crypto functions exported', async () => {
  const { sha256Hex, randomHex, canonicalize } = await import('../src/index.js');
  
  const hash = await sha256Hex('test');
  assert(hash.length === 64, 'sha256Hex works');
  
  const rand = randomHex(16);
  assert(rand.length === 32, 'randomHex works');
  
  const canon = canonicalize({ b: 1, a: 2 });
  assert(canon === '{"a":2,"b":1}', 'canonicalize works');
});

test('Integration: Council exported', async () => {
  const { council, checkKillSwitch } = await import('../src/index.js');
  
  assert(council.getAllCharacters().length === 10, 'Council has 10 characters');
  
  const blocked = checkKillSwitch('what is the weather?');
  assert(blocked.blocked === true, 'Kill switch works');
});

test('Integration: TVM functions exported', async () => {
  const { calculateRichScore, calculateBusinessScore, detectMotivator } = await import('../src/index.js');
  
  const rich = calculateRichScore({ endState: 'rich' });
  assert(rich > 50, 'Rich score calculated');
  
  const biz = calculateBusinessScore({ category: 'wheat' });
  assert(biz > 50, 'Business score calculated');
  
  const motivator = detectMotivator([{ text: 'I want easy passive income' }]);
  assert(motivator === 'laziness', 'Motivator detected');
});

test('Integration: ECF exported', async () => {
  const { ecf, getPlanPricing, SUBSCRIPTION_PLANS } = await import('../src/index.js');
  
  const usEcf = ecf.getECF('US');
  assert(usEcf === 1.0, 'US ECF is 1.0');
  
  const plan = getPlanPricing('monthly', 'EG');
  assert(plan.adjustedPrice < 40, 'Egypt price is discounted');
  
  assert(SUBSCRIPTION_PLANS.monthly, 'Monthly plan exists');
  assert(SUBSCRIPTION_PLANS.yearly, 'Yearly plan exists');
});

test('Integration: Validation exported', async () => {
  const { validateSegmentStructure, validateOwnerTransition, validateTimestamp } = await import('../src/index.js');
  
  assert(typeof validateSegmentStructure === 'function', 'validateSegmentStructure exported');
  assert(typeof validateOwnerTransition === 'function', 'validateOwnerTransition exported');
  assert(typeof validateTimestamp === 'function', 'validateTimestamp exported');
  
  // Test timestamp validation
  const timestampResult = validateTimestamp(Date.now());
  assert(timestampResult.ok === true, 'Current timestamp passes');
});

test('Integration: Segment functions exported', async () => {
  const { 
    createSegment, 
    createChatUserPayload, 
    isMessageType, 
    STA_TYPES 
  } = await import('../src/index.js');
  
  assert(typeof createSegment === 'function', 'createSegment exported');
  assert(typeof createChatUserPayload === 'function', 'createChatUserPayload exported');
  assert(isMessageType(STA_TYPES.CHAT_USER) === true, 'isMessageType works');
});

test('Integration: Identity utilities exported', async () => {
  const { formatHid, isValidHid } = await import('../src/index.js');
  
  assert(formatHid('HID-ABCD1234') === 'HID-...1234', 'formatHid works');
  assert(isValidHid('HID-ABCD1234') === true, 'isValidHid accepts valid');
  assert(isValidHid('invalid') === false, 'isValidHid rejects invalid');
});

test('Integration: Caps utilities exported', async () => {
  const { getTimeUntilDailyReset, formatCapsProgress } = await import('../src/index.js');
  
  const timeUntil = getTimeUntilDailyReset();
  assert(typeof timeUntil.hours === 'number', 'getTimeUntilDailyReset works');
  
  const progress = formatCapsProgress({ daily: 1800, monthly: 18000, yearly: 60000 });
  assert(progress.daily.percent === 50, 'formatCapsProgress works');
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
