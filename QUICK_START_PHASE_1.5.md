# Phase 1.5 PWA - Quick Start Guide (Remaining 40%)

## What's Done ✅ (60%)
- Backend services: device_service.py, push_service.py
- API v1 endpoints: 8 new routes for mobile
- Service Worker: Complete with offline support
- Web App Manifest: Full PWA metadata
- React components: PWAInstallPrompt, OfflineIndicator
- React hook: usePWA for device management
- Updated: index.html with manifest and SW registration

## What's Left ⏳ (40%)

### Step 1: Create App Icons (30 minutes)
Create these files in `frontend/public/icons/`:
```
icon-72.png, icon-96.png, icon-128.png, icon-144.png, icon-152.png,
icon-180.png, icon-192.png, icon-384.png, icon-512.png,
icon-maskable-192.png, icon-maskable-512.png
```

**Quick tool:** Use https://www.favicon-generator.org/ or ImageMagick:
```bash
convert original-icon.png -resize 192x192 frontend/public/icons/icon-192.png
```

### Step 2: Integrate into Layout (20 minutes)
Add to your main layout/AppShell:
```tsx
import PWAInstallPrompt from './components/mobile/PWAInstallPrompt';
import OfflineIndicator from './components/mobile/OfflineIndicator';

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

### Step 3: Update AuthContext (30 minutes)
In `frontend/src/contexts/AuthContext.tsx`:
```tsx
import usePWA from '../hooks/usePWA';

// Inside AuthProvider:
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
      await pwa.getDevices();
    })();
  }
}, [user, pwa]);
```

### Step 4: Setup Firebase (30 minutes)
1. Go to https://console.firebase.google.com
2. Create project → Enable Cloud Messaging
3. Download credentials JSON
4. Add to `.env.local`:
```env
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_VAPID_KEY=your-vapid-key
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key (replace \n with actual newlines)
FIREBASE_CLIENT_EMAIL=your-email@firebase.iam.gserviceaccount.com
```

5. Initialize Firebase in your main app:
```tsx
import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging';

const firebaseConfig = {
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  // ... other config
};

initializeApp(firebaseConfig);
if ('serviceWorker' in navigator) {
  getMessaging(); // Initialize messaging
}
```

### Step 5: Install Dependencies (5 minutes)
```bash
cd frontend
npm install firebase

# Optional (for swipe gestures):
npm install @use-gesture/react
```

### Step 6: Test Everything (1 hour)
```bash
# Start dev server
npm run dev

# Test Service Worker:
1. Open DevTools → Application → Service Workers
2. Verify service-worker.js is registered
3. Check "Offline" and verify app works

# Test PWA Installation (mobile):
1. Open on iPhone Safari → Share → Add to Home Screen
2. Open on Android Chrome → Menu → Install app
3. Tap the app icon to open in standalone mode

# Test Device Registration:
curl -X GET http://localhost:8000/api/v1/auth/register-device \
  -H "Authorization: Bearer {your-token}"
```

### Step 7: Database Indexes (5 minutes)
In MongoDB CLI:
```javascript
db.devices.createIndex({ "user_id": 1 });
db.devices.createIndex({ "push_token": 1 });
db.devices.createIndex({ "expires_at": 1 });
db.devices.createIndex({ "last_seen": 1 });
```

## Total Time to Complete: ~2-3 hours

## Verify Everything Works

### Checklist
- [ ] Icons display correctly in manifest
- [ ] Service Worker registers without errors
- [ ] App works offline with cached data
- [ ] PWA install prompt shows on mobile
- [ ] Device registers after login
- [ ] Push notification permission requested
- [ ] Offline indicator shows when offline
- [ ] DevTools shows green Service Worker status

## Common Issues & Fixes

### "Service Worker not registering"
```
❌ Check:
  - Is it HTTPS or localhost?
  - Are static assets cached?
  - Check browser console for errors

✅ Fix:
  - Clear cache and refresh hard (Cmd+Shift+R)
  - Restart dev server
  - Check manifest MIME type is application/json
```

### "FCM token not obtained"
```
❌ Check:
  - Firebase not initialized?
  - Notification permission denied?
  - Invalid VAPID key?

✅ Fix:
  - Verify Firebase config in .env
  - Check browser console for Firebase errors
  - Request notification permission again
  - Verify VAPID key is correct
```

### "Device not registered"
```
❌ Check:
  - API endpoint not working?
  - JWT token invalid?
  - Network error?

✅ Fix:
  - Test endpoint directly: curl /api/v1/auth/register-device
  - Verify Authorization header sent
  - Check backend logs
  - Verify MongoDB connection
```

## Performance Targets

After completion, aim for:
- ✅ Service Worker cache hit rate > 80%
- ✅ Offline functionality 100% of read operations
- ✅ Lighthouse PWA score > 90
- ✅ First load < 3 seconds
- ✅ Offline load < 1 second

## Lighthouse PWA Audit

After completing Phase 1.5:
```bash
# Run Lighthouse in Chrome DevTools:
1. DevTools → Lighthouse
2. Select "Progressive Web App"
3. Analyze
4. Target score: 90+
```

## Questions?

Refer to:
- `PHASE_1.5_PWA_INTEGRATION.md` - Detailed integration guide
- `PHASE_1.5_IMPLEMENTATION_SUMMARY.md` - Full implementation overview
- Code comments in created files

## Ready for Phase 1.6?

Once Phase 1.5 is deployed and tested:
→ Proceed to **Phase 1.6 (Two Factor Authentication)**
   - TOTP codes (Google Authenticator)
   - Email OTP fallback
   - Backup codes
   - 30-day device trust (uses Phase 1.5 infrastructure!)

---

**Estimated Time to Deploy Phase 1.5:** 2-3 weeks from now
**Then Begin Phase 1.6:** Week 20
**Then Begin Phase 1.7:** Week 24 (WebSocket real-time messaging)
