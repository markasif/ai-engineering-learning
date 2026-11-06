"""
Unit tests for SQLite-backed persistent conversation sessions and agent tasks.
Verifies that sessions, messages, and task records survive cache flushes and server reloads.
"""

from shared.session_store import (
    _store,
    add_message,
    create_session,
    delete_session,
    get_session,
    truncate_session_messages,
)
from shared.task_store import (
    _tasks,
    create_task,
    get_task,
    update_task,
)


def test_session_and_messages_sqlite_persistence():
    # 1. Create a session and add messages
    session_id = create_session(tenant_id="default")
    add_message(session_id, "user", "What is our company PTO policy?")
    add_message(session_id, "assistant", "Employees receive 20 days of paid time off per year.")

    # 2. Flush in-memory dictionary cache to simulate server restart / cache loss
    _store.clear()
    assert session_id not in _store

    # 3. Retrieve session — must reload from SQLite
    reloaded = get_session(session_id, tenant_id="default")
    assert reloaded is not None
    assert reloaded.id == session_id
    assert len(reloaded.messages) == 2
    assert reloaded.messages[0].role == "user"
    assert reloaded.messages[0].content == "What is our company PTO policy?"
    assert reloaded.messages[1].role == "assistant"
    assert "20 days" in reloaded.messages[1].content


def test_session_truncate_sqlite_persistence():
    session_id = create_session(tenant_id="default")
    add_message(session_id, "user", "Message 1")
    add_message(session_id, "assistant", "Answer 1")
    add_message(session_id, "user", "Message 2")
    add_message(session_id, "assistant", "Answer 2")

    # Truncate to keep first 2 messages
    success = truncate_session_messages(session_id, keep_count=2, tenant_id="default")
    assert success is True

    # Flush in-memory cache
    _store.clear()

    # Rehydrate from SQLite
    reloaded = get_session(session_id, tenant_id="default")
    assert reloaded is not None
    assert len(reloaded.messages) == 2
    assert reloaded.messages[0].content == "Message 1"
    assert reloaded.messages[1].content == "Answer 1"


def test_session_delete_sqlite_persistence():
    session_id = create_session(tenant_id="default")
    add_message(session_id, "user", "Temporary Message")

    # Delete session
    assert delete_session(session_id, tenant_id="default") is True

    # Flush in-memory cache
    _store.clear()

    # Rehydrate attempt must return None
    assert get_session(session_id, tenant_id="default") is None


def test_agent_task_sqlite_persistence():
    # 1. Create task
    task = create_task(
        message="Review pending leave requests for Sarah Jenkins",
        session_id="session-xyz",
        tenant_id="default",
    )
    task_id = task.id

    # 2. Update task with plan and completed steps
    update_task(
        task_id,
        status="executing",
        plan=["Fetch employee profile", "Review open leave requests", "Summarize balance"],
        steps_completed=[
            {
                "step_index": 0,
                "step": "Fetch employee profile",
                "result": "Found Sarah Jenkins, VP of Engineering.",
            }
        ],
    )

    # 3. Flush in-memory cache
    _tasks.clear()
    assert task_id not in _tasks

    # 4. Retrieve task — must reload from SQLite
    reloaded_task = get_task(task_id)
    assert reloaded_task is not None
    assert reloaded_task.id == task_id
    assert reloaded_task.status == "executing"
    assert len(reloaded_task.plan) == 3
    assert len(reloaded_task.steps_completed) == 1
    assert "Sarah Jenkins" in reloaded_task.steps_completed[0]["result"]

    # 5. Finalize task and re-check persistence
    update_task(task_id, status="done", result="Sarah Jenkins has 22 days available PTO.")
    _tasks.clear()

    final_task = get_task(task_id)
    assert final_task is not None
    assert final_task.status == "done"
    assert "22 days" in final_task.result
