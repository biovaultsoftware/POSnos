// BalanceChain Payment Rails Module
// Stripe (fiat) + Coinbase Commerce (crypto) integration

import { ECF_BASE_PRICE_USD, SUBSCRIPTION_PLANS } from './constants.js';
import { ECFCalculator } from './ecf.js';
import { getMeta, setMeta } from './idb.js';

// ============================================================================
// PAYMENT PROVIDERS
// ============================================================================

export const PAYMENT_PROVIDERS = {
  STRIPE: 'stripe',
  COINBASE: 'coinbase',
  APPLE: 'apple',      // Future: Apple Pay
  GOOGLE: 'google'     // Future: Google Pay
};

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled'
};

// ============================================================================
// STRIPE INTEGRATION
// ============================================================================

/**
 * Stripe payment handler for fiat payments
 * ECF-adjusted pricing applied
 */
export class StripePaymentHandler {
  constructor(options = {}) {
    this.publishableKey = options.publishableKey || null;
    this.apiEndpoint = options.apiEndpoint || '/api/stripe';
    this.ecfCalculator = new ECFCalculator();
    this.initialized = false;
  }
  
  /**
   * Initialize Stripe.js
   * @returns {Promise<boolean>}
   */
  async init() {
    if (this.initialized) return true;
    
    // In browser, load Stripe.js
    if (typeof window !== 'undefined' && this.publishableKey) {
      try {
        // Check if Stripe is already loaded
        if (!window.Stripe) {
          await this.loadStripeJS();
        }
        this.stripe = window.Stripe(this.publishableKey);
        this.initialized = true;
        console.log('[Stripe] Initialized');
        return true;
      } catch (e) {
        console.error('[Stripe] Init failed:', e);
        return false;
      }
    }
    
    // Server-side or testing - mark as initialized
    this.initialized = true;
    return true;
  }
  
