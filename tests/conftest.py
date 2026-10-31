"""
Pytest global fixtures and test setup.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session", autouse=True)
def configure_test_environment():
    """Ensure test environment variables are initialized for deterministic test runs."""
    import shared.config as cfg
    from shared.providers import factory

    original_provider = cfg.settings.llm_provider
    original_key = cfg.settings.groq_api_key

    cfg.settings.llm_provider = "groq"
    cfg.settings.groq_api_key = "gsk_mock_test_key_for_testing"
    cfg.settings.groq_model = "llama-3.3-70b-versatile"
    factory.get_provider.cache_clear()
    yield
    cfg.settings.llm_provider = original_provider
    cfg.settings.groq_api_key = original_key
    factory.get_provider.cache_clear()


@pytest.fixture(scope="module")
def client():
    """FastAPI TestClient fixture running against the enterprise app."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(autouse=True)
def reset_in_memory_stores():
    """Reset all memory and document stores before and after each test."""
    import shared.document_store as ds
    import shared.session_store as ss

    ds._documents.clear()
    ds._chunks.clear()
    ss._store.clear()
    yield
    ds._documents.clear()
    ds._chunks.clear()
    ss._store.clear()
