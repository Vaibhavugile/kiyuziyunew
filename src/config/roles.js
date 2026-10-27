// src/config/roles.js

// 🔑 Role keys (single source of truth)
export const ROLES = {
  RETAILER: 'retailer',
  WHOLESALER: 'wholesaler',
  DISTRIBUTOR: 'distributor',
  DEALER: 'dealer',
  VIP: 'vip',
  DROPSHIPPING: 'dropshipping',
};

// 🔥 Permanent customer role configuration
export const ROLE_CONFIG = {
  retailer: {
    label: 'Retail Customer',
    minOrderValue: 1000,
    canSeeBulkPricing: false,
    pricingKey: 'retail',
    paymentMode: 'MANUAL',
  },
  wholesaler: {
    label: 'Wholesaler',
    minOrderValue: 1000,
    canSeeBulkPricing: true,
    pricingKey: 'wholesale',
    paymentMode: 'MANUAL',
  },
  distributor: {
    label: 'Distributor',
    minOrderValue: 30000,
    canSeeBulkPricing: true,
    pricingKey: 'distributor',
    paymentMode: 'MANUAL',
  },
  dealer: {
    label: 'Dealer',
    minOrderValue: 60000,
    canSeeBulkPricing: true,
    pricingKey: 'dealer',
    paymentMode: 'MANUAL',
  },
  vip: {
    label: 'VIP Customer',
    minOrderValue: 150000,
    canSeeBulkPricing: true,
    pricingKey: 'vip',
    paymentMode: 'MANUAL',
  },
  dropshipping: {
    label: 'Dropshipping',
    minOrderValue: 5000,
    canSeeBulkPricing: true,
    pricingKey: 'dropshipping',
    paymentMode: 'MANUAL',
  },
};

/*
 * Temporary order-value pricing slabs.
 * Thresholds are measured using the cart subtotal at the customer's
 * permanent role prices, so switching to a cheaper tier cannot make
 * the customer lose an already-unlocked tier.
 *
 * Retailer:   ₹5k Retail -> Wholesale, ₹10k Distributor,
 *             ₹15k Dealer, ₹20k VIP.
 * Wholesaler: ₹5k Distributor, ₹10k Dealer, ₹15k VIP.
 * Distributor: ₹5k Dealer, ₹10k VIP.
 * Dealer: ₹5k VIP.
 *
 * Dropshipping stays on its own pricing unless you later choose a
 * specific progression for that role.
 */
export const ORDER_PRICING_SLABS = {
  retailer: [
    { qualifyingValue: 0, pricingKey: 'retail', label: 'Retail' },
    { qualifyingValue: 2000, pricingKey: 'wholesale', label: 'Wholesale' },
    { qualifyingValue: 15000, pricingKey: 'distributor', label: 'Distributor' },
    { qualifyingValue: 30000, pricingKey: 'dealer', label: 'Dealer' },
    { qualifyingValue: 60000, pricingKey: 'vip', label: 'VIP' },
  ],
  wholesaler: [
    { qualifyingValue: 0, pricingKey: 'wholesale', label: 'Wholesale' },
    { qualifyingValue: 15000, pricingKey: 'distributor', label: 'Distributor' },
    { qualifyingValue: 30000, pricingKey: 'dealer', label: 'Dealer' },
    { qualifyingValue: 60000, pricingKey: 'vip', label: 'VIP' },
  ],
  distributor: [
    { qualifyingValue: 0, pricingKey: 'distributor', label: 'Distributor' },
    { qualifyingValue: 30000, pricingKey: 'dealer', label: 'Dealer' },
    { qualifyingValue: 60000, pricingKey: 'vip', label: 'VIP' },
  ],
  dealer: [
    { qualifyingValue: 0, pricingKey: 'dealer', label: 'Dealer' },
    { qualifyingValue: 60000, pricingKey: 'vip', label: 'VIP' },
  ],
  vip: [
    { qualifyingValue: 0, pricingKey: 'vip', label: 'VIP' },
  ],
  dropshipping: [
    { qualifyingValue: 0, pricingKey: 'dropshipping', label: 'Dropshipping' },
  ],
};

// 🛟 Safe fallback
export const DEFAULT_ROLE = ROLES.RETAILER;

export const getRoleConfig = (role) =>
  ROLE_CONFIG[String(role || '').toLowerCase()] || ROLE_CONFIG[DEFAULT_ROLE];

export const ALL_ROLES = Object.values(ROLES);

export const getOrderPricingSlabs = (role) =>
  ORDER_PRICING_SLABS[String(role || '').toLowerCase()] ||
  ORDER_PRICING_SLABS[DEFAULT_ROLE];
