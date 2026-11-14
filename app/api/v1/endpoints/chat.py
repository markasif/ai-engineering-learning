"""
Chat, memory, session, and smart-router endpoints.
"""

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.deps import get_tenant_id, get_user_api_key
from app.core.config import settings
from app.core.rate_limit import rate_limit
from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    MultiTenantModeRequest,
    SessionSummary,
    SmartChatRequest,
    SmartChatResponse,
    StructuredResponse,
)
from shared.document_store import list_documents
from shared.llm_client import call_llm, stream_llm
from shared.models import Message
from shared.retrieval_memory import (
    build_knowledge_digest,
    get_current_digest,
    get_recent_retrievals,
    log_retrieval,
)
from shared.router import _QUICK_GREETINGS, classify_query
from shared.session_store import (
    add_message,
    create_session,
    delete_session,
    get_session,
    list_sessions,
    truncate_session_messages,
)
from shared.vector_store import search as vector_search

router = APIRouter()
_log = logging.getLogger(__name__)

CONTEXT_WINDOW_SIZE = 20
_DOMAIN = settings.effective_domain()

_STRUCTURED_SYSTEM_PROMPT = f"""You are a helpful AI assistant for {_DOMAIN}.
Respond ONLY with JSON: {{"intent": "...", "answer": "...", "confidence": 0.0, "sources_needed": false}}"""

_SMART_SYSTEM_PROMPT = (
    f"You are a helpful AI assistant for {_DOMAIN}. Answer clearly and concisely in plain English."
)
_SMART_RAG_SYSTEM_PROMPT = (
    f"You are a helpful AI assistant for {_DOMAIN}. "
    "Use the provided document excerpts (which may include company handbooks, policies, contracts, resumes, or CVs) to answer accurately and factually. "
    "When asked about experience, employment history, dates, or qualifications, extract and calculate the answers directly from the retrieved document context."
)
_SMART_HYBRID_SYSTEM_PROMPT = (
    f"You are a helpful AI assistant for {_DOMAIN}. "
    "Some excerpts from uploaded documents have been retrieved — use them if helpful to ground your answer."
)

DEMO_MAX_MESSAGES_PER_SESSION = 15


def _build_persona_context(
    persona: str = "employee",
    user_name: str | None = None,
    user_code: str | None = None,
) -> str:
    role = (persona or "employee").lower()
    name = user_name or ("Sarah Jenkins" if role == "manager" else "Rahul Sharma")
    code = user_code or ("EMP-102" if role == "manager" else "EMP-101")
    if role == "manager":
        return (
            f"\n\nCURRENT USER CONTEXT: {name} ({code}) — Role: Manager (VP of Engineering / HR Operations). "
            f"You have full manager authority to review team requests, approve claims, and oversee department operations."
        )
    return (
        f"\n\nCURRENT USER CONTEXT: {name} ({code}) — Role: Employee (Senior Frontend Developer). "
        f"You can view company policies, search staff directory, check your own leave balance, and submit your claims. "
        f"You do NOT have manager authority to approve or reject leave requests or expenses for other employees."
    )


def _parse_structured(raw_text: str) -> StructuredResponse:
    try:
        return StructuredResponse(**json.loads(raw_text))
    except Exception:
        return StructuredResponse(
            intent="unclear", answer=raw_text or "", confidence=0.0, sources_needed=False
        )


def _build_context_block(chunks: list[dict[str, Any]]) -> str:
    lines = ["--- RETRIEVED CONTEXT ---"]
    for i, chunk in enumerate(chunks, 1):
        lines.append(
            f"\n[{i}] From: {chunk.get('filename', 'unknown')} (chunk {chunk.get('chunk_index', 0)})"
        )
        lines.append(str(chunk.get("text", "")))
    lines.append("--- END CONTEXT ---")
    return "\n".join(lines)


@router.post("/chat", response_model=ChatResponse, tags=["F1 · Hello AI"])
@rate_limit("60/minute")
async def chat(
    request: Request,
    body: ChatRequest,
    user_api_key: str | None = Depends(get_user_api_key),
) -> ChatResponse:
    """Basic chat endpoint — rate limited to 60 requests per minute per IP."""
    messages = [
        {
            "role": "system",
            "content": f"You are a helpful AI assistant for {_DOMAIN}. Answer clearly and concisely.",
        },
        {"role": "user", "content": body.message},
    ]
    result = await call_llm(messages, api_key=user_api_key)
    return ChatResponse(response=result.content or "")


