import { NextResponse } from "next/server";
import { clientAddress, allow } from "@/lib/rate-limit";
import { xConfigFromEnv } from "@/lib/x/config";
import { beginConnect } from "@/lib/x/oauth";
import { xStore } from "@/lib/x/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The URL the owner opens. Sends them to X to authorize one account. */
export async function GET(request: Request) {
  const config = xConfigFromEnv();
  if (!config) {
    return NextResponse.redirect(new URL("/x?error=config", request.url));
  }
  if (!(await allow(`x-oauth:${clientAddress(request)}`, 20, 600))) {
    return new Response("Too many sign-in attempts. Wait a few minutes.", { status: 429 });
  }
  const started = await beginConnect(xStore, config);
  return NextResponse.redirect(started.url);
}
