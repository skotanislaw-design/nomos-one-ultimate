"""
Consent Service for Chatbot System
Manages privacy agreements, consent records, and GDPR compliance
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import logging
from models_chatbot import ConsentRecord, ConsentType, GDPRCompliance
from encryption_service import hash_data, encrypt_data, decrypt_data
import json

logger = logging.getLogger("consent_service")


# ═══════════════════════════════════════════════════════════════
# CONSENT TEMPLATES
# ═══════════════════════════════════════════════════════════════

CONSENT_TEMPLATES = {
    ConsentType.DATA_COLLECTION: {
        "el": """
ΣΥΜΦΩΝΙΑ ΣΥΛΛΟΓΗΣ & ΕΠΕΞΕΡΓΑΣΙΑΣ ΔΕΔΟΜΕΝΩΝ
═══════════════════════════════════════════════════════════════

Το σύστημα Nomos One θα συλλέξει τα ακόλουθα δεδομένα:
• Αποτελέσματα συνομιλίας με το chatbot
• Εξάγωγη δεδομένων από τις απαντήσεις σας
• Χρόνους και χρονικές σημάνσεις

Τα δεδομένα αυτά θα:
✓ Κρυπτογραφούνται κατά τη διαδρομή και στη αποθήκευση
✓ Υπόκεινται στο απόρρητο δικηγόρου-εντολέα
✓ Είναι προσβάσιμα μόνο από τον δικηγόρο της υπόθεσής σας
✓ Διατηρούνται για τη διάρκεια της υπόθεσης + 7 χρόνια

Τα δεδομένα σας δεν θα:
✗ Κοινοποιηθούν σε τρίτους χωρίς συναίνεσή σας
✗ Χρησιμοποιηθούν για άλλους σκοπούς
✗ Μεταφερθούν έξω από την ΕΕ

GDPR ΔΙΚΑΙΩΜΑΤΑ:
• Δικαίωμα Πρόσβασης: Μπορείτε να ζητήσετε αντίγραφο των δεδομένων σας
• Δικαίωμα Διόρθωσης: Μπορείτε να διορθώσετε ανακρίβειες
• Δικαίωμα Διαγραφής: Μπορείτε να ζητήσετε διαγραφή (υπό όρους)
• Δικαίωμα Προσφυγής: Έχετε δικαίωμα προσφυγής στη Αρχή Προστασίας Δεδομένων

Με την αποδοχή αυτής της συμφωνίας, επιβεβαιώνετε ότι:
☐ Κατανοώ και συμφωνώ με την επεξεργασία των δεδομένων μου
☐ Κατανοώ τα δικαιώματά μου βάσει του GDPR
☐ Έχω διαβάσει και αποδέχομαι τους όρους της συμφωνίας

Ημερομηνία: {date}
Διευθυνση IP: {ip}
""",
        "en": """
DATA COLLECTION & PROCESSING AGREEMENT
═══════════════════════════════════════════════════════════════

The Nomos One system will collect the following data:
• Chatbot conversation results
• Data extracted from your answers
• Timestamps and interaction times

This data will:
✓ Be encrypted in transit and at rest
✓ Be subject to attorney-client privilege
✓ Be accessible only to your assigned lawyer
✓ Be retained for the case duration + 7 years

Your data will NOT:
✗ Be shared with third parties without your consent
✗ Be used for other purposes
✗ Be transferred outside the EU

GDPR RIGHTS:
• Right of Access: You can request a copy of your data
• Right to Rectification: You can correct inaccuracies
• Right to Erasure: You can request deletion (under conditions)
• Right to Appeal: You have the right to appeal to the Data Protection Authority

By accepting this agreement, you confirm that:
☐ I understand and agree with the processing of my data
☐ I understand my rights under GDPR
☐ I have read and accept the terms of this agreement

Date: {date}
IP Address: {ip}
"""
    },
    ConsentType.VOICE_RECORDING: {
        "el": """
ΣΥΜΦΩΝΙΑ ΦΩΝΗΤΙΚΗΣ ΚΑΤΑΓΡΑΦΗΣ
═══════════════════════════════════════════════════════════════

Το chatbot θα καταγράψει και μεταγράψει τη φωνή σας για:
• Μετατροπή σε κείμενο (Speech-to-Text)
• Συλλογή πληροφοριών για την υπόθεσή σας
• Αναφορά στον δικηγόρό σας

Η καταγραφή θα:
✓ Κρυπτογραφούνται αμέσως
✓ Υπόκεινται στο απόρρητο δικηγόρου-εντολέα
✓ Διαγραφούν αν δεν εγκριθούν από τον δικηγόρο σας
✓ Αποθηκεύονται με ασφάλεια εάν εγκριθούν

Δεν θα:
✗ Ακουστούν ή προσπελαστούν από κανέναν άλλον
✗ Χρησιμοποιηθούν για άλλους σκοπούς
✗ Κοινοποιηθούν χωρίς συναίνεσή σας

