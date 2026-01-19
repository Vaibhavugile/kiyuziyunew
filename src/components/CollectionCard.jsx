import React, { useEffect, useState } from "react";
import "./CollectionCard.css";

/**
 * CollectionCard
 * - Supports main + additional images
 * - Preloads images
 * - Cross-fade rotation every 5 seconds (NO BLANK FLASH)
 * - Bottom overlay shows “Explore” + Title
 * - Supports admin actions via children
 */
const CollectionCard = ({
  id,
  title,
  image,
  additionalImages = [],
  alt,
  onClick,
  children,
}) => {
  /* ---------------------------------
     IMAGE SETUP
  ---------------------------------- */
  const imagesToDisplay = [
    ...(image ? [image] : []),
    ...additionalImages,
  ];

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loadedImages, setLoadedImages] = useState({});

  /* ---------------------------------
     PRELOAD ALL IMAGES (CRITICAL FIX)
  ---------------------------------- */
  useEffect(() => {
    imagesToDisplay.forEach((src) => {
      if (!loadedImages[src]) {
        const img = new Image();
        img.src = src;
        img.onload = () => {
          setLoadedImages((prev) => ({
            ...prev,
            [src]: true,
          }));
        };
      }
    });
  }, [imagesToDisplay]);

  /* ---------------------------------
     AUTO ROTATION (5 SECONDS)
  ---------------------------------- */
  useEffect(() => {
    if (imagesToDisplay.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentImageIndex((prev) =>
        (prev + 1) % imagesToDisplay.length
      );
    }, 5000);

    return () => clearInterval(interval);
  }, [imagesToDisplay.length]);

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
      {/* 🔧 ADMIN ACTIONS */}
      {children && (
        <div
          className="collection-admin-actions"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}

      <div className="collection-card-media">
        {imagesToDisplay.length > 0 ? (
          imagesToDisplay.map((src, index) => (
            <img
              key={src}
              src={src}
              alt={alt || title}
              className={`collection-image ${
                index === currentImageIndex ? "active" : ""
              }`}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          ))
        ) : (
          <div className="collection-image--placeholder" />
        )}

        {/* Bottom overlay */}
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
