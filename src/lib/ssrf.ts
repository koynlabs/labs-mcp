import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

const MAX_BYTES = 5_000_000;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 10_000;

export class SsrfError extends Error {}

function normalizeHost(hostname: string): string {
  let host = hostname.trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (host.endsWith(".")) host = host.slice(0, -1);
  return host;
}

/** True for loopback, private, link-local, CGNAT, and other non-routable ranges. */
export function isBlockedAddress(address: string): boolean {
  const ip = normalizeHost(address);
  if (ip.startsWith("::ffff:")) {
    const mapped = ip.slice("::ffff:".length);
    if (isIP(mapped) === 4) return isBlockedAddress(mapped);
  }
  if (isIP(ip) === 4) return isBlockedV4(ip);
  if (isIP(ip) === 6) return isBlockedV6(ip);
  return true;
}

function isBlockedV4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedV6(ip: string): boolean {
  if (ip === "::" || ip === "::1") return true;
  if (/^fe[89ab]/i.test(ip)) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (ip.startsWith("ff")) return true;
  if (ip.startsWith("2001:db8")) return true;
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return true;
  if (host === "localhost" || host === "localhost.localdomain" || host === "metadata.google.internal") {
    return true;
  }
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (isIP(host)) return isBlockedAddress(host);
  return false;
}

/**
 * The lookup used for the actual socket. Checking here, rather than resolving
 * and then calling fetch, closes the gap where DNS changes between the check
 * and the connect.
 */
export function safeLookup(
  hostname: string,
  options: { all?: boolean },
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
): void {
  if (isBlockedHostname(hostname)) {
    callback(Object.assign(new Error("refusing a non-public address"), { code: "ENETUNREACH" }), "", 4);
    return;
  }
  dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) {
      callback(error, "", 4);
      return;
    }
    if (addresses.length === 0 || addresses.some((entry) => isBlockedAddress(entry.address))) {
      callback(Object.assign(new Error("refusing a non-public address"), { code: "ENETUNREACH" }), "", 4);
      return;
    }
    if (options.all) {
      callback(null, addresses);
      return;
    }
    callback(null, addresses[0].address, addresses[0].family);
  });
}

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("image URL is not valid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("image URL must be http or https");
  }
  if (url.username || url.password) throw new SsrfError("image URL must not include credentials");
  if (isBlockedHostname(url.hostname)) throw new SsrfError("refusing a non-public image URL");
  return url;
}

type FetchLimits = {
  maxBytes: number;
  timeoutMs: number;
  accept: string;
  /** Used only in refusal messages. Launch images keep the original wording. */
  label: string;
};

const IMAGE_LIMITS: FetchLimits = {
  maxBytes: MAX_BYTES,
  timeoutMs: TIMEOUT_MS,
  accept: "image/*,*/*;q=0.8",
  label: "image",
};

function requestOnce(
  url: URL,
  limits: FetchLimits,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: safeLookup,
        timeout: limits.timeoutMs,
        headers: { accept: limits.accept, "user-agent": "labs" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const declared = Number(res.headers["content-length"] ?? 0);
        if (Number.isFinite(declared) && declared > limits.maxBytes) {
          req.destroy();
          reject(new SsrfError(`${limits.label} is too large`));
          return;
        }
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > limits.maxBytes) {
            req.destroy();
            reject(new SsrfError(`${limits.label} is too large`));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) });
        });
      },
    );
    req.on("error", (error) => {
      if (error.message.includes("non-public")) {
        reject(new SsrfError(`refusing a non-public ${limits.label} URL`));
      } else reject(error);
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new SsrfError(`${limits.label} fetch timed out`));
    });
    req.end();
  });
}

async function fetchLimited(
  raw: string,
  limits: FetchLimits,
): Promise<{ status: number; contentType: string | null; body: Buffer; finalUrl: string }> {
  let current = assertPublicHttpUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const result = await requestOnce(current, limits);
    const location = result.headers.location;
    if (result.status >= 300 && result.status < 400 && location && hop < MAX_REDIRECTS) {
      const next = Array.isArray(location) ? location[0] : location;
      current = assertPublicHttpUrl(new URL(next, current).href);
      continue;
    }
    const contentType = result.headers["content-type"];
    const type = Array.isArray(contentType) ? contentType[0] : contentType;
    return {
      status: result.status,
      contentType: type ?? null,
      body: result.body,
      finalUrl: current.href,
    };
  }
  throw new SsrfError("too many redirects");
}

/** Fetches an image URL, refusing private, link-local, and loopback targets on every hop. */
export async function fetchPublic(raw: string): Promise<Response> {
  const result = await fetchLimited(raw, IMAGE_LIMITS);
  return new Response(new Uint8Array(result.body), {
    status: result.status,
    headers: result.contentType ? { "content-type": result.contentType } : undefined,
  });
}

/**
 * Same refusal rules as `fetchPublic`, with a caller-chosen size cap. X video
 * is larger than a token image, and still must not be fetched from a private address.
 */
export async function fetchPublicBuffer(
  raw: string,
  options: { maxBytes: number; timeoutMs?: number; accept?: string; label?: string },
): Promise<{ body: Buffer; contentType: string | null; finalUrl: string }> {
  const result = await fetchLimited(raw, {
    maxBytes: options.maxBytes,
    timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
    accept: options.accept ?? "*/*",
    label: options.label ?? "media",
  });
  if (result.status < 200 || result.status >= 300) {
    throw new SsrfError(`${options.label ?? "media"} fetch failed (${result.status})`);
  }
  return { body: result.body, contentType: result.contentType, finalUrl: result.finalUrl };
}
