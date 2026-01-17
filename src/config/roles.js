// src/config/roles.js

// 🔑 Role keys (single source of truth)
export const ROLES = {
  RETAILER: 'retailer',
  WHOLESALER: 'wholesaler',
  DISTRIBUTOR: 'distributor',
  DEALER: 'dealer',
  VIP: 'vip',
};

// 🔥 Role behavior configuration
export const ROLE_CONFIG = {
  retailer: {
    label: 'Retail Customer',
    minOrderValue: 2000,
    canSeeBulkPricing: false,
    pricingKey: 'retail',
  },

  wholesaler: {
    label: 'Wholesaler',
    minOrderValue: 5000,
    canSeeBulkPricing: true,
    pricingKey: 'wholesale',
  },

  distributor: {
    label: 'Distributor',
    minOrderValue: 20000,
    canSeeBulkPricing: true,
    pricingKey: 'distributor',
  },

  dealer: {
    label: 'Dealer',
    minOrderValue: 10000,
    canSeeBulkPricing: true,
    pricingKey: 'dealer',
  },

  vip: {
    label: 'VIP Customer',
    minOrderValue: 1000,
    canSeeBulkPricing: true,
    pricingKey: 'vip',
  },
};

// 🛟 Safe fallback (VERY IMPORTANT)
export const DEFAULT_ROLE = ROLES.RETAILER;

// ✅ Helper: get role config safely
export const getRoleConfig = (role) => {
  return ROLE_CONFIG[role] || ROLE_CONFIG[DEFAULT_ROLE];
};

// ✅ Helper: all roles list (for dropdowns, admin UI)
export const ALL_ROLES = Object.values(ROLES);
