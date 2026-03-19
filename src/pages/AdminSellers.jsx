import React, { useEffect, useState } from "react";
import {
collection,
getDocs,
doc,
updateDoc
} from "firebase/firestore";

import { db } from "../firebase";

import "./AdminSellers.css";

const AdminSellers = () => {

const [sellers,setSellers] = useState([]);
const [orders,setOrders] = useState([]);
const [expanded,setExpanded] = useState(null);
const [editing,setEditing] = useState(null);

const [sortField,setSortField] = useState("revenue");
const [sortDirection,setSortDirection] = useState("desc");

const [loading,setLoading] = useState(true);

/* =========================
LOAD DATA
========================= */

useEffect(()=>{

const loadData = async()=>{

const sellersSnap = await getDocs(collection(db,"users"));

const sellersList = sellersSnap.docs
.map(doc=>({
id:doc.id,
...doc.data()
}))
.filter(u=>u.role==="dropshipper");

const ordersSnap = await getDocs(collection(db,"storeOrders"));

const ordersList = ordersSnap.docs.map(doc=>({
id:doc.id,
...doc.data()
}));

setSellers(sellersList);
setOrders(ordersList);

setLoading(false);

};

loadData();

},[]);

/* =========================
SELLER STATS
========================= */

const getStats = (sellerId)=>{

const sellerOrders = orders.filter(o=>o.sellerId===sellerId);

let revenue = 0;
let profit = 0;

sellerOrders.forEach(order=>{

revenue += order.totalAmount || 0;

(order.items||[]).forEach(item=>{

profit += ((item.priceAtTimeOfOrder||0)-(item.costPrice||0))*(item.quantity||0);

});

});

return{
orders:sellerOrders.length,
revenue,
profit
};

};

/* =========================
SORT
========================= */

const handleSort = (field)=>{

if(sortField===field){

setSortDirection(sortDirection==="asc"?"desc":"asc");

}else{

setSortField(field);
setSortDirection("asc");

}

};

/* =========================
SORTED SELLERS
========================= */

const sortedSellers = [...sellers].sort((a,b)=>{

const aStats = getStats(a.id);
const bStats = getStats(b.id);

let aValue,bValue;

if(sortField==="name"){

aValue = a.name || "";
bValue = b.name || "";

}

if(sortField==="orders"){

aValue = aStats.orders;
bValue = bStats.orders;

}

if(sortField==="revenue"){

aValue = aStats.revenue;
bValue = bStats.revenue;

}

if(sortField==="profit"){

aValue = aStats.profit;
bValue = bStats.profit;

}

if(aValue < bValue) return sortDirection==="asc"?-1:1;
if(aValue > bValue) return sortDirection==="asc"?1:-1;

return 0;

});

/* =========================
SAVE SELLER
========================= */

const saveSeller = async()=>{

await updateDoc(
doc(db,"users",editing.id),
editing
);

setEditing(null);

};

/* =========================
LOADING
========================= */

if(loading){

return <div className="admin-loading">Loading sellers...</div>;

}

/* =========================
UI
========================= */

return(

<div className="admin-sellers">

<h1>Marketplace Sellers</h1>

<div className="sellers-table">

{/* HEADER */}

<div className="table-header">

<div onClick={()=>handleSort("name")}>
Seller
</div>

<div>
Store
</div>

<div>
Email
</div>

<div onClick={()=>handleSort("orders")}>
Orders
</div>

<div onClick={()=>handleSort("revenue")}>
Revenue
</div>

<div onClick={()=>handleSort("profit")}>
Profit
</div>

</div>

{/* ROWS */}

{sortedSellers.map(seller=>{

const stats = getStats(seller.id);

const isExpanded = expanded===seller.id;

return(

<div key={seller.id} className="seller-row">

<div
className="table-row"
onClick={()=>setExpanded(isExpanded?null:seller.id)}
>

<div>{seller.name}</div>

<div>{seller.storeName}</div>

<div>{seller.email}</div>

<div>{stats.orders}</div>

<div>₹{stats.revenue}</div>

<div className="profit">₹{stats.profit}</div>

</div>

{/* DETAILS */}

{isExpanded && (

<div className="seller-details">

<div className="details-card">

<h3>Personal Details</h3>

<label>Name</label>

<input
value={editing?.name || seller.name}
onChange={e=>setEditing({...seller,name:e.target.value})}
/>

<label>Email</label>

<input
value={editing?.email || seller.email}
onChange={e=>setEditing({...seller,email:e.target.value})}
/>

<label>Phone</label>

<input
value={editing?.phone || seller.phone}
onChange={e=>setEditing({...seller,phone:e.target.value})}
/>

</div>

<div className="details-card">

<h3>Store Details</h3>

<label>Store Name</label>

<input
value={editing?.storeName || seller.storeName}
onChange={e=>setEditing({...seller,storeName:e.target.value})}
/>

<label>Store Slug</label>

<input
value={editing?.storeSlug || seller.storeSlug}
onChange={e=>setEditing({...seller,storeSlug:e.target.value})}
/>

<label>Domain</label>

<input
value={editing?.storeDomain || seller.storeDomain}
onChange={e=>setEditing({...seller,storeDomain:e.target.value})}
/>

<label>Pricing Type</label>

<select
value={editing?.pricingKey || seller.pricingKey}
onChange={e=>setEditing({...seller,pricingKey:e.target.value})}
>

<option value="retail">Retail</option>
<option value="wholesale">Wholesale</option>
<option value="dealer">Dealer</option>
<option value="distributor">Distributor</option>
<option value="vip">VIP</option>

</select>

</div>

<div className="save-area">

<button onClick={saveSeller}>
Save Changes
</button>

</div>

</div>

)}

</div>

);

})}

</div>

</div>

);

};

export default AdminSellers;