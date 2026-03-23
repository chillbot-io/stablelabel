"""Built-in Sensitive Information Type (SIT) catalog.

Pre-packaged SIT definitions that users can pick from a dropdown and
associate with a sensitivity label — no manual rule building required.

Each entry mirrors a compliance/regulatory category (HIPAA, PCI, PII, etc.)
with full SIT-aligned rules: primary entity anchors, corroborative evidence
keywords, proximity windows, and confidence tiers.

The catalog is static (no DB table). Tenants create policies by referencing
a catalog entry's ``id`` and assigning a target label.
"""

from __future__ import annotations

SIT_CATALOG: list[dict] = [
    # ── HIPAA / Healthcare ──────────────────────────────────────
    {
        "id": "hipaa_phi",
        "name": "HIPAA — Protected Health Information (PHI)",
        "description": (
            "Detects U.S. healthcare identifiers (SSN, medical license, DEA number) "
            "combined with medical terminology. Mirrors Microsoft's HIPAA SIT bundle."
        ),
        "category": "Healthcare",
        "regulations": ["HIPAA"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN", "MEDICAL_LICENSE"],
                        "min_confidence": 0.8,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "health_terms"},
                            {"type": "keyword_list", "id": "hipaa_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN"],
                        "min_confidence": 0.6,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "health_terms"},
                        ],
                    },
                    "proximity": 500,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN", "MEDICAL_LICENSE"],
                        "min_confidence": 0.5,
                        "min_count": 1,
                    },
                    "proximity": 300,
                },
            ],
            "definitions": {
                "health_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "patient", "diagnosis", "medical record", "treatment",
                        "prescription", "health plan", "clinical", "hospital",
                        "physician", "pharmacy", "lab results", "discharge",
                        "radiology", "pathology", "insurance claim",
                    ],
                    "case_sensitive": False,
                },
                "hipaa_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "HIPAA", "protected health information", "PHI",
                        "covered entity", "business associate", "notice of privacy",
                        "authorization form", "release of information",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── PCI DSS / Payment Card ──────────────────────────────────
    {
        "id": "pci_dss",
        "name": "PCI DSS — Payment Card Data",
        "description": (
            "Detects credit card numbers with optional financial context keywords. "
            "Aligns with PCI DSS cardholder data requirements."
        ),
        "category": "Financial",
        "regulations": ["PCI DSS"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["CREDIT_CARD"],
                        "min_confidence": 0.8,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "payment_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["CREDIT_CARD"],
                        "min_confidence": 0.7,
                        "min_count": 1,
                    },
                    "proximity": 300,
                },
            ],
            "definitions": {
                "payment_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "credit card", "debit card", "card number", "cardholder",
                        "expiration", "CVV", "CVC", "billing", "payment",
                        "Visa", "Mastercard", "Amex", "Discover",
                        "account number", "PAN", "primary account",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── PII — U.S. Personal Identifiers ─────────────────────────
    {
        "id": "pii_us",
        "name": "PII — U.S. Personal Identifiers",
        "description": (
            "Detects U.S. Social Security Numbers, driver's licenses, passport numbers, "
            "and personal contact information with identity-context keywords."
        ),
        "category": "Privacy",
        "regulations": ["NIST SP 800-122", "State Privacy Laws"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN"],
                        "min_confidence": 0.8,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "identity_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_DRIVER_LICENSE", "US_PASSPORT"],
                        "min_confidence": 0.7,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "identity_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN", "US_DRIVER_LICENSE", "US_PASSPORT"],
                        "min_confidence": 0.6,
                        "min_count": 1,
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["EMAIL_ADDRESS", "PHONE_NUMBER", "PERSON"],
                        "min_confidence": 0.5,
                        "min_count": 3,
                    },
                    "proximity": 300,
                },
            ],
            "definitions": {
                "identity_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "social security", "SSN", "date of birth", "DOB",
                        "driver license", "passport", "taxpayer", "ITIN",
                        "full name", "home address", "personal information",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── Financial — Banking & Account Numbers ───────────────────
    {
        "id": "financial_accounts",
        "name": "Financial — Banking & Account Data",
        "description": (
            "Detects bank account numbers, IBAN codes, and SWIFT codes "
            "with financial context. Covers wire transfer and account data."
        ),
        "category": "Financial",
        "regulations": ["GLBA", "SOX"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_BANK_NUMBER", "IBAN_CODE"],
                        "min_confidence": 0.8,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "banking_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_BANK_NUMBER", "IBAN_CODE"],
                        "min_confidence": 0.6,
                        "min_count": 1,
                    },
                    "proximity": 300,
                },
            ],
            "definitions": {
                "banking_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "bank account", "routing number", "ABA", "SWIFT",
                        "wire transfer", "ACH", "direct deposit", "checking",
                        "savings", "account number", "IBAN", "beneficiary",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── Credentials & Secrets ───────────────────────────────────
    {
        "id": "credentials",
        "name": "Credentials & Secrets",
        "description": (
            "Detects API keys, access tokens, private keys, connection strings, "
            "and other authentication credentials."
        ),
        "category": "Security",
        "regulations": ["CIS Controls", "ISO 27001"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "-----BEGIN\\s(?:RSA\\s)?PRIVATE\\sKEY-----",
                            "(?i)DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]+",
                            "\\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\\b",
                            "\\b(?:AKIA|ASIA)[A-Z0-9]{16}\\b",
                        ],
                        "min_count": 1,
                    },
                    "proximity": 0,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "(?i)(?:api[_\\-]?key|apikey|secret[_\\-]?key|access[_\\-]?token|auth[_\\-]?token)\\s*[:=]\\s*[\"']?[A-Za-z0-9\\-_]{20,}[\"']?",
                        ],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "secret_terms"},
                        ],
                    },
                    "proximity": 200,
                },
            ],
            "definitions": {
                "secret_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "password", "secret", "credential", "token",
                        "connection string", "private key", "API key",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── GDPR — EU Personal Data ─────────────────────────────────
    {
        "id": "gdpr_personal",
        "name": "GDPR — EU Personal Data",
        "description": (
            "Detects personal data as defined under GDPR: names with EU identifiers, "
            "UK NHS numbers, and personal contact details in EU context."
        ),
        "category": "Privacy",
        "regulations": ["GDPR"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["UK_NHS", "IBAN_CODE"],
                        "min_confidence": 0.7,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "gdpr_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["PERSON", "EMAIL_ADDRESS"],
                        "min_confidence": 0.6,
                        "min_count": 2,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "gdpr_terms"},
                        ],
                    },
                    "proximity": 500,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["UK_NHS"],
                        "min_confidence": 0.5,
                        "min_count": 1,
                    },
                    "proximity": 300,
                },
            ],
            "definitions": {
                "gdpr_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "data subject", "personal data", "GDPR", "data controller",
                        "data processor", "consent", "right to erasure",
                        "data protection", "EU resident", "UK resident",
                        "national insurance", "NHS number",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── Australia — Privacy Act ──────────────────────────────────
    {
        "id": "au_privacy",
        "name": "Australia — Privacy Act Identifiers",
        "description": (
            "Detects Australian Tax File Numbers, ABNs, ACNs, and Medicare numbers "
            "with Australian-context keywords."
        ),
        "category": "Privacy",
        "regulations": ["Australian Privacy Act 1988"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["AU_TFN"],
                        "min_confidence": 0.8,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "au_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["AU_TFN", "AU_ABN", "AU_ACN", "AU_MEDICARE"],
                        "min_confidence": 0.6,
                        "min_count": 1,
                    },
                    "proximity": 300,
                },
            ],
            "definitions": {
                "au_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "tax file number", "TFN", "ABN", "ACN",
                        "Medicare", "Australian Business Number",
                        "Australian Company Number", "Centrelink",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── Confidential Business Documents ─────────────────────────
    {
        "id": "confidential_docs",
        "name": "Confidential Business Documents",
        "description": (
            "Detects files containing confidentiality markers, NDA language, "
            "trade secret references, and internal-only designations."
        ),
        "category": "Business",
        "regulations": [],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "(?i)\\b(?:CONFIDENTIAL|STRICTLY CONFIDENTIAL|INTERNAL ONLY|NOT FOR DISTRIBUTION)\\b",
                        ],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "business_terms"},
                        ],
                    },
                    "proximity": 500,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "(?i)\\b(?:CONFIDENTIAL|STRICTLY CONFIDENTIAL|INTERNAL ONLY|NOT FOR DISTRIBUTION)\\b",
                        ],
                        "min_count": 1,
                    },
                    "proximity": 0,
                },
            ],
            "definitions": {
                "business_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "trade secret", "proprietary", "non-disclosure",
                        "NDA", "attorney-client", "privileged",
                        "board of directors", "merger", "acquisition",
                        "financial results", "forecast", "budget",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },
]


def get_sit_catalog() -> list[dict]:
    """Return the full SIT catalog."""
    return SIT_CATALOG


def get_sit_by_id(sit_id: str) -> dict | None:
    """Look up a single SIT definition by its ID."""
    for sit in SIT_CATALOG:
        if sit["id"] == sit_id:
            return sit
    return None
