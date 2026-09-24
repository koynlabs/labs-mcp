import { randomUUID } from "node:crypto";
import { baseUrl, PINATA } from "../config";
import { putMetadata } from "../store";
import type { LaunchInput } from "./input";

export type Metadata = {
  uri: string;
  /** Where the JSON actually lives, so the caller knows what it is trusting. */
  host: "caller" | "ipfs" | "labs";
};

function json(input: LaunchInput) {
  return {
    name: input.name,
    symbol: input.symbol,
    description: input.description ?? "",
    image: input.imageUrl,
    showName: true,
    ...(input.twitter ? { twitter: input.twitter } : {}),
    ...(input.telegram ? { telegram: input.telegram } : {}),
    ...(input.website ? { website: input.website } : {}),
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

/**
 * Pins the image and then the metadata JSON that points at it, so neither
 * depends on a host the creator might take down. An image that is already on
 * IPFS is left where it is.
 */
async function pinToIpfs(input: LaunchInput): Promise<string> {
  let image = input.imageUrl;
  if (!image.includes("/ipfs/")) {
    const source = await fetch(image);
    if (!source.ok) {
      throw new Error(`could not read the image at ${image}`);
    }
    const blob = await source.blob();
    const cid = await pinFile(new File([blob], `${input.symbol}-image`));
    image = `${PINATA.gateway}/${cid}`;
  }

  const metadata = JSON.stringify({ ...json(input), image });
  const cid = await pinFile(
    new File([metadata], `${input.symbol}-metadata.json`),
  );
  return `${PINATA.gateway}/${cid}`;
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
    return { uri: await pinToIpfs(input), host: "ipfs" };
  }

  const id = randomUUID();
  await putMetadata(id, json(input));
  const uri = `${baseUrl()}/api/metadata/${id}`;
  await assertReachable(uri);
  return { uri, host: "labs" };
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
