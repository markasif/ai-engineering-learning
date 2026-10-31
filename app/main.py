"""
Main FastAPI Application Entrypoint.
Orchestrates lifespan, middleware, routers, and static UI assets.
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.rate_limit import (
    RATE_LIMITING_ENABLED,
    RateLimitExceeded,
    _rate_limit_exceeded_handler,
    limiter,
)
from shared.logging_config import setup_logging
from shared.middleware import RequestIDMiddleware, TimingMiddleware
from shared.provider_check import check_provider_config

_log = logging.getLogger(__name__)

OPENAPI_TAGS = [
    {
        "name": "Infrastructure",
        "description": "Health checks, provider configuration, latency metrics, and operational readiness.",
    },
    {
        "name": "F1 · Hello AI",
        "description": "Core conversation and basic prompt completions.",
    },
    {
        "name": "F2 · Prompt Mastery",
        "description": "Deterministic JSON-mode responses with intent classification and confidence scores.",
    },
    {
        "name": "F3 · AI Memory",
        "description": "Session persistence and sliding-window conversation history.",
    },
    {
        "name": "F4 · Feed the Brain",
        "description": "Document ingestion pipeline: text extraction, semantic chunking, and metadata indexing.",
    },
    {
        "name": "F5 · Find the Answer",
        "description": "Vector database semantic similarity search across ingested content.",
    },
    {
        "name": "F6 · Smart Router",
        "description": "Intelligent query classification routing between direct LLM, RAG, and Hybrid retrieval modes.",
    },
    {
        "name": "F7 · First Agent",
        "description": "ReAct tool-calling agent executing local domain tools.",
    },
    {
        "name": "F8 · Multi-Step Agent",
        "description": "Plan-and-Execute multi-step autonomous task decomposition and background execution.",
    },
    {
        "name": "F9 · MCP Integration",
        "description": "Model Context Protocol client for dynamically discovering and calling external MCP server tools.",
    },
    {
        "name": "F10 · Multimodal AI",
        "description": "Unified speech-to-text, text-to-speech audio synthesis, and VLM vision understanding.",
    },
    {
        "name": "F11 · Production Design",
        "description": "Observability, rate limiting, and golden evaluation quality benchmark harness.",
    },
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager handling startup verification and clean shutdown."""
    setup_logging()
    try:
        await check_provider_config()
        _log.info("Production AI Assistant Application initialized successfully", extra={"event": "startup"})
    except RuntimeError as exc:
        _log.warning("Provider configuration check note: %s", exc)
    yield
    _log.info("Application shutting down", extra={"event": "shutdown"})


def create_application() -> FastAPI:
    """Application factory building configured FastAPI instance."""
    app = FastAPI(
        title="AskRaggy Enterprise AI Platform API",
        description=(
            "Industry-grade domain-specific AI assistant microservice architecture.\n\n"
            "Features full RAG pipeline, ReAct agent execution, Model Context Protocol (MCP), "
            "multimodal audio/vision support, tenant isolation, and continuous evaluation gates."
        ),
        version="1.0.0",
        lifespan=lifespan,
        openapi_tags=OPENAPI_TAGS,
    )

    # 1. CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 2. Custom Observability Middleware (Request ID and Latency Timing)
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(TimingMiddleware)

    # 3. Rate Limiting Exception Handler
    if RATE_LIMITING_ENABLED and limiter is not None:
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

    # 4. Mount API Routers
    app.include_router(api_router, prefix="/api")
    app.include_router(api_router, prefix="/api/v1")

    # Root health check alias
    @app.get("/health", tags=["Infrastructure"], include_in_schema=False)
    async def root_health():
        from app.api.v1.endpoints.system import health
        return await health()

    # OpenAI Compatibility aliases (e.g. GET /v1/models called by external clients)
    @app.get("/v1/models", tags=["OpenAI Compatibility"], include_in_schema=False)
    @app.get("/models", tags=["OpenAI Compatibility"], include_in_schema=False)
    async def root_models():
        from app.api.v1.endpoints.system import get_models
        return await get_models()

    # 5. Mount Static Frontend UI if present
    repo_root = Path(__file__).resolve().parent.parent
    ui_path = repo_root / "ui"
    if ui_path.exists():
        app.mount("/", StaticFiles(directory=str(ui_path), html=True), name="ui")

    return app


app = create_application()
