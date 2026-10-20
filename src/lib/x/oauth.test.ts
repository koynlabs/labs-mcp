import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { xConfigFromEnv, type XConfig } from "./config";
import { OAUTH_TTL_SECONDS, X_REQUIRED_SCOPES, X_SCOPES } from "./constants";
import {
  authorizationUrl,
  basicAuthorization,
  beginConnect,
  connectionStatus,
  consumePersonalKey,
  consumeOAuthState,
  disconnectAccount,
  ensureAccessToken,
  finishConnect,
  hashOwnerCookie,
  readAccount,
  resolveXAccount,
  unsealTokens,
  writeAccount,
  type XFetch,
} from "./oauth";
import { personalKeyHash } from "./api-key";
import { codeChallenge } from "./pkce";
import { openSecret, sealSecret } from "./seal";
import { createMemoryXStore, KEYS, type XStore } from "./store";

const SCOPE = X_SCOPES.join(" ");
const POSTING_SCOPE = X_REQUIRED_SCOPES.join(" ");

const config: XConfig = {
  clientId: "labs-client",
  clientSecret: "labs-client-secret-value",
  encryptionSecret: "x-token-encryption-key",
  redirectUri: "https://labs.levercoin.lol/api/x/oauth/callback",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function tokenPair(access: string, refresh: string) {
  return {
    token_type: "bearer",
    expires_in: 7200,
    access_token: access,
    refresh_token: refresh,
    scope: SCOPE,
  };
}

function form(init?: RequestInit): URLSearchParams {
  const body = init?.body;
  if (body instanceof URLSearchParams) return body;
  if (typeof body === "string") return new URLSearchParams(body);
  return new URLSearchParams();
}

function me(username = "cyberpsychoxx78", id = "1001") {
  return json({ data: { id, name: "Cyber", username } });
}

describe("PKCE and OAuth state", () => {
  it("sends S256, keeps the verifier off the URL, and consumes state once", async () => {
    const store = createMemoryXStore();
    const started = await beginConnect(store, config, 1_000);
    const url = new URL(started.url);

    assert.equal(url.origin + url.pathname, "https://x.com/i/oauth2/authorize");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("state"), started.state);
    for (const scope of X_SCOPES) assert.equal(url.searchParams.get("scope")?.includes(scope), true);
    assert.equal(started.url.includes(config.clientSecret), false);

    const pending = JSON.parse((await store.get(KEYS.oauth(started.state))) ?? "{}") as { verifier: string };
    assert.equal(url.searchParams.get("code_challenge"), codeChallenge(pending.verifier));
    assert.equal(started.url.includes(pending.verifier), false);
    assert.match(pending.verifier, /^[A-Za-z0-9_-]+$/);

    const calls: string[] = [];
    const http: XFetch = async (target) => {
      calls.push(target);
      if (target.endsWith("/oauth2/token")) return json(tokenPair("access-plain", "refresh-plain"));
      if (target.includes("/users/me")) return me();
      throw new Error(target);
    };

    const first = await finishConnect(store, config, { code: "abc", state: started.state }, http, 2_000);
    assert.equal(first.type, "connected");
    if (first.type !== "connected") return;
    assert.equal(first.username, "cyberpsychoxx78");

    const account = await readAccount(store, "1001");
    assert.ok(account);
    assert.match(first.key, /^lxk_[A-Za-z0-9_-]{40,}$/);
    assert.equal(JSON.stringify(account).includes(first.key), false);
    assert.equal(account.sealed.includes("access-plain"), false);
    assert.equal(account.sealed.includes("refresh-plain"), false);
    assert.equal(account.ownerCookieHash, hashOwnerCookie(first.cookie));
    assert.equal(account.ownerCookieHash.includes(first.cookie), false);
    const opened = unsealTokens(account, config.encryptionSecret);
    assert.equal(opened.accessToken, "access-plain");
    assert.equal(opened.refreshToken, "refresh-plain");

    const tokenCall = calls.find((target) => target.endsWith("/oauth2/token"));
    assert.ok(tokenCall);

    const again = await finishConnect(
      store,
      config,
      { code: "abc", state: started.state },
      async () => {
        throw new Error("state was reused");
      },
      2_000,
    );
    assert.deepEqual(again, { type: "error", code: "state" });
  });

  it("puts the verifier in the code exchange and authenticates with Basic", async () => {
    const store = createMemoryXStore();
    const started = await beginConnect(store, config, 1_000);
    const pending = JSON.parse((await store.get(KEYS.oauth(started.state))) ?? "{}") as { verifier: string };
    let authorization = "";
    let body = new URLSearchParams();
    const http: XFetch = async (target, init) => {
      if (target.endsWith("/oauth2/token")) {
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        body = form(init);
        return json(tokenPair("access-plain", "refresh-plain"));
      }
      return me();
    };
    await finishConnect(store, config, { code: "the-code", state: started.state }, http, 1_000);
    assert.equal(authorization, basicAuthorization(config.clientId, config.clientSecret));
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(body.get("code"), "the-code");
    assert.equal(body.get("code_verifier"), pending.verifier);
    assert.equal(body.get("redirect_uri"), config.redirectUri);
    assert.equal(body.get("client_id"), config.clientId);
  });

  it("rejects a state that is past its lifetime", async () => {
    const store = createMemoryXStore();
    await store.set(KEYS.oauth("stale"), JSON.stringify({ verifier: "verifier-value", createdAt: 0 }));
    const consumed = await consumeOAuthState(store, "stale", OAUTH_TTL_SECONDS * 1000 + 5);
    assert.equal(consumed, null);
    assert.equal(await store.get(KEYS.oauth("stale")), null);
  });

  it("keeps the first account when a different account connects", async () => {
    const store = createMemoryXStore();
    await writeAccount(store, {
      userId: "1001",
      username: "cyberpsychoxx78",
      name: "Cyber",
      scope: SCOPE,
      sealed: sealSecret(
        JSON.stringify({ accessToken: "old-access", refreshToken: "old-refresh", expiresAt: 9, scope: SCOPE }),
        config.encryptionSecret,
      ),
      ownerCookieHash: hashOwnerCookie("owner-cookie"),
      connectedAt: 1,
    });
    const started = await beginConnect(store, config, 1_000);
    const revoked: string[] = [];
    const http: XFetch = async (target, init) => {
      if (target.endsWith("/oauth2/token")) return json(tokenPair("new-access", "new-refresh"));
      if (target.includes("/users/me")) return me("someoneelse", "2002");
      if (target.endsWith("/oauth2/revoke")) {
        revoked.push(form(init).get("token") ?? "");
        return json({});
      }
      throw new Error(target);
    };
    const result = await finishConnect(store, config, { code: "c", state: started.state }, http, 2_000);
    assert.equal(result.type, "connected");
    if (result.type !== "connected") return;
    assert.equal(result.username, "someoneelse");
    assert.deepEqual(revoked, []);
    const first = await readAccount(store, "1001");
    const second = await readAccount(store, "2002");
    assert.equal(unsealTokens(first!, config.encryptionSecret).refreshToken, "old-refresh");
    assert.equal(unsealTokens(second!, config.encryptionSecret).refreshToken, "new-refresh");
    assert.equal(JSON.stringify(second).includes(result.key), false);
  });

  it("replaces the token when the same account signs in again", async () => {
    const store = createMemoryXStore();
    await writeAccount(store, {
      userId: "1001",
      username: "cyberpsychoxx78",
      name: "Cyber",
      scope: SCOPE,
      sealed: sealSecret(
        JSON.stringify({ accessToken: "old-access", refreshToken: "old-refresh", expiresAt: 9, scope: SCOPE }),
        config.encryptionSecret,
      ),
      ownerCookieHash: hashOwnerCookie("owner-cookie"),
      connectedAt: 1,
    });
    const started = await beginConnect(store, config, 1_000);
    const revoked: string[] = [];
    const http: XFetch = async (target, init) => {
      if (target.endsWith("/oauth2/token")) return json(tokenPair("new-access", "new-refresh"));
      if (target.includes("/users/me")) return me();
      if (target.endsWith("/oauth2/revoke")) {
        revoked.push(form(init).get("token") ?? "");
        return json({});
      }
      throw new Error(target);
    };
    const result = await finishConnect(store, config, { code: "c", state: started.state }, http, 5_000);
    assert.equal(result.type, "connected");
    if (result.type !== "connected") return;
    assert.deepEqual(revoked, ["old-refresh"]);
    const account = await readAccount(store, "1001");
    assert.equal(unsealTokens(account!, config.encryptionSecret).refreshToken, "new-refresh");
    assert.match(result.key, /^lxk_/);
    assert.equal(JSON.stringify(account).includes(result.key), false);
    assert.equal(await store.get(KEYS.legacyAccount), null);
    const again = await beginConnect(store, config, 6_000);
    const rotated = await finishConnect(store, config, { code: "c", state: again.state }, http, 7_000);
    assert.equal(rotated.type, "connected");
    if (rotated.type !== "connected") return;
    assert.notEqual(rotated.key, result.key);
    assert.equal(await resolveXAccount(store, `Bearer ${result.key}`), null);
    assert.equal((await resolveXAccount(store, `Bearer ${rotated.key}`))?.userId, "1001");
  });

  it("issues a key for the old global connection only when that account connects again", async () => {
    const store = createMemoryXStore();
    await store.set(
      KEYS.legacyAccount,
      JSON.stringify({
        userId: "1001",
        username: "cyberpsychoxx78",
        name: "Cyber",
        scope: SCOPE,
        sealed: sealSecret(
          JSON.stringify({ accessToken: "old-access", refreshToken: "old-refresh", expiresAt: 9, scope: SCOPE }),
          config.encryptionSecret,
        ),
        ownerCookieHash: hashOwnerCookie("owner-cookie"),
        connectedAt: 1,
      }),
    );
    const other = await beginConnect(store, config, 1_000);
    const http: XFetch = async (target, init) => {
      if (target.endsWith("/oauth2/token")) return json(tokenPair("new-access", "new-refresh"));
      if (target.includes("/users/me")) return me("other", "2002");
      if (target.endsWith("/oauth2/revoke")) return json({});
      throw new Error(String(init?.method ?? target));
    };
    const second = await finishConnect(store, config, { code: "c", state: other.state }, http, 2_000);
    assert.equal(second.type, "connected");
    assert.ok(await store.get(KEYS.legacyAccount));

    const moved = await readAccount(store, "1001");
    assert.equal(moved?.username, "cyberpsychoxx78");
    assert.equal(moved?.keyHash ?? null, null);
    assert.equal(await store.get(KEYS.legacyAccount), null);
    assert.equal(await resolveXAccount(store, "Bearer lxk_not-a-key"), null);

    const started = await beginConnect(store, config, 3_000);
    const revoked: string[] = [];
    const reconnect: XFetch = async (target, init) => {
      if (target.endsWith("/oauth2/token")) return json(tokenPair("fresh-access", "fresh-refresh"));
      if (target.includes("/users/me")) return me();
      if (target.endsWith("/oauth2/revoke")) {
        revoked.push(form(init).get("token") ?? "");
        return json({});
      }
      throw new Error(target);
    };
    const result = await finishConnect(store, config, { code: "c", state: started.state }, reconnect, 4_000);
    assert.equal(result.type, "connected");
    if (result.type !== "connected") return;
    assert.deepEqual(revoked, ["old-refresh"]);
    const account = await readAccount(store, "1001");
    assert.equal(account?.keyHash, personalKeyHash(result.key));
    assert.equal(JSON.stringify(account).includes(result.key), false);
    const shown = await consumePersonalKey(store, config.encryptionSecret, result.cookie);
    assert.equal(shown, result.key);
    assert.equal(await consumePersonalKey(store, config.encryptionSecret, result.cookie), null);
    assert.equal((await readAccount(store, "2002"))?.username, "other");
  });
});

