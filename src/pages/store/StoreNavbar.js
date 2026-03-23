import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import "../../components/Navbar.css";

import { useStoreAuth } from "./StoreAuthContext";
import { useStoreCart } from "./StoreCartContext";

import { FaUserCircle } from "react-icons/fa";
import { FiMenu, FiX, FiShoppingCart } from "react-icons/fi";

const StoreNavbar = ({ data, theme }) => {

  const { user, logout } = useStoreAuth();
  const { cartItemsCount } = useStoreCart();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isSticky, setIsSticky] = useState(false);

  const profileBtnRef = useRef(null);
  const mobileMenuRef = useRef(null);

  /* ================= THEME ================= */

  useEffect(() => {

    if (!theme?.colors) return;

    document.documentElement.style.setProperty("--kj-gold", theme.colors.primary);
    document.documentElement.style.setProperty("--kj-bg", theme.colors.background);

  }, [theme]);

  /* ================= STICKY ================= */

  useEffect(() => {

    const onScroll = () => setIsSticky(window.scrollY > 60);

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);

  }, []);

  /* ================= ESC CLOSE ================= */

  useEffect(() => {

    const onKey = (e) => {

      if (e.key === "Escape") {

        setMobileOpen(false);
        setProfileOpen(false);

      }

    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);

  }, []);

  /* ================= OUTSIDE CLICK ================= */

  useEffect(() => {

    const onDocClick = (e) => {

      if (profileBtnRef.current && !profileBtnRef.current.contains(e.target)) {

        setProfileOpen(false);

      }

    };

    document.addEventListener("click", onDocClick);

    return () => document.removeEventListener("click", onDocClick);

  }, []);

  /* ================= LOGOUT ================= */

  const handleLogout = async () => {

    try {

      await logout();
      setProfileOpen(false);

    } catch (err) {

      console.error(err);

    }

  };

  /* ================= MOBILE FOCUS ================= */

  useEffect(() => {

    if (!mobileOpen || !mobileMenuRef.current) return;

    const first = mobileMenuRef.current.querySelector("a,button");

    if (first) first.focus();

  }, [mobileOpen]);

  return (

    <>

      <header className={`kj-header ${isSticky ? "kj-sticky" : ""}`}>

        <nav className="kj-nav">

          {/* LEFT LOGO */}

          <div className="kj-nav-left">

            <Link to="/">

              <img
                src={data?.logo || "/fallback-logo.png"}
                alt="logo"
                className="kj-logo"
              />

            </Link>

          </div>

          {/* CENTER BRAND */}

          <div className="kj-nav-center">

            <Link to="/" style={{ textDecoration: "none" }}>

              {data?.textLogo ? (

                <img src={data.textLogo} className="kj-text-logo" />

              ) : (

                <div className="kj-brand">

                  <span className="kj-brand-name">

                    {data?.brandName || "YOUR BRAND"}

                  </span>

                  <span className="kj-brand-sub">

                    LUXURY COLLECTION

                  </span>

                </div>

              )}

            </Link>

          </div>

          {/* RIGHT */}

          <div className="kj-nav-right">

            <ul className="kj-links">

              <li>
                <Link to="/" className="kj-link">
                  Home
                </Link>
              </li>

            </ul>

            <div className="kj-icons">

              {/* CART */}

              <Link to="/store/cart" className="kj-cart-icon">

                <FiShoppingCart size={22} />

                {cartItemsCount > 0 && (
                  <span className="kj-cart-count">
                    {cartItemsCount}
                  </span>
                )}

              </Link>

              {/* PROFILE */}

              <div className="kj-profile">

                {user ? (

                  <div ref={profileBtnRef}>

                    <button
                      className="kj-profile-btn"
                      onClick={() => setProfileOpen((s) => !s)}
                    >

                      <FaUserCircle size={22} />

                    </button>

                    {profileOpen && (

                      <div className="kj-profile-menu">

                        <Link
                          to="/store/orders"
                          className="kj-menu-item"
                          onClick={() => setProfileOpen(false)}
                        >
                          My Orders
                        </Link>

                        <button
                          onClick={handleLogout}
                          className="kj-menu-item"
                        >
                          Sign out
                        </button>

                      </div>

                    )}

                  </div>

                ) : (

                  <Link to="/store/login" className="kj-login-link">
                    Login
                  </Link>

                )}

              </div>

              {/* MOBILE MENU */}

              <button
                className={`kj-hamburger ${mobileOpen ? "open" : ""}`}
                onClick={() => setMobileOpen((s) => !s)}
              >

                {mobileOpen ? <FiX size={22} /> : <FiMenu size={22} />}

              </button>

            </div>

          </div>

        </nav>

      </header>

      {/* BACKDROP */}

      <div
        className={`kj-mobile-backdrop ${mobileOpen ? "visible" : ""}`}
        onClick={() => setMobileOpen(false)}
      />

      {/* MOBILE MENU */}

      <aside
        ref={mobileMenuRef}
        className={`kj-mobile-menu ${mobileOpen ? "open" : ""}`}
      >

        <div className="kj-mobile-inner">

          <div className="kj-mobile-top">

            <img src={data?.logo} alt="logo" />

            <button onClick={() => setMobileOpen(false)}>
              <FiX size={22} />
            </button>

          </div>

          <nav className="kj-mobile-nav">

            <ul>

              <li>
                <Link to="/" onClick={() => setMobileOpen(false)}>
                  Home
                </Link>
              </li>

              <li>
                <Link to="/store/orders" onClick={() => setMobileOpen(false)}>
                  My Orders
                </Link>
              </li>

              <li>
                <Link to="/store/cart" onClick={() => setMobileOpen(false)}>
                  Cart
                </Link>
              </li>

            </ul>

          </nav>

          <div className="kj-mobile-actions">

            {user ? (

              <button onClick={handleLogout} className="kj-btn-plain">
                Sign out
              </button>

            ) : (

              <Link to="/store/login" className="kj-btn-solid">
                Login
              </Link>

            )}

          </div>

        </div>

      </aside>

    </>

  );

};

export default StoreNavbar;