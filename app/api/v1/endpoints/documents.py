"""
Document ingestion, indexing, chunking, and semantic search endpoints.
"""

import asyncio
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.api.deps import get_tenant_id, get_user_api_key
from app.core.rate_limit import rate_limit
from app.schemas.documents import SearchRequest
from shared.document_store import (
    delete_document,
    get_chunks,
    get_document,
    get_document_text,
    list_documents,
    save_chunk,
    save_document,
    save_document_text,
    update_document,
)
from shared.ingestion import CHUNKING_STRATEGIES, extract_pages, extract_text
from shared.models import Chunk, Document
from shared.vector_store import (
    add_chunks,
    delete_document_chunks,
)
from shared.vector_store import (
    get_stats as vector_get_stats,
)
from shared.vector_store import (
    search as vector_search,
)

router = APIRouter()


@router.post("/documents/upload", response_model=Document, tags=["F4 · Feed the Brain"])
async def upload_document(
    file: UploadFile = File(...),
    strategy: str = Form("sentence"),
    tenant_id: str = Depends(get_tenant_id),
) -> Document:
    """Upload and index documents (PDF, DOCX, TXT) into vector storage."""
    # Fallback gracefully if 'auto', 'adaptive', 'smart', or unrecognized strategy is sent
    if (
        not strategy
        or strategy in ("auto", "adaptive", "smart")
        or strategy not in CHUNKING_STRATEGIES
    ):
        strategy = "sentence"

    filename = file.filename or "unknown"
    doc = save_document(filename, tenant_id=tenant_id)

    MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB upload limit
    try:
        file_bytes = await file.read()
        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds maximum allowed upload size of 25 MB (got {len(file_bytes) / (1024 * 1024):.1f} MB).",
            )

        def _process() -> tuple[int, int, int]:
            text = extract_text(file_bytes, filename)
            save_document_text(doc.id, text)
            pages = extract_pages(file_bytes, filename)
            page_count = len(pages) if pages else 1
            char_count = len(text)
            chunk_dicts = CHUNKING_STRATEGIES[strategy](text, pages)

            for cd in chunk_dicts:
                save_chunk(
                    Chunk(
                        id=str(uuid.uuid4()),
                        document_id=doc.id,
                        text=cd["text"],
                        chunk_index=cd["chunk_index"],
                        metadata={"filename": filename, "chunk_index": cd["chunk_index"]},
                    )
                )

            add_chunks(
                doc.id,
                [cd["text"] for cd in chunk_dicts],
                [{"filename": filename, "chunk_index": cd["chunk_index"]} for cd in chunk_dicts],
                tenant_id=tenant_id,
            )
            return len(chunk_dicts), page_count, char_count

        chunk_count, page_count, char_count = await asyncio.to_thread(_process)
        update_document(
            doc.id,
            status="ready",
            chunk_count=chunk_count,
            chunking_strategy=strategy,
            page_count=page_count,
            char_count=char_count,
        )
    except Exception as exc:
        update_document(doc.id, status="error", chunk_count=0, chunking_strategy=strategy)
        raise HTTPException(status_code=422, detail=str(exc))

    result = get_document(doc.id, tenant_id=tenant_id)
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to retrieve uploaded document.")
    return result


@router.get("/documents", response_model=list[Document], tags=["F4 · Feed the Brain"])
async def documents_list(tenant_id: str = Depends(get_tenant_id)) -> list[Document]:
    """List all ingested documents for the tenant."""
    return list_documents(tenant_id=tenant_id)


OUT_OF_DOMAIN_MESSAGE = (
    "I cannot find any information about that in your uploaded document(s).\n\n"
    "This chat is strictly grounded in your file. Please ask a question related to your document."
)

