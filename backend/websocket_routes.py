"""
WebSocket Routes for Phase 1.7: Real-time Messaging
Implements the main WebSocket endpoint and message handlers
"""

import json
import logging
from typing import Optional, Dict, List
from uuid import uuid4
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect, APIRouter, Query, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
import jwt

from websocket_service import (
    WebSocketManager,
    WebSocketEvent,
    get_websocket_manager,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# JWT configuration (will be injected by server.py at startup)
_JWT_SECRET: Optional[str] = None
_JWT_ALGORITHM = "HS256"


def set_jwt_secret(secret: str) -> None:
    """Initialize JWT secret from server.py"""
    global _JWT_SECRET
    _JWT_SECRET = secret
    logger.debug("JWT secret configured for WebSocket routes")


async def validate_token(token: str) -> Optional[Dict]:
    """
    Validate JWT token and return payload
    Returns None if invalid
    """
    if not _JWT_SECRET:
        logger.error("JWT secret not configured")
        return None

    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
        return payload
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token: {e}")
        return None
    except Exception as e:
        logger.error(f"Error validating token: {e}")
        return None


async def validate_case_access(
    user_id: str,
    case_id: str,
    db: AsyncIOMotorDatabase,
) -> bool:
    """
    Check if user has access to a case
    User can access if they are:
    - assigned_lawyer_id
    - assigned_secretary_id
    - in client_ids
    """
    try:
        case = await db.cases.find_one({"_id": case_id})

        if not case:
            logger.warning(f"Case {case_id} not found")
            return False

        # Check lawyer access
        if case.get("assigned_lawyer_id") == user_id:
            return True

        # Check secretary access
        if case.get("assigned_secretary_id") == user_id:
            return True

        # Check client access
        client_ids = case.get("client_ids", [])
        if user_id in client_ids:
            return True

        logger.warning(f"User {user_id} not authorized for case {case_id}")
        return False

    except Exception as e:
        logger.error(f"Error validating case access: {e}")
        return False


async def log_websocket_event(
    user_id: str,
    device_id: str,
    case_id: str,
    event_type: str,
    action: str,
    details: Dict,
    db: AsyncIOMotorDatabase,
) -> None:
    """
    Log WebSocket event to audit_logs collection
    """
    try:
        audit_entry = {
            "timestamp": datetime.utcnow(),
            "user_id": user_id,
            "device_id": device_id,
            "case_id": case_id,
            "action": action,
            "event_type": event_type,
            "details": details,
        }

        await db.audit_logs.insert_one(audit_entry)
        logger.debug(f"Logged WebSocket event: {event_type} for case {case_id}")

    except Exception as e:
        logger.error(f"Error logging WebSocket event: {e}")


# ==================== WEBSOCKET ENDPOINT ====================


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
    device_id: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(lambda: None),  # Will be injected by server.py
):
    """
    Main WebSocket endpoint for real-time case updates

    Query Parameters:
        token: JWT authentication token
        device_id: Device ID (from Phase 1.5 device registration)

    Client Connection:
        ws://localhost:8000/ws?token=<JWT>&device_id=<device-uuid>

    Client → Server Events:
        {
            "action": "join_room",
            "case_id": "case-uuid"
        }

        {
            "action": "leave_room",
            "case_id": "case-uuid"
        }

        {
            "action": "send_event",
            "event_type": "note.created",
            "case_id": "case-uuid",
            "data": {...}
        }

        {
            "action": "typing",
            "case_id": "case-uuid",
            "field": "notes",
            "started": true
        }

    Server → Client Events:
        {
            "event_type": "case.updated",
            "case_id": "case-uuid",
            "user_id": "user-uuid",
            "device_id": "device-uuid",
            "timestamp": "2024-04-18T10:30:00",
            "data": {...}
        }
    """

    # ===== AUTHENTICATION =====
    payload = await validate_token(token)

    if not payload:
        await websocket.accept()
        await websocket.close(code=4001, reason="Unauthorized")
        return

    user_id = payload.get("sub")
    if not user_id:
        await websocket.accept()
        await websocket.close(code=4001, reason="Invalid token payload")
        return

    # ===== CONNECTION SETUP =====
    ws_manager = get_websocket_manager()

    try:
        await ws_manager.connect(websocket, user_id, device_id)
        logger.info(f"WebSocket connected: user={user_id}, device={device_id}")

        # Send connection acknowledgement
        await websocket.send_json({
            "event_type": "connection.established",
            "message": "Connected to WebSocket server",
            "server_time": datetime.utcnow().isoformat(),
        })

        # ===== MESSAGE HANDLING LOOP =====
        while True:
            # Receive client message
            raw_message = await websocket.receive_text()
            message = json.loads(raw_message)

            action = message.get("action")
            logger.debug(f"Received action: {action} from user {user_id}")

            # ===== ROUTE ACTION =====
            if action == "join_room":
                await handle_join_room(
                    ws_manager, user_id, device_id, message, db
                )

            elif action == "leave_room":
                await handle_leave_room(
                    ws_manager, user_id, device_id, message, db
                )

            elif action == "send_event":
                await handle_send_event(
                    ws_manager, user_id, device_id, message, db
                )

            elif action == "typing":
                await handle_typing(
                    ws_manager, user_id, device_id, message, db
                )

            elif action == "ping":
                # Heartbeat to keep connection alive
                await websocket.send_json({"event_type": "pong"})

            else:
                logger.warning(f"Unknown action: {action}")
                await websocket.send_json({
                    "event_type": "error",
                    "message": f"Unknown action: {action}",
                })

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: user={user_id}, device={device_id}")
        await ws_manager.disconnect(user_id, device_id)

    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        try:
            await websocket.close(code=4000, reason="Invalid JSON")
        except:
            pass
        await ws_manager.disconnect(user_id, device_id)

    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close(code=4000, reason="Server error")
        except:
            pass
        await ws_manager.disconnect(user_id, device_id)


