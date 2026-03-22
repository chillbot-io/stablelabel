# StableLabel SaaS — Architecture Decisions

> This document captures all architecture decisions for the StableLabel SaaS platform.
> It supersedes conflicting decisions in PLAN.md (Electron-era) and parts of OPEN_QUESTIONS.md.
>
> Last updated: 2026-03-22

---

## Executive Summary

StableLabel is a SaaS platform that gives Microsoft 365 E3 tenants E5-grade
sensitivity label auto-labelling. MSPs use it to manage labelling across multiple
customer tenants from a single web interface.

**Core bet:** Option B — full Jobs Platform MVP with job lifecycle, background
workers, scheduling, and reporting. Not a thin "label-as-a-service" wrapper.

---

## 1. Frontend: Vite SPA

**Decision:** Vite + React SPA. Not Next.js.

**Rationale:**
- B2B dashboard behind auth — SSR/SEO irrelevant
- Single backend (FastAPI) — no ambiguity about where endpoints live
- Deployment is static files on a CDN ($5/month, zero servers)
- Existing React components from the Electron app are reusable
- Simpler mental model: frontend is dumb, backend is smart, API is the contract

**Stack:** Vite, React, TypeScript, TailwindCSS, React Router.

**Supersedes:** OPEN_QUESTIONS.md E16 mention of "React/Next.js frontend."

---

## 2. PowerShell: Kill the Module, Keep pwsh Fallbacks

**Decision:** No PowerShell module as a product surface. PowerShell is an
implementation detail for operations the Graph API cannot perform.

**What stays:**
- `pwsh` binary ships in the API container image (~200MB with Alpine)
- Thin Python wrapper shells out to `pwsh` for Compliance Center operations:
  `New-Label`, `New-LabelPolicy`, `Set-Label`, `Set-LabelPolicy`
- Graph API is tried first; PowerShell is the fallback

**Pattern:**
```python
async def create_label(tenant_id: str, label_config: LabelConfig):
    try:
        return await graph_client.create_sensitivity_label(label_config)
    except GraphApiNotSupported:
        return await powershell_runner.invoke(
            "New-Label",
            params=label_config.to_powershell_params(),
            tenant_id=tenant_id
        )
```

**Migration path:** As Graph API coverage improves, delete PowerShell fallbacks
one by one until `pwsh` can be removed from the container entirely.

**Supersedes:** PLAN.md PowerShell Module section (28 keep + 10 new cmdlets).
All cmdlet functionality moves to Python/Graph API with pwsh fallbacks.

---

## 3. Authentication: Entra ID (Two App Registrations)

**Decision:** Entra ID for all authentication. Two separate app registrations
with clear separation of concerns.

### App Registration 1: "StableLabel" (Auth Only)

Purpose: Authenticate MSP admins. Nothing else.

```
StableLabel Entra Tenant
└── App Registration: "StableLabel"
    ├── Supported account types: "Accounts in any organizational directory"
    ├── Redirect URI: https://app.stablelabel.com/auth/callback
    ├── ID tokens: enabled
    └── Permissions: openid, profile, email (minimal — no Graph access)
```

When a customer asks "what does StableLabel access in our environment?" the
answer for this app is: **nothing — it only knows who you are.**

### App Registration 2: "StableLabel Data Connector" (Graph API Access)

Purpose: Access customer tenant data for scanning and labelling.

```
App Registration: "StableLabel Data Connector"
├── Application permissions:
│   ├── Sites.Read.All (or Sites.Selected for scoped access)
│   ├── Files.ReadWrite.All
│   ├── InformationProtection.Policy.Read.All
│   └── User.Read.All (for OneDrive enumeration)
└── Used via client credentials flow (no user context needed)
```

Each customer tenant admin grants one-time consent via admin consent URL:
```
https://login.microsoftonline.com/{customer-tenant-id}/adminconsent
  ?client_id={data-connector-app-id}
  &redirect_uri=https://app.stablelabel.com/onboard/callback
```

### Token Flow