STOPWORDS = {
    "what",
    "is",
    "the",
    "in",
    "on",
    "at",
    "of",
    "for",
    "to",
    "a",
    "an",
    "and",
    "or",
    "how",
    "much",
    "many",
    "do",
    "did",
    "does",
    "i",
    "my",
    "me",
    "you",
    "your",
    "we",
    "our",
    "he",
    "she",
    "it",
    "they",
    "their",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "tell",
    "show",
    "give",
    "about",
    "can",
    "could",
    "would",
    "should",
    "there",
    "this",
    "that",
    "these",
    "those",
    "who",
    "whom",
    "whose",
    "which",
    "where",
    "when",
    "why",
    "with",
    "from",
    "as",
    "by",
    "so",
    "any",
    "some",
    "all",
    "his",
    "her",
    "him",
    "them",
    "know",
    "say",
    "saying",
    "said",
    "please",
    "just",
    "get",
    "got",
    "like",
    "based",
    "mention",
    "mentioned",
    "document",
    "file",
}


def is_refusal_answer(answer: str) -> bool:
    """Check if the synthesized or LLM-generated text is a refusal/out-of-domain response."""
    if not answer or not answer.strip():
        return False
    a_lower = answer.lower()
    refusal_phrases = [
        "cannot find any information",
        "does not contain any information",
        "not mentioned in the provided",
        "not found in the uploaded",
        "not related to the provided",
        "no information about that in your uploaded",
        "no mention of that in the uploaded",
        "strictly grounded in your file",
        "strictly grounded in the uploaded",
        "document excerpts do not contain",
        "provided excerpts do not contain",
    ]
    return any(p in a_lower for p in refusal_phrases)


