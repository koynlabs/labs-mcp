import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WSOL_MINT } from "../config";
import { ultraReferral } from "./swap";

describe("ultra referral", () => {
  it("pays the Ultra account 50 bps when the fee is unset", () => {
    assert.deepEqual(ultraReferral({ JUPITER_ULTRA_REFERRAL_ACCOUNT: WSOL_MINT }), {
      account: WSOL_MINT,
      feeBps: 50,
    });
  });

  it("keeps a fee inside Jupiter's 50–255 range", () => {
    assert.equal(
      ultraReferral({ JUPITER_ULTRA_REFERRAL_ACCOUNT: WSOL_MINT, JUPITER_REFERRAL_FEE_BPS: "80" })?.feeBps,
      80,
    );
    assert.equal(
      ultraReferral({ JUPITER_ULTRA_REFERRAL_ACCOUNT: WSOL_MINT, JUPITER_REFERRAL_FEE_BPS: "10" })?.feeBps,
      50,
    );
  });

  it("ignores an account that is not a Solana address", () => {
    assert.equal(ultraReferral({ JUPITER_ULTRA_REFERRAL_ACCOUNT: "not-a-key" }), null);
    assert.equal(ultraReferral({}), null);
  });
});
