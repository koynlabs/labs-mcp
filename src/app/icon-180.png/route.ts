import { labsMarkResponse } from "@/lib/mark-icon";

export const runtime = "nodejs";

/** Stable PNG URL for MCP clients that fetch serverInfo.icons. */
export function GET() {
  const response = labsMarkResponse();
  response.headers.set("Cache-Control", "public, max-age=86400");
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
}
