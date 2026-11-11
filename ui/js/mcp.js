/**
 * AskRaggy Enterprise Platform - Model Context Protocol (MCP) Module
 */
import { escapeHtml } from "./utils.js";
import { API_BASE } from "./api.js";

export async function refreshMcpCount() {
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
export async function loadMcpServices() {
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
export function buildMcpServerCard(server, tools) {
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



export function initMcp() {
  const refreshBtn = document.getElementById("mcp-refresh-btn");
  refreshBtn?.addEventListener("click", () => {
    refreshMcpCount();
    loadMcpServices();
  });
}
