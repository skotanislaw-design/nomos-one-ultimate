"""
Δοκιμές ολοκλήρωσης για WebSocket service
Φάση 1.7: Real-time Messaging

Σημείωση: Αυτές οι δοκιμές εστιάζουν στην ολοκληρωμένη λειτουργία του WebSocketManager
και όχι στο WebSocket endpoint (που είναι δύσκολο να δοκιμαστεί με TestClient).
"""

import pytest
from unittest.mock import AsyncMock
from uuid import uuid4

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from websocket_service import (
    get_websocket_manager,
    WebSocketEvent,
    reset_websocket_manager
)


class TestWebSocketManagerIntegration:
    """Ολοκληρωμένες δοκιμές για τη WebSocketManager"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Καθαρισμός manager πριν από κάθε δοκιμή"""
        reset_websocket_manager()
        yield
        reset_websocket_manager()

    @pytest.mark.asyncio
    async def test_full_room_flow(self):
        """Έλεγχος: Πλήρης ροή δωματίου (join → broadcast → leave)"""
        manager = get_websocket_manager()
        case_id = str(uuid4())
        user_id_1 = str(uuid4())
        user_id_2 = str(uuid4())
        device_id_1 = str(uuid4())
        device_id_2 = str(uuid4())

        # Δημιουργία mock sockets
        ws1 = AsyncMock()
        ws2 = AsyncMock()

        # Και οι δύο χρήστες συνδέονται
        await manager.connect(ws1, user_id_1, device_id_1)
        await manager.connect(ws2, user_id_2, device_id_2)

        # Και οι δύο χρήστες εισέρχονται στο δωμάτιο
        await manager.join_room(user_id_1, case_id)
        await manager.join_room(user_id_2, case_id)

        # Ο πρώτος χρήστης στέλνει ένα γεγονός
        event = WebSocketEvent(
            event_type="case.updated",
            case_id=case_id,
            user_id=user_id_1,
            device_id=device_id_1,
            data={"status": "active"}
        )

        await manager.broadcast_to_room(case_id, event, exclude_user=user_id_1)

        # Ο δεύτερος χρήστης πρέπει να λάβει το γεγονός
        ws2.send_json.assert_called()

        # Ο πρώτος χρήστης φεύγει από το δωμάτιο
        await manager.leave_room(user_id_1, case_id)

        # Μόνο ο δεύτερος χρήστης παραμένει στο δωμάτιο
        assert user_id_2 in manager.case_rooms[case_id]
        assert user_id_1 not in manager.case_rooms[case_id]

        # Αποσύνδεση
        await manager.disconnect(user_id_1, device_id_1)
        await manager.disconnect(user_id_2, device_id_2)

        # Καμία σύνδεση δεν πρέπει να απομείνει
        assert len(manager.active_connections) == 0

    @pytest.mark.asyncio
    async def test_message_deduplication_flow(self):
        """Έλεγχος: Ροή αποψίλωσης διπλοτύπων"""
        manager = get_websocket_manager()
        message_id = str(uuid4())

        # Πρώτο μήνυμα
        assert manager.is_duplicate_message(message_id) is False

        # Σημάδεψε ως επεξεργασμένο
        manager.mark_message_processed(message_id)

        # Δεύτερο μήνυμα πρέπει να ανιχνευθεί ως διπλότυπο
        assert manager.is_duplicate_message(message_id) is True

    @pytest.mark.asyncio
    async def test_presence_tracking_flow(self):
        """Έλεγχος: Ροή παρακολούθησης παρουσίας"""
        manager = get_websocket_manager()
        case_id = str(uuid4())
        users = []

        for i in range(3):
            user_id = str(uuid4())
            device_id = str(uuid4())
            users.append((user_id, device_id))
            ws = AsyncMock()
            await manager.connect(ws, user_id, device_id)
            await manager.join_room(user_id, case_id)

        # Λήψη παρουσίας
        presence = manager.get_room_presence(case_id)

        # Όλοι οι χρήστες πρέπει να εμφανίζονται online
        assert len(presence) == 3
        for user_id, _ in users:
            assert presence[user_id]["online"] is True
            assert len(presence[user_id]["devices"]) > 0

    @pytest.mark.asyncio
    async def test_typing_indicator_flow(self):
        """Έλεγχος: Ροή δείκτη πληκτρολόγησης"""
        manager = get_websocket_manager()
        case_id = str(uuid4())
        user_id = str(uuid4())
        device_id = str(uuid4())

        ws = AsyncMock()
        await manager.connect(ws, user_id, device_id)
        await manager.join_room(user_id, case_id)

        # Αποστολή typing indicator
        typing_event = WebSocketEvent(
            event_type="user.typing",
            case_id=case_id,
            user_id=user_id,
            device_id=device_id,
            data={"started": True, "field": "notes"}
        )

        await manager.broadcast_to_room(case_id, typing_event)

        # Το γεγονός πρέπει να αποσταλθεί
        ws.send_json.assert_called()

    @pytest.mark.asyncio
    async def test_broadcast_to_specific_user(self):
        """Έλεγχος: Εκπομπή σε συγκεκριμένο χρήστη"""
        manager = get_websocket_manager()
        user_id = str(uuid4())
        device_id_1 = str(uuid4())
        device_id_2 = str(uuid4())

        # Δύο συσκευές για τον ίδιο χρήστη
        ws1 = AsyncMock()
        ws2 = AsyncMock()

        await manager.connect(ws1, user_id, device_id_1)
        await manager.connect(ws2, user_id, device_id_2)

        # Αποστολή μηνύματος σε όλες τις συσκευές του χρήστη
        notification = WebSocketEvent(
            event_type="notification",
            case_id=str(uuid4()),
            user_id=user_id,
            device_id=device_id_1,
            data={"message": "test"}
        )

        await manager.broadcast_to_user(user_id, notification)

        # Και οι δύο συσκευές πρέπει να λάβουν το μήνυμα
        ws1.send_json.assert_called()
        ws2.send_json.assert_called()

    @pytest.mark.asyncio
    async def test_broadcast_to_specific_device(self):
        """Έλεγχος: Εκπομπή σε συγκεκριμένη συσκευή"""
        manager = get_websocket_manager()
        user_id = str(uuid4())
        device_id_1 = str(uuid4())
        device_id_2 = str(uuid4())

        ws1 = AsyncMock()
        ws2 = AsyncMock()

        await manager.connect(ws1, user_id, device_id_1)
        await manager.connect(ws2, user_id, device_id_2)

        # Αποστολή μηνύματος μόνο στη δεύτερη συσκευή
        notification = WebSocketEvent(
            event_type="notification",
            case_id=str(uuid4()),
            user_id=user_id,
            device_id=device_id_2,
            data={"message": "device-specific"}
        )

        await manager.broadcast_to_device(user_id, device_id_2, notification)

        # Μόνο η δεύτερη συσκευή πρέπει να λάβει το μήνυμα
        ws2.send_json.assert_called()
        assert not ws1.send_json.called

    @pytest.mark.asyncio
    async def test_event_handler_registration(self):
        """Έλεγχος: Εγγραφή και εκτέλεση event handler"""
        manager = get_websocket_manager()
        case_id = str(uuid4())
        user_id = str(uuid4())
        device_id = str(uuid4())

        # Δημιουργία handler
        handler_called = []

        def test_handler(event):
            handler_called.append(event)

        # Εγγραφή handler
        manager.register_handler("case.updated", test_handler)

        # Δημιουργία και αποστολή γεγονότος
        ws = AsyncMock()
        await manager.connect(ws, user_id, device_id)
        await manager.join_room(user_id, case_id)

        event = WebSocketEvent(
            event_type="case.updated",
            case_id=case_id,
            user_id=user_id,
            device_id=device_id,
            data={"status": "active"}
        )

        await manager.broadcast_to_room(case_id, event)

        # Handler πρέπει να έχει κληθεί
        assert len(handler_called) == 1
        assert handler_called[0].event_type == "case.updated"

    @pytest.mark.asyncio
    async def test_multiple_rooms_isolation(self):
        """Έλεγχος: Απομόνωση δωματίων"""
        manager = get_websocket_manager()
        case_id_1 = str(uuid4())
        case_id_2 = str(uuid4())
        user_id = str(uuid4())
        device_id = str(uuid4())

        ws = AsyncMock()
        await manager.connect(ws, user_id, device_id)

        # Χρήστης εισέρχεται σε δύο δωμάτια
        await manager.join_room(user_id, case_id_1)
        await manager.join_room(user_id, case_id_2)

        # Έλεγχος ότι ο χρήστης είναι σε και τα δύο δωμάτια
        assert user_id in manager.case_rooms[case_id_1]
        assert user_id in manager.case_rooms[case_id_2]

        # Γεγονός σε case_id_1 δεν θα επηρεάσει case_id_2
        event = WebSocketEvent(
            event_type="case.updated",
            case_id=case_id_1,
            user_id=user_id,
            device_id=device_id,
            data={"status": "active"}
        )

        await manager.broadcast_to_room(case_id_1, event)

        # Λήψη παρουσίας σε και τα δύο δωμάτια
        presence_1 = manager.get_room_presence(case_id_1)
        presence_2 = manager.get_room_presence(case_id_2)

        assert user_id in presence_1
        assert user_id in presence_2
