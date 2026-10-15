import { NextResponse } from "next/server";
import { siteHost } from "@/lib/config";
import { decrypt, encrypt } from "@/lib/seal";
import { allow, clientAddress } from "@/lib/rate-limit";
import { tradeDisclosure } from "@/lib/trade/disclosure";
import { loadTrade, tradeExpired, updateTrade } from "@/lib/trade/intent";
import { JupiterError } from "@/lib/trade/http";
import { buildPerp, submitPerp, type PerpAction } from "@/lib/trade/perps";
import { JUPITER_SESSION_TTL_MS, lockedSubmit, storeQuote } from "@/lib/trade/quote";
import { buildSwap, submitSwap } from "@/lib/trade/swap";
import { craftTriggerDeposit, createTriggerOrder, triggerChallenge, triggerVerify } from "@/lib/trade/trigger";
import type { TradeIntent } from "@/lib/types";

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function fail(error: unknown) {
  if (error instanceof JupiterError) return json({ error: error.message }, error.status);
  const message = error instanceof Error ? error.message : "Trade failed";
  return json({ error: message }, 400);
}

function perpAction(intent: TradeIntent): PerpAction {
  if (intent.action === "perp-open") {
    return intent.mode === "limit" ? "create-limit-order" : "increase-position";
  }
  if (intent.action === "perp-close") return "decrease-position";
  if (intent.action === "perp-exit" && intent.op === "cancel-limit") return "cancel-limit-order";
  if (intent.action === "perp-exit" && intent.op === "cancel-tpsl") return "cancel-tpsl";
  return "create-tpsl";
}

function sessionToken(intent: TradeIntent): string {
  if (!intent.sealedSession || intent.sessionExpiresAt == null) {
    throw new Error("Sign the Jupiter challenge before depositing.");
  }
  if (intent.sessionExpiresAt <= Date.now()) {
    throw new Error("The Jupiter session expired. Sign the challenge again.");
  }
  try {
    return decrypt(intent.sealedSession);
  } catch {
    throw new Error("The Jupiter session on this trade is unreadable.");
  }
}

async function limited(request: Request, id: string): Promise<boolean> {
  const ip = clientAddress(request);
  const [byIp, byTrade] = await Promise.all([
    allow(`trade-api:${ip}`, 30, 60),
    allow(`trade-api:id:${id}`, 20, 60),
  ]);
  return byIp && byTrade;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!(await limited(request, id))) return json({ error: "Too many requests. Wait a minute." }, 429);
  const intent = await loadTrade(id);
  if (!intent || tradeExpired(intent)) return json({ error: "This trade has expired." }, 404);
  return json(tradeDisclosure(intent, siteHost()));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!(await limited(request, id))) return json({ error: "Too many requests. Wait a minute." }, 429);
  const intent = await loadTrade(id);
  if (!intent || tradeExpired(intent)) return json({ error: "This trade has expired." }, 404);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const step = body?.step;
  try {
    if (typeof body?.token === "string") {
      return json({ error: "The Jupiter session stays on the server." }, 400);
    }

    if (step === "build") {
      if (intent.quote && intent.quote.expiresAt > Date.now()) {
        return json({
          transaction: intent.quote.transaction,
          requestId: intent.quote.requestId,
          expiresAt: intent.quote.expiresAt,
        });
      }
      if (intent.action === "swap") {
        const built = await buildSwap({
          inputMint: intent.inputMint,
          outputMint: intent.outputMint,
          amount: intent.amount,
          taker: intent.wallet,
        });
        intent.quote = storeQuote(built.transaction, built.requestId);
        await updateTrade(intent);
        return json({ ...built, expiresAt: intent.quote.expiresAt });
      }
      if (intent.action === "perp-open" || intent.action === "perp-close" || intent.action === "perp-exit") {
        const built = await buildPerp(intent);
        intent.quote = storeQuote(built.transaction, "");
        await updateTrade(intent);
        return json({ ...built, expiresAt: intent.quote.expiresAt });
      }
      return json({ error: "This trade is signed as an order." }, 400);
    }

    if (step === "submit") {
      const locked = await lockedSubmit({
        quote: intent.quote,
        signedTransaction: body?.signedTransaction,
        requestId: body?.requestId,
        wallet: intent.wallet,
      });
      if (intent.action === "swap") {
        const done = await submitSwap(locked);
        intent.quote = undefined;
        await updateTrade(intent);
        return json({ signature: done.signature });
      }
      if (intent.action === "perp-open" || intent.action === "perp-close" || intent.action === "perp-exit") {
        const done = await submitPerp({
          action: perpAction(intent),
          signedTransaction: locked.signedTransaction,
        });
        intent.quote = undefined;
        await updateTrade(intent);
        return json({ signature: done.txid });
      }
      return json({ error: "This trade is signed as an order." }, 400);
    }

    if (intent.action !== "order") {
      return json({ error: "This trade is not a trigger order." }, 400);
    }
    if (step === "challenge") {
      return json({ message: await triggerChallenge(intent.wallet) });
    }
    if (step === "verify") {
      if (typeof body?.signature !== "string" || body.signature.length < 64 || body.signature.length > 200) {
        return json({ error: "Missing signature." }, 400);
      }
      const token = await triggerVerify(intent.wallet, body.signature);
      intent.sealedSession = encrypt(token);
      intent.sessionExpiresAt = Date.now() + JUPITER_SESSION_TTL_MS;
      await updateTrade(intent);
      return json({ ok: true });
    }
    if (step === "deposit") {
      const token = sessionToken(intent);
      const deposit = await craftTriggerDeposit(token, intent);
      intent.quote = storeQuote(deposit.transaction, deposit.requestId);
      await updateTrade(intent);
      return json({ ...deposit, expiresAt: intent.quote.expiresAt });
    }
    if (step === "create") {
      const token = sessionToken(intent);
      const locked = await lockedSubmit({
        quote: intent.quote,
        signedTransaction: body?.signedTransaction,
        requestId: body?.requestId,
        wallet: intent.wallet,
      });
      const created = await createTriggerOrder(token, intent, locked);
      intent.quote = undefined;
      intent.sealedSession = undefined;
      intent.sessionExpiresAt = undefined;
      await updateTrade(intent);
      return json(created);
    }
    return json({ error: "Unknown step." }, 400);
  } catch (error) {
    return fail(error);
  }
}
