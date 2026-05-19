"""
Φάση 1.6: Login Flow Integration with 2FA
Week 2 Implementation - Complete endpoints

This module shows how to integrate 2FA into the existing login flow.

Key Integration Points:
- Modify /api/auth/login endpoint
- Complete /api/auth/verify-otp endpoint
- Complete /api/auth/verify-backup-code endpoint
- Track OTP sessions
- Handle device trust
- Audit logging
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timedelta
import bcrypt
from uuid import uuid4
import jwt
import os

from two_factor_service import TwoFactorService, OTPSessionType, OTPMethod
from email_service import send_otp_email

# JWT Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "8"))


# ==================== Models ====================

class LoginRequest(BaseModel):
    """Modified login request for 2FA support"""
    email: EmailStr
    password: str
    device_id: str
    device_name: Optional[str] = "Unknown Device"


class LoginResponse(BaseModel):
    """Login response - either token or 2FA challenge"""
    token: Optional[str] = None
    user: Optional[dict] = None

    # If 2FA required
    requires_2fa: bool = False
    otp_session_id: Optional[str] = None
    method: Optional[str] = None  # 'totp' | 'email'
    email_masked: Optional[str] = None
    expires_in: Optional[int] = None


class OTPVerifyRequest(BaseModel):
    """OTP verification request"""
    otp_session_id: str
    code: str
    trust_device: bool = False


class BackupCodeVerifyRequest(BaseModel):
    """Backup code verification request"""
    otp_session_id: str
    code: str


# ==================== Helper Functions ====================

def mask_email(email: str) -> str:
    """Mask email for security display: john.doe@ex.gr → john***@ex.gr"""
    try:
        local, domain = email.split('@')
        if len(local) <= 3:
            masked = local[0] + "***"
        else:
            masked = local[:3] + "***"
        return f"{masked}@{domain}"
    except:
        return "***@***"


# ==================== Login Endpoint (Modified) ====================

async def login_endpoint(
    request: LoginRequest,
    db,  # Motor async database
    two_factor_service: TwoFactorService,
    email_service,  # Email service for sending OTP
    req: Request  # FastAPI request for IP/user-agent
) -> LoginResponse:
    """
    Modified login endpoint supporting 2FA

    Flow:
    1. Verify email exists and password is correct
    2. Check if user has 2FA enabled
    3. If 2FA not enabled OR device is trusted → return token
    4. If 2FA enabled AND device not trusted → create OTP session
    5. If Email OTP → send code via email
    6. If TOTP → return challenge for app
    7. Return either token or OTP challenge
    """

    try:
        # Step 1: Verify credentials
        user = await db.users.find_one({"email": request.email})

        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Verify password using bcrypt
        if not bcrypt.checkpw(
            request.password.encode('utf-8'),
            user.get("password", "").encode('utf-8')
        ):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Step 2: Check 2FA status
        two_fa_status = await two_factor_service.get_2fa_status(str(user["_id"]))

        # Step 3: Check if device is trusted
        is_trusted = await two_factor_service.is_device_trusted(
            str(user["_id"]), request.device_id
        )

        # If no 2FA or device is trusted → issue token immediately
        if not two_fa_status["enabled"] or is_trusted:
            token = create_jwt_token(user)
            return LoginResponse(
                token=token,
                user={
                    "id": str(user["_id"]),
                    "email": user["email"],
                    "name": user.get("name", "User"),
                    "role": user.get("role", "client")
                },
                requires_2fa=False
            )

        # Step 4-5: Create OTP session
        otp_session = await two_factor_service.create_otp_session(
            user_id=str(user["_id"]),
            device_id=request.device_id,
            session_type=(
                OTPSessionType.EMAIL_LOGIN
                if two_fa_status["method"] == "email"
                else OTPSessionType.TOTP_LOGIN
            ),
            ip_address=req.client.host if req.client else "unknown",
            user_agent=req.headers.get("user-agent", "unknown")
        )

        # Step 6: Send OTP if email method
        if two_fa_status["method"] == "email":
            # Send OTP via email
            await send_otp_email(
                user["email"],
                user.get("name", "User"),
                otp_session["otp_code"],
                expires_minutes=10
            )

            # Audit log
            await audit_log(
                db,
                str(user["_id"]),
                "2fa.otp_sent",
                {"method": "email", "device_id": request.device_id}
            )

        # Step 7: Return challenge
        return LoginResponse(
            requires_2fa=True,
            otp_session_id=otp_session["session_id"],
            method=two_fa_status["method"],
            email_masked=mask_email(user["email"]),
            expires_in=otp_session["expires_in_seconds"]
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login error: {str(e)}")


# ==================== OTP Verification Endpoint ====================

async def verify_otp_endpoint(
    request: OTPVerifyRequest,
    db,
    two_factor_service: TwoFactorService,
    req: Request
):
    """
    Verify OTP code and issue JWT token

    Flow:
    1. Retrieve OTP session from database
    2. Verify OTP code (email OTP or TOTP)
    3. If invalid: increment failed attempts
    4. If valid:
       - Reset failed attempts
       - Issue JWT token
       - If trust_device: mark device as trusted for 30 days
       - Audit log successful verification
    """

    try:
        from bson import ObjectId

        # Step 1: Get OTP session
        otp_session = await db.otp_sessions.find_one({
            "_id": ObjectId(request.otp_session_id)
        })

        if not otp_session:
            raise HTTPException(status_code=400, detail="Invalid OTP session")

        user_id_str = str(otp_session["user_id"])
        user_id = otp_session["user_id"]  # Keep original type for DB queries

        # Check rate limiting before verification
        is_locked, locked_until = await two_factor_service.is_otp_locked(user_id_str)
        if is_locked:
            raise HTTPException(
                status_code=429,
                detail=f"Account locked. Try again in 15 minutes."
            )

        # Step 2: Verify OTP code
        session_type = otp_session.get("otp_type", "email_login")

        if "totp" in session_type:
            # Verify TOTP code
            valid, error = await two_factor_service.verify_totp_code(user_id_str, request.code)
        else:
            # Verify Email OTP
            valid, error = await two_factor_service.verify_email_otp(
                str(request.otp_session_id), request.code
            )

        if not valid:
            # Step 3: Increment failed attempts
            await two_factor_service.increment_failed_otp_attempts(user_id_str)

            # Audit log
            await audit_log(
                db, user_id_str, "2fa.otp_attempt_failed",
                {"session_id": request.otp_session_id}
            )

            raise HTTPException(status_code=401, detail=error or "Invalid code")

        # Step 4: Success - reset attempts
        await two_factor_service.reset_failed_otp_attempts(user_id_str)

        # Get user for token
        user = await db.users.find_one({"_id": user_id})

        # Issue JWT token
        token = create_jwt_token(user)

        # Mark device as trusted if requested
        trust_expires = None
        if request.trust_device:
            await two_factor_service.mark_device_as_trusted(
                user_id_str,
                otp_session["device_id"],
                otp_session.get("device_name", "Unknown Device")
            )

            # Get trust expiry date
            device = await db.devices.find_one({
                "_id": otp_session["device_id"]
            })
            trust_expires = device.get("trust_expires_at") if device else None

        # Audit log successful verification
        await audit_log(
            db, user_id_str, "2fa.verified",
            {
                "method": "totp" if "totp" in session_type else "email",
                "device_id": str(otp_session["device_id"]),
                "trusted": request.trust_device
            }
        )

        # Mark OTP session as verified
        await db.otp_sessions.update_one(
            {"_id": ObjectId(request.otp_session_id)},
            {"$set": {"verified": True, "verified_at": datetime.utcnow()}}
        )

        return {
            "token": token,
            "user": {
                "id": str(user["_id"]),
                "email": user["email"],
                "name": user.get("name", "User"),
                "role": user.get("role", "client")
            },
            "device_trusted": request.trust_device,
            "trust_expires": trust_expires
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OTP verification error: {str(e)}")


# ==================== Backup Code Verification Endpoint ====================

async def verify_backup_code_endpoint(
    request: BackupCodeVerifyRequest,
    db,
    two_factor_service: TwoFactorService
):
    """
    Verify backup code and issue JWT token

    Flow:
    1. Retrieve OTP session
    2. Use backup code (removes from list)
    3. If invalid: increment failed attempts
    4. If valid:
       - Issue JWT token
       - Warn user about remaining codes
       - Audit log
    """

    try:
        from bson import ObjectId

        # Step 1: Get OTP session
        otp_session = await db.otp_sessions.find_one({
            "_id": ObjectId(request.otp_session_id)
        })

        if not otp_session:
            raise HTTPException(status_code=400, detail="Invalid OTP session")

        user_id_str = str(otp_session["user_id"])
        user_id = otp_session["user_id"]  # Keep original type for DB queries

        # Step 2: Verify backup code
        valid, error, remaining = await two_factor_service.use_backup_code(
            user_id_str, request.code
        )

        if not valid:
            # Increment failed attempts
            await two_factor_service.increment_failed_otp_attempts(user_id_str)
            raise HTTPException(status_code=401, detail=error)

        # Get user for token
        user = await db.users.find_one({"_id": user_id})

        # Issue JWT token
        token = create_jwt_token(user)

        # Audit log
        await audit_log(
            db, user_id_str, "2fa.backup_code_used",
            {"codes_remaining": remaining}
        )

        # Mark OTP session as verified
        await db.otp_sessions.update_one(
            {"_id": ObjectId(request.otp_session_id)},
            {"$set": {"verified": True, "verified_at": datetime.utcnow()}}
        )

        return {
            "token": token,
            "user": {
                "id": str(user["_id"]),
                "email": user["email"],
                "name": user.get("name", "User"),
                "role": user.get("role", "client")
            },
            "codes_remaining": remaining
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup code error: {str(e)}")


# ==================== Helper Functions ====================

def create_jwt_token(user: dict) -> str:
    """
    Create JWT token for authenticated user

    Token payload:
    - sub: user_id
    - email: user email
    - role: user role
    - exp: expiry time (8 hours from now)
    """
    payload = {
        "sub": str(user["_id"]),
        "email": user.get("email", ""),
        "role": user.get("role", "client"),
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)
    }

    # Use JWT_SECRET from environment, or generate one if not set
    secret = JWT_SECRET
    if not secret or secret.startswith("CHANGE"):
        import secrets
        secret = secrets.token_hex(32)

    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


async def audit_log(
    db,
    user_id,
    action: str,
    details: dict = None
) -> None:
    """
    Log 2FA security event to audit_logs collection

    Implementation:
    - Record timestamp
    - Include user_id
    - Include action (2fa.verified, 2fa.otp_attempt_failed, etc)
    - Include relevant details
    """
    try:
        await db.audit_logs.insert_one({
            "timestamp": datetime.utcnow(),
            "user_id": user_id,
            "action": action,
            "details": details or {}
        })
    except Exception as e:
        print(f"Error logging audit event: {str(e)}")
        # Non-blocking - continue even if audit log fails


# ==================== Integration Points ====================

"""
INTEGRATION CHECKLIST FOR WEEK 2:

