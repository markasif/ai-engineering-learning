"""Agent and planning-related schemas."""

from typing import Any

from pydantic import BaseModel, Field


class AgentRequest(BaseModel):
    message: str = Field(..., description="Task instructions for the autonomous agent")
    persona: str | None = Field(default="employee", description="Active role: employee or manager")
    user_name: str | None = Field(
        default="Rahul Sharma", description="Display name of active persona"
    )
    user_code: str | None = Field(default="EMP-101", description="Employee code of active persona")
    persona: str | None = Field(default="employee", description="Active role: employee or manager")
    user_name: str | None = Field(
        default="Rahul Sharma", description="Display name of active persona"
    )
    user_code: str | None = Field(default="EMP-101", description="Employee code of active persona")


class PlanRequest(BaseModel):
    message: str = Field(..., description="High-level goal to decompose into execution steps")
    session_id: str | None = Field(
        default=None, description="Optional existing session ID to associate with the task"
    )


class McpExecuteRequest(BaseModel):
    tool_name: str = Field(..., description="Name of the MCP tool to execute")
    arguments: dict[str, Any] = Field(
        default_factory=dict, description="Arguments dictionary for the tool"
    )


__all__ = ["AgentRequest", "PlanRequest", "McpExecuteRequest"]
