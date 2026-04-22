# Φάση 1.7: WebSocket Real-time Messaging - Troubleshooting Guide

## Κοινά Προβλήματα & Λύσεις

### 1. WebSocket Connection Fails Immediately

**Σημπτώματα**:
- Error: `WebSocket connection failed`
- Browser console: `Connection refused` ή `Network error`

**Πιθανές Αιτίες**:
- JWT token expired
- Server not running
- Firewall blocking WebSocket port
- Device ID not provided

**Λύσεις**:

```bash
# 1. Ελέγξτε αν ο server τρέχει
curl http://localhost:8000/api/v1/config/app

# 2. Ελέγξτε αν το JWT token είναι έγκυρο
# Εντάξει tokens περιέχουν:
# - Header: {alg: HS256, typ: JWT}
# - Payload: {sub: user_id, role: ..., exp: timestamp}
# - Expiry: τρέχων timestamp < exp

# 3. Ελέγξτε browser console
console.log(localStorage.getItem('auth_token'));  // Check token exists

# 4. Ελέγχος device ID
console.log(navigator.deviceMemory);  // Should be defined

# 5. Ελέγχος WebSocket URL
// Should be: ws://localhost:8000/ws?token=...&device_id=...
```

**Απαιτούμενα Fix**:
- Refresh JWT token αν έληξε
- Restart server αν crashed
- Check firewall rules για port 8000

---

### 2. Events Not Received from Server

**Σημπτώματα**:
- WebSocket connected ✓
- Άλλοι χρήστες δεν βλέπουν updates
- Typing indicators δεν εμφανίζονται

**Πιθανές Αιτίες**:
- User not in case room
- Access control failure
- Event not broadcasted
- Browser network tab blocking

**Λύσεις**:

```typescript
// 1. Ελέγχος αν χρήστης είναι enrolled στο δωμάτιο
const ws = useWebSocketContext();
ws.joinRoom(caseId);  // Make sure this was called

// 2. Ελέγχος event listeners
const unsubscribe = ws.on('case.updated', (event) => {
  console.log('Received event:', event);
});

// 3. Ελέγχος network tab
// DevTools → Network → WS (WebSocket tab)
// Should show messages being received

// 4. Check server logs
docker logs nomos-one-backend
# Look for: "Broadcasted case.updated to X users"
```

**Fix Checklist**:
- [ ] User has access to case (assigned lawyer/secretary)
- [ ] `ws.joinRoom(caseId)` was called in useEffect
- [ ] Event type is correct (`case.updated`, not `caseUpdated`)
- [ ] Event data structure is valid JSON
- [ ] No JavaScript errors in console

---

### 3. Offline Queue Not Syncing

**Σημπτώματα**:
- Events queued when offline ✓
- Back online, but events not sent
- No error message

**Πιθανές Αιτίες**:
- IndexedDB disabled in browser
- Quota exceeded
- JavaScript error in sync logic
- WebSocket not reconnecting

**Λύσεις**:

```typescript
// 1. Check IndexedDB
// DevTools → Storage → IndexedDB → nomos_offline
// Should see "pending_events" object store

// 2. Check quota
navigator.storage.estimate().then(estimate => {
  console.log(`Used: ${estimate.usage} bytes`);
  console.log(`Quota: ${estimate.quota} bytes`);
});

// 3. Manual sync trigger
const ws = useWebSocketContext();
ws.syncPending();

// 4. Check for errors
useEffect(() => {
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
}, [ws]);

// 5. Monitor queue
useEffect(() => {
  console.log('Queue size:', ws.messageQueue.length);
}, [ws.messageQueue]);
```

**Fix Checklist**:
- [ ] IndexedDB enabled (not in private browsing)
- [ ] Storage quota not exceeded
- [ ] WebSocket reconnects successfully
- [ ] No JavaScript errors
- [ ] Device ID consistent across sessions

---

### 4. High Latency / Slow Event Delivery

**Σημπτώματα**:
- Events arrive after 1+ second
- Typing indicators delayed
- "Synced" message takes too long

**Πιθανές Αιτίες**:
- High server load
- Network latency
- Large event payloads
- Database slow

**Λύσεις**:

```bash
# 1. Check server CPU/Memory
docker stats nomos-one-backend
# Should be <50% CPU, <2GB memory

# 2. Check WebSocket latency
# DevTools → Network → WS tab
# Look at "Time" column - should be <100ms

# 3. Check network ping
ping -c 4 localhost
# Should be <10ms for local network

# 4. Check database performance
# Look at MongoDB logs for slow queries
docker logs nomos-one-mongodb | grep "slow"
```

**Optimization Tips**:
- Reduce event data payload size
- Batch events instead of individual messages
- Increase server CPU/memory allocation
- Add CDN for assets
- Enable compression on WebSocket messages

---

### 5. "Too Many Requests" (429) Error

**Σημπτώματα**:
- Browser console: `Error 429: Too Many Requests`
- WebSocket closes unexpectedly

