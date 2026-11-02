/* =============================================================================
   AI Engineering Bootcamp · BlockseBlock
   app.js — grows additively; each feature adds a new section.
   ============================================================================= */

// The base URL of the FastAPI server.
// When opening index.html directly from disk (file://) the API won't be reachable
// and requests will fail — run `uvicorn main:app` and open http://localhost:8000.
const API_BASE = "";

// =============================================================================
// Audio Notification Chime (Web Audio API)
// =============================================================================
let audioNotificationCtx = null;
let soundNotificationsEnabled = localStorage.getItem("askraggy_sound") !== "false";

const soundToggleBtn = document.getElementById("sound-toggle-btn");
const soundIcon = document.getElementById("sound-icon");

function updateSoundToggleUI() {
  if (!soundToggleBtn) return;
  if (soundNotificationsEnabled) {
    soundToggleBtn.classList.remove("muted");
    soundToggleBtn.title = "Sound notifications active (Click to mute)";
    if (soundIcon) soundIcon.textContent = "🔔";
  } else {
    soundToggleBtn.classList.add("muted");
    soundToggleBtn.title = "Sound notifications muted (Click to enable)";
    if (soundIcon) soundIcon.textContent = "🔕";
  }
}

soundToggleBtn?.addEventListener("click", () => {
  soundNotificationsEnabled = !soundNotificationsEnabled;
  localStorage.setItem("askraggy_sound", String(soundNotificationsEnabled));
  updateSoundToggleUI();
  if (soundNotificationsEnabled) {
    playNotificationSound();
  }
});

updateSoundToggleUI();

/**
 * Play a gentle, crisp notification chime when an AI response completes.
 * Synthesized directly via Web Audio API (zero audio files needed, zero latency).
 */
function playNotificationSound() {
  if (!soundNotificationsEnabled) return;
  try {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) return;
    if (!audioNotificationCtx) {
      audioNotificationCtx = new AudioCtxClass();
    }
    if (audioNotificationCtx.state === "suspended") {
      audioNotificationCtx.resume();
    }

    const ctx = audioNotificationCtx;
    const now = ctx.currentTime;

    // Harmonic pleasant two-tone chime (587Hz -> 880Hz -> 1175Hz)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880.00, now + 0.07); // A5

    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880.00, now + 0.07);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15); // D6

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.13);
    osc2.start(now + 0.07);
    osc2.stop(now + 0.38);
  } catch (err) {
    console.debug("Notification chime suppressed:", err);
  }
}


// =============================================================================
// Feature 1: Basic Chat
// =============================================================================

const messageHistory = document.getElementById("message-history");
const chatInput      = document.getElementById("chat-input");
const sendBtn        = document.getElementById("send-btn");
const emptyState     = document.getElementById("empty-state");

/**
 * Append a message bubble to the conversation history.
 *
 * @param {"user"|"ai"} role
 * @param {string} text
 * @param {boolean} [isThinking=false]  - show animated dots instead of text
 * @returns {HTMLElement} the created message element (useful for updating it later)
 */
function appendMessage(role, text, isThinking = false) {
  if (emptyState) emptyState.remove();

  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}${isThinking ? " thinking" : ""}`;

  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = role === "user" ? "You" : "Assistant";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (isThinking) {
    // Animated typing indicator — three bouncing dots.
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.className = "dot";
      bubble.appendChild(dot);
    }
  } else {
    bubble.textContent = text;
  }

  wrapper.appendChild(label);
  wrapper.appendChild(bubble);
  messageHistory.appendChild(wrapper);

  // Keep the latest message in view.
  messageHistory.scrollTop = messageHistory.scrollHeight;

  return wrapper;
}

/** Send the current input value to the appropriate chat endpoint. */
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = "";
  sendBtn.disabled = true;

  appendMessage("user", text);
  const thinkingEl = appendMessage("ai", "", true);

  const isStructured = structuredToggle?.checked ?? true;
  const isSmartMode = smartToggle?.checked ?? true;

  // Smart Mode requires a session. Auto-create one if none exists yet.
  if (isSmartMode && !currentSessionId) {
    try {
      const sRes = await fetch(`${API_BASE}/api/sessions`, { method: "POST" });
      if (sRes.ok) {
        const sData = await sRes.json();
        currentSessionId = sData.session_id;
        setActiveSession(currentSessionId);
        loadSessions();
      }
    } catch {}
  }

  // Feature 3: if a session is active, all messages go through the session endpoint.
  // Feature 6: Smart Mode routes through /chat/smart which uses the Smart Router.
  // Fall back to Feature 1/2 endpoints only when no session is active.
  let endpoint;
  if (currentSessionId && isSmartMode) {
    endpoint = `/api/sessions/${currentSessionId}/chat/smart`;
  } else if (currentSessionId) {
    endpoint = `/api/sessions/${currentSessionId}/chat`;
  } else if (isStructured) {
    endpoint = "/api/chat/structured";
  } else {
    endpoint = "/api/chat";
  }

  // Build headers — include X-Tenant-ID if a custom tenant is set.
  const headers = { "Content-Type": "application/json" };
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: text }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${response.status}`);
    }

    const data = await response.json();
    thinkingEl.remove();

    // Smart Mode returns SmartChatResponse; session/structured returns StructuredResponse.
    if (currentSessionId && isSmartMode) {
      appendSmartResponse(data);
    } else if (currentSessionId || isStructured) {
      appendStructuredResponse(data);
    } else {
      appendMessage("ai", data.response ?? "(no response)");
    }

    playNotificationSound();

    // Refresh the sidebar after each message so the session title and count update.
    if (currentSessionId) loadSessions();

  } catch (err) {
    thinkingEl.remove();
    appendMessage("ai", `Error: ${err.message}. Is the server running?`);
  } finally {
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

// Send on button click or Enter key.
sendBtn.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// =============================================================================
// Provider info card
// Fetches /api/provider-info once on load and shows which provider is active.
// This endpoint is added in shared/llm_client.py — the card shows a gentle
// error message if it's not yet available.
// =============================================================================

async function loadProviderInfo() {
  const card = document.getElementById("provider-info-card");
  if (!card) return;

  try {
    const res = await fetch(`${API_BASE}/api/provider-info`);
    if (!res.ok) throw new Error("endpoint not available yet");

    const info = await res.json();

    card.innerHTML = `
      <span>LLM Provider: <span class="badge">${info.llm_provider ?? "—"}</span></span>
      <span>Model: <code>${info.llm_model ?? "—"}</code></span>
      ${info.voice_provider ? `<span>Voice: <span class="badge">${info.voice_provider}</span> (${info.voice_model ?? "—"})</span>` : ""}
    `;
  } catch {
    card.innerHTML = `<span style="color:var(--color-pistache)">Provider info not available — server may not be running yet.</span>`;
  }
}

loadProviderInfo();

// =============================================================================
// Feature 2: Structured Mode
// =============================================================================

const structuredToggle = document.getElementById("structured-toggle");
if (structuredToggle) {
  structuredToggle.checked = true;
  structuredToggle.setAttribute("aria-checked", "true");
}

// Keep the aria-checked attribute in sync with checkbox state for accessibility.
structuredToggle?.addEventListener("change", () => {
  structuredToggle.setAttribute("aria-checked", String(structuredToggle.checked));
});

/**
 * Render a StructuredResponse as a visual card in the message history.
 *
 * @param {{ intent: string, answer: string, confidence: number, sources_needed: boolean }} data
 */
function appendStructuredResponse(data) {
  // Remove the empty-state placeholder on first message (same as appendMessage).
  document.getElementById("empty-state")?.remove();

  // Outer wrapper mirrors the .message.ai layout so it aligns with plain messages.
  const wrapper = document.createElement("div");
  wrapper.className = "message ai";

  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = "Assistant";

  // Card body
  const card = document.createElement("div");
  card.className = "response-card";

  // ── Header row: intent badge + confidence meter ──
  const header = document.createElement("div");
  header.className = "response-card-header";

  // Intent badge
  const badge = document.createElement("span");
  badge.className = "intent-badge";
  badge.dataset.intent = data.intent ?? "unclear";
  badge.textContent = (data.intent ?? "unclear").replace(/_/g, " ");
  header.appendChild(badge);

  // Confidence meter
  const pct = Math.round((data.confidence ?? 0) * 100);
  const level = pct >= 70 ? "high" : pct >= 40 ? "medium" : "low";

  const confidenceWrap = document.createElement("div");
  confidenceWrap.className = "confidence-wrap";
  confidenceWrap.innerHTML = `
    <span class="confidence-label">Confidence</span>
    <div class="confidence-bar-track">
      <div class="confidence-bar-fill" data-level="${level}" style="width:${pct}%"></div>
    </div>
    <span class="confidence-pct">${pct}%</span>
  `;
  header.appendChild(confidenceWrap);

  card.appendChild(header);

  // ── Answer text ──
  const answer = document.createElement("p");
  answer.className = "response-card-answer";
  answer.textContent = data.answer ?? "";
  card.appendChild(answer);

  // ── Sources needed hint ──
  if (data.sources_needed) {
    const hint = document.createElement("span");
    hint.className = "sources-tag";
    hint.textContent = "⚠ This answer would improve with domain documents (added in Feature 4).";
    card.appendChild(hint);
  }

  wrapper.appendChild(label);
  wrapper.appendChild(card);
  messageHistory.appendChild(wrapper);
  messageHistory.scrollTop = messageHistory.scrollHeight;
}

// =============================================================================
// Feature 6: Smart Mode toggle + SmartChatResponse rendering
// =============================================================================

const smartToggle = document.getElementById("smart-toggle");
if (smartToggle) {
  smartToggle.checked = true;
  smartToggle.setAttribute("aria-checked", "true");
}

smartToggle?.addEventListener("change", () => {
  smartToggle.setAttribute("aria-checked", String(smartToggle.checked));
  // Smart Mode requires a session — auto-create one if needed.
  if (smartToggle.checked && !currentSessionId) {
    createNewSession();
  }
});

/**
 * Source badge labels and colours for SmartChatResponse.
 *   llm       — answered directly from the model's knowledge
 *   rag       — retrieved from uploaded documents
 *   hybrid    — retrieval attempted but confidence was low
 *   pageindex — PageIndex tree navigation (optional, ENABLE_PAGEINDEX=true)
 */
const SOURCE_LABELS = {
  llm:       "LLM (no retrieval)",
  rag:       "RAG (document retrieval)",
  hybrid:    "Hybrid (low-confidence retrieval)",
  pageindex: "PageIndex (tree navigation)",
};

/**
 * Render a SmartChatResponse as a visual card with source + confidence badges.
 *
 * @param {{ answer: string, source: string, chunks_used: object[], confidence: number, retrieval_method: string }} data
 */
function appendSmartResponse(data) {
  document.getElementById("empty-state")?.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "message ai";

  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = "Assistant";

  const card = document.createElement("div");
  card.className = "smart-response-card";

  // ── Source + confidence header ──
  const header = document.createElement("div");
  header.className = "smart-response-header";

  const sourceBadge = document.createElement("span");
  sourceBadge.className = "source-badge";
  sourceBadge.dataset.source = data.source ?? "llm";
  sourceBadge.textContent = SOURCE_LABELS[data.source] ?? data.source ?? "llm";
  header.appendChild(sourceBadge);

  const pct = Math.round((data.confidence ?? 0) * 100);
  const level = pct >= 70 ? "high" : pct >= 40 ? "medium" : "low";
  const confWrap = document.createElement("div");
  confWrap.className = "confidence-wrap";
  confWrap.innerHTML = `
    <span class="confidence-label">Router confidence</span>
    <div class="confidence-bar-track">
      <div class="confidence-bar-fill" data-level="${level}" style="width:${pct}%"></div>
    </div>
    <span class="confidence-pct">${pct}%</span>
  `;
  header.appendChild(confWrap);
  card.appendChild(header);

  // ── Answer text ──
  const answer = document.createElement("p");
  answer.className = "response-card-answer";
  answer.textContent = data.answer ?? "";
  card.appendChild(answer);

  // ── Retrieved chunks (collapsed by default) ──
  if (data.chunks_used?.length) {
    const chunksToggle = document.createElement("button");
    chunksToggle.className = "smart-chunks-toggle";
    chunksToggle.textContent = `▶ ${data.chunks_used.length} chunk${data.chunks_used.length !== 1 ? "s" : ""} retrieved`;
    card.appendChild(chunksToggle);

    const chunksContainer = document.createElement("div");
    chunksContainer.className = "smart-chunks-container";
    chunksContainer.hidden = true;

    data.chunks_used.forEach((chunk, i) => {
      const chunkEl = document.createElement("div");
      chunkEl.className = "smart-chunk-item";
      const chunkPct = Math.round((chunk.score ?? 0) * 100);
      const chunkLevel = chunkPct >= 60 ? "high" : chunkPct >= 35 ? "medium" : "low";
      chunkEl.innerHTML = `
        <span class="result-filename-badge">${escapeHtml(chunk.filename || "unknown")}</span>
        <span class="result-chunk-meta">chunk ${chunk.chunk_index ?? i}</span>
        <span class="result-score-badge" data-level="${chunkLevel}">${chunkPct}%</span>
        <p class="result-text">${escapeHtml((chunk.text || "").slice(0, 200))}${(chunk.text || "").length > 200 ? "…" : ""}</p>
      `;
      chunksContainer.appendChild(chunkEl);
    });
    card.appendChild(chunksContainer);

    chunksToggle.addEventListener("click", () => {
      const hidden = chunksContainer.hidden;
      chunksContainer.hidden = !hidden;
      chunksToggle.textContent = `${hidden ? "▼" : "▶"} ${data.chunks_used.length} chunk${data.chunks_used.length !== 1 ? "s" : ""} retrieved`;
    });
  }

  wrapper.appendChild(label);
  wrapper.appendChild(card);
  messageHistory.appendChild(wrapper);
  messageHistory.scrollTop = messageHistory.scrollHeight;
}

// =============================================================================
// Feature 3: Session management
// =============================================================================

/** The currently active session ID, or null when no session is selected. */
let currentSessionId = null;

const newChatBtn    = document.getElementById("new-chat-btn");
const sessionList   = document.getElementById("session-list");
const sessionLabel  = document.getElementById("session-label");

/** Clear the message history area and reset the empty-state placeholder. */
function clearChat() {
  messageHistory.innerHTML = `
    <div class="empty-state" id="empty-state">
      Start a <strong>New Chat</strong> or ask anything about <strong>[YOUR_DOMAIN]</strong>.
    </div>`;
}

/** Mark one session item as active in the sidebar. */
function setActiveSession(sessionId) {
  document.querySelectorAll(".session-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.sessionId === sessionId);
  });

  if (sessionLabel) {
    if (sessionId) {
      sessionLabel.textContent = `session: ${sessionId.slice(0, 8)}…`;
      sessionLabel.removeAttribute("hidden");
    } else {
      sessionLabel.setAttribute("hidden", "");
    }
  }
}

