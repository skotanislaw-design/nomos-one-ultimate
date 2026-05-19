"""
Nomos One - Law Firm Management System
Production-ready FastAPI backend — Phase 1 Security Hardened
"""

from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File, Form, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from datetime import datetime, timedelta
from bson import ObjectId
from bson.errors import InvalidId
from collections import defaultdict
import jwt
import bcrypt
import os
import shutil
import json
import zipfile
import logging
import uuid
import time
import secrets
import re
from enum import Enum
from pathlib import Path

# ── PWA & Mobile Services ─────────────────────────────────────────────────────
from device_service import get_device_service
from push_service import get_push_service
from ai_service import extract_document as ai_extract_document, intake_analyze

# ── Two-Factor Authentication (Phase 1.6) ──────────────────────────────────────
from two_factor_service import TwoFactorService, OTPSessionType
from encryption_service import EncryptionService
from email_service import send_otp_email

# ── WebSocket & Real-time Messaging (Phase 1.7) ────────────────────────────────
from websocket_service import get_websocket_manager
from websocket_routes import router as ws_router, set_jwt_secret

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("nomos_one")

# ── Config ────────────────────────────────────────────────────────────────────
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "nomos_one")
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "8"))
DOCUMENT_STORAGE_PATH = Path(os.getenv("DOCUMENT_STORAGE_PATH", "/data/documents"))
ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "50"))
ALLOWED_FILE_TYPES = {
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg", "image/png", "image/tiff",
    "text/plain", "application/zip"
}

# ── Security Config ───────────────────────────────────────────────────────────
MIN_PASSWORD_LENGTH = int(os.getenv("MIN_PASSWORD_LENGTH", "8"))
MAX_LOGIN_ATTEMPTS = int(os.getenv("MAX_LOGIN_ATTEMPTS", "5"))
LOGIN_LOCKOUT_MINUTES = int(os.getenv("LOGIN_LOCKOUT_MINUTES", "15"))
STAGNANT_DAYS = int(os.getenv("STAGNANT_DAYS", "30"))
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# Validate JWT_SECRET at startup
if not JWT_SECRET or JWT_SECRET.startswith("CHANGE"):
    JWT_SECRET = secrets.token_hex(32)
    logger.warning(
        "JWT_SECRET not set or is default! Generated ephemeral secret. "
        "Set JWT_SECRET in .env for persistent sessions across restarts."
    )

DOCUMENT_STORAGE_PATH.mkdir(parents=True, exist_ok=True)

# ── Rate Limiter ─────────────────────────────────────────────────────────────
class LoginRateLimiter:
    def __init__(self):
        self._attempts: dict = defaultdict(list)
        self._lockouts: dict = {}

    def is_locked(self, key: str) -> bool:
        if key in self._lockouts:
            if time.time() < self._lockouts[key]:
                return True
            del self._lockouts[key]
            self._attempts.pop(key, None)
        return False

    def record_attempt(self, key: str) -> None:
        now = time.time()
        window = now - (LOGIN_LOCKOUT_MINUTES * 60)
        self._attempts[key] = [t for t in self._attempts[key] if t > window]
        self._attempts[key].append(now)
        if len(self._attempts[key]) >= MAX_LOGIN_ATTEMPTS:
            self._lockouts[key] = now + (LOGIN_LOCKOUT_MINUTES * 60)
            logger.warning(f"Account locked: {key}")

    def clear(self, key: str) -> None:
        self._attempts.pop(key, None)
        self._lockouts.pop(key, None)

    def remaining_lockout(self, key: str) -> int:
        if key in self._lockouts:
            return max(0, int((self._lockouts[key] - time.time()) / 60) + 1)
        return 0

rate_limiter = LoginRateLimiter()

# ── Password Policy ──────────────────────────────────────────────────────────
def validate_password(pw: str):
    if len(pw) < MIN_PASSWORD_LENGTH:
        return False, f"Ο κωδικός πρέπει να έχει τουλάχιστον {MIN_PASSWORD_LENGTH} χαρακτήρες"
    if not re.search(r"[A-Za-z]", pw):
        return False, "Ο κωδικός πρέπει να περιέχει τουλάχιστον ένα γράμμα"
    if not re.search(r"\d", pw):
        return False, "Ο κωδικός πρέπει να περιέχει τουλάχιστον ένα ψηφίο"
    return True, ""

# ── Input Validation ─────────────────────────────────────────────────────────
def validate_phone(phone):
    if not phone: return True
    cleaned = re.sub(r"[\s\-\+\(\)]", "", phone)
    return bool(re.match(r"^(30)?\d{10}$", cleaned) or re.match(r"^\d{10,15}$", cleaned))

def validate_tax_id(tax_id):
    if not tax_id: return True
    return bool(re.match(r"^\d{9}$", tax_id.strip()))

def sanitize_string(s):
    return s.strip() if s else s

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Nomos One API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DB ────────────────────────────────────────────────────────────────────────
client: AsyncIOMotorClient = None
db = None

# ── 2FA Services ──────────────────────────────────────────────────────────────
encryption_service: EncryptionService = None
two_factor_service: TwoFactorService = None

@app.on_event("startup")
async def startup():
    global client, db, encryption_service, two_factor_service
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    await db.users.create_index("email", unique=True)
    await db.cases.create_index([("case_number", 1)], unique=True)
    await db.cases.create_index([("assigned_lawyer_id", 1)])
    await db.audit_logs.create_index([("timestamp", -1)])
    await db.documents.create_index([("case_id", 1), ("uploaded_at", -1)])
    await db.notes.create_index([("case_id", 1), ("created_at", -1)])
    await db.financials.create_index([("case_id", 1)])
    # Phase 2: Deadlines
    await db.deadlines.create_index([("date", 1)])
    await db.deadlines.create_index([("case_id", 1)])
    # Phase 3: Case parties
    await db.case_parties.create_index([("case_id", 1)])
    # Phase 4: Invoices
    await db.invoices.create_index([("invoice_number", 1)], unique=True)
    await db.expenses_log.create_index([("case_id", 1)])
    await db.invoices.create_index([("case_id", 1)])
    await db.expenses_log.create_index([("case_id", 1)])
    # Initialize atomic counter
    existing = await db.counters.find_one({"_id": "case_number"})
    if not existing:
        year = datetime.utcnow().year
        count = await db.cases.count_documents({"case_number": {"$regex": f"^{year}-"}})
        await db.counters.update_one({"_id": "case_number"}, {"$set": {"year": year, "seq": count}}, upsert=True)

    # ── Phase 1.6: Two-Factor Authentication ─────────────────────────────────
    # Initialize TwoFactorService
    encryption_service = EncryptionService()
    two_factor_service = TwoFactorService(db, encryption_service)
    logger.info("TwoFactorService initialized")

    # Create OTP sessions collection with TTL index for auto-cleanup
    await db.otp_sessions.create_index([("expires_at", 1)], expireAfterSeconds=0)
    logger.info("OTP sessions collection initialized with TTL index")

    # ── Phase 1.7: WebSocket Real-time Messaging ───────────────────────────────
    # Initialize WebSocket manager
    ws_manager = get_websocket_manager()
    logger.info(f"WebSocket manager initialized: {ws_manager}")

    # Configure WebSocket routes with JWT secret
    set_jwt_secret(JWT_SECRET)

    # Include WebSocket router
    app.include_router(ws_router)
    logger.info("WebSocket routes registered")

    logger.info("Database connected and indexes created")
    await seed_default_admin()

@app.on_event("shutdown")
async def shutdown():
    client.close()

# ── Enums ─────────────────────────────────────────────────────────────────────
class UserRole(str, Enum):
    ADMIN = "administrator"
    LAWYER = "lawyer"
    SECRETARY = "secretary"

class CaseStatus(str, Enum):
    ACTIVE = "active"
    PENDING = "pending"
    CLOSED = "closed"
    ARCHIVED = "archived"

class PaymentStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    PARTIAL = "partial"
    OVERDUE = "overdue"

# ── Helpers ───────────────────────────────────────────────────────────────────
def serialize(doc) -> dict:
    if doc is None: return None
    doc = dict(doc)
    if "_id" in doc: doc["id"] = str(doc.pop("_id"))
    for k, v in doc.items():
        if isinstance(v, ObjectId): doc[k] = str(v)
    return doc

def make_id(val: str) -> ObjectId:
    try: return ObjectId(val)
    except: raise HTTPException(400, "Invalid ID format")

def hash_password(pw): return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
def verify_password(pw, hashed): return bcrypt.checkpw(pw.encode(), hashed.encode())

def create_token(payload):
    data = payload.copy()
    data["exp"] = datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)
    return jwt.encode(data, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token):
    try: return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError: raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError: raise HTTPException(401, "Invalid token")

security = HTTPBearer()

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(creds.credentials)
    user = await db.users.find_one({"_id": make_id(payload["sub"])})
    if not user: raise HTTPException(401, "User not found")
    if not user.get("is_active", True): raise HTTPException(403, "Ο λογαριασμός είναι ανενεργός")
    return serialize(user)

def require_role(*roles):
    async def checker(user=Depends(get_current_user)):
        if user["role"] not in [r.value for r in roles]: raise HTTPException(403, "Insufficient permissions")
        return user
    return checker

async def audit(action, user_id, resource, resource_id=None, details=None):
    await db.audit_logs.insert_one({
        "action": action, "user_id": user_id, "resource": resource,
        "resource_id": resource_id, "details": details or {}, "timestamp": datetime.utcnow()
    })

async def get_user_name(user_id):
    try:
        u = await db.users.find_one({"_id": make_id(user_id)}, {"name": 1})
        return u["name"] if u else "Άγνωστος"
    except: return "Άγνωστος"

async def get_client_name(client_id):
    try:
        c = await db.clients.find_one({"_id": make_id(client_id)}, {"name": 1})
        return c["name"] if c else "Άγνωστος"
    except: return "Άγνωστος"

# ── Seed ──────────────────────────────────────────────────────────────────────
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "christos@skotanislaw.com")
ADMIN_NAME = os.getenv("ADMIN_NAME", "Χρήστος Σκοτάνης")
ADMIN_INITIAL_PASSWORD = os.getenv("ADMIN_INITIAL_PASSWORD", "")

async def seed_default_admin():
    existing = await db.users.find_one({"role": UserRole.ADMIN.value})
    if not existing:
        if ADMIN_INITIAL_PASSWORD:
            pw = ADMIN_INITIAL_PASSWORD
            must_change = False  # User set their own password via env
        else:
            pw = secrets.token_urlsafe(16)
            must_change = True
        await db.users.insert_one({
            "email": ADMIN_EMAIL, "name": ADMIN_NAME,
            "password": hash_password(pw), "role": UserRole.ADMIN.value,
            "created_at": datetime.utcnow(), "is_active": True,
            "must_change_password": must_change
        })
        if must_change:
            logger.info(f"Admin created: {ADMIN_EMAIL} / {pw}")
            logger.info("SAVE THIS PASSWORD — it will not be shown again!")
        else:
            logger.info(f"Admin created: {ADMIN_EMAIL} (password set via ADMIN_INITIAL_PASSWORD)")
            logger.info("IMPORTANT: Remove ADMIN_INITIAL_PASSWORD from .env after first boot!")


# ══════════════════════════════════════════════════════════════════════════════
# AI INTAKE PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/intake/analyze")
async def intake_analyze_doc(
    file: UploadFile = File(...),
    user=Depends(get_current_user)
):
    """Step 1: Upload doc, get AI extraction with confidence/summary/missing fields."""
    if not ANTHROPIC_API_KEY:
        raise HTTPException(503, "Η υπηρεσία AI δεν έχει ρυθμιστεί")
    file_bytes = await file.read()
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(400, "Το αρχείο είναι πολύ μεγάλο (max 20MB)")
    media_type = file.content_type or "image/jpeg"
    try:
        from ai_service import intake_analyze
        result = intake_analyze(ANTHROPIC_API_KEY, file_bytes, media_type)
    except Exception as e:
        logger.error(f"Intake analyze error: {e}")
        raise HTTPException(500, f"Σφάλμα ανάλυσης: {str(e)[:200]}")
    await audit("INTAKE_ANALYZE", user["id"], "document", file.filename or "unknown")
    return result


class IntakeConfirmRequest(BaseModel):
    extracted: dict
    file_b64: Optional[str] = None
    filename: str = "document.pdf"
    media_type: str = "application/pdf"
    client_id: Optional[str] = None


@app.post("/api/intake/confirm", status_code=201)
async def intake_confirm(req: IntakeConfirmRequest, user=Depends(get_current_user)):
    """Step 2: Create client+case+deadlines from confirmed AI data, upload to Drive."""
    import base64 as b64mod
    now = datetime.utcnow()
    result = {}

    # ── 1. Create or find client ──────────────────────────────────────────────
    cl_data = req.extracted.get("client") or {}
    client_id_str = None
    if req.client_id:
        client_id_str = req.client_id
        _ec = await db.clients.find_one({"_id": make_id(req.client_id)})
        result["client"] = {"id": client_id_str,
                            "full_name": (_ec or {}).get("full_name", ""),
                            "existing": True}
    elif cl_data.get("full_name"):
        # Check if client with same AFM exists
        existing_client = None
        if cl_data.get("afm"):
            existing_client = await db.clients.find_one({"afm": cl_data["afm"]})
        if not existing_client and cl_data.get("full_name"):
            existing_client = await db.clients.find_one(
                {"full_name": {"$regex": cl_data["full_name"][:10], "$options": "i"}}
            )

        if existing_client:
            client_id_str = str(existing_client["_id"])
            result["client"] = {"id": client_id_str, "full_name": existing_client.get("full_name"), "existing": True}
        else:
            client_doc = {
                "full_name": sanitize_string(cl_data.get("full_name", "")),
                "afm": cl_data.get("afm"),
                "phone": cl_data.get("phone"),
                "email": cl_data.get("email"),
                "address": sanitize_string(cl_data.get("address") or ""),
                "client_type": cl_data.get("client_type", "individual"),
                "is_active": True,
                "source": "ai_intake",
                "created_at": now,
                "created_by": user["id"],
            }
            cr = await db.clients.insert_one(client_doc)
            client_id_str = str(cr.inserted_id)
            await audit("CREATE_CLIENT", user["id"], "client", client_id_str)
            result["client"] = {"id": client_id_str, "full_name": cl_data.get("full_name"), "existing": False}

    # ── 2. Create case ────────────────────────────────────────────────────────
    case_data = req.extracted.get("case") or {}
    case_id_str = None
    if case_data.get("title") or cl_data.get("full_name"):
        cn = await case_number_gen()
        case_title = case_data.get("title") or f"Υπόθεση {cl_data.get('full_name','')}"
        case_doc = {
            "title": sanitize_string(case_title),
            "client_id": client_id_str,
            "assigned_lawyer_id": user["id"],
            "status": "active",
            "legal_category": case_data.get("category", "αστικό"),
            "court": sanitize_string(case_data.get("court") or ""),
            "description": sanitize_string(
                req.extracted.get("summary") or case_data.get("summary") or ""
            ),
            "next_action": "",
            "case_number": cn,
            "opposing_party": sanitize_string(case_data.get("opposing_party") or ""),
            "source": "ai_intake",
            "review_status": "pending_review",
            "ai_confidence": req.extracted.get("confidence", "low"),
            "ai_key_facts": req.extracted.get("key_facts", []),
            "created_at": now,
            "created_by": user["id"],
            "updated_at": now,
            "last_activity": now,
        }
        cr2 = await db.cases.insert_one(case_doc)
        case_id_str = str(cr2.inserted_id)
        await audit("CREATE_CASE", user["id"], "case", case_id_str)
        result["case"] = {"id": case_id_str, "case_number": cn, "title": case_title}

    # ── 3. Create deadlines ───────────────────────────────────────────────────
    deadlines_created = []
    for dl in (req.extracted.get("deadlines") or []):
        if not dl.get("title") and not dl.get("due_date"):
            continue
        try:
            dl_date = datetime.fromisoformat(dl["due_date"]) if dl.get("due_date") else now + timedelta(days=30)
        except Exception:
            dl_date = now + timedelta(days=30)
        dl_doc = {
            "title": sanitize_string(dl.get("title") or "Προθεσμία"),
            "case_id": case_id_str,
            "client_id": client_id_str,
            "date": dl_date,
            "deadline_type": dl.get("type", "other"),
            "completed": False,
            "source": "ai_intake",
            "created_at": now,
            "created_by": user["id"],
        }
        dr = await db.deadlines.insert_one(dl_doc)
        deadlines_created.append({"id": str(dr.inserted_id), "title": dl_doc["title"],
                                   "due_date": dl.get("due_date")})
        await audit("CREATE_DEADLINE", user["id"], "deadline", str(dr.inserted_id))
    result["deadlines"] = deadlines_created

    # ── 4. Upload to Google Drive ─────────────────────────────────────────────
    drive_link = None
    try:
        from gdrive_service import is_configured, upload_document
        if is_configured() and req.file_b64:
            file_bytes = b64mod.b64decode(req.file_b64)
            client_name = cl_data.get("full_name", "Άγνωστος") or "Άγνωστος"
            year = str(now.year)
            case_number = result.get("case", {}).get("case_number", "")
            case_title_short = (case_data.get("title") or "Υπόθεση")[:30]
            case_folder = f"{case_number} - {case_title_short}" if case_number else case_title_short
            drive_result = upload_document(
                file_bytes=file_bytes,
                filename=req.filename or "document.pdf",
                mime_type=req.media_type,
                year=year,
                client_name=client_name[:50],
                case_folder=case_folder,
            )
            drive_link = drive_result.get("folder_link")
            # Store drive link on case
            if case_id_str and drive_link:
                await db.cases.update_one(
                    {"_id": make_id(case_id_str)},
                    {"$set": {"drive_folder": drive_link}}
                )
            result["drive"] = drive_result
    except Exception as e:
        logger.warning(f"Drive upload skipped: {e}")
        result["drive"] = None

    await audit("INTAKE_CONFIRM", user["id"], "intake", case_id_str or "unknown")
    return result


# ── Google Drive integration management ──────────────────────────────────────


@app.post("/api/integrations/gdrive/folder")
async def gdrive_set_folder(req: dict, user=Depends(require_role(UserRole.ADMIN))):
    """Save the Drive root folder ID (extracted from URL or raw ID)."""
    from gdrive_service import set_root_folder_id, get_root_folder_id
    url_or_id = req.get("folder_id", "").strip()
    if not url_or_id:
        raise HTTPException(400, "folder_id is required")
    # Extract folder ID from URL if full URL provided
    import re as _re
    m = _re.search(r"/folders/([a-zA-Z0-9_-]+)", url_or_id)
    folder_id = m.group(1) if m else url_or_id
    if len(folder_id) < 10:
        raise HTTPException(400, "Μη έγκυρο folder ID")
    set_root_folder_id(folder_id)
    await audit("GDRIVE_FOLDER", user["id"], "integration", folder_id)
    return {"ok": True, "folder_id": folder_id}

@app.get("/api/integrations/gdrive/status")
async def gdrive_status(user=Depends(require_role(UserRole.ADMIN))):
    try:
        from gdrive_service import is_configured, is_oauth_client_ready, get_root_folder_id
        configured = is_configured()
        client_ready = is_oauth_client_ready()
        folder_id = get_root_folder_id()
        return {
            "configured": configured,
            "oauth_client_ready": client_ready,
            "folder_configured": folder_id is not None,
            "auth_url": "/api/integrations/gdrive/oauth/start" if client_ready and not configured else None,
        }
    except Exception as e:
        return {"configured": False, "error": str(e)}


@app.post("/api/integrations/gdrive/oauth/client")
async def gdrive_upload_oauth_client(
    file: UploadFile = File(...),
    user=Depends(require_role(UserRole.ADMIN))
):
    from gdrive_service import save_oauth_client
    content = await file.read()
    ok = save_oauth_client(content)
    if not ok:
        raise HTTPException(400, "Μη εγκυρο OAuth client JSON. Κατεβαστε το απο Google Cloud Console.")
    await audit("GDRIVE_OAUTH_CLIENT", user["id"], "integration", "gdrive")
    return {"ok": True, "next": "Visit /api/integrations/gdrive/oauth/start to authorize"}


@app.get("/api/integrations/gdrive/oauth/start")
async def gdrive_oauth_start():
    from gdrive_service import get_auth_url
    try:
        url = get_auth_url()
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url)
    except RuntimeError as e:
        raise HTTPException(400, str(e))


