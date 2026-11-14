import { useEffect, useState } from "react";

export default function ProgressiveImage({
  src,
  thumbnailSrc,
  mediumSrc,
  alt = "",
  className = "",
  priority = false,
}) {
  const mainSource = src || mediumSrc || thumbnailSrc || "";
  const previewSource = thumbnailSrc || mediumSrc || "";

  const [activeSource, setActiveSource] = useState(mainSource);
  const [mainLoaded, setMainLoaded] = useState(false);
  const [mainFailed, setMainFailed] = useState(false);

  useEffect(() => {
    setActiveSource(mainSource);
    setMainLoaded(false);
    setMainFailed(false);
  }, [mainSource, mediumSrc]);

  const handleError = () => {
    if (mediumSrc && activeSource !== mediumSrc) {
      setActiveSource(mediumSrc);
      setMainLoaded(false);
      setMainFailed(false);
      return;
    }
    setMainFailed(true);
  };

  const frameStyle = {
    position: "absolute",
    inset: 0,
    display: "block",
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
    maxWidth: "none",
    maxHeight: "none",
    margin: 0,
    padding: 0,
    border: 0,
    objectFit: "cover",
    objectPosition: "center",
    transform: "none",
    pointerEvents: "none",
    userSelect: "none",
    transition: "opacity 180ms ease",
  };

  return (
    <div
      className={`progressive-img ${className}`}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      style={{
        position: "absolute",
        inset: 0,
        display: "block",
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        isolation: "isolate",
        background: "#f5eee3",
      }}
    >
      {previewSource && previewSource !== activeSource && (
        <img
          src={previewSource}
          alt=""
          aria-hidden="true"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          draggable="false"
          style={{ ...frameStyle, zIndex: 1, opacity: mainLoaded ? 0 : 1 }}
        />
      )}

      {activeSource && !mainFailed && (
        <img
          key={activeSource}
          src={activeSource}
          alt=""
          aria-hidden="true"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          draggable="false"
          onLoad={() => setMainLoaded(true)}
          onError={handleError}
          style={{ ...frameStyle, zIndex: 2, opacity: mainLoaded ? 1 : 0 }}
        />
      )}

      {(!activeSource || mainFailed) && !previewSource && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "#a99a82",
            background: "linear-gradient(135deg, #faf4e9, #efe3cf)",
            fontSize: 12,
          }}
        >
          Image unavailable
        </div>
      )}
    </div>
  );
}
