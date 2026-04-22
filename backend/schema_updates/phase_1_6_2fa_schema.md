# Φάση 1.6: Database Schema Updates for Two Factor Authentication

**Date**: 2026-04-18  
**Status**: Implementation Guide  
**Breaking Changes**: None (additive only)

---

## Overview

Phase 1.6 extends the MongoDB schema to support Two Factor Authentication (2FA) including TOTP, Email OTP, and backup codes. All changes are **backward compatible** - existing documents continue to work without modification.

---

## 1. Users Collection Updates

### Add `two_factor_auth` Field

Extend the `users` collection with a new nested document for 2FA configuration:

```javascript
// Existing user document structure (unchanged)
{
  _id: ObjectId,
  email: String,
  name: String,
  password: String,  // bcrypt hashed
  role: String,      // lawyer, secretary, client
  is_active: Boolean,
  is_approved: Boolean,
  devices: Array,    // from Phase 1.5
  
  // NEW: Two Factor Authentication Config
  two_factor_auth: {
    enabled: Boolean,           // Is 2FA active?
    method: String,             // 'totp' | 'email' | 'none'
    
    // TOTP-specific (encrypted storage)
    totp_secret: String,        // Encrypted TOTP secret
    totp_verified_at: DateTime, // When TOTP was confirmed
    totp_backup_codes: Array,   // Encrypted hashed backup codes
    
    // Email OTP-specific
    email_otp_enabled: Boolean,
    email_otp_verified_at: DateTime,
    
    // General tracking
    last_verified_at: DateTime, // Last successful 2FA verification
    backup_codes_regenerated_at: DateTime
  },
  
  // NEW: Failed 2FA Attempt Tracking
  failed_otp_attempts: {
    count: Integer,             // Incrementing attempt counter
    last_attempt: DateTime,     // Timestamp of last attempt
    locked_until: DateTime      // When lock expires
  }
}
```

### Migration Script

```javascript
// MongoDB: Connect to Nomos One database
use nomos_one;

// Add two_factor_auth field to all existing users
db.users.updateMany(
  {},
  {
    $set: {
      "two_factor_auth": {
        enabled: false,
        method: "none",
        last_verified_at: null
      },
      "failed_otp_attempts": {
        count: 0,
        locked_until: null
      }
    }
  }
);

// Verify update
db.users.findOne({ email: "test@example.gr" }).two_factor_auth;
// Output: { enabled: false, method: "none", last_verified_at: null }
```

### Index Creation

```javascript
// Create index for faster 2FA lookups
db.users.createIndex({ "two_factor_auth.enabled": 1 });
db.users.createIndex({ "failed_otp_attempts.locked_until": 1 });
```

---

## 2. New Collection: `otp_sessions`

Create a new collection to track OTP verification sessions for login and setup flows:

```javascript
db.createCollection("otp_sessions");

// Add indexes for performance
db.otp_sessions.createIndex({ user_id: 1 });
db.otp_sessions.createIndex({ device_id: 1 });
db.otp_sessions.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });

// TTL Index: Auto-delete expired sessions after 30 minutes
db.otp_sessions.createIndex({ created_at: 1 }, { expireAfterSeconds: 1800 });
```

### Document Structure

```javascript
{
  _id: ObjectId,
  
  // Session context
  user_id: ObjectId,
  device_id: UUID,
  
  // OTP code (hashed, never plaintext)
  otp_code: String,           // SHA256 hash of OTP
  otp_type: String,           // 'totp_setup' | 'totp_login' | 'email_setup' | 'email_login' | 'backup_login'
  
  // Session lifecycle
  created_at: DateTime,
  expires_at: DateTime,       // OTP expires after 10 minutes
  verified: Boolean,
  verified_at: DateTime,      // When code was successfully verified
  
  // Rate limiting & security
  attempt_count: Integer,     // Failed attempts
  ip_address: String,         // Client IP for audit
  user_agent: String          // Browser UA for device tracking
}
```

### Example Documents

