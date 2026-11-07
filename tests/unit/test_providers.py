"""
Tests for the multi-provider abstraction layer.
Validates pure translation logic (no network calls) and error handling in the factory.
"""

import pytest

import shared.config as cfg
from shared.providers import factory
from shared.providers.anthropic_provider import _extract_system_message
from shared.providers.anthropic_provider import _translate_tools as anthropic_translate_tools
from shared.providers.cohere_provider import _split_messages
from shared.providers.cohere_provider import _translate_tools as cohere_translate_tools


def test_get_provider_raises_for_invalid_provider(monkeypatch):
    """factory.get_provider() should raise a clear ValueError for unknown providers."""
    monkeypatch.setattr(cfg.settings, "llm_provider", "nonexistent_provider")
    factory.get_provider.cache_clear()

    with pytest.raises(ValueError, match="nonexistent_provider"):
        factory.get_provider("llm")

    factory.get_provider.cache_clear()


def test_get_provider_raises_missing_api_key(monkeypatch):
    """factory.get_provider() should raise a clear error when the provider key is missing."""
    monkeypatch.setattr(cfg.settings, "llm_provider", "openai")
    monkeypatch.setattr(cfg.settings, "openai_api_key", "")
    factory.get_provider.cache_clear()

    with pytest.raises((ValueError, RuntimeError), match="OPENAI_API_KEY"):
        factory.get_provider("llm")

    factory.get_provider.cache_clear()


class TestAnthropicTranslation:
    """Tests for OpenAI -> Anthropic format conversion helpers."""

    def test_extract_system_message_single(self):
        messages = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello"},
        ]
        system, remaining = _extract_system_message(messages)
        assert system == "You are a helpful assistant."
        assert remaining == [{"role": "user", "content": "Hello"}]

    def test_extract_system_message_multiple(self):
        messages = [
            {"role": "system", "content": "Rule 1."},
            {"role": "system", "content": "Rule 2."},
            {"role": "user", "content": "Hi"},
        ]
        system, remaining = _extract_system_message(messages)
        assert "Rule 1." in system
        assert "Rule 2." in system
        assert len(remaining) == 1

    def test_extract_system_message_none(self):
        messages = [{"role": "user", "content": "Hello"}]
        system, remaining = _extract_system_message(messages)
        assert system == ""
        assert remaining == messages

    def test_translate_tools_basic(self):
        openai_tools = [
            {
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "description": "Returns current weather for a city.",
                    "parameters": {
                        "type": "object",
                        "properties": {"city": {"type": "string", "description": "City name"}},
                        "required": ["city"],
                    },
                },
            }
        ]
        result = anthropic_translate_tools(openai_tools)
        assert len(result) == 1
        tool = result[0]
        assert tool["name"] == "get_weather"
        assert tool["description"] == "Returns current weather for a city."
        assert "input_schema" in tool
        assert "parameters" not in tool
        assert tool["input_schema"]["properties"]["city"]["type"] == "string"


class TestCohereTranslation:
    """Tests for OpenAI -> Cohere format conversion helpers."""

    def test_split_messages_basic(self):
        messages = [
            {"role": "system", "content": "You are helpful."},
            {"role": "user", "content": "First question"},
            {"role": "assistant", "content": "First answer"},
            {"role": "user", "content": "Second question"},
        ]
        preamble, current, history = _split_messages(messages)
        assert preamble == "You are helpful."
        assert current == "Second question"
        assert any(h["role"] == "USER" for h in history)
        assert any(h["role"] == "CHATBOT" for h in history)

    def test_split_messages_roles_uppercased(self):
        messages = [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello!"},
            {"role": "user", "content": "How are you?"},
        ]
        _, _, history = _split_messages(messages)
        roles = {h["role"] for h in history}
        assert all(r == r.upper() for r in roles), f"Non-uppercase roles found: {roles}"

    def test_translate_tools_cohere(self):
        openai_tools = [
            {
                "type": "function",
                "function": {
                    "name": "search",
                    "description": "Search the web.",
                    "parameters": {
                        "type": "object",
                        "properties": {"query": {"type": "string", "description": "Search query"}},
                        "required": ["query"],
                    },
                },
            }
        ]
        result = cohere_translate_tools(openai_tools)
        assert len(result) == 1
        tool = result[0]
        assert tool["name"] == "search"
        assert "parameter_definitions" in tool
        assert "parameters" not in tool
        assert tool["parameter_definitions"]["query"]["required"] is True


def test_get_provider_elevenlabs_voice(monkeypatch):
    """factory.get_provider('voice') returns ElevenLabsProvider when voice_provider is elevenlabs."""
    from shared.providers.elevenlabs_provider import ElevenLabsProvider

    monkeypatch.setattr(cfg.settings, "voice_provider", "elevenlabs")
    monkeypatch.setattr(cfg.settings, "elevenlabs_api_key", "sk_test_key_12345")
    factory.get_provider.cache_clear()

    provider = factory.get_provider("voice")
    assert isinstance(provider, ElevenLabsProvider)
    assert provider.api_key == "sk_test_key_12345"

    factory.get_provider.cache_clear()

