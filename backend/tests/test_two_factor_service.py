"""
Unit Tests for Two Factor Authentication Service
Φάση 1.6: TOTP, Email OTP, and Backup Codes

Covers:
- TOTP secret generation and verification
- Backup code generation and validation
- Email OTP sessions
- Rate limiting
- Device trust
"""

import pytest
import pyotp
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import hashlib
import asyncio

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from two_factor_service import (
    TwoFactorService,
    OTPMethod,
    OTPSessionType
)


class TestTOTPGeneration:
    """Tests for TOTP secret generation"""

    @pytest.fixture
    def setup(self):
        """Setup test fixtures"""
        self.db = AsyncMock()
        self.encryption = AsyncMock()
        self.service = TwoFactorService(self.db, self.encryption)
        yield
        del self.service

    @pytest.mark.asyncio
    async def test_generate_totp_secret(self, setup):
        """Test TOTP secret generation"""
        secret = await self.service.generate_totp_secret()

        # Secret should be base32 encoded
        assert isinstance(secret, str)
        assert len(secret) > 0

        # Should be valid base32
        import base64
        try:
            base64.b32decode(secret)
        except Exception as e:
            pytest.fail(f"Generated secret is not valid base32: {str(e)}")

    @pytest.mark.asyncio
    async def test_get_totp_qr_code(self, setup):
        """Test QR code generation"""
        secret = pyotp.random_base32()
        user_id = str(uuid4())
        email = "test@example.gr"

        qr_code = await self.service.get_totp_qr_code(user_id, email, secret)

        # Should return PNG bytes
        assert isinstance(qr_code, bytes)
        assert qr_code[:8] == b'\x89PNG\r\n\x1a\n'  # PNG magic number


class TestTOTPVerification:
    """Tests for TOTP code verification"""

    @pytest.fixture
    def setup(self):
        """Setup test fixtures"""
        self.db = AsyncMock()
        self.encryption = MagicMock()
        self.service = TwoFactorService(self.db, self.encryption)
        yield
        del self.service

    @pytest.mark.asyncio
    async def test_verify_totp_code_success(self, setup):
        """Test successful TOTP verification"""
        secret = pyotp.random_base32()
        user_id = str(uuid4())

        # Generate valid code
        totp = pyotp.TOTP(secret)
        code = totp.now()

        # Mock database
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "two_factor_auth": {
                "totp_secret": f"encrypted_{secret}"
            }
        }

        # Mock encryption
        self.encryption.decrypt_data.return_value = secret

        # Verify
        valid, error = await self.service.verify_totp_code(user_id, code)

        assert valid is True
        assert error is None

    @pytest.mark.asyncio
    async def test_verify_totp_code_invalid(self, setup):
        """Test invalid TOTP code"""
        secret = pyotp.random_base32()
        user_id = str(uuid4())

        # Mock database
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "two_factor_auth": {
                "totp_secret": f"encrypted_{secret}"
            }
        }

        # Mock encryption
        self.encryption.decrypt_data.return_value = secret

        # Try invalid code
        valid, error = await self.service.verify_totp_code(user_id, "000000")

        assert valid is False
        assert error is not None

    @pytest.mark.asyncio
    async def test_verify_totp_code_not_configured(self, setup):
        """Test TOTP verification when not configured"""
        user_id = str(uuid4())

        # Mock database - no TOTP
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "two_factor_auth": {}
        }

        valid, error = await self.service.verify_totp_code(user_id, "123456")

        assert valid is False
        assert "not configured" in error.lower()


