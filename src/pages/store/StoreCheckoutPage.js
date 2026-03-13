import React, { useState } from "react";
import { useStoreCart } from "./StoreCartContext";
import { useNavigate } from "react-router-dom";
import "../CheckoutPage.css";
import {
doc,
collection,
runTransaction,
serverTimestamp
} from "firebase/firestore";
import { db } from "../../firebase";

/* =========================
TIER PRICE CALCULATOR
========================= */

const getTierPrice = (tiers, quantity) => {

if(!tiers || tiers.length === 0) return 0;

const sorted = [...tiers].sort(
(a,b)=>Number(a.min_quantity) - Number(b.min_quantity)
);

let price = sorted[0].price;

for(const tier of sorted){

const min = Number(tier.min_quantity);
const max = Number(tier.max_quantity) || Infinity;

if(quantity >= min && quantity <= max){
price = tier.price;
}

}

return Number(price) || 0;

};

const SHIPPING_FEE = 199;

const StoreCheckoutPage = () => {

const { cart, clearCart, getSubcollectionQty } = useStoreCart();
const navigate = useNavigate();

const items = Object.values(cart);

const [formData,setFormData] = useState({
fullName:"",
email:"",
phoneNumber:"",
addressLine1:"",
addressLine2:"",
city:"",
state:"",
pincode:""
});

const [error,setError] = useState(null);
const [isProcessing,setIsProcessing] = useState(false);

/* =========================
FORM CHANGE
========================= */

const handleInputChange = (e)=>{

const {name,value} = e.target;

setFormData(prev=>({
...prev,
[name]:value
}));

};

/* =========================
TOTAL CALCULATIONS
========================= */

const subtotal = items.reduce((sum,item)=>{

const subQty = getSubcollectionQty(item.subcollectionId);

const price = getTierPrice(
item.tieredPricing?.retail ?? [],
subQty
);

return sum + price * item.quantity;

},0);

const totalAmount = subtotal + SHIPPING_FEE;

/* =========================
PLACE ORDER
========================= */

const handleSubmitOrder = async(e)=>{

e.preventDefault();

console.log("🛒 Checkout started");
console.log("Cart items:", items);
console.log("Billing form:", formData);

setIsProcessing(true);
setError(null);

if(items.length === 0){
setError("Your cart is empty.");
setIsProcessing(false);
return;
}

const {
fullName,
email,
phoneNumber,
addressLine1,
city,
state,
pincode
} = formData;

if(!fullName || !email || !phoneNumber || !addressLine1 || !city || !state || !pincode){

setError("Please fill all required shipping details.");
setIsProcessing(false);
return;

}

try{

await runTransaction(db, async (transaction)=>{

const productDocs = [];

console.log("🔍 Validating stock...");

/* =========================
VALIDATE STOCK
========================= */

for(const item of items){

const ref = doc(
db,
"collections",
item.collectionId,
"subcollections",
item.subcollectionId,
"products",
item.productId
);

const snap = await transaction.get(ref);

if(!snap.exists()){
throw new Error(`${item.productName} no longer exists`);
}

const stock = snap.data().quantity;

console.log(
`Stock check → ${item.productName}`,
"Requested:", item.quantity,
"Available:", stock
);

if(item.quantity > stock){
throw new Error(`${item.productName} only has ${stock} available`);
}

productDocs.push({
ref,
stock,
item
});

}

/* =========================
REDUCE INVENTORY
========================= */

console.log("📦 Reducing inventory...");

productDocs.forEach(p => {

const newStock = p.stock - p.item.quantity;

console.log(
`Updating stock for ${p.item.productName}`,
"Old:", p.stock,
"New:", newStock
);

transaction.update(p.ref,{
quantity: newStock
});

});

/* =========================
CREATE ORDER ITEMS
========================= */

const sanitizedItems = items.map(item=>{

const subQty = getSubcollectionQty(item.subcollectionId);

const sellingPrice = getTierPrice(
item.tieredPricing?.retail ?? [],
subQty
);

return{

productId: item.productId ?? null,
productName: item.productName ?? "",
productCode: item.productCode ?? "",

image: item.image ?? "",
images: item.images ?? [],

quantity: Number(item.quantity) || 0,

priceAtTimeOfOrder: sellingPrice,   // ⭐ FIXED

costPrice: Number(item.costPrice ?? 0),  // optional for profit

collectionId: item.collectionId ?? "",
subcollectionId: item.subcollectionId ?? ""

};

});

/* =========================
CREATE ORDER DOCUMENT
========================= */

const orderRef = doc(collection(db,"storeOrders"));

const orderData = {

sellerId: items[0]?.sellerId ?? null,

items: sanitizedItems,

subtotal: Number(subtotal) || 0,
shippingFee: SHIPPING_FEE,
totalAmount: Number(totalAmount) || 0,

billingInfo:{
fullName,
email,
phoneNumber,
addressLine1,
addressLine2: formData.addressLine2 ?? "",
city,
state,
pincode
},

status:"Pending",

createdAt: serverTimestamp()

};

console.log("🧾 Creating order:", orderData);

transaction.set(orderRef,orderData);

});

console.log("✅ Order created successfully");

clearCart();

navigate("/order-success");

}catch(err){

console.error("❌ Checkout failed:", err);

setError(err.message || "Order failed.");

}

setIsProcessing(false);

};

/* =========================
UI
========================= */

return(

<div className="checkout-page-container">

<h2>Complete Your Order</h2>

{error && <pre className="error-message">{error}</pre>}

{items.length > 0 ? (

<div className="checkout-content">

{/* BILLING */}

<div className="billing-section">

<h3>Billing & Shipping Information</h3>

<form onSubmit={handleSubmitOrder}>

<input name="fullName" placeholder="Full Name *" value={formData.fullName} onChange={handleInputChange} required />
<input name="email" type="email" placeholder="Email *" value={formData.email} onChange={handleInputChange} required />
<input name="phoneNumber" placeholder="Phone *" value={formData.phoneNumber} onChange={handleInputChange} required />
<input name="addressLine1" placeholder="Address *" value={formData.addressLine1} onChange={handleInputChange} required />
<input name="addressLine2" placeholder="Address 2" value={formData.addressLine2} onChange={handleInputChange} />
<input name="city" placeholder="City *" value={formData.city} onChange={handleInputChange} required />
<input name="state" placeholder="State *" value={formData.state} onChange={handleInputChange} required />
<input name="pincode" placeholder="Pincode *" value={formData.pincode} onChange={handleInputChange} required />

<button type="submit" className="checkout-btn" disabled={isProcessing}>
{isProcessing ? "Processing..." : "Place Order"}
</button>

</form>

</div>

{/* ORDER SUMMARY */}

<div className="order-details">

<h3>Order Summary</h3>

<div className="cart-items-list">

{items.map(item=>{

const subQty = getSubcollectionQty(item.subcollectionId);

const price = getTierPrice(
item.tieredPricing?.retail ?? [],
subQty
);

return(

<div key={item.cartId} className="cart-item">

<div className="cart-item-image-wrapper">

<img
src={item.images?.[0]?.url || item.image}
alt={item.productName}
className="cart-item-image"
/>

</div>

<div className="cart-item-details">

<h4 className="cart-item-name">{item.productName}</h4>

<p className="cart-item-code">
Code: {item.productCode}
</p>

<p className="cart-item-price">
₹{price.toFixed(2)} × {item.quantity}
</p>

</div>

</div>

);

})}

</div>

<div className="cart-total-section">
<p>Subtotal</p>
<p>₹{subtotal.toFixed(2)}</p>
</div>

<div className="cart-total-section">
<p>Packing</p>
<p>₹{SHIPPING_FEE.toFixed(2)}</p>
</div>

<div className="cart-total-section total-final">
<p>Total</p>
<p>₹{totalAmount.toFixed(2)}</p>
</div>

</div>

</div>

):( 

<p className="empty-cart-message">
Your cart is empty.
</p>

)}

</div>

);

};

export default StoreCheckoutPage;