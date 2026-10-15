import { randomUUID } from "node:crypto";
import bs58 from "bs58";
import { PublicKey, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import { BUNDLE_TTL_SECONDS, PUMP, SITE_URL } from "../config";
import { decrypt, encrypt } from "../seal";
import { connection, decodeTx, encodeTx, verifySignedTx } from "../solana";
import { getBundle, put } from "../store";
import type { LaunchBundle } from "../types";
import { loadLookups, rewriteBlockhash } from "./blockhash";
import type { BuiltLaunch, LaunchInput } from "./input";
import { cosignMint } from "./mint-sign";
import { assertPumpSimulatable, buildPumpLaunch } from "./pump";
import { buildStonksLaunch } from "./stonks";

export function signUrl(id: string): string {
  return `${SITE_URL}/sign/${id}`;
}

/**
 * Every signer has to be a wallet, not a token account or a program account.
 * Checked up front because an SPL token account passed as a buyer is an easy
 * copy-paste mistake from a holders list, and the venues answer it with a bare
 * "Bad Request" that says nothing about which address was wrong.
 */
async function assertWallets(addresses: string[]): Promise<void> {
  const unique = [...new Set(addresses)];
  const infos = await connection().getMultipleAccountsInfo(
    unique.map((address) => new PublicKey(address)),
  );

  const bad = unique.filter((address, position) => {
    const info = infos[position];
    // A never-funded wallet has no account at all, which is fine.
    return info !== null && !info.owner.equals(SystemProgram.programId);
  });

  if (bad.length > 0) {
    throw new Error(
      `not wallet addresses: ${bad.join(", ")}. These are owned by a program — a token account or PDA, not a wallet that can sign. Use the wallet's own address.`,
    );
  }
}

export async function createLaunch(input: LaunchInput): Promise<LaunchBundle> {
  await assertWallets([
    input.creator,
    ...input.buyers.map((buyer) => buyer.publicKey),
  ]);

  const built: BuiltLaunch =
    input.venue === "pump"
      ? await buildPumpLaunch(input)
      : await buildStonksLaunch(input);

  const bundle: LaunchBundle = {
    id: randomUUID(),
    kind: "launch",
    venue: built.venue,
    mint: built.mint,
    creator: input.creator,
    name: input.name,
    symbol: input.symbol,
    metadataUri: built.metadataUri,
    metadataHost: built.metadataHost,
    buyers: built.buyers,
    feeSol: 0,
    txs: built.txs,
    signed: {},
    sealedMint: encrypt(built.mintSecret),
    blockhash: built.blockhash,
    lastValidBlockHeight: built.lastValidBlockHeight,
    status: "awaiting_signatures",
    createdAt: Date.now(),
  };

  await put(bundle, BUNDLE_TTL_SECONDS);
  return bundle;
}

/**
 * Accepts one wallet's signature. The message must match the transaction that
 * was handed out, so a signer can refuse but cannot rewrite.
 */
export async function attachSignature(
  id: string,
  index: number,
  signedBase64: string,
): Promise<LaunchBundle> {
  const bundle = await getBundle(id);
  if (!bundle) throw new Error("that launch has expired or does not exist");
  if (bundle.status !== "awaiting_signatures") {
    throw new Error(`this launch is already ${bundle.status}`);
  }

  const pending = bundle.txs.find((tx) => tx.index === index);
  if (!pending) throw new Error(`no transaction at index ${index}`);

  const check = verifySignedTx(signedBase64, pending.tx, pending.signer);
  if (!check.ok) throw new Error(signingReason(check.reason));
  if (!bundle.sealedMint) {
    throw new Error(
      "This launch was built before its mint key was kept. Build it again.",
    );
  }

  const finished = cosignMint(
    signedBase64,
    decrypt(bundle.sealedMint),
    bundle.mint,
  );
  const again = verifySignedTx(finished, pending.tx, pending.signer);
  if (!again.ok) throw new Error(signingReason(again.reason));

  bundle.signed[String(pending.index)] = finished;
  await put(bundle, BUNDLE_TTL_SECONDS);
  return bundle;
}

function signingReason(reason: string): string {
  if (reason === "the transaction was modified after signing") {
    return "That signature is for an older copy of the transaction. Sign again.";
  }
  return reason;
}

/**
 * Replaces the blockhash immediately before the wallet signs, and simulates
 * the pump transaction the wallet is about to see. Signatures already
 * collected are kept while their blockhash is still valid. Once it expires
 * they are dropped, because they no longer match a transaction that can land.
 */
export async function refreshForSigning(
  id: string,
): Promise<{ bundle: LaunchBundle; reset: boolean }> {
  const bundle = await getBundle(id);
  if (!bundle) throw new Error("that launch has expired or does not exist");
  if (bundle.status !== "awaiting_signatures") return { bundle, reset: false };
  if (!bundle.sealedMint) {
    throw new Error(
      "This launch was built before its mint key was kept. Build it again.",
    );
  }

  const signedCount = Object.keys(bundle.signed).length;
  const expired = await blockhashExpired(bundle);
  if (signedCount > 0 && !expired) return { bundle, reset: false };

  const reset = signedCount > 0 && expired;
  if (reset) bundle.signed = {};

  const { blockhash, lastValidBlockHeight } =
    await connection().getLatestBlockhash("confirmed");
  const txs = [];
  for (const pending of [...bundle.txs].sort((a, b) => a.index - b.index)) {
    const current = decodeTx(pending.tx);
    if (!(current instanceof VersionedTransaction)) {
      throw new Error("launch transactions are versioned");
    }
    const tables = await loadLookups(current);
    const next = rewriteBlockhash(current, blockhash, tables);
    if (bundle.venue === "pump") {
      await assertPumpSimulatable(next, pending.role, pending.role === "buy");
    }
    txs.push({ ...pending, tx: encodeTx(next) });
  }

  bundle.txs = txs;
  bundle.blockhash = blockhash;
  bundle.lastValidBlockHeight = lastValidBlockHeight;
  bundle.error = reset
    ? "The blockhash expired before every wallet signed. Sign again."
    : undefined;
  await put(bundle, BUNDLE_TTL_SECONDS);
  return { bundle, reset };
}

async function blockhashExpired(bundle: LaunchBundle): Promise<boolean> {
  if (!bundle.lastValidBlockHeight) return true;
  const height = await connection().getBlockHeight("confirmed");
  return height > bundle.lastValidBlockHeight;
}

/** What the sign page is allowed to see. The sealed mint key stays on the server. */
export function bundleView(bundle: LaunchBundle) {
  return {
    bundleId: bundle.id,
    status: bundle.status,
    venue: bundle.venue,
    mint: bundle.mint,
    name: bundle.name,
    symbol: bundle.symbol,
    feeSol: bundle.feeSol,
    jitoBundleId: bundle.jitoBundleId,
    error: bundle.error,
    lastValidBlockHeight: bundle.lastValidBlockHeight,
    txs: bundle.txs.map((tx) => ({
      index: tx.index,
      role: tx.role,
      signer: tx.signer,
      sol: tx.sol,
      tx: tx.tx,
      signed: Boolean(bundle.signed[String(tx.index)]),
    })),
  };
}

export function outstanding(bundle: LaunchBundle) {
  return bundle.txs.filter((tx) => !bundle.signed[String(tx.index)]);
}

/**
 * Submits the launch as one atomic Jito bundle. Every signature is re-verified
 * here, so the guarantee does not rest on whatever the sign page claimed earlier.
 */
export async function submitLaunch(id: string): Promise<LaunchBundle> {
  const bundle = await getBundle(id);
  if (!bundle) throw new Error("that launch has expired or does not exist");
  if (bundle.status === "submitted") return bundle;
  if (outstanding(bundle).length > 0) {
    throw new Error("every wallet has to sign before the launch can be sent");
  }
  if (await blockhashExpired(bundle)) {
    bundle.signed = {};
    bundle.status = "awaiting_signatures";
    bundle.error =
      "The blockhash expired before the bundle was sent. Sign again.";
    await put(bundle, BUNDLE_TTL_SECONDS);
    return bundle;
  }

  const ordered = [...bundle.txs].sort((a, b) => a.index - b.index);
  const encoded = ordered.map((pending) => {
    const signed = bundle.signed[String(pending.index)];
    const check = verifySignedTx(signed, pending.tx, pending.signer);
    if (!check.ok) throw new Error(check.reason);
    const tx = decodeTx(signed);
    const bytes =
      "serialize" in tx
        ? tx.serialize({ requireAllSignatures: false, verifySignatures: false })
        : tx;
    return bs58.encode(bytes as Uint8Array);
  });

  bundle.status = "submitting";
  await put(bundle, BUNDLE_TTL_SECONDS);

  const response = await fetch(PUMP.jitoBundle, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendBundle",
      params: [encoded],
    }),
  });

  const body = (await response.json()) as {
    result?: string;
    error?: { message?: string };
  };

  if (!response.ok || body.error || !body.result) {
    bundle.status = "failed";
    bundle.error = body.error?.message ?? `Jito refused the bundle (${response.status})`;
    await put(bundle, BUNDLE_TTL_SECONDS);
    return bundle;
  }

  bundle.status = "submitted";
  bundle.jitoBundleId = body.result;
  bundle.signatures = ordered.map((pending) => {
    const tx = decodeTx(bundle.signed[String(pending.index)]);
    const signature =
      "signatures" in tx && Array.isArray(tx.signatures)
        ? (tx.signatures[0] as Uint8Array | { signature: Uint8Array | null })
        : null;
    if (!signature) return "";
    const bytes =
      signature instanceof Uint8Array ? signature : signature.signature;
    return bytes ? bs58.encode(bytes) : "";
  });

  await put(bundle, BUNDLE_TTL_SECONDS);
  return bundle;
}
