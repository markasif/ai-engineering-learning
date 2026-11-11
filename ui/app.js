/**
 * AskRaggy - Entry point compatibility bridge.
 * The codebase has been modularized into industry-standard ES modules under `ui/js/`.
 * This file re-exports `ui/js/main.js` for backwards compatibility with any cached references.
 */
import "./js/main.js";
export * from "./js/main.js";
