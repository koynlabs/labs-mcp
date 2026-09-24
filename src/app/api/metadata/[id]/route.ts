import { getMetadata } from "@/lib/store";

/**
 * Serves a launch's metadata JSON when it was not pinned to IPFS. Wallets and
 * explorers fetch this, so it is cached hard and must keep resolving for as
 * long as the token exists.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const metadata = await getMetadata(id);
  if (!metadata) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json(metadata, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
