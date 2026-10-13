import { randomUUID } from "node:crypto";
import { BUNDLE_TTL_SECONDS, SITE_URL } from "../config";
import { getTrade, put } from "../store";
import type { TradeDraft, TradeIntent } from "../types";

export function tradeUrl(id: string): string {
  return `${SITE_URL}/sign/trade/${id}`;
}

export function tradeDeadline(intent: TradeIntent): number {
  return intent.createdAt + BUNDLE_TTL_SECONDS * 1000;
}

export function tradeExpired(intent: TradeIntent, now = Date.now()): boolean {
  return now >= tradeDeadline(intent);
}

export async function saveTrade(intent: TradeDraft): Promise<TradeIntent> {
  const stored: TradeIntent = {
    ...intent,
    id: randomUUID(),
    kind: "trade",
    createdAt: Date.now(),
  };
  await put(stored, BUNDLE_TTL_SECONDS);
  return stored;
}

/** Writes the trade back with only the time it has left, so a quote cannot outlive it. */
export async function updateTrade(intent: TradeIntent): Promise<void> {
  const remainingMs = tradeDeadline(intent) - Date.now();
  if (remainingMs <= 0) throw new Error("This trade has expired.");
  await put(intent, Math.ceil(remainingMs / 1000));
}

export function loadTrade(id: string): Promise<TradeIntent | null> {
  return getTrade(id);
}
