import { Redis as Upstash } from "@upstash/redis";

/**
 * Vercel Redis hands out a protocol URL (`REDIS_URL`). Upstash hands out an
 * HTTPS URL plus a token. Either one is enough; the protocol URL wins when
 * both are present, because that is what the Vercel Redis integration sets.
 */
type Kv = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
};

function protocolUrl(): string | null {
  for (const value of [
    process.env.REDIS_URL,
    process.env.KV_URL,
    process.env.KV_REST_API_URL,
    process.env.UPSTASH_REDIS_REST_URL,
  ]) {
    if (value && /^rediss?:\/\//i.test(value)) return value;
  }
  return null;
}

function rest(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url?.startsWith("https://") && token) return { url, token };
  return null;
}

export function redisConfigured(): boolean {
  return protocolUrl() !== null || rest() !== null;
}

function scrub(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(message.replace(/rediss?:\/\/\S+/gi, "redis://…"));
}

export async function withRedis<T>(
  fn: (kv: Kv) => Promise<T>,
): Promise<T | "missing"> {
  const wire = protocolUrl();
  if (wire) {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(wire, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      lazyConnect: true,
      enableReadyCheck: false,
    });
    try {
      await client.connect();
      return await fn({
        get: (key) => client.get(key),
        set: async (key, value, ttlSeconds) => {
          if (ttlSeconds) await client.set(key, value, "EX", ttlSeconds);
          else await client.set(key, value);
        },
        incr: (key) => client.incr(key),
        expire: async (key, seconds) => {
          await client.expire(key, seconds);
        },
      });
    } catch (error) {
      throw scrub(error);
    } finally {
      client.disconnect();
    }
  }

  const http = rest();
  if (!http) return "missing";
  const client = new Upstash({ url: http.url, token: http.token });
  try {
    return await fn({
      get: async (key) => {
        const raw = await client.get<string>(key);
        if (raw == null) return null;
        return typeof raw === "string" ? raw : JSON.stringify(raw);
      },
      set: async (key, value, ttlSeconds) => {
        if (ttlSeconds) await client.set(key, value, { ex: ttlSeconds });
        else await client.set(key, value);
      },
      incr: (key) => client.incr(key),
      expire: async (key, seconds) => {
        await client.expire(key, seconds);
      },
    });
  } catch (error) {
    throw scrub(error);
  }
}
