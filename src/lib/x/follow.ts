import { XError, type XConfig } from "./config";
import { DEFAULT_FOLLOW_DAILY_CAP, DEFAULT_UNFOLLOW_DAILY_CAP, X_API, X_FOLLOW_SCOPE } from "./constants";
import { ensureAccessToken, readAccount, type XFetch } from "./oauth";
import { KEYS, type XStore } from "./store";
import { utcDay } from "./webhook";

export const FOLLOW_SCOPE_MESSAGE =
  "This X account is connected without follows.write, so it cannot follow or unfollow accounts. Call x_connect_link and open that URL to authorize again. The new personal key is shown once on /x. Posting, mentions, and likes keep working until that reconnect.";

export type FollowCaps = { followDaily: number; unfollowDaily: number };

export type FollowAction = "follow" | "unfollow";

export type FollowDeps = {
  store: XStore;
  config: XConfig;
  http: XFetch;
  userId: string;
  now?: number;
  caps?: FollowCaps;
};

export type FollowTarget = { kind: "id"; id: string } | { kind: "username"; username: string };

export type FollowResult = {
  following: boolean;
  pendingFollow: boolean;
  id: string;
  /** @handle when the caller passed a username or profile URL. Null for a raw id, which is not looked up. */
  username: string | null;
  account: string;
  action: FollowAction;
};

const USER_ID = /^[0-9]{1,20}$/;
const USERNAME = /^[A-Za-z0-9_]{1,15}$/;
const PROFILE_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);

/** First path segments that are X site routes, not profile handles. */
const RESERVED_PATHS = new Set([
  "about",
  "compose",
  "explore",
  "hashtag",
  "home",
  "i",
  "intent",
  "jobs",
  "login",
  "messages",
  "notifications",
  "privacy",
  "search",
  "settings",
  "share",
  "signup",
  "tos",
]);

const USER_REF_ERROR =
  "user must be an @username, a numeric user id, or an https://x.com or https://twitter.com profile URL. One user per call.";

export function followCapsFromEnv(env: NodeJS.ProcessEnv = process.env): FollowCaps {
  return {
    followDaily: readCap(env.X_FOLLOW_DAILY_CAP, DEFAULT_FOLLOW_DAILY_CAP),
    unfollowDaily: readCap(env.X_UNFOLLOW_DAILY_CAP, DEFAULT_UNFOLLOW_DAILY_CAP),
  };
}

function readCap(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 10_000) return fallback;
  return value;
}

export function accountCanFollow(account: { scope?: string | null }): boolean {
  if (!account.scope) return false;
  return account.scope.split(/[\s,]+/).filter(Boolean).includes(X_FOLLOW_SCOPE);
}

/**
 * Accepts a user id, @username, or a profile URL. A profile URL is parsed
 * locally. Nothing is fetched here.
 */
export function parseFollowTarget(input: string): FollowTarget {
  const trimmed = input.trim();
  if (USER_ID.test(trimmed)) return { kind: "id", id: trimmed };
  const handle = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  if (USERNAME.test(handle)) return { kind: "username", username: handle };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new XError(USER_REF_ERROR);
  }
  return targetFromUrl(url);
}

function targetFromUrl(url: URL): FollowTarget {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:" || url.username || url.password || !PROFILE_HOSTS.has(host)) {
    throw new XError(USER_REF_ERROR);
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 3 && parts[0] === "i" && parts[1] === "user" && USER_ID.test(parts[2])) {
    return { kind: "id", id: parts[2] };
  }
  const segment = (parts.length === 1 ? parts[0] : "").replace(/^@/, "");
  if (parts.length === 1 && USERNAME.test(segment) && !RESERVED_PATHS.has(segment.toLowerCase())) {
    return { kind: "username", username: segment };
  }
  throw new XError(USER_REF_ERROR);
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

function detailFrom(raw: string): string {
  try {
    const body = JSON.parse(raw) as {
      detail?: string;
      title?: string;
      error_description?: string;
      errors?: { message?: string; detail?: string }[];
    };
    const nested = body.errors?.find((item) => item.message || item.detail);
    return body.detail || body.error_description || nested?.message || nested?.detail || body.title || "";
  } catch {
    return "";
  }
}

/** Status is always in the message so a 402 billing refusal is not just "X refused". */
function refusedMessage(raw: string, status: number, what: string): string {
  const detail = detailFrom(raw);
  if (detail) return `X refused the ${what} (${status}): ${detail.slice(0, 300)}`;
  return `X refused the ${what} (${status}).`;
}

async function readX(res: Response, what: string): Promise<string> {
  const raw = await res.text();
  if (!res.ok) {
    if (scopeFailure(raw, res.status)) throw new XError(FOLLOW_SCOPE_MESSAGE);
    throw new XError(refusedMessage(raw, res.status, what));
  }
  return raw;
}

