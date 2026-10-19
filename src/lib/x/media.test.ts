import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MediaStillProcessing } from "./config";
import { VIDEO_MAX_BYTES, X_CHUNK_BYTES } from "./constants";
import { classifyMedia, mediaLimit, segmentCount, sniffMedia } from "./media-type";
import { appendStage, finishStage, startStage } from "./stage";
import { createMemoryXStore } from "./store";
import { uploadMedia } from "./upload";
import type { XFetch } from "./oauth";

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

function jpeg(length = 16): Buffer {
  const bytes = Buffer.alloc(length);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return bytes;
}

function gif(): Buffer {
  return Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(8)]);
}

describe("media types", () => {
  it("sniffs images, GIFs, and MP4 and rejects everything else", () => {
    assert.equal(sniffMedia(jpeg())?.mime, "image/jpeg");
    const png = Buffer.alloc(8);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(classifyMedia(png).category, "tweet_image");
    const webp = Buffer.alloc(12);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBP", 8, "ascii");
    assert.equal(classifyMedia(webp).mime, "image/webp");
    assert.equal(classifyMedia(gif()).category, "tweet_gif");
    assert.equal(classifyMedia(mp4()).category, "tweet_video");
    assert.throws(() => classifyMedia(Buffer.from("not media")), /JPEG, PNG, WEBP, GIF, or MP4/);
    assert.throws(() => classifyMedia(jpeg(), "video/mp4"), /does not match/);
  });

  it("caps each kind and plans a 20MB video as five 4MB segments", () => {
    const over = Buffer.alloc(mediaLimit("image") + 1);
    over[0] = 0xff;
    over[1] = 0xd8;
    over[2] = 0xff;
    assert.throws(() => classifyMedia(over), /limit/);
    assert.equal(segmentCount(20 * 1024 * 1024, X_CHUNK_BYTES), 5);
    assert.equal(mediaLimit("video"), VIDEO_MAX_BYTES);
    assert.equal(segmentCount(VIDEO_MAX_BYTES, X_CHUNK_BYTES), 7);
  });
});

