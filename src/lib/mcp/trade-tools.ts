import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { WSOL_MINT } from "../config";
import { allow } from "../rate-limit";
import { isPublicKey } from "../solana";
import { BOARD_PAIRS, BOARD_SORTS, tradeBoard, type BoardSort } from "../trade/board";
import { saveTrade, tradeUrl } from "../trade/intent";
import { perpBook, perpMarkets } from "../trade/perps";
import { humanToRaw, mintDecimals, usdToRaw } from "../trade/units";
import type { PerpAsset, PerpSide } from "../types";

const publicKey = z.string().refine(isPublicKey, { message: "not a Solana address" });

const SORTS = { new: "newest", top: "marketCap", volume: "volume" } as const;

const INTERVALS = { "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 } as const;

function text(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function failure(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function limited(wallet: string): Promise<string | null> {
  if (!(await allow(`trade:${wallet}`, 20, 60))) return "Too many trades for this wallet. Wait a minute.";
  return null;
}

export function registerTradeTools(server: McpServer): void {
  server.registerTool(
    "trade_board",
    {
      title: "StonkFun board",
      description:
        "Lists StonkFun tokens. sort is new, top, or volume. pair filters the quote category: xstock, prestock, tessera, backpack, currency, leverage, collectible, solana, or custom. No signature.",
      inputSchema: z.object({
        sort: z.enum(["new", "top", "volume"]).default("new"),
        q: z.string().max(64).optional(),
        page: z.number().int().min(1).max(100000).default(1),
        pair: z.enum(BOARD_PAIRS).default("all"),
      }),
    },
    async (args) => {
      try {
        const sort = SORTS[args.sort] as BoardSort;
        if (!BOARD_SORTS.includes(sort)) return failure("Unknown sort.");
        return text(await tradeBoard({ sort, query: args.q?.trim() ?? "", page: args.page, pair: args.pair }));
      } catch (error) {
        return failure(messageOf(error));
      }
    },
  );

  server.registerTool(
    "perp_markets",
    {
      title: "Perp markets",
      description: "Mark price and 24h change for SOL, ETH, and BTC on Jupiter perps. No signature.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return text({ markets: await perpMarkets() });
      } catch (error) {
        return failure(messageOf(error));
      }
    },
  );

  server.registerTool(
    "perp_positions",
    {
      title: "Perp positions",
      description: "Open Jupiter perp positions and working limit orders for a wallet. This endpoint is public. No signature.",
      inputSchema: z.object({ wallet: publicKey }),
    },
    async ({ wallet }) => {
      try {
        return text(await perpBook(wallet));
      } catch (error) {
        return failure(messageOf(error));
      }
    },
  );

  server.registerTool(
    "trade_swap",
    {
      title: "Market swap",
      description:
        "Market buy or sell of a StonkFun mint against SOL. Returns a link. The wallet signs there. labs does not take a key and does not add its launch fee.",
      inputSchema: z.object({
        wallet: publicKey,
        mint: publicKey.describe("the token, not SOL"),
        side: z.enum(["buy", "sell"]),
        amount: z.number().positive().describe("SOL to spend when buying, tokens to sell when selling"),
      }),
    },
    async ({ wallet, mint, side, amount }) => {
      try {
        const blocked = await limited(wallet);
        if (blocked) return failure(blocked);
        if (mint === WSOL_MINT) return failure("Swap the token, not SOL against itself.");
        const decimals = side === "buy" ? 9 : await mintDecimals(mint);
        const raw = humanToRaw(amount, decimals);
        const inputMint = side === "buy" ? WSOL_MINT : mint;
        const outputMint = side === "buy" ? mint : WSOL_MINT;
        const unit = side === "buy" ? "SOL" : "tokens";
        const intent = await saveTrade({
          action: "swap",
          wallet,
          inputMint,
          outputMint,
          amount: raw,
          summary:
            side === "buy"
              ? `Market-buy ${mint} spending ${amount} ${unit}.`
              : `Market-sell ${amount} ${unit} of ${mint} for SOL.`,
        });
        return text({ signUrl: tradeUrl(intent.id), expiresInSeconds: 15 * 60, summary: intent.summary });
      } catch (error) {
        return failure(messageOf(error));
      }
    },
  );

  server.registerTool(
    "trade_order",
    {
      title: "Limit, stop, take profit, or DCA",
      description:
        "Places a Jupiter Trigger order on a StonkFun mint against SOL: limit, stop (price or a 0.5–90% trail), take-profit/stop as one OCO, or DCA. The link signs Jupiter's challenge, then the deposit. Funds sit in a Jupiter vault until fill or cancel. labs does not store the session and does not add its launch fee.",
      inputSchema: z.object({
        wallet: publicKey,
        mint: publicKey,
        side: z.enum(["buy", "sell"]).describe("stop and tp/sl are sells"),
        mode: z.enum(["limit", "stop", "bracket", "dca"]),
        amount: z.number().positive(),
        triggerPriceUsd: z.number().positive().optional(),
        trailingPercent: z.number().min(0.5).max(90).optional().describe("stop trail, instead of a price"),
        tpPriceUsd: z.number().positive().optional(),
        slPriceUsd: z.number().positive().optional(),
        rounds: z.number().int().min(2).max(100).optional(),
        interval: z.enum(["15m", "1h", "4h", "1d"]).optional(),
        expiresDays: z.number().int().min(1).max(30).default(7),
      }),
    },
    async (args) => {
      try {
        const blocked = await limited(args.wallet);
        if (blocked) return failure(blocked);
        if (args.mint === WSOL_MINT) return failure("Order the token against SOL.");
        if ((args.mode === "stop" || args.mode === "bracket") && args.side !== "sell") {
          return failure("A stop or take-profit/stop sells the token.");
        }
        const selling = args.side === "sell";
        const decimals = selling ? await mintDecimals(args.mint) : 9;
        const amount = humanToRaw(args.amount, decimals);
        const expiresAt = Date.now() + args.expiresDays * 86_400_000;
        const base = {
          action: "order" as const,
          wallet: args.wallet,
          inputMint: selling ? args.mint : WSOL_MINT,
          outputMint: selling ? WSOL_MINT : args.mint,
          tokenMint: args.mint,
          amount,
          expiresAt,
        };
        if (args.mode === "dca") {
          if (!args.rounds || !args.interval) return failure("DCA needs rounds and an interval.");
          const intent = await saveTrade({
            ...base,
            mode: "dca",
            orderCount: args.rounds,
            intervalSeconds: INTERVALS[args.interval],
            summary: `DCA ${args.side} of ${args.mint}: ${args.rounds} rounds every ${args.interval}, depositing ${args.amount}.`,
          });
          return text({ signUrl: tradeUrl(intent.id), expiresInSeconds: 15 * 60, summary: intent.summary });
        }
        if (args.mode === "bracket") {
          if (args.tpPriceUsd == null || args.slPriceUsd == null) {
            return failure("Take profit and stop both need a price.");
          }
          if (args.tpPriceUsd <= args.slPriceUsd) return failure("Take profit has to sit above the stop.");
          const intent = await saveTrade({
            ...base,
            mode: "bracket",
            tpPriceUsd: args.tpPriceUsd,
            slPriceUsd: args.slPriceUsd,
            summary: `Sell ${args.mint} with take profit $${args.tpPriceUsd} and stop $${args.slPriceUsd}.`,
          });
          return text({ signUrl: tradeUrl(intent.id), expiresInSeconds: 15 * 60, summary: intent.summary });
        }
        if (args.mode === "stop" && args.trailingPercent != null) {
          const intent = await saveTrade({
            ...base,
            mode: "stop",
            triggerCondition: "below",
            trailingBps: Math.round(args.trailingPercent * 100),
            summary: `Trailing stop on ${args.mint}, ${args.trailingPercent}% below the high.`,
          });
          return text({ signUrl: tradeUrl(intent.id), expiresInSeconds: 15 * 60, summary: intent.summary });
        }
        if (args.triggerPriceUsd == null) return failure("Enter a trigger price.");
        const condition = args.mode === "stop" || args.side === "buy" ? "below" : "above";
        const intent = await saveTrade({
          ...base,
          mode: args.mode,
          triggerCondition: condition,
          triggerPriceUsd: args.triggerPriceUsd,
          summary: `${args.mode === "stop" ? "Stop" : "Limit"} ${args.side} of ${args.mint} at $${args.triggerPriceUsd}.`,
        });
        return text({ signUrl: tradeUrl(intent.id), expiresInSeconds: 15 * 60, summary: intent.summary });
      } catch (error) {
        return failure(messageOf(error));
      }
    },
  );

  server.registerTool(
    "perp_open",
    {
      title: "Open a perp",
      description:
        "Long or short SOL, ETH, or BTC on Jupiter perps with USDC margin. Market, or a limit at a trigger. A market open can include both a take profit and a stop. Leverage is 1.1x to 50x. Returns a signing link. labs does not add its launch fee.",
      inputSchema: z.object({
        wallet: publicKey,
        asset: z.enum(["SOL", "ETH", "BTC"]),
        side: z.enum(["long", "short"]),
        marginUsdc: z.number().positive(),
        leverage: z.number().min(1.1).max(50),
        mode: z.enum(["market", "limit"]).default("market"),
        triggerPriceUsd: z.number().positive().optional(),
        tpPriceUsd: z.number().positive().optional(),
        slPriceUsd: z.number().positive().optional(),
      }),
    },
    async (args) => {
      try {
        const blocked = await limited(args.wallet);
        if (blocked) return failure(blocked);
        if (args.mode === "limit" && args.triggerPriceUsd == null) return failure("A limit needs a trigger price.");
        if ((args.tpPriceUsd == null) !== (args.slPriceUsd == null) && args.mode === "market") {
          return failure("Take profit and stop are set together.");
        }
        if (args.mode === "limit" && (args.tpPriceUsd != null || args.slPriceUsd != null)) {
          return failure("Exits attach to a market open. Set them after the limit fills.");
        }
        const intent = await saveTrade({
          action: "perp-open",
          wallet: args.wallet,
          asset: args.asset as PerpAsset,
          side: args.side as PerpSide,
          mode: args.mode,
          usdcRaw: humanToRaw(args.marginUsdc, 6),
          leverage: String(args.leverage),
          triggerPrice: args.triggerPriceUsd != null ? usdToRaw(args.triggerPriceUsd) : undefined,
          tpPrice: args.mode === "market" && args.tpPriceUsd != null ? usdToRaw(args.tpPriceUsd) : undefined,
          slPrice: args.mode === "market" && args.slPriceUsd != null ? usdToRaw(args.slPriceUsd) : undefined,
          summary: `${args.side} ${args.asset} ${args.mode} with ${args.marginUsdc} USDC at ${args.leverage}x.`,
        });
        return text({ signUrl: tradeUrl(intent.id), expiresInSeconds: 15 * 60, summary: intent.summary });
      } catch (error) {
        return failure(messageOf(error));
      }
    },
  );

  server.registerTool(
    "perp_close",
    {
      title: "Close a perp",
      description: "Closes one Jupiter perp position entirely back to USDC. Returns a signing link.",
      inputSchema: z.object({
        wallet: publicKey,
        positionPubkey: publicKey,
      }),
    },
    async ({ wallet, positionPubkey }) => {
      try {
        const blocked = await limited(wallet);
        if (blocked) return failure(blocked);
        const intent = await saveTrade({
          action: "perp-close",
          wallet,
          positionPubkey,
          summary: `Close perp position ${positionPubkey} back to USDC.`,
        });
        return text({ signUrl: tradeUrl(intent.id), expiresInSeconds: 15 * 60, summary: intent.summary });
      } catch (error) {
        return failure(messageOf(error));
      }
    },
  );

  server.registerTool(
    "perp_exit",
    {
      title: "Perp take profit, stop, or cancel",
      description:
        "Sets a take profit and stop on an open Jupiter perp, or cancels a take profit, stop, or working limit. Returns a signing link. Perps have no DCA.",
      inputSchema: z.object({
        wallet: publicKey,
        op: z.enum(["set", "cancel-tpsl", "cancel-limit"]),
        positionPubkey: publicKey.optional(),
        requestPubkey: publicKey.optional().describe("the take-profit, stop, or limit request to cancel"),
        tpPriceUsd: z.number().positive().optional(),
        slPriceUsd: z.number().positive().optional(),
      }),
    },
    async (args) => {
      try {
        const blocked = await limited(args.wallet);
        if (blocked) return failure(blocked);
        if (args.op === "set") {
          if (!args.positionPubkey) return failure("Setting exits needs the position.");
          if (args.tpPriceUsd == null && args.slPriceUsd == null) {
            return failure("Set a take profit, a stop, or both.");
          }
          const intent = await saveTrade({
            action: "perp-exit",
            wallet: args.wallet,
            op: "set",
            positionPubkey: args.positionPubkey,
            tpPrice: args.tpPriceUsd != null ? usdToRaw(args.tpPriceUsd) : undefined,
            slPrice: args.slPriceUsd != null ? usdToRaw(args.slPriceUsd) : undefined,
            summary: `Set exits on ${args.positionPubkey}.`,
          });
          return text({ signUrl: tradeUrl(intent.id), expiresInSeconds: 15 * 60, summary: intent.summary });
        }
        if (!args.requestPubkey) return failure("Cancelling needs the request pubkey.");
        const intent = await saveTrade({
          action: "perp-exit",
          wallet: args.wallet,
          op: args.op,
          requestPubkey: args.requestPubkey,
          summary:
            args.op === "cancel-limit"
              ? `Cancel limit order ${args.requestPubkey}.`
              : `Cancel exit ${args.requestPubkey}.`,
        });
        return text({ signUrl: tradeUrl(intent.id), expiresInSeconds: 15 * 60, summary: intent.summary });
      } catch (error) {
        return failure(messageOf(error));
      }
    },
  );
}
