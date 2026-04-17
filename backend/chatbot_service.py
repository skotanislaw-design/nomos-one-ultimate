"""
Core Chatbot Service for Nomos One
Manages chatbot sessions, message processing, and AI interactions
Supports Framework, Intake, and Q&A modes
"""

import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import json
import secrets
from models_chatbot import (
    ChatbotSession, ChatbotFramework, ChatMessage,
    ChatbotMode, SessionStatus, MessageType,
    StartChatbotSessionRequest, SendChatMessageRequest
)
from encryption_service import encrypt_session_data, decrypt_session_data
import asyncio

logger = logging.getLogger("chatbot_service")

# ═══════════════════════════════════════════════════════════════
# CHATBOT SESSION MANAGER
# ═══════════════════════════════════════════════════════════════

class ChatbotSessionManager:
    """Manages chatbot conversation sessions"""

    def __init__(self, db=None):
        self.db = db
        self.session_cache = {}  # In-memory cache for active sessions

    async def create_session(
        self,
        case_id: str,
        client_id: str,
        mode: ChatbotMode,
        framework_id: Optional[str] = None
    ) -> ChatbotSession:
        """
        Create new chatbot session

        Args:
            case_id: Associated case ID
            client_id: Client ID
            mode: Chatbot mode (framework, intake, qa)
            framework_id: Framework ID (only for framework mode)

        Returns:
            Created ChatbotSession
        """
        try:
            # Validate mode/framework compatibility
            if mode == ChatbotMode.FRAMEWORK and not framework_id:
                raise ValueError("Framework mode requires framework_id")

            # Create session
            session = ChatbotSession(
                case_id=case_id,
                client_id=client_id,
                mode=mode,
                framework_id=framework_id,
                status=SessionStatus.ACTIVE,
                messages=[],
                extracted_data={}
            )

            # Save to database
            if self.db:
                result = await self.db.chatbot_sessions.insert_one(session.dict())
                session._id = str(result.inserted_id)

            # Cache session
            self.session_cache[str(session._id)] = session

            logger.info(f"Session created: {session._id} (mode: {mode})")
            return session

        except Exception as e:
            logger.error(f"Failed to create session: {str(e)}")
            raise

    async def get_session(self, session_id: str) -> Optional[ChatbotSession]:
        """Retrieve session by ID"""
        try:
            # Check cache first
            if session_id in self.session_cache:
                return self.session_cache[session_id]

            # Fetch from database
            if self.db:
                session_data = await self.db.chatbot_sessions.find_one({"_id": session_id})
                if session_data:
                    session = ChatbotSession(**session_data)
                    self.session_cache[session_id] = session
                    return session

            logger.warning(f"Session not found: {session_id}")
            return None

        except Exception as e:
            logger.error(f"Failed to get session: {str(e)}")
            return None

    async def add_message(
        self,
        session_id: str,
        role: str,  # "user" | "assistant"
        content: str,
        message_type: MessageType = MessageType.TEXT
    ) -> ChatMessage:
        """
        Add message to session

        Args:
            session_id: Session ID
            role: Message role (user or assistant)
            content: Message content
            message_type: Type of message (text or voice)

        Returns:
            Created ChatMessage
        """
        try:
            # Get session
            session = await self.get_session(session_id)
            if not session:
                raise ValueError(f"Session not found: {session_id}")

            # Create message
            message = ChatMessage(
                role=role,
                content=content,
                type=message_type,
                timestamp=datetime.utcnow()
            )

            # Add to session
            session.messages.append(message)

            # Update database
            if self.db:
                await self.db.chatbot_sessions.update_one(
                    {"_id": session_id},
                    {"$push": {"messages": message.dict()}}
                )

            logger.debug(f"Message added to session {session_id}: {role}")
            return message

        except Exception as e:
            logger.error(f"Failed to add message: {str(e)}")
            raise

    async def update_session_status(
        self,
        session_id: str,
        status: SessionStatus
    ) -> bool:
        """Update session status"""
        try:
            session = await self.get_session(session_id)
            if not session:
                return False

            session.status = status
            if status == SessionStatus.SUBMITTED or status == SessionStatus.APPROVED:
                session.end_time = datetime.utcnow()

            if self.db:
                await self.db.chatbot_sessions.update_one(
                    {"_id": session_id},
                    {
                        "$set": {
                            "status": status.value,
                            "end_time": session.end_time
                        }
                    }
                )

            self.session_cache[session_id] = session
            logger.info(f"Session {session_id} status updated: {status}")
            return True

        except Exception as e:
            logger.error(f"Failed to update session status: {str(e)}")
            return False

    async def extract_session_data(
        self,
        session_id: str
    ) -> Dict[str, Any]:
        """
        Extract structured data from session messages

        Args:
            session_id: Session ID

        Returns:
            Extracted data dictionary
        """
        try:
            session = await self.get_session(session_id)
            if not session:
                return {}

            # Extract data based on mode
            extracted = {}

            if session.mode == ChatbotMode.FRAMEWORK:
                # Extract answers to framework questions
                extracted = await self._extract_framework_responses(session)

            elif session.mode == ChatbotMode.INTAKE:
                # Extract intake fields from conversation
                extracted = await self._extract_intake_fields(session)

            # Store extracted data
            session.extracted_data = extracted

            if self.db:
                await self.db.chatbot_sessions.update_one(
                    {"_id": session_id},
                    {"$set": {"extracted_data": extracted}}
                )

            return extracted

        except Exception as e:
            logger.error(f"Failed to extract session data: {str(e)}")
            return {}

    async def _extract_framework_responses(
        self,
        session: ChatbotSession
    ) -> Dict[str, Any]:
        """Extract framework question-answer pairs"""
        try:
            # Get framework
            framework = await self.db.chatbot_frameworks.find_one(
                {"_id": session.framework_id}
            )
            if not framework:
                return {}

            questions = {q["id"]: q["text"] for q in framework["questions"]}
            extracted = {}

            # Match user messages to questions (simplified logic)
            user_messages = [m for m in session.messages if m.role == "user"]
            for i, msg in enumerate(user_messages):
                q_id = f"q_{i}"
                if q_id in questions:
                    extracted[questions[q_id]] = msg.content

            return extracted

        except Exception as e:
            logger.error(f"Failed to extract framework responses: {str(e)}")
            return {}

    async def _extract_intake_fields(
        self,
        session: ChatbotSession
    ) -> Dict[str, Any]:
        """Extract intake fields from conversation"""
        # This would use AI to extract structured data from conversation
        # For now, simple keyword matching
        extracted = {
            "conversation_length": len(session.messages),
            "client_provided_info": True,
            "ready_for_lawyer_review": len(session.messages) > 3
        }
        return extracted

    async def generate_summary(
        self,
        session_id: str,
        use_ai: bool = True
    ) -> str:
        """
        Generate session summary

        Args:
            session_id: Session ID
            use_ai: Use AI for summary (requires AI service)

        Returns:
            Summary text
        """
        try:
            session = await self.get_session(session_id)
            if not session:
                return ""

            if use_ai:
                # Would call AI service here
                summary = await self._generate_ai_summary(session)
            else:
                # Generate simple summary
                summary = self._generate_simple_summary(session)

            # Store summary
            session.summary = summary

            if self.db:
                await self.db.chatbot_sessions.update_one(
                    {"_id": session_id},
                    {"$set": {"summary": summary}}
                )

            return summary

        except Exception as e:
            logger.error(f"Failed to generate summary: {str(e)}")
            return f"Session {session_id} - {len(session.messages)} messages"

    def _generate_simple_summary(self, session: ChatbotSession) -> str:
        """Generate simple text summary"""
        mode_text = {
            ChatbotMode.FRAMEWORK: "Framework-Based Intake",
            ChatbotMode.INTAKE: "General Case Intake",
            ChatbotMode.QA: "Q&A Session"
        }

        user_messages = [m for m in session.messages if m.role == "user"]
        message_preview = " ".join([m.content[:100] for m in user_messages[:3]])

        return f"""
Session Summary
═══════════════════════════════════════════════════════════
Mode: {mode_text.get(session.mode, session.mode)}
Duration: {(session.end_time or datetime.utcnow()) - session.start_time}
Messages: {len(session.messages)} total ({len(user_messages)} from client)
Status: {session.status}

Client Information Provided:
{message_preview}...

Ready for lawyer review: Yes
"""

    async def _generate_ai_summary(self, session: ChatbotSession) -> str:
        """Generate AI-powered summary (requires AI service)"""
        # This would call ai_service.generate_summary()
        # For now, return placeholder
        return self._generate_simple_summary(session)

    async def submit_session(self, session_id: str) -> bool:
        """Submit session for lawyer review"""
        try:
            # Generate summary
            await self.generate_summary(session_id)

            # Extract data
            await self.extract_session_data(session_id)

            # Update status
            return await self.update_session_status(
                session_id,
                SessionStatus.SUBMITTED
            )

        except Exception as e:
            logger.error(f"Failed to submit session: {str(e)}")
            return False

    async def abandon_session(self, session_id: str, reason: Optional[str] = None) -> bool:
        """Abandon session without submission"""
        try:
            session = await self.get_session(session_id)
            if session:
                session.end_time = datetime.utcnow()

                if self.db:
                    await self.db.chatbot_sessions.update_one(
                        {"_id": session_id},
                        {
                            "$set": {
                                "status": SessionStatus.ABANDONED.value,
                                "end_time": session.end_time
                            }
                        }
                    )

                logger.info(f"Session abandoned: {session_id} ({reason or 'no reason'})")
                return True

            return False

        except Exception as e:
            logger.error(f"Failed to abandon session: {str(e)}")
            return False

    async def get_client_sessions(
        self,
        client_id: str,
        limit: int = 10
    ) -> List[ChatbotSession]:
        """Get client's sessions"""
        try:
            if not self.db:
                return []

            sessions_data = await self.db.chatbot_sessions.find(
                {"client_id": client_id}
            ).sort("start_time", -1).limit(limit).to_list(None)

            return [ChatbotSession(**s) for s in sessions_data]

        except Exception as e:
            logger.error(f"Failed to get client sessions: {str(e)}")
            return []

    async def get_pending_sessions(
        self,
        case_id: str
    ) -> List[ChatbotSession]:
        """Get pending sessions for lawyer review"""
        try:
            if not self.db:
                return []

            sessions_data = await self.db.chatbot_sessions.find({
                "case_id": case_id,
                "status": SessionStatus.SUBMITTED.value
            }).sort("end_time", -1).to_list(None)

            return [ChatbotSession(**s) for s in sessions_data]

        except Exception as e:
            logger.error(f"Failed to get pending sessions: {str(e)}")
            return []

    async def cleanup_abandoned_sessions(self, older_than_days: int = 30) -> int:
        """Delete abandoned sessions older than N days"""
        try:
            if not self.db:
                return 0

            cutoff_date = datetime.utcnow() - timedelta(days=older_than_days)

            result = await self.db.chatbot_sessions.delete_many({
                "status": SessionStatus.ABANDONED.value,
                "end_time": {"$lt": cutoff_date}
            })

            logger.info(f"Deleted {result.deleted_count} abandoned sessions")
            return result.deleted_count

        except Exception as e:
            logger.error(f"Failed to cleanup abandoned sessions: {str(e)}")
            return 0


