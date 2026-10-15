/**
 * Simulates a pump.fun create_v2 + creator buy for two quotes taken from the
 * live registry: one Token-2022 xStock and one ordinary SPL quote (USDC when
 * it is listed). Nothing is signed with a wallet key and nothing is sent.
 *
 *   npm run simulate:pump:pairs
 */
import assert from "node:assert/strict";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  VersionedTransaction,
} from "@solana/web3.js";
import { WSOL_MINT } from "../src/lib/config";
import { loadLookups, rewriteBlockhash } from "../src/lib/launch/blockhash";
import { buildPumpLaunch } from "../src/lib/launch/pump";
import { listPumpPairs, type PumpPair } from "../src/lib/launch/pump-pairs";
import { connection, decodeTx } from "../src/lib/solana";

/** Public SOL-rich account. Used only as a simulated fee payer, never signed. */
const PUBLIC_PAYER = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
const AMZNX = "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function buyAmount(pair: PumpPair): number {
  return pair.decimals >= 8 ? 0.01 : 1;
}

function raw(amount: number, decimals: number): bigint {
  return BigInt(Math.round(amount * 10 ** decimals));
}

function pickPairs(pairs: PumpPair[]): { xstock: PumpPair; other: PumpPair } {
  const token2022 = TOKEN_2022_PROGRAM_ID.toBase58();
  const token = TOKEN_PROGRAM_ID.toBase58();
  const xstock =
    pairs.find((pair) => pair.mint === AMZNX && pair.tokenProgram === token2022) ??
    pairs.find((pair) => pair.tokenProgram === token2022 && pair.mint !== WSOL_MINT);
  const other =
    pairs.find((pair) => pair.mint === USDC && pair.tokenProgram === token) ??
    pairs.find((pair) => pair.tokenProgram === token && pair.mint !== WSOL_MINT);
  if (!xstock || !other) {
    throw new Error(
      "The live registry did not contain both a Token-2022 quote and a non-wSOL SPL quote.",
    );
  }
  return { xstock, other };
}

/**
 * The buy spends the owner's associated token account for the quote mint.
 * A recent transaction can also mention some other token account of the same
 * mint; watching that one reports a zero spend even though the buy landed.
 */
async function payerHolding(
  pair: PumpPair,
  needed: bigint,
): Promise<{ owner: PublicKey; tokenAccount: PublicKey }> {
  const mint = new PublicKey(pair.mint);
  const program = new PublicKey(pair.tokenProgram);
  const accept = async (owner: PublicKey) => {
    const tokenAccount = getAssociatedTokenAddressSync(mint, owner, true, program);
    const [ataInfo, ownerInfo] = await Promise.all([
      connection().getAccountInfo(tokenAccount),
      connection().getAccountInfo(owner),
    ]);
    if (!ownerInfo?.owner.equals(SystemProgram.programId)) return null;
    if (ownerInfo.lamports < 0.05 * LAMPORTS_PER_SOL) return null;
    if (!ataInfo || ataInfo.data.length < 72) return null;
    if (!ataInfo.data.subarray(0, 32).equals(mint.toBuffer())) return null;
    if (ataInfo.data.readBigUInt64LE(64) < needed) return null;
    return { owner, tokenAccount };
  };

  const whale = await accept(PUBLIC_PAYER);
  if (whale) return whale;

  const signatures = await connection().getSignaturesForAddress(mint, { limit: 25 });
  const seen = new Set<string>();
  for (const signature of signatures) {
    const tx = await connection()
      .getParsedTransaction(signature.signature, {
        maxSupportedTransactionVersion: 1 as unknown as 0,
      })
      .catch(() => null);
    for (const balance of tx?.meta?.postTokenBalances ?? []) {
      if (balance.mint !== pair.mint || !balance.owner || seen.has(balance.owner)) continue;
      seen.add(balance.owner);
      const found = await accept(new PublicKey(balance.owner));
      if (found) return found;
    }
  }
  throw new Error(
    `No wallet holding enough ${pair.mint} and SOL was found. This script only simulates.`,
  );
}

