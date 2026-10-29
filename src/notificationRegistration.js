// src/notificationRegistration.js

import { auth, db } from './firebase';

import {
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { enableWebNotifications } from './notifications';

/**
 * Detect the current browser/device platform.
 */
function detectPlatform() {
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || '';

  // Prefer the browser's platform information when available.
  if (/Windows/i.test(platform)) return 'windows';
  if (/macOS|Macintosh|Mac OS X/i.test(platform)) return 'macos';
  if (/Android/i.test(platform)) return 'android';
  if (/iOS/i.test(platform)) return 'ios';
  if (/Linux/i.test(platform)) return 'linux';

  // Fallback for browsers without User-Agent Client Hints.
  if (/Android/i.test(ua)) return 'android';

  // iPadOS may report itself as Macintosh.
  if (
    /iPad/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  ) {
    return 'ios';
  }

  if (/iPhone|iPod/i.test(ua)) return 'ios';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
  if (/Linux/i.test(ua)) return 'linux';

  return 'other';
}

/**
 * Get a persistent ID for this browser installation.
 */
function getNotificationDeviceId() {
  const storageKey = 'notificationDeviceId';

  let deviceId = localStorage.getItem(storageKey);

  if (!deviceId) {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      deviceId = crypto.randomUUID();
    } else {
      deviceId =
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    localStorage.setItem(storageKey, deviceId);
  }

  return deviceId;
}

/**
 * Enable notifications and save this device's FCM token to Firestore.
 *
 * Firestore path:
 * users/{uid}/notificationDevices/{deviceId}
 */
export async function registerAndSaveNotificationDevice() {
  try {
    if (typeof window === 'undefined') {
      throw new Error('This action must run in a browser.');
    }

    const user = auth.currentUser;

    if (!user) {
      throw new Error(
        'Please sign in before registering this notification device.'
      );
    }

    const result = await enableWebNotifications();

    if (!result.success || !result.token) {
      throw new Error(
        result.error || 'Firebase did not generate an FCM token.'
      );
    }

    const deviceId = getNotificationDeviceId();

    const deviceRef = doc(
      collection(
        db,
        'users',
        user.uid,
        'notificationDevices'
      ),
      deviceId
    );

    const existingSnapshot = await getDoc(deviceRef);

    const deviceData = {
      token: result.token,
      platform: detectPlatform(),
      userAgent: navigator.userAgent || '',
      enabled: true,
      updatedAt: serverTimestamp(),
    };

    if (!existingSnapshot.exists()) {
      deviceData.createdAt = serverTimestamp();
    }

    await setDoc(deviceRef, deviceData, { merge: true });

    // Verify that the token was written successfully.
    const savedSnapshot = await getDoc(deviceRef);

    if (
      !savedSnapshot.exists() ||
      savedSnapshot.data().token !== result.token
    ) {
      throw new Error(
        'The notification token could not be verified in Firestore.'
      );
    }

    console.info(
      'Notification device saved successfully:',
      deviceRef.path
    );

    return {
      success: true,
      message: 'Notifications enabled and this device registered successfully.',
    };
  } catch (error) {
    console.error('Notification device registration failed:', {
      code: error?.code || 'unknown',
      message: error?.message || String(error),
    });

    return {
      success: false,
      error: `${error?.code || 'error'}: ${
        error?.message || 'Could not register this device.'
      }`,
    };
  }
}