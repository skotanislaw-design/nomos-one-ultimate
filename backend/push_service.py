"""
Push Notification Service — VAPID Web Push
Αποστολή push notifications μέσω Web Push Protocol (RFC 8030) + VAPID (RFC 8292).
Δεν χρειάζεται Firebase — δουλεύει απευθείας με Chrome, Firefox, Safari, Edge.
"""

import logging
import os
import json
import base64
from typing import Optional, List, Dict, Any
from datetime import datetime

logger = logging.getLogger("push_service")

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY  = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_SUBJECT     = os.getenv("VAPID_SUBJECT", "mailto:admin@nomos-one.gr")

VAPID_AVAILABLE = bool(VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY)
if not VAPID_AVAILABLE:
    logger.warning("VAPID keys not configured. Push notifications disabled.")


class PushService:
    """Αποστολή Web Push notifications μέσω VAPID."""

    def __init__(self, db=None):
        self.db = db

    async def send_to_subscription(
        self,
        subscription: Dict,
        title: str,
        body: str,
        data: Optional[Dict] = None,
        icon: str = "/icons/icon-192.png",
        badge: str = "/icons/icon-192.png",
        path: str = "/",
    ) -> Dict[str, Any]:
        """Στέλνει push σε μία subscription (endpoint + keys)."""
        if not VAPID_AVAILABLE:
            return {"status": "disabled", "reason": "VAPID not configured"}

        try:
            from pywebpush import webpush, WebPushException

            payload = json.dumps({
                "title": title,
                "body": body,
                "icon": icon,
                "badge": badge,
                "path": path,
                **(data or {}),
            })

            webpush(
                subscription_info=subscription,
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT},
            )
            return {"status": "delivered"}

        except Exception as e:
            err = str(e)
            # 410 Gone = subscription expired/unsubscribed
            if "410" in err or "404" in err:
                return {"status": "expired", "reason": err}
            logger.error(f"Push send error: {err}")
            return {"status": "error", "reason": err}

    async def send_to_user(
        self,
        user_id: str,
        title: str,
        body: str,
        data: Optional[Dict] = None,
        path: str = "/",
    ) -> Dict[str, Any]:
        """Στέλνει push σε όλες τις subscriptions ενός χρήστη."""
        if self.db is None:
            return {"status": "error", "reason": "No DB"}

        subs = await self.db.push_subscriptions.find(
            {"user_id": user_id}
        ).to_list(None)

        if not subs:
            return {"status": "no_subscriptions", "count": 0}

        results = {"delivered": 0, "expired": 0, "error": 0, "total": len(subs)}
        expired_ids = []

        for sub in subs:
            subscription_info = {
                "endpoint": sub["endpoint"],
                "keys": {"auth": sub["auth"], "p256dh": sub["p256dh"]},
            }
            result = await self.send_to_subscription(
                subscription_info, title, body, data=data, path=path
            )
            status = result.get("status", "error")
            if status == "delivered":
                results["delivered"] += 1
            elif status == "expired":
                results["expired"] += 1
                expired_ids.append(sub["_id"])
            else:
                results["error"] += 1

        # Καθαρισμός expired subscriptions
        if expired_ids:
            from bson import ObjectId
            await self.db.push_subscriptions.delete_many(
                {"_id": {"$in": expired_ids}}
            )

        return {"status": "completed", "results": results}

    async def send_to_all_admins(
        self,
        title: str,
        body: str,
        data: Optional[Dict] = None,
        path: str = "/",
    ) -> Dict[str, Any]:
        """Στέλνει push σε όλους τους admins/lawyers."""
        if self.db is None:
            return {"status": "error", "reason": "No DB"}

        users = await self.db.users.find(
            {"role": {"$in": ["administrator", "lawyer"]}, "is_active": True},
            {"_id": 1}
        ).to_list(None)

        total = {"delivered": 0, "error": 0}
        for u in users:
            r = await self.send_to_user(str(u["_id"]), title, body, data=data, path=path)
            total["delivered"] += r.get("results", {}).get("delivered", 0)
            total["error"] += r.get("results", {}).get("error", 0)

        return {"status": "completed", "results": total}


_push_service: Optional[PushService] = None


def get_push_service(db=None) -> PushService:
    global _push_service
    if _push_service is None or (db and _push_service.db is None):
        _push_service = PushService(db)
    return _push_service
