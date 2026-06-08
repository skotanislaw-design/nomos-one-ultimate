"""
Telegram intake service — state machine flow:

1. User sends doc(s) → AI extracts all parties from each
2. Bot asks "More documents?" [Ναι/Όχι]
3. When done → shows all unique parties with toggle checkboxes
4. User selects one or more clients → Επιβεβαίωση
5. Creates PENDING intake (not live)
6. Lawyers get notified in dashboard → Approve/Reject

Sessions stored in MongoDB (telegram_sessions), TTL = 4h.
Pending intakes stored in MongoDB (pending_intakes).
"""

import os
import logging
import httpx
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request
from ai_service import intake_analyze
import anthropic
from bson import ObjectId
from pinakia_service import extract_pinakio, match_hearings as match_pinakio_hearings, is_pinakio_document

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
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
}

# ── Telegram API helpers ──────────────────────────────────────────────────────

async def _api(method: str, **kwargs):
    if not TELEGRAM_BOT_TOKEN:
        return {}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f"{TELEGRAM_API}/{method}", json=kwargs)
        return r.json()


async def _send(chat_id: int, text: str, reply_markup=None) -> dict:
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    return await _api("sendMessage", **payload)


async def _answer_callback(callback_query_id: str, text: str = ""):
    await _api("answerCallbackQuery", callback_query_id=callback_query_id, text=text)


async def _edit_keyboard(chat_id: int, message_id: int, reply_markup: dict):
    await _api("editMessageReplyMarkup",
               chat_id=chat_id, message_id=message_id, reply_markup=reply_markup)


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


def _client_keyboard(parties: list[str], selected: list[int] = None):
    if selected is None:
        selected = []
    rows = []
    for i, p in enumerate(parties[:8]):
        tick = "✅ " if i in selected else "☐ "
        rows.append([{"text": f"{tick}{p[:38]}", "callback_data": f"toggle_client:{i}"}])
    if selected:
        confirm_text = f"✔ Επιβεβαίωση ({len(selected)} επιλεγμένοι)"
    else:
        confirm_text = "Επιλέξτε και πατήστε Επιβεβαίωση"
    rows.append([{"text": confirm_text, "callback_data": "confirm_clients"}])
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

    return list(parties)


def _merge_extractions(docs: list[dict]) -> dict:
    """Merge multiple document extractions into one consolidated record."""
    if not docs:
        return {}
    if len(docs) == 1:
        return docs[0]["extracted"]

    merged = {}
    for key in ["document_type", "confidence", "summary"]:
        for d in docs:
            v = d["extracted"].get(key)
            if v:
                merged[key] = v
                break

    client = {}
    for field in ["full_name", "afm", "phone", "email", "address", "client_type", "birth_date"]:
        for d in docs:
            v = (d["extracted"].get("client") or {}).get(field)
            if v:
                client[field] = v
                break
    merged["client"] = client

    case = {}
    for field in ["title", "category", "court", "case_number", "opposing_party", "summary"]:
        for d in docs:
            v = (d["extracted"].get("case") or {}).get(field)
            if v:
                case[field] = v
                break
    merged["case"] = case

    all_facts = []
    seen = set()
    for d in docs:
        for f in (d["extracted"].get("key_facts") or []):
            if f not in seen:
                seen.add(f)
                all_facts.append(f)
    merged["key_facts"] = all_facts[:15]

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

