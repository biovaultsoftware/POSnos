// Test: Batch 7 - Payments & Shadow Training
// Run with: node --experimental-vm-modules test/batch7.test.js

import {
  PAYMENT_PROVIDERS,
  PAYMENT_STATUS,
  StripePaymentHandler,
  CoinbasePaymentHandler
} from '../src/payments.js';

import {
  Anonymizer,
  SessionExtractor
} from '../src/shadow.js';

import { STA_TYPES, SUBSCRIPTION_PLANS, ECF_BASE_PRICE_USD } from '../src/constants.js';

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
  console.log('BATCH 7 TESTS: Payments & Shadow Training');
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
// PAYMENT PROVIDER TESTS
// ============================================================================

test('Payments: Provider constants defined', () => {
  assert(PAYMENT_PROVIDERS.STRIPE === 'stripe', 'Stripe provider');
  assert(PAYMENT_PROVIDERS.COINBASE === 'coinbase', 'Coinbase provider');
  assert(PAYMENT_PROVIDERS.APPLE === 'apple', 'Apple provider');
  assert(PAYMENT_PROVIDERS.GOOGLE === 'google', 'Google provider');
});

test('Payments: Status constants defined', () => {
  assert(PAYMENT_STATUS.PENDING === 'pending', 'Pending status');
  assert(PAYMENT_STATUS.COMPLETED === 'completed', 'Completed status');
  assert(PAYMENT_STATUS.FAILED === 'failed', 'Failed status');
  assert(PAYMENT_STATUS.REFUNDED === 'refunded', 'Refunded status');
});

test('Payments: Subscription plans defined', () => {
  assert(SUBSCRIPTION_PLANS.monthly, 'Monthly plan exists');
  assert(SUBSCRIPTION_PLANS.yearly, 'Yearly plan exists');
  assert(SUBSCRIPTION_PLANS.monthly.basePrice === ECF_BASE_PRICE_USD, 'Monthly price correct');
  assert(SUBSCRIPTION_PLANS.yearly.basePrice === ECF_BASE_PRICE_USD * 10, 'Yearly price (2 months free)');
});

// ============================================================================
// STRIPE HANDLER TESTS
// ============================================================================

test('Stripe: Handler instantiates', () => {
  const handler = new StripePaymentHandler({ publishableKey: 'pk_test_xxx' });
  assert(handler.publishableKey === 'pk_test_xxx', 'Publishable key set');
  assert(handler.initialized === false, 'Not initialized yet');
});

test('Stripe: Init marks initialized', async () => {
  const handler = new StripePaymentHandler();
  const result = await handler.init();
  assert(result === true, 'Init returns true');
  assert(handler.initialized === true, 'Marked as initialized');
});

test('Stripe: ECF calculator accessible', () => {
  const handler = new StripePaymentHandler();
  assert(handler.ecfCalculator, 'ECF calculator exists');
  assert(handler.ecfCalculator.getECF('US') === 1.0, 'ECF calculator works');
});

// ============================================================================
// COINBASE HANDLER TESTS
// ============================================================================

test('Coinbase: Handler instantiates', () => {
  const handler = new CoinbasePaymentHandler({ apiEndpoint: '/api/cb' });
  assert(handler.apiEndpoint === '/api/cb', 'API endpoint set');
});

test('Coinbase: Init marks initialized', async () => {
  const handler = new CoinbasePaymentHandler();
  const result = await handler.init();
  assert(result === true, 'Init returns true');
  assert(handler.initialized === true, 'Marked as initialized');
});

test('Coinbase: Supported currencies list', () => {
  const handler = new CoinbasePaymentHandler();
  const currencies = handler.getSupportedCurrencies();
  
  assert(currencies.includes('BTC'), 'Bitcoin supported');
  assert(currencies.includes('ETH'), 'Ethereum supported');
  assert(currencies.includes('USDC'), 'USDC supported');
  assert(currencies.length >= 5, 'Multiple currencies');
});

