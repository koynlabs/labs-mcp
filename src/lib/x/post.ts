import { createHash, randomUUID } from "node:crypto";
import { fetchPublicBuffer } from "../ssrf";
import { MediaStillProcessing, XError, type XConfig } from "./config";
import { DRAFT_TTL_SECONDS, VIDEO_MAX_BYTES, X_API, xPostUrl } from "./constants";
import { classifyMedia, type ClassifiedMedia } from "./media-type";
import { ensureAccessToken, readAccount, type StoredXAccount, type XFetch } from "./oauth";
import { readUpload } from "./stage";
import { KEYS, type XStore } from "./store";
import { assertPostLength } from "./text";
import { uploadMedia } from "./upload";
import { loadReplyTarget, recordPublishedReply, replyCapsFromEnv, type ReplyCaps } from "./webhook";

export type DraftSource =
  | { type: "url"; url: string }
  | { type: "upload"; uploadId: string };

export type XDraft = {
  id: string;
  userId: string;
  text: string;
  replyTo?: string;
  quote?: string;
  replyAuthorId?: string;
  replyAuthorHandle?: string;
  media?: {
    kind: ClassifiedMedia["kind"];
    mime: string;
    bytes: number;
    sha256: string;
    source: DraftSource;
  };
  pendingMediaId?: string;
  /** True once X has finished processing pendingMediaId. A retry must not upload again. */
  mediaReady?: boolean;
  published?: { id: string; url: string };
  createdAt: number;
};

const TWEET_ID = /^[0-9]{1,20}$/;

export function parseMediaRef(media: string): DraftSource {
  if (media.startsWith("https://")) return { type: "url", url: media };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(media)) {
    return { type: "upload", uploadId: media };
  }
  throw new XError("media must be an https URL or an upload id from POST /api/x/media.");
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function loadUrlBytes(url: string): Promise<Buffer> {
  const fetched = await fetchPublicBuffer(url, {
    maxBytes: VIDEO_MAX_BYTES,
    timeoutMs: 60_000,
    accept: "image/*,video/mp4,*/*;q=0.1",
    label: "media",
  });
  return fetched.body;
}

export type PostDeps = {
  store: XStore;
  config: XConfig;
  http: XFetch;
  userId: string;
  loadUrl?: (url: string) => Promise<Buffer>;
  now?: number;
  sleep?: (seconds: number) => Promise<void>;
  chunkBytes?: number;
  maxPolls?: number;
  caps?: ReplyCaps;
};

async function accountOf(deps: PostDeps): Promise<StoredXAccount> {
  const account = await readAccount(deps.store, deps.userId);
  if (!account) throw new XError("X is not connected. Open /x, connect your X account, and use the personal key.");
  return account;
}

export async function preparePost(
  deps: PostDeps,
  input: { text?: string; media?: string; replyTo?: string; quote?: string },
): Promise<{ draft: XDraft; preview: ReturnType<typeof previewOf> }> {
  const account = await accountOf(deps);
  const text = input.text ?? "";
  if (input.replyTo && !TWEET_ID.test(input.replyTo)) throw new XError("reply_to must be a post id.");
  if (input.quote && !TWEET_ID.test(input.quote)) throw new XError("quote must be a post id.");
  const length = assertPostLength(text);
  const source = input.media ? parseMediaRef(input.media) : undefined;
  if (!text.trim() && !source) throw new XError("A post needs text, media, or both.");
  const now = deps.now ?? Date.now();
  let replyAuthorId: string | undefined;
  let replyAuthorHandle: string | undefined;
  if (input.replyTo) {
    const target = await loadReplyTarget(
      deps.store,
      input.replyTo,
      account.userId,
      now,
      deps.caps ?? replyCapsFromEnv(),
    );
    replyAuthorId = target.authorId;
    replyAuthorHandle = target.authorHandle;
  }

  let media: XDraft["media"];
  if (source) {
    const bytes = await loadSource(deps, account.userId, source);
    const classified = classifyMedia(bytes);
    media = {
      kind: classified.kind,
      mime: classified.mime,
      bytes: bytes.length,
      sha256: sha256(bytes),
      source,
    };
  }

  const draft: XDraft = {
    id: randomUUID(),
    userId: account.userId,
    text,
    replyTo: input.replyTo,
    quote: input.quote,
    replyAuthorId,
    replyAuthorHandle,
    media,
    createdAt: now,
  };
  await deps.store.set(KEYS.draft(account.userId, draft.id), JSON.stringify(draft), DRAFT_TTL_SECONDS);
  return { draft, preview: previewOf(draft, account.username, length) };
}

async function loadSource(deps: PostDeps, userId: string, source: DraftSource): Promise<Buffer> {
  if (source.type === "upload") {
    const upload = await readUpload(deps.store, userId, source.uploadId);
    return upload.bytes;
  }
  const load = deps.loadUrl ?? loadUrlBytes;
  return load(source.url);
}

export function previewOf(draft: XDraft, username: string, weightedLength: number) {
  return {
    draftId: draft.id,
    account: `@${username}`,
    posted: false as const,
    preview: {
      text: draft.text,
      weightedLength,
      replyTo: draft.replyTo ?? null,
      replyToAuthor: draft.replyAuthorHandle ? `@${draft.replyAuthorHandle}` : null,
      quote: draft.quote ?? null,
      media: draft.media
        ? {
            kind: draft.media.kind,
            mime: draft.media.mime,
            bytes: draft.media.bytes,
            source: draft.media.source.type === "url" ? draft.media.source.url : draft.media.source.uploadId,
            codecNote:
              draft.media.kind === "video"
                ? "MP4 container. X requires H.264 video and AAC audio."
                : null,
          }
        : null,
    },
    expiresInSeconds: DRAFT_TTL_SECONDS,
    nextStep:
      "Nothing has been posted. Show this preview to the user. Call x_publish_post with this draftId only after they confirm this exact text and media.",
  };
}

