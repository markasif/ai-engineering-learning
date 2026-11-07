"""
Provider implementation for ElevenLabs Speech-to-Text (STT) and Text-to-Speech (TTS).

Enables natural voice loops using ElevenLabs Scribe STT and multilingual TTS.
"""

import logging
from collections.abc import AsyncIterator

import httpx

from shared.config import settings
from shared.providers.base import LLMProvider, LLMResponse

_log = logging.getLogger(__name__)

# Default voice: "Rachel" (calm, clear voice included on all ElevenLabs accounts)
DEFAULT_ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"


class ElevenLabsProvider(LLMProvider):
    """Voice provider implementing ElevenLabs Scribe STT and Text-to-Speech."""

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.elevenlabs_api_key

    async def chat(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 1000,
        tools: list[dict] | None = None,
        response_format: dict | None = None,
    ) -> LLMResponse:
        raise NotImplementedError(
            "ElevenLabs is a dedicated voice provider (STT/TTS). "
            "Set LLM_PROVIDER to groq, openai, anthropic, or custom for chat."
        )

    async def chat_stream(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 1000,
        tools: list[dict] | None = None,
    ) -> AsyncIterator[str]:
        raise NotImplementedError("ElevenLabs does not support text chat streaming.")
        yield ""  # pragma: no cover

    async def transcribe(self, audio_bytes: bytes, filename: str) -> str:
        """Transcribe spoken audio via ElevenLabs Scribe STT API."""
        if not self.api_key:
            raise ValueError(
                "ELEVENLABS_API_KEY is not configured in .env. "
                "Get your secret API key (starts with 'sk_') from elevenlabs.io."
            )

        model_id = settings.elevenlabs_stt_model or "scribe_v2"
        mime = "audio/webm"
        low = filename.lower()
        if low.endswith(".wav"):
            mime = "audio/wav"
        elif low.endswith(".mp3"):
            mime = "audio/mpeg"
        elif low.endswith(".m4a"):
            mime = "audio/m4a"
        elif low.endswith(".ogg"):
            mime = "audio/ogg"

        async with httpx.AsyncClient(timeout=settings.provider_timeout_seconds) as client:
            response = await client.post(
                "https://api.elevenlabs.io/v1/speech-to-text",
                headers={"xi-api-key": self.api_key},
                data={"model_id": model_id},
                files={"file": (filename or "recording.webm", audio_bytes, mime)},
            )

            if response.status_code >= 400:
                err_text = response.text
                try:
                    err_json = response.json()
                    detail = err_json.get("detail", err_text)
                    if isinstance(detail, dict):
                        err_text = detail.get("message", err_text)
                    elif isinstance(detail, str):
                        err_text = detail
                except Exception:
                    pass
                raise ValueError(f"ElevenLabs STT error: {err_text}")

            payload = response.json()
            return str(payload.get("text", "")).strip()

    async def synthesize_speech(self, text: str, voice: str = "default") -> bytes:
        """Synthesize spoken audio via ElevenLabs Text-to-Speech API."""
        if not self.api_key:
            raise ValueError("ELEVENLABS_API_KEY is not configured in .env.")

        voice_id = DEFAULT_ELEVENLABS_VOICE_ID if (not voice or voice == "default") else voice
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

        async with httpx.AsyncClient(timeout=settings.provider_timeout_seconds) as client:
            response = await client.post(
                url,
                headers={
                    "xi-api-key": self.api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "text": text,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                    },
                },
            )

            if response.status_code >= 400:
                err_text = response.text
                try:
                    err_json = response.json()
                    detail = err_json.get("detail", err_text)
                    if isinstance(detail, dict):
                        err_text = detail.get("message", err_text)
                    elif isinstance(detail, str):
                        err_text = detail
                except Exception:
                    pass
                raise ValueError(f"ElevenLabs TTS error: {err_text}")

            return response.content

    async def analyze_image(
        self, image_bytes: bytes, prompt: str, detail: str = "auto"
    ) -> LLMResponse:
        raise NotImplementedError("ElevenLabs does not support vision/image analysis.")
