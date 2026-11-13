/**
 * AskRaggy Enterprise Platform - Chat, Streaming & Sessions Module
 */
import { state, DEMO_PERSONAS, DEMO_MAX_MESSAGES_PER_SESSION } from "./state.js";
import {
  escapeHtml,
  formatMarkdownToHtml,
  playNotificationSound,
  showToast,
  showConfirmDialog,
  setButtonStopState,
  appendStoppedNotice,
  startThinkingPercentage,
  renderRateLimitNotice,
  detectExportWorthy,
  buildSmartExportRow,
  createMsgExportDropdown,
  toggleMobileSidebar
} from "./utils.js";
import {
  API_BASE,
  getAuthHeaders,
  recordVisitorSession,
  getVisitorSessionIds,
  removeVisitorSession
} from "./api.js";
import { clearDocChat, renderDocHistoryMessages } from "./documents.js";
import { clearAgentChat, renderAgentHistoryMessages } from "./agent.js";

export const sessionSidebar = document.getElementById("session-sidebar");
export const messageHistory = document.getElementById("message-history");
export const chatInput = document.getElementById("chat-input");
export const sendBtn = document.getElementById("send-btn");
export const emptyState = document.getElementById("empty-state");

export const structuredToggle = document.getElementById("structured-toggle");
export const smartToggle = document.getElementById("smart-toggle");

export const newChatBtn = document.getElementById("new-chat-btn");
export const sessionList = document.getElementById("session-list");
export const sessionLabel = document.getElementById("current-session-label");

