import React, { useEffect, useMemo, useState } from "react";
import {
  db,
  collection,
  getDocs,
} from "../firebase";
import "./AdminPreorderReportPage.css";

const toDate = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value < 1e12 ? value * 1000 : value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const date = toDate(value);
  return date
    ? date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
};

const getStock = (product) => {
  if (product?.quantityType === "variants") {
    return (product.variants || []).reduce((sum, variant) => sum + Math.max(0, Number(variant.boxQuantity) || 0), 0);
  }
  return Math.max(0, Number(product?.boxQuantity ?? product?.totalBoxes) || 0);
};

const getOrderQuantity = (item) => Math.max(0, Number(item?.boxQuantity ?? item?.quantity) || 0);

const getCategoryLabel = (category) =>
  category?.title || category?.name || category?.categoryName || "Untitled collection";

const safeText = (value) => String(value ?? "").replace(/[,\r\n]+/g, " ").trim();

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((value) => {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function AdminPreorderReportPage() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [categoryId, setCategoryId] = useState("");
  const [productId, setProductId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const loadReportData = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [categorySnap, productSnap, orderSnap] = await Promise.all([
        getDocs(collection(db, "preorderCollections")),
        getDocs(collection(db, "preorderProducts")),
        getDocs(collection(db, "preorders")),
      ]);

      const categoryRows = categorySnap.docs.map((item) => ({ id: item.id, ...item.data() }));
      categoryRows.sort((a, b) => Number(a.showNumber ?? 9999) - Number(b.showNumber ?? 9999));

      const productRows = productSnap.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.status === "preorder" && item.categoryId)
        .sort((a, b) => String(a.productName || "").localeCompare(String(b.productName || "")));

      const orderRows = orderSnap.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));

      setCategories(categoryRows);
      setProducts(productRows);
      setOrders(orderRows);

      setCategoryId((current) => current || categoryRows[0]?.id || "");
    } catch (err) {
      console.error("Pre-order report load failed:", err);
      setError(err.message || "Could not load pre-order report data. Check Firestore permissions.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, []);

  const categoryProducts = useMemo(
    () => products.filter((product) => !categoryId || product.categoryId === categoryId),
    [products, categoryId]
  );

  useEffect(() => {
    if (!categoryProducts.some((product) => product.id === productId)) {
      setProductId(categoryProducts[0]?.id || "");
    }
  }, [categoryId, categoryProducts, productId]);

  const selectedProduct = products.find((product) => product.id === productId) || null;
  const selectedCategory = categories.find((category) => category.id === categoryId) || null;

  const productOrders = useMemo(() => {
    if (!selectedProduct) return [];
    return orders.flatMap((order) => {
      const matchingItems = (order.items || []).filter((item) => item.productId === selectedProduct.id);
      return matchingItems.map((item, index) => ({
        key: `${order.id}-${index}`,
        orderId: order.id,
        orderNumber: order.orderNumber || order.id,
        status: String(order.status || "placed").toLowerCase(),
        createdAt: order.createdAt,
        customer: order.customer || {},
        item,
        quantity: getOrderQuantity(item),
      }));
    }).sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
  }, [orders, selectedProduct]);

  const totalOrdered = productOrders.reduce((sum, row) => sum + row.quantity, 0);
  const remaining = selectedProduct ? getStock(selectedProduct) : 0;
  const explicitInitial = selectedProduct
    ? Number(selectedProduct.initialBoxes ?? selectedProduct.initialTotalBoxes ?? selectedProduct.stockAddedAtCreation)
    : NaN;
  const hasExplicitInitial = Number.isFinite(explicitInitial) && explicitInitial >= 0;
  const stockAdded = selectedProduct
    ? (hasExplicitInitial ? explicitInitial : remaining + totalOrdered)
    : 0;

  const statusCounts = useMemo(() => {
    const result = {};
    productOrders.forEach((row) => {
      result[row.status] = (result[row.status] || 0) + row.quantity;
    });
    return result;
  }, [productOrders]);

  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return productOrders.filter((row) => {
      const statusMatch = statusFilter === "all" || row.status === statusFilter;
      const customer = row.customer;
      const haystack = [
        row.orderNumber, customer.name, customer.phone, customer.email,
        customer.address, customer.city, customer.state, row.item.variantName,
      ].join(" ").toLowerCase();
      return statusMatch && (!term || haystack.includes(term));
    });
  }, [productOrders, search, statusFilter]);

  const exportReport = () => {
    if (!selectedProduct) return;
    const rows = [
      ["Product", selectedProduct.productName || "Unnamed product"],
      ["Collection", (selectedCategory ? getCategoryLabel(selectedCategory) : selectedProduct.categoryName || "")],
      ["Stock added / initial stock", stockAdded],
      ["Total ordered", totalOrdered],
      ["Remaining stock", remaining],
      ["Stock calculation", hasExplicitInitial ? "Saved initial quantity" : "Estimated: remaining stock + all recorded order quantities"],
      [],
      ["Order number", "Date", "Customer", "Phone", "Email", "Variant", "Quantity (boxes)", "Status", "Address"],
      ...visibleOrders.map((row) => [
        row.orderNumber,
        formatDate(row.createdAt),
        row.customer.name || "",
        row.customer.phone || "",
        row.customer.email || "",
        row.item.variantName || "",
        row.quantity,
        row.status,
        [row.customer.address, row.customer.city, row.customer.state, row.customer.pincode].filter(Boolean).join(", "),
      ]),
    ];
    downloadCsv(`${(selectedProduct.productName || "preorder-product").replace(/[^a-z0-9-_]/gi, "_")}-report.csv`, rows);
  };

  return (
    <main className="apr-page">
      <header className="apr-header">
        <div>
          <span className="apr-eyebrow">INVENTORY & CUSTOMER INSIGHTS</span>
          <h1>Pre-order <em>product report</em></h1>
          <p>Track stock, ordered boxes, remaining quantity and every customer who placed an order.</p>
        </div>
        <button className="apr-refresh" type="button" onClick={() => loadReportData(true)} disabled={loading || refreshing}>
          {refreshing ? "Refreshing..." : "↻ Refresh report"}
        </button>
      </header>

      {error && <div className="apr-error">{error}</div>}

      <section className="apr-filter-panel">
        <label>
          <span>SELECT COLLECTION</span>
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={loading}>
            <option value="">All collections</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{getCategoryLabel(category)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>SELECT PRODUCT</span>
          <select value={productId} onChange={(event) => setProductId(event.target.value)} disabled={loading || !categoryProducts.length}>
            <option value="">Choose a product</option>
            {categoryProducts.map((product) => (
              <option key={product.id} value={product.id}>{product.productName || "Unnamed product"}</option>
            ))}
          </select>
        </label>
        <div className="apr-filter-summary">
          <small>{loading ? "Loading report data..." : `${products.length} products · ${orders.length} orders loaded`}</small>
        </div>
      </section>

      {loading ? (
        <div className="apr-empty"><span className="apr-loader" />Loading pre-order reports...</div>
      ) : !selectedProduct ? (
        <div className="apr-empty">
          <strong>No product selected</strong>
          <span>Select a collection and product to view its stock and customer report.</span>
        </div>
      ) : (
        <>
          <section className="apr-product-banner">
            <div className="apr-product-image">
              {selectedProduct.thumbnail || selectedProduct.image || selectedProduct.mainImage
                ? <img src={selectedProduct.thumbnail || selectedProduct.image || selectedProduct.mainImage} alt={selectedProduct.productName || "Product"} />
                : <span>◇</span>}
            </div>
            <div className="apr-product-copy">
              <span>{(selectedCategory ? getCategoryLabel(selectedCategory) : selectedProduct.categoryName || "Collection")}</span>
              <h2>{selectedProduct.productName || "Unnamed product"}</h2>
              <small>Product ID: {selectedProduct.id}</small>
            </div>
            <button className="apr-export" type="button" onClick={exportReport}>↓ Export CSV</button>
          </section>

          <section className="apr-metrics">
            <article className="apr-metric apr-metric-primary">
              <span>STOCK ADDED / INITIAL</span>
              <strong>{stockAdded.toLocaleString("en-IN")}</strong>
              <small>{hasExplicitInitial ? "Saved initial quantity" : "Estimated from current stock + recorded orders"}</small>
            </article>
            <article className="apr-metric">
              <span>TOTAL ORDERED</span>
              <strong>{totalOrdered.toLocaleString("en-IN")}</strong>
              <small>{productOrders.length} order line(s) across customers</small>
            </article>
            <article className="apr-metric apr-metric-remaining">
              <span>REMAINING BOXES</span>
              <strong>{remaining.toLocaleString("en-IN")}</strong>
              <small>Live quantity in product inventory</small>
            </article>
            <article className="apr-metric">
              <span>CUSTOMERS</span>
              <strong>{new Set(productOrders.map((row) => row.customer.phone || row.customer.email || row.customer.name || row.orderId)).size}</strong>
              <small>Unique customer contacts</small>
            </article>
          </section>

          <section className="apr-status-strip">
            <div><span className="apr-dot apr-dot-placed" />Placed <b>{statusCounts.placed || 0}</b></div>
            <div><span className="apr-dot apr-dot-confirmed" />Confirmed <b>{statusCounts.confirmed || 0}</b></div>
            <div><span className="apr-dot apr-dot-processing" />Processing <b>{statusCounts.processing || 0}</b></div>
            <div><span className="apr-dot apr-dot-ready" />Ready <b>{statusCounts.ready || 0}</b></div>
            <div><span className="apr-dot apr-dot-completed" />Completed <b>{statusCounts.completed || 0}</b></div>
            <div><span className="apr-dot apr-dot-cancelled" />Cancelled <b>{statusCounts.cancelled || 0}</b></div>
          </section>

          {selectedProduct.quantityType === "variants" && (
            <section className="apr-variant-panel">
              <div className="apr-section-heading">
                <h3>Variant stock breakdown</h3>
                <span>Current available boxes by variant</span>
              </div>
              <div className="apr-variant-grid">
                {(selectedProduct.variants || []).map((variant, index) => {
                  const variantOrdered = productOrders
                    .filter((row) => row.item.variantName === variant.name)
                    .reduce((sum, row) => sum + row.quantity, 0);
                  return (
                    <article key={`${variant.name}-${index}`}>
                      <strong>{variant.name || `Variant ${index + 1}`}</strong>
                      <div><span>Ordered</span><b>{variantOrdered}</b></div>
                      <div><span>Remaining</span><b>{Math.max(0, Number(variant.boxQuantity) || 0)}</b></div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <section className="apr-orders-panel">
            <div className="apr-orders-heading">
              <div>
                <span className="apr-eyebrow">CUSTOMER-WISE BREAKDOWN</span>
                <h3>Who bought this product?</h3>
                <p>Each row shows the customer, boxes requested, order date and order status.</p>
              </div>
              <strong>{visibleOrders.length} records</strong>
            </div>

            <div className="apr-order-filters">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, phone, email or order number..." />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="placed">Placed</option>
                <option value="confirmed">Confirmed</option>
                <option value="processing">Processing</option>
                <option value="ready">Ready</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {visibleOrders.length ? (
              <div className="apr-table-wrap">
                <table className="apr-table">
                  <thead>
                    <tr>
                      <th>ORDER</th>
                      <th>CUSTOMER</th>
                      <th>CONTACT</th>
                      <th>VARIANT</th>
                      <th>BOXES</th>
                      <th>DATE</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOrders.map((row) => (
                      <tr key={row.key}>
                        <td><strong className="apr-order-number">{row.orderNumber}</strong></td>
                        <td>
                          <strong>{row.customer.name || "Customer name unavailable"}</strong>
                          <small>{[row.customer.city, row.customer.state, row.customer.pincode].filter(Boolean).join(", ")}</small>
                        </td>
                        <td>
                          <span>{row.customer.phone || "—"}</span>
                          <small>{row.customer.email || ""}</small>
                        </td>
                        <td>{row.item.variantName || "Standard"}</td>
                        <td><strong className="apr-quantity">{row.quantity}</strong></td>
                        <td>{formatDate(row.createdAt)}</td>
                        <td><span className={`apr-status apr-status-${row.status}`}>{row.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="apr-no-orders">
                <strong>No matching orders</strong>
                <span>No customer orders match the selected product and filters.</span>
              </div>
            )}
          </section>

          <p className="apr-data-note">
            Stock added is shown from a saved initial quantity when available. For older products without that field, it is estimated as current remaining stock plus all recorded order quantities. Cancelled orders are included in this estimate because the current checkout flow deducts stock when an order is placed and cancellation does not automatically restore it.
          </p>
        </>
      )}
    </main>
  );
}
