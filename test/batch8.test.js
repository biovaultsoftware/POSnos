// Test: Batch 8 - End-to-End Integration & Deployment
// Run with: node --experimental-vm-modules test/batch8.test.js

// Import everything from main index to verify exports work
import * as SovereignOS from '../src/index.js';

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
  console.log('BATCH 8 TESTS: End-to-End Integration & Deployment');
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
// FULL EXPORT VERIFICATION
// ============================================================================

test('E2E: All core modules exported', () => {
  // Constants
  assert(SovereignOS.PROTOCOL_VERSION === 2, 'PROTOCOL_VERSION');
  assert(SovereignOS.GENESIS_HASH === 'GENESIS', 'GENESIS_HASH');
  assert(SovereignOS.DAILY_CAP === 3600, 'DAILY_CAP');
  assert(SovereignOS.MONTHLY_CAP === 36000, 'MONTHLY_CAP');
  assert(SovereignOS.YEARLY_CAP === 120000, 'YEARLY_CAP');
  
  // Types
  assert(SovereignOS.STA_TYPES.CHAT_USER === 'chat.user', 'STA_TYPES');
  assert(Object.keys(SovereignOS.COUNCIL_MEMBERS).length === 10, 'COUNCIL_MEMBERS');
  assert(Object.keys(SovereignOS.STORES).length >= 10, 'STORES');
});

test('E2E: Crypto functions exported and work', async () => {
  const { sha256Hex, randomHex, canonicalize, generateSigningKeyPair } = SovereignOS;
  
  // SHA-256
  const hash = await sha256Hex('test');
  assert(hash.length === 64, 'sha256Hex produces 64 char hex');
  assert(/^[0-9a-f]+$/.test(hash), 'sha256Hex is hex');
  
  // Random hex
  const rand = randomHex(16);
  assert(rand.length === 32, 'randomHex(16) produces 32 chars');
  
  // Canonicalize
  const canon = canonicalize({ z: 1, a: 2, m: 3 });
  assert(canon === '{"a":2,"m":3,"z":1}', 'canonicalize sorts keys');
  
  // Key generation
  const keyPair = await generateSigningKeyPair();
  assert(keyPair.publicKey, 'Key pair has public key');
  assert(keyPair.privateKey, 'Key pair has private key');
});

test('E2E: Segment creation works', () => {
  const { createSegment, createChatUserPayload, STA_TYPES } = SovereignOS;
  
  const payload = createChatUserPayload({ chatId: 'kareem', text: 'Hello world' });
  assert(payload.chatId === 'kareem', 'Payload chatId');
  assert(payload.text === 'Hello world', 'Payload text');
  assert(payload.role === 'user', 'Payload role');
  
  const segment = createSegment({
    seq: 1,
    type: STA_TYPES.CHAT_USER,
    payload,
    prevHash: 'GENESIS'
  });
  
  assert(segment.v === 2, 'Segment version');
  assert(segment.seq === 1, 'Segment sequence');
  assert(segment.type === STA_TYPES.CHAT_USER, 'Segment type');
  assert(segment.prev_hash === 'GENESIS', 'Segment prev_hash');
});

test('E2E: Validation functions work', () => {
  const { validateTimestamp, validateSegmentStructure, STA_TYPES, randomHex } = SovereignOS;
  
  // Timestamp validation
  const tsResult = validateTimestamp(Date.now());
  assert(tsResult.ok === true, 'Current timestamp valid');
  
  const oldTs = validateTimestamp(Date.now() - 86400000 * 365);
  assert(oldTs.ok === false, 'Old timestamp invalid');
  
  // Segment structure validation
  const validSegment = {
    v: 2,
    seq: 1,
    timestamp: Date.now(),
    nonce: randomHex(16), // 32 char hex
    type: STA_TYPES.CHAT_USER,
    payload: { chatId: 'test', text: 'hello', role: 'user' },
    prev_hash: 'GENESIS',
    current_owner: 'HID-TEST123',
    author: { 
      hid: 'HID-TEST123',
      pubJwk: { kty: 'EC', crv: 'P-256', x: 'test', y: 'test' }
    },
    signature: 'sig_placeholder'
  };
  
  const structResult = validateSegmentStructure(validSegment);
  assert(structResult.valid === true, `Valid segment structure passes: ${structResult.reason || 'ok'}`);
});

