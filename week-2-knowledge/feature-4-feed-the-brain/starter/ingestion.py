"""
Feature 4 starter: text extraction and chunking — YOUR IMPLEMENTATION GOES HERE.

The complete version lives in shared/ingestion.py (read it for reference).

ARCHITECTURE CONTEXT:
Four approaches exist for giving an LLM access to external documents.
This module builds the RAG path. The others are described here for context:

  RAG (what we're building): chunk → embed → vector DB → retrieve at query time.
      Scales to hundreds of documents. Requires retrieval to work correctly.
      Core limitation: "vibe retrieval" — similarity ≠ relevance.

  CAG (Cache-Augmented Generation): skip chunking — load ALL text into one
      big system prompt. No retrieval errors, but only practical for <50 pages.
      See the CAG PATTERN section at the bottom of this file.

  KAG (Knowledge-Augmented Generation): extract entities + relationships into
      a knowledge graph instead of a vector DB. Best for relational queries.
      Introduced in Feature 6.

  PageIndex (VectifyAI, github.com/VectifyAI/PageIndex, MIT licence):
      No chunking, no embeddings, no vector DB. Builds a hierarchical tree index
      (like a smart TOC) and uses LLM reasoning to navigate it. Achieved 98.7%
      on FinanceBench vs significantly lower for vector RAG. Best for long
      professional documents (financial reports, legal filings, technical manuals).
      See the PAGEINDEX NOTE section at the bottom of this file.

YOUR TASKS:
  Step 1: implement extract_text()   — three file-type branches (the critical one)
  Step 2: implement chunk_text()     — sentence accumulation + overlap (the critical one)
  Step 3 (read, don't write): study chunk_by_paragraph() and chunk_by_page()
          to understand how the other strategies differ

Everything else (chunk_by_paragraph reference, chunk_by_page reference,
CHUNKING_STRATEGIES dict, CAG pattern) is provided complete.
"""
import io
import re
from pathlib import Path
from typing import Callable
from pypdf import PdfReader
from docx import Document

def extract_text(file_bytes: bytes, filename: str) -> str:

    ext = Path(filename).suffix.lower()

    if ext == ".txt":
       return file_bytes.decode("utf-8", errors="replace")

    if ext == ".pdf":
        reader = PdfReader(io.BytesIO(file_bytes))
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    if ext == ".docx":
        doc = Document(io.BytesIO(file_bytes))
        return "\n".join(para.text for para in doc.paragraphs if para.text.strip())

    raise ValueError(
       f"Unsupported file type: '{ext}'. "
        "Supported formats: .txt, .pdf, .docx. "
        "Convert your file to one of these formats and re-upload."
    )


def extract_pages(file_bytes: bytes, filename: str) -> list[dict]:
    """
    Extract text per page, returning a list of {"page_number": int, "text": str} dicts.

    This function is provided complete — it builds on extract_text() and is
    used by chunk_by_page(). Read it to understand the page structure.

    For .pdf: one dict per page (page_number is 1-based).
    For .txt and .docx: single dict with page_number=1 and full text.
    """
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        reader = PdfReader(io.BytesIO(file_bytes))
        return [
            {"page_number": i + 1, "text": page.extract_text() or ""}
            for i, page in enumerate(reader.pages)
        ]

    return [{"page_number": 1, "text": extract_text(file_bytes, filename)}]


# =============================================================================
# Chunking strategies
# =============================================================================

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    sentences = [s.strip() for s in sentences if s.strip()]

    if not sentences:
        return []

    chunks: list[str] = []
    current: list[str] = []   
    current_len = 0           

    for sentence in sentences:
        slen = len(sentence)


        if current and current_len + slen > chunk_size:
            chunks.append(" ".join(current))
            tail: list[str] = []
            tail_len = 0
            for s in reversed(current):
                if tail_len + len(s) + 1 > overlap:
                    break
                tail.insert(0,s)
                tail_len += len(s) + 1
            current=tail
            current_len=tail_len


        current.append(sentence)
        current_len += slen + 1
    if current:
        chunks.append(" ".join(current))

    return chunks


def chunk_by_paragraph(text: str, max_chunk_size: int = 800) -> list[str]:
    """
    Strategy: Paragraph-based chunking (reference implementation — read, don't rewrite).

    Split on double newlines (paragraph breaks). If a paragraph exceeds
    max_chunk_size, fall back to sentence-aware splitting for that paragraph only.

    Best for: formal structured documents — policies, manuals, legal text.

    This is provided so you can compare it with chunk_text() above:
    - chunk_text() splits on SENTENCES, groups until size limit
    - chunk_by_paragraph() splits on PARAGRAPHS, respects natural breaks
    Same idea, different boundary signal.
    """
    paragraphs = [p.strip() for p in re.split(r"\n\n+", text) if p.strip()]
    chunks: list[str] = []

    for para in paragraphs:
        if len(para) <= max_chunk_size:
            chunks.append(para)
        else:
            chunks.extend(chunk_text(para, chunk_size=max_chunk_size))
    return chunks


