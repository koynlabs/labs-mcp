import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "../config";

/**
 * The bearer on the current MCP HTTP request. Tool handlers read it from here
 * so the key is never a tool argument and never written to a log line.
 */
const authorizationHeader = new AsyncLocalStorage<string | null>();

export function withMcpAuthorization<T>(authorization: string | null, fn: () => T): T {
  return authorizationHeader.run(authorization, fn);
}

export function currentAuthorization(): string | null {
  return authorizationHeader.getStore() ?? null;
}

/** 256 bits, shown once. The prefix only makes the key recognizable. */
export function newPersonalKey(): string {
  return `lxk_${randomBytes(32).toString("base64url")}`;
}

export function personalKeyHash(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

const DUMMY_HASH = personalKeyHash("labs-x-personal-key-dummy");

export function xKeyMessage(): string {
  return `Visit ${SITE_URL}/x, connect your X account, and send the personal key shown once there as Authorization: Bearer <key> on the HTTP request. Do not put the key in a tool argument.`;
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer[ \t]+(\S+)\s*$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1] ?? null;
  if (!token || token.length > 200) return null;
  return token;
}

/** SHA-256 both values, then compare the digests. A length mismatch cannot skip the compare. */
export function hashesEqual(left: string, right: string): boolean {
  const a = /^[0-9a-f]{64}$/i.test(left) ? Buffer.from(left, "hex") : Buffer.alloc(32);
  const b = /^[0-9a-f]{64}$/i.test(right) ? Buffer.from(right, "hex") : Buffer.alloc(32);
  const equal = timingSafeEqual(a, b);
  return equal && /^[0-9a-f]{64}$/i.test(left) && /^[0-9a-f]{64}$/i.test(right);
}

/** Runs the same compare a miss would, so a lookup failure still touches a digest. */
export function rejectUnknownKey(presentedHash: string): void {
  hashesEqual(presentedHash, DUMMY_HASH);
}
