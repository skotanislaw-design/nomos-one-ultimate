"""
Shared intake processor — used by Telegram and Email intake channels.
Receives raw file bytes, runs AI extraction, creates client/case in MongoDB.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId

from ai_service import intake_analyze

logger = logging.getLogger("nomos_one")

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10MB


def _sanitize(s: Optional[str]) -> str:
    if not s:
        return ""
    return s.strip()[:500]


async def process_intake_file(
    db,
    file_bytes: bytes,
    media_type: str,
    filename: str,
    api_key: str,
    model: str,
    submitted_by: str = "external",
) -> dict:
    """
    Core intake pipeline:
    1. AI extraction (Haiku)
    2. Match or create client
    3. Create case
    Returns a result dict with client/case info or error.
    """
    if len(file_bytes) > MAX_FILE_BYTES:
        return {"error": f"Το αρχείο είναι πολύ μεγάλο ({len(file_bytes)//1024//1024}MB > 10MB)"}

    # ── 1. AI extraction ─────────────────────────────────────────────────────
    try:
        extracted = intake_analyze(api_key, file_bytes, media_type, model=model)
    except Exception as e:
        logger.error(f"intake_analyze error [{filename}]: {e}")
        return {"error": f"Σφάλμα ανάλυσης: {str(e)[:200]}"}

    now = datetime.now(timezone.utc)
    cl = extracted.get("client") or {}
    cs = extracted.get("case") or {}

    # ── 2. Match or create client ─────────────────────────────────────────────
    client_id = None
    client_name = _sanitize(cl.get("full_name"))
    client_existing = False

    if cl.get("afm"):
        existing = await db.clients.find_one({"afm": cl["afm"]})
        if existing:
            client_id = str(existing["_id"])
            client_name = existing.get("full_name", client_name)
            client_existing = True

    if not client_id and client_name:
        existing = await db.clients.find_one(
            {"full_name": {"$regex": client_name[:10], "$options": "i"}}
        )
        if existing:
            client_id = str(existing["_id"])
            client_name = existing.get("full_name", client_name)
            client_existing = True

    if not client_id and client_name:
        doc = {
            "full_name": client_name,
            "afm": cl.get("afm"),
            "phone": _sanitize(cl.get("phone")),
            "email": _sanitize(cl.get("email")),
            "address": _sanitize(cl.get("address")),
            "client_type": cl.get("client_type", "individual"),
            "is_active": True,
            "source": "intake_channel",
            "created_at": now,
            "created_by": submitted_by,
        }
        res = await db.clients.insert_one(doc)
        client_id = str(res.inserted_id)

    # ── 3. Create case ────────────────────────────────────────────────────────
    case_number = None
    case_title = _sanitize(cs.get("title")) or (f"Υπόθεση {client_name}" if client_name else "Νέα Υπόθεση")

    if client_id:
        year = now.year
        counter = await db.counters.find_one_and_update(
            {"_id": "case_number"},
            {"$set": {"year": year}, "$inc": {"seq": 1}},
            upsert=True, return_document=True,
        )
        if counter.get("year") != year:
            counter = await db.counters.find_one_and_update(
                {"_id": "case_number"},
                {"$set": {"year": year, "seq": 1}},
                return_document=True,
            )
        case_number = f"{year}-{str(counter['seq']).zfill(4)}"

        case_doc = {
            "title": case_title,
            "client_id": client_id,
            "assigned_lawyer_id": submitted_by,
            "status": "active",
            "legal_category": cs.get("category", "αστικό"),
            "court": _sanitize(cs.get("court")),
            "description": _sanitize(extracted.get("summary") or cs.get("summary")),
            "case_number": case_number,
            "opposing_party": _sanitize(cs.get("opposing_party")),
            "source": "intake_channel",
            "review_status": "pending_review",
            "ai_confidence": extracted.get("confidence", "low"),
            "ai_key_facts": extracted.get("key_facts", []),
            "source_file": filename,
            "created_at": now,
            "created_by": submitted_by,
            "updated_at": now,
            "last_activity": now,
        }
        await db.cases.insert_one(case_doc)

    return {
        "client": {"id": client_id, "name": client_name, "existing": client_existing},
        "case": {"number": case_number, "title": case_title},
        "confidence": extracted.get("confidence", "low"),
        "summary": extracted.get("summary", ""),
        "tokens": extracted.get("_tokens", 0),
    }
