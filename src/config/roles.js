
 // src/config/roles.js

import { db, doc, getDoc } from '../firebase';

// 🔑 Role keys (single source of truth)
export const ROLES = {
  RETAILER: 'retailer',
  WHOLESALER: 'wholesaler',
  DISTRIBUTOR: 'distributor',
  DEALER: 'dealer',
  VIP: 'vip',
  DROPSHIPPING: 'dropshipping',
};

// 🔥 Permanent customer role configuration (local fallback)
const DEFAULT_ROLE_CONFIG = {
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
 * Thresholds remain exactly as in your existing configuration.
 */
const DEFAULT_ORDER_PRICING_SLABS = {
  retailer: [
    { qualifyingValue: 0, pricingKey: 'retail', label: 'Retail' },
    { qualifyingValue: 4000, pricingKey: 'wholesale', label: 'Wholesale' },
    { qualifyingValue: 25000, pricingKey: 'distributor', label: 'Distributor' },
    { qualifyingValue: 40000, pricingKey: 'dealer', label: 'Dealer' },
    { qualifyingValue: 75000, pricingKey: 'vip', label: 'VIP' },
  ],
  wholesaler: [
    { qualifyingValue: 0, pricingKey: 'wholesale', label: 'Wholesale' },
    { qualifyingValue: 25000, pricingKey: 'distributor', label: 'Distributor' },
    { qualifyingValue: 40000, pricingKey: 'dealer', label: 'Dealer' },
    { qualifyingValue: 75000, pricingKey: 'vip', label: 'VIP' },
  ],
  distributor: [
    { qualifyingValue: 0, pricingKey: 'distributor', label: 'Distributor' },
    { qualifyingValue: 40000, pricingKey: 'dealer', label: 'Dealer' },
    { qualifyingValue: 75000, pricingKey: 'vip', label: 'VIP' },
  ],
  dealer: [
    { qualifyingValue: 0, pricingKey: 'dealer', label: 'Dealer' },
    { qualifyingValue: 75000, pricingKey: 'vip', label: 'VIP' },
  ],
  vip: [
    { qualifyingValue: 0, pricingKey: 'vip', label: 'VIP' },
  ],
  dropshipping: [
    { qualifyingValue: 0, pricingKey: 'dropshipping', label: 'Dropshipping' },
  ],
};

// 🛟 Safe fallback role
export const DEFAULT_ROLE = ROLES.RETAILER;

// Live configuration. These exports retain their existing names.
export let ROLE_CONFIG = DEFAULT_ROLE_CONFIG;
export let ORDER_PRICING_SLABS = DEFAULT_ORDER_PRICING_SLABS;

let configurationLoaded = false;
let configurationPromise = null;

// Helpers
const isObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value);

const mergeRoleConfig = (remoteRoles = {}) => {
  const merged = {};

  for (const role of Object.keys(DEFAULT_ROLE_CONFIG)) {
    const fallback = DEFAULT_ROLE_CONFIG[role];
    const remote = isObject(remoteRoles[role])
      ? remoteRoles[role]
      : {};

    merged[role] = {
      ...fallback,
      ...remote,
      minOrderValue:
        remote.minOrderValue == null
          ? fallback.minOrderValue
          : Number(remote.minOrderValue),
    };
  }

  return merged;
};

const mergeOrderPricingSlabs = (remoteSlabs = {}) => {
  const merged = {};

  for (const role of Object.keys(DEFAULT_ORDER_PRICING_SLABS)) {
    const fallback = DEFAULT_ORDER_PRICING_SLABS[role];
    const remote = remoteSlabs[role];

    if (!Array.isArray(remote) || remote.length === 0) {
      merged[role] = fallback;
      continue;
    }

    const validSlabs = remote
      .filter(
        (slab) =>
          isObject(slab) &&
          slab.pricingKey &&
          Number.isFinite(Number(slab.qualifyingValue))
      )
      .map((slab) => ({
        ...slab,
        qualifyingValue: Number(slab.qualifyingValue),
        pricingKey: String(slab.pricingKey),
        label: String(slab.label || slab.pricingKey),
      }))
      .sort((a, b) => a.qualifyingValue - b.qualifyingValue);

    merged[role] = validSlabs.length ? validSlabs : fallback;
  }

  return merged;
};

/**
 * Load role settings from Firestore.
 *
 * Collection: appConfig
 * Documents:
 *   roles
 *   orderPricingSlabs
 *
 * The local configuration remains available as a fallback.
 */
export const loadRoleConfiguration = ({ force = false } = {}) => {
  if (configurationLoaded && !force) {
    return Promise.resolve({
      roleConfig: ROLE_CONFIG,
      orderPricingSlabs: ORDER_PRICING_SLABS,
      source: 'firestore',
    });
  }

  if (configurationPromise && !force) {
    return configurationPromise;
  }

  configurationPromise = (async () => {
    try {
      const [rolesSnapshot, slabsSnapshot] = await Promise.all([
        getDoc(doc(db, 'appConfig', 'roles')),
        getDoc(doc(db, 'appConfig', 'orderPricingSlabs')),
      ]);

      const rolesDocument = rolesSnapshot.exists()
        ? rolesSnapshot.data()
        : {};

      const slabsDocument = slabsSnapshot.exists()
        ? slabsSnapshot.data()
        : {};

      // Supports documents containing a "roles"/"slabs" map
      // or documents containing the role keys directly.
      const remoteRoles = isObject(rolesDocument.roles)
        ? rolesDocument.roles
        : rolesDocument;

      const remoteSlabs = isObject(slabsDocument.slabs)
        ? slabsDocument.slabs
        : slabsDocument;

      ROLE_CONFIG = mergeRoleConfig(remoteRoles);
      ORDER_PRICING_SLABS =
        mergeOrderPricingSlabs(remoteSlabs);

      configurationLoaded = true;

      return {
        roleConfig: ROLE_CONFIG,
        orderPricingSlabs: ORDER_PRICING_SLABS,
        source:
          rolesSnapshot.exists() || slabsSnapshot.exists()
            ? 'firestore'
            : 'fallback',
      };
    } catch (error) {
      console.error(
        'Failed to load role configuration from Firebase. Using local defaults.',
        error
      );

      ROLE_CONFIG = DEFAULT_ROLE_CONFIG;
      ORDER_PRICING_SLABS = DEFAULT_ORDER_PRICING_SLABS;
      configurationLoaded = false;

      return {
        roleConfig: ROLE_CONFIG,
        orderPricingSlabs: ORDER_PRICING_SLABS,
        source: 'fallback',
        error,
      };
    } finally {
      configurationPromise = null;
    }
  })();

  return configurationPromise;
};

// Existing helper functions remain available.
export const getRoleConfig = (role) =>
  ROLE_CONFIG[String(role || '').toLowerCase()] ||
  ROLE_CONFIG[DEFAULT_ROLE];

export const ALL_ROLES = Object.values(ROLES);

export const getOrderPricingSlabs = (role) =>
  ORDER_PRICING_SLABS[String(role || '').toLowerCase()] ||
  ORDER_PRICING_SLABS[DEFAULT_ROLE];