/**
 * One users.read lookup. No user.fields and no expansions: the default
 * payload is id, name, and username, which is all a follow needs.
 */
async function lookupUsername(http: XFetch, accessToken: string, username: string): Promise<{ id: string; username: string }> {
  const res = await http(`${X_API}/2/users/by/username/${encodeURIComponent(username)}`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  const raw = await readX(res, "user lookup");
  let id = "";
  let handle = "";
  try {
    const data = (JSON.parse(raw) as { data?: { id?: unknown; username?: unknown } }).data;
    if (typeof data?.id === "string") id = data.id;
    if (typeof data?.username === "string") handle = data.username;
  } catch {
    id = "";
  }
  if (!USER_ID.test(id) || !USERNAME.test(handle)) {
    throw new XError("X did not return that account.");
  }
  return { id, username: handle };
}

async function callX(
  http: XFetch,
  accessToken: string,
  userId: string,
  targetId: string,
  action: FollowAction,
): Promise<{ following: boolean; pendingFollow: boolean }> {
  const url =
    action === "follow"
      ? `${X_API}/2/users/${encodeURIComponent(userId)}/following`
      : `${X_API}/2/users/${encodeURIComponent(userId)}/following/${encodeURIComponent(targetId)}`;
  const res = await http(url, {
    method: action === "follow" ? "POST" : "DELETE",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(action === "follow" ? { "content-type": "application/json" } : {}),
    },
    body: action === "follow" ? JSON.stringify({ target_user_id: targetId }) : undefined,
  });
  const raw = await readX(res, action);
  let following: unknown;
  let pending: unknown;
  try {
    const data = (JSON.parse(raw) as { data?: { following?: unknown; pending_follow?: unknown } }).data;
    following = data?.following;
    pending = data?.pending_follow;
  } catch {
    following = undefined;
  }
  if (typeof following !== "boolean") {
    throw new XError(action === "follow" ? "X did not confirm the follow." : "X did not confirm the unfollow.");
  }
  return { following, pendingFollow: pending === true };
}

function dayKey(action: FollowAction, userId: string, day: string): string {
  return action === "follow" ? KEYS.followDay(userId, day) : KEYS.unfollowDay(userId, day);
}

export async function setFollow(deps: FollowDeps, user: string, action: FollowAction): Promise<FollowResult> {
  const account = await readAccount(deps.store, deps.userId);
  if (!account) throw new XError("X is not connected. Open /x, connect your X account, and use the personal key.");
  if (!accountCanFollow(account)) throw new XError(FOLLOW_SCOPE_MESSAGE);

  const target = parseFollowTarget(user);
  if (target.kind === "id" && target.id === account.userId) {
    throw new XError(`This account cannot ${action} itself.`);
  }
  if (target.kind === "username" && target.username.toLowerCase() === account.username.toLowerCase()) {
    throw new XError(`This account cannot ${action} itself.`);
  }

  const now = deps.now ?? Date.now();
  const caps = deps.caps ?? followCapsFromEnv();
  const cap = action === "follow" ? caps.followDaily : caps.unfollowDaily;
  const capEnv = action === "follow" ? "X_FOLLOW_DAILY_CAP" : "X_UNFOLLOW_DAILY_CAP";
  if (cap <= 0) throw new XError(`${action === "follow" ? "Follows" : "Unfollows"} are off. ${capEnv} is 0.`);
  const day = utcDay(now);
  const used = await counter(deps.store, dayKey(action, account.userId, day));
  if (used >= cap) {
    throw new XError(`The daily ${action} cap of ${cap} is reached. Nothing was changed.`);
  }

  const fresh = await ensureAccessToken(deps.store, deps.config, deps.http, account.userId, now);
  if (!accountCanFollow(fresh.account)) throw new XError(FOLLOW_SCOPE_MESSAGE);

  let targetId = target.kind === "id" ? target.id : "";
  let username: string | null = null;
  if (target.kind === "username") {
    const found = await lookupUsername(deps.http, fresh.accessToken, target.username);
    if (found.id === fresh.account.userId) throw new XError(`This account cannot ${action} itself.`);
    targetId = found.id;
    username = `@${found.username}`;
  }

  const result = await callX(deps.http, fresh.accessToken, fresh.account.userId, targetId, action);
  const count = await deps.store.incr(dayKey(action, fresh.account.userId, day));
  if (count === 1) await deps.store.expire(dayKey(action, fresh.account.userId, day), secondsUntilDayEnd(now));
  return {
    ...result,
    id: targetId,
    username,
    account: `@${fresh.account.username}`,
    action,
  };
}
