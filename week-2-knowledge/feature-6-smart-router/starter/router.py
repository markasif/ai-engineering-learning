"""
Smart Router starter — Feature 6, Part A.

Your task: implement classify_query() so the Smart Router can decide
whether and how to retrieve before generating a response.

The function signature and return shape are fixed — only fill in the
marked TODO sections. The solution is in solution/main.py and shared/router.py.

WHAT YOU'RE BUILDING:
  A pre-retrieval intelligence step: instead of retrieving for EVERY query,
  the router first asks the LLM "does this query even need documents?"
  This is the "Anti-RAG" pattern — RAG with a gating step.

  Example classifications:
    "What is 2 + 2?"         → needs_retrieval=False, confidence=0.95
    "What is your refund policy?" → needs_retrieval=True, confidence=0.85
    "Tell me about your contracts" → needs_retrieval=True, query_type="professional_document"
    "Hmm, I'm not sure"     → needs_retrieval=True, confidence=0.45 (hybrid)

TWO-CALL ARCHITECTURE:
  Call 1: classify_query() — cheap, temperature=0.1, asks only "should I retrieve?"
  Call 2: smart_chat() in main.py — the actual response generation with or without context

  This separation keeps each LLM call focused. The classifier is a specialist;
  the responder is a generalist with (optionally) injected context.
"""
import json

from shared.llm_client import call_llm

# ============================================================
# TODO STEP 1: Write the classifier system prompt
#
# The LLM must return a JSON object with these exact fields:
#   {
#     "needs_retrieval": bool,
#     "confidence": float (0.0–1.0),
#     "reasoning": str (one sentence),
#     "query_type": "general" | "domain" | "professional_document" | "ambiguous"
#   }
#
# Query type definitions to include in your prompt:
#   "general"               — common knowledge, greetings, math, basic facts.
#                             No domain documents needed.
#   "domain"                — questions about the organization's products,
#                             services, policies, or procedures.
#   "professional_document" — requires precise navigation of structured
#                             professional documents (financial filings,
#                             legal contracts, regulatory docs).
#                             Answer requires finding a SPECIFIC SECTION,
#                             not just a semantically similar passage.
#   "ambiguous"             — genuinely unclear whether documents help.
#
# Confidence guide to include:
#   0.9–1.0  very clear (obvious greeting vs obvious domain question)
#   0.7–0.8  reasonably clear, some uncertainty
#   0.4–0.6  genuinely ambiguous — could go either way
#   below 0.4  you really can't tell
#
# Important: instruct the LLM to respond ONLY with the JSON object —
# no markdown, no extra text.
# ============================================================

_CLASSIFIER_SYSTEM_PROMPT ="""You are a query classifier for a document Q&A assistant.

Analyze the user's query and respond ONLY with a JSON object (no markdown, no extra text):
{
  "needs_retrieval": <true if this question likely needs uploaded domain documents, false if answerable from general knowledge>,
  "confidence": <0.0-1.0 — how certain you are about this classification>,
  "reasoning": "<one sentence explaining your decision>",
  "query_type": "<one of: general | domain | professional_document | ambiguous>"
}

Query type definitions:
- "general": common knowledge — greetings, math, basic facts, general how-to questions.
  These don't need domain documents (e.g. "What is the capital of France?", "Hello").
- "domain": questions about the organization's products, services, policies, or procedures
  that would benefit from uploaded documents (e.g. "What is your return policy?").
- "professional_document": questions requiring precise navigation of structured professional
  documents — financial filings, legal contracts, regulatory documents, technical specs.
  The answer requires finding a specific section, not just a semantically similar passage.
  (e.g. "What was net revenue in Q3?", "What are the termination clauses?").
- "ambiguous": genuinely unclear whether domain documents would help.

Confidence guide:
- 0.9–1.0: very clear (obvious greeting vs obvious domain question)
- 0.7–0.8: reasonably clear but some uncertainty
- 0.4–0.6: genuinely ambiguous — could go either way
- Below 0.4: you really can't tell

Be strict with "general": only use it when you're confident retrieval won't help."""


async def classify_query(query: str) -> dict:
    """
    Classify whether a query needs document retrieval and how to retrieve.

    Returns:
      needs_retrieval: bool  — True → retrieve; False → answer directly
      confidence:      float — classifier's certainty (0.0–1.0)
      reasoning:       str   — one-sentence explanation (for debugging)
      query_type:      str   — "general"|"domain"|"professional_document"|"ambiguous"

    Fallback: if classification fails, returns needs_retrieval=True, confidence=0.5
    (hybrid path) — better to retrieve unnecessarily than to miss needed context.
    """
    result = await call_llm(
          messages = [
              {"role":"system","content":_CLASSIFIER_SYSTEM_PROMPT},
              {"role":"user","content":query}
          ]
        )
    try:
      data = json.loads(result.content or "{}")
      return {
            "needs_retrieval": bool(data.get("needs_retrieval", True)),
            "confidence": min(1.0, max(0.0, float(data.get("confidence", 0.5)))),
            "reasoning": str(data.get("reasoning", "")),
            "query_type": data.get("query_type", "ambiguous"),
        }
    except Exception:
        return {
            "needs_retrieval": True,
            "confidence": 0.5,
            "reasoning": "Classification failed — defaulting to retrieval (safe fallback).",
            "query_type": "ambiguous",
        }


   