"""
Document ingestion, indexing, chunking, and semantic search endpoints.
"""

import asyncio
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.deps import get_tenant_id
from app.schemas.documents import SearchRequest
from shared.document_store import (
    delete_document,
    get_chunks,
    get_document,
    list_documents,
    save_chunk,
    save_document,
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
    if strategy not in CHUNKING_STRATEGIES:
        raise HTTPException(status_code=400, detail=f"Unknown strategy '{strategy}'.")

    filename = file.filename or "unknown"
    doc = save_document(filename, tenant_id=tenant_id)

    try:
        file_bytes = await file.read()

        def _process() -> int:
            text = extract_text(file_bytes, filename)
            pages = extract_pages(file_bytes, filename)
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
            return len(chunk_dicts)

        chunk_count = await asyncio.to_thread(_process)
        update_document(doc.id, status="ready", chunk_count=chunk_count, chunking_strategy=strategy)
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
async def ask_documents(
    req: SearchRequest | None = None,
    query: str | None = None,
    document_id: str | None = None,
    top_k: int = 6,
    tenant_id: str = Depends(get_tenant_id),
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

    if not q:
        return {
            "answer": "Please ask a question about your uploaded document.",
            "evidence": [],
            "total_matches": 0,
        }

    filters = {"document_id": doc_id} if doc_id else None
    chunks = vector_search(q, top_k=k, filters=filters, tenant_id=tenant_id)

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
                max_tokens=800,
            ),
            timeout=18.0,
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
    return vector_search(req.query, top_k=req.top_k, filters=filters, tenant_id=tenant_id)


@router.get("/search/stats", tags=["F5 · Find the Answer"])
async def search_stats() -> dict[str, Any]:
    """Fetch vector database collection stats."""
    return vector_get_stats()