describe("chunked upload", () => {
  it("runs INIT, APPEND, FINALIZE, and STATUS until processing succeeds", async () => {
    const bytes = mp4(10);
    const seen: { url: string; init?: RequestInit }[] = [];
    const slept: number[] = [];
    let polls = 0;
    const http: XFetch = async (url, init) => {
      seen.push({ url, init });
      if (url.endsWith("/initialize")) return json({ data: { id: "900" } });
      if (url.endsWith("/append")) return json({});
      if (url.endsWith("/finalize")) {
        return json({ data: { id: "900", processing_info: { state: "pending", check_after_secs: 1 } } });
      }
      if (url.includes("command=STATUS")) {
        polls += 1;
        if (polls === 1) {
          return json({ data: { processing_info: { state: "in_progress", check_after_secs: 2 } } });
        }
        return json({ data: { processing_info: { state: "succeeded" } } });
      }
      throw new Error(url);
    };

    const id = await uploadMedia({
      bytes,
      media: classifyMedia(bytes),
      accessToken: "access-token",
      http,
      sleep: async (seconds) => {
        slept.push(seconds);
      },
      chunkBytes: 4,
      maxPolls: 4,
    });

    assert.equal(id, "900");
    assert.deepEqual(slept, [1, 2]);
    assert.equal(seen[0].url, "https://api.x.com/2/media/upload/initialize");
    const init = JSON.parse(String(seen[0].init?.body)) as {
      media_type: string;
      total_bytes: number;
      media_category: string;
    };
    assert.deepEqual(init, { media_type: "video/mp4", total_bytes: 10, media_category: "tweet_video" });
    assert.equal(new Headers(seen[0].init?.headers).get("authorization"), "Bearer access-token");

    const appends = seen.filter((call) => call.url.endsWith("/append"));
    assert.equal(appends.length, 3);
    for (let index = 0; index < appends.length; index += 1) {
      const form = appends[index].init?.body as FormData;
      assert.equal(form.get("segment_index"), String(index));
      const media = form.get("media");
      assert.ok(media instanceof Blob);
      assert.equal(media.size, index === 2 ? 2 : 4);
    }
    assert.equal(seen.some((call) => call.url.endsWith("/finalize")), true);
    const status = seen.find((call) => call.url.includes("command=STATUS"));
    assert.ok(status);
    assert.equal(new URL(status.url).searchParams.get("media_id"), "900");
  });

  it("uploads a GIF with tweet_gif and an image with one simple request", async () => {
    const gifBytes = gif();
    const gifCalls: string[] = [];
    let gifCategory = "";
    const gifHttpWithBody: XFetch = async (url, init) => {
      gifCalls.push(url);
      if (url.endsWith("/initialize")) gifCategory = JSON.parse(String(init?.body)).media_category;
      return json({ data: { id: "gif1" } });
    };
    await uploadMedia({
      bytes: gifBytes,
      media: classifyMedia(gifBytes),
      accessToken: "token",
      http: gifHttpWithBody,
      sleep: async () => {},
      chunkBytes: 4,
    });
    assert.equal(gifCalls[0], "https://api.x.com/2/media/upload/initialize");
    assert.equal(gifCategory, "tweet_gif");

    const image = jpeg();
    const imageCalls: { url: string; init?: RequestInit }[] = [];
    const imageHttp: XFetch = async (url, init) => {
      imageCalls.push({ url, init });
      return json({ data: { id: "img1" } });
    };
    const imageId = await uploadMedia({
      bytes: image,
      media: classifyMedia(image),
      accessToken: "token",
      http: imageHttp,
      sleep: async () => {},
    });
    assert.equal(imageId, "img1");
    assert.equal(imageCalls.length, 1);
    assert.equal(imageCalls[0].url, "https://api.x.com/2/media/upload");
    const form = imageCalls[0].init?.body as FormData;
    assert.equal(form.get("media_category"), "tweet_image");
  });

  it("surfaces a failed processing state and a poll that is still running", async () => {
    const bytes = mp4(8);
    const failed: XFetch = async (url) => {
      if (url.endsWith("/initialize")) return json({ data: { id: "1" } });
      if (url.endsWith("/append")) return json({});
      if (url.endsWith("/finalize")) {
        return json({
          data: { id: "1", processing_info: { state: "failed", error: { message: "Unsupported video codec" } } },
        });
      }
      throw new Error(url);
    };
    await assert.rejects(
      () =>
        uploadMedia({
          bytes,
          media: classifyMedia(bytes),
          accessToken: "token",
          http: failed,
          sleep: async () => {},
          chunkBytes: 4,
        }),
      /Unsupported video codec/,
    );

    const stalled: XFetch = async (url) => {
      if (url.endsWith("/initialize")) return json({ data: { id: "2" } });
      if (url.endsWith("/append")) return json({});
      if (url.endsWith("/finalize")) {
        return json({ data: { id: "2", processing_info: { state: "pending", check_after_secs: 0 } } });
      }
      return json({ data: { processing_info: { state: "in_progress", check_after_secs: 0 } } });
    };
    await assert.rejects(
      () =>
        uploadMedia({
          bytes,
          media: classifyMedia(bytes),
          accessToken: "token",
          http: stalled,
          sleep: async () => {},
          chunkBytes: 8,
          maxPolls: 1,
        }),
      MediaStillProcessing,
    );
  });
});

describe("file staging", () => {
  it("assembles ordered segments into an upload id", async () => {
    const store = createMemoryXStore();
    const file = mp4(10);
    const stage = await startStage(store, {
      filename: "launch.mp4",
      contentType: "video/mp4",
      totalBytes: file.length,
    });
    await appendStage(store, stage.id, 0, file.subarray(0, 6));
    await assert.rejects(() => appendStage(store, stage.id, 0, file.subarray(6)), /Expected segment 1/);
    await appendStage(store, stage.id, 1, file.subarray(6));
    const upload = await finishStage(store, stage.id);
    assert.equal(upload.kind, "video");
    assert.equal(upload.mime, "video/mp4");
    assert.equal(upload.bytes, 10);
    assert.equal(await store.get(`x:stage:${stage.id}`), null);
  });
});
