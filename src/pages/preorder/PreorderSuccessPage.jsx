
import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import "./PreorderSuccessPage.css";

export default function PreorderSuccessPage() {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;

    const loadOrder = async () => {
      try {
        setLoading(true);
        setLoadError("");

        const snapshot = await getDoc(doc(db, "preorders", orderId));

        if (!active) return;

        if (snapshot.exists()) {
          setOrder({
            id: snapshot.id,
            ...snapshot.data(),
          });
        } else {
          setLoadError(
            "We couldn't find the order details for this reference."
          );
        }
      } catch (error) {
        console.error("Unable to retrieve pre-order confirmation:", error);

        if (active) {
          setLoadError(
            "Your order confirmation could not be loaded. Please try again."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    if (orderId) {
      loadOrder();
    } else {
      setLoadError("No order reference was provided.");
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [orderId]);

  if (loading) {
    return (
      <main className="px-success-page">
        <div className="px-success-loading">
          <i />
          <span>Preparing your confirmation...</span>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="px-success-page">
        <header className="px-success-nav">
          <Link to="/preorder" className="px-brand">
            <span className="px-brand-symbol">P</span>
            <span>
              PREORDER <i>STUDIO</i>
            </span>
          </Link>
        </header>

        <section className="px-success-missing">
          <span className="px-missing-icon">!</span>

          <span className="px-success-overline">
            ORDER REFERENCE
          </span>

          <h1>Confirmation unavailable</h1>

          <p>{loadError}</p>

          <button
            type="button"
            onClick={() => navigate("/preorder")}
          >
            Back to pre-orders <span>↗</span>
          </button>
        </section>
      </main>
    );
  }

  const orderNumber =
    order.orderNumber ||
    location.state?.orderNumber ||
    order.id;

  const customerName = order.customer?.name || "there";
  const totalBoxes = Number(order.totalBoxes || 0);

  return (
    <main className="px-success-page">
      {/* NAVIGATION */}
      <header className="px-success-nav">
        <Link to="/preorder" className="px-brand">
          <span className="px-brand-symbol">P</span>
          <span>
            PREORDER <i>STUDIO</i>
          </span>
        </Link>

        <span className="px-success-nav-label">
          ORDER CONFIRMATION
        </span>
      </header>

      {/* CONFIRMATION */}
      <section className="px-success-layout">
        <div className="px-success-main">
          <div className="px-success-decoration">
            <span>✳</span>
          </div>

          {/* SUCCESS ICON */}
          <div className="px-success-check">
            <span>✓</span>
          </div>

          <span className="px-success-overline">
            PRE-ORDER SUCCESSFULLY RECEIVED
          </span>

          <h1>
            You're on
            <br />
            <em>the list.</em>
          </h1>

          <p className="px-success-thanks">
            Thank you, <strong>{customerName}</strong>. Your pre-order
            has been successfully recorded. We're glad to have you
            with us.
          </p>

          {/* ORDER REFERENCE */}
          <div className="px-success-reference">
            <div className="px-reference-top">
              <span>YOUR ORDER REFERENCE</span>
              <span className="px-reference-icon">✳</span>
            </div>

            <strong>{orderNumber}</strong>

            <small>
              KEEP THIS REFERENCE FOR YOUR RECORDS
            </small>
          </div>

          {/* ORDER STATS */}
          <div className="px-success-stats">
            <div className="px-success-stat">
              <span className="px-stat-icon">▦</span>
              <small>BOXES RESERVED</small>
              <strong>{totalBoxes}</strong>
            </div>

            <div className="px-success-stat-divider" />

            <div className="px-success-stat">
              <span className="px-stat-icon">✓</span>
              <small>ORDER STATUS</small>
              <strong className="px-status-placed">Placed</strong>
            </div>
          </div>

          {/* PAYMENT INFORMATION */}
          <div className="px-success-no-payment">
            <span>✳</span>

            <p>
              <strong>No payment was collected.</strong>
              <br />
              Your requested quantities were checked and reserved
              successfully.
            </p>
          </div>

          {/* ACTION */}
          <Link className="px-success-button" to="/preorder">
            <span>Explore more collections</span>
            <span className="px-success-button-arrow">↗</span>
          </Link>

          <div className="px-success-thank-you">
            THANK YOU FOR CHOOSING US
          </div>
        </div>

        {/* DECORATIVE SIDE PANEL */}
        <aside className="px-success-aside">
          <div className="px-success-aside-top">
            <span className="px-aside-symbol">P</span>

            <span className="px-aside-brand">
              PREORDER
              <br />
              STUDIO
            </span>
          </div>

          <div className="px-success-aside-center">
            <span className="px-aside-eyebrow">
              A LITTLE NOTE TO YOU
            </span>

            <span className="px-aside-star">✳</span>

            <strong>
              Good things
              <br />
              <em>come to those</em>
              <br />
              who reserve.
            </strong>

            <span className="px-aside-line" />

            <p>
              Your selection is now part of our collection journey.
            </p>
          </div>

          <div className="px-success-aside-bottom">
            <span>EST. 2026</span>
            <span>MADE WITH CARE ✳</span>
          </div>

          <div className="px-aside-watermark">P</div>
        </aside>
      </section>

      {/* FOOTER */}
      <footer className="px-success-footer">
        <div className="px-success-footer-brand">
          <span>P</span>
          PREORDER STUDIO
        </div>

        <span className="px-success-footer-message">
          Thoughtfully selected. Reserved for you.
        </span>

        <span className="px-success-footer-copy">
          © 2026 PREORDER STUDIO
        </span>
      </footer>
    </main>
  );
}