@router.post("/chat/structured", response_model=StructuredResponse, tags=["F2 · Prompt Mastery"])
@rate_limit("60/minute")
async def chat_structured(
    request: Request,
    body: ChatRequest,
    user_api_key: str | None = Depends(get_user_api_key),
) -> StructuredResponse:
    """Structured JSON-mode chat — rate limited to 60 requests per minute per IP."""
    result = await call_llm(
        [
            {"role": "system", "content": _STRUCTURED_SYSTEM_PROMPT},
            {"role": "user", "content": body.message},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
        api_key=user_api_key,
    )
    return _parse_structured(result.content or "")


@router.post("/sessions", tags=["F3 · AI Memory"])
async def new_session(tenant_id: str = Depends(get_tenant_id)) -> dict[str, str]:
    """Create a new session isolated by tenant."""
    return {"session_id": create_session(tenant_id=tenant_id)}


@router.get("/sessions", response_model=list[SessionSummary], tags=["F3 · AI Memory"])
async def sessions_list(tenant_id: str = Depends(get_tenant_id)) -> list[SessionSummary]:
    """List existing chat sessions for the active tenant, pruning abandoned 0-message ghosts."""
    summaries = []
    has_empty = False
    for s in list_sessions(tenant_id=tenant_id):
        # Keep all sessions with actual messages. For empty sessions (0 messages),
        # only keep at most the single newest one so ghost sessions don't pile up.
        if not s.messages:
            if has_empty:
                continue
            has_empty = True

        first_user_msg = next((m.content for m in s.messages if m.role == "user"), "")
        title = (
            (first_user_msg[:60] + "…")
            if len(first_user_msg) > 60
            else (first_user_msg or "New conversation")
        )
        summaries.append(
            SessionSummary(
                id=s.id,
                created_at=s.created_at.isoformat(),
                message_count=len(s.messages),
                title=title,
            )
        )
    return summaries


@router.post(
    "/sessions/{session_id}/chat", response_model=StructuredResponse, tags=["F3 · AI Memory"]
)
@rate_limit("30/minute")
async def session_chat(
    request: Request,
    session_id: str,
    body: ChatRequest,
    tenant_id: str = Depends(get_tenant_id),
    user_api_key: str | None = Depends(get_user_api_key),
) -> StructuredResponse:
    """Chat within a specific session maintaining conversation context window."""
    session = get_session(session_id, tenant_id=tenant_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    window_size = CONTEXT_WINDOW_SIZE if user_api_key else 6
    messages: list[dict[str, Any]] = [{"role": "system", "content": _STRUCTURED_SYSTEM_PROMPT}]
    for msg in session.messages[-window_size:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": body.message})

    add_message(session_id, "user", body.message)
    result = await call_llm(
        messages,
        temperature=0.3,
        response_format={"type": "json_object"},
        api_key=user_api_key,
    )
    structured = _parse_structured(result.content or "")
    add_message(session_id, "assistant", structured.answer)
    return structured


@router.get("/sessions/{session_id}/history", response_model=list[Message], tags=["F3 · AI Memory"])
async def session_history(
    session_id: str, tenant_id: str = Depends(get_tenant_id)
) -> list[Message]:
    """Fetch message history for a given session."""
    session = get_session(session_id, tenant_id=tenant_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return session.messages


@router.delete("/sessions/{session_id}", tags=["F3 · AI Memory"])
async def remove_session(
    session_id: str, tenant_id: str = Depends(get_tenant_id)
) -> dict[str, str]:
    """Delete a chat session and all its associated message history."""
    if not delete_session(session_id, tenant_id=tenant_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return {"deleted": session_id}


class TruncateSessionRequest(BaseModel):
    keep_count: int = Field(
        default=0, ge=0, description="Number of earliest messages to keep in session history"
    )


@router.post("/sessions/{session_id}/truncate", tags=["F3 · AI Memory"])
async def session_truncate(
    session_id: str,
    body: TruncateSessionRequest,
    tenant_id: str = Depends(get_tenant_id),
) -> dict[str, Any]:
    """Truncate message history to an earlier point for editing previous messages."""
    if not truncate_session_messages(session_id, body.keep_count, tenant_id=tenant_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    session = get_session(session_id, tenant_id=tenant_id)
    return {"status": "ok", "message_count": len(session.messages) if session else 0}


@router.post(
    "/sessions/{session_id}/chat/smart",
    response_model=SmartChatResponse,
    tags=["F6 · Smart Router"],
)
@rate_limit("30/minute")
async def smart_chat(
    request: Request,
    session_id: str,
    body: SmartChatRequest,
    tenant_id: str = Depends(get_tenant_id),
    user_api_key: str | None = Depends(get_user_api_key),
) -> SmartChatResponse:
    """Smart router: dynamically chooses LLM, RAG, or Hybrid retrieval based on query classification."""
    session = get_session(session_id, tenant_id=tenant_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    if not user_api_key:
        user_msg_count = sum(1 for m in session.messages if m.role == "user")
        if user_msg_count >= DEMO_MAX_MESSAGES_PER_SESSION:
            raise HTTPException(
                status_code=429,
                detail=(
                    "DEMO_LIMIT_REACHED: You have used your 15 demo credits for this conversation. "
                    "Configure your own free Groq API key in Settings (⚙️) to continue without limits, or start a New Chat."
                ),
            )
        credits_left = max(0, DEMO_MAX_MESSAGES_PER_SESSION - (user_msg_count + 1))
    else:
        credits_left = -1

    classification = await classify_query(body.message, api_key=user_api_key)
    chunks_used: list[dict[str, Any]] = []
    source = "llm"
    retrieval_method = "none"
    system_prompt = _SMART_SYSTEM_PROMPT

    active_docs = list_documents(tenant_id=tenant_id)
    ready_docs = [d for d in active_docs if d.status == "ready"]
    ready_doc_ids = {d.id for d in ready_docs}

    if ready_docs:
        doc_names = ", ".join([f"'{d.filename}'" for d in ready_docs])
        system_prompt += (
            f"\n\nAvailable uploaded documents in this organization: {doc_names}. "
            "If the user asks what documents or files are uploaded, you can list and describe them."
        )

    normalized_q = body.message.strip().lower().rstrip("!?.,")
    is_greeting = normalized_q in _QUICK_GREETINGS
    should_retrieve = classification.get("needs_retrieval", False)

    if ready_doc_ids and not is_greeting:
        top_k = 5 if should_retrieve else 4
        min_score = 0.30 if should_retrieve else 0.35
        raw_chunks = vector_search(body.message, top_k=top_k, tenant_id=tenant_id)
        chunks_used = [
            c
            for c in raw_chunks
            if c.get("document_id") in ready_doc_ids and c.get("score", 0) >= min_score
        ]
        if chunks_used:
            source = "rag" if should_retrieve else "hybrid"
            retrieval_method = "vector"
            system_prompt = (
                _SMART_RAG_SYSTEM_PROMPT if should_retrieve else _SMART_HYBRID_SYSTEM_PROMPT
            )

    system_prompt += _build_persona_context(
        body.persona or "employee", body.user_name, body.user_code
    )

    if settings.enable_long_term_context:
        digest = get_current_digest(tenant_id)
        if digest and digest.summary:
            system_prompt += f"\n\nContext about this user's history: {digest.summary}"

    window_size = CONTEXT_WINDOW_SIZE if user_api_key else 6
    max_tokens = 1000 if user_api_key else 400

    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    if chunks_used:
        messages.append({"role": "system", "content": _build_context_block(chunks_used)})
    for msg in session.messages[-window_size:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": body.message})

    result = await call_llm(messages, max_tokens=max_tokens, api_key=user_api_key)
    answer = result.content or ""
    add_message(session_id, "user", body.message)
    add_message(session_id, "assistant", answer)

    if chunks_used and settings.enable_long_term_context:
        chunk_ids = [f"{c.get('document_id', '')}_{c.get('chunk_index', 0)}" for c in chunks_used]
        log_retrieval(
            session_id=session_id,
            tenant_id=tenant_id,
            query=body.message,
            chunk_ids=chunk_ids,
            retrieval_method=retrieval_method,
        )

    return SmartChatResponse(
        answer=answer,
        source=source,
        chunks_used=chunks_used,
        confidence=classification["confidence"],
        retrieval_method=retrieval_method,
        demo_credits_left=credits_left,
    )


@router.post(
    "/sessions/{session_id}/chat/smart/stream",
    tags=["F6 · Smart Router"],
)
@rate_limit("30/minute")
async def smart_chat_stream(
    request: Request,
    session_id: str,
    body: SmartChatRequest,
    tenant_id: str = Depends(get_tenant_id),
    user_api_key: str | None = Depends(get_user_api_key),
) -> StreamingResponse:
    """Stream tokens from the smart router in real time via Server-Sent Events (SSE)."""
    session = get_session(session_id, tenant_id=tenant_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    if not user_api_key:
        user_msg_count = sum(1 for m in session.messages if m.role == "user")
        if user_msg_count >= DEMO_MAX_MESSAGES_PER_SESSION:
            raise HTTPException(
                status_code=429,
                detail=(
                    "DEMO_LIMIT_REACHED: You have used your 15 demo credits for this conversation. "
                    "Configure your own free Groq API key in Settings (⚙️) to continue without limits, or start a New Chat."
                ),
            )
        credits_left = max(0, DEMO_MAX_MESSAGES_PER_SESSION - (user_msg_count + 1))
    else:
        credits_left = -1

    classification = await classify_query(body.message, api_key=user_api_key)
    chunks_used: list[dict[str, Any]] = []
    source = "llm"
    retrieval_method = "none"
    system_prompt = _SMART_SYSTEM_PROMPT

    active_docs = list_documents(tenant_id=tenant_id)
    ready_docs = [d for d in active_docs if d.status == "ready"]
    ready_doc_ids = {d.id for d in ready_docs}

    if ready_docs:
        doc_names = ", ".join([f"'{d.filename}'" for d in ready_docs])
        system_prompt += (
            f"\n\nAvailable uploaded documents in this organization: {doc_names}. "
            "If the user asks what documents or files are uploaded, you can list and describe them."
        )

    normalized_q = body.message.strip().lower().rstrip("!?.,")
    is_greeting = normalized_q in _QUICK_GREETINGS
    should_retrieve = classification.get("needs_retrieval", False)

    if ready_doc_ids and not is_greeting:
        top_k = 5 if should_retrieve else 4
        min_score = 0.30 if should_retrieve else 0.35
        raw_chunks = vector_search(body.message, top_k=top_k, tenant_id=tenant_id)
        chunks_used = [
            c
            for c in raw_chunks
            if c.get("document_id") in ready_doc_ids and c.get("score", 0) >= min_score
        ]
        if chunks_used:
            source = "rag" if should_retrieve else "hybrid"
            retrieval_method = "vector"
            system_prompt = (
                _SMART_RAG_SYSTEM_PROMPT if should_retrieve else _SMART_HYBRID_SYSTEM_PROMPT
            )

    system_prompt += _build_persona_context(
        body.persona or "employee", body.user_name, body.user_code
    )

    if settings.enable_long_term_context:
        digest = get_current_digest(tenant_id)
        if digest and digest.summary:
            system_prompt += f"\n\nContext about this user's history: {digest.summary}"

    window_size = CONTEXT_WINDOW_SIZE if user_api_key else 6
    max_tokens = 1000 if user_api_key else 400

    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    if chunks_used:
        messages.append({"role": "system", "content": _build_context_block(chunks_used)})
    for msg in session.messages[-window_size:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": body.message})

    # Record the user turn immediately
    add_message(session_id, "user", body.message)

    async def sse_event_generator():
        # 1. Send start event with source, metadata, and retrieved passages
        start_payload = {
            "type": "start",
            "source": source,
            "retrieval_method": retrieval_method,
            "confidence": classification["confidence"],
            "chunks_used": chunks_used,
            "demo_credits_left": credits_left,
        }
        yield f"data: {json.dumps(start_payload)}\n\n"

        full_answer_parts = []
        try:
            async for token in stream_llm(messages, max_tokens=max_tokens, api_key=user_api_key):
                full_answer_parts.append(token)
                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"

            final_answer = "".join(full_answer_parts)
            add_message(session_id, "assistant", final_answer)

            if chunks_used and settings.enable_long_term_context:
                chunk_ids = [
                    f"{c.get('document_id', '')}_{c.get('chunk_index', 0)}" for c in chunks_used
                ]
                log_retrieval(
                    session_id=session_id,
                    tenant_id=tenant_id,
                    query=body.message,
                    chunk_ids=chunk_ids,
                    retrieval_method=retrieval_method,
                )

            done_payload = {
                "type": "done",
                "answer": final_answer,
                "source": source,
                "retrieval_method": retrieval_method,
                "confidence": classification["confidence"],
                "chunks_used": chunks_used,
                "demo_credits_left": credits_left,
            }
            yield f"data: {json.dumps(done_payload)}\n\n"

        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"

    return StreamingResponse(sse_event_generator(), media_type="text/event-stream")


@router.get("/tenant/info", tags=["F6 · Smart Router"])
async def tenant_info(tenant_id: str = Depends(get_tenant_id)) -> dict[str, Any]:
    """Retrieve tenant context and metadata."""
    from shared.document_store import list_documents
    from shared.session_store import list_sessions

    return {
        "tenant_id": tenant_id,
        "multi_tenant_enabled": settings.enable_multi_tenant,
        "document_count": len(list_documents(tenant_id=tenant_id)),
        "session_count": len(list_sessions(tenant_id=tenant_id)),
    }


@router.post("/tenant/mode", tags=["F6 · Smart Router"])
async def set_multi_tenant_mode(
    body: MultiTenantModeRequest,
    tenant_id: str = Depends(get_tenant_id),
) -> dict[str, Any]:
    """Toggle or set multi-tenant isolation mode dynamically."""
    from shared.document_store import list_documents
    from shared.session_store import list_sessions

    settings.enable_multi_tenant = body.enabled
    effective_tenant = tenant_id if settings.enable_multi_tenant else "default"
    return {
        "multi_tenant_enabled": settings.enable_multi_tenant,
        "tenant_id": effective_tenant,
        "document_count": len(list_documents(tenant_id=effective_tenant)),
        "session_count": len(list_sessions(tenant_id=effective_tenant)),
        "message": f"Multi-tenant isolation is now {'enabled' if settings.enable_multi_tenant else 'disabled'}.",
    }


@router.post("/retrieval-memory/rebuild", tags=["F6 · Smart Router"])
async def retrieval_memory_rebuild(tenant_id: str = Depends(get_tenant_id)) -> dict[str, Any]:
    """Rebuild long-term retrieval memory digest for the tenant."""
    digest = await build_knowledge_digest(tenant_id=tenant_id)
    if digest is None:
        return {"message": "No retrieval history found."}
    return {
        "summary": digest.summary,
        "topics_covered": digest.topics_covered,
        "source_session_count": digest.source_session_count,
        "last_updated": digest.last_updated.isoformat(),
    }


@router.get("/retrieval-memory/digest", tags=["F6 · Smart Router"])
async def retrieval_memory_digest(tenant_id: str = Depends(get_tenant_id)) -> dict[str, Any]:
    """Fetch current retrieval memory digest."""
    digest = get_current_digest(tenant_id=tenant_id)
    if digest is None:
        return {"message": "No digest built yet."}
    return {
        "summary": digest.summary,
        "topics_covered": digest.topics_covered,
        "source_session_count": digest.source_session_count,
        "last_updated": digest.last_updated.isoformat(),
    }


@router.get("/retrieval-memory/recent", tags=["F6 · Smart Router"])
async def retrieval_memory_recent(
    limit: int = 20, tenant_id: str = Depends(get_tenant_id)
) -> list[dict[str, Any]]:
    """Fetch recent retrieval queries logged for this tenant."""
    return [
        {
            "session_id": e.session_id,
            "query": e.query,
            "timestamp": e.timestamp.isoformat(),
            "retrieval_method": e.retrieval_method,
        }
        for e in get_recent_retrievals(tenant_id=tenant_id, limit=limit)
    ]
