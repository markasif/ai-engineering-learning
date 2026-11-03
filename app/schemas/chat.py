"""Chat-related request and response models."""

from pydantic import BaseModel, Field

from shared.models import SmartChatResponse, StructuredResponse


class ChatRequest(BaseModel):
    message: str = Field(..., description="User prompt or question")


class ChatResponse(BaseModel):
    response: str = Field(..., description="Assistant text response")


class SessionSummary(BaseModel):
    id: str
    created_at: str
    message_count: int
    title: str


class SmartChatRequest(BaseModel):
    message: str = Field(..., description="User prompt to be routed and answered")


class MultiTenantModeRequest(BaseModel):
    enabled: bool = Field(..., description="Enable or disable multi-tenant isolation mode")


__all__ = [
    "ChatRequest",
    "ChatResponse",
    "MultiTenantModeRequest",
    "SessionSummary",
    "SmartChatRequest",
    "SmartChatResponse",
    "StructuredResponse",
]
