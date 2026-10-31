import { withRedis } from "../redis";

export interface XStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<void>;
}

type MemoryRow = { value: string; expiresAt: number };

const memory = ((globalThis as typeof globalThis & {
  __labsX?: Map<string, MemoryRow>;
}).__labsX ??= new Map());

export function createMemoryXStore(clock: () => number = Date.now): XStore {
  const rows = new Map<string, MemoryRow>();
  const store: XStore = {
    async get(key) {
      const row = rows.get(key);
      if (!row) return null;
      if (row.expiresAt <= clock()) {
        rows.delete(key);
        return null;
      }
      return row.value;
    },
    async set(key, value, ttlSeconds) {
      rows.set(key, {
        value,
        expiresAt: ttlSeconds ? clock() + ttlSeconds * 1000 : Number.MAX_SAFE_INTEGER,
      });
    },
    async setNx(key, value, ttlSeconds) {
      // No await between the check and the write. Redis SET NX is atomic;
      // this keeps two in-flight callers from both winning in memory.
      const row = rows.get(key);
      if (row && row.expiresAt > clock()) return false;
      rows.set(key, {
        value,
        expiresAt: ttlSeconds ? clock() + ttlSeconds * 1000 : Number.MAX_SAFE_INTEGER,
      });
      return true;
    },
    async del(key) {
      rows.delete(key);
    },
    async incr(key) {
      const row = rows.get(key);
      const alive = row !== undefined && row.expiresAt > clock();
      const current = alive ? Number(row.value) : 0;
      const next = Number.isFinite(current) ? current + 1 : 1;
      rows.set(key, {
        value: String(next),
        expiresAt: alive && row ? row.expiresAt : Number.MAX_SAFE_INTEGER,
      });
      return next;
    },
    async expire(key, ttlSeconds) {
      const row = rows.get(key);
      if (!row || row.expiresAt <= clock()) {
        rows.delete(key);
        return;
      }
      row.expiresAt = clock() + ttlSeconds * 1000;
    },
  };
  return store;
}

function remember(key: string, value: string, ttlSeconds?: number): void {
  memory.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : Number.MAX_SAFE_INTEGER,
  });
}

function recall(key: string): string | null {
  const row = memory.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return row.value;
}

function memoryIncr(key: string): number {
  const row = memory.get(key);
  const alive = row !== undefined && row.expiresAt > Date.now();
  const current = alive ? Number(row.value) : 0;
  const next = Number.isFinite(current) ? current + 1 : 1;
  memory.set(key, {
    value: String(next),
    expiresAt: alive && row ? row.expiresAt : Number.MAX_SAFE_INTEGER,
  });
  return next;
}

function memoryExpire(key: string, ttlSeconds: number): void {
  const row = memory.get(key);
  if (!row || row.expiresAt <= Date.now()) {
    memory.delete(key);
    return;
  }
  row.expiresAt = Date.now() + ttlSeconds * 1000;
}

/**
 * Redis when the deployment has it. Memory otherwise, so `next dev` and the
 * tests can connect an account without a database. Production should set
 * Redis: an in-memory token disappears on the next cold start.
 */
export const xStore: XStore = {
  async get(key) {
    const raw = await withRedis((db) => db.get(key));
    if (raw !== "missing") return raw;
    return recall(key);
  },
  async set(key, value, ttlSeconds) {
    const stored = await withRedis((db) => db.set(key, value, ttlSeconds));
    if (stored === "missing") remember(key, value, ttlSeconds);
  },
  async setNx(key, value, ttlSeconds) {
    const stored = await withRedis((db) => db.setNx(key, value, ttlSeconds));
    if (stored !== "missing") return stored;
    if (recall(key) !== null) return false;
    remember(key, value, ttlSeconds);
    return true;
  },
  async del(key) {
    const stored = await withRedis((db) => db.del(key));
    memory.delete(key);
    if (stored === "missing") return;
  },
  async incr(key) {
    const stored = await withRedis((db) => db.incr(key));
    if (stored === "missing") return memoryIncr(key);
    return stored;
  },
  async expire(key, ttlSeconds) {
    const stored = await withRedis(async (db) => {
      await db.expire(key, ttlSeconds);
      return true as const;
    });
    if (stored === "missing") memoryExpire(key, ttlSeconds);
  },
};

export const KEYS = {
  /** Pre-multi-user row. Read once, then moved under `user`. It has no personal key. */
  legacyAccount: "x:account",
  user: (userId: string) => `x:user:${userId}`,
  /** sha256 of the personal key → user id. The raw key is never a Redis key. */
  key: (keyHash: string) => `x:key:${keyHash}`,
  owner: (cookieHash: string) => `x:owner:${cookieHash}`,
  /** Sealed one-time copy of a new personal key. Deleted when /x renders it. */
  reveal: (cookieHash: string) => `x:reveal:${cookieHash}`,
  refreshLock: (userId: string) => `x:refresh-lock:${userId}`,
  oauth: (state: string) => `x:oauth:${state}`,
  draft: (userId: string, id: string) => `x:draft:${userId}:${id}`,
  upload: (userId: string, id: string) => `x:upload:${userId}:${id}`,
  blob: (userId: string, id: string) => `x:blob:${userId}:${id}`,
  stage: (userId: string, id: string) => `x:stage:${userId}:${id}`,
  stageChunk: (userId: string, id: string, index: number) => `x:stage:${userId}:${id}:${index}`,
  mention: (userId: string, id: string) => `x:mention:${userId}:${id}`,
  mentionSeen: (userId: string, id: string) => `x:mention-seen:${userId}:${id}`,
  mentionIndex: (userId: string) => `x:mentions:${userId}`,
  mentionLock: (userId: string) => `x:mentions-lock:${userId}`,
  replied: (userId: string, id: string) => `x:replied:${userId}:${id}`,
  replyDay: (userId: string, day: string) => `x:reply-day:${userId}:${day}`,
  likeDay: (userId: string, day: string) => `x:like-day:${userId}:${day}`,
  replyAuthorDay: (userId: string, authorId: string, day: string) => `x:reply-author:${userId}:${authorId}:${day}`,
  mentionsSince: (userId: string) => `x:mentions-since:${userId}`,
};
