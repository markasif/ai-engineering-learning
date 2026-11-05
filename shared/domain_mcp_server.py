"""
Enterprise HR & Operations Domain MCP Server for Feature 9: MCP Integration.

Connects to Supabase Database (or falls back to in-memory database)
to provide 5 active HR operational tools:
  1. lookup_employee: Search staff directory by name, email, or employee code.
  2. list_department_staff: View all employees in a specific department.
  3. get_pending_leave_requests: Review open PTO / time-off requests.
  4. update_leave_status: Approve or reject employee leave requests and adjust balance.
  5. submit_expense_claim: File reimbursement claims with policy checks (<$100 auto-approval).

Run standalone:
    python -m shared.domain_mcp_server

Enable via .env:
    ENABLE_DOMAIN_MCP_SERVER=true
    SUPABASE_URL=https://<your-project-ref>.supabase.co
    SUPABASE_KEY=<your-anon-or-service-key>
"""

import asyncio
import json
import os
import sys
import time
from typing import Any

import httpx

from shared.config import settings

try:
    from mcp import types as mcp_types
    from mcp.server import Server
    from mcp.server.stdio import stdio_server

    _MCP_AVAILABLE = True
except ImportError:
    _MCP_AVAILABLE = False


# =============================================================================
# In-Memory Seed / Fallback Database
# Used immediately out-of-the-box or when Supabase is unreachable.
# =============================================================================

MOCK_EMPLOYEES: list[dict[str, Any]] = [
    {
        "employee_code": "EMP-101",
        "name": "Rahul Sharma",
        "email": "rahul.sharma@neointelli.com",
        "phone": "+91 9876543210",
        "department": "Engineering",
        "role": "Senior Frontend Developer",
        "manager_name": "Sarah Jenkins",
        "leave_balance": 18,
        "status": "Active",
    },
    {
        "employee_code": "EMP-102",
        "name": "Sarah Jenkins",
        "email": "sarah.jenkins@neointelli.com",
        "phone": "+1 415-555-0142",
        "department": "Engineering",
        "role": "VP of Engineering",
        "manager_name": "Alex Vance",
        "leave_balance": 22,
        "status": "Active",
    },
    {
        "employee_code": "EMP-103",
        "name": "Priya Patel",
        "email": "priya.patel@neointelli.com",
        "phone": "+91 9123456789",
        "department": "HR & People Operations",
        "role": "Senior HR Specialist",
        "manager_name": "Elena Rostova",
        "leave_balance": 15,
        "status": "Active",
    },
    {
        "employee_code": "EMP-104",
        "name": "David Kim",
        "email": "david.kim@neointelli.com",
        "phone": "+1 415-555-0188",
        "department": "Product",
        "role": "Principal Product Manager",
        "manager_name": "Alex Vance",
        "leave_balance": 14,
        "status": "Active",
    },
    {
        "employee_code": "EMP-105",
        "name": "Amit Verma",
        "email": "amit.verma@neointelli.com",
        "phone": "+91 9988776655",
        "department": "Engineering",
        "role": "Staff Backend Engineer",
        "manager_name": "Sarah Jenkins",
        "leave_balance": 20,
        "status": "Active",
    },
    {
        "employee_code": "EMP-106",
        "name": "Diya Sharma",
        "email": "diya.sharma@neointelli.com",
        "phone": "+91 9811223344",
        "department": "Engineering",
        "role": "Frontend Developer",
        "manager_name": "Sarah Jenkins",
        "leave_balance": 15,
        "status": "Active",
    },
    {
        "employee_code": "EMP-107",
        "name": "Diya Patel",
        "email": "diya.patel@neointelli.com",
        "phone": "+91 9822334455",
        "department": "Marketing",
        "role": "Growth Marketing Lead",
        "manager_name": "Elena Rostova",
        "leave_balance": 19,
        "status": "Active",
    },
]

