
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  usePreorderStore,
  getAvailableBoxes,
  getProductImage,
} from "./PreorderStoreContext";
import "./PreorderProductPage.css";

export default function PreorderProductPage() {
  const { productId } = useParams();
  const navigate = useNavigate();

  const {
    products,
    catalogLoading,
    addToCart,
    totalBoxes,
    cart,
  } = usePreorderStore();

  const product = products.find((item) => item.id === productId);

  const [variantName, setVariantName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState("");
  const [message, setMessage] = useState("");

  const isVariantProduct = product?.quantityType === "variants";
  const variants = product?.variants || [];

  const images = useMemo(() => {
    if (!product) return [];

    return [
      getProductImage(product),
      ...(product.additionalImages || []),
    ].filter((image) => typeof image === "string" && image.trim());
  }, [product]);

  const selectedVariantStock = product
    ? getAvailableBoxes(product, variantName)
    : 0;

  const cartKey = product
    ? `${product.id}__${isVariantProduct ? variantName : ""}`
    : "";

  const alreadyInCart = cart?.find((item) => item.key === cartKey)?.quantity || 0;

  const remainingStock = Math.max(
    0,
    Number(selectedVariantStock || 0) - Number(alreadyInCart || 0)
  );

  useEffect(() => {
    if (!product) return;

    const firstAvailable = (product.variants || []).find(
      (variant) => Number(variant.boxQuantity) > 0
    );

    setVariantName(
      product.quantityType === "variants"
        ? firstAvailable?.name || ""
        : ""
    );

    setActiveImage(getProductImage(product) || "");
    setQuantity(1);
    setMessage("");
  }, [productId, product]);

  useEffect(() => {
    if (!product) return;

    setQuantity((current) => {
      if (remainingStock <= 0) return 1;
      return Math.min(Math.max(1, current), remainingStock);
    });
  }, [remainingStock, productId]);

  const handleVariantChange = (name) => {
    setVariantName(name);
    setQuantity(1);
    setMessage("");
  };

  const handleAdd = () => {
    setMessage("");

    if (isVariantProduct && !variantName) {
      setMessage("Please choose an available variant.");
      return;
    }

    if (remainingStock <= 0) {
      setMessage("No additional boxes are available for this selection.");
      return;
    }

    if (quantity > remainingStock) {
      setMessage(`Only ${remainingStock} additional boxes are available.`);
      return;
    }

    try {
      addToCart(
        product,
        isVariantProduct ? variantName : "",
        quantity
      );

      navigate("/preorder/checkout");
    } catch (error) {
      setMessage(error.message || "Unable to add this product.");
    }
  };

  if (catalogLoading) {
    return (
      <main className="px-product-page">
        <div className="px-product-loading">
          <i />
          <span>Preparing your selection...</span>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="px-product-page">
        <div className="px-product-not-found">
          <span className="px-not-found-icon">✳</span>
          <span className="px-product-overline">PRODUCT NOT FOUND</span>
          <h1>Something is missing.</h1>
          <p>
            This pre-order product may have been removed or is no longer
            available.
          </p>
          <Link to="/preorder" className="px-not-found-link">
            Return to collections <span>↗</span>
          </Link>
        </div>
      </main>
    );
  }

  const categoryName = product.categoryName || "Collection";

  return (
    <main className="px-product-page">
      {/* Navigation */}
      <header className="px-product-nav">
        <Link to="/preorder" className="px-brand">
          <span className="px-brand-symbol">P</span>
          <span>
            PREORDER <i>STUDIO</i>
          </span>
        </Link>

        <Link to="/preorder/checkout" className="px-product-cart">
          <span>My selection</span>
          <b>{totalBoxes}</b>
          <span className="px-cart-arrow">↗</span>
        </Link>
      </header>

      <section className="px-product-main">
        {/* Breadcrumb */}
        <div className="px-product-breadcrumb">
          <Link to="/preorder">Collections</Link>
          <span>/</span>
          <Link to={`/preorder/collection/${product.categoryId}`}>
            {categoryName}
          </Link>
          <span>/</span>
          <b>Product details</b>
        </div>

        <div className="px-product-layout">
          {/* Product gallery */}
          <div className="px-product-gallery">
            <div className="px-product-hero-image">
              {activeImage ? (
                <img
                  src={activeImage}
                  alt={product.productName || "Pre-order product"}
                />
              ) : (
                <div className="px-product-no-image">✳</div>
              )}

              <span className="px-image-edition">
                <i />
                PRE-ORDER EDITION
              </span>

              <span className="px-image-count">
                {images.length > 0
                  ? `${Math.max(1, images.indexOf(activeImage) + 1)
                      .toString()
                      .padStart(2, "0")} / ${images.length
                      .toString()
                      .padStart(2, "0")}`
                  : "01 / 01"}
              </span>
            </div>

            {images.length > 1 && (
              <div className="px-product-thumbnails">
                {images.map((src, index) => (
                  <button
                    type="button"
                    className={activeImage === src ? "active" : ""}
                    onClick={() => setActiveImage(src)}
                    key={`${src}-${index}`}
                    aria-label={`View product image ${index + 1}`}
                  >
                    <img
                      src={src}
                      alt={`${product.productName} view ${index + 1}`}
                    />
                  </button>
                ))}
              </div>
            )}

            <div className="px-gallery-caption">
              <span>01</span>
              <span>PRODUCT GALLERY</span>
              <span>✳</span>
            </div>
          </div>

          {/* Product information */}
          <div className="px-product-details">
            <div className="px-product-overline">
              <span className="px-overline-dot" />
              AVAILABLE FOR PRE-ORDER
            </div>

            <h1>{product.productName || "Pre-order product"}</h1>

            <div className="px-product-category">
              <span>COLLECTION</span>
              <b>{categoryName}</b>
            </div>

            <p className="px-product-description">
              {product.description ||
                "Reserve your required quantity from this upcoming collection. Select your preferred option and quantity to continue."}
            </p>

            {/* Stock status */}
            <div className="px-product-stock">
              <div className="px-stock-left">
                <span className="px-stock-indicator" />
                <span>
                  {remainingStock > 0 ? "Available to reserve" : "Currently unavailable"}
                </span>
              </div>

              <strong>
                {remainingStock} <small>BOXES</small>
              </strong>
            </div>

            {/* Variant selection */}
            {isVariantProduct && (
              <div className="px-product-options">
                <div className="px-option-heading">
                  <label>Choose your variant</label>
                  <span>{variants.length} OPTIONS</span>
                </div>

                <div className="px-variant-grid">
                  {variants.map((variant) => {
                    const stock = Number(variant.boxQuantity) || 0;
                    const selected = variantName === variant.name;

                    return (
                      <button
                        type="button"
                        key={variant.name}
                        disabled={stock <= 0}
                        className={selected ? "selected" : ""}
                        onClick={() => handleVariantChange(variant.name)}
                      >
                        <span className="px-variant-radio">
                          {selected && <i />}
                        </span>

                        <span className="px-variant-info">
                          <strong>{variant.name}</strong>
                          <small>
                            {stock > 0
                              ? `${stock} boxes available`
                              : "Out of stock"}
                          </small>
                        </span>

                        {selected && (
                          <span className="px-variant-check">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="px-product-options px-quantity-section">
              <div className="px-option-heading">
                <label>Number of boxes</label>
                <span>QUANTITY</span>
              </div>

              <div className="px-quantity-row">
                <div className="px-product-quantity">
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity((value) => Math.max(1, value - 1))
                    }
                    disabled={quantity <= 1 || remainingStock <= 0}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>

                  <strong>{quantity}</strong>

                  <button
                    type="button"
                    onClick={() =>
                      setQuantity((value) =>
                        Math.min(remainingStock, value + 1)
                      )
                    }
                    disabled={quantity >= remainingStock}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <span className="px-quantity-unit">BOXES</span>
              </div>

              <small className="px-quantity-help">
                {remainingStock > 0
                  ? `Maximum ${remainingStock} additional boxes available`
                  : "No additional boxes available"}
              </small>
            </div>

            {message && (
              <div className="px-product-message">
                <span>!</span>
                {message}
              </div>
            )}

            {/* CTA */}
            <button
              type="button"
              className="px-product-add"
              onClick={handleAdd}
              disabled={
                remainingStock <= 0 ||
                (isVariantProduct && !variantName)
              }
            >
              <span>
                {remainingStock > 0
                  ? "Continue to checkout"
                  : "Currently unavailable"}
              </span>
              <span className="px-add-arrow">↗</span>
            </button>

            <Link
              className="px-product-back"
              to={`/preorder/collection/${product.categoryId}`}
            >
              <span>←</span> Back to collection
            </Link>

            {/* Reassurance */}
            <div className="px-product-reassurance">
              <span className="px-reassurance-icon">✳</span>

              <div>
                <strong>No payment at this stage</strong>
                <small>
                  Your requested quantities are checked again before the
                  order is confirmed.
                </small>
              </div>
            </div>

            <div className="px-product-details-bottom">
              <span>PRE-ORDER COLLECTION</span>
              <span>EST. 2026</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="px-product-footer">
        <span>PREORDER STUDIO</span>
        <Link to="/preorder">Discover more collections ↗</Link>
      </footer>
    </main>
  );
}
