"""
Unit tests for Enterprise HR Domain MCP Tools and Local Tools Registry.
Covers:
  - Employee directory lookup and department listings
  - Leave requests and status updates
  - Expense submissions, auto-approval thresholds ($100), and name disambiguation
  - Local TOOLS_REGISTRY execution parity
"""

import pytest

from shared.agent import TOOLS_REGISTRY
from shared.domain_mcp_server import (
    get_expense_claims,
    get_pending_leave_requests,
    list_department_staff,
    lookup_employee,
    submit_expense_claim,
    update_leave_status,
)


@pytest.mark.asyncio
async def test_lookup_employee_found():
    result = await lookup_employee("Rahul Sharma")
    assert result["found"] is True
    assert result["count"] >= 1
    assert any(emp["name"] == "Rahul Sharma" for emp in result["employees"])


@pytest.mark.asyncio
async def test_lookup_employee_not_found():
    result = await lookup_employee("Nonexistent Person XYZ")
    assert result["found"] is False
    assert result["count"] == 0
    assert result["employees"] == []


@pytest.mark.asyncio
async def test_list_department_staff():
    eng_result = await list_department_staff("Engineering")
    assert eng_result["count"] >= 2
    assert len(eng_result["staff"]) >= 2
    assert "name" in eng_result["staff"][0]
    names = [emp["name"] for emp in eng_result["staff"]]
    assert len(names) >= 2


@pytest.mark.asyncio
async def test_leave_requests_and_status_update():
    # 1. Fetch pending leaves
    pending = await get_pending_leave_requests()
    assert pending["count"] >= 1
    assert "pending_requests" in pending
    first_req = pending["pending_requests"][0]
    req_code = first_req["request_code"]

    # 2. Update status to Approved
    update_res = await update_leave_status(
        request_code=req_code,
        status="Approved",
    )
    assert update_res["success"] is True
    assert update_res["status"] == "Approved"


@pytest.mark.asyncio
async def test_submit_expense_under_100_auto_approved():
    res = await submit_expense_claim(
        employee_name="Sarah Jenkins",
        category="Office Supplies",
        amount=45.50,
        merchant="Staples",
        description="Printer paper and pens",
    )
    assert res["success"] is True
    assert "Approved" in res["expense"]["status"]
    assert (
        "auto-processed" in res["expense"]["status"].lower() or "approved" in res["message"].lower()
    )


@pytest.mark.asyncio
async def test_submit_expense_over_100_pending_review():
    res = await submit_expense_claim(
        employee_name="Sarah Jenkins",
        category="Travel",
        amount=450.00,
        merchant="United Airlines",
        description="Flight to Tech Conference",
    )
    assert res["success"] is True
    assert "Pending Review" in res["expense"]["status"]
    assert (
        "manager approval" in res["expense"]["status"].lower()
        or "pending" in res["message"].lower()
    )


@pytest.mark.asyncio
async def test_submit_expense_disambiguation():
    # "Diya" matches Diya Sharma (EMP-106) and Diya Patel (EMP-107)
    res = await submit_expense_claim(
        employee_name="Diya",
        category="Team Lunch",
        amount=65.00,
        merchant="Subway",
        description="Team lunch",
    )
    assert res.get("requires_disambiguation") is True
    assert len(res.get("candidates", [])) >= 2

    # Specific employee code should resolve without disambiguation
    res_specific = await submit_expense_claim(
        employee_name="EMP-106",
        category="Team Lunch",
        amount=65.00,
        merchant="Subway",
        description="Team lunch",
    )
    assert res_specific.get("requires_disambiguation") is not True
    assert res_specific["success"] is True
    assert "Approved" in res_specific["expense"]["status"]


@pytest.mark.asyncio
async def test_get_expense_claims():
    all_expenses = await get_expense_claims()
    assert all_expenses["count"] >= 1
    # Filter by status
    pending = await get_expense_claims(status="Pending")
    assert pending["count"] >= 0
    assert all("pending" in e["status"].lower() for e in pending["expenses"])


@pytest.mark.asyncio
async def test_agent_tools_registry_parity():
    required_tools = [
        "lookup_employee",
        "list_department_staff",
        "get_pending_leave_requests",
        "update_leave_status",
        "submit_expense_claim",
        "get_expense_claims",
    ]
    for tool_name in required_tools:
        assert tool_name in TOOLS_REGISTRY, f"Tool '{tool_name}' missing from TOOLS_REGISTRY"
        fn, schema = TOOLS_REGISTRY[tool_name]
        assert callable(fn)
        assert schema["function"]["name"] == tool_name
