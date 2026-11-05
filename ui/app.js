/* =============================================================================
   AI Engineering Bootcamp · BlockseBlock
   app.js — grows additively; each feature adds a new section.
   ============================================================================= */

// The base URL of the FastAPI server.
// When opening index.html directly from disk (file://) the API won't be reachable
// and requests will fail — run `uvicorn main:app` and open http://localhost:8000.
const API_BASE = "";

// =============================================================================
// Theme Management (Dark Mode / Light Mode)
// =============================================================================
const THEME_STORAGE_KEY = "askraggy_theme";
let currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || "dark";

const themeToggleBtn = document.getElementById("theme-toggle-btn");
const themeIcon = document.getElementById("theme-icon");

const SUN_SVG = `<svg class="sun-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;

const MOON_SVG = `<svg class="moon-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);

  if (themeToggleBtn) {
    if (theme === "dark") {
      themeToggleBtn.title = "Switch to Light Mode";
      themeToggleBtn.setAttribute("aria-label", "Switch to Light Mode");
      if (themeIcon) themeIcon.innerHTML = SUN_SVG;
    } else {
      themeToggleBtn.title = "Switch to Dark Mode";
      themeToggleBtn.setAttribute("aria-label", "Switch to Dark Mode");
      if (themeIcon) themeIcon.innerHTML = MOON_SVG;
    }
  }
}

themeToggleBtn?.addEventListener("click", () => {
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
});

// Initialize theme immediately
applyTheme(currentTheme);

// =============================================================================
// BYOK (Bring Your Own Key) & Centralized Request Headers
// =============================================================================
const BYOK_STORAGE_KEY = "askraggy_byok_key";
let activeByokKey = localStorage.getItem(BYOK_STORAGE_KEY) || "";
let activeTenantId = "";

/**
 * Return headers object with content-type, active tenant ID, and optional BYOK key.
 * @param {Record<string, string>} extraHeaders
 * @returns {Record<string, string>}
 */
function getAuthHeaders(extraHeaders = {}) {
  const headers = { "Content-Type": "application/json", ...extraHeaders };
  if (activeTenantId) {
    headers["X-Tenant-ID"] = activeTenantId;
  }
  const key = (activeByokKey || localStorage.getItem(BYOK_STORAGE_KEY) || "").trim();
  if (key) {
    headers["X-User-API-Key"] = key;
  }
  return headers;
}

/**
 * Render a high-visibility, friendly rate-limit notice in the chat when shared demo quota is reached.
 * @param {"chat"|"doc"|"agent"} containerType
 */
function renderRateLimitNotice(containerType = "chat") {
  const cardHtml = `
    <div class="rate-limit-card" role="alert" style="margin: 0.85rem 0; padding: 1.15rem 1.25rem; border-radius: 12px; border: 1px solid rgba(224, 86, 36, 0.4); background: rgba(224, 86, 36, 0.08); box-shadow: 0 4px 16px rgba(0,0,0,0.2);">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.45rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 600; font-size: 0.95rem; color: #ff8c66;">
          <span style="font-size: 1.15rem;">⚠️</span>
          <span>Free Demo Quota Reached</span>
        </div>
        <span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 999px; background: rgba(224,86,36,0.2); color: #ffab91; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;">Rate Limited</span>
      </div>
      <p style="margin: 0 0 0.85rem 0; font-size: 0.86rem; color: var(--color-silver, #b0b4ba); line-height: 1.5;">
        AskRaggy is currently experiencing high public demo traffic. The shared demo quota has been reached for this minute.
      </p>
      <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
        <button type="button" class="btn btn-sm btn-cream" onclick="switchTab('admin'); const inp = document.getElementById('byok-key-input'); if(inp) setTimeout(() => { inp.scrollIntoView({behavior: 'smooth', block: 'center'}); inp.focus(); }, 250);" style="font-weight: 600; display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.9rem; cursor: pointer;">
          <span>⚙️</span> Add Free Key in Settings
        </button>
        <span style="font-size: 0.8rem; color: var(--color-pistache, #a8b89e);">
          Takes 10 seconds · 100% free at <strong>console.groq.com</strong>
        </span>
      </div>
    </div>
  `;

  if (containerType === "chat") {
    chatMessages?.insertAdjacentHTML("beforeend", cardHtml);
    chatMessages?.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });
  } else if (containerType === "doc") {
    docChatMessages?.insertAdjacentHTML("beforeend", cardHtml);
    docChatMessages?.scrollTo({ top: docChatMessages.scrollHeight, behavior: "smooth" });
  } else if (containerType === "agent") {
    agentMessages?.insertAdjacentHTML("beforeend", cardHtml);
    agentMessages?.scrollTo({ top: agentMessages.scrollHeight, behavior: "smooth" });
  }
}

// =============================================================================
// Audio Notification Chime (Web Audio API)
// =============================================================================
let audioNotificationCtx = null;
let soundNotificationsEnabled = localStorage.getItem("askraggy_sound") !== "false";

const soundToggleBtn = document.getElementById("sound-toggle-btn");
const soundIcon = document.getElementById("sound-icon");

const SOUND_ON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;

const SOUND_MUTED_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;

function updateSoundToggleUI() {
  if (!soundToggleBtn) return;
  if (soundNotificationsEnabled) {
    soundToggleBtn.classList.remove("muted");
    soundToggleBtn.classList.add("active");
    soundToggleBtn.setAttribute("aria-pressed", "true");
    soundToggleBtn.title = "Sound notifications active (Click to mute)";
    if (soundIcon) soundIcon.innerHTML = SOUND_ON_SVG;
  } else {
    soundToggleBtn.classList.add("muted");
    soundToggleBtn.classList.remove("active");
    soundToggleBtn.setAttribute("aria-pressed", "false");
    soundToggleBtn.title = "Sound notifications muted (Click to unmute)";
    if (soundIcon) soundIcon.innerHTML = SOUND_MUTED_SVG;
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

// =============================================================================
// Generation Control & Abort Tracking (ChatGPT & Gemini style Stop button)
// =============================================================================
let activeChatAbortController = null;
let activeDocAbortController = null;
let activeAgentAbortController = null;

const SEND_ICON_SVG = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;

const STOP_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5" ry="2.5"></rect></svg>`;

/** Toggle send button between normal send mode and active Stop generating mode */
function setButtonStopState(btn, isStop, defaultTitle = "Send message") {
  if (!btn) return;
  if (isStop) {
    btn.classList.add("btn-circle-stop");
    btn.disabled = false;
    btn.title = "Stop generating (Esc)";
    btn.setAttribute("aria-label", "Stop generating");
    btn.innerHTML = STOP_ICON_SVG;
  } else {
    btn.classList.remove("btn-circle-stop");
    btn.disabled = false;
    btn.title = defaultTitle;
    btn.setAttribute("aria-label", defaultTitle);
    btn.innerHTML = SEND_ICON_SVG;
  }
}

/** Render a clean "Generation stopped" notice badge inside an AI message */
function appendStoppedNotice(context = "general") {
  const wrapper = document.createElement("div");
  wrapper.className = "message ai stopped-notice-message";

  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = "Assistant";

  const bubble = document.createElement("div");
  bubble.className = "bubble stopped-bubble";
  bubble.innerHTML = `
    <span class="stopped-badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="2"></rect>
      </svg>
      Generation stopped
    </span>
  `;

  wrapper.appendChild(label);
  wrapper.appendChild(bubble);

  if (context === "doc") {
    if (docMessageHistory) {
      docMessageHistory.appendChild(wrapper);
      docMessageHistory.scrollTop = docMessageHistory.scrollHeight;
    }
  } else if (context === "agent") {
    if (agentHistory) {
      agentHistory.appendChild(wrapper);
      agentHistory.scrollTop = agentHistory.scrollHeight;
    }
  } else {
    if (messageHistory) {
      messageHistory.appendChild(wrapper);
      messageHistory.scrollTop = messageHistory.scrollHeight;
    }
  }
}

/**
 * Global Escape key listener: stop any running generation immediately.
 */
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (activeChatAbortController) {
      e.preventDefault();
      activeChatAbortController.abort();
    }
    if (activeDocAbortController) {
      e.preventDefault();
      activeDocAbortController.abort();
    }
    if (activeAgentAbortController) {
      e.preventDefault();
      activeAgentAbortController.abort();
    }
  }
});

// =============================================================================
// Message Edit Functionality (ChatGPT & Gemini style inline message editor)
// =============================================================================

/** Start inline editing of an existing user message */
function startEditMessage(msgWrapper, bubbleEl, originalText, contextType = "general") {
  if (msgWrapper.querySelector(".user-inline-edit-box")) return;

  const currentText = msgWrapper.dataset.rawText || bubbleEl.textContent.trim() || originalText;
  bubbleEl.style.display = "none";
  const actionsRow = msgWrapper.querySelector(".user-msg-actions");
  if (actionsRow) actionsRow.style.display = "none";

  const editBox = document.createElement("div");
  editBox.className = "user-inline-edit-box";

  const textarea = document.createElement("textarea");
  textarea.className = "user-inline-edit-input";
  textarea.value = currentText;
  textarea.rows = Math.min(6, Math.max(2, Math.ceil(currentText.length / 45)));

  const buttonsRow = document.createElement("div");
  buttonsRow.className = "user-inline-edit-buttons";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn-edit-cancel";
  cancelBtn.textContent = "Cancel";

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "btn-edit-submit";
  submitBtn.textContent = "Save & Submit";

  buttonsRow.appendChild(cancelBtn);
  buttonsRow.appendChild(submitBtn);

  editBox.appendChild(textarea);
  editBox.appendChild(buttonsRow);

  msgWrapper.insertBefore(editBox, bubbleEl.nextSibling);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  function cancelEdit() {
    editBox.remove();
    bubbleEl.style.display = "";
    if (actionsRow) actionsRow.style.display = "";
  }

  cancelBtn.addEventListener("click", cancelEdit);

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitEdit();
    }
  });

  async function submitEdit() {
    const newText = textarea.value.trim();
    if (!newText) return;
    if (newText === currentText) {
      cancelEdit();
      return;
    }

    editBox.remove();
    bubbleEl.textContent = newText;
    msgWrapper.dataset.rawText = newText;
    bubbleEl.style.display = "";
    if (actionsRow) actionsRow.style.display = "";

    if (contextType === "general") {
      await handleGeneralChatEdit(msgWrapper, newText);
    } else if (contextType === "doc") {
      await handleDocChatEdit(msgWrapper, newText);
    } else if (contextType === "agent") {
      await handleAgentChatEdit(msgWrapper, newText);
    }
  }

  submitBtn.addEventListener("click", submitEdit);
}

/** Handle saving & submitting an edited user message in General Chat */
async function handleGeneralChatEdit(msgWrapper, newText) {
  const children = Array.from(messageHistory.children).filter(el => el.classList.contains("message"));
  const targetIndex = children.indexOf(msgWrapper);
  if (targetIndex !== -1) {
    children.slice(targetIndex + 1).forEach(el => el.remove());

    if (currentSessionId) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;
        await fetch(`${API_BASE}/api/sessions/${currentSessionId}/truncate`, {
          method: "POST",
          headers,
          body: JSON.stringify({ keep_count: targetIndex }),
        });
      } catch (e) {
        console.warn("Could not truncate session history:", e);
      }
    }
  }

  await sendMessage(newText, msgWrapper);
}

/** Handle saving & submitting an edited user query in Document Chat */
async function handleDocChatEdit(msgWrapper, newText) {
  const children = Array.from(docMessageHistory.children).filter(el => el.classList.contains("message") || el.classList.contains("doc-qa-card"));
  const targetIndex = children.indexOf(msgWrapper);
  if (targetIndex !== -1) {
    children.slice(targetIndex + 1).forEach(el => el.remove());
  }
  await sendDocMessage(newText, msgWrapper);
}

