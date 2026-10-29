// src/pages/CustomerActivityReport.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthContext';
import './CustomerActivityReport.css';

const asDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const startOfDay = (value) => {
  const d = new Date(`${value}T00:00:00`);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const endOfDay = (value) => {
  const d = new Date(`${value}T00:00:00`);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
};
const dateInput = (date) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
};
const money = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(Number(value || 0));
const dateTime = (value) => {
  const d = asDate(value);
  return d ? d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
};
const inRange = (value, from, to) => {
  const d = asDate(value);
  if (!d || !from || !to || from > to) return false;
  return d >= startOfDay(from) && d < endOfDay(to);
};
const eventTime = (event) => asDate(event?.createdAt) || asDate(event?.clientTimestamp);
const customerName = (u) => u.name || u.fullName || u.displayName || 'Unnamed customer';
const customerPhone = (u) => u.mobile || u.phone || u.phoneNumber || '';
const getUid = (user) => String(user?.uid || user?.id || '');
const eventIs = (events, types) => events.some((e) => types.includes(e.type));
const removedQuantityInRange = (events = [], from, to) => events.reduce((sum, event) => {
  if (event.type !== 'cart_items_removed' || !inRange(eventTime(event), from, to)) return sum;
  return sum + Math.max(0, Number(event.details?.removedQuantity || 0));
}, 0);
const orderEventTypes = ['order_placed', 'checkout_payment_completed'];
const checkoutEventTypes = [
  'checkout_started', 'checkout_details_submitted', 'checkout_order_created',
  'checkout_payment_started', 'checkout_payment_completed', 'checkout_payment_failed',
  'checkout_payment_verification_failed', 'checkout_payment_dismissed',
  'checkout_order_failed', 'order_placed',
];

const getCheckoutState = (events = []) => {
  const sorted = [...events].sort((a, b) =>
    (eventTime(a)?.getTime() || 0) - (eventTime(b)?.getTime() || 0));
  const latestStart = [...sorted].reverse().find((e) => e.type === 'checkout_started');
  const lastOrder = [...sorted].reverse().find((e) => orderEventTypes.includes(e.type));
  if (!latestStart) return { started: false, candidate: false, latestStart: null, lastOrder: null };
  const startMs = eventTime(latestStart)?.getTime() || 0;
  const orderMs = eventTime(lastOrder)?.getTime() || 0;
  const candidate = startMs > orderMs;
  return { started: true, candidate, latestStart, lastOrder };
};

