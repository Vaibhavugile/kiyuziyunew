import { useEffect, useMemo, useState } from "react";

/**
 * Progressive Firebase product image.
 * Keeps the thumbnail visible until a full-size candidate loads.
 * Fallback order: main image -> medium image -> thumbnail.
 * Firebase download URLs are used unchanged.
 */
export default function SProgressiveImage({
  src,
  thumbnailSrc,
  mediumSrc,
  alt = "",
  className = "",
  priority = false,
}) {
  const imageSources = useMemo(() => {
    const unique = [];
    [src, mediumSrc, thumbnailSrc].forEach((candidate) => {
      if (typeof candidate === "string" && candidate.trim()) {
        const url = candidate.trim();
        if (!unique.includes(url)) unique.push(url);
      }
    });
    return unique;
  }, [src, mediumSrc, thumbnailSrc]);

  const primarySource = imageSources[0] || "";
  const previewSource =
    (typeof thumbnailSrc === "string" && thumbnailSrc.trim()) ||
    (typeof mediumSrc === "string" && mediumSrc.trim()) ||
    primarySource;

  const [activeSource, setActiveSource] = useState(primarySource);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setActiveSource(primarySource);
    setLoaded(false);
    setFailed(false);
  }, [primarySource]);

  const handleError = () => {
    const currentIndex = imageSources.indexOf(activeSource);
    const nextSource = imageSources[currentIndex + 1];

    if (nextSource) {
      setLoaded(false);
      setActiveSource(nextSource);
      return;
    }

    // Do not hide the thumbnail if all larger image URLs fail.
    setLoaded(false);
    setFailed(true);
  };

  const wrapperStyle = {
    position: "relative",
    display: "block",
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    background: "#f5eee3",
  };

  const imageStyle = {
    position: "absolute",
    inset: 0,
    display: "block",
    width: "100%",
    height: "100%",
    maxWidth: "100%",
    objectFit: "cover",
    objectPosition: "center",
  };

  return (
    <div className={`progressive-img ${className}`.trim()} style={wrapperStyle}>
      {previewSource && (
        <img
          src={previewSource}
          alt=""
          aria-hidden="true"
          draggable="false"
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          className="img-placeholder"
          style={{
            ...imageStyle,
            zIndex: 0,
            opacity: loaded ? 0 : 1,
            visibility: "visible",
            transition: "opacity 180ms ease",
            pointerEvents: "none",
          }}
        />
      )}

      {activeSource && !failed && (
        <img
          key={activeSource}
          src={activeSource}
          alt={alt}
          draggable="false"
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          className={`img-full${loaded ? " visible" : ""}`}
          style={{
            ...imageStyle,
            zIndex: 1,
            opacity: loaded ? 1 : 0,
            visibility: "visible",
            transition: "opacity 220ms ease",
          }}
          onLoad={() => {
            setLoaded(true);
            setFailed(false);
          }}
          onError={handleError}
        />
      )}

      {!previewSource && (!activeSource || failed) && (
        <div
          role="img"
          aria-label={alt || "Product image unavailable"}
          style={{
            ...imageStyle,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#8b7d69",
            fontSize: 12,
            background: "#f5eee3",
          }}
        >
          Image unavailable
        </div>
      )}
    </div>
  );
}
