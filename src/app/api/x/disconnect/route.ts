import { NextResponse } from "next/server";
import { xConfigFromEnv } from "@/lib/x/config";
import { X_OWNER_COOKIE } from "@/lib/x/constants";
import { disconnectAccount } from "@/lib/x/oauth";
import { xStore } from "@/lib/x/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ownerCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === X_OWNER_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function POST(request: Request) {
  const config = xConfigFromEnv();
  if (!config) return NextResponse.redirect(new URL("/x?error=config", request.url));

  const result = await disconnectAccount(xStore, config, ownerCookie(request), fetch);
  const path = new URL("/x", request.url);
  if (result.type === "none") {
    return NextResponse.redirect(path);
  }
  if (result.type === "forbidden") path.searchParams.set("error", "disconnect");
  else if (!result.revoked) {
    path.searchParams.set("disconnected", "1");
    path.searchParams.set("error", "revoke");
  } else path.searchParams.set("disconnected", "1");

  const response = NextResponse.redirect(path);
  if (result.type === "ok") {
    response.cookies.set(X_OWNER_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}
