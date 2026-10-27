
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  FaCheck,
  FaCrown,
  FaMagic,
  FaTimes,
  FaArrowDown,
} from 'react-icons/fa';
import './PriceChangeCelebration.css';

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

/**
 * Full-screen tier-unlock animation.
 * Does not run on initial page load.
 * Remains open until the customer closes it manually.
 */
const PriceChangeCelebration = ({ orderPricing, onClose }) => {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [celebration, setCelebration] = useState(null);

  const previousTierRef = useRef(null);
  const leaveTimerRef = useRef(null);

  const activeKey = orderPricing?.activePricingKey || null;
  const activeLabel =
    orderPricing?.activeSlab?.label || 'Better pricing';

  const currentSubtotal = Number(
    orderPricing?.currentSubtotal || 0
  );

  const qualificationSubtotal = Number(
    orderPricing?.qualificationSubtotal || 0
  );

  const savings = Math.max(
    0,
    Number(orderPricing?.savings || 0)
  );

  // Close only when the customer explicitly dismisses the celebration.
  const dismiss = useCallback(() => {
    if (!visible || leaving) return;

    setLeaving(true);

    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
    }

    leaveTimerRef.current = window.setTimeout(() => {
      setVisible(false);
      setLeaving(false);
      setCelebration(null);
      leaveTimerRef.current = null;
      onClose?.();
    }, 420);
  }, [visible, leaving, onClose]);

  // Detect tier upgrades without triggering on initial page load.
  useEffect(() => {
    if (!activeKey) return undefined;

    const tierIndex = (orderPricing?.slabs || []).findIndex(
      (slab) => slab.pricingKey === activeKey
    );

    if (previousTierRef.current === null) {
      previousTierRef.current = {
        key: activeKey,
        index: tierIndex,
      };

      return undefined;
    }

    if (previousTierRef.current.key === activeKey) {
      return undefined;
    }

    const previousIndex = previousTierRef.current.index;

    previousTierRef.current = {
      key: activeKey,
      index: tierIndex,
    };

    // Do not celebrate when the customer falls to a lower tier.
    if (tierIndex <= previousIndex) {
      return undefined;
    }

    setCelebration({
      tier: activeLabel,
      orderValue: currentSubtotal,
      originalValue: qualificationSubtotal,
      savings,
    });

    setLeaving(false);
    setVisible(true);

    // Intentionally no automatic-close timers.
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }

    return undefined;
  }, [
    activeKey,
    activeLabel,
    currentSubtotal,
    qualificationSubtotal,
    savings,
    orderPricing?.slabs,
  ]);

  // Clean up only the manual exit animation timer.
  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        window.clearTimeout(leaveTimerRef.current);
      }
    };
  }, []);

  // Allow Escape to close the popup manually.
  useEffect(() => {
    if (!visible) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        dismiss();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, dismiss]);

  if (!visible || !celebration) {
    return null;
  }

  return (
    <div
      className={`price-celebration-backdrop ${
        leaving ? 'is-leaving' : ''
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Better pricing unlocked"
    >
      <div className="pc-aurora pc-aurora-one" />
      <div className="pc-aurora pc-aurora-two" />
      <div className="pc-noise" />

      <button
        type="button"
        className="pc-close"
        onClick={dismiss}
        aria-label="Close price animation"
      >
        <FaTimes />
      </button>

      <div className="pc-confetti" aria-hidden="true">
        {Array.from({ length: 34 }, (_, index) => (
          <span
            key={index}
            className={`pc-confetti-piece pc-confetti-${index % 7}`}
            style={{
              '--i': index,
              '--delay': `${(index % 9) * 0.07}s`,
              left: `${((index * 37 + 4) % 100)}%`,
              '--drift': `${((index % 7) - 3) * 22}px`,
            }}
          />
        ))}
      </div>

      <section className="pc-celebration-card">
        <div className="pc-orbit pc-orbit-one" />
        <div className="pc-orbit pc-orbit-two" />

        <div className="pc-emblem">
          <span className="pc-emblem-glow" />
          <FaCrown />
        </div>

        <div className="pc-eyebrow">
          <FaCheck />
          PRICING UPGRADED
          <FaMagic />
        </div>

        <h2>That’s a better deal.</h2>

        <p className="pc-tier-line">
          You unlocked <strong>{celebration.tier}</strong> pricing
          for this order.
        </p>

        <div className="pc-price-comparison">
          <div className="pc-price-before">
            <span>Original order value</span>
            <strong>{money(celebration.originalValue)}</strong>
          </div>

          <div className="pc-price-drop">
            <FaArrowDown />
          </div>

          <div className="pc-price-after">
            <span>New order value</span>
            <strong>{money(celebration.orderValue)}</strong>
          </div>
        </div>

        <div className="pc-savings-pill">
          <span className="pc-savings-icon">
            <FaMagic />
          </span>

          <span>
            <small>YOU’RE SAVING ON THIS ORDER</small>
            <strong>{money(celebration.savings)}</strong>
          </span>

          <span className="pc-savings-shimmer" />
        </div>

        <div className="pc-footer-note">
          Your permanent customer role stays the same. This better
          price applies to this order.
        </div>

        <button
          type="button"
          className="pc-continue"
          onClick={dismiss}
        >
          Continue shopping <span>↗</span>
        </button>
      </section>
    </div>
  );
};

export default PriceChangeCelebration;
