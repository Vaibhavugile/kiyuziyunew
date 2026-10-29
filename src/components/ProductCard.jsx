
import React, { useState, useEffect, useMemo } from 'react';
import './ProductCard.css';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';
import { getCartItemId, useCart } from './CartContext';
import ProgressiveImage from './ProgressiveImage';
import { useAuth } from './AuthContext';

/* =========================================================
   HELPERS
========================================================= */

const formatPrice = (value) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '—';
};

const normalizeTiers = (tiers) => {
  if (!Array.isArray(tiers)) return [];

  return tiers
    .filter(
      (tier) =>
        tier &&
        tier.price !== '' &&
        tier.price !== null &&
        Number.isFinite(Number(tier.price))
    )
    .map((tier) => ({
      ...tier,
      min_quantity: Math.max(
        1,
        Number(tier.min_quantity) || 1
      ),
      price: Number(tier.price),
    }))
    .sort((a, b) => a.min_quantity - b.min_quantity);
};

const getTierPrice = (tiers, quantity) => {
  if (!tiers.length) return null;

  const qty = Math.max(1, Number(quantity) || 1);
  let selected = tiers[0];

  for (const tier of tiers) {
    if (qty >= tier.min_quantity) {
      selected = tier;
    } else {
      break;
    }
  }

  return selected.price;
};

const getNextTier = (tiers, quantity) => {
  const qty = Math.max(1, Number(quantity) || 1);

  return (
    tiers.find((tier) => tier.min_quantity > qty) || null
  );
};

const cleanVariation = (variation) => {
  if (!variation) return null;

  return Object.fromEntries(
    Object.entries(variation).filter(
      ([key]) => key !== 'quantity'
    )
  );
};

/* =========================================================
   PRODUCT CARD
========================================================= */

