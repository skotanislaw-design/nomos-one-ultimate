# Phase 1.5 - Data Flow & Component Integration

Τι συμβαίνει όταν κάθε δράση εκτελείται στην εφαρμογή.

---

## 1. Flow: Χρήστης κάνει Login

```
┌─────────────────┐
│ User enters     │
│ email/password  │
└────────┬────────┘
         │
         ▼
    ┌─────────────────────────────────────┐
    │ LoginPage.tsx                       │
    │ - Καλεί authApi.login()             │
    └────────┬────────────────────────────┘
             │
             ▼
    ┌─────────────────────────────────────┐
    │ AuthContext.tsx                     │
    │ - login() function executes         │
    │ - Saves JWT to localStorage         │
    │ - Sets user state                   │
    └────────┬────────────────────────────┘
             │
             ▼
    ┌─────────────────────────────────────┐
    │ AuthContext useEffect triggers      │
    │ (user && token changed)             │
    └────────┬────────────────────────────┘
             │
             ├──▶ Notification.requestPermission()
             │    (ζητάει συναίνεση για notifications)
             │
             ├──▶ getFCMToken() [Firebase]
             │    (παίρνει FCM token)
             │
             └──▶ axios.post('/api/v1/auth/register-device')
                  │
                  ▼
         ┌──────────────────────────────┐
         │ Backend: server.py           │
         │ /api/v1/auth/register-device │
         │ endpoint executes            │
         └────────┬─────────────────────┘
                  │
                  ▼
         ┌──────────────────────────────┐
         │ device_service.py            │
         │ register_device()            │
         └────────┬─────────────────────┘
                  │
                  ▼
         ┌──────────────────────────────┐
         │ MongoDB: db.devices          │
         │ Inserts: {                   │
         │   _id: device_id,            │
         │   user_id,                   │
         │   device_name,               │
         │   device_type,               │
         │   push_token,                │
         │   app_version,               │
         │   trusted: false,            │
         │   expires_at: +90 days       │
         │ }                            │
         └──────────────────────────────┘
         
SUCCESS: Device registered ✓
```

---

## 2. Flow: Service Worker Caches Data (Offline Support)

```
User loads app
         │
         ▼
┌─────────────────────────────────────┐
│ Browser requests page               │
│ GET /                               │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Service Worker (service-worker.js)  │
│ Fetch event listener triggers       │
└────────┬────────────────────────────┘
         │
         ├─── Is GET request? ──────┐
         │    YES                   │ NO
         │                          ▼
         │              Network only (no cache)
         │
         ▼
   ┌────────────────────────┐
   │ Check URL type:        │
   │ - Static asset?        │
   │ - API call?            │
   │ - Page request?        │
   └──┬──────┬──────┬───────┘
      │      │      │
      ▼      ▼      ▼
   CACHE  NETWORK NETWORK
   FIRST  FIRST    FIRST
     │      │        │
     ▼      ▼        ▼
   ┌─────────────────────────────┐
   │ 1. Try to get from cache    │
   │ 2. If not found, fetch      │
   │ 3. Cache response           │
   │ 4. Return to browser        │
   └─────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ Browser renders page                │
│ (with cached assets & data)         │
└─────────────────────────────────────┘
```

**Πώς κάνει cache:**

```
Service Worker Install Event
           │
           ▼
┌─────────────────────────────────┐
│ Static assets to cache:         │
│ - /index.html                   │
│ - /style.css                    │
│ - /app.js                       │
│ - /favicon.svg                  │
│ - /manifest.json                │
│ - /icons/icon-*.png             │
└────────┬────────────────────────┘
         │
         ▼
caches.open('nomos-static-v1.0.0')
         │
         ▼
cache.addAll([...STATIC_ASSETS])
         │
         ▼
✓ All cached in browser storage
```

---

## 3. Flow: App Goes Offline

