import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerXTools } from "../mcp/x-tools";
import { withMcpAuthorization, newPersonalKey, personalKeyHash } from "./api-key";
import type { XConfig } from "./config";
import { X_REQUIRED_SCOPES, X_SCOPES } from "./constants";
import {
  FOLLOW_SCOPE_MESSAGE,
  accountCanFollow,
  followCapsFromEnv,
  parseFollowTarget,
  setFollow,
} from "./follow";
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
    username: userId === "1001" ? "labsmcp" : "koyndex",
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

describe("follow targets", () => {
  it("accepts an id, an @username, or a profile URL and does not fetch it", () => {
    assert.deepEqual(parseFollowTarget("4242"), { kind: "id", id: "4242" });
    assert.deepEqual(parseFollowTarget("  @koyndex  "), { kind: "username", username: "koyndex" });
    assert.deepEqual(parseFollowTarget("Labs_MCP"), { kind: "username", username: "Labs_MCP" });
    assert.deepEqual(parseFollowTarget("@12345"), { kind: "username", username: "12345" });
    assert.deepEqual(parseFollowTarget("https://x.com/koyndex"), { kind: "username", username: "koyndex" });
    assert.deepEqual(parseFollowTarget("https://twitter.com/koyndex/"), { kind: "username", username: "koyndex" });
    assert.deepEqual(parseFollowTarget("https://www.x.com/@koyndex?s=21"), { kind: "username", username: "koyndex" });
    assert.deepEqual(parseFollowTarget("https://mobile.twitter.com/koyndex"), { kind: "username", username: "koyndex" });
    assert.deepEqual(parseFollowTarget("https://x.com/i/user/4242"), { kind: "id", id: "4242" });
  });

  it("rejects lists, status URLs, and anything that is not one account", () => {
    for (const bad of [
      "",
      "@",
      "@koyndex @labsmcp",
      "koyndex,labsmcp",
      "not a user",
      "waytoolongusername",
      "has.dot",
      "http://x.com/koyndex",
      "https://evil.example/koyndex",
      "https://x.com.evil.example/koyndex",
      "https://user:pass@x.com/koyndex",
      "https://x.com/koyndex/status/20",
      "https://x.com/intent/follow?screen_name=koyndex",
      "https://x.com/home",
      "https://x.com/i/user/nope",
    ]) {
      assert.throws(() => parseFollowTarget(bad), /one user|@username/);
    }
  });
});

describe("follow caps", () => {
  it("defaults to 10 and 10 and honors an integer override", () => {
    const bare = {} as NodeJS.ProcessEnv;
    assert.deepEqual(followCapsFromEnv(bare), { followDaily: 10, unfollowDaily: 10 });
    assert.deepEqual(followCapsFromEnv({ ...bare, X_FOLLOW_DAILY_CAP: "0", X_UNFOLLOW_DAILY_CAP: "4" }), {
      followDaily: 0,
      unfollowDaily: 4,
    });
    assert.deepEqual(followCapsFromEnv({ ...bare, X_FOLLOW_DAILY_CAP: "nope", X_UNFOLLOW_DAILY_CAP: "10.5" }), {
      followDaily: 10,
      unfollowDaily: 10,
    });
  });
});

