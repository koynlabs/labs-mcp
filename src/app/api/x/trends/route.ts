import { cachedCryptoPosts } from "@/lib/x/trends";

/** The homepage tape reads this. The handler itself caches the X search. */
export const dynamic = "force-dynamic";

export async function GET() {
  const posts = await cachedCryptoPosts();
  return Response.json(
    { posts },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
