import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { McpServer } from "@modelcontextprotocol/server";
import { GET as webhookGet } from "../../app/api/x/webhook/route";
import { POST as mediaPost } from "../../app/api/x/media/route";
import { PUT as mediaPut } from "../../app/api/x/media/[id]/route";
import { POST as mediaFinish } from "../../app/api/x/media/[id]/finish/route";
import { registerXTools } from "../mcp/x-tools";
import { rejectXHttp, withMcpAuthorization, xApiAuthorized, xApiKeyMessage } from "./api-key";
import { X_SCOPES } from "./constants";
import { hashOwnerCookie, writeAccount } from "./oauth";
import { sealSecret } from "./seal";
import { KEYS, xStore } from "./store";

const KEY = "labs-x-api-key-test-value";

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

async function withKey<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.LABS_X_API_KEY;
  if (value === undefined) delete process.env.LABS_X_API_KEY;
  else process.env.LABS_X_API_KEY = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.LABS_X_API_KEY;
    else process.env.LABS_X_API_KEY = previous;
  }
}

function assertHidden(body: string, secret: string) {
  if (body.includes(secret)) throw new Error("response included the api key");
}

describe("X API key", () => {
  it("fails closed when unset and rejects a missing or wrong bearer", async () => {
    await withKey(undefined, async () => {
      assert.deepEqual(xApiAuthorized("Bearer " + KEY), { ok: false, reason: "disabled" });
      assert.match(xApiKeyMessage("disabled"), /LABS_X_API_KEY/);
    });
    await withKey(KEY, async () => {
      assert.deepEqual(xApiAuthorized(null), { ok: false, reason: "unauthorized" });
      assert.deepEqual(xApiAuthorized("Basic " + KEY), { ok: false, reason: "unauthorized" });
      assert.deepEqual(xApiAuthorized("Bearer " + KEY + "-no"), { ok: false, reason: "unauthorized" });
      assert.deepEqual(xApiAuthorized("Bearer " + KEY.slice(0, 8)), { ok: false, reason: "unauthorized" });
      assert.deepEqual(xApiAuthorized("bearer " + KEY), { ok: true });
      assert.deepEqual(await withMcpAuthorization("Bearer " + KEY, async () => {
        await Promise.resolve();
        return xApiAuthorized();
      }), { ok: true });
      assert.deepEqual(xApiAuthorized(), { ok: false, reason: "unauthorized" });
      const refused = rejectXHttp("Bearer nope");
      assert.equal(refused?.status, 401);
      const body = await refused!.text();
      assertHidden(body, KEY);
      assertHidden(body, "nope");
      assert.match(body, /Authorization: Bearer/);
    });
  });

  it("refuses every x_* tool before it can post, and hides the account without the key", async () => {
    const tools = captureTools();
    assert.equal(tools.size, 6);
    const previous = {
      id: process.env.X_CLIENT_ID,
      secret: process.env.X_CLIENT_SECRET,
    };
    process.env.X_CLIENT_ID = "labs-client";
    process.env.X_CLIENT_SECRET = "labs-client-secret-value";
    const scope = X_SCOPES.join(" ");
    await writeAccount(xStore, {
      userId: "1001",
      username: "cyberpsychoxx78",
      name: "Cyber",
      scope,
      sealed: sealSecret(
        JSON.stringify({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt: Date.now() + 60_000, scope }),
        "labs-client-secret-value",
      ),
      ownerCookieHash: hashOwnerCookie("cookie"),
      connectedAt: 1,
    });
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      throw new Error("X tools must not call out");
    }) as typeof fetch;
    try {
      await withKey(undefined, async () => {
        const status = await tools.get("x_connection_status")!({});
        assert.equal(status.isError, undefined);
        assert.deepEqual(
          { configured: status.structuredContent?.configured, connected: status.structuredContent?.connected },
          { configured: true, connected: true },
        );
        assert.equal(status.structuredContent?.username, undefined);
        assertHidden(JSON.stringify(status), "cyberpsychoxx78");
        const published = await tools.get("x_publish_post")!({
          draft_id: "00000000-0000-4000-8000-000000000001",
        });
        assert.equal(published.isError, true);
        assert.match(published.content[0].text, /disabled/);
        assert.equal(calls.length, 0);
      });

      await withKey(KEY, async () => {
        const wrong = await withMcpAuthorization("Bearer " + KEY + "-no", () =>
          tools.get("x_prepare_post")!({ text: "launch" }),
        );
        assert.equal(wrong.isError, true);
        assert.match(wrong.content[0].text, /Authorization: Bearer/);
        assertHidden(JSON.stringify(wrong), KEY);
        assert.equal(calls.length, 0);

        const names = [
          "x_connect_link",
          "x_get_mentions",
          "x_sync_mentions",
          "x_prepare_post",
          "x_publish_post",
        ] as const;
        for (const name of names) {
          const result = await tools.get(name)!({});
          assert.equal(result.isError, true, name);
          assert.match(result.content[0].text, /LABS_X_API_KEY/);
        }
        assert.equal(calls.length, 0);

        const allowed = await withMcpAuthorization("Bearer " + KEY, () => tools.get("x_connection_status")!({}));
        assert.equal(allowed.structuredContent?.username, "@cyberpsychoxx78");
        assertHidden(JSON.stringify(allowed), KEY);
      });
    } finally {
      globalThis.fetch = original;
      await xStore.del(KEYS.account);
      if (previous.id === undefined) delete process.env.X_CLIENT_ID;
      else process.env.X_CLIENT_ID = previous.id;
      if (previous.secret === undefined) delete process.env.X_CLIENT_SECRET;
      else process.env.X_CLIENT_SECRET = previous.secret;
    }
  });

  it("gates media staging and does not require the key on the webhook", async () => {
    const body = JSON.stringify({ filename: "clip.mp4", contentType: "video/mp4", totalBytes: 32 });
    await withKey(undefined, async () => {
      const response = await mediaPost(new Request("https://labs.levercoin.lol/api/x/media", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + KEY },
        body,
      }));
      assert.equal(response.status, 503);
      assert.equal(await response.json().then((payload: { stageId?: string }) => payload.stageId), undefined);
    });
    await withKey(KEY, async () => {
      const wrong = await mediaPut(
        new Request("https://labs.levercoin.lol/api/x/media/stage", {
          method: "PUT",
          headers: { authorization: "Bearer wrong", "x-segment-index": "0" },
          body: Buffer.from("nope"),
        }),
        { params: Promise.resolve({ id: "missing" }) },
      );
      assert.equal(wrong.status, 401);
      const finish = await mediaFinish(
        new Request("https://labs.levercoin.lol/api/x/media/stage/finish", { method: "POST" }),
        { params: Promise.resolve({ id: "missing" }) },
      );
      assert.equal(finish.status, 401);
      const ok = await mediaPost(new Request("https://labs.levercoin.lol/api/x/media", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + KEY },
        body,
      }));
      assert.equal(ok.status, 200);
      const payload = (await ok.json()) as { stageId?: string };
      assert.match(payload.stageId ?? "", /^[0-9a-f-]{36}$/i);
      if (payload.stageId) await xStore.del(KEYS.stage(payload.stageId));
      const previousSecret = process.env.X_CONSUMER_SECRET;
      process.env.X_CONSUMER_SECRET = "consumer-secret";
      try {
        const crc = await webhookGet(new Request("https://labs.levercoin.lol/api/x/webhook?crc_token=crc-token"));
        assert.equal(crc.status, 200);
        assert.equal((await crc.json() as { response_token?: string }).response_token?.startsWith("sha256="), true);
      } finally {
        if (previousSecret === undefined) delete process.env.X_CONSUMER_SECRET;
        else process.env.X_CONSUMER_SECRET = previousSecret;
      }
    });
  });
});
