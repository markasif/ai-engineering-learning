/**
 * AskRaggy Enterprise Platform - Utilities Module
 */
import { state, SOUND_STORAGE_KEY } from "./state.js";

// --- Rate Limit Notice ---
export function renderRateLimitNotice(containerType = "chat") {
  const cardHtml = `
    <div class="rate-limit-card" role="alert" style="margin: 0.85rem 0; padding: 1.15rem 1.25rem; border-radius: 12px; border: 1px solid rgba(224, 86, 36, 0.4); background: rgba(224, 86, 36, 0.08); box-shadow: 0 4px 16px rgba(0,0,0,0.2);">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.45rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 600; font-size: 0.95rem; color: #ff8c66;">
          <span style="font-size: 1.15rem;">⚠️</span>
          <span>Rate Limit Reached</span>
        </div>
        <span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 999px; background: rgba(224,86,36,0.2); color: #ffab91; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;">Rate Limited</span>
      </div>
      <p style="margin: 0 0 0.85rem 0; font-size: 0.86rem; color: var(--color-silver, #b0b4ba); line-height: 1.5;">
        AskRaggy is currently experiencing high traffic volume. The shared rate limit has been reached for this minute.
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



// --- Audio Notification Chime (Web Audio API) ---
let audioNotificationCtx = null;
export const soundToggleBtn = document.getElementById("sound-toggle-btn");
export const soundIcon = document.getElementById("sound-icon");

const SOUND_ON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
const SOUND_MUTED_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;

export function updateSoundToggleUI() {
  if (!soundToggleBtn) return;
  if (state.soundNotificationsEnabled) {
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

export function initSound() {
  soundToggleBtn?.addEventListener("click", () => {
    state.soundNotificationsEnabled = !state.soundNotificationsEnabled;
    localStorage.setItem(SOUND_STORAGE_KEY, String(state.soundNotificationsEnabled));
    updateSoundToggleUI();
    if (state.soundNotificationsEnabled) {
      playNotificationSound();
    }
  });
  updateSoundToggleUI();
}

export function playNotificationSound() {
  if (!state.soundNotificationsEnabled) return;
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

// --- Stop & Send Button UI Icons & Helpers ---
export const SEND_ICON_SVG = `<svg class="send-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
export const STOP_ICON_SVG = `<svg class="stop-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3"></rect></svg>`;

export function setButtonStopState(btn, isStop, defaultTitle = "Send message") {
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
export function appendStoppedNotice(context = "general") {
  const wrapper = document.createElement("div");
  wrapper.className = "message ai stopped-notice-message";

  const label = document.createElement("span");
  label.className = "role-label";
  label.style.display = "none";

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
    const docMessageHistory = document.getElementById("doc-message-history");
    if (docMessageHistory) {
      docMessageHistory.appendChild(wrapper);
      docMessageHistory.scrollTop = docMessageHistory.scrollHeight;
    }
  } else if (context === "agent") {
    const agentHistory = document.getElementById("agent-history");
    if (agentHistory) {
      agentHistory.appendChild(wrapper);
      agentHistory.scrollTop = agentHistory.scrollHeight;
    }
  } else {
    const messageHistory = document.getElementById("message-history");
    if (messageHistory) {
      messageHistory.appendChild(wrapper);
      messageHistory.scrollTop = messageHistory.scrollHeight;
    }
  }
}


// --- Thinking Percentage Timer ---
export function startThinkingPercentage(wrapper, percentEl) {
  let currentProgress = 0;
  let targetProgress = 20; // Phase 1: Query analysis & intent routing
  const startTime = Date.now();

  const timer = setInterval(() => {
    if (!wrapper || !wrapper.isConnected) {
      clearInterval(timer);
      return;
    }
    const elapsed = (Date.now() - startTime) / 1000;

    // Organic pipeline pacing reflecting actual backend stages:
    if (targetProgress < 45 && elapsed >= 0.4) {
      targetProgress = 45; // Phase 2: Vector retrieval & chunk search
    } else if (targetProgress < 70 && elapsed >= 1.2) {
      targetProgress = 70; // Phase 3: Grounded context synthesis
    } else if (targetProgress < 88 && elapsed >= 2.5) {
      targetProgress = 88; // Phase 4: Model inference & generating answer
    }

    // Steady, smooth increment without sudden jumps or rushing to 99%
    if (currentProgress < targetProgress) {
      const remaining = targetProgress - currentProgress;
      const step = Math.max(0.3, remaining * 0.08);
      currentProgress = Math.min(targetProgress, currentProgress + step);
    }

    // Cap at 88% while waiting for generation so it never freezes at 98-99%
    if (currentProgress > 88 && targetProgress < 100) {
      currentProgress = 88;
    }

    percentEl.textContent = `${Math.round(currentProgress)}%`;
  }, 45);

  wrapper._thinkingTimer = timer;

  // Real-time synchronization hook called when backend retrieval/token events arrive
  wrapper.updateThinkingProgress = function (newTarget) {
    targetProgress = newTarget;
    if (newTarget >= 100) {
      currentProgress = 100;
      percentEl.textContent = "100%";
      clearInterval(timer);
    }
  };

  // Intercept wrapper.remove() for immediate cleanup
  const origRemove = wrapper.remove ? wrapper.remove.bind(wrapper) : null;
  if (origRemove) {
    wrapper.remove = function () {
      if (wrapper._thinkingTimer) {
        clearInterval(wrapper._thinkingTimer);
        wrapper._thinkingTimer = null;
      }
      origRemove();
    };
  }

  return timer;
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

// --- Toast & Confirmation Modal ---
export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast-pill toast-${type}`;

  // Strip leading emojis so toaster display is purely clean and typographic
  const cleanMsg = (message || "").replace(/^[\p{Emoji}\u200d\uFE0F\s]+/u, "").trim();

  toast.innerHTML = `
    <span class="toast-indicator" aria-hidden="true"></span>
    <span class="toast-msg">${escapeHtml(cleanMsg || message)}</span>
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
export function showConfirmDialog({
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



// --- String escaping and Markdown Formatting ---
export function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function sanitizeDocText(str) {
  if (!str) return "";
  return str.replace(/[\u25a0-\u25ff\uf000-\uf0ff\ue000-\uf8ff\ufffd]/g, " ").replace(/\s+/g, " ").trim();
}

/** Format markdown into clean HTML with tables, headings, paragraphs, bold, lists, and code */
export function formatMarkdownToHtml(markdown) {
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

export function formatClientPlainSummary(query, chunks) {
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


// --- Export Helpers ---
export function detectExportWorthy(htmlOrText) {
  if (!htmlOrText) return { worthy: false };

  const text = htmlOrText;

  // 1. Markdown/HTML table
  const hasTable = /<table[\s>]|^\|.+\|/m.test(text) || text.includes("<table");

  // 2. Code block
  const hasCode = text.includes("<code") || text.includes("<pre") || /```/.test(text);

  // 3. Retrieval sources cited (RAG evidence)
  const hasSources = /\[(\d+|Source[^\]]*)\]|Sources?:|References?:|Retrieved from|Chunk \d+/i.test(text);

  // 4. Long-form answer (≥150 words)
  const wordCount = text.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  const isLong = wordCount >= 150;

  const worthy = hasTable || hasCode || hasSources || isLong;
  return { worthy, hasTable, hasCode, hasSources, isLong, wordCount };
}

/**
 * Build an export action row with smart-detected contextual buttons.
 * - Always: Copy button
 * - If table detected: CSV Export button
 * - If long/source/code: Full Export dropdown (PDF, MD)
 *
 * @param {string} contextType - "general" | "doc" | "agent"
 * @param {Object} detection - result from detectExportWorthy()
 * @param {HTMLElement} answerEl - the DOM element containing the answer (for copy)
 * @returns {HTMLElement} actionsRow div
 */
export function buildSmartExportRow(contextType, detection, answerEl) {
  const actionsRow = document.createElement("div");
  actionsRow.className = "assistant-msg-actions";

  // ── Always: Copy button ──
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "btn-msg-copy";
  copyBtn.title = "Copy answer";
  copyBtn.setAttribute("aria-label", "Copy answer");
  copyBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    <span>Copy</span>
  `;
  copyBtn.addEventListener("click", () => {
    const textToCopy = answerEl ? answerEl.innerText.trim() : "";
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast("Copied to clipboard", "success");
    });
  });
  actionsRow.appendChild(copyBtn);

  // ── If table: CSV export button ──
  if (detection.hasTable) {
    const csvBtn = document.createElement("button");
    csvBtn.type = "button";
    csvBtn.className = "btn-msg-copy btn-msg-csv";
    csvBtn.title = "Export table as CSV";
    csvBtn.setAttribute("aria-label", "Export table as CSV");
    csvBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
      </svg>
      <span>CSV</span>
    `;
    csvBtn.addEventListener("click", () => exportChatAsCsv(contextType));
    actionsRow.appendChild(csvBtn);
  }

  // ── If long/sources/code: full export dropdown ──
  if (detection.isLong || detection.hasSources || detection.hasCode) {
    const exportDropdown = createMsgExportDropdown(contextType);
    actionsRow.appendChild(exportDropdown);
  }

  return actionsRow;
}

export function createMsgExportDropdown(contextType = "general") {
  const exportWrapper = document.createElement("div");
  exportWrapper.className = "msg-export-wrapper";

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "btn-msg-export";
  exportBtn.title = "Export conversation";
  exportBtn.setAttribute("aria-label", "Export conversation");
  exportBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
    <span>Export</span>
    <span class="export-chevron" aria-hidden="true">▾</span>
  `;

  const menu = document.createElement("div");
  menu.className = "msg-export-menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <button type="button" class="export-menu-item" data-action="pdf" role="menuitem">
      <span class="export-menu-icon" aria-hidden="true">📄</span>
      <div class="export-menu-text">
        <strong>Print / PDF</strong>
        <span>Clean branded report layout</span>
      </div>
    </button>
    <button type="button" class="export-menu-item" data-action="csv" role="menuitem">
      <span class="export-menu-icon" aria-hidden="true">📊</span>
      <div class="export-menu-text">
        <strong>Export Tables (CSV)</strong>
        <span>Download claims &amp; records</span>
      </div>
    </button>
    <button type="button" class="export-menu-item" data-action="md" role="menuitem">
      <span class="export-menu-icon" aria-hidden="true">📝</span>
      <div class="export-menu-text">
        <strong>Transcript (.md)</strong>
        <span>Markdown conversation record</span>
      </div>
    </button>
    <button type="button" class="export-menu-item" data-action="copy" role="menuitem">
      <span class="export-menu-icon" aria-hidden="true">📋</span>
      <div class="export-menu-text">
        <strong>Copy Text</strong>
        <span>Copy chat to clipboard</span>
      </div>
    </button>
  `;

  exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = menu.hidden;
    document.querySelectorAll(".msg-export-menu:not([hidden])").forEach((m) => {
      if (m !== menu) m.hidden = true;
    });
    menu.hidden = !isHidden;
  });

  menu.querySelectorAll(".export-menu-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = true;
      const action = btn.dataset.action;
      if (action === "pdf") window.print();
      else if (action === "csv") exportChatAsCsv(contextType);
      else if (action === "md") exportChatAsMarkdown(contextType);
      else if (action === "copy") copyChatText(contextType);
    });
  });

  exportWrapper.appendChild(exportBtn);
  exportWrapper.appendChild(menu);
  return exportWrapper;
}

// Global click listener to dismiss any open export menus
document.addEventListener("click", (e) => {
  if (!e.target.closest(".msg-export-wrapper")) {
    document.querySelectorAll(".msg-export-menu:not([hidden])").forEach((m) => {
      m.hidden = true;
    });
  }
});

export function exportChatAsCsv(contextType = "general") {
  const messagesEl = getActiveMessagesContainer(contextType);
  if (!messagesEl) return;
  const tables = messagesEl.querySelectorAll("table");
  let csvContent = "";

  if (tables.length > 0) {
    tables.forEach((table, tableIdx) => {
      csvContent += `Table ${tableIdx + 1}\n`;
      const rows = table.querySelectorAll("tr");
      rows.forEach((row) => {
        const cols = row.querySelectorAll("th, td");
        const rowData = Array.from(cols)
          .map((c) => `"${c.innerText.trim().replace(/"/g, '""')}"`)
          .join(",");
        csvContent += rowData + "\n";
      });
      csvContent += "\n";
    });
  } else {
    csvContent = "Timestamp,Speaker,Message\n";
    const bubbles = messagesEl.querySelectorAll(".message");
    bubbles.forEach((b) => {
      const isUser = b.classList.contains("user");
      const persona = state.currentPersona || { name: "User", role: "employee" };
      const speaker = isUser ? `User (${persona.name})` : "AskRaggy Assistant";
      const time = new Date().toLocaleTimeString();
      const text = b.innerText.replace(/"/g, '""');
      csvContent += `"${time}","${speaker}","${text}"\n`;
    });
  }

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `askraggy-export-${state.currentSessionId ? state.currentSessionId.slice(0, 8) : "session"}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("📊 Data table exported as CSV!", "success");
}

export function exportChatAsMarkdown(contextType = "general") {
  const messagesEl = getActiveMessagesContainer(contextType);
  if (!messagesEl) return;
  const bubbles = messagesEl.querySelectorAll(".message");
  if (bubbles.length === 0) {
    showToast("No messages to export yet.", "info");
    return;
  }

  const persona = state.currentPersona || { name: "User", role: "employee" };
  let md = `# AskRaggy Enterprise Intelligence — Chat Transcript\n\n`;
  md += `- **Date:** ${new Date().toLocaleString()}\n`;
  md += `- **Active Persona:** ${persona.name} (${persona.role.toUpperCase()})\n`;
  md += `- **Session ID:** \`${state.currentSessionId || "session"}\`\n`;
  md += `- **Enterprise Domain:** ${state.currentDomainName || "Enterprise HR & Operations"}\n\n---\n\n`;

  bubbles.forEach((b) => {
    const isUser = b.classList.contains("user");
    const speaker = isUser ? `👤 User (${persona.name})` : `🤖 AskRaggy Assistant`;
    md += `### ${speaker}\n\n${b.innerText.trim()}\n\n---\n\n`;
  });

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `askraggy-transcript-${state.currentSessionId ? state.currentSessionId.slice(0, 8) : "session"}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("📝 Transcript exported as Markdown!", "success");
}

export function copyChatText(contextType = "general") {
  const messagesEl = getActiveMessagesContainer(contextType);
  if (!messagesEl) return;
  const bubbles = messagesEl.querySelectorAll(".message");
  if (bubbles.length === 0) {
    showToast("No messages to copy.", "info");
    return;
  }

  const persona = state.currentPersona || { name: "User", role: "employee" };
  let text = `AskRaggy Enterprise Chat Transcript\n`;
  text += `Persona: ${persona.name} (${persona.role}) | Date: ${new Date().toLocaleString()}\n\n`;
  bubbles.forEach((b) => {
    const isUser = b.classList.contains("user");
    const speaker = isUser ? `User (${persona.name})` : "AskRaggy Assistant";
    text += `[${speaker}]\n${b.innerText.trim()}\n\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast("📋 Conversation copied to clipboard!", "success");
  }).catch(() => {
    showToast("Unable to copy to clipboard.", "error");
  });
}

// Mobile sidebar drawer manager
export function toggleMobileSidebar(forceClose = false) {
  const sessionSidebar = document.getElementById("session-sidebar");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");
  const mobileSidebarToggle = document.getElementById("mobile-sidebar-toggle");
  if (!sessionSidebar) return;
  if (forceClose) {
    sessionSidebar.classList.remove("sidebar-open");
    if (sidebarBackdrop) {
      sidebarBackdrop.hidden = true;
      sidebarBackdrop.classList.remove("visible");
    }
    mobileSidebarToggle?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("drawer-open");
    return;
  }
  const isOpen = sessionSidebar.classList.toggle("sidebar-open");
  if (sidebarBackdrop) {
    sidebarBackdrop.hidden = !isOpen;
    sidebarBackdrop.classList.toggle("visible", isOpen);
  }
  mobileSidebarToggle?.setAttribute("aria-expanded", String(isOpen));
  document.body.classList.toggle("drawer-open", isOpen);
}


// --- Responsive Placeholders ---
export function getDocPlaceholder(docName = null) {
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
export function applyResponsivePlaceholders() {
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


