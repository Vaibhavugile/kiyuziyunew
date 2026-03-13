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

/* =========================
LOAD SELLER ORDERS
========================= */

useEffect(()=>{

const loadOrders = async()=>{

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

if(currentUser){
loadOrders();
}

},[currentUser]);

/* =========================
CALCULATE PROFIT
========================= */

const calculateOrderProfit = (order)=>{

let profit = 0;

order.items?.forEach(item=>{

const sellingPrice = item.priceAtTimeOfOrder || 0;
const costPrice = item.costPrice || 0;

profit += (sellingPrice - costPrice) * item.quantity;

});

return profit;

};

/* =========================
LOADING
========================= */

if(loading){
return <p style={{padding:"40px"}}>Loading orders...</p>;
}

/* =========================
UI
========================= */

return(

<div className="dropshipper-orders-container">

<h1>Dropshipper Orders</h1>

{orders.length === 0 && (
<p>No orders yet.</p>
)}

<div className="orders-list">

{orders.map(order=>{

const profit = calculateOrderProfit(order);

return(

<div key={order.id} className="order-card">

{/* ORDER HEADER */}

<div className="order-header">

<div>
<strong>Order ID:</strong> {order.id}
</div>

<div>
<strong>Status:</strong> {order.status}
</div>

<div>
<strong>Total:</strong> ₹{order.totalAmount}
</div>

<div className="profit">
Profit: ₹{profit}
</div>

</div>


{/* CUSTOMER */}

<div className="customer-info">

<strong>Customer:</strong> {order.billingInfo?.fullName}

<br/>

{order.billingInfo?.city}, {order.billingInfo?.state}

</div>


{/* ORDER ITEMS */}

<div className="order-items">

{order.items?.map((item,i)=>(

<div key={i} className="order-item">

<img
src={item.images?.[0]?.url || item.image}
alt={item.productName}
/>

<div className="item-details">

<div className="item-name">
{item.productName}
</div>

<div>
Code: {item.productCode}
</div>

<div>
Qty: {item.quantity}
</div>

<div>
Price: ₹{item.priceAtTimeOfOrder}
</div>

</div>

</div>

))}

</div>

</div>

);

})}

</div>

</div>

);

};

export default DropshipperOrders;