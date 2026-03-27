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