```
User is using app
         │
         ▼
Network connection drops
         │
         ▼
┌──────────────────────────────────────┐
│ Browser fires 'offline' event        │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ OfflineIndicator.tsx detects         │
│ navigator.onLine === false           │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ OfflineIndicator renders:            │
│ - Red banner: "You're offline"       │
│ - Pending operations count           │
│ - "Using cached data" message        │
└──────────────────────────────────────┘

When user tries to:

POST /api/messages (send message)
         │
         ▼
Service Worker intercepts
         │
         ▼
Network call fails (no connection)
         │
         ▼
Queue to IndexedDB:
{
  id: "msg_123",
  type: "message",
  data: {...},
  timestamp: now()
}
         │
         ▼
OfflineIndicator updates:
"1 pending message"
         │
         ▼
User sees yellow badge with count
```

---

## 4. Flow: Connection Restored

```
Network returns
         │
         ▼
┌──────────────────────────────────┐
│ Browser fires 'online' event     │
└────────┬───────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ OfflineIndicator detects         │
│ navigator.onLine === true        │
└────────┬───────────────────────┘
         │
         ▼
Trigger sync:
syncPendingOperations()
         │
         ├──▶ Get from IndexedDB
         │
         ├──▶ For each operation:
         │    POST /api/messages
         │    POST /api/cases/{id}
         │    POST /api/notes
         │
         └──▶ Delete from IndexedDB
             on success
         │
         ▼
┌──────────────────────────────────┐
│ OfflineIndicator updates:        │
│ - Green banner: "Syncing..."     │
│ - Progress indicator             │
└────────┬───────────────────────┘
         │
         ▼
All pending operations sent
         │
         ▼
┌──────────────────────────────────┐
│ OfflineIndicator clears:         │
│ - No more "offline" banner       │
│ - Returns to normal state        │
└──────────────────────────────────┘
```

---

## 5. Flow: Push Notification Arrives

```
Backend sends push notification:

push_service.send_push_notification(
  device_id="uuid",
  title="Case updated",
  body="Υπόθεση A123 has new document"
)
         │
         ▼
┌──────────────────────────────────┐
│ push_service.py                  │
│ 1. Gets device from db.devices   │
│ 2. Gets push_token from device   │
│ 3. Calls Firebase API             │
└────────┬───────────────────────┘
         │
         ▼
Firebase Cloud Messaging (FCM)
         │
         ├─── App is OPEN
         │    │
         │    ▼
         │    onMessage listener fires
         │    (firebase.ts)
         │    │
         │    ▼
         │    Shows in-app notification
         │    with custom styling
         │
         └─── App is CLOSED
              │
              ▼
              Service Worker receives
              'push' event
              │
              ▼
              ┌─────────────────────────┐
              │ self.addEventListener   │
              │ ('push', event => {})   │
              └────────┬────────────────┘
                       │
                       ▼
              registration.showNotification(
                title="Case updated",
                body="...",
                icon="/icons/icon-192.png"
              )
                       │
                       ▼
              ┌─────────────────────────┐
              │ OS-level notification   │
              │ (outside the app)       │
              └────────┬────────────────┘
                       │
                       ▼
              User sees notification
              in notification center
                       │
              User clicks notification
                       │
                       ▼
              ┌─────────────────────────┐
              │ notificationclick event │
              │ in service worker       │
              └────────┬────────────────┘
                       │
                       ▼
              clients.openWindow('/')
              or navigate to payload.data.path
                       │
                       ▼
              App opens and shows
              relevant page
```

---

## 6. Flow: PWA Install Prompt

