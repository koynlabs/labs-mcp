import { withRedis } from "./redis";

const memory = new Map<string, { count: number; resetAt: number }>();

/**
 * Unpaid tool calls still cost the server a metadata upload and an RPC round
 * trip, so building a launch is limited per creator wallet. Payment is the
 * fee instruction; this only stops someone spinning up bundles for free.
 */
export async function allow(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const count = await withRedis(async (redis) => {
    const next = await redis.incr(`rl:${key}`);
    if (next === 1) await redis.expire(`rl:${key}`, windowSeconds);
    return next;
  });
  if (count !== "missing") return count <= limit;

  const now = Date.now();
  const hit = memory.get(key);
  if (!hit || hit.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  hit.count += 1;
  return hit.count <= limit;
}
