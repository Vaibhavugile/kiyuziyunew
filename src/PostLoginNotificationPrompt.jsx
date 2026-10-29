
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { auth } from "./firebase";
import { registerAndSaveNotificationDevice } from "./notificationRegistration";

export default function PostLoginNotificationPrompt() {
  const location = useLocation();

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  // Show the notification prompt after login on the home page.
  useEffect(() => {
    try {
      const shouldPrompt =
        localStorage.getItem("showNotificationPrompt") === "1";

      setVisible(
        location.pathname === "/" &&
          shouldPrompt &&
          !!auth.currentUser
      );
    } catch (error) {
      console.warn("Could not check notification prompt:", error);
      setVisible(false);
    }
  }, [location.pathname]);

  const dismiss = () => {
    try {
      localStorage.removeItem("showNotificationPrompt");
    } catch (error) {
      console.warn("Could not clear notification prompt flag:", error);
    }

    setVisible(false);
  };

  const enableNotifications = async () => {
    if (loading) return;

    setLoading(true);
    setMessage("");
    setMessageType("info");

    try {
      const result = await registerAndSaveNotificationDevice();

      if (result?.success) {
        setMessage(
          "Notifications have been enabled for this device."
        );
        setMessageType("success");

        try {
          localStorage.removeItem("showNotificationPrompt");
        } catch (error) {
          console.warn("Could not clear prompt flag:", error);
        }

        // Close the prompt after a brief success message.
        window.setTimeout(() => {
          setVisible(false);
        }, 1200);
      } else {
        setMessage(
          result?.error ||
            "Notifications could not be enabled. Please try again."
        );
        setMessageType("error");
      }
    } catch (error) {
      console.error("Notification registration failed:", error);

      setMessage(
        error?.message ||
          "Notifications could not be enabled. Please try again."
      );
      setMessageType("error");
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
        <div style={styles.brand}>KIYU ZIYU</div>

        <div style={styles.icon} aria-hidden="true">
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M10 21h4" />
          </svg>
        </div>

        <h2 id="notification-prompt-title" style={styles.title}>
          Stay Updated
        </h2>

        <p style={styles.description}>
          Enable notifications to receive important updates, customer
          support replies, and account activity alerts from Kiyu Ziyu.
        </p>

        {message && (
          <p
            role="status"
            aria-live="polite"
            style={{
              ...styles.message,
              ...(messageType === "error"
                ? styles.errorMessage
                : {}),
              ...(messageType === "success"
                ? styles.successMessage
                : {}),
            }}
          >
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
          {loading ? (
            <>
              <span style={styles.spinner} aria-hidden="true" />
              Enabling notifications...
            </>
          ) : (
            "Enable Notifications"
          )}
        </button>

        <button
          type="button"
          onClick={dismiss}
          disabled={loading}
          style={styles.secondaryButton}
        >
          Not now
        </button>

        <p style={styles.footer}>
          You can continue shopping even if you skip notifications.
        </p>
      </section>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 99999,
    background: "rgba(20, 15, 10, 0.62)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    overflowY: "auto",
  },

  card: {
    width: "100%",
    maxWidth: 400,
    boxSizing: "border-box",
    background: "#fffdf9",
    color: "#211b16",
    border: "1px solid #e6d4b8",
    borderRadius: 22,
    padding: "28px 24px 20px",
    textAlign: "center",
    boxShadow: "0 24px 80px rgba(0,0,0,.3)",
    margin: "auto",
    fontFamily: "Arial, sans-serif",
  },

  brand: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 4,
    color: "#967448",
    marginBottom: 16,
  },

  icon: {
    width: 64,
    height: 64,
    margin: "0 auto 16px",
    display: "grid",
    placeItems: "center",
    background: "#211b16",
    color: "#f0d3a4",
    borderRadius: 20,
  },

  title: {
    fontFamily: '"Cormorant Garamond", Georgia, serif',
    fontSize: 30,
    fontWeight: 600,
    lineHeight: 1.2,
    margin: "0 0 12px",
  },

  description: {
    color: "#71665a",
    fontSize: 13,
    lineHeight: 1.8,
    margin: "0 0 22px",
  },

  primaryButton: {
    width: "100%",
    minHeight: 48,
    boxSizing: "border-box",
    padding: 14,
    border: 0,
    borderRadius: 12,
    background: "#211b16",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  disabledButton: {
    opacity: 0.65,
    cursor: "not-allowed",
  },

  spinner: {
    width: 15,
    height: 15,
    border: "2px solid rgba(255,255,255,.4)",
    borderTopColor: "#ffffff",
    borderRadius: "50%",
    display: "inline-block",
    animation: "none",
  },

  message: {
    fontSize: 12,
    lineHeight: 1.7,
    overflowWrap: "anywhere",
    color: "#66503a",
    background: "#f7f1e8",
    borderRadius: 10,
    padding: 12,
    margin: "0 0 14px",
  },

  errorMessage: {
    color: "#a52a2a",
    background: "#fff0ed",
  },

  successMessage: {
    color: "#28613b",
    background: "#edf7ee",
  },

  secondaryButton: {
    width: "100%",
    padding: 12,
    marginTop: 8,
    border: 0,
    background: "transparent",
    color: "#62594f",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },

  footer: {
    fontSize: 10,
    lineHeight: 1.6,
    color: "#9a8e80",
    margin: "8px 0 0",
  },
};
