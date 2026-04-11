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

const SHIPPING_FEE = 0;

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
                READ PRODUCTS
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

                    productDocs.push({
                        ref,
                        data: snap.data(),
                        item
                    });

                }

                /* =========================
                GROUP ITEMS BY PRODUCT
                ========================= */

                const groupedProducts = {};

                productDocs.forEach(p => {

                    const key = p.ref.path;

                    if (!groupedProducts[key]) {
                        groupedProducts[key] = {
                            ref: p.ref,
                            data: JSON.parse(JSON.stringify(p.data)),
                            items: []
                        };
                    }

                    groupedProducts[key].items.push(p.item);

                });

                /* =========================
                VALIDATE + UPDATE STOCK
                ========================= */

                for (const group of Object.values(groupedProducts)) {

                    const { ref, data, items } = group;

                    /* ===== VARIANT PRODUCT ===== */

                  /* ===== VARIANT PRODUCT ===== */

if (data.variations && data.variations.length > 0) {

    let updatedVariations = [...data.variations];

    items.forEach(item => {

        const matchIndex = updatedVariations.findIndex(v => {

            const variantKeys = Object.keys(v).filter(k => k !== "quantity");

            return variantKeys.every(key => {

                const cartValue = String(item.variation?.[key] || "")
                    .trim()
                    .toLowerCase();

                const dbValue = String(v?.[key] || "")
                    .trim()
                    .toLowerCase();

                return cartValue === dbValue;

            });

        });

        if (matchIndex === -1) {

            console.error("VARIANT MISMATCH", {
                cartVariation: item.variation,
                availableVariations: updatedVariations
            });

            throw new Error(`${item.productName} ${item.productCode} variant not found`);

        }

        const currentQty = Number(updatedVariations[matchIndex].quantity || 0);

        if (item.quantity > currentQty) {
            throw new Error(`${item.productName} only has ${currentQty} available`);
        }

        updatedVariations[matchIndex] = {
            ...updatedVariations[matchIndex],
            quantity: currentQty - item.quantity
        };

    });

    transaction.update(ref, {
        variations: updatedVariations
    });

}

/* ===== NORMAL PRODUCT (NO VARIANTS) ===== */

else {

    let newStock = Number(data.quantity || 0);

    items.forEach(item => {

        if (item.quantity > newStock) {
            throw new Error(`${item.productName} only has ${newStock} available`);
        }

        newStock -= item.quantity;

    });

    transaction.update(ref, {
        quantity: newStock
    });

}

                }

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

                        quantity,

                        priceAtTimeOfOrder: price,
                        costPrice,

                        profitPerUnit,
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

                    totalProfit,

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