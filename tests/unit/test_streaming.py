"""
Unit tests for Real-Time Token Streaming (SSE) via Server-Sent Events.
"""

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


async def mock_stream_llm(messages, max_tokens=1000, api_key=None):
    for token in ["Hello", "!", " I", " am", " AskRaggy", " streaming", " live", "."]:
        yield token


def test_smart_chat_stream_endpoint():
    client = TestClient(app)

    # 1. Create session
    s_resp = client.post("/api/sessions")
    assert s_resp.status_code == 200
    session_id = s_resp.json()["session_id"]

    # 2. Mock classify_query and stream_llm to avoid external API calls during automated tests
    mock_classification = {
        "category": "conversational",
        "confidence": 0.95,
        "needs_retrieval": False,
    }

    with (
        patch(
            "app.api.v1.endpoints.chat.classify_query",
            return_value=mock_classification,
        ),
        patch("app.api.v1.endpoints.chat.stream_llm", side_effect=mock_stream_llm),
    ):
        resp = client.post(
            f"/api/sessions/{session_id}/chat/smart/stream",
            json={"message": "Can you stream this test response?"},
        )
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]

        text = resp.text
        assert 'data: {"type": "start"' in text
        assert 'data: {"type": "token", "token": "Hello"}' in text
        assert 'data: {"type": "token", "token": " AskRaggy"}' in text
        assert 'data: {"type": "done"' in text

    # 3. Verify session history recorded both turns
    h_resp = client.get(f"/api/sessions/{session_id}/history")
    assert h_resp.status_code == 200
    history = h_resp.json()
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[0]["content"] == "Can you stream this test response?"
    assert history[1]["role"] == "assistant"
    assert "AskRaggy streaming live" in history[1]["content"]
