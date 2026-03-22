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

## C. Multi-tenant / MSP architecture

- [ ] **C9. Tenant onboarding** — How does an MSP add a new customer tenant? Multi-tenant app registration with admin consent in each tenant? Or per-tenant app registrations?
- [ ] **C10. Credential storage** — Client secrets / certificates per tenant. Where? Vault? Database with encryption? Env vars won't scale past 3 tenants.
- [ ] **C11. GDAP vs app registration** — For pure file labeling, multi-tenant app reg works. For site container labels (delegated-only), you need GDAP. Do you support both? Or skip site container labels for now?
- [ ] **C12. Tenant isolation** — One API instance serving all tenants? Or per-tenant deployments? Matters for rate limiting, data isolation, compliance.

## D. Persistence

- [ ] **D13. Database choice** — You need to store: tenant configs, label snapshots, job history, audit logs, classification results, rule mappings. Postgres? SQLite for single-MSP? Both?
- [ ] **D14. Job tracking** — Bulk operations spanning hours/days need durable job state. What happens if the process restarts mid-batch? Resume or restart?
- [ ] **D15. Audit log** — The PS module uses JSONL files. The API needs queryable audit. Same DB or separate? Retention policy?

## E. The API's own auth

- [ ] **E16. Who calls the API?** — A web frontend? MSP operators via API keys? Both?
- [ ] **E17. Permissions model** — Can any authenticated user apply labels to any tenant? Or role-based (viewer, operator, admin)?

## F. Background processing

- [ ] **F18. Task queue** — Bulk labeling 100K files is a multi-hour job. That can't be a synchronous HTTP request. Do you want a real task queue (Celery, arq, Dramatiq) or just in-process asyncio tasks with durable state?
- [ ] **F19. Scheduling** — "Run a full scan of Contoso every Sunday at 2am." Cron? Built-in scheduler? External trigger?

## G. Deployment

- [ ] **G20. Where does it run?** — Docker on Azure? Azure App Service? Customer-hosted? This shapes DB choice, secret management, and networking.
