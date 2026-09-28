import { JUPITER_TRIGGER } from "../config";
import type { TradeIntent } from "../types";
import { JupiterError, asRecord, errorMessage, jupiter, jupiterHeaders, str, upstreamStatus } from "./http";

type OrderIntent = Extract<TradeIntent, { action: "order" }>;

export async function triggerChallenge(wallet: string): Promise<string> {
  const body = asRecord(
    await jupiter(`${JUPITER_TRIGGER}/auth/challenge`, {
      method: "POST",
      body: { walletPubkey: wallet, type: "message" },
    }),
  );
  const message = str(body?.challenge);
  if (!message) throw new JupiterError("Jupiter did not return a challenge", 502);
  return message;
}

export async function triggerVerify(wallet: string, signature: string): Promise<string> {
  const body = asRecord(
    await jupiter(`${JUPITER_TRIGGER}/auth/verify`, {
      method: "POST",
      body: { type: "message", walletPubkey: wallet, signature },
    }),
  );
  const token = str(body?.token);
  if (!token) throw new JupiterError("Jupiter did not return a session", 502);
  return token;
}

async function ensureVault(token: string): Promise<void> {
  const existing = await fetch(`${JUPITER_TRIGGER}/vault`, {
    headers: jupiterHeaders(false, token),
    cache: "no-store",
  });
  if (existing.ok) return;
  const registered = await fetch(`${JUPITER_TRIGGER}/vault/register`, {
    method: "POST",
    headers: jupiterHeaders(false, token),
    cache: "no-store",
  });
  if (registered.ok) return;
  const body = await registered.json().catch(() => null);
  throw new JupiterError(errorMessage(body, "Could not open a Jupiter vault"), upstreamStatus(registered.status));
}

export async function craftTriggerDeposit(
  token: string,
  intent: OrderIntent,
): Promise<{ transaction: string; requestId: string }> {
  await ensureVault(token);
  const payload: Record<string, string> = {
    inputMint: intent.inputMint,
    outputMint: intent.outputMint,
    userAddress: intent.wallet,
    amount: intent.amount,
    orderType: intent.mode === "dca" ? "dca" : "price",
  };
  if (intent.mode === "bracket") payload.orderSubType = "oco";
  else if (intent.mode !== "dca") payload.orderSubType = "single";
  const body = asRecord(
    await jupiter(`${JUPITER_TRIGGER}/deposit/craft`, { method: "POST", token, body: payload }),
  );
  const transaction = str(body?.transaction);
  const requestId = str(body?.requestId);
  if (!transaction || !requestId) throw new JupiterError("Jupiter could not build the deposit", 502);
  return { transaction, requestId };
}

export async function createTriggerOrder(
  token: string,
  intent: OrderIntent,
  deposit: { requestId: string; signedTransaction: string },
): Promise<{ id: string; signature: string | null }> {
  const shared = {
    userPubkey: intent.wallet,
    inputMint: intent.inputMint,
    outputMint: intent.outputMint,
    inputAmount: intent.amount,
    depositRequestId: deposit.requestId,
    depositSignedTx: deposit.signedTransaction,
  };
  const body =
    intent.mode === "dca"
      ? {
          ...shared,
          orderCount: intent.orderCount,
          intervalSeconds: intent.intervalSeconds,
          orderType: "time_based",
        }
      : intent.mode === "bracket"
        ? {
            ...shared,
            orderType: "oco",
            triggerMint: intent.tokenMint,
            expiresAt: intent.expiresAt,
            tpPriceUsd: intent.tpPriceUsd,
            slPriceUsd: intent.slPriceUsd,
          }
        : intent.trailingBps
          ? {
              ...shared,
              orderType: "single",
              triggerMint: intent.tokenMint,
              triggerCondition: "below",
              trailingBps: intent.trailingBps,
              expiresAt: intent.expiresAt,
            }
          : {
              ...shared,
              orderType: "single",
              triggerMint: intent.tokenMint,
              triggerCondition: intent.triggerCondition,
              triggerPriceUsd: intent.triggerPriceUsd,
              expiresAt: intent.expiresAt,
            };
  const path = intent.mode === "dca" ? "/orders/dca" : "/orders/price";
  const created = asRecord(await jupiter(`${JUPITER_TRIGGER}${path}`, { method: "POST", token, body }));
  const id = str(created?.id);
  if (!id) throw new JupiterError(errorMessage(created, "Jupiter did not create the order"), 502);
  return { id, signature: str(created?.txSignature) };
}