/** Handle saving & submitting an edited user query in Agent Chat */
async function handleAgentChatEdit(msgWrapper, newText) {
  const children = Array.from(agentHistory.children).filter(el => el.classList.contains("message"));
  const targetIndex = children.indexOf(msgWrapper);
  if (targetIndex !== -1) {
    children.slice(targetIndex + 1).forEach(el => el.remove());

    if (currentSessionId) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;
        await fetch(`${API_BASE}/api/sessions/${currentSessionId}/truncate`, {
          method: "POST",
          headers,
          body: JSON.stringify({ keep_count: targetIndex }),
        });
      } catch (e) {
        console.warn("Could not truncate agent session history:", e);
      }
    }
  }
  await runAgent(newText, msgWrapper);
}

/**
 * Append a message bubble to the conversation history.
 * Adds an Edit button for user messages to allow editing prior prompts.
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
  wrapper.dataset.role = role;
  if (role === "user" && text) {
    wrapper.dataset.rawText = text;
  }

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

  // Attach Edit button on user messages (Gemini / ChatGPT style)
  if (role === "user" && !isThinking) {
    const actionsRow = document.createElement("div");
    actionsRow.className = "user-msg-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-msg-edit";
    editBtn.title = "Edit message";
    editBtn.setAttribute("aria-label", "Edit message");
    editBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
      <span>Edit</span>
    `;

    editBtn.addEventListener("click", () => {
      startEditMessage(wrapper, bubble, wrapper.dataset.rawText || text, "general");
    });

    actionsRow.appendChild(editBtn);
    wrapper.appendChild(actionsRow);
  }

  messageHistory.appendChild(wrapper);

  // Keep the latest message in view.
  messageHistory.scrollTop = messageHistory.scrollHeight;

  return wrapper;
}

/** Send the current input value or edited text to the appropriate chat endpoint with abort capability. */
async function sendMessage(overrideText = null, existingUserEl = null) {
  const text = (overrideText ?? chatInput.value).trim();
  if (!text) return;

  if (chatInput) chatInput.value = "";

  let userEl = existingUserEl;
  if (!userEl) {
    userEl = appendMessage("user", text);
  }

  const thinkingEl = appendMessage("ai", "", true);

  // Activate Stop generation state
  activeChatAbortController = new AbortController();
  setButtonStopState(sendBtn, true, "Send message");

  const isStructured = structuredToggle?.checked ?? true;
  const isSmartMode = smartToggle?.checked ?? true;

  // Smart Mode requires a session. Auto-create one if none exists yet.
  if (isSmartMode && !currentSessionId) {
    try {
      const sRes = await fetch(`${API_BASE}/api/sessions`, {
        method: "POST",
        signal: activeChatAbortController.signal,
      });
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

  // Build headers — includes X-Tenant-ID and BYOK X-User-API-Key if set
  const headers = getAuthHeaders();

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: text }),
      signal: activeChatAbortController.signal,
    });

    if (!response.ok) {
      if (response.status === 429) {
        thinkingEl.remove();
        renderRateLimitNotice("chat");
        playNotificationSound();
        return;
      }
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
    if (err.name === "AbortError") {
      appendStoppedNotice("general");
    } else if (err.message && (err.message.includes("429") || err.message.toLowerCase().includes("rate limit"))) {
      renderRateLimitNotice("chat");
    } else {
      appendMessage("ai", `Error: ${err.message}. Is the server running?`);
    }
  } finally {
    activeChatAbortController = null;
    setButtonStopState(sendBtn, false, "Send message");
    chatInput.focus();
  }
}

// Send on button click or Enter key (supports stopping while generating).
sendBtn.addEventListener("click", () => {
  if (activeChatAbortController) {
    activeChatAbortController.abort();
    activeChatAbortController = null;
    return;
  }
  sendMessage();
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (activeChatAbortController) return;
    sendMessage();
  }
});

