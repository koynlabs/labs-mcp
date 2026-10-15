/**
 * Builds a pump.fun create_v2 + creator buy paired with AMZNX and simulates
 * it on mainnet. Nothing is signed with a wallet key and nothing is sent.
 *
 * The payer is chosen from AMZNX holders, because a custom-pair buy spends
 * the quote asset the wallet already holds. A SOL-to-AMZNX swap does not fit
 * in the same transaction as the create.
 *
 *   npm run simulate:pump:amznx
 */
import assert from "node:assert/strict";
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
import { connection, decodeTx } from "../src/lib/solana";

const AMZNX = new PublicKey("Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg");
const BUY = 0.01;

/**
 * Public RPC blocks `getTokenLargestAccounts`. Recent AMZNX transactions
 * already name holders, and `getAccountInfo` on that token account is enough.
 */
async function payerWithAmznx(): Promise<{ owner: PublicKey; tokenAccount: PublicKey }> {
  const signatures = await connection().getSignaturesForAddress(AMZNX, { limit: 20 });
  for (const signature of signatures) {
    const tx = await connection()
      .getParsedTransaction(signature.signature, {
        maxSupportedTransactionVersion: 1 as unknown as 0,
      })
      .catch(() => null);
    const keys = tx?.transaction.message.accountKeys ?? [];
    for (const balance of tx?.meta?.postTokenBalances ?? []) {
      if (balance.mint !== AMZNX.toBase58() || !balance.owner) continue;
      const raw = BigInt(balance.uiTokenAmount.amount);
      if (raw < BigInt(Math.round(BUY * 2 * 10 ** balance.uiTokenAmount.decimals))) {
        continue;
      }
      const owner = new PublicKey(balance.owner);
      const info = await connection().getAccountInfo(owner);
      if (!info?.owner.equals(SystemProgram.programId)) continue;
      if (info.lamports < 0.05 * LAMPORTS_PER_SOL) continue;
      const account = keys[balance.accountIndex];
      const tokenAccount =
        account && "pubkey" in account ? account.pubkey : null;
      if (!tokenAccount) continue;
      return { owner, tokenAccount };
    }
  }
  throw new Error(
    "No AMZNX holder with enough tokens and SOL was found to simulate a buy. This script only simulates.",
  );
}

function tokenAmount(data: Buffer | Uint8Array): bigint {
  return Buffer.from(data).readBigUInt64LE(64);
}

async function main() {
  const { owner: payer, tokenAccount } = await payerWithAmznx();
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
    creatorBuySol: BUY,
    buyers: [{ publicKey: payer.toBase58(), sol: BUY }],
    slippagePercent: 10,
    priorityFeeSol: 0.0001,
    quoteMint: AMZNX.toBase58(),
    metadataUri: "https://ipfs.io/ipfs/bafkreiddiagnosticsimulationonly",
  });

  assert.equal(built.quoteMint, AMZNX.toBase58());
  assert.equal(built.txs.length, 2, "create+buy, then the extra buyer");
  assert.equal(built.txs[0]?.role, "create");
  assert.equal(built.txs[1]?.role, "buy");
  const tx = decodeTx(built.txs[0].tx);
  assert.ok(tx instanceof VersionedTransaction);
  assert.equal(tx.message.staticAccountKeys[0]?.toBase58(), payer.toBase58());
  assert.equal(tx.message.staticAccountKeys[1]?.toBase58(), built.mint);
  assert.equal(tx.message.header.numRequiredSignatures >= 2, true);
  assert.equal(
    tx.signatures.every((signature) => signature.every((byte) => byte === 0)),
    true,
  );
  assert.equal(tx.message.addressTableLookups.length, 1);
  assert.ok(
    tx.message.staticAccountKeys.some((key) => key.equals(AMZNX)),
    "the AMZNX mint has to be in the transaction Phantom simulates",
  );
  assert.equal(
    tx.message.staticAccountKeys.some((key) => key.toBase58() === WSOL_MINT),
    false,
  );

  const bytes = tx.serialize().length;
  assert.ok(bytes <= 1232, `transaction is ${bytes} bytes`);

  const simulated = await connection().simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: false,
    accounts: {
      encoding: "base64",
      addresses: [tokenAccount.toBase58()],
    },
  });
  const logs = simulated.value.logs ?? [];
  if (simulated.value.err) {
    throw new Error(
      `simulation failed: ${JSON.stringify(simulated.value.err)}\n${logs.slice(-12).join("\n")}`,
    );
  }
  assert.ok(logs.some((line) => line.includes("Instruction: CreateV2")));
  assert.ok(logs.some((line) => line.includes("Instruction: BuyV2")));
  const afterData = simulated.value.accounts?.[0]?.data;
  const quoteAfter = Buffer.isBuffer(afterData)
    ? tokenAmount(afterData)
    : Array.isArray(afterData)
      ? tokenAmount(Buffer.from(afterData[0], "base64"))
      : null;
  assert.equal(typeof quoteAfter, "bigint");
  const spent = Number(quoteBefore - (quoteAfter as bigint)) / 1e8;
  assert.ok(spent > 0, "the simulation has to spend AMZNX");

  const tables = await loadLookups(tx);
  const { blockhash } = await connection().getLatestBlockhash("confirmed");
  const refreshed = rewriteBlockhash(tx, blockhash, tables);
  const again = await connection().simulateTransaction(refreshed, {
    sigVerify: false,
    replaceRecentBlockhash: false,
  });
  if (again.value.err) {
    throw new Error(
      `refreshed blockhash failed simulation: ${JSON.stringify(again.value.err)}`,
    );
  }
  const stale = rewriteBlockhash(tx, PublicKey.default.toBase58(), tables);
  const expired = await connection().simulateTransaction(stale, {
    sigVerify: false,
    replaceRecentBlockhash: false,
  });
  assert.ok(expired.value.err, "a stale blockhash must fail simulation");

  console.log(
    JSON.stringify(
      {
        ok: true,
        sent: false,
        quoteMint: AMZNX.toBase58(),
        mint: built.mint,
        bytes,
        extraBuyerBytes: decodeTx(built.txs[1].tx).serialize().length,
        units: simulated.value.unitsConsumed,
        signatures: "empty",
        feePayer: payer.toBase58(),
        amznxSpentInSimulation: spent,
        instructions: ["CreateV2", "BuyV2"],
        refreshedBlockhashSimulated: true,
        staleBlockhashRejected: expired.value.err,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
