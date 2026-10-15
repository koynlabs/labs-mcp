import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
import { assertUnsignedForWallet } from "../prepare-tx";
import { decodeTx, encodeTx, messageBytes } from "../solana";

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