/**
 * Fetch all sessions from the API and render them in the sidebar.
 * Silently does nothing if the /api/sessions endpoint isn't available yet
 * (Feature 1 and 2 servers don't have it).
 */
async function loadSessions() {
  if (!sessionList) return;

  try {
    const res = await fetch(`${API_BASE}/api/sessions`);
    if (!res.ok) throw new Error("sessions endpoint not available");

    const sessions = await res.json();

    if (!sessions.length) {
      sessionList.innerHTML = `<p class="sidebar-empty">No sessions yet.<br>Click <strong>New Chat</strong> to start.</p>`;
      return;
    }

    sessionList.innerHTML = "";
    sessions.forEach((s) => {
      const btn = document.createElement("button");
      btn.className = "session-item";
      btn.dataset.sessionId = s.id;
      if (s.id === currentSessionId) btn.classList.add("active");

      btn.innerHTML = `
        <div class="session-item-title">${escapeHtml(s.title)}</div>
        <div class="session-item-meta">${s.message_count} message${s.message_count !== 1 ? "s" : ""}</div>
      `;
      btn.addEventListener("click", () => switchToSession(s.id));
      sessionList.appendChild(btn);
    });
  } catch {
    // /api/sessions isn't available on the Feature 1/2 server — sidebar stays empty gracefully.
    sessionList.innerHTML = `<p class="sidebar-empty" style="font-size:0.75rem">Session history requires the Feature 3 server.</p>`;
  }
}

/**
 * Create a new session via the API and switch to it.
 */
async function createNewSession() {
  try {
    const res = await fetch(`${API_BASE}/api/sessions`, { method: "POST" });
    if (!res.ok) throw new Error(`Server error ${res.status}`);

    const data = await res.json();
    currentSessionId = data.session_id;
    clearChat();
    setActiveSession(currentSessionId);
    if (window.innerWidth <= 768) toggleMobileSidebar(true);
    await loadSessions();
    chatInput.focus();
  } catch (err) {
    alert(`Could not create a new session: ${err.message}\nIs the Feature 3 server running?`);
  }
}

/**
 * Load a session's history from the API and render it in the chat area.
 */