async def _create_pending(db, chat_id: int, sender: str, docs: list, client_names: list[str]):
    merged = _merge_extractions(docs)
    primary_name = client_names[0] if client_names else "Άγνωστος"
    if merged.get("client"):
        merged["client"]["full_name"] = primary_name
    else:
        merged["client"] = {"full_name": primary_name}

    filenames = [d["filename"] for d in docs]
    now = datetime.now(timezone.utc)

    intake = {
        "status": "pending",
        "client_name": primary_name,
        "client_names": client_names,
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
    """User said 'no more docs' — show party list for multi-select client selection."""
    session = await _get_session(db, chat_id)
    if not session:
        await _send(chat_id, "Δεν βρέθηκε ενεργή συνεδρία. Στείλτε ένα έγγραφο για να ξεκινήσετε.")
        return

    docs = session.get("docs", [])
    if not docs:
        await _send(chat_id, "Δεν βρέθηκαν έγγραφα. Στείλτε ένα PDF ή φωτογραφία.")
        return

    parties = _all_parties(docs)

    if not parties:
        await db.telegram_sessions.update_one(
            {"chat_id": chat_id},
            {"$set": {"state": SELECTING_CLIENT, "parties": [], "selected_indices": [], "keyboard_msg_id": None}},
        )
        await _send(
            chat_id,
            f"Δεν εντοπίστηκε συγκεκριμένο πρόσωπο στα *{len(docs)}* έγγραφα.\n"
            "Πληκτρολογήστε το ονοματεπώνυμο του/των πελάτη/ών σας:"
        )
        return

    parties_text = "\n".join(f"*{i+1}.* {p}" for i, p in enumerate(parties[:8]))
    resp = await _send(
        chat_id,
        f"Βρέθηκαν *{len(parties)}* πρόσωπα/οντότητες σε {len(docs)} έγγραφο(-α):\n\n"
        f"{parties_text}\n\n"
        f"Επιλέξτε *έναν ή περισσότερους* ως πελάτες σας και πατήστε Επιβεβαίωση:",
        reply_markup=_client_keyboard(parties, []),
    )
    msg_id = (resp or {}).get("result", {}).get("message_id")
    await db.telegram_sessions.update_one(
        {"chat_id": chat_id},
        {"$set": {
            "state": SELECTING_CLIENT,
            "parties": parties,
            "selected_indices": [],
            "keyboard_msg_id": msg_id,
        }},
    )


async def _handle_pinakio_document(db, api_key: str, chat_id: int,
                                    sender: str, file_id: str, filename: str, media_type: str):
    """Download and process a court schedule document, match against open cases, store and report."""
    await _send(chat_id, f"📋 Αναλύω πινάκειο: *{filename}*...\n_Αυτό μπορεί να πάρει λίγα δευτερόλεπτα._")
    await _api("sendChatAction", chat_id=chat_id, action="upload_document")

    try:
        file_bytes, fname = await _download_file(file_id)
        filename = fname or filename
    except Exception as e:
        logger.error(f"Pinakio download error: {e}")
        await _send(chat_id, "Σφάλμα λήψης αρχείου. Δοκιμάστε ξανά.")
        return

    try:
        extracted = extract_pinakio(api_key, file_bytes, media_type)
    except Exception as e:
        logger.error(f"Pinakio extraction error: {e}")
        await _send(chat_id, f"Σφάλμα ανάλυσης πινακείου: {str(e)[:100]}")
        return

    hearings_raw = extracted.get("hearings") or []
    hearing_date = extracted.get("hearing_date") or datetime.now(timezone.utc).date().isoformat()
    court_name = extracted.get("court_name") or "Άγνωστο Δικαστήριο"

    # Match against open cases
    hearings = await match_pinakio_hearings(db, hearings_raw)
    matches = [h for h in hearings if h.get("matched_case_id")]
    match_count = len(matches)

    # Store in MongoDB
    doc = {
        "court_name": court_name,
        "hearing_date": hearing_date,
        "file_name": filename,
        "media_type": media_type,
        "uploaded_at": datetime.now(timezone.utc),
        "uploaded_by": f"telegram:{sender}",
        "source": "telegram",
        "hearings": hearings,
        "hearing_count": len(hearings),
        "match_count": match_count,
    }
    await db.pinakia.insert_one(doc)

    # Build Telegram response
    lines = [
        f"✅ *Πινάκειο αποθηκεύτηκε*",
        f"",
        f"🏛 {court_name}",
        f"📅 {hearing_date}",
        f"📊 {len(hearings)} υποθέσεις εντοπίστηκαν",
    ]

    if match_count > 0:
        lines.append(f"")
        lines.append(f"🎯 *{match_count} match{'es' if match_count > 1 else ''} με ανοιχτές υποθέσεις:*")
        for h in matches:
            parties = ", ".join(h.get("parties", []))[:50]
            case_num = h.get("case_number", "")
            lines.append(
                f"  • #{h.get('aa','?')} {case_num} — {parties}\n"
                f"    ↳ *{h.get('matched_case_title','—')}*"
            )
    else:
        lines.append(f"")
        lines.append(f"ℹ️ Δεν βρέθηκαν matches με ανοιχτές υποθέσεις.")

    lines.append(f"")
    lines.append(f"_Διαθέσιμο στο Nomos One → Πινάκεια_")

    await _send(chat_id, "\n".join(lines))


async def _handle_confirmed_clients(db, chat_id: int, client_names: list[str], docs: list, sender: str):
    """All clients confirmed — create pending intake."""
    pending_id = await _create_pending(db, chat_id, sender, docs, client_names)
    await _clear_session(db, chat_id)

    merged = _merge_extractions(docs)
    case_title = (merged.get("case") or {}).get("title") or f"Υπόθεση {client_names[0]}"
    confidence = merged.get("confidence", "low")
    conf_icon = {"high": "🟢", "medium": "🟡", "low": "🔴"}.get(confidence, "⚪")
    clients_text = "\n".join(f"  • {n}" for n in client_names)

    await _send(
        chat_id,
        f"✅ *Intake υποβλήθηκε προς έγκριση*\n\n"
        f"👥 Πελάτες:\n{clients_text}\n\n"
        f"📁 Υπόθεση: _{case_title}_\n"
        f"📄 Έγγραφα: {len(docs)}\n"
        f"{conf_icon} Αξιοπιστία AI: {confidence}\n\n"
        f"_Αναμένει έγκριση από δικηγόρο στο Nomos One._"
    )


# ── Authorized chat IDs (comma-separated env var, empty = all allowed) ────────

_ALLOWED_RAW = os.getenv("TELEGRAM_ALLOWED_CHATS", "")
ALLOWED_CHAT_IDS: set[int] = {int(x) for x in _ALLOWED_RAW.split(",") if x.strip().lstrip("-").isdigit()}


def _is_authorized(chat_id: int) -> bool:
    return not ALLOWED_CHAT_IDS or chat_id in ALLOWED_CHAT_IDS


# ── AI assistant — tool definitions ──────────────────────────────────────────

_AI_TOOLS = [
    {
        "name": "get_today_schedule",
        "description": "Επιστρέφει τα σημερινά ακροατήρια και προθεσμίες του γραφείου.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "search_case",
        "description": "Αναζητά υποθέσεις με βάση ονοματεπώνυμο πελάτη, τίτλο υπόθεσης ή αριθμό. Χρησιμοποίησέ το ΠΑΝΤΑ πριν καλέσεις add_hearing ή create_case_note για να βρεις το σωστό case_id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Όρος αναζήτησης — ονοματεπώνυμο, τίτλος ή αριθμός υπόθεσης"}
            },
            "required": ["query"],
        },
    },
    {
        "name": "add_hearing",
        "description": "Προσθέτει νέο δικάσιμο σε υπόθεση. Χρησιμοποίησε search_case πρώτα για να πάρεις το case_id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "case_id":      {"type": "string", "description": "MongoDB _id της υπόθεσης (από search_case)"},
                "court":        {"type": "string", "description": "Δικαστήριο (π.χ. 'Πρωτοδικείο Αθηνών')"},
                "hearing_date": {"type": "string", "description": "Ημερομηνία/ώρα ISO 8601, π.χ. '2026-06-15T10:00:00'"},
                "notes":        {"type": "string", "description": "Προαιρετικές σημειώσεις"},
                "judge":        {"type": "string", "description": "Δικαστής (προαιρετικά)"},
            },
            "required": ["case_id", "court", "hearing_date"],
        },
    },
    {
        "name": "add_deadline",
        "description": "Προσθέτει προθεσμία σε υπόθεση.",
        "input_schema": {
            "type": "object",
            "properties": {
                "case_id":   {"type": "string", "description": "MongoDB _id της υπόθεσης"},
                "title":     {"type": "string", "description": "Περιγραφή προθεσμίας"},
                "date":      {"type": "string", "description": "Ημερομηνία YYYY-MM-DD"},
                "notes":     {"type": "string", "description": "Προαιρετικές σημειώσεις"},
            },
            "required": ["case_id", "title", "date"],
        },
    },
    {
        "name": "send_client_reminder",
        "description": "Στέλνει email υπενθύμισης στον πελάτη μιας υπόθεσης.",
        "input_schema": {
            "type": "object",
            "properties": {
                "case_id":        {"type": "string", "description": "MongoDB _id της υπόθεσης"},
                "custom_message": {"type": "string", "description": "Προαιρετικό μήνυμα"},
            },
            "required": ["case_id"],
        },
    },
    {
        "name": "create_case_note",
        "description": "Προσθέτει σημείωση σε υπόθεση.",
        "input_schema": {
            "type": "object",
            "properties": {
                "case_id":   {"type": "string", "description": "MongoDB _id της υπόθεσης"},
                "note_text": {"type": "string", "description": "Κείμενο σημείωσης"},
            },
            "required": ["case_id", "note_text"],
        },
    },
    {
        "name": "get_upcoming_deadlines",
        "description": "Επιστρέφει τις επερχόμενες προθεσμίες.",
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "Ημέρες μπροστά (προεπιλογή 7)"}
            },
        },
    },
    {
        "name": "get_overdue_invoices",
        "description": "Επιστρέφει τα ληξιπρόθεσμα τιμολόγια.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_client_info",
        "description": "Επιστρέφει στοιχεία πελάτη (email, τηλέφωνο, υποθέσεις).",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Ονοματεπώνυμο ή email πελάτη"}
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_hearings_by_date",
        "description": "Επιστρέφει τα πινάκια και τις δικάσιμους από τη βάση για συγκεκριμένη ημερομηνία.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "Ημερομηνία YYYY-MM-DD. 'today' ή 'tomorrow' επίσης αποδεκτά."}
            },
            "required": ["date"],
        },
    },
    {
        "name": "search_pinakio",
        "description": "Αναζητά σε πινάκια δικαστηρίων βάσει ονόματος κατηγορουμένου/διαδίκου ή αριθμού υπόθεσης.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Ονοματεπώνυμο ή αριθμός υπόθεσης"}
            },
            "required": ["query"],
        },
    },
]

