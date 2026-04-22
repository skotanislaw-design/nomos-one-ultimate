# Firebase Cloud Messaging Setup Guide

Complete this guide to enable push notifications for Phase 1.5 PWA.

## Step 1: Create Firebase Project

### 1.1 Go to Firebase Console
1. Visit https://console.firebase.google.com
2. Click "Create a project" or select existing project
3. Enter project name: `nomos-one` (or your preference)
4. Select region (EU recommended for compliance)
5. Click "Create project"

### 1.2 Enable Cloud Messaging
1. Go to **Project Settings** (gear icon, top left)
2. Click **Cloud Messaging** tab
3. You should see:
   - Server API Key
   - Sender ID
   - (Keep these for later steps)

## Step 2: Get Firebase Credentials

### 2.1 Create Web App
1. In Firebase Console, click **+** next to "Project Overview"
2. Select **Web** icon
3. Enter app name: `Nomos One Web`
4. Check "Also set up Firebase Hosting"
5. Click **Register app**
6. Copy the Firebase config (you'll need this)

### 2.2 Get Required Keys

In Project Settings → Cloud Messaging tab, copy:
- `Project ID`
- `Server API Key` (deprecated but still needed for some operations)
- `Sender ID` (used for web push)

In Project Settings → Service Accounts:
1. Click **Generate new private key**
2. A JSON file downloads with:
   - `private_key_id`
   - `private_key`
   - `client_email`
   - `project_id`

## Step 3: Configure Environment Variables

### 3.1 Frontend Configuration
Create `.env.local` in `/frontend/` directory:

```env
# Firebase Web Config
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_API_KEY=your-web-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
REACT_APP_FIREBASE_APP_ID=your-app-id
REACT_APP_FIREBASE_VAPID_KEY=your-vapid-key
REACT_APP_VERSION=1.0.0
```

### 3.2 Backend Configuration
Create or update `.env` in `/backend/` directory:

```env
# Firebase Service Account
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
```

⚠️ **Important**: For `FIREBASE_PRIVATE_KEY`, replace literal `\n` with actual newlines:
```
# Wrong:
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvQI...\n-----END PRIVATE KEY-----

# Correct:
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvQI...
-----END PRIVATE KEY-----"
```

## Step 4: Generate VAPID Key

### 4.1 Using Firebase CLI (Recommended)

```bash
npm install -g firebase-tools

firebase login

firebase projects:list  # Find your project ID

firebase apps:sdkconfig WEB --project=your-project-id
```

Look for the VAPID key, or generate one:

```bash
# Using Node.js
node -e "const {nanoid} = require('nanoid'); console.log(nanoid(32))"
```

### 4.2 Or Use Web Interface
1. Go to Cloud Messaging tab in Project Settings
2. Scroll to "Web configuration"
3. Click "Generate Key Pair"
4. Copy the public key (VAPID)

## Step 5: Setup Notification Service Worker

The Service Worker at `frontend/public/service-worker.js` handles:
- ✅ Background notifications when app is closed
- ✅ Foreground notifications when app is open
- ✅ Notification click handling
- ✅ Offline support

No additional setup needed - Firebase integration is automatic.

## Step 6: Test Configuration

### 6.1 Start Development Server

```bash
cd frontend
npm install

# .env.local with Firebase config already created above

npm run dev
```

### 6.2 Check Firebase Initialization

Open browser console (F12) and look for:
```
[Firebase] Initialized successfully
```

If you see warnings instead:
```
[Firebase] Firebase not configured. Push notifications disabled.
```

Then your `.env.local` is missing or incorrect.

### 6.3 Request Notification Permission

1. Login to app
2. A permission dialog should appear: "Nomos One wants to show notifications"
3. Click **Allow**
4. Check console for:
```
[Auth] Device registered for push notifications
```

## Step 7: Test Push Notifications

### 7.1 From Firebase Console

1. Go to **Cloud Messaging** in Firebase Console
2. Click **Send your first message**
3. Enter:
   - **Title**: "Test Notification"
   - **Body**: "Nomos One push notifications working!"
4. Click **Send test message**
5. Select your registered user/device
6. Click **Send**

### 7.2 Check Backend

In backend, if device registered correctly, you should see in logs:
```
[device_service] Device registered: <device_id>
```

### 7.3 Verify in App

- If app is **open**: Notification appears in-app with custom styling
- If app is **closed**: Browser notification appears (OS level)
- Click notification: Should focus the app or navigate

## Step 8: Production Deployment

### 8.1 Environment Variables

**Important**: Never commit `.env.local` with secrets!

**For production:**
1. Set environment variables in your hosting platform:
   - Vercel: Project Settings → Environment Variables
   - Heroku: Config Vars
   - Docker: Secrets or config
   - Traditional server: `/etc/nomos/env` or similar

2. Use separate service account for production:
   ```
   firebase projects:create nomos-one-prod
   ```

### 8.2 Update Service Worker

For production HTTPS, Service Worker works automatically.

For your domain, update CORS in Firebase:
1. Firebase Console → Hosting → Custom domain settings
2. Add your domain to allowed origins

### 8.3 Verify Health Endpoint

Test `/api/v1/health` returns correct feature flags:
```bash
curl https://your-api.com/api/v1/health

# Should show:
{
  "status": "ok",
  "features": {
    "push_notifications": true,
    "offline_mode": true
  }
}
```

## Step 9: Monitor & Debug

### 9.1 Check Device Registration

```bash
# Get user's registered devices
curl https://your-api.com/api/v1/auth/register-device \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 9.2 Send Test Notification

```bash
# From backend, send test notification
curl -X POST https://your-api.com/api/v1/push/test \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "device_uuid",
    "title": "Test",
    "body": "Test message"
  }'
```

### 9.3 Common Issues

| Issue | Solution |
|-------|----------|
| "Firebase not configured" | Check .env variables are set |
| Notification permission denied | Clear site data and try again |
| Service Worker not active | Check browser supports (Chrome/Firefox/Safari 16+) |
| Device not registering | Check network tab for 201 response from `/api/v1/auth/register-device` |
| Notification not received | Check device's notification settings (OS and browser) |

## Step 10: Disable Firebase (Optional)

If you don't want to use Firebase:

1. **Frontend**: Just don't set Firebase env variables
   - App works normally without push notifications
   - Service Worker still provides offline support

2. **Backend**: Remove from `push_service.py` initialization
   - Graceful fallback to logging notifications

This is configured to work fine without Firebase!

## Troubleshooting

### Certificate Issue
```
error:self signed certificate
```
For self-signed certs in development:
```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev
```

### VAPID Key Invalid
```
Invalid VAPID key
```
- Ensure key is Base64 encoded
- Check it matches the one registered with Firebase
- Generate new key pair if needed

### Service Worker Not Updating
```bash
# Clear all caches and SW
rm -rf ~/.cache/browsers/
# In DevTools: Application → Clear site data
```

### Push Token Fails
```
Unable to generate push token
```
- Ensure HTTPS (localhost works for dev)
- Check Notification permission is granted
- Try incognito window (no extensions interfering)

## Next Steps

✅ **Phase 1.5 Complete** - PWA with push notifications ready!

→ Proceed to **Phase 1.6** (Two Factor Authentication)
- Uses device trust from Phase 1.5
- Implements TOTP + Email OTP
- Will reduce 2FA friction with device trust

---

**Documentation Version:** 1.0
**Last Updated:** April 17, 2024
**Firebase Admin SDK:** Latest
