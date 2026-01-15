// Test: Batch 4 - TVM Capsules & AI Council
// Run with: node --experimental-vm-modules test/batch4.test.js

import {
  calculateRichScore,
  calculateBusinessScore,
  detectMotivator,
  detectCategory
} from '../src/tvm.js';

import {
  checkKillSwitch,
  AICouncil,
  CHARACTER_PROMPTS,
  council
} from '../src/council.js';

import {
  MIN_RICH_SCORE,
  MIN_BUSINESS_SCORE,
  TVM_PER_CAPSULE,
  COUNCIL_MEMBERS
} from '../src/constants.js';

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
  console.log('BATCH 4 TESTS: TVM Capsules & AI Council');
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
// TVM SCORING TESTS
// ============================================================================

test('TVM: calculateRichScore base score is 50', () => {
  const score = calculateRichScore({});
  assert(score === 50, `Expected 50, got ${score}`);
});

test('TVM: calculateRichScore increases for rich end state', () => {
  const score = calculateRichScore({ endState: 'rich' });
  assert(score === 80, `Expected 80, got ${score}`);
});

test('TVM: calculateRichScore increases for transition state', () => {
  const score = calculateRichScore({ endState: 'transition' });
  assert(score === 65, `Expected 65, got ${score}`);
});

test('TVM: calculateRichScore caps at 100', () => {
  const score = calculateRichScore({
    endState: 'rich',
    actionPlan: { steps: [1, 2, 3, 4, 5] },
    timeAnalysis: { efficiency: 0.8 }
  });
  assert(score <= 100, `Score should not exceed 100, got ${score}`);
});

test('TVM: calculateBusinessScore base score is 50', () => {
  const score = calculateBusinessScore({});
  assert(score === 50, `Expected 50, got ${score}`);
});

test('TVM: calculateBusinessScore higher for wheat', () => {
  const wheat = calculateBusinessScore({ category: 'wheat' });
  const tomato = calculateBusinessScore({ category: 'tomato' });
  assert(wheat > tomato, `Wheat (${wheat}) should be > Tomato (${tomato})`);
});

test('TVM: MIN_RICH_SCORE is 70', () => {
  assert(MIN_RICH_SCORE === 70, `Expected 70, got ${MIN_RICH_SCORE}`);
});

test('TVM: MIN_BUSINESS_SCORE is 70', () => {
  assert(MIN_BUSINESS_SCORE === 70, `Expected 70, got ${MIN_BUSINESS_SCORE}`);
});

test('TVM: TVM_PER_CAPSULE is 1.0', () => {
  assert(TVM_PER_CAPSULE === 1.0, `Expected 1.0, got ${TVM_PER_CAPSULE}`);
});

// ============================================================================
// MOTIVATOR DETECTION TESTS
// ============================================================================

test('TVM: detectMotivator finds laziness', () => {
  const messages = [
    { text: 'I want something easy and passive' },
    { text: 'Can we automate this?' }
  ];
  const motivator = detectMotivator(messages);
  assert(motivator === 'laziness', `Expected laziness, got ${motivator}`);
});

test('TVM: detectMotivator finds speed', () => {
  const messages = [
    { text: 'I need results fast' },
    { text: 'This is urgent, I need it now' }
  ];
  const motivator = detectMotivator(messages);
  assert(motivator === 'speed', `Expected speed, got ${motivator}`);
});

test('TVM: detectMotivator finds greed', () => {
  const messages = [
    { text: 'How do I 10x my income?' },
    { text: 'I want to scale and leverage my time' }
  ];
  const motivator = detectMotivator(messages);
  assert(motivator === 'greed', `Expected greed, got ${motivator}`);
});

test('TVM: detectMotivator finds security', () => {
  const messages = [
    { text: 'I want to be safe and secure' },
    { text: 'What about risk protection?' }
  ];
  const motivator = detectMotivator(messages);
  assert(motivator === 'security', `Expected security, got ${motivator}`);
});

// ============================================================================
// CATEGORY DETECTION TESTS
// ============================================================================

test('TVM: detectCategory finds wheat', () => {
  const messages = [
    { text: 'I want to sell something essential' },
    { text: 'People need this to survive' }
  ];
  const category = detectCategory(messages);
  assert(category === 'wheat', `Expected wheat, got ${category}`);
});

test('TVM: detectCategory finds tomato', () => {
  const messages = [
    { text: 'I want to build a luxury brand' },
    { text: 'Premium artisan products' }
  ];
  const category = detectCategory(messages);
  assert(category === 'tomato', `Expected tomato, got ${category}`);
});

// ============================================================================
// KILL SWITCH TESTS
// ============================================================================

test('Council: Kill switch blocks politics', () => {
  const result = checkKillSwitch('Who should I vote for in the election?');
  assert(result.blocked === true, 'Politics should be blocked');
  assert(result.reason.includes('vote') || result.reason.includes('election'), 
    `Reason should mention topic: ${result.reason}`);
});

test('Council: Kill switch blocks religion', () => {
  const result = checkKillSwitch('What does the bible say about money?');
  assert(result.blocked === true, 'Religion should be blocked');
});

test('Council: Kill switch blocks weather', () => {
  const result = checkKillSwitch('What is the weather like today?');
  assert(result.blocked === true, 'Weather should be blocked');
});

test('Council: Kill switch blocks recipes', () => {
  const result = checkKillSwitch('Can you give me a recipe for pasta?');
  assert(result.blocked === true, 'Recipes should be blocked');
});

test('Council: Kill switch blocks sports', () => {
  const result = checkKillSwitch('Who won the football game last night?');
  assert(result.blocked === true, 'Sports should be blocked');
});

