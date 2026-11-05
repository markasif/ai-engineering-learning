"""
FastAPI dependencies for tenant isolation, BYOK API keys, and store access.
"""

from fastapi import Request

from shared.tenant_context import get_tenant_id


def get_user_api_key(request: Request) -> str | None:
    """
    Extract optional custom LLM API key (BYOK - Bring Your Own Key) from headers.
    Allows public demo guests or power users to bypass shared rate limits
    using their own free Groq key (gsk_...) or OpenAI key (sk-...).
    """
    key = request.headers.get("x-user-api-key") or request.headers.get("x-byok-key")
    if key and key.strip():
        return key.strip()
    return None


__all__ = ["get_tenant_id", "get_user_api_key"]
