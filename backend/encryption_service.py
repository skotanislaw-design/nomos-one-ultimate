"""
Encryption Service for Chatbot System
Handles end-to-end encryption for sensitive data
Supports AES-256-GCM encryption
"""

import os
import json
import base64
from typing import Dict, Any, Union
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2
import secrets
from datetime import datetime
import logging

logger = logging.getLogger("encryption_service")

# ═══════════════════════════════════════════════════════════════
# ENCRYPTION CONFIGURATION
# ═══════════════════════════════════════════════════════════════

MASTER_KEY = os.getenv("ENCRYPTION_MASTER_KEY", "").encode()  # Should be 32 bytes
if not MASTER_KEY or len(MASTER_KEY) < 32:
    logger.warning("ENCRYPTION_MASTER_KEY not properly configured. Using insecure fallback.")
    MASTER_KEY = secrets.token_bytes(32)

KEY_ROTATION_DAYS = 90
ENCRYPTION_ALGORITHM = "AES-256-GCM"


# ═══════════════════════════════════════════════════════════════
# KEY MANAGEMENT
# ═══════════════════════════════════════════════════════════════

class KeyManager:
    """Manages encryption keys and rotation"""

    def __init__(self, master_key: bytes = MASTER_KEY):
        self.master_key = master_key
        self.key_rotation_date = datetime.utcnow()
        self.current_key_id = self._generate_key_id()
        self.key_cache = {}

    def _generate_key_id(self) -> str:
        """Generate unique key ID based on timestamp"""
        return datetime.utcnow().isoformat()

    def get_current_key(self) -> tuple[str, bytes]:
        """Get current encryption key and key ID"""
        return self.current_key_id, self.master_key

    def derive_key(self, salt: bytes) -> bytes:
        """Derive encryption key from master key using PBKDF2"""
        kdf = PBKDF2(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000
        )
        return kdf.derive(self.master_key)

    def rotate_key(self) -> str:
        """Rotate to new encryption key"""
        self.master_key = secrets.token_bytes(32)
        self.current_key_id = self._generate_key_id()
        self.key_rotation_date = datetime.utcnow()
        logger.info(f"Encryption key rotated. New key ID: {self.current_key_id}")
        return self.current_key_id

    def check_rotation_needed(self) -> bool:
        """Check if key rotation is needed (every 90 days)"""
        days_since_rotation = (datetime.utcnow() - self.key_rotation_date).days
        return days_since_rotation >= KEY_ROTATION_DAYS

    def get_key_for_id(self, key_id: str) -> bytes:
        """Retrieve specific key version (for decryption of old data)"""
        # In production, this would fetch from key management service
        if key_id == self.current_key_id:
            return self.master_key
        # For now, return master key (production would handle key versioning)
        return self.master_key


# ═══════════════════════════════════════════════════════════════
# ENCRYPTION/DECRYPTION
# ═══════════════════════════════════════════════════════════════

class EncryptionService:
    """Handles encryption and decryption of sensitive data"""

    def __init__(self, key_manager: KeyManager = None):
        self.key_manager = key_manager or KeyManager()

    def encrypt_data(self, data: Union[str, Dict, Any]) -> Dict[str, str]:
        """
        Encrypt data and return encrypted payload with metadata

        Args:
            data: Data to encrypt (string, dict, or JSON-serializable object)

        Returns:
            Dictionary with:
            - encrypted_data: Base64-encoded encrypted data
            - nonce: Base64-encoded nonce
            - key_id: ID of encryption key used
            - algorithm: Encryption algorithm used
        """
        try:
            # Convert data to JSON string if needed
            if isinstance(data, dict) or not isinstance(data, str):
                data_str = json.dumps(data) if isinstance(data, dict) else str(data)
            else:
                data_str = data

            data_bytes = data_str.encode()

            # Generate random salt and nonce
            salt = secrets.token_bytes(16)
            nonce = secrets.token_bytes(12)  # 96 bits for GCM

            # Get encryption key
            key_id, master_key = self.key_manager.get_current_key()
            key = self.key_manager.derive_key(salt)

            # Encrypt using AES-256-GCM
            cipher = AESGCM(key)
            ciphertext = cipher.encrypt(nonce, data_bytes, None)

            # Prepare output
            encrypted_payload = {
                "encrypted_data": base64.b64encode(
                    salt + ciphertext
                ).decode("utf-8"),
                "nonce": base64.b64encode(nonce).decode("utf-8"),
                "key_id": key_id,
                "algorithm": ENCRYPTION_ALGORITHM,
                "timestamp": datetime.utcnow().isoformat()
            }

            logger.debug(f"Data encrypted successfully with key_id: {key_id}")
            return encrypted_payload

        except Exception as e:
            logger.error(f"Encryption failed: {str(e)}")
            raise ValueError(f"Encryption error: {str(e)}")

    def decrypt_data(self, encrypted_payload: Dict[str, str]) -> str:
        """
        Decrypt encrypted data

        Args:
            encrypted_payload: Dictionary from encrypt_data()

        Returns:
            Decrypted data as string (parse JSON if needed)
        """
        try:
            # Extract components
            encrypted_data_b64 = encrypted_payload.get("encrypted_data")
            nonce_b64 = encrypted_payload.get("nonce")
            key_id = encrypted_payload.get("key_id")

            if not all([encrypted_data_b64, nonce_b64, key_id]):
                raise ValueError("Missing required encryption metadata")

            # Decode from base64
            encrypted_data = base64.b64decode(encrypted_data_b64)
            nonce = base64.b64decode(nonce_b64)

            # Extract salt and ciphertext
            salt = encrypted_data[:16]
            ciphertext = encrypted_data[16:]

            # Get decryption key
            key = self.key_manager.derive_key(salt)

            # Decrypt
            cipher = AESGCM(key)
            plaintext = cipher.decrypt(nonce, ciphertext, None)

            logger.debug(f"Data decrypted successfully with key_id: {key_id}")
            return plaintext.decode("utf-8")

        except Exception as e:
            logger.error(f"Decryption failed: {str(e)}")
            raise ValueError(f"Decryption error: {str(e)}")

    def encrypt_session_data(self, session_data: Dict) -> Dict:
        """Encrypt entire chatbot session"""
        encrypted = self.encrypt_data(session_data)
        return {
            "encrypted": True,
            "encryption": encrypted
        }

    def decrypt_session_data(self, encrypted_session: Dict) -> Dict:
        """Decrypt chatbot session"""
        if not encrypted_session.get("encrypted"):
            return encrypted_session

        decrypted_str = self.decrypt_data(encrypted_session["encryption"])
        return json.loads(decrypted_str)

    def encrypt_audio_data(self, audio_bytes: bytes) -> Dict[str, str]:
        """Encrypt audio file data"""
        return self.encrypt_data(base64.b64encode(audio_bytes).decode())

    def decrypt_audio_data(self, encrypted_audio: Dict[str, str]) -> bytes:
        """Decrypt audio file data"""
        decrypted_str = self.decrypt_data(encrypted_audio)
        return base64.b64decode(decrypted_str)

    def hash_data(self, data: str) -> str:
        """
        Hash data for verification (not encryption)
        Use for consent record hashing
        """
        import hashlib
        return hashlib.sha256(data.encode()).hexdigest()


