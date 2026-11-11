/**
 * AskRaggy Enterprise Platform - State & Configuration Module
 */

export const THEME_STORAGE_KEY = "askraggy_theme";
export const BYOK_STORAGE_KEY = "askraggy_byok_key";
export const SOUND_STORAGE_KEY = "askraggy_sound";
export const VISITOR_SESSIONS_STORAGE_KEY = "askraggy_my_sessions";

export const DEMO_MAX_MESSAGES_PER_SESSION = 15;

export const DEMO_PERSONAS = {
  employee: {
    role: "employee",
    name: "Rahul Sharma",
    code: "EMP-2041",
    department: "Engineering",
    avatar: "\u{1F464}",
    label: "Employee",
  },
  manager: {
    role: "manager",
    name: "Sarah Chen",
    code: "MGR-1082",
    department: "Engineering Leadership",
    avatar: "\u{1F454}",
    label: "Manager",
  },
};

export const state = {
  currentSessionId: null,
  currentPersona: DEMO_PERSONAS.employee,
  activeTenantId: "",
  activeByokKey: sessionStorage.getItem(BYOK_STORAGE_KEY) || localStorage.getItem(BYOK_STORAGE_KEY) || "",
  currentDomainName: "Enterprise HR & Operations",
  activeDocumentId: null,
  currentDocsCache: [],
  activeChatAbortController: null,
  activeDocAbortController: null,
  activeAgentAbortController: null,
  activeMultiStepAbortController: null,
  metricsRefreshInterval: null,
  soundNotificationsEnabled: localStorage.getItem(SOUND_STORAGE_KEY) !== "false",
  currentDemoCredits: DEMO_MAX_MESSAGES_PER_SESSION,
  activeTab: "chat",
};
