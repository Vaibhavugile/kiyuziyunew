// src/components/ProductCard.jsx
// Multi-role ready, UI-only. Pricing logic remains outside this component.

import React, { useState, useEffect, forwardRef } from 'react';
import './StoreProductCard.css';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';
import { getCartItemId } from '../pages/store/StoreCartContext';
import  SProgressiveImage from './StoreProgressiveImage';
import { useAuth } from './AuthContext';

const StoreProductCard = forwardRef(({
  product,
  onIncrement,
  onDecrement,
  onEdit,
  onDelete,
  onToggleHighlight,
  isCart = false,
  cart = {},
  imagePriority = false,
}, ref) => {
  const {
    id,
    productName,
    productCode,
    image,
    thumbnail,
    medium,
    additionalImages = [],
    additionalThumbnails = [],
    additionalMediumImages = [],
    variations = [],
    quantity,
    tieredPricing,
    tags = [],
    calculatedPrice,
  } = product;

  const { roleConfig } = useAuth();
  const pricingKey = 'retail';

  const [selectedVariation, setSelectedVariation] = useState(null);
  const [showTiers, setShowTiers] = useState(false);

  // Ignore empty/whitespace values so they cannot block valid image fallbacks.
  const firstValidImage = (...values) =>
    values.find((value) => typeof value === 'string' && value.trim()) || null;

  const mainImage = firstValidImage(image, additionalImages[0], medium, thumbnail);
  const thumbnailImage = firstValidImage(
    thumbnail, additionalThumbnails[0], medium,
    additionalMediumImages[0], mainImage
  );
  const mediumImage = firstValidImage(
    medium, additionalMediumImages[0], mainImage, thumbnailImage
  );

  useEffect(() => {
    setSelectedVariation(variations.length > 0 ? variations[0] : null);
  }, [variations]);

  // If variations exist, their quantities are the stock source of truth.
  const totalStock = variations.length > 0
    ? variations.reduce((sum, variation) => sum + Number(variation.quantity || 0), 0)
    : Number(quantity || 0);

  const availableStock = selectedVariation
    ? Number(selectedVariation.quantity || 0)
    : totalStock;

  const isOutOfStock = totalStock <= 0;

  // Keep admin controls visible even when a product is out of stock.
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
          <button type="button" onClick={onEdit}>Edit</button>
          <button type="button" onClick={onDelete}>Delete</button>
          <button
            type="button"
            className={`highlight-btn ${isNewArrival ? 'active' : ''}`}
            onClick={() => onToggleHighlight?.(id, 'new_arrival')}
          >
            New Arrival {isNewArrival && '✓'}
          </button>
          <button
            type="button"
            className={`highlight-btn ${isTrending ? 'active' : ''}`}
            onClick={() => onToggleHighlight?.(id, 'trending')}
          >
            Trending {isTrending && '✓'}
          </button>
        </div>
      </div>
    );
  }

  if (isOutOfStock && !isCart) return null;

  const cleanVariation = selectedVariation
    ? Object.fromEntries(
        Object.entries(selectedVariation).filter(([key]) => key !== 'quantity')
      )
    : null;

  const productWithVariation = {
    ...product,
    variation: cleanVariation,
  };

  const tiers = Array.isArray(tieredPricing?.[pricingKey])
    ? [...tieredPricing[pricingKey]].sort(
        (a, b) => Number(a.min_quantity) - Number(b.min_quantity)
      )
    : [];

  const startingPrice = calculatedPrice ?? (
    tiers.length > 0 ? Number(tiers[0].price) : null
  );

  const subQty = Object.values(cart).reduce((sum, item) => {
    return item.subcollectionId === product.subcollectionId
      ? sum + Number(item.quantity || 0)
      : sum;
  }, 0);

  const getTierPrice = (priceTiers, qty) => {
    if (!priceTiers.length) return null;

    let selectedTier = priceTiers[0];
    for (const tier of priceTiers) {
      const min = Number(tier.min_quantity);
      const max = Number(tier.max_quantity) || Infinity;
      if (qty >= min && qty <= max) selectedTier = tier;
    }
    return Number(selectedTier.price);
  };

  const cartItemId = getCartItemId(productWithVariation);
  const cartQuantity = Number(cart[cartItemId]?.quantity || 0);
  const unitPrice = getTierPrice(tiers, subQty || 1);
  const isMaxStockReached = cartQuantity >= availableStock;

  return (
    <div
      ref={ref}
      className={`storeproductcard-container ${
        isOutOfStock ? 'storeproductcard-out-of-stock' : ''
      }`}
    >
      {isOutOfStock && (
        <div className="storeproductcard-stock-overlay">Out of Stock</div>
      )}

      <div className="storeproductcard-image-wrapper">
        {mainImage ? (
          <Zoom>
            <SProgressiveImage
              thumbnailSrc={thumbnailImage}
              mediumSrc={mediumImage}
              src={mainImage}
              alt={productName || 'Product image'}
              className="storeproductcard-image"
              priority={imagePriority}
            />
          </Zoom>
        ) : (
          <div className="storeproductcard-image-placeholder">
            No image available
          </div>
        )}
      </div>

      <div className="storeproductcard-info">
        <div className="product-header-row">
          <h4 className="storeproductcard-title">{productName}</h4>
          <span className="stock-badge">Stock - {availableStock} left</span>
        </div>

        <p className="storeproductcard-price">
          ₹{Number(
            cartQuantity > 0
              ? (unitPrice ?? startingPrice ?? 0)
              : (startingPrice ?? 0)
          ).toFixed(2)}/Unit
        </p>

        <div className="storeproductcard-meta">
          <span className="storeproductcard-code">{productCode}</span>
        </div>

        {tiers.length > 1 && (
          <>
            <button
              type="button"
              className="storeproductcard-bulk-toggle-btn"
              onClick={(event) => {
                event.stopPropagation();
                setShowTiers((visible) => !visible);
              }}
            >
              {showTiers ? 'Hide bulk price' : 'Bulk price'}
            </button>

            {showTiers && (
              <div className="storeproductcard-tier-container">
                {tiers.map((tier, index) => {
                  const isUnlocked =
                    cartQuantity >= Number(tier.min_quantity) &&
                    (!tier.max_quantity ||
                      cartQuantity <= Number(tier.max_quantity));

                  return (
                    <div
                      key={`${tier.min_quantity}-${tier.max_quantity ?? 'plus'}-${index}`}
                      className={`storeproductcard-tier-row ${
                        isUnlocked ? 'storeproductcard-tier-active' : ''
                      }`}
                    >
                      {tier.min_quantity}
                      {tier.max_quantity ? `–${tier.max_quantity}` : '+'}
                      {' '}₹{tier.price}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {variations.length > 0 && (
          <div className="storeproductcard-variations">
            {variations.map((variation, index) => {
              const cleanVar = Object.fromEntries(
                Object.entries(variation).filter(([key]) => key !== 'quantity')
              );
              const idForVar = getCartItemId({
                ...product,
                variation: cleanVar,
              });
              const qtyInCart = Number(cart[idForVar]?.quantity || 0);

              return (
                <button
                  type="button"
                  key={variation.id || `${variation.color || ''}-${variation.size || ''}-${index}`}
                  className={`storeproductcard-variation-btn ${
                    selectedVariation === variation
                      ? 'storeproductcard-variation-selected'
                      : ''
                  }`}
                  onClick={() => setSelectedVariation(variation)}
                >
                  {variation.color} {variation.size}
                  {qtyInCart > 0 && (
                    <span className="storeproductcard-variation-cartqty">
                      {qtyInCart}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="storeproductcard-actions">
        {cartQuantity === 0 ? (
          <button
            type="button"
            className="storeproductcard-add-btn"
            onClick={() => onIncrement?.(productWithVariation)}
            disabled={isMaxStockReached || isOutOfStock}
          >
            {isMaxStockReached || isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
          </button>
        ) : (
          <div className="storeproductcard-qty-controls">
            <button type="button" onClick={() => onDecrement?.(cartItemId)}>
              -
            </button>
            <span>{cartQuantity}</span>
            <button
              type="button"
              onClick={() => onIncrement?.(productWithVariation)}
              disabled={isMaxStockReached}
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

StoreProductCard.displayName = 'StoreProductCard';

export default StoreProductCard;