const csvCell = (value) => {
  let text = String(value ?? '');
  // Protect spreadsheet users from formula injection in customer-entered fields.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const downloadCsv = (rows) => {
  const headers = [
    'Name', 'Phone', 'Email', 'Role', 'Signup', 'Last login',
    'Cart items', 'Cart value', 'Items removed in range', 'Checkout state', 'Last activity',
    'Follow-up status', 'Next follow-up', 'Assigned staff', 'Interest', 'Notes',
  ];
  const body = rows.map((r) => [
    customerName(r.user), customerPhone(r.user), r.user.email || '', r.user.role || '',
    dateTime(r.user.createdAt), dateTime(r.user.lastLogin), r.cart?.itemCount || 0,
    r.cart?.cartValue || 0, removedQuantityInRange(r.events, dateInput(new Date()), dateInput(new Date())),
    r.checkout.candidate ? 'Checkout incomplete candidate' : r.checkout.started ? 'Checkout started' : 'No checkout event',
    dateTime(r.lastActivityAt), r.followup?.status || 'Not called',
    dateTime(r.followup?.nextFollowUpAt), r.followup?.assignedTo || '',
    r.followup?.interest || '', r.followup?.notes || '',
  ].map(csvCell).join(','));
  const blob = new Blob(['\ufeff', [headers.map(csvCell).join(','), ...body].join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `customer-activity-${dateInput(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export default function CustomerActivityReport() {
  const { currentUser, userRole, isLoading: authLoading } = useAuth();
  const today = dateInput(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const [users, setUsers] = useState([]);
  const [carts, setCarts] = useState({});
  const [eventsByUid, setEventsByUid] = useState({});
  const [followups, setFollowups] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    status: 'Not called', nextFollowUpAt: '', assignedTo: '', notes: '', interest: '',
  });

  const load = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    try {
      // Keep this page protected by your existing admin/staff route and Firestore rules.
      const [userSnap, cartSnap, eventSnap, followupSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'customerCarts')),
        getDocs(collection(db, 'customerActivity')),
        getDocs(query(collection(db, 'customerFollowups'), orderBy('updatedAt', 'desc')))
          .catch(() => getDocs(collection(db, 'customerFollowups'))),
      ]);

      const loadedUsers = userSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const cartMap = {};
      cartSnap.docs.forEach((d) => {
        const cartData = { id: d.id, ...d.data() };
        // Index by both document ID and stored UID to handle legacy cart snapshots.
        cartMap[d.id] = cartData;
        if (cartData.uid) cartMap[String(cartData.uid)] = cartData;
      });

      const eventMap = {};
      eventSnap.docs.forEach((d) => {
        const event = { id: d.id, ...d.data() };
        if (!event.uid) return;
        if (!eventMap[event.uid]) eventMap[event.uid] = [];
        eventMap[event.uid].push(event);
      });
      Object.values(eventMap).forEach((list) => list.sort((a, b) =>
        (eventTime(b)?.getTime() || 0) - (eventTime(a)?.getTime() || 0)));

      const followMap = {};
      followupSnap.docs.forEach((d) => {
        const f = { id: d.id, ...d.data() };
        if (!f.uid) return;
        if (!followMap[f.uid] ||
          (asDate(f.updatedAt)?.getTime() || 0) >
          (asDate(followMap[f.uid].updatedAt)?.getTime() || 0)) {
          followMap[f.uid] = f;
        }
      });

      setUsers(loadedUsers);
      setCarts(cartMap);
      setEventsByUid(eventMap);
      setFollowups(followMap);
    } catch (e) {
      console.error('Customer activity report load failed:', e);
      setError('Could not load customer activity. Check your admin access, Firestore rules, collection names, and browser console.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  const allRows = useMemo(() => users.map((user) => {
    const uid = getUid(user);
    const events = eventsByUid[uid] || eventsByUid[user.id] || [];
    const cart = carts[uid] || carts[user.id] || null;
    const followup = followups[uid] || followups[user.id] || null;
    const lastActivityAt = events.reduce((latest, event) => {
      const d = eventTime(event);
      return d && (!latest || d > latest) ? d : latest;
    }, null);
    const checkout = getCheckoutState(events);
    return { user, uid, events, cart, followup, checkout, lastActivityAt };
  }), [users, carts, eventsByUid, followups]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      const signupInRange = inRange(r.user.createdAt, from, to);
      const loginInRange = inRange(r.user.lastLogin, from, to);
      const eventInRange = r.events.some((e) => inRange(eventTime(e), from, to));
      const cartHasItems = Number(r.cart?.itemCount || 0) > 0;
      const needsFollowup = !r.followup ||
        ['Not called', 'No answer', 'Busy', 'Follow-up required'].includes(r.followup.status);
      const hasCheckoutInRange = r.events.some((e) =>
        checkoutEventTypes.includes(e.type) && inRange(eventTime(e), from, to));
      const matchesSearch = !q || [
        customerName(r.user), customerPhone(r.user), r.user.email, r.user.role,
        r.user.address, r.followup?.notes, r.followup?.interest,
        ...(r.cart?.items || []).map((item) => `${item.name || ''} ${item.sku || ''}`),
      ].some((v) => String(v || '').toLowerCase().includes(q));

      let matchesFilter = true;
      switch (activityFilter) {
        case 'signup': matchesFilter = signupInRange; break;
        case 'login': matchesFilter = loginInRange; break;
        case 'cart': matchesFilter = cartHasItems; break;
        case 'removed': matchesFilter = r.events.some((e) => e.type === 'cart_items_removed' && inRange(eventTime(e), from, to)); break;
        case 'checkout': matchesFilter = hasCheckoutInRange; break;
        case 'incomplete': matchesFilter = r.checkout.candidate; break;
        case 'followup': matchesFilter = needsFollowup; break;
        case 'homepage': matchesFilter = r.events.some((e) =>
          ['homepage_view', 'homepage_active'].includes(e.type) && inRange(eventTime(e), from, to)); break;
        case 'product': matchesFilter = r.events.some((e) =>
          ['product_list_view', 'product_add_to_cart', 'products_page_view', 'collection_click'].includes(e.type) &&
          inRange(eventTime(e), from, to)); break;
        default: matchesFilter = signupInRange || loginInRange || eventInRange || cartHasItems || needsFollowup;
      }
      const rangeMatches = ['cart', 'incomplete', 'followup'].includes(activityFilter)
        ? true
        : signupInRange || loginInRange || eventInRange;
      return matchesSearch && matchesFilter && rangeMatches;
    }).sort((a, b) => {
      const aTime = Math.max(
        asDate(a.lastActivityAt)?.getTime() || 0,
        asDate(a.user.lastLogin)?.getTime() || 0,
        asDate(a.user.createdAt)?.getTime() || 0,
      );
      const bTime = Math.max(
        asDate(b.lastActivityAt)?.getTime() || 0,
        asDate(b.user.lastLogin)?.getTime() || 0,
        asDate(b.user.createdAt)?.getTime() || 0,
      );
      return bTime - aTime;
    });
  }, [allRows, from, to, search, activityFilter]);

  const todayStart = startOfDay(today);
  const tomorrow = dateInput(new Date(Date.now() + 86400000));
  const todayEnd = startOfDay(tomorrow);
  const newToday = users.filter((u) => {
    const d = asDate(u.createdAt); return d && d >= todayStart && d < todayEnd;
  }).length;
  const loggedToday = users.filter((u) => {
    const d = asDate(u.lastLogin); return d && d >= todayStart && d < todayEnd;
  }).length;
  // Summary cards and the cart filter use the same user-linked rows.
  // Orphaned/stale customerCarts documents are not counted as customers.
  const customersWithCart = allRows.filter((r) => Number(r.cart?.itemCount || 0) > 0);
  const activeCarts = customersWithCart.length;
  const trackedCartValue = customersWithCart.reduce((sum, r) =>
    sum + Number(r.cart?.cartValue || 0), 0);
  const checkoutStartedToday = Object.values(eventsByUid).flat().filter((e) =>
    e.type === 'checkout_started' && inRange(eventTime(e), today, today)).length;
  const incompleteCheckoutCount = allRows.filter((r) => r.checkout.candidate).length;
  const removedQuantityToday = Object.values(eventsByUid).flat().reduce((sum, event) => {
    if (event.type !== 'cart_items_removed' || !inRange(eventTime(event), today, today)) return sum;
    return sum + Math.max(0, Number(event.details?.removedQuantity || 0));
  }, 0);
  const removalActionsToday = Object.values(eventsByUid).flat().filter((event) =>
    event.type === 'cart_items_removed' && inRange(eventTime(event), today, today)).length;

  const openCustomer = (row) => {
    setSelected(row);
    const f = row.followup || {};
    const nextDate = asDate(f.nextFollowUpAt);
    setForm({
      status: f.status || 'Not called',
      nextFollowUpAt: nextDate ? dateInput(nextDate) : '',
      assignedTo: f.assignedTo || '',
      notes: f.notes || '',
      interest: f.interest || '',
    });
  };

  const saveFollowup = async (event) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const uid = selected.uid || getUid(selected.user);
      const record = {
        uid,
        customerName: customerName(selected.user),
        mobile: customerPhone(selected.user),
        status: form.status,
        assignedTo: form.assignedTo.trim(),
        notes: form.notes.trim(),
        interest: form.interest.trim(),
        nextFollowUpAt: form.nextFollowUpAt
          ? Timestamp.fromDate(new Date(`${form.nextFollowUpAt}T12:00:00`))
          : null,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.uid || '',
      };
      await addDoc(collection(db, 'customerFollowups'), {
        ...record,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'customerFollowupCurrent', uid), record, { merge: true });
      await load();
      setSelected(null);
    } catch (e) {
      console.error('Saving customer follow-up failed:', e);
      setError('Could not save follow-up. Check Firestore rules for customerFollowups and customerFollowupCurrent.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return <div className="car-loading">Loading admin session…</div>;

  return (
    <main className="car-page">
      <header className="car-header">
        <div>
          <span className="car-eyebrow">CUSTOMER INTELLIGENCE</span>
          <h1>Customer Activity Report</h1>
          <p>Signups, logins, browsing, carts, checkout intent and call follow-ups.</p>
        </div>
        <div className="car-header-actions">
          <button type="button" className="car-btn car-btn-light" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <button type="button" className="car-btn car-btn-primary" onClick={() => downloadCsv(rows)} disabled={!rows.length}>
            ↓ Export CSV
          </button>
        </div>
      </header>

      {error && <div className="car-error" role="alert">{error}</div>}
      {from > to && <div className="car-error" role="alert">The “From” date must be on or before the “To” date.</div>}

      <section className="car-metrics">
        <article className="car-metric"><span>New signups today</span><strong>{newToday}</strong><small>Users created today</small></article>
        <article className="car-metric"><span>Logged in today</span><strong>{loggedToday}</strong><small>Based on users.lastLogin</small></article>
        <article className="car-metric"><span>Customers with carts</span><strong>{activeCarts}</strong><small>Latest synced carts</small></article>
        <article className="car-metric"><span>Tracked cart value</span><strong>{money(trackedCartValue)}</strong><small>Cart snapshot, not sales</small></article>
        <article className="car-metric"><span>Checkout started today</span><strong>{checkoutStartedToday}</strong><small>Tracked checkout_started events</small></article>
        <article className="car-metric"><span>Incomplete checkout candidates</span><strong>{incompleteCheckoutCount}</strong><small>Checkout event with no later tracked order</small></article>
        <article className="car-metric"><span>Items removed from cart today</span><strong>{removedQuantityToday}</strong><small>{removalActionsToday} removal actions recorded</small></article>
      </section>

      <section className="car-panel">
        <div className="car-toolbar">
          <label>From<input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="car-search">Search customer / phone / product
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, mobile, email, SKU or notes…" />
          </label>
          <label>Show<select value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)}>
            <option value="all">All activity</option>
            <option value="signup">Signed up in range</option>
            <option value="login">Logged in in range</option>
            <option value="homepage">Homepage activity</option>
            <option value="product">Product / collection activity</option>
            <option value="cart">Has cart items</option>
            <option value="removed">Removed items in date range</option>
            <option value="checkout">Checkout activity</option>
            <option value="incomplete">Incomplete checkout candidates</option>
            <option value="followup">Needs follow-up</option>
          </select></label>
        </div>

        <div className="car-table-wrap">
          <table className="car-table">
            <thead><tr><th>Customer</th><th>Signup</th><th>Last login</th><th>Cart</th><th>Checkout</th><th>Follow-up</th><th>Action</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="7" className="car-empty">Loading customer data…</td></tr> :
                rows.map((r) => (
                  <tr key={r.user.id}>
                    <td>
                      <strong>{customerName(r.user)}</strong>
                      <small>{customerPhone(r.user) || r.user.email || 'No contact details'}</small>
                      <span className="car-role">{r.user.role || 'customer'}</span>
                    </td>
                    <td>{dateTime(r.user.createdAt)}</td>
                    <td>{dateTime(r.user.lastLogin)}</td>
                    <td><strong>{Number(r.cart?.itemCount || 0)} items</strong><small>{money(r.cart?.cartValue || 0)}</small><small>Removed in range: {removedQuantityInRange(r.events, from, to)}</small></td>
                    <td>
                      <span className={`car-status ${r.checkout.candidate ? 'car-status-warning' : ''}`}>
                        {r.checkout.candidate ? 'Incomplete candidate' : r.checkout.started ? 'Started' : 'Not tracked'}
                      </span>
                      <small>{r.checkout.latestStart ? dateTime(eventTime(r.checkout.latestStart)) : 'No checkout event'}</small>
                    </td>
                    <td>
                      <span className="car-status">{r.followup?.status || 'Not called'}</span>
                      <small>{r.followup?.nextFollowUpAt ? `Next: ${dateTime(r.followup.nextFollowUpAt)}` : 'No follow-up set'}</small>
                    </td>
                    <td><button type="button" className="car-btn car-btn-small" onClick={() => openCustomer(r)}>View / Follow up</button></td>
                  </tr>
                ))}
              {!loading && rows.length === 0 && <tr><td colSpan="7" className="car-empty">No customers match this filter and date range.</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="car-table-footer">
          Showing {rows.length} customers · Current user role: {userRole || 'unknown'}
          <span> · Checkout status is based on tracked events, not a direct order-collection reconciliation.</span>
        </footer>
      </section>

      {selected && (
        <div className="car-modal-backdrop" onClick={() => setSelected(null)}>
          <section className="car-modal" role="dialog" aria-modal="true" aria-label="Customer profile and follow-up" onClick={(e) => e.stopPropagation()}>
            <div className="car-modal-head">
              <div>
                <span className="car-eyebrow">CUSTOMER PROFILE</span>
                <h2>{customerName(selected.user)}</h2>
                <p>{customerPhone(selected.user)} {selected.user.email ? `· ${selected.user.email}` : ''}</p>
              </div>
              <button type="button" className="car-close" aria-label="Close" onClick={() => setSelected(null)}>×</button>
            </div>

            <div className="car-profile-grid">
              <div><span>Signup</span><strong>{dateTime(selected.user.createdAt)}</strong></div>
              <div><span>Last login</span><strong>{dateTime(selected.user.lastLogin)}</strong></div>
              <div><span>Role</span><strong>{selected.user.role || 'customer'}</strong></div>
              <div><span>Cart total</span><strong>{money(selected.cart?.cartValue || 0)}</strong></div>
              <div><span>Checkout state</span><strong>{selected.checkout.candidate ? 'Incomplete candidate' : selected.checkout.started ? 'Started' : 'Not tracked'}</strong></div>
              <div><span>Last activity</span><strong>{dateTime(selected.lastActivityAt)}</strong></div>
            </div>

            <h3>Current cart</h3>
            {!selected.cart?.items?.length ? <p className="car-muted">No tracked cart found yet. Cart tracking must be installed and the customer must have synced a cart.</p> : (
              <div className="car-cart-items">
                {selected.cart.items.map((item, i) => (
                  <div className="car-cart-item" key={`${item.productId || item.name}-${i}`}>
                    {item.image ? <img src={item.image} alt="" loading="lazy" /> : <div className="car-product-placeholder">◇</div>}
                    <div>
                      <strong>{item.name || 'Product'}</strong>
                      <small>{item.sku ? `SKU: ${item.sku} · ` : ''}Qty {Number(item.quantity || 0)}</small>
                      {item.variation && <small>Variation: {typeof item.variation === 'string' ? item.variation : Object.values(item.variation).filter(Boolean).join(' / ')}</small>}
                    </div>
                    <b>{money(item.lineTotal ?? (Number(item.unitPrice || 0) * Number(item.quantity || 0)))}</b>
                  </div>
                ))}
              </div>
            )}

            <h3>Recent tracked activity</h3>
            <div className="car-events">
              {(selected.events || []).slice(0, 20).map((event) => (
                <div key={event.id}>
                  <span className="car-event-dot" />
                  <div>
                    <strong>{String(event.type || 'activity').replace(/_/g, ' ')}</strong>
                    <small>{dateTime(eventTime(event))}</small>
                    <small>
                      {event.type === 'cart_items_removed' && Array.isArray(event.details?.removedItems)
                        ? `Removed: ${event.details.removedItems.map((item) => `${item.productName || 'Product'} × ${item.quantityRemoved}`).join(', ')}`
                        : event.type === 'cart_items_added' && Array.isArray(event.details?.addedItems)
                          ? `Added: ${event.details.addedItems.map((item) => `${item.productName || 'Product'} × ${item.quantityAdded}`).join(', ')}`
                          : event.details?.productName ||
                        event.details?.collectionName ||
                        event.details?.page ||
                        event.details?.orderId ||
                        event.details?.error ||
                        event.details?.note || ''}
                    </small>
                    {event.details?.removedQuantity != null && <small>Quantity removed: {event.details.removedQuantity} · Previous cart: {money(event.details.previousCartValue)} · Remaining cart: {money(event.details.currentCartValue)}</small>}
                    {event.details?.cartValue != null && <small>Cart: {money(event.details.cartValue)}</small>}
                    {event.details?.totalAmount != null && <small>Order value: {money(event.details.totalAmount)}</small>}
                  </div>
                </div>
              ))}
              {!selected.events?.length && <p className="car-muted">No activity events recorded yet. Events appear after tracking is installed.</p>}
            </div>

            <form className="car-followup-form" onSubmit={saveFollowup}>
              <h3>Call & follow-up</h3>
              <div className="car-form-grid">
                <label>Call outcome<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option>Not called</option><option>Called</option><option>Connected</option><option>No answer</option><option>Busy</option><option>Follow-up required</option><option>Converted</option><option>Not interested</option>
                </select></label>
                <label>Next follow-up date<input type="date" value={form.nextFollowUpAt} onChange={(e) => setForm({ ...form, nextFollowUpAt: e.target.value })} /></label>
                <label>Assigned staff<input value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} placeholder="Staff name" /></label>
                <label>Customer interest<input value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })} placeholder="Products / budget / requirement" /></label>
              </div>
              <label>Call notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows="3" placeholder="What did the customer say? What should happen next?" /></label>
              <div className="car-modal-actions">
                <button type="button" className="car-btn car-btn-light" onClick={() => setSelected(null)}>Cancel</button>
                <button type="submit" className="car-btn car-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save follow-up'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
