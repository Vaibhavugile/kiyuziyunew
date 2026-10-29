import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaBolt,
  FaArrowRight,
  FaCheck,
  FaPiggyBank,
  FaShoppingBag,
  FaStar,
} from 'react-icons/fa';
import './StickyOrderPricingBar.css';

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

const numeric = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Sticky order pricing reminder.
 *
 * Expected orderPricing fields (existing fields are preserved):
 * - slabs: [{ label, qualifyingValue, ... }]
 * - activeSlab
 * - nextSlab
 * - currentSubtotal / qualificationSubtotal
 * - savings
 * - nextTierSavings
 *
 * Optional original-price fields are supported when supplied by your pricing
 * calculation: originalSubtotal, subtotalBeforeDiscount, originalPrice,
 * undiscountedSubtotal, or compareAtSubtotal.
 */
const StickyOrderPricingBar = memo(function StickyOrderPricingBar({
  orderPricing,
  onClick,
}) {
  const [priceChanged, setPriceChanged] = useState(false);
  const previousPriceRef = useRef(null);

  const pricing = useMemo(() => {
    if (
      !orderPricing ||
      !Array.isArray(orderPricing.slabs) ||
      orderPricing.slabs.length < 2
    ) {
      return null;
    }

    const slabs = orderPricing.slabs;
    const active = orderPricing.activeSlab || slabs[0];
    const next = orderPricing.nextSlab || null;

    // Keep the same order-value precedence as the existing component.
    const orderValue = Math.max(
      0,
      numeric(
        orderPricing.currentSubtotal ?? orderPricing.qualificationSubtotal,
        0,
      ),
    );

    const nextThreshold =
      next && next.qualifyingValue != null
        ? numeric(next.qualifyingValue, 0)
        : null;

    const amountLeft =
      nextThreshold == null
        ? 0
        : Math.max(0, nextThreshold - orderValue);

    const progress =
      nextThreshold == null
        ? 100
        : Math.max(
            0,
            Math.min(100, (orderValue / Math.max(1, nextThreshold)) * 100),
          );

    const savings = Math.max(0, numeric(orderPricing.savings, 0));
    const nextTierSavings = Math.max(
      0,
      numeric(orderPricing.nextTierSavings, 0),
    );

    // Only display an original price if the pricing engine provides it.
    // Do not guess an original price from a discount or tier.
    const originalPriceCandidates = [
      orderPricing.originalSubtotal,
      orderPricing.subtotalBeforeDiscount,
      orderPricing.originalPrice,
      orderPricing.undiscountedSubtotal,
      orderPricing.compareAtSubtotal,
    ];

    const suppliedOriginal = originalPriceCandidates.find(
      (value) => value != null && Number.isFinite(Number(value)),
    );

    // Prefer the true pre-discount subtotal from the pricing engine.
    // If it is not supplied, derive a display value only when `savings`
    // represents the total money saved on this current order.
    const suppliedOriginalValue =
      suppliedOriginal == null ? null : Math.max(0, numeric(suppliedOriginal));

    const originalValue =
      suppliedOriginalValue != null && suppliedOriginalValue > orderValue
        ? suppliedOriginalValue
        : savings > 0
          ? orderValue + savings
          : null;

    const effectiveSavings =
      originalValue != null && originalValue > orderValue
        ? originalValue - orderValue
        : savings;

    const discountPercent =
      originalValue != null && originalValue > 0 && originalValue > orderValue
        ? Math.round(((originalValue - orderValue) / originalValue) * 100)
        : 0;

    return {
      active,
      next,
      orderValue,
      nextThreshold,
      amountLeft,
      progress,
      savings,
      nextTierSavings,
      originalValue,
      effectiveSavings,
      discountPercent,
    };
  }, [orderPricing]);

  useEffect(() => {
    if (!pricing) return undefined;

    const current = pricing.orderValue;
    if (previousPriceRef.current !== null && previousPriceRef.current !== current) {
      setPriceChanged(true);
      const timeoutId = window.setTimeout(() => setPriceChanged(false), 700);
      previousPriceRef.current = current;
      return () => window.clearTimeout(timeoutId);
    }

    previousPriceRef.current = current;
    return undefined;
  }, [pricing]);

  if (!pricing) return null;

  const {
    active,
    next,
    orderValue,
    amountLeft,
    progress,
    nextTierSavings,
    originalValue,
    effectiveSavings,
    discountPercent,
  } = pricing;

  const hasCurrentSavings = effectiveSavings > 0;
  const canSaveMore = Boolean(next && nextTierSavings > 0);
  const nextLabel = next?.label || 'next tier';

  return (
    <aside
      className={`sticky-order-pricing${priceChanged ? ' sop-price-changed' : ''}`}
      aria-label="Order pricing and savings"
      aria-live="polite"
    >
      <div className="sop-main">
        <div className="sop-bolt" aria-hidden="true">
          <FaBolt />
        </div>

        <div className="sop-values">
          <span className="sop-caption">YOUR PRICE</span>
          <div className="sop-price-group">
            <strong className="sop-total" key={orderValue}>
              {money(orderValue)}
            </strong>
           {originalValue != null && (
  <span
    className="sop-original"
    title="Original order value before savings"
  >
    Original {money(originalValue)}
  </span>
)}
            {discountPercent > 0 && (
              <span className="sop-discount-badge">
                {discountPercent}% OFF
              </span>
            )}
          </div>
        </div>

        <div className="sop-divider" aria-hidden="true" />

        <div className="sop-next">
          {next ? (
            <>
              <span className="sop-caption">UNLOCK {nextLabel}</span>
              <strong>
                {money(amountLeft)} <small>more to go</small>
              </strong>
              {canSaveMore && (
                <span className="sop-next-message">
                  Save another <strong>{money(nextTierSavings)}</strong>
                </span>
              )}
            </>
          ) : (
            <>
              <span className="sop-caption">BEST PRICING UNLOCKED</span>
              <strong className="sop-max">
                <FaCheck aria-hidden="true" /> {active?.label || 'Best tier'}
              </strong>
              <span className="sop-next-message">
                <FaStar aria-hidden="true" /> You have unlocked your best available price
              </span>
            </>
          )}
        </div>

        {hasCurrentSavings && (
          <div className="sop-savings" key={effectiveSavings}>
            <span><FaPiggyBank aria-hidden="true" /> YOU SAVE</span>
            <strong>{money(effectiveSavings)}</strong>
            {discountPercent > 0 && (
              <small>{discountPercent}% saved</small>
            )}
          </div>
        )}

        {next && (
          <div className="sop-arrow" aria-hidden="true">
            <FaArrowRight />
          </div>
        )}
      </div>

      <div
        className="sop-progress"
        role="progressbar"
        aria-label={next ? `Progress toward ${nextLabel}` : 'Best pricing unlocked'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      {next && (
        <div className="sop-footer">
          <FaShoppingBag aria-hidden="true" />
          <span>
            {amountLeft > 0 ? (
              <>
                Add <strong>{money(amountLeft)}</strong> more to reach{' '}
                <strong>{nextLabel}</strong>
                {canSaveMore && (
                  <> and unlock <strong>{money(nextTierSavings)}</strong> in extra savings.</>
                )}
              </>
            ) : (
              <>
                <FaStar aria-hidden="true" /> Your next pricing tier is ready to unlock.
              </>
            )}
          </span>
        </div>
      )}
    </aside>
  );
});

export default StickyOrderPricingBar;
