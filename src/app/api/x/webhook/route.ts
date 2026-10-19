import { NextResponse } from "next/server";
import { readAccount } from "@/lib/x/oauth";
import { xStore } from "@/lib/x/store";
import { consumerSecretFromEnv, handleCrc, receiveWebhook } from "@/lib/x/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Account Activity CRC. HMAC-SHA256 of crc_token with X_CONSUMER_SECRET. */
export async function GET(request: Request) {
  const crcToken = new URL(request.url).searchParams.get("crc_token");
  const result = handleCrc(crcToken, consumerSecretFromEnv());
  return NextResponse.json(result.body, { status: result.status });
}

/** Stores mention and reply events. Does not reply. */
export async function POST(request: Request) {
  const raw = await request.text();
  const account = await readAccount(xStore).catch(() => null);
  const result = await receiveWebhook({
    store: xStore,
    rawBody: raw,
    signature: request.headers.get("x-twitter-webhooks-signature"),
    consumerSecret: consumerSecretFromEnv(),
    connectedUserId: account?.userId ?? null,
  });
  return NextResponse.json(result.body, { status: result.status });
}