test('E2E: Council functions work', () => {
  const { council, checkKillSwitch, CHARACTER_PROMPTS } = SovereignOS;
  
  // Get all characters
  const chars = council.getAllCharacters();
  assert(chars.length === 10, '10 council characters');
  
  // Character prompts exist
  assert(CHARACTER_PROMPTS.kareem, 'Kareem prompt exists');
  assert(CHARACTER_PROMPTS.wheat, 'Wheat prompt exists');
  
  // Kill switch works
  const blocked = checkKillSwitch('What is the weather today?');
  assert(blocked.blocked === true, 'Weather is blocked');
  
  const allowed = checkKillSwitch('How do I start a business?');
  assert(allowed.blocked === false, 'Business allowed');
  
  // Character detection
  const rec = council.detectRecommendedCharacter('I want easy passive income');
  assert(rec === 'kareem', 'Kareem recommended for lazy');
});

test('E2E: ECF pricing works', () => {
  const { ecf, getPlanPricing, SUBSCRIPTION_PLANS } = SovereignOS;
  
  // ECF values
  assert(ecf.getECF('US') === 1.0, 'US ECF is 1.0');
  assert(ecf.getECF('EG') < 0.2, 'Egypt ECF is low');
  
  // Pricing
  const usPrice = ecf.calculatePrice('US');
  const egPrice = ecf.calculatePrice('EG');
  assert(usPrice === 40, 'US price is $40');
  assert(egPrice < 10, 'Egypt price is under $10');
  
  // Plan pricing
  const plan = getPlanPricing('monthly', 'EG');
  assert(plan.adjustedPrice < 10, 'Egypt monthly plan is discounted');
  
  // Subscription plans
  assert(SUBSCRIPTION_PLANS.monthly.basePrice === 40, 'Monthly base price');
  assert(SUBSCRIPTION_PLANS.yearly.discount === 17, 'Yearly discount');
});

test('E2E: Payment exports work', () => {
  const { PAYMENT_PROVIDERS, PAYMENT_STATUS, StripePaymentHandler, CoinbasePaymentHandler } = SovereignOS;
  
  assert(PAYMENT_PROVIDERS.STRIPE === 'stripe', 'Stripe provider');
  assert(PAYMENT_STATUS.COMPLETED === 'completed', 'Completed status');
  assert(typeof StripePaymentHandler === 'function', 'Stripe handler');
  assert(typeof CoinbasePaymentHandler === 'function', 'Coinbase handler');
});

test('E2E: Shadow training exports work', () => {
  const { Anonymizer, SessionExtractor, R2_CONFIG } = SovereignOS;
  
  assert(typeof Anonymizer === 'function', 'Anonymizer class');
  assert(typeof SessionExtractor === 'function', 'SessionExtractor class');
  assert(R2_CONFIG.bucket === 'sovereign-os-training', 'R2 bucket config');
  
  // Anonymizer works
  const anon = new Anonymizer();
  const result = anon.anonymizeText('Email: test@test.com');
  assert(result.includes('[EMAIL]'), 'Anonymizer redacts email');
});

test('E2E: Integrity functions exported', () => {
  const { 
    verifyBackupRestoreEligibility, 
    detectClonedDevice,
    getChainStats
  } = SovereignOS;
  
  assert(typeof verifyBackupRestoreEligibility === 'function', 'verifyBackupRestoreEligibility');
  assert(typeof detectClonedDevice === 'function', 'detectClonedDevice');
  assert(typeof getChainStats === 'function', 'getChainStats');
  
  // Backup verification
  const result = verifyBackupRestoreEligibility(
    { chainLen: 10, chainHead: 'abc' },
    null
  );
  assert(result.canRestore === true, 'Fresh install allows restore');
});

