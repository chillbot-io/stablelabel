# Audit Report: osha_compliance_arch_v5.docx

**Audited by:** 4 parallel analysis agents (Data Architecture, Security, API Design, Operations)
**Date:** 2026-03-26
**Document:** Employer Compliance API — Architecture & Build Guide v4.0

---

## Executive Summary

The document is thorough and demonstrates strong domain knowledge. However, the audit uncovered **62 findings** across four domains, including several critical issues that would cause production failures or data integrity problems if unaddressed before launch.

**Top 5 most critical findings:**

1. **Missing `password_hash` column** on `customers` table — auth is broken as designed
2. **TRUNCATE+COPY sync causes API downtime** — ACCESS EXCLUSIVE lock blocks all reads during nightly sync
3. **`cluster_id` is unstable as a primary key** — Splink re-clustering can change IDs nightly, breaking all consumer references
4. **No `GET /v1/employer/{cluster_id}` endpoint** — fundamental REST gap; consumers cannot retrieve a profile by ID
5. **Single server, no failover** — every component runs on one box with no redundancy

---

## I. Database Architecture & Data Pipeline

### Critical

**1. TRUNCATE+COPY sync blocks the API.**
The nightly `TRUNCATE TABLE employer_profile` takes an `ACCESS EXCLUSIVE` lock. All concurrent API reads block (not read stale data — they hang) until COPY completes. For large datasets this is a multi-minute outage every night.
- **Fix:** Use a shadow-table swap: COPY into `employer_profile_staging`, build indexes there, then `ALTER TABLE ... RENAME` in a fast transaction.

**2. `cluster_id` is unstable as a PK.**
Splink re-clusters nightly and can produce different `cluster_id` values for the same employer if input data changes or thresholds are borderline. TRUNCATE+COPY destroys all prior state. API consumers caching `cluster_id` get dangling references.
- **Fix:** Introduce a stable, deterministic employer identifier (e.g., hash of EIN + canonical address) separate from the Splink artifact.

**3. CSV as intermediate format introduces silent data corruption.**
- `array_to_string(osha_top_standards_cited, ',')` is irreversible if any standard code contains a comma
- `NULL ''` in COPY conflates empty strings with NULLs — different semantic meanings for fields like `ein`
- Numeric precision and timestamp timezone handling are not addressed
- **Fix:** Use Postgres `COPY ... FROM PROGRAM` reading directly from DuckDB via a binary format, or use the shadow-table approach with direct inserts.

### High

**4. No schema migration strategy.** No Alembic/Flyway. Any column add/remove in DuckDB dbt models will break the COPY if Postgres DDL isn't updated in lockstep.

**5. No post-sync validation.** GX validates Bronze, dbt tests validate Silver, but zero validation that the Postgres COPY produced the same row count and data integrity as DuckDB.

**6. No historical state preservation.** Nightly TRUNCATE destroys all prior state. No audit table, no `updated_at`, no SCD pattern. If risk_tier changes from HIGH to LOW, there's no record it was ever HIGH.

**7. Risk tier NULL-safety is incomplete.** The document states counts DEFAULT 0, but if any column is NULL (employers with no OSHA history), comparisons like `willful >= 1` evaluate to NULL, not FALSE. Employer drops out of all tiers.

**8. No dead-letter queue or partial-failure handling.** Pipeline is linear all-or-nothing. No handling for: 5% address parsing failures, Splink OOM, transient API errors during ingest.

### Medium

**9. SQLite for monitoring is unnecessary complexity.** Postgres is already in the stack. SQLite adds a third DB engine with no concurrent-write safety.

**10. Gold vs Gold+ layer confusion.** FMCSA matching is described as "gold layer (needs employer_clusters)" but employer_clusters is a gold output. Circular dependency — FMCSA matching is actually Gold+ or a separate stage.

**11. Splink blocking on `zip5` misses multi-geography employers.** Multi-location and multi-state employers (highest compliance risk) won't be clustered together.

**12. ~80 columns in a single "God table."** Makes schema evolution painful, prevents fine-grained access control, bloats every row when most agencies have NULL data.

**13. No Splink model drift monitoring.** Static thresholds (0.80/0.85) with no precision/recall tracking over time.

**14. DuckDB file locking during concurrent access.** No mutex between pipeline writes and sync reads.

**15. Nightly pipeline is full-rebuild with no incremental processing.** Runtime scales with total data volume, not delta.

---

## II. Security & Authentication

### Critical

**16. Missing `password_hash` column on `customers` table.** The schema lists `id, email, email_verified, org_name, stripe_customer_id, tier` but no `password_hash`. The signup flow describes bcrypt(12) hashing but there's nowhere to store the result. Auth is fundamentally broken.

