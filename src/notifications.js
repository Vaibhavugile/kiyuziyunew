
import {
  getFirebaseMessaging,
  getToken,
  onMessage,
} from "./firebase";

const VAPID_PUBLIC_KEY =
  "BKM2mrq3UQghx6OFsv-zwlzgmixh84bbvJDbczv-78Kg856C2LpSiKdHnZFOTKWl9HIASHFWJw_Lzow5McimudQ";

const SERVICE_WORKER_PATH = "/firebase-messaging-sw.js";

let serviceWorkerRegistrationPromise = null;

async function getMessagingServiceWorker() {
  if (typeof window === "undefined") {
    throw new Error("Notifications are only available in a browser.");
  }

  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support service workers.");
  }

  if (!window.isSecureContext) {
    throw new Error("Notifications require HTTPS.");
  }

  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = (async () => {
      const registration = await navigator.serviceWorker.register(
        SERVICE_WORKER_PATH
      );

      await navigator.serviceWorker.ready;
      return registration;
    })().catch((error) => {
      serviceWorkerRegistrationPromise = null;
      throw new Error(
        `Service worker registration failed: ${error.message}`
      );
    });
  }

  return serviceWorkerRegistrationPromise;
}

export async function enableWebNotifications() {
  try {
    if (typeof window === "undefined") {
      throw new Error("Notifications are unavailable outside the browser.");
    }

    if (!("Notification" in window)) {
      throw new Error("This browser does not support notifications.");
    }

    if (!("serviceWorker" in navigator)) {
      throw new Error("This browser does not support service workers.");
    }

    if (!window.isSecureContext) {
      throw new Error("Notifications require HTTPS.");
    }

    if (Notification.permission === "denied") {
      throw new Error(
        "Notifications are blocked. Allow them in your browser settings and try again."
      );
    }

    let permission = Notification.permission;

    if (permission === "default") {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      throw new Error("Notification permission was not granted.");
    }

    const registration = await getMessagingServiceWorker();
    const messaging = await getFirebaseMessaging();

    if (!messaging) {
      throw new Error("Firebase Messaging could not be initialized.");
    }

    const token = await getToken(messaging, {
      vapidKey: VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      throw new Error(
        "Firebase did not return a notification token for this device."
      );
    }

    return {
      success: true,
      token,
      permission,
    };
  } catch (error) {
    console.error("Enable web notifications failed:", error);

    return {
      success: false,
      code: error.code || "notification-setup-failed",
      error:
        error.message ||
        "Notifications could not be enabled. Please try again.",
    };
  }
}

export async function listenForForegroundNotifications(callback) {
  try {
    const messaging = await getFirebaseMessaging();

    if (!messaging) {
      return () => {};
    }

    return onMessage(messaging, (payload) => {
      if (typeof callback === "function") {
        callback(payload);
      }
    });
  } catch (error) {
    console.error("Foreground notification listener failed:", error);
    return () => {};
  }
}

export function getWebNotificationStatus() {
  if (typeof window === "undefined") {
    return {
      supported: false,
      permission: "unsupported",
    };
  }

  return {
    supported:
      "Notification" in window &&
      "serviceWorker" in navigator &&
      window.isSecureContext,
    permission:
      "Notification" in window
        ? Notification.permission
        : "unsupported",
  };
}
