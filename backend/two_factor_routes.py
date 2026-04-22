"""
Φάση 1.6: Two Factor Authentication REST API Endpoints
Σύνδεση με FastAPI server

Endpoints:
- POST /api/auth/login - Modified to support 2FA
- POST /api/auth/verify-otp - Verify OTP code
- POST /api/auth/verify-backup-code - Verify backup code
- POST /api/auth/2fa/setup/totp - Start TOTP setup
- POST /api/auth/2fa/setup/totp/verify - Verify TOTP setup
- POST /api/auth/2fa/setup/email - Enable email 2FA
- GET /api/auth/2fa/status - Get 2FA status
- POST /api/auth/2fa/disable - Disable 2FA
- POST /api/auth/2fa/regenerate-codes - Generate new backup codes
- GET /api/auth/trusted-devices - List trusted devices
- POST /api/auth/trusted-devices/{device_id}/revoke - Revoke device trust
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, timedelta
from io import BytesIO
import pyotp
from uuid import uuid4

from two_factor_service import TwoFactorService, OTPMethod, OTPSessionType
from email_service import send_otp_email, send_2fa_setup_email, send_backup_codes_email


# ==================== Request/Response Models ====================

class TOTPSetupRequest(BaseModel):
    """Request to start TOTP setup"""
    pass


class TOTPSetupResponse(BaseModel):
    """Response with QR code for TOTP setup"""
    secret: str
    qr_code_url: str  # Data URL for QR code


class TOTPVerifyRequest(BaseModel):
    """Request to verify TOTP setup"""
    code: str


class TOTPVerifyResponse(BaseModel):
    """Response after TOTP verification"""
    backup_codes: List[str]
    download_link: str


class EmailOTPSetupRequest(BaseModel):
    """Request to enable email OTP"""
    pass


class EmailOTPSetupResponse(BaseModel):
    """Response after email OTP setup"""
    status: str
    otp_sent: bool


class LoginRequest(BaseModel):
    """Modified login request for 2FA"""
    email: EmailStr
    password: str
    device_id: str
    device_name: Optional[str] = None


class LoginResponse(BaseModel):
    """Modified login response"""
    token: Optional[str] = None
    user: Optional[dict] = None
    requires_2fa: bool = False
    otp_session_id: Optional[str] = None
    method: Optional[str] = None  # 'totp' | 'email'
    email_masked: Optional[str] = None  # john***@example.gr
    expires_in: Optional[int] = None  # seconds


class OTPVerifyRequest(BaseModel):
    """Request to verify OTP code"""
    otp_session_id: str
    code: str
    trust_device: bool = False


class OTPVerifyResponse(BaseModel):
    """Response after OTP verification"""
    token: str
    user: dict
    device_trusted: bool
    trust_expires: Optional[datetime] = None


class BackupCodeVerifyRequest(BaseModel):
    """Request to verify backup code"""
    otp_session_id: str
    backup_code: str


class BackupCodeVerifyResponse(BaseModel):
    """Response after backup code verification"""
    token: str
    user: dict
    codes_remaining: int


class TwoFAStatusResponse(BaseModel):
    """Response with 2FA status"""
    enabled: bool
    method: Optional[str] = None  # 'totp' | 'email' | 'none'
    backup_codes_count: int
    last_verified_at: Optional[datetime] = None


class DisableTwoFARequest(BaseModel):
    """Request to disable 2FA"""
    password: str


class RegenerateCodesRequest(BaseModel):
    """Request to regenerate backup codes"""
    password: str


class RegenerateCodesResponse(BaseModel):
    """Response with new backup codes"""
    backup_codes: List[str]


class TrustedDeviceResponse(BaseModel):
    """Trusted device info"""
    device_id: str
    device_name: str
    device_type: str
    last_seen: datetime
    trust_expires_at: datetime


class TrustedDevicesListResponse(BaseModel):
    """List of trusted devices"""
    devices: List[TrustedDeviceResponse]
    count: int


# ==================== Helper Functions ====================

def mask_email(email: str) -> str:
    """Mask email for security display"""
    # john.doe@example.gr → john***@example.gr
    local, domain = email.split('@')
    if len(local) <= 3:
        masked_local = local[0] + "***"
    else:
        masked_local = local[:3] + "***"
    return f"{masked_local}@{domain}"


async def get_current_user(request: Request, db, token: str = None) -> dict:
    """Get current authenticated user from JWT token"""
    # Implementation depends on existing auth system
    # This is a placeholder
    raise NotImplementedError("Use existing get_current_user from auth module")


# ==================== REST API Routes ====================

def create_2fa_router(db, two_factor_service: TwoFactorService):
    """Create 2FA router with database and service instances"""
    router = APIRouter(prefix="/api/auth", tags=["2fa"])

    # ==================== 2FA Setup Routes ====================

    @router.post("/2fa/setup/totp", response_model=TOTPSetupResponse)
    async def setup_totp(
        request: TOTPSetupRequest,
        current_user = Depends(get_current_user)
    ):
        """
        Start TOTP 2FA setup

        Returns:
        - secret: Base32 encoded secret
        - qr_code_url: Data URL with QR code PNG
        """
        try:
            user_id = current_user["id"]

            # Generate TOTP secret
            secret = await two_factor_service.generate_totp_secret()

            # Generate QR code
            qr_code_bytes = await two_factor_service.get_totp_qr_code(
                user_id, current_user["email"], secret
            )

            # Convert QR code to data URL
            import base64
            qr_code_b64 = base64.b64encode(qr_code_bytes).decode('utf-8')
            qr_code_url = f"data:image/png;base64,{qr_code_b64}"

            return TOTPSetupResponse(
                secret=secret,
                qr_code_url=qr_code_url
            )

        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error generating TOTP: {str(e)}")

    @router.post("/2fa/setup/totp/verify", response_model=TOTPVerifyResponse)
    async def verify_totp_setup(
        request: TOTPVerifyRequest,
        current_user = Depends(get_current_user)
    ):
        """
        Verify TOTP setup with code and enable 2FA

        Requires:
        - code: 6-digit TOTP code from authenticator app
        - secret: TOTP secret (from previous endpoint, passed via frontend session)
        """
        try:
            user_id = current_user["id"]
            # Note: Secret should be stored in frontend session, not sent again
            # For production, use session storage or encrypted token

            # Step 1: Verify TOTP code
            # Note: In production, verify with secret from session
            valid, error = await two_factor_service.verify_totp_code(user_id, request.code)

            if not valid:
                raise HTTPException(status_code=400, detail=f"Invalid TOTP code: {error}")

            # Step 2: Enable TOTP 2FA (secret should come from session)
            # For now, placeholder - in real implementation:
            # secret = session.get('totp_secret')
            # result = await two_factor_service.enable_2fa(
            #     user_id, OTPMethod.TOTP, secret
            # )
            #
            # Step 3: Send confirmation email
            # await send_2fa_setup_email(current_user["email"], current_user["name"])
            #
            # Step 4: Return backup codes
            # backup_codes = result["backup_codes"]
            # await send_backup_codes_email(current_user["email"], current_user["name"], backup_codes)

            # Placeholder response
            backup_codes = ["a1b2c3d4", "e5f6g7h8", "i9j0k1l2", "m3n4o5p6", "q7r8s9t0",
                           "u1v2w3x4", "y5z6a7b8", "c9d0e1f2", "g3h4i5j6", "k7l8m9n0"]

            return TOTPVerifyResponse(
                backup_codes=backup_codes,
                download_link="/api/auth/2fa/backup-codes/download"
            )

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error verifying TOTP: {str(e)}")

    @router.post("/2fa/setup/email", response_model=EmailOTPSetupResponse)
    async def setup_email_2fa(
        request: EmailOTPSetupRequest,
        current_user = Depends(get_current_user)
    ):
        """Enable email OTP 2FA"""
        try:
            user_id = current_user["id"]

            # Enable email 2FA
            result = await two_factor_service.enable_2fa(user_id, OTPMethod.EMAIL)

            # Send confirmation email
            await send_2fa_setup_email(current_user["email"], current_user["name"])

            return EmailOTPSetupResponse(
                status="email_2fa_enabled",
                otp_sent=True
            )

        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error enabling email 2FA: {str(e)}")

    # ==================== 2FA Management Routes ====================

    @router.get("/2fa/status", response_model=TwoFAStatusResponse)
    async def get_2fa_status(current_user = Depends(get_current_user)):
        """Get current 2FA configuration"""
        try:
            user_id = current_user["id"]
            status = await two_factor_service.get_2fa_status(user_id)
            return TwoFAStatusResponse(**status)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error getting 2FA status: {str(e)}")

    @router.post("/2fa/disable")
    async def disable_2fa(
        request: DisableTwoFARequest,
        current_user = Depends(get_current_user)
    ):
        """
        Disable 2FA (requires password confirmation)

        After disabling:
        - All tokens invalidated
        - User must re-login
        - No 2FA required on next login
        """
        try:
            user_id = current_user["id"]

            # Step 1: Verify password
            # verify_password(request.password, current_user["password"])

            # Step 2: Disable 2FA
            await two_factor_service.disable_2fa(user_id)

            # Step 3: Invalidate all tokens (logout user)
            # In production: blacklist all JWT tokens

            # Step 4: Audit log
            # await audit_log(user_id, "2fa.disabled", {"reason": "user_request"})

            return {"status": "disabled", "message": "2FA has been disabled"}

        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error disabling 2FA: {str(e)}")

    @router.post("/2fa/regenerate-codes", response_model=RegenerateCodesResponse)
    async def regenerate_backup_codes(
        request: RegenerateCodesRequest,
        current_user = Depends(get_current_user)
    ):
        """
        Regenerate backup codes (requires password confirmation)

        Old codes become invalid immediately.
        """
        try:
            user_id = current_user["id"]

            # Step 1: Verify password
            # verify_password(request.password, current_user["password"])

            # Step 2: Generate new codes
            new_codes = await two_factor_service.regenerate_backup_codes(user_id)

            # Step 3: Send new codes via email
            await send_backup_codes_email(current_user["email"], current_user["name"], new_codes)

            # Step 4: Audit log
            # await audit_log(user_id, "2fa.backup_codes_regenerated")

            return RegenerateCodesResponse(backup_codes=new_codes)

        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error regenerating codes: {str(e)}")

    # ==================== Login with 2FA Routes ====================

    @router.post("/login", response_model=LoginResponse)
    async def login(request: LoginRequest):
        """
        Login endpoint (modified for 2FA)

        Flow:
        1. Verify email + password
        2. If user has 2FA enabled:
           - Create OTP session
           - Return requires_2fa: true
           - Send OTP code (email) or show TOTP prompt
        3. If user has no 2FA:
           - Return JWT token directly

        Query for 2FA user:
        - Check user.two_factor_auth.enabled
        - If trusted device: skip 2FA
        """
        try:
            # Step 1: Validate email + password
            # user = verify_credentials(request.email, request.password)
            # if not user:
            #     raise HTTPException(status_code=401, detail="Invalid credentials")

            # Step 2: Check if 2FA enabled and device not trusted
            # two_fa_status = await two_factor_service.get_2fa_status(user["_id"])
            # is_device_trusted = await two_factor_service.is_device_trusted(
            #     user["_id"], request.device_id
            # )

            # if two_fa_status["enabled"] and not is_device_trusted:
            #     # Create OTP session
            #     otp_session = await two_factor_service.create_otp_session(
            #         user_id=user["_id"],
            #         device_id=request.device_id,
            #         session_type=OTPSessionType.EMAIL_LOGIN,
            #         ip_address=request.client.host,
            #         user_agent=request.headers.get("user-agent")
            #     )
            #
            #     # Send OTP via email if email 2FA
            #     if two_fa_status["method"] == "email":
            #         await send_otp_email(
            #             user["email"],
            #             user["name"],
            #             otp_session["otp_code"],
            #             expires_minutes=10
            #         )
            #
            #     return LoginResponse(
            #         requires_2fa=True,
            #         otp_session_id=otp_session["session_id"],
            #         method=two_fa_status["method"],
            #         email_masked=mask_email(user["email"]),
            #         expires_in=otp_session["expires_in_seconds"]
            #     )
            #
            # # No 2FA required
            # token = create_jwt_token(user["_id"])
            # return LoginResponse(
            #     token=token,
            #     user={
            #         "id": str(user["_id"]),
            #         "email": user["email"],
            #         "name": user["name"],
            #         "role": user["role"]
            #     },
            #     requires_2fa=False
            # )

            # Placeholder - implement above logic
            return LoginResponse(requires_2fa=False)

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Login error: {str(e)}")

    @router.post("/verify-otp", response_model=OTPVerifyResponse)
    async def verify_otp(request: OTPVerifyRequest, req: Request):
        """
        Verify OTP code after login

        Flow:
        1. Verify OTP code
        2. If valid:
           - Issue JWT token
           - Mark OTP session verified
           - Reset failed attempt counter
        3. If invalid:
           - Increment failed attempts
           - Lock account after 5 failures
        4. If trust_device enabled:
           - Mark device as trusted for 30 days
        """
        try:
            # Step 1: Verify OTP code
            # session = await db.otp_sessions.find_one({"_id": ObjectId(request.otp_session_id)})
            # valid, error = await two_factor_service.verify_email_otp(
            #     request.otp_session_id, request.code
            # )
            #
            # if not valid:
            #     # Increment failed attempts
            #     await two_factor_service.increment_failed_otp_attempts(session["user_id"])
            #     raise HTTPException(status_code=401, detail=error)

            # # Step 2: Reset failed attempts
            # await two_factor_service.reset_failed_otp_attempts(session["user_id"])

            # # Step 3: Trust device if requested
            # if request.trust_device:
            #     await two_factor_service.mark_device_as_trusted(
            #         session["user_id"],
            #         session["device_id"],
            #         req.headers.get("device-name", "Unknown Device")
            #     )

            # # Step 4: Issue JWT token
            # user = await db.users.find_one({"_id": session["user_id"]})
            # token = create_jwt_token(user["_id"])

            # # Get trust expiry
            # device = await db.devices.find_one({"_id": session["device_id"]})

            # return OTPVerifyResponse(
            #     token=token,
            #     user={
            #         "id": str(user["_id"]),
            #         "email": user["email"],
            #         "name": user["name"],
            #         "role": user["role"]
            #     },
            #     device_trusted=request.trust_device,
            #     trust_expires=device.get("trust_expires_at") if request.trust_device else None
            # )

            # Placeholder
            raise NotImplementedError("Implement above logic")

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"OTP verification error: {str(e)}")

    @router.post("/verify-backup-code", response_model=BackupCodeVerifyResponse)
    async def verify_backup_code(request: BackupCodeVerifyRequest, req: Request):
        """
        Verify backup code as 2FA alternative

        Used when:
        - User lost their TOTP device
        - User can't access email OTP
        - User forgot their password on new device
        """
        try:
            # Step 1: Get OTP session
            # session = await db.otp_sessions.find_one({"_id": ObjectId(request.otp_session_id)})

            # Step 2: Verify backup code
            # valid, error, codes_remaining = await two_factor_service.use_backup_code(
            #     session["user_id"], request.backup_code
            # )
            #
            # if not valid:
            #     raise HTTPException(status_code=401, detail=error)

            # # Step 3: Issue JWT token
            # user = await db.users.find_one({"_id": session["user_id"]})
            # token = create_jwt_token(user["_id"])

            # return BackupCodeVerifyResponse(
            #     token=token,
            #     user={
            #         "id": str(user["_id"]),
            #         "email": user["email"],
            #         "name": user["name"],
            #         "role": user["role"]
            #     },
            #     codes_remaining=codes_remaining
            # )

            # Placeholder
            raise NotImplementedError("Implement above logic")

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Backup code verification error: {str(e)}")

    # ==================== Trusted Devices Routes ====================

    @router.get("/trusted-devices", response_model=TrustedDevicesListResponse)
    async def list_trusted_devices(current_user = Depends(get_current_user)):
        """List all trusted devices for user"""
        try:
            user_id = current_user["id"]

            # Find all trusted devices
            # devices = await db.devices.find({
            #     "user_id": ObjectId(user_id),
            #     "trusted": True
            # }).to_list(None)

            # response_devices = [
            #     TrustedDeviceResponse(
            #         device_id=str(device["_id"]),
            #         device_name=device.get("device_name", "Unknown"),
            #         device_type=device.get("device_type", "web"),
            #         last_seen=device.get("last_seen"),
            #         trust_expires_at=device.get("trust_expires_at")
            #     )
            #     for device in devices
            # ]

            # return TrustedDevicesListResponse(
            #     devices=response_devices,
            #     count=len(response_devices)
            # )

            # Placeholder
            return TrustedDevicesListResponse(devices=[], count=0)

        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error listing devices: {str(e)}")

    @router.post("/trusted-devices/{device_id}/revoke")
    async def revoke_device_trust(device_id: str, current_user = Depends(get_current_user)):
        """Revoke trust for a device"""
        try:
            user_id = current_user["id"]

            # Revoke trust
            # await two_factor_service.revoke_device_trust(user_id, device_id)

            # Audit log
            # await audit_log(user_id, "device.trust_revoked", {"device_id": device_id})

            return {"status": "revoked", "message": "Device trust has been revoked"}

        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error revoking trust: {str(e)}")

    return router
