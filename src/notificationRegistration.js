
import { auth, db } from "./firebase";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { enableWebNotifications } from "./notifications";

/**
 * Detect the user's current platform.
 */
function detectPlatform() {
  if (typeof navigator === "undefined") return "other";

  const ua = navigator.userAgent || "";
  const platform = navigator.userAgentData?.platform || "";

  if (/Android/i.test(ua)) return "android";

  // iPadOS can report Macintosh in Safari.
  if (
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }

  if (/Windows/i.test(platform) || /Windows/i.test(ua)) {
    return "windows";
  }

  if (/macOS|Macintosh|Mac OS X/i.test(platform + " " + ua)) {
    return "macos";
  }

  if (/Linux/i.test(platform + " " + ua)) {
    return "linux";
  }

  return "other";
}

/**
 * Check whether this is an installed Home Screen / desktop web app.
 */
function isStandaloneApp() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.matchMedia?.("(display-mode: fullscreen)").matches === true ||
    window.navigator.standalone === true
  );
}

/**
 * Check basic browser requirements before requesting notifications.
 */
function checkNotificationEnvironment() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      success: false,
      error: "Notifications must be enabled from a browser.",
    };
  }

  if (!window.isSecureContext) {
    return {
      success: false,
      error:
        "Notifications require HTTPS. Open the secure website and try again.",
    };
  }

  if (!("Notification" in window)) {
    return {
      success: false,
      error:
        "This browser does not support web notifications. Try a supported browser.",
    };
  }

  if (!("serviceWorker" in navigator)) {
    return {
      success: false,
      error:
        "This browser does not support the service worker needed for notifications.",
    };
  }

  const platform = detectPlatform();

  // iOS/iPadOS web push requires an installed Home Screen web app.
  if (platform === "ios" && !isStandaloneApp()) {
    return {
      success: false,
      code: "ios-install-required",
      error:
        "On iPhone or iPad, first add this website to your Home Screen. Open it from the new Home Screen icon, then enable notifications.",
    };
  }

  if (Notification.permission === "denied") {
    return {
      success: false,
      code: "notification-permission-denied",
      error:
        "Notifications are blocked for this website. Open your browser or device settings, allow notifications, and try again.",
    };
  }

  return { success: true };
}

/**
 * Get a persistent ID for this browser installation.
 *
 * localStorage is used so repeated registrations on the same browser
 * normally update the same Firestore device document.
 */
function getNotificationDeviceId() {
  const storageKey = "notificationDeviceId";

  try {
    let deviceId = localStorage.getItem(storageKey);

    if (deviceId) return deviceId;

    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      deviceId = crypto.randomUUID();
    } else {
      deviceId =
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    localStorage.setItem(storageKey, deviceId);

    return deviceId;
  } catch (error) {
    // Do not silently generate a new ID on every call if storage is blocked.
    throw new Error(
      "Browser storage is unavailable. Please allow site data and try again."
    );
  }
}

/**
 * Register this browser's FCM token and save it to Firestore.
 *
 * Firestore path:
 * users/{uid}/notificationDevices/{deviceId}
 *
 * Call this function after a user action, such as tapping
 * "Enable notifications".
 */
export async function registerAndSaveNotificationDevice() {
  try {
    const user = auth.currentUser;

    if (!user) {
      return {
        success: false,
        code: "not-authenticated",
        error: "Please sign in before enabling notifications.",
      };
    }

    const environment = checkNotificationEnvironment();

    if (!environment.success) {
      return environment;
    }

    // This existing helper requests permission as needed and retrieves
    // the FCM token using the configured Firebase messaging setup.
    const result = await enableWebNotifications();

    if (!result?.success || !result?.token) {
      return {
        success: false,
        code: result?.code || "fcm-token-unavailable",
        error:
          result?.error ||
          "Firebase could not generate a notification token. Please try again.",
      };
    }

    // Permission may have changed or been denied during the request.
    if (Notification.permission !== "granted") {
      return {
        success: false,
        code: "permission-not-granted",
        error:
          "Notification permission was not granted. Allow notifications and try again.",
      };
    }

    const deviceId = getNotificationDeviceId();

    const deviceRef = doc(
      db,
      "users",
      user.uid,
      "notificationDevices",
      deviceId
    );

    const existingSnapshot = await getDoc(deviceRef);

    const deviceData = {
      token: result.token,
      platform: detectPlatform(),
      userAgent: navigator.userAgent || "",
      enabled: true,
      installedApp: isStandaloneApp(),
      updatedAt: serverTimestamp(),
    };

    if (!existingSnapshot.exists()) {
      deviceData.createdAt = serverTimestamp();
    }

    await setDoc(deviceRef, deviceData, { merge: true });

    // Verify the write.
    const savedSnapshot = await getDoc(deviceRef);

    if (
      !savedSnapshot.exists() ||
      savedSnapshot.data()?.token !== result.token ||
      savedSnapshot.data()?.enabled !== true
    ) {
      return {
        success: false,
        code: "firestore-verification-failed",
        error:
          "The device token could not be verified in Firestore. Please try again.",
      };
    }

    console.info("Notification device registered:", {
      path: deviceRef.path,
      platform: deviceData.platform,
      installedApp: deviceData.installedApp,
    });

    return {
      success: true,
      message: "Notifications enabled for this device.",
      platform: deviceData.platform,
      installedApp: deviceData.installedApp,
    };
  } catch (error) {
    console.error("Notification device registration failed:", {
      code: error?.code || "unknown",
      message: error?.message || String(error),
    });

    return {
      success: false,
      code: error?.code || "registration-failed",
      error:
        error?.message ||
        "Could not register this device. Please try again.",
    };
  }
}
