import React, { useEffect, useState, useMemo } from "react";
import {
collection,
query,
where,
orderBy,
getDocs
} from "firebase/firestore";

import { db } from "../../firebase";
import { useAuth } from "../../components/AuthContext";

import "./DropshipperPayments.css";

const DropshipperPayments = () => {

const { currentUser } = useAuth();

const [orders,setOrders] = useState([]);
const [loading,setLoading] = useState(true);

const [search,setSearch] = useState("");
const [sortBy,setSortBy] = useState("date");

/* ================= LOAD ORDERS ================= */

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
console.error(err);
}

setLoading(false);

};

loadOrders();

},[currentUser]);

/* ================= ORDER CALC ================= */

const calculateOrder = (order)=>{

let costTotal = 0;
let sellingTotal = 0;
let totalQty = 0;

(order.items || []).forEach(item=>{

const qty = item.quantity || 0;

costTotal += (item.costPrice || 0) * qty;
sellingTotal += (item.priceAtTimeOfOrder || 0) * qty;
totalQty += qty;

});

const profit = sellingTotal - costTotal;

const shipping = order.shippingFee || 0;

const payableToAdmin = costTotal + shipping;

return {
costTotal,
sellingTotal,
profit,
shipping,
payableToAdmin,
totalQty
};

};

/* ================= FILTER + SORT ================= */

const filteredOrders = useMemo(()=>{

let filtered = orders.filter(o => o.status !== "Cancelled");

/* SEARCH */

if(search){

const s = search.toLowerCase();

filtered = filtered.filter(o =>
o.id.toLowerCase().includes(s) ||
(o.billingInfo?.fullName || "").toLowerCase().includes(s)
);

}

/* SORT */

if(sortBy === "profit"){

filtered.sort((a,b)=>{
return calculateOrder(b).profit - calculateOrder(a).profit;
});

}

if(sortBy === "payable"){

filtered.sort((a,b)=>{
return calculateOrder(b).payableToAdmin - calculateOrder(a).payableToAdmin;
});

}

if(sortBy === "date"){

filtered.sort((a,b)=>{
return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
});

}

return filtered;

},[orders,search,sortBy]);

/* ================= TOTAL SUMMARY ================= */

const totals = useMemo(()=>{

let totalCost = 0;
let totalSelling = 0;
let totalProfit = 0;
let totalShipping = 0;
let totalPayable = 0;

filteredOrders.forEach(order=>{

const calc = calculateOrder(order);

totalCost += calc.costTotal;
totalSelling += calc.sellingTotal;
totalProfit += calc.profit;
totalShipping += calc.shipping;
totalPayable += calc.payableToAdmin;

});

return {
totalCost,
totalSelling,
totalProfit,
totalShipping,
totalPayable
};

},[filteredOrders]);

/* ================= DATE ================= */

const formatDate = (timestamp)=>{

if(!timestamp) return "";

try{
return new Date(timestamp.seconds * 1000).toLocaleDateString();
}catch{
return "";
}

};

if(loading){
return <div className="payments-loading">Loading payments...</div>;
}

/* ================= UI ================= */

return(

<div className="dropshipper-payments">

<h1>Payments</h1>

{/* SEARCH + SORT */}

<div className="payments-controls">

<input
type="text"
placeholder="Search order or customer..."
value={search}
onChange={(e)=>setSearch(e.target.value)}
/>

<select
value={sortBy}
onChange={(e)=>setSortBy(e.target.value)}
>

<option value="date">Sort by Date</option>
<option value="profit">Sort by Profit</option>
<option value="payable">Sort by Payable</option>

</select>

</div>

<table className="payments-table">

<thead>

<tr>

<th>Order</th>
<th>Date</th>
<th>Customer</th>
<th>Status</th>
<th>Qty</th>
<th>Cost Total</th>
<th>Selling Total</th>
<th>Profit</th>
<th>Shipping</th>
<th>Payable to Admin</th>

</tr>

</thead>

<tbody>

{filteredOrders.map(order=>{

const calc = calculateOrder(order);

return(

<tr key={order.id}>

<td>#{order.id.slice(0,8)}</td>

<td>{formatDate(order.createdAt)}</td>

<td>{order.billingInfo?.fullName}</td>

<td>
<span className={`status status-${(order.status || "pending").toLowerCase()}`}>
{order.status || "Pending"}
</span>
</td>

<td>{calc.totalQty}</td>

<td>₹{calc.costTotal}</td>

<td>₹{calc.sellingTotal}</td>

<td className="profit">₹{calc.profit}</td>

<td>₹{calc.shipping}</td>

<td className="payable">₹{calc.payableToAdmin}</td>

</tr>

);

})}

</tbody>

</table>

{/* ================= TOTAL SUMMARY ================= */}

<div className="payments-summary">

<div>
<span>Total Cost</span>
<strong>₹{totals.totalCost}</strong>
</div>

<div>
<span>Total Selling</span>
<strong>₹{totals.totalSelling}</strong>
</div>

<div>
<span>Total Profit</span>
<strong className="profit">₹{totals.totalProfit}</strong>
</div>

<div>
<span>Total Shipping</span>
<strong>₹{totals.totalShipping}</strong>
</div>

<div>
<span>Payable To Admin</span>
<strong className="payable">₹{totals.totalPayable}</strong>
</div>

</div>

</div>

);

};

export default DropshipperPayments;