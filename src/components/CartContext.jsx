import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
} from 'react';
import { useAuth } from './AuthContext';
import { getRoleConfig } from '../config/roles';

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

const recalculateCartPrices = (currentCart, pricingKey) => {
  const newCart = { ...currentCart };
  const pricingGroups = {};

  for (const cartItemId in newCart) {
    const item = newCart[cartItemId];
    if (!item.tieredPricing) continue;

    const roleTiers = item.tieredPricing[pricingKey];
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
    const newPrice = getPriceForQuantity(
      group.tiers,
      group.totalQuantity
    );

    group.cartItemIds.forEach((id) => {
      newCart[id].price = newPrice;
    });
  }

  return newCart;
};

/* =======================
   Provider
======================= */

export const CartProvider = ({ children }) => {
  const { roleConfig } = useAuth();
  const pricingKey = roleConfig?.pricingKey || 'retail';
  const minOrderValue = roleConfig?.minOrderValue || 0;

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

  /* =======================
     TOTAL
  ======================= */

  const getCartTotal = useCallback(() => {
    return Object.values(cart).reduce(
      (sum, item) => sum + Number(item.price || 0) * item.quantity,
      0
    );
  }, [cart]);

  /* =======================
     MIN ORDER CHECK (ROLE BASED)
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

        return recalculateCartPrices(updatedCart, pricingKey);
      });
    },
    [pricingKey]
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

        return recalculateCartPrices(newCart, pricingKey);
      });
    },
    [pricingKey]
  );

  /* =======================
     REMOVE FULL ITEM (Checkout fix)
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

        return recalculateCartPrices(newCart, pricingKey);
      });
    },
    [pricingKey]
  );

  const clearCart = useCallback(() => setCart({}), []);

  /* =======================
     REPRICE ON ROLE CHANGE
  ======================= */

  useEffect(() => {
    setCart((prev) =>
      Object.keys(prev).length > 0
        ? recalculateCartPrices(prev, pricingKey)
        : prev
    );
  }, [pricingKey]);

  const contextValue = {
    cart,
    addToCart,
    removeFromCart,
    removeItemFromCart,
    getCartTotal,
    clearCart,
    checkMinOrderValue,
    pricingKey, // 🔥 exposed
  };

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