export async function publishPost(
  deps: PostDeps,
  draftId: string,
): Promise<{ id: string; url: string; text: string; username: string; draftId: string; posted: true }> {
  const caller = await accountOf(deps);
  const raw = await deps.store.get(KEYS.draft(caller.userId, draftId));
  if (!raw) throw new XError("That draft expired or does not exist. Prepare it again.");
  const draft = JSON.parse(raw) as XDraft;
  if (draft.userId !== caller.userId) throw new XError("That draft expired or does not exist. Prepare it again.");
  if (draft.published) {
    return {
      id: draft.published.id,
      url: draft.published.url,
      text: draft.text,
      username: usernameFromUrl(draft.published.url),
      draftId: draft.id,
      posted: true,
    };
  }
  assertPostLength(draft.text);
  const now = deps.now ?? Date.now();
  const caps = deps.caps ?? replyCapsFromEnv();
  let replyAuthorId = draft.replyAuthorId;
  if (draft.replyTo) {
    const target = await loadReplyTarget(deps.store, draft.replyTo, caller.userId, now, caps);
    replyAuthorId = target.authorId ?? draft.replyAuthorId;
  }

  const { accessToken, account } = await ensureAccessToken(deps.store, deps.config, deps.http, caller.userId, now);
  let mediaId = draft.mediaReady ? draft.pendingMediaId : undefined;
  if (draft.media && !mediaId) {
    const bytes = draft.pendingMediaId ? null : await loadSource(deps, account.userId, draft.media.source);
    if (bytes) {
      if (sha256(bytes) !== draft.media.sha256) {
        throw new XError("The media changed after the preview. Prepare the post again. Nothing was posted.");
      }
      const classified = classifyMedia(bytes);
      if (classified.kind !== draft.media.kind || classified.mime !== draft.media.mime) {
        throw new XError("The media type changed after the preview. Prepare the post again. Nothing was posted.");
      }
    }
    try {
      mediaId = await uploadMedia({
        bytes: bytes ?? Buffer.alloc(0),
        media: {
          kind: draft.media.kind,
          mime: draft.media.mime,
          category:
            draft.media.kind === "video" ? "tweet_video" : draft.media.kind === "gif" ? "tweet_gif" : "tweet_image",
          bytes: draft.media.bytes,
        },
        accessToken,
        http: deps.http,
        sleep: deps.sleep,
        chunkBytes: deps.chunkBytes,
        maxPolls: deps.maxPolls,
        resumeMediaId: draft.pendingMediaId,
      });
    } catch (error) {
      if (error instanceof MediaStillProcessing) {
        draft.pendingMediaId = error.mediaId;
        draft.mediaReady = false;
        await deps.store.set(KEYS.draft(account.userId, draft.id), JSON.stringify(draft), DRAFT_TTL_SECONDS);
        throw new XError(
          `X is still processing the media for draft ${draft.id}. Call x_publish_post with this same draft id. Nothing has been posted.`,
        );
      }
      if (draft.pendingMediaId && error instanceof XError && error.message.includes("could not process")) {
        delete draft.pendingMediaId;
        draft.mediaReady = false;
        await deps.store.set(KEYS.draft(account.userId, draft.id), JSON.stringify(draft), DRAFT_TTL_SECONDS);
      }
      throw error;
    }
    draft.pendingMediaId = mediaId;
    draft.mediaReady = true;
    await deps.store.set(KEYS.draft(account.userId, draft.id), JSON.stringify(draft), DRAFT_TTL_SECONDS);
  }

  const payload: Record<string, unknown> = { text: draft.text };
  if (mediaId) payload.media = { media_ids: [mediaId] };
  if (draft.replyTo) payload.reply = { in_reply_to_tweet_id: draft.replyTo };
  if (draft.quote) payload.quote_tweet_id = draft.quote;

  const res = await deps.http(`${X_API}/2/tweets`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const bodyText = await res.text();
  let body: { data?: { id?: string } } = {};
  if (bodyText) {
    try {
      body = JSON.parse(bodyText) as { data?: { id?: string }; detail?: string; title?: string };
    } catch {
      body = {};
    }
  }
  if (!res.ok || !body.data?.id) {
    const detail = (body as { detail?: string; title?: string }).detail || (body as { title?: string }).title;
    throw new XError(
      detail
        ? `X did not publish the post: ${detail.slice(0, 300)} Call x_publish_post again with this draft.`
        : "X did not publish the post. Call x_publish_post again with this draft.",
    );
  }

  const url = xPostUrl(account.username, body.data.id);
  draft.published = { id: body.data.id, url };
  await deps.store.set(KEYS.draft(account.userId, draft.id), JSON.stringify(draft), DRAFT_TTL_SECONDS);
  if (draft.replyTo) await recordPublishedReply(deps.store, account.userId, draft.replyTo, replyAuthorId, now);
  return {
    id: body.data.id,
    url,
    text: draft.text,
    username: account.username,
    draftId: draft.id,
    posted: true,
  };
}

function usernameFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[0] ?? "";
  } catch {
    return "";
  }
}
