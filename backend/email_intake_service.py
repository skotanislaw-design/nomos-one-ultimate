"""
Email intake service for Nomos One.

Two processing modes based on sender/subject detection:
  1. PINAKIO mode  — email from bar association or with pinakio keywords → extract court schedule
  2. INTAKE mode   — all other emails with attachments → AI client/case extraction

Polls IMAP inbox every POLL_INTERVAL seconds.

Required .env vars:
  INTAKE_IMAP_HOST      e.g. imap.gmail.com
  INTAKE_IMAP_PORT      default 993
  INTAKE_IMAP_USER      e.g. chskotanis@gmail.com
  INTAKE_IMAP_PASS      Gmail App Password (Settings → Security → App passwords)
  INTAKE_EMAIL          shown as From in replies (same as IMAP_USER usually)

Pinakio detection (comma-separated, case-insensitive substrings):
  PINAKIO_SENDER_KEYWORDS   default: syllogos,dikigoros,bar association,δικηγορικός
  PINAKIO_SUBJECT_KEYWORDS  default: πινάκιο,πινακιο,pinakio,δικάσιμος,δικασιμ,πινάκ

Telegram notifications (optional):
  TELEGRAM_BOT_TOKEN    already set — pinakio alerts forwarded to allowed chats
  TELEGRAM_ALLOWED_CHATS  comma-separated chat IDs
"""

import os
import asyncio
import email
import imaplib
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone

logger = logging.getLogger("nomos_one")

IMAP_HOST = os.getenv("INTAKE_IMAP_HOST", "")
IMAP_PORT = int(os.getenv("INTAKE_IMAP_PORT", "993"))
IMAP_USER = os.getenv("INTAKE_IMAP_USER", "")
IMAP_PASS = os.getenv("INTAKE_IMAP_PASS", "")
INTAKE_EMAIL = os.getenv("INTAKE_EMAIL", IMAP_USER)
POLL_INTERVAL = int(os.getenv("INTAKE_POLL_INTERVAL", "300"))  # 5 minutes

# Subject trigger for case intake. Email is processed only if subject contains this word.
# Default: "intake" — anyone who wants to submit a case sends with "intake" in the subject.
_INTAKE_SUBJECT_TRIGGER = os.getenv("INTAKE_SUBJECT_TRIGGER", "intake").strip().lower()

# Pinakio detection keywords
_PINAKIO_SENDERS = [
    k.strip().lower() for k in
    os.getenv("PINAKIO_SENDER_KEYWORDS",
              "syllogos,dikigoros,δικηγορικός,δικηγορικο,συλλογο,bar association,δ.σ.σ,d.s.s").split(",")
    if k.strip()
]
_PINAKIO_SUBJECTS = [
    k.strip().lower() for k in
    os.getenv("PINAKIO_SUBJECT_KEYWORDS",
              "πινάκιο,πινακιο,pinakio,δικάσιμος,δικασιμ,πινακ,ακροατήριο").split(",")
    if k.strip()
]

SUPPORTED_MIME = {
    "application/pdf": "application/pdf",
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/webp": "image/webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword": "application/msword",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel": "application/vnd.ms-excel",
}

# Extensions → mime fallback when Content-Type is missing/wrong
_EXT_MIME = {
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".pdf": "application/pdf",
}


def _is_allowed_intake_email(from_addr: str, subject: str) -> bool:
    """Return True if subject contains the intake trigger word."""
    if not _INTAKE_SUBJECT_TRIGGER:
        return False
    return _INTAKE_SUBJECT_TRIGGER in subject.lower()


def _is_pinakio_email(from_addr: str, subject: str, filenames: list[str]) -> bool:
    """Return True if this email looks like a court schedule."""
    from_lower = from_addr.lower()
    subj_lower = subject.lower()

    if any(kw in from_lower for kw in _PINAKIO_SENDERS):
        return True
    if any(kw in subj_lower for kw in _PINAKIO_SUBJECTS):
        return True
    # DOCX/XLSX attachments with court-related filenames
    for fn in filenames:
        fn_lower = fn.lower()
        if (fn_lower.endswith((".xlsx", ".xls", ".docx", ".doc")) and
                any(kw in fn_lower for kw in ["pinakio", "πινακ", "δικ", "dikas", "syllog"])):
            return True
    return False


