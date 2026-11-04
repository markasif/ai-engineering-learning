"""
Unit tests for CAG (Cache-Augmented Generation) mode and full-context retrieval.
"""

import pytest
from unittest.mock import AsyncMock, patch

from shared.document_store import (
    delete_document,
    get_document_text,
    save_chunk,
    save_document,
    save_document_text,
    update_document,
)
from shared.ingestion import CHUNKING_STRATEGIES
from shared.models import Chunk, Document
from app.schemas.documents import SearchRequest
from app.api.v1.endpoints.documents import ask_documents


def test_document_store_cag_text():
    """Verify raw document text storage and retrieval for CAG mode."""
    doc = save_document("handbook.pdf", tenant_id="tenant-test")
    doc_id = doc.id
    raw_content = "This is the full company handbook. Section 1: PTO. Section 2: Code of Conduct."

    save_document_text(doc_id, raw_content)
    retrieved = get_document_text(doc_id)
    assert retrieved == raw_content

    # Clean up
    delete_document(doc_id, tenant_id="tenant-test")
    assert get_document_text(doc_id) is None


def test_document_store_cag_fallback_to_chunks():
    """Verify get_document_text falls back to joined chunks if raw text was not explicitly cached."""
    doc = save_document("notes.txt", tenant_id="tenant-test")
    doc_id = doc.id

    save_chunk(Chunk(id="c1", document_id=doc_id, text="Paragraph 1 text.", chunk_index=0))
    save_chunk(Chunk(id="c2", document_id=doc_id, text="Paragraph 2 text.", chunk_index=1))

    retrieved = get_document_text(doc_id)
    assert "Paragraph 1 text." in retrieved
    assert "Paragraph 2 text." in retrieved

    delete_document(doc_id, tenant_id="tenant-test")


def test_cag_chunking_strategy():
    """Verify CAG strategy returns a single unified chunk preserving the full document."""
    full_text = "Line 1\nLine 2\nLine 3"
    strategy_fn = CHUNKING_STRATEGIES["cag"]
    chunks = strategy_fn(full_text, [])
    assert len(chunks) == 1
    assert chunks[0]["text"] == full_text
    assert chunks[0]["chunk_index"] == 0


@pytest.mark.asyncio
async def test_ask_documents_cag_mode():
    """Verify ask_documents endpoint executes in CAG mode with full document context."""
    doc = save_document("policy.pdf", tenant_id="default")
    doc_id = doc.id
    raw_text = "NeoIntelli allows 25 days of annual leave. Approval is required from department managers."
    save_document_text(doc_id, raw_text)
    update_document(doc_id, status="ready", chunk_count=1, page_count=3, char_count=len(raw_text))

    mock_llm_response = AsyncMock()
    mock_llm_response.content = "According to the full document, employees receive **25 days of annual leave**."

    with patch("shared.llm_client.call_llm", new=AsyncMock(return_value=mock_llm_response)):
        req = SearchRequest(
            query="How many days of annual leave?",
            document_id=doc_id,
            mode="cag",
        )
        res = await ask_documents(req=req, tenant_id="default")

        assert res["mode"] == "cag"
        assert "25 days of annual leave" in res["answer"]
        assert len(res["evidence"]) == 1
        assert "Cache-Augmented Generation" in res["evidence"][0]["text"]
        assert res["is_large_doc"] is False

    delete_document(doc_id, tenant_id="default")


@pytest.mark.asyncio
async def test_large_document_cag_warning():
    """Verify querying a large document (>50 pages) in CAG mode generates an advisory warning recommending RAG."""
    doc = save_document("giant_manual.pdf", tenant_id="default")
    doc_id = doc.id
    raw_text = "Manual content " * 1000
    save_document_text(doc_id, raw_text)
    update_document(doc_id, status="ready", chunk_count=100, page_count=120, char_count=len(raw_text))

    mock_llm_response = AsyncMock()
    mock_llm_response.content = "Answer based on manual."

    with patch("shared.llm_client.call_llm", new=AsyncMock(return_value=mock_llm_response)):
        req = SearchRequest(
            query="What is section 5?",
            document_id=doc_id,
            mode="cag",
        )
        res = await ask_documents(req=req, tenant_id="default")

        assert res["mode"] == "cag"
        assert res["is_large_doc"] is True
        assert res["warning"] is not None
        assert "Large Document Notice" in res["warning"]
        assert "RAG (Sentence-aware)" in res["warning"]

    delete_document(doc_id, tenant_id="default")


@pytest.mark.asyncio
async def test_auto_adaptive_routing_small_vs_large():
    """Verify Auto mode intelligently routes small documents to CAG and large documents to RAG."""
    # 1. Small document -> CAG
    doc_small = save_document("brief.pdf", tenant_id="default")
    raw_small = "Brief policy on remote work."
    save_document_text(doc_small.id, raw_small)
    update_document(doc_small.id, status="ready", chunk_count=1, page_count=2, char_count=len(raw_small))

    mock_llm_response = AsyncMock()
    mock_llm_response.content = "Remote work allowed 3 days."

    with patch("shared.llm_client.call_llm", new=AsyncMock(return_value=mock_llm_response)):
        req = SearchRequest(query="Remote work policy?", document_id=doc_small.id, mode="auto")
        res_small = await ask_documents(req=req, tenant_id="default")
        assert res_small["mode"] == "cag"
        assert res_small["auto_routed"] is True
        assert "auto-routed to CAG" in res_small["reason"]

    delete_document(doc_small.id, tenant_id="default")

    # 2. Large document -> RAG
    doc_large = save_document("encyclopedia.pdf", tenant_id="default")
    raw_large = "Encyclopedia content."
    save_document_text(doc_large.id, raw_large)
    update_document(doc_large.id, status="ready", chunk_count=150, page_count=85, char_count=150_000)

    # Mock vector_search
    with patch("app.api.v1.endpoints.documents.vector_search", return_value=[{"text": "Sample excerpt", "document_id": doc_large.id}]):
        with patch("shared.llm_client.call_llm", new=AsyncMock(return_value=mock_llm_response)):
            req = SearchRequest(query="Deep topic?", document_id=doc_large.id, mode="auto")
            res_large = await ask_documents(req=req, tenant_id="default")
            assert res_large["mode"] == "rag"
            assert res_large["auto_routed"] is True
            assert "auto-routed to RAG" in res_large["reason"]

    delete_document(doc_large.id, tenant_id="default")
