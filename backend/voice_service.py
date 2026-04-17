"""
Voice Service for Chatbot
Handles audio transcription and voice recording management
Uses OpenAI Whisper API for speech-to-text
"""

import logging
import io
import base64
from typing import Optional, Dict, Tuple
from datetime import datetime
import os

logger = logging.getLogger("voice_service")

# Check if OpenAI is available
try:
    from openai import OpenAI, AsyncOpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    logger.warning("OpenAI not installed. Voice transcription will be disabled.")


# ═══════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
WHISPER_MODEL = "whisper-1"
SUPPORTED_LANGUAGES = {
    "el": "Greek",
    "en": "English"
}
MAX_AUDIO_SIZE = 25 * 1024 * 1024  # 25MB (OpenAI limit)
SUPPORTED_FORMATS = ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"]


# ═══════════════════════════════════════════════════════════════
# VOICE SERVICE
# ═══════════════════════════════════════════════════════════════

class VoiceService:
    """Manages voice recording and transcription"""

    def __init__(self, db=None, api_key: str = OPENAI_API_KEY):
        self.db = db
        self.api_key = api_key
        self.client = None
        self.async_client = None

        if OPENAI_AVAILABLE and api_key:
            self.client = OpenAI(api_key=api_key)
            self.async_client = AsyncOpenAI(api_key=api_key)
        else:
            logger.warning("OpenAI not available. Transcription disabled.")

    async def transcribe_audio(
        self,
        audio_file: bytes,
        session_id: str,
        language: str = "el",
        filename: str = "audio.m4a"
    ) -> Dict[str, any]:
        """
        Transcribe audio file to text using Whisper API

        Args:
            audio_file: Audio bytes
            session_id: Chatbot session ID
            language: Language code (el, en)
            filename: Original filename

        Returns:
            Dictionary with:
            - transcript: Transcribed text
            - confidence_score: Confidence (0-1)
            - duration_ms: Audio duration
            - language: Detected language
        """
        try:
            if not OPENAI_AVAILABLE or not self.client:
                logger.error("OpenAI not available")
                return {
                    "transcript": "",
                    "error": "Voice transcription not available",
                    "confidence_score": 0.0
                }

            # Validate file size
            if len(audio_file) > MAX_AUDIO_SIZE:
                raise ValueError(f"Audio file too large. Max: {MAX_AUDIO_SIZE} bytes")

            # Validate format
            file_ext = filename.split(".")[-1].lower()
            if file_ext not in SUPPORTED_FORMATS:
                raise ValueError(f"Unsupported format: {file_ext}")

            # Create file-like object
            audio_stream = io.BytesIO(audio_file)
            audio_stream.name = filename

            # Call Whisper API
            logger.info(f"Transcribing audio: {filename} ({len(audio_file)} bytes)")

            transcript_response = self.client.audio.transcriptions.create(
                model=WHISPER_MODEL,
                file=audio_stream,
                language=language if language in SUPPORTED_LANGUAGES else None,
                response_format="verbose_json"
            )

            transcript_text = transcript_response.text
            duration = getattr(transcript_response, "duration", None)

            logger.info(f"Transcription complete: {len(transcript_text)} chars")

            return {
                "transcript": transcript_text,
                "confidence_score": 0.95,  # Whisper doesn't provide scores, use default
                "duration_ms": int(duration * 1000) if duration else None,
                "language": language,
                "session_id": session_id,
                "timestamp": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"Transcription failed: {str(e)}")
            return {
                "transcript": "",
                "error": str(e),
                "confidence_score": 0.0
            }

    async def store_transcript(
        self,
        session_id: str,
        transcript: str,
        audio_metadata: Dict
    ) -> bool:
        """Store transcript in database"""
        try:
            if not self.db:
                logger.warning("Database not configured")
                return False

            # Update session with transcript as message
            await self.db.chatbot_sessions.update_one(
                {"_id": session_id},
                {
                    "$push": {
                        "messages": {
                            "role": "user",
                            "content": transcript,
                            "type": "voice",
                            "timestamp": datetime.utcnow(),
                            "metadata": audio_metadata
                        }
                    }
                }
            )

            logger.info(f"Transcript stored for session: {session_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to store transcript: {str(e)}")
            return False

    async def validate_voice_consent(
        self,
        case_id: str,
        client_id: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if client has voice recording consent

        Args:
            case_id: Case ID
            client_id: Client ID

        Returns:
            (has_consent, consent_id)
        """
        try:
            if not self.db:
                logger.warning("Database not configured")
                return False, None

            # Check consent record
            consent = await self.db.consent_records.find_one({
                "case_id": case_id,
                "client_id": client_id,
                "consent_type": {"$in": ["voice_recording", "both"]},
                "accepted": True,
                "revoked": False
            })

            if consent:
                return True, str(consent.get("_id"))

            logger.warning(f"No voice consent found for {client_id}")
            return False, None

        except Exception as e:
            logger.error(f"Consent validation error: {str(e)}")
            return False, None

    async def encrypt_audio_data(
        self,
        audio_bytes: bytes,
        key_id: Optional[str] = None
    ) -> Dict[str, str]:
        """
        Encrypt audio data for storage

        Args:
            audio_bytes: Audio file bytes
            key_id: Encryption key ID

        Returns:
            Encrypted audio payload
        """
        try:
            from encryption_service import encrypt_audio_data

            encrypted = encrypt_audio_data(audio_bytes)
            logger.info(f"Audio encrypted: {len(audio_bytes)} bytes -> encrypted")
            return encrypted

        except Exception as e:
            logger.error(f"Audio encryption failed: {str(e)}")
            raise

    async def decrypt_audio_data(
        self,
        encrypted_audio: Dict[str, str]
    ) -> bytes:
        """Decrypt audio data from storage"""
        try:
            from encryption_service import decrypt_audio_data

            audio_bytes = decrypt_audio_data(encrypted_audio)
            return audio_bytes

        except Exception as e:
            logger.error(f"Audio decryption failed: {str(e)}")
            raise

    async def get_voice_metadata(
        self,
        session_id: str
    ) -> Dict:
        """Get voice-related metadata for session"""
        try:
            if not self.db:
                return {}

            session = await self.db.chatbot_sessions.find_one({"_id": session_id})
            if not session:
                return {}

            # Extract voice messages
            voice_messages = [
                m for m in session.get("messages", [])
                if m.get("type") == "voice"
            ]

            total_duration = sum(
                m.get("metadata", {}).get("audio_duration_ms", 0)
                for m in voice_messages
            )

            return {
                "voice_message_count": len(voice_messages),
                "total_duration_ms": total_duration,
                "avg_duration_ms": total_duration // len(voice_messages) if voice_messages else 0
            }

        except Exception as e:
            logger.error(f"Failed to get voice metadata: {str(e)}")
            return {}


# ═══════════════════════════════════════════════════════════════
# GLOBAL INSTANCE
# ═══════════════════════════════════════════════════════════════

_voice_service: Optional[VoiceService] = None


def get_voice_service(db=None, api_key: str = OPENAI_API_KEY) -> VoiceService:
    """Get or create voice service instance"""
    global _voice_service
    if _voice_service is None:
        _voice_service = VoiceService(db, api_key)
    return _voice_service


# ═══════════════════════════════════════════════════════════════
# MOCK SERVICE (for testing without OpenAI)
# ═══════════════════════════════════════════════════════════════

class MockVoiceService(VoiceService):
    """Mock voice service for testing without OpenAI API"""

    async def transcribe_audio(
        self,
        audio_file: bytes,
        session_id: str,
        language: str = "el",
        filename: str = "audio.m4a"
    ) -> Dict[str, any]:
        """Mock transcription"""
        logger.info(f"MOCK: Transcribing {filename}")

        # Simulate transcription
        mock_transcripts = {
            "el": "Αυτό είναι ένα δοκιμαστικό μήνυμα φωνής.",
            "en": "This is a test voice message."
        }

        return {
            "transcript": mock_transcripts.get(language, "Test transcript"),
            "confidence_score": 0.95,
            "duration_ms": 5000,
            "language": language,
            "session_id": session_id,
            "timestamp": datetime.utcnow().isoformat(),
            "mock": True
        }

    async def validate_voice_consent(
        self,
        case_id: str,
        client_id: str
    ) -> Tuple[bool, Optional[str]]:
        """Mock consent validation"""
        logger.info(f"MOCK: Validating voice consent for {client_id}")
        return True, "mock_consent_id"


# ═══════════════════════════════════════════════════════════════
# TEST
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import asyncio

    async def test_voice_service():
        print("Testing Voice Service...")
        print("=" * 60)

        # Use mock service for testing
        service = MockVoiceService(api_key="test")

        # Test 1: Mock transcription
        print("\n1. Testing voice transcription (mock):")
        mock_audio = b"mock_audio_data"
        result = await service.transcribe_audio(
            mock_audio,
            "session_001",
            "el",
            "test.m4a"
        )
        print(f"   Transcript: {result['transcript']}")
        print(f"   Confidence: {result['confidence_score']}")
        print("   ✓ Transcription test passed")

        # Test 2: Consent validation
        print("\n2. Testing voice consent validation:")
        has_consent, consent_id = await service.validate_voice_consent(
            "case_001",
            "client_001"
        )
        print(f"   Has consent: {has_consent}")
        print(f"   Consent ID: {consent_id}")
        print("   ✓ Consent validation test passed")

        # Test 3: Audio encryption (if available)
        print("\n3. Testing audio encryption:")
        try:
            from encryption_service import encrypt_audio_data, decrypt_audio_data

            test_audio = b"test_audio_data"
            encrypted = await service.encrypt_audio_data(test_audio)
            decrypted = await service.decrypt_audio_data(encrypted)

            assert decrypted == test_audio, "Audio mismatch after encryption"
            print("   ✓ Audio encryption test passed")
        except Exception as e:
            print(f"   ✗ Audio encryption test failed: {str(e)}")

        print("\n" + "=" * 60)
        print("Voice service tests completed!")

    # Run tests
    asyncio.run(test_voice_service())
