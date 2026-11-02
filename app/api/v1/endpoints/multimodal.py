"""
Voice (STT + TTS), Vision (VLM), and Unified Modality Router endpoints.
"""

import base64
from typing import Any

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.deps import get_tenant_id
from app.core.config import settings
from app.schemas.chat import SmartChatRequest
from app.schemas.multimodal import (
    MultimodalChatResponse,
    VisionAnalyzeResponse,
    VoiceChatResponse,
)
from shared.llm_client import (
    analyze_image,
    call_llm,
    synthesize_speech,
    transcribe_audio,
)
from shared.router import detect_modality
from shared.session_store import add_message, get_session

router = APIRouter()

_SMART_SYSTEM_PROMPT = (
    f"You are a helpful AI assistant for {settings.effective_domain()}. "
    "Answer clearly and concisely in plain English."
)


@router.post("/voice/transcribe", tags=["F10 · Multimodal AI"])
async def voice_transcribe(audio: UploadFile = File(...)) -> dict[str, Any]:
    """Transcribe spoken audio input using Speech-to-Text (STT)."""
    audio_bytes = await audio.read()
    text = await transcribe_audio(audio_bytes, audio.filename or "audio.webm")
    return {"text": text, "filename": audio.filename}


@router.post("/voice/chat", response_model=VoiceChatResponse, tags=["F10 · Multimodal AI"])
async def voice_chat(
    audio: UploadFile = File(...),
    session_id: str = Form(""),
    tenant_id: str = Depends(get_tenant_id),
) -> VoiceChatResponse:
    """Full voice loop: Audio In -> STT -> LLM/RAG -> TTS -> Audio Out."""
    # Import endpoint function from chat router for smart chat reuse
    from app.api.v1.endpoints.chat import smart_chat

    audio_bytes = await audio.read()
    transcript = await transcribe_audio(audio_bytes, audio.filename or "audio.webm")

    if session_id:
        session = get_session(session_id, tenant_id=tenant_id)
        if session:
            smart_resp = await smart_chat(
                session_id, SmartChatRequest(message=transcript), tenant_id
            )
            answer = smart_resp.answer
        else:
            result = await call_llm(
                [
                    {"role": "system", "content": _SMART_SYSTEM_PROMPT},
                    {"role": "user", "content": transcript},
                ]
            )
            answer = result.content or ""
    else:
        result = await call_llm(
            [
                {"role": "system", "content": _SMART_SYSTEM_PROMPT},
                {"role": "user", "content": transcript},
            ]
        )
        answer = result.content or ""

    audio_base64 = ""
    try:
        audio_out = await synthesize_speech(answer)
        audio_base64 = base64.b64encode(audio_out).decode()
    except NotImplementedError:
        pass

    return VoiceChatResponse(transcript=transcript, answer=answer, audio_base64=audio_base64)


@router.post("/vision/analyze", response_model=VisionAnalyzeResponse, tags=["F10 · Multimodal AI"])
async def vision_analyze(
    image: UploadFile = File(...),
    prompt: str = Form("Describe this image in detail."),
    detail: str = Form("auto"),
) -> VisionAnalyzeResponse:
    """Single-turn Vision-Language Model (VLM) image comprehension."""
    image_bytes = await image.read()
    result = await analyze_image(image_bytes, prompt, detail)
    return VisionAnalyzeResponse(answer=result.content or "", model_used=result.model)


@router.post("/vision/chat", response_model=VisionAnalyzeResponse, tags=["F10 · Multimodal AI"])
async def vision_chat(
    image: UploadFile = File(...),
    prompt: str = Form("Describe this image in detail."),
    detail: str = Form("auto"),
    session_id: str = Form(""),
    tenant_id: str = Depends(get_tenant_id),
) -> VisionAnalyzeResponse:
    """Multi-turn Vision chat appending image prompts into session memory."""
    image_bytes = await image.read()
    result = await analyze_image(image_bytes, prompt, detail)
    answer = result.content or ""

    if session_id:
        session = get_session(session_id, tenant_id=tenant_id)
        if session:
            add_message(session_id, "user", f"[IMAGE] {prompt}")
            add_message(session_id, "assistant", answer)

    return VisionAnalyzeResponse(answer=answer, model_used=result.model)


@router.post(
    "/chat/multimodal", response_model=MultimodalChatResponse, tags=["F10 · Multimodal AI"]
)
async def multimodal_chat(
    session_id: str = Form(...),
    message: str = Form(""),
    audio: UploadFile | None = File(None),
    image: UploadFile | None = File(None),
    prompt: str = Form(""),
    tenant_id: str = Depends(get_tenant_id),
) -> MultimodalChatResponse:
    """Unified modality router: intelligently handles text, voice, or image input."""
    from app.api.v1.endpoints.chat import smart_chat

    has_audio = audio is not None and bool(audio.filename)
    has_image = image is not None and bool(image.filename)
    modality = detect_modality(has_audio=has_audio, has_image=has_image)

    if modality == "voice":
        audio_bytes = await audio.read()  # type: ignore[union-attr]
        transcript = await transcribe_audio(audio_bytes, audio.filename or "audio.webm")  # type: ignore[union-attr]
        smart_resp = await smart_chat(session_id, SmartChatRequest(message=transcript), tenant_id)
        audio_base64 = ""
        try:
            audio_out = await synthesize_speech(smart_resp.answer)
            audio_base64 = base64.b64encode(audio_out).decode()
        except NotImplementedError:
            pass
        return MultimodalChatResponse(
            modality="voice",
            answer=smart_resp.answer,
            source=smart_resp.source,
            chunks_used=list(smart_resp.chunks_used),
            confidence=smart_resp.confidence,
            retrieval_method=smart_resp.retrieval_method,
            transcript=transcript,
            audio_base64=audio_base64,
            audio_mime="audio/mpeg",
        )

    if modality == "vision":
        image_bytes = await image.read()  # type: ignore[union-attr]
        text_prompt = prompt or message or "Describe this image in detail."
        result = await analyze_image(image_bytes, text_prompt)
        answer = result.content or ""
        session = get_session(session_id, tenant_id=tenant_id)
        if session:
            add_message(session_id, "user", f"[IMAGE] {text_prompt}")
            add_message(session_id, "assistant", answer)
        return MultimodalChatResponse(modality="vision", answer=answer, model_used=result.model)

    smart_resp = await smart_chat(session_id, SmartChatRequest(message=message), tenant_id)
    return MultimodalChatResponse(
        modality="text",
        answer=smart_resp.answer,
        source=smart_resp.source,
        chunks_used=list(smart_resp.chunks_used),
        confidence=smart_resp.confidence,
        retrieval_method=smart_resp.retrieval_method,
    )
