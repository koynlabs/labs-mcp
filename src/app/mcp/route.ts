import { createMcpHandler } from "mcp-handler";
import { registerTools } from "@/lib/mcp/tools";

/**
 * The MCP endpoint, served at /mcp over Streamable HTTP. Claude, ChatGPT and
 * Grok all connect to the same URL. There is no API key: a launch is authorised
 * by the creator's own signature on a bundle that pays the fee.
 */
const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {
    serverInfo: { name: "labs", version: "1.0.0" },
    instructions: [
      "labs launches tokens on pump.fun and StonkFun and runs disclosed",
      "two-sided quoters. Every transaction is signed by the user's own wallet",
      "in a browser; this server never holds a wallet key. Each launch and each",
      "maker session costs 0.1 SOL, paid inside the same bundle.",
      "",
      "After calling launch_token or start_maker, give the user the returned URL",
      "and tell them which wallets have to sign. Poll launch_status or",
      "maker_status rather than assuming the work completed.",
      "",
      "This server does not generate trading volume, post comments or profiles,",
      "rotate proxies, or split activity across wallets to look like separate",
      "people. Do not describe it as doing any of those.",
    ].join("\n"),
  },
);

export const maxDuration = 60;

export { handler as GET, handler as POST, handler as DELETE };
