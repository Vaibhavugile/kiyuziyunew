import React, { useEffect, useState } from "react";
import {
    collection,
    getDocs,
    updateDoc,
    doc
} from "firebase/firestore";

import { db } from "../firebase";

import jsPDF from "jspdf";

import "./AdminStoreOrders.css";

const AdminStoreOrders = () => {

    const [orders, setOrders] = useState([]);
    const [sellers, setSellers] = useState({});
    const [expandedOrder, setExpandedOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter,setStatusFilter] = useState("All");
    /* ================= LOAD DATA ================= */

    useEffect(() => {

        const loadData = async () => {

            try {

                const ordersSnap = await getDocs(collection(db, "storeOrders"));

                const ordersList = ordersSnap.docs
                    .map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }))
                    .sort((a, b) => {

                        const aTime = a.createdAt?.seconds || 0;
                        const bTime = b.createdAt?.seconds || 0;

                        return bTime - aTime; // newest first

                    });

                setOrders(ordersList);

                /* SELLERS */

                const sellersSnap = await getDocs(collection(db, "users"));

                const sellerMap = {};

                sellersSnap.docs.forEach(doc => {
                    sellerMap[doc.id] = doc.data();
                });

                setSellers(sellerMap);

            } catch (err) {
                console.error("Admin orders load error:", err);
            }

            setLoading(false);

        };

        loadData();

    }, []);

    /* ================= PROFIT ================= */

   const calculateOrderSummary = (order)=>{

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

    /* ================= UPDATE STATUS ================= */

    const updateOrderStatus = async (order, status) => {

        try {

            const orderRef = doc(db, "storeOrders", order.id);

            await updateDoc(orderRef, {
                status: status,
                updatedAt: Date.now()
            });

            setOrders(prev =>
                prev.map(o =>
                    o.id === order.id
                        ? { ...o, status }
                        : o
                )
            );

        } catch (err) {
            console.error("Status update failed", err);
        }

    };

    /* ================= PDF ================= */

    const getBase64FromUrl = async (url) => {

        const data = await fetch(url);
        const blob = await data.blob();

        return new Promise(resolve => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => resolve(reader.result);
        });

    };

    const generateOrderPDF = async (order) => {

        const docPdf = new jsPDF();

        docPdf.setFontSize(18);
        docPdf.text("Order Invoice", 14, 20);

        docPdf.setFontSize(11);

        docPdf.text(`Order ID: ${order.id}`, 14, 35);

        docPdf.text(`Customer: ${order.billingInfo?.fullName}`, 14, 42);

        docPdf.text(`Phone: ${order.billingInfo?.phoneNumber}`, 14, 49);

        docPdf.text(`City: ${order.billingInfo?.city}`, 14, 56);

        let y = 70;

        docPdf.setFontSize(14);
        docPdf.text("Products", 14, y);

        y += 10;

        for (const item of order.items) {

            let base64 = null;

            const imgUrl = item.images?.[0]?.url || item.image;

            try {
                base64 = await getBase64FromUrl(imgUrl);
            } catch { }

            if (base64) {
                docPdf.addImage(base64, "JPEG", 14, y, 25, 25);
            }

            docPdf.setFontSize(10);

            docPdf.text(item.productName, 45, y + 6);
            docPdf.text(`Code: ${item.productCode}`, 45, y + 12);

            if (item.variationLabel) {
                docPdf.text(`Variant: ${item.variationLabel}`, 45, y + 18);
            }

            docPdf.text(`Qty: ${item.quantity}`, 130, y + 6);
            docPdf.text(`Price: ₹${item.priceAtTimeOfOrder}`, 130, y + 12);

            y += 32;

        }

        y += 10;

        docPdf.setFontSize(12);

        docPdf.text(`Subtotal: ₹${order.subtotal}`, 14, y);
        docPdf.text(`Shipping: ₹${order.shippingFee}`, 14, y + 8);
        docPdf.text(`Total: ₹${order.totalAmount}`, 14, y + 16);

        docPdf.save(`order-${order.id}.pdf`);

    };

   const filteredOrders = orders.filter(order=>{

const seller = sellers[order.sellerId];

const searchText = search.toLowerCase();

const matchesSearch =
order.id.toLowerCase().includes(searchText) ||
order.billingInfo?.fullName?.toLowerCase().includes(searchText) ||
seller?.name?.toLowerCase().includes(searchText) ||
seller?.storeName?.toLowerCase().includes(searchText);

const matchesStatus =
statusFilter === "All" || order.status === statusFilter;

return matchesSearch && matchesStatus;

});
    /* ================= DATE ================= */

    const formatDate = (timestamp) => {

        if (!timestamp) return "";

        try {
            return new Date(timestamp.seconds * 1000).toLocaleString();
        } catch {
            return "";
        }

    };

    if (loading) {
        return <div className="admin-loading">Loading orders...</div>;
    }

    /* ================= UI ================= */

    return (

        <div className="admin-orders">

            <h1>Marketplace Orders</h1>
            <div className="orders-toolbar">

<input
type="text"
placeholder="Search order / customer / seller"
value={search}
onChange={(e)=>setSearch(e.target.value)}
className="orders-search"
/>

</div>
<select
value={statusFilter}
onChange={(e)=>setStatusFilter(e.target.value)}
className="orders-filter"
>

<option value="All">All Orders</option>
<option value="Pending">Pending</option>
<option value="ReadyToPack">Ready To Pack</option>
<option value="Cancelled">Cancelled</option>

</select>

            <div className="orders-table">

                {filteredOrders.map(order => {

                    const seller = sellers[order.sellerId];

                    const summary = calculateOrderSummary(order);
const profit = summary.profit;

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
                                    #{order.id.slice(0, 8)}
                                </div>

                                <div className="order-seller">
                                    {seller?.name || seller?.storeName || "Seller"}
                                </div>

                                <div className="order-customer">
                                    {order.billingInfo?.fullName}
                                </div>

                                <div className={`order-status status-${(order.status || "pending").toLowerCase()}`}>
                                    {order.status}
                                </div>

                                <div className="order-total">
                                    ₹{order.totalAmount}
                                </div>

                                <div className="order-profit">
₹{profit}
</div>

<div className="order-payable">
₹{summary.payableToAdmin}
</div>

                            </div>

                            {/* EXPANDED */}

                            {isExpanded && (

                                <div className="order-details">

                                    {/* CUSTOMER */}

                                    <div className="customer-block">

                                        <h3>Customer Details</h3>

                                        <p><strong>Name:</strong> {order.billingInfo?.fullName}</p>

                                        <p><strong>Email:</strong> {order.billingInfo?.email}</p>

                                        <p><strong>Phone:</strong> {order.billingInfo?.phoneNumber}</p>

                                        <p><strong>Address:</strong> {order.billingInfo?.addressLine1}</p>

                                        <p><strong>City:</strong> {order.billingInfo?.city}</p>

                                        <p><strong>Date:</strong> {formatDate(order.createdAt)}</p>

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
                                                    onClick={() => updateOrderStatus(order, "ReadyToPack")}
                                                >
                                                    Mark Paid
                                                </button>

                                            )}

                                            {order.status !== "Cancelled" && (

                                                <button
                                                    className="btn-cancel"
                                                    onClick={() => updateOrderStatus(order, "Cancelled")}
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

                                                </div>

                                            </div>

                                        ))}

                                    </div>

                                    {/* TOTALS */}

                                    <div className="order-summary-totals">

                                        <p><strong>Subtotal:</strong> ₹{order.subtotal}</p>

                                        <p><strong>Shipping:</strong> ₹{order.shippingFee}</p>

                                        <p><strong>Total:</strong> ₹{order.totalAmount}</p>

                                        <p><strong>Seller Profit:</strong> ₹{profit}</p>

<p><strong>Admin Payable:</strong> ₹{summary.payableToAdmin}</p>


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