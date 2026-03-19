import React, { useEffect, useState } from "react";
import {
collection,
getDocs
} from "firebase/firestore";

import { db } from "../firebase";

import SellerPayoutModal from "../components/SellerPayoutModal";

import "./AdminSellerProfits.css";

const AdminSellerProfits = () => {

const [sellers,setSellers] = useState([]);
const [orders,setOrders] = useState([]);
const [payouts,setPayouts] = useState([]);

const [loading,setLoading] = useState(true);

const [selectedSeller,setSelectedSeller] = useState(null);

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


const payoutsSnap = await getDocs(collection(db,"sellerPayouts"));

const payoutsList = payoutsSnap.docs.map(doc=>({
id:doc.id,
...doc.data()
}));


setSellers(sellersList);
setOrders(ordersList);
setPayouts(payoutsList);

setLoading(false);

};

loadData();

},[]);

/* =========================
SELLER STATS
========================= */

const getStats = (sellerId)=>{

const sellerOrders = orders.filter(
o => o.sellerId === sellerId
);

let revenue = 0;
let profit = 0;

sellerOrders.forEach(order=>{

revenue += order.totalAmount || 0;

(order.items || []).forEach(item=>{

profit +=
((item.priceAtTimeOfOrder||0)-(item.costPrice||0))
*
(item.quantity||0);

});

});


const sellerPayouts = payouts.filter(
p => p.sellerId === sellerId
);

const paid = sellerPayouts.reduce(
(sum,p)=>sum + (p.amount || 0),
0
);


return{
orders:sellerOrders.length,
revenue,
profit,
paid,
pending: profit - paid
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

<h1>Seller Payouts</h1>

<div className="profits-table">

<div className="table-header">

<div>Seller</div>
<div>Orders</div>
<div>Revenue</div>
<div>Profit</div>
<div>Paid</div>
<div>Pending</div>
<div>Action</div>

</div>

{sellers.map(seller=>{

const stats = getStats(seller.id);

return(

<div key={seller.id} className="table-row">

<div>{seller.name}</div>

<div>{stats.orders}</div>

<div>₹{stats.revenue}</div>

<div className="profit">
₹{stats.profit}
</div>

<div>
₹{stats.paid}
</div>

<div className="pending">
₹{stats.pending}
</div>

<div>

<button
onClick={()=>setSelectedSeller({
...seller,
pending:stats.pending
})}
>
Pay Seller
</button>

</div>

</div>

);

})}

</div>

{selectedSeller && (

<SellerPayoutModal
seller={selectedSeller}
pending={selectedSeller.pending}
onClose={()=>setSelectedSeller(null)}
/>

)}

</div>

);

};

export default AdminSellerProfits;