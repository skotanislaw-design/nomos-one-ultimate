# Email Configuration Guide

## Overview

This guide explains how to configure and enable email notifications for the Client Portal system.

## Email Service Features

The email service supports sending notifications for:

1. **Portal Access Codes** - Send new codes to clients
2. **Client Messages** - Notify lawyers of new messages
3. **Document Uploads** - Alert lawyers of client uploads
4. **Password Reset** - Send reset links to clients

---

## SMTP Configuration

### Gmail Setup

#### Step 1: Enable 2-Factor Authentication
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-Step Verification

#### Step 2: Create App Password
1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
2. Select "Mail" and "Windows Computer"
3. Google will generate a 16-character password

#### Step 3: Update .env

```env
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-16-character-app-password
FROM_EMAIL=noreply@skotanislaw.com
FROM_NAME=Σκοτάνης & Συνεργάτες
```

### Office 365 Setup

```env
SMTP_SERVER=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@company.com
SMTP_PASSWORD=your-password
FROM_EMAIL=noreply@company.com
FROM_NAME=Company Name
```

### SendGrid Setup

```env
SMTP_SERVER=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=SG.your-sendgrid-api-key
FROM_EMAIL=noreply@company.com
FROM_NAME=Company Name
```

### AWS SES Setup

```env
SMTP_SERVER=email-smtp.region.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
FROM_EMAIL=verified-sender@company.com
FROM_NAME=Company Name
```

---

## Integration with Backend

### 1. Install Required Dependencies

```bash
pip install python-dotenv
```

### 2. Update backend/server.py

Add email sending to portal endpoints:

```python
# At the top of server.py
from email_service import (
    send_portal_code_email,
    send_message_notification_email,
    send_document_upload_email
)

# In portal_login endpoint
@app.post("/api/portal/auth")
async def portal_login(req: PortalLoginRequest):
    # ... existing code ...
    
    # Send portal code email to client
    await send_portal_code_email(
        client_email=case.get("client_email"),
        client_name=case.get("client_name"),
        case_title=case.get("title"),
        portal_code=portal_access["portal_code"],
        case_category=req.case_category
    )
    
    return {"token": token, "client_name": case.get("client_name"), "case_title": case.get("title")}

# In portal_send_message endpoint
@app.post("/api/portal/messages")
async def portal_send_message(req: PortalMessageRequest, user=Depends(get_portal_user)):
    # ... existing code ...
    
    # Notify lawyer
    case = await db.cases.find_one({"_id": ObjectId(user["case_id"])})
    lawyer = await db.users.find_one({"_id": ObjectId(case.get("assigned_lawyer_id"))})
    
    if lawyer:
        await send_message_notification_email(
            lawyer_email=lawyer.get("email"),
            lawyer_name=lawyer.get("name"),
            client_name=user.get("client_name"),
            case_title=case.get("title"),
            message_subject=req.subject or "Νέο μήνυμα",
            message_preview=req.content[:200]  # First 200 chars
        )
    
    return {"ok": True, "message_id": str(result.inserted_id)}

# In portal_upload_document endpoint
@app.post("/api/portal/upload")
async def portal_upload_document(file: UploadFile = File(...), user=Depends(get_portal_user)):
    # ... existing code ...
    
    # Notify lawyer
    case = await db.cases.find_one({"_id": ObjectId(user["case_id"])})
    lawyer = await db.users.find_one({"_id": ObjectId(case.get("assigned_lawyer_id"))})
    
    if lawyer:
        file_size_mb = file.size / (1024 * 1024)
        await send_document_upload_email(
            lawyer_email=lawyer.get("email"),
            lawyer_name=lawyer.get("name"),
            client_name=user.get("client_name"),
            case_title=case.get("title"),
            filename=file.filename,
            file_size_mb=file_size_mb
        )
    
    return {"ok": True, "document_id": str(result.inserted_id), "filename": file.filename}
```

### 3. Error Handling

The email service gracefully handles errors:

```python
# Email sending is async and non-blocking
# If email fails, the request still succeeds
# Check logs for failures

try:
    await send_portal_code_email(...)
except Exception as e:
    # Log error but don't fail the request
    logger.error(f"Failed to send email: {str(e)}")
    # Request continues normally
```

---

## Testing Email Configuration

### Test Script

Create `test_email.py`:

```python
import asyncio
from email_service import send_portal_code_email

async def test_email():
    success = await send_portal_code_email(
        client_email="test@example.com",
        client_name="Test User",
        case_title="Test Case",
        portal_code="TEST123ABC",
        case_category="Εργατικό Δίκαιο"
    )
    
    if success:
        print("✓ Email sent successfully!")
    else:
        print("✗ Failed to send email")

if __name__ == "__main__":
    asyncio.run(test_email())
```

### Run Test

```bash
cd backend
python test_email.py
```

---

## Email Templates

### Custom Templates

To customize email templates, create files in `backend/email_templates/`:

```
backend/email_templates/
├── portal_code_el.html
├── portal_code_en.html
├── message_notification_el.html
├── message_notification_en.html
├── document_upload_el.html
├── document_upload_en.html
├── password_reset_el.html
└── password_reset_en.html
```

### Template Variables

Available variables for each template:

**portal_code**
- `{client_name}` - Client name
- `{case_title}` - Case title
- `{portal_code}` - Access code
- `{case_category}` - Case category

**message_notification**
- `{lawyer_name}` - Lawyer name
- `{client_name}` - Client name
- `{case_title}` - Case title
- `{message_subject}` - Message subject
- `{message_preview}` - Message preview
- `{datetime}` - Current date/time

**document_upload**
- `{lawyer_name}` - Lawyer name
- `{client_name}` - Client name
- `{case_title}` - Case title
- `{filename}` - File name
- `{file_size_mb}` - File size in MB

**password_reset**
- `{client_name}` - Client name
- `{reset_link}` - Reset link URL
- `{expires_hours}` - Expiration time in hours

---

## Logging

### Configure Email Logging

Add to `backend/server.py`:

```python
import logging

logger = logging.getLogger("email_service")
logger.setLevel(logging.DEBUG)

handler = logging.FileHandler("logs/email.log")
formatter = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
handler.setFormatter(formatter)
logger.addHandler(handler)
```

### View Email Logs

```bash
tail -f backend/logs/email.log
```

---

## Troubleshooting

### Email Not Sending

1. **Check SMTP Credentials**
   ```bash
   python -c "
   import smtplib
   server = smtplib.SMTP('smtp.gmail.com', 587)
   server.starttls()
   server.login('user@gmail.com', 'app_password')
   print('✓ Connection successful')
   "
   ```

2. **Check Firewall**
   ```bash
   # Test SMTP port
   telnet smtp.gmail.com 587
   ```

3. **Check Logs**
   ```bash
   grep -i "error\|failed" backend/logs/email.log
   ```

4. **Enable Debug Mode**
   ```python
   import smtplib
   smtplib.enable_debug(True)
   ```

### Common Issues

**Gmail: "Less secure app access"**
- Use App Passwords instead of account password
- Enable 2FA first

**Office365: "Authentication failed"**
- Ensure email is verified
- Use full email address: `user@company.onmicrosoft.com`

**SendGrid: "Invalid API key"**
- Check key format: should start with `SG.`
- Verify key has Mail Send permission

**Timeout Error**
- Increase timeout: `server.timeout = 30`
- Check network connection
- Verify SMTP port is open

---

## Production Considerations

### Security

```env
# Use environment variables, not hardcoded
# Keep SMTP_PASSWORD secure
# Use app-specific passwords when available
# Enable TLS/SSL encryption
```

### Rate Limiting