@app.get("/api/integrations/gdrive/oauth/callback")
async def gdrive_oauth_callback(code: str = None, error: str = None, state: str = None):
    if error:
        from fastapi.responses import HTMLResponse
        return HTMLResponse(f"<h2>Authorization failed: {error}</h2><p>Close this tab and try again.</p>")
    if not code:
        raise HTTPException(400, "Missing authorization code")
    try:
        from gdrive_service import exchange_code
        exchange_code(code)
        from fastapi.responses import HTMLResponse
        return HTMLResponse("""<html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#16a34a">&#10003; Google Drive connected!</h2>
        <p>Authorization successful. You can close this tab and return to Nomos One.</p>
        <script>setTimeout(()=>window.close(),3000)</script>
        </body></html>""")
    except Exception as e:
        raise HTTPException(500, f"OAuth exchange failed: {str(e)}")


@app.post("/api/integrations/gdrive/setup")
async def gdrive_setup(
    file: UploadFile = File(...),
    user=Depends(require_role(UserRole.ADMIN))
):
    from gdrive_service import save_credentials, get_service_account_email
    content = await file.read()
    ok = save_credentials(content)
    if not ok:
        raise HTTPException(400, "Μη εγκυρο αρχειο service account.")
    email = get_service_account_email()
    await audit("GDRIVE_SETUP", user["id"], "integration", "gdrive")
    return {"ok": True, "service_account_email": email}


# ══════════════════════════════════════════════════════════════════════════════
# AUTH ROUTES
# ══════════════════════════════════════════════════════════════════════════════
class LoginRequest(BaseModel):
    email: str
    password: str
    device_id: Optional[str] = None  # For 2FA device trust

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

# ── Client Portal Models ──
class PortalLoginRequest(BaseModel):
    name: str
    case_category: str
    portal_code: str

class PortalForgotPasswordRequest(BaseModel):
    name: str
    case_category: str

class PortalMessageRequest(BaseModel):
    content: str
    subject: Optional[str] = None

class PortalAccessRequest(BaseModel):
    permissions: List[str] = Field(default_factory=lambda: [
        'case_title', 'case_number', 'case_status', 'client_name',
        'lawyer_name', 'lawyer_email', 'total_fees', 'outstanding_balance'
    ])

@app.post("/api/auth/login")
async def login(req: LoginRequest, request: Request):
    email = req.email.strip().lower()
    if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
        raise HTTPException(400, "Μη έγκυρη μορφή email")
    if rate_limiter.is_locked(email):
        mins = rate_limiter.remaining_lockout(email)
        raise HTTPException(429, f"Πολλές αποτυχημένες προσπάθειες. Δοκιμάστε σε {mins} λεπτά.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password"]):
        rate_limiter.record_attempt(email)
        raise HTTPException(401, "Λάθος email ή κωδικός")
    if not user.get("is_active", True):
        raise HTTPException(403, "Ο λογαριασμός είναι ανενεργός")
    if not user.get("is_approved", True):
        raise HTTPException(403, "Ο λογαριασμός σας δεν έχει εγκριθεί ακόμα από τον διαχειριστή")
    rate_limiter.clear(email)

    # ── Phase 1.6: Check 2FA Status ────────────────────────────────────────
    try:
        user_id_str = str(user["_id"])
        two_fa_status = await two_factor_service.get_2fa_status(user_id_str)

        # Check if device is trusted (skip 2FA if it is)
        device_id = req.device_id or "unknown"
        is_device_trusted = await two_factor_service.is_device_trusted(user_id_str, device_id)

        # If 2FA enabled and device not trusted, create OTP session
        if two_fa_status.get("enabled", False) and not is_device_trusted:
            # Create OTP session
            otp_session = await two_factor_service.create_otp_session(
                user_id=user_id_str,
                device_id=device_id,
                session_type=(
                    OTPSessionType.EMAIL_LOGIN
                    if two_fa_status.get("method") == "email"
                    else OTPSessionType.TOTP_LOGIN
                ),
                ip_address=request.client.host if request.client else "unknown",
                user_agent=request.headers.get("user-agent", "unknown")
            )

            # Send OTP email if email method
            if two_fa_status.get("method") == "email":
                await send_otp_email(
                    user["email"],
                    user.get("name", "User"),
                    otp_session["otp_code"],
                    expires_minutes=10
                )

                # Audit log
                await db.audit_logs.insert_one({
                    "timestamp": datetime.utcnow(),
                    "user_id": user_id_str,
                    "action": "2fa.otp_sent",
                    "details": {"method": "email", "device_id": device_id}
                })

            # Return OTP challenge instead of token
            def mask_email(email: str) -> str:
                try:
                    local, domain = email.split('@')
                    masked = local[:3] + "***" if len(local) > 3 else local[0] + "***"
                    return f"{masked}@{domain}"
                except:
                    return "***@***"

            return {
                "requires_2fa": True,
                "otp_session_id": otp_session["session_id"],
                "method": two_fa_status.get("method"),
                "email_masked": mask_email(user["email"]),
                "expires_in": otp_session.get("expires_in_seconds", 600)
            }
    except Exception as e:
        logger.warning(f"2FA check failed: {str(e)}, allowing login without 2FA")

    # Issue token (2FA not enabled or device trusted)
    token = create_token({"sub": str(user["_id"]), "role": user["role"]})
    await audit("LOGIN", str(user["_id"]), "auth")
    u = serialize(user)
    u.pop("password", None)
    return {"token": token, "user": u, "must_change_password": user.get("must_change_password", False)}

@app.get("/api/auth/me")
async def me(user=Depends(get_current_user)):
    u = dict(user); u.pop("password", None); return u

@app.post("/api/auth/verify-password")
async def verify_current_password(req: ChangePasswordRequest, user=Depends(get_current_user)):
    full_user = await db.users.find_one({"_id": make_id(user["id"])})
    if not full_user or not verify_password(req.current_password, full_user["password"]):
        raise HTTPException(401, "Λάθος κωδικός")
    return {"ok": True}

# ── Phase 1.6: Two-Factor Authentication Endpoints ───────────────────────────────

class OTPVerifyRequest(BaseModel):
    """OTP verification request"""
    otp_session_id: str
    code: str
    trust_device: bool = False

class BackupCodeVerifyRequest(BaseModel):
    """Backup code verification request"""
    otp_session_id: str
    code: str

@app.post("/api/auth/verify-otp")
async def verify_otp(req: OTPVerifyRequest, request: Request):
    """Verify OTP code and issue JWT token"""
    try:
        from bson import ObjectId

        # Get OTP session
        otp_session = await db.otp_sessions.find_one({"_id": ObjectId(req.otp_session_id)})
        if not otp_session:
            raise HTTPException(status_code=400, detail="Invalid OTP session")

        user_id_str = str(otp_session["user_id"])
        user_id = otp_session["user_id"]

        # Check rate limiting
        is_locked, locked_until = await two_factor_service.is_otp_locked(user_id_str)
        if is_locked:
            raise HTTPException(status_code=429, detail="Account locked. Try again in 15 minutes.")

        # Verify OTP code
        session_type = otp_session.get("otp_type", "email_login")
        if "totp" in session_type:
            valid, error = await two_factor_service.verify_totp_code(user_id_str, req.code)
        else:
            valid, error = await two_factor_service.verify_email_otp(str(req.otp_session_id), req.code)

        if not valid:
            await two_factor_service.increment_failed_otp_attempts(user_id_str)
            await db.audit_logs.insert_one({
                "timestamp": datetime.utcnow(),
                "user_id": user_id_str,
                "action": "2fa.otp_attempt_failed",
                "details": {"session_id": req.otp_session_id}
            })
            raise HTTPException(status_code=401, detail=error or "Invalid code")

        # Reset failed attempts
        await two_factor_service.reset_failed_otp_attempts(user_id_str)

        # Get user for token
        user = await db.users.find_one({"_id": user_id})

        # Issue JWT token
        token = create_token({"sub": str(user["_id"]), "role": user["role"]})

        # Mark device as trusted if requested
        trust_expires = None
        if req.trust_device:
            await two_factor_service.mark_device_as_trusted(
                user_id_str,
                otp_session["device_id"],
                otp_session.get("device_name", "Unknown Device")
            )
            device = await db.devices.find_one({"_id": otp_session["device_id"]})
            trust_expires = device.get("trust_expires_at") if device else None

        # Audit log successful verification
        await db.audit_logs.insert_one({
            "timestamp": datetime.utcnow(),
            "user_id": user_id_str,
            "action": "2fa.verified",
            "details": {
                "method": "totp" if "totp" in session_type else "email",
                "device_id": str(otp_session["device_id"]),
                "trusted": req.trust_device
            }
        })

        # Mark OTP session as verified
        await db.otp_sessions.update_one(
            {"_id": ObjectId(req.otp_session_id)},
            {"$set": {"verified": True, "verified_at": datetime.utcnow()}}
        )

        u = serialize(user)
        u.pop("password", None)
        return {
            "token": token,
            "user": u,
            "device_trusted": req.trust_device,
            "trust_expires": trust_expires
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OTP verification error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"OTP verification error: {str(e)}")


@app.post("/api/auth/verify-backup-code")
async def verify_backup_code(req: BackupCodeVerifyRequest):
    """Verify backup code and issue JWT token"""
    try:
        from bson import ObjectId

        # Get OTP session
        otp_session = await db.otp_sessions.find_one({"_id": ObjectId(req.otp_session_id)})
        if not otp_session:
            raise HTTPException(status_code=400, detail="Invalid OTP session")

        user_id_str = str(otp_session["user_id"])
        user_id = otp_session["user_id"]

        # Verify backup code
        valid, error, remaining = await two_factor_service.use_backup_code(user_id_str, req.code)
        if not valid:
            await two_factor_service.increment_failed_otp_attempts(user_id_str)
            raise HTTPException(status_code=401, detail=error)

        # Get user for token
        user = await db.users.find_one({"_id": user_id})

        # Issue JWT token
        token = create_token({"sub": str(user["_id"]), "role": user["role"]})

        # Audit log
        await db.audit_logs.insert_one({
            "timestamp": datetime.utcnow(),
            "user_id": user_id_str,
            "action": "2fa.backup_code_used",
            "details": {"codes_remaining": remaining}
        })

        # Mark OTP session as verified
        await db.otp_sessions.update_one(
            {"_id": ObjectId(req.otp_session_id)},
            {"$set": {"verified": True, "verified_at": datetime.utcnow()}}
        )

        u = serialize(user)
        u.pop("password", None)
        return {
            "token": token,
            "user": u,
            "codes_remaining": remaining
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Backup code verification error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Backup code error: {str(e)}")

@app.get("/api/notifications")
async def get_notifications(user=Depends(get_current_user)):
    now = datetime.utcnow()
    notifications = []

    inv_query = {"payment_status": {"$in": ["pending", "partial"]}, "due_date": {"$lt": now}}
    overdue_count = await db.invoices.count_documents(inv_query)
    if overdue_count > 0:
        label = "ληξιπρόθεσμο" if overdue_count == 1 else "ληξιπρόθεσμα"
        notifications.append({"id": "overdue-invoices", "type": "overdue",
            "msg": f"{overdue_count} τιμολόγια", "path": "/billing"})

    end = now + timedelta(days=3)
    dl_query = {"date": {"$gte": now, "$lte": end}, "completed": {"$ne": True}}
    urgent = await db.deadlines.find(dl_query).sort("date", 1).limit(3).to_list(None)
    for d in urgent:
        days_left = (d["date"] - now).days
        when = "σήμερα" if days_left == 0 else ("αύριο" if days_left == 1 else f"σε {days_left} μέρες")
        notifications.append({"id": f"deadline-{str(d['_id'])}", "type": "deadline",
            "msg": f"Προθεσμία {when}: {d.get('title', 'Χωρίς τίτλο')}", "path": "/calendar"})

    if user["role"] == UserRole.ADMIN.value:
        unread = await db.portal_messages.count_documents({"read_by_lawyer": {"$ne": True}})
        if unread > 0:
            notifications.append({"id": "portal-messages", "type": "message",
                "msg": f"{unread} αναγνωσμένα μηνύματα από πελάτες", "path": "/admin-portal"})
        pending = await db.portal_reset_requests.count_documents({"used": False})
        if pending > 0:
            notifications.append({"id": "portal-resets", "type": "warning",
                "msg": f"{pending} αιτήματα επαναφοράς κωδικού πύλης", "path": "/admin-portal"})

    return notifications



@app.post("/api/ai/extract-document")
async def ai_extract_doc(
    file: UploadFile = File(...),
    document_type: str = Form(default="auto"),
    user=Depends(get_current_user)
):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(503, "Η υπηρεσία AI δεν έχει ρυθμιστεί")
    file_bytes = await file.read()
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(400, "Το αρχείο είναι πολύ μεγάλο (max 20MB)")
    media_type = file.content_type or "image/jpeg"
    try:
        result = ai_extract_document(ANTHROPIC_API_KEY, file_bytes, media_type, document_type)
    except Exception as e:
        logger.error(f"AI extract error: {e}")
        raise HTTPException(500, f"Σφάλμα εξαγωγής: {str(e)[:200]}")
    await audit("AI_EXTRACT", user["id"], "document", file.filename or "unknown")
    return result



# ── Nomos AI Bot (Claude) ────────────────────────────────────────────────────
class BotChatEntry(BaseModel):
    role: str
    content: str

class BotChatRequest(BaseModel):
    message: str
    history: List[BotChatEntry] = []

@app.post("/api/bot/chat")
async def bot_chat(req: BotChatRequest, user=Depends(get_current_user)):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(503, "Η υπηρεσία AI δεν έχει ρυθμιστεί")

    system_prompt = (
        "Είσαι ο Nomos AI, νομικός βοηθός της δικηγορικής εταιρείας «Σκοτάνης & Συνεργάτες» στη Μύκονο. "
        "Ειδικεύεσαι στο ελληνικό δίκαιο: ποινικό (ΠΚ, ΚΠΔ), διοικητικό (ΣτΕ, ΔΕφ), "
        "αστικό (ΑΚ), εμπορικό, εργατικό, περιβαλλοντικό (ΑΕΚΚ, Ν.1650/1986, Ν.4042/2012). "
        "Απαντάς ΠΑΝΤΑ στα ελληνικά εκτός αν ο χρήστης γράψει σε άλλη γλώσσα. "
        "Χρησιμοποιείς νομική ορολογία, αναφέρεις νομοθεσία και νομολογία (ΑΠ, ΣτΕ κλπ.) όταν χρειάζεται. "
        "Είσαι συνοπτικός και πρακτικός. "
        "Βοηθάς με: σύνταξη δικογράφων/υπομνημάτων, ανάλυση νομικών ζητημάτων, "
        "εξήγηση νόμων, στρατηγικές υποθέσεων, υπολογισμό προθεσμιών."
    )

    messages = [
        {"role": h.role, "content": h.content}
        for h in req.history[-20:]
        if h.role in ("user", "assistant") and h.content.strip()
    ]
    messages.append({"role": "user", "content": req.message})

    async def stream_response():
        import anthropic as ant
        client = ant.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        try:
            async with client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                system=system_prompt,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    yield f"data: {json.dumps({'text': text})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Bot chat error: {e}")
            yield f"data: {json.dumps({'error': str(e)[:200]})}\n\n"

    return StreamingResponse(
        stream_response(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.post("/api/auth/change-password")
async def change_password(req: ChangePasswordRequest, user=Depends(get_current_user)):
    full_user = await db.users.find_one({"_id": make_id(user["id"])})
    if not verify_password(req.current_password, full_user["password"]):
        raise HTTPException(400, "Ο τρέχων κωδικός είναι λάθος")
    is_valid, err = validate_password(req.new_password)
    if not is_valid: raise HTTPException(400, err)
    if req.current_password == req.new_password:
        raise HTTPException(400, "Ο νέος κωδικός πρέπει να είναι διαφορετικός")
    await db.users.update_one({"_id": make_id(user["id"])}, {"$set": {
        "password": hash_password(req.new_password),
        "must_change_password": False,
        "password_changed_at": datetime.utcnow()
    }})
    await audit("CHANGE_PASSWORD", user["id"], "auth")
    return {"ok": True, "message": "Ο κωδικός άλλαξε επιτυχώς"}

# ══════════════════════════════════════════════════════════════════════════════
# USERS
# ══════════════════════════════════════════════════════════════════════════════
class CreateUserRequest(BaseModel):
    email: str; name: str; password: str; role: UserRole

class RegisterUserRequest(BaseModel):
    email: str; name: str; password: str

class UpdateUserRequest(BaseModel):
    name: Optional[str] = None; email: Optional[str] = None
    role: Optional[UserRole] = None; is_active: Optional[bool] = None
    password: Optional[str] = None

# ══════════════════════════════════════════════════════════════════════════════
# PWA & MOBILE - API v1
# ══════════════════════════════════════════════════════════════════════════════
class RegisterDeviceRequest(BaseModel):
    device_name: str = Field(..., min_length=1, max_length=255)
    device_type: str = Field(..., description="ios | android | web | desktop")
    push_token: str = Field(..., min_length=1)
    app_version: str = Field(..., description="e.g., 1.0.0")

class TrustDeviceRequest(BaseModel):
    device_name: Optional[str] = None

@app.get("/api/users")
async def list_users(user=Depends(require_role(UserRole.ADMIN))):
    users = await db.users.find({}).to_list(None)
    return [{k: v for k, v in serialize(u).items() if k != "password"} for u in users]

@app.post("/api/users", status_code=201)
async def create_user(req: CreateUserRequest, user=Depends(require_role(UserRole.ADMIN))):
    email = req.email.strip().lower()
    if not re.match(r"[^@]+@[^@]+\.[^@]+", email): raise HTTPException(400, "Μη έγκυρη μορφή email")
    is_valid, err = validate_password(req.password)
    if not is_valid: raise HTTPException(400, err)
    if await db.users.find_one({"email": email}): raise HTTPException(409, "Το email χρησιμοποιείται ήδη")
    doc = {"email": email, "name": sanitize_string(req.name), "password": hash_password(req.password),
           "role": req.role.value, "is_active": True, "is_approved": True, "created_at": datetime.utcnow(), "must_change_password": True}
    result = await db.users.insert_one(doc)
    await audit("CREATE_USER", user["id"], "user", str(result.inserted_id))
    doc["_id"] = result.inserted_id
    s = serialize(doc); s.pop("password", None); return s

@app.put("/api/users/{user_id}")
async def update_user(user_id: str, req: UpdateUserRequest, user=Depends(require_role(UserRole.ADMIN))):
    update = {}
    if req.name: update["name"] = sanitize_string(req.name)
    if req.email:
        email = req.email.strip().lower()
        if not re.match(r"[^@]+@[^@]+\.[^@]+", email): raise HTTPException(400, "Μη έγκυρη μορφή email")
        if await db.users.find_one({"email": email, "_id": {"$ne": make_id(user_id)}}):
            raise HTTPException(409, "Το email χρησιμοποιείται ήδη")
        update["email"] = email
    if req.role: update["role"] = req.role.value
    if req.is_active is not None: update["is_active"] = req.is_active
    if req.password:
        is_valid, err = validate_password(req.password)
        if not is_valid: raise HTTPException(400, err)
        update["password"] = hash_password(req.password)
        update["must_change_password"] = True
    if not update: raise HTTPException(400, "Δεν υπάρχουν πεδία")
    update["updated_at"] = datetime.utcnow()
    await db.users.update_one({"_id": make_id(user_id)}, {"$set": update})
    await audit("UPDATE_USER", user["id"], "user", user_id)
    return {"ok": True}

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str, user=Depends(require_role(UserRole.ADMIN))):
    if user_id == user["id"]: raise HTTPException(400, "Δεν μπορείτε να διαγράψετε τον εαυτό σας")
    await db.users.delete_one({"_id": make_id(user_id)})
    await audit("DELETE_USER", user["id"], "user", user_id)
    return {"ok": True}

# ── User Registration (Public) ──
@app.post("/api/auth/register", status_code=201)
async def register_user(req: RegisterUserRequest):
    """Δημόσια εγγραφή χρήστη — δημιουργεί pending user που χρειάζεται έγκριση"""
    email = req.email.strip().lower()
    if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
        raise HTTPException(400, "Μη έγκυρη μορφή email")
    is_valid, err = validate_password(req.password)
    if not is_valid:
        raise HTTPException(400, err)
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Το email χρησιμοποιείται ήδη")
    doc = {"email": email, "name": sanitize_string(req.name), "password": hash_password(req.password),
           "role": UserRole.LAWYER.value, "is_active": True, "is_approved": False,
           "created_at": datetime.utcnow(), "must_change_password": True}
    result = await db.users.insert_one(doc)
    await audit("REGISTER_USER", str(result.inserted_id), "user", str(result.inserted_id))
    return {"message": "Εγγραφή επιτυχής. Περιμένετε την έγκριση διαχειριστή.", "email": email}

# ── Admin: List Pending Users ──
@app.get("/api/admin/pending-users")
async def list_pending_users(user=Depends(require_role(UserRole.ADMIN))):
    """Λίστα χρηστών που περιμένουν έγκριση"""
    users = await db.users.find({"is_approved": False}).to_list(None)
    return [{k: v for k, v in serialize(u).items() if k != "password"} for u in users]

# ── Admin: Approve User ──
@app.post("/api/admin/users/{user_id}/approve")
async def approve_user(user_id: str, user=Depends(require_role(UserRole.ADMIN))):
    """Έγκριση χρήστη για πρόσβαση στο σύστημα"""
    result = await db.users.update_one({"_id": make_id(user_id)}, {"$set": {"is_approved": True}})
    if result.matched_count == 0:
        raise HTTPException(404, "Χρήστης δεν βρέθηκε")
    await audit("APPROVE_USER", user["id"], "user", user_id)
    return {"ok": True, "message": "Χρήστης εγκρίθηκε"}

# ── Admin: Reject User ──
@app.post("/api/admin/users/{user_id}/reject")
async def reject_user(user_id: str, user=Depends(require_role(UserRole.ADMIN))):
    """Απόρριψη και διαγραφή χρήστη"""
    if user_id == user["id"]:
        raise HTTPException(400, "Δεν μπορείτε να απορρίψετε τον εαυτό σας")
    result = await db.users.delete_one({"_id": make_id(user_id)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Χρήστης δεν βρέθηκε")
    await audit("REJECT_USER", user["id"], "user", user_id)
    return {"ok": True, "message": "Χρήστης απορρίφθηκε"}

# ══════════════════════════════════════════════════════════════════════════════
# CLIENT PORTAL
# ══════════════════════════════════════════════════════════════════════════════

def create_portal_token(data: dict, expires_in_hours: int = 730) -> str:
    """Create JWT token for portal access (30 days)"""
    payload = {**data, "exp": datetime.utcnow() + timedelta(hours=expires_in_hours), "type": "portal"}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

async def get_portal_user(credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False))) -> dict:
    """Get portal user from JWT token"""
    if not credentials:
        raise HTTPException(401, "Δεν υπάρχει πρόσβαση")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
        if payload.get("type") != "portal":
            raise HTTPException(401, "Μη έγκυρο token")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Το token έχει λήξει")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Μη έγκυρο token")