// =============================================================================
// Active Domain and Document State
// =============================================================================
let currentDomainName = "NeoIntelli HR & Enterprise Operations";
let activeDocumentId = null;
let currentDocsCache = [];

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
    if (info.domain_name || info.assistant_name) {
      currentDomainName = info.domain_name || info.assistant_name;
      const domainDisplay = document.getElementById("welcome-domain-display");
      if (domainDisplay) {
        domainDisplay.textContent = currentDomainName;
      }
      const domainDesc = document.getElementById("welcome-domain-desc");
      if (domainDesc) {
        domainDesc.textContent = currentDomainName;
      }
      const agentDomainDisplay = document.getElementById("agent-domain-display");
      if (agentDomainDisplay) {
        agentDomainDisplay.textContent = currentDomainName;
      }
      const headerDomainDisplay = document.getElementById("header-domain-display");
      if (headerDomainDisplay) {
        headerDomainDisplay.textContent = currentDomainName;
      }
    }

    card.innerHTML = `
      <span>Domain: <strong class="domain-info-badge">${escapeHtml(currentDomainName)}</strong></span>
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
// Toast Notifications & Custom Confirmation Modal
// =============================================================================

/** Show an accessible toast notification banner. */
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast-pill toast-${type}`;

  const iconMap = {
    success: "✅",
    error: "❌",
    info: "ℹ️",
    warning: "⚠️",
  };
  const icon = iconMap[type] || "ℹ️";

  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${icon}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
    <button type="button" class="toast-close" aria-label="Close notification">✕</button>
  `;

  const removeToast = () => {
    toast.classList.add("toast-fade-out");
    setTimeout(() => {
      toast.remove();
    }, 200);
  };

  toast.querySelector(".toast-close")?.addEventListener("click", removeToast);
  toast.addEventListener("click", removeToast);

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));

  setTimeout(removeToast, 4200);
}

/**
 * Show a sleek modal dialog to confirm an action. Returns a Promise resolving to boolean.
 */
function showConfirmDialog({
  title = "Confirm Action",
  subtitle = "This action cannot be undone.",
  itemName = "",
  bodyHtml = null,
  icon = "🗑️",
  confirmText = "Delete",
  confirmDanger = true,
}) {
  return new Promise((resolve) => {
    const backdrop = document.getElementById("confirm-modal-backdrop");
    const titleEl = document.getElementById("confirm-modal-title");
    const subtitleEl = document.getElementById("confirm-modal-subtitle");
    const bodyEl = document.getElementById("confirm-modal-body");
    const iconEl = document.getElementById("confirm-modal-icon");
    const cancelBtn = document.getElementById("confirm-modal-cancel");
    const confirmBtn = document.getElementById("confirm-modal-confirm");
    const closeBtn = document.getElementById("confirm-modal-close");
    const btnText = document.getElementById("confirm-modal-btn-text");
    const spinner = document.getElementById("confirm-modal-spinner");

    if (!backdrop) {
      resolve(window.confirm(`${title}\n${itemName}`));
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;
    if (iconEl) iconEl.textContent = icon;
    if (btnText) btnText.textContent = confirmText;
    if (spinner) spinner.hidden = true;

    if (bodyHtml) {
      if (bodyEl) bodyEl.innerHTML = bodyHtml;
    } else if (bodyEl) {
      bodyEl.innerHTML = `Are you sure you want to delete <strong class="modal-highlight">${escapeHtml(itemName || "this item")}</strong>?<br><span class="modal-hint">All associated chunks, embeddings, and context will be permanently removed.</span>`;
    }

    if (confirmBtn) {
      confirmBtn.className = confirmDanger ? "btn btn-danger" : "btn btn-primary";
      confirmBtn.disabled = false;
    }

    const cleanup = () => {
      backdrop.classList.remove("open");
      setTimeout(() => {
        backdrop.setAttribute("hidden", "");
      }, 160);
      document.removeEventListener("keydown", onKeyDown);
      cancelBtn?.removeEventListener("click", onCancel);
      closeBtn?.removeEventListener("click", onCancel);
      confirmBtn?.removeEventListener("click", onConfirm);
      backdrop.removeEventListener("click", onBackdropClick);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onConfirm = () => {
      if (spinner) spinner.hidden = false;
      if (confirmBtn) confirmBtn.disabled = true;
      cleanup();
      resolve(true);
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };

    const onBackdropClick = (e) => {
      if (e.target === backdrop) {
        onCancel();
      }
    };

    backdrop.removeAttribute("hidden");
    requestAnimationFrame(() => {
      backdrop.classList.add("open");
      confirmBtn?.focus();
    });

    cancelBtn?.addEventListener("click", onCancel);
    closeBtn?.addEventListener("click", onCancel);
    confirmBtn?.addEventListener("click", onConfirm);
    backdrop.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onKeyDown);
  });
}

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

  // ── Answer text with rich formatting ──
  const answer = document.createElement("div");
  answer.className = "response-card-answer markdown-body";
  answer.innerHTML = formatMarkdownToHtml(data.answer ?? "");
  card.appendChild(answer);

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
 * Render a SmartChatResponse cleanly without technical router metrics.
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

  // Only show a clean badge if knowledge base passages were actually retrieved
  const hasCitations = Boolean(data.chunks_used && data.chunks_used.length > 0);
  if (hasCitations) {
    const header = document.createElement("div");
    header.className = "smart-response-header clean-citation-header";
    header.innerHTML = `
      <span class="source-badge citation-badge">
        <span class="badge-icon">📚</span>
        <span>Knowledge Base (${data.chunks_used.length} passage${data.chunks_used.length !== 1 ? "s" : ""})</span>
      </span>
    `;
    card.appendChild(header);
  }

  // ── Answer text with rich markdown formatting ──
  const answer = document.createElement("div");
  answer.className = "response-card-answer markdown-body";
  answer.innerHTML = formatMarkdownToHtml(data.answer ?? "");
  card.appendChild(answer);

  // ── Retrieved supporting citations (collapsed by default) ──
  if (hasCitations) {
    const chunksToggle = document.createElement("button");
    chunksToggle.className = "smart-chunks-toggle";
    chunksToggle.textContent = `▶ View ${data.chunks_used.length} supporting passage${data.chunks_used.length !== 1 ? "s" : ""}`;
    card.appendChild(chunksToggle);

    const chunksContainer = document.createElement("div");
    chunksContainer.className = "smart-chunks-container";
    chunksContainer.hidden = true;

    data.chunks_used.forEach((chunk, i) => {
      const chunkEl = document.createElement("div");
      chunkEl.className = "smart-chunk-item";
      chunkEl.innerHTML = `
        <span class="result-filename-badge">${escapeHtml(chunk.filename || "Document")}</span>
        <span class="result-chunk-meta">chunk ${chunk.chunk_index ?? i}</span>
        <p class="result-text">${escapeHtml((chunk.text || "").slice(0, 240))}${(chunk.text || "").length > 240 ? "…" : ""}</p>
      `;
      chunksContainer.appendChild(chunkEl);
    });
    card.appendChild(chunksContainer);

    chunksToggle.addEventListener("click", () => {
      const hidden = chunksContainer.hidden;
      chunksContainer.hidden = !hidden;
      chunksToggle.textContent = `${hidden ? "▼ Hide" : "▶ View"} ${data.chunks_used.length} supporting passage${data.chunks_used.length !== 1 ? "s" : ""}`;
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

/** Render a clean, transparent, minimalist welcome state for the main chat interface */
function renderEmptyChatState() {
  const domain = currentDomainName || "NeoIntelli HR & Enterprise Operations";
  return `
    <div class="empty-state welcome-clean" id="empty-state">
      <div class="hero-logo-wrapper" aria-hidden="true">
          <img src="askraggy-logo-mark.png?v=5.9.0" alt="AskRaggy Logo" class="hero-clean-logo" width="76" height="76" />
        </div>
      <h1 class="hero-heading">How can I assist you today?</h1>
      <p class="hero-desc">
        Search verified enterprise records, check company policies, or coordinate HR operations for
        <span class="welcome-domain-text" id="welcome-domain-desc">${escapeHtml(domain)}</span>.
      </p>

      <!-- Transparent Modern "Try asking" Cards (directly on background) -->
      <div class="clean-prompt-grid" role="region" aria-label="Suggested prompts">
        <button type="button" class="clean-prompt-card welcome-chip"
          data-query="Who are the staff members and reporting managers in Engineering?">
          <div class="clean-prompt-header">
            <span class="clean-prompt-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </span>
            <strong class="clean-prompt-title">Directory</strong>
          </div>
          <span class="clean-prompt-desc">Staff, roles &amp; teams</span>
        </button>
        <button type="button" class="clean-prompt-card welcome-chip"
          data-query="How does leave approval work and what is our PTO policy?">
          <div class="clean-prompt-header">
            <span class="clean-prompt-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
                <path d="M8 14h.01"></path>
                <path d="M12 14h.01"></path>
                <path d="M16 14h.01"></path>
              </svg>
            </span>
            <strong class="clean-prompt-title">Leave &amp; PTO</strong>
          </div>
          <span class="clean-prompt-desc">Balances &amp; approvals</span>
        </button>
        <button type="button" class="clean-prompt-card welcome-chip"
          data-query="What is the policy for expense reimbursement claims under $100?">
          <div class="clean-prompt-header">
            <span class="clean-prompt-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                <line x1="1" y1="10" x2="23" y2="10"></line>
                <path d="M16 16h2"></path>
              </svg>
            </span>
            <strong class="clean-prompt-title">Expenses</strong>
          </div>
          <span class="clean-prompt-desc">Receipts &amp; policy caps</span>
        </button>
      </div>
    </div>
  `;
}

/** Clear the message history area and reset the empty-state placeholder. */
function clearChat() {
  messageHistory.innerHTML = renderEmptyChatState();
}

/** Mark one session item as active in the sidebar. */
function setActiveSession(sessionId) {
  document.querySelectorAll(".session-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.sessionId === sessionId);
  });

  const btnDeleteActiveChat = document.getElementById("btn-delete-active-chat");

  if (sessionLabel) {
    if (sessionId) {
      sessionLabel.textContent = `session: ${sessionId.slice(0, 8)}…`;
      sessionLabel.removeAttribute("hidden");
      if (btnDeleteActiveChat) btnDeleteActiveChat.removeAttribute("hidden");
    } else {
      sessionLabel.setAttribute("hidden", "");
      if (btnDeleteActiveChat) btnDeleteActiveChat.setAttribute("hidden", "");
    }
  }
}

/**
 * Fetch all sessions from the API and render them in the sidebar with delete option.
 * Silently does nothing if the /api/sessions endpoint isn't available yet
 * (Feature 1 and 2 servers don't have it).
 */
async function loadSessions() {
  if (!sessionList) return;

  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/sessions`, { headers });
    if (!res.ok) throw new Error("sessions endpoint not available");

    const sessions = await res.json();

    // Filter out abandoned 0-message sessions so history doesn't flood with ghosts
    const displaySessions = sessions.filter(
      (s) => s.message_count > 0 || s.id === currentSessionId
    );

    if (!displaySessions.length) {
      sessionList.innerHTML = `<p class="sidebar-empty">No conversations yet.<br>Click <strong>New Chat</strong> to start.</p>`;
      return;
    }

    sessionList.innerHTML = "";
    displaySessions.forEach((s) => {
      const item = document.createElement("div");
      item.className = "session-item";
      item.dataset.sessionId = s.id;
      if (s.id === currentSessionId) item.classList.add("active");

      const selectBtn = document.createElement("button");
      selectBtn.type = "button";
      selectBtn.className = "session-item-btn";
      selectBtn.title = s.title;
      selectBtn.innerHTML = `
        <div class="session-item-title">${escapeHtml(s.title)}</div>
        <div class="session-item-meta">${s.message_count} message${s.message_count !== 1 ? "s" : ""}</div>
      `;
      selectBtn.addEventListener("click", () => switchToSession(s.id));

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn-delete-session";
      delBtn.title = "Delete conversation";
      delBtn.setAttribute("aria-label", `Delete conversation "${s.title}"`);
      delBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18"></path>
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
        </svg>
      `;

      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const sessionTitle = s.title || "this conversation";
        const confirmed = await showConfirmDialog({
          title: "Delete Conversation?",
          subtitle: "Permanent conversation deletion",
          itemName: sessionTitle,
          bodyHtml: `Are you sure you want to delete <strong class="modal-highlight">${escapeHtml(sessionTitle)}</strong>?<br><span class="modal-hint">This will permanently delete this conversation and its message history.</span>`,
          confirmText: "Delete Chat",
          confirmDanger: true,
        });
        if (!confirmed) return;

        try {
          const delHeaders = {};
          if (activeTenantId) delHeaders["X-Tenant-ID"] = activeTenantId;
          const delRes = await fetch(`${API_BASE}/api/sessions/${s.id}`, { method: "DELETE", headers: delHeaders });
          if (!delRes.ok) throw new Error(`Server returned ${delRes.status}`);
          if (currentSessionId === s.id) {
            currentSessionId = null;
            clearChat();
            setActiveSession(null);
          }
          showToast("Conversation deleted.", "success");
          await loadSessions();
        } catch (err) {
          showToast(`Could not delete conversation: ${err.message}`, "error");
        }
      });

      item.appendChild(selectBtn);
      item.appendChild(delBtn);
      sessionList.appendChild(item);
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
  // If current session is already empty (no messages sent), don't create another empty session
  if (currentSessionId) {
    const currentMsgCount = document.querySelectorAll("#message-history .message").length;
    if (currentMsgCount === 0) {
      clearChat();
      if (window.innerWidth <= 992 || sessionSidebar?.classList.contains('sidebar-open')) toggleMobileSidebar(true);
      if (chatInput) chatInput.focus();
      return;
    }
  }

  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/sessions`, { method: "POST", headers });
    if (!res.ok) throw new Error(`Server error ${res.status}`);

    const data = await res.json();
    currentSessionId = data.session_id;
    clearChat();
    setActiveSession(currentSessionId);
    if (window.innerWidth <= 992 || sessionSidebar?.classList.contains('sidebar-open')) toggleMobileSidebar(true);
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
  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/history`, { headers });
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
    if (window.innerWidth <= 992 || sessionSidebar?.classList.contains('sidebar-open')) toggleMobileSidebar(true);
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

const btnDeleteActiveChat = document.getElementById("btn-delete-active-chat");
btnDeleteActiveChat?.addEventListener("click", async () => {
  if (!currentSessionId) return;
  const confirmed = await showConfirmDialog({
    title: "Delete Current Conversation?",
    subtitle: "Permanent conversation deletion",
    itemName: "Current active conversation",
    bodyHtml: `Are you sure you want to delete the active conversation?<br><span class="modal-hint">All message history for this session will be permanently erased.</span>`,
    confirmText: "Delete Chat",
    confirmDanger: true,
  });
  if (!confirmed) return;

  try {
    const headers = {};
    if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;
    const res = await fetch(`${API_BASE}/api/sessions/${currentSessionId}`, { method: "DELETE", headers });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    currentSessionId = null;
    clearChat();
    setActiveSession(null);
    showToast("Conversation deleted.", "success");
    await loadSessions();
  } catch (err) {
    showToast(`Could not delete conversation: ${err.message}`, "error");
  }
});

// Click delegation on message history for welcome suggestion chips and quick new chat
messageHistory?.addEventListener("click", (e) => {
  const chip = e.target.closest(".welcome-chip");
  if (chip && chip.dataset.query) {
    e.preventDefault();
    e.stopPropagation();
    const query = chip.dataset.query;
    if (chatInput) {
      chatInput.value = "";
      chatInput.blur();
    }
    sendMessage(query);
    return;
  }
  const quickNew = e.target.closest("#btn-quick-new-chat");
  if (quickNew) {
    createNewSession();
  }
});

// Mobile drawer toggle
const mobileSidebarToggle = document.getElementById("mobile-sidebar-toggle");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const sessionSidebar = document.getElementById("session-sidebar");
const sidebarCloseBtn = document.getElementById("sidebar-close-btn");

function toggleMobileSidebar(forceClose = false) {
  if (!sessionSidebar) return;
  if (forceClose) {
    sessionSidebar.classList.remove("sidebar-open");
    if (sidebarBackdrop) {
      sidebarBackdrop.hidden = true;
      sidebarBackdrop.classList.remove("visible");
    }
    document.body.classList.remove("drawer-open");
    return;
  }
  const isOpen = sessionSidebar.classList.toggle("sidebar-open");
  if (sidebarBackdrop) {
    sidebarBackdrop.hidden = !isOpen;
    sidebarBackdrop.classList.toggle("visible", isOpen);
  }
  document.body.classList.toggle("drawer-open", isOpen);
}

mobileSidebarToggle?.addEventListener("click", () => toggleMobileSidebar());
sidebarBackdrop?.addEventListener("click", () => toggleMobileSidebar(true));
sidebarCloseBtn?.addEventListener("click", () => toggleMobileSidebar(true));

// Auto-close drawer on Escape key press
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sessionSidebar?.classList.contains("sidebar-open")) {
    toggleMobileSidebar(true);
  }
});

// Initial data loads (loadSessions, loadDocuments, loadTenantInfo) are safely triggered
// in initApp() at the end of the script after all DOM element references are initialized.

// =============================================================================
// Feature 4: Tab navigation (Chat | Documents)
// =============================================================================

const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels  = document.querySelectorAll(".tab-panel");
const sidebarAdminBtn = document.getElementById("sidebar-admin-btn");
const btnAdminBackChat = document.getElementById("btn-admin-back-chat");

/**
 * Switch the visible tab panel.
 * @param {string} tabName - the data-tab value: "chat", "documents", "agent", or "admin"
 */
function switchTab(tabName) {
  if (tabName === "search") tabName = "documents";
  tabButtons.forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  if (sidebarAdminBtn) {
    const isAdmin = tabName === "admin";
    sidebarAdminBtn.classList.toggle("active", isAdmin);
    sidebarAdminBtn.setAttribute("aria-selected", String(isAdmin));
  }

  tabPanels.forEach((panel) => {
    const show = panel.id === `${tabName}-panel`;
    panel.toggleAttribute("hidden", !show);
  });

  // Toggle top-right document controls in navigation bar
  const docNavControls = document.getElementById("tab-nav-doc-controls");
  if (docNavControls) {
    docNavControls.style.display = tabName === "documents" ? "flex" : "none";
  }
  // Dismiss document popover when switching away
  const docPop = document.getElementById("doc-manager-popover");
  if (docPop) docPop.hidden = true;
  document.getElementById("doc-files-trigger")?.classList.remove("active");
  document.getElementById("doc-files-trigger")?.setAttribute("aria-expanded", "false");

  // Dismiss chunking strategy popover when switching away
  const stratPop = document.getElementById("strategy-popover");
  if (stratPop) stratPop.hidden = true;
  document.getElementById("strategy-trigger-btn")?.classList.remove("active");
  document.getElementById("strategy-trigger-btn")?.setAttribute("aria-expanded", "false");

  // Toggle top-right agent controls in navigation bar (⚡ Quick / 🔄 Multi-Step)
  const agentNavControls = document.getElementById("tab-nav-agent-controls");
  if (agentNavControls) {
    agentNavControls.style.display = tabName === "agent" ? "flex" : "none";
  }
  // Dismiss MCP popover if open when switching away
  const mcpBody = document.getElementById("mcp-services-body");
  if (mcpBody) mcpBody.hidden = true;
  document.getElementById("mcp-services-toggle")?.setAttribute("aria-expanded", "false");
  const mcpChevron = document.querySelector("#mcp-services-toggle .mcp-toggle-chevron");
  if (mcpChevron) mcpChevron.textContent = "▼";

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

sidebarAdminBtn?.addEventListener("click", () => {
  switchTab("admin");
  if (window.innerWidth <= 992 || sessionSidebar?.classList.contains('sidebar-open')) toggleMobileSidebar(true);
});

btnAdminBackChat?.addEventListener("click", () => {
  switchTab("chat");
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
  showToast(`Uploading and indexing "${file.name}"…`, "info");

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

    const uploadedDoc = await res.json().catch(() => null);
    if (uploadedDoc && uploadedDoc.id) {
      activeDocumentId = uploadedDoc.id;
    }

    await loadDocuments();
    showToast(`"${file.name}" uploaded and indexed successfully!`, "success");
    if (docChatInput) {
      docChatInput.disabled = false;
      docChatInput.focus();
    }
  } catch (err) {
    showToast(`Upload failed: ${err.message}`, "error");
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

/** Helper to return a file icon based on file extension */
function getDocFileIcon(filename) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  if (ext === "pdf") return "📕";
  if (ext === "docx" || ext === "doc") return "📘";
  if (ext === "txt") return "📄";
  return "📄";
}

/** Render the list of uploaded documents inside the top-right popover dropdown */
function renderDocPopoverList(popoverListEl, docs, currentActiveId) {
  if (!popoverListEl) return;
  popoverListEl.innerHTML = "";

  if (!docs || !docs.length) {
    popoverListEl.innerHTML = `
      <div class="popover-empty-notice">
        <strong>No documents uploaded yet</strong><br>
        Click "+ Upload More Documents" above to upload PDF, DOCX, or TXT.
      </div>
    `;
    return;
  }

  docs.forEach((doc) => {
    const item = document.createElement("div");
    const isActive = doc.id === currentActiveId;
    item.className = `doc-popover-item ${isActive ? "is-active" : ""}`;
    item.dataset.id = doc.id;

    const icon = getDocFileIcon(doc.filename);
    const chunkInfo = doc.chunk_count !== undefined && doc.chunk_count !== null 
      ? `${doc.chunk_count} chunk${doc.chunk_count !== 1 ? "s" : ""}`
      : "Indexed";
    const strategyInfo = doc.strategy ? ` • ${escapeHtml(doc.strategy)}` : "";

    item.innerHTML = `
      <div class="doc-popover-item-left" title="Ground Q&amp;A in ${escapeHtml(doc.filename)}">
        <span class="doc-file-type-icon">${icon}</span>
        <div class="doc-popover-item-details">
          <span class="doc-popover-item-name" title="${escapeHtml(doc.filename)}">${escapeHtml(doc.filename)}</span>
          <span class="doc-popover-item-meta">${chunkInfo}${strategyInfo}</span>
        </div>
      </div>
      <div class="doc-popover-item-actions">
        ${isActive 
          ? '<span class="doc-active-badge">Active</span>' 
          : `<button type="button" class="btn-select-doc" data-id="${doc.id}" title="Set as active grounded document">Set Active</button>`}
        <button type="button" class="btn-popover-delete" data-id="${doc.id}" title="Delete ${escapeHtml(doc.filename)}" aria-label="Delete document">🗑️</button>
      </div>
    `;

    // Click on item body or "Set Active" to ground chat in this document
    item.querySelector(".doc-popover-item-left")?.addEventListener("click", () => {
      if (activeDocumentId !== doc.id) {
        activeDocumentId = doc.id;
        loadDocuments();
        showToast(`Active grounded document: "${doc.filename}"`, "info");
      }
    });

    item.querySelector(".btn-select-doc")?.addEventListener("click", (e) => {
      e.stopPropagation();
      activeDocumentId = doc.id;
      loadDocuments();
      showToast(`Active grounded document: "${doc.filename}"`, "info");
    });

    // Click delete button
    item.querySelector(".btn-popover-delete")?.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteDocumentById(doc.id);
    });

    popoverListEl.appendChild(item);
  });
}

/** Fetch /api/documents and render the document list, dynamically syncing upload and Q&A state. */
async function loadDocuments() {
  if (!documentList) return;

  const documentDetailsSection = document.getElementById("document-details-section");
  const uploadContainer = document.getElementById("upload-container");
  const btnToggleUpload = document.getElementById("btn-toggle-upload");
  const btnUploadBottom = document.getElementById("btn-upload-bottom");
  const docGroundingBanner = document.getElementById("doc-grounding-banner");
  const groundingTitle = document.getElementById("grounding-title");
  const groundingSubtitle = document.getElementById("grounding-subtitle");
  const documentChatSection = document.getElementById("document-chat-section");
  const docCountBadge = document.getElementById("doc-count-badge");
  const docChatInput = document.getElementById("doc-chat-input");

  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/documents`, { headers });
    if (!res.ok) throw new Error("documents endpoint not available");

    const docs = await res.json();

    const docUploadHint = document.getElementById("doc-upload-hint");
    const docPromptGrid = document.getElementById("doc-prompt-grid");

    if (!docs.length) {
      activeDocumentId = null;
      currentDocsCache = [];

      // 0 documents: show upload guidance hint below the 3 prompt cards
      if (docUploadHint) docUploadHint.style.display = "flex";
      if (docPromptGrid) docPromptGrid.style.display = "grid";

      if (documentDetailsSection) {
        documentDetailsSection.style.display = "none";
      }

      if (docGroundingBanner) {
        docGroundingBanner.style.display = "none";
      }

      if (docChatInput) {
        docChatInput.placeholder = getDocPlaceholder(null);
      }

      if (docCountBadge) docCountBadge.textContent = "0 files";

      // Update doc manager pill in top right
      const docManagerDot = document.getElementById("doc-manager-dot");
      const docManagerLabel = document.getElementById("doc-manager-label");
      const docPopoverBadge = document.getElementById("doc-popover-badge");
      const docPopoverList = document.getElementById("doc-popover-list");

      if (docManagerDot) docManagerDot.classList.remove("active");
      if (docManagerLabel) {
        docManagerLabel.textContent = "No files";
        docManagerLabel.title = "No documents uploaded yet";
      }
      if (docPopoverBadge) docPopoverBadge.textContent = "0 files";
      if (docPopoverList) {
        renderDocPopoverList(docPopoverList, [], null);
      }

      // Clear documentList
      documentList.innerHTML = "";
      loadSearchDocumentFilter([]);
      return;
    }

    // 1+ documents: hide upload guidance hint, SHOW "Try asking" prompt cards
    if (docUploadHint) docUploadHint.style.display = "none";
    if (docPromptGrid) docPromptGrid.style.display = "grid";

    // 1+ documents: show active grounding banner, chat interface, and uploaded documents list below
    if (documentDetailsSection) {
      documentDetailsSection.style.display = "block";
    }
    if (btnToggleUpload) {
      btnToggleUpload.style.display = "none";
    }
    if (btnUploadBottom) {
      btnUploadBottom.style.display = "inline-flex";
    }
    // Upload dropzone above is not needed when documents are uploaded
    if (uploadContainer) {
      uploadContainer.style.display = "none";
    }

    currentDocsCache = docs;
    const readyDocs = docs.filter((d) => d.status === "ready");
    updateStrategyAdvisory();

    // Select active document: prioritize explicitly active doc (e.g. freshly uploaded),
    // otherwise default to the latest uploaded document so older files never interfere!
    let activeDoc = null;
    if (activeDocumentId) {
      activeDoc = readyDocs.find((d) => d.id === activeDocumentId) || docs.find((d) => d.id === activeDocumentId);
    }
    if (!activeDoc) {
      activeDoc = readyDocs[readyDocs.length - 1] || docs[docs.length - 1];
      activeDocumentId = activeDoc ? activeDoc.id : null;
    }
    const activeDocName = activeDoc ? activeDoc.filename : "your document";

    if (docGroundingBanner) {
      docGroundingBanner.style.display = "flex";
      if (groundingTitle) groundingTitle.textContent = `Grounded in: ${activeDocName}`;
      if (groundingSubtitle) groundingSubtitle.textContent = `This chat answers strictly based on "${activeDocName}" with verified source citations.`;
    }
    updateStrategyAdvisory();

    if (documentChatSection) {
      documentChatSection.style.display = "flex";
    }

    // Explicitly ENABLE the input and send button!
    if (docChatInput) {
      docChatInput.disabled = false;
      docChatInput.placeholder = getDocPlaceholder(activeDocName);
    }
    if (docSendBtn) {
      docSendBtn.disabled = false;
    }

    if (docCountBadge) {
      docCountBadge.textContent = `${docs.length} file${docs.length !== 1 ? "s" : ""}`;
    }

    // Update doc manager pill in top right
    const docManagerDot = document.getElementById("doc-manager-dot");
    const docManagerLabel = document.getElementById("doc-manager-label");
    const docPopoverBadge = document.getElementById("doc-popover-badge");
    const docPopoverList = document.getElementById("doc-popover-list");

    if (docManagerDot) docManagerDot.classList.add("active");
    if (docManagerLabel) {
      if (docs.length === 1) {
        docManagerLabel.textContent = activeDocName;
        docManagerLabel.title = activeDocName;
      } else {
        docManagerLabel.textContent = `${activeDocName} (${docs.length})`;
        docManagerLabel.title = `${activeDocName} (and ${docs.length - 1} other file${docs.length > 2 ? 's' : ''})`;
      }
    }
    if (docPopoverBadge) {
      docPopoverBadge.textContent = `${docs.length} file${docs.length !== 1 ? "s" : ""}`;
    }
    if (docPopoverList) {
      renderDocPopoverList(docPopoverList, docs, activeDocumentId);
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

/** Delete a document by ID with verification modal and toast notifications. */
async function deleteDocumentById(docId) {
  const doc = currentDocsCache.find((d) => d.id === docId);
  const docName = doc ? doc.filename : "this document";

  const confirmed = await showConfirmDialog({
    title: "Delete Document?",
    subtitle: "Permanent knowledge base deletion",
    itemName: docName,
    bodyHtml: `Are you sure you want to delete <strong class="modal-highlight">${escapeHtml(docName)}</strong>?<br><span class="modal-hint">All chunked passages and ChromaDB vector embeddings will be permanently erased.</span>`,
    confirmText: "Delete Document",
    confirmDanger: true,
  });

  if (!confirmed) return;

  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/documents/${docId}`, { method: "DELETE", headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    // If deleted document was active, reset activeDocumentId so next document is selected
    if (activeDocumentId === docId) {
      activeDocumentId = null;
    }

    showToast(`"${docName}" was deleted successfully.`, "success");
    await loadDocuments();
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, "error");
  }
}

// ── File input handler (supports multiple files) ──
fileInput?.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  for (const file of files) {
    await uploadFile(file);
  }
  if (fileInput) fileInput.value = "";
});

// ── Drag-and-drop ──
uploadArea?.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("drag-over");
});

uploadArea?.addEventListener("dragleave", () => {
  uploadArea.classList.remove("drag-over");
});

uploadArea?.addEventListener("drop", async (e) => {
  e.preventDefault();
  uploadArea.classList.remove("drag-over");
  const files = Array.from(e.dataTransfer?.files || []);
  for (const file of files) {
    await uploadFile(file);
  }
});

uploadArea?.addEventListener("click", (e) => {
  if (e.target.closest("label") || e.target.closest("input")) return;
  openFileUploadPicker();
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

  searchDocFilter.innerHTML = "";

  try {
    const docs = Array.isArray(preloadedDocs) ? preloadedDocs : await (await fetch(`${API_BASE}/api/documents`)).json();
    currentDocsCache = docs;
    const readyDocs = docs.filter((d) => d.status === "ready");
    updateStrategyAdvisory();

    readyDocs.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.filename;
      if (d.id === activeDocumentId) {
        opt.selected = true;
      }
      searchDocFilter.appendChild(opt);
    });

    if (readyDocs.length > 1) {
      const allOpt = document.createElement("option");
      allOpt.value = "";
      allOpt.textContent = "All uploaded documents";
      searchDocFilter.appendChild(allOpt);
    }

    if (activeDocumentId && readyDocs.some((d) => d.id === activeDocumentId)) {
      searchDocFilter.value = activeDocumentId;
    }
  } catch {
    // Search still works without the filter populated.
  }
}

// Synchronize activeDocumentId and UI when user picks a different document in filter
searchDocFilter?.addEventListener("change", () => {
  activeDocumentId = searchDocFilter.value || null;
  const doc = currentDocsCache.find((d) => d.id === activeDocumentId);
  const groundingTitle = document.getElementById("grounding-title");
  const groundingSubtitle = document.getElementById("grounding-subtitle");
  const docChatInput = document.getElementById("doc-chat-input");

  if (doc) {
    if (groundingTitle) groundingTitle.textContent = `Grounded in: ${doc.filename}`;
    if (groundingSubtitle) groundingSubtitle.textContent = `This chat answers strictly based on "${doc.filename}" with verified source citations.`;
    if (docChatInput) docChatInput.placeholder = getDocPlaceholder(doc.filename);
  } else {
    if (groundingTitle) groundingTitle.textContent = "Grounded in: All uploaded documents";
    if (groundingSubtitle) groundingSubtitle.textContent = "This chat answers across all your uploaded documents with verified source citations.";
    if (docChatInput) docChatInput.placeholder = getDocPlaceholder("your documents");
  }
});

/** Format text removing unprintable boxes or weird glyphs. */
function sanitizeDocText(str) {
  if (!str) return "";
  return str.replace(/[\u25a0-\u25ff\uf000-\uf0ff\ue000-\uf8ff\ufffd]/g, " ").replace(/\s+/g, " ").trim();
}

/** Format markdown into clean HTML with tables, headings, paragraphs, bold, lists, and code */
function formatMarkdownToHtml(markdown) {
  if (!markdown) return "";
  let text = String(markdown).trim();
  let html = escapeHtml(text);

  // Bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic *text*
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline code `text`
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  const rawLines = html.split("\n");
  const output = [];
  let inList = false;
  let inTable = false;
  let tableHeaders = [];
  let tableRows = [];
  let hasDelimiter = false;

  function flushTable() {
    if (!inTable) return;
    if (tableRows.length === 0 && !hasDelimiter) {
      output.push(`<p class="md-paragraph">${tableHeaders.join(" | ")}</p>`);
    } else {
      let tHtml = '<div class="table-container"><table class="rich-table">';
      if (tableHeaders.length > 0) {
        tHtml += '<thead><tr>';
        tableHeaders.forEach(h => { tHtml += `<th>${h}</th>`; });
        tHtml += '</tr></thead>';
      }
      tHtml += '<tbody>';
      tableRows.forEach(row => {
        tHtml += '<tr>';
        row.forEach(cell => { tHtml += `<td>${cell}</td>`; });
        tHtml += '</tr>';
      });
      tHtml += '</tbody></table></div>';
      output.push(tHtml);
    }
    inTable = false;
    tableHeaders = [];
    tableRows = [];
    hasDelimiter = false;
  }

  function flushList() {
    if (inList) {
      output.push("</ul>");
      inList = false;
    }
  }

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();

    // Markdown Table Detection (handles | col1 | col2 |, col1 | col2, and tab-separated)
    let isTableLine = false;
    let isDelimiter = false;
    let cells = [];

    if (line.includes("|")) {
      const clean = line.replace(/^\|/, "").replace(/\|$/, "");
      cells = clean.split("|").map(c => c.trim());
      isDelimiter = cells.every(c => /^[\-:\s]+$/.test(c));
      isTableLine = true;
    } else if (line.includes("\t")) {
      cells = line.split("\t").map(c => c.trim()).filter(c => c.length > 0);
      if (cells.length >= 2) {
        isTableLine = true;
      }
    }

    if (isTableLine) {
      flushList();
      if (isDelimiter) {
        hasDelimiter = true;
        continue;
      }
      if (!inTable) {
        inTable = true;
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    } else {
      flushTable();
    }

    // Headings
    if (line.startsWith("### ")) {
      flushList();
      output.push(`<h4 class="md-heading-3">${line.slice(4)}</h4>`);
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      output.push(`<h3 class="md-heading-2">${line.slice(3)}</h3>`);
      continue;
    }

    // Lists
    if (line.startsWith("- ") || line.startsWith("• ") || line.startsWith("* ")) {
      if (!inList) {
        output.push('<ul class="md-list">');
        inList = true;
      }
      output.push(`<li>${line.replace(/^[-•*]\s*/, "")}</li>`);
      continue;
    } else {
      flushList();
    }

    // Paragraph
    if (line) {
      output.push(`<p class="md-paragraph">${line}</p>`);
    }
  }

  flushList();
  flushTable();

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

  if (role === "user" && !isThinking) {
    wrapper.dataset.role = "user";
    wrapper.dataset.rawText = text;

    const actionsRow = document.createElement("div");
    actionsRow.className = "user-msg-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-msg-edit";
    editBtn.title = "Edit message";
    editBtn.setAttribute("aria-label", "Edit message");
    editBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
      <span>Edit</span>
    `;

    editBtn.addEventListener("click", () => {
      startEditMessage(wrapper, bubble, wrapper.dataset.rawText || text, "doc");
    });

    actionsRow.appendChild(editBtn);
    wrapper.appendChild(actionsRow);
  }

  docMessageHistory.appendChild(wrapper);
  docMessageHistory.scrollTop = docMessageHistory.scrollHeight;

  return wrapper;
}

