"""
Agent execution engine for Feature 7: First Agent.

This module implements the two-call tool-calling pattern:
  Call 1: Send user message + tools → LLM decides which tool(s) to call
  Call 2: Send tool results back → LLM synthesizes a natural-language response

THE AGENT LOOP (what this file implements):
  user message
      ↓
  LLM (with tool schemas) ──→ tool_calls: [{name, arguments}]
      ↓
  execute each tool via TOOLS_REGISTRY → results
      ↓
  LLM again (with results as context) ──→ final natural-language answer
      ↓
  return {result, steps, tools_used}

If the LLM doesn't call any tools (it can answer directly), we skip to the
final answer immediately — no second call needed.

WHAT THIS IS:
  TOOLS_REGISTRY is the static pre-registered registry pattern used by virtually
  all production agents today. Google ADK's Agent(tools=[...]) and LangChain's
  AgentExecutor both wrap exactly this pattern in a higher-level API.

WHAT COMES NEXT (Feature 8):
  Feature 8 adds a planning step before the tool calls — the agent first thinks
  about what steps are needed, then executes them in sequence. This file handles
  the single-turn case; Feature 8 adds the loop that repeats until the task is done.

PUBLIC API:
  run_agent(message, session_id, tenant_id) → dict
"""
import json
from typing import Any

from shared.llm_client import call_llm
from shared.session_store import add_message, get_session
from shared.tools import (
    CHECK_AVAILABILITY_SCHEMA,
    CREATE_TICKET_SCHEMA,
    LOOKUP_INFO_SCHEMA,
    check_availability,
    create_ticket,
    lookup_info,
)

# =============================================================================
# TOOLS_REGISTRY: maps tool name → (callable, OpenAI-format schema)
#
# When the LLM returns a tool_call with name="check_availability", the agent
# looks up the function here and calls it with the LLM-generated arguments.
#
# To add your own tools:
#   1. Define the function + schema in shared/tools.py
#   2. Import them here
#   3. Add an entry: "your_tool_name": (your_function, YOUR_TOOL_SCHEMA)
# =============================================================================

TOOLS_REGISTRY: dict[str, tuple[Any, dict]] = {
    "check_availability": (check_availability, CHECK_AVAILABILITY_SCHEMA),
    "create_ticket":      (create_ticket, CREATE_TICKET_SCHEMA),
    "lookup_info":        (lookup_info, LOOKUP_INFO_SCHEMA),
}

# Extract just the schemas for the LLM call (TOOLS_REGISTRY holds both fn + schema).
_TOOL_SCHEMAS = [schema for _, schema in TOOLS_REGISTRY.values()]

_AGENT_SYSTEM_PROMPT = """You are a helpful AI assistant for [YOUR_DOMAIN].
You have access to tools that can check availability, create support tickets,
and look up factual information. Use these tools whenever the user's request
would benefit from real data — don't guess at facts you could look up.

When you use a tool, wait for its result before responding. Synthesize the
tool results into a clear, helpful answer in plain English.
If a tool fails, acknowledge it and offer alternatives."""


async def run_agent(
    message: str,
    session_id: str,
    tenant_id: str = "default",
) -> dict:
    """
    Run the agent loop for one user message.

    Returns:
        {
          "result":     str   — the final natural-language answer,
          "steps":      list  — [{tool, args, result}] for each tool executed,
          "tools_used": list  — names of tools that were called (empty if none),
        }

    The two-call pattern:
      1. Call the LLM with the user message and tool schemas.
         If the LLM returns tool_calls: execute each tool, collect results.
         If the LLM returns content directly: return it (no second call needed).
      2. Send the tool results back to the LLM and get the final answer.
    """
    # --- Build initial message list ---
    session = get_session(session_id, tenant_id=tenant_id)
    history: list[dict] = []
    if session:
        recent = session.messages[-20:]  # last 20 messages for context
        for msg in recent:
            history.append({"role": msg.role, "content": msg.content})

    messages: list[dict] = [
        {"role": "system", "content": _AGENT_SYSTEM_PROMPT},
        *history,
        {"role": "user", "content": message},
    ]

    # =========================================================================
    # CALL 1: LLM + tools — let the model decide what to call
    # =========================================================================
    first_response = await call_llm(
        messages=messages,
        tools=_TOOL_SCHEMAS,
        temperature=0.3,  # lower temperature for tool selection
        max_tokens=1000,
    )

    steps: list[dict] = []
    tools_used: list[str] = []

    # =========================================================================
    # If no tool calls were made, return the direct response immediately.
    # =========================================================================
    if not first_response.tool_calls:
        answer = first_response.content or ""
        add_message(session_id, "user", message)
        add_message(session_id, "assistant", answer)
        return {"result": answer, "steps": [], "tools_used": []}

    # =========================================================================
    # EXECUTE TOOL CALLS
    # Each tool call: look up the function in TOOLS_REGISTRY, call it with the
    # LLM-generated arguments, collect the result.
    # =========================================================================

    # We need to append the assistant's tool-call message to maintain conversation
    # context. Build it in OpenAI format (the second call expects this structure).
    tool_call_message: dict = {
        "role": "assistant",
        "content": first_response.content,  # may be None
        "tool_calls": [
            {
                "id": tc["id"],
                "type": "function",
                "function": {
                    "name": tc["name"],
                    # arguments must be a JSON string in the OpenAI format
                    "arguments": json.dumps(tc["arguments"]),
                },
            }
            for tc in first_response.tool_calls
        ],
    }
    messages.append(tool_call_message)

    # Execute each tool and append results as "tool" role messages.
    for tc in first_response.tool_calls:
        tool_name = tc["name"]
        tool_args = tc["arguments"]
        tool_call_id = tc["id"]

        fn, _ = TOOLS_REGISTRY.get(tool_name, (None, None))
        if fn is None:
            tool_result = {"error": f"Unknown tool '{tool_name}'. Available: {list(TOOLS_REGISTRY)}"}
        else:
            try:
                tool_result = fn(**tool_args)
            except Exception as exc:
                tool_result = {"error": str(exc), "tool": tool_name}

        steps.append({"tool": tool_name, "args": tool_args, "result": tool_result})
        tools_used.append(tool_name)

        # Append the tool result as a "tool" role message for the second LLM call.
        messages.append({
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": json.dumps(tool_result),
        })

    # =========================================================================
    # CALL 2: LLM again with tool results — synthesize the final answer
    # =========================================================================
    second_response = await call_llm(
        messages=messages,
        temperature=0.7,
        max_tokens=1000,
        # No tools on the second call — we want natural-language output, not
        # another round of tool calls.
    )

    answer = second_response.content or ""

    # Persist both turns to session history.
    add_message(session_id, "user", message)
    add_message(session_id, "assistant", answer)

    return {
        "result": answer,
        "steps": steps,
        "tools_used": list(dict.fromkeys(tools_used)),  # deduplicate, preserve order
    }
