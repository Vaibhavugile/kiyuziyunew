import React, { useEffect, useRef, useState } from 'react';
import { FaBolt, FaCheck, FaLock, FaArrowRight, FaArrowDown } from 'react-icons/fa';
import './OrderPricingPromo.css';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// Smoothly counts up or down whenever pricing changes, including when a tier
// unlocks and the actual order total drops.
const AnimatedMoney = ({ value, className = '' }) => {
  const target = Number(value || 0);
  const [shown, setShown] = useState(target);
  const previousTarget = useRef(target);
  const frameRef = useRef(null);

  useEffect(() => {
    const from = previousTarget.current;
    const to = target;
    previousTarget.current = to;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (from === to) {
      setShown(to);
      return undefined;
    }

    const duration = 720;
    let startTime;
    const tick = (time) => {
      if (startTime === undefined) startTime = time;
      const raw = Math.min(1, (time - startTime) / duration);
      const eased = 1 - Math.pow(1 - raw, 3);
      setShown(from + (to - from) * eased);
      if (raw < 1) frameRef.current = requestAnimationFrame(tick);
      else frameRef.current = null;
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target]);

  return <span className={className}>{money(shown)}</span>;
};

const OrderPricingPromo = ({ orderPricing }) => {
  if (!orderPricing || !Array.isArray(orderPricing.slabs) || orderPricing.slabs.length < 2) return null;

  const slabs = orderPricing.slabs;
  const qualifyingSubtotal = Number(orderPricing.qualificationSubtotal || 0);
  const currentSubtotal = Number(orderPricing.currentSubtotal ?? qualifyingSubtotal);
  const active = orderPricing.activeSlab || slabs[0];
  const next = orderPricing.nextSlab;
  const nextThreshold = next ? Number(next.qualifyingValue || 0) : null;

  // Tier eligibility is still determined by assigned-role prices, so discounts
  // cannot make the currently unlocked tier disappear. The next-tier gap is
  // intentionally calculated from the reduced, customer-facing order value.
  const amountLeft = nextThreshold !== null
    ? Math.max(0, nextThreshold - currentSubtotal)
    : 0;
  const progress = nextThreshold !== null
    ? Math.max(0, Math.min(100, (currentSubtotal / Math.max(1, nextThreshold)) * 100))
    : 100;
  const saved = Math.max(0, Number(orderPricing.savings || 0));
  const nextTierSavings = Math.max(0, Number(orderPricing.nextTierSavings || 0));
  const hasPriceDrop = currentSubtotal < qualifyingSubtotal - 0.5;

  return (
    <section className="order-pricing-promo" aria-label="Unlock better order pricing">
      <div className="opp-topline">
        <div className="opp-icon"><FaBolt /></div>
        <div className="opp-heading">
          <span className="opp-eyebrow">BIGGER CART. BETTER PRICES.</span>
          <h3>{next ? <>Unlock <span>{next.label}</span> pricing</> : <>You’ve unlocked the <span>best tier</span></>}</h3>
        </div>
        <span className="opp-current"><i /> {active.label}</span>
      </div>

      <div className={`opp-order-value-panel ${hasPriceDrop ? 'has-drop' : ''}`}>
        <div className="opp-value-before">
          <span>Before tier pricing</span>
          <strong className={hasPriceDrop ? 'opp-struck-value' : ''}><AnimatedMoney value={qualifyingSubtotal} /></strong>
        </div>
        <div className="opp-value-transition" aria-hidden="true"><FaArrowDown /></div>
        <div className="opp-value-after">
          <span><FaCheck /> Your new order value</span>
          <strong><AnimatedMoney value={currentSubtotal} /></strong>
          {hasPriceDrop && <small>You’re saving <AnimatedMoney value={saved} /></small>}
        </div>
      </div>

      <div className="opp-progress-meta">
        <span>New order value <strong><AnimatedMoney value={currentSubtotal} /></strong></span>
        {next ? <span className="opp-next-label"><AnimatedMoney value={amountLeft} /> to next tier</span> : <span className="opp-max-label"><FaCheck /> Highest tier reached</span>}
      </div>
      <div className="opp-progress-track" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin="0" aria-valuemax="100" aria-label="Progress to next pricing tier">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="opp-bottom-row">
        <div className="opp-milestones" aria-label="Pricing levels">
          {slabs.map((slab) => {
            const unlocked = qualifyingSubtotal >= Number(slab.qualifyingValue || 0);
            const isActive = slab.pricingKey === orderPricing.activePricingKey;
            return (
              <div className={`opp-milestone ${unlocked ? 'is-unlocked' : ''} ${isActive ? 'is-active' : ''}`} key={`${slab.pricingKey}-${slab.qualifyingValue}`} title={`${slab.label} at ${money(slab.qualifyingValue)}`}>
                <span className="opp-milestone-dot">{unlocked ? <FaCheck /> : <FaLock />}</span>
                <span className="opp-milestone-copy"><strong>{slab.label}</strong><small>{Number(slab.qualifyingValue) === 0 ? 'Starting tier' : money(slab.qualifyingValue)}</small></span>
              </div>
            );
          })}
        </div>
        {saved > 0 && (
          <div className="opp-savings"><span>Current tier savings</span><strong><AnimatedMoney value={saved} /></strong></div>
        )}
      </div>
      {next && (
        <div className={`opp-next-benefit ${nextTierSavings > 0 ? 'has-savings' : ''}`}>
          <div className="opp-next-benefit-icon"><FaArrowRight /></div>
          <div className="opp-next-benefit-copy">
            <strong>{nextTierSavings > 0 ? `Save ${money(nextTierSavings)} more at ${next.label}` : `Unlock ${next.label} pricing next`}</strong>
            <span>{nextTierSavings > 0
              ? 'Estimated additional saving on the items currently in your cart if repriced at the next tier.'
              : 'Add products to reach the next slab and see the savings update here.'}</span>
          </div>
          {nextTierSavings > 0 && <div className="opp-next-benefit-amount"><AnimatedMoney value={nextTierSavings} /></div>}
        </div>
      )}
      {next && <p className="opp-nudge"><FaArrowRight /> Add <strong><AnimatedMoney value={amountLeft} /></strong> more based on your <strong>new order value</strong> to unlock <strong>{next.label}</strong> prices. Tier qualification remains protected against discount-price fluctuations.</p>}
    </section>
  );
};

export default OrderPricingPromo;
