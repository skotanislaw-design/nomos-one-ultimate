"""
Email intake service for Nomos One.
Polls an IMAP inbox every 5 minutes for new emails with PDF/image attachments.
Runs AI extraction and creates client/case automatically.
Replies to the sender with the result.

Required .env vars:
  INTAKE_IMAP_HOST   e.g. imap.gmail.com or imap.brevo.com
  INTAKE_IMAP_PORT   default 993
  INTAKE_IMAP_USER   e.g. intake@skotanislaw.com
  INTAKE_IMAP_PASS   app password or IMAP password
  INTAKE_EMAIL       same as IMAP_USER (shown as From in replies)
"""

import os
import asyncio
import email
import imaplib
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

logger = logging.getLogger("nomos_one")

IMAP_HOST = os.getenv("INTAKE_IMAP_HOST", "")
IMAP_PORT = int(os.getenv("INTAKE_IMAP_PORT", "993"))
IMAP_USER = os.getenv("INTAKE_IMAP_USER", "")
IMAP_PASS = os.getenv("INTAKE_IMAP_PASS", "")
INTAKE_EMAIL = os.getenv("INTAKE_EMAIL", IMAP_USER)
POLL_INTERVAL = 300  # 5 minutes

SUPPORTED_MIME = {
    "application/pdf": "application/pdf",
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/webp": "image/webp",
}


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
            _, data = mail.fetch(mid, "(RFC822)")
            raw = data[0][1]
            msg = email.message_from_bytes(raw)

            from_addr = email.utils.parseaddr(msg.get("From", ""))[1]
            subject = msg.get("Subject", "(χωρίς θέμα)")

            attachments = []
            for part in msg.walk():
                ct = part.get_content_type()
                cd = part.get("Content-Disposition", "")
                if "attachment" in cd or ct in SUPPORTED_MIME:
                    payload = part.get_payload(decode=True)
                    if payload:
                        attachments.append({
                            "filename": part.get_filename() or f"attachment.{ct.split('/')[-1]}",
                            "media_type": SUPPORTED_MIME.get(ct, ct),
                            "data": payload,
                        })

            if attachments:
                results.append({
                    "uid": mid,
                    "from": from_addr,
                    "subject": subject,
                    "attachments": attachments,
                })
                # Mark as seen so we don't process twice
                mail.store(mid, "+FLAGS", "\\Seen")

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


def _result_text(filename: str, result: dict) -> str:
    if "error" in result:
        return f"Σφάλμα για το αρχείο '{filename}': {result['error']}"

    client = result.get("client", {})
    case = result.get("case", {})
    confidence = result.get("confidence", "low")
    summary = result.get("summary", "")

    lines = [
        f"Το έγγραφο '{filename}' επεξεργάστηκε επιτυχώς.",
        "",
        f"Πελάτης: {client.get('name', '—')} ({'υπάρχων' if client.get('existing') else 'νέος'})",
        f"Υπόθεση: {case.get('number', '—')} — {case.get('title', '—')}",
        f"Αξιοπιστία AI: {confidence}",
    ]
    if summary:
        lines += ["", "Σύνοψη:", summary[:400]]

    lines += ["", "—", "Nomos One | Σκοτάνης & Συνεργάτες"]
    return "\n".join(lines)


async def _process_email(db, api_key: str, model: str, item: dict):
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

    body = "\n".join(reply_lines)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send_reply, item["from"], item["subject"], body)
    logger.info(f"Email intake processed: {item['from']} — {len(item['attachments'])} attachment(s)")


async def email_intake_loop(db, api_key: str, model: str):
    """Background loop — runs forever, polls every POLL_INTERVAL seconds."""
    if not all([IMAP_HOST, IMAP_USER, IMAP_PASS]):
        logger.warning("Email intake disabled: INTAKE_IMAP_HOST/USER/PASS not set")
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
