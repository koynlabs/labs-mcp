import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET as trendsGet } from "../../app/api/x/trends/route";
import type { XFetch } from "./oauth";
import { createMemoryXStore, type XStore } from "./store";
import {
  cachedCryptoPosts,
  DEFAULT_TAPE_DAILY_CAP,
  excerpt,
  postsFromSearch,
  TAPE_CACHE_CONTROL,
  TAPE_FRESH_MS,
  TAPE_KEYS,
  TAPE_UNCACHED_CONTROL,
  tapeDailyCap,
  tapeEnabled,
  tapeLogin,
  tapeMaySearch,
  tapeUtcDay,
  type CtPost,
} from "./trends";

describe("crypto tape", () => {
  it("drops link stubs and keeps one line", () => {
    assert.equal(excerpt("launching now https://t.co/abc  watch"), "launching now watch");
    assert.equal(excerpt("a".repeat(200)).endsWith("…"), true);
    assert.equal(excerpt("a".repeat(200)).length <= 140, true);
  });

  it("joins the author and the photo, and ignores other image hosts", () => {
    const posts = postsFromSearch({
      data: [
        {
          id: "10",
          text: "new coin on pump https://t.co/abc",
          author_id: "7",
          attachments: { media_keys: ["m1"] },
        },
        { id: "11", text: "   ", author_id: "7" },
      ],
      includes: {
        users: [
          {
            id: "7",
            username: "ct",
            name: "CT",
            profile_image_url: "https://pbs.twimg.com/profile_images/a_normal.jpg",
          },
        ],
        media: [
          { media_key: "m1", url: "https://pbs.twimg.com/media/shot.jpg" },
          { media_key: "m2", url: "https://evil.example/shot.jpg" },
        ],
      },
    });
    assert.equal(posts.length, 1);
    assert.equal(posts[0]?.username, "ct");
    assert.equal(posts[0]?.text, "new coin on pump");
    assert.equal(posts[0]?.url, "https://x.com/ct/status/10");
    assert.equal(posts[0]?.avatar, "https://pbs.twimg.com/profile_images/a_bigger.jpg");
    assert.equal(posts[0]?.image, "https://pbs.twimg.com/media/shot.jpg");
  });

  it("signs the strip with the API key pair", () => {
    const login = tapeLogin({
      X_CONSUMER_KEY: "api-key",
      X_CONSUMER_SECRET: "api-secret",
      X_CLIENT_ID: "client",
      X_CLIENT_SECRET: "client-secret-long-enough",
    });
    assert.equal(login?.id, "api-key");
    assert.equal(login?.tokenUrl, "https://api.x.com/oauth2/token");
  });

  it("falls back to the OAuth client when the API secret is absent", () => {
    assert.equal(
      tapeLogin({ X_CLIENT_ID: "client", X_CLIENT_SECRET: "client-secret-long-enough" })?.id,
      "client",
    );
    assert.equal(tapeLogin({ X_CONSUMER_KEY: "api-key", X_CLIENT_SECRET: "client-secret-long-enough" }), null);
  });

  it("keeps at most ten cards", () => {
    const data = Array.from({ length: 12 }, (_, index) => ({
      id: String(index + 1),
      text: `coin ${index}`,
      author_id: "7",
    }));
    const posts = postsFromSearch({
      data,
      includes: { users: [{ id: "7", username: "ct", name: "CT" }] },
    });
    assert.equal(posts.length, 10);
    assert.equal(posts[0]?.id, "1");
    assert.equal(posts[9]?.id, "10");
  });
});

const CREDS = {
  X_CONSUMER_KEY: "api-key",
  X_CONSUMER_SECRET: "api-secret",
};
const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);

function savedPost(id = "1"): CtPost {
  return {
    id,
    text: "saved coin",
    url: `https://x.com/ct/status/${id}`,
    username: "ct",
    name: "CT",
    avatar: null,
    image: null,
  };
}

function liveBody(id = "99") {
  return {
    data: [{ id, text: "fresh coin https://t.co/abc", author_id: "7" }],
    includes: {
      users: [
        {
          id: "7",
          username: "ct",
          name: "CT",
          profile_image_url: "https://pbs.twimg.com/profile_images/a_normal.jpg",
        },
      ],
      media: [{ media_key: "m1", url: "https://pbs.twimg.com/media/shot.jpg" }],
    },
  };
}

type SearchScript = { ok: true; body: unknown } | { ok: false; status: number } | { ok: false; throw: true };

function scriptedFetch(search: SearchScript, calls: string[]): XFetch {
  return async (url) => {
    calls.push(url);
    if (url.includes("/2/tweets/search/recent")) {
      if ("throw" in search) throw new Error("network");
      if (!search.ok) return new Response("no", { status: search.status });
      return Response.json(search.body);
    }
    return Response.json({ access_token: "tok", expires_in: 7200 });
  };
}

function searchCalls(calls: string[]): string[] {
  return calls.filter((url) => url.includes("/2/tweets/search/recent"));
}

