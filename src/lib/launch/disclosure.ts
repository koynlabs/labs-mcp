import type { LaunchBundle } from "../types";
import { FUNDS_WARNING, type AmountLine } from "../trade/disclosure";

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
    .map((tx) => ({ label: roleLabel[tx.role], value: `${tx.sol} SOL · ${tx.signer}` }));
  if (amounts.length === 0) amounts.push({ label: "Spend", value: "network fees only" });
  return {
    caller: bundle.creator,
    host,
    action: bundle.venue === "pump" ? "Launch on pump.fun" : "Launch on StonkFun",
    amounts,
    warning: FUNDS_WARNING,
  };
}
