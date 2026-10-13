import { verifySignedTx } from "../solana";
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
 * named on the trade. A caller-supplied request id or a rewritten message is
 * refused.
 */
export function lockedSubmit(input: {
  quote: StoredQuote | undefined;
  signedTransaction: unknown;
  requestId: unknown;
  wallet: string;
  now?: number;
}): { requestId: string; signedTransaction: string } {
  const now = input.now ?? Date.now();
  if (!input.quote) throw new Error("Build the quote before submitting it.");
  if (input.quote.expiresAt <= now) throw new Error("This quote has expired. Build it again.");
  if (!isBase64(input.signedTransaction)) throw new Error("Missing signed transaction.");
  if (input.requestId !== undefined && input.requestId !== input.quote.requestId) {
    throw new Error("The signed quote does not match the one stored for this trade.");
  }
  const check = verifySignedTx(input.signedTransaction, input.quote.transaction, input.wallet);
  if (!check.ok) {
    throw new Error(
      check.reason.includes("modified")
        ? "The signed transaction does not match the stored quote."
        : check.reason,
    );
  }
  return { requestId: input.quote.requestId, signedTransaction: input.signedTransaction };
}
