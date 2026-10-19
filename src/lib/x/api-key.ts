import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The bearer on the current MCP HTTP request. Tool handlers read it from here
 * so the key is never a tool argument and never written to a log line.
 */
const authorizationHeader = new AsyncLocalStorage<string | null>();

export function withMcpAuthorization<T>(authorization: string | null, fn: () => T): T {
  return authorizationHeader.run(authorization, fn);
}

export function labsXApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.LABS_X_API_KEY?.trim();
  return value ? value : null;
}

export type XApiAuth =
  | { ok: true }
  | { ok: false; reason: "disabled" | "unauthorized" };

export function xApiKeyMessage(reason: "disabled" | "unauthorized"): string {
  if (reason === "disabled") {
    return "X tools are disabled. Set LABS_X_API_KEY on the deployment.";
  }
  return "X tools need Authorization: Bearer <LABS_X_API_KEY> on the HTTP request.";
}

/** Constant-time check of Authorization: Bearer against LABS_X_API_KEY. */
export function xApiAuthorized(authorization?: string | null): XApiAuth {
  const expected = labsXApiKey();
  if (!expected) return { ok: false, reason: "disabled" };
  const header = authorization === undefined ? (authorizationHeader.getStore() ?? null) : authorization;
  const presented = bearerToken(header);
  if (!presented || !sameSecret(presented, expected)) return { ok: false, reason: "unauthorized" };
  return { ok: true };
}

export function xToolGate(): { ok: true } | { ok: false; message: string } {
  const auth = xApiAuthorized();
  if (auth.ok) return { ok: true };
  return { ok: false, message: xApiKeyMessage(auth.reason) };
}

/** 503 when the key is unset, 401 when it is missing or wrong. Null when the caller may proceed. */
export function rejectXHttp(authorization: string | null): Response | null {
  const auth = xApiAuthorized(authorization);
  if (auth.ok) return null;
  return Response.json(
    { error: xApiKeyMessage(auth.reason) },
    {
      status: auth.reason === "disabled" ? 503 : 401,
      headers: { "cache-control": "no-store" },
    },
  );
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer[ \t]+(\S+)\s*$/i.exec(header.trim());
  if (!match) return null;
  return match[1] ?? null;
}

function sameSecret(presented: string, expected: string): boolean {
  const left = createHash("sha256").update(presented).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}
