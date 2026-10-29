import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth, collection, getDocs } from "../firebase";
import CollectionCard from "../components/CollectionCard";
import BrowseCollectionSection from "../components/BrowseCollectionSection";
import HeroSection from "../components/HeroSection";
import BestSellersSection from "../components/BestSellersSection";
import NewArrivalsSection from "../components/NewArrivalsSection";
import TrendingSection from "../components/TrendingSection";
import "./HomePage.css";
import BulkEnquirySection from "../components/BulkEnquirySection";
import InstagramReelsSection from "../components/InstagramReelsSection";
import Topbar from "../components/Topbar";
import { trackMetaEvent } from "../utils/pixels";
import EnableNotificationsButton from "../Enablenotification";
import { trackCustomerActivity } from "../utils/customerActivity";

const ACTIVITY_THROTTLE_MS = 2 * 60 * 1000;

const HomePage = () => {
  const [collections, setCollections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const lastActivityTrackedAt = useRef(0);
  const activityTrackingReady = useRef(false);

  useEffect(() => {
    const fetchCollections = async () => {
      setIsLoading(true);
      try {
        const qSnap = await getDocs(collection(db, "collections"));
        const fetched = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        fetched.sort((a, b) => (a.showNumber || 0) - (b.showNumber || 0));
        setCollections(fetched);
      } catch (err) {
        console.error("Error fetching collections:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCollections();
  }, []);

  /*
   * Track a homepage visit whenever a signed-in Firebase session is available.
   * This intentionally does not depend on lastLogin: a customer who logged in
   * days ago is still recorded as active when they return to the homepage today.
   */
  useEffect(() => {
    let unsubscribeAuth;
    let isMounted = true;

    const trackHomepageVisit = async (user) => {
      if (!isMounted || !user || activityTrackingReady.current) return;
      activityTrackingReady.current = true;

      await trackCustomerActivity("homepage_view", {
        page: "/",
        pageTitle: "Home Page",
        sessionType: user.isAnonymous ? "anonymous" : "authenticated",
      });

      lastActivityTrackedAt.current = Date.now();
    };

    unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        void trackHomepageVisit(user);
      } else {
        activityTrackingReady.current = false;
      }
    });

    return () => {
      isMounted = false;
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, []);

  /*
   * Record meaningful activity while the homepage is visible. Events are
   * throttled to avoid writing to Firestore on every scroll/click/keypress.
   * A tab merely left open in the background will not keep marking the user
   * active; a fresh interaction or return to the visible tab is required.
   */
  useEffect(() => {
    let lastInteractionAt = 0;

    const recordActiveInteraction = (source) => {
      if (document.visibilityState !== "visible") return;

      const now = Date.now();
      if (now - lastInteractionAt < ACTIVITY_THROTTLE_MS) return;
      lastInteractionAt = now;

      void trackCustomerActivity("homepage_active", {
        page: "/",
        pageTitle: "Home Page",
        source,
        activeAt: new Date().toISOString(),
      });

      lastActivityTrackedAt.current = now;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        recordActiveInteraction("tab_visible");
      }
    };

    const onPointerDown = () => recordActiveInteraction("interaction");
    const onKeyDown = () => recordActiveInteraction("interaction");
    const onTouchStart = () => recordActiveInteraction("interaction");
    const onScroll = () => recordActiveInteraction("scroll");

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Reveal on scroll observer for .collection-link elements.
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;

    const observerOpts = {
      root: null,
      rootMargin: "0px 0px -10% 0px",
      threshold: 0.08,
    };

    const revealCb = (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal");
          obs.unobserve(entry.target);
        }
      });
    };

    const io = new IntersectionObserver(revealCb, observerOpts);
    const nodes = document.querySelectorAll(".collection-link");
    nodes.forEach((node) => io.observe(node));

    return () => io.disconnect();
  }, [collections]);

  return (
    <>
      {/* <HeroSection /> */}

      {/* Featured Collections */}
      <section
        id="collections"
        className="collections-section"
        aria-labelledby="featured-collections-heading"
      >
        <div className="collections-header">
          <h2 id="featured-collections-heading">Anti-Tarnish Catalogue</h2>
          <p className="collections-subtitle">
            Curated lines crafted with ethical gold and artisan finishes.
          </p>
        </div>

        {isLoading ? (
          <div
            className="collection-gridmain"
            role="status"
            aria-label="Loading collections"
          >
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="collection-loading-card">
                <div className="collection-loading-image">
                  <div className="collection-loading-shimmer" />
                </div>
                <div className="collection-loading-bottom">
                  <div className="collection-loading-title" />
                  <div className="collection-loading-button" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="collection-gridmain"
            role="list"
            aria-live="polite"
          >
            {collections.map((col) => (
              <Link
                to={`/collections/${col.id}/all-products`}
                key={col.id}
                className="collection-link"
                role="listitem"
                aria-label={`Open ${col.title || col.name || "Collection"} collection`}
                onClick={() => {
                  trackMetaEvent("ViewContent", {
                    content_name: col.title || col.name || "Collection",
                    content_ids: [col.id],
                    content_type: "product_group",
                  });

                  void trackCustomerActivity("collection_click", {
                    collectionId: col.id,
                    collectionName: col.title || col.name || "Collection",
                    page: "/",
                  });
                }}
              >
                <CollectionCard
                  id={col.id}
                  title={col.title || col.name || "Collection"}
                  image={col.image || ""}
                  additionalImages={col.additionalImages || []}
                  alt={col.imageAlt || col.title || col.name || "Collection image"}
                />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* <InstagramReelsSection /> */}
      {/* <BulkEnquirySection /> */}

      {/* Other sections */}
      {/* <TrendingSection />
      <NewArrivalsSection />
      */}
    </>
  );
};

export default HomePage;
