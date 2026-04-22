"""
PWA API Routes (v1) - Mobile and Desktop App Support
Handles device registration, delta sync, and mobile-specific endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId
from device_service import get_device_service, DEVICE_TYPES
from push_service import get_push_service
import logging

logger = logging.getLogger("routes_pwa")

# Router for v1 API routes
router = APIRouter(prefix="/api/v1", tags=["v1-mobile"])


# ────────────────────────────────────────────────────────────────────────────
# Request/Response Models
# ────────────────────────────────────────────────────────────────────────────

class RegisterDeviceRequest(BaseModel):
    """Device registration request"""
    device_name: str = Field(..., min_length=1, max_length=255, description="Device name")
    device_type: str = Field(..., description="Device type: ios | android | web | desktop")
    push_token: str = Field(..., min_length=1, description="Firebase Cloud Messaging token")
    app_version: str = Field(..., description="App version (e.g., 1.0.0)")


class DeviceResponse(BaseModel):
    """Device details response"""
    device_id: str
    device_name: str
    device_type: str
    trusted: bool
    registered_at: str
    last_seen: str
    app_version: str


class TrustDeviceRequest(BaseModel):
    """Request to trust a device"""
    device_name: Optional[str] = Field(None, description="Optional updated device name")


class DeltaSyncRequest(BaseModel):
    """Delta sync request for efficient mobile updates"""
    last_sync: Optional[datetime] = Field(None, description="Timestamp of last sync")


class DeltaSyncResponse(BaseModel):
    """Delta sync response with only changed data"""
    cases: List[Dict[str, Any]] = []
    documents: List[Dict[str, Any]] = []
    messages: List[Dict[str, Any]] = []
    updates: List[Dict[str, Any]] = []
    last_sync_at: str
    has_more: bool = False


# ────────────────────────────────────────────────────────────────────────────
# Device Management Endpoints
# ────────────────────────────────────────────────────────────────────────────

def _get_device_service(db) -> Any:
    """Dependency injection for device service"""
    return get_device_service(db)


async def device_service_dependency(request: Request):
    """Get device service with DB context"""
    # This will be injected from server.py with proper DB reference
    return get_device_service(None)


@router.post("/auth/register-device", response_model=Dict[str, Any])
async def register_device(
    req: RegisterDeviceRequest,
    user: Dict[str, Any] = Depends(lambda: None),  # Placeholder, will be injected by server.py
    db: Any = None,  # Placeholder, will be injected by server.py
) -> Dict[str, Any]:
    """
    Register a new device for push notifications

    This endpoint allows mobile apps and PWAs to register themselves for push notifications.

    **Request body:**
    - `device_name`: Human-readable device name (e.g., "iPhone 15 Pro")
    - `device_type`: One of: ios, android, web, desktop
    - `push_token`: Firebase Cloud Messaging token
    - `app_version`: Version of the app (e.g., "1.0.0")

    **Responses:**
    - 200: Device registered successfully
    - 400: Invalid device type or missing fields
    - 401: Unauthorized (no valid JWT token)
    - 500: Server error

    **Example:**
    ```bash
    curl -X POST http://localhost:8000/api/v1/auth/register-device \\
      -H "Authorization: Bearer {token}" \\
      -H "Content-Type: application/json" \\
      -d '{
        "device_name": "iPhone 15 Pro",
        "device_type": "ios",
        "push_token": "FCM_TOKEN_HERE",
        "app_version": "1.0.0"
      }'
    ```

    **Note:** Server.py will handle dependency injection for `user` and `db`
    """
    # This is a placeholder. The actual implementation will be in server.py
    # where dependency injection with proper context will be available.
    return {
        "device_id": "placeholder",
        "error": "This endpoint must be registered in server.py with proper dependencies"
    }


@router.get("/auth/register-device")
async def list_user_devices(
    user: Dict[str, Any] = Depends(lambda: None),
    db: Any = None
) -> List[DeviceResponse]:
    """
    Get all devices registered for current user

    **Responses:**
    - 200: List of devices
    - 401: Unauthorized
    - 500: Server error

    **Example response:**
    ```json
    [
      {
        "device_id": "507f1f77bcf86cd799439011",
        "device_name": "iPhone 15 Pro",
        "device_type": "ios",
        "trusted": true,
        "registered_at": "2024-04-15T10:30:00Z",
        "last_seen": "2024-04-17T14:22:00Z",
        "app_version": "1.0.0"
      }
    ]
    ```
    """
    return []


@router.post("/auth/register-device/{device_id}/trust")
async def trust_device(
    device_id: str,
    req: TrustDeviceRequest,
    user: Dict[str, Any] = Depends(lambda: None),
    db: Any = None
) -> Dict[str, Any]:
    """
    Mark device as trusted (skip 2FA for 30 days)

    **Parameters:**
    - `device_id`: ID of device to trust

    **Request body:**
    - `device_name` (optional): Updated device name

    **Responses:**
    - 200: Device trusted
    - 404: Device not found
    - 401: Unauthorized
    - 500: Server error

    **Note:** After trusting a device, 2FA will be skipped on that device for 30 days.
    """
    return {"status": "placeholder"}


@router.delete("/auth/register-device/{device_id}")
async def unregister_device(
    device_id: str,
    user: Dict[str, Any] = Depends(lambda: None),
    db: Any = None
) -> Dict[str, str]:
    """
    Unregister/delete a device

    **Parameters:**
    - `device_id`: ID of device to delete

    **Responses:**
    - 200: Device deleted
    - 404: Device not found
    - 401: Unauthorized
    - 500: Server error
    """
    return {"status": "placeholder"}


# ────────────────────────────────────────────────────────────────────────────
# Delta Sync Endpoint (efficient mobile data sync)
# ────────────────────────────────────────────────────────────────────────────

@router.get("/cases/sync", response_model=DeltaSyncResponse)
async def delta_sync(
    last_sync: Optional[datetime] = None,
    device_id: Optional[str] = None,
    user: Dict[str, Any] = Depends(lambda: None),
    db: Any = None
) -> DeltaSyncResponse:
    """
    Delta sync: Get only case data modified since last sync

    This endpoint is optimized for mobile apps to fetch only updated data,
    reducing bandwidth and improving performance.

    **Query Parameters:**
    - `last_sync`: ISO 8601 timestamp of last sync (e.g., "2024-04-15T10:30:00Z")
    - `device_id`: Optional device ID for sync tracking

    **Responses:**
    - 200: Synced data with changes since last_sync
    - 400: Invalid parameters
    - 401: Unauthorized
    - 500: Server error

    **Example:**
    ```bash
    curl "http://localhost:8000/api/v1/cases/sync?last_sync=2024-04-15T10:30:00Z" \\
      -H "Authorization: Bearer {token}"
    ```

    **Response structure:**
    - `cases`: Array of case objects modified since last_sync
    - `documents`: Array of documents modified since last_sync
    - `messages`: Array of messages since last_sync
    - `updates`: Array of other updates (notes, financials, etc.)
    - `last_sync_at`: Server timestamp of this sync
    - `has_more`: Whether more data is available (pagination)

    **Benefits for mobile:**
    - Reduces data transfer (only changes)
    - Faster sync (smaller payloads)
    - Better battery life
    - Supports offline-first architecture
    """
    return DeltaSyncResponse(
        cases=[],
        documents=[],
        messages=[],
        updates=[],
        last_sync_at=datetime.utcnow().isoformat(),
        has_more=False
    )


@router.post("/cases/sync/complete")
async def mark_sync_complete(
    device_id: str,
    sync_timestamp: datetime,
    user: Dict[str, Any] = Depends(lambda: None),
    db: Any = None
) -> Dict[str, str]:
    """
    Mark sync as complete on device

    **Request body:**
    - `device_id`: ID of device
    - `sync_timestamp`: Timestamp of completed sync

    **Responses:**
    - 200: Sync marked complete
    - 401: Unauthorized
    - 500: Server error
    """
    return {"status": "placeholder"}


# ────────────────────────────────────────────────────────────────────────────
# Mobile-Specific Auth Endpoints
# ────────────────────────────────────────────────────────────────────────────

@router.post("/auth/logout")
async def logout_device(
    device_id: Optional[str] = None,
    user: Dict[str, Any] = Depends(lambda: None),
    db: Any = None
) -> Dict[str, str]:
    """
    Logout from a specific device

    Invalidates the JWT token for a specific device and removes it from trusted devices list.

    **Request body:**
    - `device_id` (optional): Specific device to logout. If omitted, logs out from all devices.

    **Responses:**
    - 200: Logged out successfully
    - 401: Unauthorized
    - 500: Server error

    **Example:**
    ```bash
    curl -X POST http://localhost:8000/api/v1/auth/logout \\
      -H "Authorization: Bearer {token}" \\
      -H "Content-Type: application/json" \\
      -d '{"device_id": "507f1f77bcf86cd799439011"}'
    ```
    """
    return {"status": "placeholder"}


# ────────────────────────────────────────────────────────────────────────────
# Health Check & Version Info
# ────────────────────────────────────────────────────────────────────────────

@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """
    API health check and version information

    Used by mobile apps to verify API availability and check for version updates.

    **Responses:**
    - 200: API is healthy

    **Example response:**
    ```json
    {
      "status": "ok",
      "version": "1.0.0",
      "min_app_version": "1.0.0",
      "required_app_version": null,
      "timestamp": "2024-04-17T14:30:00Z"
    }
    ```

    **Note:**
    - `required_app_version`: If set, client MUST upgrade before proceeding
    - `min_app_version`: Recommended minimum version (clients can continue with warning)
    """
    return {
        "status": "ok",
        "version": "1.0.0",
        "min_app_version": "1.0.0",
        "required_app_version": None,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.get("/auth/me")
async def get_current_user_info(
    user: Dict[str, Any] = Depends(lambda: None),
    db: Any = None
) -> Dict[str, Any]:
    """
    Get current authenticated user info (v1 enhanced)

    Extended version of /api/auth/me with mobile-specific fields.

    **Responses:**
    - 200: User info including device list
    - 401: Unauthorized
    - 500: Server error

    **Additional fields (v1):**
    - `devices`: List of registered devices
    - `trusted_devices`: List of device IDs with active trust (2FA exempt)
    - `app_preferences`: User's app preferences
    - `two_factor_enabled`: Whether 2FA is enabled

    **Example response:**
    ```json
    {
      "id": "user_id",
      "email": "lawyer@law.com",
      "name": "John Doe",
      "role": "lawyer",
      "devices": [
        {
          "device_id": "device_id_1",
          "device_name": "iPhone 15",
          "device_type": "ios",
          "trusted": true
        }
      ],
      "app_preferences": {
        "notification_enabled": true,
        "offline_mode_enabled": true
      }
    }
    ```
    """
    return {"placeholder": True}


# ────────────────────────────────────────────────────────────────────────────
# Configuration & Info Endpoints
# ────────────────────────────────────────────────────────────────────────────

@router.get("/config/app")
async def get_app_config(user: Dict[str, Any] = Depends(lambda: None)) -> Dict[str, Any]:
    """
    Get app configuration for mobile clients

    Returns configuration needed by mobile apps at startup.

    **Responses:**
    - 200: App configuration
    - 401: Unauthorized (for user-specific config)

    **Example response:**
    ```json
    {
      "api_version": "1.0.0",
      "features": {
        "offline_mode": true,
        "push_notifications": true,
        "websocket_messaging": true,
        "two_factor_auth": true
      },
      "ui_config": {
        "theme": "light",
        "language": "el"
      }
    }
    ```
    """
    return {
        "api_version": "1.0.0",
        "features": {
            "offline_mode": True,
            "push_notifications": True,
            "websocket_messaging": False,  # Not in MVP
            "two_factor_auth": False  # Phase 1.6
        }
    }
