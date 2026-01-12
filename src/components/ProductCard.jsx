// src/components/ProductCard.jsx - FINAL VERSION WITH ADMIN HIGHLIGHT TOGGLES

import React, { useState, useEffect } from 'react';
import './ProductCard.css';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';
import { getCartItemId } from './CartContext';
import ProgressiveImage from "./ProgressiveImage";

const ProductCard = ({ product, onIncrement, onDecrement, onEdit, onDelete, onToggleHighlight, isCart = false, cart, tieredPricing }) => {
  // CRITICAL FIX: Ensure 'id' is destructured here for stable use in useEffect dependencies
  // NEW: Destructure 'tags' for highlight status
  const { productName, productCode, images, image, variations, quantity, tieredPricing: productTieredPricing, id, tags = [] } = product; 
  
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const imagesToDisplay = images && images.length > 0 ? images : (image ? [{ url: image }] : []);
  const [selectedVariation, setSelectedVariation] = useState(null);
  const [showTiers, setShowTiers] = useState(false); 

  // Use the tieredPricing prop if it exists, otherwise fall back to the one on the product object
  const pricingData = tieredPricing || productTieredPricing;
  
  // Set the default variation on component mount
  useEffect(() => {
    if (variations && variations.length > 0) {
      setSelectedVariation(variations[0]);
    }
  }, [variations]);

  // Image carousel logic
  useEffect(() => {
    if (imagesToDisplay.length > 1) {
      const interval = setInterval(() => {
        setCurrentImageIndex(prevIndex => (prevIndex + 1) % imagesToDisplay.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [imagesToDisplay]);
  
  const handlePrevImage = (e) => {
    e.stopPropagation();
    setCurrentImageIndex(prevIndex => (prevIndex - 1 + imagesToDisplay.length) % imagesToDisplay.length);
  };
  const handleNextImage = (e) => {
    e.stopPropagation();
    setCurrentImageIndex(prevIndex => (prevIndex + 1) % imagesToDisplay.length);
  };

  // Calculate total stock for display (if variations are not selected)
  const totalQuantity = (variations && variations.length > 0) 
      ? variations.reduce((sum, v) => sum + Number(v.quantity), 0) 
      : Number(quantity || 0);   
      
  // Use the selected variation's stock if available, otherwise use total stock
  const quantityToDisplay = selectedVariation ? Number(selectedVariation.quantity) : totalQuantity;
  
  const isOutOfStock = totalQuantity === 0;
  
  const renderActions = () => {
    // Handle Admin Mode First and Return Early
    // MODIFIED: Added New Arrival and Trending buttons using onToggleHighlight prop
    if (onEdit && onDelete) {
        // Check current status for visual feedback
        const isNewArrival = tags.includes('new_arrival');
        const isTrending = tags.includes('trending');
        
        return (
            <div className="admin-actions">
                <button 
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                >
                    Edit
                </button> 
                <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                >
                    Delete
                </button>
                {/* NEW: Toggle New Arrival */}
                <button 
                    onClick={(e) => { e.stopPropagation(); onToggleHighlight(id, 'new_arrival'); }}
                    className={`highlight-btn ${isNewArrival ? 'active' : ''}`}
                    title={isNewArrival ? 'Remove from New Arrivals' : 'Set as New Arrival'}
                >
                    New Arrival {isNewArrival ? '✓' : ''}
                </button>
                {/* NEW: Toggle Trending */}
                <button 
                    onClick={(e) => { e.stopPropagation(); onToggleHighlight(id, 'trending'); }}
                    className={`highlight-btn ${isTrending ? 'active' : ''}`}
                    title={isTrending ? 'Remove from Trending' : 'Set as Trending'}
                >
                    Trending {isTrending ? '✓' : ''}
                </button>
            </div>
        );
    }

    // --- 1. Handle Cart Mode (Updates applied here) ---
    if (isCart) {
      return (
        <div className="cart-actions">
          <button 
              onClick={onDecrement} 
              className="quantity-btn"
          >
              -
          </button>
          <span className="cart-quantity">{quantity}</span> 
          <button 
              onClick={onIncrement} 
              className="quantity-btn"
              // Disable if the current quantity in cart (prop 'quantity') is >= the total available stock
              disabled={quantity >= quantityToDisplay}
          >
              +
          </button>
        </div>
      );
    }
    
    // Handle Storefront Mode
    if (!cart || !onIncrement || !onDecrement) {
        return <div className="product-actions"></div>; 
    }
    
    const productDataWithVariation = { ...product, variation: selectedVariation };
    const cartItemId = getCartItemId(productDataWithVariation);
    const currentQuantityInCart = cart[cartItemId]?.quantity || 0;

    // --- 2. NEW STOCK LIMIT LOGIC FOR STOREFRONT ---
    const availableStock = quantityToDisplay; 
    // Disable if current cart quantity is equal to or greater than available stock
    const isMaxStockReached = currentQuantityInCart >= availableStock;
    // ----------------------------------------------

    const incrementAction = () => {
        // Only call onIncrement if stock limit is NOT reached
        if (!isMaxStockReached) {
            onIncrement(productDataWithVariation);
        }
    };
    const decrementAction = () => onDecrement(cartItemId);
    
    return (
      <div className="product-actions">
        {currentQuantityInCart === 0 ? (
          // --- 3. Update Add to Cart Button ---
          <button
            onClick={incrementAction}
            className={`add-to-cart-btn ${isMaxStockReached ? 'disabled' : ''}`}
            disabled={isMaxStockReached}
          >
            {/* Display appropriate message */}
            {isMaxStockReached ? (availableStock === 0 ? 'Out of Stock' : 'Max Stock Reached') : 'Add to Cart'}
          </button>
        ) : (
          <div className="quantity-controls">
            <button onClick={decrementAction} className="quantity-btn">-</button>
            <span className="cart-quantity-display">{currentQuantityInCart}</span>
            {/* --- 4. Update Increment Button --- */}
            <button
              onClick={incrementAction}
              className={`quantity-btn ${isMaxStockReached ? 'disabled' : ''}`}
              disabled={isMaxStockReached}
            >
              +
            </button>
          </div>
        )}
      </div>
    );
  };
  
  // Sort the tiers by min_quantity
  const sortedTiers = pricingData ? [...pricingData].sort((a, b) => a.min_quantity - b.min_quantity) : null;
  
  
  let pricingOverlay = null;
  let tieredPricingButton = null;

  if (sortedTiers && sortedTiers.length > 1) {
    
    // Calculate max saving for the button text
    const basePrice = sortedTiers[0].price;
    const bestPrice = sortedTiers[sortedTiers.length - 1].price;
    let maxDiscountText = 'Show Bulk Pricing Details';
    if (basePrice > bestPrice) {
        // Calculate percentage saved, round to nearest whole number
        const percentageSaved = ((basePrice - bestPrice) / basePrice) * 100;
        const roundedPercentage = Math.round(percentageSaved);
        maxDiscountText = `Show Bulk Pricing (Save Up to ${roundedPercentage}%)`;
    }
    
    // 1. Define the button
    tieredPricingButton = (
        <button 
            className={`toggle-tiers-btn ${showTiers ? 'active' : ''}`}
            onClick={(e) => { 
                // Prevent accidental card navigation/selection
                e.stopPropagation(); 
                setShowTiers(!showTiers); 
            }}
        >
            <span>{showTiers ? 'Hide Bulk Pricing Details' : maxDiscountText}</span>
            <span className="dropdown-icon">{showTiers ? '▲' : '▼'}</span>
        </button>
    );

    // 2. Define the collapsible content (rendered only if showTiers is true)
    if (showTiers) {
        pricingOverlay = (
            <div className="tiered-pricing-container">
                <h4 className="pricing-overlay-title">Quantity Discounts</h4>
                {sortedTiers.map((tier, index) => (
                    <div key={index} className="pricing-tier-row">
                        <span className="tier-quantity">
                            {`Buy ${tier.min_quantity}${tier.max_quantity ? ` - ${tier.max_quantity}` : '+'}`}
                        </span>
                        <span className="tier-price-each">
                            @ ₹{tier.price} each
                        </span>
                    </div>
                ))}
            </div>
        );
    }
  }

  return (
    <div className={`product-card ${isOutOfStock ? 'out-of-stock' : ''}`}>
      {isOutOfStock && <div className="out-of-stock-overlay">Out of Stock</div>}
      
      <div className="product-image-container">
        {imagesToDisplay.length > 1 && (
          <button onClick={handlePrevImage} className="carousel-btn prev">&#10094;</button>
        )}
        <Zoom>
          
  <ProgressiveImage
    src={imagesToDisplay[currentImageIndex]?.url}
    alt={productName}
    className="product-image"
  />


        </Zoom>
        {imagesToDisplay.length > 1 && (
          <button onClick={handleNextImage} className="carousel-btn next">&#10095;</button>
        )}
      </div>
      
      <div className="product-info">
        <h4 className="product-title">{productName}</h4>
        <p className="product-code">{productCode}</p>

        {/* Base Price Display */}
        <p className="product-price">Price: ₹{sortedTiers && sortedTiers.length > 0 ? sortedTiers[0].price : 'N/A'}</p>
        
        {/* Tiered Pricing Button and Collapsible Content */}
        {tieredPricingButton}
        {pricingOverlay}

        <p className="product-quantity">In Stock: {quantityToDisplay}</p>
        
        {/* Variations Selector with inline cart quantity badge */}
        {variations && variations.length > 0 && (
          <div className="variations-selector">
            {variations.map((v, index) => {
              // --- Check if 'cart' is defined before accessing it ---
              let quantityInCart = 0;
              if (cart) {
                // Get the cart quantity for *this specific variation* button
                const tempProductWithVariation = { ...product, variation: v };
                const cartItemId = getCartItemId(tempProductWithVariation);
                quantityInCart = cart[cartItemId]?.quantity || 0;
              }
              // -----------------------------------------------------------------------

              return (
                <button
                  key={index}
                  className={`variation-btn 
                    ${selectedVariation?.color === v.color && selectedVariation?.size === v.size ? 'selected' : ''}
                    ${quantityInCart > 0 ? 'in-cart' : ''}
                  `}
                  onClick={() => setSelectedVariation(v)} // This sets the selection
                  title={`Color: ${v.color}, Size: ${v.size}`}
                >
                  {v.color} {v.size}
                  {/* Display the cart quantity as a small badge */}
                  {quantityInCart > 0 && <span className="variation-cart-qty">({quantityInCart})</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="product-actions">
        {renderActions()}
      </div>
    </div>
  );
};
export default ProductCard;