"""
FastAPI dependencies for tenant isolation and store access.
"""

from shared.tenant_context import get_tenant_id

__all__ = ["get_tenant_id"]
