
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { auth } from './firebase';
import { registerAndSaveNotificationDevice } from './notificationRegistration';

export default function PostLoginNotificationPrompt() {
  const location = useLocation();

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    try {
      const shouldPrompt =
        localStorage.getItem('showNotificationPrompt') === '1';

      setVisible(
        location.pathname === '/' &&
        shouldPrompt &&
        !!auth.currentUser
      );
    } catch (error) {
      console.warn('Could not check notification prompt:', error);
      setVisible(false);
    }
  }, [location.pathname]);

  const dismiss = () => {
    try {
      localStorage.removeItem('showNotificationPrompt');
    } catch (error) {
      console.warn('Could not clear notification prompt flag:', error);
    }

    setVisible(false);
  };

  const enableNotifications = async () => {
    if (loading) return;

    setLoading(true);
    setMessage('');

    try {
      const result = await registerAndSaveNotificationDevice();

      if (result.success) {
        dismiss();
      } else {
        setMessage(
          result.error ||
          'Notifications could not be enabled. You can try again later.'
        );
      }
    } catch (error) {
      // Notification errors must never interrupt login or normal usage.
      console.warn('Optional notification setup failed:', error);

      setMessage(
        'Notifications could not be enabled. You can continue using the website.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <div style={styles.overlay}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-prompt-title"
        style={styles.card}
      >
        <div style={styles.icon} aria-hidden="true">
          🔔
        </div>

        <h2 id="notification-prompt-title" style={styles.title}>
          Stay updated
        </h2>

        <p style={styles.description}>
          Enable notifications for chat replies, order updates,
          and important account activity.
        </p>

        {message && (
          <p role="status" aria-live="polite" style={styles.error}>
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={enableNotifications}
          disabled={loading}
          style={{
            ...styles.primaryButton,
            ...(loading ? styles.disabledButton : {}),
          }}
        >
          {loading ? 'Enabling notifications…' : 'Enable notifications'}
        </button>

        <button
          type="button"
          onClick={dismiss}
          disabled={loading}
          style={styles.secondaryButton}
        >
          Not now
        </button>
      </section>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 99999,
    background: 'rgba(0, 0, 0, 0.48)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  card: {
    width: '100%',
    maxWidth: 390,
    boxSizing: 'border-box',
    background: '#ffffff',
    color: '#171717',
    borderRadius: 20,
    padding: 26,
    textAlign: 'center',
    boxShadow: '0 20px 70px rgba(0, 0, 0, 0.2)',
  },

  icon: {
    fontSize: 36,
    marginBottom: 10,
  },

  title: {
    fontSize: 23,
    margin: '0 0 10px',
  },

  description: {
    color: '#666666',
    fontSize: 14,
    lineHeight: 1.6,
    marginBottom: 20,
  },

  primaryButton: {
    width: '100%',
    padding: 13,
    border: 0,
    borderRadius: 10,
    background: '#171717',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },

  disabledButton: {
    opacity: 0.65,
    cursor: 'not-allowed',
  },

  secondaryButton: {
    width: '100%',
    padding: 12,
    marginTop: 8,
    border: 0,
    background: 'transparent',
    color: '#555555',
    cursor: 'pointer',
  },

  error: {
    color: '#b91c1c',
    fontSize: 12,
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
  },
};