# ==================== EVENT HANDLERS ====================


async def handle_join_room(
    ws_manager: WebSocketManager,
    user_id: str,
    device_id: str,
    message: Dict,
    db: AsyncIOMotorDatabase,
) -> None:
    """Handle user joining a case room"""
    case_id = message.get("case_id")

    if not case_id:
        logger.warning(f"join_room: missing case_id from {user_id}")
        return

    # Validate access
    has_access = await validate_case_access(user_id, case_id, db)

    if not has_access:
        logger.warning(f"User {user_id} denied access to case {case_id}")
        return

    # Join the room
    await ws_manager.join_room(user_id, case_id)

    # Log event
    await log_websocket_event(
        user_id=user_id,
        device_id=device_id,
        case_id=case_id,
        event_type="connection",
        action="join_room",
        details={"case_id": case_id},
        db=db,
    )

    # Broadcast user joined event to room (exclude self)
    event = WebSocketEvent(
        event_type="user.joined",
        case_id=case_id,
        user_id=user_id,
        device_id=device_id,
        data={"message": f"User {user_id} joined the case"},
        message_id=str(uuid4()),
    )

    await ws_manager.broadcast_to_room(case_id, event, exclude_user=user_id)

    logger.info(f"User {user_id} joined room {case_id}")


async def handle_leave_room(
    ws_manager: WebSocketManager,
    user_id: str,
    device_id: str,
    message: Dict,
    db: AsyncIOMotorDatabase,
) -> None:
    """Handle user leaving a case room"""
    case_id = message.get("case_id")

    if not case_id:
        logger.warning(f"leave_room: missing case_id from {user_id}")
        return

    # Leave the room
    await ws_manager.leave_room(user_id, case_id)

    # Log event
    await log_websocket_event(
        user_id=user_id,
        device_id=device_id,
        case_id=case_id,
        event_type="connection",
        action="leave_room",
        details={"case_id": case_id},
        db=db,
    )

    # Broadcast user left event
    event = WebSocketEvent(
        event_type="user.left",
        case_id=case_id,
        user_id=user_id,
        device_id=device_id,
        data={"message": f"User {user_id} left the case"},
        message_id=str(uuid4()),
    )

    await ws_manager.broadcast_to_room(case_id, event)

    logger.info(f"User {user_id} left room {case_id}")


