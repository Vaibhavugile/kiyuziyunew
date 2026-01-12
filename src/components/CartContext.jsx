import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const WHOLESALER_MIN_ORDER_VALUE = 5000;

/* =======================
   Utility functions
======================= */

export const getPriceForQuantity = (tiers, totalQuantity) => {
  if (!tiers || tiers.length === 0) return null;
  const sortedTiers = [...tiers].sort((a, b) => b.min_quantity - a.min_quantity);
  for (const tier of sortedTiers) {
    if (totalQuantity >= tier.min_quantity) {
      return tier.price;
    }
  }
  return sortedTiers[sortedTiers.length - 1]?.price || null;
};

export const createStablePricingId = (tiers) => {
  if (!tiers) return null;
  const sortedTiers = [...tiers].sort(
    (a, b) => parseInt(a.min_quantity, 10) - parseInt(b.min_quantity, 10)
  );
  return JSON.stringify(
    sortedTiers.map(tier => {
      const obj = {};
      Object.keys(tier).sort().forEach(k => (obj[k] = tier[k]));
      return obj;
    })
  );
};

export const getCartItemId = (product) => {
  if (product.variation) {
    const variationKeys = Object.keys(product.variation)
      .filter(k => product.variation[k] != null)
      .sort();

    const variationString = variationKeys
      .map(k => String(product.variation[k]).trim().toLowerCase().replace(/\s+/g, '-'))
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

const recalculateCartPrices = (currentCart, userRole) => {
  const newCart = { ...currentCart };
  const pricingGroups = {};

  for (const cartItemId in newCart) {
    const item = newCart[cartItemId];
    if (!item.tieredPricing) continue;

    const roleTiers =
      item.tieredPricing[userRole === 'wholesaler' ? 'wholesale' : 'retail'];

    if (!roleTiers) continue;

    const pricingId =
      item.pricingId || createStablePricingId(roleTiers);

    if (!pricingGroups[pricingId]) {
      pricingGroups[pricingId] = {
        totalQuantity: 0,
        cartItemIds: [],
        tiers: roleTiers,
      };
    }

    pricingGroups[pricingId].totalQuantity += item.quantity;
    pricingGroups[pricingId].cartItemIds.push(cartItemId);
  }

  for (const key in pricingGroups) {
    const group = pricingGroups[key];
    const newPrice = getPriceForQuantity(group.tiers, group.totalQuantity);
    group.cartItemIds.forEach(id => {
      newCart[id].price = newPrice;
    });
  }

  return newCart;
};

/* =======================
   Provider
======================= */

export const CartProvider = ({ children }) => {
  const { userRole } = useAuth();

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

  const getCartTotal = useCallback(() => {
    return Object.values(cart).reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
  }, [cart]);

  const checkMinOrderValue = useCallback(() => {
    const total = getCartTotal();
    const isWholesaler = userRole === 'wholesaler';
    const minimumRequired = isWholesaler ? WHOLESALER_MIN_ORDER_VALUE : 0;

    return {
      isWholesaler,
      minimumRequired,
      isMinMet: total >= minimumRequired,
      currentTotal: total,
    };
  }, [getCartTotal, userRole]);

  /* =======================
     ADD TO CART (unchanged)
  ======================= */

  const addToCart = useCallback((productData) => {
    setCart(prevCart => {
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
        cleanProduct.tieredPricing?.[
          userRole === 'wholesaler' ? 'wholesale' : 'retail'
        ];

      const pricingId = roleTiers ? createStablePricingId(roleTiers) : null;

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
            (cleanProduct.image ? [{ url: cleanProduct.image }] : []),
        },
      };

      return recalculateCartPrices(updatedCart, userRole);
    });
  }, [userRole]);

  /* =======================
     REMOVE BY CART ITEM ID
  ======================= */

  const removeFromCart = useCallback((cartItemId) => {
    setCart(prevCart => {
      const newCart = { ...prevCart };
      if (!newCart[cartItemId]) return prevCart;

      if (newCart[cartItemId].quantity <= 1) {
        delete newCart[cartItemId];
      } else {
        newCart[cartItemId].quantity -= 1;
      }

      return recalculateCartPrices(newCart, userRole);
    });
  }, [userRole]);

  /* =======================
     🔥 NEW: REMOVE BY PRODUCT + VARIATION
     Used by Checkout auto-fix
  ======================= */

  const removeItemFromCart = useCallback((productId, variation = null) => {
    setCart(prevCart => {
      const newCart = { ...prevCart };

      Object.keys(newCart).forEach(cartItemId => {
        const item = newCart[cartItemId];

        if (item.id !== productId) return;

        if (variation) {
          const v1 = item.variation || {};
          const v2 = variation || {};

          const normalize = v =>
            String(v ?? '').trim().toLowerCase();

          const sameVariation =
            normalize(v1.color) === normalize(v2.color) &&
            normalize(v1.size) === normalize(v2.size);

          if (!sameVariation) return;
        }

        delete newCart[cartItemId];
      });

      return recalculateCartPrices(newCart, userRole);
    });
  }, [userRole]);

  const clearCart = useCallback(() => setCart({}), []);

  useEffect(() => {
    setCart(prev =>
      Object.keys(prev).length > 0
        ? recalculateCartPrices(prev, userRole)
        : prev
    );
  }, [userRole]);

  const contextValue = {
    cart,
    addToCart,
    removeFromCart,
    removeItemFromCart, // 🔥 EXPOSED
    getCartTotal,
    clearCart,
    checkMinOrderValue,
  };

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
