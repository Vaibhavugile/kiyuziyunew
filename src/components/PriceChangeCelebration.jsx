import React, { useEffect, useRef, useState } from 'react';
import { FaCheck, FaCrown, FaMagic, FaTimes, FaArrowDown } from 'react-icons/fa';
import './PriceChangeCelebration.css';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** Full-screen tier-unlock animation. It intentionally does not run on initial page load. */
const PriceChangeCelebration = ({ orderPricing }) => {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const previousTierRef = useRef(null);
  const closeTimerRef = useRef(null);
  const leaveTimerRef = useRef(null);
  const [celebration, setCelebration] = useState(null);

  const activeKey = orderPricing?.activePricingKey || null;
  const activeLabel = orderPricing?.activeSlab?.label || 'Better pricing';
  const currentSubtotal = Number(orderPricing?.currentSubtotal || 0);
  const qualificationSubtotal = Number(orderPricing?.qualificationSubtotal || 0);
  const savings = Math.max(0, Number(orderPricing?.savings || 0));

  useEffect(() => {
    if (!activeKey) return undefined;

    // Set a baseline on first render so existing carts do not trigger a false celebration.
    const tierIndex = (orderPricing?.slabs || []).findIndex((slab) => slab.pricingKey === activeKey);
    if (previousTierRef.current === null) {
      previousTierRef.current = { key: activeKey, index: tierIndex };
      return undefined;
    }

    if (previousTierRef.current.key !== activeKey) {
      const wasUpgrade = tierIndex > previousTierRef.current.index;
      previousTierRef.current = { key: activeKey, index: tierIndex };
      // Celebrate only an upgrade. Removing products may lower the tier; do not call that an upgrade.
      if (!wasUpgrade) return undefined;
      setCelebration({
        tier: activeLabel,
        orderValue: currentSubtotal,
        originalValue: qualificationSubtotal,
        savings,
      });
      setLeaving(false);
      setVisible(true);

      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => setLeaving(true), 3600);
      leaveTimerRef.current = window.setTimeout(() => setVisible(false), 4050);
    }

    return undefined;
  }, [activeKey, activeLabel, currentSubtotal, qualificationSubtotal, savings, orderPricing?.slabs]);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  const dismiss = () => {
    setLeaving(true);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = window.setTimeout(() => setVisible(false), 420);
  };

  if (!visible || !celebration) return null;

  return (
    <div className={`price-celebration-backdrop ${leaving ? 'is-leaving' : ''}`} role="dialog" aria-modal="true" aria-label="Better pricing unlocked">
      <div className="pc-aurora pc-aurora-one" />
      <div className="pc-aurora pc-aurora-two" />
      <div className="pc-noise" />
      <button type="button" className="pc-close" onClick={dismiss} aria-label="Close price animation"><FaTimes /></button>

      <div className="pc-confetti" aria-hidden="true">
        {Array.from({ length: 34 }, (_, index) => (
          <span key={index} className={`pc-confetti-piece pc-confetti-${index % 7}`} style={{ '--i': index, '--delay': `${(index % 9) * 0.07}s`, left: `${((index * 37 + 4) % 100)}%`, '--drift': `${((index % 7) - 3) * 22}px` }} />
        ))}
      </div>

      <section className="pc-celebration-card">
        <div className="pc-orbit pc-orbit-one" />
        <div className="pc-orbit pc-orbit-two" />
        <div className="pc-emblem"><span className="pc-emblem-glow" /><FaCrown /></div>
        <div className="pc-eyebrow"><FaCheck /> PRICING UPGRADED <FaMagic /></div>
        <h2>That’s a better deal.</h2>
        <p className="pc-tier-line">You unlocked <strong>{celebration.tier}</strong> pricing for this order.</p>

        <div className="pc-price-comparison">
          <div className="pc-price-before">
            <span>Original order value</span>
            <strong>{money(celebration.originalValue)}</strong>
          </div>
          <div className="pc-price-drop"><FaArrowDown /></div>
          <div className="pc-price-after">
            <span>New order value</span>
            <strong>{money(celebration.orderValue)}</strong>
          </div>
        </div>

        <div className="pc-savings-pill">
          <span className="pc-savings-icon"><FaMagic /></span>
          <span><small>YOU’RE SAVING ON THIS ORDER</small><strong>{money(celebration.savings)}</strong></span>
          <span className="pc-savings-shimmer" />
        </div>
        <div className="pc-footer-note">Your permanent customer role stays the same. This better price applies to this order.</div>
        <button type="button" className="pc-continue" onClick={dismiss}>Continue shopping <span>↗</span></button>
      </section>
    </div>
  );
};

export default PriceChangeCelebration;
