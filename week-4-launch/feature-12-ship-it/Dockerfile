# ═══════════════════════════════════════════════════════════════════════════════
# Dockerfile — AI Engineering Bootcamp (BlockseBlock) · Feature 12: Ship It
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: dependency builder ───────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

COPY requirements.txt .

RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt


# ── Stage 2: runtime image ────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

COPY --from=builder /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# ── Copy application code ──────────────────────────────────────────────────────
COPY shared/ ./shared/
COPY app/ ./app/
COPY ui/ ./ui/
COPY pyproject.toml .
RUN pip install --no-deps -e .

# Copy Feature 12 solution for backward compatibility
COPY week-4-launch/feature-12-ship-it/solution/ .

# ── Data directories ──────────────────────────────────────────────────────────
RUN mkdir -p /data/chroma /data/uploads

# ── Security: non-root user ───────────────────────────────────────────────────
RUN useradd --create-home appuser && chown -R appuser /app /data
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