/** Client-side fallback plain-English synthesizer from top chunks */
function formatClientPlainSummary(query, chunks) {
  const OUT_OF_SCOPE = "I cannot find any information about that in your uploaded document(s).\n\nThis chat is strictly grounded in your file. Please ask a question related to your document.";
  if (!chunks || !chunks.length) {
    return OUT_OF_SCOPE;
  }
  const combinedText = chunks.slice(0, 5).map((c) => c.text || "").join("\n");
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

  // 0. Summarize / Summary / Key Points / Overview / About / Document outline
  if (/\b(summar|summary|key points?|main points?|overview|highlights?|takeaways?|what is this|about|outline|brief)\b/i.test(qLower)) {
    const topSentences = [];
    for (const chunk of chunks.slice(0, 4)) {
      const lines = (chunk.text || "").split("\n");
      for (const rawLine of lines) {
        const clean = rawLine.replace(/^[\s•\-\*]+/, "").trim();
        if (clean.length > 25 && clean.length < 180 && !topSentences.includes(clean)) {
          topSentences.push(clean);
          if (topSentences.length >= 5) break;
        }
      }
      if (topSentences.length >= 5) break;
    }
    const bullets = topSentences.map((s, idx) => idx === 0 ? `• **${s}**` : `• ${s}`).join("\n");
    return `Here is a summary of key points extracted from your uploaded document:\n\n${bullets || "• Document content is indexed and verified."}\n\n*(See the verified document passages below for details.)*`;
  }

  // 1. Identity / Name / Who is
  if (/\b(name|who is|who am|candidate|author|person|whose|identity)\b/i.test(qLower)) {
    const chunkZero = (chunks[0] && chunks[0].text) || "";
    const lines = chunkZero.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && l.length < 80);
    if (lines.length > 0) {
      const firstVal = lines[0].replace(/^(?:resume|cv|curriculum vitae)\s*[-:]?\s*/i, "").trim();
      return `Based on your uploaded document, the primary name / title identified is **${firstVal}**.\n\n*(See the verified document passages below for details.)*`;
    }
  }

  // 2. Contact details / Email / Phone / Links
  if (/\b(contact|email|phone|number|mobile|call|reach|linkedin|github)\b/i.test(qLower)) {
    const emails = combinedText.match(/[\w\.-]+@[\w\.-]+\.\w+/g) || [];
    const phones = combinedText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g) || [];
    const details = [];
    if (emails && emails.length > 0) details.push(`• **Email:** ${emails[0]}`);
    if (phones && phones.length > 0) {
      const cleanPhone = phones[0].trim();
      if (cleanPhone.replace(/\D/g, "").length >= 7) {
        details.push(`• **Phone:** ${cleanPhone}`);
      }
    }
    const liMatch = combinedText.match(/linkedin\.com\/in\/[\w\.-]+/i);
    if (liMatch) details.push(`• **LinkedIn:** ${liMatch[0]}`);
    const ghMatch = combinedText.match(/github\.com\/[\w\.-]+/i);
    if (ghMatch) details.push(`• **GitHub:** ${ghMatch[0]}`);
    if (details.length > 0) {
      return `Based on your uploaded document, here are the documented contact details:\n\n${details.join("\n")}\n\n*(See the verified document passages below for details.)*`;
    }
  }

  // 3. Technical Skills / Stack / Tools
  if (/\b(skill|skills|tech|technology|stack|tool|tools|framework|language)\b/i.test(qLower)) {
    const skillsMatch = combinedText.match(/(?:TECHNICAL\s+SKILLS|SKILLS|CORE\s+COMPETENCIES)[:\s]*([^\n\r]+(?:\n[^\n\r]+)?)/i);
    if (skillsMatch) {
      const skillsText = skillsMatch[1].replace(/\s+/g, " ").trim();
      return `Based on your uploaded document, here is a summary of documented technical skills:\n\n• **Skills & Tools:** ${skillsText}\n\n*(See the verified document passages below for details.)*`;
    }
  }

  // 4. Experience / Work history / Career
  if (/\b(experience|career|work|job|role|roles|intern|company|worked)\b/i.test(qLower)) {
    const expMatch = combinedText.match(/(\d+\+?\s*years?(?:\s+of)?\s+experience)/i);
    const expStr = expMatch ? `you have **${expMatch[1]}**` : "the following career roles are documented";
    const roles = [];
    const lines = combinedText.split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (/\b(developer|engineer|intern|manager|lead|analyst|architect)\b/i.test(line) && line.length < 120) {
        const cleanLine = line.replace(/^[•\-\*\s]+/, "");
        roles.push(`• **${cleanLine}**`);
      }
    }
    const rolesText = roles.length > 0 ? roles.slice(0, 4).join("\n") : "• Professional technical and operational roles documented in the file.";
    return `Based on your uploaded document, ${expStr}:\n\n${rolesText}\n\n*(Below you can review the verified document excerpts confirming these details.)*`;
  }

  // 5. Education / University / Degree
  if (/\b(education|degree|college|university|study|studied|graduat|school|academic)\b/i.test(qLower)) {
    const eduMatch = combinedText.match(/(?:EDUCATION)[:\s]*([^\n\r]+(?:\n[^\n\r]+)?)/i);
    if (eduMatch) {
      const eduText = eduMatch[1].replace(/\s+/g, " ").trim();
      return `Based on your uploaded document, here is your educational background:\n\n• ${eduText}\n\n*(See the verified document passages below for details.)*`;
    }
  }

  // 6. Content keyword matching across sentences for any general document query
  const cleanSentences = combinedText
    .replace(/[\uE000-\uF8FF\u25A0-\u25FF\uFFFD]/g, " ")
    .split(/[\.\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  const tokens = (qLower.match(/[a-z0-9+#\.]+/g) || []).filter((t) => !stopwords.has(t) && t.length > 2);
  const scored = [];
  for (const s of cleanSentences) {
    const sLower = s.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (sLower.includes(t)) score++;
    }
    if (score > 0) {
      scored.push({ score, text: s });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  if (scored.length > 0) {
    const bullets = scored.slice(0, 3).map((item) => `• ${item.text}.`).join("\n");
    return `Based on your uploaded document, here is what was found regarding your question in plain English:\n\n${bullets}\n\n*(See the verified document passages below for supporting evidence.)*`;
  }

  // 7. Unrelated out-of-domain query
  return OUT_OF_SCOPE;
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

  const isCag = Boolean(data && data.mode === "cag");
  const isOutOfScope = !data.evidence || data.evidence.length === 0 || (data.answer && data.answer.includes("cannot find any information"));

  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = isCag ? "AskRaggy · ⚡ CAG Full Context" : "AskRaggy · Grounded in Document";

  const bubble = document.createElement("div");
  bubble.className = "bubble doc-ai-bubble";

  // 1. TOP SECTION: Synthesized human-readable answer in plain English
  const summarySection = document.createElement("div");
  summarySection.className = "doc-summary-section";

  // If auto-routed by the backend, display the intelligent routing badge
  if (data && data.auto_routed && data.reason) {
    const routeTag = document.createElement("div");
    routeTag.className = "doc-auto-route-badge";
    routeTag.innerHTML = `🧠 <strong>Adaptive Routing:</strong> ${escapeHtml(data.reason)}`;
    summarySection.appendChild(routeTag);
  }

  const summaryHeader = document.createElement("div");
  summaryHeader.className = "doc-summary-header";
  const badgeTitle = isCag
    ? "⚡ Cache-Augmented Generation · 100% Full Document Context"
    : (isOutOfScope ? "Notice · Grounded Document Scope" : "Plain English Summary · Grounded in Document");
  summaryHeader.innerHTML = `
    <span class="doc-summary-badge ${isCag ? "cag" : (isOutOfScope ? "out-of-scope" : "")}">
      <span class="summary-badge-icon">${isCag ? "⚡" : (isOutOfScope ? "ℹ️" : "✨")}</span>
      <span class="summary-badge-title">${badgeTitle}</span>
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

  // If backend returned an advisory warning (e.g. large file on CAG)
  if (data && data.warning) {
    const warnBox = document.createElement("div");
    warnBox.className = "doc-cag-warning-alert";
    warnBox.innerHTML = `
      <span>${escapeHtml(data.warning)}</span>
      <button type="button" class="btn-advisory-action amber btn-switch-rag-inline">Switch to RAG</button>
    `;
    warnBox.querySelector(".btn-switch-rag-inline")?.addEventListener("click", () => {
      const sentenceOpt = document.getElementById("strategy-opt-sentence");
      if (sentenceOpt) sentenceOpt.click();
      showToast("Switched to RAG (Sentence-aware) for large document retrieval!", "info");
    });
    bubble.appendChild(warnBox);
  }

  // If backend returned an optimization tip (e.g. small file on RAG)
  if (data && data.tip) {
    const tipBox = document.createElement("div");
    tipBox.className = "doc-cag-tip-alert";
    tipBox.innerHTML = `
      <span>${escapeHtml(data.tip)}</span>
      <button type="button" class="btn-advisory-action green btn-switch-cag-inline">Switch to CAG</button>
    `;
    tipBox.querySelector(".btn-switch-cag-inline")?.addEventListener("click", () => {
      const cagOpt = document.getElementById("strategy-opt-cag");
      if (cagOpt) cagOpt.click();
      showToast("Switched to CAG (Full Context) for 100% full-document visibility!", "success");
    });
    bubble.appendChild(tipBox);
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
async function sendDocMessage(customQuery = null, existingUserEl = null) {
  const query = (typeof customQuery === "string" ? customQuery : (docChatInput?.value || "")).trim();
  if (!query) return;

  if (!currentDocsCache.length || !activeDocumentId) {
    showToast("Please upload a document to enable document questions.", "info");
    return;
  }

  if (docChatInput) docChatInput.value = "";

  let userEl = existingUserEl;
  if (!userEl) {
    userEl = appendDocChatMessage("user", query);
  }

  const thinkingEl = appendDocChatMessage("ai", "", true);

  // Activate Stop generation state for Doc Chat
  activeDocAbortController = new AbortController();
  setButtonStopState(docSendBtn, true, "Ask document");

  const documentId = searchDocFilter?.value || activeDocumentId || null;
  const headers = getAuthHeaders();

  try {
    let data = null;

    // Resolve retrieval mode (auto adaptive, cag, or rag)
    const currentStrategy = strategySelect?.value || "auto";
    const mode = currentStrategy;

    // 1. Primary endpoint: POST /api/documents/ask
    try {
      const res = await fetch(`${API_BASE}/api/documents/ask`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, top_k: 6, document_id: documentId, mode }),
        signal: activeDocAbortController.signal,
      });
      if (res.ok) {
        data = await res.json();
      } else if (res.status === 429) {
        thinkingEl.remove();
        renderRateLimitNotice("doc");
        return;
      }
    } catch {}

    // 2. Secondary alias endpoint: POST /api/search/ask
    if (!data && activeDocAbortController && !activeDocAbortController.signal.aborted) {
      try {
        const res = await fetch(`${API_BASE}/api/search/ask`, {
          method: "POST",
          headers,
          body: JSON.stringify({ query, top_k: 6, document_id: documentId }),
          signal: activeDocAbortController.signal,
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch {}
    }

    // 3. Tertiary GET endpoint: GET /api/documents/ask?query=...
    if (!data && activeDocAbortController && !activeDocAbortController.signal.aborted) {
      try {
        const params = new URLSearchParams({ query });
        if (documentId) params.append("document_id", documentId);
        const res = await fetch(`${API_BASE}/api/documents/ask?${params.toString()}`, {
          method: "GET",
          headers,
          signal: activeDocAbortController.signal,
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch {}
    }

    // 4. Fallback search endpoint: POST /api/search with plain-English synthesis
    if (!data && activeDocAbortController && !activeDocAbortController.signal.aborted) {
      try {
        const res = await fetch(`${API_BASE}/api/search`, {
          method: "POST",
          headers,
          body: JSON.stringify({ query, top_k: 5, document_id: documentId }),
          signal: activeDocAbortController.signal,
        });
        if (res.ok) {
          const rawChunks = await res.json();
          const synthesized = formatClientPlainSummary(query, rawChunks);
          const isUnrelated = synthesized.includes("cannot find any information");
          data = {
            answer: synthesized,
            evidence: isUnrelated ? [] : rawChunks.slice(0, 3),
            total_matches: isUnrelated ? 0 : rawChunks.length,
          };
        }
      } catch {}
    }

    if (!data) {
      data = {
        answer: "I cannot find any information about that in your uploaded document(s).\n\nThis chat is strictly grounded in your file. Please ask a question related to your document.",
        evidence: [],
        total_matches: 0,
      };
    }

    thinkingEl.remove();
    appendDocAiResponse(data);
  } catch (err) {
    thinkingEl.remove();
    if (err.name === "AbortError") {
      appendStoppedNotice("doc");
    } else {
      appendDocChatMessage("ai", `Error answering from document: ${err.message}`);
    }
  } finally {
    activeDocAbortController = null;
    setButtonStopState(docSendBtn, false, "Ask document");
    docChatInput?.focus();
  }
}

// Wire Document Chat events (supports stopping while generating)
docSendBtn?.addEventListener("click", () => {
  if (activeDocAbortController) {
    activeDocAbortController.abort();
    activeDocAbortController = null;
    return;
  }
  sendDocMessage();
});

docChatInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (activeDocAbortController) return;
    sendDocMessage();
  }
});

// Quick prompt chips delegate click
document.addEventListener("click", (e) => {
  const chip = e.target.closest(".doc-prompt-chip");
  if (chip && chip.dataset.query) {
    e.preventDefault();
    e.stopPropagation();
    if (docChatInput) {
      docChatInput.value = "";
      docChatInput.blur();
    }
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
// Feature 6: Admin panel — tenant switcher + dynamic multi-tenant mode + Knowledge Digest
// =============================================================================

/** The active X-Tenant-ID header value. Empty string = no custom tenant. */
activeTenantId = activeTenantId || "";
let isMultiTenantEnabled = false;

const tenantIdInput           = document.getElementById("tenant-id-input");
const tenantApplyBtn          = document.getElementById("tenant-apply-btn");
const tenantClearBtn          = document.getElementById("tenant-clear-btn");
const tenantInfoCard          = document.getElementById("tenant-info-card");
const toggleMultiTenantSwitch = document.getElementById("toggle-multi-tenant-switch");
const tenantToggleLabelText   = document.getElementById("tenant-toggle-label-text");
const sidebarTenantPill       = document.getElementById("sidebar-tenant-pill");
const digestRebuildBtn        = document.getElementById("digest-rebuild-btn");
const digestViewBtn           = document.getElementById("digest-view-btn");
const digestCard              = document.getElementById("digest-card");
const retrievalsLoadBtn       = document.getElementById("retrievals-load-btn");
const retrievalsList          = document.getElementById("retrievals-list");

/** Update multi-tenant status indicators in the UI */
function updateMultiTenantUI(info) {
  const enabled = Boolean(info?.multi_tenant_enabled);
  isMultiTenantEnabled = enabled;
  const activeId = activeTenantId || info?.tenant_id || "default";

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
async function loadTenantInfo() {
  if (!tenantInfoCard) return;

  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

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
async function applyTenant(newTenantId, announce = true) {
  activeTenantId = (newTenantId || "").trim();
  if (tenantIdInput) tenantIdInput.value = activeTenantId;

  const effectiveName = activeTenantId || "default";
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
    await applyTenant(activeTenantId, false);
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

/** Check session state when entering agent tab. Input is always enabled. */
function checkAgentSessionState() {
  if (agentNoSession) agentNoSession.hidden = true;
  if (agentInput) agentInput.disabled = false;
  if (agentSendBtn) agentSendBtn.disabled = false;
}

/** Append a user message bubble to the agent history. */
function agentAppendUser(text) {
  agentEmptyState?.remove();
  const wrapper = document.createElement("div");
  wrapper.className = "message user";
  wrapper.dataset.role = "user";
  wrapper.dataset.rawText = text;

  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = "You";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  wrapper.appendChild(label);
  wrapper.appendChild(bubble);

  const actionsRow = document.createElement("div");
  actionsRow.className = "user-msg-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn-msg-edit";
  editBtn.title = "Edit message";
  editBtn.setAttribute("aria-label", "Edit message");
  editBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
    <span>Edit</span>
  `;

  editBtn.addEventListener("click", () => {
    startEditMessage(wrapper, bubble, wrapper.dataset.rawText || text, "agent");
  });

  actionsRow.appendChild(editBtn);
  wrapper.appendChild(actionsRow);

  agentHistory.appendChild(wrapper);
  agentHistory.scrollTop = agentHistory.scrollHeight;
  return wrapper;
}

/** Append a thinking indicator to the agent history. Returns the element. */
function agentAppendThinking() {
  const wrapper = document.createElement("div");
  wrapper.className = "message ai thinking";
  const label = document.createElement("span");
  label.className = "role-label";
  label.innerHTML = "<strong>AskRaggy</strong> · Autonomous HR Agent";
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
  label.innerHTML = "<strong>AskRaggy</strong> · Autonomous HR Agent";

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
  const answerEl = document.createElement("div");
  answerEl.className = "response-card-answer";
  answerEl.innerHTML = formatMarkdownToHtml(data.result ?? "");
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
async function runAgent(overrideText = null, existingUserEl = null) {
  const text = (overrideText ?? agentInput?.value)?.trim();
  if (!text) return;

  if (agentInput) agentInput.value = "";

  let userEl = existingUserEl;
  if (!userEl) {
    userEl = agentAppendUser(text);
  }

  const thinkingEl = agentAppendThinking();

  // Activate Stop generation state for Agent Chat
  activeAgentAbortController = new AbortController();
  setButtonStopState(agentSendBtn, true, "Run agent");

  // Auto-provision session in background if none active
  if (!currentSessionId) {
    try {
      const headers = {};
      if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;
      const sRes = await fetch(`${API_BASE}/api/sessions`, {
        method: "POST",
        headers,
        signal: activeAgentAbortController.signal,
      });
      if (sRes.ok) {
        const sData = await sRes.json();
        currentSessionId = sData.session_id;
        setActiveSession(currentSessionId);
        await loadSessions();
      }
    } catch {}
  }

  if (!currentSessionId) {
    showToast("Unable to initialize session for agent.", "error");
    activeAgentAbortController = null;
    setButtonStopState(agentSendBtn, false, "Run agent");
    return;
  }

  const headers = getAuthHeaders();

  try {
    const res = await fetch(
      `${API_BASE}/api/sessions/${currentSessionId}/agent/run`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ message: text }),
        signal: activeAgentAbortController.signal,
      },
    );

    if (!res.ok) {
      if (res.status === 429) {
        thinkingEl.remove();
        renderRateLimitNotice("agent");
        return;
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const data = await res.json();
    thinkingEl.remove();
    agentAppendResponse(data);
    loadSessions();  // update sidebar message count
  } catch (err) {
    thinkingEl.remove();
    if (err.name === "AbortError") {
      appendStoppedNotice("agent");
    } else {
      agentAppendResponse({
        result: `Error: ${err.message}. Is the Feature 7 server running?`,
        steps: [],
        tools_used: [],
      });
    }
  } finally {
    activeAgentAbortController = null;
    setButtonStopState(agentSendBtn, false, "Run agent");
    agentInput?.focus();
  }
}

agentSendBtn?.addEventListener("click", () => {
  if (activeAgentAbortController) {
    activeAgentAbortController.abort();
    activeAgentAbortController = null;
    return;
  }
  dispatchAgent();
});

agentInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (activeAgentAbortController) return;
    dispatchAgent();
  }
});

// Wire up example prompt buttons and chips.
document.querySelectorAll(".agent-example-btn, .agent-prompt-chip").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const promptText = (
      btn.dataset.prompt ||
      btn.querySelector(".agent-example-text")?.textContent?.trim() ||
      btn.textContent?.trim() ||
      ""
    );
    if (agentInput) {
      agentInput.value = "";
      agentInput.blur();
    }
    if (agentMode === "quick" && isComplexMultiStepQuery(promptText)) {
      showMultiStepModal(promptText);
      return;
    }
    if (agentMode === "multistep") {
      runMultiStepAgent(promptText);
    } else {
      runAgent(promptText);
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
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setAgentMode(btn.dataset.mode);
  });
});

