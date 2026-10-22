import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerXTools } from "../mcp/x-tools";
import { withMcpAuthorization, newPersonalKey, personalKeyHash } from "./api-key";
import type { XConfig } from "./config";
import { X_REQUIRED_SCOPES, X_SCOPES } from "./constants";
import {
  LIKE_SCOPE_MESSAGE,
  accountCanLike,
  likeCapsFromEnv,
  parsePostId,
  setPostLike,
} from "./like";
import { hashOwnerCookie, writeAccount, type XFetch } from "./oauth";
import { sealSecret } from "./seal";
import { createMemoryXStore, KEYS, xStore } from "./store";

const SCOPE = X_SCOPES.join(" ");
const POSTING_SCOPE = X_REQUIRED_SCOPES.join(" ");
const SECRET = "x-token-encryption-key";
const config: XConfig = {
  clientId: "labs-client",
  clientSecret: "labs-client-secret-value",
  encryptionSecret: SECRET,
  redirectUri: "https://labs.koyn.trade/api/x/oauth/callback",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function connect(store: ReturnType<typeof createMemoryXStore>, userId: string, scope: string) {
  await writeAccount(store, {
    userId,
    username: userId === "1001" ? "labsmcp" : "levercoin_lol",
    name: "Labs",
    scope,
    sealed: sealSecret(
      JSON.stringify({
        accessToken: `access-${userId}`,
        refreshToken: `refresh-${userId}`,
        expiresAt: Date.parse("2026-12-01T00:00:00Z"),
        scope,
      }),
      SECRET,
    ),
    keyHash: null,
    ownerCookieHash: hashOwnerCookie(`cookie-${userId}`),
    connectedAt: 1,
  });
}

describe("post ids", () => {
  it("accepts an id or an https status URL and does not fetch it", () => {
    assert.equal(parsePostId("1228393702244134912"), "1228393702244134912");
    assert.equal(parsePostId("  https://x.com/labsmcp/status/20  "), "20");
    assert.equal(parsePostId("https://twitter.com/levercoin_lol/status/20?s=20"), "20");
    assert.equal(parsePostId("https://www.x.com/i/web/status/20#reply"), "20");
    assert.equal(parsePostId("https://mobile.twitter.com/labsmcp/statuses/20/photo/1"), "20");
    assert.equal(parsePostId("https://X.com/labsmcp/status/20"), "20");
  });

  it("rejects anything that is not a status id", () => {
    for (const bad of [
      "",
      "abc",
      "123456789012345678901",
      "http://x.com/labsmcp/status/20",
      "https://evil.example/status/20",
      "https://x.com.evil.example/status/20",
      "https://user:pass@x.com/labsmcp/status/20",
      "https://x.com/labsmcp",
      "https://x.com/intent/like?tweet_id=20",
    ]) {
      assert.throws(() => parsePostId(bad), /post id|status/);
    }
  });
});

describe("like caps", () => {
  it("defaults to 30 and honors an integer override", () => {
    const bare = {} as NodeJS.ProcessEnv;
    assert.deepEqual(likeCapsFromEnv(bare), { daily: 30 });
    assert.deepEqual(likeCapsFromEnv({ ...bare, X_LIKE_DAILY_CAP: "0" }), { daily: 0 });
    assert.deepEqual(likeCapsFromEnv({ ...bare, X_LIKE_DAILY_CAP: "12" }), { daily: 12 });
    assert.deepEqual(likeCapsFromEnv({ ...bare, X_LIKE_DAILY_CAP: "nope" }), { daily: 30 });
  });
});

describe("likes", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");

  it("likes and unlikes by id or URL for that account only", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    await connect(store, "2002", SCOPE);
    const calls: { url: string; method: string; body: string; auth: string }[] = [];
    const http: XFetch = async (url, init) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : "",
        auth: String((init?.headers as Record<string, string> | undefined)?.authorization ?? ""),
      });
      const liked = init?.method !== "DELETE";
      return json({ data: { liked } });
    };
    const deps = { store, config, http, userId: "1001", now, caps: { daily: 30 } };
    const liked = await setPostLike(deps, "https://x.com/someone/status/555", "like");
    assert.deepEqual(liked, { liked: true, id: "555", account: "@labsmcp", action: "like" });
    assert.equal(calls[0]?.method, "POST");
    assert.equal(calls[0]?.url, "https://api.x.com/2/users/1001/likes");
    assert.equal(calls[0]?.body, JSON.stringify({ tweet_id: "555" }));
    assert.equal(calls[0]?.auth, "Bearer access-1001");

    const unliked = await setPostLike(deps, "555", "unlike");
    assert.equal(unliked.liked, false);
    assert.equal(calls[1]?.method, "DELETE");
    assert.equal(calls[1]?.url, "https://api.x.com/2/users/1001/likes/555");
    assert.equal(calls[1]?.body, "");

    const other = await setPostLike({ ...deps, userId: "2002" }, "555", "like");
    assert.equal(other.account, "@levercoin_lol");
    assert.equal(calls[2]?.auth, "Bearer access-2002");
    assert.equal(calls[2]?.url, "https://api.x.com/2/users/2002/likes");
    assert.equal(await store.get(KEYS.likeDay("1001", "2026-10-20")), "2");
    assert.equal(await store.get(KEYS.likeDay("2002", "2026-10-20")), "1");
  });

  it("refuses a token without like.write before calling X and tells the caller to reconnect", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", POSTING_SCOPE);
    assert.equal(accountCanLike({ scope: POSTING_SCOPE }), false);
    let called = false;
    const http: XFetch = async () => {
      called = true;
      return json({ data: { liked: true } });
    };
    await assert.rejects(
      () => setPostLike({ store, config, http, userId: "1001", now, caps: { daily: 30 } }, "555", "like"),
      (error: unknown) => {
        assert.equal(error instanceof Error ? error.message : "", LIKE_SCOPE_MESSAGE);
        assert.match(LIKE_SCOPE_MESSAGE, /x_connect_link/);
        assert.match(LIKE_SCOPE_MESSAGE, /like\.write/);
        return true;
      },
    );
    await assert.rejects(
      () => setPostLike({ store, config, http, userId: "1001", now, caps: { daily: 30 } }, "555", "unlike"),
      /x_connect_link/,
    );
    assert.equal(called, false);
    assert.equal(await store.get(KEYS.likeDay("1001", "2026-10-20")), null);
  });

  it("maps an X scope refusal to the same reconnect error", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    const http: XFetch = async () =>
      json({ title: "Forbidden", detail: "One or more of the scopes requested is missing.", status: 403 }, 403);
    await assert.rejects(
      () => setPostLike({ store, config, http, userId: "1001", now, caps: { daily: 30 } }, "555", "like"),
      /x_connect_link/,
    );
    assert.equal(await store.get(KEYS.likeDay("1001", "2026-10-20")), null);
  });

  it("leaves a non-scope refusal from X as that refusal", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    const http: XFetch = async () => json({ detail: "You cannot like this protected post." }, 403);
    await assert.rejects(
      () => setPostLike({ store, config, http, userId: "1001", now, caps: { daily: 30 } }, "555", "like"),
      /cannot like this protected post/,
    );
  });

  it("stops at the daily cap and does not call X again", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    let calls = 0;
    const http: XFetch = async () => {
      calls += 1;
      return json({ data: { liked: true } });
    };
    const deps = { store, config, http, userId: "1001", now, caps: { daily: 2 } };
    await setPostLike(deps, "1", "like");
    await setPostLike(deps, "2", "unlike");
    await assert.rejects(() => setPostLike(deps, "3", "like"), /daily like cap of 2/);
    assert.equal(calls, 2);
    const nextDay = Date.parse("2026-10-21T00:30:00Z");
    const again = await setPostLike({ ...deps, now: nextDay }, "3", "like");
    assert.equal(again.id, "3");
    assert.equal(calls, 3);
  });

  it("refuses likes when the cap is 0", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    const http: XFetch = async () => {
      throw new Error("cap 0 must not call X");
    };
    await assert.rejects(
      () => setPostLike({ store, config, http, userId: "1001", now, caps: { daily: 0 } }, "1", "like"),
      /X_LIKE_DAILY_CAP is 0/,
    );
  });
});

