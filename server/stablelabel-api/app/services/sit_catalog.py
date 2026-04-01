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

    # ── SOX — Sarbanes-Oxley Financial Reporting ─────────────
    {
        "id": "sox_financial",
        "name": "SOX — Financial Reporting Data",
        "description": (
            "Detects material non-public financial information, earnings data, "
            "revenue figures, and internal financial reports subject to Sarbanes-Oxley "
            "controls. Targets documents that could constitute insider trading risk."
        ),
        "category": "Financial",
        "regulations": ["SOX", "SEC Rule 10b-5"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "(?i)\\b(?:material non-public|MNPI|insider\\s+(?:information|trading)|pre-release\\s+earnings)\\b",
                            "(?i)\\b(?:10-[KQ]|8-K|annual\\s+report|quarterly\\s+(?:report|filing|earnings))\\b",
                        ],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "sox_terms"},
                        ],
                    },
                    "proximity": 500,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "(?i)\\b(?:EBITDA|gross\\s+margin|net\\s+income|revenue\\s+(?:forecast|projection|guidance))\\b",
                            "(?i)\\b(?:unaudited|pre-announcement|blackout\\s+period|quiet\\s+period)\\b",
                        ],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 2,
                        "matches": [
                            {"type": "keyword_list", "id": "sox_terms"},
                            {"type": "keyword_list", "id": "sox_financial_terms"},
                        ],
                    },
                    "proximity": 500,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "(?i)\\b(?:EBITDA|gross\\s+margin|net\\s+income|operating\\s+income)\\b",
                        ],
                        "min_count": 2,
                    },
                    "proximity": 500,
                },
            ],
            "definitions": {
                "sox_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "Sarbanes-Oxley", "SOX", "SEC filing", "internal controls",
                        "material weakness", "audit committee", "disclosure",
                        "restatement", "compliance", "whistleblower",
                        "management certification", "Section 302", "Section 404",
                    ],
                    "case_sensitive": False,
                },
                "sox_financial_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "revenue", "earnings", "profit", "loss", "margin",
                        "cash flow", "balance sheet", "income statement",
                        "forecast", "guidance", "projection", "dividend",
                        "share price", "stock", "equity", "debt",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── GLBA — Gramm-Leach-Bliley Act ────────────────────────
    {
        "id": "glba",
        "name": "GLBA — Financial Customer Data",
        "description": (
            "Detects non-public personal information (NPI) of financial institution "
            "customers: account numbers combined with personal identifiers and "
            "financial context, as regulated under the Gramm-Leach-Bliley Act."
        ),
        "category": "Financial",
        "regulations": ["GLBA", "FTC Safeguards Rule"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_BANK_NUMBER", "IBAN_CODE", "CREDIT_CARD"],
                        "min_confidence": 0.7,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 2,
                        "matches": [
                            {"type": "keyword_list", "id": "glba_customer_terms"},
                            {"type": "keyword_list", "id": "glba_financial_terms"},
                        ],
                    },
                    "proximity": 500,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN", "US_DRIVER_LICENSE"],
                        "min_confidence": 0.7,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "glba_financial_terms"},
                        ],
                    },
                    "proximity": 500,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_BANK_NUMBER", "CREDIT_CARD"],
                        "min_confidence": 0.6,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "glba_customer_terms"},
                        ],
                    },
                    "proximity": 300,
                },
            ],
            "definitions": {
                "glba_customer_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "customer", "account holder", "applicant", "borrower",
                        "policyholder", "beneficiary", "client name",
                        "date of birth", "social security", "home address",
                        "personal information", "consumer",
                    ],
                    "case_sensitive": False,
                },
                "glba_financial_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "bank account", "loan", "mortgage", "credit score",
                        "financial institution", "checking", "savings",
                        "investment", "insurance policy", "brokerage",
                        "wire transfer", "direct deposit", "routing number",
                        "account balance", "credit limit", "interest rate",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── FERPA — Student Education Records ────────────────────
    {
        "id": "ferpa",
        "name": "FERPA — Student Education Records",
        "description": (
            "Detects student personally identifiable information in education records: "
            "grades, enrollment data, disciplinary records, and student IDs combined "
            "with educational context keywords."
        ),
        "category": "Education",
        "regulations": ["FERPA"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN", "PERSON"],
                        "min_confidence": 0.7,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 2,
                        "matches": [
                            {"type": "keyword_list", "id": "ferpa_student_terms"},
                            {"type": "keyword_list", "id": "ferpa_record_terms"},
                        ],
                    },
                    "proximity": 500,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "(?i)\\b(?:student\\s+ID|student\\s+number|enrollment\\s+(?:number|ID))\\s*[:=#]?\\s*[A-Z0-9]{4,}\\b",
                        ],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "ferpa_record_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["PERSON", "EMAIL_ADDRESS"],
                        "min_confidence": 0.5,
                        "min_count": 2,
                    },
                    "corroborative_evidence": {
                        "min_matches": 2,
                        "matches": [
                            {"type": "keyword_list", "id": "ferpa_student_terms"},
                            {"type": "keyword_list", "id": "ferpa_record_terms"},
                        ],
                    },
                    "proximity": 500,
                },
            ],
            "definitions": {
                "ferpa_student_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "student", "pupil", "enrollee", "undergraduate",
                        "graduate", "freshman", "sophomore", "junior",
                        "senior", "parent", "guardian", "minor",
                        "school", "university", "college", "campus",
                    ],
                    "case_sensitive": False,
                },
                "ferpa_record_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "transcript", "GPA", "grade", "enrollment",
                        "academic record", "disciplinary", "attendance",
                        "financial aid", "scholarship", "class schedule",
                        "education record", "FERPA", "directory information",
                        "report card", "IEP", "504 plan", "special education",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── Canada PIPEDA / Provincial ────────────────────────────
    {
        "id": "ca_pipeda",
        "name": "Canada — PIPEDA Personal Information",
        "description": (
            "Detects Canadian personal information: Social Insurance Numbers (SIN), "
            "provincial health card numbers, and personal identifiers with Canadian "
            "context. Covers PIPEDA and provincial privacy legislation."
        ),
        "category": "Privacy",
        "regulations": ["PIPEDA", "PHIPA (Ontario)", "PIPA (Alberta/BC)"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "\\b\\d{3}[\\s-]?\\d{3}[\\s-]?\\d{3}\\b",
                        ],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "ca_sin_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "\\b\\d{4}[\\s-]?\\d{3}[\\s-]?\\d{3}[\\s-]?[A-Z]{2}\\b",
                            "\\b\\d{10}[\\s-]?[A-Z]{2}\\b",
                        ],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "ca_health_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER"],
                        "min_confidence": 0.6,
                        "min_count": 2,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "ca_context_terms"},
                        ],
                    },
                    "proximity": 500,
                },
            ],
            "definitions": {
                "ca_sin_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "SIN", "social insurance number", "numéro d'assurance sociale",
                        "NAS", "Canada Revenue", "CRA", "Service Canada",
                    ],
                    "case_sensitive": False,
                },
                "ca_health_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "health card", "OHIP", "carte santé", "RAMQ",
                        "Alberta health", "BC health", "MSP",
                        "provincial health", "health insurance number",
                    ],
                    "case_sensitive": False,
                },
                "ca_context_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "Canada", "Canadian", "Ontario", "Quebec", "Alberta",
                        "British Columbia", "Manitoba", "Saskatchewan",
                        "Nova Scotia", "New Brunswick", "PIPEDA",
                        "postal code", "province",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── New Zealand — Privacy Act ─────────────────────────────
    {
        "id": "nz_privacy",
        "name": "New Zealand — Privacy Act Identifiers",
        "description": (
            "Detects New Zealand personal identifiers: IRD numbers (tax), "
            "NHI numbers (health), and NZ driver's licence numbers with "
            "New Zealand context keywords."
        ),
        "category": "Privacy",
        "regulations": ["NZ Privacy Act 2020", "HIPC"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "\\b\\d{2,3}[\\s-]?\\d{3}[\\s-]?\\d{3}\\b",
                        ],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "nz_ird_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "\\b[A-Z]{3}\\d{4}\\b",
                        ],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "nz_health_terms"},
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
                            {"type": "keyword_list", "id": "nz_context_terms"},
                        ],
                    },
                    "proximity": 500,
                },
            ],
            "definitions": {
                "nz_ird_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "IRD", "Inland Revenue", "tax number", "IRD number",
                        "New Zealand tax", "GST number",
                    ],
                    "case_sensitive": False,
                },
                "nz_health_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "NHI", "National Health Index", "health index number",
                        "DHB", "district health board", "ACC",
                    ],
                    "case_sensitive": False,
                },
                "nz_context_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "New Zealand", "NZ", "Aotearoa", "Auckland",
                        "Wellington", "Christchurch", "NZBN",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── UK DPA 2018 ───────────────────────────────────────────
    {
        "id": "uk_dpa",
        "name": "UK DPA 2018 — Personal Data",
        "description": (
            "Detects UK personal identifiers beyond NHS numbers: National Insurance "
            "Numbers (NINO), UK passport numbers, UK driving licence numbers, and "
            "personal data in UK context. Extends the GDPR SIT for UK-specific IDs."
        ),
        "category": "Privacy",
        "regulations": ["UK DPA 2018", "UK GDPR"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["UK_NINO"],
                        "min_confidence": 0.7,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "uk_identity_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "\\b\\d{9}\\b",
                        ],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "uk_passport_terms"},
                        ],
                    },
                    "proximity": 200,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "\\b[A-Z]{5}\\d{6}[A-Z0-9]{2}\\d[A-Z]{2}\\b",
                        ],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "uk_identity_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["UK_NHS", "UK_NINO"],
                        "min_confidence": 0.6,
                        "min_count": 1,
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["PERSON", "EMAIL_ADDRESS"],
                        "min_confidence": 0.5,
                        "min_count": 2,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "uk_context_terms"},
                        ],
                    },
                    "proximity": 500,
                },
            ],
            "definitions": {
                "uk_identity_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "national insurance", "NI number", "NINO",
                        "HMRC", "tax code", "P60", "P45", "payslip",
                        "employer", "employee", "PAYE",
                    ],
                    "case_sensitive": False,
                },
                "uk_passport_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "passport", "HM Passport Office", "travel document",
                        "British passport", "UK passport",
                    ],
                    "case_sensitive": False,
                },
                "uk_context_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "United Kingdom", "England", "Scotland", "Wales",
                        "Northern Ireland", "postcode", "NHS", "DVLA",
                        "council tax", "National Insurance",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── Source Code & IP / Expanded Credentials ───────────────
    {
        "id": "source_code_ip",
        "name": "Source Code & Intellectual Property Secrets",
        "description": (
            "Extends the Credentials SIT to detect JWT tokens, OAuth secrets, "
            "database connection strings with embedded passwords, private keys in "
            "non-PEM formats, service account credentials, and password literals. "
            "Covers secrets commonly found in source code and configuration files."
        ),
        "category": "Security",
        "regulations": ["CIS Controls", "ISO 27001", "OWASP"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "eyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}",
                            "(?i)(?:mongodb(?:\\+srv)?|postgres(?:ql)?|mysql|mssql|redis|amqp)://[^\\s:]+:[^\\s@]+@[^\\s]+",
                            "(?i)-----BEGIN\\s(?:EC|DSA|OPENSSH|PGP)\\sPRIVATE\\sKEY-----",
                            "xox[bpoas]-[A-Za-z0-9-]{10,}",
                            "\\bAIza[A-Za-z0-9_-]{35}\\b",
                            "(?i)sk-[A-Za-z0-9]{20,}",
                        ],
                        "min_count": 1,
                    },
                    "proximity": 0,
                },
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "(?i)(?:password|passwd|pwd)\\s*[:=]\\s*[\"'][^\"'\\s]{8,}[\"']",
                            "(?i)(?:client[_-]?secret|app[_-]?secret|oauth[_-]?secret)\\s*[:=]\\s*[\"']?[A-Za-z0-9\\-_]{16,}[\"']?",
                            "(?i)(?:service[_-]?account|credentials)\\s*[:=]\\s*[{\"']",
                        ],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "code_secret_terms"},
                        ],
                    },
                    "proximity": 200,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "(?i)(?:token|secret|key|password|credential|auth)\\s*[:=]\\s*[\"']?[A-Za-z0-9\\-_./+=]{20,}[\"']?",
                        ],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "code_secret_terms"},
                        ],
                    },
                    "proximity": 200,
                },
            ],
            "definitions": {
                "code_secret_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "password", "secret", "credential", "token", "API key",
                        "private key", "connection string", "database",
                        "oauth", "bearer", "authorization", "authenticate",
                        "service account", ".env", "config", "environment",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── Legal Privilege ───────────────────────────────────────
    {
        "id": "legal_privilege",
        "name": "Legal Privilege & Work Product",
        "description": (
            "Detects attorney-client privileged communications, legal hold notices, "
            "litigation work product, and legal professional privilege markers. "
            "Important for eDiscovery and legal compliance workflows."
        ),
        "category": "Legal",
        "regulations": [],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "(?i)\\b(?:attorney[\\s-]client\\s+privile|legal(?:ly)?\\s+privileged|solicitor[\\s-]client\\s+privile|litigation\\s+privilege)\\b",
                            "(?i)\\b(?:PRIVILEGED\\s+AND\\s+CONFIDENTIAL|SUBJECT\\s+TO\\s+(?:LEGAL\\s+)?PRIVILEGE|ATTORNEY\\s+WORK\\s+PRODUCT)\\b",
                        ],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "legal_terms"},
                        ],
                    },
                    "proximity": 500,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "(?i)\\b(?:legal\\s+hold|litigation\\s+hold|preservation\\s+(?:notice|order|hold))\\b",
                            "(?i)\\b(?:DO\\s+NOT\\s+(?:DESTROY|DELETE|DISCARD|DISPOSE)|PRESERVE\\s+ALL)\\b",
                        ],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "legal_terms"},
                        ],
                    },
                    "proximity": 500,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "regex",
                        "patterns": [
                            "(?i)\\b(?:PRIVILEGED\\s+AND\\s+CONFIDENTIAL|ATTORNEY[\\s-]CLIENT)\\b",
                        ],
                        "min_count": 1,
                    },
                    "proximity": 0,
                },
            ],
            "definitions": {
                "legal_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "attorney", "lawyer", "counsel", "solicitor", "barrister",
                        "litigation", "lawsuit", "deposition", "discovery",
                        "subpoena", "court order", "settlement", "mediation",
                        "arbitration", "legal advice", "work product",
                        "legal department", "general counsel", "outside counsel",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── India — DPDP Act ──────────────────────────────────────
    {
        "id": "in_dpdp",
        "name": "India — Digital Personal Data Protection",
        "description": (
            "Detects Indian personal identifiers: Aadhaar numbers, PAN (Permanent "
            "Account Numbers), Voter IDs, and personal data with Indian context. "
            "Covers the Digital Personal Data Protection Act 2023."
        ),
        "category": "Privacy",
        "regulations": ["DPDP Act 2023", "IT Act 2000"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["IN_AADHAAR"],
                        "min_confidence": 0.7,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "in_identity_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["IN_PAN"],
                        "min_confidence": 0.7,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "in_identity_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["IN_PAN", "IN_AADHAAR"],
                        "min_confidence": 0.6,
                        "min_count": 1,
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER"],
                        "min_confidence": 0.5,
                        "min_count": 2,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "in_context_terms"},
                        ],
                    },
                    "proximity": 500,
                },
            ],
            "definitions": {
                "in_identity_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "Aadhaar", "UIDAI", "PAN", "Permanent Account Number",
                        "voter ID", "EPIC", "ration card", "driving licence",
                        "passport", "income tax", "ITR",
                    ],
                    "case_sensitive": False,
                },
                "in_context_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "India", "Indian", "Delhi", "Mumbai", "Bangalore",
                        "Chennai", "Kolkata", "Hyderabad", "rupee", "INR",
                        "pincode", "DPDP", "Aadhaar",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── Singapore — PDPA ──────────────────────────────────────
    {
        "id": "sg_pdpa",
        "name": "Singapore — PDPA Personal Data",
        "description": (
            "Detects Singapore personal identifiers: NRIC/FIN numbers and personal "
            "data with Singaporean context. Covers the Personal Data Protection Act."
        ),
        "category": "Privacy",
        "regulations": ["PDPA (Singapore)"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["SG_NRIC_FIN"],
                        "min_confidence": 0.7,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "sg_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["SG_NRIC_FIN"],
                        "min_confidence": 0.6,
                        "min_count": 1,
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER"],
                        "min_confidence": 0.5,
                        "min_count": 2,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "sg_terms"},
                        ],
                    },
                    "proximity": 500,
                },
            ],
            "definitions": {
                "sg_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "NRIC", "FIN", "Singapore", "Singaporean",
                        "CPF", "Central Provident Fund", "PDPA",
                        "SingPass", "CorpPass", "UEN", "work permit",
                        "employment pass", "S pass",
                    ],
                    "case_sensitive": False,
                },
            },
        },
    },

    # ── EU Member State National IDs ──────────────────────────
    {
        "id": "eu_national_ids",
        "name": "EU — Member State National Identifiers",
        "description": (
            "Detects country-specific national ID numbers across EU member states: "
            "Spain NIF/NIE, Italy Codice Fiscale, Poland PESEL, Germany Steuer-ID, "
            "and similar. Supplements the GDPR SIT with concrete national identifiers."
        ),
        "category": "Privacy",
        "regulations": ["GDPR", "EU Member State Laws"],
        "rules": {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["ES_NIF", "IT_FISCAL_CODE", "PL_PESEL", "DE_TAX_ID"],
                        "min_confidence": 0.7,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "eu_id_terms"},
                        ],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 75,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["ES_NIF", "IT_FISCAL_CODE", "PL_PESEL", "DE_TAX_ID"],
                        "min_confidence": 0.6,
                        "min_count": 1,
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["PERSON", "IBAN_CODE"],
                        "min_confidence": 0.6,
                        "min_count": 2,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "eu_id_terms"},
                        ],
                    },
                    "proximity": 500,
                },
            ],
            "definitions": {
                "eu_id_terms": {
                    "type": "keyword_list",
                    "keywords": [
                        "NIF", "NIE", "DNI", "codice fiscale", "PESEL",
                        "Steuer-ID", "Steuernummer", "tax identification",
                        "national ID", "identity card", "carta d'identità",
                        "dowód osobisty", "Personalausweis",
                        "Spain", "Italy", "Poland", "Germany", "France",
                        "European Union", "EU citizen", "Schengen",
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
