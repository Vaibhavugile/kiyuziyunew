import React, { useEffect, useRef, useState } from 'react';
import { useCart } from '../components/CartContext';
import { useAuth } from '../components/AuthContext';
import { useNavigate } from 'react-router-dom';
import './CheckoutPage.css';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase'
import { getRoleConfig } from '../config/roles';
import { trackMetaEvent } from "../utils/pixels";
import { trackCustomerActivity } from "../utils/customerActivity";
const SHIPPING_FEE = 249;

const CheckoutPage = () => {
  const {
    cart,
    getCartTotal,
    getCartSubtotal,
    getFinalTotal,
    clearCart,
    checkMinOrderValue,
    removeItemFromCart,

    // 🔥 coupon
    appliedCoupon,
    couponDiscount,
    removeCoupon,
  } = useCart();


  const { currentUser, userRole } = useAuth();
  const navigate = useNavigate();

  // ✅ ROLE-FREE minimum order handling
  const {
    isMinOrderApplicable,
    isMinMet,
    minimumRequired
  } = checkMinOrderValue();

  const showMinOrderWarning = isMinOrderApplicable && !isMinMet;
  const minimumRemaining = Math.max(
    0,
    minimumRequired - getCartTotal()
  );
  const roleConfig = getRoleConfig(userRole);
  const isOnlinePayment = roleConfig.paymentMode === 'ONLINE';

  const [invalidItems, setInvalidItems] = useState([]);
  const checkoutTrackedRef = useRef(false);

  const [formData, setFormData] = useState({
    fullName: '',
    email: currentUser?.email || '',
    phoneNumber: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pincode: '',
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

useEffect(() => {
  const items = Object.values(cart || {});
  if (!items.length || checkoutTrackedRef.current) return;

  checkoutTrackedRef.current = true;
  const cartValue = Number(getFinalTotal() || 0);
  const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const activityItems = items.slice(0, 50).map(item => ({
    productId: item.id || null,
    productCode: item.productCode || null,
    productName: item.productName || null,
    quantity: Number(item.quantity || 0),
    unitPrice: Number(item.price || 0),
    variation: item.variation || null
  }));

  trackCustomerActivity('checkout_started', {
    cartValue,
    currency: 'INR',
    itemCount,
    itemKinds: items.length,
    items: activityItems,
    shippingFee: SHIPPING_FEE,
    userRole: userRole || null
  });

  trackMetaEvent("InitiateCheckout", {
    content_ids: items.map(item => item.id),
    content_type: "product",
    value: cartValue + SHIPPING_FEE,
    currency: "INR",
    num_items: itemCount
  });
}, [cart, getFinalTotal, userRole]);
const loadRazorpay = () =>
  new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  const validateCouponBeforeOrder = async () => {
    if (!appliedCoupon) return { valid: true };

    const couponRef = doc(db, 'coupons', appliedCoupon.code);
    const couponSnap = await getDoc(couponRef);

    if (!couponSnap.exists()) {
      removeCoupon();
      throw new Error('Coupon no longer exists');
    }

    const coupon = couponSnap.data();
    const subtotal = getCartSubtotal();

    if (!coupon.isActive) {
      throw new Error('Coupon is disabled');
    }

    if (coupon.expiry?.toDate() < new Date()) {
      throw new Error('Coupon has expired');
    }

    if (subtotal < coupon.minOrderValue) {
      throw new Error('Cart no longer meets coupon requirements');
    }

    if (coupon.usedCount >= coupon.maxUses) {
      throw new Error('Coupon usage limit reached');
    }

    let discount = 0;
    if (coupon.type === 'percentage') {
      discount = (subtotal * coupon.value) / 100;
    } else {
      discount = coupon.value;
    }

    discount = Math.min(discount, subtotal);

    return { valid: true, discount };
  };

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);

    // ✅ Centralized min-order enforcement
    if (showMinOrderWarning) {
      setError(
        `Minimum order of ₹${minimumRequired.toFixed(2)} not met. Please add ₹${minimumRemaining.toFixed(2)} more.`
      );
      setIsProcessing(false);
      return;
    }

    if (Object.values(cart).length === 0) {
      setError("Your cart is empty.");
      setIsProcessing(false);
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
      setError("Please fill out all required shipping details.");
      setIsProcessing(false);
      return;
    }

    const validatedItems = Object.values(cart)
      .map(item => {
        if (
          !item.id ||
          !item.productCode ||
          !item.quantity ||
          !item.price ||
          !item.subcollectionId ||
          !item.collectionId ||
          !item.productName
        ) {
          console.error("Invalid cart item:", item);
          return null;
        }

        return {
          productId: item.id,
          productName: item.productName,
          productCode: item.productCode,
          image: item.image,
          images: item.images,
          quantity: Number(item.quantity),
          priceAtTimeOfOrder: Number(item.price),
          subcollectionId: item.subcollectionId,
          collectionId: item.collectionId,
          variation: item.variation,
        };
      })
      .filter(Boolean);

    if (validatedItems.length === 0) {
      setError("Your cart contains invalid items.");
      setIsProcessing(false);
      return;
    }

    const subtotal = getCartSubtotal();

    let couponDiscountFinal = 0;
    if (appliedCoupon) {
      const result = await validateCouponBeforeOrder();
      couponDiscountFinal = result.discount;
    }

    const totalWithShipping =
      subtotal - couponDiscountFinal + SHIPPING_FEE;


    trackCustomerActivity('checkout_details_submitted', {
      cartValue: Number(totalWithShipping || 0),
      subtotal: Number(subtotal || 0),
      shippingFee: SHIPPING_FEE,
      couponCode: appliedCoupon?.code || null,
      couponDiscount: Number(couponDiscountFinal || 0),
      itemCount: validatedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      itemKinds: validatedItems.length,
      items: validatedItems.slice(0, 50).map(item => ({
        productId: item.productId,
        productCode: item.productCode,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.priceAtTimeOfOrder,
        variation: item.variation || null
      }))
    });

    const orderData = {
      userId: currentUser?.uid || 'guest',
      role: userRole || 'retail',
      items: validatedItems,
      subtotal,
      shippingFee: SHIPPING_FEE,
      totalAmount: totalWithShipping,
      billingInfo: formData,
      status: 'Pending',
      couponCode: appliedCoupon?.code || null,
      couponDiscount: couponDiscountFinal,

    };

    try {
      const response = await fetch(
        'https://us-central1-jewellerywholesale-2e57c.cloudfunctions.net/placeorderr',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderData),
        }
      );

      // 🔥 FULL BACKEND VALIDATION HANDLING
      if (response.status === 409) {
        const body = await response.json();
        const invalid = [];

        body.stockErrors?.forEach(err =>
          invalid.push({ productId: err.productId, variation: err.variation || null })
        );

        body.variationErrors?.forEach(err =>
          invalid.push({ productId: err.productId, variation: err.variation || null })
        );

        body.missingItems?.forEach(err =>
          invalid.push({ productId: err.productId, variation: null })
        );

        setInvalidItems(invalid);
        setError("⚠️ Some items are invalid. You can fix the cart automatically.");
        throw new Error("VALIDATION_FAILED");
      }

      if (!response.ok) {
        let msg = "Failed to place order.";
        try {
          const json = await response.json();
          msg = json.error || msg;
        } catch { }
        throw new Error(msg);
      }

      const data = await response.json();
      const createdOrderId = data.orderId;

      console.log('✅ Order created with ID:', createdOrderId);
      trackCustomerActivity('checkout_order_created', {
        orderId: createdOrderId || null,
        orderStatus: 'Pending',
        totalAmount: Number(totalWithShipping || 0),
        currency: 'INR',
        paymentMode: isOnlinePayment ? 'ONLINE' : 'MANUAL',
        itemCount: validatedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        itemKinds: validatedItems.length
      });

      // 🔀 STEP 7: Branch payment flow
      if (!isOnlinePayment) {

  trackCustomerActivity('order_placed', {
    orderId: createdOrderId || null,
    orderStatus: 'Pending',
    totalAmount: Number(totalWithShipping || 0),
    currency: 'INR',
    paymentMode: 'MANUAL',
    itemCount: validatedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    itemKinds: validatedItems.length
  });

  trackMetaEvent("Purchase", {
    content_ids: Object.values(cart).map(item => item.id),
    content_type: "product",
    value: totalWithShipping,
    currency: "INR",
    num_items: Object.values(cart).reduce(
      (sum, item) => sum + item.quantity,
      0
    )
  });

  clearCart();
  navigate('/order-success');
  return;
}

      // ONLINE payment (retailer)
      // ⚠️ DO NOTHING MORE FOR NOW
      // Razorpay will be added in next step
      console.log('🟡 Starting Razorpay for order:', createdOrderId);

await startRazorpayPayment(
  createdOrderId,
  totalWithShipping // final amount
);




    } catch (err) {
      if (err.message !== "VALIDATION_FAILED") {
        trackCustomerActivity('checkout_order_failed', {
          reason: String(err.message || 'Order failed').slice(0, 250),
          cartValue: Number((getFinalTotal() || 0) + SHIPPING_FEE),
          currency: 'INR'
        });
        setError(err.message || "Order failed.");
      }
    } finally {
      setIsProcessing(false);
    }
  };