```javascript
// OTP Session for Email Login
{
  _id: ObjectId("507f1f77bcf86cd799439011"),
  user_id: ObjectId("507f1f77bcf86cd799439012"),
  device_id: "550e8400-e29b-41d4-a716-446655440000",
  otp_code: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  otp_type: "email_login",
  created_at: ISODate("2026-04-18T10:30:00Z"),
  expires_at: ISODate("2026-04-18T10:40:00Z"),
  verified: false,
  verified_at: null,
  attempt_count: 2,
  ip_address: "192.168.1.100",
  user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}

// OTP Session for TOTP Setup
{
  _id: ObjectId("507f1f77bcf86cd799439013"),
  user_id: ObjectId("507f1f77bcf86cd799439012"),
  device_id: "550e8400-e29b-41d4-a716-446655440001",
  otp_code: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
  otp_type: "totp_setup",
  created_at: ISODate("2026-04-18T10:35:00Z"),
  expires_at: ISODate("2026-04-18T10:45:00Z"),
  verified: true,
  verified_at: ISODate("2026-04-18T10:37:00Z"),
  attempt_count: 0,
  ip_address: "192.168.1.100",
  user_agent: "Mozilla/5.0"
}
```

---

## 3. Audit Logs Collection Updates

Extend existing `audit_logs` to include 2FA events:

```javascript
// NEW: 2FA-related audit log entries

// TOTP Setup
{
  timestamp: DateTime,
  user_id: ObjectId,
  action: "2fa.totp.enabled",
  details: {
    method: "totp",
    secret_encrypted: true,
    backup_codes_count: 10
  }
}

// TOTP Verification
{
  timestamp: DateTime,
  user_id: ObjectId,
  action: "2fa.totp.verified",
  device_id: UUID,
  ip_address: String,
  details: {
    success: true,
    time_drift: 0  // seconds
  }
}

// Failed OTP Attempt
{
  timestamp: DateTime,
  user_id: ObjectId,
  action: "2fa.otp_attempt_failed",
  device_id: UUID,
  ip_address: String,
  details: {
    attempt_count: 2,
    max_attempts: 5,
    locked: false
  }
}

// Account Locked (OTP)
{
  timestamp: DateTime,
  user_id: ObjectId,
  action: "2fa.account_locked",
  ip_address: String,
  details: {
    reason: "max_otp_attempts",
    locked_until: DateTime,
    locked_duration_minutes: 15
  }
}

// Backup Code Used
{
  timestamp: DateTime,
  user_id: ObjectId,
  action: "2fa.backup_code_used",
  device_id: UUID,
  details: {
    codes_remaining: 9
  }
}

// 2FA Disabled
{
  timestamp: DateTime,
  user_id: ObjectId,
  action: "2fa.disabled",
  details: {
    previous_method: "totp",
    reason: "user_request"  // user_request | admin_action | security_incident
  }
}
```

### Query Examples

```javascript
// Find all 2FA setup attempts for a user
db.audit_logs.find({ user_id: userId, action: /^2fa\./ })

// Find locked accounts in last 24 hours
db.audit_logs.find({
  action: "2fa.account_locked",
  timestamp: { $gte: new Date(Date.now() - 86400000) }
})

// Find backup codes used
db.audit_logs.find({ action: "2fa.backup_code_used" })
```

---

## 4. Devices Collection - No Changes

The `devices` collection from Phase 1.5 remains **unchanged** but is now linked with OTP sessions via `device_id`. The trust mechanism remains:

```javascript
{
  _id: UUID,
  user_id: ObjectId,
  device_name: String,
  device_type: String,       // ios | android | web | desktop
  push_token: String,
  
  // Trust state (existing fields)
  trusted: Boolean,
  trust_expires_at: DateTime, // 30 days from trust
  last_seen: DateTime
}
```

---

## 5. Migration Checklist

When deploying Phase 1.6:

### Pre-Deployment

- [ ] Backup MongoDB database
- [ ] Test schema migrations in staging
- [ ] Verify no query changes break existing code
- [ ] Confirm new indexes created successfully

