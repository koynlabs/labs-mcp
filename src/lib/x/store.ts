import { withRedis } from "../redis";

export interface XStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(key: string): Promise<void>;
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
      const current = await store.get(key);
      if (current !== null) return false;
      await store.set(key, value, ttlSeconds);
      return true;
    },
    async del(key) {
      rows.delete(key);
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
};

export const KEYS = {
  account: "x:account",
  refreshLock: "x:refresh-lock",
  oauth: (state: string) => `x:oauth:${state}`,
  draft: (id: string) => `x:draft:${id}`,
  upload: (id: string) => `x:upload:${id}`,
  blob: (id: string) => `x:blob:${id}`,
  stage: (id: string) => `x:stage:${id}`,
  stageChunk: (id: string, index: number) => `x:stage:${id}:${index}`,
};