_AI_SYSTEM = f"""Είσαι ο AI βοηθός του δικηγορικού γραφείου Σκοτάνης & Συνεργάτες μέσω Telegram.
Σήμερα: {datetime.now(timezone.utc).strftime('%d/%m/%Y')}.

ΚΑΝΟΝΕΣ:
- Απαντάς ΠΑΝΤΑ στα Ελληνικά, σύντομα και επαγγελματικά.
- Για ΚΑΘΕ ερώτηση που αφορά δεδομένα (υποθέσεις, δικάσιμοι, πελάτες, προθεσμίες, τιμολόγια): κάλεσε ΠΑΝΤΑ το κατάλληλο tool — μην απαντάς από μνήμη.
- Για ενέργειες (δικάσιμος, σημείωση, email): εκτέλεσέ τες ΑΜΕΣΑ χωρίς να ζητάς επιβεβαίωση.
- Όταν προσθέτεις δικάσιμο: χρησιμοποίησε πρώτα search_case για να βρεις το case_id, μετά add_hearing.
- Όταν ο χρήστης στέλνει έγγραφο με εντολή (π.χ. "πρόσθεσε δικάσιμο"), σου δίνεται το OCR του εγγράφου — χρησιμοποίησέ το για να εξάγεις τα στοιχεία.
- Μορφοποίησε με Markdown (bold, bullet points). Κράτα τις απαντήσεις σύντομες.
- Αν δεν βρεις κάτι στη βάση, πες το ξεκάθαρα."""


