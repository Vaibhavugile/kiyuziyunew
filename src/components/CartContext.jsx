import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { useAuth } from './AuthContext';
import { getOrderPricingSlabs } from '../config/roles';
import { syncCustomerCart, trackCustomerActivity } from '../utils/customerActivity';

/* =======================
   Utility functions
======================= */

export const getPriceForQuantity = (tiers, totalQuantity) => {
  if (!tiers || tiers.length === 0) return null;

  const sortedTiers = [...tiers].sort(
    (a, b) => Number(b.min_quantity) - Number(a.min_quantity)
  );

  for (const tier of sortedTiers) {
    if (totalQuantity >= Number(tier.min_quantity)) {
      return Number(tier.price);
    }
  }

  return Number(sortedTiers[sortedTiers.length - 1]?.price) || 0;
};

export const createStablePricingId = (tiers) => {
  if (!tiers) return null;

  const sortedTiers = [...tiers].sort(
    (a, b) => Number(a.min_quantity) - Number(b.min_quantity)
  );

  return JSON.stringify(
    sortedTiers.map((tier) => {
      const obj = {};
      Object.keys(tier)
        .sort()
        .forEach((k) => (obj[k] = tier[k]));
      return obj;
    })
  );
};

export const getCartItemId = (product) => {
  if (product.variation) {
    const variationKeys = Object.keys(product.variation)
      .filter((k) => product.variation[k] != null)
      .sort();

    const variationString = variationKeys
      .map((k) =>
        String(product.variation[k])
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '-')
      )
      .join('_');

    return `${product.id}_${variationString}`;
  }
  return product.id;
};

/* =======================
   Context
======================= */

export const CartContext = createContext();

/* =======================
   Price recalculation
======================= */

// Always group by the actual tier array for the selected pricing key.
// Do not reuse a pricingId created for a different role's tier array.
const recalculateCartPrices = (currentCart, pricingKey, fallbackPricingKey = null) => {
  const newCart = { ...currentCart };
  const pricingGroups = {};

  for (const cartItemId in newCart) {
    const item = newCart[cartItemId];
    if (!item.tieredPricing) continue;

    const requestedTiers = item.tieredPricing[pricingKey];
    const fallbackTiers = fallbackPricingKey
      ? item.tieredPricing[fallbackPricingKey]
      : null;
    const roleTiers =
      Array.isArray(requestedTiers) && requestedTiers.length
        ? requestedTiers
        : fallbackTiers;

    if (!Array.isArray(roleTiers) || roleTiers.length === 0) continue;

    const pricingId = createStablePricingId(roleTiers);
    if (!pricingGroups[pricingId]) {
      pricingGroups[pricingId] = {
        totalQuantity: 0,
        cartItemIds: [],
        tiers: roleTiers,
      };
    }

    pricingGroups[pricingId].totalQuantity += Number(item.quantity || 0);
    pricingGroups[pricingId].cartItemIds.push(cartItemId);
  }

  for (const key in pricingGroups) {
    const group = pricingGroups[key];
    const newPrice = getPriceForQuantity(group.tiers, group.totalQuantity);

    group.cartItemIds.forEach((id) => {
      newCart[id] = {
        ...newCart[id],
        price: newPrice == null ? Number(newCart[id].price || 0) : newPrice,
        appliedPricingKey: pricingKey,
      };
    });
  }

  return newCart;
};

const sumCart = (items) =>
  Object.values(items).reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

// Qualification is always measured at the customer's permanent role prices.
// The selected higher role is only used to calculate the current order's price.
const applyOrderPricing = (currentCart, basePricingKey, slabs) => {
  const basePricedCart = recalculateCartPrices(currentCart, basePricingKey);
  const qualificationSubtotal = sumCart(basePricedCart);

  const sortedSlabs = [...(slabs || [])].sort(
    (a, b) => Number(a.qualifyingValue) - Number(b.qualifyingValue)
  );

  const activeSlab =
    [...sortedSlabs]
      .reverse()
      .find((slab) => qualificationSubtotal >= Number(slab.qualifyingValue)) ||
    sortedSlabs[0];

  const activePricingKey = activeSlab?.pricingKey || basePricingKey;
  const pricedCart = recalculateCartPrices(currentCart, activePricingKey, basePricingKey);

  return {
    cart: pricedCart,
    qualificationSubtotal,
    activePricingKey,
    activeSlab,
    nextSlab:
      sortedSlabs.find(
        (slab) => Number(slab.qualifyingValue) > qualificationSubtotal
      ) || null,
  };
};