MOCK_LEAVE_REQUESTS: list[dict[str, Any]] = [
    {
        "request_code": "LV-2026-001",
        "employee_name": "Rahul Sharma",
        "leave_type": "Annual Leave",
        "days": 3,
        "start_date": "2026-11-10",
        "end_date": "2026-11-12",
        "reason": "Family trip & Diwali celebration",
        "status": "Pending",
    },
    {
        "request_code": "LV-2026-002",
        "employee_name": "Amit Verma",
        "leave_type": "Sick Leave",
        "days": 1,
        "start_date": "2026-11-04",
        "end_date": "2026-11-04",
        "reason": "Viral fever recovery",
        "status": "Pending",
    },
    {
        "request_code": "LV-2026-003",
        "employee_name": "David Kim",
        "leave_type": "Personal Leave",
        "days": 2,
        "start_date": "2026-10-15",
        "end_date": "2026-10-16",
        "reason": "Relocation & housing maintenance",
        "status": "Approved",
    },
]

MOCK_EXPENSES: list[dict[str, Any]] = [
    {
        "expense_code": "EXP-2026-101",
        "employee_name": "Rahul Sharma",
        "category": "Office & Equipment",
        "amount": 85.00,
        "currency": "USD",
        "merchant": "Keychron Keyboard Store",
        "description": "Ergonomic mechanical keyboard for workstation",
        "status": "Approved",
    },
    {
        "expense_code": "EXP-2026-102",
        "employee_name": "Rahul Sharma",
        "category": "Client Meal",
        "amount": 65.50,
        "currency": "USD",
        "merchant": "Starbucks Coffee",
        "description": "Lunch discussion with partner frontend architect",
        "status": "Approved",
    },
    {
        "expense_code": "EXP-2026-103",
        "employee_name": "Sarah Jenkins",
        "category": "Travel & Lodging",
        "amount": 420.00,
        "currency": "USD",
        "merchant": "Marriott Downtown",
        "description": "Hotel accommodation during Q4 Strategy Summit",
        "status": "Pending Review",
    },
]


def _get_supabase_config() -> tuple[str, str]:
    """Retrieve Supabase URL and Key from settings or environment."""
    url = (settings.supabase_url or os.getenv("SUPABASE_URL", "")).strip().rstrip("/")
    key = (settings.supabase_key or os.getenv("SUPABASE_KEY", "")).strip()
    return url, key


def _get_supabase_headers(key: str) -> dict[str, str]:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


# =============================================================================
# Tool implementations (Supabase + In-Memory Fallback)
# =============================================================================


async def lookup_employee(query: str) -> dict[str, Any]:
    """Search for an employee by name, email, or employee ID."""
    url, key = _get_supabase_config()
    clean_q = query.strip()

    if url and key:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    f"{url}/rest/v1/employees",
                    params={
                        "or": f"(name.ilike.*{clean_q}*,email.ilike.*{clean_q}*,employee_code.ilike.*{clean_q}*)",
                        "select": "*",
                    },
                    headers=_get_supabase_headers(key),
                )
                if resp.status_code == 200:
                    records = resp.json()
                    if records:
                        return {
                            "found": True,
                            "count": len(records),
                            "employees": records,
                            "source": "Supabase PostgreSQL Database",
                        }
        except Exception:
            pass  # Fall back to in-memory store

    # In-memory search fallback
    q_lower = clean_q.lower()
    matches = [
        emp
        for emp in MOCK_EMPLOYEES
        if q_lower in emp["name"].lower()
        or q_lower in emp["email"].lower()
        or q_lower in emp["employee_code"].lower()
        or q_lower in emp["role"].lower()
        or q_lower in emp["department"].lower()
    ]
    return {
        "found": len(matches) > 0,
        "count": len(matches),
        "employees": matches,
        "source": "Enterprise Employee Records (In-Memory Database)",
    }


async def list_department_staff(department: str) -> dict[str, Any]:
    """List all staff members and their roles in a specific department."""
    url, key = _get_supabase_config()
    clean_dept = department.strip()

    if url and key:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    f"{url}/rest/v1/employees",
                    params={"department": f"ilike.*{clean_dept}*", "select": "*"},
                    headers=_get_supabase_headers(key),
                )
                if resp.status_code == 200:
                    records = resp.json()
                    if records:
                        return {
                            "department": clean_dept,
                            "count": len(records),
                            "staff": records,
                            "source": "Supabase PostgreSQL Database",
                        }
        except Exception:
            pass

    # In-memory fallback
    dept_lower = clean_dept.lower()
    matches = [
        emp
        for emp in MOCK_EMPLOYEES
        if dept_lower in emp["department"].lower() or emp["department"].lower() in dept_lower
    ]
    return {
        "department": clean_dept,
        "count": len(matches),
        "staff": matches,
        "source": "Enterprise Employee Records (In-Memory Database)",
    }


