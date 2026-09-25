import { Redis } from "@upstash/redis";

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
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const redis = new Redis({ url, token });
    const count = await redis.incr(`rl:${key}`);
    if (count === 1) await redis.expire(`rl:${key}`, windowSeconds);
    return count <= limit;
  }

  const now = Date.now();
  const hit = memory.get(key);
  if (!hit || hit.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  hit.count += 1;
  return hit.count <= limit;
}