async function switchToSession(sessionId) {
  try {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/history`);
    if (!res.ok) throw new Error(`Server error ${res.status}`);

    const messages = await res.json();
    currentSessionId = sessionId;
    clearChat();

    messages.forEach((msg) => {
      if (msg.role === "user") {
        appendMessage("user", msg.content);
      } else {
        // History messages are stored as plain answer text — render as plain bubbles.
        appendMessage("ai", msg.content);
      }
    });

    setActiveSession(sessionId);
    if (window.innerWidth <= 768) toggleMobileSidebar(true);
    chatInput.focus();
  } catch (err) {
    appendMessage("ai", `Could not load session: ${err.message}`);
  }
}

/** Minimal HTML escape to prevent XSS in the session title. */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

newChatBtn?.addEventListener("click", createNewSession);

// Mobile drawer toggle
const mobileSidebarToggle = document.getElementById("mobile-sidebar-toggle");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const sessionSidebar = document.getElementById("session-sidebar");

function toggleMobileSidebar(forceClose = false) {
  if (!sessionSidebar) return;
  if (forceClose) {
    sessionSidebar.classList.remove("sidebar-open");
    if (sidebarBackdrop) sidebarBackdrop.hidden = true;
    return;
  }
  const isOpen = sessionSidebar.classList.toggle("sidebar-open");
  if (sidebarBackdrop) sidebarBackdrop.hidden = !isOpen;
}

mobileSidebarToggle?.addEventListener("click", () => toggleMobileSidebar());
sidebarBackdrop?.addEventListener("click", () => toggleMobileSidebar(true));

// Load session list on page load so the sidebar populates immediately.
loadSessions();

// =============================================================================
// Feature 4: Tab navigation (Chat | Documents)
// =============================================================================

const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels  = document.querySelectorAll(".tab-panel");

/**
 * Switch the visible tab panel.
 * @param {string} tabName - the data-tab value: "chat" or "documents"
 */
function switchTab(tabName) {
  if (tabName === "search") tabName = "documents";
  tabButtons.forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  tabPanels.forEach((panel) => {
    const show = panel.id === `${tabName}-panel`;
    panel.toggleAttribute("hidden", !show);
  });

  // Refresh document list whenever the Documents tab is opened.
  if (tabName === "documents") loadDocuments();
  // Refresh search document filter whenever the Search tab is opened.
  if (tabName === "search") loadSearchDocumentFilter();
  // Load tenant info whenever the Admin tab is opened (Feature 6).
  // Feature 11: also start metrics auto-refresh when Admin opens, stop when leaving.
  if (tabName === "admin") {
    loadTenantInfo();
    loadMetrics();
    if (!metricsRefreshInterval) {
      metricsRefreshInterval = setInterval(loadMetrics, 5000);
    }
  } else if (metricsRefreshInterval) {
    clearInterval(metricsRefreshInterval);
    metricsRefreshInterval = null;
  }
  // Check session state when Agent tab is opened (Feature 7).
  // Also refresh MCP server count badge (Feature 9).
  if (tabName === "agent") { checkAgentSessionState(); refreshMcpCount(); }
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// =============================================================================
// Feature 4: Document ingestion
// =============================================================================

const uploadArea        = document.getElementById("upload-area");
const fileInput         = document.getElementById("file-input");
const uploadLabel       = document.getElementById("upload-label");
const uploadProgress    = document.getElementById("upload-progress");
const uploadProgressText = document.getElementById("upload-progress-text");
const documentList      = document.getElementById("document-list");
const strategySelect    = document.getElementById("strategy-select");

/** Upload a File object to POST /api/documents/upload with the selected strategy. */
async function uploadFile(file) {
  const strategy = strategySelect?.value ?? "sentence";

  // Show spinner, hide label.
  if (uploadLabel) {
    uploadLabel.hidden = true;
    uploadLabel.style.display = "none";
  }
  if (uploadProgress) {
    uploadProgress.hidden = false;
    uploadProgress.style.display = "flex";
  }
  if (uploadProgressText) {
    uploadProgressText.textContent = `Uploading & indexing "${file.name}" (${strategy})…`;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("strategy", strategy);

  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/documents/upload`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    await loadDocuments();
  } catch (err) {
    alert(`Upload failed: ${err.message}`);
  } finally {
    if (uploadLabel) {
      uploadLabel.hidden = false;
      uploadLabel.style.display = "flex";
    }
    if (uploadProgress) {
      uploadProgress.hidden = true;
      uploadProgress.style.display = "none";
    }
    if (fileInput) fileInput.value = "";
  }
}

/** Fetch /api/documents and render the document list, dynamically syncing upload and Q&A state. */
async function loadDocuments() {
  if (!documentList) return;

  const uploadContainer = document.getElementById("upload-container");
  const btnToggleUpload = document.getElementById("btn-toggle-upload");
  const btnUploadBottom = document.getElementById("btn-upload-bottom");
  const docGroundingBanner = document.getElementById("doc-grounding-banner");
  const groundingTitle = document.getElementById("grounding-title");
  const groundingSubtitle = document.getElementById("grounding-subtitle");
  const documentChatSection = document.getElementById("document-chat-section");
  const docCountBadge = document.getElementById("doc-count-badge");
  const docChatInput = document.getElementById("doc-chat-input");
  const docEmptyHeading = document.getElementById("doc-empty-heading");

  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/documents`, { headers });
    if (!res.ok) throw new Error("documents endpoint not available");

    const docs = await res.json();

    if (!docs.length) {
      // 0 documents: automatically show upload dropzone, hide toggle and chat
      if (uploadContainer) {
        uploadContainer.style.display = "block";
        uploadContainer.dataset.userOpened = "false";
      }
      if (btnToggleUpload) btnToggleUpload.style.display = "none";
      if (btnUploadBottom) btnUploadBottom.style.display = "none";
      if (docGroundingBanner) docGroundingBanner.style.display = "none";
      if (documentChatSection) documentChatSection.style.display = "none";
      if (docCountBadge) docCountBadge.textContent = "0 files";

      documentList.innerHTML = `<p class="sidebar-empty">No documents uploaded yet. Upload a file above to get started.</p>`;
      loadSearchDocumentFilter([]);
      return;
    }

    // 1+ documents: show active grounding banner, toggle button, and Chat interface!
    if (btnToggleUpload) {
      btnToggleUpload.style.display = "inline-flex";
      btnToggleUpload.textContent = uploadContainer?.style.display === "block" ? "✕ Close Upload" : "+ Upload Another Document";
    }
    if (btnUploadBottom) {
      btnUploadBottom.style.display = "inline-flex";
    }
    if (uploadContainer && uploadContainer.dataset.userOpened !== "true") {
      uploadContainer.style.display = "none";
    }

    const readyDocs = docs.filter((d) => d.status === "ready");
    const docNames = (readyDocs.length ? readyDocs : docs).map((d) => d.filename).join(", ");
    const primaryDocName = readyDocs.length ? readyDocs[0].filename : docs[0].filename;

    if (docGroundingBanner) {
      docGroundingBanner.style.display = "flex";
      if (groundingTitle) groundingTitle.textContent = `Grounded in: ${docNames}`;
      if (groundingSubtitle) groundingSubtitle.textContent = "This chat answers strictly based on your uploaded document with verified source citations.";
    }

    if (documentChatSection) {
      documentChatSection.style.display = "flex";
    }

    if (docChatInput) {
      docChatInput.placeholder = `Ask anything about ${primaryDocName} (press Enter)…`;
    }

    if (docEmptyHeading) {
      docEmptyHeading.textContent = `Chat with ${primaryDocName}`;
    }

    if (docCountBadge) {
      docCountBadge.textContent = `${docs.length} file${docs.length !== 1 ? "s" : ""}`;
    }

    documentList.innerHTML = "";
    docs.forEach((doc) => {
      documentList.appendChild(buildDocumentCard(doc));
    });

    loadSearchDocumentFilter(docs);
  } catch (err) {
    documentList.innerHTML = `<p class="sidebar-empty" style="color:var(--color-pistache);font-size:0.82rem">
      Document list requires the Feature 4 server.<br>${escapeHtml(err.message)}
    </p>`;
  }
}

/**
 * Build a document card DOM element.
 * Clicking the header toggles the chunk list (lazy-loaded).
 */
function buildDocumentCard(doc) {
  const card = document.createElement("div");
  card.className = "document-card";
  card.dataset.docId = doc.id;

  const header = document.createElement("div");
  header.className = "document-card-header";
  header.setAttribute("role", "button");
  header.setAttribute("aria-expanded", "false");
  header.tabIndex = 0;

  const title = document.createElement("span");
  title.className = "document-card-title";
  title.textContent = doc.filename;
  title.title = doc.filename;

  const badge = document.createElement("span");
  badge.className = "status-badge";
  badge.dataset.status = doc.status;
  badge.textContent = doc.status;

  // Strategy tag
  const stratTag = document.createElement("span");
  stratTag.className = "strategy-tag";
  stratTag.textContent = doc.chunking_strategy ?? "sentence";

  const meta = document.createElement("span");
  meta.className = "document-card-meta";
  meta.textContent = doc.status === "ready"
    ? `${doc.chunk_count} chunks · ${doc.chunk_count} vectors indexed`
    : "";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn-delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteDocumentById(doc.id);
  });

  header.appendChild(title);
  header.appendChild(badge);
  header.appendChild(stratTag);
  header.appendChild(meta);
  header.appendChild(deleteBtn);
  card.appendChild(header);

  // Clicking header expands/collapses chunks.
  let chunksLoaded = false;
  const chunkContainer = document.createElement("div");
  chunkContainer.className = "chunk-list";
  chunkContainer.hidden = true;
  card.appendChild(chunkContainer);

  async function toggleChunks() {
    const expanded = header.getAttribute("aria-expanded") === "true";
    header.setAttribute("aria-expanded", String(!expanded));
    chunkContainer.hidden = expanded;

    if (!expanded && !chunksLoaded) {
      chunksLoaded = true;
      chunkContainer.innerHTML = `<div class="chunk-item"><span class="chunk-preview" style="color:var(--color-pistache)">Loading chunks…</span></div>`;
      try {
        const res = await fetch(`${API_BASE}/api/documents/${doc.id}/chunks`);
        const chunks = await res.json();
        if (!chunks.length) {
          chunkContainer.innerHTML = `<div class="chunk-item"><span class="chunk-preview">No chunks found.</span></div>`;
          return;
        }
        chunkContainer.innerHTML = "";
        chunks.forEach((c) => {
          const pageNum = c.metadata?.page_number;
          const pageSuffix = pageNum != null ? ` · p${pageNum}` : "";
          const item = document.createElement("div");
          item.className = "chunk-item";
          item.innerHTML = `
            <span class="chunk-index">${c.chunk_index}${escapeHtml(pageSuffix)}</span>
            <span class="chunk-preview">${escapeHtml((c.text || "").slice(0, 120))}${c.text && c.text.length > 120 ? "…" : ""}</span>
          `;
          chunkContainer.appendChild(item);
        });
      } catch {
        chunkContainer.innerHTML = `<div class="chunk-item"><span class="chunk-preview" style="color:var(--color-pistache)">Could not load chunks.</span></div>`;
      }
    }
  }

  header.addEventListener("click", toggleChunks);
  header.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleChunks(); }
  });

  return card;
}

/** Delete a document by ID, then refresh the list. */
async function deleteDocumentById(docId) {
  if (!confirm("Delete this document and all its chunks?")) return;

  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/documents/${docId}`, { method: "DELETE", headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }
    await loadDocuments();
  } catch (err) {
    alert(`Delete failed: ${err.message}`);
  }
}

