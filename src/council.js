// BalanceChain AI Council Module
// Client-side connector for Money AI v8.4 Decision Engine

import { COUNCIL_MEMBERS } from './constants.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// The v8.4 Worker URL
const AI_WORKER_URL = 'https://human1stai.rr-rshemodel.workers.dev/';

// ============================================================================
// KILL SWITCH - TOPIC FILTERING (Local First Layer)
// ============================================================================

const BLOCKED_TOPICS = [
  'election', 'vote', 'democrat', 'republican', 'biden', 'trump', 'politics',
  'god', 'jesus', 'allah', 'religion', 'atheist',
  'football', 'soccer', 'nba', 'sports', 'game score',
  'netflix', 'movie', 'celebrity', 'taylor swift',
  'weather', 'recipe', 'joke', 'poem'
];

/**
 * Check if message should be blocked locally before hitting the API
 * @param {string} message 
 */
export function checkKillSwitch(message) {
  const lower = message.toLowerCase();
  
  // Allow business context exceptions
  if (lower.includes('business') || lower.includes('market') || lower.includes('app')) {
    return { blocked: false };
  }
  
  for (const topic of BLOCKED_TOPICS) {
    if (lower.includes(topic)) {
      return {
        blocked: true,
        reason: `off_topic:${topic}`,
        redirect: "I don't trade in that currency. Back to business. What's your money question?"
      };
    }
  }
  
  return { blocked: false };
}

// ============================================================================
// CHARACTER DEFINITIONS (For Local UI & Fallback Only)
// ============================================================================
// Note: The Worker v8.4 holds the REAL system prompts. 
// These are just for the UI (Emojis/Names) and offline fallback.

const CHARACTER_UI = {
  kareem: { ...COUNCIL_MEMBERS.KAREEM, sampleResponses: ["Effort is a tax. Automate it.", "Why build if you can buy?", "Simplify."] },
  turbo: { ...COUNCIL_MEMBERS.TURBO, sampleResponses: ["Results by Friday.", "Ship it ugly.", "Speed is the strategy."] },
  wolf: { ...COUNCIL_MEMBERS.WOLF, sampleResponses: ["10x or nothing.", "Show me the unit economics.", "Where is the leverage?"] },
  luna: { ...COUNCIL_MEMBERS.LUNA, sampleResponses: ["People pay for feeling.", "Quality is a decision.", "Make it beautiful."] },
  captain: { ...COUNCIL_MEMBERS.CAPTAIN, sampleResponses: ["Secure the downside.", "Cash flow is king.", "Risk management first."] },
  tempo: { ...COUNCIL_MEMBERS.TEMPO, sampleResponses: ["Time is currency.", "Audit your hours.", "That cost you 4 hours."] },
  hakim: { ...COUNCIL_MEMBERS.HAKIM, sampleResponses: ["Let me tell you about the farmer...", "Water the roots.", "Patience pays."] },
  wheat: { ...COUNCIL_MEMBERS.WHEAT, sampleResponses: ["Needs survive recessions.", "Sell water to hikers.", "Boring is profitable."] },
  tommy: { ...COUNCIL_MEMBERS.TOMMY, sampleResponses: ["Hype sells.", "Packaging matters.", "Make them look."] },
  architect: { ...COUNCIL_MEMBERS.ARCHITECT, sampleResponses: ["Build the system.", "Structure precedes scale.", "Don't work in the business, work on it."] }
};

// ============================================================================
// COUNCIL CLASS
// ============================================================================

export class AICouncil {
  constructor() {
    this.characters = CHARACTER_UI;
    this.activeCharacter = 'hakim'; 
    this.conversationHistory = []; // Local history tracking
  }
  
  getCharacter(characterId) {
    return this.characters[characterId] || this.characters['architect'];
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
  
  /**
   * Process user message through Cloudflare Worker v8.4
   * @param {string} message 
   * @param {string} [characterId]
   */
  async processMessage(message, characterId = null) {
    const charId = characterId || this.activeCharacter;
    const char = this.getCharacter(charId);

    // 1. Local Kill Switch (Fast Fail)
    const killCheck = checkKillSwitch(message);
    if (killCheck.blocked) {
      return {
        response: killCheck.redirect,
        character: charId,
        blocked: true
      };
    }

    // 2. Connect to v8.4 Decision Engine
    try {
      if (navigator.onLine) {
        
        // v8.4 API Structure
        const payload = {
          text: message,
          chatId: charId, // The Worker maps this (e.g. 'wolf' -> 'WOLF')
          history: this.conversationHistory.slice(-10), // Send last 10 turns
          turn_index: this.conversationHistory.length + 1
        };

        const response = await fetch(AI_WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const data = await response.json();
          
          // v8.4 returns a complex object:
          // { mode: "reply", bubbles: [...], final: { decision, next_action }, state: {...} }
          
          // We extract the main text bubble
          let replyText = "";
          if (data.bubbles && data.bubbles.length > 0) {
            replyText = data.bubbles.map(b => b.text).join('\n\n');
          } else if (data.text) {
            replyText = data.text; // Fallback
          } else {
            replyText = "The Council remains silent.";
          }

          // Update local history
          this.conversationHistory.push({ role: 'user', content: message });
          this.conversationHistory.push({ role: 'assistant', content: replyText });

          return {
            response: replyText,
            character: charId,
            blocked: false,
            // v8.4 Metadata (You can use this in the UI later)
            meta: {
              decision: data.final?.decision,
              action: data.final?.next_action,
              state: data.state // Rush/Rich/Wheat/Tomato
            }
          };
        } else {
          console.warn(`[Council] API Error: ${response.status}`);
        }
      }
    } catch (e) {
      console.warn('[Council] Network error, using offline fallback:', e);
    }
    
    // 3. Offline Fallback (If API fails)
    const fallback = char.sampleResponses[Math.floor(Math.random() * char.sampleResponses.length)];
    return {
      response: `${fallback}\n\n(Offline Mode: Connect to internet for full Council advice)`,
      character: charId,
      blocked: false
    };
  }
}

// Exports
export { CHARACTER_UI as CHARACTER_PROMPTS };
export const council = new AICouncil();
