"""
Unit tests for Bring-Your-Own-Key (BYOK) architecture.
Validates that custom user API keys correctly route to the proper provider,
extract from headers, and override server defaults without persistence leaks.
"""

from unittest.mock import AsyncMock, patch
import pytest
from starlette.requests import Request

from app.api.deps import get_user_api_key
from shared.providers.factory import get_provider
from shared.providers.groq_provider import GroqProvider
from shared.providers.openai_provider import OpenAIProvider


def test_byok_groq_key_routing():
    """Verify keys starting with 'gsk_' automatically route to GroqProvider with custom key."""
    custom_groq_key = "gsk_test_groq_byok_key_998877"
    provider = get_provider("llm", api_key=custom_groq_key)
    assert isinstance(provider, GroqProvider)
    assert provider._api_key == custom_groq_key
    assert provider._provider_name == "groq"


def test_byok_openai_key_routing():
    """Verify keys starting with 'sk-' automatically route to OpenAIProvider with custom key."""
    custom_openai_key = "sk-test_openai_byok_key_112233"
    provider = get_provider("llm", api_key=custom_openai_key)
    assert isinstance(provider, OpenAIProvider)
    assert provider._api_key == custom_openai_key
    assert provider._model == "gpt-4o-mini"


def test_byok_header_extraction():
    """Verify extraction of custom API key from HTTP request headers."""
    # Test x-user-api-key
    scope = {
        "type": "http",
        "headers": [(b"x-user-api-key", b"gsk_my_groq_key_header")],
    }
    req = Request(scope)
    assert get_user_api_key(req) == "gsk_my_groq_key_header"

    # Test x-byok-key alias
    scope_alias = {
        "type": "http",
        "headers": [(b"x-byok-key", b"sk-my_openai_key_header")],
    }
    req_alias = Request(scope_alias)
    assert get_user_api_key(req_alias) == "sk-my_openai_key_header"

    # Test missing header
    scope_empty = {"type": "http", "headers": []}
    req_empty = Request(scope_empty)
    assert get_user_api_key(req_empty) is None

