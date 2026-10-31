import { cachedCryptoPosts } from "@/lib/x/trends";

/**
 * The homepage tape. The CDN caches a successful body for an hour. A cache
 * miss still goes through the shared Redis gate, so it does not become a
 * paid X search per visitor. Not force-dynamic: that opts the response out
 * of CDN caching. GET route handlers are dynamic by default and are not
 * prerendered, so a build does not run the search.
 */
export async function GET() {
  const tape = await cachedCryptoPosts();
  return Response.json({ posts: tape.posts }, { headers: { "Cache-Control": tape.cacheControl } });
}