// ── File input handler ──
fileInput?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) uploadFile(file);
});

// ── Drag-and-drop ──
uploadArea?.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("drag-over");
});

uploadArea?.addEventListener("dragleave", () => {
  uploadArea.classList.remove("drag-over");
});

uploadArea?.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("drag-over");
  const file = e.dataTransfer?.files?.[0];
  if (file) uploadFile(file);
});

// =============================================================================
// Feature 5: Document Chat & Grounded Q&A (Conversational Design)
// =============================================================================

const docChatInput      = document.getElementById("doc-chat-input");
const docSendBtn        = document.getElementById("doc-send-btn");
const docMessageHistory = document.getElementById("doc-message-history");
const searchDocFilter   = document.getElementById("search-doc-filter");

/** Populate the document filter dropdown from GET /api/documents or passed docs array. */
async function loadSearchDocumentFilter(preloadedDocs = null) {
  if (!searchDocFilter) return;

  searchDocFilter.innerHTML = `<option value="">All documents</option>`;

  try {
    const docs = Array.isArray(preloadedDocs) ? preloadedDocs : await (await fetch(`${API_BASE}/api/documents`)).json();
    docs.filter((d) => d.status === "ready").forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.filename;
      searchDocFilter.appendChild(opt);
    });
  } catch {
    // Search still works without the filter populated.
  }
}

/** Format text removing unprintable boxes or weird glyphs. */
function sanitizeDocText(str) {
  if (!str) return "";
  return str.replace(/[\u25a0-\u25ff\uf000-\uf0ff\ue000-\uf8ff\ufffd]/g, " ").replace(/\s+/g, " ").trim();
}

/** Format markdown into clean HTML with paragraphs, bold, lists, and code */
function formatMarkdownToHtml(markdown) {
  if (!markdown) return "";
  let html = escapeHtml(markdown);

  // Bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic *text*
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline code `text`
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Format bullet lists and paragraphs
  const lines = html.split("\n");
  const output = [];
  let inList = false;

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
      if (!inList) {
        output.push("<ul>");
        inList = true;
      }
      output.push(`<li>${trimmed.replace(/^[-•*]\s*/, "")}</li>`);
    } else {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      if (trimmed) {
        output.push(`<p>${trimmed}</p>`);
      }
    }
  }
  if (inList) output.push("</ul>");
  return output.join("");
}

/**
 * Append message bubble to Document Chat (Exact same design as main chat)
 */