class TestBackupCodes:
    """Tests for backup code generation and validation"""

    @pytest.fixture
    def setup(self):
        """Setup test fixtures"""
        self.db = AsyncMock()
        self.encryption = AsyncMock()
        self.service = TwoFactorService(self.db, self.encryption)
        yield
        del self.service

    @pytest.mark.asyncio
    async def test_generate_backup_codes(self, setup):
        """Test backup code generation"""
        codes = await self.service.generate_backup_codes()

        # Should generate 10 codes
        assert len(codes) == 10

        # Each code should be 8 hex characters
        for code in codes:
            assert len(code) == 8
            int(code, 16)  # Should be valid hex

        # Should be unique
        assert len(set(codes)) == 10

    @pytest.mark.asyncio
    async def test_hash_backup_code(self, setup):
        """Test backup code hashing"""
        code = "a1b2c3d4"
        hash1 = await self.service.hash_backup_code(code)

        # Should be SHA256 hash
        expected_hash = hashlib.sha256(code.encode()).hexdigest()
        assert hash1 == expected_hash

        # Same code should produce same hash
        hash2 = await self.service.hash_backup_code(code)
        assert hash1 == hash2

    @pytest.mark.asyncio
    async def test_use_backup_code_success(self, setup):
        """Test successful backup code usage"""
        user_id = str(uuid4())
        code = "a1b2c3d4"
        code_hash = hashlib.sha256(code.encode()).hexdigest()

        # Mock database
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "two_factor_auth": {
                "totp_backup_codes": [code_hash, "other_hash_1", "other_hash_2"]
            }
        }
        self.db.users.update_one.return_value = AsyncMock()

        # Use code
        valid, error, remaining = await self.service.use_backup_code(user_id, code)

        assert valid is True
        assert error is None
        assert remaining == 2

    @pytest.mark.asyncio
    async def test_use_backup_code_invalid(self, setup):
        """Test invalid backup code"""
        user_id = str(uuid4())
        code = "invalid00"
        code_hash = hashlib.sha256(code.encode()).hexdigest()

        # Mock database with different codes
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "two_factor_auth": {
                "totp_backup_codes": ["hash1", "hash2"]
            }
        }

        # Use invalid code
        valid, error, remaining = await self.service.use_backup_code(user_id, code)

        assert valid is False
        assert "invalid" in error.lower()
        assert remaining == 2

    @pytest.mark.asyncio
    async def test_use_backup_code_already_used(self, setup):
        """Test using backup code twice"""
        user_id = str(uuid4())
        code = "a1b2c3d4"
        code_hash = hashlib.sha256(code.encode()).hexdigest()

        # First use - success
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "two_factor_auth": {
                "totp_backup_codes": [code_hash]
            }
        }

        valid1, _, _ = await self.service.use_backup_code(user_id, code)
        assert valid1 is True

        # Second use - fail (no longer in list)
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "two_factor_auth": {
                "totp_backup_codes": []
            }
        }

        valid2, error, _ = await self.service.use_backup_code(user_id, code)
        assert valid2 is False

    @pytest.mark.asyncio
    async def test_regenerate_backup_codes(self, setup):
        """Test backup code regeneration"""
        user_id = str(uuid4())

        self.db.users.update_one.return_value = AsyncMock()

        new_codes = await self.service.regenerate_backup_codes(user_id)

        # Should generate 10 new codes
        assert len(new_codes) == 10

        # Should be unique
        assert len(set(new_codes)) == 10

        # Database should be updated
        self.db.users.update_one.assert_called_once()


