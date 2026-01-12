import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import MiniCart from "./MiniCart";
import logo from "../assets/logoj.png";
import logoText from "../assets/logotext.png";
import "./Navbar.css";
import { useAuth } from "./AuthContext";
import { FaUserCircle } from "react-icons/fa";
import { FiMenu, FiX } from "react-icons/fi";

const Navbar = () => {
  const { currentUser, userRole, logout } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isSticky, setIsSticky] = useState(false);

  const profileBtnRef = useRef(null);
  const mobileMenuRef = useRef(null);

  // Sticky header on scroll
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || window.pageYOffset;
      setIsSticky(y > 60);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // initialize
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape closes menus
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

  // close profile dropdown when clicking outside
  useEffect(() => {
    const onDocClick = (e) => {
      if (profileBtnRef.current && !profileBtnRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      setProfileOpen(false);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // focus first interactive element when mobile menu opens
  useEffect(() => {
    if (!mobileOpen || !mobileMenuRef.current) return;
    const first = mobileMenuRef.current.querySelector("a, button");
    if (first) first.focus();
  }, [mobileOpen]);

  return (
    <>
      <header className={`kj-header ${isSticky ? "kj-sticky" : ""}`} role="banner">
        <nav className="kj-nav" aria-label="Main navigation">
          <div className="kj-nav-left">
            <Link to="/" className="kj-logo-link" aria-label="Go to homepage">
              <img src={logo} alt="logo" className={`kj-logo ${isSticky ? "small" : ""}`} />
            </Link>
          </div>

          <div className="kj-nav-center" aria-hidden={mobileOpen}>
            <Link to="/" className="kj-text-logo-link" aria-label="Homepage">
              <img src={logoText} alt="Kiyuziyu- By Tanishka" className="kj-text-logo" />
            </Link>
          </div>

          <div className="kj-nav-right">
            <ul className="kj-links" role="menubar" aria-hidden={mobileOpen}>
              <li role="none" className="kj-link-item">
                <Link to="/" role="menuitem" className="kj-link">Home</Link>
              </li>
              {currentUser && (
                <li role="none" className="kj-link-item">
                  <Link to="/order-history" role="menuitem" className="kj-link">Orders</Link>
                </li>
              )}
              {userRole === "admin" && (
                <li role="none" className="kj-link-item">
                  <Link to="/admin" role="menuitem" className="kj-link">Admin</Link>
                </li>
              )}
              {/* <li role="none" className="kj-link-item mobile-hidden">
                <Link to="/#collections" role="menuitem" className="kj-link">Collections</Link>
              </li> */}
            </ul>

            <div className="kj-icons">
              <div className="kj-minicart-wrapper" aria-hidden={mobileOpen}>
                <MiniCart />
              </div>

              <div className="kj-profile">
                {currentUser ? (
                  <div className="kj-profile-wrapper" ref={profileBtnRef}>
                    <button
                      className="kj-profile-btn"
                      onClick={() => setProfileOpen((s) => !s)}
                      aria-haspopup="true"
                      aria-expanded={profileOpen}
                      aria-label="Open profile menu"
                    >
                      <FaUserCircle size={22} />
                    </button>

                    {profileOpen && (
                      <div className="kj-profile-menu" role="menu">
                        <button className="kj-menu-item" onClick={handleLogout} role="menuitem">Sign out</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Link to="/login" className="kj-login-link">Login</Link>
                )}
              </div>

              <button
                className={`kj-hamburger ${mobileOpen ? "open" : ""}`}
                aria-label={`${mobileOpen ? "Close menu" : "Open menu"}`}
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen((s) => !s)}
              >
                {mobileOpen ? <FiX size={22} /> : <FiMenu size={22} />}
              </button>
            </div>
          </div>
        </nav>
      </header>

      <div
        className={`kj-mobile-backdrop ${mobileOpen ? "visible" : ""}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden={!mobileOpen}
      />

      <aside
        ref={mobileMenuRef}
        className={`kj-mobile-menu ${mobileOpen ? "open" : ""}`}
        aria-hidden={!mobileOpen}
        aria-label="Mobile menu"
      >
        <div className="kj-mobile-inner">
          <div className="kj-mobile-top">
            <Link to="/" onClick={() => setMobileOpen(false)} className="kj-mobile-logo">
              <img src={logo} alt="logo" />
            </Link>
            <button className="kj-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <FiX size={22} />
            </button>
          </div>

          <nav className="kj-mobile-nav" role="navigation">
            <ul>
              <li><Link to="/" onClick={() => setMobileOpen(false)}>Home</Link></li>
              {/* <li><Link to="/#collections" onClick={() => setMobileOpen(false)}>Collections</Link></li> */}
              {currentUser && <li><Link to="/order-history" onClick={() => setMobileOpen(false)}>Order History</Link></li>}
              {userRole === "admin" && <li><Link to="/admin" onClick={() => setMobileOpen(false)}>Admin</Link></li>}
              <li><Link to="/contact" onClick={() => setMobileOpen(false)}>Contact</Link></li>
            </ul>
          </nav>

          <div className="kj-mobile-actions">
            <div className="kj-mobile-cart"><MiniCart /></div>
            {currentUser ? (
              <div className="kj-mobile-profile">
                <button onClick={handleLogout} className="kj-btn-plain">Sign out</button>
              </div>
            ) : (
              <Link to="/login" className="kj-btn-solid" onClick={() => setMobileOpen(false)}>Login</Link>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Navbar;
