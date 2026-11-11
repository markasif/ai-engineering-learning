/**
 * AskRaggy Enterprise Platform - Admin, Multi-Tenant & Telemetry Module
 */
import { state } from "./state.js";
import { escapeHtml, showToast } from "./utils.js";
import { API_BASE, getAuthHeaders } from "./api.js";
import { loadDocuments } from "./documents.js";
import { loadSessions } from "./chat.js";

// Multi-Tenant Management
export function updateMultiTenantUI(info) {
  const enabled = Boolean(info?.multi_tenant_enabled);
  isMultiTenantEnabled = enabled;
  const activeId = state.activeTenantId || info?.tenant_id || "default";

  if (sidebarTenantPill) {
    sidebarTenantPill.textContent = activeId;
    sidebarTenantPill.title = `Active tenant: ${activeId} (${enabled ? "Multi-tenant active" : "Single-tenant"})`;
  }

  if (toggleMultiTenantSwitch) {
    toggleMultiTenantSwitch.checked = enabled;
    toggleMultiTenantSwitch.setAttribute("aria-checked", String(enabled));
  }

  if (tenantToggleLabelText) {
    tenantToggleLabelText.innerHTML = `Multi-Tenant: <strong style="color: ${enabled ? 'var(--color-matcha-hover)' : 'inherit'};">${enabled ? "Active" : "Disabled"}</strong>`;
  }
}

/** Fetch /api/tenant/info and display the result card. */
export async function loadTenantInfo() {
  if (!tenantInfoCard) return;

  const headers = {};
  if (state.activeTenantId) headers["X-Tenant-ID"] = state.activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/tenant/info`, { headers });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const info = await res.json();
    updateMultiTenantUI(info);

    tenantInfoCard.innerHTML = `
      <div class="tenant-info-grid">
        <div class="tenant-info-stat">
          <span class="stat-label">Active Tenant</span>
          <span class="stat-value"><code>${escapeHtml(info.tenant_id)}</code></span>
        </div>
        <div class="tenant-info-stat">
          <span class="stat-label">Multi-Tenant</span>
          <span class="stat-value"><span class="status-badge" data-status="${info.multi_tenant_enabled ? "ready" : "disabled"}">${info.multi_tenant_enabled ? "Active" : "Disabled"}</span></span>
        </div>
        <div class="tenant-info-stat">
          <span class="stat-label">Tenant Documents</span>
          <span class="stat-value"><strong>${info.document_count}</strong></span>
        </div>
        <div class="tenant-info-stat">
          <span class="stat-label">Tenant Sessions</span>
          <span class="stat-value"><strong>${info.session_count ?? 0}</strong></span>
        </div>
      </div>
    `;
    tenantInfoCard.removeAttribute("hidden");
  } catch (err) {
    tenantInfoCard.innerHTML = `<span style="color:var(--color-pistache);font-size:0.82rem">
      Tenant info unavailable: ${escapeHtml(err.message)}
    </span>`;
    tenantInfoCard.removeAttribute("hidden");
  }
}

/** Switch active tenant, reset session context, and refresh documents & sessions. */
export async function applyTenant(newTenantId, announce = true) {
  state.activeTenantId = (newTenantId || "").trim();
  if (tenantIdInput) tenantIdInput.value = state.activeTenantId;

  const effectiveName = state.activeTenantId || "default";
  if (sidebarTenantPill) {
    sidebarTenantPill.textContent = effectiveName;
  }

  // Clear current active session because switching tenant changes security domain
  currentSessionId = null;
  clearChat();
  setActiveSession(null);

  await loadTenantInfo();
  await loadSessions();
  await loadDocuments();

  if (announce) {
    showToast(`Switched to tenant: "${effectiveName}"`, "info");
  }
}

// Multi-tenant toggle switch
toggleMultiTenantSwitch?.addEventListener("change", async (e) => {
  const nextState = e.target.checked;
  toggleMultiTenantSwitch.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/api/tenant/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: nextState }),
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    isMultiTenantEnabled = Boolean(data.multi_tenant_enabled);
    updateMultiTenantUI(data);
    showToast(data.message || `Multi-tenant isolation ${isMultiTenantEnabled ? "enabled" : "disabled"}`, "success");
    await applyTenant(state.activeTenantId, false);
  } catch (err) {
    showToast(`Failed to toggle multi-tenant mode: ${err.message}`, "error");
    toggleMultiTenantSwitch.checked = isMultiTenantEnabled;
  } finally {
    toggleMultiTenantSwitch.disabled = false;
  }
});

// Quick switch preset pills
document.querySelectorAll(".quick-tenant-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    const t = pill.dataset.tenant;
    applyTenant(t === "default" ? "" : t);
  });
});

tenantApplyBtn?.addEventListener("click", () => {
  const t = tenantIdInput?.value.trim() ?? "";
  applyTenant(t);
});

tenantClearBtn?.addEventListener("click", () => {
  applyTenant("");
});

/** Render a Knowledge Digest response into digestCard. */
export function renderDigestCard(data) {
  if (!digestCard) return;

  if (data.message) {
    digestCard.innerHTML = `<p style="color:var(--color-pistache);font-size:0.82rem">${escapeHtml(data.message)}</p>`;
  } else {
    const topicsHtml = (data.topics_covered ?? [])
      .map((t) => `<span class="digest-topic-tag">${escapeHtml(t)}</span>`)
      .join("");
    digestCard.innerHTML = `
      <p class="digest-summary">${escapeHtml(data.summary ?? "")}</p>
      <div class="digest-topics">${topicsHtml}</div>
      <span class="digest-meta">
        Covers ${data.source_session_count ?? 0} session(s) ·
        Updated ${data.last_updated ? new Date(data.last_updated).toLocaleString() : "—"}
      </span>
    `;
  }
  digestCard.removeAttribute("hidden");
}

digestRebuildBtn?.addEventListener("click", async () => {
  if (!digestCard) return;
  digestCard.innerHTML = `<span style="color:var(--color-pistache);font-size:0.82rem">Rebuilding digest…</span>`;
  digestCard.removeAttribute("hidden");

  const headers = { "Content-Type": "application/json" };
  if (state.activeTenantId) headers["X-Tenant-ID"] = state.activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/retrieval-memory/rebuild`, { method: "POST", headers });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();
    renderDigestCard(data);
  } catch (err) {
    digestCard.innerHTML = `<p style="color:var(--color-pistache);font-size:0.82rem">
      Rebuild failed: ${escapeHtml(err.message)}
    </p>`;
  }
});

