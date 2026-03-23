import React, { useEffect, useState } from "react";
import {
collection,
query,
where,
orderBy,
getDocs
} from "firebase/firestore";

import { db } from "../../firebase";
import { useStoreAuth } from "./StoreAuthContext";

import "./StoreOrders.css";

const StoreMyOrders = () => {

const { user } = useStoreAuth();

const [orders,setOrders] = useState([]);
const [loading,setLoading] = useState(true);
const [selectedOrder,setSelectedOrder] = useState(null);

/* ================= LOAD ORDERS ================= */

useEffect(()=>{

const loadOrders = async()=>{

if(!user){
setLoading(false);
return;
}

try{

const q = query(
collection(db,"storeOrders"),
where("customerId","==",user.uid),
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

},[user]);

/* ================= DATE FORMAT ================= */

const formatDate = (timestamp)=>{

if(!timestamp) return "";

try{
return new Date(timestamp.seconds * 1000)
.toLocaleString();
}catch{
return "";
}

};

/* ================= LOADING ================= */

if(loading){
return <div className="orders-loading">Loading your orders...</div>;
}

/* ================= UI ================= */

return(

<div className="store-orders-page">

<h2>My Orders</h2>

{orders.length === 0 && (
<p className="no-orders">
You haven't placed any orders yet
</p>
)}

<div className="orders-list">

{orders.map(order=>{

const totalUnits = order.items?.reduce(
(sum,i)=>sum + (i.quantity || 0),0
);

return(

<div
key={order.id}
className="order-card"
onClick={()=>setSelectedOrder(order)}
>

<div className="order-top">

<div className="order-id">
Order #{order.id.slice(0,8)}
</div>

<div className={`order-status status-${(order.status || "pending").toLowerCase()}`}>
{order.status || "Pending"}
</div>

</div>

<div className="order-meta">

<span>Date: {formatDate(order.createdAt)}</span>

<span>{totalUnits} items</span>

<span>Total: ₹{order.totalAmount}</span>

</div>

<div className="order-preview">

{order.items?.slice(0,3).map((item,i)=>(
<img
key={i}
src={item.images?.[0]?.url || item.image}
alt=""
/>
))}

</div>

</div>

);

})}

</div>


{/* ================= ORDER MODAL ================= */}

{selectedOrder && (

<div
className="order-modal-overlay"
onClick={()=>setSelectedOrder(null)}
>

<div
className="order-modal"
onClick={(e)=>e.stopPropagation()}
>

<div className="modal-header">

<h3>
Order #{selectedOrder.id.slice(0,8)}
</h3>

<button
className="modal-close"
onClick={()=>setSelectedOrder(null)}
>
✕
</button>

</div>

<div className="modal-meta">

<div>Status: 
<span className={`order-status status-${(selectedOrder.status || "pending").toLowerCase()}`}>
{selectedOrder.status}
</span>
</div>

<div>Date: {formatDate(selectedOrder.createdAt)}</div>

</div>


{/* PRODUCTS */}

<div className="modal-products">

{selectedOrder.items?.map((item,i)=>(

<div key={i} className="modal-product">

<img
src={item.images?.[0]?.url || item.image}
alt={item.productName}
/>

<div className="modal-product-info">

<div className="product-name">
{item.productName}
</div>

<div className="product-meta">
Code: {item.productCode}
</div>

{item.variationLabel && (
<div className="product-meta">
{item.variationLabel}
</div>
)}

<div className="product-meta">
Qty: {item.quantity}
</div>

<div className="product-meta">
Price: ₹{item.priceAtTimeOfOrder}
</div>

</div>

</div>

))}

</div>


{/* TOTAL */}

<div className="modal-total">

<div>Subtotal: ₹{selectedOrder.subtotal}</div>

<div>Shipping: ₹{selectedOrder.shippingFee}</div>

<div className="modal-total-final">
Total: ₹{selectedOrder.totalAmount}
</div>

</div>

</div>

</div>

)}

</div>

);

};

export default StoreMyOrders;