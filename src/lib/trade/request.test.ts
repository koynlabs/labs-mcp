import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WSOL_MINT } from "../config";
import { tradeOrderInput, tradeSwapInput } from "../mcp/trade-tools";
import { loadTrade, saveTrade, tradeUrl } from "./intent";
import {
  orderDraft,
  swapDraft,
  TRADE_ORDER_DESCRIPTION,
  TRADE_SWAP_DESCRIPTION,
} from "./request";

const wallet = "3dmSm2aPAjAoxq1JK1QmYfGD32idDGHv2xVfk4NuftuS";
/** AMAZOFF, a pump.fun mint Jupiter quotes on the bonding curve. */
const pumpMint = "3dZhtVyouLMRHTXA3CJDpsQMTRV1zBLFdkTatUQGXdqc";
/** A StonkFun mint. */
const stonksMint = "GJx6KxLzEeB5cQh7Bmo85M2N6s6bVM63VEUjT2tfe6mg";

describe("trade tool copy", () => {
  it("describes swaps and orders for both venues, routed by Jupiter", () => {
    for (const description of [TRADE_SWAP_DESCRIPTION, TRADE_ORDER_DESCRIPTION]) {
      assert.match(description, /pump\.fun/);
      assert.match(description, /StonkFun/);
      assert.match(description, /Jupiter/);
      assert.match(description, /omit it/);
      assert.doesNotMatch(description, /of a StonkFun mint/);
      assert.doesNotMatch(description, /pump SDK|pump-sdk/i);
    }
  });
});

describe("trade schemas", () => {
  it("accepts a pump mint, a StonkFun mint, and a call that omits venue", () => {
    const omitted = tradeSwapInput.parse({ wallet, mint: pumpMint, side: "buy", amount: 0.01 });
    assert.equal(omitted.venue, undefined);
    const pump = tradeSwapInput.parse({
      wallet,
      mint: pumpMint,
      side: "buy",
      amount: 0.01,
      venue: "pump",
    });
    assert.equal(pump.venue, "pump");
    const stonks = tradeSwapInput.parse({
      wallet,
      mint: stonksMint,
      side: "sell",
      amount: 12.5,
      venue: "stonks",
    });
    assert.equal(stonks.venue, "stonks");
    const order = tradeOrderInput.parse({
      wallet,
      mint: pumpMint,
      side: "buy",
      mode: "limit",
      amount: 0.2,
      triggerPriceUsd: 0.0001,
    });
    assert.equal(order.venue, undefined);
    assert.equal(order.expiresDays, 7);
    assert.throws(() => tradeSwapInput.parse({ wallet, mint: pumpMint, side: "buy", amount: 0.01, venue: "amm" }));
  });
});

describe("swapDraft", () => {
  it("builds a SOL buy of a pump mint and a token sell of a StonkFun mint", () => {
    const pump = swapDraft({
      wallet,
      mint: pumpMint,
      side: "buy",
      amount: 0.01,
      decimals: 9,
      venue: "pump",
    });
    assert.equal(pump.action, "swap");
    assert.equal(pump.inputMint, WSOL_MINT);
    assert.equal(pump.outputMint, pumpMint);
    assert.equal(pump.amount, "10000000");
    assert.equal(pump.venue, "pump");
    assert.match(pump.summary, /pump\.fun/);

    const stonks = swapDraft({
      wallet,
      mint: stonksMint,
      side: "sell",
      amount: 12.5,
      decimals: 6,
      venue: "stonks",
    });
    assert.equal(stonks.inputMint, stonksMint);
    assert.equal(stonks.outputMint, WSOL_MINT);
    assert.equal(stonks.amount, "12500000");
    assert.equal(stonks.venue, "stonks");
    assert.match(stonks.summary, /StonkFun/);
  });

  it("keeps an omitted venue off the draft so existing callers stay valid", () => {
    const draft = swapDraft({ wallet, mint: pumpMint, side: "buy", amount: 0.05, decimals: 9 });
    assert.equal(draft.outputMint, pumpMint);
    assert.equal("venue" in draft, false);
    assert.doesNotMatch(draft.summary, /StonkFun|pump\.fun/);
    assert.throws(() => swapDraft({ wallet, mint: WSOL_MINT, side: "buy", amount: 1, decimals: 9 }), /not SOL/);
  });

  it("stores a sign intent for either mint", async () => {
    const pump = await saveTrade(
      swapDraft({ wallet, mint: pumpMint, side: "buy", amount: 0.01, decimals: 9, venue: "pump" }),
    );
    const stonks = await saveTrade(
      swapDraft({ wallet, mint: stonksMint, side: "sell", amount: 12.5, decimals: 6, venue: "stonks" }),
    );
    assert.match(tradeUrl(pump.id), new RegExp(`/sign/trade/${pump.id}$`));
    assert.match(tradeUrl(stonks.id), new RegExp(`/sign/trade/${stonks.id}$`));
    const loadedPump = await loadTrade(pump.id);
    const loadedStonks = await loadTrade(stonks.id);
    assert.equal(loadedPump?.action, "swap");
    assert.equal(loadedStonks?.action, "swap");
    if (loadedPump?.action !== "swap" || loadedStonks?.action !== "swap") return;
    assert.equal(loadedPump.outputMint, pumpMint);
    assert.equal(loadedPump.venue, "pump");
    assert.equal(loadedStonks.inputMint, stonksMint);
    assert.equal(loadedStonks.venue, "stonks");
    assert.equal(loadedPump.kind, "trade");
  });
});

describe("orderDraft", () => {
  it("builds a pump limit buy and a StonkFun stop without refusing the mint", () => {
    const pump = orderDraft({
      wallet,
      mint: pumpMint,
      side: "buy",
      mode: "limit",
      amount: 0.2,
      decimals: 9,
      venue: "pump",
      triggerPriceUsd: 0.0001,
      expiresDays: 7,
      now: 1_700_000_000_000,
    });
    assert.equal(pump.action, "order");
    assert.equal(pump.inputMint, WSOL_MINT);
    assert.equal(pump.outputMint, pumpMint);
    assert.equal(pump.venue, "pump");
    assert.equal(pump.triggerCondition, "below");
    assert.match(pump.summary, /pump\.fun/);

    const stonks = orderDraft({
      wallet,
      mint: stonksMint,
      side: "sell",
      mode: "stop",
      amount: 12.5,
      decimals: 6,
      venue: "stonks",
      triggerPriceUsd: 0.02,
      expiresDays: 3,
      now: 1_700_000_000_000,
    });
    assert.equal(stonks.inputMint, stonksMint);
    assert.equal(stonks.outputMint, WSOL_MINT);
    assert.equal(stonks.venue, "stonks");
    assert.equal(stonks.triggerCondition, "below");
    assert.match(stonks.summary, /StonkFun/);

    const omitted = orderDraft({
      wallet,
      mint: pumpMint,
      side: "sell",
      mode: "limit",
      amount: 4,
      decimals: 6,
      triggerPriceUsd: 1,
      expiresDays: 7,
      now: 1_700_000_000_000,
    });
    assert.equal("venue" in omitted, false);
    assert.equal(omitted.triggerCondition, "above");
    assert.doesNotMatch(omitted.summary, /StonkFun|pump\.fun/);
  });
});
