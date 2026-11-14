
import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  usePreorderStore,
  getCategoryName,
  getProductImage,
} from "./PreorderStoreContext";
import "./PreorderHomePage.css";

export default function PreorderHomePage() {
  const {
    categories,
    products,
    catalogLoading,
    catalogError,
    totalBoxes,
  } = usePreorderStore();

  const collections = useMemo(() => {
    return categories.map((category) => {
      const items = products.filter(
        (product) => product.categoryId === category.id
      );

      const availableItems = items.filter((product) => {
        if (product.quantityType === "variants") {
          return (product.variants || []).some(
            (variant) => Number(variant.boxQuantity) > 0
          );
        }

        return Number(product.boxQuantity) > 0;
      });

      const firstImage = items.find((product) =>
        getProductImage(product)
      );

      const cover =
        category.bannerImage ||
        category.coverImage ||
        category.imageUrl ||
        category.image ||
        category.thumbnail ||
        (firstImage ? getProductImage(firstImage) : "");

      return {
        ...category,
        productCount: items.length,
        availableCount: availableItems.length,
        cover,
      };
    });
  }, [categories, products]);

  return (
    <main className="px-collections-page">
      {/* NAVIGATION */}
      <header className="px-home-nav">
        <Link to="/preorder" className="px-home-brand">
          <span className="px-home-brand-symbol">P</span>
          <span>
            PREORDER <i>STUDIO</i>
          </span>
        </Link>

        <Link to="/preorder/checkout" className="px-home-cart">
          <span>My selection</span>
          <b>{totalBoxes || 0}</b>
          <span className="px-home-cart-arrow">↗</span>
        </Link>
      </header>

      {/* HERO */}
      <section className="px-collections-header">
        <div className="px-home-decorative-star">✳</div>

        <span className="px-collections-eyebrow">
          <i />
          DISCOVER OUR SELECTION
          <i />
        </span>

        <h1>
          Explore <em>Collections</em>
        </h1>

        <p>
          Browse our curated collections and discover what's available
          for pre-order. Find your favourites and reserve your required
          quantities.
        </p>

        <div className="px-home-header-bottom">
          <span />
          <small>{String(collections.length).padStart(2, "0")} COLLECTIONS</small>
          <span />
        </div>
      </section>

      {/* ERROR */}
      {catalogError && (
        <div className="px-collections-error">
          <span>!</span>
          {catalogError}
        </div>
      )}

      {/* COLLECTIONS */}
      {catalogLoading ? (
        <div className="px-collections-loading">
          <span className="px-collections-spinner" />
          <p>Preparing your collections...</p>
        </div>
      ) : collections.length > 0 ? (
        <section className="px-collections-section">
          <div className="px-collections-section-heading">
            <div>
              <span>THE COLLECTIONS</span>
              <h2>Find your <em>selection</em></h2>
            </div>

            <span className="px-collection-total">
              {collections.length} COLLECTIONS
            </span>
          </div>

          <div className="px-collections-grid">
            {collections.map((category, index) => (
              <Link
                to={`/preorder/collection/${category.id}`}
                className="px-collection-round-card"
                key={category.id}
              >
                <div className="px-collection-circle">
                  {category.cover ? (
                    <img
                      src={category.cover}
                      alt={getCategoryName(category)}
                      loading="lazy"
                    />
                  ) : (
                    <div className="px-collection-placeholder">
                      ✳
                    </div>
                  )}

                  <div className="px-collection-image-overlay" />

                  <span className="px-collection-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <span className="px-collection-arrow">↗</span>
                </div>

                <div className="px-collection-card-info">
                  <h2>{getCategoryName(category)}</h2>

                  <span className="px-collection-card-arrow">↗</span>
                </div>

                <div className="px-collection-meta">
                  <span>
                    {category.availableCount} PRODUCTS AVAILABLE
                  </span>
                  <span className="px-collection-meta-dot" />
                  <span>PRE-ORDER</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <div className="px-collections-empty">
          <span>✳</span>
          <h2>Collections coming soon</h2>
          <p>New collections will appear here. Please check back soon.</p>
          <Link to="/preorder" className="px-empty-link">
            Explore collections <span>↗</span>
          </Link>
        </div>
      )}

      {/* FOOTER */}
      <footer className="px-home-footer">
        <div className="px-home-footer-brand">
          <span className="px-home-footer-symbol">P</span>
          <span>PREORDER STUDIO</span>
        </div>

        <span className="px-home-footer-message">
          A thoughtful way to reserve what you love.
        </span>

        <span className="px-home-footer-copy">
          © 2026 PREORDER STUDIO
        </span>
      </footer>
    </main>
  );
}
