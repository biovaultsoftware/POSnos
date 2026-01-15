# Sovereign Business OS v2.0

**BalanceChain Protocol Implementation** - A production-ready offline-first blockchain for business operations.

## 🎯 Features Implemented

### Core Protocol (All 8 Validation Rules)
- ✅ Segment structure with unlocker/unlocked references
- ✅ Counter relationship validation
- ✅ Daily/Monthly/Yearly caps (3600/36000/120000)
- ✅ Rate limiting (1 block/second)
- ✅ Biometric liveness proof support
- ✅ Owner transition validation
- ✅ History hash chain integrity
- ✅ Sequence validation
- ✅ Signature verification (ECDSA P-256)
- ✅ Nonce replay protection

### TVM Token System
- ✅ Capsule creation and validation
- ✅ Rich Score / Business Score calculation (min 70 required)
- ✅ ECF threshold validation
- ✅ Capsule similarity matching (90% threshold for recycling)
- ✅ TVM balance management
- ✅ Motivator detection (laziness, speed, greed, satisfaction, security)
- ✅ Category detection (wheat vs tomato)

### AI Council (All 10 Characters)
| Character | Emoji | Motivator | Philosophy |
|-----------|-------|-----------|------------|
| Kareem | 🛌 | Laziness | "Work less, earn more" |
| Turbo | 🚀 | Speed | "Results by Friday" |
| Wolf | 🐺 | Greed | "Scale it. 10x or nothing" |
| Luna | ✨ | Satisfaction | "Money is a tool for freedom" |
| The Captain | 🛡️ | Security | "Build the fortress" |
| Tempo | ⏱️ | Time | "You are dying. Every minute costs" |
| Hakim | 📜 | Wisdom | "Let me tell you a story..." |
| Uncle Wheat | 🌾 | Necessity | "Sell water, sell bread" |
| Tommy Tomato | 🍅 | Added Value | "Add value! Create experiences!" |
| The Architect | 🏗️ | System | "Work ON the system" |

### Kill Switch (Topic Filtering)
- ✅ Blocks: Politics, Religion, Sports, Weather, Recipes, Entertainment
- ✅ Allows: Business context exceptions
- ✅ Redirects with character-appropriate responses

### ECF Geo-Pricing
- ✅ Tier 1 (Full price): US, UK, DE, FR, AU ($40/mo)
- ✅ Tier 2 (50% off): BR, MX, TH, MY
- ✅ Tier 3 (75% off): IN, PH, VN, ID
- ✅ Tier 4 (87.5% off): EG, PK, NG, KE (~$5/mo)
- ✅ Crypto always pays full price

### Chain Integrity
- ✅ Full chain verification
- ✅ Backup sync requirements ("NO RESTORE WITHOUT SYNC")
- ✅ Cloned device detection
- ✅ Corruption detection with read-only mode
- ✅ Exportable integrity reports

### P2P Networking
- ✅ WebRTC DataChannel transport
- ✅ ECDH key exchange for E2EE
- ✅ AES-GCM encryption
- ✅ WebSocket signaling with heartbeat
- ✅ Auto-reconnection with exponential backoff
- ✅ Message queuing when offline

### Offline Search (Knowledge Base)
- ✅ Full-text indexing
- ✅ Entity extraction (phone, email, URL, money)
- ✅ TF-IDF scoring with recency boost
- ✅ Search suggestions

## 📁 Project Structure