function setAgentMode(mode) {
  agentMode = mode;
  agentModeBtns.forEach((b) => b.classList.toggle("active", b.dataset.mode === agentMode));
}

/** Check if a user's prompt is a compound or multi-action workflow. */
function isComplexMultiStepQuery(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();

  // Explicit connectors & sequence words
  const sequencePatterns = [
    /\band\s+then\b/,
    /\bafter\s+(that|which)\b/,
    /\bfirst\b[\s\S]*?\bthen\b/,
    /\balso\s+(check|approve|update|submit)\b/,
    /\b(step\s*\d+|1\.\s+[\s\S]*?2\.)/,
  ];
  if (sequencePatterns.some((p) => p.test(lower))) return true;

  // Composite multi-actions across domain tools (e.g. "check ... and approve ...")
  const actionVerbs = ["check", "look up", "find", "search", "retrieve", "approve", "reject", "update", "submit", "file", "verify"];
  let matchedActions = 0;
  for (const v of actionVerbs) {
    if (lower.includes(v)) matchedActions++;
  }
  if (matchedActions >= 2 && (lower.includes(" and ") || lower.includes(" then ") || lower.includes(", then") || lower.includes(" if "))) {
    return true;
  }

  return false;
}

// Multi-step suggestion modal elements
const multistepModalBackdrop  = document.getElementById("multistep-modal-backdrop");
const multistepModalClose     = document.getElementById("multistep-modal-close");
const multistepModalQuickBtn  = document.getElementById("multistep-modal-quick-btn");
const multistepModalSwitchBtn = document.getElementById("multistep-modal-switch-btn");
const multistepModalPreview   = document.getElementById("multistep-modal-prompt-preview");