# ═══════════════════════════════════════════════════════════════
# GLOBAL INSTANCES
# ═══════════════════════════════════════════════════════════════

_key_manager = KeyManager()
_encryption_service = EncryptionService(_key_manager)


# ═══════════════════════════════════════════════════════════════
# PUBLIC API
# ═══════════════════════════════════════════════════════════════

def encrypt_data(data: Union[str, Dict]) -> Dict[str, str]:
    """Encrypt data - public API"""
    return _encryption_service.encrypt_data(data)


def decrypt_data(encrypted_payload: Dict[str, str]) -> str:
    """Decrypt data - public API"""
    return _encryption_service.decrypt_data(encrypted_payload)


def encrypt_session_data(session_data: Dict) -> Dict:
    """Encrypt session - public API"""
    return _encryption_service.encrypt_session_data(session_data)


def decrypt_session_data(encrypted_session: Dict) -> Dict:
    """Decrypt session - public API"""
    return _encryption_service.decrypt_session_data(encrypted_session)


def encrypt_audio_data(audio_bytes: bytes) -> Dict[str, str]:
    """Encrypt audio - public API"""
    return _encryption_service.encrypt_audio_data(audio_bytes)


def decrypt_audio_data(encrypted_audio: Dict[str, str]) -> bytes:
    """Decrypt audio - public API"""
    return _encryption_service.decrypt_audio_data(encrypted_audio)


def get_key_manager() -> KeyManager:
    """Get key manager instance"""
    return _key_manager


def rotate_encryption_key() -> str:
    """Rotate encryption key"""
    logger.warning("Rotating encryption key...")
    return _key_manager.rotate_key()


def check_key_rotation_needed() -> bool:
    """Check if key rotation is needed"""
    return _key_manager.check_rotation_needed()


# ═══════════════════════════════════════════════════════════════
# TESTING & VERIFICATION
# ═══════════════════════════════════════════════════════════════

def verify_encryption() -> bool:
    """Verify encryption/decryption works correctly"""
    try:
        test_data = {"test": "data", "timestamp": datetime.utcnow().isoformat()}
        encrypted = encrypt_data(test_data)
        decrypted = decrypt_data(encrypted)
        recovered = json.loads(decrypted)

        assert recovered["test"] == test_data["test"], "Data mismatch after encryption/decryption"
        logger.info("Encryption verification passed ✓")
        return True

    except Exception as e:
        logger.error(f"Encryption verification failed: {str(e)}")
        return False


if __name__ == "__main__":
    # Test encryption service
    logging.basicConfig(level=logging.DEBUG)

    print("Testing Encryption Service...")
    print("=" * 60)

    # Test 1: Encrypt/Decrypt string
    print("\n1. Testing string encryption:")
    test_str = "This is sensitive data"
    encrypted = encrypt_data(test_str)
    print(f"   Encrypted: {encrypted['encrypted_data'][:50]}...")
    decrypted = decrypt_data(encrypted)
    print(f"   Decrypted: {decrypted}")
    assert decrypted == test_str, "String encryption failed"
    print("   ✓ String encryption test passed")

    # Test 2: Encrypt/Decrypt dict
    print("\n2. Testing dictionary encryption:")
    test_dict = {"case_id": "123", "client_name": "John Doe", "data": [1, 2, 3]}
    encrypted = encrypt_data(test_dict)
    decrypted = decrypt_data(encrypted)
    recovered_dict = json.loads(decrypted)
    assert recovered_dict == test_dict, "Dict encryption failed"
    print("   ✓ Dictionary encryption test passed")

    # Test 3: Key rotation
    print("\n3. Testing key rotation:")
    old_key_id = _key_manager.current_key_id
    new_key_id = rotate_encryption_key()
    assert old_key_id != new_key_id, "Key rotation failed"
    print(f"   Old key ID: {old_key_id[:20]}...")
    print(f"   New key ID: {new_key_id[:20]}...")
    print("   ✓ Key rotation test passed")

    # Test 4: Verification
    print("\n4. Running encryption verification:")
    result = verify_encryption()
    print(f"   Result: {'✓ PASSED' if result else '✗ FAILED'}")

    print("\n" + "=" * 60)
    print("All encryption tests completed!")
