"""
Email Service for Nomos One Portal
Handles all email notifications for portal operations
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional, List
from dataclasses import dataclass
import asyncio
from functools import lru_cache

# Email Configuration
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@skotanislaw.com")
FROM_NAME = os.getenv("FROM_NAME", "Σκοτάνης & Συνεργάτες")

# Email templates
TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "email_templates")


@dataclass
class EmailRecipient:
    """Email recipient info"""
    email: str
    name: str
    language: str = "el"  # Greek by default


def get_email_template(template_name: str, language: str = "el") -> str:
    """
    Load email template from file

    Args:
        template_name: Name of template (e.g., 'portal_code')
        language: Language code (el, en)

    Returns:
        Template HTML content
    """
    template_path = os.path.join(TEMPLATES_DIR, f"{template_name}_{language}.html")
    if not os.path.exists(template_path):
        # Fallback to Greek
        template_path = os.path.join(TEMPLATES_DIR, f"{template_name}_el.html")

    if os.path.exists(template_path):
        with open(template_path, 'r', encoding='utf-8') as f:
            return f.read()

    return ""


async def send_email_async(
    to_email: str,
    to_name: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    reply_to: Optional[str] = None
) -> bool:
    """
    Send email asynchronously using thread pool

    Args:
        to_email: Recipient email
        to_name: Recipient name
        subject: Email subject
        html_content: HTML email body
        text_content: Plain text fallback
        reply_to: Reply-to email address

    Returns:
        True if successful, False otherwise
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        send_email_sync,
        to_email,
        to_name,
        subject,
        html_content,
        text_content,
        reply_to
    )


def send_email_sync(
    to_email: str,
    to_name: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    reply_to: Optional[str] = None
) -> bool:
    """
    Send email synchronously

    Args:
        to_email: Recipient email
        to_name: Recipient name
        subject: Email subject
        html_content: HTML email body
        text_content: Plain text fallback
        reply_to: Reply-to email address

    Returns:
        True if successful, False otherwise
    """
    if not SMTP_USER or not SMTP_PASSWORD:
        print(f"Email service not configured. Skipping email to {to_email}")
        return False

    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['From'] = f"{FROM_NAME} <{FROM_EMAIL}>"
        msg['To'] = f"{to_name} <{to_email}>"
        msg['Subject'] = subject
        msg['Date'] = datetime.now().strftime("%a, %d %b %Y %H:%M:%S %z")

        if reply_to:
            msg['Reply-To'] = reply_to

        # Add text part
        if text_content:
            msg.attach(MIMEText(text_content, 'plain', 'utf-8'))

        # Add HTML part
        msg.attach(MIMEText(html_content, 'html', 'utf-8'))

        # Connect and send
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)

        return True

    except Exception as e:
        print(f"Error sending email to {to_email}: {str(e)}")
        return False


# ═══════════════════════════════════════════════════════════════
# Portal Email Templates
# ═══════════════════════════════════════════════════════════════

