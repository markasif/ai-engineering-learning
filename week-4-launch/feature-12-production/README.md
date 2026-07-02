# Feature 12: Production Polish

**Week 4 · Launch — Feature 12 of 12 · Course Complete**

The final feature turns your working prototype into a production-ready service. You add the safety nets, measurement tools, and operational guardrails that separate a demo from something you'd trust with real users.

---

## New Concepts

| Concept | What it means |
|---|---|
| **Rate limiting** | Cap how many requests a user can make per minute — prevents abuse and runaway costs |
| **Health check** | `GET /health` returns "I'm alive" — lets load balancers and monitoring detect outages |
| **Eval harness** | Automated test suite with known-correct Q&A pairs — measures if your AI is actually working |
| **NFR (Non-Functional Requirement)** | Requirements about HOW the system behaves: speed, reliability, security — not WHAT it does |
| **Structured logging** | Machine-readable log lines (JSON) that monitoring tools can query and alert on |
| **CORS** | Controls which domains can call your API from a browser — required for production frontends |

---

## New Endpoints + Middleware

```
GET  /api/health            → {status: "ok", version: "...", uptime: ...}
GET  /api/metrics           → request counts, error rates, average latency
POST /api/eval/run          → run the eval harness; returns pass/fail per question
GET  /api/eval/results      → last eval run results
```

Middleware added:
- Rate limiter (`slowapi`) — configurable via `RATE_LIMIT_PER_MINUTE` in `.env`
- CORS headers — configurable via `ALLOWED_ORIGINS` in `.env`
- Request ID injection — every request gets a UUID for log correlation
- Structured logging — all events logged as JSON

---

## Your Task

1. Review the eval harness (`shared/eval_harness.py`) and its sample Q&A pairs
2. Run `POST /api/eval/run` — see which questions your current assistant gets right
3. Update the system prompt or RAG configuration to improve the weak answers
4. Re-run eval to confirm improvement
5. Verify the rate limiter works: send 61 requests in a minute, the 61st should get 429
6. Check `GET /api/health` — wire this into your cloud provider's health check URL
7. Review your production deployment checklist below

---

## Production Checklist

Before sharing your URL publicly:

- [ ] All API keys are in the cloud provider's secrets/env panel — NOT in the Docker image
- [ ] `GET /api/health` is configured as the health check URL in your cloud provider
- [ ] Rate limiting is enabled (`RATE_LIMIT_PER_MINUTE` is set)
- [ ] CORS is configured to allow only your frontend's domain
- [ ] You've run the eval harness and documented the baseline score
- [ ] Vector DB data is either persisted (volume mount) or re-ingestable from source files
- [ ] You've tested with a real user who hasn't seen the app before

---

## Week 4 Complete — Course Complete

| Feature | What you built |
|---|---|
| Feature 10 | Voice (STT/TTS) + Vision (VLM) — multimodal input/output |
| Feature 11 | Docker containerization + cloud deployment |
| Feature 12 | Rate limiting, health checks, eval harness, structured logging |

**Full system:** Your domain-specific AI assistant can now chat, retrieve from documents, use tools via MCP, plan multi-step tasks, speak and listen, and is deployed at a real URL with production guardrails.

**What's next:**
- Add more domain MCP tools to `shared/domain_mcp_server.py`
- Extend the eval harness with more domain-specific Q&A pairs
- Explore multi-agent orchestration using LangGraph or Google ADK
- Share your project in `docs/student-projects.md`

**Congratulations — you've shipped a production AI assistant.**
