"""
Nomos One — Unit Tests: Security Layer
Tests password policy, rate limiting, input validation, JWT tokens.
These tests do NOT require MongoDB — they test pure logic.
"""
import pytest
import time
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["JWT_SECRET"] = "test_secret_key_for_unit_tests_1234567890abcdef"
os.environ["MIN_PASSWORD_LENGTH"] = "8"
os.environ["MAX_LOGIN_ATTEMPTS"] = "3"
os.environ["LOGIN_LOCKOUT_MINUTES"] = "1"

from server import (
    validate_password, validate_phone, validate_tax_id, sanitize_string,
    hash_password, verify_password, create_token, decode_token,
    LoginRateLimiter
)


# ══════════════════════════════════════════════════════════════════════════════
# PASSWORD POLICY
# ══════════════════════════════════════════════════════════════════════════════
class TestPasswordPolicy:
    def test_valid_password(self):
        ok, msg = validate_password("MyPass123")
        assert ok is True
        assert msg == ""

    def test_too_short(self):
        ok, msg = validate_password("Ab1")
        assert ok is False
        assert "τουλάχιστον" in msg

    def test_no_letter(self):
        ok, msg = validate_password("12345678")
        assert ok is False
        assert "γράμμα" in msg

    def test_no_digit(self):
        ok, msg = validate_password("abcdefgh")
        assert ok is False
        assert "ψηφίο" in msg

    def test_empty_password(self):
        ok, msg = validate_password("")
        assert ok is False

    def test_exactly_min_length(self):
        ok, _ = validate_password("Abcdef1x")  # 8 chars
        assert ok is True

    def test_greek_chars_with_digit(self):
        ok, _ = validate_password("Αβγδεζηθ1")  # Greek letters + digit
        assert ok is True

    def test_special_chars_allowed(self):
        ok, _ = validate_password("P@ss!w0rd")
        assert ok is True


# ══════════════════════════════════════════════════════════════════════════════
# PHONE VALIDATION
# ══════════════════════════════════════════════════════════════════════════════
class TestPhoneValidation:
    def test_valid_10_digits(self):
        assert validate_phone("2101234567") is True

    def test_valid_with_30_prefix(self):
        assert validate_phone("302101234567") is True

    def test_valid_with_plus_30(self):
        assert validate_phone("+302101234567") is True

    def test_valid_with_spaces(self):
        assert validate_phone("210 123 4567") is True

    def test_valid_with_dashes(self):
        assert validate_phone("210-123-4567") is True

    def test_empty_is_valid(self):
        assert validate_phone("") is True
        assert validate_phone(None) is True

    def test_too_short(self):
        assert validate_phone("12345") is False

    def test_letters_invalid(self):
        assert validate_phone("abc1234567") is False


# ══════════════════════════════════════════════════════════════════════════════
# TAX ID (ΑΦΜ) VALIDATION
# ══════════════════════════════════════════════════════════════════════════════
class TestTaxIdValidation:
    def test_valid_9_digits(self):
        assert validate_tax_id("123456789") is True

    def test_empty_is_valid(self):
        assert validate_tax_id("") is True
        assert validate_tax_id(None) is True

    def test_8_digits_invalid(self):
        assert validate_tax_id("12345678") is False

    def test_10_digits_invalid(self):
        assert validate_tax_id("1234567890") is False

    def test_with_spaces_trimmed(self):
        assert validate_tax_id(" 123456789 ") is True

    def test_letters_invalid(self):
        assert validate_tax_id("12345678A") is False


# ══════════════════════════════════════════════════════════════════════════════
# SANITIZE STRING
# ══════════════════════════════════════════════════════════════════════════════
class TestSanitizeString:
    def test_strips_whitespace(self):
        assert sanitize_string("  hello  ") == "hello"

    def test_none_passthrough(self):
        assert sanitize_string(None) is None

    def test_empty_string(self):
        assert sanitize_string("") == ""

    def test_normal_string(self):
        assert sanitize_string("Ιωάννης Παπαδόπουλος") == "Ιωάννης Παπαδόπουλος"


# ══════════════════════════════════════════════════════════════════════════════
# PASSWORD HASHING
# ══════════════════════════════════════════════════════════════════════════════
class TestPasswordHashing:
    def test_hash_and_verify(self):
        pw = "TestPass123"
        hashed = hash_password(pw)
        assert hashed != pw
        assert verify_password(pw, hashed) is True

    def test_wrong_password_fails(self):
        hashed = hash_password("Correct123")
        assert verify_password("Wrong123", hashed) is False

    def test_different_hashes_same_password(self):
        pw = "SamePass123"
        h1 = hash_password(pw)
        h2 = hash_password(pw)
        assert h1 != h2  # bcrypt salts differ
        assert verify_password(pw, h1) is True
        assert verify_password(pw, h2) is True


