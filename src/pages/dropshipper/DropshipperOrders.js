import React, { useEffect, useState } from "react";
import {
collection,
query,
where,
getDocs,
orderBy
} from "firebase/firestore";

import { db } from "../../firebase";
import { useAuth } from "../../components/AuthContext";

import "./DropshipperOrders.css";

const DropshipperOrders = () => {

const { currentUser } = useAuth();

const [orders,setOrders] = useState([]);
const [loading,setLoading] = useState(true);
const [expandedOrder,setExpandedOrder] = useState(null);

/* =========================
LOAD SELLER ORDERS
========================= */

useEffect(()=>{

const loadOrders = async()=>{

if(!currentUser) return;

try{

const q = query(
collection(db,"storeOrders"),
where("sellerId","==",currentUser.uid),
orderBy("createdAt","desc")
);

const snap = await getDocs(q);

const list = snap.docs.map(doc=>({
id:doc.id,
...doc.data()
}));

setOrders(list);

}catch(err){
console.error("Orders load error:",err);
}

setLoading(false);

};

loadOrders();

},[currentUser]);

/* =========================
CALCULATE PROFIT
========================= */

const calculateOrderProfit = (order)=>{

let profit = 0;

(order.items || []).forEach(item=>{

const sellingPrice = item.priceAtTimeOfOrder || 0;
const costPrice = item.costPrice || 0;

profit += (sellingPrice - costPrice) * (item.quantity || 0);

});

return profit;

};

/* =========================
FORMAT DATE
========================= */

const formatDate = (timestamp)=>{

if(!timestamp) return "";

try{
return new Date(timestamp.seconds * 1000)
.toLocaleDateString();
}catch{
return "";
}

};

/* =========================
LOADING
========================= */

if(loading){
return <div className="orders-loading">Loading orders...</div>;
}

/* =========================
UI
========================= */

return(

<div className="dropshipper-orders">

<h1>Orders</h1>

{orders.length === 0 && (
<div className="no-orders">
No orders yet
</div>
)}

<div className="orders-table">

{orders.map(order=>{

const profit = calculateOrderProfit(order);
const isExpanded = expandedOrder === order.id;

return(

<div key={order.id} className="order-row">

{/* SUMMARY */}

<div
className="order-summary"
onClick={()=>setExpandedOrder(
isExpanded ? null : order.id
)}
>

<div className="order-id">
#{order.id.slice(0,8)}
</div>

<div className="order-customer">
{order.billingInfo?.fullName || "Customer"}
</div>

<div className={`order-status status-${(order.status || "pending").toLowerCase()}`}>
{order.status || "Pending"}
</div>

<div className="order-total">
₹{order.totalAmount || 0}
</div>

<div className="order-profit">
₹{profit}
</div>

</div>

{/* EXPANDED DETAILS */}

{isExpanded && (

<div className="order-details">

{/* CUSTOMER */}

<div className="customer-block">

<h3>Customer Details</h3>

<p><strong>Name:</strong> {order.billingInfo?.fullName}</p>

<p><strong>Phone:</strong> {order.billingInfo?.phone}</p>

<p><strong>Address:</strong> {order.billingInfo?.address}</p>

<p>
<strong>Location:</strong>{" "}
{order.billingInfo?.city}, {order.billingInfo?.state}
</p>

<p>
<strong>Date:</strong> {formatDate(order.createdAt)}
</p>

</div>

{/* PRODUCTS */}

<div className="items-block">

<h3>Products</h3>

{(order.items || []).map((item,i)=>(

<div key={i} className="order-item">

<img
src={item.images?.[0]?.url || item.image}
alt={item.productName}
/>

<div className="item-info">

<div className="item-name">
{item.productName}
</div>

<div className="item-meta">
Code: {item.productCode}
</div>

<div className="item-meta">
Qty: {item.quantity}
</div>

<div className="item-meta">
Price: ₹{item.priceAtTimeOfOrder}
</div>

<div className="item-meta">
Cost: ₹{item.costPrice}
</div>

</div>

</div>

))}

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

export default DropshipperOrders;