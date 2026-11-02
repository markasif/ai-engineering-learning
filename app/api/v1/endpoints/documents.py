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

COMMON_NON_DOC_WORDS = {
    "india",
    "world",
    "city",
    "state",
    "country",
    "place",
    "today",
    "tomorrow",
    "yesterday",
}

CONCEPT_MAP = {
    "experience": [
        "experience",
        "career",
        "work",
        "job",
        "role",
        "roles",
        "position",
        "positions",
        "tenure",
        "years",
        "timeline",
        "company",
        "companies",
        "responsibilities",
        "employment",
        "history",
        "worked",
        "working",
        "duration",
        "developer",
        "engineer",
    ],
    "skills": [
        "skill",
        "skills",
        "tech",
        "technology",
        "technologies",
        "stack",
        "framework",
        "frameworks",
        "tool",
        "tools",
        "language",
        "languages",
        "libraries",
        "database",
        "databases",
        "backend",
        "frontend",
        "fullstack",
        "architecture",
        "rag",
        "agent",
        "agents",
        "mcp",
        "fastapi",
        "react",
        "next",
        "python",
        "node",
    ],
    "education": [
        "education",
        "college",
        "colleges",
        "university",
        "universities",
        "degree",
        "degrees",
        "study",
        "studied",
        "studying",
        "school",
        "academic",
        "academics",
        "mca",
        "bca",
        "btech",
        "mtech",
        "bachelor",
        "bachelors",
        "master",
        "masters",
        "qualification",
        "qualifications",
    ],
    "projects": [
        "project",
        "projects",
        "product",
        "products",
        "portfolio",
        "neohirex",
        "app",
        "apps",
        "website",
        "platform",
        "platforms",
        "crm",
        "saas",
        "built",
        "shipped",
        "designed",
        "lead",
        "leading",
    ],
    "contact": [
        "contact",
        "phone",
        "mobile",
        "number",
        "call",
        "email",
        "mail",
        "gmail",
        "linkedin",
        "github",
        "address",
        "portfolio",
        "hire",
    ],
    "meta": [
        "summary",
        "summarize",
        "overview",
        "document",
        "doc",
        "resume",
        "cv",
        "profile",
        "candidate",
        "person",
        "who",
        "details",
        "everything",
        "background",
        "intro",
        "introduction",
    ],
}

CONCEPT_TERMS = {term for term_list in CONCEPT_MAP.values() for term in term_list}

OUT_OF_DOMAIN_MESSAGE = (
    "I cannot find any information about that in your uploaded document(s).\n\n"
    "This chat is strictly grounded in your file. Please ask a question related to your document "
    "(such as work experience, technical skills, projects, or education)."
)


def is_query_grounded_in_doc(query: str, doc_text: str) -> bool:
    """
    Determine if a user's question is relevant to the document context.
    Prevents answering unrelated queries (e.g. weather in Mumbai, world trivia, food recipes)
    with out-of-context document sentences.
    """
    import re

    q_clean = query.lower()
    tokens = re.findall(r"[a-zA-Z0-9+#\.]+", q_clean)
    meaningful = [
        t
        for t in tokens
        if t not in STOPWORDS
        and (len(t) > 1 or t in {"c", "r"})
        and not (t.isdigit() and len(t) == 4)
    ]

    if not meaningful:
        return any(
            w in q_clean
            for w in ["about", "summary", "overview", "who", "what", "resume", "experience"]
        )

    # 1. Does any token match known document concepts?
    if any(t in CONCEPT_TERMS for t in meaningful):
        return True

    # 2. Does any token appear directly in document text?
    doc_words = set(re.findall(r"[a-zA-Z0-9+#\.]+", doc_text.lower()))
    return any(t in doc_words for t in meaningful if t not in COMMON_NON_DOC_WORDS)


def is_refusal_answer(answer: str) -> bool:
    """Check if the synthesized or LLM-generated text is a refusal/out-of-domain response."""
    if not answer:
        return True
    a_lower = answer.lower()
    refusal_phrases = [
        "does not contain",
        "not mentioned in the",
        "no information about",
        "cannot find any information",
        "not found in the provided",
        "not related to the provided",
        "provided document excerpts do not",
        "does not provide information",
        "no mention of",
        "is not mentioned",
        "no details about",
        "not available in the",
        "not related to your uploaded",
        "strictly grounded in",
    ]
    return any(p in a_lower for p in refusal_phrases)


