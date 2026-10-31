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
    get_stats as vector_get_stats,
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
async def search_documents(req: SearchRequest, tenant_id: str = Depends(get_tenant_id)) -> list[dict[str, Any]]:
    """Direct semantic similarity search over document chunks."""
    filters = {"document_id": req.document_id} if req.document_id else None
    return vector_search(req.query, top_k=req.top_k, filters=filters, tenant_id=tenant_id)


@router.get("/search/stats", tags=["F5 · Find the Answer"])
async def search_stats() -> dict[str, Any]:
    """Fetch vector database collection stats."""
    return vector_get_stats()

