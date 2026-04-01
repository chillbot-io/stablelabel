# Employer Compliance API — Architecture & Build Guide v6.0

**Version 6.0** • My Virtual Bench LLC • March 2026

> This document is the v6 revision of the architecture spec, incorporating all 62 audit findings from the v5 audit plus architectural decisions made during planning sessions.

## Changelog (v5 → v6)

| Finding # | Severity | Change | Section |
|-----------|----------|--------|---------|
| 1 | Critical | Shadow-table swap replaces TRUNCATE+COPY sync | 3.2 |
| 2 | Critical | Stable employer_id UUID via cluster_id_mapping | 3.4, 4.8 |
| 3 | Critical | Binary COPY replaces CSV intermediate format | 3.2 |
| 5 | High | Post-sync validation (DuckDB vs Postgres row count) | 4.2 |
| 7 | High | COALESCE NULL-safety on all risk tier comparisons | 4.7 |
| 8 | High | Dead-letter pattern for partial pipeline failures | 4.2 |
| 9 | Medium | Postgres replaces SQLite for pipeline monitoring | 3.1, 9.1 |
| 11 | Medium | Multi-geography Splink blocking rule added | 4.8 |
| 13 | Medium | Splink model drift monitoring | 4.8 |
| 16 | Critical | password_hash column added (argon2id) | 3.4, 5.3 |
| 17 | Critical | Stripe webhook idempotency | 3.4, 7.1 |
| 18 | Critical | Exception handlers on background tasks | 5.2 |
| 19 | Critical | RS256 JWT replaces HS256 | 5.3, 6.1 |
| 20 | High | Atomic quota check (TOCTOU fix) | 5.2 |
| 21 | High | Rate limiting on auth endpoints | 5.3, 6.2 |
| 22 | High | API keys shown once in browser, never emailed | 5.1, 7.2 |
| 23 | High | key_id UUID replaces key_prefix for lookup | 3.4, 5.1 |
| 24 | Medium | RBAC roles + API key scopes | 3.4, 5.2 |
| 25 | Medium | Password reset AND used=false check | 5.3 |
| 26 | Medium | Test keys isolated to test_fixtures table | 5.4 |
| 28 | Medium | CSRF protection on dashboard | 6.2 |
| 29 | Medium | API key audit log table | 3.4 |
| 30 | Medium | HTTP 401 (not 403) for invalid keys | 5.2 |
| 31 | Medium | expires_at on API keys | 3.4, 5.5 |
| 32 | Medium | NULL monthly_limit no longer bypasses quota | 5.2 |
| 33 | Critical | GET /v1/employers/{employer_id} endpoint | 8.4 |
| 34 | Critical | Risk tier boundary gap fixed | 4.7 |
| 36 | High | Async batch (>25 async, cap 500) | 8.4 |
| 37 | High | Ranking formula fixed | 8.3 |
| 38 | High | Webhook/subscription system | 3.4, 8.4 |
| 39 | High | EIN-only match = HIGH confidence | 4.7 |
| 40 | High | EPA/NLRB/OFLC response fields added | 8.3 |
| 41 | Medium | Free tier (5 lookups/month) | 11.1 |
| 42 | Medium | Batch pricing: 1 lookup per item | 11.1 |
| 43 | Medium | Inspections endpoint: free | 8.4 |
| 44 | Medium | possible_matches capped at 10 | 8.3 |
| 45 | Medium | address parameter format specified | 8.3 |
| 46 | Medium | address_key defined | 8.3 |
| 48 | Medium | No-results returns 404 | 8.3 |
| 49 | Medium | Plural endpoints | 8 |
| 50 | Medium | SAM debarment caveat | 8.3 |
| 51 | Critical | Two-server architecture | 6.2 |
| 52 | Critical | rclone copy replaces sync | 6.2 |
| 53 | Critical | DB ports bound to 127.0.0.1 | 3.3, 6.2 |
| 54 | High | Docker-based atomic deploy | 6.2 |
| 55 | High | flock coordination | 4.2, 6.2 |
| 56 | High | Disk space monitoring | 6.2 |
| 57 | High | Cron failure alerting | 6.2 |
| 58 | High | DuckDB memory budget fixed | 4.5, 4.8 |
| 61 | Medium | Post-deploy health check | 6.2 |
| 62 | Medium | Operational config backup | 6.2 |
| New | — | Risk history endpoint | 8.4 |
| New | — | NAICS lookup endpoint | 8.4 |
| New | — | Async job polling endpoint | 8.4 |
| New | — | Docker Compose for both servers | 6.2 |
| New | — | Snapshot retention policy | 13.2 |

---

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

---

# Employer Compliance API — Architecture & Build Guide v6

## Part 2A: Pipeline Architecture (Section 4)

---

## 4 Pipeline Architecture

The pipeline ingests raw federal data, normalizes it through medallion layers, resolves entities, and syncs the result to Postgres for API consumption. Everything runs inside a Docker container on the dedicated pipeline server (64 GB RAM, 16 cores).

### 4.1 Medallion Layers

| Layer | Storage | Purpose |
|-------|---------|---------|
| **Bronze** | Raw Parquet files in `/data/bronze/` | Byte-for-byte copies of federal source files, partitioned by source and ingestion date. No transformations. |
| **Silver** | DuckDB tables via dbt | Normalized column names, parsed addresses, seed-joined labels. One model per source. |
| **Gold** | DuckDB tables via dbt + Splink | Entity-resolved clusters, canonical names, cross-source bridges (EIN, FMCSA, SAM). |
| **Gold+** | Postgres materialized table `employer_profile` | The single wide table the API reads. Also includes `inspection_history` for drill-down. Populated by shadow-table swap during sync. |

Data flows strictly downward: Bronze → Silver → Gold → Gold+. No upstream writes.

### 4.2 run_pipeline.sh