async def handle_send_event(
    ws_manager: WebSocketManager,
    user_id: str,
    device_id: str,
    message: Dict,
    db: AsyncIOMotorDatabase,
) -> None:
    """Handle case update event from client"""
    event_type = message.get("event_type")
    case_id = message.get("case_id")
    data = message.get("data", {})
    message_id = message.get("message_id", str(uuid4()))

    if not event_type or not case_id:
        logger.warning(f"send_event: missing event_type or case_id from {user_id}")
        return

    # Validate access
    has_access = await validate_case_access(user_id, case_id, db)
    if not has_access:
        logger.warning(f"User {user_id} denied access to case {case_id}")
        return

    # Check for duplicate message
    if ws_manager.is_duplicate_message(message_id):
        logger.debug(f"Duplicate message {message_id} from {user_id}")
        return

    ws_manager.mark_message_processed(message_id)

    # Create event
    event = WebSocketEvent(
        event_type=event_type,
        case_id=case_id,
        user_id=user_id,
        device_id=device_id,
        data=data,
        message_id=message_id,
    )

    # Log event
    await log_websocket_event(
        user_id=user_id,
        device_id=device_id,
        case_id=case_id,
        event_type=event_type,
        action="send_event",
        details=data,
        db=db,
    )

    # Broadcast event to room
    await ws_manager.broadcast_to_room(case_id, event, exclude_user=user_id)

    logger.debug(f"Broadcasted {event_type} to case {case_id}")


async def handle_typing(
    ws_manager: WebSocketManager,
    user_id: str,
    device_id: str,
    message: Dict,
    db: AsyncIOMotorDatabase,
) -> None:
    """Handle typing indicator from user"""
    case_id = message.get("case_id")
    field = message.get("field", "notes")
    started = message.get("started", True)

    if not case_id:
        logger.warning(f"typing: missing case_id from {user_id}")
        return

    # Validate access
    has_access = await validate_case_access(user_id, case_id, db)
    if not has_access:
        logger.warning(f"User {user_id} denied access to case {case_id}")
        return

    # Create typing event
    event = WebSocketEvent(
        event_type="user.typing",
        case_id=case_id,
        user_id=user_id,
        device_id=device_id,
        data={
            "started": started,
            "field": field,
        },
        message_id=str(uuid4()),
    )

    # Broadcast typing indicator to room (exclude sender)
    await ws_manager.broadcast_to_room(case_id, event, exclude_user=user_id)

    logger.debug(f"User {user_id} typing in case {case_id}")


# ==================== REST ENDPOINTS FOR WEBSOCKET MANAGEMENT ====================


@router.get("/api/v1/websocket/stats")
async def get_websocket_stats():
    """
    Get WebSocket server statistics
    Returns connection counts, rooms, etc.
    """
    ws_manager = get_websocket_manager()
    return ws_manager.get_stats()


@router.get("/api/v1/websocket/room/{case_id}")
async def get_room_presence(case_id: str):
    """
    Get presence information for a specific case room
    Returns list of online users and their devices
    """
    ws_manager = get_websocket_manager()
    presence = ws_manager.get_room_presence(case_id)
    return {"case_id": case_id, "presence": presence}


@router.get("/api/v1/websocket/user/{user_id}")
async def get_user_status(user_id: str):
    """
    Get WebSocket status for a specific user
    Returns online status and connected devices
    """
    ws_manager = get_websocket_manager()
    status = ws_manager.get_user_status(user_id)
    return {"user_id": user_id, "status": status}
