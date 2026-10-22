import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { preparePostInput, publishPostInput } from "../mcp/x-tools";
import { type XConfig } from "./config";
import { X_SCOPES } from "./constants";
import { hashOwnerCookie, writeAccount, type XFetch } from "./oauth";
import { preparePost, publishPost } from "./post";
import { sealSecret } from "./seal";
import { stageBytes } from "./stage";
import { createMemoryXStore, KEYS } from "./store";
import { weightedLength } from "./text";

const SCOPE = X_SCOPES.join(" ");

const config: XConfig = {
  clientId: "labs-client",
  clientSecret: "labs-client-secret-value",
  encryptionSecret: "x-token-encryption-key",
  redirectUri: "https://labs.koyn.trade/api/x/oauth/callback",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mp4(length = 32): Buffer {
  const bytes = Buffer.alloc(length);
  bytes.write("ftyp", 4, "ascii");
  bytes.write("isom", 8, "ascii");
  return bytes;
}

async function connect(store: ReturnType<typeof createMemoryXStore>, expiresAt = Date.now() + 3_600_000) {
  await writeAccount(store, {
    userId: "1001",
    username: "cyberpsychoxx78",
    name: "Cyber",
    scope: SCOPE,
    sealed: sealSecret(
      JSON.stringify({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt, scope: SCOPE }),
      config.encryptionSecret,
    ),
    ownerCookieHash: hashOwnerCookie("cookie"),
    connectedAt: 1,
  });
}

describe("post length", () => {
  it("counts URLs as 23 and emoji as 2, and stops at 280", () => {
    assert.equal(weightedLength("a".repeat(280)), 280);
    assert.equal(weightedLength("a".repeat(281)), 281);
    assert.equal(weightedLength("see https://example.com/this/is/a/very/long/path"), weightedLength("see ") + 23);
    assert.equal(weightedLength("https://example.com."), 24);
    assert.equal(weightedLength("😀"), 2);
    assert.equal(weightedLength("https://a.co https://b.co"), 47);
  });
});

describe("prepare and publish", () => {
  it("prepares an exact preview and does not post until publish", async () => {
    const store = createMemoryXStore();
    await connect(store);
    const file = mp4(12);
    const http: XFetch = async () => {
      throw new Error("prepare must not call X");
    };
    const { preview } = await preparePost(
      {
        store,
        config,
        userId: "1001",
        http,
        loadUrl: async () => file,
      },
      {
        text: "  launch day  ",
        media: "https://cdn.example.com/launch.mp4",
        replyTo: "42",
        quote: "43",
      },
    );
    assert.equal(preview.posted, false);
    assert.equal(preview.account, "@cyberpsychoxx78");
    assert.equal(preview.preview.text, "  launch day  ");
    assert.equal(preview.preview.replyTo, "42");
    assert.equal(preview.preview.quote, "43");
    assert.equal(preview.preview.media?.kind, "video");
    assert.equal(preview.preview.media?.bytes, 12);
    assert.match(preview.nextStep, /Nothing has been posted/);

    const calls: { url: string; body?: string }[] = [];
    const publishHttp: XFetch = async (url, init) => {
      calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.includes("/initialize")) return json({ data: { id: "555" } });
      if (url.includes("/append") || url.endsWith("/finalize")) return json({ data: { id: "555" } });
      if (url.endsWith("/2/tweets")) return json({ data: { id: "777" } });
      throw new Error(url);
    };
    const published = await publishPost(
      { store, config, userId: "1001", http: publishHttp, loadUrl: async () => file, sleep: async () => {}, chunkBytes: 8 },
      preview.draftId,
    );
    assert.equal(published.url, "https://x.com/cyberpsychoxx78/status/777");
    const tweet = calls.find((call) => call.url.endsWith("/2/tweets"));
    assert.ok(tweet?.body);
    assert.deepEqual(JSON.parse(tweet.body), {
      text: "  launch day  ",
      media: { media_ids: ["555"] },
      reply: { in_reply_to_tweet_id: "42" },
      quote_tweet_id: "43",
    });

    const again = await publishPost(
      { store, config, userId: "1001", http: publishHttp, loadUrl: async () => file, sleep: async () => {} },
      preview.draftId,
    );
    assert.equal(again.url, published.url);
    assert.equal(calls.filter((call) => call.url.endsWith("/2/tweets")).length, 1);
  });

  it("rejects an over-long post, a private URL, and media that changed", async () => {
    const store = createMemoryXStore();
    await connect(store);
    await assert.rejects(
      () => preparePost({ store, config, userId: "1001", http: fetch }, { text: "a".repeat(281) }),
      /280/,
    );
    await assert.rejects(
      () => preparePost({ store, config, userId: "1001", http: fetch }, { text: "" }),
      /text, media, or both/,
    );
    await assert.rejects(
      () => preparePost({ store, config, userId: "1001", http: fetch }, { media: "https://127.0.0.1/launch.mp4" }),
      /non-public/,
    );
    await assert.rejects(
      () => preparePost({ store, config, userId: "1001", http: fetch, loadUrl: async () => Buffer.from("hello") }, { media: "https://cdn.example.com/a.mp4" }),
      /JPEG, PNG, WEBP, GIF, or MP4/,
    );

    const { preview } = await preparePost(
      { store, config, userId: "1001", http: fetch, loadUrl: async () => mp4(16) },
      { text: "ok", media: "https://cdn.example.com/a.mp4" },
    );
    let tweets = 0;
    await assert.rejects(
      () =>
        publishPost(
          {
            store,
            config,
            userId: "1001",
            http: async (url) => {
              if (url.endsWith("/2/tweets")) tweets += 1;
              return json({ data: { id: "1" } });
            },
            loadUrl: async () => {
              const changed = mp4(16);
              changed[15] = 0x5a;
              return changed;
            },
            sleep: async () => {},
          },
          preview.draftId,
        ),
      /changed after the preview/,
    );
    assert.equal(tweets, 0);
  });

  it("resumes video processing and does not upload again after a failed publish", async () => {
    const store = createMemoryXStore();
    await connect(store);
    const file = mp4(8);
    const { preview } = await preparePost(
      { store, config, userId: "1001", http: fetch, loadUrl: async () => file },
      { text: "tape", media: "https://cdn.example.com/tape.mp4" },
    );

    let inits = 0;
    let statuses = 0;
    let tweets = 0;
    const http: XFetch = async (url) => {
      if (url.endsWith("/initialize")) {
        inits += 1;
        return json({ data: { id: "555" } });
      }
      if (url.includes("/append")) return json({});
      if (url.endsWith("/finalize")) {
        return json({ data: { id: "555", processing_info: { state: "pending", check_after_secs: 0 } } });
      }
      if (url.includes("command=STATUS")) {
        statuses += 1;
        if (statuses < 2) return json({ data: { processing_info: { state: "in_progress", check_after_secs: 0 } } });
        return json({ data: { processing_info: { state: "succeeded" } } });
      }
      if (url.endsWith("/2/tweets")) {
        tweets += 1;
        if (tweets === 1) return json({ detail: "try again" }, 500);
        return json({ data: { id: "888" } });
      }
      throw new Error(url);
    };

    await assert.rejects(
      () =>
        publishPost(
          { store, config, userId: "1001", http, loadUrl: async () => file, sleep: async () => {}, chunkBytes: 8, maxPolls: 0 },
          preview.draftId,
        ),
      /still processing/,
    );
    assert.equal(tweets, 0);
    assert.equal(inits, 1);
    const saved = JSON.parse((await store.get(KEYS.draft("1001", preview.draftId))) ?? "{}") as { pendingMediaId?: string };
    assert.equal(saved.pendingMediaId, "555");

    await assert.rejects(
      () =>
        publishPost(
          { store, config, userId: "1001", http, loadUrl: async () => file, sleep: async () => {}, chunkBytes: 8, maxPolls: 4 },
          preview.draftId,
        ),
      /try again/,
    );
    assert.equal(inits, 1);
    assert.equal(tweets, 1);

    const published = await publishPost(
      { store, config, userId: "1001", http, loadUrl: async () => Buffer.alloc(0), sleep: async () => {}, chunkBytes: 8 },
      preview.draftId,
    );
    assert.equal(published.url, "https://x.com/cyberpsychoxx78/status/888");
    assert.equal(inits, 1);
    assert.equal(tweets, 2);
  });

  it("accepts an uploaded file id and a text-only post", async () => {
    const store = createMemoryXStore();
    await connect(store);
    const upload = await stageBytes(store, "1001", mp4(20), "launch.mp4", "video/mp4");
    const { preview } = await preparePost(
      { store, config, userId: "1001", http: fetch },
      { media: upload.id },
    );
    assert.equal(preview.preview.text, "");
    assert.equal(preview.preview.media?.kind, "video");

    const parsed = preparePostInput.parse({
      text: "hi",
      media: "https://cdn.example.com/a.png",
      reply_to: "1",
      schedule: "tomorrow",
    });
    assert.equal("schedule" in parsed, false);
    assert.equal(publishPostInput.parse({ draft_id: preview.draftId }).draft_id, preview.draftId);
    assert.throws(() => preparePostInput.parse({ media: "http://cdn.example.com/a.png" }));
  });
});
