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
    className="luxCollectionCard"
    role="group"
    aria-labelledby={id ? `lux-collection-title-${id}` : undefined}
    tabIndex={0}
    onClick={onClick}
    onKeyDown={(e) => {
      if ((e.key === "Enter" || e.key === " ") && onClick) {
        e.preventDefault();
        onClick(e);
      }
    }}
  >

    {children && (
      <div
        className="luxCollectionAdminActions"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    )}

    <div className="luxCollectionMedia">

      {imagesToDisplay.length > 0 ? (
        imagesToDisplay.map((src, index) => (
          <img
            key={src}
            src={src}
            alt={alt || title}
            className={`luxCollectionImage ${
              index === currentImageIndex
                ? "luxCollectionImageActive"
                : ""
            }`}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ))
      ) : (
        <div className="luxCollectionPlaceholder" />
      )}

    </div>

    <div className="luxCollectionContent">

      <span className="luxCollectionLabel">
        COLLECTION
      </span>

      <h3
        className="luxCollectionTitle"
        id={
          id
            ? `lux-collection-title-${id}`
            : undefined
        }
      >
        {title}
      </h3>

      <div className="luxCollectionFooter">

        <span className="luxCollectionLink">
          Explore Collection
        </span>

        <span className="luxCollectionArrow">
          →
        </span>

      </div>

    </div>

  </article>

);

};

export default CollectionCard;