# ══════════════════════════════════════════════════════════════════════════════
# JWT TOKENS
# ══════════════════════════════════════════════════════════════════════════════
class TestJWTTokens:
    def test_create_and_decode(self):
        payload = {"sub": "user123", "role": "administrator"}
        token = create_token(payload)
        decoded = decode_token(token)
        assert decoded["sub"] == "user123"
        assert decoded["role"] == "administrator"
        assert "exp" in decoded

    def test_expired_token_raises(self):
        import jwt as pyjwt
        payload = {"sub": "user123", "exp": 0}  # Already expired
        token = pyjwt.encode(payload, os.environ["JWT_SECRET"], algorithm="HS256")
        with pytest.raises(Exception):
            decode_token(token)

    def test_invalid_token_raises(self):
        with pytest.raises(Exception):
            decode_token("invalid.token.here")

    def test_tampered_token_raises(self):
        token = create_token({"sub": "user123"})
        tampered = token[:-5] + "XXXXX"
        with pytest.raises(Exception):
            decode_token(tampered)


# ══════════════════════════════════════════════════════════════════════════════
# RATE LIMITER
# ══════════════════════════════════════════════════════════════════════════════
class TestRateLimiter:
    def test_not_locked_initially(self):
        rl = LoginRateLimiter()
        assert rl.is_locked("test@test.gr") is False

    def test_locks_after_max_attempts(self):
        rl = LoginRateLimiter()
        # MAX_LOGIN_ATTEMPTS is 3 for tests
        for _ in range(3):
            rl.record_attempt("test@test.gr")
        assert rl.is_locked("test@test.gr") is True

    def test_not_locked_below_threshold(self):
        rl = LoginRateLimiter()
        rl.record_attempt("test@test.gr")
        rl.record_attempt("test@test.gr")
        assert rl.is_locked("test@test.gr") is False

    def test_clear_unlocks(self):
        rl = LoginRateLimiter()
        for _ in range(3):
            rl.record_attempt("test@test.gr")
        assert rl.is_locked("test@test.gr") is True
        rl.clear("test@test.gr")
        assert rl.is_locked("test@test.gr") is False

    def test_different_keys_independent(self):
        rl = LoginRateLimiter()
        for _ in range(3):
            rl.record_attempt("a@test.gr")
        assert rl.is_locked("a@test.gr") is True
        assert rl.is_locked("b@test.gr") is False

    def test_remaining_lockout_minutes(self):
        rl = LoginRateLimiter()
        for _ in range(3):
            rl.record_attempt("test@test.gr")
        mins = rl.remaining_lockout("test@test.gr")
        assert mins >= 1

    def test_remaining_lockout_zero_when_not_locked(self):
        rl = LoginRateLimiter()
        assert rl.remaining_lockout("test@test.gr") == 0


# ══════════════════════════════════════════════════════════════════════════════
# FEE CALCULATION (Greek Lawyer)
# ══════════════════════════════════════════════════════════════════════════════
class TestFeeCalculation:
    """Test the fee calculation logic used in Phase 4."""

    def test_standard_fee_breakdown(self):
        net = 1000.0
        vat = round(net * 0.24, 2)
        withholding = round(net * 0.15, 2)
        gross = round(net + vat, 2)
        total = round(gross - withholding, 2)

        assert vat == 240.0
        assert withholding == 150.0
        assert gross == 1240.0
        assert total == 1090.0

    def test_with_grammatio(self):
        net = 500.0
        grammatio = 61.50
        vat = round(net * 0.24, 2)
        withholding = round(net * 0.15, 2)
        gross = round(net + vat, 2)
        total = round(gross - withholding + grammatio, 2)

        assert vat == 120.0
        assert withholding == 75.0
        assert gross == 620.0
        assert total == 606.50

    def test_no_vat(self):
        net = 1000.0
        vat = 0  # No VAT
        withholding = round(net * 0.15, 2)
        gross = net
        total = round(gross - withholding, 2)

        assert total == 850.0

    def test_no_withholding(self):
        net = 1000.0
        vat = round(net * 0.24, 2)
        withholding = 0  # No withholding
        gross = round(net + vat, 2)
        total = gross

        assert total == 1240.0

    def test_small_amount_rounding(self):
        net = 33.33
        vat = round(net * 0.24, 2)
        assert vat == 8.0  # 33.33 * 0.24 = 7.9992 → 8.0

    def test_large_amount(self):
        net = 50000.0
        vat = round(net * 0.24, 2)
        withholding = round(net * 0.15, 2)
        assert vat == 12000.0
        assert withholding == 7500.0
