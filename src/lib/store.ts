import { redisConfigured, withRedis } from "./redis";
import type { LaunchBundle, MakerSession } from "./types";

/**
 * Launch bundles and maker sessions outlive a single request, so they cannot
 * live in module memory on Vercel. Redis is used when configured; the in-memory
 * fallback exists so `next dev` works without a database.
 */
type Row = LaunchBundle | MakerSession;

const memory = new Map<string, { value: unknown; expiresAt: number }>();

/**
 * A fresh client per call. A workflow step resumes in a new invocation and
 * must not reuse a connection captured earlier.
 */
export async function put(row: Row, ttlSeconds: number): Promise<void> {
  const key = `${row.kind}:${row.id}`;
  const stored = await withRedis((db) =>
    db.set(key, JSON.stringify(row), ttlSeconds),
  );
  if (stored === "missing") {
    memory.set(key, { value: row, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

async function read<T extends Row>(
  kind: Row["kind"],
  id: string,
): Promise<T | null> {
  const key = `${kind}:${id}`;
  const raw = await withRedis((db) => db.get(key));
  if (raw !== "missing") {
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value as T;
}

export function getBundle(id: string) {
  return read<LaunchBundle>("launch", id);
}

export function getSession(id: string) {
  return read<MakerSession>("maker", id);
}

export function isPersistent(): boolean {
  return redisConfigured();
}

/**
 * Launch metadata, stored without a TTL: the URI is written into the token on
 * chain, so it has to keep resolving long after the bundle is forgotten. This
 * is the fallback path — pin to IPFS instead if the launch should outlive labs.
 */
export async function putMetadata(
  id: string,
  value: Record<string, unknown>,
): Promise<void> {
  const stored = await withRedis((db) =>
    db.set(`metadata:${id}`, JSON.stringify(value)),
  );
  if (stored !== "missing") return;
  memory.set(`metadata:${id}`, {
    value,
    expiresAt: Number.MAX_SAFE_INTEGER,
  });
}

export async function getMetadata(
  id: string,
): Promise<Record<string, unknown> | null> {
  const raw = await withRedis((db) => db.get(`metadata:${id}`));
  if (raw !== "missing") {
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  }
  const hit = memory.get(`metadata:${id}`);
  return (hit?.value as Record<string, unknown>) ?? null;
}
