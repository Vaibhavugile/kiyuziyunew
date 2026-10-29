// src/notifications.js

import {
  getFirebaseMessaging,
  getToken,
  onMessage,
} from './firebase';

const VAPID_PUBLIC_KEY =
  'BKM2mrq3UQghx6OFsv-zwlzgmixh84bbvJDbczv-78Kg856C2LpSiKdHnZFOTKWl9HIASHFWJw_Lzow5McimudQ';

const SERVICE_WORKER_PATH = '/firebase-messaging-sw.js';

let serviceWorkerRegistrationPromise = null;

/**
 * Register and return the Firebase Messaging service worker.
 */
async function getMessagingServiceWorker() {
  if (typeof window === 'undefined') {
    throw new Error('Notifications are only available in a browser.');
  }

  if (!('serviceWorker' in navigator)) {
    throw new Error('This browser does not support service workers.');
  }

  if (!window.isSecureContext) {
    throw new Error('Notifications require HTTPS or localhost.');
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

/**
 * Request permission and generate an FCM token.
 * This function does not save the token to Firestore.
 */
export async function enableWebNotifications() {
  try {
    if (typeof window === 'undefined') {
      throw new Error('Notifications are only available in a browser.');
    }

    if (!('Notification' in window)) {
      throw new Error('This browser does not support notifications.');
    }

    if (!('serviceWorker' in navigator)) {
      throw new Error('This browser does not support service workers.');
    }

    if (!window.isSecureContext) {
      throw new Error('Notifications require HTTPS or localhost.');
    }

    let permission = Notification.permission;

    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      if (permission === 'denied') {
        throw new Error(
          'Notifications are blocked. Enable them in your browser site settings.'
        );
      }

      throw new Error('Notification permission was not granted.');
    }

    const registration = await getMessagingServiceWorker();
    const messaging = await getFirebaseMessaging();

    if (!messaging) {
      throw new Error(
        'Firebase Messaging is not supported in this browser.'
      );
    }

    const token = await getToken(messaging, {
      vapidKey: VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      throw new Error(
        'Firebase did not return an FCM token. Check your VAPID key and Firebase configuration.'
      );
    }

    console.info('FCM token generated successfully.');

    return {
      success: true,
      token,
      permission,
    };
  } catch (error) {
    console.error('Could not enable web notifications:', {
      code: error?.code || 'unknown',
      message: error?.message || String(error),
    });

    return {
      success: false,
      error: error?.message || 'Could not enable notifications.',
      code: error?.code || 'unknown',
    };
  }
}

/**
 * Listen for notifications while the website is open and in the foreground.
 *
 * Usage:
 * const unsubscribe = await listenForForegroundNotifications((payload) => {
 *   console.log(payload);
 * });
 */
export async function listenForForegroundNotifications(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('A callback function is required.');
  }

  try {
    const messaging = await getFirebaseMessaging();

    if (!messaging) {
      console.warn(
        'Foreground notifications are unavailable in this browser.'
      );
      return () => {};
    }

    return onMessage(messaging, (payload) => {
      try {
        callback(payload);
      } catch (error) {
        console.error(
          'Foreground notification callback failed:',
          error
        );
      }
    });
  } catch (error) {
    console.error(
      'Could not register foreground notification listener:',
      error
    );

    return () => {};
  }
}

/**
 * Get the current browser notification permission status.
 */
export function getWebNotificationStatus() {
  if (typeof window === 'undefined') {
    return {
      supported: false,
      permission: 'unsupported',
    };
  }

  const supported =
    'Notification' in window &&
    'serviceWorker' in navigator;

  return {
    supported,
    permission: supported
      ? Notification.permission
      : 'unsupported',
  };
}