describe("granted scopes", () => {
  it("revokes a grant that is missing media.write and does not store it", async () => {
    const store = createMemoryXStore();
    const started = await beginConnect(store, config, 1_000);
    const revoked: string[] = [];
    const http: XFetch = async (target, init) => {
      if (target.endsWith("/oauth2/token")) {
        return json({
          ...tokenPair("access-plain", "refresh-plain"),
          scope: "tweet.read tweet.write users.read offline.access",
        });
      }
      if (target.endsWith("/oauth2/revoke")) {
        revoked.push(form(init).get("token") ?? "");
        return json({});
      }
      throw new Error(target);
    };
    const result = await finishConnect(store, config, { code: "c", state: started.state }, http, 2_000);
    assert.deepEqual(result, { type: "error", code: "scope" });
    assert.deepEqual(revoked, ["refresh-plain"]);
    assert.equal(await readAccount(store, "1001"), null);
  });

  it("revokes a new grant that can post but did not receive like.write", async () => {
    const store = createMemoryXStore();
    const started = await beginConnect(store, config, 1_000);
    const revoked: string[] = [];
    const http: XFetch = async (target, init) => {
      if (target.endsWith("/oauth2/token")) {
        return json({
          ...tokenPair("access-plain", "refresh-plain"),
          scope: POSTING_SCOPE,
        });
      }
      if (target.endsWith("/oauth2/revoke")) {
        revoked.push(form(init).get("token") ?? "");
        return json({});
      }
      throw new Error(target);
    };
    const result = await finishConnect(store, config, { code: "c", state: started.state }, http, 2_000);
    assert.deepEqual(result, { type: "error", code: "scope" });
    assert.deepEqual(revoked, ["refresh-plain"]);
    assert.equal(await readAccount(store, "1001"), null);
  });
});