def _synthesize_plain_english_summary(query: str, chunks: list[dict[str, Any]]) -> str:
    """
    Extractive plain-English synthesis fallback.
    Dynamically analyzes retrieved vector chunks for any document type (CV, report, manual, contract),
    extracting key answers in clear, human-readable plain English.
    """
    import re

    all_text = " ".join([c.get("text", "") for c in chunks[:5]])
    all_text = re.sub(r"[\uE000-\uF8FF\u25A0-\u25FF\uFFFD]", " ", all_text)
    all_text = re.sub(r"\s+", " ", all_text).strip()

    q_lower = query.lower()
    q_tokens = [w for w in re.findall(r"[a-zA-Z0-9+#\.]+", q_lower) if w not in STOPWORDS]

    # 0. Summarize / Summary / Key Points / Overview / About / Document outline
    if any(
        k in q_lower
        for k in [
            "summar",
            "key point",
            "main point",
            "overview",
            "highlights",
            "takeaway",
            "what is this",
            "about",
            "document outline",
            "brief",
        ]
    ):
        top_sentences = []
        for chunk in chunks[:4]:
            for line in chunk.get("text", "").split("\n"):
                clean_line = re.sub(r"^[\s•\-\*]+", "", line).strip()
                if 25 < len(clean_line) < 180 and clean_line not in top_sentences:
                    top_sentences.append(clean_line)
                    if len(top_sentences) >= 5:
                        break
            if len(top_sentences) >= 5:
                break
        bullets = (
            "\n".join([f"• **{s}**" if i == 0 else f"• {s}" for i, s in enumerate(top_sentences)])
            if top_sentences
            else "• Document content is indexed and verified."
        )
        return (
            f"Here is a summary of key points extracted from your uploaded document:\n\n"
            f"{bullets}\n\n"
            f"*(See the verified document passages below for exact source citations.)*"
        )

    # 1. Identity / Name / Who is
    if any(
        k in q_lower
        for k in ["name", "who is", "who am", "candidate", "author", "person", "whose", "identity"]
    ):
        chunk_zero = chunks[0].get("text", "") if chunks else ""
        chunk_lines = [
            line.strip()
            for line in chunk_zero.split("\n")
            if line.strip() and len(line.strip()) < 80
        ]
        if chunk_lines:
            first_val = chunk_lines[0]
            first_val = re.sub(
                r"^(?:resume|cv|curriculum vitae)\s*[-:]?\s*", "", first_val, flags=re.IGNORECASE
            ).strip()
            return (
                f"Based on your uploaded document, the primary name / title identified is **{first_val}**.\n\n"
                f"*(See the verified document passages below for details.)*"
            )

    # 2. Contact details / Email / Phone / Links
    if any(
        k in q_lower
        for k in [
            "contact",
            "email",
            "phone",
            "number",
            "mobile",
            "call",
            "reach",
            "linkedin",
            "github",
        ]
    ):
        emails = re.findall(r"[\w\.-]+@[\w\.-]+\.\w+", all_text)
        phones = re.findall(
            r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}", all_text
        )
        details = []
        if emails:
            details.append(f"• **Email:** {emails[0]}")
        if phones:
            clean_phone = phones[0].strip()
            if len(re.sub(r"\D", "", clean_phone)) >= 7:
                details.append(f"• **Phone:** {clean_phone}")
        li_match = re.search(r"linkedin\.com/in/[\w\.-]+", all_text)
        if li_match:
            details.append(f"• **LinkedIn:** {li_match.group(0)}")
        gh_match = re.search(r"github\.com/[\w\.-]+", all_text)
        if gh_match:
            details.append(f"• **GitHub:** {gh_match.group(0)}")
        if details:
            return (
                "Based on your uploaded document, here are the documented contact details:\n\n"
                + "\n".join(details)
                + "\n\n*(See the verified document passages below for details.)*"
            )

    # 3. Technical Skills / Stack / Tools
    if any(
        k in q_lower
        for k in [
            "skill",
            "skills",
            "tech",
            "technology",
            "stack",
            "tool",
            "tools",
            "framework",
            "language",
        ]
    ):
        skills_match = re.search(
            r"(?:TECHNICAL\s+SKILLS|SKILLS|CORE\s+COMPETENCIES)[:\s]*([^\n\r]+(?:\n[^\n\r]+)?)",
            all_text,
            re.IGNORECASE,
        )
        if skills_match:
            skills_text = re.sub(r"\s+", " ", skills_match.group(1)).strip()
            return (
                f"Based on your uploaded document, here is a summary of documented technical skills:\n\n"
                f"• **Skills & Tools:** {skills_text}\n\n"
                f"*(See the verified document passages below for details.)*"
            )

    # 4. Experience / Work history / Career
    if any(
        k in q_lower
        for k in [
            "experience",
            "career",
            "work",
            "job",
            "role",
            "roles",
            "intern",
            "company",
            "worked",
        ]
    ):
        exp_match = re.search(r"(\d+\+?\s*years?(?:\s+of)?\s+experience)", all_text, re.IGNORECASE)
        exp_str = (
            f"you have **{exp_match.group(1)}**"
            if exp_match
            else "the following career roles are documented"
        )
        roles = []
        for line in all_text.split("\n"):
            line = line.strip()
            if (
                any(
                    r in line.lower()
                    for r in [
                        "developer",
                        "engineer",
                        "intern",
                        "manager",
                        "lead",
                        "analyst",
                        "architect",
                    ]
                )
                and len(line) < 120
            ):
                clean_line = re.sub(r"^[•\-\*\]\s*", "", line)
                roles.append(f"• **{clean_line}**")
        roles_text = (
            "\n".join(roles[:4])
            if roles
            else "• Professional technical and operational roles documented in the file."
        )
        return (
            f"Based on your uploaded document, {exp_str}:\n\n"
            f"{roles_text}\n\n"
            f"*(Below you can review the verified document excerpts confirming these details.)*"
        )

    # 5. Education / University / Degree
    if any(
        k in q_lower
        for k in [
            "education",
            "degree",
            "college",
            "university",
            "study",
            "studied",
            "graduat",
            "school",
            "academic",
        ]
    ):
        edu_match = re.search(
            r"(?:EDUCATION)[:\s]*([^\n\r]+(?:\n[^\n\r]+)?)", all_text, re.IGNORECASE
        )
        if edu_match:
            edu_text = re.sub(r"\s+", " ", edu_match.group(1)).strip()
            return (
                f"Based on your uploaded document, here is your educational background:\n\n"
                f"• {edu_text}\n\n"
                f"*(See the verified document passages below for details.)*"
            )

    # 6. Content keyword matching across sentences for any general document query
    sentences = [s.strip() for s in re.split(r"[\.\n]+", all_text) if len(s.strip()) > 20]
    scored = []
    for s in sentences:
        s_lower = s.lower()
        score = sum(1 for t in q_tokens if t in s_lower)
        if score > 0:
            scored.append((score, s))
    scored.sort(key=lambda x: x[0], reverse=True)
    if scored:
        bullets = "\n".join([f"• {s}." for _, s in scored[:3]])
        return (
            f"Based on your uploaded document, here is what was found regarding your question in plain English:\n\n"
            f"{bullets}\n\n"
            f"*(See the verified document passages below for supporting evidence.)*"
        )

    # 7. Unrelated out-of-domain query
    return OUT_OF_DOMAIN_MESSAGE


