import { BUNDLE_TTL_SECONDS, WSOL_MINT } from "../config";
import type { TradeIntent } from "../types";

export const FUNDS_WARNING =
  "This moves funds from the caller wallet. Confirm the host, the action, and the amounts before you sign. labs cannot undo it.";

export type AmountLine = { label: string; value: string };

export type TradeView = {
  id: string;
  wallet: string;
  caller: string;
  host: string;
  action: string;
  summary: string;
  amounts: AmountLine[];
  warning: string;
  expiresAt: number;
};

function formatRaw(raw: string, decimals: number): string {
  if (!/^\d+$/.test(raw)) return raw;
  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const frac = padded.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function mintAmount(raw: string, mint: string): string {
  if (mint === WSOL_MINT) return `${formatRaw(raw, 9)} SOL`;
  return `${raw} base units of ${mint}`;
}

function usd(raw: string): string {
  return `$${formatRaw(raw, 6)}`;
}

function actionOf(intent: TradeIntent): string {
  if (intent.action === "swap") return "Market swap";
  if (intent.action === "order") {
    if (intent.mode === "limit") return "Limit order";
    if (intent.mode === "stop") return "Stop order";
    if (intent.mode === "bracket") return "Take profit and stop";
    return "DCA";
  }
  if (intent.action === "perp-open") return "Open a perp";
  if (intent.action === "perp-close") return "Close a perp";
  if (intent.op === "set") return "Set perp exits";
  if (intent.op === "cancel-limit") return "Cancel a perp limit";
  return "Cancel a perp exit";
}

function amountsOf(intent: TradeIntent): AmountLine[] {
  if (intent.action === "swap") {
    return [
      { label: "Spend", value: mintAmount(intent.amount, intent.inputMint) },
      { label: "Receive", value: intent.outputMint === WSOL_MINT ? "SOL" : intent.outputMint },
    ];
  }
  if (intent.action === "order") {
    const lines: AmountLine[] = [
      { label: "Deposit", value: mintAmount(intent.amount, intent.inputMint) },
      { label: "Receive", value: intent.outputMint === WSOL_MINT ? "SOL" : intent.outputMint },
    ];
    if (intent.triggerPriceUsd != null) lines.push({ label: "Trigger", value: `$${intent.triggerPriceUsd}` });
    if (intent.trailingBps != null) lines.push({ label: "Trail", value: `${intent.trailingBps / 100}%` });
    if (intent.tpPriceUsd != null) lines.push({ label: "Take profit", value: `$${intent.tpPriceUsd}` });
    if (intent.slPriceUsd != null) lines.push({ label: "Stop", value: `$${intent.slPriceUsd}` });
    if (intent.orderCount != null && intent.intervalSeconds != null) {
      lines.push({ label: "Rounds", value: `${intent.orderCount} every ${intent.intervalSeconds}s` });
    }
    return lines;
  }
  if (intent.action === "perp-open") {
    const lines: AmountLine[] = [
      { label: "Market", value: `${intent.side} ${intent.asset}` },
      { label: "Margin", value: `${formatRaw(intent.usdcRaw, 6)} USDC` },
      { label: "Leverage", value: `${intent.leverage}x` },
      { label: "Mode", value: intent.mode },
    ];
    if (intent.triggerPrice) lines.push({ label: "Trigger", value: usd(intent.triggerPrice) });
    if (intent.tpPrice) lines.push({ label: "Take profit", value: usd(intent.tpPrice) });
    if (intent.slPrice) lines.push({ label: "Stop", value: usd(intent.slPrice) });
    return lines;
  }
  if (intent.action === "perp-close") {
    return [{ label: "Position", value: intent.positionPubkey }];
  }
  const lines: AmountLine[] = [{ label: "Operation", value: intent.op }];
  if (intent.positionPubkey) lines.push({ label: "Position", value: intent.positionPubkey });
  if (intent.requestPubkey) lines.push({ label: "Request", value: intent.requestPubkey });
  if (intent.tpPrice) lines.push({ label: "Take profit", value: usd(intent.tpPrice) });
  if (intent.slPrice) lines.push({ label: "Stop", value: usd(intent.slPrice) });
  return lines;
}

/** What the sign page is allowed to show. The sealed Jupiter session is not part of it. */
export function tradeDisclosure(intent: TradeIntent, host: string): TradeView {
  return {
    id: intent.id,
    wallet: intent.wallet,
    caller: intent.wallet,
    host,
    action: actionOf(intent),
    summary: intent.summary,
    amounts: amountsOf(intent),
    warning: FUNDS_WARNING,
    expiresAt: intent.createdAt + BUNDLE_TTL_SECONDS * 1000,
  };
}
