import { WSOL_MINT } from "../config";
import type { LaunchBundle } from "../types";
import { FUNDS_WARNING, type AmountLine } from "../trade/disclosure";

/** SOL for a wSOL pair. Otherwise the quote mint, which is what the buy spends. */
export function spendUnit(quoteMint?: string): string {
  if (!quoteMint || quoteMint === WSOL_MINT) return "SOL";
  return quoteMint;
}

export type LaunchView = {
  caller: string;
  host: string;
  action: string;
  amounts: AmountLine[];
  warning: string;
};

const roleLabel = { fee: "Fee", create: "Create", buy: "Buy" } as const;

/** Caller, host, action, and the SOL each signature spends. */
export function launchDisclosure(bundle: LaunchBundle, host: string): LaunchView {
  const amounts: AmountLine[] = bundle.txs
    .filter((tx) => tx.sol !== undefined)
    .map((tx) => ({
      label: roleLabel[tx.role],
      value: `${tx.sol} ${spendUnit(bundle.quoteMint)} · ${tx.signer}`,
    }));
  if (amounts.length === 0) amounts.push({ label: "Spend", value: "network fees only" });
  return {
    caller: bundle.creator,
    host,
    action: bundle.venue === "pump" ? "Launch on pump.fun" : "Launch on StonkFun",
    amounts,
    warning: FUNDS_WARNING,
  };
}
