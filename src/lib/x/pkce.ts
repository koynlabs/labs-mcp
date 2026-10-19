import { createHash, randomBytes } from "node:crypto";

/** 32 bytes, base64url, which is 43 characters from the PKCE unreserved set. */
export function createVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function createState(): string {
  return randomBytes(32).toString("base64url");
}

/** S256 challenge: base64url(SHA-256(verifier)), no padding. */
export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
