import { redisConfigured } from "../redis";
import { xStore, type XStore } from "./store";
import { xConfigFromEnv } from "./config";
import { X_API, X_TOKEN_URL, xPostUrl } from "./constants";
import { basicAuthorization, type XFetch } from "./oauth";

export type CtPost = {
  id: string;
  text: string;
  url: string;
  username: string;
  name: string;
  avatar: string | null;
  image: string | null;
};

/** App-only bearer. Uses the API key pair, not the OAuth client id. */
const X_APP_TOKEN_URL = "https://api.x.com/oauth2/token";

const QUERY = '(memecoin OR #crypto OR #memecoin OR "pump.fun") lang:en -is:retweet -is:reply';
/**
 * Recent search bills every post it returns ($0.005). Ten is the smallest
 * page the endpoint allows. The tape loops the row, so the strip still fills.
 * Author objects stay: the card is @handle plus avatar, and a post with no
 * username is dropped. From 2026-11-22 those authors are billed at $0.010 each.
 */
const MAX_POSTS = 10;
const EXCERPT = 140;
/** How long a saved search counts as fresh. Visitors must not trigger another. */
export const TAPE_FRESH_MS = 60 * 60 * 1000;
/** Keep the last good row so a cap or a failed call still has something to show. */
const ENVELOPE_TTL_SECONDS = 48 * 60 * 60;
const LOCK_TTL_SECONDS = 45;
export const DEFAULT_TAPE_DAILY_CAP = 24;

/**
 * Browser keeps a copy for 10 minutes. The CDN keeps one for an hour, then
 * may serve that copy for a day while it revalidates. Revalidation still has
 * to pass the shared cache below before anyone pays for a search.
 */
export const TAPE_CACHE_CONTROL =
  "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";

/** A lock miss must not replace the CDN entry with an empty body. */
export const TAPE_UNCACHED_CONTROL = "private, no-store";

export const TAPE_KEYS = {
  posts: "x:tape:posts",
  lock: "x:tape:lock",
  calls: (day: string) => `x:tape:calls:${day}`,
  halt: (day: string) => `x:tape:halt:${day}`,
} as const;

type SearchUser = {
  id?: string;
  username?: string;
  name?: string;
  profile_image_url?: string;
};

type SearchMedia = {
  media_key?: string;
  url?: string;
  preview_image_url?: string;
};

type SearchTweet = {
  id?: string;
  text?: string;
  author_id?: string;
  attachments?: { media_keys?: string[] };
};

type SearchBody = {
  data?: SearchTweet[];
  includes?: { users?: SearchUser[]; media?: SearchMedia[] };
};

type TapeEnvelope = {
  posts: CtPost[];
  fetchedAt: number;
};

type TokenSlot = {
  current: { value: string; expiresAt: number } | null;
};

const sharedToken: TokenSlot = { current: null };

export type TapeSearch =
  | { ok: true; posts: CtPost[] }
  | { ok: false; status: number };

export type TapeLoad = {
  posts: CtPost[];
  cacheControl: string;
};

export type TapeOptions = {
  fetchImpl?: XFetch;
  now?: number;
  store?: XStore;
  env?: Record<string, string | undefined>;
  /**
   * False on Vercel when Redis is missing. A per-instance memory cache must
   * not spend credits. Tests pass true with their own store.
   */
  sharedStore?: boolean;
  tokenSlot?: TokenSlot;
};

