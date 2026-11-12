/**
 * AskRaggy Enterprise Platform - Root Application Entry Point
 */
import {
  state,
  THEME_STORAGE_KEY,
  BYOK_STORAGE_KEY,
  DEMO_PERSONAS
} from "./state.js";
import {
  showToast,
  applyResponsivePlaceholders,
  initSound,
  exportChatAsCsv,
  exportChatAsMarkdown,
  copyChatText,
  toggleMobileSidebar
} from "./utils.js";
import {
  loadProviderInfo
} from "./api.js";
import {
  initChat,
  loadSessions,
  clearChat,
  setPersona,
  updateDemoQuotaDisplay,
  getActiveMessagesContainer,
  createNewSession,
  hideDemoLimitModal,
  sendMessage
} from "./chat.js";
import {
  initDocuments,
  loadDocuments,
  sendDocMessage
} from "./documents.js";
import {
  initAgent,
  checkAgentSessionState,
  runAgent
} from "./agent.js";
import {
  initMcp,
  refreshMcpCount,
  loadMcpServices
} from "./mcp.js";
import {
  initMultimodal
} from "./multimodal.js";
import {
  initAdmin,
  loadTenantInfo,
  loadMetrics,
  loadLastEval
} from "./admin.js";

// Theme Management
let currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || "light";
const themeToggleBtn = document.getElementById("theme-toggle-btn");
const themeIcon = document.getElementById("theme-icon");

const SUN_SVG = `<svg class="sun-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
const MOON_SVG = `<svg class="moon-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

export function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  if (themeIcon) {
    themeIcon.innerHTML = theme === "dark" ? MOON_SVG : SUN_SVG;
  }
  if (themeToggleBtn) {
    themeToggleBtn.setAttribute("aria-label", theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode");
    themeToggleBtn.title = theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode";
  }
}

export function initTheme() {
  themeToggleBtn?.addEventListener("click", () => {
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  });
  applyTheme(currentTheme);
}

// Tab Switching
export function switchTab(tabName) {
  if (tabName === "search") tabName = "documents";
  state.activeTab = tabName;

  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");
  const sidebarAdminBtn = document.getElementById("sidebar-admin-btn");

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

  // Toggle top-right chat & persona controls in navigation bar
  const chatNavControls = document.getElementById("tab-nav-chat-controls");
  if (chatNavControls) {
    chatNavControls.style.display = (tabName === "chat" || tabName === "agent") ? "flex" : "none";
  }

  // Toggle top-right document controls in navigation bar (strictly visible ONLY in Documents tab)
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

  // Toggle top-right agent controls in navigation bar
  const agentNavControls = document.getElementById("tab-nav-agent-controls");
  if (agentNavControls) {
    agentNavControls.style.display = tabName === "agent" ? "flex" : "none";
  }

  if (tabName === "documents") {
    loadDocuments();
  }

  if (tabName === "admin") {
    loadTenantInfo();
    loadMetrics();
    loadLastEval();
    if (!state.metricsRefreshInterval) {
      state.metricsRefreshInterval = setInterval(loadMetrics, 5000);
    }
  } else if (state.metricsRefreshInterval) {
    clearInterval(state.metricsRefreshInterval);
    state.metricsRefreshInterval = null;
  }

  if (tabName === "agent") {
    checkAgentSessionState();
    refreshMcpCount();
  }

  toggleMobileSidebar(true);
}

// Attach switchTab to window for backward compatibility with inline calls
window.switchTab = switchTab;
window.toggleMobileSidebar = toggleMobileSidebar;
window.runAgent = runAgent;
window.sendDocMessage = sendDocMessage;
window.sendMessage = sendMessage;

// BYOK Settings UI Manager
function initByokSettings() {
  const byokInput = document.getElementById("byok-key-input");
  const byokSaveBtn = document.getElementById("byok-save-btn");
  const byokClearBtn = document.getElementById("byok-clear-btn");
  const byokToggleVisBtn = document.getElementById("byok-toggle-visibility-btn");
  const byokStatusCard = document.getElementById("byok-status-card");
  const byokHeaderBadge = document.getElementById("byok-header-badge");

  function updateStatusDisplay() {
    const savedKey = (state.activeByokKey || localStorage.getItem(BYOK_STORAGE_KEY) || "").trim();
    if (byokInput) {
      byokInput.value = savedKey;
    }

    if (savedKey) {
      const isGroq = savedKey.startsWith("gsk_");
      const isOpenAI = savedKey.startsWith("sk-");
      const providerLabel = isGroq ? "Groq LPU (Ultra-Fast)" : (isOpenAI ? "OpenAI Platform" : "Custom Provider");
      const maskedKey = savedKey.length > 10 ? `${savedKey.slice(0, 4)}••••${savedKey.slice(-4)}` : "••••••••";

      if (byokStatusCard) {
        if (byokStatusCard.style) byokStatusCard.style.display = "block";
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
        if (byokHeaderBadge.style) {
          byokHeaderBadge.style.color = "#2ecc71";
          byokHeaderBadge.style.borderColor = "rgba(46, 204, 113, 0.3)";
        }
      }
    } else {
      if (byokStatusCard) {
        if (byokStatusCard.style) byokStatusCard.style.display = "none";
        byokStatusCard.innerHTML = "";
      }
      if (byokHeaderBadge) {
        byokHeaderBadge.textContent = "Optional · Unlimited";
        if (byokHeaderBadge.style) {
          byokHeaderBadge.style.color = "";
          byokHeaderBadge.style.borderColor = "";
        }
      }
    }
  }

  byokSaveBtn?.addEventListener("click", () => {
    const val = (byokInput?.value || "").trim();
    if (!val) {
      showToast("Please enter an API key to save.", "info");
      return;
    }
    state.activeByokKey = val;
    localStorage.setItem(BYOK_STORAGE_KEY, val);
    updateStatusDisplay();
    showToast("Custom API key saved! You now have unlimited access.", "success");
  });

  byokClearBtn?.addEventListener("click", () => {
    state.activeByokKey = "";
    sessionStorage.removeItem(BYOK_STORAGE_KEY);
    localStorage.removeItem(BYOK_STORAGE_KEY);
    if (byokInput) byokInput.value = "";
    updateStatusDisplay();
    showToast("Custom API key removed.", "info");
  });

  byokToggleVisBtn?.addEventListener("click", () => {
    if (!byokInput) return;
    const eyeIcon = byokToggleVisBtn.querySelector(".icon-eye");
    const eyeOffIcon = byokToggleVisBtn.querySelector(".icon-eye-off");
    const isPassword = byokInput.type === "password";

    if (isPassword) {
      byokInput.type = "text";
      if (eyeIcon) eyeIcon.style.display = "none";
      if (eyeOffIcon) eyeOffIcon.style.display = "block";
      byokToggleVisBtn.setAttribute("title", "Hide API Key");
    } else {
      byokInput.type = "password";
      if (eyeIcon) eyeIcon.style.display = "block";
      if (eyeOffIcon) eyeOffIcon.style.display = "none";
      byokToggleVisBtn.setAttribute("title", "Show API Key");
    }
  });

  updateStatusDisplay();
}




