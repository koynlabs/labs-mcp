import type { McpServer } from "@modelcontextprotocol/server";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { z } from "zod";
import { start } from "workflow/api";
import { allow } from "../rate-limit";
import { isPersistent } from "../store";
import { volumeSession } from "../../../workflows/volume";
import { assertLiquidatePercent, assertVolumeCount } from "../volume/plan";
import { addLiquidityWallets } from "../volume/reenter";
import {
  createVolumeSession,
  loadVolume,
  publicVolume,
  saveVolume,
} from "../volume/session";

const venue = z.enum(["pump", "stonks"]);

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

function agentMain(): string {
  const raw = process.env.LABS_AGENT_KEYPAIR?.trim();
  if (!raw) throw new Error("LABS_AGENT_KEYPAIR is not set. Volume has no main wallet.");
  return Keypair.fromSecretKey(bs58.decode(raw)).publicKey.toBase58();
}

async function startRun(sessionId: string): Promise<string | undefined> {
  const run = await start(volumeSession, [sessionId]);
  return run?.runId;
}

export function registerVolumeTools(server: McpServer): void {
  server.registerTool(
    "start_volume",
    {
      title: "Start launch liquidity",
      description: [
        "Generates up to 100 wallets, funds them privately from the agent main",
        "wallet, and buys this coin at launch. The first three buys land in the",
        "atomic create bundle so a sniper cannot take that supply. The rest buy",
        "immediately after. Bags are held for the pool. This is creator-controlled",
        "supply, not public demand. No sign link is returned. Secrets stay sealed.",
      ].join(" "),
      inputSchema: z.object({
        venue,
        name: z.string().min(1).max(32),
        symbol: z.string().min(1).max(10),
        imageUrl: z.string().url(),
        description: z.string().max(500).optional(),
        wallets: z.number().int().min(1).max(100),
        solPerWallet: z.number().positive(),
      }),
    },
    async (args) => {
      try {
        if (!isPersistent()) return failure("Volume sessions need a Redis store. Set REDIS_URL.");
        const main = agentMain();
        if (!(await allow(`volume:${main}`, 3, 600))) {
          return failure("Too many volume sessions from this wallet. Wait a few minutes.");
        }
        assertVolumeCount(args.wallets);
        const session = createVolumeSession({
          venue: args.venue,
          main,
          name: args.name,
          symbol: args.symbol,
          imageUrl: args.imageUrl,
          description: args.description,
          count: args.wallets,
          solPerWallet: args.solPerWallet,
        });
        await saveVolume(session);
        await startRun(session.id);
        return text(publicVolume(session));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "volume_status",
    {
      title: "Volume session status",
      description: "Public addresses, phase, and whether each wallet has funded, bought, or been swept. No secrets.",
      inputSchema: z.object({ sessionId: z.string().uuid() }),
    },
    async ({ sessionId }) => {
      const session = await loadVolume(sessionId);
      if (!session) return failure("No such volume session.");
      return text(publicVolume(session));
    },
  );

  server.registerTool(
    "liquidate_volume",
    {
      title: "Liquidate launch liquidity",
      description: [
        "Returns 10, 25, 50, or 100 percent of each wallet's position to the main",
        "wallet. A failed launch always uses 100. This is the only sell. SOL is",
        "sent to the main wallet, not to another volume wallet.",
      ].join(" "),
      inputSchema: z.object({
        sessionId: z.string().uuid(),
        percent: z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]),
      }),
    },
    async ({ sessionId, percent }) => {
      try {
        const session = await loadVolume(sessionId);
        if (!session) return failure("No such volume session.");
        const failed = session.phase === "failed";
        session.liquidatePercent = assertLiquidatePercent(percent, failed);
        session.pass = (session.pass ?? 0) + 1;
        session.phase = "liquidating";
        session.error = undefined;
        await saveVolume(session);
        await startRun(session.id);
        return text(publicVolume(session));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "add_liquidity",
    {
      title: "Re-enter pool liquidity",
      description: [
        "Funds between 1 and 100 volume wallets from the main wallet and deposits",
        "that inventory into the pool. Reuses wallets that still have sealed keys,",
        "then generates new ones up to 100 total. Does not sell to fund the deposit.",
      ].join(" "),
      inputSchema: z.object({
        sessionId: z.string().uuid(),
        wallets: z.number().int().min(1).max(100),
      }),
    },
    async ({ sessionId, wallets }) => {
      try {
        const session = await loadVolume(sessionId);
        if (!session) return failure("No such volume session.");
        addLiquidityWallets(session, wallets);
        await saveVolume(session);
        await startRun(session.id);
        return text(publicVolume(session));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );
}
