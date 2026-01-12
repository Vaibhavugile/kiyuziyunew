// TrendingSection.jsx
import React, { useState, useEffect, useMemo } from "react";
import { db, collectionGroup, getDocs, query, where } from "../firebase";
import { Link } from "react-router-dom";
import "./NewArrivalsSection.css";

const shimmerSoundUrl =
  "https://cdn.pixabay.com/download/audio/2023/03/03/audio_232e630a0c.mp3?filename=soft-glass-shimmer-143171.mp3";

const DESKTOP_BREAKPOINT = 1024;
const DESKTOP_INITIAL_COUNT = 10;
 

const TRENDING_TAG = 'trending'; // <<< CHANGED TAG



// <<< RENAMED COMPONENT
const TrendingSection = () => { 
  const [newArrivals, setNewArrivals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // show-more state
  const [isExpanded, setIsExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(Infinity);
  const [isDesktop, setIsDesktop] = useState(false);

  // Fetch new arrivals
  useEffect(() => {
    const fetchNewArrivals = async () => {
      setIsLoading(true);
      try {
        const productsRef = collectionGroup(db, "products");
        const q = query(productsRef, where("tags", "array-contains", TRENDING_TAG));
        const querySnapshot = await getDocs(q);
        const fetchedProducts = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          collectionId: doc.ref.path.split("/")[1],
        }));
        setNewArrivals(fetchedProducts);
      } catch (error) {
        console.error("Error fetching New Arrivals:", error);
      }
      setIsLoading(false);
    };
    fetchNewArrivals();
  }, []);

  // determine desktop or mobile (runs once and on resize)
  useEffect(() => {
    const checkDesktop = () => {
      const d = typeof window !== "undefined" ? window.innerWidth >= DESKTOP_BREAKPOINT : false;
      setIsDesktop(d);
      setVisibleCount(d ? DESKTOP_INITIAL_COUNT : Infinity);
    };
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  // Data formatting
  const productData = useMemo(() => {
    return newArrivals
      .map((p) => ({
        ...p,
        imageUrl: p.image || p.images?.[0]?.url,
        price: p.price || null,
        name: p.productName || p.name || "Untitled",
      }))
      .filter((p) => p.imageUrl);
  }, [newArrivals]);

  // Cinematic reveal glow (re-run when items or visibleCount change so newly revealed items get observed)
  useEffect(() => {
    const cards = document.querySelectorAll(".arrival-card");
    if (!cards || cards.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-glow");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.26 }
    );

    cards.forEach((card) => {
      // only observe elements that are visible (not hidden by show-more)
      const parent = card.closest(".arrivals-grid");
      if (!parent) return;
      observer.observe(card);
    });

    return () => observer.disconnect();
  }, [newArrivals, visibleCount, isExpanded]);

  // ✨ Parallax scroll effect for sparkles & background
  useEffect(() => {
    const sparkleLayer = document.querySelector(".sparkle-container");
    const section = document.querySelector(".new-arrivals-premium");

    if (!sparkleLayer || !section) return;

    const handleScroll = () => {
      const rect = section.getBoundingClientRect();
      const offset = rect.top * 0.25; // sparkle speed
      const bgOffset = rect.top * 0.1; // background shift

      // Use transform for GPU acceleration; guard in case elements removed
      if (sparkleLayer.style) sparkleLayer.style.transform = `translateY(${offset}px)`;
      if (section.style) section.style.backgroundPosition = `center ${bgOffset}px`;
    };

    // Call once to initialize positions
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  const handleShowMore = () => {
    if (isExpanded) {
      // collapse back to initial desktop count (or all on mobile)
      setVisibleCount(isDesktop ? DESKTOP_INITIAL_COUNT : Infinity);
      setIsExpanded(false);
      // scroll to top of section so users see the collapse (optional)
      const section = document.querySelector(".new-arrivals-premium");
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      // expand to show all
      setVisibleCount(productData.length);
      setIsExpanded(true);
    }
  };

  if (isLoading || productData.length === 0) return null;

  // calculate visible list based on visibleCount
  const visibleProducts = productData.slice(0, Number.isFinite(visibleCount) ? visibleCount : productData.length);
  const remainingCount = productData.length - visibleProducts.length;

  return (
    <section className="new-arrivals-premium" aria-labelledby="new-arrivals-heading">
      {/* Sparkle Layer */}
      <div className="sparkle-container" aria-hidden="true">
        {Array.from({ length: 25 }).map((_, i) => (
          <span key={i} className="sparkle" style={{ "--i": i }} />
        ))}
      </div>

      <div className="arrivals-header" id="new-arrivals-heading">
        <h2>Trending Now 🔥</h2>
        <p>The most sought-after designs of the season — bold, luminous, and exquisite.</p>
      </div>

      <div className="arrivals-grid" role="list">
        {visibleProducts.map((item, i) => (
          <Link
            to={`/collections/${item.collectionId}/all-products`}
            key={item.id}
            className="arrival-card"
            style={{ "--delay": `${i * 0.08}s` }}
            role="listitem"
            onMouseEnter={() => {
              const audio = new Audio(shimmerSoundUrl);
              audio.volume = 0.12;
              audio.play().catch(() => {});
            }}
          >
            <div className="arrival-image-wrapper" aria-hidden="false">
              <img
                src={item.imageUrl}
                alt={item.name}
                loading="lazy"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = `https://placehold.co/400x500/ddd/555?text=${encodeURIComponent(item.name)}`;
                }}
              />
              <div className="arrival-hover-glow" />
            </div>

            <div className="arrival-info">
              <h3 className="arrival-name">{item.name}</h3>
              {item.price && <p className="arrival-price">₹{parseFloat(item.price).toLocaleString("en-IN")}</p>}
            </div>
          </Link>
        ))}
      </div>

      {/* Show more / Show less for desktop */}
      {isDesktop && productData.length > DESKTOP_INITIAL_COUNT && (
        <div style={{ marginTop: 24, textAlign: "center", zIndex: 4 }}>
  <button
    className="show-more-btn"
    onClick={handleShowMore}
    aria-expanded={isExpanded}
    aria-controls="new-arrivals-list"
    style={{
      background: isExpanded
        ? "transparent"
        : `linear-gradient(90deg, var(--gold, #e73e35), var(--light-gold, #ff8c82))`,
      color: isExpanded ? "#1a1a1a" : "#fff",
      border: isExpanded ? "1px solid rgba(0,0,0,0.06)" : "none",
      padding: "10px 18px",
      borderRadius: 999,
      fontWeight: 800,
      cursor: "pointer",
      transition: "all 0.3s cubic-bezier(.2,.9,.2,1)",
      boxShadow: isExpanded
        ? "0 6px 20px rgba(0,0,0,0.06)"
        : "0 10px 30px rgba(231,62,53,0.15)",
    }}
  >
    {isExpanded ? "Show less" : `Show more (${remainingCount})`}
  </button>
</div>

      )}
    </section>
  );
};

export default TrendingSection;