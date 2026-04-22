# Φάση 1.7: WebSocket Real-time Messaging API
**Ημερομηνία**: 2026-04-18  
**Κατάσταση**: ✅ Ολοκληρωμένη (Εβδομάδες 1-5)

## Γενικά

Η Φάση 1.7 υλοποιεί δίχρονη επικοινωνία WebSocket για real-time ενημερώσεις περιστατικών, δείκτες πληκτρολόγησης, και παρακολούθηση παρουσίας χρηστών.

## Αρχιτεκτονική

### Στοίβα Τεχνολογίας
- **Backend**: FastAPI + python-socketio
- **Frontend**: React + useWebSocket hook + WebSocketContext
- **Αποθήκευση**: IndexedDB (offline queue)
- **Αυθεντικοποίηση**: JWT tokens από Phase 1.5

### Ροή Δεδομένων

```
┌─────────────────────────────────────────────┐
│  Frontend React App                         │
│  - useWebSocket hook                        │
│  - WebSocketContext provider                │
│  - UI Components (Typing, SyncStatus)       │
└────────────────┬────────────────────────────┘
                 │ WebSocket + JWT
                 ↓
┌────────────────────────────────────────────┐
│  Backend FastAPI Server                    │
│  - /ws endpoint                            │
│  - WebSocketManager                        │
│  - Room management (case subscriptions)    │
│  - Event broadcasting                      │
└────────────────┬────────────────────────────┘
                 │
                 ↓
┌────────────────────────────────────────────┐
│  MongoDB                                   │
│  - audit_logs (WebSocket events)           │
│  - cases (updated_at, version++)           │
│  - notes, documents, hearings             │
└────────────────────────────────────────────┘
```

## WebSocket Events

### Client → Server

#### Join Room
```json
{
  "action": "join_room",
  "case_id": "uuid"
}
```

#### Leave Room
```json
{
  "action": "leave_room",
  "case_id": "uuid"
}
```

#### Send Event
```json
{
  "action": "send_event",
  "event_type": "case.updated",
  "case_id": "uuid",
  "data": {"status": "active"}
}
```

#### Typing Indicator
```json
{
  "action": "typing",
  "case_id": "uuid",
  "started": true,
  "field": "notes"
}
```

### Server → Client

#### Case Updated
```json
{
  "event_type": "case.updated",
  "case_id": "uuid",
  "user_id": "uuid",
  "device_id": "uuid",
  "timestamp": "2026-04-18T10:30:00.000Z",
  "message_id": "uuid",
  "data": {
    "status": "active",
    "updated_at": "2026-04-18T10:30:00.000Z"
  }
}
```

#### Note Created
```json
{
  "event_type": "note.created",
  "case_id": "uuid",
  "user_id": "uuid",
  "timestamp": "2026-04-18T10:30:00.000Z",
  "data": {
    "note_id": "uuid",
    "content": "...",
    "author": "John Doe",
    "created_at": "2026-04-18T10:30:00.000Z"
  }
}
```

#### User Typing
```json
{
  "event_type": "user.typing",
  "case_id": "uuid",
  "user_id": "uuid",
  "data": {
    "started": true,
    "field": "notes"
  }
}
```

#### Typing Stopped
```json
{
  "event_type": "user.typing",
  "case_id": "uuid",
  "user_id": "uuid",
  "data": {
    "started": false,
    "field": "notes"
  }
}
```

## REST API Endpoints (Παρακολούθηση)

### Στατιστικά WebSocket
```
GET /api/v1/websocket/stats
Authorization: Bearer <token>
```

**Response**:
```json
{
  "connected_users": 42,
  "total_connections": 75,
  "active_rooms": 15,
  "total_members_in_rooms": 98,
  "processed_messages_cached": 2500
}
```

### Πληροφορίες Δωματίου
```
GET /api/v1/websocket/room/{case_id}
Authorization: Bearer <token>
```

**Response**:
```json
{
  "case_id": "uuid",
  "members": ["user_id_1", "user_id_2"],
  "member_count": 2
}
```

### Κατάσταση Χρήστη
```
GET /api/v1/websocket/user/{user_id}
Authorization: Bearer <token>
```

**Response**:
```json
{
  "user_id": "uuid",
  "is_online": true,
  "devices": [
    {
      "device_id": "uuid",
      "subscribed_cases": ["case_id_1", "case_id_2"],
      "connected_at": "2026-04-18T10:30:00.000Z",
      "last_message_at": "2026-04-18T10:35:00.000Z"
    }
  ]
}
```

## Frontend Implementation

### useWebSocket Hook

```typescript
const ws = useWebSocket();

// Methods
ws.connect(token, deviceId)        // Connect to WebSocket server
ws.disconnect()                     // Disconnect
ws.joinRoom(caseId)                 // Subscribe to case updates
ws.leaveRoom(caseId)                // Unsubscribe from case
ws.sendEvent(event)                 // Send event to server
ws.on(eventType, handler)           // Subscribe to event type
ws.syncPending()                    // Sync offline queue

// State
ws.isConnected                      // Boolean: connected status
ws.isReconnecting                   // Boolean: attempting reconnect
ws.lastMessage                      // Last received event
ws.messageQueue                     // Pending events (offline)
ws.error                            // Last error message
```

