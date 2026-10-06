import BN from "bn.js";
import {
  OnlinePumpSdk,
  PUMP_PROGRAM_ID,
  PUMP_SDK,
  computeFeesBps,
  getBuyTokenAmountFromSolAmount,
  newBondingCurve,
  type BondingCurve,
  type FeeConfig,
  type Global,
} from "@pump-fun/pump-sdk";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PACKET_DATA_SIZE,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type AccountInfo,
} from "@solana/web3.js";
import { MAX_BUYERS } from "../config";
import { connection, encodeTx } from "../solana";
import type { PendingTx } from "../types";
import type { BuiltLaunch, LaunchInput } from "./input";
import { resolveMetadata } from "./metadata";

/**
 * Jito drops a bundle whose first transaction does not pay a tip. PumpPortal
 * used to hide this inside the blob; the tip is now a plain SOL transfer.
 * https://jito-foundation.gitbook.io/mev/mev-payment-and-distribution/on-chain-addresses
 */
const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
].map((address) => new PublicKey(address));

const CREATE_COMPUTE_UNITS = 600_000;
const BUY_COMPUTE_UNITS = 250_000;

/**
 * Builds a pump.fun create_v2 launch with the official SDK. Every account is
 * static, so a wallet can simulate the create before it signs. The mint
 * keypair is generated here, signs the create once, and is discarded; it
 * never holds funds.
 */
export async function buildPumpLaunch(
  input: LaunchInput,
): Promise<BuiltLaunch> {
  const buyers = input.buyers.slice(0, MAX_BUYERS);
  const metadata = await resolveMetadata(input);
  if (metadata.uri.length > 200) {
    throw new Error(
      "pump.fun stores the metadata URI on the coin and rejects anything longer than 200 characters.",
    );
  }

  const creator = new PublicKey(input.creator);
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  const online = new OnlinePumpSdk(connection());
  const [global, feeConfig] = await Promise.all([
    online.fetchGlobal(),
    online.fetchFeeConfig(),
  ]);
  const { blockhash } = await connection().getLatestBlockhash("confirmed");

  let curve = openingCurve(global, creator);
  const creatorBuy =
    input.creatorBuySol > 0 ? lamports(input.creatorBuySol) : null;
  const creatorQuote = creatorBuy
    ? takeBuy(global, feeConfig, curve, creatorBuy)
    : null;
  if (creatorQuote) curve = creatorQuote.curve;

  const tip = tipInstruction(creator, input.priorityFeeSol);
  const bundledBuy =
    creatorBuy && creatorQuote
      ? await PUMP_SDK.createV2AndBuyV2Instructions({
          global,
          mint,
          name: input.name,
          symbol: input.symbol,
          uri: metadata.uri,
          creator,
          user: creator,
          amount: creatorQuote.tokens,
          // The SDK adds a hardcoded 1% on this path. Pre-scale so the SOL
          // the program is allowed to spend is the creator's own slippage cap.
          quoteAmount: quoteBeforeSdkSlippage(creatorBuy, input.slippagePercent),
          mayhemMode: false,
          cashback: false,
        })
      : [
          await PUMP_SDK.createV2Instruction({
            mint,
            name: input.name,
            symbol: input.symbol,
            uri: metadata.uri,
            creator,
            user: creator,
            mayhemMode: false,
            cashback: false,
          }),
        ];

  const withBuy = compile(
    creator,
    blockhash,
    budget(CREATE_COMPUTE_UNITS, bundledBuy, tip),
  );
  const createFits = creatorBuy === null || fits(withBuy);
  const createTx = createFits
    ? withBuy
    : compile(
        creator,
        blockhash,
        budget(
          CREATE_COMPUTE_UNITS,
          [
            await PUMP_SDK.createV2Instruction({
              mint,
              name: input.name,
              symbol: input.symbol,
              uri: metadata.uri,
              creator,
              user: creator,
              mayhemMode: false,
              cashback: false,
            }),
          ],
          tip,
        ),
      );

  if (!fits(createTx)) {
    throw new Error(
      "The pump.fun create transaction is larger than Solana allows. Shorten the name, symbol, or metadata URI.",
    );
  }

  createTx.sign([mintKeypair]);
  await assertSimulates(createTx, "create");

  const txs: PendingTx[] = [
    {
      index: 0,
      role: "create",
      signer: input.creator,
      tx: encodeTx(createTx),
      ...(createFits ? { sol: input.creatorBuySol } : {}),
    },
  ];

  if (!createFits && creatorBuy && creatorQuote) {
    await pushBuy(txs, {
      global,
      blockhash,
      mint,
      curve: openingCurve(global, creator),
      user: creator,
      tokens: creatorQuote.tokens,
      sol: creatorBuy,
      solUi: input.creatorBuySol,
      slippagePercent: input.slippagePercent,
    });
  }

  for (const buyer of buyers) {
    const sol = lamports(buyer.sol);
    const quote = takeBuy(global, feeConfig, curve, sol);
    curve = quote.curve;
    await pushBuy(txs, {
      global,
      blockhash,
      mint,
      curve: quote.curveBefore,
      user: new PublicKey(buyer.publicKey),
      tokens: quote.tokens,
      sol,
      solUi: buyer.sol,
      slippagePercent: input.slippagePercent,
    });
  }

  return {
    venue: "pump",
    mint: mint.toBase58(),
    metadataUri: metadata.uri,
    metadataHost: metadata.host,
    txs,
    buyers,
  };
}

