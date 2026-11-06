"""
Autonomous tool-calling agents, multi-step planner, and MCP endpoints.
"""

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from app.api.deps import get_tenant_id, get_user_api_key
from app.core.rate_limit import rate_limit
from app.schemas.agents import AgentRequest, McpExecuteRequest, PlanRequest
from shared.agent import run_agent_with_mcp
from shared.mcp_client import SERVER_REGISTRY, call_mcp_tool, list_mcp_tools
from shared.planner import execute_plan, make_plan
from shared.session_store import create_session, get_session
from shared.task_store import create_task, get_task, update_task

router = APIRouter()


@router.post("/sessions/{session_id}/agent/run", tags=["F7 · First Agent"])
@rate_limit("30/minute")
async def agent_run(
    request: Request,
    session_id: str,
    body: AgentRequest,
    tenant_id: str = Depends(get_tenant_id),
    user_api_key: str | None = Depends(get_user_api_key),
) -> dict[str, Any]:
    """Execute ReAct tool-calling agent with local and MCP registered tools."""
    session = get_session(session_id, tenant_id=tenant_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    if not user_api_key:
        user_msg_count = sum(1 for m in session.messages if m.role == "user")
        if user_msg_count >= 15:
            raise HTTPException(
                status_code=429,
                detail=(
                    "DEMO_LIMIT_REACHED: You have used your 15 demo credits for this conversation. "
                    "Configure your own free Groq API key in Settings (⚙️) to continue without limits, or start a New Chat."
                ),
            )

    res = await run_agent_with_mcp(
        message=body.message,
        session_id=session_id,
        tenant_id=tenant_id,
        api_key=user_api_key,
        persona=body.persona or "employee",
        user_name=body.user_name or "Rahul Sharma",
        user_code=body.user_code or "EMP-101",
    )
    if not user_api_key:
        updated_session = get_session(session_id, tenant_id=tenant_id)
        current_count = sum(
            1 for m in (updated_session.messages if updated_session else []) if m.role == "user"
        )
        res["demo_credits_left"] = max(0, 15 - current_count)
    else:
        res["demo_credits_left"] = -1
    return res


@router.post("/agent/plan", tags=["F8 · Multi-Step Agent"])
@rate_limit("15/minute")
async def agent_plan(
    http_request: Request,
    request: PlanRequest,
    background_tasks: BackgroundTasks,
    tenant_id: str = Depends(get_tenant_id),
    user_api_key: str | None = Depends(get_user_api_key),
) -> dict[str, Any]:
    """Plan-and-Execute agent: breaks a goal into sequential steps executed in the background."""
    session_id = request.session_id or create_session(tenant_id=tenant_id)
    task = create_task(message=request.message, session_id=session_id, tenant_id=tenant_id)
    plan = await make_plan(request.message, api_key=user_api_key)
    update_task(task.id, plan=plan)
    background_tasks.add_task(execute_plan, task.id, api_key=user_api_key)
    return {"task_id": task.id, "session_id": session_id, "plan": plan}


@router.get("/agent/status/{task_id}", tags=["F8 · Multi-Step Agent"])
async def agent_status(task_id: str) -> dict[str, Any]:
    """Poll execution status for a multi-step background agent task."""
    task = get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    return task.model_dump()


@router.get("/mcp/servers", tags=["F9 · MCP Integration"])
async def mcp_servers() -> list[dict[str, Any]]:
    """List configured Model Context Protocol (MCP) server endpoints."""
    return [
        {
            "name": s["name"],
            "transport": s.get("transport", "stdio"),
            "enabled": s.get("enabled", False),
            "description": s.get("description", ""),
        }
        for s in SERVER_REGISTRY
    ]


@router.get("/mcp/tools", tags=["F9 · MCP Integration"])
async def mcp_tools_list() -> list[dict[str, Any]]:
    """List dynamic tools discovered across active MCP servers."""
    try:
        return await list_mcp_tools(use_cache=False)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not list MCP tools: {exc}")


@router.post("/mcp/execute", tags=["F9 · MCP Integration"])
@rate_limit("30/minute")
async def mcp_execute(http_request: Request, request: McpExecuteRequest) -> dict[str, Any]:
    """Manually invoke an MCP tool with provided arguments."""
    try:
        result = await call_mcp_tool(request.tool_name, request.arguments)
        return {"tool_name": request.tool_name, "result": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
