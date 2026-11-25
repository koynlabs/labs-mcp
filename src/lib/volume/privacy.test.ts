import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@solana/web3.js";
import { ringsSolanaRpcUrl } from "../privacy/rings";
import { transferPrivate } from "./privacy";

test("a Helius indexer method URL is used as the RPC root", () => {
  const resolved = ringsSolanaRpcUrl(
    "https://mainnet.helius-rpc.com/v1/spr/getEncryptedUtxosByTags?api-key=test",
  );
  assert.equal(resolved.network, "mainnet");
  assert.equal(resolved.url, "https://mainnet.helius-rpc.com/?api-key=test");
});

test("a missing Helius URL refuses the transfer instead of sending it publicly", async () => {
  const previousPrivacy = process.env.HELIUS_PRIVACY_URL;
  const previousRpc = process.env.SOLANA_RPC;
  delete process.env.HELIUS_PRIVACY_URL;
  process.env.SOLANA_RPC = "https://api.mainnet-beta.solana.com";
  try {
    await assert.rejects(
      transferPrivate({
        from: Keypair.generate(),
        to: Keypair.generate(),
        lamports: BigInt(1_000_000),
      }),
      /Helius mainnet or devnet/,
    );
  } finally {
    if (previousPrivacy === undefined) delete process.env.HELIUS_PRIVACY_URL;
    else process.env.HELIUS_PRIVACY_URL = previousPrivacy;
    if (previousRpc === undefined) delete process.env.SOLANA_RPC;
    else process.env.SOLANA_RPC = previousRpc;
  }
});
