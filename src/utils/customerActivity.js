// src/utils/customerActivity.js
// Customer activity + cart tracking for the Kiyu-Ziyu React/Firebase store.
// This is additive tracking: failures are intentionally swallowed so analytics
// can never stop login, browsing, cart updates, checkout, or payment flows.

import { auth, db } from '../firebase';
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

const ACTIVITY_COLLECTION = 'customerActivity';
const CART_COLLECTION = 'customerCarts';
const MAX_STRING_LENGTH = 1500;
const MAX_ARRAY_LENGTH = 100;

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clampString = (value, maxLength = MAX_STRING_LENGTH) =>
  String(value ?? '').slice(0, maxLength);

// Firestore rejects `undefined` values in objects. This helper also limits
// unusually large payloads (e.g. long product lists or error messages).
const cleanValue = (value, depth = 0) => {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return clampString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value;
  if (depth > 5) return '[max-depth]';

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH)
      .map((item) => cleanValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (typeof value === 'object') {
    // Keep plain data objects only; avoid trying to serialize DOM/events/classes.
    const output = {};
    Object.entries(value).slice(0, 150).forEach(([key, item]) => {
      const cleaned = cleanValue(item, depth + 1);
      if (cleaned !== undefined) output[key] = cleaned;
    });
    return output;
  }

  return clampString(value);
};

const getUser = () => auth?.currentUser || null;

/**
 * Save one activity event for the currently signed-in Firebase user.
 *
 * Used by LoginPage, HomePage, ProductsPage and CheckoutPage. Examples of
 * `type`: signup_completed, login, homepage_view, homepage_active,
 * collection_click, products_page_view, product_list_view,
 * product_add_to_cart, checkout_started, checkout_details_submitted,
 * checkout_order_created, order_placed, checkout_payment_started,
 * checkout_payment_completed, checkout_payment_failed,
 * checkout_payment_verification_failed, checkout_payment_dismissed,
 * checkout_order_failed.
 *
 * Returns { success: true }, { skipped: true }, or { success: false }.
 */
export async function trackCustomerActivity(type, details = {}) {
  const user = getUser();
  if (!user?.uid || !type) return { skipped: true, reason: 'no-user-or-type' };

  try {
    const safeDetails = cleanValue(details || {}) || {};
    await addDoc(collection(db, ACTIVITY_COLLECTION), {
      uid: user.uid,
      type: clampString(type, 100),
      details: safeDetails,
      createdAt: serverTimestamp(),
      // Client timestamp is useful for sorting/debugging if server time is pending.
      clientTimestamp: new Date(),
      email: clampString(user.email || '', 320),
      phoneNumber: clampString(user.phoneNumber || '', 40),
      isAnonymous: Boolean(user.isAnonymous),
      page: typeof window !== 'undefined' ? clampString(window.location.pathname, 500) : '',
      userAgent: typeof navigator !== 'undefined' ? clampString(navigator.userAgent, 500) : '',
    });
    return { success: true };
  } catch (error) {
    console.warn('[customerActivity] Could not save activity event:', error);
    return { success: false, error };
  }
}

/** Normalize cart items to a compact, stable shape for the admin report. */
export function normalizeCustomerCartItems(cart = {}) {
  const values = Array.isArray(cart) ? cart : Object.values(cart || {});

  return values.map((item) => {
    const quantity = Math.max(0, toNumber(item?.quantity, 0));
    const unitPrice = Math.max(0, toNumber(
      item?.price ?? item?.unitPrice ?? item?.priceAtTimeOfOrder,
      0
    ));
    const images = Array.isArray(item?.images) ? item.images : [];
    const firstImage = images[0];
    const image = item?.image || item?.imageUrl || firstImage?.url || firstImage || '';

    return {
      productId: clampString(item?.id || item?.productId || item?.productID || '', 200),
      name: clampString(item?.productName || item?.name || item?.title || 'Product', 500),
      sku: clampString(item?.productCode || item?.sku || '', 200),
      quantity,
      unitPrice,
      lineTotal: Math.round(quantity * unitPrice * 100) / 100,
      collectionId: clampString(item?.collectionId || '', 200),
      subcollectionId: clampString(item?.subcollectionId || '', 200),
      variation: cleanValue(item?.variation || null),
      image: clampString(typeof image === 'string' ? image : '', 1500),
    };
  }).filter((item) => item.productId || item.name !== 'Product');
}

/**
 * Sync the latest cart snapshot to customerCarts/{uid}.
 * This is a snapshot, not an order record or a historical cart log.
 */
export async function syncCustomerCart(cart = {}, extra = {}, userOverride = null) {
  // CartContext may pass its authenticated user explicitly to keep the cart
  // snapshot UID aligned with the customer profile used by the admin report.
  const user = userOverride?.uid ? userOverride : getUser();
  if (!user?.uid) return { skipped: true, reason: 'no-user' };

  try {
    const items = normalizeCustomerCartItems(cart);
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const cartValue = Math.round(
      items.reduce((sum, item) => sum + item.lineTotal, 0) * 100
    ) / 100;

    const safeExtra = cleanValue(extra || {}) || {};
    await setDoc(doc(db, CART_COLLECTION, user.uid), {
      uid: user.uid,
      items,
      itemCount,
      itemKinds: items.length,
      cartValue,
      currency: 'INR',
      status: items.length > 0 ? 'active' : 'empty',
      isAnonymous: Boolean(user.isAnonymous),
      email: clampString(user.email || '', 320),
      phoneNumber: clampString(user.phoneNumber || '', 40),
      updatedAt: serverTimestamp(),
      clientUpdatedAt: new Date(),
      ...safeExtra,
    }, { merge: true });

    return { success: true, itemCount, itemKinds: items.length, cartValue };
  } catch (error) {
    console.warn('[customerActivity] Could not sync cart snapshot:', error);
    return { success: false, error };
  }
}

/** Convenience helper for a consistent cart summary in activity events. */
export function getCustomerCartSummary(cart = {}) {
  const items = normalizeCustomerCartItems(cart);
  return {
    items: items.slice(0, 50),
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    itemKinds: items.length,
    cartValue: Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100,
    currency: 'INR',
  };
}
