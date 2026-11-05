"""
Document store for Feature 4: Feed the Brain.

Provides an in-memory document store backed by local JSON persistence
(data/documents_metadata.json) so uploaded documents survive server restarts.

FRAMEWORK EQUIVALENTS:
  _documents dict  ≈  a database table (documents)
  _chunks dict     ≈  a database table (chunks) with FK to documents
  delete_document  ≈  CASCADE DELETE in SQL

In Feature 11 (Docker/deploy) this can be swapped for a real database
with no changes to any endpoint — only this file changes.

MULTI-TENANCY (Feature 6, Part B):
  All functions accept an optional tenant_id parameter (default "default").
  When ENABLE_MULTI_TENANT=false (the default), tenant_id is ignored and
  all existing Feature 4/5 behavior is unchanged.
  When ENABLE_MULTI_TENANT=true, list_documents() and get_document() filter
  by tenant_id — one tenant cannot see another's documents.
"""

import json
import logging
import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

from shared.models import Chunk, Document

logger = logging.getLogger(__name__)

_DATA_DIR = Path("data")
_METADATA_FILE = _DATA_DIR / "documents_metadata.json"

_documents: dict[str, Document] = {}
_chunks: dict[str, list[Chunk]] = {}  # keyed by document_id
_document_texts: dict[str, str] = {}  # keyed by document_id for CAG full-context queries


def _persist_to_disk() -> None:
    """Save metadata to disk so it survives server reboots."""
    if os.getenv("TESTING", "").lower() == "true":
        return
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        payload = {
            "documents": {k: v.model_dump(mode="json") for k, v in _documents.items()},
            "chunks": {k: [c.model_dump(mode="json") for c in v] for k, v in _chunks.items()},
            "document_texts": _document_texts,
        }
        temp_file = _METADATA_FILE.with_suffix(".tmp")
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        temp_file.replace(_METADATA_FILE)
    except Exception as exc:
        logger.warning("Could not persist document metadata to %s: %s", _METADATA_FILE, exc)


def _load_from_disk() -> None:
    """Load previously persisted metadata on startup."""
    if not _METADATA_FILE.exists():
        return
    try:
        with open(_METADATA_FILE, encoding="utf-8") as f:
            payload = json.load(f)
        for doc_id, doc_dict in payload.get("documents", {}).items():
            _documents[doc_id] = Document.model_validate(doc_dict)
        for doc_id, chunks_list in payload.get("chunks", {}).items():
            _chunks[doc_id] = [Chunk.model_validate(c) for c in chunks_list]
        for doc_id, text in payload.get("document_texts", {}).items():
            _document_texts[doc_id] = text
    except Exception as exc:
        logger.warning("Could not load document metadata from %s: %s", _METADATA_FILE, exc)


# Load existing metadata at module import time
_load_from_disk()


def save_document_text(document_id: str, text: str) -> None:
    """Store full raw extracted text of a document for CAG (Cache-Augmented Generation)."""
    _document_texts[document_id] = text
    _persist_to_disk()


def get_document_text(document_id: str) -> str | None:
    """Return full raw text for CAG, or fallback to concatenated chunks."""
    if document_id in _document_texts and _document_texts[document_id].strip():
        return _document_texts[document_id]
    chunks = get_chunks(document_id)
    if chunks:
        return "\n\n".join(c.text for c in chunks)
    return None


def save_document(filename: str, tenant_id: str = "default") -> Document:
    """
    Create a new Document record (status='processing') and store it.

    Returns the Document immediately so the endpoint can respond while
    extraction and chunking proceed (synchronously in this feature).
    chunking_strategy is updated by update_document() once ingestion completes.
    """
    doc = Document(
        id=str(uuid.uuid4()),
        filename=filename,
        uploaded_at=datetime.now(tz=UTC),
        status="processing",
        chunk_count=0,
        chunking_strategy="sentence",  # placeholder; updated by update_document
        tenant_id=tenant_id,
    )
    _documents[doc.id] = doc
    _persist_to_disk()
    return doc


def update_document(
    doc_id: str,
    *,
    status: str,
    chunk_count: int,
    chunking_strategy: str = "sentence",
    page_count: int | None = None,
    char_count: int | None = None,
) -> None:
    """Update a document's status, chunk_count, chunking_strategy, and size metrics."""
    doc = _documents.get(doc_id)
    if doc is None:
        return
    updates: dict = {
        "status": status,
        "chunk_count": chunk_count,
        "chunking_strategy": chunking_strategy,
    }
    if page_count is not None:
        updates["page_count"] = page_count
    if char_count is not None:
        updates["char_count"] = char_count

    effective_pages = page_count if page_count is not None else getattr(doc, "page_count", 1)
    effective_chars = char_count if char_count is not None else getattr(doc, "char_count", 0)
    updates["cag_eligible"] = bool(effective_pages <= 50 and effective_chars <= 120_000)

    _documents[doc_id] = doc.model_copy(update=updates)
    _persist_to_disk()


def get_document(doc_id: str, tenant_id: str = "default") -> Document | None:
    """Return the Document for the given ID, or None if not found.

    When ENABLE_MULTI_TENANT=true, returns None if the document belongs
    to a different tenant — preventing cross-tenant access even with a
    known document ID.
    """
    from shared.config import settings

    doc = _documents.get(doc_id)
    if doc is None:
        return None
    if settings.enable_multi_tenant and doc.tenant_id != tenant_id:
        return None
    return doc


def list_documents(tenant_id: str = "default") -> list[Document]:
    """Return all documents, most recently uploaded first.

    When ENABLE_MULTI_TENANT=true, only returns documents belonging to
    the given tenant. When disabled, returns all documents (existing behavior).
    """
    from shared.config import settings

    docs = _documents.values()
    if settings.enable_multi_tenant:
        docs = (d for d in docs if d.tenant_id == tenant_id)
    return sorted(docs, key=lambda d: d.uploaded_at, reverse=True)


def save_chunk(chunk: Chunk) -> None:
    """Append a Chunk to its document's chunk list."""
    if chunk.document_id not in _chunks:
        _chunks[chunk.document_id] = []
    _chunks[chunk.document_id].append(chunk)
    _persist_to_disk()


def get_chunks(document_id: str) -> list[Chunk]:
    """Return all chunks for a document, in order."""
    return sorted(_chunks.get(document_id, []), key=lambda c: c.chunk_index)


def delete_document(doc_id: str, tenant_id: str = "default") -> bool:
    """
    Delete a document and all its chunks.

    Returns True if the document existed and was deleted, False if not found.
    When ENABLE_MULTI_TENANT=true, returns False if the document belongs to
    a different tenant — tenants cannot delete each other's documents.
    """
    from shared.config import settings

    doc = _documents.get(doc_id)
    if doc is None:
        return False
    if settings.enable_multi_tenant and doc.tenant_id != tenant_id:
        return False
    del _documents[doc_id]
    _chunks.pop(doc_id, None)
    _document_texts.pop(doc_id, None)
    _persist_to_disk()
    return True
