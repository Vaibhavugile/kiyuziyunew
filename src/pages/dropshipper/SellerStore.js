import React, { useEffect, useState, useMemo } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  onSnapshot,
  getDoc,
  limit,
  startAfter
} from "firebase/firestore";

import { db } from "../../firebase";
import { Link, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { FaShoppingCart, FaArrowLeft, FaFilter, FaTimes, FaSpinner, FaDownload } from 'react-icons/fa';

import StoreProductCard from "../../components/StoreProductCard";
import { useStoreCart } from "../store/StoreCartContext";
import { getCleanDomain } from "../../utils/domain";
const SellerStore = () => {

  const location = useLocation();
const [homepage, setHomepage] = useState(null);
  const { cart, addToCart, removeFromCart, cartItemsCount } = useStoreCart();
  const [isControlsVisible, setIsControlsVisible] = useState(false);

  /* ===============================
  STATE
  =============================== */

  const [seller, setSeller] = useState(null);
  const [products, setProducts] = useState([]);
const [lastDoc, setLastDoc] = useState(null);
const [hasMore, setHasMore] = useState(true);
  const [collections, setCollections] = useState([]);
  const [subcollectionsMap, setSubcollectionsMap] = useState({});
 const initialCollection =
    location.state?.collectionId ||
    localStorage.getItem("selectedCollection") ||
    "";
const [selectedCollection, setSelectedCollection] = useState(initialCollection || "");
  const [selectedSubcollection, setSelectedSubcollection] = useState("");

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("default");

  /* ===============================
  NAVIGATION DATA
  =============================== */

 

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
      setProducts([]);
setLastDoc(null);
setHasMore(true);

      console.log("STORE LOADING...");

      /* ===============================
      FIND SELLER (DOMAIN BASED)
      =============================== */

      const domain = getCleanDomain();

      const homepageRef = doc(db, "storeHomepages", domain);
      const homepageSnap = await getDoc(homepageRef);

      if (homepageSnap.exists()) {
        setHomepage(homepageSnap.data());
      }

      const sellerSnap = await getDocs(
        query(
          collection(db, "users"),
          where("storeDomain", "==", passedDomain)
        )
      );

      if (sellerSnap.empty) {
        console.log("Seller not found");
        setLoading(false);
        return;
      }

      const sellerDoc = sellerSnap.docs[0];
      const sellerId = sellerDoc.id;

      setSeller({
        id: sellerId,
        ...sellerDoc.data()
      });

      console.log("Seller ID:", sellerId);

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

      console.log("Pricing loaded:", Object.keys(pricingMap).length);

      /* ===============================
      LOAD PRODUCTS (PAGINATED)
      =============================== */

      const baseRef = collection(db, "storeProducts", sellerId, "products");

      let q;

      if (selectedSubcollection) {

        q = query(
          baseRef,
          where("collectionId", "==", selectedCollection),
          where("subcollectionId", "==", selectedSubcollection),
          where("enabled", "==", true),
          limit(24)
        );

      } else {

        q = query(
          baseRef,
          where("collectionId", "==", selectedCollection),
          where("enabled", "==", true),
          limit(24)
        );

      }

      const storeSnap = await getDocs(q);

      console.log("FIRST QUERY DOC COUNT:", storeSnap.docs.length);
      console.log("FIRST QUERY IDS:", storeSnap.docs.map(d => d.id));

      /* ===============================
      PAGINATION TRACKING
      =============================== */

      if (!storeSnap.empty) {

        const last = storeSnap.docs[storeSnap.docs.length - 1];

        console.log("LAST DOC SET:", last.id);

        setLastDoc(last);

      }

      if (storeSnap.docs.length < 24) {

        console.log("LESS THAN LIMIT → NO MORE PRODUCTS");

        setHasMore(false);

      } else {

        setHasMore(true);

      }

      /* ===============================
      MAP PRODUCTS
      =============================== */

      let storeProducts = storeSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

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

      console.log("PRODUCTS AFTER PRICING:", storeProducts.length);

      setProducts(storeProducts);

      /* ===============================
      LIVE INVENTORY LISTENERS
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

      console.log("Collections loaded:", validCollections.length);

    } catch (err) {

      console.error("Store load error:", err);

    }

    setLoading(false);

  };

  loadStore();

  return () => {
    inventoryListeners.forEach(unsub => unsub());
  };
}, [selectedCollection, selectedSubcollection]);


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

const loadMoreProducts = async () => {

  try {

    if (!lastDoc) return;
    if (!seller?.id) return;

    const baseRef = collection(db, "storeProducts", seller.id, "products");

    let q;

    if (selectedSubcollection) {
      q = query(
        baseRef,
        where("collectionId", "==", selectedCollection),
        where("subcollectionId", "==", selectedSubcollection),
        where("enabled", "==", true),
        startAfter(lastDoc),
        limit(24)
      );
    } else {
      q = query(
        baseRef,
        where("collectionId", "==", selectedCollection),
        where("enabled", "==", true),
        startAfter(lastDoc),
        limit(24)
      );
    }

    const snap = await getDocs(q);

    if (snap.empty) {
      setHasMore(false);
      return;
    }

    let newProducts = snap.docs.map(d => ({
  id: d.id,
  ...d.data()
}));

/* ===============================
LOAD PRICING (same as loadStore)
=============================== */

const pricingSnap = await getDocs(
  collection(db, "dropshipperPricing", seller.id, "pricing")
);

const pricingMap = {};

pricingSnap.docs.forEach(d => {
  pricingMap[d.id] = d.data();
});

/* ===============================
APPLY PRICING
=============================== */

newProducts = newProducts.map(p => {

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
    sellerId: seller.id,
    tieredPricing: {
      retail: normalized,
      wholesale: normalized,
      dealer: normalized,
      distributor: normalized,
      vip: normalized
    }
  };

});

    /* ===============================
       ATTACH INVENTORY LISTENERS
    =============================== */

    newProducts.forEach(p => {

      const ref = doc(
        db,
        "collections",
        p.collectionId,
        "subcollections",
        p.subcollectionId,
        "products",
        p.productId
      );

      onSnapshot(ref, (snap) => {

        if (!snap.exists()) return;

        const data = snap.data();

        setProducts(prev =>
          prev.map(prod => {

            if (prod.productId !== p.productId) return prod;

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

            return {
              ...prod,
              quantity: data.quantity ?? 0
            };

          })
        );

      });

    });


    setProducts(prev => [...prev, ...newProducts]);

    const newLastDoc = snap.docs[snap.docs.length - 1];
    setLastDoc(newLastDoc);

    if (snap.docs.length < 24) {
      setHasMore(false);
    }

  } catch (error) {

    console.error("Load more error:", error);

  }

};
  /* ===============================
  FILTER PRODUCTS
  =============================== */

 const filteredProducts = useMemo(() => {

  console.log("------------ FILTER PIPELINE ------------");
  console.log("PRODUCTS IN STATE:", products.length);
  console.log("Selected Collection:", selectedCollection);
  console.log("Selected Subcollection:", selectedSubcollection);

  let list = [...products];

  /* ===============================
  SEARCH FILTER
  =============================== */

  if (search) {

    const term = search.toLowerCase();

    list = list.filter(p =>
      p.productName?.toLowerCase().includes(term) ||
      p.productCode?.toLowerCase().includes(term)
    );

    console.log("AFTER SEARCH FILTER:", list.length);

  }

  /* ===============================
  PRICE CALCULATION
  =============================== */

  const mapped = list.map(product => {

    const tiers = product.tieredPricing?.retail ?? [];

    const subQty = Object.values(cart).reduce((sum, item) => {

      if (item.subcollectionId === product.subcollectionId) {
        return sum + item.quantity;
      }

      return sum;

    }, 0);

    const price = getTierPrice(tiers, subQty || 1);

    return {
      ...product,
      displayPrice: price
    };

  });

  console.log("FINAL PRODUCTS RENDERED:", mapped.length);
  console.log("-----------------------------------------");

  return mapped;

}, [products, search, cart]);
 useEffect(() => {

  if (!window.fbq) return;

  if (filteredProducts.length > 0) {

    window.fbq("track", "ViewContent", {
      content_type: "product_group",
      content_ids: filteredProducts.map(p => p.productId),
      currency: "INR"
    });

  }

}, [filteredProducts]);
  /* ===============================
  UI
  =============================== */

 