test('Council: Kill switch allows business topics', () => {
  const result = checkKillSwitch('How do I start a business?');
  assert(result.blocked === false, 'Business should be allowed');
});

test('Council: Kill switch allows money topics', () => {
  const result = checkKillSwitch('How can I make more money?');
  assert(result.blocked === false, 'Money should be allowed');
});

test('Council: Kill switch allows business context exceptions', () => {
  const result = checkKillSwitch('I want to start a restaurant food business');
  assert(result.blocked === false, 'Food business should be allowed');
});

test('Council: Kill switch provides redirect message', () => {
  const result = checkKillSwitch('Tell me a joke');
  assert(result.blocked === true, 'Jokes should be blocked');
  assert(typeof result.redirect === 'string', 'Should have redirect message');
  assert(result.redirect.length > 10, 'Redirect should be meaningful');
});

// ============================================================================
// COUNCIL CHARACTER TESTS
// ============================================================================

test('Council: All 10 characters defined', () => {
  const count = Object.keys(CHARACTER_PROMPTS).length;
  assert(count === 10, `Expected 10 characters, got ${count}`);
});

test('Council: Kareem has correct properties', () => {
  const kareem = CHARACTER_PROMPTS.kareem;
  assert(kareem.id === 'kareem', 'ID should be kareem');
  assert(kareem.motivator === 'laziness', 'Motivator should be laziness');
  assert(kareem.systemPrompt.toLowerCase().includes('lazy') || 
         kareem.systemPrompt.toLowerCase().includes('laziness'), 
    'System prompt should mention laziness');
});

test('Council: Uncle Wheat has correct properties', () => {
  const wheat = CHARACTER_PROMPTS.wheat;
  assert(wheat.id === 'wheat', 'ID should be wheat');
  assert(wheat.name === 'Uncle Wheat', 'Name should be Uncle Wheat');
  assert(wheat.systemPrompt.includes('boring') || wheat.systemPrompt.includes('essential'), 
    'System prompt should mention boring/essential');
});

test('Council: Tommy Tomato has correct properties', () => {
  const tommy = CHARACTER_PROMPTS.tommy;
  assert(tommy.id === 'tommy', 'ID should be tommy');
  assert(tommy.systemPrompt.includes('brand') || tommy.systemPrompt.includes('Brand'), 
    'System prompt should mention branding');
});

test('Council: Architect has correct properties', () => {
  const architect = CHARACTER_PROMPTS.architect;
  assert(architect.id === 'architect', 'ID should be architect');
  assert(architect.systemPrompt.includes('system') || architect.systemPrompt.includes('System'), 
    'System prompt should mention systems');
});

// ============================================================================
// AI COUNCIL CLASS TESTS
// ============================================================================

test('Council: getAllCharacters returns 10 characters', () => {
  const chars = council.getAllCharacters();
  assert(chars.length === 10, `Expected 10, got ${chars.length}`);
});

test('Council: setActiveCharacter works', () => {
  const result = council.setActiveCharacter('wolf');
  assert(result === true, 'Should return true for valid character');
  assert(council.activeCharacter === 'wolf', 'Active should be wolf');
});

test('Council: setActiveCharacter rejects invalid', () => {
  const result = council.setActiveCharacter('invalid_character');
  assert(result === false, 'Should return false for invalid character');
});

test('Council: getCharacter returns correct data', () => {
  const kareem = council.getCharacter('kareem');
  assert(kareem !== null, 'Should return character');
  assert(kareem.id === 'kareem', 'ID should match');
  assert(kareem.emoji === '🛌', 'Emoji should match');
});

test('Council: getSystemPrompt includes kill switch', () => {
  const prompt = council.getSystemPrompt('kareem');
  assert(prompt.includes('KILL SWITCH'), 'Should include kill switch');
  assert(prompt.includes('Kareem'), 'Should include character name');
});

test('Council: detectRecommendedCharacter finds Kareem for lazy', () => {
  const char = council.detectRecommendedCharacter('I want something easy and lazy');
  assert(char === 'kareem', `Expected kareem, got ${char}`);
});

test('Council: detectRecommendedCharacter finds Wolf for scale', () => {
  const char = council.detectRecommendedCharacter('How do I scale my business 10x?');
  assert(char === 'wolf', `Expected wolf, got ${char}`);
});

test('Council: detectRecommendedCharacter finds Tempo for time', () => {
  const char = council.detectRecommendedCharacter('I am so busy and have no time');
  assert(char === 'tempo', `Expected tempo, got ${char}`);
});

test('Council: processMessage blocks off-topic', () => {
  const result = council.processMessage('What is the weather?');
  assert(result.blocked === true, 'Weather should be blocked');
  assert(typeof result.response === 'string', 'Should have response');
});

test('Council: processMessage allows business topics', () => {
  const result = council.processMessage('How do I start a business?');
  assert(result.blocked === false, 'Business should not be blocked');
  assert(typeof result.response === 'string', 'Should have response');
});

// ============================================================================
// COUNCIL DEBATE TESTS
// ============================================================================

test('Council: getCouncilDebate returns debate array', () => {
  const debate = council.getCouncilDebate('Should I open a coffee shop?');
  assert(Array.isArray(debate), 'Should return array');
  assert(debate.length > 0, 'Should have responses');
});

test('Council: debate includes multiple characters', () => {
  const debate = council.getCouncilDebate('Coffee shop idea', ['wheat', 'tommy']);
  assert(debate.length === 2, `Expected 2 participants, got ${debate.length}`);
  assert(debate.some(d => d.character === 'wheat'), 'Should include wheat');
  assert(debate.some(d => d.character === 'tommy'), 'Should include tommy');
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
