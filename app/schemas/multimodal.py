"""Multimodal audio, vision, and routing schemas."""
from typing import Any
from pydantic import BaseModel, Field


class VoiceChatResponse(BaseModel):
    transcript: str = Field(..., description="Transcribed audio prompt")
    answer: str = Field(..., description="Assistant answer text")
    audio_base64: str = Field(..., description="Base64 encoded synthesized audio response")
    audio_mime: str = Field("audio/mpeg", description="MIME type of output audio")


class VisionAnalyzeResponse(BaseModel):
    answer: str = Field(..., description="VLM description or analysis of the input image")
    model_used: str = Field(..., description="Identifier of the vision model used")


class MultimodalChatResponse(BaseModel):
    modality: str = Field(..., description="Modality processed: text, voice, or vision")
    answer: str = Field(..., description="Assistant response text")
    source: str | None = None
    chunks_used: list[dict[str, Any]] = Field(default_factory=list)
    confidence: float | None = None
    retrieval_method: str | None = None
    transcript: str | None = None
    audio_base64: str | None = None
    audio_mime: str | None = None
    model_used: str | None = None


__all__ = [
    "VoiceChatResponse",
    "VisionAnalyzeResponse",
    "MultimodalChatResponse",
]

