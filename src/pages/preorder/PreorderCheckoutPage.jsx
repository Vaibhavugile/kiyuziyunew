import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPreorderOrder, usePreorderStore } from "./PreorderStoreContext";
import "./PreorderCheckoutPage.css";

export default function PreorderCheckoutPage() {
  const navigate = useNavigate();
  const { cart, totalBoxes, updateCartQuantity, removeFromCart, clearCart } = usePreorderStore();
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const change = (field, value) => setCustomer((current) => ({ ...current, [field]: value }));

  const submitOrder = async (event) => {
    event.preventDefault();
    setError("");
    if (!cart.length) {
      setError("Your pre-order selection is empty.");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(customer.phone.trim())) {
      setError("Please enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (!/^\d{6}$/.test(customer.pincode.trim())) {
      setError("Please enter a valid 6-digit PIN code.");
      return;
    }

    setSaving(true);
    try {
      const order = await createPreorderOrder({ cart, customer });
      clearCart();
      navigate(`/preorder/success/${order.id}`, { state: { orderNumber: order.orderNumber } });
    } catch (submitError) {
      console.error("Pre-order checkout failed:", submitError);
      setError(submitError.message || "We couldn't place your pre-order. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="px-checkout-page">
      <header className="px-checkout-nav"><Link to="/preorder" className="px-brand"><span className="px-brand-symbol">P</span><span>PREORDER <i>STUDIO</i></span></Link><Link to="/preorder">Continue browsing ↗</Link></header>
      <section className="px-checkout-main">
        <div className="px-checkout-breadcrumb"><Link to="/preorder">Collections</Link><span>/</span><b>Checkout</b></div>
        <div className="px-checkout-heading"><span className="px-checkout-overline">THE FINAL STEP</span><h1>Complete your <em>pre-order.</em></h1><p>Review your selection and share your delivery details.</p></div>
        {error && <div className="px-checkout-error" role="alert">{error}</div>}
        {!cart.length ? <div className="px-checkout-empty"><span>✳</span><h2>Your selection is empty</h2><p>Explore collections and add products to your pre-order.</p><Link to="/preorder">Explore collections ↗</Link></div> : (
          <div className="px-checkout-layout">
            <section className="px-checkout-form-card">
              <div className="px-checkout-card-heading"><span>01</span><div><h2>Delivery details</h2><p>Where should we associate this pre-order?</p></div></div>
              <form onSubmit={submitOrder}>
                <label className="px-checkout-field">Full name<input required autoComplete="name" value={customer.name} onChange={(event) => change("name", event.target.value)} placeholder="Enter your full name"/></label>
                <div className="px-checkout-fields-two">
                  <label className="px-checkout-field">Mobile number<input required type="tel" inputMode="numeric" maxLength="10" autoComplete="tel-national" value={customer.phone} onChange={(event) => change("phone", event.target.value.replace(/\D/g, ""))} placeholder="10-digit mobile number"/></label>
                  <label className="px-checkout-field">Email <small>Optional</small><input type="email" autoComplete="email" value={customer.email} onChange={(event) => change("email", event.target.value)} placeholder="you@example.com"/></label>
                </div>
                <label className="px-checkout-field">Street address<input required autoComplete="street-address" value={customer.address} onChange={(event) => change("address", event.target.value)} placeholder="House / shop, street, area"/></label>
                <div className="px-checkout-fields-three">
                  <label className="px-checkout-field">City<input required autoComplete="address-level2" value={customer.city} onChange={(event) => change("city", event.target.value)} placeholder="City"/></label>
                  <label className="px-checkout-field">State<input required autoComplete="address-level1" value={customer.state} onChange={(event) => change("state", event.target.value)} placeholder="State"/></label>
                  <label className="px-checkout-field">PIN code<input required inputMode="numeric" maxLength="6" autoComplete="postal-code" value={customer.pincode} onChange={(event) => change("pincode", event.target.value.replace(/\D/g, ""))} placeholder="6 digits"/></label>
                </div>
                <button className="px-checkout-submit" type="submit" disabled={saving}>{saving ? "Checking stock & placing order…" : "Place pre-order"} <span>↗</span></button>
                <p className="px-checkout-disclaimer">No prices. No online payment. Stock is checked again before confirmation.</p>
              </form>
            </section>

            <aside className="px-checkout-summary">
              <div className="px-summary-title"><div><span>02</span><h2>Your selection</h2></div><small>{cart.length} {cart.length === 1 ? "item" : "items"}</small></div>
              <div className="px-summary-items">
                {cart.map((item) => <article className="px-summary-row" key={item.key}>
                  {item.image ? <img src={item.image} alt={item.productName}/> : <div className="px-summary-image-empty">✳</div>}
                  <div className="px-summary-row-copy"><strong>{item.productName}</strong><small>{item.variantName || item.categoryName}</small><div className="px-summary-quantity"><button type="button" disabled={item.quantity <= 1} onClick={() => updateCartQuantity(item.key, item.quantity - 1)}>−</button><span>{item.quantity} boxes</span><button type="button" onClick={() => updateCartQuantity(item.key, item.quantity + 1)}>+</button></div></div>
                  <button className="px-summary-remove" type="button" aria-label={`Remove ${item.productName}`} onClick={() => removeFromCart(item.key)}>×</button>
                </article>)}
              </div>
              <div className="px-summary-total"><span>Total boxes requested</span><strong>{totalBoxes}</strong></div>
              <div className="px-summary-no-payment"><span>◇</span><p><strong>No payment required</strong><small>This is a pre-order request. No amount is collected online.</small></p></div>
            </aside>
          </div>
        )}
      </section>
      <footer className="px-checkout-footer"><span>PREORDER STUDIO</span><span>Reserved with care.</span></footer>
    </main>
  );
}
