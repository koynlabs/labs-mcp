import { SITE_URL } from "../config";

/** Confidential-client OAuth 2.0 with PKCE. One connected account posts as itself. */
export const X_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access",
  "media.write",
] as const;

export const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
export const X_REVOKE_URL = "https://api.x.com/2/oauth2/revoke";
export const X_API = "https://api.x.com";

/** Weighted cap X enforces on a standard post. URLs count as 23. */
export const POST_MAX_WEIGHTED = 280;

/** Images go through the simple v2 upload. X rejects images above this. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** GIFs can be larger than the simple upload, so they use the chunked flow. */
export const GIF_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Our fetch cap, chosen so a roughly 20MB promo MP4 fits with a little room.
 * X itself allows much larger video; we do not pull that through this server.
 */
export const VIDEO_MAX_BYTES = 25 * 1024 * 1024;

/** X allows up to 5MB per APPEND segment. 4MB stays under that and under typical body limits. */
export const X_CHUNK_BYTES = 4 * 1024 * 1024;

/** A staged file is uploaded to us in pieces so a 20MB MP4 is not one request body. */
export const STAGE_CHUNK_BYTES = 4 * 1024 * 1024;

export const OAUTH_TTL_SECONDS = 10 * 60;
export const DRAFT_TTL_SECONDS = 30 * 60;

/** Polls inside one publish call. A later publish resumes the same draft. */
export const MEDIA_MAX_POLLS = 8;

export const X_OWNER_COOKIE = "labs_x_owner";

export function xCallbackUrl(): string {
  return `${SITE_URL}/api/x/oauth/callback`;
}

export function xConnectUrl(): string {
  return `${SITE_URL}/api/x/oauth/start`;
}

export function xPostUrl(username: string, id: string): string {
  return `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(id)}`;
}