/** Drop trailing links and keep one line a card can show. */
export function excerpt(text: string, max = EXCERPT): string {
  const clean = text
    .replace(/https?:\/\/t\.co\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function xImage(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "pbs.twimg.com" && url.hostname !== "video.twimg.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function avatar(value: string | undefined): string | null {
  const url = xImage(value);
  if (!url) return null;
  return url.replace("_normal.", "_bigger.");
}

function isCtPost(value: unknown): value is CtPost {
  if (!value || typeof value !== "object") return false;
  const post = value as Record<string, unknown>;
  return (
    typeof post.id === "string" &&
    typeof post.text === "string" &&
    typeof post.url === "string" &&
    typeof post.username === "string" &&
    typeof post.name === "string" &&
    (post.avatar === null || typeof post.avatar === "string") &&
    (post.image === null || typeof post.image === "string")
  );
}

export function postsFromSearch(body: SearchBody): CtPost[] {
  const users = new Map<string, SearchUser>();
  for (const user of body.includes?.users ?? []) {
    if (user.id) users.set(user.id, user);
  }
  const media = new Map<string, SearchMedia>();
  for (const item of body.includes?.media ?? []) {
    if (item.media_key) media.set(item.media_key, item);
  }
  const posts: CtPost[] = [];
  for (const tweet of body.data ?? []) {
    const user = tweet.author_id ? users.get(tweet.author_id) : undefined;
    const text = excerpt(tweet.text ?? "");
    if (!tweet.id || !user?.username || !text) continue;
    const key = tweet.attachments?.media_keys?.[0];
    const shot = key ? media.get(key) : undefined;
    posts.push({
      id: tweet.id,
      text,
      url: xPostUrl(user.username, tweet.id),
      username: user.username,
      name: user.name?.trim() || user.username,
      avatar: avatar(user.profile_image_url),
      image: xImage(shot?.url) ?? xImage(shot?.preview_image_url),
    });
    if (posts.length >= MAX_POSTS) break;
  }
  return posts;
}

export async function fetchCryptoPosts(fetchImpl: XFetch, token: string): Promise<TapeSearch> {
  const params = new URLSearchParams({
    query: QUERY,
    max_results: String(MAX_POSTS),
    "tweet.fields": "created_at,text,attachments,author_id",
    expansions: "author_id,attachments.media_keys",
    "user.fields": "username,name,profile_image_url",
    "media.fields": "url,preview_image_url,type",
  });
  const res = await fetchImpl(`${X_API}/2/tweets/search/recent?${params}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error("x trends search", res.status);
    return { ok: false, status: res.status };
  }
  const body = (await res.json()) as SearchBody;
  return { ok: true, posts: postsFromSearch(body) };
}

/** API key plus API secret, or the OAuth client pair when that is all that is set. */
export function tapeLogin(
  env: Record<string, string | undefined> = process.env,
): { id: string; secret: string; tokenUrl: string } | null {
  const key = env.X_CONSUMER_KEY?.trim();
  const consumerSecret = env.X_CONSUMER_SECRET?.trim();
  if (key && consumerSecret) {
    return { id: key, secret: consumerSecret, tokenUrl: X_APP_TOKEN_URL };
  }
  const config = xConfigFromEnv(env as NodeJS.ProcessEnv);
  if (!config) return null;
  return { id: config.clientId, secret: config.clientSecret, tokenUrl: X_TOKEN_URL };
}

const TAPE_OFF = new Set(["0", "false", "off", "no"]);

/** Default on. `0`, `false`, `off`, and `no` skip the paid search. */
export function tapeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.X_TAPE_ENABLED?.trim().toLowerCase();
  if (!raw) return true;
  return !TAPE_OFF.has(raw);
}

/** Paid recent-search calls per UTC day. Invalid values fall back to the default. `0` skips the call. */
export function tapeDailyCap(env: Record<string, string | undefined> = process.env): number {
  const raw = env.X_TAPE_DAILY_CAP;
  if (raw == null || raw.trim() === "") return DEFAULT_TAPE_DAILY_CAP;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 10_000) return DEFAULT_TAPE_DAILY_CAP;
  return value;
}

export function tapeUtcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Redis is shared across instances. On Vercel, memory is not: a cold start
 * per instance is how the strip burned credits. Local dev may use memory.
 */
export function tapeMaySearch(env: Record<string, string | undefined>, redisReady: boolean): boolean {
  return redisReady || env.VERCEL !== "1";
}

function secondsUntilUtcDayEnd(now: number): number {
  const date = new Date(now);
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return Math.max(60, Math.ceil((end - now) / 1000) + 3600);
}

function callsUsed(raw: string | null): number {
  if (raw == null || raw.trim() === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  return value;
}

function cached(posts: CtPost[]): TapeLoad {
  return { posts, cacheControl: TAPE_CACHE_CONTROL };
}

function uncached(posts: CtPost[]): TapeLoad {
  return { posts, cacheControl: TAPE_UNCACHED_CONTROL };
}

async function readEnvelope(store: XStore): Promise<TapeEnvelope | null> {
  const raw = await store.get(TAPE_KEYS.posts);
  if (!raw) return null;
  try {
    const body = JSON.parse(raw) as Partial<TapeEnvelope>;
    if (!Array.isArray(body.posts) || typeof body.fetchedAt !== "number") return null;
    return { posts: body.posts.filter(isCtPost), fetchedAt: body.fetchedAt };
  } catch {
    return null;
  }
}

async function writeEnvelope(store: XStore, envelope: TapeEnvelope): Promise<void> {
  await store.set(TAPE_KEYS.posts, JSON.stringify(envelope), ENVELOPE_TTL_SECONDS);
}

async function overBudget(store: XStore, day: string, cap: number): Promise<boolean> {
  if (await store.get(TAPE_KEYS.halt(day))) return true;
  return callsUsed(await store.get(TAPE_KEYS.calls(day))) >= cap;
}

async function bearer(
  fetchImpl: XFetch,
  login: { id: string; secret: string; tokenUrl: string },
  now: number,
  slot: TokenSlot,
): Promise<string | null> {
  const cachedToken = slot.current;
  if (cachedToken && cachedToken.expiresAt > now + 30_000) return cachedToken.value;
  try {
    const res = await fetchImpl(login.tokenUrl, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: basicAuthorization(login.id, login.secret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      console.error("x trends token", res.status);
      return null;
    }
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) return null;
    const ttl = Math.max(60, body.expires_in ?? 7200) * 1000;
    slot.current = { value: body.access_token, expiresAt: now + ttl };
    return body.access_token;
  } catch {
    return null;
  }
}

async function rememberFailure(store: XStore, posts: CtPost[], now: number, status?: number): Promise<void> {
  if (status === 402) {
    await store.set(TAPE_KEYS.halt(tapeUtcDay(now)), "1", secondsUntilUtcDayEnd(now));
  }
  await writeEnvelope(store, { posts, fetchedAt: now });
}

/**
 * One shared search. A fresh Redis row, a daily cap, or a failed call all
 * return the last posts and do not call X. The lock is so two instances
 * cannot refresh the same stale row together.
 */
export async function cachedCryptoPosts(options: TapeOptions = {}): Promise<TapeLoad> {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();
  const store = options.store ?? xStore;
  const fetchImpl = options.fetchImpl ?? fetch;
  const shared = options.sharedStore ?? tapeMaySearch(env, redisConfigured());
  const tokenSlot = options.tokenSlot ?? sharedToken;

  if (!tapeEnabled(env)) return cached([]);

  let envelope: TapeEnvelope | null = null;
  try {
    envelope = await readEnvelope(store);
  } catch {
    return uncached([]);
  }
  if (envelope && now - envelope.fetchedAt < TAPE_FRESH_MS) return cached(envelope.posts);

  const last = envelope?.posts ?? [];
  const cap = tapeDailyCap(env);
  if (!shared || cap <= 0 || !tapeLogin(env)) return cached(last);

  const day = tapeUtcDay(now);
  try {
    if (await overBudget(store, day, cap)) return cached(last);
  } catch {
    return uncached(last);
  }

  let locked = false;
  try {
    locked = await store.setNx(TAPE_KEYS.lock, "1", LOCK_TTL_SECONDS);
  } catch {
    return uncached(last);
  }
  if (!locked) return uncached(last);

  try {
    const again = await readEnvelope(store);
    const posts = again?.posts ?? last;
    if (again && now - again.fetchedAt < TAPE_FRESH_MS) return cached(again.posts);
    if (await overBudget(store, day, cap)) return cached(posts);

    const login = tapeLogin(env);
    if (!login) return cached(posts);

    const token = await bearer(fetchImpl, login, now, tokenSlot);
    if (!token) {
      await writeEnvelope(store, { posts, fetchedAt: now });
      return cached(posts);
    }

    const count = await store.incr(TAPE_KEYS.calls(day));
    if (count === 1) await store.expire(TAPE_KEYS.calls(day), secondsUntilUtcDayEnd(now));
    if (count > cap) return cached(posts);

    let result: TapeSearch;
    try {
      result = await fetchCryptoPosts(fetchImpl, token);
    } catch {
      await rememberFailure(store, posts, now);
      return cached(posts);
    }
    if (!result.ok) {
      await rememberFailure(store, posts, now, result.status);
      return cached(posts);
    }
    const next = result.posts.length > 0 ? result.posts : posts;
    await writeEnvelope(store, { posts: next, fetchedAt: now });
    return cached(next);
  } catch {
    return uncached(last);
  } finally {
    if (locked) {
      try {
        await store.del(TAPE_KEYS.lock);
      } catch {
        /* The lock expires on its own. */
      }
    }
  }
}