// Message editing functions
export function startEditMessage(msgWrapper, bubbleEl, originalText, contextType = "general") {
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
export async function handleGeneralChatEdit(msgWrapper, newText) {
  const children = Array.from(messageHistory.children).filter(el => el.classList.contains("message"));
  const targetIndex = children.indexOf(msgWrapper);
  if (targetIndex !== -1) {
    children.slice(targetIndex + 1).forEach(el => el.remove());

    if (state.currentSessionId) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (state.activeTenantId) headers["X-Tenant-ID"] = state.activeTenantId;
        await fetch(`${API_BASE}/api/sessions/${state.currentSessionId}/truncate`, {
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
export async function handleDocChatEdit(msgWrapper, newText) {
  const children = Array.from(docMessageHistory.children).filter(el => el.classList.contains("message") || el.classList.contains("doc-qa-card"));
  const targetIndex = children.indexOf(msgWrapper);
  if (targetIndex !== -1) {
    children.slice(targetIndex + 1).forEach(el => el.remove());
  }
  if (typeof window.sendDocMessage === "function") {
    await window.sendDocMessage(newText, msgWrapper);
  }
}

/** Handle saving & submitting an edited user query in Agent Chat */
export async function handleAgentChatEdit(msgWrapper, newText) {
  const children = Array.from(agentHistory.children).filter(el => el.classList.contains("message"));
  const targetIndex = children.indexOf(msgWrapper);
  if (targetIndex !== -1) {
    children.slice(targetIndex + 1).forEach(el => el.remove());

    if (state.currentSessionId) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (state.activeTenantId) headers["X-Tenant-ID"] = state.activeTenantId;
        await fetch(`${API_BASE}/api/sessions/${state.currentSessionId}/truncate`, {
          method: "POST",
          headers,
          body: JSON.stringify({ keep_count: targetIndex }),
        });
      } catch (e) {
        console.warn("Could not truncate agent session history:", e);
      }
    }
  }
  if (typeof window.runAgent === "function") {
    await window.runAgent(newText, msgWrapper);
  }
}

/**
 * Starts an animated percentage progress counter (0% -> 99%) inside the thinking bubble.
 * Cleans itself up automatically when the thinking wrapper is removed.
 *
 * @param {HTMLElement} wrapper - message wrapper element
 * @param {HTMLElement} percentEl - the percentage display element
 */
/**
 * Starts an animated percentage progress counter synchronized with backend retrieval phases.
 *
 * Pipeline Phases:
 *   0% - 25%: Query classification & routing (~0.8s)
 *  25% - 60%: Knowledge base vector retrieval in ChromaDB
 *  60% - 85%: Context synthesis & model connection (triggered upon SSE 'start' event)
 *  85% - 100%: Generation ready (triggered upon first SSE token)
 *
 * @param {HTMLElement} wrapper - message wrapper element
 * @param {HTMLElement} percentEl - the percentage display element
 */


// Append Message, Streaming Smart Chat & Send Message
export function appendMessage(role, text, isThinking = false) {
  document.getElementById("empty-state")?.remove();

  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}${isThinking ? " thinking" : ""}`;
  wrapper.dataset.role = role;
  if (role === "user" && text) {
    wrapper.dataset.rawText = text;
  }

  const label = document.createElement("span");
  label.className = "role-label";
  if (role === "user") {
    label.textContent = "You";
  } else {
    label.style.display = "none";
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (isThinking) {
    // Animated typing indicator — three bouncing dots + loader percentage.
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.className = "dot";
      bubble.appendChild(dot);
    }
    const percentEl = document.createElement("span");
    percentEl.className = "thinking-percent";
    percentEl.textContent = "0%";
    bubble.appendChild(percentEl);
    startThinkingPercentage(wrapper, percentEl);
  } else {
    bubble.textContent = text;
  }

  wrapper.appendChild(label);
  wrapper.appendChild(bubble);

  // Attach Edit button on user messages (Gemini / ChatGPT style) — no export on user bubbles
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
/**
 * Streams real-time tokens from the smart-chat endpoint using Server-Sent Events (SSE).
 */
export async function handleStreamingSmartChat(text, thinkingEl) {
  const endpoint = `/api/sessions/${state.currentSessionId}/chat/smart/stream`;
  const headers = getAuthHeaders();

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: text,
      persona: state.currentPersona.role,
      user_name: state.currentPersona.name,
      user_code: state.currentPersona.code,
    }),
    signal: state.activeChatAbortController.signal,
  });

  if (!response.ok) {
    thinkingEl.remove();
    if (response.status === 429) {
      const err = await response.json().catch(() => ({}));
      if (err.detail && err.detail.includes("DEMO_LIMIT_REACHED")) {
        showDemoLimitModal();
      } else {
        renderRateLimitNotice("chat");
      }
      playNotificationSound();
      return;
    }
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Server error ${response.status}`);
  }

  // Remove welcome / empty state
  document.getElementById("empty-state")?.remove();

  // Create message bubble
  const wrapper = document.createElement("div");
  wrapper.className = "message ai";

  const label = document.createElement("span");
  label.className = "role-label";
  label.style.display = "none";
  wrapper.appendChild(label);

  const card = document.createElement("div");
  card.className = "smart-response-card";
  wrapper.appendChild(card);

  let headerEl = null;

  const answerEl = document.createElement("div");
  answerEl.className = "response-card-answer markdown-body";
  card.appendChild(answerEl);

  let accumulatedText = "";
  let streamMeta = null;
  let attached = false;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || ""; // retain incomplete chunk

      for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed.startsWith("data:")) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;

        let payload;
        try {
          payload = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        if (payload.type === "start") {
          streamMeta = payload;
          // Notify thinking indicator that retrieval has finished on the server
          if (thinkingEl && typeof thinkingEl.updateThinkingProgress === "function") {
            const hasChunks = Boolean(payload.chunks_used && payload.chunks_used.length > 0);
            thinkingEl.updateThinkingProgress(hasChunks ? 78 : 72);
          }
          if (typeof payload.demo_credits_left === "number") {
            updateDemoQuotaDisplay(payload.demo_credits_left);
          }
          if (payload.chunks_used && payload.chunks_used.length > 0 && !headerEl) {
            headerEl = document.createElement("div");
            headerEl.className = "smart-response-header clean-citation-header";
            headerEl.innerHTML = `
              <span class="source-badge citation-badge">
                <span class="badge-icon">📚</span>
                <span>Knowledge Base (${payload.chunks_used.length} passage${payload.chunks_used.length !== 1 ? "s" : ""})</span>
              </span>
            `;
            card.insertBefore(headerEl, answerEl);
          }
        } else if (payload.type === "token") {
          if (!attached) {
            if (thinkingEl && typeof thinkingEl.updateThinkingProgress === "function") {
              thinkingEl.updateThinkingProgress(100);
            }
            thinkingEl.remove();
            messageHistory.appendChild(wrapper);
            attached = true;
          }
          accumulatedText += payload.token;
          answerEl.innerHTML = formatMarkdownToHtml(accumulatedText) + '<span class="streaming-cursor">▌</span>';
          messageHistory.scrollTop = messageHistory.scrollHeight;
        } else if (payload.type === "done") {
          if (!attached) {
            thinkingEl.remove();
            messageHistory.appendChild(wrapper);
            attached = true;
          }
          accumulatedText = payload.answer || accumulatedText;
          answerEl.innerHTML = formatMarkdownToHtml(accumulatedText);
          streamMeta = payload;

          if (!card.querySelector(".assistant-msg-actions")) {
            const detection = detectExportWorthy(accumulatedText);
            if (detection.worthy) {
              const actionsRow = buildSmartExportRow("general", detection, answerEl);
              card.appendChild(actionsRow);
            }
          }
        } else if (payload.type === "error") {
          throw new Error(payload.error || "Streaming failed");
        }
      }
    }
  } catch (streamErr) {
    if (streamErr.name === "AbortError") {
      if (!attached) {
        thinkingEl.remove();
        messageHistory.appendChild(wrapper);
        attached = true;
      }
      answerEl.innerHTML = formatMarkdownToHtml(accumulatedText);
      const stoppedTag = document.createElement("div");
      stoppedTag.className = "stream-stopped-indicator";
      stoppedTag.textContent = "⏹ Generation stopped";
      card.appendChild(stoppedTag);
      return;
    }
    throw streamErr;
  } finally {
    answerEl.querySelectorAll(".streaming-cursor").forEach(c => c.remove());
  }

  // Render supporting passages accordion if citations present
  const hasCitations = Boolean(streamMeta?.chunks_used && streamMeta.chunks_used.length > 0);
  if (hasCitations && !card.querySelector(".smart-chunks-toggle")) {
    const chunksToggle = document.createElement("button");
    chunksToggle.className = "smart-chunks-toggle";
    chunksToggle.textContent = `▶ View ${streamMeta.chunks_used.length} supporting passage${streamMeta.chunks_used.length !== 1 ? "s" : ""}`;
    card.appendChild(chunksToggle);

    const chunksContainer = document.createElement("div");
    chunksContainer.className = "smart-chunks-container";
    chunksContainer.hidden = true;

    streamMeta.chunks_used.forEach((chunk, i) => {
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
      chunksToggle.textContent = `${hidden ? "▼ Hide" : "▶ View"} ${streamMeta.chunks_used.length} supporting passage${streamMeta.chunks_used.length !== 1 ? "s" : ""}`;
    });
  }

  playNotificationSound();
  if (state.currentSessionId) loadSessions();
}

