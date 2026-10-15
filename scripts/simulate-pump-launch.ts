/**
 * Builds a pump.fun create_v2 + creator buy and simulates it on mainnet.
 * Nothing is signed with a wallet key and nothing is sent.
 *
 *   SIM_PAYER=<funded address> npm run simulate:pump
 *
 * The payer only has to exist and hold enough SOL for the simulated buy.
 * The default is a public mainnet account; the simulation does not move it.
 */
import assert from "node:assert/strict";
import { LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { loadLookups, rewriteBlockhash } from "../src/lib/launch/blockhash";
import { buildPumpLaunch } from "../src/lib/launch/pump";
import { connection, decodeTx } from "../src/lib/solana";

const PAYER =
  process.env.SIM_PAYER ?? "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const BUY_SOL = 0.5;

async function main() {
  const payer = new PublicKey(PAYER);
  const before = await connection().getBalance(payer);
  if (before < (BUY_SOL + 0.05) * LAMPORTS_PER_SOL) {
    throw new Error(
      `${PAYER} has ${before / LAMPORTS_PER_SOL} SOL. Set SIM_PAYER to a wallet that can cover a ${BUY_SOL} SOL buy. This script only simulates.`,
    );
  }

  const built = await buildPumpLaunch({
    venue: "pump",
    creator: PAYER,
    name: "Sim Test",
    symbol: "SIM",
    imageUrl: "https://labs.levercoin.lol/icon-180.png",
    description: "simulation only, never sent",
    creatorBuySol: BUY_SOL,
    buyers: [],
    slippagePercent: 10,
    priorityFeeSol: 0.0001,
    metadataUri: "https://ipfs.io/ipfs/bafkreiddiagnosticsimulationonly",
  });

  assert.equal(built.txs.length, 1, "create and creator buy must be one transaction");
  assert.equal(built.txs[0]?.role, "create");
  const tx = decodeTx(built.txs[0].tx);
  assert.ok(tx instanceof VersionedTransaction);
  assert.equal(tx.message.staticAccountKeys[0]?.toBase58(), PAYER);
  assert.equal(tx.message.staticAccountKeys[1]?.toBase58(), built.mint);
  assert.equal(tx.message.header.numRequiredSignatures >= 2, true);
  assert.equal(
    tx.signatures.every((signature) => signature.every((byte) => byte === 0)),
    true,
    "Phantom must receive the transaction before the mint key signs",
  );
  assert.equal(tx.message.addressTableLookups.length, 1);

  const bytes = tx.serialize().length;
  assert.ok(bytes <= 1232, `transaction is ${bytes} bytes`);

  const simulated = await connection().simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: false,
    accounts: { encoding: "base64", addresses: [PAYER] },
  });
  const logs = simulated.value.logs ?? [];
  if (simulated.value.err) {
    throw new Error(
      `simulation failed: ${JSON.stringify(simulated.value.err)}\n${logs.slice(-12).join("\n")}`,
    );
  }
  assert.ok(logs.some((line) => line.includes("Instruction: CreateV2")));
  assert.ok(logs.some((line) => line.includes("Instruction: BuyV2")));

  const after = simulated.value.accounts?.[0]?.lamports;
  const spent =
    typeof after === "number" ? (before - after) / LAMPORTS_PER_SOL : null;

  const tables = await loadLookups(tx);
  const { blockhash } = await connection().getLatestBlockhash("confirmed");
  const refreshed = rewriteBlockhash(tx, blockhash, tables);
  assert.equal(
    refreshed.signatures.every((signature) => signature.every((byte) => byte === 0)),
    true,
  );
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
        mint: built.mint,
        bytes,
        units: simulated.value.unitsConsumed,
        signatures: "empty",
        feePayer: PAYER,
        solSpentInSimulation: spent,
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
  const message =
    error instanceof Error ? error.message : String(error);
  const sanitizedMessage = message.replace(/[\r\n]/g, "");
  console.error(sanitizedMessage);
  process.exit(1);
});