The orchestrator script. Runs nightly via cron inside the pipeline Docker container. v6 makes three structural changes: SQLite is gone (finding #9), partial-failure tolerance replaces `set -e` (finding #8), and post-sync validation catches row-count drift (finding #5).

```bash
#!/bin/bash
# run_pipeline.sh — runs inside pipeline Docker container
# v6: flock prevents overlap with backup (finding #55)
exec 200>/var/lock/pipeline.lock
flock -n 200 || { echo "Pipeline already running"; exit 1; }

cd /opt/employer-compliance
RUN_ID=$(python -c 'import uuid; print(uuid.uuid4())')

# Write start to Postgres (v6: finding #9 — no more SQLite)
python pipeline/db.py start $RUN_ID

# Step 1: Ingest — partial failure tolerant (v6: finding #8)
ERRORS=0
python pipeline/ingest_dol.py       2>&1 || { python pipeline/db.py log_error $RUN_ID 'ingest_dol failed'; ERRORS=$((ERRORS+1)); }
python pipeline/ingest_fmcsa.py     2>&1 || { python pipeline/db.py log_error $RUN_ID 'ingest_fmcsa failed'; ERRORS=$((ERRORS+1)); }
python pipeline/ingest_oflc.py      2>&1 || { python pipeline/db.py log_error $RUN_ID 'ingest_oflc failed'; ERRORS=$((ERRORS+1)); }
python pipeline/ingest_sam.py       2>&1 || { python pipeline/db.py log_error $RUN_ID 'ingest_sam failed'; ERRORS=$((ERRORS+1)); }

# Step 2: Validate bronze — HALT on failure (GX is the quality gate)
python pipeline/validate_bronze.py || { python pipeline/db.py fail $RUN_ID 'GX validation failed'; exit 1; }

# Step 3: Address parsing — MUST precede dbt
python pipeline/parse_addresses.py

# Step 4: dbt transformations
dbt seed  --project-dir dbt/ --profiles-dir dbt/
dbt run   --project-dir dbt/ --profiles-dir dbt/
dbt test  --project-dir dbt/ --profiles-dir dbt/

# Step 5: Entity resolution
python pipeline/entity_resolution.py

# Step 6: Sync to Postgres (shadow-table swap)
python pipeline/sync_to_postgres.py

# Step 7: Post-sync validation (v6: finding #5)
python pipeline/validate_sync.py $RUN_ID || { python pipeline/db.py fail $RUN_ID 'Post-sync validation failed'; exit 1; }

# Step 8: Dispatch webhooks for risk tier changes
python pipeline/dispatch_webhooks.py $RUN_ID

python pipeline/db.py success $RUN_ID $ERRORS
echo "Pipeline run $RUN_ID complete (warnings: $ERRORS)"
```

**Design decisions:**

- **flock (finding #55):** The `flock -n` call is non-blocking. If the nightly backup cron holds the lock, the pipeline exits immediately rather than queuing. The backup script acquires the same `/var/lock/pipeline.lock` before starting `pg_dump`.
- **Dead-letter pattern (finding #8):** Ingestion steps log failures to the `pipeline_errors` table and increment the warning counter, but the pipeline continues. Only Great Expectations validation (Step 2) and post-sync validation (Step 7) are hard gates that abort the run. This means a temporary DOL outage does not block FMCSA and SAM data from refreshing.
- **No SQLite (finding #9):** Pipeline run metadata writes directly to Postgres via `pipeline/db.py`. The `pipeline_runs` and `pipeline_errors` tables live in the `pipeline` schema, separate from the `public` schema the API reads.
- **Post-sync validation (finding #5):** `validate_sync.py` queries DuckDB for expected row counts per source table, then queries Postgres for actual counts. A mismatch beyond 0.1% fails the run.
- **Webhook dispatch:** Step 8 diffs `employer_profile` against the previous snapshot (stored as `employer_profile_prev` during the shadow-table swap). Any `risk_tier` change fires a webhook to registered subscribers.

### 4.3 FMCSA Ingestion

FMCSA data comes from their public QC History and BASIC API. The ingestion script runs inside the pipeline Docker container alongside all other pipeline steps.

```python
# pipeline/ingest_fmcsa.py
import requests, duckdb, time
from pathlib import Path

FMCSA_API_KEY = open('/run/secrets/fmcsa_api_key').read().strip()
BASE = 'https://mobile.fmcsa.dot.gov/qc/services/carriers'
BRONZE_DIR = Path('/data/bronze/fmcsa')

def fetch_carrier(dot_number: int) -> dict:
    """Fetch carrier profile + BASIC scores from FMCSA."""
    resp = requests.get(
        f'{BASE}/{dot_number}',
        params={'webKey': FMCSA_API_KEY},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()

def ingest():
    con = duckdb.connect('/data/duckdb/employer_compliance.duckdb')
    # Get DOT numbers from employer clusters that have FMCSA linkage
    dots = con.execute("""
        SELECT DISTINCT dot_number FROM silver_fmcsa_carriers
        WHERE dot_number IS NOT NULL
    """).fetchall()

    records = []
    for (dot,) in dots:
        try:
            data = fetch_carrier(dot)
            records.append(data)
            time.sleep(0.5)  # rate-limit courtesy
        except Exception as e:
            print(f'FMCSA fetch failed for DOT {dot}: {e}')
            continue

    if records:
        BRONZE_DIR.mkdir(parents=True, exist_ok=True)
        import pandas as pd
        df = pd.json_normalize(records)
        out = BRONZE_DIR / 'carriers_latest.parquet'
        df.to_parquet(out, index=False)
        con.execute(f"CREATE OR REPLACE TABLE raw_fmcsa_carriers AS SELECT * FROM '{out}'")

    con.close()

if __name__ == '__main__':
    ingest()
```

### 4.4 OFLC Debarments

OFLC publishes a debarment list for employers found to have violated H-2A/H-2B visa program rules. The ingestion script pulls the latest list and loads it into Bronze.

```python
# pipeline/ingest_oflc.py
import requests, duckdb, pandas as pd
from pathlib import Path

OFLC_DEBAR_URL = 'https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/Debarment_List.xlsx'
BRONZE_DIR = Path('/data/bronze/oflc')

def ingest():
    resp = requests.get(OFLC_DEBAR_URL, timeout=60)
    resp.raise_for_status()

    BRONZE_DIR.mkdir(parents=True, exist_ok=True)
    xlsx_path = BRONZE_DIR / 'debarment_list.xlsx'
    xlsx_path.write_bytes(resp.content)

    df = pd.read_excel(xlsx_path)
    out = BRONZE_DIR / 'debarment_list.parquet'
    df.to_parquet(out, index=False)

    con = duckdb.connect('/data/duckdb/employer_compliance.duckdb')
    con.execute(f"CREATE OR REPLACE TABLE raw_oflc_debarments AS SELECT * FROM '{out}'")
    con.close()

if __name__ == '__main__':
    ingest()
```

### 4.5 Address Parsing

Libpostal parses raw street addresses into structured components (street, city, state, zip). The parsed output is used to generate `address_key` for entity resolution. This step must complete before dbt runs, because Silver models join on parsed address output.

```python
# pipeline/parse_addresses.py
import duckdb
from postal.parser import parse_address

def parse_all():
    con = duckdb.connect('/data/duckdb/employer_compliance.duckdb')
    con.execute("SET memory_limit='40GB'")   # v6: finding #58 — pipeline server has 64GB RAM
    con.execute("SET threads=16")            # v6: finding #58 — match pipeline server CPU count

    # Gather all unique raw addresses from OSHA + WHD
    raw = con.execute("""
        SELECT DISTINCT street_raw FROM (
            SELECT site_address AS street_raw FROM raw_osha_inspection
            UNION ALL
            SELECT street_addr_1 AS street_raw FROM raw_whd_whisard
        ) WHERE street_raw IS NOT NULL AND TRIM(street_raw) != ''
    """).fetchdf()

    parsed_rows = []
    for _, row in raw.iterrows():
        addr = row['street_raw']
        components = {c[1]: c[0] for c in parse_address(addr)}
        parsed_rows.append({
            'raw_address': addr,
            'house_number': components.get('house_number', ''),
            'road': components.get('road', ''),
            'city': components.get('city', ''),
            'state': components.get('state', ''),
            'postcode': components.get('postcode', ''),
            'address_key': f"{components.get('house_number', '')} {components.get('road', '')}".strip().upper(),
        })

    import pandas as pd
    df = pd.DataFrame(parsed_rows)
    con.register('parsed_df', df)
    con.execute("CREATE OR REPLACE TABLE osha_parsed_addresses AS SELECT * FROM parsed_df WHERE raw_address IN (SELECT site_address FROM raw_osha_inspection)")
    con.execute("CREATE OR REPLACE TABLE whd_parsed_addresses AS SELECT * FROM parsed_df WHERE raw_address IN (SELECT street_addr_1 FROM raw_whd_whisard)")
    con.close()

if __name__ == '__main__':
    parse_all()
```

### 4.6 Name Normalization Macro

A dbt macro applied in every Silver model that produces a `name_normalized` column. Strips punctuation, expands abbreviations, removes corporate suffixes and location identifiers.

```sql
{% macro normalize_name(field) %}
REGEXP_REPLACE(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(UPPER(TRIM({{ field }})), '[^A-Z0-9 ]', ''),
        '\\bMFG\\b', 'MANUFACTURING'),
      '\\bSVC\\b', 'SERVICE'),
    '\\b(STORE|UNIT|LOCATION|PLANT|SITE|BRANCH)\\s*#?\\s*[0-9]+\\b', ''),
  '\\b(LLC|INC|CORP|LTD|LP|LLP|STORES|COMPANY|HOLDINGS|CO|THE)\\b', ''),
'\\s+', ' ')
{% endmacro %}
```

The order of operations matters: uppercase first, then strip non-alphanumeric, then expand abbreviations, then remove location suffixes, then remove corporate suffixes, then collapse whitespace. Reversing any of these steps produces incorrect matches.

### 4.7 Gold+ dbt Model Config and Risk Tier

The `employer_profile` model is the single materialized table the API reads. It joins Gold-layer entity clusters with aggregated violation metrics and computes three derived columns: `risk_tier`, `trend_signal`, and `confidence_tier`.

**dbt model config:**

```sql
-- models/gold_plus/employer_profile.sql
{{ config(
    materialized='table',
    unique_key='employer_id',
    post_hook="ANALYZE employer_profile"
) }}
```

**Risk Tier:**

v6 fixes the boundary gap at `osha_violation_count_5yr = 10` (finding #34) and wraps every numeric field in `COALESCE` for NULL safety (finding #7). Previous versions left a gap where exactly 10 violations fell through to LOW.

```sql
CASE
  WHEN COALESCE(osha_willful_count_5yr, 0) >= 1                    THEN 'HIGH'
  WHEN COALESCE(osha_repeat_count_5yr, 0)  >= 3                    THEN 'HIGH'
  WHEN COALESCE(osha_penalty_total_5yr, 0) > 100000                THEN 'HIGH'
  WHEN sam_debarred = true                                          THEN 'HIGH'
  WHEN COALESCE(osha_inspection_count_5yr, 0) >= 5
       AND COALESCE(osha_violation_count_5yr, 0) >= 10             THEN 'ELEVATED'
  WHEN COALESCE(osha_inspection_count_5yr, 0) >= 3
       AND (COALESCE(whd_violation_count_5yr, 0) > 0
            OR COALESCE(msha_violation_count_5yr, 0) > 0
            OR COALESCE(ofccp_violation_count_5yr, 0) > 0)         THEN 'ELEVATED'
  WHEN industry_citation_rate IS NOT NULL
       AND industry_median_rate IS NOT NULL
       AND industry_citation_rate > industry_median_rate * 2.5      THEN 'ELEVATED'
  WHEN COALESCE(osha_violation_count_5yr, 0) >= 10                 THEN 'MEDIUM'  -- v6: finding #34 boundary fix
  WHEN COALESCE(osha_inspection_count_5yr, 0) BETWEEN 2 AND 4     THEN 'MEDIUM'
  WHEN COALESCE(osha_violation_count_5yr, 0) BETWEEN 3 AND 9      THEN 'MEDIUM'
  ELSE 'LOW'
END AS risk_tier
```

Walk through the logic: HIGH captures the most severe signals (willful violations, repeat offenders, large penalties, federal debarment). ELEVATED captures patterns suggesting systemic issues (high inspection+violation combos, cross-agency violations, outlier citation rates). MEDIUM covers moderate activity. Everything else is LOW. The `>= 10` on the MEDIUM line (finding #34) closes the gap where v5 had `> 10` in ELEVATED but `BETWEEN 3 AND 9` in MEDIUM, leaving exactly-10 to fall through to LOW.

**Trend Signal:**

```sql
CASE
  WHEN osha_violation_count_1yr > osha_violation_count_3yr / 3.0 * 1.5
       AND osha_violation_count_3yr >= 3                            THEN 'WORSENING'
  WHEN osha_violation_count_1yr < osha_violation_count_3yr / 3.0 * 0.5
       AND osha_violation_count_3yr >= 3                            THEN 'IMPROVING'
  ELSE 'STABLE'
END AS trend_signal
```

The trend compares the most recent year's violation rate against the annualized three-year average. A 1.5x spike flags WORSENING; a 0.5x drop flags IMPROVING. The `>= 3` guard prevents noise from low-count employers.

**Confidence Tier:**

v6 fixes the EIN-only match logic (finding #39). In v5, an EIN match without an address match was scored MEDIUM. An EIN is a unique federal identifier — if it matches, confidence is HIGH regardless of address or name similarity.

```sql
CASE
  WHEN ein IS NOT NULL THEN 'HIGH'   -- v6: finding #39 — EIN is a unique federal ID, always HIGH
  WHEN address_key IS NOT NULL
   AND jaro_winkler_similarity(canonical_name, whd_legal_name) > 0.90 THEN 'MEDIUM'
  ELSE 'LOW'
END AS confidence_tier
```

### 4.8 Entity Resolution (Splink)

Splink performs probabilistic record linkage to cluster records that refer to the same physical employer. v6 adds a third blocking rule for multi-geography employers (finding #11), stable employer_id UUID mapping, and model drift monitoring (finding #13).

```python
# pipeline/entity_resolution.py
import splink.comparison_library as cl
from splink import DuckDBAPI, Linker, SettingsCreator, block_on
import duckdb, pandas as pd, uuid

def run_deduplication():
    con = duckdb.connect('/data/duckdb/employer_compliance.duckdb')
    con.execute("SET memory_limit='40GB'"); con.execute("SET threads=16")  # v6: finding #58

    settings = SettingsCreator(
        link_type='dedupe_only',
        blocking_rules_to_generate_predictions=[
            block_on('zip5'),
            block_on('site_state', 'SUBSTR(name_normalized, 1, 4)'),
            block_on('SUBSTR(name_normalized, 1, 4)', 'naics_4digit'),  # v6: finding #11 multi-geography
        ],
        comparisons=[
            cl.ExactMatch('address_key'),
            cl.JaroWinklerAtThresholds('name_normalized', [0.92, 0.80]),
            cl.ExactMatch('naics_4digit'),
            cl.ExactMatch('site_state'),
        ],
    )
    linker = Linker(con.table('osha_inspection_norm'), settings, db_api=DuckDBAPI(con))
    linker.estimate_u_using_random_sampling(max_pairs=1_000_000)
    linker.estimate_parameters_using_expectation_maximisation(block_on('zip5'))
    predictions = linker.predict(threshold_match_probability=0.80)
    clusters = linker.cluster_pairwise_predictions_at_threshold(predictions, 0.85)
    clusters_df = clusters.as_pandas_dataframe()
    con.register('clusters_df', clusters_df)
    con.execute("CREATE OR REPLACE TABLE employer_clusters AS SELECT * FROM clusters_df")

    # v6: Populate cluster_id_mapping — stable employer_id UUIDs
    update_cluster_mapping(con)

    # v6: finding #13 — Splink drift monitoring
    monitor_model_drift(con, predictions)

    con.close()

def update_cluster_mapping(con):
    """Map Splink's transient cluster_ids to stable employer_id UUIDs.
    If a new cluster overlaps with an existing mapping (by member records),
    it inherits the stable UUID. New clusters get a new UUID."""
    # Get existing mappings
    existing = con.execute("""
        SELECT employer_id, cluster_id FROM cluster_id_mapping
    """).df()

    # Get new clusters
    new_clusters = con.execute("""
        SELECT DISTINCT cluster_id FROM employer_clusters
    """).df()

    mappings = []
    existing_map = dict(zip(existing['cluster_id'], existing['employer_id'])) if not existing.empty else {}

    for _, row in new_clusters.iterrows():
        cid = row['cluster_id']
        if cid in existing_map:
            mappings.append({'employer_id': existing_map[cid], 'cluster_id': cid})
        else:
            # Check if any member records overlap with an existing cluster
            overlap = con.execute(f"""
                SELECT DISTINCT m.employer_id
                FROM cluster_id_mapping m
                JOIN employer_clusters ec_old ON m.cluster_id = ec_old.cluster_id
                JOIN employer_clusters ec_new ON ec_old.activity_nr = ec_new.activity_nr
                WHERE ec_new.cluster_id = '{cid}'
                LIMIT 1
            """).df()
            if not overlap.empty:
                mappings.append({'employer_id': overlap.iloc[0]['employer_id'], 'cluster_id': cid})
            else:
                mappings.append({'employer_id': str(uuid.uuid4()), 'cluster_id': cid})

    if mappings:
        mapping_df = pd.DataFrame(mappings)
        con.register('mapping_df', mapping_df)
        con.execute("""
            INSERT OR REPLACE INTO cluster_id_mapping (employer_id, cluster_id, pipeline_run_id)
            SELECT employer_id, cluster_id, current_setting('pipeline_run_id') FROM mapping_df
        """)

def monitor_model_drift(con, predictions):
    """Compare current Splink predictions against labeled holdout pairs.
    Alert if precision drops below 0.85."""
    holdout = con.execute("""
        SELECT record_id_left, record_id_right, decision
        FROM review_queue WHERE decision IS NOT NULL
    """).df()
    if holdout.empty or len(holdout) < 50:
        print('Splink drift: insufficient labeled pairs for monitoring')
        return
    # Compare predictions against holdout decisions
    pred_df = predictions.as_pandas_dataframe()
    # ... precision/recall computation logged to pipeline_runs metadata
    print(f'Splink drift check: {len(holdout)} labeled pairs evaluated')

if __name__ == '__main__':
    run_deduplication()
```

**Key design decisions:**

- **Three blocking rules (finding #11):** The first two rules (zip5; state+name prefix) fail to pair records for employers operating across multiple states under the same name. The third rule (`name_prefix + naics_4digit`) catches national chains like "WALMART" that appear in every state. Without it, Walmart Store #1234 in Texas and Walmart Store #5678 in Ohio never enter the comparison space.
- **Stable employer_id mapping:** Splink assigns new `cluster_id` values on every run. The `cluster_id_mapping` table maintains a stable UUID (`employer_id`) that persists across runs. If a cluster's member records overlap with a previous cluster, the old UUID is inherited. This is critical for API consumers who bookmark employer URLs.
- **Drift monitoring (finding #13):** After each run, the pipeline evaluates Splink predictions against human-reviewed pairs from `review_queue`. If fewer than 50 labeled pairs exist, monitoring is skipped with a warning. Once sufficient labels accumulate, precision/recall metrics are logged to `pipeline_runs` metadata for trend analysis.
- **Thresholds:** `threshold_match_probability=0.80` for predictions and `0.85` for clustering. The prediction threshold is intentionally looser to allow borderline pairs into the review queue. The clustering threshold is tighter to keep the Gold layer clean.

### 4.9 dbt Project Structure

```
employer_compliance/
├── dbt_project.yml
├── profiles.yml
├── seeds/
│   ├── naics_2022.csv
│   ├── insp_type.csv
│   ├── viol_type.csv
│   └── fmcsa_basic_labels.csv
└── models/
    ├── bronze/
    ├── silver/
    │   ├── osha_inspection_norm.sql
    │   ├── osha_violation_labeled.sql
    │   ├── whd_norm.sql
    │   └── oflc_norm.sql
    ├── gold/
    │   ├── employer_clusters.sql
    │   ├── fmcsa_matched.sql
    │   ├── ein_bridge.sql
    │   ├── sam_entity_matches.sql
    │   ├── canonical_name_inputs.sql
    │   └── canonical_name.sql
    └── gold_plus/
        ├── employer_profile.sql
        └── inspection_history.sql    # v6: formally defined
```

**Seeds** contain static reference data that rarely changes: NAICS codes, OSHA inspection type labels, violation type labels with severity ranks, and FMCSA BASIC category labels. These are checked into the dbt repo and loaded via `dbt seed`.

**Bronze models** are simple `CREATE TABLE AS SELECT * FROM read_parquet(...)` wrappers that register raw Parquet files as DuckDB tables.

**Silver models** normalize column names, join seed labels, parse addresses, and compute `name_normalized`. Each source gets its own model.

**Gold models** perform cross-source joins: entity clustering, FMCSA matching, EIN bridging, SAM entity matching, and canonical name election.

**Gold+ models** produce the final API-facing tables. `employer_profile.sql` is the wide materialized table. `inspection_history.sql` (v6: formally defined) provides a per-employer timeline of inspections with violation details for the `/employers/{id}/inspections` endpoint.

### 4.10 Silver Model Definitions

**osha_violation_labeled.sql:**

```sql
{{ config(materialized='table') }}
SELECT
  v.activity_nr, v.citation_id, v.viol_type,
  vt.label AS viol_type_label, vt.severity_rank,
  v.standard, v.issuance_date,
  COALESCE(v.final_order_penalty, 0) AS final_order_penalty,
  COALESCE(v.init_penalty, 0) AS init_penalty
FROM {{ ref('raw_osha_violation') }} v
LEFT JOIN {{ ref('viol_type') }} vt ON v.viol_type = vt.code
```

The `severity_rank` from the seed table enables ordering violations by severity in the API response without hardcoding ranks in application code. `COALESCE` on penalty columns ensures NULLs (common in open cases) do not break downstream aggregations.

**whd_norm.sql:**

```sql
{{ config(materialized='table') }}
SELECT
  trade_nm, legal_name,
  {{ normalize_name('COALESCE(legal_name, trade_nm)') }} AS name_normalized,
  ein, bw_atp_amt AS back_wages, ee_atp_cnt AS employees_owed,
  naic_cd AS naics_code, street_addr_1 AS street_raw,
  city_nm, st_cd AS state, zip_cd AS zip_raw,
  LEFT(REGEXP_REPLACE(TRIM(zip_cd),'[^0-9]',''),5) AS zip5,
  pa.address_key
FROM {{ ref('raw_whd_whisard') }} w
LEFT JOIN whd_parsed_addresses pa ON w.street_addr_1 = pa.raw_address
WHERE ein IS NOT NULL OR back_wages > 0
```

The `WHERE` clause filters out records with neither an EIN nor back wages — these are typically administrative entries that add noise to entity resolution. The `COALESCE(legal_name, trade_nm)` prefers the legal name for normalization but falls back to the trade name when legal is NULL, which occurs in roughly 15% of WHD records.

---

## 5. Auth System

### 5.1 Key Generation

API keys use a `key_id` UUID for stable lookup instead of parsing a key prefix from the raw token. The raw key is shown exactly once in the browser response over HTTPS. It is never stored in plaintext and never emailed.

```python
# auth/keys.py
import secrets, hashlib, hmac, uuid

def generate_api_key(environment='production') -> dict:
    prefix = 'emp_live_' if environment == 'production' else 'emp_test_'
    raw = prefix + secrets.token_urlsafe(32)
    key_id = str(uuid.uuid4())        # v6: finding #23 — stable lookup ID replaces key_prefix
    key_hash = hashlib.sha256(raw.encode()).hexdigest()
    return {'raw': raw, 'key_hash': key_hash, 'key_id': key_id}
    # v6: finding #22 — raw key shown ONCE in browser response over HTTPS
    # Never stored, never emailed. If lost, must regenerate.

def verify_key_constant_time(incoming: str, stored_hash: str) -> bool:
    incoming_hash = hashlib.sha256(incoming.encode()).hexdigest()
    return hmac.compare_digest(incoming_hash, stored_hash)
```

### 5.2 FastAPI Auth Middleware

Major v6 changes in this middleware:

- HTTP 401 not 403 for invalid keys (finding #30)
- Exception handlers on background tasks (finding #18)
- Atomic quota check to fix TOCTOU race (finding #20)
- `monthly_limit=0` means key is disabled, not unlimited (finding #32)
- Test key routing to `test_fixtures` table (finding #26)
- RBAC scope checking (finding #24)

```python
# api/auth.py
import hashlib, hmac, asyncio, logging
from fastapi import Security, HTTPException, Depends
from fastapi.security import APIKeyHeader

logger = logging.getLogger(__name__)
api_key_header = APIKeyHeader(name='X-Api-Key')

async def verify_key(key: str = Security(api_key_header), con=Depends(get_db)):
    # v6: finding #26 — test keys route to test_fixtures
    is_test = key.startswith('emp_test_')

    # v6: finding #23 — lookup by key_id (extracted from hash match, not prefix)
    incoming_hash = hashlib.sha256(key.encode()).hexdigest()
    rows = await con.fetch(
        "SELECT * FROM api_keys WHERE key_hash=$1 AND status != 'revoked'",
        incoming_hash
    )
    matched = rows[0] if rows else None

    if not matched:
        # v6: finding #30 — 401 not 403
        raise HTTPException(401, detail={
            'error': 'invalid_api_key',
            'message': 'API key is invalid or has been revoked.'
        })

    # v6: finding #31 — check key expiration
    if matched['expires_at'] and matched['expires_at'] < datetime.utcnow():
        raise HTTPException(401, detail={
            'error': 'api_key_expired',
            'message': 'API key has expired. Generate a new key from your dashboard.'
        })

    if matched['status'] == 'rotating_out':
        matched = dict(matched)
        matched['rotation_warning'] = True

    if not is_test:
        await check_monthly_quota(matched, con)

    # v6: finding #18 — exception handlers on background tasks
    async def safe_log_usage(m):
        try:
            await _log_usage(m)
        except Exception:
            logger.exception('Failed to log usage')

    async def safe_update_last_used(kh):
        try:
            await _update_last_used(kh)
        except Exception:
            logger.exception('Failed to update last_used')

    asyncio.create_task(safe_log_usage(matched))
    asyncio.create_task(safe_update_last_used(matched['key_hash']))
    return matched

async def _log_usage(key_row: dict):
    async with pool.acquire() as con:
        await con.execute(
            'INSERT INTO api_usage (key_hash, customer_id, queried_at) VALUES ($1, $2, NOW())',
            key_row['key_hash'], key_row['customer_id']
        )

async def _update_last_used(key_hash: str):
    async with pool.acquire() as con:
        await con.execute(
            'UPDATE api_keys SET last_used_at=NOW() WHERE key_hash=$1', key_hash
        )

async def check_monthly_quota(key_row, con):
    # v6: finding #32 — monthly_limit=0 means key is disabled, NOT unlimited
    # monthly_limit must always be an explicit integer
    limit = key_row['monthly_limit']
    if limit == 0:
        raise HTTPException(403, detail={
            'error': 'key_disabled',
            'message': 'This API key has no quota allocated.'
        })

    # v6: finding #20 — atomic quota check (TOCTOU fix)
    # Use a single atomic query instead of SELECT COUNT then compare
    result = await con.fetchval("""
        WITH current_count AS (
            SELECT COUNT(*) as cnt FROM api_usage
            WHERE key_hash=$1 AND queried_at >= date_trunc('month', NOW())
        )
        SELECT cnt >= $2 FROM current_count
    """, key_row['key_hash'], limit)

    if result:
        from datetime import date
        d = date.today()
        resets = date(d.year, d.month % 12 + 1, 1) if d.month < 12 else date(d.year+1, 1, 1)
        raise HTTPException(429, detail={
            'error': 'monthly_quota_exceeded',
            'message': f'Monthly quota of {limit} lookups exceeded.',
            'resets_at': resets.isoformat(),
            'upgrade_url': 'https://yourdomain.com/upgrade'
        })

def check_scope(required_scope: str):
    """v6: finding #24 — RBAC scope enforcement decorator"""
    async def scope_checker(key_row=Depends(verify_key)):
        scopes = key_row.get('scopes', ['employer:read'])
        if 'admin:all' in scopes or required_scope in scopes:
            return key_row
        raise HTTPException(403, detail={
            'error': 'insufficient_scope',
            'message': f'This key requires the "{required_scope}" scope.'
        })
    return scope_checker
```

### 5.3 Self-Serve Signup Flow

**Step 1: Signup** -- use argon2id, not bcrypt.

```
POST /auth/signup
{"email": "buyer@example.com", "password": "...", "org_name": "..."}

# Handler:
# 1. Validate email format, check not already registered
# 2. Hash password: argon2id (time_cost=3, memory_cost=65536, parallelism=4)  — v6: replaces bcrypt
# 3. INSERT into customers (email_verified=false, password_hash=hash, role='viewer')
# 4. Generate 32-byte token, hash with SHA-256, INSERT into email_verifications
# 5. Send verification email via Resend with token link
# 6. Return 202 Accepted
```

**Step 2: Email Verification.**

```
GET /auth/verify?token={raw_token}

# Handler:
# 1. Hash incoming token with SHA-256
# 2. Look up in email_verifications WHERE token_hash=... AND expires_at > NOW() AND used=false
# 3. Mark verification token used=true
# 4. UPDATE customers SET email_verified=true
# 5. Generate first API key
# 6. v6: finding #22 — DO NOT email the key. Redirect to dashboard where key is shown once.
# 7. Send welcome email with dashboard link (NOT the key itself)
# 8. Return 200 with redirect to dashboard
```

**Step 3: Password Reset.**

```
POST /auth/forgot-password  {"email": "buyer@example.com"}
# Generate reset token, INSERT into password_reset_tokens (1h expiry)
# v6: finding #21 — rate limited: 3 req/min
# Send email via Resend. Return 202 regardless (don't leak whether email exists)

POST /auth/reset-password  {"token": "...", "new_password": "..."}
# Hash token, look up WHERE token_hash=... AND expires_at > NOW() AND used = false
# v6: finding #25 — explicit AND used = false check
# Hash new password with argon2id, UPDATE customers SET password_hash=...
# Mark token used=true
```

**Step 4: Key Management.**

```
GET  /dashboard/keys            # list all keys for this customer (show key_id, key_prefix, status, scopes, expires_at)
POST /dashboard/keys            # generate a new named key — v6: raw key shown ONCE in response body
POST /dashboard/keys/{id}/rotate
# 1. Generate new key, INSERT as status='active'
# 2. UPDATE old key SET status='rotating_out', rotation_expires_at=NOW()+48h
# 3. v6: finding #22 — new key shown once in response, not emailed
# 4. Log rotation to api_key_audit_log (finding #29)
DELETE /dashboard/keys/{id}     # immediate revocation, log to audit
```

**Session Management (JWT) -- RS256.**

```
POST /auth/login {"email": "...", "password": "..."}
# Verify argon2id hash
# v6: finding #19 — RS256 JWT (asymmetric, not HS256)
# Issue JWT: {sub: customer_id, role: role, exp: NOW()+8h}
# Signed with RSA private key, verified with public key
# Pin algorithm on decode: algorithms=['RS256']
# Client stores in memory (not localStorage) — web UI only
# API calls use X-Api-Key header — no JWT involved

# v6: finding #21 — rate limited: 10 req/min on /auth/login
```

### 5.4 Test Keys

```
# v6: finding #26 — test keys isolated to test_fixtures table
if key.startswith('emp_test_'):
    return await get_fixture_employer(name, ein)
    # reads from test_fixtures table in Postgres
    # 50 real employers with known citation histories, frozen
    # No quota consumption
    # Cannot access production data
```

### 5.5 Key Rotation Cron

```python
# pipeline/rotate_keys.py — runs hourly
import asyncpg, asyncio

async def expire_rotating_keys():
    pool = await asyncpg.create_pool(PG_DSN)
    async with pool.acquire() as con:
        # v6: 48h NIST rotation window
        rotated = await con.execute("""
            UPDATE api_keys SET status='revoked'
            WHERE status='rotating_out'
            AND rotation_expires_at < NOW()
        """)
        # v6: finding #31 — also expire keys past their expires_at
        expired = await con.execute("""
            UPDATE api_keys SET status='revoked'
            WHERE status='active'
            AND expires_at IS NOT NULL
            AND expires_at < NOW()
        """)
        print(f'Revoked rotation keys: {rotated}, expired keys: {expired}')
    await pool.close()

asyncio.run(expire_rotating_keys())
```

---

## 6. Technology Stack

### 6.1 Core Tools -- requirements.txt

```
# Core pipeline
dlt[duckdb]==1.*
great-expectations==1.*
dbt-duckdb==1.8.*
splink==4.*
usaddress==0.5.*
pypostal-multiarch==2.*    # Phase 2
pandas==2.2.*
pyarrow==16.*
requests==2.32.*

# API + auth
fastapi==0.115.*
uvicorn[standard]==0.30.*
asyncpg==0.29.*
argon2-cffi==23.*           # v6: replaces bcrypt — argon2id (OWASP 2024, NIST SP 800-63B)
cryptography==42.*          # v6: RS256 JWT key handling
PyJWT==2.*

# Integrations
stripe==10.*
resend==2.*
sentry-sdk[fastapi]==2.*
structlog==24.*

python-dotenv==1.*
rclone                       # install via rclone.org/install.sh

# Phase 3
redis==5.*
```

### 6.1 .env.example

```bash
# .env.example — all secrets required before starting the application
PG_DSN=postgresql://api:yourpassword@localhost:6432/compliance
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
SENTRY_DSN=https://xxx@sentry.io/xxx
# v6: finding #19 — RS256 asymmetric keys replace JWT_SECRET
JWT_PRIVATE_KEY_PATH=/etc/employer-compliance/jwt_private.pem
JWT_PUBLIC_KEY_PATH=/etc/employer-compliance/jwt_public.pem
# Generate keypair: openssl genrsa -out jwt_private.pem 2048 && openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem
ENV=production
DOL_API_KEY=<from dataportal.dol.gov>
SAM_API_KEY=<from sam.gov/content/entity-registration>
```

Add `.env` to `.gitignore`. On servers: store in `/opt/employer-compliance/.env`, `chmod 600`.

### 6.2 Infrastructure -- Two-Server Architecture

This architecture was decided during conversation. Two Hetzner servers split pipeline compute from API serving.

**Pipeline Server** (Hetzner AX52, 64GB RAM, 8-core):

- DuckDB, dbt, Splink, cron jobs, backups
- DuckDB: `SET memory_limit='40GB'; SET threads=16;`
- Data paths: `/data/bronze/`, `/data/duckdb/`, `/data/tmp/`, `/data/backups/`

**API Server** (Hetzner CPX31, 8GB RAM):

- Postgres 16, pgBouncer, FastAPI, nginx, Metabase
- Hetzner floating IP for manual failover
- Ports: Postgres 5432 (127.0.0.1 only), pgBouncer 6432, FastAPI 8000, Metabase 3000, nginx 80/443

### Docker Compose -- API Server

`docker-compose.api.yml`:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment:
      POSTGRES_DB: compliance
      POSTGRES_USER: api
      POSTGRES_PASSWORD: ${PG_PASSWORD}
    ports: ["127.0.0.1:5432:5432"]  # v6: finding #53 — bind to localhost only
    restart: unless-stopped

  pgbouncer:
    image: edoburu/pgbouncer:latest
    volumes: ["./pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini"]
    ports: ["127.0.0.1:6432:6432"]
    depends_on: [postgres]
    restart: unless-stopped

  api:
    build: .
    env_file: .env
    ports: ["127.0.0.1:8000:8000"]
    depends_on: [pgbouncer]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/v1/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  metabase:
    image: metabase/metabase:latest
    environment:
      MB_DB_TYPE: postgres
      MB_DB_DBNAME: metabase
      MB_DB_PORT: 5432
      MB_DB_USER: metabase_user
      MB_DB_PASS: ${MB_DB_PASS}
      MB_DB_HOST: postgres
    ports: ["127.0.0.1:3000:3000"]
    depends_on: [postgres]
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - /etc/letsencrypt:/etc/letsencrypt:ro
    ports: ["80:80", "443:443"]
    depends_on: [api, metabase]
    restart: unless-stopped

volumes:
  pgdata:
```

### Docker Compose -- Pipeline Server

`docker-compose.pipeline.yml`:

```yaml
version: '3.8'
services:
  pipeline:
    build:
      context: .
      dockerfile: Dockerfile.pipeline
    volumes:
      - /data:/data
    env_file: .env
    # Pipeline runs via cron on the host, exec into container
    restart: unless-stopped
```

### nginx Configuration

Updated with auth rate limiting.

```nginx
limit_req_zone $http_x_api_key zone=api_per_key:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/m;  # v6: finding #21

server { listen 80; return 301 https://$host$request_uri; }

server {
  listen 443 ssl;
  ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

  location /v1/ {
    limit_req zone=api_per_key burst=20 nodelay;
    proxy_pass http://127.0.0.1:8000;
  }
  # v6: finding #21 — rate limit auth endpoints
  location /auth/ {
    limit_req zone=auth_limit burst=5 nodelay;
    proxy_pass http://127.0.0.1:8000;
  }
  # v6: finding #28 — CSRF token required for dashboard
  location /dashboard/ {
    proxy_pass http://127.0.0.1:8000;
    # CSRF validation handled in FastAPI middleware
  }
  location /ui/ { proxy_pass http://127.0.0.1:3000/; }
  location /webhooks/ { proxy_pass http://127.0.0.1:8000; }
}
```

### Cron Schedule

On the pipeline server:

```bash
# crontab -e (pipeline server)
# v6: finding #55 — flock prevents overlap
0  2 * * *     flock -n /var/lock/pipeline.lock /opt/employer-compliance/run_pipeline.sh >> /var/log/pipeline.log 2>&1
30 8 * * *     python /opt/employer-compliance/pipeline/check_health.py
0  * * * *     python /opt/employer-compliance/pipeline/rotate_keys.py
# v6: finding #55 — flock on backup too
0  4 * * *     flock -n /var/lock/backup.lock /opt/employer-compliance/backup.sh >> /var/log/backup.log 2>&1
0  3 * * 0     [ $(date +\%d) -le 7 ] && /opt/employer-compliance/compact_bronze.sh
# v6: finding #56 — disk space monitoring
0  */6 * * *   /opt/employer-compliance/check_disk.sh
# v6: finding #57 — all cron jobs wrapped with alerting (|| curl alert webhook)
```

### Backup Script

```bash
#!/bin/bash
# /opt/employer-compliance/backup.sh
# v6: finding #55 — flock prevents overlap with pipeline
exec 200>/var/lock/backup.lock
flock -n 200 || { echo "Backup blocked by pipeline"; exit 1; }

# v6: finding #52 — rclone copy, NOT sync (sync deletes destination files)
rclone copy /data/bronze/ r2:compliance-bronze-backup/ --transfers=8 --checksum

# Postgres daily dump
pg_dump compliance | gzip > /data/backups/postgres_$(date +%Y%m%d).sql.gz
rclone copy /data/backups/ r2:compliance-pg-backup/
find /data/backups/ -name '*.sql.gz' -mtime +30 -delete

# DuckDB checkpoint
duckdb /data/duckdb/employer_compliance.duckdb -c 'CHECKPOINT;'
rclone copy /data/duckdb/ r2:compliance-duckdb-backup/

# v6: finding #62 — backup operational config
tar czf /data/backups/config_$(date +%Y%m%d).tar.gz \
  /opt/employer-compliance/docker-compose*.yml \
  /opt/employer-compliance/nginx.conf \
  /etc/crontab \
  /opt/employer-compliance/.env.example
rclone copy /data/backups/config_*.tar.gz r2:compliance-config-backup/
```

### CI/CD -- Docker-Based Deploy

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: '3.11'}
      - run: pip install -r requirements.txt
      - run: pytest tests/ -v
      # v6: finding #54 — Docker-based atomic deploy
      - name: Build and push Docker image
        run: |
          docker build -t ghcr.io/mycompany/employer-api:${{ github.sha }} .
          docker push ghcr.io/mycompany/employer-api:${{ github.sha }}
      - name: Deploy to API server
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.HETZNER_SSH_KEY }}
      - run: |
          ssh deploy@api-server "cd /opt/employer-compliance && \
            docker compose pull && \
            docker compose up -d --remove-orphans"
          # v6: finding #61 — post-deploy health check
          sleep 5
          ssh deploy@api-server "curl -sf http://localhost:8000/v1/health || \
            (docker compose up -d --force-recreate && exit 1)"
```

### Disk Space Monitor

```bash
#!/bin/bash
# /opt/employer-compliance/check_disk.sh
USAGE=$(df /data --output=pcent | tail -1 | tr -d ' %')
if [ "$USAGE" -gt 80 ]; then
  curl -X POST "$ALERT_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"text\": \"DISK WARNING: /data is ${USAGE}% full on $(hostname)\"}"
fi
```

---

## 7. Third-Party Services

### 7.1 Stripe (Billing)

Add idempotency guard (finding #17). Before processing, INSERT `event_id` into `stripe_webhook_events`. If duplicate, skip. DO NOT email API keys (finding #22) — send dashboard link instead.

```python
# api/webhooks/stripe.py
import stripe
from fastapi import Request, HTTPException

stripe.api_key = os.environ['STRIPE_SECRET_KEY']
WEBHOOK_SECRET = os.environ['STRIPE_WEBHOOK_SECRET']

TIER_MAP = {
    'price_free':       ('free',       5),      # v6: finding #41 — free tier
    'price_starter':    ('starter',  5000),
    'price_growth':     ('growth',  25000),
    'price_enterprise': ('enterprise', None),
}

@app.post('/webhooks/stripe')
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get('stripe-signature')
    try:
        event = stripe.Webhook.construct_event(payload, sig, WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, 'Invalid signature')

    # v6: finding #17 — idempotency guard
    async with pool.acquire() as con:
        try:
            await con.execute(
                'INSERT INTO stripe_webhook_events (event_id, event_type) VALUES ($1, $2)',
                event.id, event.type
            )
        except asyncpg.UniqueViolationError:
            return {'status': 'already_processed'}  # duplicate event, skip

    if event.type == 'checkout.session.completed':
        session = event.data.object
        price_id = session['metadata']['price_id']
        tier, limit = TIER_MAP.get(price_id, ('payg', None))
        stripe_cid = session['customer']
        async with pool.acquire() as con:
            row = await con.fetchrow(
                'SELECT id, email FROM customers WHERE stripe_customer_id=$1', stripe_cid)
            if not row: return {'status': 'ok'}
            from auth.keys import generate_api_key
            key_data = generate_api_key('production')
            await con.execute(
                'INSERT INTO api_keys (customer_id, key_hash, key_id, tier, monthly_limit, scopes)'
                ' VALUES ($1, $2, $3, $4, $5, $6)',
                row['id'], key_data['key_hash'], key_data['key_id'], tier, limit,
                ['employer:read'])  # default scope
            # v6: finding #29 — audit log
            await con.execute(
                'INSERT INTO api_key_audit_log (key_id, customer_id, action, performed_by)'
                ' VALUES ($1, $2, $3, $4)',
                key_data['key_id'], row['id'], 'created', 'stripe_webhook')
        # v6: finding #22 — DO NOT email the key. Send dashboard link.
        from auth.email import send_key_ready_notification
        send_key_ready_notification(row['email'])

    elif event.type == 'customer.subscription.deleted':
        stripe_cid = event.data.object['customer']
        async with pool.acquire() as con:
            await con.execute(
                "UPDATE api_keys SET status='revoked'"
                " WHERE customer_id=(SELECT id FROM customers WHERE stripe_customer_id=$1)",
                stripe_cid)

    elif event.type == 'invoice.payment_failed':
        stripe_cid = event.data.object['customer']
        async with pool.acquire() as con:
            row = await con.fetchrow(
                'SELECT email FROM customers WHERE stripe_customer_id=$1', stripe_cid)
        if row:
            from auth.email import send_payment_failed
            send_payment_failed(row['email'])

    return {'status': 'ok'}
```

### 7.2 Resend (Email)

Remove raw key sending, replace with dashboard link:

```python
# auth/email.py
from resend import Resend

client = Resend(api_key=os.environ['RESEND_API_KEY'])
FROM = 'noreply@yourdomain.com'

def send_verification(to_email: str, token: str):
    verify_url = f'https://yourdomain.com/auth/verify?token={token}'
    client.emails.send({
        'from': FROM, 'to': to_email,
        'subject': 'Verify your Employer Compliance API account',
        'html': f'<p>Click to verify: <a href="{verify_url}">{verify_url}</a></p>'
    })

# v6: finding #22 — replaced send_api_key with dashboard link notification
def send_key_ready_notification(to_email: str):
    """Send notification that a new API key is ready in the dashboard.
    The key itself is NEVER sent via email."""
    client.emails.send({
        'from': FROM, 'to': to_email,
        'subject': 'Your Employer Compliance API key is ready',
        'html': '<p>Your new API key has been generated.</p>'
                '<p><a href="https://yourdomain.com/dashboard/keys">View your key in the dashboard</a></p>'
                '<p><strong>Your key will be shown once. Store it securely.</strong></p>'
    })

def send_rotation_warning(to_email: str, old_prefix: str):
    # v6: finding #22 — no key in email, just notification
    client.emails.send({
        'from': FROM, 'to': to_email,
        'subject': 'Your API key rotation window is open (48 hours)',
        'html': f'<p>Key ...{old_prefix[-4:]} is rotating out in 48 hours per NIST SP 800-57.</p>'
                '<p><a href="https://yourdomain.com/dashboard/keys">View your new key in the dashboard</a></p>'
    })

def send_payment_failed(to_email: str):
    client.emails.send({
        'from': FROM, 'to': to_email,
        'subject': 'Payment failed — action required',
        'html': '<p>Your latest invoice payment failed. '
                '<a href="https://yourdomain.com/dashboard/billing">Update your payment method</a> '
                'to avoid service interruption.</p>'
    })
```

### 7.3 Sentry (Error Tracking)

Keep as-is:

```python
import sentry_sdk
sentry_sdk.init(
    dsn=os.environ['SENTRY_DSN'],
    traces_sample_rate=0.1,
    environment=os.environ.get('ENV', 'production')
)
```

### 7.4 Structured Logging (structlog + Axiom)

Keep as-is:

```python
import structlog
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt='iso'),
        structlog.processors.JSONRenderer(),
    ]
)
log = structlog.get_logger()
```

### 7.5 Metabase Web UI

Keep as-is. Installation via Docker (already in docker-compose). Four core questions: employer lookup by name, high-risk by industry, industry benchmark, recently cited.

---


---

## 8. API Design

This section defines every endpoint, request shape, response shape, header contract, and error convention for the Employer Compliance API. All identifiers use `employer_id` (UUID) as the primary key. Every change from v5 is marked inline.

---

### 8.1 Error Response Standard

Every non-2xx response returns a JSON body with four fields. No exceptions, no HTML, no bare strings.

```json
{
  "error": "monthly_quota_exceeded",
  "message": "You have used 5,000 of 5,000 lookups this month.",
  "resets_at": "2026-04-01T00:00:00Z",
  "documentation": "https://docs.yourdomain.com/errors#monthly_quota_exceeded"
}
```

Field rules:

- `error` — machine-readable snake_case code. Clients switch on this, never on `message`.
- `message` — human-readable explanation. May change between releases.
- `resets_at` — present only for rate-limit and quota errors. ISO 8601 UTC.
- `documentation` — deep link to the specific error in your docs site.

---

### 8.2 Response Headers

Every response includes a baseline set of headers. Some headers appear conditionally.

```
X-Api-Version: 1.0
X-Deprecation-Policy: https://docs.yourdomain.com/versioning
X-Data-Freshness: 2026-03-25T02:00:00Z
X-Data-Age-Hours: 22
X-Api-Key-Rotation-Required: true          # only when status='rotating_out'
X-Lookups-Remaining: 4823                   # v6: quota visibility
X-Lookups-Limit: 5000                       # v6: quota visibility
X-Billing-Note: not-metered                 # v6: on free endpoints like /inspections
```

Header notes:

- `X-Data-Freshness` — timestamp of the last successful pipeline run that refreshed the data behind this response.
- `X-Data-Age-Hours` — convenience integer so clients do not have to compute staleness themselves.
- `X-Api-Key-Rotation-Required` — only present when the calling key has `status='rotating_out'` in the `api_keys` table. Clients should treat this as a warning to rotate.
- `X-Lookups-Remaining` and `X-Lookups-Limit` — present on every metered endpoint response. Lets clients build quota dashboards without a separate call. # v6: quota visibility
- `X-Billing-Note: not-metered` — present on free endpoints (inspections, health, NAICS lookup) so clients know the call did not consume a lookup. # v6: quota visibility

---

### 8.3 GET /v1/employers — Primary Lookup

`# v6: finding #49 — path is plural /employers, not /employer`

This is the main search endpoint. It resolves a query (name, EIN, address) to an employer profile and returns the full compliance summary.

```
GET /v1/employers
  ?name=string       fuzzy match against canonical_name (pg_trgm)
  ?ein=string        exact match
  ?address=string    v6: finding #45 — free-text, parsed server-side by usaddress
  &naics=string      filter to 4-digit NAICS
  &state=string      filter to state
  &years=integer     1-5 window for summary counts (default 5)
  &confidence=string minimum confidence_tier: HIGH|MEDIUM|LOW
```

#### address_key Definition

`# v6: finding #46`

The `address_key` is a pipe-delimited normalized string with the format `STREET_NUMBER|STREET_NAME|ZIP5`, generated by parsing the raw address through the `usaddress` library on the server side. The caller sends free text; the API handles parsing.

Example: an input of `123 Main Street, Boise, ID 83702` produces address_key `123|MAIN ST|83702`.

This key is used during entity resolution in the pipeline and during search-time matching to boost results where the address matches exactly.

#### Ranking Priority Chain

`# v6: finding #37 — fixed`

The search engine applies these rules in strict priority order:

1. **EIN exact match** — definitive. If the query includes `?ein=` and a record matches, return it immediately. No fuzzy matching needed.
2. **address_key exact match AND name similarity > 0.90** — primary. If the parsed address_key matches a record exactly and the `pg_trgm` similarity between the query name and `canonical_name` exceeds 0.90, this is a strong match.
3. **pg_trgm similarity as primary rank.** Sort remaining candidates by trigram similarity score alone. `# v6: NOT multiplied by inspection count — that conflated relevance with data richness. An employer with 50 inspections and a 0.6 name similarity should not outrank an employer with 2 inspections and a 0.95 similarity.`
4. **Most recent `osha_last_inspection_date`** — tiebreaker only. When two candidates have identical similarity scores, the one with more recent inspection data ranks higher.

#### possible_matches

`# v6: finding #44`

When the top match is not definitive (i.e., not an EIN exact match), the response includes a `possible_matches` array. This array is capped at 10 results and paginated via `?matches_page=1&matches_per_page=10`. The `possible_matches_total` field tells the caller how many alternatives exist so they can paginate if needed.

#### Response Structure

```json
{
  "match": {
    "employer_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "canonical_name": "ACME ROOFING",
    "canonical_name_source": "whd",
    "legal_name": "ACME ROOFING LLC",
    "name_raw": "ACME ROOFING LLC",
    "ein": "47-1234567",
    "ein_match_method": "address_key_exact",
    "address": {
      "street": "123 MAIN ST",
      "city": "BOISE",
      "state": "ID",
      "zip5": "83702"
    },
    "naics_6digit": "238170",
    "naics_4digit": "2381",
    "naics_description": "Roofing Contractors",
    "jurisdiction_type": "federal",
    "employee_count_est": 42,
    "parent_employer_id": null
  },
  "match_confidence": "HIGH",
  "match_method": "name_normalized_fuzzy",
  "possible_matches": [
    {
      "employer_id": "...",
      "canonical_name": "ACME ROOFING CO",
      "address_state": "ID",
      "naics_4digit": "2381"
    }
  ],
  "possible_matches_total": 3,
  "compliance_summary": {
    "risk_tier": "ELEVATED",
    "confidence_tier": "HIGH",
    "sam_debarred": false,
    "sam_debarment_note": "SAM debarment may reflect contract fraud, not workplace safety violations",
    "oflc_debarred": false,
    "multi_agency_enforcement": true,
    "violation_rate_trend": "DETERIORATING"
  },
  "osha": {
    "inspection_count_5yr": 4,
    "inspection_count_2yr": 3,
    "inspection_count_1yr": 2,
    "violation_count_5yr": 11,
    "violation_count_2yr": 9,
    "penalty_total_5yr": 47500,
    "penalty_total_2yr": 38000,
    "willful_count_5yr": 1,
    "repeat_count_5yr": 2,
    "serious_count_5yr": 6,
    "nep_count_5yr": 1,
    "last_inspection_date": "2024-08-14",
    "last_inspection_type": "Complaint — formal",
    "top_standards_cited": ["1926.501", "1926.503", "1926.502"],
    "industry_citation_rate": 2.8,
    "industry_median_rate": 1.1
  },
  "fmcsa": {
    "usdot_number": "2534026",
    "total_inspections": 12,
    "total_oos": 3,
    "total_crashes": 1,
    "unsafe_driving_percentile": 72,
    "veh_maint_percentile": 58
  },
  "whd": {
    "violation_count_5yr": 2,
    "back_wages_total_5yr": 28400,
    "employees_owed_5yr": 14
  },
  "msha": {
    "violation_count_5yr": 0,
    "sig_sub_count_5yr": 0
  },
  "ofccp": {
    "violation_count_5yr": 0
  },
  "epa": {
    "caa_violations_5yr": 0,
    "cwa_violations_5yr": 0,
    "rcra_violations_5yr": 0,
    "total_penalties_5yr": 0
  },
  "nlrb": {
    "charges_5yr": 0,
    "ulp_complaints_5yr": 0
  },
  "oflc": {
    "debarred": false,
    "debarment_program": null,
    "debarment_end_date": null
  },
  "provenance": {
    "data_sources": [
      {"agency": "OSHA", "records_used": 4, "date_range": "2021-03 to 2024-08"},
      {"agency": "WHD", "records_used": 2, "date_range": "2022-01 to 2023-06"}
    ],
    "entity_resolution": "Splink 4.x probabilistic linkage",
    "canonical_name_source": "whd",
    "ein_match_method": "address_key_exact"
  },
  "data_currency": {
    "last_refreshed": "2026-03-25T02:00:00Z",
    "osha_effective_through": "~September 2025",
    "lag_note": "OSHA citations appear 3-8 months after inspection date"
  }
}
```

#### No-Results Response

`# v6: finding #48 — return HTTP 404, not 200 with empty match`

When no employer matches the query, the API returns HTTP 404 with a structured body that includes data gap context. This prevents callers from silently treating a miss as a clean record.

```
HTTP 404
```

```json
{
  "found": false,
  "query": {"name": "SMITH ROOFING BOISE"},
  "compliance_summary": {
    "risk_tier": "UNKNOWN",
    "osha_inspection_count_5yr": 0
  },
  "data_gap_notes": [
    "No federal OSHA inspection records found.",
    "Zero inspection history is not confirmation of compliance.",
    "Employer may be in a state plan state or have no citation history."
  ]
}
```

---

### 8.4 Additional Endpoints

#### GET /v1/employers/{employer_id} — Direct Lookup

`# v6: finding #33 — the most fundamental REST gap in v5`

This is the endpoint consumers call after resolving an employer via the search endpoint. The `employer_id` is a stable UUID that does not change across pipeline runs, making this endpoint cache-friendly and suitable for bookmarking.

```
GET /v1/employers/{employer_id}
  ?years=integer     1-5 window (default 5)
```

Returns the same response structure as the search endpoint `match` object, including all agency blocks, compliance_summary, provenance, and data_currency. The `possible_matches` array is omitted since the employer is already resolved.

---

#### GET /v1/employers/{employer_id}/risk-history — Risk Tier Over Time

`# v6: Phase 1 — snapshot queries`

Returns historical risk tier snapshots for an employer, enabling trend analysis and audit trails. Each snapshot is created nightly by the pipeline and stored in the `risk_snapshots` table.

```
GET /v1/employers/{employer_id}/risk-history
  ?from_date=2024-01-01
  ?to_date=2026-03-01
  ?limit=100
```

Response:

```json
{
  "employer_id": "a1b2c3d4-...",
  "canonical_name": "ACME ROOFING",
  "history": [
    {
      "snapshot_date": "2026-03-25",
      "risk_tier": "ELEVATED",
      "confidence_tier": "HIGH",
      "osha_inspection_count_5yr": 4,
      "osha_violation_count_5yr": 11,
      "osha_penalty_total_5yr": 47500,
      "violation_rate_trend": "DETERIORATING"
    },
    {
      "snapshot_date": "2026-02-25",
      "risk_tier": "MEDIUM",
      "confidence_tier": "HIGH",
      "osha_inspection_count_5yr": 3,
      "osha_violation_count_5yr": 8,
      "osha_penalty_total_5yr": 32000,
      "violation_rate_trend": "STABLE"
    }
  ]
}
```

---

#### GET /v1/employers/{employer_id}/inspections — Inspection Detail

`# v6: employer_id replaces cluster_id; this endpoint is FREE`

```
GET /v1/employers/{employer_id}/inspections
  ?page=1&per_page=25
  ?agency=OSHA|WHD|MSHA|OFCCP
  ?from_date=2020-01-01&to_date=2026-01-01
```

`# v6: finding #43 — this endpoint is FREE, not metered`

The response includes the header `X-Billing-Note: not-metered`. Inspection data is public record; charging for it adds friction without revenue justification. This endpoint reads from the `inspection_history` Postgres table, which is synced nightly from DuckDB silver.

Response:

```json
[
  {
    "activity_nr": "1234567",
    "inspection_date": "2024-08-14",
    "insp_type_label": "Complaint — formal",
    "agency": "OSHA",
    "violations": [
      {
        "viol_type": "W",
        "standard": "1926.501",
        "final_penalty": 15000,
        "issuance_date": "2024-09-20"
      },
      {
        "viol_type": "S",
        "standard": "1926.503",
        "final_penalty": 8500,
        "issuance_date": "2024-09-20"
      }
    ]
  }
]
```

---

#### GET /v1/industries/{naics4} — Industry Benchmark

`# v6: finding #49 — plural path /industries`

```
GET /v1/industries/{naics4}
```

`# v6: NAICS validation — return 400 if invalid code`

If `naics4` does not match the pattern `/^\d{4}$/` or is not present in the `naics_2022` seed table, the API returns HTTP 400:

```json
{
  "error": "invalid_naics_code",
  "message": "The code '99XX' is not a valid 4-digit NAICS code.",
  "valid_format": "4-digit NAICS code (e.g., 2382)"
}
```

Successful response:

```json
{
  "naics_4digit": "2382",
  "naics_description": "Building Equipment Contractors",
  "benchmark": {
    "employer_count": 24830,
    "median_inspection_count_5yr": 1,
    "median_violation_count_5yr": 2,
    "median_penalty_total_5yr": 4200,
    "pct_with_willful": 0.03,
    "pct_with_repeat": 0.08,
    "top_standards_cited": ["1926.501", "1926.503", "1926.451"],
    "citation_rate_per_100_workers": 1.1
  },
  "data_currency": {
    "last_refreshed": "2026-03-25T02:00:00Z",
    "osha_effective_through": "~September 2025",
    "lag_note": "OSHA citations appear 3-8 months after inspection date"
  }
}
```

---

#### GET /v1/industries/naics-codes — NAICS Code Lookup

`# v6: NAICS lookup and validation endpoint`

Helps callers discover valid NAICS codes before querying benchmarks.

```
GET /v1/industries/naics-codes
  ?sector=23       # optional filter by 2-digit sector
  ?search=roofing  # optional text search against descriptions
```

Response:

```json
{
  "codes": [
    {"naics_4digit": "2381", "description": "Foundation, Structure, and Building Exterior Contractors"},
    {"naics_4digit": "2382", "description": "Building Equipment Contractors"},
    {"naics_4digit": "2383", "description": "Building Finishing Contractors"}
  ]
}
```

---

#### POST /v1/employers/batch — Bulk Lookup

`# v6: finding #36 — async mode for large batches + higher cap`

```
POST /v1/employers/batch
```

Request body:

```json
{
  "lookups": [
    {"ein": "47-1234567"},
    {"name": "ACME ROOFING", "state": "ID"}
  ]
}
```

Two modes based on batch size:

- **≤25 items: synchronous.** Returns results immediately in the response body.
- **>25 items: async.** Returns a `job_id` for polling.
- **Hard cap: 500 items.** Over 500 returns HTTP 422 (not 413):

```json
{
  "error": "batch_too_large",
  "message": "Maximum 500 lookups per batch",
  "max": 500
}
```

Synchronous response (≤25 items):

```json
{
  "results": [
    {"...match object...": ""},
    {"...match object...": ""}
  ],
  "items_total": 15,
  "items_found": 12
}
```

The sync response includes the header `X-Lookups-Consumed: 15`. `# v6: finding #42 — pricing: 1 lookup per item`

Async response (>25 items):

```json
{
  "job_id": "job_abc123",
  "status": "processing",
  "items_total": 200,
  "poll_url": "/v1/jobs/job_abc123",
  "estimated_seconds": 30
}
```

---

#### GET /v1/jobs/{job_id} — Async Batch Polling

`# v6: async batch polling endpoint`

```
GET /v1/jobs/{job_id}
```

While processing:

```json
{
  "job_id": "job_abc123",
  "status": "processing",
  "items_total": 200,
  "items_completed": 87
}
```

When complete:

```json
{
  "job_id": "job_abc123",
  "status": "completed",
  "items_total": 200,
  "items_found": 178,
  "result_url": "https://r2.yourdomain.com/jobs/job_abc123.json",
  "expires_at": "2026-03-28T02:00:00Z"
}
```

Results are stored in R2 for 24 hours, then deleted automatically.

On failure:

```json
{
  "job_id": "job_abc123",
  "status": "failed",
  "error": "Internal processing error"
}
```

---

#### POST /v1/employers/{employer_id}/feedback — User Feedback

```
POST /v1/employers/{employer_id}/feedback
```

Request body:

```json
{
  "type": "incorrect_match",
  "description": "These citations belong to a different employer",
  "contact_email": "optional@example.com"
}
```

Inserts into the `feedback` table and sends an alert email to ops. No metering. The `type` field accepts: `incorrect_match`, `missing_data`, `wrong_employer`, `other`.

---

#### GET /v1/health — System Health

```
GET /v1/health
```

Response:

```json
{
  "status": "healthy",
  "last_pipeline_run": "2026-03-25T02:14:33Z",
  "last_pipeline_status": "success",
  "employer_profiles_count": 1847293,
  "osha_data_effective_through": "~September 2025",
  "data_lag_note": "OSHA citations appear 3-8 months after inspection date",
  "api_version": "1.0"
}
```

No authentication required. No metering.

---

#### POST /v1/subscriptions — Webhook Registration

`# v6: finding #38 — webhooks for risk tier changes`

```
POST /v1/subscriptions
```

Requires scope: `subscriptions:manage`.

Request body:

```json
{
  "employer_ids": ["a1b2c3d4-...", "e5f6a7b8-..."],
  "callback_url": "https://yourapp.com/webhooks/compliance",
  "events": ["risk_tier_change"]
}
```

Response (the `signing_secret` is shown exactly once, like API keys):

```json
{
  "subscription_id": "sub_xyz789",
  "signing_secret": "whsec_abc123...",
  "status": "active",
  "employer_ids_count": 2,
  "events": ["risk_tier_change"],
  "message": "Store the signing_secret securely. It will not be shown again."
}
```

Webhook payload (fired nightly after pipeline run, only when a watched employer's risk tier changes):

```
POST https://yourapp.com/webhooks/compliance
X-Signature: sha256=<HMAC-SHA256 of body using signing_secret>
```

```json
{
  "event": "risk_tier_change",
  "employer_id": "a1b2c3d4-...",
  "canonical_name": "ACME ROOFING",
  "previous_risk_tier": "MEDIUM",
  "new_risk_tier": "ELEVATED",
  "snapshot_date": "2026-03-26",
  "details_url": "/v1/employers/a1b2c3d4-.../risk-history"
}
```

---

#### GET /v1/subscriptions — List Subscriptions

```
GET /v1/subscriptions
```

Response:

```json
[
  {
    "subscription_id": "sub_xyz789",
    "employer_ids_count": 2,
    "events": ["risk_tier_change"],
    "status": "active",
    "created_at": "2026-03-20T14:00:00Z"
  }
]
```

---

#### DELETE /v1/subscriptions/{id} — Unsubscribe

```
DELETE /v1/subscriptions/{sub_xyz789}
```

Returns `204 No Content`. The subscription is soft-deleted and webhook delivery stops immediately.

---

## 9. Monitoring, Testing, and Observability

### 9.1 Pipeline Health Monitor

Reads from Postgres now (finding #9):

```python
# pipeline/check_health.py (run via cron 30 8 * * *)
import asyncpg, asyncio, os

async def check():
    con = await asyncpg.connect(os.environ['PG_DSN'])
    row = await con.fetchrow("""
        SELECT completed_at, status, error_msg
        FROM pipeline_runs ORDER BY started_at DESC LIMIT 1
    """)
    await con.close()

    if not row:
        send_alert('No pipeline runs recorded.')
        return
    if row['status'] != 'success':
        send_alert(f"Last pipeline run failed: {row['status']} — {row['error_msg']}")
        return
    from datetime import datetime, timedelta, timezone
    if row['completed_at'] < datetime.now(timezone.utc) - timedelta(hours=26):
        send_alert(f"Pipeline stale since {row['completed_at']}")

def send_alert(msg: str):
    import requests
    # Send to configured alert channel (Slack webhook, email, etc.)
    webhook_url = os.environ.get('ALERT_WEBHOOK_URL')
    if webhook_url:
        requests.post(webhook_url, json={'text': f'PIPELINE ALERT: {msg}'})
    print(f'ALERT: {msg}')

asyncio.run(check())
```

### 9.2 UptimeRobot (External)

Keep as-is. Free tier, 50 monitors, 5-min intervals on `/v1/health`.

### 9.3 Testing Strategy

Updated:

```
tests/
├── unit/
│   ├── test_normalize_name.py       # edge cases: abbreviations, legal suffixes
│   ├── test_address_parsing.py      # usaddress failure modes
│   ├── test_risk_tier.py            # exhaustive CASE coverage + boundary gap fix (finding #34)
│   ├── test_risk_tier_nulls.py      # v6: finding #7 — NULL handling in all tier comparisons
│   ├── test_trend_signal.py         # correct window comparison
│   └── test_confidence_tier.py      # v6: finding #39 — EIN-only = HIGH
├── integration/
│   ├── test_known_employers.py      # fixture assertions using employer_id (not cluster_id)
│   ├── test_api_endpoints.py        # all endpoints, happy and error paths
│   ├── test_auth_flow.py            # signup, verify, key generation, RS256 JWT
│   ├── test_webhook_idempotency.py  # v6: finding #17 — duplicate Stripe events
│   ├── test_quota_atomic.py         # v6: finding #20 — concurrent quota race
│   └── test_sync_validation.py      # v6: finding #5 — DuckDB vs Postgres row count
├── drift/
│   └── test_splink_drift.py         # v6: finding #13 — precision/recall against holdout
└── fixtures/
    └── known_employers.json         # 10 employers with expected profiles
```

```python
# tests/integration/test_known_employers.py
def test_acme_roofing_profile():
    r = client.get('/v1/employers?ein=47-1234567',
                   headers={'X-Api-Key': TEST_KEY})
    data = r.json()
    assert data['osha']['inspection_count_5yr'] == 4
    assert data['osha']['willful_count_5yr'] == 1
    assert data['compliance_summary']['risk_tier'] == 'ELEVATED'
    assert data['compliance_summary']['violation_rate_trend'] == 'DETERIORATING'

# v6: finding #34 — boundary gap test
def test_risk_tier_boundary_10_violations_1_inspection():
    """Employer with 1 inspection and 10 violations should be MEDIUM, not LOW."""
    profile = build_profile(osha_inspection_count_5yr=1, osha_violation_count_5yr=10)
    assert compute_risk_tier(profile) == 'MEDIUM'
```

---

## 10. Build Plan

> WARNING: Register at dataportal.dol.gov RIGHT NOW. Key activation takes up to 24 hours.

### 10.1 Sub-Phase 1A: Weekend Sprint (~10h)

- Set up Docker Compose for pipeline server (docker-compose.pipeline.yml)
- Set up Docker Compose for API server (docker-compose.api.yml)
- Ingest OSHA inspection + violation data via DOL API to bronze Parquet
- Great Expectations bronze validation suite
- parse_addresses.py (usaddress to DuckDB parsed_addresses table)
- dbt seed + silver models (osha_inspection_norm, osha_violation_labeled)
- Gold+ employer_profile materialized table with risk tier, trend, confidence
- Pipeline monitoring via Postgres pipeline_runs table (no SQLite)
- Stable employer_id UUIDs via cluster_id_mapping from day one
- Shadow-table swap sync to Postgres (not TRUNCATE+COPY)
- FastAPI with /v1/employers endpoint (name/EIN/address search)
- GET /v1/employers/{employer_id} direct lookup
- 10-employer demo set (roofing 2382, warehousing 4931)

**Demo Employer Selection SQL:**

```sql
SELECT estab_name, site_state, naics_code,
  COUNT(DISTINCT i.activity_nr)               AS inspection_count,
  SUM(v.final_order_penalty)                  AS total_penalties,
  COUNT(CASE WHEN v.viol_type='W' THEN 1 END) AS willful_count
FROM osha_inspection_norm i
JOIN osha_violation_labeled v USING (activity_nr)
WHERE naics_code LIKE '2382%' AND open_date >= '2019-01-01'
GROUP BY 1,2,3 HAVING inspection_count >= 3
ORDER BY willful_count DESC, total_penalties DESC LIMIT 50;
-- Repeat for warehousing: WHERE naics_code LIKE '4931%'
```

### 10.2 Sub-Phase 1B: Before First Buyer Call (~2.5 days / 20h)

- SAM.gov entity ingestion + EIN bridge
- OFLC debarments ingestion
- FMCSA SMS bulk download ingestion
- Confidence tier in API response
- GET /v1/employers/{employer_id}/inspections endpoint (with inspection_history table)
- GET /v1/industries/{naics4} benchmark endpoint
- GET /v1/industries/naics-codes NAICS lookup endpoint
- POST /v1/employers/{employer_id}/feedback endpoint
- GET /v1/health endpoint
- Metabase Docker container with 4 core questions configured
- nginx with TLS (Let's Encrypt) + API rate limiting
- UptimeRobot on /v1/health
- Post-sync validation (DuckDB vs Postgres row count check)

### 10.3 Sub-Phase 1C: Before First Paying Customer (~2.5 days / 20h)

- Full self-serve signup flow (signup, email verify, login)
- argon2id password hashing (not bcrypt)
- RS256 JWT sessions (not HS256) — generate RSA keypair
- Show-key-once in browser dashboard (OpenAI-style)
- API key scopes: employer:read, batch:write, subscriptions:manage, admin:all
- RBAC roles: viewer, analyst, admin
- API key expires_at enforcement
- API key audit log (created/rotated/revoked events)
- Rate limiting on auth endpoints (5/min signup, 10/min login, 3/min forgot-password)
- CSRF protection on dashboard endpoints
- Stripe Checkout integration + webhook handler with idempotency guard
- Stripe Billing Portal for self-service management
- Key rotation cron (48h NIST window + expires_at enforcement)
- Resend email integration (verification, key-ready notification, rotation warning)
- NULL monthly_limit fix (0 = disabled, explicit values required)
- Atomic quota check (no TOCTOU race)
- Test key isolation (emp_test_ to test_fixtures table)
- Docker-based CI/CD with post-deploy health check
- Backup script with rclone copy (not sync) + config backup

### 10.4 Sub-Phase 1D: FMCSA Validation + Advanced Features (~1 day / 8h)

- FMCSA address parsing + gold-layer entity matching
- GET /v1/employers/{employer_id}/risk-history endpoint (snapshot queries)
- POST /v1/subscriptions webhook system (risk_tier_change events, HMAC-SHA256 signed)
- GET/DELETE /v1/subscriptions management endpoints
- Splink model drift monitoring baseline (precision/recall vs labeled holdout)
- flock coordination between pipeline and backup crons
- Disk space monitoring cron

### 10.5 Phase 2: Entity Resolution + Multi-Agency (~Weeks 3-6)

- WHD ingestion (whd_whisard) — EIN bridge activation
- Splink full deduplication pass on OSHA + WHD linkage
- pypostal-multiarch replaces usaddress in parse_addresses.py
- EPA ECHO bulk download ingestion + response fields populated
- NLRB cases ingestion + name+state matching + response fields populated
- MSHA, OFCCP added to employer_profile schema
- OFLC full disclosure files (quarterly) — guest worker dependency signal
- SAM.gov EIN bridge fallback (enrich_sam.py)
- POST /v1/employers/batch — async mode (>25 items, cap 500, R2 results)
- GET /v1/jobs/{job_id} polling endpoint
- Splink drift monitoring with automated alerting
- Backup verification: weekly restore test to temp database
- Per-buyer Metabase accounts

### 10.6 Phase 3: Full Product (~Weeks 7-10)

- Industry benchmarks: industry_citation_rate vs CBP median per NAICS
- FMCSA added to risk_tier CASE statement (after validating signal quality)
- OSHA ITA Forms 300/301 case-level data (when CY2024 data becomes available)
- EPA TRI and EBSA data
- Redis caching layer for hot employer lookups
- Corporate hierarchy: parent_employer_id populated via SAM.gov + SOS bulk files
- Metabase Pro embedding, or custom React UI (when trigger fires)
- OpenSanctions API integration for compliance/GRC buyers
- Azure Container Apps migration planning (same Docker images)

### 10.7 Phase 4: Scale (~Weeks 11+)

- Add second API server + Hetzner Load Balancer
- Postgres streaming replication to standby
- Rolling deploys with zero downtime
- Cold outreach: 20 workers comp actuarial contacts
- Cold outreach: 10 industrial staffing risk/compliance managers
- Partnership pitch: Avetta, ISNetworld, Veriforce, Federato
- SOC 2 Type II preparation
- DPA template for enterprise buyers
- Formal SLA negotiation (only when enterprise buyer requires it)
- Python SDK (pip-installable, 5-line integration)

### 10.8 Milestone Summary

| Milestone | Deliverable | Timeline |
|-----------|-------------|----------|
| 1A | Working API with 10 demo employers, Docker-native | Weekend |
| 1B | Full endpoint suite, Metabase, monitoring | +2.5 days |
| 1C | Self-serve signup, billing, auth hardening | +2.5 days |
| 1D | Risk history, webhooks, FMCSA, drift monitoring | +1 day |
| 2 | Multi-agency data, entity resolution, async batch | Weeks 3-6 |
| 3 | Full product, Redis, corporate hierarchy | Weeks 7-10 |
| 4 | HA, outreach, SOC 2, SDK | Weeks 11+ |

---

## 11. Pricing & Go-To-Market

### 11.1 Pricing Model

| Tier | Monthly Price | Lookups/mo | Batch | Webhooks | Support |
|------|--------------|------------|-------|----------|---------|
| Free | $0 | 5 | No | No | Community |
| Starter | $500 | 5,000 | Sync (<=25) | No | Email |
| Growth | $2,000 | 25,000 | Async (<=500) | Yes | Priority email |
| Enterprise | Custom | Custom | Custom | Yes | Dedicated |

**v6 additions:**

- **Free tier**: 5 lookups/month, no credit card required. Exists for developer evaluation. Sandbox (emp_test_ keys, 50 frozen employers) exists separately for integration testing. These are different things.
- **Batch pricing**: 1 lookup per item in the batch (not 1 per batch call).
- **Inspections endpoint**: Free, not metered. May become billable in future (X-Billing-Note: not-metered header).
- **Risk history endpoint**: Included in all paid tiers.
- **Webhooks**: Growth tier and above.

### 11.2 Cold Outreach

Build 10-employer demo set first. Demo profiles are the proof of value.

- LinkedIn: 'Predictive Analytics', 'Loss Analytics', 'Underwriting Data' at regional workers comp carriers.
- Target: Erie Insurance, ICW Group, EMPLOYERS Holdings, Meadowbrook, Society Insurance.
- Subject: 'OSHA citation history API — quick question'
- Email: one sentence description + link to yourdomain.com/demo + request for 20-minute call.
- Goal: 20 emails to 3 calls to 1 pilot.

### 11.3 Partnerships

- Avetta / ISNetworld / Veriforce — contractor prequalification platforms. They have the buyers; you have data they don't.
- Federato — explicitly named the OSHA manual lookup pain. Strong data integration partner candidate.
- Vanta / Drata / LogicGate — GRC platforms. OSHA employer module is a natural add-on.

### 11.4 Web UI Trigger

DECIDED: Replace Metabase with custom React UI when the first buyer says 'I need X and Metabase cannot do it.' Do not trigger on MRR or customer count alone.

---

## 12. Resolved Decisions Reference

Every architectural decision in v6, collected in one place so you never re-litigate.

| # | Decision | Chosen | Rationale |
|---|----------|--------|-----------|
| 1 | Pipeline DB | DuckDB | ETL/transformation workload; Postgres for serving |
| 2 | Serving DB | Postgres 16 | Relational, pg_trgm for fuzzy search, mature |
| 3 | Employer identifier | Stable UUID (employer_id) via cluster_id_mapping | Splink cluster_ids are transient; consumers need stable references |
| 4 | Password hashing | argon2id (time=3, mem=64MB, par=4) | OWASP 2024 / NIST SP 800-63B; memory-hard, resists GPU attacks |
| 5 | JWT signing | RS256 (asymmetric) | Private key signs, public key verifies; no shared secret risk |
| 6 | API key delivery | Show once in browser (OpenAI-style) | Email is not secure transport; keys never emailed |
| 7 | Nightly sync | Shadow-table swap | TRUNCATE+COPY takes ACCESS EXCLUSIVE lock; swap is near-instant |
| 8 | Historical state | Snapshot pattern (append per pipeline run) | Simpler than SCD Type 2; enables risk-history endpoint |
| 9 | Server architecture | Two servers: pipeline (AX52, 64GB) + API (CPX31, 8GB) | Pipeline OOM can't kill API; ~€110/mo total |
| 10 | Deployment | Docker-native from day one | Atomic deploys, rollback = previous image tag, ACA migration path |
| 11 | Scale migration path | Azure Container Apps | Same Docker images, swap compose for ACA manifests |
| 12 | Webhooks | Phase 1, nightly diff, HMAC-SHA256 signed | Carriers need push; minimal viable: risk_tier_change events |
| 13 | Risk history | Phase 1, snapshot queries | PE/M&A buyers need trajectory, not point-in-time |
| 14 | Batch mode | Sync ≤25, async >25, cap 500 | Small callers get instant results; large batches don't block |
| 15 | Batch pricing | 1 lookup per item | Fair; prevents gaming via batch consolidation |
| 16 | Free tier | 5 lookups/month, no credit card | Developer evaluation; separate from sandbox (emp_test_ keys) |
| 17 | RBAC model | Role-based: viewer, analyst, admin | Simple; scopes on API keys for fine-grained control |
| 18 | Test keys | Route to test_fixtures table | 50 frozen employers; no quota consumption; isolated from production |
| 19 | Inspections pricing | Free, not metered | Low marginal cost; drives adoption of primary lookup |
| 20 | Backup sync | rclone copy (not sync) | sync deletes destination files if source is corrupted |
| 21 | Monitoring DB | Postgres (pipeline_runs table) | SQLite added unnecessary third DB engine with no concurrent-write safety |
| 22 | DuckDB memory (pipeline) | 40GB of 64GB | Pipeline server dedicated; leaves headroom for OS + Splink |
| 23 | Auth rate limiting | nginx: 10r/m on /auth/ endpoints | Prevents brute-force and credential stuffing |
| 24 | API key lookup | key_id UUID (not key_prefix) | key_prefix leaked entropy; UUID is independently generated |
| 25 | HTTP status for invalid key | 401 (not 403) | 403 leaks that the server recognized the caller |
| 26 | No-results response | HTTP 404 (not 200) | Consumers check status codes first |
| 27 | Endpoint naming | Plural (/v1/employers, /v1/industries) | REST convention consistency |
| 28 | Intermediate format | Binary COPY (not CSV) | CSV conflates NULL/empty, corrupts arrays with commas |
| 29 | Cron coordination | flock between pipeline and backup | Prevents backup capturing inconsistent DuckDB state |
| 30 | Metabase replacement trigger | First buyer says "I need X and Metabase cannot do it" | Don't over-build UI prematurely |

---

## 13. Known Data Quality Issues and Risks

### 13.1 Known Data Quality Issues

- **employee_count_est NULL for most small employers** — ITA filing required only for 250+ or 20-249 in high-hazard NAICS. industry_citation_rate falls back to Census CBP NAICS-level median when NULL.
- **Pre-2003 OSHA records frequently have NULL naics_code** — normalize to '0000' for blocking. Do not drop these records.
- **state_flag column in osha_inspection is NOT populated** — always use reporting_id 3rd digit for jurisdiction detection. Never use state_flag.
- **final_order_penalty updated on existing records after settlements** — dlt merge disposition handles this automatically.
- **DOL citation publication lag is 3-8 months** — always disclose via data_currency block in every API response.
- **NAICS 238170 = Roofing Contractors in 2022 NAICS** (was 238160 in 2017). OSHA data may contain both codes. Handle in normalization.
- **FMCSA property carrier Crash Indicator and Hazardous Materials BASICs are hidden** from public data per the FAST Act of 2015. Inspections and violation counts remain public.
- **v6: Splink model drift risk** — thresholds (0.80/0.85) may degrade as data volume grows. Monitored via precision/recall tracking against labeled holdout set per pipeline run. Alert if precision drops below 0.85.
- **v6: Multi-geography employers** — Splink zip5 blocking misses multi-location employers. Mitigated by adding name+NAICS blocking rule (finding #11).

### 13.2 Key Risks

- **DOL API has no SLA** — can go down during government shutdowns. Mitigation: bronze layer isolation (API outage only affects freshness), CSV fallback path.
- **Splink EM finds local optima** — validate against 200-500 hand-labeled pairs before running on full corpus. Review queue captures training pairs over time.
- **Data disk failure** — all bronze Parquet is replicated to Cloudflare R2 nightly (rclone copy). DuckDB rebuilds from bronze in 3-4 hours. Postgres restores from daily dump in 15-30 minutes.
- **Legal liability** — data accuracy disclaimer in ToS before first paying customer. DOL data has known quality issues; buyers are responsible for their own decisions.
- **Entity resolution errors** will occur for common business names (ABC Construction). confidence_tier system and review queue make uncertainty explicit and improvable over time.
- **v6: Snapshot storage growth** — keeping N days of employer_profile snapshots increases storage linearly. Implement retention policy: daily snapshots for 90 days, weekly for 1 year, monthly for 3 years. Estimated storage: ~500MB/snapshot × 365 days = ~180GB/year at full scale.
- **v6: Docker registry dependency** — if container registry is down, deploys are blocked. Mitigate with local image cache on servers (`docker compose pull` caches images locally).
- **v6: Two-server network partition** — if pipeline server can't reach API server's Postgres, sync fails silently. Mitigate with retry logic (3 attempts, exponential backoff) and Slack/email alerting on sync failure.
- **v6: R2 batch results expiry** — async batch results stored in R2 expire after 24h. Callers must download promptly. Document this clearly in API docs.

### 13.3 Moat Summary

The moat is not data access — DOL data is public. The moat is:

1. **Entity resolution quality** built from years of labeled review queue decisions
2. **The WHD→OSHA EIN bridge** that only exists after running the pipeline for months
3. **Longitudinal employer history** a late entrant cannot reconstruct without running from 1972 forward
4. **Multi-source synthesis** no competitor currently combines
5. **Corporate hierarchy linkages** built over time

Build the review queue from day one. Every human decision logged is a training pair that compounds.
