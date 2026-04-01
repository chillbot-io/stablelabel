#!/usr/bin/env bash
# bootstrap.sh — Wait for PostgreSQL then run migrations.
# Usage: ./scripts/bootstrap.sh
set -euo pipefail

DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
MAX_RETRIES=30
RETRY_INTERVAL=2

echo "⏳ Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."

retries=0
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; do
  retries=$((retries + 1))
  if [ "$retries" -ge "$MAX_RETRIES" ]; then
    echo "ERROR: PostgreSQL not ready after $((MAX_RETRIES * RETRY_INTERVAL))s — giving up."
    exit 1
  fi
  sleep "$RETRY_INTERVAL"
done

echo "PostgreSQL is ready."
echo "Running Alembic migrations..."

alembic upgrade head

echo "Migrations complete — StableLabel API is ready to start."
