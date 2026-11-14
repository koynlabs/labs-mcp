import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mcpHarnessLinks } from "./mcp-harness";

const SERVER = "https://labs.koyn.trade/mcp";

describe("mcp harness links", () => {
  it("opens Cursor, Claude, and VS Code with the server filled in", () => {
    const links = mcpHarnessLinks({ name: "Labs", url: SERVER });
    const cursor = links.find((link) => link.id === "cursor");
    const claude = links.find((link) => link.id === "claude");
    const vscode = links.find((link) => link.id === "vscode");
    assert.ok(cursor?.href && claude?.href && vscode?.href);

    const cursorUrl = new URL(cursor.href);
    assert.equal(cursorUrl.searchParams.get("name"), "Labs");
    assert.deepEqual(
      JSON.parse(Buffer.from(cursorUrl.searchParams.get("config") || "", "base64").toString("utf8")),
      { url: SERVER },
    );

    const claudeUrl = new URL(claude.href);
    assert.equal(`${claudeUrl.origin}${claudeUrl.pathname}`, "https://claude.ai/customize/connectors");
    assert.equal(claudeUrl.hash, "");
    assert.equal(claudeUrl.searchParams.get("connectorUrl"), SERVER);

    const vscodeUrl = new URL(vscode.href);
    assert.deepEqual(JSON.parse(vscodeUrl.searchParams.get("config") || ""), {
      type: "http",
      url: SERVER,
    });
  });

  it("copies ChatGPT, Grok, and Grok Bot instead of pretending to install them", () => {
    const links = mcpHarnessLinks({ name: "Labs", url: SERVER });
    assert.equal(links.find((link) => link.id === "chatgpt")?.href, "https://chatgpt.com/plugins");
    assert.equal(links.find((link) => link.id === "grok")?.href, "https://grok.com/connectors");
    assert.equal(links.find((link) => link.id === "grok-bot")?.href, null);
    assert.equal(
      links.find((link) => link.id === "grok-bot")?.copyText,
      `Add this MCP server named Labs at ${SERVER}`,
    );
  });
});