let pendingMultiStepPrompt = "";

function showMultiStepModal(promptText) {
  pendingMultiStepPrompt = promptText;
  if (multistepModalPreview) {
    multistepModalPreview.textContent = `\"${promptText}\"`;
  }
  if (multistepModalBackdrop) {
    multistepModalBackdrop.hidden = false;
  }
}

function hideMultiStepModal() {
  if (multistepModalBackdrop) {
    multistepModalBackdrop.hidden = true;
  }
  pendingMultiStepPrompt = "";
}

multistepModalClose?.addEventListener("click", hideMultiStepModal);
multistepModalBackdrop?.addEventListener("click", (e) => {
  if (e.target === multistepModalBackdrop) hideMultiStepModal();
});

multistepModalQuickBtn?.addEventListener("click", () => {
  const prompt = pendingMultiStepPrompt;
  hideMultiStepModal();
  if (prompt) {
    if (agentInput) agentInput.value = "";
    runAgent(prompt);
  }
});

multistepModalSwitchBtn?.addEventListener("click", () => {
  const prompt = pendingMultiStepPrompt;
  hideMultiStepModal();
  setAgentMode("multistep");
  showToast("Switched to Multi-Step Mode", "info");
  if (prompt) {
    if (agentInput) agentInput.value = "";
    runMultiStepAgent(prompt);
  }
});

