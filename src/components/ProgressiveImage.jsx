import { useEffect, useState } from "react";

/**
 * Progressive Firebase product image:
 * 1. Shows the real, pre-generated thumbnail immediately.
 * 2. Loads the optimized main image in the background.
 * 3. Fades the main image in when it has loaded.
 * 4. Uses the medium image only if the main image fails.
 *
 * Pass actual Firebase download URLs from Firestore.
 * Do not strip Firebase tokens or add ?w= / ?quality= parameters.
 */
export default function ProgressiveImage({
  src,
  thumbnailSrc,
  mediumSrc,
  alt = "",
  className = "",
  priority = false,
}) {
  const mainSource = src || mediumSrc || thumbnailSrc || "";
  const previewSource = thumbnailSrc || mediumSrc || mainSource;

  const [mainLoaded, setMainLoaded] = useState(false);
  const [activeMainSource, setActiveMainSource] = useState(mainSource);
  const [mainFailed, setMainFailed] = useState(false);

  // Reset image state when the product/image URLs change.
  useEffect(() => {
    setMainLoaded(false);
    setMainFailed(false);
    setActiveMainSource(mainSource);
  }, [mainSource, mediumSrc]);

  const handleMainError = () => {
    // Try the medium image once as a fallback, without creating a retry loop.
    if (mediumSrc && mediumSrc !== activeMainSource) {
      setMainLoaded(false);
      setActiveMainSource(mediumSrc);
      return;
    }

    setMainFailed(true);
  };

  const hasSeparatePreview =
    Boolean(previewSource) && previewSource !== activeMainSource;

  return (
    <div
      className={`progressive-img ${className}`}
      style={{
        position: "relative",
        overflow: "hidden",
        background: "#f2f2f2",
      }}
    >
      {/* Real thumbnail: visible while the optimized image loads. */}
      {previewSource && (
        <img
          src={previewSource}
          alt=""
          aria-hidden="true"
          className="img-placeholder"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          draggable="false"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: mainLoaded ? 0 : 1,
            transition: "opacity 220ms ease",
          }}
        />
      )}

      {/* Optimized main image loads in the background and fades in. */}
      {activeMainSource && !mainFailed && (
        <img
          key={activeMainSource}
          src={activeMainSource}
          alt={alt}
          className={`img-full ${mainLoaded ? "visible" : ""}`}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          draggable="false"
          onLoad={() => setMainLoaded(true)}
          onError={handleMainError}
          style={{
            position: hasSeparatePreview ? "absolute" : "relative",
            inset: hasSeparatePreview ? 0 : "auto",
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: mainLoaded ? 1 : 0,
            transition: "opacity 220ms ease",
          }}
        />
      )}

      {/* If no image can be loaded, keep a neutral placeholder. */}
      {!previewSource && (!activeMainSource || mainFailed) && (
        <div
          role="img"
          aria-label={alt || "Image unavailable"}
          style={{
            width: "100%",
            height: "100%",
            minHeight: 100,
            display: "grid",
            placeItems: "center",
            color: "#999",
            fontSize: 12,
          }}
        >
          Image unavailable
        </div>
      )}
    </div>
  );
}