class TestEmailOTP:
    """Tests for Email OTP sessions"""

    @pytest.fixture
    def setup(self):
        """Setup test fixtures"""
        self.db = AsyncMock()
        self.encryption = AsyncMock()
        self.service = TwoFactorService(self.db, self.encryption)
        yield
        del self.service

    @pytest.mark.asyncio
    async def test_generate_email_otp(self, setup):
        """Test email OTP generation"""
        otp = await self.service.generate_email_otp()

        # Should be 6 digits
        assert len(otp) == 6
        assert otp.isdigit()

    @pytest.mark.asyncio
    async def test_create_otp_session(self, setup):
        """Test OTP session creation"""
        user_id = str(uuid4())
        device_id = str(uuid4())
        ip = "192.168.1.1"
        user_agent = "Mozilla/5.0"

        # Mock insert
        insert_result = AsyncMock()
        insert_result.inserted_id = "session_id_123"
        self.db.otp_sessions.insert_one.return_value = insert_result

        result = await self.service.create_otp_session(
            user_id, device_id, OTPSessionType.EMAIL_LOGIN, ip, user_agent
        )

        # Should return session info
        assert "session_id" in result
        assert "otp_code" in result
        assert "expires_in_seconds" in result
        assert result["expires_in_seconds"] == 600  # 10 minutes

    @pytest.mark.asyncio
    async def test_verify_email_otp_success(self, setup):
        """Test successful email OTP verification"""
        session_id = str(uuid4())
        code = "123456"
        code_hash = hashlib.sha256(code.encode()).hexdigest()

        # Mock session
        self.db.otp_sessions.find_one.return_value = {
            "_id": session_id,
            "otp_code": code_hash,
            "expires_at": datetime.utcnow() + timedelta(minutes=5),
            "verified": False,
            "attempt_count": 0
        }

        self.db.otp_sessions.update_one.return_value = AsyncMock()

        valid, error = await self.service.verify_email_otp(session_id, code)

        assert valid is True
        assert error is None

    @pytest.mark.asyncio
    async def test_verify_email_otp_expired(self, setup):
        """Test expired OTP verification"""
        session_id = str(uuid4())
        code = "123456"

        # Mock expired session
        self.db.otp_sessions.find_one.return_value = {
            "_id": session_id,
            "expires_at": datetime.utcnow() - timedelta(minutes=1),
            "verified": False
        }

        valid, error = await self.service.verify_email_otp(session_id, code)

        assert valid is False
        assert "expired" in error.lower()

    @pytest.mark.asyncio
    async def test_verify_email_otp_max_attempts(self, setup):
        """Test max attempt enforcement"""
        session_id = str(uuid4())
        code = "123456"

        # Mock session with max attempts
        self.db.otp_sessions.find_one.return_value = {
            "_id": session_id,
            "expires_at": datetime.utcnow() + timedelta(minutes=5),
            "verified": False,
            "attempt_count": 5  # Max attempts reached
        }

        valid, error = await self.service.verify_email_otp(session_id, code)

        assert valid is False
        assert "too many" in error.lower()


class TestTwoFactorManagement:
    """Tests for 2FA enable/disable"""

    @pytest.fixture
    def setup(self):
        """Setup test fixtures"""
        self.db = AsyncMock()
        self.encryption = MagicMock()
        self.service = TwoFactorService(self.db, self.encryption)
        yield
        del self.service

    @pytest.mark.asyncio
    async def test_enable_totp_2fa(self, setup):
        """Test enabling TOTP 2FA"""
        user_id = str(uuid4())
        secret = pyotp.random_base32()

        self.db.users.update_one.return_value = AsyncMock()
        self.encryption.encrypt_data.return_value = f"encrypted_{secret}"

        result = await self.service.enable_2fa(user_id, OTPMethod.TOTP, secret)

        assert result["enabled"] is True
        assert result["method"] == "totp"
        assert len(result["backup_codes"]) == 10
        self.db.users.update_one.assert_called_once()

    @pytest.mark.asyncio
    async def test_enable_email_2fa(self, setup):
        """Test enabling Email 2FA"""
        user_id = str(uuid4())

        self.db.users.update_one.return_value = AsyncMock()

        result = await self.service.enable_2fa(user_id, OTPMethod.EMAIL)

        assert result["enabled"] is True
        assert result["method"] == "email"
        assert len(result["backup_codes"]) == 0

    @pytest.mark.asyncio
    async def test_disable_2fa(self, setup):
        """Test disabling 2FA"""
        user_id = str(uuid4())

        self.db.users.update_one.return_value = AsyncMock()

        result = await self.service.disable_2fa(user_id)

        assert result is True
        self.db.users.update_one.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_2fa_status(self, setup):
        """Test getting 2FA status"""
        user_id = str(uuid4())

        self.db.users.find_one.return_value = {
            "_id": user_id,
            "two_factor_auth": {
                "enabled": True,
                "method": "totp",
                "totp_backup_codes": ["hash1", "hash2"],
                "last_verified_at": datetime.utcnow()
            }
        }

        status = await self.service.get_2fa_status(user_id)

        assert status["enabled"] is True
        assert status["method"] == "totp"
        assert status["backup_codes_count"] == 2