/**
 * Route agent submit to Quick or Multi-Step depending on agentMode.
 * If in Quick mode and the query requires multi-step coordination, prompts the user to switch.
 */
function dispatchAgent() {
  const text = agentInput?.value.trim();
  if (!text) return;

  if (agentMode === "quick" && isComplexMultiStepQuery(text)) {
    showMultiStepModal(text);
    return;
  }

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
async function runMultiStepAgent(overrideText = null, existingUserEl = null) {
  const text = (overrideText ?? agentInput?.value)?.trim();
  if (!text) return;

  if (agentInput) agentInput.value = "";

  let userEl = existingUserEl;
  if (!userEl) {
    userEl = agentAppendUser(text);
  }

  activeAgentAbortController = new AbortController();
  setButtonStopState(agentSendBtn, true, "Run agent");

  // Auto-provision session in background if none active
  if (!currentSessionId) {
    try {
      const headers = {};
      if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;
      const sRes = await fetch(`${API_BASE}/api/sessions`, { method: "POST", headers });
      if (sRes.ok) {
        const sData = await sRes.json();
        currentSessionId = sData.session_id;
        setActiveSession(currentSessionId);
        await loadSessions();
      }
    } catch {}
  }

  agentAppendUser(text);
  // Insert a placeholder progress card — we'll update it as the task runs.
  const progressCard = agentAppendPlanningCard(text);

  const headers = { "Content-Type": "application/json" };
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/agent/plan`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: text, session_id: currentSessionId }),
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
    activeAgentAbortController = null;
    setButtonStopState(agentSendBtn, false, "Run agent");
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
  label.innerHTML = "<strong>AskRaggy</strong> · Autonomous HR Agent";

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
        resultSpan.innerHTML = formatMarkdownToHtml(stepRecord.result);
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
      <div class="agent-task-result-text">${formatMarkdownToHtml(task.result)}</div>
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
      if (activeAgentAbortController?.signal?.aborted) {
        clearInterval(interval);
        updatePlanningCard(card, {
          status: "error",
          error: "Task stopped by user.",
          plan: null,
          steps_completed: [],
        });
        resolve();
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/agent/status/${taskId}`, {
          signal: activeAgentAbortController?.signal,
        });
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

mcpServicesToggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  const expanded = mcpServicesToggle.getAttribute("aria-expanded") === "true";
  mcpServicesToggle.setAttribute("aria-expanded", String(!expanded));
  if (mcpServicesBody) mcpServicesBody.hidden = expanded;
  const chevron = mcpServicesToggle.querySelector(".mcp-toggle-chevron");
  if (chevron) chevron.textContent = "▼";
  if (!expanded) loadMcpServices();
});

// Close MCP popover when clicking outside
document.addEventListener("click", (e) => {
  const mcpWrapper = document.getElementById("mcp-services-wrapper");
  if (mcpWrapper && !mcpWrapper.contains(e.target)) {
    if (mcpServicesBody && !mcpServicesBody.hidden) {
      mcpServicesBody.hidden = true;
      mcpServicesToggle?.setAttribute("aria-expanded", "false");
      const chevron = mcpServicesToggle?.querySelector(".mcp-toggle-chevron");
      if (chevron) chevron.textContent = "▼";
    }
  }
});

