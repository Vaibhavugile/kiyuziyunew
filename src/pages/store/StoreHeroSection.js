import React, { useState, useEffect } from "react";
import "../../components/HeroSection.css";

const StoreHeroSection = ({ data }) => {

  /* 🔥 ALWAYS DEFINE HOOKS FIRST */
  const [index, setIndex] = useState(0);

  const images = data?.images?.length
    ? data.images
    : data?.image
      ? [{ src: data.image }]
      : [];

  useEffect(() => {
    if (images.length <= 1) return;

    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 4500);

    return () => clearInterval(interval);
  }, [images.length]);

  /* 🔥 SAFE RETURN AFTER HOOKS */
  if (!data) return null;

  return (
    <div className="split-hero-wrap">

      <section className="split-hero">

        {/* LEFT */}
        <div className="split-left">
          {images.map((img, i) => (
            <figure
              key={i}
              className={`slide ${i === index ? "active" : ""}`}
            >
              <img
                src={img.src || img}
                alt={img.alt || "hero"}
                loading={i === index ? "eager" : "lazy"}
              />
            </figure>
          ))}
        </div>

        {/* RIGHT */}
        <aside className="split-right">
          <div className="right-inner">

            <h2 className="right-title">
              {data.title || "Your Store Title"}
            </h2>

            <p className="right-sub">
              {data.subtitle || "Your subtitle goes here"}
            </p>

            <div className="feature-cards">
              {(data.features?.length
                ? data.features
                : [
                    "Guaranteed Quality",
                    "New Designs Every Week",
                    "Premium Packaging"
                  ]
              ).map((f, i) => (
                <div className="card" key={i}>
                  <div className="card-dot" />
                  <div>
                    <strong>{f}</strong>
                  </div>
                </div>
              ))}
            </div>

            <div className="right-actions">

              <a
                className="btn-primary"
                href={data.primaryLink || "#collections"}
              >
                {data.buttonText || "Shop Now"}
              </a>

              <a
                className="btn-ghost"
                href={data.secondaryLink || "#collections"}
              >
                {data.secondaryButton || "Explore"}
              </a>

            </div>

          </div>
        </aside>

      </section>

    </div>
  );
};

export default StoreHeroSection;