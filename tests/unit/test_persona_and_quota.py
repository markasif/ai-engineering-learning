"""
Unit tests for Option 3: Role-Aware Demo Persona Switcher (RBAC) and LinkedIn Abuse Guard Quota.
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from shared.domain_mcp_server import update_leave_status
from shared.llm_client import LLMResponse
from shared.session_store import add_message


@pytest.mark.asyncio
async def test_update_leave_status_rbac_employee_denied():
    """Verify that employee role cannot approve or reject leaves."""
    res = await update_leave_status(
        request_code="LV-2026-001",
        status="Approved",
        caller_role="employee",
    )
    assert res["success"] is False
    assert "Permission Denied" in res["error"]
    assert res["requires_role"] == "manager"


@pytest.mark.asyncio
async def test_update_leave_status_rbac_manager_allowed():
    """Verify that manager role can approve leaves."""
    res = await update_leave_status(
        request_code="LV-2026-001",
        status="Approved",
        caller_role="manager",
    )
    assert res["success"] is True
    assert res["status"] == "Approved"


@pytest.mark.asyncio
async def test_demo_quota_exceeded_returns_429():
    """Verify that after 15 user messages in a session, demo requests return 429."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        sess_resp = await client.post("/api/sessions")
        assert sess_resp.status_code == 200
        session_id = sess_resp.json()["session_id"]

        # Seed 15 user messages in the session
        for i in range(15):
            add_message(session_id, "user", f"Test message {i}")
            add_message(session_id, "assistant", f"Reply {i}")

        # The 16th message without BYOK key should be rejected with 429
        chat_resp = await client.post(
            f"/api/sessions/{session_id}/chat/smart",
            json={"message": "Exceed quota attempt"},
        )
        assert chat_resp.status_code == 429
        assert "DEMO_LIMIT_REACHED" in chat_resp.json()["detail"]


@pytest.mark.asyncio
async def test_demo_quota_bypassed_with_user_api_key():
    """Verify that visitors who enter their own API key (BYOK) bypass the 15-message cap."""
    transport = ASGITransport(app=app)
    mock_classification = {
        "needs_retrieval": False,
        "confidence": 0.95,
        "reasoning": "Mock test query",
    }
    mock_llm_response = LLMResponse(content="BYOK answer", model="mock-model")

    with (
        patch(
            "app.api.v1.endpoints.chat.classify_query",
            new=AsyncMock(return_value=mock_classification),
        ),
        patch("app.api.v1.endpoints.chat.call_llm", new=AsyncMock(return_value=mock_llm_response)),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            sess_resp = await client.post("/api/sessions")
            session_id = sess_resp.json()["session_id"]

            for i in range(15):
                add_message(session_id, "user", f"Test {i}")

            chat_resp = await client.post(
                f"/api/sessions/{session_id}/chat/smart",
                json={"message": "BYOK message"},
                headers={"X-User-API-Key": "gsk_custom_user_key_12345"},
            )
            assert chat_resp.status_code == 200
            data = chat_resp.json()
            assert data["answer"] == "BYOK answer"
            assert data["demo_credits_left"] == -1
