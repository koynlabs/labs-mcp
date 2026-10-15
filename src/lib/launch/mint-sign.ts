import { Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { decodeTx, encodeTx, messageBytes } from "../solana";

/**
 * Adds the mint signature after the wallet has signed. Phantom's guidance for
 * a transaction with two signers is: the wallet signs first (`signTransaction`,
 * not `signAndSendTransaction`), then the other signer signs the same message.
 * A mint signature that is already present when Phantom simulates makes it
 * keep the embedded blockhash and, once that hash has expired, report that
 * simulation failed.
 */
export function cosignMint(
  signedBase64: string,
  mintSecretBase58: string,
  mint: string,
): string {
  const tx = decodeTx(signedBase64);
  if (!(tx instanceof VersionedTransaction)) {
    throw new Error("launch transactions are versioned");
  }
  const before = Buffer.from(messageBytes(tx));
  const keys = tx.message.staticAccountKeys;
  const required = tx.message.header.numRequiredSignatures;
  const index = keys
    .slice(0, required)
    .findIndex((key) => key.toBase58() === mint);
  if (index < 0) return signedBase64;

  const secret = bs58.decode(mintSecretBase58);
  try {
    const existing = tx.signatures[index];
    if (!existing?.some((byte) => byte !== 0)) {
      tx.sign([Keypair.fromSecretKey(secret)]);
    }
  } finally {
    secret.fill(0);
  }

  const after = Buffer.from(messageBytes(tx));
  if (Buffer.compare(before, after) !== 0) {
    throw new Error("adding the mint signature changed the transaction");
  }
  const signature = tx.signatures[index];
  if (
    !signature ||
    !nacl.sign.detached.verify(after, signature, keys[index].toBytes())
  ) {
    throw new Error("the mint signature is invalid");
  }
  return encodeTx(tx);
}
