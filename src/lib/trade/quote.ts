import { AddressLookupTableAccount, VersionedTransaction } from "@solana/web3.js";
import { loadLookups } from "../launch/blockhash";
import { clearSignatures, reconcileWalletMessage } from "../launch/wallet-message";
import { decodeTx, encodeTx, messageBytes, verifySignedTx } from "../solana";
import type { StoredQuote } from "../types";

export type { StoredQuote };

/** Long enough to approve in a wallet, short enough that a stale Jupiter quote cannot be replayed. */
export const QUOTE_TTL_MS = 90_000;

/** The bearer Jupiter returns after the challenge. It never goes back to the browser. */
export const JUPITER_SESSION_TTL_MS = 10 * 60_000;

export function storeQuote(transaction: string, requestId: string, now = Date.now()): StoredQuote {
  return { transaction, requestId, expiresAt: now + QUOTE_TTL_MS };
}

function isBase64(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length < 8000 && /^[A-Za-z0-9+/=]+$/.test(value);
}

/**
 * Submit may only forward the quote this server built, signed by the wallet
 * named on the trade. The request id has to be the stored one. Phantom may
 * refresh the blockhash, insert compute-budget instructions, and add
 * Lighthouse assertions; those are the same edits a launch signature keeps.
 * Every other instruction — the Jupiter swap or deposit — has to match.
 */
export async function lockedSubmit(input: {
  quote: StoredQuote | undefined;
  signedTransaction: unknown;
  requestId: unknown;
  wallet: string;
  now?: number;
  /** Tests pass the tables a quote names. Production loads them when decompile needs them. */
  tables?: AddressLookupTableAccount[];
}): Promise<{ requestId: string; signedTransaction: string }> {
  const now = input.now ?? Date.now();
  if (!input.quote) throw new Error("Build the quote before submitting it.");
  if (input.quote.expiresAt <= now) throw new Error("This quote has expired. Build it again.");
  if (!isBase64(input.signedTransaction)) throw new Error("Missing signed transaction.");
  if (input.requestId !== undefined && input.requestId !== input.quote.requestId) {
    throw new Error("The signed quote does not match the one stored for this trade.");
  }

  let reference = input.quote.transaction;
  const signed = decodeQuoteTx(input.signedTransaction);
  const original = decodeQuoteTx(input.quote.transaction);
  if (
    signed instanceof VersionedTransaction &&
    original instanceof VersionedTransaction &&
    Buffer.compare(Buffer.from(messageBytes(signed)), Buffer.from(messageBytes(original))) !== 0
  ) {
    let decision = reconcileWalletMessage(original, signed, input.tables ?? []);
    if (!decision.ok && decision.unresolvedLookups && input.tables === undefined) {
      decision = reconcileWalletMessage(original, signed, await tablesFor(original, signed));
    }
    if (!decision.ok) {
      throw new Error(`The signed transaction does not match the stored quote. (${decision.reason})`);
    }
    reference = encodeTx(clearSignatures(signed));
  }

  const check = verifySignedTx(input.signedTransaction, reference, input.wallet);
  if (!check.ok) {
    throw new Error(
      check.reason.includes("modified")
        ? "The signed transaction does not match the stored quote."
        : check.reason,
    );
  }
  return { requestId: input.quote.requestId, signedTransaction: input.signedTransaction };
}

function decodeQuoteTx(value: string): VersionedTransaction | ReturnType<typeof decodeTx> {
  try {
    return decodeTx(value);
  } catch {
    throw new Error("could not decode the signed transaction");
  }
}

async function tablesFor(
  original: VersionedTransaction,
  signed: VersionedTransaction,
): Promise<AddressLookupTableAccount[]> {
  const byKey = new Map<string, AddressLookupTableAccount>();
  for (const tx of [original, signed]) {
    for (const table of await loadLookups(tx)) {
      byKey.set(table.key.toBase58(), table);
    }
  }
  return [...byKey.values()];
}