// Export & Persona Switcher setup
function initPersonaAndExport() {
  // Persona button listeners (Sidebar Persona Switcher)
  document.getElementById("btn-persona-employee")?.addEventListener("click", () => setPersona("employee"));
  document.getElementById("btn-persona-manager")?.addEventListener("click", () => setPersona("manager"));

  // Legacy export button listeners if present
  const exportBtn = document.getElementById("export-btn");
  const exportMenu = document.getElementById("export-menu");
  if (exportBtn && exportMenu) {
    exportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = exportMenu.hidden;
      exportMenu.hidden = !isHidden;
      exportBtn.setAttribute("aria-expanded", String(isHidden));
    });

    document.addEventListener("click", (e) => {
      if (!exportMenu.hidden && !e.target.closest("#export-dropdown")) {
        exportMenu.hidden = true;
        exportBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  document.getElementById("btn-export-pdf")?.addEventListener("click", () => {
    if (exportMenu) exportMenu.hidden = true;
    window.print();
  });

  document.getElementById("btn-export-csv")?.addEventListener("click", () => {
    if (exportMenu) exportMenu.hidden = true;
    exportChatAsCsv("general");
  });

  document.getElementById("btn-export-md")?.addEventListener("click", () => {
    if (exportMenu) exportMenu.hidden = true;
    exportChatAsMarkdown("general");
  });

  document.getElementById("btn-copy-chat")?.addEventListener("click", () => {
    if (exportMenu) exportMenu.hidden = true;
    copyChatText("general");
  });

  // Demo limit modal listeners
  document.getElementById("demo-limit-modal-close")?.addEventListener("click", hideDemoLimitModal);
  document.getElementById("demo-limit-modal-newchat")?.addEventListener("click", () => {
    hideDemoLimitModal();
    createNewSession();
  });
  document.getElementById("demo-limit-modal-settings")?.addEventListener("click", () => {
    hideDemoLimitModal();
    switchTab("admin");
  });
}



// Main App Bootstrap
export async function initApp() {
  initTheme();
  initSound();
  initByokSettings();
  initPersonaAndExport();

  // Tab navigation listeners
  document.querySelectorAll(".tab-btn, .mobile-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  const mobileSidebarToggle = document.getElementById("mobile-sidebar-toggle");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");
  const sidebarCloseBtn = document.getElementById("sidebar-close-btn");
  const sessionSidebar = document.getElementById("session-sidebar");

  mobileSidebarToggle?.addEventListener("click", () => toggleMobileSidebar());
  sidebarBackdrop?.addEventListener("click", () => toggleMobileSidebar(true));
  sidebarCloseBtn?.addEventListener("click", () => toggleMobileSidebar(true));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sessionSidebar?.classList.contains("sidebar-open")) {
      toggleMobileSidebar(true);
    }
  });

  const sidebarAdminBtn = document.getElementById("sidebar-admin-btn");
  sidebarAdminBtn?.addEventListener("click", () => {
    switchTab("admin");
    if (window.innerWidth <= 992 || sessionSidebar?.classList.contains("sidebar-open")) {
      toggleMobileSidebar(true);
    }
  });

  const btnAdminBackChat = document.getElementById("btn-admin-back-chat");
  btnAdminBackChat?.addEventListener("click", () => {
    switchTab("chat");
  });

  const btnGotoDocUpload = document.getElementById("btn-goto-doc-upload");
  btnGotoDocUpload?.addEventListener("click", () => {
    switchTab("documents");
    if (window.innerWidth <= 992) toggleMobileSidebar(true);
    const fileInputEl = document.getElementById("file-input");
    if (fileInputEl) fileInputEl.click();
  });

  initChat();
  initDocuments();
  initAgent();
  initMcp();
  initMultimodal();
  initAdmin();

  // Load initial remote metadata
  try {
    await loadProviderInfo();
  } catch (_) {}

  try {
    await loadSessions();
  } catch (_) {}

  try {
    await loadDocuments();
  } catch (_) {}

  try {
    await refreshMcpCount();
    await loadMcpServices();
  } catch (_) {}

  try {
    await loadTenantInfo();
    await loadLastEval();
  } catch (_) {}

  applyResponsivePlaceholders();
  window.addEventListener("resize", applyResponsivePlaceholders);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
