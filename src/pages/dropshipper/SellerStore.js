import React, { useEffect, useState, useMemo } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  onSnapshot
} from "firebase/firestore";

import { db } from "../../firebase";
import { Link, useLocation } from "react-router-dom";

import ProductCard from "../../components/ProductCard";
import { useStoreCart } from "../store/StoreCartContext";
import { getCleanDomain } from "../../utils/domain";
const SellerStore = () => {

  const location = useLocation();

  const { cart, addToCart, removeFromCart, cartItemsCount } = useStoreCart();

  /* ===============================
  STATE
  =============================== */

  const [seller, setSeller] = useState(null);
  const [products, setProducts] = useState([]);

  const [collections, setCollections] = useState([]);
  const [subcollectionsMap, setSubcollectionsMap] = useState({});

  const [selectedCollection, setSelectedCollection] = useState("");
  const [selectedSubcollection, setSelectedSubcollection] = useState("");

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("default");

  /* ===============================
  NAVIGATION DATA
  =============================== */

  const initialCollection =
    location.state?.collectionId ||
    localStorage.getItem("selectedCollection") ||
    "";

  const passedDomain =
    location.state?.storeDomain || getCleanDomain();

  /* ===============================
  LOAD STORE
  =============================== */

  useEffect(() => {

    let inventoryListeners = [];

    const loadStore = async () => {
      try {
        setLoading(true);

        /* ===============================
        FIND SELLER (DOMAIN BASED)
        =============================== */

        const sellerSnap = await getDocs(
          query(
            collection(db, "users"),
            where("storeDomain", "==", passedDomain)
          )
        );

        if (sellerSnap.empty) {
          setLoading(false);
          return;
        }

        const sellerDoc = sellerSnap.docs[0];
        const sellerId = sellerDoc.id;

        setSeller({
          id: sellerId,
          ...sellerDoc.data()
        });

        /* ===============================
        LOAD PRICING
        =============================== */

        const pricingSnap = await getDocs(
          collection(db, "dropshipperPricing", sellerId, "pricing")
        );

        const pricingMap = {};

        pricingSnap.docs.forEach(d => {
          pricingMap[d.id] = d.data();
        });

        /* ===============================
        LOAD PRODUCTS
        =============================== */

        const storeSnap = await getDocs(
          collection(db, "storeProducts", sellerId, "products")
        );

        let storeProducts = storeSnap.docs
          .map(d => ({
            id: d.id,
            ...d.data()
          }))
          .filter(p => p.enabled);

        /* ===============================
        APPLY PRICING
        =============================== */

        storeProducts = storeProducts.map(p => {

          const pricingKey = `${p.collectionId}_${p.subcollectionId}`;
          const tiers = pricingMap[pricingKey]?.tieredPricing || [];

          const normalized = tiers.map(t => ({
            min_quantity: Number(t.min_quantity),
            max_quantity: Number(t.max_quantity),
            price: Number(t.price),
            costPrice: Number(t.costPrice ?? 0)
          }));

          return {
            ...p,
            sellerId,

            tieredPricing: {
              retail: normalized,
              wholesale: normalized,
              dealer: normalized,
              distributor: normalized,
              vip: normalized
            }
          };
        });

        setProducts(storeProducts);

        /* ===============================
        LIVE INVENTORY
        =============================== */

        storeProducts.forEach(p => {

          const ref = doc(
            db,
            "collections",
            p.collectionId,
            "subcollections",
            p.subcollectionId,
            "products",
            p.productId
          );

          const unsub = onSnapshot(ref, (snap) => {
            if (!snap.exists()) return;

            const data = snap.data();

            setProducts(prev =>
  prev.map(prod => {

    if (prod.productId !== p.productId) return prod;

    /* Variant products */

    if (data.variations && data.variations.length > 0) {

      const totalStock = data.variations.reduce(
        (sum,v)=> sum + Number(v.quantity || 0),
        0
      );

      return {
        ...prod,
        variations: data.variations,
        quantity: totalStock
      };

    }

    /* Normal product */

    return {
      ...prod,
      quantity: data.quantity ?? 0
    };

  })
);
          });

          inventoryListeners.push(unsub);
        });

        /* ===============================
        COLLECTION DETECTION
        =============================== */

        const collectionsSet = {};
        const subMap = {};

        storeProducts.forEach(p => {

          collectionsSet[p.collectionId] = true;

          if (!subMap[p.collectionId]) {
            subMap[p.collectionId] = new Set();
          }

          subMap[p.collectionId].add(p.subcollectionId);
        });

        /* ===============================
        LOAD COLLECTIONS
        =============================== */

        const collectionsSnap = await getDocs(collection(db, "collections"));

        const validCollections = collectionsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => collectionsSet[c.id]);

        setCollections(validCollections);

        /* ===============================
        LOAD SUBCOLLECTIONS
        =============================== */

        const finalSubMap = {};

        for (const colId in subMap) {
          const snap = await getDocs(
            collection(db, "collections", colId, "subcollections")
          );

          finalSubMap[colId] = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(s => subMap[colId].has(s.id));
        }

        setSubcollectionsMap(finalSubMap);

        /* ===============================
        AUTO SELECT (FROM CLICK)
        =============================== */

        if (validCollections.length) {

          let selectedCol = initialCollection;

          if (!selectedCol || !finalSubMap[selectedCol]) {
            selectedCol = validCollections[0].id;
          }

          const firstSub = finalSubMap[selectedCol]?.[0]?.id || "";

          setSelectedCollection(selectedCol);
          setSelectedSubcollection(firstSub);
        }

      } catch (err) {
        console.error("Store load error:", err);
      }

      setLoading(false);
    };

    loadStore();

    return () => {
      inventoryListeners.forEach(unsub => unsub());
    };

  }, []);

  /* ===============================
  SAVE SELECTION (REFRESH SAFE)
  =============================== */

  useEffect(() => {
    if (selectedCollection) {
      localStorage.setItem("selectedCollection", selectedCollection);
    }
  }, [selectedCollection]);
  const getTierPrice = (tiers, quantity) => {

  if (!tiers || tiers.length === 0) return 0;

  let selected = tiers[0];

  for (const tier of tiers) {

    const min = Number(tier.min_quantity);
    const max = Number(tier.max_quantity) || Infinity;

    if (quantity >= min && quantity <= max) {
      selected = tier;
    }
  }

  return Number(selected.price);
};

  /* ===============================
  FILTER PRODUCTS
  =============================== */

  const filteredProducts = useMemo(() => {

  let list = [...products];

  if (selectedCollection) {
    list = list.filter(p => p.collectionId === selectedCollection);
  }

  if (selectedSubcollection) {
    list = list.filter(p => p.subcollectionId === selectedSubcollection);
  }

  if (search) {
    const term = search.toLowerCase();

    list = list.filter(p =>
      p.productName?.toLowerCase().includes(term) ||
      p.productCode?.toLowerCase().includes(term)
    );
  }

  return list.map(product => {

    const tiers = product.tieredPricing?.retail ?? [];

    const subQty = Object.values(cart).reduce((sum,item)=>{
      if(item.subcollectionId === product.subcollectionId){
        return sum + item.quantity;
      }
      return sum;
    },0);

    const price = getTierPrice(tiers, subQty || 1);

    return {
      ...product,
      displayPrice: price
    };

  });

}, [products, selectedCollection, selectedSubcollection, search, cart]);
  /* ===============================
  UI
  =============================== */

  if (!seller && loading) {
    return <p style={{ padding: "40px" }}>Loading store...</p>;
  }

  if (!seller) {
    return <p style={{ padding: "40px" }}>Store not found</p>;
  }

  return (
    <div className="products-page-container">

      <h1>{seller.name}'s Store</h1>

      {/* FILTERS */}
      <div className="product-controls">

        <select
          value={selectedCollection}
          onChange={(e) => {
            const col = e.target.value;
            setSelectedCollection(col);
            setSelectedSubcollection(
              subcollectionsMap[col]?.[0]?.id || ""
            );
          }}
        >
          {collections.map(c => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>

        <select
          value={selectedSubcollection}
          onChange={(e) => setSelectedSubcollection(e.target.value)}
        >
          {subcollectionsMap[selectedCollection]?.map(sub => (
            <option key={sub.id} value={sub.id}>
              {sub.name}
            </option>
          ))}
        </select>

        <input
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

      </div>

      {/* PRODUCTS */}
      <div className="products-grid collections-grid">

        {filteredProducts.map(product => (
          <ProductCard
            key={product.id}
            product={product}
            onIncrement={addToCart}
            onDecrement={(cartId) => removeFromCart(cartId)}
            cart={cart}
          />
        ))}

      </div>

      {/* CART */}
      {cartItemsCount > 0 && (
        <div className="view-cart-fixed-container">
          <Link to="/store/cart" className="view-cart-btn-overlay">
            {cartItemsCount} items - View Cart
          </Link>
        </div>
      )}

    </div>
  );
};

export default SellerStore;