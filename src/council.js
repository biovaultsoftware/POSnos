// BalanceChain AI Council Module
// 10-Character Council with Cloudflare Worker Integration & Kill Switch

import { COUNCIL_MEMBERS } from './constants.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const AI_WORKER_URL = 'https://human1stai.rr-rshemodel.workers.dev/';

// ============================================================================
// KILL SWITCH - TOPIC FILTERING
// ============================================================================

const BLOCKED_TOPICS = [
  // Politics
  'election', 'vote', 'democrat', 'republican', 'liberal', 'conservative',
  'biden', 'trump', 'congress', 'senate', 'politician',
  // Religion
  'god', 'jesus', 'allah', 'buddha', 'church', 'mosque', 'temple', 'prayer',
  'bible', 'quran', 'religion', 'atheist',
  // Sports (non-business)
  'football', 'basketball', 'soccer', 'baseball', 'nfl', 'nba', 'fifa',
  'world cup', 'olympics', 'score', 'game last night',
  // Entertainment
  'movie', 'netflix', 'tv show', 'celebrity', 'kardashian', 'taylor swift',
  // General chat
  'weather', 'recipe', 'cook', 'joke', 'funny', 'poem', 'song lyrics',
  // Harmful
  'suicide', 'self-harm', 'kill myself', 'end my life'
];

const ALLOWED_EXCEPTIONS = [
  // Business context allowed
  'sports business', 'entertainment business', 'media company',
  'weather app', 'recipe app', 'food business', 'restaurant'
];

/**
 * Check if message should be blocked by Kill Switch
 * @param {string} message 
 * @returns {{blocked: boolean, reason?: string, redirect?: string}}
 */
export function checkKillSwitch(message) {
  const lower = message.toLowerCase();
  
  // Check for allowed exceptions first
  for (const exception of ALLOWED_EXCEPTIONS) {
    if (lower.includes(exception)) {
      return { blocked: false };
    }
  }
  
  // Check for blocked topics
  for (const topic of BLOCKED_TOPICS) {
    if (lower.includes(topic)) {
      return {
        blocked: true,
        reason: `off_topic:${topic}`,
        redirect: getRedirectMessage(topic)
      };
    }
  }
  
  return { blocked: false };
}

/**
 * Get redirect message for blocked topic
 * @param {string} topic 
 * @returns {string}
 */
function getRedirectMessage(topic) {
  const redirects = {
    'election': "I don't trade in political currency. Let's focus on building your business empire.",
    'vote': "Your vote in business is where you spend your time. What business problem can I help with?",
    'god': "I respect all beliefs, but I'm here for money clarity. What's your business challenge?",
    'football': "Unless you're building a sports business, I don't care who won. Back to money.",
    'netflix': "That's a time leak. Tempo would calculate that at $0/hour. What else?",
    'weather': "I don't care about the weather unless you're selling umbrellas. Focus."
  };
  
  for (const [key, message] of Object.entries(redirects)) {
    if (topic.includes(key)) return message;
  }
  
  return "I don't trade in that currency. Back to business. What's your money question?";
}

// ============================================================================
// CHARACTER DEFINITIONS (Prompts & Fallbacks)
// ============================================================================

