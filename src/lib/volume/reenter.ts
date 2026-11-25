import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { encrypt } from "../seal";
import type { VolumeSession } from "../types";
import { reenterPlan } from "./plan";

/** Funds `requested` wallets again and sends the session back to funding. No sells. */
export function addLiquidityWallets(session: VolumeSession, requested: number): void {
  const active = session.children.filter((child) => !child.swept && child.sealedSecret);
  const plan = reenterPlan({
    held: active.length,
    reusable: active.length,
    requested,
  });

  for (const child of active.slice(0, plan.reuse)) {
    child.funded = false;
    child.bought = false;
    child.sol = session.solPerWallet;
  }

  for (let index = 0; index < plan.generate; index += 1) {
    const keypair = Keypair.generate();
    session.children.push({
      publicKey: keypair.publicKey.toBase58(),
      sealedSecret: encrypt(bs58.encode(keypair.secretKey)),
      sol: session.solPerWallet,
      role: "follow_on",
      lpRaw: "0",
      funded: false,
      bought: false,
      swept: false,
    });
  }

  session.pass = (session.pass ?? 0) + 1;
  session.phase = "funding";
  session.count = session.children.filter((child) => !child.swept && child.sealedSecret).length;
}
