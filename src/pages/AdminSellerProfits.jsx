import React, { useEffect, useState } from "react";
import {
collection,
getDocs
} from "firebase/firestore";

import { db } from "../firebase";

import "./AdminSellerProfits.css";

const AdminSellerProfits = () => {

const [sellers,setSellers] = useState([]);
const [orders,setOrders] = useState([]);
const [payments,setPayments] = useState([]);

const [loading,setLoading] = useState(true);

/* =========================
LOAD DATA
========================= */

useEffect(()=>{

const loadData = async()=>{

try{

/* SELLERS */

const sellersSnap = await getDocs(collection(db,"users"));

const sellersList = sellersSnap.docs
.map(doc=>({
id:doc.id,
...doc.data()
}))
.filter(u=>u.role === "dropshipper");


/* ORDERS */

const ordersSnap = await getDocs(collection(db,"storeOrders"));

const ordersList = ordersSnap.docs.map(doc=>({
id:doc.id,
...doc.data()
}));


/* ADMIN PAYMENTS */

const paymentsSnap = await getDocs(collection(db,"adminPayments"));

const paymentsList = paymentsSnap.docs.map(doc=>({
id:doc.id,
...doc.data()
}));


setSellers(sellersList);
setOrders(ordersList);
setPayments(paymentsList);

}catch(err){
console.error("Admin seller payments load error:",err);
}

setLoading(false);

};

loadData();

},[]);

/* =========================
SELLER STATS
========================= */

const getSellerStats = (sellerId)=>{

const sellerOrders = orders.filter(
o => o.sellerId === sellerId && o.status !== "Cancelled"
);

let revenue = 0;
let profit = 0;
let costTotal = 0;
let shippingTotal = 0;

sellerOrders.forEach(order=>{

revenue += order.totalAmount || 0;

shippingTotal += order.shippingFee || 0;

(order.items || []).forEach(item=>{

const selling = item.priceAtTimeOfOrder || 0;
const cost = item.costPrice || 0;
const qty = item.quantity || 0;

profit += (selling - cost) * qty;

costTotal += cost * qty;

});

});

/* ADMIN PAYABLE */

const adminPayable = costTotal + shippingTotal;

/* PAYMENTS RECEIVED */

const sellerPayments = payments.filter(
p => p.sellerId === sellerId
);

const received = sellerPayments.reduce(
(sum,p)=> sum + (p.amount || 0),
0
);

/* PENDING */

const pending = adminPayable - received;

return{
orders: sellerOrders.length,
revenue,
profit,
adminPayable,
received,
pending
};

};

/* =========================
LOADING
========================= */

if(loading){
return <div className="admin-loading">Loading...</div>;
}

/* =========================
UI
========================= */

return(

<div className="seller-profits">

<h1>Seller Payments</h1>

<div className="profits-table">

<div className="table-header">

<div>Seller</div>
<div>Total Orders</div>
<div>Revenue</div>
<div>Profit</div>
<div>Admin Payable</div>
<div>Admin Payment Received</div>
<div>Admin Payment Pending</div>

</div>

{sellers.map(seller=>{

const stats = getSellerStats(seller.id);

return(

<div key={seller.id} className="table-row">

<div>{seller.name || seller.storeName}</div>

<div>{stats.orders}</div>

<div>₹{stats.revenue}</div>

<div className="profit">
₹{stats.profit}
</div>

<div className="admin-payable">
₹{stats.adminPayable}
</div>

<div className="paid">
₹{stats.received}
</div>

<div className="pending">
₹{stats.pending}
</div>

</div>

);

})}

</div>

</div>

);

};

export default AdminSellerProfits;