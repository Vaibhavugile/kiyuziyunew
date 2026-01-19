import React from "react";
import "./CollectionCard.css";

/**
 * CollectionCard
 * - Image always visible
 * - Bottom overlay shows “Explore” + Product Name
 * - Supports admin actions via children
 */
const CollectionCard = ({
  id,
  title,
  image,
  alt,
  onClick,
  children, // ✅ ADMIN ACTIONS
}) => {
  return (
    <article
      className="collection-card"
      role="group"
      aria-labelledby={id ? `collection-title-${id}` : undefined}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick) {
          e.preventDefault();
          onClick(e);
        }
      }}
    >
      {/* 🔧 ADMIN ACTIONS (Edit / Delete) */}
      {children && (
        <div
          className="collection-admin-actions"
          onClick={(e) => e.stopPropagation()} // prevent navigation
        >
          {children}
        </div>
      )}

      <div className="collection-card-media">
        {image ? (
          <img
            src={image}
            alt={alt || title}
            className="collection-image"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="collection-image--placeholder" />
        )}

        {/* Bottom overlay with Explore + Title */}
        <div className="bottom-overlay">
          <div className="overlay-content">
            <button
              type="button"
              className="btn-pill"
              aria-label={`Explore ${title}`}
            >
              <span className="pill-text">Explore</span>
              <span className="arrow" aria-hidden="true">›</span>
            </button>

            <span className="product-pill">
              <span className="pill-text">{title}</span>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
};

export default CollectionCard;