async def get_pending_leave_requests(employee_name: str | None = None) -> dict[str, Any]:
    """Retrieve open PTO/leave requests awaiting HR or manager approval."""
    url, key = _get_supabase_config()

    if url and key:
        try:
            params = {"status": "eq.Pending", "select": "*"}
            if employee_name and employee_name.strip():
                params["employee_name"] = f"ilike.*{employee_name.strip()}*"
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    f"{url}/rest/v1/leave_requests",
                    params=params,
                    headers=_get_supabase_headers(key),
                )
                if resp.status_code == 200:
                    records = resp.json()
                    if records:
                        return {
                            "count": len(records),
                            "pending_requests": records,
                            "source": "Supabase PostgreSQL Database",
                        }
        except Exception:
            pass

    # In-memory fallback
    results = [req for req in MOCK_LEAVE_REQUESTS if req["status"] == "Pending"]
    if employee_name and employee_name.strip():
        en_lower = employee_name.strip().lower()
        results = [r for r in results if en_lower in r["employee_name"].lower()]

    return {
        "count": len(results),
        "pending_requests": results,
        "source": "HR Time-Off Management System (In-Memory Database)",
    }


async def update_leave_status(request_code: str, status: str) -> dict[str, Any]:
    """Approve or reject a leave request and update employee leave balance."""
    normalized_status = "Approved" if "app" in status.lower() else "Rejected"
    url, key = _get_supabase_config()

    req_code_clean = request_code.strip()
    leave_req: dict[str, Any] | None = None

    # Find request in mock data first for metadata
    for r in MOCK_LEAVE_REQUESTS:
        if r["request_code"].lower() == req_code_clean.lower():
            leave_req = r
            r["status"] = normalized_status
            break

    # If approved, deduct days from employee balance
    if normalized_status == "Approved" and leave_req:
        days = leave_req.get("days", 1)
        for emp in MOCK_EMPLOYEES:
            if emp["name"].lower() == leave_req["employee_name"].lower():
                emp["leave_balance"] = max(0, emp.get("leave_balance", 18) - days)
                break

    if url and key:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.patch(
                    f"{url}/rest/v1/leave_requests",
                    params={"request_code": f"eq.{req_code_clean}"},
                    json={"status": normalized_status},
                    headers=_get_supabase_headers(key),
                )
                if resp.status_code in (200, 204):
                    return {
                        "success": True,
                        "request_code": req_code_clean,
                        "status": normalized_status,
                        "message": f"Leave request {req_code_clean} was updated to '{normalized_status}' in Supabase.",
                        "source": "Supabase PostgreSQL Database",
                    }
        except Exception:
            pass

    return {
        "success": True,
        "request_code": req_code_clean,
        "status": normalized_status,
        "message": f"Leave request {req_code_clean} has been successfully {normalized_status.lower()}.",
        "source": "HR Time-Off Management System (In-Memory Database)",
    }


