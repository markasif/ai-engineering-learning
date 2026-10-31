"""
Unified API Router integrating modular feature endpoints.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import (
    agents,
    chat,
    documents,
    multimodal,
    system,
)

api_router = APIRouter()

# Include all endpoint modules into the unified API router
api_router.include_router(system.router)
api_router.include_router(chat.router)
api_router.include_router(documents.router)
api_router.include_router(agents.router)
api_router.include_router(multimodal.router)

__all__ = ["api_router"]