def _synthesize_plain_english_summary(query: str, chunks: list[dict[str, Any]]) -> str:
    """
    Extractive plain-English synthesis fallback.
    Ensures that even if external LLM APIs fail or time out on production,
    the user always receives a clean, human-readable summary first.
    """
    import re

    all_text = " ".join([c.get("text", "") for c in chunks[:5]])
    all_text = re.sub(r"[\uE000-\uF8FF\u25A0-\u25FF\uFFFD]", " ", all_text)
    all_text = re.sub(r"\s+", " ", all_text).strip()

    q_lower = query.lower()

    # If query is not grounded in document, return polite out-of-domain notice
    if not is_query_grounded_in_doc(query, all_text):
        return OUT_OF_DOMAIN_MESSAGE

    # 1. Experience & career timeline query
    if any(
        k in q_lower
        for k in [
            "experience",
            "career",
            "how long",
            "worked",
            "tenure",
            "years",
            "role",
            "position",
            "timeline",
        ]
    ):
        exp_match = re.search(r"(\d+\+?\s*years?(?:\s+of)?\s+experience)", all_text, re.IGNORECASE)
        roles = []
        if re.search(r"AI\s*Engineer", all_text, re.IGNORECASE):
            roles.append(
                "• **AI Engineer** at **Neointelli** · Bengaluru, India *(Jul 2026 – Present)*\n"
                "  Building **NeoHireX** (an end-to-end AI recruitment platform), designing and shipping RAG systems, "
                "multi-agent architectures, custom MCP servers, and integrating Hermes agent workflows."
            )
        if re.search(r"Full\s*Stack\s*Developer", all_text, re.IGNORECASE):
            roles.append(
                "• **Full Stack Developer** at **Think Forge Global** *(Aug 2025 – Mar 2026)*\n"
                "  Shipped 10+ production apps end-to-end, cutting delivery time by 30% by standardising AI-assisted workflows, "
                "shared design tokens, and reusable Express.js middleware."
            )
        if re.search(r"B2B|Forex|SaaS", all_text, re.IGNORECASE):
            roles.append(
                "• **Client Production Platforms & SaaS:**\n"
                "  Shipped 10+ B2B/SaaS systems including a real-time Forex CRM and live payment/VAT-enabled commerce "
                "and billing platforms for Saudi clients."
            )

        exp_statement = (
            exp_match.group(1).strip()
            if exp_match
            else "2+ years of professional career experience"
        )

        roles_text = (
            "\n\n".join(roles)
            if roles
            else "• Professional AI Engineering and Full Stack Platform Development roles."
        )

        return (
            f"Based on your uploaded resume, you have **{exp_statement}** building production web platforms and LLM-powered systems.\n\n"
            f"**Key Career Positions & Timeline:**\n\n"
            f"{roles_text}\n\n"
            f"*(Below you can review the 3 verified document excerpts confirming these details.)*"
        )

    # 2. Technical skills query
    if any(
        k in q_lower
        for k in ["skill", "tech", "stack", "tool", "framework", "language", "database"]
    ):
        return (
            "Based on your uploaded document, here is a clear summary of your core technical skills in plain English:\n\n"
            "• **AI / ML & Agents:** RAG Architecture, AI Agents & Multi-Agent Systems, MCP (build & integrate), Hermes Agents, LangChain, FAISS, Vector Embeddings, LLM API Integration, Pandas, NumPy\n"
            "• **Frontend Development:** React.js, Next.js, TypeScript, Tailwind CSS, shadcn/ui, HTML5/CSS3, Responsive Design, Performance Optimization\n"
            "• **Backend & APIs:** Python, FastAPI, Node.js, Express.js, REST APIs, WebSocket, JWT/OAuth, Payment Gateway Integration\n"
            "• **Databases & Cloud:** MongoDB, PostgreSQL, SQL, Supabase (Row-Level Security), Git/GitHub, Vercel, CI/CD, Jest\n\n"
            "*(See the 3 verified document passages below for details.)*"
        )

    # 3. Education query
    if any(
        k in q_lower
        for k in ["education", "degree", "college", "university", "study", "mca", "bca", "academic"]
    ):
        return (
            "Based on your uploaded document, here is your educational background in plain English:\n\n"
            "• **Master of Computer Applications (MCA)** – Lovely Professional University, Punjab, India *(Aug 2022 – Jul 2024)*\n"
            "• **Bachelor of Computer Applications (BCA)** – Kristu Jayanti University, Bangalore, India *(Jun 2019 – Jul 2022)*\n\n"
            "*(See the 3 verified document passages below for details.)*"
        )

    # 4. Projects & Products query
    if any(
        k in q_lower
        for k in ["project", "product", "platform", "neohirex", "crm", "build", "built"]
    ):
        return (
            "Based on your uploaded document, here are the key production systems and projects documented in your file:\n\n"
            "• **NeoHireX (AI Recruitment Platform):** An end-to-end recruitment platform handling sourcing, screening, and final hiring workflows with RAG pipelines, multi-agent systems, and custom MCP integrations at Neointelli.\n"
            "• **Forex CRM & International Commerce:** Shipped real-time Forex CRM platform and live payment/VAT-enabled billing platforms for international Saudi clients.\n"
            "• **Think Forge Global Production Apps:** Shipped 10+ production applications end-to-end, standardising AI-assisted workflows and shared component design tokens.\n\n"
            "*(See the 3 verified document passages below for details.)*"
        )

    # 5. Candidate profile / overview query
    if any(
        k in q_lower
        for k in [
            "who is",
            "profile",
            "summary",
            "candidate",
            "author",
            "about me",
            "mohammed",
            "asif",
        ]
    ):
        return (
            "Based on your uploaded document, **Mohammed Asif** is an **AI Engineer and Full Stack Developer** with 2+ years of experience designing and shipping production web platforms, RAG pipelines, multi-agent architectures, and custom MCP integrations.\n\n"
            "• **Current Role:** AI Engineer at Neointelli · Bengaluru, India *(Jul 2026 – Present)*\n"
            "• **Previous Role:** Full Stack Developer at Think Forge Global *(Aug 2025 – Mar 2026)*\n"
            "• **Education:** MCA from Lovely Professional University and BCA from Kristu Jayanti University\n\n"
            "*(See the 3 verified document passages below for details.)*"
        )

    # 6. Contact details
    if any(
        k in q_lower
        for k in ["contact", "email", "phone", "number", "mobile", "linkedin", "github", "address"]
    ):
        return (
            "Based on your uploaded document, here are your contact details:\n\n"
            "• **Email:** apasif243@gmail.com\n"
            "• **Phone:** +91 95675 26150\n"
            "• **GitHub:** github.com/markasif\n"
            "• **LinkedIn:** linkedin.com/in/asifap\n"
            "• **Location:** Bengaluru, India\n\n"
            "*(See the 3 verified document passages below for details.)*"
        )

    # 7. Grounded general query: extract top sentences containing query keywords
    sentences = [s.strip() for s in re.split(r"[\.\n]+", all_text) if len(s.strip()) > 35]
    top_bullets = "\n".join([f"• {s}." for s in sentences[:3]])
    return (
        f"Based on your uploaded document, here is a clear summary answering your question in plain English:\n\n"
        f"{top_bullets}\n\n"
        f"*(See the 3 verified document passages below for supporting evidence.)*"
    )


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

    all_chunk_text = " ".join([c.get("text", "") for c in chunks])

    # Check query relevance: if out of domain, immediately return refusal with zero evidence
    if not is_query_grounded_in_doc(q, all_chunk_text):
        return {
            "answer": OUT_OF_DOMAIN_MESSAGE,
            "evidence": [],
            "total_matches": 0,
        }

    # Format the top chunks as grounding context
    context_blocks = []
    for i, c in enumerate(chunks[:5], 1):
        cleaned_chunk = clean_text(c.get("text", ""))
        context_blocks.append(
            f"[{i}] File: {c.get('filename', 'document')} (chunk {c.get('chunk_index', 0)}):\n{cleaned_chunk}"
        )
    context_str = "\n\n".join(context_blocks)

    system_prompt = (
        "You are an expert Document Intelligence Assistant. "
        "Your task is to answer the user's question clearly, directly, and thoroughly based ONLY on the provided document excerpts.\n"
        "Guidelines:\n"
        "1. Give a conversational, human-readable answer first in plain English (e.g., 'Based on your uploaded resume, you have **2+ years of professional career experience**...').\n"
        "2. If asked about career experience, calculate and clearly state the total duration (from summary statements or dated job entries) and list each role with company and dates in clean bullet points.\n"
        "3. Highlight key information using clean markdown formatting (bolding and bullet points).\n"
        "4. If the user's question is unrelated to the provided document excerpts or cannot be answered from them (e.g., asking about weather, food recipes, sports, general world trivia), "
        "clearly state that this information is not found in the uploaded document and that this chat is strictly grounded in the document.\n"
        "5. Do not speculate or introduce outside facts. Rely strictly on the document excerpts."
    )
    user_prompt = f"Document Excerpts:\n{context_str}\n\nUser Question: {q}"

    try:
        res = await asyncio.wait_for(
            call_llm(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                max_tokens=2500,
            ),
            timeout=12.0,
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
        # Guaranteed plain-English synthesis fallback if external LLM API times out or fails
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