describe("token refresh rotation", () => {
  it("refreshes a token from before like.write without dropping the connection", async () => {
    const store = createMemoryXStore();
    await writeAccount(store, {
      userId: "1001",
      username: "cyberpsychoxx78",
      name: "Cyber",
      scope: POSTING_SCOPE,
      sealed: sealSecret(
        JSON.stringify({ accessToken: "old-access", refreshToken: "old-refresh", expiresAt: 0, scope: POSTING_SCOPE }),
        config.encryptionSecret,
      ),
      ownerCookieHash: "hash",
      connectedAt: 1,
    });
    const http: XFetch = async () =>
      json({
        token_type: "bearer",
        expires_in: 7200,
        access_token: "still-posting",
        refresh_token: "still-refresh",
        scope: POSTING_SCOPE,
      });
    const fresh = await ensureAccessToken(store, config, http, "1001", 10_000);
    assert.equal(fresh.accessToken, "still-posting");
    assert.equal(fresh.account.scope.includes("like.write"), false);
    assert.equal(unsealTokens(fresh.account, config.encryptionSecret).refreshToken, "still-refresh");
  });

  it("still rejects a refresh that lost tweet.write", async () => {
    const store = createMemoryXStore();
    await writeAccount(store, {
      userId: "1001",
      username: "cyberpsychoxx78",
      name: "Cyber",
      scope: POSTING_SCOPE,
      sealed: sealSecret(
        JSON.stringify({ accessToken: "old-access", refreshToken: "old-refresh", expiresAt: 0, scope: POSTING_SCOPE }),
        config.encryptionSecret,
      ),
      ownerCookieHash: "hash",
      connectedAt: 1,
    });
    const http: XFetch = async () =>
      json({
        token_type: "bearer",
        expires_in: 7200,
        access_token: "narrow",
        refresh_token: "narrow-refresh",
        scope: "users.read offline.access",
      });
    await assert.rejects(() => ensureAccessToken(store, config, http, "1001", 10_000), /tweet\.write/);
  });

  it("persists the rotated refresh token and sends it on the next refresh", async () => {
    const store = createMemoryXStore();
    await writeAccount(store, {
      userId: "1001",
      username: "cyberpsychoxx78",
      name: "Cyber",
      scope: SCOPE,
      sealed: sealSecret(
        JSON.stringify({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt: 0, scope: SCOPE }),
        config.encryptionSecret,
      ),
      ownerCookieHash: "hash",
      connectedAt: 1,
    });
    const sent: string[] = [];
    let generation = 1;
    const http: XFetch = async (_target, init) => {
      const refresh = form(init).get("refresh_token") ?? "";
      sent.push(refresh);
      generation += 1;
      return json(tokenPair(`access-${generation}`, `refresh-${generation}`));
    };

    const first = await ensureAccessToken(store, config, http, "1001", 10_000);
    assert.equal(first.accessToken, "access-2");
    assert.equal(unsealTokens((await readAccount(store, "1001"))!, config.encryptionSecret).refreshToken, "refresh-2");

    const expired = unsealTokens((await readAccount(store, "1001"))!, config.encryptionSecret);
    expired.expiresAt = 0;
    const current = (await readAccount(store, "1001"))!;
    current.sealed = sealSecret(JSON.stringify(expired), config.encryptionSecret);
    await writeAccount(store, current);

    const second = await ensureAccessToken(store, config, http, "1001", 20_000);
    assert.equal(second.accessToken, "access-3");
    assert.deepEqual(sent, ["refresh-1", "refresh-2"]);
    assert.equal(unsealTokens((await readAccount(store, "1001"))!, config.encryptionSecret).refreshToken, "refresh-3");
  });

  it("keeps the previous refresh token when the refresh request fails", async () => {
    const store = createMemoryXStore();
    await writeAccount(store, {
      userId: "1001",
      username: "cyberpsychoxx78",
      name: "Cyber",
      scope: SCOPE,
      sealed: sealSecret(
        JSON.stringify({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt: 0, scope: SCOPE }),
        config.encryptionSecret,
      ),
      ownerCookieHash: "hash",
      connectedAt: 1,
    });
    const http: XFetch = async () => json({ error_description: "invalid_grant" }, 400);
    await assert.rejects(() => ensureAccessToken(store, config, http, "1001", 10_000), /invalid_grant/);
    assert.equal(unsealTokens((await readAccount(store, "1001"))!, config.encryptionSecret).refreshToken, "refresh-1");
  });
});

