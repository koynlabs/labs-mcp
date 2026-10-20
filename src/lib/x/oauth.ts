import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  bearerToken,
  currentAuthorization,
  hashesEqual,
  newPersonalKey,
  personalKeyHash,
  rejectUnknownKey,
  xKeyMessage,
} from "./api-key";
import { XError, type XConfig } from "./config";
import {
  KEY_REVEAL_TTL_SECONDS,
  OAUTH_TTL_SECONDS,
  X_API,
  X_AUTHORIZE_URL,
  X_REQUIRED_SCOPES,
  X_REVOKE_URL,
  X_SCOPES,
  X_TOKEN_URL,
} from "./constants";
import { codeChallenge, createState, createVerifier } from "./pkce";
import { openSecret, sealSecret } from "./seal";
import { KEYS, type XStore } from "./store";

export type XFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type TokenBundle = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
};

export type StoredXAccount = {
  userId: string;
  username: string;
  name: string;
  scope: string;
  sealed: string;
  /** sha256 hex of the personal key. Null on a migrated connection until that account connects again. */
  keyHash?: string | null;
  ownerCookieHash: string;
  connectedAt: number;
};

export type OAuthStateRecord = {
  verifier: string;
  createdAt: number;
};

type TokenResponse = {
  token_type?: string;
  expires_in?: number;
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export function hashOwnerCookie(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newOwnerCookie(): string {
  return randomBytes(32).toString("base64url");
}

export function basicAuthorization(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export function authorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  verifier: string;
}): string {
  const url = new URL(X_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", X_SCOPES.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", codeChallenge(input.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

const USER_ID = /^[0-9]{1,20}$/;

function isSha256(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function parseAccount(raw: string): StoredXAccount | null {
  try {
    const parsed = JSON.parse(raw) as StoredXAccount;
    if (!parsed.userId || !USER_ID.test(parsed.userId) || !parsed.username || !parsed.sealed) return null;
    return { ...parsed, keyHash: parsed.keyHash ?? null };
  } catch {
    throw new XError("The stored X connection is unreadable.");
  }
}

async function readLegacy(store: XStore): Promise<StoredXAccount | null> {
  const raw = await store.get(KEYS.legacyAccount);
  if (!raw) return null;
  return parseAccount(raw);
}

/**
 * The single-account row from before personal keys. Moved under the user id
 * with no key. The next Connect X for that account issues the key.
 */
async function migrateLegacy(store: XStore, userId: string): Promise<StoredXAccount | null> {
  const legacy = await readLegacy(store);
  if (!legacy || legacy.userId !== userId) return null;
  const moved: StoredXAccount = { ...legacy, keyHash: null };
  await store.set(KEYS.user(userId), JSON.stringify(moved));
  if (isSha256(moved.ownerCookieHash)) await store.set(KEYS.owner(moved.ownerCookieHash), userId);
  await store.del(KEYS.legacyAccount);
  return moved;
}

export async function readAccount(store: XStore, userId: string): Promise<StoredXAccount | null> {
  if (!USER_ID.test(userId)) return null;
  const raw = await store.get(KEYS.user(userId));
  if (raw) return parseAccount(raw);
  return migrateLegacy(store, userId);
}

export async function readAccountByCookie(store: XStore, cookie: string | null): Promise<StoredXAccount | null> {
  if (!cookie) return null;
  const hash = hashOwnerCookie(cookie);
  const indexed = await store.get(KEYS.owner(hash));
  if (indexed && USER_ID.test(indexed)) {
    const account = await readAccount(store, indexed);
    if (account && cookieCanManage(account, cookie)) return account;
  }
  const legacy = await readLegacy(store);
  if (!legacy || !cookieCanManage(legacy, cookie)) return null;
  return readAccount(store, legacy.userId);
}

export async function writeAccount(store: XStore, account: StoredXAccount): Promise<void> {
  if (!USER_ID.test(account.userId)) throw new XError("The X account id is not usable.");
  const stored: StoredXAccount = { ...account, keyHash: account.keyHash ?? null };
  await store.set(KEYS.user(stored.userId), JSON.stringify(stored));
  if (isSha256(stored.keyHash)) await store.set(KEYS.key(stored.keyHash), stored.userId);
  if (isSha256(stored.ownerCookieHash)) await store.set(KEYS.owner(stored.ownerCookieHash), stored.userId);
}

export async function resolveXAccount(store: XStore, authorization?: string | null): Promise<StoredXAccount | null> {
  const header = authorization === undefined ? currentAuthorization() : authorization;
  const presented = bearerToken(header);
  if (!presented) return null;
  const digest = personalKeyHash(presented);
  const userId = await store.get(KEYS.key(digest));
  if (!userId || !USER_ID.test(userId)) {
    rejectUnknownKey(digest);
    return null;
  }
  const account = await readAccount(store, userId);
  if (!account?.keyHash || !hashesEqual(digest, account.keyHash)) {
    rejectUnknownKey(digest);
    return null;
  }
  return account;
}

export async function authorizeXRequest(
  store: XStore,
  authorization?: string | null,
): Promise<{ ok: true; account: StoredXAccount } | { ok: false; response: Response }> {
  const account = await resolveXAccount(store, authorization);
  if (account) return { ok: true, account };
  return {
    ok: false,
    response: Response.json(
      { error: xKeyMessage() },
      { status: 401, headers: { "cache-control": "no-store" } },
    ),
  };
}

export async function consumePersonalKey(store: XStore, secret: string, cookie: string | null): Promise<string | null> {
  if (!cookie) return null;
  const hash = hashOwnerCookie(cookie);
  const sealed = await store.get(KEYS.reveal(hash));
  if (!sealed) return null;
  await store.del(KEYS.reveal(hash));
  try {
    const key = openSecret(sealed, secret);
    if (!/^lxk_[A-Za-z0-9_-]{40,}$/.test(key)) return null;
    return key;
  } catch {
    return null;
  }
}

export function unsealTokens(account: StoredXAccount, secret: string): TokenBundle {
  try {
    return JSON.parse(openSecret(account.sealed, secret)) as TokenBundle;
  } catch {
    throw new XError(
      "The stored X token could not be opened. The encryption key changed, or the row is damaged. Connect X again.",
    );
  }
}

function sealTokens(bundle: TokenBundle, secret: string): string {
  return sealSecret(JSON.stringify(bundle), secret);
}

export function connectionStatus(account: StoredXAccount | null, configured: boolean) {
  return {
    configured,
    connected: Boolean(account),
    username: account ? `@${account.username}` : null,
    userId: account?.userId ?? null,
    name: account?.name ?? null,
    scope: account?.scope ?? null,
  };
}

export function cookieCanManage(account: StoredXAccount | null, cookie: string | null): boolean {
  if (!account || !cookie) return false;
  const actual = hashOwnerCookie(cookie);
  const expected = account.ownerCookieHash;
  if (!/^[0-9a-f]{64}$/i.test(actual) || !/^[0-9a-f]{64}$/i.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

async function xJson(res: Response): Promise<unknown> {
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (res.status >= 400) throw new XError(xErrorMessage(parsed, res.status));
  return parsed ?? {};
}

function xErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as {
      error_description?: string;
      detail?: string;
      title?: string;
      errors?: { message?: string }[];
    };
    const message =
      record.error_description || record.detail || record.errors?.find((item) => item.message)?.message || record.title;
    if (message) return `X refused the request (${status}): ${message.slice(0, 300)}`;
  }
  return `X refused the request (${status}).`;
}

async function postForm(http: XFetch, url: string, config: XConfig, fields: Record<string, string>): Promise<unknown> {
  const body = new URLSearchParams(fields);
  const res = await http(url, {
    method: "POST",
    headers: {
      authorization: basicAuthorization(config.clientId, config.clientSecret),
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });
  return xJson(res);
}

export async function exchangeCode(
  http: XFetch,
  config: XConfig,
  code: string,
  verifier: string,
  now = Date.now(),
): Promise<TokenBundle> {
  const parsed = (await postForm(http, X_TOKEN_URL, config, {
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
    client_id: config.clientId,
  })) as TokenResponse;
  const bundle = bundleFromResponse(parsed, now);
  try {
    assertScopes(bundle.scope);
  } catch (error) {
    await revokeQuietly(http, config, bundle.refreshToken);
    throw error;
  }
  return bundle;
}

export async function refreshGrant(
  http: XFetch,
  config: XConfig,
  refreshToken: string,
  previousScope: string,
  now = Date.now(),
): Promise<TokenBundle> {
  const parsed = (await postForm(http, X_TOKEN_URL, config, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
  })) as TokenResponse;
  const next = parseToken(parsed, now);
  // Rotation invalidates the refresh token we just sent. Keep the previous
  // one only when X did not issue a replacement.
  const scope = next.scope || previousScope;
  // A refresh echoes the scopes originally granted. Requiring like.write here
  // would reject every token connected before that scope was requested, and
  // posting would stop. New connects still require it in exchangeCode.
  if (next.scope) assertScopes(next.scope, X_REQUIRED_SCOPES);
  return {
    accessToken: next.accessToken,
    refreshToken: next.refreshToken ?? refreshToken,
    expiresAt: next.expiresAt,
    scope,
  };
}

function parseToken(
  parsed: TokenResponse,
  now: number,
): { accessToken: string; refreshToken: string | null; expiresAt: number; scope: string } {
  if (!parsed.access_token || !parsed.expires_in) {
    throw new XError(parsed.error_description || "X did not return an access token.");
  }
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    expiresAt: now + parsed.expires_in * 1000,
    scope: parsed.scope ?? "",
  };
}

function bundleFromResponse(parsed: TokenResponse, now: number): TokenBundle {
  const next = parseToken(parsed, now);
  if (!next.refreshToken) {
    throw new XError(
      "X did not return a refresh token. The app needs the offline.access scope, and the user has to grant it.",
    );
  }
  return {
    accessToken: next.accessToken,
    refreshToken: next.refreshToken,
    expiresAt: next.expiresAt,
    scope: next.scope,
  };
}

export function assertScopes(scope: string, required: readonly string[] = X_SCOPES): void {
  const granted = new Set(scope.split(/[\s,]+/).filter(Boolean));
  const missing = required.filter((name) => !granted.has(name));
  if (missing.length > 0) {
    throw new XError(`X did not grant ${missing.join(" ")}. Add those scopes on the app and connect again.`);
  }
}

export async function revokeToken(http: XFetch, config: XConfig, token: string, hint: "refresh_token" | "access_token"): Promise<void> {
  await postForm(http, X_REVOKE_URL, config, { token, token_type_hint: hint });
}

async function revokeQuietly(http: XFetch, config: XConfig, token: string): Promise<boolean> {
  try {
    await revokeToken(http, config, token, "refresh_token");
    return true;
  } catch {
    return false;
  }
}

type XUser = { id: string; username: string; name: string };

async function fetchMe(http: XFetch, accessToken: string): Promise<XUser> {
  const res = await http(`${X_API}/2/users/me?user.fields=id,name,username`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  const body = (await xJson(res)) as { data?: { id?: string; username?: string; name?: string } };
  const user = body.data;
  if (!user?.id || !user.username || !/^[A-Za-z0-9_]{1,15}$/.test(user.username)) {
    throw new XError("X did not return the authorized account.");
  }
  return { id: user.id, username: user.username, name: user.name ?? user.username };
}

export async function beginConnect(store: XStore, config: XConfig, now = Date.now()): Promise<{ url: string; state: string }> {
  const state = createState();
  const verifier = createVerifier();
  const record: OAuthStateRecord = { verifier, createdAt: now };
  await store.set(KEYS.oauth(state), JSON.stringify(record), OAUTH_TTL_SECONDS);
  return {
    state,
    url: authorizationUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
      verifier,
    }),
  };
}

export async function consumeOAuthState(
  store: XStore,
  state: string,
  now = Date.now(),
): Promise<OAuthStateRecord | null> {
  if (!state || state.length > 200) return null;
  const key = KEYS.oauth(state);
  const raw = await store.get(key);
  if (!raw) return null;
  await store.del(key);
  try {
    const record = JSON.parse(raw) as OAuthStateRecord;
    if (!record.verifier || now - record.createdAt > OAUTH_TTL_SECONDS * 1000) return null;
    return record;
  } catch {
    return null;
  }
}

export type FinishResult =
  | { type: "connected"; username: string; cookie: string; key: string }
  | { type: "error"; code: "denied" | "state" | "token" | "scope" };

export async function finishConnect(
  store: XStore,
  config: XConfig,
  query: { code?: string | null; state?: string | null; error?: string | null },
  http: XFetch,
  now = Date.now(),
): Promise<FinishResult> {
  if (query.error) return { type: "error", code: "denied" };
  if (!query.code || !query.state) return { type: "error", code: "state" };
  const pending = await consumeOAuthState(store, query.state, now);
  if (!pending) return { type: "error", code: "state" };

  let bundle: TokenBundle;
  try {
    bundle = await exchangeCode(http, config, query.code, pending.verifier, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("did not grant") || message.includes("refresh token")) {
      return { type: "error", code: "scope" };
    }
    return { type: "error", code: "token" };
  }

  // exchangeCode uses Date.now() internally. Recompute expiry from `now` when
  // the caller injected a clock, using expires_in already applied above only
  // when now is close to Date.now(). Tests that care about refresh pass `now`
  // into refreshGrant directly. The small skew here is irrelevant.
  let me: XUser;
  try {
    me = await fetchMe(http, bundle.accessToken);
  } catch {
    await revokeQuietly(http, config, bundle.refreshToken);
    return { type: "error", code: "token" };
  }

  const existing = await readAccount(store, me.id);
  const key = newPersonalKey();
  const keyHash = personalKeyHash(key);
  const cookie = newOwnerCookie();
  const cookieHash = hashOwnerCookie(cookie);
  const account: StoredXAccount = {
    userId: me.id,
    username: me.username,
    name: me.name,
    scope: bundle.scope,
    sealed: sealTokens(bundle, config.encryptionSecret),
    keyHash,
    ownerCookieHash: cookieHash,
    connectedAt: now,
  };
  await writeAccount(store, account);
  await store.set(KEYS.reveal(cookieHash), sealSecret(key, config.encryptionSecret), KEY_REVEAL_TTL_SECONDS);
  if (existing?.keyHash && existing.keyHash !== keyHash) await store.del(KEYS.key(existing.keyHash));
  if (existing && isSha256(existing.ownerCookieHash) && existing.ownerCookieHash !== cookieHash) {
    await store.del(KEYS.owner(existing.ownerCookieHash));
    await store.del(KEYS.reveal(existing.ownerCookieHash));
  }
  const legacy = await readLegacy(store);
  if (legacy?.userId === me.id) await store.del(KEYS.legacyAccount);

  if (existing) {
    try {
      const previous = unsealTokens(existing, config.encryptionSecret);
      if (previous.refreshToken !== bundle.refreshToken) {
        await revokeQuietly(http, config, previous.refreshToken);
      }
    } catch {
      // The old row could not be opened. The new grant is already stored.
    }
  }

  return { type: "connected", username: me.username, cookie, key };
}

/**
 * Access tokens are short-lived. Refresh tokens rotate: the previous refresh
 * token dies when X issues the next one, so the new pair is written before
 * this function returns.
 */
export async function ensureAccessToken(
  store: XStore,
  config: XConfig,
  http: XFetch,
  userId: string,
  now = Date.now(),
): Promise<{ accessToken: string; account: StoredXAccount }> {
  const account = await readAccount(store, userId);
  if (!account) throw new XError("X is not connected. Open /x, connect your X account, and use the personal key.");
  const current = unsealTokens(account, config.encryptionSecret);
  if (current.expiresAt - now > 60_000) {
    return { accessToken: current.accessToken, account };
  }

  const lockId = randomBytes(8).toString("hex");
  const locked = await store.setNx(KEYS.refreshLock(account.userId), lockId, 30);
  if (!locked) {
    throw new XError("X token refresh is already in progress. Try the post again in a moment.");
  }
  try {
    const latest = (await readAccount(store, account.userId)) ?? account;
    const bundle = unsealTokens(latest, config.encryptionSecret);
    if (bundle.expiresAt - now > 60_000) {
      return { accessToken: bundle.accessToken, account: latest };
    }
    const next = await refreshGrant(http, config, bundle.refreshToken, bundle.scope, now);
    const updated: StoredXAccount = { ...latest, scope: next.scope || latest.scope, sealed: sealTokens(next, config.encryptionSecret) };
    await writeAccount(store, updated);
    return { accessToken: next.accessToken, account: updated };
  } finally {
    const holder = await store.get(KEYS.refreshLock(account.userId));
    if (holder === lockId) await store.del(KEYS.refreshLock(account.userId));
  }
}

export type DisconnectResult =
  | { type: "ok"; revoked: boolean }
  | { type: "forbidden" }
  | { type: "none" };

export async function disconnectAccount(
  store: XStore,
  config: XConfig,
  cookie: string | null,
  http: XFetch,
): Promise<DisconnectResult> {
  const account = await readAccountByCookie(store, cookie);
  if (!account) return { type: "forbidden" };
  let revoked = false;
  try {
    const bundle = unsealTokens(account, config.encryptionSecret);
    revoked = await revokeQuietly(http, config, bundle.refreshToken);
  } catch {
    revoked = false;
  }
  if (isSha256(account.keyHash)) await store.del(KEYS.key(account.keyHash));
  if (isSha256(account.ownerCookieHash)) {
    await store.del(KEYS.owner(account.ownerCookieHash));
    await store.del(KEYS.reveal(account.ownerCookieHash));
  }
  await store.del(KEYS.user(account.userId));
  const legacy = await readLegacy(store);
  if (legacy?.userId === account.userId) await store.del(KEYS.legacyAccount);
  return { type: "ok", revoked };
}
