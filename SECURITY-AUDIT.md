# StableLabel Red Team Security Audit

**Date**: 2026-03-25
**Scope**: Full-stack security audit — API, frontend, infrastructure, business logic, data model
**Method**: 6 parallel automated security agents targeting different attack surfaces

---

## Executive Summary

**47 unique findings** across 6 audit domains. The application has solid foundations (SQLAlchemy ORM prevents SQLi, React JSX auto-escaping prevents XSS, Electron sandboxing is strong, HMAC-signed consent state is well-implemented). However, there are **critical multi-tenant isolation failures**, a **vulnerable JWT library**, **command injection risk in PowerShell**, and **zero inbound rate limiting** that together create a high-risk attack surface.

| Severity | Count | Immediate Action Required |
|----------|-------|--------------------------|
| CRITICAL | 5 | Yes — data breach / RCE risk |
| HIGH | 10 | Yes — within 1 week |
| MEDIUM | 18 | Plan for next sprint |
| LOW | 14 | Backlog / hardening |

---

## CRITICAL FINDINGS

### C1. Cross-MSP Tenant Data Access via Admin Role Bypass

**File**: `stablelabel-api/app/core/rbac.py:46-65`
**Attack**: An Admin from MSP-A passes a `customer_tenant_id` belonging to MSP-B. The `check_tenant_access()` function lets Admins pass unconditionally (line 56-57) with no MSP ownership check. This grants full read/write access to another organization's jobs, documents, labels, policies, and reports.
**Impact**: Complete cross-organization data breach.
**Fix**: Add MSP ownership verification for all roles:
```python
stmt = select(CustomerTenant).where(
    CustomerTenant.id == uuid.UUID(customer_tenant_id),
    CustomerTenant.msp_tenant_id == uuid.UUID(user.msp_tenant_id),
)
if (await db.execute(stmt)).scalar_one_or_none() is None:
    raise HTTPException(403, "No access to this tenant")
```

---

### C2. Vulnerable JWT Library (`python-jose`) — Signature Bypass CVEs

**File**: `stablelabel-api/pyproject.toml:16`
**Attack**: `python-jose` is unmaintained and has CVE-2024-33663 and CVE-2024-33664, enabling JWT signature bypass via ECDSA/HMAC key confusion. An attacker can forge valid-looking tokens.
**Impact**: Complete authentication bypass.
**Fix**: Replace with `PyJWT[crypto]` or `joserfc`. Update `entra_auth.py` accordingly.

---

### C3. JIT User Provisioning Trusts Token Role Claims

**File**: `stablelabel-api/app/core/entra_auth.py:136-170`
**Attack**: First-time sign-in takes the role from the Entra ID token's `roles` claim. Anyone can create a free Entra tenant, configure `"Admin"` in their app roles, and sign in. Combined with C1, a self-provisioned Admin from a rogue tenant accesses all MSP data.
**Impact**: Privilege escalation to Admin on first login.
**Fix**: Default all JIT-provisioned users to `"Viewer"`. Require an existing Admin to promote users.

---

### C4. Mass Assignment on Job Config Bypasses Safety Controls

**File**: `stablelabel-api/app/routers/jobs.py:38-41, 206-212`
**Attack**: `CreateJobRequest.config` is an unvalidated `dict`. The worker reads `assignment_method` and `confirm_encryption` from it (executor.py:487-491). An Operator sets `{"assignment_method": "privileged", "confirm_encryption": true}` to bypass label downgrade checks and the encryption guard — the two primary safety controls.
**Impact**: Bypass all label protection policies; mass-encrypt files irreversibly.
**Fix**: Define a strict `JobConfig` Pydantic model. Remove `assignment_method` and `confirm_encryption` from user-settable fields; require Admin authorization for privileged operations.

---

### C5. ReDoS via User-Supplied Regex in Policy Rules

**Files**: `stablelabel-api/app/services/policy_engine.py:306-314, 469-478, 639-647`
**Attack**: Operators create policies with pathological regex patterns (e.g., `(a+)+$`). These are compiled with `re.compile()` and run against document text via `finditer()`. Catastrophic backtracking hangs the worker indefinitely.
**Impact**: Denial of service on the entire classification worker pool.
**Fix**: Use Google's `re2` library (linear-time guarantee) or enforce regex timeout. Validate patterns at creation time, rejecting nested quantifiers.

---

## HIGH FINDINGS

### H1. PowerShell Command Injection via Escape Bypass

**File**: `stablelabel-api/app/services/powershell_runner.py:192-254`
The `_escape_ps_string` method doesn't handle backtick (`` ` ``) as an input character. In double-quoted PowerShell contexts, sequences like `` `$(Invoke-Expression 'cmd') `` may survive escaping. The cmdlet allowlist provides defense-in-depth, but the injection vector exists in parameter values.
**Fix**: Pass parameters via JSON file/stdin instead of string interpolation. Use `-EncodedCommand` with base64.

