// Test: Batch 5 - Networking & ECF
// Run with: node --experimental-vm-modules test/batch5.test.js

import { SignalClient, LocalSignalServer } from '../src/signal.js';
import { ECFCalculator, ecf, SUBSCRIPTION_PLANS } from '../src/ecf.js';
import { ECF_BASE_PRICE_USD } from '../src/constants.js';

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
  console.log('BATCH 5 TESTS: Networking & ECF');
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
// SIGNAL CLIENT TESTS
// ============================================================================

test('Signal: URL normalization - http to ws', () => {
  const client = new SignalClient('http://example.com');
  assert(client.serverUrl === 'ws://example.com', `Expected ws://, got ${client.serverUrl}`);
});

test('Signal: URL normalization - https to wss', () => {
  const client = new SignalClient('https://example.com');
  assert(client.serverUrl === 'wss://example.com', `Expected wss://, got ${client.serverUrl}`);
});

test('Signal: URL normalization - removes trailing slash', () => {
  const client = new SignalClient('wss://example.com/');
  assert(client.serverUrl === 'wss://example.com', `Expected no trailing slash, got ${client.serverUrl}`);
});

test('Signal: URL normalization - adds wss by default', () => {
  const client = new SignalClient('example.com');
  assert(client.serverUrl === 'wss://example.com', `Expected wss://, got ${client.serverUrl}`);
});

test('Signal: Initial state is disconnected', () => {
  const client = new SignalClient('wss://test.com');
  assert(client.state === 'disconnected', `Expected disconnected, got ${client.state}`);
});

test('Signal: getInfo returns expected fields', () => {
  const client = new SignalClient('wss://test.com');
  const info = client.getInfo();
  
  assert(info.serverUrl === 'wss://test.com', 'serverUrl missing');
  assert(info.state === 'disconnected', 'state missing');
  assert(info.queueLength === 0, 'queueLength missing');
});

test('Signal: Messages are queued when disconnected', () => {
  const client = new SignalClient('wss://test.com');
  
  client.send({ type: 'test', data: 'hello' });
  client.send({ type: 'test', data: 'world' });
  
  const info = client.getInfo();
  assert(info.queueLength === 2, `Expected 2 queued, got ${info.queueLength}`);
});

// ============================================================================
// LOCAL SIGNAL SERVER TESTS
// ============================================================================

test('LocalSignal: Register client', () => {
  const server = new LocalSignalServer();
  
  server.register('client1', () => {});
  
  const clients = server.getClients();
  assert(clients.includes('client1'), 'Client should be registered');
});

test('LocalSignal: Unregister client', () => {
  const server = new LocalSignalServer();
  
  server.register('client1', () => {});
  server.unregister('client1');
  
  const clients = server.getClients();
  assert(!clients.includes('client1'), 'Client should be unregistered');
});

test('LocalSignal: Route message', () => {
  const server = new LocalSignalServer();
  let received = null;
  
  server.register('client2', (msg) => { received = msg; });
  server.route('client1', 'client2', 'test', { hello: 'world' });
  
  assert(received !== null, 'Message should be received');
  assert(received.type === 'signal', 'Type should be signal');
  assert(received.from === 'client1', 'From should be client1');
  assert(received.signalType === 'test', 'Signal type should be test');
});

// ============================================================================
// ECF CALCULATOR TESTS
// ============================================================================

test('ECF: Base price is $40', () => {
  assert(ECF_BASE_PRICE_USD === 40, `Expected 40, got ${ECF_BASE_PRICE_USD}`);
});

test('ECF: US gets ECF of 1.0', () => {
  const ecfVal = ecf.getECF('US');
  assert(ecfVal === 1.0, `Expected 1.0, got ${ecfVal}`);
});

test('ECF: Egypt gets low ECF', () => {
  const ecfVal = ecf.getECF('EG');
  assert(ecfVal < 0.2, `Expected <0.2, got ${ecfVal}`);
});

test('ECF: India gets low ECF', () => {
  const ecfVal = ecf.getECF('IN');
  assert(ecfVal < 0.2, `Expected <0.2, got ${ecfVal}`);
});

test('ECF: Unknown country defaults to 1.0', () => {
  const ecfVal = ecf.getECF('XX');
  assert(ecfVal === 1.0, `Expected 1.0 for unknown, got ${ecfVal}`);
});

test('ECF: Case insensitive country codes', () => {
  const upper = ecf.getECF('US');
  const lower = ecf.getECF('us');
  assert(upper === lower, 'Should be case insensitive');
});

