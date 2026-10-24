import { DESK_ORIGIN, deskRequestHeaders } from "@/config/token";

export async function POST(request: Request) {
  let body = "{}";
  try {
    body = await request.text();
  } catch {
    body = "{}";
  }
  const res = await fetch(`${DESK_ORIGIN}/api/ask`, {
    method: "POST",
    headers: deskRequestHeaders({ "Content-Type": "application/json" }),
    body,
    cache: "no-store",
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