describe("disconnect", () => {
  it("revokes only for the browser that connected", async () => {
    const store = createMemoryXStore();
    const cookie = "owner-cookie-value";
    await writeAccount(store, {
      userId: "1001",
      username: "cyberpsychoxx78",
      name: "Cyber",
      scope: SCOPE,
      sealed: sealSecret(
        JSON.stringify({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt: 50_000, scope: SCOPE }),
        config.encryptionSecret,
      ),
      ownerCookieHash: hashOwnerCookie(cookie),
      connectedAt: 1,
    });
    const denied = await disconnectAccount(store, config, null, async () => {
      throw new Error("should not revoke");
    });
    assert.deepEqual(denied, { type: "forbidden" });
    assert.ok(await readAccount(store, "1001"));

    const wrongCookie = await disconnectAccount(store, config, `${cookie}-no`, async () => {
      throw new Error("should not revoke");
    });
    assert.deepEqual(wrongCookie, { type: "forbidden" });
    assert.equal((await readAccount(store, "1001"))?.username, "cyberpsychoxx78");

    let revoked = "";
    const ok = await disconnectAccount(store, config, cookie, async (_target, init) => {
      revoked = form(init).get("token") ?? "";
      return json({});
    });
    assert.deepEqual(ok, { type: "ok", revoked: true });
    assert.equal(revoked, "refresh-1");
    assert.equal(await readAccount(store, "1001"), null);
  });
});

