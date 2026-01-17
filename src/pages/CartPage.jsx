// CartPage.jsx

import React, { useCallback } from 'react';
import { useCart } from '../components/CartContext';
import { useAuth } from '../components/AuthContext';
import './CartPage.css';
import { useNavigate } from 'react-router-dom';

const CartPage = () => {
  const navigate = useNavigate();

  // Cart helpers
  const {
    cart,
    addToCart,
    removeFromCart,
    getCartTotal,
    clearCart,
  } = useCart();

  // 🔑 READ ROLE CONFIG DIRECTLY (GOOD OPTION)
  const { roleConfig } = useAuth();

  // 🔒 LOCAL, RELIABLE MIN ORDER LOGIC
  const minimumRequired = Number(roleConfig?.minOrderValue || 0);
  const currentTotal = getCartTotal();

  const isMinOrderApplicable = minimumRequired > 0;
  const isMinMet = currentTotal >= minimumRequired;

  const minimumRemaining = Math.max(
    0,
    minimumRequired - currentTotal
  );

  const showMinOrderWarning =
    isMinOrderApplicable && !isMinMet;

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

  // 🔒 HARD NAVIGATION GUARD
  const handleCheckout = () => {
    if (showMinOrderWarning) return;
    navigate('/checkout');
  };

  return (
    <div className="cart-page-container">
      <h2 className="cart-title">Your Shopping Cart</h2>

      {Object.keys(cart).length === 0 ? (
        <p className="empty-cart-message">Your cart is empty.</p>
      ) : (
        <div className="cart-main-content-wrapper">

          {/* CART ITEMS */}
          <div className="cart-items-list">
            {Object.keys(cart).map(cartItemId => {
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
                      Price: ₹{item.price}
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

          {/* ORDER SUMMARY */}
          <div className="cart-summary">
            <h3>Order Summary</h3>

            <div className="cart-summary-line">
              <p>Subtotal:</p>
              <span>₹{currentTotal.toFixed(2)}</span>
            </div>

            {/* MINIMUM ORDER (ROLE-BASED) */}
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

            <div className="cart-total final-total">
              <p>Total:</p>
              <span>₹{currentTotal.toFixed(2)}</span>
            </div>

            {/* WARNING */}
            {showMinOrderWarning && (
              <p className="min-order-warning-message">
                ⚠️ Minimum order of ₹{minimumRequired.toFixed(2)} not met.
                Add ₹{minimumRemaining.toFixed(2)} more to proceed.
              </p>
            )}

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
                onClick={clearCart}
                className="clear-cart-btn"
              >
                Clear Cart
              </button>
            </div>

            <p className="trust-message">🔒 Secure Checkout</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartPage;
