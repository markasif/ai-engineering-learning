"""
Persistent session store for Feature 3: Conversation Memory.

Provides a fast in-memory session cache backed by SQLite (data/app_state.db)
so conversations survive server restarts, multi-worker reloads, and deployments.

FRAMEWORK EQUIVALENTS:
  _store dict       ≈  ConversationBufferMemory in memory
  SQLite tables     ≈  SQLChatMessageHistory / DatabaseSessionService
  delete_session    ≈  Session invalidation & cascade delete

MULTI-TENANCY (Feature 6, Part B):
  All functions accept an optional tenant_id parameter (default "default").
  When ENABLE_MULTI_TENANT=true, list_sessions() and get_session() filter
  by tenant_id — preventing cross-tenant conversation leakage.
"""

import logging
import uuid
from datetime import UTC, datetime

from shared.db import get_connection
from shared.models import Message, Session
from shared.supabase_sync import (
    sync_add_message,
    sync_create_session,
    sync_delete_session,
    sync_truncate_messages,
)

logger = logging.getLogger(__name__)

# Primary in-memory store for microsecond lookups and test compatibility
_store: dict[str, Session] = {}


def _load_from_db() -> None:
    """Rehydrate in-memory store from SQLite on module startup."""
    try:
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT id, tenant_id, created_at FROM sessions ORDER BY created_at ASC")
            session_rows = cur.fetchall()

            for s_row in session_rows:
                s_id = s_row["id"]
                raw_created = s_row["created_at"]
                created_at = datetime.fromisoformat(raw_created)
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=UTC)

                cur.execute(
                    "SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY id ASC",
                    (s_id,),
                )
                msg_rows = cur.fetchall()
                messages = []
                for m in msg_rows:
                    raw_ts = m["timestamp"]
                    ts = datetime.fromisoformat(raw_ts)
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=UTC)
                    messages.append(
                        Message(
                            role=m["role"],
                            content=m["content"],
                            timestamp=ts,
                        )
                    )

                _store[s_id] = Session(
                    id=s_id,
                    tenant_id=s_row["tenant_id"],
                    created_at=created_at,
                    messages=messages,
                )
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("Could not rehydrate sessions from SQLite: %s", exc)


def create_session(tenant_id: str = "default") -> str:
    """
    Create a new empty session and persist it to SQLite.

    Returns the session UUID string.
    """
    session_id = str(uuid.uuid4())
    now = datetime.now(tz=UTC)

    session = Session(
        id=session_id,
        created_at=now,
        messages=[],
        tenant_id=tenant_id,
    )
    _store[session_id] = session

    try:
        conn = get_connection()
        try:
            with conn:
                conn.execute(
                    "INSERT OR REPLACE INTO sessions (id, tenant_id, created_at) VALUES (?, ?, ?)",
                    (session_id, tenant_id, now.isoformat()),
                )
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("Could not persist new session to SQLite: %s", exc)

    sync_create_session(session_id, tenant_id, now.isoformat())
    return session_id


def get_session(session_id: str, tenant_id: str = "default") -> Session | None:
    """
    Return the session with the given ID, or None if it doesn't exist.

    When ENABLE_MULTI_TENANT=true, returns None if the session belongs to
    a different tenant.
    """
    from shared.config import settings

    session = _store.get(session_id)
    if session is None:
        # Fallback check against SQLite in case created by another worker
        try:
            conn = get_connection()
            try:
                cur = conn.cursor()
                cur.execute(
                    "SELECT id, tenant_id, created_at FROM sessions WHERE id = ?",
                    (session_id,),
                )
                row = cur.fetchone()
                if row:
                    raw_created = row["created_at"]
                    created_at = datetime.fromisoformat(raw_created)
                    if created_at.tzinfo is None:
                        created_at = created_at.replace(tzinfo=UTC)

                    cur.execute(
                        "SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY id ASC",
                        (session_id,),
                    )
                    messages = []
                    for m in cur.fetchall():
                        raw_ts = m["timestamp"]
                        ts = datetime.fromisoformat(raw_ts)
                        if ts.tzinfo is None:
                            ts = ts.replace(tzinfo=UTC)
                        messages.append(Message(role=m["role"], content=m["content"], timestamp=ts))

                    session = Session(
                        id=session_id,
                        tenant_id=row["tenant_id"],
                        created_at=created_at,
                        messages=messages,
                    )
                    _store[session_id] = session
            finally:
                conn.close()
        except Exception:
            pass

    if session is None:
        return None
    if settings.enable_multi_tenant and session.tenant_id != tenant_id:
        return None
    return session


def add_message(session_id: str, role: str, content: str) -> None:
    """
    Append a new message to an existing session's history and persist to SQLite.
    """
    session = _store.get(session_id)
    if session is None:
        session = get_session(session_id)
    if session is None:
        return

    now = datetime.now(tz=UTC)
    message = Message(
        role=role,  # type: ignore[arg-type]
        content=content,
        timestamp=now,
    )
    session.messages.append(message)

    try:
        conn = get_connection()
        try:
            with conn:
                conn.execute(
                    "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
                    (session_id, role, content, now.isoformat()),
                )
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("Could not persist message to SQLite: %s", exc)

    sync_add_message(session_id, role, content, now.isoformat())


def list_sessions(tenant_id: str = "default") -> list[Session]:
    """
    Return all sessions, most recently created first.
    """
    from shared.config import settings

    sessions = _store.values()
    if settings.enable_multi_tenant:
        sessions = [s for s in sessions if s.tenant_id == tenant_id]
    return sorted(sessions, key=lambda s: s.created_at, reverse=True)


def delete_session(session_id: str, tenant_id: str = "default") -> bool:
    """
    Delete a session and all its stored messages from memory and SQLite.
    """
    from shared.config import settings

    session = _store.get(session_id)
    if session is None:
        session = get_session(session_id)
    if session is None:
        return False
    if settings.enable_multi_tenant and session.tenant_id != tenant_id:
        return False

    _store.pop(session_id, None)

    try:
        conn = get_connection()
        try:
            with conn:
                conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
                conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("Could not delete session from SQLite: %s", exc)

    sync_delete_session(session_id)
    return True


def truncate_session_messages(session_id: str, keep_count: int, tenant_id: str = "default") -> bool:
    """
    Truncate a session's messages to keep only the first keep_count messages.
    Atomically updates both memory cache and SQLite.
    """
    session = get_session(session_id, tenant_id=tenant_id)
    if session is None:
        return False
    if keep_count < 0:
        keep_count = 0

    session.messages = session.messages[:keep_count]

    try:
        conn = get_connection()
        try:
            with conn:
                conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
                if session.messages:
                    conn.executemany(
                        "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
                        [
                            (session_id, m.role, m.content, m.timestamp.isoformat())
                            for m in session.messages
                        ],
                    )
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("Could not update truncated messages in SQLite: %s", exc)

    sync_truncate_messages(session_id, keep_count)
    return True


# Load previously persisted sessions on startup
_load_from_db()
