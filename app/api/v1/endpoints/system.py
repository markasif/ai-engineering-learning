"""
System infrastructure, health checks, provider status, metrics, and eval harness endpoints.
"""

import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.core.rate_limit import RATE_LIMITING_ENABLED
from shared import metrics
from shared.eval_harness import EvalCase, EvalReport, run_eval

router = APIRouter()
_log = logging.getLogger(__name__)

# Locate eval cases file flexibly
_ROOT_DIR = Path(__file__).resolve().parents[4]
_EVAL_PATHS = [
    _ROOT_DIR / "tests" / "eval" / "eval_cases_example.json",
    _ROOT_DIR / "week-4-launch" / "feature-12-ship-it" / "tests" / "eval_cases_example.json",
]


def _find_eval_cases() -> Path | None:
    for p in _EVAL_PATHS:
        if p.exists():
            return p
    return None


@router.get("/health", tags=["Infrastructure"])
async def health() -> dict[str, Any]:
    """
    Health check with live metrics snapshot.
    Returns status, version, active provider, and request metrics.
    """
    return {
        "status": "ok",
        "version": "12.0.0",
        "provider": settings.llm_provider,
        "metrics": metrics.get_metrics(),
    }


@router.get("/provider-info", tags=["Infrastructure"])
async def provider_info() -> dict[str, Any]:
    """Retrieve operational status and active LLM, Voice, and VLM provider configuration."""
    llm_name = settings.llm_provider.lower().strip()
    model_map = {
        "openai": settings.openai_model,
        "anthropic": settings.anthropic_model,
        "cohere": settings.cohere_model,
        "ollama": settings.ollama_model,
        "groq": settings.groq_model,
        "azure": settings.azure_openai_deployment_name,
        "bedrock": settings.bedrock_model_id,
        "vertex": settings.vertex_model,
        "custom": settings.custom_model,
    }
    voice_name = settings.effective_voice_provider().lower().strip()
    vlm_name = settings.effective_vlm_provider().lower().strip()

    return {
        "llm_provider": llm_name,
        "llm_model": model_map.get(llm_name, "unknown"),
        "voice_provider": voice_name if voice_name != llm_name else None,
        "voice_model": model_map.get(voice_name) if voice_name != llm_name else None,
        "vlm_provider": vlm_name if vlm_name != llm_name else None,
        "vlm_model": settings.vlm_model if vlm_name != llm_name else None,
        "rate_limiting": RATE_LIMITING_ENABLED,
    }


@router.get("/metrics", tags=["F11 · Production Design"])
async def get_metrics() -> dict[str, Any]:
    """Live snapshot of application latency, request counts, and error rates."""
    return metrics.get_metrics()


@router.post("/eval/run", response_model=EvalReport, tags=["F11 · Production Design"])
async def eval_run() -> EvalReport:
    """Run golden eval dataset against the active pipeline and return scored metrics."""
    eval_file = _find_eval_cases()
    if not eval_file:
        raise HTTPException(
            status_code=404,
            detail="Eval cases file not found. Ensure tests/eval/eval_cases_example.json exists.",
        )

    raw = json.loads(eval_file.read_text(encoding="utf-8"))
    cases = [EvalCase(**c) for c in raw]
    report = await run_eval(cases)
    metrics.set_eval_result(report.model_dump())
    _log.info(
        "Eval run complete",
        extra={"passed": report.passed, "total": report.total, "pass_rate": report.pass_rate},
    )
    return report


@router.get("/eval/last", tags=["F11 · Production Design"])
async def eval_last() -> dict[str, Any]:
    """Retrieve the most recent evaluation report."""
    data = metrics.get_metrics().get("eval_last_run")
    if data is None:
        raise HTTPException(
            status_code=404, detail="No eval has been run yet. POST /api/eval/run first."
        )
    return data


@router.get("/models", tags=["OpenAI Compatibility"])
async def get_models() -> dict[str, Any]:
    """OpenAI-compatible models listing endpoint."""
    provider = settings.llm_provider or "custom"
    active_model = (
        getattr(settings, f"{provider}_model", None)
        or getattr(settings, "custom_model", None)
        or getattr(settings, "groq_model", None)
        or "cortex-ai-engine"
    )
    models_data = [
        {
            "id": str(active_model),
            "object": "model",
            "created": 1700000000,
            "owned_by": str(provider),
            "permission": [],
            "root": str(active_model),
            "parent": None,
        },
        {
            "id": "askraggy",
            "object": "model",
            "created": 1700000000,
            "owned_by": "system",
            "permission": [],
            "root": "askraggy",
            "parent": None,
        },
        {
            "id": "cortex-ai",
            "object": "model",
            "created": 1700000000,
            "owned_by": "system",
            "permission": [],
            "root": "cortex-ai",
            "parent": None,
        },
    ]
    return {"object": "list", "data": models_data}