  /**
   * Load Stripe.js dynamically
   * @returns {Promise<void>}
   */
  loadStripeJS() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load Stripe.js'));
      document.head.appendChild(script);
    });
  }
  
  /**
   * Create checkout session for subscription
   * @param {Object} options
   * @param {string} options.planId - 'monthly' or 'yearly'
   * @param {string} options.countryCode - ISO country code for ECF pricing
   * @param {string} options.hid - Human ID
   * @param {string} [options.email] - Customer email
   * @returns {Promise<{sessionId: string, url: string}>}
   */
  async createCheckoutSession(options) {
    const { planId, countryCode, hid, email } = options;
    
    // Calculate ECF-adjusted price
    const ecf = this.ecfCalculator.getECF(countryCode);
    const plan = SUBSCRIPTION_PLANS[planId];
    
    if (!plan) {
      throw new Error(`Invalid plan: ${planId}`);
    }
    
    const adjustedPrice = Math.round(plan.basePrice * ecf * 100); // In cents
    
    // Create checkout session via backend
    const response = await fetch(`${this.apiEndpoint}/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId,
        priceInCents: adjustedPrice,
        countryCode,
        ecf,
        hid,
        email,
        successUrl: `${window.location.origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/payment/cancel`
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create checkout session');
    }
    
    return response.json();
  }
  
  /**
   * Redirect to Stripe Checkout
   * @param {string} sessionId 
   * @returns {Promise<void>}
   */
  async redirectToCheckout(sessionId) {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }
    
    const { error } = await this.stripe.redirectToCheckout({ sessionId });
    
    if (error) {
      throw new Error(error.message);
    }
  }
  
  /**
   * Create payment intent for one-time payment
   * @param {Object} options
   * @returns {Promise<{clientSecret: string, paymentIntentId: string}>}
   */
  async createPaymentIntent(options) {
    const { amount, countryCode, hid, description } = options;
    
    const ecf = this.ecfCalculator.getECF(countryCode);
    const adjustedAmount = Math.round(amount * ecf * 100);
    
    const response = await fetch(`${this.apiEndpoint}/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: adjustedAmount,
        currency: 'usd',
        hid,
        description,
        metadata: { countryCode, ecf: ecf.toString() }
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to create payment intent');
    }
    
    return response.json();
  }
  
  /**
   * Handle webhook event (server-side)
   * @param {string} payload - Raw webhook payload
   * @param {string} signature - Stripe signature header
   * @param {string} webhookSecret - Webhook signing secret
   * @returns {Object} Parsed event
   */
  verifyWebhook(payload, signature, webhookSecret) {
    // This would use stripe.webhooks.constructEvent on server
    // Placeholder for client-side module
    throw new Error('Webhook verification must be done server-side');
  }
  
  /**
   * Get customer portal URL
   * @param {string} customerId 
   * @returns {Promise<string>}
   */
  async getCustomerPortalUrl(customerId) {
    const response = await fetch(`${this.apiEndpoint}/customer-portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId })
    });
    
    if (!response.ok) {
      throw new Error('Failed to get portal URL');
    }
    
    const { url } = await response.json();
    return url;
  }
}

// ============================================================================
// COINBASE COMMERCE INTEGRATION
// ============================================================================

/**
 * Coinbase Commerce handler for crypto payments
 * Always charges full price (no ECF discount)
 */
export class CoinbasePaymentHandler {
  constructor(options = {}) {
    this.apiEndpoint = options.apiEndpoint || '/api/coinbase';
    this.initialized = false;
  }
  
  /**
   * Initialize Coinbase Commerce
   * @returns {Promise<boolean>}
   */
  async init() {
    this.initialized = true;
    console.log('[Coinbase] Initialized');
    return true;
  }
  
  /**
   * Create a charge for subscription
   * @param {Object} options
   * @param {string} options.planId
   * @param {string} options.hid
   * @param {string} [options.email]
   * @returns {Promise<{chargeId: string, hostedUrl: string, expiresAt: string}>}
   */
  async createCharge(options) {
    const { planId, hid, email } = options;
    
    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan) {
      throw new Error(`Invalid plan: ${planId}`);
    }
    
    // Crypto always pays full price
    const priceUsd = plan.basePrice;
    
    const response = await fetch(`${this.apiEndpoint}/create-charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `SovereignOS ${plan.name} Subscription`,
        description: `${plan.name} subscription to Sovereign Business OS`,
        pricing_type: 'fixed_price',
        local_price: {
          amount: priceUsd.toFixed(2),
          currency: 'USD'
        },
        metadata: {
          planId,
          hid,
          email: email || '',
          ecf: '1.0', // Always 1.0 for crypto
          paymentMethod: 'crypto'
        },
        redirect_url: `${typeof window !== 'undefined' ? window.location.origin : ''}/payment/success`,
        cancel_url: `${typeof window !== 'undefined' ? window.location.origin : ''}/payment/cancel`
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create charge');
    }
    
    return response.json();
  }
  
  /**
   * Get charge status
   * @param {string} chargeId 
   * @returns {Promise<{status: string, payments: Object[]}>}
   */
  async getChargeStatus(chargeId) {
    const response = await fetch(`${this.apiEndpoint}/charge/${chargeId}`);
    
    if (!response.ok) {
      throw new Error('Failed to get charge status');
    }
    
    return response.json();
  }
  
  /**
   * List supported cryptocurrencies
   * @returns {string[]}
   */
  getSupportedCurrencies() {
    return [
      'BTC',   // Bitcoin
      'ETH',   // Ethereum
      'LTC',   // Litecoin
      'USDC',  // USD Coin
      'DAI',   // Dai
      'DOGE',  // Dogecoin
      'BCH',   // Bitcoin Cash
      'APE',   // ApeCoin
      'SHIB'   // Shiba Inu
    ];
  }
}

// ============================================================================
// SUBSCRIPTION MANAGER
// ============================================================================

/**
 * Manages subscription state and payment flow
 */
export class SubscriptionManager {
  constructor(db, options = {}) {
    this.db = db;
    this.stripeHandler = new StripePaymentHandler(options.stripe || {});
    this.coinbaseHandler = new CoinbasePaymentHandler(options.coinbase || {});
    this.ecfCalculator = new ECFCalculator();
  }
  
  /**
   * Initialize payment handlers
   * @returns {Promise<void>}
   */
  async init() {
    await Promise.all([
      this.stripeHandler.init(),
      this.coinbaseHandler.init()
    ]);
  }
  
  /**
   * Get current subscription status
   * @param {string} hid 
   * @returns {Promise<SubscriptionStatus>}
   */
  async getSubscriptionStatus(hid) {
    const subscription = await getMeta(this.db, `subscription:${hid}`);
    
    if (!subscription) {
      return {
        active: false,
        plan: null,
        expiresAt: null,
        provider: null,
        autoRenew: false
      };
    }
    
    // Check if expired
    const now = Date.now();
    const active = subscription.expiresAt > now;
    
    return {
      active,
      plan: subscription.planId,
      expiresAt: subscription.expiresAt,
      provider: subscription.provider,
      autoRenew: subscription.autoRenew || false,
      daysRemaining: active ? Math.ceil((subscription.expiresAt - now) / 86400000) : 0
    };
  }
  