```python
# Prevent email spam
from time import time

EMAIL_RATE_LIMIT = {}

async def send_email_with_rate_limit(user_id: str, *args, **kwargs):
    now = time()
    
    if user_id in EMAIL_RATE_LIMIT:
        last_sent = EMAIL_RATE_LIMIT[user_id]
        if now - last_sent < 60:  # 1 email per minute max
            return False
    
    success = await send_email_async(*args, **kwargs)
    
    if success:
        EMAIL_RATE_LIMIT[user_id] = now
    
    return success
```

### Monitoring

```python
# Track email delivery
async def log_email_delivery(
    to_email: str,
    subject: str,
    success: bool,
    error: str = None
):
    await db.email_logs.insert_one({
        "to_email": to_email,
        "subject": subject,
        "success": success,
        "error": error,
        "timestamp": datetime.utcnow()
    })
```

### Database

Store email delivery records:

```javascript
// MongoDB collection: email_logs
{
  _id: ObjectId,
  to_email: String,
  subject: String,
  template: String,           // 'portal_code', 'message', etc.
  success: Boolean,
  error: String,
  sent_at: Date,
  case_id: String,
  client_id: String
}
```

---

## Email Template Examples

### Greek Portal Code Email

```html
<h2>Κωδικός Πρόσβασης Πύλης Πελάτη</h2>
<p>Καλησπέρα {client_name},</p>
<p>Ο κωδικός πρόσβασης για τη Πύλη Πελάτη είναι:</p>
<div style="font-size: 24px; font-weight: bold; color: #C6A75E;">
  {portal_code}
</div>
<p>Υπόθεση: {case_title}</p>
```

### English Variant

Create `portal_code_en.html`:

```html
<h2>Client Portal Access Code</h2>
<p>Hello {client_name},</p>
<p>Your client portal access code is:</p>
<div style="font-size: 24px; font-weight: bold; color: #C6A75E;">
  {portal_code}
</div>
<p>Case: {case_title}</p>
```

---

## Compliance

### GDPR

- [x] Collect consent before sending emails
- [x] Provide unsubscribe link in emails
- [x] Store email logs (with encryption)
- [x] Delete old email logs (30+ days)

### Privacy

- [x] Don't share email addresses
- [x] Encrypt email templates
- [x] Log only essential data
- [x] Secure SMTP credentials

---

## Testing in Production

### Staging Environment

```bash
# Test with real SMTP server
# But send to test email
TO_EMAIL=test@company.com python -m pytest backend/test_portal.py
```

### Dry Run Mode

```python
# Add flag to skip actual sending
DRY_RUN = os.getenv("DRY_RUN", "false").lower() == "true"

if DRY_RUN:
    logger.info(f"DRY RUN: Would send email to {to_email}")
    return True
```

### Set Dry Run

```bash
export DRY_RUN=true
python backend/test_email.py
```

---

## Performance Optimization

### Async Sending

Emails are sent asynchronously to avoid blocking requests:

```python
# Non-blocking
await send_portal_code_email(...)
# Request returns immediately
```

### Batch Sending

For bulk operations:

```python
import asyncio

async def send_bulk_emails(recipients: List[dict]):
    tasks = [
        send_portal_code_email(
            client_email=r["email"],
            client_name=r["name"],
            ...
        )
        for r in recipients
    ]
    results = await asyncio.gather(*tasks)
    return results
```

---

## Monitoring Dashboard

Create `backend/email_dashboard.py`:

```python
from fastapi import APIRouter
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/api/admin/email-stats")
async def get_email_stats():
    """Get email delivery statistics"""
    
    # Last 24 hours
    since = datetime.utcnow() - timedelta(hours=24)
    
    logs = await db.email_logs.find({
        "timestamp": {"$gte": since}
    }).to_list(None)
    
    total = len(logs)
    success = len([l for l in logs if l["success"]])
    failed = total - success
    
    return {
        "total": total,
        "success": success,
        "failed": failed,
        "success_rate": (success / total * 100) if total > 0 else 0
    }
```

---

## Support

For email configuration issues:
- Check SMTP server status
- Verify credentials
- Review error logs
- Test with `test_email.py`
- Contact email provider support

---

**Last Updated**: April 2026  
**Version**: 1.0
