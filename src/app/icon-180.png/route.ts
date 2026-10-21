import { readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";

/** Stable PNG URL for MCP clients that fetch serverInfo.icons. */
export function GET() {
  const body = readFileSync(join(process.cwd(), "src/app/apple-icon.png"));
  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
