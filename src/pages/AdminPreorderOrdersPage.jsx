import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  db,
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp,
} from "../firebase";
import "./AdminPreorderOrdersPage.css";

const ORDERS_COLLECTION = "preorders";
const STATUS_OPTIONS = ["placed", "confirmed", "processing", "ready", "completed", "cancelled"];
const PAGE_SIZE = 12;

// Older orders may store the line quantity as `quantity`; newer orders use `boxQuantity`.
const getLineBoxes = (item = {}) =>
  Math.max(0, Number(item.boxQuantity ?? item.quantity) || 0);

const getOrderBoxes = (order = {}) =>
  Math.max(0, Number(order.totalBoxes) || (order.items || []).reduce((sum, item) => sum + getLineBoxes(item), 0));

const safeDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  return null;
};

const formatDate = (value, includeTime = true) => {
  const date = safeDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", includeTime
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" }
  ).format(date);
};

const formatAddress = (customer = {}) => [
  customer.address,
  customer.city,
  customer.state,
  customer.pincode,
].filter(Boolean).join(", ") || "No address provided";

const statusLabel = (status = "placed") =>
  String(status).replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export default function AdminPreorderOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [updatingId, setUpdatingId] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [imageZoom, setImageZoom] = useState(1);

  const loadOrders = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const ordersQuery = query(
        collection(db, ORDERS_COLLECTION),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(ordersQuery);
      const rows = snapshot.docs.map((orderDoc) => ({
        id: orderDoc.id,
        ...orderDoc.data(),
      }));
      setOrders(rows);
      setSelectedOrder((current) => current ? rows.find((row) => row.id === current.id) || null : null);
    } catch (err) {
      console.error("Pre-order orders load failed:", err);
      setError(err.message || "Unable to load pre-order orders. Check Firestore permissions.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (!imagePreview) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setImagePreview(null);
      if (event.key === "+" || event.key === "=") setImageZoom((zoom) => Math.min(3, Number((zoom + 0.25).toFixed(2))));
      if (event.key === "-") setImageZoom((zoom) => Math.max(1, Number((zoom - 0.25).toFixed(2))));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imagePreview]);

  const stats = useMemo(() => {
    const totalBoxes = orders.reduce((sum, order) => sum + getOrderBoxes(order), 0);
    const pending = orders.filter((order) => ["placed", "pending"].includes(String(order.status || "placed").toLowerCase())).length;
    const active = orders.filter((order) => ["confirmed", "processing", "ready"].includes(String(order.status || "").toLowerCase())).length;
    const completed = orders.filter((order) => String(order.status || "").toLowerCase() === "completed").length;
    return { total: orders.length, pending, active, completed, totalBoxes };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startWeek = new Date(startToday);
    startWeek.setDate(startWeek.getDate() - 6);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return orders.filter((order) => {
      const status = String(order.status || "placed").toLowerCase();
      if (statusFilter !== "all" && status !== statusFilter) return false;

      const created = safeDate(order.createdAt);
      if (dateFilter === "today" && (!created || created < startToday)) return false;
      if (dateFilter === "week" && (!created || created < startWeek)) return false;
      if (dateFilter === "month" && (!created || created < startMonth)) return false;

      if (!term) return true;
      const customer = order.customer || {};
      const itemText = (order.items || []).map((item) => `${item.productName || ""} ${item.categoryName || ""} ${item.variantName || ""}`).join(" ");
      const haystack = [
        order.orderNumber,
        order.id,
        customer.name,
        customer.phone,
        customer.email,
        customer.address,
        customer.city,
        customer.state,
        customer.pincode,
        itemText,
      ].join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [orders, search, statusFilter, dateFilter]);

  useEffect(() => setPage(1), [search, statusFilter, dateFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const visibleOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const changeStatus = async (order, nextStatus) => {
    if (!order?.id || !STATUS_OPTIONS.includes(nextStatus)) return;
    const previousStatus = String(order.status || "placed").toLowerCase();
    if (previousStatus === nextStatus) return;
    setUpdatingId(order.id);
    setError("");
    try {
      await updateDoc(doc(db, ORDERS_COLLECTION, order.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: nextStatus } : item));
      setSelectedOrder((current) => current?.id === order.id ? { ...current, status: nextStatus } : current);
    } catch (err) {
      console.error("Pre-order status update failed:", err);
      setError(err.message || "Could not update this order status.");
    } finally {
      setUpdatingId("");
    }
  };

  const exportCsv = () => {
    const headings = ["Order Number", "Order ID", "Date", "Status", "Customer", "Phone", "Email", "Address", "Products", "Total Boxes", "Payment Required"];
    const rows = filteredOrders.map((order) => {
      const customer = order.customer || {};
      const products = (order.items || []).map((item) => `${item.productName || "Product"}${item.variantName ? ` (${item.variantName})` : ""} x ${getLineBoxes(item)}`).join("; ");
      return [order.orderNumber, order.id, formatDate(order.createdAt), order.status || "placed", customer.name, customer.phone, customer.email, formatAddress(customer), products, order.totalBoxes, order.paymentRequired ? "Yes" : "No"];
    });
    const csv = [headings, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `preorder-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="admin-preorder-orders">
      <header className="apo-header">
        <div>
          <span className="apo-eyebrow">ORDER MANAGEMENT</span>
          <h1>Pre-order <em>orders</em></h1>
          <p>Review customer requests, track fulfilment and manage every pre-order in one place.</p>
        </div>
        <div className="apo-header-actions">
          <button type="button" className="apo-button apo-button-light" onClick={exportCsv} disabled={!filteredOrders.length}>↓ Export CSV</button>
          <button type="button" className="apo-button apo-button-dark" onClick={() => loadOrders(true)} disabled={refreshing}>{refreshing ? "Refreshing…" : "↻ Refresh orders"}</button>
        </div>
      </header>

      {error && <div className="apo-alert">{error}</div>}

      <section className="apo-stats" aria-label="Order summary">
        <article className="apo-stat-card"><span className="apo-stat-icon">▤</span><div><small>ALL ORDERS</small><strong>{stats.total}</strong><span>All recorded requests</span></div></article>
        <article className="apo-stat-card"><span className="apo-stat-icon apo-icon-amber">◷</span><div><small>NEW / PENDING</small><strong>{stats.pending}</strong><span>Awaiting confirmation</span></div></article>
        <article className="apo-stat-card"><span className="apo-stat-icon apo-icon-blue">↗</span><div><small>IN PROGRESS</small><strong>{stats.active}</strong><span>Confirmed to ready</span></div></article>
        <article className="apo-stat-card"><span className="apo-stat-icon apo-icon-green">✓</span><div><small>COMPLETED</small><strong>{stats.completed}</strong><span>Successfully fulfilled</span></div></article>
        <article className="apo-stat-card apo-stat-total"><span className="apo-stat-icon apo-icon-gold">▦</span><div><small>TOTAL BOXES</small><strong>{stats.totalBoxes.toLocaleString("en-IN")}</strong><span>Across all orders</span></div></article>
      </section>

      <section className="apo-orders-panel">
        <div className="apo-panel-heading">
          <div><span className="apo-eyebrow">PRE-ORDER REGISTER</span><h2>All orders <span>{filteredOrders.length}</span></h2></div>
          <div className="apo-filter-count">Showing {filteredOrders.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filteredOrders.length)} of {filteredOrders.length}</div>
        </div>

        <div className="apo-toolbar">
          <label className="apo-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, customer, phone or product…" /></label>
          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
          <select aria-label="Filter by date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
            <option value="all">All dates</option><option value="today">Today</option><option value="week">Last 7 days</option><option value="month">This month</option>
          </select>
        </div>

        {loading ? (
          <div className="apo-state"><span className="apo-spinner" /><strong>Loading pre-order orders…</strong><small>Fetching the latest customer requests</small></div>
        ) : !filteredOrders.length ? (
          <div className="apo-state apo-empty"><span>▤</span><strong>{orders.length ? "No matching orders" : "No pre-orders yet"}</strong><small>{orders.length ? "Try changing your search or filters." : "Customer pre-orders will appear here after checkout."}</small></div>
        ) : (
          <>
            <div className="apo-table-wrap">
              <table className="apo-table">
                <thead><tr><th>ORDER</th><th>CUSTOMER</th><th>ITEMS</th><th>BOXES</th><th>DATE</th><th>STATUS</th><th /></tr></thead>
                <tbody>
                  {visibleOrders.map((order) => {
                    const customer = order.customer || {};
                    const items = Array.isArray(order.items) ? order.items : [];
                    const status = String(order.status || "placed").toLowerCase();
                    return (
                      <tr key={order.id}>
                        <td><button type="button" className="apo-order-number" onClick={() => setSelectedOrder(order)}>{order.orderNumber || `#${String(order.id || "").slice(0, 8)}`}</button><small className="apo-order-id">{String(order.id || "").slice(0, 10)}</small></td>
                        <td><strong className="apo-customer-name">{customer.name || "Unnamed customer"}</strong><small className="apo-customer-phone">{customer.phone || "No phone"}</small></td>
                        <td><strong>{items.length} product{items.length === 1 ? "" : "s"}</strong><small className="apo-item-preview">{items.slice(0, 2).map((item) => item.productName).filter(Boolean).join(", ")}{items.length > 2 ? ` +${items.length - 2} more` : ""}</small></td>
                        <td><strong className="apo-box-count">{getOrderBoxes(order)}</strong></td>
                        <td><span className="apo-date">{formatDate(order.createdAt, false)}</span><small className="apo-time">{formatDate(order.createdAt).split(", ").slice(-1)[0]}</small></td>
                        <td><span className={`apo-status apo-status-${status}`}>{statusLabel(status)}</span></td>
                        <td><button type="button" className="apo-view-button" onClick={() => setSelectedOrder(order)}>View ↗</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="apo-pagination"><span>Page {page} of {pageCount}</span><div><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>← Previous</button><button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>Next →</button></div></div>
          </>
        )}
      </section>

      {selectedOrder && <div className="apo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedOrder(null); }}>
        <aside className="apo-detail-drawer" role="dialog" aria-modal="true" aria-label="Pre-order details">
          <div className="apo-drawer-header"><div><span className="apo-eyebrow">ORDER DETAILS</span><h2>{selectedOrder.orderNumber || `#${String(selectedOrder.id || "").slice(0, 8)}`}</h2><small>Placed {formatDate(selectedOrder.createdAt)}</small></div><button type="button" className="apo-close" onClick={() => setSelectedOrder(null)} aria-label="Close details">×</button></div>
          <div className="apo-drawer-content">
            <section className="apo-detail-section"><div className="apo-detail-section-title"><h3>Order status</h3><span className={`apo-status apo-status-${String(selectedOrder.status || "placed").toLowerCase()}`}>{statusLabel(selectedOrder.status || "placed")}</span></div>
              <label className="apo-status-field"><span>Update status</span><select value={selectedOrder.status || "placed"} disabled={updatingId === selectedOrder.id} onChange={(event) => changeStatus(selectedOrder, event.target.value)}>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
              {updatingId === selectedOrder.id && <small className="apo-saving">Saving status…</small>}
            </section>
            <section className="apo-detail-section"><h3>Customer information</h3><div className="apo-customer-detail"><strong>{selectedOrder.customer?.name || "Unnamed customer"}</strong><a href={selectedOrder.customer?.phone ? `tel:${selectedOrder.customer.phone}` : undefined}>{selectedOrder.customer?.phone || "Phone not provided"}</a>{selectedOrder.customer?.email && <a href={`mailto:${selectedOrder.customer.email}`}>{selectedOrder.customer.email}</a>}<p>{formatAddress(selectedOrder.customer)}</p></div></section>
            <section className="apo-detail-section"><div className="apo-detail-section-title"><h3>Ordered products</h3><span>{(selectedOrder.items || []).length} line items</span></div>
              <div className="apo-detail-items">{(selectedOrder.items || []).map((item, index) => <article className="apo-detail-item" key={`${item.productId || item.productName}-${item.variantName || "base"}-${index}`}><div className="apo-detail-product-image">{item.image ? <button type="button" className="apo-image-open" onClick={() => { setImagePreview({ src: item.image, alt: item.productName || "Pre-order product" }); setImageZoom(1); }} aria-label={`Zoom ${item.productName || "product image"}`}><img src={item.image} alt={item.productName || ""} /><span className="apo-image-zoom-hint">⌕</span></button> : <span>▦</span>}</div><div className="apo-detail-product-info"><strong>{item.productName || "Pre-order product"}</strong><small>{item.categoryName || "Uncategorised"}{item.variantName ? ` · ${item.variantName}` : ""}</small><span>{item.quantityType === "variants" ? "Variant order" : "Box order"}</span></div><div className="apo-detail-quantity"><strong>{getLineBoxes(item)}</strong><small>boxes</small></div></article>)}</div>
              <div className="apo-detail-total"><span>Total boxes</span><strong>{getOrderBoxes(selectedOrder)}</strong></div>
            </section>
            <section className="apo-detail-section apo-payment-note"><span>◇</span><div><strong>No payment collected</strong><small>This pre-order record does not require payment at checkout.</small></div></section>
            <section className="apo-detail-meta"><div><span>Order document ID</span><code>{selectedOrder.id}</code></div><div><span>Last updated</span><strong>{formatDate(selectedOrder.updatedAt)}</strong></div></section>
          </div>
          <div className="apo-drawer-footer"><span className="apo-footer-note">Order records are retained for your records.</span><button
  type="button"
  className="apo-button apo-button-dark"
  onClick={() => window.print()}
>
  Print details ↗
</button></div>
        </aside>
      </div>}

      {imagePreview && <div className="apo-image-lightbox" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setImagePreview(null); }}>
        <div className="apo-lightbox-top"><span>PRODUCT IMAGE</span><div className="apo-lightbox-controls"><button type="button" onClick={() => setImageZoom((zoom) => Math.max(1, Number((zoom - 0.25).toFixed(2))))} disabled={imageZoom <= 1} aria-label="Zoom out">−</button><span>{Math.round(imageZoom * 100)}%</span><button type="button" onClick={() => setImageZoom((zoom) => Math.min(3, Number((zoom + 0.25).toFixed(2))))} disabled={imageZoom >= 3} aria-label="Zoom in">+</button><button type="button" onClick={() => setImageZoom(1)} className="apo-zoom-reset">Reset</button><button type="button" className="apo-lightbox-close" onClick={() => setImagePreview(null)} aria-label="Close image">×</button></div></div>
        <div className="apo-lightbox-stage"><img src={imagePreview.src} alt={imagePreview.alt} style={{ transform: `scale(${imageZoom})` }} draggable="false" /></div>
        <small className="apo-lightbox-tip">Use + / − to zoom · Press Esc to close · Scroll or drag the image area to inspect details</small>
      </div>}
    </main>
  );
}
