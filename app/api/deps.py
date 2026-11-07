"""
FastAPI dependencies for tenant isolation, BYOK API keys, and store access.
"""

import re

from fastapi import Request

from shared.tenant_context import get_tenant_id

_SAFE_KEY_RE = re.compile(r"^[a-zA-Z0-9_\-\.]{8,256}$")


def mask_api_key(key: str | None) -> str:
    """Safely mask API key for log outputs (e.g. gsk_abc...wxyz)."""
    if not key or len(key) < 10:
        return "***"
    return f"{key[:6]}...{key[-4:]}"


def get_user_api_key(request: Request) -> str | None:
    """
    Extract and validate optional custom LLM API key (BYOK - Bring Your Own Key) from headers.
    Allows public demo guests or power users to bypass shared rate limits
    using their own free Groq key (gsk_...) or OpenAI key (sk-...).

    Sanitizes against header injection, control characters, and malformed strings.
    """
    raw_key = request.headers.get("x-user-api-key") or request.headers.get("x-byok-key")
    if not raw_key:
        return None

    key = raw_key.strip()
    # Reject malformed, invalid, or dangerous keys
    if not _SAFE_KEY_RE.match(key):
        return None

    return key


__all__ = ["get_tenant_id", "get_user_api_key", "mask_api_key"]
