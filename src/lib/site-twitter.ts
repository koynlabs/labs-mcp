/**
 * Public X profile for the site chrome and twitter card metadata.
 * Display only. This is not the account connected for MCP posting.
 *
 * NEXT_PUBLIC_TWITTER accepts a handle, an @handle, or an x.com / twitter.com
 * profile URL. Unset and placeholder values return null so the site omits the link.
 */

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

/** Template values an operator might leave in an env form. Not real accounts. */
const PLACEHOLDERS = new Set([
  "placeholder",
  "changeme",
  "change_me",
  "change-me",
  "yourhandle",
  "your_handle",
  "your-handle",
  "yourname",
  "your_name",
  "yourtwitter",
  "your_twitter",
  "handle",
  "username",
  "todo",
  "tbd",
  "none",
  "null",
  "undefined",
  "n/a",
  "na",
]);

export type TwitterProfile = {
  /** Screen name, without @. */
  handle: string;
  /** @handle, for twitter:site and twitter:creator. */
  at: string;
  /** Absolute https://x.com profile URL. */
  url: string;
};

function isPlaceholder(handle: string): boolean {
  return PLACEHOLDERS.has(handle.toLowerCase());
}

function handleFromProfileUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const host = url.hostname.replace(/\.$/, "").toLowerCase().replace(/^www\./, "");
  if (host !== "x.com" && host !== "twitter.com" && host !== "mobile.twitter.com") {
    return null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 1) return null;
  const segment = parts[0] ?? "";
  return segment.startsWith("@") ? segment.slice(1) : segment;
}

function looksLikeProfileUrl(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) ||
    value.startsWith("//") ||
    /^(?:www\.)?(?:x|twitter)\.com\//i.test(value) ||
    /^mobile\.twitter\.com\//i.test(value)
  );
}

/** Parse a handle, @handle, or profile URL. Null when unset, placeholder, or not a profile. */
export function parseTwitter(raw: string | null | undefined): TwitterProfile | null {
  if (raw == null) return null;
  const value = raw.trim();
  if (!value) return null;

  let handle: string | null;
  if (looksLikeProfileUrl(value)) {
    const absolute = value.startsWith("//")
      ? `https:${value}`
      : /^https?:\/\//i.test(value)
        ? value
        : `https://${value}`;
    handle = handleFromProfileUrl(absolute);
  } else if (value.startsWith("@")) {
    handle = value.slice(1);
  } else {
    handle = value;
  }

  if (!handle || !HANDLE.test(handle) || isPlaceholder(handle)) return null;
  return {
    handle,
    at: `@${handle}`,
    url: `https://x.com/${handle}`,
  };
}

function rawTwitter(raw?: string | null): string | null | undefined {
  return raw === undefined ? process.env.NEXT_PUBLIC_TWITTER : raw;
}

/** @handle derived from NEXT_PUBLIC_TWITTER, or null. */
export function twitterHandle(raw?: string | null): string | null {
  return parseTwitter(rawTwitter(raw))?.at ?? null;
}

/** Absolute https://x.com URL derived from NEXT_PUBLIC_TWITTER, or null. */
export function twitterUrl(raw?: string | null): string | null {
  return parseTwitter(rawTwitter(raw))?.url ?? null;
}

/** Profile for the footer and metadata, or null when the env is unset or a placeholder. */
export function twitterProfile(raw?: string | null): TwitterProfile | null {
  return parseTwitter(rawTwitter(raw));
}