function tokenAmount(data: Buffer | Uint8Array): bigint {
  return Buffer.from(data).readBigUInt64LE(64);
}

async function simulatePair(pair: PumpPair, kind: "xstock" | "spl") {
  const buy = buyAmount(pair);
  const { owner: payer, tokenAccount } = await payerHolding(pair, raw(buy * 3, pair.decimals));
  const quoteInfo = await connection().getAccountInfo(tokenAccount);
  assert.ok(quoteInfo, `${tokenAccount.toBase58()} disappeared`);
  const quoteBefore = tokenAmount(quoteInfo.data);

  const built = await buildPumpLaunch({
    venue: "pump",
    creator: payer.toBase58(),
    name: "Sim Test",
    symbol: "SIM",
    imageUrl: "https://labs.levercoin.lol/icon-180.png",
    description: "simulation only, never sent",
    creatorBuySol: buy,
    buyers: [{ publicKey: payer.toBase58(), sol: buy }],
    slippagePercent: 10,
    priorityFeeSol: 0.0001,
    quoteMint: pair.mint,
    metadataUri: "https://ipfs.io/ipfs/bafkreiddiagnosticsimulationonly",
  });

  assert.equal(built.quoteMint, pair.mint);
  assert.equal(built.txs.length, 2);
  assert.equal(built.txs[0]?.role, "create");
  assert.equal(built.txs[1]?.role, "buy");
  const tx = decodeTx(built.txs[0].tx);
  assert.ok(tx instanceof VersionedTransaction, `${pair.mint} did not build a versioned transaction`);
  assert.equal(tx.message.staticAccountKeys[0]?.toBase58(), payer.toBase58());
  assert.equal(tx.message.staticAccountKeys[1]?.toBase58(), built.mint);
  assert.equal(tx.message.header.numRequiredSignatures >= 2, true, `${pair.mint} needs the wallet and the mint key`);
  assert.equal(
    tx.signatures.every((signature) => signature.every((byte) => byte === 0)),
    true,
    `${pair.mint} was handed to the wallet with a signature already set`,
  );
  assert.equal(tx.message.addressTableLookups.length, 1, pair.mint);
  const tables = await loadLookups(tx);
  const accountKeys = tx.message.getAccountKeys({ addressLookupTableAccounts: tables });
  const mentionsQuote = accountKeys.keySegments().some((segment) =>
    segment.some((key) => key.toBase58() === pair.mint),
  );
  assert.ok(mentionsQuote, `${pair.mint} has to be in the transaction Phantom simulates`);
  const bytes = tx.serialize().length;
  assert.ok(bytes <= 1232, `${pair.mint} transaction is ${bytes} bytes`);

  const simulated = await connection().simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: false,
    accounts: { encoding: "base64", addresses: [tokenAccount.toBase58()] },
  });
  const logs = simulated.value.logs ?? [];
  if (simulated.value.err) {
    throw new Error(
      `${pair.mint} simulation failed: ${JSON.stringify(simulated.value.err)}\n${logs.slice(-12).join("\n")}`,
    );
  }
  assert.ok(
    logs.some((line) => line.includes("Instruction: CreateV2")),
    `${pair.mint} logs: ${logs.slice(-8).join(" | ")}`,
  );
  assert.ok(
    logs.some((line) => line.includes("Instruction: BuyV2")),
    `${pair.mint} logs: ${logs.slice(-8).join(" | ")}`,
  );
  const ata = getAssociatedTokenAddressSync(
    new PublicKey(pair.mint),
    payer,
    true,
    new PublicKey(pair.tokenProgram),
  );
  assert.equal(
    tokenAccount.toBase58(),
    ata.toBase58(),
    `${pair.mint} buy spends the quote associated token account`,
  );
  const afterData = simulated.value.accounts?.[0]?.data;
  const quoteAfter = Buffer.isBuffer(afterData)
    ? tokenAmount(afterData)
    : Array.isArray(afterData)
      ? tokenAmount(Buffer.from(afterData[0], "base64"))
      : null;
  assert.equal(
    typeof quoteAfter,
    "bigint",
    `${pair.mint} post-simulation account data was ${JSON.stringify(afterData)?.slice(0, 80)}`,
  );
  const spent = Number(quoteBefore - (quoteAfter as bigint)) / 10 ** pair.decimals;
  assert.ok(
    spent > 0,
    `${pair.mint} simulation has to spend the quote asset (payer ${payer.toBase58()} account ${tokenAccount.toBase58()} ata ${ata.toBase58()} before ${quoteBefore} after ${quoteAfter} dataType ${afterData === null || afterData === undefined ? String(afterData) : afterData.constructor?.name})`,
  );

  const { blockhash } = await connection().getLatestBlockhash("confirmed");
  const refreshed = rewriteBlockhash(tx, blockhash, tables);
  const again = await connection().simulateTransaction(refreshed, {
    sigVerify: false,
    replaceRecentBlockhash: false,
  });
  if (again.value.err) {
    throw new Error(
      `${pair.mint} refreshed blockhash failed: ${JSON.stringify(again.value.err)}`,
    );
  }

  return {
    kind,
    ok: true,
    sent: false,
    quoteMint: pair.mint,
    source: pair.source,
    tokenProgram: pair.tokenProgram,
    decimals: pair.decimals,
    mint: built.mint,
    bytes,
    extraBuyerBytes: decodeTx(built.txs[1].tx).serialize().length,
    units: simulated.value.unitsConsumed,
    signatures: "empty",
    feePayer: payer.toBase58(),
    quoteSpentInSimulation: spent,
    instructions: ["CreateV2", "BuyV2"],
    refreshedBlockhashSimulated: true,
  };
}