```
User opens app on mobile
         │
         ▼
┌────────────────────────────────────┐
│ Browser fires 'beforeinstallprompt' │
│ (only on PWA-capable browsers)      │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│ PWAInstallPrompt.tsx detects event │
│ - Stores deferredPrompt            │
│ - Checks browser capability        │
│ - Sets showPrompt = true           │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│ Renders install button:            │
│ "Install Nomos One"                │
│ + Download icon                    │
│ + X (dismiss)                      │
└────────┬───────────────────────────┘
         │
         User clicks "Install"
         │
         ▼
┌────────────────────────────────────┐
│ deferredPrompt.prompt()            │
│ (shows native install dialog)      │
└────────┬───────────────────────────┘
         │
    ┌────┴────┐
    │ YES     │ NO (dismissed)
    │         │
    ▼         ▼
┌──────┐   Track in analytics
│INSTALL
│successful
└────┬──────┐
     │      │
     ▼      ▼
  Browser installs app:
  - Adds to home screen
  - Installs as app
  - Icon appears
  - Can launch standalone
     │
     ▼
App opens in
standalone mode
(no browser UI)
     │
     ▼
Service Worker active
Offline support enabled
Push ready
```

---

## 7. Flow: Device Trust (για Phase 1.6 - 2FA)

```
User logs in with 2FA
         │
         ▼
Successfully verified 2FA code
         │
         ▼
┌────────────────────────────────┐
│ Show "Trust this device?"       │
│ checkbox in login screen       │
└────────┬───────────────────────┘
         │
    User checks box
         │
         ▼
    POST /api/v1/auth/register-device/{device_id}/trust
         │
         ▼
┌────────────────────────────────┐
│ device_service.trust_device()  │
└────────┬───────────────────────┘
         │
         ▼
MongoDB update:
db.devices.updateOne({
  _id: device_id
}, {
  $set: {
    trusted: true,
    trust_expires_at: now + 30 days
  }
})
         │
         ▼
For next 30 days:
When user logs in from same device
         │
         ├──▶ Skip 2FA
         │    (device is trusted)
         │
         └──▶ 2FA not required
              Go straight to dashboard
             
After 30 days:
Trust expires
         │
         ▼
Next login requires 2FA again
```

---

## 8. Complete App Architecture Integration

```
┌─────────────────────────────────────────────────────────┐
│                    USER INTERFACE                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  LoginPage.tsx ──▶ AuthContext ──▶ AppShell.tsx        │
│       │                │               │                │
│       │                │               ├▶ PWAInstallPrompt
│       │                │               ├▶ OfflineIndicator
│       │                │               └▶ Routes...     │
│       │                │                                │
│       └────────────────┴────────────────────────────────┘
│                        │
│                        ▼ (device registration)
│                   usePWA hook
│                        │
│                        ├──▶ requestPermission()
│                        ├──▶ getFCMToken()
│                        └──▶ registerDevice()
│
├─────────────────────────────────────────────────────────┤
│               SERVICE WORKER LAYER                      │
├─────────────────────────────────────────────────────────┤
│  (service-worker.js)                                   │
│  - Intercepts all requests                             │
│  - Caches static assets                                │
│  - Network-first for API                               │
│  - Handles push notifications                          │
│  - Background sync                                     │
│                                                         │
├─────────────────────────────────────────────────────────┤
│            FIREBASE LAYER (optional)                    │
├─────────────────────────────────────────────────────────┤
│  (firebase.ts)                                          │
│  - Initialize messaging                                │
│  - Get FCM tokens                                      │
│  - Handle foreground messages                          │
│  - Graceful fallback if Firebase unavailable           │
│                                                         │
├─────────────────────────────────────────────────────────┤
│              BROWSER STORAGE                            │
├─────────────────────────────────────────────────────────┤
│  - localStorage: JWT token, device ID, push token      │
│  - sessionStorage: temp data                           │
│  - IndexedDB: offline operations queue                 │
│  - Cache API: HTTP responses                           │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                  NETWORK LAYER                          │
├─────────────────────────────────────────────────────────┤
│  HTTPS requests to backend                             │
│       │                                                 │
│       ├──▶ POST /api/auth/login                        │
│       ├──▶ POST /api/v1/auth/register-device           │
│       ├──▶ GET /api/v1/cases/sync                      │
│       ├──▶ POST /api/messages                          │
│       └──▶ ... (all other endpoints)                   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│               BACKEND (Python/FastAPI)                  │
├─────────────────────────────────────────────────────────┤
│  server.py                                             │
│  ├──▶ Authentication endpoints                         │
│  ├──▶ v1 API routes                                    │
│  │                                                     │
│  ├──▶ device_service.py                                │
│  │    - register_device()                              │
│  │    - trust_device()                                 │
│  │    - cleanup_inactive_devices()                     │
│  │                                                     │
│  └──▶ push_service.py                                  │
│       - send_push_notification()                       │
│       - send_bulk_notifications()                      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│              EXTERNAL SERVICES                          │
├─────────────────────────────────────────────────────────┤
│  Firebase Cloud Messaging                              │
│       │                                                 │
│       ├──▶ Receives push requests                       │
│       ├──▶ Sends to device FCM tokens                   │
│       └──▶ Delivers notifications                      │
│                                                         │
│  MongoDB                                               │
│       │                                                 │
│       ├──▶ db.devices                                  │
│       ├──▶ db.users                                    │
│       ├──▶ db.cases                                    │
│       └──▶ db.messages, etc.                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Data Flow Summary

```
LOGIN
  ├─ User email/password
  ├─ AuthContext processes
  ├─ Device registers
  ├─ FCM token obtained
  └─ Device stored in MongoDB

