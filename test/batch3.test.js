// Test: Batch 3 - Caps & Identity
// Run with: node --experimental-vm-modules test/batch3.test.js

import {
  DAILY_CAP,
  MONTHLY_CAP,
  YEARLY_CAP,
  INITIAL_UNLOCKED_SEGMENTS
} from '../src/constants.js';

import {
  getTimeUntilDailyReset,
  formatCapsProgress
} from '../src/caps.js';

import {
  formatHid,
  isValidHid
} from '../src/identity.js';

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
  console.log('BATCH 3 TESTS: Caps & Identity');
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
// CAPS UTILITY TESTS
// ============================================================================

test('Caps: getTimeUntilDailyReset returns valid object', () => {
  const result = getTimeUntilDailyReset();
  
  assert(typeof result.hours === 'number', 'hours should be number');
  assert(typeof result.minutes === 'number', 'minutes should be number');
  assert(typeof result.seconds === 'number', 'seconds should be number');
  assert(result.hours >= 0 && result.hours <= 24, 'hours should be 0-24');
  assert(result.minutes >= 0 && result.minutes < 60, 'minutes should be 0-59');
  assert(result.seconds >= 0 && result.seconds < 60, 'seconds should be 0-59');
});

test('Caps: formatCapsProgress calculates percentages', () => {
  const caps = {
    daily: 1800,
    monthly: 18000,
    yearly: 60000
  };
  
  const progress = formatCapsProgress(caps);
  
  assert(progress.daily.used === 1800, 'daily used');
  assert(progress.daily.limit === DAILY_CAP, 'daily limit');
  assert(progress.daily.percent === 50, `daily percent: ${progress.daily.percent}`);
  
  assert(progress.monthly.percent === 50, `monthly percent: ${progress.monthly.percent}`);
  assert(progress.yearly.percent === 50, `yearly percent: ${progress.yearly.percent}`);
});

test('Caps: formatCapsProgress handles empty caps', () => {
  const caps = {
    daily: 0,
    monthly: 0,
    yearly: 0
  };
  
  const progress = formatCapsProgress(caps);
  
  assert(progress.daily.percent === 0, 'empty daily should be 0%');
  assert(progress.monthly.percent === 0, 'empty monthly should be 0%');
  assert(progress.yearly.percent === 0, 'empty yearly should be 0%');
});

test('Caps: formatCapsProgress handles full caps', () => {
  const caps = {
    daily: DAILY_CAP,
    monthly: MONTHLY_CAP,
    yearly: YEARLY_CAP
  };
  
  const progress = formatCapsProgress(caps);
  
  assert(progress.daily.percent === 100, 'full daily should be 100%');
  assert(progress.monthly.percent === 100, 'full monthly should be 100%');
  assert(progress.yearly.percent === 100, 'full yearly should be 100%');
});

// ============================================================================
// IDENTITY UTILITY TESTS
// ============================================================================

test('Identity: formatHid formats correctly', () => {
  const hid = 'HID-ABCD1234';
  const formatted = formatHid(hid);
  
  assert(formatted === 'HID-...1234', `Expected 'HID-...1234', got '${formatted}'`);
});

test('Identity: formatHid handles invalid input', () => {
  assert(formatHid(null) === null, 'null should return null');
  assert(formatHid('') === '', 'empty should return empty');
  assert(formatHid('INVALID') === 'INVALID', 'non-HID should pass through');
});

test('Identity: isValidHid validates correct format', () => {
  assert(isValidHid('HID-ABCD1234') === true, 'valid HID should pass');
  assert(isValidHid('HID-12345678') === true, 'numeric HID should pass');
  assert(isValidHid('HID-FFFFFFFF') === true, 'uppercase HID should pass');
});

test('Identity: isValidHid rejects invalid formats', () => {
  assert(isValidHid('HID-abcd1234') === false, 'lowercase should fail');
  assert(isValidHid('HID-ABCD123') === false, 'too short should fail');
  assert(isValidHid('HID-ABCD12345') === false, 'too long should fail');
  assert(isValidHid('ABC-ABCD1234') === false, 'wrong prefix should fail');
  assert(isValidHid('HIDABCD1234') === false, 'missing dash should fail');
  assert(isValidHid(null) === false, 'null should fail');
  assert(isValidHid(123) === false, 'number should fail');
});

// ============================================================================
// CAP LIMITS TESTS
// ============================================================================

test('Caps: Initial balance is 1200', () => {
  assert(INITIAL_UNLOCKED_SEGMENTS === 1200, 
    `Expected 1200, got ${INITIAL_UNLOCKED_SEGMENTS}`);
});

test('Caps: Daily cap is 3600', () => {
  assert(DAILY_CAP === 3600, `Expected 3600, got ${DAILY_CAP}`);
});

test('Caps: Monthly cap is 36000', () => {
  assert(MONTHLY_CAP === 36000, `Expected 36000, got ${MONTHLY_CAP}`);
});

test('Caps: Yearly cap is 120000', () => {
  assert(YEARLY_CAP === 120000, `Expected 120000, got ${YEARLY_CAP}`);
});

test('Caps: Monthly cap is 10x daily cap', () => {
  assert(MONTHLY_CAP === DAILY_CAP * 10, 'Monthly should be 10x daily');
});

test('Caps: Yearly cap is ~3.33x monthly cap', () => {
  const ratio = YEARLY_CAP / MONTHLY_CAP;
  assert(ratio > 3.3 && ratio < 3.4, `Ratio should be ~3.33, got ${ratio}`);
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
