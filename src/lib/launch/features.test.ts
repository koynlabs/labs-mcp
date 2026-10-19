import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertHolderFees, assertStockPairing, STOCK_CATEGORY } from "./features";

describe("launch feature checks", () => {
  it("accepts an xStock quote and refuses anything else", () => {
    assert.doesNotThrow(() => assertStockPairing(STOCK_CATEGORY, "NVDAX"));
    assert.throws(
      () => assertStockPairing("solana", "SOL"),
      /Token pairing to a stock is not enabled for SOL/,
    );
    assert.throws(
      () => assertStockPairing(undefined, "unknown mint"),
      /Token pairing to a stock is not enabled for unknown mint/,
    );
  });

  it("accepts holder fee distribution only when the venue has it on", () => {
    assert.doesNotThrow(() => assertHolderFees(true, "NVDAX"));
    assert.throws(
      () => assertHolderFees(false, "pump.fun"),
      /Distributing fees to holders is not enabled for pump\.fun/,
    );
  });
});
