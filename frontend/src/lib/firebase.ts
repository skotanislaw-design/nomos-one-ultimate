/**
 * Firebase Cloud Messaging Setup
 * Initialize Firebase and setup push notifications
 */

let messaging: any = null;
let isFirebaseAvailable = false;

/**
 * Initialize Firebase for push notifications
 * Only initializes if Firebase config is available in environment
 */
export async function initializeFirebase() {
  if (isFirebaseAvailable || messaging) {
    return messaging;
  }

  try {
    // Check if Firebase config is available
    const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
    if (!projectId) {
      console.warn('[Firebase] Firebase not configured. Push notifications disabled.');
      return null;
    }

    // Dynamically import Firebase modules
    const { initializeApp } = await import('firebase/app');
    const { getMessaging, onMessage } = await import('firebase/messaging');

    // Firebase config from environment
    const firebaseConfig = {
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
      authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
      storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.REACT_APP_FIREBASE_APP_ID,
    };

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);

    // Setup message handler
    onMessage(messaging, (payload) => {
      console.log('[Firebase] Message received:', payload);

      // Handle foreground message
      if (payload.notification) {
        const notification = new Notification(
          payload.notification.title || 'Nomos One',
          {
            body: payload.notification.body,
            icon: payload.notification.icon || '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: 'nomos-notification',
            data: payload.data
          }
        );

        notification.onclick = () => {
          window.focus();
          notification.close();

          // Navigate to relevant page if data contains path
          if (payload.data?.path) {
            window.location.pathname = payload.data.path;
          }
        };
      }
    });

    isFirebaseAvailable = true;
    console.log('[Firebase] Initialized successfully');
    return messaging;
  } catch (error) {
    console.warn('[Firebase] Initialization failed:', error);
    console.log('[Firebase] Push notifications will use fallback mechanisms');
    return null;
  }
}

/**
 * Get FCM token for device registration
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    if (!messaging) {
      messaging = await initializeFirebase();
    }

    if (!messaging) {
      console.warn('[Firebase] Firebase not available, cannot get token');
      return null;
    }

    const { getToken } = await import('firebase/messaging');

    const vapidKey = process.env.REACT_APP_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.warn('[Firebase] VAPID key not configured');
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey: vapidKey
    });

    console.log('[Firebase] FCM token obtained');
    return token;
  } catch (error) {
    console.error('[Firebase] Failed to get FCM token:', error);
    return null;
  }
}

/**
 * Check if Firebase is available and configured
 */
export function isFirebaseConfigured(): boolean {
  return !!process.env.REACT_APP_FIREBASE_PROJECT_ID;
}

/**
 * Get messaging instance
 */
export function getMessagingInstance() {
  return messaging;
}

/**
 * Setup service worker for Firebase messaging
 * This should be called from main.tsx or index.tsx
 */
export async function setupFirebaseServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[Firebase] Service Worker not available');
    return;
  }

  try {
    // Check if Firebase config exists
    if (!isFirebaseConfigured()) {
      console.log('[Firebase] Firebase not configured, skipping Service Worker setup');
      return;
    }

    // Import the Firebase Service Worker handler
    // This assumes your public/service-worker.js includes Firebase messaging support
    // Or you can use Firebase's provided service worker

    console.log('[Firebase] Service Worker setup for Firebase messaging');
  } catch (error) {
    console.error('[Firebase] Service Worker setup failed:', error);
  }
}

export default {
  initializeFirebase,
  getFCMToken,
  isFirebaseConfigured,
  getMessagingInstance,
  setupFirebaseServiceWorker
};