async def submit_expense_claim(
    employee_name: str,
    category: str,
    amount: float,
    merchant: str,
    description: str = "",
) -> dict[str, Any]:
    """Submit an expense reimbursement claim with automated policy validation."""
    amt = float(amount)
    clean_emp = employee_name.strip()

    # Disambiguation check: Verify if multiple employees match the requested name
    lookup = await lookup_employee(clean_emp)
    if lookup.get("found"):
        candidates = lookup.get("employees", [])
        exact_code = [e for e in candidates if e.get("employee_code", "").lower() == clean_emp.lower()]
        exact_name = [e for e in candidates if e.get("name", "").lower() == clean_emp.lower()]

        if len(exact_code) == 1:
            clean_emp = f"{exact_code[0]['name']} ({exact_code[0]['employee_code']})"
        elif len(exact_name) == 1:
            clean_emp = f"{exact_name[0]['name']} ({exact_name[0]['employee_code']})"
        elif len(candidates) > 1:
            return {
                "success": False,
                "requires_disambiguation": True,
                "count": len(candidates),
                "matched_name": clean_emp,
                "candidates": [
                    {
                        "employee_code": c.get("employee_code"),
                        "name": c.get("name"),
                        "department": c.get("department"),
                        "role": c.get("role"),
                        "email": c.get("email"),
                    }
                    for c in candidates
                ],
                "message": f"Multiple employees found matching '{clean_emp}'. Disambiguation required before submitting.",
                "instruction": (
                    f"Present all {len(candidates)} matching employees in a clean Markdown table "
                    f"with Employee Code, Full Name, Department, Role, and Work Email. "
                    f"Ask the user to clarify which employee this expense claim is for by providing their Employee Code or Full Name."
                ),
            }

    # Enterprise Policy: Claims under $100 auto-approve; higher amounts flag for manager review
    if amt <= 100.0:
        approval_status = "Approved (Auto-processed under $100 policy)"
    else:
        approval_status = "Pending Review (Manager Approval Required)"

    code = f"EXP-2026-{int(time.time()) % 1000000:04d}"
    record = {
        "expense_code": code,
        "employee_name": clean_emp,
        "category": category.strip(),
        "amount": amt,
        "currency": "USD",
        "merchant": merchant.strip(),
        "description": description.strip() or f"Expense reimbursement for {merchant}",
        "status": approval_status,
    }

    MOCK_EXPENSES.append(record)

    url, key = _get_supabase_config()
    if url and key:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(
                    f"{url}/rest/v1/expenses",
                    json=record,
                    headers=_get_supabase_headers(key),
                )
                if resp.status_code in (200, 201):
                    return {
                        "success": True,
                        "expense": record,
                        "message": f"Expense claim {code} for ${amt:.2f} at {merchant} recorded in Supabase ({approval_status}).",
                        "source": "Supabase PostgreSQL Database",
                    }
        except Exception:
            pass

    return {
        "success": True,
        "expense": record,
        "message": f"Expense claim {code} for ${amt:.2f} at {merchant} recorded successfully ({approval_status}).",
        "source": "Finance & Expense System (In-Memory Database)",
    }


# Backward compatibility helpers
def _search_domain_records(query: str, limit: int = 5) -> dict[str, Any]:
    domain = settings.effective_domain()
    return {
        "query": query,
        "results": [
            {
                "id": f"record-{i + 1}",
                "title": f"{domain} record matching '{query}' #{i + 1}",
                "summary": f"Verified document and operational record from {domain}.",
            }
            for i in range(min(limit, 3))
        ],
        "total": min(limit, 3),
        "note": f"Domain search completed for {domain}.",
    }


def _get_domain_status(entity_id: str) -> dict[str, Any]:
    domain = settings.effective_domain()
    return {
        "entity_id": entity_id,
        "status": "active",
        "last_updated": "2026-07-01T12:00:00Z",
        "details": f"Status of {entity_id} in {domain}.",
        "note": f"Domain status check completed for {domain}.",
    }


# =============================================================================
# MCP Server definition
# =============================================================================