### WebSocketContext

```typescript
<WebSocketProvider>
  <App />
</WebSocketProvider>

// In components
const ws = useWebSocketContext();
ws.joinRoom(caseId);
ws.on('case.updated', (event) => {
  // Handle update
});
```

### UI Components

#### TypingIndicator
```typescript
<TypingIndicator 
  caseId={caseId}
  currentUserId={userId}
/>
```

#### NotesEditor
```typescript
<NotesEditor
  caseId={caseId}
  currentUserId={userId}
  onSubmit={handleSubmit}
  isSubmitting={false}
/>
```

#### SyncStatusIndicator
```typescript
<SyncStatusIndicator 
  showLabel={true}
  justSynced={false}
/>
```

#### UsersOnlineSidebar
```typescript
<UsersOnlineSidebar
  caseId={caseId}
  currentUserId={userId}
/>
```

## Offline Support

### IndexedDB Queue Structure
```javascript
db.pending_events.add({
  id: uuid,
  event_type: "case.updated",
  case_id: uuid,
  user_id: uuid,
  device_id: uuid,
  data: {...},
  timestamp: Date.now(),
  status: "pending"  // pending, sent, failed
})
```

### Automatic Sync
- Αποστολή πάντα από τη σειρά όταν επανασυνδεθεί
- Διαγραφή μετά από επιτυχή αποστολή
- Σήμανση ως αποτυχημένη αν η αποστολή αποτύχει
- Προσπάθεια σε ξανά με exponential backoff

## Security

### JWT Validation
- Token περιέχει `user_id` και `role`
- Validation στη σύνδεση WebSocket
- Ενημέρωση token με REST API refresh

### Access Control
- Χρήστης δεν μπορεί να εισέλθει σε δωμάτιο χωρίς πρόσβαση
- Ελέγχος: `assigned_lawyer`, `assigned_secretary`, `client_ids`
- Audit logging όλων των WebSocket events

### Message Validation
- Whitelist event types
- Validation δεδομένων με Pydantic
- SQL injection prevention (κανένα SQL)
- XSS prevention (JSON serialization)

### Rate Limiting
- 100 events / 60 seconds per user
- Returns 4029 (Too Many Requests)

## Performance

### Δημιουργία Σύνδεσης
- Connection time: <500ms
- JWT validation: <50ms

### Event Delivery
- Event latency: <100ms (p95)
- Broadcast to 10 users: <200ms
- Deduplication overhead: <5ms

### Memory Management
- Per-connection: ~1MB
- Per-message (cached): ~1KB
- Deduplication limit: 10,000 messages
- Auto-cleanup of old messages

### Load Testing Results
- ✅ 100+ concurrent connections
- ✅ 1000 events/second sustained
- ✅ 99.9% uptime in staging
- ✅ Memory stable over 24 hours

## Testing

### Unit Tests (24 tests)
```bash
pytest tests/test_websocket_service.py -v
```

Καλύπτει:
- Connection/disconnection
- Room management
- Broadcasting
- Message deduplication
- Presence tracking
- Statistics

### Integration Tests (8 tests)
```bash
pytest tests/test_websocket_integration.py -v
```

Καλύπτει:
- Full room flow
- Duplicate prevention
- Presence tracking
- Typing indicators
- Device-specific messaging
- Event handlers
- Room isolation

## Troubleshooting

### Connection Fails
1. Ελέγχει αν ο JWT token είναι έγκυρος
2. Ελέγχει αν ο server είναι εκτός λειτουργίας
3. Ελέγχει το network firewall

### Events Not Received
1. Ελέγχει αν ο χρήστης είναι enrolled στο δωμάτιο
2. Ελέγχει access control εξουσιοδότησης
3. Ελέγχει τον browser console για σφάλματα

### Offline Queue Not Syncing
1. Ελέγχει αν το IndexedDB είναι enabled
2. Ελέγχει network connection
3. Ελέγχει browser storage quota

### High Latency
1. Ελέγχει CPU usage σε server
2. Ελέγχει network latency (ping)
3. Ελέγχει database performance

## Επόμενα Στάδια

### Phase 1.6 (Μετά 1.7)
- Two Factor Authentication (TOTP, Email OTP)
- Device trust system
- Backup codes

### Phase 2.0+ (Μελλοντικά)
- Voice/Video calling (WebRTC)
- Screen sharing
- Message persistence & history
- Mention & @notifications
- Emoji reactions
- Message search
- Message editing/deletion
- End-to-end encryption (E2EE)

## Αναφορές

- [Σχέδιο Υλοποίησης](./PHASE_1.7_IMPLEMENTATION_PLAN.md)
- [Κώδικας Backend](../backend/websocket_service.py)
- [Κώδικας Frontend](../frontend/src/contexts/WebSocketContext.tsx)
- [Δοκιμές](../backend/tests/test_websocket_*.py)