// ============================================================================
// ANONYMIZER TESTS
// ============================================================================

test('Anonymizer: Redacts email addresses', () => {
  const anon = new Anonymizer();
  const result = anon.anonymizeText('Contact me at john@example.com please');
  
  assert(!result.includes('john@example.com'), 'Email removed');
  assert(result.includes('[EMAIL]'), 'Email replaced with placeholder');
});

test('Anonymizer: Redacts phone numbers', () => {
  const anon = new Anonymizer();
  const result = anon.anonymizeText('Call me at 555-123-4567');
  
  assert(!result.includes('555-123-4567'), 'Phone removed');
  assert(result.includes('[PHONE]'), 'Phone replaced');
});

test('Anonymizer: Redacts SSN', () => {
  const anon = new Anonymizer();
  const result = anon.anonymizeText('My SSN is 123-45-6789');
  
  assert(!result.includes('123-45-6789'), 'SSN removed');
  assert(result.includes('[SSN]'), 'SSN replaced');
});

test('Anonymizer: Redacts credit card numbers', () => {
  const anon = new Anonymizer();
  const result = anon.anonymizeText('Card: 4111-1111-1111-1111');
  
  assert(!result.includes('4111'), 'CC removed');
  assert(result.includes('[CC]'), 'CC replaced');
});

test('Anonymizer: Redacts URLs', () => {
  const anon = new Anonymizer();
  const result = anon.anonymizeText('Check https://example.com/secret');
  
  assert(!result.includes('https://example.com'), 'URL removed');
  assert(result.includes('[URL]'), 'URL replaced');
});

test('Anonymizer: Generates anonymous IDs', () => {
  const anon = new Anonymizer();
  
  const id1 = anon.getAnonymousId('HID-ABC123');
  const id2 = anon.getAnonymousId('HID-DEF456');
  const id3 = anon.getAnonymousId('HID-ABC123'); // Same as first
  
  assert(id1.startsWith('anon_'), 'Anonymous ID format');
  assert(id1 !== id2, 'Different HIDs get different IDs');
  assert(id1 === id3, 'Same HID gets same ID');
});

test('Anonymizer: Rounds timestamps', () => {
  const anon = new Anonymizer();
  
  const ts1 = 1704067200000; // Exact hour
  const ts2 = 1704067200000 + 30 * 60 * 1000; // +30 minutes
  
  const rounded1 = anon.roundTimestamp(ts1);
  const rounded2 = anon.roundTimestamp(ts2);
  
  assert(rounded1 === rounded2, 'Both round to same hour');
  assert(rounded1 % 3600000 === 0, 'Result is hour-aligned');
});

test('Anonymizer: Anonymizes segment', () => {
  const anon = new Anonymizer();
  
  const segment = {
    v: 2,
    seq: 42,
    timestamp: Date.now(),
    nonce: 'abc123',
    type: STA_TYPES.CHAT_USER,
    payload: {
      chatId: 'chat_123',
      text: 'Email me at test@test.com',
      role: 'user'
    },
    author: { hid: 'HID-REAL123' },
    signature: 'sig_xxx'
  };
  
  const result = anon.anonymizeSegment(segment);
  
  assert(result.v === 2, 'Version preserved');
  assert(result.type === STA_TYPES.CHAT_USER, 'Type preserved');
  assert(!result.seq, 'Sequence removed');
  assert(!result.nonce, 'Nonce removed');
  assert(!result.signature, 'Signature removed');
  assert(result.payload.text.includes('[EMAIL]'), 'Email redacted');
  assert(result.authorId.startsWith('anon_'), 'Author anonymized');
});

test('Anonymizer: Reset clears state', () => {
  const anon = new Anonymizer();
  
  anon.getAnonymousId('test1');
  anon.getAnonymousId('test2');
  assert(anon.counter === 2, 'Counter incremented');
  
  anon.reset();
  
  assert(anon.counter === 0, 'Counter reset');
  assert(anon.entityMap.size === 0, 'Map cleared');
});