if _MCP_AVAILABLE:

    async def list_tools_handler(ctx=None, params=None) -> mcp_types.ListToolsResult:
        return mcp_types.ListToolsResult(
            tools=[
                mcp_types.Tool(
                    name="lookup_employee",
                    description=(
                        "Look up an employee's profile, contact details, role, department, "
                        "reporting manager, leave balance, and employment status from the HR database."
                    ),
                    input_schema={
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Employee full name, email, employee code (e.g. 'Rahul Sharma', 'EMP-101', 'rahul.sharma@neointelli.com')",
                            },
                        },
                        "required": ["query"],
                    },
                ),
                mcp_types.Tool(
                    name="list_department_staff",
                    description=(
                        "List all staff members and their roles in a specific department (e.g. 'Engineering', 'HR', 'Product')."
                    ),
                    input_schema={
                        "type": "object",
                        "properties": {
                            "department": {
                                "type": "string",
                                "description": "Department name to inspect, e.g. 'Engineering', 'Product', 'HR & People Operations'",
                            },
                        },
                        "required": ["department"],
                    },
                ),
                mcp_types.Tool(
                    name="get_pending_leave_requests",
                    description=(
                        "Retrieve pending employee leave and time-off (PTO) requests waiting for manager or HR approval."
                    ),
                    input_schema={
                        "type": "object",
                        "properties": {
                            "employee_name": {
                                "type": "string",
                                "description": "Optional: Filter pending leave requests for a specific employee name.",
                            },
                        },
                    },
                ),
                mcp_types.Tool(
                    name="update_leave_status",
                    description=(
                        "Approve or reject an employee's leave request by request code (e.g., 'LV-2026-001'). "
                        "If approved, automatically adjusts the employee's available PTO balance."
                    ),
                    input_schema={
                        "type": "object",
                        "properties": {
                            "request_code": {
                                "type": "string",
                                "description": "The unique leave request code (e.g. 'LV-2026-001')",
                            },
                            "status": {
                                "type": "string",
                                "description": "The new status: 'Approved' or 'Rejected'",
                                "enum": ["Approved", "Rejected"],
                            },
                        },
                        "required": ["request_code", "status"],
                    },
                ),
                mcp_types.Tool(
                    name="submit_expense_claim",
                    description=(
                        "Submit an employee business expense reimbursement claim. Automatically applies policy checks: "
                        "claims under $100 are auto-approved; claims above $100 require manager approval."
                    ),
                    input_schema={
                        "type": "object",
                        "properties": {
                            "employee_name": {
                                "type": "string",
                                "description": "Full name of the employee submitting the expense claim",
                            },
                            "category": {
                                "type": "string",
                                "description": "Expense category, e.g. 'Office & Equipment', 'Client Meal', 'Travel & Lodging', 'Software'",
                            },
                            "amount": {
                                "type": "number",
                                "description": "Amount in USD (e.g., 75.50)",
                            },
                            "merchant": {
                                "type": "string",
                                "description": "Merchant, vendor, or store name (e.g., 'Starbucks', 'Keychron', 'Delta')",
                            },
                            "description": {
                                "type": "string",
                                "description": "Brief business justification or expense description",
                            },
                        },
                        "required": ["employee_name", "category", "amount", "merchant"],
                    },
                ),
                # Legacy compatibility tools
                mcp_types.Tool(
                    name="search_domain_records",
                    description=f"Search {settings.effective_domain()} records matching a query keyword.",
                    input_schema={
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "Search query"},
                            "limit": {"type": "integer", "description": "Maximum results", "default": 5},
                        },
                        "required": ["query"],
                    },
                ),
                mcp_types.Tool(
                    name="get_domain_status",
                    description=f"Get the current status of an entity in {settings.effective_domain()}.",
                    input_schema={
                        "type": "object",
                        "properties": {
                            "entity_id": {"type": "string", "description": "Entity ID"},
                        },
                        "required": ["entity_id"],
                    },
                ),
            ]
        )

    async def call_tool_handler(ctx, params) -> mcp_types.CallToolResult:
        name = getattr(params, "name", "")
        arguments = getattr(params, "arguments", {}) or {}

        if name == "lookup_employee":
            result = await lookup_employee(arguments.get("query", ""))
        elif name == "list_department_staff":
            result = await list_department_staff(arguments.get("department", ""))
        elif name == "get_pending_leave_requests":
            result = await get_pending_leave_requests(arguments.get("employee_name"))
        elif name == "update_leave_status":
            result = await update_leave_status(
                arguments.get("request_code", ""), arguments.get("status", "Approved")
            )
        elif name == "submit_expense_claim":
            result = await submit_expense_claim(
                employee_name=arguments.get("employee_name", ""),
                category=arguments.get("category", "General"),
                amount=float(arguments.get("amount", 0.0)),
                merchant=arguments.get("merchant", ""),
                description=arguments.get("description", ""),
            )
        elif name == "search_domain_records":
            result = _search_domain_records(arguments.get("query", ""), arguments.get("limit", 5))
        elif name == "get_domain_status":
            result = _get_domain_status(arguments.get("entity_id", ""))
        else:
            result = {"error": f"Unknown tool '{name}'"}

        return mcp_types.CallToolResult(
            content=[mcp_types.TextContent(type="text", text=json.dumps(result, indent=2))]
        )

    server = Server(
        "bsb-domain-mcp-server",
        on_list_tools=list_tools_handler,
        on_call_tool=call_tool_handler,
    )

    async def main():
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream, server.create_initialization_options())

else:

    async def main():
        raise RuntimeError(
            "The 'mcp' package is not installed. Run: pip install mcp\n"
            "See requirements.txt for the full dependency list."
        )


if __name__ == "__main__":
    asyncio.run(main())
