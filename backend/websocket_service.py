"""
WebSocket Service for Phase 1.7: Real-time Messaging
Manages WebSocket connections, rooms, and event broadcasting
"""

import json
import logging
from typing import Dict, List, Set, Optional, Callable
from datetime import datetime
from uuid import uuid4
from fastapi import WebSocket, WebSocketDisconnect
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class WebSocketEvent:
    """Typed event for WebSocket messaging"""

    def __init__(
        self,
        event_type: str,
        case_id: str,
        user_id: str,
        device_id: str,
        data: dict,
        message_id: Optional[str] = None,
    ):
        self.event_type = event_type
        self.case_id = case_id
        self.user_id = user_id
        self.device_id = device_id
        self.data = data
        self.message_id = message_id or str(uuid4())
        self.timestamp = datetime.utcnow().isoformat()

    def to_json(self) -> str:
        """Serialize event to JSON"""
        return json.dumps({
            "event_type": self.event_type,
            "case_id": self.case_id,
            "user_id": self.user_id,
            "device_id": self.device_id,
            "data": self.data,
            "message_id": self.message_id,
            "timestamp": self.timestamp,
        })

    @staticmethod
    def from_json(data: str) -> "WebSocketEvent":
        """Deserialize event from JSON"""
        payload = json.loads(data)
        return WebSocketEvent(
            event_type=payload["event_type"],
            case_id=payload["case_id"],
            user_id=payload["user_id"],
            device_id=payload["device_id"],
            data=payload.get("data", {}),
            message_id=payload.get("message_id"),
        )


class ConnectionInfo:
    """Metadata about a WebSocket connection"""

    def __init__(self, websocket: WebSocket, user_id: str, device_id: str):
        self.websocket = websocket
        self.user_id = user_id
        self.device_id = device_id
        self.connected_at = datetime.utcnow()
        self.last_message_at = datetime.utcnow()
        self.subscribed_cases: Set[str] = set()

    async def send_json(self, data: dict) -> bool:
        """Send JSON data to client, return True if successful"""
        try:
            await self.websocket.send_json(data)
            self.last_message_at = datetime.utcnow()
            return True
        except Exception as e:
            logger.error(f"Error sending to {self.user_id}/{self.device_id}: {e}")
            return False


