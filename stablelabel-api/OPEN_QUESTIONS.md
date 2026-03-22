# StableLabel API — Open Architecture Questions

These questions must be resolved before building beyond the scaffold.
Each answer shapes the production architecture.

Status key: `[ ]` = open, `[x]` = decided

---

## A. How does the app discover what to label?

- [ ] **A1. Site/drive enumeration** — How do you crawl a tenant? Enumerate all sites → drives → items? Or does the MSP point at specific sites/libraries?
- [ ] **A2. Delta queries vs full scan** — Graph supports `delta` on driveItems for change tracking. Do you do a one-time full scan then delta going forward? Or full scan every time?
- [ ] **A3. Webhooks** — Graph change notifications can push "file modified" events. Do you want real-time labeling or scheduled batch?
- [ ] **A4. Scope configuration** — Per-tenant: "label everything in these 3 sites" vs "label everything in the tenant." Who configures this and where?

## B. How does classification drive labeling?

- [ ] **B5. Rules engine** — "If file contains SSN → Confidential", "If file contains credit cards → Highly Confidential." Where do these rules live? Hardcoded? Config file? Database? UI-configurable?
- [ ] **B6. Content extraction** — To classify, you need file content. Graph can download files. But downloading 100K files to run Presidio on them is expensive. How selective are you?
- [ ] **B7. Classification → label mapping** — The classifier returns entity types (PERSON, SSN, CREDIT_CARD) with confidence scores. Something needs to map those to sensitivity label IDs. That mapping is tenant-specific (every org has different label names).
- [ ] **B8. Classification caching** — Do you re-classify files that haven't changed? Or store classification results and only re-scan on modification?

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
