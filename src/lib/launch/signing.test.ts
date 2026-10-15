import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AddressLookupTableAccount,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { rewriteBlockhash } from "./blockhash";
import { cosignMint } from "./mint-sign";
import { assertUnsignedForWallet, attachLookupTables } from "../prepare-tx";
import { decodeTx, encodeTx, messageBytes, verifySignedTx } from "../solana";
import {
  LIGHTHOUSE_PROGRAM_ID,
  clearSignatures,
  reconcileWalletMessage,
  stripWalletAssertions,
} from "./wallet-message";

const blockhash = PublicKey.default.toBase58();

function twoSignerTx(): { tx: VersionedTransaction; user: Keypair; mint: Keypair } {
  const user = Keypair.generate();
  const mint = Keypair.generate();
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: user.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        new TransactionInstruction({
          programId: SystemProgram.programId,
          keys: [
            { pubkey: user.publicKey, isSigner: true, isWritable: true },
            { pubkey: mint.publicKey, isSigner: true, isWritable: true },
          ],
          data: Buffer.alloc(0),
        }),
      ],
    }).compileToV0Message(),
  );
  return { tx, user, mint };
}

describe("wallet signs before the mint key", () => {
  it("hands the wallet an unsigned transaction whose fee payer is the user", () => {
    const { tx, user } = twoSignerTx();
    assert.equal(tx.message.staticAccountKeys[0]?.equals(user.publicKey), true);
    assert.equal(tx.message.header.numRequiredSignatures, 2);
    assertUnsignedForWallet(tx);
  });

  it("adds the mint signature without changing the message the wallet signed", () => {
    const { tx, user, mint } = twoSignerTx();
    tx.sign([user]);
    const message = Buffer.from(messageBytes(tx));
    const userSignature = Buffer.from(tx.signatures[0]);

    const finished = cosignMint(
      encodeTx(tx),
      bs58.encode(mint.secretKey),
      mint.publicKey.toBase58(),
    );
    const signed = decodeTx(finished);
    assert.ok(signed instanceof VersionedTransaction);
    assert.equal(Buffer.compare(message, Buffer.from(messageBytes(signed))), 0);
    assert.equal(Buffer.compare(userSignature, Buffer.from(signed.signatures[0])), 0);
    assert.equal(
      nacl.sign.detached.verify(
        message,
        signed.signatures[1],
        mint.publicKey.toBytes(),
      ),
      true,
    );
    assert.throws(() => assertUnsignedForWallet(signed));
  });

  it("replaces the blockhash and clears signatures", () => {
    const { tx, user } = twoSignerTx();
    tx.sign([user]);
    const nextHash = Keypair.generate().publicKey.toBase58();
    const rewritten = rewriteBlockhash(tx, nextHash, []);
    assert.equal(rewritten.message.recentBlockhash, nextHash);
    assertUnsignedForWallet(rewritten);
    assert.deepEqual(
      rewritten.message.staticAccountKeys.map((key) => key.toBase58()),
      tx.message.staticAccountKeys.map((key) => key.toBase58()),
    );
  });
});

const otherBlockhash = Keypair.generate().publicKey.toBase58();

function lighthouse(user: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: LIGHTHOUSE_PROGRAM_ID,
    keys: [{ pubkey: user, isSigner: false, isWritable: false }],
    data: Buffer.from([1, 0, 0, 0]),
  });
}

function withBlockhash(tx: VersionedTransaction, blockhash: string): VersionedTransaction {
  const copy = VersionedTransaction.deserialize(tx.serialize());
  copy.message.recentBlockhash = blockhash;
  return copy;
}