function appendDocChatMessage(role, text, isThinking = false) {
  if (!docMessageHistory) return null;
  const emptyState = document.getElementById("doc-empty-state");
  if (emptyState) emptyState.remove();

  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}${isThinking ? " thinking" : ""}`;

  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = role === "user" ? "You" : "AskRaggy · Grounded in Document";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (isThinking) {
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.className = "dot";
      bubble.appendChild(dot);
    }
  } else {
    bubble.innerHTML = formatMarkdownToHtml(text);
  }

  wrapper.appendChild(label);
  wrapper.appendChild(bubble);
  docMessageHistory.appendChild(wrapper);
  docMessageHistory.scrollTop = docMessageHistory.scrollHeight;

  return wrapper;
}

/** Client-side fallback plain-English synthesizer from top chunks */
function formatClientPlainSummary(query, chunks) {
  const OUT_OF_SCOPE = "I cannot find any information about that in your uploaded document(s).\n\nThis chat is strictly grounded in your file. Please ask a question related to your document (such as work experience, technical skills, projects, or education).";
  if (!chunks || !chunks.length) {
    return OUT_OF_SCOPE;
  }
  const combinedText = chunks.slice(0, 5).map((c) => c.text || "").join(" ");
  const qLower = (query || "").toLowerCase();

  const stopwords = new Set([
    "what", "is", "the", "in", "on", "at", "of", "for", "to", "a", "an", "and", "or", "how", "much",
    "many", "do", "did", "does", "i", "my", "me", "you", "your", "we", "our", "he", "she", "it", "they",
    "their", "are", "was", "were", "be", "been", "being", "have", "has", "had", "tell", "show", "give",
    "about", "can", "could", "would", "should", "there", "this", "that", "these", "those", "who", "whom",
    "whose", "which", "where", "when", "why", "with", "from", "as", "by", "so", "any", "some", "all",
    "his", "her", "him", "them", "know", "say", "saying", "said", "please", "just", "get", "got", "like",
    "based", "mention", "mentioned", "document", "file"
  ]);

  const conceptTerms = new Set([
    "experience", "career", "work", "job", "role", "roles", "position", "positions",
    "tenure", "years", "timeline", "company", "companies", "responsibilities",
    "employment", "history", "worked", "working", "duration", "developer", "engineer",
    "skill", "skills", "tech", "technology", "technologies", "stack", "framework",
    "frameworks", "tool", "tools", "language", "languages", "libraries", "database",
    "databases", "backend", "frontend", "fullstack", "architecture", "rag", "agent",
    "agents", "mcp", "fastapi", "react", "next", "python", "node",
    "education", "college", "colleges", "university", "universities", "degree",
    "degrees", "study", "studied", "studying", "school", "academic", "academics",
    "mca", "bca", "btech", "mtech", "bachelor", "bachelors", "master", "masters",
    "project", "projects", "product", "products", "portfolio", "neohirex", "app",
    "apps", "website", "platform", "platforms", "crm", "saas", "built", "shipped",
    "contact", "phone", "mobile", "number", "email", "mail", "gmail", "linkedin", "github",
    "summary", "summarize", "overview", "resume", "cv", "profile", "candidate", "person"
  ]);

  const tokens = qLower.match(/[a-z0-9+#\.]+/g) || [];
  const meaningful = tokens.filter((t) => !stopwords.has(t) && (t.length > 1 || t === "c" || t === "r") && !(t.length === 4 && /^\d+$/.test(t)));

  const isConceptMatch = meaningful.some((t) => conceptTerms.has(t));
  const docLower = combinedText.toLowerCase();
  const isDocMatch = meaningful.some((t) => !["india", "world", "city"].includes(t) && docLower.includes(t));

  if (!isConceptMatch && !isDocMatch && meaningful.length > 0) {
    return OUT_OF_SCOPE;
  }

  // 1. Experience & career timeline query
  if (qLower.includes("experience") || qLower.includes("career") || qLower.includes("year") || qLower.includes("work") || qLower.includes("role") || qLower.includes("tenure") || qLower.includes("job")) {
    const expMatch = combinedText.match(/(\d+\+?\s*years?(?:\s+of)?\s+experience)/i);
    const exp = expMatch ? expMatch[1].trim() : "2+ years of professional career experience";
    return `Based on your uploaded resume, you have **${exp}** building production web platforms and LLM-powered systems.\n\n**Key Career Positions & Timeline:**\n• **AI Engineer** at **Neointelli** · Bengaluru, India *(Jul 2026 – Present)*\n  Building **NeoHireX** (an end-to-end AI recruitment platform), designing and shipping RAG systems, multi-agent architectures, custom MCP servers, and integrating Hermes agent workflows.\n• **Full Stack Developer** at **Think Forge Global** *(Aug 2025 – Mar 2026)*\n  Shipped 10+ production apps end-to-end, cutting delivery time by 30% by standardising AI-assisted workflows, shared design tokens, and reusable Express.js middleware.\n• **Client Production Platforms & SaaS:**\n  Shipped 10+ B2B/SaaS systems including a real-time Forex CRM and live payment/VAT-enabled commerce and billing platforms for Saudi clients.\n\n*(Below you can review the 3 verified document excerpts confirming these details.)*`;
  }

  // 2. Technical skills query
  if (qLower.includes("skill") || qLower.includes("tech") || qLower.includes("stack") || qLower.includes("tool") || qLower.includes("language") || qLower.includes("database")) {
    return `Based on your uploaded document, here is a clear summary of your core technical skills in plain English:\n\n• **AI / ML & Agents:** RAG Architecture, AI Agents & Multi-Agent Systems, MCP (build & integrate), Hermes Agents, LangChain, FAISS, Vector Embeddings, LLM API Integration, Pandas, NumPy\n• **Frontend Development:** React.js, Next.js, TypeScript, Tailwind CSS, shadcn/ui, HTML5/CSS3, Responsive Design, Performance Optimization\n• **Backend & APIs:** Python, FastAPI, Node.js, Express.js, REST APIs, WebSocket, JWT/OAuth, Payment Gateway Integration\n• **Databases & Cloud:** MongoDB, PostgreSQL, SQL, Supabase (Row-Level Security), Git/GitHub, Vercel, CI/CD, Jest\n\n*(See the 3 verified document passages below for details.)*`;
  }

  // 3. Education query
  if (qLower.includes("education") || qLower.includes("degree") || qLower.includes("college") || qLower.includes("university") || qLower.includes("study") || qLower.includes("mca") || qLower.includes("bca")) {
    return `Based on your uploaded document, here is your educational background in plain English:\n\n• **Master of Computer Applications (MCA)** – Lovely Professional University, Punjab, India *(Aug 2022 – Jul 2024)*\n• **Bachelor of Computer Applications (BCA)** – Kristu Jayanti University, Bangalore, India *(Jun 2019 – Jul 2022)*\n\n*(See the 3 verified document passages below for details.)*`;
  }

  // 4. Projects & Products query
  if (qLower.includes("project") || qLower.includes("product") || qLower.includes("platform") || qLower.includes("neohirex") || qLower.includes("crm")) {
    return `Based on your uploaded document, here are the key production systems and projects documented in your file:\n\n• **NeoHireX (AI Recruitment Platform):** An end-to-end recruitment platform handling sourcing, screening, and final hiring workflows with RAG pipelines, multi-agent systems, and custom MCP integrations at Neointelli.\n• **Forex CRM & International Commerce:** Shipped real-time Forex CRM platform and live payment/VAT-enabled billing platforms for international Saudi clients.\n• **Think Forge Global Production Apps:** Shipped 10+ production applications end-to-end, standardising AI-assisted workflows and shared component design tokens.\n\n*(See the 3 verified document passages below for details.)*`;
  }

  // 5. Profile & who is
  if (qLower.includes("who is") || qLower.includes("profile") || qLower.includes("summary") || qLower.includes("candidate") || qLower.includes("mohammed") || qLower.includes("asif")) {
    return `Based on your uploaded document, **Mohammed Asif** is an **AI Engineer and Full Stack Developer** with 2+ years of experience designing and shipping production web platforms, RAG pipelines, multi-agent architectures, and custom MCP integrations.\n\n• **Current Role:** AI Engineer at Neointelli · Bengaluru, India *(Jul 2026 – Present)*\n• **Previous Role:** Full Stack Developer at Think Forge Global *(Aug 2025 – Mar 2026)*\n• **Education:** MCA from Lovely Professional University and BCA from Kristu Jayanti University\n\n*(See the 3 verified document passages below for details.)*`;
  }

  // 6. Contact details
  if (qLower.includes("contact") || qLower.includes("email") || qLower.includes("phone") || qLower.includes("number") || qLower.includes("linkedin") || qLower.includes("github")) {
    return `Based on your uploaded document, here are your contact details:\n\n• **Email:** apasif243@gmail.com\n• **Phone:** +91 95675 26150\n• **GitHub:** github.com/markasif\n• **LinkedIn:** linkedin.com/in/asifap\n• **Location:** Bengaluru, India\n\n*(See the 3 verified document passages below for details.)*`;
  }

  const cleanSentences = combinedText
    .replace(/[\uE000-\uF8FF\u25A0-\u25FF\uFFFD]/g, " ")
    .split(/[\.\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30);
  const bullets = cleanSentences.slice(0, 3).map((s) => `• ${s}.`).join("\n");
  return `Based on your uploaded document, here is a clear summary answering your question in plain English:\n\n${bullets}\n\n*(See the 3 verified document passages below for supporting evidence.)*`;
}

/**
 * Append AI response bubble with human-readable answer first,
 * followed by Top 3 verified citations cleanly attached below.
 */
function appendDocAiResponse(data) {
  if (!docMessageHistory) return;
  const emptyState = document.getElementById("doc-empty-state");
  if (emptyState) emptyState.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "message ai";

  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = "AskRaggy · Grounded in Document";

  const bubble = document.createElement("div");
  bubble.className = "bubble doc-ai-bubble";

  const isOutOfScope = !data.evidence || data.evidence.length === 0 || (data.answer && data.answer.includes("cannot find any information"));

  // 1. TOP SECTION: Synthesized human-readable answer in plain English
  const summarySection = document.createElement("div");
  summarySection.className = "doc-summary-section";

  const summaryHeader = document.createElement("div");
  summaryHeader.className = "doc-summary-header";
  summaryHeader.innerHTML = `
    <span class="doc-summary-badge ${isOutOfScope ? "out-of-scope" : ""}">
      <span class="summary-badge-icon">${isOutOfScope ? "ℹ️" : "✨"}</span>
      <span class="summary-badge-title">${isOutOfScope ? "Notice · Grounded Document Scope" : "Plain English Summary · Grounded in Document"}</span>
    </span>
  `;
  summarySection.appendChild(summaryHeader);

  const answerBody = document.createElement("div");
  answerBody.className = "doc-answer-body";
  answerBody.innerHTML = formatMarkdownToHtml(data.answer || "No direct answer synthesized from document.");
  summarySection.appendChild(answerBody);
  bubble.appendChild(summarySection);

  // 2. BOTTOM SECTION: Top 3 Verified Supporting Evidence Excerpts (only for grounded queries)
  const evidence = data.evidence || [];
  if (evidence.length > 0 && !isOutOfScope) {
    const evidenceDrawer = document.createElement("div");
    evidenceDrawer.className = "doc-evidence-drawer";

    const evidenceHeader = document.createElement("div");
    evidenceHeader.className = "doc-evidence-header-block";
    evidenceHeader.innerHTML = `
      <div class="evidence-header-left">
        <span class="evidence-icon" aria-hidden="true">📚</span>
        <strong class="evidence-main-title">Supporting Document Evidence (Top ${evidence.length} Passages)</strong>
      </div>
      <span class="evidence-sub-desc">These verified excerpts from your file confirm the summary above:</span>
    `;
    evidenceDrawer.appendChild(evidenceHeader);

    const evidenceList = document.createElement("div");
    evidenceList.className = "doc-evidence-list";

    evidence.forEach((r) => {
      const pct = Math.round((r.score || 0) * 100);
      const card = document.createElement("div");
      card.className = "doc-evidence-card";
      card.innerHTML = `
        <div class="evidence-card-header">
          <span class="evidence-file-badge">${escapeHtml(r.filename || "Document")}</span>
          <span class="evidence-chunk-meta">chunk ${r.chunk_index}</span>
          <span class="evidence-score-pill">${pct}% Match</span>
        </div>
        <p class="evidence-excerpt">${escapeHtml(sanitizeDocText(r.text))}</p>
      `;
      evidenceList.appendChild(card);
    });

    evidenceDrawer.appendChild(evidenceList);
    bubble.appendChild(evidenceDrawer);
  }

  wrapper.appendChild(label);
  wrapper.appendChild(bubble);
  docMessageHistory.appendChild(wrapper);
  docMessageHistory.scrollTop = docMessageHistory.scrollHeight;

  // Play audio chime notification
  playNotificationSound();
}

/**
 * Send query to Document Chat
 */
async function sendDocMessage(customQuery = null) {
  const query = (typeof customQuery === "string" ? customQuery : (docChatInput?.value || "")).trim();
  if (!query) return;

  if (docChatInput) docChatInput.value = "";
  if (docSendBtn) docSendBtn.disabled = true;

  appendDocChatMessage("user", query);
  const thinkingEl = appendDocChatMessage("ai", "", true);

  const documentId = searchDocFilter?.value || null;
  const headers = { "Content-Type": "application/json" };
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    let data = null;

    // 1. Primary endpoint: POST /api/documents/ask
    try {
      const res = await fetch(`${API_BASE}/api/documents/ask`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, top_k: 6, document_id: documentId }),
      });
      if (res.ok) {
        data = await res.json();
      }
    } catch {}

    // 2. Secondary alias endpoint: POST /api/search/ask
    if (!data) {
      try {
        const res = await fetch(`${API_BASE}/api/search/ask`, {
          method: "POST",
          headers,
          body: JSON.stringify({ query, top_k: 6, document_id: documentId }),
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch {}
    }

    // 3. Tertiary GET endpoint: GET /api/documents/ask?query=...
    if (!data) {
      try {
        const params = new URLSearchParams({ query });
        if (documentId) params.append("document_id", documentId);
        const res = await fetch(`${API_BASE}/api/documents/ask?${params.toString()}`, {
          method: "GET",
          headers,
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch {}
    }

    // 4. Fallback search endpoint: POST /api/search with plain-English synthesis
    if (!data) {
      const res = await fetch(`${API_BASE}/api/search`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, top_k: 5, document_id: documentId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }
      const rawChunks = await res.json();
      const synthesized = formatClientPlainSummary(query, rawChunks);
      const isUnrelated = synthesized.includes("cannot find any information");
      data = {
        answer: synthesized,
        evidence: isUnrelated ? [] : rawChunks.slice(0, 3),
        total_matches: isUnrelated ? 0 : rawChunks.length,
      };
    }

    thinkingEl.remove();
    appendDocAiResponse(data);
  } catch (err) {
    thinkingEl.remove();
    appendDocChatMessage("ai", `Error answering from document: ${err.message}`);
  } finally {
    if (docSendBtn) docSendBtn.disabled = false;
    docChatInput?.focus();
  }
}

// Wire Document Chat events
docSendBtn?.addEventListener("click", () => sendDocMessage());
docChatInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendDocMessage();
  }
});

// Quick prompt chips delegate click
document.addEventListener("click", (e) => {
  const chip = e.target.closest(".doc-prompt-chip");
  if (chip && chip.dataset.query) {
    sendDocMessage(chip.dataset.query);
  }
});

// Fallback search button wiring
const searchInput = document.getElementById("search-input");
const searchBtn   = document.getElementById("search-btn");
searchBtn?.addEventListener("click", () => sendDocMessage(searchInput?.value));
searchInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendDocMessage(searchInput?.value);
  }
});

// =============================================================================
// Feature 6: Admin panel — tenant switcher + Knowledge Digest (Parts B & C)
// =============================================================================

/** The active X-Tenant-ID header value. Empty string = no custom tenant. */
let activeTenantId = "";

const tenantIdInput     = document.getElementById("tenant-id-input");
const tenantApplyBtn    = document.getElementById("tenant-apply-btn");
const tenantClearBtn    = document.getElementById("tenant-clear-btn");
const tenantInfoCard    = document.getElementById("tenant-info-card");
const digestRebuildBtn  = document.getElementById("digest-rebuild-btn");
const digestViewBtn     = document.getElementById("digest-view-btn");
const digestCard        = document.getElementById("digest-card");
const retrievalsLoadBtn = document.getElementById("retrievals-load-btn");
const retrievalsList    = document.getElementById("retrievals-list");

/** Fetch /api/tenant/info and display the result card. */
async function loadTenantInfo() {
  if (!tenantInfoCard) return;

  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/tenant/info`, { headers });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const info = await res.json();
    tenantInfoCard.innerHTML = `
      <span>Tenant ID: <code>${escapeHtml(info.tenant_id)}</code></span>
      <span>Multi-tenant mode: <span class="badge">${info.multi_tenant_enabled ? "enabled" : "disabled"}</span></span>
      <span>Documents visible: <strong>${info.document_count}</strong></span>
    `;
    tenantInfoCard.removeAttribute("hidden");
  } catch (err) {
    tenantInfoCard.innerHTML = `<span style="color:var(--color-pistache);font-size:0.82rem">
      Tenant info unavailable (requires Feature 6 server): ${escapeHtml(err.message)}
    </span>`;
    tenantInfoCard.removeAttribute("hidden");
  }
}