export async function sendMessage(overrideText = null, existingUserEl = null) {
  const text = (overrideText ?? chatInput.value).trim();
  if (!text) return;

  if (chatInput) chatInput.value = "";

  let userEl = existingUserEl;
  if (!userEl) {
    userEl = appendMessage("user", text);
  }

  const thinkingEl = appendMessage("ai", "", true);

  // Activate Stop generation state
  state.activeChatAbortController = new AbortController();
  setButtonStopState(sendBtn, true, "Send message");

  const isStructured = structuredToggle?.checked ?? true;
  const isSmartMode = smartToggle?.checked ?? true;

  // Smart Mode requires a session. Auto-create one if none exists yet.
  if (isSmartMode && !state.currentSessionId) {
    try {
      const sRes = await fetch(`${API_BASE}/api/sessions`, {
        method: "POST",
        signal: state.activeChatAbortController.signal,
      });
      if (sRes.ok) {
        const sData = await sRes.json();
        state.currentSessionId = sData.session_id;
        recordVisitorSession(state.currentSessionId);
        setActiveSession(state.currentSessionId);
        loadSessions();
      }
    } catch {}
  }

  // Feature 6: Smart Mode routes through real-time streaming endpoint /chat/smart/stream
  if (state.currentSessionId && isSmartMode) {
    try {
      await handleStreamingSmartChat(text, thinkingEl);
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
      state.activeChatAbortController = null;
      setButtonStopState(sendBtn, false, "Send message");
      chatInput.focus();
    }
    return;
  }

  // Fall back to non-streaming endpoints when Smart Mode is toggled off
  let endpoint;
  if (state.currentSessionId) {
    endpoint = `/api/sessions/${state.currentSessionId}/chat`;
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
      body: JSON.stringify({
        message: text,
        persona: state.currentPersona.role,
        user_name: state.currentPersona.name,
        user_code: state.currentPersona.code,
      }),
      signal: state.activeChatAbortController.signal,
    });

    if (!response.ok) {
      thinkingEl.remove();
      if (response.status === 429) {
        const err = await response.json().catch(() => ({}));
        if (err.detail && err.detail.includes("DEMO_LIMIT_REACHED")) {
          showDemoLimitModal();
        } else {
          renderRateLimitNotice("chat");
        }
        playNotificationSound();
        return;
      }
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${response.status}`);
    }

    const data = await response.json();
    if (thinkingEl && typeof thinkingEl.updateThinkingProgress === "function") {
      thinkingEl.updateThinkingProgress(100);
    }
    thinkingEl.remove();
    if (typeof data.demo_credits_left === "number") {
      updateDemoQuotaDisplay(data.demo_credits_left);
    }

    // Smart Mode returns SmartChatResponse; session/structured returns StructuredResponse.
    if (state.currentSessionId && isSmartMode) {
      appendSmartResponse(data);
    } else if (state.currentSessionId || isStructured) {
      appendStructuredResponse(data);
    } else {
      appendMessage("ai", data.response ?? "(no response)");
    }

    playNotificationSound();

    // Refresh the sidebar after each message so the session title and count update.
    if (state.currentSessionId) loadSessions();

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
    state.activeChatAbortController = null;
    setButtonStopState(sendBtn, false, "Send message");
    chatInput.focus();
  }
}

// Send on button click or Enter key (supports stopping while generating).
sendBtn.addEventListener("click", () => {
  if (state.activeChatAbortController) {
    state.activeChatAbortController.abort();
    state.activeChatAbortController = null;
    return;
  }
  sendMessage();
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (state.activeChatAbortController) return;
    sendMessage();
  }
});



// Structured Mode Response
export function appendStructuredResponse(data) {
  // Remove the empty-state placeholder on first message (same as appendMessage).
  document.getElementById("empty-state")?.remove();

  // Outer wrapper mirrors the .message.ai layout so it aligns with plain messages.
  const wrapper = document.createElement("div");
  wrapper.className = "message ai";

  const label = document.createElement("span");
  label.className = "role-label";
  label.style.display = "none";

  // Card body
  const card = document.createElement("div");
  card.className = "response-card";

  // ── Answer text with rich formatting ──
  const answer = document.createElement("div");
  answer.className = "response-card-answer markdown-body";
  answer.innerHTML = formatMarkdownToHtml(data.answer ?? "");
  card.appendChild(answer);

  // ── Smart export: only attach if content is worth exporting ──
  const detection = detectExportWorthy(data.answer ?? "");
  if (detection.worthy) {
    const actionsRow = buildSmartExportRow("general", detection, answer);
    card.appendChild(actionsRow);
  }

  wrapper.appendChild(label);
  wrapper.appendChild(card);
  messageHistory.appendChild(wrapper);
  messageHistory.scrollTop = messageHistory.scrollHeight;
}



// Smart Mode Response
export function appendSmartResponse(data) {
  document.getElementById("empty-state")?.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "message ai";

  const label = document.createElement("span");
  label.className = "role-label";
  label.style.display = "none";

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

  // ── Smart export: only attach if answer or citations make it worth exporting ──
  const detection = detectExportWorthy(data.answer ?? "");
  // Always worthy if retrieved citations exist
  if (detection.worthy || hasCitations) {
    const enrichedDetection = { ...detection, hasSources: detection.hasSources || hasCitations, worthy: true };
    const actionsRow = buildSmartExportRow("general", enrichedDetection, answer);
    card.appendChild(actionsRow);
  }

  wrapper.appendChild(label);
  wrapper.appendChild(card);
  messageHistory.appendChild(wrapper);
  messageHistory.scrollTop = messageHistory.scrollHeight;
}



// Session Management
function renderEmptyChatState() {
  const domain = state.currentDomainName || "Enterprise HR & Operations";
  return `
    <div class="empty-state welcome-clean" id="empty-state">
      <div class="hero-logo-wrapper" aria-hidden="true">
          <img src="assets/images/askraggy-logo-mark.png?v=9.0.0" alt="AskRaggy Logo" class="hero-clean-logo" width="76" height="76" />
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
export function clearChat() {
  messageHistory.innerHTML = renderEmptyChatState();
  if (chatInput) chatInput.value = "";
}

/** Clear all three tab message areas (Chat, Documents, Agent) to fresh initial state. */
export function clearAllTabs() {
  clearChat();
  clearDocChat();
  clearAgentChat();
}

/** Mark one session item as active in the sidebar. */
export function setActiveSession(sessionId) {
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
export async function loadSessions() {
  if (!sessionList) return;

  const headers = {};
  if (state.activeTenantId) headers["X-Tenant-ID"] = state.activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/sessions`, { headers });
    if (!res.ok) throw new Error("sessions endpoint not available");

    const sessions = await res.json();

    // Filter sessions: in default demo mode, isolate sidebar to this visitor's browser.
    // If user configured a specific enterprise tenant in Settings (⚙️), show all sessions for that tenant.
    const myIds = getVisitorSessionIds();
    const isCustomTenant = Boolean(state.activeTenantId && state.activeTenantId !== "default");
    const displaySessions = sessions.filter((s) => {
      const hasContentOrActive = s.message_count > 0 || s.id === state.currentSessionId;
      if (isCustomTenant) {
        return hasContentOrActive;
      }
      return hasContentOrActive && (myIds.includes(s.id) || s.id === state.currentSessionId);
    });

    if (!displaySessions.length) {
      sessionList.innerHTML = `<p class="sidebar-empty">No conversations yet.<br>Click <strong>New Chat</strong> to start.</p>`;
      return;
    }

    sessionList.innerHTML = "";
    displaySessions.forEach((s) => {
      const item = document.createElement("div");
      item.className = "session-item";
      item.dataset.sessionId = s.id;
      if (s.id === state.currentSessionId) item.classList.add("active");

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
          if (state.activeTenantId) delHeaders["X-Tenant-ID"] = state.activeTenantId;
          const delRes = await fetch(`${API_BASE}/api/sessions/${s.id}`, { method: "DELETE", headers: delHeaders });
          if (!delRes.ok) throw new Error(`Server returned ${delRes.status}`);
          removeVisitorSession(s.id);
          if (state.currentSessionId === s.id) {
            state.currentSessionId = null;
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
export async function createNewSession() {
  const headers = {};
  if (state.activeTenantId) headers["X-Tenant-ID"] = state.activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/sessions`, { method: "POST", headers });
    if (!res.ok) throw new Error(`Server error ${res.status}`);

    const data = await res.json();
    state.currentSessionId = data.session_id;
    recordVisitorSession(state.currentSessionId);
    
    // Clear all 3 tabs so fresh new session has zero lingering conversation
    clearAllTabs();

    setActiveSession(state.currentSessionId);
    if (window.innerWidth <= 992 || sessionSidebar?.classList.contains('sidebar-open')) toggleMobileSidebar(true);
    await loadSessions();
    chatInput?.focus();
  } catch (err) {
    alert(`Could not create a new session: ${err.message}\nIs the Feature 3 server running?`);
  }
}

