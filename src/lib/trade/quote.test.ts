import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { LIGHTHOUSE_PROGRAM_ID } from "../launch/wallet-message";
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

const blockhash = Keypair.generate().publicKey.toBase58();
const otherBlockhash = Keypair.generate().publicKey.toBase58();
const swapProgram = Keypair.generate().publicKey;

function lighthouse(account: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: LIGHTHOUSE_PROGRAM_ID,
    keys: [{ pubkey: account, isSigner: false, isWritable: false }],
    data: Buffer.from([1, 0, 0, 0]),
  });
}

function swapInstruction(user: PublicKey, mint: PublicKey, data: number[]): TransactionInstruction {
  return new TransactionInstruction({
    programId: swapProgram,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(data),
  });
}

function compile(
  payer: PublicKey,
  hash: string,
  instructions: TransactionInstruction[],
  tables: AddressLookupTableAccount[] = [],
): VersionedTransaction {
  return new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer,
      recentBlockhash: hash,
      instructions,
    }).compileToV0Message(tables),
  );
}

describe("lockedSubmit", () => {
  it("accepts only the stored quote signed by the named wallet", async () => {
    const payer = Keypair.generate();
    const { unsigned, signed, wallet } = signedTransfer(payer, 1);
    const quote = storeQuote(unsigned, "request-1", 1_000);
    const locked = await lockedSubmit({
      quote,
      signedTransaction: signed,
      requestId: "request-1",
      wallet,
      now: 1_000,
    });
    assert.equal(locked.requestId, "request-1");
    assert.equal(locked.signedTransaction, signed);
  });

  it("refuses a different message, signer, request, or an expired quote", async () => {
    const payer = Keypair.generate();
    const other = Keypair.generate();
    const original = signedTransfer(payer, 1);
    const rewritten = signedTransfer(payer, 2);
    const quote = storeQuote(original.unsigned, "request-1", 1_000);
    await assert.rejects(
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
    await assert.rejects(
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
    await assert.rejects(
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
    await assert.rejects(
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

  it("accepts a Phantom priority fee and Lighthouse suffix on a swap quote", async () => {
    const user = Keypair.generate();
    const mint = Keypair.generate().publicKey;
    const swap = swapInstruction(user.publicKey, mint, [4, 5, 6]);
    const quoteTx = compile(user.publicKey, blockhash, [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      swap,
    ]);
    const phantom = compile(user.publicKey, otherBlockhash, [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      swap,
      lighthouse(user.publicKey),
    ]);
    phantom.sign([user]);

    const locked = await lockedSubmit({
      quote: storeQuote(encodeTx(quoteTx), "swap-request", 1_000),
      signedTransaction: encodeTx(phantom),
      requestId: "swap-request",
      wallet: user.publicKey.toBase58(),
      now: 1_000,
    });
    assert.equal(locked.requestId, "swap-request");
    assert.equal(locked.signedTransaction, encodeTx(phantom));
    assert.notEqual(locked.signedTransaction, encodeTx(quoteTx));
  });

  it("accepts a Lighthouse assertion inserted between swap instructions", async () => {
    const user = Keypair.generate();
    const mint = Keypair.generate().publicKey;
    const first = swapInstruction(user.publicKey, mint, [1, 2]);
    const second = swapInstruction(user.publicKey, mint, [3, 4]);
    const quoteTx = compile(user.publicKey, blockhash, [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      first,
      second,
    ]);
    const phantom = compile(user.publicKey, otherBlockhash, [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 25_000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 350_000 }),
      first,
      lighthouse(user.publicKey),
      second,
      lighthouse(mint),
    ]);
    phantom.sign([user]);

    const locked = await lockedSubmit({
      quote: storeQuote(encodeTx(quoteTx), "swap-request", 1_000),
      signedTransaction: encodeTx(phantom),
      requestId: "swap-request",
      wallet: user.publicKey.toBase58(),
      now: 1_000,
    });
    assert.equal(locked.signedTransaction, encodeTx(phantom));
  });

  it("accepts the same Phantom edits when the swap uses a lookup table", async () => {
    const user = Keypair.generate();
    const mint = Keypair.generate().publicKey;
    const lut = new AddressLookupTableAccount({
      key: Keypair.generate().publicKey,
      state: {
        deactivationSlot: BigInt("18446744073709551615"),
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        addresses: [mint],
      },
    });
    const swap = swapInstruction(user.publicKey, mint, [7, 7, 7]);
    const quoteTx = compile(
      user.publicKey,
      blockhash,
      [ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }), swap],
      [lut],
    );
    assert.equal(quoteTx.message.addressTableLookups.length, 1);
    const phantom = compile(
      user.publicKey,
      otherBlockhash,
      [
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        swap,
        lighthouse(user.publicKey),
      ],
      [lut],
    );
    phantom.sign([user]);

    const locked = await lockedSubmit({
      quote: storeQuote(encodeTx(quoteTx), "swap-request", 1_000),
      signedTransaction: encodeTx(phantom),
      requestId: "swap-request",
      wallet: user.publicKey.toBase58(),
      now: 1_000,
      tables: [lut],
    });
    assert.equal(locked.requestId, "swap-request");
    assert.equal(locked.signedTransaction, encodeTx(phantom));
  });

  it("refuses a swap whose accounts or data changed, even with Phantom suffixes", async () => {
    const user = Keypair.generate();
    const mint = Keypair.generate().publicKey;
    const swap = swapInstruction(user.publicKey, mint, [4, 5, 6]);
    const quoteTx = compile(user.publicKey, blockhash, [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      swap,
    ]);
    const quote = storeQuote(encodeTx(quoteTx), "swap-request", 1_000);
    const tampered = compile(user.publicKey, otherBlockhash, [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      swapInstruction(user.publicKey, mint, [9, 9, 9]),
      lighthouse(user.publicKey),
    ]);
    tampered.sign([user]);
    await assert.rejects(
      () =>
        lockedSubmit({
          quote,
          signedTransaction: encodeTx(tampered),
          requestId: "swap-request",
          wallet: user.publicKey.toBase58(),
          now: 1_000,
        }),
      /stored quote/,
    );

    const extra = compile(user.publicKey, otherBlockhash, [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      swap,
      SystemProgram.transfer({
        fromPubkey: user.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1,
      }),
      lighthouse(user.publicKey),
    ]);
    extra.sign([user]);
    await assert.rejects(
      () =>
        lockedSubmit({
          quote,
          signedTransaction: encodeTx(extra),
          requestId: "swap-request",
          wallet: user.publicKey.toBase58(),
          now: 1_000,
        }),
      /added an instruction/,
    );

    const lowered = compile(user.publicKey, otherBlockhash, [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000 }),
      swap,
      lighthouse(user.publicKey),
    ]);
    lowered.sign([user]);
    await assert.rejects(
      () =>
        lockedSubmit({
          quote,
          signedTransaction: encodeTx(lowered),
          requestId: "swap-request",
          wallet: user.publicKey.toBase58(),
          now: 1_000,
        }),
      /lowered the compute budget/,
    );
  });
});