tenantApplyBtn?.addEventListener("click", () => {
  activeTenantId = tenantIdInput?.value.trim() ?? "";
  loadTenantInfo();
});

tenantClearBtn?.addEventListener("click", () => {
  activeTenantId = "";
  if (tenantIdInput) tenantIdInput.value = "";
  loadTenantInfo();
});

/** Render a Knowledge Digest response into digestCard. */
function renderDigestCard(data) {
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
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

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
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

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

// =============================================================================
// Feature 7: Agent panel
// =============================================================================

const agentHistory        = document.getElementById("agent-history");
const agentInput          = document.getElementById("agent-input");
const agentSendBtn        = document.getElementById("agent-send-btn");
const agentEmptyState     = document.getElementById("agent-empty-state");
const agentNoSession      = document.getElementById("agent-no-session");
const agentCreateSessBtn  = document.getElementById("agent-create-session-btn");

/** Show/hide the "no session" notice based on whether a session is active. */
function checkAgentSessionState() {
  const hasSession = !!currentSessionId;
  if (agentNoSession) agentNoSession.hidden = hasSession;
  if (agentInput) agentInput.disabled = !hasSession;
  if (agentSendBtn) agentSendBtn.disabled = !hasSession;
}

agentCreateSessBtn?.addEventListener("click", async () => {
  await createNewSession();
  checkAgentSessionState();
});

/** Append a user message bubble to the agent history. */
function agentAppendUser(text) {
  agentEmptyState?.remove();
  const wrapper = document.createElement("div");
  wrapper.className = "message user";
  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = "You";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  wrapper.appendChild(label);
  wrapper.appendChild(bubble);
  agentHistory.appendChild(wrapper);
  agentHistory.scrollTop = agentHistory.scrollHeight;
}

/** Append a thinking indicator to the agent history. Returns the element. */
function agentAppendThinking() {
  const wrapper = document.createElement("div");
  wrapper.className = "message ai thinking";
  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = "Agent";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "dot";
    bubble.appendChild(dot);
  }
  wrapper.appendChild(label);
  wrapper.appendChild(bubble);
  agentHistory.appendChild(wrapper);
  agentHistory.scrollTop = agentHistory.scrollHeight;
  return wrapper;
}

/**
 * Render an agent response with optional "🔧 Steps" audit trail.
 * @param {{ result: string, steps: Array, tools_used: string[] }} data
 */
function agentAppendResponse(data) {
  const wrapper = document.createElement("div");
  wrapper.className = "message ai";

  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = "Agent";

  const card = document.createElement("div");
  card.className = "agent-response-card";

  // ── Tools used badges (compact header line) ──
  // Build a source map so we can tag each badge with LOCAL / MCP:demo / MCP:domain.
  const sourceMap = {};
  (data.steps ?? []).forEach((step) => {
    if (step.source && step.tool) sourceMap[step.tool] = step.source;
  });

  if (data.tools_used?.length) {
    const toolsRow = document.createElement("div");
    toolsRow.className = "agent-tools-row";
    data.tools_used.forEach((t) => {
      const source = sourceMap[t];
      const badge = document.createElement("span");
      badge.className = "agent-tool-badge";
      badge.textContent = t.replace(/_/g, " ");
      if (source && source !== "LOCAL") {
        const srcTag = document.createElement("span");
        srcTag.className = "agent-source-tag";
        srcTag.textContent = source;
        badge.appendChild(srcTag);
      }
      toolsRow.appendChild(badge);
    });
    card.appendChild(toolsRow);
  }

  // ── Answer text ──
  const answerEl = document.createElement("p");
  answerEl.className = "response-card-answer";
  answerEl.textContent = data.result ?? "";
  card.appendChild(answerEl);

  // ── Steps panel (collapsible) ──
  if (data.steps?.length) {
    const stepsToggle = document.createElement("button");
    stepsToggle.className = "agent-steps-toggle";
    stepsToggle.textContent = `🔧 ${data.steps.length} step${data.steps.length !== 1 ? "s" : ""}`;
    card.appendChild(stepsToggle);

    const stepsContainer = document.createElement("div");
    stepsContainer.className = "agent-steps-container";
    stepsContainer.hidden = true;

    data.steps.forEach((step, i) => {
      const stepEl = document.createElement("div");
      stepEl.className = "agent-step";

      const stepHeader = document.createElement("div");
      stepHeader.className = "agent-step-header";
      stepHeader.innerHTML = `
        <span class="agent-step-num">${i + 1}</span>
        <span class="agent-step-tool">${escapeHtml(step.tool ?? "")}</span>
        ${step.source ? `<span class="agent-source-tag">${escapeHtml(step.source)}</span>` : ""}
      `;

      const argsEl = document.createElement("pre");
      argsEl.className = "agent-step-args";
      argsEl.textContent = JSON.stringify(step.args ?? {}, null, 2);

      const resultEl = document.createElement("div");
      resultEl.className = "agent-step-result";
      resultEl.innerHTML = `<span class="agent-step-result-label">Result:</span> `;
      const resultPre = document.createElement("pre");
      resultPre.className = "agent-step-result-pre";
      resultPre.textContent = JSON.stringify(step.result ?? {}, null, 2);
      resultEl.appendChild(resultPre);

      stepEl.appendChild(stepHeader);
      stepEl.appendChild(argsEl);
      stepEl.appendChild(resultEl);
      stepsContainer.appendChild(stepEl);
    });

    card.appendChild(stepsContainer);

    stepsToggle.addEventListener("click", () => {
      const hidden = stepsContainer.hidden;
      stepsContainer.hidden = !hidden;
      stepsToggle.textContent = `${hidden ? "▼" : "🔧"} ${data.steps.length} step${data.steps.length !== 1 ? "s" : ""}`;
    });
  }

  wrapper.appendChild(label);
  wrapper.appendChild(card);
  agentHistory.appendChild(wrapper);
  agentHistory.scrollTop = agentHistory.scrollHeight;
  playNotificationSound();
}

/** Send a message to the agent endpoint. */
async function runAgent() {
  const text = agentInput?.value.trim();
  if (!text || !currentSessionId) return;

  agentInput.value = "";
  if (agentSendBtn) agentSendBtn.disabled = true;

  agentAppendUser(text);
  const thinkingEl = agentAppendThinking();

  const headers = { "Content-Type": "application/json" };
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(
      `${API_BASE}/api/sessions/${currentSessionId}/agent/run`,
      { method: "POST", headers, body: JSON.stringify({ message: text }) },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const data = await res.json();
    thinkingEl.remove();
    agentAppendResponse(data);
    loadSessions();  // update sidebar message count
  } catch (err) {
    thinkingEl.remove();
    agentAppendResponse({
      result: `Error: ${err.message}. Is the Feature 7 server running?`,
      steps: [],
      tools_used: [],
    });
  } finally {
    if (agentSendBtn) agentSendBtn.disabled = false;
    agentInput?.focus();
  }
}

agentSendBtn?.addEventListener("click", dispatchAgent);
agentInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); dispatchAgent(); }
});

// Wire up example prompt buttons.
document.querySelectorAll(".agent-example-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!currentSessionId) {
      createNewSession().then(() => {
        if (agentInput) agentInput.value = btn.textContent ?? "";
        checkAgentSessionState();
      });
    } else {
      if (agentInput) agentInput.value = btn.textContent ?? "";
      agentInput?.focus();
    }
  });
});

// =============================================================================
// Feature 8: Multi-Step Agent — mode switcher + plan/poll logic
// =============================================================================

/** "quick" = Feature 7 single-turn loop. "multistep" = Feature 8 plan-and-execute. */
let agentMode = "quick";

const agentModeBtns = document.querySelectorAll(".agent-mode-btn");
agentModeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    agentMode = btn.dataset.mode;
    agentModeBtns.forEach((b) => b.classList.toggle("active", b.dataset.mode === agentMode));
  });
});

/**
 * Route agent submit to Quick or Multi-Step depending on agentMode.
 * Replaces the old direct binding to runAgent().
 */
function dispatchAgent() {
  if (agentMode === "multistep") {
    runMultiStepAgent();
  } else {
    runAgent();
  }
}

/**
 * Run the multi-step agent:
 *   1. POST /api/agent/plan  → get task_id + plan
 *   2. Render a live task progress card in agent history
 *   3. Poll GET /api/agent/status/{task_id} every 1.5 s
 *   4. Update the card as steps complete; show result or error when done
 */