/* =======================
   Provider
======================= */

export const CartProvider = ({ children }) => {
const { roleConfig, userRole, currentUser } = useAuth();

  // pricingKey is the customer's permanent role pricing key.
  // activeOrderPricingKey is selected dynamically from the order-value slabs.
  const pricingKey = roleConfig?.pricingKey || 'wholesale';
  const minOrderValue = Number(roleConfig?.minOrderValue || 0);
  const normalizedRole = String(userRole || 'wholesaler').toLowerCase();
  const orderPricingSlabs = getOrderPricingSlabs(normalizedRole);

  /* =======================
     CART STATE
  ======================= */

  const [cart, setCart] = useState(() => {
    try {
      const stored = localStorage.getItem('cart');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  // Keep the previous cart in memory so we can record quantity removals as
  // immutable activity events, even though customerCarts stores only a snapshot.
  const previousCartRef = useRef({ uid: null, cart: null });
  const suppressNextRemovalEventRef = useRef(false);

  // Persist the current browser cart and mirror it to customerCarts/{uid}.
  // Cart changes are compared against the previous snapshot to record removals.
  useEffect(() => {
    if (!currentUser?.uid) {
      console.debug('[CartContext] Cart sync waiting for an authenticated user.');
      return;
    }

    const uid = currentUser.uid;
    const previousState = previousCartRef.current;
    const hasPreviousForThisUser = previousState.uid === uid && previousState.cart !== null;
    const previousCart = hasPreviousForThisUser ? previousState.cart : null;
    // Update synchronously so React StrictMode/effect reruns do not double-log
    // the same cart diff.
    previousCartRef.current = { uid, cart: { ...(cart || {}) } };

    const previousItems = previousCart || {};
    const currentItems = cart || {};
    if (previousCart) {
      const removedItems = [];
      const addedItems = [];
      const allIds = new Set([...Object.keys(previousItems), ...Object.keys(currentItems)]);
      allIds.forEach((cartItemId) => {
        const before = previousItems[cartItemId];
        const after = currentItems[cartItemId];
        const beforeQty = Math.max(0, Number(before?.quantity || 0));
        const afterQty = Math.max(0, Number(after?.quantity || 0));
        if (beforeQty > afterQty && before) {
          removedItems.push({
            productId: before.id || cartItemId,
            productName: before.productName || before.name || 'Product',
            productCode: before.productCode || before.sku || '',
            variation: before.variation || null,
            quantityRemoved: beforeQty - afterQty,
            unitPrice: Math.max(0, Number(before.price || 0)),
          });
        } else if (afterQty > beforeQty && after) {
          addedItems.push({
            productId: after.id || cartItemId,
            productName: after.productName || after.name || 'Product',
            productCode: after.productCode || after.sku || '',
            variation: after.variation || null,
            quantityAdded: afterQty - beforeQty,
            unitPrice: Math.max(0, Number(after.price || 0)),
          });
        }
      });

      const sumQuantity = (list, field) => list.reduce((sum, item) => sum + Number(item[field] || 0), 0);
      const countUnits = (items) => Object.values(items).reduce((sum, item) => sum + Math.max(0, Number(item?.quantity || 0)), 0);
      const cartValueOf = (items) => Math.round(Object.values(items).reduce((sum, item) => sum + Math.max(0, Number(item?.price || 0)) * Math.max(0, Number(item?.quantity || 0)), 0) * 100) / 100;

      if (removedItems.length && !suppressNextRemovalEventRef.current) {
        void trackCustomerActivity('cart_items_removed', {
          removedItems,
          removedQuantity: sumQuantity(removedItems, 'quantityRemoved'),
          removedKinds: removedItems.length,
          previousItemCount: countUnits(previousItems),
          currentItemCount: countUnits(currentItems),
          previousCartValue: cartValueOf(previousItems),
          currentCartValue: cartValueOf(currentItems),
          reason: Object.keys(currentItems).length === 0 ? 'cart_cleared' : 'item_removed_or_quantity_decreased',
        }).then((result) => {
          if (result?.success) console.debug('[CartContext] Cart removal event recorded.', { uid, removedQuantity: sumQuantity(removedItems, 'quantityRemoved') });
          else console.warn('[CartContext] Cart removal event not recorded.', { uid, result });
        });
      }
      if (suppressNextRemovalEventRef.current) suppressNextRemovalEventRef.current = false;
      if (addedItems.length) {
        void trackCustomerActivity('cart_items_added', {
          addedItems,
          addedQuantity: sumQuantity(addedItems, 'quantityAdded'),
          addedKinds: addedItems.length,
          previousItemCount: countUnits(previousItems),
          currentItemCount: countUnits(currentItems),
          previousCartValue: cartValueOf(previousItems),
          currentCartValue: cartValueOf(currentItems),
        });
      }
    }

    let cancelled = false;

    const sync = async () => {
      const items = Object.values(cart || {});
      const itemCount = items.reduce(
        (sum, item) => sum + Math.max(0, Number(item?.quantity || 0)),
        0
      );
      const cartValue = Math.round(items.reduce(
        (sum, item) => sum +
          Math.max(0, Number(item?.price || 0)) *
          Math.max(0, Number(item?.quantity || 0)),
        0
      ) * 100) / 100;

      console.debug('[CartContext] Syncing cart snapshot', {
        uid: currentUser.uid,
        itemKinds: items.length,
        itemCount,
        cartValue,
      });

      const result = await syncCustomerCart(cart, {}, currentUser);
      if (cancelled) return;

      if (!result?.success) {
        console.warn('[CartContext] Cart sync did not complete.', {
          uid: currentUser.uid,
          result,
        });
        return;
      }

      console.debug('[CartContext] Cart snapshot synced.', {
        uid: currentUser.uid,
        itemCount: result.itemCount,
        cartValue: result.cartValue,
      });

      // Record meaningful non-empty cart activity for the follow-up report.
      if (items.length > 0 && itemCount > 0) {
        await trackCustomerActivity('cart_updated', {
          itemKinds: items.length,
          itemCount,
          cartValue,
        });
      }
    };

    void sync().catch((error) => {
      console.warn('[CartContext] Unexpected cart-sync error:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [cart, currentUser]);

  /* =======================
     COUPON STATE
  ======================= */

  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState(null);

  /* =======================
     TOTALS
  ======================= */

  const basePricedCart = useMemo(
    () => recalculateCartPrices(cart, pricingKey),
    [cart, pricingKey]
  );

  const qualificationSubtotal = useMemo(
    () => sumCart(basePricedCart),
    [basePricedCart]
  );

  const sortedOrderPricingSlabs = useMemo(
    () =>
      [...(orderPricingSlabs || [])].sort(
        (a, b) => Number(a.qualifyingValue) - Number(b.qualifyingValue)
      ),
    [orderPricingSlabs]
  );

  const activeOrderSlab = useMemo(
    () =>
      [...sortedOrderPricingSlabs]
        .reverse()
        .find((slab) => qualificationSubtotal >= Number(slab.qualifyingValue)) ||
      sortedOrderPricingSlabs[0] ||
      { qualifyingValue: 0, pricingKey, label: roleConfig?.label || 'Current tier' },
    [sortedOrderPricingSlabs, qualificationSubtotal, pricingKey, roleConfig?.label]
  );

  const activeOrderPricingKey = activeOrderSlab?.pricingKey || pricingKey;
  const nextOrderSlab = useMemo(
    () =>
      sortedOrderPricingSlabs.find(
        (slab) => Number(slab.qualifyingValue) > qualificationSubtotal
      ) || null,
    [sortedOrderPricingSlabs, qualificationSubtotal]
  );

  const getCartSubtotal = useCallback(() => sumCart(cart), [cart]);

  const getCartTotal = useCallback(() => {
    return getCartSubtotal();
  }, [getCartSubtotal]);

  const getFinalTotal = useCallback(() => {
    return Math.max(0, getCartSubtotal() - couponDiscount);
  }, [getCartSubtotal, couponDiscount]);

  const currentCartSubtotal = sumCart(cart);
  const nextTierCartSubtotal = nextOrderSlab
    ? sumCart(recalculateCartPrices(cart, nextOrderSlab.pricingKey, pricingKey))
    : currentCartSubtotal;
  const nextTierSavings = nextOrderSlab
    ? Math.max(0, currentCartSubtotal - nextTierCartSubtotal)
    : 0;

  const orderPricing = useMemo(() => ({
    basePricingKey: pricingKey,
    activePricingKey: activeOrderPricingKey,
    activeSlab: activeOrderSlab,
    nextSlab: nextOrderSlab,
    slabs: sortedOrderPricingSlabs,
    qualificationSubtotal,
    currentSubtotal: currentCartSubtotal,
    savings: Math.max(0, qualificationSubtotal - currentCartSubtotal),
    nextTierSavings,
    nextTierProjectedSubtotal: nextTierCartSubtotal,
    amountToNextSlab: nextOrderSlab
      ? Math.max(0, Number(nextOrderSlab.qualifyingValue) - qualificationSubtotal)
      : 0,
  }), [
    pricingKey,
    activeOrderPricingKey,
    activeOrderSlab,
    nextOrderSlab,
    sortedOrderPricingSlabs,
    qualificationSubtotal,
    cart,
    currentCartSubtotal,
    nextTierSavings,
    nextTierCartSubtotal,
  ]);

  /* =======================
     MIN ORDER CHECK
  ======================= */

  const checkMinOrderValue = useCallback(() => {
    const total = getCartTotal();

    return {
      minimumRequired: minOrderValue,
      isMinMet: total >= minOrderValue,
      currentTotal: total,
    };
  }, [getCartTotal, minOrderValue]);

  /* =======================
     ADD TO CART
  ======================= */

  const addToCart = useCallback(
    (productData) => {
      setCart((prevCart) => {
        const cartItemId = getCartItemId(productData);
        const currentQty = prevCart[cartItemId]?.quantity || 0;

        const cleanProduct = { ...productData };
        delete cleanProduct.quantity;
        delete cleanProduct.variations;

        let stockLimit;
        if (productData.variation) {
          stockLimit = Number(productData.variation.quantity);
        } else {
          stockLimit =
            prevCart[cartItemId]?.stockLimit ??
            Number(productData.quantity || Infinity);
        }

        if (currentQty >= stockLimit) return prevCart;

        const roleTiers =
          cleanProduct.tieredPricing?.[pricingKey];

        const pricingId = roleTiers
          ? createStablePricingId(roleTiers)
          : null;

        const updatedCart = {
          ...prevCart,
          [cartItemId]: {
            ...(prevCart[cartItemId] || {}),
            ...cleanProduct,
            stockLimit,
            quantity: currentQty + 1,
            pricingId,
            images:
              cleanProduct.images ||
              (cleanProduct.image
                ? [{ url: cleanProduct.image }]
                : []),
          },
        };

        return applyOrderPricing(updatedCart, pricingKey, orderPricingSlabs).cart;
      });
    },
    [pricingKey, orderPricingSlabs]
  );

  /* =======================
     REMOVE (−)
  ======================= */

  const removeFromCart = useCallback(
    (cartItemId) => {
      setCart((prevCart) => {
        const newCart = { ...prevCart };
        if (!newCart[cartItemId]) return prevCart;

        if (newCart[cartItemId].quantity <= 1) {
          delete newCart[cartItemId];
        } else {
          newCart[cartItemId].quantity -= 1;
        }

        return applyOrderPricing(newCart, pricingKey, orderPricingSlabs).cart;
      });
    },
    [pricingKey, orderPricingSlabs]
  );

  /* =======================
     REMOVE FULL ITEM
  ======================= */

  const removeItemFromCart = useCallback(
    (productId, variation = null) => {
      setCart((prevCart) => {
        const newCart = { ...prevCart };

        Object.keys(newCart).forEach((cartItemId) => {
          const item = newCart[cartItemId];
          if (item.id !== productId) return;

          if (variation) {
            const v1 = item.variation || {};
            const v2 = variation || {};
            const normalize = (v) =>
              String(v ?? '').trim().toLowerCase();

            if (
              normalize(v1.color) !== normalize(v2.color) ||
              normalize(v1.size) !== normalize(v2.size)
            ) {
              return;
            }
          }

          delete newCart[cartItemId];
        });

        return applyOrderPricing(newCart, pricingKey, orderPricingSlabs).cart;
      });
    },
    [pricingKey, orderPricingSlabs]
  );

  const clearCart = useCallback((options = {}) => {
    // Checkout passes reason='order_placed' so a successful purchase isn't
    // incorrectly counted as a customer removing products from their cart.
    if (options?.reason === 'order_placed') suppressNextRemovalEventRef.current = true;
    setCart({});
    setAppliedCoupon(null);
    setCouponDiscount(0);
    setCouponError(null);
  }, []);

  /* =======================
     COUPON LOGIC
  ======================= */

  const applyCoupon = async (couponDoc) => {
  try {
    /* =========================
       DEBUG START
    ========================= */
    console.group('🧪 COUPON APPLY DEBUG');
console.log('👤 userRole (from auth):', userRole);

    console.log('📄 couponDoc:', couponDoc);
    console.log('🏷️ couponDoc.code:', couponDoc?.code);
    console.log('👥 couponDoc.allowedRoles:', couponDoc?.allowedRoles);
    console.log('👤 userRole (received):', userRole);
    console.log('📦 typeof userRole:', typeof userRole);

    if (Array.isArray(couponDoc?.allowedRoles)) {
      console.log(
        '✅ Role match check:',
        couponDoc.allowedRoles.includes(userRole)
      );
    } else {
      console.log('⚠️ allowedRoles is NOT an array');
    }

    console.groupEnd();
    /* =========================
       DEBUG END
    ========================= */

    setCouponError(null);

    // ❌ inactive
    if (!couponDoc.isActive) {
      throw new Error('Coupon is disabled');
    }

    // ❌ expired
    if (couponDoc.expiry?.toDate() < new Date()) {
      throw new Error('Coupon has expired');
    }

    // ❌ role restriction
  if (
  Array.isArray(couponDoc.allowedRoles) &&
  couponDoc.allowedRoles.length > 0 &&
  !couponDoc.allowedRoles.includes(userRole)
) {
  throw new Error('Coupon is not available for your role');
}


    const subtotal = getCartSubtotal();

    // ❌ min order
    if (subtotal < couponDoc.minOrderValue) {
      throw new Error(
        `Minimum order ₹${couponDoc.minOrderValue} required`
      );
    }

    // ❌ usage limit
    if (
      couponDoc.maxUses > 0 &&
      couponDoc.usedCount >= couponDoc.maxUses
    ) {
      throw new Error('Coupon usage limit reached');
    }

    /* =========================
       CALCULATE DISCOUNT
    ========================= */
    let discount = 0;

    if (couponDoc.type === 'percentage') {
      discount = (subtotal * couponDoc.value) / 100;
    } else {
      discount = couponDoc.value;
    }

    discount = Math.min(discount, subtotal);

    setAppliedCoupon(couponDoc);
    setCouponDiscount(discount);

  } catch (err) {
    console.error('❌ COUPON ERROR:', err.message);
    setAppliedCoupon(null);
    setCouponDiscount(0);
    setCouponError(err.message);
  }
};


  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponDiscount(0);
    setCouponError(null);
  };

  /* =======================
     REPRICE ON ROLE CHANGE
  ======================= */

  useEffect(() => {
    setCart((prev) => {
      if (!Object.keys(prev).length) return prev;
      return applyOrderPricing(prev, pricingKey, orderPricingSlabs).cart;
    });
    removeCoupon();
    // Recalculate when the permanent role or its slab configuration changes.
  }, [pricingKey, normalizedRole]);

  /* =======================
     CONTEXT VALUE
  ======================= */

  const contextValue = {
    cart,
    addToCart,
    removeFromCart,
    removeItemFromCart,
    clearCart,

    getCartTotal,
    getCartSubtotal,
    getFinalTotal,
    checkMinOrderValue,

    pricingKey,
    orderPricing,

    // 🔥 coupon
    applyCoupon,
    removeCoupon,
    appliedCoupon,
    couponDiscount,
    couponError,
  };

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