class WebSocketManager:
    """Central manager for all WebSocket connections, rooms, and broadcasting"""

    def __init__(self):
        # Track active connections per user
        # user_id -> {device_id: ConnectionInfo}
        self.active_connections: Dict[str, Dict[str, ConnectionInfo]] = {}

        # Track case room memberships
        # case_id -> set of user_ids
        self.case_rooms: Dict[str, Set[str]] = {}

        # Track processed messages for deduplication
        # message_id -> timestamp (keep last 10000 messages)
        self.processed_messages: Dict[str, datetime] = {}

        # Event handlers (for extending functionality)
        self.event_handlers: Dict[str, List[Callable]] = {}

        logger.info("WebSocketManager initialized")

    # ==================== CONNECTION MANAGEMENT ====================

    async def connect(
        self,
        websocket: WebSocket,
        user_id: str,
        device_id: str
    ) -> None:
        """Register a new WebSocket connection"""
        await websocket.accept()

        if user_id not in self.active_connections:
            self.active_connections[user_id] = {}

        conn_info = ConnectionInfo(websocket, user_id, device_id)
        self.active_connections[user_id][device_id] = conn_info

        logger.info(f"User {user_id} connected from device {device_id}")

    async def disconnect(self, user_id: str, device_id: str) -> None:
        """Unregister a WebSocket connection"""
        if user_id not in self.active_connections:
            return

        if device_id not in self.active_connections[user_id]:
            return

        conn_info = self.active_connections[user_id][device_id]

        # Remove from all subscribed rooms
        for case_id in list(conn_info.subscribed_cases):
            await self.leave_room(user_id, case_id)

        # Remove connection
        del self.active_connections[user_id][device_id]

        # Clean up empty user entries
        if not self.active_connections[user_id]:
            del self.active_connections[user_id]

        logger.info(f"User {user_id} disconnected from device {device_id}")

    # ==================== ROOM MANAGEMENT ====================

    async def join_room(self, user_id: str, case_id: str) -> None:
        """Subscribe user to case room updates"""
        if case_id not in self.case_rooms:
            self.case_rooms[case_id] = set()

        self.case_rooms[case_id].add(user_id)

        # Mark subscription in all user's connections
        if user_id in self.active_connections:
            for device_id in self.active_connections[user_id]:
                self.active_connections[user_id][device_id].subscribed_cases.add(case_id)

        logger.debug(f"User {user_id} joined case {case_id}")

    async def leave_room(self, user_id: str, case_id: str) -> None:
        """Unsubscribe user from case room updates"""
        if case_id in self.case_rooms:
            self.case_rooms[case_id].discard(user_id)

            # Clean up empty rooms
            if not self.case_rooms[case_id]:
                del self.case_rooms[case_id]

        # Mark unsubscription in all user's connections
        if user_id in self.active_connections:
            for device_id in self.active_connections[user_id]:
                self.active_connections[user_id][device_id].subscribed_cases.discard(case_id)

        logger.debug(f"User {user_id} left case {case_id}")

    def get_room_members(self, case_id: str) -> List[str]:
        """Get list of user IDs in a case room"""
        if case_id not in self.case_rooms:
            return []
        return list(self.case_rooms[case_id])

    # ==================== BROADCASTING ====================

    async def broadcast_to_room(
        self,
        case_id: str,
        event: WebSocketEvent,
        exclude_user: Optional[str] = None,
    ) -> None:
        """Broadcast event to all users in a case room"""
        if case_id not in self.case_rooms:
            logger.warning(f"Attempted to broadcast to non-existent room {case_id}")
            return

        # Trigger registered event handlers
        await self._trigger_handlers(event)

        failed_connections = []

        for user_id in self.case_rooms[case_id]:
            # Skip sender if requested
            if exclude_user and user_id == exclude_user:
                continue

            if user_id not in self.active_connections:
                continue

            # Send to all devices of this user
            for device_id, conn_info in self.active_connections[user_id].items():
                success = await conn_info.send_json(json.loads(event.to_json()))

                if not success:
                    failed_connections.append((user_id, device_id))

        # Clean up failed connections
        for user_id, device_id in failed_connections:
            await self.disconnect(user_id, device_id)

        logger.debug(
            f"Broadcasted {event.event_type} to {len(self.case_rooms.get(case_id, set()))} "
            f"users in case {case_id}"
        )

    async def broadcast_to_user(
        self,
        user_id: str,
        event: WebSocketEvent,
    ) -> None:
        """Send event to all devices of a specific user"""
        if user_id not in self.active_connections:
            logger.warning(f"User {user_id} has no active connections")
            return

        failed_devices = []

        for device_id, conn_info in self.active_connections[user_id].items():
            success = await conn_info.send_json(json.loads(event.to_json()))

            if not success:
                failed_devices.append(device_id)

        # Clean up failed connections
        for device_id in failed_devices:
            await self.disconnect(user_id, device_id)

    async def broadcast_to_device(
        self,
        user_id: str,
        device_id: str,
        event: WebSocketEvent,
    ) -> None:
        """Send event to a specific device"""
        if user_id not in self.active_connections:
            logger.warning(f"User {user_id} has no active connections")
            return

        if device_id not in self.active_connections[user_id]:
            logger.warning(f"Device {device_id} not found for user {user_id}")
            return

        conn_info = self.active_connections[user_id][device_id]
        success = await conn_info.send_json(json.loads(event.to_json()))

        if not success:
            await self.disconnect(user_id, device_id)

    # ==================== PRESENCE & ACTIVITY ====================

    def get_room_presence(self, case_id: str) -> Dict[str, dict]:
        """Get presence info for all users in a room"""
        if case_id not in self.case_rooms:
            return {}

        presence = {}
        for user_id in self.case_rooms[case_id]:
            if user_id in self.active_connections:
                devices = []
                for device_id, conn_info in self.active_connections[user_id].items():
                    devices.append({
                        "device_id": device_id,
                        "connected_at": conn_info.connected_at.isoformat(),
                        "last_message_at": conn_info.last_message_at.isoformat(),
                    })

                presence[user_id] = {
                    "online": True,
                    "devices": devices,
                }
            else:
                presence[user_id] = {
                    "online": False,
                    "devices": [],
                }

        return presence

    def get_user_status(self, user_id: str) -> dict:
        """Get online status and connected devices for a user"""
        if user_id not in self.active_connections:
            return {
                "online": False,
                "devices": [],
            }

        devices = []
        for device_id, conn_info in self.active_connections[user_id].items():
            devices.append({
                "device_id": device_id,
                "subscribed_cases": list(conn_info.subscribed_cases),
                "connected_at": conn_info.connected_at.isoformat(),
                "last_message_at": conn_info.last_message_at.isoformat(),
            })

        return {
            "online": len(devices) > 0,
            "devices": devices,
        }

    # ==================== MESSAGE DEDUPLICATION ====================

    def is_duplicate_message(self, message_id: str) -> bool:
        """Check if message has already been processed"""
        return message_id in self.processed_messages

    def mark_message_processed(self, message_id: str) -> None:
        """Mark message as processed for deduplication"""
        self.processed_messages[message_id] = datetime.utcnow()

        # Keep only last 10000 messages to avoid memory bloat
        if len(self.processed_messages) > 10000:
            # Remove oldest entries
            oldest_keys = sorted(
                self.processed_messages.items(),
                key=lambda x: x[1]
            )[:1000]
            for key, _ in oldest_keys:
                del self.processed_messages[key]

    # ==================== EVENT HANDLERS ====================

    def register_handler(self, event_type: str, handler: Callable) -> None:
        """Register a callback for a specific event type"""
        if event_type not in self.event_handlers:
            self.event_handlers[event_type] = []

        self.event_handlers[event_type].append(handler)

    async def _trigger_handlers(self, event: WebSocketEvent) -> None:
        """Trigger all registered handlers for an event type"""
        if event.event_type in self.event_handlers:
            for handler in self.event_handlers[event.event_type]:
                try:
                    if callable(handler):
                        result = handler(event)
                        # Handle both sync and async handlers
                        if hasattr(result, '__await__'):
                            await result
                except Exception as e:
                    logger.error(f"Error in event handler for {event.event_type}: {e}")

    # ==================== STATISTICS & MONITORING ====================

    def get_stats(self) -> dict:
        """Get WebSocket server statistics"""
        total_connections = sum(
            len(devices) for devices in self.active_connections.values()
        )
        total_rooms = len(self.case_rooms)
        total_members = sum(
            len(members) for members in self.case_rooms.values()
        )

        return {
            "connected_users": len(self.active_connections),
            "total_connections": total_connections,
            "active_rooms": total_rooms,
            "total_members_in_rooms": total_members,
            "processed_messages_cached": len(self.processed_messages),
        }


# Global WebSocket manager instance
_ws_manager: Optional[WebSocketManager] = None


def get_websocket_manager() -> WebSocketManager:
    """Get or create the global WebSocket manager"""
    global _ws_manager
    if _ws_manager is None:
        _ws_manager = WebSocketManager()
    return _ws_manager


def reset_websocket_manager() -> None:
    """Reset WebSocket manager (for testing)"""
    global _ws_manager
    _ws_manager = None
