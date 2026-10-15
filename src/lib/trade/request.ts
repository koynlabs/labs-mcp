import { z } from "zod";
import { WSOL_MINT } from "../config";
import type { TradeDraft, Venue } from "../types";
import { humanToRaw } from "./units";

/**
 * Optional label on a swap or trigger order. Jupiter routes the mint either
 * way, including a pump.fun bonding curve. Callers that omit it keep working.
 */
export const tradeVenueField = z
  .enum(["pump", "stonks"])
  .optional()
  .describe(
    "Optional. pump or stonks. Labels the sign page only. Omit it for any mint Jupiter can route, including a pump.fun bonding curve or a StonkFun pool.",
  );

export const TRADE_SWAP_DESCRIPTION =
  "Market buy or sell of a pump.fun or StonkFun mint against SOL. Jupiter routes the swap, including a pump.fun bonding curve. venue is optional (pump or stonks) and only labels the sign page; omit it and any mint Jupiter can route still works. Returns a link. The wallet signs there. labs does not take a key.";

export const TRADE_ORDER_DESCRIPTION =
  "Places a Jupiter Trigger order on a pump.fun or StonkFun mint against SOL: limit, stop (price or a 0.5–90% trail), take-profit/stop as one OCO, or DCA. Jupiter routes the token, including a pump.fun bonding curve. venue is optional (pump or stonks); omit it and any mint Jupiter can route still works. The link signs Jupiter's challenge, then the deposit. Funds sit in a Jupiter vault until fill or cancel. labs seals the Jupiter session with LABS_SESSION_SECRET and does not return it to the browser.";

const INTERVALS = { "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 } as const;

export function venueLabel(venue: Venue): string {
  return venue === "pump" ? "pump.fun" : "StonkFun";
}

function where(venue?: Venue): string {
  return venue ? ` on ${venueLabel(venue)}` : "";
}

function pair(mint: string, side: "buy" | "sell"): { inputMint: string; outputMint: string } {
  if (mint === WSOL_MINT) throw new Error("Swap the token, not SOL against itself.");
  return side === "buy"
    ? { inputMint: WSOL_MINT, outputMint: mint }
    : { inputMint: mint, outputMint: WSOL_MINT };
}

/** Market swap against SOL. Venue never selects or refuses a route. */
export function swapDraft(input: {
  wallet: string;
  mint: string;
  side: "buy" | "sell";
  amount: number;
  decimals: number;
  venue?: Venue;
}): Extract<TradeDraft, { action: "swap" }> {
  const { inputMint, outputMint } = pair(input.mint, input.side);
  const raw = humanToRaw(input.amount, input.decimals);
  const unit = input.side === "buy" ? "SOL" : "tokens";
  const place = where(input.venue);
  return {
    action: "swap",
    wallet: input.wallet,
    inputMint,
    outputMint,
    amount: raw,
    ...(input.venue ? { venue: input.venue } : {}),
    summary:
      input.side === "buy"
        ? `Market-buy ${input.mint}${place} spending ${input.amount} ${unit}.`
        : `Market-sell ${input.amount} ${unit} of ${input.mint}${place} for SOL.`,
  };
}

/** Jupiter Trigger order against SOL. The same mint rules as a market swap. */
export function orderDraft(args: {
  wallet: string;
  mint: string;
  side: "buy" | "sell";
  mode: "limit" | "stop" | "bracket" | "dca";
  amount: number;
  decimals: number;
  venue?: Venue;
  triggerPriceUsd?: number;
  trailingPercent?: number;
  tpPriceUsd?: number;
  slPriceUsd?: number;
  rounds?: number;
  interval?: keyof typeof INTERVALS;
  expiresDays: number;
  now?: number;
}): Extract<TradeDraft, { action: "order" }> {
  if (args.mint === WSOL_MINT) throw new Error("Order the token against SOL.");
  if ((args.mode === "stop" || args.mode === "bracket") && args.side !== "sell") {
    throw new Error("A stop or take-profit/stop sells the token.");
  }
  const selling = args.side === "sell";
  const amount = humanToRaw(args.amount, args.decimals);
  const expiresAt = (args.now ?? Date.now()) + args.expiresDays * 86_400_000;
  const place = where(args.venue);
  const base = {
    action: "order" as const,
    wallet: args.wallet,
    inputMint: selling ? args.mint : WSOL_MINT,
    outputMint: selling ? WSOL_MINT : args.mint,
    tokenMint: args.mint,
    amount,
    expiresAt,
    ...(args.venue ? { venue: args.venue } : {}),
  };
  if (args.mode === "dca") {
    if (!args.rounds || !args.interval) throw new Error("DCA needs rounds and an interval.");
    return {
      ...base,
      mode: "dca",
      orderCount: args.rounds,
      intervalSeconds: INTERVALS[args.interval],
      summary: `DCA ${args.side} of ${args.mint}${place}: ${args.rounds} rounds every ${args.interval}, depositing ${args.amount}.`,
    };
  }
  if (args.mode === "bracket") {
    if (args.tpPriceUsd == null || args.slPriceUsd == null) {
      throw new Error("Take profit and stop both need a price.");
    }
    if (args.tpPriceUsd <= args.slPriceUsd) throw new Error("Take profit has to sit above the stop.");
    return {
      ...base,
      mode: "bracket",
      tpPriceUsd: args.tpPriceUsd,
      slPriceUsd: args.slPriceUsd,
      summary: `Sell ${args.mint}${place} with take profit $${args.tpPriceUsd} and stop $${args.slPriceUsd}.`,
    };
  }
  if (args.mode === "stop" && args.trailingPercent != null) {
    return {
      ...base,
      mode: "stop",
      triggerCondition: "below",
      trailingBps: Math.round(args.trailingPercent * 100),
      summary: `Trailing stop on ${args.mint}${place}, ${args.trailingPercent}% below the high.`,
    };
  }
  if (args.triggerPriceUsd == null) throw new Error("Enter a trigger price.");
  const condition = args.mode === "stop" || args.side === "buy" ? "below" : "above";
  return {
    ...base,
    mode: args.mode,
    triggerCondition: condition,
    triggerPriceUsd: args.triggerPriceUsd,
    summary: `${args.mode === "stop" ? "Stop" : "Limit"} ${args.side} of ${args.mint}${place} at $${args.triggerPriceUsd}.`,
  };
}
