# AskRaggy · Enterprise Knowledge & Autonomous Agent Platform

<p align="center">
  <img src="ui/askraggy-brand.png" alt="AskRaggy Logo" width="120" />
</p>

<p align="center">
  <strong>Industry-Grade Autonomous AI Microservice with Model Context Protocol (MCP), ReAct Agents, Grounded RAG, and Real-Time Evaluation Gates.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=flat&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/Model%20Context%20Protocol-MCP-10b981?style=flat" alt="MCP" />
  <img src="https://img.shields.io/badge/ChromaDB-Vector%20Store-orange?style=flat" alt="ChromaDB" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=flat&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/Tests-41%20Passed-brightgreen?style=flat" alt="Tests" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat" alt="License" />
</p>

---

---

## ⚡ Quickstart

### 1. Local Development (Single-Command Setup)

```bash
# 1. Clone & copy environment template
cp .env.example .env

# 2. Install editable package with dev dependencies
make install
# or: pip install -e ".[dev]"

# 3. Launch FastAPI development server with auto-reload
make dev
# or: python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser for the web application, or **[http://localhost:8000/docs](http://localhost:8000/docs)** for interactive OpenAPI documentation.

### 2. Run in Production Docker Container

```bash
# Build and run with named volumes for ChromaDB and Uploads
docker compose up --build -d

# Verify container health
curl http://localhost:8000/api/health
```

---

## 🏗️ Repository & Architecture Layout

The codebase is structured following **Clean Architecture** patterns separating API interfaces, business services, core libraries, and deterministic tests:

```
ai-engineering-learning/
├── app/                         # Production Application Layer (FastAPI)
│   ├── main.py                  # App factory, lifespan, CORS, middleware assembly
│   ├── core/                    # Config, rate limiting, logging
│   ├── schemas/                 # Pydantic v2 validation contracts
│   ├── api/                     # Modular API routers & dependency injection
│   │   ├── router.py            # Aggregates /api and /api/v1 endpoints
│   │   └── v1/endpoints/        # Chat, documents, agents, multimodal, system
│   └── services/                # Business logic separation
│
├── shared/                      # Core AI primitives & multi-provider engine
│   ├── providers/               # Multi-LLM provider abstraction (Groq, OpenAI, Anthropic, Cohere, Ollama...)
│   ├── agent.py                 # ReAct agent loop
│   ├── planner.py               # Multi-step task planner
│   ├── vector_store.py          # ChromaDB vector embedding engine
│   ├── mcp_client.py            # Model Context Protocol (MCP) tool client
│   ├── ingestion.py             # PDF, DOCX, TXT parsing & semantic chunking
│   └── tenant_context.py        # Multi-tenant isolation logic
│
├── tests/                       # Testing Pyramid
│   ├── conftest.py              # Pytest fixtures & mock environment setup
│   ├── unit/                    # Fast deterministic tests (zero API token cost)
│   ├── integration/             # FastAPI TestClient endpoint & UI smoke tests
│   └── eval/                    # Golden benchmark dataset & CI eval gate
│
├── ui/                          # Static Frontend SPA (HTML5, Modern CSS, JS)
├── docs/                        # Architecture diagrams, ADRs, and deployment guides
├── .github/workflows/
│   ├── ci.yml                   # Linting, formatting, type checking & test suite
│   └── eval.yml                 # Golden eval quality gate on push/PR
├── pyproject.toml               # Standards-based PEP 517/621 packaging & tooling config
├── Dockerfile                   # Multi-stage, non-root user, healthcheck CMD
├── docker-compose.yml           # Stateful container setup with persistent volumes
└── Makefile                     # Developer command shortcuts
```

---

## 🛠️ Developer CLI (`Makefile`)

| Command | Action |
|:---|:---|
| `make install` | Installs the project in editable mode (`pip install -e .[dev]`) and installs pre-commit hooks |
| `make dev` | Starts local FastAPI dev server with auto-reload at `localhost:8000` |
| `make test` | Runs the full test suite (`pytest tests -v`) |
| `make test-unit` | Runs fast unit tests without network calls (`pytest tests/unit -v`) |
| `make test-integration` | Runs API endpoint & middleware smoke tests (`pytest tests/integration -v`) |
| `make lint` | Runs Ruff linter and MyPy type checker |
| `make format` | Automatically formats all code using Ruff |
| `make docker-build` | Builds production multi-stage Docker container |
| `make docker-up` | Starts production container in background (`docker compose up -d`) |
| `make clean` | Removes bytecode, cache directories, and test artifacts |

---

## 🧪 Testing & Evaluation Strategy

1. **Deterministic Unit Tests**: Located in `tests/unit/`. These validate translation schemas, provider format conversions, and tenant isolation in-memory without making external network calls.
2. **Integration & Smoke Tests**: Located in `tests/integration/`. Uses FastAPI's `TestClient` to verify router behavior, rate-limiting, headers, and UI mounting.
3. **AI Quality Gate (Evaluation Harness)**: Located in `tests/eval/`. Runs golden test cases through the inference pipeline (`tests/eval/run_eval_ci.py`), enforcing a minimum 70% quality bar before deployment.

---

## 📚 12-Feature Curriculum Map

If you are following or referencing the progressive learning curriculum, features 1 through 12 are available in the weekly folders:

| Phase | Feature | Description | Production Module |
|:---|:---|:---|:---|
| **🧠 Brain** | **F1** Basic Chat | Single-turn LLM completions | `app/api/v1/endpoints/chat.py` |
| | **F2** Structured Outputs | JSON-mode schema validation | `app/schemas/chat.py` |
| | **F3** Conversation Memory | Session state & sliding-window context | `shared/session_store.py` |
| **📚 Knowledge** | **F4** Document Ingestion | PDF/DOCX/TXT upload & chunking | `shared/ingestion.py` |
| | **F5** Semantic Search | ChromaDB vector indexing | `shared/vector_store.py` |
| | **F6** Smart Router | Dynamic RAG vs LLM query routing | `shared/router.py` |
| **🤝 Hands** | **F7** ReAct Agent | Autonomous tool calling | `shared/agent.py` |
| | **F8** Multi-Step Agent | Plan-and-execute task runner | `shared/planner.py` |
| | **F9** MCP Integration | Model Context Protocol tools | `shared/mcp_client.py` |
| **🚀 Launch** | **F10** Multimodal AI | Speech-to-Text, TTS, Vision VLM | `app/api/v1/endpoints/multimodal.py` |
| | **F11** Observability | RequestID, JSON logs, Metrics, Evals | `app/core/`, `tests/eval/` |
| | **F12** Containerization | Multi-stage Docker, Compose, CI/CD | `Dockerfile`, `docker-compose.yml` |

---

## 🔒 Security & Deployment

* **Principle of Least Privilege**: The production Docker container executes under an unprivileged `appuser` (UID 1001).
* **Multi-Tenant Protection**: Strict tenant partitioning prevents data cross-contamination.
* **Secrets Management**: Read [docs/cloud-deployment-guide.md](docs/cloud-deployment-guide.md) for Infisical and Doppler vault integrations.