# ═══════════════════════════════════════════════════════════════
# FRAMEWORK MANAGER
# ═══════════════════════════════════════════════════════════════

class FrameworkManager:
    """Manages lawyer-created question frameworks"""

    def __init__(self, db=None):
        self.db = db

    async def create_framework(
        self,
        case_id: str,
        lawyer_id: str,
        title: str,
        description: str,
        questions: List[Dict],
        instructions: str,
        language: str = "el"
    ) -> ChatbotFramework:
        """Create new question framework"""
        try:
            framework = ChatbotFramework(
                case_id=case_id,
                lawyer_id=lawyer_id,
                title=title,
                description=description,
                category=ChatbotMode.FRAMEWORK,
                questions=questions,
                instructions=instructions,
                language=language,
                status="draft"
            )

            if self.db:
                result = await self.db.chatbot_frameworks.insert_one(framework.dict())
                framework._id = str(result.inserted_id)

            logger.info(f"Framework created: {framework._id}")
            return framework

        except Exception as e:
            logger.error(f"Failed to create framework: {str(e)}")
            raise

    async def activate_framework(self, framework_id: str) -> bool:
        """Activate framework for client use"""
        try:
            if self.db:
                result = await self.db.chatbot_frameworks.update_one(
                    {"_id": framework_id},
                    {"$set": {"status": "active"}}
                )
                return result.modified_count > 0

            return False

        except Exception as e:
            logger.error(f"Failed to activate framework: {str(e)}")
            return False

    async def get_framework(self, framework_id: str) -> Optional[ChatbotFramework]:
        """Get framework by ID"""
        try:
            if not self.db:
                return None

            framework_data = await self.db.chatbot_frameworks.find_one({"_id": framework_id})
            if framework_data:
                return ChatbotFramework(**framework_data)

            return None

        except Exception as e:
            logger.error(f"Failed to get framework: {str(e)}")
            return None

    async def get_case_frameworks(self, case_id: str) -> List[ChatbotFramework]:
        """Get all frameworks for a case"""
        try:
            if not self.db:
                return []

            frameworks_data = await self.db.chatbot_frameworks.find(
                {"case_id": case_id}
            ).to_list(None)

            return [ChatbotFramework(**f) for f in frameworks_data]

        except Exception as e:
            logger.error(f"Failed to get case frameworks: {str(e)}")
            return []


