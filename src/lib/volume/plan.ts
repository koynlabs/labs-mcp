import { MAX_BUYERS } from "../config";

/** Agent-generated wallets that buy the open and later sit in the pool. */
export const MAX_VOLUME_WALLETS = 100;

export const LIQUIDATE_PERCENTS = [10, 25, 50, 100] as const;

export type LiquidatePercent = (typeof LIQUIDATE_PERCENTS)[number];

export type VolumePhase =
  | "funding"
  | "buying"
  | "holding"
  | "depositing"
  | "managing"
  | "liquidating"
  | "swept"
  | "failed";

export type VolumeMoveKind =
  | "fund"
  | "buy"
  | "deposit"
  | "withdraw"
  | "sell"
  | "sweep";

export type VolumeMove = {
  kind: VolumeMoveKind;
  wallet: string;
};

const PHASES: VolumePhase[] = [
  "funding",
  "buying",
  "holding",
  "depositing",
  "managing",
  "liquidating",
  "swept",
  "failed",
];

export function assertVolumeCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > MAX_VOLUME_WALLETS) {
    throw new Error(`wallets must be an integer from 1 to ${MAX_VOLUME_WALLETS}`);
  }
}

/** The atomic bundle holds the create plus this many buys. The rest buy after. */
export function splitLaunchBuyers<T>(
  wallets: T[],
  bundleSize: number = MAX_BUYERS,
): { bundle: T[]; followOn: T[] } {
  if (!Number.isInteger(bundleSize) || bundleSize < 1) {
    throw new Error("bundle size must be a positive integer");
  }
  return {
    bundle: wallets.slice(0, bundleSize),
    followOn: wallets.slice(bundleSize),
  };
}

/**
 * A failed launch always returns everything. A live one only accepts the four
 * published slices.
 */
export function assertLiquidatePercent(
  percent: number,
  failed: boolean,
): LiquidatePercent {
  if (failed) return 100;
  if ((LIQUIDATE_PERCENTS as readonly number[]).includes(percent)) {
    return percent as LiquidatePercent;
  }
  throw new Error("percent must be 10, 25, 50, or 100");
}

export type ReenterPlan = {
  reuse: number;
  generate: number;
};

/**
 * Re-entry reuses children that still have sealed keys, then generates new
 * ones. The session never holds more than 100.
 */
export function reenterPlan(input: {
  held: number;
  reusable: number;
  requested: number;
}): ReenterPlan {
  assertVolumeCount(input.requested);
  if (input.reusable > input.held) {
    throw new Error("reusable wallets cannot exceed wallets already held");
  }
  const generate = Math.max(0, input.requested - input.reusable);
  if (input.held + generate > MAX_VOLUME_WALLETS) {
    throw new Error(`a session cannot hold more than ${MAX_VOLUME_WALLETS} wallets`);
  }
  return { reuse: Math.min(input.requested, input.reusable), generate };
}

/** What the workflow is allowed to sign in this phase. Sells exist only while liquidating. */
export function movesFor(
  phase: VolumePhase,
  wallets: { publicKey: string }[],
): VolumeMove[] {
  if (!PHASES.includes(phase)) throw new Error(`unknown volume phase ${phase}`);
  if (phase === "funding") {
    return wallets.map((wallet) => ({ kind: "fund", wallet: wallet.publicKey }));
  }
  if (phase === "buying") {
    return wallets.map((wallet) => ({ kind: "buy", wallet: wallet.publicKey }));
  }
  if (phase === "depositing") {
    return wallets.map((wallet) => ({ kind: "deposit", wallet: wallet.publicKey }));
  }
  if (phase === "liquidating") {
    return wallets.flatMap((wallet) => [
      { kind: "withdraw" as const, wallet: wallet.publicKey },
      { kind: "sell" as const, wallet: wallet.publicKey },
      { kind: "sweep" as const, wallet: wallet.publicKey },
    ]);
  }
  return [];
}

export function sellsOnlyOnLiquidate(phase: VolumePhase, moves: VolumeMove[]): boolean {
  return moves.every((move) => move.kind !== "sell" || phase === "liquidating");
}
