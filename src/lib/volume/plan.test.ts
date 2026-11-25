import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decrypt } from "../seal";
import { fitDeposit, portionRaw, zapBaseRaw } from "./liquidity";
import { liquidationFor } from "./liquidate";
import {
  assertLiquidatePercent,
  assertVolumeCount,
  movesFor,
  reenterPlan,
  sellsOnlyOnLiquidate,
  splitLaunchBuyers,
} from "./plan";
import { addLiquidityWallets } from "./reenter";
import { createVolumeSession, publicVolume } from "./session";

describe("volume plan", () => {
  it("caps the session at 100 wallets", () => {
    assert.doesNotThrow(() => assertVolumeCount(1));
    assert.doesNotThrow(() => assertVolumeCount(100));
    assert.throws(() => assertVolumeCount(0), /1 to 100/);
    assert.throws(() => assertVolumeCount(101), /1 to 100/);
  });

  it("puts the first three buys in the bundle and the rest after it", () => {
    const wallets = Array.from({ length: 100 }, (_, index) => index);
    const split = splitLaunchBuyers(wallets);
    assert.equal(split.bundle.length, 3);
    assert.deepEqual(split.bundle, [0, 1, 2]);
    assert.equal(split.followOn.length, 97);
    assert.equal(split.followOn[0], 3);

    const short = splitLaunchBuyers([1, 2]);
    assert.deepEqual(short.bundle, [1, 2]);
    assert.deepEqual(short.followOn, []);
  });

  it("accepts only 10, 25, 50, and 100, and a failure always returns 100", () => {
    assert.equal(assertLiquidatePercent(10, false), 10);
    assert.equal(assertLiquidatePercent(25, false), 25);
    assert.equal(assertLiquidatePercent(50, false), 50);
    assert.equal(assertLiquidatePercent(100, false), 100);
    assert.throws(() => assertLiquidatePercent(15, false), /10, 25, 50, or 100/);
    assert.equal(assertLiquidatePercent(10, true), 100);
  });

  it("sizes a re-entry without passing 100 wallets", () => {
    assert.deepEqual(reenterPlan({ held: 0, reusable: 0, requested: 100 }), {
      reuse: 0,
      generate: 100,
    });
    assert.deepEqual(reenterPlan({ held: 90, reusable: 90, requested: 100 }), {
      reuse: 90,
      generate: 10,
    });
    assert.deepEqual(reenterPlan({ held: 100, reusable: 40, requested: 25 }), {
      reuse: 25,
      generate: 0,
    });
    assert.throws(
      () => reenterPlan({ held: 100, reusable: 0, requested: 1 }),
      /cannot hold more than 100/,
    );
  });

  it("builds a sell only while liquidating", () => {
    const wallets = [{ publicKey: "wallet" }];
    for (const phase of ["funding", "buying", "holding", "depositing", "managing"] as const) {
      const moves = movesFor(phase, wallets);
      assert.equal(moves.some((move) => move.kind === "sell"), false);
      assert.equal(sellsOnlyOnLiquidate(phase, moves), true);
    }
    const liquidating = movesFor("liquidating", wallets);
    assert.deepEqual(
      liquidating.map((move) => move.kind),
      ["withdraw", "sell", "sweep"],
    );
    assert.equal(sellsOnlyOnLiquidate("liquidating", liquidating), true);
    assert.equal(sellsOnlyOnLiquidate("buying", liquidating), false);
  });
});

describe("volume liquidity math", () => {
  it("zaps part of a bag so the rest matches the pool", () => {
    const swapped = zapBaseRaw(BigInt(199), BigInt(0), BigInt(100), BigInt(100));
    assert.equal(swapped, BigInt(100));
    assert.equal(fitDeposit(BigInt(50), BigInt(25), BigInt(100), BigInt(100)), BigInt(25));
    assert.equal(portionRaw(BigInt(1000), 10), BigInt(100));
    assert.equal(portionRaw(BigInt(1000), 25), BigInt(250));
    assert.equal(portionRaw(BigInt(1000), 50), BigInt(500));
    assert.equal(portionRaw(BigInt(1000), 100), BigInt(1000));
  });

  it("withdraws the published percent and sells only on that path", () => {
    const live = liquidationFor({ percent: 25, failed: false, lpRaw: BigInt(1000) });
    assert.equal(live.percent, 25);
    assert.equal(live.withdrawRaw, BigInt(250));
    assert.deepEqual(live.steps, ["withdraw", "sell", "sweep"]);

    const failed = liquidationFor({ percent: 10, failed: true, lpRaw: BigInt(1000) });
    assert.equal(failed.percent, 100);
    assert.equal(failed.withdrawRaw, BigInt(1000));
  });
});

describe("volume session", () => {
  it("seals child keys and keeps them out of the public view", () => {
    const previous = process.env.LABS_SESSION_SECRET;
    process.env.LABS_SESSION_SECRET = "a".repeat(32);
    try {
      const session = createVolumeSession({
        venue: "pump",
        main: "main",
        name: "Example",
        symbol: "EX",
        imageUrl: "https://example.com/icon.png",
        count: 5,
        solPerWallet: 0.1,
      });
      assert.equal(session.children.filter((child) => child.role === "bundle").length, 3);
      assert.equal(session.children.filter((child) => child.role === "follow_on").length, 2);
      assert.equal(session.phase, "funding");

      const view = JSON.stringify(publicVolume(session));
      assert.equal(view.includes("signUrl"), false);
      assert.equal(view.includes("sealedSecret"), false);
      for (const child of session.children) {
        assert.equal(view.includes(child.sealedSecret), false);
        assert.equal(view.includes(decrypt(child.sealedSecret)), false);
      }

      addLiquidityWallets(session, 6);
      assert.equal(session.phase, "funding");
      assert.equal(session.children.length, 6);
      assert.equal(movesFor(session.phase, session.children).some((move) => move.kind === "sell"), false);
    } finally {
      if (previous === undefined) delete process.env.LABS_SESSION_SECRET;
      else process.env.LABS_SESSION_SECRET = previous;
    }
  });
});
