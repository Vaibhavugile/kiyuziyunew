import React, { useEffect, useState } from "react";
import {
    collection,
    query,
    where,
    getDocs,
    orderBy, updateDoc
} from "firebase/firestore";

import { db } from "../../firebase";
import { useAuth } from "../../components/AuthContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import "./DropshipperOrders.css";
import { runTransaction, doc } from "firebase/firestore";
const DropshipperOrders = () => {

    const { currentUser } = useAuth();

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedOrder, setExpandedOrder] = useState(null);

    /* =========================
    LOAD SELLER ORDERS
    ========================= */

    useEffect(() => {

        const loadOrders = async () => {

            if (!currentUser) return;

            try {

                const q = query(
                    collection(db, "storeOrders"),
                    where("sellerId", "==", currentUser.uid),
                    orderBy("createdAt", "desc")
                );

                const snap = await getDocs(q);

                const list = snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                setOrders(list);

            } catch (err) {
                console.error("Orders load error:", err);
            }

            setLoading(false);

        };

        loadOrders();

    }, [currentUser]);

    /* =========================
    CALCULATE PROFIT
    ========================= */

    const calculateOrderProfit = (order) => {

        let profit = 0;

        (order.items || []).forEach(item => {

            const sellingPrice = item.priceAtTimeOfOrder || 0;
            const costPrice = item.costPrice || 0;

            profit += (sellingPrice - costPrice) * (item.quantity || 0);

        });

        return profit;

    };

    const cancelOrder = async (order) => {

console.log("🚨 Cancel order clicked:", order);

try {

await runTransaction(db, async (transaction) => {

/* =====================
READ PRODUCTS
===================== */

const productDocs = [];

for (const item of order.items) {

console.log("📦 Processing item:", item);

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
console.log("❌ Product not found:", item.productId);
continue;
}

productDocs.push({
ref,
data: snap.data(),
item
});

}

/* =====================
GROUP ITEMS BY PRODUCT
===================== */

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

/* =====================
UPDATE STOCK
===================== */

for (const group of Object.values(groupedProducts)) {

const { ref, data, items } = group;

console.log("📦 Updating grouped product:", ref.path);

/* ===== VARIANT PRODUCT ===== */

/* ===== VARIANT PRODUCT ===== */

if (data.variations && data.variations.length > 0) {

  let updatedVariations = [...data.variations];

  items.forEach(item => {

    if (!item.variation) return;

    const matchIndex = updatedVariations.findIndex(v =>
      Object.keys(item.variation)
        .filter(k => k !== "quantity")
        .every(key => v[key] === item.variation[key])
    );

    if (matchIndex === -1) {
      console.log("❌ Variant not found", item.variation);
      return;
    }

    const currentQty = updatedVariations[matchIndex].quantity || 0;
    const newQty = currentQty + item.quantity;

    updatedVariations[matchIndex] = {
      ...updatedVariations[matchIndex],
      quantity: newQty
    };

  });

  transaction.update(ref, {
    variations: updatedVariations
  });

}

/* ===== NORMAL PRODUCT ===== */

else {

  let newStock = data.quantity || 0;

  items.forEach(item => {
    newStock += item.quantity;
  });

  console.log(`📈 Normal stock updated to: ${newStock}`);

  transaction.update(ref, {
    quantity: newStock
  });

}

}

/* =====================
UPDATE ORDER STATUS
===================== */

const orderRef = doc(db, "storeOrders", order.id);

console.log("🧾 Updating order status → Cancelled");

transaction.update(orderRef, {
status: "Cancelled",
cancelledAt: Date.now()
});

});

console.log("✅ Transaction finished");

/* =====================
UPDATE UI STATE
===================== */

setOrders(prev =>
prev.map(o =>
o.id === order.id
? { ...o, status: "Cancelled" }
: o
)
);



} catch (err) {

console.error("❌ Cancel order failed:", err);

}

};

    const markPaid = async (order) => {

        try {

            const orderRef = doc(db, "storeOrders", order.id);

            await updateDoc(orderRef, {
                status: "ReadyToPack",
                paidAt: Date.now()
            });

            setOrders(prev =>
                prev.map(o =>
                    o.id === order.id
                        ? { ...o, status: "ReadyToPack" }
                        : o
                )
            );

            console.log("✅ Order marked as ReadyToPack");

        } catch (err) {

            console.error("❌ Mark paid failed:", err);

        }

    };
    const getBase64FromUrl = async (url) => {
        const data = await fetch(url);
        const blob = await data.blob();

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => resolve(reader.result);
        });
    };
    const generateOrderPDF = async (order) => {

        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.text("Order Invoice", 14, 20);

        doc.setFontSize(11);

        doc.text(`Order ID: ${order.id}`, 14, 35);
        doc.text(`Date: ${formatDate(order.createdAt)}`, 14, 42);

        /* CUSTOMER */

        doc.text("Customer Details:", 14, 55);

        doc.text(`Name: ${order.billingInfo?.fullName}`, 14, 63);
        doc.text(`Email: ${order.billingInfo?.email}`, 14, 70);
        doc.text(`Phone: ${order.billingInfo?.phoneNumber}`, 14, 77);

        doc.text(
            `Address: ${order.billingInfo?.addressLine1} ${order.billingInfo?.addressLine2}`,
            14,
            84
        );

        doc.text(
            `${order.billingInfo?.city}, ${order.billingInfo?.state} - ${order.billingInfo?.pincode}`,
            14,
            91
        );

        /* PRODUCTS */

        let y = 105;

        doc.setFontSize(14);
        doc.text("Products", 14, y);

        y += 10;

        for (const item of order.items) {

            const imgUrl = item.images?.[0]?.url || item.image;

            let base64 = null;

            try {
                base64 = await getBase64FromUrl(imgUrl);
            } catch (e) {
                console.warn("Image load failed", imgUrl);
            }

            /* IMAGE */

            if (base64) {
                doc.addImage(base64, "JPEG", 14, y, 25, 25);
            }

            /* TEXT */

            doc.setFontSize(10);

            doc.text(`Product: ${item.productName}`, 45, y + 6);
            doc.text(`Code: ${item.productCode}`, 45, y + 12);

            if (item.variationLabel) {
                doc.text(`Variant: ${item.variationLabel}`, 45, y + 18);
            }

            doc.text(`Qty: ${item.quantity}`, 120, y + 6);
            doc.text(`Price: Rs. ${item.priceAtTimeOfOrder}`, 120, y + 12);
            doc.text(`Subtotal: Rs. ${(item.priceAtTimeOfOrder * item.quantity).toFixed(2)}`, 120, y + 18);

            y += 32;

        }

        /* TOTALS */

        y += 10;

        doc.setFontSize(12);

        doc.text(`Subtotal: Rs. ${order.subtotal}`, 14, y);
        doc.text(`Shipping: Rs. ${order.shippingFee}`, 14, y + 8);
        doc.text(`Total: Rs. ${order.totalAmount}`, 14, y + 16);

        /* SAVE */

        doc.save(`order-${order.id}.pdf`);

    };

    /* =========================
    FORMAT DATE
    ========================= */

    const formatDate = (timestamp) => {

        if (!timestamp) return "";

        try {
            return new Date(timestamp.seconds * 1000)
                .toLocaleString();
        } catch {
            return "";
        }

    };

    /* =========================
    LOADING
    ========================= */

    if (loading) {
        return <div className="orders-loading">Loading orders...</div>;
    }

    /* =========================
    UI
    ========================= */

    return (

        <div className="dropshipper-orders">

            <h1>Orders</h1>

            {orders.length === 0 && (

                <div className="no-orders">
                    No orders yet
                </div>
            )}

            <div className="orders-table">

                {orders.map(order => {

                    const profit = calculateOrderProfit(order);
                    const isExpanded = expandedOrder === order.id;

                    return (

                        <div key={order.id} className="order-row">

                            {/* SUMMARY */}

                            <div
                                className="order-summary"
                                onClick={() => setExpandedOrder(
                                    isExpanded ? null : order.id
                                )}
                            >

                                <div className="order-id">
                                    #{order.orderNumber || order.id.slice(0, 8)}
                                </div>

                                <div className="order-customer">
                                    {order.billingInfo?.fullName || "Customer"}
                                </div>

                                <div className={`order-status status-${(order.status || "pending").toLowerCase()}`}>
                                    {order.status || "Pending"}
                                </div>

                                <div className="order-total">
                                    ₹{order.totalAmount || 0}
                                </div>

                                <div className="order-profit">
                                    ₹{profit}
                                </div>




                            </div>

                            {/* EXPANDED DETAILS */}

                            {isExpanded && (

                                <div className="order-details">

                                    {/* CUSTOMER */}

                                    <div className="customer-block">

                                        <h3>Customer Details</h3>

                                        <p>
                                            <strong>Name:</strong> {order.billingInfo?.fullName}
                                        </p>

                                        <p>
                                            <strong>Email:</strong> {order.billingInfo?.email}
                                        </p>

                                        <p>
                                            <strong>Phone:</strong> {order.billingInfo?.phoneNumber}
                                        </p>

                                        <p>
                                            <strong>Address:</strong>{" "}
                                            {order.billingInfo?.addressLine1}{" "}
                                            {order.billingInfo?.addressLine2}
                                        </p>

                                        <p>
                                            <strong>City:</strong> {order.billingInfo?.city}
                                        </p>

                                        <p>
                                            <strong>State:</strong> {order.billingInfo?.state}
                                        </p>

                                        <p>
                                            <strong>Pincode:</strong> {order.billingInfo?.pincode}
                                        </p>

                                        <p>
                                            <strong>Date:</strong> {formatDate(order.createdAt)}
                                        </p>
                                        <div className="order-actions">
                                        <button
                                            className="btn-view"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                generateOrderPDF(order);
                                            }}
                                        >
                                            View PDF
                                        </button>
                                        {order.status === "Pending" && (

                                            <button
                                                className="btn-paid"
                                                onClick={() => markPaid(order)}
                                            >
                                                Mark Paid
                                            </button>

                                        )}
                                        {order.status === "Pending" && (

                                            <button
                                                className="btn-cancel"
                                                onClick={() => cancelOrder(order)}
                                            >
                                                Cancel Order
                                            </button>

                                        )}
                                         </div>

                                    </div>

                                    {/* PRODUCTS */}

                                    <div className="items-block">

                                        <h3>Products</h3>

                                        {(order.items || []).map((item, i) => (

                                            <div key={i} className="order-item">

                                                <img
                                                    src={item.images?.[0]?.url || item.image}
                                                    alt={item.productName}
                                                />

                                                <div className="item-info">

                                                    <div className="item-name">
                                                        {item.productName}
                                                    </div>

                                                    <div className="item-meta">
                                                        Code: {item.productCode}
                                                    </div>

                                                    {/* VARIANT */}

                                                    {item.variationLabel && (

                                                        <div className="item-meta">
                                                            {item.variationLabel}
                                                        </div>
                                                    )}

                                                    <div className="item-meta">
                                                        Qty: {item.quantity}
                                                    </div>

                                                    <div className="item-meta">
                                                        Price: ₹{item.priceAtTimeOfOrder}
                                                    </div>

                                                    <div className="item-meta">
                                                        Cost: ₹{item.costPrice}
                                                    </div>

                                                    <div className="item-meta">
                                                        Subtotal: ₹{(item.priceAtTimeOfOrder * item.quantity).toFixed(2)}
                                                    </div>

                                                </div>

                                            </div>

                                        ))}

                                    </div>

                                    {/* ORDER TOTALS */}

                                    <div className="order-summary-totals">

                                        <p>
                                            <strong>Subtotal:</strong> ₹{order.subtotal || 0}
                                        </p>

                                        <p>
                                            <strong>Shipping:</strong> ₹{order.shippingFee || 0}
                                        </p>

                                        <p>
                                            <strong>Total:</strong> ₹{order.totalAmount || 0}
                                        </p>

                                        <p>
                                            <strong>Total Profit:</strong> ₹{profit}
                                        </p>

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

export default DropshipperOrders;
