"""
Telegram intake service — state machine flow:

1. User sends doc(s) → AI extracts all parties from each
2. Bot asks "More documents?" [Ναι/Όχι]
3. When done → shows all unique parties found → "Who is your client?"
4. User picks number → creates PENDING intake (not live)
5. Lawyers get notified in dashboard → Approve/Reject

Sessions stored in MongoDB (telegram_sessions), TTL = 4h.
Pending intakes stored in MongoDB (pending_intakes).
"""

import os
import json
import logging
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Request
from ai_service import intake_analyze

logger = logging.getLogger("nomos_one")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"
SESSION_TTL_HOURS = 4

# States
COLLECTING = "collecting"
SELECTING_CLIENT = "selecting_client"

router = APIRouter()

SUPPORTED_MIME = {
    "application/pdf",
    "image/jpeg", "image/jpg", "image/png", "image/webp",
}

# ── Telegram API helpers ──────────────────────────────────────────────────────

async def _api(method: str, **kwargs):
    if not TELEGRAM_BOT_TOKEN:
        return
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f"{TELEGRAM_API}/{method}", json=kwargs)
        return r.json()


async def _send(chat_id: int, text: str, reply_markup=None):
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    await _api("sendMessage", **payload)


async def _answer_callback(callback_query_id: str, text: str = ""):
    await _api("answerCallbackQuery", callback_query_id=callback_query_id, text=text)


async def _download_file(file_id: str) -> tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(f"{TELEGRAM_API}/getFile", params={"file_id": file_id})
        r.raise_for_status()
        file_path = r.json()["result"]["file_path"]
        url = f"https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}/{file_path}"
        dl = await client.get(url, timeout=90)
        dl.raise_for_status()
        return dl.content, file_path.split("/")[-1]


# ── Inline keyboards ──────────────────────────────────────────────────────────

def _more_docs_keyboard():
    return {
        "inline_keyboard": [[
            {"text": "Ναι, υπάρχουν κι άλλα", "callback_data": "more_docs:yes"},
            {"text": "Όχι, τελείωσα", "callback_data": "more_docs:no"},
        ]]
    }


def _client_keyboard(parties: list[str]):
    rows = []
    for i, p in enumerate(parties[:8]):  # max 8 options
        rows.append([{"text": f"{i+1}. {p[:40]}", "callback_data": f"pick_client:{i}"}])
    rows.append([{"text": "Κανένας από τους παραπάνω", "callback_data": "pick_client:none"}])
    return {"inline_keyboard": rows}


# ── Party extraction helpers ──────────────────────────────────────────────────

def _extract_parties(extracted: dict) -> list[str]:
    """Collect all named persons/entities from an extraction result."""
    parties = set()
    cl = extracted.get("client") or {}
    if cl.get("full_name"):
        parties.add(cl["full_name"].strip())

    # Opposing party
    cs = extracted.get("case") or {}
    if cs.get("opposing_party"):
        for p in cs["opposing_party"].split(","):
            p = p.strip()
            if p:
                parties.add(p)

    # Key facts may mention names — skip for now (too noisy)
    return list(parties)


def _merge_extractions(docs: list[dict]) -> dict:
    """Merge multiple document extractions into one consolidated record."""
    if not docs:
        return {}
    if len(docs) == 1:
        return docs[0]["extracted"]

    merged = {}
    # Take first non-null value for each field
    for key in ["document_type", "confidence", "summary"]:
        for d in docs:
            v = d["extracted"].get(key)
            if v:
                merged[key] = v
                break

    # Merge client fields
    client = {}
    for field in ["full_name", "afm", "phone", "email", "address", "client_type", "birth_date"]:
        for d in docs:
            v = (d["extracted"].get("client") or {}).get(field)
            if v:
                client[field] = v
                break
    merged["client"] = client

    # Merge case fields
    case = {}
    for field in ["title", "category", "court", "case_number", "opposing_party", "summary"]:
        for d in docs:
            v = (d["extracted"].get("case") or {}).get(field)
            if v:
                case[field] = v
                break
    merged["case"] = case

    # Merge key facts (union)
    all_facts = []
    seen = set()
    for d in docs:
        for f in (d["extracted"].get("key_facts") or []):
            if f not in seen:
                seen.add(f)
                all_facts.append(f)
    merged["key_facts"] = all_facts[:15]

    # Deadlines (union)
    all_dl = []
    for d in docs:
        all_dl.extend(d["extracted"].get("deadlines") or [])
    merged["deadlines"] = all_dl

    return merged


