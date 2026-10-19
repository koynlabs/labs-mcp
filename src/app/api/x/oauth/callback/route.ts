import { NextResponse } from "next/server";
import { xConfigFromEnv } from "@/lib/x/config";
import { X_OWNER_COOKIE } from "@/lib/x/constants";
import { finishConnect } from "@/lib/x/oauth";
import { xStore } from "@/lib/x/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function redirectTo(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function GET(request: Request) {
  const config = xConfigFromEnv();
  if (!config) return redirectTo(request, "/x?error=config");

  const query = new URL(request.url).searchParams;
  const result = await finishConnect(
    xStore,
    config,
    {
      code: query.get("code"),
      state: query.get("state"),
      error: query.get("error"),
    },
    fetch,
  );

  if (result.type === "error") {
    const path = new URL("/x", request.url);
    path.searchParams.set("error", result.code);
    return NextResponse.redirect(path);
  }

  const response = redirectTo(request, "/x?connected=1");
  response.cookies.set(X_OWNER_COOKIE, result.cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 180 * 24 * 60 * 60,
  });
  return response;
}
