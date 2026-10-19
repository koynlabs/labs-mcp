import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { McpServer } from "@modelcontextprotocol/server";
import { GET as webhookGet } from "../../app/api/x/webhook/route";
import { POST as mediaPost } from "../../app/api/x/media/route";
import { PUT as mediaPut } from "../../app/api/x/media/[id]/route";
import { POST as mediaFinish } from "../../app/api/x/media/[id]/finish/route";
import { registerXTools } from "../mcp/x-tools";
import { bearerToken, hashesEqual, newPersonalKey, personalKeyHash, withMcpAuthorization, xKeyMessage } from "./api-key";
import { X_SCOPES } from "./constants";
import { disconnectAccount, hashOwnerCookie, writeAccount, type XFetch } from "./oauth";
import { preparePost, publishPost } from "./post";
import { sealSecret } from "./seal";
import { createMemoryXStore, KEYS, xStore } from "./store";
import { receiveWebhook, signWebhookBody } from "./webhook";

const SCOPE = X_SCOPES.join(" ");
const SECRET = "x-token-encryption-key";

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

function assertHidden(body: string, secret: string) {
  if (secret && body.includes(secret)) throw new Error("response included a personal key");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function connect(userId: string, username: string, key: string, cookie: string) {
  await writeAccount(xStore, {
    userId,
    username,
    name: username,
    scope: SCOPE,
    sealed: sealSecret(
      JSON.stringify({
        accessToken: `access-${userId}`,
        refreshToken: `refresh-${userId}`,
        expiresAt: Date.now() + 3_600_000,
        scope: SCOPE,
      }),
      SECRET,
    ),
    keyHash: personalKeyHash(key),
    ownerCookieHash: hashOwnerCookie(cookie),
    connectedAt: 1,
  });
}

describe("personal X keys", () => {
  it("compares digests in constant time and does not treat a shared env value as a key", () => {
    const key = newPersonalKey();
    assert.equal(hashesEqual(personalKeyHash(key), personalKeyHash(key)), true);
    assert.equal(hashesEqual(personalKeyHash(key), personalKeyHash(key + "x")), false);
    assert.equal(hashesEqual("short", personalKeyHash(key)), false);
    assert.equal(bearerToken("bearer " + key), key);
    assert.equal(bearerToken("Basic " + key), null);
    assert.equal(bearerToken("Bearer " + key + " extra"), null);
    assert.match(xKeyMessage(), /\/x/);
    assert.equal(xKeyMessage().includes(key), false);
    process.env.LABS_X_API_KEY = key;
    delete process.env.LABS_X_API_KEY;
  });

  it("isolates drafts, mentions, caps, uploads, and disconnects by account", async () => {
    const tools = captureTools();
    const keyA = newPersonalKey();
    const keyB = newPersonalKey();
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
    globalThis.fetch = (async (url: string) => {
      calls.push(url);
      if (url.endsWith("/2/tweets")) return json({ data: { id: "777" } });
      throw new Error("unexpected " + url);
    }) as typeof fetch;

    try {
      await connect("1001", "cyberpsychoxx78", keyA, "cookie-a");
      await connect("2002", "otheraccount", keyB, "cookie-b");

      const status = await tools.get("x_connection_status")!({});
      assert.equal(status.structuredContent?.connected, false);
      assert.equal(JSON.stringify(status).includes("cyberpsychoxx78"), false);
      assert.match(String(status.structuredContent?.message), /\/x/);

      const link = await tools.get("x_connect_link")!({});
      assert.match(String(link.structuredContent?.url), /\/api\/x\/oauth\/start$/);
      assert.equal(link.structuredContent?.connectedAs, null);

      const refused = await tools.get("x_prepare_post")!({ text: "nope" });
      assert.equal(refused.isError, true);
      assert.match(refused.content[0].text, /\/x/);
      assert.equal(calls.length, 0);

      const wrong = await withMcpAuthorization("Bearer " + keyA + "-no", () => tools.get("x_publish_post")!({
        draft_id: "00000000-0000-4000-8000-000000000001",
      }));
      assert.equal(wrong.isError, true);
      assertHidden(JSON.stringify(wrong), keyA);
      assert.equal(calls.length, 0);

      const prepared = await withMcpAuthorization("Bearer " + keyA, () => tools.get("x_prepare_post")!({ text: "from a" }));
      assert.equal(prepared.isError, undefined);
      const draftId = String(prepared.structuredContent?.draftId);
      assert.equal(prepared.structuredContent?.account, "@cyberpsychoxx78");
      assert.equal(calls.length, 0);

      const stolen = await withMcpAuthorization("Bearer " + keyB, () => tools.get("x_publish_post")!({ draft_id: draftId }));
      assert.equal(stolen.isError, true);
      assert.match(stolen.content[0].text, /does not exist/);
      assertHidden(stolen.content[0].text, keyB);
      assert.equal(calls.length, 0);
      const still = JSON.parse((await xStore.get(KEYS.draft("1001", draftId))) ?? "{}") as { published?: unknown };
      assert.equal(still.published, undefined);

      const published = await withMcpAuthorization("Bearer " + keyA, () => tools.get("x_publish_post")!({ draft_id: draftId }));
      assert.equal(published.structuredContent?.url, "https://x.com/cyberpsychoxx78/status/777");
      assert.equal(calls.length, 1);

      const raw = JSON.stringify({
        for_user_id: "1001",
        tweet_create_events: [
          {
            id_str: "555",
            text: "hi @cyberpsychoxx78",
            created_at: "Mon Oct 19 12:00:00 +0000 2026",
            user: { id_str: "7", screen_name: "alice" },
            entities: { user_mentions: [{ id_str: "1001", screen_name: "cyberpsychoxx78" }] },
            conversation_id_str: "555",
          },
        ],
      });
      const hooked = await receiveWebhook({
        store: xStore,
        rawBody: raw,
        signature: signWebhookBody("consumer-secret", raw),
        consumerSecret: "consumer-secret",
      });
      assert.equal(hooked.body.stored, 1);
      const otherHook = await receiveWebhook({
        store: xStore,
        rawBody: raw.replace("1001", "3003"),
        signature: signWebhookBody("consumer-secret", raw.replace("1001", "3003")),
        consumerSecret: "consumer-secret",
      });
      assert.equal(otherHook.body.stored, 0);

      const inboxB = await withMcpAuthorization("Bearer " + keyB, () => tools.get("x_get_mentions")!({}));
      assert.deepEqual(inboxB.structuredContent?.mentions, []);
      const inboxA = await withMcpAuthorization("Bearer " + keyA, () => tools.get("x_get_mentions")!({}));
      assert.equal((inboxA.structuredContent?.mentions as { id: string }[])[0]?.id, "555");

      const day = "2026-10-19";
      await xStore.set(KEYS.replyDay("1001", day), "30", 60);
      const memory = createMemoryXStore();
      await writeAccount(memory, {
        userId: "1001",
        username: "cyberpsychoxx78",
        name: "Cyber",
        scope: SCOPE,
        sealed: sealSecret(
          JSON.stringify({ accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scope: SCOPE }),
          SECRET,
        ),
        keyHash: personalKeyHash(keyA),
        ownerCookieHash: hashOwnerCookie("cookie-a"),
        connectedAt: 1,
      });
      await writeAccount(memory, {
        userId: "2002",
        username: "otheraccount",
        name: "Other",
        scope: SCOPE,
        sealed: sealSecret(
          JSON.stringify({ accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scope: SCOPE }),
          SECRET,
        ),
        keyHash: personalKeyHash(keyB),
        ownerCookieHash: hashOwnerCookie("cookie-b"),
        connectedAt: 1,
      });
      await memory.set(KEYS.replyDay("1001", day), "30", 60);
      const caps = { authorDaily: 5, globalDaily: 30 };
      const config = {
        clientId: "labs-client",
        clientSecret: "labs-client-secret-value",
        encryptionSecret: SECRET,
        redirectUri: "https://labs.levercoin.lol/api/x/oauth/callback",
      };
      const quiet: XFetch = async () => {
        throw new Error("cap check must not call X");
      };
      await assert.rejects(
        () => preparePost({ store: memory, config, http: quiet, userId: "1001", now: Date.parse(`${day}T12:00:00Z`), caps }, { text: "a", replyTo: "9" }),
        /daily reply cap/,
      );
      const otherReply = await preparePost(
        { store: memory, config, http: quiet, userId: "2002", now: Date.parse(`${day}T12:00:00Z`), caps },
        { text: "b", replyTo: "9" },
      );
      assert.equal(otherReply.preview.account, "@otheraccount");
      await assert.rejects(
        () => publishPost({ store: memory, config, http: quiet, userId: "1001" }, otherReply.preview.draftId),
        /does not exist/,
      );

      const started = await withMcpAuthorization("Bearer " + keyA, async () => mediaPost(new Request("https://labs.levercoin.lol/api/x/media", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${keyA}` },
        body: JSON.stringify({ filename: "a.mp4", contentType: "video/mp4", totalBytes: 4 }),
      })));
      assert.equal(started.status, 200);
      const stage = (await started.json()) as { stageId: string };
      const blocked = await mediaPut(new Request(`https://labs.levercoin.lol/api/x/media/${stage.stageId}`, {
        method: "PUT",
        headers: { authorization: `Bearer ${keyB}`, "x-segment-index": "0" },
        body: Buffer.from("abcd"),
      }), { params: Promise.resolve({ id: stage.stageId }) });
      assert.equal(blocked.status, 400);
      const anonymous = await mediaFinish(new Request(`https://labs.levercoin.lol/api/x/media/${stage.stageId}/finish`, {
        method: "POST",
      }), { params: Promise.resolve({ id: stage.stageId }) });
      assert.equal(anonymous.status, 401);
      const anonBody = await anonymous.text();
      assertHidden(anonBody, keyA);
      assert.match(anonBody, /\/x/);

      const shared = newPersonalKey();
      process.env.LABS_X_API_KEY = shared;
      const notShared = await mediaPost(new Request("https://labs.levercoin.lol/api/x/media", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${shared}` },
        body: JSON.stringify({ filename: "a.mp4", contentType: "video/mp4", totalBytes: 4 }),
      }));
      assert.equal(notShared.status, 401);
      delete process.env.LABS_X_API_KEY;

      const configForDisconnect = config;
      const removed = await disconnectAccount(xStore, configForDisconnect, "cookie-a", async () => json({}));
      assert.equal(removed.type, "ok");
      const after = await withMcpAuthorization("Bearer " + keyA, () => tools.get("x_prepare_post")!({ text: "gone" }));
      assert.equal(after.isError, true);
      const stillB = await withMcpAuthorization("Bearer " + keyB, () => tools.get("x_connection_status")!({}));
      assert.equal(stillB.structuredContent?.username, "@otheraccount");

      process.env.X_CONSUMER_SECRET = "consumer-secret";
      const crc = await webhookGet(new Request("https://labs.levercoin.lol/api/x/webhook?crc_token=crc-token"));
      assert.equal(crc.status, 200);
      const crcBody = await crc.json() as { response_token: string };
      assert.match(crcBody.response_token, /^sha256=/);
    } finally {
      globalThis.fetch = previous.fetch;
      if (previous.id === undefined) delete process.env.X_CLIENT_ID;
      else process.env.X_CLIENT_ID = previous.id;
      if (previous.secret === undefined) delete process.env.X_CLIENT_SECRET;
      else process.env.X_CLIENT_SECRET = previous.secret;
      if (previous.encryption === undefined) delete process.env.X_TOKEN_ENCRYPTION_KEY;
      else process.env.X_TOKEN_ENCRYPTION_KEY = previous.encryption;
      delete process.env.LABS_X_API_KEY;
      delete process.env.X_CONSUMER_SECRET;
      await xStore.del(KEYS.user("1001"));
      await xStore.del(KEYS.user("2002"));
      await xStore.del(KEYS.key(personalKeyHash(keyA)));
      await xStore.del(KEYS.key(personalKeyHash(keyB)));
      await xStore.del(KEYS.owner(hashOwnerCookie("cookie-a")));
      await xStore.del(KEYS.owner(hashOwnerCookie("cookie-b")));
      await xStore.del(KEYS.replyDay("1001", "2026-10-19"));
      await xStore.del(KEYS.mention("1001", "555"));
      await xStore.del(KEYS.mentionSeen("1001", "555"));
      await xStore.del(KEYS.mentionIndex("1001"));
    }
  });
});
