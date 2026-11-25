import { assertLiquidatePercent, type LiquidatePercent } from "./plan";
import { portionRaw } from "./liquidity";

export type LiquidateStep = "withdraw" | "sell" | "sweep";

/** The only place a volume wallet is allowed to sell. Proceeds go to the main wallet. */
export function liquidateSteps(percent: LiquidatePercent): LiquidateStep[] {
  if (percent <= 0) return [];
  return ["withdraw", "sell", "sweep"];
}

export function liquidateShare(lpRaw: bigint, percent: LiquidatePercent): bigint {
  return portionRaw(lpRaw, percent);
}

export function liquidationFor(input: {
  percent: number;
  failed: boolean;
  lpRaw: bigint;
}): { percent: LiquidatePercent; withdrawRaw: bigint; steps: LiquidateStep[] } {
  const percent = assertLiquidatePercent(input.percent, input.failed);
  return {
    percent,
    withdrawRaw: liquidateShare(input.lpRaw, percent),
    steps: liquidateSteps(percent),
  };
}
