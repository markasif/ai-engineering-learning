# ═══════════════════════════════════════════════════════════════════════════════
# Dockerfile — AI Engineering Bootcamp (BlockseBlock) · Feature 12: Ship It
#
# YOUR TASK: Fill in the three TODO sections below.
#   TODO 1 — choose a base image for the builder stage
#   TODO 2 — create a non-root user and own the app directories
#   TODO 3 — write the CMD that starts the server
#
# The rest of the file is complete. You're adding the three pieces that turn
# a working script into a production-grade container.
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: dependency builder ───────────────────────────────────────────────
# TODO 1: Replace ??? with the correct base image.
#   Hint: we want Python 3.12, slim variant, as the builder stage.
#   Pattern: python:<version>-<variant> AS <stage-name>
FROM python:3.12-slim AS builder

WORKDIR /build

COPY requirements.txt .

RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt


# ── Stage 2: runtime image ────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

COPY --from=builder /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY shared/ ./shared/
COPY ui/ ./ui/
COPY week-4-launch/feature-12-ship-it/starter/app/ .

RUN mkdir -p /data/chroma /data/uploads

RUN useradd --create-home appuser && chown -R appuser /app /data
USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
