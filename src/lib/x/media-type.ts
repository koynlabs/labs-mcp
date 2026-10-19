import { GIF_MAX_BYTES, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from "./constants";
import { XError } from "./config";

export type MediaKind = "image" | "gif" | "video";

export type MediaCategory = "tweet_image" | "tweet_gif" | "tweet_video";

export type ClassifiedMedia = {
  kind: MediaKind;
  mime: string;
  category: MediaCategory;
  bytes: number;
};

const LIMITS: Record<MediaKind, number> = {
  image: IMAGE_MAX_BYTES,
  gif: GIF_MAX_BYTES,
  video: VIDEO_MAX_BYTES,
};

export function mediaLimit(kind: MediaKind): number {
  return LIMITS[kind];
}

export function segmentCount(totalBytes: number, chunkBytes: number): number {
  if (totalBytes <= 0) return 0;
  return Math.ceil(totalBytes / chunkBytes);
}

function ascii(bytes: Buffer, start: number, length: number): string {
  if (bytes.length < start + length) return "";
  return bytes.subarray(start, start + length).toString("ascii");
}

/** Sniff the container. The declared type is only a hint and cannot widen this. */
export function sniffMedia(bytes: Buffer): { kind: MediaKind; mime: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: "image", mime: "image/jpeg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { kind: "image", mime: "image/png" };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { kind: "image", mime: "image/webp" };
  }
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    return { kind: "gif", mime: "image/gif" };
  }
  if (ascii(bytes, 4, 4) === "ftyp") {
    return { kind: "video", mime: "video/mp4" };
  }
  return null;
}

const DECLARED: Record<string, MediaKind> = {
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "gif",
  "video/mp4": "video",
};

export function classifyMedia(bytes: Buffer, declaredType?: string): ClassifiedMedia {
  if (bytes.length === 0) throw new XError("Media file is empty.");
  const sniffed = sniffMedia(bytes);
  if (!sniffed) {
    throw new XError(
      "Media must be a JPEG, PNG, WEBP, GIF, or MP4. X video posts need an MP4 with H.264 video and AAC audio.",
    );
  }
  const declared = declaredType?.split(";")[0]?.trim().toLowerCase();
  if (declared && declared !== "application/octet-stream" && DECLARED[declared] && DECLARED[declared] !== sniffed.kind) {
    throw new XError(
      `File content is ${sniffed.mime}, which does not match the declared type ${declared}.`,
    );
  }
  const limit = LIMITS[sniffed.kind];
  if (bytes.length > limit) {
    const mb = Math.round(limit / (1024 * 1024));
    throw new XError(`${sniffed.kind} is ${bytes.length} bytes. The limit here is ${mb}MB.`);
  }
  const category: MediaCategory =
    sniffed.kind === "video" ? "tweet_video" : sniffed.kind === "gif" ? "tweet_gif" : "tweet_image";
  return { kind: sniffed.kind, mime: sniffed.mime, category, bytes: bytes.length };
}
