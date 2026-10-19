import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  buyExactInInstruction,
  getPdaCreatorVault,
  getPdaLaunchpadAuth,
  getPdaLaunchpadPoolId,
  getPdaLaunchpadVaultId,
  getPdaPlatformVault,
  initializeWithToken2022,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import bs58 from "bs58";
import { MAX_BUYERS, STONKS } from "../config";
import { resolveMetadata } from "./metadata";
import { assertHolderFees, assertStockPairing, type LaunchFeatures } from "./features";
import { connection, encodeTx } from "../solana";
import type { PendingTx } from "../types";
import type { BuiltLaunch, LaunchChecks, LaunchInput } from "./input";

const WSOL = "So11111111111111111111111111111111111111112";

type Pair = {
  mint: string;
  symbol: string;
  decimals: number;
  tokenProgram: string;
  launchable: boolean;
  launchLabReady?: boolean;
  /** StonkFun quote category. An xStock is `xstock`. */
  category?: string;
};

type Pricing = {
  quote: { mint: string; symbol: string; decimals: number; tokenProgram: string };
  raise: { raw: string; minimumRaw: string };
  curve: {
    programId: string;
    configId: string;
    baseDecimals: number;
    supply: string;
    totalSellA: string;
    cpmmCreatorFeeOn: number;
  };
  platform: { standard: string; reward: string };
  curveRule: { standard: string; reward: string };
  allowConfig?: {
    available?: { reward?: boolean };
    reward?: string;
  };
  modes?: {
    reward?: { transferFeeBps?: number[] };
  };
};

async function read<T>(path: string): Promise<T> {
  const response = await fetch(`${STONKS.publicApi}${path}`);
  const body = (await response.json()) as {
    data?: T;
    error?: { code: string; message: string };
  };
  if (!response.ok || !body.data) {
    throw new Error(
      `StonkFun ${path} failed: ${body.error?.message ?? response.status}`,
    );
  }
  return body.data;
}

/** Quote tokens a launch can be paired against right now. */
export async function launchablePairs(): Promise<Pair[]> {
  const data = await read<{ pairs: Pair[] }>(
    "/pairs?launchable=true&launchLabReady=true",
  );
  return data.pairs;
}

type BuyContext = {
  programId: PublicKey;
  configId: PublicKey;
  platformId: PublicKey;
  poolId: PublicKey;
  mint: PublicKey;
  quoteMint: PublicKey;
  quoteProgram: PublicKey;
  quoteDecimals: number;
  vaultA: PublicKey;
  vaultB: PublicKey;
  auth: PublicKey;
  creator: PublicKey;
};

/**
 * One wallet's buy against the fresh curve. `minAmountA` is zero on purpose:
 * every buy here rides in the same atomic Jito bundle as the create, executing
 * in a fixed order with nothing able to interleave, so there is no price to be
 * protected from. A partially landed bundle does not exist.
 */
function buyInstructions(
  context: BuyContext,
  owner: PublicKey,
  sol: number,
): TransactionInstruction[] {
  const quoteIsSol = context.quoteMint.toBase58() === WSOL;
  const baseAta = getAssociatedTokenAddressSync(
    context.mint,
    owner,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const quoteAta = getAssociatedTokenAddressSync(
    context.quoteMint,
    owner,
    false,
    context.quoteProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const amountIn = new BN(
    Math.round(sol * 10 ** context.quoteDecimals).toString(),
  );

  const instructions: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(
      owner,
      baseAta,
      owner,
      context.mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      owner,
      quoteAta,
      owner,
      context.quoteMint,
      context.quoteProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
  ];

  // A SOL-quoted launch trades against wrapped SOL, so the lamports have to be
  // wrapped first. Any other quote has to already be in the wallet.
  if (quoteIsSol) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: owner,
        toPubkey: quoteAta,
        lamports: Math.round(sol * LAMPORTS_PER_SOL),
      }),
      createSyncNativeInstruction(quoteAta, context.quoteProgram),
    );
  }

  instructions.push(
    buyExactInInstruction(
      context.programId,
      owner,
      context.auth,
      context.configId,
      context.platformId,
      context.poolId,
      baseAta,
      quoteAta,
      context.vaultA,
      context.vaultB,
      context.mint,
      context.quoteMint,
      TOKEN_2022_PROGRAM_ID,
      context.quoteProgram,
      getPdaPlatformVault(
        context.programId,
        context.platformId,
        context.quoteMint,
      ).publicKey,
      getPdaCreatorVault(
        context.programId,
        context.creator,
        context.quoteMint,
      ).publicKey,
      amountIn,
      new BN(0),
    ),
  );

  // Hand back the rent on the temporary wSOL account.
  if (quoteIsSol) {
    instructions.push(
      createCloseAccountInstruction(quoteAta, owner, owner, [], context.quoteProgram),
    );
  }

  return instructions;
}

/**
 * xStock quote for this mint, or null when it is not a stock pair.
 */
export async function stockQuote(
  mint: string,
): Promise<{ symbol: string } | null> {
  const pairs = await launchablePairs();
  const pair = pairs.find((item) => item.mint === mint && item.category === "xstock");
  return pair ? { symbol: pair.symbol } : null;
}

/**
 * Builds a StonkFun launch as a Raydium LaunchLab pool. Everything that decides
 * whether StonkFun adopts the pool comes from their pricing response rather than
 * from constants here, which is what makes an adopted launch indistinguishable
 * from one their own builder produced.
 */
