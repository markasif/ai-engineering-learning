/**
 * AskRaggy Enterprise Platform - Documents & Grounded Q&A Module
 */
import { state } from "./state.js";
import {
  escapeHtml,
  formatMarkdownToHtml,
  formatClientPlainSummary,
  showToast,
  showConfirmDialog,
  setButtonStopState,
  appendStoppedNotice,
  playNotificationSound,
  startThinkingPercentage
} from "./utils.js";
import { API_BASE, getAuthHeaders } from "./api.js";

export const fileInput = document.getElementById("file-input");
export const uploadBtn = document.getElementById("upload-btn");
export const uploadSpinner = document.getElementById("upload-spinner");
export const uploadStatus = document.getElementById("upload-status");
export const docDropzone = document.getElementById("doc-dropzone");
export const documentsList = document.getElementById("documents-list");
export const docCount = document.getElementById("doc-count");
export const docEmpty = document.getElementById("doc-empty");

export const docChatInput = document.getElementById("doc-chat-input");
export const docSendBtn = document.getElementById("doc-send-btn");
export const docMessageHistory = document.getElementById("doc-message-history");
export const docEmptyState = document.getElementById("doc-empty-state");
export const docFilterSelect = document.getElementById("search-doc-filter");

// Document Ingestion & Cards
export async function uploadFile(file) {
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
      state.activeDocumentId = uploadedDoc.id;
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
export function getDocFileIcon(filename) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  if (ext === "pdf") return "📕";
  if (ext === "docx" || ext === "doc") return "📘";
  if (ext === "txt") return "📄";
  return "📄";
}