describe("follows", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const caps = { followDaily: 10, unfollowDaily: 10 };

  it("follows and unfollows by id with no username lookup", async () => {
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
      const following = init?.method !== "DELETE";
      return json({ data: { following, pending_follow: false } });
    };
    const deps = { store, config, http, userId: "1001", now, caps };
    const followed = await setFollow(deps, "4242", "follow");
    assert.deepEqual(followed, {
      following: true,
      pendingFollow: false,
      id: "4242",
      username: null,
      account: "@labsmcp",
      action: "follow",
    });
    assert.equal(calls[0]?.method, "POST");
    assert.equal(calls[0]?.url, "https://api.x.com/2/users/1001/following");
    assert.equal(calls[0]?.body, JSON.stringify({ target_user_id: "4242" }));
    assert.equal(calls[0]?.auth, "Bearer access-1001");
    assert.equal(calls.some((call) => call.url.includes("/by/username/")), false);

    const unfollowed = await setFollow(deps, "https://x.com/i/user/4242", "unfollow");
    assert.equal(unfollowed.following, false);
    assert.equal(unfollowed.username, null);
    assert.equal(calls[1]?.method, "DELETE");
    assert.equal(calls[1]?.url, "https://api.x.com/2/users/1001/following/4242");
    assert.equal(calls[1]?.body, "");

    const other = await setFollow({ ...deps, userId: "2002" }, "4242", "follow");
    assert.equal(other.account, "@koyndex");
    assert.equal(calls[2]?.auth, "Bearer access-2002");
    assert.equal(calls[2]?.url, "https://api.x.com/2/users/2002/following");
    assert.equal(calls.length, 3);
    assert.equal(await store.get(KEYS.followDay("1001", "2026-10-20")), "1");
    assert.equal(await store.get(KEYS.unfollowDay("1001", "2026-10-20")), "1");
    assert.equal(await store.get(KEYS.followDay("2002", "2026-10-20")), "1");
  });

  it("looks up a username once, then follows or unfollows that id", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    const calls: { url: string; method: string; body: string }[] = [];
    const http: XFetch = async (url, init) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : "",
      });
      if (url.includes("/by/username/")) {
        return json({ data: { id: "4242", name: "KOYN", username: "koyndex" } });
      }
      return json({ data: { following: init?.method !== "DELETE", pending_follow: false } });
    };
    const deps = { store, config, http, userId: "1001", now, caps };
    const followed = await setFollow(deps, "https://x.com/koyndex", "follow");
    assert.equal(followed.username, "@koyndex");
    assert.equal(followed.id, "4242");
    assert.equal(followed.following, true);
    assert.deepEqual(
      calls.map((call) => `${call.method} ${call.url}`),
      [
        "GET https://api.x.com/2/users/by/username/koyndex",
        "POST https://api.x.com/2/users/1001/following",
      ],
    );
    assert.equal(calls[1]?.body, JSON.stringify({ target_user_id: "4242" }));

    calls.length = 0;
    const unfollowed = await setFollow(deps, "@KOYNDEX", "unfollow");
    assert.equal(unfollowed.following, false);
    assert.equal(unfollowed.username, "@koyndex");
    assert.deepEqual(
      calls.map((call) => `${call.method} ${call.url}`),
      [
        "GET https://api.x.com/2/users/by/username/KOYNDEX",
        "DELETE https://api.x.com/2/users/1001/following/4242",
      ],
    );
  });

  it("treats an @-prefixed numeric handle as a username lookup, not an id write", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    const calls: string[] = [];
    const http: XFetch = async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/by/username/12345")) return json({ data: { id: "999", name: "Num", username: "12345" } });
      return json({ data: { following: true, pending_follow: false } });
    };
    const followed = await setFollow({ store, config, http, userId: "1001", now, caps }, "@12345", "follow");
    assert.equal(followed.id, "999");
    assert.deepEqual(calls, [
      "GET https://api.x.com/2/users/by/username/12345",
      "POST https://api.x.com/2/users/1001/following",
    ]);
  });

  it("reports a protected follow request as pending and counts it", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    const http: XFetch = async () => json({ data: { following: false, pending_follow: true } });
    const followed = await setFollow({ store, config, http, userId: "1001", now, caps }, "4242", "follow");
    assert.equal(followed.following, false);
    assert.equal(followed.pendingFollow, true);
    assert.equal(await store.get(KEYS.followDay("1001", "2026-10-20")), "1");
  });

  it("refuses a token without follows.write before calling X and tells the caller to reconnect", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", `${POSTING_SCOPE} like.write`);
    assert.equal(accountCanFollow({ scope: `${POSTING_SCOPE} like.write` }), false);
    let called = false;
    const http: XFetch = async () => {
      called = true;
      return json({ data: { following: true } });
    };
    await assert.rejects(
      () => setFollow({ store, config, http, userId: "1001", now, caps }, "@koyndex", "follow"),
      (error: unknown) => {
        assert.equal(error instanceof Error ? error.message : "", FOLLOW_SCOPE_MESSAGE);
        assert.match(FOLLOW_SCOPE_MESSAGE, /x_connect_link/);
        assert.match(FOLLOW_SCOPE_MESSAGE, /follows\.write/);
        return true;
      },
    );
    await assert.rejects(
      () => setFollow({ store, config, http, userId: "1001", now, caps }, "4242", "unfollow"),
      /x_connect_link/,
    );
    assert.equal(called, false);
    assert.equal(await store.get(KEYS.followDay("1001", "2026-10-20")), null);
  });

  it("maps an X scope refusal to the same reconnect error", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    const http: XFetch = async () =>
      json({ title: "Forbidden", detail: "One or more of the scopes requested is missing.", status: 403 }, 403);
    await assert.rejects(
      () => setFollow({ store, config, http, userId: "1001", now, caps }, "4242", "follow"),
      /x_connect_link/,
    );
    assert.equal(await store.get(KEYS.followDay("1001", "2026-10-20")), null);
  });

  it("keeps the HTTP status on a billing refusal and does not spend the cap", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    const http: XFetch = async () =>
      json(
        {
          title: "CreditsDepleted",
          detail: "Your enrolled account does not have any credits to serve this request.",
        },
        402,
      );
    await assert.rejects(
      () => setFollow({ store, config, http, userId: "1001", now, caps }, "4242", "follow"),
      /X refused the follow \(402\): Your enrolled account does not have any credits/,
    );
    assert.equal(await store.get(KEYS.followDay("1001", "2026-10-20")), null);
  });

  it("keeps the status when X returns a non-JSON billing body", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    const http: XFetch = async () => new Response("payment required", { status: 402 });
    await assert.rejects(
      () => setFollow({ store, config, http, userId: "1001", now, caps }, "4242", "unfollow"),
      (error: unknown) => {
        assert.equal(error instanceof Error ? error.message : "", "X refused the unfollow (402).");
        return true;
      },
    );
  });

  it("does not turn a non-scope refusal into a reconnect, and still includes the status", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    const http: XFetch = async () => json({ detail: "You have been blocked from following this account." }, 403);
    await assert.rejects(
      () => setFollow({ store, config, http, userId: "1001", now, caps }, "4242", "follow"),
      /X refused the follow \(403\): You have been blocked/,
    );
  });

  it("includes the status on a username lookup failure and does not follow", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    const calls: string[] = [];
    const http: XFetch = async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/by/username/")) {
        return json(
          { title: "CreditsDepleted", detail: "Your enrolled account does not have any credits." },
          402,
        );
      }
      throw new Error("follow must not run after a failed lookup");
    };
    await assert.rejects(
      () => setFollow({ store, config, http, userId: "1001", now, caps }, "@koyndex", "follow"),
      /X refused the user lookup \(402\): Your enrolled account does not have any credits/,
    );
    assert.deepEqual(calls, ["GET https://api.x.com/2/users/by/username/koyndex"]);
    assert.equal(await store.get(KEYS.followDay("1001", "2026-10-20")), null);
  });

  it("does not follow or unfollow itself, and does not call X", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    const http: XFetch = async () => {
      throw new Error("self follow must not call X");
    };
    const deps = { store, config, http, userId: "1001", now, caps };
    await assert.rejects(() => setFollow(deps, "1001", "follow"), /cannot follow itself/);
    await assert.rejects(() => setFollow(deps, "@LabsMCP", "unfollow"), /cannot unfollow itself/);
    assert.equal(await store.get(KEYS.followDay("1001", "2026-10-20")), null);
  });

  it("stops after a lookup that resolves to this account and does not write the follow", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    const calls: string[] = [];
    const http: XFetch = async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return json({ data: { id: "1001", name: "Labs", username: "labsmcp" } });
    };
    await assert.rejects(
      () => setFollow({ store, config, http, userId: "1001", now, caps }, "@renamed", "follow"),
      /cannot follow itself/,
    );
    assert.deepEqual(calls, ["GET https://api.x.com/2/users/by/username/renamed"]);
    assert.equal(await store.get(KEYS.followDay("1001", "2026-10-20")), null);
  });

  it("stops at each daily cap on its own and does not call X again", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    const calls: string[] = [];
    const http: XFetch = async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/by/username/")) return json({ data: { id: "4242", name: "KOYN", username: "koyndex" } });
      return json({ data: { following: init?.method !== "DELETE", pending_follow: false } });
    };
    const deps = { store, config, http, userId: "1001", now, caps: { followDaily: 1, unfollowDaily: 1 } };
    await setFollow(deps, "1", "follow");
    await assert.rejects(() => setFollow(deps, "@koyndex", "follow"), /daily follow cap of 1/);
    assert.equal(calls.length, 1);
    const unfollowed = await setFollow(deps, "@koyndex", "unfollow");
    assert.equal(unfollowed.following, false);
    assert.equal(calls.at(-1), "DELETE https://api.x.com/2/users/1001/following/4242");
    const before = calls.length;
    await assert.rejects(() => setFollow(deps, "4242", "unfollow"), /daily unfollow cap of 1/);
    assert.equal(calls.length, before);
    const nextDay = Date.parse("2026-10-21T00:30:00Z");
    const again = await setFollow({ ...deps, now: nextDay }, "3", "follow");
    assert.equal(again.id, "3");
  });

  it("refuses follows or unfollows when that cap is 0, without calling X", async () => {
    const store = createMemoryXStore();
    await connect(store, "1001", SCOPE);
    let calls = 0;
    const http: XFetch = async () => {
      calls += 1;
      return json({ data: { following: true, pending_follow: false } });
    };
    const deps = { store, config, http, userId: "1001", now, caps: { followDaily: 0, unfollowDaily: 10 } };
    await assert.rejects(() => setFollow(deps, "1", "follow"), /X_FOLLOW_DAILY_CAP is 0/);
    const unfollowed = await setFollow(deps, "1", "unfollow");
    assert.equal(unfollowed.action, "unfollow");
    assert.equal(calls, 1);
    await assert.rejects(
      () => setFollow({ ...deps, caps: { followDaily: 10, unfollowDaily: 0 } }, "1", "unfollow"),
      /X_UNFOLLOW_DAILY_CAP is 0/,
    );
    assert.equal(calls, 1);
  });
});

