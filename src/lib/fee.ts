import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { FEE_SOL, treasury } from "./config";
import { connection, decodeTx } from "./solana";
import type { PendingTx } from "./types";

export function feeLamports(): number {
  return Math.round(FEE_SOL * LAMPORTS_PER_SOL);
}

/**
 * The fee is its own transaction inside the atomic Jito bundle rather than an
 * instruction appended to the venue's create transaction. Both venues hand back
 * an already-compiled transaction, and recompiling one to inject an instruction
 * would mean re-deriving its address lookup tables. A bundle lands all-or-none,
 * so a launch still cannot reach the chain without the fee.
 */
export async function buildFeeTx(
  payer: string,
  index: number,
): Promise<PendingTx> {
  const from = new PublicKey(payer);
  const { blockhash } = await connection().getLatestBlockhash("confirmed");

  const message = new TransactionMessage({
    payerKey: from,
    recentBlockhash: blockhash,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: from,
        toPubkey: treasury(),
        lamports: feeLamports(),
      }),
    ],
  }).compileToV0Message();

  return {
    index,
    role: "fee",
    signer: payer,
    tx: Buffer.from(new VersionedTransaction(message).serialize()).toString(
      "base64",
    ),
    sol: FEE_SOL,
  };
}

/**
 * Re-reads a built fee transaction and confirms it really pays the treasury.
 * Called before submit so a bundle is never broadcast on the strength of the
 * label alone.
 */
export function assertPaysTreasury(pending: PendingTx): void {
  const tx = decodeTx(pending.tx);
  if (!(tx instanceof VersionedTransaction)) {
    throw new Error("fee transaction has an unexpected format");
  }

  const keys = tx.message.getAccountKeys().staticAccountKeys;
  const expected = treasury();
  const paid = tx.message.compiledInstructions.some((instruction) => {
    const programId = keys[instruction.programIdIndex];
    if (!programId?.equals(SystemProgram.programId)) return false;
    // System transfer: 4-byte discriminator (2) then a u64 of lamports.
    const data = Buffer.from(instruction.data);
    if (data.length !== 12 || data.readUInt32LE(0) !== 2) return false;
    if (data.readBigUInt64LE(4) < BigInt(feeLamports())) return false;
    const destination = keys[instruction.accountKeyIndexes[1]];
    return Boolean(destination?.equals(expected));
  });

  if (!paid) {
    throw new Error(
      `fee transaction does not pay ${FEE_SOL} SOL to ${expected.toBase58()}`,
    );
  }
}