**17. Stripe webhook has no idempotency guard.** No deduplication on `event.id`. Stripe retries deliveries. A replayed `checkout.session.completed` generates duplicate API keys; a replayed `customer.subscription.deleted` revokes legitimately re-activated keys.
- **Fix:** Store processed `event.id` values with a unique constraint.

**18. Fire-and-forget background tasks silently swallow failures.**
```python
asyncio.create_task(_log_usage(matched))
asyncio.create_task(_update_last_used(matched['key_hash']))
```
No exception handler. Failed `_log_usage` means quota counts drift. Unhandled exceptions in `create_task` only emit stderr warnings.

**19. JWT signed with HS256 — symmetric secret risk.** Any process that reads `JWT_SECRET` can forge tokens. Susceptible to `alg:none` downgrade if library doesn't strictly enforce algorithm on verify.
- **Fix:** Use RS256/ES256 (asymmetric), or at minimum pin algorithm on decode.

### High

**20. Quota check is not atomic (TOCTOU race condition).** `SELECT COUNT(*)` then proceeding allows N concurrent requests to all pass when count = limit-1, exceeding quota by N-1.
- **Fix:** Atomic INSERT ... WHERE count < limit, or Redis INCR.

**21. No rate limiting on auth endpoints.** nginx rate-limits by `X-Api-Key` only. `/auth/signup`, `/auth/login`, `/auth/verify`, `/auth/password-reset` have zero rate limiting. Enables brute-force, credential stuffing, and token enumeration.

**22. API keys sent via email.** Email is not a secure transport. Keys are permanently recoverable from email archives.
- **Fix:** Show key once in browser session over HTTPS. Send email notification with dashboard link, not the key.

**23. `key_prefix` provides minimal fan-out.** First 12 chars of `emp_live_XXXX...` means only ~3 characters of randomness in the prefix. Leaks entropy and provides negligible DB pre-filtering benefit.
- **Fix:** Use a separate, independently-generated `key_id` (UUID) for lookup.

### Medium

**24. No RBAC or scopes.** Every valid API key has identical access to every endpoint. No read-only keys, no per-endpoint restrictions.

**25. Password reset token replay not explicitly prevented in spec.** `used` column exists but the flow description doesn't confirm `AND used = false` is checked.

**26. Test keys not isolated from production.** No documented restriction on `emp_test_` keys hitting production endpoints.

**27. 48h rotation overlap is generous for compromised keys.** Attacker has 48 hours of continued access after rotation.

**28. No CSRF protection documented** for session-based dashboard endpoints.

**29. No audit trail for key lifecycle events.** No log of key creation, rotation, or revocation.

**30. HTTP 403 for invalid key should be 401.** 403 means "authenticated but unauthorized," leaking information that the server recognized the caller.

**31. No key expiration / maximum lifetime.** Keys without `expires_at` remain valid forever.

**32. `NULL` monthly_limit bypasses quota.** `if key_row['monthly_limit'] is None: return` means a bug setting NULL grants unlimited access.

---

## III. API Design & Business Logic

### Critical

**33. No `GET /v1/employer/{cluster_id}` endpoint.** Once a caller resolves an employer via search, there's no way to fetch the full profile by ID. This is the most fundamental REST operation.

**34. Risk tier has a boundary gap.** An employer with 1 inspection and 10 violations (all "other-than-serious") falls to LOW: <2 inspections (not MEDIUM), >9 violations (not MEDIUM), no HIGH/ELEVATED triggers. 10 violations classified as LOW risk.

### High

**35. `years` parameter is duplicated and contradictory.** Document says "years param lives here, not on main /v1/employer endpoint" for inspections, but `/v1/employer` also accepts `years=1-5`. Rename one (e.g., `summary_window` vs `years`).

**36. Batch endpoint is synchronous with a hard cap of 100.** PE firms screening 200+ vendors are immediately blocked. Should be async (return `job_id`, poll for results). HTTP 413 is also wrong — 413 is "Payload Too Large" (body size); use 422.

**37. Ranking formula conflates relevance with data richness.** `pg_trgm similarity × log(inspection_count+1)` means a poorly-matching employer with many inspections ranks above a perfect name match with few inspections.

**38. No webhook/subscription mechanism.** Workers comp carriers and GRC platforms need ongoing monitoring ("notify me when risk tier changes"). Without this, every customer must poll.

**39. Confidence tier wrong for EIN-only matches.** HIGH requires EIN + address_key_exact. But an EIN is a unique federal identifier — EIN-only exact match should be HIGH confidence by definition.

