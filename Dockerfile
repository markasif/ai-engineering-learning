# ═══════════════════════════════════════════════════════════════════════════════
# Production Multi-Stage Dockerfile for AI Engineering Assistant
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Build Dependencies ───────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build dependencies if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip setuptools wheel && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt


# ── Stage 2: Minimal Runtime Image ────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Copy isolated virtualenv
COPY --from=builder /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Create unprivileged user for security compliance (CIS benchmark)
RUN groupadd -g 1001 appuser && \
    useradd -u 1001 -g appuser -s /bin/bash -m appuser

# Create persistent state directories
RUN mkdir -p /data/chroma /data/uploads /app/data && \
    chown -R appuser:appuser /data /app

# Copy application and shared library code
COPY shared/ ./shared/
COPY app/ ./app/
COPY ui/ ./ui/
COPY pyproject.toml .
COPY README.md .

# Install package in editable/local mode without reinstalling dependencies
RUN pip install --no-deps -e .

# Drop privileges
USER appuser

EXPOSE 8000

# Built-in container healthcheck supporting dynamic Render $PORT
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import os, urllib.request; p = os.environ.get('PORT', '8000'); sys_exit = 0 if urllib.request.urlopen(f'http://localhost:{p}/api/health').getcode() == 200 else 1; exit(sys_exit)"

# Launch production server supporting dynamic Render/Cloud $PORT
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