ΑΝΆΚΛΗΣΗ ΣΥΝΑΊΝΕΣΗΣ:
Μπορείτε να ανακαλέσετε αυτήν τη συναίνεση οποιαδήποτε στιγμή
επικοινωνώντας με τον δικηγόρό σας.

Με την αποδοχή, επιβεβαιώνετε ότι:
☐ Συμφωνώ με τη φωνητική καταγραφή
☐ Κατανοώ ότι η καταγραφή κρυπτογραφείται και προστατεύεται

Ημερομηνία: {date}
""",
        "en": """
VOICE RECORDING AGREEMENT
═══════════════════════════════════════════════════════════════

The chatbot will record and transcribe your voice for:
• Voice-to-text conversion
• Information collection about your case
• Reporting to your lawyer

The recording will:
✓ Be encrypted immediately
✓ Be subject to attorney-client privilege
✓ Be deleted if not approved by your lawyer
✓ Be stored securely if approved

It will NOT:
✗ Be heard or accessed by anyone else
✗ Be used for other purposes
✗ Be shared without your consent

REVOCATION OF CONSENT:
You can revoke this consent at any time by contacting your lawyer.

By accepting, you confirm that:
☐ I agree to voice recording
☐ I understand the recording is encrypted and protected

Date: {date}
"""
    }
}


# ═══════════════════════════════════════════════════════════════
# CONSENT SERVICE
# ═══════════════════════════════════════════════════════════════

class ConsentService:
    """Manages consent agreements and GDPR compliance"""

    def __init__(self, db=None):
        self.db = db

    async def create_consent_record(
        self,
        case_id: str,
        client_id: str,
        consent_type: ConsentType,
        language: str = "el",
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create consent record with agreement text

        Args:
            case_id: Case ID
            client_id: Client ID
            consent_type: Type of consent (data_collection, voice_recording, both)
            language: Language for agreement ("el" or "en")
            ip_address: Client IP address
            user_agent: Client user agent

        Returns:
            Consent record with agreement text and ID
        """
        try:
            # Get agreement text
            agreement_text = self._get_agreement_text(consent_type, language, ip_address)

            # Create consent record
            consent_record = ConsentRecord(
                case_id=case_id,
                client_id=client_id,
                consent_type=consent_type,
                agreement_text=agreement_text,
                accepted=False,
                ip_address=ip_address,
                user_agent=user_agent,
                gdpr_compliance=GDPRCompliance()
            )

            # Save to database
            if self.db:
                result = await self.db.consent_records.insert_one(consent_record.dict())
                consent_record._id = str(result.inserted_id)

            logger.info(f"Consent record created: {consent_record._id}")
            return {
                "consent_id": str(consent_record._id) if consent_record._id else None,
                "consent_type": consent_type.value,
                "agreement_text": agreement_text,
                "status": "pending"
            }

        except Exception as e:
            logger.error(f"Failed to create consent record: {str(e)}")
            raise

    async def accept_consent(
        self,
        consent_id: str,
        ip_address: str,
        user_agent: str,
        gdpr_acknowledgements: Dict[str, bool]
    ) -> bool:
        """
        Record consent acceptance

        Args:
            consent_id: Consent record ID
            ip_address: Client IP that accepted
            user_agent: Client user agent
            gdpr_acknowledgements: Dict of GDPR checkbox states

        Returns:
            True if acceptance recorded successfully
        """
        try:
            # Update consent record
            if self.db:
                update_result = await self.db.consent_records.update_one(
                    {"_id": consent_id},
                    {
                        "$set": {
                            "accepted": True,
                            "accepted_at": datetime.utcnow(),
                            "ip_address": ip_address,
                            "user_agent": user_agent,
                            "gdpr_compliance": {
                                "acknowledged_data_processing": gdpr_acknowledgements.get("data_processing", False),
                                "acknowledged_retention": gdpr_acknowledgements.get("retention", False),
                                "acknowledged_rights": gdpr_acknowledgements.get("rights", False)
                            }
                        }
                    }
                )

                if update_result.matched_count == 0:
                    raise ValueError(f"Consent record not found: {consent_id}")

            logger.info(f"Consent accepted: {consent_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to accept consent: {str(e)}")
            raise

    async def validate_consent(
        self,
        case_id: str,
        client_id: str,
        required_consent: ConsentType
    ) -> bool:
        """
        Check if client has valid consent for operation

        Args:
            case_id: Case ID
            client_id: Client ID
            required_consent: Type of consent required

        Returns:
            True if valid consent exists
        """
        try:
            if not self.db:
                logger.warning("Database not configured, skipping consent validation")
                return False

            # Find consent record
            consent_record = await self.db.consent_records.find_one({
                "case_id": case_id,
                "client_id": client_id,
                "accepted": True,
                "revoked": False
            })

            if not consent_record:
                logger.warning(f"No valid consent found for {client_id}")
                return False

            # Check if specific consent type is included
            consent_type = ConsentType(consent_record.get("consent_type"))
            if required_consent == ConsentType.VOICE_RECORDING:
                return consent_type in [ConsentType.VOICE_RECORDING, ConsentType.BOTH]
            elif required_consent == ConsentType.DATA_COLLECTION:
                return consent_type in [ConsentType.DATA_COLLECTION, ConsentType.BOTH]

            return True

        except Exception as e:
            logger.error(f"Consent validation error: {str(e)}")
            return False

    async def revoke_consent(self, consent_id: str) -> bool:
        """
        Revoke consent agreement

        Args:
            consent_id: Consent record ID

        Returns:
            True if revocation successful
        """
        try:
            if self.db:
                result = await self.db.consent_records.update_one(
                    {"_id": consent_id},
                    {
                        "$set": {
                            "revoked": True,
                            "revoked_at": datetime.utcnow()
                        }
                    }
                )

                if result.matched_count == 0:
                    raise ValueError(f"Consent record not found: {consent_id}")

            logger.info(f"Consent revoked: {consent_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to revoke consent: {str(e)}")
            raise

    async def get_gdpr_compliance_status(self, case_id: str) -> Dict[str, Any]:
        """
        Get GDPR compliance status for case

        Args:
            case_id: Case ID

        Returns:
            Compliance status report
        """
        try:
            if not self.db:
                return {"status": "unknown", "reason": "Database not configured"}

            # Find all consent records for case
            consents = await self.db.consent_records.find(
                {"case_id": case_id}
            ).to_list(None)

            active_consents = [c for c in consents if c.get("accepted") and not c.get("revoked")]
            revoked_consents = [c for c in consents if c.get("revoked")]

            return {
                "case_id": case_id,
                "total_consents": len(consents),
                "active_consents": len(active_consents),
                "revoked_consents": len(revoked_consents),
                "consent_types": [c.get("consent_type") for c in active_consents],
                "gdpr_compliant": len(active_consents) > 0,
                "last_updated": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"Failed to get GDPR status: {str(e)}")
            return {"status": "error", "message": str(e)}

    async def get_consent_record(self, consent_id: str) -> Optional[Dict]:
        """Get specific consent record"""
        try:
            if not self.db:
                return None

            record = await self.db.consent_records.find_one({"_id": consent_id})
            return record

        except Exception as e:
            logger.error(f"Failed to get consent record: {str(e)}")
            return None

    def _get_agreement_text(
        self,
        consent_type: ConsentType,
        language: str = "el",
        ip_address: Optional[str] = None
    ) -> str:
        """Get agreement text from template"""
        template = CONSENT_TEMPLATES.get(consent_type, {}).get(language, "")

        # Substitute placeholders
        agreement = template.format(
            date=datetime.utcnow().strftime("%d/%m/%Y %H:%M"),
            ip=ip_address or "[IP]"
        )

        return agreement

    async def delete_consent_records(self, case_id: str, older_than_days: int = 90) -> int:
        """
        Delete old consent records (revoked or non-approved)

        Args:
            case_id: Case ID
            older_than_days: Delete records older than this many days

        Returns:
            Number of records deleted
        """
        try:
            if not self.db:
                return 0

            cutoff_date = datetime.utcnow() - timedelta(days=older_than_days)

            # Delete non-approved and revoked consents
            result = await self.db.consent_records.delete_many({
                "case_id": case_id,
                "created_at": {"$lt": cutoff_date},
                "$or": [
                    {"accepted": False},
                    {"revoked": True}
                ]
            })

            logger.info(f"Deleted {result.deleted_count} old consent records for case {case_id}")
            return result.deleted_count

        except Exception as e:
            logger.error(f"Failed to delete old consent records: {str(e)}")
            return 0