**Πιθανές Αιτίες**:
- User sending >100 events per 60 seconds
- Rapid typing events
- Accidental event loop

**Λύσεις**:

```typescript
// 1. Check rate limiting
const ws = useWebSocketContext();
let eventCount = 0;
setInterval(() => {
  console.log(`Events/min: ${eventCount}`);
  eventCount = 0;
}, 60000);

ws.on('any', () => eventCount++);

// 2. Add debouncing
import { debounce } from 'lodash';

const sendTyping = debounce((caseId, started) => {
  ws.sendEvent({
    action: 'typing',
    case_id: caseId,
    started
  });
}, 500);

// 3. Batch events
const eventQueue = [];
const flushQueue = async () => {
  if (eventQueue.length === 0) return;
  
  const batch = eventQueue.splice(0, 10);
  for (const event of batch) {
    await ws.sendEvent(event);
    await new Promise(r => setTimeout(r, 100));  // Space them out
  }
};
```

**Fix Checklist**:
- [ ] Add debouncing to typing events (500ms)
- [ ] Batch events instead of sending individually
- [ ] Check for accidental event loops
- [ ] Implement exponential backoff for retries

---

### 6. Typing Indicators Not Working

**Σημπτώματα**:
- Own typing shows as other users
- Typing indicator stuck/won't clear
- "User is typing..." never disappears

**Πιθανές Αιτίες**:
- Timeout not clearing typing state
- Event not sent on unmount
- Filter logic wrong (showing current user)

**Λύσεις**:

```typescript
// 1. Check filter in TypingIndicator
export function TypingIndicator({ caseId, currentUserId }) {
  // Make sure currentUserId is provided
  if (!currentUserId) {
    console.warn('currentUserId not provided to TypingIndicator');
  }

  const unsubTyping = ws.on('user.typing', (event) => {
    // IMPORTANT: Filter out current user
    if (currentUserId && event.user_id === currentUserId) {
      return;  // Don't show yourself
    }
  });
}

// 2. Check timeout cleanup
useEffect(() => {
  return () => {
    // Must stop typing when component unmounts
    if (isTyping) {
      ws.sendEvent({
        action: 'typing',
        case_id: caseId,
        started: false
      });
    }
  };
}, [caseId, isTyping, ws]);

// 3. Check debounce timeout
const typingTimeout = setTimeout(() => {
  setIsTyping(false);
  ws.sendEvent({
    action: 'typing',
    case_id: caseId,
    started: false
  });
}, 1000);
```

