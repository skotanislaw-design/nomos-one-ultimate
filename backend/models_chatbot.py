"""
MongoDB Models for AI Chatbot System
Handles all chatbot-related data structures
"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional, Dict, Any
from enum import Enum


# ═══════════════════════════════════════════════════════════════
# ENUMS
# ═══════════════════════════════════════════════════════════════

class ChatbotMode(str, Enum):
    """Chatbot operation modes"""
    FRAMEWORK = "framework"      # Lawyer-defined questions
    INTAKE = "intake"            # General case intake
    QA = "qa"                     # Question & Answer


class SessionStatus(str, Enum):
    """Chatbot session status"""
    ACTIVE = "active"            # In progress
    SUBMITTED = "submitted"      # Waiting lawyer review
    APPROVED = "approved"        # Lawyer approved
    REJECTED = "rejected"        # Lawyer rejected
    ABANDONED = "abandoned"      # Client abandoned


class MessageType(str, Enum):
    """Message input type"""
    TEXT = "text"                # Text message
    VOICE = "voice"              # Voice transcribed to text


class ConsentType(str, Enum):
    """Consent agreement types"""
    DATA_COLLECTION = "data_collection"
    VOICE_RECORDING = "voice_recording"
    BOTH = "both"


class QuestionType(str, Enum):
    """Framework question types"""
    TEXT = "text"                # Free text response
    CHOICE = "choice"            # Single choice
    MULTI_CHOICE = "multi_choice"  # Multiple choices
    NUMERIC = "numeric"          # Numeric value
    DATE = "date"                # Date field


# ═══════════════════════════════════════════════════════════════
# CHATBOT FRAMEWORK
# ═══════════════════════════════════════════════════════════════

class FrameworkQuestion(BaseModel):
    """Individual question in framework"""
    id: str
    order: int
    text: str
    type: QuestionType
    options: Optional[List[str]] = None  # For choice/multi_choice
    required: bool = True
    hint: Optional[str] = None
    validation: Optional[str] = None  # Regex or validation rule


class ChatbotFramework(BaseModel):
    """Lawyer-defined question framework"""
    _id: Optional[str] = None
    case_id: str
    lawyer_id: str
    title: str
    description: str
    category: ChatbotMode
    questions: List[FrameworkQuestion]
    instructions: str
    language: str = "el"  # Greek default
    status: str = "draft"  # draft | active | archived
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ═══════════════════════════════════════════════════════════════
# CHATBOT SESSIONS
# ═══════════════════════════════════════════════════════════════

class MessageMetadata(BaseModel):
    """Metadata for messages"""
    audio_duration_ms: Optional[int] = None  # For voice messages
    tokens_used: Optional[int] = None
    confidence_score: Optional[float] = None  # For voice transcription


class ChatMessage(BaseModel):
    """Individual message in chatbot session"""
    role: str  # "user" | "assistant"
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    type: MessageType = MessageType.TEXT
    metadata: Optional[MessageMetadata] = None


class ConsentInfo(BaseModel):
    """Consent information for session"""
    data_collection: bool = False
    voice_recording: bool = False
    accepted_at: Optional[datetime] = None
    ip_address: Optional[str] = None


class EncryptionInfo(BaseModel):
    """Encryption details"""
    algorithm: str = "AES-256-GCM"
    key_id: Optional[str] = None
    nonce: Optional[str] = None


class ApprovalInfo(BaseModel):
    """Lawyer approval status"""
    lawyer_id: Optional[str] = None
    approved_at: Optional[datetime] = None
    approved: bool = False
    rejection_reason: Optional[str] = None


class ArchiveInfo(BaseModel):
    """Google Drive archival info"""
    google_drive_id: Optional[str] = None
    google_drive_path: Optional[str] = None
    archived_at: Optional[datetime] = None


class ChatbotSession(BaseModel):
    """Client chatbot conversation session"""
    _id: Optional[str] = None
    case_id: str
    client_id: str
    mode: ChatbotMode
    framework_id: Optional[str] = None  # Only for framework mode
    status: SessionStatus = SessionStatus.ACTIVE
    start_time: datetime = Field(default_factory=datetime.utcnow)
    end_time: Optional[datetime] = None
    messages: List[ChatMessage] = []
    summary: Optional[str] = None  # AI-generated summary
    extracted_data: Dict[str, Any] = {}  # Structured data extracted from conversation
    consent: ConsentInfo = Field(default_factory=ConsentInfo)
    encryption: EncryptionInfo = Field(default_factory=EncryptionInfo)
    approval: ApprovalInfo = Field(default_factory=ApprovalInfo)
    archived: ArchiveInfo = Field(default_factory=ArchiveInfo)


# ═══════════════════════════════════════════════════════════════
# DOCUMENT INTAKE (OCR)
# ═══════════════════════════════════════════════════════════════

class OCRProcessing(BaseModel):
    """OCR processing details"""
    status: str = "pending"  # pending | processing | complete | error
    ocr_provider: str = "google_vision"
    extracted_text: Optional[str] = None
    confidence_score: Optional[float] = None  # 0-1
    processing_time_ms: Optional[int] = None
    error_message: Optional[str] = None


class DocumentApproval(BaseModel):
    """Document approval status"""
    lawyer_id: Optional[str] = None
    status: str = "pending"  # pending | approved | rejected
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None


class DocumentIntakeRecord(BaseModel):
    """OCR-processed document intake"""
    _id: Optional[str] = None
    case_id: str
    document_id: str  # Reference to uploaded document
    filename: str
    upload_source: str  # sms | email | drag_drop
    processing: OCRProcessing = Field(default_factory=OCRProcessing)
    intake_fields: Dict[str, Any] = {}  # Dynamically populated
    ai_summary: Optional[str] = None
    approval: DocumentApproval = Field(default_factory=DocumentApproval)
    archived: ArchiveInfo = Field(default_factory=ArchiveInfo)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ═══════════════════════════════════════════════════════════════
# CONSENT RECORDS
# ═══════════════════════════════════════════════════════════════

class GDPRCompliance(BaseModel):
    """GDPR compliance checkboxes"""
    acknowledged_data_processing: bool = False
    acknowledged_retention: bool = False
    acknowledged_rights: bool = False


class ConsentRecord(BaseModel):
    """Privacy & data collection consent"""
    _id: Optional[str] = None
    case_id: str
    client_id: str
    consent_type: ConsentType
    agreement_text: str  # Full T&C text
    accepted: bool = False
    accepted_at: Optional[datetime] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    gdpr_compliance: GDPRCompliance = Field(default_factory=GDPRCompliance)
    expires_at: Optional[datetime] = None
    revoked: bool = False
    revoked_at: Optional[datetime] = None


# ═══════════════════════════════════════════════════════════════
# Q&A KNOWLEDGE BASE
# ═══════════════════════════════════════════════════════════════

class Reference(BaseModel):
    """Source reference"""
    title: str
    url: Optional[str] = None
    law_code: Optional[str] = None  # e.g., "Greek Penal Code Article 123"


class ChatbotQAEntry(BaseModel):
    """Q&A knowledge base entry"""
    _id: Optional[str] = None
    category: str  # statutes | timelines | procedures | general
    question: str
    answer: str
    references: List[Reference] = []
    related_topics: List[str] = []
    jurisdiction: str = "Greece"
    case_categories: List[str] = []  # Labor, Civil, Criminal, etc.
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    requires_legal_advice: bool = False
    language: str = "el"


# ═══════════════════════════════════════════════════════════════
# LAWYER AI REQUESTS (AUDIT LOG)
# ═══════════════════════════════════════════════════════════════

class LawyerAIRequest(BaseModel):
    """Internal lawyer assistant query log"""
    _id: Optional[str] = None
    lawyer_id: str
    query: str
    response: str
    case_id: Optional[str] = None
    client_id: Optional[str] = None
    confidence_score: Optional[float] = None
    sources_referenced: List[str] = []
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ═══════════════════════════════════════════════════════════════
# REQUEST/RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════

class StartChatbotSessionRequest(BaseModel):
    """Request to start new chatbot session"""
    mode: ChatbotMode
    framework_id: Optional[str] = None
    case_id: str


class SendChatMessageRequest(BaseModel):
    """Send message to chatbot"""
    session_id: str
    message: str
    message_type: MessageType = MessageType.TEXT


class SubmitSessionRequest(BaseModel):
    """Submit session to lawyer"""
    session_id: str


class ApprovalRequest(BaseModel):
    """Lawyer approval/rejection"""
    archive: bool = False


class RejectionRequest(BaseModel):
    """Lawyer rejection with reason"""
    reason: str


class ConsentAcceptanceRequest(BaseModel):
    """Accept consent agreement"""
    consent_type: ConsentType
    case_id: str
    client_id: str


class CreateFrameworkRequest(BaseModel):
    """Create new framework"""
    case_id: str
    title: str
    description: str
    questions: List[FrameworkQuestion]
    instructions: str
    language: str = "el"


class LawyerQueryRequest(BaseModel):
    """Lawyer AI assistant query"""
    query: str
    case_id: Optional[str] = None
    client_id: Optional[str] = None
