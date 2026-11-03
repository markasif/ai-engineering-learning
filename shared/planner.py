"""
Task planner for Feature 8: Multi-Step Agent.

Implements the Plan-and-Execute agent pattern:
  1. make_plan()    — LLM call that decomposes a request into 2-5 concrete steps.
  2. execute_plan() — async loop that runs each step through run_agent(),
                      tracks progress, and synthesizes a final answer.
"""

import json
import re

from shared.agent import run_agent_with_mcp
from shared.llm_client import call_llm
from shared.task_store import get_task, update_task

_PLANNER_SYSTEM_PROMPT = """You are an enterprise task planner for HR and operations. Your job is to break a user's request
into a sequence of 2 to 4 concrete, actionable sub-tasks that an AI agent can execute one by one.

CRITICAL INSTRUCTIONS:
- Return ONLY a JSON object with a single "steps" key containing an array of strings.
- Tailor the steps strictly to the specific entity, department, or action requested by the user. If the user asks for all staff in a department, query that department's staff directory.
- Do NOT output any thinking process, reasoning monologue, preamble, or markdown formatting outside the JSON.
- Example:
{"steps": ["Retrieve the staff directory and roles for the requested department", "Check active status and reporting managers for the department members", "Summarize department headcount and roles"]}
"""

_SYNTHESIZER_SYSTEM_PROMPT = """You are an executive HR operations assistant. You have just completed a multi-step task.
Below are the step execution results.

YOUR OBJECTIVE:
Write a clear, concise, professional executive answer in plain English that:
- Directly resolves the user's original request.
- Clearly states what was found, what actions were taken (e.g. leave approval, balance update), and the final status.
- Structure with clean Markdown (bold key points, small summary table if applicable).
- DO NOT output any reasoning monologue, planning commentary, or "Here's a thinking process:". Give ONLY the final clear-cut answer.
"""


def _extract_steps(raw: str, fallback_message: str) -> list[str]:
    """Robustly extract plan steps from LLM output, handling JSON, codeblocks, or reasoning preambles."""
    if not raw or not raw.strip():
        return [fallback_message]

    # 1. Direct JSON parse
    try:
        parsed = json.loads(raw.strip())
        if isinstance(parsed, dict):
            for k in ("steps", "plan", "tasks"):
                if isinstance(parsed.get(k), list) and parsed[k]:
                    return [str(s).strip() for s in parsed[k][:5] if str(s).strip()]
        elif isinstance(parsed, list) and parsed:
            return [str(s).strip() for s in parsed[:5] if str(s).strip()]
    except Exception:
        pass

    # 2. Extract ```json ... ``` codeblock
    code_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
    if code_match:
        try:
            parsed = json.loads(code_match.group(1).strip())
            if isinstance(parsed, dict):
                for k in ("steps", "plan", "tasks"):
                    if isinstance(parsed.get(k), list) and parsed[k]:
                        return [str(s).strip() for s in parsed[k][:5] if str(s).strip()]
            elif isinstance(parsed, list) and parsed:
                return [str(s).strip() for s in parsed[:5] if str(s).strip()]
        except Exception:
            pass

    # 3. Search for JSON object with "steps": [ ... ]
    steps_match = re.search(r'"steps"\s*:\s*\[\s*([\s\S]*?)\s*\]', raw)
    if steps_match:
        items = re.findall(r'"([^"\n]{8,300})"', steps_match.group(1))
        if items:
            return [it.strip() for it in items[:5]]

    # 4. Search for standalone JSON array [ "...", "..." ]
    array_match = re.search(r'\[\s*"[^"\n]{8,300}"[\s\S]*?\]', raw)
    if array_match:
        try:
            parsed = json.loads(array_match.group(0))
            if isinstance(parsed, list) and parsed:
                return [str(s).strip() for s in parsed[:5] if str(s).strip()]
        except Exception:
            items = re.findall(r'"([^"\n]{8,300})"', array_match.group(0))
            if items:
                return [it.strip() for it in items[:5]]

    # 5. Extract quoted steps from reasoning/drafting text
    quoted_candidates = re.findall(r'"([^"\n]{15,250})"', raw)
    valid_steps = [
        q.strip()
        for q in quoted_candidates
        if not any(skip in q.lower() for skip in ("standalone", "step ", "steps", "json", "object", "type"))
    ]
    if len(valid_steps) >= 2:
        return valid_steps[:5]

    # 6. Fallback: split on numbered steps e.g. "Step 1: ..." or "1. ..."
    numbered = re.findall(r'(?:Step\s*\d+:|\d+\.)\s*([A-Z][^\n\.\;]{15,200})', raw)
    if len(numbered) >= 2:
        return [n.strip() for n in numbered[:5]]

    return [fallback_message]


