# StableLabel API — Open Architecture Questions

These questions must be resolved before building beyond the scaffold.
Each answer shapes the production architecture.

Status key: `[ ]` = open, `[x]` = decided

---

## Core Concept: Jobs

> Everything is a **Job**. A job is the central unit of work in StableLabel.
> It encapsulates: **scope** (which tenant, sites, drives, folders), **classification
> rules** (what sensitive data types to detect), **label action** (which sensitivity
> label to apply), **access control** (whether to enforce protection), and
> **execution mode** (one-time scan, scheduled, or real-time via deltas/webhooks).
>
> This gives MSPs granularity that Purview's built-in GUI does not offer.
>
> **Example job:** "AutoLabel-Contoso-HR" — scans the HR folder on the Admin
> SharePoint site. When PII, PHI, or PCI is found, apply "Highly Confidential"
> with access control restrictions defined in the job config.

---

## A. How does the app discover what to label?

- [x] **A1. Site/drive enumeration** — Enumerate all sites → drives → folders for the tenant. The user can then select entire sites OR drill down to specific folders when creating a job. Granularity goes all the way to the folder level.

- [x] **A2. Delta queries vs full scan** — One-time full scan on first run, then monitor deltas going forward. No redundant full rescans.

- [x] **A3. Webhooks / real-time** — Configurable per job. User chooses: real-time monitoring (auto-label policies via Graph change notifications + delta queries) OR scheduled bulk jobs. This is a job-level setting.

- [x] **A4. Scope configuration** — Configured in the **Jobs tab** during job creation. The job definition is where all scope, rules, and scheduling live. No separate "scope config" — it's all part of the job.

## B. How does classification drive labeling?

- [x] **B5. Rules engine** — Rules are defined **in the job** via a "Policies" system. When creating a job, user enables classification-based labeling (checkbox), then selects which **policies** to apply. Policies live in a dedicated **Policies pane** (see below).

- [x] **B6. Content extraction** — Graph API does not support server-side classification; files must be downloaded. Architecture: **stream-and-discard pipeline** — stream file bytes from Graph `/content` endpoint → extract text in memory (tika/python-docx/pdfplumber) → run Presidio → discard content immediately. No files stored on disk. Parallelized workers for throughput (similar to how Varonis and BigID handle cloud scanning — both pull content via API connectors with distributed workers, classify in memory, discard).

- [x] **B7. Classification → label mapping — Policies pane** — Two-tier system:
  - **Out-of-the-box policies:** Pre-built rules shipped with StableLabel (e.g., "Any PCI detected → Highly Confidential", "PHI detected → Highly Confidential").
  - **Custom policies:** User-defined rules with full flexibility (e.g., "If >5 instances of PII → Confidential", "If SSN + credit card in same file → Highly Confidential with access control").
  - Policies map detected entity types + thresholds → tenant-specific label IDs. The label mapping is configured per-tenant since every org names their labels differently.
  - **Label Configuration pane:** Users can also create/manage sensitivity labels and label policies directly from StableLabel, which get pushed to the tenant. **Note:** Graph API is read-only for label creation. Label/policy creation requires Security & Compliance PowerShell (`New-Label`, `New-LabelPolicy`) under the hood. We wrap these via our existing PS module.

- [x] **B8. Classification caching** — Only classify new files and deltas. Store classification results in the database. Files that haven't changed since last scan are skipped entirely.

---

## Pricing & Unit Economics (500K files/tenant baseline)

### Microsoft API Costs — assignSensitivityLabel

The Graph `assignSensitivityLabel` API is a **metered API**: **$0.00185 per label assignment** ($185 per 100K files). Requires a `Microsoft.GraphServices/accounts` Azure resource linking the app registration to an active Azure subscription. Without it, you get evaluation mode (limited free calls) then `HTTP 402`.

Setup:
```bash
az graph-services account create \
  --resource-group myRG \
  --resource-name myGraphAppBilling \
  --subscription <azure-subscription-id> \
  --location global \
  --app-id <app-registration-id>
```

