import { useState } from "react";

const getLowQualityUrl = (url) => {
  if (!url) return url;

  // Firebase image resize (small + low quality)
  // Works with Firebase Storage served images
  return `${url}&w=50&quality=10`;
};

export default function ProgressiveImage({ src, alt, className = "" }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`progressive-img ${className}`}>
      {/* Low quality blurred placeholder */}
      <img
        src={getLowQualityUrl(src)}
        alt=""
        aria-hidden="true"
        className="img-placeholder"
      />

      {/* Full quality image */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={`img-full ${loaded ? "visible" : ""}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
