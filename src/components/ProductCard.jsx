// src/components/ProductCard.jsx
// ✅ Multi-role ready, UI-only, pricing logic removed from component

import React, { useState, useEffect } from 'react';
import './ProductCard.css';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';
import { getCartItemId } from './CartContext';
import ProgressiveImage from "./ProgressiveImage";

const ProductCard = ({
  product,
  onIncrement,
  onDecrement,
  onEdit,
  onDelete,
  onToggleHighlight,
  isCart = false,
  cart
}) => {
  const {
    id,
    productName,
    productCode,
    images,
    image,
    variations,
    quantity,
    tieredPricing,
    tags = [],
  } = product;

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedVariation, setSelectedVariation] = useState(null);
  const [showTiers, setShowTiers] = useState(false);

  const imagesToDisplay =
    images && images.length > 0
      ? images
      : image
      ? [{ url: image }]
      : [];

  /* =====================
     DEFAULT VARIATION
  ===================== */

  useEffect(() => {
    if (variations && variations.length > 0) {
      setSelectedVariation(variations[0]);
    }
  }, [variations]);

  /* =====================
     IMAGE ROTATION
  ===================== */

  useEffect(() => {
    if (imagesToDisplay.length > 1) {
      const interval = setInterval(() => {
        setCurrentImageIndex(
          (prev) => (prev + 1) % imagesToDisplay.length
        );
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [imagesToDisplay]);

  /* =====================
     STOCK CALCULATION
  ===================== */

  const totalStock =
    variations && variations.length > 0
      ? variations.reduce((s, v) => s + Number(v.quantity || 0), 0)
      : Number(quantity || 0);

  const availableStock = selectedVariation
    ? Number(selectedVariation.quantity || 0)
    : totalStock;

  const isOutOfStock = totalStock <= 0;

  /* =====================
     CART HELPERS
  ===================== */

  const productWithVariation = {
    ...product,
    variation: selectedVariation,
  };

  const cartItemId = getCartItemId(productWithVariation);
  const cartQuantity = cart?.[cartItemId]?.quantity || 0;
  const unitPrice = cart?.[cartItemId]?.price ?? null;

  const isMaxStockReached = cartQuantity >= availableStock;

  /* =====================
     ADMIN ACTIONS
  ===================== */

  if (onEdit && onDelete) {
    const isNewArrival = tags.includes('new_arrival');
    const isTrending = tags.includes('trending');

    return (
      <div className="product-card admin-mode">
        <div className="product-info">
          <h4>{productName}</h4>
          <p>{productCode}</p>
        </div>

        <div className="admin-actions">
          <button onClick={onEdit}>Edit</button>
          <button onClick={onDelete}>Delete</button>

          <button
            className={`highlight-btn ${isNewArrival ? 'active' : ''}`}
            onClick={() => onToggleHighlight(id, 'new_arrival')}
          >
            New Arrival {isNewArrival && '✓'}
          </button>

          <button
            className={`highlight-btn ${isTrending ? 'active' : ''}`}
            onClick={() => onToggleHighlight(id, 'trending')}
          >
            Trending {isTrending && '✓'}
          </button>
        </div>
      </div>
    );
  }

  /* =====================
     TIER DISPLAY (UI ONLY)
  ===================== */

  const tiers =
    tieredPricing && Array.isArray(tieredPricing)
      ? [...tieredPricing].sort(
          (a, b) => Number(a.min_quantity) - Number(b.min_quantity)
        )
      : [];

  /* =====================
     RENDER
  ===================== */

  return (
    <div className={`product-card ${isOutOfStock ? 'out-of-stock' : ''}`}>
      {isOutOfStock && (
        <div className="out-of-stock-overlay">Out of Stock</div>
      )}

      {/* IMAGE */}
      <div className="product-image-container">
        <Zoom>
          <ProgressiveImage
            src={imagesToDisplay[currentImageIndex]?.url}
            alt={productName}
            className="product-image"
          />
        </Zoom>
      </div>

      {/* INFO */}
      <div className="product-info">
        <h4 className="product-title">{productName}</h4>
        <p className="product-code">{productCode}</p>

        {/* PRICE — FINAL PRICE FROM CART CONTEXT */}
        {unitPrice !== null && (
          <p className="product-price">
            ₹{Number(unitPrice).toFixed(2)} / unit
          </p>
        )}

        {/* BULK TIERS (DISPLAY ONLY) */}
        {tiers.length > 1 && (
          <>
            <button
              className="toggle-tiers-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowTiers(!showTiers);
              }}
            >
              {showTiers ? 'Hide Bulk Pricing' : 'Show Bulk Pricing'}
            </button>

            {showTiers && (
              <div className="tiered-pricing-container">
                {tiers.map((tier, i) => (
                  <div key={i} className="pricing-tier-row">
                    <span>
                      Buy {tier.min_quantity}
                      {tier.max_quantity ? `–${tier.max_quantity}` : '+'}
                    </span>
                    <span>₹{tier.price} / unit</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <p className="product-quantity">
          In Stock: {availableStock}
        </p>

        {/* VARIATIONS */}
        {variations && variations.length > 0 && (
          <div className="variations-selector">
            {variations.map((v, i) => {
              const idForVar = getCartItemId({
                ...product,
                variation: v,
              });

              const qtyInCart = cart?.[idForVar]?.quantity || 0;

              return (
                <button
                  key={i}
                  className={`variation-btn ${
                    selectedVariation === v ? 'selected' : ''
                  }`}
                  onClick={() => setSelectedVariation(v)}
                >
                  {v.color} {v.size}
                  {qtyInCart > 0 && (
                    <span className="variation-cart-qty">
                      ({qtyInCart})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ACTIONS */}
      <div className="product-actions">
        {cartQuantity === 0 ? (
          <button
            className="add-to-cart-btn"
            onClick={() => onIncrement(productWithVariation)}
            disabled={isMaxStockReached}
          >
            {isMaxStockReached
              ? 'Out of Stock'
              : 'Add to Cart'}
          </button>
        ) : (
          <div className="quantity-controls">
            <button onClick={() => onDecrement(cartItemId)}>-</button>
            <span>{cartQuantity}</span>
            <button
              onClick={() => onIncrement(productWithVariation)}
              disabled={isMaxStockReached}
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductCard;
