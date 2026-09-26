import { getStatus } from "@/lib/status";

/**
 * Machine-readable deploy status, read by the README badges. Never cached: the
 * point of it is to say which commit is answering right now.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(getStatus(), {
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