**40. Three of eight sources missing from response structure.** EPA ECHO, NLRB, and OFLC are in the product description but absent from the API response schema.

### Medium

**41. No free tier or sandbox.** B2B API products targeting platform integrations require sandbox for evaluation. Developers won't commit $500/mo to test data quality.

**42. Batch pricing undefined.** Does a batch of 100 count as 1 lookup or 100?

**43. Inspections sub-resource pricing undefined.** Is `/inspections` a separate billable lookup? Paginated results could rack up charges.

**44. `possible_matches` is unbounded.** A name like "ABC Construction" could match 50+ entities. No pagination, no limit documented.

**45. `address` query parameter format unspecified.** Free-text? Structured? Behavior depends entirely on this.

**46. `address_key` is a core concept that is never defined.** Geocoded hash? Normalized string? USPS standardized?

**47. Flat agency sections don't scale.** Adding EPA, NLRB, OFLC as more top-level keys is unwieldy. Use an `agencies` array with `source` discriminator.

**48. `found:false` returns HTTP 200.** Many consumers check status codes first. Consider 404 with body, or document the 200+found:false pattern prominently.

**49. Inconsistent endpoint pluralization.** `/v1/employer` (singular) vs `/v1/employers/batch` (plural).

**50. SAM debarment in risk tier conflates unrelated signals.** SAM debarment can be for contract fraud, not workplace safety. Misleads workers comp carriers.

---

## IV. Operations & Infrastructure

### Critical

**51. Single server, no failover.** Every component on one Hetzner box. Hardware failure = total outage of API, pipeline, monitoring, and backups.

**52. `rclone sync` to R2 is destructive.** Deletes destination files not in source. If local bronze files are corrupted/deleted before sync, backups are also destroyed.
- **Fix:** Use `rclone copy` or enable R2 bucket versioning.

**53. Database ports potentially exposed to internet.** Postgres 5432 and pgBouncer 6432 are listed but firewall rules are not. If exposed, this is a data breach risk.
- **Fix:** Bind to 127.0.0.1 only. Document firewall rules (ufw/iptables).

### High

**54. rsync deploy is not atomic.** During the sync window, the running app serves a mix of old and new files. No rollback mechanism exists.

**55. Pipeline/backup race condition.** Pipeline at 02:00, compaction at 03:00 (Sundays), backup at 04:00. No flock coordination. Backup can capture inconsistent DuckDB state.

**56. No disk space monitoring.** Bronze Parquet, DuckDB, 30 days of pg_dump, and /data/tmp/ compete for the same NVMe. Full disk crashes everything.

**57. No cron job failure alerting.** Cron fails silently. Pipeline failure at 02:30 not detected until check_health.py at 08:30 — 6-hour blind spot.

**58. Memory contention on 16GB box.** DuckDB (SET memory_limit='10GB'), Splink, Postgres, pgBouncer, Metabase (JVM), and FastAPI all sharing 16GB. No memory budget per component. OOM kills likely.

### Medium

**59. `pip install` from PyPI during production deploy.** PyPI outage or yanked dependency breaks deploy. No lockfile pinning described.

**60. `systemctl restart` causes downtime.** Hard restart kills in-flight requests. No graceful reload, no readiness check.

**61. No post-deploy smoke test.** GitHub Actions workflow has no health check after deploy.

**62. No backup of operational config.** nginx config, crontabs, systemd units, secrets, .env — all lost on server failure with no documented restore procedure.

---

## Summary by Severity

| Severity | Count | Domains |
|----------|-------|---------|
| Critical | 10 | Architecture (3), Security (4), API (2), Ops (3) |
| High | 18 | Architecture (5), Security (4), API (5), Ops (5) |
| Medium | 34 | Architecture (7), Security (9), API (10), Ops (4) |

## Glaringly Missing Items

1. **`password_hash` column** — the auth system literally cannot store passwords
2. **`GET /v1/employer/{cluster_id}`** — cannot retrieve a profile by ID
3. **Stable employer identifier** — cluster_id changes nightly; no stable external key
4. **Schema migration tooling** — no Alembic/Flyway for a rapidly evolving 80-column schema
5. **Webhook/subscription system** — core buyer personas need push notifications, not polling
6. **Free tier / sandbox** — no way for developers to evaluate without $500/mo commitment
7. **Firewall rules** — database ports may be internet-exposed
8. **Rollback mechanism** — no way to undo a bad deploy
9. **Historical risk tier tracking** — PE/M&A buyers need trajectory, not just point-in-time
10. **Idempotency on Stripe webhooks** — will generate duplicate keys on retry