describe("follow tools", () => {
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

  it("requires the calling key, and a missing scope does not follow", async () => {
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
      if (String(url).includes("/by/username/koyndex")) {
        return json({ data: { id: "4242", name: "KOYN", username: "koyndex" } });
      }
      if (String(url).includes("/2/users/4004/following")) {
        return json({ data: { following: init?.method !== "DELETE", pending_follow: false } });
      }
      throw new Error("unexpected " + url);
    }) as typeof fetch;

    const day = new Date().toISOString().slice(0, 10);
    try {
      const missing = await tools.get("x_follow_user")!({ user: "@koyndex" });
      assert.equal(missing.isError, true);
      assert.match(missing.content[0].text, /\/x/);
      assert.equal(calls.length, 0);

      await writeAccount(xStore, {
        userId: "4004",
        username: "labsmcp",
        name: "Labs",
        scope: POSTING_SCOPE,
        sealed: sealSecret(
          JSON.stringify({
            accessToken: "access-4004",
            refreshToken: "refresh-4004",
            expiresAt: Date.now() + 3_600_000,
            scope: POSTING_SCOPE,
          }),
          SECRET,
        ),
        keyHash: personalKeyHash(key),
        ownerCookieHash: hashOwnerCookie("cookie-4004"),
        connectedAt: 1,
      });

      const status = await withMcpAuthorization("Bearer " + key, () => tools.get("x_connection_status")!({}));
      assert.equal(status.structuredContent?.followsWrite, false);
      assert.equal(status.structuredContent?.followDailyCap, followCapsFromEnv().followDaily);
      assert.equal(status.structuredContent?.unfollowDailyCap, followCapsFromEnv().unfollowDaily);
      assert.equal(status.structuredContent?.username, "@labsmcp");

      const blocked = await withMcpAuthorization("Bearer " + key, () =>
        tools.get("x_follow_user")!({ user: "@koyndex" }),
      );
      assert.equal(blocked.isError, true);
      assert.match(blocked.content[0].text, /x_connect_link/);
      assert.match(blocked.content[0].text, /follows\.write/);
      assert.equal(calls.length, 0);

      const unfollowedBlocked = await withMcpAuthorization("Bearer " + key, () =>
        tools.get("x_unfollow_user")!({ user: "4242" }),
      );
      assert.equal(unfollowedBlocked.isError, true);
      assert.equal(calls.length, 0);

      await writeAccount(xStore, {
        userId: "4004",
        username: "labsmcp",
        name: "Labs",
        scope: SCOPE,
        sealed: sealSecret(
          JSON.stringify({
            accessToken: "access-4004",
            refreshToken: "refresh-4004",
            expiresAt: Date.now() + 3_600_000,
            scope: SCOPE,
          }),
          SECRET,
        ),
        keyHash: personalKeyHash(key),
        ownerCookieHash: hashOwnerCookie("cookie-4004"),
        connectedAt: 1,
      });

      const followed = await withMcpAuthorization("Bearer " + key, () =>
        tools.get("x_follow_user")!({ user: "https://x.com/koyndex" }),
      );
      assert.equal(followed.isError, undefined);
      assert.equal(followed.structuredContent?.following, true);
      assert.equal(followed.structuredContent?.id, "4242");
      assert.equal(followed.structuredContent?.username, "@koyndex");
      assert.equal(followed.structuredContent?.account, "@labsmcp");
      assert.deepEqual(calls, [
        "GET https://api.x.com/2/users/by/username/koyndex",
        "POST https://api.x.com/2/users/4004/following",
      ]);

      const unfollowed = await withMcpAuthorization("Bearer " + key, () =>
        tools.get("x_unfollow_user")!({ user: "4242" }),
      );
      assert.equal(unfollowed.structuredContent?.following, false);
      assert.equal(unfollowed.structuredContent?.username, null);
      assert.deepEqual(calls[2], "DELETE https://api.x.com/2/users/4004/following/4242");

      globalThis.fetch = (async () =>
        json({ title: "CreditsDepleted", detail: "Your enrolled account does not have any credits." }, 402)) as typeof fetch;
      const billed = await withMcpAuthorization("Bearer " + key, () => tools.get("x_follow_user")!({ user: "4242" }));
      assert.equal(billed.isError, true);
      assert.match(billed.content[0].text, /X refused the follow \(402\)/);
      assert.equal(await xStore.get(KEYS.followDay("4004", day)), "1");
    } finally {
      globalThis.fetch = previous.fetch;
      if (previous.id === undefined) delete process.env.X_CLIENT_ID;
      else process.env.X_CLIENT_ID = previous.id;
      if (previous.secret === undefined) delete process.env.X_CLIENT_SECRET;
      else process.env.X_CLIENT_SECRET = previous.secret;
      if (previous.encryption === undefined) delete process.env.X_TOKEN_ENCRYPTION_KEY;
      else process.env.X_TOKEN_ENCRYPTION_KEY = previous.encryption;
      await xStore.del(KEYS.user("4004"));
      await xStore.del(KEYS.key(personalKeyHash(key)));
      await xStore.del(KEYS.owner(hashOwnerCookie("cookie-4004")));
      await xStore.del(KEYS.followDay("4004", day));
      await xStore.del(KEYS.unfollowDay("4004", day));
    }
  });
});
