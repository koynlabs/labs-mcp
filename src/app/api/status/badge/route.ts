import { getStatus } from "@/lib/status";

/**
 * Shields.io endpoint badges for the README. Shields renders a raw
 * `dynamic/json` boolean as "true", so the three README badges are shaped here
 * instead: same values as /api/status, in the schema Shields expects.
 */
export const dynamic = "force-dynamic";

const GREEN = "4ade80";
const GREY = "111111";

export function GET(request: Request) {
  const status = getStatus();
  const field = new URL(request.url).searchParams.get("field") ?? "status";

  const badge =
    field === "version"
      ? { label: "live", message: status.version, color: GREY }
      : field === "deployed"
        ? {
            label: "deployed",
            message: status.shaShort || "local",
            color: GREY,
          }
        : { label: "labs", message: "live", color: GREEN };

  return Response.json(
    { schemaVersion: 1, ...badge, labelColor: "070708" },
    {
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
