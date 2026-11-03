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

    # Mock call_llm
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

    delete_document(doc_id, tenant_id="default")