1. User hits `app.stablelabel.com` → MSAL.js redirects to Microsoft login
2. Microsoft returns an ID token (not a Graph access token)
3. SPA sends ID token to FastAPI backend
4. Backend validates token (signature, audience, issuer)
5. Backend extracts: `oid` (user ID), `tid` (MSP tenant ID), `roles` (app roles)
6. Backend looks up user in Postgres, creates session (JIT provisioning)
7. Session cookie used for all subsequent API calls
8. For Graph API calls: backend uses client credentials flow with Data Connector
   app reg, requesting tokens scoped to the target customer tenant

### Why Application Permissions (Not GDAP) for v1

- Application permissions cover file labelling, site/drive enumeration, delta
  queries, and webhooks
- Background jobs (scanning at 2am) require app-only tokens — no user present
- GDAP adds complexity: relationship lifecycle, role mapping, OBO token flow
- GDAP support planned for v2 as "delegated mode" option per tenant
- Sites.Selected can scope access per-site if customers require it

**Supersedes:** OPEN_QUESTIONS.md C9 (per-tenant app registration wizard).
We now use a single multi-tenant Data Connector app reg with per-tenant consent,
not per-tenant app registrations.

---

## 4. RBAC: Entra App Roles + Tenant Assignments

**Decision:** Entra owns users and roles. StableLabel only stores tenant
assignments (which customers can this user access).

### Roles (Defined as Entra App Roles)

| Role | Capabilities |
|------|-------------|
| **Admin** | All operations. Manage tenant connections, view all tenants, configure jobs, audit logs, app settings. Implicit access to all connected tenants. |
| **Operator** | Run/create/pause/rollback jobs, apply labels, view scan results. Assigned tenants only. |
| **Viewer** | Read-only dashboards, reports, audit logs. Assigned tenants only. |

Roles are defined in the "StableLabel" app registration manifest:
```json
"appRoles": [
  {
    "id": "<guid>",
    "displayName": "StableLabel Admin",
    "value": "Admin",
    "allowedMemberTypes": ["User"]
  },
  {
    "id": "<guid>",
    "displayName": "StableLabel Operator",
    "value": "Operator",
    "allowedMemberTypes": ["User"]
  },
  {
    "id": "<guid>",
    "displayName": "StableLabel Viewer",
    "value": "Viewer",
    "allowedMemberTypes": ["User"]
  }
]
```

Roles arrive in the ID token `roles` claim. No database lookup needed for
role-based authorization.

### Tenant Assignments (StableLabel DB)

The one thing Entra can't express: which customer tenants can a non-Admin user see.

```sql
CREATE TABLE user_tenant_access (
    msp_tenant_id   TEXT NOT NULL,    -- MSP's Entra tenant ID
    user_oid        TEXT NOT NULL,    -- User's Entra object ID
    customer_tenant_id TEXT NOT NULL, -- Which customer tenant they can access
    created_at      TIMESTAMPTZ DEFAULT now(),
    created_by      TEXT NOT NULL,    -- Who granted this access
    PRIMARY KEY (msp_tenant_id, user_oid, customer_tenant_id)
);
```

**Rule:** Admins have implicit access to all tenants (no rows needed).
Operators and Viewers require explicit rows.

### Just-In-Time User Provisioning

No user creation in StableLabel. Users materialize on first sign-in:

1. MSP admin assigns user to StableLabel in Entra with an app role
2. User signs in → StableLabel creates their record from token claims
3. If Operator/Viewer: empty dashboard until Admin assigns tenant access
4. If Admin: immediate access to all connected tenants

User leaves the company → disabled in Entra → can't get new tokens → done.
Orphaned `user_tenant_access` rows are harmless; periodic cleanup optional.

### Authorization Middleware

```python
async def authorize(request: Request, required_role: str, tenant_id: str = None):
    user = request.state.user
    role_hierarchy = {"Admin": 3, "Operator": 2, "Viewer": 1}

    if role_hierarchy.get(user.role, 0) < role_hierarchy.get(required_role, 0):
        raise HTTPException(403, "Insufficient role")

    if tenant_id and user.role != "Admin":
        has_access = await db.check_tenant_access(user.oid, tenant_id)
        if not has_access:
            raise HTTPException(403, "No access to this tenant")
```

### Security Pane

Three tabs in the web UI:

**Users tab** — Not user management. User *visibility* + tenant assignment.
- Shows all users who have signed in (JIT-provisioned)
- Role displayed (managed in Entra, read-only in StableLabel)
- Click user → checkbox panel to assign/revoke customer tenant access
- Warning badge for users with no tenant assignments

**Connected Tenants tab** — Where Admins onboard customer tenants.
- List of connected tenants with status, user count, last scan
- "Connect Tenant" button → generates admin consent URL
- Disconnect tenant (with confirmation)

**Audit Log tab** — All access changes logged.
- Tenant access grants/revocations
- User first sign-ins
- Job executions, label applications

---

## 5. Classifier: Embedded in Worker

**Decision:** Presidio/spaCy imported directly into the Python worker process.
No sidecar container.

- ~560MB memory per worker for `en_core_web_lg` model — acceptable at < 50 tenants
- Eliminates HTTP hop latency and operational complexity of a separate container
- Revisit sidecar pattern when classification becomes the scaling bottleneck

**Supersedes:** OPEN_QUESTIONS.md G20 `stablelabel-spacy` sidecar container.

---

## 6. Data Stack: PostgreSQL + TimescaleDB + DuckDB

**Decision:** All three engines from day one. Sequenced build.

### PostgreSQL (Week 1) — Source of Truth

All transactional data:
- `tenants` — Connected customer tenants
- `users` — JIT-provisioned user records
- `user_tenant_access` — Tenant assignment mappings
- `jobs` — Job definitions, state, config
- `job_checkpoints` — Durable checkpoints for resume-after-crash
- `label_definitions` — Cached from Graph API per tenant
- `policies` — Classification → label mapping rules
- `audit_events` — Partitioned by month, 2-year retention default

### TimescaleDB (Week 2-3) — Time-Series Extension

Installed as a Postgres extension (`CREATE EXTENSION timescaledb`). Same
connection string, same ORM. Hypertables for:
- `scan_results` — timestamp, tenant, file_path, classification, confidence, label_applied
- `classification_events` — timestamp, tenant, entity_type, entity_count
- `job_metrics` — files/sec throughput, error rates, labelling rates

Features used:
- Automatic time partitioning (no manual partition management)
- Continuous aggregates (materialized views for dashboards, auto-refreshed)
- Native compression (10-20x for data older than 30 days)
- Retention policies (auto-drop data older than configurable threshold)

### DuckDB (Week 3-4) — Analytics Engine

Embedded in the API process (like SQLite — no separate server). Powers:
- Report generation (PDF/CSV exports)
- Ad-hoc analytical queries across tenants and time ranges
- Dashboard aggregations over large datasets

Data access pattern:
- Reads from PostgreSQL via `postgres_scanner` (no ETL, no data duplication)
- Reads archived data from Parquet files (old audit partitions exported to Parquet)
- Columnar scan performance without touching the operational database

---

## 7. Background Processing: Redis + arq

**Decision:** Python-native stack. arq (async Redis queue) for job dispatch.

> Note: OPEN_QUESTIONS.md mentioned BullMQ (Node.js). Since the API is Python
> (FastAPI), arq is the natural choice. Same Redis backend, native async,
> lighter weight than Celery.

- Redis serves as: message broker, job queue, pub/sub (real-time job progress),
  Graph API token cache, distributed locking for tenant-scoped rate limiting
- Workers process one tenant's job at a time (tenant_id on every job)
- Job lifecycle: `PENDING → ENUMERATING → RUNNING → PAUSED → COMPLETED | FAILED | ROLLED_BACK`
- Durable checkpoints in PostgreSQL for resume-after-crash
- Scheduling via arq cron jobs or repeatable job patterns

---

## 8. Electron: Sunset

**Decision:** Freeze the Electron app. SaaS is the product.

- No new features in Electron. Security patches only until SaaS reaches parity.
- Reusable React components extracted into the Vite SPA.
- On-prem file scanning (MIP client, file servers) deferred to v2 as a headless
  agent — not Electron.
- Archive the Electron codebase when SaaS has feature parity.

**Supersedes:** PLAN.md architecture (Electron → PowerShell + Python subprocess).

---

## 9. Deployment: Azure Container Apps

Retained from OPEN_QUESTIONS.md G20 with modifications:

| Container | Purpose | Scaling |
|-----------|---------|---------|
| `stablelabel-api` | FastAPI server, RBAC, job dispatch, DuckDB embedded | HTTP load |
| `stablelabel-worker` | arq workers, Presidio embedded, Graph API calls | Queue depth |
| `redis` | Azure Cache for Redis (managed) | N/A (managed) |
| `postgres` | Azure Database for PostgreSQL Flexible (managed), TimescaleDB ext | N/A (managed) |

Frontend (Vite SPA) deployed as static files to Azure Blob Storage + CDN.

**Removed:** `stablelabel-spacy` sidecar (classifier now embedded in worker).

---

## 10. Architecture Diagram

```
                    ┌─────────────────────────────────┐
                    │         Entra ID                 │
                    │                                  │
                    │  App: "StableLabel" (auth)       │
                    │  App: "StableLabel Data" (Graph) │
                    └──────┬──────────────┬────────────┘
                           │ ID token     │ Client credentials
                           │              │ (per customer tenant)
┌──────────────┐    ┌──────▼──────────────▼────────────┐
│              │    │         FastAPI API               │
│  Vite SPA    │───▶│                                   │
│  (CDN)       │    │  ┌──────────┐  ┌──────────────┐  │
│  MSAL.js     │◀───│  │ Auth     │  │ Graph Client │  │
│              │    │  │ (Entra)  │  │ (per-tenant) │  │
└──────────────┘    │  └──────────┘  └──────────────┘  │
                    │  ┌──────────┐  ┌──────────────┐  │
                    │  │ DuckDB   │  │ Job Dispatch │  │
                    │  │ (embed)  │  │ (arq/Redis)  │  │
                    │  └──────────┘  └──────┬───────┘  │
                    └───────────┬────────────┼─────────┘
                                │            │
                    ┌───────────▼──┐  ┌──────▼─────────┐
                    │  PostgreSQL  │  │     Redis       │
                    │  + Timescale │  │  (Azure Cache)  │
                    └──────────────┘  └──────┬─────────┘
                                             │
                                      ┌──────▼─────────┐
                                      │    Workers      │
                                      │  arq + Presidio │
                                      │  + pwsh (fallback)│
                                      │  + Graph Client │
                                      └─────────────────┘
```

---

## Open Items for v2

- **GDAP support** — Delegated permissions mode for site container labels and
  compliance operations requiring user context
- **On-prem agent** — Headless Python service for file server scanning (MIP client),
  reports back to SaaS
- **API keys** — Programmatic access for MSPs who want CLI/automation
- **Per-tenant RBAC** — Operator for Contoso but Viewer for Fabrikam
- **Sites.Selected** — Scoped Graph access per customer site (vs Sites.Read.All)

---

## Decision Log

| # | Decision | Alternatives Considered | Date |
|---|----------|------------------------|------|
| 1 | Vite SPA | Next.js (SSR unnecessary for B2B, two runtimes) | 2026-03-22 |
| 2 | Kill PS module | Keep as product, keep as server subprocess | 2026-03-22 |
| 3 | Entra ID auth | Build auth (JWT/bcrypt), Auth0/Clerk, Supabase Auth | 2026-03-22 |
| 4 | Two app registrations | Single app reg (conflates auth + data access) | 2026-03-22 |
| 5 | Application permissions | GDAP (complex for v1), per-tenant app regs | 2026-03-22 |
| 6 | Entra App Roles for RBAC | DB-managed roles (extra user management surface) | 2026-03-22 |
| 7 | JIT user provisioning | Invite flow, user creation UI, SCIM sync | 2026-03-22 |
| 8 | Embedded classifier | Sidecar container (unnecessary at <50 tenants) | 2026-03-22 |
| 9 | Full data stack day 1 | Postgres-only (need reporting + volume testing) | 2026-03-22 |
| 10 | Sunset Electron | Maintain both, freeze then sunset | 2026-03-22 |
| 11 | arq (Python) | BullMQ (Node.js — wrong runtime), Celery (heavy) | 2026-03-22 |
| 12 | Jobs Platform MVP | Label-as-a-Service MVP (too thin) | 2026-03-22 |
