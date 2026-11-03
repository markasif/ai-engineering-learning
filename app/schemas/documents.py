"""Document and search-related schemas."""

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str = Field(..., description="Semantic search query")
    top_k: int = Field(5, ge=1, le=50, description="Maximum number of chunks to retrieve")
    document_id: str | None = Field(None, description="Optional document filter")
    mode: str | None = Field("rag", description="Inference mode: 'rag' (vector search) or 'cag' (Cache-Augmented Generation)")


__all__ = ["SearchRequest"]
