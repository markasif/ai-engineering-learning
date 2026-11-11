"""
Pre-seeds a starter Enterprise Knowledge Base document into the vector store
if the default tenant document store is currently empty.

Ensures first-time visitors and LinkedIn reviewers can immediately test RAG,
semantic search, and supporting passage citations without needing to upload files.
"""

import logging
import uuid

from shared.document_store import (
    list_documents,
    save_chunk,
    save_document,
    save_document_text,
    update_document,
)
from shared.ingestion import CHUNKING_STRATEGIES
from shared.models import Chunk
from shared.vector_store import add_chunks

logger = logging.getLogger(__name__)

SAMPLE_HANDBOOK_TEXT = """# Acme Global Enterprise Handbook (2025 Edition)

## 1. Engineering Leadership & Staff Directory
The Engineering division at Acme Global is structured under VP of Engineering Sarah Chen.
- Sarah Chen: Vice President of Engineering, overseeing all Core AI, Platform Infrastructure, and Product Engineering teams. Reports directly to the Chief Technology Officer.
- Rahul Sharma: Senior AI Systems Engineer, leading Agentic Workflows, Retrieval Augmented Generation (RAG) pipelines, and LLM Microservice deployment. Reports to Sarah Chen.
- Priya Patel: Lead Quality Assurance & Test Engineering Lead, responsible for automated testing benchmarks and continuous evaluation harnesses. Reports to Sarah Chen.
- Alex Rivera: Principal Product Manager for Enterprise Operations and HR Intelligence tooling.
- Marcus Vance: Staff Cloud & DevOps Architect, managing Kubernetes container clusters, CI/CD pipelines, and multi-region failover.

## 2. Paid Time Off (PTO), Leave Approvals, and Sick Day Policy
Acme Global offers a flexible and comprehensive leave program for all full-time employees:
- Standard PTO Accrual: Full-time employees accrue 20 days of Paid Time Off annually, allocated at 1.67 days per month. Up to 5 unused PTO days can be rolled over into the subsequent calendar year.
- Public Holidays: In addition to standard PTO, the company observes 10 paid official public holidays annually.
- Sick Leave: Employees receive 5 dedicated paid sick days per year. Sick leave does not deduct from your PTO balance and does not require advance notice.
- Approval Workflow: Leave requests under 3 consecutive days are automatically routed to your direct reporting manager and are typically approved within 24 hours via the internal HR portal. Requests exceeding 5 consecutive days require at least 2 weeks advance notice to allow team capacity planning.

## 3. Expense Reimbursement and Equipment Allowance Policy
Acme Global ensures prompt and transparent reimbursement for all approved operational expenses:
- Travel & Meals: Reimbursable categories include business travel, client entertainment meals (up to $75 per attendee), and professional development materials.
- Standard Approval Thresholds: Expense claims under $100 require receipt upload and are automatically approved and reimbursed within 48 hours to the employee's direct deposit account.
- Higher-Tier Claims: Expense claims exceeding $100 require manual sign-off from your direct department manager prior to finance payout.
- Remote Work Stipend: Every remote employee is eligible for an annual $500 home-office equipment allowance to purchase ergonomic monitors, desks, and peripheral devices.
- Filing Deadlines: Receipts must be submitted within 30 days of purchase through the Finance portal.

## 4. Information Security, 2FA, and Device Compliance
To safeguard enterprise data, client privacy, and proprietary intellectual property:
- Multi-Factor Authentication (2FA): 2FA is strictly mandatory across all enterprise systems, cloud dashboards, and GitHub repositories.
- Password Standards: Passwords must be at least 14 characters long and rotated every 90 days.
- Remote Devices: Work laptops must maintain full-disk encryption (BitLocker / FileVault) enabled at all times.
"""


def seed_default_knowledge_if_empty(tenant_id: str = "default") -> None:
    """Pre-seeds the Acme Global Enterprise Handbook if the tenant has no ready documents."""
    try:
        existing = list_documents(tenant_id=tenant_id)
        ready_docs = [d for d in existing if d.status == "ready"]
        if ready_docs:
            return  # Already seeded or user has uploaded documents

        filename = "Acme_Enterprise_Handbook_2025.txt"
        doc = save_document(filename, tenant_id=tenant_id)
        save_document_text(doc.id, SAMPLE_HANDBOOK_TEXT)

        strategy = "sentence"
        pages = [{"page": 1, "text": SAMPLE_HANDBOOK_TEXT}]
        chunk_dicts = CHUNKING_STRATEGIES[strategy](SAMPLE_HANDBOOK_TEXT, pages)

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

        update_document(
            doc.id,
            status="ready",
            chunk_count=len(chunk_dicts),
            chunking_strategy=strategy,
            page_count=1,
            char_count=len(SAMPLE_HANDBOOK_TEXT),
        )
        logger.info(
            "Pre-seeded default Enterprise Handbook successfully (%d chunks)", len(chunk_dicts)
        )
    except Exception as exc:
        logger.warning("Default knowledge seeding notice: %s", exc)