### Deployment

```bash
# 1. Add new dependencies
pip install -r backend/requirements.txt

# 2. Run MongoDB migrations
mongo nomos_one < backend/schema_updates/phase_1_6_2fa_schema.js

# 3. Verify migrations
mongo nomos_one --eval "db.users.findOne().two_factor_auth"

# 4. Restart backend
systemctl restart nomos-backend
```

### Post-Deployment

- [ ] Verify users collection has `two_factor_auth` field
- [ ] Verify `otp_sessions` collection created
- [ ] Check indexes created (performance)
- [ ] Monitor for errors in logs
- [ ] Spot-check user documents

---

## 6. Data Consistency

### Encryption at Rest

TOTP secrets and backup code hashes are **always encrypted** before storage:

```python
# In code: encryption_service.encrypt_data(secret)
totp_secret: "encrypted_string_here"  # AES-256-GCM
totp_backup_codes: [
  "encrypted_hash_1",
  "encrypted_hash_2"
]
```

### Never Plaintext

- ❌ Never store plaintext OTP codes
- ❌ Never store plaintext TOTP secrets
- ❌ Never store plaintext backup codes
- ✅ Always hash OTP codes before comparison
- ✅ Always encrypt TOTP secrets
- ✅ Always hash backup codes

---

## 7. Backward Compatibility

### Existing Systems

All existing code continues to work without modification:

- REST API endpoints unchanged
- User model additions are optional
- No breaking schema changes
- Default values for `two_factor_auth.enabled = false`

### Old User Documents

Users **without** 2FA will have:

```javascript
{
  _id: ObjectId,
  email: "user@example.gr",
  // ... existing fields ...
  two_factor_auth: {
    enabled: false,
    method: "none"
  }
}
```

They can be migrated to 2FA anytime without data loss.

---

## 8. Performance Considerations

### Index Usage

```javascript
// These queries will use indexes efficiently:

// Find enabled 2FA users
db.users.find({ "two_factor_auth.enabled": true })

// Find locked accounts
db.users.find({ "failed_otp_attempts.locked_until": { $gt: new Date() } })

// Find expired OTP sessions (auto-deleted by TTL index)
db.otp_sessions.find({ expires_at: { $lt: new Date() } })
```

### Storage Size

- Per-user 2FA config: ~500 bytes
- Per-OTP session: ~200 bytes
- Encrypted TOTP secret: ~100 bytes
- Backup codes (encrypted): ~300 bytes

---

## 9. Rollback Plan

If Phase 1.6 needs to be rolled back:

```javascript
// Remove 2FA fields from users
db.users.updateMany(
  { "two_factor_auth.enabled": true },
  {
    $unset: {
      "two_factor_auth": 1,
      "failed_otp_attempts": 1
    }
  }
);

// Drop OTP sessions collection
db.otp_sessions.drop();

// Verify
db.users.findOne().two_factor_auth;  // undefined
```

---

## 10. Monitoring Queries

After deployment, monitor:

```javascript
// Count users with 2FA enabled
db.users.countDocuments({ "two_factor_auth.enabled": true })

// Find users with locked OTP attempts
db.users.countDocuments({
  "failed_otp_attempts.locked_until": { $gt: new Date() }
})

// Count pending OTP sessions
db.otp_sessions.countDocuments({ verified: false })

// Most common 2FA method
db.users.aggregate([
  { $match: { "two_factor_auth.enabled": true } },
  { $group: { _id: "$two_factor_auth.method", count: { $sum: 1 } } }
])
```

---

## Summary

| Collection | Changes | Impact |
|-----------|---------|--------|
| `users` | Add `two_factor_auth`, `failed_otp_attempts` | Additive, optional |
| `otp_sessions` | New collection | No impact on existing |
| `audit_logs` | New 2FA event types | Backward compatible |
| `devices` | No changes | Uses existing structure |

**Result**: Phase 1.6 is fully backward compatible. Existing systems continue to work while 2FA users get enhanced security.