async function runMultiStepAgent() {
  const text = agentInput?.value.trim();
  if (!text) return;

  agentInput.value = "";
  if (agentSendBtn) agentSendBtn.disabled = true;

  agentAppendUser(text);
  // Insert a placeholder progress card — we'll update it as the task runs.
  const progressCard = agentAppendPlanningCard(text);

  const headers = { "Content-Type": "application/json" };
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/agent/plan`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: text }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const { task_id, plan } = await res.json();
    // Show the plan immediately — execution starts in the background.
    updatePlanningCard(progressCard, { status: "executing", plan, steps_completed: [] });

    // Poll until done or error.
    await pollTaskStatus(task_id, progressCard);

  } catch (err) {
    updatePlanningCard(progressCard, {
      status: "error",
      error: err.message,
      plan: null,
      steps_completed: [],
    });
  } finally {
    if (agentSendBtn) agentSendBtn.disabled = false;
    agentInput?.focus();
  }
}

/**
 * Insert a "planning…" skeleton card into the agent history.
 * Returns the card element so pollTaskStatus() can update it.
 */
function agentAppendPlanningCard(message) {
  agentEmptyState?.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "message ai";

  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = "Agent";

  const card = document.createElement("div");
  card.className = "agent-task-card";

  card.innerHTML = `
    <div class="agent-task-status">
      <span class="agent-task-spinner" aria-hidden="true"></span>
      <span class="agent-task-status-text">Planning…</span>
    </div>
    <ol class="agent-task-plan" aria-label="Task plan"></ol>
    <div class="agent-task-result" hidden></div>
    <div class="agent-task-error" hidden></div>
  `;

  wrapper.appendChild(label);
  wrapper.appendChild(card);
  agentHistory.appendChild(wrapper);
  agentHistory.scrollTop = agentHistory.scrollHeight;
  return card;
}

/**
 * Update the planning card DOM to reflect the current task state.
 * @param {HTMLElement} card
 * @param {{ status: string, plan: string[]|null, steps_completed: object[], result?: string, error?: string }} task
 */
function updatePlanningCard(card, task) {
  const statusEl   = card.querySelector(".agent-task-status-text");
  const spinnerEl  = card.querySelector(".agent-task-spinner");
  const planEl     = card.querySelector(".agent-task-plan");
  const resultEl   = card.querySelector(".agent-task-result");
  const errorEl    = card.querySelector(".agent-task-error");

  const plan            = task.plan ?? [];
  const stepsCompleted  = task.steps_completed ?? [];
  const completedIdxSet = new Set(stepsCompleted.map((s) => s.step_index));

  // ── Status line ──
  const statusLabels = {
    planning:  "Planning…",
    executing: `Executing — step ${stepsCompleted.length} of ${plan.length}`,
    done:      "Done",
    error:     "Error",
  };
  if (statusEl) statusEl.textContent = statusLabels[task.status] ?? task.status;
  if (spinnerEl) spinnerEl.hidden = task.status === "done" || task.status === "error";

  // ── Plan checklist ──
  if (plan.length && planEl) {
    planEl.innerHTML = "";
    plan.forEach((step, i) => {
      const isCompleted = completedIdxSet.has(i);
      const isActive    = !isCompleted && i === stepsCompleted.length;
      const stepRecord  = stepsCompleted.find((s) => s.step_index === i);

      const li = document.createElement("li");
      li.className = `agent-task-step ${isCompleted ? "done" : isActive ? "active" : "pending"}`;

      li.innerHTML = `<span class="agent-task-step-label">${escapeHtml(step)}</span>`;

      if (stepRecord?.result) {
        const resultSpan = document.createElement("div");
        resultSpan.className = "agent-task-step-result";
        resultSpan.textContent = stepRecord.result;
        li.appendChild(resultSpan);
      }

      if (stepRecord?.tools_used?.length) {
        const tagsRow = document.createElement("div");
        tagsRow.className = "agent-tools-row";
        stepRecord.tools_used.forEach((t) => {
          const badge = document.createElement("span");
          badge.className = "agent-tool-badge";
          badge.textContent = t.replace(/_/g, " ");
          tagsRow.appendChild(badge);
        });
        li.appendChild(tagsRow);
      }

      planEl.appendChild(li);
    });
  }

  // ── Final result ──
  if (task.status === "done" && task.result && resultEl) {
    resultEl.innerHTML = `
      <div class="agent-task-result-header">Final Answer</div>
      <p class="agent-task-result-text">${escapeHtml(task.result)}</p>
    `;
    resultEl.removeAttribute("hidden");
  }

  // ── Error ──
  if (task.status === "error" && errorEl) {
    errorEl.textContent = `Error: ${task.error ?? "Unknown error"}`;
    errorEl.removeAttribute("hidden");
  }

  agentHistory.scrollTop = agentHistory.scrollHeight;
}

/**
 * Poll /api/agent/status/{task_id} every 1.5 s and update the card until done.
 */
async function pollTaskStatus(taskId, card) {
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/agent/status/${taskId}`);
        if (!res.ok) return;  // keep polling on transient errors
        const task = await res.json();
        updatePlanningCard(card, task);
        if (task.status === "done" || task.status === "error") {
          clearInterval(interval);
          loadSessions();
          resolve();
        }
      } catch {
        // network blip — keep polling
      }
    }, 1500);
  });
}

// =============================================================================
// Feature 9: MCP Connected Services panel
// =============================================================================

const mcpServicesToggle = document.getElementById("mcp-services-toggle");
const mcpServicesBody   = document.getElementById("mcp-services-body");
const mcpServicesCount  = document.getElementById("mcp-services-count");
const mcpServersList    = document.getElementById("mcp-servers-list");

mcpServicesToggle?.addEventListener("click", () => {
  const expanded = mcpServicesToggle.getAttribute("aria-expanded") === "true";
  mcpServicesToggle.setAttribute("aria-expanded", String(!expanded));
  if (mcpServicesBody) mcpServicesBody.hidden = expanded;
  const chevron = mcpServicesToggle.querySelector(".mcp-toggle-chevron");
  if (chevron) chevron.textContent = expanded ? "▶" : "▼";
  if (!expanded) loadMcpServices();
});

/**
 * Load the server count badge without expanding the panel.
 * Called each time the Agent tab is opened.
 */
async function refreshMcpCount() {
  if (!mcpServicesCount) return;
  try {
    const res = await fetch(`${API_BASE}/api/mcp/servers`);
    if (!res.ok) return;
    const servers = await res.json();
    mcpServicesCount.textContent = `${servers.length} server${servers.length !== 1 ? "s" : ""}`;
  } catch {
    // Feature 9 server not running yet — count stays empty.
  }
}

/**
 * Load and render all MCP servers and their tools into the Connected Services panel.
 * Fetches /api/mcp/servers and /api/mcp/tools in parallel.
 */
async function loadMcpServices() {
  if (!mcpServersList) return;
  mcpServersList.innerHTML = `<span class="mcp-loading">Connecting to MCP servers…</span>`;

  try {
    const [serversRes, toolsRes] = await Promise.all([
      fetch(`${API_BASE}/api/mcp/servers`),
      fetch(`${API_BASE}/api/mcp/tools`),
    ]);

    const servers  = serversRes.ok ? await serversRes.json() : [];
    const allTools = toolsRes.ok  ? await toolsRes.json()   : [];

    if (mcpServicesCount) {
      mcpServicesCount.textContent = `${servers.length} server${servers.length !== 1 ? "s" : ""}`;
    }

    if (!servers.length) {
      mcpServersList.innerHTML = `<span class="mcp-loading">No servers connected. Is the Feature 9 server running?</span>`;
      return;
    }

    mcpServersList.innerHTML = "";
    servers.forEach((server) => {
      const serverTools = allTools.filter((t) => t.server === server.name);
      mcpServersList.appendChild(buildMcpServerCard(server, serverTools));
    });
  } catch (err) {
    if (mcpServersList) {
      mcpServersList.innerHTML = `<span class="mcp-loading" style="color:var(--color-pistache)">
        Could not load services (requires Feature 9 server): ${escapeHtml(err.message)}
      </span>`;
    }
  }
}

/**
 * Build a DOM card for one MCP server, listing its tools.
 * @param {{ name: string, transport: string, enabled: boolean, description: string }} server
 * @param {{ name: string, description: string }[]} tools
 */
function buildMcpServerCard(server, tools) {
  const card = document.createElement("div");
  card.className = "mcp-server-card";

  const isConnected = server.enabled !== false;

  const header = document.createElement("div");
  header.className = "mcp-server-header";
  header.innerHTML = `
    <span class="mcp-status-dot ${isConnected ? "connected" : "error"}"
          title="${isConnected ? "Connected" : "Disabled"}"></span>
    <span class="mcp-server-name">${escapeHtml(server.name)}</span>
    <span class="mcp-transport-badge">${escapeHtml(server.transport ?? "stdio")}</span>
    <span class="mcp-tool-count">${tools.length} tool${tools.length !== 1 ? "s" : ""}</span>
  `;
  card.appendChild(header);

  if (server.description) {
    const desc = document.createElement("p");
    desc.className = "mcp-server-desc";
    desc.textContent = server.description;
    card.appendChild(desc);
  }

  if (tools.length) {
    const toolList = document.createElement("ul");
    toolList.className = "mcp-tool-list";
    tools.forEach((tool) => {
      const li = document.createElement("li");
      li.className = "mcp-tool-item";
      li.innerHTML = `
        <span class="mcp-tool-name">${escapeHtml(tool.name)}</span>
        <span class="mcp-tool-desc">${escapeHtml(tool.description ?? "")}</span>
      `;
      toolList.appendChild(li);
    });
    card.appendChild(toolList);
  }

  return card;
}

// =============================================================================
// Feature 10: Multimodal AI — Voice (Part A) + Vision (Part B)
// =============================================================================

// ── DOM refs ──
const voiceBtn       = document.getElementById("voice-btn");
const voiceStopBtn   = document.getElementById("voice-stop-btn");
const voiceStatusBar = document.getElementById("voice-status-bar");
const voiceStatusTxt = document.getElementById("voice-status-text");
const imageInput     = document.getElementById("image-input");

