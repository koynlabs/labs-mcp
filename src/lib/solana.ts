import {
  Connection,
  PublicKey,
  VersionedTransaction,
  Transaction,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import { SOLANA_RPC } from "./config";

/** Created per call: a module-scope client would be captured across requests. */
export function connection(): Connection {
  return new Connection(SOLANA_RPC, { commitment: "confirmed" });
}

export function isPublicKey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export function encodeTx(tx: VersionedTransaction | Transaction): string {
  const bytes =
    tx instanceof VersionedTransaction
      ? tx.serialize()
      : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return Buffer.from(bytes).toString("base64");
}

export function decodeTx(base64: string): VersionedTransaction | Transaction {
  const bytes = Buffer.from(base64, "base64");
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

/** The bytes a signature must cover, for either transaction version. */
export function messageBytes(
  tx: VersionedTransaction | Transaction,
): Uint8Array {
  return tx instanceof VersionedTransaction
    ? tx.message.serialize()
    : tx.serializeMessage();
}

function signatureFor(
  tx: VersionedTransaction | Transaction,
  signer: PublicKey,
): Uint8Array | null {
  if (tx instanceof VersionedTransaction) {
    const keys = tx.message.getAccountKeys().staticAccountKeys;
    const index = keys.findIndex((key) => key.equals(signer));
    if (index < 0) return null;
    const signature = tx.signatures[index];
    return signature && signature.some((byte) => byte !== 0) ? signature : null;
  }
  const entry = tx.signatures.find((item) => item.publicKey.equals(signer));
  return entry?.signature ? new Uint8Array(entry.signature) : null;
}

/**
 * A returned transaction is only accepted when its message is byte-identical to
 * the one handed out and the expected wallet actually signed that message. This
 * is what stops the sign page from redirecting funds or dropping the fee.
 */
export function verifySignedTx(
  signedBase64: string,
  unsignedBase64: string,
  expectedSigner: string,
): { ok: true } | { ok: false; reason: string } {
  let signed: VersionedTransaction | Transaction;
  try {
    signed = decodeTx(signedBase64);
  } catch {
    return { ok: false, reason: "could not decode the signed transaction" };
  }

  const original = decodeTx(unsignedBase64);
  const signedMessage = messageBytes(signed);
  const originalMessage = messageBytes(original);
  if (Buffer.compare(Buffer.from(signedMessage), Buffer.from(originalMessage))) {
    return { ok: false, reason: "the transaction was modified after signing" };
  }

  const signer = new PublicKey(expectedSigner);
  const signature = signatureFor(signed, signer);
  if (!signature) {
    return { ok: false, reason: `${expectedSigner} did not sign` };
  }
  if (!nacl.sign.detached.verify(signedMessage, signature, signer.toBytes())) {
    return { ok: false, reason: `${expectedSigner} signature is invalid` };
  }
  return { ok: true };
}