Requires: Azure subscription (Pay-As-You-Go or EA), Application Owner/Admin on app reg, Contributor/Owner on subscription. Confidential client only. Not available in GCC.

> **Note (March 2026):** Unconfirmed reports suggest Microsoft may have stopped actively billing for this API. Docs still list it as metered. Build pricing assuming it's billed; treat any change as upside.

### Per-Tenant API Cost (500K files, 7% monthly churn)

| Item | Calculation | Annual Cost |
|---|---|---|
| Initial full scan (Year 1 only) | 500,000 × $0.00185 | $925 |
| Monthly delta labeling | 35,000 × $0.00185 × 12 | $777 |
| **Year 1 total** | | **$1,702** |
| **Year 2+ total** | | **$777** |

### Infrastructure Costs (multi-tenant, amortized @ 50 tenants)

| Component | Monthly (shared) | Per-tenant/mo | Annual/tenant | Notes |
|---|---|---|---|---|
| Compute (App Service B2 / Container Apps) | $55 | $1.10 | $13.20 | API + classification workers |
| PostgreSQL Flexible (Burstable B1ms) | $25 | $0.50 | $6.00 | Jobs, classification cache, audit |
| Key Vault | $5 | $0.10 | $1.20 | Tenant secrets, certificates |
| Blob Storage | $10 | $0.20 | $2.40 | Metadata only, no file content |
| Log Analytics / monitoring | $15 | $0.30 | $3.60 | Audit trail, diagnostics |
| Bandwidth (Graph download egress) | $20 | $0.40 | $4.80 | ~250GB initial scan, deltas much less |
| **Total infra** | **$130** | **$2.60** | **$31.20** | |

### Misc Overhead

| Item | Per-tenant/year | Notes |
|---|---|---|
| Support/ops labor allocation | $200 | Lean team, amortized |
| Compliance PowerShell compute | $25 | Label creation, bursty |
| Throttling buffer (429 retry overhead) | $50 | Extra compute for backoff |
| **Total overhead** | **$275** | |

### Full COGS Stack (per tenant/year)

| Cost Category | Year 1 | Year 2+ |
|---|---|---|
| Microsoft API (label assignments) | $1,702 | $777 |
| Infrastructure (@ 50 tenants) | $31 | $31 |
| Overhead | $275 | $275 |
| **Total COGS** | **$2,008** | **$1,083** |

### Pricing at SaaS Margins (industry standard: 75-80% gross)

| Target Gross Margin | Year 1 Price | Year 2+ Price | Blended Annual |
|---|---|---|---|
| 75% (conservative) | $8,032 | $4,332 | $6,182 |
| 78% (median B2B SaaS) | $9,127 | $4,923 | $7,025 |
| 80% (strong) | $10,040 | $5,415 | $7,728 |

### Recommended Pricing Tiers

| Tier | Files | Monthly | Annual | Blended Margin |
|---|---|---|---|---|
| **Starter** | Up to 100K | $199/mo | $1,990/yr | ~82% |
| **Professional** | Up to 500K | $499/mo | $4,990/yr | ~75% Y1 / 82% Y2+ |
| **Enterprise** | Up to 2M | $1,499/mo | $14,990/yr | ~80% |

### Key Insights

1. **Microsoft API cost is the biggest COGS line** — not infrastructure. Margin depends on file churn rate.
2. **Year 2 is dramatically cheaper** — delta-only scanning. Annual contracts smooth this out.
3. **At 50+ tenants, infra cost is noise** — multi-tenant model scales well.
4. **If Microsoft stops billing `assignSensitivityLabel`**, margins jump to 90%+ overnight.
5. **Show estimated API cost at job creation** — transparency is a differentiator vs Varonis/BigID opaque pricing.
6. **Cost monitoring** — charges appear in Azure Cost Management under "Microsoft Graph services", split by app and calling tenant. Useful for per-customer billing passthrough.

---

## C. Multi-tenant / MSP architecture

