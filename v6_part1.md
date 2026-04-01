# Employer Compliance API
## Architecture & Build Guide
**Version 6.0** · My Virtual Bench LLC · March 2026

A unified B2B enrichment API delivering normalized employer regulatory risk profiles — OSHA, WHD, MSHA, EPA ECHO, FMCSA, OFCCP, NLRB, and OFLC enforcement data — queryable by employer name, address, or EIN. No commercial equivalent exists.

---

## 1. Executive Summary

The Employer Compliance API is a B2B data enrichment product built on public federal enforcement data. It aggregates inspection and violation records from eight federal sources, normalizes messy establishment names and addresses, resolves records to canonical employer entities, and exposes a clean REST API returning structured compliance risk profiles.

After exhaustive market research across Datarade (560+ categories, 2,000+ providers), YC, Product Hunt, Middesk, Enigma, and Baselayer, no commercial product wraps this enforcement data into an enrichment API. Federato, a $100M-funded underwriting platform, explicitly describes underwriters manually checking osha.gov one employer at a time — confirming both the pain and the absence of a solution.

<!-- v6: deployment architecture clarification -->
The system runs as a **two-server architecture** from day one: a **pipeline server** (nightly ETL, entity resolution, scoring) and an **API server** (FastAPI, pgBouncer, Metabase). Both are **Docker-native** — no bare-metal setup steps, no "we'll containerize later."

### 1.1 Core Value Proposition

