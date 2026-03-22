import React, { useEffect, useState } from "react";
import {
    collection,
    getDocs,
    doc,
    getDoc,
    setDoc,
    query,
    orderBy,
    writeBatch,
} from "firebase/firestore";

import { getAuth } from "firebase/auth";
import { db } from "../../firebase";

const DropshipperProducts = () => {

    const auth = getAuth();

    /* ===============================
    STATE
    ================================ */

    const [currentUser, setCurrentUser] = useState(null);
    const [pricingKey, setPricingKey] = useState(null);

    const [collections, setCollections] = useState([]);
    const [subcollections, setSubcollections] = useState([]);
    const [products, setProducts] = useState([]);

    const [selectedCollection, setSelectedCollection] = useState("");
    const [selectedSubcollection, setSelectedSubcollection] = useState("");

    const [baseTiers, setBaseTiers] = useState([]);
    const [sellerTiers, setSellerTiers] = useState([]);

    const [enabledProducts, setEnabledProducts] = useState({});
    const [loading, setLoading] = useState(false);


    /* ===============================
    GET CURRENT USER
    ================================ */

    useEffect(() => {

        const unsubscribe = auth.onAuthStateChanged(user => {
            if (user) {
                setCurrentUser(user);
            }
        });

        return () => unsubscribe();

    }, []);


    /* ===============================
    LOAD USER PRICING KEY
    ================================ */

    useEffect(() => {

        if (!currentUser) return;

        const loadUser = async () => {

            const snap = await getDoc(doc(db, "users", currentUser.uid));

            if (!snap.exists()) return;

            setPricingKey(snap.data()?.pricingKey);

        };

        loadUser();

    }, [currentUser]);


    /* ===============================
    LOAD COLLECTIONS
    ================================ */

    useEffect(() => {

        const loadCollections = async () => {

            const snap = await getDocs(collection(db, "collections"));

            setCollections(
                snap.docs.map(d => ({
                    id: d.id,
                    ...d.data()
                }))
            );

        };

        loadCollections();

    }, []);


    /* ===============================
    LOAD SUBCOLLECTIONS
    ================================ */

    useEffect(() => {

        if (!selectedCollection) return;

        const loadSubcollections = async () => {

            const snap = await getDocs(
                collection(
                    db,
                    "collections",
                    selectedCollection,
                    "subcollections"
                )
            );

            setSubcollections(
                snap.docs.map(d => ({
                    id: d.id,
                    ...d.data()
                }))
            );

        };

        loadSubcollections();

    }, [selectedCollection]);


    /* ===============================
    LOAD PRICING
    ================================ */

    useEffect(() => {

        if (!selectedCollection || !selectedSubcollection || !pricingKey || !currentUser) return;

        const loadPricing = async () => {

            try {

                const subRef = doc(
                    db,
                    "collections",
                    selectedCollection,
                    "subcollections",
                    selectedSubcollection
                );

                const sellerRef = doc(
                    db,
                    "dropshipperPricing",
                    currentUser.uid,
                    "pricing",
                    `${selectedCollection}_${selectedSubcollection}`
                );

                const [subSnap, sellerSnap] = await Promise.all([
                    getDoc(subRef),
                    getDoc(sellerRef)
                ]);

                if (!subSnap.exists()) return;

                const subData = subSnap.data();

                const tiers = subData?.tieredPricing?.[pricingKey] || [];

                /* BASE = COST PRICE */

                const cleanedBase = tiers.map(t => ({
                    min_quantity: Number(t.min_quantity),
                    max_quantity: Number(t.max_quantity),
                    costPrice: Number(t.price)
                }));

                setBaseTiers(cleanedBase);

                /* LOAD SELLER DATA */

                if (sellerSnap.exists()) {

                    const data = sellerSnap.data()?.tieredPricing || [];

                    setSellerTiers(
                        data.map(t => ({
                            min_quantity: Number(t.min_quantity),
                            max_quantity: Number(t.max_quantity),
                            costPrice: Number(t.costPrice ?? t.price ?? 0),
                            price: Number(t.price ?? t.costPrice ?? 0)
                        }))
                    );

                } else {

                    setSellerTiers(
                        cleanedBase.map(t => ({
                            ...t,
                            price: t.costPrice
                        }))
                    );

                }

            } catch (err) {
                console.error("Pricing load error", err);
            }

        };

        loadPricing();

    }, [selectedCollection, selectedSubcollection, pricingKey, currentUser]);


    /* ===============================
    LOAD PRODUCTS
    ================================ */

    useEffect(() => {

        if (!selectedCollection || !selectedSubcollection) return;

        const loadProducts = async () => {

            setLoading(true);

            try {

                const ref = collection(
                    db,
                    "collections",
                    selectedCollection,
                    "subcollections",
                    selectedSubcollection,
                    "products"
                );

                const q = query(ref, orderBy("productCode"));

                const snap = await getDocs(q);

                setProducts(
                    snap.docs.map(d => ({
                        id: d.id,
                        ...d.data()
                    }))
                );

            } catch (err) {
                console.error(err);
            }

            setLoading(false);

        };

        loadProducts();

    }, [selectedCollection, selectedSubcollection]);


    /* ===============================
    LOAD ENABLED PRODUCTS
    ================================ */

    useEffect(() => {

        if (!currentUser) return;

        const loadEnabled = async () => {

            const snap = await getDocs(
                collection(
                    db,
                    "dropshipperProducts",
                    currentUser.uid,
                    "products"
                )
            );

            const map = {};

            snap.docs.forEach(d => {
                const data = d.data();
                map[data.productId] = data.enabled;
            });

            setEnabledProducts(map);

        };

        loadEnabled();

    }, [currentUser]);


    /* ===============================
    TOGGLE PRODUCT
    ================================ */

   const toggleProduct = async (product) => {

if (!currentUser) return;

try {

const newValue = !enabledProducts[product.id];

/* Update UI immediately */

setEnabledProducts(prev => ({
...prev,
[product.id]: newValue
}));

/* Use batch for atomic update */

const batch = writeBatch(db);

/* dropshipperProducts */

const dropshipperRef = doc(
db,
"dropshipperProducts",
currentUser.uid,
"products",
product.id
);

batch.set(dropshipperRef,{
productId: product.id,
collectionId: selectedCollection,
subcollectionId: selectedSubcollection,
enabled: newValue,
updatedAt: Date.now()
},{merge:true});


/* storeProducts */

const storeRef = doc(
db,
"storeProducts",
currentUser.uid,
"products",
product.id
);

if(newValue){

batch.set(storeRef,{
productId: product.id,
productName: product.productName,
productCode: product.productCode,
image: product.image,
collectionId: selectedCollection,
subcollectionId: selectedSubcollection,
enabled: true,
updatedAt: Date.now()
},{merge:true});

}else{

batch.set(storeRef,{
enabled:false,
updatedAt: Date.now()
},{merge:true});

}

/* commit both writes together */

await batch.commit();

} catch(err){

console.error("Toggle product failed",err);

}

};


    /* ===============================
    UPDATE SELLER PRICE
    ================================ */

    const updateSellerPrice = (index, value) => {

        const updated = [...sellerTiers];

        updated[index] = {
            ...updated[index],
            price: Number(value)
        };

        setSellerTiers(updated);

    };


    /* ===============================
    SAVE PRICING
    ================================ */

    const savePricing = async () => {

        if (!currentUser) return;

        try {

            /* -----------------------------
            SAVE PRICING CONFIG
            ------------------------------*/

            const pricingRef = doc(
                db,
                "dropshipperPricing",
                currentUser.uid,
                "pricing",
                `${selectedCollection}_${selectedSubcollection}`
            );

            await setDoc(pricingRef, {
                collectionId: selectedCollection,
                subcollectionId: selectedSubcollection,
                pricingKey,
                tieredPricing: sellerTiers,
                updatedAt: Date.now()
            }, { merge: true });


            /* -----------------------------
            UPDATE STORE PRODUCTS
            ONLY ENABLED PRODUCTS
            ------------------------------*/

            const enabledList = products.filter(p => enabledProducts[p.id]);

            if (enabledList.length === 0) {
                alert("Pricing saved successfully");
                return;
            }


            /* -----------------------------
            SAFE BATCHING
            ------------------------------*/

            const commits = [];

            let batch = writeBatch(db);
            let operationCount = 0;

            for (const product of enabledList) {

                const ref = doc(
                    db,
                    "storeProducts",
                    currentUser.uid,
                    "products",
                    product.id
                );

                batch.set(ref, {
                    tieredPricing: sellerTiers,
                    updatedAt: Date.now()
                }, { merge: true });

                operationCount++;


                /* Firestore limit protection */

                if (operationCount === 450) {

                    commits.push(batch.commit());

                    batch = writeBatch(db);
                    operationCount = 0;

                }

            }

            /* commit remaining */

            if (operationCount > 0) {
                commits.push(batch.commit());
            }

            await Promise.all(commits);


            alert("Pricing saved successfully");

        } catch (err) {

            console.error("Pricing save failed", err);
            alert("Failed to save pricing");

        }

    };
    const toggleAllProducts = async () => {

if(!currentUser) return;

const allEnabled = products.every(p => enabledProducts[p.id]);
const newValue = !allEnabled;

const updates = {};

const commits = [];
let batch = writeBatch(db);
let opCount = 0;

for(const product of products){

updates[product.id] = newValue;

/* dropshipperProducts */

const ref = doc(
db,
"dropshipperProducts",
currentUser.uid,
"products",
product.id
);

batch.set(ref,{
productId:product.id,
collectionId:selectedCollection,
subcollectionId:selectedSubcollection,
enabled:newValue,
updatedAt:Date.now()
},{merge:true});

opCount++;


/* storeProducts */

const storeRef = doc(
db,
"storeProducts",
currentUser.uid,
"products",
product.id
);

if(newValue){

batch.set(storeRef,{
productId:product.id,
productName:product.productName,
productCode:product.productCode,
image:product.image,
collectionId:selectedCollection,
subcollectionId:selectedSubcollection,
enabled:true,
updatedAt:Date.now()
},{merge:true});

}else{

batch.set(storeRef,{
enabled:false
},{merge:true});

}

opCount++;


/* protect batch limit */

if(opCount >= 450){

commits.push(batch.commit());

batch = writeBatch(db);
opCount = 0;

}

}

if(opCount > 0){
commits.push(batch.commit());
}

await Promise.all(commits);

setEnabledProducts(prev=>({
...prev,
...updates
}));

};


    /* ===============================
    UI
    ================================ */

    return (

        <div style={{ padding: "30px" }}>

            <h2>Dropshipper Subcollection Pricing</h2>

            {pricingKey && (

                <div style={{ marginBottom: "20px" }}>

                    <label>Pricing Type</label>

                    <select disabled value={pricingKey}>
                        <option value="retail">Retail</option>
                        <option value="wholesale">Wholesale</option>
                        <option value="dealer">Dealer</option>
                        <option value="distributor">Distributor</option>
                        <option value="vip">VIP</option>
                    </select>

                </div>

            )}

            <select
                value={selectedCollection}
                onChange={(e) => {
                    setSelectedCollection(e.target.value);
                    setSelectedSubcollection("");
                    setProducts([]);
                    setSellerTiers([]);
                    setBaseTiers([]);
                }}
            >

                <option value="">Select Collection</option>

                {collections.map(c => (
                    <option key={c.id} value={c.id}>
                        {c.title}
                    </option>
                ))}

            </select>


            <select
                value={selectedSubcollection}
                onChange={(e) => setSelectedSubcollection(e.target.value)}
                disabled={!selectedCollection}
            >

                <option value="">Select Subcollection</option>

                {subcollections.map(s => (
                    <option key={s.id} value={s.id}>
                        {s.name}
                    </option>
                ))}

            </select>


            {sellerTiers.length > 0 && (

                <div style={{ marginTop: "30px" }}>

                    <h3>Pricing Tiers</h3>

                    <table border="1" cellPadding="10">

                        <thead>
                            <tr>
                                <th>Qty Range</th>
                                <th>Cost Price</th>
                                <th>Selling Price</th>
                            </tr>
                        </thead>

                        <tbody>

                            {sellerTiers.map((tier, index) => (

                                <tr key={index}>

                                    <td>{tier.min_quantity} - {tier.max_quantity}</td>

                                    <td>₹{tier.costPrice}</td>

                                    <td>
                                        <input
                                            type="number"
                                            value={tier.price}
                                            onChange={(e) => updateSellerPrice(index, e.target.value)}
                                        />
                                    </td>

                                </tr>

                            ))}

                        </tbody>

                    </table>

                    <button
                        style={{ marginTop: "20px" }}
                        onClick={savePricing}
                    >
                        Save Pricing
                    </button>

                </div>

            )}


            {loading && <p>Loading products...</p>}
            {products.length > 0 && (

                <div style={{ marginTop: "20px" }}>

                    <button onClick={toggleAllProducts}>

                        {products.every(p => enabledProducts[p.id])
                            ? "Disable All Products"
                            : "Enable All Products"}

                    </button>

                </div>

            )}

            {products.length > 0 && (

                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
                    gap: "20px",
                    marginTop: "30px"
                }}>

                    {products.map(p => (

                        <div key={p.id} style={{
                            border: "1px solid #ddd",
                            padding: "10px",
                            borderRadius: "10px"
                        }}>

                            <img
                                src={p.image}
                                alt={p.productName}
                                style={{
                                    width: "100%",
                                    height: "140px",
                                    objectFit: "cover"
                                }}
                            />

                            <h4>{p.productName}</h4>

                            <p>{p.productCode}</p>

                            <p style={{ fontSize: "13px", color: "#666" }}>
                                Stock: {p.quantity ?? 0}
                            </p>

                            <label style={{
                                display: "flex",
                                gap: "8px",
                                marginTop: "10px"
                            }}>

                                <input
                                    type="checkbox"
                                    checked={enabledProducts[p.id] || false}
                                    onChange={() => toggleProduct(p)}
                                />

                                Show in my store

                            </label>

                        </div>

                    ))}

                </div>

            )}

        </div>

    );

};

export default DropshipperProducts;