**Fix Checklist**:
- [ ] currentUserId properly passed to TypingIndicator
- [ ] Typing "stop" event sent on unmount
- [ ] Timeout set to clear typing after inactivity
- [ ] No event loop (don't spam typing events)

---

### 7. Users Online Sidebar Shows Wrong Users

**Σημπτώματα**:
- Offline users still shown as online
- User count doesn't match
- Users from other cases shown

**Πιθανές Αιτίες**:
- Filtering logic wrong
- Event subscriptions wrong
- State not updated properly

**Λύσεις**:

```typescript
// 1. Check event subscription
export function UsersOnlineSidebar({ caseId, currentUserId }) {
  useEffect(() => {
    const unsubJoined = ws.on('user.joined', (event) => {
      // IMPORTANT: Only add if same case_id
      if (event.case_id !== caseId) return;
      
      setOnlineUsers(prev => {
        const newMap = new Map(prev);
        newMap.set(event.user_id, {
          user_id: event.user_id,
          devices: event.data.devices || []
        });
        return newMap;
      });
    });

    const unsubLeft = ws.on('user.left', (event) => {
      // IMPORTANT: Only remove if same case_id
      if (event.case_id !== caseId) return;
      
      setOnlineUsers(prev => {
        const newMap = new Map(prev);
        newMap.delete(event.user_id);
        return newMap;
      });
    });

    return () => {
      unsubJoined();
      unsubLeft();
    };
  }, [caseId, ws]);

  // 2. Filter out current user from display
  const users = Array.from(onlineUsers.values()).filter(
    user => !currentUserId || user.user_id !== currentUserId
  );
}
```

**Fix Checklist**:
- [ ] Filtering by `case_id` in event handlers
- [ ] Current user filtered from display
- [ ] Event subscriptions cleanup in useEffect return
- [ ] No duplicate state updates

---

### 8. Memory Leak / Tab Getting Slow

**Σημпотомы**:
- Browser tab gets slow over time
- Memory usage increases continuously
- DevTools shows growing heap size

**Πιθανές Αιτίες**:
- WebSocket event listeners not unsubscribed
- State not cleaned up
- Circular references in memory

**Λύσεις**:

```typescript
// 1. Always unsubscribe from events
useEffect(() => {
  const unsubCase = ws.on('case.updated', handleCaseUpdate);
  const unsubNote = ws.on('note.created', handleNoteCreated);
  const unsubTyping = ws.on('user.typing', handleTyping);

  // IMPORTANT: Cleanup subscriptions
  return () => {
    unsubCase();
    unsubNote();
    unsubTyping();
  };
}, [caseId, ws]);

// 2. Check for event listener leaks
// DevTools → Memory → Take heap snapshot
// Look for: "WebSocketContext", "useWebSocket"
// Count should be stable, not growing

// 3. Profile memory growth
// DevTools → Performance → Record
// Look for: Gradual climb = memory leak

// 4. Check browser extensions
// Some extensions intercept WebSocket
// Try incognito mode to test
```

**Fix Checklist**:
- [ ] All `ws.on()` subscriptions have unsubscribe cleanup
- [ ] No circular references between components
- [ ] Event handlers don't capture growing state
- [ ] No excessive re-renders

---

### 9. WebSocket Reconnection Takes Too Long

**Σημпотомы**:
- Loses connection, takes 20+ seconds to reconnect
- Manual refresh needed to reconnect
- Exponential backoff seems too aggressive

**Πιθανές Αιτίες**:
- Max reconnection attempts exceeded (10)
- Exponential backoff delay too high
- Browser network tab shows disconnect

**Λύσεις**:

```typescript
// Check reconnection logic in useWebSocket
const [reconnectAttempt, setReconnectAttempt] = useState(0);

const handleReconnect = async () => {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s max
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 16000);
  
  console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);
  
  setIsReconnecting(true);
  
  setTimeout(() => {
    try {
      connect(token, deviceId);
      setReconnectAttempt(0);  // Reset on success
    } catch (e) {
      if (reconnectAttempt < 10) {
        setReconnectAttempt(prev => prev + 1);
        handleReconnect();  // Try again
      } else {
        console.error('Max reconnection attempts exceeded');
        // Show user message to refresh page
      }
    }
  }, delay);
};

// Monitor reconnection
useEffect(() => {
  if (isReconnecting) {
    const timeout = setTimeout(() => {
      if (!isConnected) {
        console.warn('Reconnection timeout');
      }
    }, 30000);
    return () => clearTimeout(timeout);
  }
}, [isReconnecting, isConnected]);
```

**Fix Checklist**:
- [ ] Max 10 reconnection attempts configured
- [ ] Exponential backoff: 1s, 2s, 4s, 8s, 16s
- [ ] Reconnection clears on success
- [ ] User notified if max attempts exceeded

---

### 10. CORS / Network Security Errors

**Σημпотомы**:
- Browser console: `Cross-Origin Request Blocked`
- WebSocket connection refused
- Access-Control-Allow-Origin error

**Πιθανές Αιτίες**:
- Frontend & backend on different origins
- CORS not configured for WebSocket
- Proxy server blocking WebSocket upgrade

**Λύσεις**:

```python
# Backend: Ensure CORS configured for WebSocket
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://app.example.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# For WebSocket specifically
# Make sure Origin header is validated
```

```typescript
// Frontend: Use correct WebSocket URL
// If backend at https://api.example.com
// Use: wss://api.example.com/ws (secure WebSocket)
// Not: ws://api.example.com/ws (won't work over HTTPS)

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
```

**Fix Checklist**:
- [ ] CORS middleware configured
- [ ] WebSocket uses correct protocol (ws/wss)
- [ ] Origin headers whitelisted
- [ ] Proxy/firewall allows WebSocket upgrade

---

## Quick Debug Checklist

When something isn't working, check in order:

```
☐ Server running?
  curl http://localhost:8000/health
  
☐ WebSocket endpoint available?
  wscat -c ws://localhost:8000/ws?token=test&device_id=test
  
☐ JWT token valid?
  jwt.decode(token, options={"verify_signature": False})
  
☐ User has case access?
  db.cases.findOne({_id: caseId, assigned_lawyer_id: userId})
  
☐ WebSocket connected?
  console.log(ws.isConnected)
  
☐ Events being sent?
  DevTools → Network → WS tab
  
☐ Events being received?
  ws.on('case.updated', e => console.log(e))
  
☐ No JavaScript errors?
  console.error messages in browser
  
☐ Rate limiting?
  Check X-RateLimit-Remaining header
  
☐ Network latency?
  ping server address
  
☐ Browser extensions?
  Try incognito mode
```

## Getting Help

If issues persist:

1. **Check logs**:
   ```bash
   docker logs -f nomos-one-backend | grep websocket
   docker logs -f nomos-one-frontend | grep ws
   ```

2. **Test with wscat**:
   ```bash
   npm install -g wscat
   wscat -c ws://localhost:8000/ws?token=token&device_id=123
   ```

3. **Enable debug logging**:
   ```typescript
   localStorage.setItem('DEBUG', 'nomos:*');
   location.reload();
   ```

4. **Create issue with**:
   - Browser/version
   - Server logs (last 50 lines)
   - Network tab screenshot
   - Steps to reproduce
   - Expected vs actual behavior