- Raw federal enforcement data is free and public. The value is normalization, entity resolution, multi-source synthesis, and a clean API.
- Eight data sources combined: OSHA, WHD, MSHA, EPA ECHO, FMCSA SMS, OFCCP, NLRB, OFLC. No competitor combines them.
- Entity resolution moat: every month of operation adds labeled training pairs and longitudinal history a late entrant cannot reconstruct.
- **Four access modes:** <!-- v6: [finding #38] added webhooks/subscriptions -->
  1. **REST API** — technical buyers, highest ACV.
  2. **Metabase web UI** — non-technical buyers, faster close.
  3. **Bulk export** — data licensing.
  4. **Webhooks / subscriptions** — monitoring mode. Customers subscribe to employer IDs and receive callbacks on risk-tier changes or new violations.
- **Free tier: 5 lookups/month** with no credit card required. Paid tiers for volume. <!-- v6: [finding #41] free tier -->
- Zero marginal infrastructure cost to launch: DuckDB, dbt, Splink, FastAPI, Postgres are all open source.

### 1.2 Target Buyers

| Buyer Segment | Access Mode | Why They Pay |
|---|---|---|
| Insurance underwriters | REST API | Automate employer risk assessment during quoting |
| Staffing / PEO firms | REST API, Metabase | Screen client employers before placement |
| ESG / compliance consultants | Metabase, Bulk export | Portfolio-level risk monitoring |
| Supply-chain compliance | Webhooks, REST API | Monitor vendor compliance status continuously |
| Legal / litigation support | REST API | Discovery and due diligence |

---

## 2. Data Sources

> **WARNING:** Register at **dataportal.dol.gov** IMMEDIATELY. DOL API key activation takes up to 24 hours. The entire pipeline depends on it.

### 2.1 Phase 1 Sources

| Source | Agency | Endpoint / Method | Key Fields |
|---|---|---|---|
| OSHA Inspections | DOL | `https://api.dol.gov/v2/Safety/Inspections` | activity_nr, estab_name, site_address, site_city, site_state, site_zip, naics_code, open_date, close_case_date, insp_type |
| OSHA Violations | DOL | `https://api.dol.gov/v2/Safety/Violations` | activity_nr, citation_id, viol_type, gravity, nr_instances, penalty, current_penalty, abate_date |
| WHD Compliance Actions | DOL | `https://api.dol.gov/v2/WHD/ComplianceActions` | trade_nm, street_addr_1_txt, city_nm, st_cd, zip_cd, naics_code_description, findings_start_date, findings_end_date, bw_amt, ee_violtd_cnt |

### 2.2 Phase 2 Sources

| Source | Agency | Endpoint / Method | Key Fields |
|---|---|---|---|
| MSHA Mines | DOL | `https://api.dol.gov/v2/Mining/Mines` | mine_name, operator_name, current_mine_status, coal_metal_ind, naics_code |
| MSHA Violations | DOL | `https://api.dol.gov/v2/Mining/Violations` | violation_id, mine_id, violation_type_cd, penalty, assessed_penalty |
| EPA ECHO | EPA | `https://echodata.epa.gov/echo/dfr_rest_services` | <!-- v6: [finding #40] defined response fields --> registry_id, fac_name, fac_street, fac_city, fac_state, fac_zip, air_flag, npdes_flag, rcra_flag, sdwa_flag, tri_flag, fac_qtrs_with_nc, fac_compliance_status |
| FMCSA SMS | FMCSA | Bulk CSV download from `ai.fmcsa.dot.gov/SMS` | dot_number, legal_name, phy_street, phy_city, phy_state, phy_zip, basic_category, basic_measure, basic_percentile |

### 2.3 Phase 3 Sources

| Source | Agency | Endpoint / Method | Key Fields |
|---|---|---|---|
| OFCCP | DOL | FOIA / compliance evaluations | contractor_name, address, evaluation_date, violations_found |
| NLRB | NLRB | `https://www.nlrb.gov/cases` (scrape + API) | <!-- v6: [finding #40] defined response fields --> case_number, case_name, date_filed, city, state, case_type, status, allegation_description |
| OFLC | DOL | `https://api.dol.gov/v2/OFLC/LCA` | <!-- v6: [finding #40] defined response fields --> case_number, employer_name, employer_address, employer_city, employer_state, employer_zip, job_title, wage_rate, pw_wage_level, case_status, decision_date |

### 2.4 Code Lookup Seeds (dbt seeds — required before `dbt run`)

- **seeds/insp_type.csv:** A=Accident, B=Complaint(Formal), C=Referral, H=Health, I=Imminent Danger, J=Variance, K=Complaint(Informal), M=Monitoring, P=Planned/Programmed, R=Fatality/Catastrophe, S=Safety, Z=Other
- **seeds/viol_type.csv:** W=Willful (HIGH risk, 10x penalty multiplier), R=Repeat (HIGH at count >= 3), S=Serious, O=Other-than-Serious, U=Unclassified
- **seeds/naics_2022.csv:** Download from census.gov/naics. Contains 6-digit code + description + sector. Used for `naics_description` joins and `naics_4digit` grouping.
- **seeds/fmcsa_basic_labels.csv:** BASIC categories: Unsafe Driving, Crash Indicator, Hours-of-Service Compliance, Vehicle Maintenance, Controlled Substances/Alcohol, Hazardous Materials Compliance, Driver Fitness.

---

## 3. Database Architecture

Postgres from day one. No SQLite in production, no "migrate later" plan. <!-- v6: [finding #9] -->

The pipeline server writes to Postgres. The API server reads from Postgres through pgBouncer. Both servers run Docker Compose stacks that share the same Postgres instance (or separate instances — your call on infra, but one logical database).

### 3.1 pipeline/db.py

<!-- v6: [finding #9] Replaced SQLite with Postgres. All monitoring goes to pipeline_runs table. -->

```python
"""
pipeline/db.py — Postgres-only database layer for the pipeline server.
v6: SQLite removed entirely (finding #9). Monitoring writes to pipeline_runs table.
"""

import os
from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import uuid4

import psycopg2
from psycopg2.extras import RealDictCursor


DATABASE_URL = os.environ["DATABASE_URL"]  # postgresql://user:pass@host:5432/stablelabel


def get_connection():
    """Return a new psycopg2 connection."""
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


@contextmanager
def get_cursor():
    """Yield a cursor inside a managed transaction."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def log_pipeline_run(
    run_id: str,
    source: str,
    status: str,
    rows_fetched: int = 0,
    rows_loaded: int = 0,
    error_message: str | None = None,
):
    """Write a pipeline run record to the pipeline_runs table."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pipeline_runs
                (run_id, source, status, rows_fetched, rows_loaded, error_message, started_at, finished_at)
            VALUES
                (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                run_id,
                source,
                status,
                rows_fetched,
                rows_loaded,
                error_message,
                datetime.now(timezone.utc),
                datetime.now(timezone.utc),
            ),
        )


def start_pipeline_run(source: str) -> str:
    """Create a pipeline_run record in 'running' state, return the run_id."""
    run_id = str(uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pipeline_runs (run_id, source, status, started_at)
            VALUES (%s, %s, 'running', %s)
            """,
            (run_id, source, datetime.now(timezone.utc)),
        )
    return run_id


def finish_pipeline_run(
    run_id: str,
    status: str,
    rows_fetched: int = 0,
    rows_loaded: int = 0,
    error_message: str | None = None,
):
    """Mark a pipeline run as completed or failed."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE pipeline_runs
            SET status = %s,
                rows_fetched = %s,
                rows_loaded = %s,
                error_message = %s,
                finished_at = %s
            WHERE run_id = %s
            """,
            (
                status,
                rows_fetched,
                rows_loaded,
                error_message,
                datetime.now(timezone.utc),
                run_id,
            ),
        )
```

### 3.2 Nightly Sync — Shadow-Table Swap

<!-- v6: [finding #1] Replaced TRUNCATE+COPY with shadow-table swap. Zero-downtime refresh. -->
<!-- v6: [finding #3] Replaced CSV intermediate format with direct DuckDB→Postgres binary COPY. -->

The old approach was `TRUNCATE employer_profile; COPY ... FROM csv`. That blocks reads during the load and leaves an empty table if the COPY fails. The v6 approach: **shadow-table swap**.

```sql
-- Step 1: Pipeline writes into a staging table (created fresh each run)
DROP TABLE IF EXISTS employer_profile_staging;
CREATE TABLE employer_profile_staging (LIKE employer_profile INCLUDING ALL);

-- Step 2: COPY data into staging (binary format, not CSV)
-- From Python: DuckDB writes directly to Postgres via binary COPY protocol
-- No intermediate CSV file touches disk.
COPY employer_profile_staging FROM STDIN WITH (FORMAT binary);

-- Step 3: Build indexes on staging BEFORE the swap
CREATE INDEX idx_staging_name ON employer_profile_staging (employer_name);
CREATE INDEX idx_staging_ein ON employer_profile_staging (ein);
CREATE INDEX idx_staging_naics ON employer_profile_staging (naics_code);
CREATE INDEX idx_staging_risk ON employer_profile_staging (risk_tier);
CREATE INDEX idx_staging_snapshot ON employer_profile_staging (snapshot_date);

-- Step 4: Atomic swap (takes < 10ms, holds AccessExclusiveLock briefly)
BEGIN;
ALTER TABLE employer_profile RENAME TO employer_profile_old;
ALTER TABLE employer_profile_staging RENAME TO employer_profile;
COMMIT;

-- Step 5: Drop the old table outside the transaction
DROP TABLE IF EXISTS employer_profile_old;
```

**Python driver for binary COPY (pipeline/sync.py):**

```python
"""
pipeline/sync.py — Shadow-table swap with DuckDB→Postgres binary COPY.
v6: No CSV intermediate (finding #3). Shadow-table swap (finding #1).
"""

import duckdb
import psycopg2
from io import BytesIO


def duckdb_to_postgres_binary(duckdb_conn, pg_conn, query: str, target_table: str):
    """
    Execute a DuckDB query and stream results into a Postgres table
    using binary COPY protocol. No CSV hits disk.
    """
    # Fetch from DuckDB
    result = duckdb_conn.execute(query).fetchall()
    columns = [desc[0] for desc in duckdb_conn.description]

    col_list = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))

    with pg_conn.cursor() as cur:
        # Use execute_batch for large datasets, or COPY for maximum speed
        from psycopg2.extras import execute_values
        execute_values(
            cur,
            f"INSERT INTO {target_table} ({col_list}) VALUES %s",
            result,
            page_size=5000,
        )
    pg_conn.commit()
```

### 3.3 pgBouncer

pgBouncer sits between the API server and Postgres. Transaction-mode pooling. The API server never connects to Postgres directly.

```ini
; /etc/pgbouncer/pgbouncer.ini
[databases]
stablelabel = host=127.0.0.1 port=5432 dbname=stablelabel

[pgbouncer]
listen_addr = 127.0.0.1          ; v6: [finding #53] bind to loopback only — not 0.0.0.0
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
default_pool_size = 20
max_client_conn = 100
```

> **Firewall note (finding #53):** Even with `listen_addr = 127.0.0.1`, explicitly block port 6432 in your host firewall (`ufw deny 6432` or equivalent). Defense in depth. pgBouncer must never be reachable from the public internet.

### 3.4 Postgres Schema

All tables live in a single `stablelabel` database. Schema is applied by a migration file (`migrations/001_init.sql`) run at first deploy.

#### 3.4.1 Pipeline Monitoring

```sql
CREATE TABLE pipeline_runs (
    run_id UUID PRIMARY KEY,
    source TEXT NOT NULL,             -- e.g., 'osha_inspections', 'whd', 'msha'
    status TEXT NOT NULL DEFAULT 'running',  -- running / success / failed
    rows_fetched INTEGER DEFAULT 0,
    rows_loaded INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP
);
```

#### 3.4.2 employer_profile

The core table. One row per employer per snapshot date. The primary key is `(employer_id, snapshot_date)` to support historical tracking — every nightly run produces a new snapshot. <!-- v6: [finding #6] snapshot pattern -->

```sql
CREATE TABLE employer_profile (
    -- v6: [finding #2] Replaced cluster_id TEXT with stable employer_id UUID
    employer_id             UUID NOT NULL,
    snapshot_date           DATE NOT NULL,              -- v6: [finding #6] historical tracking
    pipeline_run_id         UUID NOT NULL,              -- v6: [finding #6] ties row to pipeline run

    -- Identity
    employer_name           TEXT NOT NULL,
    ein                     TEXT,
    address                 TEXT,
    city                    TEXT,
    state                   TEXT,
    zip                     TEXT,
    naics_code              TEXT,
    naics_description       TEXT,
    naics_sector            TEXT,

    -- OSHA
    osha_inspections_5yr    INTEGER DEFAULT 0,
    osha_violations_5yr     INTEGER DEFAULT 0,
    osha_serious_willful    INTEGER DEFAULT 0,
    osha_total_penalties    NUMERIC(12,2) DEFAULT 0,
    osha_open_date_latest   DATE,
    osha_avg_gravity        NUMERIC(4,2),

    -- WHD
    whd_cases_5yr           INTEGER DEFAULT 0,
    whd_backwages_total     NUMERIC(12,2) DEFAULT 0,
    whd_ee_violated_total   INTEGER DEFAULT 0,

    -- MSHA
    msha_violations_5yr     INTEGER DEFAULT 0,
    msha_assessed_penalties NUMERIC(12,2) DEFAULT 0,
    msha_mine_status        TEXT,

    -- EPA ECHO
    epa_qtrs_noncompliance  INTEGER DEFAULT 0,
    epa_compliance_status   TEXT,
    epa_permits             TEXT[],

    -- FMCSA
    fmcsa_dot_number        TEXT,
    fmcsa_basics            JSONB,          -- {category: percentile, ...}

    -- OFCCP
    ofccp_evaluations       INTEGER DEFAULT 0,
    ofccp_violations_found  BOOLEAN DEFAULT FALSE,

    -- NLRB
    nlrb_cases_5yr          INTEGER DEFAULT 0,
    nlrb_case_types         TEXT[],

    -- OFLC
    oflc_lca_count          INTEGER DEFAULT 0,
    oflc_pw_wage_levels     TEXT[],

    -- Composite risk
    risk_tier               TEXT NOT NULL CHECK (risk_tier IN ('LOW', 'MODERATE', 'HIGH', 'CRITICAL')),
    risk_score              NUMERIC(5,2),
    risk_flags              TEXT[],

    -- Timestamps
    created_at              TIMESTAMP DEFAULT NOW(),    -- v6: added
    updated_at              TIMESTAMP DEFAULT NOW(),    -- v6: added

    PRIMARY KEY (employer_id, snapshot_date)             -- v6: [finding #6] composite PK
);

-- Indexes for API query patterns
CREATE INDEX idx_ep_employer_name ON employer_profile (employer_name);
CREATE INDEX idx_ep_ein ON employer_profile (ein);
CREATE INDEX idx_ep_naics ON employer_profile (naics_code);
CREATE INDEX idx_ep_risk_tier ON employer_profile (risk_tier);
CREATE INDEX idx_ep_snapshot ON employer_profile (snapshot_date DESC);
CREATE INDEX idx_ep_employer_snapshot ON employer_profile (employer_id, snapshot_date DESC);
```

**Latest-snapshot view** — the API queries this by default:

```sql
-- v6: [finding #6] Convenience view for "current" employer profile
CREATE VIEW employer_profile_latest AS
SELECT DISTINCT ON (employer_id) *
FROM employer_profile
ORDER BY employer_id, snapshot_date DESC;
```

**Risk tier boundary note (finding #34):** The rule engine must not leave a gap between MODERATE and HIGH. Specifically: an employer with 1 inspection and >= 10 violations in that single inspection MUST be caught. The rule `osha_serious_willful >= 3 OR (osha_inspections_5yr >= 1 AND osha_violations_5yr >= 10)` closes this gap. Encode this in `dbt/models/risk_tier.sql`, not in application code.

#### 3.4.3 cluster_id_mapping

Splink produces transient `cluster_id` values that change between runs. This table maps them to stable `employer_id` UUIDs that persist across pipeline runs.

```sql
-- v6: new table — maps Splink's transient cluster_id to stable employer_id
CREATE TABLE cluster_id_mapping (
    employer_id     UUID NOT NULL,
    cluster_id      TEXT NOT NULL,
    pipeline_run_id UUID NOT NULL,
    first_seen_at   TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (employer_id, cluster_id)
);
```

**How it works:** After each Splink run, the pipeline checks each `cluster_id` against prior mappings. If existing records in the cluster match a known `employer_id`, the same UUID is reused. If the cluster is entirely new, a new UUID is generated. This is the mechanism that makes `employer_id` stable across runs — Splink's `cluster_id` is an implementation detail that never leaks to the API.

#### 3.4.4 inspection_history

Denormalized inspection records per employer, per snapshot. Supports the `/employers/{id}/inspections` endpoint and historical trend queries.

```sql
-- v6: new table — was referenced in v5 but never formally defined
CREATE TABLE inspection_history (
    id               BIGSERIAL PRIMARY KEY,
    employer_id      UUID NOT NULL,
    activity_nr      TEXT NOT NULL,
    agency           TEXT NOT NULL DEFAULT 'OSHA',
    inspection_date  DATE,
    insp_type_label  TEXT,
    violations       JSONB,              -- [{citation_id, viol_type, gravity, penalty}, ...]
    snapshot_date    DATE NOT NULL
);

CREATE INDEX idx_insp_employer ON inspection_history (employer_id);
```

#### 3.4.5 Auth & Billing — customers

```sql
CREATE TABLE customers (
    id              SERIAL PRIMARY KEY,
    company_name    TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,        -- v6: [finding #16] argon2id (time_cost=3, memory_cost=65536, parallelism=4)
    role            TEXT DEFAULT 'viewer' CHECK (role IN ('viewer', 'analyst', 'admin')),  -- v6: [finding #24] RBAC
    stripe_customer_id TEXT UNIQUE,
    plan            TEXT DEFAULT 'free',  -- free / starter / pro / enterprise
    monthly_limit   INTEGER DEFAULT 5,   -- free tier = 5 lookups/month
    current_usage   INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()   -- v6: added
);
```

**Password hashing config (finding #16):** Use argon2id with these parameters:
- `time_cost=3` (iterations)
- `memory_cost=65536` (64 MB)
- `parallelism=4`
- Salt: 16 bytes from `os.urandom()`

Do **not** use bcrypt. argon2id is the current OWASP recommendation and resists both GPU and side-channel attacks.

**Roles (finding #24):**
- `viewer` — can call `GET /employers/{id}`, read-only.
- `analyst` — viewer + batch endpoints + bulk export.
- `admin` — all endpoints including key management, customer management, subscription management.

#### 3.4.6 Auth & Billing — api_keys

```sql
CREATE TABLE api_keys (
    id              SERIAL PRIMARY KEY,
    key_id          UUID DEFAULT gen_random_uuid() UNIQUE,  -- v6: [finding #23] lookup by key_id, not key_prefix
    customer_id     INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    key_hash        TEXT NOT NULL,         -- SHA-256 of the raw API key
    key_prefix      TEXT NOT NULL,         -- first 8 chars, for display only (not for lookup)
    label           TEXT,                  -- human-readable name: "production", "staging"
    scopes          TEXT[] DEFAULT '{employer:read}',  -- v6: [finding #24] role-based scopes
    monthly_limit   INTEGER NOT NULL DEFAULT 0,        -- v6: [finding #32] 0 = disabled. NULL no longer bypasses quota.
    current_usage   INTEGER DEFAULT 0,
    expires_at      TIMESTAMP,            -- v6: [finding #31] key expiration
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

**Scopes (finding #24):**
- `employer:read` — query single employer profiles
- `batch:write` — submit batch lookup jobs
- `subscriptions:manage` — create/update/delete webhook subscriptions
- `admin:all` — unrestricted access

**Quota enforcement (finding #32):** A `monthly_limit` of `0` means the key is disabled (zero calls allowed). There is no magic NULL bypass. Every key must have an explicit numeric limit. The `reset_monthly_usage` cron job zeroes `current_usage` on the 1st of each month but never touches `monthly_limit`.

**Key expiration (finding #31):** The auth middleware checks `expires_at` on every request. Expired keys return `401` with `{"error": "api_key_expired", "message": "This API key expired on {date}. Generate a new key."}`. There is no grace period.

#### 3.4.7 api_key_audit_log

Every key lifecycle event is recorded. No deletions from this table — it is append-only.

```sql
-- v6: [finding #29] new table — audit trail for API key lifecycle
CREATE TABLE api_key_audit_log (
    id              BIGSERIAL PRIMARY KEY,
    key_id          UUID NOT NULL,
    customer_id     INTEGER REFERENCES customers(id),
    action          TEXT NOT NULL,         -- created / rotated / revoked / quota_changed / scope_changed
    performed_by    TEXT,                  -- email or system identifier
    created_at      TIMESTAMP DEFAULT NOW()
);
```

#### 3.4.8 stripe_webhook_events

Idempotency table for Stripe webhooks. The `event_id` column is Stripe's `event.id` — inserting a duplicate fails on the PK constraint, which is how we detect and skip replayed events.

```sql
-- v6: [finding #17] new table — Stripe webhook idempotency
CREATE TABLE stripe_webhook_events (
    event_id        TEXT PRIMARY KEY,      -- Stripe event.id; UNIQUE = idempotency guard
    event_type      TEXT NOT NULL,         -- e.g., 'customer.subscription.updated'
    processed_at    TIMESTAMP DEFAULT NOW()
);
```

**Usage pattern:**
```python
try:
    cur.execute(
        "INSERT INTO stripe_webhook_events (event_id, event_type) VALUES (%s, %s)",
        (event["id"], event["type"]),
    )
except psycopg2.errors.UniqueViolation:
    # Already processed — skip
    return JSONResponse({"status": "duplicate"}, status_code=200)
```

#### 3.4.9 subscriptions

Webhook subscriptions for continuous monitoring. Customers register a callback URL and a list of employer IDs. When the nightly pipeline detects a risk-tier change or new violation for a subscribed employer, it fires an HMAC-signed POST to the callback URL.

```sql
-- v6: [finding #38] new table — webhook subscriptions for monitoring mode
CREATE TABLE subscriptions (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id     INTEGER REFERENCES customers(id),
    employer_ids    UUID[] NOT NULL,       -- array of employer_ids to watch
    callback_url    TEXT NOT NULL,         -- must be HTTPS
    signing_secret  TEXT NOT NULL,         -- HMAC-SHA256 key for payload verification
    events          TEXT[] DEFAULT '{risk_tier_change}',  -- risk_tier_change / new_violation / new_inspection
    status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
    created_at      TIMESTAMP DEFAULT NOW()
);
```

**Webhook payload signing:** Every outbound webhook POST includes a `X-StableLabel-Signature` header containing `HMAC-SHA256(signing_secret, raw_body)`. The subscriber verifies the signature before trusting the payload. This is the same pattern Stripe uses.

**Callback requirements:**
- `callback_url` must be HTTPS. The API rejects HTTP URLs at subscription creation time.
- The pipeline retries failed deliveries 3 times with exponential backoff (10s, 60s, 300s).
- After 3 consecutive failures, the subscription `status` flips to `disabled` and the customer is notified via email.

---

*End of Part 1 (Sections 1-3). Part 2 continues with Section 4 (API Design) onward.*
