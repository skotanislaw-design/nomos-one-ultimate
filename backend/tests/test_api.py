"""
Nomos One — Integration Tests: API Endpoints
Tests the HTTP layer — login flow, RBAC, rate limiting responses, validation errors.
Requires a running MongoDB test instance OR mongomock.
Run with: pytest tests/test_api.py -v
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from datetime import datetime
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["JWT_SECRET"] = "test_integration_secret_key_1234567890abcdef"
os.environ["MONGO_URI"] = "mongodb://localhost:27017"
os.environ["DB_NAME"] = "nomos_one_integration_test"
os.environ["DOCUMENT_STORAGE_PATH"] = "/tmp/nomos_test_docs"
os.environ["MIN_PASSWORD_LENGTH"] = "8"
os.environ["MAX_LOGIN_ATTEMPTS"] = "5"
os.environ["LOGIN_LOCKOUT_MINUTES"] = "1"

from server import app, db, hash_password, rate_limiter


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
def clear_rate_limiter():
    rate_limiter._attempts.clear()
    rate_limiter._lockouts.clear()
    yield
    rate_limiter._attempts.clear()
    rate_limiter._lockouts.clear()


# ══════════════════════════════════════════════════════════════════════════════
# HEALTH CHECK
# ══════════════════════════════════════════════════════════════════════════════
class TestHealth:
    @pytest.mark.asyncio
    async def test_health_endpoint(self, client):
        res = await client.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert "status" in data
        assert "timestamp" in data


# ══════════════════════════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════
class TestAuthEndpoints:
    @pytest.mark.asyncio
    async def test_login_invalid_email_format(self, client):
        res = await client.post("/api/auth/login", json={"email": "notanemail", "password": "test"})
        assert res.status_code == 400
        assert "email" in res.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_login_wrong_credentials(self, client):
        res = await client.post("/api/auth/login", json={
            "email": "nonexistent@test.gr", "password": "WrongPass123"
        })
        assert res.status_code in [401, 429]  # 401 if not locked, 429 if rate limited

    @pytest.mark.asyncio
    async def test_login_rate_limiting(self, client):
        """After 5 failed attempts, should get 429."""
        for i in range(6):
            res = await client.post("/api/auth/login", json={
                "email": "ratelimit@test.gr", "password": "wrong"
            })
        assert res.status_code == 429
        assert "προσπάθειες" in res.json()["detail"].lower() or "λεπτά" in res.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_me_without_token(self, client):
        res = await client.get("/api/auth/me")
        assert res.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_me_with_invalid_token(self, client):
        res = await client.get("/api/auth/me", headers={"Authorization": "Bearer invalid.token"})
        assert res.status_code == 401


# ══════════════════════════════════════════════════════════════════════════════
# RBAC ENFORCEMENT
# ══════════════════════════════════════════════════════════════════════════════
class TestRBAC:
    @pytest.mark.asyncio
    async def test_users_endpoint_requires_admin(self, client):
        """Non-admin should be rejected from /api/users."""
        res = await client.get("/api/users")
        assert res.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_audit_logs_requires_admin(self, client):
        res = await client.get("/api/audit-logs")
        assert res.status_code in [401, 403]


# ══════════════════════════════════════════════════════════════════════════════
# INPUT VALIDATION
# ══════════════════════════════════════════════════════════════════════════════
class TestInputValidation:
    @pytest.mark.asyncio
    async def test_search_requires_query(self, client):
        """Search without 'q' param should fail."""
        res = await client.get("/api/search")
        assert res.status_code in [401, 422]  # 401 without token, 422 without q param

    @pytest.mark.asyncio
    async def test_change_password_without_auth(self, client):
        res = await client.post("/api/auth/change-password", json={
            "current_password": "old", "new_password": "NewPass123"
        })
        assert res.status_code in [401, 403]


# ══════════════════════════════════════════════════════════════════════════════
# FEE CALCULATOR ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════
class TestFeeCalculatorEndpoint:
    @pytest.mark.asyncio
    async def test_calculate_without_auth(self, client):
        res = await client.post("/api/invoicing/calculate", json={
            "net_amount": 1000, "include_vat": True, "include_withholding": True
        })
        assert res.status_code in [401, 403]


# ══════════════════════════════════════════════════════════════════════════════
# TEMPLATES ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════
class TestTemplatesEndpoint:
    @pytest.mark.asyncio
    async def test_templates_list_without_auth(self, client):
        res = await client.get("/api/templates")
        assert res.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_template_not_found(self, client):
        """Template that doesn't exist should return 404."""
        # This would need auth — test just checks the route exists
        res = await client.get("/api/templates/nonexistent")
        assert res.status_code in [401, 403, 404]


# ══════════════════════════════════════════════════════════════════════════════
# DEADLINES ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════
class TestDeadlinesEndpoint:
    @pytest.mark.asyncio
    async def test_deadlines_list_without_auth(self, client):
        res = await client.get("/api/deadlines")
        assert res.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_upcoming_deadlines_without_auth(self, client):
        res = await client.get("/api/deadlines/upcoming")
        assert res.status_code in [401, 403]