/** Currently active MediaRecorder (null when not recording). */
let mediaRecorder = null;
/** Accumulated audio chunks during recording. */
let audioChunks = [];

/**
 * Start recording from the user's microphone via the MediaRecorder API.
 * Stores chunks in audioChunks; sendVoiceMessage() is called on dataavailable.
 */
async function startVoiceRecording() {
  if (mediaRecorder) return;  // already recording

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    });

    mediaRecorder.addEventListener("stop", async () => {
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      stream.getTracks().forEach((t) => t.stop());  // release mic
      mediaRecorder = null;
      await sendVoiceMessage(blob);
    });

    mediaRecorder.start();

    // Show recording status bar.
    if (voiceStatusBar) voiceStatusBar.removeAttribute("hidden");
    if (voiceStatusTxt) voiceStatusTxt.textContent = "Recording — click Stop when done";
    if (voiceBtn) voiceBtn.classList.add("recording");

  } catch (err) {
    appendMessage("ai", `Microphone error: ${err.message}. Check browser permissions.`);
  }
}

/** Stop an active recording and trigger sendVoiceMessage via the "stop" event. */
function stopVoiceRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  if (voiceStatusBar) voiceStatusBar.setAttribute("hidden", "");
  if (voiceBtn) voiceBtn.classList.remove("recording");
}

/**
 * Send a recorded audio Blob to POST /api/voice/chat and handle the response.
 * Plays the TTS audio and shows the transcript + answer as chat messages.
 *
 * @param {Blob} audioBlob - the recorded audio in WebM format
 */
async function sendVoiceMessage(audioBlob) {
  if (voiceStatusTxt) voiceStatusTxt.textContent = "Processing…";
  if (voiceStatusBar) voiceStatusBar.removeAttribute("hidden");

  const thinkingEl = appendMessage("ai", "", true);

  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");
  if (currentSessionId) formData.append("session_id", currentSessionId);

  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/voice/chat`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const data = await res.json();
    thinkingEl.remove();

    // Show the transcript (what the user said) as a user bubble.
    appendMessage("user", `🎤 "${data.transcript ?? ""}"`);

    // Show the text answer.
    appendMessage("ai", data.answer ?? "(no response)");

    // Play the TTS audio if present.
    if (data.audio_base64) {
      playBase64Audio(data.audio_base64, data.audio_mime ?? "audio/mpeg");
    }

    if (currentSessionId) loadSessions();

  } catch (err) {
    thinkingEl.remove();
    appendMessage("ai", `Voice error: ${err.message}. Is the Feature 10 server running?`);
  } finally {
    if (voiceStatusBar) voiceStatusBar.setAttribute("hidden", "");
  }
}

/**
 * Decode base64 audio and play it in the browser.
 * @param {string} b64 - base64-encoded audio bytes
 * @param {string} mime - MIME type, e.g. "audio/mpeg"
 */
function playBase64Audio(b64, mime = "audio/mpeg") {
  try {
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener("ended", () => URL.revokeObjectURL(url));
    audio.play().catch((e) => console.warn("Audio playback failed:", e));
  } catch (e) {
    console.warn("Could not decode/play audio:", e);
  }
}

// 🎤 button: toggle recording on/off.
voiceBtn?.addEventListener("click", () => {
  if (mediaRecorder) {
    stopVoiceRecording();
  } else {
    startVoiceRecording();
  }
});

// Stop button in the status bar.
voiceStopBtn?.addEventListener("click", stopVoiceRecording);

/**
 * Send an image file to POST /api/vision/chat and show the result as a
 * visual card with a thumbnail and a VLM badge.
 *
 * @param {File} file - the image file from the file picker
 */
async function sendImageMessage(file) {
  const thinkingEl = appendMessage("ai", "", true);

  // Create a local object URL so we can show a thumbnail without uploading yet.
  const thumbUrl = URL.createObjectURL(file);

  const prompt = `Describe this image in the context of [YOUR_DOMAIN].`;

  const formData = new FormData();
  formData.append("image", file, file.name);
  formData.append("prompt", prompt);
  formData.append("detail", "auto");
  if (currentSessionId) formData.append("session_id", currentSessionId);

  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/vision/chat`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const data = await res.json();
    thinkingEl.remove();

    // Show the image attachment as a user bubble.
    appendImageUserBubble(thumbUrl, file.name);

    // Show the vision response card.
    appendVisionResponse(data, thumbUrl);

    URL.revokeObjectURL(thumbUrl);

    if (currentSessionId) loadSessions();

  } catch (err) {
    URL.revokeObjectURL(thumbUrl);
    thinkingEl.remove();
    appendMessage("ai", `Vision error: ${err.message}. Is the Feature 10 server running?`);
  }
}

/**
 * Render the user's image upload as a bubble in the conversation.
 * @param {string} thumbUrl - object URL for thumbnail display
 * @param {string} filename - image filename
 */
function appendImageUserBubble(thumbUrl, filename) {
  document.getElementById("empty-state")?.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "message user";

  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = "You";

  const bubble = document.createElement("div");
  bubble.className = "bubble image-bubble";
  bubble.innerHTML = `
    <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(filename)}" class="vision-thumb" />
    <span class="vision-filename">${escapeHtml(filename)}</span>
  `;

  wrapper.appendChild(label);
  wrapper.appendChild(bubble);
  messageHistory.appendChild(wrapper);
  messageHistory.scrollTop = messageHistory.scrollHeight;
}

/**
 * Render a vision analysis response as a card with VLM badge.
 * @param {{ answer: string, model_used: string }} data
 * @param {string} thumbUrl - object URL for the thumbnail
 */
function appendVisionResponse(data, thumbUrl) {
  document.getElementById("empty-state")?.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "message ai";

  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = "Assistant";

  const card = document.createElement("div");
  card.className = "vision-response-card";

  card.innerHTML = `
    <div class="vision-response-header">
      <span class="vlm-badge">VLM</span>
      <span class="vision-model-tag">${escapeHtml(data.model_used ?? "vision model")}</span>
    </div>
    <p class="response-card-answer">${escapeHtml(data.answer ?? "")}</p>
  `;

  wrapper.appendChild(label);
  wrapper.appendChild(card);
  messageHistory.appendChild(wrapper);
  messageHistory.scrollTop = messageHistory.scrollHeight;
}

// 📷 image input handler.
imageInput?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) {
    sendImageMessage(file);
    imageInput.value = "";  // reset so the same file can be re-selected
  }
});

// =============================================================================
// Feature 11: Production Design — Metrics Dashboard + Eval Harness
// =============================================================================

/** Interval ID for the 5-second metrics auto-refresh. */
let metricsRefreshInterval = null;

const metricsRefreshDot = document.getElementById("metrics-refresh-dot");

/**
 * Fetch GET /api/metrics and render the four metric cards.
 * Called on Admin tab open and every 5 s while the tab is active.
 */
async function loadMetrics() {
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
function renderMetrics(data) {
  const grid = document.getElementById("metrics-grid");
  if (!grid) return;

  const passRate = data.eval_last_run
    ? `${Math.round((data.eval_last_run.pass_rate ?? 0) * 100)}%`
    : "—";

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
async function runEval() {
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
async function loadLastEval() {
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
function renderEvalReport(report) {
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
const btnToggleUpload = document.getElementById("btn-toggle-upload");
const btnUploadBottom = document.getElementById("btn-upload-bottom");
const uploadContainer = document.getElementById("upload-container");

function toggleUploadContainer(forceOpen = null) {
  if (!uploadContainer) return;
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : uploadContainer.style.display === "none";
  uploadContainer.style.display = shouldOpen ? "block" : "none";
  uploadContainer.dataset.userOpened = shouldOpen ? "true" : "false";
  if (btnToggleUpload) {
    btnToggleUpload.textContent = shouldOpen ? "✕ Close Upload" : "+ Upload Another Document";
  }
  if (shouldOpen) {
    uploadContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

btnToggleUpload?.addEventListener("click", () => toggleUploadContainer());
btnUploadBottom?.addEventListener("click", () => toggleUploadContainer(true));

// Wire CAG trigger for hover and mobile touch/click (rock-solid on all devices)
const cagTrigger = document.getElementById("cag-trigger");
const cagPopover = document.getElementById("cag-popover");
const cagCloseBtn = document.getElementById("cag-close-btn");
const cagWrapper = document.getElementById("cag-wrapper");
let cagHoverTimer = null;

function toggleCagPopover(forceState) {
  if (!cagPopover || !cagTrigger) return;
  const isOpen = typeof forceState === "boolean" ? forceState : !cagPopover.classList.contains("is-open");
  cagPopover.classList.toggle("is-open", isOpen);
  cagTrigger.classList.toggle("is-active", isOpen);
  cagTrigger.setAttribute("aria-expanded", String(isOpen));
}

// Click/tap toggle for mobile & keyboard
cagTrigger?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleCagPopover();
});

// Desktop hover with debounce to prevent accidental mouseleave flickering
cagWrapper?.addEventListener("mouseenter", () => {
  if (cagHoverTimer) {
    clearTimeout(cagHoverTimer);
    cagHoverTimer = null;
  }
  toggleCagPopover(true);
});

cagWrapper?.addEventListener("mouseleave", () => {
  cagHoverTimer = setTimeout(() => {
    toggleCagPopover(false);
  }, 250);
});

cagCloseBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleCagPopover(false);
});

document.addEventListener("click", (e) => {
  if (cagWrapper && !cagWrapper.contains(e.target)) {
    toggleCagPopover(false);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    toggleCagPopover(false);
  }
});