def _fetch_unread_with_attachments() -> list[dict]:
    """Connect via IMAP SSL, fetch unread emails that have attachments."""
    if not all([IMAP_HOST, IMAP_USER, IMAP_PASS]):
        return []

    results = []
    try:
        mail = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
        mail.login(IMAP_USER, IMAP_PASS)
        mail.select("INBOX")

        _, msg_ids = mail.search(None, "UNSEEN")
        for mid in (msg_ids[0].split() if msg_ids[0] else []):
            try:
                _, data = mail.fetch(mid, "(RFC822)")
                raw = data[0][1]
                msg = email.message_from_bytes(raw)
            except Exception as fetch_err:
                logger.warning(f"Skipping email {mid}: fetch/parse error: {fetch_err}")
                continue

            from_addr = email.utils.parseaddr(msg.get("From", ""))[1]
            subject = msg.get("Subject", "(χωρίς θέμα)")
            # Decode encoded subject — guard against unknown-8bit and other bad charsets
            from email.header import decode_header
            decoded_parts = decode_header(subject)
            subject = ""
            for part, enc in decoded_parts:
                if isinstance(part, bytes):
                    charset = enc or "utf-8"
                    if charset.lower() in ("unknown-8bit", "unknown"):
                        charset = "latin-1"
                    subject += part.decode(charset, errors="replace")
                else:
                    subject += part

            attachments = []
            for part in msg.walk():
                ct = part.get_content_type()
                cd = part.get("Content-Disposition", "")
                fn = part.get_filename() or ""
                if fn:
                    from email.header import decode_header
                    fn_parts = decode_header(fn)
                    fn = ""
                    for p, enc in fn_parts:
                        if isinstance(p, bytes):
                            charset = enc or "utf-8"
                            if charset.lower() in ("unknown-8bit", "unknown"):
                                charset = "latin-1"
                            fn += p.decode(charset, errors="replace")
                        else:
                            fn += p

                # Resolve mime type: prefer Content-Type, fall back to extension
                ext = "." + fn.rsplit(".", 1)[-1].lower() if "." in fn else ""
                resolved_mime = SUPPORTED_MIME.get(ct) or _EXT_MIME.get(ext)

                if resolved_mime and ("attachment" in cd or fn):
                    try:
                        payload = part.get_payload(decode=True)
                    except Exception as enc_err:
                        logger.warning(f"Skipping attachment {fn}: payload decode error: {enc_err}")
                        payload = None
                    if payload:
                        attachments.append({
                            "filename": fn or f"attachment{ext or '.pdf'}",
                            "media_type": resolved_mime,
                            "data": payload,
                        })

            # Mark as Seen immediately — prevents reprocessing even if subsequent steps fail
            try:
                mail.store(mid, "+FLAGS", "\\Seen")
            except Exception:
                pass

            if attachments:
                results.append({
                    "uid": mid,
                    "from": from_addr,
                    "subject": subject,
                    "attachments": attachments,
                    "filenames": [a["filename"] for a in attachments],
                })

        mail.logout()
    except Exception as e:
        logger.error(f"IMAP fetch error: {e}")

    return results


def _send_reply(to_addr: str, subject: str, body: str):
    smtp_host = os.getenv("SMTP_HOST", "smtp-relay.brevo.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    from_email = os.getenv("SMTP_FROM", INTAKE_EMAIL)
    from_name = os.getenv("SMTP_FROM_NAME", "Nomos One")

    if not smtp_user or not smtp_pass:
        logger.warning("SMTP not configured — skipping reply")
        return

    msg = MIMEMultipart("alternative")
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_addr
    msg["Subject"] = f"Re: {subject}"
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as s:
            s.starttls()
            s.login(smtp_user, smtp_pass)
            s.send_message(msg)
    except Exception as e:
        logger.error(f"SMTP reply error: {e}")


async def _notify_telegram(db, pinakio_doc: dict):
    """Send a Telegram notification to all authorized chats when a pinakio arrives by email."""
    import httpx
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    allowed_raw = os.getenv("TELEGRAM_ALLOWED_CHATS", "")
    if not bot_token:
        return

    court = pinakio_doc.get("court_name", "—")
    date = pinakio_doc.get("hearing_date", "—")
    count = pinakio_doc.get("hearing_count", 0)
    matches = pinakio_doc.get("match_count", 0)
    source_email = pinakio_doc.get("uploaded_by", "email")

    match_lines = []
    for h in pinakio_doc.get("hearings", []):
        if h.get("matched_case_id"):
            parties = ", ".join(h.get("parties", []))[:50]
            match_lines.append(
                f"  • #{h.get('aa','?')} {h.get('case_number','')} — {parties}\n"
                f"    ↳ *{h.get('matched_case_title','—')}*"
            )

    text = (
        f"📧 *Νέο Πινάκιο μέσω Email*\n\n"
        f"🏛 {court}\n"
        f"📅 {date}\n"
        f"📊 {count} υποθέσεις εντοπίστηκαν\n"
    )
    if match_lines:
        text += f"\n🎯 *{matches} match{'es' if matches > 1 else ''} με ανοιχτές υποθέσεις:*\n"
        text += "\n".join(match_lines[:5])
        if matches > 5:
            text += f"\n  _...και {matches-5} ακόμα_"
    else:
        text += "\nℹ️ Δεν βρέθηκαν matches με ανοιχτές υποθέσεις."
    text += f"\n\n_Πηγή: {source_email}_\n_Διαθέσιμο στο Nomos One → Πινάκια_"

    api_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"

    # Determine target chats
    if allowed_raw.strip():
        chat_ids = [int(x.strip()) for x in allowed_raw.split(",") if x.strip().lstrip("-").isdigit()]
    else:
        # Fall back to collecting all known chat IDs from recent sessions
        sessions = await db.telegram_sessions.find({}, {"chat_id": 1}).limit(20).to_list(20)
        chat_ids = list({s["chat_id"] for s in sessions if s.get("chat_id")})

    async with httpx.AsyncClient(timeout=10) as client:
        for chat_id in chat_ids:
            try:
                await client.post(api_url, json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": "Markdown",
                })
            except Exception as e:
                logger.warning(f"Telegram notify failed for {chat_id}: {e}")


