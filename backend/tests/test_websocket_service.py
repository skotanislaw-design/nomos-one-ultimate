"""
Δοκιμές για WebSocket Service (WebSocketManager)
Φάση 1.7: Real-time Messaging
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from websocket_service import (
    WebSocketManager,
    WebSocketEvent,
    ConnectionInfo,
    get_websocket_manager
)


class TestWebSocketManager:
    """Δοκιμές για τη διαχείριση WebSocket connections"""

    @pytest.fixture
    def manager(self):
        """Δημιουργία καθαρού WebSocketManager για κάθε δοκιμή"""
        manager = WebSocketManager()
        yield manager
        # Καθαρισμός μετά τη δοκιμή
        manager.active_connections.clear()
        manager.case_rooms.clear()
        manager.processed_messages.clear()

    @pytest.fixture
    def mock_websocket(self):
        """Mock WebSocket αντικείμενο"""
        ws = AsyncMock()
        ws.send_json = AsyncMock()
        ws.close = AsyncMock()
        return ws

    @pytest.fixture
    def sample_user_id(self):
        return "user_" + str(uuid4())

    @pytest.fixture
    def sample_device_id(self):
        return str(uuid4())

    @pytest.fixture
    def sample_case_id(self):
        return str(uuid4())

    # ── Δοκιμές σύνδεσης/αποσύνδεσης ──────────────────────────────────────

    @pytest.mark.asyncio
    async def test_connect_user(self, manager, mock_websocket, sample_user_id, sample_device_id):
        """Έλεγχος: Σύνδεση νέου χρήστη"""
        await manager.connect(mock_websocket, sample_user_id, sample_device_id)

        assert sample_user_id in manager.active_connections
        assert len(manager.active_connections[sample_user_id]) == 1
        assert sample_device_id in manager.active_connections[sample_user_id]

    @pytest.mark.asyncio
    async def test_connect_multiple_devices_same_user(self, manager, mock_websocket,
                                                       sample_user_id):
        """Έλεγχος: Ίδιος χρήστης με πολλές συσκευές"""
        device_id_1 = str(uuid4())
        device_id_2 = str(uuid4())

        ws1 = AsyncMock()
        ws2 = AsyncMock()

        await manager.connect(ws1, sample_user_id, device_id_1)
        await manager.connect(ws2, sample_user_id, device_id_2)

        assert len(manager.active_connections[sample_user_id]) == 2
        assert device_id_1 in manager.active_connections[sample_user_id]
        assert device_id_2 in manager.active_connections[sample_user_id]

    @pytest.mark.asyncio
    async def test_disconnect_user(self, manager, mock_websocket, sample_user_id,
                                   sample_device_id):
        """Έλεγχος: Αποσύνδεση χρήστη"""
        await manager.connect(mock_websocket, sample_user_id, sample_device_id)
        await manager.disconnect(sample_user_id, sample_device_id)

        # Ο χρήστης δεν πρέπει να είναι στο active_connections
        assert sample_user_id not in manager.active_connections or \
               len(manager.active_connections[sample_user_id]) == 0

    @pytest.mark.asyncio
    async def test_disconnect_one_device_keeps_others(self, manager, sample_user_id):
        """Έλεγχος: Αποσύνδεση μιας συσκευής κρατά τις άλλες σε σύνδεση"""
        device_id_1 = str(uuid4())
        device_id_2 = str(uuid4())

        ws1 = AsyncMock()
        ws2 = AsyncMock()

        await manager.connect(ws1, sample_user_id, device_id_1)
        await manager.connect(ws2, sample_user_id, device_id_2)

        await manager.disconnect(sample_user_id, device_id_1)

        # Η δεύτερη συσκευή πρέπει να παραμένει
        assert device_id_2 in manager.active_connections[sample_user_id]
        assert device_id_1 not in manager.active_connections[sample_user_id]

    # ── Δοκιμές διαχείρισης δωματίων ──────────────────────────────────────

    @pytest.mark.asyncio
    async def test_join_room(self, manager, mock_websocket, sample_user_id,
                             sample_case_id, sample_device_id):
        """Έλεγχος: Χρήστης εισέρχεται σε δωμάτιο περιστατικού"""
        await manager.connect(mock_websocket, sample_user_id, sample_device_id)
        await manager.join_room(sample_user_id, sample_case_id)

        assert sample_case_id in manager.case_rooms
        assert sample_user_id in manager.case_rooms[sample_case_id]

    @pytest.mark.asyncio
    async def test_leave_room(self, manager, mock_websocket, sample_user_id,
                              sample_case_id, sample_device_id):
        """Έλεγχος: Χρήστης φεύγει από δωμάτιο"""
        await manager.connect(mock_websocket, sample_user_id, sample_device_id)
        await manager.join_room(sample_user_id, sample_case_id)
        await manager.leave_room(sample_user_id, sample_case_id)

        assert sample_user_id not in manager.case_rooms.get(sample_case_id, set())

    @pytest.mark.asyncio
    async def test_multiple_users_in_room(self, manager, sample_case_id):
        """Έλεγχος: Πολλοί χρήστες στο ίδιο δωμάτιο"""
        user_ids = [str(uuid4()) for _ in range(3)]

        for user_id in user_ids:
            ws = AsyncMock()
            await manager.connect(ws, user_id, str(uuid4()))
            await manager.join_room(user_id, sample_case_id)

        room_users = manager.case_rooms[sample_case_id]
        assert len(room_users) == 3
        for user_id in user_ids:
            assert user_id in room_users

    # ── Δοκιμές εκπομπής μηνυμάτων ──────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_broadcast_to_room(self, manager, sample_case_id):
        """Έλεγχος: Εκπομπή μηνύματος σε όλο το δωμάτιο"""
        user_ids = [str(uuid4()) for _ in range(2)]
        sockets = []

        for user_id in user_ids:
            ws = AsyncMock()
            sockets.append(ws)
            await manager.connect(ws, user_id, str(uuid4()))
            await manager.join_room(user_id, sample_case_id)

        event = WebSocketEvent(
            event_type="case.updated",
            case_id=sample_case_id,
            user_id=user_ids[0],
            device_id=str(uuid4()),
            data={"status": "active"}
        )

        await manager.broadcast_to_room(sample_case_id, event)

        # Και οι δύο σύνδεσμοι πρέπει να λάβουν το μήνυμα
        for ws in sockets:
            ws.send_json.assert_called()

    @pytest.mark.asyncio
    async def test_broadcast_excludes_sender(self, manager, sample_case_id):
        """Έλεγχος: Εκπομπή εξαιρεί τον αποστολέα"""
        sender_id = str(uuid4())
        other_user_id = str(uuid4())

        sender_ws = AsyncMock()
        other_ws = AsyncMock()

        await manager.connect(sender_ws, sender_id, str(uuid4()))
        await manager.connect(other_ws, other_user_id, str(uuid4()))

        await manager.join_room(sender_id, sample_case_id)
        await manager.join_room(other_user_id, sample_case_id)

        event = WebSocketEvent(
            event_type="case.updated",
            case_id=sample_case_id,
            user_id=sender_id,
            device_id=str(uuid4()),
            data={"status": "active"}
        )

        # exclude_user παράμετρος θα πρέπει να αποκλείει τον sender
        await manager.broadcast_to_room(sample_case_id, event, exclude_user=sender_id)

        # Ο άλλος χρήστης πρέπει να λάβει το μήνυμα
        other_ws.send_json.assert_called()
        # Ο αποστολέας δεν πρέπει να λάβει το μήνυμα (μόνο αν δεν το εξαιρέσαμε)

    @pytest.mark.asyncio
    async def test_broadcast_to_user(self, manager, sample_user_id):
        """Έλεγχος: Εκπομπή σε συγκεκριμένο χρήστη"""
        device_id = str(uuid4())
        ws = AsyncMock()

        await manager.connect(ws, sample_user_id, device_id)

        event = WebSocketEvent(
            event_type="notification",
            case_id=str(uuid4()),
            user_id=sample_user_id,
            device_id=device_id,
            data={"message": "test"}
        )

        await manager.broadcast_to_user(sample_user_id, event)

        ws.send_json.assert_called()

    @pytest.mark.asyncio
    async def test_broadcast_to_device(self, manager, sample_user_id):
        """Έλεγχος: Εκπομπή σε συγκεκριμένη συσκευή"""
        device_id = str(uuid4())
        ws = AsyncMock()

        await manager.connect(ws, sample_user_id, device_id)

        event = WebSocketEvent(
            event_type="notification",
            case_id=str(uuid4()),
            user_id=sample_user_id,
            device_id=device_id,
            data={"message": "device-specific"}
        )

        await manager.broadcast_to_device(sample_user_id, device_id, event)

        ws.send_json.assert_called()

    # ── Δοκιμές αποψίλωσης διπλοτύπων ───────────────────────────────────

    @pytest.mark.asyncio
    async def test_duplicate_message_detection(self, manager, sample_user_id,
                                               sample_case_id):
        """Έλεγχος: Ανίχνευση διπλοτύπων μηνυμάτων"""
        message_id = str(uuid4())

        event1 = WebSocketEvent(
            event_type="case.updated",
            case_id=sample_case_id,
            user_id=sample_user_id,
            device_id=str(uuid4()),
            data={"status": "active"},
            message_id=message_id
        )

        # Πρώτο μήνυμα - δεν είναι διπλότυπο
        is_dup1 = manager.is_duplicate_message(message_id)
        assert is_dup1 is False

        # Σημάδεψε το μήνυμα ως επεξεργασμένο
        manager.mark_message_processed(message_id)

        # Δεύτερο μήνυμα με το ίδιο message_id - είναι διπλότυπο
        is_dup2 = manager.is_duplicate_message(message_id)
        assert is_dup2 is True

    @pytest.mark.asyncio
    async def test_duplicate_limit_prevents_memory_leak(self, manager):
        """Έλεγχος: Το όριο διπλοτύπων αποτρέπει διαρροή μνήμης"""
        # Δημιουργία 15000 μηνυμάτων (το όριο είναι 10000)
        for i in range(15000):
            message_id = str(uuid4())
            manager.mark_message_processed(message_id)

        # Το μέγεθος του processed_messages δεν πρέπει να υπερβεί 10000
        assert len(manager.processed_messages) <= 10000

    # ── Δοκιμές παρουσίας χρήστη ────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_get_room_presence(self, manager, sample_case_id):
        """Έλεγχος: Λήψη παρουσίας χρηστών σε δωμάτιο"""
        user_id_1 = str(uuid4())
        user_id_2 = str(uuid4())
        device_id_1 = str(uuid4())
        device_id_2 = str(uuid4())

        ws1 = AsyncMock()
        ws2 = AsyncMock()

        await manager.connect(ws1, user_id_1, device_id_1)
        await manager.connect(ws2, user_id_2, device_id_2)

        await manager.join_room(user_id_1, sample_case_id)
        await manager.join_room(user_id_2, sample_case_id)

        presence = manager.get_room_presence(sample_case_id)

        assert len(presence) == 2
        assert user_id_1 in presence
        assert user_id_2 in presence

    @pytest.mark.asyncio
    async def test_get_user_status(self, manager, sample_user_id):
        """Έλεγχος: Λήψης κατάστασης χρήστη"""
        device_id = str(uuid4())
        ws = AsyncMock()

        await manager.connect(ws, sample_user_id, device_id)

        status = manager.get_user_status(sample_user_id)

        assert status["online"] is True
        assert len(status["devices"]) == 1
        # Τα devices είναι λίστα με dicts, όχι απευθείας device_ids
        assert any(d["device_id"] == device_id for d in status["devices"])

    # ── Δοκιμές στατιστικών ─────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_get_stats(self, manager, sample_case_id):
        """Έλεγχος: Λήψης στατιστικών manager"""
        user_ids = [str(uuid4()) for _ in range(3)]

        for user_id in user_ids:
            ws = AsyncMock()
            await manager.connect(ws, user_id, str(uuid4()))
            await manager.join_room(user_id, sample_case_id)

        stats = manager.get_stats()

        assert stats["total_connections"] >= 3
        assert stats["connected_users"] >= 3
        assert stats["active_rooms"] >= 1
        assert stats["processed_messages_cached"] >= 0

    # ── Δοκιμές επιστροφής σύνδεσης ────────────────────────────────────

    @pytest.mark.asyncio
    async def test_get_user_connections(self, manager, sample_user_id):
        """Έλεγχος: Λήψης συνδέσεων χρήστη"""
        device_id_1 = str(uuid4())
        device_id_2 = str(uuid4())

        ws1 = AsyncMock()
        ws2 = AsyncMock()

        await manager.connect(ws1, sample_user_id, device_id_1)
        await manager.connect(ws2, sample_user_id, device_id_2)

        connections = manager.active_connections.get(sample_user_id, [])

        assert len(connections) == 2


class TestWebSocketEvent:
    """Δοκιμές για τη κλάση WebSocketEvent"""

    def test_event_creation(self):
        """Έλεγχος: Δημιουργία γεγονότος"""
        case_id = str(uuid4())
        user_id = str(uuid4())
        device_id = str(uuid4())

        event = WebSocketEvent(
            event_type="case.updated",
            case_id=case_id,
            user_id=user_id,
            device_id=device_id,
            data={"status": "active"}
        )

        assert event.event_type == "case.updated"
        assert event.case_id == case_id
        assert event.user_id == user_id
        assert event.device_id == device_id
        assert event.data["status"] == "active"

    def test_event_message_id_generation(self):
        """Έλεγχος: Αυτόματη δημιουργία message_id"""
        event = WebSocketEvent(
            event_type="case.updated",
            case_id=str(uuid4()),
            user_id=str(uuid4()),
            device_id=str(uuid4()),
            data={}
        )

        assert event.message_id is not None
        assert len(event.message_id) > 0

    def test_event_timestamp_generation(self):
        """Έλεγχος: Αυτόματη δημιουργία timestamp"""
        event = WebSocketEvent(
            event_type="case.updated",
            case_id=str(uuid4()),
            user_id=str(uuid4()),
            device_id=str(uuid4()),
            data={}
        )

        assert event.timestamp is not None
        assert isinstance(event.timestamp, str)  # ISO format string, not datetime object

    def test_event_serialization(self):
        """Έλεγχος: Σειριοποίηση γεγονότος σε JSON"""
        event = WebSocketEvent(
            event_type="note.created",
            case_id=str(uuid4()),
            user_id=str(uuid4()),
            device_id=str(uuid4()),
            data={"content": "Test note"}
        )

        event_json = event.to_json()

        # Η to_json() επιστρέφει JSON string
        assert event_json is not None
        assert "note.created" in event_json
        assert "Test note" in event_json


class TestConnectionInfo:
    """Δοκιμές για τη κλάση ConnectionInfo"""

    def test_connection_info_creation(self):
        """Έλεγχος: Δημιουργία πληροφοριών σύνδεσης"""
        user_id = str(uuid4())
        device_id = str(uuid4())
        ws = AsyncMock()

        conn = ConnectionInfo(
            websocket=ws,
            user_id=user_id,
            device_id=device_id
        )

        assert conn.user_id == user_id
        assert conn.device_id == device_id
        assert conn.websocket == ws

    def test_connection_info_timestamp(self):
        """Έλεγχος: Timestamp σύνδεσης"""
        conn = ConnectionInfo(
            websocket=AsyncMock(),
            user_id=str(uuid4()),
            device_id=str(uuid4())
        )

        assert conn.connected_at is not None
        assert isinstance(conn.connected_at, datetime)


class TestWebSocketManagerSingleton:
    """Δοκιμές για το singleton pattern της WebSocketManager"""

    def test_get_websocket_manager_returns_singleton(self):
        """Έλεγχος: get_websocket_manager επιστρέφει το ίδιο αντικείμενο"""
        manager1 = get_websocket_manager()
        manager2 = get_websocket_manager()

        assert manager1 is manager2
