
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

export const FIRESTORE_ROLE_CONFIG = {
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

export const FIRESTORE_ORDER_PRICING_SLABS = {
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

export async function saveRoleConfigurationToFirestore() {
  // Write both documents together in one atomic batch.
  const { writeBatch } = await import('firebase/firestore');
  const batch = writeBatch(db);

  batch.set(doc(db, 'appConfig', 'roles'), {
    roles: FIRESTORE_ROLE_CONFIG,
  });

  batch.set(doc(db, 'appConfig', 'orderPricingSlabs'), {
    slabs: FIRESTORE_ORDER_PRICING_SLABS,
  });

  await batch.commit();

  return true;
}
