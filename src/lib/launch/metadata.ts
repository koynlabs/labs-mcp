import { randomUUID } from "node:crypto";
import { baseUrl, PINATA } from "../config";
import { assertPublicHttpUrl, fetchPublic, SsrfError } from "../ssrf";
import { putMetadata } from "../store";
import type { LaunchInput } from "./input";

export type Metadata = {
  uri: string;
  /** Where the JSON actually lives, so the caller knows what it is trusting. */
  host: "caller" | "ipfs" | "labs";
  /** Banner URL written into the JSON. Unset when the caller supplied the URI. */
  banner?: string;
};

/**
 * pump.fun's coin page banner is not a create_v2 argument. The instruction
 * stores name, symbol, and this metadata URI. The banner shown on the coin
 * page is a separate pump.fun record, set only at creation by
 * `POST https://frontend-api-v3.pump.fun/coins/add-banner` with
 * `{ mint, banner }`, and it cannot be edited later. labs does not call that
 * endpoint. When labs builds the metadata JSON, the banner URL is stored on
 * it as `banner`.
 */
export const BANNER_LIMIT =
  "pump.fun create_v2 stores only the metadata URI and has no banner argument. The coin-page banner is a separate pump.fun record, set only at creation by POST https://frontend-api-v3.pump.fun/coins/add-banner with { mint, banner }, and it cannot be changed later. labs does not call that endpoint. When labs builds the metadata JSON, the banner URL is stored on it as banner.";

export type CoinMetadata = {
  name: string;
  symbol: string;
  description: string;
  image: string;
  showName: true;
  twitter?: string;
  telegram?: string;
  website?: string;
  banner?: string;
};

/** Metadata JSON written on-chain by reference. `assets` overrides URLs after pinning. */
export function metadataDocument(
  input: LaunchInput,
  assets: { image?: string; banner?: string } = {},
): CoinMetadata {
  const banner = assets.banner ?? input.bannerUrl;
  return {
    name: input.name,
    symbol: input.symbol,
    description: input.description ?? "",
    image: assets.image ?? input.imageUrl,
    showName: true,
    ...(input.twitter ? { twitter: input.twitter } : {}),
    ...(input.telegram ? { telegram: input.telegram } : {}),
    ...(input.website ? { website: input.website } : {}),
    ...(banner ? { banner } : {}),
  };
}

/** Uploads one file to Pinata and returns its CID. */
async function pinFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("network", "public");
  form.append("file", file);

  const response = await fetch(PINATA.upload, {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA.jwt}` },
    body: form,
  });
  if (!response.ok) {
    throw new Error(
      `pinning to IPFS failed (${response.status}): ${await response.text()}`,
    );
  }
  const body = (await response.json()) as { data?: { cid?: string } };
  if (!body.data?.cid) throw new Error("the pinning service returned no CID");
  return body.data.cid;
}

function mediaType(value: string | null | undefined): string | undefined {
  const mime = value?.split(";")[0]?.trim().toLowerCase();
  if (!mime || mime === "application/octet-stream") return undefined;
  return mime;
}

/**
 * Pins an image or GIF unless it is already on IPFS. Same rules as the coin
 * image: public http(s) only, and the fetch refuses anything over 5MB.
 */
async function pinAsset(url: string, filename: string): Promise<string> {
  try {
    assertPublicHttpUrl(url);
  } catch (error) {
    if (error instanceof SsrfError) throw new Error(error.message);
    throw error;
  }
  if (url.includes("/ipfs/")) return url;

  const source = await fetchPublic(url);
  if (!source.ok) {
    throw new Error(`could not read the image at ${url}`);
  }
  const blob = await source.blob();
  const type = mediaType(blob.type || source.headers.get("content-type"));
  const cid = await pinFile(new File([blob], filename, type ? { type } : undefined));
  return `${PINATA.gateway}/${cid}`;
}

/**
 * Pins the image, the optional banner, and then the metadata JSON that points
 * at them, so none of them depend on a host the creator might take down. A
 * file that is already on IPFS is left where it is.
 */
async function pinToIpfs(input: LaunchInput): Promise<{ uri: string; banner?: string }> {
  const image = await pinAsset(input.imageUrl, `${input.symbol}-image`);
  const banner = input.bannerUrl
    ? await pinAsset(input.bannerUrl, `${input.symbol}-banner`)
    : undefined;
  const metadata = JSON.stringify(metadataDocument(input, { image, banner }));
  const cid = await pinFile(
    new File([metadata], `${input.symbol}-metadata.json`, { type: "application/json" }),
  );
  return { uri: `${PINATA.gateway}/${cid}`, banner };
}

/**
 * Where a launch's metadata JSON comes from.
 *
 * Notably *not* pump.fun's own `/api/ipfs`: it answers server-side requests
 * with a redirect to a block page, so the endpoint the old CLI used from a
 * laptop cannot be called from a deployment. Only the metadata URI matters
 * on-chain, and any reachable URI works, so this resolves one three ways:
 *
 *  - a URI the caller already has, used as-is;
 *  - IPFS, if a pinning JWT is configured — the durable option, and the one
 *    to use in production;
 *  - otherwise labs serves the JSON itself, which is honest but only lasts as
 *    long as labs does. The caller is told which of the three it got.
 */
export async function resolveMetadata(input: LaunchInput): Promise<Metadata> {
  if (input.metadataUri) {
    return { uri: input.metadataUri, host: "caller" };
  }

  if (PINATA.jwt) {
    const pinned = await pinToIpfs(input);
    return { uri: pinned.uri, host: "ipfs", banner: pinned.banner };
  }

  const document = metadataDocument(input);
  const id = randomUUID();
  await putMetadata(id, document);
  const uri = `${baseUrl()}/api/metadata/${id}`;
  await assertReachable(uri);
  return { uri, host: "labs", banner: document.banner };
}

/**
 * The URI is written into the token and cannot be changed afterwards, so a
 * misconfigured LABS_SITE_URL would permanently point every launch at nothing.
 * Cheaper to fail the build here than to mint a token with dead metadata.
 */
async function assertReachable(uri: string): Promise<void> {
  let ok = false;
  try {
    const response = await fetch(uri, { cache: "no-store" });
    ok = response.ok;
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new Error(
      `labs built a metadata URI at ${uri} but cannot fetch it back. LABS_SITE_URL is probably wrong — it has to be the public URL of this deployment, because that URI goes into the token permanently.`,
    );
  }
}