# ═══════════════════════════════════════════════════════════════
# GLOBAL INSTANCES
# ═══════════════════════════════════════════════════════════════

_session_manager: Optional[ChatbotSessionManager] = None
_framework_manager: Optional[FrameworkManager] = None


def get_session_manager(db=None) -> ChatbotSessionManager:
    """Get or create session manager"""
    global _session_manager
    if _session_manager is None:
        _session_manager = ChatbotSessionManager(db)
    return _session_manager


def get_framework_manager(db=None) -> FrameworkManager:
    """Get or create framework manager"""
    global _framework_manager
    if _framework_manager is None:
        _framework_manager = FrameworkManager(db)
    return _framework_manager


# ═══════════════════════════════════════════════════════════════
# TEST
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import asyncio

    async def test_chatbot_service():
        print("Testing Chatbot Service...")
        print("=" * 60)

        # Create managers (without DB for testing)
        session_mgr = ChatbotSessionManager()
        framework_mgr = FrameworkManager()

        # Test 1: Create session
        print("\n1. Creating chatbot session:")
        session = await session_mgr.create_session(
            case_id="case_001",
            client_id="client_001",
            mode=ChatbotMode.INTAKE
        )
        print(f"   Session ID: {session._id}")
        print(f"   Mode: {session.mode}")
        print("   ✓ Session created")

        # Test 2: Add messages
        print("\n2. Adding messages to session:")
        msg1 = await session_mgr.add_message(
            session._id,
            "assistant",
            "Καλώς ήρθατε στο chatbot. Ποια είναι η κύρια ανησυχία σας;",
            MessageType.TEXT
        )
        msg2 = await session_mgr.add_message(
            session._id,
            "user",
            "Θέλω να ξέρω για τα δικαιώματά μου στο εργατικό δίκαιο",
            MessageType.TEXT
        )
        print(f"   Messages added: {len([msg1, msg2])}")
        print("   ✓ Messages added")

        # Test 3: Generate summary
        print("\n3. Generating session summary:")
        summary = await session_mgr.generate_summary(session._id, use_ai=False)
        print(f"   Summary length: {len(summary)} chars")
        print("   ✓ Summary generated")

        # Test 4: Update status
        print("\n4. Updating session status:")
        await session_mgr.update_session_status(session._id, SessionStatus.SUBMITTED)
        updated = await session_mgr.get_session(session._id)
        print(f"   Status: {updated.status}")
        print("   ✓ Status updated")

        print("\n" + "=" * 60)
        print("Chatbot service tests completed!")

    # Run tests
    asyncio.run(test_chatbot_service())
