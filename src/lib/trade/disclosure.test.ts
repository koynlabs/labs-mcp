import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WSOL_MINT } from "../config";
import type { TradeIntent } from "../types";
import { FUNDS_WARNING, tradeDisclosure } from "./disclosure";

const swap: TradeIntent = {
  id: "trade-1",
  kind: "trade",
  createdAt: 1_700_000_000_000,
  action: "swap",
  wallet: "CallerWallet11111111111111111111111111111111",
  inputMint: WSOL_MINT,
  outputMint: "Mint111111111111111111111111111111111111111",
  amount: "1500000000",
  summary: "Market-buy the mint spending 1.5 SOL.",
  sealedSession: "iv.tag.ciphertext",
};

describe("tradeDisclosure", () => {
  it("shows caller, host, action, amounts, and a funds warning", () => {
    const view = tradeDisclosure(swap, "labs.levercoin.lol");
    assert.equal(view.caller, swap.wallet);
    assert.equal(view.host, "labs.levercoin.lol");
    assert.equal(view.action, "Market swap");
    assert.deepEqual(view.amounts, [
      { label: "Spend", value: "1.5 SOL" },
      { label: "Receive", value: swap.outputMint },
    ]);
    assert.equal(view.warning, FUNDS_WARNING);
    assert.equal("sealedSession" in view, false);
    assert.equal(JSON.stringify(view).includes("ciphertext"), false);
    assert.equal(
      view.amounts.some((line) => line.label === "Venue"),
      false,
    );
  });

  it("names pump.fun or StonkFun only when the trade was labelled", () => {
    const pump = tradeDisclosure({ ...swap, venue: "pump" }, "labs.levercoin.lol");
    assert.deepEqual(pump.amounts[0], { label: "Venue", value: "pump.fun" });
    const stonks = tradeDisclosure(
      { ...swap, venue: "stonks", inputMint: swap.outputMint, outputMint: WSOL_MINT },
      "labs.levercoin.lol",
    );
    assert.deepEqual(stonks.amounts[0], { label: "Venue", value: "StonkFun" });
    assert.deepEqual(stonks.amounts[2], { label: "Receive", value: "SOL" });
  });
});
