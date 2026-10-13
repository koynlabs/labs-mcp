import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { encodeTx } from "../solana";
import { lockedSubmit, storeQuote } from "./quote";

function signedTransfer(from: Keypair, lamports: number) {
  const tx = new Transaction({
    feePayer: from.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
  });
  tx.add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports,
    }),
  );
  const unsigned = encodeTx(tx);
  tx.sign(from);
  return { unsigned, signed: encodeTx(tx), wallet: from.publicKey.toBase58() };
}

describe("lockedSubmit", () => {
  it("accepts only the stored quote signed by the named wallet", () => {
    const payer = Keypair.generate();
    const { unsigned, signed, wallet } = signedTransfer(payer, 1);
    const quote = storeQuote(unsigned, "request-1", 1_000);
    const locked = lockedSubmit({
      quote,
      signedTransaction: signed,
      requestId: "request-1",
      wallet,
      now: 1_000,
    });
    assert.equal(locked.requestId, "request-1");
    assert.equal(locked.signedTransaction, signed);
  });

  it("refuses a different message, signer, request, or an expired quote", () => {
    const payer = Keypair.generate();
    const other = Keypair.generate();
    const original = signedTransfer(payer, 1);
    const rewritten = signedTransfer(payer, 2);
    const quote = storeQuote(original.unsigned, "request-1", 1_000);
    assert.throws(
      () =>
        lockedSubmit({
          quote,
          signedTransaction: rewritten.signed,
          requestId: "request-1",
          wallet: original.wallet,
          now: 1_000,
        }),
      /stored quote/,
    );
    assert.throws(
      () =>
        lockedSubmit({
          quote,
          signedTransaction: original.signed,
          requestId: "request-1",
          wallet: other.publicKey.toBase58(),
          now: 1_000,
        }),
      /did not sign/,
    );
    assert.throws(
      () =>
        lockedSubmit({
          quote,
          signedTransaction: original.signed,
          requestId: "other-request",
          wallet: original.wallet,
          now: 1_000,
        }),
      /does not match/,
    );
    assert.throws(
      () =>
        lockedSubmit({
          quote,
          signedTransaction: original.signed,
          requestId: "request-1",
          wallet: original.wallet,
          now: quote.expiresAt,
        }),
      /expired/,
    );
  });
});