def create_portal_code_email(
    client_name: str,
    case_title: str,
    portal_code: str,
    case_category: str
) -> tuple[str, str]:
    """
    Generate portal code email (HTML and plain text)

    Returns:
        (html_content, text_content)
    """
    html = f"""
    <html dir="rtl">
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; direction: rtl; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #C6A75E; padding: 20px; text-align: center; }}
            .header h1 {{ color: #071220; margin: 0; }}
            .content {{ background-color: #f5f5f5; padding: 20px; }}
            .code-box {{
                background-color: #071220;
                color: #C6A75E;
                padding: 20px;
                text-align: center;
                border-radius: 5px;
                font-size: 24px;
                font-weight: bold;
                font-family: monospace;
                margin: 20px 0;
                letter-spacing: 2px;
            }}
            .footer {{ color: #666; font-size: 12px; text-align: center; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Πύλη Πελάτη - Nomos One</h1>
            </div>

            <div class="content">
                <p>Καλησπέρα {client_name},</p>

                <p>Έχετε λάβει ένα νέο κωδικό πρόσβασης για τη Πύλη Πελάτη του γραφείου μας,
                όπου μπορείτε να παρακολουθήσετε την πορεία της υπόθεσής σας:</p>

                <h3>Πληροφορίες Υπόθεσης:</h3>
                <ul>
                    <li><strong>Τίτλος:</strong> {case_title}</li>
                    <li><strong>Κατηγορία:</strong> {case_category}</li>
                </ul>

                <h3>Κωδικός Πρόσβασης:</h3>
                <div class="code-box">{portal_code}</div>

                <p><strong>Πώς να συνδεθείτε:</strong></p>
                <ol>
                    <li>Επισκεφθείτε την ιστοσελίδα μας: <a href="https://nomos.skotanislaw.com/portal/login">Portal Login</a></li>
                    <li>Εισάγετε το όνομά σας</li>
                    <li>Επιλέξτε την κατηγορία της υπόθεσης: {case_category}</li>
                    <li>Εισάγετε τον κωδικό πρόσβασης: <strong>{portal_code}</strong></li>
                </ol>

                <p><strong>Τι μπορείτε να κάνετε στη Πύλη:</strong></p>
                <ul>
                    <li>✓ Προβολή στοιχείων της υπόθεσής σας</li>
                    <li>✓ Επικοινωνία με το δικηγόρο σας</li>
                    <li>✓ Ανέβασμα εγγράφων</li>
                    <li>✓ Παρακολούθηση της προόδου</li>
                </ul>

                <p><strong>Σημαντικό:</strong> Μην μοιράστε αυτόν τον κωδικό με κανέναν. Είναι προσωπικός και διαθέσιμος μόνο για εσάς.</p>

                <p>Εάν έχετε ερωτήσεις ή αντιμετωπίσετε προβλήματα, παρακαλώ επικοινωνήστε μαζί μας.</p>

                <p>Φιλικά,<br>
                <strong>Σκοτάνης & Συνεργάτες</strong></p>
            </div>

            <div class="footer">
                <p>Αυτό είναι ένα αυτόματο μήνυμα, παρακαλώ μην απαντήσετε απευθείας σε αυτό το email.</p>
                <p>© 2026 Σκοτάνης & Συνεργάτες - Εμπιστευτική Πλατφόρμα Νομικών Λειτουργιών</p>
            </div>
        </div>
    </body>
    </html>
    """

    text = f"""
    Πύλη Πελάτη - Nomos One

    Καλησπέρα {client_name},

    Έχετε λάβει ένα νέο κωδικό πρόσβασης για τη Πύλη Πελάτη του γραφείου μας.

    ΠΛΗΡΟΦΟΡΙΕΣ ΥΠΟΘΕΣΗΣ:
    Τίτλος: {case_title}
    Κατηγορία: {case_category}

    ΚΩΔΙΚΟΣ ΠΡΟΣΒΑΣΗΣ: {portal_code}

    Επισκεφθείτε: https://nomos.skotanislaw.com/portal/login

    Σημαντικό: Μην μοιράστε αυτόν τον κωδικό με κανέναν.

    Σκοτάνης & Συνεργάτες
    """

    return html.strip(), text.strip()