### H2. Docker Container Runs as Root

**File**: `stablelabel-api/Dockerfile:22-52`
No `USER` directive — uvicorn runs as root. RCE gives root privileges, easing container escape.
**Fix**: Add `RUN adduser --disabled-password --no-create-home appuser && USER appuser`.

### H3. PostgreSQL Port Exposed to All Interfaces

**File**: `docker-compose.yml:10-11`
`ports: "5432:5432"` binds to 0.0.0.0. Combined with the default password `stablelabel`, this is a direct path to data exfiltration from any host on the network.
**Fix**: Remove the `ports` mapping or bind to `127.0.0.1:5432:5432`.

### H4. Redis Exposed Without Authentication

**File**: `docker-compose.yml:24-25`
Redis on 0.0.0.0:6379 with no `requirepass`. Attackers can read/write job signals, exfiltrate cached data, or pivot via `MODULE LOAD`.
**Fix**: Remove host port binding. Add `command: redis-server --requirepass ${REDIS_PASSWORD}`.

### H5. Hardcoded Default Database Password

**Files**: `docker-compose.yml:8,42`, `stablelabel-api/app/config.py:12`
Default password `stablelabel` in multiple locations. If env vars aren't set, the system runs with a guessable password.
**Fix**: Remove all default passwords. Make `database_url` a required field with no fallback.

### H6. Graph API URL Path Injection via drive_id/item_id

**Files**: `stablelabel-api/app/routers/documents.py:94-100`, `stablelabel-api/app/services/document_service.py:65-68`
`drive_id` and `item_id` are interpolated into Graph API URL paths without validation. `drive_id=../../users/admin` accesses unintended endpoints.
**Fix**: Validate IDs against a strict pattern (alphanumeric + hyphens). URL-encode path segments.

### H7. SSRF via @odata.nextLink in Graph Client

**File**: `stablelabel-api/app/services/graph_client.py:92,157`
`get_all_pages` follows `@odata.nextLink` URLs. A crafted Graph response could redirect requests (with Bearer token) to an attacker's server.
**Fix**: Validate all followed URLs point to `graph.microsoft.com` before making requests.

### H8. Missing Content-Security-Policy on Web Frontend

**File**: `stablelabel-web/nginx.conf:8-12`
No CSP header. Any XSS injection executes without restriction. The Electron GUI has a strict CSP, but the web deployment does not.
**Fix**: Add `Content-Security-Policy` header in nginx.conf.

### H9. SSE Progress Stream — Unbounded Connections

**File**: `stablelabel-api/app/routers/jobs.py:506-584`
SSE endpoint polls DB every 2s indefinitely until job completes. No max duration, no per-user limit. Hundreds of connections exhaust server resources.
**Fix**: Add max stream duration (5 min), per-user connection limits, and consider Redis Pub/Sub.

### H10. Worker Queue Flooding — No Job Submission Limits

**Files**: `stablelabel-api/app/routers/jobs.py:185-227`, `stablelabel-api/app/worker/settings.py:205`
Unlimited job creation/starts. Worker pool is only 4 concurrent jobs. Hundreds of queued jobs create massive backlog with unbounded fan-out of sub-tasks.
**Fix**: Enforce max concurrent running jobs per tenant (e.g., 3). Add queue depth checks.

---

## MEDIUM FINDINGS

