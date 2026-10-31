"""
Tests for multi-tenant isolation.
Verifies that tenant data is completely invisible across tenant boundaries.
"""
import pytest
import shared.config as cfg
from shared.document_store import (
    delete_document,
    get_document,
    list_documents,
    save_document,
)
from shared.session_store import (
    create_session,
    get_session,
    list_sessions,
)


@pytest.fixture(autouse=True)
def enable_multi_tenant(monkeypatch):
    """Activate multi-tenant mode for every test in this file."""
    monkeypatch.setattr(cfg.settings, "enable_multi_tenant", True)


class TestDocumentIsolation:
    def test_tenant_a_cannot_read_tenant_b_document(self):
        doc = save_document("secret.pdf", tenant_id="tenant-a")
        assert get_document(doc.id, tenant_id="tenant-b") is None
        assert get_document(doc.id, tenant_id="tenant-a") is not None

    def test_list_documents_filters_by_tenant(self):
        doc_a = save_document("doc_a.pdf", tenant_id="tenant-a")
        doc_b = save_document("doc_b.pdf", tenant_id="tenant-b")

        docs_a = list_documents(tenant_id="tenant-a")
        docs_b = list_documents(tenant_id="tenant-b")

        assert any(d.id == doc_a.id for d in docs_a)
        assert not any(d.id == doc_b.id for d in docs_a)
        assert any(d.id == doc_b.id for d in docs_b)
        assert not any(d.id == doc_a.id for d in docs_b)

    def test_tenant_b_cannot_delete_tenant_a_document(self):
        doc = save_document("important.pdf", tenant_id="tenant-a")
        assert not delete_document(doc.id, tenant_id="tenant-b")
        assert get_document(doc.id, tenant_id="tenant-a") is not None

    def test_tenant_can_delete_own_document(self):
        doc = save_document("my_doc.pdf", tenant_id="tenant-a")
        assert delete_document(doc.id, tenant_id="tenant-a")
        assert get_document(doc.id, tenant_id="tenant-a") is None

    def test_document_tenant_id_is_stored_on_record(self):
        doc = save_document("sample.txt", tenant_id="tenant-xyz")
        assert doc.tenant_id == "tenant-xyz"


class TestSessionIsolation:
    def test_tenant_a_cannot_read_tenant_b_session(self):
        sid = create_session(tenant_id="tenant-a")
        assert get_session(sid, tenant_id="tenant-b") is None
        assert get_session(sid, tenant_id="tenant-a") is not None

    def test_session_carries_tenant_id(self):
        sid = create_session(tenant_id="tenant-42")
        session = get_session(sid, tenant_id="tenant-42")
        assert session is not None
        assert session.tenant_id == "tenant-42"

    def test_multiple_tenants_have_separate_sessions(self):
        sid_a = create_session(tenant_id="tenant-a")
        sid_b = create_session(tenant_id="tenant-b")

        assert get_session(sid_a, tenant_id="tenant-a") is not None
        assert get_session(sid_b, tenant_id="tenant-b") is not None
        assert get_session(sid_a, tenant_id="tenant-b") is None
        assert get_session(sid_b, tenant_id="tenant-a") is None


class TestDefaultTenantBackcompat:
    def test_default_tenant_creates_and_retrieves_document(self):
        doc = save_document("legacy.pdf")
        assert doc.tenant_id == "default"
        assert get_document(doc.id) is not None

    def test_default_tenant_session_roundtrip(self):
        sid = create_session()
        session = get_session(sid)
        assert session is not None
        assert session.tenant_id == "default"

    def test_default_tenant_isolated_from_named_tenant(self):
        doc = save_document("default_doc.pdf")
        assert get_document(doc.id, tenant_id="tenant-x") is None


class TestMultiTenantDisabled:
    def test_disabled_mode_ignores_tenant_id(self, monkeypatch):
        monkeypatch.setattr(cfg.settings, "enable_multi_tenant", False)
        doc = save_document("open.pdf", tenant_id="tenant-a")
        # In disabled mode, any tenant query returns the document
        assert get_document(doc.id, tenant_id="tenant-b") is not None

