"""
Live smoke test for the Groq provider.
"""

import os

import pytest

from shared.config import settings
from shared.providers.groq_provider import GroqProvider

pytestmark = pytest.mark.skipif(
    not os.getenv("GROQ_API_KEY")
    or os.getenv("GROQ_API_KEY", "").startswith("mock")
    or os.getenv("GROQ_API_KEY", "").startswith("gsk_mock")
    or settings.groq_api_key.startswith("gsk_mock"),
    reason="Requires valid non-mock GROQ_API_KEY in environment",
)


@pytest.mark.asyncio
async def test_live_groq_basic_chat():
    provider = GroqProvider()
    result = await provider.chat(
        messages=[
            {"role": "system", "content": "You are a concise assistant."},
            {"role": "user", "content": "Reply with exactly three words."},
        ],
        temperature=0.0,
        max_tokens=20,
    )
    assert result.content is not None
    assert len(result.content) > 0
    assert result.provider == "groq"
