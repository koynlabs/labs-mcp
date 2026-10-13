import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decrypt, encrypt } from "./seal";

describe("seal", () => {
  it("round-trips a Jupiter session and hides the bearer", () => {
    const previous = process.env.LABS_SESSION_SECRET;
    process.env.LABS_SESSION_SECRET = "a".repeat(32);
    try {
      const token = "jupiter-session-token-not-for-the-browser";
      const sealed = encrypt(token);
      assert.equal(sealed.includes(token), false);
      assert.equal(decrypt(sealed), token);
      process.env.LABS_SESSION_SECRET = "b".repeat(32);
      assert.throws(() => decrypt(sealed));
    } finally {
      if (previous === undefined) delete process.env.LABS_SESSION_SECRET;
      else process.env.LABS_SESSION_SECRET = previous;
    }
  });

  it("refuses to seal without a long secret", () => {
    const previous = process.env.LABS_SESSION_SECRET;
    delete process.env.LABS_SESSION_SECRET;
    try {
      assert.throws(() => encrypt("token"), /LABS_SESSION_SECRET/);
    } finally {
      if (previous === undefined) delete process.env.LABS_SESSION_SECRET;
      else process.env.LABS_SESSION_SECRET = previous;
    }
  });
});