describe("wallet signature matches the message Phantom returns", () => {
  it("keeps a signature whose only change is the blockhash Phantom refreshed", () => {
    const { tx, user, mint } = twoSignerTx();
    const phantom = withBlockhash(tx, otherBlockhash);
    phantom.sign([user]);

    const stale = verifySignedTx(
      encodeTx(phantom),
      encodeTx(tx),
      user.publicKey.toBase58(),
    );
    assert.equal(stale.ok, false);

    const decision = reconcileWalletMessage(tx, phantom);
    assert.equal(decision.ok, true);
    if (!decision.ok) return;
    assert.equal(decision.blockhashChanged, true);
    assert.equal(decision.blockhash, otherBlockhash);

    const stored = encodeTx(clearSignatures(phantom));
    assert.equal(Buffer.compare(messageBytes(phantom), messageBytes(decodeTx(stored))), 0);
    const finished = cosignMint(
      encodeTx(phantom),
      bs58.encode(mint.secretKey),
      mint.publicKey.toBase58(),
    );
    const check = verifySignedTx(finished, stored, user.publicKey.toBase58());
    assert.equal(check.ok, true);
    const signed = decodeTx(finished);
    assert.ok(signed instanceof VersionedTransaction);
    assert.equal(
      nacl.sign.detached.verify(
        messageBytes(signed),
        signed.signatures[1]!,
        mint.publicKey.toBytes(),
      ),
      true,
    );
  });

  it("keeps trailing Lighthouse assertions and a new blockhash on a lookup-table transaction", () => {
    const user = Keypair.generate();
    const mint = Keypair.generate();
    const dest = Keypair.generate().publicKey;
    const lut = new AddressLookupTableAccount({
      key: Keypair.generate().publicKey,
      state: {
        deactivationSlot: BigInt("18446744073709551615"),
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        addresses: [dest],
      },
    });
    const instructions = [
      new TransactionInstruction({
        programId: SystemProgram.programId,
        keys: [
          { pubkey: user.publicKey, isSigner: true, isWritable: true },
          { pubkey: mint.publicKey, isSigner: true, isWritable: true },
          { pubkey: dest, isSigner: false, isWritable: true },
        ],
        data: Buffer.from([7, 7, 7]),
      }),
    ];
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: user.publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message([lut]),
    );
    assert.equal(tx.message.addressTableLookups.length, 1);

    const phantom = new VersionedTransaction(
      new TransactionMessage({
        payerKey: user.publicKey,
        recentBlockhash: otherBlockhash,
        instructions: [...instructions, lighthouse(user.publicKey)],
      }).compileToV0Message([lut]),
    );
    phantom.sign([user]);

    const withoutTables = reconcileWalletMessage(tx, phantom);
    assert.equal(withoutTables.ok, false);
    if (!withoutTables.ok) assert.equal(withoutTables.unresolvedLookups, true);

    const decision = reconcileWalletMessage(tx, phantom, [lut]);
    assert.equal(decision.ok, true);
    if (!decision.ok) return;
    assert.equal(decision.blockhashChanged, true);

    const stored = encodeTx(clearSignatures(phantom));
    const finished = cosignMint(
      encodeTx(phantom),
      bs58.encode(mint.secretKey),
      mint.publicKey.toBase58(),
    );
    assert.equal(verifySignedTx(finished, stored, user.publicKey.toBase58()).ok, true);
    assert.equal(verifySignedTx(finished, encodeTx(tx), user.publicKey.toBase58()).ok, false);

    const stripped = stripWalletAssertions(decodeTx(stored) as VersionedTransaction, [lut]);
    const strippedMessage = TransactionMessage.decompile(stripped.message, {
      addressLookupTableAccounts: [lut],
    });
    assert.equal(strippedMessage.instructions.length, 1);
    assert.equal(
      strippedMessage.instructions[0]?.programId.equals(SystemProgram.programId),
      true,
    );
  });

  it("rejects a signature that changes an amount and then adds a Lighthouse instruction", () => {
    const { tx, user } = twoSignerTx();
    const original = TransactionMessage.decompile(tx.message);
    const tampered = new VersionedTransaction(
      new TransactionMessage({
        payerKey: user.publicKey,
        recentBlockhash: otherBlockhash,
        instructions: [
          new TransactionInstruction({
            programId: original.instructions[0]!.programId,
            keys: original.instructions[0]!.keys,
            data: Buffer.from([9]),
          }),
          lighthouse(user.publicKey),
        ],
      }).compileToV0Message(),
    );
    tampered.sign([user]);
    const decision = reconcileWalletMessage(tx, tampered);
    assert.equal(decision.ok, false);
  });

  it("rejects an extra instruction that is not a wallet assertion", () => {
    const { tx, user } = twoSignerTx();
    const original = TransactionMessage.decompile(tx.message);
    const tampered = new VersionedTransaction(
      new TransactionMessage({
        payerKey: user.publicKey,
        recentBlockhash: tx.message.recentBlockhash,
        instructions: [
          ...original.instructions,
          SystemProgram.transfer({
            fromPubkey: user.publicKey,
            toPubkey: Keypair.generate().publicKey,
            lamports: 1,
          }),
        ],
      }).compileToV0Message(),
    );
    tampered.sign([user]);
    assert.equal(reconcileWalletMessage(tx, tampered).ok, false);
  });

  it("rejects a Lighthouse instruction inserted ahead of the launch instructions", () => {
    const { tx, user } = twoSignerTx();
    const original = TransactionMessage.decompile(tx.message);
    const tampered = new VersionedTransaction(
      new TransactionMessage({
        payerKey: user.publicKey,
        recentBlockhash: tx.message.recentBlockhash,
        instructions: [lighthouse(user.publicKey), ...original.instructions],
      }).compileToV0Message(),
    );
    tampered.sign([user]);
    assert.equal(reconcileWalletMessage(tx, tampered).ok, false);
  });

  it("does not change the message bytes when lookup tables are attached for Phantom", () => {
    const user = Keypair.generate();
    const dest = Keypair.generate().publicKey;
    const lut = new AddressLookupTableAccount({
      key: Keypair.generate().publicKey,
      state: {
        deactivationSlot: BigInt("18446744073709551615"),
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        addresses: [dest],
      },
    });
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: user.publicKey,
        recentBlockhash: blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: user.publicKey,
            toPubkey: dest,
            lamports: 1,
          }),
        ],
      }).compileToV0Message([lut]),
    );
    const before = Buffer.from(messageBytes(tx));
    assert.throws(() => tx.message.getAccountKeys());
    attachLookupTables(tx, [lut]);
    assert.equal(Buffer.compare(before, Buffer.from(messageBytes(tx))), 0);
    const keys = tx.message.getAccountKeys();
    let found = false;
    for (let index = 0; index < keys.length; index += 1) {
      if (keys.get(index)?.equals(dest)) found = true;
    }
    assert.equal(found, true);
  });
});
