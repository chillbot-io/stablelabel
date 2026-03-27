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