def _all_parties(docs: list[dict]) -> list[str]:
    seen = set()
    result = []
    for d in docs:
        for p in _extract_parties(d["extracted"]):
            if p not in seen:
                seen.add(p)
                result.append(p)
    return result


# ── Session management ────────────────────────────────────────────────────────

async def _get_session(db, chat_id: int) -> dict | None:
    return await db.telegram_sessions.find_one({"chat_id": chat_id})


async def _save_session(db, chat_id: int, state: str, docs: list, sender: str):
    await db.telegram_sessions.update_one(
        {"chat_id": chat_id},
        {"$set": {
            "chat_id": chat_id,
            "state": state,
            "docs": docs,
            "sender": sender,
            "updated_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )


async def _clear_session(db, chat_id: int):
    await db.telegram_sessions.delete_one({"chat_id": chat_id})


# ── Pending intake creation ───────────────────────────────────────────────────

async def _create_pending(db, chat_id: int, sender: str, docs: list, client_name: str, client_data: dict):
    merged = _merge_extractions(docs)
    # Override client with user selection
    if merged.get("client"):
        merged["client"]["full_name"] = client_name
    else:
        merged["client"] = {"full_name": client_name}

    filenames = [d["filename"] for d in docs]
    now = datetime.now(timezone.utc)

    intake = {
        "status": "pending",
        "client_name": client_name,
        "extracted": merged,
        "filenames": filenames,
        "source": "telegram",
        "submitted_by": sender,
        "chat_id": chat_id,
        "submitted_at": now,
        "reviewed_by": None,
        "reviewed_at": None,
        "notes": "",
    }
    res = await db.pending_intakes.insert_one(intake)
    return str(res.inserted_id)


# ── Document processing ───────────────────────────────────────────────────────

async def _process_document(db, api_key: str, model: str, chat_id: int,
                             sender: str, file_id: str, filename: str, media_type: str):
    """Download, analyze, update session, prompt for more docs."""
    await _send(chat_id, f"Επεξεργάζομαι: *{filename}*...")

    try:
        file_bytes, fname = await _download_file(file_id)
        filename = fname or filename
    except Exception as e:
        logger.error(f"Telegram download error: {e}")
        await _send(chat_id, "Σφάλμα λήψης αρχείου. Δοκιμάστε ξανά.")
        return

    if len(file_bytes) > 10 * 1024 * 1024:
        await _send(chat_id, f"Το αρχείο *{filename}* είναι πολύ μεγάλο (max 10MB).")
        return

    try:
        extracted = intake_analyze(api_key, file_bytes, media_type, model=model)
    except Exception as e:
        logger.error(f"AI extract error [{filename}]: {e}")
        await _send(chat_id, f"Σφάλμα ανάλυσης αρχείου: {str(e)[:150]}")
        return

    # Append to session
    session = await _get_session(db, chat_id)
    docs = (session or {}).get("docs", [])
    docs.append({"filename": filename, "extracted": extracted})
    await _save_session(db, chat_id, COLLECTING, docs, sender)

    parties = _all_parties(docs)
    parties_preview = ", ".join(parties[:4]) or "—"
    doc_count = len(docs)

    await _send(
        chat_id,
        f"✅ *Έγγραφο {doc_count} αναλύθηκε*\n"
        f"Πρόσωπα/οντότητες μέχρι τώρα: _{parties_preview}_\n\n"
        f"Υπάρχουν κι άλλα έγγραφα για *την ίδια υπόθεση*;",
        reply_markup=_more_docs_keyboard(),
    )


async def _finalize_collection(db, chat_id: int):
    """User said 'no more docs' — show party list for client selection."""
    session = await _get_session(db, chat_id)
    if not session:
        await _send(chat_id, "Δεν βρέθηκε ενεργή συνεδρία. Στείλτε ένα έγγραφο για να ξεκινήσετε.")
        return

    docs = session.get("docs", [])
    if not docs:
        await _send(chat_id, "Δεν βρέθηκαν έγγραφα. Στείλτε ένα PDF ή φωτογραφία.")
        return

    parties = _all_parties(docs)
    sender = session.get("sender", "unknown")

    if not parties:
        # No parties found — ask free text
        await db.telegram_sessions.update_one(
            {"chat_id": chat_id},
            {"$set": {"state": SELECTING_CLIENT}},
        )
        await _send(
            chat_id,
            f"Δεν εντοπίστηκε συγκεκριμένο πρόσωπο στα *{len(docs)}* έγγραφα.\n"
            "Πληκτρολογήστε το ονοματεπώνυμο του πελάτη σας:"
        )
        return

    await db.telegram_sessions.update_one(
        {"chat_id": chat_id},
        {"$set": {"state": SELECTING_CLIENT, "parties": parties}},
    )

    parties_text = "\n".join(f"*{i+1}.* {p}" for i, p in enumerate(parties[:8]))
    await _send(
        chat_id,
        f"Βρέθηκαν *{len(parties)}* πρόσωπα/οντότητες σε {len(docs)} έγγραφο(-α):\n\n"
        f"{parties_text}\n\n"
        f"Ποιος είναι ο *πελάτης σας*;",
        reply_markup=_client_keyboard(parties),
    )


async def _handle_client_selection(db, api_key: str, model: str, chat_id: int, selection: str):
    """User picked a client — create pending intake."""
    session = await _get_session(db, chat_id)
    if not session:
        await _send(chat_id, "Η συνεδρία έληξε. Στείλτε ξανά τα έγγραφα.")
        return

    docs = session.get("docs", [])
    parties = session.get("parties", [])
    sender = session.get("sender", "unknown")

    if selection == "none":
        client_name = "Άγνωστος Πελάτης"
    elif selection.isdigit():
        idx = int(selection)
        client_name = parties[idx] if idx < len(parties) else "Άγνωστος Πελάτης"
    else:
        client_name = selection  # free-text fallback

    pending_id = await _create_pending(db, chat_id, sender, docs, client_name, {})
    await _clear_session(db, chat_id)

    merged = _merge_extractions(docs)
    case_title = (merged.get("case") or {}).get("title") or f"Υπόθεση {client_name}"
    confidence = merged.get("confidence", "low")
    conf_icon = {"high": "🟢", "medium": "🟡", "low": "🔴"}.get(confidence, "⚪")

    await _send(
        chat_id,
        f"✅ *Intake υποβλήθηκε προς έγκριση*\n\n"
        f"👤 Πελάτης: *{client_name}*\n"
        f"📁 Υπόθεση: _{case_title}_\n"
        f"📄 Έγγραφα: {len(docs)}\n"
        f"{conf_icon} Αξιοπιστία AI: {confidence}\n\n"
        f"_Αναμένει έγκριση από δικηγόρο στο Nomos One._"
    )


# ── Main webhook handler ──────────────────────────────────────────────────────

@router.post("/api/telegram/webhook")
async def telegram_webhook(request: Request):
    if not TELEGRAM_BOT_TOKEN:
        return {"ok": True}

    update = await request.json()
    import server as srv
    db = srv.db
    api_key = srv.ANTHROPIC_API_KEY
    model = srv.MODEL_EXTRACTION

    # ── Callback queries (inline button presses) ──────────────────────────────
    if cq := update.get("callback_query"):
        chat_id = cq["message"]["chat"]["id"]
        data = cq.get("data", "")
        await _answer_callback(cq["id"])

        if data == "more_docs:yes":
            session = await _get_session(db, chat_id)
            count = len((session or {}).get("docs", []))
            await _send(chat_id, f"Εντάξει! Στείλτε το επόμενο έγγραφο ({count + 1}ο).")

        elif data == "more_docs:no":
            await _finalize_collection(db, chat_id)

        elif data.startswith("pick_client:"):
            selection = data.split(":", 1)[1]
            await _handle_client_selection(db, api_key, model, chat_id, selection)

        return {"ok": True}

    # ── Regular messages ──────────────────────────────────────────────────────
    message = update.get("message") or update.get("channel_post")
    if not message:
        return {"ok": True}

    chat_id = message["chat"]["id"]
    from_user = message.get("from", {})
    sender = from_user.get("username") or from_user.get("first_name", "unknown")

    # Text messages
    if text := message.get("text", ""):
        if text.startswith("/start"):
            await _clear_session(db, chat_id)
            await _send(
                chat_id,
                "Καλώς ήρθατε στο *Nomos Intake Bot* 🏛\n\n"
                "Στείλτε ένα ή περισσότερα PDF/φωτογραφίες εγγράφων.\n"
                "Θα σας ρωτήσω ποιος είναι ο πελάτης σας και θα δημιουργηθεί "
                "αίτηση εισαγωγής για έγκριση από δικηγόρο."
            )
        elif text.startswith("/cancel"):
            await _clear_session(db, chat_id)
            await _send(chat_id, "Η συνεδρία ακυρώθηκε. Στείλτε νέο έγγραφο όταν θέλετε.")
        else:
            # Free-text client name if in SELECTING_CLIENT state
            session = await _get_session(db, chat_id)
            if session and session.get("state") == SELECTING_CLIENT and not session.get("parties"):
                await _handle_client_selection(db, api_key, model, chat_id, text.strip())
            else:
                await _send(
                    chat_id,
                    "Στείλτε ένα PDF ή φωτογραφία εγγράφου για να ξεκινήσετε.\n"
                    "Ή /cancel για να ακυρώσετε την τρέχουσα συνεδρία."
                )
        return {"ok": True}

    # Document or photo
    file_id = None
    filename = "document"
    media_type = "application/pdf"

    if doc := message.get("document"):
        file_id = doc["file_id"]
        filename = doc.get("file_name", "document.pdf")
        media_type = doc.get("mime_type", "application/pdf")
    elif photos := message.get("photo"):
        file_id = photos[-1]["file_id"]
        filename = "photo.jpg"
        media_type = "image/jpeg"

    if not file_id:
        return {"ok": True}

    if media_type not in SUPPORTED_MIME:
        await _send(chat_id, f"Μη υποστηριζόμενος τύπος: {media_type}\nΑποστείλτε PDF ή εικόνα.")
        return {"ok": True}

    # Check if in wrong state
    session = await _get_session(db, chat_id)
    if session and session.get("state") == SELECTING_CLIENT:
        await _send(chat_id, "Παρακαλώ επιλέξτε πρώτα τον πελάτη από την παραπάνω λίστα.")
        return {"ok": True}

    await _process_document(db, api_key, model, chat_id, sender, file_id, filename, media_type)
    return {"ok": True}


# ── Startup webhook registration ──────────────────────────────────────────────

async def register_webhook(base_url: str):
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN not set — Telegram intake disabled")
        return
    webhook_url = f"{base_url}/api/telegram/webhook"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{TELEGRAM_API}/setWebhook",
            params={"url": webhook_url, "allowed_updates": '["message","callback_query"]'},
        )
        data = r.json()
        if data.get("ok"):
            logger.info(f"Telegram webhook registered: {webhook_url}")
        else:
            logger.warning(f"Telegram webhook registration failed: {data}")