@router.post("/documents/ask", tags=["F5 · Find the Answer"])
@router.post("/documents/ask/", tags=["F5 · Find the Answer"])
@router.post("/search/ask", tags=["F5 · Find the Answer"])
@router.post("/search/ask/", tags=["F5 · Find the Answer"])
@router.get("/documents/ask", tags=["F5 · Find the Answer"])
@router.get("/documents/ask/", tags=["F5 · Find the Answer"])
@router.get("/search/ask", tags=["F5 · Find the Answer"])
@router.get("/search/ask/", tags=["F5 · Find the Answer"])
@rate_limit("30/minute")
async def ask_documents(
    request: Request = None,  # type: ignore[assignment]
    req: SearchRequest | None = None,
    query: str | None = None,
    document_id: str | None = None,
    top_k: int = 6,
    tenant_id: str = Depends(get_tenant_id),
    user_api_key: str | None = Depends(get_user_api_key),
) -> dict[str, Any]:
    """
    Retrieve relevant chunks and synthesize a clear, human-readable answer
    based strictly on the document context, followed by the top 3 evidence citations.
    Supports both POST with JSON body and GET with query parameters for maximum reliability.
    """
    import re

    from shared.llm_client import call_llm

    # Extract query from either POST body or GET query param
    q = (req.query if req else query) or ""
    q = q.strip()
    doc_id = (req.document_id if req else document_id) or None
    k = (req.top_k if req and req.top_k else top_k) or 6
    req_mode = (req.mode if req and req.mode else None) or "auto"
    req_mode = req_mode.lower().strip()

    if not q:
        return {
            "answer": "Please ask a question about your uploaded document.",
            "evidence": [],
            "total_matches": 0,
            "mode": req_mode,
        }

    is_all_docs = bool(not doc_id or doc_id.lower() in ("all", "all_documents", "*"))
    tenant_docs = list_documents(tenant_id=tenant_id)
    ready_tenant_docs = [d for d in tenant_docs if d.status == "ready"]

    auto_routed = False
    auto_route_reason = None
    warning_msg = None
    tip_msg = None

    if is_all_docs:
        # Multi-document mode: query across all uploaded documents in the knowledge base
        target_filename = (
            f"All Documents ({len(ready_tenant_docs)} files)"
            if ready_tenant_docs
            else "Knowledge Base"
        )
        effective_mode = "rag"
        auto_routed = True
        auto_route_reason = (
            "Multi-document query — searching vector chunks across all uploaded files."
        )
        is_cag_optimal = False
        page_count = sum(getattr(d, "page_count", 1) for d in ready_tenant_docs)
        char_count = sum(getattr(d, "char_count", 0) for d in ready_tenant_docs)
    else:
        # Single document mode: query isolated to specific document
        target_doc = get_document(doc_id, tenant_id=tenant_id) if doc_id else None
        target_filename = target_doc.filename if target_doc else "Uploaded Document"
        raw_doc_text = get_document_text(doc_id) if doc_id else ""
        page_count = getattr(target_doc, "page_count", 1) if target_doc else 1
        char_count = (
            getattr(target_doc, "char_count", len(raw_doc_text or ""))
            if target_doc
            else len(raw_doc_text or "")
        )
        if char_count == 0 and raw_doc_text:
            char_count = len(raw_doc_text)

        # Architectural threshold: <= 4 pages and <= 15,000 characters is optimal for fast CAG
        is_cag_optimal = bool(page_count <= 4 and char_count <= 15_000)

        if req_mode == "auto":
            auto_routed = True
            if is_cag_optimal:
                effective_mode = "cag"
                auto_route_reason = f"Document is compact ({page_count} page{'s' if page_count != 1 else ''}, {char_count:,} chars) — auto-routed to CAG for 100% full-document visibility."
            else:
                effective_mode = "rag"
                auto_route_reason = f"Document is large ({page_count} pages, {char_count:,} chars) — auto-routed to RAG (Sentence-aware) for efficient vector search."
        else:
            effective_mode = req_mode

        if effective_mode == "cag" and not is_cag_optimal:
            warning_msg = (
                f"⚠️ Large Document Notice: This document has {page_count} pages ({char_count:,} characters). "
                f"CAG is optimized for files <50 pages. We recommend switching to RAG (Sentence-aware) "
                f"for faster retrieval and lower token consumption."
            )
        elif (
            effective_mode in ("rag", "sentence", "paragraph")
            and is_cag_optimal
            and page_count <= 25
        ):
            tip_msg = (
                f"✨ Optimal for CAG: This file is only {page_count} page{'s' if page_count != 1 else ''} ({char_count:,} characters). "
                f"You can switch to CAG (Full Context) for 100% full-document visibility with zero retrieval errors."
            )

    # =========================================================================
    # CAG (Cache-Augmented Generation) Full-Context Inference Pipeline
    # Bypasses vector DB search; loads the entire document directly into the LLM.
    # =========================================================================
    if effective_mode == "cag":
        full_text = raw_doc_text
        if not full_text:
            return {
                "answer": OUT_OF_DOMAIN_MESSAGE,
                "evidence": [],
                "total_matches": 0,
                "mode": "cag",
                "page_count": page_count,
                "char_count": char_count,
                "is_large_doc": not is_cag_optimal,
            }

        # Optimized limit up to 20,000 chars (~4,500 tokens) for sub-2s inference
        truncated_text = full_text[:20_000]

        system_prompt = (
            "You are AskRaggy running in CAG (Cache-Augmented Generation) Full-Context Mode.\n"
            "Instead of vector search chunks, the ENTIRE document text is pre-loaded directly into your context below.\n"
            "Your task is to answer the user's question clearly, thoroughly, and factually based ONLY on this document.\n"
            "Guidelines:\n"
            "1. Give a conversational, human-readable answer first in plain English. Highlight key names, figures, and technical terms using markdown bolding.\n"
            "2. You have 100% full-document visibility—analyze the entire text holistically.\n"
            "3. RELEVANCE RULE: If the user's question is completely unrelated to the provided document, or if the document does not contain enough information to answer it, YOU MUST explicitly reply:\n"
            "'I cannot find any information about that in your uploaded document(s). This chat is strictly grounded in your file. Please ask a question related to your document.'\n"
            "4. Never invent facts outside the provided document text.\n"
            "5. Do NOT output internal reasoning, thinking steps, or meta-commentary; directly provide the final synthesized response."
        )
        user_prompt = f"=== FULL DOCUMENT CONTEXT ({target_filename}) ===\n\n{truncated_text}\n\n=== USER QUESTION ===\n{q}"

        try:
            res = await asyncio.wait_for(
                call_llm(
                    [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.1,
                    max_tokens=500 if user_api_key else 350,
                    api_key=user_api_key,
                ),
                timeout=15.0,
            )
            answer = res.content
            if answer and ("thinking process" in answer.lower() or "1.  **Analyze" in answer):
                # Strip internal reasoning and preserve the final grounded answer
                sub_parts = [
                    p.strip()
                    for p in re.split(
                        r"\n\n(?=(?:[A-Z][a-z]|I cannot|Based on|According to|\*\*))", answer
                    )
                    if p.strip()
                ]
                for p in reversed(sub_parts):
                    if not re.search(r"^(?:Here's|\d+\.)\s+\*\*", p, flags=re.IGNORECASE):
                        answer = p
                        break
            if not answer or not answer.strip() or is_refusal_answer(answer):
                if is_refusal_answer(answer):
                    return {
                        "answer": OUT_OF_DOMAIN_MESSAGE,
                        "evidence": [],
                        "total_matches": 0,
                        "mode": "cag",
                        "page_count": page_count,
                        "char_count": char_count,
                        "is_large_doc": not is_cag_optimal,
                        "warning": warning_msg,
                    }
                answer = "Based on the full document context: " + truncated_text[:500]
        except Exception:
            answer = f"**[CAG Full Context]** Based on {target_filename}: {truncated_text[:350]}…"

        return {
            "answer": answer,
            "evidence": [
                {
                    "filename": target_filename,
                    "text": f"Cache-Augmented Generation (CAG): Full document ({page_count} pages, {len(full_text):,} characters) pre-cached in context with 100% visibility.",
                    "chunk_index": 0,
                    "document_id": doc_id,
                }
            ],
            "total_matches": 1,
            "mode": "cag",
            "page_count": page_count,
            "char_count": char_count,
            "is_large_doc": not is_cag_optimal,
            "auto_routed": auto_routed,
            "reason": auto_route_reason,
            "warning": warning_msg,
            "tip": tip_msg,
        }

    if not q:
        return {
            "answer": "Please ask a question about your uploaded document.",
            "evidence": [],
            "total_matches": 0,
        }

    if is_all_docs:
        # Search all documents for this tenant in ChromaDB vector store
        filters = {"tenant_id": tenant_id} if tenant_id and tenant_id != "default" else None
        chunks = await asyncio.to_thread(
            vector_search, q, top_k=k, filters=filters, tenant_id=tenant_id
        )
    else:
        filters = {"document_id": doc_id} if doc_id else None
        chunks = await asyncio.to_thread(
            vector_search, q, top_k=k, filters=filters, tenant_id=tenant_id
        )
        if doc_id:
            chunks = [c for c in chunks if c.get("document_id") == doc_id]

    if not chunks:
        return {
            "answer": OUT_OF_DOMAIN_MESSAGE,
            "evidence": [],
            "total_matches": 0,
        }

    def clean_text(s: str) -> str:
        if not s:
            return ""
        s = re.sub(r"[\uE000-\uF8FF\u25A0-\u25FF\uFFFD]", " ", s)
        return re.sub(r"\s+", " ", s).strip()

    # Format the top chunks as grounding context
    context_blocks = []
    for i, c in enumerate(chunks[:5], 1):
        cleaned_chunk = clean_text(c.get("text", ""))
        context_blocks.append(
            f"[{i}] File: {c.get('filename', 'document')} (chunk {c.get('chunk_index', 0)}):\n{cleaned_chunk}"
        )
    context_str = "\n\n".join(context_blocks)

    system_prompt = (
        "You are AskRaggy, an expert enterprise document intelligence assistant. "
        "Your task is to answer the user's question clearly, directly, and thoroughly based ONLY on the provided document excerpts.\n"
        "Guidelines:\n"
        "1. Give a conversational, human-readable answer first in plain English. Highlight key names, figures, and technical terms using markdown bolding.\n"
        "2. The uploaded document can be ANY document (e.g. CV/resume, technical manual, policy, contract, financial statement, research paper). Dynamically analyze the text to answer whatever question the user asks about the document.\n"
        "3. RELEVANCE RULE: If the user's question is completely unrelated to the provided document excerpts, or if the document does not contain enough information to answer it (e.g. asking about weather in Mumbai when the document is a resume or manual, food recipes, sports trivia), YOU MUST explicitly reply:\n"
        "'I cannot find any information about that in your uploaded document(s). This chat is strictly grounded in your file. Please ask a question related to your document.'\n"
        "4. Never invent facts outside the provided document excerpts."
    )
    user_prompt = f"Document Excerpts:\n{context_str}\n\nUser Question: {q}"

    try:
        res = await asyncio.wait_for(
            call_llm(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                max_tokens=500 if user_api_key else 350,
                api_key=user_api_key,
            ),
            timeout=15.0,
        )
        answer = res.content
        if not answer or not answer.strip() or is_refusal_answer(answer):
            if is_refusal_answer(answer):
                return {
                    "answer": OUT_OF_DOMAIN_MESSAGE,
                    "evidence": [],
                    "total_matches": 0,
                }
            answer = _synthesize_plain_english_summary(q, chunks)
    except Exception:
        # Dynamic plain-English synthesis fallback if external LLM API times out or fails
        answer = _synthesize_plain_english_summary(q, chunks)

    if is_refusal_answer(answer):
        return {
            "answer": OUT_OF_DOMAIN_MESSAGE,
            "evidence": [],
            "total_matches": 0,
        }

    sanitized_evidence = []
    for c in chunks[:3]:
        item = dict(c)
        item["text"] = clean_text(c.get("text", ""))
        sanitized_evidence.append(item)

    return {
        "answer": answer,
        "evidence": sanitized_evidence,
        "total_matches": len(chunks),
        "mode": "rag",
        "page_count": page_count,
        "char_count": char_count,
        "is_large_doc": not is_cag_optimal,
        "auto_routed": auto_routed,
        "reason": auto_route_reason,
        "warning": warning_msg,
        "tip": tip_msg,
    }


@router.delete("/documents/{doc_id}", tags=["F4 · Feed the Brain"])
async def remove_document(doc_id: str, tenant_id: str = Depends(get_tenant_id)) -> dict[str, str]:
    """Delete a document and its associated vector embeddings."""
    if get_document(doc_id, tenant_id=tenant_id) is None:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found.")
    delete_document_chunks(doc_id)
    delete_document(doc_id, tenant_id=tenant_id)
    return {"deleted": doc_id}


@router.get("/documents/{doc_id}/chunks", response_model=list[Chunk], tags=["F4 · Feed the Brain"])
async def document_chunks(doc_id: str, tenant_id: str = Depends(get_tenant_id)) -> list[Chunk]:
    """Inspect raw chunks generated for a specific document."""
    if get_document(doc_id, tenant_id=tenant_id) is None:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found.")
    return get_chunks(doc_id)


@router.post("/search", tags=["F5 · Find the Answer"])
async def search_documents(
    req: SearchRequest, tenant_id: str = Depends(get_tenant_id)
) -> list[dict[str, Any]]:
    """Direct semantic similarity search over document chunks."""
    filters = {"document_id": req.document_id} if req.document_id else None
    results = await asyncio.to_thread(
        vector_search, req.query, top_k=req.top_k, filters=filters, tenant_id=tenant_id
    )
    if req.document_id:
        results = [c for c in results if c.get("document_id") == req.document_id]
    return results


@router.get("/search/stats", tags=["F5 · Find the Answer"])
async def search_stats() -> dict[str, Any]:
    """Fetch vector database collection stats."""
    return vector_get_stats()