# ═══════════════════════════════════════════════════════════════
# GLOBAL INSTANCE
# ═══════════════════════════════════════════════════════════════

_consent_service: Optional[ConsentService] = None


def get_consent_service(db=None) -> ConsentService:
    """Get or create consent service instance"""
    global _consent_service
    if _consent_service is None:
        _consent_service = ConsentService(db)
    return _consent_service


# ═══════════════════════════════════════════════════════════════
# TEST
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import asyncio

    async def test_consent_service():
        print("Testing Consent Service...")
        print("=" * 60)

        # Create consent service (without DB for testing)
        service = ConsentService()

        # Test 1: Create consent record
        print("\n1. Creating consent record:")
        consent_result = await service.create_consent_record(
            case_id="case_123",
            client_id="client_456",
            consent_type=ConsentType.DATA_COLLECTION,
            language="el",
            ip_address="192.168.1.1"
        )
        print(f"   Consent ID: {consent_result['consent_id']}")
        print(f"   Type: {consent_result['consent_type']}")
        print("   ✓ Consent record created")

        # Test 2: Display agreement text
        print("\n2. Agreement text preview:")
        agreement = service._get_agreement_text(ConsentType.VOICE_RECORDING, "en")
        print(agreement[:200] + "...")
        print("   ✓ Agreement text generated")

        # Test 3: GDPR compliance check
        print("\n3. GDPR compliance status:")
        status = await service.get_gdpr_compliance_status("case_123")
        print(f"   Status: {status}")
        print("   ✓ Status check completed")

        print("\n" + "=" * 60)
        print("Consent service tests completed!")

    # Run tests
    asyncio.run(test_consent_service())