const startRazorpayPayment = async (orderId, amount) => {
  trackCustomerActivity('checkout_payment_started', {
    orderId: orderId || null,
    paymentMode: 'ONLINE',
    totalAmount: Number(amount || 0),
    currency: 'INR'
  });

  const res = await loadRazorpay();
  if (!res) {
    trackCustomerActivity('checkout_payment_failed', {
      orderId: orderId || null,
      totalAmount: Number(amount || 0),
      reason: 'Razorpay SDK failed to load'
    });
    setError("Razorpay SDK failed to load");
    return;
  }

  // 🔥 STEP 1: Create Razorpay Order from backend
  const orderRes = await fetch(
    "https://us-central1-jewellerywholesale-2e57c.cloudfunctions.net/createRazorpayOrder",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount, // amount in rupees
        receipt: orderId,
      }),
    }
  );

  if (!orderRes.ok) {
    trackCustomerActivity('checkout_payment_failed', {
      orderId: orderId || null,
      totalAmount: Number(amount || 0),
      reason: 'Failed to initialize payment'
    });
    setError("Failed to initialize payment");
    return;
  }

  const razorpayOrder = await orderRes.json();

  // 🔥 STEP 2: Open Razorpay Checkout
  const options = {
    key: "rzp_live_S5qE67r4g2LR2M", // ✅ key_id only
    amount: razorpayOrder.amount, // already in paise
    currency: "INR",
    name: "Kiyu-Ziyu Jewellery",
    description: `Order #${orderId}`,
    order_id: razorpayOrder.id, // 🔥 THIS ENABLES UPI & QR

    handler: async function (response) {
      // 🔐 STEP 3: Verify payment on backend
      const verifyRes = await fetch(
        "https://us-central1-jewellerywholesale-2e57c.cloudfunctions.net/markOrderPaid",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            paymentId: response.razorpay_payment_id,
            razorpayOrderId: response.razorpay_order_id,
            razorpaySignature: response.razorpay_signature,
          }),
        }
      );

      if (!verifyRes.ok) {
        trackCustomerActivity('checkout_payment_verification_failed', {
          orderId: orderId || null,
          paymentId: response.razorpay_payment_id || null,
          totalAmount: Number(amount || 0)
        });
        setError("Payment verification is pending. Please contact support before trying to pay again.");
        return;
      }

      trackCustomerActivity('checkout_payment_completed', {
        orderId: orderId || null,
        paymentId: response.razorpay_payment_id || null,
        razorpayOrderId: response.razorpay_order_id || null,
        totalAmount: Number(amount || 0),
        currency: 'INR',
        paymentMode: 'ONLINE'
      });

      trackCustomerActivity('order_placed', {
        orderId: orderId || null,
        orderStatus: 'Paid',
        totalAmount: Number(amount || 0),
        currency: 'INR',
        paymentMode: 'ONLINE'
      });

      trackMetaEvent("Purchase", {
  content_ids: Object.values(cart).map(item => item.id),
  content_type: "product",
  value: amount,
  currency: "INR",
  num_items: Object.values(cart).reduce(
    (sum, item) => sum + item.quantity,
    0
  )
});

