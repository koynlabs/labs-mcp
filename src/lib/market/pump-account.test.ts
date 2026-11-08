import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  bondingCurveAddress,
  curvePrice,
  decodeCurve,
  decodeMint,
} from "./pump-account";

const MINT = new PublicKey("So11111111111111111111111111111111111111112");

function u32(n: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(n);
  return out;
}

function u64(n: bigint): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(n);
  return out;
}

function mintWithMetadata(name: string, symbol: string, uri: string): Buffer {
  const base = Buffer.alloc(166);
  base[45] = 1;
  base[44] = 6;
  u64(1_000_000_000_000_000n).copy(base, 36);
  base[165] = 1;
  const value = Buffer.concat([
    Buffer.alloc(32),
    MINT.toBuffer(),
    u32(name.length),
    Buffer.from(name),
    u32(symbol.length),
    Buffer.from(symbol),
    u32(uri.length),
    Buffer.from(uri),
    u32(0),
  ]);
  const tlv = Buffer.concat([Buffer.from([19, 0, value.length, 0]), value]);
  return Buffer.concat([base, tlv]);
}

describe("decodeCurve", () => {
  it("reads virtual reserves, completion, and progress after the discriminator", () => {
    const data = Buffer.alloc(49);
    u64(1_073_000_000_000_000n).copy(data, 8);
    u64(30_000_000_000n).copy(data, 16);
    u64(793_100_000_000_000n).copy(data, 24);
    const curve = decodeCurve(data);
    assert.ok(curve);
    assert.equal(curve.complete, false);
    assert.equal(curve.progress, 0);
    assert.equal(curvePrice(curve, 6), 30_000_000_000 / 1e9 / (1_073_000_000_000_000 / 1e6));
    data[48] = 1;
    assert.equal(decodeCurve(data)?.progress, 1);
    assert.equal(decodeCurve(data)?.complete, true);
  });

  it("returns null when the account is shorter than the complete flag", () => {
    assert.equal(decodeCurve(Buffer.alloc(48)), null);
  });
});

describe("decodeMint", () => {
  it("reads decimals, supply, and the Token-2022 metadata extension", () => {
    const facts = decodeMint(mintWithMetadata("Example", "EX", "ipfs://cid"));
    assert.ok(facts);
    assert.equal(facts.decimals, 6);
    assert.equal(facts.supply, 1_000_000_000_000_000n);
    assert.equal(facts.name, "Example");
    assert.equal(facts.symbol, "EX");
    assert.equal(facts.uri, "ipfs://cid");
  });

  it("returns null for an uninitialized mint", () => {
    assert.equal(decodeMint(Buffer.alloc(82)), null);
  });
});

describe("bondingCurveAddress", () => {
  it("derives the pump bonding-curve PDA", () => {
    const curve = bondingCurveAddress(MINT);
    assert.equal(PublicKey.isOnCurve(curve.toBytes()), false);
    assert.equal(bondingCurveAddress(MINT).equals(curve), true);
  });
});