- [x] **C9. Tenant onboarding** — **Tenant Management pane/blade** in the UI with a **guided wizard** for adding new tenants. The wizard walks the MSP operator through: (1) creating the app registration in the customer's Entra ID, (2) granting the required API permissions and admin consent, (3) copying the client ID and secret back into StableLabel. MSP operators can also manage existing tenants from this view. **Per-tenant app registration only** — each customer tenant gets its own app registration. No multi-tenant app reg.

- [x] **C10. Credential storage** — **Dual-option encrypted vault, SOC 2 compliant.** Users choose their vault backend during setup:
  - **StableLabel Vault (default):** Built-in encrypted secrets store (AES-256-GCM, envelope encryption). Master encryption key sourced from environment config at deployment. Zero external dependencies.
  - **Azure Key Vault (optional):** For customers who require HSM-backed key management (FIPS 140-2 Level 2) or already have Key Vault in their environment. User provides their Key Vault URI and grants StableLabel access.
  - Both backends satisfy SOC 2 requirements: encryption at rest, access logging, key rotation support, RBAC on secret access. The vault backend is a deployment-level setting configured in the **Tenant Management pane** — can be set globally or overridden per tenant.

- [x] **C11. GDAP vs app registration** — **File labeling only for now.** Per-tenant app registrations with application permissions (`Files.ReadWrite.All`, `Sites.ReadWrite.All`) are sufficient for file-level sensitivity labels via `assignSensitivityLabel`. Site container labels are out of scope for v1. See GDAP explainer below.

  > **GDAP Explainer — Granular Delegated Admin Privileges:**
  >
  > GDAP is Microsoft's model for MSPs/partners to manage customer tenants *on behalf of* users in those tenants. It replaced DAP (Delegated Admin Privileges) which gave partners blanket Global Admin — a security nightmare.
  >
  > **How it works:**
  > - The MSP establishes a GDAP relationship with a customer tenant (customer admin approves it)
  > - The MSP requests specific Entra ID roles (e.g., SharePoint Admin, Compliance Admin) — not blanket Global Admin
  > - MSP technicians are assigned to security groups that map to those roles
  > - When an MSP tech calls Graph API, they use **delegated permissions** — acting *as* a user in the customer tenant with only the GDAP-granted roles
  >
  > **Why it matters for labeling:**
  > - `assignSensitivityLabel` on files → works with **application permissions** (app reg) — no GDAP needed
  > - `assignSensitivityLabel` on **site containers** (applying a label to an entire SharePoint site) → requires **delegated permissions** only, meaning GDAP is required for an MSP to do this cross-tenant
  > - Some compliance operations (label creation via Graph beta, DLP policies) also require delegated context
  >
  > **Why we skip it for v1:**
  > - Per-tenant app registrations with app-only permissions cover file labeling, site/drive enumeration, delta queries, and webhooks
  > - GDAP adds complexity: relationship lifecycle management, role mapping, token acquisition via `on-behalf-of` flow
  > - Site container labels are a nice-to-have, not core to the MVP
  > - Can add GDAP support later as a "delegated mode" option per tenant

- [x] **C12. Tenant isolation** — **Single API deployment, tenant-scoped sessions.** One API process serves all tenants. The UI has a **tenant selector dropdown** on the main page — user picks which tenant to work with, the API loads that tenant's credentials from the encrypted vault, and all operations are scoped to that tenant for the session. Strict logical isolation per session — no cross-tenant data leakage. Simpler to deploy and operate than per-tenant containers while still providing clean isolation for rate limiting, data, and compliance.

## D. Persistence

