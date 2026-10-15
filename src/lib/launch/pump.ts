import BN from "bn.js";
import {
  OnlinePumpSdk,
  PUMP_PROGRAM_ID,
  PUMP_SDK,
  UnsupportedQuoteMintError,
  computeFeesBps,
  getBuyTokenAmountFromSolAmount,
  isLegacyQuoteMint,
  newBondingCurve,
  type BondingCurve,
  type FeeConfig,
  type Global,
  type QuoteControl,
} from "@pump-fun/pump-sdk";
import bs58 from "bs58";
import {
  AddressLookupTableAccount,
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
import { MAX_BUYERS, PUMP, WSOL_MINT } from "../config";
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
/** A Token-2022 quote (an xStock) costs more compute than a SOL quote. */
const TOKEN_QUOTE_CREATE_UNITS = 1_000_000;
const TOKEN_QUOTE_BUY_UNITS = 400_000;

/**
 * The lookup table live pump.fun creates use, so the create and the creator's
 * buy fit in one transaction. A split buy cannot be simulated: the mint does
 * not exist until the create in front of it lands, and Phantom then shows
 * "Failed to simulate". Override with LABS_PUMP_LUT if this table is retired.
 */
const NOT_DEACTIVATED = BigInt("18446744073709551615");

/**
 * Builds a pump.fun create_v2 launch with the official SDK. The creator's
 * opening buy stays in the create transaction, every signature slot is empty,
 * and the mint secret is returned so the server can co-sign after the wallet.
 * The mint key never holds funds.
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
  const requestedQuote = input.quoteMint
    ? new PublicKey(input.quoteMint)
    : new PublicKey(WSOL_MINT);
  const [global, feeConfig, quoteControl, quote] = await Promise.all([
    online.fetchGlobal(),
    online.fetchFeeConfig(),
    online.fetchQuoteControl(),
    resolvePumpQuote(online, requestedQuote),
  ]);
  const [{ blockhash, lastValidBlockHeight }, lookupTable] = await Promise.all([
    connection().getLatestBlockhash("confirmed"),
    pumpLookupTable(),
  ]);
  const tokenQuote = !isLegacyQuoteMint(quote.mint);

  let curve = openingCurve(global, creator, quote.mint, quoteControl);
  const creatorBuy =
    input.creatorBuySol > 0
      ? quoteAtoms(input.creatorBuySol, quote.decimals)
      : null;
  const creatorQuote = creatorBuy
    ? takeBuy(global, feeConfig, curve, creatorBuy)
    : null;
  if (creatorQuote) curve = creatorQuote.curve;

  const tip = tipInstruction(creator, input.priorityFeeSol);
  const quoteAccounts = tokenQuote
    ? { quoteMint: quote.mint, quoteTokenProgram: quote.quoteTokenProgram }
    : {};
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
          // The SDK adds a hardcoded 1% on this path. Pre-scale so the quote
          // the program is allowed to spend is the creator's own slippage cap.
          quoteAmount: quoteBeforeSdkSlippage(creatorBuy, input.slippagePercent),
          mayhemMode: false,
          cashback: false,
          ...quoteAccounts,
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
            ...quoteAccounts,
          }),
        ];

  // The creator buy has to share the create. A following transaction spends a
  // mint Phantom cannot see yet, so its simulation fails closed.
  const createTx = compile(
    creator,
    blockhash,
    budget(tokenQuote ? TOKEN_QUOTE_CREATE_UNITS : CREATE_COMPUTE_UNITS, bundledBuy, tip),
    lookupTable,
  );
  if (!fits(createTx)) {
    throw new Error(
      "The pump.fun create transaction is larger than Solana allows. Shorten the name, symbol, or metadata URI.",
    );
  }
  await assertQuoteBuySimulatable(createTx, "create", false, tokenQuote, quote.mint);

  const txs: PendingTx[] = [
    {
      index: 0,
      role: "create",
      signer: input.creator,
      tx: encodeTx(createTx),
      ...(creatorBuy ? { sol: input.creatorBuySol } : {}),
    },
  ];

  for (const buyer of buyers) {
    const sol = quoteAtoms(buyer.sol, quote.decimals);
    const priced = takeBuy(global, feeConfig, curve, sol);
    curve = priced.curve;
    await pushBuy(txs, {
      global,
      blockhash,
      lookupTable,
      mint,
      curve: priced.curveBefore,
      user: new PublicKey(buyer.publicKey),
      tokens: priced.tokens,
      sol,
      solUi: buyer.sol,
      slippagePercent: input.slippagePercent,
      quoteTokenProgram: quote.quoteTokenProgram,
      tokenQuote,
      quoteMint: quote.mint,
      buyUnits: tokenQuote ? TOKEN_QUOTE_BUY_UNITS : BUY_COMPUTE_UNITS,
    });
  }

  return {
    venue: "pump",
    mint: mint.toBase58(),
    mintSecret: bs58.encode(mintKeypair.secretKey),
    blockhash,
    lastValidBlockHeight,
    metadataUri: metadata.uri,
    metadataHost: metadata.host,
    txs,
    buyers,
    ...(metadata.banner ? { banner: metadata.banner } : {}),
    ...(tokenQuote ? { quoteMint: quote.mint.toBase58() } : {}),
  };
}

/**
 * wSOL is the default and skips the quote-control accounts. Anything else has
 * to be on Global's whitelist or in the QuoteControl registry, which is the
 * list create_v2 itself consults.
 */
async function resolvePumpQuote(
  online: OnlinePumpSdk,
  quoteMint: PublicKey,
) {
  try {
    return await online.resolveQuoteMint(quoteMint);
  } catch (error) {
    if (error instanceof UnsupportedQuoteMintError) {
      throw new Error(
        `${quoteMint.toBase58()} is not a pump.fun quote asset. Call pump_pairs for the live registry (wSOL, Global whitelist, and QuoteControl), or use wSOL (${WSOL_MINT}).`,
      );
    }
    throw error;
  }
}

async function pumpLookupTable(): Promise<AddressLookupTableAccount> {
  const key = new PublicKey(PUMP.lookupTable);
  const loaded = await connection().getAddressLookupTable(key);
  if (!loaded.value) {
    throw new Error(
      `pump.fun address lookup table ${key.toBase58()} was not found. Set LABS_PUMP_LUT to a live table.`,
    );
  }
  if (loaded.value.state.deactivationSlot !== NOT_DEACTIVATED) {
    const slot = await connection().getSlot("confirmed");
    if (BigInt(slot) >= loaded.value.state.deactivationSlot) {
      throw new Error(
        `pump.fun address lookup table ${key.toBase58()} is deactivated. Set LABS_PUMP_LUT to a live table.`,
      );
    }
  }
  return loaded.value;
}

function openingCurve(
  global: Global,
  creator: PublicKey,
  quoteMint: PublicKey,
  quoteControl: QuoteControl | null,
): BondingCurve {
  return {
    ...newBondingCurve(global, quoteMint, quoteControl),
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

function quoteAtoms(amount: number, decimals: number): BN {
  if (!Number.isFinite(amount) || amount < 0 || decimals < 0 || decimals > 18) {
    throw new Error("A buy amount in this launch is not a usable number.");
  }
  return new BN(Math.round(amount * 10 ** decimals));
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
  lookupTable: AddressLookupTableAccount,
): VersionedTransaction {
  try {
    return new VersionedTransaction(
      new TransactionMessage({
        payerKey: payer,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message([lookupTable]),
    );
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Error(
        "The pump.fun transaction is larger than Solana allows. Shorten the name, symbol, or metadata URI.",
      );
    }
    throw error;
  }
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
/**
 * Simulates the exact transaction a wallet will be shown. `sigVerify` stays
 * off because the wallet has not signed yet; the blockhash is the one in the
 * message, so an expired hash fails here instead of in Phantom.
 */
export async function assertPumpSimulatable(
  tx: VersionedTransaction,
  label: string,
  allowMissingAccount = false,
): Promise<void> {
  const simulation = await connection().simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: false,
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

async function assertQuoteBuySimulatable(
  tx: VersionedTransaction,
  label: string,
  allowMissingAccount: boolean,
  tokenQuote: boolean,
  quoteMint: PublicKey,
): Promise<void> {
  try {
    await assertPumpSimulatable(tx, label, allowMissingAccount);
  } catch (error) {
    if (!tokenQuote || !(error instanceof Error)) throw error;
    throw new Error(
      `${error.message} This buy spends ${quoteMint.toBase58()}, which the wallet has to hold already. A swap from SOL into that asset does not fit in the same transaction as the create.`,
    );
  }
}

async function pushBuy(
  txs: PendingTx[],
  args: {
    global: Global;
    blockhash: string;
    lookupTable: AddressLookupTableAccount;
    mint: PublicKey;
    curve: BondingCurve;
    user: PublicKey;
    tokens: BN;
    sol: BN;
    solUi: number;
    slippagePercent: number;
    quoteTokenProgram: PublicKey;
    tokenQuote: boolean;
    quoteMint: PublicKey;
    buyUnits: number;
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
    quoteTokenProgram: args.quoteTokenProgram,
  });
  const tx = compile(
    args.user,
    args.blockhash,
    budget(args.buyUnits, instructions, null),
    args.lookupTable,
  );
  if (!fits(tx)) {
    throw new Error(
      "A buy in this launch is larger than Solana allows. Launch with fewer buyer wallets.",
    );
  }
  await assertQuoteBuySimulatable(tx, "buy", true, args.tokenQuote, args.quoteMint);
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