def chunk_by_page(pages: list[dict], max_page_size: int = 2000) -> list[dict]:
    """
    Strategy: pageIndex — one chunk per page (reference implementation — read, don't rewrite).

    Each returned dict has "text", "page_number", and "chunk_index". If a page
    exceeds max_page_size, it is sub-chunked with chunk_text() while preserving
    the page_number.

    When to use: financial reports, legal filings, academic papers — anywhere
    "see page X" is a meaningful citation. The page_number in metadata lets
    the assistant tell the user exactly which page an answer came from.

    Study this implementation — it shows how metadata flows from extraction
    through chunking into the stored Chunk objects and eventually into the UI.
    """
    result: list[dict] = []
    chunk_index = 0

    for page in pages:
        text = page["text"].strip()
        page_num = page["page_number"]

        if not text:
            continue

        if len(text) <= max_page_size:
            result.append({"text": text, "page_number": page_num, "chunk_index": chunk_index})
            chunk_index += 1
        else:
            for sub in chunk_text(text, chunk_size=max_page_size):
                result.append({"text": sub, "page_number": page_num, "chunk_index": chunk_index})
                chunk_index += 1

    return result


# =============================================================================
# CAG ALTERNATIVE (Cache-Augmented Generation) — documented pattern, not a TODO
#
# Instead of chunking, concatenate ALL document text and pass it as part of
# the system prompt. No vector DB, no retrieval step, no chunking decisions.
# The model reads everything and answers from full context.
#
# When to use:
#   • Total document set < ~50 pages (fits in a large context window)
#   • Documents change infrequently (cache must be recomputed on each change)
#   • Zero retrieval errors are required (you can't afford a missed chunk)
#   • You're using GPT-4o (128K tokens) or Gemini 1.5 Pro (1M tokens)
#
# Pattern (not wired up — read and understand, don't implement):
#
#   all_text = "\n\n---\n\n".join(
#       extract_text(file_bytes, filename) for file_bytes, filename in documents
#   )
#   system_prompt = (
#       "Here is all relevant knowledge:\n\n"
#       f"{all_text}\n\n"
#       "Answer the user's question using only the knowledge above."
#   )
#   result = await call_llm([
#       {"role": "system", "content": system_prompt},
#       {"role": "user",   "content": user_query},
#   ])
#
# Compare with RAG (what we're building):
#   CAG sends everything; retrieval errors = 0. Cost grows with doc count.
#   RAG retrieves 2-3 chunks; cost stays constant. Retrieval can miss things.
#   At < 20 pages, try CAG. At 50+ pages, RAG scales better.
# =============================================================================


# =============================================================================
# PAGEINDEX NOTE (Vectorless, Reasoning-based RAG) — reference, not implemented here.
#
# VectifyAI's PageIndex (github.com/VectifyAI/PageIndex, MIT) takes a different
# approach from ALL chunking strategies in this file:
#
#   1. Build a HIERARCHICAL TREE INDEX — like a smart table of contents.
#      Each tree node has: title, page range, LLM-generated section summary.
#   2. Retrieve by REASONING over the tree — an LLM agent navigates the tree
#      the way a human expert flips through a complex document.
#      No vector similarity. No embeddings. No chunk boundaries.
#
# "similarity ≠ relevance" — the key insight. Vector RAG returns semantically
# similar passages; PageIndex returns the passage an expert would find.
# Achieved 98.7% accuracy on FinanceBench vs significantly lower for vector RAG.
#
# When to use instead of this module:
#   • Long professional docs: financial reports, legal filings, technical manuals
#   • Multi-step reasoning needed to find the right section
#   • Vector RAG keeps returning wrong answers despite tuning
#
# Integration path for Feature 6 Smart Router:
#   pip install -r requirements.txt  # from github.com/VectifyAI/PageIndex
#   python run_pageindex.py --pdf_path your_doc.pdf  # builds tree JSON
#   In Feature 6: route professional-doc queries → PageIndex tree search
#                 route general queries          → vector RAG (Features 4-6)
#   Cloud service + MCP server at pageindex.ai
# =============================================================================


# =============================================================================
# Strategy registry — fully wired, no TODOs here.
# The upload endpoint uses this dict to select a strategy by name.
# Only "sentence" and "paragraph" are exposed in the UI — chunk_by_page()
# exists above as reference code but is not included here.
# =============================================================================

def _sentence_strategy(text: str, pages: list[dict]) -> list[dict]:
    return [
        {"text": c, "page_number": None, "chunk_index": i}
        for i, c in enumerate(chunk_text(text))
    ]


def _paragraph_strategy(text: str, pages: list[dict]) -> list[dict]:
    return [
        {"text": c, "page_number": None, "chunk_index": i}
        for i, c in enumerate(chunk_by_paragraph(text))
    ]


CHUNKING_STRATEGIES: dict[str, Callable[[str, list[dict]], list[dict]]] = {
    "sentence":  _sentence_strategy,
    "paragraph": _paragraph_strategy,
    # "page": chunk_by_page() above is the per-page alternative.
    # For a more powerful page-based approach see PAGEINDEX NOTE above.
}
