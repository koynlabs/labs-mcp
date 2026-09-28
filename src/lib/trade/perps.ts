import { JUPITER_PERPS } from "../config";
import type { PerpAsset, PerpSide, TradeIntent } from "../types";
import { JupiterError, asRecord, jupiter, str } from "./http";

const ASSETS = ["SOL", "ETH", "BTC"] as const;

const MINTS: Record<PerpAsset, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  ETH: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
  BTC: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
};

export type PerpAction =
  | "increase-position"
  | "decrease-position"
  | "create-limit-order"
  | "cancel-limit-order"
  | "create-tpsl"
  | "cancel-tpsl";

function rawUsd(value: unknown): number | null {
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) return null;
  const n = Number(value) / 1e6;
  return Number.isFinite(n) ? n : null;
}

function decimal(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function txOf(body: unknown): string {
  const row = asRecord(body);
  const tx = str(row?.serializedTxBase64);
  if (!tx) throw new JupiterError("Jupiter did not return a transaction", 502);
  return tx;
}

export async function perpMarkets(): Promise<
  Array<{ asset: PerpAsset; price: number | null; change24h: number | null }>
> {
  return Promise.all(
    ASSETS.map(async (asset) => {
      const body = asRecord(
        await jupiter(`${JUPITER_PERPS}/market-stats?mint=${MINTS[asset]}`, { perps: true }),
      );
      return { asset, price: decimal(body?.price), change24h: decimal(body?.priceChange24H) };
    }),
  );
}

export async function perpBook(wallet: string): Promise<{
  positions: Array<{
    pubkey: string;
    asset: string | null;
    side: string | null;
    leverage: string | null;
    sizeUsd: number | null;
    pnlUsd: number | null;
    liquidationUsd: number | null;
  }>;
  limits: Array<{
    requestPubkey: string;
    side: string | null;
    triggerUsd: number | null;
    sizeUsd: number | null;
  }>;
}> {
  const [positionsBody, limitsBody] = await Promise.all([
    jupiter(
      `${JUPITER_PERPS}/positions?walletAddress=${encodeURIComponent(wallet)}&includeClosedPositions=false`,
      { perps: true },
    ),
    jupiter(`${JUPITER_PERPS}/orders/limit?walletAddress=${encodeURIComponent(wallet)}`, { perps: true }),
  ]);
  const positions = Array.isArray(asRecord(positionsBody)?.dataList)
    ? (asRecord(positionsBody)?.dataList as unknown[])
    : [];
  const limits = Array.isArray(asRecord(limitsBody)?.dataList)
    ? (asRecord(limitsBody)?.dataList as unknown[])
    : [];
  return {
    positions: positions.flatMap((item) => {
      const row = asRecord(item);
      if (!row || typeof row.positionPubkey !== "string") return [];
      return [
        {
          pubkey: row.positionPubkey,
          asset:
            typeof row.market === "string" ? row.market : typeof row.asset === "string" ? row.asset : null,
          side: typeof row.side === "string" ? row.side : null,
          leverage: typeof row.leverage === "string" ? row.leverage : null,
          sizeUsd: rawUsd(row.sizeUsd),
          pnlUsd: rawUsd(row.pnlAfterFeesUsd),
          liquidationUsd: rawUsd(row.liquidationPriceUsd),
        },
      ];
    }),
    limits: limits.flatMap((item) => {
      const row = asRecord(item);
      if (!row || typeof row.positionRequestPubkey !== "string" || row.executed === true) return [];
      return [
        {
          requestPubkey: row.positionRequestPubkey,
          side: typeof row.side === "string" ? row.side : null,
          triggerUsd: rawUsd(row.triggerPrice),
          sizeUsd: rawUsd(row.sizeUsdDelta),
        },
      ];
    }),
  };
}

type OpenIntent = Extract<TradeIntent, { action: "perp-open" }>;

export async function buildPerp(intent: TradeIntent): Promise<{ transaction: string; action: PerpAction }> {
  if (intent.action === "perp-open") return buildOpen(intent);
  if (intent.action === "perp-close") {
    const body = await jupiter(`${JUPITER_PERPS}/positions/decrease`, {
      method: "POST",
      perps: true,
      body: {
        positionPubkey: intent.positionPubkey,
        receiveToken: "USDC",
        entirePosition: true,
        maxSlippageBps: "100",
      },
    });
    return { transaction: txOf(body), action: "decrease-position" };
  }
  if (intent.action !== "perp-exit") {
    throw new JupiterError("This trade is not a perp", 400);
  }
  if (intent.op === "cancel-limit") {
    const body = await jupiter(`${JUPITER_PERPS}/orders/limit`, {
      method: "DELETE",
      perps: true,
      body: { positionRequestPubkey: intent.requestPubkey },
    });
    return { transaction: txOf(body), action: "cancel-limit-order" };
  }
  if (intent.op === "cancel-tpsl") {
    const body = await jupiter(`${JUPITER_PERPS}/tpsl`, {
      method: "DELETE",
      perps: true,
      body: { positionRequestPubkey: intent.requestPubkey },
    });
    return { transaction: txOf(body), action: "cancel-tpsl" };
  }
  const legs = [
    intent.tpPrice ? { requestType: "tp", triggerPrice: intent.tpPrice } : null,
    intent.slPrice ? { requestType: "sl", triggerPrice: intent.slPrice } : null,
  ].filter((leg): leg is { requestType: "tp" | "sl"; triggerPrice: string } => leg !== null);
  const body = await jupiter(`${JUPITER_PERPS}/tpsl`, {
    method: "POST",
    perps: true,
    body: {
      walletAddress: intent.wallet,
      positionPubkey: intent.positionPubkey,
      transactionType: "instant",
      tpsl: legs.map((leg) => ({
        receiveToken: "USDC",
        entirePosition: true,
        triggerPrice: leg.triggerPrice,
        requestType: leg.requestType,
      })),
    },
  });
  return { transaction: txOf(body), action: "create-tpsl" };
}

async function buildOpen(intent: OpenIntent): Promise<{ transaction: string; action: PerpAction }> {
  if (intent.mode === "limit") {
    const body = await jupiter(`${JUPITER_PERPS}/orders/limit`, {
      method: "POST",
      perps: true,
      body: {
        walletAddress: intent.wallet,
        asset: intent.asset,
        inputToken: "USDC",
        inputTokenAmount: intent.usdcRaw,
        side: intent.side,
        leverage: intent.leverage,
        triggerPrice: intent.triggerPrice,
        includeSerializedTx: true,
      },
    });
    return { transaction: txOf(body), action: "create-limit-order" };
  }
  const tpsl = [
    intent.tpPrice
      ? { receiveToken: "USDC", triggerPrice: intent.tpPrice, requestType: "tp" }
      : null,
    intent.slPrice
      ? { receiveToken: "USDC", triggerPrice: intent.slPrice, requestType: "sl" }
      : null,
  ].filter((leg) => leg !== null);
  const body = await jupiter(`${JUPITER_PERPS}/positions/increase`, {
    method: "POST",
    perps: true,
    body: {
      walletAddress: intent.wallet,
      asset: intent.asset,
      inputToken: "USDC",
      inputTokenAmount: intent.usdcRaw,
      side: intent.side,
      leverage: intent.leverage,
      maxSlippageBps: "100",
      ...(tpsl.length ? { tpsl } : {}),
    },
  });
  return { transaction: txOf(body), action: "increase-position" };
}

export async function submitPerp(input: {
  action: PerpAction;
  signedTransaction: string;
}): Promise<{ txid: string }> {
  const body = asRecord(
    await jupiter(`${JUPITER_PERPS}/transaction/execute`, {
      method: "POST",
      perps: true,
      body: { action: input.action, serializedTxBase64: input.signedTransaction },
    }),
  );
  const txid = str(body?.txid);
  if (!txid) throw new JupiterError("Jupiter did not return a signature", 502);
  return { txid };
}

export function isPerpSide(value: string): value is PerpSide {
  return value === "long" || value === "short";
}
