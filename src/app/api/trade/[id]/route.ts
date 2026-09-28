import { NextResponse } from "next/server";
import { loadTrade } from "@/lib/trade/intent";
import { JupiterError } from "@/lib/trade/http";
import { buildPerp, submitPerp, type PerpAction } from "@/lib/trade/perps";
import { buildSwap, submitSwap } from "@/lib/trade/swap";
import { craftTriggerDeposit, createTriggerOrder, triggerChallenge, triggerVerify } from "@/lib/trade/trigger";
import type { TradeIntent } from "@/lib/types";

function fail(error: unknown) {
  if (error instanceof JupiterError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Trade failed";
  return NextResponse.json({ error: message }, { status: 400 });
}

function isBase64(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length < 8000 && /^[A-Za-z0-9+/=]+$/.test(value);
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

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const intent = await loadTrade(id);
  if (!intent) return NextResponse.json({ error: "This trade has expired." }, { status: 404 });
  return NextResponse.json(intent);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const intent = await loadTrade(id);
  if (!intent) return NextResponse.json({ error: "This trade has expired." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const step = body?.step;
  try {
    if (step === "build") {
      if (intent.action === "swap") {
        const built = await buildSwap({
          inputMint: intent.inputMint,
          outputMint: intent.outputMint,
          amount: intent.amount,
          taker: intent.wallet,
        });
        return NextResponse.json(built);
      }
      if (intent.action === "perp-open" || intent.action === "perp-close" || intent.action === "perp-exit") {
        return NextResponse.json(await buildPerp(intent));
      }
      return NextResponse.json({ error: "This trade is signed as an order." }, { status: 400 });
    }

    if (step === "submit") {
      if (!isBase64(body?.signedTransaction)) {
        return NextResponse.json({ error: "Missing signed transaction." }, { status: 400 });
      }
      if (intent.action === "swap") {
        if (typeof body?.requestId !== "string" || !body.requestId) {
          return NextResponse.json({ error: "Missing swap request." }, { status: 400 });
        }
        const done = await submitSwap({
          signedTransaction: body.signedTransaction,
          requestId: body.requestId,
        });
        return NextResponse.json({ signature: done.signature });
      }
      if (intent.action === "perp-open" || intent.action === "perp-close" || intent.action === "perp-exit") {
        const done = await submitPerp({
          action: perpAction(intent),
          signedTransaction: body.signedTransaction,
        });
        return NextResponse.json({ signature: done.txid });
      }
      return NextResponse.json({ error: "This trade is signed as an order." }, { status: 400 });
    }

    if (intent.action !== "order") {
      return NextResponse.json({ error: "This trade is not a trigger order." }, { status: 400 });
    }
    if (step === "challenge") {
      return NextResponse.json({ message: await triggerChallenge(intent.wallet) });
    }
    if (step === "verify") {
      if (typeof body?.signature !== "string" || body.signature.length < 64 || body.signature.length > 200) {
        return NextResponse.json({ error: "Missing signature." }, { status: 400 });
      }
      return NextResponse.json({ token: await triggerVerify(intent.wallet, body.signature) });
    }
    const token = body?.token;
    if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
      return NextResponse.json({ error: "Missing Jupiter session." }, { status: 400 });
    }
    if (step === "deposit") {
      return NextResponse.json(await craftTriggerDeposit(token, intent));
    }
    if (step === "create") {
      if (!isBase64(body?.signedTransaction) || typeof body?.requestId !== "string") {
        return NextResponse.json({ error: "Missing signed deposit." }, { status: 400 });
      }
      const created = await createTriggerOrder(token, intent, {
        requestId: body.requestId,
        signedTransaction: body.signedTransaction,
      });
      return NextResponse.json(created);
    }
    return NextResponse.json({ error: "Unknown step." }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}
