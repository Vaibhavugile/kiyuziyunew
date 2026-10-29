
/* public/firebase-messaging-sw.js */

importScripts(
  'https://www.gstatic.com/firebasejs/12.1.0/firebase-app-compat.js'
);
importScripts(
  'https://www.gstatic.com/firebasejs/12.1.0/firebase-messaging-compat.js'
);

firebase.initializeApp({
  apiKey: 'AIzaSyBrxx_BAmHnqKciFqh9E_3Yu6ziRzANnYQ',
  authDomain: 'jewellerywholesale-2e57c.firebaseapp.com',
  projectId: 'jewellerywholesale-2e57c',
  storageBucket: 'jewellerywholesale-2e57c.firebasestorage.app',
  messagingSenderId: '440314889833',
  appId: '1:440314889833:web:73c417a87cad4168fe84f8',
  measurementId: 'G-5JSNGTJPPE'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title =
    payload.data?.title ||
    payload.notification?.title ||
    'JewelleryWholesale';

  const options = {
    body:
      payload.data?.body ||
      payload.notification?.body ||
      'You have a new notification.',
    icon: '/favicon.ico',
    data: {
      url: payload.data?.url || '/'
    }
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || '/',
    self.location.origin
  );

  // Only open URLs on this website.
  if (targetUrl.origin !== self.location.origin) return;

  event.waitUntil(
    clients.openWindow(targetUrl.href)
  );
});
