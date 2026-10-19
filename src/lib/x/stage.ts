import { createHash, randomUUID } from "node:crypto";
import { XError } from "./config";
import { DRAFT_TTL_SECONDS, STAGE_CHUNK_BYTES, VIDEO_MAX_BYTES } from "./constants";
import { classifyMedia, type ClassifiedMedia } from "./media-type";
import { KEYS, type XStore } from "./store";

export type StagedUpload = {
  id: string;
  filename: string;
  declaredType: string;
  totalBytes: number;
  received: number;
  nextIndex: number;
  createdAt: number;
};

export type StoredUpload = {
  id: string;
  filename: string;
  mime: string;
  kind: ClassifiedMedia["kind"];
  bytes: number;
  sha256: string;
  createdAt: number;
};

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function stageBytes(store: XStore, bytes: Buffer, filename: string, declaredType?: string): Promise<StoredUpload> {
  const media = classifyMedia(bytes, declaredType);
  return persistUpload(store, bytes, media, filename || "upload");
}

export async function startStage(
  store: XStore,
  input: { filename: string; contentType: string; totalBytes: number },
  now = Date.now(),
): Promise<StagedUpload> {
  if (!Number.isInteger(input.totalBytes) || input.totalBytes <= 0) {
    throw new XError("totalBytes must be the file size in bytes.");
  }
  if (input.totalBytes > VIDEO_MAX_BYTES) {
    throw new XError(`File is too large. The limit is ${Math.round(VIDEO_MAX_BYTES / (1024 * 1024))}MB.`);
  }
  const stage: StagedUpload = {
    id: randomUUID(),
    filename: input.filename.slice(0, 200) || "upload",
    declaredType: input.contentType.slice(0, 100) || "application/octet-stream",
    totalBytes: input.totalBytes,
    received: 0,
    nextIndex: 0,
    createdAt: now,
  };
  await store.set(KEYS.stage(stage.id), JSON.stringify(stage), DRAFT_TTL_SECONDS);
  return stage;
}

export async function appendStage(store: XStore, id: string, index: number, chunk: Buffer): Promise<StagedUpload> {
  const stage = await readStage(store, id);
  if (!Number.isInteger(index) || index < 0) throw new XError("segment index must be a whole number.");
  if (index !== stage.nextIndex) {
    throw new XError(`Expected segment ${stage.nextIndex}, received ${index}. Send the file in order.`);
  }
  if (chunk.length === 0) throw new XError("Segment is empty.");
  if (chunk.length > STAGE_CHUNK_BYTES) {
    throw new XError(`Segment is larger than ${STAGE_CHUNK_BYTES} bytes. Split the file into 4MB pieces.`);
  }
  if (stage.received + chunk.length > stage.totalBytes) {
    throw new XError("Segments add up to more than totalBytes.");
  }
  await store.set(KEYS.stageChunk(id, index), chunk.toString("base64"), DRAFT_TTL_SECONDS);
  const next: StagedUpload = {
    ...stage,
    received: stage.received + chunk.length,
    nextIndex: stage.nextIndex + 1,
  };
  await store.set(KEYS.stage(id), JSON.stringify(next), DRAFT_TTL_SECONDS);
  return next;
}

export async function finishStage(store: XStore, id: string): Promise<StoredUpload> {
  const stage = await readStage(store, id);
  if (stage.received !== stage.totalBytes) {
    throw new XError(`Upload is ${stage.received} of ${stage.totalBytes} bytes. Send the remaining segments, then finish.`);
  }
  const parts: Buffer[] = [];
  for (let index = 0; index < stage.nextIndex; index += 1) {
    const raw = await store.get(KEYS.stageChunk(id, index));
    if (!raw) throw new XError("A segment expired before the upload finished. Start again.");
    parts.push(Buffer.from(raw, "base64"));
  }
  const bytes = Buffer.concat(parts);
  const media = classifyMedia(bytes, stage.declaredType);
  const upload = await persistUpload(store, bytes, media, stage.filename);
  await store.del(KEYS.stage(id));
  for (let index = 0; index < stage.nextIndex; index += 1) {
    await store.del(KEYS.stageChunk(id, index));
  }
  return upload;
}

async function readStage(store: XStore, id: string): Promise<StagedUpload> {
  const raw = await store.get(KEYS.stage(id));
  if (!raw) throw new XError("No such upload. Start it again.");
  return JSON.parse(raw) as StagedUpload;
}

async function persistUpload(
  store: XStore,
  bytes: Buffer,
  media: ClassifiedMedia,
  filename: string,
): Promise<StoredUpload> {
  const upload: StoredUpload = {
    id: randomUUID(),
    filename,
    mime: media.mime,
    kind: media.kind,
    bytes: bytes.length,
    sha256: sha256(bytes),
    createdAt: Date.now(),
  };
  await store.set(KEYS.blob(upload.id), bytes.toString("base64"), DRAFT_TTL_SECONDS);
  await store.set(KEYS.upload(upload.id), JSON.stringify(upload), DRAFT_TTL_SECONDS);
  return upload;
}

export async function readUpload(store: XStore, id: string): Promise<{ meta: StoredUpload; bytes: Buffer }> {
  const raw = await store.get(KEYS.upload(id));
  const blob = await store.get(KEYS.blob(id));
  if (!raw || !blob) throw new XError("That upload expired. Upload the file again.");
  const meta = JSON.parse(raw) as StoredUpload;
  const bytes = Buffer.from(blob, "base64");
  if (sha256(bytes) !== meta.sha256) throw new XError("The stored upload does not match its checksum.");
  await store.set(KEYS.blob(id), blob, DRAFT_TTL_SECONDS);
  await store.set(KEYS.upload(id), raw, DRAFT_TTL_SECONDS);
  return { meta, bytes };
}