clearCart();
navigate("/order-success");
    },

    modal: {
      ondismiss: () => {
        trackCustomerActivity('checkout_payment_dismissed', {
          orderId: orderId || null,
          totalAmount: Number(amount || 0),
          paymentMode: 'ONLINE'
        });
      }
    },

    prefill: {
      name: formData.fullName,
      email: formData.email,
      contact: formData.phoneNumber,
    },

    theme: { color: "#e73e35" },
  };

  const rzp = new window.Razorpay(options);
  rzp.open();
};


  const handleAutoFixCart = () => {
    invalidItems.forEach(({ productId, variation }) =>
      removeItemFromCart(productId, variation)
    );
    setInvalidItems([]);
    setError(null);
  };

  return (
    <div className="checkout-page-container">
      <h2>Complete Your Order</h2>

      {error && <pre className="error-message">{error}</pre>}

      {invalidItems.length > 0 && (
        <button className="auto-fix-cart-btn" onClick={handleAutoFixCart}>
          Fix Cart Automatically
        </button>
      )}

      {Object.values(cart).length > 0 ? (
        <div className="checkout-content">

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

              {showMinOrderWarning && (
                <p className="error-message min-order-warning-checkout">
                  ⚠️ Minimum order ₹{minimumRequired.toFixed(2)} not met.
                  Add ₹{minimumRemaining.toFixed(2)} more.
                </p>
              )}
              {invalidItems.length > 0 && (
  <div className="fix-cart-box">
    <p className="fix-cart-title">
      ⚠ Some items are no longer available
    </p>

    <button
      type="button"
      className="auto-fix-cart-btn"
      onClick={handleAutoFixCart}
    >
      Fix Cart Automatically
    </button>
  </div>
)}

              <button
                type="submit"
                className="checkout-btn"
                disabled={isProcessing || showMinOrderWarning}
              >
                {isProcessing
                  ? 'Processing…'
                  : isOnlinePayment
                    ? 'Pay & Place Order'
                    : 'Place Order (Manual Payment)'}
              </button>

            </form>
          </div>

          <div className="order-details">
            <h3>Order Summary</h3>
            
            <div className="cart-total-section">
              <p>Subtotal</p>
              <p>₹{getCartSubtotal().toFixed(2)}</p>
            </div>
            {appliedCoupon && (
              <div className="cart-total-section discount-line">
                <p>Coupon ({appliedCoupon.code})</p>
                <p>- ₹{couponDiscount.toFixed(2)}</p>
              </div>
            )}



            {isMinOrderApplicable && (
              <div className={`cart-total-section minimum-order-line ${isMinMet ? 'met' : 'not-met'}`}>
                <p>Minimum Order</p>
                <p>₹{minimumRequired.toFixed(2)}</p>
              </div>
            )}

            <div className="cart-total-section">
              <p>Convinience & Shipping Fee DTDC(BY AIR)</p>

              <p>₹{SHIPPING_FEE.toFixed(2)}</p>
              
            </div>
             <div className="cart-total-section">
              <p>T&C</p>

              <p>Applicable For Upto 1kg</p>
            </div>


            <div className="cart-total-section total-final">
              <p>Total</p>
              <p>₹{getFinalTotal() + SHIPPING_FEE}</p>

            </div>
           
<h4 className="items-heading">
  Items in Order ({Object.keys(cart).length})
</h4>
            {Object.values(cart).map(item => (
              <div
                key={item.id + (item.variation ? JSON.stringify(item.variation) : '')}
                className="cart-item"
              >
                <img
                  src={item.images?.[0]?.url || item.image}
                  alt={item.productName}
                />
                <div>
                  <h4>{item.productName}</h4>
                  <p>Code: {item.productCode}</p>
                  {item.variation && (
                    <p>Variation: {item.variation.color} {item.variation.size}</p>
                  )}
                  <p>₹{item.price} × {item.quantity}</p>
                </div>
              </div>
            ))}

          </div>
        </div>
      ) : (
        <p className="empty-cart-message">Your cart is empty.</p>
      )}
    </div>
  );
};

export default CheckoutPage;
