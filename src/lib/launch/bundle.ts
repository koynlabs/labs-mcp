import { randomUUID } from "node:crypto";
import bs58 from "bs58";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { BUNDLE_TTL_SECONDS, FEE_SOL, PUMP, SITE_URL, treasury } from "../config";
import { assertPaysTreasury } from "../fee";
import { feeWaiverFor, stillHolds } from "../lever";
import { connection, decodeTx, verifySignedTx } from "../solana";
import { getBundle, put } from "../store";
import type { LaunchBundle } from "../types";
import type { BuiltLaunch, LaunchInput } from "./input";
import { buildPumpLaunch } from "./pump";
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

  // Holding $LEVERCOIN waives the fee rather than paying it in the token, so
  // the bundle simply carries no fee transaction.
  const feeWaiver = await feeWaiverFor(input.creator);
  const built: BuiltLaunch =
    input.venue === "pump"
      ? await buildPumpLaunch({ ...input, feeWaived: Boolean(feeWaiver) })
      : await buildStonksLaunch({ ...input, feeWaived: Boolean(feeWaiver) });

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
    feeSol: feeWaiver ? 0 : FEE_SOL,
    feeWaiver: feeWaiver ?? undefined,
    treasury: treasury().toBase58(),
    txs: built.txs,
    signed: {},
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
  if (!check.ok) throw new Error(check.reason);

  bundle.signed[String(index)] = signedBase64;
  await put(bundle, BUNDLE_TTL_SECONDS);
  return bundle;
}

export function outstanding(bundle: LaunchBundle) {
  return bundle.txs.filter((tx) => !bundle.signed[String(tx.index)]);
}

/**
 * Submits the launch as one atomic Jito bundle. Every signature is re-verified
 * and the fee transaction is re-read here, so the guarantee does not rest on
 * whatever the sign page claimed earlier.
 */
export async function submitLaunch(id: string): Promise<LaunchBundle> {
  const bundle = await getBundle(id);
  if (!bundle) throw new Error("that launch has expired or does not exist");
  if (bundle.status === "submitted") return bundle;
  if (outstanding(bundle).length > 0) {
    throw new Error("every wallet has to sign before the launch can be sent");
  }

  const fee = bundle.txs.find((tx) => tx.role === "fee");
  if (bundle.feeWaiver) {
    // The hold is re-read here rather than trusted from build time, so a wallet
    // cannot qualify for the waiver and then sell before the launch lands.
    await stillHolds(bundle.feeWaiver);
  } else {
    if (!fee) throw new Error("this launch carries no fee transaction");
    assertPaysTreasury(fee);
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
