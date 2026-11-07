"""
SQLite database engine and schema management for persistent application state.

Persists conversation sessions, messages, and background agent tasks across
server restarts and process reloads, using standard library sqlite3 with WAL mode.
"""

import contextlib
import logging
import os
import sqlite3
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "app_state.db"


def is_testing() -> bool:
    """Return True if running inside an automated test suite."""
    return os.getenv("TESTING", "").lower() == "true" or "pytest" in sys.modules


def get_db_path() -> Path:
    """Return the active SQLite database path, isolated during test runs."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if is_testing():
        return DATA_DIR / "test_app_state.db"
    return DB_PATH


def get_connection() -> sqlite3.Connection:
    """Open and return a configured SQLite connection with foreign keys enabled."""
    target = get_db_path()
    conn = sqlite3.connect(str(target), check_same_thread=False, timeout=15.0)
    conn.execute("PRAGMA foreign_keys = ON;")
    with contextlib.suppress(Exception):
        conn.execute("PRAGMA journal_mode = WAL;")
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create persistent tables and indexes if they do not exist."""
    conn = get_connection()
    try:
        with conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL DEFAULT 'default',
                    created_at TEXT NOT NULL
                );
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
                );
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL DEFAULT 'default',
                    tenant_id TEXT NOT NULL DEFAULT 'default',
                    status TEXT NOT NULL,
                    message TEXT NOT NULL,
                    plan TEXT,
                    steps_completed TEXT,
                    result TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS retrieval_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    tenant_id TEXT NOT NULL,
                    query TEXT NOT NULL,
                    chunks_retrieved TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    retrieval_method TEXT NOT NULL
                );
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_retrieval_logs_tenant_time
                ON retrieval_logs(tenant_id, timestamp DESC);
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS retrieval_digests (
                    tenant_id TEXT PRIMARY KEY,
                    summary TEXT NOT NULL,
                    topics_covered TEXT NOT NULL,
                    last_updated TEXT NOT NULL,
                    source_session_count INTEGER NOT NULL
                );
            """)
    finally:
        conn.close()


def clear_test_db() -> None:
    """Wipe database contents during test fixture resets (testing only)."""
    if not is_testing():
        return
    conn = get_connection()
    try:
        with conn:
            conn.execute("DELETE FROM messages;")
            conn.execute("DELETE FROM sessions;")
            conn.execute("DELETE FROM tasks;")
            conn.execute("DELETE FROM retrieval_logs;")
            conn.execute("DELETE FROM retrieval_digests;")
    finally:
        conn.close()


# Ensure tables exist upon module import
init_db()
