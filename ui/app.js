/**
 * AskRaggy Enterprise Platform - Modular Entry Point
 *
 * NOTE: This monolithic script (formerly 5,550 lines) has been fully decomposed
 * into industry-standard ES6+ modules inside the `ui/js/` directory:
 *
 *   ├── ui/js/state.js       (Centralized reactive state store, personas & quotas)
 *   ├── ui/js/utils.js       (Markdown renderer, Web Audio chimes, toasts & modals)
 *   ├── ui/js/api.js         (Centralized fetch client, BYOK headers, session isolation)
 *   ├── ui/js/chat.js        (Streaming chat, session CRUD, inline message editor)
 *   ├── ui/js/documents.js   (Document ingestion, chunk visualizer, grounded Q&A)
 *   ├── ui/js/agent.js       (ReAct tool-calling agent & multi-step execution engine)
 *   ├── ui/js/mcp.js         (Model Context Protocol services & live tool discovery)
 *   ├── ui/js/multimodal.js  (Voice mic recording, ElevenLabs TTS & Vision upload)
 *   ├── ui/js/admin.js       (Dynamic tenant manager, telemetry & eval benchmark)
 *   └── ui/js/main.js        (Application bootstrap, theme/sound toggle, tab routing)
 *
 * The browser loads `ui/js/main.js` directly via <script type="module">.
 */

import "./js/main.js";
export * from "./js/main.js";