const domain = getCleanDomain();

const storeName =
  homepage?.navbar?.brandName || seller?.storeName || "Online Store";

const description =
  homepage?.hero?.subtitle ||
  `Shop premium products from ${storeName}`;

  if (loading) {
  return <p style={{ padding: "40px" }}>Loading store...</p>;
}

  if (!seller) {
    return <p style={{ padding: "40px" }}>Store not found</p>;
  }

  return (
    <div className="products-page-container">
<Helmet>

<title>{storeName}</title>

<meta name="description" content={description} />

<meta property="og:title" content={storeName} />
<meta property="og:description" content={description} />
<meta property="og:type" content="website" />
<meta property="og:url" content={`https://${domain}`} />

<meta
  property="og:image"
  content={homepage?.hero?.images?.[0]?.src || "/default-og.jpg"}
/>

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content={storeName} />
<meta name="twitter:description" content={description} />

<meta
  name="twitter:image"
  content={homepage?.hero?.images?.[0]?.src || "/default-og.jpg"}
/>

</Helmet>
      {/* <h1>{seller.name}'s Store</h1> */}
      <div className="page-header-container">
                <Link
                  to="/"
                  className="back-to-collections-icon"
                  aria-label="Back to Collections"
                >
                  <FaArrowLeft />
                </Link>
      
                <div className="title-and-toggle-wrapper">
      
                  <button
                    className="mobile-controls-toggle"
                    onClick={() => setIsControlsVisible(!isControlsVisible)}
                    aria-label={isControlsVisible ? "Close filters and search" : "Open filters and search"}
                  >
                    {isControlsVisible ? <FaTimes /> : <FaFilter />}
                  </button>
                </div>
              </div>

      {/* FILTERS */}
        <div className={`product-controls ${isControlsVisible ? 'open' : ''}`}>

        <select
          value={selectedCollection}
          onChange={(e) => {
            const col = e.target.value;
            setSelectedCollection(col);
            setSelectedSubcollection("");
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
  <option value="">All</option>

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
          <StoreProductCard
            key={product.id}
            product={product}
            onIncrement={(product) => {

  addToCart(product);

  if (window.fbq) {

    window.fbq("track", "AddToCart", {
      content_name: product.productName,
      content_ids: [product.productId],
      content_type: "product",
      value: product.displayPrice || 0,
      currency: "INR"
    });

  }

}}
            onDecrement={(cartId) => removeFromCart(cartId)}
            cart={cart}
          />
        ))}

      </div>
{hasMore && (
  <div style={{ textAlign: "center", margin: "20px" }}>
    <button onClick={loadMoreProducts} className="load-more-btn">
      Load More
    </button>
  </div>
)}
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