test('E2E: Identity utilities work', () => {
  const { formatHid, isValidHid } = SovereignOS;
  
  assert(formatHid('HID-ABCD1234') === 'HID-...1234', 'formatHid');
  assert(isValidHid('HID-ABC12345') === true, 'Valid HID accepted');
  assert(isValidHid('invalid') === false, 'Invalid HID rejected');
});

test('E2E: Caps utilities work', () => {
  const { getTimeUntilDailyReset, formatCapsProgress, DAILY_CAP, MONTHLY_CAP, YEARLY_CAP } = SovereignOS;
  
  const timeUntil = getTimeUntilDailyReset();
  assert(typeof timeUntil.hours === 'number', 'Hours in reset time');
  assert(typeof timeUntil.minutes === 'number', 'Minutes in reset time');
  
  const progress = formatCapsProgress({
    daily: DAILY_CAP / 2,
    monthly: MONTHLY_CAP / 2,
    yearly: YEARLY_CAP / 2
  });
  assert(progress.daily.percent === 50, 'Daily at 50%');
  assert(progress.monthly.percent === 50, 'Monthly at 50%');
  assert(progress.yearly.percent === 50, 'Yearly at 50%');
});

test('E2E: TVM functions work', () => {
  const { calculateRichScore, calculateBusinessScore, detectMotivator, detectCategory } = SovereignOS;
  
  // Rich score
  const rich = calculateRichScore({ endState: 'rich' });
  assert(rich >= 70, 'Rich end state scores >=70');
  
  const poor = calculateRichScore({ endState: 'poor' });
  assert(poor < 70, 'Poor end state scores <70');
  
  // Business score
  const wheat = calculateBusinessScore({ category: 'wheat' });
  const tomato = calculateBusinessScore({ category: 'tomato' });
  assert(wheat > tomato, 'Wheat scores higher than tomato');
  
  // Motivator detection
  const lazy = detectMotivator([{ text: 'I want easy money' }]);
  assert(lazy === 'laziness', 'Detects laziness');
  
  // Category detection
  const wheatCat = detectCategory([{ text: 'essential needs' }]);
  assert(wheatCat === 'wheat', 'Detects wheat category');
});

test('E2E: Version info correct', () => {
  const { VERSION, getVersionString } = SovereignOS;
  
  assert(VERSION.major === 2, 'Major version 2');
  assert(VERSION.minor === 0, 'Minor version 0');
  assert(VERSION.protocol === 2, 'Protocol version 2');
  assert(VERSION.codename === 'SovereignOS', 'Codename');
  
  const versionStr = getVersionString();
  assert(versionStr.startsWith('2.0'), 'Version string starts with 2.0');
});

// ============================================================================
// WORKFLOW TESTS
// ============================================================================

test('E2E: Complete segment creation workflow', async () => {
  const { 
    createSegment, 
    createChatUserPayload, 
    createAIAdvicePayload,
    STA_TYPES, 
    sha256Hex,
    getSignableContent
  } = SovereignOS;
  
  // Create user message
  const userPayload = createChatUserPayload({ chatId: 'hakim', text: 'Tell me about sheep farming' });
  const userSegment = createSegment({
    seq: 1,
    type: STA_TYPES.CHAT_USER,
    payload: userPayload,
    prevHash: 'GENESIS'
  });
  
  // Create AI response
  const aiPayload = createAIAdvicePayload({ 
    chatId: 'hakim', 
    selectedCharacter: 'hakim',
    mode: 'council',
    bubbles: [],
    text: 'Let me tell you about the sheep...'
  });
  
  // Get signable content
  const signable = getSignableContent(userSegment);
  assert(typeof signable === 'string', 'Signable content is string');
  
  // Hash it
  const hash = await sha256Hex(signable);
  assert(hash.length === 64, 'Hash is valid');
});

