"""Enhanced ai_service.py — adds full intake extraction"""

NEW_INTAKE_PROMPT = '''
Αναλύεις ελληνικό νομικό έγγραφο/δικόγραφο/δικογραφία.
Εξήγαγε ΟΛΑ τα διαθέσιμα στοιχεία και επέστρεψε ΜΟΝΟ έγκυρο JSON (χωρίς markdown):

{
  "document_type": "id_card|passport|summons|lawsuit|contract|indictment|correspondence|expense|other",
  "confidence": "high|medium|low",
  "summary": "Σύντομη περίληψη 2-4 προτάσεων στα ελληνικά",
  "key_facts": ["γεγονός 1", "γεγονός 2", "γεγονός 3"],
  "client": {
    "full_name": null,
    "father_name": null,
    "afm": null,
    "id_number": null,
    "birth_date": null,
    "address": null,
    "phone": null,
    "email": null,
    "nationality": null,
    "client_type": "individual|company|public|professional"
  },
  "case": {
    "title": null,
    "category": "ποινικό|αστικό|διοικητικό|εμπορικό|εργατικό|οικογενειακό|ακίνητα|φορολογικό",
    "court": null,
    "case_number": null,
    "opposing_party": null,
    "summary": null
  },
  "deadlines": [
    {"title": null, "due_date": null, "type": "hearing|filing|payment|other"}
  ],
  "extracted_fields": ["λίστα πεδίων που βρέθηκαν"],
  "missing_fields": ["λίστα πεδίων που ΔΕΝ βρέθηκαν"]
}

Κανόνες:
- Ημερομηνίες: μορφή YYYY-MM-DD
- confidence=high αν βρέθηκαν >70% πεδιών, medium αν 40-70%, low αν <40%
- extracted_fields: τα ονόματα των πεδίων που έχουν τιμή (όχι null)
- missing_fields: τα πεδία που είναι null
- Αν το έγγραφο έχει πολλά μέρη/συμβαλλόμενους, βάλε τον εναγόμενο/κατηγορούμενο ως client
'''


import re, json, base64, logging
from typing import Optional

logger = logging.getLogger("nomos_one.ai")

SYSTEM_PROMPT = (
    "Είσαι ειδικός στην ανάλυση ελληνικών νομικών εγγράφων. "
    "Εξάγεις δομημένα δεδομένα και επιστρέφεις ΜΟΝΟ έγκυρο JSON χωρίς markdown. "
    "Αφήνεις null όταν κάτι δεν αναφέρεται ρητά στο έγγραφο."
)

_COMMON_CLIENT = """{
    "full_name": null, "father_name": null, "afm": null, "id_number": null,
    "birth_date": null, "address": null, "phone": null, "email": null,
    "nationality": "Ελληνική", "client_type": "individual"
  }"""

_COMMON_CASE = """{
    "title": null, "category": null, "court": null,
    "case_number": null, "opposing_party": null, "summary": null
  }"""

PROMPTS = {
    "auto": (
        "Ανάλυσε το έγγραφο και επέστρεψε ΜΟΝΟ JSON:\n"
        "{\n"
        '  "document_type": "id_card|passport|summons|lawsuit|contract|indictment|correspondence|other",\n'
        '  "client": ' + _COMMON_CLIENT + ',\n'
        '  "case": ' + _COMMON_CASE + ',\n'
        '  "deadlines": [{"title": null, "due_date": null, "type": "hearing|filing|other"}]\n'
        "}"
    ),
    "id": (
        "Εξήγαγε στοιχεία ταυτότητας/διαβατηρίου. Επέστρεψε ΜΟΝΟ JSON:\n"
        "{\n"
        '  "document_type": "id_card",\n'
        '  "client": {\n'
        '    "full_name": null, "father_name": null, "afm": null,\n'
        '    "id_number": null, "birth_date": null, "address": null,\n'
        '    "nationality": null, "client_type": "individual"\n'
        '  },\n'
        '  "case": null, "deadlines": []\n'
        "}"
    ),
    "summons": (
        "Εξήγαγε στοιχεία από δικαστική κλήση ή αγωγή. Επέστρεψε ΜΟΝΟ JSON:\n"
        "{\n"
        '  "document_type": "summons",\n'
        '  "client": {"full_name": null, "afm": null, "address": null, "client_type": "individual"},\n'
        '  "case": {\n'
        '    "title": null,\n'
        '    "category": "ποινικό|αστικό|διοικητικό|εμπορικό|εργατικό|οικογενειακό|ακίνητα|φορολογικό",\n'
        '    "court": null, "case_number": null, "opposing_party": null, "summary": null\n'
        '  },\n'
        '  "deadlines": [{"title": null, "due_date": null, "type": "hearing|filing"}]\n'
        "}"
    ),
    "contract": (
        "Εξήγαγε στοιχεία από συμβόλαιο/συμφωνητικό. Επέστρεψε ΜΟΝΟ JSON:\n"
        "{\n"
        '  "document_type": "contract",\n'
        '  "client": {"full_name": null, "afm": null, "address": null, "client_type": "individual|company"},\n'
        '  "case": {"title": null, "category": "αστικό|εμπορικό|ακίνητα", "summary": null, "court": null, "case_number": null, "opposing_party": null},\n'
        '  "deadlines": []\n'
        "}"
    ),
    "indictment": (
        "Εξήγαγε στοιχεία από κατηγορητήριο ή δικογραφία. Επέστρεψε ΜΟΝΟ JSON:\n"
        "{\n"
        '  "document_type": "indictment",\n'
        '  "client": {"full_name": null, "father_name": null, "afm": null, "birth_date": null, "address": null, "client_type": "individual"},\n'
        '  "case": {\n'
        '    "title": null, "category": "ποινικό", "court": null,\n'
        '    "case_number": null, "opposing_party": "Εισαγγελία", "summary": null\n'
        '  },\n'
        '  "deadlines": [{"title": "Δικάσιμος", "due_date": null, "type": "hearing"}]\n'
        "}"
    ),
    "intake": NEW_INTAKE_PROMPT,
}


def _parse_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    m = re.search(r'\{.*\}', text, re.DOTALL)
    if m:
        return json.loads(m.group())
    raise ValueError("No JSON found in response")


def extract_document(api_key: str, file_bytes: bytes, media_type: str,
                     document_type: str = "auto") -> dict:
    import anthropic
    prompt = PROMPTS.get(document_type, PROMPTS["auto"])
    b64 = base64.standard_b64encode(file_bytes).decode()

    if media_type == "application/pdf":
        file_block = {
            "type": "document",
            "source": {"type": "base64", "media_type": "application/pdf", "data": b64}
        }
    else:
        if media_type not in {"image/jpeg", "image/png", "image/gif", "image/webp"}:
            media_type = "image/jpeg"
        file_block = {
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": b64}
        }

    client = anthropic.Anthropic(api_key=api_key)
    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=3000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": [
            file_block,
            {"type": "text", "text": prompt}
        ]}]
    )
    raw = resp.content[0].text
    logger.info(f"AI extract raw: {raw[:300]}")
    data = _parse_json(raw)
    data["_tokens"] = resp.usage.input_tokens + resp.usage.output_tokens
    return data


def intake_analyze(api_key: str, file_bytes: bytes, media_type: str) -> dict:
    """Full intake extraction with confidence, summary, key_facts, missing_fields."""
    return extract_document(api_key, file_bytes, media_type, "intake")