- [x] **D13. Database choice** — **PostgreSQL (OLTP) + TimescaleDB (time-series) + DuckDB (OLAP/reporting).**
  - **PostgreSQL** for all transactional data: tenant configs, label snapshots, job state, rule mappings, audit logs. Postgres handles millions of rows with proper indexing, excellent JSONB support, and native table partitioning for large tables (partition audit logs by month).
  - **TimescaleDB** (Postgres extension, not a separate DB) for high-resolution job metrics: files-per-second throughput, labelling rates by hour, error rates over time. Hypertable compression, continuous aggregates, and `time_bucket()` queries power the live job dashboard.
  - **DuckDB** (embedded, no server) for the reporting module and ad-hoc analytics. Columnar engine makes analytical scans over millions of rows 10-100x faster than row-oriented Postgres. Reads directly from Postgres via `postgres_scanner` — no ETL, no data duplication. Also reads Parquet natively, so archived audit data (old partitions exported to compressed Parquet) remains queryable at full speed with zero storage cost in Postgres.
  - **The split:** Postgres owns the writes and real-time state. TimescaleDB powers the live streaming dashboard. DuckDB powers the reporting module — label distribution across sites, compliance coverage percentages, trend analysis, exportable report generation. Each engine does what it's best at.
  - **Why this works operationally:** Postgres + TimescaleDB is one process. DuckDB is embedded in the API process (no separate server). Total infrastructure: one Postgres instance. DuckDB adds analytical superpowers with zero additional ops burden.

- [x] **D14. Job tracking & running jobs pane** — **Real-time job dashboard with streaming progress, statistics, and rollback.**
  - **Running Jobs Pane** shows:
    - **Realistic progress bars** — driven by actual file counts (files processed / total files enumerated), not fake timers. Pre-enumeration gives us the denominator upfront.
    - **Labelling statistics by hour** — live-updating chart (files labelled, errors, skipped) pulled from TimescaleDB continuous aggregates. Refreshes every 5–10 seconds.
    - **Current file(s) being labelled** — streaming view showing the active batch of files in flight, with file name, site, and label being applied. WebSocket or SSE push from the worker to the frontend.
    - **Job controls** — Pause, Resume, Stop, and **Rollback**. Rollback replays the job's checkpoint log in reverse, removing labels that were applied (using the `removeSensitivityLabel` Graph call). Partial rollback supported (roll back to a specific checkpoint).
  - **Durable job state:** Each job writes checkpoint rows to `job_checkpoints` (job_id, batch_number, file_ids, status, timestamp). On process restart, the job resumes from the last committed checkpoint — no re-processing of already-labelled files.
  - **Job lifecycle:** `PENDING → ENUMERATING → RUNNING → PAUSED → COMPLETED | FAILED | ROLLED_BACK`

- [x] **D15. Audit log & reporting foundation** — **Same Postgres DB, partitioned audit table, built for the reporting module.**
  - `audit_events` table partitioned by month: (event_id, tenant_id, job_id, event_type, actor, target_file, target_site, label_applied, previous_label, metadata JSONB, created_at). Retention policy configurable per tenant (default 2 years, admin-adjustable).
  - **Indexes:** composite on (tenant_id, created_at), on (job_id), on (event_type) for fast reporting queries.
  - **Reporting module** powered by DuckDB querying Postgres via `postgres_scanner` + archived Parquet files. Continuous aggregates in TimescaleDB pre-compute hourly/daily rollups for the live dashboard; DuckDB handles the heavy analytical queries (cross-tenant summaries, label distribution reports, compliance trend analysis, CSV/Excel exports over large date ranges). No separate data warehouse needed.
  - **Archival strategy:** Old audit partitions (e.g., >6 months) can be exported to compressed Parquet files and detached from Postgres. DuckDB queries them seamlessly alongside live data — the reporting module doesn't know or care whether data is in Postgres or Parquet.
  - The PS module's JSONL audit files are still written as a secondary output for customers who want file-based exports, but the DB is the source of truth.

## E. The API's own auth

- [ ] **E16. Who calls the API?** — A web frontend? MSP operators via API keys? Both?
- [ ] **E17. Permissions model** — Can any authenticated user apply labels to any tenant? Or role-based (viewer, operator, admin)?

## F. Background processing

- [ ] **F18. Task queue** — Bulk labeling 100K files is a multi-hour job. That can't be a synchronous HTTP request. Do you want a real task queue (Celery, arq, Dramatiq) or just in-process asyncio tasks with durable state?
- [ ] **F19. Scheduling** — "Run a full scan of Contoso every Sunday at 2am." Cron? Built-in scheduler? External trigger?

## G. Deployment

- [ ] **G20. Where does it run?** — Docker on Azure? Azure App Service? Customer-hosted? This shapes DB choice, secret management, and networking.
