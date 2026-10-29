// src/Enablenotification.js

import React, { useState } from 'react';

import {
  registerAndSaveNotificationDevice,
} from './notificationRegistration';

export default function EnableNotificationsButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleEnable = async () => {
    if (loading) return;

    setLoading(true);
    setMessage('');
    setIsSuccess(false);

    try {
      const result = await registerAndSaveNotificationDevice();

      if (result.success) {
        setIsSuccess(true);
        setMessage(result.message);
      } else {
        setIsSuccess(false);
        setMessage(result.error || 'Could not enable notifications.');
      }
    } catch (error) {
      setIsSuccess(false);
      setMessage(
        error?.message || 'An unexpected error occurred.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <button
        type="button"
        onClick={handleEnable}
        disabled={loading}
        style={{
          ...styles.button,
          ...(loading ? styles.buttonDisabled : {}),
        }}
      >
        {loading ? (
          <>
            <span style={styles.spinner} aria-hidden="true" />
            Enabling notifications...
          </>
        ) : (
          <>
            <span aria-hidden="true">🔔</span>
            Enable Notifications
          </>
        )}
      </button>

      {message && (
        <p
          role="status"
          aria-live="polite"
          style={{
            ...styles.message,
            color: isSuccess ? '#15803d' : '#b91c1c',
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '10px',
    width: '100%',
  },

  button: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '13px 22px',
    border: 'none',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #171717, #404040)',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 5px 16px rgba(0, 0, 0, 0.16)',
    transition: 'opacity 0.2s ease',
  },

  buttonDisabled: {
    opacity: 0.65,
    cursor: 'not-allowed',
  },

  spinner: {
    width: '15px',
    height: '15px',
    border: '2px solid rgba(255, 255, 255, 0.45)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'notification-spin 0.8s linear infinite',
  },

  message: {
    margin: 0,
    fontSize: '13px',
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
  },
};