"""
Supabase cloud synchronization helper for chat sessions, messages, and agent tasks.

Provides dual-engine capability:
When SUPABASE_URL and SUPABASE_KEY are configured and the tables exist,
conversations and agent tasks are automatically mirrored to cloud PostgreSQL.
If Supabase is unreachable, offline, or unconfigured, it fails silently
and lets the local SQLite engine handle storage seamlessly.
"""

import logging
import os
from typing import Any

import httpx

from shared.config import settings

logger = logging.getLogger(__name__)


def _get_supabase_config() -> tuple[str, str]:
    """Retrieve Supabase URL and Key from settings or environment."""
    url = (settings.supabase_url or os.getenv("SUPABASE_URL", "")).strip().rstrip("/")
    key = (settings.supabase_key or os.getenv("SUPABASE_KEY", "")).strip()
    return url, key


def _get_supabase_headers(key: str) -> dict[str, str]:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def is_supabase_configured() -> bool:
    """Return True if Supabase credentials are present."""
    url, key = _get_supabase_config()
    return bool(url and key)


def _supabase_request(method: str, path: str, **kwargs) -> Any:
    """Execute an HTTP request against Supabase REST API with short timeout and fail-safe return."""
    url, key = _get_supabase_config()
    if not (url and key):
        return None
    try:
        with httpx.Client(timeout=3.0) as client:
            resp = client.request(
                method,
                f"{url}/rest/v1/{path}",
                headers=_get_supabase_headers(key),
                **kwargs,
            )
            if resp.status_code in (200, 201, 204):
                try:
                    return resp.json()
                except Exception:
                    return True
            return None
    except Exception as exc:
        logger.debug("Supabase sync request failed: %s", exc)
        return None


def sync_create_session(session_id: str, tenant_id: str, created_at: str) -> None:
    """Mirror session creation to Supabase chat_sessions table."""
    _supabase_request(
        "POST",
        "chat_sessions",
        json={"id": session_id, "tenant_id": tenant_id, "created_at": created_at},
    )


def sync_add_message(session_id: str, role: str, content: str, timestamp: str) -> None:
    """Mirror new message to Supabase chat_messages table."""
    _supabase_request(
        "POST",
        "chat_messages",
        json={
            "session_id": session_id,
            "role": role,
            "content": content,
            "timestamp": timestamp,
        },
    )


def sync_delete_session(session_id: str) -> None:
    """Mirror session deletion to Supabase (cascades to messages)."""
    _supabase_request("DELETE", f"chat_sessions?id=eq.{session_id}")


def sync_truncate_messages(session_id: str, keep_count: int) -> None:
    """Truncate messages in Supabase to keep only the earliest keep_count entries."""
    rows = _supabase_request(
        "GET",
        f"chat_messages?session_id=eq.{session_id}&select=id&order=id.asc",
    )
    if isinstance(rows, list) and len(rows) > keep_count:
        excess = rows[keep_count:]
        for r in excess:
            msg_id = r.get("id")
            if msg_id:
                _supabase_request("DELETE", f"chat_messages?id=eq.{msg_id}")


def sync_save_task(task_dict: dict[str, Any]) -> None:
    """Mirror agent task creation or update to Supabase agent_tasks table."""
    _supabase_request(
        "POST",
        "agent_tasks",
        json=task_dict,
        headers={"Prefer": "resolution=merge-duplicates,return=representation"},
    )


def sync_fetch_sessions() -> list[dict[str, Any]] | None:
    """Fetch all sessions and messages from Supabase if available."""
    res = _supabase_request("GET", "chat_sessions?select=*,chat_messages(*)")
    if isinstance(res, list):
        return res
    return None


def sync_fetch_tasks() -> list[dict[str, Any]] | None:
    """Fetch all tasks from Supabase if available."""
    res = _supabase_request("GET", "agent_tasks?select=*")
    if isinstance(res, list):
        return res
    return None


def ping_supabase() -> dict[str, Any]:
    """
    Execute a lightweight query against Supabase to keep the project active
    and reset the 7-day free tier inactivity pause counter.
    """
    url, key = _get_supabase_config()
    if not (url and key):
        return {
            "configured": False,
            "status": "unconfigured",
            "message": "SUPABASE_URL and SUPABASE_KEY not set in environment.",
        }
    try:
        with httpx.Client(timeout=4.0) as client:
            headers = _get_supabase_headers(key)
            # Query chat_sessions table with limit 1
            resp = client.get(f"{url}/rest/v1/chat_sessions?select=id&limit=1", headers=headers)
            # If the table doesn't exist yet, query PostgREST root which always responds
            if resp.status_code == 404:
                resp = client.get(f"{url}/rest/v1/", headers=headers)

            is_ok = resp.status_code in (200, 204, 206)
            return {
                "configured": True,
                "status_code": resp.status_code,
                "status": "active" if is_ok else "reachable",
                "message": (
                    "Supabase kept alive successfully."
                    if is_ok
                    else f"Supabase responded with HTTP {resp.status_code}"
                ),
            }
    except Exception as exc:
        logger.warning("Supabase keepalive ping failed: %s", exc)
        return {
            "configured": True,
            "status": "error",
            "message": str(exc),
        }
