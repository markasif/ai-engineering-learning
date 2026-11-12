/**
 * AskRaggy Enterprise Platform - Autonomous ReAct & Multi-Step Agent Module
 */
import { state } from "./state.js";
import {
  escapeHtml,
  formatMarkdownToHtml,
  showToast,
  setButtonStopState,
  appendStoppedNotice,
  playNotificationSound,
  startThinkingPercentage,
  renderRateLimitNotice,
  buildSmartExportRow,
  detectExportWorthy
} from "./utils.js";
import { API_BASE, getAuthHeaders, recordVisitorSession } from "./api.js";
import {
  setActiveSession,
  loadSessions,
  updateDemoQuotaDisplay,
  showDemoLimitModal,
  startEditMessage
} from "./chat.js";

export const agentInput = document.getElementById("agent-input");
export const agentChatInput = agentInput;
export const agentSendBtn = document.getElementById("agent-send-btn");
export const agentHistory = document.getElementById("agent-history");
export const agentMessageHistory = agentHistory;
export const agentNoSession = document.getElementById("agent-no-session");
export const agentEmptyState = document.getElementById("agent-empty-state");

// ReAct Agent functions
export function checkAgentSessionState() {
  if (agentNoSession) agentNoSession.hidden = true;
  if (agentInput) agentInput.disabled = false;
  if (agentSendBtn) agentSendBtn.disabled = false;
}

