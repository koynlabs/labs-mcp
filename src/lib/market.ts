import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { PUMP, STONKS } from "./config";
import { connection } from "./solana";
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

/**
 * pump.fun reads go through the free read-only pump.fun MCP over HTTP. It takes
 * no key and signs nothing, so it is safe to depend on for prices and curve
 * state. Launch transactions are deliberately not delegated to any MCP.
 */
async function callPumpRead<T>(
  tool: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const response = await fetch(PUMP.readMcp, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
  });
  if (!response.ok) {
    throw new Error(`pump.fun read MCP failed (${response.status})`);
  }

  const text = await response.text();
  // The endpoint answers as SSE; take the last data frame either way.
  const payload =
    text.startsWith("event:") || text.includes("\ndata:")
      ? text
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .at(-1)
      : text;
  if (!payload) throw new Error("pump.fun read MCP returned nothing");

  const body = JSON.parse(payload) as {
    result?: { structuredContent?: T; content?: { text?: string }[] };
    error?: { message?: string };
  };
  if (body.error) throw new Error(body.error.message ?? "pump.fun read failed");

  const structured = body.result?.structuredContent;
  if (structured) return structured;
  const raw = body.result?.content?.[0]?.text;
  return raw ? (JSON.parse(raw) as T) : null;
}

type PumpDetails = {
  name?: string;
  symbol?: string;
  decimals?: number;
  supply?: string;
};

type PumpCurve = {
  complete?: boolean;
  graduationPercent?: number;
  virtualSolReserves?: string;
  virtualTokenReserves?: string;
};

/**
 * Price comes off the bonding curve's virtual reserves rather than an indexer's
 * USD figure, because that ratio *is* the price a trade executes at. The
 * indexer's `price_usd` is null on fresh mints, which is exactly when a launch
 * needs it.
 */
function curvePrice(curve: PumpCurve, decimals: number): number | undefined {
  const sol = Number(curve.virtualSolReserves);
  const token = Number(curve.virtualTokenReserves);
  if (!sol || !token) return undefined;
  const price = sol / LAMPORTS_PER_SOL / (token / 10 ** decimals);
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

async function pumpInfo(mint: string): Promise<TokenInfo> {
  const details =
    (await callPumpRead<PumpDetails>("get_token_details", { mint })) ?? {};
  const decimals = details.decimals ?? 6;

  let curve: PumpCurve | null = null;
  let note: string | undefined;
  try {
    curve = await callPumpRead<PumpCurve>("get_bonding_curve", { mint });
  } catch {
    // The curve account is closed once a token graduates, and it never existed
    // for mints that were not launched on pump.fun at all.
    note =
      "no bonding curve for this mint: it has either graduated to an AMM or was not launched on pump.fun";
  }

  const priceQuote = curve ? curvePrice(curve, decimals) : undefined;
  const supply = Number(details.supply);
  const marketCapQuote =
    priceQuote && Number.isFinite(supply)
      ? priceQuote * (supply / 10 ** decimals)
      : undefined;

  return {
    venue: "pump",
    mint,
    name: details.name,
    symbol: details.symbol,
    quoteSymbol: "SOL",
    priceQuote,
    marketCapQuote,
    graduated: curve ? Boolean(curve.complete) : undefined,
    graduationProgress:
      curve?.graduationPercent !== undefined
        ? curve.graduationPercent / 100
        : undefined,
    note,
    source: PUMP.readMcp,
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