const CHARACTER_PROMPTS = {
  kareem: {
    ...COUNCIL_MEMBERS.KAREEM,
    systemPrompt: `You are Kareem, the Laziness Mentor. You HATE hard work. Philosophy: "Work less, earn more." Advise automation and delegation.`,
    sampleResponses: [
      "That sounds like too much work. Can we automate that?",
      "Why build it if you can buy it? Or better yet, have someone else buy it.",
      "Hard work is a failure of imagination. Find the lazy path."
    ]
  },
  turbo: {
    ...COUNCIL_MEMBERS.TURBO,
    systemPrompt: `You are Turbo, the Speed Mentor. You are IMPATIENT. Philosophy: "Results by Friday." Advise MVPs and speed.`,
    sampleResponses: [
      "Too slow. Launch it ugly. Launch it now.",
      "Stop planning. Start selling. Fix it later.",
      "Results by Friday? How about results by lunch?"
    ]
  },
  wolf: {
    ...COUNCIL_MEMBERS.WOLF,
    systemPrompt: `You are Wolf, the Greed Mentor. You think in LEVERAGE. Philosophy: "10x or nothing." Advise scaling and ROI.`,
    sampleResponses: [
      "That's cute. Now how do we add a zero to the end of that check?",
      "If it doesn't scale to a million users, I'm not interested.",
      "Leverage. Use other people's money, other people's time."
    ]
  },
  luna: {
    ...COUNCIL_MEMBERS.LUNA,
    systemPrompt: `You are Luna, the Satisfaction Mentor. Philosophy: "Money is a tool for freedom." Advise quality of life.`,
    sampleResponses: [
      "You could make more money, but would you be happier?",
      "What's the point of wealth if you never enjoy it?",
      "Let's build something that feeds your soul AND your wallet."
    ]
  },
  captain: {
    ...COUNCIL_MEMBERS.CAPTAIN,
    systemPrompt: `You are The Captain, the Security Mentor. Philosophy: "Build the fortress." Advise risk management and safety.`,
    sampleResponses: [
      "Before we scale, let's secure what you have.",
      "That's a lot of risk. What's your backup plan?",
      "Never invest money you can't afford to lose."
    ]
  },
  tempo: {
    ...COUNCIL_MEMBERS.TEMPO,
    systemPrompt: `You are Tempo, the Time Auditor. Philosophy: "You are dying. Every minute costs." Advise efficiency.`,
    sampleResponses: [
      "You spent 4 hours to save $10. Your hourly rate is $2.50. Poverty wage.",
      "That habit costs you 8 years of your life. Worth it?",
      "Time is the only non-renewable resource. Stop wasting it."
    ]
  },
  hakim: {
    ...COUNCIL_MEMBERS.HAKIM,
    systemPrompt: `You are Hakim, the Wisdom Mentor. Philosophy: "The old wisdom still applies." Speak in parables and stories.`,
    sampleResponses: [
      "Let me tell you about the man who carried buckets...",
      "The wise farmer doesn't shout at his crops. He waters them and waits.",
      "Money is like water. Grip it too tightly, it drips. Cup your hands, it pools."
    ]
  },
  wheat: {
    ...COUNCIL_MEMBERS.WHEAT,
    systemPrompt: `You are Uncle Wheat. Philosophy: "Sell water, sell bread." Advise boring, essential businesses.`,
    sampleResponses: [
      "Fancy coffee shop? That's a tomato. Sell the beans. That's wheat.",
      "When the economy crashes, people still need bread. Do they need your app?",
      "Boring is profitable."
    ]
  },
  tommy: {
    ...COUNCIL_MEMBERS.TOMMY,
    systemPrompt: `You are Tommy Tomato. Philosophy: "Add value! Brand it!" Advise premium branding and experiences.`,
    sampleResponses: [
      "Forget boring! Let's add VALUE. Premium packaging!",
      "Uncle Wheat is stuck in the past. The future is BRANDS.",
      "Yes, it's risky, but imagine the Instagram potential!"
    ]
  },
  architect: {
    ...COUNCIL_MEMBERS.ARCHITECT,
    systemPrompt: `You are The Architect. Philosophy: "Work ON the system." Synthesize advice from others.`,
    sampleResponses: [
      "Stop working IN the business. Work ON the system.",
      "Structure precedes scale. Fix the foundation first.",
      "I've heard the council. Here is the integrated strategy."
    ]
  }
};

// ============================================================================
// COUNCIL CLASS
// ============================================================================

export class AICouncil {
  constructor() {
    this.characters = CHARACTER_PROMPTS;
    this.activeCharacter = 'hakim'; 
    this.conversationHistory = [];
  }
  
  getCharacter(characterId) {
    return this.characters[characterId] || null;
  }
  