  /**
   * Start subscription flow
   * @param {Object} options
   * @param {string} options.planId
   * @param {string} options.provider - 'stripe' or 'coinbase'
   * @param {string} options.hid
   * @param {string} [options.countryCode]
   * @param {string} [options.email]
   * @returns {Promise<{redirectUrl: string}>}
   */
  async startSubscription(options) {
    const { planId, provider, hid, countryCode, email } = options;
    
    if (provider === PAYMENT_PROVIDERS.STRIPE) {
      const session = await this.stripeHandler.createCheckoutSession({
        planId,
        countryCode: countryCode || 'US',
        hid,
        email
      });
      
      return { redirectUrl: session.url };
      
    } else if (provider === PAYMENT_PROVIDERS.COINBASE) {
      const charge = await this.coinbaseHandler.createCharge({
        planId,
        hid,
        email
      });
      
      return { redirectUrl: charge.hostedUrl };
      
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }
  }
  
  /**
   * Activate subscription (called after payment success)
   * @param {Object} paymentData
   * @returns {Promise<void>}
   */
  async activateSubscription(paymentData) {
    const { hid, planId, provider, transactionId, expiresAt } = paymentData;
    
    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan) {
      throw new Error(`Invalid plan: ${planId}`);
    }
    
    // Calculate expiration if not provided
    let expiration = expiresAt;
    if (!expiration) {
      const now = Date.now();
      if (plan.interval === 'month') {
        expiration = now + 30 * 24 * 60 * 60 * 1000;
      } else if (plan.interval === 'year') {
        expiration = now + 365 * 24 * 60 * 60 * 1000;
      }
    }
    
    await setMeta(this.db, `subscription:${hid}`, {
      hid,
      planId,
      provider,
      transactionId,
      expiresAt: expiration,
      activatedAt: Date.now(),
      autoRenew: provider === PAYMENT_PROVIDERS.STRIPE
    });
    
    console.log(`[Subscription] Activated ${planId} for ${hid} until ${new Date(expiration).toISOString()}`);
  }
  
  /**
   * Cancel subscription
   * @param {string} hid 
   * @returns {Promise<void>}
   */
  async cancelSubscription(hid) {
    const current = await getMeta(this.db, `subscription:${hid}`);
    
    if (current) {
      await setMeta(this.db, `subscription:${hid}`, {
        ...current,
        autoRenew: false,
        cancelledAt: Date.now()
      });
      
      console.log(`[Subscription] Cancelled for ${hid}`);
    }
  }
  
  /**
   * Get pricing for user's country
   * @param {string} countryCode 
   * @returns {Object}
   */
  getPricing(countryCode) {
    const ecf = this.ecfCalculator.getECF(countryCode);
    const tier = this.ecfCalculator.getTier(countryCode);
    
    return {
      countryCode,
      ecf,
      tier: tier.name,
      discount: tier.discount,
      plans: {
        monthly: {
          ...SUBSCRIPTION_PLANS.monthly,
          fiatPrice: Math.round(SUBSCRIPTION_PLANS.monthly.basePrice * ecf * 100) / 100,
          cryptoPrice: SUBSCRIPTION_PLANS.monthly.basePrice
        },
        yearly: {
          ...SUBSCRIPTION_PLANS.yearly,
          fiatPrice: Math.round(SUBSCRIPTION_PLANS.yearly.basePrice * ecf * 100) / 100,
          cryptoPrice: SUBSCRIPTION_PLANS.yearly.basePrice
        }
      }
    };
  }
  
  /**
   * Check if user has premium features
   * @param {string} hid 
   * @returns {Promise<boolean>}
   */
  async hasPremium(hid) {
    const status = await getSubscriptionStatus(hid);
    return status.active;
  }
}

// ============================================================================
// PAYMENT RECORD
// ============================================================================

/**
 * Store payment record for auditing
 * @param {IDBDatabase} db 
 * @param {Object} payment 
 * @returns {Promise<void>}
 */
export async function recordPayment(db, payment) {
  const record = {
    id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...payment,
    recordedAt: Date.now()
  };
  
  await setMeta(db, `payment:${record.id}`, record);
  
  // Also add to payments list for user
  const userPayments = await getMeta(db, `payments:${payment.hid}`) || [];
  userPayments.push(record.id);
  await setMeta(db, `payments:${payment.hid}`, userPayments);
  
  return record;
}

/**
 * Get payment history for user
 * @param {IDBDatabase} db 
 * @param {string} hid 
 * @returns {Promise<Object[]>}
 */
export async function getPaymentHistory(db, hid) {
  const paymentIds = await getMeta(db, `payments:${hid}`) || [];
  const payments = [];
  
  for (const id of paymentIds) {
    const payment = await getMeta(db, `payment:${id}`);
    if (payment) {
      payments.push(payment);
    }
  }
  
  return payments.sort((a, b) => b.recordedAt - a.recordedAt);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const stripe = new StripePaymentHandler();
export const coinbase = new CoinbasePaymentHandler();
