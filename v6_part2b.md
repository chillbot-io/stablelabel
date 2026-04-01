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
