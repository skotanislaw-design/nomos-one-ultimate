"""
Push Notification Service for PWA
Handles Firebase Cloud Messaging integration
"""

import logging
import json
import os
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId

logger = logging.getLogger("push_service")

# Firebase configuration
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
FIREBASE_PRIVATE_KEY = os.getenv("FIREBASE_PRIVATE_KEY", "")
FIREBASE_CLIENT_EMAIL = os.getenv("FIREBASE_CLIENT_EMAIL", "")

# Check if Firebase is available
try:
    import firebase_admin
    from firebase_admin import credentials, messaging
    FIREBASE_AVAILABLE = bool(FIREBASE_PROJECT_ID and FIREBASE_PRIVATE_KEY)
except ImportError:
    FIREBASE_AVAILABLE = False
    logger.warning("Firebase Admin SDK not installed. Push notifications will be disabled.")


class PushService:
    """Manages push notifications via Firebase Cloud Messaging"""

    def __init__(self, db=None):
        self.db = db
        self.firebase_app = None
        self._initialize_firebase()

    def _initialize_firebase(self):
        """Initialize Firebase Admin SDK if credentials available"""
        if not FIREBASE_AVAILABLE or not FIREBASE_PROJECT_ID:
            logger.warning("Firebase not configured. Push notifications disabled.")
            return

        try:
            # Check if Firebase app already initialized
            try:
                self.firebase_app = firebase_admin.get_app()
            except ValueError:
                # App not initialized yet
                creds_dict = {
                    "type": "service_account",
                    "project_id": FIREBASE_PROJECT_ID,
                    "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID", ""),
                    "private_key": FIREBASE_PRIVATE_KEY.replace('\\n', '\n'),
                    "client_email": FIREBASE_CLIENT_EMAIL,
                    "client_id": os.getenv("FIREBASE_CLIENT_ID", ""),
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                    "client_x509_cert_url": os.getenv("FIREBASE_CLIENT_CERT_URL", "")
                }

                creds = credentials.Certificate(creds_dict)
                self.firebase_app = firebase_admin.initialize_app(creds)

            logger.info("Firebase Admin SDK initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Firebase: {str(e)}")
            self.firebase_app = None

    async def send_push_notification(
        self,
        device_id: str,
        title: str,
        body: str,
        data: Optional[Dict[str, str]] = None,
        notification_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send push notification to a specific device

        Args:
            device_id: Device ID to send to
            title: Notification title
            body: Notification body
            data: Optional custom data payload
            notification_id: Optional unique notification ID for deduplication

        Returns:
            Dictionary with delivery status
        """
        if not self.db:
            logger.warning("Database not configured")
            return {"status": "error", "reason": "Database not available"}

        try:
            # Get device by ID
            device = await self.db.devices.find_one({"_id": ObjectId(device_id)})
            if not device:
                logger.warning(f"Device not found: {device_id}")
                return {"status": "error", "reason": "Device not found"}

            push_token = device.get("push_token")
            if not push_token:
                logger.warning(f"No push token for device: {device_id}")
                return {"status": "error", "reason": "No push token"}

            # Send via Firebase if available
            if self.firebase_app and FIREBASE_AVAILABLE:
                return await self._send_via_firebase(push_token, title, body, data)
            else:
                # Fallback: log notification (in production, use alternative service)
                logger.info(f"Push notification (Firebase unavailable): {title} → {push_token}")
                return {
                    "status": "queued",
                    "reason": "Firebase not available, logged for manual processing",
                    "device_id": device_id
                }

        except Exception as e:
            logger.error(f"Failed to send push notification: {str(e)}")
            return {"status": "error", "reason": str(e)}

    async def _send_via_firebase(
        self,
        push_token: str,
        title: str,
        body: str,
        data: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Send notification via Firebase Cloud Messaging

        Args:
            push_token: FCM token
            title: Notification title
            body: Notification body
            data: Custom data payload

        Returns:
            Delivery status
        """
        try:
            message = messaging.Message(
                notification=messaging.Notification(
                    title=title,
                    body=body
                ),
                data=data or {},
                token=push_token,
                webpush=messaging.WebpushConfig(
                    notification=messaging.WebpushNotification(
                        title=title,
                        body=body,
                        icon="/icons/icon-192.png",
                        badge="/icons/icon-192.png",
                        tag="nomos-one-notification"
                    ),
                    fcm_options=messaging.WebpushFCMOptions(
                        link="/notifications"
                    )
                )
            )

            response = messaging.send(message)
            logger.info(f"Push notification sent successfully: {response}")

            return {
                "status": "delivered",
                "message_id": response,
                "timestamp": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"Firebase send failed: {str(e)}")
            return {"status": "error", "reason": str(e)}

    async def send_bulk_notifications(
        self,
        case_id: str,
        event_type: str,
        title: str,
        body: str,
        data: Optional[Dict[str, str]] = None,
        exclude_user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send notification to all users with access to a case

        Args:
            case_id: Case ID
            event_type: Type of event (e.g., "case_updated", "message_received")
            title: Notification title
            body: Notification body
            data: Custom data payload
            exclude_user_id: Optional user ID to exclude (usually the action performer)

        Returns:
            Aggregated delivery status
        """
        if not self.db:
            logger.warning("Database not configured")
            return {"status": "error", "reason": "Database not available"}

        try:
            # Get case and find all users with access
            case = await self.db.cases.find_one({"_id": ObjectId(case_id)})
            if not case:
                logger.warning(f"Case not found: {case_id}")
                return {"status": "error", "reason": "Case not found"}

            # Get users with access (assigned lawyer, secretary, clients)
            users_with_access = set()

            if case.get("assigned_lawyer_id"):
                users_with_access.add(str(case["assigned_lawyer_id"]))

            if case.get("assigned_secretary_id"):
                users_with_access.add(str(case["assigned_secretary_id"]))

            # Add clients if applicable
            if case.get("client_ids"):
                users_with_access.update([str(cid) for cid in case["client_ids"]])

            # Remove excluded user
            if exclude_user_id:
                users_with_access.discard(str(exclude_user_id))

            # Get devices for all users
            devices = []
            async for device in self.db.devices.find(
                {"user_id": {"$in": [ObjectId(uid) for uid in users_with_access]}}
            ):
                devices.append(device)

            if not devices:
                logger.info(f"No devices found for case {case_id}")
                return {"status": "no_devices", "count": 0}

            # Send to all devices
            results = {
                "delivered": 0,
                "failed": 0,
                "queued": 0,
                "total": len(devices)
            }

            for device in devices:
                try:
                    result = await self.send_push_notification(
                        str(device["_id"]),
                        title,
                        body,
                        data={"event_type": event_type, "case_id": case_id, **(data or {})}
                    )

                    if result.get("status") == "delivered":
                        results["delivered"] += 1
                    elif result.get("status") == "queued":
                        results["queued"] += 1
                    else:
                        results["failed"] += 1

                except Exception as e:
                    logger.error(f"Failed to send to device {device['_id']}: {str(e)}")
                    results["failed"] += 1

            logger.info(f"Bulk notifications sent for case {case_id}: {results}")

            return {
                "status": "completed",
                "results": results,
                "timestamp": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"Bulk notification failed: {str(e)}")
            return {"status": "error", "reason": str(e)}

    async def test_notification(self, device_id: str) -> Dict[str, Any]:
        """Send a test notification to verify setup"""
        return await self.send_push_notification(
            device_id,
            title="Test Notification",
            body="Nomos One push notifications are working!",
            data={"type": "test"}
        )


# Global instance
_push_service: Optional[PushService] = None


def get_push_service(db=None) -> PushService:
    """Get or create push service instance"""
    global _push_service
    if _push_service is None:
        _push_service = PushService(db)
    return _push_service