export async function buildStonksLaunch(
  input: LaunchInput,
  checks: LaunchChecks = {},
): Promise<BuiltLaunch> {
  const quote = input.quoteMint ?? WSOL;
  const metadata = await resolveMetadata(input);
  const pairs = await launchablePairs();
  const pair = pairs.find((item) => item.mint === quote);
  if (!pair) {
    throw new Error(
      `${quote} is not launchable on StonkFun right now. Call stonks_pairs for the current list.`,
    );
  }
  if (checks.stockPairing) assertStockPairing(pair.category, pair.symbol || quote);

  const pricing = await read<Pricing>(`/launchlab/pricing?quoteMint=${quote}`);
  const rewardAvailable = pricing.allowConfig?.available?.reward === true;
  if (checks.holderFees) assertHolderFees(rewardAvailable, pair.symbol || quote);
  const reward = Boolean(checks.holderFees);
  const programId = new PublicKey(pricing.curve.programId);
  const configId = new PublicKey(pricing.curve.configId);
  // Reward mode writes the transfer-fee extension StonkFun collects and pays
  // out to holders. Standard mode is the fallback when that check is not required.
  const platformId = new PublicKey(reward ? pricing.platform.reward : pricing.platform.standard);
  const curveRule = new PublicKey(reward ? pricing.curveRule.reward : pricing.curveRule.standard);
  const allowConfigAddress = reward ? pricing.allowConfig?.reward : undefined;
  const transferFeeBps = pricing.modes?.reward?.transferFeeBps?.[0];
  if (reward && (!allowConfigAddress || !transferFeeBps)) {
    throw new Error(
      `Distributing fees to holders is not enabled for ${pair.symbol || quote}. StonkFun did not publish a reward platform for this quote.`,
    );
  }
  const allowConfig = allowConfigAddress ? new PublicKey(allowConfigAddress) : undefined;
  const quoteMint = new PublicKey(quote);
  const quoteProgram = new PublicKey(pair.tokenProgram);

  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  const creator = new PublicKey(input.creator);
  const auth = getPdaLaunchpadAuth(programId).publicKey;
  const poolId = getPdaLaunchpadPoolId(programId, mint, quoteMint).publicKey;
  const vaultA = getPdaLaunchpadVaultId(programId, poolId, mint).publicKey;
  const vaultB = getPdaLaunchpadVaultId(programId, poolId, quoteMint).publicKey;

  const initialize = initializeWithToken2022(
    programId,
    creator,
    creator,
    configId,
    platformId,
    auth,
    poolId,
    mint,
    quoteMint,
    vaultA,
    vaultB,
    quoteProgram,
    pricing.curve.baseDecimals,
    input.name,
    input.symbol,
    metadata.uri,
    {
      type: "ConstantCurve",
      supply: new BN(pricing.curve.supply),
      totalSellA: new BN(pricing.curve.totalSellA),
      totalFundRaisingB: new BN(pricing.raise.raw),
      migrateType: "cpmm",
    },
    new BN(0),
    new BN(0),
    new BN(0),
    pricing.curve.cpmmCreatorFeeOn,
    reward && transferFeeBps
      ? {
          transferFeeBasePoints: transferFeeBps,
          maxinumFee: new BN(pricing.curve.supply),
        }
      : undefined,
    allowConfig,
    curveRule,
  );

  // StonkFun requires the allow-config account, then its curve-rule account,
  // both read-only and in that order at the end.
  const last = initialize.keys.at(-1);
  const beforeLast = initialize.keys.at(-2);
  if (!last?.pubkey.equals(curveRule) || last.isSigner || last.isWritable) {
    throw new Error(
      "the LaunchLab initialize no longer ends with a read-only curve-rule account",
    );
  }
  if (
    allowConfig &&
    (!beforeLast?.pubkey.equals(allowConfig) || beforeLast.isSigner || beforeLast.isWritable)
  ) {
    throw new Error(
      "the LaunchLab initialize no longer carries a read-only allow-config account before the curve rule",
    );
  }

  const context: BuyContext = {
    programId,
    configId,
    platformId,
    poolId,
    mint,
    quoteMint,
    quoteProgram,
    quoteDecimals: pricing.quote.decimals,
    vaultA,
    vaultB,
    auth,
    creator,
  };

  const { blockhash, lastValidBlockHeight } =
    await connection().getLatestBlockhash("confirmed");
  const buyers = input.buyers.slice(0, MAX_BUYERS);

  const createMessage = new TransactionMessage({
    payerKey: creator,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
      initialize,
      ...(input.creatorBuySol > 0
        ? buyInstructions(context, creator, input.creatorBuySol)
        : []),
    ],
  }).compileToV0Message();

  const createTx = new VersionedTransaction(createMessage);

  const txs: PendingTx[] = [
    {
      index: 0,
      role: "create",
      signer: input.creator,
      tx: encodeTx(createTx),
      sol: input.creatorBuySol,
    },
  ];

  buyers.forEach((buyer) => {
    const owner = new PublicKey(buyer.publicKey);
    const message = new TransactionMessage({
      payerKey: owner,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
        ...buyInstructions(context, owner, buyer.sol),
      ],
    }).compileToV0Message();

    txs.push({
      index: txs.length,
      role: "buy",
      signer: buyer.publicKey,
      tx: encodeTx(new VersionedTransaction(message)),
      sol: buyer.sol,
    });
  });

  return {
    venue: "stonks",
    mint: mint.toBase58(),
    mintSecret: bs58.encode(mintKeypair.secretKey),
    blockhash,
    lastValidBlockHeight,
    metadataUri: metadata.uri,
    metadataHost: metadata.host,
    txs,
    buyers,
    ...(metadata.banner ? { banner: metadata.banner } : {}),
    ...(quote === WSOL ? {} : { quoteMint: quote }),
    ...(reward
      ? {
          features: {
            stockPairing: true,
            holderFees: true,
            mode: "reward",
            quoteSymbol: pair.symbol,
          } satisfies LaunchFeatures,
        }
      : {}),
  };
}