| # | Finding | File | Fix |
|---|---------|------|-----|
| M1 | No HTTP-level rate limiting on any inbound endpoint | `main.py` | Add `slowapi` or Redis-backed rate limiter middleware |
| M2 | Audit log visible to Viewers across all tenant data | `routers/audit.py:42-95` | Restrict non-Admins to their assigned tenants |
| M3 | `user_tenant_access` not MSP-scoped in RBAC | `core/rbac.py:59-64` | Join through `CustomerTenant` to verify MSP match |
| M4 | CORS allows credentials — no `*` origin rejection | `main.py:52-58` | Validate origins list rejects `*` when credentials enabled |
| M5 | Nginx security headers lost in nested location blocks | `nginx.conf:37-53` | Repeat all security headers in every location block |
| M6 | Missing HSTS header | `nginx.conf` | Add `Strict-Transport-Security` header |
| M7 | Open redirect via API-supplied consent URL | `stablelabel-web/src/pages/SecurityPage.tsx:70` | Validate URL starts with `https://login.microsoftonline.com/` |
| M8 | `entra_tenant_id` not validated as UUID in consent URL | `routers/tenants.py:182-187` | Validate UUID format; use `urllib.parse.quote` |
| M9 | Error messages leak internal details (Graph URLs, paths) | `routers/documents.py:75-81` | Return generic errors; log details server-side |
| M10 | CSV upload reads full file before size check | `routers/documents.py:185-186` | Read in chunks; configure ASGI body size limit |
| M11 | Missing pagination on 6+ list endpoints | `labels.py`, `tenants.py`, `policies.py`, `sites.py`, `users.py` | Add `page`/`page_size` params with upper bounds |
| M12 | No DB-level constraints on role/status enum values | `db/models.py:75-77,111,166-168` | Add PostgreSQL CHECK constraints or ENUM types |
| M13 | Race condition in job status transitions | `routers/jobs.py:295-409` | Use `SELECT ... FOR UPDATE` or optimistic locking |
| M14 | Broken rollback — `previous_label_id` always empty | `worker/executor.py:629` | Capture current label before applying; store in checkpoint |
| M15 | Missing audit logging for policy CRUD | `routers/policies.py:124-247` | Add AuditEvent writes for create/update/delete |
| M16 | Unvalidated `schedule_cron` allows `* * * * *` | `routers/jobs.py:41,262` | Validate cron expressions; enforce minimum intervals |
| M17 | Deferred classification passes full text through Redis | `worker/executor.py:1160-1178` | Store text in blob store; pass only a reference key |
| M18 | TenantRateLimiters dict grows unbounded | `core/rate_limiter.py:70-85` | Use `cachetools.TTLCache` with max size and eviction |

---

## LOW FINDINGS

| # | Finding | File |
|---|---------|------|
| L1 | OpenAPI/Swagger docs exposed in production | `main.py:43-48` |
| L2 | Role name leaked in 403 error messages | `core/rbac.py:39` |
| L3 | JWKS cache has no TTL — revoked keys accepted forever | `core/entra_auth.py:39,56-63` |
| L4 | `admin_consent` query param not validated in callback | `routers/onboard.py:66-157` |
| L5 | PII (email, OID) logged at INFO level | `core/entra_auth.py:173` |
| L6 | `SL_SESSION_SECRET=CHANGE_ME` in .env.example | `.env.example:16` |
| L7 | Docker base image uses `latest` tag | `docker-compose.yml:4` |
| L8 | `COPY . .` copies unnecessary files into image | `stablelabel-api/Dockerfile:48` |
| L9 | No API versioning prefix | `main.py:60-72` |
| L10 | XML parsing uses stdlib instead of `defusedxml` | `worker/executor.py:149,183,229` |
| L11 | DuckDB connection not tenant-scoped at DB level | `services/reporting.py:47-64` |
| L12 | CI pipeline has no SAST/dependency scanning | `.github/workflows/ci.yml` |
| L13 | Electron auto-updater with `autoDownload: true` | `stablelabel-gui/src/main.ts:253-272` |
| L14 | No `Permissions-Policy` header | `stablelabel-web/nginx.conf` |

---

## Positive Security Observations

The audit also identified strong security practices already in place:

- **SQLAlchemy ORM** used correctly throughout — no raw SQL injection vectors
- **React JSX auto-escaping** — no `dangerouslySetInnerHTML` anywhere
- **Electron sandboxing** — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- **Credential encryption** — OS-level `safeStorage` (DPAPI/Keychain/libsecret)
- **PowerShell cmdlet allowlist** — defense-in-depth against arbitrary command execution
- **HMAC-signed consent state** — prevents unauthorized tenant activation
- **DB-authoritative roles** — token claims ignored for existing users (entra_auth.py:175-182)
- **Typed IPC handlers** — no raw `ipcRenderer` access in Electron preload
- **Navigation guards** — external URLs validated against trusted host allowlist

---

## Remediation Priority

### Immediate (this week)
1. **C1**: Add MSP ownership check to `check_tenant_access` for all roles
2. **C2**: Replace `python-jose` with `PyJWT[crypto]`
3. **C3**: Default JIT provisioning to `Viewer` role
4. **C4**: Define strict `JobConfig` Pydantic model; remove dangerous fields
5. **C5**: Switch to `re2` for user-supplied regex; validate patterns at creation

### Urgent (next 2 weeks)
6. **H1-H5**: Fix PowerShell injection, Docker root, exposed ports, default passwords
7. **H6-H7**: Validate Graph API path segments and followed URLs
8. **H8**: Add CSP header to web frontend
9. **M1**: Add HTTP rate limiting middleware

### Next sprint
10. Address remaining HIGH and MEDIUM findings
11. Add SAST/dependency scanning to CI pipeline

---

*Generated by 6 parallel security audit agents scanning authentication, injection, secrets/config, data model, frontend, and API design attack surfaces.*