describe("like tools", () => {
  function captureTools() {
    const tools = new Map<string, (args: Record<string, unknown>) => Promise<{
      isError?: boolean;
      content: { type: string; text: string }[];
      structuredContent?: Record<string, unknown>;
    }>>();
    const server = {
      registerTool(name: string, _config: unknown, cb: (args: Record<string, unknown>) => Promise<never>) {
        tools.set(name, cb);
      },
    };
    registerXTools(server as unknown as McpServer);
    return tools;
  }

  it("requires the calling key, and a missing scope does not like", async () => {
    const tools = captureTools();
    const key = newPersonalKey();
    const previous = {
      id: process.env.X_CLIENT_ID,
      secret: process.env.X_CLIENT_SECRET,
      encryption: process.env.X_TOKEN_ENCRYPTION_KEY,
      fetch: globalThis.fetch,
    };
    process.env.X_CLIENT_ID = "labs-client";
    process.env.X_CLIENT_SECRET = "labs-client-secret-value";
    process.env.X_TOKEN_ENCRYPTION_KEY = SECRET;
    const calls: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (String(url).includes("/2/users/3003/likes")) {
        return json({ data: { liked: init?.method !== "DELETE" } });
      }
      throw new Error("unexpected " + url);
    }) as typeof fetch;

    try {
      const missing = await tools.get("x_like_post")!({ post: "555" });
      assert.equal(missing.isError, true);
      assert.match(missing.content[0].text, /\/x/);
      assert.equal(calls.length, 0);

      await writeAccount(xStore, {
        userId: "3003",
        username: "labsmcp",
        name: "Labs",
        scope: POSTING_SCOPE,
        sealed: sealSecret(
          JSON.stringify({
            accessToken: "access-3003",
            refreshToken: "refresh-3003",
            expiresAt: Date.now() + 3_600_000,
            scope: POSTING_SCOPE,
          }),
          SECRET,
        ),
        keyHash: personalKeyHash(key),
        ownerCookieHash: hashOwnerCookie("cookie-3003"),
        connectedAt: 1,
      });

      const status = await withMcpAuthorization("Bearer " + key, () => tools.get("x_connection_status")!({}));
      assert.equal(status.structuredContent?.likeWrite, false);
      assert.equal(status.structuredContent?.likeDailyCap, likeCapsFromEnv().daily);
      assert.equal(status.structuredContent?.username, "@labsmcp");

      const blocked = await withMcpAuthorization("Bearer " + key, () => tools.get("x_like_post")!({ post: "555" }));
      assert.equal(blocked.isError, true);
      assert.match(blocked.content[0].text, /x_connect_link/);
      assert.equal(calls.length, 0);

      await writeAccount(xStore, {
        userId: "3003",
        username: "labsmcp",
        name: "Labs",
        scope: SCOPE,
        sealed: sealSecret(
          JSON.stringify({
            accessToken: "access-3003",
            refreshToken: "refresh-3003",
            expiresAt: Date.now() + 3_600_000,
            scope: SCOPE,
          }),
          SECRET,
        ),
        keyHash: personalKeyHash(key),
        ownerCookieHash: hashOwnerCookie("cookie-3003"),
        connectedAt: 1,
      });

      const liked = await withMcpAuthorization("Bearer " + key, () =>
        tools.get("x_like_post")!({ post: "https://x.com/levercoin_lol/status/555" }),
      );
      assert.equal(liked.isError, undefined);
      assert.equal(liked.structuredContent?.liked, true);
      assert.equal(liked.structuredContent?.id, "555");
      assert.equal(liked.structuredContent?.account, "@labsmcp");
      assert.deepEqual(calls, ["POST https://api.x.com/2/users/3003/likes"]);

      const unliked = await withMcpAuthorization("Bearer " + key, () => tools.get("x_unlike_post")!({ post: "555" }));
      assert.equal(unliked.structuredContent?.liked, false);
      assert.deepEqual(calls[1], "DELETE https://api.x.com/2/users/3003/likes/555");
    } finally {
      globalThis.fetch = previous.fetch;
      if (previous.id === undefined) delete process.env.X_CLIENT_ID;
      else process.env.X_CLIENT_ID = previous.id;
      if (previous.secret === undefined) delete process.env.X_CLIENT_SECRET;
      else process.env.X_CLIENT_SECRET = previous.secret;
      if (previous.encryption === undefined) delete process.env.X_TOKEN_ENCRYPTION_KEY;
      else process.env.X_TOKEN_ENCRYPTION_KEY = previous.encryption;
      await xStore.del(KEYS.user("3003"));
      await xStore.del(KEYS.key(personalKeyHash(key)));
      await xStore.del(KEYS.owner(hashOwnerCookie("cookie-3003")));
      await xStore.del(KEYS.likeDay("3003", new Date().toISOString().slice(0, 10)));
    }
  });
});
