import { NextResponse } from "next/server";
import { consumerSecretFromEnv, handleCrc } from "@/lib/x/crc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Account Activity CRC. HMAC-SHA256 of crc_token with X_CONSUMER_SECRET.
 * No session, no Redis, no connected account. A missing secret is 503, not 404.
 */
export async function GET(request: Request) {
  const crcToken = new URL(request.url).searchParams.get("crc_token");
  const result = handleCrc(crcToken, consumerSecretFromEnv());
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "cache-control": "no-store" },
  });
}

/** Stores mention and reply events for the connected user in for_user_id. Does not reply. */
export async function POST(request: Request) {
  const [{ xStore }, { receiveWebhook }] = await Promise.all([
    import("@/lib/x/store"),
    import("@/lib/x/webhook"),
  ]);
  const raw = await request.text();
  const result = await receiveWebhook({
    store: xStore,
    rawBody: raw,
    signature: request.headers.get("x-twitter-webhooks-signature"),
    consumerSecret: consumerSecretFromEnv(),
  });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "cache-control": "no-store" },
  });
}
