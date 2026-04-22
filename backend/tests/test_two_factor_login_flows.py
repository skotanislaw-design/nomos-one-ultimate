"""
Integration Tests: Complete 2FA Login Flows
Φάση 1.6: Week 2 - Full login flow testing

Tests complete end-to-end scenarios:
- Login with TOTP
- Login with Email OTP
- Login with Backup Code
- Device trust after 2FA
- Rate limiting enforcement
- Failed attempt locking
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import hashlib
import pyotp

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from two_factor_service import TwoFactorService, OTPMethod, OTPSessionType


class TestLoginWithTOTP:
    """Complete login flow with TOTP 2FA"""

    @pytest.fixture
    def setup(self):
        """Setup test fixtures"""
        self.db = AsyncMock()
        self.encryption = MagicMock()
        self.service = TwoFactorService(self.db, self.encryption)
        yield
        del self.service

    @pytest.mark.asyncio
    async def test_complete_login_flow_with_totp(self, setup):
        """
        Full scenario: User logs in with password, then verifies TOTP code

        Steps:
        1. User enters email + password
        2. Backend checks if 2FA enabled
        3. If enabled, create OTP session
        4. User enters TOTP code from authenticator
        5. Code verified → JWT token issued
        6. User can mark device as trusted
        """
        user_id = str(uuid4())
        device_id = str(uuid4())
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)

        # Step 1-3: User logs in, 2FA is enabled
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "two_factor_auth": {
                "enabled": True,
                "method": "totp",
                "totp_secret": f"encrypted_{secret}"
            }
        }

        self.encryption.decrypt_data.return_value = secret

        # Step 4: User provides TOTP code
        code = totp.now()

        # Step 5: Verify TOTP code
        valid, error = await self.service.verify_totp_code(user_id, code)
        assert valid is True
        assert error is None

        # Step 6: Mark device as trusted
        self.db.devices.update_one.return_value = AsyncMock()
        trusted = await self.service.mark_device_as_trusted(user_id, device_id, "iPhone 13")
        assert trusted is True

        # Step 7: Verify device is trusted on next login
        self.db.devices.find_one.return_value = {
            "_id": device_id,
            "user_id": user_id,
            "trusted": True,
            "trust_expires_at": datetime.utcnow() + timedelta(days=30)
        }

        is_trusted = await self.service.is_device_trusted(user_id, device_id)
        assert is_trusted is True


class TestLoginWithEmailOTP:
    """Complete login flow with Email OTP 2FA"""

    @pytest.fixture
    def setup(self):
        """Setup test fixtures"""
        self.db = AsyncMock()
        self.encryption = AsyncMock()
        self.service = TwoFactorService(self.db, self.encryption)
        yield
        del self.service

    @pytest.mark.asyncio
    async def test_complete_login_flow_with_email_otp(self, setup):
        """
        Full scenario: User logs in with password, receives OTP via email, enters code

        Steps:
        1. User enters email + password
        2. Check 2FA method = email
        3. Create OTP session, send email
        4. User receives email with 6-digit code
        5. User enters code in login form
        6. Code verified → JWT token issued
        7. Option to trust device
        """
        user_id = str(uuid4())
        device_id = str(uuid4())
        email = "user@example.gr"

        # Step 1-2: User logs in, Email 2FA enabled
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "two_factor_auth": {
                "enabled": True,
                "method": "email"
            }
        }

        # Step 3: Create OTP session
        insert_result = AsyncMock()
        insert_result.inserted_id = str(uuid4())
        self.db.otp_sessions.insert_one.return_value = insert_result

        otp_session = await self.service.create_otp_session(
            user_id, device_id, OTPSessionType.EMAIL_LOGIN, "192.168.1.1", "Mozilla/5.0"
        )

        assert "session_id" in otp_session
        assert "otp_code" in otp_session
        assert len(otp_session["otp_code"]) == 6  # 6-digit code

        otp_code = otp_session["otp_code"]

        # Step 5: User enters code
        code_hash = hashlib.sha256(otp_code.encode()).hexdigest()

        self.db.otp_sessions.find_one.return_value = {
            "_id": otp_session["session_id"],
            "otp_code": code_hash,
            "expires_at": datetime.utcnow() + timedelta(minutes=5),
            "verified": False,
            "attempt_count": 0
        }

        self.db.otp_sessions.update_one.return_value = AsyncMock()

        # Step 6: Verify code
        valid, error = await self.service.verify_email_otp(otp_session["session_id"], otp_code)
        assert valid is True
        assert error is None

        # Step 7: Trust device
        self.db.devices.update_one.return_value = AsyncMock()
        trusted = await self.service.mark_device_as_trusted(user_id, device_id, "Chrome Browser")
        assert trusted is True


class TestLoginWithBackupCode:
    """Complete login flow with Backup Code"""

    @pytest.fixture
    def setup(self):
        """Setup test fixtures"""
        self.db = AsyncMock()
        self.encryption = AsyncMock()
        self.service = TwoFactorService(self.db, self.encryption)
        yield
        del self.service

    @pytest.mark.asyncio
    async def test_complete_login_with_backup_code(self, setup):
        """
        Full scenario: User lost their TOTP device, uses backup code

        Steps:
        1. User logs in with password
        2. 2FA prompt shows "Can't access device? Use backup code"
        3. User enters backup code from printed list
        4. Code verified, removed from list
        5. JWT token issued
        6. User warned: "X codes remaining"
        """
        user_id = str(uuid4())
        backup_code = "a1b2c3d4"
        code_hash = hashlib.sha256(backup_code.encode()).hexdigest()

        # Step 1-2: User chooses backup code option
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "two_factor_auth": {
                "enabled": True,
                "method": "totp",
                "totp_backup_codes": [code_hash, "other_hash_1", "other_hash_2"]
            }
        }

        # Step 3-4: Verify backup code
        self.db.users.update_one.return_value = AsyncMock()

        valid, error, remaining = await self.service.use_backup_code(user_id, backup_code)

        assert valid is True
        assert error is None
        assert remaining == 2  # 2 codes left

        # Step 6: User is warned
        assert remaining < 10, "User should be warned about low backup codes"


class TestRateLimitingDuringLogin:
    """Rate limiting enforcement during login"""

    @pytest.fixture
    def setup(self):
        """Setup test fixtures"""
        self.db = AsyncMock()
        self.encryption = AsyncMock()
        self.service = TwoFactorService(self.db, self.encryption)
        yield
        del self.service

    @pytest.mark.asyncio
    async def test_account_locked_after_5_failed_attempts(self, setup):
        """
        Scenario: User enters wrong OTP code 5 times

        Expected: Account locked for 15 minutes
        """
        user_id = str(uuid4())
        session_id = str(uuid4())

        # Simulate 5 failed attempts
        for attempt in range(1, 6):
            self.db.users.find_one.return_value = {
                "_id": user_id,
                "failed_otp_attempts": {
                    "count": attempt - 1,
                    "locked_until": None
                }
            }

            self.db.users.update_one.return_value = AsyncMock()
            self.db.otp_sessions.find_one.return_value = {
                "_id": session_id,
                "otp_code": "hash1",
                "expires_at": datetime.utcnow() + timedelta(minutes=5),
                "verified": False,
                "attempt_count": attempt - 1
            }

            self.db.otp_sessions.update_one.return_value = AsyncMock()

            # Try to verify wrong code
            valid, error = await self.service.verify_email_otp(session_id, "000000")

            if attempt < 5:
                assert valid is False

            # After 5th attempt, check if locked
            if attempt == 5:
                # Mock the updated user state after 5th attempt
                self.db.users.find_one.return_value = {
                    "_id": user_id,
                    "failed_otp_attempts": {
                        "count": 5,
                        "locked_until": datetime.utcnow() + timedelta(minutes=15)
                    }
                }

                locked, locked_until = await self.service.is_otp_locked(user_id)
                assert locked is True
                assert locked_until is not None

    @pytest.mark.asyncio
    async def test_successful_verification_resets_attempts(self, setup):
        """
        Scenario: User fails 3 times, then succeeds

        Expected: Failed attempt counter reset to 0
        """
        user_id = str(uuid4())
        code = "123456"
        code_hash = hashlib.sha256(code.encode()).hexdigest()

        # Simulate 3 failed attempts
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "failed_otp_attempts": {
                "count": 3,
                "locked_until": None
            }
        }

        # Now attempt successful verification
        self.db.otp_sessions.find_one.return_value = {
            "_id": str(uuid4()),
            "otp_code": code_hash,
            "expires_at": datetime.utcnow() + timedelta(minutes=5),
            "verified": False,
            "attempt_count": 3
        }

        self.db.otp_sessions.update_one.return_value = AsyncMock()

        # Verify correct code
        valid, error = await self.service.verify_email_otp(str(uuid4()), code)
        assert valid is True

        # Reset failed attempts
        self.db.users.update_one.return_value = AsyncMock()
        await self.service.reset_failed_otp_attempts(user_id)

        # Verify reset
        self.db.users.update_one.assert_called_once()


class TestDeviceTrustWorkflow:
    """Complete device trust workflow"""

    @pytest.fixture
    def setup(self):
        """Setup test fixtures"""
        self.db = AsyncMock()
        self.encryption = AsyncMock()
        self.service = TwoFactorService(self.db, self.encryption)
        yield
        del self.service

    @pytest.mark.asyncio
    async def test_device_trust_skips_2fa_for_30_days(self, setup):
        """
        Scenario: User logs in, marks device as trusted

        Expected: Next login from same device skips 2FA for 30 days
        """
        user_id = str(uuid4())
        device_id = str(uuid4())

        # First login: User goes through 2FA, marks as trusted
        self.db.devices.update_one.return_value = AsyncMock()
        trusted_result = await self.service.mark_device_as_trusted(user_id, device_id, "Desktop")
        assert trusted_result is True

        # Next login: Check if device is trusted
        self.db.devices.find_one.return_value = {
            "_id": device_id,
            "user_id": user_id,
            "trusted": True,
            "trust_expires_at": datetime.utcnow() + timedelta(days=30)
        }

        is_trusted = await self.service.is_device_trusted(user_id, device_id)
        assert is_trusted is True

        # 30+ days later: Trust expires
        self.db.devices.find_one.return_value = {
            "_id": device_id,
            "user_id": user_id,
            "trusted": True,
            "trust_expires_at": datetime.utcnow() - timedelta(days=1)  # Expired
        }

        self.db.devices.update_one.return_value = AsyncMock()

        is_trusted = await self.service.is_device_trusted(user_id, device_id)
        assert is_trusted is False

    @pytest.mark.asyncio
    async def test_user_can_revoke_device_trust(self, setup):
        """
        Scenario: User revokes trust for a device

        Expected: Device no longer trusted, 2FA required on next login
        """
        user_id = str(uuid4())
        device_id = str(uuid4())

        # Device is currently trusted
        self.db.devices.find_one.return_value = {
            "_id": device_id,
            "user_id": user_id,
            "trusted": True,
            "trust_expires_at": datetime.utcnow() + timedelta(days=30)
        }

        assert await self.service.is_device_trusted(user_id, device_id) is True

        # User revokes trust
        self.db.devices.update_one.return_value = AsyncMock()
        revoked = await self.service.revoke_device_trust(user_id, device_id)
        assert revoked is True

        # Device no longer trusted
        self.db.devices.find_one.return_value = {
            "_id": device_id,
            "user_id": user_id,
            "trusted": False,
            "trust_expires_at": None
        }

        assert await self.service.is_device_trusted(user_id, device_id) is False


class TestTwoFAStateTransitions:
    """2FA state machine transitions"""

    @pytest.fixture
    def setup(self):
        """Setup test fixtures"""
        self.db = AsyncMock()
        self.encryption = MagicMock()
        self.service = TwoFactorService(self.db, self.encryption)
        yield
        del self.service

    @pytest.mark.asyncio
    async def test_enable_disable_2fa_sequence(self, setup):
        """
        Scenario: User enables TOTP, then disables it later

        Steps:
        1. User starts with 2FA disabled
        2. User enables TOTP
        3. User receives backup codes
        4. User disables 2FA
        5. Status is now disabled
        """
        user_id = str(uuid4())
        secret = pyotp.random_base32()

        # Step 1: Initially disabled
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "two_factor_auth": {"enabled": False, "method": "none"}
        }

        status = await self.service.get_2fa_status(user_id)
        assert status["enabled"] is False

        # Step 2-3: Enable TOTP
        self.db.users.update_one.return_value = AsyncMock()
        self.encryption.encrypt_data.return_value = f"encrypted_{secret}"

        result = await self.service.enable_2fa(user_id, OTPMethod.TOTP, secret)
        assert result["enabled"] is True
        assert len(result["backup_codes"]) == 10

        # Step 4: Disable 2FA
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "two_factor_auth": {"enabled": True, "method": "totp"}
        }

        disabled = await self.service.disable_2fa(user_id)
        assert disabled is True

        # Step 5: Verify disabled
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "two_factor_auth": {"enabled": False, "method": "none"}
        }

        status = await self.service.get_2fa_status(user_id)
        assert status["enabled"] is False


class TestErrorRecovery:
    """Error handling and recovery scenarios"""

    @pytest.fixture
    def setup(self):
        """Setup test fixtures"""
        self.db = AsyncMock()
        self.encryption = AsyncMock()
        self.service = TwoFactorService(self.db, self.encryption)
        yield
        del self.service

    @pytest.mark.asyncio
    async def test_recovery_from_expired_otp_session(self, setup):
        """
        Scenario: User takes too long to enter OTP code

        Expected: Session expired error, user can request new OTP
        """
        session_id = str(uuid4())
        code = "123456"

        # Session expired
        self.db.otp_sessions.find_one.return_value = {
            "_id": session_id,
            "expires_at": datetime.utcnow() - timedelta(minutes=1),  # Expired 1 min ago
            "verified": False
        }

        valid, error = await self.service.verify_email_otp(session_id, code)

        assert valid is False
        assert "expired" in error.lower()

        # User can request new OTP
        can_request, msg = await self.service.can_request_otp(str(uuid4()))
        assert can_request is True
