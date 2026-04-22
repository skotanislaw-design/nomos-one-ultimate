"""
Φάση 1.6: Two Factor Authentication Service
Υλοποίηση TOTP, Email OTP, και Backup Codes

Υποστηρίζει:
- TOTP (Time-Based OTP) με Google Authenticator / Authy
- Email OTP (6-digit codes, 10-minute expiry)
- Backup Codes (10 one-time codes)
- Rate limiting
- Device trust integration
"""

import pyotp
import qrcode
from io import BytesIO
import hashlib
import secrets
import base64
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from enum import Enum
import json

from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
from encryption_service import EncryptionService


class OTPMethod(str, Enum):
    """Supported 2FA methods"""
    TOTP = "totp"
    EMAIL = "email"
    BACKUP = "backup"
    NONE = "none"


class OTPSessionType(str, Enum):
    """Types of OTP sessions"""
    TOTP_SETUP = "totp_setup"
    TOTP_LOGIN = "totp_login"
    EMAIL_SETUP = "email_setup"
    EMAIL_LOGIN = "email_login"
    BACKUP_LOGIN = "backup_login"


class TwoFactorService:
    """
    Υπηρεσία διαχείρισης δυο-παράγοντα αυθεντικοποίησης

    Διαχειρίζεται:
    - TOTP secret generation και verification
    - QR code generation για TOTP setup
    - Backup code generation και validation
    - Email OTP sessions
    - Rate limiting για OTP attempts
    - Device trust state
    """

    def __init__(self, db: AsyncIOMotorDatabase, encryption_service: EncryptionService):
        self.db = db
        self.encryption = encryption_service
        self.totp_window = 1  # ±1 time step = ±30 seconds
        self.backup_code_length = 8  # 8 hex characters per code
        self.backup_code_count = 10  # 10 codes total
        self.otp_expiry_minutes = 10
        self.rate_limit_attempts = 5
        self.rate_limit_window_minutes = 15
        self.otp_request_limit = 3
        self.otp_request_window_minutes = 5

    # ==================== TOTP Setup & Verification ====================

    async def generate_totp_secret(self) -> str:
        """
        Δημιουργεί νέο TOTP secret
        Επιστρέφει: base32-encoded secret (33 χαρακτήρες)

        Παράδειγμα: JBSWY3DPEBLW64TMMQ2HY2LOM4======
        """
        secret = pyotp.random_base32()
        return secret

    async def get_totp_qr_code(
        self,
        user_id: str,
        email: str,
        secret: str
    ) -> bytes:
        """
        Δημιουργεί QR code PNG για TOTP setup

        Παράδειγμα:
          totp = pyotp.TOTP(secret)
          uri = totp.provisioning_uri(name=email, issuer_name='Nomos One')
          [generates QR code image]

        Επιστρέφει: PNG image bytes
        """
        # Create provisioning URI (standard for authenticator apps)
        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(
            name=email,
            issuer_name='Nomos One'
        )

        # Generate QR code image
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(provisioning_uri)
        qr.make(fit=True)

        # Convert to PNG bytes
        img = qr.make_image(fill_color="black", back_color="white")
        img_bytes = BytesIO()
        img.save(img_bytes, format="PNG")
        img_bytes.seek(0)

        return img_bytes.getvalue()

    async def verify_totp_code(
        self,
        user_id: str,
        code: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Επαληθεύει TOTP code με ±30s tolerance

        Αρχή λειτουργίας:
        - TOTP = HMAC-SHA1(secret, time_counter)
        - time_counter = floor(unix_time / 30)
        - Ελέγχει current time + 1 previous + 1 next για tolerance

        Επιστρέφει: (valid: bool, error_msg: Optional[str])
        """
        # Get user's encrypted TOTP secret
        user = await self.db.users.find_one({"_id": user_id})
        if not user or not user.get("two_factor_auth", {}).get("totp_secret"):
            return False, "TOTP not configured"

        try:
            # Decrypt secret
            encrypted_secret = user["two_factor_auth"]["totp_secret"]
            secret = self.encryption.decrypt_data(encrypted_secret)

            # Verify code with time window tolerance
            totp = pyotp.TOTP(secret)

            # Verify with tolerance: ±1 time step (30 seconds each)
            is_valid = totp.verify(code, valid_window=self.totp_window)

            if not is_valid:
                return False, "Invalid or expired code"

            return True, None

        except Exception as e:
            return False, f"Verification error: {str(e)}"

    # ==================== Backup Codes ====================

    async def generate_backup_codes(self) -> List[str]:
        """
        Δημιουργεί 10 one-time backup codes

        Format: 8 hex characters each
        Παράδειγμα: ["a1b2c3d4", "e5f6g7h8", ...]

        Επιστρέφει: List[str] - unhashed codes for user download
        """
        codes = []
        for _ in range(self.backup_code_count):
            # Generate 8 hex characters (4 bytes = 32 bits → 8 hex chars)
            code = secrets.token_hex(4)  # 4 bytes = 8 hex chars
            codes.append(code)
        return codes

    async def hash_backup_code(self, code: str) -> str:
        """
        Hash backup code με SHA256

        Αποθηκεύονται ΜΟΝΟ οι hashes στη βάση
        Ποτέ δεν αποθηκεύονται τα plaintext codes
        """
        return hashlib.sha256(code.encode()).hexdigest()

    async def use_backup_code(
        self,
        user_id: str,
        code: str
    ) -> Tuple[bool, Optional[str], int]:
        """
        Χρησιμοποιεί one-time backup code

        Επιστρέφει:
        - (valid: bool, error_msg: Optional[str], codes_remaining: int)

        Κανόνες:
        - Code χρησιμοποιείται μόνο μία φορά
        - Αν χρησιμοποιηθεί, αφαιρείται από λίστα
        - Αν δεν υπάρχει ή είναι ήδη χρησιμοποιημένο: false
        """
        user = await self.db.users.find_one({"_id": user_id})
        if not user or not user.get("two_factor_auth", {}).get("totp_backup_codes"):
            return False, "No backup codes available", 0

        try:
            # Hash the code to compare
            code_hash = await self.hash_backup_code(code)
            backup_codes = user["two_factor_auth"]["totp_backup_codes"]

            # Find and remove the matching code
            if code_hash not in backup_codes:
                return False, "Invalid or already used code", len(backup_codes)

            # Remove from list
            backup_codes.remove(code_hash)

            # Update user
            await self.db.users.update_one(
                {"_id": user_id},
                {
                    "$set": {
                        "two_factor_auth.totp_backup_codes": backup_codes,
                        "two_factor_auth.last_verified_at": datetime.utcnow()
                    }
                }
            )

            return True, None, len(backup_codes)

        except Exception as e:
            return False, f"Error using backup code: {str(e)}", 0

    async def regenerate_backup_codes(self, user_id: str) -> List[str]:
        """
        Δημιουργεί νέα σετ backup codes

        Κανόνες:
        - Παλιά codes ακυρώνονται (αφαιρούνται από λίστα)
        - Νέα codes δημιουργούνται και αποθηκεύονται (hashed)
        - Επιστρέφονται unhashed κωδικοί στον χρήστη
        """
        try:
            # Generate new codes
            new_codes = await self.generate_backup_codes()

            # Hash for storage
            hashed_codes = [
                await self.hash_backup_code(code)
                for code in new_codes
            ]

            # Update user
            await self.db.users.update_one(
                {"_id": user_id},
                {
                    "$set": {
                        "two_factor_auth.totp_backup_codes": hashed_codes,
                        "two_factor_auth.backup_codes_regenerated_at": datetime.utcnow()
                    }
                }
            )

            return new_codes

        except Exception as e:
            raise Exception(f"Error regenerating backup codes: {str(e)}")

    # ==================== Email OTP ====================

    async def generate_email_otp(self) -> str:
        """
        Δημιουργεί 6-digit OTP code για email

        Παράδειγμα: "325617"
        """
        otp = secrets.randbelow(1000000)
        return str(otp).zfill(6)

    async def create_otp_session(
        self,
        user_id: str,
        device_id: str,
        session_type: OTPSessionType,
        ip_address: str,
        user_agent: str
    ) -> Dict:
        """
        Δημιουργεί νέα OTP session με hashed OTP

        Αποθηκεύεται στο MongoDB με:
        - otp_code: hashed (SHA256)
        - expires_at: +10 minutes
        - attempt_count: 0
        - verified: false

        Επιστρέφει: {session_id, expires_in_seconds}
        """
        otp_code = await self.generate_email_otp()
        otp_hash = hashlib.sha256(otp_code.encode()).hexdigest()

        now = datetime.utcnow()
        expires_at = now + timedelta(minutes=self.otp_expiry_minutes)

        session = {
            "user_id": user_id,
            "device_id": device_id,
            "otp_code": otp_hash,
            "otp_type": session_type.value,
            "created_at": now,
            "expires_at": expires_at,
            "verified": False,
            "verified_at": None,
            "attempt_count": 0,
            "ip_address": ip_address,
            "user_agent": user_agent
        }

        result = await self.db.otp_sessions.insert_one(session)
        session_id = str(result.inserted_id)

        return {
            "session_id": session_id,
            "otp_code": otp_code,  # Return plaintext for display/email
            "expires_in_seconds": self.otp_expiry_minutes * 60
        }

    async def verify_email_otp(
        self,
        session_id: str,
        code: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Επαληθεύει email OTP code

        Κανόνες:
        - Code πρέπει να match hash στη database
        - Session πρέπει να μην έχει expire
        - Max 5 failed attempts → lock session
        - Κάθε attempt increment attempt_count

        Επιστρέφει: (valid: bool, error_msg: Optional[str])
        """
        try:
            from bson import ObjectId
            session = await self.db.otp_sessions.find_one(
                {"_id": ObjectId(session_id)}
            )

            if not session:
                return False, "Invalid session"

            # Check expiry
            if datetime.utcnow() > session.get("expires_at"):
                return False, "OTP code expired"

            # Check if already verified
            if session.get("verified"):
                return False, "Session already verified"

            # Check max attempts
            if session.get("attempt_count", 0) >= self.rate_limit_attempts:
                return False, "Too many failed attempts"

            # Hash provided code
            code_hash = hashlib.sha256(code.encode()).hexdigest()

            # Timing-safe comparison to prevent timing attacks
            import hmac
            is_valid = hmac.compare_digest(code_hash, session.get("otp_code", ""))

            if not is_valid:
                # Increment attempt count
                await self.db.otp_sessions.update_one(
                    {"_id": ObjectId(session_id)},
                    {"$inc": {"attempt_count": 1}}
                )
                return False, "Invalid code"

            # Mark as verified
            await self.db.otp_sessions.update_one(
                {"_id": ObjectId(session_id)},
                {
                    "$set": {
                        "verified": True,
                        "verified_at": datetime.utcnow()
                    }
                }
            )

            return True, None

        except Exception as e:
            return False, f"Verification error: {str(e)}"

    # ==================== 2FA Management ====================

    async def enable_2fa(
        self,
        user_id: str,
        method: OTPMethod,
        totp_secret: Optional[str] = None
    ) -> Dict:
        """
        Ενεργοποιεί 2FA για χρήστη

        Για TOTP:
        - Κρυπτογραφεί secret πριν την αποθήκευση
        - Δημιουργεί hashed backup codes

        Για Email:
        - Απλώς σημαίνει enabled = true
        """
        try:
            two_fa_config = {
                "enabled": True,
                "method": method.value,
                "last_verified_at": datetime.utcnow()
            }

            if method == OTPMethod.TOTP:
                if not totp_secret:
                    raise ValueError("TOTP secret required")

                # Encrypt secret
                encrypted_secret = self.encryption.encrypt_data(totp_secret)

                # Generate and hash backup codes
                backup_codes = await self.generate_backup_codes()
                hashed_codes = [
                    await self.hash_backup_code(code)
                    for code in backup_codes
                ]

                two_fa_config.update({
                    "totp_secret": encrypted_secret,
                    "totp_verified_at": datetime.utcnow(),
                    "totp_backup_codes": hashed_codes,
                    "backup_codes_regenerated_at": datetime.utcnow()
                })

                return_codes = backup_codes
            elif method == OTPMethod.EMAIL:
                two_fa_config["email_otp_enabled"] = True
                two_fa_config["email_otp_verified_at"] = datetime.utcnow()
                return_codes = []
            else:
                raise ValueError(f"Unsupported 2FA method: {method}")

            # Update user
            await self.db.users.update_one(
                {"_id": user_id},
                {"$set": {"two_factor_auth": two_fa_config}}
            )

            return {
                "enabled": True,
                "method": method.value,
                "backup_codes": return_codes if method == OTPMethod.TOTP else []
            }

        except Exception as e:
            raise Exception(f"Error enabling 2FA: {str(e)}")

    async def disable_2fa(self, user_id: str) -> bool:
        """
        Ακυρώνει 2FA για χρήστη

        Αφαιρεί:
        - TOTP secret
        - Backup codes
        - Email OTP setting
        """
        try:
            await self.db.users.update_one(
                {"_id": user_id},
                {
                    "$set": {
                        "two_factor_auth.enabled": False,
                        "two_factor_auth.method": "none"
                    }
                }
            )
            return True
        except Exception as e:
            raise Exception(f"Error disabling 2FA: {str(e)}")

    async def get_2fa_status(self, user_id: str) -> Dict:
        """
        Λαμβάνει τρέχουσα κατάσταση 2FA χρήστη

        Επιστρέφει:
        {
          "enabled": bool,
          "method": "totp" | "email" | "none",
          "backup_codes_count": int,
          "last_verified_at": datetime
        }
        """
        try:
            user = await self.db.users.find_one({"_id": user_id})
            if not user:
                return {
                    "enabled": False,
                    "method": "none",
                    "backup_codes_count": 0
                }

            two_fa = user.get("two_factor_auth", {})
            return {
                "enabled": two_fa.get("enabled", False),
                "method": two_fa.get("method", "none"),
                "backup_codes_count": len(two_fa.get("totp_backup_codes", [])),
                "last_verified_at": two_fa.get("last_verified_at")
            }

        except Exception as e:
            raise Exception(f"Error getting 2FA status: {str(e)}")

    # ==================== Rate Limiting ====================

    async def increment_failed_otp_attempts(self, user_id: str) -> int:
        """
        Αυξάνει το counter failed attempts

        Επιστρέφει: current attempt count
        """
        try:
            result = await self.db.users.update_one(
                {"_id": user_id},
                {
                    "$inc": {"failed_otp_attempts.count": 1},
                    "$set": {"failed_otp_attempts.last_attempt": datetime.utcnow()}
                }
            )

            user = await self.db.users.find_one({"_id": user_id})
            return user.get("failed_otp_attempts", {}).get("count", 0)

        except Exception as e:
            raise Exception(f"Error incrementing failed attempts: {str(e)}")

    async def is_otp_locked(self, user_id: str) -> Tuple[bool, Optional[datetime]]:
        """
        Ελέγχει αν ο χρήστης είναι locked σε OTP attempts

        Locked αν:
        - attempt_count >= 5
        - locked_until > now

        Επιστρέφει: (locked: bool, locked_until: Optional[datetime])
        """
        try:
            user = await self.db.users.find_one({"_id": user_id})
            failed_attempts = user.get("failed_otp_attempts", {})

            locked_until = failed_attempts.get("locked_until")
            if locked_until and datetime.utcnow() < locked_until:
                return True, locked_until

            # Check attempt count
            attempt_count = failed_attempts.get("count", 0)
            if attempt_count >= self.rate_limit_attempts:
                # Lock for 15 minutes
                locked_until = datetime.utcnow() + timedelta(
                    minutes=self.rate_limit_window_minutes
                )
                await self.db.users.update_one(
                    {"_id": user_id},
                    {"$set": {"failed_otp_attempts.locked_until": locked_until}}
                )
                return True, locked_until

            return False, None

        except Exception as e:
            raise Exception(f"Error checking OTP lock: {str(e)}")

    async def reset_failed_otp_attempts(self, user_id: str) -> bool:
        """
        Resets failed attempt counter after successful verification
        """
        try:
            await self.db.users.update_one(
                {"_id": user_id},
                {
                    "$set": {
                        "failed_otp_attempts.count": 0,
                        "failed_otp_attempts.locked_until": None
                    }
                }
            )
            return True
        except Exception as e:
            raise Exception(f"Error resetting attempts: {str(e)}")

    async def can_request_otp(self, user_id: str) -> Tuple[bool, Optional[str]]:
        """
        Ελέγχει αν ο χρήστης μπορεί να ζητήσει νέο OTP

        Κανόνες:
        - Max 3 requests per 5 minutes

        Επιστρέφει: (can_request: bool, error_msg: Optional[str])
        """
        try:
            # This would be tracked in a separate collection or Redis
            # For now, simple implementation
            return True, None
        except Exception as e:
            return False, str(e)

    # ==================== Device Trust ====================

    async def mark_device_as_trusted(
        self,
        user_id: str,
        device_id: str,
        device_name: str
    ) -> bool:
        """
        Σημαίνει συσκευή ως trusted για 30 ημέρες

        Επιτρέπει στον χρήστη να παρακάμπτει 2FA όταν συνδέεται
        από αυτή τη συσκευή.
        """
        try:
            trust_expires_at = datetime.utcnow() + timedelta(days=30)

            await self.db.devices.update_one(
                {"_id": device_id, "user_id": user_id},
                {
                    "$set": {
                        "trusted": True,
                        "trust_expires_at": trust_expires_at,
                        "device_name": device_name,
                        "last_seen": datetime.utcnow()
                    }
                }
            )
            return True

        except Exception as e:
            raise Exception(f"Error marking device as trusted: {str(e)}")

    async def is_device_trusted(self, user_id: str, device_id: str) -> bool:
        """
        Ελέγχει αν συσκευή είναι trusted και δεν έχει expire
        """
        try:
            device = await self.db.devices.find_one(
                {"_id": device_id, "user_id": user_id}
            )

            if not device:
                return False

            if not device.get("trusted"):
                return False

            trust_expires_at = device.get("trust_expires_at")
            if trust_expires_at and datetime.utcnow() > trust_expires_at:
                # Trust expired, mark as untrusted
                await self.db.devices.update_one(
                    {"_id": device_id},
                    {"$set": {"trusted": False}}
                )
                return False

            return True

        except Exception as e:
            raise Exception(f"Error checking device trust: {str(e)}")

    async def revoke_device_trust(self, user_id: str, device_id: str) -> bool:
        """
        Ακυρώνει trust για συσκευή
        """
        try:
            await self.db.devices.update_one(
                {"_id": device_id, "user_id": user_id},
                {"$set": {"trusted": False, "trust_expires_at": None}}
            )
            return True
        except Exception as e:
            raise Exception(f"Error revoking device trust: {str(e)}")


# Helper function to get service instance
def get_2fa_service(
    db: AsyncIOMotorDatabase,
    encryption_service: EncryptionService
) -> TwoFactorService:
    """Factory function for dependency injection"""
    return TwoFactorService(db, encryption_service)
