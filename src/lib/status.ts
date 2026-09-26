import { FEE_SOL, LEVER_MINT, MAKER_ENABLED, SITE_URL } from "./config";
import { APP_VERSION, GITHUB_COMMIT_URL, GIT_SHA, GIT_SHA_SHORT } from "./revision";
import { isPersistent } from "./store";

/**
 * The tools /mcp registers. Declared here rather than imported from
 * `mcp/tools.ts` so that reading status never loads the launch code, and with
 * it the Raydium SDK: /api/status stays a small function next to a large one.
 * `registerTools` is the source of truth; this list mirrors it.
 */
export const TOOL_NAMES = [
  "launch_token",
  "launch_status",
  "token_info",
  "wallet_balance",
  "stonks_pairs",
  "start_maker",
  "maker_status",
  "stop_maker",
] as const;

export type Status = {
  ok: boolean;
  version: string;
  sha: string;
  shaShort: string;
  commitUrl: string;
  mcpUrl: string;
  tools: number;
  toolNames: string[];
  /** Launch bundles and maker sessions survive a redeploy only with Redis. */
  store: "redis" | "memory";
  maker: "enabled" | "disabled";
  feeSol: number;
  feeWaiver: "levercoin" | "none";
};

/**
 * Everything here is read from this process: the commit it was built from and
 * the environment it booted with. Nothing calls /mcp over HTTP — that would
 * pay a cold start on the heaviest route in the app on every status hit, and
 * a deployment answering /api/status is by definition serving /mcp too.
 */
export function getStatus(): Status {
  const store = isPersistent() ? "redis" : "memory";
  return {
    ok: true,
    version: APP_VERSION,
    sha: GIT_SHA,
    shaShort: GIT_SHA_SHORT,
    commitUrl: GITHUB_COMMIT_URL,
    mcpUrl: `${SITE_URL}/mcp`,
    tools: TOOL_NAMES.length,
    toolNames: [...TOOL_NAMES],
    store,
    maker: MAKER_ENABLED ? "enabled" : "disabled",
    feeSol: FEE_SOL,
    feeWaiver: LEVER_MINT ? "levercoin" : "none",
  };
}
