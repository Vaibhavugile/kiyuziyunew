import React, { useState } from 'react';
import { useCart } from '../components/CartContext';
import { useAuth } from '../components/AuthContext';
import { useNavigate } from 'react-router-dom';
import './CheckoutPage.css';

const SHIPPING_FEE = 199;

const CheckoutPage = () => {
  // 1. Destructure checkMinOrderValue
  const { cart, getCartTotal, clearCart, checkMinOrderValue, removeItemFromCart } = useCart();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // 2. Call checkMinOrderValue to get the current min order status
  const { isWholesaler, isMinMet, minimumRequired } = checkMinOrderValue();
  const showMinOrderWarning = isWholesaler && !isMinMet;
  const minimumRemaining = minimumRequired - getCartTotal(); // Use getCartTotal directly here
  const [invalidItems, setInvalidItems] = useState([]); // 🔥 ADD

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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({ ...prevData, [name]: value }));
  };

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);

    // 3. NEW: Minimum Order Check
    if (isWholesaler && !isMinMet) {
      setError(`Minimum wholesale order of ₹${minimumRequired.toFixed(2)} not met. Please return to cart and increase your order total.`);
      setIsProcessing(false);
      return;
    }

    if (Object.values(cart).length === 0) {
      setError("Your cart is empty. Please add items before checking out.");
      setIsProcessing(false);
      return;
    }

    const { fullName, email, phoneNumber, addressLine1, city, state, pincode } = formData;
    if (!fullName || !email || !phoneNumber || !addressLine1 || !city || !state || !pincode) {
      setError("Please fill out all mandatory shipping details.");
      setIsProcessing(false);
      return;
    }

    const validatedItems = Object.values(cart).map(item => {
      // Correctly map all necessary product data, including variation
      if (!item.id || !item.productCode || !item.quantity || !item.price || !item.subcollectionId || !item.collectionId || !item.productName) {
        console.error("Skipping item due to missing data:", item);
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
        // Pass the variation data to the server for stock updates
        variation: item.variation,
      };
    }).filter(Boolean);

    if (validatedItems.length === 0) {
      setError("Your cart contains invalid items. Please clear your cart and try again.");
      setIsProcessing(false);
      return;
    }

    const subtotal = getCartTotal();
    const totalWithShipping = subtotal + SHIPPING_FEE;

    const orderData = {
      userId: currentUser?.uid || 'guest',
      items: validatedItems,
      totalAmount: totalWithShipping,
      subtotal: subtotal,
      shippingFee: SHIPPING_FEE,
      billingInfo: formData,
      status: 'Pending',
    };

    try {
      const response = await fetch('https://us-central1-jewellerywholesale-2e57c.cloudfunctions.net/placeorderr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      // --- START: STOCK ERROR HANDLING (409 Conflict) ---
      // --- START: FULL VALIDATION ERROR HANDLING (409) ---
      if (response.status === 409) {
        const body = await response.json();
        const invalid = [];

        // 1️⃣ Stock errors
        if (body.stockErrors?.length > 0) {
          body.stockErrors.forEach(err => {
            invalid.push({
              productId: err.productId,
              variation: err.variation || null,
            });
          });

          setError("⚠️ Some items are out of stock. You can fix the cart automatically.");
        }

        // 2️⃣ Variation mismatch errors
        if (body.variationErrors?.length > 0) {
          body.variationErrors.forEach(err => {
            invalid.push({
              productId: err.productId,
              variation: err.variation || null,
            });
          });

          setError("⚠️ Some product variations no longer match. You can fix the cart automatically.");
        }

        // 3️⃣ Missing / deleted products
        if (body.missingItems?.length > 0) {
          body.missingItems.forEach(err => {
            invalid.push({
              productId: err.productId,
              variation: null,
            });
          });

          setError("⚠️ Some items are no longer available. You can fix the cart automatically.");
        }

        // Save invalid items for auto-fix button
        setInvalidItems(invalid);

        // Stop normal flow
        throw new Error("VALIDATION_FAILED");
      }
      // --- END: FULL VALIDATION ERROR HANDLING ---

      // --- END: STOCK ERROR HANDLING ---

      if (!response.ok) {
        // Handle other non-409 errors (e.g., 400, 500)
        let message = 'Failed to place order. Please try again.';
        try {
          const errorJson = await response.json();
          // Use the error message from the backend if available
          message = errorJson.error || message;
        } catch (e) {
          // Ignore JSON parsing error if response is not JSON
        }
        throw new Error(message);
      }

      // Success path
      clearCart();
      navigate('/order-success');
    } catch (err) {
      console.error("Error submitting order:", err);

      // 🔥 Do NOT override validation errors
      if (err.message !== "VALIDATION_FAILED") {
        setError(err.message || "There was an error processing your order. Please try again.");
      }


    } finally {
      setIsProcessing(false);
    }
  };
  const handleAutoFixCart = () => {
    invalidItems.forEach(({ productId, variation }) => {
      removeItemFromCart(productId, variation);
    });
    setInvalidItems([]);
    setError(null);
  };


  return (
    <div className="checkout-page-container">
      <h2>Complete Your Order</h2>
      {error && <pre className="error-message">{error}</pre>}

      {invalidItems.length > 0 && (
        <button
          type="button"
          className="auto-fix-cart-btn"
          onClick={handleAutoFixCart}
        >
          Fix Cart Automatically
        </button>
      )}

      {Object.values(cart).length > 0 ? (
        <div className="checkout-content">

          {/* Billing & Shipping Section - Left side on Desktop */}
          <div className="billing-section">
            <h3>Billing & Shipping Information</h3>
            <form onSubmit={handleSubmitOrder}>
              <div className="form-field-group">
                <input type="text" name="fullName" placeholder="Full Name *" value={formData.fullName} onChange={handleInputChange} required />
              </div>
              <div className="form-field-group">
                <input type="email" name="email" placeholder="Email Address *" value={formData.email} onChange={handleInputChange} required />
              </div>
              <div className="form-field-group">
                <input type="tel" name="phoneNumber" placeholder="Phone Number *" value={formData.phoneNumber} onChange={handleInputChange} required />
              </div>

              <div className="address-fields">
                <div className="form-field-group">
                  <input type="text" name="addressLine1" placeholder="Address Line 1 *" value={formData.addressLine1} onChange={handleInputChange} required />
                </div>
                <div className="form-field-group">
                  <input type="text" name="addressLine2" placeholder="Address Line 2 (Optional)" value={formData.addressLine2} onChange={handleInputChange} />
                </div>
                <div className="form-field-group">
                  <input type="text" name="city" placeholder="City *" value={formData.city} onChange={handleInputChange} required />
                </div>
                <div className="form-field-group">
                  <input type="text" name="state" placeholder="State/Province/Region *" value={formData.state} onChange={handleInputChange} required />
                </div>
                <div className="form-field-group">
                  <input type="text" name="pincode" placeholder="Pincode *" value={formData.pincode} onChange={handleInputChange} required />
                </div>
              </div>

              {/* Min Order Warning in Form */}
              {showMinOrderWarning && (
                <p className="error-message min-order-warning-checkout">
                  ⚠️ Minimum wholesale order of **₹{minimumRequired.toFixed(2)}** not met. Please return to cart to add **₹{minimumRemaining.toFixed(2)}** more.
                </p>
              )}

              <button type="submit" className="checkout-btn" disabled={isProcessing || showMinOrderWarning}>
                {isProcessing ? 'Processing...' : 'Place Order'}
              </button>
            </form>
          </div>

          {/* Order Summary Section - Right side on Desktop */}
          <div className="order-details">
            <h3>Order Summary</h3>
            <div className="cart-items-list">
              {Object.values(cart).map((item, index) => (
                <div key={item.id + (item.variation ? item.variation.color + item.variation.size : '')} className="cart-item">
                  <div className="cart-item-image-wrapper">
                    {/* Correctly display the first image from the 'images' array or fallback to 'image' */}
                    <img
                      src={item.images && item.images.length > 0 ? item.images[0].url : item.image}
                      alt={item.productName}
                      className="cart-item-image"
                    />
                  </div>
                  <div className="cart-item-details">
                    <h4 className="cart-item-name">{item.productName}</h4>
                    <p className="cart-item-code">Code: {item.productCode}</p>
                    {item.variation && (
                      <p className="cart-item-variation">
                        Variation: {item.variation.color} {item.variation.size}
                      </p>
                    )}
                    <p className="cart-item-price">Price: ₹{item.price}</p>
                    <p className="cart-item-quantity">Quantity: {item.quantity}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals Calculation */}
            <div className="cart-total-section">
              <p>Subtotal:</p>
              <p>₹{getCartTotal().toFixed(2)}</p>
            </div>

            {/* NEW: Display Minimum Order Requirement for Wholesalers */}
            {isWholesaler && (
              <div className={`cart-total-section minimum-order-line ${isMinMet ? 'met' : 'not-met'}`}>
                <p>Min. Order (Wholesale):</p>
                <p>₹{minimumRequired.toFixed(2)}</p>
              </div>
            )}

            <div className="cart-total-section">
              <p>Packing:</p>
              <p>₹{SHIPPING_FEE.toFixed(2)}</p>
            </div>
            <div className="cart-total-section total-final">
              <p>Total:</p>
              <p>₹{(getCartTotal() + SHIPPING_FEE).toFixed(2)}</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="empty-cart-message">Your cart is empty.</p>
      )}
    </div>
  );
};

export default CheckoutPage;