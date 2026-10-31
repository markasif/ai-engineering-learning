"""
Unit tests validating Pydantic schemas and serialization.
"""

import pytest
from pydantic import ValidationError

from app.schemas.agents import McpExecuteRequest
from app.schemas.chat import (
    ChatRequest,
)
from app.schemas.documents import SearchRequest


def test_chat_request_valid():
    req = ChatRequest(message="Hello AI")
    assert req.message == "Hello AI"


def test_chat_request_empty_fails():
    with pytest.raises(ValidationError):
        ChatRequest()  # type: ignore[call-arg]


def test_search_request_defaults():
    req = SearchRequest(query="find pricing policy")
    assert req.query == "find pricing policy"
    assert req.top_k == 5
    assert req.document_id is None


def test_search_request_top_k_bounds():
    with pytest.raises(ValidationError):
        SearchRequest(query="test", top_k=0)

    with pytest.raises(ValidationError):
        SearchRequest(query="test", top_k=100)


def test_mcp_execute_request_defaults():
    req = McpExecuteRequest(tool_name="calculate")
    assert req.tool_name == "calculate"
    assert req.arguments == {}