/** Append a user message bubble to the agent history. */
export function agentAppendUser(text) {
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
export function agentAppendThinking() {
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
  const percentEl = document.createElement("span");
  percentEl.className = "thinking-percent";
  percentEl.textContent = "0%";
  bubble.appendChild(percentEl);
  startThinkingPercentage(wrapper, percentEl);
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
export function agentAppendResponse(data) {
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

  // ── Smart export: agent responses with tool steps are always export-worthy ──
  const agentDetection = detectExportWorthy(data.result ?? "");
  const hasSteps = Boolean(data.steps?.length);
  if (agentDetection.worthy || hasSteps) {
    const enriched = { ...agentDetection, hasSources: agentDetection.hasSources || hasSteps, worthy: true };
    const actionsRow = buildSmartExportRow("agent", enriched, answerEl);
    actionsRow.className = "assistant-msg-actions";
    card.appendChild(actionsRow);
  }

  wrapper.appendChild(label);
  wrapper.appendChild(card);
  agentHistory.appendChild(wrapper);
  agentHistory.scrollTop = agentHistory.scrollHeight;
  playNotificationSound();
}

/** Send a message to the agent endpoint. */
export async function runAgent(overrideText = null, existingUserEl = null) {
  const text = (overrideText ?? agentInput?.value)?.trim();
  if (!text) return;

  if (agentInput) agentInput.value = "";

  let userEl = existingUserEl;
  if (!userEl) {
    userEl = agentAppendUser(text);
  }

  const thinkingEl = agentAppendThinking();

  // Activate Stop generation state for Agent Chat
  state.activeAgentAbortController = new AbortController();
  setButtonStopState(agentSendBtn, true, "Run agent");

  // Auto-provision session in background if none active
  if (!state.currentSessionId) {
    try {
      const headers = {};
      if (state.activeTenantId) headers["X-Tenant-ID"] = state.activeTenantId;
      const sRes = await fetch(`${API_BASE}/api/sessions`, {
        method: "POST",
        headers,
        signal: state.activeAgentAbortController.signal,
      });
      if (sRes.ok) {
        const sData = await sRes.json();
        state.currentSessionId = sData.session_id;
        recordVisitorSession(state.currentSessionId);
        setActiveSession(state.currentSessionId);
        await loadSessions();
      }
    } catch {}
  }

  if (!state.currentSessionId) {
    showToast("Unable to initialize session for agent.", "error");
    state.activeAgentAbortController = null;
    setButtonStopState(agentSendBtn, false, "Run agent");
    return;
  }

  const headers = getAuthHeaders();

  try {
    const res = await fetch(
      `${API_BASE}/api/sessions/${state.currentSessionId}/agent/run`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: text,
          persona: state.currentPersona.role,
          user_name: state.currentPersona.name,
          user_code: state.currentPersona.code,
        }),
        signal: state.activeAgentAbortController.signal,
      },
    );

    if (!res.ok) {
      thinkingEl.remove();
      if (res.status === 429) {
        const err = await res.json().catch(() => ({}));
        if (err.detail && err.detail.includes("DEMO_LIMIT_REACHED")) {
          showDemoLimitModal();
        } else {
          renderRateLimitNotice("agent");
        }
        return;
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const data = await res.json();
    thinkingEl.remove();
    if (typeof data.demo_credits_left === "number") {
      updateDemoQuotaDisplay(data.demo_credits_left);
    }
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
    state.activeAgentAbortController = null;
    setButtonStopState(agentSendBtn, false, "Run agent");
    agentInput?.focus();
  }
}

agentSendBtn?.addEventListener("click", () => {
  if (state.activeAgentAbortController) {
    state.activeAgentAbortController.abort();
    state.activeAgentAbortController = null;
    return;
  }
  dispatchAgent();
});

agentInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (state.activeAgentAbortController) return;
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



// Multi-Step Agent functions
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

export function setAgentMode(mode) {
  agentMode = mode;
  agentModeBtns.forEach((b) => b.classList.toggle("active", b.dataset.mode === agentMode));
}

/** Check if a user's prompt is a compound or multi-action workflow. */
export function isComplexMultiStepQuery(text) {
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

export function showMultiStepModal(promptText) {
  pendingMultiStepPrompt = promptText;
  if (multistepModalPreview) {
    multistepModalPreview.textContent = `\"${promptText}\"`;
  }
  if (multistepModalBackdrop) {
    multistepModalBackdrop.hidden = false;
  }
}

export function hideMultiStepModal() {
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
export function dispatchAgent() {
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
export async function runMultiStepAgent(overrideText = null, existingUserEl = null) {
  const text = (overrideText ?? agentInput?.value)?.trim();
  if (!text) return;

  if (agentInput) agentInput.value = "";

  let userEl = existingUserEl;
  if (!userEl) {
    userEl = agentAppendUser(text);
  }

  state.activeAgentAbortController = new AbortController();
  setButtonStopState(agentSendBtn, true, "Run agent");

  // Auto-provision session in background if none active
  if (!state.currentSessionId) {
    try {
      const headers = {};
      if (state.activeTenantId) headers["X-Tenant-ID"] = state.activeTenantId;
      const sRes = await fetch(`${API_BASE}/api/sessions`, { method: "POST", headers });
      if (sRes.ok) {
        const sData = await sRes.json();
        state.currentSessionId = sData.session_id;
        recordVisitorSession(state.currentSessionId);
        setActiveSession(state.currentSessionId);
        await loadSessions();
      }
    } catch {}
  }

  agentAppendUser(text);
  // Insert a placeholder progress card — we'll update it as the task runs.
  const progressCard = agentAppendPlanningCard(text);

  const headers = { "Content-Type": "application/json" };
  if (state.activeTenantId) headers["X-Tenant-ID"] = state.activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/agent/plan`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: text, session_id: state.currentSessionId }),
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
    state.activeAgentAbortController = null;
    setButtonStopState(agentSendBtn, false, "Run agent");
    agentInput?.focus();
  }
}

/**
 * Insert a "planning…" skeleton card into the agent history.
 * Returns the card element so pollTaskStatus() can update it.
 */
export function agentAppendPlanningCard(message) {
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
export function updatePlanningCard(card, task) {
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
export async function pollTaskStatus(taskId, card) {
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      if (state.activeAgentAbortController?.signal?.aborted) {
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
          signal: state.activeAgentAbortController?.signal,
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



export function initAgent() {
  agentSendBtn?.addEventListener("click", () => {
    if (state.activeAgentAbortController) {
      state.activeAgentAbortController.abort();
      state.activeAgentAbortController = null;
      setButtonStopState(agentSendBtn, false, null);
      return;
    }
    dispatchAgent();
  });

  agentChatInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (state.activeAgentAbortController) return;
      dispatchAgent();
    }
  });

  document.querySelectorAll(".agent-prompt-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.prompt;
      if (p && agentChatInput) {
        agentChatInput.value = p;
        agentChatInput.focus();
        dispatchAgent();
      }
    });
  });

  document.querySelectorAll(".agent-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setAgentMode(btn.dataset.agentMode));
  });

  const dismissBtn = document.getElementById("multistep-modal-dismiss");
  dismissBtn?.addEventListener("click", hideMultiStepModal);

  const confirmBtn = document.getElementById("multistep-modal-confirm");
  confirmBtn?.addEventListener("click", () => {
    const query = confirmBtn.dataset.query;
    hideMultiStepModal();
    if (query) runMultiStepAgent(query);
  });
}
