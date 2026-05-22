"""
Telegram intake service for Nomos One.
Receives documents/photos via webhook, runs AI extraction, creates client/case.

Setup:
  1. Set TELEGRAM_BOT_TOKEN in .env
  2. Register webhook once:
     curl "https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://nomos.skotanislaw.gr/api/telegram/webhook"
"""

import os
import logging
import httpx
from fastapi import APIRouter, Request, HTTPException

from intake_processor import process_intake_file

logger = logging.getLogger("nomos_one")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

router = APIRouter()

SUPPORTED_MIME = {
    "application/pdf",
    "image/jpeg", "image/jpg", "image/png", "image/webp",
}


async def _send_message(chat_id: int, text: str):
    if not TELEGRAM_BOT_TOKEN:
        return
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(f"{TELEGRAM_API}/sendMessage", json={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "Markdown",
        })


async def _download_file(file_id: str) -> tuple[bytes, str]:
    """Returns (bytes, filename)."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{TELEGRAM_API}/getFile", params={"file_id": file_id})
        r.raise_for_status()
        file_path = r.json()["result"]["file_path"]
        file_url = f"https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}/{file_path}"
        dl = await client.get(file_url, timeout=60)
        dl.raise_for_status()
        return dl.content, file_path.split("/")[-1]


def _result_message(result: dict) -> str:
    if "error" in result:
        return f"Σφάλμα: {result['error']}"

    client = result.get("client", {})
    case = result.get("case", {})
    confidence = result.get("confidence", "low")
    summary = result.get("summary", "")

    conf_icon = {"high": "🟢", "medium": "🟡", "low": "🔴"}.get(confidence, "⚪")

    lines = [
        "✅ *Intake ολοκληρώθηκε*",
        "",
        f"👤 *Πελάτης:* {client.get('name', '—')} {'(υπάρχων)' if client.get('existing') else '(νέος)'}",
        f"📁 *Υπόθεση:* {case.get('number', '—')} — {case.get('title', '—')}",
        f"{conf_icon} *Αξιοπιστία:* {confidence}",
    ]
    if summary:
        lines += ["", f"_{summary[:300]}_"]

    return "\n".join(lines)


@router.post("/api/telegram/webhook")
async def telegram_webhook(request: Request):
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(503, "Telegram bot not configured")

    update = await request.json()
    message = update.get("message") or update.get("channel_post")
    if not message:
        return {"ok": True}

    chat_id = message["chat"]["id"]
    from_user = message.get("from", {})
    sender = from_user.get("username") or from_user.get("first_name", "unknown")

    # Accept document or photo
    file_id = None
    filename = "document"
    media_type = "application/pdf"

    if doc := message.get("document"):
        file_id = doc["file_id"]
        filename = doc.get("file_name", "document.pdf")
        media_type = doc.get("mime_type", "application/pdf")
    elif photos := message.get("photo"):
        # Largest photo
        file_id = photos[-1]["file_id"]
        filename = "photo.jpg"
        media_type = "image/jpeg"
    else:
        text = message.get("text", "")
        if text.startswith("/start"):
            await _send_message(chat_id,
                "Καλώς ήρθατε στο *Nomos Intake Bot*!\n\n"
                "Στείλτε ένα PDF ή φωτογραφία εγγράφου για αυτόματη καταχώριση στο σύστημα."
            )
        return {"ok": True}

    if media_type not in SUPPORTED_MIME:
        await _send_message(chat_id, f"Μη υποστηριζόμενος τύπος αρχείου: {media_type}\nΑποστείλτε PDF ή εικόνα.")
        return {"ok": True}

    await _send_message(chat_id, "Επεξεργασία εγγράφου... παρακαλώ περιμένετε.")

    try:
        file_bytes, filename = await _download_file(file_id)
    except Exception as e:
        logger.error(f"Telegram download error: {e}")
        await _send_message(chat_id, "Σφάλμα λήψης αρχείου. Δοκιμάστε ξανά.")
        return {"ok": True}

    # Import db and config from server module
    import server as srv
    result = await process_intake_file(
        db=srv.db,
        file_bytes=file_bytes,
        media_type=media_type,
        filename=filename,
        api_key=srv.ANTHROPIC_API_KEY,
        model=srv.MODEL_EXTRACTION,
        submitted_by=f"telegram:{sender}",
    )

    await _send_message(chat_id, _result_message(result))
    return {"ok": True}


async def register_webhook(base_url: str):
    """Call once at startup to register the webhook with Telegram."""
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN not set — Telegram intake disabled")
        return
    webhook_url = f"{base_url}/api/telegram/webhook"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{TELEGRAM_API}/setWebhook",
            params={"url": webhook_url, "allowed_updates": '["message"]'},
        )
        data = r.json()
        if data.get("ok"):
            logger.info(f"Telegram webhook registered: {webhook_url}")
        else:
            logger.warning(f"Telegram webhook registration failed: {data}")
