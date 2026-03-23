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
import { useStoreAuth } from "./StoreAuthContext";



/* =========================
TIER PRICE CALCULATOR
========================= */

const getTierData = (tiers, quantity) => {

    if (!tiers || tiers.length === 0) {
        return { price: 0, costPrice: 0 };
    }

    let selected = tiers[0];

    for (const tier of tiers) {

        const min = Number(tier.min_quantity);
        const max = Number(tier.max_quantity) || Infinity;

        if (quantity >= min && quantity <= max) {
            selected = tier;
        }

    }

    return {
        price: Number(selected.price) || 0,
        costPrice: Number(selected.costPrice) || 0
    };

};

const SHIPPING_FEE = 199;

const StoreCheckoutPage = () => {

    const { cart, clearCart, getSubcollectionQty } = useStoreCart();
    const navigate = useNavigate();

    const items = Object.values(cart);

    const [formData, setFormData] = useState({
        fullName: "",
        email: "",
        phoneNumber: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        pincode: ""
    });

    const [error, setError] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
const { user } = useStoreAuth();
    /* =========================
    FORM CHANGE
    ========================= */

    const handleInputChange = (e) => {

        const { name, value } = e.target;

        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

    };

    /* =========================
    TOTAL CALCULATIONS
    ========================= */

    const subtotal = items.reduce((sum, item) => {

        const subQty = getSubcollectionQty(item.subcollectionId);

        const { price } = getTierData(
            item.tieredPricing?.retail ?? [],
            subQty
        );

        return sum + price * item.quantity;

    }, 0);

    const totalAmount = subtotal + SHIPPING_FEE;

    /* =========================
    PLACE ORDER
    ========================= */

    const handleSubmitOrder = async (e) => {

        e.preventDefault();

        setIsProcessing(true);
        setError(null);

        if (items.length === 0) {
            setError("Your cart is empty.");
            setIsProcessing(false);
            return;
        }
        if (!user) {

navigate("/store/login", {
state: { redirectTo: "/store/checkout" }
});

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

        if (!fullName || !email || !phoneNumber || !addressLine1 || !city || !state || !pincode) {

            setError("Please fill all required shipping details.");
            setIsProcessing(false);
            return;

        }

        try {

            await runTransaction(db, async (transaction) => {

                const productDocs = [];

                /* =========================
                VALIDATE STOCK
                ========================= */

                for (const item of items) {

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

                    if (!snap.exists()) {
                        throw new Error(`${item.productName} no longer exists`);
                    }

                    const data = snap.data();

                    let stock = 0;

                    /* =========================
                    VARIANT PRODUCT
                    ========================= */

                    if (item.variation && data.variations) {

                        const match = data.variations.find(v =>
                            Object.keys(item.variation).every(
                                key => v[key] === item.variation[key]
                            )
                        );

                        stock = match?.quantity ?? 0;

                    } else {

                        /* =========================
                        NORMAL PRODUCT
                        ========================= */

                        stock = data.quantity ?? 0;

                    }

                    if (item.quantity > stock) {
                        throw new Error(`${item.productName} only has ${stock} available`);
                    }

                    productDocs.push({
                        ref,
                        data,
                        stock,
                        item
                    });

                }


                /* =========================
                REDUCE INVENTORY
                ========================= */

                productDocs.forEach(p => {

                    const { ref, data, item } = p;

                    /* =========================
                    VARIANT PRODUCT
                    ========================= */

                    if (item.variation && data.variations) {

                        const updatedVariations = data.variations.map(v => {

                            const isMatch = Object.keys(item.variation).every(
                                key => v[key] === item.variation[key]
                            );

                            if (!isMatch) return v;

                            return {
                                ...v,
                                quantity: v.quantity - item.quantity
                            };

                        });

                        transaction.update(ref, {
                            variations: updatedVariations
                        });

                    } else {

                        /* =========================
                        NORMAL PRODUCT
                        ========================= */

                        const newStock = p.stock - item.quantity;

                        transaction.update(ref, {
                            quantity: newStock
                        });

                    }

                });


                /* =========================
                CREATE ORDER ITEMS
                ========================= */

                const sanitizedItems = items.map(item => {

                    const subQty = getSubcollectionQty(item.subcollectionId);

                    const { price, costPrice } = getTierData(
                        item.tieredPricing?.retail ?? [],
                        subQty
                    );

                    const quantity = Number(item.quantity) || 0;

                    const profitPerUnit = price - costPrice;
                    const totalProfit = profitPerUnit * quantity;

                    return {

                        productId: item.productId ?? null,
                        productName: item.productName ?? "",
                        productCode: item.productCode ?? "",

                        variation: item.variation ?? null,

                        variationLabel: item.variation
                            ? Object.entries(item.variation)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" / ")
                            : null,
                        cartId: item.cartId ?? null,

                        image: item.image ?? "",
                        images: item.images ?? [],

                        quantity: quantity,

                        priceAtTimeOfOrder: price,
                        costPrice: costPrice,

                        profitPerUnit: profitPerUnit,
                        profit: totalProfit,

                        collectionId: item.collectionId ?? "",
                        subcollectionId: item.subcollectionId ?? ""

                    };

                });


                /* =========================
                TOTAL PROFIT
                ========================= */

                const totalProfit = sanitizedItems.reduce(
                    (sum, i) => sum + (i.profit || 0),
                    0
                );


                /* =========================
                CREATE ORDER DOCUMENT
                ========================= */

                const orderRef = doc(collection(db, "storeOrders"));

                const orderData = {

                    sellerId: items[0]?.sellerId ?? null,
customerId: user?.uid ?? null,
customerEmail: user?.email ?? null,
                    items: sanitizedItems,

                    subtotal: Number(subtotal) || 0,
                    shippingFee: SHIPPING_FEE,
                    totalAmount: Number(totalAmount) || 0,
                    totalItems: sanitizedItems.length,
                    totalUnits: sanitizedItems.reduce((s, i) => s + i.quantity, 0),
                    totalProfit: totalProfit,

                    billingInfo: {
                        fullName,
                        email,
                        phoneNumber,
                        addressLine1,
                        addressLine2: formData.addressLine2 ?? "",
                        city,
                        state,
                        pincode
                    },

                    status: "Pending",

                    createdAt: serverTimestamp()

                };

                transaction.set(orderRef, orderData);

            });

            clearCart();

            navigate("/order-success");

        } catch (err) {

            console.error("Checkout failed:", err);

            setError(err.message || "Order failed.");

        }

        setIsProcessing(false);

    };

    /* =========================
    UI
    ========================= */

    return (

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

                            {items.map(item => {

                                const subQty = getSubcollectionQty(item.subcollectionId);

                                const { price } = getTierData(
                                    item.tieredPricing?.retail ?? [],
                                    subQty
                                );

                                return (

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

                                            {item.variation && (
                                                <p style={{ fontSize: "13px", color: "#666" }}>
                                                    {Object.entries(item.variation)
                                                        .map(([k, v]) => `${k}: ${v}`)
                                                        .join(" / ")}
                                                </p>
                                            )}

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

            ) : (

                <p className="empty-cart-message">
                    Your cart is empty.
                </p>

            )}

        </div>

    );

};

export default StoreCheckoutPage;