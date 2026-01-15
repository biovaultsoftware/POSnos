// BalanceChain ECF (Efficiency Country Factor) Module
// Geo-pricing for global fairness

import { ECF_BASE_PRICE_USD, ECF_TIERS, SUBSCRIPTION_PLANS } from './constants.js';

// ============================================================================
// COUNTRY ECF DATA
// ============================================================================

// ECF values based on purchasing power parity
const COUNTRY_ECF = {
  // Tier 1: Full price (ECF ~1.0)
  'US': 1.0, 'GB': 1.0, 'DE': 1.0, 'FR': 1.0, 'AU': 1.0, 'CA': 1.0,
  'JP': 0.95, 'CH': 1.1, 'NO': 1.1, 'DK': 1.05, 'SE': 1.0, 'NL': 1.0,
  'BE': 1.0, 'AT': 1.0, 'IE': 1.0, 'NZ': 0.95, 'SG': 0.9, 'HK': 0.85, 'KR': 0.8,
  
  // Tier 2: Medium discount (ECF ~0.5)
  'ES': 0.6, 'IT': 0.65, 'PT': 0.55, 'GR': 0.5, 'CZ': 0.45, 'PL': 0.45,
  'HU': 0.4, 'BR': 0.35, 'MX': 0.4, 'AR': 0.3, 'CL': 0.45, 'CO': 0.35,
  'TH': 0.35, 'MY': 0.4, 'TW': 0.55, 'RU': 0.35, 'TR': 0.35, 'ZA': 0.35,
  'SA': 0.6, 'AE': 0.7, 'QA': 0.7,
  
  // Tier 3: High discount (ECF ~0.25)
  'IN': 0.15, 'PH': 0.2, 'VN': 0.18, 'ID': 0.2, 'BD': 0.12, 'LK': 0.2,
  'NP': 0.12, 'MM': 0.15, 'KH': 0.18,
  
  // Tier 4: Maximum discount (ECF ~0.125)
  'EG': 0.12, 'PK': 0.1, 'NG': 0.1, 'KE': 0.12, 'ET': 0.08, 'GH': 0.12,
  'TZ': 0.1, 'UG': 0.1, 'MA': 0.2, 'DZ': 0.18, 'UA': 0.2
};

// ============================================================================
// ECF CALCULATOR
// ============================================================================

export class ECFCalculator {
  constructor() {
    this.countryData = COUNTRY_ECF;
    this.basePrice = ECF_BASE_PRICE_USD;
    this.detectedCountry = null;
  }
  
  getECF(countryCode) {
    return this.countryData[countryCode?.toUpperCase()] || 1.0;
  }
  
  calculatePrice(countryCode, basePrice = this.basePrice) {
    const ecf = this.getECF(countryCode);
    return Math.max(0.99, Math.round(basePrice * ecf * 100) / 100);
  }
  
  getTier(countryCode) {
    const ecf = this.getECF(countryCode);
    if (ecf >= 0.8) return { tier: 1, name: 'Standard', discount: 0 };
    if (ecf >= 0.4) return { tier: 2, name: 'Regional', discount: Math.round((1-ecf)*100) };
    if (ecf >= 0.2) return { tier: 3, name: 'Emerging', discount: Math.round((1-ecf)*100) };
    return { tier: 4, name: 'Growth', discount: Math.round((1-ecf)*100) };
  }
  
  getPricingInfo(countryCode) {
    const ecf = this.getECF(countryCode);
    const price = this.calculatePrice(countryCode);
    const tier = this.getTier(countryCode);
    return {
      countryCode: countryCode?.toUpperCase(),
      ecf, basePrice: this.basePrice, adjustedPrice: price,
      tier: tier.tier, tierName: tier.name, discount: tier.discount,
      savings: this.basePrice - price
    };
  }
  
  async detectCountry() {
    if (this.detectedCountry) return this.detectedCountry;
    const tz = this.detectFromTimezone();
    if (tz) { this.detectedCountry = tz; return tz; }
    return 'US';
  }
  
  detectFromTimezone() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const tzMap = {
        'America/New_York': 'US', 'America/Chicago': 'US', 'America/Los_Angeles': 'US',
        'Europe/London': 'GB', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE',
        'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN',
        'Asia/Singapore': 'SG', 'Asia/Dubai': 'AE', 'Asia/Kolkata': 'IN',
        'Australia/Sydney': 'AU', 'America/Sao_Paulo': 'BR', 'Africa/Cairo': 'EG',
        'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA'
      };
      return tzMap[tz] || null;
    } catch { return null; }
  }
  
  getCryptoPrice() { return this.basePrice; }
}

/**
 * Get plan with adjusted pricing for country
 * @param {string} planId 
 * @param {string} countryCode 
 * @returns {Object|null}
 */
export function getPlanPricing(planId, countryCode) {
  const plan = SUBSCRIPTION_PLANS[planId];
  if (!plan) return null;
  
  const ecfCalc = new ECFCalculator();
  const ecfVal = ecfCalc.getECF(countryCode);
  
  return {
    ...plan,
    adjustedPrice: Math.round(plan.basePrice * ecfVal * 100) / 100,
    ecf: ecfVal,
    countryCode
  };
}

// Re-export for convenience
export { SUBSCRIPTION_PLANS };

export const ecf = new ECFCalculator();