function openingCurve(global: Global, creator: PublicKey): BondingCurve {
  return {
    ...newBondingCurve(global),
    creator,
    isMayhemMode: false,
    isCashbackCoin: false,
  };
}

/**
 * Quotes a buy against the curve as it stands, then advances the reserves by
 * what the program keeps after fees. Later buys in the same bundle execute
 * after this one, so they have to be quoted on the updated curve.
 */
function takeBuy(
  global: Global,
  feeConfig: FeeConfig,
  curve: BondingCurve,
  sol: BN,
): { tokens: BN; curveBefore: BondingCurve; curve: BondingCurve } {
  const tokens = getBuyTokenAmountFromSolAmount({
    global,
    feeConfig,
    mintSupply: global.tokenTotalSupply,
    bondingCurve: curve,
    amount: sol,
    quoteMint: curve.quoteMint,
  });
  if (tokens.isZero()) {
    throw new Error("A buy in this launch is too small to receive any tokens.");
  }

  const { protocolFeeBps, creatorFeeBps } = computeFeesBps({
    global,
    feeConfig,
    mintSupply: global.tokenTotalSupply,
    virtualQuoteReserves: curve.virtualQuoteReserves,
    virtualTokenReserves: curve.virtualTokenReserves,
    quoteMint: curve.quoteMint,
    creatorFeeBps: curve.creatorFeeBps,
  });
  const creatorFee = curve.creator.equals(PublicKey.default)
    ? new BN(0)
    : creatorFeeBps;
  const kept = sol
    .subn(1)
    .muln(10_000)
    .div(protocolFeeBps.add(creatorFee).addn(10_000));

  return {
    tokens,
    curveBefore: curve,
    curve: {
      ...curve,
      virtualQuoteReserves: curve.virtualQuoteReserves.add(kept),
      virtualTokenReserves: curve.virtualTokenReserves.sub(tokens),
      realTokenReserves: curve.realTokenReserves.sub(tokens),
      realQuoteReserves: curve.realQuoteReserves.add(kept),
    },
  };
}

/**
 * `createV2AndBuyV2Instructions` always passes slippage 1 into the buy, which
 * inflates the quote by 1%. Hand it a smaller quote so the amount the program
 * may spend is the creator's slippage cap, not the cap plus another 1%.
 */
function quoteBeforeSdkSlippage(sol: BN, slippagePercent: number): BN {
  const cap = spendCap(sol, slippagePercent);
  return cap.muln(1000).addn(1009).divn(1010);
}

function spendCap(sol: BN, slippagePercent: number): BN {
  const tenths = Math.floor(slippagePercent * 10);
  return sol.add(sol.muln(tenths).divn(1000));
}

