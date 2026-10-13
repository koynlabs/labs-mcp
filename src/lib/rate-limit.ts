import { withRedis } from "./redis";

/** First forwarded address, used only as a rate-limit bucket. */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim() ?? "";
  if (/^[0-9a-fA-F:.]+$/.test(first) && first.length <= 64) return first;
  return "unknown";
}

const memory = ((globalThis as typeof globalThis & {
  __labsRate?: Map<string, { count: number; resetAt: number }>;
}).__labsRate ??= new Map());

/**
 * Building a launch costs the server a metadata upload and an RPC round trip,
 * so it is limited per creator wallet.
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
