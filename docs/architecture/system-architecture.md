# System Architecture & Technical Specifications

This document outlines the architecture, layer contracts, data flow, and design patterns powering the AI Assistant microservice.

---

## 1. High-Level Layered Architecture

```mermaid
flowchart TD
    Client["Client Layer (SPA UI / Mobile / REST API / SDK)"]
    
    subgraph Gateway ["Edge & Middleware"]
        CORS["CORS Middleware"]
        ReqID["RequestID Middleware (X-Request-ID)"]
        Timing["Timing & Metrics Middleware"]
        RL["Rate Limiter (SlowAPI)"]
    end

    subgraph API ["FastAPI Routing Layer (app/api/)"]
        SysRouter["/api/system (Health, Provider, Metrics, Eval)"]
        ChatRouter["/api/chat (Basic, Structured, Sessions, Smart)"]
        DocRouter["/api/documents (Upload, Chunking, Search)"]
        AgentRouter["/api/agents (ReAct Agent, Planner, MCP)"]
        MMRouter["/api/multimodal (Voice STT/TTS, Vision VLM)"]
    end

    subgraph CoreEngine ["Core AI Engineering Services"]
        RouterClassifier["Semantic Query Classifier"]
        ReActLoop["ReAct Agent Execution Engine"]
        Planner["Multi-Step Task Planner"]
        Ingestion["Document Ingestion & Chunking Pipeline"]
    end

    subgraph Adapters ["Providers & Data Connectors"]
        Factory["LLM Provider Factory"]
        OpenAI["OpenAI / Groq / Anthropic / Cohere / Ollama"]
        MCPClient["Model Context Protocol (MCP) Client"]
        ChromaStore["ChromaDB Vector Store"]
        SessionStore["In-Memory / Distributed Session Store"]
    end

    Client --> Gateway
    Gateway --> API
    API --> CoreEngine
    CoreEngine --> Adapters
    Adapters --> ChromaStore
    Adapters --> OpenAI
    Adapters --> MCPClient
```

---

## 2. Directory and Package Layout

The project follows a standard Clean Architecture package structure:

* **`app/`**: Application-specific infrastructure, routes, schemas, and entrypoint.
  * **`main.py`**: App factory, lifespan hooks, middleware registration, static asset mounts.
  * **`core/`**: Centralized configuration (`config.py`), rate-limiting (`rate_limit.py`), logging setup.
  * **`schemas/`**: Pydantic v2 data transfer objects and validation contracts (`chat.py`, `documents.py`, `agents.py`, `multimodal.py`).
  * **`api/`**: Modular route definitions decoupled by feature domain (`chat.py`, `documents.py`, `agents.py`, `multimodal.py`, `system.py`).
* **`shared/`**: Reusable AI primitives and infrastructure adapters.
  * **`providers/`**: Multi-provider LLM abstraction layer implementing the Factory pattern for Groq, OpenAI, Anthropic, Cohere, Ollama, Azure, Bedrock, and Vertex.
  * **`agent.py`**: ReAct pattern agent execution engine.
  * **`planner.py`**: Multi-step autonomous task planner.
  * **`vector_store.py`**: Persistent ChromaDB vector embedding wrapper.
  * **`mcp_client.py`**: Model Context Protocol client for dynamically discovering and calling external tools.
  * **`ingestion.py`**: Multi-strategy text extraction (PDF, DOCX, TXT) and semantic chunking.
  * **`tenant_context.py`**: Multi-tenant isolation ensuring strict partition of sessions and document embeddings.
* **`tests/`**: Testing pyramid:
  * **`unit/`**: Deterministic unit tests with 0 API token cost.
  * **`integration/`**: FastAPI TestClient smoke and route validation tests.
  * **`eval/`**: Golden eval benchmark dataset and CI scoring script.
* **`ui/`**: Single Page Application (HTML, CSS, JS) mounted directly at the root `/`.

---

## 3. Request Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Gateway as FastAPI Middleware
    participant Router as API Endpoint
    participant Classifier as Smart Query Classifier
    participant VectorDB as Chroma Vector Store
    participant Factory as Provider Factory
    participant LLM as Active LLM Provider

    User->>Gateway: POST /api/sessions/{id}/chat/smart
    Gateway->>Gateway: Inject X-Request-ID, verify Rate Limit
    Gateway->>Router: Forward Request
    Router->>Classifier: classify_query(message)
    Classifier-->>Router: {intent, confidence, needs_retrieval}
    
    alt Retrieval Needed (RAG / Hybrid)
        Router->>VectorDB: vector_search(query, top_k)
        VectorDB-->>Router: relevant_chunks
    end

    Router->>Factory: get_provider("llm")
    Factory-->>Router: provider_instance
    Router->>LLM: chat(system_prompt + context + history + user_message)
    LLM-->>Router: completion response
    Router->>User: 200 OK (SmartChatResponse)
    Gateway->>Gateway: Record latency & increment request metric
```

---

## 4. Multi-Tenant Isolation Strategy

Multi-tenancy is enforced at the data layer:
1. Every request resolves a `tenant_id` via header (`X-Tenant-ID`), query parameter, or defaults to `"default"`.
2. Document records, document chunks, and chat sessions are keyed with `tenant_id`.
3. Vector similarity queries strictly apply metadata filtering: `where={"tenant_id": tenant_id}` so one tenant cannot retrieve or leak another tenant's vector embeddings.

