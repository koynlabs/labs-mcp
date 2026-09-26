import { createMcpHandler } from "mcp-handler";
import { FEE_SOL } from "@/lib/config";
import { registerTools } from "@/lib/mcp/tools";
import { APP_VERSION } from "@/lib/revision";
import { HOLD_WAIVES_FEE } from "@/lib/site";

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
    serverInfo: { name: "labs", version: APP_VERSION },
    instructions: [
      "labs launches tokens on pump.fun and StonkFun and runs disclosed",
      "two-sided quoters. Every transaction is signed by the user's own wallet",
      "in a browser; this server never holds a wallet key. Each launch and each",
      `maker session costs ${FEE_SOL} SOL, paid inside the same bundle.`,
      ...(HOLD_WAIVES_FEE
        ? [
            `There is no fee at all when the paying wallet already holds ${FEE_SOL} SOL`,
            "worth of $LEVERCOIN. labs reads that balance and drops the fee",
            "transaction. The $LEVERCOIN is never transferred or spent, and the",
            "wallet has to still hold it when the launch is submitted.",
          ]
        : []),
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

/**
 * GET and DELETE are the 2025-era session operations, and a stateless server
 * has no session to stream from or tear down, so the protocol answers both
 * with 405. Answering them here rather than through the handler keeps the
 * `Allow` header on the refusal and out of the automatic OPTIONS reply, so the
 * one method this endpoint really serves is the only one it advertises.
 */
const ALLOW = "OPTIONS, POST";

function methodNotAllowed() {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    },
    { status: 405, headers: { allow: ALLOW } },
  );
}

function allowedMethods() {
  return new Response(null, { status: 204, headers: { allow: ALLOW } });
}

export const maxDuration = 60;

export {
  handler as POST,
  methodNotAllowed as GET,
  methodNotAllowed as DELETE,
  allowedMethods as OPTIONS,
};
