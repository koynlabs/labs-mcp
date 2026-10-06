import { randomUUID } from "node:crypto";
import { BUNDLE_TTL_SECONDS, SITE_URL } from "../config";
import { getTrade, put } from "../store";
import type { TradeDraft, TradeIntent } from "../types";

export function tradeUrl(id: string): string {
  return `${SITE_URL}/sign/trade/${id}`;
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

export function loadTrade(id: string): Promise<TradeIntent | null> {
  return getTrade(id);
}