  getAllCharacters() {
    return Object.values(this.characters).map(c => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      motivator: c.motivator
    }));
  }
  
  setActiveCharacter(characterId) {
    if (this.characters[characterId]) {
      this.activeCharacter = characterId;
      return true;
    }
    return false;
  }
  
  getSystemPrompt(characterId) {
    const char = this.characters[characterId];
    if (!char) return '';
    return `${KILL_SWITCH_PROMPT}\n\n${char.systemPrompt}`;
  }
  
  /**
   * Process user message through council (Async with Online Fetch)
   * @param {string} message 
   * @param {string} [characterId] - Override active character
   * @returns {Promise<{response: string, character: string, blocked?: boolean}>}
   */
  async processMessage(message, characterId = null) {
    const charId = characterId || this.activeCharacter;
    
    // 1. Kill Switch (Local Filter)
    const killCheck = checkKillSwitch(message);
    if (killCheck.blocked) {
      return {
        response: killCheck.redirect,
        character: charId,
        blocked: true,
        reason: killCheck.reason
      };
    }
    
    const char = this.characters[charId];
    if (!char) {
      return { response: "Mentor not found.", character: 'system', blocked: false };
    }

    // 2. Attempt Online Fetch
    try {
      const response = await fetch(AI_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character: charId,
          characterName: char.name,
          systemPrompt: this.getSystemPrompt(charId),
          message: message,
          timestamp: Date.now()
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Support various response formats
        const reply = data.response || data.text || data.reply || data.content;
        
        if (reply) {
          return {
            response: reply,
            character: charId,
            blocked: false
          };
        }
      } else {
        console.warn(`[Council] API Error: ${response.status} ${response.statusText}`);
      }
    } catch (e) {
      console.warn('[Council] Network error, using offline fallback:', e);
    }
    
    // 3. Offline Fallback
    const sampleIndex = Math.floor(Math.random() * char.sampleResponses.length);
    return {
      response: char.sampleResponses[sampleIndex],
      character: charId,
      blocked: false
    };
  }
  
  /**
   * Detect recommended character based on user message
   * @param {string} message 
   * @returns {string} Character ID
   */
  detectRecommendedCharacter(message) {
    const lower = message.toLowerCase();
    const mappings = [
      { keywords: ['lazy', 'easy', 'passive', 'automate'], character: 'kareem' },
      { keywords: ['fast', 'quick', 'urgent', 'asap', 'now'], character: 'turbo' },
      { keywords: ['scale', 'grow', '10x', 'roi', 'leverage'], character: 'wolf' },
      { keywords: ['happy', 'fulfilling', 'enjoy', 'balance'], character: 'luna' },
      { keywords: ['risk', 'safe', 'protect', 'insurance'], character: 'captain' },
      { keywords: ['time', 'hours', 'schedule', 'busy'], character: 'tempo' },
      { keywords: ['story', 'wisdom', 'advice', 'parable'], character: 'hakim' },
      { keywords: ['need', 'essential', 'utility', 'boring'], character: 'wheat' },
      { keywords: ['brand', 'premium', 'luxury', 'unique'], character: 'tommy' },
      { keywords: ['system', 'business', 'strategy', 'plan'], character: 'architect' }
    ];
    
    for (const mapping of mappings) {
      for (const keyword of mapping.keywords) {
        if (lower.includes(keyword)) return mapping.character;
      }
    }
    
    return 'hakim';
  }
}

// ============================================================================
// KILL SWITCH SYSTEM PROMPT
// ============================================================================

const KILL_SWITCH_PROMPT = `CRITICAL RULES (KILL SWITCH):

1. IF the user asks about Politics, Religion, Sports scores, Recipes, Weather, or General Entertainment:
   - REJECT the query immediately
   - PIVOT back to money/time/business
   - Example: "I don't trade in that currency. Back to business. What's your money question?"

2. IF the user asks for generic motivation:
   - DO NOT give "You can do it!" advice
   - GIVE mathematical truth or efficiency hacks

3. NEVER act like a generic AI assistant. You are a Council Member with a specific philosophy.

4. ALWAYS stay in character. Your personality should be distinct and memorable.`;

// ============================================================================
// EXPORTS
// ============================================================================

export { CHARACTER_PROMPTS, KILL_SWITCH_PROMPT, BLOCKED_TOPICS };

// Singleton instance
export const council = new AICouncil();
