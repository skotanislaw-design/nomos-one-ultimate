"""Google Drive — OAuth2 (personal account) + service account credentials storage"""
import json, logging, io, os, re
from pathlib import Path
from typing import Optional

logger = logging.getLogger("nomos_one.gdrive")

_STORE = Path(os.getenv("DOCUMENT_STORAGE_PATH", "/data/documents"))
CREDS_PATH   = _STORE / "gdrive_credentials.json"   # service account (for auth check)
OAUTH_PATH   = _STORE / "gdrive_oauth_client.json"  # OAuth client_id + secret
TOKEN_PATH   = _STORE / "gdrive_token.json"          # stored user access+refresh token
SETTINGS_PATH = _STORE / "gdrive_settings.json"


# ── Settings (root folder ID) ─────────────────────────────────────────────────

def _load_settings() -> dict:
    try: return json.loads(SETTINGS_PATH.read_bytes())
    except: return {}

def _save_settings(data: dict):
    SETTINGS_PATH.write_text(json.dumps(data))

def get_root_folder_id() -> Optional[str]:
    return _load_settings().get("root_folder_id")

def set_root_folder_id(folder_id: str):
    s = _load_settings(); s["root_folder_id"] = folder_id; _save_settings(s)
    logger.info(f"Drive root folder set: {folder_id}")


# ── OAuth client credentials ──────────────────────────────────────────────────

def save_oauth_client(json_bytes: bytes) -> bool:
    try:
        data = json.loads(json_bytes)
        web = data.get("web") or data.get("installed")
        assert web and "client_id" in web and "client_secret" in web
        OAUTH_PATH.write_bytes(json_bytes)
        logger.info(f"OAuth client saved: {web['client_id']}")
        return True
    except Exception as e:
        logger.error(f"Invalid OAuth JSON: {e}"); return False

def get_oauth_client() -> Optional[dict]:
    try:
        d = json.loads(OAUTH_PATH.read_bytes())
        return d.get("web") or d.get("installed")
    except: return None


# ── OAuth flow ────────────────────────────────────────────────────────────────

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
REDIRECT_URI = os.getenv("GDRIVE_REDIRECT_URI",
    "https://nomos.skotanislaw.gr/api/integrations/gdrive/oauth/callback")

def get_auth_url() -> str:
    import urllib.parse, secrets
    client = get_oauth_client()
    if not client:
        raise RuntimeError("OAuth client not configured")
    params = {
        "client_id": client["client_id"],
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": secrets.token_urlsafe(16),
    }
    return "https://accounts.google.com/o/oauth2/auth?" + urllib.parse.urlencode(params)

def exchange_code(code: str, state: str = None) -> dict:
    import urllib.parse, urllib.request
    client = get_oauth_client()
    if not client:
        raise RuntimeError("OAuth client not configured")
    data = urllib.parse.urlencode({
        "client_id": client["client_id"],
        "client_secret": client["client_secret"],
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": REDIRECT_URI,
    }).encode()
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        token_data = json.loads(resp.read())
    if "access_token" not in token_data:
        raise RuntimeError(f"Token error: {token_data}")
    TOKEN_PATH.write_text(json.dumps({
        "token": token_data.get("access_token"),
        "refresh_token": token_data.get("refresh_token"),
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": client["client_id"],
        "client_secret": client["client_secret"],
        "scopes": SCOPES,
    }))
    logger.info("OAuth token stored")
    return token_data
    creds = flow.credentials
    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes),
    }
    TOKEN_PATH.write_text(json.dumps(token_data))
    logger.info("OAuth token stored")
    return token_data

def _get_oauth_creds():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    if not TOKEN_PATH.exists():
        raise RuntimeError("Not authorized. Visit /api/integrations/gdrive/oauth/start")
    data = json.loads(TOKEN_PATH.read_bytes())
    creds = Credentials(
        token=data.get("token"),
        refresh_token=data.get("refresh_token"),
        token_uri=data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=data.get("client_id"),
        client_secret=data.get("client_secret"),
        scopes=data.get("scopes", SCOPES),
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        data["token"] = creds.token
        TOKEN_PATH.write_text(json.dumps(data))
    return creds


# ── Drive operations ──────────────────────────────────────────────────────────

def is_configured() -> bool:
    return TOKEN_PATH.exists() and get_root_folder_id() is not None

def is_oauth_client_ready() -> bool:
    return OAUTH_PATH.exists()

def _get_service():
    from googleapiclient.discovery import build
    return build("drive", "v3", credentials=_get_oauth_creds(), cache_discovery=False)

def _get_or_create_folder(service, name: str, parent_id: str) -> str:
    q = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and '{parent_id}' in parents and trashed=false"
    results = service.files().list(q=q, fields="files(id,name)").execute()
    files = results.get("files", [])
    if files: return files[0]["id"]
    body = {"name": name, "mimeType": "application/vnd.google-apps.folder", "parents": [parent_id]}
    f = service.files().create(body=body, fields="id").execute()
    return f["id"]

def upload_document(file_bytes: bytes, filename: str, mime_type: str,
                    year: str, client_name: str, case_folder: str) -> dict:
    from googleapiclient.http import MediaIoBaseUpload
    root_id = get_root_folder_id()
    if not root_id:
        raise RuntimeError("Drive root folder not configured")
    service = _get_service()
    year_id   = _get_or_create_folder(service, year, root_id)
    client_id = _get_or_create_folder(service, client_name[:50], year_id)
    case_id   = _get_or_create_folder(service, case_folder[:80], client_id)
    media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mime_type, resumable=True)
    uploaded = service.files().create(
        body={"name": filename, "parents": [case_id]},
        media_body=media, fields="id,webViewLink"
    ).execute()
    return {
        "file_id": uploaded["id"],
        "web_link": uploaded.get("webViewLink", ""),
        "folder_link": f"https://drive.google.com/drive/folders/{case_id}",
    }

# Keep for status display
def get_service_account_email() -> Optional[str]:
    try: return json.loads(CREDS_PATH.read_bytes()).get("client_email")
    except: return None

def save_credentials(json_bytes: bytes) -> bool:
    try:
        data = json.loads(json_bytes)
        assert data.get("type") == "service_account" and "client_email" in data
        CREDS_PATH.write_bytes(json_bytes); return True
    except Exception as e:
        logger.error(f"Invalid SA creds: {e}"); return False
