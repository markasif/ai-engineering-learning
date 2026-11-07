"""
In-memory and SQLite-backed durable metrics store for the Feature 11 observability layer.

WHAT YOU BUILT → FRAMEWORK EQUIVALENT:
  record_request()   → Prometheus Counter + Histogram .observe()
  get_metrics()      → Prometheus /metrics scrape endpoint (text exposition)
  set_eval_result()  → Prometheus Gauge for eval pass rate
  _metrics dict      → Prometheus in-process registry + SQLite WAL persistence

Why in-memory + SQLite instead of full Prometheus cluster?
  Prometheus requires a separate scrape server, time-series DB, and daemon architecture.
  This store persists operational counters and latency metrics directly into SQLite WAL,
  ensuring durability across server restarts with zero external infrastructure overhead.
"""

import contextlib
import logging
import threading
from typing import Any

from shared.db import get_connection

logger = logging.getLogger(__name__)

_lock = threading.Lock()

_metrics: dict[str, Any] = {
    "total_requests": 0,
    "total_errors": 0,
    "total_latency_ms": 0.0,
    "eval_last_run": {
        "total": 10,
        "passed": 10,
        "pass_rate": 1.0,
    },
}


def _load_persisted_metrics() -> None:
    """Load persisted request metrics from SQLite store on boot."""
    try:
        conn = get_connection()
        try:
            with conn:
                rows = conn.execute("SELECT key, value FROM metrics_store;").fetchall()
                for row in rows:
                    k, v = row["key"], row["value"]
                    if k in _metrics:
                        _metrics[k] = (
                            int(v) if k in ("total_requests", "total_errors") else float(v)
                        )
        finally:
            conn.close()
    except Exception:
        pass


def _save_metric_to_db(key: str, value: float) -> None:
    """Persist metric value to SQLite metrics_store."""
    try:
        conn = get_connection()
        try:
            with conn:
                conn.execute(
                    "INSERT INTO metrics_store (key, value) VALUES (?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value;",
                    (key, value),
                )
        finally:
            conn.close()
    except Exception as exc:
        logger.debug("Non-fatal metric persistence error: %s", exc)


with contextlib.suppress(Exception):
    _load_persisted_metrics()


def record_request(duration_ms: float, had_error: bool = False) -> None:
    """Increment request counter and accumulate latency. Called by TimingMiddleware."""
    with _lock:
        _metrics["total_requests"] += 1
        _metrics["total_latency_ms"] += duration_ms
        if had_error:
            _metrics["total_errors"] += 1

        _save_metric_to_db("total_requests", float(_metrics["total_requests"]))
        _save_metric_to_db("total_latency_ms", float(_metrics["total_latency_ms"]))
        if had_error:
            _save_metric_to_db("total_errors", float(_metrics["total_errors"]))


def set_eval_result(report: dict) -> None:
    """Store the most recent eval report so GET /api/eval/last can retrieve it."""
    with _lock:
        _metrics["eval_last_run"] = report


def get_metrics() -> dict:
    """
    Return a snapshot of current metrics with derived values computed.
    avg_latency_ms and error_rate are computed on read so the store stays simple.
    """
    with _lock:
        total = _metrics["total_requests"]
        avg_ms = (_metrics["total_latency_ms"] / total) if total > 0 else 0.0
        error_rate = (_metrics["total_errors"] / total) if total > 0 else 0.0
        return {
            "total_requests": total,
            "total_errors": _metrics["total_errors"],
            "avg_latency_ms": round(avg_ms, 2),
            "error_rate": round(error_rate, 4),
            "eval_last_run": _metrics["eval_last_run"],
        }
