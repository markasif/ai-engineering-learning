"""Agent and planning-related schemas."""
from typing import Any
from pydantic import BaseModel, Field


class AgentRequest(BaseModel):
    message: str = Field(..., description="Task instructions for the autonomous agent")


class PlanRequest(BaseModel):
    message: str = Field(..., description="High-level goal to decompose into execution steps")


class McpExecuteRequest(BaseModel):
    tool_name: str = Field(..., description="Name of the MCP tool to execute")
    arguments: dict[str, Any] = Field(default_factory=dict, description="Arguments dictionary for the tool")


__all__ = ["AgentRequest", "PlanRequest", "McpExecuteRequest"]

