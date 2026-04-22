# Phase 1.5 - PWA Implementation Integration Guide

## Overview
Phase 1.5 (PWA/Mobile) implementation is **60% complete**. The following components have been created and are ready for integration.

## Completed Components

### Backend (100% Complete)

#### 1. Device Service (`backend/device_service.py`)
- Device registration and tracking
- Device trust management (30-day trust period)
- Automatic cleanup of inactive devices (90 days)
- Push token management

**Key Methods:**
```python
await device_service.register_device(user_id, device_name, device_type, push_token, app_version, user_agent)
await device_service.trust_device(device_id, user_id)
await device_service.is_device_trusted(device_id, user_id)
```

#### 2. Push Service (`backend/push_service.py`)
- Firebase Cloud Messaging integration
- Single device notifications
- Bulk notifications to case participants
- Graceful fallback when Firebase unavailable

**Key Methods:**
```python
await push_service.send_push_notification(device_id, title, body, data)
await push_service.send_bulk_notifications(case_id, event_type, title, body)
```

#### 3. API v1 Endpoints (in `backend/server.py`)
All device management endpoints integrated:
- `POST /api/v1/auth/register-device` - Register device
- `GET /api/v1/auth/register-device` - List user's devices
- `POST /api/v1/auth/register-device/{device_id}/trust` - Trust device
- `DELETE /api/v1/auth/register-device/{device_id}` - Unregister device
- `GET /api/v1/cases/sync` - Delta sync (efficient mobile updates)
- `POST /api/v1/auth/logout` - Logout device
- `GET /api/v1/auth/me` - Get user info (v1 with devices)
- `GET /api/v1/health` - Health check
- `GET /api/v1/config/app` - App configuration

### Frontend (80% Complete)

#### 1. Service Worker (`frontend/public/service-worker.js`)
- Cache strategies (cache-first for static assets, network-first for API)
- Offline support with fallback responses
- Push notification handling
- Background sync for offline actions

#### 2. Web App Manifest (`frontend/public/manifest.json`)
- App metadata (name, icons, colors)
- Installation shortcuts
- Protocol handlers
- Responsive design breakpoints

#### 3. React Components
- `PWAInstallPrompt.tsx` - Prompts users to install app
- `OfflineIndicator.tsx` - Shows offline status and pending operations

#### 4. PWA Hook (`frontend/src/hooks/usePWA.ts`)
Provides PWA functionality:
- Device registration
- Network status detection
- Push notification management
- Data syncing

#### 5. Updated HTML (`frontend/index.html`)
- Manifest link
- Theme color
- PWA meta tags
- Service Worker registration script

## Remaining Tasks (40%)

### Task 1: Integrate PWA Components into AppShell/Layout
**File:** `frontend/src/components/layout/AppShell.tsx` or main layout file

```tsx
import PWAInstallPrompt from '../mobile/PWAInstallPrompt';
import OfflineIndicator from '../mobile/OfflineIndicator';

export function AppShell() {
  return (
    <>
      <OfflineIndicator />
      <PWAInstallPrompt />
      {/* Rest of app */}
    </>
  );
}
```

### Task 2: Update AuthContext with Device Registration
**File:** `frontend/src/contexts/AuthContext.tsx`

Add device registration after successful login:

```tsx
import { usePWA } from '../hooks/usePWA';

export function AuthProvider() {
  const pwa = usePWA();

  useEffect(() => {
    if (user) {
      // Register device after login
      (async () => {
        const hasPermission = await pwa.requestNotificationPermission();
        if (hasPermission) {
          const token = await pwa.getFCMToken();
          if (token) {
            await pwa.registerDevice(token);
          }
        }

        // Fetch user's devices
        await pwa.getDevices();
      })();
    }
  }, [user]);
}
```

### Task 3: Create Icons
**Directory:** `frontend/public/icons/`

Required icon sizes:
- `icon-72.png` (72x72)
- `icon-96.png` (96x96)
- `icon-128.png` (128x128)
- `icon-144.png` (144x144)
- `icon-152.png` (152x152)
- `icon-180.png` (180x180 - for iOS)
- `icon-192.png` (192x192)
- `icon-384.png` (384x384)
- `icon-512.png` (512x512)
- `icon-maskable-192.png` (maskable for Android)
- `icon-maskable-512.png` (maskable for Android)
- Screenshots for app stores

### Task 4: Add Mobile UX Improvements

#### A. Swipe Gestures for Sidebar
```tsx
import { useGesture } from '@use-gesture/react';

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);

  const bind = useGesture({
    onSwipe: ({ direction }) => {
      if (direction[0] === -1) setIsOpen(false); // Swipe left
      if (direction[0] === 1) setIsOpen(true);   // Swipe right
    }
  });

  return <div {...bind()}>{/* Sidebar content */}</div>;
}
```

**Installation:**
```bash
npm install @use-gesture/react
```

#### B. Bottom Action Bar (Mobile Only)
```tsx
export function ActionBar() {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex gap-2 md:hidden">
      {/* Action buttons for mobile */}
    </div>
  );
}
```

#### C. Haptic Feedback
```tsx
function handleAction() {
  if ('vibrate' in navigator) {
    navigator.vibrate(50); // 50ms vibration
  }
  // Perform action
}
```

### Task 5: Setup Firebase Cloud Messaging

