"""Unit tests for the keep-alive endpoint and Supabase ping mechanism."""

from fastapi.testclient import TestClient

from app.main import app
from shared.supabase_sync import ping_supabase


def test_keepalive_endpoint():
    client = TestClient(app)
    response = client.get("/keepalive")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["render"] == "awake"
    assert "supabase" in data
    assert "timestamp" in data


def test_api_keepalive_endpoint():
    client = TestClient(app)
    response = client.get("/api/keepalive")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["render"] == "awake"


def test_ping_supabase_structure():
    result = ping_supabase()
    assert isinstance(result, dict)
    assert "configured" in result
    assert "status" in result

