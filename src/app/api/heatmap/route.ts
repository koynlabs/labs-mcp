import { DESK_ORIGIN, deskRequestHeaders } from "@/config/token";

export async function GET() {
  const res = await fetch(`${DESK_ORIGIN}/api/heatmap`, {
    headers: deskRequestHeaders(),
    next: { revalidate: 30 },
  });
  if (!res.ok) {
    return Response.json({ error: "heatmap upstream failed" }, { status: 502 });
  }
  return Response.json(await res.json());
}