1. Modify Existing /api/auth/login Endpoint:
   - Call login_endpoint() with 2FA service
   - Handle both token response and 2FA challenge
   - Make sure device_id is extracted from request headers

2. Create /api/auth/verify-otp Endpoint:
   - Call verify_otp_endpoint()
   - Handle both TOTP and Email OTP verification
   - Support device trust checkbox

3. Create /api/auth/verify-backup-code Endpoint:
   - Call verify_backup_code_endpoint()
   - Show remaining backup codes to user

4. Dependency Injection:
   - Pass TwoFactorService to all endpoints
   - Pass Email service for OTP sending
   - Pass Database (Motor) connection

5. Database Queries Needed:
   - users.find_one({"email": email}) - existing
   - users.update_one() - for failed attempts
   - devices.find_one() - check trust status
   - devices.update_one() - mark as trusted
   - otp_sessions.insert_one() - create session
   - otp_sessions.find_one() - get session
   - otp_sessions.update_one() - mark verified
   - audit_logs.insert_one() - log events

6. Security Headers:
   - Extract client IP from request.client.host
   - Extract user-agent from request.headers.get("user-agent")
   - Pass to OTP session for audit trail

7. Error Handling:
   - Invalid credentials → 401
   - Invalid OTP → 401 + increment attempts
   - Account locked → 429 (Too Many Requests)
   - Expired OTP → 401 with clear message
   - Invalid session → 400

8. Testing:
   - Run integration tests in test_two_factor_login_flows.py
   - Test complete flows: TOTP, Email OTP, Backup Code
   - Test rate limiting
   - Test device trust
   - Test state transitions

"""
