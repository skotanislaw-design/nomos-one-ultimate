"""
Nomos One — Test Configuration & Fixtures
Uses mongomock for in-memory MongoDB testing.
"""
import pytest
import pytest_asyncio
import asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timedelta
import os
import sys

# Set test environment before importing server
os.environ["MONGO_URI"] = "mongodb://localhost:27017"
os.environ["DB_NAME"] = "nomos_one_test"
os.environ["JWT_SECRET"] = "test_secret_key_for_testing_only_1234567890"
os.environ["DOCUMENT_STORAGE_PATH"] = "/tmp/nomos_test_docs"
os.environ["MIN_PASSWORD_LENGTH"] = "8"
os.environ["MAX_LOGIN_ATTEMPTS"] = "5"
os.environ["LOGIN_LOCKOUT_MINUTES"] = "1"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from server import app, hash_password, create_token, rate_limiter


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def client():
    """Async HTTP client for testing FastAPI endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def admin_token():
    """Generate a valid admin JWT token."""
    return create_token({"sub": "000000000000000000000001", "role": "administrator"})


@pytest.fixture
def lawyer_token():
    """Generate a valid lawyer JWT token."""
    return create_token({"sub": "000000000000000000000002", "role": "lawyer"})


@pytest.fixture
def secretary_token():
    """Generate a valid secretary JWT token."""
    return create_token({"sub": "000000000000000000000003", "role": "secretary"})


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def lawyer_headers(lawyer_token):
    return {"Authorization": f"Bearer {lawyer_token}"}


@pytest.fixture
def secretary_headers(secretary_token):
    return {"Authorization": f"Bearer {secretary_token}"}


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Clear rate limiter state between tests."""
    rate_limiter._attempts.clear()
    rate_limiter._lockouts.clear()
    yield
    rate_limiter._attempts.clear()
    rate_limiter._lockouts.clear()


# ── Test Data ─────────────────────────────────────────────────────────────────
TEST_ADMIN = {
    "email": "admin@test.gr",
    "name": "Test Admin",
    "password": hash_password("TestAdmin123"),
    "role": "administrator",
    "is_active": True,
    "created_at": datetime.utcnow(),
    "must_change_password": False,
}

TEST_LAWYER = {
    "email": "lawyer@test.gr",
    "name": "Test Lawyer",
    "password": hash_password("TestLawyer123"),
    "role": "lawyer",
    "is_active": True,
    "created_at": datetime.utcnow(),
    "must_change_password": False,
}

TEST_CLIENT = {
    "name": "Ιωάννης Παπαδόπουλος",
    "email": "ioannis@test.gr",
    "phone": "2101234567",
    "address": "Αθήνα, Σταδίου 10",
    "tax_id": "123456789",
    "notes": "Δοκιμαστικός εντολέας",
}