// ============================================================================
// SESSION EXTRACTOR TESTS
// ============================================================================

test('SessionExtractor: Extracts sessions from segments', () => {
  const extractor = new SessionExtractor();
  
  const segments = [
    { type: STA_TYPES.CHAT_USER, payload: { chatId: 'c1', text: 'Hello', role: 'user' }, timestamp: 1000 },
    { type: STA_TYPES.AI_ADVICE, payload: { chatId: 'c1', text: 'Hi there!', role: 'assistant' }, timestamp: 2000 },
    { type: STA_TYPES.CHAT_USER, payload: { chatId: 'c1', text: 'Question', role: 'user' }, timestamp: 3000 },
    { type: STA_TYPES.AI_ADVICE, payload: { chatId: 'c1', text: 'Answer', role: 'assistant' }, timestamp: 4000 }
  ];
  
  const sessions = extractor.extractSessions(segments);
  
  assert(sessions.length === 1, 'One session extracted');
  assert(sessions[0].messageCount === 4, 'Four messages in session');
  assert(sessions[0].messages[0].role === 'user', 'First message is user');
  assert(sessions[0].sessionId.startsWith('anon_'), 'Session ID anonymized');
});

test('SessionExtractor: Groups by chatId', () => {
  const extractor = new SessionExtractor();
  
  const segments = [
    { type: STA_TYPES.CHAT_USER, payload: { chatId: 'chat1', text: 'A', role: 'user' }, timestamp: 1000 },
    { type: STA_TYPES.AI_ADVICE, payload: { chatId: 'chat1', text: 'B', role: 'assistant' }, timestamp: 2000 },
    { type: STA_TYPES.CHAT_USER, payload: { chatId: 'chat2', text: 'C', role: 'user' }, timestamp: 3000 },
    { type: STA_TYPES.AI_ADVICE, payload: { chatId: 'chat2', text: 'D', role: 'assistant' }, timestamp: 4000 }
  ];
  
  const sessions = extractor.extractSessions(segments);
  
  assert(sessions.length === 2, 'Two sessions extracted');
});

test('SessionExtractor: Skips incomplete sessions', () => {
  const extractor = new SessionExtractor();
  
  const segments = [
    { type: STA_TYPES.CHAT_USER, payload: { chatId: 'c1', text: 'Only user', role: 'user' }, timestamp: 1000 }
  ];
  
  const sessions = extractor.extractSessions(segments);
  
  assert(sessions.length === 0, 'Incomplete session skipped');
});

test('SessionExtractor: Anonymizes content', () => {
  const extractor = new SessionExtractor();
  
  const segments = [
    { type: STA_TYPES.CHAT_USER, payload: { chatId: 'c1', text: 'My email is test@test.com', role: 'user' }, timestamp: 1000 },
    { type: STA_TYPES.AI_ADVICE, payload: { chatId: 'c1', text: 'Got it', role: 'assistant' }, timestamp: 2000 }
  ];
  
  const sessions = extractor.extractSessions(segments);
  
  assert(sessions[0].messages[0].content.includes('[EMAIL]'), 'Email anonymized in session');
});

// ============================================================================
// DECISION-OUTCOME EXTRACTION TESTS
// ============================================================================

test('SessionExtractor: Extracts decision-outcomes', () => {
  const extractor = new SessionExtractor();
  
  const segments = [
    { 
      type: STA_TYPES.BIZ_DECISION, 
      seq: 1,
      payload: { decisionId: 'd1', decision: 'Start a business', category: 'wheat' },
      timestamp: 1000
    },
    { 
      type: STA_TYPES.BIZ_OUTCOME, 
      payload: { decisionRef: 'd1', outcome: 'Success!', success: true },
      timestamp: 2000
    }
  ];
  
  const pairs = extractor.extractDecisionOutcomes(segments);
  
  assert(pairs.length === 1, 'One decision-outcome pair');
  assert(pairs[0].outcomes.length === 1, 'One outcome for decision');
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
