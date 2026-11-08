import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { PINATA, STONKS } from "./config";
import {
  PUMP_PROGRAM,
  bondingCurveAddress,
  curvePrice,
  decodeCurve,
  decodeMetadataAccount,
  decodeMint,
} from "./market/pump-account";
import { connection } from "./solana";
import { fetchPublicBuffer, SsrfError } from "./ssrf";
import type { Venue } from "./types";

export type TokenInfo = {
  venue: Venue;
  mint: string;
  name?: string;
  symbol?: string;
  /** Price in the token's own quote asset: SOL on pump.fun. */
  priceQuote?: number;
  priceUsd?: number;
  marketCapQuote?: number;
  marketCapUsd?: number;
  volume24hUsd?: number;
  priceChange24h?: number;
  graduated?: boolean;
  /** 0 to 1. */
  graduationProgress?: number;
  quoteSymbol?: string;
  pool?: string;
  creator?: string;
  note?: string;
  source: string;
};

function metadataHttpUrl(uri: string): string | null {
  const trimmed = uri.trim();
  if (trimmed.startsWith("ipfs://")) {
    const path = trimmed.slice("ipfs://".length).replace(/^ipfs\//, "");
    return path ? `${PINATA.gateway}/${path}` : null;
  }
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
  return null;
}

/** Name and symbol from the JSON at a mint's metadata URI. Missing fields stay unset. */
async function metadataJson(uri: string): Promise<{ name?: string; symbol?: string }> {
  const url = metadataHttpUrl(uri);
  if (!url) return {};
  try {
    const { body } = await fetchPublicBuffer(url, {
      maxBytes: 256_000,
      accept: "application/json",
      label: "token metadata",
    });
    const json = JSON.parse(body.toString("utf8")) as { name?: unknown; symbol?: unknown };
    const name = typeof json.name === "string" && json.name.trim() ? json.name.trim() : undefined;
    const symbol = typeof json.symbol === "string" && json.symbol.trim() ? json.symbol.trim() : undefined;
    return { ...(name ? { name } : {}), ...(symbol ? { symbol } : {}) };
  } catch (err) {
    if (err instanceof SsrfError || err instanceof SyntaxError) return {};
    return {};
  }
}

/**
 * Price comes off the bonding curve's virtual reserves rather than an indexer's
 * USD figure, because that ratio *is* the price a trade executes at.
 */
async function pumpInfo(mint: string): Promise<TokenInfo> {
  let mintKey: PublicKey;
  try {
    mintKey = new PublicKey(mint);
  } catch {
    throw new Error(`${mint} is not a Solana address`);
  }
  const curveKey = bondingCurveAddress(mintKey);
  const [mintInfo, curveInfo] = await connection().getMultipleAccountsInfo([mintKey, curveKey]);
  if (!mintInfo) throw new Error(`no mint account for ${mint}`);
  const facts = decodeMint(mintInfo.data);
  if (!facts) throw new Error(`could not read the mint ${mint}`);

  let name = facts.name;
  let symbol = facts.symbol;
  let uri = facts.uri;
  if ((!name || !symbol) && facts.metadataAccount && facts.metadataAccount !== mint) {
    const metaInfo = await connection().getAccountInfo(new PublicKey(facts.metadataAccount));
    const meta = metaInfo ? decodeMetadataAccount(metaInfo.data) : null;
    name = name ?? meta?.name;
    symbol = symbol ?? meta?.symbol;
    uri = uri ?? meta?.uri;
  }
  if ((!name || !symbol) && uri) {
    const json = await metadataJson(uri);
    name = name ?? json.name;
    symbol = symbol ?? json.symbol;
  }

  const curve =
    curveInfo && curveInfo.owner.equals(PUMP_PROGRAM) ? decodeCurve(curveInfo.data) : null;
  const note = curve
    ? undefined
    : "no bonding curve for this mint: it has either graduated to an AMM or was not launched on pump.fun";
  const priceQuote = curve ? curvePrice(curve, facts.decimals) : undefined;
  const supply = Number(facts.supply);
  const marketCapQuote =
    priceQuote != null && Number.isFinite(supply) ? priceQuote * (supply / 10 ** facts.decimals) : undefined;

  return {
    venue: "pump",
    mint,
    ...(name ? { name } : {}),
    ...(symbol ? { symbol } : {}),
    quoteSymbol: "SOL",
    ...(priceQuote != null ? { priceQuote } : {}),
    ...(marketCapQuote != null ? { marketCapQuote } : {}),
    ...(curve ? { graduated: curve.complete, graduationProgress: curve.progress } : {}),
    ...(note ? { note } : {}),
    source: `bonding-curve:${curveKey.toBase58()}`,
  };
}

type StonksToken = {
  name?: string;
  symbol?: string;
  pool?: string;
  creator?: string;
  status?: string;
  graduationProgress?: number;
  quote?: { symbol?: string };
  market?: {
    priceUsd?: number;
    marketCapUsd?: number;
    volume24hUsd?: number;
    priceChange24h?: number;
  };
};

async function stonksInfo(mint: string): Promise<TokenInfo> {
  const url = `${STONKS.publicApi}/tokens/${mint}`;
  const response = await fetch(url);
  const body = (await response.json()) as {
    data?: { token?: StonksToken };
    error?: { message?: string };
  };
  const token = body.data?.token;
  if (!response.ok || !token) {
    throw new Error(
      `StonkFun has no record of ${mint} yet: ${
        body.error?.message ?? response.status
      }`,
    );
  }

  return {
    venue: "stonks",
    mint,
    name: token.name,
    symbol: token.symbol,
    quoteSymbol: token.quote?.symbol,
    priceUsd: token.market?.priceUsd,
    marketCapUsd: token.market?.marketCapUsd,
    volume24hUsd: token.market?.volume24hUsd,
    priceChange24h: token.market?.priceChange24h,
    graduated: token.status === "graduated",
    graduationProgress: token.graduationProgress,
    pool: token.pool,
    creator: token.creator,
    source: url,
  };
}

export function tokenInfo(venue: Venue, mint: string): Promise<TokenInfo> {
  return venue === "pump" ? pumpInfo(mint) : stonksInfo(mint);
}

/**
 * The price the quoter brackets, in the token's own quote asset. Never a volume
 * target. A USD figure is deliberately not accepted as a fallback: quoting
 * against a different unit than the one the trade settles in would put the band
 * in the wrong place.
 */
export async function referencePrice(
  venue: Venue,
  mint: string,
): Promise<{ price: number; source: string }> {
  const info = await tokenInfo(venue, mint);
  const price = info.priceQuote;
  if (!price || !Number.isFinite(price) || price <= 0) {
    throw new Error(
      `no quote-denominated price for ${mint} on ${venue}${
        info.note ? `: ${info.note}` : ""
      }`,
    );
  }
  return { price, source: info.source };
}

export async function solBalance(publicKey: string): Promise<number> {
  const lamports = await connection().getBalance(new PublicKey(publicKey));
  return lamports / LAMPORTS_PER_SOL;
}
