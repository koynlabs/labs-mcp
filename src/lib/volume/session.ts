import { randomUUID } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { decrypt, encrypt } from "../seal";
import { getVolume, put } from "../store";
import type { Venue, VolumeChild, VolumeSession } from "../types";
import { splitLaunchBuyers, assertVolumeCount, type VolumePhase } from "./plan";

const VOLUME_TTL_SECONDS = 7 * 24 * 3600;

export type VolumeRequest = {
  venue: Venue;
  main: string;
  name: string;
  symbol: string;
  imageUrl: string;
  description?: string;
  count: number;
  solPerWallet: number;
};

function sealChild(sol: number, role: VolumeChild["role"]): VolumeChild {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    sealedSecret: encrypt(bs58.encode(keypair.secretKey)),
    sol,
    role,
    lpRaw: "0",
    funded: false,
    bought: false,
    swept: false,
  };
}

export function createVolumeSession(request: VolumeRequest): VolumeSession {
  assertVolumeCount(request.count);
  if (!(request.solPerWallet > 0)) throw new Error("solPerWallet must be positive");
  const slots = Array.from({ length: request.count }, () => null);
  const { bundle, followOn } = splitLaunchBuyers(slots);
  const children = [
    ...bundle.map(() => sealChild(request.solPerWallet, "bundle")),
    ...followOn.map(() => sealChild(request.solPerWallet, "follow_on")),
  ];
  return {
    id: randomUUID(),
    kind: "volume",
    venue: request.venue,
    main: request.main,
    name: request.name,
    symbol: request.symbol,
    imageUrl: request.imageUrl,
    ...(request.description ? { description: request.description } : {}),
    count: request.count,
    solPerWallet: request.solPerWallet,
    children,
    phase: "funding",
    createdAt: Date.now(),
  };
}

export function childKeypair(child: VolumeChild): Keypair {
  return Keypair.fromSecretKey(bs58.decode(decrypt(child.sealedSecret)));
}

export async function saveVolume(session: VolumeSession): Promise<void> {
  await put(session, VOLUME_TTL_SECONDS);
}

export async function loadVolume(id: string): Promise<VolumeSession | null> {
  return getVolume(id);
}

/** Tool output. Sealed keys never leave the server. */
export function publicVolume(session: VolumeSession) {
  const bundle = session.children.filter((child) => child.role === "bundle");
  const followOn = session.children.filter((child) => child.role === "follow_on");
  return {
    sessionId: session.id,
    phase: session.phase,
    venue: session.venue,
    main: session.main,
    mint: session.mint,
    name: session.name,
    symbol: session.symbol,
    solPerWallet: session.solPerWallet,
    walletCount: session.children.length,
    bundle: bundle.map(publicChild),
    followOn: followOn.map(publicChild),
    liquidatePercent: session.liquidatePercent,
    error: session.error,
  };
}

function publicChild(child: VolumeChild) {
  return {
    publicKey: child.publicKey,
    role: child.role,
    sol: child.sol,
    lpRaw: child.lpRaw,
    funded: child.funded,
    bought: child.bought,
    swept: child.swept,
  };
}

export function setPhase(session: VolumeSession, phase: VolumePhase, error?: string): VolumeSession {
  session.phase = phase;
  session.error = error;
  return session;
}