/**
 * Load a session's history from the API and render it in the chat area.
 */
export async function switchToSession(sessionId) {
  const headers = {};
  if (state.activeTenantId) headers["X-Tenant-ID"] = state.activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/history`, { headers });
    if (!res.ok) throw new Error(`Server error ${res.status}`);

    const messages = await res.json();
    state.currentSessionId = sessionId;

    if (messages && messages.length > 0) {
      // 1. Chat Tab: Show ONLY chat history — do NOT show default logo cards
      messageHistory.innerHTML = "";
      messages.forEach((msg) => {
        appendMessage(msg.role === "user" ? "user" : "ai", msg.content);
      });
      document.getElementById("empty-state")?.remove();
      messageHistory.scrollTop = messageHistory.scrollHeight;

      // 2. Documents Tab: Render conversation messages — do NOT show logo cards
      renderDocHistoryMessages(messages);

      // 3. Agent Tab: Render conversation messages — do NOT show logo cards
      renderAgentHistoryMessages(messages);
    } else {
      clearAllTabs();
    }

    setActiveSession(sessionId);
    if (window.innerWidth <= 992 || sessionSidebar?.classList.contains('sidebar-open')) toggleMobileSidebar(true);
    chatInput?.focus();
  } catch (err) {
    appendMessage("ai", `Could not load session: ${err.message}`);
  }
}

/** Minimal HTML escape to prevent XSS in the session title. */


// Persona & Quota
export function setPersona(role) {
  const btnEmp = document.getElementById("btn-persona-employee");
  const btnMgr = document.getElementById("btn-persona-manager");

  if (role === "manager") {
    state.currentPersona = {
      role: "manager",
      name: "Sarah Jenkins",
      code: "EMP-102",
    };
    btnMgr?.classList.add("active");
    btnMgr?.setAttribute("aria-checked", "true");
    btnEmp?.classList.remove("active");
    btnEmp?.setAttribute("aria-checked", "false");
    showToast("👔 Switched to Sarah Jenkins (HR Manager) — Full approval permissions enabled.", "info");
  } else {
    state.currentPersona = {
      role: "employee",
      name: "Rahul Sharma",
      code: "EMP-101",
    };
    btnEmp?.classList.add("active");
    btnEmp?.setAttribute("aria-checked", "true");
    btnMgr?.classList.remove("active");
    btnMgr?.setAttribute("aria-checked", "false");
    showToast("👤 Switched to Rahul Sharma (Employee) — Self-service directory & claims.", "info");
  }
}

export function updateDemoQuotaDisplay(credits) {
  state.currentDemoCredits = credits;
  const quotaText = document.getElementById("demo-quota-text");
  const quotaBadge = document.getElementById("demo-quota-badge");
  if (!quotaText || !quotaBadge) return;

  if (credits < 0 || state.activeByokKey) {
    quotaText.textContent = "⚡ Unlimited (BYOK)";
    quotaBadge.style.color = "#10b981";
    quotaBadge.style.borderColor = "rgba(16, 185, 129, 0.3)";
    quotaBadge.style.background = "rgba(16, 185, 129, 0.12)";
  } else {
    quotaText.textContent = `${credits} credit${credits !== 1 ? "s" : ""}`;
    if (credits <= 3) {
      quotaBadge.style.color = "#ef4444";
      quotaBadge.style.borderColor = "rgba(239, 68, 68, 0.35)";
      quotaBadge.style.background = "rgba(239, 68, 68, 0.12)";
    } else {
      quotaBadge.style.color = "";
      quotaBadge.style.borderColor = "";
      quotaBadge.style.background = "";
    }
  }
}

export function showDemoLimitModal() {
  const modal = document.getElementById("demo-limit-modal-backdrop");
  if (modal) modal.hidden = false;
}

export function hideDemoLimitModal() {
  const modal = document.getElementById("demo-limit-modal-backdrop");
  if (modal) modal.hidden = true;
}

export { getActiveMessagesContainer } from "./utils.js";

/**
 * Smart Content Detection — determines whether an AI response is "export-worthy".
 * Only attach export controls when the response contains rich, structured data.
 *
 * Rules (any one match triggers):
 *   - Contains a markdown table (|---|)
 *   - Contains a code block (```)
 *   - Has cited sources / retrieval (source numbers: [1], [Source:), "Sources:", "References:")
 *   - Response word count >= 150 (meaningful long-form answer)
 *
 * Short conversational replies ("Sure!", "I don't know.") get NO button.
 *
 * @param {string} htmlOrText - The raw answer text or rendered HTML string
 * @returns {{ worthy: boolean, hasTable: boolean, hasCode: boolean, hasSources: boolean, isLong: boolean }}
 */


