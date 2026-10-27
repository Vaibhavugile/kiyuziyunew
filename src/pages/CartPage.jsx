import React, { useCallback, useState } from 'react';
import { useCart } from '../components/CartContext';
import { useAuth } from '../components/AuthContext';
import './CartPage.css';
import './OrderPricingSlabs.css';
import { useNavigate } from 'react-router-dom';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { trackMetaEvent } from "../utils/pixels";

const CartPage = () => {
  const navigate = useNavigate();

  /* =====================
     CART CONTEXT
  ===================== */
  const {
    cart,
    addToCart,
    removeFromCart,
    getCartSubtotal,
    getFinalTotal,
    clearCart,
    orderPricing,

    // 🔥 coupon
    applyCoupon,
    removeCoupon,
    appliedCoupon,
    couponDiscount,
    couponError,
  } = useCart();

  /* =====================
     ROLE / MIN ORDER
  ===================== */
const { userRole, roleConfig, currentUser } = useAuth();

  const minimumRequired = Number(roleConfig?.minOrderValue || 0);
  const subtotal = getCartSubtotal();

  const isMinOrderApplicable = minimumRequired > 0;
  const isMinMet = subtotal >= minimumRequired;

  const minimumRemaining = Math.max(
    0,
    minimumRequired - subtotal
  );

  const showMinOrderWarning =
    isMinOrderApplicable && !isMinMet;

  const slabSubtotal = Number(orderPricing?.qualificationSubtotal || 0);
  const orderSlabs = orderPricing?.slabs || [];
  const activeSlab = orderPricing?.activeSlab;
  const nextSlab = orderPricing?.nextSlab;
  const currentSlabThreshold = Number(activeSlab?.qualifyingValue || 0);
  const nextSlabThreshold = nextSlab ? Number(nextSlab.qualifyingValue) : null;
  const slabProgress = nextSlabThreshold
    ? Math.max(
        0,
        Math.min(
          100,
          ((slabSubtotal - currentSlabThreshold) /
            Math.max(1, nextSlabThreshold - currentSlabThreshold)) *
            100
        )
      )
    : 100;

  const formatMoney = (value) =>
    `₹${Number(value || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    })}`;

  /* =====================
     COUPON LOCAL STATE
  ===================== */
  const [couponInput, setCouponInput] = useState('');
  const [loadingCoupon, setLoadingCoupon] = useState(false);
const [couponUiError, setCouponUiError] = useState(null);

  /* =====================
     HANDLERS
  ===================== */

  const handleDecrement = useCallback(
    (cartItemId) => {
      removeFromCart(cartItemId);
    },
    [removeFromCart]
  );

  const handleIncrement = useCallback(
    (item) => {
      addToCart(item);
    },
    [addToCart]
  );

 const handleApplyCoupon = async () => {
  if (!couponInput.trim()) return;

  try {
    setLoadingCoupon(true);
    setCouponUiError(null); // 🔥 reset UI error

    const couponRef = doc(
      db,
      'coupons',
      couponInput.trim().toUpperCase()
    );
    const couponSnap = await getDoc(couponRef);

    if (!couponSnap.exists()) {
      throw new Error('Invalid coupon code');
    }

    const coupon = couponSnap.data();

    /* =========================
       FRONTEND SAFETY CHECKS
    ========================= */

    // Role check
    if (
      Array.isArray(coupon.allowedRoles) &&
      coupon.allowedRoles.length > 0 &&
      !coupon.allowedRoles.includes(userRole)
    ) {
      throw new Error('Coupon is not available for your role');
    }

    // Min order
    if (subtotal < coupon.minOrderValue) {
      throw new Error(
        `Minimum order of ₹${coupon.minOrderValue} required`
      );
    }

    // Global limit
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
      throw new Error('Coupon usage limit reached');
    }

    // 🔥 Per-user limit
    if (coupon.maxUsesPerUser > 0 && currentUser?.uid) {
      const usageQuery = query(
        collection(db, 'couponUsages'),
        where('couponCode', '==', coupon.code),
        where('userId', '==', currentUser.uid)
      );

      const usageSnap = await getDocs(usageQuery);

      if (usageSnap.size >= coupon.maxUsesPerUser) {
        throw new Error(
          `You can use this coupon only ${coupon.maxUsesPerUser} time(s)`
        );
      }
    }

    // ✅ APPLY
    await applyCoupon(coupon, userRole);
    setCouponInput('');
  } catch (err) {
    console.error(err.message);
    setCouponUiError(err.message); // ✅ SHOW IN UI
  } finally {
    setLoadingCoupon(false);
  }
};



  // 🔒 HARD NAVIGATION GUARD
  const handleCheckout = () => {
    if (showMinOrderWarning) return;
      trackMetaEvent("InitiateCheckout", {
    content_ids: Object.values(cart).map(item => item.id),
    content_type: "product",
    value: getFinalTotal(),
    currency: "INR",
    num_items: Object.values(cart).reduce(
      (sum, item) => sum + item.quantity,
      0
    )
  });
    navigate('/checkout');
  };

  return (
    <div className="cart-page-container">
      <h2 className="cart-title">Your Shopping Cart</h2>

      {Object.keys(cart).length === 0 ? (
        <p className="empty-cart-message">Your cart is empty.</p>
      ) : (
        <div className="cart-main-content-wrapper">

          {/* PREMIUM ORDER-VALUE PRICING LADDER */}
          {orderPricing && orderSlabs.length > 0 && (
            <section className="order-pricing-progress" aria-label="Order pricing slabs">
              <div className="order-pricing-heading">
                <div className="order-pricing-heading-icon" aria-hidden="true">✦</div>
                <div className="order-pricing-heading-copy">
                  <span className="order-pricing-eyebrow">SMART ORDER REWARDS</span>
                  <h3>Unlock better prices as you shop</h3>
                  <p>Your role stays the same. Better role pricing applies to this order only.</p>
                </div>
                <div className="order-pricing-current-badge">
                  <span className="order-pricing-pulse" />
                  {activeSlab?.label || 'Current'} Pricing
                </div>
              </div>

              <div className="order-pricing-value-row">
                <div>
                  <span className="order-pricing-small-label">Qualifying cart value</span>
                  <strong>{formatMoney(slabSubtotal)}</strong>
                  <span className="order-pricing-helper">Calculated using your assigned role prices</span>
                </div>
                {Number(orderPricing?.savings || 0) > 0 && (
                  <div className="order-pricing-savings">
                    <span>✦ Your order savings</span>
                    <strong>{formatMoney(orderPricing.savings)}</strong>
                  </div>
                )}
              </div>

              <div className="order-pricing-progress-track" aria-label={`${Math.round(slabProgress)} percent to next slab`}>
                <span style={{ width: `${slabProgress}%` }} />
              </div>

              <div className="order-pricing-slab-list">
                {orderSlabs.map((slab, index) => {
                  const threshold = Number(slab.qualifyingValue || 0);
                  const unlocked = slabSubtotal >= threshold;
                  const current = slab.pricingKey === orderPricing.activePricingKey;
                  return (
                    <div
                      key={`${slab.pricingKey}-${threshold}`}
                      className={[
                        'order-pricing-slab',
                        unlocked ? 'is-unlocked' : 'is-locked',
                        current ? 'is-current' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <div className="order-pricing-slab-marker">
                        {unlocked ? '✓' : index + 1}
                      </div>
                      <div className="order-pricing-slab-copy">
                        <strong>{slab.label}</strong>
                        <span>{threshold === 0 ? 'Starting tier' : `Unlock at ${formatMoney(threshold)}`}</span>
                        {current && <em>Applied to this order</em>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="order-pricing-footer">
                {nextSlab ? (
                  <>
                    <span className="order-pricing-footer-icon" aria-hidden="true">↗</span>
                    <p>
                      Add <strong>{formatMoney(orderPricing.amountToNextSlab)}</strong> more at your assigned-role prices to unlock <strong>{nextSlab.label}</strong> pricing.
                    </p>
                  </>
                ) : (
                  <>
                    <span className="order-pricing-footer-icon" aria-hidden="true">★</span>
                    <p><strong>You’ve unlocked the highest available pricing tier for this order.</strong></p>
                  </>
                )}
              </div>
            </section>
          )}

          {/* =====================
              CART ITEMS
          ===================== */}
          

          {/* =====================
              ORDER SUMMARY
          ===================== */}
          <div className="cart-summary">
            <h3>Order Summary</h3>

            {/* SUBTOTAL */}
            <div className="cart-summary-line">
              <p>Subtotal:</p>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>

            {/* COUPON SECTION */}
            {/* <div className="coupon-section">
  {!appliedCoupon ? (
    <>
      <input
        type="text"
        value={couponInput}
        placeholder="Enter coupon code"
        onChange={(e) => setCouponInput(e.target.value)}
        className="coupon-input"
      />
      <button
        onClick={handleApplyCoupon}
        disabled={loadingCoupon}
        className="apply-coupon-btn"
      >
        {loadingCoupon ? 'Applying...' : 'Apply'}
      </button>

      {couponUiError && (
        <p className="coupon-error">⚠️ {couponUiError}</p>
      )}
    </>
  ) : (
    <div className="coupon-applied">
      <span>
        ✅ Coupon <strong>{appliedCoupon.code}</strong> applied
      </span>
      <button onClick={() => {
        removeCoupon();
        setCouponUiError(null);
      }}>
        Remove
      </button>
    </div>
  )}
</div> */}


            {/* DISCOUNT */}
            {/* {couponDiscount > 0 && (
              <div className="cart-summary-line discount-line">
                <p>Coupon Discount:</p>
                <span>- ₹{couponDiscount.toFixed(2)}</span>
              </div>
            )} */}

            {/* MINIMUM ORDER */}
            {isMinOrderApplicable && (
              <div
                className={`cart-summary-line minimum-order-line ${
                  isMinMet ? 'met' : 'not-met'
                }`}
              >
                <p>Minimum Order:</p>
                <span>₹{minimumRequired.toFixed(2)}</span>
              </div>
            )}

            {/* FINAL TOTAL */}
            <div className="cart-total final-total">
              <p>Total:</p>
              <span>₹{getFinalTotal().toFixed(2)}</span>
            </div>

            {/* WARNING */}
            {showMinOrderWarning && (
              <p className="min-order-warning-message">
                ⚠️ Minimum order of ₹{minimumRequired.toFixed(2)} not met.
                Add ₹{minimumRemaining.toFixed(2)} more to proceed.
              </p>
            )}

            {/* ACTIONS */}
            <div className="cart-actions-buttons">
              <button
                className={`checkout-btn ${
                  showMinOrderWarning ? 'disabled' : ''
                }`}
                disabled={showMinOrderWarning}
                onClick={handleCheckout}
              >
                Proceed to Checkout
              </button>

              <button
  onClick={() => {

    trackMetaEvent("RemoveFromCart", {
      content_ids: Object.values(cart).map(item => item.id),
      content_type: "product",
      value: getFinalTotal(),
      currency: "INR"
    });

    clearCart();

  }}
  className="clear-cart-btn"
>
  Clear Cart
</button>
            </div>

            <p className="trust-message">🔒 Secure Checkout</p>
          </div>
          <div className="cart-items-list">
            {Object.keys(cart).map((cartItemId) => {
              const item = cart[cartItemId];

              return (
                <div key={cartItemId} className="cart-item">
                  <img
                    src={
                      item.images && item.images.length > 0
                        ? item.images[0].url
                        : item.image
                    }
                    alt={item.productName}
                    className="cart-item-image1"
                  />

                  <div className="cart-item-info">
                    <h4 className="cart-item-name">
                      {item.productName}
                      {item.variation && (
                        <span>
                          {' '}
                          - {item.variation.color} {item.variation.size}
                        </span>
                      )}
                    </h4>

                    <p className="cart-item-code">
                      Code: {item.productCode}
                    </p>

                    <p className="cart-item-price">
                      Price: ₹{Number(item.price).toFixed(2)}
                    </p>
                  </div>

                  <div className="cart-quantity-controls">
                    <button onClick={() => handleDecrement(cartItemId)}>
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button onClick={() => handleIncrement(item)}>
                      +
                    </button>
                  </div>

                  <div className="cart-item-subtotal">
                    ₹{(item.price * item.quantity).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CartPage;
