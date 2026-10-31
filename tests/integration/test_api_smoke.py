"""
Smoke and integration tests for the enterprise FastAPI application.
Ensures routers, middlewares, health checks, and static UI mounts function correctly.
"""
import pytest
from fastapi.testclient import TestClient


def test_health_returns_200(client: TestClient):
    resp = client.get("/api/health")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    body = resp.json()
    assert body.get("status") == "ok"
    assert "version" in body
    assert "provider" in body


def test_ui_served(client: TestClient):
    resp = client.get("/")
    assert resp.status_code in (200, 301, 302), f"Expected 200/redirect, got {resp.status_code}"


def test_metrics_endpoint(client: TestClient):
    resp = client.get("/api/metrics")
    assert resp.status_code == 200
    body = resp.json()
    assert "total_requests" in body
    assert "avg_latency_ms" in body
    assert "error_rate" in body


def test_provider_info_endpoint(client: TestClient):
    resp = client.get("/api/provider-info")
    assert resp.status_code == 200
    body = resp.json()
    assert "llm_provider" in body


def test_v1_versioned_prefix_works(client: TestClient):
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("status") == "ok"


def test_sessions_lifecycle(client: TestClient):
    create_resp = client.post("/api/sessions")
    assert create_resp.status_code == 200
    session_id = create_resp.json().get("session_id")
    assert session_id is not None

    list_resp = client.get("/api/sessions")
    assert list_resp.status_code == 200
    sessions = list_resp.json()
    assert any(s["id"] == session_id for s in sessions)