/** Render the list of uploaded documents inside the top-right popover dropdown */
export function renderDocPopoverList(popoverListEl, docs, currentActiveId) {
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
      if (state.activeDocumentId !== doc.id) {
        state.activeDocumentId = doc.id;
        loadDocuments();
        showToast(`Active grounded document: "${doc.filename}"`, "info");
      }
    });

    item.querySelector(".btn-select-doc")?.addEventListener("click", (e) => {
      e.stopPropagation();
      state.activeDocumentId = doc.id;
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
export async function loadDocuments() {
  const uploadContainer = document.getElementById("upload-container");
  const btnToggleUpload = document.getElementById("btn-toggle-upload");
  const docGroundingBanner = document.getElementById("doc-grounding-banner");
  const groundingTitle = document.getElementById("grounding-title");
  const groundingSubtitle = document.getElementById("grounding-subtitle");
  const documentChatSection = document.getElementById("document-chat-section");
  const docChatInput = document.getElementById("doc-chat-input");

  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/documents`, { headers });
    if (!res.ok) throw new Error("documents endpoint not available");

    const docs = await res.json();
    state.currentDocsCache = docs;

    const docUploadHint = document.getElementById("doc-upload-hint");
    const docPromptGrid = document.getElementById("doc-prompt-grid");

    if (!docs.length) {
      state.activeDocumentId = null;
      state.currentDocsCache = [];

      // 0 documents: show upload guidance hint below the 3 prompt cards
      if (docUploadHint) docUploadHint.style.display = "flex";
      if (docPromptGrid) docPromptGrid.style.display = "grid";

      if (docGroundingBanner) {
        docGroundingBanner.style.display = "none";
      }

      if (docChatInput) {
        docChatInput.placeholder = getDocPlaceholder(null);
      }

      // Update doc manager pill in top right
      const docManagerDot = document.getElementById("doc-manager-dot");
      const docManagerLabel = document.getElementById("doc-manager-label");
      const docPopoverBadge = document.getElementById("doc-popover-badge");
      const docPopoverList = document.getElementById("doc-popover-list");

      if (docManagerDot) docManagerDot.classList.remove("active");
      if (docManagerLabel) {
        docManagerLabel.textContent = "No document";
        docManagerLabel.title = "No documents uploaded yet";
      }
      if (docPopoverBadge) docPopoverBadge.textContent = "0 files";
      if (docPopoverList) {
        renderDocPopoverList(docPopoverList, [], null);
      }

      if (typeof updateStrategyAdvisory === "function") {
        updateStrategyAdvisory();
      }
      loadSearchDocumentFilter([]);
      return;
    }

    // 1+ documents: hide upload guidance hint, SHOW "Try asking" prompt cards
    if (docUploadHint) docUploadHint.style.display = "none";
    if (docPromptGrid) docPromptGrid.style.display = "grid";

    if (btnToggleUpload) {
      btnToggleUpload.style.display = "none";
    }
    if (uploadContainer) {
      uploadContainer.style.display = "none";
    }

    const readyDocs = docs.filter((d) => d.status === "ready");

    // Select active document: prioritize explicitly active doc (e.g. freshly uploaded),
    // otherwise default to the latest uploaded document so older files never interfere!
    let activeDoc = null;
    if (state.activeDocumentId) {
      activeDoc = readyDocs.find((d) => d.id === state.activeDocumentId) || docs.find((d) => d.id === state.activeDocumentId);
    }
    if (!activeDoc) {
      activeDoc = readyDocs[readyDocs.length - 1] || docs[docs.length - 1];
      state.activeDocumentId = activeDoc ? activeDoc.id : null;
    }
    const activeDocName = activeDoc ? activeDoc.filename : "your document";

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
      renderDocPopoverList(docPopoverList, docs, state.activeDocumentId);
    }

    if (typeof updateStrategyAdvisory === "function") {
      updateStrategyAdvisory();
    }

    loadSearchDocumentFilter(docs);
  } catch (err) {
    console.warn("Documents load notice:", err);
  }
}

/**
 * Build a document card DOM element.
 * Clicking the header toggles the chunk list (lazy-loaded).
 */
export function buildDocumentCard(doc) {
  const card = document.createElement("div");
  card.className = "document-card";
  card.dataset.docId = doc.id;

  const header = document.createElement("div");
  header.className = "document-card-header";
  header.setAttribute("role", "button");
  header.setAttribute("aria-expanded", "false");
  header.tabIndex = 0;

  // Top row: Title and Delete action with ample breathing room
  const topRow = document.createElement("div");
  topRow.className = "document-card-top";

  const title = document.createElement("span");
  title.className = "document-card-title";
  title.textContent = doc.filename;
  title.title = doc.filename;

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn-delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.setAttribute("aria-label", `Delete ${doc.filename}`);
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteDocumentById(doc.id);
  });

  topRow.appendChild(title);
  topRow.appendChild(deleteBtn);

  // Bottom row: Status badge, strategy tag, and concise chunk info
  const bottomRow = document.createElement("div");
  bottomRow.className = "document-card-bottom";

  const badge = document.createElement("span");
  badge.className = "status-badge";
  badge.dataset.status = doc.status;
  badge.textContent = doc.status;

  // Strategy tag
  const stratTag = document.createElement("span");
  stratTag.className = "strategy-tag";
  stratTag.textContent = doc.chunking_strategy ?? "sentence";

  // Concise description so it never crowds mobile cards
  const meta = document.createElement("span");
  meta.className = "document-card-meta";
  meta.textContent = doc.status === "ready"
    ? `${doc.chunk_count} chunks`
    : "";

  bottomRow.appendChild(badge);
  bottomRow.appendChild(stratTag);
  if (meta.textContent) {
    bottomRow.appendChild(meta);
  }

  header.appendChild(topRow);
  header.appendChild(bottomRow);
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
export async function deleteDocumentById(docId) {
  const doc = state.currentDocsCache.find((d) => d.id === docId);
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

    // If deleted document was active, reset state.activeDocumentId so next document is selected
    if (state.activeDocumentId === docId) {
      state.activeDocumentId = null;
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



// Grounded Q&A / Doc Chat
export async function loadSearchDocumentFilter(preloadedDocs = null) {
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
      if (d.id === state.activeDocumentId) {
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

    if (state.activeDocumentId && readyDocs.some((d) => d.id === state.activeDocumentId)) {
      searchDocFilter.value = state.activeDocumentId;
    }
  } catch {
    // Search still works without the filter populated.
  }
}

// Synchronize state.activeDocumentId and UI when user picks a different document in filter
searchDocFilter?.addEventListener("change", () => {
  state.activeDocumentId = searchDocFilter.value || null;
  const doc = currentDocsCache.find((d) => d.id === state.activeDocumentId);
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

export function appendDocChatMessage(role, text, isThinking = false) {
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
    const percentEl = document.createElement("span");
    percentEl.className = "thinking-percent";
    percentEl.textContent = "0%";
    bubble.appendChild(percentEl);
    startThinkingPercentage(wrapper, percentEl);
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

export function appendDocAiResponse(data) {
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
export async function sendDocMessage(customQuery = null, existingUserEl = null) {
  const query = (typeof customQuery === "string" ? customQuery : (docChatInput?.value || "")).trim();
  if (!query) return;

  if (!currentDocsCache.length || !state.activeDocumentId) {
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
  state.activeDocAbortController = new AbortController();
  setButtonStopState(docSendBtn, true, "Ask document");

  const documentId = searchDocFilter?.value || state.activeDocumentId || null;
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
        signal: state.activeDocAbortController.signal,
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
    if (!data && state.activeDocAbortController && !state.activeDocAbortController.signal.aborted) {
      try {
        const res = await fetch(`${API_BASE}/api/search/ask`, {
          method: "POST",
          headers,
          body: JSON.stringify({ query, top_k: 6, document_id: documentId }),
          signal: state.activeDocAbortController.signal,
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch {}
    }

    // 3. Tertiary GET endpoint: GET /api/documents/ask?query=...
    if (!data && state.activeDocAbortController && !state.activeDocAbortController.signal.aborted) {
      try {
        const params = new URLSearchParams({ query });
        if (documentId) params.append("document_id", documentId);
        const res = await fetch(`${API_BASE}/api/documents/ask?${params.toString()}`, {
          method: "GET",
          headers,
          signal: state.activeDocAbortController.signal,
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch {}
    }

    // 4. Fallback search endpoint: POST /api/search with plain-English synthesis
    if (!data && state.activeDocAbortController && !state.activeDocAbortController.signal.aborted) {
      try {
        const res = await fetch(`${API_BASE}/api/search`, {
          method: "POST",
          headers,
          body: JSON.stringify({ query, top_k: 5, document_id: documentId }),
          signal: state.activeDocAbortController.signal,
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
    state.activeDocAbortController = null;
    setButtonStopState(docSendBtn, false, "Ask document");
    docChatInput?.focus();
  }
}

// Wire Document Chat events (supports stopping while generating)
docSendBtn?.addEventListener("click", () => {
  if (state.activeDocAbortController) {
    state.activeDocAbortController.abort();
    state.activeDocAbortController = null;
    return;
  }
  sendDocMessage();
});

docChatInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (state.activeDocAbortController) return;
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



// Modern Doc Chat Box: Drag & Drop + Attach File Button
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



// Custom Chunking Strategy Dropdown
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

        // Update trigger button label & badge (concise on mobile)
        if (strategyTriggerLabel) {
          const isMobile = window.innerWidth <= 768;
          if (value === "auto") {
            strategyTriggerLabel.textContent = isMobile ? "Auto" : "Auto (Adaptive)";
          } else if (value === "cag") {
            strategyTriggerLabel.textContent = isMobile ? "CAG" : "CAG (Full Context)";
          } else if (value === "sentence") {
            strategyTriggerLabel.textContent = isMobile ? "Sentence" : "Sentence-aware";
          } else {
            strategyTriggerLabel.textContent = isMobile ? "Paragraph" : "Paragraph-based";
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
})();

/**
 * Real-time Document Size Detection & Strategy Advisory
 * Inspects active document page/character size and shows warning/tips based on selected strategy.
 * (Defined in global scope so loadDocuments and other handlers can invoke it safely)
 */
export function updateStrategyAdvisory() {
  const advisoryEl = document.getElementById("doc-strategy-advisory");
  if (advisoryEl) {
    advisoryEl.style.display = "none";
  }
}
window.updateStrategyAdvisory = updateStrategyAdvisory;

/** Helper to get responsive concise placeholder for document chat input */


// CAG Popover & Upload Container Toggles
const btnToggleUpload = document.getElementById("btn-toggle-upload");
const btnUploadBottom = document.getElementById("btn-upload-bottom");
const uploadContainer = document.getElementById("upload-container");

export function toggleUploadContainer(forceOpen = null) {
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

export function openFileUploadPicker() {
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

export function toggleCagPopover(forceState) {
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





export function initDocuments() {
  fileInput?.addEventListener("change", () => {
    if (fileInput.files.length > 0) uploadFile(fileInput.files[0]);
  });

  uploadBtn?.addEventListener("click", () => {
    if (fileInput.files.length > 0) uploadFile(fileInput.files[0]);
  });

  docDropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    docDropzone.classList.add("dragover");
  });
  docDropzone?.addEventListener("dragleave", () => {
    docDropzone.classList.remove("dragover");
  });
  docDropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    docDropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      uploadFile(e.dataTransfer.files[0]);
    }
  });

  docSendBtn?.addEventListener("click", () => {
    if (state.activeDocAbortController) {
      state.activeDocAbortController.abort();
      state.activeDocAbortController = null;
      setButtonStopState(docSendBtn, false, null);
      return;
    }
    sendDocMessage();
  });

  docChatInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (state.activeDocAbortController) return;
      sendDocMessage();
    }
  });

  document.querySelectorAll(".doc-prompt-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.prompt;
      if (p && docChatInput) {
        docChatInput.value = p;
        docChatInput.focus();
        sendDocMessage();
      }
    });
  });

  // Grounding handbook note direct switch button
  const btnGotoDocUpload = document.getElementById("btn-goto-doc-upload");
  btnGotoDocUpload?.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof window.switchTab === "function") {
      window.switchTab("documents");
    }
    setTimeout(() => {
      const docInput = document.getElementById("file-input");
      if (docInput) docInput.click();
    }, 150);
  });
}