1. **Create Firebase Project:**
   - Go to Firebase Console (https://console.firebase.google.com)
   - Create new project or use existing
   - Enable Cloud Messaging

2. **Get Credentials:**
   - Project ID
   - VAPID Key (for Web Push)
   - Private Key
   - Client Email

3. **Update Environment Variables:**
   ```env
   REACT_APP_FIREBASE_PROJECT_ID=your-project-id
   REACT_APP_FIREBASE_VAPID_KEY=your-vapid-key
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_PRIVATE_KEY=your-private-key
   FIREBASE_CLIENT_EMAIL=your-client-email
   ```

4. **Initialize Firebase in App:**
   ```tsx
   import { initializeApp } from 'firebase/app';
   import { getMessaging } from 'firebase/messaging';

   const firebaseConfig = {
     projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
     // ... other config
   };

   const app = initializeApp(firebaseConfig);
   const messaging = getMessaging(app);
   ```

### Task 6: Setup MongoDB Indexes for Devices

```javascript
// In MongoDB, create these indexes for performance:
db.devices.createIndex({ "user_id": 1 });
db.devices.createIndex({ "push_token": 1 });
db.devices.createIndex({ "expires_at": 1 });
db.devices.createIndex({ "last_seen": 1 });
```

### Task 7: Add Offline Sync Setup

Create IndexedDB helper for offline operations:

```tsx
// frontend/src/lib/offlineStorage.ts
export async function storeOfflineOperation(operation: OfflineOperation) {
  const db = await openOfflineDB();
  const tx = db.transaction('updates', 'readwrite');
  await tx.objectStore('updates').add(operation);
}
```

### Task 8: Testing

#### PWA Installation Testing:
```bash
# Test on mobile Safari (iOS):
1. Open app in Safari
2. Tap Share → Add to Home Screen
3. Verify app opens in standalone mode

# Test on Android Chrome:
1. Open app in Chrome
2. Tap menu → Install app
3. Verify app opens in standalone mode
```

#### Service Worker Testing:
```bash
# Enable offline mode in DevTools:
1. Open DevTools → Application → Service Workers
2. Check "Offline" checkbox
3. Verify app still works with cached data
```

#### Device Registration Testing:
```bash
# Test device registration:
curl -X POST http://localhost:8000/api/v1/auth/register-device \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "device_name": "Test Device",
    "device_type": "web",
    "push_token": "test_fcm_token",
    "app_version": "1.0.0"
  }'
```

## Implementation Timeline

| Week | Task | Status |
|------|------|--------|
| 1-2 | Backend Services & API v1 | ✅ Complete |
| 3-4 | Service Worker & Manifest | ✅ Complete |
| 5 | React Components & Hooks | ✅ Complete |
| 6 | Integration into AppShell/AuthContext | ⏳ Pending |
| 7 | Icon Creation & Styling | ⏳ Pending |
| 8 | Firebase Setup & Push Notifications | ⏳ Pending |
| 9 | Mobile UX Improvements | ⏳ Pending |
| 10 | Testing & QA | ⏳ Pending |

## Key Design Decisions

### 1. API Versioning
- All new mobile endpoints use `/api/v1/` prefix
- Allows backward compatibility with existing `/api/` routes
- Client specifies version via User-Agent or header

### 2. Delta Sync Strategy
- Only fetch data modified since last sync
- Reduces bandwidth significantly for mobile
- Timestamp-based filtering on backend

### 3. Device Trust System
- 30-day trust period after 2FA
- Reduces friction for authenticated users
- Allows revoking trust individually

### 4. Graceful Degradation
- Service Worker provides offline fallback
- WebSocket (Phase 1.7) will have REST fallback
- Push notifications optional, not blocking

## Security Considerations

### 1. Service Worker
- Only caches GET requests
- Never caches credentials
- POST/PUT/DELETE always go to network
- Validates responses before caching

### 2. Device Tokens
- Pushed to backend via HTTPS only
- Stored encrypted if possible
- Cleaned up after 90 days of inactivity
- Can be revoked anytime

### 3. Offline Storage
- Uses IndexedDB with origin isolation
- No sensitive data stored offline
- Encrypted sync when coming online

## Monitoring & Metrics

Add monitoring for:
1. Service Worker cache hit rate
2. Device registration success rate
3. Push notification delivery success
4. Offline usage duration
5. App installation count (via analytics)

## Next Steps After Phase 1.5

Once PWA is deployed and stable:
1. Monitor installation metrics
2. Gather user feedback on mobile experience
3. Collect performance metrics
4. Plan Phase 1.6 (2FA) implementation
5. Plan Phase 1.7 (WebSocket) implementation

## Support & Troubleshooting

### Service Worker Not Registering
- Check browser console for errors
- Verify manifest.json is served with correct MIME type
- Check CORS headers
- Ensure HTTPS (or localhost for development)

### Push Notifications Not Working
- Verify Firebase credentials
- Check notification permission granted
- Verify FCM token obtained
- Check browser supports Web Push API

### Offline Features Not Working
- Verify Service Worker is active
- Check that site is on HTTPS
- Clear cache and reinstall
- Test with DevTools offline mode

---

**Last Updated:** April 17, 2024
**Phase Status:** 60% Complete
**Next Major Milestone:** Phase 1.6 (2FA) - Starting Week 20