def create_message_notification_email(
    lawyer_name: str,
    client_name: str,
    case_title: str,
    message_subject: str,
    message_preview: str
) -> tuple[str, str]:
    """Generate message notification email"""

    html = f"""
    <html dir="rtl">
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; direction: rtl; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #C6A75E; padding: 20px; text-align: center; }}
            .header h2 {{ color: #071220; margin: 0; }}
            .alert {{ background-color: #e8f4f8; border-left: 4px solid #C6A75E; padding: 15px; }}
            .message-box {{
                background-color: #f9f9f9;
                border: 1px solid #ddd;
                padding: 15px;
                margin: 15px 0;
                border-radius: 5px;
            }}
            .footer {{ color: #666; font-size: 12px; text-align: center; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>📧 Νέο Μήνυμα από Πελάτη</h2>
            </div>

            <div class="alert">
                <strong>Ειδοποίηση:</strong> Ο πελάτης {client_name} έστειλε νέο μήνυμα σχετικά με την υπόθεση "{case_title}".
            </div>

            <div>
                <p>Καλησπέρα {lawyer_name},</p>

                <p>Έχετε λάβει νέο μήνυμα μέσω της Πύλης Πελάτη:</p>

                <h3>Θέμα: {message_subject}</h3>

                <div class="message-box">
                    <p><strong>Από:</strong> {client_name}</p>
                    <p><strong>Υπόθεση:</strong> {case_title}</p>
                    <p><strong>Ημερομηνία:</strong> {datetime.now().strftime("%d/%m/%Y %H:%M")}</p>
                    <hr>
                    <p>{message_preview}</p>
                </div>

                <p><a href="https://nomos.skotanislaw.com/dashboard">Επιστροφή στο Dashboard</a> για πλήρη απάντηση.</p>

                <p>Σκοτάνης & Συνεργάτες</p>
            </div>

            <div class="footer">
                <p>© 2026 Σκοτάνης & Συνεργάτες</p>
            </div>
        </div>
    </body>
    </html>
    """

    text = f"""
    Νέο Μήνυμα από Πελάτη

    Καλησπέρα {lawyer_name},

    Ο πελάτης {client_name} έστειλε νέο μήνυμα για την υπόθεση: {case_title}

    ΘΕΜΑ: {message_subject}
    ΗΜΕΡΟΜΗΝΙΑ: {datetime.now().strftime("%d/%m/%Y %H:%M")}

    ΜΗΝΥΜΑ:
    {message_preview}

    Επισκεφθείτε: https://nomos.skotanislaw.com/dashboard

    Σκοτάνης & Συνεργάτες
    """

    return html.strip(), text.strip()


def create_document_upload_email(
    lawyer_name: str,
    client_name: str,
    case_title: str,
    filename: str,
    file_size_mb: float
) -> tuple[str, str]:
    """Generate document upload notification email"""

    html = f"""
    <html dir="rtl">
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; direction: rtl; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #C6A75E; padding: 20px; text-align: center; }}
            .header h2 {{ color: #071220; margin: 0; }}
            .alert {{ background-color: #e8f4f8; border-left: 4px solid #C6A75E; padding: 15px; }}
            .doc-box {{
                background-color: #f9f9f9;
                border: 1px solid #ddd;
                padding: 15px;
                margin: 15px 0;
                border-radius: 5px;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>📄 Νέο Έγγραφο ανεβάστηκε</h2>
            </div>

            <div class="alert">
                <strong>Ειδοποίηση:</strong> Ο πελάτης {client_name} ανέβασε νέο έγγραφο για την υπόθεση "{case_title}".
            </div>

            <div class="doc-box">
                <p><strong>Όνομα Αρχείου:</strong> {filename}</p>
                <p><strong>Μέγεθος:</strong> {file_size_mb:.2f} MB</p>
                <p><strong>Πελάτης:</strong> {client_name}</p>
                <p><strong>Υπόθεση:</strong> {case_title}</p>
                <p><strong>Ημερομηνία:</strong> {datetime.now().strftime("%d/%m/%Y %H:%M")}</p>
            </div>

            <p>Επισκεφθείτε το <a href="https://nomos.skotanislaw.com/dashboard">Dashboard</a> για να δείτε το έγγραφο.</p>

            <p>Σκοτάνης & Συνεργάτες</p>
        </div>
    </body>
    </html>
    """

    text = f"""
    Νέο Έγγραφο ανεβάστηκε

    Καλησπέρα {lawyer_name},

    Ο πελάτης {client_name} ανέβασε νέο έγγραφο για την υπόθεση: {case_title}

    ΌΝΟΜΑ ΑΡΧΕΙΟΥ: {filename}
    ΜΕΓΕΘΟΣ: {file_size_mb:.2f} MB
    ΗΜΕΡΟΜΗΝΙΑ: {datetime.now().strftime("%d/%m/%Y %H:%M")}

    Επισκεφθείτε: https://nomos.skotanislaw.com/dashboard

    Σκοτάνης & Συνεργάτες
    """

    return html.strip(), text.strip()


