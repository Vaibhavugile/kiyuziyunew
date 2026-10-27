import React from 'react';
import { FaBolt, FaArrowRight, FaCheck } from 'react-icons/fa';
import './StickyOrderPricingBar.css';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** Compact fixed pricing reminder that stays visible while the customer scrolls products. */
const StickyOrderPricingBar = ({ orderPricing }) => {
  if (!orderPricing || !Array.isArray(orderPricing.slabs) || orderPricing.slabs.length < 2) return null;

  const next = orderPricing.nextSlab;
  const active = orderPricing.activeSlab || orderPricing.slabs[0];
  const orderValue = Number(orderPricing.currentSubtotal ?? orderPricing.qualificationSubtotal ?? 0);
  const nextThreshold = next ? Number(next.qualifyingValue || 0) : null;
  // Match the pricing banner: calculate the visible gap from the current/new order value.
  const amountLeft = nextThreshold === null ? 0 : Math.max(0, nextThreshold - orderValue);
  const progress = nextThreshold === null ? 100 : Math.max(0, Math.min(100, orderValue / Math.max(1, nextThreshold) * 100));
  const savings = Math.max(0, Number(orderPricing.savings || 0));
  const nextTierSavings = Math.max(0, Number(orderPricing.nextTierSavings || 0));

  return (
    <aside className="sticky-order-pricing" aria-label="Order pricing progress">
      <div className="sop-main">
        <div className="sop-bolt"><FaBolt /></div>
        <div className="sop-values">
          <span className="sop-caption">YOUR ORDER VALUE</span>
          <strong className="sop-total">{money(orderValue)}</strong>
        </div>
        <div className="sop-divider" />
        <div className="sop-next">
          {next ? (
            <>
              <span className="sop-caption">NEXT: {next.label}</span>
              <strong>{money(amountLeft)} <small>to go</small></strong>
            </>
          ) : (
            <>
              <span className="sop-caption">BEST PRICING UNLOCKED</span>
              <strong className="sop-max"><FaCheck /> {active.label}</strong>
            </>
          )}
        </div>
        {(savings > 0 || nextTierSavings > 0) && (
          <div className="sop-savings">
            <span>{nextTierSavings > 0 && next ? 'SAVE MORE' : 'YOU SAVE'}</span>
            <strong>{money(nextTierSavings > 0 && next ? nextTierSavings : savings)}</strong>
          </div>
        )}
        {next && <div className="sop-arrow" aria-hidden="true"><FaArrowRight /></div>}
      </div>
      <div className="sop-progress" aria-label={`${Math.round(progress)} percent toward next tier`}>
        <span style={{ width: `${progress}%` }} />
      </div>
    </aside>
  );
};

export default StickyOrderPricingBar;
