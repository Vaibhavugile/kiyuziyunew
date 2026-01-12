import React, { useState, useEffect } from "react";
import "./HeroSection.css";

/* Local image imports */
import hero1 from "../assets/hero/hero1.jpg";
import hero2 from "../assets/hero/hero2.jpg";
import hero3 from "../assets/hero/hero3.jpg";
import hero4 from "../assets/hero/hero7.jpg";
import hero5 from "../assets/hero/hero5.jpg";

export default function HeroSection() {
  const imgs = [
    { src: hero1, alt: "Timeless Elegance" },
    { src: hero2, alt: "Luxury in Motion" },
    { src: hero3, alt: "Bespoke Beauty" },
    { src: hero4, alt: "Gilded Serenity" },
    { src: hero5, alt: "Eternal Shine" },
  ];

  const [index, setIndex] = useState(0);

  // Auto-change slide
  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % imgs.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [imgs.length]);

  return (
    <div className="split-hero-wrap">
      <section className="split-hero" aria-label="Luxury Jewelry Hero">
        {/* LEFT SIDE (image slideshow) */}
        <div className="split-left">
          {imgs.map((it, i) => (
            <figure
              key={i}
              className={`slide ${i === index ? "active" : ""}`}
              aria-hidden={i === index ? "false" : "true"}
            >
              <img src={it.src} alt={it.alt} loading={i === index ? "eager" : "lazy"} />
            </figure>
          ))}
        </div>

        {/* RIGHT SIDE (content) */}
        <aside className="split-right">
          <div className="right-inner">
            <h2 className="right-title">India's Leading Anti-Tarnish Imitation Jewellery Brand</h2>
            <p className="right-sub">
              Limited collections • Anti-Tarnish • Responsibly sourced
            </p>

            <div className="feature-cards">
              <div className="card">
                <div className="card-dot" />
                <div>
                  <strong>Guaranteed Plating</strong>
                </div>
              </div>
              <div className="card">
                <div className="card-dot" />
                <div>
                  <strong>New Designs Every Week</strong>
                </div>
              </div>
              <div className="card">
                <div className="card-dot" />
                <div>
                  <strong>Superior Quality Packaging</strong>
                </div>
              </div>
            </div>

            <div className="right-actions">
              <a className="btn-primary" href="#collections">
                Shop New
              </a>
              <a className="btn-ghost" href="#collections">
                Our Studio
              </a>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