```
sovereign-os/
├── src/
│   ├── index.js         # Main entry point
│   ├── constants.js     # Protocol constants & caps
│   ├── crypto.js        # Cryptographic utilities
│   ├── idb.js           # IndexedDB helpers
│   ├── segment.js       # Segment structure & payloads
│   ├── validation.js    # 8+ validation rules
│   ├── state.js         # Chain state management
│   ├── caps.js          # Cap tracking & enforcement
│   ├── identity.js      # WebAuthn & key management
│   ├── tvm.js           # TVM tokens & capsules
│   ├── council.js       # 10 AI characters & kill switch
│   ├── ecf.js           # Geo-pricing calculator
│   ├── p2p.js           # WebRTC P2P connections
│   ├── signal.js        # WebSocket signaling
│   ├── kb.js            # Knowledge base search
│   ├── integrity.js     # Chain verification
│   ├── payments.js      # Stripe + Coinbase integration
│   ├── shadow.js        # Shadow training pipeline
│   └── sw.js            # Service worker
├── test/
│   ├── run-all.js       # Master test runner
│   ├── batch1.test.js   # Constants & crypto (22 tests)
│   ├── batch2.test.js   # Segment & chain (20 tests)
│   ├── batch3.test.js   # Caps & identity (14 tests)
│   ├── batch4.test.js   # TVM & council (41 tests)
│   ├── batch5.test.js   # Networking & ECF (30 tests)
│   ├── batch6.test.js   # Integrity & integration (18 tests)
│   ├── batch7.test.js   # Payments & shadow (23 tests)
│   └── batch8.test.js   # E2E & performance (20 tests)
└── package.json
```

## 🚀 Quick Start

```javascript
import { initializeApp, STA_TYPES } from 'sovereign-business-os';

// Initialize the application
const app = await initializeApp({
  verifyIntegrity: true,
  requireBiometric: false
});

console.log(`Identity: ${app.hid}`);
console.log(`TVM Balance: ${await app.getTVMBalance()}`);
console.log(`Theme: ${app.getTheme()}`); // coal/ember/bronze/gold

// Commit a user message
const result = await app.commitAction(STA_TYPES.CHAT_USER, {
  chatId: 'kareem',
  text: 'How can I build passive income?',
  role: 'user'
});

if (result.ok) {
  console.log(`Committed at seq ${result.seq}`);
}
```

## 🧪 Running Tests

```bash
# Run all 145 tests
npm test

# Run individual batches
npm run test:batch1  # Constants & Crypto
npm run test:batch2  # Segment & Chain
npm run test:batch3  # Caps & Identity
npm run test:batch4  # TVM & Council
npm run test:batch5  # Networking & ECF
npm run test:batch6  # Integrity & Integration
```

## 📋 Protocol Constants

| Constant | Value | Description |
|----------|-------|-------------|
| INITIAL_BALANCE | 1,200 | Starting unlocked segments |
| DAILY_CAP | 3,600 | Max segments per day |
| MONTHLY_CAP | 36,000 | Max segments per month |
| YEARLY_CAP | 120,000 | Max segments per year |
| MIN_RICH_SCORE | 70 | Required for TVM minting |
| MIN_BUSINESS_SCORE | 70 | Required for TVM minting |
| TVM_PER_CAPSULE | 1.0 | TVM minted per capsule |
| CAPSULE_SIMILARITY | 90% | Threshold for recycling |

## 🔐 Security Features

1. **Offline-First**: All data stored locally in IndexedDB
2. **Chain Integrity**: SHA-256 hash chain with signature verification
3. **E2EE P2P**: ECDH key exchange + AES-GCM encryption
4. **Replay Protection**: Nonce tracking with 30-day cleanup
5. **WebAuthn Ready**: Biometric liveness proof support
6. **Anti-Clone**: Duplicate device detection
7. **Read-Only Mode**: Auto-enabled on corruption detection

## 📊 Test Results

```
✅ BATCH1: 22 passed (Constants & Crypto)
✅ BATCH2: 20 passed (Segment & Chain)
✅ BATCH3: 14 passed (Caps & Identity)
✅ BATCH4: 41 passed (TVM & Council)
✅ BATCH5: 30 passed (Networking & ECF)
✅ BATCH6: 18 passed (Integrity & Integration)
✅ BATCH7: 23 passed (Payments & Shadow Training)
✅ BATCH8: 20 passed (E2E & Performance)
────────────────────────────────────
TOTAL: 188 passed, 0 failed
```

## 🔄 Upgrade Path

**Current Implementation:**
- ECDSA P-256 for signatures
- ECDH P-256 for key exchange
- SHA-256 for hashing

**Future Quantum-Safe Upgrade:**
- Dilithium/Falcon for signatures
- Kyber for key encapsulation
- SHA-3/Keccak for hashing

The `crypto.js` module includes `isQuantumSafeAvailable()` and `getRecommendedAlgorithms()` for future migration.

## 📜 License

MIT License - See LICENSE file for details.

---

Built with ❤️ for the sovereign economy.