async def _execute_tool(db, api_key: str, name: str, inp: dict) -> str:
    """Execute a tool call and return a string result."""

    if name == "get_today_schedule":
        today = datetime.now(timezone.utc).date().isoformat()
        tomorrow = (datetime.now(timezone.utc).date() + timedelta(days=1)).isoformat()

        hearings = await db.hearings.find({
            "$or": [
                {"hearing_date": {"$regex": f"^{today}"}},
                {"date": {"$regex": f"^{today}"}},
            ]
        }).to_list(30)

        deadlines = await db.deadlines.find({
            "date": {"$gte": today, "$lt": tomorrow}
        }).sort("date", 1).to_list(30)

        lines = []
        for h in hearings:
            lines.append(
                f"🏛 ΑΚΡΟΑΤΗΡΙΟ | {h.get('case_title') or h.get('title','—')} | "
                f"{h.get('court','—')} | {str(h.get('hearing_date') or h.get('date',''))[:10]}"
            )
        for d in deadlines:
            lines.append(
                f"⏰ ΠΡΟΘΕΣΜΙΑ | {d.get('title') or d.get('description','—')} | "
                f"Υπόθεση: {d.get('case_title','—')} | {str(d.get('date',''))[:10]}"
            )
        return "\n".join(lines) if lines else "Δεν υπάρχουν εργασίες για σήμερα."

    elif name == "search_case":
        query = inp.get("query", "")
        regex = {"$regex": query, "$options": "i"}
        cases = await db.cases.find({
            "$or": [{"title": regex}, {"client_name": regex}, {"case_number": regex}]
        }).limit(5).to_list(5)

        if not cases:
            return f"Δεν βρέθηκαν υποθέσεις για '{query}'."
        lines = []
        for c in cases:
            lines.append(
                f"ID:{str(c['_id'])} | {c.get('title','—')} | "
                f"Πελάτης: {c.get('client_name','—')} | Κατάσταση: {c.get('status','—')}"
            )
        return "\n".join(lines)

    elif name == "get_client_info":
        query = inp.get("query", "")
        regex = {"$regex": query, "$options": "i"}
        client = await db.clients.find_one({
            "$or": [{"full_name": regex}, {"name": regex}, {"email": regex}]
        })
        if not client:
            return f"Δεν βρέθηκε πελάτης '{query}'."
        cases = await db.cases.find({"client_id": str(client["_id"])}).limit(5).to_list(5)
        case_titles = [c.get("title", "—") for c in cases]
        return (
            f"Πελάτης: {client.get('full_name') or client.get('name','—')}\n"
            f"Email: {client.get('email','—')}\n"
            f"Τηλ: {client.get('phone','—')}\n"
            f"Υποθέσεις: {', '.join(case_titles) or '—'}"
        )

    elif name == "send_client_reminder":
        case_id = inp.get("case_id", "")
        custom_msg = inp.get("custom_message", "")
        try:
            case = await db.cases.find_one({"_id": ObjectId(case_id)})
        except Exception:
            case = await db.cases.find_one({"case_number": case_id})
        if not case:
            return f"Δεν βρέθηκε υπόθεση: {case_id}"

        client_email = case.get("client_email") or case.get("email")
        client_name = case.get("client_name", "Πελάτης")
        case_title = case.get("title", "")

        if not client_email:
            return f"Δεν υπάρχει email για τον {client_name}."

        body = custom_msg or f"Σας στέλνουμε υπενθύμιση για την υπόθεσή σας: {case_title}."
        html = f"""<div style="font-family:Arial,sans-serif;max-width:600px;">
          <div style="background:#071220;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:#C6A75E;margin:0;">Σκοτάνης &amp; Συνεργάτες</h2>
          </div>
          <div style="padding:24px;background:#f8f9fa;border:1px solid #e0e0e0;border-top:none;">
            <p>Αγαπητέ/ή <strong>{client_name}</strong>,</p>
            <p>{body}</p>
            <hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0;"/>
            <p style="color:#888;font-size:12px;">Σκοτάνης &amp; Συνεργάτες | christos@skotanislaw.com</p>
          </div>
        </div>"""

        try:
            from email_service import send_email_async
            await send_email_async(
                to_email=client_email,
                to_name=client_name,
                subject=f"Υπενθύμιση — {case_title}",
                html_content=html,
            )
            await db.audit_log.insert_one({
                "action": "TELEGRAM_REMINDER_SENT",
                "entity_type": "case",
                "entity_id": str(case.get("_id", "")),
                "user_name": "Telegram Bot",
                "details": f"Υπενθύμιση στον {client_name}: {body[:100]}",
                "created_at": datetime.now(timezone.utc),
            })
            return f"Email υπενθύμισης στάλθηκε στον {client_name} ({client_email})."
        except Exception as e:
            return f"Σφάλμα αποστολής email: {str(e)[:100]}"

    elif name == "add_hearing":
        case_id  = inp.get("case_id", "")
        court    = inp.get("court", "")
        hdate    = inp.get("hearing_date", "")
        notes    = inp.get("notes", "")
        judge    = inp.get("judge", "")
        try:
            ObjectId(case_id)
        except Exception:
            return "Μη έγκυρο case_id. Χρησιμοποίησε search_case πρώτα."
        try:
            hdate_parsed = datetime.fromisoformat(hdate.replace("Z", "+00:00"))
        except Exception:
            return f"Μη έγκυρη ημερομηνία: {hdate}. Χρησιμοποίησε ISO 8601 (π.χ. 2026-06-15T10:00:00)."
        case = await db.cases.find_one({"_id": ObjectId(case_id)})
        case_title = (case or {}).get("title", "—")
        doc = {
            "case_id":      case_id,
            "case_title":   case_title,
            "court":        court,
            "hearing_date": hdate_parsed,
            "notes":        notes,
            "judge":        judge,
            "status":       "scheduled",
            "created_at":   datetime.now(timezone.utc),
            "created_by":   "Telegram Bot",
        }
        r = await db.hearings.insert_one(doc)
        await db.audit_log.insert_one({
            "action": "CREATE_HEARING",
            "entity_type": "hearing",
            "entity_id": str(r.inserted_id),
            "user_name": "Telegram Bot",
            "details": f"Δικάσιμος {hdate_parsed.strftime('%d/%m/%Y')} — {court} — {case_title}",
            "created_at": datetime.now(timezone.utc),
        })
        return f"Δικάσιμος καταχωρήθηκε: {court} | {hdate_parsed.strftime('%d/%m/%Y %H:%M')} | Υπόθεση: {case_title}"

    elif name == "add_deadline":
        case_id = inp.get("case_id", "")
        title   = inp.get("title", "")
        date    = inp.get("date", "")
        notes   = inp.get("notes", "")
        try:
            ObjectId(case_id)
        except Exception:
            return "Μη έγκυρο case_id."
        case = await db.cases.find_one({"_id": ObjectId(case_id)})
        case_title = (case or {}).get("title", "—")
        doc = {
            "case_id":    case_id,
            "case_title": case_title,
            "title":      title,
            "date":       date,
            "notes":      notes,
            "created_at": datetime.now(timezone.utc),
            "created_by": "Telegram Bot",
        }
        await db.deadlines.insert_one(doc)
        return f"Προθεσμία καταχωρήθηκε: {title} | {date} | Υπόθεση: {case_title}"

    elif name == "create_case_note":
        case_id = inp.get("case_id", "")
        note_text = inp.get("note_text", "")
        try:
            oid = ObjectId(case_id)
        except Exception:
            return "Μη έγκυρο case_id."
        await db.notes.insert_one({
            "case_id": case_id,
            "content": note_text,
            "user_name": "Telegram Bot",
            "created_at": datetime.now(timezone.utc),
        })
        await db.audit_log.insert_one({
            "action": "CREATE_NOTE",
            "entity_type": "case",
            "entity_id": case_id,
            "user_name": "Telegram Bot",
            "details": note_text[:200],
            "created_at": datetime.now(timezone.utc),
        })
        return "Σημείωση προστέθηκε."

    elif name == "get_upcoming_deadlines":
        days = int(inp.get("days", 7))
        today = datetime.now(timezone.utc).date().isoformat()
        end = (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()
        deadlines = await db.deadlines.find({
            "date": {"$gte": today, "$lte": end}
        }).sort("date", 1).to_list(30)

        if not deadlines:
            return f"Δεν υπάρχουν προθεσμίες τις επόμενες {days} ημέρες."
        lines = [
            f"⏰ {str(d.get('date',''))[:10]} | {d.get('title') or d.get('description','—')} | {d.get('case_title','—')}"
            for d in deadlines
        ]
        return "\n".join(lines)

    elif name == "get_overdue_invoices":
        today = datetime.now(timezone.utc).date().isoformat()
        invoices = await db.invoices.find({
            "status": {"$in": ["pending", "overdue"]},
            "due_date": {"$lt": today},
        }).sort("due_date", 1).to_list(30)

        if not invoices:
            return "Δεν υπάρχουν ληξιπρόθεσμα τιμολόγια."
        total = 0.0
        lines = []
        for inv in invoices:
            amt = float(inv.get("total_amount") or inv.get("amount") or 0)
            total += amt
            lines.append(
                f"📄 {inv.get('invoice_number','—')} | {inv.get('client_name','—')} | "
                f"€{amt:,.2f} | λήξη: {str(inv.get('due_date',''))[:10]}"
            )
        lines.append(f"\n*Σύνολο: €{total:,.2f}*")
        return "\n".join(lines)

    elif name == "get_hearings_by_date":
        raw_date = inp.get("date", "today").strip().lower()
        today = datetime.now(timezone.utc).date()
        if raw_date in ("today", "σήμερα"):
            target = today.isoformat()
        elif raw_date in ("tomorrow", "αύριο"):
            target = (today + timedelta(days=1)).isoformat()
        else:
            target = raw_date  # assume YYYY-MM-DD

        docs = await db.pinakia.find({"hearing_date": target}).to_list(20)
        if not docs:
            return f"Δεν υπάρχουν πινάκια για {target}."
        lines = [f"📋 Πινάκεια {target}:"]
        for doc in docs:
            matches = [h for h in doc.get("hearings", []) if h.get("matched_case_id")]
            lines.append(
                f"\n🏛 *{doc.get('court_name','—')}* — {len(doc.get('hearings',[]))} υποθέσεις"
                + (f", {len(matches)} match{'es' if len(matches)!=1 else ''} με ανοιχτές υποθέσεις" if matches else "")
            )
            for h in doc.get("hearings", []):
                flag = "✅ " if h.get("matched_case_id") else ""
                parties = ", ".join(h.get("parties", []))[:60]
                case_num = h.get("case_number", "")
                match_info = f" → *{h.get('matched_case_title','—')}*" if h.get("matched_case_id") else ""
                lines.append(f"  {flag}#{h.get('aa','?')} {case_num} {parties}{match_info}")
        return "\n".join(lines)

    elif name == "search_pinakio":
        query = inp.get("query", "")
        import re as _re
        docs = await db.pinakia.find({
            "$or": [
                {"hearings.parties": {"$regex": query, "$options": "i"}},
                {"hearings.case_number": {"$regex": query, "$options": "i"}},
            ]
        }).sort("hearing_date", -1).limit(10).to_list(10)

        results = []
        for doc in docs:
            court = doc.get("court_name", "—")
            date = doc.get("hearing_date", "—")
            for h in doc.get("hearings", []):
                parties_str = " ".join(h.get("parties", []))
                case_num = h.get("case_number", "")
                if (_re.search(query, parties_str, _re.IGNORECASE) or
                        _re.search(query, case_num, _re.IGNORECASE)):
                    match_info = f" → *{h.get('matched_case_title','—')}*" if h.get("matched_case_id") else ""
                    results.append(
                        f"🏛 {court} | 📅 {date} | #{h.get('aa','?')} {case_num} "
                        f"{', '.join(h.get('parties',[]))}{match_info}"
                    )
        if not results:
            return f"Δεν βρέθηκαν αποτελέσματα για '{query}' στα πινάκια."
        return f"Αποτελέσματα για '{query}':\n\n" + "\n".join(results[:15])

    return f"[άγνωστο tool: {name}]"


async def _handle_doc_with_command(db, api_key: str, model: str, chat_id: int,
                                    file_id: str, filename: str, media_type: str, caption: str):
    """OCR a document then pass the extracted text + user command to the AI assistant."""
    await _api("sendChatAction", chat_id=chat_id, action="typing")
    try:
        file_bytes, _ = await _download_file(file_id)
    except Exception as e:
        await _send(chat_id, f"Σφάλμα λήψης αρχείου: {e}")
        return

    await _send(chat_id, f"_Αναλύω το αρχείο {filename}..._")
    await _api("sendChatAction", chat_id=chat_id, action="typing")

    try:
        extracted = intake_analyze(api_key, file_bytes, media_type, model=model)
    except Exception as e:
        await _send(chat_id, f"Σφάλμα OCR: {e}")
        return

    # Build a rich context message for the AI
    import json as _json
    doc_summary = _json.dumps(extracted, ensure_ascii=False, indent=2)
    combined = (
        f"Εντολή χρήστη: {caption}\n\n"
        f"Περιεχόμενο εγγράφου ({filename}):\n```\n{doc_summary[:3000]}\n```\n\n"
        f"Εκτέλεσε την εντολή του χρήστη χρησιμοποιώντας τα παραπάνω στοιχεία."
    )
    await _handle_ai_query(db, api_key, chat_id, combined)


async def _handle_ai_query(db, api_key: str, chat_id: int, user_text: str):
    """Route a free-text message through Claude agent and reply on Telegram."""
    await _api("sendChatAction", chat_id=chat_id, action="typing")

    client = anthropic.Anthropic(api_key=api_key)
    messages = [{"role": "user", "content": user_text}]

    for _ in range(8):  # max agentic iterations
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=_AI_SYSTEM,
            tools=_AI_TOOLS,
            messages=messages,
        )

        if resp.stop_reason == "end_turn":
            text_parts = [b.text for b in resp.content if hasattr(b, "text")]
            reply = "\n".join(text_parts).strip() or "Έγινε."
            await _send(chat_id, reply[:4000])
            return

        if resp.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": resp.content})
            tool_results = []
            for block in resp.content:
                if block.type == "tool_use":
                    await _api("sendChatAction", chat_id=chat_id, action="typing")
                    result = await _execute_tool(db, api_key, block.name, block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })
            messages.append({"role": "user", "content": tool_results})

    await _send(chat_id, "Δεν μπόρεσα να ολοκληρώσω το αίτημα. Δοκιμάστε ξανά.")


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

        elif data.startswith("toggle_client:"):
            idx = int(data.split(":", 1)[1])
            session = await _get_session(db, chat_id)
            if not session:
                return {"ok": True}
            parties = session.get("parties", [])
            selected = list(session.get("selected_indices", []))
            if idx in selected:
                selected.remove(idx)
            else:
                selected.append(idx)
            await db.telegram_sessions.update_one(
                {"chat_id": chat_id},
                {"$set": {"selected_indices": selected}},
            )
            msg_id = session.get("keyboard_msg_id")
            if msg_id:
                await _edit_keyboard(chat_id, msg_id, _client_keyboard(parties, selected))

        elif data == "confirm_clients":
            session = await _get_session(db, chat_id)
            if not session:
                return {"ok": True}
            selected = session.get("selected_indices", [])
            parties = session.get("parties", [])
            docs = session.get("docs", [])
            sender = session.get("sender", "unknown")

            if not selected:
                await _send(chat_id, "⚠️ Παρακαλώ επιλέξτε τουλάχιστον έναν πελάτη πριν επιβεβαιώσετε.")
                return {"ok": True}

            client_names = [parties[i] for i in sorted(selected) if i < len(parties)]
            await _handle_confirmed_clients(db, chat_id, client_names, docs, sender)

        return {"ok": True}

    # ── Regular messages ──────────────────────────────────────────────────────
    message = update.get("message") or update.get("channel_post")
    if not message:
        return {"ok": True}

    chat_id = message["chat"]["id"]
    from_user = message.get("from", {})
    sender = from_user.get("username") or from_user.get("first_name", "unknown")

    if text := message.get("text", ""):
        if text.startswith("/start"):
            await _clear_session(db, chat_id)
            await _send(
                chat_id,
                "*Nomos One — Intake Bot*\n\n"
                "Στείλτε έγγραφο (PDF, Word, φωτογραφία) για αυτόματη ανάλυση και καταχώριση στο σύστημα.\n\n"
                "Εντολές: /cancel για ακύρωση συνεδρίας."
            )
        elif text.startswith("/cancel"):
            await _clear_session(db, chat_id)
            await _send(chat_id, "Η συνεδρία ακυρώθηκε.")
        elif text.startswith("/help"):
            await _send(
                chat_id,
                "*Nomos One — Intake Bot*\n\n"
                "Στείλτε PDF, Word ή φωτογραφία εγγράφου.\n"
                "Το σύστημα αναλύει αυτόματα και δημιουργεί intake για έγκριση.\n\n"
                "/cancel — ακύρωση τρέχουσας συνεδρίας"
            )
        elif text.startswith("/pinakio"):
            await _send(
                chat_id,
                "📋 *Λειτουργία Πινακείου*\n\n"
                "Στείλτε τώρα το αρχείο πινακείου (PDF, XLSX, DOCX ή φωτογραφία).\n"
                "Το σύστημα θα:\n"
                "• Αναγνωρίσει όλες τις υποθέσεις\n"
                "• Αναζητήσει matches στις ανοιχτές υποθέσεις\n"
                "• Αποθηκεύσει για όλους τους συνεργάτες\n\n"
                "_Αποστείλτε το αρχείο με caption 'πινακειο' αν είναι PDF._"
            )
        else:
            # Free-text client name if in SELECTING_CLIENT state with no parties list
            session = await _get_session(db, chat_id)
            if session and session.get("state") == SELECTING_CLIENT and not session.get("parties"):
                client_names = [n.strip() for n in text.strip().split(",") if n.strip()]
                if not client_names:
                    client_names = [text.strip()]
                docs = session.get("docs", [])
                sender_name = session.get("sender", sender)
                await _handle_confirmed_clients(db, chat_id, client_names, docs, sender_name)
            elif not _is_authorized(chat_id):
                await _send(chat_id, "Δεν έχετε πρόσβαση σε αυτή την υπηρεσία.")
            else:
                await _handle_ai_query(db, api_key, chat_id, text)
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

    session = await _get_session(db, chat_id)
    if session and session.get("state") == SELECTING_CLIENT:
        await _send(chat_id, "Παρακαλώ επιλέξτε πρώτα τον/τους πελάτη(-ες) από την παραπάνω λίστα.")
        return {"ok": True}

    caption = message.get("caption", "") or ""

    # Pinakio detection: DOCX/XLSX always → pinakio; PDF/image only if caption/filename hints
    if is_pinakio_document(caption, filename, media_type):
        await _handle_pinakio_document(db, api_key, chat_id, sender, file_id, filename, media_type)
    elif caption and not caption.strip().lower().startswith("intake"):
        # Caption = command (π.χ. "πρόσθεσε δικάσιμο") → OCR first, then pass to AI with extracted text
        await _handle_doc_with_command(db, api_key, model, chat_id, file_id, filename, media_type, caption)
    else:
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