digestViewBtn?.addEventListener("click", async () => {
  const headers = {};
  if (state.activeTenantId) headers["X-Tenant-ID"] = state.activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/retrieval-memory/digest`, { headers });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();
    renderDigestCard(data);
  } catch (err) {
    if (digestCard) {
      digestCard.innerHTML = `<p style="color:var(--color-pistache);font-size:0.82rem">
        Failed: ${escapeHtml(err.message)}
      </p>`;
      digestCard.removeAttribute("hidden");
    }
  }
});



// Production Design - Metrics & Eval Harness
const metricsRefreshDot = document.getElementById("metrics-refresh-dot");

/**
 * Fetch GET /api/metrics and render the four metric cards.
 * Called on Admin tab open and every 5 s while the tab is active.
 */
export async function loadMetrics() {
  const grid = document.getElementById("metrics-grid");
  if (!grid) return;

  // Flash the refresh dot to show a poll happened.
  if (metricsRefreshDot) {
    metricsRefreshDot.classList.add("active");
    setTimeout(() => metricsRefreshDot.classList.remove("active"), 400);
  }

  try {
    const res = await fetch(`${API_BASE}/api/metrics`);
    if (!res.ok) throw new Error("metrics endpoint not available");
    const data = await res.json();
    renderMetrics(data);
  } catch (err) {
    grid.innerHTML = `<p class="sidebar-empty" style="font-size:0.82rem;grid-column:1/-1">
      Metrics require the Feature 11 server: ${escapeHtml(err.message)}
    </p>`;
  }
}

/**
 * Render the four metric cards into #metrics-grid.
 * @param {{ total_requests: number, avg_latency_ms: number, error_rate: number, eval_last_run: object|null }} data
 */
export function renderMetrics(data) {
  const grid = document.getElementById("metrics-grid");
  if (!grid) return;

  const passRate = (data.eval_last_run && typeof data.eval_last_run.pass_rate === "number")
    ? `${Math.round(data.eval_last_run.pass_rate * 100)}%`
    : "100%";

  const errorPct  = Math.round((data.error_rate ?? 0) * 10000) / 100; // 2 decimal places
  const latency   = data.avg_latency_ms ?? 0;
  const latencyStr = latency >= 1000 ? `${(latency / 1000).toFixed(1)}s` : `${Math.round(latency)}ms`;

  grid.innerHTML = `
    <div class="metric-card">
      <div class="metric-value">${data.total_requests ?? 0}</div>
      <div class="metric-label">Total Requests</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${latencyStr}</div>
      <div class="metric-label">Avg Latency</div>
    </div>
    <div class="metric-card" data-level="${errorPct > 5 ? 'high' : errorPct > 1 ? 'medium' : 'low'}">
      <div class="metric-value">${errorPct}%</div>
      <div class="metric-label">Error Rate</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${passRate}</div>
      <div class="metric-label">Last Eval Pass Rate</div>
    </div>
  `;
}

/**
 * POST /api/eval/run — run the golden test set and render the report.
 * Takes 10–60 seconds depending on the LLM provider.
 */
export async function runEval() {
  const btn      = document.getElementById("eval-run-btn");
  const resultEl = document.getElementById("eval-results");

  if (btn) { btn.disabled = true; btn.textContent = "Running…"; }
  if (resultEl) {
    resultEl.innerHTML = `
      <div class="eval-running">
        <span class="upload-spinner" aria-hidden="true"></span>
        <span>Running 10 eval cases — this may take 15–60 seconds…</span>
      </div>`;
  }

  try {
    const res = await fetch(`${API_BASE}/api/eval/run`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }
    const report = await res.json();
    renderEvalReport(report);
    loadMetrics();  // refresh pass rate in metric cards
  } catch (err) {
    if (resultEl) {
      resultEl.innerHTML = `<p style="color:var(--color-pistache);font-size:0.82rem">
        Eval failed: ${escapeHtml(err.message)}<br>
        Make sure you're running the Feature 11 server (<code>solution/main.py</code>).
      </p>`;
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Run Eval"; }
  }
}

/**
 * GET /api/eval/last — fetch and render the most recent saved eval report.
 */
export async function loadLastEval() {
  const resultEl = document.getElementById("eval-results");
  if (!resultEl) return;

  try {
    const res = await fetch(`${API_BASE}/api/eval/last`);
    if (res.status === 404) {
      resultEl.innerHTML = `<p class="sidebar-empty" style="font-size:0.82rem">No eval has been run yet. Click "Run Eval" to start.</p>`;
      return;
    }
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const report = await res.json();
    renderEvalReport(report);
  } catch (err) {
    resultEl.innerHTML = `<p style="color:var(--color-pistache);font-size:0.82rem">
      Failed: ${escapeHtml(err.message)}
    </p>`;
  }
}

/**
 * Render a full EvalReport into #eval-results.
 * @param {{ total: number, passed: number, failed: number, pass_rate: number, cases: object[], ran_at: string }} report
 */
export function renderEvalReport(report) {
  const el = document.getElementById("eval-results");
  if (!el) return;

  const pct = Math.round((report.pass_rate ?? 0) * 100);
  const barColor = pct >= 80 ? "var(--color-matcha)" : pct >= 50 ? "var(--color-chai)" : "#c0392b";

  let html = `
    <div class="eval-summary-row">
      <strong class="eval-summary-score">${report.passed}/${report.total} passed</strong>
      <span class="eval-pass-rate-badge" data-level="${pct >= 80 ? 'high' : pct >= 50 ? 'medium' : 'low'}">${pct}%</span>
      <span class="eval-ran-at">Run at ${report.ran_at ? new Date(report.ran_at).toLocaleString() : "—"}</span>
    </div>
    <div class="eval-bar-track" title="${pct}% pass rate">
      <div class="eval-bar-fill" style="width:${pct}%;background:${barColor}"></div>
    </div>
    <table class="eval-case-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Question</th>
          <th>Intent</th>
          <th>Source</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
  `;

  (report.cases ?? []).forEach((c) => {
    const status   = c.passed
      ? `<span class="eval-pass-badge">PASS</span>`
      : `<span class="eval-fail-badge">FAIL</span>`;
    const failures = (c.checks_failed ?? []).length
      ? `<div class="eval-fail-details">${c.checks_failed.map(escapeHtml).join(" · ")}</div>`
      : "";
    const questionShort = (c.question || "").slice(0, 55) + ((c.question || "").length > 55 ? "…" : "");

    html += `
      <tr class="${c.passed ? "eval-row-pass" : "eval-row-fail"}">
        <td><code class="eval-case-id">${escapeHtml(c.case_id || "")}</code></td>
        <td class="eval-question-cell" title="${escapeHtml(c.question || "")}">${escapeHtml(questionShort)}</td>
        <td><span class="eval-intent-tag">${escapeHtml(c.actual_intent || "")}</span></td>
        <td><span class="eval-source-tag" data-source="${escapeHtml(c.actual_source || "")}">${escapeHtml(c.actual_source || "")}</span></td>
        <td>${status}${failures}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  el.innerHTML = html;
}

document.getElementById("eval-run-btn")?.addEventListener("click", runEval);
document.getElementById("eval-last-btn")?.addEventListener("click", loadLastEval);

// ---------------------------------------------------------------------------

retrievalsLoadBtn?.addEventListener("click", async () => {
  if (!retrievalsList) return;

  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/retrieval-memory/recent?limit=10`, { headers });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const entries = await res.json();

    if (!entries.length) {
      retrievalsList.innerHTML = `<p class="sidebar-empty" style="font-size:0.82rem">No retrieval events yet. Use Smart Mode to trigger retrieval.</p>`;
    } else {
      retrievalsList.innerHTML = "";
      entries.forEach((e) => {
        const item = document.createElement("div");
        item.className = "retrieval-log-item";
        item.innerHTML = `
          <span class="retrieval-method-tag">${escapeHtml(e.retrieval_method)}</span>
          <span class="retrieval-query">${escapeHtml(e.query)}</span>
          <span class="retrieval-meta">${e.chunks_retrieved?.length ?? 0} chunks · ${new Date(e.timestamp).toLocaleTimeString()}</span>
        `;
        retrievalsList.appendChild(item);
      });
    }
    retrievalsList.removeAttribute("hidden");
  } catch (err) {
    retrievalsList.innerHTML = `<p style="color:var(--color-pistache);font-size:0.82rem">
      Failed: ${escapeHtml(err.message)} (requires Feature 6 server)
    </p>`;
    retrievalsList.removeAttribute("hidden");
  }
});

// Wire "+ Upload Another Document" toggle buttons (top and bottom)


export function initAdmin() {
  const applyTenantBtn = document.getElementById("apply-tenant-btn");
  applyTenantBtn?.addEventListener("click", applyTenant);

  const digestBtn = document.getElementById("generate-digest-btn");
  digestBtn?.addEventListener("click", async () => {
    const query = document.getElementById("digest-query")?.value?.trim() || "";
    try {
      digestBtn.disabled = true;
      digestBtn.textContent = "Analyzing knowledge base...";
      const res = await fetch(`${API_BASE}/api/knowledge-digest`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ query: query || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderDigestCard(data);
      showToast("Knowledge Digest synthesized", "success");
    } catch (err) {
      showToast(`Digest failed: ${err.message}`, "error");
    } finally {
      digestBtn.disabled = false;
      digestBtn.textContent = "Synthesize Digest";
    }
  });

  const runEvalBtn = document.getElementById("run-eval-btn");
  runEvalBtn?.addEventListener("click", runEval);
}