describe("config and seal", () => {
  it("uses the encryption key and falls back to the client secret", () => {
    const previous = {
      id: process.env.X_CLIENT_ID,
      secret: process.env.X_CLIENT_SECRET,
      key: process.env.X_TOKEN_ENCRYPTION_KEY,
    };
    process.env.X_CLIENT_ID = "id";
    process.env.X_CLIENT_SECRET = "client-secret-long-enough";
    process.env.X_TOKEN_ENCRYPTION_KEY = "dedicated-encryption-key";
    try {
      assert.equal(xConfigFromEnv()?.encryptionSecret, "dedicated-encryption-key");
      delete process.env.X_TOKEN_ENCRYPTION_KEY;
      assert.equal(xConfigFromEnv()?.encryptionSecret, "client-secret-long-enough");
      delete process.env.X_CLIENT_SECRET;
      assert.equal(xConfigFromEnv(), null);
    } finally {
      if (previous.id === undefined) delete process.env.X_CLIENT_ID;
      else process.env.X_CLIENT_ID = previous.id;
      if (previous.secret === undefined) delete process.env.X_CLIENT_SECRET;
      else process.env.X_CLIENT_SECRET = previous.secret;
      if (previous.key === undefined) delete process.env.X_TOKEN_ENCRYPTION_KEY;
      else process.env.X_TOKEN_ENCRYPTION_KEY = previous.key;
    }
  });

  it("round-trips a token bundle and hides it from the ciphertext", () => {
    const sealed = sealSecret(JSON.stringify({ accessToken: "visible-access", refreshToken: "visible-refresh" }), "a-long-secret");
    assert.equal(sealed.includes("visible-access"), false);
    assert.equal(JSON.parse(openSecret(sealed, "a-long-secret")).refreshToken, "visible-refresh");
    assert.throws(() => openSecret(sealed, "another-long-secret"));
  });

  it("reports the connected username without the sealed token", async () => {
    const store: XStore = createMemoryXStore();
    await writeAccount(store, {
      userId: "1001",
      username: "cyberpsychoxx78",
      name: "Cyber",
      scope: SCOPE,
      sealed: "sealed-blob",
      ownerCookieHash: "hash",
      connectedAt: 1,
    });
    const status = connectionStatus(await readAccount(store, "1001"), true);
    assert.equal(status.username, "@cyberpsychoxx78");
    assert.equal(JSON.stringify(status).includes("sealed-blob"), false);
    const authorize = authorizationUrl({
      clientId: "id",
      redirectUri: config.redirectUri,
      state: "state",
      verifier: "pkce-verifier-secret",
    });
    assert.equal(authorize.includes("pkce-verifier-secret"), false);
    assert.equal(new URL(authorize).searchParams.get("code_challenge_method"), "S256");
  });
});
