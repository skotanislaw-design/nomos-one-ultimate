"""
Device Service for PWA Mobile Support
Manages device registration, tracking, and trusted device management
"""

import logging
import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from bson import ObjectId
import os

logger = logging.getLogger("device_service")

# Device types
DEVICE_TYPES = ["ios", "android", "web", "desktop"]

# Device expiry: 90 days of inactivity
DEVICE_INACTIVITY_DAYS = int(os.getenv("DEVICE_INACTIVITY_DAYS", "90"))

# Trust period: 30 days before re-authentication required
DEVICE_TRUST_DAYS = int(os.getenv("DEVICE_TRUST_DAYS", "30"))


class DeviceService:
    """Manages device registration and trusted device tracking"""

    def __init__(self, db=None):
        self.db = db

    async def register_device(
        self,
        user_id: str,
        device_name: str,
        device_type: str,
        push_token: str,
        app_version: str,
        user_agent: str
    ) -> Dict[str, Any]:
        """
        Register a new device for a user

        Args:
            user_id: User ID registering device
            device_name: Device name (e.g., "iPhone 15 Pro")
            device_type: One of ios, android, web, desktop
            push_token: Firebase Cloud Messaging token
            app_version: App version (e.g., "1.0.0")
            user_agent: Browser user agent string

        Returns:
            Dictionary with device_id and registration details
        """
        if self.db is None:
            logger.warning("Database not configured")
            return {"error": "Database not available"}

        try:
            # Validate device type
            if device_type not in DEVICE_TYPES:
                return {"error": f"Invalid device type: {device_type}"}

            # Check if device already registered (same user + push token)
            existing = await self.db.devices.find_one({
                "user_id": ObjectId(user_id),
                "push_token": push_token
            })

            if existing:
                # Update last seen
                await self.db.devices.update_one(
                    {"_id": existing["_id"]},
                    {
                        "$set": {
                            "last_seen": datetime.utcnow(),
                            "expires_at": datetime.utcnow() + timedelta(days=DEVICE_INACTIVITY_DAYS)
                        }
                    }
                )
                return {
                    "device_id": str(existing["_id"]),
                    "is_new": False,
                    "registered_at": existing["registered_at"].isoformat()
                }

            # Create new device record
            device_id = ObjectId()
            device_doc = {
                "_id": device_id,
                "user_id": ObjectId(user_id),
                "device_name": device_name,
                "device_type": device_type,
                "push_token": push_token,
                "app_version": app_version,
                "user_agent": user_agent,
                "trusted": False,  # Must be explicitly trusted by user
                "registered_at": datetime.utcnow(),
                "last_seen": datetime.utcnow(),
                "expires_at": datetime.utcnow() + timedelta(days=DEVICE_INACTIVITY_DAYS)
            }

            result = await self.db.devices.insert_one(device_doc)

            # Add to user's devices list
            await self.db.users.update_one(
                {"_id": ObjectId(user_id)},
                {
                    "$addToSet": {
                        "devices": str(device_id)
                    },
                    "$set": {
                        "app_preferences.notification_enabled": True,
                        "app_preferences.offline_mode_enabled": True
                    }
                },
                upsert=True
            )

            logger.info(f"Device registered: {device_id} for user {user_id}")

            return {
                "device_id": str(device_id),
                "is_new": True,
                "registered_at": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"Device registration failed: {str(e)}")
            return {"error": str(e)}

    async def get_device(self, device_id: str) -> Optional[Dict[str, Any]]:
        """Get device details"""
        try:
            device = await self.db.devices.find_one({"_id": ObjectId(device_id)})
            if device:
                device["_id"] = str(device["_id"])
                device["user_id"] = str(device["user_id"])
                return device
            return None
        except Exception as e:
            logger.error(f"Failed to get device: {str(e)}")
            return None

    async def get_user_devices(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all devices for a user"""
        try:
            devices = []
            async for device in self.db.devices.find({"user_id": ObjectId(user_id)}):
                device["_id"] = str(device["_id"])
                device["user_id"] = str(device["user_id"])
                devices.append(device)
            return devices
        except Exception as e:
            logger.error(f"Failed to get user devices: {str(e)}")
            return []

    async def update_last_seen(self, device_id: str) -> bool:
        """Update device's last_seen timestamp"""
        try:
            result = await self.db.devices.update_one(
                {"_id": ObjectId(device_id)},
                {
                    "$set": {
                        "last_seen": datetime.utcnow(),
                        "expires_at": datetime.utcnow() + timedelta(days=DEVICE_INACTIVITY_DAYS)
                    }
                }
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Failed to update device: {str(e)}")
            return False

    async def trust_device(
        self,
        device_id: str,
        user_id: str,
        device_name: Optional[str] = None
    ) -> bool:
        """
        Mark device as trusted (skip 2FA for 30 days)

        Args:
            device_id: Device to trust
            user_id: User who trusts the device
            device_name: Optional custom device name
        """
        try:
            update_data = {
                "trusted": True,
                "trusted_at": datetime.utcnow(),
                "trust_expires_at": datetime.utcnow() + timedelta(days=DEVICE_TRUST_DAYS)
            }

            if device_name:
                update_data["device_name"] = device_name

            result = await self.db.devices.update_one(
                {"_id": ObjectId(device_id), "user_id": ObjectId(user_id)},
                {"$set": update_data}
            )

            if result.modified_count > 0:
                # Add to user's trusted devices
                await self.db.users.update_one(
                    {"_id": ObjectId(user_id)},
                    {"$addToSet": {"trusted_devices": device_id}}
                )
                logger.info(f"Device trusted: {device_id} for user {user_id}")
                return True

            return False
        except Exception as e:
            logger.error(f"Failed to trust device: {str(e)}")
            return False

    async def is_device_trusted(self, device_id: str, user_id: str) -> bool:
        """Check if device is currently trusted (within trust period)"""
        try:
            device = await self.db.devices.find_one({
                "_id": ObjectId(device_id),
                "user_id": ObjectId(user_id)
            })

            if not device:
                return False

            if not device.get("trusted"):
                return False

            # Check if trust hasn't expired
            trust_expires = device.get("trust_expires_at")
            if trust_expires and datetime.utcnow() > trust_expires:
                # Trust expired, update device
                await self.db.devices.update_one(
                    {"_id": ObjectId(device_id)},
                    {"$set": {"trusted": False}}
                )
                return False

            return True
        except Exception as e:
            logger.error(f"Failed to check device trust: {str(e)}")
            return False

    async def revoke_device_trust(self, device_id: str, user_id: str) -> bool:
        """Revoke trust on a device"""
        try:
            result = await self.db.devices.update_one(
                {"_id": ObjectId(device_id), "user_id": ObjectId(user_id)},
                {"$set": {"trusted": False}}
            )

            if result.modified_count > 0:
                await self.db.users.update_one(
                    {"_id": ObjectId(user_id)},
                    {"$pull": {"trusted_devices": device_id}}
                )
                logger.info(f"Device trust revoked: {device_id}")
                return True

            return False
        except Exception as e:
            logger.error(f"Failed to revoke device trust: {str(e)}")
            return False

    async def unregister_device(self, device_id: str, user_id: str) -> bool:
        """Unregister/delete a device"""
        try:
            result = await self.db.devices.delete_one({
                "_id": ObjectId(device_id),
                "user_id": ObjectId(user_id)
            })

            if result.deleted_count > 0:
                await self.db.users.update_one(
                    {"_id": ObjectId(user_id)},
                    {
                        "$pull": {
                            "devices": device_id,
                            "trusted_devices": device_id
                        }
                    }
                )
                logger.info(f"Device unregistered: {device_id}")
                return True

            return False
        except Exception as e:
            logger.error(f"Failed to unregister device: {str(e)}")
            return False

    async def cleanup_inactive_devices(self) -> int:
        """
        Delete devices inactive for >90 days
        Should be called periodically (e.g., daily scheduled job)

        Returns:
            Number of devices deleted
        """
        try:
            expiry_cutoff = datetime.utcnow() - timedelta(days=DEVICE_INACTIVITY_DAYS)

            result = await self.db.devices.delete_many({
                "last_seen": {"$lt": expiry_cutoff}
            })

            if result.deleted_count > 0:
                logger.info(f"Cleaned up {result.deleted_count} inactive devices")

            return result.deleted_count
        except Exception as e:
            logger.error(f"Failed to cleanup inactive devices: {str(e)}")
            return 0

    async def get_device_by_push_token(self, push_token: str) -> Optional[Dict[str, Any]]:
        """Get device by push token (for sending push notifications)"""
        try:
            device = await self.db.devices.find_one({"push_token": push_token})
            if device:
                device["_id"] = str(device["_id"])
                device["user_id"] = str(device["user_id"])
                return device
            return None
        except Exception as e:
            logger.error(f"Failed to get device by push token: {str(e)}")
            return None


# Global instance
_device_service: Optional[DeviceService] = None


def get_device_service(db=None) -> DeviceService:
    """Get or create device service instance"""
    global _device_service
    if _device_service is None:
        _device_service = DeviceService(db)
    return _device_service