test('ECF: US price is $40', () => {
  const price = ecf.calculatePrice('US');
  assert(price === 40, `Expected 40, got ${price}`);
});

test('ECF: Egypt price is much lower', () => {
  const usPrice = ecf.calculatePrice('US');
  const egPrice = ecf.calculatePrice('EG');
  assert(egPrice < usPrice / 2, `Egypt (${egPrice}) should be < half of US (${usPrice})`);
});

test('ECF: Minimum price is $0.99', () => {
  // Even with very low ECF, price should not go below $0.99
  const calc = new ECFCalculator();
  calc.countryData = { 'ZZ': 0.001 }; // Extremely low ECF
  const price = calc.calculatePrice('ZZ');
  assert(price >= 0.99, `Price should be at least $0.99, got ${price}`);
});

test('ECF: Crypto price is always full price', () => {
  const cryptoPrice = ecf.getCryptoPrice();
  assert(cryptoPrice === ECF_BASE_PRICE_USD, `Expected ${ECF_BASE_PRICE_USD}, got ${cryptoPrice}`);
});

// ============================================================================
// ECF TIER TESTS
// ============================================================================

test('ECF: US is Tier 1 Standard', () => {
  const tier = ecf.getTier('US');
  assert(tier.tier === 1, `Expected tier 1, got ${tier.tier}`);
  assert(tier.name === 'Standard', `Expected Standard, got ${tier.name}`);
  assert(tier.discount === 0, `Expected 0% discount, got ${tier.discount}`);
});

test('ECF: Brazil has discount', () => {
  const tier = ecf.getTier('BR');
  assert(tier.tier >= 2, `Expected tier >= 2, got ${tier.tier}`);
  assert(tier.discount > 50, `Should have >50% discount, got ${tier.discount}`);
});

test('ECF: India is Tier 3', () => {
  const tier = ecf.getTier('IN');
  assert(tier.tier === 3 || tier.tier === 4, `Expected tier 3/4, got ${tier.tier}`);
  assert(tier.discount > 70, `Should have >70% discount, got ${tier.discount}`);
});

test('ECF: Egypt is Tier 4', () => {
  const tier = ecf.getTier('EG');
  assert(tier.tier === 4, `Expected tier 4, got ${tier.tier}`);
  assert(tier.name === 'Growth', `Expected Growth, got ${tier.name}`);
});

// ============================================================================
// ECF PRICING INFO TESTS
// ============================================================================

test('ECF: getPricingInfo returns complete data', () => {
  const info = ecf.getPricingInfo('US');
  
  assert(info.countryCode === 'US', 'countryCode');
  assert(info.ecf === 1.0, 'ecf');
  assert(info.basePrice === 40, 'basePrice');
  assert(info.adjustedPrice === 40, 'adjustedPrice');
  assert(info.tier === 1, 'tier');
  assert(info.savings === 0, 'savings');
});

test('ECF: Savings calculated correctly', () => {
  const info = ecf.getPricingInfo('EG');
  
  assert(info.savings > 0, 'Should have savings');
  assert(info.savings === info.basePrice - info.adjustedPrice, 'Savings formula');
});

// ============================================================================
// SUBSCRIPTION PLANS TESTS
// ============================================================================

test('Plans: Monthly plan exists', () => {
  assert(SUBSCRIPTION_PLANS.monthly, 'Monthly plan should exist');
  assert(SUBSCRIPTION_PLANS.monthly.basePrice === ECF_BASE_PRICE_USD, 'Monthly price');
});

test('Plans: Yearly plan exists', () => {
  assert(SUBSCRIPTION_PLANS.yearly, 'Yearly plan should exist');
  assert(SUBSCRIPTION_PLANS.yearly.discount === 17, 'Yearly discount should be 17%');
});

test('Plans: Yearly is cheaper per month', () => {
  const monthlyTotal = SUBSCRIPTION_PLANS.monthly.basePrice * 12;
  const yearlyTotal = SUBSCRIPTION_PLANS.yearly.basePrice;
  
  assert(yearlyTotal < monthlyTotal, `Yearly (${yearlyTotal}) should be < 12x monthly (${monthlyTotal})`);
});

// ============================================================================
// TIMEZONE DETECTION TESTS
// ============================================================================

test('ECF: detectFromTimezone returns string or null', () => {
  const result = ecf.detectFromTimezone();
  assert(result === null || typeof result === 'string', 'Should return string or null');
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
