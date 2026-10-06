import { STONKS } from "../config";

export const BOARD_SORTS = ["newest", "marketCap", "volume"] as const;
export type BoardSort = (typeof BOARD_SORTS)[number];

export const BOARD_PAIRS = [
  "all",
  "xstock",
  "prestock",
  "tessera",
  "backpack",
  "currency",
  "leverage",
  "collectible",
  "solana",
  "custom",
] as const;
export type BoardPair = (typeof BOARD_PAIRS)[number];

export type BoardToken = {
  mint: string;
  name: string;
  symbol: string;
  quote: string;
  priceUsd: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  priceChange24h: number | null;
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function tradeBoard(input: {
  sort: BoardSort;
  query: string;
  page: number;
  pair: BoardPair;
}): Promise<{
  tokens: BoardToken[];
  page: number;
  total: number;
  totalPages: number;
}> {
  const url = new URL(`${STONKS.publicApi}/tokens`);
  url.searchParams.set("sort", input.sort);
  url.searchParams.set("pageSize", "20");
  url.searchParams.set("page", String(input.page));
  if (input.query) url.searchParams.set("q", input.query);
  if (input.pair !== "all") url.searchParams.set("category", input.pair);
  const res = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 15 } });
  if (!res.ok) throw new Error(`StonkFun tokens ${res.status}`);
  const body = (await res.json()) as {
    data?: {
      tokens?: Array<{
        mint?: string;
        name?: string;
        symbol?: string;
        quote?: { symbol?: string };
        market?: {
          priceUsd?: number;
          marketCapUsd?: number;
          volume24hUsd?: number;
          priceChange24h?: number;
        };
      }>;
      pagination?: { page?: number; total?: number; totalPages?: number };
    };
  };
  const tokens = (body.data?.tokens ?? [])
    .filter((token) => typeof token.mint === "string")
    .map((token) => ({
      mint: token.mint as string,
      name: token.name?.trim() || token.symbol?.trim() || (token.mint as string),
      symbol: token.symbol?.trim() || "?",
      quote: token.quote?.symbol?.trim() || "?",
      priceUsd: num(token.market?.priceUsd),
      marketCapUsd: num(token.market?.marketCapUsd),
      volume24hUsd: num(token.market?.volume24hUsd),
      priceChange24h: num(token.market?.priceChange24h),
    }));
  const pagination = body.data?.pagination;
  return {
    tokens,
    page: num(pagination?.page) ?? input.page,
    total: num(pagination?.total) ?? tokens.length,
    totalPages: Math.max(1, num(pagination?.totalPages) ?? 1),
  };
}
