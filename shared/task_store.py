"""
Persistent task store for Feature 8: Multi-Step Agent.

Stores AgentTask objects by ID so the background execute_plan() loop and
the GET /api/agent/status/{task_id} polling endpoint share state reliably,
backed by SQLite (data/app_state.db) so background task progress survives reloads.
"""

import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from shared.db import get_connection
from shared.models import AgentTask

logger = logging.getLogger(__name__)

_tasks: dict[str, AgentTask] = {}


def _load_tasks_from_db() -> None:
    """Rehydrate in-memory task store from SQLite on module startup."""
    try:
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM tasks ORDER BY created_at ASC")
            for row in cur.fetchall():
                task_id = row["id"]
                raw_created = row["created_at"]
                raw_updated = row["updated_at"]
                created_at = datetime.fromisoformat(raw_created)
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=UTC)
                updated_at = datetime.fromisoformat(raw_updated)
                if updated_at.tzinfo is None:
                    updated_at = updated_at.replace(tzinfo=UTC)

                plan = json.loads(row["plan"]) if row["plan"] else None
                steps = json.loads(row["steps_completed"]) if row["steps_completed"] else []

                _tasks[task_id] = AgentTask(
                    id=task_id,
                    session_id=row["session_id"],
                    tenant_id=row["tenant_id"],
                    status=row["status"],
                    message=row["message"],
                    plan=plan,
                    steps_completed=steps,
                    result=row["result"],
                    error=row["error"],
                    created_at=created_at,
                    updated_at=updated_at,
                )
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("Could not rehydrate tasks from SQLite: %s", exc)


def create_task(
    message: str,
    session_id: str = "default",
    tenant_id: str = "default",
) -> AgentTask:
    """Create a new AgentTask in 'planning' status and persist it to SQLite."""
    task_id = str(uuid.uuid4())
    now = datetime.now(tz=UTC)
    task = AgentTask(
        id=task_id,
        status="planning",
        message=message,
        session_id=session_id,
        tenant_id=tenant_id,
        created_at=now,
        updated_at=now,
    )
    _tasks[task_id] = task

    try:
        conn = get_connection()
        try:
            with conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO tasks (
                        id, session_id, tenant_id, status, message,
                        plan, steps_completed, result, error, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        task.id,
                        task.session_id,
                        task.tenant_id,
                        task.status,
                        task.message,
                        None,
                        json.dumps([]),
                        None,
                        None,
                        now.isoformat(),
                        now.isoformat(),
                    ),
                )
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("Could not persist new task to SQLite: %s", exc)

    return task


def get_task(task_id: str) -> AgentTask | None:
    """Return the task with the given ID, or None if not found."""
    task = _tasks.get(task_id)
    if task is not None:
        return task

    # Fallback to SQLite
    try:
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            row = cur.fetchone()
            if row:
                created_at = datetime.fromisoformat(row["created_at"])
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=UTC)
                updated_at = datetime.fromisoformat(row["updated_at"])
                if updated_at.tzinfo is None:
                    updated_at = updated_at.replace(tzinfo=UTC)

                plan = json.loads(row["plan"]) if row["plan"] else None
                steps = json.loads(row["steps_completed"]) if row["steps_completed"] else []

                task = AgentTask(
                    id=row["id"],
                    session_id=row["session_id"],
                    tenant_id=row["tenant_id"],
                    status=row["status"],
                    message=row["message"],
                    plan=plan,
                    steps_completed=steps,
                    result=row["result"],
                    error=row["error"],
                    created_at=created_at,
                    updated_at=updated_at,
                )
                _tasks[task_id] = task
                return task
        finally:
            conn.close()
    except Exception:
        pass

    return None


def update_task(task_id: str, **fields: Any) -> None:
    """
    Update one or more fields on an existing task and persist updates to SQLite.
    """
    task = get_task(task_id)
    if task is None:
        return

    now = datetime.now(tz=UTC)
    for field, value in fields.items():
        if hasattr(task, field):
            setattr(task, field, value)
    task.updated_at = now

    try:
        conn = get_connection()
        try:
            with conn:
                conn.execute(
                    """
                    UPDATE tasks SET
                        status = ?, plan = ?, steps_completed = ?,
                        result = ?, error = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        task.status,
                        json.dumps(task.plan) if task.plan is not None else None,
                        json.dumps(task.steps_completed),
                        task.result,
                        task.error,
                        now.isoformat(),
                        task_id,
                    ),
                )
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("Could not persist task update to SQLite: %s", exc)


# Load previously persisted tasks on startup
_load_tasks_from_db()
