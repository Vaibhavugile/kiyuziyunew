import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import "../../components/Navbar.css";
import { useAuth } from "../../components/AuthContext";
import { FaUserCircle } from "react-icons/fa";
import { FiMenu, FiX } from "react-icons/fi";

const StoreNavbar = ({ data, theme }) => {

  const { currentUser, logout } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isSticky, setIsSticky] = useState(false);

  const profileBtnRef = useRef(null);
  const mobileMenuRef = useRef(null);

  /* ================= THEME INJECTION ================= */
  useEffect(() => {
    if (!theme?.colors) return;

    document.documentElement.style.setProperty("--kj-gold", theme.colors.primary);
    document.documentElement.style.setProperty("--kj-gold-2", theme.colors.primary);
    document.documentElement.style.setProperty("--kj-bg", theme.colors.background);

  }, [theme]);

  /* ================= STICKY ================= */
  useEffect(() => {
    const onScroll = () => setIsSticky(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
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
    const first = mobileMenuRef.current.querySelector("a, button");
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
                style={{
                  width: "42px",
                  height: "42px",
                  objectFit: "cover"
                }}
              />
            </Link>
          </div>

          {/* 🔥 CENTER BRAND (FIXED PREMIUM LOOK) */}
          <div className="kj-nav-center" aria-hidden={mobileOpen}>
            <Link to="/" style={{ textDecoration: "none" }}>

              {data?.textLogo ? (
                <img src={data.textLogo} className="kj-text-logo" />
              ) : (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  lineHeight: "1.1"
                }}>
                  <span style={{
                    fontFamily: theme?.font || "Playfair Display",
                    fontSize: "22px",
                    fontWeight: "600",
                    letterSpacing: "2px",
                    color: theme?.colors?.primary
                  }}>
                    {data?.brandName || "YOUR BRAND"}
                  </span>

                  <span style={{
                    fontSize: "10px",
                    letterSpacing: "3px",
                    color: "#888"
                  }}>
                    LUXURY COLLECTION
                  </span>
                </div>
              )}

            </Link>
          </div>

          {/* RIGHT SIDE */}
          <div className="kj-nav-right">

            {/* LINKS */}
            <ul className="kj-links">
              <li><Link to="/" className="kj-link">Home</Link></li>
            </ul>

            {/* ICONS */}
            <div className="kj-icons">

              {/* PROFILE */}
              <div className="kj-profile">
                {currentUser ? (
                  <div ref={profileBtnRef}>
                    <button
                      className="kj-profile-btn"
                      onClick={() => setProfileOpen((s) => !s)}
                    >
                      <FaUserCircle size={22} />
                    </button>

                    {profileOpen && (
                      <div className="kj-profile-menu">
                        <button onClick={handleLogout} className="kj-menu-item">
                          Sign out
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Link to="/store/login" className="kj-login-link">Login</Link>
                )}
              </div>

              {/* MOBILE MENU BUTTON */}
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
                <Link to="/" onClick={() => setMobileOpen(false)}>Home</Link>
              </li>
            </ul>
          </nav>

          <div className="kj-mobile-actions">
            {currentUser ? (
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