// Close MCP popover on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && mcpServicesBody && !mcpServicesBody.hidden) {
    mcpServicesBody.hidden = true;
    mcpServicesToggle?.setAttribute("aria-expanded", "false");
    const chevron = mcpServicesToggle?.querySelector(".mcp-toggle-chevron");
    if (chevron) chevron.textContent = "▼";
  }
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
  // Create a local object URL so we can show a thumbnail immediately.
  const thumbUrl = URL.createObjectURL(file);

  // Show the image attachment as a user bubble immediately!
  appendImageUserBubble(thumbUrl, file.name);
  const thinkingEl = appendMessage("ai", "", true);

  const userQuery = chatInput?.value?.trim() || "";
  if (chatInput) chatInput.value = "";
  const prompt = userQuery || `Describe this image in the context of ${currentDomainName || "enterprise documentation"}.`;

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

    // Show the vision response card.
    appendVisionResponse(data, thumbUrl);

    if (currentSessionId) loadSessions();
  } catch (err) {
    thinkingEl.remove();
    appendMessage("ai", `Vision error: ${err.message}.`);
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

function openFileUploadPicker() {
  const fileInput = document.getElementById("file-input");
  fileInput?.click();
}

btnToggleUpload?.addEventListener("click", () => toggleUploadContainer());
btnUploadBottom?.addEventListener("click", openFileUploadPicker);

document.addEventListener("click", (e) => {
  if (e.target.closest("#btn-empty-state-upload, .btn-empty-state-upload, .btn-doc-trigger-upload")) {
    openFileUploadPicker();
  }
});

// Switch to CAG button inside cag-popover
const btnActivateCag = document.getElementById("btn-activate-cag");
if (btnActivateCag) {
  btnActivateCag.addEventListener("click", () => {
    const cagOpt = document.getElementById("strategy-opt-cag");
    if (cagOpt) cagOpt.click();
    if (typeof toggleCagPopover === "function") toggleCagPopover(false);
    showToast("Switched to CAG (Full Context) mode! Queries will now analyze the entire document.", "success");
  });
}

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



// =============================================================================
// Document Q&A Modern Chat Box: Drag & Drop + Attach File Button
// =============================================================================
(function initDocModernChatBox() {
  const docChatBox = document.getElementById("doc-modern-chat-box");
  const btnDocAttach = document.getElementById("btn-doc-attach");
  const fileInputEl = document.getElementById("file-input");

  if (btnDocAttach && fileInputEl) {
    btnDocAttach.addEventListener("click", () => {
      fileInputEl.click();
    });
  }

  const docUploadHint = document.getElementById("doc-upload-hint");
  if (docUploadHint && fileInputEl) {
    docUploadHint.addEventListener("click", () => {
      fileInputEl.click();
    });
  }

  if (docChatBox) {
    ["dragenter", "dragover"].forEach((eventName) => {
      docChatBox.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        docChatBox.classList.add("drag-over");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      docChatBox.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        docChatBox.classList.remove("drag-over");
      });
    });

    docChatBox.addEventListener("drop", async (e) => {
      const dt = e.dataTransfer;
      const files = Array.from(dt?.files || []);
      for (const file of files) {
        await uploadFile(file);
      }
    });
  }

  // Top-right Document manager popover toggle & outside click handlers
  const docFilesTrigger = document.getElementById("doc-files-trigger");
  const docManagerPopover = document.getElementById("doc-manager-popover");
  const docManagerWrapper = document.getElementById("doc-manager-wrapper");
  const btnPopoverUploadMore = document.getElementById("btn-popover-upload-more");

  if (docFilesTrigger && docManagerPopover) {
    docFilesTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      // Dismiss strategy popover if open
      const stratPop = document.getElementById("strategy-popover");
      if (stratPop && !stratPop.hasAttribute("hidden")) {
        stratPop.setAttribute("hidden", "true");
        document.getElementById("strategy-trigger-btn")?.classList.remove("active");
        document.getElementById("strategy-trigger-btn")?.setAttribute("aria-expanded", "false");
      }
      const isHidden = docManagerPopover.hasAttribute("hidden");
      if (isHidden) {
        docManagerPopover.removeAttribute("hidden");
        docFilesTrigger.classList.add("active");
        docFilesTrigger.setAttribute("aria-expanded", "true");
      } else {
        docManagerPopover.setAttribute("hidden", "true");
        docFilesTrigger.classList.remove("active");
        docFilesTrigger.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("click", (e) => {
      if (docManagerWrapper && !docManagerWrapper.contains(e.target)) {
        docManagerPopover.setAttribute("hidden", "true");
        docFilesTrigger.classList.remove("active");
        docFilesTrigger.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !docManagerPopover.hasAttribute("hidden")) {
        docManagerPopover.setAttribute("hidden", "true");
        docFilesTrigger.classList.remove("active");
        docFilesTrigger.setAttribute("aria-expanded", "false");
      }
    });
  }

  if (btnPopoverUploadMore && fileInputEl) {
    btnPopoverUploadMore.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInputEl.click();
    });
  }

  // =============================================================================
  // Chunking Strategy Custom Dropdown wiring
  // =============================================================================
  const strategyWrapper = document.getElementById("strategy-dropdown-wrapper");
  const strategyTriggerBtn = document.getElementById("strategy-trigger-btn");
  const strategyPopover = document.getElementById("strategy-popover");
  const strategyHiddenSelect = document.getElementById("strategy-select");
  const strategyTriggerLabel = document.getElementById("strategy-trigger-label");
  const strategyRecBadge = document.getElementById("strategy-rec-badge");
  const strategyOptionItems = document.querySelectorAll(".strategy-option-item");

  if (strategyTriggerBtn && strategyPopover) {
    strategyTriggerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Close doc files popover if open
      if (docManagerPopover && !docManagerPopover.hasAttribute("hidden")) {
        docManagerPopover.setAttribute("hidden", "true");
        docFilesTrigger?.classList.remove("active");
        docFilesTrigger?.setAttribute("aria-expanded", "false");
      }
      if (typeof toggleCagPopover === "function") {
        toggleCagPopover(false);
      }

      const isHidden = strategyPopover.hasAttribute("hidden");
      if (isHidden) {
        strategyPopover.removeAttribute("hidden");
        strategyTriggerBtn.classList.add("active");
        strategyTriggerBtn.setAttribute("aria-expanded", "true");
      } else {
        strategyPopover.setAttribute("hidden", "true");
        strategyTriggerBtn.classList.remove("active");
        strategyTriggerBtn.setAttribute("aria-expanded", "false");
      }
    });

    strategyOptionItems.forEach((opt) => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const value = opt.dataset.value;
        if (!value) return;

        // Update hidden select for seamless API compatibility
        if (strategyHiddenSelect) {
          strategyHiddenSelect.value = value;
          strategyHiddenSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }

        // Update active class on options
        strategyOptionItems.forEach((item) => {
          const isSelected = item.dataset.value === value;
          item.classList.toggle("selected", isSelected);
          item.setAttribute("aria-selected", String(isSelected));
        });

        // Update trigger button label & badge
        if (strategyTriggerLabel) {
          if (value === "auto") {
            strategyTriggerLabel.textContent = "Auto (Adaptive)";
          } else if (value === "cag") {
            strategyTriggerLabel.textContent = "CAG (Full Context)";
          } else if (value === "sentence") {
            strategyTriggerLabel.textContent = "Sentence-aware";
          } else {
            strategyTriggerLabel.textContent = "Paragraph-based";
          }
        }
        if (strategyRecBadge) {
          if (value === "auto") {
            strategyRecBadge.textContent = "Smart";
            strategyRecBadge.style.display = "inline-block";
            strategyRecBadge.className = "strategy-rec-badge auto";
          } else if (value === "cag") {
            strategyRecBadge.textContent = "⚡ Zero Error";
            strategyRecBadge.style.display = "inline-block";
            strategyRecBadge.className = "strategy-rec-badge cag";
          } else if (value === "sentence") {
            strategyRecBadge.textContent = "Rec";
            strategyRecBadge.style.display = "inline-block";
            strategyRecBadge.className = "strategy-rec-badge";
          } else {
            strategyRecBadge.style.display = "none";
          }
        }

        updateStrategyAdvisory();

        // Close popover
        strategyPopover.setAttribute("hidden", "true");
        strategyTriggerBtn.classList.remove("active");
        strategyTriggerBtn.setAttribute("aria-expanded", "false");
      });
    });

    document.addEventListener("click", (e) => {
      if (strategyWrapper && !strategyWrapper.contains(e.target)) {
        strategyPopover.setAttribute("hidden", "true");
        strategyTriggerBtn.classList.remove("active");
        strategyTriggerBtn.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !strategyPopover.hasAttribute("hidden")) {
        strategyPopover.setAttribute("hidden", "true");
        strategyTriggerBtn.classList.remove("active");
        strategyTriggerBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

/**
 * Real-time Document Size Detection & Strategy Advisory
 * Inspects active document page/character size and shows warning/tips based on selected strategy.
 */
function updateStrategyAdvisory() {
  const advisoryEl = document.getElementById("doc-strategy-advisory");
  if (!advisoryEl) return;

  if (!currentDocsCache || !currentDocsCache.length) {
    advisoryEl.style.display = "none";
    return;
  }

  const targetDocId = searchDocFilter?.value || activeDocumentId || (currentDocsCache[0] ? currentDocsCache[0].id : null);
  const doc = currentDocsCache.find((d) => d.id === targetDocId) || currentDocsCache[0];
  if (!doc) {
    advisoryEl.style.display = "none";
    return;
  }

  const currentStrat = strategySelect?.value || "auto";
  const pages = doc.page_count || 1;
  const chars = doc.char_count || 0;
  const isLarge = !doc.cag_eligible || pages > 50 || chars > 120000;

  if (currentStrat === "cag" && isLarge) {
    advisoryEl.className = "doc-strategy-advisory amber";
    advisoryEl.style.display = "flex";
    advisoryEl.innerHTML = `
      <div class="doc-strategy-advisory-content">
        <span class="doc-strategy-advisory-icon">⚠️</span>
        <span class="doc-strategy-advisory-text">
          <strong>Large Document Notice (${pages} pages):</strong> CAG is optimized for files &lt;50 pages. Switching to RAG is recommended.
        </span>
      </div>
      <button type="button" class="btn-advisory-action amber" id="btn-advisory-switch-rag">Switch to RAG</button>
    `;
    advisoryEl.querySelector("#btn-advisory-switch-rag")?.addEventListener("click", () => {
      const opt = document.getElementById("strategy-opt-sentence");
      if (opt) opt.click();
      showToast("Switched to RAG (Sentence-aware) for large document retrieval!", "info");
    });
  } else if ((currentStrat === "sentence" || currentStrat === "paragraph") && !isLarge && pages <= 25) {
    advisoryEl.className = "doc-strategy-advisory green";
    advisoryEl.style.display = "flex";
    advisoryEl.innerHTML = `
      <div class="doc-strategy-advisory-content">
        <span class="doc-strategy-advisory-icon">✨</span>
        <span class="doc-strategy-advisory-text">
          <strong>Optimal for CAG (${pages} page${pages !== 1 ? "s" : ""}):</strong> This file is compact. You can use CAG for 100% full-document visibility with zero retrieval errors.
        </span>
      </div>
      <button type="button" class="btn-advisory-action green" id="btn-advisory-switch-cag">Switch to CAG</button>
    `;
    advisoryEl.querySelector("#btn-advisory-switch-cag")?.addEventListener("click", () => {
      const opt = document.getElementById("strategy-opt-cag");
      if (opt) opt.click();
      showToast("Switched to CAG (Full Context) for zero-error retrieval!", "success");
    });
  } else if (currentStrat === "auto") {
    advisoryEl.className = "doc-strategy-advisory blue";
    advisoryEl.style.display = "flex";
    advisoryEl.innerHTML = `
      <div class="doc-strategy-advisory-content">
        <span class="doc-strategy-advisory-icon">🧠</span>
        <span class="doc-strategy-advisory-text">
          <strong>Adaptive Routing Active:</strong> "${escapeHtml(doc.filename)}" (${pages} page${pages !== 1 ? "s" : ""}) will use <strong>${isLarge ? "🔍 RAG Vector Search" : "⚡ CAG Full Context"}</strong>.
        </span>
      </div>
    `;
  } else {
    advisoryEl.style.display = "none";
  }
}

})();

/** Helper to get responsive concise placeholder for document chat input */
function getDocPlaceholder(docName = null) {
  if (window.innerWidth <= 768) {
    return "Ask doc…";
  }
  if (window.innerWidth <= 992) {
    return "Ask document…";
  }
  if (docName) {
    return `Ask anything about ${docName} (press Enter)…`;
  }
  return "Attach or drop a document (.pdf, .docx, .txt) to ask questions…";
}

// Manage responsive concise placeholders for mobile and tablet
function applyResponsivePlaceholders() {
  const isMobile = window.innerWidth <= 768;
  const isCompact = window.innerWidth <= 992;
  const chatInputEl = document.getElementById("chat-input");
  const docInputEl = document.getElementById("doc-chat-input");
  const agentInputEl = document.getElementById("agent-input");
  if (chatInputEl) chatInputEl.placeholder = isMobile ? "Ask anything…" : "Ask me anything…";
  if (docInputEl) docInputEl.placeholder = getDocPlaceholder(typeof activeDocumentId !== "undefined" && activeDocumentId && typeof activeDocName !== "undefined" ? activeDocName : null);
  if (agentInputEl) agentInputEl.placeholder = isMobile ? "Ask agent…" : (isCompact ? "Ask agent anything…" : "Ask anything (e.g. Look up an employee, check department staff, approve leave, submit expense)…");
}

window.addEventListener("resize", applyResponsivePlaceholders);
document.addEventListener("DOMContentLoaded", applyResponsivePlaceholders);
applyResponsivePlaceholders();

// =============================================================================
// BYOK (Bring Your Own Key) Settings UI Manager
// =============================================================================
function initByokSettings() {
  const byokInput = document.getElementById("byok-key-input");
  const byokSaveBtn = document.getElementById("byok-save-btn");
  const byokClearBtn = document.getElementById("byok-clear-btn");
  const byokToggleVisBtn = document.getElementById("byok-toggle-visibility-btn");
  const byokStatusCard = document.getElementById("byok-status-card");
  const byokHeaderBadge = document.getElementById("byok-header-badge");

  function updateStatusDisplay() {
    const savedKey = (activeByokKey || localStorage.getItem(BYOK_STORAGE_KEY) || "").trim();
    if (byokInput) {
      byokInput.value = savedKey;
    }

    if (savedKey) {
      const isGroq = savedKey.startsWith("gsk_");
      const isOpenAI = savedKey.startsWith("sk-");
      const providerLabel = isGroq ? "Groq LPU (Ultra-Fast)" : (isOpenAI ? "OpenAI Platform" : "Custom Provider");
      const maskedKey = savedKey.length > 10 ? `${savedKey.slice(0, 4)}••••${savedKey.slice(-4)}` : "••••••••";

      if (byokStatusCard) {
        byokStatusCard.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <span style="color: var(--color-pistache, #a8b89e); font-weight: 600;">Active Custom Key:</span>
              <strong style="color: var(--color-warm-white, #f0ede6); margin-left: 0.35rem;">${providerLabel}</strong>
              <code style="display: inline-block; margin-left: 0.5rem; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.06); font-size: 0.78rem; color: var(--color-silver, #b0b4ba);">${maskedKey}</code>
            </div>
            <span class="admin-card-badge" style="background: rgba(46, 204, 113, 0.15); color: #2ecc71; border-color: rgba(46, 204, 113, 0.3);">
              Bypassing Rate Limits
            </span>
          </div>
        `;
      }
      if (byokHeaderBadge) {
        byokHeaderBadge.textContent = "Custom Key Active";
        byokHeaderBadge.style.color = "#2ecc71";
        byokHeaderBadge.style.borderColor = "rgba(46, 204, 113, 0.3)";
      }
    } else {
      if (byokStatusCard) {
        byokStatusCard.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <span style="color: var(--color-silver, #b0b4ba);">Current Mode:</span>
              <strong style="color: var(--color-warm-white, #f0ede6); margin-left: 0.35rem;">Shared Demo Tier</strong>
              <span style="font-size: 0.78rem; color: var(--color-silver, #b0b4ba); margin-left: 0.5rem;">(Subject to shared public rate limits)</span>
            </div>
            <span class="admin-card-badge" style="background: rgba(255, 255, 255, 0.05); color: var(--color-silver, #b0b4ba);">
              Shared Demo
            </span>
          </div>
        `;
      }
      if (byokHeaderBadge) {
        byokHeaderBadge.textContent = "Optional · Unlimited";
        byokHeaderBadge.style.color = "";
        byokHeaderBadge.style.borderColor = "";
      }
    }
  }

  byokSaveBtn?.addEventListener("click", () => {
    const val = (byokInput?.value || "").trim();
    if (!val) {
      showToast("Please enter an API key to save.", "info");
      return;
    }
    activeByokKey = val;
    localStorage.setItem(BYOK_STORAGE_KEY, val);
    updateStatusDisplay();
    showToast("Custom API key saved! You now have unlimited demo access.", "success");
  });

  byokClearBtn?.addEventListener("click", () => {
    activeByokKey = "";
    localStorage.removeItem(BYOK_STORAGE_KEY);
    if (byokInput) byokInput.value = "";
    updateStatusDisplay();
    showToast("Custom API key removed. Switched back to shared demo tier.", "info");
  });

  byokToggleVisBtn?.addEventListener("click", () => {
    if (!byokInput) return;
    if (byokInput.type === "password") {
      byokInput.type = "text";
      byokToggleVisBtn.textContent = "🙈";
    } else {
      byokInput.type = "password";
      byokToggleVisBtn.textContent = "👁️";
    }
  });

  updateStatusDisplay();
}

function initApp() {
  applyResponsivePlaceholders();
  initByokSettings();
  loadSessions();
  loadDocuments();
  loadTenantInfo();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
