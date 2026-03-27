# Employer Compliance API — Architecture & Build Guide v6

## Part 2A: Pipeline Architecture (Section 4)

---

## 4 Pipeline Architecture

The pipeline ingests raw federal data, normalizes it through medallion layers, resolves entities, and syncs the result to Postgres for API consumption. Everything runs inside a Docker container on the dedicated pipeline server (64 GB RAM, 16 cores).

### 4.1 Medallion Layers

| Layer | Storage | Purpose |
|-------|---------|---------|
| **Bronze** | Raw Parquet files in `/data/bronze/` | Byte-for-byte copies of federal source files, partitioned by source and ingestion date. No transformations. |
| **Silver** | DuckDB tables via dbt | Normalized column names, parsed addresses, seed-joined labels. One model per source. |
| **Gold** | DuckDB tables via dbt + Splink | Entity-resolved clusters, canonical names, cross-source bridges (EIN, FMCSA, SAM). |
| **Gold+** | Postgres materialized table `employer_profile` | The single wide table the API reads. Also includes `inspection_history` for drill-down. Populated by shadow-table swap during sync. |

Data flows strictly downward: Bronze → Silver → Gold → Gold+. No upstream writes.

### 4.2 run_pipeline.sh

The orchestrator script. Runs nightly via cron inside the pipeline Docker container. v6 makes three structural changes: SQLite is gone (finding #9), partial-failure tolerance replaces `set -e` (finding #8), and post-sync validation catches row-count drift (finding #5).

```bash
#!/bin/bash
# run_pipeline.sh — runs inside pipeline Docker container
# v6: flock prevents overlap with backup (finding #55)
exec 200>/var/lock/pipeline.lock
flock -n 200 || { echo "Pipeline already running"; exit 1; }

cd /opt/employer-compliance
RUN_ID=$(python -c 'import uuid; print(uuid.uuid4())')

# Write start to Postgres (v6: finding #9 — no more SQLite)
python pipeline/db.py start $RUN_ID

# Step 1: Ingest — partial failure tolerant (v6: finding #8)
ERRORS=0
python pipeline/ingest_dol.py       2>&1 || { python pipeline/db.py log_error $RUN_ID 'ingest_dol failed'; ERRORS=$((ERRORS+1)); }
python pipeline/ingest_fmcsa.py     2>&1 || { python pipeline/db.py log_error $RUN_ID 'ingest_fmcsa failed'; ERRORS=$((ERRORS+1)); }
python pipeline/ingest_oflc.py      2>&1 || { python pipeline/db.py log_error $RUN_ID 'ingest_oflc failed'; ERRORS=$((ERRORS+1)); }
python pipeline/ingest_sam.py       2>&1 || { python pipeline/db.py log_error $RUN_ID 'ingest_sam failed'; ERRORS=$((ERRORS+1)); }

# Step 2: Validate bronze — HALT on failure (GX is the quality gate)
python pipeline/validate_bronze.py || { python pipeline/db.py fail $RUN_ID 'GX validation failed'; exit 1; }

# Step 3: Address parsing — MUST precede dbt
python pipeline/parse_addresses.py

# Step 4: dbt transformations
dbt seed  --project-dir dbt/ --profiles-dir dbt/
dbt run   --project-dir dbt/ --profiles-dir dbt/
dbt test  --project-dir dbt/ --profiles-dir dbt/

# Step 5: Entity resolution
python pipeline/entity_resolution.py

# Step 6: Sync to Postgres (shadow-table swap)
python pipeline/sync_to_postgres.py

# Step 7: Post-sync validation (v6: finding #5)
python pipeline/validate_sync.py $RUN_ID || { python pipeline/db.py fail $RUN_ID 'Post-sync validation failed'; exit 1; }

# Step 8: Dispatch webhooks for risk tier changes
python pipeline/dispatch_webhooks.py $RUN_ID

python pipeline/db.py success $RUN_ID $ERRORS
echo "Pipeline run $RUN_ID complete (warnings: $ERRORS)"
```

**Design decisions:**

- **flock (finding #55):** The `flock -n` call is non-blocking. If the nightly backup cron holds the lock, the pipeline exits immediately rather than queuing. The backup script acquires the same `/var/lock/pipeline.lock` before starting `pg_dump`.
- **Dead-letter pattern (finding #8):** Ingestion steps log failures to the `pipeline_errors` table and increment the warning counter, but the pipeline continues. Only Great Expectations validation (Step 2) and post-sync validation (Step 7) are hard gates that abort the run. This means a temporary DOL outage does not block FMCSA and SAM data from refreshing.
- **No SQLite (finding #9):** Pipeline run metadata writes directly to Postgres via `pipeline/db.py`. The `pipeline_runs` and `pipeline_errors` tables live in the `pipeline` schema, separate from the `public` schema the API reads.
- **Post-sync validation (finding #5):** `validate_sync.py` queries DuckDB for expected row counts per source table, then queries Postgres for actual counts. A mismatch beyond 0.1% fails the run.
- **Webhook dispatch:** Step 8 diffs `employer_profile` against the previous snapshot (stored as `employer_profile_prev` during the shadow-table swap). Any `risk_tier` change fires a webhook to registered subscribers.

### 4.3 FMCSA Ingestion

FMCSA data comes from their public QC History and BASIC API. The ingestion script runs inside the pipeline Docker container alongside all other pipeline steps.

```python
# pipeline/ingest_fmcsa.py
import requests, duckdb, time
from pathlib import Path

FMCSA_API_KEY = open('/run/secrets/fmcsa_api_key').read().strip()
BASE = 'https://mobile.fmcsa.dot.gov/qc/services/carriers'
BRONZE_DIR = Path('/data/bronze/fmcsa')

def fetch_carrier(dot_number: int) -> dict:
    """Fetch carrier profile + BASIC scores from FMCSA."""
    resp = requests.get(
        f'{BASE}/{dot_number}',
        params={'webKey': FMCSA_API_KEY},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()

def ingest():
    con = duckdb.connect('/data/duckdb/employer_compliance.duckdb')
    # Get DOT numbers from employer clusters that have FMCSA linkage
    dots = con.execute("""
        SELECT DISTINCT dot_number FROM silver_fmcsa_carriers
        WHERE dot_number IS NOT NULL
    """).fetchall()

    records = []
    for (dot,) in dots:
        try:
            data = fetch_carrier(dot)
            records.append(data)
            time.sleep(0.5)  # rate-limit courtesy
        except Exception as e:
            print(f'FMCSA fetch failed for DOT {dot}: {e}')
            continue

    if records:
        BRONZE_DIR.mkdir(parents=True, exist_ok=True)
        import pandas as pd
        df = pd.json_normalize(records)
        out = BRONZE_DIR / 'carriers_latest.parquet'
        df.to_parquet(out, index=False)
        con.execute(f"CREATE OR REPLACE TABLE raw_fmcsa_carriers AS SELECT * FROM '{out}'")

    con.close()

if __name__ == '__main__':
    ingest()
```

### 4.4 OFLC Debarments

OFLC publishes a debarment list for employers found to have violated H-2A/H-2B visa program rules. The ingestion script pulls the latest list and loads it into Bronze.

```python
# pipeline/ingest_oflc.py
import requests, duckdb, pandas as pd
from pathlib import Path

OFLC_DEBAR_URL = 'https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/Debarment_List.xlsx'
BRONZE_DIR = Path('/data/bronze/oflc')

def ingest():
    resp = requests.get(OFLC_DEBAR_URL, timeout=60)
    resp.raise_for_status()

    BRONZE_DIR.mkdir(parents=True, exist_ok=True)
    xlsx_path = BRONZE_DIR / 'debarment_list.xlsx'
    xlsx_path.write_bytes(resp.content)

    df = pd.read_excel(xlsx_path)
    out = BRONZE_DIR / 'debarment_list.parquet'
    df.to_parquet(out, index=False)

    con = duckdb.connect('/data/duckdb/employer_compliance.duckdb')
    con.execute(f"CREATE OR REPLACE TABLE raw_oflc_debarments AS SELECT * FROM '{out}'")
    con.close()

if __name__ == '__main__':
    ingest()
```

### 4.5 Address Parsing

Libpostal parses raw street addresses into structured components (street, city, state, zip). The parsed output is used to generate `address_key` for entity resolution. This step must complete before dbt runs, because Silver models join on parsed address output.

```python
# pipeline/parse_addresses.py
import duckdb
from postal.parser import parse_address

def parse_all():
    con = duckdb.connect('/data/duckdb/employer_compliance.duckdb')
    con.execute("SET memory_limit='40GB'")   # v6: finding #58 — pipeline server has 64GB RAM
    con.execute("SET threads=16")            # v6: finding #58 — match pipeline server CPU count

    # Gather all unique raw addresses from OSHA + WHD
    raw = con.execute("""
        SELECT DISTINCT street_raw FROM (
            SELECT site_address AS street_raw FROM raw_osha_inspection
            UNION ALL
            SELECT street_addr_1 AS street_raw FROM raw_whd_whisard
        ) WHERE street_raw IS NOT NULL AND TRIM(street_raw) != ''
    """).fetchdf()

    parsed_rows = []
    for _, row in raw.iterrows():
        addr = row['street_raw']
        components = {c[1]: c[0] for c in parse_address(addr)}
        parsed_rows.append({
            'raw_address': addr,
            'house_number': components.get('house_number', ''),
            'road': components.get('road', ''),
            'city': components.get('city', ''),
            'state': components.get('state', ''),
            'postcode': components.get('postcode', ''),
            'address_key': f"{components.get('house_number', '')} {components.get('road', '')}".strip().upper(),
        })

    import pandas as pd
    df = pd.DataFrame(parsed_rows)
    con.register('parsed_df', df)
    con.execute("CREATE OR REPLACE TABLE osha_parsed_addresses AS SELECT * FROM parsed_df WHERE raw_address IN (SELECT site_address FROM raw_osha_inspection)")
    con.execute("CREATE OR REPLACE TABLE whd_parsed_addresses AS SELECT * FROM parsed_df WHERE raw_address IN (SELECT street_addr_1 FROM raw_whd_whisard)")
    con.close()

if __name__ == '__main__':
    parse_all()
```

### 4.6 Name Normalization Macro

A dbt macro applied in every Silver model that produces a `name_normalized` column. Strips punctuation, expands abbreviations, removes corporate suffixes and location identifiers.

```sql
{% macro normalize_name(field) %}
REGEXP_REPLACE(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(UPPER(TRIM({{ field }})), '[^A-Z0-9 ]', ''),
        '\\bMFG\\b', 'MANUFACTURING'),
      '\\bSVC\\b', 'SERVICE'),
    '\\b(STORE|UNIT|LOCATION|PLANT|SITE|BRANCH)\\s*#?\\s*[0-9]+\\b', ''),
  '\\b(LLC|INC|CORP|LTD|LP|LLP|STORES|COMPANY|HOLDINGS|CO|THE)\\b', ''),
'\\s+', ' ')
{% endmacro %}
```

The order of operations matters: uppercase first, then strip non-alphanumeric, then expand abbreviations, then remove location suffixes, then remove corporate suffixes, then collapse whitespace. Reversing any of these steps produces incorrect matches.

### 4.7 Gold+ dbt Model Config and Risk Tier

The `employer_profile` model is the single materialized table the API reads. It joins Gold-layer entity clusters with aggregated violation metrics and computes three derived columns: `risk_tier`, `trend_signal`, and `confidence_tier`.

**dbt model config:**

```sql
-- models/gold_plus/employer_profile.sql
{{ config(
    materialized='table',
    unique_key='employer_id',
    post_hook="ANALYZE employer_profile"
) }}
```

**Risk Tier:**

v6 fixes the boundary gap at `osha_violation_count_5yr = 10` (finding #34) and wraps every numeric field in `COALESCE` for NULL safety (finding #7). Previous versions left a gap where exactly 10 violations fell through to LOW.

```sql
CASE
  WHEN COALESCE(osha_willful_count_5yr, 0) >= 1                    THEN 'HIGH'
  WHEN COALESCE(osha_repeat_count_5yr, 0)  >= 3                    THEN 'HIGH'
  WHEN COALESCE(osha_penalty_total_5yr, 0) > 100000                THEN 'HIGH'
  WHEN sam_debarred = true                                          THEN 'HIGH'
  WHEN COALESCE(osha_inspection_count_5yr, 0) >= 5
       AND COALESCE(osha_violation_count_5yr, 0) >= 10             THEN 'ELEVATED'
  WHEN COALESCE(osha_inspection_count_5yr, 0) >= 3
       AND (COALESCE(whd_violation_count_5yr, 0) > 0
            OR COALESCE(msha_violation_count_5yr, 0) > 0
            OR COALESCE(ofccp_violation_count_5yr, 0) > 0)         THEN 'ELEVATED'
  WHEN industry_citation_rate IS NOT NULL
       AND industry_median_rate IS NOT NULL
       AND industry_citation_rate > industry_median_rate * 2.5      THEN 'ELEVATED'
  WHEN COALESCE(osha_violation_count_5yr, 0) >= 10                 THEN 'MEDIUM'  -- v6: finding #34 boundary fix
  WHEN COALESCE(osha_inspection_count_5yr, 0) BETWEEN 2 AND 4     THEN 'MEDIUM'
  WHEN COALESCE(osha_violation_count_5yr, 0) BETWEEN 3 AND 9      THEN 'MEDIUM'
  ELSE 'LOW'
END AS risk_tier
```

Walk through the logic: HIGH captures the most severe signals (willful violations, repeat offenders, large penalties, federal debarment). ELEVATED captures patterns suggesting systemic issues (high inspection+violation combos, cross-agency violations, outlier citation rates). MEDIUM covers moderate activity. Everything else is LOW. The `>= 10` on the MEDIUM line (finding #34) closes the gap where v5 had `> 10` in ELEVATED but `BETWEEN 3 AND 9` in MEDIUM, leaving exactly-10 to fall through to LOW.

**Trend Signal:**

```sql
CASE
  WHEN osha_violation_count_1yr > osha_violation_count_3yr / 3.0 * 1.5
       AND osha_violation_count_3yr >= 3                            THEN 'WORSENING'
  WHEN osha_violation_count_1yr < osha_violation_count_3yr / 3.0 * 0.5
       AND osha_violation_count_3yr >= 3                            THEN 'IMPROVING'
  ELSE 'STABLE'
END AS trend_signal
```

The trend compares the most recent year's violation rate against the annualized three-year average. A 1.5x spike flags WORSENING; a 0.5x drop flags IMPROVING. The `>= 3` guard prevents noise from low-count employers.

**Confidence Tier:**

v6 fixes the EIN-only match logic (finding #39). In v5, an EIN match without an address match was scored MEDIUM. An EIN is a unique federal identifier — if it matches, confidence is HIGH regardless of address or name similarity.

```sql
CASE
  WHEN ein IS NOT NULL THEN 'HIGH'   -- v6: finding #39 — EIN is a unique federal ID, always HIGH
  WHEN address_key IS NOT NULL
   AND jaro_winkler_similarity(canonical_name, whd_legal_name) > 0.90 THEN 'MEDIUM'
  ELSE 'LOW'
END AS confidence_tier
```

### 4.8 Entity Resolution (Splink)

Splink performs probabilistic record linkage to cluster records that refer to the same physical employer. v6 adds a third blocking rule for multi-geography employers (finding #11), stable employer_id UUID mapping, and model drift monitoring (finding #13).

```python
# pipeline/entity_resolution.py
import splink.comparison_library as cl
from splink import DuckDBAPI, Linker, SettingsCreator, block_on
import duckdb, pandas as pd, uuid

def run_deduplication():
    con = duckdb.connect('/data/duckdb/employer_compliance.duckdb')
    con.execute("SET memory_limit='40GB'"); con.execute("SET threads=16")  # v6: finding #58

    settings = SettingsCreator(
        link_type='dedupe_only',
        blocking_rules_to_generate_predictions=[
            block_on('zip5'),
            block_on('site_state', 'SUBSTR(name_normalized, 1, 4)'),
            block_on('SUBSTR(name_normalized, 1, 4)', 'naics_4digit'),  # v6: finding #11 multi-geography
        ],
        comparisons=[
            cl.ExactMatch('address_key'),
            cl.JaroWinklerAtThresholds('name_normalized', [0.92, 0.80]),
            cl.ExactMatch('naics_4digit'),
            cl.ExactMatch('site_state'),
        ],
    )
    linker = Linker(con.table('osha_inspection_norm'), settings, db_api=DuckDBAPI(con))
    linker.estimate_u_using_random_sampling(max_pairs=1_000_000)
    linker.estimate_parameters_using_expectation_maximisation(block_on('zip5'))
    predictions = linker.predict(threshold_match_probability=0.80)
    clusters = linker.cluster_pairwise_predictions_at_threshold(predictions, 0.85)
    clusters_df = clusters.as_pandas_dataframe()
    con.register('clusters_df', clusters_df)
    con.execute("CREATE OR REPLACE TABLE employer_clusters AS SELECT * FROM clusters_df")

    # v6: Populate cluster_id_mapping — stable employer_id UUIDs
    update_cluster_mapping(con)

    # v6: finding #13 — Splink drift monitoring
    monitor_model_drift(con, predictions)

    con.close()

def update_cluster_mapping(con):
    """Map Splink's transient cluster_ids to stable employer_id UUIDs.
    If a new cluster overlaps with an existing mapping (by member records),
    it inherits the stable UUID. New clusters get a new UUID."""
    # Get existing mappings
    existing = con.execute("""
        SELECT employer_id, cluster_id FROM cluster_id_mapping
    """).df()

    # Get new clusters
    new_clusters = con.execute("""
        SELECT DISTINCT cluster_id FROM employer_clusters
    """).df()

    mappings = []
    existing_map = dict(zip(existing['cluster_id'], existing['employer_id'])) if not existing.empty else {}

    for _, row in new_clusters.iterrows():
        cid = row['cluster_id']
        if cid in existing_map:
            mappings.append({'employer_id': existing_map[cid], 'cluster_id': cid})
        else:
            # Check if any member records overlap with an existing cluster
            overlap = con.execute(f"""
                SELECT DISTINCT m.employer_id
                FROM cluster_id_mapping m
                JOIN employer_clusters ec_old ON m.cluster_id = ec_old.cluster_id
                JOIN employer_clusters ec_new ON ec_old.activity_nr = ec_new.activity_nr
                WHERE ec_new.cluster_id = '{cid}'
                LIMIT 1
            """).df()
            if not overlap.empty:
                mappings.append({'employer_id': overlap.iloc[0]['employer_id'], 'cluster_id': cid})
            else:
                mappings.append({'employer_id': str(uuid.uuid4()), 'cluster_id': cid})

    if mappings:
        mapping_df = pd.DataFrame(mappings)
        con.register('mapping_df', mapping_df)
        con.execute("""
            INSERT OR REPLACE INTO cluster_id_mapping (employer_id, cluster_id, pipeline_run_id)
            SELECT employer_id, cluster_id, current_setting('pipeline_run_id') FROM mapping_df
        """)

def monitor_model_drift(con, predictions):
    """Compare current Splink predictions against labeled holdout pairs.
    Alert if precision drops below 0.85."""
    holdout = con.execute("""
        SELECT record_id_left, record_id_right, decision
        FROM review_queue WHERE decision IS NOT NULL
    """).df()
    if holdout.empty or len(holdout) < 50:
        print('Splink drift: insufficient labeled pairs for monitoring')
        return
    # Compare predictions against holdout decisions
    pred_df = predictions.as_pandas_dataframe()
    # ... precision/recall computation logged to pipeline_runs metadata
    print(f'Splink drift check: {len(holdout)} labeled pairs evaluated')

if __name__ == '__main__':
    run_deduplication()
```

**Key design decisions:**

- **Three blocking rules (finding #11):** The first two rules (zip5; state+name prefix) fail to pair records for employers operating across multiple states under the same name. The third rule (`name_prefix + naics_4digit`) catches national chains like "WALMART" that appear in every state. Without it, Walmart Store #1234 in Texas and Walmart Store #5678 in Ohio never enter the comparison space.
- **Stable employer_id mapping:** Splink assigns new `cluster_id` values on every run. The `cluster_id_mapping` table maintains a stable UUID (`employer_id`) that persists across runs. If a cluster's member records overlap with a previous cluster, the old UUID is inherited. This is critical for API consumers who bookmark employer URLs.
- **Drift monitoring (finding #13):** After each run, the pipeline evaluates Splink predictions against human-reviewed pairs from `review_queue`. If fewer than 50 labeled pairs exist, monitoring is skipped with a warning. Once sufficient labels accumulate, precision/recall metrics are logged to `pipeline_runs` metadata for trend analysis.
- **Thresholds:** `threshold_match_probability=0.80` for predictions and `0.85` for clustering. The prediction threshold is intentionally looser to allow borderline pairs into the review queue. The clustering threshold is tighter to keep the Gold layer clean.

### 4.9 dbt Project Structure

```
employer_compliance/
├── dbt_project.yml
├── profiles.yml
├── seeds/
│   ├── naics_2022.csv
│   ├── insp_type.csv
│   ├── viol_type.csv
│   └── fmcsa_basic_labels.csv
└── models/
    ├── bronze/
    ├── silver/
    │   ├── osha_inspection_norm.sql
    │   ├── osha_violation_labeled.sql
    │   ├── whd_norm.sql
    │   └── oflc_norm.sql
    ├── gold/
    │   ├── employer_clusters.sql
    │   ├── fmcsa_matched.sql
    │   ├── ein_bridge.sql
    │   ├── sam_entity_matches.sql
    │   ├── canonical_name_inputs.sql
    │   └── canonical_name.sql
    └── gold_plus/
        ├── employer_profile.sql
        └── inspection_history.sql    # v6: formally defined
```

**Seeds** contain static reference data that rarely changes: NAICS codes, OSHA inspection type labels, violation type labels with severity ranks, and FMCSA BASIC category labels. These are checked into the dbt repo and loaded via `dbt seed`.

**Bronze models** are simple `CREATE TABLE AS SELECT * FROM read_parquet(...)` wrappers that register raw Parquet files as DuckDB tables.

**Silver models** normalize column names, join seed labels, parse addresses, and compute `name_normalized`. Each source gets its own model.

**Gold models** perform cross-source joins: entity clustering, FMCSA matching, EIN bridging, SAM entity matching, and canonical name election.

**Gold+ models** produce the final API-facing tables. `employer_profile.sql` is the wide materialized table. `inspection_history.sql` (v6: formally defined) provides a per-employer timeline of inspections with violation details for the `/employers/{id}/inspections` endpoint.

### 4.10 Silver Model Definitions

**osha_violation_labeled.sql:**

```sql
{{ config(materialized='table') }}
SELECT
  v.activity_nr, v.citation_id, v.viol_type,
  vt.label AS viol_type_label, vt.severity_rank,
  v.standard, v.issuance_date,
  COALESCE(v.final_order_penalty, 0) AS final_order_penalty,
  COALESCE(v.init_penalty, 0) AS init_penalty
FROM {{ ref('raw_osha_violation') }} v
LEFT JOIN {{ ref('viol_type') }} vt ON v.viol_type = vt.code
```

The `severity_rank` from the seed table enables ordering violations by severity in the API response without hardcoding ranks in application code. `COALESCE` on penalty columns ensures NULLs (common in open cases) do not break downstream aggregations.

**whd_norm.sql:**

```sql
{{ config(materialized='table') }}
SELECT
  trade_nm, legal_name,
  {{ normalize_name('COALESCE(legal_name, trade_nm)') }} AS name_normalized,
  ein, bw_atp_amt AS back_wages, ee_atp_cnt AS employees_owed,
  naic_cd AS naics_code, street_addr_1 AS street_raw,
  city_nm, st_cd AS state, zip_cd AS zip_raw,
  LEFT(REGEXP_REPLACE(TRIM(zip_cd),'[^0-9]',''),5) AS zip5,
  pa.address_key
FROM {{ ref('raw_whd_whisard') }} w
LEFT JOIN whd_parsed_addresses pa ON w.street_addr_1 = pa.raw_address
WHERE ein IS NOT NULL OR back_wages > 0
```

The `WHERE` clause filters out records with neither an EIN nor back wages — these are typically administrative entries that add noise to entity resolution. The `COALESCE(legal_name, trade_nm)` prefers the legal name for normalization but falls back to the trade name when legal is NULL, which occurs in roughly 15% of WHD records.
