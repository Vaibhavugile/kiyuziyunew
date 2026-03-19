import React, { useEffect, useState } from "react";
import {
collection,
getDocs
} from "firebase/firestore";

import { db } from "../firebase";

import "./AdminStoreOrders.css";

const AdminStoreOrders = () => {

const [orders,setOrders] = useState([]);
const [sellers,setSellers] = useState({});
const [expanded,setExpanded] = useState(null);
const [loading,setLoading] = useState(true);

/* =========================
LOAD DATA
========================= */

useEffect(()=>{

const loadData = async()=>{

try{

const ordersSnap = await getDocs(collection(db,"storeOrders"));

const ordersList = ordersSnap.docs.map(doc=>({
id:doc.id,
...doc.data()
}));

setOrders(ordersList);

/* LOAD SELLERS */

const sellersSnap = await getDocs(collection(db,"users"));

const sellerMap = {};

sellersSnap.docs.forEach(doc=>{
sellerMap[doc.id] = doc.data();
});

setSellers(sellerMap);

}catch(err){
console.error(err);
}

setLoading(false);

};

loadData();

},[]);

/* =========================
PROFIT
========================= */

const calculateProfit = (order)=>{

let profit = 0;

(order.items || []).forEach(item=>{

const sell = item.priceAtTimeOfOrder || 0;
const cost = item.costPrice || 0;

profit += (sell - cost) * (item.quantity || 0);

});

return profit;

};

/* =========================
LOADING
========================= */

if(loading){
return <div className="admin-loading">Loading orders...</div>;
}

/* =========================
UI
========================= */

return(

<div className="admin-orders">

<h1>Marketplace Orders</h1>

<div className="orders-table">

{/* HEADER */}

<div className="table-header">

<div>Order</div>
<div>Seller</div>
<div>Customer</div>
<div>Status</div>
<div>Total</div>
<div>Profit</div>

</div>

{/* ROWS */}

{orders.map(order=>{

const seller = sellers[order.sellerId];

const profit = calculateProfit(order);

const isExpanded = expanded === order.id;

return(

<div key={order.id} className="order-row">

<div
className="table-row"
onClick={()=>setExpanded(isExpanded?null:order.id)}
>

<div>#{order.id.slice(0,8)}</div>

<div>{seller?.name || "Seller"}</div>

<div>{order.billingInfo?.fullName}</div>

<div className={`status status-${order.status}`}>
{order.status}
</div>

<div>₹{order.totalAmount}</div>

<div className="profit">
₹{profit}
</div>

</div>

{/* EXPANDED DETAILS */}

{isExpanded && (

<div className="order-details">

<div className="customer-card">

<h3>Customer</h3>

<p>{order.billingInfo?.fullName}</p>
<p>{order.billingInfo?.phone}</p>
<p>{order.billingInfo?.address}</p>
<p>{order.billingInfo?.city}, {order.billingInfo?.state}</p>

</div>

<div className="items-card">

<h3>Products</h3>

{(order.items || []).map((item,i)=>{

return(

<div key={i} className="order-item">

<img
src={item.images?.[0]?.url || item.image}
alt={item.productName}
/>

<div>

<div className="item-name">
{item.productName}
</div>

<div className="item-meta">
Qty: {item.quantity}
</div>

<div className="item-meta">
Price: ₹{item.priceAtTimeOfOrder}
</div>

</div>

</div>

);

})}

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

export default AdminStoreOrders;