function lamports(sol: number): BN {
  if (!Number.isFinite(sol) || sol < 0) {
    throw new Error("A SOL amount in this launch is not a usable number.");
  }
  return new BN(Math.round(sol * LAMPORTS_PER_SOL));
}

function tipInstruction(
  from: PublicKey,
  priorityFeeSol: number,
): TransactionInstruction | null {
  const lamports = Math.round(priorityFeeSol * LAMPORTS_PER_SOL);
  if (lamports <= 0) return null;
  const to =
    JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];
  return SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports });
}

function budget(
  units: number,
  instructions: TransactionInstruction[],
  tip: TransactionInstruction | null,
): TransactionInstruction[] {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ...instructions,
    ...(tip ? [tip] : []),
  ];
}

function compile(
  payer: PublicKey,
  blockhash: string,
  instructions: TransactionInstruction[],
): VersionedTransaction {
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message(),
  );
  if (tx.message.addressTableLookups.length > 0) {
    throw new Error(
      "A pump.fun launch transaction included an address lookup table.",
    );
  }
  return tx;
}

function fits(tx: VersionedTransaction): boolean {
  try {
    return tx.serialize().length <= PACKET_DATA_SIZE;
  } catch (error) {
    // web3.js serializes into a 1232-byte buffer and throws once the message
    // overruns it. That is the same limit, so the transaction does not fit.
    if (error instanceof RangeError) return false;
    throw error;
  }
}

/**
 * The create can be simulated on its own. A later buy spends the mint this
 * bundle creates, so a missing account there means the buy is waiting on the
 * create, which is how the bundle is ordered.
 */
async function assertSimulates(
  tx: VersionedTransaction,
  label: string,
  allowMissingAccount = false,
): Promise<void> {
  const simulation = await connection().simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });
  if (!simulation.value.err) return;
  if (allowMissingAccount && waitingOnCreate(simulation.value.err, simulation.value.logs)) {
    return;
  }
  const logs = (simulation.value.logs ?? []).slice(-6).join(" | ");
  throw new Error(
    `The ${label} would fail on chain (${JSON.stringify(simulation.value.err)})${logs ? `: ${logs}` : ""}.`,
  );
}

/**
 * A buy that follows the create in the same bundle spends a mint that does
 * not exist until that create lands. The token program then refuses the
 * buyer's new token account, which is not a problem in the buy itself.
 */
function waitingOnCreate(err: unknown, logs: string[] | null): boolean {
  if (err === "AccountNotFound") return true;
  const text = (logs ?? []).join("\n");
  if (text.includes("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P failed")) {
    return false;
  }
  return text.includes("IncorrectProgramId");
}

async function pushBuy(
  txs: PendingTx[],
  args: {
    global: Global;
    blockhash: string;
    mint: PublicKey;
    curve: BondingCurve;
    user: PublicKey;
    tokens: BN;
    sol: BN;
    solUi: number;
    slippagePercent: number;
  },
): Promise<void> {
  const instructions = await PUMP_SDK.buyV2Instructions({
    global: args.global,
    bondingCurveAccountInfo: absentCurve,
    bondingCurve: args.curve,
    associatedUserAccountInfo: null,
    mint: args.mint,
    user: args.user,
    amount: args.tokens,
    quoteAmount: args.sol,
    slippage: args.slippagePercent,
  });
  const tx = compile(
    args.user,
    args.blockhash,
    budget(BUY_COMPUTE_UNITS, instructions, null),
  );
  if (!fits(tx)) {
    throw new Error(
      "A buy in this launch is larger than Solana allows. Launch with fewer buyer wallets.",
    );
  }
  await assertSimulates(tx, "buy", true);
  txs.push({
    index: txs.length,
    role: "buy",
    signer: args.user.toBase58(),
    tx: encodeTx(tx),
    sol: args.solUi,
  });
}

/** buyV2Instructions only reads this to decide whether the buyer already has a token account. */
const absentCurve: AccountInfo<Buffer> = {
  data: Buffer.alloc(0),
  executable: false,
  lamports: 0,
  owner: PUMP_PROGRAM_ID,
};
