"""
Feature 3 starter: in-memory session store — YOUR IMPLEMENTATION GOES HERE.

The complete version lives in shared/session_store.py (read it for reference).
Your job is to implement the four functions below using a plain Python dict.

Why implement it yourself?
  Understanding dict-keyed stores is the foundation for everything that
  comes next: database-backed sessions (SQLite, Postgres), Redis caches,
  and vector stores all follow the same create / read / write / list pattern.
  Once you've built this by hand, swapping the backend is a 10-line change.

See resource/memory-patterns-guide.md for the full comparison and a SQLite sketch.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

# Import the models — these are shared and already complete.
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from shared.models import Message, Session

_store: dict[str, Session] = {}  


def create_session() -> str:
    session_id = str(uuid.uuid4())
    session = Session(id=session_id, created_at=datetime.now(tz=timezone.utc), messages=[])
    _store[session_id] = session
    return session_id

def get_session(session_id: str) -> Optional[Session]:
    return _store.get(session_id)


def add_message(session_id: str, role: str, content: str) -> None:
    session = _store.get(session_id)
    if session is None:
      return None
    session.messages.append(Message(role=role, content=content, timestamp=datetime.now(tz=timezone.utc)))


def list_sessions() -> list[Session]:
    return sorted(_store.values())
