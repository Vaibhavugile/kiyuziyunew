import React, { useState, useRef, useEffect } from "react";
import { useStoreCart } from "./StoreCartContext";
import { useNavigate } from "react-router-dom";
import "../CartPage.css";

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

return price;

};

const StoreCartPage = () => {

const {
cart,
addToCart,
removeFromCart,
clearCart,
cartItemsCount
} = useStoreCart();

const navigate = useNavigate();

const [stockWarning,setStockWarning] = useState(false);

const items = Object.values(cart);

const firstErrorRef = useRef(null);


/* =========================
TOTAL QTY PER SUBCOLLECTION
========================= */

const subcollectionTotals = {};

items.forEach(item=>{

const sub = item.subcollectionId;

if(!subcollectionTotals[sub]){
subcollectionTotals[sub] = 0;
}

subcollectionTotals[sub] += item.quantity;

});


/* =========================
STOCK VALIDATION
========================= */

const stockErrors = items.filter(item =>
item.quantity > (item.stock ?? 999999)
);


/* =========================
AUTO CLEAR WARNING
========================= */

useEffect(()=>{

if(stockErrors.length === 0){
setStockWarning(false);
}

},[cart]);


/* =========================
TOTAL PRICE
========================= */

const total = items.reduce((sum,item)=>{

const tiers = item.tieredPricing?.retail ?? [];

const subQty = subcollectionTotals[item.subcollectionId] || 0;

const price = getTierPrice(tiers, subQty);

return sum + price * item.quantity;

},0);


/* =========================
CHECKOUT VALIDATION
========================= */

const handleCheckout = () => {

if(stockErrors.length > 0){

setStockWarning(true);

if(firstErrorRef.current){

firstErrorRef.current.scrollIntoView({
behavior:"smooth",
block:"center"
});

}

return;

}

navigate("/store-checkout");

};


return(

<div className="cart-page-container">

<h2 className="cart-title">Shopping Cart</h2>


{/* =========================
STOCK WARNING
========================= */}

{stockWarning && stockErrors.length > 0 && (

<div
style={{
background:"#ffeaea",
border:"1px solid #ff6b6b",
padding:"12px",
borderRadius:"8px",
marginBottom:"20px",
color:"#c92a2a",
fontWeight:"500"
}}
>

Some items exceed available stock.  
Please adjust the highlighted quantities.

</div>

)}


{/* =========================
EMPTY CART
========================= */}

{items.length === 0 && (

<p className="empty-cart-message">
Your cart is empty
</p>

)}


{/* =========================
CART CONTENT
========================= */}

{items.length > 0 && (

<div className="cart-main-content-wrapper">


{/* =========================
LEFT SIDE - CART ITEMS
========================= */}

<div className="cart-items-list">

{items.map(item=>{

const tiers = item.tieredPricing?.retail ?? [];

const subQty = subcollectionTotals[item.subcollectionId] || 0;

const price = getTierPrice(tiers, subQty);

const subtotal = price * item.quantity;

const stock = item.stock ?? 999999;

const isOutOfStock = item.quantity > stock;

const isMaxReached = item.quantity >= stock;

return(

<div
key={item.cartId}
ref={isOutOfStock ? firstErrorRef : null}
className="cart-item"
style={{
border:isOutOfStock ? "2px solid #ff6b6b" : ""
}}
>

{/* IMAGE */}

<img
src={item.image}
alt={item.productName}
className="cart-item-image1"
/>


{/* PRODUCT INFO */}

<div className="cart-item-details">

<div className="cart-item-name">
{item.productName}
</div>

<div className="cart-item-price">
₹{price} each
</div>


{/* STOCK WARNING */}

{isOutOfStock && (

<div
style={{
color:"#c92a2a",
fontSize:"13px",
marginTop:"5px"
}}
>

Only {stock} available (You selected {item.quantity})

</div>

)}

{!isOutOfStock && isMaxReached && stock !== 999999 && (

<div
style={{
color:"#e67700",
fontSize:"12px",
marginTop:"5px"
}}
>

Maximum stock reached ({stock})

</div>

)}

</div>


{/* QUANTITY CONTROLS */}

<div className="cart-quantity-controls">

<button
onClick={()=>removeFromCart(item.cartId)}
>
-
</button>

<span>{item.quantity}</span>

<button
disabled={isMaxReached}
onClick={()=>addToCart(item)}
>
+
</button>

</div>


{/* SUBTOTAL */}

<div className="cart-item-subtotal">
₹{subtotal}
</div>

</div>

);

})}

</div>


{/* =========================
RIGHT SIDE - SUMMARY
========================= */}

<div className="cart-summary">

<h3>Order Summary</h3>

<div className="cart-summary-line">
<p>Total Items</p>
<span>{cartItemsCount}</span>
</div>

<div className="cart-summary-line">
<p>Subtotal</p>
<span>₹{total}</span>
</div>

<div className="cart-summary-line">
<p>Shipping</p>
<span>Free</span>
</div>

<div className="cart-total final-total">
<p>Total</p>
<span>₹{total}</span>
</div>


<div className="cart-actions-buttons">

<button
className="checkout-btn"
onClick={handleCheckout}
>
Proceed to Checkout
</button>

<button
className="clear-cart-btn"
onClick={clearCart}
>
Clear Cart
</button>

</div>

<div className="trust-message">
Secure checkout • Fast delivery
</div>

</div>

</div>

)}

</div>

);

};

export default StoreCartPage;