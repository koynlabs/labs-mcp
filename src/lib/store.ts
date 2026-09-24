import { Redis } from "@upstash/redis";
import type { LaunchBundle, MakerSession } from "./types";

/**
 * Launch bundles and maker sessions outlive a single request, so they cannot
 * live in module memory on Vercel. Redis is used when configured; the in-memory
 * fallback exists so `next dev` works without a database.
 */
type Row = LaunchBundle | MakerSession;

const memory = new Map<string, { value: unknown; expiresAt: number }>();

/**
 * Built per call rather than memoised at module scope, because a workflow step
 * resumes in a fresh invocation and must not reuse a client captured earlier.
 */
function client(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function put(row: Row, ttlSeconds: number): Promise<void> {
  const key = `${row.kind}:${row.id}`;
  const db = client();
  if (db) {
    await db.set(key, JSON.stringify(row), { ex: ttlSeconds });
    return;
  }
  memory.set(key, { value: row, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function read<T extends Row>(
  kind: Row["kind"],
  id: string,
): Promise<T | null> {
  const key = `${kind}:${id}`;
  const db = client();
  if (db) {
    const raw = await db.get<string>(key);
    if (!raw) return null;
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as T;
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
  return client() !== null;
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
  const db = client();
  if (db) {
    await db.set(`metadata:${id}`, JSON.stringify(value));
    return;
  }
  memory.set(`metadata:${id}`, {
    value,
    expiresAt: Number.MAX_SAFE_INTEGER,
  });
}

export async function getMetadata(
  id: string,
): Promise<Record<string, unknown> | null> {
  const db = client();
  if (db) {
    const raw = await db.get<string>(`metadata:${id}`);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  }
  const hit = memory.get(`metadata:${id}`);
  return (hit?.value as Record<string, unknown>) ?? null;
}