def create_password_reset_email(
    client_name: str,
    reset_link: str,
    expires_hours: int = 24
) -> tuple[str, str]:
    """Generate password reset email"""

    html = f"""
    <html dir="rtl">
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; direction: rtl; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #C6A75E; padding: 20px; text-align: center; }}
            .header h1 {{ color: #071220; margin: 0; }}
            .button {{
                display: inline-block;
                background-color: #C6A75E;
                color: #071220;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 5px;
                font-weight: bold;
                margin: 20px 0;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Επαναφορά Κωδικού Πρόσβασης</h1>
            </div>

            <p>Καλησπέρα {client_name},</p>

            <p>Λάβαμε αίτημα επαναφοράς του κωδικού πρόσβασής σας. Εάν δεν κάνατε αυτό το αίτημα,
            παρακαλώ αγνοήστε αυτό το email.</p>

            <p>Για να επαναφέρετε τον κωδικό σας, κάντε κλικ στον παρακάτω σύνδεσμο:</p>

            <a href="{reset_link}" class="button">Επαναφορά Κωδικού</a>

            <p><strong>Σημαντικό:</strong> Ο σύνδεσμος αυτός ισχύει για {expires_hours} ώρες.</p>

            <p>Εάν δεν μπορείτε να κάνετε κλικ στον σύνδεσμο, αντιγράψτε και επικολλήστε αυτή τη διεύθυνση
            στο περιηγητή σας:</p>

            <p style="word-break: break-all; color: #666;">{reset_link}</p>

            <p>Σκοτάνης & Συνεργάτες</p>
        </div>
    </body>
    </html>
    """

    text = f"""
    Επαναφορά Κωδικού Πρόσβασης

    Καλησπέρα {client_name},

    Λάβαμε αίτημα επαναφοράς του κωδικού πρόσβασής σας.

    Για να επαναφέρετε τον κωδικό σας, επισκεφθείτε:
    {reset_link}

    Ο σύνδεσμος ισχύει για {expires_hours} ώρες.

    Εάν δεν κάνατε αυτό το αίτημα, παρακαλώ αγνοήστε αυτό το email.

    Σκοτάνης & Συνεργάτες
    """

    return html.strip(), text.strip()


# ═══════════════════════════════════════════════════════════════
# Email Sending Functions
# ═══════════════════════════════════════════════════════════════

async def send_portal_code_email(
    client_email: str,
    client_name: str,
    case_title: str,
    portal_code: str,
    case_category: str
) -> bool:
    """Send portal access code to client"""
    html, text = create_portal_code_email(client_name, case_title, portal_code, case_category)

    return await send_email_async(
        to_email=client_email,
        to_name=client_name,
        subject=f"Κωδικός Πρόσβασης Πύλης Πελάτη - {case_title}",
        html_content=html,
        text_content=text,
        reply_to=None
    )


async def send_message_notification_email(
    lawyer_email: str,
    lawyer_name: str,
    client_name: str,
    case_title: str,
    message_subject: str,
    message_preview: str
) -> bool:
    """Send message notification to lawyer"""
    html, text = create_message_notification_email(
        lawyer_name, client_name, case_title, message_subject, message_preview
    )

    return await send_email_async(
        to_email=lawyer_email,
        to_name=lawyer_name,
        subject=f"Νέο μήνυμα από {client_name}",
        html_content=html,
        text_content=text,
        reply_to=None
    )


async def send_document_upload_email(
    lawyer_email: str,
    lawyer_name: str,
    client_name: str,
    case_title: str,
    filename: str,
    file_size_mb: float
) -> bool:
    """Send document upload notification to lawyer"""
    html, text = create_document_upload_email(lawyer_name, client_name, case_title, filename, file_size_mb)

    return await send_email_async(
        to_email=lawyer_email,
        to_name=lawyer_name,
        subject=f"Νέο έγγραφο από {client_name}",
        html_content=html,
        text_content=text,
        reply_to=None
    )


async def send_password_reset_email(
    client_email: str,
    client_name: str,
    reset_link: str
) -> bool:
    """Send password reset link to client"""
    html, text = create_password_reset_email(client_name, reset_link)

    return await send_email_async(
        to_email=client_email,
        to_name=client_name,
        subject="Επαναφορά Κωδικού Πρόσβασης",
        html_content=html,
        text_content=text,
        reply_to=None
    )
