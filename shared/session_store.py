"""
In-memory session store for the AI Engineering Bootcamp.

This module provides a simple dictionary-based store for conversation sessions.
It is intentionally simple so students can understand the fundamentals before
moving to a database-backed solution.

IMPORTANT — LIMITATION:
  All sessions are lost when the server restarts. This is acceptable for
  development and demos, but not for production. See Resource 3
  (resource/memory-patterns-guide.md in feature-3-ai-memory/) for a comparison
  of memory strategies, including how to swap this out for SQLite or Postgres.

FRAMEWORK EQUIVALENTS (for students exploring LangChain after this course):
  This module is what LangChain calls ConversationBufferMemory.
  The sliding window in main.py (messages[-CONTEXT_WINDOW_SIZE:]) is what
  LangChain calls ConversationBufferWindowMemory.
  See Resource 3 for the full "What You Built vs What Frameworks Call It" table.
"""

import uuid
from datetime import UTC, datetime

from shared.models import Message, Session

# The store: a plain dict mapping session_id (str) -> Session.
# Module-level so it persists for the lifetime of the server process.
_store: dict[str, Session] = {}


def create_session(tenant_id: str = "default") -> str:
    """
    Create a new empty session and return its ID.

    Each session gets a random UUID so IDs are collision-free without a
    database sequence. The created_at timestamp is recorded in UTC.

    The tenant_id is stored on the session so that list_sessions() can filter
    by tenant when ENABLE_MULTI_TENANT=true (Feature 6, Part B).
    """
    session_id = str(uuid.uuid4())
    _store[session_id] = Session(
        id=session_id,
        created_at=datetime.now(tz=UTC),
        messages=[],
        tenant_id=tenant_id,
    )
    return session_id


def get_session(session_id: str, tenant_id: str = "default") -> Session | None:
    """
    Return the session with the given ID, or None if it doesn't exist.

    Callers should always check for None — a missing session should result in
    a 404 HTTP response, not a KeyError crash.

    When ENABLE_MULTI_TENANT=true, returns None if the session belongs to a
    different tenant — preventing cross-tenant session access.
    """
    from shared.config import settings

    session = _store.get(session_id)
    if session is None:
        return None
    if settings.enable_multi_tenant and session.tenant_id != tenant_id:
        return None
    return session


def add_message(session_id: str, role: str, content: str) -> None:
    """
    Append a new message to an existing session's history.

    Silently does nothing if the session_id is not found — the endpoint is
    responsible for validating the session exists before calling this.

    Args:
        session_id: The session to append to.
        role:       "user" or "assistant".
        content:    The text of the message.
    """
    session = _store.get(session_id)
    if session is None:
        return

    session.messages.append(
        Message(
            role=role,  # type: ignore[arg-type]  # Literal checked by caller
            content=content,
            timestamp=datetime.now(tz=UTC),
        )
    )


def list_sessions(tenant_id: str = "default") -> list[Session]:
    """
    Return all sessions, most recently created first.

    When ENABLE_MULTI_TENANT=true, only returns sessions belonging to
    the given tenant. When disabled, returns all sessions (existing behavior).
    """
    from shared.config import settings

    sessions = _store.values()
    if settings.enable_multi_tenant:
        sessions = [s for s in sessions if s.tenant_id == tenant_id]
    return sorted(sessions, key=lambda s: s.created_at, reverse=True)


def delete_session(session_id: str, tenant_id: str = "default") -> bool:
    """
    Delete a session and all its stored messages.

    When ENABLE_MULTI_TENANT=true, prevents deleting another tenant's session.
    Returns True if successfully deleted, False if not found.
    """
    from shared.config import settings

    session = _store.get(session_id)
    if session is None:
        return False
    if settings.enable_multi_tenant and session.tenant_id != tenant_id:
        return False
    del _store[session_id]
    return True


def truncate_session_messages(session_id: str, keep_count: int, tenant_id: str = "default") -> bool:
    """
    Truncate a session's messages to keep only the first keep_count messages.
    Used when editing an earlier message in the conversation.
    """
    session = get_session(session_id, tenant_id=tenant_id)
    if session is None:
        return False
    if keep_count < 0:
        keep_count = 0
    session.messages = session.messages[:keep_count]
    return True
