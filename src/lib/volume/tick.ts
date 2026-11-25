import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { WSOL_MINT } from "../config";
import { attachSignature, createLaunch, submitLaunch } from "../launch/bundle";
import { connection, decodeTx, encodeTx } from "../solana";
import { buildSwap, submitSwap } from "../trade/swap";
import type { VolumeChild, VolumeSession } from "../types";
import { liquidationFor } from "./liquidate";
import { transferPrivate } from "./privacy";
import { childKeypair, loadVolume, saveVolume } from "./session";

export type Tick = { stop: boolean; waitSeconds: number; note: string };

/** Left on the child so rent and the Rings fee payer stay funded. */
const SWEEP_RESERVE = BigInt(10_000_000);

function agentKeypair(main: string): Keypair {
  const raw = process.env.LABS_AGENT_KEYPAIR?.trim();
  if (!raw) throw new Error("LABS_AGENT_KEYPAIR is not set. Volume has no main wallet.");
  const keypair = Keypair.fromSecretKey(bs58.decode(raw));
  if (keypair.publicKey.toBase58() !== main) {
    throw new Error("LABS_AGENT_KEYPAIR does not match this session's main wallet.");
  }
  return keypair;
}

function signOwned(unsignedBase64: string, secret: Uint8Array): string {
  const tx = decodeTx(unsignedBase64);
  if (!(tx instanceof VersionedTransaction)) {
    throw new Error("volume transactions are versioned");
  }
  tx.sign([Keypair.fromSecretKey(secret)]);
  return encodeTx(tx);
}

async function fundStep(session: VolumeSession): Promise<Tick> {
  const child = session.children.find((item) => !item.funded && !item.swept);
  if (!child) {
    session.phase = "buying";
    await saveVolume(session);
    return { stop: false, waitSeconds: 5, note: "wallets funded" };
  }
  const signature = await transferPrivate({
    from: agentKeypair(session.main),
    to: childKeypair(child),
    lamports: BigInt(Math.round(child.sol * 1_000_000_000)),
  });
  child.funded = true;
  await saveVolume(session);
  return { stop: false, waitSeconds: 2, note: `funded ${child.publicKey} ${signature}` };
}

async function buyStep(session: VolumeSession): Promise<Tick> {
  if (!session.launchId) {
    const bundle = session.children.filter((child) => child.role === "bundle" && !child.swept);
    const launch = await createLaunch({
      venue: session.venue,
      creator: session.main,
      name: session.name,
      symbol: session.symbol,
      imageUrl: session.imageUrl,
      ...(session.description ? { description: session.description } : {}),
      creatorBuySol: 0,
      buyers: bundle.map((child) => ({ publicKey: child.publicKey, sol: child.sol })),
      slippagePercent: 10,
      priorityFeeSol: 0.0001,
    });
    session.launchId = launch.id;
    session.mint = launch.mint;
    const main = agentKeypair(session.main);
    for (const pending of launch.txs) {
      const signer =
        pending.signer === session.main
          ? main
          : childKeypair(mustChild(session, pending.signer));
      await attachSignature(launch.id, pending.index, signOwned(pending.tx, signer.secretKey));
    }
    const submitted = await submitLaunch(launch.id);
    if (submitted.status === "failed") {
      throw new Error(submitted.error || "the launch bundle was rejected");
    }
    for (const child of bundle) child.bought = true;
    await saveVolume(session);
    return { stop: false, waitSeconds: 5, note: `bundle submitted ${launch.mint}` };
  }

  const follow = session.children.find((child) => child.role === "follow_on" && !child.bought && !child.swept);
  if (!follow) {
    session.phase = "holding";
    await saveVolume(session);
    return { stop: false, waitSeconds: 45, note: "buys are in. waiting for a pool" };
  }
  if (!session.mint) throw new Error("follow-on buy has no mint");
  await swapChild(follow, session.mint, WSOL_MINT, BigInt(Math.round(follow.sol * 1_000_000_000)));
  follow.bought = true;
  await saveVolume(session);
  return { stop: false, waitSeconds: 2, note: `bought with ${follow.publicKey}` };
}

async function depositStep(session: VolumeSession): Promise<Tick> {
  session.phase = "depositing";
  await saveVolume(session);
  return {
    stop: false,
    waitSeconds: 45,
    note: "holding supply until a pool exists to deposit into",
  };
}