@app.post("/api/portal/auth")
async def portal_login(req: PortalLoginRequest):
    """Client portal authentication with name, category, and code"""
    # Find case by client name, category, and portal code
    portal_access = await db.portal_access.find_one({
        "portal_code": req.portal_code.strip(),
        "is_active": True
    })
    if not portal_access:
        raise HTTPException(401, "Μη έγκυρος κωδικός πρόσβασης")

    case = await db.cases.find_one({"_id": ObjectId(portal_access["case_id"])})
    if not case or case.get("client_name", "").lower() != req.name.strip().lower():
        raise HTTPException(401, "Μη συμφωνία στοιχείων")

    # Update last accessed
    await db.portal_access.update_one(
        {"_id": portal_access["_id"]},
        {"$set": {"accessed_at": datetime.utcnow()}}
    )

    token = create_portal_token({
        "client_id": portal_access["client_id"],
        "case_id": portal_access["case_id"],
        "client_name": case.get("client_name"),
        "permissions": portal_access.get("permissions", [])
    })

    await audit("PORTAL_LOGIN", str(portal_access["client_id"]), "portal", portal_access["case_id"])
    return {"token": token, "client_name": case.get("client_name"), "case_title": case.get("title")}

@app.post("/api/portal/forgot-password")
async def portal_forgot_password(req: PortalForgotPasswordRequest):
    """Client forgot password - notify admin"""
    # Find client case
    case = await db.cases.find_one({
        "$and": [
            {"client_name": {"$regex": f"^{re.escape(req.name)}$", "$options": "i"}},
            {"category": req.case_category}
        ]
    })

    if not case:
        # Don't reveal if case exists
        return {"message": "Αν η υπόθεση υπάρχει, ο διαχειριστής θα λάβει ειδοποίηση"}

    # Create password reset request
    reset_code = secrets.token_urlsafe(32)
    await db.portal_reset_requests.insert_one({
        "client_name": req.name,
        "case_id": str(case["_id"]),
        "reset_code": reset_code,
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(hours=24),
        "used": False
    })

    await audit("PORTAL_FORGOT_PASSWORD", str(case["_id"]), "portal", str(case["_id"]))
    return {"message": "Αίτημα επαναφοράς κωδικού καταχωρήθηκε. Ο διαχειριστής θα επικοινωνήσει."}

@app.get("/api/portal/my-case")
async def portal_get_case(user=Depends(get_portal_user)):
    """Get case data visible to client"""
    try:
        case = await db.cases.find_one({"_id": ObjectId(user["case_id"])})
    except InvalidId:
        raise HTTPException(404, "Υπόθεση δεν βρέθηκε")

    if not case:
        raise HTTPException(404, "Υπόθεση δεν βρέθηκε")

    permissions = user.get("permissions", [])

    # Filter case data by permissions
    filtered_case = {
        "id": str(case["_id"]),
        "title": case.get("title") if "case_title" in permissions else "—",
        "case_number": case.get("case_number") if "case_number" in permissions else "—",
        "status": case.get("status") if "case_status" in permissions else "—",
        "category": case.get("category") if "case_status" in permissions else "—",
    }

    # Add lawyer info if permitted
    if "lawyer_name" in permissions:
        lawyer = await db.users.find_one({"_id": ObjectId(case.get("assigned_lawyer_id", ""))})
        filtered_case["lawyer_name"] = lawyer.get("name") if lawyer else "—"
        filtered_case["lawyer_email"] = lawyer.get("email") if lawyer and "lawyer_email" in permissions else None

    # Add financial info if permitted
    if "total_fees" in permissions or "outstanding_balance" in permissions:
        financials = await db.financials.find({"case_id": user["case_id"]}).to_list(None)
        invoices = await db.invoices.find({"case_id": user["case_id"]}).to_list(None)
        total_fees = sum(f.get("amount", 0) for f in financials if f.get("entry_type") == "fee")
        total_paid = sum(i.get("amount_paid", 0) for i in invoices if i.get("payment_status") == "paid")
        filtered_case["total_fees"] = total_fees if "total_fees" in permissions else None
        filtered_case["outstanding_balance"] = (total_fees - total_paid) if "outstanding_balance" in permissions else None

    return filtered_case

@app.get("/api/portal/case-events")
async def portal_get_events(user=Depends(get_portal_user)):
    """Get case timeline events visible to client"""
    # Get non-sensitive audit events
    events = await db.audit_logs.find({
        "$or": [
            {"case_id": user["case_id"], "action": {"$in": ["CREATE_NOTE", "CREATE_DEADLINE", "UPDATE_STATUS", "CREATE_INVOICE"]}},
            {"entity_id": user["case_id"]}
        ]
    }).sort("created_at", -1).to_list(None)

    return [serialize(e) for e in events[:20]]

@app.post("/api/portal/messages")
async def portal_send_message(req: PortalMessageRequest, user=Depends(get_portal_user)):
    """Client send message to lawyer and admin"""
    case = await db.cases.find_one({"_id": ObjectId(user["case_id"])})
    if not case:
        raise HTTPException(404, "Υπόθεση δεν βρέθηκε")

    message = {
        "case_id": user["case_id"],
        "client_name": user.get("client_name"),
        "content": sanitize_string(req.content),
        "subject": req.subject or "Μήνυμα από πελάτη",
        "created_at": datetime.utcnow(),
        "read": False
    }

    result = await db.portal_messages.insert_one(message)

    # Notify lawyer and admin
    lawyer_id = case.get("assigned_lawyer_id")
    if lawyer_id:
        # TODO: Send native notification to lawyer
        pass

    # TODO: Send email to lawyer and admin

    await audit("PORTAL_MESSAGE", user.get("client_id", ""), "portal", str(result.inserted_id))
    return {"ok": True, "message_id": str(result.inserted_id)}

@app.post("/api/portal/upload")
async def portal_upload_document(file: UploadFile = File(...), user=Depends(get_portal_user)):
    """Client upload document"""
    if not file.filename:
        raise HTTPException(400, "Δεν υπάρχει αρχείο")

    # Save document
    doc_id = str(ObjectId())
    case_id = user["case_id"]
    doc_dir = Path(f"documents/{case_id}")
    doc_dir.mkdir(parents=True, exist_ok=True)
    file_path = doc_dir / f"{doc_id}_{file.filename}"

    with open(file_path, "wb") as f:
        f.write(await file.read())

    # Store in database
    doc = {
        "case_id": case_id,
        "filename": file.filename,
        "file_path": str(file_path),
        "uploaded_by": "portal_client",
        "uploaded_by_name": user.get("client_name"),
        "created_at": datetime.utcnow(),
        "size": file.size
    }

    result = await db.documents.insert_one(doc)

    # Notify lawyer
    case = await db.cases.find_one({"_id": ObjectId(case_id)})
    lawyer_id = case.get("assigned_lawyer_id")
    if lawyer_id:
        # TODO: Send native notification: "Client uploaded document: {filename}"
        pass

    await audit("PORTAL_UPLOAD", user.get("client_id", ""), "document", str(result.inserted_id))
    return {"ok": True, "document_id": str(result.inserted_id), "filename": file.filename}

# ── Admin Portal Management ──
@app.post("/api/admin/clients/{client_id}/generate-portal-access")
async def generate_portal_access(client_id: str, req: PortalAccessRequest, user=Depends(require_role(UserRole.ADMIN))):
    """Generate portal access code for client"""
    # Find client and their active cases
    try:
        client_oid = ObjectId(client_id)
    except InvalidId:
        raise HTTPException(400, "Μη έγκυρο client ID")

    cases = await db.cases.find({"client_id": client_id, "status": {"$in": ["active", "pending"]}}).to_list(None)
    if not cases:
        raise HTTPException(404, "Δεν υπάρχουν ενεργές υποθέσεις")

    # Create portal access for first case
    case = cases[0]
    portal_code = secrets.token_urlsafe(12)

    access_record = {
        "client_id": client_id,
        "case_id": str(case["_id"]),
        "portal_code": portal_code,
        "permissions": req.permissions,
        "is_active": True,
        "created_at": datetime.utcnow(),
        "created_by": user["id"]
    }

    result = await db.portal_access.insert_one(access_record)

    # TODO: Send email to client with portal_code and link

    await audit("CREATE_PORTAL_ACCESS", user["id"], "portal", str(result.inserted_id))
    return {
        "ok": True,
        "portal_code": portal_code,
        "case_id": str(case["_id"]),
        "case_title": case.get("title"),
        "message": "Portal code generated and email sent to client"
    }

@app.patch("/api/admin/cases/{case_id}/portal-permissions")
async def update_portal_permissions(case_id: str, req: PortalAccessRequest, user=Depends(require_role(UserRole.ADMIN))):
    """Update what fields client can see"""
    portal_access = await db.portal_access.find_one({"case_id": case_id})
    if not portal_access:
        raise HTTPException(404, "Portal access not found for this case")

    await db.portal_access.update_one(
        {"_id": portal_access["_id"]},
        {"$set": {"permissions": req.permissions, "updated_at": datetime.utcnow()}}
    )

    await audit("UPDATE_PORTAL_PERMISSIONS", user["id"], "portal", case_id)
    return {"ok": True, "message": "Portal permissions updated"}

@app.get("/api/admin/portal-access")
async def list_portal_access(user=Depends(require_role(UserRole.ADMIN))):
    """List all portal access codes"""
    codes = await db.portal_access.find().sort("created_at", -1).to_list(None)
    return [serialize(c) for c in codes]