async def _process_pinakio_email(db, api_key: str, item: dict):
    """Process a court-schedule email: extract pinakio from each attachment, store, notify via Telegram only."""
    from pinakia_service import extract_pinakio, match_hearings as match_pinakio_hearings

    for att in item["attachments"]:
        logger.info(f"Pinakio email: processing {att['filename']} ({att['media_type']}) from {item['from']}")
        try:
            extracted = extract_pinakio(api_key, att["data"], att["media_type"])
        except Exception as e:
            logger.error(f"Pinakio extraction error ({att['filename']}): {e}")
            continue

        hearings_raw = extracted.get("hearings") or []
        hearing_date = extracted.get("hearing_date") or datetime.now(timezone.utc).date().isoformat()
        court_name = extracted.get("court_name") or "Άγνωστο Δικαστήριο"

        hearings = await match_pinakio_hearings(db, hearings_raw)
        match_count = sum(1 for h in hearings if h.get("matched_case_id"))

        doc = {
            "court_name": court_name,
            "hearing_date": hearing_date,
            "file_name": att["filename"],
            "media_type": att["media_type"],
            "uploaded_at": datetime.now(timezone.utc),
            "uploaded_by": f"email:{item['from']}",
            "source": "email",
            "hearings": hearings,
            "hearing_count": len(hearings),
            "match_count": match_count,
        }
        result = await db.pinakia.insert_one(doc)
        doc["_id"] = str(result.inserted_id)

        logger.info(f"Pinakio stored: {court_name} {hearing_date} — {len(hearings)} hearings, {match_count} matches")
        # Internal notification only — Telegram to the firm
        await _notify_telegram(db, doc)


def _result_text(filename: str, result: dict) -> str:
    if "error" in result:
        return f"Σφάλμα για το αρχείο '{filename}': {result['error']}"
    client = result.get("client", {})
    case = result.get("case", {})
    lines = [
        f"Έγγραφο: {filename}",
        f"Πελάτης: {client.get('name', '—')} ({'υπάρχων' if client.get('existing') else 'νέος'})",
        f"Υπόθεση: {case.get('number', '—')} — {case.get('title', '—')}",
        f"Αξιοπιστία AI: {result.get('confidence', 'low')}",
    ]
    summary = result.get("summary", "")
    if summary:
        lines += ["", "Σύνοψη:", summary[:400]]
    lines += ["", "—", "Nomos One | Σκοτάνης & Συνεργάτες"]
    return "\n".join(lines)


async def _process_intake_email(db, api_key: str, model: str, item: dict):
    from intake_processor import process_intake_file

    reply_lines = [f"Αποτελέσματα intake για: {item['subject']}", ""]
    for att in item["attachments"]:
        result = await process_intake_file(
            db=db,
            file_bytes=att["data"],
            media_type=att["media_type"],
            filename=att["filename"],
            api_key=api_key,
            model=model,
            submitted_by=f"email:{item['from']}",
        )
        reply_lines.append(_result_text(att["filename"], result))
        reply_lines.append("")
    return "\n".join(reply_lines)


async def _process_email(db, api_key: str, model: str, item: dict):
    loop = asyncio.get_event_loop()

    if _is_pinakio_email(item["from"], item["subject"], item["filenames"]):
        logger.info(f"Email detected as PINAKIO from {item['from']}: {item['subject']}")
        # Pinakia: process silently — Telegram notification only, NO reply to the sender
        await _process_pinakio_email(db, api_key, item)
    elif _is_allowed_intake_email(item["from"], item["subject"]):
        logger.info(f"Email intake (standard) from {item['from']}: {item['subject']}")
        await _process_intake_email(db, api_key, model, item)
    else:
        logger.info(f"Email skipped (not pinakio, not whitelisted): {item['from']} — {item['subject']}")
        return

    logger.info(f"Email processed: {item['from']} — {len(item['attachments'])} attachment(s)")


async def email_intake_loop(db, api_key: str, model: str):
    """Background loop — runs forever, polls every POLL_INTERVAL seconds."""
    if not all([IMAP_HOST, IMAP_USER, IMAP_PASS]):
        logger.warning("Email intake disabled: INTAKE_IMAP_HOST/USER/PASS not set in .env")
        return

    logger.info(f"Email intake started: polling {IMAP_USER} every {POLL_INTERVAL}s")
    while True:
        try:
            loop = asyncio.get_event_loop()
            emails = await loop.run_in_executor(None, _fetch_unread_with_attachments)
            for item in emails:
                await _process_email(db, api_key, model, item)
        except Exception as e:
            logger.error(f"Email intake loop error: {e}")
        await asyncio.sleep(POLL_INTERVAL)
