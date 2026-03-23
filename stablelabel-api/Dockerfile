# ── Stage 1: Build ────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build toolchain for native extensions (asyncpg, hiredis)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
COPY app/ app/
RUN pip install --no-cache-dir --prefix=/install '.[classifier]'

# Bake the spaCy model into the image so the first classification request
# doesn't stall downloading ~560 MB at runtime.
# Use pip install --prefix (not spacy download) so the model lands in /install/
# alongside the other packages and gets copied to the runtime stage.
RUN pip install --no-cache-dir --prefix=/install \
    https://github.com/explosion/spacy-models/releases/download/en_core_web_lg-3.7.1/en_core_web_lg-3.7.1-py3-none-any.whl

# ── Stage 2: Runtime ─────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Runtime-only OS deps (libpq for asyncpg)
RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq5 curl && \
    rm -rf /var/lib/apt/lists/*

# ── Optional: PowerShell for label-policy fallback ────────────
# Adds ~200 MB. Uncomment when PowerShell-based label operations are needed.
#
# RUN apt-get update && \
#     apt-get install -y --no-install-recommends wget apt-transport-https && \
#     wget -q https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb && \
#     dpkg -i packages-microsoft-prod.deb && \
#     rm packages-microsoft-prod.deb && \
#     apt-get update && \
#     apt-get install -y --no-install-recommends powershell && \
#     rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
