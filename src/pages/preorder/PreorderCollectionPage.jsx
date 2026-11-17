
import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  usePreorderStore,
  getCategoryName,
  getProductImage,
  getAvailableBoxes,
} from "./PreorderStoreContext";
import "./PreorderCollectionPage.css";

/* =========================================
   PRODUCT CARD
========================================= */

function PreorderProductCard({ product, index }) {
  const {
    cart,
    addToCart,
    updateCartQuantity,
    removeFromCart,
  } = usePreorderStore();

  const isVariant = product.quantityType === "variants";
  const variants = product.variants || [];

  const availableVariants = variants.filter(
    (variant) => Number(variant.boxQuantity) > 0
  );

  const [selectedVariant, setSelectedVariant] = useState(
    availableVariants[0]?.name || ""
  );

  const [message, setMessage] = useState("");

  const cartKey = `${product.id}__${isVariant ? selectedVariant : ""}`;

  const cartItem = cart.find((item) => item.key === cartKey);
  const cartQuantity = Number(cartItem?.quantity || 0);

  const availableStock = getAvailableBoxes(
    product,
    isVariant ? selectedVariant : ""
  );

  const remainingStock = Math.max(0, availableStock - cartQuantity);
  const image = getProductImage(product);

  const selectVariant = (name) => {
    setSelectedVariant(name);
    setMessage("");
  };

  const addProduct = () => {
    setMessage("");

    if (isVariant && !selectedVariant) {
      setMessage("Please select a variant.");
      return;
    }

    if (remainingStock <= 0) {
      setMessage("No additional boxes available.");
      return;
    }

    try {
      // First click always adds exactly ONE box.
      addToCart(
        product,
        isVariant ? selectedVariant : "",
        1
      );
    } catch (error) {
      setMessage(error.message || "Unable to add product.");
    }
  };

  const increaseQuantity = () => {
    setMessage("");

    if (cartQuantity >= availableStock) {
      setMessage("Maximum available stock reached.");
      return;
    }

    updateCartQuantity(cartKey, cartQuantity + 1);
  };

  const decreaseQuantity = () => {
    setMessage("");

    if (cartQuantity <= 1) {
      removeFromCart(cartKey);
      return;
    }

    updateCartQuantity(cartKey, cartQuantity - 1);
  };

  return (
    <article
      className="px-product-card"
      style={{ animationDelay: `${Math.min(index * 45, 450)}ms` }}
    >
      {/* PRODUCT IMAGE */}

      <Link
        to={`/preorder/product/${product.id}`}
        className="px-product-image-wrap"
      >
        {image ? (
          <img
            src={image}
            alt={product.productName || "Pre-order product"}
            loading="lazy"
          />
        ) : (
          <div className="px-product-image-placeholder">
            No image available
          </div>
        )}

        <span className="px-product-number">
          {String(index + 1).padStart(2, "0")}
        </span>

        <span className="px-product-view">
          VIEW PRODUCT ↗
        </span>
      </Link>

      {/* PRODUCT INFORMATION */}

      <div className="px-product-info">
        <div className="px-product-heading">
          <h2>{product.productName || "Pre-order product"}</h2>

          <span className="px-product-stock">
            {remainingStock} Box left
          </span>
        </div>

        <div className="px-product-subtitle">
          {isVariant
            ? `${variants.length} available variants`
            : "Box-based pre-order"}
        </div>

        {/* VARIANTS */}

        {isVariant && (
          <div className="px-product-variants">
            <div className="px-product-label">
              SELECT VARIANT
            </div>

            <div className="px-variant-list">
              {variants.map((variant) => {
                const inStock = Number(variant.boxQuantity) > 0;
                const isSelected = selectedVariant === variant.name;

                return (
                  <button
                    type="button"
                    key={variant.name}
                    disabled={!inStock}
                    onClick={() => selectVariant(variant.name)}
                    className={[
                      "px-variant-chip",
                      isSelected ? "selected" : "",
                      !inStock ? "disabled" : "",
                    ].join(" ")}
                    aria-pressed={isSelected}
                  >
                    {variant.name}
                    {isSelected && inStock && <span>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STOCK */}

        <div className="px-product-stock-line">
          <span className="px-stock-indicator" />

          {remainingStock > 0
            ? `${remainingStock} boxes available`
            : "No additional boxes available"}
        </div>

      </div>

      {/* ADD TO CART / QUANTITY */}

      <div className="px-product-actions">
        {cartQuantity === 0 ? (
          <button
            type="button"
            className="px-add-to-cart"
            onClick={addProduct}
            disabled={remainingStock <= 0}
          >
            <span>
              {remainingStock <= 0
                ? "Out of stock"
                : "Add to Cart"}
            </span>

            <span className="px-add-arrow">+</span>
          </button>
        ) : (
          <div className="px-card-cart-stepper px-card-cart-stepper-bottom">
            <button
              type="button"
              onClick={decreaseQuantity}
              aria-label="Remove one box"
            >
              −
            </button>

            <strong>{cartQuantity}</strong>

            <button
              type="button"
              onClick={increaseQuantity}
              disabled={remainingStock <= 0}
              aria-label="Add one box"
            >
              +
            </button>
          </div>
        )}

        {message && (
          <div className="px-add-error">
            {message}
          </div>
        )}
      </div>
    </article>
  );
}

/* =========================================
   MINI PRE-ORDER CART
========================================= */

function PreorderMiniCart() {
  const navigate = useNavigate();

  const {
    cart,
    products,
    totalBoxes,
    updateCartQuantity,
    removeFromCart,
  } = usePreorderStore();

  const [expanded, setExpanded] = useState(false);

  if (!totalBoxes) return null;

  const handleIncrease = (item) => {
    const product = products.find(
      (product) => product.id === item.productId
    );

    if (!product) return;

    const available = getAvailableBoxes(
      product,
      item.variantName || ""
    );

    if (item.quantity < available) {
      updateCartQuantity(item.key, item.quantity + 1);
    }
  };

  return (
    <div className="px-mini-cart-container">
      {/* MINI CART DETAILS */}

      {expanded && (
        <div className="px-mini-cart-panel">
          <div className="px-mini-cart-heading">
            <div>
              <span>YOUR SELECTION</span>
              <h3>Pre-order cart</h3>
            </div>

            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Close mini cart"
              className="px-mini-cart-close"
            >
              ×
            </button>
          </div>

          <div className="px-mini-cart-items">
            {cart.map((item) => {
              const product = products.find(
                (product) => product.id === item.productId
              );

              const available = product
                ? getAvailableBoxes(product, item.variantName || "")
                : 0;

              return (
                <div className="px-mini-cart-item" key={item.key}>
                  <div className="px-mini-cart-image">
                    {item.image ? (
                      <img src={item.image} alt={item.productName} />
                    ) : (
                      <span>✳</span>
                    )}
                  </div>

                  <div className="px-mini-cart-item-info">
                    <strong>{item.productName}</strong>

                    {item.variantName && (
                      <small>{item.variantName}</small>
                    )}

                    <div className="px-mini-cart-item-controls">
                      <div className="px-mini-cart-stepper">
                        <button
                          type="button"
                          onClick={() => {
                            if (item.quantity <= 1) {
                              removeFromCart(item.key);
                            } else {
                              updateCartQuantity(
                                item.key,
                                item.quantity - 1
                              );
                            }
                          }}
                        >
                          −
                        </button>

                        <strong>{item.quantity}</strong>

                        <button
                          type="button"
                          onClick={() => handleIncrease(item)}
                          disabled={item.quantity >= available}
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        className="px-mini-cart-remove"
                        onClick={() => removeFromCart(item.key)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-mini-cart-panel-total">
            <span>Total boxes</span>
            <strong>{totalBoxes}</strong>
          </div>

          <button
            type="button"
            className="px-mini-cart-checkout"
            onClick={() => navigate("/preorder/checkout")}
          >
            Proceed to checkout <span>↗</span>
          </button>
        </div>
      )}

      {/* FIXED BOTTOM SUMMARY */}

      <div className="px-mini-cart-bar">
        <button
          type="button"
          className="px-mini-cart-view"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          <span className="px-mini-cart-icon">
            <span>▣</span>
            <b>{cart.length}</b>
          </span>

          <span className="px-mini-cart-view-text">
            <strong>My pre-order</strong>
            <small>View selected products</small>
          </span>
        </button>

        <div className="px-mini-cart-total">
          <small>TOTAL BOXES</small>
          <strong>{totalBoxes}</strong>
        </div>

        <button
          type="button"
          className="px-mini-cart-main-checkout"
          onClick={() => navigate("/preorder/checkout")}
        >
          Checkout <span>↗</span>
        </button>
      </div>
    </div>
  );
}

/* =========================================
   COLLECTION PAGE
========================================= */

export default function PreorderCollectionPage() {
  const { categoryId } = useParams();

  const {
    categories,
    products,
    catalogLoading,
    catalogError,
    totalBoxes,
  } = usePreorderStore();

  const category = categories.find(
    (item) => item.id === categoryId
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [downloadingImages, setDownloadingImages] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ done: 0, total: 0 });
  const [downloadMessage, setDownloadMessage] = useState("");

  const rows = useMemo(() => {
    return products.filter((product) => {
      if (product.categoryId !== categoryId) return false;

      if (product.quantityType === "variants") {
        return (product.variants || []).some(
          (variant) => Number(variant.boxQuantity) > 0
        );
      }

      return getAvailableBoxes(product) > 0;
    });
  }, [products, categoryId]);

  const visibleRows = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase();
    if (!term) return rows;
    return rows.filter((product) =>
      String(product.productName || "").toLocaleLowerCase().includes(term)
    );
  }, [rows, searchTerm]);

  const downloadInStockImages = async () => {
    if (downloadingImages) return;

    const files = rows.flatMap((product) => {
      const productName = String(product.productName || "product");
      const safeName = productName
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-|-$/g, "") || "product";
      const primaryImage = getProductImage(product);
      const additional = Array.isArray(product.additionalImages)
        ? product.additionalImages
        : [];
      const urls = [primaryImage, ...additional].filter(Boolean);

      return urls.map((url, index) => ({
        url,
        filename: `${safeName}${index === 0 ? "" : `-additional-${String(index).padStart(2, "0")}`}.webp`,
      }));
    });

    if (!files.length) {
      setDownloadMessage("No in-stock product images are available to download.");
      return;
    }

    setDownloadingImages(true);
    setDownloadMessage("");
    setDownloadProgress({ done: 0, total: files.length });
    let failed = 0;

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        try {
          const response = await fetch(file.url);
          if (!response.ok) throw new Error(`Image request failed (${response.status})`);
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = objectUrl;
          anchor.download = file.filename;
          anchor.style.display = "none";
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
        } catch (error) {
          failed += 1;
          console.error("Could not download pre-order image:", file.url, error);
        }
        setDownloadProgress({ done: index + 1, total: files.length });
        // A small pause helps browsers process each individual download.
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }

      const successful = files.length - failed;
      setDownloadMessage(
        failed
          ? `Downloaded ${successful} of ${files.length} images. ${failed} could not be downloaded.`
          : `Started ${successful} individual image downloads.`
      );
    } finally {
      setDownloadingImages(false);
    }
  };

  return (
    <main className="px-collection-page">
      {/* NAVIGATION */}

      <header className="px-collection-nav">
        <Link to="/preorder" className="px-brand">
          <span className="px-brand-symbol">P</span>
          <span>
            PREORDER <i>STUDIO</i>
          </span>
        </Link>

        <button
          type="button"
          className="px-collection-cart"
          onClick={() => {
            if (totalBoxes > 0) {
              document
                .querySelector(".px-mini-cart-view")
                ?.click();
            }
          }}
        >
          My selection
          <b>{totalBoxes}</b>
          ↗
        </button>
      </header>

      <section className="px-collection-main">
        {/* BREADCRUMB */}

        <div className="px-collection-breadcrumb">
          <Link to="/preorder">Collections</Link>
          <span>/</span>
          <b>
            {category
              ? getCategoryName(category)
              : "Collection"}
          </b>
        </div>

        {/* COLLECTION INTRO */}

        <div className="px-collection-intro px-collection-intro-tools">
          <div className="px-collection-intro-copy">
            <span className="px-collection-overline">THE COLLECTION</span>
            <h1>
              {category
                ? getCategoryName(category)
                : "Discover products"}
              <i>.</i>
            </h1>
            <p>
              Explore available products and reserve your
              required box quantities.
            </p>
          </div>

          <div className="px-collection-tools">
            <div className="px-collection-total">
              <strong>{String(visibleRows.length).padStart(2, "0")}</strong>
              <span>PRODUCTS</span>
            </div>
            <button
              type="button"
              className="px-download-images-button"
              onClick={downloadInStockImages}
              disabled={downloadingImages || rows.length === 0}
            >
              <span aria-hidden="true">↓</span>
              {downloadingImages
                ? `Downloading ${downloadProgress.done}/${downloadProgress.total}`
                : "Download in-stock images"}
            </button>
          </div>
        </div>

        <div className="px-collection-search-row">
          <label className="px-collection-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by product name..."
              aria-label="Search products by name"
            />
            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm("")} aria-label="Clear search">×</button>
            )}
          </label>
          <span className="px-collection-search-count">{visibleRows.length} of {rows.length} in-stock products</span>
        </div>

        {downloadMessage && (
          <div className="px-download-images-message" role="status">{downloadMessage}</div>
        )}

        {catalogError && (
          <div className="px-collection-error">
            {catalogError}
          </div>
        )}

        {catalogLoading ? (
          <div className="px-collection-loading">
            <i />
            Loading products...
          </div>
        ) : visibleRows.length ? (
          <div className="px-products-grid">
            {visibleRows.map((product, index) => (
              <PreorderProductCard
                key={product.id}
                product={product}
                index={index}
              />
            ))}
          </div>
        ) : (
          <div className="px-collection-empty">
            <span>✳</span>
            <h2>{searchTerm.trim() ? "No matching products found" : "No products currently available"}</h2>
            <p>
              {searchTerm.trim()
                ? "Try another product name or clear your search."
                : "This collection currently has no products with available stock."}
            </p>
            <Link to="/preorder">
              Back to collections ↗
            </Link>
          </div>
        )}
      </section>

      <footer className="px-collection-footer">
        <span>PREORDER STUDIO</span>
        <Link to="/preorder">← All collections</Link>
      </footer>

      {/* MINI CART */}
      <PreorderMiniCart />
    </main>
  );
}