@app.delete("/api/admin/portal-access/{code_id}")
async def delete_portal_access(code_id: str, user=Depends(require_role(UserRole.ADMIN))):
    """Delete a portal access code"""
    result = await db.portal_access.delete_one({"_id": make_id(code_id)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Portal access not found")
    await audit("DELETE_PORTAL_ACCESS", user["id"], "portal", code_id)
    return {"ok": True}

@app.get("/api/admin/portal-reset-requests")
async def list_portal_reset_requests(user=Depends(require_role(UserRole.ADMIN))):
    """List all portal password reset requests"""
    requests = await db.portal_reset_requests.find({"used": False}).sort("created_at", -1).to_list(None)
    return [serialize(r) for r in requests]

@app.post("/api/admin/portal-reset-requests/{request_id}/approve")
async def approve_portal_reset(request_id: str, user=Depends(require_role(UserRole.ADMIN))):
    """Approve reset: generate new portal code and notify client"""
    req = await db.portal_reset_requests.find_one({"_id": make_id(request_id)})
    if not req:
        raise HTTPException(404, "Request not found")

    case_id = req.get("case_id")
    portal_access = await db.portal_access.find_one({"case_id": case_id})
    if not portal_access:
        raise HTTPException(404, "Portal access not found for this case")

    new_code = secrets.token_urlsafe(12)
    await db.portal_access.update_one(
        {"_id": portal_access["_id"]},
        {"$set": {"portal_code": new_code, "updated_at": datetime.utcnow()}}
    )
    await db.portal_reset_requests.update_one(
        {"_id": make_id(request_id)},
        {"$set": {"used": True, "resolved_at": datetime.utcnow(), "resolved_by": user["id"]}}
    )
    await audit("APPROVE_PORTAL_RESET", user["id"], "portal", case_id)
    return {"ok": True, "new_portal_code": new_code}

@app.post("/api/admin/portal-reset-requests/{request_id}/reject")
async def reject_portal_reset(request_id: str, user=Depends(require_role(UserRole.ADMIN))):
    """Reject a portal password reset request"""
    result = await db.portal_reset_requests.update_one(
        {"_id": make_id(request_id)},
        {"$set": {"used": True, "resolved_at": datetime.utcnow(), "resolved_by": user["id"], "rejected": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Request not found")
    await audit("REJECT_PORTAL_RESET", user["id"], "portal", request_id)
    return {"ok": True}



# ══════════════════════════════════════════════════════════════════════════════
# CLIENTS
# ══════════════════════════════════════════════════════════════════════════════
class ClientRequest(BaseModel):
    full_name: str; email: Optional[str] = None; phone: Optional[str] = None
    address: Optional[str] = None; afm: Optional[str] = None; client_type: Optional[str] = None
    profession: Optional[str] = None; notes: Optional[str] = None; is_active: Optional[bool] = None

@app.get("/api/clients")
async def list_clients(user=Depends(get_current_user)):
    clients = await db.clients.find({}).to_list(None)
    return [serialize(c) for c in clients]

@app.get("/api/clients/{client_id}")
async def get_client(client_id: str, user=Depends(get_current_user)):
    doc = await db.clients.find_one({"_id": make_id(client_id)})
    if not doc: raise HTTPException(404, "Ο εντολέας δεν βρέθηκε")
    return serialize(doc)

@app.post("/api/clients", status_code=201)
async def create_client(req: ClientRequest, user=Depends(require_role(UserRole.ADMIN, UserRole.SECRETARY))):
    if req.phone and not validate_phone(req.phone): raise HTTPException(400, "Μη έγκυρος αριθμός τηλεφώνου")
    if req.afm and not validate_tax_id(req.afm): raise HTTPException(400, "Μη έγκυρο ΑΦΜ (9 ψηφία)")
    if req.email and not re.match(r"[^@]+@[^@]+\.[^@]+", req.email.strip()): raise HTTPException(400, "Μη έγκυρο email")
    doc = {"full_name": sanitize_string(req.full_name), "email": req.email.strip().lower() if req.email else None,
           "phone": req.phone.strip() if req.phone else None, "address": sanitize_string(req.address) if req.address else None,
           "afm": req.afm.strip() if req.afm else None, "client_type": req.client_type or "individual",
           "notes": sanitize_string(req.notes) if req.notes else None,
           "created_at": datetime.utcnow(), "created_by": user["id"]}
    result = await db.clients.insert_one(doc)
    await audit("CREATE_CLIENT", user["id"], "client", str(result.inserted_id))
    doc["_id"] = result.inserted_id; return serialize(doc)

@app.put("/api/clients/{client_id}")
async def update_client(client_id: str, req: ClientRequest, user=Depends(require_role(UserRole.ADMIN, UserRole.SECRETARY))):
    if req.phone and not validate_phone(req.phone): raise HTTPException(400, "Μη έγκυρος αριθμός τηλεφώνου")
    if req.afm and not validate_tax_id(req.afm): raise HTTPException(400, "Μη έγκυρο ΑΦΜ (9 ψηφία)")
    if req.email and not re.match(r"[^@]+@[^@]+\.[^@]+", req.email.strip()): raise HTTPException(400, "Μη έγκυρο email")
    data = {"full_name": sanitize_string(req.full_name), "email": req.email.strip().lower() if req.email else None,
            "phone": req.phone.strip() if req.phone else None, "address": sanitize_string(req.address) if req.address else None,
            "afm": req.afm.strip() if req.afm else None, "client_type": req.client_type,
            "notes": sanitize_string(req.notes) if req.notes else None,
            "updated_at": datetime.utcnow()}
    await db.clients.update_one({"_id": make_id(client_id)}, {"$set": data})
    await audit("UPDATE_CLIENT", user["id"], "client", client_id)
    return {"ok": True}

@app.get("/api/clients/{client_id}/export")
async def export_client(client_id: str, user=Depends(require_role(UserRole.ADMIN, UserRole.SECRETARY))):
    doc = await db.clients.find_one({"_id": make_id(client_id)})
    if not doc: raise HTTPException(404, "Ο εντολέας δεν βρέθηκε")
    cases = await db.cases.find({"client_id": client_id}).to_list(None)
    export_data = {"client": serialize(doc), "cases": [serialize(c) for c in cases], "exported_at": datetime.utcnow().isoformat()}
    await audit("EXPORT_CLIENT", user["id"], "client", client_id)
    content = json.dumps(export_data, ensure_ascii=False, indent=2, default=str)
    return StreamingResponse(iter([content.encode()]), media_type="application/json",
                             headers={"Content-Disposition": f"attachment; filename=client_{client_id}.json"})

# ══════════════════════════════════════════════════════════════════════════════
# CASES — atomic case number
# ══════════════════════════════════════════════════════════════════════════════
class CaseRequest(BaseModel):
    title: str; client_id: str; assigned_lawyer_id: Optional[str] = None
    status: CaseStatus = CaseStatus.ACTIVE; legal_category: Optional[str] = None; category: Optional[str] = None
    next_action: Optional[str] = None; next_action_date: Optional[datetime] = None; court: Optional[str] = None
    description: Optional[str] = None; summary: Optional[str] = None

class CaseStatusUpdate(BaseModel):
    status: CaseStatus; next_action: Optional[str] = None; next_action_date: Optional[datetime] = None

async def case_number_gen():
    year = datetime.utcnow().year
    result = await db.counters.find_one_and_update(
        {"_id": "case_number"}, {"$set": {"year": year}, "$inc": {"seq": 1}},
        upsert=True, return_document=True
    )
    if result.get("year") != year:
        result = await db.counters.find_one_and_update(
            {"_id": "case_number"}, {"$set": {"year": year, "seq": 1}}, return_document=True)
    return f"{year}-{str(result['seq']).zfill(4)}"

def is_locked(case): return case.get("status") in [CaseStatus.CLOSED.value, CaseStatus.ARCHIVED.value]

@app.get("/api/cases")
async def list_cases(user=Depends(get_current_user), status: Optional[str] = None):
    query = {}
    if status: query["status"] = status
    cases = await db.cases.find(query).sort("created_at", -1).to_list(None)
    result = []
    for c in cases:
        s = serialize(c)
        s["assigned_lawyer_name"] = await get_user_name(s.get("assigned_lawyer_id", ""))
        s["client_name"] = await get_client_name(s.get("client_id", ""))
        result.append(s)
    return result

@app.get("/api/cases/stagnant")
async def stagnant_cases(user=Depends(get_current_user)):
    sd = datetime.utcnow() - timedelta(days=STAGNANT_DAYS)
    q = {"status": "active", "$or": [{"last_activity": {"$lt": sd}},
         {"last_activity": {"$exists": False}, "created_at": {"$lt": sd}}]}
    cases = await db.cases.find(q).to_list(None)
    result = []
    for c in cases:
        s = serialize(c); s["assigned_lawyer_name"] = await get_user_name(s.get("assigned_lawyer_id", "")); result.append(s)
    return result
@app.get("/api/cases/{case_id}")
async def get_case(case_id: str, user=Depends(get_current_user)):
    case = await db.cases.find_one({"_id": make_id(case_id)})
    if not case: raise HTTPException(404, "Η υπόθεση δεν βρέθηκε")

    s = serialize(case)
    s["assigned_lawyer_name"] = await get_user_name(s.get("assigned_lawyer_id", ""))
    s["client_name"] = await get_client_name(s.get("client_id", ""))
    return s

@app.post("/api/cases", status_code=201)
async def create_case(req: CaseRequest, user=Depends(get_current_user)):
    # Use current user as lawyer if not specified
    lawyer_id = req.assigned_lawyer_id or user["id"]
    lawyer = await db.users.find_one({"_id": make_id(lawyer_id)})
    if not lawyer: raise HTTPException(404, "Ο δικηγόρος δεν βρέθηκε")
    cl = await db.clients.find_one({"_id": make_id(req.client_id)})
    if not cl: raise HTTPException(404, "Ο εντολέας δεν βρέθηκε")
    cn = await case_number_gen()
    doc = {"title": sanitize_string(req.title), "client_id": req.client_id,
           "assigned_lawyer_id": lawyer_id, "status": req.status.value,
           "next_action": sanitize_string(req.next_action or ""), "next_action_date": req.next_action_date,
           "legal_category": req.category or req.legal_category,
           "court": sanitize_string(req.court) if req.court else None,
           "description": sanitize_string(req.summary or req.description or "") if (req.summary or req.description) else None,
           "case_number": cn, "created_at": datetime.utcnow(), "created_by": user["id"],
           "updated_at": datetime.utcnow(), "last_activity": datetime.utcnow()}
    result = await db.cases.insert_one(doc)
    await audit("CREATE_CASE", user["id"], "case", str(result.inserted_id))
    doc["_id"] = result.inserted_id; s = serialize(doc)
    s["assigned_lawyer_name"] = lawyer.get("full_name") or lawyer.get("name", ""); s["client_name"] = cl.get("full_name") or cl.get("name", "")
    return s

@app.put("/api/cases/{case_id}")
async def update_case(case_id: str, req: CaseRequest, user=Depends(require_role(UserRole.ADMIN, UserRole.SECRETARY))):
    case = await db.cases.find_one({"_id": make_id(case_id)})
    if not case: raise HTTPException(404, "Η υπόθεση δεν βρέθηκε")
    if is_locked(case): raise HTTPException(423, "Η υπόθεση είναι κλειστή/αρχειοθετημένη")
    data = {"title": sanitize_string(req.title), "client_id": req.client_id,
            "assigned_lawyer_id": req.assigned_lawyer_id, "status": req.status.value,
            "next_action": sanitize_string(req.next_action), "next_action_date": req.next_action_date,
            "court": sanitize_string(req.court) if req.court else None,
            "description": sanitize_string(req.description) if req.description else None,
            "updated_at": datetime.utcnow()}
    await db.cases.update_one({"_id": make_id(case_id)}, {"$set": data})
    await audit("UPDATE_CASE", user["id"], "case", case_id)
    return {"ok": True}

@app.patch("/api/cases/{case_id}/status")
async def update_case_status(case_id: str, req: CaseStatusUpdate, user=Depends(require_role(UserRole.ADMIN, UserRole.SECRETARY))):
    case = await db.cases.find_one({"_id": make_id(case_id)})
    if not case: raise HTTPException(404, "Η υπόθεση δεν βρέθηκε")
    if is_locked(case) and req.status != CaseStatus.ACTIVE:
        if user["role"] != UserRole.ADMIN.value: raise HTTPException(423, "Η υπόθεση είναι κλειστή")
    update = {"status": req.status.value, "updated_at": datetime.utcnow()}
    if req.next_action: update["next_action"] = sanitize_string(req.next_action)
    if req.next_action_date: update["next_action_date"] = req.next_action_date
    await db.cases.update_one({"_id": make_id(case_id)}, {"$set": update})
    await audit("STATUS_CHANGE", user["id"], "case", case_id, {"new_status": req.status.value})
    return {"ok": True}

@app.get("/api/cases/{case_id}/export")
async def export_case(case_id: str, user=Depends(require_role(UserRole.ADMIN, UserRole.SECRETARY))):
    case = await db.cases.find_one({"_id": make_id(case_id)})
    if not case: raise HTTPException(404, "Η υπόθεση δεν βρέθηκε")
    notes = await db.notes.find({"case_id": case_id}).to_list(None)
    financials = await db.financials.find({"case_id": case_id}).to_list(None)
    docs_meta = await db.documents.find({"case_id": case_id}).to_list(None)
    import io
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        data = {"case": serialize(case), "notes": [serialize(n) for n in notes],
                "financials": [serialize(f) for f in financials],
                "documents_metadata": [serialize(d) for d in docs_meta],
                "exported_at": datetime.utcnow().isoformat()}
        zf.writestr("case_data.json", json.dumps(data, ensure_ascii=False, indent=2, default=str))
        for dm in docs_meta:
            fp = DOCUMENT_STORAGE_PATH / dm.get("stored_filename", "")
            if fp.exists(): zf.write(fp, f"documents/{dm.get('original_filename', 'file')}")
    buf.seek(0)
    await audit("EXPORT_CASE", user["id"], "case", case_id)
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": f"attachment; filename=case_{case_id}.zip"})

# ══════════════════════════════════════════════════════════════════════════════
# DOCUMENTS
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/cases/{case_id}/documents")
async def list_documents(case_id: str, user=Depends(get_current_user)):
    await _check_case_access(case_id, user)
    docs = await db.documents.find({"case_id": case_id}).sort("uploaded_at", -1).to_list(None)
    return [serialize(d) for d in docs]

@app.post("/api/cases/{case_id}/documents", status_code=201)
async def upload_document(case_id: str, file: UploadFile = File(...), doc_type: str = Query(...),
    doc_date: str = Query(...), court_authority: Optional[str] = Query(None),
    notes: Optional[str] = Query(None), user=Depends(get_current_user)):
    await _check_case_access(case_id, user)
    case = await db.cases.find_one({"_id": make_id(case_id)})
    if is_locked(case): raise HTTPException(423, "Η υπόθεση είναι κλειστή")
    if file.content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(400, f"Μη επιτρεπτός τύπος αρχείου: {file.content_type}")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"Το αρχείο υπερβαίνει το όριο {MAX_FILE_SIZE_MB}MB")
    orig = sanitize_string(file.filename) or "unnamed"
    ext = Path(orig).suffix; stored = f"{uuid.uuid4()}{ext}"
    (DOCUMENT_STORAGE_PATH / stored).write_bytes(content)
    meta = {"case_id": case_id, "original_filename": orig, "stored_filename": stored,
            "doc_type": sanitize_string(doc_type), "doc_date": doc_date,
            "court_authority": sanitize_string(court_authority) if court_authority else None,
            "notes": sanitize_string(notes) if notes else None, "content_type": file.content_type,
            "size_bytes": len(content), "uploaded_by": user["id"], "uploaded_at": datetime.utcnow(), "archived": False}
    r = await db.documents.insert_one(meta)
    await db.cases.update_one({"_id": make_id(case_id)}, {"$set": {"last_activity": datetime.utcnow()}})
    await audit("UPLOAD_DOCUMENT", user["id"], "document", str(r.inserted_id), {"filename": orig})
    meta["_id"] = r.inserted_id; return serialize(meta)

@app.get("/api/documents/{doc_id}/download")
async def download_document(doc_id: str, user=Depends(get_current_user)):
    doc = await db.documents.find_one({"_id": make_id(doc_id)})
    if not doc: raise HTTPException(404, "Το έγγραφο δεν βρέθηκε")
    await _check_case_access(doc["case_id"], user)
    fp = DOCUMENT_STORAGE_PATH / doc["stored_filename"]
    if not fp.exists(): raise HTTPException(404, "Αρχείο δεν βρέθηκε στο δίσκο")
    await audit("DOWNLOAD_DOCUMENT", user["id"], "document", doc_id)
    return FileResponse(fp, filename=doc["original_filename"], media_type=doc["content_type"])

@app.patch("/api/documents/{doc_id}/archive")
async def archive_document(doc_id: str, user=Depends(require_role(UserRole.ADMIN, UserRole.SECRETARY))):
    doc = await db.documents.find_one({"_id": make_id(doc_id)})
    if not doc: raise HTTPException(404, "Το έγγραφο δεν βρέθηκε")
    await db.documents.update_one({"_id": make_id(doc_id)}, {"$set": {"archived": True, "archived_at": datetime.utcnow()}})
    await audit("ARCHIVE_DOCUMENT", user["id"], "document", doc_id)
    return {"ok": True}

@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str, user=Depends(require_role(UserRole.ADMIN))):
    doc = await db.documents.find_one({"_id": make_id(doc_id)})
    if not doc: raise HTTPException(404, "Το έγγραφο δεν βρέθηκε")
    if doc.get("archived"): raise HTTPException(423, "Αρχειοθετημένα έγγραφα δεν διαγράφονται")
    fp = DOCUMENT_STORAGE_PATH / doc["stored_filename"]
    if fp.exists(): fp.unlink()
    await db.documents.delete_one({"_id": make_id(doc_id)})
    await audit("DELETE_DOCUMENT", user["id"], "document", doc_id)
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# NOTES
# ══════════════════════════════════════════════════════════════════════════════
class NoteRequest(BaseModel):
    content: str

@app.get("/api/cases/{case_id}/notes")
async def list_notes(case_id: str, user=Depends(get_current_user)):
    await _check_case_access(case_id, user)
    return [serialize(n) for n in await db.notes.find({"case_id": case_id}).sort("created_at", -1).to_list(None)]

@app.post("/api/cases/{case_id}/notes", status_code=201)
async def create_note(case_id: str, req: NoteRequest, user=Depends(get_current_user)):
    await _check_case_access(case_id, user)
    case = await db.cases.find_one({"_id": make_id(case_id)})
    if is_locked(case): raise HTTPException(423, "Η υπόθεση είναι κλειστή")
    doc = {"case_id": case_id, "content": sanitize_string(req.content),
           "author_id": user["id"], "author_name": user["name"], "created_at": datetime.utcnow()}
    r = await db.notes.insert_one(doc)
    await db.cases.update_one({"_id": make_id(case_id)}, {"$set": {"last_activity": datetime.utcnow()}})
    await audit("CREATE_NOTE", user["id"], "note", str(r.inserted_id))
    doc["_id"] = r.inserted_id; return serialize(doc)

# ══════════════════════════════════════════════════════════════════════════════
# FINANCIALS
# ══════════════════════════════════════════════════════════════════════════════
class FinancialRequest(BaseModel):
    description: str; amount: float; entry_type: str
    payment_status: PaymentStatus = PaymentStatus.PENDING; payment_method: Optional[str] = None; invoice_number: Optional[str] = None; due_date: Optional[datetime] = None; date: Optional[datetime] = None

@app.get("/api/cases/{case_id}/financials")
async def list_financials(case_id: str, user=Depends(get_current_user)):
    if user["role"] == UserRole.SECRETARY.value: raise HTTPException(403, "Δεν έχετε πρόσβαση στα οικονομικά")
    await _check_case_access(case_id, user)
    entries = await db.financials.find({"case_id": case_id}).sort("date", -1).to_list(None)
    total = sum(e.get("amount", 0) for e in entries)
    total_fees = sum(e.get("amount", 0) for e in entries if e.get("entry_type") == "fee")
    total_expenses = sum(e.get("amount", 0) for e in entries if e.get("entry_type") == "expense")
    return {"entries": [serialize(e) for e in entries], "total": total, "total_fees": total_fees, "total_expenses": total_expenses}

@app.post("/api/cases/{case_id}/financials", status_code=201)
async def create_financial(case_id: str, req: FinancialRequest, user=Depends(require_role(UserRole.ADMIN, UserRole.LAWYER))):
    await _check_case_access(case_id, user)
    case = await db.cases.find_one({"_id": make_id(case_id)})
    if is_locked(case): raise HTTPException(423, "Η υπόθεση είναι κλειστή")
    if req.amount <= 0: raise HTTPException(400, "Το ποσό πρέπει να είναι θετικό")
    if req.entry_type not in ("fee", "expense"): raise HTTPException(400, "Τύπος: 'fee' ή 'expense'")
    doc = {"description": sanitize_string(req.description), "amount": req.amount, "entry_type": req.entry_type,
           "payment_status": req.payment_status.value, "case_id": case_id, "created_by": user["id"],
           "created_at": datetime.utcnow(), "date": req.date or datetime.utcnow()}
    r = await db.financials.insert_one(doc)
    await audit("CREATE_FINANCIAL", user["id"], "financial", str(r.inserted_id))
    doc["_id"] = r.inserted_id; return serialize(doc)

@app.put("/api/cases/{case_id}/financials/{entry_id}")
async def update_financial(case_id: str, entry_id: str, req: FinancialRequest, user=Depends(require_role(UserRole.ADMIN, UserRole.LAWYER))):
    case = await db.cases.find_one({"_id": make_id(case_id)})
    if is_locked(case): raise HTTPException(423, "Η υπόθεση είναι κλειστή")
    if req.amount <= 0: raise HTTPException(400, "Το ποσό πρέπει να είναι θετικό")
    await db.financials.update_one({"_id": make_id(entry_id)}, {"$set": {
        "description": sanitize_string(req.description), "amount": req.amount,
        "entry_type": req.entry_type, "payment_status": req.payment_status.value,
        "date": req.date or datetime.utcnow(), "updated_at": datetime.utcnow()}})
    await audit("UPDATE_FINANCIAL", user["id"], "financial", entry_id)
    return {"ok": True}

@app.delete("/api/cases/{case_id}/financials/{entry_id}")
async def delete_financial(case_id: str, entry_id: str, user=Depends(require_role(UserRole.ADMIN))):
    case = await db.cases.find_one({"_id": make_id(case_id)})
    if is_locked(case): raise HTTPException(423, "Η υπόθεση είναι κλειστή")
    await db.financials.delete_one({"_id": make_id(entry_id)})
    await audit("DELETE_FINANCIAL", user["id"], "financial", entry_id)
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# SEARCH & AUDIT & DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/search")
async def search(q: str = Query(..., min_length=1), user=Depends(get_current_user)):
    results = {"cases": [], "clients": []}
    q_clean = q.strip(); regex = {"$regex": q_clean, "$options": "i"}
    cq = {"$or": [{"title": regex}, {"case_number": regex}, {"description": regex}]}
    if user["role"] == UserRole.LAWYER.value: cq["assigned_lawyer_id"] = user["id"]
    results["cases"] = [serialize(c) for c in await db.cases.find(cq).limit(10).to_list(None)]
    if user["role"] != UserRole.LAWYER.value:
        results["clients"] = [serialize(c) for c in await db.clients.find(
            {"$or": [{"name": regex}, {"email": regex}, {"phone": regex}]}).limit(10).to_list(None)]
    return results

@app.get("/api/audit-logs")
async def get_audit_logs(user=Depends(require_role(UserRole.ADMIN)), skip: int = 0, limit: int = 50, resource: Optional[str] = None):
    query = {"resource": resource} if resource else {}
    logs = await db.audit_logs.find(query).sort("timestamp", -1).skip(skip).limit(min(limit, 100)).to_list(None)
    total = await db.audit_logs.count_documents(query)
    return {"logs": [serialize(l) for l in logs], "total": total}

@app.get("/api/dashboard/stats")
async def dashboard_stats(user=Depends(get_current_user)):
    q = {"assigned_lawyer_id": user["id"]} if user["role"] == UserRole.LAWYER.value else {}
    total = await db.cases.count_documents(q)
    active = await db.cases.count_documents({**q, "status": "active"})
    pending = await db.cases.count_documents({**q, "status": "pending"})
    closed = await db.cases.count_documents({**q, "status": "closed"})
    sd = datetime.utcnow() - timedelta(days=STAGNANT_DAYS)
    stagnant = await db.cases.count_documents({**q, "status": "active", "$or": [
        {"last_activity": {"$lt": sd}}, {"last_activity": {"$exists": False}, "created_at": {"$lt": sd}}]})
    overdue = 0
    if user["role"] != UserRole.SECRETARY.value:
        overdue = await db.financials.count_documents({"payment_status": "overdue"})
    return {"total_cases": total, "active_cases": active, "pending_cases": pending,
            "closed_cases": closed, "stagnant_cases": stagnant, "overdue_financials": overdue}

    return result

# ── Lookup endpoint for populating dropdowns ──────────────────────────────────
@app.get("/api/users/lawyers")
async def list_lawyers(user=Depends(get_current_user)):
    """List active lawyers for case assignment dropdown."""
    lawyers = await db.users.find({"role": UserRole.LAWYER.value, "is_active": True}, {"name": 1, "email": 1}).to_list(None)
    return [serialize(l) for l in lawyers]

async def _check_case_access(case_id, user):
    case = await db.cases.find_one({"_id": make_id(case_id)})
    if not case: raise HTTPException(404, "Η υπόθεση δεν βρέθηκε")

    return case

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2: DEADLINES / CALENDAR
# ══════════════════════════════════════════════════════════════════════════════
class DeadlineType(str, Enum):
    COURT_DATE = "court_date"          # Δικάσιμος
    FILING_DEADLINE = "filing_deadline" # Προθεσμία κατάθεσης
    STATUTE_LIMIT = "statute_limit"    # Παραγραφή
    MEETING = "meeting"                # Συνάντηση
    PAYMENT_DUE = "payment_due"        # Πληρωμή
    OTHER = "other"                    # Λοιπά

class DeadlineRequest(BaseModel):
    case_id: Optional[str] = None
    title: str
    deadline_type: Optional[str] = None
    type: Optional[str] = None
    date: Optional[datetime] = None
    due_date: Optional[str] = None
    description: Optional[str] = None
    reminder_days: int = 3
    all_day: bool = True
    location: Optional[str] = None

class DeadlineUpdateRequest(BaseModel):
    title: Optional[str] = None
    deadline_type: Optional[DeadlineType] = None
    date: Optional[datetime] = None
    description: Optional[str] = None
    reminder_days: Optional[int] = None
    completed: Optional[bool] = None
    all_day: Optional[bool] = None
    location: Optional[str] = None

@app.get("/api/deadlines")
async def list_deadlines(
    user=Depends(get_current_user),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    include_completed: bool = False
):
    """List deadlines, optionally filtered by date range."""
    query = {}
    if not include_completed:
        query["completed"] = {"$ne": True}
    if user["role"] == UserRole.LAWYER.value:
        # Only deadlines for lawyer's cases + personal (no case_id)
        lawyer_case_ids = await db.cases.distinct("_id", {"assigned_lawyer_id": user["id"]})
        lawyer_case_str_ids = [str(cid) for cid in lawyer_case_ids]
        query["$or"] = [
            {"case_id": {"$in": lawyer_case_str_ids}},
            {"case_id": None},
            {"created_by": user["id"]}
        ]
    if from_date:
        try: query.setdefault("date", {})["$gte"] = datetime.fromisoformat(from_date)
        except: pass
    if to_date:
        try: query.setdefault("date", {})["$lte"] = datetime.fromisoformat(to_date)
        except: pass
    deadlines = await db.deadlines.find(query).sort("date", 1).to_list(None)
    result = []
    for d in deadlines:
        s = serialize(d)
        if s.get("case_id"):
            case = await db.cases.find_one({"_id": make_id(s["case_id"])}, {"title": 1, "case_number": 1})
            if case:
                s["case_title"] = case.get("title", "")
                s["case_number"] = case.get("case_number", "")
        result.append(s)
    return result

@app.get("/api/deadlines/upcoming")
async def upcoming_deadlines(user=Depends(get_current_user), days: int = 14):
    """Get deadlines within next N days for dashboard."""
    now = datetime.utcnow()
    end = now + timedelta(days=days)
    query = {"date": {"$gte": now, "$lte": end}, "completed": {"$ne": True}}
    if user["role"] == UserRole.LAWYER.value:
        cids = await db.cases.distinct("_id", {"assigned_lawyer_id": user["id"]})
        cids_str = [str(c) for c in cids]
        query["$or"] = [{"case_id": {"$in": cids_str}}, {"case_id": None}, {"created_by": user["id"]}]
    deadlines = await db.deadlines.find(query).sort("date", 1).limit(20).to_list(None)
    result = []
    for d in deadlines:
        s = serialize(d)
        if s.get("case_id"):
            case = await db.cases.find_one({"_id": make_id(s["case_id"])}, {"title": 1, "case_number": 1})
            if case: s["case_title"] = case.get("title", ""); s["case_number"] = case.get("case_number", "")
        # Add urgency
        days_until = (d["date"] - now).days
        s["days_until"] = days_until
        s["is_urgent"] = days_until <= d.get("reminder_days", 3)
        s["is_overdue"] = days_until < 0
        result.append(s)
    return result

@app.post("/api/deadlines", status_code=201)
async def create_deadline(req: DeadlineRequest, user=Depends(get_current_user)):
    if req.case_id:
        await _check_case_access(req.case_id, user)
    doc = {
        "case_id": req.case_id,
        "title": sanitize_string(req.title),
        "deadline_type": (req.deadline_type or req.type or "hearing"),
        "date": req.due_date and __import__('datetime').datetime.fromisoformat(req.due_date) or req.date or __import__('datetime').datetime.utcnow(),
        "description": sanitize_string(req.description) if req.description else None,
        "reminder_days": req.reminder_days,
        "all_day": req.all_day,
        "location": sanitize_string(req.location) if req.location else None,
        "completed": False,
        "created_by": user["id"],
        "created_at": datetime.utcnow()
    }
    r = await db.deadlines.insert_one(doc)
    await audit("CREATE_DEADLINE", user["id"], "deadline", str(r.inserted_id))
    doc["_id"] = r.inserted_id
    return serialize(doc)

@app.put("/api/deadlines/{deadline_id}")
async def update_deadline(deadline_id: str, req: DeadlineUpdateRequest, user=Depends(get_current_user)):
    dl = await db.deadlines.find_one({"_id": make_id(deadline_id)})
    if not dl: raise HTTPException(404, "Η προθεσμία δεν βρέθηκε")
    if dl.get("case_id"):
        await _check_case_access(dl["case_id"], user)
    update = {}
    if req.title is not None: update["title"] = sanitize_string(req.title)
    if req.deadline_type is not None: update["deadline_type"] = req.deadline_type.value
    if req.date is not None: update["date"] = req.date
    if req.description is not None: update["description"] = sanitize_string(req.description)
    if req.reminder_days is not None: update["reminder_days"] = req.reminder_days
    if req.completed is not None: update["completed"] = req.completed
    if req.all_day is not None: update["all_day"] = req.all_day
    if req.location is not None: update["location"] = sanitize_string(req.location)
    if update:
        update["updated_at"] = datetime.utcnow()
        await db.deadlines.update_one({"_id": make_id(deadline_id)}, {"$set": update})
    await audit("UPDATE_DEADLINE", user["id"], "deadline", deadline_id)
    return {"ok": True}

@app.delete("/api/deadlines/{deadline_id}")
async def delete_deadline(deadline_id: str, user=Depends(get_current_user)):
    dl = await db.deadlines.find_one({"_id": make_id(deadline_id)})
    if not dl: raise HTTPException(404, "Η προθεσμία δεν βρέθηκε")
    if dl.get("case_id"):
        await _check_case_access(dl["case_id"], user)
    await db.deadlines.delete_one({"_id": make_id(deadline_id)})
    await audit("DELETE_DEADLINE", user["id"], "deadline", deadline_id)
    return {"ok": True}

@app.get("/api/cases/{case_id}/deadlines")
async def case_deadlines(case_id: str, user=Depends(get_current_user)):
    await _check_case_access(case_id, user)
    dls = await db.deadlines.find({"case_id": case_id}).sort("date", 1).to_list(None)
    now = datetime.utcnow()
    result = []
    for d in dls:
        s = serialize(d)
        days_until = (d["date"] - now).days
        s["days_until"] = days_until
        s["is_urgent"] = days_until <= d.get("reminder_days", 3) and not d.get("completed")
        s["is_overdue"] = days_until < 0 and not d.get("completed")
        result.append(s)
    return result

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3: MULTI-PARTY CASES (Case Parties)
# ══════════════════════════════════════════════════════════════════════════════
class PartyRole(str, Enum):
    CLIENT = "client"           # Εντολέας
    OPPONENT = "opponent"       # Αντίδικος
    WITNESS = "witness"         # Μάρτυρας
    THIRD_PARTY = "third_party" # Τρίτος
    GUARANTOR = "guarantor"     # Εγγυητής
    EXPERT = "expert"           # Πραγματογνώμονας
    OTHER = "other"             # Λοιποί

class CasePartyRequest(BaseModel):
    name: str
    party_role: PartyRole
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    lawyer_name: Optional[str] = None  # Πληρεξούσιος δικηγόρος αντιδίκου
    notes: Optional[str] = None

@app.get("/api/cases/{case_id}/parties")
async def list_case_parties(case_id: str, user=Depends(get_current_user)):
    await _check_case_access(case_id, user)
    parties = await db.case_parties.find({"case_id": case_id}).sort("party_role", 1).to_list(None)
    return [serialize(p) for p in parties]

@app.post("/api/cases/{case_id}/parties", status_code=201)
async def add_case_party(case_id: str, req: CasePartyRequest, user=Depends(get_current_user)):
    await _check_case_access(case_id, user)
    if req.phone and not validate_phone(req.phone): raise HTTPException(400, "Μη έγκυρο τηλέφωνο")
    if req.tax_id and not validate_tax_id(req.tax_id): raise HTTPException(400, "Μη έγκυρο ΑΦΜ")
    doc = {
        "case_id": case_id,
        "name": sanitize_string(req.name),
        "party_role": req.party_role.value,
        "email": req.email.strip().lower() if req.email else None,
        "phone": req.phone.strip() if req.phone else None,
        "address": sanitize_string(req.address) if req.address else None,
        "tax_id": req.tax_id.strip() if req.tax_id else None,
        "lawyer_name": sanitize_string(req.lawyer_name) if req.lawyer_name else None,
        "notes": sanitize_string(req.notes) if req.notes else None,
        "created_by": user["id"],
        "created_at": datetime.utcnow()
    }
    r = await db.case_parties.insert_one(doc)
    await audit("ADD_CASE_PARTY", user["id"], "case_party", str(r.inserted_id), {"case_id": case_id})
    doc["_id"] = r.inserted_id
    return serialize(doc)

@app.put("/api/cases/{case_id}/parties/{party_id}")
async def update_case_party(case_id: str, party_id: str, req: CasePartyRequest, user=Depends(get_current_user)):
    await _check_case_access(case_id, user)
    if req.phone and not validate_phone(req.phone): raise HTTPException(400, "Μη έγκυρο τηλέφωνο")
    if req.tax_id and not validate_tax_id(req.tax_id): raise HTTPException(400, "Μη έγκυρο ΑΦΜ")
    data = {
        "name": sanitize_string(req.name), "party_role": req.party_role.value,
        "email": req.email.strip().lower() if req.email else None,
        "phone": req.phone.strip() if req.phone else None,
        "address": sanitize_string(req.address) if req.address else None,
        "tax_id": req.tax_id.strip() if req.tax_id else None,
        "lawyer_name": sanitize_string(req.lawyer_name) if req.lawyer_name else None,
        "notes": sanitize_string(req.notes) if req.notes else None,
        "updated_at": datetime.utcnow()
    }
    await db.case_parties.update_one({"_id": make_id(party_id), "case_id": case_id}, {"$set": data})
    await audit("UPDATE_CASE_PARTY", user["id"], "case_party", party_id)
    return {"ok": True}

@app.delete("/api/cases/{case_id}/parties/{party_id}")
async def delete_case_party(case_id: str, party_id: str, user=Depends(get_current_user)):
    await _check_case_access(case_id, user)
    await db.case_parties.delete_one({"_id": make_id(party_id), "case_id": case_id})
    await audit("DELETE_CASE_PARTY", user["id"], "case_party", party_id)
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 4: GREEK LAWYER INVOICING
# ══════════════════════════════════════════════════════════════════════════════
# ΦΠΑ 24%, Παρακράτηση Φόρου 15%, Γραμμάτιο Παράστασης
VAT_RATE = 0.24
WITHHOLDING_TAX_RATE = 0.15

# ── Κρατήσεις Γραμματίου Προείσπραξης (Δικηγορικός Σύλλογος Αθηνών) ──────────
# Πηγή: ΕΦΚΑ 2024, ΔΣΑ, ΕΑΝ
GRAMMATIO_EFKA_RATE     = 0.2695   # ΕΦΚΑ (κύρια σύνταξη + επικουρική + εφάπαξ)
GRAMMATIO_EAN_RATE      = 0.0167   # ΕΑΝ — Ειδικό Αποθεματικό Νομικής Αρωγής
GRAMMATIO_DSA_RATE      = 0.0200   # Ταμείο Δ.Σ. (ΔΣΑ/τοπικός σύλλογος)
# Σύνολο κρατήσεων ≈ 30.62% — ο δικηγόρος εισπράττει ~69.38% του γραμματίου


# ── Invoicing Context Endpoint ────────────────────────────────────────────────
@app.get("/api/cases/{case_id}/invoicing-context")
async def get_invoicing_context(case_id: str, user=Depends(get_current_user)):
    """Επιστρέφει όλα τα χρήσιμα στοιχεία για τιμολόγηση μιας υπόθεσης:
    - Στοιχεία υπόθεσης + πελάτη
    - Έξοδα υπόθεσης (ανά κατηγορία)
    - Υπάρχοντα τιμολόγια + σύνολα
    - Γραμμάτια (από expenses_log)
    """
    await _check_case_access(case_id, user)
    case = await db.cases.find_one({"_id": make_id(case_id)})
    if not case:
        raise HTTPException(404, "Η υπόθεση δεν βρέθηκε")

    client = None
    if case.get("client_id"):
        client = await db.clients.find_one({"_id": make_id(case["client_id"])})

    # Expenses for this case
    expenses_raw = await db.expenses_log.find({"case_id": case_id}).sort("date", -1).to_list(None)
    expenses = [serialize(e) for e in expenses_raw]

    # Grammatia from expenses (category = "grammatio")
    grammatia = [e for e in expenses if e.get("category") == "grammatio"]
    grammatio_total = sum(float(g.get("amount", 0)) for g in grammatia)

    # Expense totals by category
    exp_by_cat: dict = {}
    for e in expenses:
        cat = e.get("category", "other")
        exp_by_cat[cat] = exp_by_cat.get(cat, 0) + float(e.get("amount", 0))
    total_expenses = sum(float(e.get("amount", 0)) for e in expenses)

    # Existing invoices for this case
    invoices_raw = await db.invoices.find({"case_id": case_id}).sort("issue_date", -1).to_list(None)
    invoices = [serialize(i) for i in invoices_raw]
    already_invoiced = sum(float(i.get("total_payable", i.get("total", 0))) for i in invoices)
    already_paid     = sum(float(i.get("amount_paid", 0)) for i in invoices)

    return {
        "case": serialize(case),
        "client": serialize(client) if client else None,
        "expenses": expenses,
        "expenses_by_category": exp_by_cat,
        "total_expenses": round(total_expenses, 2),
        "grammatia": grammatia,
        "grammatio_total": round(grammatio_total, 2),
        "invoices": invoices,
        "already_invoiced": round(already_invoiced, 2),
        "already_paid": round(already_paid, 2),
        # Standard grammatio deduction rates (για πληροφορία)
        "grammatio_rates": {
            "efka": GRAMMATIO_EFKA_RATE,
            "ean": GRAMMATIO_EAN_RATE,
            "dsa": GRAMMATIO_DSA_RATE,
            "total_deductions": round(GRAMMATIO_EFKA_RATE + GRAMMATIO_EAN_RATE + GRAMMATIO_DSA_RATE, 4),
            "net_to_lawyer_pct": round(1 - GRAMMATIO_EFKA_RATE - GRAMMATIO_EAN_RATE - GRAMMATIO_DSA_RATE, 4),
        },
    }


class InvoiceRequest(BaseModel):
    case_id: str
    client_id: str
    items: List[dict]  # [{description, amount, is_grammatio, is_expense}]
    notes: Optional[str] = None
    issue_date: Optional[datetime] = None
    # Γραμμάτιο — αν συμπεριληφθεί ως ήδη καταβληθέν
    grammatio_gross: float = 0.0          # Αξία γραμματίου
    grammatio_efka: float = 0.0           # Κράτηση ΕΦΚΑ
    grammatio_ean: float = 0.0            # Κράτηση ΕΑΝ
    grammatio_dsa: float = 0.0            # Κράτηση Δ.Σ.
    grammatio_other_deductions: float = 0.0  # Λοιπές κρατήσεις

class FeeCalculatorRequest(BaseModel):
    net_amount: float
    include_vat: bool = True
    include_withholding: bool = True
    grammatio_amount: float = 0.0  # Γραμμάτιο Παράστασης

@app.post("/api/invoicing/calculate")
async def calculate_fees(req: FeeCalculatorRequest, user=Depends(get_current_user)):
    """Calculate Greek lawyer fee breakdown."""
    net = req.net_amount
    if net <= 0: raise HTTPException(400, "Το ποσό πρέπει να είναι θετικό")

    vat_amount = round(net * VAT_RATE, 2) if req.include_vat else 0
    withholding_amount = round(net * WITHHOLDING_TAX_RATE, 2) if req.include_withholding else 0
    grammatio = round(req.grammatio_amount, 2)
    gross_amount = round(net + vat_amount, 2)
    total_payable = round(gross_amount - withholding_amount + grammatio, 2)
    lawyer_receives = round(gross_amount - withholding_amount, 2)

    return {
        "net_amount": net,
        "vat_rate": VAT_RATE,
        "vat_amount": vat_amount,
        "gross_amount": gross_amount,
        "withholding_tax_rate": WITHHOLDING_TAX_RATE,
        "withholding_amount": withholding_amount,
        "grammatio_amount": grammatio,
        "total_payable_by_client": total_payable,
        "lawyer_receives": lawyer_receives,
        "breakdown": {
            "Καθαρή Αμοιβή": net,
            "ΦΠΑ 24%": vat_amount,
            "Μικτή Αμοιβή": gross_amount,
            "Παρακράτηση Φόρου 15%": -withholding_amount,
            "Γραμμάτιο Παράστασης": grammatio,
            "Ο Εντολέας Πληρώνει": total_payable,
            "Ο Δικηγόρος Εισπράττει": lawyer_receives
        }
    }

@app.post("/api/invoices", status_code=201)
async def create_invoice(req: InvoiceRequest, user=Depends(require_role(UserRole.ADMIN, UserRole.LAWYER))):
    await _check_case_access(req.case_id, user)
    cl = await db.clients.find_one({"_id": make_id(req.client_id)})
    if not cl: raise HTTPException(404, "Ο εντολέας δεν βρέθηκε")

    # ── Process line items ────────────────────────────────────────────────────
    total_net = 0.0        # αμοιβές (χωρίς ΦΠΑ)
    total_expenses = 0.0   # έξοδα (δεν φέρουν ΦΠΑ/παρακράτηση)
    processed_items = []

    for item in req.items:
        amt = float(item.get("amount", 0))
        if amt <= 0: raise HTTPException(400, "Μη έγκυρο ποσό γραμμής")
        is_expense  = item.get("is_expense", False)
        is_grammatio = item.get("is_grammatio", False)
        if is_expense or is_grammatio:
            total_expenses += amt
        else:
            total_net += amt
        processed_items.append({
            "description":   item.get("description", ""),
            "amount":        amt,
            "is_grammatio":  is_grammatio,
            "is_expense":    is_expense,
        })

    # ── Tax calculations on net fees only ─────────────────────────────────────
    vat        = round(total_net * VAT_RATE, 2)
    withholding = round(total_net * WITHHOLDING_TAX_RATE, 2)
    gross       = round(total_net + vat, 2)

    # ── Γραμμάτιο Προείσπραξης ─────────────────────────────────────────────────
    grammatio_gross = round(float(req.grammatio_gross), 2)
    if grammatio_gross > 0:
        # Κρατήσεις από γραμμάτιο
        efka   = round(float(req.grammatio_efka)  or grammatio_gross * GRAMMATIO_EFKA_RATE, 2)
        ean    = round(float(req.grammatio_ean)   or grammatio_gross * GRAMMATIO_EAN_RATE,  2)
        dsa    = round(float(req.grammatio_dsa)   or grammatio_gross * GRAMMATIO_DSA_RATE,  2)
        other  = round(float(req.grammatio_other_deductions), 2)
        total_deductions = efka + ean + dsa + other
        grammatio_net_to_lawyer = round(grammatio_gross - total_deductions, 2)
    else:
        efka = ean = dsa = other = total_deductions = grammatio_net_to_lawyer = 0.0

    grammatio_info = {
        "gross": grammatio_gross,
        "efka": efka, "ean": ean, "dsa": dsa,
        "other_deductions": other,
        "total_deductions": round(total_deductions, 2),
        "net_to_lawyer": grammatio_net_to_lawyer,
    } if grammatio_gross > 0 else None

    # ── Final totals ──────────────────────────────────────────────────────────
    # Ο εντολέας χρεώνεται: αμοιβή + ΦΠΑ + έξοδα - παρακράτηση
    # Το γραμμάτιο έχει ήδη καταβληθεί → αφαιρείται από το υπόλοιπο
    total_before_grammatio = round(gross - withholding + total_expenses, 2)
    total_payable           = round(total_before_grammatio - grammatio_gross, 2)
    lawyer_receives         = round(gross - withholding + total_expenses + grammatio_net_to_lawyer, 2)

    # ── Invoice number ─────────────────────────────────────────────────────────
    year = datetime.utcnow().year
    inv_counter = await db.counters.find_one_and_update(
        {"_id": "invoice_number"}, {"$set": {"year": year}, "$inc": {"seq": 1}},
        upsert=True, return_document=True)
    if inv_counter.get("year") != year:
        inv_counter = await db.counters.find_one_and_update(
            {"_id": "invoice_number"}, {"$set": {"year": year, "seq": 1}}, return_document=True)
    inv_number = f"ΤΔΑ-{year}-{str(inv_counter['seq']).zfill(4)}"

    invoice = {
        "invoice_number":       inv_number,
        "case_id":              req.case_id,
        "client_id":            req.client_id,
        "client_name":          cl.get("full_name", cl.get("name", "")),
        "client_afm":           cl.get("afm", cl.get("tax_id", "")),
        "client_address":       cl.get("address", ""),
        "client_email":         cl.get("email", ""),
        "items":                processed_items,
        # Αμοιβές
        "net_amount":           round(total_net, 2),
        "vat_rate":             VAT_RATE,
        "vat_amount":           vat,
        "gross_amount":         gross,
        "withholding_rate":     WITHHOLDING_TAX_RATE,
        "withholding_amount":   withholding,
        # Έξοδα
        "expenses_amount":      round(total_expenses, 2),
        # Γραμμάτιο
        "grammatio":            grammatio_info,
        "grammatio_gross":      grammatio_gross,
        # Σύνολα
        "total_before_grammatio": total_before_grammatio,
        "total_payable":        max(total_payable, 0),  # δεν πηγαίνει αρνητικό
        "lawyer_receives":      round(lawyer_receives, 2),
        "notes":                sanitize_string(req.notes) if req.notes else None,
        "issue_date":           req.issue_date or datetime.utcnow(),
        "created_by":           user["id"],
        "created_by_name":      user.get("name", ""),
        "created_at":           datetime.utcnow(),
        "status":               "issued",
        "payment_status":       "pending",
        "amount_paid":          0.0,
    }
    r = await db.invoices.insert_one(invoice)
    await audit("CREATE_INVOICE", user["id"], "invoice", str(r.inserted_id), {"invoice_number": inv_number})
    invoice["_id"] = r.inserted_id
    return serialize(invoice)

@app.get("/api/invoices")
async def list_invoices(user=Depends(get_current_user), case_id: Optional[str] = None):
    if user["role"] == UserRole.SECRETARY.value:
        raise HTTPException(403, "Δεν έχετε πρόσβαση στα τιμολόγια")
    query = {}
    if case_id: query["case_id"] = case_id
    if user["role"] == UserRole.LAWYER.value:
        cids = await db.cases.distinct("_id", {"assigned_lawyer_id": user["id"]})
        query["case_id"] = {"$in": [str(c) for c in cids]}
    invoices = await db.invoices.find(query).sort("created_at", -1).to_list(None)
    return [serialize(i) for i in invoices]

@app.get("/api/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, user=Depends(get_current_user)):
    if user["role"] == UserRole.SECRETARY.value:
        raise HTTPException(403, "Δεν έχετε πρόσβαση")
    inv = await db.invoices.find_one({"_id": make_id(invoice_id)})
    if not inv: raise HTTPException(404, "Το τιμολόγιο δεν βρέθηκε")
    return serialize(inv)

@app.get("/api/cases/{case_id}/invoices")
async def case_invoices(case_id: str, user=Depends(get_current_user)):
    if user["role"] == UserRole.SECRETARY.value:
        raise HTTPException(403, "Δεν έχετε πρόσβαση")
    await _check_case_access(case_id, user)
    invs = await db.invoices.find({"case_id": case_id}).sort("created_at", -1).to_list(None)
    return [serialize(i) for i in invs]

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 5: DOCUMENT TEMPLATES
# ══════════════════════════════════════════════════════════════════════════════
# Built-in Greek legal document templates with auto-fill
TEMPLATES = {
    "exousiodotisi": {
        "id": "exousiodotisi",
        "name": "Εξουσιοδότηση",
        "description": "Γενική εξουσιοδότηση προς δικηγόρο",
        "category": "general",
        "fields": ["client_name", "client_tax_id", "client_address", "lawyer_name", "case_title", "court", "date"],
        "template": """ΕΞΟΥΣΙΟΔΟΤΗΣΗ

Ο/Η κάτωθι υπογράφων/ουσα {{client_name}}, κάτοικος {{client_address}}, με ΑΦΜ {{client_tax_id}},

ΕΞΟΥΣΙΟΔΟΤΩ

τον/την Δικηγόρο {{lawyer_name}} όπως με εκπροσωπήσει ενώπιον {{court}} στην υπόθεση «{{case_title}}» και γενικά να προβεί σε κάθε νόμιμη ενέργεια για την προάσπιση των συμφερόντων μου.

{{client_address}}, {{date}}

Ο/Η Εξουσιοδοτών/ούσα



______________________________
{{client_name}}"""
    },
    "plirexousio": {
        "id": "plirexousio",
        "name": "Πληρεξούσιο",
        "description": "Ειδικό πληρεξούσιο για παράσταση σε δίκη",
        "category": "court",
        "fields": ["client_name", "client_tax_id", "client_address", "lawyer_name", "lawyer_am", "case_title", "court", "date", "case_number"],
        "template": """ΕΙΔΙΚΟ ΠΛΗΡΕΞΟΥΣΙΟ

Ο/Η κάτωθι υπογράφων/ουσα {{client_name}}, κάτοικος {{client_address}}, με ΑΦΜ {{client_tax_id}},

ΔΙΟΡΙΖΩ

ειδικό/ή πληρεξούσιο/α Δικηγόρο μου τον/την {{lawyer_name}} (Α.Μ. {{lawyer_am}}) και του/της δίδω την εντολή και πληρεξουσιότητα:

Να παρασταθεί για λογαριασμό μου ενώπιον {{court}} κατά τη συζήτηση της υπόθεσης «{{case_title}}» (Αρ. Υπόθεσης: {{case_number}}) και να ασκήσει κάθε νόμιμο ένδικο μέσο ή βοήθημα.

Να υπογράψει κάθε σχετικό έγγραφο και γενικά να ενεργήσει καθετί που κρίνει σκόπιμο για την προάσπιση των συμφερόντων μου.

{{client_address}}, {{date}}

Ο/Η Εντολέας



______________________________
{{client_name}}"""
    },
    "minusi": {
        "id": "minusi",
        "name": "Μήνυση",
        "description": "Μήνυση / Έγκληση",
        "category": "criminal",
        "fields": ["client_name", "client_tax_id", "client_address", "opponent_name", "opponent_address", "description", "date", "court"],
        "template": """ΜΗΝΥΣΗ – ΕΓΚΛΗΣΗ

ΕΝΩΠΙΟΝ ΤΟΥ κ. ΕΙΣΑΓΓΕΛΕΑ ΠΛΗΜΜΕΛΕΙΟΔΙΚΩΝ {{court}}

ΤΟΥ/ΤΗΣ {{client_name}}, κατοίκου {{client_address}}, με ΑΦΜ {{client_tax_id}}

ΚΑΤΑ

ΤΟΥ/ΤΗΣ {{opponent_name}}, κατοίκου {{opponent_address}}

* * *

Κύριε Εισαγγελέα,

{{description}}

Επειδή τα ανωτέρω αποτελούν αξιόποινες πράξεις, για τους λόγους αυτούς και με τη ρητή επιφύλαξη κάθε νομίμου δικαιώματός μου,

ΖΗΤΩ

Να ασκηθεί ποινική δίωξη κατά του/της ανωτέρω μηνυομένου/ης για τις αξιόποινες πράξεις που αναφέρονται στο ιστορικό.

Να γίνουν δεκτές οι σχετικές αποδείξεις.

{{client_address}}, {{date}}

Ο/Η Μηνυτής/τρια



______________________________
{{client_name}}"""
    },
    "aitisi_anastolis": {
        "id": "aitisi_anastolis",
        "name": "Αίτηση Αναστολής Εκτέλεσης",
        "description": "Αίτηση αναστολής εκτέλεσης απόφασης",
        "category": "court",
        "fields": ["client_name", "client_tax_id", "client_address", "lawyer_name", "court", "case_title", "case_number", "decision_number", "description", "date"],
        "template": """ΕΝΩΠΙΟΝ ΤΟΥ {{court}}

ΑΙΤΗΣΗ ΑΝΑΣΤΟΛΗΣ ΕΚΤΕΛΕΣΗΣ
(Άρθρο 912 ΚΠολΔ)

ΤΟΥ/ΤΗΣ {{client_name}}, κατοίκου {{client_address}}, με ΑΦΜ {{client_tax_id}}, ο/η οποίος/α παρίσταται δια του πληρεξουσίου Δικηγόρου {{lawyer_name}}

* * *

Με την υπ' αριθ. {{decision_number}} απόφαση, στο πλαίσιο της υπόθεσης «{{case_title}}» (Αρ. {{case_number}}):

{{description}}

ΓΙΑ ΤΟΥΣ ΛΟΓΟΥΣ ΑΥΤΟΥΣ

ΖΗΤΩ

Να γίνει δεκτή η παρούσα αίτηση.
Να ανασταλεί η εκτέλεση της ανωτέρω απόφασης.

{{client_address}}, {{date}}

Ο Πληρεξούσιος Δικηγόρος



______________________________
{{lawyer_name}}"""
    }
}

@app.get("/api/templates")
async def list_templates(user=Depends(get_current_user)):
    """List all available document templates."""
    return [{"id": t["id"], "name": t["name"], "description": t["description"],
             "category": t["category"], "fields": t["fields"]} for t in TEMPLATES.values()]

@app.get("/api/templates/{template_id}")
async def get_template(template_id: str, user=Depends(get_current_user)):
    if template_id not in TEMPLATES: raise HTTPException(404, "Πρότυπο δεν βρέθηκε")
    return TEMPLATES[template_id]

@app.post("/api/templates/{template_id}/fill")
async def fill_template(template_id: str, case_id: Optional[str] = None, user=Depends(get_current_user)):
    """Auto-fill template with case/client data. Returns pre-filled fields."""
    if template_id not in TEMPLATES: raise HTTPException(404, "Πρότυπο δεν βρέθηκε")
    tmpl = TEMPLATES[template_id]
    data = {"date": datetime.utcnow().strftime("%d/%m/%Y"), "lawyer_name": user.get("name", "")}

    if case_id:
        case = await db.cases.find_one({"_id": make_id(case_id)})
        if case:
            data["case_title"] = case.get("title", "")
            data["case_number"] = case.get("case_number", "")
            data["court"] = case.get("court", "")
            # Get client
            if case.get("client_id"):
                cl = await db.clients.find_one({"_id": make_id(case["client_id"])})
                if cl:
                    data["client_name"] = cl.get("name", "")
                    data["client_tax_id"] = cl.get("tax_id", "")
                    data["client_address"] = cl.get("address", "")
            # Get lawyer
            if case.get("assigned_lawyer_id"):
                lawyer = await db.users.find_one({"_id": make_id(case["assigned_lawyer_id"])})
                if lawyer: data["lawyer_name"] = lawyer.get("name", "")
            # Get opponent from parties
            parties = await db.case_parties.find({"case_id": case_id, "party_role": "opponent"}).to_list(1)
            if parties:
                data["opponent_name"] = parties[0].get("name", "")
                data["opponent_address"] = parties[0].get("address", "")

    return {"template": tmpl, "auto_filled": data}

@app.post("/api/templates/{template_id}/generate")
async def generate_document(template_id: str, fields: dict, user=Depends(get_current_user)):
    """Generate document from template with provided field values."""
    if template_id not in TEMPLATES: raise HTTPException(404, "Πρότυπο δεν βρέθηκε")
    tmpl = TEMPLATES[template_id]
    text = tmpl["template"]
    for key, value in fields.items():
        text = text.replace("{{" + key + "}}", str(value or "________"))
    # Replace any remaining unfilled placeholders
    import re as regex_module
    text = regex_module.sub(r"\{\{[^}]+\}\}", "________", text)
    return {"document_text": text, "template_name": tmpl["name"]}

# ══════════════════════════════════════════════════════════════════════════════
# SETTINGS (Office info, team, notifications)
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/settings")
async def get_settings(user=Depends(get_current_user)):
    s = await db.settings.find_one({"_id": "office"})
    return serialize(s) if s else {"name":"","address":"","phone":"","email":"","afm":"","website":""}

@app.put("/api/settings")
async def update_settings(data: dict, user=Depends(require_role(UserRole.ADMIN))):
    await db.settings.update_one({"_id": "office"}, {"$set": data}, upsert=True)
    await audit("UPDATE_SETTINGS", user["id"], "settings")
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# SEPARATE EXPENSES (with categories)
# ══════════════════════════════════════════════════════════════════════════════
class ExpenseRequest(BaseModel):
    case_id: str
    description: str
    amount: float
    category: str = "other"
    date: Optional[datetime] = None
    notes: Optional[str] = None
    receipt_ref: Optional[str] = None   # αρ. απόδειξης / παραστατικού

@app.get("/api/expenses")
async def list_expenses(
    user=Depends(get_current_user),
    case_id: Optional[str] = None,
    client_id: Optional[str] = None,
    lawyer_id: Optional[str] = None,
):
    q: dict = {}
    if case_id:   q["case_id"]   = case_id
    if client_id: q["client_id"] = client_id
    if lawyer_id: q["created_by"] = lawyer_id
    # Lawyers see only their own cases
    if user["role"] == UserRole.LAWYER.value and not case_id:
        cids = [str(c) for c in await db.cases.distinct("_id", {"assigned_lawyer_id": user["id"]})]
        q["case_id"] = {"$in": cids}

    entries = await db.expenses_log.find(q).sort("date", -1).to_list(None)
    serialized = [serialize(e) for e in entries]

    # ── Aggregated summaries ──────────────────────────────────────────────────
    total = sum(e.get("amount", 0) for e in entries)

    # Per-case totals
    by_case: dict = {}
    for e in entries:
        k = e.get("case_id", "")
        if k not in by_case:
            by_case[k] = {"case_id": k, "case_title": e.get("case_title", ""), "case_number": e.get("case_number", ""), "client_name": e.get("client_name", ""), "total": 0, "count": 0}
        by_case[k]["total"] += e.get("amount", 0)
        by_case[k]["count"] += 1

    # Per-lawyer totals
    by_lawyer: dict = {}
    for e in entries:
        k = e.get("created_by", "")
        name = e.get("created_by_name", "—")
        if k not in by_lawyer:
            by_lawyer[k] = {"lawyer_id": k, "lawyer_name": name, "total": 0, "count": 0}
        by_lawyer[k]["total"] += e.get("amount", 0)
        by_lawyer[k]["count"] += 1

    # Per-category totals
    by_category: dict = {}
    for e in entries:
        k = e.get("category", "other")
        if k not in by_category:
            by_category[k] = {"category": k, "total": 0, "count": 0}
        by_category[k]["total"] += e.get("amount", 0)
        by_category[k]["count"] += 1

    # This-month total
    now = datetime.utcnow()
    month_total = sum(
        e.get("amount", 0) for e in entries
        if isinstance(e.get("date"), datetime)
        and e["date"].year == now.year and e["date"].month == now.month
    )

    return {
        "entries": serialized,
        "total": round(total, 2),
        "month_total": round(month_total, 2),
        "count": len(entries),
        "by_case":     sorted(by_case.values(),     key=lambda x: x["total"], reverse=True),
        "by_lawyer":   sorted(by_lawyer.values(),   key=lambda x: x["total"], reverse=True),
        "by_category": sorted(by_category.values(), key=lambda x: x["total"], reverse=True),
    }

@app.post("/api/expenses", status_code=201)
async def create_expense(req: ExpenseRequest, user=Depends(get_current_user)):
    await _check_case_access(req.case_id, user)
    if req.amount <= 0:
        raise HTTPException(400, "Το ποσό πρέπει να είναι θετικό")
    case = await db.cases.find_one({"_id": make_id(req.case_id)})
    client_id = case.get("client_id", "") if case else ""
    client_name = await get_client_name(client_id) if client_id else ""
    doc = {
        "case_id":          req.case_id,
        "case_title":       case.get("title", "") if case else "",
        "case_number":      case.get("case_number", "") if case else "",
        "client_id":        client_id,
        "client_name":      client_name,
        "description":      sanitize_string(req.description),
        "amount":           req.amount,
        "category":         req.category,
        "date":             req.date or datetime.utcnow(),
        "notes":            sanitize_string(req.notes) if req.notes else None,
        "receipt_ref":      req.receipt_ref,
        "created_by":       user["id"],
        "created_by_name":  user.get("name", ""),
        "created_at":       datetime.utcnow(),
    }
    r = await db.expenses_log.insert_one(doc)
    await audit("CREATE_EXPENSE", user["id"], "expense", str(r.inserted_id))
    doc["_id"] = r.inserted_id
    return serialize(doc)

@app.delete("/api/expenses/{expense_id}")
async def delete_expense(expense_id: str, user=Depends(require_role(UserRole.ADMIN))):
    await db.expenses_log.delete_one({"_id": make_id(expense_id)})
    await audit("DELETE_EXPENSE", user["id"], "expense", expense_id)
    return {"ok": True}

@app.get("/api/health")
async def health():
    try: await client.admin.command("ping"); dbs = "connected"
    except: dbs = "disconnected"
    return {"status": "ok" if dbs == "connected" else "degraded", "database": dbs, "timestamp": datetime.utcnow().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)


# ═══════════════════════════════════════════════════════════════════════════════
#  LEGAL OS — OPERATING MODEL EXTENSIONS
#  Leads/Pipeline · Workflow · Billing Engine · KPIs · Checklists
# ═══════════════════════════════════════════════════════════════════════════════

# ── Enums ─────────────────────────────────────────────────────────────────────

class LeadStage(str, Enum):
    NEW          = "new_lead"
    CONTACTED    = "contacted"
    BOOKED       = "consultation_booked"
    DONE         = "consultation_done"
    PROPOSAL     = "proposal_sent"
    RETAINER     = "retainer_paid"
    OPENED       = "matter_opened"
    LOST         = "lost"
    FOLLOW_UP    = "follow_up_later"

class LeadSource(str, Enum):
    REFERRAL = "referral"
    LOGISTIS = "logistis"
    GOOGLE   = "google"
    SOCIAL   = "social"
    WALK_IN  = "walk_in"
    OTHER    = "other"

class ProfitClass(str, Enum):
    A = "A"
    B = "B"
    C = "C"

class WorkflowTemplate(str, Enum):
    EXODIKO  = "exodiko"
    AGOGI    = "agogi"
    RETAINER = "retainer"
    ERGATIKO = "ergatiko"
    DIATAGI  = "diatagi"
    SYNTHESI = "synthesi"
    GENERAL  = "general"

# ── Workflow stage lists per template ─────────────────────────────────────────

WORKFLOW_STAGES: dict = {
    "exodiko":  ["Intake","Legal review","Drafting","Client approval","Dispatch","Follow-up","Closing"],
    "agogi":    ["Intake & Viability","Pre-filing","Filing","Pending hearing","Hearing","Post-hearing","Closing"],
    "retainer": ["Onboarding","Monthly open","Ad-hoc intake","Active handling","Monthly review","Monthly close","Annual review"],
    "ergatiko": ["Intake","Assessment","Pre-action","Filing","Hearing","Resolution","Closing"],
    "diatagi":  ["Intake","Documentation","Filing","Service","Monitoring","Closing"],
    "synthesi": ["Intake","Drafting","Review","Client approval","Execution","Closing"],
    "general":  ["Intake","In review","Drafting","Filed / sent","Pending response","Active handling","Closing"],
}

WORKFLOW_CHECKLISTS: dict = {
    "exodiko": [
        "Άνοιγμα client record","Conflict check","Λήψη εγγράφων","Ανάθεση owner","Προκαταβολή",
        "Νομική αξιολόγηση","Drafting εξωδίκου","Εσωτερικός έλεγχος","Έγκριση πελάτη",
        "Αποστολή / Επίδοση","Ανέβασμα αποδεικτικού","Follow-up D+3","Follow-up D+7","Follow-up D+15","Κλείσιμο matter",
    ],
    "agogi": [
        "Συνέντευξη πελάτη","Conflict check","Συλλογή εγγράφων","Νομική αξιολόγηση βιωσιμότητας",
        "Κοστολόγηση","Σύμβαση εντολής","Προκαταβολή","Συλλογή αποδεικτικών",
        "Νομική έρευνα","Drafting αγωγής","Εσωτερικός έλεγχος","Τελική έγκριση",
        "Κατάθεση αγωγής","Κοινοποίηση","Καταγραφή δικασίμου","Παράσταση","Ενημέρωση πελάτη","Κλείσιμο / Εκτέλεση",
    ],
    "retainer": [
        "Σύναψη σύμβασης retainer","Ορισμός included / extra scope","KYC πελάτη","Billing setup",
        "Άνοιγμα monthly cycle","Καταγραφή αιτημάτων","Classify: included / extra",
        "Monthly summary","Monthly invoice","Upsell check",
    ],
    "ergatiko": [
        "Συνέντευξη πελάτη","Conflict check","Σύμβαση εργασίας","Αποδεικτικά απολύσεως",
        "Νομική αξιολόγηση","Κοστολόγηση","Drafting","Filing","Παράσταση","Κλείσιμο",
    ],
    "diatagi": [
        "Λήψη εγγράφων απαίτησης","Conflict check","Προκαταβολή",
        "Drafting διαταγής","Κατάθεση","Επίδοση","Παρακολούθηση","Κλείσιμο",
    ],
    "synthesi": [
        "Intake","Conflict check","Λήψη σχεδίου / briefing","Νομική ανάλυση",
        "Drafting","Εσωτερικός έλεγχος","Έγκριση πελάτη","Υπογραφή","Κλείσιμο",
    ],
    "general": [
        "Intake","Conflict check","Ανάθεση owner","Προκαταβολή","Νομική εργασία","Follow-up","Κλείσιμο",
    ],
}

BILLING_TRIGGERS: dict = {
    "exodiko":  {"Intake": "Consultation fee", "Drafting": "Drafting fee", "Dispatch": "Dispatch fee", "Closing": "Final balance"},
    "agogi":    {"Intake & Viability": "Assessment fee + Advance", "Pre-filing": "Drafting fee", "Filing": "Filing fee", "Pending hearing": "Pre-hearing milestone", "Hearing": "Hearing fee", "Closing": "Final balance"},
    "retainer": {"Onboarding": "Πρώτο μηνιαίο invoice", "Monthly close": "Monthly invoice", "Annual review": "Renewal"},
    "ergatiko": {"Intake": "Consultation fee", "Filing": "Filing fee", "Hearing": "Hearing fee", "Closing": "Final balance"},
    "diatagi":  {"Intake": "Fixed drafting + Advance", "Filing": "Filing fee", "Service": "Service fee"},
    "synthesi": {"Intake": "Consultation fee", "Execution": "Fixed fee"},
    "general":  {"Intake": "Advance", "Closing": "Final balance"},
}

# ── Lead Models ───────────────────────────────────────────────────────────────

class LeadRequest(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    source: str = "other"
    referral_partner: Optional[str] = None
    case_type: Optional[str] = None
    stage: str = "new_lead"
    urgency: str = "normal"
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    next_action: Optional[str] = None
    next_action_date: Optional[datetime] = None
    consultation_fee: Optional[float] = None

# ── Lead Endpoints ────────────────────────────────────────────────────────────

@app.get("/api/leads")
async def list_leads(stage: Optional[str] = None, user=Depends(get_current_user)):
    q = {} if not stage else {"stage": stage}
    leads = await db.leads.find(q).sort("created_at", -1).to_list(None)
    return [serialize(l) for l in leads]

@app.get("/api/leads/pipeline")
async def leads_pipeline(user=Depends(get_current_user)):
    leads = await db.leads.find({}).to_list(None)
    stages = [s.value for s in LeadStage]
    pipeline = {s: [] for s in stages}
    for lead in leads:
        s = lead.get("stage", "new_lead")
        if s in pipeline:
            pipeline[s].append(serialize(lead))
    return [{"stage": s, "count": len(pipeline[s]), "leads": pipeline[s]} for s in stages]

@app.get("/api/leads/{lead_id}")
async def get_lead(lead_id: str, user=Depends(get_current_user)):
    lead = await db.leads.find_one({"_id": make_id(lead_id)})
    if not lead: raise HTTPException(404)
    return serialize(lead)

@app.post("/api/leads", status_code=201)
async def create_lead(req: LeadRequest, user=Depends(get_current_user)):
    doc = req.dict()
    doc["created_at"] = datetime.utcnow()
    doc["created_by"] = user["id"]
    doc["updated_at"] = datetime.utcnow()
    result = await db.leads.insert_one(doc)
    await log_action(user["id"], "lead_created", str(result.inserted_id), {"name": req.name})
    return serialize(await db.leads.find_one({"_id": result.inserted_id}))

@app.put("/api/leads/{lead_id}")
async def update_lead(lead_id: str, req: LeadRequest, user=Depends(get_current_user)):
    doc = req.dict(); doc["updated_at"] = datetime.utcnow()
    result = await db.leads.update_one({"_id": make_id(lead_id)}, {"$set": doc})
    if result.matched_count == 0: raise HTTPException(404)
    return serialize(await db.leads.find_one({"_id": make_id(lead_id)}))

@app.patch("/api/leads/{lead_id}/stage")
async def move_lead_stage(lead_id: str, stage: str, user=Depends(get_current_user)):
    await db.leads.update_one({"_id": make_id(lead_id)}, {"$set": {"stage": stage, "updated_at": datetime.utcnow()}})
    await log_action(user["id"], "lead_stage_changed", lead_id, {"stage": stage})
    return serialize(await db.leads.find_one({"_id": make_id(lead_id)}))

@app.delete("/api/leads/{lead_id}")
async def delete_lead(lead_id: str, user=Depends(get_current_user)):
    if user["role"] not in [UserRole.ADMIN.value, UserRole.LAWYER.value]: raise HTTPException(403)
    await db.leads.delete_one({"_id": make_id(lead_id)})
    return {"ok": True}

# ── Workflow Extensions for Cases ─────────────────────────────────────────────

class WorkflowUpdateRequest(BaseModel):
    profit_class: Optional[str] = None
    workflow_template: Optional[str] = None
    matter_stage: Optional[str] = None
    last_client_update: Optional[datetime] = None
    next_billing_trigger: Optional[str] = None
    estimated_value: Optional[float] = None
    complexity_score: Optional[int] = None
    success_likelihood: Optional[str] = None
    opposing_party: Optional[str] = None
    counterparty_lawyer: Optional[str] = None
    claim_value: Optional[float] = None
    missing_documents: Optional[str] = None
    client_source: Optional[str] = None
    risk_level: Optional[str] = None

@app.get("/api/workflow/templates")
async def get_workflow_templates(user=Depends(get_current_user)):
    return {"stages": WORKFLOW_STAGES, "billing_triggers": BILLING_TRIGGERS}

@app.patch("/api/cases/{case_id}/workflow")
async def update_case_workflow(case_id: str, req: WorkflowUpdateRequest, user=Depends(get_current_user)):
    case = await db.cases.find_one({"_id": make_id(case_id)})
    if not case: raise HTTPException(404)
    update = {k: v for k, v in req.dict().items() if v is not None}
    update["updated_at"] = datetime.utcnow()
    await db.cases.update_one({"_id": make_id(case_id)}, {"$set": update})
    await log_action(user["id"], "workflow_updated", case_id, update)
    return serialize(await db.cases.find_one({"_id": make_id(case_id)}))

@app.get("/api/cases/workflow/stuck")
async def get_stuck_workflow_cases(days: int = 14, user=Depends(get_current_user)):
    cutoff = datetime.utcnow() - timedelta(days=days)
    q = {"status": {"$in": ["active","pending"]},
         "$or": [{"updated_at": {"$lt": cutoff}}, {"updated_at": {"$exists": False}, "created_at": {"$lt": cutoff}}]}
    cases = await db.cases.find(q).to_list(None)
    return [serialize(c) for c in cases]

@app.get("/api/cases/workflow/no-next-action")
async def cases_without_next_action(user=Depends(get_current_user)):
    q = {"status": {"$in": ["active","pending"]},
         "$or": [{"next_action": None},{"next_action": ""},{"next_action": {"$exists": False}}]}
    cases = await db.cases.find(q).to_list(None)
    return [serialize(c) for c in cases]

# ── Checklists ────────────────────────────────────────────────────────────────

@app.get("/api/checklists/templates")
async def get_checklist_templates(user=Depends(get_current_user)):
    return WORKFLOW_CHECKLISTS

@app.get("/api/cases/{case_id}/checklist")
async def get_case_checklist(case_id: str, user=Depends(get_current_user)):
    checklist = await db.checklists.find_one({"case_id": case_id})
    if not checklist:
        case = await db.cases.find_one({"_id": make_id(case_id)})
        if not case: raise HTTPException(404)
        template = case.get("workflow_template", "general")
        items = WORKFLOW_CHECKLISTS.get(template, WORKFLOW_CHECKLISTS["general"])
        doc = {
            "case_id": case_id,
            "template": template,
            "items": [{"text": i, "done": False, "done_at": None, "done_by": None} for i in items],
            "created_at": datetime.utcnow(),
        }
        res = await db.checklists.insert_one(doc)
        checklist = await db.checklists.find_one({"_id": res.inserted_id})
    return serialize(checklist)

@app.patch("/api/cases/{case_id}/checklist/{item_index}")
async def toggle_checklist_item(case_id: str, item_index: int, done: bool, user=Depends(get_current_user)):
    checklist = await db.checklists.find_one({"case_id": case_id})
    if not checklist: raise HTTPException(404)
    items = checklist.get("items", [])
    if item_index >= len(items): raise HTTPException(400, "Invalid index")
    items[item_index]["done"] = done
    items[item_index]["done_at"] = datetime.utcnow().isoformat() if done else None
    items[item_index]["done_by"] = user.get("name", "") if done else None
    await db.checklists.update_one({"case_id": case_id}, {"$set": {"items": items}})
    return {"ok": True, "items": items}

@app.post("/api/cases/{case_id}/checklist/reset")
async def reset_checklist(case_id: str, template: str = "general", user=Depends(get_current_user)):
    items = WORKFLOW_CHECKLISTS.get(template, WORKFLOW_CHECKLISTS["general"])
    doc = {"case_id": case_id, "template": template,
           "items": [{"text": i, "done": False, "done_at": None, "done_by": None} for i in items],
           "updated_at": datetime.utcnow()}
    await db.checklists.update_one({"case_id": case_id}, {"$set": doc}, upsert=True)
    return serialize(await db.checklists.find_one({"case_id": case_id}))

# ── Billing Reminders ─────────────────────────────────────────────────────────

class BillingReminderRequest(BaseModel):
    invoice_id: str
    case_id: Optional[str] = None
    client_name: str
    amount: float
    due_date: datetime
    status: str = "sent"
    notes: Optional[str] = None

@app.get("/api/billing/reminders")
async def list_reminders(status: Optional[str] = None, user=Depends(get_current_user)):
    q = {} if not status else {"status": status}
    reminders = await db.billing_reminders.find(q).sort("due_date", 1).to_list(None)
    now = datetime.utcnow()
    result = []
    for r in reminders:
        s = serialize(r)
        due = r.get("due_date")
        if due:
            s["days_overdue"] = max(0, (now - due).days) if due < now else 0
        result.append(s)
    return result

@app.post("/api/billing/reminders", status_code=201)
async def create_reminder(req: BillingReminderRequest, user=Depends(get_current_user)):
    doc = req.dict(); doc["created_at"] = datetime.utcnow(); doc["last_action_at"] = datetime.utcnow()
    res = await db.billing_reminders.insert_one(doc)
    return serialize(await db.billing_reminders.find_one({"_id": res.inserted_id}))

@app.patch("/api/billing/reminders/{reminder_id}/advance")
async def advance_reminder(reminder_id: str, notes: Optional[str] = None, user=Depends(get_current_user)):
    CYCLE = ["sent","reminder_1","reminder_2","escalated","collection","paid"]
    reminder = await db.billing_reminders.find_one({"_id": make_id(reminder_id)})
    if not reminder: raise HTTPException(404)
    current = reminder.get("status","sent")
    idx = CYCLE.index(current) if current in CYCLE else 0
    next_status = CYCLE[min(idx + 1, len(CYCLE) - 1)]
    update = {"status": next_status, "last_action_at": datetime.utcnow()}
    if notes: update["notes"] = notes
    await db.billing_reminders.update_one({"_id": make_id(reminder_id)}, {"$set": update})
    return serialize(await db.billing_reminders.find_one({"_id": make_id(reminder_id)}))

@app.patch("/api/billing/reminders/{reminder_id}/status")
async def set_reminder_status(reminder_id: str, status: str, user=Depends(get_current_user)):
    await db.billing_reminders.update_one({"_id": make_id(reminder_id)}, {"$set": {"status": status, "last_action_at": datetime.utcnow()}})
    return serialize(await db.billing_reminders.find_one({"_id": make_id(reminder_id)}))

@app.get("/api/billing/collection-rate")
async def get_collection_rate(user=Depends(get_current_user)):
    invoices = await db.invoices.find({}).to_list(None)
    total = sum(i.get("amount", 0) for i in invoices)
    paid = sum(i.get("amount", 0) for i in invoices if i.get("payment_status") == "paid")
    partial = sum(i.get("amount_paid", 0) for i in invoices if i.get("payment_status") == "partial")
    collected = paid + partial
    return {
        "total_billed": total, "total_collected": collected,
        "collection_rate": round(collected / total * 100, 1) if total else 0,
        "invoice_count": len(invoices),
        "paid_count": sum(1 for i in invoices if i.get("payment_status") == "paid"),
    }

# ── KPI Summary ───────────────────────────────────────────────────────────────

@app.get("/api/kpi/summary")
async def kpi_summary(user=Depends(get_current_user)):
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_start  = now - timedelta(days=now.weekday())
    cutoff_14   = now - timedelta(days=14)
    cutoff_72h  = now - timedelta(hours=72)

    # Leads
    total_leads    = await db.leads.count_documents({})
    new_leads      = await db.leads.count_documents({"stage": "new_lead"})
    week_leads     = await db.leads.count_documents({"created_at": {"$gte": week_start}})
    converted      = await db.leads.count_documents({"stage": "matter_opened"})
    stale_leads    = await db.leads.count_documents({"stage": "new_lead", "created_at": {"$lt": cutoff_72h}})
    conv_rate      = round(converted / total_leads * 100, 1) if total_leads else 0

    # Cases
    active_cases   = await db.cases.count_documents({"status": {"$in": ["active","pending"]}})
    stuck_cases    = await db.cases.count_documents({
        "status": {"$in": ["active","pending"]},
        "$or": [{"updated_at": {"$lt": cutoff_14}}, {"updated_at": {"$exists": False}, "created_at": {"$lt": cutoff_14}}]
    })
    no_next        = await db.cases.count_documents({
        "status": {"$in": ["active","pending"]},
        "$or": [{"next_action": None},{"next_action": ""},{"next_action": {"$exists": False}}]
    })

    # Financials
    invoices       = await db.invoices.find({}).to_list(None)
    total_billed   = sum(i.get("amount",0) for i in invoices)
    total_paid_all = sum(i.get("amount",0) for i in invoices if i.get("payment_status")=="paid")
    month_billed   = sum(i.get("amount",0) for i in invoices if i.get("created_at", datetime.min) >= month_start)
    overdue_amount = sum(i.get("amount",0) for i in invoices if i.get("payment_status") in ["pending","partial"] and i.get("due_date") and i["due_date"] < now)
    overdue_count  = sum(1 for i in invoices if i.get("payment_status") in ["pending","partial"] and i.get("due_date") and i["due_date"] < now)
    coll_rate      = round(total_paid_all / total_billed * 100, 1) if total_billed else 0

    # Revenue by case type
    cases_list = await db.cases.find({}).to_list(None)
    case_map   = {str(c["_id"]): c for c in cases_list}
    rev_by_type: dict = {}
    for inv in invoices:
        if inv.get("payment_status") == "paid":
            c = case_map.get(str(inv.get("case_id","")), {})
            cat = c.get("legal_category","Άλλο") or "Άλλο"
            rev_by_type[cat] = rev_by_type.get(cat,0) + inv.get("amount",0)

    # Revenue by source (leads → matters)
    rev_by_source: dict = {}
    leads_converted = await db.leads.find({"stage": "matter_opened"}).to_list(None)
    for l in leads_converted:
        src = l.get("source","other")
        rev_by_source[src] = rev_by_source.get(src,0) + 1

    return {
        "leads": {"total": total_leads, "new": new_leads, "this_week": week_leads,
                  "converted": converted, "conversion_rate": conv_rate, "stale": stale_leads},
        "cases": {"active": active_cases, "stuck_14d": stuck_cases, "no_next_action": no_next},
        "financials": {"month_billed": month_billed, "total_outstanding": total_billed - total_paid_all,
                       "overdue_amount": overdue_amount, "overdue_count": overdue_count, "collection_rate": coll_rate},
        "revenue_by_type": rev_by_type,
        "revenue_by_source": rev_by_source,
    }

@app.get("/api/billing/overdue")
async def get_overdue_invoices(user=Depends(get_current_user)):
    now = datetime.utcnow()
    invoices = await db.invoices.find({
        "payment_status": {"$in": ["pending", "partial"]},
        "due_date": {"$lt": now}
    }).sort("due_date", 1).to_list(None)
    result = []
    for inv in invoices:
        s = serialize(inv)
        s["days_overdue"] = max(0, (now - inv["due_date"]).days) if inv.get("due_date") else 0
        # Try to enrich with client name
        if inv.get("client_id"):
            try:
                client = await db.clients.find_one({"_id": make_id(str(inv["client_id"]))})
            except:
                client = None
            if client:
                s["client_name"] = client.get("name", "")
        result.append(s)
    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  NOMOS ONE — EXTENSIONS v2: Payments · Hearings · Email · Lindy · PDF · Excel
# ═══════════════════════════════════════════════════════════════════════════════

import smtplib
import io
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fpdf import FPDF
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
import httpx as _httpx

FIRM_DISPLAY_NAME = os.getenv("ADMIN_NAME", "Σκοτάνης & Συνεργάτες")
FIRM_EMAIL_DISPLAY = os.getenv("ADMIN_EMAIL", "christos@skotanislaw.com")
LINDY_WEBHOOK_URL = os.getenv("LINDY_WEBHOOK_URL", "https://chat.lindy.ai/christos-skotaniss-workspace/lindy/legal-document-extractor-69db65ca7cf5099909310fa8/tasks")

# ── Payment Models ─────────────────────────────────────────────────────────────

class PaymentRequest(BaseModel):
    invoice_id: Optional[str] = None
    case_id: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    amount: float
    payment_method: str = "bank_transfer"
    payment_date: datetime
    notes: Optional[str] = None
    reference: Optional[str] = None

# ── Payment Endpoints ──────────────────────────────────────────────────────────

@app.get("/api/payments")
async def list_payments(case_id: Optional[str] = None, client_id: Optional[str] = None, user=Depends(get_current_user)):
    q: dict = {}
    if case_id: q["case_id"] = case_id
    if client_id: q["client_id"] = client_id
    payments = await db.payments.find(q).sort("payment_date", -1).to_list(None)
    return [serialize(p) for p in payments]

@app.post("/api/payments", status_code=201)
async def create_payment(req: PaymentRequest, user=Depends(get_current_user)):
    doc = req.dict()
    doc["created_at"] = datetime.utcnow()
    doc["created_by"] = user["id"]
    if req.invoice_id:
        try:
            invoice = await db.invoices.find_one({"_id": make_id(req.invoice_id)})
            if invoice:
                total = float(invoice.get("total", invoice.get("amount", 0)))
                existing = await db.payments.find({"invoice_id": req.invoice_id}).to_list(None)
                paid_so_far = sum(float(p.get("amount", 0)) for p in existing)
                new_paid = paid_so_far + req.amount
                new_status = "paid" if new_paid >= total else "partial"
                await db.invoices.update_one(
                    {"_id": make_id(req.invoice_id)},
                    {"$set": {"payment_status": new_status, "amount_paid": new_paid}}
                )
        except Exception as e:
            logger.warning(f"Could not update invoice status: {e}")
    r = await db.payments.insert_one(doc)
    await audit("CREATE_PAYMENT", user["id"], "payment", str(r.inserted_id))
    return serialize(await db.payments.find_one({"_id": r.inserted_id}))

@app.get("/api/payments/{payment_id}")
async def get_payment(payment_id: str, user=Depends(get_current_user)):
    p = await db.payments.find_one({"_id": make_id(payment_id)})
    if not p: raise HTTPException(404)
    return serialize(p)

@app.delete("/api/payments/{payment_id}")
async def delete_payment(payment_id: str, user=Depends(require_role(UserRole.ADMIN))):
    await db.payments.delete_one({"_id": make_id(payment_id)})
    await audit("DELETE_PAYMENT", user["id"], "payment", payment_id)
    return {"ok": True}

@app.get("/api/cases/{case_id}/payments")
async def get_case_payments(case_id: str, user=Depends(get_current_user)):
    payments = await db.payments.find({"case_id": case_id}).sort("payment_date", -1).to_list(None)
    return [serialize(p) for p in payments]

# ── Hearing Models ─────────────────────────────────────────────────────────────

class HearingRequest(BaseModel):
    case_id: str
    court: str
    hearing_date: datetime
    judge: Optional[str] = None
    notes: Optional[str] = None
    outcome: Optional[str] = None
    next_hearing: Optional[datetime] = None
    status: str = "scheduled"

# ── Hearing Endpoints ──────────────────────────────────────────────────────────

@app.get("/api/hearings")
async def list_hearings(user=Depends(get_current_user)):
    hearings = await db.hearings.find({}).sort("hearing_date", 1).to_list(None)
    return [serialize(h) for h in hearings]

@app.get("/api/cases/{case_id}/hearings")
async def get_case_hearings(case_id: str, user=Depends(get_current_user)):
    hearings = await db.hearings.find({"case_id": case_id}).sort("hearing_date", -1).to_list(None)
    return [serialize(h) for h in hearings]

@app.post("/api/hearings", status_code=201)
async def create_hearing(req: HearingRequest, user=Depends(get_current_user)):
    doc = req.dict()
    doc["created_at"] = datetime.utcnow()
    doc["created_by"] = user["id"]
    r = await db.hearings.insert_one(doc)
    await audit("CREATE_HEARING", user["id"], "hearing", str(r.inserted_id))
    return serialize(await db.hearings.find_one({"_id": r.inserted_id}))

@app.put("/api/hearings/{hearing_id}")
async def update_hearing(hearing_id: str, req: HearingRequest, user=Depends(get_current_user)):
    doc = req.dict()
    doc["updated_at"] = datetime.utcnow()
    result = await db.hearings.update_one({"_id": make_id(hearing_id)}, {"$set": doc})
    if result.matched_count == 0: raise HTTPException(404)
    return serialize(await db.hearings.find_one({"_id": make_id(hearing_id)}))

@app.delete("/api/hearings/{hearing_id}")
async def delete_hearing(hearing_id: str, user=Depends(get_current_user)):
    await db.hearings.delete_one({"_id": make_id(hearing_id)})
    return {"ok": True}

# ── Email ──────────────────────────────────────────────────────────────────────

class EmailSendRequest(BaseModel):
    to_email: str
    to_name: Optional[str] = None
    subject: str
    body_html: str
    body_text: Optional[str] = None
    invoice_id: Optional[str] = None

@app.post("/api/email/send")
async def send_email(req: EmailSendRequest, user=Depends(get_current_user)):
    settings_doc = await db.settings.find_one({"_id": "global"}) or {}
    smtp_host = settings_doc.get("smtp_host") or os.getenv("SMTP_HOST", "")
    smtp_port = int(settings_doc.get("smtp_port") or os.getenv("SMTP_PORT", "587"))
    smtp_user = settings_doc.get("smtp_user") or os.getenv("SMTP_USER", "")
    smtp_pass = settings_doc.get("smtp_pass") or os.getenv("SMTP_PASS", "")
    from_email = settings_doc.get("notification_email") or smtp_user or FIRM_EMAIL_DISPLAY
    log_doc = {
        "to": req.to_email, "subject": req.subject,
        "sent_by": user["id"], "sent_at": datetime.utcnow(),
        "invoice_id": req.invoice_id, "status": "pending"
    }
    if not smtp_host or not smtp_user:
        log_doc["status"] = "placeholder_logged"
        await db.email_logs.insert_one(log_doc)
        logger.info(f"EMAIL PLACEHOLDER → {req.to_email}: {req.subject}")
        return {"ok": True, "status": "placeholder", "message": f"SMTP not configured. Logged email to {req.to_email}"}
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = req.subject
        msg["From"] = f"{FIRM_DISPLAY_NAME} <{from_email}>"
        msg["To"] = f"{req.to_name or ''} <{req.to_email}>"
        if req.body_text:
            msg.attach(MIMEText(req.body_text, "plain", "utf-8"))
        msg.attach(MIMEText(req.body_html, "html", "utf-8"))
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as srv:
            srv.ehlo()
            srv.starttls()
            srv.login(smtp_user, smtp_pass)
            srv.sendmail(from_email, req.to_email, msg.as_string())
        log_doc["status"] = "sent"
        await db.email_logs.insert_one(log_doc)
        await audit("EMAIL_SENT", user["id"], "email", req.to_email)
        return {"ok": True, "status": "sent"}
    except Exception as e:
        log_doc["status"] = "failed"
        log_doc["error"] = str(e)
        await db.email_logs.insert_one(log_doc)
        logger.error(f"Email send failed: {e}")
        raise HTTPException(500, f"Αποτυχία αποστολής: {str(e)}")

@app.get("/api/email/logs")
async def get_email_logs(user=Depends(require_role(UserRole.ADMIN))):
    logs = await db.email_logs.find({}).sort("sent_at", -1).limit(100).to_list(None)
    return [serialize(l) for l in logs]

# ── Lindy AI Proxy ─────────────────────────────────────────────────────────────

class LindyForwardRequest(BaseModel):
    message: Optional[str] = None
    source: str = "manual"
    metadata: Optional[dict] = None

@app.post("/api/lindy/forward")
async def forward_to_lindy(req: LindyForwardRequest, user=Depends(get_current_user)):
    webhook_url = os.getenv("LINDY_WEBHOOK_URL", LINDY_WEBHOOK_URL)
    payload = {
        "message": req.message,
        "source": req.source,
        "metadata": req.metadata or {},
        "sent_by": user.get("email"),
        "timestamp": datetime.utcnow().isoformat(),
    }
    try:
        async with _httpx.AsyncClient(timeout=15) as http:
            resp = await http.post(webhook_url, json=payload)
            return {"ok": True, "status": resp.status_code, "response": resp.text[:500]}
    except Exception as e:
        logger.error(f"Lindy proxy failed: {e}")
        return {"ok": False, "error": str(e)}

# ── Invoice PDF ────────────────────────────────────────────────────────────────

@app.get("/api/invoices/{invoice_id}/pdf")
async def generate_invoice_pdf(invoice_id: str, user=Depends(get_current_user)):
    inv = await db.invoices.find_one({"_id": make_id(invoice_id)})
    if not inv: raise HTTPException(404)
    settings_doc = await db.settings.find_one({"_id": "global"}) or {}
    firm = settings_doc.get("firm_name", FIRM_DISPLAY_NAME)
    firm_afm = settings_doc.get("firm_afm", "—")
    firm_address = settings_doc.get("firm_address", "Αθήνα, Ελλάδα")
    firm_email = settings_doc.get("notification_email", FIRM_EMAIL_DISPLAY)

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_fill_color(7, 18, 32)
    pdf.rect(0, 0, 210, 48, 'F')
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(198, 167, 94)
    pdf.set_xy(15, 10)
    pdf.cell(0, 10, firm, ln=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(138, 160, 184)
    pdf.set_xy(15, 23)
    pdf.cell(0, 5, f"{firm_address}  |  {firm_email}  |  AFM: {firm_afm}", ln=True)
    inv_number = inv.get("invoice_number", str(inv["_id"])[-6:])
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(198, 167, 94)
    pdf.set_xy(130, 13)
    pdf.cell(0, 8, f"TIMOΛΟΓΙΟ #{inv_number}")
    inv_date = inv.get("created_at", datetime.utcnow())
    if isinstance(inv_date, str):
        try: inv_date = datetime.fromisoformat(inv_date.replace("Z",""))
        except: inv_date = datetime.utcnow()
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(138, 160, 184)
    pdf.set_xy(130, 24)
    pdf.cell(0, 5, f"Ημ/νια: {inv_date.strftime('%d/%m/%Y')}")
    pdf.set_text_color(30, 30, 30)
    pdf.set_y(58)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(237, 241, 245)
    pdf.set_x(15)
    pdf.cell(85, 7, "ΠΡΟΣ:", fill=True)
    pdf.set_x(110)
    pdf.cell(85, 7, "ΥΠΟΘΕΣΗ:", fill=True)
    pdf.ln(7)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_x(15)
    pdf.cell(85, 6, (inv.get("client_name") or "—")[:40])
    pdf.set_x(110)
    pdf.cell(85, 6, (inv.get("case_title") or "—")[:40])
    pdf.ln(6)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(100, 100, 100)
    if inv.get("client_afm"):
        pdf.set_x(15)
        pdf.cell(85, 5, f"AFM: {inv['client_afm']}")
    if inv.get("is_professional"):
        pdf.set_x(110)
        pdf.cell(85, 5, "[Επιτηδευματιας - Παρακρατηση 20%]")
    pdf.ln(12)
    pdf.set_text_color(30, 30, 30)
    pdf.set_fill_color(7, 18, 32)
    pdf.set_text_color(198, 167, 94)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_x(15)
    pdf.cell(120, 8, "ΠΕΡΙΓΡΑΦΗ ΥΠΗΡΕΣΙΩΝ", fill=True)
    pdf.cell(55, 8, "ΠΟΣΟ", fill=True, align="R")
    pdf.ln(8)
    pdf.set_text_color(30, 30, 30)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_fill_color(250, 251, 252)
    pdf.set_x(15)
    desc = (inv.get("description") or "Νομικές υπηρεσίες")[:80]
    amount = float(inv.get("amount", 0))
    pdf.cell(120, 8, desc, fill=True)
    pdf.cell(55, 8, f"EUR {amount:,.2f}", fill=True, align="R")
    pdf.ln(16)
    vat_rate = float(inv.get("vat_rate", 24))
    vat = float(inv.get("vat_amount", amount * vat_rate / 100))
    withholding = float(inv.get("withholding_tax", 0))
    total = float(inv.get("total", amount + vat))
    net_payable = float(inv.get("net_payable", total - withholding))
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(80, 80, 80)
    for lbl, val, sign in [(f"ΦΠΑ {int(vat_rate)}%", vat, "+")]:
        pdf.set_x(110)
        pdf.cell(55, 6, lbl)
        pdf.cell(20, 6, f"{sign} EUR {val:,.2f}", align="R")
        pdf.ln(6)
    if withholding > 0:
        pdf.set_x(110)
        pdf.cell(55, 6, "Παρακρατηση 20%")
        pdf.cell(20, 6, f"- EUR {withholding:,.2f}", align="R")
        pdf.ln(6)
    pdf.set_fill_color(7, 18, 32)
    pdf.set_text_color(198, 167, 94)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_x(110)
    pdf.cell(75, 9, f"ΣΥΝΟΛΟ: EUR {total:,.2f}", fill=True, align="R")
    pdf.ln(9)
    if withholding > 0:
        pdf.set_fill_color(22, 163, 74)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_x(110)
        pdf.cell(75, 9, f"ΕΙΣΠΡΑΚΤΕΟ: EUR {net_payable:,.2f}", fill=True, align="R")
        pdf.ln(14)
    if withholding > 0:
        pdf.set_text_color(100, 100, 100)
        pdf.set_font("Helvetica", "I", 7)
        pdf.set_x(15)
        pdf.multi_cell(180, 4, "* Η παρακρατηση φορου 20% αποδιδεται απο τον πελατη (επιτηδευματια) στην ΑΑΔΕ.")
    pdf.set_y(-45)
    pdf.set_text_color(30, 30, 30)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_x(15)
    pdf.cell(80, 5, "_" * 28)
    pdf.set_x(115)
    pdf.cell(80, 5, "_" * 28)
    pdf.ln(6)
    pdf.set_x(15)
    pdf.cell(80, 5, "Υπογραφη Δικηγορου")
    pdf.set_x(115)
    pdf.cell(80, 5, "Υπογραφη Πελατη")
    pdf.set_y(-18)
    pdf.set_fill_color(237, 241, 245)
    pdf.rect(0, pdf.get_y(), 210, 18, 'F')
    pdf.set_text_color(120, 120, 120)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_x(15)
    pdf.cell(0, 9, f"{firm}  |  {firm_address}  |  AFM: {firm_afm}")
    pdf_bytes = pdf.output()
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice_{inv_number}.pdf"}
    )

# ── Excel Exports ──────────────────────────────────────────────────────────────

def _make_wb_header(ws, headers):
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.font = Font(bold=True, color="FFFFFF", size=10)
        cell.fill = PatternFill("solid", fgColor="071220")
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 18

@app.get("/api/invoices/export/excel")
async def export_invoices_excel(user=Depends(get_current_user)):
    invoices = await db.invoices.find({}).sort("created_at", -1).to_list(None)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Τιμολόγια"
    headers = ["Αρ.Τιμολ.", "Υπόθεση", "Πελάτης", "Ημερομηνία", "Ακαθάριστα", "ΦΠΑ", "Παρακράτηση", "Σύνολο", "Καθαρό", "Κατάσταση"]
    _make_wb_header(ws, headers)
    alt = PatternFill("solid", fgColor="F5F7FA")
    for i, inv in enumerate(invoices, 2):
        d = inv.get("created_at")
        dstr = d.strftime("%d/%m/%Y") if isinstance(d, datetime) else (str(d)[:10] if d else "")
        row = [
            inv.get("invoice_number", str(inv["_id"])[-6:]),
            inv.get("case_title", ""),
            inv.get("client_name", ""),
            dstr,
            float(inv.get("amount", 0)),
            float(inv.get("vat_amount", 0)),
            float(inv.get("withholding_tax", 0)),
            float(inv.get("total", inv.get("amount", 0))),
            float(inv.get("net_payable", inv.get("total", 0))),
            inv.get("payment_status", "pending"),
        ]
        for col, val in enumerate(row, 1):
            cell = ws.cell(row=i, column=col, value=val)
            if i % 2 == 0: cell.fill = alt
            if col in (5, 6, 7, 8, 9): cell.number_format = '#,##0.00 €'
    for col, w in enumerate([14,26,22,13,14,12,16,14,14,12], 1):
        ws.column_dimensions[get_column_letter(col)].width = w
    ws2 = wb.create_sheet("Μηνιαία")
    _make_wb_header(ws2, ["Μήνας","Πλήθος","Ακαθάριστα","ΦΠΑ 24%","Παρακράτηση","Καθαρό"])
    monthly: dict = {}
    for inv in invoices:
        d2 = inv.get("created_at", datetime.utcnow())
        if isinstance(d2, str):
            try: d2 = datetime.fromisoformat(d2.replace("Z",""))
            except: d2 = datetime.utcnow()
        key = f"{d2.year}-{d2.month:02d}"
        label = d2.strftime("%B %Y")
        if key not in monthly:
            monthly[key] = {"label": label, "n": 0, "g": 0, "v": 0, "w": 0, "net": 0}
        monthly[key]["n"] += 1
        monthly[key]["g"] += float(inv.get("amount", 0))
        monthly[key]["v"] += float(inv.get("vat_amount", 0))
        monthly[key]["w"] += float(inv.get("withholding_tax", 0))
        monthly[key]["net"] += float(inv.get("net_payable", inv.get("total", 0)))
    for i, (_, m) in enumerate(sorted(monthly.items(), reverse=True), 2):
        row2 = [m["label"], m["n"], m["g"], m["v"], m["w"], m["net"]]
        for col, val in enumerate(row2, 1):
            cell = ws2.cell(row=i, column=col, value=val)
            if col >= 3: cell.number_format = '#,##0.00 €'
    out = io.BytesIO()
    wb.save(out); out.seek(0)
    return StreamingResponse(out, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=invoices.xlsx"})

@app.get("/api/clients/export/excel")
async def export_clients_excel(user=Depends(get_current_user)):
    cl = await db.clients.find({}).sort("full_name", 1).to_list(None)
    wb = openpyxl.Workbook()
    ws = wb.active; ws.title = "Πελάτες"
    _make_wb_header(ws, ["Ονοματεπώνυμο","ΑΦΜ","Τηλέφωνο","Email","Διεύθυνση","Τύπος","Κατάσταση","Εγγραφή"])
    alt = PatternFill("solid", fgColor="F5F7FA")
    for i, c in enumerate(cl, 2):
        d = c.get("created_at")
        row = [c.get("full_name",""), c.get("afm",""), c.get("phone",""), c.get("email",""),
               c.get("address",""), c.get("client_type","individual"),
               "Ενεργός" if c.get("is_active") != False else "Ανενεργός",
               d.strftime("%d/%m/%Y") if isinstance(d, datetime) else ""]
        for col, val in enumerate(row, 1):
            cell = ws.cell(row=i, column=col, value=val)
            if i % 2 == 0: cell.fill = alt
    for col, w in enumerate([26,14,14,26,26,16,12,14],1):
        ws.column_dimensions[get_column_letter(col)].width = w
    out = io.BytesIO(); wb.save(out); out.seek(0)
    return StreamingResponse(out, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=clients.xlsx"})

@app.get("/api/cases/export/excel")
async def export_cases_excel(user=Depends(get_current_user)):
    cases = await db.cases.find({}).sort("created_at", -1).to_list(None)
    wb = openpyxl.Workbook()
    ws = wb.active; ws.title = "Υποθέσεις"
    _make_wb_header(ws, ["Κωδικός","Τίτλος","Πελάτης","Κατηγορία","Κατάσταση","Δικηγόρος","Ημ.Δημ."])
    alt = PatternFill("solid", fgColor="F5F7FA")
    for i, c in enumerate(cases, 2):
        d = c.get("created_at")
        row = [c.get("case_number",""), c.get("title",""), c.get("client_name",""),
               c.get("category", c.get("legal_category","")), c.get("status",""),
               c.get("assigned_lawyer",""),
               d.strftime("%d/%m/%Y") if isinstance(d, datetime) else ""]
        for col, val in enumerate(row, 1):
            cell = ws.cell(row=i, column=col, value=val)
            if i % 2 == 0: cell.fill = alt
    for col, w in enumerate([14,30,24,14,14,20,12],1):
        ws.column_dimensions[get_column_letter(col)].width = w
    out = io.BytesIO(); wb.save(out); out.seek(0)
    return StreamingResponse(out, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=cases.xlsx"})

# ══════════════════════════════════════════════════════════════════════════════
# API v1 ROUTES - MOBILE & PWA SUPPORT
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/v1/auth/register-device", status_code=201)
async def register_device_v1(
    req: RegisterDeviceRequest,
    user=Depends(get_current_user),
    request: Request = None
):
    """Register a new device for push notifications"""
    if req.device_type not in ["ios", "android", "web", "desktop"]:
        raise HTTPException(status_code=400, detail="Invalid device_type")

    try:
        device_service = get_device_service(db)
        result = await device_service.register_device(
            user_id=user["id"],
            device_name=req.device_name,
            device_type=req.device_type,
            push_token=req.push_token,
            app_version=req.app_version,
            user_agent=request.headers.get("user-agent", "") if request else ""
        )

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        await audit("device_registered", user["id"], "device", details={
            "device_type": req.device_type,
            "is_new": result.get("is_new", False)
        })

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Device registration failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to register device")


@app.get("/api/v1/auth/register-device")
async def list_user_devices_v1(user=Depends(get_current_user)):
    """Get all devices registered for current user"""
    try:
        device_service = get_device_service(db)
        devices = await device_service.get_user_devices(user["id"])
        return devices
    except Exception as e:
        logger.error(f"Failed to list devices: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve devices")


@app.post("/api/v1/auth/register-device/{device_id}/trust")
async def trust_device_v1(
    device_id: str,
    req: TrustDeviceRequest,
    user=Depends(get_current_user)
):
    """Mark device as trusted (skip 2FA for 30 days)"""
    try:
        device_service = get_device_service(db)
        success = await device_service.trust_device(
            device_id=device_id,
            user_id=user["id"],
            device_name=req.device_name
        )

        if not success:
            raise HTTPException(status_code=404, detail="Device not found")

        await audit("device_trusted", user["id"], "device", resource_id=device_id)
        return {"status": "trusted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to trust device: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to trust device")


@app.delete("/api/v1/auth/register-device/{device_id}")
async def unregister_device_v1(
    device_id: str,
    user=Depends(get_current_user)
):
    """Unregister/delete a device"""
    try:
        device_service = get_device_service(db)
        success = await device_service.unregister_device(
            device_id=device_id,
            user_id=user["id"]
        )

        if not success:
            raise HTTPException(status_code=404, detail="Device not found")

        await audit("device_unregistered", user["id"], "device", resource_id=device_id)
        return {"status": "unregistered"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to unregister device: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to unregister device")


@app.get("/api/v1/cases/sync")
async def delta_sync_v1(
    last_sync: Optional[datetime] = None,
    device_id: Optional[str] = None,
    user=Depends(get_current_user)
):
    """Delta sync: Get only case data modified since last sync (optimized for mobile)"""
    try:
        sync_time = last_sync or (datetime.utcnow() - timedelta(days=30))

        # Get cases assigned to user that have been modified
        cases_cursor = db.cases.find({
            "$or": [
                {"assigned_lawyer_id": ObjectId(user["_id"])},
                {"assigned_secretary_id": ObjectId(user["_id"])}
            ],
            "updated_at": {"$gte": sync_time}
        }).sort("updated_at", -1).limit(100)

        cases = []
        async for case in cases_cursor:
            cases.append(serialize(case))

        # Get documents modified since last sync
        documents_cursor = db.documents.find({
            "updated_at": {"$gte": sync_time}
        }).sort("updated_at", -1).limit(100)

        documents = []
        async for doc in documents_cursor:
            documents.append(serialize(doc))

        return {
            "cases": cases,
            "documents": documents,
            "messages": [],
            "updates": [],
            "last_sync_at": datetime.utcnow().isoformat(),
            "has_more": False
        }
    except Exception as e:
        logger.error(f"Delta sync failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Sync failed")


@app.post("/api/v1/auth/logout")
async def logout_device_v1(
    device_id: Optional[str] = None,
    user=Depends(get_current_user)
):
    """Logout from a specific device or all devices"""
    try:
        if device_id:
            device_service = get_device_service(db)
            await device_service.revoke_device_trust(device_id, user["id"])
            await audit("device_logout", user["id"], "device", resource_id=device_id)
        else:
            # Logout from all devices
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"trusted_devices": []}}
            )
            await audit("logout_all_devices", user["id"], "user")

        return {"status": "logged_out"}
    except Exception as e:
        logger.error(f"Logout failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Logout failed")


@app.get("/api/v1/auth/me")
async def get_current_user_info_v1(user=Depends(get_current_user)):
    """Get current authenticated user info (v1 enhanced with devices)"""
    try:
        device_service = get_device_service(db)
        devices = await device_service.get_user_devices(user["id"])

        user_copy = serialize(user)
        user_copy["devices"] = devices
        user_copy["app_preferences"] = user.get("app_preferences", {
            "notification_enabled": True,
            "offline_mode_enabled": True
        })
        user_copy.pop("password", None)

        return user_copy
    except Exception as e:
        logger.error(f"Failed to get user info: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve user info")


@app.get("/api/v1/health")
async def health_check_v1():
    """API health check and version information"""
    return {
        "status": "ok",
        "version": "1.0.0",
        "min_app_version": "1.0.0",
        "required_app_version": None,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/api/v1/config/app")
async def get_app_config_v1(user: Optional[Dict] = None):
    """Get app configuration for mobile clients"""
    return {
        "api_version": "1.0.0",
        "features": {
            "offline_mode": True,
            "push_notifications": True,
            "websocket_messaging": True,
            "two_factor_auth": False
        },
        "websocket_url": "ws://localhost:8000/ws"
    }