async function liquidateStep(session: VolumeSession): Promise<Tick> {
  const percent = session.liquidatePercent ?? 100;
  const pass = session.pass ?? 0;
  const child = session.children.find((item) => !item.swept && item.settledPass !== pass);
  if (!child) {
    session.phase = "swept";
    session.children = session.children.filter((item) => item.sealedSecret);
    await saveVolume(session);
    return { stop: true, waitSeconds: 0, note: "swept to the main wallet" };
  }

  const plan = liquidationFor({
    percent,
    failed: false,
    lpRaw: BigInt(child.lpRaw || "0"),
  });
  if (child.bought && session.mint && plan.steps.includes("sell")) {
    const balance = await tokenBalance(child.publicKey, session.mint);
    const selling = (balance * BigInt(plan.percent)) / BigInt(100);
    if (selling > BigInt(0)) {
      await swapChild(child, WSOL_MINT, session.mint, selling);
    }
  }
  const publicLamports = BigInt(await connection().getBalance(new PublicKey(child.publicKey)));
  const returning = publicLamports - SWEEP_RESERVE;
  if (returning > BigInt(0)) {
    await transferPrivate({
      from: childKeypair(child),
      to: agentKeypair(session.main),
      lamports: returning,
    });
  }
  child.settledPass = pass;
  if (plan.percent === 100) {
    child.swept = true;
    child.sealedSecret = "";
  }
  const pending = session.children.some((item) => !item.swept && item.settledPass !== pass);
  if (!pending) {
    session.phase = plan.percent === 100 ? "swept" : "managing";
    if (plan.percent === 100) {
      session.children = session.children.filter((item) => item.sealedSecret);
    }
  }
  await saveVolume(session);
  return {
    stop: session.phase === "swept",
    waitSeconds: session.phase === "swept" ? 0 : 5,
    note: `liquidated ${plan.percent}% of ${child.publicKey}`,
  };
}

function mustChild(session: VolumeSession, publicKey: string): VolumeChild {
  const child = session.children.find((item) => item.publicKey === publicKey);
  if (!child) throw new Error(`no volume wallet for ${publicKey}`);
  return child;
}

async function swapChild(
  child: VolumeChild,
  outputMint: string,
  inputMint: string,
  amount: bigint,
): Promise<void> {
  const keypair = childKeypair(child);
  const order = await buildSwap({
    inputMint,
    outputMint,
    amount: amount.toString(),
    taker: child.publicKey,
  });
  const signed = signOwned(order.transaction, keypair.secretKey);
  await submitSwap({ signedTransaction: signed, requestId: order.requestId });
}

async function tokenBalance(owner: string, mint: string): Promise<bigint> {
  const accounts = await connection().getParsedTokenAccountsByOwner(new PublicKey(owner), {
    mint: new PublicKey(mint),
  });
  return accounts.value.reduce((sum, account) => {
    const amount = account.account.data.parsed?.info?.tokenAmount?.amount;
    return sum + (typeof amount === "string" ? BigInt(amount) : BigInt(0));
  }, BigInt(0));
}

/** One wake. Signs from sealed keys. No sign page. */
export async function tickVolume(sessionId: string): Promise<Tick> {
  const session = await loadVolume(sessionId);
  if (!session) return { stop: true, waitSeconds: 0, note: "session is gone" };
  if (session.phase === "swept" || session.phase === "failed") {
    return { stop: true, waitSeconds: 0, note: session.phase };
  }

  try {
    if (session.phase === "funding") return await fundStep(session);
    if (session.phase === "buying") return await buyStep(session);
    if (session.phase === "holding" || session.phase === "depositing") return await depositStep(session);
    if (session.phase === "liquidating") return await liquidateStep(session);
    return { stop: false, waitSeconds: 45, note: "liquidity is in the pool" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (session.phase === "liquidating") {
      session.phase = "failed";
      session.error = message;
      await saveVolume(session);
      return { stop: true, waitSeconds: 0, note: message };
    }
    session.phase = "liquidating";
    session.liquidatePercent = 100;
    session.pass = (session.pass ?? 0) + 1;
    session.error = message;
    await saveVolume(session);
    return { stop: false, waitSeconds: 15, note: message };
  }
}