const ProductCard = ({
  product,
  onIncrement,
  onDecrement,
  onEdit,
  onDelete,
  onToggleHighlight,
  isCart = false,
  cart: passedCart,
}) => {
  const {
    id,
    productName,
    productCode,
    image,
    additionalImages = [],
    variations,
    quantity,
    tieredPricing,
    tags = [],
  } = product;

  const { roleConfig } = useAuth();
  const cartContext = useCart() || {};

  const {
    cart: contextCart = {},
    pricingKey: contextPricingKey,
    orderPricing = {},
  } = cartContext;

  const cart = passedCart ?? contextCart;

  /*
   * Keep the pricing role in sync with CartContext.
   * The role config is only a fallback.
   */
  const basePricingKey =
    contextPricingKey ||
    roleConfig?.pricingKey ||
    'wholesale';

  const activePricingKey =
    orderPricing?.activePricingKey ||
    basePricingKey;

  const nextSlab = orderPricing?.nextSlab || null;
  const nextPricingKey = nextSlab?.pricingKey || null;

  const [selectedVariation, setSelectedVariation] =
    useState(null);

  const [showTiers, setShowTiers] = useState(false);
  const [pricePulse, setPricePulse] = useState(false);
  const [cardReady, setCardReady] = useState(false);

  const mainImage = image || additionalImages?.[0] || null;

  /* ---------------- ENTRANCE ANIMATION ---------------- */

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCardReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  /* ---------------- VARIATIONS ---------------- */

  useEffect(() => {
    if (Array.isArray(variations) && variations.length) {
      setSelectedVariation((current) => {
        if (current) {
          const match = variations.find(
            (variation) =>
              variation.color === current.color &&
              variation.size === current.size
          );

          if (match) return match;
        }

        return variations[0];
      });
    } else {
      setSelectedVariation(null);
    }
  }, [variations]);

  /* ---------------- STOCK ---------------- */

  const totalStock =
    Array.isArray(variations) && variations.length
      ? variations.reduce(
          (sum, variation) =>
            sum + (Number(variation.quantity) || 0),
          0
        )
      : Number(quantity) || 0;

  const availableStock = selectedVariation
    ? Number(selectedVariation.quantity) || 0
    : totalStock;

  const isOutOfStock = totalStock <= 0;

  const productWithVariation = {
    ...product,
    variation: cleanVariation(selectedVariation),
  };

  const cartItemId = getCartItemId(productWithVariation);
  const cartItem = cart?.[cartItemId] || null;
  const cartQuantity = Number(cartItem?.quantity) || 0;

  const isMaxStockReached =
    cartQuantity >= availableStock;

  /* ---------------- ROLE TIERS ---------------- */

  const baseTiers = useMemo(
    () => normalizeTiers(tieredPricing?.[basePricingKey]),
    [tieredPricing, basePricingKey]
  );

  const activeTiers = useMemo(
    () => normalizeTiers(tieredPricing?.[activePricingKey]),
    [tieredPricing, activePricingKey]
  );

  const nextRoleTiers = useMemo(
    () =>
      nextPricingKey
        ? normalizeTiers(tieredPricing?.[nextPricingKey])
        : [],
    [tieredPricing, nextPricingKey]
  );

  /*
   * Aggregate quantities for products that share the same
   * tier configuration, matching the existing cart grouping
   * approach. This does not combine unrelated tier structures.
   */
  const getGroupQuantity = (pricingRole, targetTiers) => {
    if (!targetTiers.length) {
      return Math.max(1, cartQuantity);
    }

    const targetSignature = JSON.stringify(
      targetTiers.map((tier) => [
        tier.min_quantity,
        tier.max_quantity ?? null,
        tier.price,
      ])
    );

    let total = 0;

    Object.values(cart || {}).forEach((item) => {
      const itemTiers = normalizeTiers(
        item?.tieredPricing?.[pricingRole]
      );

      const signature = JSON.stringify(
        itemTiers.map((tier) => [
          tier.min_quantity,
          tier.max_quantity ?? null,
          tier.price,
        ])
      );

      if (
        itemTiers.length &&
        signature === targetSignature
      ) {
        total += Number(item.quantity) || 0;
      }
    });

    return Math.max(1, total || cartQuantity);
  };

  const baseGroupQuantity = getGroupQuantity(
    basePricingKey,
    baseTiers
  );

  const activeGroupQuantity = getGroupQuantity(
    activePricingKey,
    activeTiers
  );

  const nextGroupQuantity = getGroupQuantity(
    nextPricingKey,
    nextRoleTiers
  );

  /* ---------------- FIRST ROLE PRICE ---------------- */

  /*
   * This is the first tier price for the customer's base role.
   * It is a reference price, not a fabricated MRP.
   */
  const firstRolePrice = baseTiers.length
    ? getTierPrice(baseTiers, 1)
    : null;

  /* ---------------- CURRENT APPLIED PRICE ---------------- */

  /*
   * If this exact item already exists in the cart, prefer the
   * actual price stored on that item. Otherwise calculate the
   * price using the currently active role and grouped quantity.
   */
  const cartAppliedPrice =
    cartItem &&
    cartItem.price !== '' &&
    cartItem.price !== null &&
    Number.isFinite(Number(cartItem.price))
      ? Number(cartItem.price)
      : null;

  const calculatedCurrentPrice = getTierPrice(
    activeTiers,
    activeGroupQuantity
  );

  const currentPrice =
    cartAppliedPrice !== null
      ? cartAppliedPrice
      : calculatedCurrentPrice;

  const currentPriceLabel =
    activePricingKey === basePricingKey
      ? 'YOUR PRICE'
      : `YOUR ${String(activePricingKey)
          .replace(/_/g, ' ')
          .toUpperCase()} PRICE`;

  const hasFirstRoleSavings =
    firstRolePrice !== null &&
    currentPrice !== null &&
    firstRolePrice > currentPrice;

  const firstRoleSavings = hasFirstRoleSavings
    ? firstRolePrice - currentPrice
    : 0;

  const firstRoleSavingsPercent =
    hasFirstRoleSavings && firstRolePrice > 0
      ? Math.round(
          (firstRoleSavings / firstRolePrice) * 100
        )
      : 0;

  /* ---------------- NEXT ROLE PRICE ---------------- */

  const nextRolePrice = nextRoleTiers.length
    ? getTierPrice(nextRoleTiers, nextGroupQuantity)
    : null;

  const nextRoleSavingsPerUnit =
    nextRolePrice !== null && currentPrice !== null
      ? Math.max(0, currentPrice - nextRolePrice)
      : 0;

  const hasNextRolePrice =
    Boolean(nextSlab) &&
    nextRolePrice !== null &&
    nextRoleSavingsPerUnit > 0;

  const nextRoleLabel =
    nextSlab?.label ||
    String(nextPricingKey || '').replace(/_/g, ' ');

  const amountToNextRole = Math.max(
    0,
    Number(orderPricing?.amountToNextSlab) || 0
  );

  const qualificationSubtotal =
    Number(orderPricing?.qualificationSubtotal) || 0;

  const nextRoleThreshold =
    Number(nextSlab?.qualifyingValue) || 0;

  const orderProgress =
    nextRoleThreshold > 0
      ? Math.min(
          100,
          (qualificationSubtotal / nextRoleThreshold) * 100
        )
      : 0;

  /* ---------------- NEXT QUANTITY TIER ---------------- */

  const nextQuantityTier = getNextTier(
    activeTiers,
    activeGroupQuantity
  );

  const nextQuantityPrice =
    nextQuantityTier?.price ?? null;

  const unitsToNextQuantityTier = nextQuantityTier
    ? Math.max(
        0,
        nextQuantityTier.min_quantity -
          activeGroupQuantity
      )
    : 0;

  const quantityTierSavings =
    nextQuantityPrice !== null && currentPrice !== null
      ? Math.max(0, currentPrice - nextQuantityPrice)
      : 0;

  const currentTier =
    [...activeTiers]
      .reverse()
      .find(
        (tier) =>
          activeGroupQuantity >= tier.min_quantity
      ) ||
    activeTiers[0] ||
    null;

  const currentTierMin =
    Number(currentTier?.min_quantity) || 1;

  const quantityProgress = nextQuantityTier
    ? Math.min(
        100,
        Math.max(
          0,
          ((activeGroupQuantity - currentTierMin) /
            Math.max(
              1,
              nextQuantityTier.min_quantity -
                currentTierMin
            )) *
            100
        )
      )
    : 100;

  /* ---------------- PRICE ANIMATION ---------------- */

  useEffect(() => {
    setPricePulse(true);

    const timeout = window.setTimeout(
      () => setPricePulse(false),
      420
    );

    return () => window.clearTimeout(timeout);
  }, [
    currentPrice,
    nextRolePrice,
    nextQuantityPrice,
    activePricingKey,
    activeGroupQuantity,
  ]);

  /* ---------------- ADMIN MODE ---------------- */

  if (isOutOfStock && !(onEdit && onDelete)) {
    return null;
  }

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
          <button type="button" onClick={onEdit}>
            Edit
          </button>

          <button type="button" onClick={onDelete}>
            Delete
          </button>

          <button
            type="button"
            className={`highlight-btn ${
              isNewArrival ? 'active' : ''
            }`}
            onClick={() =>
              onToggleHighlight?.(id, 'new_arrival')
            }
          >
            New Arrival {isNewArrival && '✓'}
          </button>

          <button
            type="button"
            className={`highlight-btn ${
              isTrending ? 'active' : ''
            }`}
            onClick={() =>
              onToggleHighlight?.(id, 'trending')
            }
          >
            Trending {isTrending && '✓'}
          </button>
        </div>
      </div>
    );
  }

  /* =========================================================
     PREMIUM COMPACT CARD
  ========================================================= */

  return (
    <div
      className={[
        'product-card',
        'pc-premium-card',
        cardReady ? 'pc-card-ready' : 'pc-card-entering',
        isOutOfStock ? 'out-of-stock' : '',
        pricePulse ? 'price-pulse' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {isOutOfStock && (
        <div className="out-of-stock-overlay">
          Out of Stock
        </div>
      )}

      {/* PRODUCT IMAGE */}

      <div className="product-image-container">
        {mainImage ? (
          <Zoom>
            <ProgressiveImage
              src={mainImage}
              alt={productName}
              className="product-image"
            />
          </Zoom>
        ) : (
          <div className="product-image-placeholder">
            No image available
          </div>
        )}

        {hasFirstRoleSavings && (
          <span className="product-discount-badge pc-badge-animated">
            Save {firstRoleSavingsPercent}%
          </span>
        )}
      </div>

      {/* PRODUCT DETAILS */}

      <div className="product-info">
        <div className="product-header-row">
          <h4 className="product-title">
            {productName}
          </h4>

          <span className="stock-badge">
            {availableStock} left
          </span>
        </div>

        <p className="product-code">{productCode}</p>

        {/* PRICE ORDER: FIRST ROLE → CURRENT → NEXT SAVING */}

        <div
          className={[
            'pc-mini-pricing',
            pricePulse ? 'is-changing' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-live="polite"
        >
          {/* 1. FIRST ROLE PRICE — CROSSED OUT AT THE TOP */}

          {firstRolePrice !== null && (
            <div className="pc-mini-base-price pc-price-enter">
              <span>FIRST ROLE PRICE</span>

              <strong
                className={
                  hasFirstRoleSavings
                    ? 'pc-mini-old-price'
                    : ''
                }
              >
                ₹{formatPrice(firstRolePrice)}
              </strong>
            </div>
          )}

          {/* 2. CURRENT PRICE — GREEN */}

          <div className="pc-mini-main pc-price-enter">
            <div className="pc-mini-price">
              <span className="pc-mini-label">
                {currentPriceLabel}
              </span>

              <div className="pc-mini-price-line">
                <strong key={`${currentPrice}-${activeGroupQuantity}`}>
                  {currentPrice !== null
                    ? `₹${formatPrice(currentPrice)}`
                    : 'Price unavailable'}
                </strong>

                <span>/ unit</span>
              </div>
            </div>

            {hasFirstRoleSavings && (
              <div className="pc-mini-save">
                <span className="pc-mini-save-icon">
                  ✓
                </span>

                <div>
                  <strong>
                    Save ₹{formatPrice(firstRoleSavings)}
                  </strong>

                  <small>
                    {firstRoleSavingsPercent}% off
                  </small>
                </div>
              </div>
            )}
          </div>

          {/* 3A. NEXT ROLE PRICE — IF CARTCONTEXT HAS A NEXT ROLE */}

          {hasNextRolePrice && (
            <div className="pc-mini-next pc-price-enter">
              <div className="pc-mini-next-top">
                <span>
                  <span className="pc-mini-spark">✦</span>
                  UNLOCK {nextRoleLabel.toUpperCase()}
                </span>

                {amountToNextRole > 0 && (
                  <span className="pc-mini-unlock">
                    ₹{formatPrice(amountToNextRole)} more
                  </span>
                )}
              </div>

              <div className="pc-mini-next-bottom">
                <div>
                  <strong key={`${nextRolePrice}-${nextGroupQuantity}`}>
                    ₹{formatPrice(nextRolePrice)}
                  </strong>

                  <span>/ unit</span>
                </div>

                <span className="pc-mini-extra-saving">
                  Save ₹{formatPrice(nextRoleSavingsPerUnit)}/unit
                </span>
              </div>

              <div className="pc-mini-progress">
                <span
                  style={{ width: `${orderProgress}%` }}
                />
              </div>

              {amountToNextRole > 0 && (
                <p className="pc-mini-hint">
                  Add ₹{formatPrice(amountToNextRole)} more to unlock
                </p>
              )}
            </div>
          )}

          {/* 3B. NEXT QUANTITY PRICE — FALLBACK WITHIN CURRENT ROLE */}

          {!hasNextRolePrice &&
            nextQuantityTier &&
            nextQuantityPrice !== null && (
              <div className="pc-mini-next pc-price-enter">
                <div className="pc-mini-next-top">
                  <span>
                    <span className="pc-mini-spark">✦</span>
                    BUY MORE, SAVE MORE
                  </span>

                  <span className="pc-mini-unlock">
                    {nextQuantityTier.min_quantity}+ units
                  </span>
                </div>

                <div className="pc-mini-next-bottom">
                  <div>
                    <strong key={`${nextQuantityPrice}-${activeGroupQuantity}`}>
                      ₹{formatPrice(nextQuantityPrice)}
                    </strong>

                    <span>/ unit</span>
                  </div>

                  {quantityTierSavings > 0 && (
                    <span className="pc-mini-extra-saving">
                      Save ₹{formatPrice(quantityTierSavings)}/unit
                    </span>
                  )}
                </div>

                <div className="pc-mini-progress">
                  <span
                    style={{ width: `${quantityProgress}%` }}
                  />
                </div>

                <p className="pc-mini-hint">
                  Add {unitsToNextQuantityTier} more{' '}
                  {unitsToNextQuantityTier === 1
                    ? 'unit'
                    : 'units'}{' '}
                  to unlock
                </p>
              </div>
            )}

          {/* ALL QUANTITY TIERS ALREADY UNLOCKED */}

          {!hasNextRolePrice &&
            !nextQuantityTier &&
            activeTiers.length > 0 && (
              <div className="pc-mini-next pc-mini-tier-max">
                <span>✓</span>
                <span>You're getting the best quantity price</span>
              </div>
            )}
        </div>

        {/* EXPANDABLE QUANTITY PRICES */}

        {activeTiers.length > 1 && (
          <>
            <button
              type="button"
              className="bulk-toggle-btn"
              aria-expanded={showTiers}
              onClick={(event) => {
                event.stopPropagation();
                setShowTiers((value) => !value);
              }}
            >
              <span>
                {showTiers
                  ? 'Hide bulk prices'
                  : 'View all bulk prices'}
              </span>

              <span
                className={`bulk-toggle-chevron ${
                  showTiers ? 'open' : ''
                }`}
              >
                ⌄
              </span>
            </button>

            {showTiers && (
              <div className="tiered-pricing-container pc-tiers-animated">
                {activeTiers.map((tier, index) => {
                  const max =
                    tier.max_quantity === '' ||
                    tier.max_quantity == null
                      ? null
                      : Number(tier.max_quantity) || null;

                  const isActive =
                    currentTier?.min_quantity ===
                    tier.min_quantity;

                  return (
                    <div
                      key={`${tier.min_quantity}-${max ?? 'plus'}-${index}`}
                      className={`pricing-tier-row ${
                        isActive ? 'active-tier' : ''
                      }`}
                      style={{
                        animationDelay: `${index * 35}ms`,
                      }}
                    >
                      <span className="pricing-tier-qty">
                        {tier.min_quantity}
                        {max ? `–${max}` : '+'} units
                      </span>

                      <span className="pricing-tier-price">
                        ₹{formatPrice(tier.price)}{' '}
                        <small>/ unit</small>
                      </span>

                      {isActive && (
                        <span className="pricing-tier-current">
                          Current
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* VARIATIONS */}

        {Array.isArray(variations) &&
          variations.length > 0 && (
            <div
              className="variations-selector"
              aria-label="Choose product variation"
            >
              {variations.map((variation, index) => {
                const variationId = getCartItemId({
                  ...product,
                  variation: cleanVariation(variation),
                });

                const variationQty =
                  Number(cart?.[variationId]?.quantity) || 0;

                const selected =
                  selectedVariation?.color === variation.color &&
                  selectedVariation?.size === variation.size;

                return (
                  <button
                    type="button"
                    key={`${variation.color || ''}-${variation.size || ''}-${index}`}
                    className={`variation-btn ${
                      selected ? 'selected' : ''
                    }`}
                    onClick={() => setSelectedVariation(variation)}
                    aria-pressed={selected}
                  >
                    {[variation.color, variation.size]
                      .filter(Boolean)
                      .join(' ')}

                    {variationQty > 0 && (
                      <span className="variation-cart-qty">
                        {variationQty}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
      </div>

      {/* CART CONTROLS */}

      <div className="product-actions">
        {cartQuantity === 0 ? (
          <button
            type="button"
            className="add-to-cart-btn"
            onClick={() =>
              onIncrement?.(productWithVariation)
            }
            disabled={
              isMaxStockReached || availableStock <= 0
            }
          >
            <span className="pc-cart-button-content">
              <span>
                {isMaxStockReached || availableStock <= 0
                  ? 'Out of Stock'
                  : 'Add to Cart'}
              </span>

              {!isMaxStockReached &&
                availableStock > 0 && (
                  <span className="pc-cart-arrow">→</span>
                )}
            </span>
          </button>
        ) : (
          <div
            className="quantity-controls"
            aria-label="Cart quantity controls"
          >
            <button
              type="button"
              onClick={() => onDecrement?.(cartItemId)}
              aria-label="Remove one"
            >
              −
            </button>

            <span key={cartQuantity}>
              {cartQuantity}
            </span>

            <button
              type="button"
              onClick={() =>
                onIncrement?.(productWithVariation)
              }
              disabled={isMaxStockReached}
              aria-label="Add one"
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