OFFLINE
  ├─ SW caches everything
  ├─ IndexedDB queues operations
  ├─ OfflineIndicator shows status
  └─ User works with cached data

BACK ONLINE
  ├─ Browser fires 'online' event
  ├─ IndexedDB operations replay
  ├─ API calls succeed
  └─ OfflineIndicator clears

PUSH NOTIFICATION
  ├─ Backend sends to Firebase
  ├─ Firebase sends to device
  ├─ SW shows notification (app closed)
  ├─ In-app notification (app open)
  └─ User clicks → navigates

PWA INSTALL
  ├─ beforeinstallprompt event
  ├─ User clicks install button
  ├─ App added to home screen
  └─ Standalone mode enabled
```

---

## Key Integration Points

### 1. **AuthContext → device_service**
```
Login successful
    ↓
User state updated
    ↓
useEffect triggers
    ↓
device_service.registerDevice()
    ↓
Device stored in MongoDB
```

### 2. **Service Worker → Cache API**
```
App requests /api/cases
    ↓
Service Worker intercepts
    ↓
Checks strategy (network-first)
    ↓
Fetches from server
    ↓
Stores in Cache API
    ↓
Returns to app
```

### 3. **Firebase → Service Worker**
```
Push notification arrives
    ↓
Service Worker 'push' event
    ↓
Notification API shows notification
    ↓
User clicks notification
    ↓
App opens to relevant page
```

### 4. **OfflineIndicator → IndexedDB**
```
User goes offline
    ↓
POST request fails
    ↓
IndexedDB stores operation
    ↓
OfflineIndicator shows count
    ↓
User comes online
    ↓
Operations replay from IndexedDB
```

---

## Testing the Integration

```bash
# 1. Start backend
cd backend
python -m uvicorn server:app --reload

# 2. Start frontend
cd frontend
npm run dev

# 3. Open http://localhost:5173

# 4. Login with test credentials

# 5. Check browser console:
#    - [Auth] Device registered ✓
#    - [Firebase] Initialized ✓
#    - Service Worker registered ✓

# 6. DevTools → Application → Service Workers
#    - Should show "service-worker.js" active

# 7. Go offline (DevTools → Network → Offline)
#    - App should still work
#    - OfflineIndicator should show

# 8. Go online
#    - IndexedDB operations replay
#    - Sync completes
```

---

## Conclusion

Όλα τα κομμάτια συνδέονται μέσω:

1. **Events** (online/offline, login, beforeinstallprompt)
2. **Shared State** (localStorage, IndexedDB, MongoDB)
3. **Service Worker** (network interception)
4. **Hooks & Context** (React state management)
5. **API Endpoints** (backend communication)

Το αποτέλεσμα είναι μια **seamless PWA experience** που λειτουργεί online, offline, και με push notifications! 🚀
