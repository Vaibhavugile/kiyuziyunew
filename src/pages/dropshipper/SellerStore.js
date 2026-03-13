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
import { useParams, Link } from "react-router-dom";

import ProductCard from "../../components/ProductCard";
import { useStoreCart } from "../store/StoreCartContext";

const SellerStore = () => {

const { slug } = useParams();

const { cart, addToCart, removeFromCart, cartItemsCount } = useStoreCart();

/* ===============================
STATE
=============================== */

const [seller,setSeller] = useState(null);
const [products,setProducts] = useState([]);

const [collections,setCollections] = useState([]);
const [subcollectionsMap,setSubcollectionsMap] = useState({});

const [selectedCollection,setSelectedCollection] = useState("");
const [selectedSubcollection,setSelectedSubcollection] = useState("");

const [loading,setLoading] = useState(true);

const [search,setSearch] = useState("");
const [sortBy,setSortBy] = useState("default");


/* ===============================
LOAD STORE
=============================== */

useEffect(()=>{

if(!slug) return;

let inventoryListeners = [];

const loadStore = async()=>{

try{

setLoading(true);

console.log("Loading store for slug:", slug);

/* ===============================
FIND SELLER
=============================== */

const sellerSnap = await getDocs(
query(collection(db,"users"),where("storeSlug","==",slug))
);

if(sellerSnap.empty){

console.warn("Store not found for slug:",slug);

setLoading(false);
return;

}

const sellerDoc = sellerSnap.docs[0];
const sellerId = sellerDoc.id;

console.log("Seller found:",sellerId);

setSeller({
id:sellerId,
...sellerDoc.data()
});


/* ===============================
LOAD PRICING
=============================== */

const pricingSnap = await getDocs(
collection(db,"dropshipperPricing",sellerId,"pricing")
);

const pricingMap = {};

pricingSnap.docs.forEach(d=>{
pricingMap[d.id] = d.data();
});


/* ===============================
LOAD STORE PRODUCTS
=============================== */

const storeSnap = await getDocs(
collection(db,"storeProducts",sellerId,"products")
);

let storeProducts = storeSnap.docs
.map(d=>({
id:d.id,
...d.data()
}))
.filter(p=>p.enabled);


/* ===============================
APPLY PRICING
=============================== */

storeProducts = storeProducts.map(p=>{

const pricingKey = `${p.collectionId}_${p.subcollectionId}`;

const tiers = pricingMap[pricingKey]?.tieredPricing || [];

const normalized = tiers.map(t=>({
min_quantity:Number(t.min_quantity),
max_quantity:Number(t.max_quantity),
price:Number(t.price)
}));

return{
...p,
sellerId:sellerId, // ⭐ IMPORTANT
tieredPricing:{
retail:normalized,
wholesale:normalized,
dealer:normalized,
distributor:normalized,
vip:normalized
}
};

});

setProducts(storeProducts);


/* ===============================
LIVE INVENTORY
=============================== */

storeProducts.forEach(p=>{

const ref = doc(
db,
"collections",
p.collectionId,
"subcollections",
p.subcollectionId,
"products",
p.productId
);

const unsub = onSnapshot(ref,(snap)=>{

if(!snap.exists()) return;

const data = snap.data();

setProducts(prev =>
prev.map(prod =>
prod.productId === p.productId
? { ...prod, quantity:data.quantity }
: prod
)
);

});

inventoryListeners.push(unsub);

});


/* ===============================
DETECT COLLECTIONS
=============================== */

const collectionsSet = {};
const subMap = {};

storeProducts.forEach(p=>{

collectionsSet[p.collectionId] = true;

if(!subMap[p.collectionId]){
subMap[p.collectionId] = new Set();
}

subMap[p.collectionId].add(p.subcollectionId);

});


/* ===============================
LOAD COLLECTION TITLES
=============================== */

const collectionsSnap = await getDocs(collection(db,"collections"));

const validCollections = collectionsSnap.docs
.map(d=>({id:d.id,...d.data()}))
.filter(c=>collectionsSet[c.id]);

setCollections(validCollections);


/* ===============================
LOAD SUBCOLLECTIONS
=============================== */

const finalSubMap = {};

for(const colId in subMap){

const snap = await getDocs(
collection(db,"collections",colId,"subcollections")
);

finalSubMap[colId] = snap.docs
.map(d=>({id:d.id,...d.data()}))
.filter(s=>subMap[colId].has(s.id));

}

setSubcollectionsMap(finalSubMap);


/* ===============================
AUTO SELECT
=============================== */

if(validCollections.length){

const firstCol = validCollections[0].id;
const firstSub = finalSubMap[firstCol]?.[0]?.id;

setSelectedCollection(firstCol);
setSelectedSubcollection(firstSub);

}

}catch(err){

console.error("Store load error:",err);

}

setLoading(false);

};

loadStore();

/* CLEANUP LISTENERS */

return ()=>{
inventoryListeners.forEach(unsub=>unsub());
};

},[slug]);


/* ===============================
FILTER PRODUCTS
=============================== */

const filteredProducts = useMemo(()=>{

let list = [...products];

if(selectedCollection){
list = list.filter(p=>p.collectionId === selectedCollection);
}

if(selectedSubcollection){
list = list.filter(p=>p.subcollectionId === selectedSubcollection);
}

/* SEARCH */

if(search){

const term = search.toLowerCase();

list = list.filter(p=>
p.productName?.toLowerCase().includes(term) ||
p.productCode?.toLowerCase().includes(term)
);

}

/* SORT */

if(sortBy==="price-asc"){

list.sort((a,b)=>{

const pa = a.tieredPricing?.retail?.[0]?.price ?? 0;
const pb = b.tieredPricing?.retail?.[0]?.price ?? 0;

return pa-pb;

});

}

if(sortBy==="price-desc"){

list.sort((a,b)=>{

const pa = a.tieredPricing?.retail?.[0]?.price ?? 0;
const pb = b.tieredPricing?.retail?.[0]?.price ?? 0;

return pb-pa;

});

}

return list;

},[
products,
selectedCollection,
selectedSubcollection,
search,
sortBy
]);


/* ===============================
UI
=============================== */

if(!seller && loading){
return <p style={{padding:"40px"}}>Loading store...</p>;
}

if(!seller){
return <p style={{padding:"40px"}}>Store not found</p>;
}

return(

<div className="products-page-container">

<h1 style={{marginBottom:"20px"}}>
{seller.name}'s Store
</h1>


<div className="product-controls">

<div className="filter-group">

<label>Collection</label>

<select
value={selectedCollection}
onChange={(e)=>{

const col = e.target.value;

setSelectedCollection(col);

setSelectedSubcollection(
subcollectionsMap[col]?.[0]?.id || ""
);

}}
>

{collections.map(c=>(
<option key={c.id} value={c.id}>
{c.title}
</option>
))}

</select>

</div>


<div className="filter-group">

<label>Subcollection</label>

<select
value={selectedSubcollection}
onChange={(e)=>setSelectedSubcollection(e.target.value)}
>

{subcollectionsMap[selectedCollection]?.map(sub=>(
<option key={sub.id} value={sub.id}>
{sub.name}
</option>
))}

</select>

</div>


<div className="filter-group">

<label>Sort</label>

<select
value={sortBy}
onChange={(e)=>setSortBy(e.target.value)}
>

<option value="default">Default</option>
<option value="price-asc">Price Low → High</option>
<option value="price-desc">Price High → Low</option>

</select>

</div>


<div className="search-group">

<input
type="text"
placeholder="Search product..."
value={search}
onChange={(e)=>setSearch(e.target.value)}
/>

</div>

</div>


<div className="products-grid collections-grid">

{filteredProducts.map(product=>(

<ProductCard
key={product.id}
product={product}

onIncrement={() => {

console.log("Adding product to cart:",product);

addToCart(product);

}}

onDecrement={(cartId)=>removeFromCart(cartId)}

cart={cart}

/>

))}

</div>


{cartItemsCount > 0 && (

<div className="view-cart-fixed-container">

<Link to="/store-cart" className="view-cart-btn-overlay">

<div className="cart-details-wrapper">

<span className="view-cart-text">
View Cart
</span>

<span className="cart-items-count-overlay">
{cartItemsCount} items
</span>

</div>

</Link>

</div>

)}

</div>

);

};

export default SellerStore;