async function seed(store: XStore, posts: CtPost[], fetchedAt: number) {
  await store.set(TAPE_KEYS.posts, JSON.stringify({ posts, fetchedAt }), 48 * 60 * 60);
}

function load(
  store: XStore,
  fetchImpl: XFetch,
  now: number,
  env: Record<string, string | undefined> = CREDS,
  sharedStore = true,
) {
  return cachedCryptoPosts({
    store,
    fetchImpl,
    now,
    env,
    sharedStore,
    tokenSlot: { current: null },
  });
}

describe("crypto tape budget", () => {
  it("reads the kill switch and the daily cap", () => {
    assert.equal(tapeEnabled({}), true);
    assert.equal(tapeEnabled({ X_TAPE_ENABLED: "true" }), true);
    assert.equal(tapeEnabled({ X_TAPE_ENABLED: " OFF " }), false);
    assert.equal(tapeEnabled({ X_TAPE_ENABLED: "0" }), false);
    assert.equal(tapeEnabled({ X_TAPE_ENABLED: "no" }), false);
    assert.equal(tapeDailyCap({}), DEFAULT_TAPE_DAILY_CAP);
    assert.equal(tapeDailyCap({ X_TAPE_DAILY_CAP: "0" }), 0);
    assert.equal(tapeDailyCap({ X_TAPE_DAILY_CAP: "12" }), 12);
    assert.equal(tapeDailyCap({ X_TAPE_DAILY_CAP: "3.5" }), DEFAULT_TAPE_DAILY_CAP);
    assert.equal(tapeDailyCap({ X_TAPE_DAILY_CAP: "nope" }), DEFAULT_TAPE_DAILY_CAP);
    assert.equal(tapeMaySearch({}, false), true);
    assert.equal(tapeMaySearch({ VERCEL: "1" }, false), false);
    assert.equal(tapeMaySearch({ VERCEL: "1" }, true), true);
  });

  it("serves a fresh row without calling X", async () => {
    const store = createMemoryXStore();
    const calls: string[] = [];
    await seed(store, [savedPost()], NOW);
    const tape = await load(store, scriptedFetch({ ok: true, body: liveBody() }, calls), NOW + 1_000);
    assert.equal(searchCalls(calls).length, 0);
    assert.equal(tape.posts[0]?.id, "1");
    assert.equal(tape.cacheControl, TAPE_CACHE_CONTROL);
  });

  it("searches once an hour and asks for ten posts with the author", async () => {
    const store = createMemoryXStore();
    const calls: string[] = [];
    const fetchImpl = scriptedFetch({ ok: true, body: liveBody() }, calls);
    const first = await load(store, fetchImpl, NOW);
    const second = await load(store, fetchImpl, NOW + TAPE_FRESH_MS - 1);
    assert.equal(searchCalls(calls).length, 1);
    const url = new URL(searchCalls(calls)[0] ?? "https://example.invalid");
    assert.equal(url.searchParams.get("max_results"), "10");
    assert.equal(url.searchParams.get("expansions"), "author_id,attachments.media_keys");
    assert.match(url.searchParams.get("user.fields") ?? "", /profile_image_url/);
    assert.equal(first.posts[0]?.text, "fresh coin");
    assert.equal(first.posts[0]?.avatar, "https://pbs.twimg.com/profile_images/a_bigger.jpg");
    assert.equal(second.posts[0]?.id, first.posts[0]?.id);
    assert.equal(await store.get(TAPE_KEYS.calls(tapeUtcDay(NOW))), "1");
  });

  it("does not let two callers search the same stale row", async () => {
    const store = createMemoryXStore();
    const calls: string[] = [];
    const fetchImpl = scriptedFetch({ ok: true, body: liveBody() }, calls);
    await Promise.all([load(store, fetchImpl, NOW), load(store, fetchImpl, NOW)]);
    assert.equal(searchCalls(calls).length, 1);
    const saved = JSON.parse((await store.get(TAPE_KEYS.posts)) ?? "{}") as { posts: CtPost[] };
    assert.equal(saved.posts.length, 1);
  });

  it("serves the saved row when the lock is already held, and does not cache that miss", async () => {
    const store = createMemoryXStore();
    const calls: string[] = [];
    await seed(store, [savedPost()], NOW - TAPE_FRESH_MS - 1);
    await store.set(TAPE_KEYS.lock, "1", 30);
    const tape = await load(store, scriptedFetch({ ok: true, body: liveBody() }, calls), NOW);
    assert.equal(searchCalls(calls).length, 0);
    assert.equal(tape.posts[0]?.id, "1");
    assert.equal(tape.cacheControl, TAPE_UNCACHED_CONTROL);
  });

  it("stops at the daily cap and still serves the saved row", async () => {
    const store = createMemoryXStore();
    const calls: string[] = [];
    await seed(store, [savedPost()], NOW - TAPE_FRESH_MS - 1);
    await store.set(TAPE_KEYS.calls(tapeUtcDay(NOW)), "1", 3600);
    const tape = await load(
      store,
      scriptedFetch({ ok: true, body: liveBody() }, calls),
      NOW,
      { ...CREDS, X_TAPE_DAILY_CAP: "1" },
    );
    assert.equal(searchCalls(calls).length, 0);
    assert.equal(tape.posts[0]?.id, "1");
  });

  it("keeps the saved row after a 429 and does not retry inside the hour", async () => {
    const store = createMemoryXStore();
    const calls: string[] = [];
    await seed(store, [savedPost()], NOW - TAPE_FRESH_MS - 1);
    const fetchImpl = scriptedFetch({ ok: false, status: 429 }, calls);
    const failed = await load(store, fetchImpl, NOW);
    const again = await load(store, fetchImpl, NOW + 5 * 60 * 1000);
    await load(store, fetchImpl, NOW + 2 * TAPE_FRESH_MS);
    assert.equal(searchCalls(calls).length, 2);
    assert.equal(failed.posts[0]?.id, "1");
    assert.equal(again.posts[0]?.id, "1");
    assert.equal(await store.get(TAPE_KEYS.halt(tapeUtcDay(NOW))), null);
  });

  it("backs off for an hour when the app token is refused and does not count a search", async () => {
    const store = createMemoryXStore();
    const calls: string[] = [];
    const fetchImpl: XFetch = async (url) => {
      calls.push(url);
      return new Response("no", { status: 401 });
    };
    await seed(store, [savedPost()], NOW - TAPE_FRESH_MS - 1);
    const failed = await load(store, fetchImpl, NOW);
    await load(store, fetchImpl, NOW + 60_000);
    assert.equal(searchCalls(calls).length, 0);
    assert.equal(calls.length, 1);
    assert.equal(failed.posts[0]?.id, "1");
    assert.equal(await store.get(TAPE_KEYS.calls(tapeUtcDay(NOW))), null);
  });

  it("stops for the UTC day after credits are depleted", async () => {
    const store = createMemoryXStore();
    const calls: string[] = [];
    await seed(store, [savedPost()], NOW - TAPE_FRESH_MS - 1);
    const fetchImpl = scriptedFetch({ ok: false, status: 402 }, calls);
    await load(store, fetchImpl, NOW);
    await load(store, fetchImpl, NOW + 2 * TAPE_FRESH_MS);
    const nextDay = Date.UTC(2026, 10, 1, 1, 0, 0);
    await load(store, scriptedFetch({ ok: true, body: liveBody("100") }, calls), nextDay);
    assert.equal(searchCalls(calls).length, 2);
    assert.equal(await store.get(TAPE_KEYS.halt(tapeUtcDay(NOW))), "1");
    assert.equal(await store.get(TAPE_KEYS.halt(tapeUtcDay(nextDay))), null);
  });

  it("does not retry immediately when the search throws", async () => {
    const store = createMemoryXStore();
    const calls: string[] = [];
    await seed(store, [savedPost()], NOW - TAPE_FRESH_MS - 1);
    const fetchImpl = scriptedFetch({ ok: false, throw: true }, calls);
    const failed = await load(store, fetchImpl, NOW);
    await load(store, fetchImpl, NOW + 60_000);
    assert.equal(searchCalls(calls).length, 1);
    assert.equal(failed.posts[0]?.id, "1");
  });

  it("skips X when the kill switch is off, the cap is zero, or the store is not shared", async () => {
    const calls: string[] = [];
    const fetchImpl = scriptedFetch({ ok: true, body: liveBody() }, calls);
    const off = createMemoryXStore();
    await seed(off, [savedPost()], NOW - TAPE_FRESH_MS - 1);
    const killed = await load(off, fetchImpl, NOW, { ...CREDS, X_TAPE_ENABLED: "off" });
    assert.deepEqual(killed.posts, []);

    const zero = createMemoryXStore();
    await seed(zero, [savedPost()], NOW - TAPE_FRESH_MS - 1);
    const capped = await load(zero, fetchImpl, NOW, { ...CREDS, X_TAPE_DAILY_CAP: "0" });
    assert.equal(capped.posts[0]?.id, "1");

    const local = createMemoryXStore();
    await seed(local, [savedPost()], NOW - TAPE_FRESH_MS - 1);
    const unshared = await load(local, fetchImpl, NOW, CREDS, false);
    assert.equal(unshared.posts[0]?.id, "1");
    assert.equal(searchCalls(calls).length, 0);
  });

  it("cdn-caches the route for an hour when it is not spending", async () => {
    assert.match(TAPE_CACHE_CONTROL, /s-maxage=3600/);
    assert.match(TAPE_CACHE_CONTROL, /stale-while-revalidate=86400/);
    assert.equal(TAPE_CACHE_CONTROL.includes("no-store"), false);
    if (tapeLogin()) return;
    const res = await trendsGet();
    assert.equal(res.headers.get("cache-control"), TAPE_CACHE_CONTROL);
    const body = (await res.json()) as { posts?: unknown };
    assert.ok(Array.isArray(body.posts));
  });
});
