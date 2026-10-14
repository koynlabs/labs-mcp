import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LaunchBundle } from "../types";
import { FUNDS_WARNING } from "../trade/disclosure";
import { launchDisclosure } from "./disclosure";

const bundle: LaunchBundle = {
  id: "bundle-1",
  kind: "launch",
  venue: "pump",
  mint: "Mint",
  creator: "CreatorWallet",
  name: "Example",
  symbol: "EX",
  metadataUri: "https://example.com/meta.json",
  metadataHost: "ipfs",
  buyers: [],
  feeSol: 0,
  txs: [
    { index: 0, role: "create", signer: "CreatorWallet", tx: "aa", sol: 1 },
    { index: 1, role: "buy", signer: "BuyerWallet", tx: "bb", sol: 0.5 },
  ],
  signed: {},
  status: "awaiting_signatures",
  createdAt: 1,
};

describe("launchDisclosure", () => {
  it("shows the creator, host, launch action, and SOL amounts", () => {
    const view = launchDisclosure(bundle, "labs.levercoin.lol");
    assert.equal(view.caller, "CreatorWallet");
    assert.equal(view.host, "labs.levercoin.lol");
    assert.equal(view.action, "Launch on pump.fun");
    assert.equal(view.warning, FUNDS_WARNING);
    assert.deepEqual(
      view.amounts.map((line) => line.value),
      ["1 SOL · CreatorWallet", "0.5 SOL · BuyerWallet"],
    );
  });
});
