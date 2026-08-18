"""
Task planner for Feature 8: Multi-Step Agent — starter stub.

Your task: implement make_plan() and execute_plan() so the agent can
decompose a request into steps and execute each step in sequence.

THE PLAN-AND-EXECUTE PATTERN (what you're building):
  user request
      ↓
  make_plan() → ["Step 1: check availability", "Step 2: create ticket", ...]
      ↓
  execute_plan() — for each step:
      run_agent(step)  → {result, steps, tools_used}
      update task state (the UI polls to see progress)
      ↓
  LLM synthesis call  → final answer combining all step results
      ↓
  task.status = "done", task.result = final_answer

Why plan first?
  Single-turn agents (Feature 7) can lose track of the overall goal when
  executing a complex multi-step task. Planning first commits the agent to
  a structure before execution starts — it can't get distracted halfway.

Test messages:
  "Check availability for Friday at 3 PM, then create a support ticket
   with the result and look up our business hours"   → 3-step plan
  "What is the weather today?"                       → probably 1-step plan
"""
from cohere.finetuning.finetuning.types import status
import json

from shared.agent import run_agent
from shared.llm_client import call_llm
from shared.task_store import get_task, update_task

_PLANNER_SYSTEM_PROMPT = """You are a task planner. Your job is to break a user's request
into a sequence of 2 to 5 concrete, actionable steps that an AI agent can execute one by one.

Each step should:
- Be a standalone instruction that can be executed independently
- Be specific enough that an AI agent knows exactly what to do
- Build on the results of previous steps where needed

Respond ONLY with a JSON array of strings — no preamble, no markdown fences.
Example:
["Check availability for Friday at 3 PM", "Create a support ticket for the user", "Look up business hours"]
"""

_SYNTHESIZER_SYSTEM_PROMPT = """You are a helpful AI assistant. You have just completed
a multi-step task. Below are the results of each step.

Write a clear, concise final summary for the user that:
- Directly answers their original request
- Incorporates the key information from each step's result
- Is written in plain English (no JSON, no bullet points unless natural)
- Does not mention "steps" or the planning process — just give the answer
"""


async def make_plan(message: str) -> list[str]:
   messages  = [{
        "role":"system","content": _PLANNER_SYSTEM_PROMPT},
        { "role":"user","content":message },]
   response = await call_llm(
      messages=messages,
      temperature=0.3,
      max_tokens=500,
      response_format={"type":"json_object"}
  )
   raw = response.content or "[]"
   try:
      parsed = json.loads(raw)
      if isinstance(parsed,dict):
        for key in ("steps","plan","tasks"):
          if isinstance(parsed.get(key),list):
              parsed = parsed[key]
              break
      if isinstance(parsed,list) and parsed:
        return [str(s) for s in parsed[:5]]
   except (json.JSONDecodeError,TypeError):
      pass
   return [message]
     
  


async def execute_plan(task_id: str) -> None:
    task = get_task(task_id)
    if task is None:
      return
    update_task(task_id, status="executing",steps_completed= [])
    
    steps_completed = []
    try:
        plan = task.plan or []
        for i,step in enumerate(plan):
            step_result = await run_agent (
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
            update_task(task_id,steps_completed=list(steps_completed))
        
        step_summary = "\n".join(
            f"Step {r['step_index'] + 1} ({r['step']}): {r['result']}"
            for r in steps_completed
        )
        synth_messages = [
            {"role": "system", "content": _SYNTHESIZER_SYSTEM_PROMPT},
            {"role": "user", "content": f"Original request: {task.message}\n\nStep results:\n{step_summary}"},
        ]
        synth_response = await call_llm(synth_messages, temperature=0.7, max_tokens=800)
        final_result = synth_response.content or "Task completed."

        update_task(task_id, status="done", result=final_result)

    except Exception as exc:
        update_task(task_id, status="error", error=str(exc))


          
      

  