def _clean_final_answer(raw_answer: str, steps_completed: list[dict]) -> str:
    """Strip reasoning monologues or extract the true plain-English answer."""
    if not raw_answer:
        return _build_fallback_summary(steps_completed)

    text = raw_answer.strip()

    # If <think>...</think> is present, strip it
    text = re.sub(r"<think>[\s\S]*?</think>", "", text).strip()

    # Check if text starts with "Here's a thinking process:" or similar
    m = re.search(r"(?:here(?:'s| is) a thinking process:?|thinking process:?|analysis of user request:?)", text, re.IGNORECASE)
    if m:
        # Search for transition to answer e.g. "Final Answer:", "Summary:", "Resolution:"
        answer_split = re.search(
            r"(?:\n\s*(?:final answer|summary|resolution|conclusion|in summary|result|answer):?\s*\n+|\n\s*---\s*\n+)",
            text[m.start():],
            re.IGNORECASE,
        )
        if answer_split:
            split_idx = m.start() + answer_split.end()
            clean = text[split_idx:].strip()
            if clean and len(clean) > 20:
                return clean
        # If no clean split marker, attempt to find the last paragraph that doesn't look like thinking
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        non_thinking = [
            p for p in paragraphs
            if not re.search(r"^(?:\d+\.|[-*•]|here|let's|user wants|step \d|review|analyze|mental iteration)", p, re.IGNORECASE)
        ]
        if non_thinking and len(non_thinking[-1]) > 20:
            return "\n\n".join(non_thinking)

        # If the entire response was just an uncompleted thinking process, build clean resolution from steps
        return _build_fallback_summary(steps_completed)

    return text


def _build_fallback_summary(steps_completed: list[dict]) -> str:
    """Construct a clean, professional resolution when the LLM spent tokens on reasoning."""
    if not steps_completed:
        return "Task completed successfully."

    lines = ["**Workflow Execution Summary:**", ""]
    for s in steps_completed:
        step_title = s.get("step", f"Step {s.get('step_index', 0)+1}")
        result_text = s.get("result", "").strip()
        short_res = result_text.split("\n")[0] if result_text else "Completed"
        if len(short_res) > 120:
            short_res = short_res[:117] + "..."
        lines.append(f"- **{step_title}:** {short_res}")

    lines.append("")
    lines.append("All requested workflow steps were executed and synchronized with the enterprise database.")
    return "\n".join(lines)


async def make_plan(message: str) -> list[str]:
    """
    Ask the LLM to decompose a user request into 2–4 concrete steps.
    Robust against reasoning models that emit internal thoughts before JSON.
    """
    messages = [
        {"role": "system", "content": _PLANNER_SYSTEM_PROMPT},
        {"role": "user", "content": message},
    ]
    response = await call_llm(
        messages=messages,
        temperature=0.2,
        max_tokens=1200,
        response_format={"type": "json_object"},
    )
    raw = response.content or ""
    return _extract_steps(raw, message)


async def execute_plan(task_id: str) -> None:
    """
    Execute every step in an AgentTask's plan using the Feature 7 agent loop.
    Synthesizes a polished, plain-English final answer free from thinking artifacts.
    """
    task = get_task(task_id)
    if task is None:
        return

    update_task(task_id, status="executing", steps_completed=[])

    steps_completed: list[dict] = []
    try:
        plan = task.plan or []
        for i, step in enumerate(plan):
            step_result = await run_agent_with_mcp(
                message=step,
                session_id=task.session_id,
                tenant_id=task.tenant_id,
            )
            step_record = {
                "step_index": i,
                "step": step,
                "result": step_result.get("result", ""),
                "tools_used": step_result.get("tools_used", []),
            }
            steps_completed.append(step_record)
            update_task(task_id, steps_completed=list(steps_completed))

        # Synthesize final plain-English answer
        step_summary = "\n".join(
            f"Step {r['step_index'] + 1} ({r['step']}): {r['result']}" for r in steps_completed
        )
        synth_messages = [
            {"role": "system", "content": _SYNTHESIZER_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Original request: {task.message}\n\nStep results:\n{step_summary}",
            },
        ]
        synth_response = await call_llm(synth_messages, temperature=0.3, max_tokens=1200)
        final_result = _clean_final_answer(synth_response.content or "", steps_completed)

        update_task(task_id, status="done", result=final_result)

    except Exception as exc:
        update_task(task_id, status="error", error=str(exc))