class TestRateLimiting:
    """Tests for OTP rate limiting"""

    @pytest.fixture
    def setup(self):
        """Setup test fixtures"""
        self.db = AsyncMock()
        self.encryption = AsyncMock()
        self.service = TwoFactorService(self.db, self.encryption)
        yield
        del self.service

    @pytest.mark.asyncio
    async def test_increment_failed_attempts(self, setup):
        """Test incrementing failed attempts"""
        user_id = str(uuid4())

        self.db.users.update_one.return_value = AsyncMock()
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "failed_otp_attempts": {"count": 3}
        }

        count = await self.service.increment_failed_otp_attempts(user_id)

        assert count == 3

    @pytest.mark.asyncio
    async def test_is_otp_locked(self, setup):
        """Test OTP lock detection"""
        user_id = str(uuid4())

        # Not locked
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "failed_otp_attempts": {
                "count": 2,
                "locked_until": None
            }
        }

        locked, locked_until = await self.service.is_otp_locked(user_id)
        assert locked is False

        # Locked
        future = datetime.utcnow() + timedelta(minutes=10)
        self.db.users.find_one.return_value = {
            "_id": user_id,
            "failed_otp_attempts": {
                "count": 5,
                "locked_until": future
            }
        }

        locked, locked_until = await self.service.is_otp_locked(user_id)
        assert locked is True

    @pytest.mark.asyncio
    async def test_reset_failed_attempts(self, setup):
        """Test resetting failed attempts"""
        user_id = str(uuid4())

        self.db.users.update_one.return_value = AsyncMock()

        result = await self.service.reset_failed_otp_attempts(user_id)

        assert result is True
        self.db.users.update_one.assert_called_once()


class TestDeviceTrust:
    """Tests for device trust"""

    @pytest.fixture
    def setup(self):
        """Setup test fixtures"""
        self.db = AsyncMock()
        self.encryption = AsyncMock()
        self.service = TwoFactorService(self.db, self.encryption)
        yield
        del self.service

    @pytest.mark.asyncio
    async def test_mark_device_as_trusted(self, setup):
        """Test marking device as trusted"""
        user_id = str(uuid4())
        device_id = str(uuid4())

        self.db.devices.update_one.return_value = AsyncMock()

        result = await self.service.mark_device_as_trusted(user_id, device_id, "iPhone 13")

        assert result is True
        self.db.devices.update_one.assert_called_once()

    @pytest.mark.asyncio
    async def test_is_device_trusted_valid(self, setup):
        """Test checking if device is trusted (valid)"""
        user_id = str(uuid4())
        device_id = str(uuid4())

        self.db.devices.find_one.return_value = {
            "_id": device_id,
            "user_id": user_id,
            "trusted": True,
            "trust_expires_at": datetime.utcnow() + timedelta(days=30)
        }

        trusted = await self.service.is_device_trusted(user_id, device_id)

        assert trusted is True

    @pytest.mark.asyncio
    async def test_is_device_trusted_expired(self, setup):
        """Test checking if device is trusted (expired)"""
        user_id = str(uuid4())
        device_id = str(uuid4())

        self.db.devices.find_one.return_value = {
            "_id": device_id,
            "user_id": user_id,
            "trusted": True,
            "trust_expires_at": datetime.utcnow() - timedelta(days=1)
        }

        self.db.devices.update_one.return_value = AsyncMock()

        trusted = await self.service.is_device_trusted(user_id, device_id)

        assert trusted is False

    @pytest.mark.asyncio
    async def test_revoke_device_trust(self, setup):
        """Test revoking device trust"""
        user_id = str(uuid4())
        device_id = str(uuid4())

        self.db.devices.update_one.return_value = AsyncMock()

        result = await self.service.revoke_device_trust(user_id, device_id)

        assert result is True
        self.db.devices.update_one.assert_called_once()
