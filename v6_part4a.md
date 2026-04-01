## Section 10 — Build Plan

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

## Section 11 — Pricing & Go-To-Market

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