async function main() {
  const pairs = await listPumpPairs();
  assert.ok(
    pairs.some((pair) => pair.mint === WSOL_MINT && pair.source === "sol"),
    "wSOL missing from the live registry",
  );
  assert.ok(pairs.length > 2, "the registry should be more than wSOL");
  const { xstock, other } = pickPairs(pairs);
  assert.equal(xstock.tokenProgram, TOKEN_2022_PROGRAM_ID.toBase58());
  assert.equal(other.tokenProgram, TOKEN_PROGRAM_ID.toBase58());
  assert.notEqual(other.mint, WSOL_MINT);
  assert.notEqual(other.mint, xstock.mint);

  const bogus = await buildPumpLaunch({
    venue: "pump",
    creator: Keypair.generate().publicKey.toBase58(),
    name: "Sim",
    symbol: "SIM",
    imageUrl: "https://labs.levercoin.lol/icon-180.png",
    description: "simulation only, never sent",
    creatorBuySol: 0,
    buyers: [],
    slippagePercent: 10,
    priorityFeeSol: 0,
    quoteMint: Keypair.generate().publicKey.toBase58(),
    metadataUri: "https://ipfs.io/ipfs/bafkreiddiagnosticsimulationonly",
  }).then(
    () => {
      throw new Error("an unlisted quote mint was accepted");
    },
    (error: unknown) => error,
  );
  assert.match(
    bogus instanceof Error ? bogus.message : String(bogus),
    /not a pump\.fun quote asset/,
  );
  assert.match(bogus instanceof Error ? bogus.message : String(bogus), /pump_pairs/);

  const results = [await simulatePair(xstock, "xstock"), await simulatePair(other, "spl")];
  console.log(JSON.stringify({ ok: true, sent: false, registry: pairs.length, results }, null, 2));
}

function sanitizeForLog(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  return message.replace(/[\r\n\u2028\u2029]/g, " ");
}

main().catch((error) => {
  console.error(sanitizeForLog(error));
  process.exit(1);
});
