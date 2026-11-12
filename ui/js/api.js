/**
 * AskRaggy Enterprise Platform - Centralized API & Networking Module
 */
import {
  state,
  VISITOR_SESSIONS_STORAGE_KEY,
  VISITOR_DOCS_STORAGE_KEY,
  VISITOR_DOCS_INIT_KEY,
  BYOK_STORAGE_KEY
} from "./state.js";
import { escapeHtml } from "./utils.js";

export const API_BASE = "";

// Centralized Request Headers with BYOK & Demo Persona
export function getAuthHeaders(extraHeaders = {}) {
  const headers = { "Content-Type": "application/json", ...extraHeaders };
  if (state.activeTenantId) {
    headers["X-Tenant-ID"] = state.activeTenantId;
  }
  const key = (state.activeByokKey || localStorage.getItem(BYOK_STORAGE_KEY) || "").trim();
  if (key) {
    headers["X-User-API-Key"] = key;
  }
  return headers;
}

/**
 * Render a high-visibility, friendly rate-limit notice in the chat when shared demo quota is reached.
 * @param {"chat"|"doc"|"agent"} containerType
 */


// Visitor Session Isolation Helpers
export function getVisitorSessionIds() {
  try {
    const raw = localStorage.getItem(VISITOR_SESSIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function recordVisitorSession(sessionId) {
  if (!sessionId) return;
  try {
    const ids = getVisitorSessionIds();
    if (!ids.includes(sessionId)) {
      ids.unshift(sessionId);
      localStorage.setItem(VISITOR_SESSIONS_STORAGE_KEY, JSON.stringify(ids.slice(0, 50)));
    }
  } catch {}
}

export function removeVisitorSession(sessionId) {
  if (!sessionId) return;
  try {
    const ids = getVisitorSessionIds().filter((id) => id !== sessionId);
    localStorage.setItem(VISITOR_SESSIONS_STORAGE_KEY, JSON.stringify(ids));
  } catch {}
}

// Visitor Document Isolation Helpers (isolates uploaded files to this computer/browser)
export function getVisitorDocIds() {
  try {
    const raw = localStorage.getItem(VISITOR_DOCS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function recordVisitorDoc(docId) {
  if (!docId) return;
  try {
    const ids = getVisitorDocIds();
    if (!ids.includes(docId)) {
      ids.unshift(docId);
      localStorage.setItem(VISITOR_DOCS_STORAGE_KEY, JSON.stringify(ids.slice(0, 100)));
    }
  } catch {}
}

export function removeVisitorDoc(docId) {
  if (!docId) return;
  try {
    const ids = getVisitorDocIds().filter((id) => id !== docId);
    localStorage.setItem(VISITOR_DOCS_STORAGE_KEY, JSON.stringify(ids));
  } catch {}
}

export function isVisitorDocsInitialized() {
  try {
    return localStorage.getItem(VISITOR_DOCS_INIT_KEY) === "true";
  } catch {
    return false;
  }
}

export function markVisitorDocsInitialized() {
  try {
    localStorage.setItem(VISITOR_DOCS_INIT_KEY, "true");
  } catch {}
}



// Provider Info Card & Domain Metadata
export async function loadProviderInfo() {
  const card = document.getElementById("provider-info-card");
  if (!card) return;

  try {
    const res = await fetch(`${API_BASE}/api/provider-info`);
    if (!res.ok) throw new Error("endpoint not available yet");

    const info = await res.json();
    if (info.domain_name || info.assistant_name) {
      state.currentDomainName = info.domain_name || info.assistant_name;
      const domainDisplay = document.getElementById("welcome-domain-display");
      if (domainDisplay) {
        domainDisplay.textContent = state.currentDomainName;
      }
      const domainDesc = document.getElementById("welcome-domain-desc");
      if (domainDesc) {
        domainDesc.textContent = state.currentDomainName;
      }
      const agentDomainDisplay = document.getElementById("agent-domain-display");
      if (agentDomainDisplay) {
        agentDomainDisplay.textContent = state.currentDomainName;
      }
      const headerDomainDisplay = document.getElementById("header-domain-display");
      if (headerDomainDisplay) {
        headerDomainDisplay.textContent = state.currentDomainName;
      }
    }

    card.innerHTML = `
      <span>Domain: <strong class="domain-info-badge">${escapeHtml(state.currentDomainName)}</strong></span>
      <span>LLM Provider: <span class="badge">${info.llm_provider ?? "—"}</span></span>
      <span>Model: <code>${info.llm_model ?? "—"}</code></span>
      ${info.voice_provider ? `<span>Voice: <span class="badge">${info.voice_provider}</span> (${info.voice_model ?? "—"})</span>` : ""}
    `;
  } catch {
    card.innerHTML = `<span style="color:var(--color-pistache)">Provider info not available — server may not be running yet.</span>`;
  }
}

loadProviderInfo();


