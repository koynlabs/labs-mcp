import { XError, type XConfig } from "./config";
import { DEFAULT_LIKE_DAILY_CAP, X_API, X_LIKE_SCOPE } from "./constants";
import { ensureAccessToken, readAccount, type XFetch } from "./oauth";
import { KEYS, type XStore } from "./store";
import { utcDay } from "./webhook";

export const LIKE_SCOPE_MESSAGE =
  "This X account is connected without like.write, so it cannot like or unlike posts. Call x_connect_link and open that URL to authorize again. The new personal key is shown once on /x. Posting and mentions keep working until that reconnect.";

export type LikeCaps = { daily: number };

export type LikeAction = "like" | "unlike";

export type LikeDeps = {
  store: XStore;
  config: XConfig;
  http: XFetch;
  userId: string;
  now?: number;
  caps?: LikeCaps;
};

export type LikeResult = {
  liked: boolean;
  id: string;
  account: string;
  action: LikeAction;
};

const POST_ID = /^[0-9]{1,20}$/;
const STATUS_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);

const POST_REF_ERROR = "post must be a numeric post id or an https://x.com or https://twitter.com status URL.";

export function likeCapsFromEnv(env: NodeJS.ProcessEnv = process.env): LikeCaps {
  return { daily: readCap(env.X_LIKE_DAILY_CAP, DEFAULT_LIKE_DAILY_CAP) };
}

function readCap(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 10_000) return fallback;
  return value;
}

export function accountCanLike(account: { scope?: string | null }): boolean {
  if (!account.scope) return false;
  return account.scope.split(/[\s,]+/).filter(Boolean).includes(X_LIKE_SCOPE);
}

/** Accepts a post id, or an https status URL. Does not fetch the URL. */
export function parsePostId(input: string): string {
  const trimmed = input.trim();
  if (POST_ID.test(trimmed)) return trimmed;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new XError(POST_REF_ERROR);
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:" || url.username || url.password || !STATUS_HOSTS.has(host)) {
    throw new XError(POST_REF_ERROR);
  }
  const match = url.pathname.match(/\/status(?:es)?\/([0-9]{1,20})(?=\/|$)/);
  if (!match) throw new XError("That URL has no /status/<id>. Pass the post id or a status URL.");
  return match[1];
}

function secondsUntilDayEnd(now: number): number {
  const date = new Date(now);
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return Math.max(60, Math.ceil((end - now) / 1000) + 3600);
}

async function counter(store: XStore, key: string): Promise<number> {
  const raw = await store.get(key);
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function scopeFailure(raw: string, status: number): boolean {
  if (status !== 401 && status !== 403) return false;
  return /scope/i.test(raw);
}

function refusedMessage(raw: string, status: number, action: LikeAction): string {
  let detail = "";
  try {
    const body = JSON.parse(raw) as {
      detail?: string;
      title?: string;
      error_description?: string;
      errors?: { message?: string }[];
    };
    detail =
      body.detail ||
      body.error_description ||
      body.errors?.find((item) => item.message)?.message ||
      body.title ||
      "";
  } catch {
    detail = "";
  }
  const verb = action === "like" ? "like" : "unlike";
  if (detail) return `X refused the ${verb} (${status}): ${detail.slice(0, 300)}`;
  return `X refused the ${verb} (${status}).`;
}

async function callX(
  http: XFetch,
  accessToken: string,
  userId: string,
  tweetId: string,
  action: LikeAction,
): Promise<boolean> {
  const url =
    action === "like"
      ? `${X_API}/2/users/${encodeURIComponent(userId)}/likes`
      : `${X_API}/2/users/${encodeURIComponent(userId)}/likes/${encodeURIComponent(tweetId)}`;
  const res = await http(url, {
    method: action === "like" ? "POST" : "DELETE",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(action === "like" ? { "content-type": "application/json" } : {}),
    },
    body: action === "like" ? JSON.stringify({ tweet_id: tweetId }) : undefined,
  });
  const raw = await res.text();
  if (!res.ok) {
    if (scopeFailure(raw, res.status)) throw new XError(LIKE_SCOPE_MESSAGE);
    throw new XError(refusedMessage(raw, res.status, action));
  }
  let liked: unknown;
  try {
    liked = (JSON.parse(raw) as { data?: { liked?: unknown } }).data?.liked;
  } catch {
    liked = undefined;
  }
  if (typeof liked !== "boolean") {
    throw new XError(action === "like" ? "X did not confirm the like." : "X did not confirm the unlike.");
  }
  return liked;
}

export async function setPostLike(deps: LikeDeps, post: string, action: LikeAction): Promise<LikeResult> {
  const account = await readAccount(deps.store, deps.userId);
  if (!account) throw new XError("X is not connected. Open /x, connect your X account, and use the personal key.");
  if (!accountCanLike(account)) throw new XError(LIKE_SCOPE_MESSAGE);

  const tweetId = parsePostId(post);
  const now = deps.now ?? Date.now();
  const caps = deps.caps ?? likeCapsFromEnv();
  if (caps.daily <= 0) throw new XError("Likes are off. X_LIKE_DAILY_CAP is 0.");
  const day = utcDay(now);
  const used = await counter(deps.store, KEYS.likeDay(account.userId, day));
  if (used >= caps.daily) {
    throw new XError(`The daily like cap of ${caps.daily} is reached. Nothing was changed.`);
  }

  const fresh = await ensureAccessToken(deps.store, deps.config, deps.http, account.userId, now);
  if (!accountCanLike(fresh.account)) throw new XError(LIKE_SCOPE_MESSAGE);
  const liked = await callX(deps.http, fresh.accessToken, fresh.account.userId, tweetId, action);
  const count = await deps.store.incr(KEYS.likeDay(fresh.account.userId, day));
  if (count === 1) await deps.store.expire(KEYS.likeDay(fresh.account.userId, day), secondsUntilDayEnd(now));
  return {
    liked,
    id: tweetId,
    account: `@${fresh.account.username}`,
    action,
  };
}
