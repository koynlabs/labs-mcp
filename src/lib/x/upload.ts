import { MediaStillProcessing, XError } from "./config";
import { MEDIA_MAX_POLLS, X_API, X_CHUNK_BYTES } from "./constants";
import type { ClassifiedMedia } from "./media-type";
import type { XFetch } from "./oauth";

type ProcessingInfo = {
  state?: string;
  check_after_secs?: number;
  error?: { message?: string; name?: string };
};

type MediaData = {
  id?: string;
  media_id?: string;
  processing_info?: ProcessingInfo;
};

export type UploadOptions = {
  bytes: Buffer;
  media: ClassifiedMedia;
  accessToken: string;
  http: XFetch;
  /** Seconds, as X reports them. Tests record this instead of waiting. */
  sleep?: (seconds: number) => Promise<void>;
  chunkBytes?: number;
  maxPolls?: number;
  /** Set when a previous publish already finalized this upload. */
  resumeMediaId?: string;
};

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (res.status >= 400) throw new XError(mediaError(parsed, res.status));
  return parsed ?? {};
}

function mediaError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as {
      detail?: string;
      title?: string;
      error?: string;
      errors?: { message?: string }[];
    };
    const message = record.detail || record.errors?.find((item) => item.message)?.message || record.title || record.error;
    if (message) return `X media upload failed (${status}): ${String(message).slice(0, 300)}`;
  }
  return `X media upload failed (${status}).`;
}

function mediaIdOf(body: unknown): string {
  const data = (body as { data?: MediaData })?.data;
  const id = data?.id ?? data?.media_id;
  if (!id) throw new XError("X did not return a media id.");
  return String(id);
}

function processingOf(body: unknown): ProcessingInfo | null {
  const info = (body as { data?: MediaData })?.data?.processing_info;
  return info ?? null;
}

async function authorized(
  http: XFetch,
  accessToken: string,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("accept", "application/json");
  const res = await http(url, { ...init, headers });
  return readJson(res);
}

function blobPart(bytes: Buffer): Blob {
  return new Blob([new Uint8Array(bytes)]);
}

async function waitUntilReady(
  http: XFetch,
  accessToken: string,
  mediaId: string,
  info: ProcessingInfo | null,
  sleep: (seconds: number) => Promise<void>,
  maxPolls: number,
): Promise<void> {
  let pending = info;
  let polls = 0;
  while (pending && (pending.state === "pending" || pending.state === "in_progress")) {
    if (polls >= maxPolls) throw new MediaStillProcessing(mediaId);
    const seconds = pending.check_after_secs ?? 1;
    await sleep(seconds);
    polls += 1;
    const body = await authorized(
      http,
      accessToken,
      `${X_API}/2/media/upload?command=STATUS&media_id=${encodeURIComponent(mediaId)}`,
      { method: "GET" },
    );
    pending = processingOf(body);
  }
  if (pending?.state === "failed") {
    const reason = pending.error?.message || pending.error?.name || "processing failed";
    throw new XError(
      `X could not process the media: ${reason}. Video posts need an MP4 with H.264 video and AAC audio.`,
    );
  }
  if (pending && pending.state !== "succeeded") {
    throw new XError(`X media processing ended in an unexpected state (${pending.state ?? "unknown"}).`);
  }
}

/**
 * Images use one POST /2/media/upload. GIF and video use INIT, APPEND,
 * FINALIZE, then STATUS until processing succeeds. The simple endpoint does
 * not accept video, and a GIF can be larger than that endpoint allows.
 */
export async function uploadMedia(options: UploadOptions): Promise<string> {
  const sleep = options.sleep ?? defaultSleep;
  const maxPolls = options.maxPolls ?? MEDIA_MAX_POLLS;
  if (options.resumeMediaId) {
    await waitUntilReady(options.http, options.accessToken, options.resumeMediaId, { state: "pending", check_after_secs: 0 }, sleep, maxPolls);
    return options.resumeMediaId;
  }

  if (options.media.kind === "image") {
    const form = new FormData();
    form.set("media", blobPart(options.bytes), fileName(options.media));
    form.set("media_category", options.media.category);
    const body = await authorized(options.http, options.accessToken, `${X_API}/2/media/upload`, {
      method: "POST",
      body: form,
    });
    const mediaId = mediaIdOf(body);
    await waitUntilReady(options.http, options.accessToken, mediaId, processingOf(body), sleep, maxPolls);
    return mediaId;
  }

  const init = await authorized(options.http, options.accessToken, `${X_API}/2/media/upload/initialize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      media_type: options.media.mime,
      total_bytes: options.bytes.length,
      media_category: options.media.category,
    }),
  });
  const mediaId = mediaIdOf(init);
  const chunkBytes = options.chunkBytes ?? X_CHUNK_BYTES;
  let segment = 0;
  for (let offset = 0; offset < options.bytes.length; offset += chunkBytes) {
    const slice = options.bytes.subarray(offset, Math.min(offset + chunkBytes, options.bytes.length));
    const form = new FormData();
    form.set("segment_index", String(segment));
    form.set("media", blobPart(slice), `segment-${segment}`);
    await authorized(options.http, options.accessToken, `${X_API}/2/media/upload/${mediaId}/append`, {
      method: "POST",
      body: form,
    });
    segment += 1;
  }
  const finalized = await authorized(
    options.http,
    options.accessToken,
    `${X_API}/2/media/upload/${mediaId}/finalize`,
    { method: "POST" },
  );
  await waitUntilReady(options.http, options.accessToken, mediaId, processingOf(finalized), sleep, maxPolls);
  return mediaId;
}

function fileName(media: ClassifiedMedia): string {
  if (media.kind === "video") return "video.mp4";
  if (media.kind === "gif") return "image.gif";
  if (media.mime === "image/png") return "image.png";
  if (media.mime === "image/webp") return "image.webp";
  return "image.jpg";
}

async function defaultSleep(seconds: number): Promise<void> {
  const capped = Math.min(Math.max(seconds, 0), 5);
  await new Promise((resolve) => setTimeout(resolve, capped * 1000));
}
