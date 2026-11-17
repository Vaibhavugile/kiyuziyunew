import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  collection, doc, getDocs, runTransaction, serverTimestamp
} from "firebase/firestore";
import { db } from "../../firebase";

const PRODUCTS_COLLECTION = "preorderProducts";
const CATEGORIES_COLLECTION = "preorderCollections";
const ORDERS_COLLECTION = "preorders";
const StoreContext = createContext(null);

export const getProductImage = (product) =>
  product?.mainImage || product?.image || product?.medium || product?.thumbnail || "";

export const getCategoryName = (category) =>
  category?.title || category?.name || category?.categoryName || "Collection";

export const getAvailableBoxes = (product, variantName = "") => {
  if (product?.quantityType === "variants") {
    const variant = (product.variants || []).find((item) => item.name === variantName);
    return Math.max(0, Number(variant?.boxQuantity) || 0);
  }
  return Math.max(0, Number(product?.boxQuantity ?? product?.totalBoxes) || 0);
};

const cartKey = (productId, variantName = "") => `${productId}__${variantName}`;

export function PreorderStoreProvider({ children }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("preorder-premium-cart") || "[]");
    } catch {
      return [];
    }
  });

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const [categorySnapshot, productSnapshot] = await Promise.all([
        getDocs(collection(db, CATEGORIES_COLLECTION)),
        getDocs(collection(db, PRODUCTS_COLLECTION)),
      ]);
      const categoryRows = categorySnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => Number(a.showNumber ?? 9999) - Number(b.showNumber ?? 9999));
      const productRows = productSnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.status === "preorder" && item.categoryId);
      setCategories(categoryRows);
      setProducts(productRows);
    } catch (error) {
      console.error("Unable to load pre-order catalog:", error);
      setCatalogError("We couldn't load the pre-order collections. Please refresh and try again.");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    try {
      sessionStorage.setItem("preorder-premium-cart", JSON.stringify(cart));
    } catch (error) {
      console.warn("Could not persist pre-order cart:", error);
    }
  }, [cart]);

  const addToCart = useCallback((product, variantName, quantity) => {
    const safeQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
    const key = cartKey(product.id, variantName || "");
    const category = categories.find((item) => item.id === product.categoryId);
    const available = getAvailableBoxes(product, variantName || "");
    const existing = cart.find((item) => item.key === key);
    const nextQuantity = (existing?.quantity || 0) + safeQuantity;
    if (nextQuantity > available) {
      throw new Error(`Only ${available} boxes are currently available for this selection.`);
    }
    if (existing) {
      setCart((current) => current.map((item) => item.key === key ? { ...item, quantity: nextQuantity } : item));
      return;
    }
    setCart((current) => [...current, {
      key,
      productId: product.id,
      productName: product.productName || "Pre-order product",
      categoryId: product.categoryId,
      categoryName: product.categoryName || getCategoryName(category),
      quantityType: product.quantityType === "variants" ? "variants" : "boxes",
      variantName: variantName || "",
      quantity: safeQuantity,
      image: getProductImage(product),
    }]);
  }, [categories, cart]);

  const updateCartQuantity = useCallback((key, quantity) => {
    const requestedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));

    setCart((current) => current.map((item) => {
      if (item.key !== key) return item;

      const product = products.find((entry) => entry.id === item.productId);
      if (!product || product.status !== "preorder") {
        return { ...item, quantity: requestedQuantity };
      }

      const available = getAvailableBoxes(product, item.variantName || "");
      return {
        ...item,
        quantity: Math.min(requestedQuantity, Math.max(1, available)),
      };
    }));
  }, [products]);

  const removeFromCart = useCallback((key) => {
    setCart((current) => current.filter((item) => item.key !== key));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const totalBoxes = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const value = useMemo(() => ({
    categories, products, catalogLoading, catalogError, cart, totalBoxes,
    addToCart, updateCartQuantity, removeFromCart, clearCart, reloadCatalog: loadCatalog,
  }), [categories, products, catalogLoading, catalogError, cart, totalBoxes,
    addToCart, updateCartQuantity, removeFromCart, clearCart, loadCatalog]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function usePreorderStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Preorder pages must be wrapped in PreorderStoreProvider.");
  return value;
}

export async function createPreorderOrder({ cart, customer }) {
  if (!cart?.length) throw new Error("Your pre-order cart is empty.");

  const orderRef = doc(collection(db, ORDERS_COLLECTION));
  const orderNumber = `PRE-${Date.now().toString().slice(-8)}`;
  const productRefs = new Map();

  for (const item of cart) {
    if (!productRefs.has(item.productId)) {
      productRefs.set(item.productId, doc(db, PRODUCTS_COLLECTION, item.productId));
    }
  }

  await runTransaction(db, async (transaction) => {
    const productSnapshots = new Map();

    // Firestore requires every transaction read to happen before any write.
    for (const [productId, productRef] of productRefs.entries()) {
      productSnapshots.set(productId, await transaction.get(productRef));
    }

    const stockUpdates = [];
    for (const [productId, snapshot] of productSnapshots.entries()) {
      const requestedItems = cart.filter((item) => item.productId === productId);
      if (!snapshot.exists()) {
        throw new Error(`${requestedItems[0]?.productName || "A selected product"} is no longer available.`);
      }

      const product = snapshot.data();
      if (product.status !== "preorder") {
        throw new Error(`${product.productName || "A selected product"} is no longer available for pre-order.`);
      }

      if (product.quantityType === "variants") {
        const variants = [...(product.variants || [])];
        for (const item of requestedItems) {
          const index = variants.findIndex((variant) => variant.name === item.variantName);
          if (index < 0) throw new Error(`${item.productName}: the selected variant is no longer available.`);
          const available = Math.max(0, Number(variants[index].boxQuantity) || 0);
          if (item.quantity > available) {
            throw new Error(`${item.productName} (${item.variantName}): only ${available} boxes are available now.`);
          }
          variants[index] = { ...variants[index], boxQuantity: available - item.quantity };
        }
        stockUpdates.push({
          ref: productRefs.get(productId),
          data: {
            variants,
            totalBoxes: variants.reduce((sum, variant) => sum + (Number(variant.boxQuantity) || 0), 0),
            updatedAt: serverTimestamp(),
          },
        });
      } else {
        const requested = requestedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        const available = Math.max(0, Number(product.boxQuantity ?? product.totalBoxes) || 0);
        if (requested > available) {
          throw new Error(`${product.productName || "A selected product"}: only ${available} boxes are available now.`);
        }
        stockUpdates.push({
          ref: productRefs.get(productId),
          data: { boxQuantity: available - requested, totalBoxes: available - requested, updatedAt: serverTimestamp() },
        });
      }
    }

    stockUpdates.forEach((update) => transaction.update(update.ref, update.data));
    transaction.set(orderRef, {
      orderNumber,
      status: "placed",
      customer: {
        name: customer.name.trim(),
        phone: customer.phone.trim(),
        email: customer.email.trim(),
        address: customer.address.trim(),
        city: customer.city.trim(),
        state: customer.state.trim(),
        pincode: customer.pincode.trim(),
      },
      items: cart.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        quantityType: item.quantityType,
        variantName: item.variantName || "",
        boxQuantity: Number(item.quantity),
        image: item.image || "",
      })),
      totalBoxes: cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      paymentRequired: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return { id: orderRef.id, orderNumber };
}