test('E2E: ECF country pricing workflow', () => {
  const { ecf, getPlanPricing } = SovereignOS;
  
  const countries = ['US', 'EG', 'IN', 'BR', 'DE'];
  const prices = {};
  
  for (const country of countries) {
    const pricing = ecf.getPricingInfo(country);
    prices[country] = pricing;
    
    assert(pricing.countryCode === country, `Country code for ${country}`);
    assert(typeof pricing.adjustedPrice === 'number', `Price for ${country}`);
    assert(pricing.tier >= 1 && pricing.tier <= 4, `Tier for ${country}`);
  }
  
  // Verify price ordering
  assert(prices.US.adjustedPrice >= prices.EG.adjustedPrice, 'US >= Egypt');
  assert(prices.DE.adjustedPrice >= prices.IN.adjustedPrice, 'Germany >= India');
});

test('E2E: Kill switch workflow', () => {
  const { council, checkKillSwitch } = SovereignOS;
  
  const testCases = [
    { input: 'How do I vote?', blocked: true },
    { input: 'What church should I attend?', blocked: true },
    { input: 'Who won the football game?', blocked: true },
    { input: 'Tell me a joke', blocked: true },
    { input: 'How do I start an LLC?', blocked: false },
    { input: 'What is passive income?', blocked: false },
    { input: 'Help me scale my business', blocked: false }
  ];
  
  for (const tc of testCases) {
    const result = checkKillSwitch(tc.input);
    assert(result.blocked === tc.blocked, 
      `"${tc.input}" should be ${tc.blocked ? 'blocked' : 'allowed'}`);
  }
});

test('E2E: Anonymization workflow', () => {
  const { Anonymizer, STA_TYPES } = SovereignOS;
  
  const anon = new Anonymizer();
  
  const piiText = `
    Contact John Doe at john@example.com or 555-123-4567.
    SSN: 123-45-6789. Card: 4111-1111-1111-1111.
    Visit https://secret.com/private for details.
  `;
  
  const result = anon.anonymizeText(piiText);
  
  assert(!result.includes('john@example.com'), 'Email redacted');
  assert(!result.includes('555-123-4567'), 'Phone redacted');
  assert(!result.includes('123-45-6789'), 'SSN redacted');
  assert(!result.includes('4111'), 'CC redacted');
  assert(!result.includes('https://secret.com'), 'URL redacted');
  
  assert(result.includes('[EMAIL]'), 'Email placeholder');
  assert(result.includes('[PHONE]'), 'Phone placeholder');
  assert(result.includes('[SSN]'), 'SSN placeholder');
  assert(result.includes('[CC]'), 'CC placeholder');
  assert(result.includes('[URL]'), 'URL placeholder');
});

// ============================================================================
// PERFORMANCE BENCHMARKS
// ============================================================================

test('Perf: SHA-256 hashing speed', async () => {
  const { sha256Hex } = SovereignOS;
  
  const iterations = 100;
  const start = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    await sha256Hex(`test_data_${i}`);
  }
  
  const elapsed = Date.now() - start;
  const perHash = elapsed / iterations;
  
  assert(perHash < 10, `Hashing should be <10ms per hash, got ${perHash}ms`);
});

test('Perf: Canonicalization speed', () => {
  const { canonicalize } = SovereignOS;
  
  const complexObj = {
    z: 1, y: 2, x: 3,
    nested: { c: 1, b: 2, a: 3 },
    array: [1, 2, 3, 4, 5]
  };
  
  const iterations = 1000;
  const start = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    canonicalize(complexObj);
  }
  
  const elapsed = Date.now() - start;
  const perOp = elapsed / iterations;
  
  assert(perOp < 1, `Canonicalize should be <1ms per op, got ${perOp}ms`);
});

test('Perf: Anonymization speed', () => {
  const { Anonymizer } = SovereignOS;
  const anon = new Anonymizer();
  
  const text = 'Email: test@test.com, Phone: 555-123-4567, SSN: 123-45-6789';
  
  const iterations = 1000;
  const start = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    anon.anonymizeText(text);
  }
  
  const elapsed = Date.now() - start;
  const perOp = elapsed / iterations;
  
  assert(perOp < 1, `Anonymize should be <1ms per op, got ${perOp}ms`);
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
