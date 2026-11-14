export type McpHarnessId = "cursor" | "claude" | "vscode" | "chatgpt" | "grok" | "grok-bot";

export type McpHarnessAction = "install" | "copy-open" | "copy";

export type McpHarnessLink = {
  id: McpHarnessId;
  name: string;
  action: McpHarnessAction;
  href: string | null;
  copyText: string | null;
  detail: string;
};

/** A click never installs by itself. Each app asks for confirmation, or the URL is pasted. */
export const MCP_HARNESS_NOTE =
  "Nothing is added until you confirm in the app, or paste what was copied.";

export function mcpHarnessLinks(input: { name: string; url: string }): McpHarnessLink[] {
  const name = input.name.trim();
  const url = input.url.trim();
  if (!name || !url) {
    throw new Error("MCP harness links need a name and URL.");
  }

  const cursorConfig = utf8Base64(JSON.stringify({ url }));
  const vscodeConfig = JSON.stringify({ type: "http", url });

  return [
    {
      id: "cursor",
      name: "Cursor",
      action: "install",
      href: `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(name)}&config=${encodeURIComponent(cursorConfig)}`,
      copyText: null,
      detail: "Opens Cursor. You confirm before it is added.",
    },
    {
      id: "claude",
      name: "Claude",
      action: "install",
      href: `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(name)}&connectorUrl=${encodeURIComponent(url)}`,
      copyText: null,
      detail: "Opens Claude with the name and URL filled in. You confirm before it is added.",
    },
    {
      id: "vscode",
      name: "VS Code",
      action: "install",
      href: `https://vscode.dev/redirect/mcp/install?name=${encodeURIComponent(name)}&config=${encodeURIComponent(vscodeConfig)}`,
      copyText: null,
      detail: "Opens the VS Code install prompt. You confirm before it is added.",
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      action: "copy-open",
      href: "https://chatgpt.com/plugins",
      copyText: url,
      detail: "Copies the URL and opens ChatGPT Plugins. Paste it when ChatGPT asks.",
    },
    {
      id: "grok",
      name: "Grok",
      action: "copy-open",
      href: "https://grok.com/connectors",
      copyText: url,
      detail: "Copies the URL and opens Grok connectors. Paste it as a custom connector.",
    },
    {
      id: "grok-bot",
      name: "Grok Bot",
      action: "copy",
      href: null,
      copyText: `Add this MCP server named ${name} at ${url}`,
      detail: "Copies a prompt. Paste it into Grok Bot. There is no install link.",
    },
  ];
}

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(value, "utf8").toString("base64");
}
