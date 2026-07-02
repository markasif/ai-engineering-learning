# Feature 11: Docker + Deployment

**Week 4 · Launch — Feature 11 of 12**

Your assistant moves from `localhost:8000` to a real URL. You'll containerize the app with Docker so it runs identically in any environment, then deploy it to the cloud.

---

## New Concepts

| Concept | What it means |
|---|---|
| **Docker** | Packages your app + all dependencies into a self-contained container |
| **Dockerfile** | The recipe that tells Docker how to build your container image |
| **docker-compose** | Orchestrates multi-container apps (app + vector DB + other services) |
| **Container registry** | Where container images are stored (Docker Hub, GitHub Container Registry) |
| **Cloud deployment** | Running your container on a remote server accessible via a public URL |
| **Environment secrets** | API keys injected at runtime — never baked into the container image |

---

## New Files

```
Dockerfile                    ← multi-stage build: base → deps → app
docker-compose.yml            ← local dev: app + optional vector DB
.dockerignore                 ← excludes venv, .env, __pycache__, data/
```

---

## Your Task

1. Review the `Dockerfile` and understand each stage
2. Build the image: `docker build -t my-ai-assistant .`
3. Run it locally: `docker run -p 8000:8000 --env-file .env my-ai-assistant`
4. Verify `http://localhost:8000` still works — same app, now containerized
5. Push to a registry and deploy to a cloud provider (Railway, Render, or Fly.io recommended — all have free tiers and support Docker)
6. Set your production `.env` secrets in the cloud provider's dashboard

---

## Deployment Options

| Provider | Free tier | Setup time | Notes |
|---|---|---|---|
| **Railway** | 500 hrs/month | ~5 min | `railway up` — simplest for beginners |
| **Render** | 750 hrs/month | ~10 min | connects to GitHub, auto-deploys on push |
| **Fly.io** | 3 shared VMs | ~15 min | `fly deploy` — more control, easy secrets |
| **AWS/GCP/Azure** | varies | 30–60 min | production-grade but more complex setup |

---

> **Coming next:** Feature 12 — Production polish: rate limiting, health checks, eval harness, and monitoring.
