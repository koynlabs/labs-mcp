import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Account Activity signs CRC checks and event bodies with the app's API Key
 * Secret (consumer secret). That is `X_CONSUMER_SECRET`. It is separate from
 * the OAuth 2.0 client secret and from a bearer token.
 *
 * This module does not read Redis or the connected account. GET /api/x/webhook
 * imports only this file so a missing store cannot fail the CRC check.
 */
export function consumerSecretFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.X_CONSUMER_SECRET?.trim();
  return value ? value : null;
}

/** `sha256=` + base64(HMAC-SHA256(consumerSecret, crc_token)). */
export function crcResponseToken(consumerSecret: string, crcToken: string): string {
  const digest = createHmac("sha256", consumerSecret).update(crcToken, "utf8").digest("base64");
  return `sha256=${digest}`;
}

/** Same construction over the raw request body, not a re-serialized object. */
export function signWebhookBody(consumerSecret: string, rawBody: string): string {
  const digest = createHmac("sha256", consumerSecret).update(rawBody, "utf8").digest("base64");
  return `sha256=${digest}`;
}

export function webhookSignaturesMatch(expected: string, header: string | null): boolean {
  if (header == null) return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(header.trim()).digest();
  return timingSafeEqual(a, b);
}

export function handleCrc(
  crcToken: string | null,
  consumerSecret: string | null,
): { status: number; body: { response_token: string } | { ok: false; error: string } } {
  if (!consumerSecret) {
    return { status: 503, body: { ok: false, error: "X_CONSUMER_SECRET is not set." } };
  }
  if (!crcToken || crcToken.length > 512) {
    return { status: 400, body: { ok: false, error: "crc_token is required." } };
  }
  return { status: 200, body: { response_token: crcResponseToken(consumerSecret, crcToken) } };
}