export function initChat() {
  // Abort tracking on sendBtn click when running
  sendBtn?.addEventListener("click", () => {
    if (state.activeChatAbortController) {
      state.activeChatAbortController.abort();
      state.activeChatAbortController = null;
      setButtonStopState(sendBtn, false, null);
      return;
    }
    sendMessage();
  });

  chatInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (state.activeChatAbortController) return;
      sendMessage();
    }
  });

  // Prompt pill click handlers
  document.querySelectorAll(".clean-prompt-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.prompt;
      if (p && chatInput) {
        chatInput.value = p;
        chatInput.focus();
        sendMessage();
      }
    });
  });

  // Delegated chip click on messageHistory for dynamically re-rendered chips
  messageHistory?.addEventListener("click", (e) => {
    const chip = e.target.closest(".welcome-chip, .clean-prompt-card, .clean-prompt-pill");
    if (!chip) return;
    const q = chip.dataset.query || chip.dataset.prompt;
    if (q && chatInput) {
      chatInput.value = q;
      chatInput.focus();
      sendMessage();
    }
  });

  newChatBtn?.addEventListener("click", createNewSession);

  const btnDeleteActiveChat = document.getElementById("btn-delete-active-chat");
  btnDeleteActiveChat?.addEventListener("click", async () => {
    if (!state.currentSessionId) return;
    const confirmed = await showConfirmDialog({
      title: "Delete Current Conversation?",
      subtitle: "Permanently erase this chat session and its complete message history.",
      itemName: sessionLabel?.textContent?.trim() || "Active Session",
      confirmText: "Delete Chat",
      confirmDanger: true,
    });
    if (!confirmed) return;
    try {
      await fetch(`${API_BASE}/api/sessions/${state.currentSessionId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      removeVisitorSession(state.currentSessionId);
      state.currentSessionId = null;
      clearChat();
      await loadSessions();
      showToast("Chat session deleted", "success");
    } catch (err) {
      showToast(`Failed to delete session: ${err.message}`, "error");
    }
  });

  structuredToggle?.addEventListener("change", () => {
    if (structuredToggle.checked && smartToggle) {
      smartToggle.checked = false;
    }
  });

  smartToggle?.addEventListener("change", () => {
    if (smartToggle.checked && structuredToggle) {
      structuredToggle.checked = false;
    }
  });
}
