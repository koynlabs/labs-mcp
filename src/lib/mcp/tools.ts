import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { start } from "workflow/api";
import { FEE_SOL, MAKER, MAKER_ENABLED, MAX_BUYERS } from "../config";
import { createLaunch, outstanding, signUrl } from "../launch/bundle";
import { launchablePairs } from "../launch/stonks";
import { solBalance, tokenInfo } from "../market";
import {
  createSession,
  makerUrl,
  publicView,
  saveSession,
} from "../maker/session";
import { allow } from "../rate-limit";
import { getBundle, getSession, isPersistent } from "../store";
import { isPublicKey } from "../solana";
import { makerSession } from "../../../workflows/maker";

const venue = z.enum(["pump", "stonks"]);

const publicKey = z
  .string()
  .refine(isPublicKey, { message: "not a Solana address" });

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

export function registerTools(server: McpServer): void {
  server.registerTool(
    "launch_token",
    {
      title: "Launch a token",
      description: [
        "Builds a token launch on pump.fun or StonkFun and returns a link where",
        "the creator's wallet signs it. Up to",
        `${MAX_BUYERS} additional wallets the creator controls can buy in the same`,
        "atomic bundle as the create, which is how a launch is seeded.",
        `Costs ${FEE_SOL} SOL, paid to the levercoin treasury inside the same bundle.`,
        "No private key is ever sent to this server.",
      ].join(" "),
      inputSchema: z.object({
        venue,
        creator: publicKey.describe("wallet that creates the token and pays the fee"),
        name: z.string().min(1).max(32),
        symbol: z.string().min(1).max(10),
        imageUrl: z.string().url().describe("token image, fetched server-side"),
        description: z.string().max(500).optional(),
        twitter: z.string().optional(),
        telegram: z.string().optional(),
        website: z.string().optional(),
        creatorBuySol: z
          .number()
          .min(0)
          .default(0)
          .describe("the creator's own opening buy, in SOL"),
        buyers: z
          .array(
            z.object({
              publicKey,
              sol: z.number().positive(),
            }),
          )
          .max(MAX_BUYERS)
          .default([])
          .describe("other wallets the creator owns, buying in the same bundle"),
        slippagePercent: z.number().min(1).max(50).default(10),
        priorityFeeSol: z.number().min(0).default(0.0001),
        quoteMint: publicKey
          .optional()
          .describe("StonkFun only: what the token trades against, default wSOL"),
        metadataUri: z
          .string()
          .url()
          .optional()
          .describe(
            "a metadata JSON URI you have already pinned; labs pins one for you if omitted",
          ),
      }),
    },
    async (args) => {
      try {
        if (!(await allow(`launch:${args.creator}`, 5, 600))) {
          return failure(
            "Too many launches built from this wallet in the last 10 minutes. Finish signing one, or wait.",
          );
        }

        const bundle = await createLaunch({
          venue: args.venue,
          creator: args.creator,
          name: args.name,
          symbol: args.symbol,
          imageUrl: args.imageUrl,
          description: args.description,
          twitter: args.twitter,
          telegram: args.telegram,
          website: args.website,
          creatorBuySol: args.creatorBuySol,
          buyers: args.buyers,
          slippagePercent: args.slippagePercent,
          priorityFeeSol: args.priorityFeeSol,
          quoteMint: args.quoteMint,
          metadataUri: args.metadataUri,
        });

        return text({
          bundleId: bundle.id,
          mint: bundle.mint,
          venue: bundle.venue,
          feeSol: bundle.feeSol,
          treasury: bundle.treasury,
          metadataUri: bundle.metadataUri,
          metadataWarning:
            bundle.metadataHost === "labs"
              ? "This token's metadata JSON is served by labs, not IPFS. Pass metadataUri, or have the operator set LABS_PINATA_JWT, if it needs to outlive this service."
              : undefined,
          signUrl: signUrl(bundle.id),
          signersRequired: bundle.txs.map((tx) => ({
            index: tx.index,
            role: tx.role,
            wallet: tx.signer,
            sol: tx.sol,
          })),
          nextStep:
            "Open signUrl, connect each listed wallet, and sign. The launch is submitted as one atomic bundle once every signature is in.",
        });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "launch_status",
    {
      title: "Launch status",
      description:
        "Reports whether a built launch is still waiting on signatures, was submitted, or failed.",
      inputSchema: z.object({ bundleId: z.string().uuid() }),
    },
    async ({ bundleId }) => {
      const bundle = await getBundle(bundleId);
      if (!bundle) {
        return failure("No such launch. Built launches are dropped after 15 minutes.");
      }
      return text({
        bundleId: bundle.id,
        status: bundle.status,
        venue: bundle.venue,
        mint: bundle.mint,
        name: bundle.name,
        symbol: bundle.symbol,
        jitoBundleId: bundle.jitoBundleId,
        signatures: bundle.signatures,
        awaitingSignatureFrom: outstanding(bundle).map((tx) => tx.signer),
        error: bundle.error,
        signUrl: signUrl(bundle.id),
      });
    },
  );

  server.registerTool(
    "token_info",
    {
      title: "Token info",
      description:
        "Public market data for a mint: price, market cap, liquidity, holders, graduation.",
      inputSchema: z.object({ venue, mint: publicKey }),
    },
    async ({ venue: which, mint }) => {
      try {
        return text(await tokenInfo(which, mint));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "wallet_balance",
    {
      title: "Wallet SOL balance",
      description: "SOL balance for any address, so a launch can be sized before signing.",
      inputSchema: z.object({ publicKey }),
    },
    async (args) => {
      try {
        return text({
          publicKey: args.publicKey,
          sol: await solBalance(args.publicKey),
        });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "stonks_pairs",
    {
      title: "StonkFun quote tokens",
      description:
        "Quote tokens a StonkFun launch can be paired against right now. Call before launching there.",
      inputSchema: z.object({
        search: z.string().optional().describe("filter by symbol or name"),
      }),
    },
    async ({ search }) => {
      try {
        const pairs = await launchablePairs();
        const needle = search?.toLowerCase();
        const filtered = needle
          ? pairs.filter(
              (pair) =>
                pair.symbol.toLowerCase().includes(needle) ||
                pair.mint.toLowerCase() === needle,
            )
          : pairs;
        return text({
          count: filtered.length,
          pairs: filtered.slice(0, 50),
        });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "start_maker",
    {
      title: "Start a two-sided quoter",
      description: [
        "Opens a disclosed market-making session on one mint from one wallet.",
        "The wallet buys when the price crosses its bid and sells when it crosses",
        `its ask, never tighter than ${MAKER.minSpreadBps} bps and never faster than`,
        `${MAKER.minRefreshSeconds}s. Inside the spread it does nothing. Inventory caps`,
        "shrink and then stop whichever side is already heavy. This does not",
        "generate volume, use multiple wallets, or hide who is trading.",
        `Costs ${FEE_SOL} SOL.`,
      ].join(" "),
      inputSchema: z.object({
        venue,
        mint: publicKey,
        maker: publicKey.describe("the single, disclosed maker wallet"),
        spreadBps: z.number().int().min(MAKER.minSpreadBps).max(5_000),
        quoteSol: z.number().positive().describe("size of one quote, in SOL"),
        maxSol: z.number().positive().describe("hard cap on SOL this session may spend"),
        maxToken: z.number().positive().describe("hard cap on tokens held"),
        refreshSeconds: z
          .number()
          .int()
          .min(MAKER.minRefreshSeconds)
          .default(MAKER.minRefreshSeconds),
        durationHours: z.number().positive().max(MAKER.maxDurationHours).default(6),
      }),
    },
    async (args) => {
      try {
        if (!MAKER_ENABLED) {
          return failure(
            "Two-sided quoting is switched off on this deployment. Launches still work.",
          );
        }
        if (!isPersistent()) {
          return failure(
            "Maker sessions need a Redis store. Set REDIS_URL.",
          );
        }
        if (!(await allow(`maker:${args.maker}`, 3, 600))) {
          return failure("Too many maker sessions opened from this wallet. Wait a few minutes.");
        }

        const session = await createSession(args);
        return text({
          ...publicView(session),
          feeSol: session.feeSol,
          treasury: session.treasury,
          approveUrl: makerUrl(session.id),
          nextStep: [
            "Open approveUrl with the maker wallet. It creates a quoting key in the",
            "browser, has you approve exactly this mint and SOL cap, and pays the fee.",
            "Your wallet's own key never leaves it.",
          ].join(" "),
        });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "maker_status",
    {
      title: "Maker session status",
      description:
        "The maker wallet, its position, the last bid and ask, the last fill, and time left.",
      inputSchema: z.object({ sessionId: z.string().uuid() }),
    },
    async ({ sessionId }) => {
      const session = await getSession(sessionId);
      if (!session) return failure("No such maker session.");
      return text(publicView(session));
    },
  );

  server.registerTool(
    "stop_maker",
    {
      title: "Stop a maker session",
      description: [
        "Ends a session and discards its quoting key. Requires the maker wallet's",
        "signature over the session id, so only the maker can stop it. Sessions",
        "also stop on their own at expiry.",
      ].join(" "),
      inputSchema: z.object({
        sessionId: z.string().uuid(),
        signature: z
          .string()
          .describe("base58 signature by the maker wallet over `stop <sessionId>`"),
      }),
    },
    async ({ sessionId, signature }) => {
      try {
        const session = await getSession(sessionId);
        if (!session) return failure("No such maker session.");

        const nacl = (await import("tweetnacl")).default;
        const bs58 = (await import("bs58")).default;
        const { PublicKey } = await import("@solana/web3.js");
        const ok = nacl.sign.detached.verify(
          new TextEncoder().encode(`stop ${sessionId}`),
          bs58.decode(signature),
          new PublicKey(session.maker).toBytes(),
        );
        if (!ok) return failure("That stop was not signed by the maker wallet.");

        session.status = "stopped";
        session.sessionKey = undefined;
        await saveSession(session);
        return text(publicView(session));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );
}

/** Called once a maker session is approved, to run the durable quote loop. */
export async function startMakerRun(sessionId: string): Promise<string | undefined> {
  const run = await start(makerSession, [sessionId]);
  return run?.runId;
}
