
import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import {
  FaHeadset,
  FaTimes,
  FaExpandAlt,
  FaComments,
  FaPlus,
  FaArrowRight,
  FaCircle,
} from 'react-icons/fa';

import { auth, db, storage } from '../firebase';
import CustomerSupportCenter from './CustomerSupportCenter';
import './support-widget.css';

export default function CustomerSupportWidget() {
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState('latest');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!active) return;

      setUser(nextUser);
      setProfile(null);

      if (nextUser) {
        try {
          const snapshot = await getDoc(doc(db, 'users', nextUser.uid));

          if (active) {
            setProfile(
              snapshot.exists() ? snapshot.data() : {}
            );
          }
        } catch (error) {
          console.error('Could not load support profile:', error);

          if (active) setProfile({});
        }
      }

      if (active) setAuthLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const openLatestChat = () => {
    setView('latest');
    setOpen(true);
  };

  const openNewEnquiry = () => {
    setView('new');
    setOpen(true);
  };

  const openFullCentre = () => {
    setOpen(false);
    navigate('/support');
  };

  return (
    <div className="support-widget-root">
      {open && (
        <button
          className="sw-backdrop"
          aria-label="Close customer support"
          onClick={() => setOpen(false)}
          tabIndex={-1}
        />
      )}

      {open && (
        <section
          className="sw-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Customer care"
        >
          <header className="sw-header">
            <div className="sw-brand">
              <span className="sw-brand-icon">
                <FaHeadset />
              </span>

              <div className="sw-brand-copy">
                <strong>Customer care</strong>
                <span>
                  <FaCircle className="sw-online-dot" />
                  Personal support for every order
                </span>
              </div>
            </div>

            <div className="sw-header-actions">
              <button
                type="button"
                onClick={openFullCentre}
                title="Open full support centre"
                aria-label="Open full support centre"
              >
                <FaExpandAlt />
              </button>

              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close support"
                aria-label="Close support"
              >
                <FaTimes />
              </button>
            </div>
          </header>

          <nav className="sw-shortcuts" aria-label="Support options">
            <button
              type="button"
              className={view === 'latest' ? 'active' : ''}
              onClick={openLatestChat}
            >
              <span className="sw-shortcut-icon">
                <FaComments />
              </span>

              <span className="sw-shortcut-copy">
                <strong>Latest chat</strong>
                <small>Continue your conversation</small>
              </span>
            </button>

            <button
              type="button"
              className={view === 'new' ? 'active' : ''}
              onClick={openNewEnquiry}
            >
              <span className="sw-shortcut-icon">
                <FaPlus />
              </span>

              <span className="sw-shortcut-copy">
                <strong>New enquiry</strong>
                <small>Create a support request</small>
              </span>
            </button>
          </nav>

          <div className="sw-content">
            {authLoading ? (
              <div className="sw-loading">
                <span className="sw-spinner" />
                <strong>Getting your support ready…</strong>
              </div>
            ) : (
              <CustomerSupportCenter
                key={`${user?.uid || 'guest'}-${view}`}
                db={db}
                storage={storage}
                user={user}
                profile={profile || user}
                initialView={view}
                compact
              />
            )}
          </div>

          <button
            type="button"
            className="sw-full-centre"
            onClick={openFullCentre}
          >
            Open full support centre
            <FaArrowRight />
          </button>
        </section>
      )}

      <button
        type="button"
        className={`sw-launcher ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? 'Close customer support' : 'Open customer support'}
        aria-expanded={open}
      >
        {open ? <FaTimes /> : <FaHeadset />}
        {!open && <span>Support</span>}
        {!open && <i className="sw-launcher-dot" />}
      </button>
    </div>
  );
}
